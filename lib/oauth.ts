import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { get as httpsGet } from "node:https";
import { createLocalJWKSet, importPKCS8, jwtVerify, SignJWT, type JSONWebKeySet } from "jose";
import { isOAuthProvider, type OAuthProvider } from "@/lib/pass";
import { PassAuthError } from "@/lib/pass-store";

const keySets = new Map<string, ReturnType<typeof createLocalJWKSet>>();

function readHttps(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    httpsGet(url, (res) => {
      const status = res.statusCode ?? 500;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        resolve(readHttps(new URL(res.headers.location, url).href));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        if (status !== 200) {
          reject(new Error(`Signing keys responded ${status}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    }).on("error", reject);
  });
}

async function signingKeys(url: string) {
  const cached = keySets.get(url);
  if (cached) return cached;
  const set = createLocalJWKSet(JSON.parse(await readHttps(url)) as JSONWebKeySet);
  keySets.set(url, set);
  return set;
}

export type OAuthPending = {
  state: string;
  verifier: string;
  provider: OAuthProvider;
};

export function oauthRedirectUri(origin: string): string {
  return `${origin}/api/pass/oauth/callback`;
}

export function oauthReady(provider: OAuthProvider): boolean {
  if (provider === "google") return Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
  if (provider === "microsoft") return Boolean(env("MICROSOFT_CLIENT_ID") && env("MICROSOFT_CLIENT_SECRET"));
  if (provider === "github") return Boolean(env("GITHUB_CLIENT_ID") && env("GITHUB_CLIENT_SECRET"));
  return Boolean(env("APPLE_CLIENT_ID") && env("APPLE_TEAM_ID") && env("APPLE_KEY_ID") && env("APPLE_PRIVATE_KEY"));
}

export function oauthState(): { state: string; verifier: string; challenge: string } {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export function oauthMatches(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseOAuthPending(value: string | undefined): OAuthPending | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<OAuthPending>;
    if (!parsed.state || !parsed.verifier || !parsed.provider || !isOAuthProvider(parsed.provider)) return null;
    return { state: parsed.state, verifier: parsed.verifier, provider: parsed.provider };
  } catch {
    return null;
  }
}

export function authorizationUrl(provider: OAuthProvider, redirectUri: string, state: string, challenge: string): string {
  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", env("GOOGLE_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }
  if (provider === "microsoft") {
    const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    url.searchParams.set("client_id", env("MICROSOFT_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }
  if (provider === "github") {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", env("GITHUB_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "user:email");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }
  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", env("APPLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeIdentity(
  provider: OAuthProvider,
  redirectUri: string,
  code: string,
  verifier: string,
): Promise<{ email: string; sub: string }> {
  if (provider === "github") return githubIdentity(code, redirectUri, verifier);
  const tokens = await identityToken(provider, redirectUri, code, verifier);
  if (provider === "google") return googleIdentity(tokens.idToken, tokens.accessToken);
  if (provider === "microsoft") return microsoftIdentity(tokens.idToken, tokens.accessToken);
  return appleIdentity(tokens.idToken);
}

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function emailOk(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

async function tokenRequest(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !data || typeof data.id_token !== "string") {
    const code = typeof data?.error === "string" ? data.error : "";
    const signIn =
      code === "invalid_client" ? "invalid-client" : code === "redirect_uri_mismatch" ? "redirect" : code === "invalid_grant" ? "invalid-grant" : "failed";
    throw new PassAuthError("That sign-in could not be confirmed.", response.ok ? 401 : response.status, signIn);
  }
  return data;
}

async function identityToken(
  provider: OAuthProvider,
  redirectUri: string,
  code: string,
  verifier: string,
): Promise<{ idToken: string; accessToken: string }> {
  if (provider === "google") {
    const data = await tokenRequest("https://oauth2.googleapis.com/token", {
      code,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    });
    return { idToken: data.id_token as string, accessToken: typeof data.access_token === "string" ? data.access_token : "" };
  }
  if (provider === "microsoft") {
    const body: Record<string, string> = {
      code,
      client_id: env("MICROSOFT_CLIENT_ID"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    };
    const secret = env("MICROSOFT_CLIENT_SECRET");
    if (secret) body.client_secret = secret;
    const data = await tokenRequest("https://login.microsoftonline.com/common/oauth2/v2.0/token", body);
    return { idToken: data.id_token as string, accessToken: typeof data.access_token === "string" ? data.access_token : "" };
  }
  const data = await tokenRequest("https://appleid.apple.com/auth/token", {
    code,
    client_id: env("APPLE_CLIENT_ID"),
    client_secret: await appleClientSecret(),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  return { idToken: data.id_token as string, accessToken: "" };
}

async function googleIdentity(token: string, accessToken: string): Promise<{ email: string; sub: string }> {
  const checked = await verifiedGoogleClaims(token);
  const info = accessToken ? await googleUserInfo(accessToken) : { email: "", sub: "", verified: false };
  if (checked.sub && info.sub && checked.sub !== info.sub) {
    throw new PassAuthError("Google did not confirm this account.", 401, "token");
  }
  const sub = checked.sub || info.sub;
  const email = info.verified && emailOk(info.email) ? info.email : checked.email;
  const verified = (info.verified && emailOk(info.email)) || (checked.verified && emailOk(checked.email));
  if (!sub || !verified || !emailOk(email)) {
    throw new PassAuthError(checked.reason || "Google did not confirm this email.", 401, checked.signIn || "unconfirmed");
  }
  return { email, sub };
}

async function verifiedGoogleClaims(token: string): Promise<{ email: string; sub: string; verified: boolean; signIn?: string; reason?: string }> {
  try {
    const { payload } = await jwtVerify(token, await signingKeys("https://www.googleapis.com/oauth2/v3/certs"), {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env("GOOGLE_CLIENT_ID"),
      clockTolerance: 60,
    });
    return {
      email: typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "",
      sub: typeof payload.sub === "string" ? payload.sub : "",
      verified: payload.email_verified === true || payload.email_verified === "true",
    };
  } catch (cause) {
    const claim = cause && typeof cause === "object" && "claim" in cause ? String((cause as { claim?: unknown }).claim) : "";
    const signIn = claim === "aud" ? "client-id" : claim === "exp" || claim === "nbf" || claim === "iat" ? "clock" : "token";
    const reason =
      signIn === "client-id"
        ? "The Google client ID does not match this login."
        : signIn === "clock"
          ? "This computer’s clock is too far from Google’s."
          : "Google’s signed login could not be checked.";
    return { email: "", sub: "", verified: false, signIn, reason };
  }
}

async function googleUserInfo(accessToken: string): Promise<{ email: string; sub: string; verified: boolean }> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as { sub?: unknown; email?: unknown; email_verified?: unknown } | null;
  return {
    email: typeof data?.email === "string" ? data.email.trim().toLowerCase() : "",
    sub: typeof data?.sub === "string" ? data.sub : "",
    verified: data?.email_verified === true || data?.email_verified === "true",
  };
}

async function microsoftIdentity(token: string, accessToken: string): Promise<{ email: string; sub: string }> {
  const checked = await verifiedMicrosoftClaims(token);
  const info = accessToken ? await microsoftUserInfo(accessToken) : { email: "", sub: "" };
  if (checked.sub && info.sub && checked.sub !== info.sub) {
    throw new PassAuthError("Microsoft did not confirm this account.", 401, "token");
  }
  const sub = checked.sub || info.sub;
  const email = emailOk(info.email) ? info.email : checked.email;
  if (sub && emailOk(email)) return { email, sub };
  throw new PassAuthError("Microsoft did not share an email for this account.", 401, "unconfirmed");
}

async function verifiedMicrosoftClaims(token: string): Promise<{ email: string; sub: string }> {
  try {
    const { payload } = await jwtVerify(token, await signingKeys("https://login.microsoftonline.com/common/discovery/v2.0/keys"), {
      audience: env("MICROSOFT_CLIENT_ID"),
      clockTolerance: 60,
    });
    const issuer = typeof payload.iss === "string" ? payload.iss : "";
    if (!/^https:\/\/login\.microsoftonline\.com\/(?:[0-9a-f-]{36}|consumers)\/v2\.0$/i.test(issuer)) return { email: "", sub: "" };
    const emailClaim = typeof payload.email === "string" ? payload.email : "";
    const username = typeof payload.preferred_username === "string" ? payload.preferred_username : "";
    const email = (emailClaim || username).trim().toLowerCase();
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    return { email: emailOk(email) ? email : "", sub };
  } catch {
    return { email: "", sub: "" };
  }
}

async function microsoftUserInfo(accessToken: string): Promise<{ email: string; sub: string }> {
  const response = await fetch("https://graph.microsoft.com/oidc/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as { sub?: unknown; email?: unknown; preferred_username?: unknown } | null;
  const candidates = [data?.email, data?.preferred_username];
  const email = candidates.find((value) => typeof value === "string" && emailOk(value.trim().toLowerCase()));
  return {
    email: typeof email === "string" ? email.trim().toLowerCase() : "",
    sub: typeof data?.sub === "string" ? data.sub : "",
  };
}

async function appleIdentity(token: string): Promise<{ email: string; sub: string }> {
  try {
    const { payload } = await jwtVerify(token, await signingKeys("https://appleid.apple.com/auth/keys"), {
      issuer: "https://appleid.apple.com",
      audience: env("APPLE_CLIENT_ID"),
    });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const verified = payload.email_verified === true || payload.email_verified === "true";
    if (sub && (!email || (verified && emailOk(email)))) return { email: emailOk(email) ? email : "", sub };
  } catch {
    throw new PassAuthError("Apple did not confirm this account.");
  }
  throw new PassAuthError("Apple did not confirm this email.");
}

async function appleClientSecret(): Promise<string> {
  const pem = env("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env("APPLE_KEY_ID") })
    .setIssuer(env("APPLE_TEAM_ID"))
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience("https://appleid.apple.com")
    .setSubject(env("APPLE_CLIENT_ID"))
    .sign(key);
}

async function githubIdentity(code: string, redirectUri: string, verifier: string): Promise<{ email: string; sub: string }> {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env("GITHUB_CLIENT_ID"),
      client_secret: env("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const token = (await tokenResponse.json().catch(() => null)) as { access_token?: string } | null;
  if (!tokenResponse.ok || !token?.access_token) throw new PassAuthError("GitHub did not confirm this account.");
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "ScoutRoles",
  };
  const [userResponse, emailResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers }),
  ]);
  const user = (await userResponse.json().catch(() => null)) as { id?: number } | null;
  const emails = (await emailResponse.json().catch(() => null)) as
    | { email?: string; primary?: boolean; verified?: boolean }[]
    | null;
  const sub = typeof user?.id === "number" ? String(user.id) : "";
  const list = Array.isArray(emails) ? emails : [];
  const chosen = list.find((item) => item.primary && item.verified) || list.find((item) => item.verified);
  const email = chosen?.email?.trim().toLowerCase() || "";
  if (!sub || !emailOk(email)) {
    throw new PassAuthError("GitHub did not confirm an email. Verify an email on GitHub and try again.");
  }
  return { email, sub };
}
