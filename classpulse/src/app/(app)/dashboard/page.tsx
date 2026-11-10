"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3, CalendarCheck, ClipboardList, LayoutDashboard, LifeBuoy, MessageSquare, NotebookPen, Plus, Presentation, Settings2, Sparkles, ThumbsUp, TriangleAlert, Users } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { useAction, useData, useRows, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Stat } from "@/components/ui/stat";
import { useQuickLog } from "@/features/observations/quick-log";
import { useActionItems } from "@/features/reminders/action-items";
import { ReminderForm } from "@/features/reminders/reminders";
import { classInSession, classLabel, useActiveClasses, useCurrentClass, useFormat, useStudentMap } from "@/lib/hooks";
import { colorClasses, KIND_COLOR, KIND_LABELS } from "@/lib/labels";
import { countKinds } from "@/lib/stats";
import { cn, displayName, formatTime, isoDateOf, pluralize, toISODate } from "@/lib/utils";

const WIDGETS = [
  ["schedule", "Today's schedule"],
  ["overview", "Daily overview"],
  ["tasks", "Action items"],
  ["activity", "Recent activity"],
  ["quick_actions", "Quick actions"],
] as const;

export default function DashboardPage() {
  const status = useTables("classes", "enrollments", "students", "attendance_records", "attendance_statuses", "observations", "intervention_plans", "reminders", "communications");
  const { prefs, profile, updatePrefs } = useData();
  const [customizing, setCustomizing] = React.useState(false);
  const show = (w: string) => prefs.dashboard_widgets.includes(w);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;

  return (
    <>
      <PageHeader
        title={`${greeting}${profile.display_name ? `, ${profile.display_name}` : ""}`}
        description={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        actions={
          <Button variant="ghost" onClick={() => setCustomizing(true)}>
            <Settings2 /> Customize
          </Button>
        }
      />
      <Onboarding />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {show("quick_actions") && <QuickActions />}
        {show("overview") && <Overview />}
        {show("schedule") && <Schedule />}
        {show("tasks") && <ActionItems />}
        {show("activity") && <RecentActivity />}
      </div>
      {!prefs.dashboard_widgets.length && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          All widgets are hidden.{" "}
          <button type="button" className="underline" onClick={() => setCustomizing(true)}>
            Customize your dashboard
          </button>
        </p>
      )}
      <Dialog open={customizing} onOpenChange={setCustomizing}>
        <DialogContent title="Customize dashboard" description="Choose which widgets appear.">
          <CustomizeForm current={prefs.dashboard_widgets} onSave={async (w) => { await updatePrefs({ dashboard_widgets: w }); setCustomizing(false); }} onCancel={() => setCustomizing(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function CustomizeForm({ current, onSave, onCancel }: { current: string[]; onSave: (w: string[]) => Promise<void>; onCancel: () => void }) {
  const [sel, setSel] = React.useState(current);
  const run = useAction();
  return (
    <div className="grid gap-2">
      {WIDGETS.map(([k, l]) => (
        <label key={k} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Checkbox checked={sel.includes(k)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, k] : s.filter((x) => x !== k)))} />
          {l}
        </label>
      ))}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => run(() => onSave(WIDGETS.map(([k]) => k).filter((k) => sel.includes(k))), { success: "Dashboard updated" })}>Save</Button>
      </DialogFooter>
    </div>
  );
}

function Onboarding() {
  const classes = useRows("classes");
  const students = useRows("students");
  if (classes.rows.length && students.rows.length) return null;
  const steps = [
    { done: classes.rows.length > 0, label: "Create your class periods", href: "/classroom" },
    { done: students.rows.length > 0, label: "Add students or import a roster CSV", href: "/students/import" },
    { done: false, label: "Build a seating chart for a class", href: "/classroom" },
    { done: false, label: "Review behavior categories and quick-log buttons", href: "/settings" },
  ];
  return (
    <Card className="mb-4 border-brand/40 bg-accent/40">
      <CardHeader>
        <CardTitle>Welcome to ClassPulse</CardTitle>
        <CardDescription>A few steps to get your classroom set up. Everything saves automatically.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 sm:grid-cols-2">
          {steps.map((s, i) => (
            <li key={s.label}>
              <Link href={s.href} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-secondary">
                <span className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold", s.done ? "bg-emerald-500 text-white" : "bg-secondary")}>{s.done ? "✓" : i + 1}</span>
                <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  const quickLog = useQuickLog();
  const { current } = useCurrentClass();
  const [reminder, setReminder] = React.useState(false);
  const actions = [
    { label: "Open current class", icon: Presentation, href: current ? `/classroom/${current.id}` : "/classroom" },
    { label: "Record observation", icon: Plus, onClick: () => quickLog() },
    { label: "Take attendance", icon: CalendarCheck, href: "/attendance" },
    { label: "Add student note", icon: NotebookPen, onClick: () => quickLog({ tab: "note" }) },
    { label: "Contact parent", icon: MessageSquare, href: "/communication" },
    { label: "Generate report", icon: BarChart3, href: "/reports" },
    { label: "Add reminder", icon: ClipboardList, onClick: () => setReminder(true) },
  ];
  return (
    <Card className="lg:col-span-3">
      <CardContent className="flex flex-wrap gap-2 pt-5">
        {actions.map((a) =>
          a.href ? (
            <Button key={a.label} asChild variant="outline">
              <Link href={a.href}>
                <a.icon /> {a.label}
              </Link>
            </Button>
          ) : (
            <Button key={a.label} variant="outline" onClick={a.onClick}>
              <a.icon /> {a.label}
            </Button>
          ),
        )}
      </CardContent>
      <Dialog open={reminder} onOpenChange={setReminder}>
        <DialogContent title="Add reminder">{reminder && <ReminderForm onDone={() => setReminder(false)} />}</DialogContent>
      </Dialog>
    </Card>
  );
}

function Overview() {
  const { rows: classes } = useActiveClasses();
  const enrollments = useRows("enrollments");
  const records = useRows("attendance_records");
  const statuses = useRows("attendance_statuses");
  const observations = useRows("observations");
  const plans = useRows("intervention_plans");
  const items = useActionItems();
  const today = toISODate();
  const classIds = new Set(classes.map((c) => c.id));
  const studentIds = new Set(enrollments.rows.filter((e) => !e.dropped_at && classIds.has(e.class_id)).map((e) => e.student_id));
  const todayRecords = records.rows.filter((r) => r.date === today && classIds.has(r.class_id));
  const statusMap = new Map(statuses.rows.map((s) => [s.id, s]));
  const absent = todayRecords.filter((r) => ["absent", "excused"].includes(statusMap.get(r.status_id)?.counts_as ?? "")).length;
  const tardy = todayRecords.filter((r) => statusMap.get(r.status_id)?.counts_as === "tardy").length;
  const expected = enrollments.rows.filter((e) => !e.dropped_at && classIds.has(e.class_id)).length;
  const k = countKinds(observations.rows.filter((o) => isoDateOf(o.observed_at) === today));
  const activePlans = new Set(plans.rows.filter((p) => p.status === "active" || p.status === "under_review").map((p) => p.student_id)).size;
  const overdue = items.filter((i) => i.source === "observation_follow_up" || (i.date && i.date <= today)).length;
  return (
    <section aria-label="Daily overview" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-3 lg:grid-cols-6">
      <Stat icon={Users} label="Students" value={studentIds.size} sub={pluralize(classes.length, "class", "classes")} />
      <Stat icon={CalendarCheck} label="Attendance today" value={`${todayRecords.length}/${expected}`} sub={`${absent} absent · ${tardy} tardy`} />
      <Stat icon={ThumbsUp} label="Positive today" value={k.positive} color="emerald" sub={`${k.engagement} engagement`} />
      <Stat icon={TriangleAlert} label="Redirections today" value={k.redirection} color="amber" />
      <Stat icon={LifeBuoy} label="Active interventions" value={activePlans} sub="students" />
      <Stat icon={ClipboardList} label="Needs attention" value={overdue} color={overdue ? "rose" : undefined} sub="due, overdue or flagged" />
    </section>
  );
}

function Schedule() {
  const { rows: classes } = useActiveClasses();
  const enrollments = useRows("enrollments");
  const records = useRows("attendance_records");
  const today = toISODate();
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
  const todays = classes.filter((c) => c.meeting_days.includes(day));
  const now = classInSession(classes);
  const list = todays.length ? todays : classes;
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Today&apos;s schedule</CardTitle>
        {!todays.length && classes.length > 0 && <CardDescription>No classes meet today — showing all periods.</CardDescription>}
      </CardHeader>
      <CardContent>
        {list.length ? (
          <ul className="grid gap-2">
            {list.map((c) => {
              const n = enrollments.rows.filter((e) => e.class_id === c.id && !e.dropped_at).length;
              const taken = records.rows.filter((r) => r.class_id === c.id && r.date === today).length;
              const col = colorClasses(c.color);
              return (
                <li key={c.id}>
                  <Link href={`/classroom/${c.id}`} className={cn("flex items-center gap-3 rounded-lg border p-3 hover:bg-secondary/50", now?.id === c.id && "border-brand bg-accent/50")}>
                    <span aria-hidden className={cn("h-10 w-1.5 rounded-full", col.dot)} />
                    <span className="w-24 shrink-0 text-sm tabular-nums text-muted-foreground">{c.start_time ? `${formatTime(c.start_time)}` : `Period ${c.period}`}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{classLabel(c)}</span>
                      <span className="text-xs text-muted-foreground">
                        {pluralize(n, "student")}
                        {c.room && ` · Room ${c.room}`} · attendance {taken ? `${taken}/${n}` : "not taken"}
                      </span>
                    </span>
                    {now?.id === c.id && <Badge color="emerald">Now</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No classes yet. <Link href="/classroom" className="underline">Create one</Link>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ActionItems() {
  const items = useActionItems();
  const fmt = useFormat();
  const today = toISODate();
  const label: Record<string, string> = { reminder: "Reminder", intervention_review: "Intervention", communication_follow_up: "Contact", observation_follow_up: "Observation" };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Action items</CardTitle>
        <Button asChild size="sm" variant="ghost">
          <Link href="/tasks">All tasks</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="grid gap-2">
            {items.slice(0, 8).map((i) => {
              const flagged = i.source === "observation_follow_up";
              const overdue = !flagged && i.date && i.date < today;
              return (
                <li key={i.id}>
                  <Link href={i.href} className="block rounded-lg border p-2.5 text-sm hover:bg-secondary/50">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{i.title}</span>
                      <Badge>{label[i.source]}</Badge>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <span className={cn(overdue && "font-semibold text-destructive")}>{i.date ? (flagged ? `Flagged ${fmt.short(i.date)}` : overdue ? `Overdue · ${fmt.short(i.date)}` : i.date === today ? "Today" : fmt.short(i.date)) : "No date"}</span>
                      {i.studentName && ` · ${i.studentName}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
        )}
        {items.length > 8 && <p className="mt-2 text-xs text-muted-foreground">+{items.length - 8} more on the Tasks page</p>}
      </CardContent>
    </Card>
  );
}

function RecentActivity() {
  const observations = useRows("observations");
  const comms = useRows("communications");
  const notes = useRows("student_notes");
  const students = useStudentMap();
  const fmt = useFormat();
  const feed = [
    ...observations.rows.map((o) => ({ id: o.id, at: o.observed_at, sid: o.student_id, text: o.behavior_label, badge: KIND_LABELS[o.kind], color: KIND_COLOR[o.kind] })),
    ...comms.rows.map((c) => ({ id: c.id, at: c.occurred_at, sid: c.student_id, text: c.summary?.slice(0, 80) || "Contact logged", badge: "Contact", color: "cyan" })),
    ...notes.rows.map((n) => ({ id: n.id, at: n.created_at, sid: n.student_id, text: "Added a private note", badge: "Note", color: "slate" })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);
  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Recent activity</CardTitle>
        <Button asChild size="sm" variant="ghost">
          <Link href="/behavior">
            <LayoutDashboard /> Observation history
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {feed.length ? (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {feed.map((f) => {
              const s = students.get(f.sid);
              return (
                <li key={f.id} className="flex items-center gap-3 border-b py-2 text-sm last:border-0">
                  <Badge color={f.color} className="w-24 justify-center">
                    {f.badge}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">
                    {s && (
                      <Link href={`/students/${s.id}`} className="font-medium hover:underline">
                        {displayName(s)}
                      </Link>
                    )}{" "}
                    — {f.text}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmt.short(f.at)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" /> Activity will appear here as you record observations.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
