"use client";

import * as React from "react";
import { FileUp, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { BackupError, backupSummary, isEncryptedBackup, readBackup } from "@/lib/backup";
import type { LocalSnapshot } from "@/lib/data/demo-adapter";
import { acquireTabLock, openLocalAdapter, setLocalMode } from "@/lib/data/local-mode";

type Loaded = LocalSnapshot & { created_at: string | null };

/**
 * Restore a backup (or "Export all my data" file) into the on-device
 * "My classroom" workspace, replacing what is there. Reloads the app when done.
 */
export function RestoreBackup({ replacing, compact }: { replacing: boolean; compact?: boolean }) {
  const [text, setText] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [needsPass, setNeedsPass] = React.useState(false);
  const [pass, setPass] = React.useState("");
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const open = async (t: string, passphrase?: string) => {
    setError(null);
    try {
      setLoaded(await readBackup(t, passphrase));
      setNeedsPass(false);
    } catch (e) {
      if (e instanceof BackupError && e.code === "needs_passphrase") setNeedsPass(true);
      else setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  const onFile = async (f: File | undefined) => {
    setLoaded(null);
    setPass("");
    setError(null);
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) return setError("That file is too large to be a ClassPulse backup.");
    const t = await f.text();
    setText(t);
    setFileName(f.name);
    if (isEncryptedBackup(t)) setNeedsPass(true);
    else void open(t);
  };

  const restore = async () => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await acquireTabLock(2))) throw new Error("ClassPulse is open in another tab or window. Close it, then try again.");
      const adapter = await openLocalAdapter("personal");
      await adapter.restore(loaded);
      setLocalMode("personal");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The backup couldn't be restored. Nothing was changed.");
      setBusy(false);
    }
  };

  const sum = loaded ? backupSummary(loaded) : null;
  return (
    <div className="grid gap-3 text-sm">
      <label className="flex cursor-pointer items-center gap-2 justify-self-start rounded-lg border border-dashed px-3 py-2 hover:bg-secondary/50">
        <FileUp className="size-4" aria-hidden />
        <span>{fileName || (compact ? "Choose backup file…" : "Choose a ClassPulse backup file (.json)…")}</span>
        <input type="file" accept=".json,application/json" className="sr-only" aria-label="Backup file" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {needsPass && text && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void open(text, pass);
          }}
        >
          <Field label="Backup passphrase" htmlFor="restore-pass">
            <Input id="restore-pass" type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} className="w-64" autoFocus />
          </Field>
          <Button type="submit" variant="outline" disabled={!pass}>
            <KeyRound /> Unlock
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="font-medium text-destructive">
          {error}
        </p>
      )}
      {loaded && sum && (
        <div className="grid gap-2 rounded-lg border bg-secondary/40 p-3">
          <p>
            Backup{loaded.created_at ? ` from ${new Date(loaded.created_at).toLocaleString()}` : ""}: {sum.classes} classes, {sum.students} students, {sum.observations} observations, {sum.attendance} attendance records.
          </p>
          {replacing && <p className="font-medium text-destructive">Restoring replaces everything currently in My classroom on this device.</p>}
          <Button className="justify-self-start" onClick={restore} disabled={busy}>
            {busy ? "Restoring…" : replacing ? "Replace with this backup" : "Restore this backup"}
          </Button>
        </div>
      )}
    </div>
  );
}
