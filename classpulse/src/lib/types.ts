// Row types mirroring supabase/migrations. Keep in sync with the SQL schema.

export type UUID = string;
/** Calendar date, `YYYY-MM-DD`, in the teacher's local time. */
export type ISODate = string;
/** Timestamp, ISO 8601. */
export type ISODateTime = string;

interface Owned {
  id: UUID;
  teacher_id: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type ObservationKind = "positive" | "redirection" | "engagement";
export type AttendanceCountsAs = "present" | "absent" | "tardy" | "excused";
export type Activity =
  | "direct_instruction"
  | "independent_work"
  | "group_work"
  | "lab_activity"
  | "assessment"
  | "transition"
  | "other";
export type InterventionStatus = "planned" | "active" | "under_review" | "completed" | "discontinued";
export type ProgressAssessment = "helpful" | "needs_modification" | "discontinue" | "too_early";
export type ContactType = "email" | "phone" | "in_person" | "virtual" | "student_conversation" | "other";
export type CommPurpose =
  | "positive"
  | "concern"
  | "missing_work"
  | "attendance"
  | "improvement"
  | "conference"
  | "follow_up"
  | "other";
export type CommStatus = "draft" | "completed" | "follow_up_pending" | "closed";
export type SeatKind = "seat" | "teacher_desk" | "door" | "lab_bench" | "table" | "board" | "window";
export type ReminderKind = "parent_contact" | "conference" | "intervention_review" | "documentation" | "general";
export type Priority = "low" | "normal" | "high";
export type GroupDimension =
  | "collaboration"
  | "communication"
  | "participation"
  | "leadership"
  | "task_completion"
  | "problem_solving"
  | "challenge";

export interface Profile {
  id: UUID;
  school_id: UUID | null;
  display_name: string;
  email: string | null;
  role: "teacher" | "school_admin";
  onboarded_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface UserPreferences {
  teacher_id: UUID;
  theme: "light" | "dark" | "system";
  date_format: "MM/dd/yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd";
  time_format: "12h" | "24h";
  dashboard_widgets: string[];
  notification_prefs: { in_app_reminders: boolean };
  retention_days: number | null;
  current_class_id: UUID | null;
  /** Saved phrases offered when writing a note. */
  note_templates: string[];
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface AcademicYear extends Owned {
  name: string;
  start_date: ISODate;
  end_date: ISODate;
  is_current: boolean;
}

export interface Term extends Owned {
  academic_year_id: UUID;
  name: string;
  start_date: ISODate;
  end_date: ISODate;
}

export interface ClassSection extends Owned {
  school_id: UUID | null;
  academic_year_id: UUID | null;
  term_id: UUID | null;
  course_name: string;
  period: string;
  period_order: number;
  room: string | null;
  meeting_days: string[];
  start_time: string | null;
  end_time: string | null;
  color: string;
  description: string | null;
  default_layout_id: UUID | null;
  archived_at: ISODateTime | null;
  /** Instructions printed in the substitute packet. */
  sub_notes: string | null;
}

export interface Student extends Owned {
  school_id: UUID | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  grade_level: number | null;
  school_student_id: string | null;
  photo_path: string | null;
  is_demo: boolean;
  archived_at: ISODateTime | null;
}

export interface Enrollment extends Owned {
  class_id: UUID;
  student_id: UUID;
  enrolled_at: ISODate;
  dropped_at: ISODate | null;
}

export interface StudentNote extends Owned {
  student_id: UUID;
  class_id: UUID | null;
  body: string;
  /** Include in the printable substitute packet. */
  share_with_sub: boolean;
}

export interface SeatingLayout extends Owned {
  class_id: UUID;
  name: string;
  arrangement: "rows" | "pods" | "tables" | "lab" | "custom";
  cols: number;
  rows: number;
}

export interface Seat extends Owned {
  layout_id: UUID;
  kind: SeatKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string | null;
  student_id: UUID | null;
}

export interface AttendanceStatus extends Owned {
  code: string;
  label: string;
  counts_as: AttendanceCountsAs;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface AttendanceRecord extends Owned {
  class_id: UUID;
  student_id: UUID;
  date: ISODate;
  status_id: UUID;
  note: string | null;
}

export interface ObservationCategory extends Owned {
  name: string;
  kind: ObservationKind;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface ObservationBehavior extends Owned {
  category_id: UUID;
  label: string;
  is_quick: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface Observation extends Owned {
  student_id: UUID;
  class_id: UUID;
  observed_at: ISODateTime;
  category_id: UUID | null;
  behavior_id: UUID | null;
  kind: ObservationKind;
  category_name: string;
  behavior_label: string;
  context: string | null;
  note: string | null;
  activity: Activity | null;
  intervention_used: string | null;
  follow_up_required: boolean;
  group_id: UUID | null;
}

export interface InterventionStrategy extends Owned {
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface InterventionPlan extends Owned {
  student_id: UUID;
  class_id: UUID | null;
  target_behavior: string;
  goal: string | null;
  baseline: string | null;
  strategy_id: UUID | null;
  strategy_name: string;
  start_date: ISODate;
  review_date: ISODate | null;
  status: InterventionStatus;
  notes: string | null;
}

export interface InterventionProgress extends Owned {
  plan_id: UUID;
  entry_date: ISODate;
  assessment: ProgressAssessment;
  note: string | null;
}

export interface CommunicationTemplate extends Owned {
  name: string;
  purpose: CommPurpose;
  subject: string;
  body: string;
}

export interface Communication extends Owned {
  student_id: UUID;
  contact_type: ContactType;
  occurred_at: ISODateTime;
  recipient: string | null;
  purpose: CommPurpose;
  subject: string | null;
  summary: string | null;
  follow_up_required: boolean;
  follow_up_date: ISODate | null;
  status: CommStatus;
}

export interface TeamRole extends Owned {
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface GroupSet extends Owned {
  class_id: UUID;
  name: string;
  archived_at: ISODateTime | null;
}

export interface Group extends Owned {
  group_set_id: UUID;
  name: string;
  station: string | null;
  sort_order: number;
}

export interface GroupMembership extends Owned {
  group_id: UUID;
  student_id: UUID;
  role_id: UUID | null;
}

export interface GroupObservation extends Owned {
  group_id: UUID;
  observed_at: ISODateTime;
  dimension: GroupDimension;
  note: string | null;
}

export interface Project extends Owned {
  class_id: UUID;
  group_set_id: UUID | null;
  name: string;
  description: string | null;
  start_date: ISODate | null;
  due_date: ISODate | null;
  status: "planned" | "active" | "completed" | "archived";
}

export interface ProjectTask extends Owned {
  project_id: UUID;
  group_id: UUID | null;
  title: string;
  is_milestone: boolean;
  due_date: ISODate | null;
  status: "not_started" | "in_progress" | "done";
}

export interface Reminder extends Owned {
  title: string;
  description: string | null;
  kind: ReminderKind;
  student_id: UUID | null;
  class_id: UUID | null;
  due_date: ISODate | null;
  priority: Priority;
  completed_at: ISODateTime | null;
}

export interface AuditLog {
  id: UUID;
  teacher_id: UUID;
  actor_id: UUID | null;
  table_name: string;
  record_id: UUID;
  action: "insert" | "update" | "delete";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: ISODateTime;
}

/** Every teacher-owned table the client reads and writes through the data layer. */
export interface Tables {
  academic_years: AcademicYear;
  terms: Term;
  classes: ClassSection;
  students: Student;
  enrollments: Enrollment;
  student_notes: StudentNote;
  seating_layouts: SeatingLayout;
  seats: Seat;
  attendance_statuses: AttendanceStatus;
  attendance_records: AttendanceRecord;
  observation_categories: ObservationCategory;
  observation_behaviors: ObservationBehavior;
  observations: Observation;
  intervention_strategies: InterventionStrategy;
  intervention_plans: InterventionPlan;
  intervention_progress: InterventionProgress;
  communication_templates: CommunicationTemplate;
  communications: Communication;
  team_roles: TeamRole;
  group_sets: GroupSet;
  groups: Group;
  group_memberships: GroupMembership;
  group_observations: GroupObservation;
  projects: Project;
  project_tasks: ProjectTask;
  reminders: Reminder;
  audit_logs: AuditLog;
}

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T];
/** Shape accepted when inserting: server-managed fields are optional. */
export type NewRow<T extends TableName> = Omit<Row<T>, "id" | "teacher_id" | "created_at" | "updated_at"> &
  Partial<Pick<Owned, "id">>;
export type Patch<T extends TableName> = Partial<Omit<Row<T>, "id" | "teacher_id" | "created_at" | "updated_at">>;

export const AUDITED_TABLES: TableName[] = [
  "students",
  "student_notes",
  "attendance_records",
  "observations",
  "intervention_plans",
  "intervention_progress",
  "communications",
  "enrollments",
];

/**
 * Tables in dependency order (parents first). Used for seeding, export and
 * for clearing data in reverse.
 */
export const TABLE_ORDER: TableName[] = [
  "academic_years",
  "terms",
  "classes",
  "students",
  "enrollments",
  "student_notes",
  "seating_layouts",
  "seats",
  "attendance_statuses",
  "attendance_records",
  "observation_categories",
  "observation_behaviors",
  "team_roles",
  "group_sets",
  "groups",
  "group_memberships",
  "group_observations",
  "observations",
  "intervention_strategies",
  "intervention_plans",
  "intervention_progress",
  "communication_templates",
  "communications",
  "projects",
  "project_tasks",
  "reminders",
];
