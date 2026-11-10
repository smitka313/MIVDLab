import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DemoAdapter, MemoryStorage, PERSONAL_TEACHER_ID, type KeyValueStorage } from "@/lib/data/demo-adapter";
import { IndexedDbStorage } from "@/lib/data/indexeddb-storage";
import { Store } from "@/lib/data/store";
import { ensureDefaults } from "@/lib/defaults";
import { BackupError, backupSummary, isEncryptedBackup, makeBackup, readBackup } from "@/lib/backup";
import { generateDemoData } from "@/lib/demo/seed";

const newClass = { course_name: "Biology", period: "1", period_order: 1, room: null, meeting_days: ["Mon"], start_time: null, end_time: null, color: "teal", description: null, school_id: null, academic_year_id: null, term_id: null, default_layout_id: null, archived_at: null, sub_notes: null };
const newStudent = { first_name: "Ana", last_name: "Rivera", preferred_name: null, grade_level: 10, school_student_id: null, school_id: null, photo_path: null, is_demo: false, archived_at: null };

async function personal(storage: KeyValueStorage = new MemoryStorage()) {
  const adapter = new DemoAdapter(storage, undefined, "personal");
  const store = new Store(adapter);
  await ensureDefaults(store);
  return { adapter, store, storage };
}

describe("personal workspace", () => {
  it("is kept separately from the demo on the same storage", async () => {
    const storage = new MemoryStorage();
    const demo = new DemoAdapter(storage, undefined, "demo");
    await demo.loadRaw(generateDemoData({ teacherId: demo.userId, seed: 3 }) as never);
    const { adapter, store } = await personal(storage);
    expect(adapter.userId).toBe(PERSONAL_TEACHER_ID);
    await store.ensure("students");
    expect(store.rows("students")).toHaveLength(0);
    expect((await demo.selectAll("students")).length).toBeGreaterThan(100);
  });

  it("snapshots and restores, re-owning rows and keeping relationships", async () => {
    const a = await personal();
    const cls = await a.store.insertOne("classes", newClass);
    const st = await a.store.insertOne("students", newStudent);
    await a.store.insert("enrollments", [{ class_id: cls.id, student_id: st.id, enrolled_at: "2026-09-01", dropped_at: null }]);
    await a.adapter.updateProfile({ display_name: "Ms. Smitka" });
    const snap = await a.adapter.snapshot();

    const b = await personal();
    await b.adapter.restore(snap);
    const fresh = new Store(b.adapter);
    await Promise.all([fresh.ensure("students"), fresh.ensure("enrollments"), fresh.ensure("observation_categories")]);
    expect(fresh.rows("students").map((s) => s.first_name)).toEqual(["Ana"]);
    expect(fresh.rows("enrollments")[0]).toMatchObject({ class_id: cls.id, student_id: st.id, teacher_id: PERSONAL_TEACHER_ID });
    expect(fresh.rows("observation_categories").length).toBe(3);
    expect((await b.adapter.getProfile()).display_name).toBe("Ms. Smitka");
  });

  it("stores small metadata such as the last backup time", async () => {
    const { adapter } = await personal();
    expect(adapter.getMeta("lastBackupAt")).toBeNull();
    await adapter.setMeta("lastBackupAt", "2026-11-10T12:00:00.000Z");
    expect(adapter.getMeta("lastBackupAt")).toBe("2026-11-10T12:00:00.000Z");
  });

  it("reports a failed durable write and keeps the previous data", async () => {
    // Behaves like IndexedDbStorage: a failed flush reverts the pending writes.
    let fail = false;
    const mem = new MemoryStorage();
    const pending = new Map<string, string | null>();
    const flaky: KeyValueStorage = {
      getItem: (k) => mem.getItem(k),
      setItem: (k, v) => {
        if (!pending.has(k)) pending.set(k, mem.getItem(k));
        mem.setItem(k, v);
      },
      removeItem: (k) => mem.removeItem(k),
      flush: async () => {
        const batch = new Map(pending);
        pending.clear();
        if (fail) {
          for (const [k, prev] of batch) if (prev === null) mem.removeItem(k); else mem.setItem(k, prev);
          throw new Error("QuotaExceededError");
        }
      },
    };
    const { store, adapter } = await personal(flaky);
    await store.ensure("students");
    await store.insertOne("students", newStudent);
    fail = true;
    await expect(store.insertOne("students", { ...newStudent, first_name: "Bo" })).rejects.toThrow(/not saved/);
    expect(store.rows("students").map((s) => s.first_name)).toEqual(["Ana"]);
    expect((await adapter.selectAll("students")).map((s) => s.first_name)).toEqual(["Ana"]);
  });
});

describe("IndexedDB storage", () => {
  it("persists across reopen (a page reload)", async () => {
    const name = `t-${Math.random()}`;
    const s1 = await IndexedDbStorage.open(name);
    const { store } = await personal(s1);
    await store.insertOne("students", newStudent);
    const s2 = await IndexedDbStorage.open(name);
    const again = new Store(new DemoAdapter(s2, undefined, "personal"));
    await again.ensure("students");
    expect(again.rows("students").map((s) => s.last_name)).toEqual(["Rivera"]);
  });

  it("commits a batch atomically and removes keys", async () => {
    const name = `t-${Math.random()}`;
    const s = await IndexedDbStorage.open(name);
    s.setItem("a", "1");
    s.setItem("b", "2");
    await s.flush();
    s.removeItem("a");
    await s.flush();
    const r = await IndexedDbStorage.open(name);
    expect([r.getItem("a"), r.getItem("b")]).toEqual([null, "2"]);
  });
});

describe("backup files", () => {
  const snapPromise = (async () => {
    const { adapter, store } = await personal();
    await store.insertOne("students", newStudent);
    return adapter.snapshot();
  })();

  it("round-trips a plain backup", async () => {
    const text = await makeBackup(await snapPromise);
    expect(isEncryptedBackup(text)).toBe(false);
    const back = await readBackup(text);
    expect(backupSummary(back).students).toBe(1);
    expect(back.created_at).toMatch(/^\d{4}-/);
  });

  it("encrypts with a passphrase: no readable student data, and only the right passphrase opens it", async () => {
    const text = await makeBackup(await snapPromise, "correct horse battery");
    expect(isEncryptedBackup(text)).toBe(true);
    expect(text).not.toContain("Rivera");
    await expect(readBackup(text)).rejects.toMatchObject({ code: "needs_passphrase" });
    await expect(readBackup(text, "wrong passphrase")).rejects.toMatchObject({ code: "wrong_passphrase" });
    const ok = await readBackup(text, "correct horse battery");
    expect(ok.tables.students?.[0]).toMatchObject({ last_name: "Rivera" });
  }, 20000);

  it("detects tampering with an encrypted backup", async () => {
    const o = JSON.parse(await makeBackup(await snapPromise, "passphrase!"));
    const bytes = Uint8Array.from(atob(o.ciphertext), (c) => c.charCodeAt(0));
    bytes[5] ^= 1;
    o.ciphertext = btoa(String.fromCharCode(...bytes));
    await expect(readBackup(JSON.stringify(o), "passphrase!")).rejects.toBeInstanceOf(BackupError);
  }, 20000);

  it("rejects files that aren't valid ClassPulse backups", async () => {
    await expect(readBackup("")).rejects.toMatchObject({ code: "invalid" });
    await expect(readBackup("not json")).rejects.toMatchObject({ code: "invalid" });
    await expect(readBackup(JSON.stringify({ hello: 1 }))).rejects.toMatchObject({ code: "invalid" });
    await expect(readBackup(JSON.stringify({ format: "classpulse-backup", version: 99 }))).rejects.toMatchObject({ code: "unsupported" });
    const snap = await snapPromise;
    const dup = { ...snap, tables: { students: [snap.tables.students![0], snap.tables.students![0]] } };
    await expect(readBackup(JSON.stringify({ format: "classpulse-backup", version: 1, encrypted: false, data: dup }))).rejects.toMatchObject({ code: "invalid" });
  });

  it("accepts 'Export all my data' files and ignores unknown tables", async () => {
    const snap = await snapPromise;
    const exp = { format: "classpulse-export", version: 1, exported_at: "2026-11-01T00:00:00Z", profile: snap.profile, preferences: snap.preferences, tables: { ...snap.tables, future_table: [{ id: "x" }] } };
    const back = await readBackup(JSON.stringify(exp));
    expect(backupSummary(back).students).toBe(1);
    expect("future_table" in back.tables).toBe(false);
  });
});
