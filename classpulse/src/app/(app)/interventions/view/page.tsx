"use client";

import { studentHref } from "@/lib/paths";

import * as React from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, LifeBuoy, Pencil, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/app/app-shell";
import { useAction, useRows, useStore, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";
import { PlanForm } from "@/features/interventions/plan-form";
import { RecordHistoryButton } from "@/features/audit/record-history";
import { classLabel, useClassMap, useFormat, useStudentMap } from "@/lib/hooks";
import { ASSESSMENT_LABELS, INTERVENTION_STATUS_LABELS, STATUS_COLOR } from "@/lib/labels";
import type { InterventionStatus, ProgressAssessment } from "@/lib/types";
import { bucketObservations, weekStart } from "@/lib/stats";
import { addDays, displayName, toISODate } from "@/lib/utils";

const NEXT: Record<InterventionStatus, InterventionStatus[]> = {
  planned: ["active", "discontinued"],
  active: ["under_review", "completed", "discontinued"],
  under_review: ["active", "completed", "discontinued"],
  completed: ["active"],
  discontinued: ["active"],
};

export default function PlanPage() {
  return (
    <React.Suspense fallback={<LoadingState />}>
      <PlanPageInner />
    </React.Suspense>
  );
}

function PlanPageInner() {
  const planId = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const status = useTables("intervention_plans", "intervention_progress", "intervention_strategies", "students", "classes", "enrollments", "observations");
  const plans = useRows("intervention_plans");
  const progress = useRows("intervention_progress");
  const observations = useRows("observations");
  const students = useStudentMap();
  const classes = useClassMap();
  const fmt = useFormat();
  const store = useStore();
  const run = useAction();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const [entry, setEntry] = React.useState<{ date: string; assessment: ProgressAssessment; note: string }>({ date: toISODate(), assessment: "helpful", note: "" });

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;
  const plan = plans.rows.find((p) => p.id === planId);
  if (!plan) return <EmptyState icon={LifeBuoy} title="Plan not found" action={<Button asChild><Link href="/interventions">Back</Link></Button>} />;

  const student = students.get(plan.student_id);
  const cls = plan.class_id ? classes.get(plan.class_id) : undefined;
  const entries = progress.rows.filter((e) => e.plan_id === plan.id).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const obs = observations.rows.filter((o) => o.student_id === plan.student_id && (!plan.class_id || o.class_id === plan.class_id));
  const from = addDays(plan.start_date, -28);
  const to = toISODate() > plan.start_date ? toISODate() : addDays(plan.start_date, 14);
  const chart = bucketObservations(obs, from, to, "week").map((b) => ({ ...b, label: fmt.short(b.key) }));
  const startLabel = fmt.short(weekStart(plan.start_date));

  const setStatus = (s: InterventionStatus) =>
    run(() => store.update("intervention_plans", plan.id, { status: s }), { success: `Status: ${INTERVENTION_STATUS_LABELS[s]}`, undo: () => store.update("intervention_plans", plan.id, { status: plan.status }) });

  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => store.insertOne("intervention_progress", { plan_id: plan.id, entry_date: entry.date, assessment: entry.assessment, note: entry.note.trim() || null }), {
      success: "Progress review saved",
      undo: (r) => store.remove("intervention_progress", [r.id]),
    });
    if (ok) {
      setEntry({ date: toISODate(), assessment: "helpful", note: "" });
      if (entry.assessment === "needs_modification" && plan.status === "active") {
        if (await confirm({ title: "Mark plan as under review?", description: "You noted the strategy needs modification. Moving the plan to “Under review” keeps it on your follow-up list.", confirmLabel: "Mark under review" })) await setStatus("under_review");
      }
      if (entry.assessment === "discontinue" && plan.status !== "discontinued") {
        if (await confirm({ title: "Discontinue this plan?", description: "You noted the strategy should be discontinued. You can reactivate it later.", confirmLabel: "Discontinue" })) await setStatus("discontinued");
      }
    }
  };

  return (
    <>
      <PageHeader
        title={plan.target_behavior}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {student && (
              <Link href={studentHref(student.id)} className="font-medium hover:underline">
                {displayName(student)}
              </Link>
            )}
            {cls && <span>{classLabel(cls)}</span>}
            <Badge color={STATUS_COLOR[plan.status]}>{INTERVENTION_STATUS_LABELS[plan.status]}</Badge>
          </span>
        }
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/interventions">
                <ArrowLeft /> All plans
              </Link>
            </Button>
            <RecordHistoryButton recordId={plan.id} />
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            <Button
              variant="ghost"
              aria-label="Delete plan"
              onClick={async () => {
                if (await confirm({ title: "Delete this intervention plan?", description: "The plan and its progress reviews will be deleted. The deletion is kept in the audit log.", confirmLabel: "Delete plan", destructive: true })) {
                  const ok = await run(async () => { await store.remove("intervention_plans", [plan.id]); return true; }, { success: "Plan deleted" });
                  if (ok) router.push("/interventions");
                }
              }}
            >
              <Trash2 />
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Move to:</span>
        {NEXT[plan.status].map((s) => (
          <Button key={s} size="sm" variant="outline" onClick={() => setStatus(s)}>
            {INTERVENTION_STATUS_LABELS[s]}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Strategy</dt>
                <dd>{plan.strategy_name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Dates</dt>
                <dd>
                  Started {fmt.date(plan.start_date)} · Review {fmt.date(plan.review_date)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Success criteria</dt>
                <dd className="whitespace-pre-wrap">{plan.goal || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Baseline</dt>
                <dd className="whitespace-pre-wrap">{plan.baseline || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">Teacher notes</dt>
                <dd className="whitespace-pre-wrap">{plan.notes || "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Record a progress review</CardTitle>
            <CardDescription>Is the strategy helping?</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={addEntry} className="grid gap-3">
              <Field label="Date" htmlFor="pe-date">
                <Input id="pe-date" type="date" value={entry.date} max={toISODate()} onChange={(e) => setEntry((x) => ({ ...x, date: e.target.value }))} required />
              </Field>
              <Field label="Assessment" htmlFor="pe-assess">
                <Select id="pe-assess" value={entry.assessment} onChange={(e) => setEntry((x) => ({ ...x, assessment: e.target.value as ProgressAssessment }))}>
                  {Object.entries(ASSESSMENT_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Evidence / notes" htmlFor="pe-note">
                <Textarea id="pe-note" rows={3} maxLength={2000} value={entry.note} onChange={(e) => setEntry((x) => ({ ...x, note: e.target.value }))} placeholder="What did you observe?" />
              </Field>
              <Button type="submit" disabled={!entry.date}>
                Save review
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Observations before and after the start date</CardTitle>
            <CardDescription>
              Weekly counts for this student{cls ? ` in ${classLabel(cls)}` : ""}. These are documentation counts — changes in how often you record can look like changes in behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine x={startLabel} stroke="#7c3aed" strokeDasharray="4 4" label={{ value: "Plan start", fontSize: 11, fill: "#7c3aed", position: "top" }} />
                <Bar dataKey="positive" name="Positive" fill="#10b981" />
                <Bar dataKey="engagement" name="Engagement" fill="#3b82f6" />
                <Bar dataKey="redirection" name="Redirection" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Progress reviews ({entries.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length ? (
              <ol className="grid gap-2">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {fmt.date(e.entry_date)} · {ASSESSMENT_LABELS[e.assessment]}
                      </p>
                      {e.note && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{e.note}</p>}
                    </div>
                    <div className="flex">
                      <RecordHistoryButton recordId={e.id} label="" />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete review"
                        onClick={async () => {
                          if (await confirm({ title: "Delete this progress review?", description: "The deletion is kept in the audit log.", confirmLabel: "Delete", destructive: true }))
                            await run(() => store.remove("intervention_progress", [e.id]), { success: "Review deleted" });
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No reviews yet. Record one when you check in on the strategy.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title="Edit intervention plan" className="max-w-2xl">
          {editing && <PlanForm existing={plan} onDone={() => setEditing(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
