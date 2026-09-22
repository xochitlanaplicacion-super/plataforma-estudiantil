-- Physical descriptive work uses the same canonical result, optimistic version,
-- idempotency log, scope closure checks and audit trail as uploaded submissions.
do $migration$
declare definition text; old_guard text; old_update text; new_update text;
begin
  definition := pg_get_functiondef('public.guardar_resultado_ejercicio_academico(uuid,text,uuid,bigint,uuid,integer,integer,numeric,numeric,text,jsonb)'::regprocedure);
  old_guard := $part$if before_row.id is null or before_row.origen <> 'descriptiveSubmission'
       or (before_row.archivo_path is null and before_row.archivo_url is null) then$part$;
  old_update := $part$update public.resultados_ejercicios r set
      calificacion = round(p_calificacion_10, 4), estado = 'calificado',
      bloqueado = true, calificado_por = actor, calificado_at = now(),
      observacion = nullif(btrim(p_observacion), '')
    where r.id = before_row.id and r.tenant_id = tenant
      and r.row_version = p_expected_row_version
    returning * into after_row;$part$;
  new_update := $part$if before_row.id is null then
      insert into public.resultados_ejercicios (
        tenant_id, alumno_id, ejercicio_id, calificacion, estado, bloqueado,
        calificado_por, calificado_at, fecha_completado, inscripcion_alumno_id,
        vinculo_evaluacion_id, unidad_origen_id, origen, observacion, registro_legacy
      ) values (
        tenant, student_id, p_ejercicio_id, round(p_calificacion_10,4), 'calificado', true,
        actor, now(), now(), enrollment.id, link.id, exercise.unidad_id,
        'descriptiveSubmission', nullif(btrim(p_observacion),''), false
      ) returning * into after_row;
    else
      update public.resultados_ejercicios r set
        calificacion = round(p_calificacion_10, 4), estado = 'calificado',
        bloqueado = true, calificado_por = actor, calificado_at = now(),
        observacion = nullif(btrim(p_observacion), '')
      where r.id = before_row.id and r.tenant_id = tenant
        and r.row_version = p_expected_row_version
      returning * into after_row;
    end if;$part$;
  if position(old_guard in definition)=0 or position(old_update in definition)=0 then
    raise exception 'Canonical result function changed: review before applying physical grading';
  end if;
  definition := replace(definition,old_guard,$part$if before_row.id is not null and before_row.origen <> 'descriptiveSubmission' then$part$);
  definition := replace(definition,old_update,new_update);
  execute definition;
end $migration$;

create or replace function private.obtener_tareas_descriptivas_docente_movil(p_asignacion_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scope record; result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  select a.*,p.id period_id into scope from public.asignaciones_profesor a
    join public.profiles actor on actor.id=auth.uid() and actor.tenant_id=a.tenant_id and actor.rol='profesor' and actor.estatus='activo'
    join public.tenants tenant on tenant.id=a.tenant_id and tenant.estado='activo'
    join public.ciclos_escolares cy on cy.id=a.ciclo_escolar_id and cy.tenant_id=a.tenant_id and cy.estado='activo'
    join public.periodos_evaluacion p on p.ciclo_escolar_id=cy.id and p.tenant_id=a.tenant_id and p.estado='activo'
    where a.id=p_asignacion_id and a.profesor_id=auth.uid() and a.activo;
  if scope.id is null then raise exception using errcode='PT403',message='MOBILE_ASSIGNMENT_FORBIDDEN'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'name',e.titulo,'criterionId',v.criterio_evaluacion_id,'subcriterionId',v.subcriterio_evaluacion_id,
    'criterionName',c.nombre,'subcriterionName',s.nombre,'dueAt',e.fecha_entrega,
    'students',(select coalesce(jsonb_agg(jsonb_build_object(
      'enrollmentId',i.id,'studentId',i.alumno_id,'grade',case when r.estado='calificado' then r.calificacion else null end,'rowVersion',coalesce(r.row_version,0),
      'hasUpload',(r.archivo_path is not null or r.archivo_url is not null),'state',coalesce(r.estado,'pendiente')
    ) order by i.id),'[]'::jsonb) from public.inscripciones_alumno i
      left join public.resultados_ejercicios r on r.tenant_id=i.tenant_id and r.alumno_id=i.alumno_id and r.ejercicio_id=e.id
      where i.tenant_id=scope.tenant_id and i.ciclo_escolar_id=scope.ciclo_escolar_id and i.grupo_id=scope.grupo_id and i.activo)
  ) order by e.created_at desc,e.id),'[]'::jsonb) into result
  from public.vinculos_evaluacion_ejercicio v
    join public.ejercicios e on e.id=v.ejercicio_id and e.tenant_id=v.tenant_id and e.tipo='actividad_descriptiva' and e.publicado and e.visible is distinct from false
    join public.criterios_evaluacion c on c.id=v.criterio_evaluacion_id and c.tenant_id=v.tenant_id and c.activo
    join public.esquemas_evaluacion es on es.id=c.esquema_evaluacion_id and es.tenant_id=v.tenant_id and es.estado='activo'
    left join public.subcriterios_evaluacion s on s.id=v.subcriterio_evaluacion_id and s.tenant_id=v.tenant_id
  where v.tenant_id=scope.tenant_id and v.asignacion_profesor_id=scope.id and v.periodo_evaluacion_id=scope.period_id
    and v.activo and v.origen='descriptiveSubmission' and (v.subcriterio_evaluacion_id is null or s.activo);
  return jsonb_build_object('assignmentId',scope.id,'cycleId',scope.ciclo_escolar_id,'periodId',scope.period_id,'tasks',result);
end $$;
revoke all on function private.obtener_tareas_descriptivas_docente_movil(uuid) from public,anon;
grant execute on function private.obtener_tareas_descriptivas_docente_movil(uuid) to authenticated;
create or replace function public.obtener_tareas_descriptivas_docente_movil(p_asignacion_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.obtener_tareas_descriptivas_docente_movil(p_asignacion_id);
$$;
revoke all on function public.obtener_tareas_descriptivas_docente_movil(uuid) from public,anon;
grant execute on function public.obtener_tareas_descriptivas_docente_movil(uuid) to authenticated;

-- Narrow invoker wrapper: reject stale assignment/cycle/period before delegating
-- to the canonical writer. It cannot bypass that writer's own authorization.
create or replace function public.calificar_tarea_descriptiva_docente_movil(
  p_asignacion_id uuid,p_ejercicio_id uuid,p_alumno_id uuid,p_calificacion numeric,
  p_row_version bigint,p_idempotency_key uuid,p_expected_cycle_id uuid,p_expected_period_id uuid
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare catalogue jsonb;
begin
  catalogue := public.obtener_tareas_descriptivas_docente_movil(p_asignacion_id);
  if (catalogue->>'cycleId')::uuid is distinct from p_expected_cycle_id
    or (catalogue->>'periodId')::uuid is distinct from p_expected_period_id then
    raise exception using errcode='PT409',message='MOBILE_ACADEMIC_CONTEXT_CHANGED';
  end if;
  if not exists(select 1 from jsonb_array_elements(catalogue->'tasks') task where (task->>'id')::uuid=p_ejercicio_id) then
    raise exception using errcode='PT404',message='MOBILE_TASK_NOT_AVAILABLE';
  end if;
  if p_row_version is null or p_row_version<0 then raise exception using errcode='PT422',message='MOBILE_VERSION_REQUIRED'; end if;
  return public.guardar_resultado_ejercicio_academico(p_ejercicio_id,'descriptive_grade',p_idempotency_key,
    p_row_version,p_alumno_id,null,null,null,p_calificacion,'Calificada por el docente desde KIBO',null);
end $$;
revoke all on function public.calificar_tarea_descriptiva_docente_movil(uuid,uuid,uuid,numeric,bigint,uuid,uuid,uuid) from public,anon;
grant execute on function public.calificar_tarea_descriptiva_docente_movil(uuid,uuid,uuid,numeric,bigint,uuid,uuid,uuid) to authenticated;
