begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

select has_table('public', 'solicitudes_mutacion_academica', 'Existe libro interno de idempotencia');
select has_table('public', 'cierres_calificaciones', 'Existe libro de snapshots');
select has_table('public', 'auditoria', 'Existe auditoría tenant-safe');
select has_function('public', 'editar_calificaciones_academicas', array['uuid','uuid','jsonb','text','uuid','uuid'], 'Existe RPC de edición por lote');
select has_function('public', 'previsualizar_cierre_calificaciones', array['uuid','uuid'], 'Existe preview de faltantes');
select has_function('public', 'cerrar_calificaciones_academicas', array['uuid','uuid','text','uuid','uuid'], 'Existe RPC de cierre');
select has_function('public', 'reabrir_calificaciones_academicas', array['uuid','uuid','text','uuid','uuid'], 'Existe RPC de reapertura');

select is((select prosecdef from pg_proc where oid='public.editar_calificaciones_academicas(uuid,uuid,jsonb,text,uuid,uuid)'::regprocedure), true, 'Edición privilegiada con autorización explícita');
select is((select prosecdef from pg_proc where oid='public.previsualizar_cierre_calificaciones(uuid,uuid)'::regprocedure), true, 'Preview privilegiado con autorización explícita');
select is((select prosecdef from pg_proc where oid='public.cerrar_calificaciones_academicas(uuid,uuid,text,uuid,uuid)'::regprocedure), true, 'Cierre privilegiado con autorización explícita');
select is((select prosecdef from pg_proc where oid='public.reabrir_calificaciones_academicas(uuid,uuid,text,uuid,uuid)'::regprocedure), true, 'Reapertura privilegiada con autorización explícita');
select is((select count(*)::integer from pg_proc p where p.oid in (
  'public.editar_calificaciones_academicas(uuid,uuid,jsonb,text,uuid,uuid)'::regprocedure,
  'public.previsualizar_cierre_calificaciones(uuid,uuid)'::regprocedure,
  'public.cerrar_calificaciones_academicas(uuid,uuid,text,uuid,uuid)'::regprocedure,
  'public.reabrir_calificaciones_academicas(uuid,uuid,text,uuid,uuid)'::regprocedure
) and p.proconfig @> array['search_path=""']), 4, 'Todas las RPC fijan search_path vacío');

select ok(has_function_privilege('authenticated', 'public.editar_calificaciones_academicas(uuid,uuid,jsonb,text,uuid,uuid)', 'execute'), 'Authenticated ejecuta edición');
select ok(not has_function_privilege('anon', 'public.editar_calificaciones_academicas(uuid,uuid,jsonb,text,uuid,uuid)', 'execute'), 'Anon no ejecuta edición');
select ok(has_function_privilege('authenticated', 'public.cerrar_calificaciones_academicas(uuid,uuid,text,uuid,uuid)', 'execute'), 'Authenticated puede solicitar cierre sujeto a rol');
select ok(not has_function_privilege('anon', 'public.cerrar_calificaciones_academicas(uuid,uuid,text,uuid,uuid)', 'execute'), 'Anon no ejecuta cierre');
select ok(has_function_privilege('authenticated', 'public.reabrir_calificaciones_academicas(uuid,uuid,text,uuid,uuid)', 'execute'), 'Authenticated puede solicitar reapertura sujeta a rol');
select ok(not has_function_privilege('anon', 'public.reabrir_calificaciones_academicas(uuid,uuid,text,uuid,uuid)', 'execute'), 'Anon no ejecuta reapertura');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.solicitudes_mutacion_academica'::regclass), 'Idempotencia tiene RLS forzada');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.cierres_calificaciones'::regclass), 'Snapshots tienen RLS forzada');
select ok(not has_table_privilege('authenticated','public.solicitudes_mutacion_academica','select'), 'Authenticated no lee idempotencia interna');
select ok(not has_table_privilege('authenticated','public.cierres_calificaciones','insert'), 'Authenticated no inserta snapshots directamente');
select ok(has_table_privilege('authenticated','public.cierres_calificaciones','select'), 'Authenticated sólo lee snapshots autorizados');
select ok(not has_table_privilege('authenticated','public.auditoria','insert'), 'Authenticated no falsifica auditoría');
select ok(not has_table_privilege('authenticated','public.auditoria','update'), 'Authenticated no reescribe auditoría');
select ok(not has_table_privilege('authenticated','public.auditoria','delete'), 'Authenticated no borra auditoría');

select ok(exists(select 1 from pg_constraint where conrelid='public.solicitudes_mutacion_academica'::regclass and conname='solicitudes_mutacion_idempotency_unique'), 'Idempotencia tiene unique tenant/actor/operación/clave');
select ok(exists(select 1 from pg_constraint where conrelid='public.cierres_calificaciones'::regclass and conname='cierres_version_unique'), 'Snapshot tiene versión única por matrícula/alcance');
select has_trigger('public','cierres_calificaciones','prevent_closure_mutation','Snapshot es inmutable');
select has_trigger('public','auditoria','prevent_academic_audit_mutation','Auditoría académica es inmutable');
select has_trigger('public','calificaciones_directas','academic_reject_closed_scope','Nota directa bloquea escritura tras cierre');
select has_trigger('public','resultados_ejercicios','academic_reject_closed_scope','Resultado de ejercicio bloquea escritura tras cierre');
select has_trigger('public','eventos_participacion','academic_reject_closed_scope','Participación bloquea escritura tras cierre');
select has_trigger('public','esquemas_evaluacion','academic_reject_closed_scope','Esquema bloquea configuración tras cierre');
select has_trigger('public','periodos_evaluacion','academic_reject_closed_scope','Periodo bloquea configuración tras cierre');

select ok(pg_get_functiondef('public.cerrar_calificaciones_academicas(uuid,uuid,text,uuid,uuid)'::regprocedure) like '%pg_advisory_xact_lock%', 'Cierre usa advisory xact lock');
select ok(pg_get_functiondef('public.editar_calificaciones_academicas(uuid,uuid,jsonb,text,uuid,uuid)'::regprocedure) like '%row_version = expected_version%', 'Edición usa compare-and-swap');
select ok(pg_get_functiondef('public.editar_calificaciones_academicas(uuid,uuid,jsonb,text,uuid,uuid)'::regprocedure) like '%item_count > 100%', 'Lote está limitado a 100 filas');
select ok(pg_get_functiondef('public.editar_calificaciones_academicas(uuid,uuid,jsonb,text,uuid,uuid)'::regprocedure) like '%''before''%''after''%''correlationId''%', 'Edición registra before/after/correlación');
select ok(pg_get_functiondef('public.reabrir_calificaciones_academicas(uuid,uuid,text,uuid,uuid)'::regprocedure) like '%snapshot_parent_id%', 'Reapertura conserva vínculo a snapshot previo');
select ok(pg_get_functiondef('public.editar_calificaciones_academicas(uuid,uuid,jsonb,text,uuid,uuid)'::regprocedure) like '%ACADEMIC_PLATFORM_ADMIN_READ_ONLY%', 'Platform admin no obtiene edición implícita');
select ok(pg_get_functiondef('public.cerrar_calificaciones_academicas(uuid,uuid,text,uuid,uuid)'::regprocedure) like '%ACADEMIC_PLATFORM_ADMIN_READ_ONLY%', 'Platform admin no obtiene cierre implícito');
select ok(pg_get_functiondef('public.reabrir_calificaciones_academicas(uuid,uuid,text,uuid,uuid)'::regprocedure) like '%ACADEMIC_PLATFORM_ADMIN_READ_ONLY%', 'Platform admin no obtiene reapertura implícita');

select * from finish();
rollback;
