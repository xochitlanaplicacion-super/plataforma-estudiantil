alter table public.filter_late_entries
  add column client_request_id uuid;

update public.filter_late_entries
set client_request_id = gen_random_uuid()
where client_request_id is null;

alter table public.filter_late_entries
  alter column client_request_id set not null;

create unique index filter_late_entries_tenant_request_uidx
  on public.filter_late_entries (tenant_id, client_request_id);
