begin;
set local search_path = public, extensions;

select plan(12);

select ok(
  exists (select 1 from public.asignaciones_profesor where id = '1f000000-0000-4000-8000-000000000001'),
  'El backfill preservó el ID de la asignación histórica'
);
select is(
  (select grado_id from public.asignaciones_profesor where id = '1f000000-0000-4000-8000-000000000001'),
  '13000000-0000-4000-8000-000000000001'::uuid,
  'La conversión text->uuid preservó grado_id'
);

select throws_ok(
  $$insert into public.inscripciones_alumno (
      tenant_id, alumno_id, ciclo_escolar_id, nivel_id, carrera_id, grado_id,
      grupo_id, fecha_inicio, activo
    )
    select tenant_id, alumno_id, ciclo_escolar_id, nivel_id, carrera_id, grado_id,
           grupo_id, fecha_inicio, true
    from public.inscripciones_alumno
    where alumno_id = '1a000000-0000-4000-8000-000000000002' and activo$$,
  '23505',
  'duplicate key value violates unique constraint "inscripciones_alumno_un_activo_idx"',
  'Se rechaza una segunda inscripción activa del alumno en el ciclo'
);

select throws_ok(
  $$insert into public.inscripciones_alumno (
      tenant_id, alumno_id, ciclo_escolar_id, nivel_id, carrera_id, grado_id,
      grupo_id, fecha_inicio, activo
    )
    select '10000000-0000-4000-8000-000000000001',
           '2a000000-0000-4000-8000-000000000002', c.id,
           '11000000-0000-4000-8000-000000000001',
           '12000000-0000-4000-8000-000000000001',
           '13000000-0000-4000-8000-000000000001',
           '14000000-0000-4000-8000-000000000001', c.fecha_inicio, true
    from public.ciclos_escolares c
    where c.tenant_id = '10000000-0000-4000-8000-000000000001' and c.estado = 'activo'$$,
  'P0001',
  'El alumno no pertenece al tenant o no tiene rol alumno',
  'Se rechaza un alumno perteneciente a otro tenant'
);

select throws_ok(
  $$insert into public.asignaciones_profesor (
      tenant_id, profesor_id, ciclo_escolar_id, nivel_id, carrera_id, grado_id,
      grupo_id, materia_id, vigencia_desde, activo
    )
    select '10000000-0000-4000-8000-000000000001',
           '2a000000-0000-4000-8000-000000000003', c.id,
           '11000000-0000-4000-8000-000000000001',
           '12000000-0000-4000-8000-000000000001',
           '13000000-0000-4000-8000-000000000001',
           '14000000-0000-4000-8000-000000000001',
           '15000000-0000-4000-8000-000000000001', c.fecha_inicio, true
    from public.ciclos_escolares c
    where c.tenant_id = '10000000-0000-4000-8000-000000000001' and c.estado = 'activo'$$,
  'P0001',
  'El profesor no pertenece al tenant o no tiene rol profesor',
  'Se rechaza un profesor perteneciente a otro tenant'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.ciclos_escolares), 1::bigint, 'El alumno sólo ve el ciclo de su tenant');
select is((select count(*) from public.inscripciones_alumno), 1::bigint, 'El alumno sólo ve su matrícula');
select is(
  (select count(*) from public.inscripciones_alumno where tenant_id = '20000000-0000-4000-8000-000000000002'),
  0::bigint,
  'RLS oculta matrículas de otro tenant'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.ciclos_escolares), 0::bigint, 'Un usuario suspendido no ve ciclos');
reset role;

update public.tenants set estado = 'suspendido' where id = '10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.ciclos_escolares), 0::bigint, 'Un tenant suspendido no expone contexto académico');
reset role;
update public.tenants set estado = 'activo' where id = '10000000-0000-4000-8000-000000000001';

update public.inscripciones_alumno
set activo = false, fecha_fin = greatest(current_date, fecha_inicio)
where alumno_id = '1a000000-0000-4000-8000-000000000002' and activo;
select is(
  (select grupo_id from public.profiles where id = '1a000000-0000-4000-8000-000000000002'),
  null::uuid,
  'Desactivar la inscripción limpia la proyección profiles.grupo_id'
);
update public.inscripciones_alumno
set activo = true, fecha_fin = null
where alumno_id = '1a000000-0000-4000-8000-000000000002' and not activo;
select is(
  (select grupo_id from public.profiles where id = '1a000000-0000-4000-8000-000000000002'),
  '14000000-0000-4000-8000-000000000001'::uuid,
  'Reactivar la inscripción restaura la proyección profiles.grupo_id'
);

select * from finish();
rollback;
