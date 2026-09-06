-- Pase de lista diario para captura docente móvil. La fecha siempre se deriva
-- en el servidor con la zona horaria del ciclo activo.
set search_path = public, extensions;

create table public.asistencias_diarias_docente (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ciclo_escolar_id uuid not null,
  grupo_id uuid not null,
  inscripcion_alumno_id uuid not null,
  alumno_id uuid not null,
  fecha_asistencia date not null,
  estado text not null,
  observacion text,
  registrado_por uuid not null,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asistencias_diarias_estado_check check (estado in ('presente', 'ausente')),
  constraint asistencias_diarias_observacion_check check (length(coalesce(observacion, '')) <= 500),
  constraint asistencias_diarias_row_version_check check (row_version > 0),
  constraint asistencias_diarias_unique unique (tenant_id, inscripcion_alumno_id, fecha_asistencia),
  constraint asistencias_diarias_enrollment_fkey
    foreign key (inscripcion_alumno_id, tenant_id, ciclo_escolar_id)
    references public.inscripciones_alumno (id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint asistencias_diarias_student_fkey
    foreign key (alumno_id, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict,
  constraint asistencias_diarias_group_fkey
    foreign key (grupo_id, tenant_id)
    references public.grupos (id, tenant_id) on delete restrict,
  constraint asistencias_diarias_actor_fkey
    foreign key (registrado_por, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict
);

create index asistencias_diarias_group_date_idx
  on public.asistencias_diarias_docente (tenant_id, ciclo_escolar_id, grupo_id, fecha_asistencia);
create index asistencias_diarias_actor_recent_idx
  on public.asistencias_diarias_docente (tenant_id, registrado_por, fecha_asistencia desc);

create table public.operaciones_asistencia_docente (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_id uuid not null,
  idempotency_key uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  constraint operaciones_asistencia_hash_check check (length(payload_hash) = 32),
  constraint operaciones_asistencia_unique unique (tenant_id, actor_id, idempotency_key),
  constraint operaciones_asistencia_actor_fkey
    foreign key (actor_id, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict
);

create index operaciones_asistencia_actor_recent_idx
  on public.operaciones_asistencia_docente (tenant_id, actor_id, created_at desc);

alter table public.asistencias_diarias_docente enable row level security;
alter table public.asistencias_diarias_docente force row level security;
alter table public.operaciones_asistencia_docente enable row level security;
alter table public.operaciones_asistencia_docente force row level security;

create policy daily_attendance_tenant_boundary on public.asistencias_diarias_docente
  as restrictive for select to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)));

create policy daily_attendance_teacher_select on public.asistencias_diarias_docente
  for select to authenticated using (exists (
    select 1
    from public.asignaciones_profesor assignment
    where assignment.tenant_id = asistencias_diarias_docente.tenant_id
      and assignment.ciclo_escolar_id = asistencias_diarias_docente.ciclo_escolar_id
      and assignment.grupo_id = asistencias_diarias_docente.grupo_id
      and assignment.profesor_id = (select auth.uid())
      and assignment.activo
  ));

revoke all on public.asistencias_diarias_docente, public.operaciones_asistencia_docente
  from public, anon, authenticated;
grant select on public.asistencias_diarias_docente to authenticated;
grant all on public.asistencias_diarias_docente, public.operaciones_asistencia_docente to service_role;

create or replace function public.obtener_asistencia_docente_movil(p_asignacion_id uuid)
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
  group_id uuid;
  timezone_name text;
  attendance_date date;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'MOBILE_UNAUTHENTICATED';
  end if;

  select assignment.tenant_id, assignment.ciclo_escolar_id, assignment.grupo_id, cycle.zona_horaria
    into tenant, cycle_id, group_id, timezone_name
  from public.asignaciones_profesor assignment
  join public.ciclos_escolares cycle
    on cycle.id = assignment.ciclo_escolar_id
   and cycle.tenant_id = assignment.tenant_id
   and cycle.estado = 'activo'
  where assignment.id = p_asignacion_id
    and assignment.profesor_id = actor
    and assignment.activo;

  if tenant is null then
    raise exception using errcode = 'PT403', message = 'MOBILE_ASSIGNMENT_FORBIDDEN';
  end if;

  attendance_date := (clock_timestamp() at time zone timezone_name)::date;

  return jsonb_build_object(
    'date', attendance_date,
    'groupId', group_id,
    'hasRecord', exists (
      select 1 from public.asistencias_diarias_docente attendance
      where attendance.tenant_id = tenant
        and attendance.ciclo_escolar_id = cycle_id
        and attendance.grupo_id = group_id
        and attendance.fecha_asistencia = attendance_date
    ),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollmentId', enrollment.id,
        'status', attendance.estado,
        'observation', coalesce(attendance.observacion, '')
      ) order by profile.apellidos, profile.nombre)
      from public.inscripciones_alumno enrollment
      join public.profiles profile
        on profile.id = enrollment.alumno_id and profile.tenant_id = enrollment.tenant_id
      left join public.asistencias_diarias_docente attendance
        on attendance.tenant_id = enrollment.tenant_id
       and attendance.ciclo_escolar_id = enrollment.ciclo_escolar_id
       and attendance.inscripcion_alumno_id = enrollment.id
       and attendance.fecha_asistencia = attendance_date
      where enrollment.tenant_id = tenant
        and enrollment.ciclo_escolar_id = cycle_id
        and enrollment.grupo_id = group_id
        and enrollment.activo
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.guardar_asistencia_docente_movil(
  p_asignacion_id uuid,
  p_registros jsonb,
  p_idempotency_key uuid,
  p_expected_cycle_id uuid,
  p_expected_period_id uuid
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
  group_id uuid;
  period_id uuid;
  timezone_name text;
  attendance_date date;
  normalized_hash text;
  prior_hash text;
  student_count integer;
  input_count integer;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'MOBILE_UNAUTHENTICATED';
  end if;
  if p_idempotency_key is null or jsonb_typeof(p_registros) <> 'array' then
    raise exception using errcode = 'PT422', message = 'MOBILE_ATTENDANCE_INVALID';
  end if;

  select assignment.tenant_id, assignment.ciclo_escolar_id, assignment.grupo_id, cycle.zona_horaria
    into tenant, cycle_id, group_id, timezone_name
  from public.asignaciones_profesor assignment
  join public.ciclos_escolares cycle
    on cycle.id = assignment.ciclo_escolar_id
   and cycle.tenant_id = assignment.tenant_id
   and cycle.estado = 'activo'
  where assignment.id = p_asignacion_id
    and assignment.profesor_id = actor
    and assignment.activo;

  if tenant is null then
    raise exception using errcode = 'PT403', message = 'MOBILE_ASSIGNMENT_FORBIDDEN';
  end if;

  select period.id into period_id
  from public.periodos_evaluacion period
  where period.tenant_id = tenant
    and period.ciclo_escolar_id = cycle_id
    and period.estado = 'activo';

  if cycle_id is distinct from p_expected_cycle_id or period_id is distinct from p_expected_period_id then
    raise exception using errcode = 'PT409', message = 'MOBILE_ACADEMIC_CONTEXT_CHANGED';
  end if;

  attendance_date := (clock_timestamp() at time zone timezone_name)::date;
  normalized_hash := md5(p_asignacion_id::text || attendance_date::text || p_registros::text);

  select operation.payload_hash into prior_hash
  from public.operaciones_asistencia_docente operation
  where operation.tenant_id = tenant
    and operation.actor_id = actor
    and operation.idempotency_key = p_idempotency_key;

  if prior_hash is not null then
    if prior_hash <> normalized_hash then
      raise exception using errcode = 'PT409', message = 'MOBILE_IDEMPOTENCY_MISMATCH';
    end if;
    return jsonb_build_object('date', attendance_date, 'replayed', true);
  end if;

  select count(*) into student_count
  from public.inscripciones_alumno enrollment
  where enrollment.tenant_id = tenant
    and enrollment.ciclo_escolar_id = cycle_id
    and enrollment.grupo_id = group_id
    and enrollment.activo;

  select count(*) into input_count
  from jsonb_to_recordset(p_registros) as record(enrollment_id uuid, status text, observation text);

  if input_count <> student_count
    or exists (
      select 1
      from jsonb_to_recordset(p_registros) as record(enrollment_id uuid, status text, observation text)
      where record.enrollment_id is null
        or record.status not in ('presente', 'ausente')
        or length(coalesce(record.observation, '')) > 500
    )
    or exists (
      select record.enrollment_id
      from jsonb_to_recordset(p_registros) as record(enrollment_id uuid, status text, observation text)
      group by record.enrollment_id having count(*) > 1
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_registros) as record(enrollment_id uuid, status text, observation text)
      left join public.inscripciones_alumno enrollment
        on enrollment.id = record.enrollment_id
       and enrollment.tenant_id = tenant
       and enrollment.ciclo_escolar_id = cycle_id
       and enrollment.grupo_id = group_id
       and enrollment.activo
      where enrollment.id is null
    ) then
    raise exception using errcode = 'PT422', message = 'MOBILE_ATTENDANCE_ROSTER_MISMATCH';
  end if;

  insert into public.operaciones_asistencia_docente(tenant_id, actor_id, idempotency_key, payload_hash)
  values (tenant, actor, p_idempotency_key, normalized_hash);

  insert into public.asistencias_diarias_docente(
    tenant_id, ciclo_escolar_id, grupo_id, inscripcion_alumno_id, alumno_id,
    fecha_asistencia, estado, observacion, registrado_por
  )
  select tenant, cycle_id, group_id, enrollment.id, enrollment.alumno_id,
    attendance_date, record.status, nullif(btrim(coalesce(record.observation, '')), ''), actor
  from jsonb_to_recordset(p_registros) as record(enrollment_id uuid, status text, observation text)
  join public.inscripciones_alumno enrollment
    on enrollment.id = record.enrollment_id
   and enrollment.tenant_id = tenant
   and enrollment.ciclo_escolar_id = cycle_id
   and enrollment.grupo_id = group_id
   and enrollment.activo
  on conflict (tenant_id, inscripcion_alumno_id, fecha_asistencia) do update set
    estado = excluded.estado,
    observacion = excluded.observacion,
    registrado_por = actor,
    row_version = public.asistencias_diarias_docente.row_version + 1,
    updated_at = now();

  insert into public.auditoria(tenant_id, user_id, accion, entidad, entidad_id, detalles)
  values (tenant, actor, 'academic.mobile.attendance.saved', 'grupos', group_id,
    jsonb_build_object('date', attendance_date, 'students', input_count, 'assignmentId', p_asignacion_id));

  return jsonb_build_object('date', attendance_date, 'replayed', false, 'students', input_count);
end;
$$;

revoke all on function public.obtener_asistencia_docente_movil(uuid),
  public.guardar_asistencia_docente_movil(uuid, jsonb, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.obtener_asistencia_docente_movil(uuid),
  public.guardar_asistencia_docente_movil(uuid, jsonb, uuid, uuid, uuid)
  to authenticated, service_role;

comment on table public.asistencias_diarias_docente is
  'Pase de lista diario por grupo; sólo el servidor determina la fecha institucional editable.';

create or replace function public.obtener_resumen_participacion_docente_movil(p_asignacion_id uuid)
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
  group_id uuid;
  period_id uuid;
  timezone_name text;
  local_date date;
  assignment_name text;
  group_name text;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'MOBILE_UNAUTHENTICATED';
  end if;

  select assignment.tenant_id, assignment.ciclo_escolar_id, assignment.grupo_id,
    period.id, cycle.zona_horaria, subject.nombre, class_group.nombre
    into tenant, cycle_id, group_id, period_id, timezone_name, assignment_name, group_name
  from public.asignaciones_profesor assignment
  join public.ciclos_escolares cycle
    on cycle.id = assignment.ciclo_escolar_id and cycle.tenant_id = assignment.tenant_id and cycle.estado = 'activo'
  join public.periodos_evaluacion period
    on period.tenant_id = assignment.tenant_id and period.ciclo_escolar_id = assignment.ciclo_escolar_id and period.estado = 'activo'
  join public.materias subject on subject.id = assignment.materia_id and subject.tenant_id = assignment.tenant_id
  join public.grupos class_group on class_group.id = assignment.grupo_id and class_group.tenant_id = assignment.tenant_id
  where assignment.id = p_asignacion_id
    and assignment.profesor_id = actor
    and assignment.activo;

  if tenant is null then
    raise exception using errcode = 'PT403', message = 'MOBILE_ASSIGNMENT_FORBIDDEN';
  end if;

  local_date := (clock_timestamp() at time zone timezone_name)::date;

  return jsonb_build_object(
    'date', local_date,
    'subjectName', assignment_name,
    'groupName', group_name,
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollmentId', enrollment.id,
        'name', concat_ws(' ', profile.nombre, profile.apellidos),
        'todayCount', coalesce(summary.today_count, 0),
        'todayPoints', coalesce(summary.today_points, 0),
        'periodCount', coalesce(summary.period_count, 0),
        'periodPoints', coalesce(summary.period_points, 0)
      ) order by coalesce(summary.today_points, 0) desc, coalesce(summary.today_count, 0) desc,
        coalesce(summary.period_points, 0) desc, profile.apellidos, profile.nombre)
      from public.inscripciones_alumno enrollment
      join public.profiles profile
        on profile.id = enrollment.alumno_id and profile.tenant_id = enrollment.tenant_id
      left join lateral (
        select
          coalesce(sum(case
            when (event.created_at at time zone timezone_name)::date <> local_date then 0
            when event.tipo_evento = 'reversa' then -1
            else 1
          end), 0)::integer as today_count,
          coalesce(sum(case
            when (event.created_at at time zone timezone_name)::date <> local_date then 0
            when event.tipo_evento = 'reversa' then -event.puntos
            else event.puntos
          end), 0) as today_points,
          (count(*) filter (where event.tipo_evento = 'registro')
            - count(*) filter (where event.tipo_evento = 'reversa'))::integer as period_count,
          coalesce(sum(case when event.tipo_evento = 'reversa' then -event.puntos else event.puntos end), 0) as period_points
        from public.eventos_participacion event
        where event.tenant_id = tenant
          and event.ciclo_escolar_id = cycle_id
          and event.periodo_evaluacion_id = period_id
          and event.asignacion_profesor_id = p_asignacion_id
          and event.inscripcion_alumno_id = enrollment.id
      ) summary on true
      where enrollment.tenant_id = tenant
        and enrollment.ciclo_escolar_id = cycle_id
        and enrollment.grupo_id = group_id
        and enrollment.activo
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.obtener_resumen_participacion_docente_movil(uuid)
  from public, anon, authenticated;
grant execute on function public.obtener_resumen_participacion_docente_movil(uuid)
  to authenticated, service_role;
