import { useSyncExternalStore } from 'react';
import type { Prefs } from '../types';

/**
 * Lightweight preferences live in localStorage. Larger data (sets, progress,
 * PDFs) lives in IndexedDB, see db.ts.
 */
export const LS_PREFIX = 'recall:';
const PREFS_KEY = `${LS_PREFIX}prefs`;

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  dailyGoal: 20,
  flashcardFront: 'term',
  flashcardShuffle: false,
  quizCount: 10,
  quizDirection: 'mixed',
  writtenDirection: 'definition-to-term',
  matchPairs: 6,
  keepPdfCopies: true,
};

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Returns false if localStorage is unavailable or full. */
export function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Remove every key this app owns. */
export function clearAppLocalStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  cachedPrefs = null;
  listeners.forEach((l) => l());
}

// ---------- Preferences store ----------

let cachedPrefs: Prefs | null = null;
const listeners = new Set<() => void>();

function sanitizePrefs(raw: Partial<Prefs> | null | undefined): Prefs {
  const p = { ...DEFAULT_PREFS, ...(raw ?? {}) };
  if (!['light', 'dark', 'system'].includes(p.theme)) p.theme = 'system';
  p.dailyGoal = Number.isFinite(p.dailyGoal) ? Math.min(500, Math.max(1, Math.round(p.dailyGoal))) : 20;
  p.matchPairs = [4, 6, 8].includes(p.matchPairs) ? p.matchPairs : 6;
  p.quizCount = Number.isFinite(p.quizCount) ? Math.max(1, Math.round(p.quizCount)) : 10;
  return p;
}

export function getPrefs(): Prefs {
  if (!cachedPrefs) cachedPrefs = sanitizePrefs(readJSON<Partial<Prefs>>(PREFS_KEY, {}));
  return cachedPrefs;
}

export function setPrefs(patch: Partial<Prefs>): void {
  cachedPrefs = sanitizePrefs({ ...getPrefs(), ...patch });
  writeJSON(PREFS_KEY, cachedPrefs);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}

// ---------- Theme ----------

export function applyTheme(theme: Prefs['theme']): void {
  const dark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
