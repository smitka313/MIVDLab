"use client";

import * as React from "react";
import { DoorOpen, ThumbsUp, TriangleAlert, Sparkles } from "lucide-react";
import type { AttendanceStatus, Seat, SeatingLayout, Student } from "@/lib/types";
import { colorClasses, SEAT_KIND_LABELS } from "@/lib/labels";
import { cn, displayName, initials, shortName } from "@/lib/utils";

export type ChartMode = "live" | "arrange" | "assign" | "attendance" | "print";

export interface LiveInfo {
  status?: AttendanceStatus;
  positive: number;
  redirection: number;
  engagement: number;
}

interface DragState {
  /** Grid cell under the pointer, computed in the event handler. */
  cell: { x: number; y: number } | null;
  kind: "item" | "student";
  id: string; // seat id (item) or student id (student)
  fromSeatId?: string;
  startX: number;
  startY: number;
  grabDX: number; // grab offset in cells (item drags)
  grabDY: number;
  x: number;
  y: number;
  active: boolean;
  label: string;
}

export interface SeatingChartProps {
  layout: SeatingLayout;
  seats: Seat[];
  students: Map<string, Student>;
  mode: ChartMode;
  live?: Map<string, LiveInfo>;
  selectedId?: string | null;
  onSelect?: (seat: Seat) => void;
  /** arrange mode: move an item to a new cell */
  onMoveItem?: (seat: Seat, x: number, y: number) => void;
  /** assign mode: drop student onto seat (null = unassign) */
  onDropStudent?: (studentId: string, seatId: string | null) => void;
  /** assign mode: students without a seat, shown beside the grid as drag sources / drop target. */
  unseated?: Student[];
}

const CELL_W = 76; // px, minimum cell width (chart scrolls horizontally on small screens)
const CELL_H = 64;

export function SeatingChart({ layout, seats, students, mode, live, selectedId, onSelect, onMoveItem, onDropStudent, unseated = [] }: SeatingChartProps) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [drag, setDragState] = React.useState<DragState | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const setDrag = (d: DragState | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  // A drag ends with a click event on the dragged element; ignore that click.
  const suppressClick = React.useRef(false);

  const cellAt = (clientX: number, clientY: number) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const cx = Math.floor(((clientX - rect.left) / rect.width) * layout.cols);
    const cy = Math.floor(((clientY - rect.top) / rect.height) * layout.rows);
    if (cx < 0 || cy < 0 || cx >= layout.cols || cy >= layout.rows) return null;
    return { x: cx, y: cy };
  };

  const begin = (e: React.PointerEvent, d: Omit<DragState, "startX" | "startY" | "x" | "y" | "active" | "cell">) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ ...d, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, cell: cellAt(e.clientX, e.clientY) });
  };

  React.useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const active = d.active || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5;
      setDrag({ ...d, x: e.clientX, y: e.clientY, active, cell: cellAt(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d || !d.active) return; // a click; handled by onClick
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 50);
      if (d.kind === "item") {
        const cell = cellAt(e.clientX, e.clientY);
        const seat = seats.find((s) => s.id === d.id);
        if (cell && seat) onMoveItem?.(seat, Math.max(0, cell.x - d.grabDX), Math.max(0, cell.y - d.grabDY));
      } else {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const target = el?.closest<HTMLElement>("[data-drop]");
        if (!target) return;
        const seatId = target.dataset.drop === "unseated" ? null : target.dataset.drop!;
        if (seatId !== d.fromSeatId) onDropStudent?.(d.id, seatId);
      }
    };
    const cancel = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    // Listeners are bound once per drag; handlers read the latest state from dragRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const startStudentDrag = (e: React.PointerEvent, student: Student, fromSeatId?: string) =>
    begin(e, { kind: "student", id: student.id, fromSeatId, grabDX: 0, grabDY: 0, label: displayName(student) });

  // Ghost preview for item moves
  let ghost: { x: number; y: number; w: number; h: number; ok: boolean } | null = null;
  if (drag?.active && drag.kind === "item") {
    const seat = seats.find((s) => s.id === drag.id);
    const cell = drag.cell;
    if (seat && cell) {
      const x = Math.max(0, cell.x - drag.grabDX);
      const y = Math.max(0, cell.y - drag.grabDY);
      const box = { x, y, w: seat.w, h: seat.h };
      const ok =
        x + seat.w <= layout.cols &&
        y + seat.h <= layout.rows &&
        !seats.some((o) => o.id !== seat.id && o.x < box.x + box.w && box.x < o.x + o.w && o.y < box.y + box.h && box.y < o.y + o.h);
      ghost = { ...box, ok };
    }
  }

  const interactive = mode !== "print";

  return (
    <div className={cn("flex flex-col gap-4", mode === "assign" && "lg:flex-row")}>
      <div className="relative min-w-0 flex-1 overflow-x-auto rounded-xl border bg-secondary/40 p-2 sm:p-3">
        <div className="mb-2 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Front of room</div>
        <div
          ref={gridRef}
          role="grid"
          aria-label={`Seating chart: ${layout.name}`}
          aria-rowcount={layout.rows}
          aria-colcount={layout.cols}
          className="relative mx-auto grid select-none gap-1"
          style={{
            gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${layout.rows}, ${CELL_H}px)`,
            minWidth: layout.cols * CELL_W * (mode === "print" ? 0.8 : 1),
          }}
        >
          {mode === "arrange" &&
            Array.from({ length: layout.cols * layout.rows }, (_, i) => (
              <div key={`c${i}`} aria-hidden className="rounded-md border border-dashed border-border/70" style={{ gridColumn: (i % layout.cols) + 1, gridRow: Math.floor(i / layout.cols) + 1 }} />
            ))}
          {seats.map((s) => {
            const student = s.student_id ? students.get(s.student_id) : undefined;
            const info = student ? live?.get(student.id) : undefined;
            const isDragging = drag?.active && ((drag.kind === "item" && drag.id === s.id) || (drag.kind === "student" && drag.fromSeatId === s.id));
            return (
              <SeatTile
                key={s.id}
                seat={s}
                student={student}
                info={info}
                mode={mode}
                selected={selectedId === s.id}
                dimmed={!!isDragging}
                onClick={interactive ? () => !suppressClick.current && onSelect?.(s) : undefined}
                onPointerDown={
                  mode === "arrange"
                    ? (e) => {
                        const cell = cellAt(e.clientX, e.clientY);
                        begin(e, { kind: "item", id: s.id, grabDX: cell ? cell.x - s.x : 0, grabDY: cell ? cell.y - s.y : 0, label: s.label ?? SEAT_KIND_LABELS[s.kind] });
                      }
                    : mode === "assign" && student
                      ? (e) => startStudentDrag(e, student, s.id)
                      : undefined
                }
              />
            );
          })}
          {ghost && (
            <div
              aria-hidden
              className={cn("pointer-events-none rounded-lg border-2 border-dashed", ghost.ok ? "border-brand bg-brand/10" : "border-destructive bg-destructive/10")}
              style={{ gridColumn: `${ghost.x + 1} / span ${ghost.w}`, gridRow: `${ghost.y + 1} / span ${ghost.h}` }}
            />
          )}
        </div>
        <div className="mt-2 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Back of room</div>
      </div>
      {mode === "assign" && (
        <aside data-drop="unseated" aria-label="Unseated students" className="no-print w-full shrink-0 rounded-xl border bg-card p-3 lg:w-60">
          <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
            Unseated <span className="rounded-md border bg-secondary px-1.5 py-0.5 text-xs font-medium">{unseated.length}</span>
          </h3>
          {unseated.length ? (
            <ul className="flex flex-wrap gap-1.5 lg:flex-col">
              {unseated.map((st) => (
                <li key={st.id}>
                  <button
                    type="button"
                    onPointerDown={(e) => startStudentDrag(e, st)}
                    className="w-full touch-none cursor-grab rounded-md border bg-secondary/60 px-2 py-1 text-left text-sm active:cursor-grabbing"
                    aria-label={`${displayName(st)} (unseated). Drag to a seat, or click a seat to assign.`}
                  >
                    {displayName(st)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Everyone has a seat. Drag a student here to unseat them.</p>
          )}
        </aside>
      )}
      {drag?.active && drag.kind === "student" && (
        <div aria-hidden className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover px-3 py-1.5 text-sm font-medium shadow-lg" style={{ left: drag.x, top: drag.y }}>
          {drag.label}
        </div>
      )}
    </div>
  );
}

function SeatTile({
  seat,
  student,
  info,
  mode,
  selected,
  dimmed,
  onClick,
  onPointerDown,
}: {
  seat: Seat;
  student?: Student;
  info?: LiveInfo;
  mode: ChartMode;
  selected: boolean;
  dimmed: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const style = { gridColumn: `${seat.x + 1} / span ${seat.w}`, gridRow: `${seat.y + 1} / span ${seat.h}` };
  const draggable = !!onPointerDown;
  const common = cn(
    "relative flex min-w-0 items-center justify-center overflow-hidden rounded-lg text-xs transition-shadow",
    draggable && "touch-none cursor-grab active:cursor-grabbing",
    selected && "ring-2 ring-brand ring-offset-1 ring-offset-background",
    dimmed && "opacity-40",
  );

  if (seat.kind !== "seat") {
    const fixtureStyle: Record<string, string> = {
      board: "bg-slate-700 text-slate-100 dark:bg-slate-600",
      teacher_desk: "border border-slate-300 bg-slate-200 font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100",
      door: "border-2 border-dashed border-slate-400 text-muted-foreground",
      lab_bench: "border border-cyan-300 bg-cyan-100/70 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-200",
      table: "border border-amber-300/70 bg-amber-100/60 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
      window: "border border-sky-300 bg-sky-100/70 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
    };
    const label = seat.label ?? (seat.kind === "table" || seat.kind === "lab_bench" ? "" : SEAT_KIND_LABELS[seat.kind]);
    const interactive = mode === "arrange";
    const Tag = interactive ? "button" : "div";
    return (
      <Tag
        type={interactive ? "button" : undefined}
        style={style}
        className={cn(common, fixtureStyle[seat.kind])}
        onClick={interactive ? onClick : undefined}
        onPointerDown={interactive ? onPointerDown : undefined}
        aria-label={interactive ? `${SEAT_KIND_LABELS[seat.kind]}${seat.label ? `: ${seat.label}` : ""}` : undefined}
      >
        {seat.kind === "door" && <DoorOpen className="mr-1 size-3.5" aria-hidden />}
        <span className="truncate px-1">{label}</span>
      </Tag>
    );
  }

  const status = info?.status;
  const sc = status ? colorClasses(status.color) : null;
  const absent = status?.counts_as === "absent" || status?.counts_as === "excused";
  const name = student ? shortName(student) : mode === "live" || mode === "print" ? "" : "Empty seat";
  const ariaLabel = student
    ? `${displayName(student)}${status ? `, ${status.label}` : ""}${info ? `, ${info.positive} positive, ${info.redirection} redirections today` : ""}`
    : `Empty seat${seat.label ? ` ${seat.label}` : ""}`;
  const clickable = !!onClick && (student || mode === "arrange" || mode === "assign");

  return (
    <button
      type="button"
      style={style}
      data-drop={mode === "assign" ? seat.id : undefined}
      title={student ? displayName(student) : undefined}
      disabled={!clickable}
      aria-label={ariaLabel}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={cn(
        common,
        "flex-col gap-0.5 border px-1 py-1 text-left shadow-xs",
        student ? "bg-card hover:shadow-md" : "border-dashed bg-card/40 text-muted-foreground",
        absent && "opacity-60",
        sc && mode !== "print" && sc.border,
        !clickable && "cursor-default",
      )}
    >
      {student ? (
        <>
          <span className="flex w-full items-center gap-1">
            <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold", sc ? `${sc.soft} ${sc.text}` : "bg-secondary")}>
              {status && mode !== "print" ? status.code : initials(student)}
            </span>
            <span className="truncate text-[12px] font-medium leading-tight">{name}</span>
          </span>
          {info && mode !== "print" && (info.positive > 0 || info.redirection > 0 || info.engagement > 0) && (
            <span aria-hidden className="flex w-full items-center gap-1.5 text-[10px] text-muted-foreground">
              {info.positive > 0 && (
                <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
                  <ThumbsUp className="size-2.5" />
                  {info.positive}
                </span>
              )}
              {info.engagement > 0 && (
                <span className="inline-flex items-center gap-0.5 text-blue-700 dark:text-blue-400">
                  <Sparkles className="size-2.5" />
                  {info.engagement}
                </span>
              )}
              {info.redirection > 0 && (
                <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="size-2.5" />
                  {info.redirection}
                </span>
              )}
            </span>
          )}
        </>
      ) : (
        <span className="text-[11px]">{name}</span>
      )}
    </button>
  );
}
