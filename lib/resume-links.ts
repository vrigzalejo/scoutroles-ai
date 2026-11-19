import { inflateRawSync } from "node:zlib";

const URLISH = /(?:https?:\/\/|mailto:)[^\s<>"')\]]+/gi;

function tidyUrl(value: string): string {
  const decoded = value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
  const match = decoded.match(/^(?:https?:\/\/|mailto:)\S+/i);
  if (!match) return "";
  return match[0].replace(/[.,;]+$/, "");
}

function knownUrls(text: string): Set<string> {
  return new Set([...text.matchAll(URLISH)].map((match) => tidyUrl(match[0]).toLowerCase()).filter(Boolean));
}

export function withMissingLinks(text: string, urls: string[]): string {
  const present = knownUrls(text);
  const extra: string[] = [];
  for (const raw of urls) {
    const url = tidyUrl(raw);
    const key = url.toLowerCase();
    if (!url || present.has(key)) continue;
    present.add(key);
    extra.push(url);
  }
  if (!extra.length) return text.trim();
  const trimmed = text.replace(/\s+$/, "");
  const block = extra.join("\n");
  const breakAt = trimmed.indexOf("\n");
  if (breakAt === -1) return `${trimmed}\n${block}`.trim();
  return `${trimmed.slice(0, breakAt)}\n${block}\n${trimmed.slice(breakAt + 1)}`.trim();
}

function readZip(bytes: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  let eocd = -1;
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let index = bytes.length - 22; index >= min; index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return files;
  const count = bytes.readUInt16LE(eocd + 10);
  let cursor = bytes.readUInt32LE(eocd + 16);
  for (let index = 0; index < count && cursor + 46 <= bytes.length; index += 1) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = bytes.readUInt16LE(cursor + 10);
    const compSize = bytes.readUInt32LE(cursor + 20);
    const nameLen = bytes.readUInt16LE(cursor + 28);
    const extraLen = bytes.readUInt16LE(cursor + 30);
    const commentLen = bytes.readUInt16LE(cursor + 32);
    const localOff = bytes.readUInt32LE(cursor + 42);
    const name = bytes.toString("utf8", cursor + 46, cursor + 46 + nameLen);
    cursor += 46 + nameLen + extraLen + commentLen;
    if (!name || name.endsWith("/") || localOff + 30 > bytes.length) continue;
    const localNameLen = bytes.readUInt16LE(localOff + 26);
    const localExtraLen = bytes.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compSize);
    let data: Buffer | null = null;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) {
      try {
        data = inflateRawSync(compressed);
      } catch {
        data = null;
      }
    }
    if (data && /\.(xml|rels)$/i.test(name)) files.set(name, data.toString("utf8"));
  }
  return files;
}

export function docxLinks(bytes: Uint8Array): string[] {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return [];
  const files = readZip(Buffer.from(bytes));
  const urls: string[] = [];
  for (const xml of files.values()) {
    for (const match of xml.matchAll(/Target="([^"]+)"/g)) {
      const url = tidyUrl(match[1] ?? "");
      if (url) urls.push(url);
    }
    for (const match of xml.matchAll(/HYPERLINK\s+(?:&quot;|"|')([^"'&]+)(?:&quot;|"|')/gi)) {
      const url = tidyUrl(match[1] ?? "");
      if (url) urls.push(url);
    }
  }
  return urls;
}
