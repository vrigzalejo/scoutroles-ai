import { cookies } from "next/headers";
import { PASS_COOKIE, type PassStatus } from "@/lib/pass";
import { findPass, passIsActive, type PassRecord } from "@/lib/pass-store";

export function paymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function passStatus(pass: PassRecord | null): PassStatus {
  if (!passIsActive(pass)) {
    return { active: false, configured: paymentsConfigured(), gemini: geminiConfigured() };
  }
  return {
    active: true,
    configured: paymentsConfigured(),
    gemini: geminiConfigured(),
    id: pass.id,
    email: pass.email,
    expiresAt: pass.expiresAt,
    lettersUsed: pass.lettersUsed,
    lettersLeft: Math.max(0, pass.letterQuota - pass.lettersUsed),
    letterQuota: pass.letterQuota,
    provider: pass.provider,
    hasPassword: Boolean(pass.passwordHash),
  };
}

export async function currentPass(): Promise<PassRecord | null> {
  const jar = await cookies();
  return findPass(jar.get(PASS_COOKIE)?.value);
}

export function passCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  };
}

export async function setPassCookie(token: string) {
  const jar = await cookies();
  jar.set(PASS_COOKIE, token, passCookieOptions());
}

export async function clearPassCookie() {
  const jar = await cookies();
  jar.delete(PASS_COOKIE);
}
