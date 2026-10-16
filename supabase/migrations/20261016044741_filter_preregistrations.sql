-- Cola compartida: el preregistro no sustituye ninguna bitácora final.
-- Sólo la acción de servidor puede crear/completar órdenes; los usuarios
-- autenticados pueden leer las suyas o, con acceso a Filtro, las del tenant.
create table public.filter_preregistrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('early', 'extraordinary')),
  student_ids uuid[] not null check (
    cardinality(student_ids) between 1 and 5
    and array_position(student_ids, null::uuid) is null
  ),
  evidence_path text not null check (length(btrim(evidence_path)) between 3 and 1000),
  preliminary jsonb not null default '{}'::jsonb check (jsonb_typeof(preliminary) = 'object'),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_name text not null check (length(btrim(created_by_name)) between 2 and 220),
  created_by_actor_kind text not null check (created_by_actor_kind in ('teacher', 'filter')),
  declared_staff_name text check (declared_staff_name is null or length(btrim(declared_staff_name)) between 2 and 220),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id) on delete set null,
  constraint filter_preregistrations_completion_check check (
    (status = 'pending' and completed_at is null and completed_by_user_id is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create index filter_preregistrations_pending_idx
  on public.filter_preregistrations (tenant_id, created_at desc, id desc)
  where status = 'pending';
create index filter_preregistrations_teacher_idx
  on public.filter_preregistrations (tenant_id, created_by_user_id, created_at desc);

alter table public.filter_preregistrations enable row level security;

create policy filter_preregistrations_read on public.filter_preregistrations
  for select to authenticated
  using (
    (select private.has_filter_access(tenant_id))
    or exists (
      select 1 from public.profiles actor
      where actor.id = (select auth.uid())
        and actor.id = created_by_user_id
        and actor.tenant_id = filter_preregistrations.tenant_id
        and actor.rol::text = 'profesor'
        and actor.estatus = 'activo'
        and exists (
          select 1 from public.tenant_features feature
          where feature.tenant_id = actor.tenant_id
            and feature.primary_filter_enabled
        )
    )
  );

revoke all on public.filter_preregistrations from anon, authenticated;
grant select on public.filter_preregistrations to authenticated;
grant all on public.filter_preregistrations to service_role;
