"use client";

import { useSyncExternalStore } from "react";
import { emptyProfile, type Profile, type Tracked } from "@/lib/types";

const PROFILE_KEY = "scoutroles.profile.v1";
const TRACKER_KEY = "scoutroles.tracker.v1";
const EMPTY_TRACKER: Record<string, Tracked> = {};

let profileMemory: Profile = emptyProfile;
let profileLoaded = false;
const profileListeners = new Set<() => void>();

let trackerMemory: Record<string, Tracked> = EMPTY_TRACKER;
let trackerLoaded = false;
const trackerListeners = new Set<() => void>();

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadProfile(): Profile {
  const parsed = readJson<Partial<Profile>>(PROFILE_KEY);
  if (!parsed) return emptyProfile;
  return { ...emptyProfile, ...parsed, remoteOnly: parsed.remoteOnly !== false };
}

function emitProfile() {
  profileListeners.forEach((listener) => listener());
}

function emitTracker() {
  trackerListeners.forEach((listener) => listener());
}

export function getProfile(): Profile {
  if (!profileLoaded) {
    profileLoaded = true;
    if (typeof window !== "undefined") profileMemory = loadProfile();
  }
  return profileMemory;
}

export function updateProfile(next: Profile) {
  profileMemory = next;
  profileLoaded = true;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  emitProfile();
  profileSync?.(next);
}

export function replaceProfile(next: Profile) {
  profileMemory = next;
  profileLoaded = true;
  if (typeof window !== "undefined") localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  emitProfile();
}

let profileSync: ((profile: Profile) => void) | null = null;

export function setProfileCloudSync(sync: ((profile: Profile) => void) | null) {
  profileSync = sync;
}

export function getTracker(): Record<string, Tracked> {
  if (!trackerLoaded) {
    trackerLoaded = true;
    if (typeof window !== "undefined") {
      const parsed = readJson<Record<string, Tracked>>(TRACKER_KEY);
      trackerMemory = parsed && Object.keys(parsed).length ? parsed : EMPTY_TRACKER;
    }
  }
  return trackerMemory;
}

export function replaceTracker(next: Record<string, Tracked>) {
  trackerMemory = Object.keys(next).length ? next : EMPTY_TRACKER;
  trackerLoaded = true;
  if (typeof window !== "undefined") localStorage.setItem(TRACKER_KEY, JSON.stringify(trackerMemory));
  emitTracker();
}

let cloudSync: ((tracker: Record<string, Tracked>) => void) | null = null;

export function setTrackerCloudSync(sync: ((tracker: Record<string, Tracked>) => void) | null) {
  cloudSync = sync;
}

function rememberTracker() {
  localStorage.setItem(TRACKER_KEY, JSON.stringify(trackerMemory));
  emitTracker();
  cloudSync?.(trackerMemory);
}

export function upsertTracked(entry: Tracked) {
  trackerMemory = { ...getTracker(), [entry.id]: entry };
  rememberTracker();
}

export function removeTracked(id: string) {
  const next = { ...getTracker() };
  delete next[id];
  trackerMemory = Object.keys(next).length ? next : EMPTY_TRACKER;
  rememberTracker();
}

export function useProfile(): Profile {
  return useSyncExternalStore(
    (listener) => {
      profileListeners.add(listener);
      return () => profileListeners.delete(listener);
    },
    getProfile,
    () => emptyProfile,
  );
}

export function useTracker(): Record<string, Tracked> {
  return useSyncExternalStore(
    (listener) => {
      trackerListeners.add(listener);
      return () => trackerListeners.delete(listener);
    },
    getTracker,
    () => EMPTY_TRACKER,
  );
}
