"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileUp, Upload } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { useRows, useStore, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { parseCSV, toCSV, type ParsedCSV } from "@/lib/csv";
import { buildImportRows, CLASS_FIELDS, detectSource, FIELD_LABELS, guessMapping, importGroups, mappingProblem, sensitiveColumns, summarize, type ImportField, type ImportGroup, type ImportRow, type Mapping } from "@/features/students/import-logic";
import type { ClassSection } from "@/lib/types";
import { COLOR_NAMES } from "@/lib/labels";
import { classLabel, sortClasses } from "@/lib/hooks";
import { cn, downloadFile, pluralize, toISODate, uuid } from "@/lib/utils";
import { friendlyError } from "@/lib/data/adapter";

type Step = "upload" | "map" | "preview" | "done";
interface Result {
  created: number;
  linked: number;
  enrolled: number;
  classesCreated: number;
  failures: { line: number; message: string }[];
}

export default function ImportPage() {
  return (
    <React.Suspense fallback={<LoadingState />}>
      <ImportWizard />
    </React.Suspense>
  );
}

function ImportWizard() {
  const params = useSearchParams();
  const status = useTables("students", "classes", "enrollments");
  const students = useRows("students");
  const classes = useRows("classes");
  const store = useStore();
  const [step, setStep] = React.useState<Step>("upload");
  const [parsed, setParsed] = React.useState<ParsedCSV | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [paste, setPaste] = React.useState("");
  const [mapping, setMapping] = React.useState<Mapping>({});
  const [overrides, setOverrides] = React.useState<Record<number, ImportRow["action"]>>({});
  const [classIds, setClassIds] = React.useState<string[]>(() => (params.get("class") ? [params.get("class")!] : []));
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const activeClasses = classes.rows.filter((c) => !c.archived_at).sort(sortClasses);
  const rows = React.useMemo(() => {
    if (!parsed) return [];
    return buildImportRows(parsed.rows, mapping, students.rows).map((r) => (overrides[r.line] && !r.errors.length && !r.duplicateInFile ? { ...r, action: overrides[r.line] } : r));
  }, [parsed, mapping, students.rows, overrides]);
  const sum = summarize(rows);
  const groups = React.useMemo(() => (parsed ? importGroups(parsed.rows, mapping, rows) : []), [parsed, mapping, rows]);
  const [groupTargets, setGroupTargets] = React.useState<Record<string, string>>({});
  const targetFor = (g: ImportGroup) => groupTargets[g.key] ?? guessTarget(g, activeClasses);

  const load = (text: string, name: string) => {
    const p = parseCSV(text);
    setParsed(p);
    setFileName(name);
    setOverrides({});
    setResult(null);
    if (p.headers.length && p.rows.length) {
      setMapping(guessMapping(p.headers));
      setStep("map");
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setParsed({ headers: [], rows: [], errors: ["The file is larger than 2 MB."] });
      return;
    }
    if (!/\.(csv|txt|tsv)$/i.test(f.name) && !/text|csv/.test(f.type)) {
      setParsed({ headers: [], rows: [], errors: ["Choose a .csv file. In Excel or Google Sheets use File → Download/Save as → CSV."] });
      return;
    }
    load(await f.text(), f.name);
  };

  const runImport = async () => {
    setBusy(true);
    const res: Result = { created: 0, linked: 0, enrolled: 0, classesCreated: 0, failures: [] };
    // Resolve each student once (a student can appear in several sections of the file).
    const idByLine = new Map<number, string>();
    const firsts = rows.filter((r) => r.action !== "skip" && !r.repeatOfLine);
    for (const r of firsts) if (r.action === "use_existing" && r.match) idByLine.set(r.line, r.match.student.id);
    res.linked = idByLine.size;
    const toCreate = firsts.filter((r) => r.action === "create");
    // Create in batches; if a batch fails, retry its rows one by one to pinpoint failures.
    const payload = (r: ImportRow) => ({ id: uuid(), first_name: r.first_name, last_name: r.last_name, preferred_name: r.preferred_name, grade_level: r.grade_level, school_student_id: r.school_student_id, school_id: null, photo_path: null, is_demo: false, archived_at: null });
    for (let i = 0; i < toCreate.length; i += 100) {
      const batch = toCreate.slice(i, i + 100).map((r) => ({ r, p: payload(r) }));
      try {
        await store.insert("students", batch.map((b) => b.p));
        for (const b of batch) idByLine.set(b.r.line, b.p.id);
        res.created += batch.length;
      } catch {
        for (const b of batch) {
          try {
            await store.insertOne("students", b.p);
            idByLine.set(b.r.line, b.p.id);
            res.created++;
          } catch (e) {
            res.failures.push({ line: b.r.line, message: friendlyError(e) });
          }
        }
      }
    }
    const idOf = (r: ImportRow) => idByLine.get(r.repeatOfLine ?? r.line);
    const allIds = [...new Set(rows.filter((r) => r.action !== "skip").map(idOf).filter(Boolean) as string[])];

    // Which students go into which class.
    const perClass = new Map<string, Set<string>>();
    const addTo = (cid: string, sid: string) => perClass.set(cid, (perClass.get(cid) ?? new Set()).add(sid));
    if (groups.length) {
      const classForGroup = new Map<string, string>();
      let order = activeClasses.length;
      for (const g of groups) {
        const t = targetFor(g);
        if (t === "none" || !g.count) continue;
        if (t !== "new") {
          classForGroup.set(g.key, t);
          continue;
        }
        try {
          const c = await store.insertOne("classes", newClassFor(g, ++order));
          classForGroup.set(g.key, c.id);
          res.classesCreated++;
        } catch (e) {
          res.failures.push({ line: 0, message: `Couldn't create class “${g.label}”: ${friendlyError(e)}` });
        }
      }
      for (const r of rows) {
        if (r.action === "skip" || !r.group) continue;
        const cid = classForGroup.get(r.group);
        const sid = idOf(r);
        if (cid && sid) addTo(cid, sid);
      }
    } else {
      for (const cid of classIds) for (const sid of allIds) addTo(cid, sid);
    }

    // Enroll
    const today = toISODate();
    for (const [cid, idSet] of perClass) {
      const ids = [...idSet];
      const existing = store.rows("enrollments").filter((e) => e.class_id === cid);
      const newIds = ids.filter((sid) => !existing.some((e) => e.student_id === sid));
      const rejoin = existing.filter((e) => ids.includes(e.student_id) && e.dropped_at);
      try {
        if (newIds.length) await store.insert("enrollments", newIds.map((student_id) => ({ class_id: cid, student_id, enrolled_at: today, dropped_at: null })));
        for (const e of rejoin) await store.update("enrollments", e.id, { dropped_at: null });
        res.enrolled += newIds.length + rejoin.length;
      } catch (e) {
        const c = store.rows("classes").find((x) => x.id === cid);
        res.failures.push({ line: 0, message: `Enrollment in ${c ? classLabel(c) : "a class"} failed: ${friendlyError(e)}` });
      }
    }
    setResult(res);
    setBusy(false);
    setStep("done");
  };

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Import roster"
        description="Upload a CSV exported from your school system or a spreadsheet. Nothing is saved until you confirm."
        actions={
          <Button asChild variant="ghost">
            <Link href="/students">
              <ArrowLeft /> Students
            </Link>
          </Button>
        }
      />
      <ol className="mb-5 flex flex-wrap gap-2 text-sm" aria-label="Import steps">
        {(["upload", "map", "preview", "done"] as Step[]).map((s, i) => (
          <li key={s} aria-current={step === s ? "step" : undefined} className={cn("rounded-full border px-3 py-1", step === s ? "border-brand bg-accent font-medium text-accent-foreground" : "text-muted-foreground")}>
            {i + 1}. {{ upload: "Upload", map: "Map columns", preview: "Review", done: "Done" }[s]}
          </li>
        ))}
      </ol>

      {step === "upload" && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Choose a CSV file</CardTitle>
              <CardDescription>Columns can be in any order. You&apos;ll match them to ClassPulse fields next.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void onFile(e.dataTransfer.files[0]);
                }}
                className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center", dragOver ? "border-brand bg-accent" : "hover:bg-secondary/50")}
              >
                <FileUp className="size-8 text-muted-foreground" aria-hidden />
                <span className="font-medium">Drop a CSV here or click to browse</span>
                <span className="text-xs text-muted-foreground">.csv up to 2 MB · {2000} rows</span>
                <input type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
              </label>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Or paste CSV text</summary>
                <div className="mt-2 grid gap-2">
                  <Textarea aria-label="CSV text" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"First Name,Last Name,Grade\nAna,Rivera,10"} />
                  <Button variant="outline" className="justify-self-start" disabled={!paste.trim()} onClick={() => load(paste, "pasted text")}>
                    Use pasted text
                  </Button>
                </div>
              </details>
              {parsed?.errors.length ? (
                <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <p className="mb-1 flex items-center gap-1.5 font-medium text-destructive">
                    <AlertTriangle className="size-4" /> We couldn&apos;t read {fileName || "that file"}
                  </p>
                  <ul className="list-disc pl-5">
                    {parsed.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                    {parsed.headers.length > 0 && !parsed.rows.length && <li>There are no data rows under the header.</li>}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>From PowerSchool</CardTitle>
              <CardDescription>Use a roster export from PowerTeacher Pro or PowerSchool (ask your PowerSchool administrator if you don&apos;t see one).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p>ClassPulse recognizes PowerSchool column names such as Student_Number, First_Name, Last_Name, LastFirst and Grade_Level — including prefixed forms like Students.First_Name.</p>
              <p>A file with all your sections (Course_Name, Section_Number or Expression/period) is split into your classes in one go. Students who aren&apos;t currently enrolled (Enroll_Status) are skipped.</p>
              <p>Only names, student numbers and grade level are imported. Other columns — birth date, gender, addresses and so on — are never read or stored.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>From Schoology</CardTitle>
              <CardDescription>Use a CSV your school&apos;s Schoology gives you — for example a course member list or the course gradebook export.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p>ClassPulse recognizes Schoology&apos;s column names (Name First, Name Last, Unique User ID / School UID, Grad Year) and works out the grade from the graduation year.</p>
              <p>Only names, IDs and grade level are imported. Gradebook scores and summary rows such as &ldquo;Points Possible&rdquo; are skipped.</p>
              <p>Import one course at a time and choose the matching ClassPulse class on the review step, or include course/section columns to sort several at once.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Template</CardTitle>
              <CardDescription>Start from a blank template with the recommended columns.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => downloadFile("classpulse-roster-template.csv", toCSV(["First Name", "Last Name", "Preferred Name", "Grade", "Student ID"], [["Ana", "Rivera", "", "10", "123456"]]))}>
                <Download /> Download template
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">Only names are required. Do not include demographic, disability or medical information.</p>
            </CardContent>
          </Card>
          </div>
        </div>
      )}

      {step === "map" && parsed && (
        <Card>
          <CardHeader>
            <CardTitle>Match columns</CardTitle>
            <CardDescription>
              {parsed.rows.length} rows found in {fileName}. We guessed the matches below — adjust if needed.
              {detectSource(parsed.headers) === "schoology" && (
                <span className="mt-1 block font-medium text-brand-ink">Looks like a Schoology export: names, Unique User ID and Grad Year were matched. Other columns (such as grades) are ignored.</span>
              )}
              {detectSource(parsed.headers) === "powerschool" && (
                <span className="mt-1 block font-medium text-brand-ink">
                  Looks like a PowerSchool export: Student_Number, names and Grade_Level were matched{CLASS_FIELDS.some((f) => mapping[f]) ? ", and course/period columns will sort students into your classes" : ""}.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {sensitiveColumns(parsed.headers).length > 0 && (
              <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                This file also contains sensitive columns ({sensitiveColumns(parsed.headers).slice(0, 6).join(", ")}
                {sensitiveColumns(parsed.headers).length > 6 ? ", …" : ""}). ClassPulse ignores them — only the columns matched below are read — but consider deleting the downloaded file after importing.
              </p>
            )}
            <h3 className="text-sm font-semibold">Student</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(FIELD_LABELS) as ImportField[]).filter((f) => !CLASS_FIELDS.includes(f) && f !== "enroll_status").map((f) => (
                <label key={f} className="grid gap-1.5 text-sm">
                  <span className="font-medium">{FIELD_LABELS[f]}</span>
                  <Select value={mapping[f] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || undefined }))}>
                    <option value="">— Not in file —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                  <span className="truncate text-xs text-muted-foreground">e.g. {mapping[f] ? parsed.rows[0]?.[mapping[f]!] || "(blank)" : "—"}</span>
                </label>
              ))}
            </div>
            <h3 className="text-sm font-semibold">Classes and enrollment <span className="font-normal text-muted-foreground">(optional — for files with several sections, e.g. from PowerSchool)</span></h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([...CLASS_FIELDS, "enroll_status"] as ImportField[]).map((f) => (
                <label key={f} className="grid gap-1.5 text-sm">
                  <span className="font-medium">{FIELD_LABELS[f]}</span>
                  <Select value={mapping[f] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || undefined }))}>
                    <option value="">— Not in file —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                  <span className="truncate text-xs text-muted-foreground">e.g. {mapping[f] ? parsed.rows[0]?.[mapping[f]!] || "(blank)" : "—"}</span>
                </label>
              ))}
            </div>
            {parsed.errors.length > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Warnings: {parsed.errors.join(" ")}
              </p>
            )}
            {mappingProblem(mapping) && <p role="alert" className="text-sm font-medium text-destructive">{mappingProblem(mapping)}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button disabled={!!mappingProblem(mapping)} onClick={() => setStep("preview")}>
                Review rows
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <div className="grid gap-4">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 pt-5 text-sm">
              <Badge color="emerald">{sum.create} new</Badge>
              <Badge color="blue">{sum.existing} already in ClassPulse</Badge>
              <Badge color={sum.skipped ? "amber" : undefined}>{sum.skipped} skipped</Badge>
              {sum.invalid > 0 && <span className="text-destructive">{sum.invalid} rows have errors and will be skipped.</span>}
              {sum.duplicates > 0 && <span className="text-amber-700 dark:text-amber-400">{sum.duplicates} duplicate rows in the file will be skipped.</span>}
            </CardContent>
          </Card>
          {groups.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Classes in this file</CardTitle>
              <CardDescription>Choose where each section&apos;s students go. Missing classes can be created for you (add times and rooms later).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {groups.map((g) => (
                <label key={g.key} className="grid gap-2 rounded-lg border px-3 py-2 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                  <span>
                    <span className="font-medium">{g.label}</span> <span className="text-muted-foreground">· {pluralize(g.count, "student")}</span>
                  </span>
                  <Select aria-label={`Class for ${g.label}`} value={targetFor(g)} onChange={(e) => setGroupTargets((t) => ({ ...t, [g.key]: e.target.value }))} className="w-auto">
                    <option value="new">Create new class: {g.course || "Class"}{g.period ? ` (P${g.period})` : ""}</option>
                    {activeClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        Add to {classLabel(c)}
                      </option>
                    ))}
                    <option value="none">Don&apos;t add to a class</option>
                  </Select>
                </label>
              ))}
            </CardContent>
          </Card>
          ) : (
          <Card>
            <CardHeader>
              <CardTitle>Enroll in classes</CardTitle>
              <CardDescription>Imported and matched students will be added to the selected classes.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {activeClasses.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                  <Checkbox checked={classIds.includes(c.id)} onChange={(e) => setClassIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)))} />
                  {classLabel(c)}
                </label>
              ))}
              {!activeClasses.length && <p className="text-sm text-muted-foreground">No classes yet — students will be added to your student list only.</p>}
            </CardContent>
          </Card>
          )}
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>Line</TH>
                  <TH>Name</TH>
                  <TH>Preferred</TH>
                  <TH>Grade</TH>
                  <TH>Student ID</TH>
                  <TH>Status</TH>
                  <TH>Action</TH>
                </tr>
              </THead>
              <TBody>
                {rows.slice(0, 500).map((r) => (
                  <TR key={r.line} className={cn(r.errors.length && "bg-destructive/5")}>
                    <TD className="text-muted-foreground">{r.line}</TD>
                    <TD className="font-medium">
                      {r.first_name || <em className="text-muted-foreground">missing</em>} {r.last_name || <em className="text-muted-foreground">missing</em>}
                    </TD>
                    <TD>{r.preferred_name}</TD>
                    <TD>{r.grade_level}</TD>
                    <TD>{r.school_student_id}</TD>
                    <TD className="text-xs">
                      {r.errors.length ? (
                        <span className="text-destructive">{r.errors.join("; ")}</span>
                      ) : r.skipReason ? (
                        <span className="text-amber-700 dark:text-amber-400">{r.skipReason}</span>
                      ) : r.repeatOfLine ? (
                        <span>Also in another class (same student as line {r.repeatOfLine})</span>
                      ) : r.duplicateInFile ? (
                        <span className="text-amber-700 dark:text-amber-400">Duplicate row in file</span>
                      ) : r.match ? (
                        <span>Matches existing student by {r.match.by === "id" ? "student ID" : "name"}</span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400">New</span>
                      )}
                    </TD>
                    <TD>
                      {r.match && !r.errors.length && !r.duplicateInFile && !r.skipReason && !r.repeatOfLine ? (
                        <Select aria-label={`Action for line ${r.line}`} className="h-8 w-40 text-xs" value={r.action} onChange={(e) => setOverrides((o) => ({ ...o, [r.line]: e.target.value as ImportRow["action"] }))}>
                          <option value="use_existing">Use existing</option>
                          {r.match.by === "name" && <option value="create">Create new</option>}
                          <option value="skip">Skip</option>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{r.action === "skip" ? "Skip" : r.repeatOfLine ? "Enroll only" : "Create"}</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {rows.length > 500 && <p className="p-3 text-xs text-muted-foreground">Showing the first 500 of {rows.length} rows.</p>}
          </Card>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("map")}>
              Back
            </Button>
            <Button disabled={busy || sum.create + sum.existing === 0} onClick={runImport}>
              <Upload /> {busy ? "Importing…" : `Import ${sum.create + sum.existing} students`}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <Card>
          <CardContent className="grid gap-3 pt-5">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="size-5 text-emerald-600" aria-hidden /> Import finished
            </p>
            <ul className="text-sm">
              <li>{result.created} new students created</li>
              <li>{result.linked} existing students matched</li>
              <li>{result.enrolled} class enrollments added</li>
              {result.classesCreated > 0 && <li>{pluralize(result.classesCreated, "class", "classes")} created — add meeting times and rooms under Classroom</li>}
              <li>{sum.skipped} rows skipped</li>
            </ul>
            {result.failures.length > 0 && (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">{result.failures.length} problems — these rows were not saved:</p>
                <ul className="list-disc pl-5">
                  {result.failures.map((f, i) => (
                    <li key={i}>{f.line ? `Line ${f.line}: ` : ""}{f.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/students">View students</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setParsed(null);
                  setPaste("");
                }}
              >
                Import another file
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** Best guess for where a section's students go: same course and period, else the only class with that period, else a new class. */
function guessTarget(g: ImportGroup, classes: ClassSection[]) {
  const key = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const same = (a: string, b: string) => key(a) === key(b);
  // "Biology" matches "Biology A" / "BIOLOGY 9": one name contains the other.
  const similar = (a: string, b: string) => !!key(a) && !!key(b) && (key(a).includes(key(b)) || key(b).includes(key(a)));
  if (g.period) {
    const byPeriod = classes.filter((c) => same(c.period, g.period));
    const exact = byPeriod.find((c) => !g.course || similar(c.course_name, g.course));
    if (exact) return exact.id;
    if (byPeriod.length === 1 && !g.course) return byPeriod[0].id;
  } else if (g.course) {
    const byCourse = classes.filter((c) => similar(c.course_name, g.course));
    if (byCourse.length === 1) return byCourse[0].id;
  }
  return "new";
}

function newClassFor(g: ImportGroup, order: number) {
  const n = Number.parseInt(g.period, 10);
  return {
    course_name: (g.course || "Imported class").slice(0, 120),
    period: (g.period || g.section || String(order)).slice(0, 20),
    period_order: Number.isFinite(n) ? n : order,
    room: null,
    meeting_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    start_time: null,
    end_time: null,
    color: COLOR_NAMES[order % COLOR_NAMES.length],
    description: g.section ? `Section ${g.section}` : null,
    school_id: null,
    academic_year_id: null,
    term_id: null,
    default_layout_id: null,
    archived_at: null,
    sub_notes: null,
  };
}
