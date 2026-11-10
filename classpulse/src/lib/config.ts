/**
 * Runtime configuration. Only NEXT_PUBLIC_* values reach the browser; the
 * Supabase anon key is designed to be public and is protected by RLS.
 * The service-role key is never referenced by application code.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when a real Supabase backend is configured. Otherwise the app runs in browser-only demo mode. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
