export function logProcess(feature: string, detail: Record<string, string | number | boolean>): void {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(detail)) {
    safe[key] = typeof value === "string" ? scrubLog(value) : value;
  }
  console.error(`[${feature}]`, safe);
}

export function errorDetail(cause: unknown): { name: string; message: string; code: string } {
  const code =
    cause && typeof cause === "object" && "code" in cause ? String((cause as { code?: unknown }).code || "") : "";
  return {
    name: cause instanceof Error ? cause.name : "unknown",
    message: cause instanceof Error ? cause.message : "",
    code,
  };
}

export function databaseHost(): string {
  const raw = process.env.DATABASE_URL?.trim() || "";
  if (!raw) return "missing";
  try {
    const host = new URL(raw).hostname;
    if (!host) return "invalid";
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "localhost";
    return host;
  } catch {
    return "invalid";
  }
}

function scrubLog(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[database]")
    .replace(/([?&](?:key|token|secret|code)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:eyJ|ya29\.|gho_|github_pat_|AIza|AQ\.)[A-Za-z0-9._-]{8,}/g, "[token]")
    .slice(0, 300);
}
