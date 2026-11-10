import { describe, expect, it } from "vitest";
import { assignRoles, makeRandomGroups } from "@/features/groups/group-logic";
import { bucketObservations, countKinds, schoolDaysWithoutAttendance, summarizeAttendance, weekStart } from "@/lib/stats";
import { fillTemplate, mailtoUrl } from "@/lib/messages";
import { buildTimeline } from "@/lib/timeline";
import { seededRandom } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/types";

const status = (id: string, counts_as: AttendanceStatus["counts_as"]): AttendanceStatus => ({ id, counts_as, code: id, label: id, color: "slate", sort_order: 0, is_active: true, teacher_id: "t", created_at: "", updated_at: "" });

describe("groups", () => {
  const ids = Array.from({ length: 23 }, (_, i) => `s${i}`);
  it("balances by max size", () => {
    const g = makeRandomGroups(ids, "size", 4, seededRandom(3));
    expect(g.length).toBe(6);
    expect(Math.max(...g.map((x) => x.length)) - Math.min(...g.map((x) => x.length))).toBeLessThanOrEqual(1);
    expect(g.flat().sort()).toEqual([...ids].sort());
  });
  it("makes exactly N groups", () => {
    expect(makeRandomGroups(ids, "count", 5).length).toBe(5);
    expect(makeRandomGroups(["a", "b"], "count", 5).length).toBe(2);
  });
  it("assigns distinct roles within each group", () => {
    const m = assignRoles([["a", "b", "c"], ["d"]], ["lead", "rec"]);
    expect(Object.fromEntries(m)).toEqual({ a: "lead", b: "rec", c: null, d: "lead" });
  });
});

describe("stats", () => {
  it("summarises attendance by status meaning", () => {
    const st = new Map([status("P", "present"), status("A", "absent"), status("T", "tardy"), status("FT", "present")].map((s) => [s.id, s]));
    const recs = ["P", "P", "A", "T", "FT"].map((s, i) => ({ status_id: s, id: `${i}` })) as never;
    expect(summarizeAttendance(recs, st)).toEqual({ total: 5, present: 3, absent: 1, tardy: 1, excused: 0, rate: 0.8 });
    expect(summarizeAttendance([], st).rate).toBeNull();
  });
  it("buckets by week and keeps empty weeks visible", () => {
    expect(weekStart("2026-11-12")).toBe("2026-11-09");
    const obs = [{ observed_at: new Date(2026, 10, 10, 9).toISOString(), kind: "positive" as const }, { observed_at: new Date(2026, 10, 24, 9).toISOString(), kind: "redirection" as const }];
    const b = bucketObservations(obs, "2026-11-09", "2026-11-25");
    expect(b.map((x) => x.key)).toEqual(["2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(b.map((x) => x.positive + x.redirection)).toEqual([1, 0, 1]);
    expect(countKinds(obs)).toEqual({ positive: 1, redirection: 1, engagement: 0 });
  });
  it("lists weekdays without attendance", () => {
    expect(schoolDaysWithoutAttendance([{ date: "2026-11-09" }], "2026-11-09", "2026-11-15")).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  });
});

describe("messages", () => {
  it("fills placeholders only from selected observations", () => {
    const out = fillTemplate("Hi, about {student_first} in {class_name}:\n{observations}\n{teacher_name} {unknown}", {
      studentFirst: "Ana", studentName: "Ana Rivera", teacherName: "Ms. K", className: "Biology", date: "11/10/2026",
      observations: [{ observed_at: "2026-11-02T10:00:00Z", behavior_label: "Helped another student", note: null }],
      formatDate: () => "11/02",
    });
    expect(out).toBe("Hi, about Ana in Biology:\n- 11/02: Helped another student\nMs. K {unknown}");
  });
  it("asks the teacher for examples when none are selected", () => {
    expect(fillTemplate("{observations}", { studentFirst: "", studentName: "", teacherName: "", className: "", date: "", observations: [], formatDate: String })).toMatch(/Add specific/);
  });
  it("builds safe mailto links", () => {
    expect(mailtoUrl("p@example.com", "Hi & bye", "a\nb")).toBe("mailto:p%40example.com?subject=Hi%20%26%20bye&body=a%0Ab");
    expect(mailtoUrl("Parent name", "s", "b")).toBe("mailto:?subject=s&body=b");
    expect(mailtoUrl("a@b.co?cc=evil@x.com", "s", "b")).toBe("mailto:?subject=s&body=b");
  });
});

describe("timeline", () => {
  it("merges records newest first and hides routine 'present' days", () => {
    const st = new Map([status("P", "present"), status("A", "absent")].map((s) => [s.id, s]));
    const ev = buildTimeline({
      observations: [{ id: "o", observed_at: "2026-11-03T10:00:00Z", class_id: "c", behavior_label: "Off task", note: null, context: null, intervention_used: null, kind: "redirection" } as never],
      attendance: [{ id: "a1", date: "2026-11-04", status_id: "A", class_id: "c", note: null } as never, { id: "a2", date: "2026-11-05", status_id: "P", class_id: "c", note: null } as never],
      statuses: st, notes: [], plans: [], progress: [], communications: [],
    });
    expect(ev.map((e) => e.type)).toEqual(["attendance", "observation"]);
  });
});
