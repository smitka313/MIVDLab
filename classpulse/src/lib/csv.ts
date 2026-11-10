import Papa from "papaparse";

/**
 * CSV generation. Cells beginning with = + - @ (or tab/CR) are prefixed with
 * an apostrophe so spreadsheet apps don't execute them as formulas
 * (CSV/formula injection). Negative numbers are left alone.
 */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = typeof v === "string" ? v : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
}

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;

/** Parse untrusted CSV text safely; never throws. */
export function parseCSV(text: string): ParsedCSV {
  const errors: string[] = [];
  if (!text.trim()) return { headers: [], rows: [], errors: ["The file is empty."] };
  if (text.length > MAX_IMPORT_BYTES) return { headers: [], rows: [], errors: ["The file is larger than 2 MB. Split it into smaller files."] };
  if (/\u0000/.test(text)) return { headers: [], rows: [], errors: ["This doesn't look like a text CSV file."] };
  const clean = text.replace(/^\uFEFF/, "");
  // Papaparse silently renames repeated headers (Name, Name_1), so check the raw header row.
  const rawHeader = (Papa.parse<string[]>(clean, { preview: 1 }).data[0] ?? []).map((h) => String(h).trim().toLowerCase()).filter(Boolean);
  const res = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  const headers = (res.meta.fields ?? []).filter((h) => h !== "");
  if (!headers.length) errors.push("No header row found. The first row should name the columns (e.g. First Name, Last Name).");
  if (new Set(rawHeader).size !== rawHeader.length) errors.push("Some column names are repeated. Each column needs a unique name.");
  for (const e of res.errors.slice(0, 5)) {
    if (e.code === "TooManyFields" || e.code === "TooFewFields") errors.push(`Row ${(e.row ?? 0) + 2}: ${e.message}.`);
    else if (e.code !== "UndetectableDelimiter") errors.push(e.message);
  }
  let rows = res.data.filter((r) => r && typeof r === "object");
  if (rows.length > MAX_IMPORT_ROWS) {
    errors.push(`Only the first ${MAX_IMPORT_ROWS} rows can be imported at once.`);
    rows = rows.slice(0, MAX_IMPORT_ROWS);
  }
  return { headers, rows, errors };
}
