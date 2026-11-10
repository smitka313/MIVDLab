import { DemoAdapter, type LocalMode } from "./demo-adapter";
import { IndexedDbStorage } from "./indexeddb-storage";

/**
 * Which in-browser workspace this device uses when no Supabase backend is
 * configured: "personal" (the teacher's real classroom, IndexedDB) or "demo"
 * (fictional data, localStorage). The two are stored separately.
 */
const MODE_KEY = "classpulse.localMode";

export function getLocalMode(): LocalMode | null {
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    return v === "personal" || v === "demo" ? v : null;
  } catch {
    return null;
  }
}

export function setLocalMode(mode: LocalMode | null) {
  if (mode) window.localStorage.setItem(MODE_KEY, mode);
  else window.localStorage.removeItem(MODE_KEY);
}

export async function openLocalAdapter(mode: LocalMode): Promise<DemoAdapter> {
  if (mode === "demo") return new DemoAdapter(window.localStorage, undefined, "demo");
  return new DemoAdapter(await IndexedDbStorage.open(), undefined, "personal");
}

let lockHeld = false;

/**
 * Only one tab/window may edit the on-device records at a time; otherwise two
 * copies could overwrite each other's changes. Holds a Web Lock for the life
 * of the page. Returns false if another ClassPulse tab already has it.
 */
export async function acquireTabLock(retries = 8): Promise<boolean> {
  if (lockHeld) return true;
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks?.request) return true; // very old browsers: no protection available
  for (let i = 0; i <= retries; i++) {
    const got = await new Promise<boolean>((resolve) => {
      void locks.request("classpulse-local-workspace", { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        resolve(true);
        return new Promise<void>(() => {}); // hold until the page closes
      });
    });
    if (got) {
      lockHeld = true;
      return true;
    }
    // A reloading tab releases its lock a moment later: retry briefly.
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
