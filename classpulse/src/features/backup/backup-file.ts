"use client";

/**
 * One-click backups to a file the teacher chose once (File System Access API:
 * Chrome, Edge, ChromeOS). The file handle is remembered in IndexedDB; the
 * browser asks again for permission when needed. Other browsers fall back to
 * downloads. A passphrase is never stored: it is kept in memory for this tab
 * only, after the teacher types it once.
 */
type Handle = FileSystemFileHandle & {
  queryPermission?: (d: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "readwrite" }) => Promise<PermissionState>;
};

const DB = "classpulse-backup-file";
const STORE = "handles";
const KEY = "backup";

export function canChooseBackupFile() {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
  });
}

export async function getBackupFile(): Promise<Handle | null> {
  if (!canChooseBackupFile()) return null;
  try {
    return ((await tx("readonly", (s) => s.get(KEY))) as Handle | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function chooseBackupFile(): Promise<Handle> {
  const picker = (window as unknown as { showSaveFilePicker: (o: unknown) => Promise<Handle> }).showSaveFilePicker;
  const handle = await picker({
    suggestedName: "classpulse-backup.json",
    types: [{ description: "ClassPulse backup", accept: { "application/json": [".json"] } }],
  });
  await tx("readwrite", (s) => s.put(handle, KEY));
  return handle;
}

export async function forgetBackupFile() {
  try {
    await tx("readwrite", (s) => s.delete(KEY));
  } catch {
    /* ignore */
  }
}

/** Write text to the chosen file. Must run from a click (the browser may ask for permission). */
export async function writeBackupFile(handle: Handle, text: string) {
  if (handle.queryPermission && (await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
    if (!handle.requestPermission || (await handle.requestPermission({ mode: "readwrite" })) !== "granted") {
      throw new Error("ClassPulse needs your permission to update the backup file.");
    }
  }
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

let sessionPassphrase: string | null = null;
export const rememberPassphraseForTab = (p: string | null) => (sessionPassphrase = p);
export const tabPassphrase = () => sessionPassphrase;
