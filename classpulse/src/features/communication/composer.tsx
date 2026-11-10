"use client";

import * as React from "react";
import { Copy, Mail, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAction, useData, useRows, useStore } from "@/components/providers/data-provider";
import type { CommPurpose } from "@/lib/types";
import { KIND_COLOR, KIND_LABELS, PURPOSE_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { classLabel, useClassMap, useFormat } from "@/lib/hooks";
import { fillTemplate, mailtoUrl } from "@/lib/messages";
import { addDays, byName, displayName, isoDateOf, toISODate } from "@/lib/utils";

/**
 * Draft a parent/guardian message from a template and teacher-selected,
 * factual observations. Nothing is ever sent automatically: the teacher
 * copies the text or opens a draft in their own email client, then logs it.
 */
export function MessageComposer({ defaultStudentId, onSaved }: { defaultStudentId?: string; onSaved?: () => void }) {
  const store = useStore();
  const run = useAction();
  const { profile } = useData();
  const students = useRows("students");
  const templates = useRows("communication_templates");
  const observations = useRows("observations");
  const enrollments = useRows("enrollments");
  const classMap = useClassMap();
  const fmt = useFormat();
  const [studentId, setStudentId] = React.useState(defaultStudentId ?? "");
  const [templateId, setTemplateId] = React.useState("");
  const [days, setDays] = React.useState(30);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [recipient, setRecipient] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [reviewed, setReviewed] = React.useState(false);

  const student = students.rows.find((s) => s.id === studentId);
  const template = templates.rows.find((t) => t.id === templateId);
  const since = addDays(toISODate(), -days);
  const recent = observations.rows.filter((o) => o.student_id === studentId && isoDateOf(o.observed_at) >= since).sort((a, b) => b.observed_at.localeCompare(a.observed_at));
  const classId = enrollments.rows.find((e) => e.student_id === studentId && !e.dropped_at)?.class_id;
  const cls = classId ? classMap.get(classId) : undefined;

  const generate = () => {
    if (!student || !template) return;
    const chosen = recent.filter((o) => picked.has(o.id));
    const ctx = {
      studentFirst: student.preferred_name || student.first_name,
      studentName: displayName(student),
      teacherName: profile.display_name,
      className: cls?.course_name ?? "",
      date: fmt.date(toISODate()),
      observations: chosen,
      formatDate: (iso: string) => fmt.date(iso),
    };
    setSubject(fillTemplate(template.subject, ctx));
    setBody(fillTemplate(template.body, ctx));
    setReviewed(false);
  };

  const save = async (status: "draft" | "completed") => {
    if (!student || !body.trim()) return;
    const ok = await run(
      () =>
        store.insertOne("communications", {
          student_id: student.id,
          contact_type: "email",
          occurred_at: new Date().toISOString(),
          recipient: recipient.trim() || null,
          purpose: (template?.purpose ?? "other") as CommPurpose,
          subject: subject.trim() || null,
          summary: body.trim(),
          follow_up_required: false,
          follow_up_date: null,
          status,
        }),
      { success: status === "draft" ? "Draft saved to communication log" : "Logged as sent" },
    );
    if (ok) onSaved?.();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-3">
        <Field label="Student" htmlFor="mc-student">
          <Select id="mc-student" value={studentId} onChange={(e) => { setStudentId(e.target.value); setPicked(new Set()); }}>
            <option value="">Choose…</option>
            {students.rows.filter((s) => !s.archived_at).sort(byName).map((s) => (
              <option key={s.id} value={s.id}>
                {displayName(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Template" htmlFor="mc-template">
          <Select id="mc-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Choose…</option>
            {templates.rows.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({PURPOSE_LABELS[t.purpose]})
              </option>
            ))}
          </Select>
        </Field>
        {student && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
              Include observations
              <Select aria-label="Time range" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-7 w-auto text-xs">
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </Select>
            </legend>
            <p className="text-xs text-muted-foreground">Only the observations you tick are included. Choose specific, factual examples.</p>
            <ul className="max-h-64 overflow-y-auto rounded-lg border">
              {recent.map((o) => (
                <li key={o.id} className="border-b last:border-0">
                  <label className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-secondary/50">
                    <Checkbox className="mt-0.5" checked={picked.has(o.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n; })} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <Badge color={KIND_COLOR[o.kind]}>{KIND_LABELS[o.kind]}</Badge>
                        {o.behavior_label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmt.dateTime(o.observed_at)}
                        {classMap.get(o.class_id) && ` · ${classLabel(classMap.get(o.class_id)!)}`}
                        {o.note && ` · ${o.note}`}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
              {!recent.length && <li className="p-3 text-sm text-muted-foreground">No observations in this period.</li>}
            </ul>
          </fieldset>
        )}
        <Button onClick={generate} disabled={!student || !template}>
          Generate draft
        </Button>
      </div>
      <div className="grid content-start gap-3">
        <Field label="To (optional)" htmlFor="mc-to" hint="Used only to pre-fill your email app. ClassPulse does not send email.">
          <Input id="mc-to" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="guardian@example.com" />
        </Field>
        <Field label="Subject" htmlFor="mc-subject">
          <Input id="mc-subject" value={subject} onChange={(e) => { setSubject(e.target.value); setReviewed(false); }} maxLength={200} />
        </Field>
        <Field label="Message" htmlFor="mc-body">
          <Textarea id="mc-body" rows={14} value={body} onChange={(e) => { setBody(e.target.value); setReviewed(false); }} maxLength={5000} placeholder="Choose a student and template, then Generate draft — or write your own." />
        </Field>
        <label className="flex items-start gap-2 rounded-lg border bg-secondary/40 p-3 text-sm">
          <Checkbox className="mt-0.5" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          <span>
            <span className="flex items-center gap-1 font-medium">
              <ShieldCheck className="size-4" aria-hidden /> I have reviewed this message
            </span>
            <span className="text-xs text-muted-foreground">Check it is accurate, respectful and contains only information appropriate for this recipient.</span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!body.trim() || !reviewed}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(subject ? `Subject: ${subject}\n\n${body}` : body);
                toast.success("Copied to clipboard");
              } catch {
                toast.error("Couldn't access the clipboard. Select the text and copy it manually.");
              }
            }}
          >
            <Copy /> Copy
          </Button>
          <Button variant="outline" disabled={!body.trim() || !reviewed} asChild={!!body.trim() && reviewed}>
            {body.trim() && reviewed ? (
              <a href={mailtoUrl(recipient, subject, body)}>
                <Mail /> Open email draft
              </a>
            ) : (
              <span>
                <Mail /> Open email draft
              </span>
            )}
          </Button>
          <Button variant="ghost" disabled={!student || !body.trim()} onClick={() => save("draft")}>
            <Save /> Save draft
          </Button>
          <Button disabled={!student || !body.trim() || !reviewed} onClick={() => save("completed")}>
            I sent it — log contact
          </Button>
        </div>
      </div>
    </div>
  );
}
