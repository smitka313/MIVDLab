import { describe, expect, it } from "vitest";
import { buildImportRows, guessMapping, mappingProblem, splitFullName, summarize } from "@/features/students/import-logic";
import type { Student } from "@/lib/types";

const student = (p: Partial<Student>): Student => ({
  id: p.id ?? "s1", teacher_id: "t", created_at: "", updated_at: "", school_id: null, first_name: "Ana", last_name: "Rivera",
  preferred_name: null, grade_level: 10, school_student_id: null, photo_path: null, is_demo: false, archived_at: null, ...p,
});

describe("column mapping", () => {
  it("guesses common header names", () => {
    expect(guessMapping(["Student ID", "First Name", "Last_Name", "Grade", "Nickname"])).toEqual({
      first_name: "First Name", last_name: "Last_Name", grade_level: "Grade", school_student_id: "Student ID", preferred_name: "Nickname",
    });
  });
  it("falls back to a single full-name column", () => {
    const m = guessMapping(["Student Name", "Gr"]);
    expect(m.full_name).toBe("Student Name");
    expect(mappingProblem(m)).toBeNull();
  });
  it("requires names", () => {
    expect(mappingProblem({ grade_level: "Grade" })).toMatch(/First name/);
  });
  it("splits full names in either order", () => {
    expect(splitFullName("Rivera, Ana Maria")).toEqual({ first: "Ana Maria", last: "Rivera" });
    expect(splitFullName("Ana Maria Rivera")).toEqual({ first: "Ana Maria", last: "Rivera" });
    expect(splitFullName("Cher")).toBeNull();
  });
});

describe("validation and duplicate detection", () => {
  const m = { first_name: "First", last_name: "Last", grade_level: "Grade", school_student_id: "ID" };
  it("validates required fields and grade range", () => {
    const rows = buildImportRows([{ First: "", Last: "Li", Grade: "10", ID: "" }, { First: "Bo", Last: "Li", Grade: "7", ID: "" }, { First: "Cy", Last: "Li", Grade: "11th", ID: "" }], m, []);
    expect(rows[0].errors).toContain("Missing first name");
    expect(rows[1].errors[0]).toMatch(/9–12/);
    expect(rows[2].grade_level).toBe(11);
    expect(rows.map((r) => r.action)).toEqual(["skip", "skip", "create"]);
    expect(rows[0].line).toBe(2);
  });
  it("matches existing students by ID, then by name", () => {
    const existing = [student({ id: "a", school_student_id: "123" }), student({ id: "b", first_name: "Bo", last_name: "Li" })];
    const rows = buildImportRows([{ First: "Ana", Last: "Rivera", Grade: "", ID: "123" }, { First: "bo", Last: "LI", Grade: "", ID: "" }], m, existing);
    expect(rows[0].match).toMatchObject({ by: "id" });
    expect(rows[0].match?.student.id).toBe("a");
    expect(rows[1].match).toMatchObject({ by: "name" });
    expect(rows.every((r) => r.action === "use_existing")).toBe(true);
  });
  it("does not merge same-name students with different IDs", () => {
    const existing = [student({ id: "a", school_student_id: "123" })];
    const rows = buildImportRows([{ First: "Ana", Last: "Rivera", Grade: "", ID: "999" }], m, existing);
    expect(rows[0].match).toBeUndefined();
    expect(rows[0].action).toBe("create");
  });
  it("flags duplicates within the file", () => {
    const rows = buildImportRows([{ First: "Ana", Last: "Rivera", Grade: "", ID: "1" }, { First: "Ana", Last: "Rivera", Grade: "", ID: "1" }], m, []);
    expect(rows[1].duplicateInFile).toBe(true);
    expect(summarize(rows)).toMatchObject({ create: 1, skipped: 1, duplicates: 1 });
  });
  it("rejects control characters", () => {
    const rows = buildImportRows([{ First: "A\u0007na", Last: "R", Grade: "", ID: "" }], m, []);
    expect(rows[0].errors.join()).toMatch(/control/);
  });
});
