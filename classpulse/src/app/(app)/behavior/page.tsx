"use client";

import * as React from "react";
import Link from "next/link";
import { Activity as ActivityIcon, Download, Plus, Settings, Zap } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { useRows, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { ObservationList } from "@/features/observations/observation-list";
import { ObservationForm } from "@/features/observations/observation-form";
import { useQuickLog } from "@/features/observations/quick-log";
import { classLabel, useActiveClasses, useClassMap, useStudentMap } from "@/lib/hooks";
import { ACTIVITY_LABELS, KIND_LABELS } from "@/lib/labels";
import { countKinds } from "@/lib/stats";
import { addDays, byName, displayName, downloadFile, isoDateOf, toISODate } from "@/lib/utils";
import { toCSV } from "@/lib/csv";

export default function BehaviorPage() {
  const status = useTables("observations", "students", "classes", "observation_categories", "observation_behaviors", "enrollments");
  const observations = useRows("observations");
  const categories = useRows("observation_categories");
  const students = useRows("students");
  const { rows: classes } = useActiveClasses();
  const studentMap = useStudentMap();
  const classMap = useClassMap();
  const quickLog = useQuickLog();
  const [adding, setAdding] = React.useState(false);
  const [f, setF] = React.useState({ from: addDays(toISODate(), -30), to: "", classId: "", studentId: "", kind: "", categoryId: "", activity: "", followUp: false, q: "" });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const filtered = React.useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return observations.rows.filter((o) => {
      const d = isoDateOf(o.observed_at);
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
      if (f.classId && o.class_id !== f.classId) return false;
      if (f.studentId && o.student_id !== f.studentId) return false;
      if (f.kind && o.kind !== f.kind) return false;
      if (f.categoryId && o.category_id !== f.categoryId) return false;
      if (f.activity && (f.activity === "none" ? o.activity : o.activity !== f.activity)) return false;
      if (f.followUp && !o.follow_up_required) return false;
      if (q && !`${o.behavior_label} ${o.note ?? ""} ${o.context ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [observations.rows, f]);
  const k = countKinds(filtered);

  const exportCsv = () => {
    const rows = [...filtered]
      .sort((a, b) => a.observed_at.localeCompare(b.observed_at))
      .map((o) => {
        const s = studentMap.get(o.student_id);
        const c = classMap.get(o.class_id);
        return [new Date(o.observed_at).toLocaleString(), s?.last_name, s?.first_name, c ? classLabel(c) : "", KIND_LABELS[o.kind], o.category_name, o.behavior_label, o.activity ? ACTIVITY_LABELS[o.activity] : "", o.context, o.intervention_used, o.note, o.follow_up_required ? "Yes" : "No"];
      });
    downloadFile(`observations-${toISODate()}.csv`, toCSV(["Date/time", "Last Name", "First Name", "Class", "Type", "Category", "Behavior", "Activity", "Context", "Intervention used", "Note", "Follow-up"], rows));
  };

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Behavior & Engagement"
        description="Every observation you've recorded, with context. Use filters to look for patterns."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/settings#categories">
                <Settings /> Categories
              </Link>
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus /> Detailed entry
            </Button>
            <Button variant="brand" onClick={() => quickLog()}>
              <Zap /> Quick log
            </Button>
          </>
        }
      />
      <Card className="mb-4">
        <CardContent className="grid gap-2 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs font-medium">
            From
            <Input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            To
            <Input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Class
            <Select value={f.classId} onChange={(e) => set({ classId: e.target.value })}>
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
              <option value="">All students</option>
              {students.rows.filter((s) => !s.archived_at).sort(byName).map((s) => (
                <option key={s.id} value={s.id}>
                  {displayName(s)}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Type
            <Select value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
              <option value="">All types</option>
              {Object.entries(KIND_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Category
            <Select value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">All categories</option>
              {categories.rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Activity
            <Select value={f.activity} onChange={(e) => set({ activity: e.target.value })}>
              <option value="">All activities</option>
              {Object.entries(ACTIVITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
              <option value="none">Not recorded</option>
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Search
            <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Behavior or note text" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.followUp} onChange={(e) => set({ followUp: e.target.checked })} /> Follow-up required only
          </label>
        </CardContent>
      </Card>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{filtered.length} observations</span>
        <Badge color="emerald">{k.positive} positive</Badge>
        <Badge color="blue">{k.engagement} engagement</Badge>
        <Badge color="amber">{k.redirection} redirection</Badge>
        <span className="text-xs text-muted-foreground">Counts reflect what was recorded, not everything that happened.</span>
      </div>
      <Card>
        <CardContent className="pt-2">
          <ObservationList
            items={filtered}
            empty={<EmptyState icon={ActivityIcon} className="my-4" title="No observations match" description={observations.rows.length ? "Try widening the date range or clearing filters." : "Record observations from the live classroom or with Quick log (press L)."} />}
          />
        </CardContent>
      </Card>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title="Record observation" className="max-w-xl">
          {adding && <ObservationForm defaults={{ class_id: f.classId || undefined, student_id: f.studentId || undefined }} onDone={() => setAdding(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
