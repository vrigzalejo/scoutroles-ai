"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { SIGN_IN_PROVIDERS, type OAuthProvider, type PassStatus } from "@/lib/pass";

const providerCopy: Record<(typeof SIGN_IN_PROVIDERS)[number], string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
};

function ProviderIcon({ id }: { id: OAuthProvider }) {
  if (id === "google") {
    return (
      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.33A9 9 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.98 10.72A5.4 5.4 0 0 1 3.7 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.02-2.33z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M8 0a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.6-1-2.6-1-.4-.9-.9-1.1-.9-1.1-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.7 7.7 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.5.8 1.3.8 2.1 0 3-1.9 3.7-3.6 3.9.3.2.5.7.5 1.4v2.1c0 .2.1.5.5.4A8 8 0 0 0 8 0z"
      />
    </svg>
  );
}

const providerLabel: Record<OAuthProvider, string> = {
  google: "Google",
  microsoft: "Microsoft",
  apple: "Apple",
  github: "GitHub",
};

const signInNote: Record<string, string> = {
  "google-setup": "Google needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.",
  "github-setup": "GitHub needs GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env.local.",
  denied: "The sign-in was cancelled.",
  expired: "The sign-in session expired. Try again.",
  failed: "That sign-in could not be confirmed. Try again.",
  "invalid-client": "That provider rejected the client secret. Paste the current secret for this same client ID, then restart the dev server.",
  redirect: "The callback URL is not registered. Add http://localhost:3000/api/pass/oauth/callback for this app.",
  "invalid-grant": "The login code was rejected. Use the button again.",
  unconfirmed: "That account did not share an email address.",
  token: "That provider’s signed login could not be checked. Try again.",
  "client-id": "The client ID in .env.local does not match the account that was returned.",
  clock: "This computer’s clock is too far from the provider’s. Correct the clock and try again.",
};

export function PassOffer({
  pass,
  note,
  onSignOut,
  prepareSignOut,
}: {
  pass: PassStatus | null;
  note: string;
  onSignOut: () => void;
  prepareSignOut: () => Promise<string[]>;
}) {
  const [signIn, setSignIn] = useState("");
  const [checking, setChecking] = useState(false);
  const [logoutReasons, setLogoutReasons] = useState<string[] | null>(null);

  useEffect(() => {
    if (!logoutReasons) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLogoutReasons(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [logoutReasons]);

  async function startSignOut() {
    if (checking) return;
    setChecking(true);
    try {
      const reasons = await prepareSignOut();
      if (reasons.length) setLogoutReasons(reasons);
      else onSignOut();
    } catch {
      setLogoutReasons(["Logging out removes the resume and tracker stored on this device."]);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("sign-in") || "";
    if (!code) return;
    setSignIn(signInNote[code] || signInNote.failed);
    const url = new URL(window.location.href);
    url.searchParams.delete("sign-in");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", next);
  }, []);

  const signedInWith = pass?.provider ? providerLabel[pass.provider] : "this account";
  const message = signIn || note;

  return (
    <section className="rounded-2xl border border-line bg-paper px-3 py-3">
      <p className="text-sm font-medium text-ink">Free account</p>
      {pass?.active ? (
        <>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Signed in with {signedInWith} as {pass.email}. The resume and tracker saved here stay with this account.
          </p>
          <Button tone="ghost" className="mt-3 w-full" onClick={() => void startSignOut()} disabled={checking}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.5 2.75H3.75a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1H6.5M6.25 8h7M11 5.25 13.75 8 11 10.75"
              />
            </svg>
            Log out
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Sign in with Google or GitHub. Only that account can open the resume and tracker saved for it.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {SIGN_IN_PROVIDERS.map((id) => (
              <a
                key={id}
                href={`/api/pass/oauth/${id}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-card px-3.5 py-2 text-sm font-medium text-ink transition hover:border-pine/40"
              >
                <ProviderIcon id={id} />
                {providerCopy[id]}
              </a>
            ))}
          </div>
        </>
      )}
      {message ? <p className="mt-2 text-xs leading-relaxed text-clay">{message}</p> : null}
      {logoutReasons ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Stay signed in" onClick={() => setLogoutReasons(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            className="relative w-full max-w-sm rounded-3xl border border-line bg-card p-5 shadow-2xl"
          >
            <h2 id="logout-title" className="font-medium text-ink">Log out?</h2>
            <div className="mt-2 space-y-2">
              {logoutReasons.map((reason) => (
                <p key={reason} className="text-sm leading-relaxed text-muted">{reason}</p>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button tone="ghost" onClick={() => setLogoutReasons(null)}>Stay signed in</Button>
              <Button
                tone="primary"
                onClick={() => {
                  setLogoutReasons(null);
                  onSignOut();
                }}
              >
                Log out
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
