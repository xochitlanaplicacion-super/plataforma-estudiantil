-- Reportes académicos por rango y captura móvil sin promedios engañosos.
-- Un valor nulo sigue siendo pendiente; sólo un cero capturado expresamente
-- participa como cero. Los promedios parciales siempre exponen su cobertura.
set search_path = public, extensions;

-- Las primeras capturas provisionales no creaban el concepto compartido. Se
-- completa ese catálogo sin tocar ni recalcular ninguna calificación histórica.
with first_capture as (
  select distinct on (
    capture.tenant_id,
    capture.asignacion_profesor_id,
    capture.periodo_evaluacion_id,
    capture.criterio_evaluacion_id,
    coalesce(capture.subcriterio_evaluacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(capture.nombre_concepto))
  )
    capture.tenant_id,
    capture.ciclo_escolar_id,
    capture.asignacion_profesor_id,
    capture.periodo_evaluacion_id,
    capture.criterio_evaluacion_id,
    capture.subcriterio_evaluacion_id,
    btrim(capture.nombre_concepto) as nombre,
    capture.tipo_concepto as tipo,
    capture.actor_id,
    capture.created_at
  from public.capturas_provisionales_docente capture
  where capture.tipo_captura = 'calificacion'
    and btrim(coalesce(capture.nombre_concepto, '')) <> ''
  order by
    capture.tenant_id,
    capture.asignacion_profesor_id,
    capture.periodo_evaluacion_id,
    capture.criterio_evaluacion_id,
    coalesce(capture.subcriterio_evaluacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(capture.nombre_concepto)),
    capture.created_at,
    capture.id
)
insert into public.conceptos_evaluacion_docente (
  tenant_id,
  ciclo_escolar_id,
  asignacion_profesor_id,
  periodo_evaluacion_id,
  criterio_evaluacion_id,
  subcriterio_evaluacion_id,
  nombre,
  tipo,
  activo,
  created_by,
  created_at,
  updated_at
)
select
  source.tenant_id,
  source.ciclo_escolar_id,
  source.asignacion_profesor_id,
  source.periodo_evaluacion_id,
  source.criterio_evaluacion_id,
  source.subcriterio_evaluacion_id,
  source.nombre,
  source.tipo,
  true,
  source.actor_id,
  source.created_at,
  source.created_at
from first_capture source
on conflict (
  tenant_id,
  asignacion_profesor_id,
  periodo_evaluacion_id,
  criterio_evaluacion_id,
  coalesce(subcriterio_evaluacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(nombre)
)
do update set activo = true;

-- Toda futura captura provisional crea el mismo concepto académico que una
-- captura oficial. El trigger sólo refleja una fila ya validada por el RPC.
create or replace function private.ensure_provisional_academic_concept()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo_captura = 'calificacion' then
    insert into public.conceptos_evaluacion_docente (
      tenant_id,
      ciclo_escolar_id,
      asignacion_profesor_id,
      periodo_evaluacion_id,
      criterio_evaluacion_id,
      subcriterio_evaluacion_id,
      nombre,
      tipo,
      created_by,
      created_at,
      updated_at
    ) values (
      new.tenant_id,
      new.ciclo_escolar_id,
      new.asignacion_profesor_id,
      new.periodo_evaluacion_id,
      new.criterio_evaluacion_id,
      new.subcriterio_evaluacion_id,
      btrim(new.nombre_concepto),
      new.tipo_concepto,
      new.actor_id,
      new.created_at,
      new.created_at
    )
    on conflict (
      tenant_id,
      asignacion_profesor_id,
      periodo_evaluacion_id,
      criterio_evaluacion_id,
      coalesce(subcriterio_evaluacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
      lower(nombre)
    )
    do update set activo = true, updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_provisional_academic_concept()
  from public, anon, authenticated;
grant execute on function private.ensure_provisional_academic_concept()
  to service_role;

drop trigger if exists ensure_provisional_academic_concept
  on public.capturas_provisionales_docente;
create trigger ensure_provisional_academic_concept
after insert on public.capturas_provisionales_docente
for each row execute function private.ensure_provisional_academic_concept();

-- La fila directa que consume el motor académico es un resumen de las
-- actividades móviles, no una actividad adicional. Sólo puede quedar como
-- calificación definitiva cuando el alumno tiene calificadas todas las
-- actividades activas del alcance. Un cero capturado es una calificación y sí
-- incrementa graded_count; una ausencia de fila sigue siendo pendiente.
create or replace function private.enforce_mobile_concept_completeness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count integer;
  graded_count integer;
  average_grade numeric(6,4);
begin
  if btrim(coalesce(new.observacion, '')) <> 'Promedio de capturas móviles' then
    return new;
  end if;

  select count(*)::integer, count(grade.id)::integer,
    round(avg(grade.calificacion), 4)
    into expected_count, graded_count, average_grade
  from public.conceptos_evaluacion_docente concept
  left join public.calificaciones_concepto_docente grade
    on grade.tenant_id = concept.tenant_id
   and grade.concepto_id = concept.id
   and grade.inscripcion_alumno_id = new.inscripcion_alumno_id
  where concept.tenant_id = new.tenant_id
    and concept.ciclo_escolar_id = new.ciclo_escolar_id
    and concept.asignacion_profesor_id = new.asignacion_profesor_id
    and concept.periodo_evaluacion_id = new.periodo_evaluacion_id
    and concept.criterio_evaluacion_id = new.criterio_evaluacion_id
    and concept.subcriterio_evaluacion_id is not distinct from new.subcriterio_evaluacion_id
    and concept.activo;

  if expected_count = 0 then
    new.estado := 'sin_capturar';
    new.calificacion := null;
    new.calificado_por := null;
    new.calificado_at := null;
  elsif graded_count < expected_count then
    new.estado := 'pendiente';
    new.calificacion := null;
    new.calificado_por := null;
    new.calificado_at := null;
  else
    new.estado := 'calificado';
    new.calificacion := average_grade;
    new.calificado_at := coalesce(new.calificado_at, now());
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_mobile_concept_completeness()
  from public, anon, authenticated;
grant execute on function private.enforce_mobile_concept_completeness()
  to service_role;

drop trigger if exists enforce_mobile_concept_completeness
  on public.calificaciones_directas;
create trigger enforce_mobile_concept_completeness
before insert or update on public.calificaciones_directas
for each row execute function private.enforce_mobile_concept_completeness();

-- Al aparecer una actividad nueva, todos los alumnos oficiales del grupo
-- quedan explícitamente pendientes en la fuente canónica. No se reemplazan
-- calificaciones directas que el profesor haya capturado manualmente.
create or replace function private.sync_mobile_concept_roster_completeness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.calificaciones_directas (
    tenant_id,
    ciclo_escolar_id,
    asignacion_profesor_id,
    periodo_evaluacion_id,
    criterio_evaluacion_id,
    subcriterio_evaluacion_id,
    inscripcion_alumno_id,
    alumno_id,
    estado,
    calificacion,
    observacion,
    calificado_por,
    calificado_at
  )
  select
    new.tenant_id,
    new.ciclo_escolar_id,
    new.asignacion_profesor_id,
    new.periodo_evaluacion_id,
    new.criterio_evaluacion_id,
    new.subcriterio_evaluacion_id,
    enrollment.id,
    enrollment.alumno_id,
    'calificado',
    0,
    'Promedio de capturas móviles',
    new.created_by,
    now()
  from public.asignaciones_profesor assignment
  join public.inscripciones_alumno enrollment
    on enrollment.tenant_id = assignment.tenant_id
   and enrollment.ciclo_escolar_id = assignment.ciclo_escolar_id
   and enrollment.grupo_id = assignment.grupo_id
   and enrollment.activo
  where assignment.id = new.asignacion_profesor_id
    and assignment.tenant_id = new.tenant_id
    and assignment.ciclo_escolar_id = new.ciclo_escolar_id
  on conflict (
    tenant_id,
    inscripcion_alumno_id,
    criterio_evaluacion_id,
    coalesce(subcriterio_evaluacion_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) do update set
    estado = excluded.estado,
    calificacion = excluded.calificacion,
    calificado_por = excluded.calificado_por,
    calificado_at = excluded.calificado_at
  where btrim(coalesce(public.calificaciones_directas.observacion, '')) =
    'Promedio de capturas móviles';

  return new;
end;
$$;

revoke all on function private.sync_mobile_concept_roster_completeness()
  from public, anon, authenticated;
grant execute on function private.sync_mobile_concept_roster_completeness()
  to service_role;

drop trigger if exists sync_mobile_concept_roster_completeness
  on public.conceptos_evaluacion_docente;
create trigger sync_mobile_concept_roster_completeness
after insert or update of activo on public.conceptos_evaluacion_docente
for each row execute function private.sync_mobile_concept_roster_completeness();

-- Repara de forma conservadora los resúmenes móviles ya existentes y crea el
-- estado pendiente donde ya había conceptos pero aún no existía una fila
-- directa. Las calificaciones manuales y las evidencias se conservan intactas.
with concept_scopes as (
  select distinct on (
    concept.tenant_id,
    concept.asignacion_profesor_id,
    concept.periodo_evaluacion_id,
    concept.criterio_evaluacion_id,
    coalesce(concept.subcriterio_evaluacion_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
    concept.tenant_id,
    concept.ciclo_escolar_id,
    concept.asignacion_profesor_id,
    concept.periodo_evaluacion_id,
    concept.criterio_evaluacion_id,
    concept.subcriterio_evaluacion_id,
    concept.created_by
  from public.conceptos_evaluacion_docente concept
  where concept.activo
  order by
    concept.tenant_id,
    concept.asignacion_profesor_id,
    concept.periodo_evaluacion_id,
    concept.criterio_evaluacion_id,
    coalesce(concept.subcriterio_evaluacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
    concept.created_at,
    concept.id
)
insert into public.calificaciones_directas (
  tenant_id,
  ciclo_escolar_id,
  asignacion_profesor_id,
  periodo_evaluacion_id,
  criterio_evaluacion_id,
  subcriterio_evaluacion_id,
  inscripcion_alumno_id,
  alumno_id,
  estado,
  calificacion,
  observacion,
  calificado_por,
  calificado_at
)
select
  scope.tenant_id,
  scope.ciclo_escolar_id,
  scope.asignacion_profesor_id,
  scope.periodo_evaluacion_id,
  scope.criterio_evaluacion_id,
  scope.subcriterio_evaluacion_id,
  enrollment.id,
  enrollment.alumno_id,
  'calificado',
  0,
  'Promedio de capturas móviles',
  scope.created_by,
  now()
from concept_scopes scope
join public.asignaciones_profesor assignment
  on assignment.id = scope.asignacion_profesor_id
 and assignment.tenant_id = scope.tenant_id
 and assignment.ciclo_escolar_id = scope.ciclo_escolar_id
join public.inscripciones_alumno enrollment
  on enrollment.tenant_id = assignment.tenant_id
 and enrollment.ciclo_escolar_id = assignment.ciclo_escolar_id
 and enrollment.grupo_id = assignment.grupo_id
 and enrollment.activo
on conflict (
  tenant_id,
  inscripcion_alumno_id,
  criterio_evaluacion_id,
  coalesce(subcriterio_evaluacion_id, '00000000-0000-0000-0000-000000000000'::uuid)
) do update set
  estado = excluded.estado,
  calificacion = excluded.calificacion,
  calificado_por = excluded.calificado_por,
  calificado_at = excluded.calificado_at
where btrim(coalesce(public.calificaciones_directas.observacion, '')) =
  'Promedio de capturas móviles';

-- Lista real y reciente de actividades de una asignación. El servidor resuelve
-- profesor, tenant, ciclo y periodo; el cliente no puede ampliar el alcance.
create or replace function public.obtener_conceptos_recientes_docente_movil(
  p_asignacion_id uuid,
  p_criterio_id uuid,
  p_subcriterio_id uuid
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
  cycle_id uuid;
  period_id uuid;
  group_id uuid;
  result jsonb;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'MOBILE_UNAUTHENTICATED';
  end if;

  select assignment.tenant_id, assignment.ciclo_escolar_id,
    assignment.grupo_id, period.id
    into tenant, cycle_id, group_id, period_id
  from public.asignaciones_profesor assignment
  join public.ciclos_escolares cycle
    on cycle.id = assignment.ciclo_escolar_id
   and cycle.tenant_id = assignment.tenant_id
   and cycle.estado = 'activo'
  join public.periodos_evaluacion period
    on period.tenant_id = assignment.tenant_id
   and period.ciclo_escolar_id = assignment.ciclo_escolar_id
   and period.estado = 'activo'
  join public.esquemas_evaluacion scheme
    on scheme.tenant_id = assignment.tenant_id
   and scheme.asignacion_profesor_id = assignment.id
   and scheme.periodo_evaluacion_id = period.id
   and scheme.estado = 'activo'
  join public.criterios_evaluacion criterion
    on criterion.tenant_id = scheme.tenant_id
   and criterion.esquema_evaluacion_id = scheme.id
   and criterion.id = p_criterio_id
   and criterion.activo
  left join public.subcriterios_evaluacion subcriterion
    on subcriterion.tenant_id = criterion.tenant_id
   and subcriterion.criterio_evaluacion_id = criterion.id
   and subcriterion.id = p_subcriterio_id
   and subcriterion.activo
  where assignment.id = p_asignacion_id
    and assignment.profesor_id = actor
    and assignment.activo
    and coalesce(subcriterion.tipo, criterion.tipo) = 'directo'
    and (
      (p_subcriterio_id is null and criterion.tipo = 'directo')
      or (p_subcriterio_id is not null and subcriterion.id is not null)
    );

  if tenant is null then
    raise exception using errcode = 'PT403', message = 'MOBILE_DIRECT_CRITERION_FORBIDDEN';
  end if;

  with recent as materialized (
    select concept.id, concept.nombre, concept.tipo, concept.created_at
    from public.conceptos_evaluacion_docente concept
    where concept.tenant_id = tenant
      and concept.ciclo_escolar_id = cycle_id
      and concept.asignacion_profesor_id = p_asignacion_id
      and concept.periodo_evaluacion_id = period_id
      and concept.criterio_evaluacion_id = p_criterio_id
      and concept.subcriterio_evaluacion_id is not distinct from p_subcriterio_id
      and concept.activo
    order by concept.created_at desc, concept.id desc
    limit 20
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', concept.id,
    'name', concept.nombre,
    'type', concept.tipo,
    'createdAt', concept.created_at,
    'expectedCount', (
      select count(*)
      from public.inscripciones_alumno enrollment
      where enrollment.tenant_id = tenant
        and enrollment.ciclo_escolar_id = cycle_id
        and enrollment.grupo_id = group_id
        and enrollment.activo
    ) + (
      select count(*)
      from public.alumnos_provisionales_docente provisional
      where provisional.tenant_id = tenant
        and provisional.ciclo_escolar_id = cycle_id
        and provisional.grupo_id = group_id
        and provisional.estado = 'pendiente'
    ),
    'grades', coalesce((
      select jsonb_object_agg(grade.roster_id, grade.value)
      from (
        select official.inscripcion_alumno_id::text as roster_id,
          official.calificacion as value
        from public.calificaciones_concepto_docente official
        where official.tenant_id = tenant
          and official.concepto_id = concept.id
        union all
        select distinct on (capture.alumno_provisional_id)
          capture.alumno_provisional_id::text,
          capture.valor
        from public.capturas_provisionales_docente capture
        where capture.tenant_id = tenant
          and capture.asignacion_profesor_id = p_asignacion_id
          and capture.periodo_evaluacion_id = period_id
          and capture.criterio_evaluacion_id = p_criterio_id
          and capture.subcriterio_evaluacion_id is not distinct from p_subcriterio_id
          and capture.tipo_captura = 'calificacion'
          and capture.migrada_at is null
          and lower(btrim(capture.nombre_concepto)) = lower(btrim(concept.nombre))
        order by capture.alumno_provisional_id, capture.created_at desc, capture.id desc
      ) grade
    ), '{}'::jsonb)
  ) order by concept.created_at desc, concept.id desc), '[]'::jsonb)
    into result
  from recent concept;

  return result;
end;
$$;

revoke all on function public.obtener_conceptos_recientes_docente_movil(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.obtener_conceptos_recientes_docente_movil(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function public.obtener_conceptos_recientes_docente_movil(uuid, uuid, uuid) is
  'Últimos conceptos reales del periodo activo con cobertura por alumno, autorizados por asignación docente.';

-- Reporte enriquecido y acotado por fechas. Se apoya en el reporte unificado
-- anterior para identidad/branding y vuelve a derivar resultados desde las
-- evidencias reales, nunca desde un promedio móvil opaco.
create or replace function public.obtener_reporte_academico_docente_unificado_rango(
  p_asignacion_id uuid,
  p_fecha_desde date,
  p_fecha_hasta date
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
  cycle_id uuid;
  period_id uuid;
  group_id uuid;
  timezone_name text;
  period_start date;
  period_end date;
  effective_from date;
  effective_to date;
  base_report jsonb;
  filtered_concepts jsonb;
  filtered_dates jsonb;
  filtered_students jsonb := '[]'::jsonb;
  student_row jsonb;
  criterion_row jsonb;
  result_row jsonb;
  results_object jsonb;
  concept_grades_object jsonb;
  attendance_object jsonb;
  criterion_key text;
  criterion_type text;
  student_type text;
  roster_id uuid;
  criterion_id uuid;
  subcriterion_id uuid;
  expected_count integer;
  graded_count integer;
  partial_average numeric;
  direct_grade numeric;
  direct_state text;
  participation_points numeric;
  participation_count integer;
  missing_names jsonb;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_REPORT_UNAUTHENTICATED';
  end if;

  select assignment.tenant_id, assignment.ciclo_escolar_id,
    assignment.grupo_id, period.id, cycle.zona_horaria,
    period.fecha_inicio, period.fecha_fin
    into tenant, cycle_id, group_id, period_id, timezone_name,
      period_start, period_end
  from public.asignaciones_profesor assignment
  join public.ciclos_escolares cycle
    on cycle.id = assignment.ciclo_escolar_id
   and cycle.tenant_id = assignment.tenant_id
   and cycle.estado = 'activo'
  join public.periodos_evaluacion period
    on period.tenant_id = assignment.tenant_id
   and period.ciclo_escolar_id = assignment.ciclo_escolar_id
   and period.estado = 'activo'
  where assignment.id = p_asignacion_id
    and assignment.profesor_id = actor
    and assignment.activo;

  if tenant is null then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_REPORT_ASSIGNMENT_FORBIDDEN';
  end if;
  if p_fecha_desde is not null and p_fecha_hasta is not null
     and p_fecha_desde > p_fecha_hasta then
    raise exception using errcode = 'PT422', message = 'ACADEMIC_REPORT_INVALID_DATE_RANGE';
  end if;

  effective_from := greatest(period_start, coalesce(p_fecha_desde, period_start));
  effective_to := least(period_end, coalesce(p_fecha_hasta, period_end));
  if effective_from > effective_to then
    raise exception using errcode = 'PT422', message = 'ACADEMIC_REPORT_DATE_RANGE_OUTSIDE_PERIOD';
  end if;

  base_report := public.obtener_reporte_academico_docente_unificado(p_asignacion_id);

  select coalesce(jsonb_agg(concept.value order by (concept.value ->> 'createdAt')::timestamptz,
    concept.value ->> 'name'), '[]'::jsonb)
    into filtered_concepts
  from jsonb_array_elements(coalesce(base_report -> 'concepts', '[]'::jsonb)) concept(value)
  where (((concept.value ->> 'createdAt')::timestamptz at time zone timezone_name)::date
    between effective_from and effective_to);

  select coalesce(jsonb_agg(to_jsonb(day_value) order by day_value), '[]'::jsonb)
    into filtered_dates
  from (
    select value::date as day_value
    from jsonb_array_elements_text(coalesce(base_report -> 'attendanceDates', '[]'::jsonb))
    where value::date between effective_from and effective_to
  ) days;

  for student_row in
    select value
    from jsonb_array_elements(coalesce(base_report -> 'students', '[]'::jsonb))
  loop
    student_type := coalesce(student_row ->> 'studentType', 'registered');
    roster_id := (student_row ->> 'enrollmentId')::uuid;
    results_object := '{}'::jsonb;

    for criterion_row in
      select value
      from jsonb_array_elements(coalesce(base_report -> 'criteria', '[]'::jsonb))
    loop
      criterion_key := criterion_row ->> 'key';
      criterion_type := criterion_row ->> 'type';
      criterion_id := (criterion_row ->> 'criterionId')::uuid;
      subcriterion_id := nullif(criterion_row ->> 'subcriterionId', '')::uuid;
      expected_count := 0;
      graded_count := 0;
      partial_average := null;
      direct_grade := null;
      direct_state := 'sin_capturar';
      missing_names := '[]'::jsonb;

      if criterion_type <> 'participacion' then
        if student_type = 'registered' then
          select count(*)::integer,
            count(grade.id)::integer,
            round(avg(grade.calificacion), 4),
            coalesce(jsonb_agg(to_jsonb(concept.nombre) order by concept.created_at, concept.nombre)
              filter (where grade.id is null), '[]'::jsonb)
            into expected_count, graded_count, partial_average, missing_names
          from public.conceptos_evaluacion_docente concept
          left join public.calificaciones_concepto_docente grade
            on grade.tenant_id = concept.tenant_id
           and grade.concepto_id = concept.id
           and grade.inscripcion_alumno_id = roster_id
          where concept.tenant_id = tenant
            and concept.ciclo_escolar_id = cycle_id
            and concept.asignacion_profesor_id = p_asignacion_id
            and concept.periodo_evaluacion_id = period_id
            and concept.criterio_evaluacion_id = criterion_id
            and concept.subcriterio_evaluacion_id is not distinct from subcriterion_id
            and concept.activo
            and ((concept.created_at at time zone timezone_name)::date
              between effective_from and effective_to);
        else
          select count(*)::integer,
            count(latest_grade.value)::integer,
            round(avg(latest_grade.value), 4),
            coalesce(jsonb_agg(to_jsonb(concept.nombre) order by concept.created_at, concept.nombre)
              filter (where latest_grade.value is null), '[]'::jsonb)
            into expected_count, graded_count, partial_average, missing_names
          from public.conceptos_evaluacion_docente concept
          left join lateral (
            select capture.valor as value
            from public.capturas_provisionales_docente capture
            where capture.tenant_id = tenant
              and capture.alumno_provisional_id = roster_id
              and capture.asignacion_profesor_id = p_asignacion_id
              and capture.periodo_evaluacion_id = period_id
              and capture.criterio_evaluacion_id = criterion_id
              and capture.subcriterio_evaluacion_id is not distinct from subcriterion_id
              and capture.tipo_captura = 'calificacion'
              and capture.migrada_at is null
              and lower(btrim(capture.nombre_concepto)) = lower(btrim(concept.nombre))
            order by capture.created_at desc, capture.id desc
            limit 1
          ) latest_grade on true
          where concept.tenant_id = tenant
            and concept.ciclo_escolar_id = cycle_id
            and concept.asignacion_profesor_id = p_asignacion_id
            and concept.periodo_evaluacion_id = period_id
            and concept.criterio_evaluacion_id = criterion_id
            and concept.subcriterio_evaluacion_id is not distinct from subcriterion_id
            and concept.activo
            and ((concept.created_at at time zone timezone_name)::date
              between effective_from and effective_to);
        end if;

        if expected_count = 0 and student_type = 'registered' then
          select grade.calificacion, grade.estado
            into direct_grade, direct_state
          from public.calificaciones_directas grade
          where grade.tenant_id = tenant
            and grade.ciclo_escolar_id = cycle_id
            and grade.asignacion_profesor_id = p_asignacion_id
            and grade.periodo_evaluacion_id = period_id
            and grade.criterio_evaluacion_id = criterion_id
            and grade.subcriterio_evaluacion_id is not distinct from subcriterion_id
            and grade.inscripcion_alumno_id = roster_id
            and ((coalesce(grade.calificado_at, grade.updated_at) at time zone timezone_name)::date
              between effective_from and effective_to)
          limit 1;
        end if;
      end if;

      if student_type = 'registered' then
        select
          coalesce(sum(case
            when event.tipo_evento in ('reversa', 'ajuste_negativo') then -event.puntos
            else event.puntos
          end), 0),
          greatest(coalesce(count(*) filter (where event.tipo_evento = 'registro')
            - count(*) filter (where event.tipo_evento = 'reversa'), 0), 0)::integer
          into participation_points, participation_count
        from public.eventos_participacion event
        where event.tenant_id = tenant
          and event.ciclo_escolar_id = cycle_id
          and event.asignacion_profesor_id = p_asignacion_id
          and event.periodo_evaluacion_id = period_id
          and event.criterio_evaluacion_id = criterion_id
          and event.subcriterio_evaluacion_id is not distinct from subcriterion_id
          and event.inscripcion_alumno_id = roster_id
          and ((event.created_at at time zone timezone_name)::date
            between effective_from and effective_to);
      else
        select
          coalesce(sum(case
            when capture.tipo_captura = 'participacion_resta' then -capture.valor
            else capture.valor
          end), 0),
          count(*) filter (where capture.tipo_captura = 'participacion')::integer
          into participation_points, participation_count
        from public.capturas_provisionales_docente capture
        where capture.tenant_id = tenant
          and capture.alumno_provisional_id = roster_id
          and capture.asignacion_profesor_id = p_asignacion_id
          and capture.periodo_evaluacion_id = period_id
          and capture.criterio_evaluacion_id = criterion_id
          and capture.subcriterio_evaluacion_id is not distinct from subcriterion_id
          and capture.tipo_captura in ('participacion', 'participacion_resta')
          and capture.migrada_at is null
          and ((capture.created_at at time zone timezone_name)::date
            between effective_from and effective_to);
      end if;

      result_row := jsonb_build_object(
        'grade', case
          when criterion_type = 'participacion' then null
          when expected_count > 0 then partial_average
          else direct_grade
        end,
        'state', case
          when criterion_type = 'participacion' then
            case when participation_count > 0 or participation_points <> 0
              then 'calificado' else 'sin_capturar' end
          when expected_count > 0 and graded_count = expected_count then 'calificado'
          when expected_count > 0 then 'pendiente'
          else coalesce(direct_state, 'sin_capturar')
        end,
        'participationPoints', coalesce(participation_points, 0),
        'participationCount', coalesce(participation_count, 0),
        'expectedCount', expected_count,
        'gradedCount', graded_count,
        'missingCount', greatest(expected_count - graded_count, 0),
        'complete', case
          when criterion_type = 'participacion' then true
          when expected_count > 0 then graded_count = expected_count
          else coalesce(direct_state, 'sin_capturar') = 'calificado'
        end,
        'missingConceptNames', missing_names,
        'calculationPolicy', case
          when expected_count > 0 then 'explicit_grades_only_with_coverage'
          else 'direct_grade'
        end
      );
      results_object := results_object || jsonb_build_object(criterion_key, result_row);
    end loop;

    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
      into attendance_object
    from jsonb_each(coalesce(student_row -> 'attendance', '{}'::jsonb)) entry
    where entry.key::date between effective_from and effective_to;

    if student_type = 'registered' then
      select coalesce(jsonb_object_agg(concept.id::text, jsonb_build_object(
        'grade', grade.calificacion,
        'observation', coalesce(grade.observacion, ''),
        'updatedAt', grade.updated_at
      )), '{}'::jsonb)
        into concept_grades_object
      from public.conceptos_evaluacion_docente concept
      join public.calificaciones_concepto_docente grade
        on grade.tenant_id = concept.tenant_id
       and grade.concepto_id = concept.id
       and grade.inscripcion_alumno_id = roster_id
      where concept.tenant_id = tenant
        and concept.asignacion_profesor_id = p_asignacion_id
        and concept.periodo_evaluacion_id = period_id
        and concept.activo
        and ((concept.created_at at time zone timezone_name)::date
          between effective_from and effective_to);
    else
      select coalesce(jsonb_object_agg(concept.id::text, jsonb_build_object(
        'grade', latest_grade.value,
        'observation', latest_grade.observation,
        'updatedAt', latest_grade.updated_at
      )), '{}'::jsonb)
        into concept_grades_object
      from public.conceptos_evaluacion_docente concept
      join lateral (
        select capture.valor as value,
          coalesce(capture.observacion, '') as observation,
          capture.created_at as updated_at
        from public.capturas_provisionales_docente capture
        where capture.tenant_id = tenant
          and capture.alumno_provisional_id = roster_id
          and capture.asignacion_profesor_id = p_asignacion_id
          and capture.periodo_evaluacion_id = period_id
          and capture.criterio_evaluacion_id = concept.criterio_evaluacion_id
          and capture.subcriterio_evaluacion_id is not distinct from concept.subcriterio_evaluacion_id
          and capture.tipo_captura = 'calificacion'
          and capture.migrada_at is null
          and lower(btrim(capture.nombre_concepto)) = lower(btrim(concept.nombre))
        order by capture.created_at desc, capture.id desc
        limit 1
      ) latest_grade on true
      where concept.tenant_id = tenant
        and concept.asignacion_profesor_id = p_asignacion_id
        and concept.periodo_evaluacion_id = period_id
        and concept.activo
        and ((concept.created_at at time zone timezone_name)::date
          between effective_from and effective_to);
    end if;

    filtered_students := filtered_students || jsonb_build_array(
      student_row || jsonb_build_object(
        'attendance', attendance_object,
        'results', results_object,
        'conceptGrades', concept_grades_object
      )
    );
  end loop;

  return base_report || jsonb_build_object(
    'generatedAt', now(),
    'range', jsonb_build_object(
      'from', effective_from,
      'to', effective_to,
      'today', (now() at time zone timezone_name)::date,
      'isFullPeriod', effective_from = period_start and effective_to = period_end
    ),
    'calculationPolicy', jsonb_build_object(
      'pendingCountsAsZero', false,
      'explicitZeroCounts', true,
      'partialAverageRequiresCoverage', true
    ),
    'attendanceDates', filtered_dates,
    'concepts', filtered_concepts,
    'students', filtered_students
  );
end;
$$;

revoke all on function public.obtener_reporte_academico_docente_unificado_rango(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.obtener_reporte_academico_docente_unificado_rango(uuid, date, date)
  to authenticated, service_role;

comment on function public.obtener_reporte_academico_docente_unificado_rango(uuid, date, date) is
  'Reporte multi-tenant por fechas: ceros explícitos incluidos, pendientes excluidos del promedio parcial y cobertura visible.';

reset search_path;
