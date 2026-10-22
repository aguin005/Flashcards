import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AnswerRecord, Card, CardProgress, StudySession, StudySet } from '../types';
import { db, initDb } from '../lib/db';
import { applyReview } from '../lib/spaced-repetition';
import type { ProgressMap } from '../lib/stats';
import { remapSetIds, type ParsedImport } from '../lib/export';
import { clearAppLocalStorage, LS_PREFIX, removeKey } from '../lib/storage';
import { errorMessage, uid } from '../lib/utils';
import { useToast } from '../components/ui/feedback';

export type ImportMode = 'copy' | 'merge' | 'replace';

export interface NewSetInput {
  title: string;
  description?: string;
  subject?: string;
  cards: Omit<Card, 'id' | 'createdAt'>[];
  source?: StudySet['source'];
}

interface AppDataValue {
  ready: boolean;
  loadError: string | null;
  persistent: boolean;
  sets: StudySet[];
  progress: ProgressMap;
  sessions: StudySession[];
  getSet: (id: string) => StudySet | undefined;
  createSet: (input: NewSetInput) => Promise<StudySet>;
  saveSet: (set: StudySet) => Promise<void>;
  deleteSet: (id: string) => Promise<void>;
  duplicateSet: (id: string) => Promise<StudySet | undefined>;
  toggleStar: (setId: string, cardId: string) => Promise<void>;
  recordAnswer: (answer: AnswerRecord) => void;
  saveSession: (session: StudySession) => void;
  resetSetProgress: (setId: string) => Promise<void>;
  importData: (parsed: ParsedImport, mode: ImportMode) => Promise<{ sets: number }>;
  clearAll: () => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}

export const flashcardStateKey = (setId: string) => `${LS_PREFIX}fc:${setId}`;
export const matchBestKey = (setId: string) => `${LS_PREFIX}match:${setId}`;

function sortSets(sets: StudySet[]): StudySet[] {
  return [...sets].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [sets, setSets] = useState<StudySet[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [sessions, setSessions] = useState<StudySession[]>([]);

  // Refs mirror state so async actions always see the latest values.
  const setsRef = useRef(sets);
  const progressRef = useRef(progress);
  const sessionsRef = useRef(sessions);
  setsRef.current = sets;
  progressRef.current = progress;
  sessionsRef.current = sessions;

  const lastBackgroundError = useRef(0);
  const reportBackgroundError = useCallback(
    (err: unknown) => {
      // Avoid flooding the screen when every answer fails to save.
      if (Date.now() - lastBackgroundError.current < 10_000) return;
      lastBackgroundError.current = Date.now();
      toast({ kind: 'error', title: 'Progress could not be saved', description: errorMessage(err) });
    },
    [toast],
  );

  const load = useCallback(async () => {
    try {
      const { persistent: p } = await initDb();
      setPersistent(p);
      const [s, pr, se] = await Promise.all([db.getAll('sets'), db.getAll('progress'), db.getAll('sessions')]);
      setSets(sortSets(s));
      setProgress(Object.fromEntries(pr.map((x) => [x.cardId, x])));
      setSessions(se.sort((a, b) => a.startedAt - b.startedAt));
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const getSet = useCallback((id: string) => setsRef.current.find((s) => s.id === id), []);

  const saveSet = useCallback(async (set: StudySet) => {
    const updated = { ...set, updatedAt: Date.now() };
    await db.put('sets', updated);
    setSets((list) => sortSets([updated, ...list.filter((s) => s.id !== set.id)]));
    // Drop progress for cards that were removed from the set.
    const cardIds = new Set(updated.cards.map((c) => c.id));
    const orphaned = Object.values(progressRef.current)
      .filter((p) => p.setId === set.id && !cardIds.has(p.cardId))
      .map((p) => p.cardId);
    if (orphaned.length) {
      await db.deleteMany('progress', orphaned);
      setProgress((prev) => {
        const next = { ...prev };
        orphaned.forEach((id) => delete next[id]);
        return next;
      });
    }
  }, []);

  const createSet = useCallback(
    async (input: NewSetInput) => {
      const now = Date.now();
      const set: StudySet = {
        id: uid('s'),
        title: input.title.trim() || 'Untitled set',
        description: input.description?.trim() ?? '',
        subject: input.subject?.trim() || undefined,
        cards: input.cards.map((c, i) => ({ ...c, id: uid('c'), createdAt: now + i })),
        createdAt: now,
        updatedAt: now,
        source: input.source,
      };
      await saveSet(set);
      return set;
    },
    [saveSet],
  );

  const deleteSet = useCallback(async (id: string) => {
    const set = setsRef.current.find((s) => s.id === id);
    await db.delete('sets', id);

    const progressIds = Object.values(progressRef.current)
      .filter((p) => p.setId === id)
      .map((p) => p.cardId);
    await db.deleteMany('progress', progressIds);

    const toDelete: string[] = [];
    const toUpdate: StudySession[] = [];
    for (const s of sessionsRef.current) {
      if (!s.setIds.includes(id)) continue;
      if (s.setIds.length <= 1) toDelete.push(s.id);
      else toUpdate.push({ ...s, setIds: s.setIds.filter((x) => x !== id) });
    }
    await db.deleteMany('sessions', toDelete);
    await db.putMany('sessions', toUpdate);

    // Remove the PDF import draft and stored PDF this set came from.
    const importId = set?.source?.importId;
    if (importId) {
      await db.delete('imports', importId);
      await db.delete('files', importId);
    }
    removeKey(flashcardStateKey(id));
    removeKey(matchBestKey(id));

    setSets((list) => list.filter((s) => s.id !== id));
    setProgress((prev) => {
      const next = { ...prev };
      progressIds.forEach((cid) => delete next[cid]);
      return next;
    });
    const updatedById = new Map(toUpdate.map((s) => [s.id, s]));
    setSessions((list) => list.filter((s) => !toDelete.includes(s.id)).map((s) => updatedById.get(s.id) ?? s));
  }, []);

  const duplicateSet = useCallback(
    async (id: string) => {
      const set = setsRef.current.find((s) => s.id === id);
      if (!set) return undefined;
      const now = Date.now();
      const copy: StudySet = {
        ...set,
        id: uid('s'),
        title: `${set.title} (copy)`,
        cards: set.cards.map((c) => ({ ...c, id: uid('c') })),
        createdAt: now,
        updatedAt: now,
        // The copy does not own the source PDF; deleting it must not delete the original's file.
        source: set.source ? { fileName: set.source.fileName, pageCount: set.source.pageCount } : undefined,
      };
      await saveSet(copy);
      return copy;
    },
    [saveSet],
  );

  const toggleStar = useCallback(async (setId: string, cardId: string) => {
    const set = setsRef.current.find((s) => s.id === setId);
    if (!set) return;
    // Starring is not a content edit, so keep updatedAt unchanged.
    const updated = { ...set, cards: set.cards.map((c) => (c.id === cardId ? { ...c, starred: !c.starred } : c)) };
    await db.put('sets', updated);
    setSets((list) => list.map((s) => (s.id === setId ? updated : s)));
  }, []);

  const recordAnswer = useCallback(
    (answer: AnswerRecord) => {
      const next = applyReview(progressRef.current[answer.cardId], answer, answer.correct);
      progressRef.current = { ...progressRef.current, [answer.cardId]: next };
      setProgress(progressRef.current);
      db.put('progress', next).catch(reportBackgroundError);
    },
    [reportBackgroundError],
  );

  const saveSession = useCallback(
    (session: StudySession) => {
      setSessions((list) => {
        const idx = list.findIndex((s) => s.id === session.id);
        if (idx === -1) return [...list, session];
        const copy = list.slice();
        copy[idx] = session;
        return copy;
      });
      db.put('sessions', session).catch(reportBackgroundError);
    },
    [reportBackgroundError],
  );

  const resetSetProgress = useCallback(async (setId: string) => {
    const ids = Object.values(progressRef.current)
      .filter((p) => p.setId === setId)
      .map((p) => p.cardId);
    await db.deleteMany('progress', ids);
    removeKey(flashcardStateKey(setId));
    setProgress((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
  }, []);

  const importData = useCallback(
    async (parsed: ParsedImport, mode: ImportMode) => {
      if (mode === 'replace') {
        await db.clear('sets');
        await db.clear('progress');
        await db.clear('sessions');
      }
      const existingSetIds = new Set(mode === 'replace' ? [] : setsRef.current.map((s) => s.id));
      const existingCardIds = new Set(
        mode === 'replace' ? [] : setsRef.current.flatMap((s) => s.cards.map((c) => c.id)),
      );
      const setsToSave: StudySet[] = [];
      const progressToSave: CardProgress[] = [];
      for (const set of parsed.sets) {
        const setProgress = parsed.progress.filter((p) => set.cards.some((c) => c.id === p.cardId));
        const collides =
          existingSetIds.has(set.id) || set.cards.some((c) => existingCardIds.has(c.id));
        if (mode === 'copy' && collides) {
          const remapped = remapSetIds(set, setProgress);
          setsToSave.push(remapped.set);
          progressToSave.push(...remapped.progress);
        } else {
          setsToSave.push(set);
          progressToSave.push(...setProgress.map((p) => ({ ...p, setId: set.id })));
        }
      }
      await db.putMany('sets', setsToSave);
      await db.putMany('progress', progressToSave);
      if (mode !== 'copy') await db.putMany('sessions', parsed.sessions);
      await load();
      return { sets: setsToSave.length };
    },
    [load],
  );

  const clearAll = useCallback(async () => {
    await db.clearAll();
    clearAppLocalStorage();
    setSets([]);
    setProgress({});
    setSessions([]);
  }, []);

  const value = useMemo<AppDataValue>(
    () => ({
      ready,
      loadError,
      persistent,
      sets,
      progress,
      sessions,
      getSet,
      createSet,
      saveSet,
      deleteSet,
      duplicateSet,
      toggleStar,
      recordAnswer,
      saveSession,
      resetSetProgress,
      importData,
      clearAll,
    }),
    [
      ready,
      loadError,
      persistent,
      sets,
      progress,
      sessions,
      getSet,
      createSet,
      saveSet,
      deleteSet,
      duplicateSet,
      toggleStar,
      recordAnswer,
      saveSession,
      resetSetProgress,
      importData,
      clearAll,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
