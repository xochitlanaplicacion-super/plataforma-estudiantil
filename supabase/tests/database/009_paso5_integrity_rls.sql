begin;
set local search_path = public, extensions;
select plan(25);

insert into public.unidades (id,materia_id,titulo,tenant_id) values
('16000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001','Unidad A','10000000-0000-4000-8000-000000000001'),
('26000000-0000-4000-8000-000000000002','25000000-0000-4000-8000-000000000002','Unidad B','20000000-0000-4000-8000-000000000002');
insert into public.temas (id,unidad_id,titulo,tenant_id) values
('17000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001','Tema A','10000000-0000-4000-8000-000000000001'),
('27000000-0000-4000-8000-000000000002','26000000-0000-4000-8000-000000000002','Tema B','20000000-0000-4000-8000-000000000002');
insert into public.ejercicios (id,tema_id,titulo,tipo,tenant_id) values
('18000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000001','Auto A','opcion_multiple','10000000-0000-4000-8000-000000000001'),
('18000000-0000-4000-8000-000000000002','17000000-0000-4000-8000-000000000001','Entrega A','actividad_descriptiva','10000000-0000-4000-8000-000000000001'),
('28000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000002','Auto B','opcion_multiple','20000000-0000-4000-8000-000000000002');

insert into public.esquemas_evaluacion (id,tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,nombre,created_by)
select '1e500000-0000-4000-8000-000000000001',a.tenant_id,a.ciclo_escolar_id,a.id,p.id,'Fuentes Paso 5','1a000000-0000-4000-8000-000000000001'
from public.asignaciones_profesor a join public.periodos_evaluacion p on p.tenant_id=a.tenant_id and p.ciclo_escolar_id=a.ciclo_escolar_id
where a.id='1f000000-0000-4000-8000-000000000001' and p.orden=1;
insert into public.criterios_evaluacion (id,tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,created_by) values
('1c500000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','1e500000-0000-4000-8000-000000000001','Actividades','actividades',40,1,'1a000000-0000-4000-8000-000000000001'),
('1c500000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','1e500000-0000-4000-8000-000000000001','Directo','directo',30,2,'1a000000-0000-4000-8000-000000000001'),
('1c500000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','1e500000-0000-4000-8000-000000000001','Participación','participacion',30,3,'1a000000-0000-4000-8000-000000000001');

insert into public.vinculos_evaluacion_ejercicio (id,tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,ejercicio_id,origen,created_by)
select '1b500000-0000-4000-8000-000000000001',a.tenant_id,a.ciclo_escolar_id,a.id,p.id,'1c500000-0000-4000-8000-000000000001','18000000-0000-4000-8000-000000000001','automaticExercise','1a000000-0000-4000-8000-000000000001'
from public.asignaciones_profesor a join public.periodos_evaluacion p on p.tenant_id=a.tenant_id and p.ciclo_escolar_id=a.ciclo_escolar_id
where a.id='1f000000-0000-4000-8000-000000000001' and p.orden=1;

select throws_like($$insert into public.vinculos_evaluacion_ejercicio (tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,ejercicio_id,origen,created_by) select tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,ejercicio_id,origen,created_by from public.vinculos_evaluacion_ejercicio where id='1b500000-0000-4000-8000-000000000001'$$,'%vinculos_evaluacion_assignment_period_exercise_unique%','Fuente duplicada rechazada');
select throws_like($$update public.vinculos_evaluacion_ejercicio set ejercicio_id='28000000-0000-4000-8000-000000000002' where id='1b500000-0000-4000-8000-000000000001'$$,'%no pertenece a la materia%','Ejercicio de otro tenant/materia rechazado');

insert into public.resultados_ejercicios (tenant_id,alumno_id,ejercicio_id,calificacion,estado,inscripcion_alumno_id,vinculo_evaluacion_id,unidad_origen_id,origen,registro_legacy,calificado_por)
select i.tenant_id,i.alumno_id,'18000000-0000-4000-8000-000000000001',8.5,'calificado',i.id,'1b500000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001','automaticExercise',false,i.alumno_id
from public.inscripciones_alumno i where i.alumno_id='1a000000-0000-4000-8000-000000000002' and i.activo;
select is((select calificacion from public.resultados_ejercicios where ejercicio_id='18000000-0000-4000-8000-000000000001'),8.5000::numeric,'Nota canónica queda 0-10');
select is((select calificacion_manual from public.resultados_ejercicios where ejercicio_id='18000000-0000-4000-8000-000000000001'),8.5000::numeric,'Sombra legacy copia canon, no calcula otra verdad');
select throws_like($$insert into public.resultados_ejercicios (tenant_id,alumno_id,ejercicio_id,calificacion,estado,inscripcion_alumno_id,vinculo_evaluacion_id,unidad_origen_id,origen,registro_legacy,calificado_por) select tenant_id,alumno_id,ejercicio_id,7,'calificado',inscripcion_alumno_id,vinculo_evaluacion_id,unidad_origen_id,origen,false,alumno_id from public.resultados_ejercicios where ejercicio_id='18000000-0000-4000-8000-000000000001'$$,'%unique_alumno_ejercicio%','No duplica valor canónico por fuente');
select throws_like($$update public.resultados_ejercicios set calificacion=11 where ejercicio_id='18000000-0000-4000-8000-000000000001'$$,'%resultados_calificacion_0_10%','Nota mayor a diez rechazada');
select throws_like($$update public.resultados_ejercicios set estado='entregado' where ejercicio_id='18000000-0000-4000-8000-000000000001'$$,'%resultados_estado_calificacion_coherente%','Estado sin nota no retiene número');

insert into public.calificaciones_directas (tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,inscripcion_alumno_id,alumno_id,estado,calificacion,calificado_por)
select i.tenant_id,i.ciclo_escolar_id,a.id,p.id,'1c500000-0000-4000-8000-000000000002',i.id,i.alumno_id,'calificado',9,'1a000000-0000-4000-8000-000000000003'
from public.inscripciones_alumno i join public.asignaciones_profesor a on a.tenant_id=i.tenant_id and a.ciclo_escolar_id=i.ciclo_escolar_id and a.grupo_id=i.grupo_id
join public.periodos_evaluacion p on p.tenant_id=i.tenant_id and p.ciclo_escolar_id=i.ciclo_escolar_id
where i.alumno_id='1a000000-0000-4000-8000-000000000002' and p.orden=1;
select is((select calificacion from public.calificaciones_directas),9.0000::numeric,'Nota directa válida');
update public.calificaciones_directas set estado='justificado',calificacion=null;
select is((select estado from public.calificaciones_directas),'justificado','Justificado persiste sin nota');
select is((select calificacion from public.calificaciones_directas),null::numeric,'Justificado excluye valor');
select throws_like($$insert into public.calificaciones_directas (tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,inscripcion_alumno_id,alumno_id,estado,calificacion) select tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,'1c500000-0000-4000-8000-000000000001',inscripcion_alumno_id,alumno_id,'calificado',8 from public.calificaciones_directas limit 1$$,'%calificacion directa exige un criterio directo%','Criterio con ejercicio no admite nota directa');
select throws_like($$insert into public.calificaciones_directas (tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,inscripcion_alumno_id,alumno_id,estado) select d.tenant_id,d.ciclo_escolar_id,d.asignacion_profesor_id,d.periodo_evaluacion_id,d.criterio_evaluacion_id,i.id,i.alumno_id,'justificado' from public.calificaciones_directas d cross join public.inscripciones_alumno i where i.tenant_id='20000000-0000-4000-8000-000000000002' limit 1$$,'%no coincide con la inscripcion%','Alumno de otro tenant/grupo/ciclo rechazado');

insert into public.eventos_participacion (tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,inscripcion_alumno_id,alumno_id,puntos,modo_normalizacion,meta_objetivo,actor_id)
select tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,'1c500000-0000-4000-8000-000000000003',inscripcion_alumno_id,alumno_id,2,'meta_fija',4,'1a000000-0000-4000-8000-000000000003' from public.calificaciones_directas limit 1;
select is((select ratio_normalizado from public.vista_participacion_normalizada),0.50000000::numeric,'Participación normaliza por meta');
select throws_like($$insert into public.eventos_participacion (tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,inscripcion_alumno_id,alumno_id,puntos,modo_normalizacion,meta_objetivo,actor_id) select tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,inscripcion_alumno_id,alumno_id,-1,'meta_fija',4,actor_id from public.eventos_participacion limit 1$$,'%eventos_participacion_puntos_positivos%','Participación negativa rechazada');
select throws_like($$update public.eventos_participacion set puntos=3$$,'%append-only%','Ledger no se actualiza');
select throws_like($$delete from public.eventos_participacion$$,'%append-only%','Ledger no se borra');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.vista_fuentes_calificacion),2::bigint,'Alumno ve sólo sus fuentes');
select throws_like($$update public.resultados_ejercicios set calificacion=10$$,'%permission denied%','Alumno nunca edita nota');
select is((select count(*) from public.eventos_participacion),1::bigint,'Alumno ve sus eventos');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','2a000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.vista_fuentes_calificacion where tenant_id='10000000-0000-4000-8000-000000000001'),0::bigint,'Tenant B no ve fuentes A');
select is((select count(*) from public.vista_participacion_normalizada where tenant_id='10000000-0000-4000-8000-000000000001'),0::bigint,'Tenant B no ve participación A');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.vista_fuentes_calificacion),2::bigint,'Profesor ve sólo su asignación');
select is((select count(*) from public.eventos_participacion),1::bigint,'Profesor ve participación propia');
reset role;

select is((select count(*) from public.resultados_ejercicios r left join public.vinculos_evaluacion_ejercicio v on v.id=r.vinculo_evaluacion_id and v.tenant_id=r.tenant_id where not r.registro_legacy and v.id is null),0::bigint,'No hay resultados canónicos huérfanos');
select is((select count(*) from public.calificaciones_directas d left join public.inscripciones_alumno i on i.id=d.inscripcion_alumno_id and i.tenant_id=d.tenant_id where i.id is null),0::bigint,'No hay directas huérfanas');

select * from finish();
rollback;
