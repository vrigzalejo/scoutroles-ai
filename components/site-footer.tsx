import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="shrink-0 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-end gap-1 px-4 py-3 text-sm">
        <nav className="flex gap-4 text-muted">
          <Link href="/help" className="underline decoration-line underline-offset-4 hover:text-pine">
            How to use
          </Link>
          <Link href="/privacy" className="underline decoration-line underline-offset-4 hover:text-pine">
            Privacy
          </Link>
        </nav>
        <p className="text-muted">
          © 2026 ScoutRoles by{" "}
          <a
            href="https://www.brigidoalejo.com/"
            target="_blank"
            rel="noopener"
            className="font-medium text-ink underline decoration-line underline-offset-4 hover:text-pine"
          >
            Brigido Alejo
          </a>
        </p>
      </div>
    </footer>
  );
}
