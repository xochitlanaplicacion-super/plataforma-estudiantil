begin;
set local search_path = public, extensions;

select plan(32);

select is(
  (select count(*) from public.periodos_evaluacion
   where tenant_id = '10000000-0000-4000-8000-000000000001'),
  3::bigint,
  'Tenant A recibe exactamente los tres periodos institucionales'
);
select is(
  (select min(fecha_inicio)::text || ',' || max(fecha_fin)::text
   from public.periodos_evaluacion
   where tenant_id = '10000000-0000-4000-8000-000000000001'),
  '2026-08-31,2027-07-16',
  'Los periodos cubren los limites aprobados del ciclo'
);
select is(
  (select count(*) from public.periodos_evaluacion a
   join public.periodos_evaluacion b
     on b.tenant_id = a.tenant_id and b.ciclo_escolar_id = a.ciclo_escolar_id
    and b.id > a.id
    and daterange(a.fecha_inicio, a.fecha_fin, '[]') && daterange(b.fecha_inicio, b.fecha_fin, '[]')),
  0::bigint,
  'Los periodos iniciales no se solapan'
);

select throws_like(
  $$insert into public.periodos_evaluacion (
      tenant_id, ciclo_escolar_id, nombre, orden, fecha_inicio, fecha_fin
    ) select tenant_id, id, 'Fuera de ciclo', 10, date '2026-08-30', date '2026-08-30'
      from public.ciclos_escolares
      where tenant_id = '10000000-0000-4000-8000-000000000001'$$,
  '%contenido en las fechas del ciclo%',
  'Se rechaza un periodo fuera del ciclo'
);
select throws_like(
  $$insert into public.periodos_evaluacion (
      tenant_id, ciclo_escolar_id, nombre, orden, fecha_inicio, fecha_fin
    ) select tenant_id, id, 'Invertido', 11, date '2026-10-02', date '2026-10-01'
      from public.ciclos_escolares
      where tenant_id = '10000000-0000-4000-8000-000000000001'$$,
  '%periodos_evaluacion_fechas_validas%',
  'Se rechaza un periodo con fechas invertidas'
);
select throws_like(
  $$insert into public.periodos_evaluacion (
      tenant_id, ciclo_escolar_id, nombre, orden, fecha_inicio, fecha_fin
    ) select tenant_id, id, 'Solapado', 12, date '2026-11-27', date '2026-11-28'
      from public.ciclos_escolares
      where tenant_id = '10000000-0000-4000-8000-000000000001'$$,
  '%periodos_evaluacion_no_overlap%',
  'La exclusion rechaza cualquier solapamiento inclusivo'
);
select throws_like(
  $$update public.ciclos_escolares
    set fecha_inicio = date '2026-09-01'
    where tenant_id = '10000000-0000-4000-8000-000000000001'$$,
  '%dejarian periodos fuera de rango%',
  'No se puede estrechar un ciclo dejando periodos huerfanos'
);

insert into public.esquemas_evaluacion (
  id, tenant_id, ciclo_escolar_id, asignacion_profesor_id,
  periodo_evaluacion_id, nombre, created_by
)
select '1e000000-0000-4000-8000-000000000001', a.tenant_id,
       a.ciclo_escolar_id, a.id, p.id, 'Esquema ordinario',
       '1a000000-0000-4000-8000-000000000001'
from public.asignaciones_profesor a
join public.periodos_evaluacion p
  on p.tenant_id = a.tenant_id and p.ciclo_escolar_id = a.ciclo_escolar_id
where a.id = '1f000000-0000-4000-8000-000000000001' and p.orden = 1;

select is(
  (select escala || ',' || calificacion_aprobatoria::text || ',' || decimales_mostrados::text
   from public.esquemas_evaluacion where id = '1e000000-0000-4000-8000-000000000001'),
  '0-10,6.0000,1',
  'El esquema nace con escala y reglas institucionales 0-10'
);
select throws_like(
  $$insert into public.esquemas_evaluacion (
      tenant_id, ciclo_escolar_id, asignacion_profesor_id,
      periodo_evaluacion_id, nombre, calificacion_aprobatoria, created_by
    ) select e.tenant_id, e.ciclo_escolar_id, e.asignacion_profesor_id,
      p.id, 'Aprobatoria invalida', 10.0001, e.created_by
      from public.esquemas_evaluacion e
      join public.periodos_evaluacion p on p.tenant_id=e.tenant_id and p.ciclo_escolar_id=e.ciclo_escolar_id and p.orden=2
      where e.id='1e000000-0000-4000-8000-000000000001'$$,
  '%esquemas_evaluacion_aprobatoria_0_10%',
  'Se rechaza aprobatoria mayor que 10'
);
select throws_like(
  $$insert into public.esquemas_evaluacion (
      tenant_id, ciclo_escolar_id, asignacion_profesor_id,
      periodo_evaluacion_id, nombre, valor_no_entrego, created_by
    ) select e.tenant_id, e.ciclo_escolar_id, e.asignacion_profesor_id,
      p.id, 'No entrego invalido', 11, e.created_by
      from public.esquemas_evaluacion e
      join public.periodos_evaluacion p on p.tenant_id=e.tenant_id and p.ciclo_escolar_id=e.ciclo_escolar_id and p.orden=2
      where e.id='1e000000-0000-4000-8000-000000000001'$$,
  '%esquemas_evaluacion_no_entrego_institucional%',
  'Se rechaza un valor no entregado fuera de 0-10 y distinto de cero'
);
select throws_like(
  $$insert into public.esquemas_evaluacion (
      tenant_id, ciclo_escolar_id, asignacion_profesor_id,
      periodo_evaluacion_id, nombre, escala, created_by
    ) select e.tenant_id, e.ciclo_escolar_id, e.asignacion_profesor_id,
      p.id, 'Escala invalida', '0-100', e.created_by
      from public.esquemas_evaluacion e
      join public.periodos_evaluacion p on p.tenant_id=e.tenant_id and p.ciclo_escolar_id=e.ciclo_escolar_id and p.orden=2
      where e.id='1e000000-0000-4000-8000-000000000001'$$,
  '%non-DEFAULT value into column "escala"%',
  'No se puede configurar otra escala'
);
select throws_like(
  $$insert into public.esquemas_evaluacion (
      tenant_id, ciclo_escolar_id, asignacion_profesor_id,
      periodo_evaluacion_id, nombre, created_by
    ) select a.tenant_id, a.ciclo_escolar_id, a.id, p.id,
      'Periodo ajeno', '1a000000-0000-4000-8000-000000000001'
      from public.asignaciones_profesor a
      cross join public.periodos_evaluacion p
      where a.id='1f000000-0000-4000-8000-000000000001'
        and p.tenant_id='20000000-0000-4000-8000-000000000002' and p.orden=1$$,
  '%periodo no pertenece al contexto%',
  'Se rechaza un periodo de otro tenant'
);
select throws_like(
  $$insert into public.esquemas_evaluacion (
      tenant_id, ciclo_escolar_id, asignacion_profesor_id,
      periodo_evaluacion_id, nombre, version, created_by
    ) select tenant_id, ciclo_escolar_id, asignacion_profesor_id,
      periodo_evaluacion_id, 'Duplicado', 2, created_by
      from public.esquemas_evaluacion where id='1e000000-0000-4000-8000-000000000001'$$,
  '%esquemas_evaluacion_un_vigente_idx%',
  'Sólo existe un esquema vigente por asignacion y periodo'
);

update public.esquemas_evaluacion
set estado = 'archivado'
where id = '1e000000-0000-4000-8000-000000000001';
select throws_like(
  $$update public.esquemas_evaluacion
    set nombre='Historia reescrita'
    where id='1e000000-0000-4000-8000-000000000001'$$,
  '%archivado es historico e inmutable%',
  'Una version archivada no puede reescribirse'
);
insert into public.esquemas_evaluacion (
  id, tenant_id, ciclo_escolar_id, asignacion_profesor_id,
  periodo_evaluacion_id, nombre, version, created_by
)
select '1e000000-0000-4000-8000-000000000002', tenant_id,
       ciclo_escolar_id, asignacion_profesor_id, periodo_evaluacion_id,
       'Esquema ordinario v2', 2, created_by
from public.esquemas_evaluacion
where id = '1e000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from public.esquemas_evaluacion
   where asignacion_profesor_id='1f000000-0000-4000-8000-000000000001'
     and periodo_evaluacion_id=(select periodo_evaluacion_id from public.esquemas_evaluacion where id='1e000000-0000-4000-8000-000000000002')),
  2::bigint,
  'El versionado conserva el historial archivado'
);
select is(
  (select count(*) from public.esquemas_evaluacion
   where asignacion_profesor_id='1f000000-0000-4000-8000-000000000001'
     and estado in ('borrador','activo')),
  1::bigint,
  'Sólo una version queda vigente'
);
update public.esquemas_evaluacion
set estado = 'activo'
where id = '1e000000-0000-4000-8000-000000000002';
select throws_like(
  $$update public.esquemas_evaluacion
    set calificacion_aprobatoria=7
    where id='1e000000-0000-4000-8000-000000000002'$$,
  '%activo solo puede archivarse%',
  'Una version activa no puede reescribir sus reglas'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.periodos_evaluacion), 3::bigint, 'Admin A sólo ve sus tres periodos');
select is((select count(*) from public.esquemas_evaluacion), 2::bigint, 'Admin A ve su historial de esquemas');
select throws_like(
  $$update public.periodos_evaluacion set estado='cerrado', locked_at=now(), locked_by='1a000000-0000-4000-8000-000000000001' where orden=1$$,
  '%row-level security policy%',
  'El cierre directo queda bloqueado hasta el flujo auditado del Paso 8'
);
select throws_like(
  $$insert into public.esquemas_evaluacion (
      tenant_id, ciclo_escolar_id, asignacion_profesor_id,
      periodo_evaluacion_id, nombre, created_by
    ) select tenant_id, ciclo_escolar_id, asignacion_profesor_id,
      (select id from public.periodos_evaluacion where orden=2),
      'Creador suplantado', '1a000000-0000-4000-8000-000000000003'
      from public.esquemas_evaluacion limit 1$$,
  '%row-level security policy%',
  'Un administrador no puede suplantar al creador'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.periodos_evaluacion), 3::bigint, 'Profesor sólo ve periodos de su ciclo asignado');
select is((select count(*) from public.esquemas_evaluacion), 2::bigint, 'Profesor sólo lee esquemas de su asignacion');
update public.esquemas_evaluacion set nombre='Cambio docente no autorizado';
select throws_like(
  $$insert into public.esquemas_evaluacion (
      tenant_id, ciclo_escolar_id, asignacion_profesor_id,
      periodo_evaluacion_id, nombre, created_by
    ) select a.tenant_id, a.ciclo_escolar_id, a.id, p.id,
      'Esquema docente', '1a000000-0000-4000-8000-000000000003'
      from public.asignaciones_profesor a
      join public.periodos_evaluacion p on p.tenant_id=a.tenant_id and p.ciclo_escolar_id=a.ciclo_escolar_id and p.orden=2
      where a.id='1f000000-0000-4000-8000-000000000001'$$,
  '%row-level security policy%',
  'Profesor no puede crear esquemas segun la matriz aprobada'
);
reset role;
select isnt(
  (select nombre from public.esquemas_evaluacion where id='1e000000-0000-4000-8000-000000000002'),
  'Cambio docente no autorizado',
  'La actualizacion docente no modifico el esquema'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.periodos_evaluacion), 3::bigint, 'Alumno sólo ve periodos de su inscripcion');
select is((select count(*) from public.esquemas_evaluacion), 0::bigint, 'Alumno no consulta configuracion interna de esquemas');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '2a000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.periodos_evaluacion where tenant_id='10000000-0000-4000-8000-000000000001'),
  0::bigint,
  'RLS oculta periodos de otro tenant'
);
select is((select count(*) from public.esquemas_evaluacion), 0::bigint, 'RLS oculta esquemas de otro tenant');
reset role;

update public.periodos_evaluacion
set estado='cerrado', locked_at=now(), locked_by='1a000000-0000-4000-8000-000000000001'
where tenant_id='10000000-0000-4000-8000-000000000001' and orden=1;
select throws_like(
  $$update public.periodos_evaluacion
    set nombre='Cerrado alterado'
    where tenant_id='10000000-0000-4000-8000-000000000001' and orden=1$$,
  '%periodo cerrado no es editable%',
  'Un periodo cerrado es inmutable'
);
select throws_like(
  $$update public.esquemas_evaluacion set nombre='Esquema cerrado alterado'
    where id='1e000000-0000-4000-8000-000000000002'$$,
  '%activo solo puede archivarse%',
  'El esquema activo sigue inmutable despues de cerrar el periodo'
);
select throws_like(
  $$delete from public.esquemas_evaluacion
    where id='1e000000-0000-4000-8000-000000000002'$$,
  '%periodo cerrado%',
  'No se borra el esquema de un periodo cerrado'
);

select * from finish();
rollback;
