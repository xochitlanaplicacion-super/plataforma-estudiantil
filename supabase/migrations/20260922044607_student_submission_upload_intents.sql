create table public.student_submission_upload_intents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  alumno_id uuid not null,
  ejercicio_id uuid not null,
  object_path text not null unique,
  original_name text not null check (length(original_name) between 1 and 255),
  content_type text not null check (length(content_type) between 3 and 160),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'confirmed', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_upload_intent_profile_fkey
    foreign key (alumno_id, tenant_id)
    references public.profiles(id, tenant_id) on delete cascade,
  constraint student_upload_intent_exercise_fkey
    foreign key (ejercicio_id, tenant_id)
    references public.ejercicios(id, tenant_id) on delete cascade,
  constraint student_upload_intent_path_scope check (
    object_path like tenant_id::text || '/entregas/' || alumno_id::text || '/' || ejercicio_id::text || '/%'
  ),
  constraint student_upload_intent_expiration check (expires_at > created_at),
  constraint student_upload_intent_confirmation check (
    (status = 'confirmed' and confirmed_at is not null)
    or (status <> 'confirmed' and confirmed_at is null)
  )
);

create unique index student_upload_intent_one_active_idx
  on public.student_submission_upload_intents (tenant_id, alumno_id, ejercicio_id)
  where status in ('pending', 'processing');

create index student_upload_intent_cleanup_idx
  on public.student_submission_upload_intents (status, expires_at, updated_at)
  where status in ('pending', 'processing', 'cancelled');

alter table public.student_submission_upload_intents enable row level security;
alter table public.student_submission_upload_intents force row level security;

revoke all on public.student_submission_upload_intents from anon, authenticated;
grant select, insert, update, delete on public.student_submission_upload_intents to service_role;

comment on table public.student_submission_upload_intents is
  'Server-only authorization ledger for direct student uploads; prevents unbounded orphan objects and replayed confirmations.';
