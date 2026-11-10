-- ClassPulse core schema
-- -----------------------------------------------------------------------------
-- Ownership model
--   * Every teacher-owned row carries `teacher_id` (defaults to auth.uid()).
--   * Every owned table has UNIQUE (id, teacher_id) so child tables can use
--     composite foreign keys (parent_id, teacher_id). This makes it impossible,
--     at the database level, to attach a row to another teacher's class,
--     student, layout, plan, etc. -- even though foreign-key checks bypass RLS.
--   * `school_id` is carried on the top-level records (classes, students) to
--     support future multi-teacher / multi-school tenancy.
-- -----------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- Generic updated_at maintenance ------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Schools ----------------------------------------------------------------------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  district text check (char_length(district) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Teacher profiles (1:1 with auth.users) ----------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid references public.schools (id) on delete set null,
  display_name text not null default '' check (char_length(display_name) <= 120),
  email text,
  -- 'teacher' only for now. Future: 'school_admin'. Users cannot change it
  -- themselves (column privileges below).
  role text not null default 'teacher' check (role in ('teacher', 'school_admin')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  insert into public.user_preferences (teacher_id) values (new.id)
  on conflict (teacher_id) do nothing;
  return new;
end;
$$;

-- User preferences --------------------------------------------------------------
create table public.user_preferences (
  teacher_id uuid primary key references public.profiles (id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  date_format text not null default 'MM/dd/yyyy' check (date_format in ('MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd')),
  time_format text not null default '12h' check (time_format in ('12h', '24h')),
  dashboard_widgets jsonb not null default '["schedule","overview","tasks","activity","quick_actions"]'::jsonb,
  notification_prefs jsonb not null default '{"in_app_reminders": true}'::jsonb,
  -- null = keep records until the teacher deletes them.
  retention_days integer check (retention_days is null or retention_days between 30 and 3650),
  current_class_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Explicit read grants between teachers ---------------------------------------
-- A teacher may grant another teacher read-only access to their (non-private)
-- classroom records. Teacher notes are never shared by a grant.
create table public.data_access_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  grantee_id uuid not null references public.profiles (id) on delete cascade,
  scope text not null default 'read' check (scope in ('read')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (owner_id <> grantee_id)
);
create unique index data_access_grants_active_uq
  on public.data_access_grants (owner_id, grantee_id) where revoked_at is null;

-- Academic calendar -------------------------------------------------------------
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  check (end_date > start_date)
);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  academic_year_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (academic_year_id, teacher_id) references public.academic_years (id, teacher_id) on delete cascade,
  check (end_date > start_date)
);

-- Classes -----------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  school_id uuid references public.schools (id) on delete set null,
  academic_year_id uuid,
  term_id uuid,
  course_name text not null check (char_length(course_name) between 1 and 120),
  period text not null check (char_length(period) between 1 and 20),
  period_order integer not null default 0,
  room text check (char_length(room) <= 40),
  meeting_days text[] not null default '{Mon,Tue,Wed,Thu,Fri}',
  start_time time,
  end_time time,
  color text not null default 'teal' check (color ~ '^[a-z]+$'),
  description text check (char_length(description) <= 2000),
  default_layout_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (academic_year_id, teacher_id) references public.academic_years (id, teacher_id) on delete set null (academic_year_id),
  foreign key (term_id, teacher_id) references public.terms (id, teacher_id) on delete set null (term_id)
);
create index classes_teacher_idx on public.classes (teacher_id, archived_at, period_order);

-- Students ----------------------------------------------------------------------
-- Intentionally minimal: no demographic, disability or medical fields.
create table public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  school_id uuid references public.schools (id) on delete set null,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  preferred_name text check (char_length(preferred_name) <= 80),
  grade_level smallint check (grade_level between 9 and 12),
  school_student_id text check (char_length(school_student_id) <= 40),
  -- Path inside the private `student-photos` storage bucket (never public).
  photo_path text,
  is_demo boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);
create index students_teacher_idx on public.students (teacher_id, archived_at, last_name, first_name);
create unique index students_school_id_uq on public.students (teacher_id, school_student_id)
  where school_student_id is not null;

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  class_id uuid not null,
  student_id uuid not null,
  enrolled_at date not null default current_date,
  dropped_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  unique (class_id, student_id),
  foreign key (class_id, teacher_id) references public.classes (id, teacher_id) on delete cascade,
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade
);
create index enrollments_student_idx on public.enrollments (student_id);

-- Private teacher notes -----------------------------------------------------------
create table public.student_notes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  student_id uuid not null,
  class_id uuid,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade,
  foreign key (class_id, teacher_id) references public.classes (id, teacher_id) on delete set null (class_id)
);
create index student_notes_student_idx on public.student_notes (student_id, created_at desc);

-- Seating -------------------------------------------------------------------------
create table public.seating_layouts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  class_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  arrangement text not null default 'custom' check (arrangement in ('rows', 'pods', 'tables', 'lab', 'custom')),
  cols integer not null default 12 check (cols between 4 and 30),
  rows integer not null default 10 check (rows between 4 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (class_id, teacher_id) references public.classes (id, teacher_id) on delete cascade
);

alter table public.classes
  add constraint classes_default_layout_fk
  foreign key (default_layout_id, teacher_id) references public.seating_layouts (id, teacher_id) on delete set null (default_layout_id);

create table public.seats (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  layout_id uuid not null,
  kind text not null default 'seat' check (kind in ('seat', 'teacher_desk', 'door', 'lab_bench', 'table', 'board', 'window')),
  x integer not null check (x >= 0),
  y integer not null check (y >= 0),
  w integer not null default 1 check (w between 1 and 12),
  h integer not null default 1 check (h between 1 and 12),
  label text check (char_length(label) <= 40),
  student_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (layout_id, teacher_id) references public.seating_layouts (id, teacher_id) on delete cascade,
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete set null (student_id),
  check (student_id is null or kind = 'seat')
);
create index seats_layout_idx on public.seats (layout_id);
create unique index seats_layout_student_uq on public.seats (layout_id, student_id) where student_id is not null;

-- Attendance -------------------------------------------------------------------------
create table public.attendance_statuses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 4),
  label text not null check (char_length(label) between 1 and 40),
  counts_as text not null check (counts_as in ('present', 'absent', 'tardy', 'excused')),
  color text not null default 'slate' check (color ~ '^[a-z]+$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  unique (teacher_id, code)
);

-- ClassPulse attendance is a classroom record, NOT the official school record.
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  class_id uuid not null,
  student_id uuid not null,
  date date not null,
  status_id uuid not null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  unique (class_id, student_id, date),
  foreign key (class_id, teacher_id) references public.classes (id, teacher_id) on delete cascade,
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade,
  foreign key (status_id, teacher_id) references public.attendance_statuses (id, teacher_id) on delete restrict
);
create index attendance_class_date_idx on public.attendance_records (class_id, date);
create index attendance_student_idx on public.attendance_records (student_id, date);

-- Observations ------------------------------------------------------------------------
create table public.observation_categories (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('positive', 'redirection', 'engagement')),
  color text not null default 'slate' check (color ~ '^[a-z]+$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);

-- Specific behaviors / quick-log buttons within a category.
create table public.observation_behaviors (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category_id uuid not null,
  label text not null check (char_length(label) between 1 and 80),
  is_quick boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (category_id, teacher_id) references public.observation_categories (id, teacher_id) on delete cascade
);

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  student_id uuid not null,
  class_id uuid not null,
  observed_at timestamptz not null default now(),
  category_id uuid,
  behavior_id uuid,
  -- Labels are copied at write time so history stays readable if a category is renamed or deleted.
  kind text not null check (kind in ('positive', 'redirection', 'engagement')),
  category_name text not null check (char_length(category_name) between 1 and 60),
  behavior_label text not null check (char_length(behavior_label) between 1 and 120),
  context text check (char_length(context) <= 500),
  note text check (char_length(note) <= 2000),
  activity text check (activity in ('direct_instruction', 'independent_work', 'group_work', 'lab_activity', 'assessment', 'transition', 'other')),
  intervention_used text check (char_length(intervention_used) <= 200),
  follow_up_required boolean not null default false,
  group_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade,
  foreign key (class_id, teacher_id) references public.classes (id, teacher_id) on delete cascade,
  foreign key (category_id, teacher_id) references public.observation_categories (id, teacher_id) on delete set null (category_id),
  foreign key (behavior_id, teacher_id) references public.observation_behaviors (id, teacher_id) on delete set null (behavior_id)
);
create index observations_student_idx on public.observations (student_id, observed_at desc);
create index observations_class_idx on public.observations (class_id, observed_at desc);
create index observations_teacher_time_idx on public.observations (teacher_id, observed_at desc);

-- Interventions --------------------------------------------------------------------------
create table public.intervention_strategies (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);

create table public.intervention_plans (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  student_id uuid not null,
  class_id uuid,
  target_behavior text not null check (char_length(target_behavior) between 1 and 200),
  goal text check (char_length(goal) <= 1000),
  baseline text check (char_length(baseline) <= 2000),
  strategy_id uuid,
  strategy_name text not null check (char_length(strategy_name) between 1 and 80),
  start_date date not null,
  review_date date,
  status text not null default 'planned' check (status in ('planned', 'active', 'under_review', 'completed', 'discontinued')),
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade,
  foreign key (class_id, teacher_id) references public.classes (id, teacher_id) on delete set null (class_id),
  foreign key (strategy_id, teacher_id) references public.intervention_strategies (id, teacher_id) on delete set null (strategy_id)
);
create index intervention_plans_student_idx on public.intervention_plans (student_id);

create table public.intervention_progress (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  plan_id uuid not null,
  entry_date date not null default current_date,
  assessment text not null check (assessment in ('helpful', 'needs_modification', 'discontinue', 'too_early')),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (plan_id, teacher_id) references public.intervention_plans (id, teacher_id) on delete cascade
);
create index intervention_progress_plan_idx on public.intervention_progress (plan_id, entry_date);

-- Communication -------------------------------------------------------------------------
create table public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  purpose text not null check (purpose in ('positive', 'concern', 'missing_work', 'attendance', 'improvement', 'conference', 'follow_up', 'other')),
  subject text not null check (char_length(subject) <= 200),
  body text not null check (char_length(body) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);

create table public.communications (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  student_id uuid not null,
  contact_type text not null check (contact_type in ('email', 'phone', 'in_person', 'virtual', 'student_conversation', 'other')),
  occurred_at timestamptz not null default now(),
  recipient text check (char_length(recipient) <= 200),
  purpose text not null check (purpose in ('positive', 'concern', 'missing_work', 'attendance', 'improvement', 'conference', 'follow_up', 'other')),
  subject text check (char_length(subject) <= 200),
  summary text check (char_length(summary) <= 5000),
  follow_up_required boolean not null default false,
  follow_up_date date,
  status text not null default 'completed' check (status in ('draft', 'completed', 'follow_up_pending', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade
);
create index communications_student_idx on public.communications (student_id, occurred_at desc);

-- Groups & projects ------------------------------------------------------------------------
create table public.team_roles (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  description text check (char_length(description) <= 300),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);

create table public.group_sets (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  class_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (class_id, teacher_id) references public.classes (id, teacher_id) on delete cascade
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  group_set_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  station text check (char_length(station) <= 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (group_set_id, teacher_id) references public.group_sets (id, teacher_id) on delete cascade
);

alter table public.observations
  add constraint observations_group_fk
  foreign key (group_id, teacher_id) references public.groups (id, teacher_id) on delete set null (group_id);

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  group_id uuid not null,
  student_id uuid not null,
  role_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  unique (group_id, student_id),
  foreign key (group_id, teacher_id) references public.groups (id, teacher_id) on delete cascade,
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade,
  foreign key (role_id, teacher_id) references public.team_roles (id, teacher_id) on delete set null (role_id)
);

create table public.group_observations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  group_id uuid not null,
  observed_at timestamptz not null default now(),
  dimension text not null check (dimension in ('collaboration', 'communication', 'participation', 'leadership', 'task_completion', 'problem_solving', 'challenge')),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (group_id, teacher_id) references public.groups (id, teacher_id) on delete cascade
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  class_id uuid not null,
  group_set_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 2000),
  start_date date,
  due_date date,
  status text not null default 'active' check (status in ('planned', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (class_id, teacher_id) references public.classes (id, teacher_id) on delete cascade,
  foreign key (group_set_id, teacher_id) references public.group_sets (id, teacher_id) on delete set null (group_set_id)
);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id uuid not null,
  group_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  is_milestone boolean not null default false,
  due_date date,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (project_id, teacher_id) references public.projects (id, teacher_id) on delete cascade,
  foreign key (group_id, teacher_id) references public.groups (id, teacher_id) on delete set null (group_id)
);

-- Reminders ------------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 2000),
  kind text not null default 'general' check (kind in ('parent_contact', 'conference', 'intervention_review', 'documentation', 'general')),
  student_id uuid,
  class_id uuid,
  due_date date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade,
  foreign key (class_id, teacher_id) references public.classes (id, teacher_id) on delete set null (class_id)
);
create index reminders_due_idx on public.reminders (teacher_id, completed_at, due_date);

-- Audit log ------------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at);
create index audit_logs_teacher_idx on public.audit_logs (teacher_id, created_at desc);

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec_owner uuid;
  rec_id uuid;
begin
  if tg_op = 'DELETE' then
    rec_owner := old.teacher_id; rec_id := old.id;
  else
    rec_owner := new.teacher_id; rec_id := new.id;
  end if;
  -- Skip when the owning profile is being removed (account deletion cascade).
  if not exists (select 1 from public.profiles where id = rec_owner) then
    return null;
  end if;
  insert into public.audit_logs (teacher_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (
    rec_owner,
    auth.uid(),
    tg_table_name,
    rec_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

-- Attach updated_at + audit triggers ---------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'schools', 'profiles', 'user_preferences', 'academic_years', 'terms', 'classes', 'students',
    'enrollments', 'student_notes', 'seating_layouts', 'seats', 'attendance_statuses',
    'attendance_records', 'observation_categories', 'observation_behaviors', 'observations',
    'intervention_strategies', 'intervention_plans', 'intervention_progress',
    'communication_templates', 'communications', 'team_roles', 'group_sets', 'groups',
    'group_memberships', 'group_observations', 'projects', 'project_tasks', 'reminders'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;

  -- Sensitive student-record tables get a full change history.
  foreach t in array array[
    'students', 'student_notes', 'attendance_records', 'observations',
    'intervention_plans', 'intervention_progress', 'communications', 'enrollments'
  ] loop
    execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function public.write_audit_log()', t);
  end loop;
end;
$$;
