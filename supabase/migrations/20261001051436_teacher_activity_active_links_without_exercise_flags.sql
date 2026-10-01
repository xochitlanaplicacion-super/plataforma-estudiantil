-- Activity publication tracking follows active evaluation links,
-- assignments and periods.
-- Freeze those sources while marking already accessible exercises as historical,
-- then switch capture to the same visibility rule in this single statement.
set search_path = '';

do $cutover$
begin
  lock table public.tenants, public.periodos_evaluacion,
    public.asignaciones_profesor, public.ejercicios,
    public.vinculos_evaluacion_ejercicio in share row exclusive mode;

  insert into private.teacher_activity_publication_baseline (
    tenant_id, exercise_id, logical_activity_id
  )
  select distinct e.tenant_id, e.id, coalesce(e.sync_id, e.id)
  from public.ejercicios e
  join public.vinculos_evaluacion_ejercicio v
    on v.ejercicio_id = e.id and v.tenant_id = e.tenant_id and v.activo
  join public.asignaciones_profesor a
    on a.id = v.asignacion_profesor_id and a.tenant_id = v.tenant_id
    and a.activo
  join public.periodos_evaluacion p
    on p.id = v.periodo_evaluacion_id and p.tenant_id = v.tenant_id
    and p.estado <> 'borrador'
  on conflict (tenant_id, exercise_id) do nothing;

  execute $function$
    create or replace function private.capture_teacher_activity_publication(
      p_tenant_id uuid, p_exercise_id uuid
    )
    returns void language plpgsql security definer set search_path = '' as $body$
    declare
      candidate record;
      visible_group_ids uuid[];
      visible_group_names text[];
    begin
      select e.id, e.tenant_id, coalesce(e.sync_id, e.id) as logical_id,
             e.created_by as teacher_id, e.titulo as title_snapshot,
             e.tipo as type_snapshot, e.fecha_entrega as due_at_snapshot,
             v.id as link_id, v.asignacion_profesor_id as assignment_id
        into candidate
      from public.ejercicios e
      join public.profiles author on author.id = e.created_by
        and author.tenant_id = e.tenant_id
        and author.rol::text = 'profesor' and author.estatus = 'activo'
      join public.vinculos_evaluacion_ejercicio v on v.ejercicio_id = e.id
        and v.tenant_id = e.tenant_id and v.activo
      join public.asignaciones_profesor a on a.id = v.asignacion_profesor_id
        and a.tenant_id = v.tenant_id and a.activo
      join public.periodos_evaluacion p on p.id = v.periodo_evaluacion_id
        and p.tenant_id = v.tenant_id and p.estado <> 'borrador'
      where e.id = p_exercise_id and e.tenant_id = p_tenant_id
      order by v.created_at, v.id
      limit 1;

      if candidate.id is null then return; end if;

      -- Existing accessible rows stay negative markers, including synced copies.
      if exists (
        select 1 from private.teacher_activity_publication_baseline b
        where b.tenant_id = candidate.tenant_id
          and (
            b.exercise_id = candidate.id
            or b.logical_activity_id = candidate.logical_id
            or exists (
              select 1 from public.ejercicios sibling
              where sibling.id = b.exercise_id
                and sibling.tenant_id = b.tenant_id
                and sibling.sync_id = candidate.logical_id
                and sibling.sync_id is not null
            )
          )
      ) then return; end if;

      -- A source may gain sync_id after its first event.
      if exists (
        select 1 from public.teacher_activity_publication_events ev
        where ev.tenant_id = candidate.tenant_id
          and (
            ev.exercise_id = candidate.id
            or ev.logical_activity_id = candidate.logical_id
            or exists (
              select 1 from public.ejercicios sibling
              where sibling.id = ev.exercise_id
                and sibling.tenant_id = ev.tenant_id
                and sibling.sync_id = candidate.logical_id
                and sibling.sync_id is not null
            )
          )
      ) then return; end if;

      -- Both snapshots share the same group-ID order.
      select array_agg(g.id order by g.id), array_agg(g.nombre order by g.id)
        into visible_group_ids, visible_group_names
      from (
        select distinct a2.grupo_id as id
        from public.ejercicios e2
        join public.vinculos_evaluacion_ejercicio v2
          on v2.ejercicio_id = e2.id and v2.tenant_id = e2.tenant_id
          and v2.activo
        join public.asignaciones_profesor a2
          on a2.id = v2.asignacion_profesor_id and a2.tenant_id = v2.tenant_id
          and a2.activo
        join public.periodos_evaluacion p2
          on p2.id = v2.periodo_evaluacion_id and p2.tenant_id = v2.tenant_id
          and p2.estado <> 'borrador'
        where e2.tenant_id = candidate.tenant_id
          and (e2.id = candidate.id
            or (e2.sync_id is not null and e2.sync_id = candidate.logical_id))
      ) visible
      join public.grupos g on g.id = visible.id
        and g.tenant_id = candidate.tenant_id;

      insert into public.teacher_activity_publication_events (
        tenant_id, logical_activity_id, exercise_id, credited_teacher_id,
        title_snapshot, type_snapshot, due_at_snapshot,
        group_ids_snapshot, group_names_snapshot,
        evaluation_link_id, assignment_id, published_at
      ) values (
        candidate.tenant_id, candidate.logical_id, candidate.id,
        candidate.teacher_id, candidate.title_snapshot,
        candidate.type_snapshot, candidate.due_at_snapshot,
        coalesce(visible_group_ids, '{}'::uuid[]),
        coalesce(visible_group_names, '{}'::text[]),
        candidate.link_id, candidate.assignment_id, clock_timestamp()
      ) on conflict do nothing;
    end;
    $body$;
  $function$;
end;
$cutover$;
