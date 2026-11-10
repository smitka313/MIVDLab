"use client";

import * as React from "react";
import { useRows } from "@/components/providers/data-provider";
import { useStudentMap } from "@/lib/hooks";
import { PURPOSE_LABELS } from "@/lib/labels";
import { displayName, isoDateOf } from "@/lib/utils";

export interface ActionItem {
  id: string;
  source: "reminder" | "intervention_review" | "communication_follow_up" | "observation_follow_up";
  title: string;
  date: string | null;
  href: string;
  studentName?: string;
}

/**
 * Everything that needs the teacher's attention: open reminders plus items
 * derived from records (intervention reviews, pending contact follow-ups,
 * observations flagged for follow-up).
 */
export function useActionItems() {
  const reminders = useRows("reminders");
  const plans = useRows("intervention_plans");
  const comms = useRows("communications");
  const observations = useRows("observations");
  const students = useStudentMap();
  return React.useMemo(() => {
    const name = (id: string | null) => (id && students.get(id) ? displayName(students.get(id)!) : undefined);
    const items: ActionItem[] = [];
    for (const r of reminders.rows) if (!r.completed_at) items.push({ id: `r-${r.id}`, source: "reminder", title: r.title, date: r.due_date, href: "/tasks", studentName: name(r.student_id) });
    for (const p of plans.rows) {
      if ((p.status === "active" || p.status === "under_review") && p.review_date) {
        // Skip if an explicit reminder already covers this review.
        const covered = reminders.rows.some((r) => !r.completed_at && r.kind === "intervention_review" && r.student_id === p.student_id && r.due_date === p.review_date);
        if (!covered) items.push({ id: `p-${p.id}`, source: "intervention_review", title: `Review intervention: ${p.target_behavior}`, date: p.review_date, href: `/interventions/${p.id}`, studentName: name(p.student_id) });
      }
    }
    for (const c of comms.rows) {
      if (c.status === "follow_up_pending") {
        const covered = reminders.rows.some((r) => !r.completed_at && r.kind === "parent_contact" && r.student_id === c.student_id);
        if (!covered) items.push({ id: `c-${c.id}`, source: "communication_follow_up", title: `Follow up: ${PURPOSE_LABELS[c.purpose]}`, date: c.follow_up_date, href: "/communication", studentName: name(c.student_id) });
      }
      if (c.status === "draft") items.push({ id: `d-${c.id}`, source: "communication_follow_up", title: "Finish draft message", date: isoDateOf(c.occurred_at), href: "/communication", studentName: name(c.student_id) });
    }
    for (const o of observations.rows) {
      if (o.follow_up_required) items.push({ id: `o-${o.id}`, source: "observation_follow_up", title: `Follow up on: ${o.behavior_label}`, date: isoDateOf(o.observed_at), href: `/students/${o.student_id}`, studentName: name(o.student_id) });
    }
    return items.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  }, [reminders.rows, plans.rows, comms.rows, observations.rows, students]);
}
