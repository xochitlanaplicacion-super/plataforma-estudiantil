-- A platform-only category is a link target, not part of the 100% evaluation.
alter table public.criterios_evaluacion
  add constraint criterios_sistema_sin_peso_valido check (
    not es_sistema_sin_peso or (tipo = 'actividades' and peso = 0 and activo)
  );
create unique index criterios_sistema_sin_peso_por_esquema_idx
  on public.criterios_evaluacion (tenant_id, esquema_evaluacion_id)
  where es_sistema_sin_peso;

-- The published scheme's display policy is the only active field teachers may
-- update, and only through the authorized RPC below.
create or replace function private.validate_evaluation_scheme()
returns trigger language plpgsql set search_path = '' as $$
declare assignment_active boolean; period_state text;
begin
  if tg_op='INSERT' and new.copiado_desde_id is not null then
    select source.pendientes_vencidos_como_cero
      into new.pendientes_vencidos_como_cero
    from public.esquemas_evaluacion source
    where source.id=new.copiado_desde_id and source.tenant_id=new.tenant_id;
  end if;
  if tg_op = 'UPDATE' then
    if old.tenant_id is distinct from new.tenant_id
       or old.ciclo_escolar_id is distinct from new.ciclo_escolar_id
       or old.asignacion_profesor_id is distinct from new.asignacion_profesor_id
       or old.periodo_evaluacion_id is distinct from new.periodo_evaluacion_id
       or old.version is distinct from new.version
       or old.created_by is distinct from new.created_by
       or old.created_at is distinct from new.created_at then
      raise exception 'El contexto, version y creador del esquema son inmutables';
    end if;
    if old.estado = 'archivado' then
      raise exception 'Un esquema archivado es historico e inmutable';
    end if;
    if old.estado = 'activo' and (
      new.estado <> 'archivado'
      or old.nombre is distinct from new.nombre
      or old.calificacion_aprobatoria is distinct from new.calificacion_aprobatoria
      or old.decimales_mostrados is distinct from new.decimales_mostrados
      or old.modo_redondeo is distinct from new.modo_redondeo
      or old.regla_no_entrego is distinct from new.regla_no_entrego
      or old.valor_no_entrego is distinct from new.valor_no_entrego
      or old.regla_justificado is distinct from new.regla_justificado
    ) and not (
      old.estado = new.estado
      and current_user = 'postgres'
      and current_setting('kibo.allow_virtual_zero_policy', true) = 'on'
      and old.nombre is not distinct from new.nombre
      and old.calificacion_aprobatoria is not distinct from new.calificacion_aprobatoria
      and old.decimales_mostrados is not distinct from new.decimales_mostrados
      and old.modo_redondeo is not distinct from new.modo_redondeo
      and old.regla_no_entrego is not distinct from new.regla_no_entrego
      and old.valor_no_entrego is not distinct from new.valor_no_entrego
      and old.regla_justificado is not distinct from new.regla_justificado
    ) then
      raise exception 'Un esquema activo solo puede archivarse sin reescribir sus reglas';
    end if;
  end if;
  select a.activo into assignment_active from public.asignaciones_profesor a
  where a.id = new.asignacion_profesor_id and a.tenant_id = new.tenant_id
    and a.ciclo_escolar_id = new.ciclo_escolar_id;
  if not found or not assignment_active then
    raise exception 'La asignacion no pertenece al contexto o no esta activa';
  end if;
  select p.estado into period_state from public.periodos_evaluacion p
  where p.id = new.periodo_evaluacion_id and p.tenant_id = new.tenant_id
    and p.ciclo_escolar_id = new.ciclo_escolar_id;
  if not found then raise exception 'El periodo no pertenece al contexto'; end if;
  if period_state = 'cerrado' then
    raise exception 'No se puede crear ni editar un esquema de un periodo cerrado';
  end if;
  return new;
end $$;

create or replace function public.asegurar_categoria_plataforma_sin_peso(
  p_asignacion_id uuid, p_periodo_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
  scope public.asignaciones_profesor%rowtype;
  current_scheme public.esquemas_evaluacion%rowtype;
  category_id uuid; next_version integer; next_order smallint;
begin
  if actor is null then raise exception using errcode='PT401',message='ACADEMIC_UNAUTHENTICATED'; end if;
  select * into scope from public.asignaciones_profesor a
    where a.id=p_asignacion_id and a.activo for update;
  if scope.id is null or not (select private.can_manage_teaching_assignment(
    scope.tenant_id,p_asignacion_id)) then
    raise exception using errcode='PT403',message='ACADEMIC_ASSIGNMENT_FORBIDDEN';
  end if;
  if not exists (select 1 from public.periodos_evaluacion p
    where p.id=p_periodo_id and p.tenant_id=scope.tenant_id
      and p.ciclo_escolar_id=scope.ciclo_escolar_id and p.estado='activo') then
    raise exception using errcode='PT409',message='ACADEMIC_PERIOD_NOT_ACTIVE';
  end if;
  if exists (select 1 from public.cierres_calificaciones c
    where c.tenant_id=scope.tenant_id and c.asignacion_id=p_asignacion_id
      and c.periodo_id=p_periodo_id and c.estado='cerrado') then
    raise exception using errcode='PT409',message='ACADEMIC_SCOPE_CLOSED';
  end if;
  select * into current_scheme from public.esquemas_evaluacion e
    where e.tenant_id=scope.tenant_id
      and e.asignacion_profesor_id=p_asignacion_id
      and e.periodo_evaluacion_id=p_periodo_id and e.estado='activo'
    for update;
  if current_scheme.id is null then
    select coalesce(max(e.version),0)+1 into next_version
      from public.esquemas_evaluacion e where e.tenant_id=scope.tenant_id
        and e.asignacion_profesor_id=p_asignacion_id
        and e.periodo_evaluacion_id=p_periodo_id;
    insert into public.esquemas_evaluacion(
      tenant_id,ciclo_escolar_id,asignacion_profesor_id,
      periodo_evaluacion_id,nombre,estado,version,created_by
    ) values (
      scope.tenant_id,scope.ciclo_escolar_id,p_asignacion_id,
      p_periodo_id,'Plataforma sin ponderación','activo',next_version,actor
    ) returning * into current_scheme;
    perform set_config('kibo.allow_system_criterion_insert','on',true);
    insert into public.criterios_evaluacion(
      tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,activo,created_by
    ) values (
      scope.tenant_id,current_scheme.id,'Evaluación pendiente de configurar',
      'directo',100,1,true,actor
    );
  end if;
  select c.id into category_id from public.criterios_evaluacion c
    where c.tenant_id=scope.tenant_id
      and c.esquema_evaluacion_id=current_scheme.id
      and c.es_sistema_sin_peso for update;
  if category_id is null then
    select (coalesce(max(c.orden),0)+1)::smallint into next_order
    from public.criterios_evaluacion c
    where c.tenant_id=scope.tenant_id
      and c.esquema_evaluacion_id=current_scheme.id;
    perform set_config('kibo.allow_system_criterion_insert','on',true);
    insert into public.criterios_evaluacion(
      tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,
      activo,es_sistema_sin_peso,created_by
    ) values (
      scope.tenant_id,current_scheme.id,
      'Actividades de plataforma (sin peso)','actividades',0,next_order,
      true,true,actor
    ) returning id into category_id;
    perform set_config('kibo.allow_system_criterion_insert','off',true);
  end if;
  return category_id;
end $$;
revoke all on function public.asegurar_categoria_plataforma_sin_peso(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.asegurar_categoria_plataforma_sin_peso(uuid,uuid)
  to authenticated;

create or replace function public.configurar_vinculo_plataforma_sin_peso(
  p_ejercicio_id uuid,p_asignacion_id uuid,p_periodo_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare criterion_id uuid;
begin
  criterion_id := public.asegurar_categoria_plataforma_sin_peso(
    p_asignacion_id,p_periodo_id);
  return public.configurar_vinculo_evaluacion_ejercicio(
    p_ejercicio_id,p_asignacion_id,p_periodo_id,criterion_id,null);
end $$;
revoke all on function public.configurar_vinculo_plataforma_sin_peso(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.configurar_vinculo_plataforma_sin_peso(uuid,uuid,uuid)
  to authenticated;

-- Keep the original activation checks, except the one condition that rejects
-- the deliberately unweighted system category. Fail closed if its definition
-- changed since the reviewed migration.
do $migration$
declare definition text; marker text;
begin
  definition := pg_get_functiondef('public.activar_esquema_evaluacion(uuid,integer)'::regprocedure);
  marker := 'and c.activo and c.peso <= 0';
  if position(marker in definition)=0 then
    raise exception 'Review scheme activation before enabling the unweighted category';
  end if;
  definition := replace(definition, marker,
    'and c.activo and c.peso <= 0 and not c.es_sistema_sin_peso');
  execute definition;
end $migration$;

create or replace function public.configurar_ceros_virtuales_docente(
  p_esquema_id uuid, p_activado boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
declare scope public.esquemas_evaluacion%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='PT401',message='ACADEMIC_UNAUTHENTICATED'; end if;
  select * into scope from public.esquemas_evaluacion e where e.id=p_esquema_id for update;
  if scope.id is null or scope.estado <> 'activo' or not (
    select private.can_manage_teaching_assignment(scope.tenant_id, scope.asignacion_profesor_id)
  ) then raise exception using errcode='PT403',message='ACADEMIC_POLICY_FORBIDDEN'; end if;
  if exists (select 1 from public.cierres_calificaciones c
    where c.tenant_id=scope.tenant_id and c.asignacion_id=scope.asignacion_profesor_id
      and c.periodo_id=scope.periodo_evaluacion_id and c.estado='cerrado') then
    raise exception using errcode='PT409',message='ACADEMIC_SCOPE_CLOSED';
  end if;
  perform set_config('kibo.allow_virtual_zero_policy','on',true);
  update public.esquemas_evaluacion set pendientes_vencidos_como_cero=p_activado
    where id=scope.id;
  perform set_config('kibo.allow_virtual_zero_policy','off',true);
  return p_activado;
end $$;
revoke all on function public.configurar_ceros_virtuales_docente(uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.configurar_ceros_virtuales_docente(uuid,boolean)
  to authenticated;

-- The zero-weight system criterion is created only by a checked server RPC.
create or replace function private.validate_evaluation_criterion()
returns trigger language plpgsql set search_path = '' as $$
declare scheme_state text; period_state text;
begin
  if tg_op='INSERT' and new.es_sistema_sin_peso and (
    current_user <> 'postgres'
    or new.nombre <> 'Actividades de plataforma (sin peso)'
    or new.tipo <> 'actividades'
    or new.peso <> 0
  ) then
    raise exception 'La categoría sin peso es exclusiva del sistema' using errcode='42501';
  end if;
  if tg_op='INSERT' and new.nombre='Actividades de plataforma (sin peso)'
     and new.tipo='actividades' and new.peso=0 and current_user='postgres' then
    new.es_sistema_sin_peso := true;
  end if;
  if tg_op='UPDATE' and (
    old.tenant_id is distinct from new.tenant_id
    or old.esquema_evaluacion_id is distinct from new.esquema_evaluacion_id
    or old.created_by is distinct from new.created_by
    or old.created_at is distinct from new.created_at
    or old.es_sistema_sin_peso is distinct from new.es_sistema_sin_peso
  ) then raise exception 'El contexto del criterio es inmutable'; end if;
  if tg_op='INSERT' and auth.uid() is not null and new.created_by <> auth.uid() then
    raise exception 'El creador del criterio debe ser el actor autenticado' using errcode='42501';
  end if;
  select e.estado,p.estado into scheme_state,period_state
  from public.esquemas_evaluacion e join public.periodos_evaluacion p
    on p.id=e.periodo_evaluacion_id and p.tenant_id=e.tenant_id
  where e.id=new.esquema_evaluacion_id and e.tenant_id=new.tenant_id for update of e;
  if not found then raise exception 'El esquema no pertenece al tenant'; end if;
  if tg_op='INSERT' and scheme_state='activo' and period_state='activo'
     and current_user='postgres'
     and current_setting('kibo.allow_system_criterion_insert',true)='on'
     and (new.es_sistema_sin_peso or (
       new.nombre='Evaluación pendiente de configurar'
       and new.tipo='directo' and new.peso=100
     )) then
    return new;
  end if;
  if tg_op='UPDATE' and scheme_state='activo' and period_state='activo'
     and current_user='postgres'
     and current_setting('kibo.allow_active_weight_update',true)='on'
     and old.nombre is not distinct from new.nombre
     and old.tipo is not distinct from new.tipo
     and old.orden is not distinct from new.orden
     and old.activo is not distinct from new.activo then
    return new;
  end if;
  if scheme_state <> 'borrador' or period_state='cerrado' then
    raise exception 'Sólo se configura un esquema borrador de periodo editable';
  end if;
  if tg_op='UPDATE' and new.es_sistema_sin_peso and (old.nombre is distinct from new.nombre
     or old.tipo is distinct from new.tipo or old.peso is distinct from new.peso
     or old.orden is distinct from new.orden or old.activo is distinct from new.activo) then
    raise exception 'La categoría del sistema no puede editarse';
  end if;
  return new;
end $$;
