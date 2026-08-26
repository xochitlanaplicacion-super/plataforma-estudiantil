\set ON_ERROR_STOP on
\pset pager off

begin read only;

-- Inventory scope. It deliberately excludes values containing PII and aliases tenant UUIDs.

select n.nspname as schema_name,
       c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       pg_get_userbyid(c.relowner) as owner
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
  and c.relname = any(array[
    'profiles', 'niveles', 'carreras', 'grados', 'grupos', 'materias',
    'grupo_materias', 'asignaciones_profesor', 'inscripciones_alumno',
    'ejercicios', 'resultados_ejercicios', 'fechas_evaluacion', 'auditoria'
  ])
order by c.relname;

select c.table_name, c.ordinal_position, c.column_name, c.data_type, c.udt_name,
       c.is_nullable, c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = any(array[
    'profiles', 'niveles', 'carreras', 'grados', 'grupos', 'materias',
    'grupo_materias', 'asignaciones_profesor', 'inscripciones_alumno',
    'ejercicios', 'resultados_ejercicios', 'fechas_evaluacion', 'auditoria'
  ])
order by c.table_name, c.ordinal_position;

select rel.relname as table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class rel on rel.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
  and rel.relname = any(array[
    'profiles', 'niveles', 'carreras', 'grados', 'grupos', 'materias',
    'grupo_materias', 'asignaciones_profesor', 'inscripciones_alumno',
    'ejercicios', 'resultados_ejercicios', 'fechas_evaluacion', 'auditoria'
  ])
order by rel.relname, con.conname;

select i.tablename, i.indexname, i.indexdef
from pg_catalog.pg_indexes i
where i.schemaname = 'public'
  and i.tablename = any(array[
    'profiles', 'niveles', 'carreras', 'grados', 'grupos', 'materias',
    'grupo_materias', 'asignaciones_profesor', 'inscripciones_alumno',
    'ejercicios', 'resultados_ejercicios', 'fechas_evaluacion', 'auditoria'
  ])
order by i.tablename, i.indexname;

select t.event_object_table, t.trigger_name, t.action_timing,
       t.event_manipulation, t.action_statement
from information_schema.triggers t
where t.event_object_schema = 'public'
  and t.event_object_table = any(array[
    'profiles', 'niveles', 'carreras', 'grados', 'grupos', 'materias',
    'grupo_materias', 'asignaciones_profesor', 'inscripciones_alumno',
    'ejercicios', 'resultados_ejercicios', 'fechas_evaluacion', 'auditoria'
  ])
order by t.event_object_table, t.trigger_name, t.event_manipulation;

select p.tablename, p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check
from pg_catalog.pg_policies p
where p.schemaname = 'public'
  and p.tablename = any(array[
    'profiles', 'niveles', 'carreras', 'grados', 'grupos', 'materias',
    'grupo_materias', 'asignaciones_profesor', 'inscripciones_alumno',
    'ejercicios', 'resultados_ejercicios', 'fechas_evaluacion', 'auditoria'
  ])
order by p.tablename, p.policyname;

select g.table_name, g.grantee,
       string_agg(g.privilege_type, ',' order by g.privilege_type) as privileges
from information_schema.role_table_grants g
where g.table_schema = 'public'
  and g.table_name = any(array[
    'profiles', 'niveles', 'carreras', 'grados', 'grupos', 'materias',
    'grupo_materias', 'asignaciones_profesor', 'inscripciones_alumno',
    'ejercicios', 'resultados_ejercicios', 'fechas_evaluacion', 'auditoria'
  ])
  and g.grantee in ('anon', 'authenticated', 'service_role')
group by g.table_name, g.grantee
order by g.table_name, g.grantee;

with tenant_alias as (
  select id, 'tenant_' || row_number() over (order by created_at, id) as alias
  from public.tenants
), counts as (
  select 'profiles' tabla, tenant_id, count(*) cantidad from public.profiles group by tenant_id union all
  select 'niveles', tenant_id, count(*) from public.niveles group by tenant_id union all
  select 'carreras', tenant_id, count(*) from public.carreras group by tenant_id union all
  select 'grados', tenant_id, count(*) from public.grados group by tenant_id union all
  select 'grupos', tenant_id, count(*) from public.grupos group by tenant_id union all
  select 'materias', tenant_id, count(*) from public.materias group by tenant_id union all
  select 'grupo_materias', tenant_id, count(*) from public.grupo_materias group by tenant_id union all
  select 'asignaciones_profesor', tenant_id, count(*) from public.asignaciones_profesor group by tenant_id union all
  select 'inscripciones_alumno', tenant_id, count(*) from public.inscripciones_alumno group by tenant_id union all
  select 'ejercicios', tenant_id, count(*) from public.ejercicios group by tenant_id union all
  select 'resultados_ejercicios', tenant_id, count(*) from public.resultados_ejercicios group by tenant_id union all
  select 'fechas_evaluacion', tenant_id, count(*) from public.fechas_evaluacion group by tenant_id union all
  select 'auditoria', tenant_id, count(*) from public.auditoria group by tenant_id
)
select c.tabla, coalesce(a.alias, 'sin_tenant') as tenant_alias, c.cantidad
from counts c left join tenant_alias a on a.id = c.tenant_id
order by c.tabla, a.alias;

select rol, estatus, count(*) as cantidad
from public.profiles
group by rol, estatus
order by rol, estatus;

select count(*) as rows,
       count(*) filter (where calificacion is null) as calificacion_null,
       min(calificacion) as calificacion_min, max(calificacion) as calificacion_max,
       count(*) filter (where calificacion < 0 or calificacion > 100) as calificacion_fuera_base_legacy,
       count(*) filter (where calificacion_manual is null) as manual_null,
       min(calificacion_manual) as manual_min, max(calificacion_manual) as manual_max,
       count(*) filter (where calificacion_manual < 0 or calificacion_manual > 10) as manual_fuera_base,
       count(*) filter (where suma_calificaciones is null) as suma_null,
       min(suma_calificaciones) as suma_min, max(suma_calificaciones) as suma_max,
       count(*) filter (where suma_calificaciones < 0) as suma_negativa,
       count(*) filter (where historico_intentos is null) as historico_null,
       count(*) filter (where jsonb_typeof(historico_intentos) = 'array') as historico_array,
       coalesce(sum(case when jsonb_typeof(historico_intentos) = 'array'
                         then jsonb_array_length(historico_intentos) else 0 end), 0) as historico_items
from public.resultados_ejercicios;

select name as future_table, to_regclass('public.' || name) is not null as exists
from (values
  ('ciclos_escolares'), ('periodos_evaluacion'), ('esquemas_evaluacion'),
  ('criterios_evaluacion'), ('subcriterios_evaluacion'), ('snapshots_calificaciones')
) future(name)
order by name;

select version, name
from supabase_migrations.schema_migrations
order by version;

rollback;
