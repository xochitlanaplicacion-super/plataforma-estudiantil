begin;

select plan(43);

select has_table('public', table_name, format('Existe public.%s', table_name))
from unnest(array[
  'profiles', 'niveles', 'carreras', 'grados', 'grupos', 'materias',
  'grupo_materias', 'asignaciones_profesor', 'inscripciones_alumno',
  'ejercicios', 'resultados_ejercicios', 'fechas_evaluacion', 'auditoria'
]) as base_tables(table_name);

select has_column('public', table_name, 'tenant_id', format('%s incluye tenant_id', table_name))
from unnest(array[
  'profiles', 'niveles', 'carreras', 'grados', 'grupos', 'materias',
  'grupo_materias', 'asignaciones_profesor', 'inscripciones_alumno',
  'ejercicios', 'resultados_ejercicios', 'fechas_evaluacion', 'auditoria'
]) as tenant_tables(table_name);

select col_type_is('public', 'resultados_ejercicios', 'calificacion', 'numeric(5,2)', 'calificacion conserva baseline numeric(5,2)');
select col_type_is('public', 'resultados_ejercicios', 'calificacion_manual', 'numeric(5,2)', 'calificacion_manual conserva baseline numeric(5,2)');
select col_type_is('public', 'resultados_ejercicios', 'suma_calificaciones', 'numeric(10,2)', 'suma_calificaciones conserva baseline numeric(10,2)');
select col_type_is('public', 'resultados_ejercicios', 'historico_intentos', 'jsonb', 'historico_intentos es jsonb');

select ok(c.relrowsecurity, format('RLS habilitada en public.%s', c.relname))
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array[
    'profiles', 'niveles', 'carreras', 'grados', 'grupos', 'materias',
    'grupo_materias', 'asignaciones_profesor', 'inscripciones_alumno',
    'ejercicios', 'resultados_ejercicios', 'fechas_evaluacion', 'auditoria'
  ])
order by c.relname;

select * from finish();
rollback;
