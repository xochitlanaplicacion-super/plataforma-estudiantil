-- Paso 2: versionar el contexto académico existente sin reemplazar IDs.
-- Esta migración es aditiva y se valida primero en bases locales/staging.

create table public.ciclos_escolares (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  nombre text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  estado text not null default 'borrador',
  zona_horaria text not null default 'America/Mexico_City',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ciclos_escolares_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint ciclos_escolares_fechas_validas check (fecha_inicio < fecha_fin),
  constraint ciclos_escolares_estado_valido check (estado in ('borrador', 'activo', 'cerrado', 'archivado')),
  constraint ciclos_escolares_zona_no_vacia check (btrim(zona_horaria) <> ''),
  constraint ciclos_escolares_id_tenant_unique unique (id, tenant_id),
  constraint ciclos_escolares_tenant_nombre_unique unique (tenant_id, nombre)
);

create unique index ciclos_escolares_un_activo_por_tenant_idx
  on public.ciclos_escolares (tenant_id)
  where estado = 'activo';

create index ciclos_escolares_tenant_estado_fechas_idx
  on public.ciclos_escolares (tenant_id, estado, fecha_inicio, fecha_fin);

comment on table public.ciclos_escolares is
  'Versiones del ciclo escolar por tenant. Un tenant puede tener un solo ciclo activo.';

-- Claves candidatas que permiten que todas las FKs incluyan tenant_id.
create unique index if not exists academic_profiles_id_tenant_uidx
  on public.profiles (id, tenant_id);
create unique index if not exists academic_niveles_id_tenant_uidx
  on public.niveles (id, tenant_id);
create unique index if not exists academic_carreras_id_tenant_uidx
  on public.carreras (id, tenant_id);
create unique index if not exists academic_grados_id_tenant_uidx
  on public.grados (id, tenant_id);
create unique index if not exists academic_grupos_id_tenant_uidx
  on public.grupos (id, tenant_id);
create unique index if not exists academic_materias_id_tenant_uidx
  on public.materias (id, tenant_id);

-- Preparar columnas nuevas antes del backfill.
alter table public.inscripciones_alumno
  add column ciclo_escolar_id uuid,
  add column updated_at timestamptz not null default now();

alter table public.asignaciones_profesor
  add column ciclo_escolar_id uuid,
  add column tipo_participacion text not null default 'titular',
  add column vigencia_desde date,
  add column vigencia_hasta date,
  add column updated_at timestamptz not null default now();

alter table public.asignaciones_profesor
  add constraint asignaciones_profesor_tipo_participacion_valido
    check (tipo_participacion in ('titular', 'suplente', 'apoyo')),
  add constraint asignaciones_profesor_vigencia_valida
    check (vigencia_hasta is null or vigencia_desde <= vigencia_hasta);

alter table public.inscripciones_alumno
  add constraint inscripciones_alumno_fechas_validas
    check (fecha_fin is null or fecha_inicio <= fecha_fin);

-- grado_id era text en el esquema histórico. Sólo se convierte si todos los
-- valores no vacíos son UUID válidos; de otro modo se aborta sin pérdida.
do $grade_preflight$
begin
  if exists (
    select 1
    from public.asignaciones_profesor
    where nullif(btrim(grado_id), '') is not null
      and btrim(grado_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'asignaciones_profesor.grado_id contiene valores que no son UUID';
  end if;
end
$grade_preflight$;

alter table public.asignaciones_profesor
  alter column grado_id type uuid using nullif(btrim(grado_id), '')::uuid;

-- D-01: ciclo institucional autorizado para el backfill del Paso 2.
insert into public.ciclos_escolares (
  tenant_id, nombre, fecha_inicio, fecha_fin, estado, zona_horaria
)
select t.id, '2026-2027', date '2026-08-31', date '2027-07-16', 'activo', 'America/Mexico_City'
from public.tenants t
on conflict (tenant_id, nombre) do update
set fecha_inicio = excluded.fecha_inicio,
    fecha_fin = excluded.fecha_fin,
    zona_horaria = excluded.zona_horaria,
    updated_at = now();

-- Una fila activa previa por alumno/ciclo. Las filas duplicadas se conservan
-- como historial inactivo; nunca se eliminan ni cambian sus IDs.
with ranked as (
  select i.id,
         row_number() over (
           partition by i.tenant_id, i.alumno_id
           order by i.created_at desc nulls last, i.id
         ) as position
  from public.inscripciones_alumno i
  where coalesce(i.activo, true)
)
update public.inscripciones_alumno i
set activo = false,
    fecha_fin = coalesce(i.fecha_fin, greatest(current_date, i.fecha_inicio)),
    updated_at = now()
from ranked r
where i.id = r.id and r.position > 1;

-- Completar inscripciones históricas válidas desde su grupo y el ciclo activo.
update public.inscripciones_alumno i
set ciclo_escolar_id = c.id,
    nivel_id = ca.nivel_id,
    carrera_id = g.carrera_id,
    grado_id = g.grado_id,
    fecha_inicio = coalesce(i.fecha_inicio, c.fecha_inicio),
    activo = coalesce(i.activo, true),
    updated_at = now()
from public.ciclos_escolares c
join public.grupos g on g.tenant_id = c.tenant_id
join public.carreras ca on ca.id = g.carrera_id and ca.tenant_id = g.tenant_id
where i.tenant_id = c.tenant_id
  and c.estado = 'activo'
  and i.grupo_id = g.id
  and (
    i.ciclo_escolar_id is null
    or i.nivel_id is distinct from ca.nivel_id
    or i.carrera_id is distinct from g.carrera_id
    or i.grado_id is distinct from g.grado_id
    or i.fecha_inicio is null
    or i.activo is null
  );

-- profiles.grupo_id es la fuente únicamente durante este backfill inicial.
-- Una inscripción ya activa conserva su ID y se ajusta al grupo proyectado.
update public.inscripciones_alumno i
set grupo_id = p.grupo_id,
    nivel_id = ca.nivel_id,
    carrera_id = g.carrera_id,
    grado_id = g.grado_id,
    updated_at = now()
from public.profiles p
join public.grupos g on g.id = p.grupo_id and g.tenant_id = p.tenant_id
join public.carreras ca on ca.id = g.carrera_id and ca.tenant_id = g.tenant_id
where p.rol = 'alumno'
  and p.estatus = 'activo'
  and i.tenant_id = p.tenant_id
  and i.alumno_id = p.id
  and i.activo;

insert into public.inscripciones_alumno (
  tenant_id, alumno_id, ciclo_escolar_id, nivel_id, carrera_id, grado_id,
  grupo_id, fecha_inicio, activo
)
select p.tenant_id, p.id, c.id, ca.nivel_id, g.carrera_id, g.grado_id,
       g.id, c.fecha_inicio, true
from public.profiles p
join public.grupos g on g.id = p.grupo_id and g.tenant_id = p.tenant_id
join public.carreras ca on ca.id = g.carrera_id and ca.tenant_id = g.tenant_id
join public.ciclos_escolares c on c.tenant_id = p.tenant_id and c.estado = 'activo'
where p.rol = 'alumno'
  and p.estatus = 'activo'
  and not exists (
    select 1
    from public.inscripciones_alumno i
    where i.tenant_id = p.tenant_id
      and i.alumno_id = p.id
      and i.ciclo_escolar_id = c.id
      and i.activo
  );

-- Completar el ciclo, jerarquía y vigencia de asignaciones existentes.
update public.asignaciones_profesor a
set ciclo_escolar_id = c.id,
    nivel_id = ca.nivel_id,
    carrera_id = g.carrera_id,
    grado_id = g.grado_id,
    vigencia_desde = coalesce(a.vigencia_desde, c.fecha_inicio),
    activo = coalesce(a.activo, true),
    updated_at = now()
from public.ciclos_escolares c
join public.grupos g on g.tenant_id = c.tenant_id
join public.carreras ca on ca.id = g.carrera_id and ca.tenant_id = g.tenant_id
where a.tenant_id = c.tenant_id
  and c.estado = 'activo'
  and a.grupo_id = g.id;

-- Fallar de forma explícita antes de imponer NOT NULL: no se inventan grupos,
-- jerarquías, docentes, materias ni tenants para reparar datos huérfanos.
do $academic_preflight$
begin
  if exists (
    select 1 from public.profiles p
    where p.rol = 'alumno' and p.estatus = 'activo'
      and (p.tenant_id is null or p.grupo_id is null)
  ) then
    raise exception 'Hay alumnos activos sin tenant o grupo; se requiere conciliación previa';
  end if;

  if exists (
    select 1 from public.inscripciones_alumno i
    where i.alumno_id is null or i.grupo_id is null or i.ciclo_escolar_id is null
      or i.nivel_id is null or i.carrera_id is null or i.grado_id is null
      or i.fecha_inicio is null or i.activo is null
  ) then
    raise exception 'Hay inscripciones incompletas o huérfanas';
  end if;

  if exists (
    select 1 from public.asignaciones_profesor a
    where a.profesor_id is null or a.grupo_id is null or a.materia_id is null
      or a.ciclo_escolar_id is null or a.nivel_id is null
      or a.carrera_id is null or a.grado_id is null
      or a.vigencia_desde is null or a.activo is null
  ) then
    raise exception 'Hay asignaciones docentes incompletas o huérfanas';
  end if;
end
$academic_preflight$;

alter table public.inscripciones_alumno
  alter column alumno_id set not null,
  alter column ciclo_escolar_id set not null,
  alter column nivel_id set not null,
  alter column carrera_id set not null,
  alter column grado_id set not null,
  alter column grupo_id set not null,
  alter column fecha_inicio set not null,
  alter column activo set not null;

alter table public.asignaciones_profesor
  alter column profesor_id set not null,
  alter column ciclo_escolar_id set not null,
  alter column nivel_id set not null,
  alter column carrera_id set not null,
  alter column grado_id set not null,
  alter column grupo_id set not null,
  alter column materia_id set not null,
  alter column vigencia_desde set not null,
  alter column activo set not null;

-- Sustituir FKs simples por FKs compuestas tenant-safe.
alter table public.inscripciones_alumno
  drop constraint if exists inscripciones_alumno_alumno_id_fkey,
  drop constraint if exists inscripciones_alumno_nivel_id_fkey,
  drop constraint if exists inscripciones_alumno_carrera_id_fkey,
  drop constraint if exists inscripciones_alumno_grado_id_fkey,
  drop constraint if exists inscripciones_alumno_grupo_id_fkey,
  add constraint inscripciones_alumno_ciclo_tenant_fkey
    foreign key (ciclo_escolar_id, tenant_id)
    references public.ciclos_escolares (id, tenant_id) on delete restrict,
  add constraint inscripciones_alumno_alumno_tenant_fkey
    foreign key (alumno_id, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict,
  add constraint inscripciones_alumno_nivel_tenant_fkey
    foreign key (nivel_id, tenant_id)
    references public.niveles (id, tenant_id) on delete restrict,
  add constraint inscripciones_alumno_carrera_tenant_fkey
    foreign key (carrera_id, tenant_id)
    references public.carreras (id, tenant_id) on delete restrict,
  add constraint inscripciones_alumno_grado_tenant_fkey
    foreign key (grado_id, tenant_id)
    references public.grados (id, tenant_id) on delete restrict,
  add constraint inscripciones_alumno_grupo_tenant_fkey
    foreign key (grupo_id, tenant_id)
    references public.grupos (id, tenant_id) on delete restrict;

alter table public.asignaciones_profesor
  drop constraint if exists asignaciones_profesor_profesor_id_fkey,
  drop constraint if exists asignaciones_profesor_nivel_id_fkey,
  drop constraint if exists asignaciones_profesor_carrera_id_fkey,
  drop constraint if exists asignaciones_profesor_materia_id_fkey,
  drop constraint if exists fk_asignaciones_profesor_grupo,
  add constraint asignaciones_profesor_ciclo_tenant_fkey
    foreign key (ciclo_escolar_id, tenant_id)
    references public.ciclos_escolares (id, tenant_id) on delete restrict,
  add constraint asignaciones_profesor_profesor_tenant_fkey
    foreign key (profesor_id, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict,
  add constraint asignaciones_profesor_nivel_tenant_fkey
    foreign key (nivel_id, tenant_id)
    references public.niveles (id, tenant_id) on delete restrict,
  add constraint asignaciones_profesor_carrera_tenant_fkey
    foreign key (carrera_id, tenant_id)
    references public.carreras (id, tenant_id) on delete restrict,
  add constraint asignaciones_profesor_grado_tenant_fkey
    foreign key (grado_id, tenant_id)
    references public.grados (id, tenant_id) on delete restrict,
  add constraint asignaciones_profesor_grupo_tenant_fkey
    foreign key (grupo_id, tenant_id)
    references public.grupos (id, tenant_id) on delete restrict,
  add constraint asignaciones_profesor_materia_tenant_fkey
    foreign key (materia_id, tenant_id)
    references public.materias (id, tenant_id) on delete restrict;

alter table public.ciclos_escolares
  add constraint ciclos_escolares_created_by_tenant_fkey
    foreign key (created_by, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict;

create unique index inscripciones_alumno_un_activo_idx
  on public.inscripciones_alumno (tenant_id, alumno_id, ciclo_escolar_id)
  where activo;
create index inscripciones_alumno_clase_idx
  on public.inscripciones_alumno (tenant_id, ciclo_escolar_id, grupo_id)
  where activo;
create index inscripciones_alumno_clase_estado_idx
  on public.inscripciones_alumno (tenant_id, ciclo_escolar_id, grupo_id, activo);
create index inscripciones_alumno_alumno_ciclo_idx
  on public.inscripciones_alumno (tenant_id, alumno_id, ciclo_escolar_id);

create unique index asignaciones_profesor_clase_activa_idx
  on public.asignaciones_profesor (
    tenant_id, profesor_id, ciclo_escolar_id, grupo_id, materia_id, tipo_participacion
  ) where activo;
create index asignaciones_profesor_profesor_ciclo_idx
  on public.asignaciones_profesor (tenant_id, profesor_id, ciclo_escolar_id)
  where activo;
create index asignaciones_profesor_profesor_ciclo_estado_idx
  on public.asignaciones_profesor (tenant_id, profesor_id, ciclo_escolar_id, activo);
create index asignaciones_profesor_clase_idx
  on public.asignaciones_profesor (tenant_id, ciclo_escolar_id, grupo_id, materia_id)
  where activo;

-- Valida el rol y que la jerarquía desnormalizada corresponda al grupo.
create or replace function private.validate_academic_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_level uuid;
  group_career uuid;
  group_grade uuid;
  expected_role text;
begin
  select ca.nivel_id, g.carrera_id, g.grado_id
    into group_level, group_career, group_grade
  from public.grupos g
  join public.carreras ca on ca.id = g.carrera_id and ca.tenant_id = g.tenant_id
  where g.id = new.grupo_id and g.tenant_id = new.tenant_id;

  if not found then raise exception 'Grupo fuera del tenant o sin jerarquía'; end if;
  if new.nivel_id is distinct from group_level
     or new.carrera_id is distinct from group_career
     or new.grado_id is distinct from group_grade then
    raise exception 'La jerarquía académica no coincide con el grupo';
  end if;

  if tg_table_name = 'inscripciones_alumno' then
    expected_role := 'alumno';
    if not exists (
      select 1 from public.profiles p
      where p.id = new.alumno_id and p.tenant_id = new.tenant_id and p.rol = expected_role
    ) then raise exception 'El alumno no pertenece al tenant o no tiene rol alumno'; end if;
  else
    expected_role := 'profesor';
    if not exists (
      select 1 from public.profiles p
      where p.id = new.profesor_id and p.tenant_id = new.tenant_id and p.rol = expected_role
    ) then raise exception 'El profesor no pertenece al tenant o no tiene rol profesor'; end if;
    if not exists (
      select 1 from public.materias m
      where m.id = new.materia_id and m.tenant_id = new.tenant_id
        and (m.carrera_id is null or m.carrera_id = new.carrera_id)
        and (m.grado_id is null or m.grado_id = new.grado_id)
    ) then raise exception 'La materia no corresponde al tenant o grupo'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_academic_context() from public, anon, authenticated;

create trigger validate_academic_context
  before insert or update of tenant_id, alumno_id, nivel_id, carrera_id, grado_id, grupo_id
  on public.inscripciones_alumno
  for each row execute function private.validate_academic_context();
create trigger validate_academic_context
  before insert or update of tenant_id, profesor_id, nivel_id, carrera_id, grado_id, grupo_id, materia_id
  on public.asignaciones_profesor
  for each row execute function private.validate_academic_context();

-- Proyección temporal unidireccional: inscripción activa -> profiles.grupo_id.
create or replace function private.project_active_enrollment_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tenant uuid := coalesce(new.tenant_id, old.tenant_id);
  target_student uuid := coalesce(new.alumno_id, old.alumno_id);
  projected_group uuid;
begin
  select i.grupo_id into projected_group
  from public.inscripciones_alumno i
  join public.ciclos_escolares c
    on c.id = i.ciclo_escolar_id and c.tenant_id = i.tenant_id
  where i.tenant_id = target_tenant
    and i.alumno_id = target_student
    and i.activo
    and c.estado = 'activo'
  order by i.updated_at desc, i.id
  limit 1;

  update public.profiles
  set grupo_id = projected_group, updated_at = now()
  where id = target_student and tenant_id = target_tenant and rol = 'alumno';
  return coalesce(new, old);
end;
$$;
revoke all on function private.project_active_enrollment_to_profile() from public, anon, authenticated;

create trigger project_active_enrollment_to_profile
  after insert or update of activo, grupo_id, ciclo_escolar_id or delete
  on public.inscripciones_alumno
  for each row execute function private.project_active_enrollment_to_profile();

comment on column public.profiles.grupo_id is
  'Proyección temporal de la inscripción activa del ciclo activo. No es fuente de verdad.';

-- Timestamps consistentes.
create or replace function private.touch_academic_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
revoke all on function private.touch_academic_updated_at() from public, anon, authenticated;

create trigger touch_academic_updated_at before update on public.ciclos_escolares
  for each row execute function private.touch_academic_updated_at();
create trigger touch_academic_updated_at before update on public.inscripciones_alumno
  for each row execute function private.touch_academic_updated_at();
create trigger touch_academic_updated_at before update on public.asignaciones_profesor
  for each row execute function private.touch_academic_updated_at();

-- El trigger multitenant también cubre la tabla nueva.
create trigger enforce_tenant_id before insert or update on public.ciclos_escolares
  for each row execute function private.enforce_tenant_id();

-- Membresía activa: el usuario y el tenant deben estar activos.
create or replace function private.has_active_tenant_membership(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.tenants t on t.id = p.tenant_id
    where p.id = (select auth.uid())
      and p.tenant_id = target_tenant_id
      and p.estatus = 'activo'
      and t.estado = 'activo'
  );
$$;
revoke all on function private.has_active_tenant_membership(uuid) from public;
grant execute on function private.has_active_tenant_membership(uuid) to authenticated, service_role;

alter table public.ciclos_escolares enable row level security;
alter table public.ciclos_escolares force row level security;

create policy academic_active_tenant_boundary on public.ciclos_escolares
  as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)))
  with check ((select private.has_active_tenant_membership(tenant_id)));
create policy academic_cycle_member_select on public.ciclos_escolares
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy academic_cycle_admin_insert on public.ciclos_escolares
  for insert to authenticated
  with check ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));
create policy academic_cycle_admin_update on public.ciclos_escolares
  for update to authenticated
  using ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])))
  with check ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));

do $academic_rls$
declare target_table text;
begin
  foreach target_table in array array['inscripciones_alumno', 'asignaciones_profesor'] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('drop policy if exists tenant_admin_manage on public.%I', target_table);
    execute format('drop policy if exists tenant_member_read on public.%I', target_table);
    execute format('drop policy if exists academic_active_tenant_boundary on public.%I', target_table);
    execute format(
      'create policy academic_active_tenant_boundary on public.%I as restrictive for all to authenticated using ((select private.has_active_tenant_membership(tenant_id))) with check ((select private.has_active_tenant_membership(tenant_id)))',
      target_table
    );
    execute format(
      'create policy academic_admin_select on public.%I for select to authenticated using ((select private.has_tenant_role(tenant_id, array[''superuser'',''admin'']::text[])))',
      target_table
    );
    execute format(
      'create policy academic_admin_insert on public.%I for insert to authenticated with check ((select private.has_tenant_role(tenant_id, array[''superuser'',''admin'']::text[])))',
      target_table
    );
    execute format(
      'create policy academic_admin_update on public.%I for update to authenticated using ((select private.has_tenant_role(tenant_id, array[''superuser'',''admin'']::text[]))) with check ((select private.has_tenant_role(tenant_id, array[''superuser'',''admin'']::text[])))',
      target_table
    );
  end loop;
end
$academic_rls$;

create policy academic_student_own_enrollment_select on public.inscripciones_alumno
  for select to authenticated
  using (alumno_id = (select auth.uid()));
create policy academic_professor_own_assignment_select on public.asignaciones_profesor
  for select to authenticated
  using (profesor_id = (select auth.uid()));

revoke all on public.ciclos_escolares from anon, authenticated;
revoke all on public.inscripciones_alumno, public.asignaciones_profesor from anon, authenticated;
grant select, insert, update on public.ciclos_escolares to authenticated;
grant select, insert, update on public.inscripciones_alumno, public.asignaciones_profesor to authenticated;
grant select, insert, update, delete on public.ciclos_escolares,
  public.inscripciones_alumno, public.asignaciones_profesor to service_role;
