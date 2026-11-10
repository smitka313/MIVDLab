import type {
  AttendanceRecord,
  AttendanceStatus,
  ClassSection,
  Communication,
  Enrollment,
  Group,
  GroupMembership,
  GroupObservation,
  GroupSet,
  InterventionPlan,
  InterventionProgress,
  Observation,
  ObservationKind,
  Student,
  StudentNote,
  TeamRole,
} from "@/lib/types";
import { ACTIVITY_LABELS, ASSESSMENT_LABELS, COMM_STATUS_LABELS, CONTACT_TYPE_LABELS, DIMENSION_LABELS, INTERVENTION_STATUS_LABELS, KIND_LABELS, PURPOSE_LABELS } from "@/lib/labels";
import { countKinds, percent, schoolDaysWithoutAttendance, summarizeAttendance } from "@/lib/stats";
import { byName, countBy, displayName, isoDateOf } from "@/lib/utils";

/**
 * Report builders. Every number comes from stored records passed in; nothing
 * is estimated or hard-coded. Each report states its data limitations.
 */

export interface ReportData {
  students: Student[];
  classes: ClassSection[];
  enrollments: Enrollment[];
  observations: Observation[];
  attendance: AttendanceRecord[];
  statuses: AttendanceStatus[];
  plans: InterventionPlan[];
  progress: InterventionProgress[];
  communications: Communication[];
  notes: StudentNote[];
  groupSets: GroupSet[];
  groups: Group[];
  memberships: GroupMembership[];
  groupObservations: GroupObservation[];
  roles: TeamRole[];
}

export interface ReportFilters {
  from: string;
  to: string;
  classId?: string;
  studentId?: string;
  kind?: ObservationKind | "";
  activity?: string;
  interventionStatus?: string;
  includeNotes?: boolean;
}

export type Section =
  | { type: "stats"; heading?: string; items: { label: string; value: string | number }[] }
  | { type: "table"; heading?: string; headers: string[]; rows: (string | number)[][]; empty?: string }
  | { type: "text"; heading?: string; body: string }
  | { type: "list"; heading?: string; items: string[]; empty?: string };

export interface ReportDoc {
  title: string;
  subtitle: string;
  sections: Section[];
  notes: string[];
  csv: { headers: string[]; rows: (string | number | null)[][] };
}

export const REPORT_TYPES = {
  student: "Individual student summary",
  class: "Class behavior summary",
  attendance: "Attendance report",
  recognition: "Positive recognition report",
  interventions: "Intervention progress report",
  conference: "Parent conference preparation",
  admin: "Administrative documentation",
  groups: "Group participation report",
} as const;
export type ReportType = keyof typeof REPORT_TYPES;

export const NEEDS_STUDENT: ReportType[] = ["student", "conference", "admin"];

const COUNT_CAVEAT = "Observation counts reflect what the teacher recorded. They are not objective measures of behavior and depend on how often observations were documented.";

function ctx(data: ReportData, f: ReportFilters) {
  const students = new Map(data.students.map((s) => [s.id, s]));
  const classes = new Map(data.classes.map((c) => [c.id, c]));
  const statuses = new Map(data.statuses.map((s) => [s.id, s]));
  const inDates = (d: string) => d >= f.from && d <= f.to;
  const obs = data.observations.filter(
    (o) =>
      inDates(isoDateOf(o.observed_at)) &&
      (!f.classId || o.class_id === f.classId) &&
      (!f.studentId || o.student_id === f.studentId) &&
      (!f.kind || o.kind === f.kind) &&
      (!f.activity || o.activity === f.activity),
  );
  const att = data.attendance.filter((a) => inDates(a.date) && (!f.classId || a.class_id === f.classId) && (!f.studentId || a.student_id === f.studentId));
  const sName = (id: string) => (students.get(id) ? displayName(students.get(id)!) : "Unknown student");
  const cName = (id: string | null) => (id && classes.get(id) ? `P${classes.get(id)!.period} ${classes.get(id)!.course_name}` : "—");
  const range = `${f.from} to ${f.to}`;
  return { students, classes, statuses, obs, att, sName, cName, range, inDates };
}

function obsTable(obs: Observation[], c: ReturnType<typeof ctx>, withStudent: boolean) {
  const sorted = [...obs].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  return {
    headers: [...(withStudent ? ["Student"] : []), "Date/time", "Class", "Type", "Behavior", "Activity", "Context / note"],
    rows: sorted.map((o) => [
      ...(withStudent ? [c.sName(o.student_id)] : []),
      new Date(o.observed_at).toLocaleString(),
      c.cName(o.class_id),
      KIND_LABELS[o.kind],
      o.behavior_label,
      o.activity ? ACTIVITY_LABELS[o.activity] : "",
      [o.context, o.intervention_used && `Intervention: ${o.intervention_used}`, o.note].filter(Boolean).join(" · "),
    ]),
  };
}

export function buildReport(type: ReportType, data: ReportData, f: ReportFilters): ReportDoc {
  const c = ctx(data, f);
  const notes: string[] = [];

  if (NEEDS_STUDENT.includes(type) && !f.studentId) {
    return { title: REPORT_TYPES[type], subtitle: "Choose a student to build this report.", sections: [], notes: [], csv: { headers: [], rows: [] } };
  }

  switch (type) {
    case "student":
    case "conference":
    case "admin": {
      const s = c.students.get(f.studentId!)!;
      const k = countKinds(c.obs);
      const a = summarizeAttendance(c.att, c.statuses);
      const plans = data.plans.filter((p) => p.student_id === s.id && (!f.interventionStatus || p.status === f.interventionStatus));
      const comms = data.communications.filter((x) => x.student_id === s.id && c.inDates(isoDateOf(x.occurred_at)));
      const enrolled = data.enrollments.filter((e) => e.student_id === s.id && !e.dropped_at).map((e) => c.cName(e.class_id));
      const t = obsTable(c.obs, c, false);
      const sections: Section[] = [
        {
          type: "stats",
          items: [
            { label: "Attendance (recorded days)", value: `${percent(a.rate)} of ${a.total}` },
            { label: "Absences / tardies", value: `${a.absent} / ${a.tardy}` },
            { label: "Positive", value: k.positive },
            { label: "Engagement", value: k.engagement },
            { label: "Redirections", value: k.redirection },
          ],
        },
        { type: "text", heading: "Student", body: `${displayName(s)}${s.grade_level ? ` · Grade ${s.grade_level}` : ""}${s.school_student_id ? ` · ID ${s.school_student_id}` : ""}\nClasses: ${enrolled.join(", ") || "—"}` },
      ];
      if (type === "conference") {
        const strengths = Object.entries(countBy(c.obs.filter((o) => o.kind !== "redirection"), (o) => o.behavior_label)).sort((x, y) => y[1] - x[1]).slice(0, 5);
        const concerns = Object.entries(countBy(c.obs.filter((o) => o.kind === "redirection"), (o) => o.behavior_label)).sort((x, y) => y[1] - x[1]).slice(0, 5);
        sections.push({ type: "list", heading: "Strengths observed", items: strengths.map(([l, n]) => `${l} (${n} recorded)`), empty: "None recorded in this period." });
        sections.push({ type: "list", heading: "Areas for growth", items: concerns.map(([l, n]) => `${l} (${n} recorded)`), empty: "None recorded in this period." });
        sections.push({ type: "list", heading: "Current supports", items: plans.filter((p) => ["active", "under_review", "planned"].includes(p.status)).map((p) => `${p.strategy_name} — ${p.target_behavior} (${INTERVENTION_STATUS_LABELS[p.status]})`), empty: "No active intervention plans." });
        sections.push({ type: "list", heading: "Discussion points / questions for family", items: ["", "", ""].map(() => "______________________________________________") });
      }
      sections.push({ type: "table", heading: type === "conference" ? "Recent examples" : "Observations", ...t, empty: "No observations in this period." });
      if (type !== "conference" || plans.length) {
        sections.push({
          type: "table",
          heading: "Intervention plans",
          headers: ["Target", "Strategy", "Start", "Review", "Status", "Reviews"],
          rows: plans.map((p) => {
            const entries = data.progress.filter((e) => e.plan_id === p.id).sort((x, y) => x.entry_date.localeCompare(y.entry_date));
            return [p.target_behavior, p.strategy_name, p.start_date, p.review_date ?? "", INTERVENTION_STATUS_LABELS[p.status], entries.map((e) => `${e.entry_date}: ${ASSESSMENT_LABELS[e.assessment]}${e.note ? ` — ${e.note}` : ""}`).join("\n")];
          }),
          empty: "No intervention plans.",
        });
      }
      if (type !== "student" || comms.length) {
        sections.push({
          type: "table",
          heading: "Communication",
          headers: ["Date", "Type", "With", "Purpose", "Summary", "Status"],
          rows: comms.sort((x, y) => x.occurred_at.localeCompare(y.occurred_at)).map((x) => [new Date(x.occurred_at).toLocaleDateString(), CONTACT_TYPE_LABELS[x.contact_type], x.recipient ?? "", PURPOSE_LABELS[x.purpose], x.summary ?? "", COMM_STATUS_LABELS[x.status]]),
          empty: "No contacts logged in this period.",
        });
      }
      if (type === "admin") {
        const absences = c.att.filter((r) => ["absent", "tardy", "excused"].includes(c.statuses.get(r.status_id)?.counts_as ?? "")).sort((x, y) => x.date.localeCompare(y.date));
        sections.push({ type: "table", heading: "Attendance exceptions", headers: ["Date", "Class", "Status", "Note"], rows: absences.map((r) => [r.date, c.cName(r.class_id), c.statuses.get(r.status_id)?.label ?? "", r.note ?? ""]), empty: "None." });
        if (f.includeNotes) {
          const ns = data.notes.filter((n) => n.student_id === s.id && c.inDates(isoDateOf(n.created_at))).sort((x, y) => x.created_at.localeCompare(y.created_at));
          sections.push({ type: "table", heading: "Teacher notes (private — included by choice)", headers: ["Date", "Note"], rows: ns.map((n) => [new Date(n.created_at).toLocaleDateString(), n.body]), empty: "None." });
        }
        notes.push("Prepared from classroom records in ClassPulse. Attendance shown is the teacher's classroom record, not the official school record.");
      }
      notes.push(COUNT_CAVEAT);
      if (!c.att.length) notes.push("No attendance was recorded for this student in the selected period.");
      return { title: REPORT_TYPES[type], subtitle: `${displayName(s)} · ${c.range}`, sections, notes, csv: t };
    }

    case "class": {
      const classIds = f.classId ? [f.classId] : data.classes.filter((x) => !x.archived_at).map((x) => x.id);
      const rows: (string | number)[][] = [];
      for (const id of classIds) {
        const roster = data.enrollments.filter((e) => e.class_id === id && !e.dropped_at).map((e) => c.students.get(e.student_id)).filter(Boolean) as Student[];
        for (const s of roster.sort(byName)) {
          const k = countKinds(c.obs.filter((o) => o.student_id === s.id && o.class_id === id));
          rows.push([c.cName(id), displayName(s), k.positive, k.engagement, k.redirection, k.positive + k.engagement + k.redirection]);
        }
      }
      const k = countKinds(c.obs);
      const byCat = Object.entries(countBy(c.obs, (o) => `${KIND_LABELS[o.kind]}: ${o.behavior_label}`)).sort((a, b) => b[1] - a[1]);
      const byAct = Object.entries(countBy(c.obs, (o) => (o.activity ? ACTIVITY_LABELS[o.activity] : "Not recorded"))).sort((a, b) => b[1] - a[1]);
      const none = rows.filter((r) => r[5] === 0).length;
      notes.push(COUNT_CAVEAT);
      if (none) notes.push(`${none} student${none === 1 ? " has" : "s have"} no observations recorded in this period.`);
      return {
        title: REPORT_TYPES.class,
        subtitle: `${f.classId ? c.cName(f.classId) : "All classes"} · ${c.range}`,
        sections: [
          { type: "stats", items: [{ label: "Observations", value: c.obs.length }, { label: "Positive", value: k.positive }, { label: "Engagement", value: k.engagement }, { label: "Redirections", value: k.redirection }] },
          { type: "table", heading: "Most frequent behaviors", headers: ["Behavior", "Count"], rows: byCat.slice(0, 15), empty: "None." },
          { type: "table", heading: "By instructional activity", headers: ["Activity", "Count"], rows: byAct, empty: "None." },
          { type: "table", heading: "By student", headers: ["Class", "Student", "Positive", "Engagement", "Redirection", "Total"], rows, empty: "No students." },
        ],
        notes,
        csv: { headers: ["Class", "Student", "Positive", "Engagement", "Redirection", "Total"], rows },
      };
    }

    case "attendance": {
      const classIds = f.classId ? [f.classId] : data.classes.filter((x) => !x.archived_at).map((x) => x.id);
      const rows: (string | number)[][] = [];
      for (const id of classIds) {
        const roster = data.enrollments.filter((e) => e.class_id === id && !e.dropped_at && (!f.studentId || e.student_id === f.studentId)).map((e) => c.students.get(e.student_id)).filter(Boolean) as Student[];
        for (const s of roster.sort(byName)) {
          const a = summarizeAttendance(c.att.filter((r) => r.student_id === s.id && r.class_id === id), c.statuses);
          rows.push([c.cName(id), displayName(s), a.total, a.present, a.tardy, a.absent, a.excused, percent(a.rate)]);
        }
      }
      const total = summarizeAttendance(c.att, c.statuses);
      const missing = classIds.map((id) => [c.cName(id), schoolDaysWithoutAttendance(c.att.filter((r) => r.class_id === id), f.from, f.to).length] as [string, number]).filter(([, n]) => n > 0);
      notes.push("ClassPulse attendance is the teacher's classroom record. It is not the school's official attendance record and is not synchronized with any school information system.");
      if (missing.length) notes.push(`Weekdays with no attendance recorded: ${missing.map(([n, d]) => `${n} (${d})`).join(", ")}. These may be holidays or days attendance wasn't taken.`);
      const headers = ["Class", "Student", "Recorded days", "Present", "Tardy", "Absent", "Excused", "Rate"];
      return {
        title: REPORT_TYPES.attendance,
        subtitle: `${f.classId ? c.cName(f.classId) : "All classes"} · ${c.range}`,
        sections: [
          { type: "stats", items: [{ label: "Records", value: total.total }, { label: "Attendance rate", value: percent(total.rate) }, { label: "Absences", value: total.absent }, { label: "Tardies", value: total.tardy }, { label: "Excused", value: total.excused }] },
          { type: "table", headers, rows, empty: "No students." },
        ],
        notes,
        csv: { headers, rows },
      };
    }

    case "recognition": {
      const pos = c.obs.filter((o) => o.kind === "positive" || o.kind === "engagement");
      const by = Object.entries(countBy(pos, (o) => o.student_id)).sort((a, b) => b[1] - a[1]);
      // Students in scope with no recognition recorded — useful to make sure nobody is overlooked.
      const scope = data.enrollments.filter((e) => !e.dropped_at && (!f.classId || e.class_id === f.classId)).map((e) => e.student_id);
      const overlooked = [...new Set(scope)].filter((id) => !by.some(([sid]) => sid === id)).map((id) => c.sName(id)).sort();
      const t = obsTable(pos, c, true);
      notes.push(COUNT_CAVEAT);
      return {
        title: REPORT_TYPES.recognition,
        subtitle: `${f.classId ? c.cName(f.classId) : "All classes"} · ${c.range}`,
        sections: [
          { type: "stats", items: [{ label: "Positive & engagement observations", value: pos.length }, { label: "Students recognized", value: by.length }, { label: "Students with none recorded", value: overlooked.length }] },
          { type: "list", heading: "Students with no positive observations recorded (consider looking for strengths)", items: overlooked, empty: "Every student in scope has at least one." },
          { type: "table", heading: "Recognition log", ...t, empty: "None recorded." },
        ],
        notes,
        csv: t,
      };
    }

    case "interventions": {
      const plans = data.plans.filter((p) => (!f.studentId || p.student_id === f.studentId) && (!f.classId || p.class_id === f.classId) && (!f.interventionStatus || p.status === f.interventionStatus));
      const headers = ["Student", "Class", "Target", "Strategy", "Start", "Review", "Status", "Latest review", "Redirections before (4 wks)", "Redirections since start"];
      const rows = plans.map((p) => {
        const entries = data.progress.filter((e) => e.plan_id === p.id).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
        const sObs = data.observations.filter((o) => o.student_id === p.student_id && o.kind === "redirection" && (!p.class_id || o.class_id === p.class_id));
        const startMs = new Date(`${p.start_date}T00:00:00`).getTime();
        const before = sObs.filter((o) => {
          const t = new Date(o.observed_at).getTime();
          return t < startMs && t >= startMs - 28 * 86400000;
        }).length;
        const after = sObs.filter((o) => new Date(o.observed_at).getTime() >= startMs).length;
        return [c.sName(p.student_id), c.cName(p.class_id), p.target_behavior, p.strategy_name, p.start_date, p.review_date ?? "", INTERVENTION_STATUS_LABELS[p.status], entries[0] ? `${entries[0].entry_date}: ${ASSESSMENT_LABELS[entries[0].assessment]}` : "None", before, after];
      });
      const byStatus = countBy(plans, (p) => INTERVENTION_STATUS_LABELS[p.status]);
      notes.push("“Before” covers the 4 weeks before each plan's start date; “since start” runs to today and may cover a different length of time.");
      notes.push(COUNT_CAVEAT);
      return {
        title: REPORT_TYPES.interventions,
        subtitle: f.studentId ? c.sName(f.studentId) : f.classId ? c.cName(f.classId) : "All students",
        sections: [{ type: "stats", items: Object.entries(byStatus).map(([label, value]) => ({ label, value })) }, { type: "table", headers, rows, empty: "No plans match." }],
        notes,
        csv: { headers, rows },
      };
    }

    case "groups": {
      const sets = data.groupSets.filter((s) => !s.archived_at && (!f.classId || s.class_id === f.classId));
      const roles = new Map(data.roles.map((r) => [r.id, r.name]));
      const headers = ["Class", "Configuration", "Group", "Student", "Role", "Individual observations in period"];
      const rows: (string | number)[][] = [];
      const gRows: (string | number)[][] = [];
      for (const set of sets) {
        for (const g of data.groups.filter((x) => x.group_set_id === set.id).sort((a, b) => a.sort_order - b.sort_order)) {
          for (const m of data.memberships.filter((x) => x.group_id === g.id)) {
            const n = c.obs.filter((o) => o.student_id === m.student_id && o.class_id === set.class_id).length;
            rows.push([c.cName(set.class_id), set.name, g.name, c.sName(m.student_id), m.role_id ? roles.get(m.role_id) ?? "" : "", n]);
          }
          for (const o of data.groupObservations.filter((x) => x.group_id === g.id && c.inDates(isoDateOf(x.observed_at)))) {
            gRows.push([c.cName(set.class_id), g.name, new Date(o.observed_at).toLocaleDateString(), DIMENSION_LABELS[o.dimension], o.note ?? ""]);
          }
        }
      }
      notes.push("Individual contributions are shown only as observations recorded for each student; they are not inferred from group results.");
      return {
        title: REPORT_TYPES.groups,
        subtitle: `${f.classId ? c.cName(f.classId) : "All classes"} · ${c.range}`,
        sections: [
          { type: "table", heading: "Group observations", headers: ["Class", "Group", "Date", "Dimension", "Note"], rows: gRows, empty: "No group observations in this period." },
          { type: "table", heading: "Membership and roles", headers, rows, empty: "No groups." },
        ],
        notes,
        csv: { headers, rows },
      };
    }
  }
}
