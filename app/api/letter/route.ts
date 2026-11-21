import { connection } from "next/server";
import { enqueueDraft, publishDraft } from "@/lib/drafts";
import { logProcess } from "@/lib/log";
import { currentPass, geminiConfigured } from "@/lib/pass-http";
import { consumeLetter, passIsActive } from "@/lib/pass-store";
import type { Job, Profile } from "@/lib/types";

export const maxDuration = 300;

type LetterBody = {
  kind?: "letter" | "resume";
  profile?: Partial<Profile>;
  job?: Partial<Job>;
  fileName?: string;
  file?: { mimeType?: string; data?: string };
};

export async function POST(request: Request) {
  await connection();
  const pass = await currentPass();
  if (!passIsActive(pass)) {
    logProcess("letter", { step: "draft", result: "unsigned" });
    return Response.json({ error: "A free account is required for included letters." }, { status: 401 });
  }
  if (!geminiConfigured()) {
    logProcess("letter", { step: "draft", result: "no-key" });
    return Response.json({ error: "The server Gemini key is not set yet." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as LetterBody | null;
  const kind = body?.kind === "resume" ? "resume" : "letter";
  const profile = body?.profile;
  const job = body?.job;
  if (!profile?.resume?.trim() || !job?.title?.trim() || !job.company?.trim()) {
    logProcess("letter", { step: "draft", result: "incomplete", kind });
    return Response.json({ error: "The letter needs a resume, a title, and a company." }, { status: 400 });
  }

  const pdf =
    kind === "resume" &&
    body?.file?.mimeType === "application/pdf" &&
    body.file.data &&
    body.file.data.length <= 6_000_000
      ? body.file.data
      : "";

  try {
    await consumeLetter(pass.token);
    const draft = await enqueueDraft({
      passId: pass.id,
      kind,
      payload: {
        profile: {
          name: profile.name || "",
          roles: profile.roles || "",
          location: profile.location || "",
          resume: profile.resume,
        },
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          description: job.description,
          url: job.url,
          applyUrl: job.applyUrl,
          salary: job.salary,
          publishedAt: job.publishedAt,
        },
        fileName: body?.fileName,
        pdfBase64: pdf || undefined,
      },
    });
    await publishDraft(draft.id);
    logProcess("letter", { step: "draft", result: "queued", kind });
    return Response.json(draft);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not write the draft.";
    const status = /not active/i.test(message) ? 402 : /already in line/i.test(message) ? 429 : 502;
    logProcess("letter", { step: "draft", result: "failed", kind, status, message });
    return Response.json({ error: message }, { status });
  }
}
