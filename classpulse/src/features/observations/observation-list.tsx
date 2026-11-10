"use client";

import { studentHref } from "@/lib/paths";

import * as React from "react";
import Link from "next/link";
import { Flag, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useAction, useStore } from "@/components/providers/data-provider";
import type { Observation } from "@/lib/types";
import { ACTIVITY_LABELS, KIND_COLOR, KIND_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pagination, usePaged } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm";
import { RecordHistoryButton } from "@/features/audit/record-history";
import { useClassMap, useFormat, useStudentMap } from "@/lib/hooks";
import { displayName } from "@/lib/utils";
import { ObservationForm } from "./observation-form";

/** Observation history with correction (audit-logged), history and delete. */
export function ObservationList({ items, showStudent = true, pageSize = 25, empty }: { items: Observation[]; showStudent?: boolean; pageSize?: number; empty?: React.ReactNode }) {
  const students = useStudentMap();
  const classes = useClassMap();
  const fmt = useFormat();
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState<Observation | null>(null);
  const sorted = React.useMemo(() => [...items].sort((a, b) => b.observed_at.localeCompare(a.observed_at)), [items]);
  const paged = usePaged(sorted, pageSize);

  const remove = async (o: Observation) => {
    if (!(await confirm({ title: "Delete this observation?", description: "It will be removed from reports. The deletion is recorded in the audit log.", confirmLabel: "Delete", destructive: true }))) return;
    const { id: _id, teacher_id: _t, created_at: _c, updated_at: _u, ...rest } = o;
    void _id; void _t; void _c; void _u;
    await run(() => store.remove("observations", [o.id]), { success: "Observation deleted", undo: () => store.insertOne("observations", rest) });
  };

  if (!items.length) return <>{empty ?? <p className="py-6 text-center text-sm text-muted-foreground">No observations match.</p>}</>;

  return (
    <>
      <ul className="divide-y">
        {paged.slice.map((o) => {
          const s = students.get(o.student_id);
          const c = classes.get(o.class_id);
          return (
            <li key={o.id} className="flex items-start gap-3 py-3">
              <Badge color={KIND_COLOR[o.kind]} className="mt-0.5 w-24 justify-center">
                {KIND_LABELS[o.kind]}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {showStudent && s && (
                    <>
                      <Link href={studentHref(s.id)} className="font-medium hover:underline">
                        {displayName(s)}
                      </Link>
                      {" — "}
                    </>
                  )}
                  <span className={showStudent ? "" : "font-medium"}>{o.behavior_label}</span>
                  {o.follow_up_required && (
                    <Badge color="rose" className="ml-2">
                      <Flag className="size-3" aria-hidden /> Follow-up
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmt.dateTime(o.observed_at)}
                  {c && ` · P${c.period} ${c.course_name}`}
                  {o.activity && ` · ${ACTIVITY_LABELS[o.activity]}`}
                  {o.category_name !== KIND_LABELS[o.kind] && ` · ${o.category_name}`}
                </p>
                {(o.note || o.context || o.intervention_used) && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[o.context && `Context: ${o.context}`, o.intervention_used && `Intervention: ${o.intervention_used}`, o.note].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center">
                <RecordHistoryButton recordId={o.id} label="" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Observation options">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setEditing(o)}>
                      <Pencil /> Correct…
                    </DropdownMenuItem>
                    {o.follow_up_required && (
                      <DropdownMenuItem onSelect={() => run(() => store.update("observations", o.id, { follow_up_required: false }), { success: "Follow-up marked done" })}>
                        <Flag /> Mark follow-up done
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => remove(o)}>
                      <Trash2 /> Delete…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>
      <Pagination page={paged.page} pageCount={paged.pageCount} onPage={paged.setPage} total={sorted.length} label="observations" />
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title="Correct observation" description="Corrections are saved with a full change history." className="max-w-xl">
          {editing && <ObservationForm existing={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
