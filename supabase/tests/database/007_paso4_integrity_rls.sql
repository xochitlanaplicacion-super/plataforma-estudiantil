begin;
set local search_path = public, extensions;

select plan(34);

insert into public.esquemas_evaluacion (
  id, tenant_id, ciclo_escolar_id, asignacion_profesor_id,
  periodo_evaluacion_id, nombre, created_by
)
select '1e000000-0000-4000-8000-000000000100', a.tenant_id, a.ciclo_escolar_id,
       a.id, p.id, 'Esquema ponderado', '1a000000-0000-4000-8000-000000000001'
from public.asignaciones_profesor a
join public.periodos_evaluacion p on p.tenant_id=a.tenant_id and p.ciclo_escolar_id=a.ciclo_escolar_id
where a.id='1f000000-0000-4000-8000-000000000001' and p.orden=1;

insert into public.criterios_evaluacion (
  id, tenant_id, esquema_evaluacion_id, nombre, tipo, peso, orden, created_by
) values
  ('1c000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000100','Trabajo continuo','hibrido',60,1,'1a000000-0000-4000-8000-000000000001'),
  ('1c000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000100','Examen','directo',30,2,'1a000000-0000-4000-8000-000000000001');
insert into public.subcriterios_evaluacion (
  id, tenant_id, criterio_evaluacion_id, nombre, tipo, peso_interno, orden, configuracion, created_by
) values
  ('1d000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','1c000000-0000-4000-8000-000000000001','Actividades','actividades',25,1,'{"agregacion":"promedio"}','1a000000-0000-4000-8000-000000000001'),
  ('1d000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','1c000000-0000-4000-8000-000000000001','Participación','participacion',75,2,'{"modo":"maximo_grupo"}','1a000000-0000-4000-8000-000000000001');

insert into public.esquemas_evaluacion (
  id, tenant_id, ciclo_escolar_id, asignacion_profesor_id,
  periodo_evaluacion_id, nombre, created_by
)
select '1e000000-0000-4000-8000-000000000300', a.tenant_id, a.ciclo_escolar_id,
       a.id, p.id, 'Esquema límite', '1a000000-0000-4000-8000-000000000001'
from public.asignaciones_profesor a
join public.periodos_evaluacion p on p.tenant_id=a.tenant_id and p.ciclo_escolar_id=a.ciclo_escolar_id
where a.id='1f000000-0000-4000-8000-000000000001' and p.orden=2;

select is((select sum(peso) from public.criterios_evaluacion where esquema_evaluacion_id='1e000000-0000-4000-8000-000000000100'), 90.0000::numeric, 'Se representa un borrador menor a 100');
select is((select sum(peso_interno) from public.subcriterios_evaluacion where criterio_evaluacion_id='1c000000-0000-4000-8000-000000000001'), 100.0000::numeric, 'Internos suman exactamente 100');
select is(private.academic_effective_weight(60,25), 15.0000::numeric, 'Impacto efectivo SQL 60×25%=15');
select is(private.academic_effective_weight(33.3333,33.3333), 11.1111::numeric, 'Residuo decimal SQL redondea a cuatro decimales');

select throws_like($$insert into public.criterios_evaluacion (tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,created_by) values ('10000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000100','Negativo','directo',-1,4,'1a000000-0000-4000-8000-000000000001')$$, '%criterios_evaluacion_peso_0_100%', 'Peso negativo rechazado');
select throws_like($$insert into public.subcriterios_evaluacion (tenant_id,criterio_evaluacion_id,nombre,tipo,peso_interno,orden,configuracion,created_by) values ('10000000-0000-4000-8000-000000000001','1c000000-0000-4000-8000-000000000001','JSON inválido','actividades',1,3,'{"agregacion":"suma"}','1a000000-0000-4000-8000-000000000001')$$, '%subcriterios_evaluacion_configuracion_valida%', 'Configuración JSON no permitida es rechazada');
select throws_like($$insert into public.subcriterios_evaluacion (tenant_id,criterio_evaluacion_id,nombre,tipo,peso_interno,orden,configuracion,created_by) values ('10000000-0000-4000-8000-000000000001','1c000000-0000-4000-8000-000000000001','Híbrido anidado','hibrido',1,3,'{}','1a000000-0000-4000-8000-000000000001')$$, '%subcriterios_evaluacion_configuracion_valida%', 'No se anida un subcriterio híbrido');
select throws_like($$insert into public.criterios_evaluacion (tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,created_by) values ('20000000-0000-4000-8000-000000000002','1e000000-0000-4000-8000-000000000100','Cruce','directo',10,3,'2a000000-0000-4000-8000-000000000001')$$, '%El esquema no pertenece al tenant%', 'Trigger bloquea criterio cruzado entre tenants');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
select throws_like($$select * from public.activar_esquema_evaluacion('1e000000-0000-4000-8000-000000000100',1)$$, '%sumar exactamente 100.0000%', 'No activa total menor a 100');
select throws_like($$update public.esquemas_evaluacion set estado='activo' where id='1e000000-0000-4000-8000-000000000100'$$, '%permission denied%', 'El cliente no activa con UPDATE directo');
select throws_like($$insert into public.esquemas_evaluacion (tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,nombre,estado,created_by) select tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,'Activo fabricado','activo','1a000000-0000-4000-8000-000000000001' from public.esquemas_evaluacion where id='1e000000-0000-4000-8000-000000000100'$$, '%permission denied%', 'El cliente no inserta un esquema activo');
select throws_like($$select * from public.activar_esquema_evaluacion('1e000000-0000-4000-8000-000000000300',1)$$, '%al menos un criterio activo%', 'No activa un esquema sin criterios');
insert into public.criterios_evaluacion (id,tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,created_by) values
  ('1c000000-0000-4000-8000-000000000301','10000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000300','Exceso A','directo',60,1,'1a000000-0000-4000-8000-000000000001'),
  ('1c000000-0000-4000-8000-000000000302','10000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000300','Exceso B','directo',50,2,'1a000000-0000-4000-8000-000000000001');
select throws_like($$select * from public.activar_esquema_evaluacion('1e000000-0000-4000-8000-000000000300',1)$$, '%sumar exactamente 100.0000%', 'No activa total mayor a 100');
insert into public.criterios_evaluacion (id,tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,created_by) values ('1c000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000100','Proyecto','directo',10,3,'1a000000-0000-4000-8000-000000000001');
select is((select estado from public.activar_esquema_evaluacion('1e000000-0000-4000-8000-000000000100',1)), 'activo', 'Activa atómicamente total exacto 100');
select throws_like($$select * from public.activar_esquema_evaluacion('1e000000-0000-4000-8000-000000000100',0)$$, '%versión esperada%vigente%', 'Versión concurrente obsoleta se rechaza');
select is((select version from public.copiar_esquema_evaluacion('1e000000-0000-4000-8000-000000000100',1,'Esquema ponderado v2')), 2, 'Copia histórica crea versión 2');
select is((select count(*) from public.esquemas_evaluacion where copiado_desde_id='1e000000-0000-4000-8000-000000000100'), 1::bigint, 'Existe una única copia de la fuente');
select is((select version from public.copiar_esquema_evaluacion('1e000000-0000-4000-8000-000000000100',1,'Esquema ponderado v2')), 2, 'Reintento idéntico es idempotente');
select is((select count(*) from public.criterios_evaluacion where esquema_evaluacion_id=(select id from public.esquemas_evaluacion where copiado_desde_id='1e000000-0000-4000-8000-000000000100')), 3::bigint, 'La copia conserva los criterios');
select is((select count(*) from public.subcriterios_evaluacion where criterio_evaluacion_id in (select id from public.criterios_evaluacion where esquema_evaluacion_id=(select id from public.esquemas_evaluacion where copiado_desde_id='1e000000-0000-4000-8000-000000000100'))), 2::bigint, 'La copia conserva los subcriterios');
select throws_like($$select * from public.copiar_esquema_evaluacion('1e000000-0000-4000-8000-000000000100',1,'Parámetros distintos')$$, '%parámetros diferentes%', 'Reintento con carga distinta no duplica');
reset role;

select throws_like($$update public.criterios_evaluacion set peso=50 where id='1c000000-0000-4000-8000-000000000001'$$, '%Sólo se configura un esquema borrador%', 'Configuración histórica activada/archivada es inmutable');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.criterios_evaluacion), 8::bigint, 'Profesor ve configuración de su propia asignación');
select is((select count(*) from public.subcriterios_evaluacion), 4::bigint, 'Profesor ve subcriterios de su propia asignación');
update public.criterios_evaluacion set peso=1;
select throws_like($$insert into public.criterios_evaluacion (tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,created_by) select tenant_id,id,'Docente','directo',1,4,'1a000000-0000-4000-8000-000000000003' from public.esquemas_evaluacion where estado='borrador' limit 1$$, '%El esquema no pertenece al tenant%', 'Profesor no crea criterios según matriz V2');
reset role;
select is((select peso from public.criterios_evaluacion where id='1c000000-0000-4000-8000-000000000001'), 60.0000::numeric, 'Update docente no alteró el dato');

set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.criterios_evaluacion), 0::bigint, 'Alumno no consulta configuración interna');
select is((select count(*) from public.subcriterios_evaluacion), 0::bigint, 'Alumno no consulta subcriterios');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','2a000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.criterios_evaluacion where tenant_id='10000000-0000-4000-8000-000000000001'), 0::bigint, 'Admin B no ve criterios de tenant A');
select is((select count(*) from public.subcriterios_evaluacion where tenant_id='10000000-0000-4000-8000-000000000001'), 0::bigint, 'Admin B no ve subcriterios de tenant A');
select throws_like($$select * from public.activar_esquema_evaluacion('1e000000-0000-4000-8000-000000000100',1)$$, '%Esquema no encontrado%', 'RPC no revela esquema de otro tenant');
reset role;

select is((select escala from public.esquemas_evaluacion where id='1e000000-0000-4000-8000-000000000100'), '0-10', 'Ponderaciones 0-100 no cambian escala de notas 0-10');
select is((select sum(peso) from public.criterios_evaluacion where esquema_evaluacion_id='1e000000-0000-4000-8000-000000000100'), 100.0000::numeric, 'La versión histórica conserva total superior exacto');
select is((select sum(peso_interno) from public.subcriterios_evaluacion where criterio_evaluacion_id='1c000000-0000-4000-8000-000000000001'), 100.0000::numeric, 'La versión histórica conserva total interno exacto');

select * from finish();
rollback;
