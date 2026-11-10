import { TABLE_ORDER, type Profile, type TableName, type UserPreferences } from "@/lib/types";
import type { LocalSnapshot } from "@/lib/data/demo-adapter";

/**
 * ClassPulse backup files.
 *
 * Plain:     { format: "classpulse-backup", version: 1, encrypted: false, created_at, data: Snapshot }
 * Encrypted: { format: "classpulse-backup", version: 1, encrypted: true, created_at,
 *              kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt }, cipher: { name: "AES-GCM", iv }, ciphertext }
 *
 * Encryption uses the browser's Web Crypto API: a 256-bit AES-GCM key is
 * derived from the passphrase with PBKDF2-SHA-256 (600,000 iterations, random
 * salt). AES-GCM also detects tampering and wrong passphrases. The passphrase
 * is never stored; if it is lost, the backup cannot be opened.
 *
 * "Export all my data" files (format "classpulse-export") can also be restored.
 */

export const BACKUP_FORMAT = "classpulse-backup";
const ITERATIONS = 600_000;
const KNOWN_TABLES = new Set<string>([...TABLE_ORDER, "audit_logs"]);

export class BackupError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "needs_passphrase" | "wrong_passphrase" | "unsupported",
  ) {
    super(message);
    this.name = "BackupError";
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function makeBackup(snapshot: LocalSnapshot, passphrase?: string, now = new Date()): Promise<string> {
  const created_at = now.toISOString();
  if (!passphrase) return JSON.stringify({ format: BACKUP_FORMAT, version: 1, encrypted: false, created_at, data: snapshot });
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(snapshot))));
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    encrypted: true,
    created_at,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: b64(salt) },
    cipher: { name: "AES-GCM", iv: b64(iv) },
    ciphertext: b64(ct),
  });
}

function parseOuter(text: string): Record<string, unknown> {
  if (!text.trim()) throw new BackupError("The file is empty.", "invalid");
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new BackupError("This isn't a ClassPulse backup file.", "invalid");
  }
  if (!obj || typeof obj !== "object") throw new BackupError("This isn't a ClassPulse backup file.", "invalid");
  return obj as Record<string, unknown>;
}

export function isEncryptedBackup(text: string) {
  try {
    return parseOuter(text).encrypted === true;
  } catch {
    return false;
  }
}

/** Parse, decrypt (if needed) and validate a backup or export file. */
export async function readBackup(text: string, passphrase?: string): Promise<LocalSnapshot & { created_at: string | null }> {
  const o = parseOuter(text);
  let payload: unknown;
  if (o.format === "classpulse-export") {
    payload = { profile: o.profile, preferences: o.preferences, tables: o.tables };
  } else if (o.format === BACKUP_FORMAT) {
    if (o.version !== 1) throw new BackupError("This backup was made by a newer version of ClassPulse.", "unsupported");
    if (o.encrypted) {
      if (!passphrase) throw new BackupError("This backup is protected with a passphrase.", "needs_passphrase");
      const kdf = o.kdf as { iterations: number; salt: string };
      const cipher = o.cipher as { iv: string };
      if (!kdf?.salt || !cipher?.iv || typeof o.ciphertext !== "string" || !(kdf.iterations >= 100_000 && kdf.iterations <= 10_000_000)) {
        throw new BackupError("This backup file is damaged.", "invalid");
      }
      try {
        const key = await deriveKey(passphrase, unb64(kdf.salt), kdf.iterations);
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(cipher.iv) as BufferSource }, key, unb64(o.ciphertext) as BufferSource);
        payload = JSON.parse(dec.decode(plain));
      } catch {
        throw new BackupError("That passphrase doesn't open this backup (or the file was changed).", "wrong_passphrase");
      }
    } else {
      payload = o.data;
    }
  } else {
    throw new BackupError("This isn't a ClassPulse backup file.", "invalid");
  }
  return { ...validateSnapshot(payload), created_at: typeof o.created_at === "string" ? o.created_at : (typeof o.exported_at === "string" ? o.exported_at : null) };
}

function validateSnapshot(p: unknown): LocalSnapshot {
  const bad = () => new BackupError("This backup file is incomplete or damaged.", "invalid");
  if (!p || typeof p !== "object") throw bad();
  const { profile, preferences, tables } = p as Record<string, unknown>;
  if (!profile || typeof profile !== "object" || !preferences || typeof preferences !== "object" || !tables || typeof tables !== "object") throw bad();
  const out: LocalSnapshot["tables"] = {};
  for (const [name, rows] of Object.entries(tables as Record<string, unknown>)) {
    if (!KNOWN_TABLES.has(name)) continue; // ignore tables from other versions
    if (!Array.isArray(rows)) throw bad();
    const ids = new Set<string>();
    for (const r of rows) {
      if (!r || typeof r !== "object" || typeof (r as { id?: unknown }).id !== "string") throw bad();
      const id = (r as { id: string }).id;
      if (ids.has(id)) throw bad();
      ids.add(id);
    }
    out[name as TableName] = rows as Record<string, unknown>[];
  }
  return { profile: profile as Profile, preferences: preferences as UserPreferences, tables: out };
}

export function backupSummary(s: LocalSnapshot) {
  const n = (t: TableName) => s.tables[t]?.length ?? 0;
  return { classes: n("classes"), students: n("students"), observations: n("observations"), attendance: n("attendance_records") };
}

export function backupFilename(now = new Date(), encrypted = false) {
  const d = now.toISOString().slice(0, 10);
  return `classpulse-backup-${d}${encrypted ? "-encrypted" : ""}.json`;
}
