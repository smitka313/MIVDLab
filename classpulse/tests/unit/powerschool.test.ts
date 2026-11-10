import { describe, expect, it } from "vitest";
import { buildImportRows, detectSource, guessMapping, importGroups, parsePeriod, sensitiveColumns, splitFullName, summarize } from "@/features/students/import-logic";
import { parseCSV } from "@/lib/csv";
import type { Student } from "@/lib/types";

const csv = [
  "Students.ID,Students.Student_Number,Students.LastFirst,Students.First_Name,Students.Last_Name,Students.Grade_Level,Students.Enroll_Status,Students.DOB,Students.Gender,Course_Name,Section_Number,Expression",
  "5501,100234,\"Rivera, Ana M\",Ana,Rivera,10,0,2010-04-02,F,Biology,3,1(A)",
  "5502,100235,\"Li, Bo\",Bo,Li,9,0,2011-01-09,M,Biology,3,1(A)",
  "5501,100234,\"Rivera, Ana M\",Ana,Rivera,10,0,2010-04-02,F,STEM Research Lab,1,4(A)",
  "5503,100236,\"Okafor, Cy\",Cy,Okafor,11,2,2009-07-30,M,STEM Research Lab,1,4(A)",
  "5504,100237,\"Patel, Dev\",Dev,Patel,11,0,2009-02-11,M,STEM Research Lab,1,4(A)",
].join("\n");

describe("PowerSchool roster exports", () => {
  const { headers, rows } = parseCSV(csv);
  const m = guessMapping(headers);

  it("is recognized, prefixes and all", () => {
    expect(detectSource(headers)).toBe("powerschool");
    expect(detectSource(["[1]Student_Number", "[1]First_Name", "[1]Last_Name"])).toBe("powerschool");
    expect(detectSource(["First Name", "Last Name"])).toBeNull();
  });

  it("maps Student_Number (never the internal ID) and the class columns", () => {
    expect(m).toMatchObject({
      school_student_id: "Students.Student_Number",
      first_name: "Students.First_Name",
      last_name: "Students.Last_Name",
      grade_level: "Students.Grade_Level",
      enroll_status: "Students.Enroll_Status",
      course: "Course_Name",
      section: "Section_Number",
      period: "Expression",
    });
  });

  it("flags sensitive columns without importing them", () => {
    expect(sensitiveColumns(headers)).toEqual(["Students.DOB", "Students.Gender"]);
    const out = buildImportRows(rows, m, []);
    expect(JSON.stringify(out)).not.toMatch(/2010-04-02|"F"/);
  });

  it("splits into classes, keeps one student across sections, skips inactive students", () => {
    const out = buildImportRows(rows, m, []);
    expect(out.map((r) => r.action)).toEqual(["create", "create", "create", "skip", "create"]);
    expect(out[2].repeatOfLine).toBe(2); // Ana again, in her second class
    expect(out[3].skipReason).toMatch(/transferred out/);
    expect(summarize(out)).toMatchObject({ create: 3, skipped: 1 });
    const groups = importGroups(rows, m, out);
    expect(groups.map((g) => [g.course, g.period, g.count])).toEqual([
      ["Biology", "1", 2],
      ["STEM Research Lab", "4", 2],
    ]);
  });

  it("matches existing students by student number", () => {
    const existing = [{ id: "s1", first_name: "Ana", last_name: "Rivera", school_student_id: "100234" } as Student];
    const out = buildImportRows(rows, m, existing);
    expect(out[0]).toMatchObject({ action: "use_existing", match: { by: "id" } });
  });

  it("parses LastFirst names and period expressions", () => {
    expect(splitFullName("Rivera, Ana M")).toEqual({ first: "Ana", last: "Rivera" });
    expect(splitFullName("Rivera, Ana M.")).toEqual({ first: "Ana", last: "Rivera" });
    expect(splitFullName("Rivera, Mary Ann")).toEqual({ first: "Mary Ann", last: "Rivera" });
    expect(parsePeriod("1(A)")).toBe("1");
    expect(parsePeriod("1-2(A-B)")).toBe("1-2");
    expect(parsePeriod("P3")).toBe("3");
    expect(parsePeriod("Period 4")).toBe("4");
    expect(parsePeriod("HR")).toBe("HR");
  });

  it("works from LastFirst alone", () => {
    const f = parseCSV("Student_Number,LastFirst,Grade_Level\n7,\"Nguyen, Kim T\",12\n");
    const mm = guessMapping(f.headers);
    expect(mm.full_name).toBe("LastFirst");
    expect(buildImportRows(f.rows, mm, [])[0]).toMatchObject({ first_name: "Kim", last_name: "Nguyen", grade_level: 12, school_student_id: "7" });
  });
});
