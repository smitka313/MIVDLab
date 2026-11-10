"use client";

import * as React from "react";
import { Download, HardDrive } from "lucide-react";
import { useAction, useData } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { DemoAdapter } from "@/lib/data/demo-adapter";
import { requestPersistentStorage, storageStatus } from "@/lib/data/indexeddb-storage";
import { backupFilename, makeBackup } from "@/lib/backup";
import { downloadFile } from "@/lib/utils";
import { RestoreBackup } from "./restore-backup";

export const BACKUP_EVENT = "classpulse:backup";
export const BACKUP_REMINDER_DAYS = 7;

export function useLastBackup() {
  const { adapter } = useData();
  const read = React.useCallback(() => (adapter instanceof DemoAdapter ? adapter.getMeta("lastBackupAt") : null), [adapter]);
  const [value, setValue] = React.useState<string | null>(read);
  React.useEffect(() => {
    const on = () => setValue(read());
    window.addEventListener(BACKUP_EVENT, on);
    return () => window.removeEventListener(BACKUP_EVENT, on);
  }, [read]);
  return value;
}

export function daysSince(iso: string | null) {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;
}

function fmtBytes(n: number | null) {
  if (n == null) return "unknown";
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Back up / restore for the on-device "My classroom" workspace. */
export function BackupPanel() {
  const { adapter } = useData();
  const run = useAction();
  const last = useLastBackup();
  const [protect, setProtect] = React.useState(true);
  const [pass, setPass] = React.useState("");
  const [pass2, setPass2] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<Awaited<ReturnType<typeof storageStatus>> | null>(null);
  React.useEffect(() => {
    void storageStatus().then(setStatus);
  }, []);

  if (!(adapter instanceof DemoAdapter)) return null;
  const passError = protect && pass && pass.length < 8 ? "Use at least 8 characters." : protect && pass2 && pass !== pass2 ? "Passphrases don't match." : null;
  const canBackup = !protect || (pass.length >= 8 && pass === pass2);
  const days = daysSince(last);

  const backup = async () => {
    setBusy(true);
    await run(
      async () => {
        const text = await makeBackup(await adapter.snapshot(), protect ? pass : undefined);
        downloadFile(backupFilename(new Date(), protect), text, "application/json");
        await adapter.setMeta("lastBackupAt", new Date().toISOString());
        window.dispatchEvent(new Event(BACKUP_EVENT));
      },
      { success: protect ? "Encrypted backup downloaded. Keep the passphrase somewhere safe." : "Backup downloaded. Store it somewhere private — it contains student records." },
    );
    setBusy(false);
  };

  return (
    <div className="grid gap-5 text-sm">
      <div className="grid gap-2">
        <h3 className="font-semibold">Back up</h3>
        <p className="text-muted-foreground">
          Last backup: <strong className={days == null || days > BACKUP_REMINDER_DAYS ? "text-destructive" : "text-foreground"}>{last ? `${new Date(last).toLocaleString()} (${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`})` : "never"}</strong>. Save the file to a private location such as your school OneDrive or Google Drive (not a shared folder).
        </p>
        <label className="flex items-center gap-2">
          <Checkbox checked={protect} onChange={(e) => setProtect(e.target.checked)} /> Protect with a passphrase (recommended)
        </label>
        {protect && (
          <div className="flex flex-wrap items-start gap-3">
            <Field label="Passphrase" htmlFor="bk-pass" hint="If you forget it, the backup can't be opened." error={passError ?? undefined}>
              <Input id="bk-pass" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} className="w-60" />
            </Field>
            <Field label="Repeat passphrase" htmlFor="bk-pass2">
              <Input id="bk-pass2" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} className="w-60" />
            </Field>
          </div>
        )}
        <Button variant="brand" className="justify-self-start" disabled={!canBackup || busy} onClick={backup}>
          <Download /> {busy ? "Preparing…" : "Download backup"}
        </Button>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">Restore</h3>
        <p className="text-muted-foreground">Replace this device&apos;s copy of My classroom with a backup file — for example on a new computer, or after the browser&apos;s data was cleared.</p>
        <RestoreBackup replacing compact />
      </div>
      <div className="grid gap-1.5">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <HardDrive className="size-4" aria-hidden /> Storage on this device
        </h3>
        <p className="text-muted-foreground">
          Using {fmtBytes(status?.usage ?? null)}
          {status?.quota ? ` of ${fmtBytes(status.quota)} available` : ""}.{" "}
          {status?.persisted
            ? "The browser has agreed to keep this data permanently."
            : "The browser may clear this data if the device runs low on space."}
        </p>
        {status && !status.persisted && (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={async () => {
              const ok = await requestPersistentStorage();
              setStatus(await storageStatus());
              if (!ok) await run(async () => { throw new Error("The browser declined. Installing ClassPulse as an app, or bookmarking it, usually lets the browser keep data permanently."); });
            }}
          >
            Ask the browser to keep data permanently
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Clearing this browser&apos;s site data, using a private window, or resetting the device removes the on-device copy. Your backup files are the safety net.</p>
      </div>
    </div>
  );
}
