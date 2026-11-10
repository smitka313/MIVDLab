"use client";

import * as React from "react";
import Link from "next/link";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/config";
import { withBase } from "@/lib/paths";
import { safeNext } from "@/features/auth-form";
import { LoadingState } from "@/components/ui/states";

/**
 * Completes email-link / confirmation sign-in in the browser (no server needed,
 * so it works on static hosting such as GitHub Pages). The PKCE code verifier
 * was stored in this browser when the link was requested.
 */
export default function AuthCallbackPage() {
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const next = safeNext(params.get("next"));
    if (!isSupabaseConfigured || !code) {
      setTimeout(() => setError(params.get("error_description") ?? "This sign-in link is invalid or has expired."), 0);
      return;
    }
    getBrowserSupabase()
      .auth.exchangeCodeForSession(code)
      .then(({ error: e }) => {
        if (e) setError(e.message.includes("code verifier") ? "Open the sign-in link in the same browser you requested it from." : e.message);
        else window.location.replace(withBase(next));
      });
  }, []);
  if (!error) return <LoadingState label="Signing you in…" className="min-h-dvh" />;
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid gap-3">
        <h1 className="text-xl font-semibold">Couldn&apos;t sign you in</h1>
        <p role="alert" className="text-sm text-muted-foreground">{error}</p>
        <Link href="/login" className="text-brand-ink underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
