"use client";

import * as React from "react";
import { CheckCheck, LayoutGrid, List, ListChecks, PanelRight, Plus, Printer, SlidersHorizontal, X } from "lucide-react";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { Activity, AttendanceStatus, ClassSection, Seat, Student } from "@/lib/types";
import { ACTIVITY_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Checkbox, Select } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { QuickBehaviorButtons } from "@/features/observations/quick-buttons";
import { useChartDisplay } from "@/features/seating/display";
import { TodayLog } from "./today-log";
import { weekStart } from "@/lib/stats";
import { colorClasses } from "@/lib/labels";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SeatingChart, type LiveInfo } from "@/features/seating/seating-chart";
import { NewLayoutDialog } from "@/features/seating/layout-editor";
import { AttendanceButtons, StudentActionPanel } from "./student-actions";
import { useCurrentActivity } from "@/lib/hooks";
import { cn, displayName, isoDateOf, pluralize, toISODate } from "@/lib/utils";

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

/** Students in a class with no positive or engagement observation since Monday. */
export function useUnrecognized(classId: string, roster: Student[]) {
  const observations = useRows("observations");
  return React.useMemo(() => {
    const since = weekStart(toISODate());
    const seen = new Set(observations.rows.filter((o) => o.class_id === classId && o.kind !== "redirection" && isoDateOf(o.observed_at) >= since).map((o) => o.student_id));
    return new Set(roster.filter((s) => !seen.has(s.id)).map((s) => s.id));
  }, [observations.rows, classId, roster]);
}

/** Order a seat tap cycles through: unmarked -> absent -> tardy -> excused -> present -> absent ... */
const CYCLE: AttendanceStatus["counts_as"][] = ["absent", "tardy", "excused", "present"];

function useCycleAttendance(classId: string) {
  const store = useStore();
  const run = useAction();
  const statuses = useRows("attendance_statuses");
  const records = useRows("attendance_records");
  return (student: Student) => {
    const date = toISODate();
    const active = statuses.rows.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);
    const byKind = CYCLE.map((k) => active.find((s) => s.counts_as === k)).filter(Boolean) as AttendanceStatus[];
    if (!byKind.length) return;
    const current = records.rows.find((r) => r.class_id === classId && r.student_id === student.id && r.date === date);
    const idx = current ? byKind.findIndex((s) => s.id === current.status_id) : -1;
    const next = byKind[(idx + 1) % byKind.length];
    void run(() => store.upsert("attendance_records", [{ class_id: classId, student_id: student.id, date, status_id: next.id, note: current?.note ?? null }], ["class_id", "student_id", "date"]), { silent: true });
  };
}

/** Seats next to (touching) a table or lab bench. */
function seatsAround(fixture: Seat, seats: Seat[]) {
  return seats.filter((s) => s.kind === "seat" && s.student_id && s.x >= fixture.x - 1 && s.x <= fixture.x + fixture.w && s.y >= fixture.y - 1 && s.y <= fixture.y + fixture.h);
}

export function LiveClassroom({ cls, roster }: { cls: ClassSection; roster: Student[] }) {
  const layouts = useRows("seating_layouts");
  const seats = useRows("seats");
  const statuses = useRows("attendance_statuses");
  const [view, setView] = React.useState<"chart" | "roster">("chart");
  const [layoutId, setLayoutId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Student | null>(null);
  const [attendanceMode, setAttendanceMode] = React.useState(false);
  const [selecting, setSelecting] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set()); // student ids
  const [groupLog, setGroupLog] = React.useState(false);
  const [showLog, setShowLog] = React.useState(true);
  const [newOpen, setNewOpen] = React.useState(false);
  const [activity, setActivity] = useCurrentActivity();
  const [display, setDisplay] = useChartDisplay();
  const live = useLiveInfo(cls.id);
  const unrecognized = useUnrecognized(cls.id, roster);
  const markAll = useMarkAllPresent();
  const cycle = useCycleAttendance(cls.id);
  const classLayouts = layouts.rows.filter((l) => l.class_id === cls.id);
  const layout = classLayouts.find((l) => l.id === layoutId) ?? classLayouts.find((l) => l.id === cls.default_layout_id) ?? classLayouts[0];
  const activeLayoutId = layout?.id;
  const layoutSeats = seats.rows.filter((s) => s.layout_id === activeLayoutId);
  const studentMap = React.useMemo(() => new Map(roster.map((s) => [s.id, s])), [roster]);
  const unseated = roster.filter((s) => !layoutSeats.some((x) => x.student_id === s.id));
  const marked = roster.filter((s) => live.get(s.id)?.status).length;
  const pickedStudents = roster.filter((s) => picked.has(s.id));
  const pickedSeatIds = new Set(layoutSeats.filter((x) => x.student_id && picked.has(x.student_id)).map((x) => x.id));
  const cycleHelp = CYCLE.map((k) => statuses.rows.find((s) => s.is_active && s.counts_as === k)?.label).filter(Boolean).join(" → ");

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const onSeat = (seat: Seat) => {
    const st = seat.student_id ? studentMap.get(seat.student_id) : undefined;
    if (!st) return;
    if (attendanceMode) cycle(st);
    else if (selecting) toggle(st.id);
    else setSelected(st);
  };

  const onFixture = (fixture: Seat) => {
    const around = seatsAround(fixture, layoutSeats).map((s) => s.student_id!);
    if (!around.length) return;
    setPicked((p) => {
      const allIn = around.every((id) => p.has(id));
      const n = new Set(p);
      for (const id of around) {
        if (allIn) n.delete(id);
        else n.add(id);
      }
      return n;
    });
  };

  const setMode = (m: "log" | "select" | "attendance") => {
    setSelecting(m === "select");
    setAttendanceMode(m === "attendance");
    if (m !== "select") setPicked(new Set());
  };
  const mode = attendanceMode ? "attendance" : selecting ? "select" : "log";

  return (
    <div className="grid gap-3">
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
        {view === "chart" && classLayouts.length > 1 && (
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
        {view === "chart" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Display options">
                <SlidersHorizontal /> <span className="hidden sm:inline">Display</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="grid w-64 gap-3 text-sm">
              <div role="radiogroup" aria-label="Seat size" className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Seat size</span>
                <div className="grid grid-cols-3 gap-1">
                  {(["compact", "normal", "large"] as const).map((z) => (
                    <button key={z} type="button" role="radio" aria-checked={display.size === z} onClick={() => setDisplay({ size: z })} className={cn("rounded-md border px-2 py-1 capitalize", display.size === z ? "border-brand bg-accent font-medium" : "hover:bg-secondary")}>
                      {z}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between gap-2">
                First names only <Switch checked={display.firstNamesOnly} onCheckedChange={(v) => setDisplay({ firstNamesOnly: v })} aria-label="First names only" />
              </label>
              <label className="flex items-center justify-between gap-2">
                Fill the screen (hide empty space) <Switch checked={display.crop} onCheckedChange={(v) => setDisplay({ crop: v })} aria-label="Fill the screen" />
              </label>
              <label className="flex items-center justify-between gap-2">
                Mark students not yet recognized this week <Switch checked={display.highlightUnrecognized} onCheckedChange={(v) => setDisplay({ highlightUnrecognized: v })} aria-label="Mark students not yet recognized this week" />
              </label>
            </PopoverContent>
          </Popover>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Tap a student to" className="inline-flex rounded-lg border bg-card p-0.5 text-sm">
            {(
              [
                ["log", "Log"],
                ["select", "Select several"],
                ["attendance", "Attendance"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={cn("rounded-md px-3 py-1.5", mode === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {l}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={showLog ? "Hide today's log" : "Show today's log"} aria-pressed={showLog} onClick={() => setShowLog((v) => !v)} title="Today's log">
            <PanelRight />
          </Button>
          {view === "chart" && (
            <Button variant="ghost" size="icon-sm" aria-label="Print seating chart" onClick={() => window.print()}>
              <Printer />
            </Button>
          )}
        </div>
      </div>

      {attendanceMode && (
        <div role="status" className="no-print flex flex-wrap items-center gap-2 rounded-lg border bg-accent/60 px-3 py-2 text-sm">
          <span>
            Tap a student to mark them <strong>{cycleHelp.split(" → ")[0] ?? "absent"}</strong>; tap again for {cycleHelp.split(" → ").slice(1).join(", ").toLowerCase()}.
          </span>
          <span className="text-muted-foreground" aria-live="polite">
            {marked}/{roster.length} marked
          </span>
          <Button size="sm" className="ml-auto" onClick={() => markAll(cls.id, roster)}>
            <CheckCheck /> Mark everyone else present
          </Button>
        </div>
      )}
      {selecting && (
        <div role="status" className="no-print flex flex-wrap items-center gap-2 rounded-lg border bg-accent/60 px-3 py-2 text-sm">
          <ListChecks className="size-4" aria-hidden />
          <span>{picked.size ? `${pluralize(picked.size, "student")} selected` : "Tap students — or a table or lab bench to select everyone at it."}</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(roster.map((s) => s.id)))}>
              Select all
            </Button>
            {picked.size > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                <X /> Clear
              </Button>
            )}
            <Button size="sm" disabled={!picked.size} onClick={() => setGroupLog(true)}>
              Log for {picked.size || ""} selected
            </Button>
          </div>
        </div>
      )}

      <div className={cn("grid gap-4", showLog && "2xl:grid-cols-[1fr_17rem]")}>
        <div className="grid min-w-0 content-start gap-3">
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
                <SeatingChart
                  layout={layout}
                  seats={layoutSeats}
                  students={studentMap}
                  mode={attendanceMode ? "attendance" : "live"}
                  live={live}
                  onSelect={onSeat}
                  display={display}
                  selectedIds={selecting ? pickedSeatIds : undefined}
                  unrecognized={unrecognized}
                  onFixtureClick={selecting ? onFixture : undefined}
                />
                {unseated.length > 0 && (
                  <div className="no-print rounded-xl border bg-card p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Not seated in this layout ({unseated.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {unseated.map((s) =>
                        attendanceMode ? (
                          <span key={s.id} className="flex items-center gap-2 rounded-md border bg-secondary/40 px-2 py-1 text-sm">
                            {displayName(s)} <AttendanceButtons classId={cls.id} student={s} size="sm" />
                          </span>
                        ) : (
                          <button
                            key={s.id}
                            type="button"
                            aria-pressed={selecting ? picked.has(s.id) : undefined}
                            onClick={() => (selecting ? toggle(s.id) : setSelected(s))}
                            className={cn("rounded-md border px-2 py-1 text-sm hover:bg-secondary", selecting && picked.has(s.id) ? "border-brand bg-accent" : "bg-secondary/60")}
                          >
                            {displayName(s)}
                          </button>
                        ),
                      )}
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
                    {selecting && <TH className="w-10"><span className="sr-only">Select</span></TH>}
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
                        {selecting && (
                          <TD>
                            <Checkbox aria-label={`Select ${displayName(s)}`} checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                          </TD>
                        )}
                        <TD className="font-medium">
                          {displayName(s)}
                          {display.highlightUnrecognized && unrecognized.has(s.id) && (
                            <span className={cn("ml-2 text-xs font-normal", colorClasses("teal").text)}>not yet recognized this week</span>
                          )}
                        </TD>
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
          {display.highlightUnrecognized && unrecognized.size > 0 && roster.length > 0 && (
            <p className="no-print flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="inline-block size-2 rounded-full border-2 border-brand" /> {pluralize(unrecognized.size, "student")} in this class {unrecognized.size === 1 ? "has" : "have"} no positive or engagement observation yet this week. Only you can see this.
            </p>
          )}
        </div>
        {showLog && <TodayLog cls={cls} className="no-print 2xl:sticky 2xl:top-20 2xl:self-start" />}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent title="Record for student" className="max-w-xl">
          {selected && <StudentActionPanel student={selected} classId={cls.id} onDone={() => setSelected(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={groupLog} onOpenChange={setGroupLog}>
        <DialogContent title={`Log for ${pluralize(pickedStudents.length, "student")}`} description={pickedStudents.map(displayName).join(", ")} className="max-w-xl">
          {groupLog && (
            <QuickBehaviorButtons
              students={pickedStudents}
              classId={cls.id}
              onLogged={() => {
                setGroupLog(false);
                setPicked(new Set());
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <NewLayoutDialog cls={cls} open={newOpen} onOpenChange={setNewOpen} onCreated={(l) => setLayoutId(l.id)} seatsWanted={Math.max(24, roster.length + 2)} />
    </div>
  );
}
