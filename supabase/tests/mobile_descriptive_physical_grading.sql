-- Run within BEGIN/ROLLBACK, never persist test academic results.
do $test$
declare fixture record; student uuid; catalogue jsonb; response jsonb; response2 jsonb; operation uuid:=gen_random_uuid(); version bigint;
begin
  select a.id assignment_id,a.profesor_id,a.tenant_id,a.ciclo_escolar_id, p.id period_id,v.ejercicio_id,
    v.criterio_evaluacion_id,v.subcriterio_evaluacion_id,e.tema_id
  into fixture from public.asignaciones_profesor a
  join public.ciclos_escolares cy on cy.id=a.ciclo_escolar_id and cy.estado='activo'
  join public.periodos_evaluacion p on p.tenant_id=a.tenant_id and p.ciclo_escolar_id=cy.id and p.estado='activo'
  join public.vinculos_evaluacion_ejercicio v on v.tenant_id=a.tenant_id and v.asignacion_profesor_id=a.id and v.periodo_evaluacion_id=p.id and v.activo
  join public.ejercicios e on e.id=v.ejercicio_id and e.tenant_id=v.tenant_id
  where a.activo limit 1;
  if fixture.assignment_id is null then raise exception 'No descriptive task fixture available'; end if;
  perform set_config('request.jwt.claim.sub',fixture.profesor_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',fixture.profesor_id,'role','authenticated')::text,true);
  fixture.ejercicio_id := gen_random_uuid();
  insert into public.ejercicios(id,tenant_id,tema_id,titulo,tipo,created_by,publicado,visible)
    values(fixture.ejercicio_id,fixture.tenant_id,fixture.tema_id,'Physical task rollback verification','actividad_descriptiva',fixture.profesor_id,false,true);
  perform public.configurar_vinculo_evaluacion_ejercicio(fixture.ejercicio_id,fixture.assignment_id,fixture.period_id,fixture.criterio_evaluacion_id,fixture.subcriterio_evaluacion_id);
  catalogue := public.obtener_tareas_descriptivas_docente_movil(fixture.assignment_id);
  if not exists(select 1 from jsonb_array_elements(catalogue->'tasks') task
    where (task->>'id')::uuid=fixture.ejercicio_id) then
    raise exception 'Linked unpublished task missing from teacher catalogue';
  end if;
  select (roster->>'studentId')::uuid,(roster->>'rowVersion')::bigint into student,version
    from jsonb_array_elements(catalogue->'tasks') task,
      jsonb_array_elements(task->'students') roster
    where (task->>'id')::uuid=fixture.ejercicio_id and (roster->>'rowVersion')::bigint=0 limit 1;
  if student is null then raise exception 'No unsubmitted pupil available to verify physical grading'; end if;
  response := public.calificar_tarea_descriptiva_docente_movil(fixture.assignment_id,fixture.ejercicio_id,student,8,version,operation,fixture.ciclo_escolar_id,fixture.period_id);
  if (response->>'grade')::numeric<>8 or not (response->>'saved')::boolean then raise exception 'Physical grade not saved'; end if;
  if not exists(select 1 from public.resultados_ejercicios where id=(response->>'sourceId')::uuid and archivo_path is null and archivo_url is null) then raise exception 'Unexpected file dependency'; end if;
  response2 := public.calificar_tarea_descriptiva_docente_movil(fixture.assignment_id,fixture.ejercicio_id,student,8,version,operation,fixture.ciclo_escolar_id,fixture.period_id);
  if response2->>'sourceId'<>response->>'sourceId' or not (response2->>'replayed')::boolean then raise exception 'Retry duplicated grade'; end if;
  response2 := public.calificar_tarea_descriptiva_docente_movil(fixture.assignment_id,fixture.ejercicio_id,student,9,(response->>'rowVersion')::bigint,gen_random_uuid(),fixture.ciclo_escolar_id,fixture.period_id);
  if (response2->>'grade')::numeric<>9 then raise exception 'Correction failed'; end if;
  begin
    perform public.calificar_tarea_descriptiva_docente_movil(fixture.assignment_id,fixture.ejercicio_id,student,7,version,gen_random_uuid(),fixture.ciclo_escolar_id,fixture.period_id);
    raise exception 'Stale grade version was accepted';
  exception when sqlstate 'PT409' then null; end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.obtener_tareas_descriptivas_docente_movil(fixture.assignment_id);
    raise exception 'Foreign teacher could read task roster';
  exception when sqlstate 'PT403' then null; end;
end $test$;
