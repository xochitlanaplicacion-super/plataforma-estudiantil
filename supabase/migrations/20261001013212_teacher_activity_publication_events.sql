-- Forward-only evidence for the weekly teacher publication goal. An exercise
-- already visible to students at cutover is excluded even if it is edited later.
set search_path = '';

create table public.teacher_activity_tracking_rollouts (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  activated_at timestamptz not null default clock_timestamp()
);

create table private.teacher_activity_publication_baseline (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  exercise_id uuid not null,
  logical_activity_id uuid not null,
  primary key (tenant_id, exercise_id)
);
create index teacher_activity_publication_baseline_logical_idx
  on private.teacher_activity_publication_baseline (tenant_id, logical_activity_id);

create table public.teacher_activity_publication_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  logical_activity_id uuid not null,
  exercise_id uuid not null,
  credited_teacher_id uuid not null,
  title_snapshot text not null,
  type_snapshot text,
  due_at_snapshot timestamptz,
  group_ids_snapshot uuid[] not null,
  group_names_snapshot text[] not null,
  evaluation_link_id uuid not null,
  assignment_id uuid not null,
  published_at timestamptz not null default clock_timestamp(),
  constraint teacher_activity_publication_logical_unique
    unique (tenant_id, logical_activity_id),
  constraint teacher_activity_publication_exercise_unique
    unique (tenant_id, exercise_id)
);
create index teacher_activity_publication_teacher_time_idx
  on public.teacher_activity_publication_events
    (tenant_id, credited_teacher_id, published_at desc);
create index teacher_activity_publication_tenant_time_idx
  on public.teacher_activity_publication_events
    (tenant_id, published_at, id);

create table public.teacher_activity_weekly_exceptions (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  teacher_id uuid not null,
  week_start date not null,
  kind text not null,
  note text,
  teacher_started_on date,
  authorized_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, teacher_id, week_start),
  constraint teacher_activity_exception_teacher_fkey
    foreign key (teacher_id, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict,
  constraint teacher_activity_exception_authorizer_fkey
    foreign key (authorized_by, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict,
  constraint teacher_activity_exception_monday_check
    check (extract(isodow from week_start) = 1),
  constraint teacher_activity_exception_kind_check
    check (kind in ('vacaciones', 'ausencia_autorizada', 'ingreso_tardio', 'otra')),
  constraint teacher_activity_exception_started_on_check
    check (
      (kind = 'ingreso_tardio'
        and teacher_started_on between week_start and week_start + 6)
      or (kind <> 'ingreso_tardio' and teacher_started_on is null)
    ),
  constraint teacher_activity_exception_note_check
    check (kind <> 'otra' or nullif(btrim(note), '') is not null)
);
create index teacher_activity_exception_teacher_idx
  on public.teacher_activity_weekly_exceptions (tenant_id, teacher_id, week_start desc);

alter table public.teacher_activity_tracking_rollouts enable row level security;
alter table public.teacher_activity_tracking_rollouts force row level security;
alter table private.teacher_activity_publication_baseline enable row level security;
alter table private.teacher_activity_publication_baseline force row level security;
alter table public.teacher_activity_publication_events enable row level security;
alter table public.teacher_activity_publication_events force row level security;
alter table public.teacher_activity_weekly_exceptions enable row level security;
alter table public.teacher_activity_weekly_exceptions force row level security;

revoke all on public.teacher_activity_tracking_rollouts,
  private.teacher_activity_publication_baseline,
  public.teacher_activity_publication_events,
  public.teacher_activity_weekly_exceptions
  from public, anon, authenticated, service_role;
grant select on public.teacher_activity_tracking_rollouts,
  public.teacher_activity_publication_events,
  public.teacher_activity_weekly_exceptions to authenticated, service_role;
grant insert, update, delete on public.teacher_activity_weekly_exceptions
  to authenticated;

create policy teacher_activity_rollout_read
  on public.teacher_activity_tracking_rollouts for select to authenticated
  using (
    tenant_id = (select private.current_active_tenant_id())
    and (select private.has_tenant_role(
      tenant_id, array['profesor','admin','superuser']::text[]))
  );

create policy teacher_activity_event_read
  on public.teacher_activity_publication_events for select to authenticated
  using (
    tenant_id = (select private.current_active_tenant_id())
    and (
      credited_teacher_id = (select auth.uid())
      or (select private.has_tenant_role(
        tenant_id, array['admin','superuser']::text[]))
    )
  );

create policy teacher_activity_exception_read
  on public.teacher_activity_weekly_exceptions for select to authenticated
  using (
    tenant_id = (select private.current_active_tenant_id())
    and (
      teacher_id = (select auth.uid())
      or (select private.has_tenant_role(
        tenant_id, array['admin','superuser']::text[]))
    )
  );
create policy teacher_activity_exception_insert
  on public.teacher_activity_weekly_exceptions for insert to authenticated
  with check (
    tenant_id = (select private.current_active_tenant_id())
    and authorized_by = (select auth.uid())
    and (select private.has_tenant_role(
      tenant_id, array['admin','superuser']::text[]))
  );
create policy teacher_activity_exception_update
  on public.teacher_activity_weekly_exceptions for update to authenticated
  using (
    tenant_id = (select private.current_active_tenant_id())
    and (select private.has_tenant_role(
      tenant_id, array['admin','superuser']::text[]))
  )
  with check (
    tenant_id = (select private.current_active_tenant_id())
    and authorized_by = (select auth.uid())
    and (select private.has_tenant_role(
      tenant_id, array['admin','superuser']::text[]))
  );
create policy teacher_activity_exception_delete
  on public.teacher_activity_weekly_exceptions for delete to authenticated
  using (
    tenant_id = (select private.current_active_tenant_id())
    and (select private.has_tenant_role(
      tenant_id, array['admin','superuser']::text[]))
  );

create function private.teacher_activity_stamp_exception()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.authorized_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.updated_at := clock_timestamp();
  else
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  end if;
  return new;
end;
$$;
revoke all on function private.teacher_activity_stamp_exception()
  from public, anon, authenticated, service_role;
create trigger teacher_activity_stamp_exception
  before insert or update on public.teacher_activity_weekly_exceptions
  for each row execute function private.teacher_activity_stamp_exception();

create function private.teacher_activity_reject_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514',
    message = 'Teacher activity publication evidence is immutable';
end;
$$;
revoke all on function private.teacher_activity_reject_event_mutation()
  from public, anon, authenticated, service_role;
create trigger teacher_activity_reject_event_mutation
  before update or delete on public.teacher_activity_publication_events
  for each row execute function private.teacher_activity_reject_event_mutation();

create function private.capture_teacher_activity_publication(
  p_tenant_id uuid, p_exercise_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
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
    and e.publicado is true and e.visible is distinct from false
  order by v.created_at, v.id
  limit 1;

  if candidate.id is null then return; end if;

  -- The baseline is a negative marker for rows already student-visible at
  -- cutover, not an event backfill. It also protects later synced copies.
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

  -- This second guard handles a source row that gained sync_id only after its
  -- first event. The unique constraints handle ordinary concurrent copies.
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

  -- The two arrays share group-ID order. This preserves the visible group
  -- names even if groups are later renamed or additional links are created.
  select array_agg(g.id order by g.id), array_agg(g.nombre order by g.id)
    into visible_group_ids, visible_group_names
  from (
    select distinct a2.grupo_id as id
    from public.ejercicios e2
    join public.vinculos_evaluacion_ejercicio v2
      on v2.ejercicio_id = e2.id and v2.tenant_id = e2.tenant_id and v2.activo
    join public.asignaciones_profesor a2
      on a2.id = v2.asignacion_profesor_id and a2.tenant_id = v2.tenant_id
      and a2.activo
    join public.periodos_evaluacion p2
      on p2.id = v2.periodo_evaluacion_id and p2.tenant_id = v2.tenant_id
      and p2.estado <> 'borrador'
    where e2.tenant_id = candidate.tenant_id
      and (e2.id = candidate.id
        or (e2.sync_id is not null and e2.sync_id = candidate.logical_id))
      and e2.publicado is true and e2.visible is distinct from false
  ) visible
  join public.grupos g on g.id = visible.id and g.tenant_id = candidate.tenant_id;

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
$$;
revoke all on function private.capture_teacher_activity_publication(uuid, uuid)
  from public, anon, authenticated, service_role;

create function private.teacher_activity_capture_exercise()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.capture_teacher_activity_publication(new.tenant_id, new.id);
  return new;
end;
$$;
revoke all on function private.teacher_activity_capture_exercise()
  from public, anon, authenticated, service_role;

create function private.teacher_activity_capture_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.activo then
    perform private.capture_teacher_activity_publication(
      new.tenant_id, new.ejercicio_id);
  end if;
  return new;
end;
$$;
revoke all on function private.teacher_activity_capture_link()
  from public, anon, authenticated, service_role;

create function private.teacher_activity_capture_period()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  linked_exercise record;
begin
  if old.estado = 'borrador' and new.estado <> 'borrador' then
    for linked_exercise in
      select distinct v.ejercicio_id
      from public.vinculos_evaluacion_ejercicio v
      where v.tenant_id = new.tenant_id
        and v.periodo_evaluacion_id = new.id and v.activo
    loop
      perform private.capture_teacher_activity_publication(
        new.tenant_id, linked_exercise.ejercicio_id);
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.teacher_activity_capture_period()
  from public, anon, authenticated, service_role;

create function private.teacher_activity_capture_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  linked_exercise record;
begin
  if old.activo is distinct from true and new.activo is true then
    for linked_exercise in
      select distinct v.ejercicio_id
      from public.vinculos_evaluacion_ejercicio v
      where v.tenant_id = new.tenant_id
        and v.asignacion_profesor_id = new.id and v.activo
    loop
      perform private.capture_teacher_activity_publication(
        new.tenant_id, linked_exercise.ejercicio_id);
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.teacher_activity_capture_assignment()
  from public, anon, authenticated, service_role;

create function private.teacher_activity_rollout_new_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.teacher_activity_tracking_rollouts(tenant_id, activated_at)
  values (new.id, clock_timestamp()) on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.teacher_activity_rollout_new_tenant()
  from public, anon, authenticated, service_role;

-- Snapshot and trigger cutover happen in one statement. CREATE TRIGGER takes
-- the same table lock, so a concurrent publication cannot cross this boundary.
do $cutover$
declare
  rollout_time timestamptz := clock_timestamp();
begin
  lock table public.tenants, public.periodos_evaluacion,
    public.asignaciones_profesor, public.ejercicios,
    public.vinculos_evaluacion_ejercicio in share row exclusive mode;

  insert into public.teacher_activity_tracking_rollouts(tenant_id, activated_at)
  select id, rollout_time from public.tenants
  on conflict (tenant_id) do nothing;

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
  where e.publicado is true and e.visible is distinct from false
  on conflict (tenant_id, exercise_id) do nothing;

  execute 'create trigger teacher_activity_rollout_new_tenant '
    || 'after insert on public.tenants for each row '
    || 'execute function private.teacher_activity_rollout_new_tenant()';
  execute 'create trigger teacher_activity_capture_exercise '
    || 'after insert or update of publicado, visible on public.ejercicios '
    || 'for each row execute function private.teacher_activity_capture_exercise()';
  execute 'create trigger teacher_activity_capture_link '
    || 'after insert or update of activo, ejercicio_id, asignacion_profesor_id, '
    || 'periodo_evaluacion_id on public.vinculos_evaluacion_ejercicio '
    || 'for each row execute function private.teacher_activity_capture_link()';
  execute 'create trigger teacher_activity_capture_period '
    || 'after update of estado on public.periodos_evaluacion '
    || 'for each row execute function private.teacher_activity_capture_period()';
  execute 'create trigger teacher_activity_capture_assignment '
    || 'after update of activo on public.asignaciones_profesor '
    || 'for each row execute function private.teacher_activity_capture_assignment()';
end;
$cutover$;

-- Bounded weekly review scans on the existing results table.
create index if not exists teacher_activity_results_submitted_idx
  on public.resultados_ejercicios (tenant_id, primer_envio_en)
  where primer_envio_en is not null;
create index if not exists teacher_activity_results_reviewed_idx
  on public.resultados_ejercicios (tenant_id, calificado_at)
  where calificado_at is not null and calificado_por is not null;

comment on table public.teacher_activity_publication_events is
  'First qualifying post-rollout student-visible publication per tenant/logical exercise; immutable author and time snapshot.';
comment on table public.teacher_activity_tracking_rollouts is
  'Per-tenant start of forward-only teacher activity evidence; weeks before activation are not certified.';
comment on table public.teacher_activity_weekly_exceptions is
  'Tenant-admin-authorized weekly goal exceptions; no student data.';
