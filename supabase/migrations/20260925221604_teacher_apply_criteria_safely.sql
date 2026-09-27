-- Sólo una operación autorizada puede ajustar porcentajes de criterios activos.
-- Los identificadores de criterios y las notas originales permanecen iguales;
-- el motor vuelve a ponderar al consultar la libreta o generar un reporte.
alter table public.criterios_evaluacion
  add column es_sistema_sin_peso boolean not null default false;
alter table public.esquemas_evaluacion
  add column pendientes_vencidos_como_cero boolean not null default false;

create or replace function private.validate_evaluation_criterion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  scheme_state text;
  period_state text;
begin
  if tg_op = 'UPDATE' and (
    old.tenant_id is distinct from new.tenant_id
    or old.esquema_evaluacion_id is distinct from new.esquema_evaluacion_id
    or old.created_by is distinct from new.created_by
    or old.created_at is distinct from new.created_at
  ) then
    raise exception 'El tenant, esquema y creador del criterio son inmutables';
  end if;
  if tg_op = 'INSERT' and (select auth.uid()) is not null
     and new.created_by <> (select auth.uid()) then
    raise exception 'El creador del criterio debe ser el actor autenticado'
      using errcode = '42501';
  end if;
  select e.estado, p.estado into scheme_state, period_state
  from public.esquemas_evaluacion e
  join public.periodos_evaluacion p
    on p.id = e.periodo_evaluacion_id and p.tenant_id = e.tenant_id
  where e.id = new.esquema_evaluacion_id and e.tenant_id = new.tenant_id
  for update of e;
  if not found then
    raise exception 'El esquema no pertenece al tenant';
  end if;
  if tg_op = 'UPDATE' and scheme_state = 'activo' and period_state = 'activo'
     and current_user = 'postgres'
     and current_setting('kibo.allow_active_weight_update', true) = 'on'
     and old.nombre is not distinct from new.nombre
     and old.tipo is not distinct from new.tipo
     and old.orden is not distinct from new.orden
     and old.activo is not distinct from new.activo then
    return new;
  end if;
  if scheme_state <> 'borrador' or period_state = 'cerrado' then
    raise exception 'Sólo se configura un esquema borrador de periodo editable';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_evaluation_criterion()
  from public, anon, authenticated;

create or replace function private.esquemas_criterios_equivalentes(
  p_origen uuid, p_destino uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  with source_rows as (
    select lower(btrim(c.nombre)) as nombre, c.tipo, c.orden, c.activo, c.es_sistema_sin_peso,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'nombre', lower(btrim(sc.nombre)), 'tipo', sc.tipo,
          'orden', sc.orden, 'peso', sc.peso_interno,
          'configuracion', sc.configuracion, 'activo', sc.activo
        ) order by sc.orden, sc.id)
        from public.subcriterios_evaluacion sc
        where sc.criterio_evaluacion_id = c.id
      ), '[]'::jsonb) as hijos
    from public.criterios_evaluacion c where c.esquema_evaluacion_id = p_origen
  ), target_rows as (
    select lower(btrim(c.nombre)) as nombre, c.tipo, c.orden, c.activo, c.es_sistema_sin_peso,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'nombre', lower(btrim(sc.nombre)), 'tipo', sc.tipo,
          'orden', sc.orden, 'peso', sc.peso_interno,
          'configuracion', sc.configuracion, 'activo', sc.activo
        ) order by sc.orden, sc.id)
        from public.subcriterios_evaluacion sc
        where sc.criterio_evaluacion_id = c.id
      ), '[]'::jsonb) as hijos
    from public.criterios_evaluacion c where c.esquema_evaluacion_id = p_destino
  )
  select not exists (select * from source_rows except select * from target_rows)
     and not exists (select * from target_rows except select * from source_rows)
     and exists (select 1 from source_rows);
$$;
revoke all on function private.esquemas_criterios_equivalentes(uuid, uuid)
  from public, anon, authenticated;

-- Publicar una edición sin ocultar notas que apuntan a los UUID originales.
-- Si sólo cambiaron los porcentajes, se ajustan sobre los mismos criterios;
-- si cambió la estructura, el esquema anterior queda como historial.
create or replace function public.aplicar_edicion_esquema_docente(
  p_esquema_borrador_id uuid,
  p_version_esperada integer
)
returns table (esquema_id uuid, estado text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft public.esquemas_evaluacion%rowtype;
  active_scheme public.esquemas_evaluacion%rowtype;
  has_records boolean;
  old_system_id uuid;
  new_system_id uuid;
  system_order smallint;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_UNAUTHENTICATED';
  end if;
  select e.* into draft from public.esquemas_evaluacion e
  where e.id = p_esquema_borrador_id for update;
  if not found or draft.estado <> 'borrador' or draft.version <> p_version_esperada then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_DRAFT_CHANGED';
  end if;
  if not (select private.can_manage_teaching_assignment(
      draft.tenant_id, draft.asignacion_profesor_id)) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_SCHEME_FORBIDDEN';
  end if;
  select e.* into active_scheme from public.esquemas_evaluacion e
  where e.tenant_id = draft.tenant_id
    and e.asignacion_profesor_id = draft.asignacion_profesor_id
    and e.periodo_evaluacion_id = draft.periodo_evaluacion_id
    and e.estado = 'activo'
  for update;

  if active_scheme.id is not null then
    select exists (select 1 from public.calificaciones_directas r
                   where r.tenant_id = draft.tenant_id
                     and r.asignacion_profesor_id = draft.asignacion_profesor_id
                     and r.periodo_evaluacion_id = draft.periodo_evaluacion_id)
      or exists (select 1 from public.eventos_participacion r
                 where r.tenant_id = draft.tenant_id
                   and r.asignacion_profesor_id = draft.asignacion_profesor_id
                   and r.periodo_evaluacion_id = draft.periodo_evaluacion_id)
      or exists (select 1 from public.vinculos_evaluacion_ejercicio r
                 where r.tenant_id = draft.tenant_id
                   and r.asignacion_profesor_id = draft.asignacion_profesor_id
                   and r.periodo_evaluacion_id = draft.periodo_evaluacion_id)
      or exists (select 1 from public.conceptos_evaluacion_docente r
                 where r.tenant_id = draft.tenant_id
                   and r.asignacion_profesor_id = draft.asignacion_profesor_id
                   and r.periodo_evaluacion_id = draft.periodo_evaluacion_id)
      or exists (select 1 from public.capturas_provisionales_docente r
                 where r.tenant_id = draft.tenant_id
                   and r.asignacion_profesor_id = draft.asignacion_profesor_id
                   and r.periodo_evaluacion_id = draft.periodo_evaluacion_id)
      into has_records;
  end if;

  if has_records then
    if (select coalesce(sum(c.peso), 0) from public.criterios_evaluacion c
        where c.esquema_evaluacion_id = draft.id and c.activo) <> 100
      or exists (select 1 from public.criterios_evaluacion c
                  where c.esquema_evaluacion_id = draft.id
                    and c.activo and c.peso <= 0 and not c.es_sistema_sin_peso) then
      raise exception using errcode = 'PT422', message = 'ACADEMIC_WEIGHTS_MUST_TOTAL_100';
    end if;
    if exists (select 1 from public.cierres_calificaciones r
               where r.tenant_id = draft.tenant_id
                 and r.asignacion_id = draft.asignacion_profesor_id
                 and r.periodo_id = draft.periodo_evaluacion_id) then
      raise exception using errcode = 'PT409', message = 'ACADEMIC_SCHEME_CLOSED';
    end if;
    if active_scheme.id is not null
       and active_scheme.nombre = draft.nombre
       and active_scheme.calificacion_aprobatoria = draft.calificacion_aprobatoria
       and active_scheme.decimales_mostrados = draft.decimales_mostrados
       and (select private.esquemas_criterios_equivalentes(draft.id, active_scheme.id)) then
      perform set_config('kibo.allow_active_weight_update', 'on', true);
      update public.criterios_evaluacion target
      set peso = origin.peso
      from public.criterios_evaluacion origin
      where target.esquema_evaluacion_id = active_scheme.id
        and origin.esquema_evaluacion_id = draft.id
        and target.orden = origin.orden
        and target.tipo = origin.tipo
        and lower(btrim(target.nombre)) = lower(btrim(origin.nombre));
      perform set_config('kibo.allow_active_weight_update', 'off', true);
      update public.esquemas_evaluacion e set estado = 'archivado'
      where e.id = draft.id;
      return query select active_scheme.id, 'activo'::text, active_scheme.version;
      return;
    end if;
    -- Una estructura distinta inicia una libreta nueva. La categoría sin peso
    -- es independiente de esa libreta y conserva sus tareas y resultados.
    if active_scheme.id is not null then
      select c.id into old_system_id from public.criterios_evaluacion c
      where c.esquema_evaluacion_id = active_scheme.id and c.es_sistema_sin_peso;
      if old_system_id is not null then
        select c.id into new_system_id from public.criterios_evaluacion c
        where c.esquema_evaluacion_id = draft.id and c.es_sistema_sin_peso;
        if new_system_id is null then
          select (coalesce(max(c.orden), 0) + 1)::smallint into system_order
          from public.criterios_evaluacion c where c.esquema_evaluacion_id = draft.id;
          insert into public.criterios_evaluacion (
            tenant_id, esquema_evaluacion_id, nombre, tipo, peso, orden,
            activo, es_sistema_sin_peso, created_by
          ) values (
            draft.tenant_id, draft.id, 'Actividades de plataforma (sin peso)',
            'actividades', 0, system_order, true, true, (select auth.uid())
          ) returning id into new_system_id;
        end if;
        update public.vinculos_evaluacion_ejercicio v
          set criterio_evaluacion_id = new_system_id
        where v.tenant_id = draft.tenant_id and v.activo
          and v.asignacion_profesor_id = draft.asignacion_profesor_id
          and v.periodo_evaluacion_id = draft.periodo_evaluacion_id
          and v.criterio_evaluacion_id = old_system_id;
      end if;
      update public.vinculos_evaluacion_ejercicio v set activo = false
      where v.tenant_id = draft.tenant_id and v.activo
        and v.asignacion_profesor_id = draft.asignacion_profesor_id
        and v.periodo_evaluacion_id = draft.periodo_evaluacion_id
        and exists (select 1 from public.criterios_evaluacion c
          where c.id = v.criterio_evaluacion_id
            and c.esquema_evaluacion_id = active_scheme.id
            and not c.es_sistema_sin_peso);
    end if;
  end if;

  return query select a.esquema_id, a.estado, a.version
  from public.activar_esquema_evaluacion(draft.id, draft.version) a;
end;
$$;
revoke all on function public.aplicar_edicion_esquema_docente(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.aplicar_edicion_esquema_docente(uuid, integer)
  to authenticated;

create or replace function public.eliminar_criterio_borrador_docente(
  p_criterio_id uuid,
  p_esquema_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_criterion public.criterios_evaluacion%rowtype;
  target_scheme public.esquemas_evaluacion%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_UNAUTHENTICATED';
  end if;
  select c.* into target_criterion from public.criterios_evaluacion c
  where c.id = p_criterio_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'ACADEMIC_CRITERION_NOT_FOUND';
  end if;
  select e.* into target_scheme from public.esquemas_evaluacion e
  where e.id = target_criterion.esquema_evaluacion_id
    and e.tenant_id = target_criterion.tenant_id for update;
  if target_scheme.id is null or target_scheme.id <> p_esquema_id
     or target_scheme.estado <> 'borrador'
     or not (select private.can_manage_teaching_assignment(
       target_scheme.tenant_id, target_scheme.asignacion_profesor_id)) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_CRITERION_DELETE_FORBIDDEN';
  end if;
  delete from public.configuracion_captura_docente cfg
  where cfg.tenant_id = target_criterion.tenant_id
    and cfg.criterio_evaluacion_id = target_criterion.id;
  delete from public.subcriterios_evaluacion sc
  where sc.tenant_id = target_criterion.tenant_id
    and sc.criterio_evaluacion_id = target_criterion.id;
  delete from public.criterios_evaluacion c
  where c.tenant_id = target_criterion.tenant_id and c.id = target_criterion.id;
  return true;
end;
$$;
revoke all on function public.eliminar_criterio_borrador_docente(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.eliminar_criterio_borrador_docente(uuid, uuid)
  to authenticated;

-- Una sola operación transaccional por materia destino. No se reescriben
-- calificaciones existentes; los vínculos del esquema anterior se desactivan
-- para no mezclar sus notas con los criterios nuevos.
create or replace function public.aplicar_criterios_docente_a_asignacion(
  p_esquema_origen_id uuid,
  p_version_esperada integer,
  p_asignacion_destino_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  source_scheme public.esquemas_evaluacion%rowtype;
  target_scheme public.esquemas_evaluacion%rowtype;
  target_assignment public.asignaciones_profesor%rowtype;
  source_criterion public.criterios_evaluacion%rowtype;
  created_scheme_id uuid;
  created_criterion_id uuid;
  old_system_id uuid;
  new_system_id uuid;
  system_order smallint;
  next_version integer;
  copied_criteria integer := 0;
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'ACADEMIC_UNAUTHENTICATED';
  end if;

  select e.* into source_scheme
  from public.esquemas_evaluacion e
  where e.id = p_esquema_origen_id;
  if not found or source_scheme.estado <> 'activo'
     or source_scheme.version <> p_version_esperada then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_SOURCE_CHANGED';
  end if;
  if not (select private.can_manage_teaching_assignment(
      source_scheme.tenant_id, source_scheme.asignacion_profesor_id)) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_SOURCE_FORBIDDEN';
  end if;

  -- El orden fijo evita bloqueos cruzados si se aplican criterios entre
  -- dos materias al mismo tiempo.
  perform 1 from public.asignaciones_profesor a
  where a.tenant_id = source_scheme.tenant_id
    and a.id in (source_scheme.asignacion_profesor_id, p_asignacion_destino_id)
  order by a.id for update;
  select e.* into source_scheme from public.esquemas_evaluacion e
  where e.id = p_esquema_origen_id for update;
  if source_scheme.estado <> 'activo' or source_scheme.version <> p_version_esperada then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_SOURCE_CHANGED';
  end if;

  select a.* into target_assignment
  from public.asignaciones_profesor a
  where a.id = p_asignacion_destino_id
    and a.tenant_id = source_scheme.tenant_id
    and a.ciclo_escolar_id = source_scheme.ciclo_escolar_id
    and a.activo;
  if not found or target_assignment.id = source_scheme.asignacion_profesor_id
     or not (select private.can_manage_teaching_assignment(
       source_scheme.tenant_id, target_assignment.id)) then
    raise exception using errcode = 'PT403', message = 'ACADEMIC_TARGET_FORBIDDEN';
  end if;
  if not exists (
    select 1 from public.periodos_evaluacion p
    where p.id = source_scheme.periodo_evaluacion_id
      and p.tenant_id = source_scheme.tenant_id
      and p.ciclo_escolar_id = source_scheme.ciclo_escolar_id
      and p.estado = 'activo'
  ) then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_PERIOD_NOT_ACTIVE';
  end if;

  -- Los criterios viejos no pueden quedar huérfanos en la libreta, en QR ni
  -- en conceptos. El profesor verá cuáles materias requieren revisión.
  if exists (select 1 from public.calificaciones_directas r
             where r.tenant_id = source_scheme.tenant_id
               and r.asignacion_profesor_id = target_assignment.id
               and r.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id)
     or exists (select 1 from public.eventos_participacion r
                where r.tenant_id = source_scheme.tenant_id
                  and r.asignacion_profesor_id = target_assignment.id
                  and r.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id)
     or exists (select 1 from public.vinculos_evaluacion_ejercicio r
                where r.tenant_id = source_scheme.tenant_id
                  and r.asignacion_profesor_id = target_assignment.id
                  and r.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id)
     or exists (select 1 from public.conceptos_evaluacion_docente r
                where r.tenant_id = source_scheme.tenant_id
                  and r.asignacion_profesor_id = target_assignment.id
                  and r.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id)
     or exists (select 1 from public.capturas_provisionales_docente r
                where r.tenant_id = source_scheme.tenant_id
                  and r.asignacion_profesor_id = target_assignment.id
                  and r.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id)
  then
    select e.* into target_scheme from public.esquemas_evaluacion e
    where e.tenant_id = source_scheme.tenant_id
      and e.asignacion_profesor_id = target_assignment.id
      and e.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id
      and e.estado = 'activo'
    for update;
    if target_scheme.id is not null
       and not exists (select 1 from public.cierres_calificaciones r
                       where r.tenant_id = source_scheme.tenant_id
                         and r.asignacion_id = target_assignment.id
                         and r.periodo_id = source_scheme.periodo_evaluacion_id)
       and target_scheme.calificacion_aprobatoria = source_scheme.calificacion_aprobatoria
       and target_scheme.decimales_mostrados = source_scheme.decimales_mostrados
       and (select private.esquemas_criterios_equivalentes(source_scheme.id, target_scheme.id)) then
      perform set_config('kibo.allow_active_weight_update', 'on', true);
      update public.criterios_evaluacion target
      set peso = origin.peso
      from public.criterios_evaluacion origin
      where target.esquema_evaluacion_id = target_scheme.id
        and origin.esquema_evaluacion_id = source_scheme.id
        and target.orden = origin.orden
        and target.tipo = origin.tipo
        and lower(btrim(target.nombre)) = lower(btrim(origin.nombre));
      perform set_config('kibo.allow_active_weight_update', 'off', true);
      return jsonb_build_object(
        'schemeId', target_scheme.id,
        'assignmentId', target_assignment.id,
        'criterionCount', (select count(*) from public.criterios_evaluacion c
                          where c.esquema_evaluacion_id = target_scheme.id),
        'version', target_scheme.version,
        'mode', 'reweighted'
      );
    end if;
    -- Se conserva el esquema y sus notas como historial. Los vínculos
    -- anteriores dejan de capturar hasta que el maestro reasigne la tarea.
  end if;

  if exists (select 1 from public.cierres_calificaciones r
             where r.tenant_id = source_scheme.tenant_id
               and r.asignacion_id = target_assignment.id
               and r.periodo_id = source_scheme.periodo_evaluacion_id) then
    raise exception using errcode = 'PT409', message = 'ACADEMIC_TARGET_CLOSED';
  end if;

  perform 1 from public.esquemas_evaluacion e
  where e.tenant_id = source_scheme.tenant_id
    and e.asignacion_profesor_id = target_assignment.id
    and e.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id
  order by e.id for update;

  select coalesce(max(e.version), 0) + 1 into next_version
  from public.esquemas_evaluacion e
  where e.tenant_id = source_scheme.tenant_id
    and e.asignacion_profesor_id = target_assignment.id
    and e.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id;

  update public.esquemas_evaluacion e set estado = 'archivado'
  where e.tenant_id = source_scheme.tenant_id
    and e.asignacion_profesor_id = target_assignment.id
    and e.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id
    and e.estado in ('activo', 'borrador');

  insert into public.esquemas_evaluacion (
    tenant_id, ciclo_escolar_id, asignacion_profesor_id, periodo_evaluacion_id,
    nombre, calificacion_aprobatoria, decimales_mostrados, modo_redondeo,
    regla_no_entrego, valor_no_entrego, regla_justificado, estado, version,
    pendientes_vencidos_como_cero, created_by
  ) values (
    source_scheme.tenant_id, source_scheme.ciclo_escolar_id,
    target_assignment.id, source_scheme.periodo_evaluacion_id,
    source_scheme.nombre, source_scheme.calificacion_aprobatoria,
    source_scheme.decimales_mostrados, source_scheme.modo_redondeo,
    source_scheme.regla_no_entrego, source_scheme.valor_no_entrego,
    source_scheme.regla_justificado, 'borrador', next_version,
    source_scheme.pendientes_vencidos_como_cero, actor
  ) returning id into created_scheme_id;

  for source_criterion in
    select c.* from public.criterios_evaluacion c
    where c.tenant_id = source_scheme.tenant_id
      and c.esquema_evaluacion_id = source_scheme.id
    order by c.orden, c.id
  loop
    insert into public.criterios_evaluacion (
      tenant_id, esquema_evaluacion_id, nombre, tipo, peso, orden, activo,
      es_sistema_sin_peso, created_by
    ) values (
      source_scheme.tenant_id, created_scheme_id, source_criterion.nombre,
      source_criterion.tipo, source_criterion.peso, source_criterion.orden,
      source_criterion.activo, source_criterion.es_sistema_sin_peso, actor
    ) returning id into created_criterion_id;
    copied_criteria := copied_criteria + 1;

    insert into public.subcriterios_evaluacion (
      tenant_id, criterio_evaluacion_id, nombre, tipo, peso_interno, orden,
      configuracion, activo, created_by
    )
    select source_scheme.tenant_id, created_criterion_id, sc.nombre, sc.tipo,
           sc.peso_interno, sc.orden, sc.configuracion, sc.activo, actor
    from public.subcriterios_evaluacion sc
    where sc.tenant_id = source_scheme.tenant_id
      and sc.criterio_evaluacion_id = source_criterion.id;

    insert into public.configuracion_captura_docente (
      tenant_id, profesor_id, criterio_evaluacion_id, calificacion_minima,
      incremento, lector_qr, confirmar_antes_guardar
    )
    select source_scheme.tenant_id, actor, created_criterion_id,
           cfg.calificacion_minima, cfg.incremento, cfg.lector_qr,
           cfg.confirmar_antes_guardar
    from public.configuracion_captura_docente cfg
    where cfg.tenant_id = source_scheme.tenant_id
      and cfg.profesor_id = actor
      and cfg.criterio_evaluacion_id = source_criterion.id;
  end loop;

  if target_scheme.id is not null then
    select c.id into old_system_id from public.criterios_evaluacion c
    where c.esquema_evaluacion_id = target_scheme.id and c.es_sistema_sin_peso;
    if old_system_id is not null then
      select c.id into new_system_id from public.criterios_evaluacion c
      where c.esquema_evaluacion_id = created_scheme_id and c.es_sistema_sin_peso;
      if new_system_id is null then
        select (coalesce(max(c.orden), 0) + 1)::smallint into system_order
        from public.criterios_evaluacion c where c.esquema_evaluacion_id = created_scheme_id;
        insert into public.criterios_evaluacion (
          tenant_id, esquema_evaluacion_id, nombre, tipo, peso, orden,
          activo, es_sistema_sin_peso, created_by
        ) values (
          source_scheme.tenant_id, created_scheme_id,
          'Actividades de plataforma (sin peso)', 'actividades', 0,
          system_order, true, true, actor
        ) returning id into new_system_id;
      end if;
      update public.vinculos_evaluacion_ejercicio v
        set criterio_evaluacion_id = new_system_id
      where v.tenant_id = source_scheme.tenant_id and v.activo
        and v.asignacion_profesor_id = target_assignment.id
        and v.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id
        and v.criterio_evaluacion_id = old_system_id;
    end if;
    update public.vinculos_evaluacion_ejercicio v set activo = false
    where v.tenant_id = source_scheme.tenant_id and v.activo
      and v.asignacion_profesor_id = target_assignment.id
      and v.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id
      and exists (select 1 from public.criterios_evaluacion c
        where c.id = v.criterio_evaluacion_id
          and c.esquema_evaluacion_id = target_scheme.id
          and not c.es_sistema_sin_peso);
  end if;

  perform public.activar_esquema_evaluacion(created_scheme_id, next_version);
  return jsonb_build_object(
    'schemeId', created_scheme_id,
    'assignmentId', target_assignment.id,
    'criterionCount', copied_criteria,
    'version', next_version,
    'mode', 'replaced'
  );
end;
$$;

revoke all on function public.aplicar_criterios_docente_a_asignacion(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.aplicar_criterios_docente_a_asignacion(uuid, integer, uuid)
  to authenticated;
