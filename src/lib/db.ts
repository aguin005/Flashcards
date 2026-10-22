import { openDB, type IDBPDatabase } from 'idb';
import type { CardProgress, PdfImport, StoredFile, StudySession, StudySet } from '../types';

/**
 * IndexedDB persistence for everything larger than a preference: study sets,
 * per-card progress, study sessions, PDF import drafts, and PDF files.
 *
 * If IndexedDB cannot be opened (some private-browsing modes block it), the app
 * falls back to an in-memory store and shows a warning that data will not persist.
 */

const DB_NAME = 'recall-study';
const DB_VERSION = 1;

interface StoreTypes {
  sets: StudySet;
  progress: CardProgress;
  sessions: StudySession;
  imports: PdfImport;
  files: StoredFile;
}
export type StoreName = keyof StoreTypes;

const KEY_PATHS: { [K in StoreName]: keyof StoreTypes[K] & string } = {
  sets: 'id',
  progress: 'cardId',
  sessions: 'id',
  imports: 'id',
  files: 'id',
};

export class StorageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

function wrapError(err: unknown, action: string): StorageError {
  if (err instanceof StorageError) return err;
  const name = (err as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') {
    return new StorageError(
      'Your browser storage is full. Delete stored PDFs or old sets in Settings, or export a backup and clear data.',
      err,
    );
  }
  return new StorageError(`Could not ${action}. Your browser blocked or interrupted local storage.`, err);
}

interface Backend {
  getAll<K extends StoreName>(store: K): Promise<StoreTypes[K][]>;
  get<K extends StoreName>(store: K, key: string): Promise<StoreTypes[K] | undefined>;
  putMany<K extends StoreName>(store: K, values: StoreTypes[K][]): Promise<void>;
  deleteMany(store: StoreName, keys: string[]): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

class IdbBackend implements Backend {
  constructor(private db: IDBPDatabase) {}

  getAll<K extends StoreName>(store: K) {
    return this.db.getAll(store) as Promise<StoreTypes[K][]>;
  }
  get<K extends StoreName>(store: K, key: string) {
    return this.db.get(store, key) as Promise<StoreTypes[K] | undefined>;
  }
  async putMany<K extends StoreName>(store: K, values: StoreTypes[K][]) {
    if (values.length === 0) return;
    const tx = this.db.transaction(store, 'readwrite');
    await Promise.all([...values.map((v) => tx.store.put(v)), tx.done]);
  }
  async deleteMany(store: StoreName, keys: string[]) {
    if (keys.length === 0) return;
    const tx = this.db.transaction(store, 'readwrite');
    await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
  }
  async clear(store: StoreName) {
    await this.db.clear(store);
  }
}

class MemoryBackend implements Backend {
  private stores = new Map<StoreName, Map<string, unknown>>();

  private store(name: StoreName) {
    let s = this.stores.get(name);
    if (!s) {
      s = new Map();
      this.stores.set(name, s);
    }
    return s;
  }
  async getAll<K extends StoreName>(store: K) {
    return [...this.store(store).values()].map((v) => structuredClone(v)) as StoreTypes[K][];
  }
  async get<K extends StoreName>(store: K, key: string) {
    const v = this.store(store).get(key);
    return (v === undefined ? undefined : structuredClone(v)) as StoreTypes[K] | undefined;
  }
  async putMany<K extends StoreName>(store: K, values: StoreTypes[K][]) {
    const keyPath = KEY_PATHS[store] as keyof StoreTypes[K];
    for (const v of values) this.store(store).set(String(v[keyPath]), structuredClone(v));
  }
  async deleteMany(store: StoreName, keys: string[]) {
    for (const k of keys) this.store(store).delete(k);
  }
  async clear(store: StoreName) {
    this.store(store).clear();
  }
}

let backend: Backend | null = null;
let persistent = false;
let initPromise: Promise<{ persistent: boolean }> | null = null;

export function initDb(): Promise<{ persistent: boolean }> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable');
        const db = await openDB(DB_NAME, DB_VERSION, {
          upgrade(database) {
            if (!database.objectStoreNames.contains('sets')) database.createObjectStore('sets', { keyPath: 'id' });
            if (!database.objectStoreNames.contains('progress')) {
              const s = database.createObjectStore('progress', { keyPath: 'cardId' });
              s.createIndex('bySet', 'setId');
            }
            if (!database.objectStoreNames.contains('sessions')) {
              const s = database.createObjectStore('sessions', { keyPath: 'id' });
              s.createIndex('byStart', 'startedAt');
            }
            if (!database.objectStoreNames.contains('imports')) database.createObjectStore('imports', { keyPath: 'id' });
            if (!database.objectStoreNames.contains('files')) database.createObjectStore('files', { keyPath: 'id' });
          },
          blocking() {
            // Another tab wants to upgrade; close so it can proceed.
            db.close();
          },
        });
        backend = new IdbBackend(db);
        persistent = true;
      } catch (err) {
        console.warn('IndexedDB unavailable, using in-memory storage', err);
        backend = new MemoryBackend();
        persistent = false;
      }
      return { persistent };
    })();
  }
  return initPromise;
}

async function b(): Promise<Backend> {
  await initDb();
  return backend!;
}

async function run<T>(action: string, fn: (be: Backend) => Promise<T>): Promise<T> {
  const be = await b();
  try {
    return await fn(be);
  } catch (err) {
    throw wrapError(err, action);
  }
}

export const db = {
  getAll: <K extends StoreName>(store: K) => run(`read ${store}`, (be) => be.getAll(store)),
  get: <K extends StoreName>(store: K, key: string) => run(`read ${store}`, (be) => be.get(store, key)),
  put: <K extends StoreName>(store: K, value: StoreTypes[K]) => run(`save ${store}`, (be) => be.putMany(store, [value])),
  putMany: <K extends StoreName>(store: K, values: StoreTypes[K][]) =>
    run(`save ${store}`, (be) => be.putMany(store, values)),
  delete: (store: StoreName, key: string) => run(`delete from ${store}`, (be) => be.deleteMany(store, [key])),
  deleteMany: (store: StoreName, keys: string[]) => run(`delete from ${store}`, (be) => be.deleteMany(store, keys)),
  clear: (store: StoreName) => run(`clear ${store}`, (be) => be.clear(store)),
  async clearAll() {
    for (const s of Object.keys(KEY_PATHS) as StoreName[]) await db.clear(s);
  },
  isPersistent: () => persistent,
};

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
