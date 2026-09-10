-- Distingue una evidencia pendiente por ausencia de una posible omisión de
-- captura. Es una proyección de sólo lectura: no cambia asistencias ni notas.
set search_path = public, extensions;

create or replace function public.obtener_contexto_asistencia_conceptos_docente(
  p_asignacion_id uuid,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
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
  result jsonb;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_REPORT_UNAUTHENTICATED';
  end if;

  select assignment.tenant_id, assignment.ciclo_escolar_id, assignment.grupo_id,
    period.id, cycle.zona_horaria, period.fecha_inicio, period.fecha_fin
    into tenant, cycle_id, group_id, period_id, timezone_name, period_start, period_end
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

  effective_from := greatest(coalesce(p_fecha_desde, period_start), period_start);
  effective_to := least(coalesce(p_fecha_hasta, period_end), period_end,
    (clock_timestamp() at time zone timezone_name)::date);
  if effective_from > effective_to then
    raise exception using errcode = 'PT422', message = 'ACADEMIC_REPORT_RANGE_INVALID';
  end if;

  with scoped_concepts as materialized (
    select concept.id,
      (concept.created_at at time zone timezone_name)::date as activity_date
    from public.conceptos_evaluacion_docente concept
    where concept.tenant_id = tenant
      and concept.ciclo_escolar_id = cycle_id
      and concept.asignacion_profesor_id = p_asignacion_id
      and concept.periodo_evaluacion_id = period_id
      and concept.activo
      and (concept.created_at at time zone timezone_name)::date
        between effective_from and effective_to
  )
  select coalesce(jsonb_object_agg(concept.id::text, jsonb_build_object(
    'activityDate', concept.activity_date,
    'attendance', coalesce((
      select jsonb_object_agg(attendance_row.roster_id, attendance_row.status)
      from (
        select attendance.inscripcion_alumno_id::text as roster_id,
          attendance.estado as status
        from public.asistencias_diarias_docente attendance
        where attendance.tenant_id = tenant
          and attendance.ciclo_escolar_id = cycle_id
          and attendance.grupo_id = group_id
          and attendance.fecha_asistencia = concept.activity_date
        union all
        select attendance.alumno_provisional_id::text,
          attendance.estado
        from public.asistencias_provisionales_docente attendance
        where attendance.tenant_id = tenant
          and attendance.ciclo_escolar_id = cycle_id
          and attendance.grupo_id = group_id
          and attendance.fecha_asistencia = concept.activity_date
      ) attendance_row
    ), '{}'::jsonb)
  )), '{}'::jsonb)
    into result
  from scoped_concepts concept;

  return result;
end;
$$;

revoke all on function public.obtener_contexto_asistencia_conceptos_docente(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.obtener_contexto_asistencia_conceptos_docente(uuid, date, date)
  to authenticated, service_role;

comment on function public.obtener_contexto_asistencia_conceptos_docente(uuid, date, date) is
  'Fecha institucional y asistencia del grupo para explicar por qué falta cada evidencia, con alcance docente y tenant verificados.';

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
  timezone_name text;
  result jsonb;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'MOBILE_UNAUTHENTICATED';
  end if;

  select assignment.tenant_id, assignment.ciclo_escolar_id,
    assignment.grupo_id, period.id, cycle.zona_horaria
    into tenant, cycle_id, group_id, period_id, timezone_name
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
    select concept.id, concept.nombre, concept.tipo, concept.created_at,
      (concept.created_at at time zone timezone_name)::date as activity_date
    from public.conceptos_evaluacion_docente concept
    where concept.tenant_id = tenant
      and concept.ciclo_escolar_id = cycle_id
      and concept.asignacion_profesor_id = p_asignacion_id
      and concept.periodo_evaluacion_id = period_id
      and concept.criterio_evaluacion_id = p_criterio_id
      and concept.subcriterio_evaluacion_id is not distinct from p_subcriterio_id
      and concept.activo
    order by concept.created_at desc, concept.id desc
    limit 200
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', concept.id,
    'name', concept.nombre,
    'type', concept.tipo,
    'createdAt', concept.created_at,
    'activityDate', concept.activity_date,
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
    ), '{}'::jsonb),
    'attendance', coalesce((
      select jsonb_object_agg(attendance_row.roster_id, attendance_row.status)
      from (
        select official.inscripcion_alumno_id::text as roster_id,
          official.estado as status
        from public.asistencias_diarias_docente official
        where official.tenant_id = tenant
          and official.ciclo_escolar_id = cycle_id
          and official.grupo_id = group_id
          and official.fecha_asistencia = concept.activity_date
        union all
        select provisional.alumno_provisional_id::text,
          provisional.estado
        from public.asistencias_provisionales_docente provisional
        where provisional.tenant_id = tenant
          and provisional.ciclo_escolar_id = cycle_id
          and provisional.grupo_id = group_id
          and provisional.fecha_asistencia = concept.activity_date
      ) attendance_row
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
  'Conceptos del periodo con notas y asistencia en la fecha institucional para distinguir ausencia, pendiente y corrección.';

reset search_path;
