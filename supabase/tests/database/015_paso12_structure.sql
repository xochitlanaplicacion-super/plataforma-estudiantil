begin;
set local search_path = public, extensions;
select plan(12);

select has_function('public','guardar_resultado_ejercicio_academico',array[
  'uuid','text','uuid','bigint','uuid','integer','integer','numeric','numeric','text','jsonb'
], 'Existe la RPC única de resultados de ejercicios');
select has_function('public','configurar_vinculo_evaluacion_ejercicio',array[
  'uuid','uuid','uuid','uuid','uuid'
], 'Existe la RPC segura de vínculo evaluable');
select has_index('public','vinculos_evaluacion_ejercicio',
  'vinculos_evaluacion_one_active_exercise_uidx',
  'Un ejercicio sólo admite un vínculo activo');
select is((select indisunique from pg_index where indexrelid =
  'public.vinculos_evaluacion_one_active_exercise_uidx'::regclass), true,
  'El índice de vínculo activo es único');
select ok(position('exercise_result' in (select pg_get_constraintdef(oid)
  from pg_constraint
  where conrelid='public.solicitudes_mutacion_academica'::regclass
    and conname='solicitudes_mutacion_operacion_valida')) > 0,
  'Idempotencia admite la operación unificada');
select is(has_function_privilege('anon',
  'public.guardar_resultado_ejercicio_academico(uuid,text,uuid,bigint,uuid,integer,integer,numeric,numeric,text,jsonb)',
  'EXECUTE'), false, 'Anon no ejecuta la RPC');
select is(has_function_privilege('authenticated',
  'public.guardar_resultado_ejercicio_academico(uuid,text,uuid,bigint,uuid,integer,integer,numeric,numeric,text,jsonb)',
  'EXECUTE'), true, 'Authenticated solicita la RPC bajo autorización interna');
select is(has_function_privilege('anon',
  'public.configurar_vinculo_evaluacion_ejercicio(uuid,uuid,uuid,uuid,uuid)',
  'EXECUTE'), false, 'Anon no configura vínculos');
select is(has_function_privilege('authenticated',
  'private.normalize_legacy_attempt_history(jsonb)', 'EXECUTE'), false,
  'El normalizador de backfill no se expone');
select is(has_table_privilege('authenticated','public.resultados_ejercicios','INSERT'),
  false, 'Alumno no inserta resultados directamente');
select is(has_table_privilege('authenticated','public.resultados_ejercicios','UPDATE'),
  false, 'Profesor no actualiza resultados directamente');
select is((select prosecdef from pg_proc where oid=
  'public.guardar_resultado_ejercicio_academico(uuid,text,uuid,bigint,uuid,integer,integer,numeric,numeric,text,jsonb)'::regprocedure),
  true, 'La RPC privilegiada encapsula y valida auth.uid');

select * from finish();
rollback;
