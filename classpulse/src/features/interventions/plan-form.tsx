"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { InterventionPlan } from "@/lib/types";
import { INTERVENTION_STATUS_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { classLabel, sortClasses } from "@/lib/hooks";
import { addDays, byName, displayName, isoDateOf, toISODate } from "@/lib/utils";
import { countKinds } from "@/lib/stats";

const schema = z
  .object({
    student_id: z.string().min(1, "Choose a student"),
    class_id: z.string(),
    target_behavior: z.string().trim().min(1, "Describe the target behavior or goal").max(200),
    goal: z.string().max(1000),
    baseline: z.string().max(2000),
    strategy_id: z.string(),
    custom_strategy: z.string().max(80),
    start_date: z.string().min(1, "Start date is required"),
    review_date: z.string(),
    status: z.enum(["planned", "active", "under_review", "completed", "discontinued"]),
    notes: z.string().max(5000),
    add_reminder: z.boolean(),
  })
  .refine((v) => v.strategy_id || v.custom_strategy.trim(), { message: "Choose a strategy or name your own", path: ["custom_strategy"] })
  .refine((v) => !v.review_date || v.review_date >= v.start_date, { message: "Review date can't be before the start date", path: ["review_date"] });
type Values = z.infer<typeof schema>;

export function PlanForm({ existing, defaultStudentId, onDone }: { existing?: InterventionPlan; defaultStudentId?: string; onDone: (p?: InterventionPlan) => void }) {
  const store = useStore();
  const run = useAction();
  const students = useRows("students");
  const classes = useRows("classes");
  const enrollments = useRows("enrollments");
  const strategies = useRows("intervention_strategies");
  const observations = useRows("observations");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      student_id: existing?.student_id ?? defaultStudentId ?? "",
      class_id: existing?.class_id ?? "",
      target_behavior: existing?.target_behavior ?? "",
      goal: existing?.goal ?? "",
      baseline: existing?.baseline ?? "",
      strategy_id: existing?.strategy_id ?? "",
      custom_strategy: existing && !existing.strategy_id ? existing.strategy_name : "",
      start_date: existing?.start_date ?? toISODate(),
      review_date: existing?.review_date ?? addDays(toISODate(), 14),
      status: existing?.status ?? "active",
      notes: existing?.notes ?? "",
      add_reminder: !existing,
    },
  });
  const { register, handleSubmit, watch, setValue, formState } = form;
  const e = formState.errors;
  const sid = watch("student_id");
  const studentClasses = enrollments.rows.filter((en) => en.student_id === sid && !en.dropped_at).map((en) => en.class_id);
  const activeStrategies = strategies.rows.filter((s) => s.is_active || s.id === existing?.strategy_id);

  const baselineSuggestion = () => {
    const start = watch("start_date") || toISODate();
    const from = addDays(start, -28);
    const obs = observations.rows.filter((o) => o.student_id === sid && isoDateOf(o.observed_at) >= from && isoDateOf(o.observed_at) < start);
    const k = countKinds(obs);
    const top = Object.entries(obs.filter((o) => o.kind === "redirection").reduce<Record<string, number>>((m, o) => ({ ...m, [o.behavior_label]: (m[o.behavior_label] ?? 0) + 1 }), {}))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([l, n]) => `${l} (${n})`)
      .join(", ");
    setValue(
      "baseline",
      `Recorded in the 4 weeks before ${start}: ${k.positive} positive, ${k.engagement} engagement, ${k.redirection} redirection observations.${top ? ` Most frequent redirections: ${top}.` : ""} (Counts reflect what was documented, not every occurrence.)`,
    );
  };

  const onSubmit = handleSubmit(async (v) => {
    const strat = strategies.rows.find((s) => s.id === v.strategy_id);
    const row = {
      student_id: v.student_id,
      class_id: v.class_id || null,
      target_behavior: v.target_behavior,
      goal: v.goal.trim() || null,
      baseline: v.baseline.trim() || null,
      strategy_id: strat?.id ?? null,
      strategy_name: strat?.name ?? v.custom_strategy.trim(),
      start_date: v.start_date,
      review_date: v.review_date || null,
      status: v.status,
      notes: v.notes.trim() || null,
    };
    const saved = await run(
      async () => {
        const p = existing ? await store.update("intervention_plans", existing.id, row) : await store.insertOne("intervention_plans", row);
        if (v.add_reminder && v.review_date) {
          await store.insertOne("reminders", { title: `Review intervention: ${v.target_behavior}`.slice(0, 200), description: null, kind: "intervention_review", student_id: v.student_id, class_id: v.class_id || null, due_date: v.review_date, priority: "normal", completed_at: null });
        }
        return p;
      },
      { success: existing ? "Plan updated" : "Intervention plan created" },
    );
    if (saved) onDone(saved);
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Student" htmlFor="p-student" error={e.student_id?.message} required>
          <Select id="p-student" {...register("student_id")} aria-invalid={!!e.student_id} disabled={!!existing}>
            <option value="">Choose…</option>
            {students.rows.filter((s) => !s.archived_at || s.id === existing?.student_id).sort(byName).map((s) => (
              <option key={s.id} value={s.id}>
                {displayName(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Class" htmlFor="p-class">
          <Select id="p-class" {...register("class_id")}>
            <option value="">All classes</option>
            {classes.rows.filter((c) => studentClasses.includes(c.id) || c.id === existing?.class_id).sort(sortClasses).map((c) => (
              <option key={c.id} value={c.id}>
                {classLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Target behavior or goal" htmlFor="p-target" error={e.target_behavior?.message} required>
        <Input id="p-target" {...register("target_behavior")} aria-invalid={!!e.target_behavior} placeholder="e.g. Begins independent work within 3 minutes" />
      </Field>
      <Field label="Success criteria" htmlFor="p-goal" hint="What would show this is working?">
        <Textarea id="p-goal" rows={2} {...register("goal")} />
      </Field>
      <Field label="Baseline" htmlFor="p-baseline" hint="Factual description of current behavior before the plan.">
        <Textarea id="p-baseline" rows={3} {...register("baseline")} />
        <Button type="button" size="sm" variant="ghost" className="justify-self-start" disabled={!sid} onClick={baselineSuggestion}>
          Summarize recent observations
        </Button>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Strategy" htmlFor="p-strategy">
          <Select id="p-strategy" {...register("strategy_id")}>
            <option value="">Custom (type below)</option>
            {activeStrategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {!watch("strategy_id") && (
          <Field label="Custom strategy" htmlFor="p-custom" error={e.custom_strategy?.message}>
            <Input id="p-custom" {...register("custom_strategy")} aria-invalid={!!e.custom_strategy} />
          </Field>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Start date" htmlFor="p-start" error={e.start_date?.message} required>
          <Input id="p-start" type="date" {...register("start_date")} />
        </Field>
        <Field label="Review date" htmlFor="p-review" error={e.review_date?.message}>
          <Input id="p-review" type="date" {...register("review_date")} aria-invalid={!!e.review_date} />
        </Field>
        <Field label="Status" htmlFor="p-status">
          <Select id="p-status" {...register("status")}>
            {Object.entries(INTERVENTION_STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Teacher notes" htmlFor="p-notes">
        <Textarea id="p-notes" rows={3} {...register("notes")} />
      </Field>
      {watch("review_date") && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox {...register("add_reminder")} /> Add a reminder on the review date
        </label>
      )}
      <p className="text-xs text-muted-foreground">ClassPulse helps you document classroom strategies. It does not diagnose students or recommend disciplinary actions.</p>
      <DialogFooter>
        <Button variant="outline" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {existing ? "Save plan" : "Create plan"}
        </Button>
      </DialogFooter>
    </form>
  );
}
