begin;
set local search_path = public, extensions;

select plan(66);

select has_table('public', 'criterios_evaluacion', 'Existe criterios_evaluacion');
select has_table('public', 'subcriterios_evaluacion', 'Existe subcriterios_evaluacion');
select has_column('public', 'esquemas_evaluacion', 'copiado_desde_id', 'El esquema registra su versión origen');

select has_column('public', 'criterios_evaluacion', column_name, format('criterios incluye %s', column_name))
from unnest(array[
  'id','tenant_id','esquema_evaluacion_id','nombre','tipo','peso','orden','activo',
  'created_by','created_at','updated_at'
]) required(column_name);
select has_column('public', 'subcriterios_evaluacion', column_name, format('subcriterios incluye %s', column_name))
from unnest(array[
  'id','tenant_id','criterio_evaluacion_id','nombre','tipo','peso_interno','orden',
  'configuracion','activo','created_by','created_at','updated_at'
]) required(column_name);

select col_type_is('public', 'criterios_evaluacion', 'peso', 'numeric(7,4)', 'Peso superior conserva cuatro decimales');
select col_type_is('public', 'subcriterios_evaluacion', 'peso_interno', 'numeric(7,4)', 'Peso interno conserva cuatro decimales');
select col_not_null('public', 'criterios_evaluacion', 'tenant_id', 'Criterio exige tenant');
select col_not_null('public', 'criterios_evaluacion', 'peso', 'Criterio exige peso');
select col_not_null('public', 'subcriterios_evaluacion', 'tenant_id', 'Subcriterio exige tenant');
select col_not_null('public', 'subcriterios_evaluacion', 'configuracion', 'Subcriterio exige configuración');
select has_check('public', table_name, format('%s tiene checks de dominio', table_name))
from unnest(array['criterios_evaluacion','subcriterios_evaluacion']) checked(table_name);
select has_fk('public', table_name, format('%s tiene FK compuestas tenant-safe', table_name))
from unnest(array['criterios_evaluacion','subcriterios_evaluacion']) linked(table_name);

select has_index('public', 'criterios_evaluacion', index_name, format('Existe %s', index_name))
from unnest(array[
  'criterios_evaluacion_esquema_nombre_unique_idx',
  'criterios_evaluacion_esquema_activos_idx',
  'criterios_evaluacion_created_by_idx'
]) indexes(index_name);
select has_index('public', 'subcriterios_evaluacion', index_name, format('Existe %s', index_name))
from unnest(array[
  'subcriterios_evaluacion_criterio_nombre_unique_idx',
  'subcriterios_evaluacion_criterio_activos_idx',
  'subcriterios_evaluacion_created_by_idx'
]) indexes(index_name);

select ok(c.relrowsecurity, format('RLS habilitada en %s', c.relname))
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname=any(array['criterios_evaluacion','subcriterios_evaluacion']) order by c.relname;
select ok(c.relforcerowsecurity, format('RLS forzada en %s', c.relname))
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname=any(array['criterios_evaluacion','subcriterios_evaluacion']) order by c.relname;

select ok(has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT'), format('authenticated lee %s sujeto a RLS', table_name))
from unnest(array['criterios_evaluacion','subcriterios_evaluacion']) exposed(table_name);
select ok(not has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE'), format('authenticated no borra %s', table_name))
from unnest(array['criterios_evaluacion','subcriterios_evaluacion']) protected(table_name);
select ok(not has_table_privilege('anon', format('public.%I', table_name), 'SELECT'), format('anon no lee %s', table_name))
from unnest(array['criterios_evaluacion','subcriterios_evaluacion']) protected(table_name);
select ok(has_table_privilege('service_role', format('public.%I', table_name), 'DELETE'), format('service_role mantiene %s', table_name))
from unnest(array['criterios_evaluacion','subcriterios_evaluacion']) maintained(table_name);

select has_function('public', 'activar_esquema_evaluacion', array['uuid','integer'], 'Existe RPC de activación atómica');
select has_function('public', 'copiar_esquema_evaluacion', array['uuid','integer','text'], 'Existe RPC de copia/versionado');
select ok(has_function_privilege('authenticated', 'public.activar_esquema_evaluacion(uuid,integer)', 'EXECUTE'), 'authenticated ejecuta activar');
select ok(has_function_privilege('authenticated', 'public.copiar_esquema_evaluacion(uuid,integer,text)', 'EXECUTE'), 'authenticated ejecuta copiar');
select ok(not has_function_privilege('anon', 'public.activar_esquema_evaluacion(uuid,integer)', 'EXECUTE'), 'anon no activa');
select ok(not has_function_privilege('anon', 'public.copiar_esquema_evaluacion(uuid,integer,text)', 'EXECUTE'), 'anon no copia');
select ok(has_column_privilege('authenticated', 'public.esquemas_evaluacion', 'nombre', 'UPDATE'), 'authenticated edita reglas de borrador');
select ok(not has_column_privilege('authenticated', 'public.esquemas_evaluacion', 'estado', 'UPDATE'), 'authenticated no cambia estado directamente');
select ok(has_column_privilege('authenticated', 'public.esquemas_evaluacion', 'nombre', 'INSERT'), 'authenticated crea un borrador con campos permitidos');
select ok(not has_column_privilege('authenticated', 'public.esquemas_evaluacion', 'version', 'INSERT'), 'authenticated no fabrica una versión');
select volatility_is('private', 'is_valid_subcriterion_config', array['text','jsonb'], 'immutable', 'Validador JSON es puro');
select volatility_is('private', 'academic_effective_weight', array['numeric','numeric'], 'immutable', 'Cálculo efectivo SQL es puro');

select * from finish();
rollback;
