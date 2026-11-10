import { describe, expect, it } from "vitest";
import { generateDemoData } from "@/lib/demo/seed";
import { buildReport, type ReportData } from "@/lib/reports";
import { DEMO_TEACHER_ID } from "@/lib/data/demo-adapter";

const d = generateDemoData({ teacherId: DEMO_TEACHER_ID, today: new Date(2026, 10, 10, 12), seed: 7 }) as unknown as Record<string, never[]>;
const data: ReportData = {
  students: d.students, classes: d.classes, enrollments: d.enrollments, observations: d.observations, attendance: d.attendance_records,
  statuses: d.attendance_statuses, plans: d.intervention_plans, progress: d.intervention_progress, communications: d.communications, notes: d.student_notes,
  groupSets: d.group_sets, groups: d.groups, memberships: d.group_memberships, groupObservations: d.group_observations, roles: d.team_roles,
};
const f = { from: "2026-01-01", to: "2026-12-31" };

describe("reports reflect stored data", () => {
  it("class summary totals equal the stored observation counts", () => {
    const r = buildReport("class", data, f);
    const stats = r.sections[0];
    if (stats.type !== "stats") throw new Error();
    expect(stats.items[0].value).toBe(data.observations.length);
    expect(stats.items[1].value).toBe(data.observations.filter((o: { kind: string }) => o.kind === "positive").length);
    const perStudentTotal = r.csv.rows.reduce((n, row) => n + Number(row[5]), 0);
    // per-student rows count observations only for students currently enrolled in that class
    expect(perStudentTotal).toBe(data.observations.length);
  });

  it("class filter restricts to one class", () => {
    const cls = data.classes[0];
    const r = buildReport("class", data, { ...f, classId: cls.id });
    const stats = r.sections[0];
    if (stats.type !== "stats") throw new Error();
    expect(stats.items[0].value).toBe(data.observations.filter((o: { class_id: string }) => o.class_id === cls.id).length);
  });

  it("attendance report counts match the records", () => {
    const r = buildReport("attendance", data, f);
    const total = r.csv.rows.reduce((n, row) => n + Number(row[2]), 0);
    expect(total).toBe(data.attendance.length);
    expect(r.notes.join(" ")).toMatch(/not the school's official attendance/);
  });

  it("student report needs a student and then reports only that student", () => {
    expect(buildReport("student", data, f).sections).toHaveLength(0);
    const s = data.students[0];
    const r = buildReport("student", data, { ...f, studentId: s.id });
    expect(r.subtitle).toContain(s.last_name);
    expect(r.csv.rows.length).toBe(data.observations.filter((o: { student_id: string }) => o.student_id === s.id).length);
  });

  it("private notes are excluded from admin reports unless requested", () => {
    const withNote = data.notes[0] as { student_id: string; body: string };
    const base = { ...f, studentId: withNote.student_id };
    const flat = (r: ReturnType<typeof buildReport>) => JSON.stringify(r.sections);
    expect(flat(buildReport("admin", data, base))).not.toContain(withNote.body);
    expect(flat(buildReport("admin", data, { ...base, includeNotes: true }))).toContain(withNote.body);
  });

  it("every report states its data limitations", () => {
    for (const t of ["class", "attendance", "recognition", "interventions", "groups"] as const) expect(buildReport(t, data, f).notes.length).toBeGreaterThan(0);
  });
});
