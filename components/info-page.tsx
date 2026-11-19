import type { ReactNode } from "react";
import Link from "next/link";

export function InfoPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <article className="mx-auto w-full max-w-2xl px-5 py-10">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <img src="/logo.svg?v=2" alt="" width={36} height={36} className="size-9" />
          <span className="font-serif text-xl tracking-tight">ScoutRoles</span>
        </Link>
        <h1 className="mt-8 font-serif text-4xl tracking-tight text-ink">{title}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">{lede}</p>
        <div className="mt-8 space-y-8">{children}</div>
      </article>
    </main>
  );
}

export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-2xl text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}
