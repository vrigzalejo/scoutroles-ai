"use client";

import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { timeAgo } from "@/lib/text";
import { STATUS_LABEL, STATUS_ORDER, type Tracked, type TrackStatus } from "@/lib/types";

export function Tracker({
  entries,
  onOpen,
  onRemove,
}: {
  entries: Tracked[];
  onOpen: (entry: Tracked) => void;
  onRemove: (id: string) => void;
}) {
  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: entries
      .filter((entry) => entry.status === status)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
  })).filter((group) => group.items.length);

  if (!entries.length) {
    return (
      <section className="rounded-3xl border border-dashed border-line bg-card px-6 py-12 text-center">
        <h2 className="font-serif text-3xl text-ink">Nothing tracked yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          Save a role from the ranked list, or open a pasted post. The letter and the posting stay in this browser.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-serif text-3xl text-ink">Tracker</h2>
        <p className="mt-1 text-sm text-muted">
          {entries.length} {entries.length === 1 ? "role" : "roles"} on this device
        </p>
      </div>
      {groups.map((group) => (
        <div key={group.status}>
          <h3 className="label">{STATUS_LABEL[group.status as TrackStatus]}</h3>
          <ul className="space-y-2">
            {group.items.map((entry) => (
              <li key={entry.id} className="rounded-2xl border border-line bg-card px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-serif text-xl text-ink">{entry.title}</p>
                    <p className="text-sm text-muted">
                      {entry.company}
                      {entry.source === "Pasted" ? " · Pasted post" : ""}
                      {entry.score ? ` · fit ${entry.score}` : ""}
                      {entry.updatedAt ? ` · ${timeAgo(entry.updatedAt)}` : ""}
                    </p>
                    {entry.note ? <p className="mt-1 text-sm text-ink/80">{entry.note}</p> : null}
                  </div>
                  <div className="flex gap-2">
                    <Button tone="primary" className="px-3 py-1.5" onClick={() => onOpen(entry)}>
                      <Icon name="arrow" />
                      Open
                    </Button>
                    <Button tone="ghost" className="px-3 py-1.5" onClick={() => onRemove(entry.id)}>
                      <Icon name="trash" />
                      Remove
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
