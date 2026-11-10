"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAction, useRows, useStore } from "@/components/providers/data-provider";
import type { Communication } from "@/lib/types";
import { COMM_STATUS_LABELS, CONTACT_TYPE_LABELS, PURPOSE_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { byName, displayName } from "@/lib/utils";

const schema = z
  .object({
    student_id: z.string().min(1, "Choose a student"),
    contact_type: z.enum(["email", "phone", "in_person", "virtual", "student_conversation", "other"]),
    occurred_at: z.string().min(1, "Enter a date and time"),
    recipient: z.string().max(200),
    purpose: z.enum(["positive", "concern", "missing_work", "attendance", "improvement", "conference", "follow_up", "other"]),
    subject: z.string().max(200),
    summary: z.string().max(5000),
    follow_up_required: z.boolean(),
    follow_up_date: z.string(),
    status: z.enum(["draft", "completed", "follow_up_pending", "closed"]),
  })
  .refine((v) => !v.follow_up_required || v.follow_up_date, { message: "Choose a follow-up date", path: ["follow_up_date"] });
type Values = z.infer<typeof schema>;

function localInput(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function ContactForm({ existing, defaults, onDone }: { existing?: Communication; defaults?: Partial<Values>; onDone: () => void }) {
  const store = useStore();
  const run = useAction();
  const students = useRows("students");
  const { register, handleSubmit, watch, formState, setValue } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      student_id: existing?.student_id ?? defaults?.student_id ?? "",
      contact_type: existing?.contact_type ?? defaults?.contact_type ?? "phone",
      occurred_at: localInput(existing?.occurred_at ?? new Date().toISOString()),
      recipient: existing?.recipient ?? defaults?.recipient ?? "",
      purpose: existing?.purpose ?? defaults?.purpose ?? "positive",
      subject: existing?.subject ?? defaults?.subject ?? "",
      summary: existing?.summary ?? defaults?.summary ?? "",
      follow_up_required: existing?.follow_up_required ?? false,
      follow_up_date: existing?.follow_up_date ?? "",
      status: existing?.status ?? defaults?.status ?? "completed",
    },
  });
  const e = formState.errors;
  const fu = watch("follow_up_required");
  React.useEffect(() => {
    if (fu && watch("status") === "completed") setValue("status", "follow_up_pending");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fu]);

  const submit = handleSubmit(async (v) => {
    const row = {
      student_id: v.student_id,
      contact_type: v.contact_type,
      occurred_at: new Date(v.occurred_at).toISOString(),
      recipient: v.recipient.trim() || null,
      purpose: v.purpose,
      subject: v.subject.trim() || null,
      summary: v.summary.trim() || null,
      follow_up_required: v.follow_up_required,
      follow_up_date: v.follow_up_required ? v.follow_up_date || null : null,
      status: v.status,
    };
    const ok = existing
      ? await run(() => store.update("communications", existing.id, row), { success: "Contact updated" })
      : await run(() => store.insertOne("communications", row), { success: "Contact logged", undo: (r) => store.remove("communications", [r.id]) });
    if (ok) onDone();
  });

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Student" htmlFor="cm-student" error={e.student_id?.message} required>
          <Select id="cm-student" {...register("student_id")} aria-invalid={!!e.student_id}>
            <option value="">Choose…</option>
            {students.rows.filter((s) => !s.archived_at || s.id === existing?.student_id).sort(byName).map((s) => (
              <option key={s.id} value={s.id}>
                {displayName(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact type" htmlFor="cm-type">
          <Select id="cm-type" {...register("contact_type")}>
            {Object.entries(CONTACT_TYPE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date and time" htmlFor="cm-at" error={e.occurred_at?.message} required>
          <Input id="cm-at" type="datetime-local" {...register("occurred_at")} />
        </Field>
        <Field label="Recipient / participant" htmlFor="cm-rec" hint="e.g. Parent/guardian name, or an email address.">
          <Input id="cm-rec" {...register("recipient")} />
        </Field>
        <Field label="Purpose" htmlFor="cm-purpose">
          <Select id="cm-purpose" {...register("purpose")}>
            {Object.entries(PURPOSE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="cm-status">
          <Select id="cm-status" {...register("status")}>
            {Object.entries(COMM_STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Subject" htmlFor="cm-subject">
        <Input id="cm-subject" {...register("subject")} />
      </Field>
      <Field label="Summary" htmlFor="cm-summary" hint="What was discussed and agreed.">
        <Textarea id="cm-summary" rows={4} {...register("summary")} />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox {...register("follow_up_required")} /> Follow-up required
        </label>
        {fu && (
          <Field label="Follow-up date" htmlFor="cm-fu" error={e.follow_up_date?.message}>
            <Input id="cm-fu" type="date" {...register("follow_up_date")} aria-invalid={!!e.follow_up_date} className="w-auto" />
          </Field>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {existing ? "Save" : "Log contact"}
        </Button>
      </DialogFooter>
    </form>
  );
}
