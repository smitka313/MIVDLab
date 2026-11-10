"use client";

import * as React from "react";
import Link from "next/link";
import { HardDrive, X } from "lucide-react";
import { useData, useRows } from "@/components/providers/data-provider";
import { BACKUP_REMINDER_DAYS, daysSince, useLastBackup } from "./backup-panel";

const DISMISS_KEY = "classpulse.backupReminderDismissed";

/** Personal mode: reminds the teacher to back up once they have records and no recent backup. */
export function BackupReminder() {
  const { adapter } = useData();
  const students = useRows("students");
  const last = useLastBackup();
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const days = daysSince(last);
  if (adapter.mode !== "personal" || dismissed || !students.rows.length) return null;
  if (days != null && days <= BACKUP_REMINDER_DAYS) return null;
  return (
    <div role="status" className="no-print flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <HardDrive className="size-3.5 shrink-0" aria-hidden />
      <span>
        Your records are saved only on this device. {last ? `Last backup was ${days} days ago.` : "You haven't made a backup yet."}{" "}
        <Link href="/settings#backup" className="underline underline-offset-2">
          Back up now
        </Link>
      </span>
      <button
        type="button"
        aria-label="Dismiss until next time"
        className="rounded p-0.5 hover:bg-amber-200 dark:hover:bg-amber-900"
        onClick={() => {
          try {
            window.sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
