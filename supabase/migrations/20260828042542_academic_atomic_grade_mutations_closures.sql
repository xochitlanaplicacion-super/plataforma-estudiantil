-- Paso 8: mutaciones académicas atómicas, idempotentes y auditadas; cierres
-- versionados por asignación/periodo sin bloquear otras materias del periodo.
set search_path = '';

-- Compatibilidad reproducible con instalaciones antiguas y fixtures mínimos.
-- En producción esta identidad ya existe desde la fundación multitenant.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke insert, update, delete on public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated, service_role;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = (select auth.uid()) and pa.activo
  );
$$;
revoke all on function private.is_platform_admin()
  from public, anon, authenticated;
grant execute on function private.is_platform_admin()
  to authenticated, service_role;

-- La tabla existe en producción desde el sistema legado. La definición
-- condicional mantiene reproducibles los entornos locales mínimos.
create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  accion varchar not null,
  entidad varchar not null,
  entidad_id uuid,
  detalles jsonb,
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants(id) on delete restrict
);

create index if not exists academic_audit_tenant_created_idx
  on public.auditoria (tenant_id, created_at desc);
create index if not exists academic_audit_correlation_idx
  on public.auditoria (tenant_id, ((detalles ->> 'correlationId')))
  where accion like 'academic.%';

create table public.solicitudes_mutacion_academica (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_id uuid not null,
  operacion text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  correlation_id uuid not null,
  respuesta jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint solicitudes_mutacion_operacion_valida
    check (operacion in ('upsert_grades', 'close_grades', 'reopen_grades')),
  constraint solicitudes_mutacion_hash_no_vacio check (btrim(request_hash) <> ''),
  constraint solicitudes_mutacion_respuesta_coherente check (
    (respuesta is null and completed_at is null)
    or (respuesta is not null and completed_at is not null)
  ),
  constraint solicitudes_mutacion_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete restrict,
  constraint solicitudes_mutacion_actor_tenant_fkey
    foreign key (actor_id, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict,
  constraint solicitudes_mutacion_idempotency_unique
    unique (tenant_id, actor_id, operacion, idempotency_key)
);

create index solicitudes_mutacion_tenant_created_idx
  on public.solicitudes_mutacion_academica (tenant_id, created_at desc);

create table public.cierres_calificaciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ciclo_escolar_id uuid not null,
  inscripcion_id uuid not null,
  asignacion_id uuid not null,
  periodo_id uuid not null,
  esquema_id uuid not null,
  esquema_version integer not null,
  resultado_exacto numeric(6,4) not null,
  resultado_visual numeric(6,2) not null,
  breakdown jsonb not null,
  version_cierre integer not null,
  estado text not null,
  motivo text not null,
  correlation_id uuid not null,
  snapshot_parent_id uuid,
  closed_by uuid not null,
  closed_at timestamptz not null default now(),
  constraint cierres_resultado_exacto_0_10
    check (resultado_exacto between 0.0000 and 10.0000),
  constraint cierres_resultado_visual_0_10
    check (resultado_visual between 0.00 and 10.00),
  constraint cierres_breakdown_objeto check (jsonb_typeof(breakdown) = 'object'),
  constraint cierres_versiones_positivas
    check (esquema_version > 0 and version_cierre > 0),
  constraint cierres_estado_valido check (estado in ('cerrado', 'reabierto')),
  constraint cierres_motivo_no_vacio check (btrim(motivo) <> ''),
  constraint cierres_id_tenant_unique unique (id, tenant_id),
  constraint cierres_version_unique
    unique (tenant_id, inscripcion_id, asignacion_id, periodo_id, version_cierre),
  constraint cierres_enrollment_tenant_cycle_fkey
    foreign key (inscripcion_id, tenant_id, ciclo_escolar_id)
    references public.inscripciones_alumno(id, tenant_id, ciclo_escolar_id)
    on delete restrict,
  constraint cierres_assignment_tenant_cycle_fkey
    foreign key (asignacion_id, tenant_id, ciclo_escolar_id)
    references public.asignaciones_profesor(id, tenant_id, ciclo_escolar_id)
    on delete restrict,
  constraint cierres_period_tenant_cycle_fkey
    foreign key (periodo_id, tenant_id, ciclo_escolar_id)
    references public.periodos_evaluacion(id, tenant_id, ciclo_escolar_id)
    on delete restrict,
  constraint cierres_scheme_tenant_cycle_fkey
    foreign key (esquema_id, tenant_id, ciclo_escolar_id)
    references public.esquemas_evaluacion(id, tenant_id, ciclo_escolar_id)
    on delete restrict,
  constraint cierres_actor_tenant_fkey
    foreign key (closed_by, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict,
  constraint cierres_parent_tenant_fkey
    foreign key (snapshot_parent_id, tenant_id)
    references public.cierres_calificaciones(id, tenant_id) on delete restrict
);

create index cierres_scope_latest_idx
  on public.cierres_calificaciones
    (tenant_id, asignacion_id, periodo_id, version_cierre desc);
create index cierres_enrollment_history_idx
  on public.cierres_calificaciones
    (tenant_id, inscripcion_id, asignacion_id, periodo_id, version_cierre desc);
create index cierres_actor_idx
  on public.cierres_calificaciones (tenant_id, closed_by, closed_at desc);
create index cierres_parent_idx
  on public.cierres_calificaciones (tenant_id, snapshot_parent_id)
  where snapshot_parent_id is not null;

comment on table public.cierres_calificaciones is
  'Libro inmutable de snapshots y reaperturas por matrícula, asignación y periodo.';
comment on table public.solicitudes_mutacion_academica is
  'Registro interno de idempotencia; no se expone para lectura o escritura directa.';

alter table public.solicitudes_mutacion_academica enable row level security;
alter table public.solicitudes_mutacion_academica force row level security;
alter table public.cierres_calificaciones enable row level security;
alter table public.cierres_calificaciones force row level security;
alter table public.auditoria enable row level security;

revoke all on public.solicitudes_mutacion_academica,
  public.cierres_calificaciones from public, anon, authenticated;
revoke insert, update, delete on public.auditoria from anon, authenticated;
grant select on public.cierres_calificaciones, public.auditoria
  to authenticated, service_role;
grant select, insert, update, delete on public.solicitudes_mutacion_academica,
  public.cierres_calificaciones to service_role;

drop policy if exists tenant_admin_manage on public.auditoria;
drop policy if exists academic_audit_tenant_read on public.auditoria;
create policy academic_audit_tenant_read on public.auditoria
  for select to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[]
  )));

create policy academic_closures_authorized_read
  on public.cierres_calificaciones for select to authenticated
  using ((select private.can_view_enrollment(
    tenant_id, inscripcion_id, asignacion_id
  )));

create or replace function private.academic_scope_is_closed(
  p_tenant_id uuid,
  p_assignment_id uuid,
  p_period_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.estado = 'cerrado'
    from public.cierres_calificaciones c
    where c.tenant_id = p_tenant_id
      and c.asignacion_id = p_assignment_id
      and c.periodo_id = p_period_id
    order by c.version_cierre desc
    limit 1
  ), false);
$$;

revoke all on function private.academic_scope_is_closed(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.academic_scope_is_closed(uuid, uuid, uuid)
  to authenticated, service_role;

create or replace function private.prevent_closure_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'PT409',
    message = 'ACADEMIC_SNAPSHOT_IMMUTABLE',
    detail = '{"code":"ACADEMIC_SNAPSHOT_IMMUTABLE"}';
end;
$$;
revoke all on function private.prevent_closure_mutation()
  from public, anon, authenticated;

create trigger prevent_closure_mutation
  before update or delete on public.cierres_calificaciones
  for each row execute function private.prevent_closure_mutation();

create or replace function private.prevent_academic_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.accion like 'academic.%' then
    raise exception using
      errcode = 'PT409',
      message = 'ACADEMIC_AUDIT_IMMUTABLE',
      detail = '{"code":"ACADEMIC_AUDIT_IMMUTABLE"}';
  end if;
  return old;
end;
$$;
revoke all on function private.prevent_academic_audit_mutation()
  from public, anon, authenticated;

create trigger prevent_academic_audit_mutation
  before update or delete on public.auditoria
  for each row execute function private.prevent_academic_audit_mutation();

-- Esta guarda es defensa en profundidad: incluso una escritura SQL directa
-- autorizada por una política anterior falla cuando el alcance está cerrado.
create or replace function private.reject_closed_academic_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  target_tenant uuid;
  target_assignment uuid;
  target_period uuid;
begin
  row_data := case when tg_op = 'INSERT' then to_jsonb(new) else to_jsonb(old) end;
  target_tenant := (row_data ->> 'tenant_id')::uuid;

  if tg_table_name in ('calificaciones_directas', 'eventos_participacion',
                       'vinculos_evaluacion_ejercicio', 'esquemas_evaluacion') then
    target_assignment := coalesce(
      (row_data ->> 'asignacion_profesor_id')::uuid,
      (row_data ->> 'asignacion_id')::uuid
    );
    target_period := coalesce(
      (row_data ->> 'periodo_evaluacion_id')::uuid,
      (row_data ->> 'periodo_id')::uuid
    );
  elsif tg_table_name = 'resultados_ejercicios' then
    select v.asignacion_profesor_id, v.periodo_evaluacion_id
      into target_assignment, target_period
    from public.vinculos_evaluacion_ejercicio v
    where v.id = (row_data ->> 'vinculo_evaluacion_id')::uuid
      and v.tenant_id = target_tenant;
  elsif tg_table_name = 'criterios_evaluacion' then
    select e.asignacion_profesor_id, e.periodo_evaluacion_id
      into target_assignment, target_period
    from public.esquemas_evaluacion e
    where e.id = (row_data ->> 'esquema_evaluacion_id')::uuid
      and e.tenant_id = target_tenant;
  elsif tg_table_name = 'subcriterios_evaluacion' then
    select e.asignacion_profesor_id, e.periodo_evaluacion_id
      into target_assignment, target_period
    from public.criterios_evaluacion c
    join public.esquemas_evaluacion e
      on e.id = c.esquema_evaluacion_id and e.tenant_id = c.tenant_id
    where c.id = (row_data ->> 'criterio_evaluacion_id')::uuid
      and c.tenant_id = target_tenant;
  elsif tg_table_name = 'periodos_evaluacion' then
    if exists (
      select 1
      from public.cierres_calificaciones c
      where c.tenant_id = target_tenant
        and c.periodo_id = (row_data ->> 'id')::uuid
        and c.estado = 'cerrado'
        and c.version_cierre = (
          select max(c2.version_cierre)
          from public.cierres_calificaciones c2
          where c2.tenant_id = c.tenant_id
            and c2.asignacion_id = c.asignacion_id
            and c2.periodo_id = c.periodo_id
        )
    ) then
      raise exception using
        errcode = 'PT409', message = 'ACADEMIC_SCOPE_CLOSED',
        detail = '{"code":"ACADEMIC_SCOPE_CLOSED"}';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if target_assignment is not null and target_period is not null
     and private.academic_scope_is_closed(
       target_tenant, target_assignment, target_period
     ) then
    raise exception using
      errcode = 'PT409', message = 'ACADEMIC_SCOPE_CLOSED',
      detail = jsonb_build_object(
        'code', 'ACADEMIC_SCOPE_CLOSED',
        'assignmentId', target_assignment,
        'periodId', target_period
      )::text;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.reject_closed_academic_scope()
  from public, anon, authenticated;

create trigger academic_reject_closed_scope
  before insert or update or delete on public.calificaciones_directas
  for each row execute function private.reject_closed_academic_scope();
create trigger academic_reject_closed_scope
  before insert or update or delete on public.resultados_ejercicios
  for each row execute function private.reject_closed_academic_scope();
create trigger academic_reject_closed_scope
  before insert on public.eventos_participacion
  for each row execute function private.reject_closed_academic_scope();
create trigger academic_reject_closed_scope
  before insert or update or delete on public.vinculos_evaluacion_ejercicio
  for each row execute function private.reject_closed_academic_scope();
create trigger academic_reject_closed_scope
  before insert or update or delete on public.esquemas_evaluacion
  for each row execute function private.reject_closed_academic_scope();
create trigger academic_reject_closed_scope
  before insert or update or delete on public.criterios_evaluacion
  for each row execute function private.reject_closed_academic_scope();
create trigger academic_reject_closed_scope
  before insert or update or delete on public.subcriterios_evaluacion
  for each row execute function private.reject_closed_academic_scope();
create trigger academic_reject_closed_scope
  before update or delete on public.periodos_evaluacion
  for each row execute function private.reject_closed_academic_scope();

-- Corrección aditiva del motor v1: la implementación sellada del Paso 7 usó
-- `warnings := warnings || evaluated -> 'warnings'` sin paréntesis. PostgreSQL
-- evaluaba la expresión como JSON null y con ello también anulaba `complete`.
-- Se conserva el motor numérico original y se normaliza sólo la explicación.
alter function public.calcular_calificacion_academica(jsonb)
  rename to calcular_calificacion_academica_paso7;
alter function public.calcular_calificacion_academica_paso7(jsonb)
  set schema private;
revoke all on function private.calcular_calificacion_academica_paso7(jsonb)
  from public, anon, authenticated;
grant execute on function private.calcular_calificacion_academica_paso7(jsonb)
  to authenticated, service_role;

create or replace function public.calcular_calificacion_academica(p_dataset jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  result jsonb := private.calcular_calificacion_academica_paso7(p_dataset);
  criterion jsonb;
  subcriterion jsonb;
  source jsonb;
  warnings jsonb := '[]'::jsonb;
  source_count integer;
  computable_criteria integer := 0;
  period_state text := p_dataset ->> 'periodState';
  warning_code text;
begin
  for criterion in
    select value from jsonb_array_elements(p_dataset -> 'criteria')
    order by (value ->> 'order')::integer, value ->> 'id'
  loop
    if jsonb_array_length(coalesce(criterion -> 'subcriteria', '[]'::jsonb)) = 0 then
      source_count := 0;
      for source in
        select value from jsonb_array_elements(coalesce(criterion -> 'sources', '[]'::jsonb))
        order by value ->> 'id'
      loop
        if source ->> 'state' = 'calificado'
           or (source ->> 'state' = 'no_entregado' and period_state = 'cerrado') then
          source_count := source_count + 1;
        else
          warning_code := case
            when source ->> 'state' = 'justificado' then 'JUSTIFIED_EXCLUDED'
            when source ->> 'state' = 'no_entregado' then 'NOT_SUBMITTED_OPEN_PERIOD'
            when coalesce((source ->> 'zeroDenominatorExcluded')::boolean, false)
              then 'ZERO_DENOMINATOR_EXCLUDED'
            else 'PENDING_SOURCE'
          end;
          warnings := warnings || jsonb_build_array(jsonb_build_object(
            'code', warning_code, 'criterionId', criterion ->> 'id',
            'subcriterionId', null, 'sourceId', source ->> 'id'
          ));
        end if;
      end loop;
      if source_count = 0 then
        warnings := warnings || jsonb_build_array(jsonb_build_object(
          'code', 'NO_COMPUTABLE_SOURCES', 'criterionId', criterion ->> 'id',
          'subcriterionId', null, 'sourceId', null
        ));
      elsif (criterion ->> 'weight')::numeric > 0 then
        computable_criteria := computable_criteria + 1;
      end if;
    else
      source_count := 0;
      for subcriterion in
        select value from jsonb_array_elements(criterion -> 'subcriteria')
        order by (value ->> 'order')::integer, value ->> 'id'
      loop
        declare
          sub_source_count integer := 0;
        begin
          for source in
            select value from jsonb_array_elements(coalesce(subcriterion -> 'sources', '[]'::jsonb))
            order by value ->> 'id'
          loop
            if source ->> 'state' = 'calificado'
               or (source ->> 'state' = 'no_entregado' and period_state = 'cerrado') then
              sub_source_count := sub_source_count + 1;
            else
              warning_code := case
                when source ->> 'state' = 'justificado' then 'JUSTIFIED_EXCLUDED'
                when source ->> 'state' = 'no_entregado' then 'NOT_SUBMITTED_OPEN_PERIOD'
                when coalesce((source ->> 'zeroDenominatorExcluded')::boolean, false)
                  then 'ZERO_DENOMINATOR_EXCLUDED'
                else 'PENDING_SOURCE'
              end;
              warnings := warnings || jsonb_build_array(jsonb_build_object(
                'code', warning_code, 'criterionId', criterion ->> 'id',
                'subcriterionId', subcriterion ->> 'id',
                'sourceId', source ->> 'id'
              ));
            end if;
          end loop;
          if sub_source_count = 0 then
            warnings := warnings || jsonb_build_array(jsonb_build_object(
              'code', 'NO_COMPUTABLE_SOURCES', 'criterionId', criterion ->> 'id',
              'subcriterionId', subcriterion ->> 'id', 'sourceId', null
            ));
          elsif (subcriterion ->> 'internalWeight')::numeric > 0 then
            source_count := source_count + 1;
          end if;
        end;
      end loop;
      if source_count > 0 and (criterion ->> 'weight')::numeric > 0 then
        computable_criteria := computable_criteria + 1;
      end if;
    end if;
  end loop;

  if computable_criteria = 0 then
    warnings := warnings || jsonb_build_array(jsonb_build_object(
      'code', 'NO_COMPUTABLE_CRITERIA', 'criterionId', null,
      'subcriterionId', null, 'sourceId', null
    ));
  end if;
  return result || jsonb_build_object(
    'warnings', warnings,
    'complete', not jsonb_path_exists(
      warnings,
      '$[*] ? (@.code == "PENDING_SOURCE" || @.code == "NOT_SUBMITTED_OPEN_PERIOD" || @.code == "ZERO_DENOMINATOR_EXCLUDED" || @.code == "NO_COMPUTABLE_SOURCES" || @.code == "NO_COMPUTABLE_CRITERIA")'
    )
  );
end;
$$;

revoke all on function public.calcular_calificacion_academica(jsonb)
  from public, anon, authenticated;
grant execute on function public.calcular_calificacion_academica(jsonb)
  to authenticated, service_role;

-- Construye exactamente el mismo dataset que el adaptador del Paso 7. El
-- parámetro de cierre sólo cambia la política de no-entrega; nunca el score.
create or replace function private.build_academic_calculation_dataset(
  p_assignment_id uuid,
  p_enrollment_id uuid,
  p_period_id uuid,
  p_force_closed boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  dataset jsonb;
  source_count integer;
begin
  select count(*) into source_count
  from public.vista_desglose_calificacion v
  where v.asignacion_profesor_id = p_assignment_id
    and v.inscripcion_alumno_id = p_enrollment_id
    and v.periodo_evaluacion_id = p_period_id;
  if source_count = 0 then
    raise exception 'El resultado académico no existe o no está disponible'
      using errcode = 'P0002';
  end if;
  if source_count > 1000 then
    raise exception 'El desglose excede el límite seguro' using errcode = '54000';
  end if;

  with rows as materialized (
    select v.*
    from public.vista_desglose_calificacion v
    where v.asignacion_profesor_id = p_assignment_id
      and v.inscripcion_alumno_id = p_enrollment_id
      and v.periodo_evaluacion_id = p_period_id
  ), subcriterion_sources as (
    select r.criterio_evaluacion_id, r.subcriterio_evaluacion_id,
      min(r.subcriterio_nombre) as label, min(r.subcriterio_tipo) as type,
      min(r.peso_interno) as internal_weight,
      jsonb_agg(jsonb_build_object(
        'id', coalesce(r.fuente_id::text, 'participation:' || r.criterio_evaluacion_id::text || ':' || r.subcriterio_evaluacion_id::text),
        'state', r.estado, 'scale', r.escala_fuente, 'value', r.valor_fuente,
        'zeroDenominatorExcluded', r.tipo_fuente = 'participation'
          and r.estado = 'pendiente' and r.valor_fuente is null
      ) order by r.fuente_id nulls last) as sources
    from rows r where r.subcriterio_evaluacion_id is not null
    group by r.criterio_evaluacion_id, r.subcriterio_evaluacion_id
  ), subcriteria as (
    select s.criterio_evaluacion_id,
      jsonb_agg(jsonb_build_object(
        'id', s.subcriterio_evaluacion_id, 'label', s.label, 'type', s.type,
        'internalWeight', s.internal_weight, 'order', s.row_number_value,
        'sources', s.sources
      ) order by s.subcriterio_evaluacion_id) as items
    from (
      select ss.*, row_number() over (
        partition by ss.criterio_evaluacion_id order by ss.subcriterio_evaluacion_id
      ) as row_number_value
      from subcriterion_sources ss
    ) s group by s.criterio_evaluacion_id
  ), parent_sources as (
    select r.criterio_evaluacion_id,
      jsonb_agg(jsonb_build_object(
        'id', coalesce(r.fuente_id::text, 'participation:' || r.criterio_evaluacion_id::text || ':parent'),
        'state', r.estado, 'scale', r.escala_fuente, 'value', r.valor_fuente,
        'zeroDenominatorExcluded', r.tipo_fuente = 'participation'
          and r.estado = 'pendiente' and r.valor_fuente is null
      ) order by r.fuente_id nulls last) as sources
    from rows r where r.subcriterio_evaluacion_id is null
    group by r.criterio_evaluacion_id
  ), criterion_base as (
    select r.criterio_evaluacion_id, min(r.criterio_nombre) as label,
      min(r.criterio_tipo) as type, min(r.criterio_peso) as weight
    from rows r group by r.criterio_evaluacion_id
  ), criteria as (
    select jsonb_agg(jsonb_build_object(
      'id', c.criterio_evaluacion_id, 'label', c.label, 'type', c.type,
      'weight', c.weight, 'order', c.row_number_value,
      'sources', coalesce(p.sources, '[]'::jsonb),
      'subcriteria', coalesce(s.items, '[]'::jsonb)
    ) order by c.criterio_evaluacion_id) as items
    from (
      select cb.*, row_number() over (order by cb.criterio_evaluacion_id)
        as row_number_value
      from criterion_base cb
    ) c
    left join parent_sources p using (criterio_evaluacion_id)
    left join subcriteria s using (criterio_evaluacion_id)
  )
  select jsonb_build_object(
    'periodState', case when p_force_closed then 'cerrado' else pe.estado end,
    'displayDecimals', ee.decimales_mostrados,
    'roundingMode', ee.modo_redondeo,
    'criteria', criteria.items
  ) into dataset
  from criteria
  join public.esquemas_evaluacion ee
    on ee.asignacion_profesor_id = p_assignment_id
   and ee.periodo_evaluacion_id = p_period_id and ee.estado = 'activo'
  join public.periodos_evaluacion pe
    on pe.id = ee.periodo_evaluacion_id and pe.tenant_id = ee.tenant_id;

  if dataset is null then
    raise exception 'No existe un esquema activo autorizado' using errcode = 'P0002';
  end if;
  return dataset;
end;
$$;

revoke all on function private.build_academic_calculation_dataset(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function private.build_academic_calculation_dataset(uuid, uuid, uuid, boolean)
  to authenticated, service_role;

create or replace function public.calcular_resultado_academico(
  p_asignacion_id uuid,
  p_inscripcion_id uuid,
  p_periodo_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.calcular_calificacion_academica(
    private.build_academic_calculation_dataset(
      p_asignacion_id, p_inscripcion_id, p_periodo_id, false
    )
  );
$$;

revoke all on function public.calcular_resultado_academico(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.calcular_resultado_academico(uuid, uuid, uuid)
  to authenticated, service_role;

create or replace function private.academic_validate_reason(p_reason text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_reason is null or length(btrim(p_reason)) < 3
     or length(btrim(p_reason)) > 500 then
    raise exception using
      errcode = 'PT422', message = 'ACADEMIC_REASON_INVALID',
      detail = '{"code":"ACADEMIC_REASON_INVALID","minLength":3,"maxLength":500}';
  end if;
  return btrim(p_reason);
end;
$$;
revoke all on function private.academic_validate_reason(text)
  from public, anon, authenticated;
grant execute on function private.academic_validate_reason(text)
  to authenticated, service_role;

create or replace function private.academic_closure_preview(
  p_tenant_id uuid,
  p_assignment_id uuid,
  p_period_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  enrollment record;
  result jsonb;
  students jsonb := '[]'::jsonb;
  missing_count integer := 0;
  total_count integer := 0;
begin
  for enrollment in
    select i.id
    from public.asignaciones_profesor a
    join public.inscripciones_alumno i
      on i.tenant_id = a.tenant_id
     and i.ciclo_escolar_id = a.ciclo_escolar_id
     and i.grupo_id = a.grupo_id and i.activo
    where a.id = p_assignment_id and a.tenant_id = p_tenant_id and a.activo
    order by i.id
  loop
    total_count := total_count + 1;
    begin
      result := public.calcular_calificacion_academica(
        private.build_academic_calculation_dataset(
          p_assignment_id, enrollment.id, p_period_id, true
        )
      );
      if coalesce((result ->> 'complete')::boolean, false) is false
         or result ->> 'exactGrade' is null then
        missing_count := missing_count + 1;
      end if;
      students := students || jsonb_build_array(jsonb_build_object(
        'enrollmentId', enrollment.id,
        'complete', coalesce((result ->> 'complete')::boolean, false),
        'exactGrade', result ->> 'exactGrade',
        'displayGrade', result ->> 'displayGrade',
        'warnings', coalesce(result -> 'warnings', '[]'::jsonb)
      ));
    exception when others then
      missing_count := missing_count + 1;
      students := students || jsonb_build_array(jsonb_build_object(
        'enrollmentId', enrollment.id,
        'complete', false,
        'exactGrade', null,
        'displayGrade', null,
        'warnings', jsonb_build_array(jsonb_build_object(
          'code', 'CALCULATION_UNAVAILABLE'
        ))
      ));
    end;
  end loop;
  return jsonb_build_object(
    'assignmentId', p_assignment_id,
    'periodId', p_period_id,
    'totalCount', total_count,
    'missingCount', missing_count,
    'canClose', total_count > 0 and missing_count = 0,
    'students', students
  );
end;
$$;
revoke all on function private.academic_closure_preview(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.previsualizar_cierre_calificaciones(
  p_asignacion_id uuid,
  p_periodo_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  tenant uuid;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_UNAUTHENTICATED';
  end if;
  if (select private.is_platform_admin()) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_PLATFORM_ADMIN_READ_ONLY';
  end if;
  select a.tenant_id into tenant
  from public.asignaciones_profesor a
  join public.periodos_evaluacion p
    on p.tenant_id = a.tenant_id and p.ciclo_escolar_id = a.ciclo_escolar_id
  where a.id = p_asignacion_id and p.id = p_periodo_id and a.activo;
  if tenant is null then
    raise exception using errcode = 'PT404', message = 'ACADEMIC_SCOPE_NOT_FOUND';
  end if;
  if not (select private.has_tenant_role(
    tenant, array['superuser','admin']::text[]
  )) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_CLOSE_FORBIDDEN';
  end if;
  return private.academic_closure_preview(tenant, p_asignacion_id, p_periodo_id);
end;
$$;

revoke all on function public.previsualizar_cierre_calificaciones(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.previsualizar_cierre_calificaciones(uuid, uuid)
  to authenticated, service_role;

create or replace function public.editar_calificaciones_academicas(
  p_asignacion_id uuid,
  p_periodo_id uuid,
  p_items jsonb,
  p_motivo text,
  p_idempotency_key uuid,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  tenant uuid;
  cycle_id uuid;
  assignment_group uuid;
  period_state text;
  reason text;
  correlation uuid := coalesce(p_correlation_id, gen_random_uuid());
  request_digest text;
  request_row public.solicitudes_mutacion_academica%rowtype;
  item jsonb;
  source_type text;
  source_id uuid;
  enrollment_id uuid;
  criterion_id uuid;
  subcriterion_id uuid;
  expected_version bigint;
  target_state text;
  target_grade numeric(6,4);
  target_observation text;
  student_id uuid;
  direct_before public.calificaciones_directas%rowtype;
  direct_after public.calificaciones_directas%rowtype;
  exercise_before public.resultados_ejercicios%rowtype;
  exercise_after public.resultados_ejercicios%rowtype;
  response_items jsonb := '[]'::jsonb;
  response jsonb;
  item_count integer;
  uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_UNAUTHENTICATED';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'ACADEMIC_IDEMPOTENCY_REQUIRED';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'PT400', message = 'ACADEMIC_ITEMS_INVALID';
  end if;
  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 100 or pg_column_size(p_items) > 262144 then
    raise exception using
      errcode = 'PT422', message = 'ACADEMIC_BATCH_LIMIT',
      detail = '{"code":"ACADEMIC_BATCH_LIMIT","maxRows":100,"maxBytes":262144}';
  end if;
  reason := private.academic_validate_reason(p_motivo);

  select a.tenant_id, a.ciclo_escolar_id, a.grupo_id, p.estado
    into tenant, cycle_id, assignment_group, period_state
  from public.asignaciones_profesor a
  join public.periodos_evaluacion p
    on p.tenant_id = a.tenant_id and p.ciclo_escolar_id = a.ciclo_escolar_id
  where a.id = p_asignacion_id and p.id = p_periodo_id and a.activo
  for update of p;
  if tenant is null then
    raise exception using errcode = 'PT404', message = 'ACADEMIC_SCOPE_NOT_FOUND';
  end if;
  if (select private.is_platform_admin()) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_PLATFORM_ADMIN_READ_ONLY';
  end if;
  if not (select private.can_manage_teaching_assignment(tenant, p_asignacion_id)) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_MUTATION_FORBIDDEN';
  end if;

  -- Validar forma antes de tomar locks de fuentes o registrar idempotencia.
  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception using errcode = 'PT400', message = 'ACADEMIC_ITEM_INVALID';
    end if;
    source_type := item ->> 'sourceType';
    if source_type not in ('directCriterion','automaticExercise','descriptiveSubmission') then
      raise exception using errcode = 'PT422', message = 'ACADEMIC_SOURCE_TYPE_INVALID';
    end if;
    if item ->> 'enrollmentId' !~ uuid_pattern
       or (item ->> 'expectedRowVersion') !~ '^[0-9]+$' then
      raise exception using errcode = 'PT400', message = 'ACADEMIC_ITEM_IDENTIFIER_INVALID';
    end if;
    if source_type = 'directCriterion' then
      if item ->> 'criterionId' !~ uuid_pattern
         or (item ? 'subcriterionId' and item ->> 'subcriterionId' is not null
             and item ->> 'subcriterionId' !~ uuid_pattern)
         or (item ? 'sourceId' and item ->> 'sourceId' is not null
             and item ->> 'sourceId' !~ uuid_pattern) then
        raise exception using errcode = 'PT400', message = 'ACADEMIC_ITEM_IDENTIFIER_INVALID';
      end if;
    elsif item ->> 'sourceId' !~ uuid_pattern then
      raise exception using errcode = 'PT400', message = 'ACADEMIC_ITEM_IDENTIFIER_INVALID';
    end if;
  end loop;

  request_digest := md5(jsonb_build_object(
    'assignmentId', p_asignacion_id,
    'periodId', p_periodo_id,
    'items', p_items,
    'reason', reason
  )::text);
  insert into public.solicitudes_mutacion_academica (
    tenant_id, actor_id, operacion, idempotency_key,
    request_hash, correlation_id
  ) values (
    tenant, actor, 'upsert_grades', p_idempotency_key,
    request_digest, correlation
  ) on conflict (tenant_id, actor_id, operacion, idempotency_key) do nothing;

  select * into request_row
  from public.solicitudes_mutacion_academica r
  where r.tenant_id = tenant and r.actor_id = actor
    and r.operacion = 'upsert_grades'
    and r.idempotency_key = p_idempotency_key
  for update;
  if request_row.request_hash <> request_digest then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_IDEMPOTENCY_MISMATCH';
  end if;
  if request_row.respuesta is not null then
    return request_row.respuesta || jsonb_build_object('replayed', true);
  end if;
  correlation := request_row.correlation_id;

  if period_state = 'cerrado'
     or private.academic_scope_is_closed(tenant, p_asignacion_id, p_periodo_id) then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_SCOPE_CLOSED';
  end if;

  -- Orden único de locks para que dos lotes con orden inverso no formen deadlock.
  perform d.id
  from public.calificaciones_directas d
  where d.tenant_id = tenant and d.id in (
    select (value ->> 'sourceId')::uuid
    from jsonb_array_elements(p_items)
    where value ->> 'sourceType' = 'directCriterion'
      and value ->> 'sourceId' is not null
  ) order by d.id for update;
  perform r.id
  from public.resultados_ejercicios r
  where r.tenant_id = tenant and r.id in (
    select (value ->> 'sourceId')::uuid
    from jsonb_array_elements(p_items)
    where value ->> 'sourceType' in ('automaticExercise','descriptiveSubmission')
  ) order by r.id for update;

  for item in
    select value from jsonb_array_elements(p_items)
    order by coalesce(value ->> 'sourceId', value ->> 'criterionId'), value ->> 'enrollmentId'
  loop
    source_type := item ->> 'sourceType';
    source_id := case when item ->> 'sourceId' is null then null
      else (item ->> 'sourceId')::uuid end;
    enrollment_id := (item ->> 'enrollmentId')::uuid;
    criterion_id := case when item ->> 'criterionId' is null then null
      else (item ->> 'criterionId')::uuid end;
    subcriterion_id := case when item ->> 'subcriterionId' is null then null
      else (item ->> 'subcriterionId')::uuid end;
    expected_version := (item ->> 'expectedRowVersion')::bigint;
    target_state := item ->> 'state';
    target_grade := case when item -> 'grade' is null or item -> 'grade' = 'null'::jsonb
      then null else (item ->> 'grade')::numeric end;
    target_observation := nullif(btrim(item ->> 'observation'), '');

    if target_state not in ('sin_capturar','pendiente','entregado','tardio',
                            'no_entregado','justificado','calificado')
       or (target_state = 'calificado' and target_grade is null)
       or (target_state <> 'calificado' and target_grade is not null)
       or (target_grade is not null and target_grade not between 0 and 10)
       or length(coalesce(target_observation, '')) > 2000 then
      raise exception using errcode = 'PT422', message = 'ACADEMIC_GRADE_INVALID';
    end if;

    select i.alumno_id into student_id
    from public.inscripciones_alumno i
    where i.id = enrollment_id and i.tenant_id = tenant
      and i.ciclo_escolar_id = cycle_id and i.grupo_id = assignment_group and i.activo;
    if student_id is null then
      raise exception using errcode = 'PT404', message = 'ACADEMIC_ENROLLMENT_NOT_FOUND';
    end if;

    if source_type = 'directCriterion' then
      if source_id is null then
        if expected_version <> 0 then
          raise exception using errcode = 'PT409', message = 'ACADEMIC_VERSION_CONFLICT';
        end if;
        if exists (
          select 1 from public.calificaciones_directas d
          where d.tenant_id = tenant and d.inscripcion_alumno_id = enrollment_id
            and d.criterio_evaluacion_id = criterion_id
            and d.subcriterio_evaluacion_id is not distinct from subcriterion_id
        ) then
          raise exception using errcode = 'PT409', message = 'ACADEMIC_VERSION_CONFLICT';
        end if;
        insert into public.calificaciones_directas (
          tenant_id, ciclo_escolar_id, asignacion_profesor_id,
          periodo_evaluacion_id, criterio_evaluacion_id,
          subcriterio_evaluacion_id, inscripcion_alumno_id, alumno_id,
          estado, calificacion, observacion, calificado_por, calificado_at
        ) values (
          tenant, cycle_id, p_asignacion_id, p_periodo_id, criterion_id,
          subcriterion_id, enrollment_id, student_id,
          target_state, target_grade, target_observation,
          case when target_state = 'calificado' then actor end,
          case when target_state = 'calificado' then now() end
        ) returning * into direct_after;
        insert into public.auditoria (
          tenant_id, user_id, accion, entidad, entidad_id, detalles
        ) values (
          tenant, actor, 'academic.grade.created', 'calificaciones_directas',
          direct_after.id, jsonb_build_object(
            'before', null,
            'after', jsonb_build_object(
              'state', direct_after.estado, 'grade', direct_after.calificacion,
              'observation', direct_after.observacion,
              'rowVersion', direct_after.row_version
            ),
            'reason', reason, 'correlationId', correlation,
            'assignmentId', p_asignacion_id, 'periodId', p_periodo_id,
            'enrollmentId', enrollment_id
          )
        );
      else
        select * into direct_before
        from public.calificaciones_directas d
        where d.id = source_id and d.tenant_id = tenant
          and d.asignacion_profesor_id = p_asignacion_id
          and d.periodo_evaluacion_id = p_periodo_id
          and d.inscripcion_alumno_id = enrollment_id;
        if direct_before.id is null then
          raise exception using errcode = 'PT404', message = 'ACADEMIC_SOURCE_NOT_FOUND';
        end if;
        if direct_before.row_version <> expected_version then
          raise exception using
            errcode = 'PT409', message = 'ACADEMIC_VERSION_CONFLICT',
            detail = jsonb_build_object(
              'code', 'ACADEMIC_VERSION_CONFLICT',
              'sourceId', source_id,
              'expectedRowVersion', expected_version,
              'actualRowVersion', direct_before.row_version
            )::text;
        end if;
        update public.calificaciones_directas d set
          estado = target_state, calificacion = target_grade,
          observacion = target_observation,
          calificado_por = case when target_state = 'calificado' then actor end,
          calificado_at = case when target_state = 'calificado' then now() end
        where d.id = source_id and d.tenant_id = tenant
          and d.row_version = expected_version
        returning * into direct_after;
        if direct_after.id is null then
          raise exception using errcode = 'PT409', message = 'ACADEMIC_VERSION_CONFLICT';
        end if;
        insert into public.auditoria (
          tenant_id, user_id, accion, entidad, entidad_id, detalles
        ) values (
          tenant, actor, 'academic.grade.updated', 'calificaciones_directas',
          direct_after.id, jsonb_build_object(
            'before', jsonb_build_object(
              'state', direct_before.estado, 'grade', direct_before.calificacion,
              'observation', direct_before.observacion,
              'rowVersion', direct_before.row_version
            ),
            'after', jsonb_build_object(
              'state', direct_after.estado, 'grade', direct_after.calificacion,
              'observation', direct_after.observacion,
              'rowVersion', direct_after.row_version
            ),
            'reason', reason, 'correlationId', correlation,
            'assignmentId', p_asignacion_id, 'periodId', p_periodo_id,
            'enrollmentId', enrollment_id
          )
        );
      end if;
      response_items := response_items || jsonb_build_array(jsonb_build_object(
        'sourceType', source_type, 'sourceId', direct_after.id,
        'rowVersion', direct_after.row_version, 'state', direct_after.estado,
        'grade', direct_after.calificacion
      ));
    else
      select r.* into exercise_before
      from public.resultados_ejercicios r
      join public.vinculos_evaluacion_ejercicio v
        on v.id = r.vinculo_evaluacion_id and v.tenant_id = r.tenant_id
      where r.id = source_id and r.tenant_id = tenant
        and r.inscripcion_alumno_id = enrollment_id
        and v.asignacion_profesor_id = p_asignacion_id
        and v.periodo_evaluacion_id = p_periodo_id
        and v.origen = source_type;
      if exercise_before.id is null then
        raise exception using errcode = 'PT404', message = 'ACADEMIC_SOURCE_NOT_FOUND';
      end if;
      if exercise_before.row_version <> expected_version then
        raise exception using
          errcode = 'PT409', message = 'ACADEMIC_VERSION_CONFLICT',
          detail = jsonb_build_object(
            'code', 'ACADEMIC_VERSION_CONFLICT', 'sourceId', source_id,
            'expectedRowVersion', expected_version,
            'actualRowVersion', exercise_before.row_version
          )::text;
      end if;
      update public.resultados_ejercicios r set
        estado = target_state, calificacion = target_grade,
        observacion = target_observation,
        calificado_por = case when target_state = 'calificado' then actor end,
        calificado_at = case when target_state = 'calificado' then now() end
      where r.id = source_id and r.tenant_id = tenant
        and r.row_version = expected_version
      returning * into exercise_after;
      if exercise_after.id is null then
        raise exception using errcode = 'PT409', message = 'ACADEMIC_VERSION_CONFLICT';
      end if;
      insert into public.auditoria (
        tenant_id, user_id, accion, entidad, entidad_id, detalles
      ) values (
        tenant, actor, 'academic.grade.updated', 'resultados_ejercicios',
        exercise_after.id, jsonb_build_object(
          'before', jsonb_build_object(
            'state', exercise_before.estado, 'grade', exercise_before.calificacion,
            'observation', exercise_before.observacion,
            'rowVersion', exercise_before.row_version
          ),
          'after', jsonb_build_object(
            'state', exercise_after.estado, 'grade', exercise_after.calificacion,
            'observation', exercise_after.observacion,
            'rowVersion', exercise_after.row_version
          ),
          'reason', reason, 'correlationId', correlation,
          'assignmentId', p_asignacion_id, 'periodId', p_periodo_id,
          'enrollmentId', enrollment_id
        )
      );
      response_items := response_items || jsonb_build_array(jsonb_build_object(
        'sourceType', source_type, 'sourceId', exercise_after.id,
        'rowVersion', exercise_after.row_version, 'state', exercise_after.estado,
        'grade', exercise_after.calificacion
      ));
    end if;
  end loop;

  response := jsonb_build_object(
    'status', 'saved', 'replayed', false,
    'correlationId', correlation, 'items', response_items
  );
  update public.solicitudes_mutacion_academica r
  set respuesta = response, completed_at = now()
  where r.id = request_row.id;
  return response;
end;
$$;

revoke all on function public.editar_calificaciones_academicas(uuid, uuid, jsonb, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.editar_calificaciones_academicas(uuid, uuid, jsonb, text, uuid, uuid)
  to authenticated, service_role;

create or replace function public.cerrar_calificaciones_academicas(
  p_asignacion_id uuid,
  p_periodo_id uuid,
  p_motivo text,
  p_idempotency_key uuid,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  tenant uuid;
  cycle_id uuid;
  scheme_id uuid;
  scheme_version integer;
  reason text;
  correlation uuid := coalesce(p_correlation_id, gen_random_uuid());
  request_digest text;
  request_row public.solicitudes_mutacion_academica%rowtype;
  preview jsonb;
  student jsonb;
  result jsonb;
  close_version integer;
  snapshot_count integer := 0;
  response jsonb;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_UNAUTHENTICATED';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'ACADEMIC_IDEMPOTENCY_REQUIRED';
  end if;
  reason := private.academic_validate_reason(p_motivo);
  select a.tenant_id, a.ciclo_escolar_id, e.id, e.version
    into tenant, cycle_id, scheme_id, scheme_version
  from public.asignaciones_profesor a
  join public.periodos_evaluacion p
    on p.tenant_id = a.tenant_id and p.ciclo_escolar_id = a.ciclo_escolar_id
  join public.esquemas_evaluacion e
    on e.tenant_id = a.tenant_id and e.ciclo_escolar_id = a.ciclo_escolar_id
   and e.asignacion_profesor_id = a.id and e.periodo_evaluacion_id = p.id
   and e.estado = 'activo'
  where a.id = p_asignacion_id and p.id = p_periodo_id and a.activo
  for share of e;
  if tenant is null then
    raise exception using errcode = 'PT404', message = 'ACADEMIC_SCOPE_NOT_FOUND';
  end if;
  if (select private.is_platform_admin()) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_PLATFORM_ADMIN_READ_ONLY';
  end if;
  if not (select private.has_tenant_role(
    tenant, array['superuser','admin']::text[]
  )) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_CLOSE_FORBIDDEN';
  end if;

  request_digest := md5(jsonb_build_object(
    'assignmentId', p_asignacion_id, 'periodId', p_periodo_id, 'reason', reason
  )::text);
  insert into public.solicitudes_mutacion_academica (
    tenant_id, actor_id, operacion, idempotency_key, request_hash, correlation_id
  ) values (
    tenant, actor, 'close_grades', p_idempotency_key, request_digest, correlation
  ) on conflict (tenant_id, actor_id, operacion, idempotency_key) do nothing;
  select * into request_row
  from public.solicitudes_mutacion_academica r
  where r.tenant_id = tenant and r.actor_id = actor
    and r.operacion = 'close_grades' and r.idempotency_key = p_idempotency_key
  for update;
  if request_row.request_hash <> request_digest then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_IDEMPOTENCY_MISMATCH';
  end if;
  if request_row.respuesta is not null then
    return request_row.respuesta || jsonb_build_object('replayed', true);
  end if;
  correlation := request_row.correlation_id;

  perform pg_advisory_xact_lock(hashtextextended(
    p_asignacion_id::text || ':' || p_periodo_id::text, 0
  ));
  perform 1 from public.periodos_evaluacion p
  where p.id = p_periodo_id and p.tenant_id = tenant for update;
  if private.academic_scope_is_closed(tenant, p_asignacion_id, p_periodo_id) then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_SCOPE_ALREADY_CLOSED';
  end if;

  preview := private.academic_closure_preview(tenant, p_asignacion_id, p_periodo_id);
  if not coalesce((preview ->> 'canClose')::boolean, false) then
    raise exception using
      errcode = 'PT422', message = 'ACADEMIC_CLOSE_INCOMPLETE',
      detail = (preview - 'students' || jsonb_build_object(
        'code', 'ACADEMIC_CLOSE_INCOMPLETE'
      ))::text,
      hint = (preview -> 'students')::text;
  end if;
  select coalesce(max(c.version_cierre), 0) + 1 into close_version
  from public.cierres_calificaciones c
  where c.tenant_id = tenant and c.asignacion_id = p_asignacion_id
    and c.periodo_id = p_periodo_id;

  for student in select value from jsonb_array_elements(preview -> 'students')
  loop
    result := public.calcular_calificacion_academica(
      private.build_academic_calculation_dataset(
        p_asignacion_id, (student ->> 'enrollmentId')::uuid,
        p_periodo_id, true
      )
    );
    insert into public.cierres_calificaciones (
      tenant_id, ciclo_escolar_id, inscripcion_id, asignacion_id,
      periodo_id, esquema_id, esquema_version,
      resultado_exacto, resultado_visual, breakdown,
      version_cierre, estado, motivo, correlation_id, closed_by
    ) values (
      tenant, cycle_id, (student ->> 'enrollmentId')::uuid, p_asignacion_id,
      p_periodo_id, scheme_id, scheme_version,
      (result ->> 'exactGrade')::numeric, (result ->> 'displayGrade')::numeric,
      result, close_version, 'cerrado', reason, correlation, actor
    );
    snapshot_count := snapshot_count + 1;
  end loop;

  insert into public.auditoria (
    tenant_id, user_id, accion, entidad, entidad_id, detalles
  ) values (
    tenant, actor, 'academic.grades.closed', 'cierres_calificaciones', null,
    jsonb_build_object(
      'before', jsonb_build_object('state', 'open'),
      'after', jsonb_build_object(
        'state', 'closed', 'version', close_version,
        'snapshotCount', snapshot_count, 'schemeVersion', scheme_version
      ),
      'reason', reason, 'correlationId', correlation,
      'assignmentId', p_asignacion_id, 'periodId', p_periodo_id
    )
  );
  response := jsonb_build_object(
    'status', 'closed', 'replayed', false, 'correlationId', correlation,
    'version', close_version, 'snapshotCount', snapshot_count
  );
  update public.solicitudes_mutacion_academica r
  set respuesta = response, completed_at = now() where r.id = request_row.id;
  return response;
end;
$$;

revoke all on function public.cerrar_calificaciones_academicas(uuid, uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cerrar_calificaciones_academicas(uuid, uuid, text, uuid, uuid)
  to authenticated, service_role;

create or replace function public.reabrir_calificaciones_academicas(
  p_asignacion_id uuid,
  p_periodo_id uuid,
  p_motivo text,
  p_idempotency_key uuid,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  tenant uuid;
  reason text;
  correlation uuid := coalesce(p_correlation_id, gen_random_uuid());
  request_digest text;
  request_row public.solicitudes_mutacion_academica%rowtype;
  previous_version integer;
  reopen_version integer;
  snapshot_count integer := 0;
  response jsonb;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_UNAUTHENTICATED';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'ACADEMIC_IDEMPOTENCY_REQUIRED';
  end if;
  reason := private.academic_validate_reason(p_motivo);
  select a.tenant_id into tenant
  from public.asignaciones_profesor a
  join public.periodos_evaluacion p
    on p.tenant_id = a.tenant_id and p.ciclo_escolar_id = a.ciclo_escolar_id
  where a.id = p_asignacion_id and p.id = p_periodo_id and a.activo;
  if tenant is null then
    raise exception using errcode = 'PT404', message = 'ACADEMIC_SCOPE_NOT_FOUND';
  end if;
  if (select private.is_platform_admin()) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_PLATFORM_ADMIN_READ_ONLY';
  end if;
  if not (select private.has_tenant_role(
    tenant, array['superuser','admin']::text[]
  )) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_REOPEN_FORBIDDEN';
  end if;

  request_digest := md5(jsonb_build_object(
    'assignmentId', p_asignacion_id, 'periodId', p_periodo_id, 'reason', reason
  )::text);
  insert into public.solicitudes_mutacion_academica (
    tenant_id, actor_id, operacion, idempotency_key, request_hash, correlation_id
  ) values (
    tenant, actor, 'reopen_grades', p_idempotency_key, request_digest, correlation
  ) on conflict (tenant_id, actor_id, operacion, idempotency_key) do nothing;
  select * into request_row
  from public.solicitudes_mutacion_academica r
  where r.tenant_id = tenant and r.actor_id = actor
    and r.operacion = 'reopen_grades' and r.idempotency_key = p_idempotency_key
  for update;
  if request_row.request_hash <> request_digest then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_IDEMPOTENCY_MISMATCH';
  end if;
  if request_row.respuesta is not null then
    return request_row.respuesta || jsonb_build_object('replayed', true);
  end if;
  correlation := request_row.correlation_id;

  perform pg_advisory_xact_lock(hashtextextended(
    p_asignacion_id::text || ':' || p_periodo_id::text, 0
  ));
  perform 1 from public.periodos_evaluacion p
  where p.id = p_periodo_id and p.tenant_id = tenant for update;
  if not private.academic_scope_is_closed(tenant, p_asignacion_id, p_periodo_id) then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_SCOPE_NOT_CLOSED';
  end if;
  select max(c.version_cierre) into previous_version
  from public.cierres_calificaciones c
  where c.tenant_id = tenant and c.asignacion_id = p_asignacion_id
    and c.periodo_id = p_periodo_id;
  reopen_version := previous_version + 1;

  insert into public.cierres_calificaciones (
    tenant_id, ciclo_escolar_id, inscripcion_id, asignacion_id,
    periodo_id, esquema_id, esquema_version,
    resultado_exacto, resultado_visual, breakdown,
    version_cierre, estado, motivo, correlation_id,
    snapshot_parent_id, closed_by
  )
  select c.tenant_id, c.ciclo_escolar_id, c.inscripcion_id, c.asignacion_id,
    c.periodo_id, c.esquema_id, c.esquema_version,
    c.resultado_exacto, c.resultado_visual, c.breakdown,
    reopen_version, 'reabierto', reason, correlation, c.id, actor
  from public.cierres_calificaciones c
  where c.tenant_id = tenant and c.asignacion_id = p_asignacion_id
    and c.periodo_id = p_periodo_id and c.version_cierre = previous_version
  order by c.inscripcion_id;
  get diagnostics snapshot_count = row_count;
  if snapshot_count = 0 then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_SCOPE_NOT_CLOSED';
  end if;

  insert into public.auditoria (
    tenant_id, user_id, accion, entidad, entidad_id, detalles
  ) values (
    tenant, actor, 'academic.grades.reopened', 'cierres_calificaciones', null,
    jsonb_build_object(
      'before', jsonb_build_object('state', 'closed', 'version', previous_version),
      'after', jsonb_build_object(
        'state', 'reopened', 'version', reopen_version,
        'snapshotCount', snapshot_count
      ),
      'reason', reason, 'correlationId', correlation,
      'assignmentId', p_asignacion_id, 'periodId', p_periodo_id
    )
  );
  response := jsonb_build_object(
    'status', 'reopened', 'replayed', false, 'correlationId', correlation,
    'version', reopen_version, 'snapshotCount', snapshot_count
  );
  update public.solicitudes_mutacion_academica r
  set respuesta = response, completed_at = now() where r.id = request_row.id;
  return response;
end;
$$;

revoke all on function public.reabrir_calificaciones_academicas(uuid, uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reabrir_calificaciones_academicas(uuid, uuid, text, uuid, uuid)
  to authenticated, service_role;

comment on function public.editar_calificaciones_academicas(uuid, uuid, jsonb, text, uuid, uuid) is
  'Upsert de máximo 100 notas con CAS, idempotencia, auditoría y rollback atómico.';
comment on function public.cerrar_calificaciones_academicas(uuid, uuid, text, uuid, uuid) is
  'Cierra una asignación/periodo con advisory xact lock y snapshots inmutables.';
comment on function public.reabrir_calificaciones_academicas(uuid, uuid, text, uuid, uuid) is
  'Reabre sólo para admin/superuser creando una nueva versión histórica.';
