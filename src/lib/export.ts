import type { Card, CardProgress, StudySession, StudySet } from '../types';
import { uid } from './utils';

export const BACKUP_FORMAT = 'recall-study-backup';
export const SETS_FORMAT = 'recall-study-sets';
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof BACKUP_FORMAT | typeof SETS_FORMAT;
  version: number;
  exportedAt: string;
  sets: StudySet[];
  progress?: CardProgress[];
  sessions?: StudySession[];
}

export interface ParsedImport {
  kind: 'backup' | 'sets';
  sets: StudySet[];
  progress: CardProgress[];
  sessions: StudySession[];
  skippedCards: number;
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export function buildBackup(sets: StudySet[], progress: CardProgress[], sessions: StudySession[]): ExportFile {
  return {
    format: BACKUP_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sets,
    progress,
    sessions,
  };
}

export function buildSetsExport(sets: StudySet[], progress: CardProgress[] = []): ExportFile {
  const ids = new Set(sets.map((s) => s.id));
  return {
    format: SETS_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sets,
    progress: progress.filter((p) => ids.has(p.setId)),
  };
}

// ---------- Validation ----------

const str = (v: unknown, max = 5000): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function sanitizeCard(raw: unknown, now: number): Card | null {
  if (!isObj(raw)) return null;
  const term = str(raw.term).trim();
  const definition = str(raw.definition).trim();
  if (!term && !definition) return null;
  const card: Card = {
    id: str(raw.id, 100) || uid('c'),
    term,
    definition,
    createdAt: num(raw.createdAt) ?? now,
  };
  const example = str(raw.example).trim();
  if (example) card.example = example;
  if (Array.isArray(raw.alternates)) {
    const alts = raw.alternates.map((a) => str(a, 300).trim()).filter(Boolean);
    if (alts.length) card.alternates = alts;
  }
  const page = num(raw.sourcePage);
  if (page && page > 0) card.sourcePage = Math.round(page);
  if (raw.starred === true) card.starred = true;
  return card;
}

function sanitizeSet(raw: unknown, now: number): { set: StudySet; skipped: number } | null {
  if (!isObj(raw)) return null;
  const rawCards = Array.isArray(raw.cards) ? raw.cards : [];
  const cards = rawCards.map((c) => sanitizeCard(c, now)).filter((c): c is Card => c !== null);
  const title = str(raw.title, 200).trim() || 'Imported set';
  const set: StudySet = {
    id: str(raw.id, 100) || uid('s'),
    title,
    description: str(raw.description, 2000),
    cards,
    createdAt: num(raw.createdAt) ?? now,
    updatedAt: num(raw.updatedAt) ?? now,
  };
  const subject = str(raw.subject, 100).trim();
  if (subject) set.subject = subject;
  if (isObj(raw.source) && str(raw.source.fileName)) {
    set.source = { fileName: str(raw.source.fileName, 300), pageCount: num(raw.source.pageCount) };
  }
  return { set, skipped: rawCards.length - cards.length };
}

function sanitizeProgress(raw: unknown): CardProgress | null {
  if (!isObj(raw)) return null;
  const cardId = str(raw.cardId, 100);
  const setId = str(raw.setId, 100);
  if (!cardId || !setId) return null;
  return {
    cardId,
    setId,
    box: Math.min(5, Math.max(0, Math.round(num(raw.box) ?? 0))),
    reviews: Math.max(0, num(raw.reviews) ?? 0),
    correct: Math.max(0, num(raw.correct) ?? 0),
    incorrect: Math.max(0, num(raw.incorrect) ?? 0),
    streak: Math.max(0, num(raw.streak) ?? 0),
    lastReviewedAt: num(raw.lastReviewedAt),
    nextReviewAt: num(raw.nextReviewAt),
    lastResult: raw.lastResult === 'correct' || raw.lastResult === 'incorrect' ? raw.lastResult : undefined,
  };
}

const MODES = ['flashcards', 'quiz', 'written', 'matching'] as const;

function sanitizeSession(raw: unknown): StudySession | null {
  if (!isObj(raw)) return null;
  const startedAt = num(raw.startedAt);
  const mode = MODES.find((m) => m === raw.mode);
  if (!startedAt || !mode) return null;
  return {
    id: str(raw.id, 100) || uid('ss'),
    setIds: Array.isArray(raw.setIds) ? raw.setIds.map((s) => str(s, 100)).filter(Boolean) : [],
    mode,
    isReview: raw.isReview === true,
    startedAt,
    endedAt: num(raw.endedAt) ?? startedAt,
    total: Math.max(0, num(raw.total) ?? 0),
    correct: Math.max(0, num(raw.correct) ?? 0),
    incorrect: Math.max(0, num(raw.incorrect) ?? 0),
    cardsStudied: Math.max(0, num(raw.cardsStudied) ?? 0),
  };
}

/**
 * Accepts a full backup, a sets export, a bare array of sets, or a single set.
 */
export function parseImportText(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('This file is not valid JSON. Choose a file exported from this app.');
  }
  const now = Date.now();
  let rawSets: unknown[];
  let kind: ParsedImport['kind'] = 'sets';
  let rawProgress: unknown[] = [];
  let rawSessions: unknown[] = [];

  if (Array.isArray(data)) {
    rawSets = data;
  } else if (isObj(data) && Array.isArray(data.sets)) {
    rawSets = data.sets;
    if (data.format === BACKUP_FORMAT) kind = 'backup';
    if (Array.isArray(data.progress)) rawProgress = data.progress;
    if (Array.isArray(data.sessions)) rawSessions = data.sessions;
    if (typeof data.version === 'number' && data.version > EXPORT_VERSION) {
      throw new ImportError('This file was exported by a newer version of the app.');
    }
  } else if (isObj(data) && Array.isArray(data.cards)) {
    rawSets = [data];
  } else {
    throw new ImportError('No study sets were found in this file.');
  }

  let skippedCards = 0;
  const sets: StudySet[] = [];
  for (const raw of rawSets) {
    const res = sanitizeSet(raw, now);
    if (res) {
      sets.push(res.set);
      skippedCards += res.skipped;
    }
  }
  if (sets.length === 0) throw new ImportError('No valid study sets were found in this file.');

  const cardIds = new Set(sets.flatMap((s) => s.cards.map((c) => c.id)));
  const progress = rawProgress
    .map(sanitizeProgress)
    .filter((p): p is CardProgress => p !== null && cardIds.has(p.cardId));
  const sessions = rawSessions.map(sanitizeSession).filter((s): s is StudySession => s !== null);

  return { kind, sets, progress, sessions, skippedCards };
}

/**
 * Give a set (and its cards and progress) fresh ids so it can sit next to an
 * existing copy without overwriting it.
 */
export function remapSetIds(
  set: StudySet,
  progress: CardProgress[],
): { set: StudySet; progress: CardProgress[] } {
  const newSetId = uid('s');
  const cardMap = new Map<string, string>();
  const cards = set.cards.map((c) => {
    const id = uid('c');
    cardMap.set(c.id, id);
    return { ...c, id };
  });
  const remapped = progress
    .filter((p) => cardMap.has(p.cardId))
    .map((p) => ({ ...p, cardId: cardMap.get(p.cardId)!, setId: newSetId }));
  return { set: { ...set, id: newSetId, cards }, progress: remapped };
}

// ---------- CSV ----------

function csvCell(value: string | number | boolean | undefined): string {
  const s = value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function setToCsv(set: StudySet): string {
  const rows: string[] = [['term', 'definition', 'example', 'source_page', 'starred', 'also_accept'].join(',')];
  for (const c of set.cards) {
    rows.push(
      [
        csvCell(c.term),
        csvCell(c.definition),
        csvCell(c.example),
        csvCell(c.sourcePage),
        csvCell(c.starred ? 'yes' : ''),
        csvCell((c.alternates ?? []).join('; ')),
      ].join(','),
    );
  }
  // BOM so spreadsheet apps detect UTF-8.
  return '﻿' + rows.join('\r\n') + '\r\n';
}
