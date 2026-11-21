"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { scoreJob } from "@/lib/match";
import { jobFromPaste, readPaste } from "@/lib/paste-job";
import { timeAgo } from "@/lib/text";
import type { Profile, ScoredJob, Tracked } from "@/lib/types";

export function PastePost({
  profile,
  saved,
  onOpen,
  onOpenSaved,
}: {
  profile: Profile;
  saved: Tracked[];
  onOpen: (job: ScoredJob) => void;
  onOpenSaved: (entry: Tracked) => void;
}) {
  const [posting, setPosting] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState({ title: false, company: false, location: false, url: false });
  const [error, setError] = useState("");

  function onPosting(value: string) {
    setPosting(value);
    setError("");
    const read = readPaste(value);
    if (!touched.title) setTitle(read.title);
    if (!touched.company) setCompany(read.company);
    if (!touched.location) setLocation(read.location);
    if (!touched.url) setUrl(read.url);
  }

  function open() {
    const description = posting.trim();
    if (description.length < 40) {
      setError("Paste the job post. A title line alone is not enough.");
      return;
    }
    if (!title.trim() || !company.trim()) {
      setError("Add the title and company from the post. Those names are not guessed when the paste does not include them.");
      return;
    }
    if (profile.resume.trim().length <= 40) {
      setError("Add a resume first. The letter and document stay tied to that text.");
      return;
    }
    setError("");
    onOpen(
      scoreJob(
        jobFromPaste({
          title,
          company,
          location,
          url,
          description,
        }),
        profile,
      ),
    );
  }

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-[0_16px_40px_rgba(28,25,21,0.05)]">
      <h2 className="font-serif text-2xl text-ink">Paste a job post</h2>
      <p className="mt-1 text-sm text-muted">
        Copy the posting from the company page. The letter and the resume use that text and your resume. Nothing is sent until you ask for a draft.
      </p>
      <label className="mt-3 block">
        <span className="label">Job post</span>
        <textarea
          value={posting}
          onChange={(event) => onPosting(event.target.value)}
          rows={6}
          placeholder="Paste the title, company, and the full posting."
          className="field font-serif leading-relaxed"
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Title</span>
          <input
            value={title}
            onChange={(event) => {
              setTouched((current) => ({ ...current, title: true }));
              setTitle(event.target.value);
            }}
            placeholder="Frontend engineer"
            className="field"
          />
        </label>
        <label>
          <span className="label">Company</span>
          <input
            value={company}
            onChange={(event) => {
              setTouched((current) => ({ ...current, company: true }));
              setCompany(event.target.value);
            }}
            placeholder="Northwind"
            className="field"
          />
        </label>
        <label>
          <span className="label">Location</span>
          <input
            value={location}
            onChange={(event) => {
              setTouched((current) => ({ ...current, location: true }));
              setLocation(event.target.value);
            }}
            placeholder="Remote"
            className="field"
          />
        </label>
        <label>
          <span className="label">Listing link</span>
          <input
            value={url}
            onChange={(event) => {
              setTouched((current) => ({ ...current, url: true }));
              setUrl(event.target.value);
            }}
            placeholder="https://"
            className="field"
          />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      <div className="mt-3">
        <Button tone="primary" onClick={open}>
          <Icon name="draft" />
          Open this post
        </Button>
      </div>
      {saved.length ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="label">Saved posts</p>
          <ul className="space-y-2">
            {saved.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-sm text-ink">
                  {entry.title}
                  <span className="text-muted">
                    {" "}
                    · {entry.company}
                    {entry.updatedAt ? ` · ${timeAgo(entry.updatedAt)}` : ""}
                  </span>
                </p>
                <Button tone="ghost" className="px-3 py-1.5" onClick={() => onOpenSaved(entry)}>
                  View post
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
