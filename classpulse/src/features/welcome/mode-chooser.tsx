"use client";
/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { FlaskConical, HardDrive, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RestoreBackup } from "@/features/backup/restore-backup";
import { setLocalMode } from "@/lib/data/local-mode";
import { withBase } from "@/lib/paths";

/** First-run choice when no Supabase backend is configured. */
export function ModeChooser({ onChosen }: { onChosen: () => void }) {
  const [restoring, setRestoring] = React.useState(false);
  const choose = (mode: "personal" | "demo") => {
    setLocalMode(mode);
    onChosen();
  };
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_60%)] px-4 py-10">
      <div className="grid w-full max-w-3xl gap-6">
        <h1>
          <img src={withBase("/brand/classpulse-lockup.svg")} alt="ClassPulse — Better classroom management. Stronger student support. Less paperwork." className="mx-auto w-full max-w-sm dark:hidden" />
          <img src={withBase("/brand/classpulse-lockup-reverse.svg")} alt="ClassPulse — Better classroom management. Stronger student support. Less paperwork." className="mx-auto hidden w-full max-w-sm dark:block" />
        </h1>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-brand/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="size-5 text-brand-ink" aria-hidden /> My classroom
              </CardTitle>
              <CardDescription>Start empty and set up your own classes.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <ul className="grid gap-1.5 text-muted-foreground">
                <li className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden /> Records are saved only on this device, in this browser. Nothing is sent to any server.
                </li>
                <li className="flex gap-2">
                  <LockKeyhole className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden /> Back up regularly to a file (optionally passphrase-protected) — it&apos;s how you move to another device or recover after clearing the browser.
                </li>
              </ul>
              <Button onClick={() => choose("personal")}>Start my classroom</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="size-5 text-muted-foreground" aria-hidden /> Explore the demo
              </CardTitle>
              <CardDescription>Try every feature with a fictional school year.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p className="text-muted-foreground">Six class periods of invented students with four weeks of records. Kept separately — it never mixes with your own classroom.</p>
              <Button variant="outline" onClick={() => choose("demo")}>
                Open the demo
              </Button>
            </CardContent>
          </Card>
        </div>
        <div className="text-center text-sm">
          {restoring ? (
            <Card className="text-left">
              <CardHeader>
                <CardTitle>Restore from a backup</CardTitle>
                <CardDescription>Moving to a new device or browser? Open a ClassPulse backup file to bring your classroom here.</CardDescription>
              </CardHeader>
              <CardContent>
                <RestoreBackup replacing={false} />
              </CardContent>
            </Card>
          ) : (
            <button type="button" className="text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => setRestoring(true)}>
              Already use ClassPulse? Restore from a backup file
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

export function TabLocked({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid max-w-md gap-3">
        <h1 className="text-xl font-semibold">ClassPulse is open in another tab</h1>
        <p className="text-sm text-muted-foreground">
          To keep your records from overwriting each other, ClassPulse can only be open in one tab or window at a time on this device. Close the other one (including the installed app window), then try again.
        </p>
        <Button className="justify-self-center" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </main>
  );
}
