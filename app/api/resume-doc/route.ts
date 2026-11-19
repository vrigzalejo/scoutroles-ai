import { connection } from "next/server";
import { geminiResumeDocument } from "@/lib/letter";
import { currentPass, geminiConfigured } from "@/lib/pass-http";
import { passIsActive } from "@/lib/pass-store";
import { keepContacts, parseResumeDocument } from "@/lib/resume-pdf";
import type { Job, Profile, ScoredJob } from "@/lib/types";

type ResumeDocBody = {
  profile?: Partial<Profile>;
  job?: Partial<Job>;
  skills?: string[];
  fileName?: string;
  file?: { mimeType?: string; data?: string };
};

function scoredFrom(job: Partial<Job>): ScoredJob {
  return {
    job: {
      id: job.id || "resume",
      title: job.title || "",
      company: job.company || "",
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

export async function POST(request: Request) {
  await connection();
  const pass = await currentPass();
  if (!passIsActive(pass)) {
    return Response.json({ error: "A free account is required for a tailored PDF." }, { status: 401 });
  }
  if (!geminiConfigured()) {
    return Response.json({ error: "The server Gemini key is not set yet." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as ResumeDocBody | null;
  const profile = body?.profile;
  const job = body?.job;
  if (!profile?.resume?.trim() || !job?.title?.trim() || !job.company?.trim()) {
    return Response.json({ error: "The resume needs the original text, a title, and a company." }, { status: 400 });
  }
  const pdf =
    body?.file?.mimeType === "application/pdf" && body.file.data && body.file.data.length <= 6_000_000
      ? body.file.data
      : "";

  try {
    const raw = await geminiResumeDocument(
      process.env.GEMINI_API_KEY || "",
      {
        name: profile.name || "",
        roles: profile.roles || "",
        location: profile.location || "",
        remoteOnly: true,
        resume: profile.resume,
        geminiKey: "",
      },
      scoredFrom(job),
      { text: profile.resume, fileName: body?.fileName, pdfBase64: pdf || undefined },
    );
    const parsed = parseResumeDocument(raw);
    if (!parsed) throw new Error("Gemini did not return a resume document.");
    const document = keepContacts(
      { ...parsed, name: parsed.name || profile.name || "Resume", preparedFor: `${job.title} at ${job.company}` },
      profile.resume,
    );
    return Response.json({ document, source: "gemini" });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Gemini did not write the document.";
    return Response.json({ error: message }, { status: 502 });
  }
}
