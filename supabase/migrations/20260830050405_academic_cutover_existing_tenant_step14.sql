-- Paso 14: backfill y corte controlado por tenant.
--
-- La migracion es aditiva e idempotente: no borra historia, no cambia IDs y
-- no inventa calificaciones. El modo `dual` habilita el canon 0-10 mientras
-- conserva la sombra legacy durante la ventana de observacion.
set search_path = '';

create table if not exists public.tenant_academic_rollout (
  tenant_id uuid primary key
    references public.tenants(id) on delete cascade,
  mode text not null default 'legacy',
  migration_version text,
  observation_started_at timestamptz,
  observation_ends_at timestamptz,
  activated_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_academic_rollout_mode_valid
    check (mode in ('legacy', 'dual', 'canonical')),
  constraint tenant_academic_rollout_version_nonempty
    check (migration_version is null or btrim(migration_version) <> ''),
  constraint tenant_academic_rollout_observation_coherent check (
    (mode = 'legacy')
    or (
      migration_version is not null
      and observation_started_at is not null
      and observation_ends_at is not null
      and observation_started_at <= observation_ends_at
    )
  ),
  constraint tenant_academic_rollout_activation_coherent check (
    (mode <> 'canonical') or activated_at is not null
  )
);

comment on table public.tenant_academic_rollout is
  'Flag persistente por tenant: legacy=apagado, dual=canon activo con sombra de rollback, canonical=corte certificado.';
comment on column public.tenant_academic_rollout.details is
  'Metricas tecnicas sin PII usadas para evidenciar el corte.';

create index if not exists tenant_academic_rollout_mode_idx
  on public.tenant_academic_rollout (mode, tenant_id);

alter table public.tenant_academic_rollout enable row level security;
alter table public.tenant_academic_rollout force row level security;
drop policy if exists tenant_academic_rollout_member_read
  on public.tenant_academic_rollout;
create policy tenant_academic_rollout_member_read
  on public.tenant_academic_rollout
  for select to authenticated
  using ((select private.has_active_tenant_membership(tenant_id)));

revoke all on table public.tenant_academic_rollout from public, anon, authenticated;
grant select on table public.tenant_academic_rollout to authenticated;
grant all on table public.tenant_academic_rollout to service_role;

create or replace function private.provision_tenant_academic_rollout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_academic_rollout (tenant_id, mode, details)
  values (new.id, 'legacy', jsonb_build_object(
    'provisioning', 'empty',
    'createdBy', 'tenant-trigger'
  ))
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;
revoke all on function private.provision_tenant_academic_rollout()
  from public, anon, authenticated;

drop trigger if exists provision_tenant_academic_rollout on public.tenants;
create trigger provision_tenant_academic_rollout
  after insert on public.tenants
  for each row execute function private.provision_tenant_academic_rollout();

insert into public.tenant_academic_rollout (tenant_id, mode, details)
select t.id, 'legacy', jsonb_build_object(
  'provisioning', 'existing',
  'createdBy', 'step14'
)
from public.tenants t
on conflict (tenant_id) do nothing;

alter table public.esquemas_evaluacion
  add column if not exists migration_version text;
alter table public.vinculos_evaluacion_ejercicio
  add column if not exists migration_version text;
alter table public.resultados_ejercicios
  add column if not exists migration_version text;

do $migration_marker_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.esquemas_evaluacion'::regclass
      and conname = 'esquemas_evaluacion_migration_version_nonempty'
  ) then
    alter table public.esquemas_evaluacion
      add constraint esquemas_evaluacion_migration_version_nonempty
      check (migration_version is null or btrim(migration_version) <> '');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vinculos_evaluacion_ejercicio'::regclass
      and conname = 'vinculos_evaluacion_migration_version_nonempty'
  ) then
    alter table public.vinculos_evaluacion_ejercicio
      add constraint vinculos_evaluacion_migration_version_nonempty
      check (migration_version is null or btrim(migration_version) <> '');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.resultados_ejercicios'::regclass
      and conname = 'resultados_ejercicios_migration_version_nonempty'
  ) then
    alter table public.resultados_ejercicios
      add constraint resultados_ejercicios_migration_version_nonempty
      check (migration_version is null or btrim(migration_version) <> '');
  end if;
end
$migration_marker_constraints$;

create index if not exists esquemas_evaluacion_migration_version_idx
  on public.esquemas_evaluacion (tenant_id, migration_version)
  where migration_version is not null;
create index if not exists vinculos_evaluacion_migration_version_idx
  on public.vinculos_evaluacion_ejercicio (tenant_id, migration_version)
  where migration_version is not null;
create index if not exists resultados_ejercicios_migration_version_idx
  on public.resultados_ejercicios (tenant_id, migration_version)
  where migration_version is not null;

-- Preflight bloqueante. Una asignacion ambigua puede corregirse manualmente;
-- elegir una por orden o fecha seria mezclar grupos y profesores.
do $step14_preflight$
begin
  if exists (
    select 1
    from public.resultados_ejercicios r
    where r.calificacion is not null and r.calificacion not between 0 and 10
       or r.calificacion_manual is not null and r.calificacion_manual not between 0 and 10
  ) then
    raise exception 'STEP14_PREFLIGHT: calificacion fuera de la escala 0-10';
  end if;

  if exists (
    select 1
    from public.resultados_ejercicios r
    where r.calificacion is distinct from r.calificacion_manual
  ) then
    raise exception 'STEP14_PREFLIGHT: canon y sombra legacy discrepan';
  end if;

  if exists (
    select 1
    from public.vinculos_evaluacion_ejercicio v
    where v.activo
    group by v.tenant_id, v.ejercicio_id
    having count(*) > 1
  ) then
    raise exception 'STEP14_PREFLIGHT: ejercicio con mas de un vinculo activo';
  end if;

  if exists (
    with exercise_candidates as (
      select e.tenant_id, e.id,
             count(distinct a.id) as matches
      from public.ejercicios e
      join public.temas t
        on t.id = e.tema_id and t.tenant_id = e.tenant_id
      join public.unidades u
        on u.id = t.unidad_id and u.tenant_id = t.tenant_id
      left join public.asignaciones_profesor a
        on a.tenant_id = e.tenant_id
       and a.materia_id = u.materia_id
       and a.activo
      where not exists (
        select 1 from public.vinculos_evaluacion_ejercicio v
        where v.tenant_id = e.tenant_id
          and v.ejercicio_id = e.id
          and v.activo
      )
      group by e.tenant_id, e.id
    )
    select 1 from exercise_candidates where matches > 1
  ) then
    raise exception 'STEP14_PREFLIGHT: ejercicio sin vinculo tiene asignacion ambigua';
  end if;

  if exists (
    select 1
    from public.resultados_ejercicios r
    where r.registro_legacy
      and not exists (
        select 1
        from public.ejercicios e
        join public.temas t
          on t.id = e.tema_id and t.tenant_id = e.tenant_id
        join public.unidades u
          on u.id = t.unidad_id and u.tenant_id = t.tenant_id
        join public.asignaciones_profesor a
          on a.tenant_id = e.tenant_id
         and a.materia_id = u.materia_id
         and a.activo
        join public.inscripciones_alumno i
          on i.tenant_id = r.tenant_id
         and i.ciclo_escolar_id = a.ciclo_escolar_id
         and i.grupo_id = a.grupo_id
         and i.alumno_id = r.alumno_id
         and i.activo
        where e.id = r.ejercicio_id
          and e.tenant_id = r.tenant_id
      )
  ) then
    raise exception 'STEP14_PREFLIGHT: resultado legacy sin contexto academico conciliable';
  end if;
end
$step14_preflight$;

-- Esquema inicial: sólo para asignacion/periodo sin configuracion vigente.
-- Los parametros provienen de D-04 a D-08 y no sustituyen configuraciones ya
-- creadas por una institucion.
with targets as (
  select a.tenant_id, a.ciclo_escolar_id,
         a.id as assignment_id, p.id as period_id, p.nombre as period_name,
         coalesce(
           (select pr.id from public.profiles pr
            where pr.id = a.profesor_id and pr.tenant_id = a.tenant_id
              and pr.estatus = 'activo'),
           (select pr.id from public.profiles pr
            where pr.tenant_id = a.tenant_id
              and pr.rol in ('superuser', 'admin') and pr.estatus = 'activo'
            order by case when pr.rol = 'superuser' then 0 else 1 end, pr.id
            limit 1)
         ) as creator_id
  from public.asignaciones_profesor a
  join public.ciclos_escolares c
    on c.id = a.ciclo_escolar_id and c.tenant_id = a.tenant_id
   and c.estado = 'activo'
  join public.periodos_evaluacion p
    on p.ciclo_escolar_id = c.id and p.tenant_id = c.tenant_id
   and p.estado <> 'cerrado'
  where a.activo
    and not exists (
      select 1 from public.esquemas_evaluacion existing
      where existing.tenant_id = a.tenant_id
        and existing.asignacion_profesor_id = a.id
        and existing.periodo_evaluacion_id = p.id
        and existing.estado in ('borrador', 'activo')
    )
)
insert into public.esquemas_evaluacion (
  tenant_id, ciclo_escolar_id, asignacion_profesor_id,
  periodo_evaluacion_id, nombre, calificacion_aprobatoria,
  decimales_mostrados, modo_redondeo, regla_no_entrego,
  valor_no_entrego, regla_justificado, estado, version, created_by,
  migration_version
)
select tenant_id, ciclo_escolar_id, assignment_id, period_id,
       'Esquema inicial · ' || period_name,
       6.0000, 1, 'half_up', 'zero_on_close', 0.0000, 'exclude',
       'borrador', 1, creator_id, 'step14-context-v1'
from targets
where creator_id is not null
on conflict (tenant_id, asignacion_profesor_id, periodo_evaluacion_id, version)
do nothing;

insert into public.criterios_evaluacion (
  tenant_id, esquema_evaluacion_id, nombre, tipo, peso, orden,
  activo, created_by
)
select e.tenant_id, e.id, 'Actividades', 'actividades', 100.0000, 1,
       true, e.created_by
from public.esquemas_evaluacion e
where e.migration_version = 'step14-context-v1'
  and e.estado = 'borrador'
  and not exists (
    select 1 from public.criterios_evaluacion c
    where c.tenant_id = e.tenant_id and c.esquema_evaluacion_id = e.id
  )
on conflict (tenant_id, esquema_evaluacion_id, orden) do nothing;

do $step14_scheme_validation$
begin
  if exists (
    select 1
    from public.esquemas_evaluacion e
    left join public.criterios_evaluacion c
      on c.tenant_id = e.tenant_id
     and c.esquema_evaluacion_id = e.id and c.activo
    where e.migration_version = 'step14-context-v1'
      and e.estado = 'borrador'
    group by e.id
    having count(c.id) = 0 or sum(c.peso) <> 100.0000
  ) then
    raise exception 'STEP14_PREFLIGHT: esquema inicial no suma 100';
  end if;
end
$step14_scheme_validation$;

update public.esquemas_evaluacion e
set estado = 'activo'
where e.migration_version = 'step14-context-v1'
  and e.estado = 'borrador'
  and exists (
    select 1 from public.criterios_evaluacion c
    where c.tenant_id = e.tenant_id and c.esquema_evaluacion_id = e.id
      and c.activo
    group by c.esquema_evaluacion_id
    having sum(c.peso) = 100.0000
  );

-- Vínculo determinista al primer periodo aprobado. Sólo se insertan ejercicios
-- con una unica asignacion candidata; la preflight ya aborto ambigüedades.
with candidates as (
  select e.tenant_id, e.id as exercise_id, e.tipo as exercise_type,
         a.id as assignment_id, a.ciclo_escolar_id,
         p.id as period_id, c.id as criterion_id,
         coalesce(
           (select pr.id from public.profiles pr
            where pr.id = e.created_by and pr.tenant_id = e.tenant_id),
           s.created_by
         ) as creator_id,
         count(*) over (partition by e.tenant_id, e.id) as matches
  from public.ejercicios e
  join public.temas t
    on t.id = e.tema_id and t.tenant_id = e.tenant_id
  join public.unidades u
    on u.id = t.unidad_id and u.tenant_id = t.tenant_id
  join public.asignaciones_profesor a
    on a.tenant_id = e.tenant_id and a.materia_id = u.materia_id and a.activo
  join public.periodos_evaluacion p
    on p.tenant_id = a.tenant_id and p.ciclo_escolar_id = a.ciclo_escolar_id
   and p.orden = 1 and p.estado <> 'cerrado'
  join public.esquemas_evaluacion s
    on s.tenant_id = a.tenant_id and s.asignacion_profesor_id = a.id
   and s.periodo_evaluacion_id = p.id and s.estado = 'activo'
  join public.criterios_evaluacion c
    on c.tenant_id = s.tenant_id and c.esquema_evaluacion_id = s.id
   and c.activo and c.tipo in ('actividades', 'hibrido')
  where not exists (
    select 1 from public.vinculos_evaluacion_ejercicio v
    where v.tenant_id = e.tenant_id and v.ejercicio_id = e.id and v.activo
  )
), unique_candidates as (
  select * from candidates where matches = 1
)
insert into public.vinculos_evaluacion_ejercicio (
  tenant_id, ciclo_escolar_id, asignacion_profesor_id,
  periodo_evaluacion_id, criterio_evaluacion_id,
  ejercicio_id, origen, activo, created_by, migration_version
)
select tenant_id, ciclo_escolar_id, assignment_id, period_id, criterion_id,
       exercise_id,
       case when exercise_type = 'actividad_descriptiva'
         then 'descriptiveSubmission' else 'automaticExercise' end,
       true, creator_id, 'step14-exercise-links-v1'
from unique_candidates
where creator_id is not null
on conflict (tenant_id, asignacion_profesor_id, periodo_evaluacion_id, ejercicio_id)
do nothing;

-- Resultados legacy: completar contexto sin tocar el valor 0-10. La marca
-- evita que una repeticion vuelva a transformar una fila ya conciliada.
with candidates as (
  select r.id as result_id, v.id as link_id, v.ciclo_escolar_id,
         i.id as enrollment_id, t.unidad_id, v.origen,
         v.created_by as fallback_grader,
         count(*) over (partition by r.id) as matches
  from public.resultados_ejercicios r
  join public.vinculos_evaluacion_ejercicio v
    on v.tenant_id = r.tenant_id
   and v.ejercicio_id = r.ejercicio_id and v.activo
  join public.asignaciones_profesor a
    on a.id = v.asignacion_profesor_id and a.tenant_id = v.tenant_id and a.activo
  join public.inscripciones_alumno i
    on i.tenant_id = r.tenant_id
   and i.ciclo_escolar_id = v.ciclo_escolar_id
   and i.grupo_id = a.grupo_id
   and i.alumno_id = r.alumno_id and i.activo
  join public.ejercicios e
    on e.id = r.ejercicio_id and e.tenant_id = r.tenant_id
  join public.temas t
    on t.id = e.tema_id and t.tenant_id = e.tenant_id
  where r.registro_legacy
), unique_candidates as (
  select * from candidates where matches = 1
)
update public.resultados_ejercicios r
set inscripcion_alumno_id = c.enrollment_id,
    vinculo_evaluacion_id = c.link_id,
    unidad_origen_id = c.unidad_id,
    origen = c.origen,
    calificado_por = case when r.estado = 'calificado'
      then coalesce(r.calificado_por, c.fallback_grader) else null end,
    calificado_at = case when r.estado = 'calificado'
      then coalesce(r.calificado_at, r.fecha_completado, now()) else null end,
    registro_legacy = false,
    migration_version = 'step14-grade10-v1'
from unique_candidates c
where r.id = c.result_id and r.registro_legacy;

-- Sólo entra en dual un tenant con ciclo activo, contexto completo, cero
-- legacy y cero discrepancias. Los tenants nuevos permanecen en legacy y sin
-- ciclos, periodos, esquemas ni datos de muestra.
with eligible as (
  select t.id as tenant_id
  from public.tenants t
  where t.estado = 'activo'
    and exists (
      select 1 from public.ciclos_escolares cycle
      where cycle.tenant_id = t.id and cycle.estado = 'activo'
    )
    and not exists (
      select 1 from public.resultados_ejercicios r
      where r.tenant_id = t.id and r.registro_legacy
    )
    and not exists (
      select 1 from public.resultados_ejercicios r
      where r.tenant_id = t.id
        and r.calificacion is distinct from r.calificacion_manual
    )
    and not exists (
      select 1 from public.ejercicios e
      where e.tenant_id = t.id
        and not exists (
          select 1 from public.vinculos_evaluacion_ejercicio v
          where v.tenant_id = e.tenant_id and v.ejercicio_id = e.id and v.activo
        )
    )
)
update public.tenant_academic_rollout rollout
set mode = 'dual',
    migration_version = 'step14-cutover-v1',
    observation_started_at = coalesce(rollout.observation_started_at, now()),
    observation_ends_at = coalesce(rollout.observation_ends_at, now() + interval '7 days'),
    details = rollout.details || jsonb_build_object(
      'scale', '0-10',
      'shadow', 'calificacion_manual',
      'rollbackAvailable', true,
      'exerciseInventoryPolicy', 'all-current'
    ),
    updated_at = now()
from eligible
where rollout.tenant_id = eligible.tenant_id
  and rollout.mode = 'legacy';

-- Comparacion dual sin PII. Los agregados no exponen alumnos, profesores,
-- correos, nombres, respuestas ni rutas de archivos.
create or replace view public.vista_metricas_corte_academico
with (security_invoker = true)
as
select t.id as tenant_id,
       coalesce(r.mode, 'legacy') as rollout_mode,
       r.migration_version,
       r.observation_started_at,
       r.observation_ends_at,
       coalesce(ex.exercise_count, 0)::bigint as exercise_count,
       coalesce(ex.linked_exercise_count, 0)::bigint as linked_exercise_count,
       coalesce(gr.result_count, 0)::bigint as result_count,
       coalesce(gr.legacy_result_count, 0)::bigint as legacy_result_count,
       coalesce(gr.out_of_range_count, 0)::bigint as out_of_range_count,
       coalesce(gr.shadow_difference_count, 0)::bigint as shadow_difference_count,
       coalesce(gr.orphan_context_count, 0)::bigint as orphan_context_count
from public.tenants t
left join public.tenant_academic_rollout r on r.tenant_id = t.id
left join lateral (
  select count(*) as exercise_count,
         count(*) filter (where exists (
           select 1 from public.vinculos_evaluacion_ejercicio v
           where v.tenant_id = e.tenant_id
             and v.ejercicio_id = e.id and v.activo
         )) as linked_exercise_count
  from public.ejercicios e where e.tenant_id = t.id
) ex on true
left join lateral (
  select count(*) as result_count,
         count(*) filter (where g.registro_legacy) as legacy_result_count,
         count(*) filter (where g.calificacion is not null
                           and g.calificacion not between 0 and 10)
           as out_of_range_count,
         count(*) filter (where g.calificacion is distinct from g.calificacion_manual)
           as shadow_difference_count,
         count(*) filter (where not g.registro_legacy and (
           g.inscripcion_alumno_id is null or g.vinculo_evaluacion_id is null
           or g.unidad_origen_id is null or g.origen is null
         )) as orphan_context_count
  from public.resultados_ejercicios g where g.tenant_id = t.id
) gr on true
where (select private.has_active_tenant_membership(t.id))
   or current_user in ('postgres', 'supabase_admin', 'service_role');

revoke all on table public.vista_metricas_corte_academico
  from public, anon, authenticated;
grant select on table public.vista_metricas_corte_academico
  to authenticated, service_role;

-- Auditoria agregada, idempotente y sin PII.
insert into public.auditoria (
  tenant_id, user_id, accion, entidad, entidad_id, detalles
)
select metrics.tenant_id, null, 'academic.cutover.dual_started',
       'tenant_academic_rollout', metrics.tenant_id,
       jsonb_build_object(
         'migration', 'step14-cutover-v1',
         'rolloutMode', metrics.rollout_mode,
         'exerciseCount', metrics.exercise_count,
         'linkedExerciseCount', metrics.linked_exercise_count,
         'resultCount', metrics.result_count,
         'legacyResultCount', metrics.legacy_result_count,
         'outOfRangeCount', metrics.out_of_range_count,
         'shadowDifferenceCount', metrics.shadow_difference_count,
         'orphanContextCount', metrics.orphan_context_count
       )
from public.vista_metricas_corte_academico metrics
where metrics.rollout_mode = 'dual'
  and not exists (
    select 1 from public.auditoria audit
    where audit.tenant_id = metrics.tenant_id
      and audit.accion = 'academic.cutover.dual_started'
      and audit.detalles ->> 'migration' = 'step14-cutover-v1'
  );

do $step14_postflight$
begin
  if exists (
    select 1 from public.vista_metricas_corte_academico
    where rollout_mode in ('dual', 'canonical')
      and (
        exercise_count <> linked_exercise_count
        or legacy_result_count <> 0
        or out_of_range_count <> 0
        or shadow_difference_count <> 0
        or orphan_context_count <> 0
      )
  ) then
    raise exception 'STEP14_POSTFLIGHT: tenant habilitado conserva discrepancias';
  end if;
end
$step14_postflight$;
