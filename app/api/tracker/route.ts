import { connection } from "next/server";
import { errorDetail, logProcess } from "@/lib/log";
import { currentPass } from "@/lib/pass-http";
import { passIsActive, readProfile, readTracker, writeProfile, writeTracker } from "@/lib/pass-store";
import type { Profile, Tracked } from "@/lib/types";

export async function GET() {
  await connection();
  const pass = await currentPass();
  if (!passIsActive(pass)) {
    logProcess("tracker", { step: "read", result: "unsigned" });
    return Response.json({ error: "Sign in to open this account." }, { status: 401 });
  }
  try {
    const [tracker, profile] = await Promise.all([readTracker(pass.id), readProfile(pass.id)]);
    logProcess("tracker", {
      step: "read",
      result: "ok",
      roles: Object.keys(tracker).length,
      profile: Boolean(profile),
    });
    return Response.json({ tracker, profile });
  } catch (cause) {
    const detail = errorDetail(cause);
    logProcess("tracker", { step: "read", result: "failed", ...detail });
    throw cause;
  }
}

export async function PUT(request: Request) {
  await connection();
  const pass = await currentPass();
  if (!passIsActive(pass)) {
    logProcess("tracker", { step: "save", result: "unsigned" });
    return Response.json({ error: "Sign in to save this account." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    tracker?: Record<string, Tracked>;
    profile?: Partial<Profile>;
  } | null;
  const hasTracker = Boolean(body?.tracker && typeof body.tracker === "object" && !Array.isArray(body.tracker));
  const hasProfile = Boolean(body?.profile && typeof body.profile === "object" && !Array.isArray(body.profile));
  if (!hasTracker && !hasProfile) {
    logProcess("tracker", { step: "save", result: "missing" });
    return Response.json({ error: "The account payload is missing." }, { status: 400 });
  }
  try {
    if (hasTracker && body?.tracker) await writeTracker(pass.id, body.tracker);
    if (hasProfile && body?.profile) await writeProfile(pass.id, body.profile);
    logProcess("tracker", {
      step: "save",
      result: "ok",
      roles: hasTracker && body?.tracker ? Object.keys(body.tracker).length : 0,
      profile: hasProfile,
    });
    return Response.json({ ok: true });
  } catch (cause) {
    const detail = errorDetail(cause);
    logProcess("tracker", { step: "save", result: "failed", ...detail });
    throw cause;
  }
}
