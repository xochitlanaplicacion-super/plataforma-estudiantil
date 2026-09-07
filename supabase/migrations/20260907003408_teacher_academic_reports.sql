-- Reporte académico dinámico del profesor. No presupone nombres de criterios:
-- proyecta exactamente el esquema activo de cada asignación y su evidencia.
set search_path = public, extensions;

create or replace function public.obtener_reporte_academico_docente(p_asignacion_id uuid)
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
  scheme_id uuid;
  result jsonb;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_REPORT_UNAUTHENTICATED';
  end if;

  select assignment.tenant_id, assignment.ciclo_escolar_id, assignment.grupo_id,
    period.id, scheme.id
    into tenant, cycle_id, group_id, period_id, scheme_id
  from public.asignaciones_profesor assignment
  join public.ciclos_escolares cycle
    on cycle.id = assignment.ciclo_escolar_id
   and cycle.tenant_id = assignment.tenant_id
   and cycle.estado = 'activo'
  join public.periodos_evaluacion period
    on period.tenant_id = assignment.tenant_id
   and period.ciclo_escolar_id = assignment.ciclo_escolar_id
   and period.estado = 'activo'
  left join public.esquemas_evaluacion scheme
    on scheme.tenant_id = assignment.tenant_id
   and scheme.asignacion_profesor_id = assignment.id
   and scheme.periodo_evaluacion_id = period.id
   and scheme.estado = 'activo'
  where assignment.id = p_asignacion_id
    and assignment.profesor_id = actor
    and assignment.activo;

  if tenant is null then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_REPORT_ASSIGNMENT_FORBIDDEN';
  end if;

  with criteria_flat as materialized (
    select criterion.id as criterion_id, null::uuid as subcriterion_id,
      criterion.nombre as criterion_name, null::text as subcriterion_name,
      criterion.tipo as result_type, criterion.peso as weight,
      null::numeric as internal_weight, criterion.orden as criterion_order, 0 as subcriterion_order
    from public.criterios_evaluacion criterion
    where criterion.tenant_id = tenant
      and criterion.esquema_evaluacion_id = scheme_id
      and criterion.activo
    union all
    select criterion.id, subcriterion.id, criterion.nombre, subcriterion.nombre,
      subcriterion.tipo, criterion.peso, subcriterion.peso_interno,
      criterion.orden, subcriterion.orden
    from public.criterios_evaluacion criterion
    join public.subcriterios_evaluacion subcriterion
      on subcriterion.tenant_id = criterion.tenant_id
     and subcriterion.criterio_evaluacion_id = criterion.id
     and subcriterion.activo
    where criterion.tenant_id = tenant
      and criterion.esquema_evaluacion_id = scheme_id
      and criterion.activo
  ), roster as materialized (
    select enrollment.id as enrollment_id, profile.id as student_id,
      concat_ws(' ', profile.nombre, profile.apellidos) as student_name,
      profile.matricula as enrollment_code
    from public.inscripciones_alumno enrollment
    join public.profiles profile
      on profile.id = enrollment.alumno_id
     and profile.tenant_id = enrollment.tenant_id
    where enrollment.tenant_id = tenant
      and enrollment.ciclo_escolar_id = cycle_id
      and enrollment.grupo_id = group_id
      and enrollment.activo
  ), attendance_dates as materialized (
    select distinct attendance.fecha_asistencia as attendance_date
    from public.asistencias_diarias_docente attendance
    join public.periodos_evaluacion period
      on period.id = period_id
     and period.tenant_id = attendance.tenant_id
     and attendance.fecha_asistencia between period.fecha_inicio and period.fecha_fin
    where attendance.tenant_id = tenant
      and attendance.ciclo_escolar_id = cycle_id
      and attendance.grupo_id = group_id
  )
  select jsonb_build_object(
    'generatedAt', clock_timestamp(),
    'tenant', jsonb_build_object(
      'id', tenant_row.id,
      'name', coalesce(config.nombre_completo, config.nombre_corto, tenant_row.nombre),
      'logoUrl', config.logo_url,
      'primaryColor', coalesce(config.color_primario, '#00b894'),
      'secondaryColor', coalesce(config.color_secundario, '#073b6f')
    ),
    'teacher', jsonb_build_object(
      'id', teacher.id,
      'name', concat_ws(' ', teacher.nombre, teacher.apellidos)
    ),
    'cycle', jsonb_build_object('id', cycle.id, 'name', cycle.nombre),
    'period', jsonb_build_object(
      'id', period.id, 'name', period.nombre,
      'startDate', period.fecha_inicio, 'endDate', period.fecha_fin
    ),
    'assignment', jsonb_build_object(
      'id', assignment.id, 'subjectName', subject.nombre,
      'levelName', level_row.nombre, 'gradeName', grade.nombre,
      'groupName', class_group.nombre, 'shift', class_group.turno
    ),
    'attendanceDates', coalesce((
      select jsonb_agg(date_row.attendance_date order by date_row.attendance_date)
      from attendance_dates date_row
    ), '[]'::jsonb),
    'criteria', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', criterion.criterion_id::text || ':' || coalesce(criterion.subcriterion_id::text, 'root'),
        'criterionId', criterion.criterion_id,
        'subcriterionId', criterion.subcriterion_id,
        'criterionName', criterion.criterion_name,
        'subcriterionName', criterion.subcriterion_name,
        'type', criterion.result_type,
        'weight', criterion.weight,
        'internalWeight', criterion.internal_weight
      ) order by criterion.criterion_order, criterion.subcriterion_order)
      from criteria_flat criterion
    ), '[]'::jsonb),
    'concepts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', concept.id,
        'criterionKey', concept.criterio_evaluacion_id::text || ':' || coalesce(concept.subcriterio_evaluacion_id::text, 'root'),
        'name', concept.nombre, 'type', concept.tipo, 'createdAt', concept.created_at
      ) order by concept.created_at, concept.nombre)
      from public.conceptos_evaluacion_docente concept
      where concept.tenant_id = tenant
        and concept.ciclo_escolar_id = cycle_id
        and concept.asignacion_profesor_id = p_asignacion_id
        and concept.periodo_evaluacion_id = period_id
        and concept.activo
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollmentId', student.enrollment_id,
        'studentId', student.student_id,
        'name', student.student_name,
        'enrollmentCode', student.enrollment_code,
        'attendance', coalesce((
          select jsonb_object_agg(attendance.fecha_asistencia::text, jsonb_build_object(
            'status', attendance.estado, 'observation', coalesce(attendance.observacion, '')
          ))
          from public.asistencias_diarias_docente attendance
          where attendance.tenant_id = tenant
            and attendance.ciclo_escolar_id = cycle_id
            and attendance.grupo_id = group_id
            and attendance.inscripcion_alumno_id = student.enrollment_id
            and attendance.fecha_asistencia in (select date_row.attendance_date from attendance_dates date_row)
        ), '{}'::jsonb),
        'results', coalesce((
          select jsonb_object_agg(criterion.criterion_id::text || ':' || coalesce(criterion.subcriterion_id::text, 'root'),
            jsonb_build_object(
              'grade', direct_grade.calificacion,
              'state', coalesce(direct_grade.estado, 'sin_capturar'),
              'participationPoints', coalesce(participation.points, 0),
              'participationCount', coalesce(participation.event_count, 0)
            ))
          from criteria_flat criterion
          left join public.calificaciones_directas direct_grade
            on direct_grade.tenant_id = tenant
           and direct_grade.ciclo_escolar_id = cycle_id
           and direct_grade.asignacion_profesor_id = p_asignacion_id
           and direct_grade.periodo_evaluacion_id = period_id
           and direct_grade.inscripcion_alumno_id = student.enrollment_id
           and direct_grade.criterio_evaluacion_id = criterion.criterion_id
           and direct_grade.subcriterio_evaluacion_id is not distinct from criterion.subcriterion_id
          left join lateral (
            select
              coalesce(sum(case when event.tipo_evento = 'reversa' then -event.puntos else event.puntos end), 0) as points,
              (count(*) filter (where event.tipo_evento = 'registro')
                - count(*) filter (where event.tipo_evento = 'reversa'))::integer as event_count
            from public.eventos_participacion event
            where event.tenant_id = tenant
              and event.ciclo_escolar_id = cycle_id
              and event.asignacion_profesor_id = p_asignacion_id
              and event.periodo_evaluacion_id = period_id
              and event.inscripcion_alumno_id = student.enrollment_id
              and event.criterio_evaluacion_id = criterion.criterion_id
              and event.subcriterio_evaluacion_id is not distinct from criterion.subcriterion_id
          ) participation on true
        ), '{}'::jsonb),
        'conceptGrades', coalesce((
          select jsonb_object_agg(concept_grade.concepto_id::text, jsonb_build_object(
            'grade', concept_grade.calificacion,
            'observation', coalesce(concept_grade.observacion, ''),
            'updatedAt', concept_grade.updated_at
          ))
          from public.calificaciones_concepto_docente concept_grade
          join public.conceptos_evaluacion_docente concept
            on concept.id = concept_grade.concepto_id
           and concept.tenant_id = concept_grade.tenant_id
           and concept.asignacion_profesor_id = p_asignacion_id
           and concept.periodo_evaluacion_id = period_id
           and concept.activo
          where concept_grade.tenant_id = tenant
            and concept_grade.ciclo_escolar_id = cycle_id
            and concept_grade.inscripcion_alumno_id = student.enrollment_id
        ), '{}'::jsonb)
      ) order by student.student_name)
      from roster student
    ), '[]'::jsonb)
  ) into result
  from public.asignaciones_profesor assignment
  join public.tenants tenant_row on tenant_row.id = assignment.tenant_id
  join public.profiles teacher on teacher.id = actor and teacher.tenant_id = assignment.tenant_id
  join public.ciclos_escolares cycle on cycle.id = cycle_id and cycle.tenant_id = assignment.tenant_id
  join public.periodos_evaluacion period on period.id = period_id and period.tenant_id = assignment.tenant_id
  join public.materias subject on subject.id = assignment.materia_id and subject.tenant_id = assignment.tenant_id
  join public.niveles level_row on level_row.id = assignment.nivel_id and level_row.tenant_id = assignment.tenant_id
  join public.grados grade on grade.id = assignment.grado_id and grade.tenant_id = assignment.tenant_id
  join public.grupos class_group on class_group.id = assignment.grupo_id and class_group.tenant_id = assignment.tenant_id
  left join public.configuracion_sistema config on config.tenant_id = assignment.tenant_id
  where assignment.id = p_asignacion_id
    and assignment.tenant_id = tenant
    and assignment.profesor_id = actor;

  return result;
end;
$$;

revoke all on function public.obtener_reporte_academico_docente(uuid)
  from public, anon, authenticated;
grant execute on function public.obtener_reporte_academico_docente(uuid)
  to authenticated, service_role;

comment on function public.obtener_reporte_academico_docente(uuid) is
  'Reporte autorizado por asignación con asistencia, criterios dinámicos y evidencia del periodo activo.';
