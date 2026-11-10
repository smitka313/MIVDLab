"use client";

import * as React from "react";
import { History } from "lucide-react";
import { useRows } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LoadingState } from "@/components/ui/states";

const HIDDEN = new Set(["id", "teacher_id", "created_at", "updated_at", "category_id", "behavior_id", "student_id", "class_id", "status_id", "group_id", "strategy_id", "plan_id"]);

function fmt(v: unknown) {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  return String(v);
}

/** Shows the audit trail (every insert/update/delete) for one record. */
export function RecordHistoryButton({ recordId, label = "History" }: { recordId: string; label?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label="View change history">
        <History /> <span className="hidden sm:inline">{label}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Change history" description="Every change to this record is kept in the audit log.">
          {open && <HistoryList recordId={recordId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function HistoryList({ recordId }: { recordId: string }) {
  const logs = useRows("audit_logs");
  if (logs.status !== "ready") return <LoadingState />;
  const entries = logs.rows.filter((l) => l.record_id === recordId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (!entries.length) return <p className="text-sm text-muted-foreground">No history recorded (records created before auditing began, or not an audited record type).</p>;
  return (
    <ol className="grid gap-3">
      {entries.map((e) => {
        const changes =
          e.action === "update" && e.old_data && e.new_data
            ? Object.keys(e.new_data).filter((k) => !HIDDEN.has(k) && JSON.stringify(e.old_data![k]) !== JSON.stringify(e.new_data![k]))
            : [];
        return (
          <li key={e.id} className="rounded-lg border p-3 text-sm">
            <p className="font-medium capitalize">
              {e.action === "insert" ? "Created" : e.action === "update" ? "Edited" : "Deleted"}{" "}
              <span className="font-normal text-muted-foreground">· {new Date(e.created_at).toLocaleString()}</span>
            </p>
            {changes.length > 0 && (
              <ul className="mt-1 grid gap-0.5 text-xs">
                {changes.map((k) => (
                  <li key={k}>
                    <span className="font-medium">{k.replace(/_/g, " ")}:</span> <span className="line-through opacity-70">{fmt(e.old_data![k])}</span> → {fmt(e.new_data![k])}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
