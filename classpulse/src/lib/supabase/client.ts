import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";

let client: SupabaseClient | null = null;

/** Browser Supabase client (PKCE auth; session kept in this browser). */
export function getBrowserSupabase(): SupabaseClient {
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY) as unknown as SupabaseClient;
  return client;
}
