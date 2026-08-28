begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

create temporary table step8_state as
select d.id as source_id, d.inscripcion_alumno_id as enrollment_id,
  d.criterio_evaluacion_id as criterion_id, d.row_version as initial_version
from public.calificaciones_directas d
where d.asignacion_profesor_id='1f000000-0000-4000-8000-000000000001';
grant select on step8_state to authenticated;

select is((select count(*)::integer from step8_state),1,'Fixture tiene una fuente directa objetivo');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
create temporary table step8_first_response as
select public.editar_calificaciones_academicas(
  '1f000000-0000-4000-8000-000000000001',
  '1d000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'sourceType','directCriterion','sourceId',s.source_id,
    'enrollmentId',s.enrollment_id,'criterionId',s.criterion_id,
    'state','calificado','grade',8.5,'observation','Ajuste sintético',
    'expectedRowVersion',s.initial_version
  )), 'Corrección verificada', '81000000-0000-4000-8000-000000000001'
) response from step8_state s;
reset role;
select is((select response->>'status' from step8_first_response),'saved','Primera edición queda guardada');
select is((select calificacion from public.calificaciones_directas where id=(select source_id from step8_state)),8.5000::numeric,'RPC persiste nota 0-10');
select is((select row_version from public.calificaciones_directas where id=(select source_id from step8_state)),(select initial_version+1 from step8_state),'RPC incrementa row_version una vez');
select is((select count(*)::integer from public.auditoria where accion='academic.grade.updated'),1,'Primera edición genera una auditoría');
select is((select count(*)::integer from public.solicitudes_mutacion_academica where idempotency_key='81000000-0000-4000-8000-000000000001'),1,'Primera edición genera una solicitud idempotente');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
create temporary table step8_replay_response as
select public.editar_calificaciones_academicas(
  '1f000000-0000-4000-8000-000000000001',
  '1d000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'sourceType','directCriterion','sourceId',s.source_id,
    'enrollmentId',s.enrollment_id,'criterionId',s.criterion_id,
    'state','calificado','grade',8.5,'observation','Ajuste sintético',
    'expectedRowVersion',s.initial_version
  )), 'Corrección verificada', '81000000-0000-4000-8000-000000000001'
) response from step8_state s;
reset role;
select ok((select (response->>'replayed')::boolean from step8_replay_response),'Misma clave devuelve replay');
select is((select row_version from public.calificaciones_directas where id=(select source_id from step8_state)),(select initial_version+1 from step8_state),'Replay no vuelve a incrementar versión');
select is((select count(*)::integer from public.auditoria where accion='academic.grade.updated'),1,'Replay no duplica auditoría');
select is((select count(*)::integer from public.solicitudes_mutacion_academica where idempotency_key='81000000-0000-4000-8000-000000000001'),1,'Replay no duplica idempotencia');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select throws_ok(format($sql$select public.editar_calificaciones_academicas(
  '1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001',
  %L::jsonb,'Lote debe revertirse','81000000-0000-4000-8000-000000000002')$sql$,
  jsonb_build_array(
    jsonb_build_object('sourceType','directCriterion','sourceId',s.source_id,'enrollmentId',s.enrollment_id,'criterionId',s.criterion_id,'state','calificado','grade',8.7,'expectedRowVersion',s.initial_version+1),
    jsonb_build_object('sourceType','directCriterion','sourceId',null,'enrollmentId','2e000000-0000-4000-8000-000000000002','criterionId',s.criterion_id,'state','calificado','grade',7,'expectedRowVersion',0)
  )::text), 'PT404', null, 'Lote con matrícula ajena falla completo') from step8_state s;
reset role;
select is((select calificacion from public.calificaciones_directas where id=(select source_id from step8_state)),8.5000::numeric,'Lote parcial no cambia primera fila');
select is((select count(*)::integer from public.auditoria where accion='academic.grade.updated'),1,'Lote parcial no deja auditoría parcial');
select is((select count(*)::integer from public.solicitudes_mutacion_academica where idempotency_key='81000000-0000-4000-8000-000000000002'),0,'Lote fallido revierte reserva idempotente');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
create temporary table step8_second_response as
select public.editar_calificaciones_academicas(
  '1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('sourceType','directCriterion','sourceId',s.source_id,'enrollmentId',s.enrollment_id,'criterionId',s.criterion_id,'state','calificado','grade',9,'expectedRowVersion',s.initial_version+1)),
  'Segunda corrección','81000000-0000-4000-8000-000000000003'
) response from step8_state s;
reset role;
select is((select calificacion from public.calificaciones_directas where id=(select source_id from step8_state)),9.0000::numeric,'Segunda versión válida gana');
select is((select row_version from public.calificaciones_directas where id=(select source_id from step8_state)),(select initial_version+2 from step8_state),'Segunda versión incrementa CAS');
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select throws_ok(format($sql$select public.editar_calificaciones_academicas(
  '1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001',%L::jsonb,
  'Versión obsoleta','81000000-0000-4000-8000-000000000004')$sql$,
  jsonb_build_array(jsonb_build_object('sourceType','directCriterion','sourceId',s.source_id,'enrollmentId',s.enrollment_id,'criterionId',s.criterion_id,'state','calificado','grade',1,'expectedRowVersion',s.initial_version+1))::text),
  'PT409',null,'Versión concurrente obsoleta devuelve 409') from step8_state s;
reset role;
select is((select calificacion from public.calificaciones_directas where id=(select source_id from step8_state)),9.0000::numeric,'Conflicto no pierde la versión ganadora');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.editar_calificaciones_academicas('1f000000-0000-4000-8000-000000000002','1d000000-0000-4000-8000-000000000001','[{"sourceType":"directCriterion","enrollmentId":"1e000000-0000-4000-8000-000000000001","criterionId":"1c600000-0000-4000-8000-000000000002","state":"calificado","grade":9,"expectedRowVersion":0}]','Cruce de materia','81000000-0000-4000-8000-000000000005')$$,'PT403',null,'Profesor no muta otra asignación del grupo');
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.editar_calificaciones_academicas('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001','[{"sourceType":"directCriterion","enrollmentId":"1e000000-0000-4000-8000-000000000001","criterionId":"1c600000-0000-4000-8000-000000000001","state":"calificado","grade":9,"expectedRowVersion":0}]','Alumno intenta editar','81000000-0000-4000-8000-000000000006')$$,'PT403',null,'Alumno no muta calificaciones');
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.cerrar_calificaciones_academicas('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001','Profesor intenta cerrar','82000000-0000-4000-8000-000000000001')$$,'PT403',null,'Profesor no cierra');

select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
create temporary table step8_preview as select public.previsualizar_cierre_calificaciones('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001') response;
select is((select (response->>'totalCount')::integer from step8_preview),1,'Preview cuenta matrículas');
select is((select (response->>'missingCount')::integer from step8_preview),0,'Preview cuenta cero faltantes');
select ok((select (response->>'canClose')::boolean from step8_preview),'Preview habilita cierre completo');
create temporary table step8_close as select public.cerrar_calificaciones_academicas('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001','Cierre institucional','82000000-0000-4000-8000-000000000002') response;
select is((select response->>'status' from step8_close),'closed','Admin cierra alcance');
select is((select (response->>'snapshotCount')::integer from step8_close),1,'Cierre materializa un snapshot');
select is((select count(*)::integer from public.cierres_calificaciones where version_cierre=1),1,'Existe una versión cerrada');
select is((select resultado_exacto from public.cierres_calificaciones where version_cierre=1),9.0000::numeric,'Snapshot conserva resultado exacto');
select is((select breakdown->>'exactGrade' from public.cierres_calificaciones where version_cierre=1),'9.0000','Breakdown reproduce total exacto');
select is((select count(*)::integer from public.auditoria where accion='academic.grades.closed'),1,'Cierre queda auditado una vez');

create temporary table step8_close_replay as select public.cerrar_calificaciones_academicas('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001','Cierre institucional','82000000-0000-4000-8000-000000000002') response;
select ok((select (response->>'replayed')::boolean from step8_close_replay),'Cierre repetido es idempotente');
select is((select count(*)::integer from public.cierres_calificaciones),1,'Replay no duplica snapshot');
reset role;
select is((select count(*)::integer from public.solicitudes_mutacion_academica where idempotency_key='82000000-0000-4000-8000-000000000002'),1,'Replay no duplica solicitud de cierre');
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.cerrar_calificaciones_academicas('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001','Segundo cierre','82000000-0000-4000-8000-000000000003')$$,'PT409',null,'Segundo cierre con otra clave devuelve 409');

select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select throws_ok(format($sql$select public.editar_calificaciones_academicas('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001',%L::jsonb,'Editar cerrado','81000000-0000-4000-8000-000000000007')$sql$,jsonb_build_array(jsonb_build_object('sourceType','directCriterion','sourceId',s.source_id,'enrollmentId',s.enrollment_id,'criterionId',s.criterion_id,'state','calificado','grade',10,'expectedRowVersion',s.initial_version+2))::text),'PT409',null,'RPC no edita alcance cerrado') from step8_state s;
reset role;
select throws_ok($$update public.calificaciones_directas set observacion='Bypass' where id=(select source_id from step8_state)$$,'PT409',null,'Ni postgres elude guarda de fuente cerrada');
select throws_ok($$update public.criterios_evaluacion set nombre='Bypass' where id='1c600000-0000-4000-8000-000000000001'$$,'PT409',null,'Configuración queda bloqueada tras cierre');
select throws_ok($$update public.cierres_calificaciones set motivo='Bypass'$$,'PT409',null,'Snapshot no se actualiza');
select throws_ok($$delete from public.cierres_calificaciones$$,'PT409',null,'Snapshot no se borra');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.reabrir_calificaciones_academicas('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001','Profesor intenta reabrir','83000000-0000-4000-8000-000000000001')$$,'PT403',null,'Profesor no reabre');
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.reabrir_calificaciones_academicas('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001',' ','83000000-0000-4000-8000-000000000002')$$,'PT422',null,'Reapertura exige motivo');
create temporary table step8_reopen as select public.reabrir_calificaciones_academicas('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001','Corrección posterior al cierre','83000000-0000-4000-8000-000000000003') response;
select is((select response->>'status' from step8_reopen),'reopened','Admin reabre');
select is((select count(*)::integer from public.cierres_calificaciones where version_cierre=2 and estado='reabierto'),1,'Reapertura crea versión dos');
select is((select count(*)::integer from public.cierres_calificaciones where version_cierre=1 and estado='cerrado'),1,'Snapshot cerrado previo permanece intacto');
select is((select count(*)::integer from public.cierres_calificaciones c2 join public.cierres_calificaciones c1 on c1.id=c2.snapshot_parent_id where c2.version_cierre=2 and c1.version_cierre=1),1,'Reapertura referencia versión previa');
select is((select count(*)::integer from public.auditoria where accion='academic.grades.reopened'),1,'Reapertura queda auditada');
create temporary table step8_reopen_replay as select public.reabrir_calificaciones_academicas('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001','Corrección posterior al cierre','83000000-0000-4000-8000-000000000003') response;
select ok((select (response->>'replayed')::boolean from step8_reopen_replay),'Reapertura repetida es idempotente');

select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
create temporary table step8_after_reopen as
select public.editar_calificaciones_academicas(
  '1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('sourceType','directCriterion','sourceId',s.source_id,'enrollmentId',s.enrollment_id,'criterionId',s.criterion_id,'state','calificado','grade',9.5,'expectedRowVersion',s.initial_version+2)),
  'Ajuste tras reapertura','81000000-0000-4000-8000-000000000008'
) response from step8_state s;
select is((select response->>'status' from step8_after_reopen),'saved','Reapertura habilita nueva edición');
select ok(not private.academic_scope_is_closed('10000000-0000-4000-8000-000000000001','1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001'),'Última versión reabierta deja alcance editable');
reset role;
select is((select count(*)::integer from public.auditoria where accion='academic.grade.updated'),3,'Sólo tres cambios exitosos generan auditoría');
select is((select count(*)::integer from public.auditoria where accion like 'academic.%' and not (detalles ? 'before' and detalles ? 'after' and detalles ? 'reason' and detalles ? 'correlationId')),0,'Toda auditoría académica tiene before/after/motivo/correlación');
select is((select count(*)::integer from public.solicitudes_mutacion_academica where idempotency_key='82000000-0000-4000-8000-000000000003'),0,'Cierre doble fallido revierte su reserva');

set local role authenticated;
select set_config('request.jwt.claim.sub','2a000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.cierres_calificaciones),0,'Admin de tenant B no lee snapshots A');
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.cierres_calificaciones),2,'Admin A lee sus dos versiones');

select * from finish();
rollback;
