import type { NewRow, ObservationKind } from "@/lib/types";
import type { Store } from "@/lib/data/store";
import { uuid } from "@/lib/utils";

/** Editable starter configuration given to every new teacher. */

export const DEFAULT_CATEGORIES: { name: string; kind: ObservationKind; color: string; behaviors: string[] }[] = [
  {
    name: "Positive",
    kind: "positive",
    color: "emerald",
    behaviors: [
      "Demonstrated leadership",
      "Helped another student",
      "Strong collaboration",
      "Demonstrated persistence",
      "Improved focus",
      "Followed directions",
    ],
  },
  {
    name: "Redirection",
    kind: "redirection",
    color: "amber",
    behaviors: [
      "Off task",
      "Phone use",
      "Disruptive behavior",
      "Unprepared",
      "Inappropriate language",
      "Difficulty following directions",
    ],
  },
  {
    name: "Engagement",
    kind: "engagement",
    color: "blue",
    behaviors: [
      "Active participation",
      "Asked a meaningful question",
      "Completed assigned task",
      "Demonstrated understanding",
      "Needs additional support",
    ],
  },
];

export const DEFAULT_ATTENDANCE_STATUSES = [
  { code: "P", label: "Present", counts_as: "present", color: "emerald" },
  { code: "A", label: "Absent", counts_as: "absent", color: "rose" },
  { code: "T", label: "Tardy", counts_as: "tardy", color: "amber" },
  { code: "E", label: "Excused", counts_as: "excused", color: "blue" },
] as const;

export const DEFAULT_STRATEGIES: [string, string][] = [
  ["Preferential seating", "Seat the student where focus and access to support are easiest."],
  ["Proximity", "Move near the student during instruction as a quiet, non-verbal cue."],
  ["Private redirection", "Redirect quietly and individually rather than in front of peers."],
  ["Task chunking", "Break assignments into smaller steps with check points."],
  ["Structured check-ins", "Brief scheduled check-ins at the start or end of class."],
  ["Clear written instructions", "Provide written steps alongside verbal directions."],
  ["Positive reinforcement", "Specific, timely acknowledgement of the target behavior."],
  ["Student goal setting", "Student sets and reviews a short-term, measurable goal."],
  ["Adjusted group assignments", "Change group composition or roles to support success."],
  ["Student-teacher conference", "One-on-one conversation to discuss concerns and agree on next steps."],
];

export const DEFAULT_ROLES: [string, string][] = [
  ["Team Leader", "Keeps the team on track and coordinates work."],
  ["Materials Manager", "Collects, tracks and returns materials."],
  ["Recorder", "Records data, notes and decisions."],
  ["Facilitator", "Makes sure every voice is heard."],
  ["Reporter", "Shares the team's work with the class."],
  ["Safety Manager", "Monitors lab safety procedures and equipment."],
];

/** Placeholders: {student_first}, {student_name}, {teacher_name}, {class_name}, {observations}, {date} */
export const DEFAULT_TEMPLATES: { name: string; purpose: NewRow<"communication_templates">["purpose"]; subject: string; body: string }[] = [
  {
    name: "Positive recognition",
    purpose: "positive",
    subject: "Great things from {student_first} in {class_name}",
    body: "Hello,\n\nI wanted to share some positive news about {student_first}. Recently in {class_name}:\n\n{observations}\n\nThank you for your support at home.\n\n{teacher_name}",
  },
  {
    name: "Behavior concern",
    purpose: "concern",
    subject: "Checking in about {student_first} in {class_name}",
    body: "Hello,\n\nI'm reaching out to partner with you in supporting {student_first}. I've noticed the following in {class_name}:\n\n{observations}\n\nI'd welcome a conversation about how we can work together. Please let me know a good time to talk.\n\n{teacher_name}",
  },
  {
    name: "Missing assignments",
    purpose: "missing_work",
    subject: "Missing work in {class_name}",
    body: "Hello,\n\n{student_first} currently has assignments outstanding in {class_name}. [List assignments here.]\n\nStudents can submit work by [date]. I'm available for help during [time].\n\n{teacher_name}",
  },
  {
    name: "Attendance concern",
    purpose: "attendance",
    subject: "Attendance in {class_name}",
    body: "Hello,\n\nI wanted to let you know that my classroom records show {student_first} has missed or arrived late to several {class_name} classes recently.\n\n{observations}\n\nThese are my classroom notes, not the school's official attendance record. Please reach out if there is anything I should know.\n\n{teacher_name}",
  },
  {
    name: "Student improvement",
    purpose: "improvement",
    subject: "{student_first}'s progress in {class_name}",
    body: "Hello,\n\nI'm happy to share that {student_first} has been making real progress in {class_name}:\n\n{observations}\n\nPlease pass on my congratulations!\n\n{teacher_name}",
  },
  {
    name: "Conference invitation",
    purpose: "conference",
    subject: "Conference request: {student_first}",
    body: "Hello,\n\nI'd like to invite you to a conference to discuss {student_first}'s progress in {class_name}. Would any of the following times work for you?\n\n- [Option 1]\n- [Option 2]\n\n{teacher_name}",
  },
  {
    name: "Follow-up",
    purpose: "follow_up",
    subject: "Following up: {student_first}",
    body: "Hello,\n\nThank you for speaking with me on {date}. As a follow-up:\n\n[Summary and next steps]\n\n{teacher_name}",
  },
];

export function defaultConfigRows() {
  const categories: NewRow<"observation_categories">[] = [];
  const behaviors: NewRow<"observation_behaviors">[] = [];
  DEFAULT_CATEGORIES.forEach((c, i) => {
    const id = uuid();
    categories.push({ id, name: c.name, kind: c.kind, color: c.color, sort_order: i, is_active: true });
    c.behaviors.forEach((label, j) =>
      behaviors.push({ id: uuid(), category_id: id, label, is_quick: true, sort_order: j, is_active: true }),
    );
  });
  return {
    categories,
    behaviors,
    statuses: DEFAULT_ATTENDANCE_STATUSES.map((s, i) => ({ id: uuid(), ...s, sort_order: i, is_active: true })) as NewRow<"attendance_statuses">[],
    strategies: DEFAULT_STRATEGIES.map(([name, description]) => ({ id: uuid(), name, description, is_active: true })) as NewRow<"intervention_strategies">[],
    roles: DEFAULT_ROLES.map(([name, description], i) => ({ id: uuid(), name, description, sort_order: i, is_active: true })) as NewRow<"team_roles">[],
    templates: DEFAULT_TEMPLATES.map((t) => ({ id: uuid(), ...t })) as NewRow<"communication_templates">[],
  };
}

/** Create starter configuration for any section the teacher has never set up. */
export async function ensureDefaults(store: Store) {
  const tables = ["observation_categories", "attendance_statuses", "intervention_strategies", "team_roles", "communication_templates"] as const;
  await Promise.all(tables.map((t) => store.ensure(t)));
  for (const t of tables) {
    if (store.get(t).status !== "ready") return; // don't seed on top of a failed load
  }
  const d = defaultConfigRows();
  if (store.rows("observation_categories").length === 0) {
    await store.insert("observation_categories", d.categories);
    await store.insert("observation_behaviors", d.behaviors);
  }
  if (store.rows("attendance_statuses").length === 0) await store.insert("attendance_statuses", d.statuses);
  if (store.rows("intervention_strategies").length === 0) await store.insert("intervention_strategies", d.strategies);
  if (store.rows("team_roles").length === 0) await store.insert("team_roles", d.roles);
  if (store.rows("communication_templates").length === 0) await store.insert("communication_templates", d.templates);
}
