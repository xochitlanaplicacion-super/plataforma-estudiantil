-- Captura docente móvil local-first. El servidor determina siempre el ciclo y
-- periodo activos; ningún cliente puede escoger o suplantar ese alcance.
set search_path = public, extensions;

create table public.conceptos_evaluacion_docente (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ciclo_escolar_id uuid not null,
  asignacion_profesor_id uuid not null,
  periodo_evaluacion_id uuid not null,
  criterio_evaluacion_id uuid not null,
  subcriterio_evaluacion_id uuid,
  nombre text not null,
  tipo text not null,
  activo boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conceptos_docente_nombre_check check (btrim(nombre) <> '' and length(nombre) <= 160),
  constraint conceptos_docente_tipo_check check (tipo in ('examen','proyecto','tarea','trabajo_clase')),
  constraint conceptos_docente_id_tenant_unique unique (id, tenant_id),
  constraint conceptos_docente_assignment_fkey foreign key (asignacion_profesor_id, tenant_id, ciclo_escolar_id)
    references public.asignaciones_profesor (id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint conceptos_docente_period_fkey foreign key (periodo_evaluacion_id, tenant_id, ciclo_escolar_id)
    references public.periodos_evaluacion (id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint conceptos_docente_criterion_fkey foreign key (criterio_evaluacion_id, tenant_id)
    references public.criterios_evaluacion (id, tenant_id) on delete restrict,
  constraint conceptos_docente_subcriterion_fkey foreign key (subcriterio_evaluacion_id, tenant_id)
    references public.subcriterios_evaluacion (id, tenant_id) on delete restrict,
  constraint conceptos_docente_creator_fkey foreign key (created_by, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict
);
create unique index conceptos_docente_scope_name_unique_idx on public.conceptos_evaluacion_docente
  (tenant_id, asignacion_profesor_id, periodo_evaluacion_id, criterio_evaluacion_id,
   coalesce(subcriterio_evaluacion_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nombre));
create index conceptos_docente_scope_recent_idx on public.conceptos_evaluacion_docente
  (tenant_id, asignacion_profesor_id, periodo_evaluacion_id, created_at desc);

create table public.calificaciones_concepto_docente (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ciclo_escolar_id uuid not null,
  concepto_id uuid not null,
  inscripcion_alumno_id uuid not null,
  alumno_id uuid not null,
  calificacion numeric(6,4) not null,
  observacion text,
  actor_id uuid not null,
  idempotency_key uuid not null,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calificaciones_concepto_0_10 check (calificacion between 0 and 10),
  constraint calificaciones_concepto_observacion_check check (length(coalesce(observacion, '')) <= 1000),
  constraint calificaciones_concepto_row_version_check check (row_version > 0),
  constraint calificaciones_concepto_unique unique (tenant_id, concepto_id, inscripcion_alumno_id),
  constraint calificaciones_concepto_idempotency_unique unique (tenant_id, actor_id, idempotency_key),
  constraint calificaciones_concepto_concept_fkey foreign key (concepto_id, tenant_id)
    references public.conceptos_evaluacion_docente (id, tenant_id) on delete restrict,
  constraint calificaciones_concepto_enrollment_fkey foreign key (inscripcion_alumno_id, tenant_id, ciclo_escolar_id)
    references public.inscripciones_alumno (id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint calificaciones_concepto_student_fkey foreign key (alumno_id, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict,
  constraint calificaciones_concepto_actor_fkey foreign key (actor_id, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict
);
create index calificaciones_concepto_student_idx on public.calificaciones_concepto_docente
  (tenant_id, inscripcion_alumno_id, concepto_id);

create table public.configuracion_captura_docente (
  tenant_id uuid not null,
  profesor_id uuid not null,
  criterio_evaluacion_id uuid not null,
  calificacion_minima smallint not null default 5,
  incremento numeric(3,2) not null default 1,
  lector_qr boolean not null default false,
  confirmar_antes_guardar boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, profesor_id, criterio_evaluacion_id),
  constraint configuracion_captura_min_check check (calificacion_minima between 0 and 10),
  constraint configuracion_captura_increment_check check (incremento in (0.10, 0.50, 1.00)),
  constraint configuracion_captura_professor_fkey foreign key (profesor_id, tenant_id)
    references public.profiles (id, tenant_id) on delete cascade,
  constraint configuracion_captura_criterion_fkey foreign key (criterio_evaluacion_id, tenant_id)
    references public.criterios_evaluacion (id, tenant_id) on delete cascade
);

create table public.identificadores_qr_inscripcion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  inscripcion_alumno_id uuid not null,
  token uuid not null default gen_random_uuid(),
  activo boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint qr_inscripcion_token_unique unique (token),
  constraint qr_inscripcion_id_tenant_unique unique (id, tenant_id),
  constraint qr_inscripcion_enrollment_fkey foreign key (inscripcion_alumno_id, tenant_id)
    references public.inscripciones_alumno (id, tenant_id) on delete cascade,
  constraint qr_inscripcion_creator_fkey foreign key (created_by, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict,
  constraint qr_inscripcion_state_check check ((activo and revoked_at is null) or (not activo and revoked_at is not null))
);
create unique index qr_inscripcion_active_unique_idx on public.identificadores_qr_inscripcion
  (tenant_id, inscripcion_alumno_id) where activo;

alter table public.conceptos_evaluacion_docente enable row level security;
alter table public.conceptos_evaluacion_docente force row level security;
alter table public.calificaciones_concepto_docente enable row level security;
alter table public.calificaciones_concepto_docente force row level security;
alter table public.configuracion_captura_docente enable row level security;
alter table public.configuracion_captura_docente force row level security;
alter table public.identificadores_qr_inscripcion enable row level security;
alter table public.identificadores_qr_inscripcion force row level security;

create policy mobile_concepts_tenant_boundary on public.conceptos_evaluacion_docente as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id))) with check ((select private.has_active_tenant_membership(tenant_id)));
create policy mobile_concepts_teacher on public.conceptos_evaluacion_docente for all to authenticated
  using (created_by = (select auth.uid()) and (select private.can_manage_teaching_assignment(tenant_id, asignacion_profesor_id)))
  with check (created_by = (select auth.uid()) and (select private.can_manage_teaching_assignment(tenant_id, asignacion_profesor_id)));
create policy mobile_grades_tenant_boundary on public.calificaciones_concepto_docente as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id))) with check ((select private.has_active_tenant_membership(tenant_id)));
create policy mobile_grades_teacher_select on public.calificaciones_concepto_docente for select to authenticated
  using (actor_id = (select auth.uid()));
create policy mobile_settings_tenant_boundary on public.configuracion_captura_docente as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id))) with check ((select private.has_active_tenant_membership(tenant_id)));
create policy mobile_settings_teacher on public.configuracion_captura_docente for all to authenticated
  using (profesor_id = (select auth.uid()) and exists (
    select 1
    from public.criterios_evaluacion criterion
    join public.esquemas_evaluacion scheme
      on scheme.id = criterion.esquema_evaluacion_id
     and scheme.tenant_id = criterion.tenant_id
    join public.asignaciones_profesor assignment
      on assignment.id = scheme.asignacion_profesor_id
     and assignment.tenant_id = scheme.tenant_id
    where criterion.id = configuracion_captura_docente.criterio_evaluacion_id
      and criterion.tenant_id = configuracion_captura_docente.tenant_id
      and assignment.profesor_id = (select auth.uid())
      and assignment.activo
  ))
  with check (profesor_id = (select auth.uid()) and exists (
    select 1
    from public.criterios_evaluacion criterion
    join public.esquemas_evaluacion scheme
      on scheme.id = criterion.esquema_evaluacion_id
     and scheme.tenant_id = criterion.tenant_id
    join public.asignaciones_profesor assignment
      on assignment.id = scheme.asignacion_profesor_id
     and assignment.tenant_id = scheme.tenant_id
    where criterion.id = configuracion_captura_docente.criterio_evaluacion_id
      and criterion.tenant_id = configuracion_captura_docente.tenant_id
      and assignment.profesor_id = (select auth.uid())
      and assignment.activo
  ));
create policy mobile_qr_tenant_boundary on public.identificadores_qr_inscripcion as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id))) with check ((select private.has_active_tenant_membership(tenant_id)));
create policy mobile_qr_teacher_select on public.identificadores_qr_inscripcion for select to authenticated
  using (exists (select 1 from public.inscripciones_alumno i join public.asignaciones_profesor a
    on a.tenant_id = i.tenant_id and a.ciclo_escolar_id = i.ciclo_escolar_id and a.grupo_id = i.grupo_id
    where i.id = identificadores_qr_inscripcion.inscripcion_alumno_id
      and i.tenant_id = identificadores_qr_inscripcion.tenant_id
      and a.profesor_id = (select auth.uid()) and a.activo));

revoke all on public.conceptos_evaluacion_docente, public.calificaciones_concepto_docente,
  public.configuracion_captura_docente, public.identificadores_qr_inscripcion from public, anon, authenticated;
grant select, insert, update on public.conceptos_evaluacion_docente, public.configuracion_captura_docente to authenticated;
grant select on public.calificaciones_concepto_docente, public.identificadores_qr_inscripcion to authenticated;
grant all on public.conceptos_evaluacion_docente, public.calificaciones_concepto_docente,
  public.configuracion_captura_docente, public.identificadores_qr_inscripcion to service_role;

create or replace function public.obtener_contexto_docente_movil()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_row public.ciclos_escolares%rowtype;
  period_row public.periodos_evaluacion%rowtype; result jsonb;
begin
  if actor is null then raise exception using errcode='PT401', message='MOBILE_UNAUTHENTICATED'; end if;
  select p.tenant_id into tenant from public.profiles p join public.tenants t on t.id=p.tenant_id and t.estado='activo'
    where p.id=actor and p.rol='profesor' and coalesce(p.estatus,'activo')='activo';
  if tenant is null then raise exception using errcode='PT403', message='MOBILE_TEACHER_REQUIRED'; end if;
  select * into cycle_row from public.ciclos_escolares c where c.tenant_id=tenant and c.estado='activo';
  if cycle_row.id is null then raise exception using errcode='PT409', message='MOBILE_ACTIVE_CYCLE_REQUIRED'; end if;
  select * into period_row from public.periodos_evaluacion p where p.tenant_id=tenant and p.ciclo_escolar_id=cycle_row.id and p.estado='activo';
  if period_row.id is null then raise exception using errcode='PT409', message='MOBILE_ACTIVE_PERIOD_REQUIRED'; end if;
  select jsonb_build_object(
    'tenant', jsonb_build_object('id',t.id,'name',coalesce(cs.nombre_corto,t.nombre),'logoUrl',cs.logo_url,
      'primaryColor',coalesce(cs.color_primario,'#00b894'),'secondaryColor',coalesce(cs.color_secundario,'#073b6f')),
    'teacher',jsonb_build_object('id',pr.id,'name',concat_ws(' ',pr.nombre,pr.apellidos)),
    'cycle',jsonb_build_object('id',cycle_row.id,'name',cycle_row.nombre),
    'period',jsonb_build_object('id',period_row.id,'name',period_row.nombre),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'subjectName',m.nombre,'groupName',g.nombre,
      'criteria',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.nombre,'type',c.tipo,
        'captureSettings',jsonb_build_object(
          'minimumGrade',coalesce(settings.calificacion_minima,5),
          'increment',coalesce(settings.incremento,1),
          'qrReader',coalesce(settings.lector_qr,false),
          'confirmBeforeSave',coalesce(settings.confirmar_antes_guardar,false)),
        'subcriteria',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.nombre,'type',s.tipo,'configuration',s.configuracion) order by s.orden)
          from public.subcriterios_evaluacion s where s.tenant_id=tenant and s.criterio_evaluacion_id=c.id and s.activo),'[]'::jsonb)) order by c.orden)
        from public.esquemas_evaluacion e join public.criterios_evaluacion c on c.esquema_evaluacion_id=e.id and c.tenant_id=e.tenant_id and c.activo
        left join public.configuracion_captura_docente settings
          on settings.tenant_id=c.tenant_id and settings.profesor_id=actor and settings.criterio_evaluacion_id=c.id
        where e.tenant_id=tenant and e.asignacion_profesor_id=a.id and e.periodo_evaluacion_id=period_row.id and e.estado='activo'),'[]'::jsonb),
      'students',coalesce((select jsonb_agg(jsonb_build_object('enrollmentId',i.id,'studentId',p.id,'name',concat_ws(' ',p.nombre,p.apellidos),'enrollmentCode',p.matricula) order by p.apellidos,p.nombre)
        from public.inscripciones_alumno i join public.profiles p on p.id=i.alumno_id and p.tenant_id=i.tenant_id
        where i.tenant_id=tenant and i.ciclo_escolar_id=cycle_row.id and i.grupo_id=a.grupo_id and i.activo),'[]'::jsonb)) order by m.nombre,g.nombre)
      from public.asignaciones_profesor a join public.materias m on m.id=a.materia_id and m.tenant_id=a.tenant_id
      join public.grupos g on g.id=a.grupo_id and g.tenant_id=a.tenant_id
      where a.tenant_id=tenant and a.profesor_id=actor and a.ciclo_escolar_id=cycle_row.id and a.activo),'[]'::jsonb)
  ) into result from public.tenants t join public.profiles pr on pr.id=actor and pr.tenant_id=t.id
    left join public.configuracion_sistema cs on cs.tenant_id=t.id where t.id=tenant;
  return result;
end $$;
revoke all on function public.obtener_contexto_docente_movil() from public, anon, authenticated;
grant execute on function public.obtener_contexto_docente_movil() to authenticated, service_role;

comment on function public.obtener_contexto_docente_movil() is
  'Devuelve sólo el ciclo y periodo activos del tenant; el cliente móvil no los selecciona.';

create or replace function public.crear_concepto_docente_movil(
  p_asignacion_id uuid, p_criterio_id uuid, p_subcriterio_id uuid,
  p_nombre text, p_tipo text, p_expected_cycle_id uuid, p_expected_period_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; period_id uuid; concept public.conceptos_evaluacion_docente%rowtype;
begin
  if actor is null then raise exception using errcode='PT401', message='MOBILE_UNAUTHENTICATED'; end if;
  if nullif(btrim(p_nombre),'') is null or length(btrim(p_nombre)) > 160
     or p_tipo not in ('examen','proyecto','tarea','trabajo_clase') then
    raise exception using errcode='PT422', message='MOBILE_CONCEPT_INVALID';
  end if;
  select a.tenant_id,a.ciclo_escolar_id into tenant,cycle_id from public.asignaciones_profesor a
    join public.ciclos_escolares cy on cy.id=a.ciclo_escolar_id and cy.tenant_id=a.tenant_id and cy.estado='activo'
    where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  select p.id into period_id from public.periodos_evaluacion p where p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.estado='activo';
  if period_id is null then raise exception using errcode='PT409', message='MOBILE_ACTIVE_PERIOD_REQUIRED'; end if;
  if cycle_id is distinct from p_expected_cycle_id or period_id is distinct from p_expected_period_id then
    raise exception using errcode='PT409', message='MOBILE_ACADEMIC_CONTEXT_CHANGED';
  end if;
  if not exists (select 1 from public.esquemas_evaluacion e join public.criterios_evaluacion c
    on c.esquema_evaluacion_id=e.id and c.tenant_id=e.tenant_id and c.activo
    where e.tenant_id=tenant and e.asignacion_profesor_id=p_asignacion_id and e.periodo_evaluacion_id=period_id
      and e.estado='activo' and c.id=p_criterio_id and c.tipo in ('directo','hibrido')
      and (p_subcriterio_id is null or exists (select 1 from public.subcriterios_evaluacion s
        where s.id=p_subcriterio_id and s.tenant_id=tenant and s.criterio_evaluacion_id=c.id and s.activo and s.tipo='directo'))
  ) then raise exception using errcode='PT422', message='MOBILE_DIRECT_CRITERION_REQUIRED'; end if;
  insert into public.conceptos_evaluacion_docente(tenant_id,ciclo_escolar_id,asignacion_profesor_id,
    periodo_evaluacion_id,criterio_evaluacion_id,subcriterio_evaluacion_id,nombre,tipo,created_by)
  values(tenant,cycle_id,p_asignacion_id,period_id,p_criterio_id,p_subcriterio_id,btrim(p_nombre),p_tipo,actor)
  on conflict (tenant_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,
    coalesce(subcriterio_evaluacion_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(nombre))
  do update set activo=true,updated_at=now() returning * into concept;
  return jsonb_build_object('id',concept.id,'name',concept.nombre,'createdAt',concept.created_at);
end $$;

create or replace function public.registrar_calificacion_docente_movil(
  p_concepto_id uuid, p_inscripcion_id uuid, p_calificacion numeric,
  p_observacion text, p_idempotency_key uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); concept public.conceptos_evaluacion_docente%rowtype;
  student uuid; captured public.calificaciones_concepto_docente%rowtype; average_grade numeric(6,4); direct public.calificaciones_directas%rowtype;
begin
  if actor is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  if p_idempotency_key is null or p_calificacion not between 0 and 10 or length(coalesce(p_observacion,'')) > 1000 then
    raise exception using errcode='PT422',message='MOBILE_GRADE_INVALID'; end if;
  select c.* into concept from public.conceptos_evaluacion_docente c
    join public.ciclos_escolares cy on cy.id=c.ciclo_escolar_id and cy.tenant_id=c.tenant_id and cy.estado='activo'
    join public.periodos_evaluacion p on p.id=c.periodo_evaluacion_id and p.tenant_id=c.tenant_id and p.estado='activo'
    join public.asignaciones_profesor a on a.id=c.asignacion_profesor_id and a.tenant_id=c.tenant_id and a.profesor_id=actor and a.activo
    where c.id=p_concepto_id and c.activo;
  if concept.id is null then raise exception using errcode='PT404',message='MOBILE_CONCEPT_NOT_AVAILABLE'; end if;
  select g.* into captured
  from public.calificaciones_concepto_docente g
  where g.tenant_id=concept.tenant_id and g.actor_id=actor and g.idempotency_key=p_idempotency_key;
  if captured.id is not null then
    if captured.concepto_id<>p_concepto_id or captured.inscripcion_alumno_id<>p_inscripcion_id
       or captured.calificacion<>p_calificacion or captured.observacion is distinct from nullif(btrim(p_observacion),'') then
      raise exception using errcode='PT409',message='MOBILE_IDEMPOTENCY_MISMATCH';
    end if;
    return jsonb_build_object('operationId',captured.id,'rowVersion',captured.row_version,
      'replayed',true,'syncedAt',captured.updated_at);
  end if;
  select i.alumno_id into student from public.inscripciones_alumno i join public.asignaciones_profesor a
    on a.tenant_id=i.tenant_id and a.ciclo_escolar_id=i.ciclo_escolar_id and a.grupo_id=i.grupo_id
    where i.id=p_inscripcion_id and i.tenant_id=concept.tenant_id and i.activo and a.id=concept.asignacion_profesor_id;
  if student is null then raise exception using errcode='PT404',message='MOBILE_ENROLLMENT_NOT_AVAILABLE'; end if;
  insert into public.calificaciones_concepto_docente(tenant_id,ciclo_escolar_id,concepto_id,inscripcion_alumno_id,
    alumno_id,calificacion,observacion,actor_id,idempotency_key)
  values(concept.tenant_id,concept.ciclo_escolar_id,concept.id,p_inscripcion_id,student,p_calificacion,nullif(btrim(p_observacion),''),actor,p_idempotency_key)
  on conflict (tenant_id,concepto_id,inscripcion_alumno_id) do update set
    calificacion=excluded.calificacion,observacion=excluded.observacion,actor_id=excluded.actor_id,
    idempotency_key=excluded.idempotency_key,row_version=public.calificaciones_concepto_docente.row_version+1,updated_at=now()
  returning * into captured;
  select round(avg(g.calificacion),4) into average_grade from public.calificaciones_concepto_docente g
    join public.conceptos_evaluacion_docente c on c.id=g.concepto_id and c.tenant_id=g.tenant_id and c.activo
    where g.tenant_id=concept.tenant_id and g.inscripcion_alumno_id=p_inscripcion_id
      and c.asignacion_profesor_id=concept.asignacion_profesor_id and c.periodo_evaluacion_id=concept.periodo_evaluacion_id
      and c.criterio_evaluacion_id=concept.criterio_evaluacion_id
      and c.subcriterio_evaluacion_id is not distinct from concept.subcriterio_evaluacion_id;
  insert into public.calificaciones_directas(tenant_id,ciclo_escolar_id,asignacion_profesor_id,
    periodo_evaluacion_id,criterio_evaluacion_id,subcriterio_evaluacion_id,inscripcion_alumno_id,
    alumno_id,estado,calificacion,observacion,calificado_por,calificado_at)
  values(concept.tenant_id,concept.ciclo_escolar_id,concept.asignacion_profesor_id,concept.periodo_evaluacion_id,
    concept.criterio_evaluacion_id,concept.subcriterio_evaluacion_id,p_inscripcion_id,student,'calificado',average_grade,
    'Promedio de capturas móviles',actor,now())
  on conflict (tenant_id,inscripcion_alumno_id,criterio_evaluacion_id,
    coalesce(subcriterio_evaluacion_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update set
    estado='calificado',calificacion=excluded.calificacion,observacion=excluded.observacion,
    calificado_por=actor,calificado_at=now()
  returning * into direct;
  insert into public.auditoria(tenant_id,user_id,accion,entidad,entidad_id,detalles)
    values(concept.tenant_id,actor,'academic.mobile.grade.saved','calificaciones_concepto_docente',captured.id,
      jsonb_build_object('assignmentId',concept.asignacion_profesor_id,'periodId',concept.periodo_evaluacion_id,
        'conceptId',concept.id,'enrollmentId',p_inscripcion_id,'grade',p_calificacion,'officialAverage',average_grade));
  return jsonb_build_object('operationId',captured.id,'rowVersion',captured.row_version,
    'officialSourceId',direct.id,'officialRowVersion',direct.row_version,'officialAverage',average_grade,'syncedAt',now());
end $$;

create or replace function public.registrar_participacion_docente_movil(
  p_asignacion_id uuid,p_criterio_id uuid,p_subcriterio_id uuid,p_inscripcion_id uuid,
  p_puntos numeric,p_observacion text,p_idempotency_key uuid,p_expected_cycle_id uuid,p_expected_period_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; period_id uuid; student uuid;
  mode text; config jsonb; event_id uuid;
begin
  if actor is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  if p_idempotency_key is null or p_puntos <= 0 or p_puntos > 5 then raise exception using errcode='PT422',message='MOBILE_POINTS_INVALID'; end if;
  select a.tenant_id,a.ciclo_escolar_id into tenant,cycle_id from public.asignaciones_profesor a
    join public.ciclos_escolares cy on cy.id=a.ciclo_escolar_id and cy.tenant_id=a.tenant_id and cy.estado='activo'
    where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  select p.id into period_id from public.periodos_evaluacion p where p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.estado='activo';
  if period_id is null then raise exception using errcode='PT409',message='MOBILE_ACTIVE_PERIOD_REQUIRED'; end if;
  if cycle_id is distinct from p_expected_cycle_id or period_id is distinct from p_expected_period_id then
    raise exception using errcode='PT409',message='MOBILE_ACADEMIC_CONTEXT_CHANGED';
  end if;
  select coalesce(s.tipo,c.tipo),coalesce(s.configuracion,'{}'::jsonb) into mode,config
    from public.esquemas_evaluacion e join public.criterios_evaluacion c on c.esquema_evaluacion_id=e.id and c.tenant_id=e.tenant_id and c.activo
    left join public.subcriterios_evaluacion s on s.id=p_subcriterio_id and s.tenant_id=c.tenant_id and s.criterio_evaluacion_id=c.id and s.activo
    where e.tenant_id=tenant and e.asignacion_profesor_id=p_asignacion_id and e.periodo_evaluacion_id=period_id and e.estado='activo' and c.id=p_criterio_id;
  if mode <> 'participacion' then raise exception using errcode='PT422',message='MOBILE_PARTICIPATION_CRITERION_REQUIRED'; end if;
  select i.alumno_id into student from public.inscripciones_alumno i join public.asignaciones_profesor a
    on a.tenant_id=i.tenant_id and a.ciclo_escolar_id=i.ciclo_escolar_id and a.grupo_id=i.grupo_id
    where i.id=p_inscripcion_id and i.tenant_id=tenant and i.activo and a.id=p_asignacion_id;
  if student is null then raise exception using errcode='PT404',message='MOBILE_ENROLLMENT_NOT_AVAILABLE'; end if;
  insert into public.eventos_participacion(tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,
    criterio_evaluacion_id,subcriterio_evaluacion_id,inscripcion_alumno_id,alumno_id,puntos,modo_normalizacion,
    meta_objetivo,regla_denominador_cero,observacion,actor_id,idempotency_key)
  values(tenant,cycle_id,p_asignacion_id,period_id,p_criterio_id,p_subcriterio_id,p_inscripcion_id,student,p_puntos,
    coalesce(config->>'modo','maximo_grupo'),case when config->>'modo'='meta_fija' then (config->>'meta')::numeric end,
    'cero',nullif(btrim(p_observacion),''),actor,p_idempotency_key)
  on conflict (tenant_id,idempotency_key) do nothing returning id into event_id;
  if event_id is null then
    select e.id into event_id from public.eventos_participacion e
    where e.tenant_id=tenant and e.idempotency_key=p_idempotency_key;
  end if;
  return jsonb_build_object('operationId',event_id,'syncedAt',now());
end $$;

revoke all on function public.crear_concepto_docente_movil(uuid,uuid,uuid,text,text,uuid,uuid),
  public.registrar_calificacion_docente_movil(uuid,uuid,numeric,text,uuid),
  public.registrar_participacion_docente_movil(uuid,uuid,uuid,uuid,numeric,text,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.crear_concepto_docente_movil(uuid,uuid,uuid,text,text,uuid,uuid),
  public.registrar_calificacion_docente_movil(uuid,uuid,numeric,text,uuid),
  public.registrar_participacion_docente_movil(uuid,uuid,uuid,uuid,numeric,text,uuid,uuid,uuid)
  to authenticated,service_role;

create or replace function public.obtener_qrs_docente_movil(p_asignacion_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; assignment_group uuid; result jsonb;
begin
  if actor is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  select a.tenant_id,a.ciclo_escolar_id,a.grupo_id into tenant,cycle_id,assignment_group
    from public.asignaciones_profesor a join public.ciclos_escolares c
      on c.id=a.ciclo_escolar_id and c.tenant_id=a.tenant_id and c.estado='activo'
    where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  if tenant is null then raise exception using errcode='PT403',message='MOBILE_ASSIGNMENT_FORBIDDEN'; end if;
  insert into public.identificadores_qr_inscripcion(tenant_id,inscripcion_alumno_id,created_by)
    select tenant,i.id,actor from public.inscripciones_alumno i
    where i.tenant_id=tenant and i.ciclo_escolar_id=cycle_id and i.grupo_id=assignment_group and i.activo
      and not exists(select 1 from public.identificadores_qr_inscripcion q where q.tenant_id=tenant and q.inscripcion_alumno_id=i.id and q.activo)
    on conflict do nothing;
  select coalesce(jsonb_agg(jsonb_build_object('enrollmentId',q.inscripcion_alumno_id,'token',q.token)),'[]'::jsonb)
    into result from public.identificadores_qr_inscripcion q join public.inscripciones_alumno i
      on i.id=q.inscripcion_alumno_id and i.tenant_id=q.tenant_id
    where q.tenant_id=tenant and q.activo and i.ciclo_escolar_id=cycle_id and i.grupo_id=assignment_group and i.activo;
  return result;
end $$;
revoke all on function public.obtener_qrs_docente_movil(uuid) from public,anon,authenticated;
grant execute on function public.obtener_qrs_docente_movil(uuid) to authenticated,service_role;
