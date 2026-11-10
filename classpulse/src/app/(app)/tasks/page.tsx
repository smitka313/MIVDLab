"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { useRows, useTables } from "@/components/providers/data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Select } from "@/components/ui/input";
import { ReminderForm, ReminderItem } from "@/features/reminders/reminders";
import { useActionItems } from "@/features/reminders/action-items";
import { REMINDER_KIND_LABELS } from "@/lib/labels";
import type { Reminder } from "@/lib/types";
import { useFormat } from "@/lib/hooks";
import { toISODate } from "@/lib/utils";

export default function TasksPage() {
  const status = useTables("reminders", "students", "classes", "intervention_plans", "communications", "observations");
  const reminders = useRows("reminders");
  const derived = useActionItems().filter((i) => i.source !== "reminder");
  const fmt = useFormat();
  const [editing, setEditing] = React.useState<Reminder | "new" | null>(null);
  const [kind, setKind] = React.useState("");
  const [showDone, setShowDone] = React.useState(false);
  const today = toISODate();

  if (status.error) return <ErrorState error={status.error} onRetry={status.retry} />;
  if (status.loading) return <LoadingState />;

  const list = reminders.rows.filter((r) => !kind || r.kind === kind);
  const open = list.filter((r) => !r.completed_at).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const overdue = open.filter((r) => r.due_date && r.due_date < today);
  const upcoming = open.filter((r) => !r.due_date || r.due_date >= today);
  const done = list.filter((r) => r.completed_at).sort((a, b) => b.completed_at!.localeCompare(a.completed_at!));

  return (
    <>
      <PageHeader
        title="Tasks & reminders"
        description="In-app reminders for parent contacts, conferences, intervention reviews and documentation."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> Add reminder
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label="Filter by type" value={kind} onChange={(e) => setKind(e.target.value)} className="w-auto">
          <option value="">All types</option>
          {Object.entries(REMINDER_KIND_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-4">
          {!open.length && !done.length ? (
            <EmptyState icon={ClipboardList} title="No reminders" description="Add reminders for follow-ups you don't want to forget." />
          ) : (
            <>
              {overdue.length > 0 && (
                <Card className="border-destructive/40">
                  <CardHeader>
                    <CardTitle className="text-destructive">Overdue ({overdue.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y">{overdue.map((r) => <ReminderItem key={r.id} r={r} onEdit={() => setEditing(r)} />)}</ul>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>Upcoming ({upcoming.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {upcoming.length ? <ul className="divide-y">{upcoming.map((r) => <ReminderItem key={r.id} r={r} onEdit={() => setEditing(r)} />)}</ul> : <p className="text-sm text-muted-foreground">Nothing upcoming.</p>}
                </CardContent>
              </Card>
              <div>
                <button type="button" className="text-sm font-medium text-muted-foreground hover:text-foreground" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
                  {showDone ? "Hide" : "Show"} completed ({done.length})
                </button>
                {showDone && (
                  <Card className="mt-2">
                    <CardContent className="pt-3">
                      <ul className="divide-y">{done.slice(0, 100).map((r) => <ReminderItem key={r.id} r={r} />)}</ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
        <Card className="content-start">
          <CardHeader>
            <CardTitle>From your records</CardTitle>
          </CardHeader>
          <CardContent>
            {derived.length ? (
              <ul className="grid gap-2 text-sm">
                {derived.map((i) => (
                  <li key={i.id}>
                    <Link href={i.href} className="block rounded-md border p-2 hover:bg-secondary/50">
                      <span className="font-medium">{i.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {i.date ? fmt.short(i.date) : "No date"}
                        {i.studentName && ` · ${i.studentName}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No pending reviews or follow-ups.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "Add reminder" : "Edit reminder"}>{editing !== null && <ReminderForm existing={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}</DialogContent>
      </Dialog>
    </>
  );
}
