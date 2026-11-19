"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import type { Review } from "@/components/drawer";

export function Autopilot({
  items,
  index,
  onLetter,
  onOpen,
  onSent,
  onSkip,
  onStop,
}: {
  items: Review[];
  index: number;
  onLetter: (letter: string) => void;
  onOpen: () => Promise<boolean>;
  onSent: () => void;
  onSkip: () => void;
  onStop: () => void;
}) {
  const item = items[index];
  const [opened, setOpened] = useState(false);
  const [copyNote, setCopyNote] = useState("");
  if (!item) return null;

  async function open() {
    const copied = await onOpen();
    setOpened(true);
    setCopyNote(copied ? "Letter copied. The posting is open in a new tab." : "The posting is open. Copy the letter below if the clipboard was blocked.");
  }

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-ink/45" aria-label="Stop autopilot" onClick={onStop} />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92vh] w-full max-w-xl flex-col overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:inset-y-8 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-clay">
              Autopilot {index + 1} of {items.length}
            </p>
            <h2 className="mt-1 font-serif text-3xl leading-tight text-ink">{item.title}</h2>
            <p className="mt-1 text-sm text-muted">
              {item.company}
              {item.location ? ` · ${item.location}` : ""}
              {item.score ? ` · fit ${item.score}` : ""}
            </p>
          </div>
          <Button tone="ghost" onClick={onStop}>
            <Icon name="stop" />
            Stop
          </Button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted">
          The letter is ready. Open the posting, paste it, and send the form there. This page cannot fill another site’s application.
        </p>

        <textarea
          value={item.letter}
          onChange={(event) => onLetter(event.target.value)}
          rows={9}
          className="field mt-3 font-serif leading-relaxed"
        />
        {copyNote ? <p className="mt-2 text-sm text-pine">{copyNote}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button tone="primary" onClick={() => void open()}>
            <Icon name="external" />
            Copy letter and open posting
          </Button>
          <Button tone="ghost" onClick={onSent} disabled={!opened}>
            <Icon name="check" />
            I sent it
          </Button>
          <Button tone="quiet" onClick={onSkip}>
            <Icon name="skip" />
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
