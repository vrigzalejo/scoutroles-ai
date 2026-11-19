export type ResumeBrief = {
  name: string;
  roles: string;
  location: string;
  remoteOnly: boolean | null;
};

const SECTION =
  /^(experience|work experience|professional experience|employment|education|skills|technical skills|summary|professional summary|objective|profile|about|about me|contact|projects|certifications|awards|references)\b/i;

const ROLE =
  /\b(engineer|developer|designer|manager|analyst|writer|marketer|scientist|researcher|recruiter|specialist|consultant|architect|accountant|coordinator|producer|editor|strategist|administrator|technician|director|product (?:manager|designer|owner))\b/i;

const NAME =
  /^[A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z][A-Za-z.'’-]*){1,3}$/;

const REMOTE = /\b(remote|work from home|wfh|distributed)\b/i;
const HYBRID = /\bhybrid\b/i;

const PLACE =
  /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2}),\s*([A-Z]{2}|[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/;

const NOT_PLACE = new Set([
  "react",
  "typescript",
  "javascript",
  "python",
  "node",
  "aws",
  "css",
  "html",
  "sql",
  "figma",
  "docker",
  "engineer",
  "developer",
  "designer",
  "manager",
  "present",
  "remote",
  "hybrid",
]);

function linesOf(resume: string): string[] {
  return resume
    .replace(/\r/g, "")
    .split("\n")
    .flatMap((line) => line.split(/\s{3,}/))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function tidyName(value: string): string {
  if (value !== value.toUpperCase() && value !== value.toLowerCase()) return value;
  return value
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, boundary: string, letter: string) => boundary + letter.toUpperCase());
}

function nameFrom(line: string): string {
  const piece = (line.split(/[|•·]/)[0] ?? line).trim();
  if (!NAME.test(piece) || SECTION.test(piece) || ROLE.test(piece)) return "";
  if (/@|https?:|www\.|linkedin|github|\d/.test(piece)) return "";
  return tidyName(piece);
}

function roleFromPiece(piece: string): string {
  if (/^[-•*]/.test(piece) || SECTION.test(piece)) return "";
  if ((piece.match(/,/g) ?? []).length > 2) return "";
  const sentence = piece.split(/(?<=\.)\s/)[0]?.replace(/\.$/, "").trim() ?? piece;
  let value = sentence.length <= 80 ? sentence : piece;
  if (!ROLE.test(value)) return "";
  value = (value.split(/\s+[—–]\s+|\s+-\s+/)[0] ?? value).trim();
  value = (value.split(/\s+@\s+|\s+at\s+/i)[0] ?? value).trim();
  const beforeComma = value.split(",")[0]?.trim() ?? value;
  if (ROLE.test(beforeComma)) value = beforeComma;
  value = value
    .replace(/\b(19|20)\d{2}\b.*/, "")
    .replace(/^(seeking|looking for|objective:?|target:?)\s+/i, "")
    .replace(/\.$/, "")
    .trim();
  if (value.length < 3 || value.length > 60 || !ROLE.test(value)) return "";
  return value;
}

function roleFrom(line: string): string {
  for (const piece of line.split(/[|•·]/)) {
    const role = roleFromPiece(piece.trim());
    if (role) return role;
  }
  return "";
}

function placeFrom(line: string): string {
  if ((line.match(/,/g) ?? []).length > 2) return "";
  const cleaned = line.replace(/https?:\S+|www\.\S+|\S+@\S+/g, " ");
  const match = cleaned.match(PLACE);
  if (!match) return "";
  const city = match[1]?.trim() ?? "";
  const region = match[2]?.trim() ?? "";
  if (NOT_PLACE.has(city.toLowerCase()) || NOT_PLACE.has(region.toLowerCase())) return "";
  if (ROLE.test(city)) return "";
  return city;
}

export function briefFromResume(resume: string): ResumeBrief {
  const lines = linesOf(resume);
  let name = "";
  let roles = "";
  let location = "";
  let remote = false;
  let hybrid = false;
  let inBody = false;

  for (const line of lines) {
    if (SECTION.test(line)) {
      inBody = true;
      continue;
    }
    if (!inBody) {
      if (!name) name = nameFrom(line);
      if (!roles) roles = roleFrom(line);
      if (!location) location = placeFrom(line);
      if (REMOTE.test(line)) remote = true;
      if (HYBRID.test(line)) hybrid = true;
      continue;
    }
    if (!roles) {
      roles = roleFrom(line);
      if (roles) break;
    }
  }

  const knownPlace = Boolean(location) || remote || hybrid;
  return {
    name,
    roles,
    location: location || (remote ? "remote" : ""),
    remoteOnly: knownPlace ? remote && !hybrid : null,
  };
}
