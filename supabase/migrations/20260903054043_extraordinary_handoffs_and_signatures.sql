alter table public.filter_early_departures
  add column pickup_signature_path text
    check (pickup_signature_path is null or length(btrim(pickup_signature_path)) between 3 and 1000);

create table public.filter_guardian_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 2 and 220),
  relationship text not null check (relationship in ('madre','padre','tutor')),
  phone text check (phone is null or length(btrim(phone)) between 7 and 30),
  email text check (email is null or length(btrim(email)) between 5 and 254),
  source text not null default 'staff' check (source in ('staff','qr_self_service','import')),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected','revoked')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  external_registration_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint filter_guardian_contact_channel_check
    check (nullif(btrim(phone), '') is not null or nullif(btrim(email), '') is not null),
  constraint filter_guardian_verification_check
    check (verification_status <> 'verified' or (verified_at is not null and verified_by is not null)),
  constraint filter_guardian_student_tenant_fk foreign key (student_id, tenant_id)
    references public.filter_students(id, tenant_id) on delete restrict,
  unique (id, tenant_id, student_id)
);

create index filter_guardian_contacts_student_idx
  on public.filter_guardian_contacts (tenant_id, student_id, active);

create table public.filter_extraordinary_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_request_id uuid not null,
  student_id uuid not null,
  guardian_contact_id uuid not null,
  linked_early_departure_id uuid references public.filter_early_departures(id) on delete set null,
  student_name text not null check (length(btrim(student_name)) between 2 and 220),
  level_name text not null check (length(btrim(level_name)) between 1 and 100),
  grade_name text not null check (length(btrim(grade_name)) between 1 and 100),
  group_name text not null check (length(btrim(group_name)) between 1 and 50),
  registered_at timestamptz not null default now(),
  departed_at timestamptz,
  delivery_context text not null check (delivery_context in ('horario_escolar','fin_jornada','emergencia','otro')),
  delivery_context_other text,
  delivery_reason text not null check (length(btrim(delivery_reason)) between 2 and 1000),

  pickup_person_name text not null check (length(btrim(pickup_person_name)) between 2 and 220),
  pickup_person_phone text check (pickup_person_phone is null or length(btrim(pickup_person_phone)) between 7 and 30),
  pickup_relationship text not null check (pickup_relationship in ('familiar','persona_confianza','transportista','personal_medico','autoridad','otro')),
  pickup_relationship_other text,
  adult_confirmed boolean not null,
  identification_type text not null check (identification_type in ('ine','pasaporte','licencia','cedula','institucional','otro')),
  identification_type_other text,
  identification_reference text not null check (length(btrim(identification_reference)) between 2 and 12),
  identification_front_path text not null check (length(btrim(identification_front_path)) between 3 and 1000),
  identification_back_path text check (identification_back_path is null or length(btrim(identification_back_path)) between 3 and 1000),
  pickup_person_photo_path text not null check (length(btrim(pickup_person_photo_path)) between 3 and 1000),
  vehicle_description text check (vehicle_description is null or length(vehicle_description) <= 500),
  vehicle_photo_path text check (vehicle_photo_path is null or length(btrim(vehicle_photo_path)) between 3 and 1000),
  identity_matches boolean not null,
  no_visible_impairment boolean not null,

  authorizer_name text not null check (length(btrim(authorizer_name)) between 2 and 220),
  authorizer_relationship text not null check (authorizer_relationship in ('madre','padre','tutor')),
  authorizer_channel_snapshot text not null check (length(btrim(authorizer_channel_snapshot)) between 3 and 254),
  authorization_method text not null check (authorization_method in ('llamada','videollamada','whatsapp','correo','documento','presencial')),
  authorized_at timestamptz not null,
  authorization_expires_at timestamptz,
  authorization_statement text not null check (length(btrim(authorization_statement)) between 10 and 2000),
  authorization_evidence_path text not null check (length(btrim(authorization_evidence_path)) between 3 and 1000),
  authorization_verifier_name text not null check (length(btrim(authorization_verifier_name)) between 2 and 220),
  one_time_code text check (one_time_code is null or length(btrim(one_time_code)) between 4 and 12),

  identity_status text not null check (identity_status in ('coincide','no_coincide','no_verificable')),
  consent_status text not null check (consent_status in ('confirmado','rechazado','sin_respuesta')),
  validator_name text not null check (length(btrim(validator_name)) between 2 and 220),
  witness_name text not null check (length(btrim(witness_name)) between 2 and 220),
  approver_name text,
  institution_approved boolean not null default false,
  status text not null check (status in ('entregado','rechazado','cancelado')),
  resolution_reason text,

  delivering_teacher_name text,
  reporter_name text not null check (length(btrim(reporter_name)) between 2 and 180),
  registered_by_user_id uuid references auth.users(id) on delete set null,
  final_handover_photo_path text check (final_handover_photo_path is null or length(btrim(final_handover_photo_path)) between 3 and 1000),
  pickup_signature_path text check (pickup_signature_path is null or length(btrim(pickup_signature_path)) between 3 and 1000),
  final_observations text check (final_observations is null or length(final_observations) <= 4000),
  protocol_confirmed boolean not null default false,
  created_at timestamptz not null default now(),

  constraint filter_extraordinary_student_tenant_fk foreign key (student_id, tenant_id)
    references public.filter_students(id, tenant_id) on delete restrict,
  constraint filter_extraordinary_guardian_tenant_fk foreign key (guardian_contact_id, tenant_id, student_id)
    references public.filter_guardian_contacts(id, tenant_id, student_id) on delete restrict,
  constraint filter_extraordinary_context_other_check check
    (delivery_context <> 'otro' or length(btrim(coalesce(delivery_context_other, ''))) >= 2),
  constraint filter_extraordinary_relationship_other_check check
    (pickup_relationship <> 'otro' or length(btrim(coalesce(pickup_relationship_other, ''))) >= 2),
  constraint filter_extraordinary_identification_other_check check
    (identification_type <> 'otro' or length(btrim(coalesce(identification_type_other, ''))) >= 2),
  constraint filter_extraordinary_expiration_check check
    (authorization_expires_at is null or authorization_expires_at > authorized_at),
  constraint filter_extraordinary_resolution_check check
    (status = 'entregado' or length(btrim(coalesce(resolution_reason, ''))) >= 2),
  constraint filter_extraordinary_delivery_check check (
    status <> 'entregado' or (
      adult_confirmed and identity_matches and no_visible_impairment
      and identity_status = 'coincide' and consent_status = 'confirmado'
      and institution_approved and protocol_confirmed
      and departed_at is not null
      and length(btrim(coalesce(delivering_teacher_name, ''))) >= 2
      and final_handover_photo_path is not null
      and pickup_signature_path is not null
    )
  ),
  unique (tenant_id, client_request_id)
);

create index filter_extraordinary_tenant_time_idx
  on public.filter_extraordinary_handoffs (tenant_id, registered_at desc, id desc);
create index filter_extraordinary_student_time_idx
  on public.filter_extraordinary_handoffs (tenant_id, student_id, registered_at desc, id desc);
create index filter_extraordinary_status_time_idx
  on public.filter_extraordinary_handoffs (tenant_id, status, registered_at desc, id desc);
create index filter_extraordinary_guardian_idx
  on public.filter_extraordinary_handoffs (guardian_contact_id);
create index filter_extraordinary_linked_departure_idx
  on public.filter_extraordinary_handoffs (linked_early_departure_id)
  where linked_early_departure_id is not null;

-- Los enlaces contienen un token aleatorio; sólo se conserva su hash. Ningún
-- endpoint público permite enumerar el padrón de menores.
create table public.filter_family_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null,
  token_hash text not null unique check (length(token_hash) = 64),
  active boolean not null default true,
  expires_at timestamptz not null,
  max_uses smallint not null default 1 check (max_uses between 1 and 10),
  used_count smallint not null default 0 check (used_count between 0 and max_uses),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint filter_family_invite_student_tenant_fk foreign key (student_id, tenant_id)
    references public.filter_students(id, tenant_id) on delete restrict
);
create index filter_family_invites_student_idx on public.filter_family_invites (tenant_id, student_id, active, expires_at desc);

create table public.filter_family_registrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null,
  invite_id uuid not null references public.filter_family_invites(id) on delete restrict,
  client_request_id uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','duplicate')),
  guardian_name text not null check (length(btrim(guardian_name)) between 2 and 220),
  relationship text not null check (relationship in ('madre','padre','tutor','otro')),
  relationship_other text,
  phone text not null check (length(btrim(phone)) between 7 and 30),
  email text check (email is null or length(btrim(email)) between 5 and 254),
  identification_reference text not null check (length(btrim(identification_reference)) between 2 and 12),
  identification_front_path text not null,
  identification_back_path text,
  face_photo_path text not null,
  signature_path text not null,
  privacy_consent boolean not null,
  review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint filter_family_registration_student_tenant_fk foreign key (student_id, tenant_id)
    references public.filter_students(id, tenant_id) on delete restrict,
  constraint filter_family_registration_other_check check
    (relationship <> 'otro' or length(btrim(coalesce(relationship_other, ''))) >= 2),
  constraint filter_family_registration_review_check check
    (status = 'pending' or (reviewed_by is not null and reviewed_at is not null)),
  unique (tenant_id, client_request_id)
);
create index filter_family_registrations_queue_idx on public.filter_family_registrations (tenant_id, status, created_at desc, id desc);
create index filter_family_registrations_student_idx on public.filter_family_registrations (tenant_id, student_id, created_at desc, id desc);

create table public.filter_registration_pickup_people (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  registration_id uuid not null references public.filter_family_registrations(id) on delete cascade,
  student_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 2 and 220),
  relationship text not null check (length(btrim(relationship)) between 2 and 100),
  phone text check (phone is null or length(btrim(phone)) between 7 and 30),
  identification_reference text check (identification_reference is null or length(btrim(identification_reference)) between 2 and 12),
  identification_path text,
  face_photo_path text not null,
  active boolean not null default true,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected','revoked')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint filter_registration_person_student_tenant_fk foreign key (student_id, tenant_id)
    references public.filter_students(id, tenant_id) on delete restrict,
  constraint filter_registration_person_verified_check check
    (verification_status <> 'verified' or (verified_by is not null and verified_at is not null))
);
create index filter_registration_people_student_idx on public.filter_registration_pickup_people (tenant_id, student_id, active, verification_status);
create index filter_registration_people_registration_idx on public.filter_registration_pickup_people (registration_id);

alter table public.filter_guardian_contacts
  add constraint filter_guardian_external_registration_fk foreign key (external_registration_id)
  references public.filter_family_registrations(id) on delete set null;
alter table public.filter_guardian_contacts enable row level security;
alter table public.filter_extraordinary_handoffs enable row level security;
alter table public.filter_family_invites enable row level security;
alter table public.filter_family_registrations enable row level security;
alter table public.filter_registration_pickup_people enable row level security;

create policy filter_guardian_contacts_read on public.filter_guardian_contacts
  for select to authenticated
  using ((select private.has_filter_access(tenant_id)));

create policy filter_extraordinary_handoffs_read on public.filter_extraordinary_handoffs
  for select to authenticated
  using ((select private.has_filter_access(tenant_id)));

create policy filter_family_invites_read on public.filter_family_invites for select to authenticated
  using ((select private.has_filter_access(tenant_id)));
create policy filter_family_registrations_read on public.filter_family_registrations for select to authenticated
  using ((select private.has_filter_access(tenant_id)));
create policy filter_registration_pickup_people_read on public.filter_registration_pickup_people for select to authenticated
  using ((select private.has_filter_access(tenant_id)));

revoke all on public.filter_guardian_contacts, public.filter_extraordinary_handoffs from anon, authenticated;
grant select on public.filter_guardian_contacts, public.filter_extraordinary_handoffs to authenticated;
grant all on public.filter_guardian_contacts, public.filter_extraordinary_handoffs to service_role;
revoke all on public.filter_family_invites, public.filter_family_registrations, public.filter_registration_pickup_people from anon, authenticated;
grant select on public.filter_family_invites, public.filter_family_registrations, public.filter_registration_pickup_people to authenticated;
grant all on public.filter_family_invites, public.filter_family_registrations, public.filter_registration_pickup_people to service_role;
