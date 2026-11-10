import type { AttendanceRecord, AttendanceStatus, Communication, InterventionPlan, InterventionProgress, Observation, StudentNote } from "@/lib/types";
import { ASSESSMENT_LABELS, CONTACT_TYPE_LABELS, INTERVENTION_STATUS_LABELS, PURPOSE_LABELS } from "@/lib/labels";

export type EventType = "observation" | "attendance" | "note" | "intervention" | "communication";

export interface TimelineEvent {
  id: string;
  type: EventType;
  at: string; // ISO timestamp used for ordering
  classId: string | null;
  title: string;
  detail?: string | null;
  kind?: Observation["kind"];
  color: string;
  ref: { table: string; id: string };
}

/** Merge a student's records into one reverse-chronological timeline. */
export function buildTimeline(input: {
  observations: Observation[];
  attendance: AttendanceRecord[];
  statuses: Map<string, AttendanceStatus>;
  notes: StudentNote[];
  plans: InterventionPlan[];
  progress: InterventionProgress[];
  communications: Communication[];
  includePresent?: boolean;
}): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  for (const o of input.observations) {
    ev.push({
      id: `o-${o.id}`,
      type: "observation",
      at: o.observed_at,
      classId: o.class_id,
      title: o.behavior_label,
      detail: [o.note, o.context && `Context: ${o.context}`, o.intervention_used && `Intervention: ${o.intervention_used}`].filter(Boolean).join(" · ") || null,
      kind: o.kind,
      color: o.kind === "positive" ? "emerald" : o.kind === "redirection" ? "amber" : "blue",
      ref: { table: "observations", id: o.id },
    });
  }
  for (const a of input.attendance) {
    const st = input.statuses.get(a.status_id);
    if (!st || (st.counts_as === "present" && !input.includePresent)) continue;
    ev.push({
      id: `a-${a.id}`,
      type: "attendance",
      // Attendance is a date; place it at local noon so it sorts within the day.
      at: new Date(`${a.date}T12:00:00`).toISOString(),
      classId: a.class_id,
      title: `Attendance: ${st.label}`,
      detail: a.note,
      color: st.color,
      ref: { table: "attendance_records", id: a.id },
    });
  }
  for (const n of input.notes) {
    ev.push({ id: `n-${n.id}`, type: "note", at: n.created_at, classId: n.class_id, title: "Teacher note", detail: n.body, color: "slate", ref: { table: "student_notes", id: n.id } });
  }
  const planById = new Map(input.plans.map((p) => [p.id, p]));
  for (const p of input.plans) {
    ev.push({
      id: `i-${p.id}`,
      type: "intervention",
      at: new Date(`${p.start_date}T08:00:00`).toISOString(),
      classId: p.class_id,
      title: `Intervention plan: ${p.target_behavior}`,
      detail: `${p.strategy_name} · ${INTERVENTION_STATUS_LABELS[p.status]}`,
      color: "violet",
      ref: { table: "intervention_plans", id: p.id },
    });
  }
  for (const pr of input.progress) {
    const p = planById.get(pr.plan_id);
    if (!p) continue;
    ev.push({
      id: `ip-${pr.id}`,
      type: "intervention",
      at: new Date(`${pr.entry_date}T15:00:00`).toISOString(),
      classId: p.class_id,
      title: `Intervention review: ${ASSESSMENT_LABELS[pr.assessment]}`,
      detail: [p.target_behavior, pr.note].filter(Boolean).join(" — "),
      color: "violet",
      ref: { table: "intervention_progress", id: pr.id },
    });
  }
  for (const c of input.communications) {
    ev.push({
      id: `c-${c.id}`,
      type: "communication",
      at: c.occurred_at,
      classId: null,
      title: `${CONTACT_TYPE_LABELS[c.contact_type]}: ${PURPOSE_LABELS[c.purpose]}`,
      detail: [c.recipient && `With ${c.recipient}`, c.summary].filter(Boolean).join(" — "),
      color: "cyan",
      ref: { table: "communications", id: c.id },
    });
  }
  return ev.sort((a, b) => b.at.localeCompare(a.at));
}
