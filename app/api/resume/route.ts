import { extractLinks, extractText, getDocumentProxy } from "unpdf";
import WordExtractor from "word-extractor";
import { errorDetail, logProcess } from "@/lib/log";
import { docxLinks, withMissingLinks } from "@/lib/resume-links";

const extractor = new WordExtractor();

function kind(file: File): "pdf" | "word" | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  const word =
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    type === "application/msword" ||
    type.includes("wordprocessingml");
  if (word) return "word";
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf";
  return null;
}

function joined(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const { links } = await extractLinks(pdf);
  return withMissingLinks(text, links.flat());
}

async function wordText(bytes: Uint8Array): Promise<string> {
  const document = await extractor.extract(Buffer.from(bytes));
  const body = joined([
    document.getHeaders(),
    document.getBody(),
    document.getTextboxes(),
    document.getFootnotes(),
    document.getEndnotes(),
  ]);
  return withMissingLinks(body, docxLinks(bytes));
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    logProcess("resume", { step: "read", result: "missing" });
    return Response.json({ error: "Choose a PDF, Word, or text file." }, { status: 400 });
  }
  const format = kind(file);
  if (!format) {
    logProcess("resume", { step: "read", result: "unsupported", bytes: file.size });
    return Response.json({ error: "Use a PDF, Word document, or text file." }, { status: 400 });
  }
  if (file.size > 4_000_000) {
    logProcess("resume", { step: "read", result: "too-large", format, bytes: file.size });
    return Response.json({ error: "That file is over 4 MB. Paste the text instead." }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = format === "pdf" ? await pdfText(bytes) : await wordText(bytes);
    const body = text.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
    if (body.length < 20) {
      logProcess("resume", { step: "read", result: "empty", format, bytes: file.size });
      return Response.json(
        { error: "No readable text in that file. Paste the resume instead." },
        { status: 422 },
      );
    }
    logProcess("resume", { step: "read", result: "ok", format, bytes: file.size, characters: body.length });
    return Response.json({ text: body });
  } catch (cause) {
    const detail = errorDetail(cause);
    logProcess("resume", { step: "read", result: "failed", format, ...detail });
    return Response.json(
      { error: "Could not read that file. Paste the resume instead." },
      { status: 422 },
    );
  }
}
