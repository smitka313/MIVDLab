import type { Seat, SeatKind, SeatingLayout } from "@/lib/types";
import { shuffle } from "@/lib/utils";

/** Geometry + assignment rules for seating charts (pure functions; unit tested). */

export type Box = Pick<Seat, "x" | "y" | "w" | "h">;
export type ItemDraft = Box & { kind: SeatKind; label: string | null };

export const FIXTURE_SIZES: Record<SeatKind, { w: number; h: number; label: string | null }> = {
  seat: { w: 1, h: 1, label: null },
  teacher_desk: { w: 2, h: 1, label: "Teacher" },
  door: { w: 1, h: 1, label: "Door" },
  lab_bench: { w: 3, h: 1, label: "Lab bench" },
  table: { w: 2, h: 1, label: null },
  board: { w: 4, h: 1, label: "Board" },
  window: { w: 2, h: 1, label: "Window" },
};

export function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function inBounds(b: Box, layout: Pick<SeatingLayout, "cols" | "rows">) {
  return b.x >= 0 && b.y >= 0 && b.x + b.w <= layout.cols && b.y + b.h <= layout.rows;
}

/** Can `candidate` be placed without leaving the room or overlapping another item? */
export function canPlace(candidate: Box, items: (Box & { id?: string })[], layout: Pick<SeatingLayout, "cols" | "rows">, ignoreId?: string) {
  return inBounds(candidate, layout) && !items.some((i) => i.id !== ignoreId && overlaps(i, candidate));
}

/** First free position (row-major) for an item of the given size. */
export function findFreeSpot(size: { w: number; h: number }, items: Box[], layout: Pick<SeatingLayout, "cols" | "rows">): { x: number; y: number } | null {
  for (let y = 0; y + size.h <= layout.rows; y++) {
    for (let x = 0; x + size.w <= layout.cols; x++) {
      if (!items.some((i) => overlaps(i, { x, y, ...size }))) return { x, y };
    }
  }
  return null;
}

/** Starting arrangements. Grid is cols x rows; row 0 is the front of the room. */
export function templateItems(arrangement: SeatingLayout["arrangement"], cols: number, rows: number, seatsWanted = 30): ItemDraft[] {
  const items: ItemDraft[] = [];
  const seat = (x: number, y: number) => items.push({ kind: "seat", x, y, w: 1, h: 1, label: null });
  const fixture = (kind: SeatKind, x: number, y: number, w?: number, h?: number, label?: string | null) =>
    items.push({ kind, x, y, w: w ?? FIXTURE_SIZES[kind].w, h: h ?? FIXTURE_SIZES[kind].h, label: label === undefined ? FIXTURE_SIZES[kind].label : label });

  const boardW = Math.min(6, cols - 2);
  fixture("board", Math.floor((cols - boardW) / 2), 0, boardW, 1, "Board");
  fixture("door", 0, rows - 1);
  if (arrangement === "custom") return items;
  fixture("teacher_desk", cols - 2, 1);

  const count = () => items.filter((i) => i.kind === "seat").length;
  if (arrangement === "rows") {
    for (let y = 3; y < rows - 1 && count() < seatsWanted; y++) {
      for (let x = 1; x < cols - 1 && count() < seatsWanted; x++) {
        if (x === Math.floor(cols / 2)) continue; // center aisle
        seat(x, y);
      }
    }
  } else if (arrangement === "pods") {
    for (let y = 3; y + 1 < rows - 1 && count() < seatsWanted; y += 3) {
      for (let x = 1; x + 1 < cols - 1 && count() < seatsWanted; x += 3) {
        seat(x, y);
        seat(x + 1, y);
        seat(x, y + 1);
        seat(x + 1, y + 1);
      }
    }
  } else {
    // tables / lab: a 2-wide surface with two seats in front and two behind
    const kind: SeatKind = arrangement === "lab" ? "lab_bench" : "table";
    for (let y = 2; y + 2 < rows && count() < seatsWanted; y += 3) {
      for (let x = 1; x + 1 < cols - 1 && count() < seatsWanted; x += 3) {
        seat(x, y);
        seat(x + 1, y);
        fixture(kind, x, y + 1, 2, 1, null);
        seat(x, y + 2);
        seat(x + 1, y + 2);
      }
    }
  }
  return items;
}

/** Seats sorted front-to-back, left-to-right. */
export function seatOrder(seats: Seat[]) {
  return seats.filter((s) => s.kind === "seat").sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Assign unseated students to empty seats.
 * Returns seatId -> studentId for the seats that change.
 */
export function autoAssign(seats: Seat[], studentIds: string[], mode: "alphabetical" | "random", rand: () => number = Math.random): Map<string, string> {
  const seated = new Set(seats.map((s) => s.student_id).filter(Boolean));
  const waiting = studentIds.filter((id) => !seated.has(id));
  const ordered = mode === "random" ? shuffle(waiting, rand) : waiting;
  const empty = seatOrder(seats).filter((s) => !s.student_id);
  const out = new Map<string, string>();
  empty.forEach((s, i) => {
    if (ordered[i]) out.set(s.id, ordered[i]);
  });
  return out;
}

/**
 * Moving a student onto a seat: returns the seat updates needed.
 * If the target seat is occupied, the two students swap.
 */
export function moveStudent(seats: Seat[], studentId: string, targetSeatId: string | null): { id: string; student_id: string | null }[] {
  const from = seats.find((s) => s.student_id === studentId);
  const to = targetSeatId ? seats.find((s) => s.id === targetSeatId) : null;
  if (to && to.kind !== "seat") return [];
  if (from && to && from.id === to.id) return [];
  const updates: { id: string; student_id: string | null }[] = [];
  if (from) updates.push({ id: from.id, student_id: to?.student_id ?? null });
  if (to) updates.push({ id: to.id, student_id: studentId });
  // Seats with a displaced occupant but no "from" seat: occupant becomes unseated (already handled by overwrite).
  return updates;
}
