"use client";

import { useEffect, useMemo, useState } from "react";
import { Autopilot } from "@/components/autopilot";
import { Icon } from "@/components/icon";
import { Board } from "@/components/board";
import { Brief } from "@/components/brief";
import { Drawer, type Review } from "@/components/drawer";
import { Tracker } from "@/components/tracker";
import { geminiLetter, geminiResumeDocument, geminiTailored, localLetter, localTailored } from "@/lib/letter";
import { scoreJobs, scorePreparedResume } from "@/lib/match";
import type { PassStatus } from "@/lib/pass";
import { briefFromResume } from "@/lib/resume-brief";
import {
  clearJobResumes,
  clearResumeFile,
  countJobResumes,
  loadJobResume,
  loadResumeFile,
  resumeBase64,
  resumeKind,
  saveJobResume,
  saveResumeFile,
  type ResumeFile,
} from "@/lib/resume-file";
import { renderResumeDocx } from "@/lib/resume-docx";
import {
  keepContacts,
  keepResumeSkills,
  parseResumeDocument,
  resumePdfName,
  resumePlainText,
  type ResumeDocument,
} from "@/lib/resume-pdf";
import { sampleJobs } from "@/lib/sample";
import {
  getProfile,
  getTracker,
  removeTracked,
  replaceProfile,
  replaceTracker,
  setProfileCloudSync,
  setTrackerCloudSync,
  updateProfile,
  upsertTracked,
  useProfile,
  useTracker,
} from "@/lib/storage";
import { mergeTrackers } from "@/lib/tracker-merge";
import { emptyProfile, type Job, type JobsPayload, type Profile, type ScoredJob, type TrackStatus, type Tracked } from "@/lib/types";

function reviewFromScored(item: ScoredJob, saved?: Tracked): Review {
  return {
    id: item.job.id,
    title: item.job.title,
    company: item.job.company,
    location: item.job.location,
    salary: item.job.salary,
    url: item.job.url,
    applyUrl: item.job.applyUrl,
    source: item.job.source,
    sourceHome: item.job.sourceHome,
    description: item.job.description,
    publishedAt: item.job.publishedAt,
    score: item.score,
    matched: item.matched,
    missing: item.missing,
    reasons: item.reasons,
    status: saved?.status,
    letter: saved?.letter ?? "",
    tailored: saved?.tailored ?? "",
    note: saved?.note ?? "",
  };
}

function reviewFromTracked(entry: Tracked): Review {
  return {
    id: entry.id,
    title: entry.title,
    company: entry.company,
    location: entry.location,
    salary: entry.salary,
    url: entry.url,
    applyUrl: entry.applyUrl || entry.url,
    source: entry.source,
    sourceHome: entry.sourceHome,
    description: entry.description,
    publishedAt: "",
    score: entry.score,
    matched: entry.matched,
    missing: entry.missing,
    reasons: entry.reasons,
    status: entry.status,
    letter: entry.letter,
    tailored: entry.tailored ?? "",
    note: entry.note,
  };
}

function toScored(review: Review): ScoredJob {
  const job: Job = {
    id: review.id,
    title: review.title,
    company: review.company,
    location: review.location,
    remote: true,
    salary: review.salary,
    description: review.description,
    tags: [],
    url: review.url,
    applyUrl: review.applyUrl,
    source: "Sample",
    sourceHome: review.sourceHome,
    publishedAt: review.publishedAt,
  };
  return {
    job,
    score: review.score,
    matched: review.matched,
    missing: review.missing,
    reasons: review.reasons,
  };
}

const EMPTY_JOBS: Job[] = [];

function toTracked(review: Review, status: TrackStatus): Tracked {
  return {
    id: review.id,
    title: review.title,
    company: review.company,
    location: review.location,
    url: review.url,
    applyUrl: review.applyUrl,
    source: review.source,
    sourceHome: review.sourceHome,
    salary: review.salary,
    description: review.description,
    score: review.score,
    matched: review.matched,
    missing: review.missing,
    reasons: review.reasons,
    status,
    letter: review.letter,
    tailored: review.tailored,
    note: review.note,
    updatedAt: new Date().toISOString(),
  };
}

export function Workspace() {
  const profile = useProfile();
  const tracker = useTracker();
  const [view, setView] = useState<"roles" | "tracker">("roles");
  const [payload, setPayload] = useState<JobsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [filter, setFilter] = useState("");
  const [source, setSource] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [limit, setLimit] = useState(24);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftWait, setDraftWait] = useState("");
  const [letterError, setLetterError] = useState("");
  const [minFit, setMinFit] = useState(70);
  const [batch, setBatch] = useState(5);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoNote, setAutoNote] = useState("");
  const [run, setRun] = useState<Review[] | null>(null);
  const [runIndex, setRunIndex] = useState(0);
  const [resumeFile, setResumeFile] = useState<ResumeFile | null>(null);
  const [jobPdf, setJobPdf] = useState<{ id: string; file: ResumeFile; document: ResumeDocument | null } | null>(null);
  const [prepared, setPrepared] = useState<Record<string, ScoredJob>>({});
  const [previewToken, setPreviewToken] = useState(0);
  const [pass, setPass] = useState<PassStatus | null>(null);
  const [passNote, setPassNote] = useState("");

  useEffect(() => {
    void loadResumeFile().then(setResumeFile).catch(() => setResumeFile(null));
  }, []);

  useEffect(() => {
    const id = review?.id;
    if (!id) return;
    let cancel = false;
    void loadJobResume(id)
      .then((stored) => {
        if (!cancel) setJobPdf(stored ? { id, file: stored.file, document: stored.document } : null);
      })
      .catch(() => {
        if (!cancel) setJobPdf(null);
      });
    return () => {
      cancel = true;
    };
  }, [review?.id]);

  useEffect(() => {
    let stop = false;
    void fetch("/api/pass")
      .then((response) => response.json())
      .then((data: PassStatus) => {
        if (!stop) setPass(data);
      })
      .catch(() => {
        if (!stop) setPass({ active: false, configured: false, gemini: false });
      });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!pass?.active || !pass.id) {
      setTrackerCloudSync(null);
      setProfileCloudSync(null);
      return;
    }
    const passId = pass.id;
    let trackerTimer = 0;
    let profileTimer = 0;
    const saveAccount = (body: { tracker?: Record<string, Tracked>; profile?: Profile }) => {
      const profile = body.profile ? { ...body.profile, geminiKey: "" } : undefined;
      void fetch("/api/tracker", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, profile }),
      });
    };
    setTrackerCloudSync((next) => {
      window.clearTimeout(trackerTimer);
      trackerTimer = window.setTimeout(() => saveAccount({ tracker: next }), 500);
    });
    setProfileCloudSync((next) => {
      window.clearTimeout(profileTimer);
      profileTimer = window.setTimeout(() => saveAccount({ profile: next }), 500);
    });
    let cancel = false;
    void fetch("/api/tracker")
      .then((response) => response.json())
      .then((data: { tracker?: Record<string, Tracked>; profile?: Profile | null }) => {
        if (cancel || !data.tracker) return;
        const flag = "scoutroles.cloud-pass";
        const seen = localStorage.getItem(flag);
        const savedProfile = data.profile
          ? { ...emptyProfile, ...data.profile, geminiKey: "" }
          : null;
        if (seen && seen !== passId) {
          replaceTracker(data.tracker);
          replaceProfile(savedProfile ?? emptyProfile);
          setResumeFile(null);
          setJobPdf(null);
          void clearResumeFile();
          void clearJobResumes();
          localStorage.setItem(flag, passId);
          return;
        }
        if (seen === passId) {
          replaceTracker(data.tracker);
          if (savedProfile) replaceProfile({ ...savedProfile, geminiKey: getProfile().geminiKey });
          return;
        }
        const merged = mergeTrackers(getTracker(), data.tracker);
        replaceTracker(merged);
        localStorage.setItem(flag, passId);
        saveAccount({ tracker: merged, profile: getProfile() });
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
      window.clearTimeout(trackerTimer);
      window.clearTimeout(profileTimer);
      setTrackerCloudSync(null);
      setProfileCloudSync(null);
    };
  }, [pass?.active, pass?.id]);
  const sampleMode = Boolean(
    payload && payload.jobs.length === 0 && payload.sources.every((source) => !source.ok),
  );
  const jobs = sampleMode ? sampleJobs : (payload?.jobs ?? EMPTY_JOBS);

  const scored = useMemo(
    () => scoreJobs(jobs.filter((job) => (profile.remoteOnly ? job.remote : true)), profile),
    [jobs, profile],
  );

  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of scored) counts.set(item.job.source, (counts.get(item.job.source) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [scored]);

  const activeSource = sources.some((item) => item.name === source) ? source : "";

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return scored.filter((item) => {
      if (activeSource && item.job.source !== activeSource) return false;
      if (item.score < minScore) return false;
      if (!query) return true;
      const blob = `${item.job.title} ${item.job.company} ${item.job.location} ${item.job.tags.join(" ")} ${item.matched.join(" ")}`.toLowerCase();
      return blob.includes(query);
    });
  }, [scored, filter, minScore, activeSource]);

  const resumeRating = useMemo(() => {
    if (!review || jobPdf?.id !== review.id || !jobPdf.document) return null;
    const live = scored.find((item) => item.job.id === review.id);
    const job = live?.job ?? toScored(review).job;
    return scorePreparedResume(job, profile, resumePlainText(jobPdf.document));
  }, [review, jobPdf, scored, profile]);

  const shown = useMemo(() => {
    if (!review) return null;
    const live = scored.find((item) => item.job.id === review.id);
    const base = live
      ? {
          ...review,
          title: live.job.title,
          company: live.job.company,
          location: live.job.location,
          salary: live.job.salary,
          url: live.job.url,
          applyUrl: live.job.applyUrl,
          description: live.job.description,
          score: live.score,
          matched: live.matched,
          missing: live.missing,
          reasons: live.reasons,
        }
      : review;
    if (!resumeRating) return base;
    return {
      ...base,
      score: resumeRating.score,
      matched: resumeRating.matched,
      missing: resumeRating.missing,
      reasons: resumeRating.reasons,
    };
  }, [review, scored, resumeRating]);

  useEffect(() => {
    if (!resumeRating || !jobPdf?.document) return;
    setPrepared((current) => {
      const previous = current[jobPdf.id];
      if (previous?.score === resumeRating.score) return current;
      return { ...current, [jobPdf.id]: resumeRating };
    });
  }, [resumeRating, jobPdf]);

  async function load(force = false): Promise<JobsPayload | null> {
    if (!pass?.active) {
      setError("Start a free account to search roles.");
      return null;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(force ? "/api/jobs?refresh=1" : "/api/jobs", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as (JobsPayload & { error?: string }) | null;
      if (!response.ok || !data?.jobs || !data.sources) {
        throw new Error(data?.error || "Could not load jobs.");
      }
      setPayload(data);
      setLimit(24);
      if (window.innerWidth < 1024) {
        document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load jobs.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  function rankPayload(data: JobsPayload): ScoredJob[] {
    const fallback = data.jobs.length === 0 && data.sources.every((source) => !source.ok);
    const list = (fallback ? sampleJobs : data.jobs).filter((job) => (profile.remoteOnly ? job.remote : true));
    return scoreJobs(list, profile);
  }

  async function startAutopilot() {
    if (!pass?.active) {
      setAutoNote("Start a free account to search roles.");
      return;
    }
    if (profile.resume.trim().length < 40 && !profile.roles.trim()) {
      setAutoNote("Add a resume or a target role first.");
      return;
    }
    setAutoNote("");
    setAutoBusy(true);
    setReview(null);
    try {
      const data = payload ?? (await load(false));
      if (!data) return;
      const fit = Math.min(96, Math.max(0, minFit));
      const count = Math.min(15, Math.max(1, batch));
      const queued = rankPayload(data)
        .filter((item) => {
          if (item.score < fit) return false;
          const status = getTracker()[item.job.id]?.status;
          return status !== "applied" && status !== "interview" && status !== "offer" && status !== "passed";
        })
        .slice(0, count);
      if (!queued.length) {
        setAutoNote("Nothing cleared that fit score. Lower it, or refresh the boards.");
        return;
      }
      const source = await textFromOriginal();
      const reviews = queued.map((item) => {
        const review = reviewFromScored(item, getTracker()[item.job.id]);
        const next = {
          ...review,
          letter: localLetter(profile, item),
          tailored: localTailored(profile, item, source.text, source.fileName),
          status: "saved" as const,
        };
        upsertTracked(toTracked(next, "saved"));
        return next;
      });
      setRun(reviews);
      setRunIndex(0);
      setView("roles");
    } finally {
      setAutoBusy(false);
    }
  }

  function finishRun(nextIndex: number) {
    if (!run || nextIndex >= run.length) {
      setRun(null);
      setView("tracker");
      return;
    }
    setRunIndex(nextIndex);
  }

  function saveResume(text: string) {
    const brief = briefFromResume(text);
    updateProfile({
      ...profile,
      resume: text,
      name: brief.name || profile.name,
      roles: brief.roles || profile.roles,
      location: brief.location || profile.location,
      remoteOnly: brief.remoteOnly ?? profile.remoteOnly,
    });
  }

  async function onFile(file: File) {
    setFileError("");
    const textLike = file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name);
    const readable =
      textLike ||
      /\.docx?$/i.test(file.name) ||
      /\.pdf$/i.test(file.name) ||
      /pdf|msword|wordprocessingml/.test(file.type);
    if (!readable) {
      setFileError("Use a PDF, Word document, or text file.");
      return;
    }
    if (file.size > 4_000_000) {
      setFileError("That file is over 4 MB. Paste the text instead.");
      return;
    }
    const bytes = await file.arrayBuffer();
    try {
      const kept = { name: file.name, type: file.type, bytes };
      await saveResumeFile(kept);
      setResumeFile(kept);
      setPreviewToken((token) => token + 1);
    } catch {
      setFileError("Could not keep that file on this device.");
      return;
    }
    if (textLike) {
      saveResume(new TextDecoder().decode(bytes));
      return;
    }
    setReading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/resume", { method: "POST", body });
      const data = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!response.ok || !data?.text) throw new Error(data?.error || "Could not read that file.");
      saveResume(data.text);
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : "Could not read that file.");
    } finally {
      setReading(false);
    }
  }

  function saveScored(item: ScoredJob, status: TrackStatus = "saved") {
    const current = reviewFromScored(item, getTracker()[item.job.id]);
    upsertTracked(toTracked({ ...current, status }, status));
  }

  function persist(next: Review, status?: TrackStatus) {
    const chosen = status ?? next.status ?? "saved";
    const withStatus = { ...next, status: chosen };
    upsertTracked(toTracked(withStatus, chosen));
    setReview(withStatus);
  }

  async function pushAccount(): Promise<boolean> {
    if (!pass?.active) return true;
    try {
      const response = await fetch("/api/tracker", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracker: getTracker(), profile: { ...getProfile(), geminiKey: "" } }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function accountHasDraft(): boolean {
    const current = getProfile();
    return Boolean(
      current.name.trim() ||
        current.roles.trim() ||
        current.location.trim() ||
        current.resume.trim() ||
        Object.keys(getTracker()).length,
    );
  }

  async function prepareSignOut(): Promise<string[]> {
    const reasons: string[] = [];
    const saved = await pushAccount();
    if (!saved && accountHasDraft()) {
      reasons.push("The latest resume and tracker were not saved to this account.");
    }
    let tailored = 0;
    try {
      tailored = await countJobResumes();
    } catch {
      tailored = 0;
    }
    if (resumeFile || tailored > 0) {
      reasons.push(
        saved
          ? "The resume file and tailored resumes on this device will be removed. This account keeps the resume text and tracker."
          : "The resume file and tailored resumes on this device will be removed.",
      );
    }
    if (getProfile().geminiKey.trim()) {
      reasons.push("The personal Gemini key on this device will be removed.");
    }
    return reasons;
  }

  async function signOut() {
    setTrackerCloudSync(null);
    setProfileCloudSync(null);
    await pushAccount();
    await fetch("/api/pass/signout", { method: "POST" }).catch(() => undefined);
    setPass({ active: false, configured: false, gemini: Boolean(pass?.gemini) });
    setPayload(null);
    setError("");
    replaceTracker({});
    replaceProfile(emptyProfile);
    setResumeFile(null);
    setJobPdf(null);
    void clearResumeFile();
    void clearJobResumes();
  }

  async function textFromOriginal(): Promise<{ text: string; fileName?: string; pdfBase64?: string }> {
    if (!resumeFile) return { text: profile.resume };
    const kind = resumeKind(resumeFile);
    if (kind === "text") {
      const text = new TextDecoder().decode(resumeFile.bytes).trim();
      return { text: text || profile.resume, fileName: resumeFile.name };
    }
    try {
      const type =
        resumeFile.type ||
        (kind === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      const body = new FormData();
      body.set("file", new File([resumeFile.bytes], resumeFile.name, { type }));
      const response = await fetch("/api/resume", { method: "POST", body });
      const data = (await response.json().catch(() => null)) as { text?: string } | null;
      const text = response.ok && data?.text?.trim() ? data.text : profile.resume;
      return {
        text,
        fileName: resumeFile.name,
        pdfBase64: kind === "pdf" ? resumeBase64(resumeFile.bytes) : undefined,
      };
    } catch {
      return { text: profile.resume, fileName: resumeFile.name };
    }
  }

  async function storeResumePdf(current: Review, document: ResumeDocument) {
    const bytes = new Uint8Array(await renderResumeDocx(document));
    const file = {
      name: resumePdfName({
        title: current.title,
        company: current.company,
        publishedAt: current.publishedAt,
      }),
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: bytes.buffer,
    };
    await saveJobResume(current.id, file, document);
    setJobPdf({ id: current.id, file, document });
    const rating = scorePreparedResume(toScored(current).job, profile, resumePlainText(document));
    persist({
      ...current,
      score: rating.score,
      matched: rating.matched,
      missing: rating.missing,
      reasons: rating.reasons,
      tailored: resumePlainText(document),
    });
  }

  async function waitDraft(id: string): Promise<{ text?: string; document?: ResumeDocument | null; error?: string; status?: string }> {
    const started = Date.now();
    while (Date.now() - started < 5 * 60 * 1000) {
      const response = await fetch(`/api/drafts/${id}`, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as {
        status?: string;
        text?: string;
        document?: ResumeDocument | null;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(data?.error || "The draft could not be read.");
      if (data?.status === "queued") setDraftWait("Queued…");
      if (data?.status === "running") setDraftWait("Writing…");
      if (data?.status === "failed") throw new Error(data.error || "The draft failed.");
      if (data?.status === "done") return data;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("This draft is still queued. Press the button again to keep waiting.");
  }

  async function createResumePdf(current: Review) {
    setBusy(true);
    setLetterError("");
    try {
      const source = await textFromOriginal();
      const included = Boolean(pass?.active && pass.gemini);
      const key = profile.geminiKey.trim();
      if (!included && !key) {
        setLetterError("Generate document needs Gemini. Sign in, or add a Gemini key.");
        return;
      }
      if (included) {
        setDraftWait("Queued…");
        const response = await fetch("/api/resume-doc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skills: current.matched,
            fileName: source.fileName,
            file: source.pdfBase64 ? { mimeType: "application/pdf", data: source.pdfBase64 } : undefined,
            profile: {
              name: profile.name,
              roles: profile.roles,
              location: profile.location,
              resume: source.text,
            },
            job: {
              id: current.id,
              title: current.title,
              company: current.company,
              location: current.location,
              description: current.description,
              url: current.url,
              applyUrl: current.applyUrl,
              salary: current.salary,
            },
          }),
        });
        const data = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
        if (!response.ok || !data?.id) throw new Error(data?.error || "Gemini did not write the document.");
        const ready = await waitDraft(data.id);
        if (!ready.document) throw new Error("Gemini did not write the document.");
        await storeResumePdf(current, ready.document);
        return;
      }
      const raw = await geminiResumeDocument(key, { ...profile, resume: source.text }, toScored(current), source);
      const parsed = parseResumeDocument(raw);
      if (!parsed) throw new Error("Gemini did not return a resume document.");
      await storeResumePdf(
        current,
        keepResumeSkills(
          keepContacts(
            { ...parsed, name: parsed.name || profile.name, preparedFor: `${current.title} at ${current.company}` },
            source.text,
          ),
          source.text,
        ),
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Gemini did not write the document.";
      setLetterError(/document|still queued/i.test(message) ? message : `${message} The document was not created.`);
    } finally {
      setBusy(false);
      setDraftWait("");
    }
  }

  async function draftWithGemini(current: Review, kind: "letter" | "resume") {
    const key = profile.geminiKey.trim();
    const included = Boolean(pass?.active && pass.gemini);
    const noun = kind === "resume" ? "resume" : "letter";
    if (!included && !key) {
      if (pass?.active && !pass.gemini) {
        setLetterError(`The account is active, and the server Gemini key is not set yet. The plain ${noun} still works.`);
      } else if (!pass?.gemini) {
        setLetterError(`Start a free account for included drafts, or add your own Gemini key.`);
      } else {
        setLetterError("Start a free account for included drafts.");
      }
      return;
    }
    setBusy(true);
    setLetterError("");
    const source = kind === "resume" ? await textFromOriginal() : { text: profile.resume };
    const plain = () =>
      kind === "resume"
        ? localTailored(profile, toScored(current), source.text, source.fileName)
        : localLetter(profile, toScored(current));
    try {
      if (included) {
        setDraftWait("Queued…");
        const response = await fetch("/api/letter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            fileName: source.fileName,
            file: source.pdfBase64 ? { mimeType: "application/pdf", data: source.pdfBase64 } : undefined,
            profile: {
              name: profile.name,
              roles: profile.roles,
              location: profile.location,
              resume: source.text,
            },
            job: {
              id: current.id,
              title: current.title,
              company: current.company,
              location: current.location,
              description: current.description,
              url: current.url,
              applyUrl: current.applyUrl,
              salary: current.salary,
            },
          }),
        });
        const data = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
        if (!response.ok || !data?.id) throw new Error(data?.error || `Could not write the ${noun}.`);
        const ready = await waitDraft(data.id);
        if (!ready.text?.trim()) throw new Error(`Could not write the ${noun}.`);
        persist(kind === "resume" ? { ...current, tailored: ready.text } : { ...current, letter: ready.text });
        return;
      }
      const written = await (kind === "resume"
        ? geminiTailored(key, { ...profile, resume: source.text }, toScored(current), source)
        : geminiLetter(key, profile, toScored(current)));
      persist(kind === "resume" ? { ...current, tailored: written.text } : { ...current, letter: written.text });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : `Gemini did not write a ${noun}.`;
      if (!/still queued/i.test(message)) {
        persist(kind === "resume" ? { ...current, tailored: plain() } : { ...current, letter: plain() });
      }
      setLetterError(/still queued/i.test(message) ? message : `${message} The plain ${noun} is in the box.`);
    } finally {
      setBusy(false);
      setDraftWait("");
    }
  }

  const count = Object.keys(tracker).length;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-20 shrink-0 border-b border-line bg-paper/90 backdrop-blur lg:static">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <a href="#top" className="flex items-center gap-2.5">
            <img src="/logo.svg?v=2" alt="" width={36} height={36} className="size-9" />
            <span className="font-serif text-xl tracking-tight">ScoutRoles</span>
          </a>
          <p className="hidden text-sm text-muted sm:block">Free matching for open roles</p>
          <nav className="ml-auto flex rounded-full bg-card p-1 ring-1 ring-line">
            <button
              type="button"
              onClick={() => setView("roles")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${view === "roles" ? "bg-ink text-paper" : "text-muted"}`}
            >
              <Icon name="roles" className="size-3.5" />
              Roles
            </button>
            <button
              type="button"
              onClick={() => setView("tracker")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${view === "tracker" ? "bg-ink text-paper" : "text-muted"}`}
            >
              <Icon name="tracker" className="size-3.5" />
              Tracker{count ? ` ${count}` : ""}
            </button>
          </nav>
        </div>
      </header>

      <main
        id="top"
        className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-6 overflow-y-auto px-4 py-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:overflow-hidden"
      >
        <Brief
          profile={profile}
          onChange={updateProfile}
          onFind={() => {
            setView("roles");
            setFilter("");
            setMinScore(0);
            void load(false);
          }}
          onFile={(file) => void onFile(file)}
          resumeFile={resumeFile}
          previewToken={previewToken}
          onClearFile={() => {
            setResumeFile(null);
            void clearResumeFile();
          }}
          onAutopilot={() => void startAutopilot()}
          loading={loading}
          reading={reading}
          autoBusy={autoBusy}
          fileError={fileError}
          autoNote={autoNote}
          pass={pass}
          passNote={passNote}
          onSignOut={() => void signOut()}
          prepareSignOut={prepareSignOut}
          minFit={minFit}
          batch={batch}
          onMinFit={setMinFit}
          onBatch={setBatch}
        />
        <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
        {view === "tracker" ? (
          <Tracker
            entries={Object.values(tracker)}
            onOpen={(entry) => {
              setLetterError("");
              const live = scored.find((item) => item.job.id === entry.id);
              setReview(live ? reviewFromScored(live, entry) : reviewFromTracked(entry));
            }}
            onRemove={removeTracked}
          />
        ) : (
          <Board
            started={payload !== null}
            loading={loading}
            error={error}
            sampleMode={sampleMode}
            reports={payload?.sources ?? []}
            fetchedAt={payload?.fetchedAt ?? ""}
            jobs={visible.slice(0, limit).map((item) => {
              const next = prepared[item.job.id];
              return next
                ? { ...item, score: next.score, matched: next.matched, missing: next.missing, reasons: next.reasons }
                : item;
            })}
            hasMore={visible.length > limit}
            onMore={() => setLimit((count) => count + 24)}
            total={visible.length}
            filter={filter}
            source={activeSource}
            sources={sources}
            minScore={minScore}
            tracked={tracker}
            hasResume={profile.resume.trim().length > 40}
            onFilter={setFilter}
            onSource={setSource}
            onMinScore={setMinScore}
            onRefresh={() => void load(true)}
            onOpen={(item) => {
              setLetterError("");
              setReview(reviewFromScored(item, tracker[item.job.id]));
            }}
            onSave={(item) => saveScored(item)}
          />
        )}
        </div>
      </main>

      {shown ? (
        <Drawer
          review={shown}
          busy={busy}
          busyLabel={draftWait}
          error={letterError}
          hasGemini={Boolean(profile.geminiKey.trim() || (pass?.active && pass.gemini))}
          sourceName={resumeFile?.name ?? ""}
          resumePdf={jobPdf?.id === shown.id ? jobPdf.file : null}
          resumeDocument={jobPdf?.id === shown.id ? jobPdf.document : null}
          resumeRating={resumeRating}
          originalScore={scored.find((item) => item.job.id === shown.id)?.score ?? shown.score}
          onClose={() => setReview(null)}
          onLetter={(letter) => setReview({ ...shown, letter })}
          onNote={(note) => setReview({ ...shown, note })}
          onRemember={(patch) => {
            const next = { ...shown, ...patch };
            if (!next.letter.trim() && !next.tailored.trim() && !next.note.trim() && !next.status) return;
            persist(next);
          }}
          onDraft={() => {
            setLetterError("");
            persist({ ...shown, letter: localLetter(profile, toScored(shown)) });
          }}
          onGemini={() => void draftWithGemini(shown, "letter")}
          onCreatePdf={() => void createResumePdf(shown)}
          onStatus={(status) => {
            const saved = getTracker()[shown.id];
            persist(
              {
                ...shown,
                letter: saved?.letter ?? shown.letter,
                tailored: saved?.tailored ?? shown.tailored,
                note: saved?.note ?? shown.note,
              },
              status,
            );
          }}
          onRemove={() => {
            removeTracked(shown.id);
            setReview(null);
          }}
        />
      ) : null}

      {run && run[runIndex] ? (
        <Autopilot
          key={run[runIndex].id}
          items={run}
          index={runIndex}
          onLetter={(letter) => {
            const current = run[runIndex];
            if (!current) return;
            const next = { ...current, letter };
            upsertTracked(toTracked(next, current.status ?? "saved"));
            setRun(run.map((item, itemIndex) => (itemIndex === runIndex ? next : item)));
          }}
          onOpen={async () => {
            const current = run[runIndex];
            if (!current) return false;
            window.open(current.applyUrl || current.url, "_blank", "noopener");
            try {
              await navigator.clipboard.writeText(current.letter);
              return true;
            } catch {
              return false;
            }
          }}
          onSent={() => {
            const current = run[runIndex];
            if (!current) return;
            upsertTracked(toTracked({ ...current, status: "applied" }, "applied"));
            finishRun(runIndex + 1);
          }}
          onSkip={() => finishRun(runIndex + 1)}
          onStop={() => setRun(null)}
        />
      ) : null}
    </div>
  );
}
