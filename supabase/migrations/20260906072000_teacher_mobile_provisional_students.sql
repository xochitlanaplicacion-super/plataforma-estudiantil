-- Alumnos provisionales para captura docente móvil. Ningún registro provisional
-- se mezcla con una inscripción oficial hasta una vinculación explícita.
set search_path = public, extensions;

create table public.alumnos_provisionales_docente (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ciclo_escolar_id uuid not null,
  grupo_id uuid not null,
  nombre text not null,
  apellidos text not null default '',
  estado text not null default 'pendiente',
  inscripcion_vinculada_id uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alumnos_provisionales_nombre_check check (
    btrim(nombre) <> '' and length(nombre) <= 120 and length(apellidos) <= 180
  ),
  constraint alumnos_provisionales_estado_check check (estado in ('pendiente','vinculado','cancelado')),
  constraint alumnos_provisionales_id_tenant_unique unique (id, tenant_id),
  constraint alumnos_provisionales_vinculo_check check (
    (estado = 'vinculado' and inscripcion_vinculada_id is not null)
    or (estado <> 'vinculado' and inscripcion_vinculada_id is null)
  ),
  constraint alumnos_provisionales_tenant_fkey foreign key (tenant_id)
    references public.tenants(id) on delete restrict,
  constraint alumnos_provisionales_ciclo_fkey foreign key (ciclo_escolar_id, tenant_id)
    references public.ciclos_escolares(id, tenant_id) on delete restrict,
  constraint alumnos_provisionales_grupo_fkey foreign key (grupo_id, tenant_id)
    references public.grupos(id, tenant_id) on delete restrict,
  constraint alumnos_provisionales_vinculo_fkey foreign key (inscripcion_vinculada_id, tenant_id, ciclo_escolar_id)
    references public.inscripciones_alumno(id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint alumnos_provisionales_creator_fkey foreign key (created_by, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict
);

create index alumnos_provisionales_group_pending_idx on public.alumnos_provisionales_docente
  (tenant_id, ciclo_escolar_id, grupo_id, apellidos, nombre) where estado = 'pendiente';

create table public.capturas_provisionales_docente (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  alumno_provisional_id uuid not null,
  ciclo_escolar_id uuid not null,
  asignacion_profesor_id uuid not null,
  periodo_evaluacion_id uuid not null,
  criterio_evaluacion_id uuid not null,
  subcriterio_evaluacion_id uuid,
  tipo_captura text not null,
  nombre_concepto text,
  tipo_concepto text,
  valor numeric(6,4) not null,
  observacion text,
  actor_id uuid not null,
  idempotency_key uuid not null,
  migrada_at timestamptz,
  created_at timestamptz not null default now(),
  constraint capturas_provisionales_tipo_check check (tipo_captura in ('calificacion','participacion')),
  constraint capturas_provisionales_valor_check check (
    (tipo_captura = 'calificacion' and valor between 0 and 10)
    or (tipo_captura = 'participacion' and valor > 0 and valor <= 5)
  ),
  constraint capturas_provisionales_concepto_check check (
    (tipo_captura = 'calificacion' and btrim(coalesce(nombre_concepto,'')) <> ''
      and tipo_concepto in ('examen','proyecto','tarea','trabajo_clase'))
    or (tipo_captura = 'participacion' and nombre_concepto is null and tipo_concepto is null)
  ),
  constraint capturas_provisionales_observacion_check check (length(coalesce(observacion,'')) <= 1000),
  constraint capturas_provisionales_idempotency_unique unique (tenant_id, actor_id, idempotency_key),
  constraint capturas_provisionales_student_fkey foreign key (alumno_provisional_id, tenant_id)
    references public.alumnos_provisionales_docente(id, tenant_id) on delete restrict,
  constraint capturas_provisionales_assignment_fkey foreign key (asignacion_profesor_id, tenant_id, ciclo_escolar_id)
    references public.asignaciones_profesor(id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint capturas_provisionales_period_fkey foreign key (periodo_evaluacion_id, tenant_id, ciclo_escolar_id)
    references public.periodos_evaluacion(id, tenant_id, ciclo_escolar_id) on delete restrict,
  constraint capturas_provisionales_criterion_fkey foreign key (criterio_evaluacion_id, tenant_id)
    references public.criterios_evaluacion(id, tenant_id) on delete restrict,
  constraint capturas_provisionales_subcriterion_fkey foreign key (subcriterio_evaluacion_id, tenant_id)
    references public.subcriterios_evaluacion(id, tenant_id) on delete restrict,
  constraint capturas_provisionales_actor_fkey foreign key (actor_id, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict
);

create index capturas_provisionales_student_idx on public.capturas_provisionales_docente
  (tenant_id, alumno_provisional_id, created_at) where migrada_at is null;

alter table public.alumnos_provisionales_docente enable row level security;
alter table public.alumnos_provisionales_docente force row level security;
alter table public.capturas_provisionales_docente enable row level security;
alter table public.capturas_provisionales_docente force row level security;

create policy provisional_students_tenant_boundary on public.alumnos_provisionales_docente
  as restrictive for all to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)))
  with check ((select private.has_active_tenant_membership(tenant_id)));
create policy provisional_students_staff_select on public.alumnos_provisionales_docente
  for select to authenticated using (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])) or exists (
      select 1 from public.asignaciones_profesor a
      where a.tenant_id = alumnos_provisionales_docente.tenant_id
        and a.ciclo_escolar_id = alumnos_provisionales_docente.ciclo_escolar_id
        and a.grupo_id = alumnos_provisionales_docente.grupo_id
        and a.profesor_id = (select auth.uid()) and a.activo
    )
  );
create policy provisional_captures_tenant_boundary on public.capturas_provisionales_docente
  as restrictive for select to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)));
create policy provisional_captures_staff_select on public.capturas_provisionales_docente
  for select to authenticated using (
    (select private.has_tenant_role(tenant_id, array['superuser','admin']::text[]))
      or actor_id = (select auth.uid())
  );

revoke all on public.alumnos_provisionales_docente, public.capturas_provisionales_docente
  from public, anon, authenticated;
grant select on public.alumnos_provisionales_docente, public.capturas_provisionales_docente to authenticated;
grant all on public.alumnos_provisionales_docente, public.capturas_provisionales_docente to service_role;

create or replace function public.obtener_alumnos_provisionales_docente_movil()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provisionalId', p.id,
    'assignmentId', a.id,
    'name', concat_ws(' ', p.nombre, p.apellidos),
    'createdAt', p.created_at
  ) order by p.apellidos, p.nombre), '[]'::jsonb)
  from public.alumnos_provisionales_docente p
  join public.ciclos_escolares c on c.id = p.ciclo_escolar_id and c.tenant_id = p.tenant_id and c.estado = 'activo'
  join public.asignaciones_profesor a on a.tenant_id = p.tenant_id and a.ciclo_escolar_id = p.ciclo_escolar_id
    and a.grupo_id = p.grupo_id and a.profesor_id = (select auth.uid()) and a.activo
  where p.estado = 'pendiente';
$$;

create or replace function public.crear_alumno_provisional_docente_movil(
  p_asignacion_id uuid, p_nombre text, p_apellidos text,
  p_expected_cycle_id uuid, p_expected_period_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; group_id uuid; period_id uuid;
  provisional public.alumnos_provisionales_docente%rowtype;
begin
  if actor is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  if btrim(coalesce(p_nombre,'')) = '' or length(btrim(p_nombre)) > 120 or length(btrim(coalesce(p_apellidos,''))) > 180 then
    raise exception using errcode='PT422',message='MOBILE_PROVISIONAL_NAME_INVALID';
  end if;
  select a.tenant_id,a.ciclo_escolar_id,a.grupo_id into tenant,cycle_id,group_id
  from public.asignaciones_profesor a join public.ciclos_escolares c
    on c.id=a.ciclo_escolar_id and c.tenant_id=a.tenant_id and c.estado='activo'
  where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  select p.id into period_id from public.periodos_evaluacion p
  where p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.estado='activo';
  if tenant is null then raise exception using errcode='PT403',message='MOBILE_ASSIGNMENT_FORBIDDEN'; end if;
  if cycle_id is distinct from p_expected_cycle_id or period_id is distinct from p_expected_period_id then
    raise exception using errcode='PT409',message='MOBILE_ACADEMIC_CONTEXT_CHANGED';
  end if;
  insert into public.alumnos_provisionales_docente(
    tenant_id,ciclo_escolar_id,grupo_id,nombre,apellidos,created_by
  ) values (
    tenant,cycle_id,group_id,btrim(p_nombre),btrim(coalesce(p_apellidos,'')),actor
  ) returning * into provisional;
  insert into public.auditoria(tenant_id,user_id,accion,entidad,entidad_id,detalles)
  values(tenant,actor,'academic.mobile.provisional.created','alumnos_provisionales_docente',provisional.id,
    jsonb_build_object('assignmentId',p_asignacion_id,'name',concat_ws(' ',provisional.nombre,provisional.apellidos)));
  return jsonb_build_object('provisionalId',provisional.id,'assignmentId',p_asignacion_id,
    'name',concat_ws(' ',provisional.nombre,provisional.apellidos),'createdAt',provisional.created_at);
end $$;

create or replace function public.registrar_captura_provisional_docente_movil(
  p_alumno_provisional_id uuid, p_asignacion_id uuid, p_criterio_id uuid, p_subcriterio_id uuid,
  p_tipo_captura text, p_valor numeric, p_nombre_concepto text, p_tipo_concepto text,
  p_observacion text, p_idempotency_key uuid, p_expected_cycle_id uuid, p_expected_period_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); tenant uuid; cycle_id uuid; group_id uuid; period_id uuid;
  criterion_type text; existing public.capturas_provisionales_docente%rowtype;
begin
  if actor is null then raise exception using errcode='PT401',message='MOBILE_UNAUTHENTICATED'; end if;
  select a.tenant_id,a.ciclo_escolar_id,a.grupo_id into tenant,cycle_id,group_id
  from public.asignaciones_profesor a join public.ciclos_escolares c
    on c.id=a.ciclo_escolar_id and c.tenant_id=a.tenant_id and c.estado='activo'
  where a.id=p_asignacion_id and a.profesor_id=actor and a.activo;
  select p.id into period_id from public.periodos_evaluacion p
  where p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.estado='activo';
  if tenant is null then raise exception using errcode='PT403',message='MOBILE_ASSIGNMENT_FORBIDDEN'; end if;
  if cycle_id is distinct from p_expected_cycle_id or period_id is distinct from p_expected_period_id then
    raise exception using errcode='PT409',message='MOBILE_ACADEMIC_CONTEXT_CHANGED';
  end if;
  if not exists(select 1 from public.alumnos_provisionales_docente p where p.id=p_alumno_provisional_id
    and p.tenant_id=tenant and p.ciclo_escolar_id=cycle_id and p.grupo_id=group_id and p.estado='pendiente') then
    raise exception using errcode='PT404',message='MOBILE_PROVISIONAL_NOT_AVAILABLE';
  end if;
  select coalesce(s.tipo,c.tipo) into criterion_type
  from public.esquemas_evaluacion e join public.criterios_evaluacion c
    on c.esquema_evaluacion_id=e.id and c.tenant_id=e.tenant_id and c.activo
  left join public.subcriterios_evaluacion s on s.id=p_subcriterio_id and s.tenant_id=c.tenant_id
    and s.criterio_evaluacion_id=c.id and s.activo
  where e.tenant_id=tenant and e.asignacion_profesor_id=p_asignacion_id
    and e.periodo_evaluacion_id=period_id and e.estado='activo' and c.id=p_criterio_id;
  if criterion_type is null
    or (p_tipo_captura='calificacion' and criterion_type<>'directo')
    or (p_tipo_captura='participacion' and criterion_type<>'participacion') then
    raise exception using errcode='PT422',message='MOBILE_PROVISIONAL_CRITERION_INVALID';
  end if;
  if p_idempotency_key is null
    or (p_tipo_captura='calificacion' and (p_valor not between 0 and 10
      or btrim(coalesce(p_nombre_concepto,''))='' or p_tipo_concepto not in ('examen','proyecto','tarea','trabajo_clase')))
    or (p_tipo_captura='participacion' and (p_valor<=0 or p_valor>5))
    or p_tipo_captura not in ('calificacion','participacion') then
    raise exception using errcode='PT422',message='MOBILE_PROVISIONAL_CAPTURE_INVALID';
  end if;
  select * into existing from public.capturas_provisionales_docente c
  where c.tenant_id=tenant and c.actor_id=actor and c.idempotency_key=p_idempotency_key;
  if existing.id is not null then
    if existing.alumno_provisional_id<>p_alumno_provisional_id or existing.valor<>p_valor
      or existing.tipo_captura<>p_tipo_captura then
      raise exception using errcode='PT409',message='MOBILE_IDEMPOTENCY_MISMATCH';
    end if;
    return jsonb_build_object('operationId',existing.id,'replayed',true,'syncedAt',existing.created_at);
  end if;
  insert into public.capturas_provisionales_docente(tenant_id,alumno_provisional_id,ciclo_escolar_id,
    asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,subcriterio_evaluacion_id,
    tipo_captura,nombre_concepto,tipo_concepto,valor,observacion,actor_id,idempotency_key)
  values(tenant,p_alumno_provisional_id,cycle_id,p_asignacion_id,period_id,p_criterio_id,p_subcriterio_id,
    p_tipo_captura,case when p_tipo_captura='calificacion' then btrim(p_nombre_concepto) end,
    case when p_tipo_captura='calificacion' then p_tipo_concepto end,p_valor,nullif(btrim(p_observacion),''),actor,p_idempotency_key)
  returning * into existing;
  return jsonb_build_object('operationId',existing.id,'replayed',false,'syncedAt',existing.created_at);
end $$;

revoke all on function public.obtener_alumnos_provisionales_docente_movil(),
  public.crear_alumno_provisional_docente_movil(uuid,text,text,uuid,uuid),
  public.registrar_captura_provisional_docente_movil(uuid,uuid,uuid,uuid,text,numeric,text,text,text,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.obtener_alumnos_provisionales_docente_movil(),
  public.crear_alumno_provisional_docente_movil(uuid,text,text,uuid,uuid),
  public.registrar_captura_provisional_docente_movil(uuid,uuid,uuid,uuid,text,numeric,text,text,text,uuid,uuid,uuid)
  to authenticated,service_role;
