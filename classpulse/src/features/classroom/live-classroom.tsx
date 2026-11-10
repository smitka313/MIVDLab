"use client";

import * as React from "react";
import { CheckCheck, LayoutGrid, List, Plus, Printer } from "lucide-react";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { Activity, ClassSection, Seat, Student } from "@/lib/types";
import { ACTIVITY_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SeatingChart, type LiveInfo } from "@/features/seating/seating-chart";
import { NewLayoutDialog } from "@/features/seating/layout-editor";
import { AttendanceButtons, StudentActionPanel } from "./student-actions";
import { useCurrentActivity } from "@/lib/hooks";
import { cn, displayName, isoDateOf, toISODate } from "@/lib/utils";

/** Today's attendance + observation tallies per student for a class. */
export function useLiveInfo(classId: string, date = toISODate()) {
  const records = useRows("attendance_records");
  const statuses = useRows("attendance_statuses");
  const observations = useRows("observations");
  return React.useMemo(() => {
    const m = new Map<string, LiveInfo>();
    const statusById = new Map(statuses.rows.map((s) => [s.id, s]));
    const get = (id: string) => {
      let v = m.get(id);
      if (!v) m.set(id, (v = { positive: 0, redirection: 0, engagement: 0 }));
      return v;
    };
    for (const r of records.rows) if (r.class_id === classId && r.date === date) get(r.student_id).status = statusById.get(r.status_id);
    for (const o of observations.rows) if (o.class_id === classId && isoDateOf(o.observed_at) === date) get(o.student_id)[o.kind]++;
    return m;
  }, [records.rows, statuses.rows, observations.rows, classId, date]);
}

export function useMarkAllPresent() {
  const store = useStore();
  const run = useAction();
  const statuses = useRows("attendance_statuses");
  const records = useRows("attendance_records");
  return async (classId: string, roster: Student[], date = toISODate()) => {
    const present = statuses.rows.filter((s) => s.is_active && s.counts_as === "present").sort((a, b) => a.sort_order - b.sort_order)[0];
    if (!present) {
      await run(async () => {
        throw new Error("No active “present” attendance status. Add one in Settings.");
      });
      return;
    }
    const marked = new Set(records.rows.filter((r) => r.class_id === classId && r.date === date).map((r) => r.student_id));
    const todo = roster.filter((s) => !marked.has(s.id));
    if (!todo.length) {
      await run(async () => {
        throw new Error("Everyone already has an attendance status for this day.");
      });
      return;
    }
    await run(
      () => store.upsert("attendance_records", todo.map((s) => ({ class_id: classId, student_id: s.id, date, status_id: present.id, note: null })), ["class_id", "student_id", "date"]),
      {
        success: `Marked ${todo.length} unmarked students present`,
        undo: (rows) => store.remove("attendance_records", rows.map((r) => r.id)),
      },
    );
  };
}

export function LiveClassroom({ cls, roster }: { cls: ClassSection; roster: Student[] }) {
  const layouts = useRows("seating_layouts");
  const seats = useRows("seats");
  const [view, setView] = React.useState<"chart" | "roster">("chart");
  const [layoutId, setLayoutId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Student | null>(null);
  const [attendanceMode, setAttendanceMode] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [activity, setActivity] = useCurrentActivity();
  const live = useLiveInfo(cls.id);
  const markAll = useMarkAllPresent();
  const classLayouts = layouts.rows.filter((l) => l.class_id === cls.id);
  const layout = classLayouts.find((l) => l.id === layoutId) ?? classLayouts.find((l) => l.id === cls.default_layout_id) ?? classLayouts[0];
  const layoutSeats = React.useMemo(() => seats.rows.filter((s) => s.layout_id === layout?.id), [seats.rows, layout?.id]);
  const studentMap = React.useMemo(() => new Map(roster.map((s) => [s.id, s])), [roster]);
  const unseated = roster.filter((s) => !layoutSeats.some((x) => x.student_id === s.id));

  const marked = roster.filter((s) => live.get(s.id)?.status).length;

  const onSeat = (seat: Seat) => {
    const st = seat.student_id ? studentMap.get(seat.student_id) : undefined;
    if (st) setSelected(st);
  };

  return (
    <div className="grid gap-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="View" className="inline-flex rounded-lg border bg-card p-0.5">
          {(
            [
              ["chart", "Seating chart", LayoutGrid],
              ["roster", "Roster", List],
            ] as const
          ).map(([v, l, Icon]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-4" aria-hidden />
              {l}
            </button>
          ))}
        </div>
        {view === "chart" && classLayouts.length > 0 && (
          <Select aria-label="Seating layout" value={layout?.id} onChange={(e) => setLayoutId(e.target.value)} className="w-auto">
            {classLayouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
        <Select aria-label="Current activity" value={activity ?? ""} onChange={(e) => setActivity((e.target.value || null) as Activity | null)} className="w-auto" title="Tags new observations with the current instructional activity">
          <option value="">Activity: not set</option>
          {Object.entries(ACTIVITY_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              Activity: {l}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Attendance: {marked}/{roster.length}
          </span>
          <Button variant={attendanceMode ? "default" : "outline"} size="sm" aria-pressed={attendanceMode} onClick={() => setAttendanceMode((a) => !a)}>
            Take attendance
          </Button>
          <Button variant="outline" size="sm" onClick={() => markAll(cls.id, roster)}>
            <CheckCheck /> Mark unmarked present
          </Button>
          {view === "chart" && (
            <Button variant="ghost" size="icon-sm" aria-label="Print seating chart" onClick={() => window.print()}>
              <Printer />
            </Button>
          )}
        </div>
      </div>

      {!roster.length ? (
        <EmptyState title="No students in this class" description="Add students on the Roster tab, or import a CSV roster." />
      ) : view === "chart" ? (
        layout ? (
          <>
            <div className="hidden print:block">
              <h2 className="text-xl font-semibold">
                {cls.course_name} — Period {cls.period}
              </h2>
              <p className="text-sm">Seating chart: {layout.name}</p>
            </div>
            {attendanceMode ? (
              <AttendanceGrid layoutSeats={layoutSeats} studentMap={studentMap} classId={cls.id} />
            ) : (
              <SeatingChart layout={layout} seats={layoutSeats} students={studentMap} mode="live" live={live} onSelect={onSeat} />
            )}
            {unseated.length > 0 && (
              <div className="no-print rounded-xl border bg-card p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Not seated in this layout ({unseated.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {unseated.map((s) => (
                    <button key={s.id} type="button" onClick={() => setSelected(s)} className="rounded-md border bg-secondary/60 px-2 py-1 text-sm hover:bg-secondary">
                      {displayName(s)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={LayoutGrid}
            title="No seating chart yet"
            description="Create a layout to use the live seating chart, or switch to Roster view."
            action={
              <Button onClick={() => setNewOpen(true)}>
                <Plus /> Create seating chart
              </Button>
            }
          />
        )
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Attendance (today)</TH>
                <TH className="text-right">Today</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {roster.map((s) => {
                const info = live.get(s.id);
                return (
                  <TR key={s.id}>
                    <TD className="font-medium">{displayName(s)}</TD>
                    <TD>
                      <AttendanceButtons classId={cls.id} student={s} size="sm" />
                    </TD>
                    <TD className="whitespace-nowrap text-right text-xs text-muted-foreground">
                      <span className="text-emerald-700 dark:text-emerald-400">{info?.positive ?? 0} positive</span> · <span className="text-blue-700 dark:text-blue-400">{info?.engagement ?? 0} engagement</span> ·{" "}
                      <span className="text-amber-700 dark:text-amber-400">{info?.redirection ?? 0} redirection</span>
                    </TD>
                    <TD className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelected(s)}>
                        Log
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent title="Record for student" className="max-w-xl">
          {selected && <StudentActionPanel student={selected} classId={cls.id} onDone={() => setSelected(null)} />}
        </DialogContent>
      </Dialog>
      <NewLayoutDialog cls={cls} open={newOpen} onOpenChange={setNewOpen} onCreated={(l) => setLayoutId(l.id)} seatsWanted={Math.max(24, roster.length + 2)} />
    </div>
  );
}

/** Attendance mode: every seat shows status buttons, so a full class takes one tap per exception. */
function AttendanceGrid({ layoutSeats, studentMap, classId }: { layoutSeats: Seat[]; studentMap: Map<string, Student>; classId: string }) {
  const seated = layoutSeats
    .filter((s) => s.student_id && studentMap.has(s.student_id))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((s) => studentMap.get(s.student_id!)!);
  const ids = new Set(seated.map((s) => s.id));
  const rest = [...studentMap.values()].filter((s) => !ids.has(s.id));
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Attendance by seat order">
      {[...seated, ...rest].map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
          <span className="truncate text-sm font-medium">{displayName(s)}</span>
          <AttendanceButtons classId={classId} student={s} size="sm" />
        </li>
      ))}
    </ul>
  );
}
