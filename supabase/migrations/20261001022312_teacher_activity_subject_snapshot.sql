-- Keep the subject label that existed when an original activity first became
-- student-visible. Historical events intentionally remain unidentified rather
-- than pretending that the subject's current name was its original name.
set search_path = '';

alter table public.teacher_activity_publication_events
  add column subject_name_snapshot text;

create function private.teacher_activity_stamp_subject()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select m.nombre into new.subject_name_snapshot
  from public.asignaciones_profesor a
  join public.materias m
    on m.id = a.materia_id and m.tenant_id = a.tenant_id
  where a.id = new.assignment_id and a.tenant_id = new.tenant_id;
  return new;
end;
$$;
revoke all on function private.teacher_activity_stamp_subject()
  from public, anon, authenticated, service_role;

create trigger teacher_activity_stamp_subject
  before insert on public.teacher_activity_publication_events
  for each row execute function private.teacher_activity_stamp_subject();

comment on column public.teacher_activity_publication_events.subject_name_snapshot is
  'Subject name captured at first student-visible publication; null for events before this migration.';
