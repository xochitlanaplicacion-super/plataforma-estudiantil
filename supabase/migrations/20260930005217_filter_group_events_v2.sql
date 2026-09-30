-- Una captura puede abarcar de uno a cinco alumnos. Cada fila conserva su
-- expediente y su idempotencia propios; group_event_id enlaza el trámite.
alter table public.filter_late_entries
  add column if not exists group_event_id uuid;
alter table public.filter_early_departures
  add column if not exists group_event_id uuid;
alter table public.filter_extraordinary_handoffs
  add column if not exists group_event_id uuid;

update public.filter_late_entries
   set group_event_id = client_request_id
 where group_event_id is null;
update public.filter_early_departures
   set group_event_id = client_request_id
 where group_event_id is null;
update public.filter_extraordinary_handoffs
   set group_event_id = client_request_id
 where group_event_id is null;

alter table public.filter_late_entries
  alter column group_event_id set default gen_random_uuid(),
  alter column group_event_id set not null;
alter table public.filter_early_departures
  alter column group_event_id set default gen_random_uuid(),
  alter column group_event_id set not null;
alter table public.filter_extraordinary_handoffs
  alter column group_event_id set default gen_random_uuid(),
  alter column group_event_id set not null;

create unique index if not exists filter_late_entries_group_student_uidx
  on public.filter_late_entries (tenant_id, group_event_id, student_id);
create unique index if not exists filter_early_departures_group_student_uidx
  on public.filter_early_departures (tenant_id, group_event_id, student_id);
create unique index if not exists filter_extraordinary_handoffs_group_student_uidx
  on public.filter_extraordinary_handoffs (tenant_id, group_event_id, student_id);

-- Los retardos se crean sólo desde la acción de servidor. La política anterior
-- permitía DML directo a authenticated y eludiría el límite del grupo.
drop policy if exists filter_tenant_access on public.filter_late_entries;
create policy filter_late_entries_read
  on public.filter_late_entries for select to authenticated
  using ((select private.has_filter_access(tenant_id)));
revoke insert, update, delete on public.filter_late_entries from anon, authenticated;
grant select on public.filter_late_entries to authenticated;
grant all on public.filter_late_entries to service_role;
