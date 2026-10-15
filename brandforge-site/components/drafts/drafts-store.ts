'use client';

// Drafts: what someone made on Create and has not published yet, kept in this browser so a refresh or a closed tab
// never loses it. Each draft keeps the maker's words and settings (to reopen it as it was) and, once made, the finished
// file itself (a video's MP4), so it can be watched and downloaded again. Stored with IndexedDB, which holds files;
// nothing leaves the device. Publishing a draft removes it, and signing out clears them all.

export type Draft = {
  id: string;
  /** The Create card it belongs to, e.g. "video-launch", "video-short", "article". */
  kind: string;
  title: string;
  /** The maker's own state, given back when the draft is reopened. */
  state: unknown;
  video?: Blob;
  poster?: Blob;
  /** Pictures made for it (a video's AI scene paintings), so reopening does not paint them again. */
  images?: (Blob | null)[];
  seconds?: number;
  updatedAt: number;
};

const DB = 'brandforge-drafts';
const STORE = 'drafts';
export const DRAFTS_EVENT = 'bf:drafts';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no_storage'));
      return;
    }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('no_storage'));
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error('storage_failed'));
      tx.onabort = () => reject(tx.error ?? new Error('storage_full'));
    });
  } finally {
    db.close();
  }
}

function changed(): void {
  try {
    window.dispatchEvent(new Event(DRAFTS_EVENT));
  } catch {
    /* no window */
  }
}

export function newDraftId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Saves (or updates) a draft; fields left out keep their saved value. Never throws: a full or blocked store is skipped. */
export async function saveDraft(draft: Partial<Draft> & { id: string; kind: string }): Promise<boolean> {
  try {
    const current = await run<Draft | undefined>('readonly', (store) => store.get(draft.id) as IDBRequest<Draft | undefined>);
    const next: Draft = { title: '', state: null, ...current, ...draft, updatedAt: Date.now() } as Draft;
    await run('readwrite', (store) => store.put(next));
    changed();
    return true;
  } catch {
    return false;
  }
}

export async function getDraft(id: string): Promise<Draft | null> {
  try {
    return (await run<Draft | undefined>('readonly', (store) => store.get(id) as IDBRequest<Draft | undefined>)) ?? null;
  } catch {
    return null;
  }
}

/** Every draft, newest first (optionally only one Create card's). */
export async function listDrafts(kind?: string): Promise<Draft[]> {
  try {
    const all = await run<Draft[]>('readonly', (store) => store.getAll() as IDBRequest<Draft[]>);
    return all.filter((draft) => !kind || draft.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function deleteDraft(id: string): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(id));
    changed();
  } catch {
    /* nothing to remove */
  }
}

/** Removes every draft (signing out). */
export function clearDrafts(): void {
  try {
    indexedDB.deleteDatabase(DB);
    changed();
  } catch {
    /* no storage */
  }
}

/** A small JPEG of a canvas, for the draft's picture in the list. */
export function posterOf(canvas: HTMLCanvasElement, width = 360): Promise<Blob | null> {
  const scale = Math.min(1, width / canvas.width);
  const small = document.createElement('canvas');
  small.width = Math.round(canvas.width * scale);
  small.height = Math.round(canvas.height * scale);
  small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height);
  return new Promise((resolve) => small.toBlob((blob) => resolve(blob), 'image/jpeg', 0.75));
}
