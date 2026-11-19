import { connection, NextResponse } from "next/server";
import { isOAuthProvider, signInEnabled } from "@/lib/pass";
import { authorizationUrl, oauthReady, oauthRedirectUri, oauthState } from "@/lib/oauth";

const OAUTH_COOKIE = "scoutroles_oauth";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  await connection();
  const origin = new URL(request.url).origin;
  const { provider } = await context.params;
  if (!isOAuthProvider(provider) || !signInEnabled(provider)) return NextResponse.redirect(`${origin}/?sign-in=failed`);
  if (!oauthReady(provider)) return NextResponse.redirect(`${origin}/?sign-in=${provider}-setup`);
  const pending = oauthState();
  const response = NextResponse.redirect(authorizationUrl(provider, oauthRedirectUri(origin), pending.state, pending.challenge));
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ state: pending.state, verifier: pending.verifier, provider }), {
    httpOnly: true,
    sameSite: provider === "apple" ? "none" : "lax",
    secure: provider === "apple" || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
