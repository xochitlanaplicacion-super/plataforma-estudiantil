begin;

update public.periodos_evaluacion
set estado = 'activo'
where tenant_id = '10000000-0000-4000-8000-000000000001'
  and orden = 1;

alter table public.criterios_evaluacion disable trigger validate_evaluation_criterion;

insert into public.criterios_evaluacion (
  tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,activo,created_by
)
select scheme.tenant_id,scheme.id,'Examen móvil de prueba','directo',1,98,true,
       '1a000000-0000-4000-8000-000000000003'
from public.esquemas_evaluacion scheme
where scheme.estado='activo'
  and scheme.asignacion_profesor_id='1f000000-0000-4000-8000-000000000001';

insert into public.criterios_evaluacion (
  tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,activo,created_by
)
select scheme.tenant_id,scheme.id,'Participación móvil de prueba','participacion',1,99,true,
       '1a000000-0000-4000-8000-000000000003'
from public.esquemas_evaluacion scheme
where scheme.estado='activo'
  and scheme.asignacion_profesor_id='1f000000-0000-4000-8000-000000000001';

alter table public.criterios_evaluacion enable trigger validate_evaluation_criterion;

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);

do $mobile_capture_test$
declare
  context jsonb;
  assignment_id uuid;
  criterion_id uuid;
  participation_criterion_id uuid;
  enrollment_id uuid;
  cycle_id uuid;
  period_id uuid;
  concept jsonb;
  first_grade jsonb;
  repeated_grade jsonb;
  first_participation jsonb;
  repeated_participation jsonb;
  operation_key constant uuid := 'a0000000-0000-4000-8000-000000000001';
  participation_key constant uuid := 'a0000000-0000-4000-8000-000000000002';
begin
  context := public.obtener_contexto_docente_movil();
  cycle_id := (context #>> '{cycle,id}')::uuid;
  period_id := (context #>> '{period,id}')::uuid;
  assignment_id := (context #>> '{assignments,0,id}')::uuid;
  enrollment_id := (context #>> '{assignments,0,students,0,enrollmentId}')::uuid;
  select criterion.id into criterion_id
  from public.criterios_evaluacion criterion
  join public.esquemas_evaluacion scheme
    on scheme.id=criterion.esquema_evaluacion_id and scheme.tenant_id=criterion.tenant_id
  where scheme.asignacion_profesor_id=assignment_id and scheme.estado='activo'
    and scheme.periodo_evaluacion_id=period_id
    and criterion.tipo='directo' and criterion.activo
  limit 1;
  select criterion.id into participation_criterion_id
  from public.criterios_evaluacion criterion
  join public.esquemas_evaluacion scheme
    on scheme.id=criterion.esquema_evaluacion_id and scheme.tenant_id=criterion.tenant_id
  where scheme.asignacion_profesor_id=assignment_id and scheme.estado='activo'
    and scheme.periodo_evaluacion_id=period_id
    and criterion.tipo='participacion' and criterion.activo
  limit 1;

  if context #>> '{period,name}' <> 'Periodo 1' then
    raise exception 'MOBILE_TEST: no resolvió el único periodo activo';
  end if;
  if context ? 'periodOptions' or context ? 'cycleOptions' then
    raise exception 'MOBILE_TEST: el contexto expone selectores académicos';
  end if;
  if assignment_id is null or enrollment_id is null or criterion_id is null then
    raise exception 'MOBILE_TEST: faltan asignación, alumno o criterio del profesor';
  end if;

  concept := public.crear_concepto_docente_movil(
    assignment_id,criterion_id,null,'Examen móvil de prueba','examen',cycle_id,period_id
  );
  first_grade := public.registrar_calificacion_docente_movil(
    (concept->>'id')::uuid,enrollment_id,9,'Captura offline',operation_key
  );
  repeated_grade := public.registrar_calificacion_docente_movil(
    (concept->>'id')::uuid,enrollment_id,9,'Captura offline',operation_key
  );
  if (first_grade->>'operationId') <> (repeated_grade->>'operationId')
     or coalesce((repeated_grade->>'replayed')::boolean,false) is not true then
    raise exception 'MOBILE_TEST: el reintento de calificación no fue idempotente';
  end if;
  if (select count(*) from public.calificaciones_concepto_docente where idempotency_key=operation_key) <> 1 then
    raise exception 'MOBILE_TEST: el reintento duplicó la calificación';
  end if;

  begin
    perform public.crear_concepto_docente_movil(
      assignment_id,criterion_id,null,'Periodo incorrecto','tarea',cycle_id,gen_random_uuid()
    );
    raise exception 'MOBILE_TEST: aceptó un periodo obsoleto';
  exception when sqlstate 'PT409' then null;
  end;

  first_participation := public.registrar_participacion_docente_movil(
    assignment_id,participation_criterion_id,null,enrollment_id,2,'Participación móvil',participation_key,cycle_id,period_id
  );
  repeated_participation := public.registrar_participacion_docente_movil(
    assignment_id,participation_criterion_id,null,enrollment_id,2,'Participación móvil',participation_key,cycle_id,period_id
  );
  if (first_participation->>'operationId') <> (repeated_participation->>'operationId') then
    raise exception 'MOBILE_TEST: el reintento de participación cambió de operación';
  end if;
  if (select count(*) from public.eventos_participacion where idempotency_key=participation_key) <> 1 then
    raise exception 'MOBILE_TEST: el reintento duplicó la participación';
  end if;
end
$mobile_capture_test$;

reset role;

do $single_active_period_test$
begin
  begin
    update public.periodos_evaluacion
    set estado='activo'
    where tenant_id='10000000-0000-4000-8000-000000000001' and orden=2;
    raise exception 'MOBILE_TEST: permitió dos periodos activos';
  exception when unique_violation then null;
  end;
end
$single_active_period_test$;

rollback;
