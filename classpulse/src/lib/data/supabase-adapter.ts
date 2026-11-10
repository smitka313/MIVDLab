import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewRow, Patch, Profile, Row, TableName, UserPreferences } from "@/lib/types";
import { DataError, type DataAdapter } from "./adapter";

const PAGE = 1000;

/**
 * Production persistence: Supabase PostgreSQL. Authorization is enforced in the
 * database by row-level security (see supabase/migrations); the browser only
 * ever holds the public anon key plus the signed-in teacher's session.
 */
export class SupabaseAdapter implements DataAdapter {
  readonly mode = "supabase" as const;

  constructor(
    private client: SupabaseClient,
    readonly userId: string,
  ) {}

  private fail(e: { message: string; code?: string } | null, fallback: string): never {
    throw new DataError(e?.message || fallback, e?.code, e);
  }

  async selectAll<T extends TableName>(table: T): Promise<Row<T>[]> {
    const out: Row<T>[] = [];
    for (let from = 0; ; from += PAGE) {
      // Explicit owner filter: RLS may also allow reading rows another teacher
      // shared with us, but the working views only show the teacher's own data.
      const { data, error } = await this.client
        .from(table)
        .select("*")
        .eq("teacher_id", this.userId)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) this.fail(error, `Couldn't load ${table}`);
      out.push(...((data ?? []) as Row<T>[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async insert<T extends TableName>(table: T, rows: NewRow<T>[]): Promise<Row<T>[]> {
    if (!rows.length) return [];
    const { data, error } = await this.client.from(table).insert(rows as never).select("*");
    if (error) this.fail(error, "Couldn't save");
    return data as Row<T>[];
  }

  async update<T extends TableName>(table: T, id: string, patch: Patch<T>): Promise<Row<T>> {
    const { data, error } = await this.client.from(table).update(patch as never).eq("id", id).select("*").single();
    if (error) this.fail(error, "Couldn't save changes");
    return data as Row<T>;
  }

  async upsert<T extends TableName>(table: T, rows: NewRow<T>[], onConflict: string[]): Promise<Row<T>[]> {
    if (!rows.length) return [];
    const { data, error } = await this.client
      .from(table)
      .upsert(rows as never, { onConflict: onConflict.join(","), defaultToNull: false })
      .select("*");
    if (error) this.fail(error, "Couldn't save");
    return data as Row<T>[];
  }

  async remove<T extends TableName>(table: T, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await this.client.from(table).delete().in("id", ids.slice(i, i + 200));
      if (error) this.fail(error, "Couldn't delete");
    }
  }

  async getProfile(): Promise<Profile> {
    const { data, error } = await this.client.from("profiles").select("*").eq("id", this.userId).single();
    if (error) this.fail(error, "Couldn't load your profile");
    return data as Profile;
  }

  async updateProfile(patch: Partial<Pick<Profile, "display_name" | "onboarded_at">>): Promise<Profile> {
    const { data, error } = await this.client.from("profiles").update(patch).eq("id", this.userId).select("*").single();
    if (error) this.fail(error, "Couldn't update your profile");
    return data as Profile;
  }

  async getPreferences(): Promise<UserPreferences> {
    const { data, error } = await this.client.from("user_preferences").select("*").eq("teacher_id", this.userId).maybeSingle();
    if (error) this.fail(error, "Couldn't load preferences");
    if (data) return data as UserPreferences;
    const created = await this.client.from("user_preferences").insert({ teacher_id: this.userId }).select("*").single();
    if (created.error) this.fail(created.error, "Couldn't create preferences");
    return created.data as UserPreferences;
  }

  async updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
    const { data, error } = await this.client.from("user_preferences").update(patch).eq("teacher_id", this.userId).select("*").single();
    if (error) this.fail(error, "Couldn't save preferences");
    return data as UserPreferences;
  }

  async deleteClassroomData(): Promise<void> {
    const { error } = await this.client.rpc("delete_my_classroom_data");
    if (error) this.fail(error, "Couldn't delete data");
  }

  async deleteAccount(): Promise<void> {
    const { error } = await this.client.rpc("delete_my_account");
    if (error) this.fail(error, "Couldn't delete account");
    await this.client.auth.signOut();
  }

  async applyRetention(): Promise<number> {
    const { data, error } = await this.client.rpc("apply_retention_policy");
    if (error) this.fail(error, "Couldn't apply retention policy");
    return (data as number) ?? 0;
  }
}
