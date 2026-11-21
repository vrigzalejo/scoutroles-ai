import type { Job } from "@/lib/types";

export type PastedFields = {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
};

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function httpUrl(value: string): string {
  const trimmed = value.trim().replace(/[.,)]$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

export function readPaste(raw: string): PastedFields {
  const description = raw.replace(/\r\n/g, "\n").trim();
  const lines = description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0] ?? "";
  const second = lines[1] ?? "";
  const title = first.length <= 80 && !first.endsWith(".") && !/^https?:/i.test(first) ? first : "";

  let company = "";
  let location = "";
  if (second.length <= 80 && !second.endsWith(".") && !/^https?:/i.test(second)) {
    const parts = second
      .split(/\s*[·•]\s*|\s+\|\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2 && parts[0].length <= 48 && !parts[0].endsWith(".")) {
      company = parts[0];
      location = parts
        .slice(1)
        .filter((part) => !/^https?:/i.test(part) && !part.startsWith("$"))
        .join(" · ");
    } else if (/remote|hybrid|on-?site/i.test(second)) {
      location = second;
    }
  }

  const found = description.match(/https?:\/\/[^\s)]+/i)?.[0] ?? "";
  return { title, company, location, url: httpUrl(found), description };
}

export function jobFromPaste(fields: PastedFields): Job {
  const title = fields.title.trim();
  const company = fields.company.trim();
  const location = fields.location.trim();
  const description = fields.description.trim();
  const url = httpUrl(fields.url);
  return {
    id: `paste:${hash([title, company, description].join("\n"))}`,
    title,
    company,
    location,
    remote: /remote/i.test(`${location}\n${description.slice(0, 500)}`),
    salary: "",
    description,
    tags: [],
    url,
    applyUrl: url,
    source: "Pasted",
    sourceHome: "",
    publishedAt: "",
  };
}
