-- Paso 12: una sola ruta transaccional para resultados automáticos y
-- calificación de entregas descriptivas. El porcentaje 0-100 sólo existe en
-- la frontera de entrada; la autoridad persistida permanece en 0-10.
set search_path = '';

-- La operación nueva comparte el registro de idempotencia del Paso 8.
alter table public.solicitudes_mutacion_academica
  drop constraint solicitudes_mutacion_operacion_valida;
alter table public.solicitudes_mutacion_academica
  add constraint solicitudes_mutacion_operacion_valida
  check (operacion in (
    'upsert_grades', 'close_grades', 'reopen_grades', 'exercise_result'
  ));

-- Un ejercicio evaluable sólo puede apuntar a un contexto activo. El índice
-- evita que dos periodos activos conviertan una respuesta en dos resultados.
do $active_link_preflight$
begin
  if exists (
    select 1
    from public.vinculos_evaluacion_ejercicio
    where activo
    group by tenant_id, ejercicio_id
    having count(*) > 1
  ) then
    raise exception 'Hay ejercicios con más de un vínculo activo; concilie antes del Paso 12';
  end if;
end
$active_link_preflight$;

create unique index vinculos_evaluacion_one_active_exercise_uidx
  on public.vinculos_evaluacion_ejercicio (tenant_id, ejercicio_id)
  where activo;

-- Normaliza el histórico heredado de forma repetible. Cada intento conserva
-- el porcentaje bruto como evidencia y añade explícitamente la nota 0-10.
create or replace function private.normalize_legacy_attempt_history(p_history jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  normalized jsonb := '[]'::jsonb;
  raw_percentage numeric;
  canonical_grade numeric;
  item_hits numeric;
  item_total numeric;
begin
  if p_history is null then return '[]'::jsonb; end if;
  if jsonb_typeof(p_history) <> 'array' then
    raise exception 'historico_intentos debe ser un arreglo JSON';
  end if;

  for item in select value from jsonb_array_elements(p_history)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Cada intento histórico debe ser un objeto JSON';
    end if;
    if item ->> 'scaleVersion' = 'grade10-v2' then
      normalized := normalized || jsonb_build_array(item);
      continue;
    end if;

    item_hits := case when item ->> 'aciertos' ~ '^[0-9]+([.][0-9]+)?$'
      then (item ->> 'aciertos')::numeric end;
    item_total := case when item ->> 'total_preguntas' ~ '^[0-9]+([.][0-9]+)?$'
      then (item ->> 'total_preguntas')::numeric end;
    raw_percentage := case
      when item_total > 0 and item_hits between 0 and item_total
        then round(item_hits * 100.0 / item_total, 4)
      when item ->> 'porcentaje_bruto' ~ '^[0-9]+([.][0-9]+)?$'
        then (item ->> 'porcentaje_bruto')::numeric
      when item ->> 'calificacion' ~ '^[0-9]+([.][0-9]+)?$'
        then (item ->> 'calificacion')::numeric
      else null
    end;
    if raw_percentage is null or raw_percentage not between 0 and 100 then
      raise exception 'Intento histórico sin porcentaje 0-100 conciliable';
    end if;
    canonical_grade := round(raw_percentage / 10.0, 4);
    normalized := normalized || jsonb_build_array(
      (item - 'calificacion' - 'porcentaje') || jsonb_build_object(
        'porcentaje_bruto', raw_percentage,
        'calificacion_10', canonical_grade,
        'scaleVersion', 'grade10-v2'
      )
    );
  end loop;
  return normalized;
end;
$$;

revoke all on function private.normalize_legacy_attempt_history(jsonb)
  from public, anon, authenticated;

-- Una fila automática con múltiples intentos pero sin evidencia no puede
-- inferirse por su valor (8 puede significar 8/100 o 8/10): se bloquea antes
-- de una conversión silenciosa.
do $legacy_attempt_preflight$
begin
  if exists (
    select 1
    from public.resultados_ejercicios r
    where r.registro_legacy
      and r.origen = 'automaticExercise'
      and coalesce(r.intentos, 0) > 1
      and jsonb_array_length(coalesce(r.historico_intentos, '[]'::jsonb)) = 0
  ) then
    raise exception 'Resultado automático multiintento sin histórico; requiere conciliación manual';
  end if;
end
$legacy_attempt_preflight$;

-- Backfill idempotente de históricos automáticos. La segunda ejecución no
-- vuelve a dividir porque cada elemento queda marcado con scaleVersion.
with normalized as (
  select r.id,
         private.normalize_legacy_attempt_history(r.historico_intentos) as history
  from public.resultados_ejercicios r
  where r.registro_legacy and r.origen = 'automaticExercise'
), values_10 as (
  select n.id, n.history,
         coalesce(sum((item ->> 'calificacion_10')::numeric), 0)::numeric(14,4) as grade_sum,
         count(item)::integer as attempt_count
  from normalized n
  left join lateral jsonb_array_elements(n.history) as attempts(item) on true
  group by n.id, n.history
), before_rows as (
  select r.id, r.tenant_id, r.calificacion, r.suma_calificaciones,
         r.historico_intentos, v.history, v.grade_sum, v.attempt_count
  from public.resultados_ejercicios r
  join values_10 v on v.id = r.id
), updated as (
  update public.resultados_ejercicios r
  set historico_intentos = b.history,
      intentos = case when b.attempt_count > 0 then b.attempt_count else r.intentos end,
      suma_calificaciones = case
        when b.attempt_count > 0 then b.grade_sum
        when coalesce(r.intentos, 0) <= 1 and r.total_preguntas > 0
          then round(r.aciertos * 10.0 / r.total_preguntas, 4)
        else r.suma_calificaciones
      end,
      calificacion = case
        when b.attempt_count > 0 then round(b.grade_sum / b.attempt_count, 4)
        when coalesce(r.intentos, 0) <= 1 and r.total_preguntas > 0
          then round(r.aciertos * 10.0 / r.total_preguntas, 4)
        else r.calificacion
      end
  from before_rows b
  where r.id = b.id
    and (
      r.historico_intentos is distinct from b.history
      or (b.attempt_count > 0 and (
        r.suma_calificaciones is distinct from b.grade_sum
        or r.calificacion is distinct from round(b.grade_sum / b.attempt_count, 4)
      ))
    )
  returning r.id, r.tenant_id, r.calificacion, r.suma_calificaciones,
            r.historico_intentos
)
insert into public.auditoria (
  tenant_id, user_id, accion, entidad, entidad_id, detalles
)
select u.tenant_id, null, 'academic.legacy_attempts.normalized',
       'resultados_ejercicios', u.id,
       jsonb_build_object(
         'before', jsonb_build_object(
           'grade', b.calificacion, 'gradeSum', b.suma_calificaciones,
           'attemptHistory', b.historico_intentos
         ),
         'after', jsonb_build_object(
           'grade', u.calificacion, 'gradeSum', u.suma_calificaciones,
           'attemptHistory', u.historico_intentos
         ),
         'scaleVersion', 'grade10-v2', 'migration', 'step12'
       )
from updated u join before_rows b on b.id = u.id;

-- Enlaza únicamente filas legacy con contexto inequívoco ya configurado. Los
-- ejercicios sin periodo/criterio elegido permanecen legacy para el corte
-- controlado del Paso 14; nunca se les inventa una asignación.
with candidates as (
  select r.id, v.id as link_id, v.ciclo_escolar_id, i.id as enrollment_id,
         t.unidad_id, v.origen, v.created_by as link_created_by,
         count(*) over (partition by r.id) as matches
  from public.resultados_ejercicios r
  join public.vinculos_evaluacion_ejercicio v
    on v.tenant_id = r.tenant_id and v.ejercicio_id = r.ejercicio_id and v.activo
  join public.asignaciones_profesor a
    on a.id = v.asignacion_profesor_id and a.tenant_id = v.tenant_id and a.activo
  join public.inscripciones_alumno i
    on i.tenant_id = r.tenant_id and i.ciclo_escolar_id = v.ciclo_escolar_id
   and i.grupo_id = a.grupo_id and i.alumno_id = r.alumno_id and i.activo
  join public.ejercicios e
    on e.id = r.ejercicio_id and e.tenant_id = r.tenant_id
  join public.temas t
    on t.id = e.tema_id and t.tenant_id = e.tenant_id
  where r.registro_legacy
), unique_candidates as (
  select * from candidates where matches = 1
)
update public.resultados_ejercicios r
set inscripcion_alumno_id = c.enrollment_id,
    vinculo_evaluacion_id = c.link_id,
    unidad_origen_id = c.unidad_id,
    origen = c.origen,
    calificado_por = case when r.estado = 'calificado'
      then coalesce(r.calificado_por, c.link_created_by) else r.calificado_por end,
    calificado_at = case when r.estado = 'calificado'
      then coalesce(r.calificado_at, r.fecha_completado, now()) else r.calificado_at end,
    registro_legacy = false
from unique_candidates c
where r.id = c.id and r.registro_legacy;

-- Configura o reubica el único vínculo activo de un ejercicio. La función no
-- acepta tenant/actor del cliente y delega las invariantes al trigger del Paso 5.
create or replace function public.configurar_vinculo_evaluacion_ejercicio(
  p_ejercicio_id uuid,
  p_asignacion_id uuid,
  p_periodo_id uuid,
  p_criterio_id uuid,
  p_subcriterio_id uuid default null
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
  exercise_type text;
  source_origin text;
  current_link public.vinculos_evaluacion_ejercicio%rowtype;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_UNAUTHENTICATED';
  end if;
  select a.tenant_id, a.ciclo_escolar_id, e.tipo
    into tenant, cycle_id, exercise_type
  from public.asignaciones_profesor a
  join public.ejercicios e on e.id = p_ejercicio_id and e.tenant_id = a.tenant_id
  where a.id = p_asignacion_id and a.activo;
  if tenant is null then
    raise exception using errcode = 'PT404', message = 'ACADEMIC_SCOPE_NOT_FOUND';
  end if;
  if not (select private.is_platform_admin())
     and not (select private.can_manage_teaching_assignment(tenant, p_asignacion_id)) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_LINK_FORBIDDEN';
  end if;
  if (select private.academic_scope_is_closed(tenant, p_asignacion_id, p_periodo_id)) then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_SCOPE_CLOSED';
  end if;
  if not exists (
    select 1 from public.periodos_evaluacion p
    join public.esquemas_evaluacion s
      on s.tenant_id = p.tenant_id and s.ciclo_escolar_id = p.ciclo_escolar_id
     and s.asignacion_profesor_id = p_asignacion_id and s.periodo_evaluacion_id = p.id
     and s.estado = 'activo'
    join public.criterios_evaluacion c
      on c.tenant_id = s.tenant_id and c.esquema_evaluacion_id = s.id
     and c.id = p_criterio_id and c.activo and c.tipo in ('actividades','hibrido')
    left join public.subcriterios_evaluacion sc
      on sc.tenant_id = c.tenant_id and sc.criterio_evaluacion_id = c.id
     and sc.id = p_subcriterio_id and sc.activo and sc.tipo in ('actividades','hibrido')
    where p.id = p_periodo_id and p.tenant_id = tenant
      and p.ciclo_escolar_id = cycle_id and p.estado <> 'cerrado'
      and (p_subcriterio_id is null or sc.id is not null)
  ) then
    raise exception using errcode = 'PT422', message = 'ACADEMIC_LINK_CONTEXT_INVALID';
  end if;

  source_origin := case when exercise_type = 'actividad_descriptiva'
    then 'descriptiveSubmission' else 'automaticExercise' end;
  select * into current_link
  from public.vinculos_evaluacion_ejercicio v
  where v.tenant_id = tenant and v.ejercicio_id = p_ejercicio_id and v.activo
  for update;

  if current_link.id is not null then
    if (current_link.periodo_evaluacion_id <> p_periodo_id
        or current_link.asignacion_profesor_id <> p_asignacion_id)
       and exists (
         select 1 from public.resultados_ejercicios r
         where r.tenant_id = tenant and r.vinculo_evaluacion_id = current_link.id
       ) then
      raise exception using errcode = 'PT409', message = 'ACADEMIC_LINK_HAS_RESULTS';
    end if;
    update public.vinculos_evaluacion_ejercicio v
    set ciclo_escolar_id = cycle_id,
        asignacion_profesor_id = p_asignacion_id,
        periodo_evaluacion_id = p_periodo_id,
        criterio_evaluacion_id = p_criterio_id,
        subcriterio_evaluacion_id = p_subcriterio_id,
        origen = source_origin,
        updated_at = now()
    where v.id = current_link.id
    returning * into current_link;
  else
    insert into public.vinculos_evaluacion_ejercicio (
      tenant_id, ciclo_escolar_id, asignacion_profesor_id,
      periodo_evaluacion_id, criterio_evaluacion_id,
      subcriterio_evaluacion_id, ejercicio_id, origen, created_by
    ) values (
      tenant, cycle_id, p_asignacion_id, p_periodo_id, p_criterio_id,
      p_subcriterio_id, p_ejercicio_id, source_origin, actor
    ) returning * into current_link;
  end if;

  return jsonb_build_object(
    'id', current_link.id, 'exerciseId', current_link.ejercicio_id,
    'assignmentId', current_link.asignacion_profesor_id,
    'periodId', current_link.periodo_evaluacion_id,
    'criterionId', current_link.criterio_evaluacion_id,
    'subcriterionId', current_link.subcriterio_evaluacion_id,
    'sourceType', current_link.origen
  );
end;
$$;

revoke all on function public.configurar_vinculo_evaluacion_ejercicio(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.configurar_vinculo_evaluacion_ejercicio(uuid, uuid, uuid, uuid, uuid)
  to authenticated, service_role;

-- Ruta única de persistencia. `automatic_attempt` acepta porcentaje bruto sólo
-- como evidencia de frontera; `descriptive_grade` recibe directamente 0-10.
create or replace function public.guardar_resultado_ejercicio_academico(
  p_ejercicio_id uuid,
  p_operacion text,
  p_idempotency_key uuid,
  p_expected_row_version bigint default 0,
  p_alumno_id uuid default null,
  p_aciertos integer default null,
  p_total_preguntas integer default null,
  p_porcentaje_bruto numeric default null,
  p_calificacion_10 numeric default null,
  p_observacion text default null,
  p_detalles jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_role text;
  tenant uuid;
  student_id uuid;
  link public.vinculos_evaluacion_ejercicio%rowtype;
  enrollment public.inscripciones_alumno%rowtype;
  exercise record;
  before_row public.resultados_ejercicios%rowtype;
  after_row public.resultados_ejercicios%rowtype;
  request_row public.solicitudes_mutacion_academica%rowtype;
  request_digest text;
  correlation uuid := gen_random_uuid();
  raw_percentage numeric(8,4);
  attempt_grade numeric(6,4);
  attempt_count integer;
  grade_sum numeric(14,4);
  average_grade numeric(6,4);
  attempt_history jsonb;
  response jsonb;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_UNAUTHENTICATED';
  end if;
  if p_idempotency_key is null or p_operacion not in ('automatic_attempt','descriptive_grade') then
    raise exception using errcode = 'PT400', message = 'ACADEMIC_EXERCISE_REQUEST_INVALID';
  end if;
  if p_expected_row_version < 0 or length(coalesce(p_observacion, '')) > 2000
     or (p_detalles is not null and pg_column_size(p_detalles) > 131072) then
    raise exception using errcode = 'PT422', message = 'ACADEMIC_EXERCISE_PAYLOAD_INVALID';
  end if;

  select p.tenant_id, p.rol into tenant, actor_role
  from public.profiles p join public.tenants t on t.id = p.tenant_id
  where p.id = actor and p.estatus = 'activo' and t.estado = 'activo';
  if tenant is null then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_MEMBERSHIP_INACTIVE';
  end if;
  student_id := case when p_operacion = 'automatic_attempt' then actor else p_alumno_id end;
  if student_id is null then
    raise exception using errcode = 'PT400', message = 'ACADEMIC_STUDENT_REQUIRED';
  end if;

  select v.* into link
  from public.vinculos_evaluacion_ejercicio v
  join public.periodos_evaluacion p
    on p.id = v.periodo_evaluacion_id and p.tenant_id = v.tenant_id
  join public.esquemas_evaluacion s
    on s.tenant_id = v.tenant_id and s.ciclo_escolar_id = v.ciclo_escolar_id
   and s.asignacion_profesor_id = v.asignacion_profesor_id
   and s.periodo_evaluacion_id = v.periodo_evaluacion_id and s.estado = 'activo'
  where v.tenant_id = tenant and v.ejercicio_id = p_ejercicio_id
    and v.activo and p.estado = 'activo';
  if link.id is null then
    raise exception using errcode = 'PT404', message = 'ACADEMIC_ACTIVE_LINK_NOT_FOUND';
  end if;
  if (p_operacion = 'automatic_attempt' and link.origen <> 'automaticExercise')
     or (p_operacion = 'descriptive_grade' and link.origen <> 'descriptiveSubmission') then
    raise exception using errcode = 'PT422', message = 'ACADEMIC_SOURCE_OPERATION_MISMATCH';
  end if;

  select i.* into enrollment
  from public.inscripciones_alumno i
  join public.asignaciones_profesor a
    on a.id = link.asignacion_profesor_id and a.tenant_id = link.tenant_id
   and a.ciclo_escolar_id = link.ciclo_escolar_id and a.grupo_id = i.grupo_id and a.activo
  where i.tenant_id = tenant and i.ciclo_escolar_id = link.ciclo_escolar_id
    and i.alumno_id = student_id and i.activo;
  if enrollment.id is null then
    raise exception using errcode = 'PT404', message = 'ACADEMIC_ENROLLMENT_NOT_FOUND';
  end if;
  if p_operacion = 'automatic_attempt' and (actor_role <> 'alumno' or student_id <> actor) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_AUTOMATIC_RESULT_FORBIDDEN';
  end if;
  if p_operacion = 'descriptive_grade'
     and (actor_role not in ('profesor','admin','superuser')
          or not (select private.can_manage_teaching_assignment(
            tenant, link.asignacion_profesor_id
          ))) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_DESCRIPTIVE_GRADE_FORBIDDEN';
  end if;
  if (select private.academic_scope_is_closed(
    tenant, link.asignacion_profesor_id, link.periodo_evaluacion_id
  )) then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_SCOPE_CLOSED';
  end if;

  select e.fecha_entrega, t.unidad_id into exercise
  from public.ejercicios e join public.temas t
    on t.id = e.tema_id and t.tenant_id = e.tenant_id
  where e.id = p_ejercicio_id and e.tenant_id = tenant;
  if exercise.unidad_id is null then
    raise exception using errcode = 'PT404', message = 'ACADEMIC_EXERCISE_NOT_FOUND';
  end if;
  if p_operacion = 'automatic_attempt' and exercise.fecha_entrega is not null
     and now() > exercise.fecha_entrega then
    return jsonb_build_object(
      'status', 'expired', 'saved', false,
      'message', 'Ejercicio vencido. Puedes practicar, pero la nota no se guardará.'
    );
  end if;

  request_digest := md5(jsonb_build_object(
    'exerciseId', p_ejercicio_id, 'operation', p_operacion,
    'studentId', student_id, 'expectedRowVersion', p_expected_row_version,
    'hits', p_aciertos, 'total', p_total_preguntas,
    'rawPercentage', p_porcentaje_bruto, 'grade10', p_calificacion_10,
    'observation', nullif(btrim(p_observacion), ''), 'details', p_detalles
  )::text);
  insert into public.solicitudes_mutacion_academica (
    tenant_id, actor_id, operacion, idempotency_key,
    request_hash, correlation_id
  ) values (
    tenant, actor, 'exercise_result', p_idempotency_key,
    request_digest, correlation
  ) on conflict (tenant_id, actor_id, operacion, idempotency_key) do nothing;

  select * into request_row
  from public.solicitudes_mutacion_academica r
  where r.tenant_id = tenant and r.actor_id = actor
    and r.operacion = 'exercise_result'
    and r.idempotency_key = p_idempotency_key
  for update;
  if request_row.request_hash <> request_digest then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_IDEMPOTENCY_MISMATCH';
  end if;
  if request_row.respuesta is not null then
    return request_row.respuesta || jsonb_build_object('replayed', true);
  end if;
  correlation := request_row.correlation_id;

  select * into before_row
  from public.resultados_ejercicios r
  where r.tenant_id = tenant and r.alumno_id = student_id
    and r.ejercicio_id = p_ejercicio_id
  for update;
  if before_row.id is null and p_expected_row_version <> 0 then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_VERSION_CONFLICT';
  end if;
  if before_row.id is not null and before_row.row_version <> p_expected_row_version then
    raise exception using
      errcode = 'PT409', message = 'ACADEMIC_VERSION_CONFLICT',
      detail = jsonb_build_object(
        'code', 'ACADEMIC_VERSION_CONFLICT', 'sourceId', before_row.id,
        'expectedRowVersion', p_expected_row_version,
        'actualRowVersion', before_row.row_version
      )::text;
  end if;
  if before_row.id is not null and (
    before_row.inscripcion_alumno_id is distinct from enrollment.id
    or before_row.vinculo_evaluacion_id is distinct from link.id
    or before_row.registro_legacy
  ) then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_RESULT_CONTEXT_CONFLICT';
  end if;

  if p_operacion = 'automatic_attempt' then
    if before_row.bloqueado then
      response := jsonb_build_object(
        'status', 'locked', 'saved', false, 'replayed', false,
        'sourceId', before_row.id, 'grade', before_row.calificacion,
        'rowVersion', before_row.row_version, 'attempts', before_row.intentos,
        'correlationId', correlation
      );
    else
      if p_total_preguntas is null or p_total_preguntas <= 0
         or p_aciertos is null or p_aciertos < 0 or p_aciertos > p_total_preguntas
         or p_porcentaje_bruto is null or p_porcentaje_bruto not between 0 and 100 then
        raise exception using errcode = 'PT422', message = 'ACADEMIC_AUTOMATIC_SCORE_INVALID';
      end if;
      raw_percentage := round(p_aciertos * 100.0 / p_total_preguntas, 4);
      if abs(raw_percentage - p_porcentaje_bruto) > 0.01 then
        raise exception using errcode = 'PT422', message = 'ACADEMIC_AUTOMATIC_PERCENTAGE_MISMATCH';
      end if;
      attempt_grade := round(raw_percentage / 10.0, 4);
      attempt_count := coalesce(before_row.intentos, 0) + 1;
      grade_sum := coalesce(before_row.suma_calificaciones, 0) + attempt_grade;
      average_grade := round(grade_sum / attempt_count, 4);
      attempt_history := coalesce(before_row.historico_intentos, '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
          'intento', attempt_count, 'fecha', now(),
          'porcentaje_bruto', raw_percentage,
          'calificacion_10', attempt_grade,
          'scaleVersion', 'grade10-v2',
          'aciertos', p_aciertos, 'total_preguntas', p_total_preguntas,
          'detalles', p_detalles
        ));

      if before_row.id is null then
        insert into public.resultados_ejercicios (
          tenant_id, alumno_id, ejercicio_id, calificacion, aciertos,
          total_preguntas, intentos, suma_calificaciones, bloqueado,
          estado, calificado_por, calificado_at, fecha_completado,
          historico_intentos, inscripcion_alumno_id, vinculo_evaluacion_id,
          unidad_origen_id, origen, observacion, registro_legacy
        ) values (
          tenant, student_id, p_ejercicio_id, average_grade, p_aciertos,
          p_total_preguntas, attempt_count, grade_sum, attempt_grade = 10,
          'calificado', actor, now(), now(), attempt_history,
          enrollment.id, link.id, exercise.unidad_id, link.origen,
          nullif(btrim(p_observacion), ''), false
        ) returning * into after_row;
      else
        update public.resultados_ejercicios r set
          calificacion = average_grade, aciertos = p_aciertos,
          total_preguntas = p_total_preguntas, intentos = attempt_count,
          suma_calificaciones = grade_sum, bloqueado = attempt_grade = 10,
          estado = 'calificado', calificado_por = actor, calificado_at = now(),
          fecha_completado = now(), historico_intentos = attempt_history,
          observacion = nullif(btrim(p_observacion), '')
        where r.id = before_row.id and r.tenant_id = tenant
          and r.row_version = p_expected_row_version
        returning * into after_row;
      end if;
      if after_row.id is null then
        raise exception using errcode = 'PT409', message = 'ACADEMIC_VERSION_CONFLICT';
      end if;
      response := jsonb_build_object(
        'status', 'saved', 'saved', true, 'replayed', false,
        'sourceId', after_row.id, 'grade', after_row.calificacion,
        'rowVersion', after_row.row_version, 'attempts', after_row.intentos,
        'blocked', after_row.bloqueado, 'rawPercentage', raw_percentage,
        'attemptGrade', attempt_grade, 'correlationId', correlation
      );
    end if;
  else
    if before_row.id is null or before_row.origen <> 'descriptiveSubmission'
       or (before_row.archivo_path is null and before_row.archivo_url is null) then
      raise exception using errcode = 'PT404', message = 'ACADEMIC_SUBMISSION_NOT_FOUND';
    end if;
    if p_calificacion_10 is null or p_calificacion_10 not between 0 and 10 then
      raise exception using errcode = 'PT422', message = 'ACADEMIC_GRADE_INVALID';
    end if;
    update public.resultados_ejercicios r set
      calificacion = round(p_calificacion_10, 4), estado = 'calificado',
      bloqueado = true, calificado_por = actor, calificado_at = now(),
      observacion = nullif(btrim(p_observacion), '')
    where r.id = before_row.id and r.tenant_id = tenant
      and r.row_version = p_expected_row_version
    returning * into after_row;
    if after_row.id is null then
      raise exception using errcode = 'PT409', message = 'ACADEMIC_VERSION_CONFLICT';
    end if;
    response := jsonb_build_object(
      'status', 'saved', 'saved', true, 'replayed', false,
      'sourceId', after_row.id, 'grade', after_row.calificacion,
      'rowVersion', after_row.row_version, 'attempts', after_row.intentos,
      'blocked', after_row.bloqueado, 'correlationId', correlation
    );
  end if;

  if coalesce((response ->> 'saved')::boolean, false) then
    insert into public.auditoria (
      tenant_id, user_id, accion, entidad, entidad_id, detalles
    ) values (
      tenant, actor,
      case when before_row.id is null then 'academic.exercise_result.created'
           else 'academic.exercise_result.updated' end,
      'resultados_ejercicios', after_row.id,
      jsonb_build_object(
        'before', case when before_row.id is null then null else jsonb_build_object(
          'state', before_row.estado, 'grade', before_row.calificacion,
          'rowVersion', before_row.row_version, 'attempts', before_row.intentos
        ) end,
        'after', jsonb_build_object(
          'state', after_row.estado, 'grade', after_row.calificacion,
          'rowVersion', after_row.row_version, 'attempts', after_row.intentos
        ),
        'operation', p_operacion, 'rawPercentage', raw_percentage,
        'reason', case when p_operacion = 'automatic_attempt'
          then 'Intento automático del alumno' else 'Calificación de entrega descriptiva' end,
        'correlationId', correlation,
        'assignmentId', link.asignacion_profesor_id,
        'periodId', link.periodo_evaluacion_id,
        'enrollmentId', enrollment.id
      )
    );
  end if;
  update public.solicitudes_mutacion_academica r
  set respuesta = response, completed_at = now()
  where r.id = request_row.id;
  return response;
end;
$$;

revoke all on function public.guardar_resultado_ejercicio_academico(
  uuid, text, uuid, bigint, uuid, integer, integer, numeric, numeric, text, jsonb
) from public, anon, authenticated;
grant execute on function public.guardar_resultado_ejercicio_academico(
  uuid, text, uuid, bigint, uuid, integer, integer, numeric, numeric, text, jsonb
) to authenticated, service_role;

comment on function public.guardar_resultado_ejercicio_academico(
  uuid, text, uuid, bigint, uuid, integer, integer, numeric, numeric, text, jsonb
) is 'Paso 12: única escritura auditada de intentos automáticos y notas descriptivas; autoridad 0-10.';
