"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarCheck, LifeBuoy, MessageSquare, NotebookPen, Pencil, Plus, ThumbsUp, TriangleAlert, Sparkles, Users, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/app/app-shell";
import { useAction, useRows, useStore, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm";
import { StudentAvatar } from "@/features/students/photo";
import { Stat } from "@/components/ui/stat";
import { StudentForm } from "@/features/students/student-form";
import { NoteForm } from "@/features/classroom/student-actions";
import { ObservationList } from "@/features/observations/observation-list";
import { useQuickLog } from "@/features/observations/quick-log";
import { RecordHistoryButton } from "@/features/audit/record-history";
import { classLabel, useClassMap, useFormat } from "@/lib/hooks";
import { buildTimeline, type EventType } from "@/lib/timeline";
import { bucketObservations, countKinds, percent, summarizeAttendance } from "@/lib/stats";
import { ACTIVITY_LABELS, COMM_STATUS_LABELS, CONTACT_TYPE_LABELS, INTERVENTION_STATUS_LABELS, KIND_LABELS, PURPOSE_LABELS, colorClasses } from "@/lib/labels";
import { addDays, cn, countBy, displayName, isoDateOf, toISODate } from "@/lib/utils";

const TYPE_LABELS: Record<EventType, string> = { observation: "Observations", attendance: "Attendance", note: "Notes", intervention: "Interventions", communication: "Communication" };

export default function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const status = useTables("students", "classes", "enrollments", "observations", "attendance_records", "attendance_statuses", "student_notes", "intervention_plans", "intervention_progress", "communications", "reminders");
  const students = useRows("students");
  const enrollments = useRows("enrollments");
  const observations = useRows("observations");
  const attendance = useRows("attendance_records");
  const statuses = useRows("attendance_statuses");
  const notes = useRows("student_notes");
  const plans = useRows("intervention_plans");
  const progress = useRows("intervention_progress");
  const comms = useRows("communications");
  const reminders = useRows("reminders");
  const classMap = useClassMap();
  const fmt = useFormat();
  const quickLog = useQuickLog();
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const [noting, setNoting] = React.useState(false);

  const student = students.rows.find((s) => s.id === studentId);
  const classIds = enrollments.rows.filter((e) => e.student_id === studentId && !e.dropped_at).map((e) => e.class_id);
  const myObs = React.useMemo(() => observations.rows.filter((o) => o.student_id === studentId), [observations.rows, studentId]);
  const myAtt = React.useMemo(() => attendance.rows.filter((a) => a.student_id === studentId), [attendance.rows, studentId]);
  const myNotes = notes.rows.filter((n) => n.student_id === studentId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const myPlans = plans.rows.filter((p) => p.student_id === studentId);
  const myProgress = progress.rows.filter((p) => myPlans.some((pl) => pl.id === p.plan_id));
  const myComms = comms.rows.filter((c) => c.student_id === studentId).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const statusMap = React.useMemo(() => new Map(statuses.rows.map((s) => [s.id, s])), [statuses.rows]);

  // Filters
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [classFilter, setClassFilter] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<EventType | "">("");
  const [kindFilter, setKindFilter] = React.useState("");

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;
  if (!student)
    return (
      <EmptyState
        icon={Users}
        title="Student not found"
        action={
          <Button asChild>
            <Link href="/students">Back to students</Link>
          </Button>
        }
      />
    );

  const today = toISODate();
  const since30 = addDays(today, -30);
  const obs30 = myObs.filter((o) => isoDateOf(o.observed_at) >= since30);
  const k30 = countKinds(obs30);
  const att = summarizeAttendance(myAtt, statusMap);
  const activePlans = myPlans.filter((p) => p.status === "active" || p.status === "planned" || p.status === "under_review");
  const followUps = [
    ...reminders.rows.filter((r) => r.student_id === studentId && !r.completed_at).map((r) => ({ id: r.id, title: r.title, date: r.due_date, href: "/dashboard" })),
    ...myComms.filter((c) => c.status === "follow_up_pending").map((c) => ({ id: c.id, title: `Follow up: ${PURPOSE_LABELS[c.purpose]}`, date: c.follow_up_date, href: "/communication" })),
    ...myPlans.filter((p) => (p.status === "active" || p.status === "under_review") && p.review_date).map((p) => ({ id: p.id, title: `Review plan: ${p.target_behavior}`, date: p.review_date, href: `/interventions/${p.id}` })),
  ].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  const inFilter = (iso: string, cid: string | null) => {
    const d = isoDateOf(iso);
    return (!from || d >= from) && (!to || d <= to) && (!classFilter || cid === classFilter);
  };
  const timeline = buildTimeline({ observations: myObs, attendance: myAtt, statuses: statusMap, notes: myNotes, plans: myPlans, progress: myProgress, communications: myComms }).filter(
    (e) => inFilter(e.at, e.classId) && (!typeFilter || e.type === typeFilter) && (!kindFilter || e.type !== "observation" || e.kind === kindFilter),
  );
  const filteredObs = myObs.filter((o) => inFilter(o.observed_at, o.class_id) && (!kindFilter || o.kind === kindFilter));
  const chartFrom = from || addDays(today, -56);
  const chartTo = to || today;
  const weekly = bucketObservations(filteredObs, chartFrom, chartTo, "week").map((b) => ({ ...b, label: fmt.short(b.key) }));
  const byBehavior = Object.entries(countBy(filteredObs, (o) => `${o.kind}|${o.behavior_label}`)).sort((a, b) => b[1] - a[1]);
  const byActivity = Object.entries(countBy(filteredObs.filter((o) => o.activity), (o) => o.activity!)).sort((a, b) => b[1] - a[1]);

  const filters = (
    <div className="mb-3 flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs">
        From
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-auto" />
      </label>
      <label className="grid gap-1 text-xs">
        To
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-auto" />
      </label>
      <Select aria-label="Class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="h-8 w-auto">
        <option value="">All classes</option>
        {classIds.map((id) => classMap.get(id)).filter(Boolean).map((c) => (
          <option key={c!.id} value={c!.id}>
            {classLabel(c!)}
          </option>
        ))}
      </Select>
      <Select aria-label="Category" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="h-8 w-auto">
        <option value="">All categories</option>
        {Object.entries(KIND_LABELS).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </Select>
      {(from || to || classFilter || kindFilter || typeFilter) && (
        <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); setClassFilter(""); setKindFilter(""); setTypeFilter(""); }}>
          Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title={displayName(student)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {student.preferred_name && <span>{student.first_name} {student.last_name}</span>}
            {student.grade_level && <span>Grade {student.grade_level}</span>}
            {student.school_student_id && <span>ID {student.school_student_id}</span>}
            {classIds.map((id) => {
              const c = classMap.get(id);
              return c ? (
                <Badge key={id} color={c.color}>
                  {classLabel(c)}
                </Badge>
              ) : null;
            })}
            {student.archived_at && <Badge color="slate">Archived</Badge>}
            {student.is_demo && <Badge>Fictional demo student</Badge>}
          </span>
        }
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/students">
                <ArrowLeft /> Students
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            <Button variant="outline" onClick={() => setNoting(true)}>
              <NotebookPen /> Note
            </Button>
            <Button asChild variant="outline">
              <Link href={`/communication?student=${student.id}`}>
                <MessageSquare /> Contact
              </Link>
            </Button>
            <Button onClick={() => quickLog({ studentId: student.id, classId: classIds[0] })} disabled={!classIds.length}>
              <Plus /> Log observation
            </Button>
          </>
        }
      />
      <div className="mb-4 flex items-center gap-3">
        <StudentAvatar student={student} className="size-14 text-lg" />
        <p className="text-xs text-muted-foreground">Counts below are teacher-recorded observations, not objective measures of behavior. Days without notes are not evidence that nothing happened.</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="behavior">Behavior & Engagement</TabsTrigger>
          <TabsTrigger value="interventions">Interventions</TabsTrigger>
          <TabsTrigger value="communication">Communication</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={CalendarCheck} label="Attendance (recorded days)" value={percent(att.rate)} sub={`${att.absent} absent · ${att.tardy} tardy · ${att.excused} excused`} />
            <Stat icon={ThumbsUp} label="Positive (30 days)" value={k30.positive} color="emerald" />
            <Stat icon={Sparkles} label="Engagement (30 days)" value={k30.engagement} color="blue" />
            <Stat icon={TriangleAlert} label="Redirections (30 days)" value={k30.redirection} color="amber" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Active intervention plans</CardTitle>
              </CardHeader>
              <CardContent>
                {activePlans.length ? (
                  <ul className="grid gap-2">
                    {activePlans.map((p) => (
                      <li key={p.id}>
                        <Link href={`/interventions/${p.id}`} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm hover:bg-secondary/50">
                          <span>
                            <span className="font-medium">{p.target_behavior}</span>
                            <span className="block text-xs text-muted-foreground">{p.strategy_name} · review {fmt.date(p.review_date)}</span>
                          </span>
                          <Badge>{INTERVENTION_STATUS_LABELS[p.status]}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">None.</p>
                )}
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <Link href={`/interventions?new=${student.id}`}>
                    <LifeBuoy /> New plan
                  </Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Upcoming follow-ups</CardTitle>
              </CardHeader>
              <CardContent>
                {followUps.length ? (
                  <ul className="grid gap-1.5 text-sm">
                    {followUps.map((f) => (
                      <li key={f.id} className="flex justify-between gap-2">
                        <Link href={f.href} className="hover:underline">
                          {f.title}
                        </Link>
                        <span className={cn("shrink-0 text-xs", f.date && f.date < today ? "font-medium text-destructive" : "text-muted-foreground")}>{f.date ? (f.date < today ? `Overdue · ${fmt.short(f.date)}` : fmt.short(f.date)) : "No date"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing pending.</p>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Private notes</CardTitle>
                <CardDescription>Visible only to you.</CardDescription>
              </CardHeader>
              <CardContent>
                {myNotes.length ? (
                  <ul className="grid gap-2">
                    {myNotes.slice(0, 5).map((n) => (
                      <li key={n.id} className="flex items-start justify-between gap-2 rounded-lg border p-2.5 text-sm">
                        <div>
                          <p className="whitespace-pre-wrap">{n.body}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{fmt.dateTime(n.created_at)}</p>
                        </div>
                        <div className="flex">
                          <RecordHistoryButton recordId={n.id} label="" />
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Delete note"
                            onClick={async () => {
                              if (await confirm({ title: "Delete this note?", description: "The deletion is recorded in the audit log.", confirmLabel: "Delete", destructive: true }))
                                await run(() => store.remove("student_notes", [n.id]), { success: "Note deleted" });
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          {filters}
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Event type">
            {(["", "observation", "attendance", "note", "intervention", "communication"] as const).map((t) => (
              <button key={t || "all"} type="button" aria-pressed={typeFilter === t} onClick={() => setTypeFilter(t)} className={cn("rounded-full border px-3 py-1 text-xs", typeFilter === t ? "border-brand bg-accent font-medium" : "hover:bg-secondary")}>
                {t ? TYPE_LABELS[t] : "All events"}
              </button>
            ))}
          </div>
          <Card>
            <CardContent className="pt-5">
              {timeline.length ? (
                <ol className="relative grid gap-4 border-l pl-5">
                  {timeline.slice(0, 300).map((e) => (
                    <li key={e.id} className="relative">
                      <span aria-hidden className={cn("absolute -left-[26px] top-1.5 size-2.5 rounded-full ring-4 ring-card", colorClasses(e.color).dot)} />
                      <p className="text-sm font-medium">
                        {e.title} <span className="sr-only">({e.type})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.type === "attendance" ? fmt.date(e.at) : fmt.dateTime(e.at)}
                        {e.classId && classMap.get(e.classId) && ` · ${classLabel(classMap.get(e.classId)!)}`} · {TYPE_LABELS[e.type]}
                      </p>
                      {e.detail && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{e.detail}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No events match these filters.</p>
              )}
              {timeline.length > 300 && <p className="mt-3 text-xs text-muted-foreground">Showing the 300 most recent of {timeline.length} events. Narrow the date range to see older events.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Recorded days" value={att.total} />
            <Stat label="Present" value={att.present} color="emerald" />
            <Stat label="Tardy" value={att.tardy} color="amber" />
            <Stat label="Absent" value={att.absent} color="rose" />
            <Stat label="Excused" value={att.excused} color="blue" />
          </div>
          <p className="text-xs text-muted-foreground">ClassPulse attendance is your classroom record and is not the school&apos;s official attendance.</p>
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Class</TH>
                  <TH>Status</TH>
                  <TH>Note</TH>
                </tr>
              </THead>
              <TBody>
                {[...myAtt].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200).map((a) => {
                  const st = statusMap.get(a.status_id);
                  const c = classMap.get(a.class_id);
                  return (
                    <TR key={a.id}>
                      <TD>{fmt.weekday(a.date)}</TD>
                      <TD>{c ? classLabel(c) : "—"}</TD>
                      <TD>{st && <Badge color={st.color}>{st.label}</Badge>}</TD>
                      <TD className="text-muted-foreground">{a.note}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {!myAtt.length && <p className="p-6 text-center text-sm text-muted-foreground">No attendance recorded.</p>}
          </Card>
        </TabsContent>

        <TabsContent value="behavior" className="grid gap-4">
          {filters}
          <Card>
            <CardHeader>
              <CardTitle>Observations by week</CardTitle>
              <CardDescription>Weeks with no bars had no recorded observations — that is missing data, not necessarily absence of behavior.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="positive" name="Positive" stackId="a" fill="#10b981" />
                  <Bar dataKey="engagement" name="Engagement" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="redirection" name="Redirection" stackId="a" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Most frequent</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-1 text-sm">
                  {byBehavior.slice(0, 10).map(([k, n]) => {
                    const [kind, label] = k.split("|");
                    return (
                      <li key={k} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Badge color={kind === "positive" ? "emerald" : kind === "redirection" ? "amber" : "blue"} className="w-20 justify-center">
                            {KIND_LABELS[kind as keyof typeof KIND_LABELS]}
                          </Badge>
                          {label}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{n}</span>
                      </li>
                    );
                  })}
                  {!byBehavior.length && <li className="text-muted-foreground">No observations.</li>}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By instructional activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-1 text-sm">
                  {byActivity.map(([k, n]) => (
                    <li key={k} className="flex justify-between">
                      <span>{ACTIVITY_LABELS[k as keyof typeof ACTIVITY_LABELS]}</span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </li>
                  ))}
                  {!byActivity.length && <li className="text-muted-foreground">No activity recorded.</li>}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">{filteredObs.filter((o) => !o.activity).length} observations had no activity recorded.</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>All observations</CardTitle>
            </CardHeader>
            <CardContent>
              <ObservationList items={filteredObs} showStudent={false} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interventions" className="grid gap-3">
          <div>
            <Button asChild>
              <Link href={`/interventions?new=${student.id}`}>
                <Plus /> New intervention plan
              </Link>
            </Button>
          </div>
          {myPlans.length ? (
            myPlans.map((p) => {
              const entries = myProgress.filter((e) => e.plan_id === p.id).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
              return (
                <Card key={p.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle>
                          <Link href={`/interventions/${p.id}`} className="hover:underline">
                            {p.target_behavior}
                          </Link>
                        </CardTitle>
                        <CardDescription>
                          {p.strategy_name} · started {fmt.date(p.start_date)} · review {fmt.date(p.review_date)}
                        </CardDescription>
                      </div>
                      <Badge>{INTERVENTION_STATUS_LABELS[p.status]}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {entries.length ? `${entries.length} progress review${entries.length === 1 ? "" : "s"}; latest: ${entries.at(-1)!.note ?? ""}` : "No progress reviews yet."}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <EmptyState icon={LifeBuoy} title="No intervention plans" />
          )}
        </TabsContent>

        <TabsContent value="communication" className="grid gap-3">
          <div>
            <Button asChild>
              <Link href={`/communication?student=${student.id}`}>
                <Plus /> Log contact or draft message
              </Link>
            </Button>
          </div>
          {myComms.length ? (
            <Card>
              <ul className="divide-y">
                {myComms.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 p-4 text-sm">
                    <div>
                      <p className="font-medium">
                        {CONTACT_TYPE_LABELS[c.contact_type]} · {PURPOSE_LABELS[c.purpose]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmt.dateTime(c.occurred_at)}
                        {c.recipient && ` · ${c.recipient}`}
                      </p>
                      {c.summary && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{c.summary}</p>}
                    </div>
                    <Badge color={c.status === "follow_up_pending" ? "amber" : c.status === "draft" ? "slate" : "emerald"}>{COMM_STATUS_LABELS[c.status]}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState icon={MessageSquare} title="No communication logged" />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title="Edit student" className="max-w-xl">
          {editing && <StudentForm existing={student} onDone={() => setEditing(false)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={noting} onOpenChange={setNoting}>
        <DialogContent title="Add note">{noting && <NoteForm student={student} classId={classIds[0]} onDone={() => setNoting(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

