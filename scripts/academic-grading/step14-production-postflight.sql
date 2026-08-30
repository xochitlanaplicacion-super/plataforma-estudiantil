\set ON_ERROR_STOP on
begin transaction read only;

select tenant_id, rollout_mode, migration_version,
       observation_started_at, observation_ends_at,
       exercise_count, linked_exercise_count, result_count,
       legacy_result_count, out_of_range_count,
       shadow_difference_count, orphan_context_count
from public.vista_metricas_corte_academico
order by tenant_id;

select migration_version, count(*)::bigint
from public.esquemas_evaluacion
where migration_version is not null group by migration_version
union all
select migration_version, count(*)
from public.vinculos_evaluacion_ejercicio
where migration_version is not null group by migration_version
union all
select migration_version, count(*)
from public.resultados_ejercicios
where migration_version is not null group by migration_version
order by migration_version;

select version, name
from supabase_migrations.schema_migrations
where version='20260830050405';

rollback;
