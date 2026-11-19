"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/button";
import { resumeKind, type ResumeFile } from "@/lib/resume-file";

export function ResumePreview({ file, onClose }: { file: ResumeFile; onClose: () => void }) {
  const kind = resumeKind(file);
  const box = useRef<HTMLDivElement>(null);
  const [drawError, setDrawError] = useState("");
  const pdfUrl = useMemo(() => {
    if (kind !== "pdf") return "";
    return URL.createObjectURL(new Blob([file.bytes], { type: "application/pdf" }));
  }, [file, kind]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (kind !== "docx" || !box.current) return;
    let cancel = false;
    const target = box.current;
    setDrawError("");
    void import("docx-preview")
      .then(({ renderAsync }) => {
        if (cancel) return;
        target.replaceChildren();
        return renderAsync(file.bytes, target, target, {
          inWrapper: true,
          ignoreWidth: true,
          breakPages: true,
          useBase64URL: true,
        });
      })
      .catch(() => {
        if (!cancel) setDrawError("Could not draw this Word file. Download it to open the original.");
      });
    return () => {
      cancel = true;
    };
  }, [file, kind]);

  function download() {
    const blob = new Blob([file.bytes], { type: file.type || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name || "resume";
    link.click();
    URL.revokeObjectURL(url);
  }

  const text = kind === "text" ? new TextDecoder().decode(file.bytes) : "";

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close preview" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${file.name}`}
        className="absolute inset-3 flex flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-2xl md:inset-8"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{file.name}</p>
            <p className="text-xs text-muted">Original file on this device. Links open from this preview.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button tone="ghost" className="px-3 py-1.5" onClick={download}>
              Download
            </Button>
            <Button tone="ghost" className="px-3 py-1.5" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-paper">
          {kind === "pdf" ? (
            <iframe title={file.name} src={pdfUrl} className="h-full min-h-[70vh] w-full bg-white" />
          ) : null}
          {kind === "docx" ? <div ref={box} className="min-h-full bg-white" /> : null}
          {kind === "doc" ? (
            <p className="mx-auto max-w-md px-6 py-16 text-center text-sm leading-relaxed text-muted">
              This older Word file is saved as you uploaded it. Download it to open the original layout and links.
            </p>
          ) : null}
          {kind === "text" ? (
            <pre className="whitespace-pre-wrap px-6 py-5 font-serif text-sm leading-relaxed text-ink">{text}</pre>
          ) : null}
          {drawError ? <p className="px-6 py-4 text-sm text-clay">{drawError}</p> : null}
        </div>
      </div>
    </div>
  );
}
