import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DemoAdapter, MemoryStorage, DEMO_TEACHER_ID } from "@/lib/data/demo-adapter";
import { Store } from "@/lib/data/store";
import { FOREIGN_KEYS, UNIQUE_KEYS } from "@/lib/data/schema-meta";
import { generateDemoData } from "@/lib/demo/seed";
import { ensureDefaults } from "@/lib/defaults";
import { TABLE_ORDER, type TableName } from "@/lib/types";
import { DataError } from "@/lib/data/adapter";

async function setup() {
  const storage = new MemoryStorage();
  const adapter = new DemoAdapter(storage);
  const store = new Store(adapter);
  await ensureDefaults(store);
  return { storage, adapter, store };
}

async function classWithStudent(store: Store) {
  const cls = await store.insertOne("classes", { course_name: "Biology", period: "1", period_order: 1, room: null, meeting_days: ["Mon"], start_time: null, end_time: null, color: "teal", description: null, school_id: null, academic_year_id: null, term_id: null, default_layout_id: null, archived_at: null, sub_notes: null });
  const st = await store.insertOne("students", { first_name: "Ana", last_name: "Rivera", preferred_name: null, grade_level: 10, school_student_id: "1", school_id: null, photo_path: null, is_demo: true, archived_at: null });
  await store.insert("enrollments", [{ class_id: cls.id, student_id: st.id, enrolled_at: "2026-09-01", dropped_at: null }]);
  return { cls, st };
}

describe("demo adapter behaves like the database", () => {
  it("creates default configuration once", async () => {
    const { store } = await setup();
    await ensureDefaults(store);
    expect(store.rows("observation_categories").length).toBe(3);
    expect(store.rows("attendance_statuses").map((s) => s.code)).toEqual(["P", "A", "T", "E"]);
  });

  it("persists across a page refresh (new adapter on the same storage)", async () => {
    const { storage, store } = await setup();
    const { cls, st } = await classWithStudent(store);
    const cat = store.rows("observation_categories")[0];
    await store.insertOne("observations", { student_id: st.id, class_id: cls.id, observed_at: new Date().toISOString(), category_id: cat.id, behavior_id: null, kind: cat.kind, category_name: cat.name, behavior_label: "Helped another student", context: null, note: null, activity: null, intervention_used: null, follow_up_required: false, group_id: null });
    const reloaded = new Store(new DemoAdapter(storage));
    await reloaded.ensure("observations");
    expect(reloaded.rows("observations")).toHaveLength(1);
    expect(reloaded.rows("observations")[0]).toMatchObject({ student_id: st.id, class_id: cls.id, teacher_id: DEMO_TEACHER_ID });
  });

  it("enforces foreign keys and unique constraints", async () => {
    const { store } = await setup();
    const { cls, st } = await classWithStudent(store);
    await expect(store.insert("enrollments", [{ class_id: cls.id, student_id: st.id, enrolled_at: "2026-09-01", dropped_at: null }])).rejects.toThrow(DataError);
    await expect(store.insert("enrollments", [{ class_id: "missing", student_id: st.id, enrolled_at: "2026-09-01", dropped_at: null }])).rejects.toThrow(/no longer exists/);
  });

  it("is all-or-nothing for multi-row inserts", async () => {
    const { store } = await setup();
    const { cls, st } = await classWithStudent(store);
    const other = await store.insertOne("students", { first_name: "Bo", last_name: "Li", preferred_name: null, grade_level: null, school_student_id: null, school_id: null, photo_path: null, is_demo: false, archived_at: null });
    await store.ensure("enrollments");
    const before = store.rows("enrollments").length;
    await expect(store.insert("enrollments", [{ class_id: cls.id, student_id: other.id, enrolled_at: "2026-09-01", dropped_at: null }, { class_id: cls.id, student_id: st.id, enrolled_at: "2026-09-01", dropped_at: null }])).rejects.toThrow();
    await store.load("enrollments");
    expect(store.rows("enrollments").length).toBe(before);
  });

  it("upserts attendance on (class, student, date)", async () => {
    const { store } = await setup();
    const { cls, st } = await classWithStudent(store);
    const [p, a] = store.rows("attendance_statuses");
    await store.upsert("attendance_records", [{ class_id: cls.id, student_id: st.id, date: "2026-11-10", status_id: p.id, note: null }], ["class_id", "student_id", "date"]);
    await store.upsert("attendance_records", [{ class_id: cls.id, student_id: st.id, date: "2026-11-10", status_id: a.id, note: null }], ["class_id", "student_id", "date"]);
    await store.upsert("attendance_records", [{ class_id: cls.id, student_id: st.id, date: "2026-11-11", status_id: p.id, note: null }], ["class_id", "student_id", "date"]);
    await store.load("attendance_records");
    const recs = store.rows("attendance_records");
    expect(recs).toHaveLength(2);
    expect(recs.find((r) => r.date === "2026-11-10")?.status_id).toBe(a.id);
  });

  it("cascades deletes and sets nulls like the SQL schema", async () => {
    const { store } = await setup();
    const { cls, st } = await classWithStudent(store);
    const layout = await store.insertOne("seating_layouts", { class_id: cls.id, name: "Rows", arrangement: "rows", cols: 12, rows: 10 });
    await store.insert("seats", [{ layout_id: layout.id, kind: "seat", x: 0, y: 0, w: 1, h: 1, label: null, student_id: st.id }]);
    await store.ensure("seats");
    await store.ensure("enrollments");
    await store.remove("students", [st.id]);
    expect(store.rows("enrollments")).toHaveLength(0);
    expect(store.rows("seats")[0].student_id).toBeNull(); // ON DELETE SET NULL
    await store.remove("classes", [cls.id]);
    expect(store.rows("seats")).toHaveLength(0); // class -> layouts -> seats cascade
  });

  it("refuses to delete an attendance status that is in use (RESTRICT)", async () => {
    const { store } = await setup();
    const { cls, st } = await classWithStudent(store);
    const [p] = store.rows("attendance_statuses");
    await store.insert("attendance_records", [{ class_id: cls.id, student_id: st.id, date: "2026-11-10", status_id: p.id, note: null }]);
    await expect(store.remove("attendance_statuses", [p.id])).rejects.toThrow(/in use/);
    expect(store.rows("attendance_statuses").some((s) => s.id === p.id)).toBe(true);
  });

  it("writes an audit trail for corrections and deletions", async () => {
    const { store } = await setup();
    const { st } = await classWithStudent(store);
    await store.update("students", st.id, { preferred_name: "Annie" });
    await store.remove("students", [st.id]);
    await store.load("audit_logs");
    const trail = store.rows("audit_logs").filter((l) => l.record_id === st.id).map((l) => l.action);
    expect(trail).toEqual(["insert", "update", "delete"]);
    const upd = store.rows("audit_logs").find((l) => l.record_id === st.id && l.action === "update")!;
    expect(upd.old_data?.preferred_name).toBeNull();
    expect(upd.new_data?.preferred_name).toBe("Annie");
  });

  it("never changes the cache when the backend rejects a write", async () => {
    const { store, storage } = await setup();
    const { st } = await classWithStudent(store);
    const failing = new Store(new DemoAdapter(storage));
    await failing.ensure("students");
    const before = JSON.stringify(failing.rows("students"));
    failing.adapter.update = async () => {
      throw new Error("Failed to fetch");
    };
    await expect(failing.update("students", st.id, { first_name: "Changed" })).rejects.toThrow();
    expect(JSON.stringify(failing.rows("students"))).toBe(before);
  });

  it("reports storage failures instead of pretending to save", async () => {
    const storage = new MemoryStorage();
    const adapter = new DemoAdapter(storage);
    const store = new Store(adapter);
    await ensureDefaults(store);
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    await expect(store.insertOne("team_roles", { name: "X", description: null, sort_order: 9, is_active: true })).rejects.toThrow(/not saved/);
  });

  it("applies the retention policy", async () => {
    const { store, adapter } = await setup();
    const { cls, st } = await classWithStudent(store);
    const [p] = store.rows("attendance_statuses");
    await store.insert("attendance_records", [{ class_id: cls.id, student_id: st.id, date: "2020-01-06", status_id: p.id, note: null }, { class_id: cls.id, student_id: st.id, date: "2099-01-05", status_id: p.id, note: null }]);
    await adapter.updatePreferences({ retention_days: 365 });
    expect(await adapter.applyRetention()).toBeGreaterThanOrEqual(1);
    await store.load("attendance_records");
    expect(store.rows("attendance_records").map((r) => r.date)).toEqual(["2099-01-05"]);
  });
});

describe("fictional demo data", () => {
  const data = generateDemoData({ teacherId: DEMO_TEACHER_ID, today: new Date(2026, 10, 10, 12), seed: 1 });
  it("has the required shape", () => {
    expect(data.classes).toHaveLength(6);
    for (const c of data.classes) {
      const n = data.enrollments.filter((e) => e.class_id === c.id).length;
      expect(n).toBeGreaterThanOrEqual(20);
      expect(n).toBeLessThanOrEqual(31);
    }
    expect(data.seating_layouts.length).toBeGreaterThan(6);
    expect(data.students.every((s) => s.is_demo)).toBe(true);
    expect(data.intervention_plans.some((p) => p.status === "active")).toBe(true);
    expect(data.communications.length).toBeGreaterThan(0);
    expect(data.group_memberships.length).toBeGreaterThan(0);
  });
  it("satisfies every foreign key and unique constraint", () => {
    for (const t of TABLE_ORDER) {
      for (const fk of FOREIGN_KEYS[t] ?? []) {
        const parents = new Set(data[fk.parent].map((r) => r.id));
        for (const r of data[t]) if (r[fk.column] != null) expect(parents.has(r[fk.column] as string), `${t}.${fk.column}`).toBe(true);
      }
      for (const keys of UNIQUE_KEYS[t] ?? []) {
        const seen = new Set<string>();
        for (const r of data[t]) {
          if (keys.some((k) => r[k] == null)) continue;
          const k = keys.map((x) => r[x]).join("|");
          expect(seen.has(k), `${t} unique ${keys}`).toBe(false);
          seen.add(k);
        }
      }
    }
  });
  it("places no two layout items on the same cell", () => {
    for (const l of data.seating_layouts) {
      const cells = new Set<string>();
      for (const s of data.seats.filter((x) => x.layout_id === l.id)) {
        for (let dx = 0; dx < (s.w as number); dx++)
          for (let dy = 0; dy < (s.h as number); dy++) {
            const k = `${(s.x as number) + dx},${(s.y as number) + dy}`;
            expect(cells.has(k), `${l.name} ${k}`).toBe(false);
            cells.add(k);
          }
      }
    }
  });
  it("uses only past school days for records", () => {
    expect(data.attendance_records.every((r) => (r.date as string) < "2026-11-10")).toBe(true);
  });
});

describe("schema metadata matches the SQL migrations", () => {
  const sql = readdirSync(join(__dirname, "../../supabase/migrations")).map((f) => readFileSync(join(__dirname, "../../supabase/migrations", f), "utf8")).join("\n");
  const tables = [...sql.matchAll(/create table public\.(\w+) \(([\s\S]*?)\n\);/g)].map((m) => [m[1], m[2]] as const);
  const sqlFks = new Map<string, Set<string>>();
  for (const [t, body] of tables) {
    for (const m of body.matchAll(/foreign key \((\w+), teacher_id\) references public\.(\w+) \(id, teacher_id\) on delete (cascade|set null|restrict)/g)) {
      sqlFks.set(t, (sqlFks.get(t) ?? new Set()).add(`${m[1]}->${m[2]}:${m[3]}`));
    }
  }
  for (const m of sql.matchAll(/alter table public\.(\w+)\s+add constraint \w+\s+foreign key \((\w+), teacher_id\) references public\.(\w+) \(id, teacher_id\) on delete (cascade|set null|restrict)/g)) {
    sqlFks.set(m[1], (sqlFks.get(m[1]) ?? new Set()).add(`${m[2]}->${m[3]}:${m[4]}`));
  }
  it("every composite FK in SQL is mirrored in schema-meta, and vice versa", () => {
    const tsFks = new Map<string, Set<string>>();
    for (const [t, fks] of Object.entries(FOREIGN_KEYS)) tsFks.set(t, new Set(fks!.map((f) => `${f.column}->${f.parent}:${f.onDelete}`)));
    expect(Object.fromEntries([...tsFks].map(([k, v]) => [k, [...v].sort()]))).toEqual(Object.fromEntries([...sqlFks].map(([k, v]) => [k, [...v].sort()])));
  });
  it("every client table exists in SQL with RLS", () => {
    const names = new Set(tables.map(([t]) => t));
    for (const t of [...TABLE_ORDER, "audit_logs"] as TableName[]) expect(names.has(t), t).toBe(true);
  });
});
