-- Paso 3: periodos de evaluacion y esquemas versionados, siempre en escala 0-10.
-- Esta migracion es aditiva. No activa captura de calificaciones ni implementa
-- el cierre/reapertura; esos flujos requieren la auditoria de pasos posteriores.

create extension if not exists btree_gist with schema extensions;
set search_path = public, extensions;

-- Las asignaciones deben poder participar en FKs compuestas que incluyan ciclo
-- y tenant. No se cambia ningun ID ni se duplica una asignacion existente.
create unique index if not exists academic_assignments_id_tenant_cycle_uidx
  on public.asignaciones_profesor (id, tenant_id, ciclo_escolar_id);

create table public.periodos_evaluacion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ciclo_escolar_id uuid not null,
  nombre text not null,
  orden smallint not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  color_semantico text not null default 'primary',
  estado text not null default 'borrador',
  locked_at timestamptz,
  locked_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint periodos_evaluacion_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint periodos_evaluacion_orden_positivo check (orden > 0),
  constraint periodos_evaluacion_fechas_validas check (fecha_inicio <= fecha_fin),
  constraint periodos_evaluacion_color_semantico_valido
    check (color_semantico in ('primary', 'secondary', 'accent', 'muted')),
  constraint periodos_evaluacion_estado_valido
    check (estado in ('borrador', 'activo', 'cerrado')),
  constraint periodos_evaluacion_bloqueo_coherente check (
    (estado = 'cerrado' and locked_at is not null and locked_by is not null)
    or (estado <> 'cerrado' and locked_at is null and locked_by is null)
  ),
  constraint periodos_evaluacion_id_tenant_cycle_unique
    unique (id, tenant_id, ciclo_escolar_id),
  constraint periodos_evaluacion_tenant_cycle_order_unique
    unique (tenant_id, ciclo_escolar_id, orden),
  constraint periodos_evaluacion_tenant_cycle_name_unique
    unique (tenant_id, ciclo_escolar_id, nombre),
  constraint periodos_evaluacion_cycle_tenant_fkey
    foreign key (ciclo_escolar_id, tenant_id)
    references public.ciclos_escolares (id, tenant_id) on delete restrict,
  constraint periodos_evaluacion_created_by_tenant_fkey
    foreign key (created_by, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict,
  constraint periodos_evaluacion_locked_by_tenant_fkey
    foreign key (locked_by, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict,
  constraint periodos_evaluacion_no_overlap
    exclude using gist (
      tenant_id with =,
      ciclo_escolar_id with =,
      daterange(fecha_inicio, fecha_fin, '[]') with &&
    )
);

create unique index periodos_evaluacion_un_activo_por_ciclo_idx
  on public.periodos_evaluacion (tenant_id, ciclo_escolar_id)
  where estado = 'activo';
create index periodos_evaluacion_tenant_cycle_state_dates_idx
  on public.periodos_evaluacion (
    tenant_id, ciclo_escolar_id, estado, fecha_inicio, fecha_fin
  );
create index periodos_evaluacion_created_by_idx
  on public.periodos_evaluacion (tenant_id, created_by)
  where created_by is not null;
create index periodos_evaluacion_locked_by_idx
  on public.periodos_evaluacion (tenant_id, locked_by)
  where locked_by is not null;

comment on table public.periodos_evaluacion is
  'Ventanas no solapables, contenidas en un ciclo escolar y aisladas por tenant.';
comment on column public.periodos_evaluacion.color_semantico is
  'Token semantico de marca blanca; nunca contiene colores hexadecimales hardcodeados.';

create table public.esquemas_evaluacion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ciclo_escolar_id uuid not null,
  asignacion_profesor_id uuid not null,
  periodo_evaluacion_id uuid not null,
  nombre text not null,
  escala text generated always as ('0-10'::text) stored,
  calificacion_aprobatoria numeric(6,4) not null default 6.0000,
  decimales_mostrados smallint not null default 1,
  modo_redondeo text not null default 'half_up',
  regla_no_entrego text not null default 'zero_on_close',
  valor_no_entrego numeric(6,4) not null default 0.0000,
  regla_justificado text not null default 'exclude',
  estado text not null default 'borrador',
  version integer not null default 1,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint esquemas_evaluacion_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint esquemas_evaluacion_aprobatoria_0_10
    check (calificacion_aprobatoria between 0.0000 and 10.0000),
  constraint esquemas_evaluacion_decimales_validos
    check (decimales_mostrados between 0 and 2),
  constraint esquemas_evaluacion_redondeo_institucional
    check (modo_redondeo = 'half_up'),
  constraint esquemas_evaluacion_no_entrego_institucional
    check (regla_no_entrego = 'zero_on_close' and valor_no_entrego = 0.0000),
  constraint esquemas_evaluacion_justificado_institucional
    check (regla_justificado = 'exclude'),
  constraint esquemas_evaluacion_estado_valido
    check (estado in ('borrador', 'activo', 'archivado')),
  constraint esquemas_evaluacion_version_positiva check (version > 0),
  constraint esquemas_evaluacion_id_tenant_cycle_unique
    unique (id, tenant_id, ciclo_escolar_id),
  constraint esquemas_evaluacion_version_unique
    unique (
      tenant_id, asignacion_profesor_id, periodo_evaluacion_id, version
    ),
  constraint esquemas_evaluacion_assignment_tenant_cycle_fkey
    foreign key (asignacion_profesor_id, tenant_id, ciclo_escolar_id)
    references public.asignaciones_profesor (id, tenant_id, ciclo_escolar_id)
    on delete restrict,
  constraint esquemas_evaluacion_period_tenant_cycle_fkey
    foreign key (periodo_evaluacion_id, tenant_id, ciclo_escolar_id)
    references public.periodos_evaluacion (id, tenant_id, ciclo_escolar_id)
    on delete restrict,
  constraint esquemas_evaluacion_created_by_tenant_fkey
    foreign key (created_by, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict
);

-- Una combinacion asignacion/periodo tiene una sola version vigente. Versiones
-- anteriores se conservan como archivadas y nunca se sobreescriben.
create unique index esquemas_evaluacion_un_vigente_idx
  on public.esquemas_evaluacion (
    tenant_id, asignacion_profesor_id, periodo_evaluacion_id
  )
  where estado in ('borrador', 'activo');
create index esquemas_evaluacion_assignment_idx
  on public.esquemas_evaluacion (tenant_id, asignacion_profesor_id);
create index esquemas_evaluacion_period_idx
  on public.esquemas_evaluacion (tenant_id, periodo_evaluacion_id);
create index esquemas_evaluacion_cycle_state_idx
  on public.esquemas_evaluacion (tenant_id, ciclo_escolar_id, estado);
create index esquemas_evaluacion_created_by_idx
  on public.esquemas_evaluacion (tenant_id, created_by);

comment on table public.esquemas_evaluacion is
  'Reglas versionadas por asignacion y periodo. La escala es fija 0-10.';
comment on column public.esquemas_evaluacion.escala is
  'Columna generada e inmutable: no existe selector ni configuracion de otra escala.';

-- Autoridad PostgreSQL: el periodo debe quedar dentro de su ciclo y sus campos
-- de auditoria/tenant no pueden ser suplantados mediante escrituras directas.
create or replace function private.validate_evaluation_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cycle_start date;
  cycle_end date;
begin
  if tg_op = 'UPDATE' then
    if old.tenant_id is distinct from new.tenant_id
       or old.ciclo_escolar_id is distinct from new.ciclo_escolar_id
       or old.created_by is distinct from new.created_by
       or old.created_at is distinct from new.created_at then
      raise exception 'El tenant, ciclo y creador del periodo son inmutables';
    end if;
    if old.estado = 'cerrado' then
      raise exception 'Un periodo cerrado no es editable';
    end if;
  end if;

  select c.fecha_inicio, c.fecha_fin into cycle_start, cycle_end
  from public.ciclos_escolares c
  where c.id = new.ciclo_escolar_id and c.tenant_id = new.tenant_id;

  if not found then
    raise exception 'El ciclo no pertenece al tenant';
  end if;
  if new.fecha_inicio < cycle_start or new.fecha_fin > cycle_end then
    raise exception 'El periodo debe estar contenido en las fechas del ciclo';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_evaluation_period() from public, anon, authenticated;

create trigger validate_evaluation_period
  before insert or update on public.periodos_evaluacion
  for each row execute function private.validate_evaluation_period();

-- Tampoco se permite estrechar un ciclo de modo que deje periodos huerfanos.
create or replace function private.protect_cycle_period_boundaries()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.fecha_inicio is distinct from old.fecha_inicio
     or new.fecha_fin is distinct from old.fecha_fin then
    if exists (
      select 1 from public.periodos_evaluacion p
      where p.tenant_id = old.tenant_id
        and p.ciclo_escolar_id = old.id
        and (p.fecha_inicio < new.fecha_inicio or p.fecha_fin > new.fecha_fin)
    ) then
      raise exception 'Las nuevas fechas del ciclo dejarian periodos fuera de rango';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_cycle_period_boundaries() from public, anon, authenticated;

create trigger protect_cycle_period_boundaries
  before update of fecha_inicio, fecha_fin on public.ciclos_escolares
  for each row execute function private.protect_cycle_period_boundaries();

create or replace function private.validate_evaluation_scheme()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assignment_active boolean;
  period_state text;
begin
  if tg_op = 'UPDATE' then
    if old.tenant_id is distinct from new.tenant_id
       or old.ciclo_escolar_id is distinct from new.ciclo_escolar_id
       or old.asignacion_profesor_id is distinct from new.asignacion_profesor_id
       or old.periodo_evaluacion_id is distinct from new.periodo_evaluacion_id
       or old.version is distinct from new.version
       or old.created_by is distinct from new.created_by
       or old.created_at is distinct from new.created_at then
      raise exception 'El contexto, version y creador del esquema son inmutables';
    end if;
    if old.estado = 'archivado' then
      raise exception 'Un esquema archivado es historico e inmutable';
    end if;
    if old.estado = 'activo' and (
      new.estado <> 'archivado'
      or old.nombre is distinct from new.nombre
      or old.calificacion_aprobatoria is distinct from new.calificacion_aprobatoria
      or old.decimales_mostrados is distinct from new.decimales_mostrados
      or old.modo_redondeo is distinct from new.modo_redondeo
      or old.regla_no_entrego is distinct from new.regla_no_entrego
      or old.valor_no_entrego is distinct from new.valor_no_entrego
      or old.regla_justificado is distinct from new.regla_justificado
    ) then
      raise exception 'Un esquema activo solo puede archivarse sin reescribir sus reglas';
    end if;
  end if;

  select a.activo into assignment_active
  from public.asignaciones_profesor a
  where a.id = new.asignacion_profesor_id
    and a.tenant_id = new.tenant_id
    and a.ciclo_escolar_id = new.ciclo_escolar_id;
  if not found or not assignment_active then
    raise exception 'La asignacion no pertenece al contexto o no esta activa';
  end if;

  select p.estado into period_state
  from public.periodos_evaluacion p
  where p.id = new.periodo_evaluacion_id
    and p.tenant_id = new.tenant_id
    and p.ciclo_escolar_id = new.ciclo_escolar_id;
  if not found then
    raise exception 'El periodo no pertenece al contexto';
  end if;
  if period_state = 'cerrado' then
    raise exception 'No se puede crear ni editar un esquema de un periodo cerrado';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_evaluation_scheme() from public, anon, authenticated;

create trigger validate_evaluation_scheme
  before insert or update on public.esquemas_evaluacion
  for each row execute function private.validate_evaluation_scheme();

create or replace function private.protect_closed_period_scheme_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.periodos_evaluacion p
    where p.id = old.periodo_evaluacion_id
      and p.tenant_id = old.tenant_id
      and p.estado = 'cerrado'
  ) then
    raise exception 'No se puede borrar un esquema de un periodo cerrado';
  end if;
  return old;
end;
$$;
revoke all on function private.protect_closed_period_scheme_delete() from public, anon, authenticated;

create trigger protect_closed_period_scheme_delete
  before delete on public.esquemas_evaluacion
  for each row execute function private.protect_closed_period_scheme_delete();

create trigger touch_academic_updated_at
  before update on public.periodos_evaluacion
  for each row execute function private.touch_academic_updated_at();
create trigger touch_academic_updated_at
  before update on public.esquemas_evaluacion
  for each row execute function private.touch_academic_updated_at();
create trigger enforce_tenant_id
  before insert or update on public.periodos_evaluacion
  for each row execute function private.enforce_tenant_id();
create trigger enforce_tenant_id
  before insert or update on public.esquemas_evaluacion
  for each row execute function private.enforce_tenant_id();

-- D-02: periodos institucionales iniciales. Sólo se crean para el ciclo
-- canónico y quedan en borrador; no se inventan esquemas por asignacion.
insert into public.periodos_evaluacion (
  tenant_id, ciclo_escolar_id, nombre, orden, fecha_inicio, fecha_fin,
  color_semantico, estado
)
select c.tenant_id, c.id, seed.nombre, seed.orden, seed.fecha_inicio,
       seed.fecha_fin, seed.color_semantico, 'borrador'
from public.ciclos_escolares c
cross join (
  values
    ('Periodo 1', 1::smallint, date '2026-08-31', date '2026-11-27', 'primary'),
    ('Periodo 2', 2::smallint, date '2026-11-28', date '2027-03-12', 'secondary'),
    ('Periodo 3', 3::smallint, date '2027-03-13', date '2027-07-16', 'accent')
) as seed(nombre, orden, fecha_inicio, fecha_fin, color_semantico)
where c.nombre in ('2026-2027', '2026–2027')
  and c.fecha_inicio <= seed.fecha_inicio
  and c.fecha_fin >= seed.fecha_fin
on conflict (tenant_id, ciclo_escolar_id, orden) do nothing;

-- RLS: frontera restrictiva comun y politicas permisivas separadas por accion.
alter table public.periodos_evaluacion enable row level security;
alter table public.periodos_evaluacion force row level security;
alter table public.esquemas_evaluacion enable row level security;
alter table public.esquemas_evaluacion force row level security;

create policy academic_active_tenant_boundary on public.periodos_evaluacion
  as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)))
  with check ((select private.has_active_tenant_membership(tenant_id)));

create policy academic_period_admin_select on public.periodos_evaluacion
  for select to authenticated
  using ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));
create policy academic_period_professor_related_select on public.periodos_evaluacion
  for select to authenticated
  using (exists (
    select 1 from public.asignaciones_profesor a
    where a.tenant_id = periodos_evaluacion.tenant_id
      and a.ciclo_escolar_id = periodos_evaluacion.ciclo_escolar_id
      and a.profesor_id = (select auth.uid())
      and a.activo
  ));
create policy academic_period_student_related_select on public.periodos_evaluacion
  for select to authenticated
  using (exists (
    select 1 from public.inscripciones_alumno i
    where i.tenant_id = periodos_evaluacion.tenant_id
      and i.ciclo_escolar_id = periodos_evaluacion.ciclo_escolar_id
      and i.alumno_id = (select auth.uid())
      and i.activo
  ));
create policy academic_period_admin_insert on public.periodos_evaluacion
  for insert to authenticated
  with check (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    and created_by = (select auth.uid())
    and estado <> 'cerrado'
  );
create policy academic_period_admin_update on public.periodos_evaluacion
  for update to authenticated
  using (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    and estado <> 'cerrado'
  )
  with check (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    and estado <> 'cerrado'
  );

create policy academic_active_tenant_boundary on public.esquemas_evaluacion
  as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)))
  with check ((select private.has_active_tenant_membership(tenant_id)));
create policy academic_scheme_admin_select on public.esquemas_evaluacion
  for select to authenticated
  using ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));
create policy academic_scheme_professor_own_select on public.esquemas_evaluacion
  for select to authenticated
  using (exists (
    select 1 from public.asignaciones_profesor a
    where a.id = esquemas_evaluacion.asignacion_profesor_id
      and a.tenant_id = esquemas_evaluacion.tenant_id
      and a.profesor_id = (select auth.uid())
      and a.activo
  ));
create policy academic_scheme_admin_insert on public.esquemas_evaluacion
  for insert to authenticated
  with check (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    and created_by = (select auth.uid())
  );
create policy academic_scheme_admin_update on public.esquemas_evaluacion
  for update to authenticated
  using ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])))
  with check ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));

-- Las tablas nuevas no se exponen por defecto. Las concesiones son deliberadas:
-- sin DELETE para authenticated y sin ningun privilegio para anon.
revoke all on public.periodos_evaluacion, public.esquemas_evaluacion
  from public, anon, authenticated;
grant select, insert, update on public.periodos_evaluacion, public.esquemas_evaluacion
  to authenticated;
grant select, insert, update, delete on public.periodos_evaluacion,
  public.esquemas_evaluacion to service_role;

reset search_path;
