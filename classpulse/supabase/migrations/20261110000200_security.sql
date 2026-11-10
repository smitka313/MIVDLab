-- ClassPulse authorization: row-level security, least-privilege grants,
-- account deletion and retention workflows.
-- -----------------------------------------------------------------------------

-- Is the current user allowed to READ rows owned by `owner`?
-- Owner always; another teacher only with an explicit, unrevoked grant.
create or replace function public.can_read(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select owner = auth.uid()
      or exists (
        select 1 from public.data_access_grants g
        where g.owner_id = owner
          and g.grantee_id = auth.uid()
          and g.revoked_at is null
      );
$$;

revoke all on function public.can_read(uuid) from public, anon;
grant execute on function public.can_read(uuid) to authenticated;

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- Teacher-owned classroom tables ------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'academic_years', 'terms', 'classes', 'students', 'enrollments', 'seating_layouts', 'seats',
    'attendance_statuses', 'attendance_records', 'observation_categories', 'observation_behaviors',
    'observations', 'intervention_strategies', 'intervention_plans', 'intervention_progress',
    'communication_templates', 'communications', 'team_roles', 'group_sets', 'groups',
    'group_memberships', 'group_observations', 'projects', 'project_tasks', 'reminders'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (public.can_read(teacher_id))$p$, t || '_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check (teacher_id = auth.uid())$p$, t || '_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid())$p$, t || '_update', t);
    execute format($p$create policy %I on public.%I for delete to authenticated using (teacher_id = auth.uid())$p$, t || '_delete', t);
  end loop;
end;
$$;

-- Private teacher notes: owner only, never shared through grants. ------------------
alter table public.student_notes enable row level security;
alter table public.student_notes force row level security;
grant select, insert, update, delete on public.student_notes to authenticated;
create policy student_notes_owner on public.student_notes for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- Preferences: owner only. ---------------------------------------------------------
alter table public.user_preferences enable row level security;
alter table public.user_preferences force row level security;
grant select, insert, update on public.user_preferences to authenticated;
create policy user_preferences_owner on public.user_preferences for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- Profiles: read own (and those of teachers you share with); edit limited columns. ---
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
grant select on public.profiles to authenticated;
grant update (display_name, school_id, onboarded_at) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.data_access_grants g
      where g.revoked_at is null
        and ((g.owner_id = profiles.id and g.grantee_id = auth.uid())
          or (g.grantee_id = profiles.id and g.owner_id = auth.uid()))
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Schools: members can read their school; any teacher can register one. -------------
alter table public.schools enable row level security;
alter table public.schools force row level security;
grant select, insert on public.schools to authenticated;
create policy schools_select on public.schools for select to authenticated
  using (id in (select school_id from public.profiles where id = auth.uid()));
create policy schools_insert on public.schools for insert to authenticated
  with check (true);

-- Access grants: owner manages; grantee can see grants made to them. -----------------
alter table public.data_access_grants enable row level security;
alter table public.data_access_grants force row level security;
grant select, insert, update on public.data_access_grants to authenticated;
create policy grants_select on public.data_access_grants for select to authenticated
  using (owner_id = auth.uid() or grantee_id = auth.uid());
create policy grants_insert on public.data_access_grants for insert to authenticated
  with check (owner_id = auth.uid());
create policy grants_update on public.data_access_grants for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Audit log: read-only for the owner; rows are written only by the trigger. ----------
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
grant select on public.audit_logs to authenticated;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (teacher_id = auth.uid());

-- Account & data lifecycle -------------------------------------------------------------

-- Deletes every classroom record the caller owns but keeps the account.
create or replace function public.delete_my_classroom_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  delete from public.reminders where teacher_id = me;
  delete from public.projects where teacher_id = me;
  delete from public.communications where teacher_id = me;
  delete from public.intervention_plans where teacher_id = me;
  delete from public.observations where teacher_id = me;
  delete from public.attendance_records where teacher_id = me;
  delete from public.student_notes where teacher_id = me;
  delete from public.classes where teacher_id = me;
  delete from public.students where teacher_id = me;
  delete from public.academic_years where teacher_id = me;
  delete from public.observation_categories where teacher_id = me;
  delete from public.attendance_statuses where teacher_id = me;
  delete from public.intervention_strategies where teacher_id = me;
  delete from public.communication_templates where teacher_id = me;
  delete from public.team_roles where teacher_id = me;
  delete from public.audit_logs where teacher_id = me;
end;
$$;

-- Permanently deletes the caller's account; all owned rows cascade.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = me;
end;
$$;

-- Removes the caller's dated classroom records older than their retention setting.
create or replace function public.apply_retention_policy()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  days integer;
  cutoff timestamptz;
  n integer := 0;
  c integer;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  select retention_days into days from public.user_preferences where teacher_id = me;
  if days is null then
    return 0;
  end if;
  cutoff := now() - make_interval(days => days);
  delete from public.observations where teacher_id = me and observed_at < cutoff; get diagnostics c = row_count; n := n + c;
  delete from public.attendance_records where teacher_id = me and date < cutoff::date; get diagnostics c = row_count; n := n + c;
  delete from public.student_notes where teacher_id = me and created_at < cutoff; get diagnostics c = row_count; n := n + c;
  delete from public.communications where teacher_id = me and occurred_at < cutoff; get diagnostics c = row_count; n := n + c;
  delete from public.group_observations where teacher_id = me and observed_at < cutoff; get diagnostics c = row_count; n := n + c;
  delete from public.audit_logs where teacher_id = me and created_at < cutoff; get diagnostics c = row_count; n := n + c;
  return n;
end;
$$;

revoke all on function public.delete_my_classroom_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.apply_retention_policy() from public, anon;
grant execute on function public.delete_my_classroom_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.apply_retention_policy() to authenticated;
revoke all on function public.write_audit_log() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
