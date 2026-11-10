"use client";

import * as React from "react";
import { Download, FileText, Printer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/app/app-shell";
import { useRows, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { classLabel, useActiveClasses, useFormat } from "@/lib/hooks";
import { ACTIVITY_LABELS, ASSESSMENT_LABELS, INTERVENTION_STATUS_LABELS, KIND_LABELS } from "@/lib/labels";
import { NEEDS_STUDENT, REPORT_TYPES, buildReport, type ReportData, type ReportDoc, type ReportFilters, type ReportType } from "@/lib/reports";
import { bucketObservations, weekStart } from "@/lib/stats";
import { addDays, byName, countBy, displayName, downloadFile, toISODate } from "@/lib/utils";
import { toCSV } from "@/lib/csv";
import type { ObservationKind } from "@/lib/types";

const TOOLTIP = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 } };

export default function ReportsPage() {
  const status = useTables(
    "students", "classes", "enrollments", "observations", "attendance_records", "attendance_statuses", "intervention_plans", "intervention_progress", "communications", "student_notes", "group_sets", "groups", "group_memberships", "group_observations", "team_roles",
  );
  const data: ReportData = {
    students: useRows("students").rows,
    classes: useRows("classes").rows,
    enrollments: useRows("enrollments").rows,
    observations: useRows("observations").rows,
    attendance: useRows("attendance_records").rows,
    statuses: useRows("attendance_statuses").rows,
    plans: useRows("intervention_plans").rows,
    progress: useRows("intervention_progress").rows,
    communications: useRows("communications").rows,
    notes: useRows("student_notes").rows,
    groupSets: useRows("group_sets").rows,
    groups: useRows("groups").rows,
    memberships: useRows("group_memberships").rows,
    groupObservations: useRows("group_observations").rows,
    roles: useRows("team_roles").rows,
  };
  const { rows: classes } = useActiveClasses();
  const [f, setF] = React.useState<ReportFilters>({ from: addDays(toISODate(), -30), to: toISODate(), classId: "", studentId: "", kind: "", activity: "", interventionStatus: "", includeNotes: false });
  const [type, setType] = React.useState<ReportType>("class");
  const set = (p: Partial<ReportFilters>) => setF((x) => ({ ...x, ...p }));

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;

  const studentsInScope = (f.classId ? data.students.filter((s) => data.enrollments.some((e) => e.class_id === f.classId && e.student_id === s.id && !e.dropped_at)) : data.students.filter((s) => !s.archived_at)).sort(byName);

  const filters = (
    <Card className="no-print mb-4">
      <CardContent className="grid gap-2 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium">
          From
          <Input type="date" value={f.from} max={f.to} onChange={(e) => e.target.value && set({ from: e.target.value })} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          To
          <Input type="date" value={f.to} min={f.from} onChange={(e) => e.target.value && set({ to: e.target.value })} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Class
          <Select value={f.classId} onChange={(e) => set({ classId: e.target.value, studentId: "" })}>
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {classLabel(c)}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Student
          <Select value={f.studentId} onChange={(e) => set({ studentId: e.target.value })}>
            <option value="">{NEEDS_STUDENT.includes(type) ? "Choose a student…" : "All students"}</option>
            {studentsInScope.map((s) => (
              <option key={s.id} value={s.id}>
                {displayName(s)}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Category
          <Select value={f.kind} onChange={(e) => set({ kind: e.target.value as ObservationKind | "" })}>
            <option value="">All</option>
            {Object.entries(KIND_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Activity
          <Select value={f.activity} onChange={(e) => set({ activity: e.target.value })}>
            <option value="">All</option>
            {Object.entries(ACTIVITY_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Intervention status
          <Select value={f.interventionStatus} onChange={(e) => set({ interventionStatus: e.target.value })}>
            <option value="">All</option>
            {Object.entries(INTERVENTION_STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex flex-wrap items-end gap-1">
          {[
            ["7 days", 7],
            ["30 days", 30],
            ["90 days", 90],
          ].map(([l, n]) => (
            <Button key={l} size="sm" variant="outline" onClick={() => set({ from: addDays(toISODate(), -(n as number)), to: toISODate() })}>
              {l}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      <PageHeader title="Reports & Analytics" description="Built from your stored records. Print or save as PDF, or export CSV." />
      <Tabs defaultValue="reports">
        <TabsList className="no-print">
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="reports">
          <div className="no-print mb-3 flex flex-wrap items-center gap-2">
            <Select aria-label="Report type" value={type} onChange={(e) => setType(e.target.value as ReportType)} className="w-auto">
              {Object.entries(REPORT_TYPES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
            {type === "admin" && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!f.includeNotes} onChange={(e) => set({ includeNotes: e.target.checked })} /> Include private teacher notes
              </label>
            )}
          </div>
          {filters}
          <ReportView doc={buildReport(type, data, f)} />
        </TabsContent>
        <TabsContent value="analytics">
          {filters}
          <Analytics data={data} f={f} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ReportView({ doc }: { doc: ReportDoc }) {
  const empty = !doc.sections.length;
  return (
    <div className="grid gap-3">
      <div className="no-print flex flex-wrap gap-2">
        <Button onClick={() => window.print()} disabled={empty}>
          <Printer /> Print / Save as PDF
        </Button>
        <Button variant="outline" disabled={empty || !doc.csv.rows.length} onClick={() => downloadFile(`${doc.title.toLowerCase().replace(/\W+/g, "-")}-${toISODate()}.csv`, toCSV(doc.csv.headers, doc.csv.rows))}>
          <Download /> Export CSV
        </Button>
        <span className="self-center text-xs text-muted-foreground">To save a PDF, choose “Save as PDF” as the printer.</span>
      </div>
      <Card className="print:border-0 print:shadow-none">
        <CardContent className="grid gap-5 pt-6">
          <header className="border-b pb-3">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <FileText className="size-3.5" aria-hidden /> ClassPulse report · generated {new Date().toLocaleString()}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{doc.title}</h2>
            <p className="text-sm text-muted-foreground">{doc.subtitle}</p>
          </header>
          {doc.sections.map((s, i) => (
            <section key={i} className="break-inside-avoid-page">
              {s.heading && <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{s.heading}</h3>}
              {s.type === "stats" && (
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {s.items.map((it) => (
                    <div key={it.label} className="rounded-lg border p-3">
                      <dt className="text-xs text-muted-foreground">{it.label}</dt>
                      <dd className="text-lg font-semibold tabular-nums">{it.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {s.type === "text" && <p className="whitespace-pre-wrap text-sm">{s.body}</p>}
              {s.type === "list" && (s.items.length ? <ul className="list-disc pl-5 text-sm">{s.items.map((it, j) => <li key={j}>{it}</li>)}</ul> : <p className="text-sm text-muted-foreground">{s.empty}</p>)}
              {s.type === "table" &&
                (s.rows.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b">
                          {s.headers.map((h) => (
                            <th key={h} scope="col" className="px-2 py-1.5 font-semibold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.rows.slice(0, 1000).map((r, j) => (
                          <tr key={j} className="border-b last:border-0 align-top">
                            {r.map((v, k) => (
                              <td key={k} className="whitespace-pre-wrap px-2 py-1.5">
                                {v}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {s.rows.length > 1000 && <p className="mt-1 text-xs text-muted-foreground">Showing 1,000 of {s.rows.length} rows. Export CSV for all rows.</p>}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{s.empty}</p>
                ))}
            </section>
          ))}
          {empty && <p className="text-sm text-muted-foreground">{doc.subtitle}</p>}
          {doc.notes.length > 0 && (
            <footer className="border-t pt-3 text-xs text-muted-foreground">
              <p className="font-medium">About this data</p>
              <ul className="list-disc pl-4">
                {doc.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </footer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Analytics({ data, f }: { data: ReportData; f: ReportFilters }) {
  const fmt = useFormat();
  const statusMap = new Map(data.statuses.map((s) => [s.id, s]));
  const obs = data.observations.filter((o) => {
    const d = toISODate(new Date(o.observed_at));
    return d >= f.from && d <= f.to && (!f.classId || o.class_id === f.classId) && (!f.studentId || o.student_id === f.studentId) && (!f.kind || o.kind === f.kind) && (!f.activity || o.activity === f.activity);
  });
  const weekly = bucketObservations(obs, f.from, f.to, "week").map((b) => ({ ...b, label: fmt.short(b.key) }));
  const att = data.attendance.filter((a) => a.date >= f.from && a.date <= f.to && (!f.classId || a.class_id === f.classId) && (!f.studentId || a.student_id === f.studentId));
  const attWeeks = new Map<string, { label: string; attended: number; total: number }>();
  for (const a of att) {
    const w = weekStart(a.date);
    const e = attWeeks.get(w) ?? { label: fmt.short(w), attended: 0, total: 0 };
    e.total++;
    if (["present", "tardy"].includes(statusMap.get(a.status_id)?.counts_as ?? "")) e.attended++;
    attWeeks.set(w, e);
  }
  const attTrend = [...attWeeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => ({ label: v.label, rate: Math.round((v.attended / v.total) * 1000) / 10, records: v.total }));
  const byActivity = Object.entries(countBy(obs, (o) => o.activity ?? "none")).map(([k, n]) => ({ name: k === "none" ? "Not recorded" : ACTIVITY_LABELS[k as keyof typeof ACTIVITY_LABELS], ...countBy(obs.filter((o) => (o.activity ?? "none") === k), (o) => o.kind), total: n }));
  const byBehavior = Object.entries(countBy(obs, (o) => o.behavior_label)).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count }));
  const plans = data.plans.filter((p) => (!f.studentId || p.student_id === f.studentId) && (!f.classId || p.class_id === f.classId) && (!f.interventionStatus || p.status === f.interventionStatus));
  const progress = data.progress.filter((e) => plans.some((p) => p.id === e.plan_id) && e.entry_date >= f.from && e.entry_date <= f.to);
  const progWeeks = new Map<string, Record<string, number | string>>();
  for (const e of progress) {
    const w = weekStart(e.entry_date);
    const r = progWeeks.get(w) ?? { label: fmt.short(w) };
    r[e.assessment] = ((r[e.assessment] as number) ?? 0) + 1;
    progWeeks.set(w, r);
  }
  const progTrend = [...progWeeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  const emptyWeeks = weekly.filter((w) => w.positive + w.engagement + w.redirection === 0).length;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          {obs.length} observations and {att.length} attendance records match these filters.
          {emptyWeeks > 0 && ` ${emptyWeeks} week${emptyWeeks === 1 ? " has" : "s have"} no observations recorded — treat gaps as missing documentation, not as evidence of no behavior.`} Charts show documentation frequency, not objective behavior measures.
        </CardContent>
      </Card>
      <ChartCard title="Positive observations and redirections over time" description="Weekly counts">
        <LineChart data={weekly} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <Tooltip {...TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="positive" name="Positive" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="engagement" name="Engagement" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} />
          <Line type="monotone" dataKey="redirection" name="Redirection" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, strokeWidth: 2 }} />
        </LineChart>
      </ChartCard>
      <ChartCard title="Attendance trend" description="Weekly share of records marked present or tardy">
        {attTrend.length ? (
          <LineChart data={attTrend} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <Tooltip {...TOOLTIP} formatter={(v, n) => (n === "rate" ? [`${v}%`, "Attendance"] : [v, n])} />
            <Line type="monotone" dataKey="rate" name="Attendance" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : undefined}
      </ChartCard>
      <ChartCard title="Observations by instructional activity">
        {byActivity.length ? (
          <BarChart data={byActivity} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <Tooltip {...TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="positive" name="Positive" stackId="a" fill="#10b981" />
            <Bar dataKey="engagement" name="Engagement" stackId="a" fill="#3b82f6" />
            <Bar dataKey="redirection" name="Redirection" stackId="a" fill="#f59e0b" />
          </BarChart>
        ) : undefined}
      </ChartCard>
      <ChartCard title="Behavior distribution" description="Most frequently recorded behaviors">
        {byBehavior.length ? (
          <BarChart data={byBehavior} layout="vertical" margin={{ left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <Tooltip {...TOOLTIP} />
            <Bar dataKey="count" name="Observations" fill="#475569" />
          </BarChart>
        ) : undefined}
      </ChartCard>
      <ChartCard title="Intervention progress over time" description="Progress reviews recorded per week, by assessment" className="lg:col-span-2">
        {progTrend.length ? (
          <BarChart data={progTrend} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <Tooltip {...TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="helpful" name={ASSESSMENT_LABELS.helpful} stackId="a" fill="#10b981" />
            <Bar dataKey="too_early" name={ASSESSMENT_LABELS.too_early} stackId="a" fill="#94a3b8" />
            <Bar dataKey="needs_modification" name={ASSESSMENT_LABELS.needs_modification} stackId="a" fill="#f59e0b" />
            <Bar dataKey="discontinue" name={ASSESSMENT_LABELS.discontinue} stackId="a" fill="#e11d48" />
          </BarChart>
        ) : undefined}
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, description, children, className }: { title: string; description?: string; children?: React.ReactElement; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="h-72">
        {children ? (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        ) : (
          <p className="grid h-full place-items-center text-sm text-muted-foreground">No data for these filters.</p>
        )}
      </CardContent>
    </Card>
  );
}
