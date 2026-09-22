-- Execute only inside a caller-owned transaction that ends in ROLLBACK.
do $test$
declare fixture record; provisional uuid; official uuid; enrollment uuid; task uuid:=gen_random_uuid();
  result jsonb; catalogue jsonb; operation uuid:=gen_random_uuid();
begin
  select a.*,p.id period_id,v.criterio_evaluacion_id,v.subcriterio_evaluacion_id,e.tema_id into fixture
  from public.asignaciones_profesor a join public.periodos_evaluacion p
    on p.tenant_id=a.tenant_id and p.ciclo_escolar_id=a.ciclo_escolar_id and p.estado='activo'
  join public.vinculos_evaluacion_ejercicio v on v.asignacion_profesor_id=a.id and v.tenant_id=a.tenant_id
    and v.periodo_evaluacion_id=p.id and v.activo
  join public.ejercicios e on e.id=v.ejercicio_id and e.tenant_id=a.tenant_id
  where a.activo limit 1;
  if fixture.id is null then raise exception 'Missing assignment fixture'; end if;
  perform set_config('request.jwt.claim.sub',fixture.profesor_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',fixture.profesor_id,'role','authenticated')::text,true);
  result:=public.crear_alumno_provisional_docente_movil(fixture.id,'Prueba rollback','Tarea provisional',fixture.ciclo_escolar_id,fixture.period_id);
  provisional:=(result->>'provisionalId')::uuid;
  if provisional is null then raise exception 'Missing provisional fixture'; end if;
  insert into public.ejercicios(id,tenant_id,tema_id,titulo,tipo,created_by,publicado,visible)
    values(task,fixture.tenant_id,fixture.tema_id,'Provisional task rollback verification','actividad_descriptiva',fixture.profesor_id,true,true);
  perform public.configurar_vinculo_evaluacion_ejercicio(task,fixture.id,fixture.period_id,fixture.criterio_evaluacion_id,fixture.subcriterio_evaluacion_id);
  catalogue:=public.obtener_tareas_descriptivas_docente_movil(fixture.id);
  if not exists(select 1 from jsonb_array_elements(catalogue->'tasks') t,jsonb_array_elements(t->'students') s
    where (t->>'id')::uuid=task and (s->>'provisionalId')::uuid=provisional) then raise exception 'Provisional missing from catalogue'; end if;
  result:=public.calificar_tarea_provisional_movil(fixture.id,task,provisional,8,0,operation,fixture.ciclo_escolar_id,fixture.period_id);
  if result->>'rowVersion'<>'1' then raise exception 'Initial version invalid'; end if;
  result:=public.calificar_tarea_provisional_movil(fixture.id,task,provisional,8,0,operation,fixture.ciclo_escolar_id,fixture.period_id);
  if result->>'replayed'<>'true' then raise exception 'Replay failed'; end if;
  begin
    perform public.calificar_tarea_provisional_movil(fixture.id,task,provisional,9,0,gen_random_uuid(),fixture.ciclo_escolar_id,fixture.period_id);
    raise exception 'Stale version accepted';
  exception when sqlstate 'PT409' then null; end;
  perform public.calificar_tarea_provisional_movil(fixture.id,task,provisional,9,1,gen_random_uuid(),fixture.ciclo_escolar_id,fixture.period_id);
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.calificar_tarea_provisional_movil(fixture.id,task,provisional,7,2,gen_random_uuid(),fixture.ciclo_escolar_id,fixture.period_id);
    raise exception 'Unauthorized teacher accepted';
  exception when sqlstate 'PT403' then null; end;
  perform set_config('request.jwt.claim.sub',fixture.profesor_id::text,true);
  select i.id,i.alumno_id into enrollment,official from public.inscripciones_alumno i
    where i.tenant_id=fixture.tenant_id and i.ciclo_escolar_id=fixture.ciclo_escolar_id and i.grupo_id=fixture.grupo_id and i.activo limit 1;
  if enrollment is null then raise exception 'No official fixture'; end if;
  perform public.calificar_tarea_descriptiva_docente_movil(fixture.id,task,official,6,0,gen_random_uuid(),fixture.ciclo_escolar_id,fixture.period_id);
  perform public.registrar_push_docente('ExpoPushToken[rollback_verification]');
  update public.resultados_ejercicios set archivo_path='rollback-only/physical-task.pdf'
    where ejercicio_id=task and alumno_id=official;
  update public.resultados_ejercicios set archivo_path='rollback-only/physical-task.pdf'
    where ejercicio_id=task and alumno_id=official;
  if (select count(*) from public.cola_push_entregas where ejercicio_id=task and token='ExpoPushToken[rollback_verification]')<>1 then
    raise exception 'Push missing or duplicated for the same upload'; end if;
  if has_table_privilege('authenticated','public.cola_push_entregas','select') or
    has_function_privilege('authenticated','public.reclamar_push_entregas()','execute') or
    has_function_privilege('anon','public.calificar_tarea_provisional_movil(uuid,uuid,uuid,numeric,bigint,uuid,uuid,uuid)','execute') then
    raise exception 'Unexpected public privileges'; end if;
  begin
    perform public.vincular_alumno_provisional_docente(provisional,enrollment);
    raise exception 'Conflicting official grade overwritten';
  exception when sqlstate 'PT409' then null; end;
  if not exists(select 1 from public.alumnos_provisionales_docente where id=provisional and estado='pendiente') then raise exception 'Failed linking was not atomic'; end if;
  -- Only this test's new result is removed; the outer transaction rolls everything back.
  delete from public.resultados_ejercicios where ejercicio_id=task and alumno_id=official;
  perform public.vincular_alumno_provisional_docente(provisional,enrollment);
  if (select count(*) from public.resultados_ejercicios where ejercicio_id=task and alumno_id=official and calificacion=9)<>1 then raise exception 'Grade transfer failed'; end if;
  if not exists(select 1 from private.notas_tareas_provisionales where provisional_id=provisional and ejercicio_id=task and migrada_at is not null) then raise exception 'History not preserved'; end if;
end $test$;
