"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { useAction, useData, useRows, useStore, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Textarea } from "@/components/ui/input";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { SeatingChart } from "@/features/seating/seating-chart";
import { classLabel, useActiveClasses, useRoster } from "@/lib/hooks";
import type { ClassSection } from "@/lib/types";
import { displayName, formatTime } from "@/lib/utils";

/** Printable substitute packet: instructions, seating chart, roster and notes marked for the sub. */
export default function SubPacketPage() {
  const status = useTables("classes", "students", "enrollments", "seating_layouts", "seats", "student_notes");
  const { rows: classes } = useActiveClasses();
  const { profile } = useData();
  const [picked, setPicked] = React.useState<Set<string> | null>(null);
  const chosen = picked ?? new Set(classes.map((c) => c.id));

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Substitute packet"
        description="One printed page per class: your instructions, the seating chart, the roster, and only the notes you marked for a substitute."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/classroom">
                <ArrowLeft /> Classroom
              </Link>
            </Button>
            <Button onClick={() => window.print()} disabled={!chosen.size}>
              <Printer /> Print / Save as PDF
            </Button>
          </>
        }
      />
      <Card className="no-print mb-4">
        <CardContent className="flex flex-wrap gap-2 pt-5">
          {classes.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
              <Checkbox
                checked={chosen.has(c.id)}
                onChange={(e) => {
                  const n = new Set(chosen);
                  if (e.target.checked) n.add(c.id);
                  else n.delete(c.id);
                  setPicked(n);
                }}
              />
              {classLabel(c)}
            </label>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-6">
        {classes
          .filter((c) => chosen.has(c.id))
          .map((c, i) => (
            <ClassSheet key={c.id} cls={c} teacher={profile.display_name} breakBefore={i > 0} />
          ))}
      </div>
    </>
  );
}

function ClassSheet({ cls, teacher, breakBefore }: { cls: ClassSection; teacher: string; breakBefore: boolean }) {
  const roster = useRoster(cls.id);
  const layouts = useRows("seating_layouts");
  const seats = useRows("seats");
  const notes = useRows("student_notes");
  const store = useStore();
  const run = useAction();
  const layout = layouts.rows.find((l) => l.id === cls.default_layout_id) ?? layouts.rows.find((l) => l.class_id === cls.id);
  const layoutSeats = seats.rows.filter((s) => s.layout_id === layout?.id);
  const studentMap = new Map(roster.map((s) => [s.id, s]));
  const subNotes = notes.rows.filter((n) => n.share_with_sub && studentMap.has(n.student_id)).sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <section className={breakBefore ? "print-break" : undefined} aria-label={classLabel(cls)}>
      <Card className="print:border-0 print:shadow-none">
        <CardContent className="grid gap-4 pt-5">
          <header className="border-b pb-2">
            <h2 className="text-xl font-semibold">
              {cls.course_name} — Period {cls.period}
            </h2>
            <p className="text-sm text-muted-foreground">
              {[cls.start_time && `${formatTime(cls.start_time)}–${formatTime(cls.end_time)}`, cls.room && `Room ${cls.room}`, teacher && `Teacher: ${teacher}`, `${roster.length} students`].filter(Boolean).join(" · ")}
            </p>
          </header>
          <div className="grid gap-1.5">
            <h3 className="text-sm font-semibold">Instructions for the substitute</h3>
            <Textarea
              aria-label={`Substitute instructions for ${classLabel(cls)}`}
              className="no-print"
              rows={3}
              maxLength={5000}
              defaultValue={cls.sub_notes ?? ""}
              key={cls.updated_at}
              placeholder="e.g. Today's lesson, where materials are, which students can help, emergency procedures."
              onBlur={(e) => e.target.value !== (cls.sub_notes ?? "") && run(() => store.update("classes", cls.id, { sub_notes: e.target.value.trim() || null }), { success: "Instructions saved" })}
            />
            <p className="hidden whitespace-pre-wrap text-sm print:block">{cls.sub_notes || "—"}</p>
          </div>
          {layout && layoutSeats.length > 0 && (
            <div className="grid gap-1.5">
              <h3 className="text-sm font-semibold">Seating chart ({layout.name})</h3>
              <SeatingChart layout={layout} seats={layoutSeats} students={studentMap} mode="print" />
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
            <div>
              <h3 className="mb-1.5 text-sm font-semibold">Roster</h3>
              <ol className="columns-2 gap-4 text-sm">
                {roster.map((s) => (
                  <li key={s.id} className="break-inside-avoid">
                    {displayName(s)}
                    {s.preferred_name && <span className="text-muted-foreground"> ({s.first_name})</span>}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="mb-1.5 text-sm font-semibold">Notes for the substitute</h3>
              {subNotes.length ? (
                <ul className="grid gap-1 text-sm">
                  {subNotes.map((n) => (
                    <li key={n.id}>
                      <strong>{displayName(studentMap.get(n.student_id)!)}:</strong> {n.body}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None. Mark a student note &ldquo;Include in substitute packet&rdquo; to list it here; other notes stay private.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
