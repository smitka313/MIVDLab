"use client";

import { studentHref } from "@/lib/paths";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, NotebookPen, SlidersHorizontal } from "lucide-react";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { AttendanceStatus, ObservationKind, Student } from "@/lib/types";
import { colorClasses } from "@/lib/labels";
import { cn, displayName, toISODate } from "@/lib/utils";
import { QuickBehaviorButtons } from "@/features/observations/quick-buttons";
import { ObservationForm } from "@/features/observations/observation-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Textarea } from "@/components/ui/input";
import { appendPhrase, DictationTip, NoteTemplateChips } from "@/features/notes/note-templates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Save (or change) today's attendance for one student; returns the stored row. */
export function useSetAttendance() {
  const store = useStore();
  const run = useAction();
  return React.useCallback(
    async (classId: string, student: Student, status: AttendanceStatus, date = toISODate()) => {
      const prev = store.rows("attendance_records").find((r) => r.class_id === classId && r.student_id === student.id && r.date === date);
      return run(
        () => store.upsert("attendance_records", [{ class_id: classId, student_id: student.id, date, status_id: status.id, note: prev?.note ?? null }], ["class_id", "student_id", "date"]),
        {
          success: `${displayName(student)}: ${status.label}`,
          undo: async ([row]) => {
            if (prev) await store.update("attendance_records", row.id, { status_id: prev.status_id });
            else await store.remove("attendance_records", [row.id]);
          },
        },
      );
    },
    [store, run],
  );
}

export function AttendanceButtons({ classId, student, date = toISODate(), size = "default" }: { classId: string; student: Student; date?: string; size?: "default" | "sm" }) {
  const statuses = useRows("attendance_statuses");
  const records = useRows("attendance_records");
  const setAttendance = useSetAttendance();
  const current = records.rows.find((r) => r.class_id === classId && r.student_id === student.id && r.date === date);
  const active = statuses.rows.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div role="radiogroup" aria-label={`Attendance for ${displayName(student)}`} className="flex flex-wrap gap-1.5">
      {active.map((s) => {
        const on = current?.status_id === s.id;
        const c = colorClasses(s.color);
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={s.label}
            onClick={() => !on && setAttendance(classId, student, s, date)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border font-medium transition-colors",
              size === "sm" ? "h-7 min-w-7 justify-center px-1.5 text-xs" : "h-9 px-3 text-sm",
              on ? `${c.soft} ${c.border} ${c.text} ring-2 ring-current/30` : "bg-card hover:bg-secondary",
            )}
          >
            <span className={size === "sm" ? "" : "font-mono text-xs"}>{s.code}</span>
            {size !== "sm" && <span>{s.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function NoteForm({ student, classId, onDone }: { student: Student; classId?: string | null; onDone?: () => void }) {
  const store = useStore();
  const run = useAction();
  const [body, setBody] = React.useState("");
  const [forSub, setForSub] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    const ok = await run(() => store.insertOne("student_notes", { student_id: student.id, class_id: classId ?? null, body: body.trim(), share_with_sub: forSub }), {
      success: "Note saved",
      undo: (r) => store.remove("student_notes", [r.id]),
    });
    setSaving(false);
    if (ok) {
      setBody("");
      setForSub(false);
      onDone?.();
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-2">
      <label htmlFor={`note-${student.id}`} className="text-sm font-medium">
        Private note about {displayName(student)}
      </label>
      <NoteTemplateChips
        onPick={(t) => {
          setBody((b) => appendPhrase(b, t));
          ref.current?.focus();
        }}
      />
      <Textarea ref={ref} id={`note-${student.id}`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={3} placeholder="Only you can see teacher notes." />
      <DictationTip />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={forSub} onChange={(e) => setForSub(e.target.checked)} /> Include in substitute packet
        </label>
        <Button type="submit" size="sm" disabled={!body.trim() || saving}>
          Save note
        </Button>
      </div>
    </form>
  );
}

/**
 * Compact action panel shown after selecting a student in Live Classroom mode
 * or Quick Log. Logging a routine observation takes one click from here.
 */
export function StudentActionPanel({ student, classId, onDone, defaultTab = "positive" }: { student: Student; classId: string; onDone?: () => void; defaultTab?: string }) {
  const [tab, setTab] = React.useState(defaultTab);
  const tabs: { value: ObservationKind; label: string }[] = [
    { value: "positive", label: "Positive" },
    { value: "redirection", label: "Redirection" },
    { value: "engagement", label: "Engagement" },
  ];
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold leading-tight">{displayName(student)}</p>
          {student.preferred_name && <p className="text-xs text-muted-foreground">{student.first_name} {student.last_name}</p>}
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={studentHref(student.id)}>
            Profile <ExternalLink />
          </Link>
        </Button>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="min-w-0">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="note" aria-label="Add note">
            <NotebookPen />
            <span className="sr-only sm:not-sr-only">Note</span>
          </TabsTrigger>
          <TabsTrigger value="details" aria-label="Detailed observation">
            <SlidersHorizontal />
            <span className="sr-only sm:not-sr-only">Details</span>
          </TabsTrigger>
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-3">
            <QuickBehaviorButtons student={student} classId={classId} kinds={[t.value]} onLogged={onDone} compact />
          </TabsContent>
        ))}
        <TabsContent value="attendance" className="mt-3">
          <p className="mb-2 text-xs text-muted-foreground">Today · classroom record (not the official school record)</p>
          <AttendanceButtons classId={classId} student={student} />
        </TabsContent>
        <TabsContent value="note" className="mt-3">
          <NoteForm student={student} classId={classId} onDone={onDone} />
        </TabsContent>
        <TabsContent value="details" className="mt-3">
          <ObservationForm defaults={{ class_id: classId, student_id: student.id }} onDone={() => (onDone ? onDone() : setTab("positive"))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
