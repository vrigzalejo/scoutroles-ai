"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { resumeKind } from "@/lib/resume-file";
import { timeAgo } from "@/lib/text";
import type { ResumeDocument } from "@/lib/resume-pdf";
import type { ResumeFile } from "@/lib/resume-file";
import { STATUS_LABEL, type TrackStatus } from "@/lib/types";

export type Review = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  applyUrl: string;
  source: string;
  sourceHome: string;
  description: string;
  publishedAt: string;
  score: number;
  matched: string[];
  missing: string[];
  reasons: string[];
  status?: TrackStatus;
  letter: string;
  tailored: string;
  note: string;
};

const STATUSES: TrackStatus[] = ["saved", "applied", "interview", "offer", "passed"];

export function Drawer({
  review,
  busy,
  error,
  onClose,
  onLetter,
  onNote,
  onRemember,
  onDraft,
  onGemini,
  onCreatePdf,
  onStatus,
  onRemove,
  hasGemini,
  sourceName,
  resumePdf,
  resumeDocument,
}: {
  review: Review;
  busy: boolean;
  error: string;
  onClose: () => void;
  onLetter: (value: string) => void;
  onNote: (value: string) => void;
  onRemember: (patch: { letter?: string; tailored?: string; note?: string }) => void;
  onDraft: () => void;
  onGemini: () => void;
  onCreatePdf: () => void;
  onStatus: (status: TrackStatus) => void;
  onRemove: () => void;
  hasGemini: boolean;
  sourceName: string;
  resumePdf: ResumeFile | null;
  resumeDocument: ResumeDocument | null;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedResume, setCopiedResume] = useState(false);
  const pdfUrl = useMemo(() => {
    if (!resumePdf || resumeKind(resumePdf) !== "pdf") return "";
    return URL.createObjectURL(new Blob([resumePdf.bytes], { type: "application/pdf" }));
  }, [resumePdf]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(review.letter);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function copyResume() {
    try {
      await navigator.clipboard.writeText(review.tailored);
      setCopiedResume(true);
      window.setTimeout(() => setCopiedResume(false), 1600);
    } catch {
      setCopiedResume(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close role" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto bg-card shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-card/95 px-5 py-4 backdrop-blur">
          <div>
            <p className={`font-serif text-4xl leading-none ${review.score >= 70 ? "text-pine" : "text-clay"}`}>
              {review.score}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">fit</p>
          </div>
          <Button tone="ghost" onClick={onClose}>
            <Icon name="close" />
            Close
          </Button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <div>
            <h2 className="font-serif text-3xl leading-tight text-ink">{review.title}</h2>
            <p className="mt-1 text-sm text-muted">
              {review.company}
              {review.location ? ` · ${review.location}` : ""}
              {review.salary ? ` · ${review.salary}` : ""}
              {review.publishedAt ? ` · ${timeAgo(review.publishedAt)}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={review.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-full bg-pine px-3 py-1.5 text-sm font-medium text-paper">
                <Icon name="external" />
                Open listing
              </a>
              {review.applyUrl !== review.url ? (
                <a href={review.applyUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm">
                  <Icon name="external" />
                  Company form
                </a>
              ) : null}
              <a href={review.sourceHome} target="_blank" rel="noopener" className="self-center text-xs text-muted hover:text-ink">
                via {review.source}
              </a>
            </div>
          </div>

          <ul className="space-y-1 text-sm leading-relaxed text-ink">
            {review.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>

          {review.matched.length || review.missing.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="label">On your resume</p>
                <div className="flex flex-wrap gap-1.5">
                  {review.matched.length ? (
                    review.matched.map((skill) => (
                      <span key={skill} className="rounded-full bg-pine/10 px-2 py-0.5 text-xs text-pine">
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted">No shared skills yet.</span>
                  )}
                </div>
              </div>
              <div>
                <p className="label">Asked for, not on it</p>
                <div className="flex flex-wrap gap-1.5">
                  {review.missing.length ? (
                    review.missing.map((skill) => (
                      <span key={skill} className="rounded-full bg-clay/10 px-2 py-0.5 text-xs text-clay">
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted">Nothing obvious missing.</span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {review.description ? (
            <div>
              <p className="label">Posting</p>
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-paper px-3 py-3 text-sm leading-relaxed text-ink">
                {review.description}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">The original description is not in this tracker entry.</p>
          )}

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="label mb-0">Letter</p>
              <div className="flex flex-wrap gap-2">
                <Button tone="ghost" className="px-3 py-1.5" onClick={onDraft} disabled={busy}>
                  <Icon name="draft" />
                  Plain draft
                </Button>
                <Button tone="primary" className="px-3 py-1.5" onClick={onGemini} disabled={busy || !hasGemini}>
                  <Icon name="spark" />
                  {busy ? "Writing…" : "Gemini draft"}
                </Button>
              </div>
            </div>
            {!hasGemini ? (
              <p className="mb-2 text-xs text-muted">
                Start a free account for included letters. The plain draft works after you sign in.
              </p>
            ) : null}
            <textarea
              value={review.letter}
              onChange={(event) => onLetter(event.target.value)}
              onBlur={(event) => onRemember({ letter: event.target.value })}
              rows={10}
              placeholder="Draft a letter, then edit it before you send anything."
              className="field font-serif leading-relaxed"
            />
            {error && !error.includes("document") ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
            <div className="mt-2">
              <Button tone="ghost" className="px-3 py-1.5" onClick={copy} disabled={!review.letter.trim()}>
                <Icon name={copied ? "check" : "copy"} />
                {copied ? "Copied" : "Copy letter"}
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="label mb-0">Resume for this role</p>
              <Button tone="primary" className="px-3 py-1.5" onClick={onCreatePdf} disabled={busy}>
                <Icon name="document" />
                {busy ? "Writing the document…" : "Generate document"}
              </Button>
            </div>
            <p className="mb-2 text-xs text-muted">
              {hasGemini
                ? `Gemini writes a Word document for this posting from ${sourceName || "your resume"}. Extra work is listed under Additional Experiences.`
                : "Gemini writes this document from your resume. Sign in, or add a Gemini key, before creating it."}
            </p>
            {error.includes("document") ? <p className="mb-2 text-sm text-clay">{error}</p> : null}
            {resumeDocument ? (
              <div className="max-h-[32rem] overflow-auto rounded-2xl border border-line bg-white">
                <ResumeSheet document={resumeDocument} />
              </div>
            ) : pdfUrl ? (
              <iframe title={resumePdf?.name || "Tailored resume"} src={pdfUrl} className="h-[32rem] w-full rounded-2xl border border-line bg-white" />
            ) : resumePdf ? (
              <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                Generate the document again to refresh this preview. The download is still the Word file.
              </p>
            ) : (
              <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                Generate a Word document written for this role, then download it and attach it on the real posting.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                tone="ghost"
                className="px-3 py-1.5"
                disabled={!resumePdf}
                onClick={() => {
                  if (!resumePdf) return;
                  const url = URL.createObjectURL(new Blob([resumePdf.bytes], { type: resumePdf.type }));
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = resumePdf.name || "resume.docx";
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Icon name="download" />
                Download document
              </Button>
              <Button tone="ghost" className="px-3 py-1.5" onClick={copyResume} disabled={!review.tailored.trim()}>
                <Icon name={copiedResume ? "check" : "copy"} />
                {copiedResume ? "Copied" : "Copy text"}
              </Button>
            </div>
          </div>

          <label className="block">
            <span className="label">Note to yourself</span>
            <input
              value={review.note}
              onChange={(event) => onNote(event.target.value)}
              onBlur={(event) => onRemember({ note: event.target.value })}
              placeholder="Referred by Sam, follow up Friday"
              className="field"
            />
          </label>

          <div>
            <p className="label">Tracker</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onStatus(status)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                    review.status === status ? "bg-ink text-paper" : "bg-paper text-ink"
                  }`}
                >
                  <Icon
                    name={status === "saved" ? "bookmark" : status === "applied" ? "check" : status === "interview" ? "eye" : status === "offer" ? "spark" : "close"}
                    className="size-3.5"
                  />
                  {STATUS_LABEL[status]}
                </button>
              ))}
              {review.status ? (
                <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 px-2 text-sm text-muted hover:text-clay">
                  <Icon name="trash" className="size-3.5" />
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Opening the listing does not submit anything. Read the form, attach your resume, and send it there.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResumeSheet({ document }: { document: ResumeDocument }) {
  return (
    <article className="px-6 py-5 font-[Arial,Helvetica,sans-serif] text-[13px] leading-snug text-[#1c201e]">
      <h3 className="text-[22px] leading-tight font-bold">{document.name || "Resume"}</h3>
      {document.headline ? <p className="text-[12px] text-[#215c48]">{document.headline}</p> : null}
      {document.contacts.length ? (
        <p className="mt-1 text-[11px] text-[#5c615e]">{document.contacts.join("   ·   ")}</p>
      ) : null}
      {document.summary ? (
        <SheetSection label="Summary">
          <p>{document.summary}</p>
        </SheetSection>
      ) : null}
      {document.skills.length ? (
        <SheetSection label="Skills">
          <p>{document.skills.join("   ·   ")}</p>
        </SheetSection>
      ) : null}
      {document.sections.map((section) => (
        <SheetSection key={section.heading} label={section.heading}>
          {section.items.map((item, index) => (
            <div key={`${item.title}-${item.when}-${index}`} className="mt-2">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-bold">{[item.title, item.org].filter(Boolean).join(", ")}</p>
                {item.when ? <p className="shrink-0 text-[11px] text-[#5c615e]">{item.when}</p> : null}
              </div>
              {item.bullets.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {item.bullets.map((bullet, bulletIndex) => (
                    <li key={`${bulletIndex}-${bullet}`}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </SheetSection>
      ))}
    </article>
  );
}

function SheetSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h4 className="border-b border-[#c7ccc4] pb-0.5 text-[10px] font-bold tracking-wide text-[#215c48]">{label.toUpperCase()}</h4>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
