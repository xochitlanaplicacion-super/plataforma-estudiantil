-- Synthetic integration check. Run after the teacher criteria and work-report migrations.
-- The transaction rolls back all fixture rows.
begin;

insert into auth.users(id,email) values ('23000000-0000-4000-8000-000000000001','virtual-zero-test@example.invalid');
insert into public.tenants(id,slug,nombre,estado)
values ('23000000-0000-4000-8000-000000000002','virtual-zero-test','Prueba virtual','activo');
insert into public.profiles(id,tenant_id,nombre,apellidos,curp,email,rol,estatus)
values ('23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000002','Docente','Prueba',
  'TEST000000HDFXXX00','virtual-zero-test@example.invalid','profesor','activo')
on conflict (id) do update set tenant_id=excluded.tenant_id,
  nombre=excluded.nombre, apellidos=excluded.apellidos, curp=excluded.curp,
  email=excluded.email, rol=excluded.rol, estatus=excluded.estatus;
insert into public.niveles(id,tenant_id,nombre)
values ('23000000-0000-4000-8000-000000000003',
  '23000000-0000-4000-8000-000000000002','Secundaria');
insert into public.carreras(id,tenant_id,nivel_id,nombre)
values ('23000000-0000-4000-8000-000000000004',
  '23000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000003','General');
insert into public.grados(id,tenant_id,carrera_id,nombre)
values ('23000000-0000-4000-8000-000000000005',
  '23000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000004','Primero');
insert into public.grupos(id,tenant_id,carrera_id,grado_id,nombre)
values ('23000000-0000-4000-8000-000000000006',
  '23000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000004',
  '23000000-0000-4000-8000-000000000005','A');
insert into public.materias(id,tenant_id,carrera_id,grado_id,nombre)
values ('23000000-0000-4000-8000-000000000007',
  '23000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000004',
  '23000000-0000-4000-8000-000000000005','Inglés');
insert into public.ciclos_escolares(id,tenant_id,nombre,fecha_inicio,fecha_fin,estado)
values ('23000000-0000-4000-8000-000000000008',
  '23000000-0000-4000-8000-000000000002','2026-2027',
  '2026-08-01','2027-07-31','activo');
insert into public.periodos_evaluacion(id,tenant_id,ciclo_escolar_id,nombre,orden,
  fecha_inicio,fecha_fin,estado)
values ('23000000-0000-4000-8000-000000000009',
  '23000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000008','Periodo 1',1,
  '2026-08-01','2026-11-30','activo');
insert into public.asignaciones_profesor(id,tenant_id,ciclo_escolar_id,
  profesor_id,nivel_id,carrera_id,grado_id,grupo_id,materia_id,vigencia_desde)
values ('23000000-0000-4000-8000-000000000010',
  '23000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000008',
  '23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000003',
  '23000000-0000-4000-8000-000000000004',
  '23000000-0000-4000-8000-000000000005',
  '23000000-0000-4000-8000-000000000006',
  '23000000-0000-4000-8000-000000000007','2026-08-01');

select set_config('request.jwt.claim.sub',
  '23000000-0000-4000-8000-000000000001',true);

do $test$
declare category uuid; scheme_id uuid; policy boolean; work_report jsonb;
begin
  category := public.asegurar_categoria_plataforma_sin_peso(
    '23000000-0000-4000-8000-000000000010',
    '23000000-0000-4000-8000-000000000009');
  if category is null then raise exception 'No se creó la categoría sin peso'; end if;
  select c.esquema_evaluacion_id into scheme_id from public.criterios_evaluacion c
    where c.id=category and c.peso=0 and c.es_sistema_sin_peso;
  if scheme_id is null then raise exception 'Categoría inválida'; end if;
  if category is distinct from public.asegurar_categoria_plataforma_sin_peso(
    '23000000-0000-4000-8000-000000000010',
    '23000000-0000-4000-8000-000000000009') then
    raise exception 'La categoría se duplicó';
  end if;
  policy := public.configurar_ceros_virtuales_docente(scheme_id,true);
  if not policy or not exists (select 1 from public.esquemas_evaluacion e
    where e.id=scheme_id and e.pendientes_vencidos_como_cero) then
    raise exception 'No se guardó el switch';
  end if;
  work_report := public.obtener_reporte_trabajos_docente(
    '23000000-0000-4000-8000-000000000010');
  if work_report->>'assignmentId' <> '23000000-0000-4000-8000-000000000010'
    or work_report->'rows' <> '[]'::jsonb then
    raise exception 'El reporte de trabajos no respetó la asignación vacía';
  end if;
end $test$;

rollback;
