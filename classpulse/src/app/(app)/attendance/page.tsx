"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, CheckCheck, ChevronLeft, ChevronRight, Download, Info } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/app/app-shell";
import { useAction, useRows, useStore, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SortTH, TBody, TD, TH, THead, TR, Table, useSort } from "@/components/ui/table";
import { AttendanceButtons } from "@/features/classroom/student-actions";
import { useMarkAllPresent } from "@/features/classroom/live-classroom";
import { classLabel, useActiveClasses, useCurrentClass, useFormat, useRoster } from "@/lib/hooks";
import { percent, schoolDaysWithoutAttendance, summarizeAttendance } from "@/lib/stats";
import { sisStatus } from "@/lib/integrations/sis";
import { addDays, byName, cn, displayName, downloadFile, parseISODate, toISODate } from "@/lib/utils";
import { toCSV } from "@/lib/csv";
import type { AttendanceRecord } from "@/lib/types";

export default function AttendancePage() {
  const status = useTables("classes", "students", "enrollments", "attendance_records", "attendance_statuses");
  const { current, setCurrent, classes } = useCurrentClass();
  const [date, setDate] = React.useState(toISODate());
  const classId = current?.id ?? "";

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;
  if (!classes.length)
    return (
      <>
        <PageHeader title="Attendance" />
        <EmptyState icon={CalendarCheck} title="No classes yet" action={<Button asChild><Link href="/classroom">Create a class</Link></Button>} />
      </>
    );

  return (
    <>
      <PageHeader
        title="Attendance"
        description={
          <span className="flex items-start gap-1.5">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {sisStatus().message}
          </span>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label="Class" value={classId} onChange={(e) => setCurrent(e.target.value)} className="w-auto">
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {classLabel(c)}
            </option>
          ))}
        </Select>
      </div>
      <Tabs defaultValue="take">
        <TabsList>
          <TabsTrigger value="take">Take attendance</TabsTrigger>
          <TabsTrigger value="history">Class history</TabsTrigger>
          <TabsTrigger value="students">By student</TabsTrigger>
          <TabsTrigger value="classes">By class</TabsTrigger>
        </TabsList>
        <TabsContent value="take">
          <TakeAttendance classId={classId} date={date} setDate={setDate} />
        </TabsContent>
        <TabsContent value="history">
          <ClassHistory classId={classId} />
        </TabsContent>
        <TabsContent value="students">
          <ByStudent classId={classId} />
        </TabsContent>
        <TabsContent value="classes">
          <ByClass />
        </TabsContent>
      </Tabs>
    </>
  );
}

function TakeAttendance({ classId, date, setDate }: { classId: string; date: string; setDate: (d: string) => void }) {
  const roster = useRoster(classId);
  const records = useRows("attendance_records");
  const statuses = useRows("attendance_statuses");
  const store = useStore();
  const run = useAction();
  const markAll = useMarkAllPresent();
  const fmt = useFormat();
  const statusMap = new Map(statuses.rows.map((s) => [s.id, s]));
  const dayRecords = records.rows.filter((r) => r.class_id === classId && r.date === date);
  const byStudent = new Map(dayRecords.map((r) => [r.student_id, r]));
  const counts = { present: 0, absent: 0, tardy: 0, excused: 0 };
  for (const r of dayRecords) {
    const s = statusMap.get(r.status_id);
    if (s) counts[s.counts_as]++;
  }
  const future = date > toISODate();

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft />
        </Button>
        <Input type="date" aria-label="Date" value={date} max={toISODate()} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" />
        <Button variant="outline" size="icon" aria-label="Next day" disabled={date >= toISODate()} onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight />
        </Button>
        {date !== toISODate() && (
          <Button variant="ghost" onClick={() => setDate(toISODate())}>
            Today
          </Button>
        )}
        <span className="text-sm text-muted-foreground">{fmt.weekday(date)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <span aria-live="polite">
            {dayRecords.length}/{roster.length} marked · {counts.absent} absent · {counts.tardy} tardy · {counts.excused} excused
          </span>
          <Button onClick={() => markAll(classId, roster, date)} disabled={future || !roster.length}>
            <CheckCheck /> Mark unmarked present
          </Button>
        </div>
      </div>
      {!roster.length ? (
        <EmptyState title="No students in this class" />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">Note</TH>
              </tr>
            </THead>
            <TBody>
              {roster.map((s) => {
                const rec = byStudent.get(s.id);
                return (
                  <TR key={s.id}>
                    <TD className="font-medium">
                      <Link href={`/students/${s.id}`} className="hover:underline">
                        {displayName(s)}
                      </Link>
                    </TD>
                    <TD>
                      <AttendanceButtons classId={classId} student={s} date={date} />
                    </TD>
                    <TD className="hidden md:table-cell">
                      {rec && (
                        <Input
                          aria-label={`Note for ${displayName(s)}`}
                          key={`${rec.id}-${rec.updated_at}`}
                          defaultValue={rec.note ?? ""}
                          maxLength={500}
                          placeholder="Optional note"
                          className="h-8"
                          onBlur={(e) => e.target.value !== (rec.note ?? "") && run(() => store.update("attendance_records", rec.id, { note: e.target.value.trim() || null }), { success: "Note saved" })}
                        />
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function ClassHistory({ classId }: { classId: string }) {
  const roster = useRoster(classId);
  const records = useRows("attendance_records");
  const statuses = useRows("attendance_statuses");
  const fmt = useFormat();
  const [to, setTo] = React.useState(toISODate());
  const [from, setFrom] = React.useState(addDays(toISODate(), -27));
  const statusMap = new Map(statuses.rows.map((s) => [s.id, s]));
  const recs = records.rows.filter((r) => r.class_id === classId && r.date >= from && r.date <= to);
  const days = [...new Set(recs.map((r) => r.date))].sort();
  const cell = new Map(recs.map((r) => [`${r.student_id}|${r.date}`, r]));
  const missing = schoolDaysWithoutAttendance(recs, from, to > toISODate() ? toISODate() : to);

  const trend = days.map((d) => {
    const dr = recs.filter((r) => r.date === d);
    const att = dr.filter((r) => ["present", "tardy"].includes(statusMap.get(r.status_id)?.counts_as ?? "")).length;
    return { date: fmt.short(d), rate: dr.length ? Math.round((att / dr.length) * 100) : null };
  });

  const exportCsv = () => {
    const rows: unknown[][] = [];
    for (const r of [...recs].sort((a, b) => a.date.localeCompare(b.date))) {
      const s = roster.find((x) => x.id === r.student_id);
      rows.push([r.date, s?.last_name ?? "(not enrolled)", s?.first_name ?? "", statusMap.get(r.status_id)?.label ?? "", r.note ?? ""]);
    }
    downloadFile(`attendance-${from}-to-${to}.csv`, toCSV(["Date", "Last Name", "First Name", "Status", "Note"], rows));
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs">
          From
          <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-auto" />
        </label>
        <label className="grid gap-1 text-xs">
          To
          <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-auto" />
        </label>
        <Button variant="outline" onClick={exportCsv} disabled={!recs.length} className="ml-auto">
          <Download /> Export CSV
        </Button>
      </div>
      {missing.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          No attendance recorded on {missing.length} weekday{missing.length === 1 ? "" : "s"} in this range (holidays, or days not taken).
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Attendance rate by day</CardTitle>
          <CardDescription>Present or tardy, as a share of students marked that day.</CardDescription>
        </CardHeader>
        <CardContent className="h-56">
          {trend.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" unit="%" />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} formatter={(v) => [`${v}%`, "Attendance"]} />
                <Area type="monotone" dataKey="rate" stroke="#0d9488" fill="#0d9488" fillOpacity={0.15} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No attendance recorded in this range.</p>
          )}
        </CardContent>
      </Card>
      {days.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <caption className="sr-only">Attendance grid: students by date</caption>
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th scope="col" className="sticky left-0 bg-secondary px-3 py-2 text-left font-medium">
                    Student
                  </th>
                  {days.map((d) => (
                    <th key={d} scope="col" className="px-1.5 py-2 font-medium whitespace-nowrap text-muted-foreground">
                      {parseISODate(d).getMonth() + 1}/{parseISODate(d).getDate()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <th scope="row" className="sticky left-0 bg-card px-3 py-1.5 text-left font-medium whitespace-nowrap">
                      {displayName(s)}
                    </th>
                    {days.map((d) => {
                      const r = cell.get(`${s.id}|${d}`);
                      const st = r ? statusMap.get(r.status_id) : undefined;
                      return (
                        <td key={d} className="px-1 py-1 text-center">
                          {st ? (
                            <span title={`${st.label}${r?.note ? ` — ${r.note}` : ""}`} className={cn("inline-grid size-6 place-items-center rounded font-semibold", st.counts_as === "present" ? "text-muted-foreground" : "")}>
                              <Badge color={st.counts_as === "present" ? undefined : st.color} className="px-1">
                                {st.code}
                              </Badge>
                            </span>
                          ) : (
                            <span className="text-muted-foreground" aria-label="Not recorded">
                              ·
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function ByStudent({ classId }: { classId: string }) {
  const roster = useRoster(classId);
  const records = useRows("attendance_records");
  const statuses = useRows("attendance_statuses");
  const statusMap = React.useMemo(() => new Map(statuses.rows.map((s) => [s.id, s])), [statuses.rows]);
  const { sort, onSort } = useSort<"name" | "rate" | "absent" | "tardy">("rate", "asc");
  const rows = roster.map((s) => ({ s, sum: summarizeAttendance(records.rows.filter((r) => r.class_id === classId && r.student_id === s.id), statusMap) }));
  const dir = sort.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sort.key === "name") return byName(a.s, b.s) * dir;
    if (sort.key === "rate") return ((a.sum.rate ?? 2) - (b.sum.rate ?? 2)) * dir || byName(a.s, b.s);
    return (a.sum[sort.key] - b.sum[sort.key]) * dir || byName(a.s, b.s);
  });
  const exportCsv = () =>
    downloadFile(`attendance-summary-by-student.csv`, toCSV(["Last Name", "First Name", "Recorded days", "Present", "Tardy", "Absent", "Excused", "Attendance rate"], rows.map(({ s, sum }) => [s.last_name, s.first_name, sum.total, sum.present, sum.tardy, sum.absent, sum.excused, percent(sum.rate)])));
  return (
    <Card>
      <div className="flex justify-end p-3">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download /> Export CSV
        </Button>
      </div>
      <Table>
        <THead>
          <tr>
            <SortTH label="Student" sortKey="name" sort={sort} onSort={onSort} />
            <TH>Recorded</TH>
            <SortTH label="Rate" sortKey="rate" sort={sort} onSort={onSort} />
            <SortTH label="Absent" sortKey="absent" sort={sort} onSort={onSort} />
            <SortTH label="Tardy" sortKey="tardy" sort={sort} onSort={onSort} />
            <TH>Excused</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map(({ s, sum }) => (
            <TR key={s.id}>
              <TD className="font-medium">
                <Link href={`/students/${s.id}`} className="hover:underline">
                  {displayName(s)}
                </Link>
              </TD>
              <TD className="tabular-nums text-muted-foreground">{sum.total}</TD>
              <TD className="tabular-nums">{percent(sum.rate)}</TD>
              <TD className="tabular-nums">{sum.absent}</TD>
              <TD className="tabular-nums">{sum.tardy}</TD>
              <TD className="tabular-nums">{sum.excused}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function ByClass() {
  const { rows: classes } = useActiveClasses();
  const records = useRows("attendance_records");
  const statuses = useRows("attendance_statuses");
  const statusMap = React.useMemo(() => new Map(statuses.rows.map((s) => [s.id, s])), [statuses.rows]);
  const since = addDays(toISODate(), -30);
  const rows = classes.map((c) => {
    const recs: AttendanceRecord[] = records.rows.filter((r) => r.class_id === c.id && r.date >= since);
    return { c, sum: summarizeAttendance(recs, statusMap), days: new Set(recs.map((r) => r.date)).size };
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 30 days by class</CardTitle>
      </CardHeader>
      <Table>
        <THead>
          <tr>
            <TH>Class</TH>
            <TH>Days recorded</TH>
            <TH>Rate</TH>
            <TH>Absences</TH>
            <TH>Tardies</TH>
            <TH>Excused</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map(({ c, sum, days }) => (
            <TR key={c.id}>
              <TD className="font-medium">{classLabel(c)}</TD>
              <TD className="tabular-nums">{days}</TD>
              <TD className="tabular-nums">{percent(sum.rate)}</TD>
              <TD className="tabular-nums">{sum.absent}</TD>
              <TD className="tabular-nums">{sum.tardy}</TD>
              <TD className="tabular-nums">{sum.excused}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
