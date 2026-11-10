import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { csvCell, parseCSV, toCSV } from "@/lib/csv";

describe("CSV export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('He said "hi", then left\nlater')).toBe('"He said ""hi"", then left\nlater"');
  });
  it("neutralises spreadsheet formula injection", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-5")).toBe("-5"); // plain negative numbers untouched
  });
  it("produces a file that parses back to the same values", () => {
    const rows = [["Ana", "Rivera, Jr.", 10, null], ["Li", 'O"Neil', 9, "note\nline"]];
    const text = toCSV(["First", "Last", "Grade", "Note"], rows);
    const parsed = Papa.parse<string[]>(text.trim(), { header: false }).data;
    expect(parsed[0]).toEqual(["First", "Last", "Grade", "Note"]);
    expect(parsed[1]).toEqual(["Ana", "Rivera, Jr.", "10", ""]);
    expect(parsed[2]).toEqual(["Li", 'O"Neil', "9", "note\nline"]);
  });
});

describe("CSV import parsing (malformed input)", () => {
  it("rejects empty files", () => {
    expect(parseCSV("   ").errors[0]).toMatch(/empty/i);
  });
  it("rejects binary content", () => {
    expect(parseCSV("PK\u0003\u0004\u0000\u0000garbage").errors[0]).toMatch(/text CSV/i);
  });
  it("rejects oversized files", () => {
    expect(parseCSV("a,b\n" + "x".repeat(2 * 1024 * 1024 + 10)).errors[0]).toMatch(/2 MB/);
  });
  it("reports rows with the wrong number of fields without throwing", () => {
    const r = parseCSV("First,Last\nAna,Rivera\nBo,Li,extra,fields\n");
    expect(r.rows.length).toBe(2);
    expect(r.errors.join(" ")).toMatch(/Row 3/);
  });
  it("detects duplicate column names", () => {
    expect(parseCSV("Name,Name\na,b").errors.join(" ")).toMatch(/repeated/);
  });
  it("strips a UTF-8 BOM and trims headers/values", () => {
    const r = parseCSV("﻿ First Name , Last Name \n  Ana , Rivera ");
    expect(r.headers).toEqual(["First Name", "Last Name"]);
    expect(r.rows[0]).toEqual({ "First Name": "Ana", "Last Name": "Rivera" });
  });
  it("handles unterminated quotes safely", () => {
    const r = parseCSV('First,Last\n"Ana,Rivera\nBo,Li');
    expect(Array.isArray(r.rows)).toBe(true);
  });
  it("caps the number of rows", () => {
    const text = "First,Last\n" + Array.from({ length: 2100 }, (_, i) => `A${i},B${i}`).join("\n");
    const r = parseCSV(text);
    expect(r.rows.length).toBe(2000);
    expect(r.errors.join(" ")).toMatch(/first 2000/);
  });
});
