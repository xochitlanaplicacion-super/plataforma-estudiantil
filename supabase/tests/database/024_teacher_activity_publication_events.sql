-- Run after the academic fixture and teacher activity migrations.
-- Fixture exercise ...0012 was accessible before tracking began.
begin;

do $teacher_activity_events_test$
declare
  tenant_a constant uuid := '10000000-0000-4000-8000-000000000001';
  teacher_a constant uuid := '1a000000-0000-4000-8000-000000000003';
  admin_a constant uuid := '1a000000-0000-4000-8000-000000000001';
  topic_a constant uuid := '17000000-0000-4000-8000-000000000012';
  historical_id constant uuid := '18000000-0000-4000-8000-000000000012';
  published_id constant uuid := '24000000-0000-4000-8000-000000000101';
  synced_id constant uuid := '24000000-0000-4000-8000-000000000102';
  link_later_id constant uuid := '24000000-0000-4000-8000-000000000103';
  assignment_later_id constant uuid := '24000000-0000-4000-8000-000000000104';
  period_later_id constant uuid := '24000000-0000-4000-8000-000000000105';
  historical_copy_id constant uuid := '24000000-0000-4000-8000-000000000106';
  logical_id constant uuid := '24000000-0000-4000-8000-000000000201';
  historical_logical_id constant uuid := '24000000-0000-4000-8000-000000000202';
  source_link public.vinculos_evaluacion_ejercicio%rowtype;
  draft_period_id uuid;
  active_period_id uuid;
  draft_criterion_id uuid;
  original_event record;
  source_subject_name text;
begin
  select * into strict source_link
  from public.vinculos_evaluacion_ejercicio
  where tenant_id = tenant_a and ejercicio_id = historical_id;
  active_period_id := source_link.periodo_evaluacion_id;
  select m.nombre into strict source_subject_name
  from public.asignaciones_profesor a
  join public.materias m on m.id = a.materia_id and m.tenant_id = a.tenant_id
  where a.id = source_link.asignacion_profesor_id and a.tenant_id = tenant_a;
  select id into strict draft_period_id
  from public.periodos_evaluacion
  where tenant_id = tenant_a and ciclo_escolar_id = source_link.ciclo_escolar_id
    and orden = 2;
  select c.id into strict draft_criterion_id
  from public.criterios_evaluacion c
  join public.esquemas_evaluacion s on s.id = c.esquema_evaluacion_id
  where s.tenant_id = tenant_a
    and s.asignacion_profesor_id = source_link.asignacion_profesor_id
    and s.periodo_evaluacion_id = draft_period_id
    and s.estado = 'activo' and c.tipo = 'actividades' and c.activo
  limit 1;

  if not exists (
    select 1 from private.teacher_activity_publication_baseline
    where tenant_id = tenant_a and exercise_id = historical_id
  ) then raise exception 'Already-visible historical activity was not excluded'; end if;
  if exists (select 1 from public.teacher_activity_publication_events) then
    raise exception 'Migration backfilled publication events';
  end if;

  update public.ejercicios set visible = false, publicado = false
  where id = historical_id;
  update public.ejercicios set visible = true where id = historical_id;
  update public.vinculos_evaluacion_ejercicio set activo = false
    where id = source_link.id;
  update public.vinculos_evaluacion_ejercicio set activo = true
    where id = source_link.id;
  if exists (select 1 from public.teacher_activity_publication_events) then
    raise exception 'Historical edit or relink fabricated an event';
  end if;

  update public.ejercicios set sync_id = historical_logical_id
    where id = historical_id;
  insert into public.ejercicios
    (id, tenant_id, tema_id, titulo, tipo, created_by, publicado, visible, sync_id)
  values (historical_copy_id, tenant_a, topic_a, 'Historical copy',
    'opcion_multiple', teacher_a, false, false, historical_logical_id);
  insert into public.vinculos_evaluacion_ejercicio
    (tenant_id, ciclo_escolar_id, asignacion_profesor_id,
     periodo_evaluacion_id, criterio_evaluacion_id, ejercicio_id, origen,
     created_by)
  values (tenant_a, source_link.ciclo_escolar_id,
    source_link.asignacion_profesor_id, active_period_id,
    source_link.criterio_evaluacion_id, historical_copy_id,
    source_link.origen, teacher_a);
  if exists (select 1 from public.teacher_activity_publication_events) then
    raise exception 'Historical synced copy fabricated an event';
  end if;

  insert into public.ejercicios
    (id, tenant_id, tema_id, titulo, tipo, created_by, publicado, visible,
     sync_id, fecha_entrega)
  values (published_id, tenant_a, topic_a, 'Original task',
    'actividad_descriptiva', teacher_a, false, false, logical_id,
    '2026-10-09T23:59:00Z');
  insert into public.vinculos_evaluacion_ejercicio
    (tenant_id, ciclo_escolar_id, asignacion_profesor_id,
     periodo_evaluacion_id, criterio_evaluacion_id, ejercicio_id, origen,
     created_by)
  values (tenant_a, source_link.ciclo_escolar_id,
    source_link.asignacion_profesor_id, active_period_id,
    source_link.criterio_evaluacion_id, published_id,
    'descriptiveSubmission', teacher_a);
  if not exists (
    select 1 from public.teacher_activity_publication_events
    where exercise_id = published_id
  ) then raise exception 'Active link did not publish an unflagged activity'; end if;
  select * into strict original_event
  from public.teacher_activity_publication_events
  where exercise_id = published_id;
  update public.ejercicios set publicado = true, visible = true
  where id = published_id;
  if original_event.credited_teacher_id <> teacher_a
     or original_event.logical_activity_id <> logical_id
     or original_event.title_snapshot <> 'Original task'
     or original_event.type_snapshot <> 'actividad_descriptiva'
     or original_event.subject_name_snapshot is distinct from source_subject_name
     or original_event.due_at_snapshot <> '2026-10-09T23:59:00Z'::timestamptz
     or original_event.group_ids_snapshot <> array[
       '14000000-0000-4000-8000-000000000001'::uuid]
     or original_event.group_names_snapshot <> array['Grupo A']::text[] then
    raise exception 'First publication snapshot was incomplete';
  end if;
  if original_event.published_at < (
    select activated_at from public.teacher_activity_tracking_rollouts
    where tenant_id = tenant_a
  ) then raise exception 'Event predates rollout'; end if;

  update public.ejercicios
  set created_by = admin_a, titulo = 'Edited title', tipo = 'opcion_multiple',
      fecha_entrega = '2026-10-20T23:59:00Z'
  where id = published_id;
  update public.grupos set nombre = 'Renamed group'
  where id = '14000000-0000-4000-8000-000000000001';
  update public.materias set nombre = 'Renamed subject'
  where id = (
    select materia_id from public.asignaciones_profesor
    where id = source_link.asignacion_profesor_id and tenant_id = tenant_a
  ) and tenant_id = tenant_a;
  if not exists (
    select 1 from public.teacher_activity_publication_events
    where id = original_event.id and credited_teacher_id = teacher_a
      and title_snapshot = 'Original task'
      and type_snapshot = 'actividad_descriptiva'
      and subject_name_snapshot = source_subject_name
      and group_names_snapshot = array['Grupo A']::text[]
      and published_at = original_event.published_at
  ) then raise exception 'Later author/content/group edits changed evidence'; end if;

  insert into public.ejercicios
    (id, tenant_id, tema_id, titulo, tipo, created_by, publicado, visible, sync_id)
  values (synced_id, tenant_a, topic_a, 'Synced copy',
    'actividad_descriptiva', teacher_a, true, true, logical_id);
  insert into public.vinculos_evaluacion_ejercicio
    (tenant_id, ciclo_escolar_id, asignacion_profesor_id,
     periodo_evaluacion_id, criterio_evaluacion_id, ejercicio_id, origen,
     created_by)
  values (tenant_a, source_link.ciclo_escolar_id,
    source_link.asignacion_profesor_id, active_period_id,
    source_link.criterio_evaluacion_id, synced_id,
    'descriptiveSubmission', teacher_a);
  if (select count(*) from public.teacher_activity_publication_events
      where tenant_id = tenant_a and logical_activity_id = logical_id) <> 1 then
    raise exception 'Synced copy duplicated original publication';
  end if;

  insert into public.ejercicios
    (id, tenant_id, tema_id, titulo, created_by, publicado, visible)
  values (link_later_id, tenant_a, topic_a, 'Link later', teacher_a, false, false);
  if exists (select 1 from public.teacher_activity_publication_events
    where exercise_id = link_later_id) then
    raise exception 'Unlinked activity emitted an event';
  end if;
  insert into public.vinculos_evaluacion_ejercicio
    (tenant_id, ciclo_escolar_id, asignacion_profesor_id,
     periodo_evaluacion_id, criterio_evaluacion_id, ejercicio_id, origen,
     created_by)
  values (tenant_a, source_link.ciclo_escolar_id,
    source_link.asignacion_profesor_id, active_period_id,
    source_link.criterio_evaluacion_id, link_later_id,
    source_link.origen, teacher_a);
  if not exists (select 1 from public.teacher_activity_publication_events
    where exercise_id = link_later_id) then
    raise exception 'First active link did not create an event';
  end if;

  insert into public.ejercicios
    (id, tenant_id, tema_id, titulo, created_by, publicado, visible)
  values (assignment_later_id, tenant_a, topic_a, 'Assignment later',
    teacher_a, false, false);
  update public.asignaciones_profesor set activo = false
  where id = source_link.asignacion_profesor_id;
  insert into public.vinculos_evaluacion_ejercicio
    (tenant_id, ciclo_escolar_id, asignacion_profesor_id,
     periodo_evaluacion_id, criterio_evaluacion_id, ejercicio_id, origen,
     created_by)
  values (tenant_a, source_link.ciclo_escolar_id,
    source_link.asignacion_profesor_id, active_period_id,
    source_link.criterio_evaluacion_id, assignment_later_id,
    source_link.origen, teacher_a);
  if exists (select 1 from public.teacher_activity_publication_events
    where exercise_id = assignment_later_id) then
    raise exception 'Inactive assignment emitted an event';
  end if;
  update public.asignaciones_profesor set activo = true
  where id = source_link.asignacion_profesor_id;
  if not exists (select 1 from public.teacher_activity_publication_events
    where exercise_id = assignment_later_id) then
    raise exception 'Assignment activation missed first visibility';
  end if;

  insert into public.ejercicios
    (id, tenant_id, tema_id, titulo, created_by, publicado, visible)
  values (period_later_id, tenant_a, topic_a, 'Period later',
    teacher_a, false, false);
  insert into public.vinculos_evaluacion_ejercicio
    (tenant_id, ciclo_escolar_id, asignacion_profesor_id,
     periodo_evaluacion_id, criterio_evaluacion_id, ejercicio_id, origen,
     created_by)
  values (tenant_a, source_link.ciclo_escolar_id,
    source_link.asignacion_profesor_id, draft_period_id,
    draft_criterion_id, period_later_id,
    source_link.origen, teacher_a);
  if exists (select 1 from public.teacher_activity_publication_events
    where exercise_id = period_later_id) then
    raise exception 'Draft period emitted an event';
  end if;
  update public.periodos_evaluacion set estado = 'borrador'
  where id = active_period_id;
  update public.periodos_evaluacion set estado = 'activo'
  where id = draft_period_id;
  if not exists (select 1 from public.teacher_activity_publication_events
    where exercise_id = period_later_id) then
    raise exception 'Period activation missed first visibility';
  end if;

  begin
    update public.teacher_activity_publication_events
    set title_snapshot = 'Tampered' where id = original_event.id;
    raise exception 'Event update unexpectedly succeeded';
  exception when sqlstate '23514' then null;
  end;
  begin
    delete from public.teacher_activity_publication_events
    where id = original_event.id;
    raise exception 'Event delete unexpectedly succeeded';
  exception when sqlstate '23514' then null;
  end;
end;
$teacher_activity_events_test$;

insert into public.tenants(id,nombre,estado)
values ('24000000-0000-4000-8000-000000000301','New tenant','activo');
do $rollout_test$
begin
  if not exists (select 1 from public.teacher_activity_tracking_rollouts
    where tenant_id='24000000-0000-4000-8000-000000000301') then
    raise exception 'New tenant lacks tracking rollout';
  end if;
  if has_table_privilege('authenticated',
    'public.teacher_activity_publication_events','INSERT')
    or has_table_privilege('authenticated',
      'public.teacher_activity_publication_events','UPDATE')
    or has_table_privilege('authenticated',
      'public.teacher_activity_publication_events','DELETE') then
    raise exception 'Client can mutate publication evidence';
  end if;
end;
$rollout_test$;

set local role authenticated;
select set_config('request.jwt.claim.sub',
  '1a000000-0000-4000-8000-000000000001',true);
insert into public.teacher_activity_weekly_exceptions
  (tenant_id,teacher_id,week_start,kind,teacher_started_on,note,authorized_by,created_at,updated_at)
values ('10000000-0000-4000-8000-000000000001',
  '1a000000-0000-4000-8000-000000000003','2026-09-28',
  'ingreso_tardio','2026-09-30','Alta el miércoles',
  '1a000000-0000-4000-8000-000000000001',
  '2000-01-01T00:00:00Z','2000-01-01T00:00:00Z');
do $admin_exception_test$
begin
  if not exists (select 1 from public.teacher_activity_weekly_exceptions
    where teacher_id='1a000000-0000-4000-8000-000000000003'
      and teacher_started_on='2026-09-30'
      and authorized_by=auth.uid()
      and created_at > '2026-09-01T00:00:00Z'
      and updated_at = created_at) then
    raise exception 'Admin exception not visible or not stamped';
  end if;
end;
$admin_exception_test$;

select set_config('request.jwt.claim.sub',
  '1a000000-0000-4000-8000-000000000003',true);
do $teacher_access_test$
begin
  if (select count(*) from public.teacher_activity_publication_events) <> 4 then
    raise exception 'Teacher cannot read exactly own four new events';
  end if;
  if (select count(*) from public.teacher_activity_weekly_exceptions) <> 1 then
    raise exception 'Teacher cannot read own weekly exception';
  end if;
  begin
    insert into public.teacher_activity_weekly_exceptions
      (tenant_id,teacher_id,week_start,kind,authorized_by)
    values ('10000000-0000-4000-8000-000000000001',
      '1a000000-0000-4000-8000-000000000003','2026-10-05',
      'vacaciones',auth.uid());
    raise exception 'Teacher created an admin-only exception';
  exception when insufficient_privilege then null;
  end;
end;
$teacher_access_test$;

select set_config('request.jwt.claim.sub',
  '2a000000-0000-4000-8000-000000000001',true);
do $tenant_isolation_test$
begin
  if exists (select 1 from public.teacher_activity_publication_events)
    or exists (select 1 from public.teacher_activity_weekly_exceptions
      where tenant_id='10000000-0000-4000-8000-000000000001')
    or exists (select 1 from public.teacher_activity_tracking_rollouts
      where tenant_id='10000000-0000-4000-8000-000000000001') then
    raise exception 'Another tenant can read activity evidence or exceptions';
  end if;
end;
$tenant_isolation_test$;

rollback;
