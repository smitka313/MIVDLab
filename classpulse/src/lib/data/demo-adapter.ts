import { AUDITED_TABLES, TABLE_ORDER, type AuditLog, type NewRow, type Patch, type Profile, type Row, type TableName, type UserPreferences } from "@/lib/types";
import { DataError, type DataAdapter } from "./adapter";
import { FOREIGN_KEYS, UNIQUE_KEYS } from "./schema-meta";
import { uuid } from "@/lib/utils";

/**
 * DEMO MODE persistence.
 *
 * Stores fictional classroom data in this browser's localStorage. It mimics the
 * database's foreign keys, cascades and unique constraints so the app behaves
 * the same as with Supabase, but it is NOT secure storage and must never hold
 * real student records. The UI shows a permanent "Demo mode" banner.
 */

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

export const DEMO_TEACHER_ID = "00000000-0000-4000-8000-000000000001";
const PREFIX = "classpulse.demo.v1";
const ALL_TABLES: TableName[] = [...TABLE_ORDER, "audit_logs"];

type AnyRow = Record<string, unknown> & { id: string };

export class DemoAdapter implements DataAdapter {
  readonly mode = "demo" as const;
  readonly userId = DEMO_TEACHER_ID;
  private cache = new Map<TableName, AnyRow[]>();

  constructor(
    private storage: KeyValueStorage,
    private now: () => Date = () => new Date(),
  ) {}

  // ---- low-level helpers -------------------------------------------------
  private key(name: string) {
    return `${PREFIX}.${name}`;
  }

  private rows(table: TableName): AnyRow[] {
    let rows = this.cache.get(table);
    if (!rows) {
      const raw = this.storage.getItem(this.key(table));
      try {
        rows = raw ? (JSON.parse(raw) as AnyRow[]) : [];
      } catch {
        rows = [];
      }
      this.cache.set(table, rows);
    }
    return rows;
  }

  private persist(tables: Iterable<TableName>) {
    for (const t of new Set(tables)) {
      try {
        this.storage.setItem(this.key(t), JSON.stringify(this.rows(t)));
      } catch (e) {
        // Reload from storage so memory never claims something was saved when it wasn't.
        this.cache.clear();
        throw new DataError("Browser storage is full or unavailable. The change was not saved.", "storage", e);
      }
    }
  }

  private stamp() {
    return this.now().toISOString();
  }

  private audit(table: TableName, action: AuditLog["action"], oldRow: AnyRow | null, newRow: AnyRow | null, touched: Set<TableName>) {
    if (!AUDITED_TABLES.includes(table)) return;
    const rec = (newRow ?? oldRow)!;
    this.rows("audit_logs").push({
      id: uuid(),
      teacher_id: this.userId,
      actor_id: this.userId,
      table_name: table,
      record_id: rec.id,
      action,
      old_data: oldRow ? { ...oldRow } : null,
      new_data: newRow ? { ...newRow } : null,
      created_at: this.stamp(),
    });
    touched.add("audit_logs");
  }

  private checkForeignKeys(table: TableName, row: AnyRow) {
    for (const fk of FOREIGN_KEYS[table] ?? []) {
      const v = row[fk.column];
      if (v == null) continue;
      if (!this.rows(fk.parent).some((p) => p.id === v)) {
        throw new DataError(`Related ${fk.parent.replace(/_/g, " ")} record no longer exists.`, "fk");
      }
    }
  }

  private findConflict(table: TableName, row: AnyRow, keys: string[], ignoreId?: string) {
    if (keys.some((k) => row[k] == null)) return undefined;
    return this.rows(table).find((r) => r.id !== ignoreId && keys.every((k) => r[k] === row[k]));
  }

  private checkUnique(table: TableName, row: AnyRow, ignoreId?: string) {
    for (const keys of UNIQUE_KEYS[table] ?? []) {
      if (this.findConflict(table, row, keys, ignoreId)) {
        throw new DataError("That record already exists.", "unique");
      }
    }
  }

  // ---- DataAdapter -------------------------------------------------------
  async selectAll<T extends TableName>(table: T): Promise<Row<T>[]> {
    return this.rows(table).map((r) => ({ ...r })) as unknown as Row<T>[];
  }

  async insert<T extends TableName>(table: T, input: NewRow<T>[]): Promise<Row<T>[]> {
    const touched = new Set<TableName>([table]);
    const created: AnyRow[] = [];
    const ts = this.stamp();
    const snapshot = this.rows(table).length;
    try {
      for (const r of input) {
        const row: AnyRow = { ...(r as object), id: (r as { id?: string }).id ?? uuid(), teacher_id: this.userId, created_at: ts, updated_at: ts };
        if (this.rows(table).some((x) => x.id === row.id)) throw new DataError("That record already exists.", "unique");
        this.checkForeignKeys(table, row);
        this.checkUnique(table, row);
        this.rows(table).push(row);
        created.push(row);
      }
    } catch (e) {
      this.rows(table).splice(snapshot); // all-or-nothing, like a single INSERT statement
      throw e;
    }
    for (const row of created) this.audit(table, "insert", null, row, touched);
    this.persist(touched);
    return created.map((r) => ({ ...r })) as unknown as Row<T>[];
  }

  async update<T extends TableName>(table: T, id: string, patch: Patch<T>): Promise<Row<T>> {
    const rows = this.rows(table);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new DataError("That record no longer exists. It may have been deleted.", "not_found");
    const old = rows[idx];
    const next: AnyRow = { ...old, ...(patch as object), id: old.id, teacher_id: old.teacher_id, created_at: old.created_at, updated_at: this.stamp() };
    this.checkForeignKeys(table, next);
    this.checkUnique(table, next, id);
    rows[idx] = next;
    const touched = new Set<TableName>([table]);
    this.audit(table, "update", old, next, touched);
    this.persist(touched);
    return { ...next } as unknown as Row<T>;
  }

  async upsert<T extends TableName>(table: T, input: NewRow<T>[], onConflict: string[]): Promise<Row<T>[]> {
    const out: Row<T>[] = [];
    for (const r of input) {
      const existing = this.findConflict(table, r as unknown as AnyRow, onConflict);
      if (existing) {
        const patch = { ...(r as object) } as Record<string, unknown>;
        delete patch.id;
        out.push(await this.update(table, existing.id, patch as Patch<T>));
      } else {
        out.push(...(await this.insert(table, [r])));
      }
    }
    return out;
  }

  async remove<T extends TableName>(table: T, ids: string[]): Promise<void> {
    const touched = new Set<TableName>();
    // Check RESTRICT constraints first so a failed delete changes nothing.
    for (const id of ids) this.checkRestrict(table, id);
    for (const id of ids) this.deleteCascade(table, id, touched);
    this.persist(touched);
  }

  private checkRestrict(table: TableName, id: string) {
    for (const child of ALL_TABLES) {
      for (const fk of FOREIGN_KEYS[child] ?? []) {
        if (fk.parent === table && fk.onDelete === "restrict" && this.rows(child).some((r) => r[fk.column] === id)) {
          throw new DataError("This item is still in use by other records and can't be deleted. Deactivate it instead.", "restrict");
        }
      }
    }
  }

  private deleteCascade(table: TableName, id: string, touched: Set<TableName>) {
    const rows = this.rows(table);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const [old] = rows.splice(idx, 1);
    touched.add(table);
    this.audit(table, "delete", old, null, touched);
    for (const child of ALL_TABLES) {
      for (const fk of FOREIGN_KEYS[child] ?? []) {
        if (fk.parent !== table) continue;
        const affected = this.rows(child).filter((r) => r[fk.column] === id);
        for (const r of affected) {
          if (fk.onDelete === "cascade") this.deleteCascade(child, r.id, touched);
          else if (fk.onDelete === "set null") {
            r[fk.column] = null;
            touched.add(child);
          }
        }
      }
    }
  }

  async getProfile(): Promise<Profile> {
    const raw = this.storage.getItem(this.key("profile"));
    if (raw) return JSON.parse(raw) as Profile;
    const ts = this.stamp();
    const p: Profile = {
      id: this.userId,
      school_id: null,
      display_name: "",
      email: null,
      role: "teacher",
      onboarded_at: null,
      created_at: ts,
      updated_at: ts,
    };
    this.storage.setItem(this.key("profile"), JSON.stringify(p));
    return p;
  }

  async updateProfile(patch: Partial<Pick<Profile, "display_name" | "onboarded_at">>): Promise<Profile> {
    const p = { ...(await this.getProfile()), ...patch, updated_at: this.stamp() };
    this.storage.setItem(this.key("profile"), JSON.stringify(p));
    return p;
  }

  async getPreferences(): Promise<UserPreferences> {
    const raw = this.storage.getItem(this.key("preferences"));
    const ts = this.stamp();
    const defaults: UserPreferences = {
      teacher_id: this.userId,
      theme: "system",
      date_format: "MM/dd/yyyy",
      time_format: "12h",
      dashboard_widgets: ["schedule", "overview", "tasks", "activity", "quick_actions"],
      notification_prefs: { in_app_reminders: true },
      retention_days: null,
      current_class_id: null,
      created_at: ts,
      updated_at: ts,
    };
    return raw ? { ...defaults, ...(JSON.parse(raw) as UserPreferences) } : defaults;
  }

  async updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
    const p = { ...(await this.getPreferences()), ...patch, updated_at: this.stamp() };
    this.storage.setItem(this.key("preferences"), JSON.stringify(p));
    return p;
  }

  async deleteClassroomData(): Promise<void> {
    for (const t of ALL_TABLES) {
      this.storage.removeItem(this.key(t));
    }
    this.cache.clear();
  }

  async deleteAccount(): Promise<void> {
    await this.deleteClassroomData();
    this.storage.removeItem(this.key("profile"));
    this.storage.removeItem(this.key("preferences"));
  }

  async applyRetention(): Promise<number> {
    const prefs = await this.getPreferences();
    if (!prefs.retention_days) return 0;
    const cutoff = new Date(this.now().getTime() - prefs.retention_days * 86400000);
    const cutoffIso = cutoff.toISOString();
    const cutoffDate = cutoffIso.slice(0, 10);
    const rules: [TableName, string, string][] = [
      ["observations", "observed_at", cutoffIso],
      ["attendance_records", "date", cutoffDate],
      ["student_notes", "created_at", cutoffIso],
      ["communications", "occurred_at", cutoffIso],
      ["group_observations", "observed_at", cutoffIso],
      ["audit_logs", "created_at", cutoffIso],
    ];
    let n = 0;
    const touched = new Set<TableName>();
    for (const [t, col, cut] of rules) {
      const rows = this.rows(t);
      const keep = rows.filter((r) => String(r[col]) >= cut);
      n += rows.length - keep.length;
      if (keep.length !== rows.length) {
        this.cache.set(t, keep);
        touched.add(t);
      }
    }
    this.persist(touched);
    return n;
  }

  /** Bulk-load rows bypassing per-row checks (used by the demo seeder only). */
  loadRaw(tables: Partial<Record<TableName, AnyRow[]>>) {
    for (const [t, rows] of Object.entries(tables) as [TableName, AnyRow[]][]) {
      this.cache.set(t, rows);
    }
    this.persist(Object.keys(tables) as TableName[]);
  }
}
