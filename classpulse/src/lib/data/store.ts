import type { NewRow, Patch, Row, TableName } from "@/lib/types";
import type { DataAdapter } from "./adapter";
import { FOREIGN_KEYS } from "./schema-meta";

export interface TableState<T extends TableName = TableName> {
  status: "idle" | "loading" | "ready" | "error";
  rows: Row<T>[];
  error?: unknown;
}

const IDLE: TableState = { status: "idle", rows: [] };

/** Tables whose rows may change when a row in `table` is deleted (FK cascade / set null). */
function dependents(table: TableName, seen = new Set<TableName>()): Set<TableName> {
  for (const [child, fks] of Object.entries(FOREIGN_KEYS) as [TableName, { parent: TableName }[]][]) {
    if (fks.some((fk) => fk.parent === table) && !seen.has(child)) {
      seen.add(child);
      dependents(child, seen);
    }
  }
  return seen;
}

/**
 * Client-side cache over a DataAdapter. Mutations are pessimistic: the cache
 * only changes after the backend confirms, so the UI never shows a record as
 * saved when it was not.
 */
export class Store {
  private state = new Map<TableName, TableState>();
  private inflight = new Map<TableName, Promise<void>>();
  private listeners = new Set<() => void>();
  /** Increments on every change; a cheap, stable snapshot for subscribers. */
  version = 0;

  constructor(readonly adapter: DataAdapter) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }

  private set<T extends TableName>(table: T, next: TableState<T>) {
    this.state.set(table, next as unknown as TableState);
    this.emit();
  }

  get<T extends TableName>(table: T): TableState<T> {
    return (this.state.get(table) ?? IDLE) as unknown as TableState<T>;
  }

  /** Rows if loaded, else []. */
  rows<T extends TableName>(table: T): Row<T>[] {
    return this.get(table).rows;
  }

  ensure(table: TableName): Promise<void> {
    const s = this.get(table);
    if (s.status === "ready") return Promise.resolve();
    return this.load(table);
  }

  load(table: TableName): Promise<void> {
    const existing = this.inflight.get(table);
    if (existing) return existing;
    const prev = this.get(table);
    this.set(table, { ...prev, status: prev.status === "ready" ? "ready" : "loading" });
    const p = this.adapter
      .selectAll(table)
      .then((rows) => this.set(table, { status: "ready", rows }))
      .catch((error) => this.set(table, { status: "error", rows: prev.rows, error }))
      .finally(() => this.inflight.delete(table));
    this.inflight.set(table, p);
    return p;
  }

  /** Re-fetch every table that has been loaded. */
  async reloadAll() {
    await Promise.all([...this.state.keys()].map((t) => this.load(t)));
  }

  clear() {
    this.state.clear();
    this.emit();
  }

  private merge<T extends TableName>(table: T, changed: Row<T>[]) {
    const s = this.get(table);
    if (s.status !== "ready") return;
    const byId = new Map(changed.map((r) => [r.id, r] as const));
    const rows = s.rows.map((r) => byId.get(r.id) ?? r);
    const existing = new Set(s.rows.map((r) => r.id));
    for (const r of changed) if (!existing.has(r.id)) rows.push(r);
    this.set(table, { status: "ready", rows });
  }

  private refreshAudit() {
    if (this.get("audit_logs").status !== "idle") void this.load("audit_logs");
  }

  async insert<T extends TableName>(table: T, rows: NewRow<T>[]): Promise<Row<T>[]> {
    const created = await this.adapter.insert(table, rows);
    this.merge(table, created);
    this.refreshAudit();
    return created;
  }

  async insertOne<T extends TableName>(table: T, row: NewRow<T>): Promise<Row<T>> {
    const [r] = await this.insert(table, [row]);
    return r;
  }

  async update<T extends TableName>(table: T, id: string, patch: Patch<T>): Promise<Row<T>> {
    const r = await this.adapter.update(table, id, patch);
    this.merge(table, [r]);
    this.refreshAudit();
    return r;
  }

  async upsert<T extends TableName>(table: T, rows: NewRow<T>[], onConflict: string[]): Promise<Row<T>[]> {
    const r = await this.adapter.upsert(table, rows, onConflict);
    this.merge(table, r);
    this.refreshAudit();
    return r;
  }

  async remove<T extends TableName>(table: T, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.adapter.remove(table, ids);
    const s = this.get(table);
    const gone = new Set(ids);
    if (s.status === "ready") this.set(table, { status: "ready", rows: s.rows.filter((r) => !gone.has(r.id)) });
    // Cascades happened server-side; refresh any loaded dependent tables.
    await Promise.all(
      [...dependents(table)].filter((t) => this.get(t).status !== "idle").map((t) => this.load(t)),
    );
    this.refreshAudit();
  }
}
