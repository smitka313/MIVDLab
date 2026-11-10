-- Usability additions
--  * student_notes.share_with_sub: include a note in the printable substitute packet
--  * classes.sub_notes: per-class instructions for a substitute
--  * user_preferences.note_templates: saved phrases for quick notes
alter table public.student_notes add column share_with_sub boolean not null default false;
alter table public.classes add column sub_notes text check (char_length(sub_notes) <= 5000);
alter table public.user_preferences add column note_templates jsonb not null default '[]'::jsonb
  check (jsonb_typeof(note_templates) = 'array' and jsonb_array_length(note_templates) <= 100);
