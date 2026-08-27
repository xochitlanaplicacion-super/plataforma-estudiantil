-- Paso 4: criterios, subcriterios y ponderaciones porcentuales exactas.
-- Los porcentajes permanecen en 0-100 y nunca son calificaciones 0-10.

set search_path = public, extensions;

-- La procedencia permite copiar/versionar de forma idempotente sin modificar
-- el esquema histórico. La FK incluye tenant y ciclo para evitar cruces.
alter table public.esquemas_evaluacion
  add column copiado_desde_id uuid,
  add constraint esquemas_evaluacion_copiado_desde_tenant_cycle_fkey
    foreign key (copiado_desde_id, tenant_id, ciclo_escolar_id)
    references public.esquemas_evaluacion (id, tenant_id, ciclo_escolar_id)
    on delete restrict;

create unique index esquemas_evaluacion_copiado_desde_unique_idx
  on public.esquemas_evaluacion (copiado_desde_id, tenant_id)
  where copiado_desde_id is not null;

comment on column public.esquemas_evaluacion.copiado_desde_id is
  'Esquema histórico origen. Una fuente produce como máximo una copia idempotente.';

-- Clave candidata mínima para las FK hijas. El id sigue siendo globalmente
-- único; incluir tenant_id en la relación hace auditable el aislamiento.
create unique index esquemas_evaluacion_id_tenant_unique_idx
  on public.esquemas_evaluacion (id, tenant_id);

-- Toda creación directa comienza como borrador v1 sin procedencia. Las RPC de
-- versionado, ejecutadas por su propietario tras autorizar al actor, son la
-- única vía que puede crear una versión posterior o cambiar el estado.
create or replace function private.enforce_evaluation_scheme_creation_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and (
    new.estado <> 'borrador' or new.version <> 1
    or new.copiado_desde_id is not null
  ) then
    raise exception 'Un esquema directo debe iniciar como borrador v1 sin origen';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_evaluation_scheme_creation_state()
  from public, anon, authenticated;
create trigger enforce_evaluation_scheme_creation_state
  before insert on public.esquemas_evaluacion
  for each row execute function private.enforce_evaluation_scheme_creation_state();

-- Validador JSON puro y cerrado. Las fuentes reales y sus vínculos se crean en
-- el Paso 5; aquí sólo se congela el contrato de configuración por tipo.
create or replace function private.is_valid_subcriterion_config(
  target_type text,
  target_config jsonb
)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  if target_config is null or jsonb_typeof(target_config) <> 'object' then
    return false;
  end if;

  case target_type
    when 'directo' then
      return target_config = '{}'::jsonb;
    when 'actividades' then
      return target_config = '{"agregacion":"promedio"}'::jsonb;
    when 'participacion' then
      if target_config = '{"modo":"maximo_grupo"}'::jsonb then
        return true;
      end if;
      if target_config ? 'meta'
         and target_config - 'meta' = '{"modo":"meta_fija"}'::jsonb
         and jsonb_typeof(target_config -> 'meta') = 'number' then
        return (target_config ->> 'meta')::numeric > 0;
      end if;
      return false;
    else
      return false;
  end case;
exception
  when numeric_value_out_of_range or invalid_text_representation then
    return false;
end;
$$;
revoke all on function private.is_valid_subcriterion_config(text, jsonb)
  from public, anon;
grant execute on function private.is_valid_subcriterion_config(text, jsonb)
  to authenticated, service_role;

create or replace function private.academic_effective_weight(
  criterion_weight numeric,
  internal_weight numeric
)
returns numeric
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  if criterion_weight is null or internal_weight is null
     or criterion_weight < 0 or criterion_weight > 100
     or internal_weight < 0 or internal_weight > 100 then
    raise exception 'Los pesos porcentuales deben estar entre 0 y 100'
      using errcode = '22003';
  end if;
  return round((criterion_weight * internal_weight) / 100.0000, 4);
end;
$$;
revoke all on function private.academic_effective_weight(numeric, numeric)
  from public, anon;
grant execute on function private.academic_effective_weight(numeric, numeric)
  to authenticated, service_role;

create table public.criterios_evaluacion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  esquema_evaluacion_id uuid not null,
  nombre text not null,
  tipo text not null,
  peso numeric(7,4) not null,
  orden smallint not null,
  activo boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint criterios_evaluacion_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint criterios_evaluacion_tipo_valido
    check (tipo in ('directo', 'actividades', 'participacion', 'hibrido')),
  constraint criterios_evaluacion_peso_0_100
    check (peso between 0.0000 and 100.0000),
  constraint criterios_evaluacion_orden_positivo check (orden > 0),
  constraint criterios_evaluacion_id_tenant_unique unique (id, tenant_id),
  constraint criterios_evaluacion_esquema_orden_unique
    unique (tenant_id, esquema_evaluacion_id, orden),
  constraint criterios_evaluacion_esquema_tenant_fkey
    foreign key (esquema_evaluacion_id, tenant_id)
    references public.esquemas_evaluacion (id, tenant_id) on delete restrict,
  constraint criterios_evaluacion_created_by_tenant_fkey
    foreign key (created_by, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict
);

create unique index criterios_evaluacion_esquema_nombre_unique_idx
  on public.criterios_evaluacion (
    tenant_id, esquema_evaluacion_id, lower(btrim(nombre))
  );
create index criterios_evaluacion_esquema_activos_idx
  on public.criterios_evaluacion (tenant_id, esquema_evaluacion_id, orden)
  where activo;
create index criterios_evaluacion_created_by_idx
  on public.criterios_evaluacion (created_by, tenant_id);

comment on table public.criterios_evaluacion is
  'Ponderaciones superiores de un esquema. peso es porcentaje 0-100, no nota.';

create table public.subcriterios_evaluacion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  criterio_evaluacion_id uuid not null,
  nombre text not null,
  tipo text not null,
  peso_interno numeric(7,4) not null,
  orden smallint not null,
  configuracion jsonb not null,
  activo boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcriterios_evaluacion_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint subcriterios_evaluacion_tipo_valido
    check (tipo in ('directo', 'actividades', 'participacion')),
  constraint subcriterios_evaluacion_peso_0_100
    check (peso_interno between 0.0000 and 100.0000),
  constraint subcriterios_evaluacion_orden_positivo check (orden > 0),
  constraint subcriterios_evaluacion_configuracion_valida
    check (private.is_valid_subcriterion_config(tipo, configuracion)),
  constraint subcriterios_evaluacion_id_tenant_unique unique (id, tenant_id),
  constraint subcriterios_evaluacion_criterio_orden_unique
    unique (tenant_id, criterio_evaluacion_id, orden),
  constraint subcriterios_evaluacion_criterio_tenant_fkey
    foreign key (criterio_evaluacion_id, tenant_id)
    references public.criterios_evaluacion (id, tenant_id) on delete restrict,
  constraint subcriterios_evaluacion_created_by_tenant_fkey
    foreign key (created_by, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict
);

create unique index subcriterios_evaluacion_criterio_nombre_unique_idx
  on public.subcriterios_evaluacion (
    tenant_id, criterio_evaluacion_id, lower(btrim(nombre))
  );
create index subcriterios_evaluacion_criterio_activos_idx
  on public.subcriterios_evaluacion (
    tenant_id, criterio_evaluacion_id, orden
  ) where activo;
create index subcriterios_evaluacion_created_by_idx
  on public.subcriterios_evaluacion (created_by, tenant_id);

comment on table public.subcriterios_evaluacion is
  'Distribución interna porcentual. El peso efectivo es criterio × interno / 100.';

-- Cada mutación de configuración toma un bloqueo de fila corto sobre el
-- esquema. La activación usa el mismo bloqueo y evita una carrera TOCTOU.
create or replace function private.validate_evaluation_criterion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  scheme_state text;
  period_state text;
begin
  if tg_op = 'UPDATE' and (
    old.tenant_id is distinct from new.tenant_id
    or old.esquema_evaluacion_id is distinct from new.esquema_evaluacion_id
    or old.created_by is distinct from new.created_by
    or old.created_at is distinct from new.created_at
  ) then
    raise exception 'El tenant, esquema y creador del criterio son inmutables';
  end if;

  if tg_op = 'INSERT' and (select auth.uid()) is not null
     and new.created_by <> (select auth.uid()) then
    raise exception 'El creador del criterio debe ser el actor autenticado'
      using errcode = '42501';
  end if;

  select e.estado, p.estado into scheme_state, period_state
  from public.esquemas_evaluacion e
  join public.periodos_evaluacion p
    on p.id = e.periodo_evaluacion_id and p.tenant_id = e.tenant_id
  where e.id = new.esquema_evaluacion_id and e.tenant_id = new.tenant_id
  for update of e;

  if not found then
    raise exception 'El esquema no pertenece al tenant';
  end if;
  if scheme_state <> 'borrador' or period_state = 'cerrado' then
    raise exception 'Sólo se configura un esquema borrador de periodo editable';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_evaluation_criterion()
  from public, anon, authenticated;

create or replace function private.validate_evaluation_subcriterion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  scheme_state text;
  period_state text;
begin
  if tg_op = 'UPDATE' and (
    old.tenant_id is distinct from new.tenant_id
    or old.criterio_evaluacion_id is distinct from new.criterio_evaluacion_id
    or old.created_by is distinct from new.created_by
    or old.created_at is distinct from new.created_at
  ) then
    raise exception 'El tenant, criterio y creador del subcriterio son inmutables';
  end if;

  if tg_op = 'INSERT' and (select auth.uid()) is not null
     and new.created_by <> (select auth.uid()) then
    raise exception 'El creador del subcriterio debe ser el actor autenticado'
      using errcode = '42501';
  end if;

  select e.estado, p.estado into scheme_state, period_state
  from public.criterios_evaluacion c
  join public.esquemas_evaluacion e
    on e.id = c.esquema_evaluacion_id and e.tenant_id = c.tenant_id
  join public.periodos_evaluacion p
    on p.id = e.periodo_evaluacion_id and p.tenant_id = e.tenant_id
  where c.id = new.criterio_evaluacion_id and c.tenant_id = new.tenant_id
  for update of e;

  if not found then
    raise exception 'El criterio no pertenece al tenant';
  end if;
  if scheme_state <> 'borrador' or period_state = 'cerrado' then
    raise exception 'Sólo se configura un esquema borrador de periodo editable';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_evaluation_subcriterion()
  from public, anon, authenticated;

create or replace function private.protect_evaluation_criterion_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  scheme_state text;
begin
  if tg_table_name = 'criterios_evaluacion' then
    select e.estado into scheme_state
    from public.esquemas_evaluacion e
    where e.id = old.esquema_evaluacion_id and e.tenant_id = old.tenant_id
    for update;
  else
    select e.estado into scheme_state
    from public.criterios_evaluacion c
    join public.esquemas_evaluacion e
      on e.id = c.esquema_evaluacion_id and e.tenant_id = c.tenant_id
    where c.id = old.criterio_evaluacion_id and c.tenant_id = old.tenant_id
    for update of e;
  end if;

  if scheme_state is distinct from 'borrador' then
    raise exception 'No se borra configuración histórica o activa';
  end if;
  return old;
end;
$$;
revoke all on function private.protect_evaluation_criterion_delete()
  from public, anon, authenticated;

create trigger validate_evaluation_criterion
  before insert or update on public.criterios_evaluacion
  for each row execute function private.validate_evaluation_criterion();
create trigger validate_evaluation_subcriterion
  before insert or update on public.subcriterios_evaluacion
  for each row execute function private.validate_evaluation_subcriterion();
create trigger protect_evaluation_criterion_delete
  before delete on public.criterios_evaluacion
  for each row execute function private.protect_evaluation_criterion_delete();
create trigger protect_evaluation_subcriterion_delete
  before delete on public.subcriterios_evaluacion
  for each row execute function private.protect_evaluation_criterion_delete();
create trigger enforce_tenant_id
  before insert or update on public.criterios_evaluacion
  for each row execute function private.enforce_tenant_id();
create trigger enforce_tenant_id
  before insert or update on public.subcriterios_evaluacion
  for each row execute function private.enforce_tenant_id();
create trigger touch_academic_updated_at
  before update on public.criterios_evaluacion
  for each row execute function private.touch_academic_updated_at();
create trigger touch_academic_updated_at
  before update on public.subcriterios_evaluacion
  for each row execute function private.touch_academic_updated_at();

-- Activación atómica. Sólo recibe el ID y la versión histórica esperada; tenant,
-- actor y totales se derivan dentro de la transacción.
create or replace function public.activar_esquema_evaluacion(
  target_scheme_id uuid,
  expected_scheme_version integer
)
returns table (
  esquema_id uuid,
  estado text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_scheme public.esquemas_evaluacion%rowtype;
  active_count bigint;
  total_weight numeric(12,4);
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '28000';
  end if;

  select e.* into target_scheme
  from public.esquemas_evaluacion e
  where e.id = target_scheme_id
    and (select private.has_active_tenant_membership(e.tenant_id))
    and (select private.has_tenant_role(
      e.tenant_id, array['superuser','admin']::text[]
    ))
  for update;

  if not found then
    raise exception 'Esquema no encontrado' using errcode = 'P0002';
  end if;
  if not (select private.has_tenant_role(
    target_scheme.tenant_id, array['superuser','admin']::text[]
  )) then
    raise exception 'No autorizado para activar este esquema' using errcode = '42501';
  end if;
  if target_scheme.version <> expected_scheme_version then
    raise exception 'La versión esperada del esquema ya no es vigente'
      using errcode = '40001';
  end if;
  if target_scheme.estado <> 'borrador' then
    raise exception 'Sólo un esquema borrador puede activarse' using errcode = '55000';
  end if;

  select count(*), coalesce(sum(c.peso), 0.0000)
    into active_count, total_weight
  from public.criterios_evaluacion c
  where c.tenant_id = target_scheme.tenant_id
    and c.esquema_evaluacion_id = target_scheme.id
    and c.activo;

  if active_count = 0 then
    raise exception 'El esquema necesita al menos un criterio activo'
      using errcode = '23514';
  end if;
  if total_weight <> 100.0000 or exists (
    select 1 from public.criterios_evaluacion c
    where c.tenant_id = target_scheme.tenant_id
      and c.esquema_evaluacion_id = target_scheme.id
      and c.activo and c.peso <= 0
  ) then
    raise exception 'Los criterios activos deben sumar exactamente 100.0000 y ser positivos'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.criterios_evaluacion c
    left join lateral (
      select count(*) as child_count,
             coalesce(sum(s.peso_interno), 0.0000) as child_total,
             coalesce(bool_and(s.peso_interno > 0), true) as all_positive
      from public.subcriterios_evaluacion s
      where s.tenant_id = c.tenant_id
        and s.criterio_evaluacion_id = c.id
        and s.activo
    ) children on true
    where c.tenant_id = target_scheme.tenant_id
      and c.esquema_evaluacion_id = target_scheme.id
      and c.activo
      and (
        (children.child_count > 0 and (
          children.child_total <> 100.0000 or not children.all_positive
        ))
        or (c.tipo = 'hibrido' and children.child_count < 2)
        or (c.tipo <> 'hibrido' and exists (
          select 1 from public.subcriterios_evaluacion mismatched
          where mismatched.tenant_id = c.tenant_id
            and mismatched.criterio_evaluacion_id = c.id
            and mismatched.activo
            and mismatched.tipo <> c.tipo
        ))
      )
  ) then
    raise exception 'Los subcriterios activos son incompatibles o no suman exactamente 100.0000'
      using errcode = '23514';
  end if;

  update public.esquemas_evaluacion e
  set estado = 'activo'
  where e.id = target_scheme.id;

  return query
  select target_scheme.id, 'activo'::text, target_scheme.version;
end;
$$;
revoke all on function public.activar_esquema_evaluacion(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.activar_esquema_evaluacion(uuid, integer)
  to authenticated;

-- Copia/versionado atómico e idempotente por esquema origen. Si la llamada se
-- repite con los mismos parámetros devuelve la copia existente.
create or replace function public.copiar_esquema_evaluacion(
  source_scheme_id uuid,
  expected_source_version integer,
  new_scheme_name text
)
returns table (
  esquema_id uuid,
  estado text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_scheme public.esquemas_evaluacion%rowtype;
  existing_copy public.esquemas_evaluacion%rowtype;
  created_scheme public.esquemas_evaluacion%rowtype;
  source_criterion record;
  created_criterion_id uuid;
  next_version integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '28000';
  end if;
  if nullif(btrim(new_scheme_name), '') is null then
    raise exception 'El nombre de la nueva versión es obligatorio'
      using errcode = '22023';
  end if;

  select e.* into source_scheme
  from public.esquemas_evaluacion e
  where e.id = source_scheme_id
    and (select private.has_active_tenant_membership(e.tenant_id))
    and (select private.has_tenant_role(
      e.tenant_id, array['superuser','admin']::text[]
    ))
  for update;

  if not found then
    raise exception 'Esquema origen no encontrado' using errcode = 'P0002';
  end if;
  if not (select private.has_tenant_role(
    source_scheme.tenant_id, array['superuser','admin']::text[]
  )) then
    raise exception 'No autorizado para copiar este esquema' using errcode = '42501';
  end if;
  if source_scheme.version <> expected_source_version then
    raise exception 'La versión origen cambió' using errcode = '40001';
  end if;

  select e.* into existing_copy
  from public.esquemas_evaluacion e
  where e.copiado_desde_id = source_scheme.id
    and e.tenant_id = source_scheme.tenant_id;

  if found then
    if existing_copy.nombre <> btrim(new_scheme_name) then
      raise exception 'La fuente ya fue copiada con parámetros diferentes'
        using errcode = '23505';
    end if;
    return query
    select existing_copy.id, existing_copy.estado, existing_copy.version;
    return;
  end if;

  if source_scheme.estado not in ('activo', 'archivado') then
    raise exception 'Sólo se versiona un esquema activo o archivado'
      using errcode = '55000';
  end if;

  if source_scheme.estado = 'activo' then
    update public.esquemas_evaluacion
    set estado = 'archivado'
    where id = source_scheme.id;
  end if;

  if exists (
    select 1 from public.esquemas_evaluacion current_scheme
    where current_scheme.tenant_id = source_scheme.tenant_id
      and current_scheme.asignacion_profesor_id = source_scheme.asignacion_profesor_id
      and current_scheme.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id
      and current_scheme.id <> source_scheme.id
      and current_scheme.estado in ('borrador', 'activo')
  ) then
    raise exception 'Ya existe otra versión vigente para la asignación y periodo'
      using errcode = '23505';
  end if;

  select coalesce(max(e.version), 0) + 1 into next_version
  from public.esquemas_evaluacion e
  where e.tenant_id = source_scheme.tenant_id
    and e.asignacion_profesor_id = source_scheme.asignacion_profesor_id
    and e.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id;

  insert into public.esquemas_evaluacion (
    tenant_id, ciclo_escolar_id, asignacion_profesor_id,
    periodo_evaluacion_id, nombre, calificacion_aprobatoria,
    decimales_mostrados, modo_redondeo, regla_no_entrego,
    valor_no_entrego, regla_justificado, estado, version, created_by,
    copiado_desde_id
  ) values (
    source_scheme.tenant_id, source_scheme.ciclo_escolar_id,
    source_scheme.asignacion_profesor_id, source_scheme.periodo_evaluacion_id,
    btrim(new_scheme_name), source_scheme.calificacion_aprobatoria,
    source_scheme.decimales_mostrados, source_scheme.modo_redondeo,
    source_scheme.regla_no_entrego, source_scheme.valor_no_entrego,
    source_scheme.regla_justificado, 'borrador', next_version,
    (select auth.uid()), source_scheme.id
  ) returning * into created_scheme;

  for source_criterion in
    select c.* from public.criterios_evaluacion c
    where c.tenant_id = source_scheme.tenant_id
      and c.esquema_evaluacion_id = source_scheme.id
    order by c.orden, c.id
  loop
    insert into public.criterios_evaluacion (
      tenant_id, esquema_evaluacion_id, nombre, tipo, peso, orden,
      activo, created_by
    ) values (
      created_scheme.tenant_id, created_scheme.id, source_criterion.nombre,
      source_criterion.tipo, source_criterion.peso, source_criterion.orden,
      source_criterion.activo, (select auth.uid())
    ) returning id into created_criterion_id;

    insert into public.subcriterios_evaluacion (
      tenant_id, criterio_evaluacion_id, nombre, tipo, peso_interno,
      orden, configuracion, activo, created_by
    )
    select created_scheme.tenant_id, created_criterion_id, s.nombre, s.tipo,
           s.peso_interno, s.orden, s.configuracion, s.activo,
           (select auth.uid())
    from public.subcriterios_evaluacion s
    where s.tenant_id = source_scheme.tenant_id
      and s.criterio_evaluacion_id = source_criterion.id
    order by s.orden, s.id;
  end loop;

  return query
  select created_scheme.id, created_scheme.estado, created_scheme.version;
end;
$$;
revoke all on function public.copiar_esquema_evaluacion(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.copiar_esquema_evaluacion(uuid, integer, text)
  to authenticated;

-- El cliente edita únicamente reglas de un borrador. No puede escribir estado,
-- versión ni procedencia; activar/archivar/copiar queda encapsulado en las RPC.
revoke insert, update on public.esquemas_evaluacion from authenticated;
grant insert (
  tenant_id, ciclo_escolar_id, asignacion_profesor_id, periodo_evaluacion_id,
  nombre, calificacion_aprobatoria, decimales_mostrados, modo_redondeo,
  regla_no_entrego, valor_no_entrego, regla_justificado, created_by
) on public.esquemas_evaluacion to authenticated;
grant update (
  nombre, calificacion_aprobatoria, decimales_mostrados, modo_redondeo,
  regla_no_entrego, valor_no_entrego, regla_justificado
) on public.esquemas_evaluacion to authenticated;

-- RLS y grants explícitos: profesores sólo leen su asignación; alumno y anon no
-- reciben acceso en esta fase; sólo admin/superuser configuran borradores.
alter table public.criterios_evaluacion enable row level security;
alter table public.criterios_evaluacion force row level security;
alter table public.subcriterios_evaluacion enable row level security;
alter table public.subcriterios_evaluacion force row level security;

create policy academic_active_tenant_boundary on public.criterios_evaluacion
  as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)))
  with check ((select private.has_active_tenant_membership(tenant_id)));
create policy academic_criterion_admin_select on public.criterios_evaluacion
  for select to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));
create policy academic_criterion_professor_own_select on public.criterios_evaluacion
  for select to authenticated
  using (exists (
    select 1
    from public.esquemas_evaluacion e
    join public.asignaciones_profesor a
      on a.id = e.asignacion_profesor_id and a.tenant_id = e.tenant_id
    where e.id = criterios_evaluacion.esquema_evaluacion_id
      and e.tenant_id = criterios_evaluacion.tenant_id
      and a.profesor_id = (select auth.uid()) and a.activo
  ));
create policy academic_criterion_admin_insert on public.criterios_evaluacion
  for insert to authenticated
  with check (
    (select private.has_tenant_role(
      tenant_id, array['superuser','admin']::text[]
    )) and created_by = (select auth.uid())
  );
create policy academic_criterion_admin_update on public.criterios_evaluacion
  for update to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )))
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));

create policy academic_active_tenant_boundary on public.subcriterios_evaluacion
  as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)))
  with check ((select private.has_active_tenant_membership(tenant_id)));
create policy academic_subcriterion_admin_select on public.subcriterios_evaluacion
  for select to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));
create policy academic_subcriterion_professor_own_select on public.subcriterios_evaluacion
  for select to authenticated
  using (exists (
    select 1
    from public.criterios_evaluacion c
    join public.esquemas_evaluacion e
      on e.id = c.esquema_evaluacion_id and e.tenant_id = c.tenant_id
    join public.asignaciones_profesor a
      on a.id = e.asignacion_profesor_id and a.tenant_id = e.tenant_id
    where c.id = subcriterios_evaluacion.criterio_evaluacion_id
      and c.tenant_id = subcriterios_evaluacion.tenant_id
      and a.profesor_id = (select auth.uid()) and a.activo
  ));
create policy academic_subcriterion_admin_insert on public.subcriterios_evaluacion
  for insert to authenticated
  with check (
    (select private.has_tenant_role(
      tenant_id, array['superuser','admin']::text[]
    )) and created_by = (select auth.uid())
  );
create policy academic_subcriterion_admin_update on public.subcriterios_evaluacion
  for update to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )))
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));

revoke all on public.criterios_evaluacion, public.subcriterios_evaluacion
  from public, anon, authenticated;
grant select, insert, update on public.criterios_evaluacion,
  public.subcriterios_evaluacion to authenticated;
grant select, insert, update, delete on public.criterios_evaluacion,
  public.subcriterios_evaluacion to service_role;

reset search_path;
