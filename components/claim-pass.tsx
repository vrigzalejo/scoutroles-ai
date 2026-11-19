"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import type { PassStatus } from "@/lib/pass";

export function ClaimPass({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<PassStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setError("That checkout session is missing.");
      return;
    }
    let stop = false;
    void fetch("/api/pass/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as (PassStatus & { error?: string }) | null;
        if (stop) return;
        if (!response.ok || !data?.active) {
          setError(data?.error || "Could not open that pass.");
          return;
        }
        setStatus(data);
      })
      .catch(() => {
        if (!stop) setError("Could not open that pass.");
      });
    return () => {
      stop = true;
    };
  }, [sessionId]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <p className="flex items-center gap-3 font-serif text-4xl text-ink">
        <img src="/logo.svg" alt="" width={44} height={44} className="size-11" />
        ScoutRoles
      </p>
      {status?.active ? (
        <>
          <h1 className="mt-4 font-serif text-3xl text-ink">Your account is on</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Gemini letters are included, and the tracker for this account is saved on this server.
          </p>
        </>
      ) : error ? (
        <>
          <h1 className="mt-4 font-serif text-3xl text-ink">The pass did not open</h1>
          <p className="mt-3 text-sm leading-relaxed text-clay">{error}</p>
        </>
      ) : (
        <>
          <h1 className="mt-4 font-serif text-3xl text-ink">Opening your pass</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">Checking the payment.</p>
        </>
      )}
      <Button tone="primary" className="mt-6 w-fit" onClick={() => (window.location.href = "/")}>
        Back to roles
      </Button>
    </main>
  );
}
