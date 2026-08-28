begin;
set local search_path = public, extensions;
select plan(43);

select has_function('private','can_manage_teaching_assignment',array['uuid','uuid'],'Helper de asignación existe');
select has_function('private','can_view_enrollment',array['uuid','uuid','uuid'],'Helper exacto de matrícula existe');
select has_function('private','can_view_enrollment',array['uuid','uuid'],'Helper de listado de matrícula existe');
select is((select prosecdef from pg_proc where oid='private.can_manage_teaching_assignment(uuid,uuid)'::regprocedure),true,'Helper de asignación es SECURITY DEFINER');
select is((select prosecdef from pg_proc where oid='private.can_view_enrollment(uuid,uuid,uuid)'::regprocedure),true,'Helper de matrícula es SECURITY DEFINER');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='private.can_manage_teaching_assignment(uuid,uuid)'::regprocedure),'Helper de asignación fija search_path vacío');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='private.can_view_enrollment(uuid,uuid,uuid)'::regprocedure),'Helper de matrícula fija search_path vacío');
select is(has_function_privilege('public','private.can_manage_teaching_assignment(uuid,uuid)','EXECUTE'),false,'PUBLIC no ejecuta helper de asignación');
select is(has_function_privilege('anon','private.can_view_enrollment(uuid,uuid,uuid)','EXECUTE'),false,'Anon no ejecuta helper de matrícula');

select is((select count(*) from unnest(array[
  'ciclos_escolares','inscripciones_alumno','asignaciones_profesor',
  'periodos_evaluacion','esquemas_evaluacion','criterios_evaluacion',
  'subcriterios_evaluacion','vinculos_evaluacion_ejercicio',
  'resultados_ejercicios','calificaciones_directas','eventos_participacion'
]) t(name) join pg_class c on c.oid=format('public.%I',t.name)::regclass
where c.relrowsecurity and c.relforcerowsecurity),11::bigint,'Todas las tablas académicas tienen RLS forzada');
select is((select count(*) from pg_policy p where p.polrelid in (
  'public.ciclos_escolares'::regclass,'public.inscripciones_alumno'::regclass,
  'public.asignaciones_profesor'::regclass,'public.periodos_evaluacion'::regclass,
  'public.esquemas_evaluacion'::regclass,'public.criterios_evaluacion'::regclass,
  'public.subcriterios_evaluacion'::regclass,'public.vinculos_evaluacion_ejercicio'::regclass,
  'public.resultados_ejercicios'::regclass,'public.calificaciones_directas'::regclass,
  'public.eventos_participacion'::regclass
) and p.polpermissive and p.polcmd='*'),0::bigint,'No quedan políticas permisivas FOR ALL');
select is((select count(*) from pg_policy p where p.polname='academic_active_tenant_boundary' and not p.polpermissive),11::bigint,'Cada tabla tiene frontera restrictiva activa');

select policies_are('public','resultados_ejercicios',array['academic_active_tenant_boundary','academic_result_authorized_select'],'Resultados sólo tiene frontera y SELECT autorizado');
select policies_are('public','calificaciones_directas',array['academic_active_tenant_boundary','academic_direct_authorized_select','academic_direct_authorized_insert','academic_direct_authorized_update'],'Directas separan SELECT/INSERT/UPDATE');
select policies_are('public','eventos_participacion',array['academic_active_tenant_boundary','academic_participation_authorized_select','academic_participation_authorized_insert'],'Participación separa SELECT/INSERT');
select policies_are('public','vinculos_evaluacion_ejercicio',array['academic_active_tenant_boundary','academic_link_related_select','academic_link_authorized_insert','academic_link_authorized_update'],'Vínculos separan operaciones');

select has_view('public','vista_libreta_profesor','Existe libreta segura');
select has_view('public','vista_desglose_calificacion','Existe desglose seguro');
select has_view('public','vista_calificaciones_alumno','Existe vista del alumno');
select is((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.vista_libreta_profesor'::regclass),true,'Libreta usa security_invoker');
select is((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.vista_desglose_calificacion'::regclass),true,'Desglose usa security_invoker');
select is((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.vista_calificaciones_alumno'::regclass),true,'Vista alumno usa security_invoker');
select has_column('public','vista_libreta_profesor','escala_fuente','Libreta distingue escala de fuente');
select has_column('public','vista_desglose_calificacion','criterio_peso','Desglose expone peso, no total calculado');
select has_column('public','vista_calificaciones_alumno','inscripcion_alumno_id','Vista alumno conserva matrícula');

select is(has_table_privilege('anon','public.resultados_ejercicios','SELECT'),false,'Anon no lee resultados');
select is(has_table_privilege('anon','public.vista_calificaciones_alumno','SELECT'),false,'Anon no lee vista alumno');
select is(has_table_privilege('authenticated','public.resultados_ejercicios','SELECT'),true,'Authenticated puede solicitar resultados bajo RLS');
select is(has_table_privilege('authenticated','public.resultados_ejercicios','INSERT'),false,'Authenticated no inserta resultados directamente');
select is(has_table_privilege('authenticated','public.resultados_ejercicios','UPDATE'),false,'Authenticated no actualiza resultados directamente');
select is(has_table_privilege('authenticated','public.resultados_ejercicios','DELETE'),false,'Authenticated no borra resultados');
select is(has_table_privilege('authenticated','public.calificaciones_directas','DELETE'),false,'Authenticated no borra directas');
select is(has_table_privilege('authenticated','public.eventos_participacion','UPDATE'),false,'Authenticated no actualiza ledger');
select is(has_table_privilege('authenticated','public.eventos_participacion','DELETE'),false,'Authenticated no borra ledger');
select is(has_table_privilege('authenticated','public.vista_libreta_profesor','SELECT'),true,'Authenticated consulta libreta bajo RLS');

select has_index('public','profiles','academic_profiles_membership_rls_idx','Índice de membresía RLS');
select has_index('public','asignaciones_profesor','academic_assignments_rls_idx','Índice de asignación RLS');
select has_index('public','inscripciones_alumno','academic_enrollments_rls_idx','Índice de matrícula RLS');
select has_index('public','resultados_ejercicios','academic_results_rls_idx','Índice de resultados RLS');
select has_index('public','calificaciones_directas','academic_direct_grades_rls_idx','Índice de directas RLS');
select has_index('public','eventos_participacion','academic_participation_rls_idx','Índice de participación RLS');

select is((select count(*) from pg_policy p where p.polrelid='public.resultados_ejercicios'::regclass and pg_get_expr(p.polqual,p.polrelid) like '%tenant_id = current_tenant_id%'),0::bigint,'Profesor no recibe resultados por tenant completo');
select is((select count(*) from pg_policy p where p.polrelid in ('public.resultados_ejercicios'::regclass,'public.calificaciones_directas'::regclass,'public.eventos_participacion'::regclass) and pg_get_expr(p.polqual,p.polrelid) like '%can_view_enrollment%'),3::bigint,'Fuentes exigen matrícula/asignación autorizada');

select * from finish();
rollback;
