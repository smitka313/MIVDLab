"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { Activity, Observation } from "@/lib/types";
import { ACTIVITY_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { useActiveClasses, useCurrentActivity, useRoster, classLabel } from "@/lib/hooks";
import { buildObservation } from "./quick-buttons";
import { displayName } from "@/lib/utils";

const schema = z.object({
  class_id: z.string().min(1, "Choose a class"),
  student_id: z.string().min(1, "Choose a student"),
  observed_at: z.string().min(1, "Enter a date and time"),
  category_id: z.string().min(1, "Choose a category"),
  behavior_id: z.string(),
  custom_label: z.string().max(120, "Keep it under 120 characters"),
  activity: z.string(),
  context: z.string().max(500, "Keep it under 500 characters"),
  note: z.string().max(2000, "Keep it under 2000 characters"),
  intervention_used: z.string().max(200),
  follow_up_required: z.boolean(),
}).refine((v) => v.behavior_id || v.custom_label.trim(), { message: "Choose a behavior or describe one", path: ["custom_label"] });

type Values = z.infer<typeof schema>;

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

/** Full observation form, for detailed entries and corrections (edits are audit-logged). */
export function ObservationForm({
  existing,
  defaults,
  onDone,
}: {
  existing?: Observation;
  defaults?: { class_id?: string; student_id?: string; category_id?: string };
  onDone: () => void;
}) {
  const store = useStore();
  const run = useAction();
  const { rows: classes } = useActiveClasses();
  const categories = useRows("observation_categories");
  const behaviors = useRows("observation_behaviors");
  const strategies = useRows("intervention_strategies");
  const [currentActivity] = useCurrentActivity();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      class_id: existing?.class_id ?? defaults?.class_id ?? classes[0]?.id ?? "",
      student_id: existing?.student_id ?? defaults?.student_id ?? "",
      observed_at: toLocalInput(existing?.observed_at ?? new Date().toISOString()),
      category_id: existing?.category_id ?? defaults?.category_id ?? "",
      behavior_id: existing?.behavior_id ?? "",
      custom_label: existing && !existing.behavior_id ? existing.behavior_label : "",
      activity: existing?.activity ?? currentActivity ?? "",
      context: existing?.context ?? "",
      note: existing?.note ?? "",
      intervention_used: existing?.intervention_used ?? "",
      follow_up_required: existing?.follow_up_required ?? false,
    },
  });
  const { register, handleSubmit, watch, formState } = form;
  const e = formState.errors;
  const classId = watch("class_id");
  const categoryId = watch("category_id");
  const roster = useRoster(classId);
  const catBehaviors = behaviors.rows.filter((b) => b.category_id === categoryId && (b.is_active || b.id === existing?.behavior_id)).sort((a, b) => a.sort_order - b.sort_order);
  const activeCats = categories.rows.filter((c) => c.is_active || c.id === existing?.category_id).sort((a, b) => a.sort_order - b.sort_order);

  const onSubmit = handleSubmit(async (v) => {
    const category = categories.rows.find((c) => c.id === v.category_id);
    if (!category) return;
    const behavior = behaviors.rows.find((b) => b.id === v.behavior_id) ?? null;
    const row = buildObservation({
      student: { id: v.student_id },
      classId: v.class_id,
      category,
      behavior,
      label: v.custom_label.trim(),
      activity: (v.activity || null) as Activity | null,
      note: v.note.trim() || null,
      context: v.context.trim() || null,
      intervention_used: v.intervention_used.trim() || null,
      follow_up_required: v.follow_up_required,
      observed_at: new Date(v.observed_at).toISOString(),
    });
    const ok = existing
      ? await run(() => store.update("observations", existing.id, row), { success: "Observation updated" })
      : await run(() => store.insertOne("observations", row), {
          success: "Observation recorded",
          undo: (r) => store.remove("observations", [r.id]),
        });
    if (ok) onDone();
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Class" htmlFor="obs-class" error={e.class_id?.message} required>
          <Select id="obs-class" {...register("class_id")} aria-invalid={!!e.class_id}>
            <option value="">Choose…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {classLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Student" htmlFor="obs-student" error={e.student_id?.message} required>
          <Select id="obs-student" {...register("student_id")} aria-invalid={!!e.student_id}>
            <option value="">Choose…</option>
            {roster.map((s) => (
              <option key={s.id} value={s.id}>
                {displayName(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="obs-cat" error={e.category_id?.message} required>
          <Select id="obs-cat" {...register("category_id")} aria-invalid={!!e.category_id}>
            <option value="">Choose…</option>
            {activeCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Behavior or action" htmlFor="obs-beh">
          <Select id="obs-beh" {...register("behavior_id")} disabled={!categoryId}>
            <option value="">Other (describe below)</option>
            {catBehaviors.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {!watch("behavior_id") && (
        <Field label="Describe the behavior" htmlFor="obs-custom" error={e.custom_label?.message}>
          <Input id="obs-custom" {...register("custom_label")} aria-invalid={!!e.custom_label} placeholder="e.g. Explained the lab procedure to a partner" />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date and time" htmlFor="obs-time" error={e.observed_at?.message} required>
          <Input id="obs-time" type="datetime-local" {...register("observed_at")} />
        </Field>
        <Field label="Instructional activity" htmlFor="obs-activity">
          <Select id="obs-activity" {...register("activity")}>
            <option value="">Not recorded</option>
            {Object.entries(ACTIVITY_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Context" htmlFor="obs-context" error={e.context?.message} hint="Optional: what was happening (e.g. during warm-up).">
        <Input id="obs-context" {...register("context")} />
      </Field>
      <Field label="Intervention used" htmlFor="obs-int" hint="Optional.">
        <Input id="obs-int" list="obs-strategies" {...register("intervention_used")} />
        <datalist id="obs-strategies">
          {strategies.rows.filter((s) => s.is_active).map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
      </Field>
      <Field label="Teacher note" htmlFor="obs-note" error={e.note?.message} hint="Factual and specific. Visible only to you.">
        <Textarea id="obs-note" rows={3} {...register("note")} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...register("follow_up_required")} />
        Follow-up required
      </label>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {existing ? "Save correction" : "Record observation"}
        </Button>
      </DialogFooter>
    </form>
  );
}
