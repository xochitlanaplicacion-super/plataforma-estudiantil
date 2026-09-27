-- A gallery is one submission: the first path remains in archivo_path so old
-- clients can still open an image, while the complete ordered set is private.
alter table public.resultados_ejercicios
  add column fotos_json jsonb;
alter table public.resultados_ejercicios
  add constraint resultados_fotos_json_valid check (
    fotos_json is null or (
      jsonb_typeof(fotos_json) = 'array'
      and jsonb_array_length(fotos_json) between 1 and 15
    )
  );

alter table public.student_submission_upload_intents
  add column photo_files jsonb;
alter table public.student_submission_upload_intents
  add constraint student_upload_photo_files_valid check (
    photo_files is null or (
      jsonb_typeof(photo_files) = 'array'
      and jsonb_array_length(photo_files) between 1 and 15
    )
  );

comment on column public.resultados_ejercicios.fotos_json is
  'Ordered private gallery metadata; only paths and display names, never signed URLs.';
comment on column public.student_submission_upload_intents.photo_files is
  'Server-issued paths, names, MIME types and sizes for one atomic photo submission.';

alter table public.cola_push_entregas
  add column tipo_aviso text not null default 'submission'
    check (tipo_aviso in ('submission', 'exercise_result'));

create function private.encolar_resultado_automatico_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.origen is distinct from 'automaticExercise' or new.calificacion is null
    or new.fecha_completado is null then return new; end if;
  if tg_op = 'UPDATE' and old.intentos is not distinct from new.intentos then return new; end if;
  insert into public.cola_push_entregas
    (token, profesor_id, tenant_id, resultado_id, archivo_path, asignacion_id, ejercicio_id, tipo_aviso)
  select d.token, a.profesor_id, a.tenant_id, new.id,
    'exercise-result:' || new.id::text || ':' || coalesce(new.intentos, 1)::text,
    a.id, new.ejercicio_id, 'exercise_result'
  from public.vinculos_evaluacion_ejercicio v
  join public.asignaciones_profesor a on a.id = v.asignacion_profesor_id
    and a.tenant_id = v.tenant_id and a.activo
  join public.inscripciones_alumno i on i.id = new.inscripcion_alumno_id
    and i.tenant_id = a.tenant_id and i.grupo_id = a.grupo_id
    and i.ciclo_escolar_id = a.ciclo_escolar_id and i.alumno_id = new.alumno_id and i.activo
  join public.dispositivos_push_docente d on d.profesor_id = a.profesor_id and d.tenant_id = a.tenant_id
  join public.profiles p on p.id = a.profesor_id and p.tenant_id = a.tenant_id
    and p.rol = 'profesor' and p.estatus = 'activo'
  where v.id = new.vinculo_evaluacion_id and v.tenant_id = new.tenant_id
    and v.ejercicio_id = new.ejercicio_id and v.activo
  on conflict (token, resultado_id, archivo_path) do nothing;
  return new;
end $$;
revoke all on function private.encolar_resultado_automatico_push() from public, anon, authenticated;
create trigger encolar_resultado_automatico_push
  after insert or update of intentos on public.resultados_ejercicios
  for each row execute function private.encolar_resultado_automatico_push();

create function private.obtener_reporte_trabajos_docente(p_asignacion_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare scope record; entries jsonb;
begin
  if auth.uid() is null then raise exception using errcode = 'PT401', message = 'UNAUTHENTICATED'; end if;
  select a.id, a.tenant_id, a.ciclo_escolar_id, a.grupo_id, a.materia_id,
    p.id as period_id, p.fecha_inicio as period_start, p.fecha_fin as period_end
    into scope
  from public.asignaciones_profesor a
  join public.profiles actor on actor.id = auth.uid() and actor.tenant_id = a.tenant_id
    and actor.rol = 'profesor' and actor.estatus = 'activo'
  join public.tenants tenant on tenant.id = a.tenant_id and tenant.estado = 'activo'
  join public.ciclos_escolares cycle on cycle.id = a.ciclo_escolar_id and cycle.tenant_id = a.tenant_id
    and cycle.estado = 'activo'
  join public.periodos_evaluacion p on p.ciclo_escolar_id = cycle.id and p.tenant_id = a.tenant_id
    and p.estado = 'activo'
  where a.id = p_asignacion_id and a.profesor_id = auth.uid() and a.activo;
  if scope.id is null then raise exception using errcode = 'PT403', message = 'ASSIGNMENT_FORBIDDEN'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'exerciseId', e.id, 'exerciseTitle', e.titulo, 'exerciseType', e.tipo,
    'studentId', r.alumno_id, 'studentName', btrim(coalesce(student.nombre, '') || ' ' || coalesce(student.apellidos, '')),
    'enrollmentId', i.id, 'grade', r.calificacion, 'state', r.estado,
    'completedAt', coalesce(r.fecha_completado, r.primer_envio_en),
    'hits', r.aciertos, 'totalQuestions', r.total_preguntas, 'attempts', r.intentos,
    'hasUpload', (r.archivo_path is not null or r.fotos_json is not null),
    'photoCount', coalesce(jsonb_array_length(r.fotos_json), 0),
    'weighted', coalesce(not c.es_sistema_sin_peso, false)
  ) order by coalesce(r.fecha_completado, r.primer_envio_en) desc, e.id, i.id), '[]'::jsonb)
    into entries
  from public.resultados_ejercicios r
  join public.ejercicios e on e.id = r.ejercicio_id and e.tenant_id = r.tenant_id
  join public.temas topic on topic.id = e.tema_id and topic.tenant_id = e.tenant_id
  join public.unidades unit on unit.id = topic.unidad_id and unit.tenant_id = e.tenant_id
    and unit.materia_id = scope.materia_id
  left join public.vinculos_evaluacion_ejercicio v on v.id = r.vinculo_evaluacion_id
    and v.tenant_id = r.tenant_id and v.asignacion_profesor_id = scope.id
    and v.periodo_evaluacion_id = scope.period_id and v.activo
  left join public.criterios_evaluacion c on c.id = v.criterio_evaluacion_id
    and c.tenant_id = r.tenant_id
  join public.inscripciones_alumno i on i.id = r.inscripcion_alumno_id and i.tenant_id = scope.tenant_id
    and i.ciclo_escolar_id = scope.ciclo_escolar_id and i.grupo_id = scope.grupo_id
    and i.alumno_id = r.alumno_id and i.activo
  join public.profiles student on student.id = r.alumno_id and student.tenant_id = scope.tenant_id
  where r.tenant_id = scope.tenant_id
    and (v.id is not null or coalesce(r.fecha_completado, r.primer_envio_en)::date
      between scope.period_start and scope.period_end)
    and (r.calificacion is not null or r.archivo_path is not null or r.fotos_json is not null);
  return jsonb_build_object('assignmentId', scope.id, 'periodId', scope.period_id, 'rows', entries);
end $$;
revoke all on function private.obtener_reporte_trabajos_docente(uuid) from public, anon;
grant execute on function private.obtener_reporte_trabajos_docente(uuid) to authenticated;
create function public.obtener_reporte_trabajos_docente(p_asignacion_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.obtener_reporte_trabajos_docente(p_asignacion_id);
$$;
revoke all on function public.obtener_reporte_trabajos_docente(uuid) from public, anon;
grant execute on function public.obtener_reporte_trabajos_docente(uuid) to authenticated;
