"use client";

import { planHref, studentHref } from "@/lib/paths";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LifeBuoy, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { useRows, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { PlanForm } from "@/features/interventions/plan-form";
import { StrategyLibrary } from "@/features/interventions/strategy-library";
import { classLabel, useClassMap, useFormat, useStudentMap } from "@/lib/hooks";
import { ASSESSMENT_LABELS, INTERVENTION_STATUS_LABELS, STATUS_COLOR } from "@/lib/labels";
import { cn, displayName, toISODate } from "@/lib/utils";

export default function InterventionsPage() {
  return (
    <React.Suspense fallback={<LoadingState />}>
      <Interventions />
    </React.Suspense>
  );
}

function Interventions() {
  const params = useSearchParams();
  const router = useRouter();
  const status = useTables("intervention_plans", "intervention_progress", "intervention_strategies", "students", "classes", "enrollments", "observations");
  const plans = useRows("intervention_plans");
  const progress = useRows("intervention_progress");
  const students = useStudentMap();
  const classes = useClassMap();
  const fmt = useFormat();
  const [statusFilter, setStatusFilter] = React.useState<string>("open");
  const [creating, setCreating] = React.useState<string | null>(params.get("new"));
  const today = toISODate();

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;

  const list = plans.rows
    .filter((p) => (statusFilter === "open" ? ["planned", "active", "under_review"].includes(p.status) : !statusFilter || p.status === statusFilter))
    .sort((a, b) => (a.review_date ?? "9999").localeCompare(b.review_date ?? "9999"));

  return (
    <>
      <PageHeader
        title="Interventions"
        description="Plan classroom strategies, schedule reviews and document what helps."
        actions={
          <Button onClick={() => setCreating("")}>
            <Plus /> New plan
          </Button>
        }
      />
      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="library">Strategy library</TabsTrigger>
        </TabsList>
        <TabsContent value="plans">
          <div className="mb-3">
            <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
              <option value="open">Open (planned, active, under review)</option>
              <option value="">All statuses</option>
              {Object.entries(INTERVENTION_STATUS_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          {list.length ? (
            <Card>
              <Table>
                <THead>
                  <tr>
                    <TH>Student</TH>
                    <TH>Target</TH>
                    <TH className="hidden md:table-cell">Strategy</TH>
                    <TH>Review</TH>
                    <TH className="hidden lg:table-cell">Latest review</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {list.map((p) => {
                    const s = students.get(p.student_id);
                    const c = p.class_id ? classes.get(p.class_id) : undefined;
                    const latest = progress.rows.filter((e) => e.plan_id === p.id).sort((a, b) => b.entry_date.localeCompare(a.entry_date))[0];
                    const due = p.review_date && p.review_date <= today && ["active", "under_review"].includes(p.status);
                    return (
                      <TR key={p.id}>
                        <TD className="font-medium">
                          {s ? (
                            <Link href={studentHref(s.id)} className="hover:underline">
                              {displayName(s)}
                            </Link>
                          ) : (
                            "—"
                          )}
                          {c && <span className="block text-xs font-normal text-muted-foreground">{classLabel(c)}</span>}
                        </TD>
                        <TD>
                          <Link href={planHref(p.id)} className="hover:underline">
                            {p.target_behavior}
                          </Link>
                        </TD>
                        <TD className="hidden md:table-cell">{p.strategy_name}</TD>
                        <TD className={cn("whitespace-nowrap", due && "font-semibold text-destructive")}>{p.review_date ? `${due ? "Due " : ""}${fmt.short(p.review_date)}` : "—"}</TD>
                        <TD className="hidden text-xs text-muted-foreground lg:table-cell">{latest ? `${ASSESSMENT_LABELS[latest.assessment]} · ${fmt.short(latest.entry_date)}` : "None yet"}</TD>
                        <TD>
                          <Badge color={STATUS_COLOR[p.status]}>{INTERVENTION_STATUS_LABELS[p.status]}</Badge>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          ) : (
            <EmptyState icon={LifeBuoy} title="No plans here" description="Create a plan to track a strategy and its outcomes for a student." action={<Button onClick={() => setCreating("")}>New plan</Button>} />
          )}
        </TabsContent>
        <TabsContent value="library">
          <StrategyLibrary />
        </TabsContent>
      </Tabs>
      <Dialog
        open={creating !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(null);
            if (params.get("new") !== null) router.replace("/interventions");
          }
        }}
      >
        <DialogContent title="New intervention plan" className="max-w-2xl">
          {creating !== null && (
            <PlanForm
              defaultStudentId={creating || undefined}
              onDone={(p) => {
                setCreating(null);
                if (p) router.push(planHref(p.id));
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
