"use client";

import { classHref } from "@/lib/paths";

import * as React from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Clock, MapPin, MoreHorizontal, Pencil, Plus, Presentation, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { useAction, useRows, useStore, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";
import { ClassForm } from "@/features/classes/class-form";
import { classInSession, sortClasses } from "@/lib/hooks";
import { colorClasses } from "@/lib/labels";
import type { ClassSection } from "@/lib/types";
import { cn, formatTime, pluralize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function ClassroomPage() {
  const status = useTables("classes", "enrollments", "students");
  const classes = useRows("classes");
  const enrollments = useRows("enrollments");
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState<ClassSection | "new" | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const e of enrollments.rows) if (!e.dropped_at) m.set(e.class_id, (m.get(e.class_id) ?? 0) + 1);
    return m;
  }, [enrollments.rows]);

  const active = classes.rows.filter((c) => !c.archived_at).sort(sortClasses);
  const archived = classes.rows.filter((c) => c.archived_at).sort(sortClasses);
  const inSession = classInSession(active);

  const archive = (c: ClassSection, on: boolean) =>
    run(() => store.update("classes", c.id, { archived_at: on ? new Date().toISOString() : null }), {
      success: on ? `Archived ${c.course_name} (P${c.period})` : "Class restored",
      undo: () => store.update("classes", c.id, { archived_at: on ? null : c.archived_at }),
    });

  const remove = async (c: ClassSection) => {
    const ok = await confirm({
      title: `Delete ${c.course_name} (Period ${c.period})?`,
      description: "This permanently deletes the class with its seating charts, attendance, observations, groups and projects. Students stay in your student list. Archiving is usually a better choice.",
      confirmLabel: "Delete class",
      destructive: true,
      typeToConfirm: "DELETE",
    });
    if (ok) await run(() => store.remove("classes", [c.id]), { success: "Class deleted" });
  };

  return (
    <>
      <PageHeader
        title="Classroom"
        description="Your class periods. Open a class for the live seating chart, roster and layouts."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> New class
          </Button>
        }
      />
      {status.error ? (
        <ErrorState error={status.error} onRetry={status.retry} />
      ) : status.loading ? (
        <LoadingState />
      ) : !active.length ? (
        <EmptyState
          icon={Presentation}
          title="No classes yet"
          description="Create your first class period, then add or import students."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus /> New class
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((c) => (
            <li key={c.id}>
              <ClassCard c={c} count={counts.get(c.id) ?? 0} live={inSession?.id === c.id} onEdit={() => setEditing(c)} onArchive={() => archive(c, true)} onDelete={() => remove(c)} />
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="mt-8">
          <button type="button" className="text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowArchived((s) => !s)} aria-expanded={showArchived}>
            {showArchived ? "Hide" : "Show"} archived classes ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-3 grid gap-2">
              {archived.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
                  <span>
                    P{c.period} · {c.course_name}
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => archive(c, false)}>
                      <ArchiveRestore /> Restore
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c)} aria-label={`Delete ${c.course_name}`}>
                      <Trash2 />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "New class" : "Edit class"}>
          {editing !== null && <ClassForm existing={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClassCard({ c, count, live, onEdit, onArchive, onDelete }: { c: ClassSection; count: number; live: boolean; onEdit: () => void; onArchive: () => void; onDelete: () => void }) {
  const col = colorClasses(c.color);
  return (
    <Card className="relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div aria-hidden className={cn("h-1.5", col.dot)} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Period {c.period}</p>
            <h2 className="truncate text-lg font-semibold">
              <Link href={classHref(c.id)} className="after:absolute after:inset-0 focus-visible:outline-none">
                {c.course_name}
              </Link>
            </h2>
          </div>
          <div className="relative z-10 flex items-center gap-1">
            {live && <Badge color="emerald">In session</Badge>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Options for ${c.course_name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onArchive}>
                  <Archive /> Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={onDelete}>
                  <Trash2 /> Delete…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <dl className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Students</dt>
            <Users className="size-4" aria-hidden />
            <dd>{pluralize(count, "student")}</dd>
          </div>
          {c.start_time && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Time</dt>
              <Clock className="size-4" aria-hidden />
              <dd>
                {formatTime(c.start_time)}–{formatTime(c.end_time)}
              </dd>
            </div>
          )}
          {c.room && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Room</dt>
              <MapPin className="size-4" aria-hidden />
              <dd>Room {c.room}</dd>
            </div>
          )}
        </dl>
      </div>
    </Card>
  );
}
