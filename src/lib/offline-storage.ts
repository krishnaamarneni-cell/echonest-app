/**
 * Device-side offline storage for downloaded songs.
 *
 * We store the raw audio blob (m4a) in IndexedDB, plus a small bit of metadata
 * so we can render a Downloads list without re-fetching from Supabase. Songs
 * are keyed by their Supabase song id (or a `yt-<videoId>` sentinel for ad-hoc
 * YouTube videos that aren't backed by a song row).
 *
 * iOS Safari quirks:
 *  - Storage is per-origin and per-installation. A PWA installed to the home
 *    screen has a separate bucket from the in-Safari tab — downloads do NOT
 *    automatically appear in the PWA if you downloaded in Safari first. Best
 *    UX: "Add to Home Screen" first, then download.
 *  - Without `navigator.storage.persist()`, Safari may evict under storage
 *    pressure. We request persistence on first download.
 */

const DB_NAME = 'echonest-offline';
const DB_VERSION = 1;
const STORE = 'songs';

export interface OfflineSongRecord {
  id: string;
  blob: Blob;
  mime: string;
  size: number;
  title: string;
  artist: string;
  cover_url: string | null;
  duration: number;
  youtube_id: string | null;
  downloaded_at: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      }),
  );
}

/**
 * Ask the browser to keep this origin's data even under storage pressure.
 * Important for iOS where eviction is otherwise aggressive. Idempotent —
 * subsequent calls are no-ops if already persistent.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    const already = await navigator.storage.persisted();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function saveOfflineSong(rec: OfflineSongRecord): Promise<void> {
  await tx('readwrite', (s) => s.put(rec));
}

export async function getOfflineSong(
  id: string,
): Promise<OfflineSongRecord | undefined> {
  return tx<OfflineSongRecord | undefined>('readonly', (s) => s.get(id));
}

export async function deleteOfflineSong(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export async function listOfflineSongs(): Promise<OfflineSongRecord[]> {
  return tx<OfflineSongRecord[]>('readonly', (s) => s.getAll());
}

/**
 * Just the ids — cheap to call on app start to hydrate the in-memory set
 * without paying to deserialize every Blob.
 */
export async function listOfflineIds(): Promise<string[]> {
  const db = await openDb();
  return new Promise<string[]>((resolve, reject) => {
    const out: string[] = [];
    const req = db
      .transaction(STORE, 'readonly')
      .objectStore(STORE)
      .openKeyCursor();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve(out);
      out.push(cursor.key as string);
      cursor.continue();
    };
  });
}

export interface StorageInfo {
  usage: number;
  quota: number;
  persisted: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0, persisted: false };
  }
  try {
    const est = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    return {
      usage: est.usage || 0,
      quota: est.quota || 0,
      persisted,
    };
  } catch {
    return { usage: 0, quota: 0, persisted: false };
  }
}
