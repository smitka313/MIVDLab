import type { Student } from "@/lib/types";

/** Roster CSV import: column mapping, validation and duplicate detection (pure; unit tested). */

export type ImportField = "first_name" | "last_name" | "full_name" | "preferred_name" | "grade_level" | "school_student_id";
export type Mapping = Partial<Record<ImportField, string>>;

export const FIELD_LABELS: Record<ImportField, string> = {
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name (one column)",
  preferred_name: "Preferred name",
  grade_level: "Grade",
  school_student_id: "Student ID",
};

const SYNONYMS: Record<ImportField, string[]> = {
  first_name: ["first name", "firstname", "first", "given name", "student first name", "fname"],
  last_name: ["last name", "lastname", "last", "surname", "family name", "student last name", "lname"],
  full_name: ["name", "student name", "full name", "student"],
  preferred_name: ["preferred name", "preferred", "nickname", "goes by"],
  grade_level: ["grade", "grade level", "gr", "year"],
  school_student_id: ["student id", "id", "student number", "sis id", "student #", "local id", "studentid"],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<string>();
  for (const field of Object.keys(SYNONYMS) as ImportField[]) {
    const h = headers.find((x) => !used.has(x) && SYNONYMS[field].includes(norm(x)));
    if (h) {
      m[field] = h;
      used.add(h);
    }
  }
  if (m.first_name && m.last_name) delete m.full_name;
  return m;
}

export function mappingProblem(m: Mapping): string | null {
  if (m.first_name && m.last_name) return null;
  if (m.full_name) return null;
  return "Map both First name and Last name (or a single Full name column).";
}

/** "Rivera, Ana" or "Ana Rivera" -> parts */
export function splitFullName(full: string): { first: string; last: string } | null {
  const s = full.trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.includes(",")) {
    const [last, first] = s.split(",").map((x) => x.trim());
    return first && last ? { first, last } : null;
  }
  const parts = s.split(" ");
  if (parts.length < 2) return null;
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export interface ImportRow {
  line: number; // 1-based line number in the file (header = 1)
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  grade_level: number | null;
  school_student_id: string | null;
  errors: string[];
  /** Existing student this row matches (by ID, else by exact name). */
  match?: { student: Student; by: "id" | "name" };
  duplicateInFile: boolean;
  action: "create" | "use_existing" | "skip";
}

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function buildImportRows(rows: Record<string, string>[], m: Mapping, existing: Student[]): ImportRow[] {
  const byId = new Map(existing.filter((s) => s.school_student_id).map((s) => [s.school_student_id!.toLowerCase(), s]));
  const byName = new Map<string, Student>();
  for (const s of existing) byName.set(`${s.first_name}|${s.last_name}`.toLowerCase(), s);
  const seen = new Set<string>();

  return rows.map((r, i) => {
    const get = (f: ImportField) => (m[f] ? String(r[m[f]!] ?? "").trim() : "");
    const errors: string[] = [];
    let first = get("first_name");
    let last = get("last_name");
    if ((!first || !last) && m.full_name) {
      const parts = splitFullName(get("full_name"));
      if (parts) {
        first ||= parts.first;
        last ||= parts.last;
      }
    }
    if (!first) errors.push("Missing first name");
    if (!last) errors.push("Missing last name");
    if (first.length > 80 || last.length > 80) errors.push("Name is longer than 80 characters");
    const pref = get("preferred_name");
    if (pref.length > 80) errors.push("Preferred name is too long");
    const gradeRaw = get("grade_level").replace(/^(grade|gr)\s*/i, "").replace(/(th|st|nd|rd)$/i, "");
    let grade: number | null = null;
    if (gradeRaw) {
      const g = Number(gradeRaw);
      if (!Number.isInteger(g) || g < 9 || g > 12) errors.push(`Grade “${get("grade_level")}” must be 9–12`);
      else grade = g;
    }
    const sid = get("school_student_id") || null;
    if (sid && sid.length > 40) errors.push("Student ID is longer than 40 characters");
    if ([first, last, pref, sid ?? ""].some((v) => CONTROL.test(v))) errors.push("Contains unsupported control characters");

    const key = sid ? `id:${sid.toLowerCase()}` : `name:${first}|${last}`.toLowerCase();
    const duplicateInFile = seen.has(key);
    seen.add(key);

    let match: ImportRow["match"];
    const idMatch = sid ? byId.get(sid.toLowerCase()) : undefined;
    const nameMatch = byName.get(`${first}|${last}`.toLowerCase());
    if (idMatch) match = { student: idMatch, by: "id" };
    // Same name but a different school ID on file means a different student.
    else if (nameMatch && !(sid && nameMatch.school_student_id)) match = { student: nameMatch, by: "name" };

    const action: ImportRow["action"] = errors.length || duplicateInFile ? "skip" : match ? "use_existing" : "create";
    return {
      line: i + 2,
      first_name: first,
      last_name: last,
      preferred_name: pref || null,
      grade_level: grade,
      school_student_id: sid,
      errors,
      match,
      duplicateInFile,
      action,
    };
  });
}

export function summarize(rows: ImportRow[]) {
  return {
    create: rows.filter((r) => r.action === "create").length,
    existing: rows.filter((r) => r.action === "use_existing").length,
    skipped: rows.filter((r) => r.action === "skip").length,
    invalid: rows.filter((r) => r.errors.length).length,
    duplicates: rows.filter((r) => r.duplicateInFile).length,
  };
}
