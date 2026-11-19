import { connection } from "next/server";
import { currentPass } from "@/lib/pass-http";
import { passIsActive, readProfile, readTracker, writeProfile, writeTracker } from "@/lib/pass-store";
import type { Profile, Tracked } from "@/lib/types";

export async function GET() {
  await connection();
  const pass = await currentPass();
  if (!passIsActive(pass)) return Response.json({ error: "Sign in to open this account." }, { status: 401 });
  const [tracker, profile] = await Promise.all([readTracker(pass.id), readProfile(pass.id)]);
  return Response.json({ tracker, profile });
}

export async function PUT(request: Request) {
  await connection();
  const pass = await currentPass();
  if (!passIsActive(pass)) return Response.json({ error: "Sign in to save this account." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    tracker?: Record<string, Tracked>;
    profile?: Partial<Profile>;
  } | null;
  const hasTracker = Boolean(body?.tracker && typeof body.tracker === "object" && !Array.isArray(body.tracker));
  const hasProfile = Boolean(body?.profile && typeof body.profile === "object" && !Array.isArray(body.profile));
  if (!hasTracker && !hasProfile) {
    return Response.json({ error: "The account payload is missing." }, { status: 400 });
  }
  if (hasTracker && body?.tracker) await writeTracker(pass.id, body.tracker);
  if (hasProfile && body?.profile) await writeProfile(pass.id, body.profile);
  return Response.json({ ok: true });
}
