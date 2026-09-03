create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

alter table public.profiles drop constraint if exists profiles_rol_check;
alter table public.profiles add constraint profiles_rol_check
  check (rol::text in ('superuser','admin','profesor','alumno','encargado_filtro'));

create table public.tenant_features (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  primary_filter_enabled boolean not null default false,
  timezone text not null default 'America/Mexico_City'
    check (length(btrim(timezone)) between 1 and 80),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.filter_staff_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  is_general boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.filter_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, name)
);

create table public.filter_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  level_id uuid not null references public.filter_levels(id) on delete cascade,
  grade_name text not null check (length(btrim(grade_name)) between 1 and 100),
  group_name text not null default 'A' check (length(btrim(group_name)) between 1 and 50),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, level_id, grade_name, group_name),
  unique (id, tenant_id)
);

create table public.filter_students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  group_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 2 and 220),
  normalized_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint filter_students_group_tenant_fk foreign key (group_id, tenant_id)
    references public.filter_groups(id, tenant_id) on delete cascade,
  unique (id, tenant_id),
  unique (tenant_id, group_id, normalized_name)
);

create index filter_students_search_idx on public.filter_students using gin (normalized_name extensions.gin_trgm_ops);
create index filter_students_group_idx on public.filter_students (tenant_id, group_id, active, full_name);

create table public.filter_reporters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 180),
  normalized_name text not null,
  last_used_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, normalized_name)
);
create index filter_reporters_search_idx on public.filter_reporters using gin (normalized_name extensions.gin_trgm_ops);

create table public.filter_alert_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default true,
  threshold integer not null default 3 check (threshold between 1 and 100),
  window_unit text not null default 'global' check (window_unit in ('days','months','years','global')),
  window_value integer not null default 1 check (window_value between 1 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.filter_late_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null,
  arrived_at timestamptz not null default now(),
  reason_code text not null default 'otro',
  reason_detail text,
  evidence_path text,
  registered_by_user_id uuid references auth.users(id) on delete set null,
  reporter_name text not null check (length(btrim(reporter_name)) between 2 and 180),
  created_at timestamptz not null default now(),
  constraint filter_late_student_tenant_fk foreign key (student_id, tenant_id)
    references public.filter_students(id, tenant_id) on delete restrict
);
create index filter_late_entries_student_time_idx on public.filter_late_entries (tenant_id, student_id, arrived_at desc);
create index filter_late_entries_time_idx on public.filter_late_entries (tenant_id, arrived_at desc);

create table public.filter_audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index filter_audit_tenant_time_idx on public.filter_audit_log (tenant_id, created_at desc);

insert into public.tenant_features(tenant_id)
select id from public.tenants on conflict (tenant_id) do nothing;
insert into public.filter_alert_settings(tenant_id)
select id from public.tenants on conflict (tenant_id) do nothing;

create or replace function private.has_filter_access(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join public.tenant_features f on f.tenant_id = p.tenant_id and f.primary_filter_enabled
    where p.id = (select auth.uid()) and p.tenant_id = target_tenant_id
      and p.estatus = 'activo'
      and p.rol::text in ('superuser','admin','encargado_filtro')
  );
$$;
revoke all on function private.has_filter_access(uuid) from public;
grant execute on function private.has_filter_access(uuid) to authenticated, service_role;

do $rls$
declare table_name text;
begin
  foreach table_name in array array[
    'tenant_features','filter_staff_profiles','filter_levels','filter_groups',
    'filter_students','filter_reporters','filter_alert_settings','filter_late_entries','filter_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $rls$;

create policy filter_features_read on public.tenant_features for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy filter_staff_read on public.filter_staff_profiles for select to authenticated
  using ((select private.has_filter_access(tenant_id)));

do $policies$
declare table_name text;
begin
  foreach table_name in array array[
    'filter_levels','filter_groups','filter_students','filter_reporters',
    'filter_alert_settings','filter_late_entries'
  ] loop
    execute format(
      'create policy filter_tenant_access on public.%I for all to authenticated using ((select private.has_filter_access(tenant_id))) with check ((select private.has_filter_access(tenant_id)))',
      table_name
    );
  end loop;
end $policies$;

create policy filter_audit_read on public.filter_audit_log for select to authenticated
  using ((select private.has_filter_access(tenant_id)));

grant select on public.tenant_features, public.filter_staff_profiles to authenticated;
grant select, insert, update, delete on public.filter_levels, public.filter_groups,
  public.filter_students, public.filter_reporters, public.filter_alert_settings,
  public.filter_late_entries to authenticated;
grant select on public.filter_audit_log to authenticated;
grant usage, select on sequence public.filter_audit_log_id_seq to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('filtro-evidencias','filtro-evidencias',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.can_access_storage_object(
  target_bucket text, object_name text, mutation boolean default false
) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := storage.foldername(object_name);
  tenant uuid := private.current_tenant_id();
begin
  if tenant is null or parts[1] is distinct from tenant::text then return false; end if;
  if target_bucket = 'filtro-evidencias' then
    return private.has_filter_access(tenant);
  end if;
  if not mutation then return true; end if;
  if target_bucket = 'avatars' then
    return parts[3] = (select auth.uid())::text or private.has_tenant_role(tenant,array['superuser','admin']::text[]);
  elsif target_bucket = 'entregas-alumnos' then
    return parts[3] = (select auth.uid())::text or private.has_tenant_role(tenant,array['superuser','admin','profesor']::text[]);
  elsif target_bucket in ('logos-institucion','programas-archivos','credenciales-watermark','credenciales-reverso') then
    return private.has_tenant_role(tenant,array['superuser','admin']::text[]);
  elsif target_bucket in ('material-apoyo','diapositivas-assets','recursos-educativos') then
    return private.has_tenant_role(tenant,array['superuser','admin','profesor']::text[]);
  end if;
  return false;
end; $$;
revoke all on function private.can_access_storage_object(text,text,boolean) from public;
grant execute on function private.can_access_storage_object(text,text,boolean) to authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare safe_role text; safe_tenant_id uuid;
begin
  if new.raw_app_meta_data->>'role' = 'platform_admin' then
    return new;
  end if;
  safe_role := case when new.raw_app_meta_data->>'role' in ('superuser','admin','profesor','alumno','encargado_filtro')
    then new.raw_app_meta_data->>'role' else 'alumno' end;
  begin safe_tenant_id := nullif(new.raw_app_meta_data->>'tenant_id','')::uuid;
  exception when invalid_text_representation then safe_tenant_id := null; end;
  insert into public.profiles(id,email,nombre,apellidos,curp,rol,estatus,matricula,numero_empleado,tenant_id)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'nombre',''),coalesce(new.raw_user_meta_data->>'apellidos',''),
    coalesce(new.raw_user_meta_data->>'curp',''),safe_role,case when safe_tenant_id is null then 'inactivo' else 'activo' end,
    coalesce(new.raw_user_meta_data->>'matricula',''),coalesce(new.raw_user_meta_data->>'numero_empleado',''),safe_tenant_id)
  on conflict(id) do nothing;
  return new;
end; $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
