import { Suspense } from "react";
import { ClaimPass } from "@/components/claim-pass";

async function Claim({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  return <ClaimPass sessionId={params.session_id ?? ""} />;
}

export default function PassPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
          <p className="flex items-center gap-3 font-serif text-4xl text-ink">
            <img src="/logo.svg" alt="" width={44} height={44} className="size-11" />
            ScoutRoles
          </p>
          <h1 className="mt-4 font-serif text-3xl text-ink">Opening your pass</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">Checking the payment.</p>
        </main>
      }
    >
      <Claim searchParams={searchParams} />
    </Suspense>
  );
}
