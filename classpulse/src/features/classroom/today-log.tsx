"use client";

import * as React from "react";
import { Pencil, Undo2 } from "lucide-react";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { ClassSection, Observation } from "@/lib/types";
import { KIND_COLOR, KIND_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ObservationForm } from "@/features/observations/observation-form";
import { useFormat, useStudentMap } from "@/lib/hooks";
import { displayName, isoDateOf, toISODate } from "@/lib/utils";

/** What has been recorded for this class today, newest first, with one-tap undo or edit. */
export function TodayLog({ cls, className }: { cls: ClassSection; className?: string }) {
  const observations = useRows("observations");
  const students = useStudentMap();
  const store = useStore();
  const run = useAction();
  const fmt = useFormat();
  const [editing, setEditing] = React.useState<Observation | null>(null);
  const today = toISODate();
  const items = observations.rows.filter((o) => o.class_id === cls.id && isoDateOf(o.observed_at) === today).sort((a, b) => b.observed_at.localeCompare(a.observed_at));

  const undo = (o: Observation) => {
    const { id: _i, teacher_id: _t, created_at: _c, updated_at: _u, ...rest } = o;
    void _i; void _t; void _c; void _u;
    void run(() => store.remove("observations", [o.id]), { success: "Removed", undo: () => store.insertOne("observations", rest) });
  };

  return (
    <aside aria-label="Today's log" className={className}>
      <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
        Today&apos;s log <span className="rounded-md border bg-secondary px-1.5 py-0.5 text-xs font-medium">{items.length}</span>
      </h3>
      {items.length ? (
        <ol className="grid max-h-[60vh] gap-1.5 overflow-y-auto pr-1">
          {items.map((o) => {
            const s = students.get(o.student_id);
            return (
              <li key={o.id} className="flex items-start gap-2 rounded-lg border bg-card px-2.5 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s ? displayName(s) : "Student"}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge color={KIND_COLOR[o.kind]}>{KIND_LABELS[o.kind]}</Badge>
                    <span className="truncate">{o.behavior_label}</span>
                    <span>{fmt.time(o.observed_at)}</span>
                  </p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${o.behavior_label} for ${s ? displayName(s) : "student"}`} onClick={() => setEditing(o)}>
                  <Pencil />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Undo ${o.behavior_label} for ${s ? displayName(s) : "student"}`} onClick={() => undo(o)}>
                  <Undo2 />
                </Button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing recorded for this class today yet.</p>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title="Edit observation" className="max-w-xl">
          {editing && <ObservationForm existing={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
