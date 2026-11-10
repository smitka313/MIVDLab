import { describe, expect, it } from "vitest";
import { buildImportRows, detectSource, gradYearToGrade, guessMapping } from "@/features/students/import-logic";
import { contentBounds } from "@/features/seating/seating-chart";
import { appendPhrase } from "@/features/notes/note-templates";
import { parseCSV } from "@/lib/csv";

describe("Schoology roster import", () => {
  const csv = [
    "Name First,Name Last,Unique User ID,Grad Year,Unit 1 Quiz (10),Overall",
    "Points Possible,,,,10,",
    "Ana,Rivera,S100234,2028,9,90%",
    "Bo,Li,S100999,2027,8,80%",
    ",,,,,",
    "Cy,Old,S100000,2024,7,70%",
  ].join("\n");

  it("recognizes Schoology columns", () => {
    const { headers } = parseCSV(csv);
    expect(detectSource(headers)).toBe("schoology");
    expect(guessMapping(headers)).toMatchObject({ first_name: "Name First", last_name: "Name Last", school_student_id: "Unique User ID", grad_year: "Grad Year" });
  });

  it("derives grade from graduation year and skips summary/blank rows", () => {
    const { headers, rows } = parseCSV(csv);
    const out = buildImportRows(rows, guessMapping(headers), [], new Date(2026, 10, 10)); // Nov 2026: seniors graduate 2027
    expect(out.map((r) => r.first_name)).toEqual(["Ana", "Bo", "Cy"]);
    expect(out[0]).toMatchObject({ grade_level: 11, school_student_id: "S100234", action: "create" }); // class of 2028 = juniors
    expect(out[1].grade_level).toBe(12);
    expect(out[2].errors[0]).toMatch(/Graduation year/);
    expect(out[0].line).toBe(3); // line numbers still match the file
  });

  it("maps graduation years across the July rollover", () => {
    expect(gradYearToGrade(2027, new Date(2026, 5, 1))).toBe(11); // June 2026: seniors are class of 2026
    expect(gradYearToGrade(2027, new Date(2026, 7, 20))).toBe(12); // August 2026: new school year
  });

  it("does not detect other files as Schoology", () => {
    expect(detectSource(["First Name", "Last Name", "Grade"])).toBeNull();
  });
});

describe("seating chart cropping", () => {
  it("finds the box around all items", () => {
    expect(contentBounds([{ x: 2, y: 3, w: 2, h: 1 }, { x: 7, y: 8, w: 1, h: 1 }], { cols: 12, rows: 10 })).toEqual({ x: 2, y: 3, cols: 6, rows: 6 });
    expect(contentBounds([], { cols: 12, rows: 10 })).toEqual({ x: 0, y: 0, cols: 12, rows: 10 });
  });
});

describe("note phrases", () => {
  it("appends with a single space", () => {
    expect(appendPhrase("", "Called home.")).toBe("Called home.");
    expect(appendPhrase("Was late.  ", "Called home.")).toBe("Was late. Called home.");
  });
});
