-- Padrón académico unificado para docentes.
--
-- Esta migración es deliberadamente aditiva: conserva las inscripciones,
-- calificaciones, capturas y asistencias existentes. Los alumnos provisionales
-- mantienen una identidad separada hasta que una persona autorizada los vincula.
set search_path = public, extensions;

create table public.asistencias_provisionales_docente (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ciclo_escolar_id uuid not null,
  grupo_id uuid not null,
  alumno_provisional_id uuid not null,
  fecha_asistencia date not null,
  estado text not null,
  observacion text,
  registrado_por uuid not null,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asistencias_provisionales_estado_check check (estado in ('presente','ausente')),
  constraint asistencias_provisionales_observacion_check check (length(coalesce(observacion,'')) <= 500),
  constraint asistencias_provisionales_row_version_check check (row_version > 0),
  constraint asistencias_provisionales_unique unique (tenant_id, alumno_provisional_id, fecha_asistencia),
  constraint asistencias_provisionales_student_fkey
    foreign key (alumno_provisional_id, tenant_id)
    references public.alumnos_provisionales_docente(id, tenant_id) on delete restrict,
  constraint asistencias_provisionales_cycle_fkey
    foreign key (ciclo_escolar_id, tenant_id)
    references public.ciclos_escolares(id, tenant_id) on delete restrict,
  constraint asistencias_provisionales_group_fkey
    foreign key (grupo_id, tenant_id)
    references public.grupos(id, tenant_id) on delete restrict,
  constraint asistencias_provisionales_actor_fkey
    foreign key (registrado_por, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict
);

create index asistencias_provisionales_group_date_idx
  on public.asistencias_provisionales_docente
    (tenant_id, ciclo_escolar_id, grupo_id, fecha_asistencia);
create index asistencias_provisionales_student_date_idx
  on public.asistencias_provisionales_docente
    (tenant_id, alumno_provisional_id, fecha_asistencia desc);

alter table public.asistencias_provisionales_docente enable row level security;
alter table public.asistencias_provisionales_docente force row level security;

create policy provisional_attendance_tenant_boundary on public.asistencias_provisionales_docente
  as restrictive for select to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)));
create policy provisional_attendance_teacher_select on public.asistencias_provisionales_docente
  for select to authenticated using (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
    or exists (
      select 1 from public.asignaciones_profesor assignment
      where assignment.tenant_id = asistencias_provisionales_docente.tenant_id
        and assignment.ciclo_escolar_id = asistencias_provisionales_docente.ciclo_escolar_id
        and assignment.grupo_id = asistencias_provisionales_docente.grupo_id
        and assignment.profesor_id = (select auth.uid())
        and assignment.activo
    )
  );

revoke all on public.asistencias_provisionales_docente from public, anon, authenticated;
grant select on public.asistencias_provisionales_docente to authenticated;
grant all on public.asistencias_provisionales_docente to service_role;

-- Los descuentos son eventos positivos por magnitud dentro del ledger
-- append-only. Nunca se escriben puntos negativos ni se modifica un evento.
alter table public.eventos_participacion
  drop constraint eventos_participacion_tipo_valido,
  drop constraint eventos_participacion_reversa_coherente;
alter table public.eventos_participacion
  add constraint eventos_participacion_tipo_valido
    check (tipo_evento in ('registro','reversa','ajuste_negativo')),
  add constraint eventos_participacion_reversa_coherente check (
    (tipo_evento in ('registro','ajuste_negativo') and reversa_de_id is null)
    or (tipo_evento = 'reversa' and reversa_de_id is not null)
  );

alter table public.capturas_provisionales_docente
  drop constraint capturas_provisionales_tipo_check,
  drop constraint capturas_provisionales_valor_check,
  drop constraint capturas_provisionales_concepto_check;
alter table public.capturas_provisionales_docente
  add constraint capturas_provisionales_tipo_check
    check (tipo_captura in ('calificacion','participacion','participacion_resta')),
  add constraint capturas_provisionales_valor_check check (
    (tipo_captura = 'calificacion' and valor between 0 and 10)
    or (tipo_captura = 'participacion' and valor > 0 and valor <= 5)
    or (tipo_captura = 'participacion_resta' and valor > 0 and valor <= 100)
  ),
  add constraint capturas_provisionales_concepto_check check (
    (tipo_captura = 'calificacion' and btrim(coalesce(nombre_concepto,'')) <> ''
      and tipo_concepto in ('examen','proyecto','tarea','trabajo_clase'))
    or (tipo_captura in ('participacion','participacion_resta')
      and nombre_concepto is null and tipo_concepto is null)
  );

create or replace view public.vista_participacion_normalizada
with (security_invoker = true)
as
with net as (
  select e.tenant_id, e.ciclo_escolar_id, e.asignacion_profesor_id,
         e.periodo_evaluacion_id, e.criterio_evaluacion_id,
         e.subcriterio_evaluacion_id, e.inscripcion_alumno_id, e.alumno_id,
         e.modo_normalizacion, e.meta_objetivo, e.regla_denominador_cero,
         max(e.maximo_computable)::numeric(18,8) as maximo_computable,
         sum(case when e.tipo_evento = 'registro' then e.puntos else -e.puntos end)
           ::numeric(18,8) as puntos_netos
  from public.eventos_participacion e
  group by e.tenant_id, e.ciclo_escolar_id, e.asignacion_profesor_id,
           e.periodo_evaluacion_id, e.criterio_evaluacion_id,
           e.subcriterio_evaluacion_id, e.inscripcion_alumno_id, e.alumno_id,
           e.modo_normalizacion, e.meta_objetivo, e.regla_denominador_cero
), denominators as (
  select n.*,
         case when n.modo_normalizacion = 'meta_fija' then n.meta_objetivo
              else coalesce(n.maximo_computable, max(n.puntos_netos) over (
                partition by n.tenant_id, n.asignacion_profesor_id,
                  n.periodo_evaluacion_id, n.criterio_evaluacion_id,
                  n.subcriterio_evaluacion_id
              )) end::numeric(18,8) as denominador
  from net n
)
select d.*,
       case
         when d.denominador > 0 then
           least(1.00000000, greatest(0.00000000, d.puntos_netos / d.denominador))::numeric(10,8)
         when d.regla_denominador_cero = 'cero' then 0.00000000::numeric(10,8)
         else null::numeric(10,8)
       end as ratio_normalizado
from denominators d;

create or replace function public.obtener_asistencia_docente_movil_unificada(p_asignacion_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; group_id uuid;
  timezone_name text; attendance_date date;
begin
  if actor is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  select a.tenant_id,a.ciclo_escolar_id,a.grupo_id,c.zona_horaria
    into tenant,cycle_id,group_id,timezone_name
  from public.asignaciones_profesor a join public.ciclos_escolares c
    on c.id=a.ciclo_escolar_id and c.tenant_id=a.tenant_id and c.estado='activo'
  where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  if tenant is null then raise exception using errcode='PT403',message='MOBILE_ASSIGNMENT_FORBIDDEN'; end if;
  attendance_date := (clock_timestamp() at time zone timezone_name)::date;
  return jsonb_build_object(
    'date',attendance_date,'groupId',group_id,
    'hasRecord',exists(select 1 from public.asistencias_diarias_docente d
      where d.tenant_id=tenant and d.ciclo_escolar_id=cycle_id and d.grupo_id=group_id
        and d.fecha_asistencia=attendance_date)
      or exists(select 1 from public.asistencias_provisionales_docente d
      where d.tenant_id=tenant and d.ciclo_escolar_id=cycle_id and d.grupo_id=group_id
        and d.fecha_asistencia=attendance_date),
    'students',coalesce((select jsonb_agg(x.payload order by x.student_name) from (
      select concat_ws(' ',pr.apellidos,pr.nombre) student_name,
        jsonb_build_object('studentType','registered','studentId',i.id,'enrollmentId',i.id,
          'provisionalId',null,'status',d.estado,'observation',coalesce(d.observacion,'')) payload
      from public.inscripciones_alumno i join public.profiles pr
        on pr.id=i.alumno_id and pr.tenant_id=i.tenant_id
      left join public.asistencias_diarias_docente d on d.tenant_id=i.tenant_id
        and d.ciclo_escolar_id=i.ciclo_escolar_id and d.inscripcion_alumno_id=i.id
        and d.fecha_asistencia=attendance_date
      where i.tenant_id=tenant and i.ciclo_escolar_id=cycle_id and i.grupo_id=group_id and i.activo
      union all
      select concat_ws(' ',p.apellidos,p.nombre),
        jsonb_build_object('studentType','provisional','studentId',p.id,'enrollmentId',p.id,
          'provisionalId',p.id,'status',d.estado,'observation',coalesce(d.observacion,''))
      from public.alumnos_provisionales_docente p
      left join public.asistencias_provisionales_docente d on d.tenant_id=p.tenant_id
        and d.alumno_provisional_id=p.id and d.fecha_asistencia=attendance_date
      where p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.grupo_id=group_id and p.estado='pendiente'
    ) x),'[]'::jsonb)
  );
end $$;

create or replace function public.obtener_resumen_participacion_docente_movil_unificado(p_asignacion_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; group_id uuid; period_id uuid;
  timezone_name text; local_date date; assignment_name text; group_name text;
begin
  if actor is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  select a.tenant_id,a.ciclo_escolar_id,a.grupo_id,p.id,c.zona_horaria,m.nombre,g.nombre
    into tenant,cycle_id,group_id,period_id,timezone_name,assignment_name,group_name
  from public.asignaciones_profesor a join public.ciclos_escolares c
    on c.id=a.ciclo_escolar_id and c.tenant_id=a.tenant_id and c.estado='activo'
  join public.periodos_evaluacion p on p.tenant_id=a.tenant_id
    and p.ciclo_escolar_id=a.ciclo_escolar_id and p.estado='activo'
  join public.materias m on m.id=a.materia_id and m.tenant_id=a.tenant_id
  join public.grupos g on g.id=a.grupo_id and g.tenant_id=a.tenant_id
  where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  if tenant is null then raise exception using errcode='PT403',message='MOBILE_ASSIGNMENT_FORBIDDEN'; end if;
  local_date := (clock_timestamp() at time zone timezone_name)::date;
  return jsonb_build_object('date',local_date,'subjectName',assignment_name,'groupName',group_name,
    'students',coalesce((select jsonb_agg(x.payload order by x.today_points desc,x.period_points desc,x.student_name)
    from (
      select concat_ws(' ',pr.apellidos,pr.nombre) student_name,
        s.today_points,s.period_points,
        jsonb_build_object('studentType','registered','provisionalId',null,
          'enrollmentId',i.id,'name',concat_ws(' ',pr.nombre,pr.apellidos),
          'todayCount',s.today_count,'todayPoints',s.today_points,
          'periodCount',s.period_count,'periodPoints',s.period_points) payload
      from public.inscripciones_alumno i join public.profiles pr
        on pr.id=i.alumno_id and pr.tenant_id=i.tenant_id
      left join lateral (
        select
          count(*) filter(where e.tipo_evento='registro'
            and (e.created_at at time zone timezone_name)::date=local_date)::integer today_count,
          coalesce(sum(case when (e.created_at at time zone timezone_name)::date<>local_date then 0
            when e.tipo_evento='registro' then e.puntos else -e.puntos end),0) today_points,
          count(*) filter(where e.tipo_evento='registro')::integer period_count,
          coalesce(sum(case when e.tipo_evento='registro' then e.puntos else -e.puntos end),0) period_points
        from public.eventos_participacion e where e.tenant_id=tenant and e.ciclo_escolar_id=cycle_id
          and e.periodo_evaluacion_id=period_id and e.asignacion_profesor_id=p_asignacion_id
          and e.inscripcion_alumno_id=i.id
      ) s on true
      where i.tenant_id=tenant and i.ciclo_escolar_id=cycle_id and i.grupo_id=group_id and i.activo
      union all
      select concat_ws(' ',p.apellidos,p.nombre),s.today_points,s.period_points,
        jsonb_build_object('studentType','provisional','provisionalId',p.id,
          'enrollmentId',p.id,'name',concat_ws(' ',p.nombre,p.apellidos),
          'todayCount',s.today_count,'todayPoints',s.today_points,
          'periodCount',s.period_count,'periodPoints',s.period_points)
      from public.alumnos_provisionales_docente p
      left join lateral (
        select
          count(*) filter(where cp.tipo_captura='participacion'
            and (cp.created_at at time zone timezone_name)::date=local_date)::integer today_count,
          coalesce(sum(case when (cp.created_at at time zone timezone_name)::date<>local_date then 0
            when cp.tipo_captura='participacion' then cp.valor else -cp.valor end),0) today_points,
          count(*) filter(where cp.tipo_captura='participacion')::integer period_count,
          coalesce(sum(case when cp.tipo_captura='participacion' then cp.valor else -cp.valor end),0) period_points
        from public.capturas_provisionales_docente cp where cp.tenant_id=tenant
          and cp.ciclo_escolar_id=cycle_id and cp.periodo_evaluacion_id=period_id
          and cp.asignacion_profesor_id=p_asignacion_id and cp.alumno_provisional_id=p.id
          and cp.tipo_captura in ('participacion','participacion_resta') and cp.migrada_at is null
      ) s on true
      where p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.grupo_id=group_id and p.estado='pendiente'
    ) x),'[]'::jsonb));
end $$;

create or replace function public.registrar_ajuste_participacion_docente_movil(
  p_asignacion_id uuid,p_criterio_id uuid,p_subcriterio_id uuid,
  p_student_type text,p_student_id uuid,p_puntos numeric,p_observacion text,
  p_idempotency_key uuid,p_expected_cycle_id uuid,p_expected_period_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; group_id uuid; period_id uuid;
  student_profile_id uuid; criterion_type text; event_mode text; event_config jsonb;
  existing_event public.eventos_participacion%rowtype;
  existing_capture public.capturas_provisionales_docente%rowtype;
begin
  if actor is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  if p_idempotency_key is null or p_student_type not in ('registered','provisional')
    or p_student_id is null or p_puntos<=0 or p_puntos>100
    or length(coalesce(p_observacion,''))>1000 then
    raise exception using errcode='PT422',message='MOBILE_PARTICIPATION_ADJUSTMENT_INVALID';
  end if;
  select a.tenant_id,a.ciclo_escolar_id,a.grupo_id into tenant,cycle_id,group_id
  from public.asignaciones_profesor a join public.ciclos_escolares c
    on c.id=a.ciclo_escolar_id and c.tenant_id=a.tenant_id and c.estado='activo'
  where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  select p.id into period_id from public.periodos_evaluacion p
    where p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.estado='activo';
  if tenant is null then raise exception using errcode='PT403',message='MOBILE_ASSIGNMENT_FORBIDDEN'; end if;
  if cycle_id is distinct from p_expected_cycle_id or period_id is distinct from p_expected_period_id then
    raise exception using errcode='PT409',message='MOBILE_ACADEMIC_CONTEXT_CHANGED';
  end if;
  select coalesce(s.tipo,c.tipo),coalesce(s.configuracion,'{}'::jsonb)
    into criterion_type,event_config
  from public.esquemas_evaluacion e join public.criterios_evaluacion c
    on c.esquema_evaluacion_id=e.id and c.tenant_id=e.tenant_id and c.activo
  left join public.subcriterios_evaluacion s on s.id=p_subcriterio_id and s.tenant_id=c.tenant_id
    and s.criterio_evaluacion_id=c.id and s.activo
  where e.tenant_id=tenant and e.asignacion_profesor_id=p_asignacion_id
    and e.periodo_evaluacion_id=period_id and e.estado='activo' and c.id=p_criterio_id;
  if criterion_type<>'participacion' then
    raise exception using errcode='PT422',message='MOBILE_PARTICIPATION_CRITERION_INVALID';
  end if;
  event_mode := coalesce(event_config->>'modo','maximo_grupo');
  if p_student_type='registered' then
    select i.alumno_id into student_profile_id from public.inscripciones_alumno i
    where i.id=p_student_id and i.tenant_id=tenant and i.ciclo_escolar_id=cycle_id
      and i.grupo_id=group_id and i.activo;
    if student_profile_id is null then raise exception using errcode='PT404',message='MOBILE_ENROLLMENT_NOT_AVAILABLE'; end if;
    select * into existing_event from public.eventos_participacion e
      where e.tenant_id=tenant and e.idempotency_key=p_idempotency_key;
    if existing_event.id is not null then
      if existing_event.inscripcion_alumno_id<>p_student_id or existing_event.puntos<>p_puntos
        or existing_event.tipo_evento<>'ajuste_negativo' then
        raise exception using errcode='PT409',message='MOBILE_IDEMPOTENCY_MISMATCH';
      end if;
      return jsonb_build_object('operationId',existing_event.id,'replayed',true,'syncedAt',existing_event.created_at);
    end if;
    insert into public.eventos_participacion(tenant_id,ciclo_escolar_id,asignacion_profesor_id,
      periodo_evaluacion_id,criterio_evaluacion_id,subcriterio_evaluacion_id,inscripcion_alumno_id,
      alumno_id,tipo_evento,puntos,modo_normalizacion,meta_objetivo,regla_denominador_cero,
      observacion,actor_id,idempotency_key)
    values(tenant,cycle_id,p_asignacion_id,period_id,p_criterio_id,p_subcriterio_id,p_student_id,
      student_profile_id,'ajuste_negativo',p_puntos,event_mode,
      case when event_mode='meta_fija' then (event_config->>'meta')::numeric end,'cero',
      nullif(btrim(coalesce(p_observacion,'')),''),actor,p_idempotency_key)
    returning * into existing_event;
    return jsonb_build_object('operationId',existing_event.id,'replayed',false,'syncedAt',existing_event.created_at);
  end if;
  if not exists(select 1 from public.alumnos_provisionales_docente p where p.id=p_student_id
    and p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.grupo_id=group_id and p.estado='pendiente') then
    raise exception using errcode='PT404',message='MOBILE_PROVISIONAL_NOT_AVAILABLE';
  end if;
  select * into existing_capture from public.capturas_provisionales_docente cp
    where cp.tenant_id=tenant and cp.actor_id=actor and cp.idempotency_key=p_idempotency_key;
  if existing_capture.id is not null then
    if existing_capture.alumno_provisional_id<>p_student_id or existing_capture.valor<>p_puntos
      or existing_capture.tipo_captura<>'participacion_resta' then
      raise exception using errcode='PT409',message='MOBILE_IDEMPOTENCY_MISMATCH';
    end if;
    return jsonb_build_object('operationId',existing_capture.id,'replayed',true,'syncedAt',existing_capture.created_at);
  end if;
  insert into public.capturas_provisionales_docente(tenant_id,alumno_provisional_id,ciclo_escolar_id,
    asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,subcriterio_evaluacion_id,
    tipo_captura,valor,observacion,actor_id,idempotency_key)
  values(tenant,p_student_id,cycle_id,p_asignacion_id,period_id,p_criterio_id,p_subcriterio_id,
    'participacion_resta',p_puntos,nullif(btrim(coalesce(p_observacion,'')),''),actor,p_idempotency_key)
  returning * into existing_capture;
  return jsonb_build_object('operationId',existing_capture.id,'replayed',false,'syncedAt',existing_capture.created_at);
end $$;

create or replace function public.guardar_asistencia_docente_movil_unificada(
  p_asignacion_id uuid,p_registros jsonb,p_idempotency_key uuid,
  p_expected_cycle_id uuid,p_expected_period_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; group_id uuid; period_id uuid;
  timezone_name text; attendance_date date; normalized_hash text; prior_hash text;
  roster_count integer; input_count integer;
begin
  if actor is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  if p_idempotency_key is null or jsonb_typeof(p_registros)<>'array' then
    raise exception using errcode='PT422',message='MOBILE_ATTENDANCE_INVALID';
  end if;
  select a.tenant_id,a.ciclo_escolar_id,a.grupo_id,c.zona_horaria
    into tenant,cycle_id,group_id,timezone_name
  from public.asignaciones_profesor a join public.ciclos_escolares c
    on c.id=a.ciclo_escolar_id and c.tenant_id=a.tenant_id and c.estado='activo'
  where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  if tenant is null then raise exception using errcode='PT403',message='MOBILE_ASSIGNMENT_FORBIDDEN'; end if;
  select p.id into period_id from public.periodos_evaluacion p
  where p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.estado='activo';
  if cycle_id is distinct from p_expected_cycle_id or period_id is distinct from p_expected_period_id then
    raise exception using errcode='PT409',message='MOBILE_ACADEMIC_CONTEXT_CHANGED';
  end if;
  attendance_date := (clock_timestamp() at time zone timezone_name)::date;
  normalized_hash := md5(p_asignacion_id::text||attendance_date::text||p_registros::text);
  select o.payload_hash into prior_hash from public.operaciones_asistencia_docente o
  where o.tenant_id=tenant and o.actor_id=actor and o.idempotency_key=p_idempotency_key;
  if prior_hash is not null then
    if prior_hash<>normalized_hash then raise exception using errcode='PT409',message='MOBILE_IDEMPOTENCY_MISMATCH'; end if;
    return jsonb_build_object('date',attendance_date,'replayed',true);
  end if;
  select (select count(*) from public.inscripciones_alumno i where i.tenant_id=tenant
      and i.ciclo_escolar_id=cycle_id and i.grupo_id=group_id and i.activo)
    +(select count(*) from public.alumnos_provisionales_docente p where p.tenant_id=tenant
      and p.ciclo_escolar_id=cycle_id and p.grupo_id=group_id and p.estado='pendiente') into roster_count;
  select count(*) into input_count from jsonb_to_recordset(p_registros)
    as r(student_type text,student_id uuid,status text,observation text);
  if input_count<>roster_count or exists(
    select 1 from jsonb_to_recordset(p_registros) as r(student_type text,student_id uuid,status text,observation text)
    where r.student_type not in ('registered','provisional') or r.student_id is null
      or r.status not in ('presente','ausente') or length(coalesce(r.observation,''))>500
  ) or exists(
    select r.student_type,r.student_id from jsonb_to_recordset(p_registros)
      as r(student_type text,student_id uuid,status text,observation text)
    group by r.student_type,r.student_id having count(*)>1
  ) or exists(
    select 1 from jsonb_to_recordset(p_registros) as r(student_type text,student_id uuid,status text,observation text)
    where (r.student_type='registered' and not exists(select 1 from public.inscripciones_alumno i
      where i.id=r.student_id and i.tenant_id=tenant and i.ciclo_escolar_id=cycle_id and i.grupo_id=group_id and i.activo))
      or (r.student_type='provisional' and not exists(select 1 from public.alumnos_provisionales_docente p
      where p.id=r.student_id and p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.grupo_id=group_id and p.estado='pendiente'))
  ) then raise exception using errcode='PT422',message='MOBILE_ATTENDANCE_ROSTER_MISMATCH'; end if;
  insert into public.operaciones_asistencia_docente(tenant_id,actor_id,idempotency_key,payload_hash)
    values(tenant,actor,p_idempotency_key,normalized_hash);
  insert into public.asistencias_diarias_docente(tenant_id,ciclo_escolar_id,grupo_id,
    inscripcion_alumno_id,alumno_id,fecha_asistencia,estado,observacion,registrado_por)
  select tenant,cycle_id,group_id,i.id,i.alumno_id,attendance_date,r.status,
    nullif(btrim(coalesce(r.observation,'')),''),actor
  from jsonb_to_recordset(p_registros) as r(student_type text,student_id uuid,status text,observation text)
  join public.inscripciones_alumno i on r.student_type='registered' and i.id=r.student_id
    and i.tenant_id=tenant and i.ciclo_escolar_id=cycle_id and i.grupo_id=group_id and i.activo
  on conflict (tenant_id,inscripcion_alumno_id,fecha_asistencia) do update set
    estado=excluded.estado,observacion=excluded.observacion,registrado_por=actor,
    row_version=public.asistencias_diarias_docente.row_version+1,updated_at=now();
  insert into public.asistencias_provisionales_docente(tenant_id,ciclo_escolar_id,grupo_id,
    alumno_provisional_id,fecha_asistencia,estado,observacion,registrado_por)
  select tenant,cycle_id,group_id,p.id,attendance_date,r.status,
    nullif(btrim(coalesce(r.observation,'')),''),actor
  from jsonb_to_recordset(p_registros) as r(student_type text,student_id uuid,status text,observation text)
  join public.alumnos_provisionales_docente p on r.student_type='provisional' and p.id=r.student_id
    and p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.grupo_id=group_id and p.estado='pendiente'
  on conflict (tenant_id,alumno_provisional_id,fecha_asistencia) do update set
    estado=excluded.estado,observacion=excluded.observacion,registrado_por=actor,
    row_version=public.asistencias_provisionales_docente.row_version+1,updated_at=now();
  insert into public.auditoria(tenant_id,user_id,accion,entidad,entidad_id,detalles)
  values(tenant,actor,'academic.mobile.attendance.unified.saved','grupos',group_id,
    jsonb_build_object('date',attendance_date,'students',input_count,'assignmentId',p_asignacion_id));
  return jsonb_build_object('date',attendance_date,'replayed',false,'students',input_count);
end $$;

create or replace function public.obtener_reporte_academico_docente_unificado(p_asignacion_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; group_id uuid; period_id uuid;
  base_report jsonb; official_students jsonb; provisional_students jsonb; attendance_dates jsonb;
begin
  if actor is null then raise exception using errcode='PT401',message='ACADEMIC_REPORT_UNAUTHENTICATED'; end if;
  select a.tenant_id,a.ciclo_escolar_id,a.grupo_id,p.id into tenant,cycle_id,group_id,period_id
  from public.asignaciones_profesor a join public.ciclos_escolares c
    on c.id=a.ciclo_escolar_id and c.tenant_id=a.tenant_id and c.estado='activo'
  join public.periodos_evaluacion p on p.tenant_id=a.tenant_id
    and p.ciclo_escolar_id=a.ciclo_escolar_id and p.estado='activo'
  where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  if tenant is null then raise exception using errcode='PT403',message='ACADEMIC_REPORT_ASSIGNMENT_FORBIDDEN'; end if;

  base_report := public.obtener_reporte_academico_docente(p_asignacion_id);
  select coalesce(jsonb_agg(e.value||jsonb_build_object('studentType','registered','provisionalId',null)
    order by e.ordinality),'[]'::jsonb) into official_students
  from jsonb_array_elements(coalesce(base_report->'students','[]'::jsonb)) with ordinality e(value,ordinality);

  select coalesce(jsonb_agg(jsonb_build_object(
    'studentType','provisional','provisionalId',student.id,'enrollmentId',student.id,
    'studentId',student.id,'name',concat_ws(' ',student.nombre,student.apellidos),
    'enrollmentCode',null,
    'attendance',coalesce((select jsonb_object_agg(a.fecha_asistencia::text,jsonb_build_object(
      'status',a.estado,'observation',coalesce(a.observacion,'')))
      from public.asistencias_provisionales_docente a
      join public.periodos_evaluacion p on p.id=period_id and p.tenant_id=a.tenant_id
        and a.fecha_asistencia between p.fecha_inicio and p.fecha_fin
      where a.tenant_id=tenant and a.alumno_provisional_id=student.id),'{}'::jsonb),
    'results',coalesce((select jsonb_object_agg(criterion->>'key',jsonb_build_object(
      'grade',(select round(avg(cp.valor),4) from public.capturas_provisionales_docente cp
        where cp.tenant_id=tenant and cp.alumno_provisional_id=student.id
          and cp.asignacion_profesor_id=p_asignacion_id and cp.periodo_evaluacion_id=period_id
          and cp.criterio_evaluacion_id=(criterion->>'criterionId')::uuid
          and cp.subcriterio_evaluacion_id is not distinct from (criterion->>'subcriterionId')::uuid
          and cp.tipo_captura='calificacion' and cp.migrada_at is null),
      'state',case when exists(select 1 from public.capturas_provisionales_docente cp
        where cp.tenant_id=tenant and cp.alumno_provisional_id=student.id
          and cp.asignacion_profesor_id=p_asignacion_id and cp.periodo_evaluacion_id=period_id
          and cp.criterio_evaluacion_id=(criterion->>'criterionId')::uuid
          and cp.subcriterio_evaluacion_id is not distinct from (criterion->>'subcriterionId')::uuid
          and cp.tipo_captura='calificacion' and cp.migrada_at is null)
        then 'calificado' else 'sin_capturar' end,
      'participationPoints',coalesce((select sum(case when cp.tipo_captura='participacion'
          then cp.valor else -cp.valor end) from public.capturas_provisionales_docente cp
        where cp.tenant_id=tenant and cp.alumno_provisional_id=student.id
          and cp.asignacion_profesor_id=p_asignacion_id and cp.periodo_evaluacion_id=period_id
          and cp.criterio_evaluacion_id=(criterion->>'criterionId')::uuid
          and cp.subcriterio_evaluacion_id is not distinct from (criterion->>'subcriterionId')::uuid
          and cp.tipo_captura in ('participacion','participacion_resta') and cp.migrada_at is null),0),
      'participationCount',(select count(*) from public.capturas_provisionales_docente cp
        where cp.tenant_id=tenant and cp.alumno_provisional_id=student.id
          and cp.asignacion_profesor_id=p_asignacion_id and cp.periodo_evaluacion_id=period_id
          and cp.criterio_evaluacion_id=(criterion->>'criterionId')::uuid
          and cp.subcriterio_evaluacion_id is not distinct from (criterion->>'subcriterionId')::uuid
          and cp.tipo_captura='participacion' and cp.migrada_at is null)
    )) from jsonb_array_elements(coalesce(base_report->'criteria','[]'::jsonb)) criterion),'{}'::jsonb),
    'conceptGrades','{}'::jsonb
  ) order by student.apellidos,student.nombre),'[]'::jsonb) into provisional_students
  from public.alumnos_provisionales_docente student
  where student.tenant_id=tenant and student.ciclo_escolar_id=cycle_id
    and student.grupo_id=group_id and student.estado='pendiente';

  select coalesce(jsonb_agg(d.value order by d.value),'[]'::jsonb) into attendance_dates from (
    select distinct value from jsonb_array_elements_text(coalesce(base_report->'attendanceDates','[]'::jsonb))
    union
    select distinct a.fecha_asistencia::text from public.asistencias_provisionales_docente a
    join public.periodos_evaluacion p on p.id=period_id and p.tenant_id=a.tenant_id
      and a.fecha_asistencia between p.fecha_inicio and p.fecha_fin
    where a.tenant_id=tenant and a.ciclo_escolar_id=cycle_id and a.grupo_id=group_id
  ) d;
  return jsonb_set(jsonb_set(base_report,'{attendanceDates}',attendance_dates,true),
    '{students}',official_students||provisional_students,true);
end $$;

-- La vinculación conserva capturas, asistencias y el mismo token QR físico.
create or replace function public.vincular_alumno_provisional_docente(
  p_alumno_provisional_id uuid,p_inscripcion_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); provisional public.alumnos_provisionales_docente%rowtype;
  enrollment public.inscripciones_alumno%rowtype; capture public.capturas_provisionales_docente%rowtype;
  concept_id uuid; student_id uuid; event_mode text; event_config jsonb;
  migrated_count integer:=0; migrated_attendance integer:=0; transferred_qr uuid; qr_creator uuid;
begin
  if actor is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  select * into provisional from public.alumnos_provisionales_docente p
    where p.id=p_alumno_provisional_id and p.estado='pendiente' for update;
  if provisional.id is null then raise exception using errcode='PT404',message='MOBILE_PROVISIONAL_NOT_AVAILABLE'; end if;
  if not ((select private.has_tenant_role(provisional.tenant_id,array['superuser','admin']::text[]))
    or exists(select 1 from public.asignaciones_profesor a where a.tenant_id=provisional.tenant_id
      and a.ciclo_escolar_id=provisional.ciclo_escolar_id and a.grupo_id=provisional.grupo_id
      and a.profesor_id=actor and a.activo)) then
    raise exception using errcode='PT403',message='MOBILE_PROVISIONAL_LINK_FORBIDDEN';
  end if;
  select * into enrollment from public.inscripciones_alumno i where i.id=p_inscripcion_id
    and i.tenant_id=provisional.tenant_id and i.ciclo_escolar_id=provisional.ciclo_escolar_id
    and i.grupo_id=provisional.grupo_id and i.activo for update;
  if enrollment.id is null then raise exception using errcode='PT422',message='MOBILE_OFFICIAL_ENROLLMENT_MISMATCH'; end if;
  student_id:=enrollment.alumno_id;

  for capture in select * from public.capturas_provisionales_docente cp
    where cp.tenant_id=provisional.tenant_id and cp.alumno_provisional_id=provisional.id
      and cp.migrada_at is null order by cp.created_at,cp.id for update
  loop
    if capture.tipo_captura='calificacion' then
      insert into public.conceptos_evaluacion_docente(tenant_id,ciclo_escolar_id,asignacion_profesor_id,
        periodo_evaluacion_id,criterio_evaluacion_id,subcriterio_evaluacion_id,nombre,tipo,created_by)
      values(capture.tenant_id,capture.ciclo_escolar_id,capture.asignacion_profesor_id,
        capture.periodo_evaluacion_id,capture.criterio_evaluacion_id,capture.subcriterio_evaluacion_id,
        capture.nombre_concepto,capture.tipo_concepto,capture.actor_id)
      on conflict (tenant_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,
        coalesce(subcriterio_evaluacion_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(nombre))
      do update set activo=true,updated_at=now() returning id into concept_id;
      insert into public.calificaciones_concepto_docente(tenant_id,ciclo_escolar_id,concepto_id,
        inscripcion_alumno_id,alumno_id,calificacion,observacion,actor_id,idempotency_key)
      values(capture.tenant_id,capture.ciclo_escolar_id,concept_id,enrollment.id,student_id,capture.valor,
        capture.observacion,capture.actor_id,capture.idempotency_key)
      on conflict (tenant_id,concepto_id,inscripcion_alumno_id) do update set
        calificacion=excluded.calificacion,observacion=excluded.observacion,actor_id=excluded.actor_id,
        row_version=public.calificaciones_concepto_docente.row_version+1,updated_at=now();
    else
      select coalesce(s.tipo,c.tipo),coalesce(s.configuracion,'{}'::jsonb) into event_mode,event_config
      from public.criterios_evaluacion c left join public.subcriterios_evaluacion s
        on s.id=capture.subcriterio_evaluacion_id and s.tenant_id=c.tenant_id
      where c.id=capture.criterio_evaluacion_id and c.tenant_id=capture.tenant_id;
      insert into public.eventos_participacion(tenant_id,ciclo_escolar_id,asignacion_profesor_id,
        periodo_evaluacion_id,criterio_evaluacion_id,subcriterio_evaluacion_id,inscripcion_alumno_id,
        alumno_id,tipo_evento,puntos,modo_normalizacion,meta_objetivo,regla_denominador_cero,
        observacion,actor_id,idempotency_key)
      values(capture.tenant_id,capture.ciclo_escolar_id,capture.asignacion_profesor_id,
        capture.periodo_evaluacion_id,capture.criterio_evaluacion_id,capture.subcriterio_evaluacion_id,
        enrollment.id,student_id,case when capture.tipo_captura='participacion_resta'
          then 'ajuste_negativo' else 'registro' end,capture.valor,
        coalesce(event_config->>'modo','maximo_grupo'),
        case when event_config->>'modo'='meta_fija' then (event_config->>'meta')::numeric end,
        'cero',capture.observacion,capture.actor_id,capture.idempotency_key)
      on conflict (tenant_id,idempotency_key) do nothing;
    end if;
    update public.capturas_provisionales_docente set migrada_at=now() where id=capture.id;
    migrated_count:=migrated_count+1;
  end loop;

  insert into public.calificaciones_directas(tenant_id,ciclo_escolar_id,asignacion_profesor_id,
    periodo_evaluacion_id,criterio_evaluacion_id,subcriterio_evaluacion_id,inscripcion_alumno_id,
    alumno_id,estado,calificacion,observacion,calificado_por,calificado_at)
  select c.tenant_id,c.ciclo_escolar_id,c.asignacion_profesor_id,c.periodo_evaluacion_id,
    c.criterio_evaluacion_id,c.subcriterio_evaluacion_id,enrollment.id,student_id,'calificado',
    round(avg(g.calificacion),4),'Promedio de capturas móviles',actor,now()
  from public.calificaciones_concepto_docente g join public.conceptos_evaluacion_docente c
    on c.id=g.concepto_id and c.tenant_id=g.tenant_id and c.activo
  where g.tenant_id=provisional.tenant_id and g.inscripcion_alumno_id=enrollment.id
  group by c.tenant_id,c.ciclo_escolar_id,c.asignacion_profesor_id,c.periodo_evaluacion_id,
    c.criterio_evaluacion_id,c.subcriterio_evaluacion_id
  on conflict (tenant_id,inscripcion_alumno_id,criterio_evaluacion_id,
    coalesce(subcriterio_evaluacion_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update set
    estado='calificado',calificacion=excluded.calificacion,observacion=excluded.observacion,
    calificado_por=actor,calificado_at=now();

  insert into public.asistencias_diarias_docente(tenant_id,ciclo_escolar_id,grupo_id,
    inscripcion_alumno_id,alumno_id,fecha_asistencia,estado,observacion,registrado_por,created_at,updated_at)
  select a.tenant_id,a.ciclo_escolar_id,a.grupo_id,enrollment.id,student_id,a.fecha_asistencia,
    a.estado,a.observacion,a.registrado_por,a.created_at,a.updated_at
  from public.asistencias_provisionales_docente a
  where a.tenant_id=provisional.tenant_id and a.alumno_provisional_id=provisional.id
  on conflict (tenant_id,inscripcion_alumno_id,fecha_asistencia) do nothing;
  get diagnostics migrated_attendance=row_count;

  select q.token,q.created_by into transferred_qr,qr_creator
  from public.identificadores_qr_alumno_provisional q
  where q.tenant_id=provisional.tenant_id and q.alumno_provisional_id=provisional.id and q.activo
  order by q.created_at desc limit 1 for update;
  if transferred_qr is not null then
    update public.identificadores_qr_inscripcion set activo=false,revoked_at=now()
      where tenant_id=provisional.tenant_id and inscripcion_alumno_id=enrollment.id and activo;
    insert into public.identificadores_qr_inscripcion(tenant_id,inscripcion_alumno_id,token,created_by)
      values(provisional.tenant_id,enrollment.id,transferred_qr,coalesce(qr_creator,actor));
    update public.identificadores_qr_alumno_provisional set activo=false,revoked_at=now()
      where tenant_id=provisional.tenant_id and alumno_provisional_id=provisional.id and activo;
  end if;

  update public.alumnos_provisionales_docente set estado='vinculado',inscripcion_vinculada_id=enrollment.id,
    updated_at=now() where id=provisional.id;
  insert into public.auditoria(tenant_id,user_id,accion,entidad,entidad_id,detalles)
  values(provisional.tenant_id,actor,'academic.mobile.provisional.linked','alumnos_provisionales_docente',provisional.id,
    jsonb_build_object('enrollmentId',enrollment.id,'studentId',student_id,
      'migratedCaptures',migrated_count,'migratedAttendance',migrated_attendance,
      'qrTokenPreserved',transferred_qr is not null));
  return jsonb_build_object('provisionalId',provisional.id,'enrollmentId',enrollment.id,
    'studentId',student_id,'migratedCaptures',migrated_count,'migratedAttendance',migrated_attendance,
    'qrTokenPreserved',transferred_qr is not null,'linkedAt',now());
end $$;

revoke all on function public.obtener_asistencia_docente_movil_unificada(uuid),
  public.guardar_asistencia_docente_movil_unificada(uuid,jsonb,uuid,uuid,uuid),
  public.obtener_resumen_participacion_docente_movil_unificado(uuid),
  public.registrar_ajuste_participacion_docente_movil(uuid,uuid,uuid,text,uuid,numeric,text,uuid,uuid,uuid),
  public.obtener_reporte_academico_docente_unificado(uuid)
  from public,anon,authenticated;
grant execute on function public.obtener_asistencia_docente_movil_unificada(uuid),
  public.guardar_asistencia_docente_movil_unificada(uuid,jsonb,uuid,uuid,uuid),
  public.obtener_resumen_participacion_docente_movil_unificado(uuid),
  public.registrar_ajuste_participacion_docente_movil(uuid,uuid,uuid,text,uuid,numeric,text,uuid,uuid,uuid),
  public.obtener_reporte_academico_docente_unificado(uuid)
  to authenticated,service_role;

comment on table public.asistencias_provisionales_docente is
  'Asistencia docente de alumnos provisionales; se migra sin sobrescribir registros oficiales al vincular.';
comment on function public.obtener_reporte_academico_docente_unificado(uuid) is
  'Reporte docente de inscripción oficial y alta provisional pendiente, aislado por tenant y asignación.';
