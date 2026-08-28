begin;
set local search_path = public, extensions;
select plan(31);

-- Segundo profesor del mismo grupo, pero de otra materia, y asignación B.
insert into public.materias (id,carrera_id,grado_id,nombre,tenant_id) values
('15000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','Materia A2','10000000-0000-4000-8000-000000000001');
insert into public.profiles (id,tenant_id,rol,estatus,nombre,apellidos,email,curp) values
('1a000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','profesor','activo','Profesor','A2','teacher-a2@example.invalid','SYNTHETICTEACA002');

insert into public.asignaciones_profesor (
  id,profesor_id,nivel_id,carrera_id,grado_id,grupo_id,materia_id,activo,
  tenant_id,ciclo_escolar_id,vigencia_desde,tipo_participacion
)
select '1f000000-0000-4000-8000-000000000002',
  '1a000000-0000-4000-8000-000000000005',
  '11000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000002',true,
  '10000000-0000-4000-8000-000000000001',c.id,c.fecha_inicio,'titular'
from public.ciclos_escolares c
where c.tenant_id='10000000-0000-4000-8000-000000000001' and c.estado='activo';

insert into public.asignaciones_profesor (
  id,profesor_id,nivel_id,carrera_id,grado_id,grupo_id,materia_id,activo,
  tenant_id,ciclo_escolar_id,vigencia_desde,tipo_participacion
)
select '2f000000-0000-4000-8000-000000000002',
  '2a000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000002',
  '24000000-0000-4000-8000-000000000002',
  '25000000-0000-4000-8000-000000000002',true,
  '20000000-0000-4000-8000-000000000002',c.id,c.fecha_inicio,'titular'
from public.ciclos_escolares c
where c.tenant_id='20000000-0000-4000-8000-000000000002' and c.estado='activo';

-- Un esquema/criterio directo y una nota por asignación.
insert into public.esquemas_evaluacion (
  id,tenant_id,ciclo_escolar_id,asignacion_profesor_id,
  periodo_evaluacion_id,nombre,created_by
)
select x.scheme_id,a.tenant_id,a.ciclo_escolar_id,a.id,p.id,'Seguridad Paso 6',x.actor
from (values
  ('1f000000-0000-4000-8000-000000000001'::uuid,'1e600000-0000-4000-8000-000000000001'::uuid,'1a000000-0000-4000-8000-000000000001'::uuid),
  ('1f000000-0000-4000-8000-000000000002'::uuid,'1e600000-0000-4000-8000-000000000002'::uuid,'1a000000-0000-4000-8000-000000000001'::uuid),
  ('2f000000-0000-4000-8000-000000000002'::uuid,'2e600000-0000-4000-8000-000000000002'::uuid,'2a000000-0000-4000-8000-000000000001'::uuid)
) x(assignment_id,scheme_id,actor)
join public.asignaciones_profesor a on a.id=x.assignment_id
join public.periodos_evaluacion p on p.tenant_id=a.tenant_id and p.ciclo_escolar_id=a.ciclo_escolar_id and p.orden=1;

insert into public.criterios_evaluacion (
  id,tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,created_by
)
select x.criterion_id,e.tenant_id,e.id,'Directo','directo',100,1,x.actor
from (values
  ('1e600000-0000-4000-8000-000000000001'::uuid,'1c600000-0000-4000-8000-000000000001'::uuid,'1a000000-0000-4000-8000-000000000001'::uuid),
  ('1e600000-0000-4000-8000-000000000002'::uuid,'1c600000-0000-4000-8000-000000000002'::uuid,'1a000000-0000-4000-8000-000000000001'::uuid),
  ('2e600000-0000-4000-8000-000000000002'::uuid,'2c600000-0000-4000-8000-000000000002'::uuid,'2a000000-0000-4000-8000-000000000001'::uuid)
) x(scheme_id,criterion_id,actor)
join public.esquemas_evaluacion e on e.id=x.scheme_id;

insert into public.criterios_evaluacion (
  id,tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,created_by
)
select '1c600000-0000-4000-8000-000000000003',e.tenant_id,e.id,
  'Participación','participacion',0,2,'1a000000-0000-4000-8000-000000000001'
from public.esquemas_evaluacion e
where e.id='1e600000-0000-4000-8000-000000000001';

insert into public.calificaciones_directas (
  tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,
  criterio_evaluacion_id,inscripcion_alumno_id,alumno_id,estado,
  calificacion,calificado_por
)
select e.tenant_id,e.ciclo_escolar_id,e.asignacion_profesor_id,
  e.periodo_evaluacion_id,c.id,i.id,i.alumno_id,'calificado',x.grade,x.actor
from (values
  ('1e600000-0000-4000-8000-000000000001'::uuid,8.0000::numeric,'1a000000-0000-4000-8000-000000000003'::uuid),
  ('1e600000-0000-4000-8000-000000000002'::uuid,9.0000::numeric,'1a000000-0000-4000-8000-000000000005'::uuid),
  ('2e600000-0000-4000-8000-000000000002'::uuid,7.0000::numeric,'2a000000-0000-4000-8000-000000000003'::uuid)
) x(scheme_id,grade,actor)
join public.esquemas_evaluacion e on e.id=x.scheme_id
join public.criterios_evaluacion c on c.esquema_evaluacion_id=e.id
  and c.tenant_id=e.tenant_id and c.tipo='directo'
join public.asignaciones_profesor a on a.id=e.asignacion_profesor_id and a.tenant_id=e.tenant_id
join public.inscripciones_alumno i on i.tenant_id=a.tenant_id
  and i.ciclo_escolar_id=a.ciclo_escolar_id and i.grupo_id=a.grupo_id and i.activo;

-- Sin JWT/auth.uid(): helpers y tablas fallan cerrados.
select is(private.can_manage_teaching_assignment('10000000-0000-4000-8000-000000000001','1f000000-0000-4000-8000-000000000001'),false,'auth.uid NULL no administra asignación');
select is(private.can_view_enrollment('10000000-0000-4000-8000-000000000001',(select id from public.inscripciones_alumno where alumno_id='1a000000-0000-4000-8000-000000000002'),'1f000000-0000-4000-8000-000000000001'),false,'auth.uid NULL no ve matrícula');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.vista_libreta_profesor),1::bigint,'Profesor A sólo ve su materia');
select is((select max(valor_fuente) from public.vista_libreta_profesor),8.00000000::numeric,'Profesor A no recibe nota de profesor A2');
select is((select count(*) from public.vista_desglose_calificacion),1::bigint,'Desglose de profesor respeta asignación exacta');
select is((select count(*) from public.calificaciones_directas where tenant_id='20000000-0000-4000-8000-000000000002'),0::bigint,'Profesor A no cruza tenant B');
select is((select private.can_manage_teaching_assignment('10000000-0000-4000-8000-000000000001','1f000000-0000-4000-8000-000000000002')),false,'Profesor A no administra materia A2 manipulada');
select is((select private.can_view_enrollment('10000000-0000-4000-8000-000000000001',(select id from public.inscripciones_alumno where alumno_id='1a000000-0000-4000-8000-000000000002'),'1f000000-0000-4000-8000-000000000002')),false,'Profesor A no usa asignación A2 en IDOR');
select throws_like($$delete from public.calificaciones_directas$$,'%permission denied%','Profesor no borra notas');
select throws_like($$update public.resultados_ejercicios set calificacion=10$$,'%permission denied%','Profesor no edita resultados directamente');
select results_eq($$with changed as (update public.calificaciones_directas set observacion='Propia' where asignacion_profesor_id='1f000000-0000-4000-8000-000000000001' returning 1) select count(*)::bigint from changed$$,array[1::bigint],'Profesor actualiza sólo su nota directa autorizada');
select results_eq($$with changed as (update public.calificaciones_directas set observacion='IDOR' where asignacion_profesor_id='1f000000-0000-4000-8000-000000000002' returning 1) select count(*)::bigint from changed$$,array[0::bigint],'Profesor no actualiza nota de otra materia del mismo grupo');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000005',true);
select is((select count(*) from public.vista_libreta_profesor),1::bigint,'Profesor A2 sólo ve su materia');
select is((select max(valor_fuente) from public.vista_libreta_profesor),9.00000000::numeric,'Profesor A2 recibe sólo su nota');
select is((select count(*) from public.calificaciones_directas where asignacion_profesor_id='1f000000-0000-4000-8000-000000000001'),0::bigint,'Profesor A2 no lee materia A');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.vista_calificaciones_alumno),2::bigint,'Alumno A ve sus dos materias');
select is((select count(*) from public.vista_libreta_profesor),0::bigint,'Alumno no abre libreta de profesor');
select is((select count(*) from public.calificaciones_directas where alumno_id='2a000000-0000-4000-8000-000000000002'),0::bigint,'Alumno A no lee alumno B');
select throws_like($$insert into public.calificaciones_directas (tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,inscripcion_alumno_id,alumno_id,estado) select tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,inscripcion_alumno_id,alumno_id,'justificado' from public.calificaciones_directas limit 1$$,'%row-level security%','Alumno no inserta calificación');
select throws_like($$insert into public.eventos_participacion (tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,criterio_evaluacion_id,inscripcion_alumno_id,alumno_id,puntos,modo_normalizacion,meta_objetivo,actor_id) select tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,'1c600000-0000-4000-8000-000000000003',inscripcion_alumno_id,alumno_id,1,'meta_fija',5,'1a000000-0000-4000-8000-000000000002' from public.calificaciones_directas where asignacion_profesor_id='1f000000-0000-4000-8000-000000000001' limit 1$$,'%row-level security%','Alumno no registra participación');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.vista_libreta_profesor),2::bigint,'Admin A ve todas las asignaciones A');
select is((select count(*) from public.calificaciones_directas where tenant_id='20000000-0000-4000-8000-000000000002'),0::bigint,'Admin A no cruza tenant B');
select is((select count(*) from public.vista_calificaciones_alumno),0::bigint,'Admin no suplanta vista exclusiva de alumno');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','2a000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.vista_libreta_profesor),1::bigint,'Admin B sólo ve tenant B');
select is((select count(*) from public.calificaciones_directas where tenant_id='10000000-0000-4000-8000-000000000001'),0::bigint,'Admin B no cruza tenant A');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000004',true);
select is((select count(*) from public.calificaciones_directas),0::bigint,'Usuario suspendido obtiene cero filas');
select is((select count(*) from public.vista_libreta_profesor),0::bigint,'Usuario suspendido obtiene libreta vacía');
reset role;

update public.tenants set estado='suspendido' where id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.calificaciones_directas),0::bigint,'Tenant suspendido obtiene cero filas');
select is((select count(*) from public.vista_libreta_profesor),0::bigint,'Tenant suspendido obtiene libreta vacía');
reset role;

set local role anon;
select throws_like($$select * from public.vista_calificaciones_alumno$$,'%permission denied%','Anon no consulta vista alumno');
select throws_like($$select * from public.resultados_ejercicios$$,'%permission denied%','Anon no consulta resultados');
reset role;

select * from finish();
rollback;
