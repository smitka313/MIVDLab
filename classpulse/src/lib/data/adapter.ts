import type { NewRow, Patch, Profile, Row, TableName, UserPreferences } from "@/lib/types";

export type DataMode = "supabase" | "demo" | "personal";

/**
 * Persistence boundary. Two implementations exist:
 *  - SupabaseAdapter: real PostgreSQL with row-level security (production).
 *  - DemoAdapter: in-browser storage. "demo" = fictional data (localStorage);
 *    "personal" = the teacher's own records kept only on this device (IndexedDB).
 * All UI code talks to this interface (through the Store), never to a backend directly.
 */
export interface DataAdapter {
  readonly mode: DataMode;
  /** The signed-in teacher's id. */
  readonly userId: string;

  selectAll<T extends TableName>(table: T): Promise<Row<T>[]>;
  insert<T extends TableName>(table: T, rows: NewRow<T>[]): Promise<Row<T>[]>;
  update<T extends TableName>(table: T, id: string, patch: Patch<T>): Promise<Row<T>>;
  /**
   * Insert-or-update on a unique key (e.g. attendance on class/student/date).
   * Returns the stored rows.
   */
  upsert<T extends TableName>(table: T, rows: NewRow<T>[], onConflict: string[]): Promise<Row<T>[]>;
  remove<T extends TableName>(table: T, ids: string[]): Promise<void>;

  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Pick<Profile, "display_name" | "onboarded_at">>): Promise<Profile>;
  getPreferences(): Promise<UserPreferences>;
  updatePreferences(patch: Partial<Omit<UserPreferences, "teacher_id" | "created_at" | "updated_at">>): Promise<UserPreferences>;

  /** Delete every classroom record owned by the teacher (keeps the account). */
  deleteClassroomData(): Promise<void>;
  /** Permanently delete the account (Supabase) or demo workspace. */
  deleteAccount(): Promise<void>;
  /** Apply the teacher's retention policy; returns number of records removed. */
  applyRetention(): Promise<number>;
}

export class DataError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DataError";
  }
}

/** Translate low-level errors into messages a teacher can act on. */
export function friendlyError(err: unknown): string {
  if (err instanceof DataError) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message: unknown }).message);
    if (/Failed to fetch|NetworkError|network/i.test(msg)) {
      return "Couldn't reach the server. Check your connection and try again — nothing was saved.";
    }
    if (/duplicate key|unique/i.test(msg)) return "That record already exists.";
    if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to change that record.";
    if (/JWT|session/i.test(msg)) return "Your session expired. Please sign in again.";
    return msg;
  }
  return "Something went wrong. Nothing was saved.";
}
