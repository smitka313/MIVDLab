"use client";

import * as React from "react";
import { Check, DoorOpen, ThumbsUp, TriangleAlert, Sparkles } from "lucide-react";
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
  /** Live display options (per device). */
  display?: ChartDisplay;
  /** Multi-select: seat ids currently selected (shows a check on each). */
  selectedIds?: Set<string>;
  /** Student ids with no positive/engagement observation yet this week. */
  unrecognized?: Set<string>;
  /** Live mode: clicking a table/lab bench (e.g. to select the students around it). */
  onFixtureClick?: (seat: Seat) => void;
}

export interface ChartDisplay {
  size: "compact" | "normal" | "large";
  firstNamesOnly: boolean;
  /** Hide empty rows/columns around the furniture so seats fill the screen. */
  crop: boolean;
  /** Mark students not yet recognized this week. */
  highlightUnrecognized: boolean;
}

export const DEFAULT_DISPLAY: ChartDisplay = { size: "normal", firstNamesOnly: false, crop: true, highlightUnrecognized: true };

const CELL: Record<ChartDisplay["size"], { w: number; h: number }> = {
  compact: { w: 64, h: 54 }, // px, minimum cell width (chart scrolls horizontally on small screens)
  normal: { w: 80, h: 66 },
  large: { w: 108, h: 86 },
};

/** Smallest box containing every item, so empty space can be cropped. */
export function contentBounds(seats: Pick<Seat, "x" | "y" | "w" | "h">[], layout: Pick<SeatingLayout, "cols" | "rows">) {
  if (!seats.length) return { x: 0, y: 0, cols: layout.cols, rows: layout.rows };
  const x0 = Math.min(...seats.map((s) => s.x));
  const y0 = Math.min(...seats.map((s) => s.y));
  const x1 = Math.max(...seats.map((s) => s.x + s.w));
  const y1 = Math.max(...seats.map((s) => s.y + s.h));
  return { x: x0, y: y0, cols: Math.max(1, x1 - x0), rows: Math.max(1, y1 - y0) };
}

export function SeatingChart({ layout, seats, students, mode, live, selectedId, onSelect, onMoveItem, onDropStudent, unseated = [], display = DEFAULT_DISPLAY, selectedIds, unrecognized, onFixtureClick }: SeatingChartProps) {
  const editing = mode === "arrange" || mode === "assign";
  const box = display.crop && !editing ? contentBounds(seats, layout) : { x: 0, y: 0, cols: layout.cols, rows: layout.rows };
  const cell = CELL[mode === "print" ? "normal" : display.size];
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
          aria-rowcount={box.rows}
          aria-colcount={box.cols}
          className="relative mx-auto grid select-none gap-1"
          style={{
            gridTemplateColumns: `repeat(${box.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${box.rows}, ${cell.h}px)`,
            // Editing keeps roomy cells (and scrolls); live views shrink to fit unless "large" is chosen.
            minWidth: box.cols * (mode === "print" ? cell.w * 0.8 : editing || display.size === "large" ? cell.w : Math.min(cell.w, 58)),
            maxWidth: !editing && display.crop ? box.cols * cell.w * 1.9 : undefined,
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
                seat={box.x === 0 && box.y === 0 ? s : { ...s, x: s.x - box.x, y: s.y - box.y }}
                student={student}
                info={info}
                mode={mode}
                selected={selectedId === s.id}
                checked={selectedIds?.has(s.id) ?? false}
                selecting={!!selectedIds}
                unrecognized={!!student && display.highlightUnrecognized && !!unrecognized?.has(student.id)}
                firstNamesOnly={display.firstNamesOnly}
                large={display.size === "large" && mode !== "print"}
                dimmed={!!isDragging}
                onClick={
                  !interactive
                    ? undefined
                    : s.kind !== "seat" && onFixtureClick && !editing
                      ? () => onFixtureClick(s)
                      : () => !suppressClick.current && onSelect?.(s)
                }
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
  checked = false,
  selecting = false,
  unrecognized = false,
  firstNamesOnly = false,
  large = false,
  dimmed,
  onClick,
  onPointerDown,
}: {
  seat: Seat;
  student?: Student;
  info?: LiveInfo;
  mode: ChartMode;
  selected: boolean;
  checked?: boolean;
  selecting?: boolean;
  unrecognized?: boolean;
  firstNamesOnly?: boolean;
  large?: boolean;
  dimmed: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const style = { gridColumn: `${seat.x + 1} / span ${seat.w}`, gridRow: `${seat.y + 1} / span ${seat.h}` };
  const draggable = !!onPointerDown;
  const common = cn(
    "relative flex min-w-0 items-center justify-center overflow-hidden rounded-lg text-xs transition-shadow",
    draggable && "touch-none cursor-grab active:cursor-grabbing",
    (selected || checked) && "ring-2 ring-brand ring-offset-1 ring-offset-background",
    dimmed && "opacity-40",
  );

  if (seat.kind !== "seat") {
    // Brand palette: navy furniture, teal lab benches; tuned for both themes.
    const fixtureStyle: Record<string, string> = {
      board: "bg-[#001a40] text-white dark:bg-[#13315f] dark:text-[#e6eef7]",
      teacher_desk: "border border-[#c9d5e3] bg-[#e3eaf3] font-medium text-[#0b2550] dark:border-[#2a4675] dark:bg-[#132a52] dark:text-[#d4e1f1]",
      door: "border-2 border-dashed border-[#7991af] text-muted-foreground",
      lab_bench: "border border-[#7cd1d9] bg-[#e2f6f8] text-[#005f69] dark:border-[#1a6a75] dark:bg-[#0a3442] dark:text-[#9fe3ea]",
      table: "border border-[#b8c7da] bg-[#eef3f9] text-[#33496b] dark:border-[#2a4675] dark:bg-[#0f2347] dark:text-[#b9c8de]",
      window: "border border-sky-300 bg-sky-100/70 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
    };
    const label = seat.label ?? (seat.kind === "table" || seat.kind === "lab_bench" ? "" : SEAT_KIND_LABELS[seat.kind]);
    const interactive = mode === "arrange" || (!!onClick && (seat.kind === "table" || seat.kind === "lab_bench") && selecting);
    const Tag = interactive ? "button" : "div";
    return (
      <Tag
        type={interactive ? "button" : undefined}
        style={style}
        className={cn(common, fixtureStyle[seat.kind])}
        onClick={interactive ? onClick : undefined}
        onPointerDown={interactive ? onPointerDown : undefined}
        aria-label={interactive ? (mode === "arrange" ? `${SEAT_KIND_LABELS[seat.kind]}${seat.label ? `: ${seat.label}` : ""}` : `Select everyone at this ${SEAT_KIND_LABELS[seat.kind].toLowerCase()}`) : undefined}
      >
        {seat.kind === "door" && <DoorOpen className="mr-1 size-3.5" aria-hidden />}
        <span className="truncate px-1">{label}</span>
      </Tag>
    );
  }

  const status = info?.status;
  const sc = status ? colorClasses(status.color) : null;
  const absent = status?.counts_as === "absent" || status?.counts_as === "excused";
  const name = student ? (firstNamesOnly ? student.preferred_name?.trim() || student.first_name : shortName(student)) : mode === "live" || mode === "print" || mode === "attendance" ? "" : "Empty seat";
  const ariaLabel = student
    ? `${displayName(student)}${status ? `, ${status.label}` : ""}${info ? `, ${info.positive} positive, ${info.redirection} redirections today` : ""}${unrecognized ? ", not yet recognized this week" : ""}${selecting ? (checked ? ", selected" : ", not selected") : ""}`
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
      aria-pressed={selecting && student ? checked : undefined}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={cn(
        common,
        "flex-col gap-0.5 border px-1 py-1 text-left shadow-xs",
        student ? "bg-card hover:shadow-md" : "border-dashed bg-card/40 text-muted-foreground",
        absent && "opacity-60",
        sc && mode !== "print" && sc.border,
        !clickable && "cursor-default",
        checked && "bg-accent",
      )}
    >
      {unrecognized && mode !== "print" && (
        <span aria-hidden title="Not yet recognized this week" className="absolute right-1 top-1 size-2 rounded-full border-2 border-brand bg-transparent" />
      )}
      {checked && (
        <span aria-hidden className="absolute left-1 top-1 grid size-4 place-items-center rounded-full bg-brand text-brand-foreground">
          <Check className="size-3" />
        </span>
      )}
      {student ? (
        <>
          <span className="flex w-full items-center gap-1">
            <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full font-semibold", large ? "size-6 text-[11px]" : "size-5 text-[10px]", sc ? `${sc.soft} ${sc.text}` : "bg-secondary", checked && "invisible")}>
              {status && mode !== "print" ? status.code : initials(student)}
            </span>
            <span className={cn("truncate font-medium leading-tight", large ? "text-[14px]" : "text-[12px]")}>{name}</span>
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
