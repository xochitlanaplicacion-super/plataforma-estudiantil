begin;

update public.periodos_evaluacion set estado='activo'
where tenant_id='10000000-0000-4000-8000-000000000001' and orden=1;

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);

do $provisional_qr_test$
declare context jsonb; provisional jsonb; credentials jsonb; metadata jsonb;
  assignment_id uuid; cycle_id uuid; period_id uuid; enrollment_id uuid; provisional_id uuid;
begin
  context := public.obtener_contexto_docente_movil();
  cycle_id := (context #>> '{cycle,id}')::uuid;
  period_id := (context #>> '{period,id}')::uuid;
  assignment_id := (context #>> '{assignments,0,id}')::uuid;
  enrollment_id := (context #>> '{assignments,0,students,0,enrollmentId}')::uuid;

  provisional := public.crear_alumno_provisional_docente_movil(
    assignment_id,'Credencial','Provisional',cycle_id,period_id
  );
  provisional_id := (provisional->>'provisionalId')::uuid;
  credentials := public.obtener_qrs_docente_movil(assignment_id);

  if not exists(select 1 from jsonb_array_elements(credentials) row
    where row->>'studentType'='registered' and (row->>'enrollmentId')::uuid=enrollment_id
      and row->>'token' is not null) then
    raise exception 'PROVISIONAL_QR_TEST: falta credencial oficial';
  end if;
  if not exists(select 1 from jsonb_array_elements(credentials) row
    where row->>'studentType'='provisional' and (row->>'provisionalId')::uuid=provisional_id
      and row->>'name'='Credencial Provisional' and row->>'token' is not null) then
    raise exception 'PROVISIONAL_QR_TEST: falta credencial provisional';
  end if;

  metadata := public.obtener_asignaciones_credenciales_docente_movil();
  if not exists(select 1 from jsonb_array_elements(metadata) row
    where (row->>'id')::uuid=assignment_id and nullif(row->>'levelName','') is not null
      and nullif(row->>'gradeName','') is not null and nullif(row->>'groupName','') is not null
      and nullif(row->>'subjectName','') is not null) then
    raise exception 'PROVISIONAL_QR_TEST: faltan filtros académicos';
  end if;

  perform public.vincular_alumno_provisional_docente(provisional_id,enrollment_id);
  credentials := public.obtener_qrs_docente_movil(assignment_id);
  if exists(select 1 from jsonb_array_elements(credentials) row
    where row->>'studentType'='provisional' and (row->>'provisionalId')::uuid=provisional_id) then
    raise exception 'PROVISIONAL_QR_TEST: el QR vinculado continuó activo';
  end if;
  if exists(select 1 from public.identificadores_qr_alumno_provisional q
    where q.alumno_provisional_id=provisional_id and q.activo) then
    raise exception 'PROVISIONAL_QR_TEST: el token vinculado no fue revocado';
  end if;
end
$provisional_qr_test$;

rollback;
