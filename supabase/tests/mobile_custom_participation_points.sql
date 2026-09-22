-- Execute only inside a transaction that will be rolled back.
do $test$
declare fixture record; provisional uuid; operation uuid := gen_random_uuid(); response jsonb;
  invalid_value numeric; allowed boolean; n integer;
begin
  select a.id assignment_id,a.profesor_id actor,a.tenant_id,a.ciclo_escolar_id cycle_id,
    a.grupo_id group_id,p.id period_id,c.id criterion_id,i.id enrollment_id
  into fixture
  from public.asignaciones_profesor a
  join public.ciclos_escolares cy on cy.id=a.ciclo_escolar_id and cy.tenant_id=a.tenant_id and cy.estado='activo'
  join public.periodos_evaluacion p on p.ciclo_escolar_id=cy.id and p.tenant_id=a.tenant_id and p.estado='activo'
  join public.esquemas_evaluacion e on e.asignacion_profesor_id=a.id and e.tenant_id=a.tenant_id and e.periodo_evaluacion_id=p.id and e.estado='activo'
  join public.criterios_evaluacion c on c.esquema_evaluacion_id=e.id and c.tenant_id=a.tenant_id and c.activo and c.tipo='participacion'
  join public.inscripciones_alumno i on i.tenant_id=a.tenant_id and i.ciclo_escolar_id=cy.id and i.grupo_id=a.grupo_id and i.activo
  where a.activo limit 1;
  if fixture.actor is null then raise exception 'No active participation fixture available'; end if;
  perform set_config('request.jwt.claim.sub',fixture.actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',fixture.actor,'role','authenticated')::text,true);
  response := public.registrar_participacion_docente_movil(fixture.assignment_id,fixture.criterion_id,null,fixture.enrollment_id,34,'Rollback verification',operation,fixture.cycle_id,fixture.period_id);
  if not exists(select 1 from public.eventos_participacion where id=(response->>'operationId')::uuid and puntos=34) then raise exception '34 points were not stored'; end if;
  perform public.registrar_participacion_docente_movil(fixture.assignment_id,fixture.criterion_id,null,fixture.enrollment_id,34,'Rollback verification',operation,fixture.cycle_id,fixture.period_id);
  select count(*) into n from public.eventos_participacion where tenant_id=fixture.tenant_id and idempotency_key=operation;
  if n<>1 then raise exception 'Retry duplicated points'; end if;
  foreach invalid_value in array array[0,100,-1,null::numeric,'NaN'::numeric] loop
    allowed := true;
    begin
      perform public.registrar_participacion_docente_movil(fixture.assignment_id,fixture.criterion_id,null,fixture.enrollment_id,invalid_value,'Invalid',gen_random_uuid(),fixture.cycle_id,fixture.period_id);
    exception when sqlstate 'PT422' then allowed := false;
    end;
    if allowed then raise exception 'Invalid value accepted: %',invalid_value; end if;
  end loop;
  select id into provisional from public.alumnos_provisionales_docente
    where tenant_id=fixture.tenant_id and ciclo_escolar_id=fixture.cycle_id and grupo_id=fixture.group_id and estado='pendiente' limit 1;
  if provisional is not null then
    response := public.registrar_captura_provisional_docente_movil(provisional,fixture.assignment_id,fixture.criterion_id,null,'participacion',34,null,null,'Rollback verification',gen_random_uuid(),fixture.cycle_id,fixture.period_id);
    if not exists(select 1 from public.capturas_provisionales_docente where id=(response->>'operationId')::uuid and valor=34) then raise exception 'Provisional 34 points failed'; end if;
  else raise notice 'No provisional in fixture group; provisional write not tested';
  end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  allowed := true;
  begin
    perform public.registrar_participacion_docente_movil(fixture.assignment_id,fixture.criterion_id,null,fixture.enrollment_id,34,'Unauthorized',gen_random_uuid(),fixture.cycle_id,fixture.period_id);
  exception when sqlstate 'PT409' or sqlstate 'PT403' then allowed := false;
  end;
  if allowed then raise exception 'Unassigned actor accepted'; end if;
end $test$;
