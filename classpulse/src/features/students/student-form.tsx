"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAction, useData, useRows, useStore } from "@/components/providers/data-provider";
import type { Student } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { classLabel, sortClasses } from "@/lib/hooks";
import { deleteStudentPhoto, resizeImage, StudentAvatar, uploadStudentPhoto } from "./photo";
import { toISODate } from "@/lib/utils";

export const studentSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(80),
  last_name: z.string().trim().min(1, "Last name is required").max(80),
  preferred_name: z.string().trim().max(80),
  grade_level: z.string().refine((v) => v === "" || ["9", "10", "11", "12"].includes(v), "Grade must be 9–12"),
  school_student_id: z.string().trim().max(40),
  class_ids: z.array(z.string()),
});
type Values = z.infer<typeof studentSchema>;

export function StudentForm({ existing, defaultClassId, onDone }: { existing?: Student; defaultClassId?: string; onDone: (s?: Student) => void }) {
  const store = useStore();
  const run = useAction();
  const { adapter } = useData();
  const classes = useRows("classes");
  const enrollments = useRows("enrollments");
  const students = useRows("students");
  const [photo, setPhoto] = React.useState<Blob | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = React.useState(false);
  const current = existing ? enrollments.rows.filter((e) => e.student_id === existing.id && !e.dropped_at).map((e) => e.class_id) : defaultClassId ? [defaultClassId] : [];
  const form = useForm<Values>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      first_name: existing?.first_name ?? "",
      last_name: existing?.last_name ?? "",
      preferred_name: existing?.preferred_name ?? "",
      grade_level: existing?.grade_level ? String(existing.grade_level) : "",
      school_student_id: existing?.school_student_id ?? "",
      class_ids: current,
    },
  });
  const { register, handleSubmit, formState, setError } = form;
  const e = formState.errors;
  const activeClasses = classes.rows.filter((c) => !c.archived_at).sort(sortClasses);

  const onSubmit = handleSubmit(async (v) => {
    const sid = v.school_student_id || null;
    if (sid && students.rows.some((s) => s.school_student_id === sid && s.id !== existing?.id)) {
      setError("school_student_id", { message: "Another student already has this ID" });
      return;
    }
    const row = {
      first_name: v.first_name,
      last_name: v.last_name,
      preferred_name: v.preferred_name || null,
      grade_level: v.grade_level ? Number(v.grade_level) : null,
      school_student_id: sid,
    };
    const saved = await run(
      async () => {
        const s = existing ? await store.update("students", existing.id, row) : await store.insertOne("students", { ...row, school_id: null, photo_path: null, is_demo: false, archived_at: null });
        // Enrollment changes
        const mine = store.rows("enrollments").filter((en) => en.student_id === s.id);
        const toAdd = v.class_ids.filter((cid) => !mine.some((en) => en.class_id === cid));
        const toRejoin = mine.filter((en) => v.class_ids.includes(en.class_id) && en.dropped_at);
        const toDrop = mine.filter((en) => !v.class_ids.includes(en.class_id) && !en.dropped_at);
        if (toAdd.length) await store.insert("enrollments", toAdd.map((class_id) => ({ class_id, student_id: s.id, enrolled_at: toISODate(), dropped_at: null })));
        for (const en of toRejoin) await store.update("enrollments", en.id, { dropped_at: null });
        for (const en of toDrop) await store.update("enrollments", en.id, { dropped_at: toISODate() });
        // Photo
        if (photo) {
          const path = await uploadStudentPhoto(adapter.mode, adapter.userId, s.id, photo);
          return store.update("students", s.id, { photo_path: path });
        }
        if (removePhoto && s.photo_path) {
          await deleteStudentPhoto(adapter.mode, s.photo_path);
          return store.update("students", s.id, { photo_path: null });
        }
        return s;
      },
      { success: existing ? "Student updated" : (s) => `Added ${s.first_name} ${s.last_name}` },
    );
    if (saved) onDone(saved);
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" htmlFor="s-first" error={e.first_name?.message} required>
          <Input id="s-first" {...register("first_name")} aria-invalid={!!e.first_name} autoFocus />
        </Field>
        <Field label="Last name" htmlFor="s-last" error={e.last_name?.message} required>
          <Input id="s-last" {...register("last_name")} aria-invalid={!!e.last_name} />
        </Field>
        <Field label="Preferred name" htmlFor="s-pref" hint="Shown throughout ClassPulse when set.">
          <Input id="s-pref" {...register("preferred_name")} />
        </Field>
        <Field label="Grade" htmlFor="s-grade" error={e.grade_level?.message}>
          <Select id="s-grade" {...register("grade_level")}>
            <option value="">—</option>
            {[9, 10, 11, 12].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="School student ID" htmlFor="s-sid" error={e.school_student_id?.message} hint="Optional. Used to detect duplicates on import.">
          <Input id="s-sid" {...register("school_student_id")} aria-invalid={!!e.school_student_id} />
        </Field>
        <Field label="Photo" htmlFor="s-photo" error={photoError ?? undefined} hint={adapter.mode === "demo" ? "Demo mode: stored only in this browser." : "Optional. Stored privately; visible only to you."}>
          <div className="flex items-center gap-2">
            {existing && !removePhoto && !photo && <StudentAvatar student={existing} className="size-9" />}
            <Input
              id="s-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="py-1.5 file:mr-2 file:border-0 file:bg-transparent file:text-sm"
              onChange={async (ev) => {
                const f = ev.target.files?.[0];
                setPhotoError(null);
                if (!f) return setPhoto(null);
                try {
                  setPhoto(await resizeImage(f));
                } catch (err) {
                  setPhotoError((err as Error).message);
                  ev.target.value = "";
                }
              }}
            />
          </div>
          {existing?.photo_path && !photo && (
            <label className="mt-1 flex items-center gap-2 text-xs">
              <Checkbox checked={removePhoto} onChange={(ev) => setRemovePhoto(ev.target.checked)} /> Remove current photo
            </label>
          )}
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Classes</legend>
        {activeClasses.length ? (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {activeClasses.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                <Checkbox value={c.id} {...register("class_ids")} />
                {classLabel(c)}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No classes yet.</p>
        )}
      </fieldset>
      <DialogFooter>
        <Button variant="outline" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {existing ? "Save changes" : "Add student"}
        </Button>
      </DialogFooter>
    </form>
  );
}
