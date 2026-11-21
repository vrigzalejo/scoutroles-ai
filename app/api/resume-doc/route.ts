import { connection } from "next/server";
import { enqueueDraft, publishDraft } from "@/lib/drafts";
import { logProcess } from "@/lib/log";
import { currentPass, geminiConfigured } from "@/lib/pass-http";
import { passIsActive } from "@/lib/pass-store";
import type { Job, Profile } from "@/lib/types";

export const maxDuration = 300;

type ResumeDocBody = {
  profile?: Partial<Profile>;
  job?: Partial<Job>;
  skills?: string[];
  fileName?: string;
  file?: { mimeType?: string; data?: string };
};

export async function POST(request: Request) {
  await connection();
  const pass = await currentPass();
  if (!passIsActive(pass)) {
    logProcess("document", { step: "generate", result: "unsigned" });
    return Response.json({ error: "A free account is required for a tailored PDF." }, { status: 401 });
  }
  if (!geminiConfigured()) {
    logProcess("document", { step: "generate", result: "no-key" });
    return Response.json({ error: "The server Gemini key is not set yet." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as ResumeDocBody | null;
  const profile = body?.profile;
  const job = body?.job;
  if (!profile?.resume?.trim() || !job?.title?.trim() || !job.company?.trim()) {
    logProcess("document", { step: "generate", result: "incomplete" });
    return Response.json({ error: "The resume needs the original text, a title, and a company." }, { status: 400 });
  }
  const pdf =
    body?.file?.mimeType === "application/pdf" && body.file.data && body.file.data.length <= 6_000_000
      ? body.file.data
      : "";

  try {
    const draft = await enqueueDraft({
      passId: pass.id,
      kind: "document",
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
        skills: (body?.skills ?? []).filter((skill): skill is string => typeof skill === "string").slice(0, 12),
        fileName: body?.fileName,
        pdfBase64: pdf || undefined,
      },
    });
    await publishDraft(draft.id);
    logProcess("document", { step: "generate", result: "queued" });
    return Response.json(draft);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Gemini did not write the document.";
    const status = /already in line/i.test(message) ? 429 : 502;
    logProcess("document", { step: "generate", result: "failed", status, message });
    return Response.json({ error: message }, { status });
  }
}
