import type { Student } from "@/lib/types";

/** Roster CSV import: column mapping, validation and duplicate detection (pure; unit tested). */

export type ImportField = "first_name" | "last_name" | "full_name" | "preferred_name" | "grade_level" | "grad_year" | "school_student_id" | "course" | "section" | "period" | "enroll_status";

/** Optional columns that sort a multi-section file into classes. */
export const CLASS_FIELDS: ImportField[] = ["course", "section", "period"];
export type Mapping = Partial<Record<ImportField, string>>;

export const FIELD_LABELS: Record<ImportField, string> = {
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name (one column)",
  preferred_name: "Preferred name",
  grade_level: "Grade",
  grad_year: "Graduation year",
  school_student_id: "Student ID",
  course: "Course",
  section: "Section",
  period: "Period / expression",
  enroll_status: "Enrollment status",
};

// Synonyms are in priority order: the earliest synonym found in the file wins.
const SYNONYMS: Record<ImportField, string[]> = {
  first_name: ["first name", "firstname", "legal first name", "given name", "student first name", "name first", "fname", "first"],
  last_name: ["last name", "lastname", "legal last name", "surname", "family name", "student last name", "name last", "lname", "last"],
  // PowerSchool "LastFirst" = "Rivera, Ana M"
  full_name: ["lastfirst", "last first", "student name", "full name", "name", "student", "member", "user"],
  preferred_name: ["preferred name", "preferred first name", "pref first name", "preferredname", "name preferred", "nickname", "goes by", "preferred"],
  grade_level: ["grade level", "grade", "current grade", "gr"],
  grad_year: ["grad year", "graduation year", "year of graduation", "class of", "gradyear", "cohort"],
  // PowerSchool: Student_Number (never the internal "ID"/"DCID"); Schoology: Unique User ID / School UID.
  school_student_id: ["student number", "student id", "studentid", "student #", "sis id", "local id", "unique user id", "school uid", "unique id", "student uid", "uid", "id"],
  course: ["course name", "course title", "course", "class name", "class", "course number", "course code"],
  section: ["section number", "section", "section id", "sec"],
  period: ["expression", "period", "class period", "per", "periods"],
  enroll_status: ["enroll status", "enrollment status", "enrollstatus", "status"],
};

/** Normalise a header: drop export prefixes ("Students.", "[1]", "CC."), punctuation and case. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^\s*\[\d+\]\s*/, "")
    .replace(/^(students?|cc|courses?|sections?|schools?|u_\w+)\./, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<string>();
  for (const field of Object.keys(SYNONYMS) as ImportField[]) {
    for (const syn of SYNONYMS[field]) {
      const h = headers.find((x) => !used.has(x) && norm(x) === syn);
      if (h) {
        m[field] = h;
        used.add(h);
        break;
      }
    }
  }
  if (m.first_name && m.last_name) delete m.full_name;
  return m;
}

/** Which system produced this file, when we can tell (used for a friendly hint). */
export function detectSource(headers: string[]): "schoology" | "powerschool" | null {
  const h = new Set(headers.map(norm));
  if (h.has("unique user id") || h.has("school uid") || (h.has("name first") && h.has("name last"))) return "schoology";
  const prefixed = headers.some((x) => /^\s*(\[\d+\]|students?\.|cc\.)/i.test(x));
  if (prefixed || h.has("lastfirst") || h.has("enroll status") || (h.has("student number") && (h.has("expression") || h.has("section number") || h.has("grade level")))) return "powerschool";
  return null;
}

/**
 * Columns that look like sensitive personal information (SIS exports often
 * include them). ClassPulse never imports unmapped columns; this only powers a notice.
 */
export function sensitiveColumns(headers: string[]) {
  return headers.filter((x) => /\b(dob|birth|gender|sex|ethnic\w*|race|address|street|city|zip|phone|ssn|social security|lunch|ell|lep|iep|504|medical|allerg\w*|disab\w*|guardian|mother|father|parent|email|home language)\b/.test(norm(x)));
}

/** "1(A)" -> "1", "1-2(A-B)" -> "1-2", "P3" -> "3", "Period 4" -> "4". */
export function parsePeriod(raw: string) {
  const s = raw.trim();
  const m = s.match(/^(?:p(?:er(?:iod)?)?\.?\s*)?(\d+(?:\s*-\s*\d+)?)/i);
  return m ? m[1].replace(/\s+/g, "") : s;
}

/** PowerSchool Enroll_Status: 0 = active. Also accepts words like "Active"/"Enrolled". */
function inactiveStatus(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (["0", "active", "a", "enrolled", "current", "yes", "y"].includes(v)) return null;
  const meaning: Record<string, string> = { "-1": "pre-registered", "1": "inactive", "2": "transferred out", "3": "graduated", "4": "imported as historical" };
  return meaning[v] ?? v;
}

export interface ImportGroup {
  key: string;
  label: string;
  course: string;
  section: string;
  period: string;
  count: number;
}

/** Graduation year -> grade (9–12) for the school year containing `today` (school years start in July). */
export function gradYearToGrade(gradYear: number, today = new Date()) {
  const seniorsGraduate = today.getMonth() >= 6 ? today.getFullYear() + 1 : today.getFullYear();
  return 12 - (gradYear - seniorsGraduate);
}

/** Summary rows some exports include (e.g. gradebook "Points Possible"); never students. */
const NOT_STUDENTS = /^(points possible|class average|average|total|max points|category weight)$/i;

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
    const [last, firstRaw] = s.split(",").map((x) => x.trim());
    // "Rivera, Ana M" / "Rivera, Ana M." -> drop a trailing middle initial
    const first = firstRaw?.replace(/\s+[A-Za-z]\.?$/, "");
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
  /** Why a valid-looking row is skipped (e.g. not currently enrolled). */
  skipReason?: string;
  /** Class group this row belongs to (multi-section files). */
  group: string | null;
  /** Same student as an earlier row in another class (one student, several enrollments). */
  repeatOfLine?: number;
}

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function buildImportRows(rows: Record<string, string>[], m: Mapping, existing: Student[], today = new Date()): ImportRow[] {
  const byId = new Map(existing.filter((s) => s.school_student_id).map((s) => [s.school_student_id!.toLowerCase(), s]));
  const byName = new Map<string, Student>();
  for (const s of existing) byName.set(`${s.first_name}|${s.last_name}`.toLowerCase(), s);
  const seen = new Map<string, number>(); // student key (+ group) -> line
  const firstLine = new Map<string, number>(); // student key -> first line

  const isBlankOrSummary = (r: Record<string, string>) => {
    const vals = (["first_name", "last_name", "full_name"] as ImportField[]).map((f) => (m[f] ? String(r[m[f]!] ?? "").trim() : ""));
    return vals.every((v) => !v) || vals.some((v) => NOT_STUDENTS.test(v));
  };
  return rows.flatMap((r, i) => {
    if (isBlankOrSummary(r)) return []; // skipped silently: not a student row
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
    } else if (get("grad_year")) {
      const y = Number(get("grad_year").replace(/^class of\s*/i, ""));
      const g = Number.isInteger(y) ? gradYearToGrade(y, today) : NaN;
      if (!Number.isInteger(g) || g < 9 || g > 12) errors.push(`Graduation year “${get("grad_year")}” isn't a grade 9–12 student this year`);
      else grade = g;
    }
    const sid = get("school_student_id") || null;
    if (sid && sid.length > 40) errors.push("Student ID is longer than 40 characters");
    if ([first, last, pref, sid ?? ""].some((v) => CONTROL.test(v))) errors.push("Contains unsupported control characters");

    const group = groupOf(r, m);
    const studentKey = sid ? `id:${sid.toLowerCase()}` : `name:${first}|${last}`.toLowerCase();
    const key = `${studentKey}#${group?.key ?? ""}`;
    const duplicateInFile = seen.has(key);
    seen.set(key, i + 2);
    const repeatOfLine = !duplicateInFile && firstLine.has(studentKey) ? firstLine.get(studentKey) : undefined;
    if (!firstLine.has(studentKey) && !errors.length) firstLine.set(studentKey, i + 2);
    const inactive = m.enroll_status ? inactiveStatus(get("enroll_status")) : null;
    const skipReason = inactive ? `Not currently enrolled (${inactive})` : undefined;

    let match: ImportRow["match"];
    const idMatch = sid ? byId.get(sid.toLowerCase()) : undefined;
    const nameMatch = byName.get(`${first}|${last}`.toLowerCase());
    if (idMatch) match = { student: idMatch, by: "id" };
    // Same name but a different school ID on file means a different student.
    else if (nameMatch && !(sid && nameMatch.school_student_id)) match = { student: nameMatch, by: "name" };

    const action: ImportRow["action"] = errors.length || duplicateInFile || skipReason ? "skip" : match ? "use_existing" : "create";
    return [{
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
      skipReason,
      group: group?.key ?? null,
      repeatOfLine,
    }];
  });
}

function groupOf(r: Record<string, string>, m: Mapping): ImportGroup | null {
  if (!CLASS_FIELDS.some((f) => m[f])) return null;
  const v = (f: ImportField) => (m[f] ? String(r[m[f]!] ?? "").trim() : "");
  const course = v("course");
  const section = v("section");
  const period = v("period") ? parsePeriod(v("period")) : "";
  if (!course && !section && !period) return null;
  const label = [course || "Class", period && `period ${period}`, section && `section ${section}`].filter(Boolean).join(" · ");
  return { key: `${course}|${section}|${period}`.toLowerCase(), label, course, section, period, count: 0 };
}

/** Distinct classes in a multi-section file, with student counts (rows that will import). */
export function importGroups(rawRows: Record<string, string>[], m: Mapping, rows: ImportRow[]): ImportGroup[] {
  const groups = new Map<string, ImportGroup>();
  for (const r of rawRows) {
    const g = groupOf(r, m);
    if (g && !groups.has(g.key)) groups.set(g.key, g);
  }
  for (const r of rows) if (r.group && r.action !== "skip") groups.get(r.group)!.count++;
  return [...groups.values()].sort((a, b) => a.period.localeCompare(b.period, undefined, { numeric: true }) || a.course.localeCompare(b.course));
}

export function summarize(rows: ImportRow[]) {
  return {
    create: rows.filter((r) => r.action === "create" && !r.repeatOfLine).length,
    existing: rows.filter((r) => r.action === "use_existing" && !r.repeatOfLine).length,
    skipped: rows.filter((r) => r.action === "skip").length,
    invalid: rows.filter((r) => r.errors.length).length,
    duplicates: rows.filter((r) => r.duplicateInFile).length,
  };
}
