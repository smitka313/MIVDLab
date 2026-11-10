"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { isSupabaseConfigured } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/client";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string(),
  display_name: z.string().max(120),
});
type Values = z.infer<typeof schema>;

/** Only allow same-site relative redirects after sign-in (prevents open redirects). */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [message, setMessage] = React.useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [magic, setMagic] = React.useState(false);
  const { register, handleSubmit, formState, setError } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "", display_name: "" } });
  const e = formState.errors;

  if (!isSupabaseConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Demo mode</CardTitle>
          <CardDescription>No Supabase backend is configured, so accounts are disabled. ClassPulse runs with fictional demo data stored only in this browser.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <Button asChild>
            <Link href="/dashboard">Open the demo</Link>
          </Button>
          <p className="text-muted-foreground">To enable real accounts, set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see README).</p>
        </CardContent>
      </Card>
    );
  }

  const onSubmit = handleSubmit(async (v) => {
    setMessage(null);
    const sb = getBrowserSupabase();
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    if (magic) {
      const { error } = await sb.auth.signInWithOtp({ email: v.email, options: { emailRedirectTo: redirect, shouldCreateUser: mode === "signup" } });
      if (error) setMessage({ kind: "error", text: error.message });
      else setMessage({ kind: "info", text: "Check your email for a sign-in link." });
      return;
    }
    if (v.password.length < (mode === "signup" ? 10 : 1)) {
      setError("password", { message: mode === "signup" ? "Use at least 10 characters" : "Enter your password" });
      return;
    }
    if (mode === "signup") {
      const { data, error } = await sb.auth.signUp({ email: v.email, password: v.password, options: { emailRedirectTo: redirect, data: { display_name: v.display_name.trim() } } });
      if (error) setMessage({ kind: "error", text: error.message });
      else if (!data.session) setMessage({ kind: "info", text: "Check your email to confirm your account, then sign in." });
      else window.location.href = next;
    } else {
      const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.password });
      if (error) setMessage({ kind: "error", text: error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message });
      else window.location.href = next;
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "login" ? "Sign in" : "Create your account"}</CardTitle>
        <CardDescription>{mode === "login" ? "Welcome back." : "For teachers. Your classroom records stay private to your account."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          {mode === "signup" && (
            <Field label="Display name" htmlFor="a-name" hint="e.g. Ms. Rivera">
              <Input id="a-name" autoComplete="name" {...register("display_name")} />
            </Field>
          )}
          <Field label="School email" htmlFor="a-email" error={e.email?.message} required>
            <Input id="a-email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!e.email} />
          </Field>
          {!magic && (
            <Field label="Password" htmlFor="a-pass" error={e.password?.message} required hint={mode === "signup" ? "At least 10 characters." : undefined}>
              <Input id="a-pass" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} {...register("password")} aria-invalid={!!e.password} />
            </Field>
          )}
          {message && (
            <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm font-medium text-destructive" : "text-sm text-emerald-700 dark:text-emerald-400"}>
              {message.text}
            </p>
          )}
          <Button type="submit" disabled={formState.isSubmitting}>
            {magic ? "Email me a sign-in link" : mode === "login" ? "Sign in" : "Create account"}
          </Button>
          <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => setMagic((m) => !m)}>
            {magic ? "Use a password instead" : "Use an email link instead"}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                New to ClassPulse? <Link href="/signup" className="font-medium text-foreground underline">Create an account</Link>
              </>
            ) : (
              <>
                Already have an account? <Link href="/login" className="font-medium text-foreground underline">Sign in</Link>
              </>
            )}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
