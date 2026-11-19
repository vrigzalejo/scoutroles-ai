import { connection } from "next/server";
import { geminiLetter, geminiTailored } from "@/lib/letter";
import { currentPass, geminiConfigured } from "@/lib/pass-http";
import { consumeLetter, passIsActive } from "@/lib/pass-store";
import type { Job, Profile, ScoredJob } from "@/lib/types";

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
    return Response.json({ error: "A free account is required for included letters." }, { status: 401 });
  }
  if (!geminiConfigured()) {
    return Response.json({ error: "The server Gemini key is not set yet." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as LetterBody | null;
  const kind = body?.kind === "resume" ? "resume" : "letter";
  const profile = body?.profile;
  const job = body?.job;
  if (!profile?.resume?.trim() || !job?.title?.trim() || !job.company?.trim()) {
    return Response.json({ error: "The letter needs a resume, a title, and a company." }, { status: 400 });
  }

  try {
    await consumeLetter(pass.token);
    const scored: ScoredJob = {
      job: {
        id: job.id || "pass",
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
    const pdf =
      kind === "resume" &&
      body?.file?.mimeType === "application/pdf" &&
      body.file.data &&
      body.file.data.length <= 6_000_000
        ? body.file.data
        : "";
    const draft =
      kind === "resume"
        ? await geminiTailored(
            process.env.GEMINI_API_KEY || "",
            {
              name: profile.name || "",
              roles: profile.roles || "",
              location: profile.location || "",
              remoteOnly: true,
              resume: profile.resume,
              geminiKey: "",
            },
            scored,
            { text: profile.resume, fileName: body?.fileName, pdfBase64: pdf || undefined },
          )
        : await geminiLetter(process.env.GEMINI_API_KEY || "", {
            name: profile.name || "",
            roles: profile.roles || "",
            location: profile.location || "",
            remoteOnly: true,
            resume: profile.resume,
            geminiKey: "",
          }, scored);
    return Response.json({
      text: draft.text,
      model: draft.model,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not write the draft.";
    const status = /not active/i.test(message) ? 402 : 502;
    return Response.json({ error: message }, { status });
  }
}
