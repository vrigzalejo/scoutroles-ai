"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icon";

export function PlaceField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const [places, setPlaces] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const focused = useRef(false);
  const skip = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);

  function lookup(query: string) {
    request.current?.abort();
    if (query.trim().length < 2) {
      setPlaces([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    void fetch(`/api/places?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as { places?: string[]; error?: string } | null;
        if (!response.ok) throw new Error(data?.error || "Could not look up places.");
        if (!focused.current) return;
        const next = data?.places ?? [];
        setPlaces(next);
        setActive(0);
        setOpen(next.length > 0);
        setError("");
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        if (focused.current) setError(cause instanceof Error ? cause.message : "Could not look up places.");
      });
  }

  useEffect(() => {
    if (!focused.current || skip.current) {
      skip.current = false;
      return;
    }
    const timer = window.setTimeout(() => lookup(value), 300);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function choose(place: string) {
    skip.current = true;
    onChange(place);
    setPlaces([]);
    setOpen(false);
    setError("");
  }

  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("This browser cannot read the current location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        void fetch(`/api/places?lat=${latitude}&lon=${longitude}`)
          .then(async (response) => {
            const data = (await response.json().catch(() => null)) as { places?: string[]; error?: string } | null;
            if (!response.ok || !data?.places?.[0]) {
              throw new Error(data?.error || "Could not name the current location.");
            }
            choose(data.places[0]);
          })
          .catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : "Could not name the current location.");
          })
          .finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        setError("Location access was blocked. Type a city instead.");
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 },
    );
  }

  return (
    <div ref={box}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="label mb-0">Places</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-pine underline-offset-2 hover:underline disabled:opacity-60"
          onClick={locate}
          disabled={locating}
        >
          <Icon name="pin" className="size-3.5" />
          {locating ? "Finding…" : "Use current location"}
        </button>
      </div>
      <div className="relative">
        <input
          value={value}
          onChange={(event) => {
            setError("");
            onChange(event.target.value);
          }}
          onFocus={() => {
            focused.current = true;
            if (places.length) setOpen(true);
            else lookup(value);
          }}
          onBlur={() => {
            focused.current = false;
          }}
          onKeyDown={(event) => {
            if (!open || !places.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => (index + 1) % places.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => (index - 1 + places.length) % places.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(places[active] ?? places[0]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Austin, Berlin"
          className="field"
          role="combobox"
          aria-label="Places"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
        />
        {open && places.length ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-line bg-card py-1 shadow-[0_16px_40px_rgba(28,25,21,0.08)]"
          >
            {places.map((place, index) => (
              <li key={place} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm ${index === active ? "bg-paper text-ink" : "text-ink"}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(place)}
                >
                  {place}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs leading-relaxed text-clay">{error}</p> : null}
    </div>
  );
}
