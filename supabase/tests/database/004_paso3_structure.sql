begin;
set local search_path = public, extensions;

select plan(66);

select has_table('public', 'periodos_evaluacion', 'Existe public.periodos_evaluacion');
select has_table('public', 'esquemas_evaluacion', 'Existe public.esquemas_evaluacion');

select has_column('public', 'periodos_evaluacion', column_name, format('periodos_evaluacion incluye %s', column_name))
from unnest(array[
  'id', 'tenant_id', 'ciclo_escolar_id', 'nombre', 'orden', 'fecha_inicio',
  'fecha_fin', 'color_semantico', 'estado', 'locked_at', 'locked_by',
  'created_by', 'created_at', 'updated_at'
]) as required(column_name);

select has_column('public', 'esquemas_evaluacion', column_name, format('esquemas_evaluacion incluye %s', column_name))
from unnest(array[
  'id', 'tenant_id', 'ciclo_escolar_id', 'asignacion_profesor_id',
  'periodo_evaluacion_id', 'nombre', 'escala', 'calificacion_aprobatoria',
  'decimales_mostrados', 'modo_redondeo', 'regla_no_entrego',
  'valor_no_entrego', 'regla_justificado', 'estado', 'version', 'created_by',
  'created_at', 'updated_at'
]) as required(column_name);

select col_type_is('public', 'periodos_evaluacion', 'orden', 'smallint', 'El orden usa smallint');
select col_type_is('public', 'esquemas_evaluacion', 'calificacion_aprobatoria', 'numeric(6,4)', 'La aprobatoria preserva cuatro decimales');
select col_type_is('public', 'esquemas_evaluacion', 'valor_no_entrego', 'numeric(6,4)', 'El valor no entregado preserva cuatro decimales');
select ok(
  (select a.attgenerated = 's'
   from pg_catalog.pg_attribute a
   join pg_catalog.pg_class c on c.oid = a.attrelid
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'esquemas_evaluacion'
     and a.attname = 'escala'),
  'La escala 0-10 es generada e inmutable'
);

select col_not_null('public', 'periodos_evaluacion', 'tenant_id', 'El periodo exige tenant');
select col_not_null('public', 'periodos_evaluacion', 'ciclo_escolar_id', 'El periodo exige ciclo');
select col_not_null('public', 'esquemas_evaluacion', 'asignacion_profesor_id', 'El esquema exige asignacion');
select col_not_null('public', 'esquemas_evaluacion', 'periodo_evaluacion_id', 'El esquema exige periodo');

select has_check('public', 'periodos_evaluacion', 'Los periodos tienen checks de dominio');
select has_check('public', 'esquemas_evaluacion', 'Los esquemas tienen checks de escala y reglas');
select has_fk('public', 'periodos_evaluacion', 'El periodo tiene FKs tenant-safe');
select has_fk('public', 'esquemas_evaluacion', 'El esquema tiene FKs tenant-safe');

select has_index('public', 'periodos_evaluacion', 'periodos_evaluacion_no_overlap', 'Existe indice de exclusion contra solapamiento');
select has_index('public', 'periodos_evaluacion', 'periodos_evaluacion_un_activo_por_ciclo_idx', 'Un solo periodo activo por ciclo');
select has_index('public', 'periodos_evaluacion', 'periodos_evaluacion_tenant_cycle_state_dates_idx', 'Indice de lectura tenant/ciclo/estado/fechas');
select has_index('public', 'esquemas_evaluacion', 'esquemas_evaluacion_un_vigente_idx', 'Un solo esquema vigente por asignacion/periodo');
select has_index('public', 'esquemas_evaluacion', 'esquemas_evaluacion_assignment_idx', 'Indice de esquema por asignacion');
select has_index('public', 'esquemas_evaluacion', 'esquemas_evaluacion_period_idx', 'Indice de esquema por periodo');

select ok(c.relrowsecurity, format('RLS habilitada en public.%s', c.relname))
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array['periodos_evaluacion', 'esquemas_evaluacion'])
order by c.relname;
select ok(c.relforcerowsecurity, format('RLS forzada en public.%s', c.relname))
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array['periodos_evaluacion', 'esquemas_evaluacion'])
order by c.relname;

select ok(
  has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT'),
  format('authenticated puede leer %s sujeto a RLS', table_name)
)
from unnest(array['periodos_evaluacion', 'esquemas_evaluacion']) as exposed(table_name);
select ok(
  not has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE'),
  format('authenticated no puede borrar %s', table_name)
)
from unnest(array['periodos_evaluacion', 'esquemas_evaluacion']) as protected(table_name);
select ok(
  not has_table_privilege('anon', format('public.%I', table_name), 'SELECT'),
  format('anon no puede leer %s', table_name)
)
from unnest(array['periodos_evaluacion', 'esquemas_evaluacion']) as protected(table_name);
select ok(
  has_table_privilege('service_role', format('public.%I', table_name), 'DELETE'),
  format('service_role conserva acceso de mantenimiento a %s', table_name)
)
from unnest(array['periodos_evaluacion', 'esquemas_evaluacion']) as maintained(table_name);

select is(
  (select count(*) from public.periodos_evaluacion),
  case (select mode from public.step2_fixture_metadata)
    when 'existing' then 9::bigint else 0::bigint
  end,
  'El backfill crea tres periodos por ciclo existente y ninguno sin tenants'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'periodos_evaluacion_no_overlap' and contype = 'x'
  ),
  'La no superposicion se impone con exclusion PostgreSQL'
);

select * from finish();
rollback;
