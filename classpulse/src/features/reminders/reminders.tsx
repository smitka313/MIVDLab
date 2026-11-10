"use client";

import { studentHref } from "@/lib/paths";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { Reminder } from "@/lib/types";
import { PRIORITY_LABELS, REMINDER_KIND_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { classLabel, sortClasses, useClassMap, useFormat, useStudentMap } from "@/lib/hooks";
import { byName, cn, displayName, toISODate } from "@/lib/utils";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(2000),
  kind: z.enum(["parent_contact", "conference", "intervention_review", "documentation", "general"]),
  student_id: z.string(),
  class_id: z.string(),
  due_date: z.string(),
  priority: z.enum(["low", "normal", "high"]),
});
type Values = z.infer<typeof schema>;

export function ReminderForm({ existing, defaults, onDone }: { existing?: Reminder; defaults?: Partial<Values>; onDone: () => void }) {
  const store = useStore();
  const run = useAction();
  const students = useRows("students");
  const classes = useRows("classes");
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: existing?.title ?? defaults?.title ?? "",
      description: existing?.description ?? "",
      kind: existing?.kind ?? defaults?.kind ?? "general",
      student_id: existing?.student_id ?? defaults?.student_id ?? "",
      class_id: existing?.class_id ?? defaults?.class_id ?? "",
      due_date: existing?.due_date ?? defaults?.due_date ?? toISODate(),
      priority: existing?.priority ?? "normal",
    },
  });
  const e = formState.errors;
  const submit = handleSubmit(async (v) => {
    const row = { title: v.title, description: v.description.trim() || null, kind: v.kind, student_id: v.student_id || null, class_id: v.class_id || null, due_date: v.due_date || null, priority: v.priority };
    const ok = existing
      ? await run(() => store.update("reminders", existing.id, row), { success: "Reminder updated" })
      : await run(() => store.insertOne("reminders", { ...row, completed_at: null }), { success: "Reminder added", undo: (r) => store.remove("reminders", [r.id]) });
    if (ok) onDone();
  });
  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <Field label="Title" htmlFor="r-title" error={e.title?.message} required>
        <Input id="r-title" {...register("title")} aria-invalid={!!e.title} autoFocus />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Type" htmlFor="r-kind">
          <Select id="r-kind" {...register("kind")}>
            {Object.entries(REMINDER_KIND_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="r-due">
          <Input id="r-due" type="date" {...register("due_date")} />
        </Field>
        <Field label="Priority" htmlFor="r-pri">
          <Select id="r-pri" {...register("priority")}>
            {Object.entries(PRIORITY_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Student" htmlFor="r-student">
          <Select id="r-student" {...register("student_id")}>
            <option value="">None</option>
            {students.rows.filter((s) => !s.archived_at).sort(byName).map((s) => (
              <option key={s.id} value={s.id}>
                {displayName(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Class" htmlFor="r-class">
          <Select id="r-class" {...register("class_id")}>
            <option value="">None</option>
            {classes.rows.filter((c) => !c.archived_at).sort(sortClasses).map((c) => (
              <option key={c.id} value={c.id}>
                {classLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Details" htmlFor="r-desc">
        <Textarea id="r-desc" rows={2} {...register("description")} />
      </Field>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {existing ? "Save" : "Add reminder"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ReminderItem({ r, onEdit, compact }: { r: Reminder; onEdit?: () => void; compact?: boolean }) {
  const store = useStore();
  const run = useAction();
  const students = useStudentMap();
  const classes = useClassMap();
  const fmt = useFormat();
  const today = toISODate();
  const overdue = !r.completed_at && r.due_date && r.due_date < today;
  const s = r.student_id ? students.get(r.student_id) : undefined;
  const c = r.class_id ? classes.get(r.class_id) : undefined;
  const toggle = () =>
    run(() => store.update("reminders", r.id, { completed_at: r.completed_at ? null : new Date().toISOString() }), {
      success: r.completed_at ? "Reopened" : "Marked done",
      undo: () => store.update("reminders", r.id, { completed_at: r.completed_at }),
    });
  return (
    <li className="flex items-start gap-3 py-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={r.completed_at ? `Reopen ${r.title}` : `Mark ${r.title} done`}
        className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", r.completed_at ? "border-emerald-500 bg-emerald-500 text-white" : "hover:border-brand")}
      >
        {r.completed_at && <Check className="size-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", r.completed_at && "text-muted-foreground line-through")}>{r.title}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className={cn(overdue && "font-semibold text-destructive")}>{r.due_date ? `${overdue ? "Overdue · " : "Due "}${fmt.short(r.due_date)}` : "No due date"}</span>
          <span>{REMINDER_KIND_LABELS[r.kind]}</span>
          {s && (
            <Link href={studentHref(s.id)} className="hover:underline">
              {displayName(s)}
            </Link>
          )}
          {c && <span>{classLabel(c)}</span>}
          {r.priority === "high" && <Badge color="rose">High priority</Badge>}
        </p>
        {!compact && r.description && <p className="mt-0.5 text-sm text-muted-foreground">{r.description}</p>}
      </div>
      {!compact && (
        <div className="flex shrink-0">
          {r.completed_at ? (
            <Button size="icon-sm" variant="ghost" aria-label="Reopen" onClick={toggle}>
              <RotateCcw />
            </Button>
          ) : (
            onEdit && (
              <Button size="icon-sm" variant="ghost" aria-label="Edit reminder" onClick={onEdit}>
                <Pencil />
              </Button>
            )
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Delete reminder"
            onClick={() => {
              const { id: _i, teacher_id: _t, created_at: _c, updated_at: _u, ...rest } = r;
              void _i; void _t; void _c; void _u;
              void run(() => store.remove("reminders", [r.id]), { success: "Reminder deleted", undo: () => store.insertOne("reminders", rest) });
            }}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}
