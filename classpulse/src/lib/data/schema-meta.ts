import type { TableName } from "@/lib/types";

/**
 * Relationship and uniqueness metadata mirroring the SQL migrations.
 * The demo adapter uses this to behave like the database (cascades,
 * unique constraints); tests assert both stay in sync.
 */
export interface ForeignKey {
  column: string;
  parent: TableName;
  onDelete: "cascade" | "set null" | "restrict";
}

export const FOREIGN_KEYS: Partial<Record<TableName, ForeignKey[]>> = {
  terms: [{ column: "academic_year_id", parent: "academic_years", onDelete: "cascade" }],
  classes: [
    { column: "academic_year_id", parent: "academic_years", onDelete: "set null" },
    { column: "term_id", parent: "terms", onDelete: "set null" },
    { column: "default_layout_id", parent: "seating_layouts", onDelete: "set null" },
  ],
  enrollments: [
    { column: "class_id", parent: "classes", onDelete: "cascade" },
    { column: "student_id", parent: "students", onDelete: "cascade" },
  ],
  student_notes: [
    { column: "student_id", parent: "students", onDelete: "cascade" },
    { column: "class_id", parent: "classes", onDelete: "set null" },
  ],
  seating_layouts: [{ column: "class_id", parent: "classes", onDelete: "cascade" }],
  seats: [
    { column: "layout_id", parent: "seating_layouts", onDelete: "cascade" },
    { column: "student_id", parent: "students", onDelete: "set null" },
  ],
  attendance_records: [
    { column: "class_id", parent: "classes", onDelete: "cascade" },
    { column: "student_id", parent: "students", onDelete: "cascade" },
    { column: "status_id", parent: "attendance_statuses", onDelete: "restrict" },
  ],
  observation_behaviors: [{ column: "category_id", parent: "observation_categories", onDelete: "cascade" }],
  observations: [
    { column: "student_id", parent: "students", onDelete: "cascade" },
    { column: "class_id", parent: "classes", onDelete: "cascade" },
    { column: "category_id", parent: "observation_categories", onDelete: "set null" },
    { column: "behavior_id", parent: "observation_behaviors", onDelete: "set null" },
    { column: "group_id", parent: "groups", onDelete: "set null" },
  ],
  intervention_plans: [
    { column: "student_id", parent: "students", onDelete: "cascade" },
    { column: "class_id", parent: "classes", onDelete: "set null" },
    { column: "strategy_id", parent: "intervention_strategies", onDelete: "set null" },
  ],
  intervention_progress: [{ column: "plan_id", parent: "intervention_plans", onDelete: "cascade" }],
  communications: [{ column: "student_id", parent: "students", onDelete: "cascade" }],
  group_sets: [{ column: "class_id", parent: "classes", onDelete: "cascade" }],
  groups: [{ column: "group_set_id", parent: "group_sets", onDelete: "cascade" }],
  group_memberships: [
    { column: "group_id", parent: "groups", onDelete: "cascade" },
    { column: "student_id", parent: "students", onDelete: "cascade" },
    { column: "role_id", parent: "team_roles", onDelete: "set null" },
  ],
  group_observations: [{ column: "group_id", parent: "groups", onDelete: "cascade" }],
  projects: [
    { column: "class_id", parent: "classes", onDelete: "cascade" },
    { column: "group_set_id", parent: "group_sets", onDelete: "set null" },
  ],
  project_tasks: [
    { column: "project_id", parent: "projects", onDelete: "cascade" },
    { column: "group_id", parent: "groups", onDelete: "set null" },
  ],
  reminders: [
    { column: "student_id", parent: "students", onDelete: "cascade" },
    { column: "class_id", parent: "classes", onDelete: "set null" },
  ],
};

/** Unique constraints (beyond the primary key). Partial indexes ignore null values. */
export const UNIQUE_KEYS: Partial<Record<TableName, string[][]>> = {
  enrollments: [["class_id", "student_id"]],
  attendance_records: [["class_id", "student_id", "date"]],
  attendance_statuses: [["code"]],
  seats: [["layout_id", "student_id"]],
  group_memberships: [["group_id", "student_id"]],
  students: [["school_student_id"]],
};
