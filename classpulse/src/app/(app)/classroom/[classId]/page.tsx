"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, LayoutGrid, Pencil, Plus, Presentation, Upload, UserMinus, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { useAction, useData, useRows, useStore, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm";
import { ClassForm } from "@/features/classes/class-form";
import { LiveClassroom } from "@/features/classroom/live-classroom";
import { LayoutEditor } from "@/features/seating/layout-editor";
import { StudentForm } from "@/features/students/student-form";
import { StudentAvatar } from "@/features/students/photo";
import { useRoster } from "@/lib/hooks";
import type { ClassSection, Student } from "@/lib/types";
import { byName, displayName, formatTime, toISODate } from "@/lib/utils";

export default function ClassPage() {
  const { classId } = useParams<{ classId: string }>();
  const status = useTables("classes", "students", "enrollments", "seating_layouts", "seats", "attendance_records", "attendance_statuses", "observations");
  const classes = useRows("classes");
  const cls = classes.rows.find((c) => c.id === classId);
  const roster = useRoster(classId);
  const { prefs, updatePrefs } = useData();
  const [tab, setTab] = React.useState("live");
  const [layoutId, setLayoutId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);

  // Opening a class makes it the current period.
  React.useEffect(() => {
    if (cls && prefs.current_class_id !== cls.id) void updatePrefs({ current_class_id: cls.id }).catch(() => undefined);
  }, [cls, prefs.current_class_id, updatePrefs]);

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;
  if (!cls)
    return (
      <EmptyState
        icon={Presentation}
        title="Class not found"
        description="It may have been deleted."
        action={
          <Button asChild>
            <Link href="/classroom">Back to classes</Link>
          </Button>
        }
      />
    );

  return (
    <>
      <PageHeader
        title={`${cls.course_name} · Period ${cls.period}`}
        description={[cls.start_time && `${formatTime(cls.start_time)}–${formatTime(cls.end_time)}`, cls.room && `Room ${cls.room}`, `${roster.length} students`, cls.archived_at && "Archived"].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/classroom">
                <ArrowLeft /> All classes
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit class
            </Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print">
          <TabsTrigger value="live">
            <Presentation /> Live classroom
          </TabsTrigger>
          <TabsTrigger value="roster">
            <Users /> Roster
          </TabsTrigger>
          <TabsTrigger value="layouts">
            <LayoutGrid /> Seating layouts
          </TabsTrigger>
        </TabsList>
        <TabsContent value="live">
          <LiveClassroom cls={cls} roster={roster} />
        </TabsContent>
        <TabsContent value="roster">
          <ClassRoster cls={cls} roster={roster} />
        </TabsContent>
        <TabsContent value="layouts">
          <LayoutEditor cls={cls} roster={roster} layoutId={layoutId} setLayoutId={setLayoutId} />
        </TabsContent>
      </Tabs>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title="Edit class">{editing && <ClassForm existing={cls} onDone={() => setEditing(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

function ClassRoster({ cls, roster }: { cls: ClassSection; roster: Student[] }) {
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const students = useRows("students");
  const [adding, setAdding] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const drop = async (s: Student) => {
    const en = store.rows("enrollments").find((e) => e.class_id === cls.id && e.student_id === s.id && !e.dropped_at);
    if (!en) return;
    const ok = await confirm({
      title: `Remove ${displayName(s)} from this class?`,
      description: "Their existing observations and attendance for this class are kept. You can re-add them later.",
      confirmLabel: "Remove from class",
    });
    if (ok)
      await run(() => store.update("enrollments", en.id, { dropped_at: toISODate() }), {
        success: `Removed ${displayName(s)}`,
        undo: () => store.update("enrollments", en.id, { dropped_at: null }),
      });
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setCreating(true)}>
          <Plus /> New student
        </Button>
        <Button variant="outline" onClick={() => setAdding(true)}>
          <UserPlus /> Add existing students
        </Button>
        <Button asChild variant="outline">
          <Link href={`/students/import?class=${cls.id}`}>
            <Upload /> Import CSV
          </Link>
        </Button>
      </div>
      {roster.length ? (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Grade</TH>
                <TH className="hidden sm:table-cell">Student ID</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {roster.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <Link href={`/students/${s.id}`} className="flex items-center gap-2 font-medium hover:underline">
                      <StudentAvatar student={s} className="size-7 text-[10px]" />
                      {displayName(s)}
                    </Link>
                  </TD>
                  <TD>{s.grade_level ?? "—"}</TD>
                  <TD className="hidden text-muted-foreground sm:table-cell">{s.school_student_id}</TD>
                  <TD className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => drop(s)} aria-label={`Remove ${displayName(s)} from class`}>
                      <UserMinus /> <span className="hidden sm:inline">Remove</span>
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : (
        <EmptyState icon={Users} title="No students enrolled" description="Add new students, pick from your existing students, or import a CSV." />
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="New student" className="max-w-xl">
          {creating && <StudentForm defaultClassId={cls.id} onDone={() => setCreating(false)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title="Add existing students" description={`Choose students to add to ${cls.course_name} (P${cls.period}).`}>
          {adding && <AddExisting cls={cls} candidates={students.rows.filter((s) => !s.archived_at && !roster.some((r) => r.id === s.id)).sort(byName)} onDone={() => setAdding(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddExisting({ cls, candidates, onDone }: { cls: ClassSection; candidates: Student[]; onDone: () => void }) {
  const store = useStore();
  const run = useAction();
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const list = candidates.filter((s) => `${s.first_name} ${s.last_name} ${s.preferred_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const save = async () => {
    const ids = [...picked];
    const existing = store.rows("enrollments").filter((e) => e.class_id === cls.id);
    const add = ids.filter((id) => !existing.some((e) => e.student_id === id));
    const rejoin = existing.filter((e) => ids.includes(e.student_id));
    const ok = await run(
      async () => {
        if (add.length) await store.insert("enrollments", add.map((student_id) => ({ class_id: cls.id, student_id, enrolled_at: toISODate(), dropped_at: null })));
        for (const e of rejoin) await store.update("enrollments", e.id, { dropped_at: null });
        return true;
      },
      { success: `Added ${ids.length} student${ids.length === 1 ? "" : "s"}` },
    );
    if (ok) onDone();
  };
  if (!candidates.length) return <p className="text-sm text-muted-foreground">All of your students are already in this class.</p>;
  return (
    <div className="grid gap-3">
      <Input aria-label="Search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="max-h-80 overflow-y-auto rounded-lg border">
        {list.map((s) => (
          <li key={s.id} className="border-b last:border-0">
            <label className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/50">
              <Checkbox checked={picked.has(s.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
              {displayName(s)}
              <span className="ml-auto text-xs text-muted-foreground">{s.grade_level ? `Grade ${s.grade_level}` : ""}</span>
            </label>
          </li>
        ))}
      </ul>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={!picked.size} onClick={save}>
          Add {picked.size || ""}
        </Button>
      </DialogFooter>
    </div>
  );
}
