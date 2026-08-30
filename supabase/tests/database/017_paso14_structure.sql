begin;
set local search_path = public, extensions;
select plan(14);

select has_table('public', 'tenant_academic_rollout',
  'Existe control persistente de rollout por tenant');
select has_view('public', 'vista_metricas_corte_academico',
  'Existe comparativa dual agregada sin PII');
select has_column('public', 'esquemas_evaluacion', 'migration_version',
  'Esquemas registran la versión de backfill');
select has_column('public', 'vinculos_evaluacion_ejercicio', 'migration_version',
  'Vínculos registran la versión de backfill');
select has_column('public', 'resultados_ejercicios', 'migration_version',
  'Resultados registran la conversión única');
select is((select relrowsecurity from pg_class
  where oid='public.tenant_academic_rollout'::regclass), true,
  'Rollout tiene RLS');
select is((select relforcerowsecurity from pg_class
  where oid='public.tenant_academic_rollout'::regclass), true,
  'Rollout fuerza RLS incluso al propietario');
select is((select reloptions @> array['security_invoker=true']
  from pg_class where oid='public.vista_metricas_corte_academico'::regclass), true,
  'La vista ejecuta con los permisos del invocador');
select is(has_table_privilege('anon','public.tenant_academic_rollout','SELECT'),
  false, 'Anon no consulta rollout');
select is(has_table_privilege('authenticated','public.tenant_academic_rollout','SELECT'),
  true, 'Miembro autenticado puede consultar su rollout bajo RLS');
select is(has_table_privilege('authenticated','public.tenant_academic_rollout','UPDATE'),
  false, 'Tenant no altera su propio rollout');
select is(has_table_privilege('anon','public.vista_metricas_corte_academico','SELECT'),
  false, 'Anon no consulta métricas de corte');
select ok(exists(select 1 from pg_trigger
  where tgrelid='public.tenants'::regclass
    and tgname='provision_tenant_academic_rollout' and not tgisinternal),
  'Cada tenant nuevo recibe flag legacy mediante trigger');
select is(has_function_privilege('authenticated',
  'private.provision_tenant_academic_rollout()','EXECUTE'), false,
  'El aprovisionador interno no se expone');

select * from finish();
rollback;
