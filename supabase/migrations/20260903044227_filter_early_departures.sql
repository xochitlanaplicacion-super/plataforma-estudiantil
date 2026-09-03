create table public.filter_early_departures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_request_id uuid not null,
  student_id uuid not null,
  student_name text not null check (length(btrim(student_name)) between 2 and 220),
  level_name text not null check (length(btrim(level_name)) between 1 and 100),
  grade_name text not null check (length(btrim(grade_name)) between 1 and 100),
  group_name text not null check (length(btrim(group_name)) between 1 and 50),
  registered_at timestamptz not null default now(),
  departed_at timestamptz not null,
  pickup_person_name text not null check (length(btrim(pickup_person_name)) between 2 and 220),
  relationship text not null check (relationship in ('madre','padre','tutor','abuelo','hermano','familiar_autorizado','otro')),
  relationship_other text,
  identification_evidence_path text not null check (length(btrim(identification_evidence_path)) between 3 and 1000),
  pickup_person_photo_path text not null check (length(btrim(pickup_person_photo_path)) between 3 and 1000),
  notified_party text not null check (notified_party in ('madre','padre','tutor')),
  notified_staff_name text not null check (length(btrim(notified_staff_name)) between 2 and 220),
  notification_method text not null check (notification_method in ('whatsapp','llamada','sms','presencial','otro')),
  notification_method_other text,
  departure_reason text not null check (departure_reason in ('cita_medica','malestar','asunto_familiar','salida_autorizada','cambio_transporte','otro')),
  departure_reason_other text,
  description text check (description is null or length(description) <= 4000),
  delivering_teacher_name text not null check (length(btrim(delivering_teacher_name)) between 2 and 220),
  registered_by_user_id uuid references auth.users(id) on delete set null,
  reporter_name text not null check (length(btrim(reporter_name)) between 2 and 180),
  final_handover_photo_path text not null check (length(btrim(final_handover_photo_path)) between 3 and 1000),
  identity_and_notification_confirmed boolean not null,
  created_at timestamptz not null default now(),
  constraint filter_early_departure_student_tenant_fk foreign key (student_id, tenant_id)
    references public.filter_students(id, tenant_id) on delete restrict,
  constraint filter_early_departure_confirmation_check check (identity_and_notification_confirmed),
  constraint filter_early_departure_relationship_other_check check
    (relationship <> 'otro' or length(btrim(coalesce(relationship_other, ''))) >= 2),
  constraint filter_early_departure_method_other_check check
    (notification_method <> 'otro' or length(btrim(coalesce(notification_method_other, ''))) >= 2),
  constraint filter_early_departure_reason_other_check check
    (departure_reason <> 'otro' or length(btrim(coalesce(departure_reason_other, ''))) >= 2),
  unique (tenant_id, client_request_id)
);

create index filter_early_departures_tenant_time_idx
  on public.filter_early_departures (tenant_id, departed_at desc);
create index filter_early_departures_student_time_idx
  on public.filter_early_departures (tenant_id, student_id, departed_at desc);

alter table public.filter_early_departures enable row level security;

create policy filter_early_departures_read on public.filter_early_departures
  for select to authenticated
  using ((select private.has_filter_access(tenant_id)));

-- Las escrituras pasan por la acción de servidor, que valida el tenant, deriva las
-- instantáneas académicas y registra auditoría. El cliente sólo necesita lectura.
revoke all on public.filter_early_departures from anon, authenticated;
grant select on public.filter_early_departures to authenticated;
grant all on public.filter_early_departures to service_role;
