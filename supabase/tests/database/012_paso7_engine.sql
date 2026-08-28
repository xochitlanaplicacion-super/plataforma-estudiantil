begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select has_function('public', 'calcular_calificacion_academica', array['jsonb'], 'Existe motor SQL puro');
select has_function('public', 'calcular_resultado_academico', array['uuid','uuid','uuid'], 'Existe adaptador SQL autorizado');
select function_lang_is('public', 'calcular_calificacion_academica', array['jsonb'], 'plpgsql', 'Motor usa PL/pgSQL y numeric');
select volatility_is('public', 'calcular_calificacion_academica', array['jsonb'], 'immutable', 'Motor puro es immutable');
select volatility_is('public', 'calcular_resultado_academico', array['uuid','uuid','uuid'], 'stable', 'Adaptador de lectura es stable');
select is((select prosecdef from pg_proc where oid='public.calcular_calificacion_academica(jsonb)'::regprocedure), false, 'Motor es security invoker');
select is((select prosecdef from pg_proc where oid='public.calcular_resultado_academico(uuid,uuid,uuid)'::regprocedure), false, 'Adaptador es security invoker');
select isnt((select proconfig::text from pg_proc where oid='public.calcular_calificacion_academica(jsonb)'::regprocedure), null, 'Motor fija search_path');
select ok(has_function_privilege('authenticated', 'public.calcular_calificacion_academica(jsonb)', 'execute'), 'Authenticated puede calcular dataset sin PII');
select ok(not has_function_privilege('anon', 'public.calcular_calificacion_academica(jsonb)', 'execute'), 'Anon no ejecuta motor');
select ok(has_function_privilege('authenticated', 'public.calcular_resultado_academico(uuid,uuid,uuid)', 'execute'), 'Authenticated puede usar lectura autorizada');
select ok(not has_function_privilege('anon', 'public.calcular_resultado_academico(uuid,uuid,uuid)', 'execute'), 'Anon no usa lectura académica');

create temporary table step7_actual as
select g.*, public.calcular_calificacion_academica(g.dataset) as result
from step7_golden_cases g;

select is((select count(*)::integer from step7_actual), 9, 'Se ejecutan los nueve casos dorados compartidos');
select is((select count(*)::integer from step7_actual where result ->> 'exactGrade' <> expected_exact), 0, 'SQL y fixture coinciden exactamente en total');
select is((select count(*)::integer from step7_actual where result ->> 'displayGrade' <> expected_display), 0, 'SQL y fixture coinciden en redondeo visual');
select is((select count(*)::integer from step7_actual where (result ->> 'complete')::boolean <> expected_complete), 0, 'SQL y fixture coinciden en completitud');
select is((select count(*)::integer from step7_actual where (select jsonb_agg(c -> 'contributionToTotal') from jsonb_array_elements(result -> 'criteria') c) <> expected_contributions), 0, 'SQL y TS comparten contribuciones exactas');
select is((select count(*)::integer from step7_actual where result ->> 'scale' <> '0-10'), 0, 'Nada devuelve escala 0-100');
select is((select count(*)::integer from step7_actual where (result ->> 'exactGrade')::numeric not between 0 and 10), 0, 'Totales permanecen entre 0 y 10');
select is((select count(*)::integer from step7_actual where (select round(sum((c ->> 'contributionToTotal')::numeric),4) from jsonb_array_elements(result -> 'criteria') c) <> (result ->> 'exactGrade')::numeric), 0, 'Suma del breakdown equivale al total exacto');

select throws_ok(
  $$select public.calcular_calificacion_academica(jsonb_set((select dataset from step7_golden_cases where name='redondeo half up sólo visual'), '{criteria,0,sources,0,value}', '"-0.0001"'))$$,
  '22003', null, 'Rechaza -0.0001'
);
select throws_ok(
  $$select public.calcular_calificacion_academica(jsonb_set((select dataset from step7_golden_cases where name='redondeo half up sólo visual'), '{criteria,0,sources,0,value}', '"10.0001"'))$$,
  '22003', null, 'Rechaza 10.0001'
);
select throws_ok(
  $$select public.calcular_calificacion_academica(jsonb_set((select dataset from step7_golden_cases limit 1), '{criteria,0,weight}', '"1.0000"'))$$,
  '23514', null, 'Rechaza ponderaciones que no suman 100'
);
select is((select count(*)::integer from step7_actual where result::text like '%NaN%' or result::text like '%Infinity%'), 0, 'Nunca produce NaN ni Infinity');

select * from finish();
rollback;
