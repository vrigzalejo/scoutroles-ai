import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type ResumeItem = {
  title: string;
  org: string;
  when: string;
  bullets: string[];
};

export type ResumeDocument = {
  name: string;
  headline: string;
  contacts: string[];
  summary: string;
  skills: string[];
  sections: { heading: string; items: ResumeItem[] }[];
  preparedFor: string;
};

const CONTACT =
  /(?:https?:\/\/[^\s<>"')\]]+|mailto:[^\s<>"')\]]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

function clean(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function sectionHeading(value: string): string {
  if (/projects?$/i.test(value)) return "Additional Experiences";
  return value;
}

function list(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const entry of value) {
    const text = clean(entry, maxLen);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    items.push(text);
    if (items.length >= maxItems) break;
  }
  return items;
}

export function parseResumeDocument(raw: string): ResumeDocument | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const parsed: ResumeDocument = {
    name: clean(data.name, 80),
    headline: clean(data.headline, 90),
    contacts: list(data.contacts, 8, 140),
    summary: clean(data.summary, 700),
    skills: list(data.skills, 16, 40),
    preparedFor: "",
    sections: sections.slice(0, 4).flatMap((section) => {
      if (!section || typeof section !== "object") return [];
      const record = section as Record<string, unknown>;
      const items = Array.isArray(record.items) ? record.items : [];
      const kept = items.slice(0, 6).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const next = {
          title: clean(row.title, 80),
          org: clean(row.org, 80),
          when: clean(row.when, 40),
          bullets: list(row.bullets, 5, 220),
        };
        if (!next.title && !next.org && !next.bullets.length) return [];
        return [next];
      });
      const heading = sectionHeading(clean(record.heading, 48));
      if (!heading || !kept.length) return [];
      return [{ heading, items: kept }];
    }),
  };
  if (!parsed.name && !parsed.summary && !parsed.sections.length) return null;
  return parsed;
}

export function keepContacts(doc: ResumeDocument, source: string): ResumeDocument {
  const contacts = [...doc.contacts];
  const seen = new Set(contacts.map((item) => item.toLowerCase()));
  for (const match of source.matchAll(CONTACT)) {
    const value = match[0].replace(/[.,;]+$/, "");
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    contacts.push(value);
  }
  return { ...doc, contacts: contacts.slice(0, 8) };
}

function bulletText(line: string): string {
  return line.replace(/^([•●▪*-]|\d+[.)])\s+/, "").trim();
}

function isBullet(line: string): boolean {
  return /^([•●▪*-]|\d+[.)])\s+/.test(line);
}

function sectionName(line: string): string {
  const value = line.replace(/:$/, "").trim();
  if (!/^[A-Za-z][A-Za-z &/]{2,32}$/.test(value)) return "";
  if (/^(summary|profile|about)$/i.test(value)) return "Summary";
  if (/^(experience|work experience|employment|professional experience)$/i.test(value)) return "Experience";
  if (/^education$/i.test(value)) return "Education";
  if (/^skills$/i.test(value)) return "Skills";
  if (/projects?$/i.test(value)) return "Additional Experiences";
  return "";
}

function splitRole(line: string): { title: string; when: string } {
  const parts = line.split(/\s+[—–]\s+|\s+-\s+(?=(?:19|20)\d{2}\b)/);
  if (parts.length < 2) return { title: line, when: "" };
  return { title: parts[0].trim(), when: parts.slice(1).join(" - ").trim() };
}

export function localResumeDocument(input: {
  name: string;
  resume: string;
  role: string;
  company: string;
  skills: string[];
}): ResumeDocument {
  const lines = input.resume
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^for .+ at .+$/i.test(line) && !/^from .+\.(pdf|docx?|txt|md)$/i.test(line))
    .filter((line) => !/^skills from the resume/i.test(line));
  const name = clean(input.name, 80) || "Resume";
  const skills = input.skills.map((skill) => clean(skill, 40)).filter(Boolean).slice(0, 12);
  const sections: ResumeDocument["sections"] = [];
  const places: string[] = [];
  let summary = "";
  let heading = "";
  let item: ResumeItem | null = null;

  function closeItem() {
    if (!item || (!item.title && !item.bullets.length)) return;
    const section = sections.find((entry) => entry.heading === (heading || "Experience"));
    if (section) section.items.push(item);
    else sections.push({ heading: heading || "Experience", items: [item] });
    item = null;
  }

  for (const line of lines) {
    if (line.toLowerCase() === name.toLowerCase()) continue;
    if (/^(https?:\/\/|mailto:)/i.test(line) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) continue;
    if (!heading && line.length < 48 && /,|·/.test(line) && !/\b(19|20)\d{2}\b/.test(line)) {
      places.push(line);
      continue;
    }
    const nextHeading = sectionName(line);
    if (nextHeading) {
      closeItem();
      heading = nextHeading === "Summary" || nextHeading === "Skills" ? heading : nextHeading;
      if (nextHeading === "Skills" || nextHeading === "Summary") heading = nextHeading;
      continue;
    }
    if (heading === "Skills") continue;
    if (heading === "Summary") {
      summary = summary ? `${summary} ${line}` : line;
      continue;
    }
    if (isBullet(line)) {
      const text = clean(bulletText(line), 220);
      if (!text) continue;
      if (!item) item = { title: "", org: "", when: "", bullets: [] };
      if (item.bullets.length < 5) item.bullets.push(text);
      continue;
    }
    if (/\b(19|20)\d{2}\b|[—–]/.test(line) && line.length < 120) {
      closeItem();
      const role = splitRole(line);
      item = { title: clean(role.title, 80), org: "", when: clean(role.when, 40), bullets: [] };
      if (!heading || heading === "Summary" || heading === "Skills") heading = "Experience";
      continue;
    }
    if (!summary && !heading && line.length > 40) {
      summary = clean(line, 700);
      continue;
    }
  }
  closeItem();

  const arranged = keepContacts(
    {
      name,
      headline: clean(input.role, 90),
      contacts: places,
      summary,
      skills,
      preparedFor: `${input.role} at ${input.company}`,
      sections: sections.filter((section) => section.heading !== "Skills" && section.heading !== "Summary").slice(0, 4),
    },
    input.resume,
  );
  return arranged;
}

export function resumePlainText(doc: ResumeDocument): string {
  const lines = [doc.name, doc.headline, doc.contacts.join(" · "), "", doc.summary, "", doc.skills.join(", ")];
  for (const section of doc.sections) {
    lines.push("", section.heading);
    for (const item of section.items) {
      lines.push([item.title, item.org, item.when].filter(Boolean).join(" · "));
      for (const bullet of item.bullets) lines.push(`- ${bullet}`);
    }
  }
  return lines.filter((line) => line !== undefined).join("\n").trim();
}

export function resumePdfName(doc: ResumeDocument): string {
  const base = [doc.name, doc.headline]
    .filter(Boolean)
    .join(" ")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
  return `${(base || "resume").slice(0, 80)}.docx`;
}

function latin(value: string): string {
  return value
    .replace(/[•●▪]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\t\n\r\x20-\x7e\u00a0-\u00ff]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = latin(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderResumePdf(doc: ResumeDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.12, 0.11);
  const pine = rgb(0.13, 0.32, 0.25);
  const muted = rgb(0.32, 0.33, 0.31);
  const margin = 52;
  const width = 612;
  const height = 792;
  const content = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  function nextPage() {
    page = pdf.addPage([width, height]);
    y = height - margin;
  }

  function room(needed: number) {
    if (y - needed < margin) nextPage();
  }

  function text(value: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, indent = 0) {
    const lines = wrap(value, font, size, content - indent);
    for (const line of lines) {
      room(size + 3);
      page.drawText(line, { x: margin + indent, y: y - size, size, font, color });
      y -= size + 3;
    }
  }

  text(doc.name || "Resume", 22, bold, ink);
  y -= 2;
  if (doc.headline) text(doc.headline, 11, regular, pine);
  if (doc.contacts.length) text(doc.contacts.join("  ·  "), 9, regular, muted);
  y -= 8;

  function heading(label: string) {
    room(22);
    y -= 6;
    page.drawText(label.toUpperCase(), { x: margin, y: y - 10, size: 10, font: bold, color: pine });
    y -= 14;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.6,
      color: rgb(0.78, 0.8, 0.77),
    });
    y -= 8;
  }

  if (doc.summary) {
    heading("Summary");
    text(doc.summary, 10.5, regular, ink);
  }
  if (doc.skills.length) {
    heading("Skills");
    text(doc.skills.join("  ·  "), 10.5, regular, ink);
  }
  for (const section of doc.sections) {
    heading(section.heading);
    for (const item of section.items) {
      const title = [item.title, item.org].filter(Boolean).join(", ");
      if (title) text(title, 11, bold, ink);
      if (item.when) text(item.when, 9, regular, muted);
      for (const bullet of item.bullets) text(bullet, 10.5, regular, ink, 12);
      y -= 4;
    }
  }

  return pdf.save();
}
