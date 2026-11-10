"use client";
import { withBase, withoutBase } from "@/lib/paths";

import * as React from "react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import type { Profile, Row, TableName, UserPreferences } from "@/lib/types";
import { friendlyError, type DataAdapter } from "@/lib/data/adapter";
import { Store, type TableState } from "@/lib/data/store";
import { DemoAdapter, DEMO_TEACHER_ID } from "@/lib/data/demo-adapter";
import { SupabaseAdapter } from "@/lib/data/supabase-adapter";
import { isSupabaseConfigured } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ensureDefaults } from "@/lib/defaults";
import { generateDemoData } from "@/lib/demo/seed";
import { ErrorState, LoadingState } from "@/components/ui/states";

interface DataContextValue {
  store: Store;
  adapter: DataAdapter;
  profile: Profile;
  prefs: UserPreferences;
  updatePrefs: (patch: Partial<UserPreferences>) => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, "display_name" | "onboarded_at">>) => Promise<void>;
  /** Wipe and re-create the demo workspace (demo mode) or load sample data (Supabase). */
  loadDemoData: () => Promise<void>;
  /** Remove all classroom data, then re-create the default configuration. */
  clearAllData: () => Promise<void>;
}

const DataContext = React.createContext<DataContextValue | null>(null);

export function useData() {
  const ctx = React.useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}

export function useStore() {
  return useData().store;
}

/** Subscribe to a table; loads it on first use. */
export function useRows<T extends TableName>(table: T): TableState<T> & { reload: () => void } {
  const { store } = useData();
  const state = React.useSyncExternalStore(
    store.subscribe,
    () => store.get(table),
    () => store.get(table),
  );
  React.useEffect(() => {
    void store.ensure(table);
  }, [store, table]);
  return { ...state, reload: () => void store.load(table) };
}

/** Load several tables and report combined status. */
export function useTables<T extends TableName[]>(...tables: T) {
  const { store } = useData();
  const key = tables.join(",");
  React.useSyncExternalStore(
    store.subscribe,
    () => store.version,
    () => store.version,
  );
  React.useEffect(() => {
    for (const t of key.split(",")) void store.ensure(t as TableName);
  }, [store, key]);
  const states = tables.map((t) => store.get(t));
  const error = states.find((s) => s.status === "error")?.error;
  const loading = states.some((s) => s.status === "idle" || s.status === "loading");
  return {
    loading,
    error,
    retry: () => tables.forEach((t) => void store.load(t)),
  };
}

/** Run a mutation with honest feedback: success toast only after the backend confirms. */
export function useAction() {
  return React.useCallback(
    async <T,>(
      fn: () => Promise<T>,
      opts: { success?: string | ((r: T) => string); undo?: (r: T) => Promise<unknown>; silent?: boolean } = {},
    ): Promise<T | undefined> => {
      try {
        const result = await fn();
        if (!opts.silent && opts.success) {
          const msg = typeof opts.success === "function" ? opts.success(result) : opts.success;
          toast.success(msg, {
            duration: opts.undo ? 7000 : 3000,
            action: opts.undo
              ? {
                  label: "Undo",
                  onClick: () => {
                    opts.undo!(result).then(
                      () => toast("Undone"),
                      (e) => toast.error(`Couldn't undo: ${friendlyError(e)}`),
                    );
                  },
                }
              : undefined,
          });
        }
        return result;
      } catch (e) {
        toast.error(friendlyError(e));
        return undefined;
      }
    },
    [],
  );
}

type Boot =
  | { state: "loading" }
  | { state: "error"; error: unknown }
  | { state: "ready"; adapter: DataAdapter; store: Store; profile: Profile; prefs: UserPreferences };

async function seedThroughStore(store: Store, adapter: DataAdapter) {
  // Insert fictional data in dependency order through the normal (RLS-checked) API.
  const data = generateDemoData({ teacherId: adapter.userId });
  const strip = (r: Record<string, unknown>) => {
    const { teacher_id: _t, created_at: _c, updated_at: _u, ...rest } = r;
    void _t; void _c; void _u;
    return rest;
  };
  // Classes reference layouts that reference classes: insert classes without default first.
  const classDefaults = data.classes.map((c) => [c.id, c.default_layout_id] as const);
  for (const table of Object.keys(data) as TableName[]) {
    if (table === "audit_logs") continue;
    const rows = data[table].map((r) => strip(table === "classes" ? { ...r, default_layout_id: null } : r));
    for (let i = 0; i < rows.length; i += 500) {
      await adapter.insert(table, rows.slice(i, i + 500) as never);
    }
  }
  for (const [id, layout] of classDefaults) if (layout) await adapter.update("classes", id, { default_layout_id: layout as string });
  await store.reloadAll();
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = React.useState<Boot>({ state: "loading" });
  const [attempt, setAttempt] = React.useState(0);
  const { setTheme } = useTheme();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let adapter: DataAdapter;
        if (isSupabaseConfigured) {
          const sb = getBrowserSupabase();
          const { data, error } = await sb.auth.getUser();
          if (error || !data.user) {
            window.location.assign(withBase(`/login/?next=${encodeURIComponent(withoutBase(window.location.pathname) + window.location.search)}`));
            return;
          }
          adapter = new SupabaseAdapter(sb, data.user.id);
        } else {
          const demo = new DemoAdapter(window.localStorage);
          const profile = await demo.getProfile();
          if (!profile.onboarded_at) {
            // First visit in demo mode: build the fictional demo classroom.
            demo.loadRaw(generateDemoData({ teacherId: DEMO_TEACHER_ID }));
            await demo.updateProfile({ display_name: "Demo Teacher", onboarded_at: new Date().toISOString() });
          }
          adapter = demo;
        }
        const store = new Store(adapter);
        await ensureDefaults(store);
        const [profile, prefs] = await Promise.all([adapter.getProfile(), adapter.getPreferences()]);
        if (!cancelled) {
          setTheme(prefs.theme);
          setBoot({ state: "ready", adapter, store, profile, prefs });
        }
      } catch (error) {
        if (!cancelled) setBoot({ state: "error", error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, setTheme]);

  const value = React.useMemo<DataContextValue | null>(() => {
    if (boot.state !== "ready") return null;
    const { adapter, store } = boot;
    return {
      adapter,
      store,
      profile: boot.profile,
      prefs: boot.prefs,
      updatePrefs: async (patch) => {
        const prefs = await adapter.updatePreferences(patch);
        if (patch.theme) setTheme(patch.theme);
        setBoot((b) => (b.state === "ready" ? { ...b, prefs } : b));
      },
      updateProfile: async (patch) => {
        const profile = await adapter.updateProfile(patch);
        setBoot((b) => (b.state === "ready" ? { ...b, profile } : b));
      },
      loadDemoData: async () => {
        if (adapter instanceof DemoAdapter) {
          await adapter.deleteClassroomData();
          adapter.loadRaw(generateDemoData({ teacherId: DEMO_TEACHER_ID }));
          await adapter.updatePreferences({ current_class_id: null });
          store.clear();
        } else {
          await adapter.deleteClassroomData();
          await seedThroughStore(store, adapter);
        }
        setAttempt((a) => a + 1);
      },
      clearAllData: async () => {
        await adapter.deleteClassroomData();
        await adapter.updatePreferences({ current_class_id: null });
        store.clear();
        setAttempt((a) => a + 1);
      },
    };
  }, [boot, setTheme]);

  if (boot.state === "loading") return <LoadingState label="Loading ClassPulse…" className="min-h-dvh" />;
  if (boot.state === "error")
    return (
      <div className="mx-auto max-w-lg p-8">
        <ErrorState error={boot.error} onRetry={() => setAttempt((a) => a + 1)} />
      </div>
    );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export type { Row };
