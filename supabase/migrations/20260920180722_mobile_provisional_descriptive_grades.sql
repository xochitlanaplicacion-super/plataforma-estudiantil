-- Separate academic identity: never create authentication accounts for provisionals.
create table private.notas_tareas_provisionales (
  provisional_id uuid not null references public.alumnos_provisionales_docente(id),
  ejercicio_id uuid not null references public.ejercicios(id),
  vinculo_id uuid not null references public.vinculos_evaluacion_ejercicio(id),
  tenant_id uuid not null references public.tenants(id),
  calificacion numeric(6,4) not null check(calificacion between 0 and 10),
  row_version bigint not null default 1,
  actor_id uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  migrada_at timestamptz,
  primary key(provisional_id,ejercicio_id)
);
alter table private.notas_tareas_provisionales enable row level security;
create index on private.notas_tareas_provisionales(ejercicio_id);
create index on private.notas_tareas_provisionales(vinculo_id);
create index on private.notas_tareas_provisionales(tenant_id);
create index on private.notas_tareas_provisionales(actor_id);
create table private.operaciones_tareas_provisionales (
  id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  request jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.operaciones_tareas_provisionales enable row level security;
create index on private.operaciones_tareas_provisionales(actor_id);
revoke all on private.notas_tareas_provisionales,private.operaciones_tareas_provisionales from public,anon,authenticated;

-- Keep the existing official catalogue and its scope checks unchanged.
do $migration$
declare definition text; marker text;
begin
  definition:=pg_get_functiondef('private.obtener_tareas_descriptivas_docente_movil(uuid)'::regprocedure);
  marker:=$part$return jsonb_build_object('assignmentId',scope.id,'cycleId',scope.ciclo_escolar_id,'periodId',scope.period_id,'tasks',result);$part$;
  if position(marker in definition)=0 then raise exception 'Review catalogue definition before migration'; end if;
  definition:=replace(definition,marker,$part$
  select coalesce(jsonb_agg(task || jsonb_build_object('students', (task->'students') ||
    coalesce((select jsonb_agg(jsonb_build_object(
      'enrollmentId',p.id,'studentId',p.id,'provisionalId',p.id,
      'grade',n.calificacion,'rowVersion',coalesce(n.row_version,0),
      'hasUpload',false,'state',case when n.calificacion is null then 'pendiente' else 'calificado' end
    ) order by p.id)
    from public.alumnos_provisionales_docente p
    left join private.notas_tareas_provisionales n on n.provisional_id=p.id
      and n.ejercicio_id=(task->>'id')::uuid and n.tenant_id=p.tenant_id and n.migrada_at is null
    where p.tenant_id=scope.tenant_id and p.ciclo_escolar_id=scope.ciclo_escolar_id
      and p.grupo_id=scope.grupo_id and p.estado='pendiente'),'[]'::jsonb)
  )),'[]'::jsonb) into result from jsonb_array_elements(result) task;
  return jsonb_build_object('assignmentId',scope.id,'cycleId',scope.ciclo_escolar_id,'periodId',scope.period_id,'tasks',result);
  $part$);
  execute definition;
end $migration$;

create function private.calificar_tarea_provisional_movil(
  p_asignacion_id uuid,p_ejercicio_id uuid,p_alumno_id uuid,p_calificacion numeric,
  p_row_version bigint,p_idempotency_key uuid,p_expected_cycle_id uuid,p_expected_period_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare catalogue jsonb; pupil public.alumnos_provisionales_docente%rowtype;
  link public.vinculos_evaluacion_ejercicio%rowtype; previous private.notas_tareas_provisionales%rowtype;
  operation private.operaciones_tareas_provisionales%rowtype; request jsonb; response jsonb;
begin
  if auth.uid() is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  if p_idempotency_key is null or p_row_version is null or p_row_version<0
    or p_calificacion is null or p_calificacion not between 0 and 10 then
    raise exception using errcode='PT422',message='MOBILE_GRADE_INVALID';
  end if;
  request:=jsonb_build_array(p_asignacion_id,p_ejercicio_id,p_alumno_id,p_calificacion,p_row_version,p_expected_cycle_id,p_expected_period_id);
  -- Lock the identity used by the official-link operation to serialize both workflows.
  select * into pupil from public.alumnos_provisionales_docente where id=p_alumno_id for update;
  catalogue:=private.obtener_tareas_descriptivas_docente_movil(p_asignacion_id);
  select * into operation from private.operaciones_tareas_provisionales where id=p_idempotency_key;
  if operation.id is not null then
    if operation.actor_id<>auth.uid() or operation.request<>request then
      raise exception using errcode='PT409',message='MOBILE_IDEMPOTENCY_CONFLICT';
    end if;
    return operation.response || jsonb_build_object('replayed',true);
  end if;
  if (catalogue->>'cycleId')::uuid is distinct from p_expected_cycle_id
    or (catalogue->>'periodId')::uuid is distinct from p_expected_period_id then
    raise exception using errcode='PT409',message='MOBILE_ACADEMIC_CONTEXT_CHANGED';
  end if;
  if pupil.id is null or pupil.estado<>'pendiente' or not exists(
    select 1 from jsonb_array_elements(catalogue->'tasks') task,
    lateral jsonb_array_elements(task->'students') student
    where (task->>'id')::uuid=p_ejercicio_id and (student->>'provisionalId')::uuid=p_alumno_id
  ) then raise exception using errcode='PT404',message='MOBILE_PROVISIONAL_NOT_AVAILABLE'; end if;
  select * into link from public.vinculos_evaluacion_ejercicio
    where tenant_id=pupil.tenant_id and asignacion_profesor_id=p_asignacion_id
      and periodo_evaluacion_id=p_expected_period_id and ejercicio_id=p_ejercicio_id and activo
      and origen='descriptiveSubmission' for share;
  if link.id is null or private.academic_scope_is_closed(pupil.tenant_id,p_asignacion_id,p_expected_period_id) then
    raise exception using errcode='PT409',message='ACADEMIC_SCOPE_CLOSED'; end if;
  select * into previous from private.notas_tareas_provisionales
    where provisional_id=p_alumno_id and ejercicio_id=p_ejercicio_id for update;
  if coalesce(previous.row_version,0)<>p_row_version then
    raise exception using errcode='PT409',message='ACADEMIC_VERSION_CONFLICT'; end if;
  insert into private.notas_tareas_provisionales(provisional_id,ejercicio_id,vinculo_id,tenant_id,calificacion,actor_id)
    values(p_alumno_id,p_ejercicio_id,link.id,pupil.tenant_id,round(p_calificacion,4),auth.uid())
    on conflict(provisional_id,ejercicio_id) do update set calificacion=excluded.calificacion,
      row_version=private.notas_tareas_provisionales.row_version+1,actor_id=excluded.actor_id,updated_at=now();
  response:=jsonb_build_object('saved',true,'rowVersion',p_row_version+1,'replayed',false);
  insert into private.operaciones_tareas_provisionales(id,actor_id,request,response)
    values(p_idempotency_key,auth.uid(),request,response);
  insert into public.auditoria(tenant_id,user_id,accion,entidad,entidad_id,detalles)
    values(pupil.tenant_id,auth.uid(),'academic.provisional.task.graded','ejercicios',p_ejercicio_id,
      jsonb_build_object('provisionalId',p_alumno_id,'before',previous.calificacion,'after',p_calificacion,'operationId',p_idempotency_key));
  return response;
end $$;
revoke all on function private.calificar_tarea_provisional_movil(uuid,uuid,uuid,numeric,bigint,uuid,uuid,uuid) from public,anon;
grant execute on function private.calificar_tarea_provisional_movil(uuid,uuid,uuid,numeric,bigint,uuid,uuid,uuid) to authenticated;
create function public.calificar_tarea_provisional_movil(
  p_asignacion_id uuid,p_ejercicio_id uuid,p_alumno_id uuid,p_calificacion numeric,
  p_row_version bigint,p_idempotency_key uuid,p_expected_cycle_id uuid,p_expected_period_id uuid
) returns jsonb language sql security invoker set search_path='' as $$
  select private.calificar_tarea_provisional_movil(p_asignacion_id,p_ejercicio_id,p_alumno_id,p_calificacion,
    p_row_version,p_idempotency_key,p_expected_cycle_id,p_expected_period_id);
$$;
revoke all on function public.calificar_tarea_provisional_movil(uuid,uuid,uuid,numeric,bigint,uuid,uuid,uuid) from public,anon;
grant execute on function public.calificar_tarea_provisional_movil(uuid,uuid,uuid,numeric,bigint,uuid,uuid,uuid) to authenticated;

-- Atomic with the existing linking workflow. Never overwrite an official grade.
create function private.transferir_tareas_provisionales() returns trigger
language plpgsql security definer set search_path='' as $$
declare note record; enrollment public.inscripciones_alumno%rowtype; result public.resultados_ejercicios%rowtype;
begin
  if old.estado<>'pendiente' or new.estado<>'vinculado' then return new; end if;
  if auth.uid() is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  select * into enrollment from public.inscripciones_alumno where id=new.inscripcion_vinculada_id
    and tenant_id=new.tenant_id and ciclo_escolar_id=new.ciclo_escolar_id and grupo_id=new.grupo_id and activo for update;
  if enrollment.id is null then raise exception using errcode='PT422',message='MOBILE_OFFICIAL_ENROLLMENT_MISMATCH'; end if;
  for note in select n.*,t.unidad_id from private.notas_tareas_provisionales n
    join public.ejercicios e on e.id=n.ejercicio_id and e.tenant_id=n.tenant_id
    join public.temas t on t.id=e.tema_id and t.tenant_id=e.tenant_id
    where n.provisional_id=new.id and n.tenant_id=new.tenant_id and n.migrada_at is null for update of n
  loop
    select * into result from public.resultados_ejercicios
      where alumno_id=enrollment.alumno_id and ejercicio_id=note.ejercicio_id for update;
    if result.id is not null and (result.tenant_id<>new.tenant_id or
      result.origen<>'descriptiveSubmission' or result.vinculo_evaluacion_id is distinct from note.vinculo_id
      or (result.estado='calificado' and result.calificacion is distinct from note.calificacion)) then
      raise exception using errcode='PT409',message='PROVISIONAL_TASK_GRADE_CONFLICT_REVIEW_REQUIRED';
    end if;
    if result.id is null then
      insert into public.resultados_ejercicios(tenant_id,alumno_id,ejercicio_id,calificacion,estado,bloqueado,
        calificado_por,calificado_at,fecha_completado,inscripcion_alumno_id,vinculo_evaluacion_id,
        unidad_origen_id,origen,registro_legacy,observacion)
      values(new.tenant_id,enrollment.alumno_id,note.ejercicio_id,note.calificacion,'calificado',true,
        note.actor_id,note.updated_at,note.updated_at,enrollment.id,note.vinculo_id,note.unidad_id,
        'descriptiveSubmission',false,'Nota transferida de alumno provisional');
    elsif result.estado<>'calificado' then
      update public.resultados_ejercicios set calificacion=note.calificacion,estado='calificado',bloqueado=true,
        calificado_por=note.actor_id,calificado_at=note.updated_at where id=result.id;
    end if;
    update private.notas_tareas_provisionales set migrada_at=now()
      where provisional_id=new.id and ejercicio_id=note.ejercicio_id;
    insert into public.auditoria(tenant_id,user_id,accion,entidad,entidad_id,detalles)
      values(new.tenant_id,auth.uid(),'academic.provisional.task.transferred','ejercicios',note.ejercicio_id,
        jsonb_build_object('provisionalId',new.id,'enrollmentId',enrollment.id,'grade',note.calificacion));
  end loop;
  return new;
end $$;
revoke all on function private.transferir_tareas_provisionales() from public,anon,authenticated;
create trigger transferir_tareas_provisionales before update of estado on public.alumnos_provisionales_docente
  for each row execute function private.transferir_tareas_provisionales();
