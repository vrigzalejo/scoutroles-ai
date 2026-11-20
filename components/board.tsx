"use client";

import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { hue, initials, timeAgo } from "@/lib/text";
import { STATUS_LABEL, type ScoredJob, type SourceReport, type Tracked } from "@/lib/types";

export function Board({
  started,
  loading,
  error,
  sampleMode,
  reports,
  fetchedAt,
  jobs,
  hasMore,
  onMore,
  total,
  filter,
  source,
  sources,
  minScore,
  tracked,
  hasResume,
  onFilter,
  onSource,
  onMinScore,
  onRefresh,
  onOpen,
  onSave,
}: {
  started: boolean;
  loading: boolean;
  error: string;
  sampleMode: boolean;
  reports: SourceReport[];
  fetchedAt: string;
  jobs: ScoredJob[];
  hasMore: boolean;
  onMore: () => void;
  total: number;
  filter: string;
  source: string;
  sources: { name: string; count: number }[];
  minScore: number;
  tracked: Record<string, Tracked>;
  hasResume: boolean;
  onFilter: (value: string) => void;
  onSource: (value: string) => void;
  onMinScore: (value: number) => void;
  onRefresh: () => void;
  onOpen: (job: ScoredJob) => void;
  onSave: (job: ScoredJob) => void;
}) {
  if (!started && !loading) {
    return (
      <section id="results" className="rise rounded-3xl border border-line bg-card px-6 py-8">
        <p className="font-serif text-4xl leading-tight text-ink sm:text-5xl">
          Find the roles that actually fit, then apply on the real posting.
        </p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["01", "Add a resume", "Paste it, drop a PDF or Word file, or try the sample. Scoring stays on this device."],
            ["02", "Rank the boards", "Start a free account, then search public feeds from Remotive, Greenhouse, Ashby, and others."],
            ["03", "Draft and send", "Write a short letter, open the listing, and track what you did."],
          ].map(([step, title, copy]) => (
            <li key={step} className="rounded-2xl bg-paper px-4 py-4">
              <p className="font-serif text-clay">{step}</p>
              <p className="mt-2 font-medium text-ink">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{copy}</p>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section id="results" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl text-ink">
            {loading ? "Looking through the boards" : `${total} roles`}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {loading
              ? "Public feeds only. This can take a few seconds."
              : `${jobs.length} shown of ${total}${fetchedAt ? ` · pulled ${timeAgo(fetchedAt)}` : ""}`}
          </p>
        </div>
        <Button tone="ghost" onClick={onRefresh} disabled={loading}>
          <Icon name="refresh" />
          Refresh listings
        </Button>
      </div>

      {error ? <p className="rounded-2xl bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}
      {sampleMode ? (
        <p className="rounded-2xl border border-clay/30 bg-clay/10 px-4 py-3 text-sm text-ink">
          The boards did not answer, so these examples are standing in. Refresh in a minute for live listings.
        </p>
      ) : null}
      {!hasResume && started ? (
        <p className="rounded-2xl bg-paper px-4 py-3 text-sm text-muted">
          Add a resume and the order will follow your skills, not just the titles you typed.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
          placeholder="Filter by title, company, or skill"
          className="field max-w-sm"
        />
        <label className="sr-only" htmlFor="job-source">
          Board
        </label>
        <select
          id="job-source"
          value={source}
          onChange={(event) => onSource(event.target.value)}
          className="field w-auto max-w-full rounded-full py-1.5 pr-8 text-sm"
        >
          <option value="">All boards</option>
          {sources.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name} ({item.count})
            </option>
          ))}
        </select>
        {[
          [0, "All"],
          [45, "Promising"],
          [70, "Strong"],
        ].map(([value, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => onMinScore(Number(value))}
            className={`rounded-full px-3 py-1.5 text-sm ${
              minScore === value ? "bg-ink text-paper" : "bg-card text-muted ring-1 ring-line"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {reports.length ? (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          <span>Feeds</span>
          {reports.map((report) => (
            <a key={report.name} href={report.home} target="_blank" rel="noopener" className="hover:text-ink">
              {report.name}
              {report.ok ? ` ${report.count}` : ` unavailable${report.error ? ` (${report.error})` : ""}`}
            </a>
          ))}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-3xl bg-line/70" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          {source
            ? `Nothing from ${source} cleared that bar.`
            : "Nothing cleared that bar. Clear the filter or ask for all matches."}
        </p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((item) => {
            const saved = tracked[item.job.id];
            return (
              <li key={item.job.id} className="rounded-3xl border border-line bg-card p-4">
                <div className="flex gap-4">
                  <div className="w-14 shrink-0 text-center">
                    <p
                      className={`font-serif text-4xl leading-none ${
                        item.score >= 70 ? "text-pine" : item.score >= 45 ? "text-clay" : "text-muted"
                      }`}
                    >
                      {item.score}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted">fit</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <span
                        className="grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold text-paper"
                        style={{ backgroundColor: `hsl(${hue(item.job.company)} 28% 32%)` }}
                        aria-hidden
                      >
                        {initials(item.job.company)}
                      </span>
                      <div className="min-w-0">
                        <a
                          href={item.job.url}
                          target="_blank"
                          rel="noopener"
                          className="font-serif text-xl leading-tight text-ink hover:underline"
                        >
                          {item.job.title}
                        </a>
                        <p className="mt-0.5 text-sm text-muted">
                          {item.job.company}
                          {item.job.location ? ` · ${item.job.location}` : ""}
                          {item.job.salary ? ` · ${item.job.salary}` : ""}
                          {item.job.publishedAt ? ` · ${timeAgo(item.job.publishedAt)}` : ""}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-ink/80">
                      {item.reasons[0]}
                    </p>
                    {item.matched.length ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {item.matched.slice(0, 6).map((skill) => (
                          <li key={skill} className="rounded-full bg-pine/10 px-2 py-0.5 text-xs text-pine">
                            {skill}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button tone="primary" className="px-3 py-1.5" onClick={() => onOpen(item)}>
                        <Icon name="eye" />
                        Review
                      </Button>
                      {saved ? (
                        <button
                          type="button"
                          onClick={() => onOpen(item)}
                          className="rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink"
                        >
                          {STATUS_LABEL[saved.status]}
                        </button>
                      ) : (
                        <Button tone="ghost" className="px-3 py-1.5" onClick={() => onSave(item)}>
                          <Icon name="bookmark" />
                          Save
                        </Button>
                      )}
                      <a
                        href={item.job.sourceHome}
                        target="_blank"
                        rel="noopener"
                        className="text-xs text-muted hover:text-ink"
                      >
                        {item.job.source}
                      </a>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && !loading ? (
        <Button tone="ghost" onClick={onMore}>
          <Icon name="chevron" />
          Show more
        </Button>
      ) : null}
      <p className="text-xs leading-relaxed text-muted">
        Listings belong to the boards that published them. Each card links back to that board.
      </p>
    </section>
  );
}
