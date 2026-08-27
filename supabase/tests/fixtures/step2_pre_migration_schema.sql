-- Línea base académica mínima anterior al Paso 2.
-- Sólo contiene datos sintéticos y permite reconstruir pruebas sin depender
-- del proyecto remoto ni de su historia incompleta de migraciones.

drop schema if exists public cascade;
drop schema if exists private cascade;
create schema public;
create schema private;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant usage on schema private to postgres, anon, authenticated, service_role;

create extension if not exists pgtap with schema extensions;

create table public.step2_fixture_metadata (
  mode text primary key check (mode in ('clean', 'existing'))
);
insert into public.step2_fixture_metadata values ('clean');

create table public.tenants (
  id uuid primary key,
  nombre text not null,
  estado text not null check (estado in ('provisionando', 'activo', 'suspendido', 'cancelado'))
);

create table public.niveles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tenant_id uuid not null references public.tenants(id)
);
create table public.carreras (
  id uuid primary key default gen_random_uuid(),
  nivel_id uuid references public.niveles(id),
  nombre text not null,
  tenant_id uuid not null references public.tenants(id)
);
create table public.grados (
  id uuid primary key default gen_random_uuid(),
  carrera_id uuid references public.carreras(id),
  nombre text not null,
  tenant_id uuid not null references public.tenants(id)
);
create table public.grupos (
  id uuid primary key default gen_random_uuid(),
  grado_id uuid references public.grados(id),
  carrera_id uuid references public.carreras(id),
  nombre text not null,
  tenant_id uuid not null references public.tenants(id)
);
create table public.materias (
  id uuid primary key default gen_random_uuid(),
  carrera_id uuid references public.carreras(id),
  grado_id uuid references public.grados(id),
  nombre text not null,
  tenant_id uuid not null references public.tenants(id)
);
create table public.profiles (
  id uuid primary key,
  tenant_id uuid references public.tenants(id),
  rol text not null check (rol in ('superuser', 'admin', 'profesor', 'alumno')),
  estatus text not null default 'activo' check (estatus in ('activo', 'inactivo', 'suspendido')),
  nombre text not null,
  apellidos text not null,
  email text not null,
  curp text not null,
  grupo_id uuid references public.grupos(id) on delete set null,
  updated_at timestamptz default now()
);
create table public.inscripciones_alumno (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid references public.profiles(id) on delete cascade,
  nivel_id uuid references public.niveles(id),
  carrera_id uuid references public.carreras(id),
  grado_id uuid references public.grados(id),
  grupo_id uuid references public.grupos(id),
  fecha_inicio date default current_date,
  fecha_fin date,
  activo boolean default true,
  created_at timestamptz default now(),
  tenant_id uuid not null references public.tenants(id)
);
create table public.asignaciones_profesor (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid references public.profiles(id) on delete cascade,
  nivel_id uuid references public.niveles(id),
  carrera_id uuid references public.carreras(id),
  grado_id text,
  grupo_id uuid constraint fk_asignaciones_profesor_grupo references public.grupos(id) on delete cascade,
  materia_id uuid references public.materias(id) on delete cascade,
  activo boolean default true,
  created_at timestamptz default now(),
  tenant_id uuid not null references public.tenants(id)
);

create or replace function private.current_tenant_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select tenant_id from public.profiles where id = (select auth.uid()) limit 1;
$$;
create or replace function private.has_tenant_role(target_tenant_id uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and tenant_id = target_tenant_id
      and rol = any(allowed_roles) and estatus = 'activo'
  );
$$;
create or replace function private.enforce_tenant_id()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.tenant_id is distinct from new.tenant_id then
    raise exception 'tenant_id is immutable';
  end if;
  if new.tenant_id is null then new.tenant_id := private.current_tenant_id(); end if;
  if new.tenant_id is null then raise exception 'tenant_id is required'; end if;
  return new;
end;
$$;
grant execute on function private.current_tenant_id() to anon, authenticated, service_role;
grant execute on function private.has_tenant_role(uuid, text[]) to authenticated, service_role;

do $fixture_security$
declare target_table text;
begin
  foreach target_table in array array['inscripciones_alumno', 'asignaciones_profesor'] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format(
      'create policy tenant_boundary on public.%I as restrictive for all to public using (tenant_id = (select private.current_tenant_id())) with check (tenant_id = (select private.current_tenant_id()))',
      target_table
    );
    execute format(
      'create policy tenant_admin_manage on public.%I for all to authenticated using ((select private.has_tenant_role(tenant_id, array[''superuser'',''admin'']::text[]))) with check ((select private.has_tenant_role(tenant_id, array[''superuser'',''admin'']::text[])))',
      target_table
    );
    execute format(
      'create policy tenant_member_read on public.%I for select to authenticated using (tenant_id = (select private.current_tenant_id()))',
      target_table
    );
  end loop;
end
$fixture_security$;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
