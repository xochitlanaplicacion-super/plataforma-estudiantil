begin;
set local search_path = public, extensions;
select plan(24);

select is((select count(*) from public.esquemas_evaluacion
  where tenant_id='10000000-0000-4000-8000-000000000001'
    and migration_version='step14-context-v1'), 3::bigint,
  'Tenant existente recibe un esquema por periodo');
select is((select count(*) from public.criterios_evaluacion c
  join public.esquemas_evaluacion e on e.id=c.esquema_evaluacion_id
    and e.tenant_id=c.tenant_id
  where e.tenant_id='10000000-0000-4000-8000-000000000001'
    and e.migration_version='step14-context-v1'
    and c.tipo='actividades' and c.peso=100 and c.activo), 3::bigint,
  'Cada esquema inicial tiene Actividades al 100 por ciento');
select is((select count(*) from public.esquemas_evaluacion
  where tenant_id='10000000-0000-4000-8000-000000000001'
    and migration_version='step14-context-v1' and estado='activo'), 3::bigint,
  'Los tres esquemas válidos quedan activos');
select is((select count(*) from public.ejercicios
  where tenant_id='10000000-0000-4000-8000-000000000001'), 7::bigint,
  'Inventario sintético conserva los siete ejercicios actuales');
select is((select count(*) from public.vinculos_evaluacion_ejercicio
  where tenant_id='10000000-0000-4000-8000-000000000001'
    and activo and migration_version='step14-exercise-links-v1'), 7::bigint,
  'Los siete ejercicios reciben vínculo inequívoco');
select is((select count(*) from public.resultados_ejercicios
  where tenant_id='10000000-0000-4000-8000-000000000001'
    and registro_legacy), 0::bigint,
  'No quedan resultados legacy conciliables');
select is((select count(*) from public.resultados_ejercicios
  where tenant_id='10000000-0000-4000-8000-000000000001'
    and migration_version='step14-grade10-v1'), 3::bigint,
  'Las tres filas heredadas registran conversión única Paso 14');
select is((select calificacion from public.resultados_ejercicios
  where ejercicio_id='18000000-0000-4000-8000-000000000012'), 7.5000::numeric,
  '75/100 permanece 7.5/10 sin segunda división');
select is((select calificacion from public.resultados_ejercicios
  where ejercicio_id='18000000-0000-4000-8000-000000000013'), 0.5000::numeric,
  '5/100 permanece 0.5/10');
select is((select calificacion from public.resultados_ejercicios
  where ejercicio_id='18000000-0000-4000-8000-000000000014'), 8.0000::numeric,
  'La descriptiva permanece 8/10');
select is((select count(*) from public.resultados_ejercicios
  where calificacion is distinct from calificacion_manual), 0::bigint,
  'Canon y sombra de rollback coinciden');
select is((select mode from public.tenant_academic_rollout
  where tenant_id='10000000-0000-4000-8000-000000000001'), 'dual',
  'Tenant conciliado entra en observación dual');
select is((select legacy_result_count from public.vista_metricas_corte_academico
  where tenant_id='10000000-0000-4000-8000-000000000001'), 0::bigint,
  'Comparativa dual reporta cero legacy');
select is((select shadow_difference_count from public.vista_metricas_corte_academico
  where tenant_id='10000000-0000-4000-8000-000000000001'), 0::bigint,
  'Comparativa dual reporta cero diferencias');
select is((select orphan_context_count from public.vista_metricas_corte_academico
  where tenant_id='10000000-0000-4000-8000-000000000001'), 0::bigint,
  'Comparativa dual reporta cero huérfanos');
select is((select count(*) from public.auditoria
  where tenant_id='10000000-0000-4000-8000-000000000001'
    and accion='academic.cutover.dual_started'
    and detalles->>'migration'='step14-cutover-v1'), 1::bigint,
  'El inicio dual deja una sola auditoría agregada');

insert into public.tenants (id, nombre, estado)
values ('40000000-0000-4000-8000-000000000004',
        'Tenant nuevo Paso 14', 'activo');
select is((select mode from public.tenant_academic_rollout
  where tenant_id='40000000-0000-4000-8000-000000000004'), 'legacy',
  'Tenant nuevo nace con funcionalidad académica apagada');
select is((select count(*) from public.ciclos_escolares
  where tenant_id='40000000-0000-4000-8000-000000000004'), 0::bigint,
  'Tenant nuevo no copia ciclos de muestra');
select is((select count(*) from public.periodos_evaluacion
  where tenant_id='40000000-0000-4000-8000-000000000004'), 0::bigint,
  'Tenant nuevo no copia periodos');
select is((select count(*) from public.esquemas_evaluacion
  where tenant_id='40000000-0000-4000-8000-000000000004'), 0::bigint,
  'Tenant nuevo no copia esquemas');
select is((select count(*) from public.ejercicios
  where tenant_id='40000000-0000-4000-8000-000000000004'), 0::bigint,
  'Tenant nuevo no copia ejercicios');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.tenant_academic_rollout), 1::bigint,
  'Alumno sólo enumera el rollout de su tenant');
select is((select count(*) from public.tenant_academic_rollout
  where tenant_id='20000000-0000-4000-8000-000000000002'), 0::bigint,
  'Alumno no enumera rollout de otro tenant');
select is((select count(*) from public.vista_metricas_corte_academico
  where tenant_id='20000000-0000-4000-8000-000000000002'), 0::bigint,
  'Vista security_invoker tampoco cruza tenants');
reset role;

select * from finish();
rollback;
