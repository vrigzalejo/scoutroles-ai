"use client";

import type { ResumeDocument } from "@/lib/resume-pdf";

export type ResumeFile = {
  name: string;
  type: string;
  bytes: ArrayBuffer;
};

const DB_NAME = "scoutroles";
const STORE = "files";
const TAILORED = "tailored";
const KEY = "resume";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(TAILORED)) db.createObjectStore(TAILORED);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadResumeFile(): Promise<ResumeFile | null> {
  const db = await openDb();
  try {
    const record = await new Promise<ResumeFile | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result as ResumeFile | undefined);
      request.onerror = () => reject(request.error);
    });
    if (!record?.bytes?.byteLength || !record.name) return null;
    return { name: record.name, type: record.type || "", bytes: record.bytes };
  } finally {
    db.close();
  }
}

export async function saveResumeFile(file: ResumeFile): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(file, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function clearResumeFile(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function resumeBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < view.length; index += chunk) {
    binary += String.fromCharCode(...view.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function loadJobResume(id: string): Promise<{ file: ResumeFile; document: ResumeDocument | null } | null> {
  const db = await openDb();
  try {
    const record = await new Promise<(ResumeFile & { document?: ResumeDocument | null }) | undefined>((resolve, reject) => {
      const request = db.transaction(TAILORED, "readonly").objectStore(TAILORED).get(id);
      request.onsuccess = () => resolve(request.result as (ResumeFile & { document?: ResumeDocument | null }) | undefined);
      request.onerror = () => reject(request.error);
    });
    if (!record?.bytes?.byteLength) return null;
    return {
      file: {
        name: record.name || "resume.docx",
        type: record.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: record.bytes,
      },
      document: record.document ?? null,
    };
  } finally {
    db.close();
  }
}

export async function saveJobResume(id: string, file: ResumeFile, document?: ResumeDocument | null): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TAILORED, "readwrite");
      tx.objectStore(TAILORED).put({ ...file, document: document ?? null }, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function countJobResumes(): Promise<number> {
  const db = await openDb();
  try {
    return await new Promise<number>((resolve, reject) => {
      const request = db.transaction(TAILORED, "readonly").objectStore(TAILORED).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function clearJobResumes(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TAILORED, "readwrite");
      tx.objectStore(TAILORED).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function resumeKind(file: Pick<ResumeFile, "name" | "type">): "pdf" | "docx" | "doc" | "text" {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (name.endsWith(".docx") || type.includes("wordprocessingml")) return "docx";
  if (name.endsWith(".doc") || type === "application/msword") return "doc";
  return "text";
}
