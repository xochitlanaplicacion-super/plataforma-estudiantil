-- Vinculación explícita y transaccional de capturas provisionales a la
-- inscripción oficial elegida por personal autorizado.
set search_path = public, extensions;

create or replace function public.obtener_vinculaciones_provisionales_docente(p_asignacion_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; group_id uuid; result jsonb;
begin
  select a.tenant_id,a.ciclo_escolar_id,a.grupo_id into tenant,cycle_id,group_id
  from public.asignaciones_profesor a join public.ciclos_escolares c
    on c.id=a.ciclo_escolar_id and c.tenant_id=a.tenant_id and c.estado='activo'
  where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  if tenant is null then raise exception using errcode='PT403',message='MOBILE_ASSIGNMENT_FORBIDDEN'; end if;
  select jsonb_build_object(
    'provisionals',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',concat_ws(' ',p.nombre,p.apellidos),'createdAt',p.created_at,
      'captureCount',(select count(*) from public.capturas_provisionales_docente cp
        where cp.tenant_id=tenant and cp.alumno_provisional_id=p.id and cp.migrada_at is null)
    ) order by p.apellidos,p.nombre) from public.alumnos_provisionales_docente p
      where p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.grupo_id=group_id and p.estado='pendiente'),'[]'::jsonb),
    'candidates',coalesce((select jsonb_agg(jsonb_build_object(
      'enrollmentId',i.id,'name',concat_ws(' ',pr.nombre,pr.apellidos),'enrollmentCode',pr.matricula
    ) order by pr.apellidos,pr.nombre) from public.inscripciones_alumno i join public.profiles pr
      on pr.id=i.alumno_id and pr.tenant_id=i.tenant_id
      where i.tenant_id=tenant and i.ciclo_escolar_id=cycle_id and i.grupo_id=group_id and i.activo),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.vincular_alumno_provisional_docente(
  p_alumno_provisional_id uuid, p_inscripcion_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); provisional public.alumnos_provisionales_docente%rowtype;
  enrollment public.inscripciones_alumno%rowtype; capture public.capturas_provisionales_docente%rowtype;
  concept_id uuid; student_id uuid; event_mode text; event_config jsonb; migrated_count integer := 0;
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
  student_id := enrollment.alumno_id;

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
        alumno_id,puntos,modo_normalizacion,meta_objetivo,regla_denominador_cero,observacion,actor_id,idempotency_key)
      values(capture.tenant_id,capture.ciclo_escolar_id,capture.asignacion_profesor_id,
        capture.periodo_evaluacion_id,capture.criterio_evaluacion_id,capture.subcriterio_evaluacion_id,
        enrollment.id,student_id,capture.valor,coalesce(event_config->>'modo','maximo_grupo'),
        case when event_config->>'modo'='meta_fija' then (event_config->>'meta')::numeric end,
        'cero',capture.observacion,capture.actor_id,capture.idempotency_key)
      on conflict (tenant_id,idempotency_key) do nothing;
    end if;
    update public.capturas_provisionales_docente set migrada_at=now() where id=capture.id;
    migrated_count := migrated_count + 1;
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

  update public.alumnos_provisionales_docente set estado='vinculado',inscripcion_vinculada_id=enrollment.id,
    updated_at=now() where id=provisional.id;
  insert into public.auditoria(tenant_id,user_id,accion,entidad,entidad_id,detalles)
  values(provisional.tenant_id,actor,'academic.mobile.provisional.linked','alumnos_provisionales_docente',provisional.id,
    jsonb_build_object('enrollmentId',enrollment.id,'studentId',student_id,'migratedCaptures',migrated_count));
  return jsonb_build_object('provisionalId',provisional.id,'enrollmentId',enrollment.id,
    'studentId',student_id,'migratedCaptures',migrated_count,'linkedAt',now());
end $$;

revoke all on function public.obtener_vinculaciones_provisionales_docente(uuid),
  public.vincular_alumno_provisional_docente(uuid,uuid) from public,anon,authenticated;
grant execute on function public.obtener_vinculaciones_provisionales_docente(uuid),
  public.vincular_alumno_provisional_docente(uuid,uuid) to authenticated,service_role;
