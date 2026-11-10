import { TABLE_ORDER, type TableName } from "@/lib/types";
import type { DataAdapter } from "./adapter";

/**
 * Full export of everything the signed-in teacher owns, as JSON. Runs in the
 * browser using the teacher's own session, so it can only include records RLS
 * allows them to read. The file should be stored securely.
 */
export async function exportAllData(adapter: DataAdapter) {
  const tables: Partial<Record<TableName, unknown[]>> = {};
  for (const t of [...TABLE_ORDER, "audit_logs"] as TableName[]) tables[t] = await adapter.selectAll(t);
  return {
    format: "classpulse-export",
    version: 1,
    exported_at: new Date().toISOString(),
    mode: adapter.mode,
    profile: await adapter.getProfile(),
    preferences: await adapter.getPreferences(),
    tables,
  };
}
