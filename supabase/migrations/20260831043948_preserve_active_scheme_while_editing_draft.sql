-- Mantiene publicada la versión activa mientras el profesor prepara una nueva
-- versión en borrador. Sólo puede existir una activa y un borrador por alcance.
drop index if exists public.esquemas_evaluacion_un_vigente_idx;

create unique index esquemas_evaluacion_un_activo_idx
  on public.esquemas_evaluacion (
    tenant_id, asignacion_profesor_id, periodo_evaluacion_id
  )
  where estado = 'activo';

create unique index esquemas_evaluacion_un_borrador_idx
  on public.esquemas_evaluacion (
    tenant_id, asignacion_profesor_id, periodo_evaluacion_id
  )
  where estado = 'borrador';

create or replace function public.activar_esquema_evaluacion(
  target_scheme_id uuid,
  expected_scheme_version integer
)
returns table (
  esquema_id uuid,
  estado text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_scheme public.esquemas_evaluacion%rowtype;
  active_count bigint;
  total_weight numeric(12,4);
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '28000';
  end if;

  select e.* into target_scheme
  from public.esquemas_evaluacion e
  where e.id = target_scheme_id
    and (select private.has_active_tenant_membership(e.tenant_id))
    and (select private.can_manage_teaching_assignment(
      e.tenant_id, e.asignacion_profesor_id
    ));

  if not found then
    raise exception 'Esquema no encontrado' using errcode = 'P0002';
  end if;

  -- Todas las activaciones del mismo alcance toman bloqueos en idéntico orden.
  perform 1
  from public.esquemas_evaluacion e
  where e.tenant_id = target_scheme.tenant_id
    and e.asignacion_profesor_id = target_scheme.asignacion_profesor_id
    and e.periodo_evaluacion_id = target_scheme.periodo_evaluacion_id
  order by e.id
  for update;

  select e.* into target_scheme
  from public.esquemas_evaluacion e
  where e.id = target_scheme_id;

  if target_scheme.version <> expected_scheme_version then
    raise exception 'La versión esperada del esquema ya no es vigente'
      using errcode = '40001';
  end if;
  if target_scheme.estado <> 'borrador' then
    raise exception 'Sólo un esquema borrador puede activarse' using errcode = '55000';
  end if;

  select count(*), coalesce(sum(c.peso), 0.0000)
    into active_count, total_weight
  from public.criterios_evaluacion c
  where c.tenant_id = target_scheme.tenant_id
    and c.esquema_evaluacion_id = target_scheme.id
    and c.activo;

  if active_count = 0 then
    raise exception 'El esquema necesita al menos un criterio activo'
      using errcode = '23514';
  end if;
  if total_weight <> 100.0000 or exists (
    select 1 from public.criterios_evaluacion c
    where c.tenant_id = target_scheme.tenant_id
      and c.esquema_evaluacion_id = target_scheme.id
      and c.activo and c.peso <= 0
  ) then
    raise exception 'Los criterios activos deben sumar exactamente 100.0000 y ser positivos'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.criterios_evaluacion c
    left join lateral (
      select count(*) as child_count,
             coalesce(sum(s.peso_interno), 0.0000) as child_total,
             coalesce(bool_and(s.peso_interno > 0), true) as all_positive
      from public.subcriterios_evaluacion s
      where s.tenant_id = c.tenant_id
        and s.criterio_evaluacion_id = c.id
        and s.activo
    ) children on true
    where c.tenant_id = target_scheme.tenant_id
      and c.esquema_evaluacion_id = target_scheme.id
      and c.activo
      and (
        (children.child_count > 0 and (
          children.child_total <> 100.0000 or not children.all_positive
        ))
        or (c.tipo = 'hibrido' and children.child_count < 2)
        or (c.tipo <> 'hibrido' and exists (
          select 1 from public.subcriterios_evaluacion mismatched
          where mismatched.tenant_id = c.tenant_id
            and mismatched.criterio_evaluacion_id = c.id
            and mismatched.activo
            and mismatched.tipo <> c.tipo
        ))
      )
  ) then
    raise exception 'Los subcriterios activos son incompatibles o no suman exactamente 100.0000'
      using errcode = '23514';
  end if;

  -- La versión publicada sólo se archiva cuando el reemplazo ya fue validado.
  update public.esquemas_evaluacion e
  set estado = 'archivado'
  where e.tenant_id = target_scheme.tenant_id
    and e.asignacion_profesor_id = target_scheme.asignacion_profesor_id
    and e.periodo_evaluacion_id = target_scheme.periodo_evaluacion_id
    and e.estado = 'activo'
    and e.id <> target_scheme.id;

  update public.esquemas_evaluacion e
  set estado = 'activo'
  where e.id = target_scheme.id;

  return query
  select target_scheme.id, 'activo'::text, target_scheme.version;
end;
$$;

revoke all on function public.activar_esquema_evaluacion(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.activar_esquema_evaluacion(uuid, integer)
  to authenticated;

create or replace function public.copiar_esquema_evaluacion(
  source_scheme_id uuid,
  expected_source_version integer,
  new_scheme_name text
)
returns table (
  esquema_id uuid,
  estado text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_scheme public.esquemas_evaluacion%rowtype;
  existing_copy public.esquemas_evaluacion%rowtype;
  created_scheme public.esquemas_evaluacion%rowtype;
  source_criterion record;
  created_criterion_id uuid;
  next_version integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '28000';
  end if;
  if nullif(btrim(new_scheme_name), '') is null then
    raise exception 'El nombre de la nueva versión es obligatorio'
      using errcode = '22023';
  end if;

  select e.* into source_scheme
  from public.esquemas_evaluacion e
  where e.id = source_scheme_id
    and (select private.has_active_tenant_membership(e.tenant_id))
    and (select private.can_manage_teaching_assignment(
      e.tenant_id, e.asignacion_profesor_id
    ))
  for update;

  if not found then
    raise exception 'Esquema origen no encontrado' using errcode = 'P0002';
  end if;
  if source_scheme.version <> expected_source_version then
    raise exception 'La versión origen cambió' using errcode = '40001';
  end if;

  select e.* into existing_copy
  from public.esquemas_evaluacion e
  where e.copiado_desde_id = source_scheme.id
    and e.tenant_id = source_scheme.tenant_id;

  if found then
    if existing_copy.nombre <> btrim(new_scheme_name) then
      raise exception 'La fuente ya fue copiada con parámetros diferentes'
        using errcode = '23505';
    end if;
    return query
    select existing_copy.id, existing_copy.estado, existing_copy.version;
    return;
  end if;

  if source_scheme.estado not in ('activo', 'archivado') then
    raise exception 'Sólo se versiona un esquema activo o archivado'
      using errcode = '55000';
  end if;

  -- La versión activa permanece publicada durante toda la edición del borrador.
  if exists (
    select 1 from public.esquemas_evaluacion current_scheme
    where current_scheme.tenant_id = source_scheme.tenant_id
      and current_scheme.asignacion_profesor_id = source_scheme.asignacion_profesor_id
      and current_scheme.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id
      and current_scheme.estado = 'borrador'
  ) then
    raise exception 'Ya existe un borrador para la asignación y periodo'
      using errcode = '23505';
  end if;

  select coalesce(max(e.version), 0) + 1 into next_version
  from public.esquemas_evaluacion e
  where e.tenant_id = source_scheme.tenant_id
    and e.asignacion_profesor_id = source_scheme.asignacion_profesor_id
    and e.periodo_evaluacion_id = source_scheme.periodo_evaluacion_id;

  insert into public.esquemas_evaluacion (
    tenant_id, ciclo_escolar_id, asignacion_profesor_id,
    periodo_evaluacion_id, nombre, calificacion_aprobatoria,
    decimales_mostrados, modo_redondeo, regla_no_entrego,
    valor_no_entrego, regla_justificado, estado, version, created_by,
    copiado_desde_id
  ) values (
    source_scheme.tenant_id, source_scheme.ciclo_escolar_id,
    source_scheme.asignacion_profesor_id, source_scheme.periodo_evaluacion_id,
    btrim(new_scheme_name), source_scheme.calificacion_aprobatoria,
    source_scheme.decimales_mostrados, source_scheme.modo_redondeo,
    source_scheme.regla_no_entrego, source_scheme.valor_no_entrego,
    source_scheme.regla_justificado, 'borrador', next_version,
    (select auth.uid()), source_scheme.id
  ) returning * into created_scheme;

  for source_criterion in
    select c.* from public.criterios_evaluacion c
    where c.tenant_id = source_scheme.tenant_id
      and c.esquema_evaluacion_id = source_scheme.id
    order by c.orden, c.id
  loop
    insert into public.criterios_evaluacion (
      tenant_id, esquema_evaluacion_id, nombre, tipo, peso, orden,
      activo, created_by
    ) values (
      created_scheme.tenant_id, created_scheme.id, source_criterion.nombre,
      source_criterion.tipo, source_criterion.peso, source_criterion.orden,
      source_criterion.activo, (select auth.uid())
    ) returning id into created_criterion_id;

    insert into public.subcriterios_evaluacion (
      tenant_id, criterio_evaluacion_id, nombre, tipo, peso_interno,
      orden, configuracion, activo, created_by
    )
    select created_scheme.tenant_id, created_criterion_id, s.nombre, s.tipo,
           s.peso_interno, s.orden, s.configuracion, s.activo,
           (select auth.uid())
    from public.subcriterios_evaluacion s
    where s.tenant_id = source_scheme.tenant_id
      and s.criterio_evaluacion_id = source_criterion.id
    order by s.orden, s.id;
  end loop;

  return query
  select created_scheme.id, created_scheme.estado, created_scheme.version;
end;
$$;

revoke all on function public.copiar_esquema_evaluacion(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.copiar_esquema_evaluacion(uuid, integer, text)
  to authenticated;

-- Repara alcances que quedaron sin versión publicada por el comportamiento
-- anterior. Primero restaura la última versión que sí estuvo publicada, sin
-- descartar el borrador que el profesor continúa editando.
-- La excepción se limita a esta reparación: el trigger vuelve a habilitarse
-- inmediatamente y las versiones archivadas siguen inmutables después.
alter table public.esquemas_evaluacion
  disable trigger validate_evaluation_scheme;

with archived_candidates as (
  select e.id,
         row_number() over (
           partition by e.tenant_id, e.asignacion_profesor_id, e.periodo_evaluacion_id
           order by e.version desc, e.id
         ) as position
  from public.esquemas_evaluacion e
  join public.periodos_evaluacion p
    on p.id = e.periodo_evaluacion_id and p.tenant_id = e.tenant_id
  where e.estado = 'archivado'
    and p.estado = 'activo'
    and not exists (
      select 1 from public.esquemas_evaluacion active_scheme
      where active_scheme.tenant_id = e.tenant_id
        and active_scheme.asignacion_profesor_id = e.asignacion_profesor_id
        and active_scheme.periodo_evaluacion_id = e.periodo_evaluacion_id
        and active_scheme.estado = 'activo'
    )
)
update public.esquemas_evaluacion e
set estado = 'activo'
from archived_candidates candidate
where candidate.id = e.id and candidate.position = 1;

alter table public.esquemas_evaluacion
  enable trigger validate_evaluation_scheme;

-- Si nunca hubo una versión publicada, promueve el borrador más reciente sólo
-- cuando ya cumple todas las reglas de activación.
with valid_drafts as (
  select e.id,
         row_number() over (
           partition by e.tenant_id, e.asignacion_profesor_id, e.periodo_evaluacion_id
           order by e.version desc, e.id
         ) as position
  from public.esquemas_evaluacion e
  join public.periodos_evaluacion p
    on p.id = e.periodo_evaluacion_id and p.tenant_id = e.tenant_id
  where e.estado = 'borrador'
    and p.estado = 'activo'
    and not exists (
      select 1 from public.esquemas_evaluacion active_scheme
      where active_scheme.tenant_id = e.tenant_id
        and active_scheme.asignacion_profesor_id = e.asignacion_profesor_id
        and active_scheme.periodo_evaluacion_id = e.periodo_evaluacion_id
        and active_scheme.estado = 'activo'
    )
    and 100.0000 = (
      select coalesce(sum(c.peso), 0.0000)
      from public.criterios_evaluacion c
      where c.tenant_id = e.tenant_id
        and c.esquema_evaluacion_id = e.id and c.activo
    )
    and not exists (
      select 1
      from public.criterios_evaluacion c
      left join lateral (
        select count(*) as child_count,
               coalesce(sum(s.peso_interno), 0.0000) as child_total,
               coalesce(bool_and(s.peso_interno > 0), true) as all_positive
        from public.subcriterios_evaluacion s
        where s.tenant_id = c.tenant_id
          and s.criterio_evaluacion_id = c.id and s.activo
      ) children on true
      where c.tenant_id = e.tenant_id
        and c.esquema_evaluacion_id = e.id and c.activo
        and (c.peso <= 0
          or (children.child_count > 0 and (
            children.child_total <> 100.0000 or not children.all_positive
          ))
          or (c.tipo = 'hibrido' and children.child_count < 2)
          or (c.tipo <> 'hibrido' and exists (
            select 1 from public.subcriterios_evaluacion mismatched
            where mismatched.tenant_id = c.tenant_id
              and mismatched.criterio_evaluacion_id = c.id
              and mismatched.activo and mismatched.tipo <> c.tipo
          )))
    )
)
update public.esquemas_evaluacion e
set estado = 'activo'
from valid_drafts candidate
where candidate.id = e.id and candidate.position = 1;

comment on index public.esquemas_evaluacion_un_activo_idx is
  'Una sola versión publicada por tenant, asignación y periodo.';
comment on index public.esquemas_evaluacion_un_borrador_idx is
  'Permite editar una versión futura sin retirar la versión publicada.';
