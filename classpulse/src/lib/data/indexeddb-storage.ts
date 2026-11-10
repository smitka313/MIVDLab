import type { KeyValueStorage } from "./demo-adapter";

/**
 * Durable key/value storage for Personal mode, backed by IndexedDB.
 *
 * Everything is read into memory when the app opens, so reads stay
 * synchronous and fast. Writes collect in memory and are committed by
 * flush() in a single IndexedDB transaction (all or nothing). If a commit
 * fails, the in-memory values are reverted and flush() rejects, so the app
 * never reports a save that didn't happen.
 *
 * IndexedDB holds far more than localStorage's ~5 MB, and the browser can be
 * asked to keep it permanently (see requestPersistentStorage).
 */
const DB_NAME = "classpulse";
const STORE = "kv";

type Pending = { prev: string | null };

export class IndexedDbStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  private dirty = new Map<string, Pending>();
  private chain: Promise<void> = Promise.resolve();

  private constructor(private db: IDBDatabase) {}

  static async open(dbName = DB_NAME): Promise<IndexedDbStorage> {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available in this browser.");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Couldn't open browser storage."));
      req.onblocked = () => reject(new Error("Browser storage is blocked by another ClassPulse window. Close other ClassPulse tabs and reload."));
    });
    const s = new IndexedDbStorage(db);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        if (typeof cur.value === "string") s.map.set(String(cur.key), cur.value);
        cur.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return s;
  }

  getItem(key: string) {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (!this.dirty.has(key)) this.dirty.set(key, { prev: this.map.get(key) ?? null });
    this.map.set(key, value);
  }

  removeItem(key: string) {
    if (!this.map.has(key) && !this.dirty.has(key)) return;
    if (!this.dirty.has(key)) this.dirty.set(key, { prev: this.map.get(key) ?? null });
    this.map.delete(key);
  }

  flush(): Promise<void> {
    const run = this.chain.then(() => this.commit());
    this.chain = run.catch(() => undefined);
    return run;
  }

  private commit(): Promise<void> {
    if (!this.dirty.size) return Promise.resolve();
    const batch = this.dirty;
    this.dirty = new Map();
    return new Promise<void>((resolve, reject) => {
      let tx: IDBTransaction;
      const revert = (err: unknown) => {
        for (const [k, { prev }] of batch) {
          if (this.dirty.has(k)) continue; // a newer write superseded it
          if (prev === null) this.map.delete(k);
          else this.map.set(k, prev);
        }
        reject(err ?? new Error("Couldn't save to browser storage."));
      };
      try {
        tx = this.db.transaction(STORE, "readwrite", { durability: "strict" } as IDBTransactionOptions);
      } catch (e) {
        return revert(e);
      }
      const store = tx.objectStore(STORE);
      for (const k of batch.keys()) {
        const v = this.map.get(k);
        if (v === undefined) store.delete(k);
        else store.put(v, k);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => revert(tx.error);
      tx.onabort = () => revert(tx.error);
    });
  }
}

/** Ask the browser not to evict ClassPulse data under storage pressure. Returns whether it is persistent. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageStatus(): Promise<{ persisted: boolean | null; usage: number | null; quota: number | null }> {
  try {
    const [persisted, est] = await Promise.all([navigator.storage?.persisted?.() ?? Promise.resolve(null), navigator.storage?.estimate?.() ?? Promise.resolve(null)]);
    return { persisted, usage: est?.usage ?? null, quota: est?.quota ?? null };
  } catch {
    return { persisted: null, usage: null, quota: null };
  }
}
