"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { PassOffer } from "@/components/pass-offer";
import { PlaceField } from "@/components/place-field";
import { ResumePreview } from "@/components/resume-preview";
import { sampleProfile } from "@/lib/sample";
import type { PassStatus } from "@/lib/pass";
import type { ResumeFile } from "@/lib/resume-file";
import type { Profile } from "@/lib/types";

export function Brief({
  profile,
  onChange,
  onFind,
  onFile,
  resumeFile,
  previewToken,
  onClearFile,
  onAutopilot,
  loading,
  reading,
  autoBusy,
  fileError,
  autoNote,
  pass,
  passNote,
  onSignOut,
  prepareSignOut,
  minFit,
  batch,
  onMinFit,
  onBatch,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onFind: () => void;
  onFile: (file: File) => void;
  resumeFile: ResumeFile | null;
  previewToken: number;
  onClearFile: () => void;
  onAutopilot: () => void;
  loading: boolean;
  reading: boolean;
  autoBusy: boolean;
  fileError: string;
  autoNote: string;
  pass: PassStatus | null;
  passNote: string;
  onSignOut: () => void;
  prepareSignOut: () => Promise<string[]>;
  minFit: number;
  batch: number;
  onMinFit: (value: number) => void;
  onBatch: (value: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(false);
  const seenPreview = useRef(previewToken);

  useEffect(() => {
    if (previewToken === seenPreview.current) return;
    seenPreview.current = previewToken;
    if (previewToken) setPreview(true);
  }, [previewToken]);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    onChange({ ...profile, [key]: value });
  }

  return (
    <aside className="lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
      <form
        className="space-y-4 rounded-3xl border border-line bg-card p-4 shadow-[0_16px_40px_rgba(28,25,21,0.05)]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pass?.active) return;
          onFind();
        }}
      >
        <div>
          <p className="font-serif text-2xl text-ink">Your brief</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Upload a resume and the original file stays on this device, ready to preview. Matching uses the text from it.
          </p>
        </div>

        <label className="block">
          <span className="label">Your name</span>
          <input
            value={profile.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="Alex Rivera"
            className="field"
            autoComplete="name"
          />
        </label>

        <label className="block">
          <span className="label">Target roles</span>
          <input
            value={profile.roles}
            onChange={(event) => set("roles", event.target.value)}
            placeholder="frontend engineer, product designer"
            className="field"
          />
        </label>

        <PlaceField value={profile.location} onChange={(location) => set("location", location)} />

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={profile.remoteOnly}
            onChange={(event) => set("remoteOnly", event.target.checked)}
            className="size-4 accent-pine"
          />
          Remote roles only
        </label>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="label mb-0">Resume</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-pine underline-offset-2 hover:underline"
              onClick={() => {
                onClearFile();
                onChange({
                  ...profile,
                  name: profile.name || sampleProfile.name,
                  roles: profile.roles || sampleProfile.roles,
                  location: profile.location || sampleProfile.location,
                  resume: sampleProfile.resume,
                });
              }}
            >
              <Icon name="sample" className="size-3.5" />
              Use a sample
            </button>
          </div>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              const file = event.dataTransfer.files?.[0];
              if (file) onFile(file);
            }}
            className={dragOver ? "rounded-2xl ring-2 ring-pine/20" : ""}
          >
            {resumeFile ? (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-line bg-paper px-3 py-2">
                <p className="min-w-0 truncate text-sm text-ink">{resumeFile.name}</p>
                <Button tone="primary" className="px-3 py-1.5" onClick={() => setPreview(true)}>
                  <Icon name="eye" />
                  Preview
                </Button>
              </div>
            ) : null}
            {resumeFile ? (
              <details className="rounded-2xl border border-line bg-paper px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-ink">Text used for matching</summary>
                <textarea
                  value={profile.resume}
                  onChange={(event) => set("resume", event.target.value)}
                  placeholder="Paste the text of your resume."
                  rows={8}
                  className="field mt-2 min-h-40 resize-y font-serif leading-relaxed"
                />
              </details>
            ) : (
              <textarea
                value={profile.resume}
                onChange={(event) => set("resume", event.target.value)}
                placeholder="Paste the text of your resume."
                rows={9}
                className="field min-h-48 resize-y font-serif leading-relaxed"
              />
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button tone="ghost" className="px-3 py-1.5 text-xs" onClick={() => input.current?.click()}>
              <Icon name="upload" />
              {reading ? "Reading file…" : "Upload PDF, Word, or text"}
            </Button>
            {profile.resume || resumeFile ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
                onClick={() => {
                  set("resume", "");
                  onClearFile();
                }}
              >
                <Icon name="clear" className="size-3.5" />
                Clear
              </button>
            ) : null}
            <input
              ref={input}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onFile(file);
              }}
            />
          </div>
          {fileError ? <p className="mt-2 text-sm text-clay">{fileError}</p> : null}
        </div>

        {pass && !pass.gemini ? (
          <details className="rounded-2xl border border-line bg-paper px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Optional free Gemini key
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              The server key is not set, so a key from Google AI Studio can write the letter from this browser.
              It stays on this device and is sent only to Google.
            </p>
            <input
              value={profile.geminiKey}
              onChange={(event) => set("geminiKey", event.target.value)}
              placeholder="AIza…"
              type="password"
              autoComplete="off"
              className="field mt-2"
              spellCheck={false}
            />
          </details>
        ) : null}

        <PassOffer
          pass={pass}
          note={passNote}
          onSignOut={onSignOut}
          prepareSignOut={prepareSignOut}
        />

        <Button tone="primary" type="submit" className="w-full py-2.5" disabled={loading || autoBusy || !pass?.active}>
          <Icon name="rank" />
          {loading ? "Checking public boards…" : "Rank open roles"}
        </Button>
        {!pass?.active ? (
          <p className="-mt-2 text-xs leading-relaxed text-muted">Start a free account to search roles.</p>
        ) : null}

        <div className="space-y-3 rounded-2xl bg-paper px-3 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Autopilot</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Writes a letter and a resume for each strong match, then opens the postings one at a time.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">Minimum fit</span>
              <input
                type="number"
                min={0}
                max={96}
                value={minFit}
                onChange={(event) => onMinFit(Number(event.target.value))}
                className="field"
              />
            </label>
            <label className="block">
              <span className="label">How many</span>
              <input
                type="number"
                min={1}
                max={15}
                value={batch}
                onChange={(event) => onBatch(Number(event.target.value))}
                className="field"
              />
            </label>
          </div>
          <Button tone="primary" className="w-full" disabled={loading || autoBusy || !pass?.active} onClick={onAutopilot}>
            <Icon name="play" />
            {autoBusy ? "Preparing matches…" : "Run autopilot"}
          </Button>
          {autoNote ? <p className="text-xs leading-relaxed text-clay">{autoNote}</p> : null}
        </div>
      </form>
      {preview && resumeFile ? <ResumePreview file={resumeFile} onClose={() => setPreview(false)} /> : null}
    </aside>
  );
}
