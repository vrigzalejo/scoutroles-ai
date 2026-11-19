import { logProcess } from "@/lib/log";
import { guessName, joinList } from "@/lib/text";
import type { Profile, ScoredJob } from "@/lib/types";

export function localLetter(profile: Profile, scored: ScoredJob): string {
  const name = profile.name.trim() || guessName(profile.resume);
  const skills = scored.matched.slice(0, 4);
  const overlap = skills.length
    ? `I would be glad to talk through my experience with ${joinList(skills)}.`
    : "I would be glad to talk through how my background fits the work.";

  const lines = [
    `Dear ${scored.job.company} team,`,
    "",
    `Thank you for considering my application for the ${scored.job.title} role. ${overlap}`,
    "",
    profile.resume.trim()
      ? "I have kept this note brief so it is easy to read. The details are on my resume, and I would welcome the chance to walk through the relevant work with you."
      : "I would be happy to send a resume and a few examples of related work.",
    "",
    "Thank you again for your time and consideration.",
    "Sincerely,",
  ];
  if (name) lines.push(name);
  return lines.join("\n");
}

const MODELS: { id: string; generationConfig: Record<string, unknown>; skipAfterTimeout?: boolean }[] = [
  { id: "gemini-3.8-flash", generationConfig: { thinkingConfig: { thinkingLevel: "low" } } },
  { id: "gemini-3.8-flash", generationConfig: {}, skipAfterTimeout: true },
  { id: "gemini-3.6-flash", generationConfig: {} },
  { id: "gemini-3.5-flash-lite", generationConfig: {} },
];

type GeminiPayload = {
  error?: { message?: string };
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
};

function retrySameModel(status: number, message: string): boolean {
  return status === 400 || /thinking|not supported|unknown/i.test(message);
}

function overloaded(status: number, message: string): boolean {
  return status === 429 || status === 503 || /high demand|overloaded|try again later|resource exhausted|unavailable/i.test(message);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geminiText(
  key: string,
  prompt: string,
  maxOutputTokens: number,
  emptyLabel: string,
  attachment?: { mimeType: string; data: string },
): Promise<{ text: string; model: string }> {
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [{ text: prompt }];
  if (attachment?.data) parts.push({ inlineData: { mimeType: attachment.mimeType, data: attachment.data } });
  let lastError = `Gemini did not return a ${emptyLabel}.`;
  let timedOut = false;
  const demandWaits = [2_000, 6_000, 15_000];
  for (const model of MODELS) {
    if (timedOut && model.skipAfterTimeout) continue;
    let demandAttempt = 0;
    let status = 0;
    while (true) {
      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            signal: AbortSignal.timeout(attachment ? 180_000 : 120_000),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: { ...model.generationConfig, maxOutputTokens },
            }),
          },
        );
      } catch (cause) {
        if (cause instanceof DOMException && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
          timedOut = true;
          lastError = `${model.id} took too long.`;
          logProcess("gemini", { step: emptyLabel, model: model.id, result: "timeout", status: 0 });
          break;
        }
        logProcess("gemini", {
          step: emptyLabel,
          model: model.id,
          result: "failed",
          status: 0,
          message: cause instanceof Error ? cause.message : "",
        });
        throw cause;
      }
      status = response.status;
      const data = (await response.json().catch(() => null)) as GeminiPayload | null;
      if (!response.ok) {
        lastError = data?.error?.message || `Gemini request failed (${response.status}).`;
        if (overloaded(response.status, lastError) && demandAttempt < demandWaits.length) {
          logProcess("gemini", { step: emptyLabel, model: model.id, result: "retry", status, message: lastError });
          await wait(demandWaits[demandAttempt] ?? 15_000);
          demandAttempt += 1;
          continue;
        }
        logProcess("gemini", { step: emptyLabel, model: model.id, result: "failed", status, message: lastError });
        break;
      }
      const text = data?.candidates?.[0]?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      if (text) {
        logProcess("gemini", { step: emptyLabel, model: model.id, result: "ok", status });
        return { text, model: model.id };
      }
      lastError = `${model.id} returned an empty ${emptyLabel}.`;
      logProcess("gemini", { step: emptyLabel, model: model.id, result: "empty", status, message: lastError });
      break;
    }
    if (timedOut || status === 404 || overloaded(status, lastError)) continue;
    if (status !== 200 && retrySameModel(status, lastError)) continue;
    if (status !== 200) break;
  }
  throw new Error(lastError);
}

export function localTailored(profile: Profile, scored: ScoredJob, sourceText?: string, fileName?: string): string {
  const source = (sourceText ?? profile.resume).trim();
  const name = profile.name.trim() || guessName(source);
  const skills = scored.matched.slice(0, 8);
  const lines = [
    name,
    [profile.location.trim(), profile.roles.trim()].filter(Boolean).join(" · "),
    `For ${scored.job.title} at ${scored.job.company}`,
  ];
  if (fileName) lines.push(`From ${fileName}`);
  lines.push(
    "",
    skills.length
      ? `Skills from the resume that match this posting: ${joinList(skills)}.`
      : "No shared skills were detected, so the resume below is unchanged.",
    "",
    source || "Add a resume in the brief first.",
  );
  return lines.join("\n").trim();
}

export async function geminiTailored(
  key: string,
  profile: Profile,
  scored: ScoredJob,
  source?: { text?: string; fileName?: string; pdfBase64?: string },
): Promise<{ text: string; model: string }> {
  const resume = (source?.text ?? profile.resume).slice(0, 7000);
  const fileName = source?.fileName?.trim();
  const origin = fileName
    ? `The resume was read from the original file ${fileName}.`
    : "The resume text below is the candidate's resume.";
  const attached = source?.pdfBase64
    ? " The attached PDF is that same original file. Read it as well as the text."
    : "";
  const prompt = `Rewrite this resume so it is aimed at one job. Keep it to one page in plain text.

Rules:
- Use only facts that appear in the original resume. Do not invent employers, titles, dates, metrics, degrees, tools, or achievements.
- Reorder and shorten so the most relevant experience comes first. You may drop experience lines that do not help this job.
- Keep the candidate's name and every contact detail: email, phone, and every URL, including GitHub, LinkedIn, and portfolio links. Do not drop or rewrite those addresses.
- No markdown, no cover letter, no commentary about what you changed.

${origin}${attached}

Target role: ${scored.job.title}
Company: ${scored.job.company}

Resume:
${resume}

Job description:
${scored.job.description.slice(0, 2500)}`;
  return geminiText(
    key,
    prompt,
    4096,
    "resume",
    source?.pdfBase64 ? { mimeType: "application/pdf", data: source.pdfBase64 } : undefined,
  );
}

export async function geminiResumeDocument(
  key: string,
  profile: Profile,
  scored: ScoredJob,
  source?: { text?: string; fileName?: string; pdfBase64?: string },
): Promise<string> {
  const resume = (source?.text ?? profile.resume).slice(0, 7000);
  const fileName = source?.fileName?.trim();
  const origin = fileName ? `The original file is ${fileName}.` : "The text below is the original resume.";
  const attached = source?.pdfBase64 ? " The attached PDF is that same file." : "";
  const prompt = `Write a one-page resume aimed at the job below. Return only JSON with this shape:
{"name":"","headline":"","contacts":[],"summary":"","skills":[],"sections":[{"heading":"Experience","items":[{"title":"","org":"","when":"","bullets":[]}]}]}

Rules:
- Use only facts from the original resume. Do not invent employers, titles, dates, metrics, degrees, tools, or achievements.
- Write it so a hiring manager for this exact role would see the relevant work first. Use the posting's language only where the resume already supports it.
- Start each bullet with the concrete work that is already described. Do not add results that are not written in the resume.
- headline is the target role when the resume supports that kind of work. Otherwise use the person's own role.
- summary is at most 3 sentences.
- skills lists only strengths that appear in the resume, most relevant to the job first.
- Put every email and every URL from the resume into contacts, including GitHub, LinkedIn, and portfolio links. Copy them exactly.
- Use the heading Experience for main jobs.
- Put projects, freelance, volunteer, and other extra work under the heading Additional Experiences. Do not use the heading Projects.
- Include Education only when the resume has it.
- No markdown and no commentary.

${origin}${attached}

Target role: ${scored.job.title}
Company: ${scored.job.company}

Resume:
${resume}

Job description:
${scored.job.description.slice(0, 2500)}`;
  const written = await geminiText(
    key,
    prompt,
    8192,
    "resume",
    source?.pdfBase64 ? { mimeType: "application/pdf", data: source.pdfBase64 } : undefined,
  );
  return written.text;
}

export async function geminiLetter(
  key: string,
  profile: Profile,
  scored: ScoredJob,
): Promise<{ text: string; model: string }> {
  const name = profile.name.trim() || guessName(profile.resume) || "the candidate";
  const prompt = `Write a finished job application letter of 130 to 170 words. Stop when the letter is complete.

Rules:
- Use only facts that appear in the resume. Do not invent employers, titles, metrics, degrees, or years.
- Plain prose. No bullets, no subject line, no markdown.
- Address the ${scored.job.company} team.
- Mention the role: ${scored.job.title}.
- Sound polite, warm, and specific. Use a courteous greeting and a respectful close. Thank them for their time and consideration.
- Avoid blunt, casual, or demanding phrasing.
- Sign it as ${name} only if that name appears in the resume or was given. Otherwise omit a signature name.

Resume:
${profile.resume.slice(0, 7000)}

Job description:
${scored.job.description.slice(0, 2500)}`;
  return geminiText(key, prompt, 4096, "letter");
}
