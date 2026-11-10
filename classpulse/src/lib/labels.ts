import type {
  Activity,
  AttendanceCountsAs,
  CommPurpose,
  CommStatus,
  ContactType,
  GroupDimension,
  InterventionStatus,
  ObservationKind,
  Priority,
  ProgressAssessment,
  ReminderKind,
  SeatKind,
} from "@/lib/types";

export const ACTIVITY_LABELS: Record<Activity, string> = {
  direct_instruction: "Direct instruction",
  independent_work: "Independent work",
  group_work: "Group work",
  lab_activity: "Laboratory activity",
  assessment: "Assessment",
  transition: "Transition",
  other: "Other",
};

export const KIND_LABELS: Record<ObservationKind, string> = {
  positive: "Positive",
  redirection: "Redirection",
  engagement: "Engagement",
};

export const COUNTS_AS_LABELS: Record<AttendanceCountsAs, string> = {
  present: "Present",
  absent: "Absent",
  tardy: "Tardy",
  excused: "Excused",
};

export const INTERVENTION_STATUS_LABELS: Record<InterventionStatus, string> = {
  planned: "Planned",
  active: "Active",
  under_review: "Under review",
  completed: "Completed",
  discontinued: "Discontinued",
};

export const ASSESSMENT_LABELS: Record<ProgressAssessment, string> = {
  helpful: "Appears helpful",
  needs_modification: "Needs modification",
  discontinue: "Should be discontinued",
  too_early: "Too early to tell",
};

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  email: "Email",
  phone: "Phone call",
  in_person: "In-person conference",
  virtual: "Virtual meeting",
  student_conversation: "Student conversation",
  other: "Other",
};

export const PURPOSE_LABELS: Record<CommPurpose, string> = {
  positive: "Positive recognition",
  concern: "Behavior concern",
  missing_work: "Missing assignments",
  attendance: "Attendance concern",
  improvement: "Student improvement",
  conference: "Conference invitation",
  follow_up: "Follow-up",
  other: "Other",
};

export const COMM_STATUS_LABELS: Record<CommStatus, string> = {
  draft: "Draft",
  completed: "Completed",
  follow_up_pending: "Follow-up pending",
  closed: "Closed",
};

export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  parent_contact: "Parent contact",
  conference: "Student conference",
  intervention_review: "Intervention review",
  documentation: "Documentation",
  general: "General",
};

export const PRIORITY_LABELS: Record<Priority, string> = { low: "Low", normal: "Normal", high: "High" };

export const SEAT_KIND_LABELS: Record<SeatKind, string> = {
  seat: "Student seat",
  teacher_desk: "Teacher desk",
  door: "Door",
  lab_bench: "Lab bench",
  table: "Table",
  board: "Board",
  window: "Window",
};

export const DIMENSION_LABELS: Record<GroupDimension, string> = {
  collaboration: "Collaboration",
  communication: "Communication",
  participation: "Participation",
  leadership: "Leadership",
  task_completion: "Task completion",
  problem_solving: "Problem-solving",
  challenge: "Group challenge",
};

/** Named accent colors -> literal Tailwind classes (so the compiler can see them). */
export const COLOR_NAMES = ["teal", "blue", "indigo", "violet", "rose", "amber", "emerald", "orange", "cyan", "slate"] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

export const COLOR_CLASSES: Record<string, { dot: string; soft: string; border: string; text: string }> = {
  teal: { dot: "bg-teal-500", soft: "bg-teal-50 dark:bg-teal-950/50", border: "border-teal-300 dark:border-teal-800", text: "text-teal-700 dark:text-teal-300" },
  blue: { dot: "bg-blue-500", soft: "bg-blue-50 dark:bg-blue-950/50", border: "border-blue-300 dark:border-blue-800", text: "text-blue-700 dark:text-blue-300" },
  indigo: { dot: "bg-indigo-500", soft: "bg-indigo-50 dark:bg-indigo-950/50", border: "border-indigo-300 dark:border-indigo-800", text: "text-indigo-700 dark:text-indigo-300" },
  violet: { dot: "bg-violet-500", soft: "bg-violet-50 dark:bg-violet-950/50", border: "border-violet-300 dark:border-violet-800", text: "text-violet-700 dark:text-violet-300" },
  rose: { dot: "bg-rose-500", soft: "bg-rose-50 dark:bg-rose-950/50", border: "border-rose-300 dark:border-rose-800", text: "text-rose-700 dark:text-rose-300" },
  amber: { dot: "bg-amber-500", soft: "bg-amber-50 dark:bg-amber-950/50", border: "border-amber-300 dark:border-amber-800", text: "text-amber-800 dark:text-amber-300" },
  emerald: { dot: "bg-emerald-500", soft: "bg-emerald-50 dark:bg-emerald-950/50", border: "border-emerald-300 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-300" },
  orange: { dot: "bg-orange-500", soft: "bg-orange-50 dark:bg-orange-950/50", border: "border-orange-300 dark:border-orange-800", text: "text-orange-700 dark:text-orange-300" },
  cyan: { dot: "bg-cyan-500", soft: "bg-cyan-50 dark:bg-cyan-950/50", border: "border-cyan-300 dark:border-cyan-800", text: "text-cyan-700 dark:text-cyan-300" },
  slate: { dot: "bg-slate-500", soft: "bg-slate-100 dark:bg-slate-800/60", border: "border-slate-300 dark:border-slate-700", text: "text-slate-700 dark:text-slate-300" },
};

export function colorClasses(name: string | null | undefined) {
  return COLOR_CLASSES[name ?? "slate"] ?? COLOR_CLASSES.slate;
}

export const KIND_COLOR: Record<ObservationKind, string> = {
  positive: "emerald",
  redirection: "amber",
  engagement: "blue",
};

export const COUNTS_AS_COLOR: Record<AttendanceCountsAs, string> = {
  present: "emerald",
  absent: "rose",
  tardy: "amber",
  excused: "blue",
};

export const STATUS_COLOR: Record<InterventionStatus, string> = { planned: "slate", active: "teal", under_review: "amber", completed: "emerald", discontinued: "rose" };
