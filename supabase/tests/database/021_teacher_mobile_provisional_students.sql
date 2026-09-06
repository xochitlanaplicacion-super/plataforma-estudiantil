begin;

update public.periodos_evaluacion set estado='activo'
where tenant_id='10000000-0000-4000-8000-000000000001' and orden=1;

alter table public.criterios_evaluacion disable trigger validate_evaluation_criterion;
insert into public.criterios_evaluacion(
  tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,activo,created_by
)
select e.tenant_id,e.id,'Captura provisional de prueba','directo',1,98,true,
  '1a000000-0000-4000-8000-000000000003'
from public.esquemas_evaluacion e
where e.estado='activo' and e.asignacion_profesor_id='1f000000-0000-4000-8000-000000000001';
alter table public.criterios_evaluacion enable trigger validate_evaluation_criterion;

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);

do $provisional_mobile_test$
declare context jsonb; provisional jsonb; listed jsonb; first_capture jsonb; repeated_capture jsonb;
  assignment_id uuid; criterion_id uuid; cycle_id uuid; period_id uuid;
  enrollment_id uuid; linked jsonb;
  operation_key constant uuid := 'b0000000-0000-4000-8000-000000000001';
begin
  context := public.obtener_contexto_docente_movil();
  cycle_id := (context #>> '{cycle,id}')::uuid;
  period_id := (context #>> '{period,id}')::uuid;
  assignment_id := (context #>> '{assignments,0,id}')::uuid;
  enrollment_id := (context #>> '{assignments,0,students,0,enrollmentId}')::uuid;
  select c.id into criterion_id from public.criterios_evaluacion c
  join public.esquemas_evaluacion e on e.id=c.esquema_evaluacion_id and e.tenant_id=c.tenant_id
  where e.asignacion_profesor_id=assignment_id and e.periodo_evaluacion_id=period_id
    and e.estado='activo' and c.nombre='Captura provisional de prueba' and c.activo;

  provisional := public.crear_alumno_provisional_docente_movil(
    assignment_id,'Alumno','Sin cuenta',cycle_id,period_id
  );
  if provisional->>'provisionalId' is null then
    raise exception 'PROVISIONAL_TEST: no creó el alumno';
  end if;
  listed := public.obtener_alumnos_provisionales_docente_movil();
  if not exists(select 1 from jsonb_array_elements(listed) row
    where row->>'provisionalId'=provisional->>'provisionalId' and row->>'assignmentId'=assignment_id::text) then
    raise exception 'PROVISIONAL_TEST: no apareció en la asignación del profesor';
  end if;

  first_capture := public.registrar_captura_provisional_docente_movil(
    (provisional->>'provisionalId')::uuid,assignment_id,criterion_id,null,
    'calificacion',8.5,'Actividad provisional','tarea','Sin conexión',operation_key,cycle_id,period_id
  );
  repeated_capture := public.registrar_captura_provisional_docente_movil(
    (provisional->>'provisionalId')::uuid,assignment_id,criterion_id,null,
    'calificacion',8.5,'Actividad provisional','tarea','Sin conexión',operation_key,cycle_id,period_id
  );
  if first_capture->>'operationId' <> repeated_capture->>'operationId'
    or coalesce((repeated_capture->>'replayed')::boolean,false) is not true then
    raise exception 'PROVISIONAL_TEST: el reintento no fue idempotente';
  end if;
  if (select count(*) from public.capturas_provisionales_docente where idempotency_key=operation_key) <> 1 then
    raise exception 'PROVISIONAL_TEST: duplicó la captura';
  end if;

  linked := public.vincular_alumno_provisional_docente((provisional->>'provisionalId')::uuid,enrollment_id);
  if (linked->>'enrollmentId')::uuid <> enrollment_id or (linked->>'migratedCaptures')::integer <> 1 then
    raise exception 'PROVISIONAL_TEST: no vinculó y migró la captura';
  end if;
  if not exists(select 1 from public.alumnos_provisionales_docente p
    where p.id=(provisional->>'provisionalId')::uuid and p.estado='vinculado'
      and p.inscripcion_vinculada_id=enrollment_id) then
    raise exception 'PROVISIONAL_TEST: el provisional no quedó vinculado';
  end if;
  if not exists(select 1 from public.calificaciones_concepto_docente g
    where g.inscripcion_alumno_id=enrollment_id and g.idempotency_key=operation_key and g.calificacion=8.5) then
    raise exception 'PROVISIONAL_TEST: la calificación no llegó al alumno oficial';
  end if;

  begin
    perform public.crear_alumno_provisional_docente_movil(
      assignment_id,'Contexto','Obsoleto',cycle_id,gen_random_uuid()
    );
    raise exception 'PROVISIONAL_TEST: aceptó un periodo obsoleto';
  exception when sqlstate 'PT409' then null;
  end;
end
$provisional_mobile_test$;

rollback;
