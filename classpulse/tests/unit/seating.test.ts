import { describe, expect, it } from "vitest";
import { autoAssign, canPlace, findFreeSpot, inBounds, moveStudent, overlaps, templateItems } from "@/features/seating/layout-logic";
import type { Seat } from "@/lib/types";
import { seededRandom } from "@/lib/utils";

const seat = (id: string, x: number, y: number, student_id: string | null = null, kind: Seat["kind"] = "seat"): Seat => ({
  id, teacher_id: "t", created_at: "", updated_at: "", layout_id: "L", kind, x, y, w: 1, h: 1, label: null, student_id,
});

describe("seating geometry", () => {
  it("detects overlaps and bounds", () => {
    expect(overlaps({ x: 0, y: 0, w: 2, h: 1 }, { x: 1, y: 0, w: 1, h: 1 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 })).toBe(false);
    expect(inBounds({ x: 11, y: 0, w: 2, h: 1 }, { cols: 12, rows: 10 })).toBe(false);
    expect(canPlace({ x: 1, y: 0, w: 1, h: 1 }, [{ id: "a", x: 0, y: 0, w: 2, h: 1 }], { cols: 12, rows: 10 }, "a")).toBe(true);
    expect(findFreeSpot({ w: 2, h: 1 }, [{ x: 0, y: 0, w: 12, h: 1 }], { cols: 12, rows: 10 })).toEqual({ x: 0, y: 1 });
  });
  it.each(["rows", "pods", "tables", "lab", "custom"] as const)("%s template has no overlaps and fits the room", (arr) => {
    const items = templateItems(arr, 12, 10, 30);
    for (const [i, a] of items.entries()) {
      expect(inBounds(a, { cols: 12, rows: 10 })).toBe(true);
      for (const b of items.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    }
    if (arr !== "custom") expect(items.filter((i) => i.kind === "seat").length).toBeGreaterThanOrEqual(24);
  });
});

describe("seat assignment", () => {
  const seats = [seat("s1", 0, 1, "A"), seat("s2", 1, 1), seat("s3", 0, 0), seat("d", 3, 3, null, "door")];
  it("auto-seats unseated students front-to-back without moving seated ones", () => {
    const m = autoAssign(seats, ["A", "B", "C", "D"], "alphabetical");
    expect([...m.entries()]).toEqual([["s3", "B"], ["s2", "C"]]);
  });
  it("random auto-seat is a permutation", () => {
    const m = autoAssign(seats, ["A", "B", "C"], "random", seededRandom(1));
    expect(new Set(m.values())).toEqual(new Set(["B", "C"]));
  });
  it("swaps occupants when dropping onto an occupied seat", () => {
    const s = [seat("s1", 0, 0, "A"), seat("s2", 1, 0, "B")];
    expect(moveStudent(s, "A", "s2")).toEqual([{ id: "s1", student_id: "B" }, { id: "s2", student_id: "A" }]);
  });
  it("unseats a student when dropped outside", () => {
    expect(moveStudent([seat("s1", 0, 0, "A")], "A", null)).toEqual([{ id: "s1", student_id: null }]);
  });
  it("ignores drops onto furniture", () => {
    expect(moveStudent([seat("s1", 0, 0, "A"), seat("d", 1, 0, null, "door")], "A", "d")).toEqual([]);
  });
});
