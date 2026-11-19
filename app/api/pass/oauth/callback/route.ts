import { connection, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PASS_COOKIE } from "@/lib/pass";
import { databaseHost, exchangeIdentity, logSignIn, oauthMatches, oauthRedirectUri, parseOAuthPending } from "@/lib/oauth";
import { passCookieOptions } from "@/lib/pass-http";
import { PassAuthError, startOAuthPass } from "@/lib/pass-store";

const OAUTH_COOKIE = "scoutroles_oauth";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  return finish(url.origin, url.searchParams.get("code") || "", url.searchParams.get("state") || "", url.searchParams.get("error") || "");
}

export async function POST(request: Request) {
  await connection();
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const code = form?.get("code");
  const state = form?.get("state");
  const error = form?.get("error");
  return finish(
    url.origin,
    typeof code === "string" ? code : "",
    typeof state === "string" ? state : "",
    typeof error === "string" ? error : "",
  );
}

async function finish(origin: string, code: string, state: string, error: string) {
  const jar = await cookies();
  const pending = parseOAuthPending(jar.get(OAUTH_COOKIE)?.value);
  const redirect = (codeName: string) => {
    const response = NextResponse.redirect(codeName ? `${origin}/?sign-in=${codeName}` : `${origin}/`);
    response.cookies.delete(OAUTH_COOKIE);
    return response;
  };
  if (error === "access_denied") {
    logSignIn({ step: "finish", result: "denied" });
    return redirect("denied");
  }
  if (error || !pending || !code || code.length > 2000 || !oauthMatches(pending.state, state)) {
    logSignIn({
      step: "finish",
      result: "expired",
      providerError: error,
      pending: Boolean(pending),
      hasCode: Boolean(code),
      stateMatch: pending ? oauthMatches(pending.state, state) : false,
    });
    return redirect("expired");
  }
  try {
    const account = await exchangeIdentity(pending.provider, oauthRedirectUri(origin), code, pending.verifier);
    const pass = await startOAuthPass(pending.provider, account.email, account.sub);
    const response = redirect("");
    response.cookies.set(PASS_COOKIE, pass.token, passCookieOptions());
    return response;
  } catch (cause) {
    const signIn = cause instanceof PassAuthError && cause.signIn ? cause.signIn : "failed";
    const dbCode = cause && typeof cause === "object" && "code" in cause ? String((cause as { code?: unknown }).code || "") : "";
    logSignIn({
      step: "finish",
      result: signIn,
      provider: pending.provider,
      name: cause instanceof Error ? cause.name : "unknown",
      message: cause instanceof Error ? cause.message : "",
      code: dbCode,
      database: databaseHost(),
    });
    return redirect(signIn);
  }
}
