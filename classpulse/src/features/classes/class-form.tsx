"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { ClassSection } from "@/lib/types";
import { COLOR_NAMES, colorClasses } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const classSchema = z
  .object({
    course_name: z.string().trim().min(1, "Course name is required").max(120),
    period: z.string().trim().min(1, "Period is required").max(20),
    room: z.string().trim().max(40),
    academic_year_id: z.string(),
    term_id: z.string(),
    meeting_days: z.array(z.string()).min(1, "Choose at least one meeting day"),
    start_time: z.string(),
    end_time: z.string(),
    color: z.string(),
    description: z.string().max(2000),
  })
  .refine((v) => !v.start_time || !v.end_time || v.end_time > v.start_time, { message: "End time must be after start time", path: ["end_time"] });

type Values = z.infer<typeof classSchema>;

export function ClassForm({ existing, onDone }: { existing?: ClassSection; onDone: (c?: ClassSection) => void }) {
  const store = useStore();
  const run = useAction();
  const years = useRows("academic_years");
  const terms = useRows("terms");
  const classes = useRows("classes");
  const form = useForm<Values>({
    resolver: zodResolver(classSchema),
    defaultValues: {
      course_name: existing?.course_name ?? "",
      period: existing?.period ?? "",
      room: existing?.room ?? "",
      academic_year_id: existing?.academic_year_id ?? years.rows.find((y) => y.is_current)?.id ?? "",
      term_id: existing?.term_id ?? "",
      meeting_days: existing?.meeting_days ?? ["Mon", "Tue", "Wed", "Thu", "Fri"],
      start_time: existing?.start_time?.slice(0, 5) ?? "",
      end_time: existing?.end_time?.slice(0, 5) ?? "",
      color: existing?.color ?? COLOR_NAMES[classes.rows.length % COLOR_NAMES.length],
      description: existing?.description ?? "",
    },
  });
  const { register, handleSubmit, watch, setValue, formState } = form;
  const e = formState.errors;
  const yearId = watch("academic_year_id");
  const days = watch("meeting_days");
  const color = watch("color");

  const onSubmit = handleSubmit(async (v) => {
    const order = Number.parseInt(v.period, 10);
    const row = {
      course_name: v.course_name,
      period: v.period,
      period_order: Number.isFinite(order) ? order : existing?.period_order ?? classes.rows.length + 1,
      room: v.room || null,
      academic_year_id: v.academic_year_id || null,
      term_id: v.term_id || null,
      meeting_days: v.meeting_days,
      start_time: v.start_time || null,
      end_time: v.end_time || null,
      color: v.color,
      description: v.description.trim() || null,
    };
    const saved = existing
      ? await run(() => store.update("classes", existing.id, row), { success: "Class updated" })
      : await run(() => store.insertOne("classes", { ...row, school_id: null, default_layout_id: null, archived_at: null }), { success: (c) => `Created ${c.course_name}` });
    if (saved) onDone(saved);
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <Field label="Course name" htmlFor="c-name" error={e.course_name?.message} required>
          <Input id="c-name" {...register("course_name")} aria-invalid={!!e.course_name} placeholder="e.g. Biology" autoFocus />
        </Field>
        <Field label="Period" htmlFor="c-period" error={e.period?.message} required>
          <Input id="c-period" {...register("period")} aria-invalid={!!e.period} placeholder="1" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Room" htmlFor="c-room">
          <Input id="c-room" {...register("room")} />
        </Field>
        <Field label="Start time" htmlFor="c-start">
          <Input id="c-start" type="time" {...register("start_time")} />
        </Field>
        <Field label="End time" htmlFor="c-end" error={e.end_time?.message}>
          <Input id="c-end" type="time" {...register("end_time")} aria-invalid={!!e.end_time} />
        </Field>
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Meeting days</legend>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setValue("meeting_days", on ? days.filter((x) => x !== d) : [...days, d], { shouldValidate: true })}
                className={cn("h-8 rounded-md border px-3 text-sm", on ? "border-brand bg-accent text-accent-foreground" : "bg-card hover:bg-secondary")}
              >
                {d}
              </button>
            );
          })}
        </div>
        {e.meeting_days && <p role="alert" className="text-xs font-medium text-destructive">{e.meeting_days.message}</p>}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="School year" htmlFor="c-year" hint={years.rows.length ? undefined : "Add school years in Settings."}>
          <Select id="c-year" {...register("academic_year_id")}>
            <option value="">None</option>
            {years.rows.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Semester / term" htmlFor="c-term">
          <Select id="c-term" {...register("term_id")}>
            <option value="">Full year</option>
            {terms.rows.filter((t) => t.academic_year_id === yearId).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Class color</legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_NAMES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => setValue("color", c)}
              className={cn("size-7 rounded-full ring-offset-2 ring-offset-background", colorClasses(c).dot, color === c && "ring-2 ring-foreground")}
            />
          ))}
        </div>
      </fieldset>
      <Field label="Description" htmlFor="c-desc" hint="Optional.">
        <Textarea id="c-desc" rows={2} {...register("description")} />
      </Field>
      <DialogFooter>
        <Button variant="outline" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {existing ? "Save changes" : "Create class"}
        </Button>
      </DialogFooter>
    </form>
  );
}
