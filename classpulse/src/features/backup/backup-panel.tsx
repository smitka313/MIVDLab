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
import { canChooseBackupFile, chooseBackupFile, forgetBackupFile, getBackupFile, rememberPassphraseForTab, tabPassphrase, writeBackupFile } from "./backup-file";
import { useRouter } from "next/navigation";

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

async function recordBackup(adapter: DemoAdapter) {
  await adapter.setMeta("lastBackupAt", new Date().toISOString());
  window.dispatchEvent(new Event(BACKUP_EVENT));
}

/** Make a backup and save it to the chosen file, or as a download. */
async function runBackup(adapter: DemoAdapter, passphrase: string | undefined, toFile: boolean) {
  const text = await makeBackup(await adapter.snapshot(), passphrase);
  const handle = toFile ? await getBackupFile() : null;
  if (handle) await writeBackupFile(handle, text);
  else downloadFile(backupFilename(new Date(), !!passphrase), text, "application/json");
  await adapter.setMeta("backupEncrypted", passphrase ? "1" : "0");
  if (passphrase) rememberPassphraseForTab(passphrase);
  await recordBackup(adapter);
  return handle?.name ?? null;
}

/**
 * "Back up now" from anywhere: writes straight to the chosen backup file when
 * possible (and, for encrypted backups, the passphrase was entered in this
 * tab); otherwise opens Settings → Backup & restore.
 */
export function useQuickBackup() {
  const { adapter } = useData();
  const run = useAction();
  const router = useRouter();
  return async () => {
    if (!(adapter instanceof DemoAdapter)) return;
    const handle = await getBackupFile();
    const encrypted = adapter.getMeta("backupEncrypted") !== "0";
    const pass = tabPassphrase();
    if (!handle || (encrypted && !pass)) {
      router.push("/settings#backup");
      return;
    }
    await run(() => runBackup(adapter, encrypted ? pass! : undefined, true), { success: (name) => `Backed up to ${name}` });
  };
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
  const [fileName, setFileName] = React.useState<string | null>(null);
  React.useEffect(() => {
    void storageStatus().then(setStatus);
    void getBackupFile().then((h) => setFileName(h?.name ?? null));
  }, []);

  if (!(adapter instanceof DemoAdapter)) return null;
  const passError = protect && pass && pass.length < 8 ? "Use at least 8 characters." : protect && pass2 && pass !== pass2 ? "Passphrases don't match." : null;
  const canBackup = !protect || (pass.length >= 8 && pass === pass2);
  const days = daysSince(last);

  const backup = async (toFile: boolean) => {
    setBusy(true);
    await run(() => runBackup(adapter, protect ? pass : undefined, toFile), {
      success: (name) => (name ? `Backed up to ${name}` : protect ? "Encrypted backup downloaded. Keep the passphrase somewhere safe." : "Backup downloaded. Store it somewhere private — it contains student records."),
    });
    setBusy(false);
  };

  const chooseFile = async () => {
    try {
      const h = await chooseBackupFile();
      setFileName(h.name);
      if (canBackup) await backup(true);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") await run(async () => { throw e; });
    }
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
        {fileName ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="brand" disabled={!canBackup || busy} onClick={() => backup(true)}>
              <Download /> {busy ? "Backing up…" : "Back up now"}
            </Button>
            <span className="text-muted-foreground">
              to <strong className="text-foreground">{fileName}</strong>
            </span>
            <Button variant="ghost" size="sm" onClick={chooseFile}>
              Change file
            </Button>
            <Button variant="ghost" size="sm" onClick={async () => { await forgetBackupFile(); setFileName(null); }}>
              Use downloads instead
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="brand" disabled={!canBackup || busy} onClick={() => backup(false)}>
              <Download /> {busy ? "Preparing…" : "Download backup"}
            </Button>
            {canChooseBackupFile() && (
              <Button variant="outline" disabled={!canBackup || busy} onClick={chooseFile}>
                Set up one-click backup…
              </Button>
            )}
          </div>
        )}
        {canChooseBackupFile() && !fileName && (
          <p className="text-xs text-muted-foreground">One-click backup: choose a file once — for example in your OneDrive or Google Drive folder — and &ldquo;Back up now&rdquo; updates it without a download dialog.</p>
        )}
        {fileName && protect && <p className="text-xs text-muted-foreground">Your passphrase is remembered only until you close this tab, so &ldquo;Back up now&rdquo; in the banner works without retyping it.</p>}
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
