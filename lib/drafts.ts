import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { send } from "@vercel/queue";
import { getPool, ready } from "@/lib/db";
import { geminiLetter, geminiResumeDocument, geminiTailored } from "@/lib/letter";
import { logProcess } from "@/lib/log";
import { keepContacts, keepResumeSkills, parseResumeDocument, type ResumeDocument } from "@/lib/resume-pdf";
import type { Profile, ScoredJob } from "@/lib/types";

export type DraftKind = "letter" | "resume" | "document";

type DraftJob = {
  id?: string;
  title: string;
  company: string;
  location?: string;
  description?: string;
  url?: string;
  applyUrl?: string;
  salary?: string;
  publishedAt?: string;
};

type DraftPayload = {
  profile: Pick<Profile, "name" | "roles" | "location" | "resume">;
  job: DraftJob;
  skills?: string[];
  fileName?: string;
  pdfBase64?: string;
};

type DraftResult = {
  text?: string;
  model?: string;
  document?: ResumeDocument;
};

type DraftRow = {
  id: string;
  pass_id: string;
  kind: DraftKind;
  status: string;
  payload: DraftPayload;
  result: DraftResult | null;
  error: string;
};

const KINDS = new Set<DraftKind>(["letter", "resume", "document"]);

function scoredFrom(job: DraftJob): ScoredJob {
  return {
    job: {
      id: job.id || "draft",
      title: job.title,
      company: job.company,
      location: job.location || "",
      remote: true,
      salary: job.salary || "",
      description: job.description || "",
      tags: [],
      url: job.url || "",
      applyUrl: job.applyUrl || job.url || "",
      source: "Sample",
      sourceHome: "",
      publishedAt: job.publishedAt || "",
    },
    score: 0,
    matched: [],
    missing: [],
    reasons: [],
  };
}

function profileFrom(payload: DraftPayload): Profile {
  return {
    name: payload.profile.name || "",
    roles: payload.profile.roles || "",
    location: payload.profile.location || "",
    remoteOnly: true,
    resume: payload.profile.resume,
    geminiKey: "",
  };
}

export async function enqueueDraft(input: {
  passId: string;
  kind: DraftKind;
  payload: DraftPayload;
}): Promise<{ id: string; status: string }> {
  if (!KINDS.has(input.kind)) throw new Error("That draft kind is not supported.");
  await ready();
  const pool = getPool();
  const jobId = input.payload.job.id || "";
  const existing = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM drafts
     WHERE pass_id = $1 AND kind = $2 AND status IN ('queued', 'running')
       AND payload->'job'->>'id' = $3
     ORDER BY created_at
     LIMIT 1`,
    [input.passId, input.kind, jobId],
  );
  if (existing.rows[0]) return existing.rows[0];
  const waiting = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM drafts WHERE pass_id = $1 AND status IN ('queued', 'running')`,
    [input.passId],
  );
  if (Number(waiting.rows[0]?.count || 0) >= 5) {
    throw new Error("Five drafts are already in line. Wait for one to finish.");
  }
  const id = randomUUID();
  await pool.query(
    `INSERT INTO drafts (id, pass_id, kind, status, payload, error, created_at)
     VALUES ($1, $2, $3, 'queued', $4::jsonb, '', now())`,
    [id, input.passId, input.kind, JSON.stringify(input.payload)],
  );
  logProcess("draft", { step: "enqueue", result: "ok", kind: input.kind });
  return { id, status: "queued" };
}

export async function readDraft(passId: string, id: string): Promise<DraftRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await ready();
  const result = await getPool().query<DraftRow>(
    `SELECT id, pass_id, kind, status, payload, result, error FROM drafts WHERE id = $1 AND pass_id = $2`,
    [id, passId],
  );
  return result.rows[0] ?? null;
}

async function runDraft(kind: DraftKind, payload: DraftPayload): Promise<DraftResult> {
  const key = process.env.GEMINI_API_KEY || "";
  const profile = profileFrom(payload);
  const scored = scoredFrom(payload.job);
  const pdf = payload.pdfBase64 ? { text: payload.profile.resume, fileName: payload.fileName, pdfBase64: payload.pdfBase64 } : { text: payload.profile.resume, fileName: payload.fileName };
  if (kind === "document") {
    scored.matched = (payload.skills ?? []).filter((skill) => typeof skill === "string").slice(0, 12);
    const raw = await geminiResumeDocument(key, profile, scored, pdf);
    const parsed = parseResumeDocument(raw);
    if (!parsed) throw new Error("Gemini did not return a resume document.");
    const document = keepResumeSkills(
      keepContacts(
        { ...parsed, name: parsed.name || profile.name || "Resume", preparedFor: `${payload.job.title} at ${payload.job.company}` },
        profile.resume,
      ),
      profile.resume,
    );
    return { document };
  }
  const written =
    kind === "resume"
      ? await geminiTailored(key, profile, scored, pdf)
      : await geminiLetter(key, profile, scored);
  return { text: written.text, model: written.model };
}

class DraftBusy extends Error {
  constructor() {
    super("A draft is already being written.");
    this.name = "DraftBusy";
  }
}

export async function processDraft(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await ready();
  const pool = getPool();
  const owner = randomUUID();
  const lane = await pool.query(
    `UPDATE draft_lane
     SET locked_at = now(), owner = $1
     WHERE id = 1 AND (locked_at IS NULL OR locked_at < now() - interval '3 minutes')
     RETURNING owner`,
    [owner],
  );
  if (!lane.rowCount) throw new DraftBusy();
  try {
    const current = await pool.query<{ status: string; kind: DraftKind; payload: DraftPayload }>(
      `SELECT status, kind, payload FROM drafts WHERE id = $1`,
      [id],
    );
    const row = current.rows[0];
    if (!row || row.status === "done" || row.status === "failed") return;
    await pool.query(`UPDATE drafts SET status = 'running', started_at = now() WHERE id = $1`, [id]);
    try {
      const result = await runDraft(row.kind, row.payload);
      await pool.query(
        `UPDATE drafts
         SET status = 'done', result = $2::jsonb, error = '', payload = '{}'::jsonb, finished_at = now()
         WHERE id = $1`,
        [id, JSON.stringify(result)],
      );
      logProcess("draft", { step: "work", result: "ok", kind: row.kind });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The draft failed.";
      await pool.query(
        `UPDATE drafts
         SET status = 'failed', error = $2, payload = '{}'::jsonb, finished_at = now()
         WHERE id = $1`,
        [id, message.slice(0, 300)],
      );
      logProcess("draft", { step: "work", result: "failed", kind: row.kind, message });
    }
  } finally {
    await pool.query(`UPDATE draft_lane SET locked_at = NULL, owner = NULL WHERE id = 1 AND owner = $1`, [owner]);
    await pool.query(`DELETE FROM drafts WHERE finished_at < now() - interval '1 day'`);
  }
}

export async function publishDraft(id: string): Promise<void> {
  try {
    await send("drafts", { id }, { idempotencyKey: id, retentionSeconds: 24 * 60 * 60 });
    logProcess("draft", { step: "publish", result: "ok" });
  } catch (cause) {
    logProcess("draft", {
      step: "publish",
      result: "fallback",
      message: cause instanceof Error ? cause.message : "",
    });
    after(() => {
      processDraft(id).catch((error: unknown) => {
        logProcess("draft", {
          step: "work",
          result: "failed",
          message: error instanceof Error ? error.message : "",
        });
      });
    });
  }
}
