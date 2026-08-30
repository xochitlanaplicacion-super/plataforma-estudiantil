-- Contexto académico sintético preparado después del Paso 8 y antes del 12.
update public.periodos_evaluacion
set estado = 'activo'
where tenant_id = '10000000-0000-4000-8000-000000000001' and orden = 1;

insert into public.esquemas_evaluacion (
  id, tenant_id, ciclo_escolar_id, asignacion_profesor_id,
  periodo_evaluacion_id, nombre, estado, created_by
)
select '1e120000-0000-4000-8000-000000000001', a.tenant_id,
       a.ciclo_escolar_id, a.id, p.id, 'Esquema Paso 12', 'borrador',
       '1a000000-0000-4000-8000-000000000001'
from public.asignaciones_profesor a
join public.periodos_evaluacion p
  on p.tenant_id = a.tenant_id and p.ciclo_escolar_id = a.ciclo_escolar_id
where a.id = '1f000000-0000-4000-8000-000000000001' and p.orden = 1;

insert into public.criterios_evaluacion (
  id, tenant_id, esquema_evaluacion_id, nombre, tipo, peso, orden, created_by
) values (
  '1c120000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '1e120000-0000-4000-8000-000000000001',
  'Actividades Paso 12', 'actividades', 100, 1,
  '1a000000-0000-4000-8000-000000000001'
);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '1a000000-0000-4000-8000-000000000001',
  false
);
select public.activar_esquema_evaluacion(
  '1e120000-0000-4000-8000-000000000001', 1
);
reset role;

insert into public.vinculos_evaluacion_ejercicio (
  id, tenant_id, ciclo_escolar_id, asignacion_profesor_id,
  periodo_evaluacion_id, criterio_evaluacion_id, ejercicio_id, origen,
  created_by
)
select ('1b120000-0000-4000-8000-' || right(replace(e.id::text, '-', ''), 12))::uuid,
       a.tenant_id, a.ciclo_escolar_id, a.id, p.id,
       '1c120000-0000-4000-8000-000000000001', e.id,
       case when e.tipo = 'actividad_descriptiva'
         then 'descriptiveSubmission' else 'automaticExercise' end,
       '1a000000-0000-4000-8000-000000000001'
from public.ejercicios e
join public.asignaciones_profesor a
  on a.id = '1f000000-0000-4000-8000-000000000001'
 and a.tenant_id = e.tenant_id
join public.periodos_evaluacion p
  on p.tenant_id = a.tenant_id and p.ciclo_escolar_id = a.ciclo_escolar_id
 and p.orden = 1
where e.id in (
  '18000000-0000-4000-8000-000000000012',
  '18000000-0000-4000-8000-000000000013',
  '18000000-0000-4000-8000-000000000014',
  '18000000-0000-4000-8000-000000000015',
  '18000000-0000-4000-8000-000000000016',
  '18000000-0000-4000-8000-000000000017'
);

insert into public.resultados_ejercicios (
  tenant_id, alumno_id, ejercicio_id, estado, archivo_path, archivo_nombre,
  primer_envio_en, caduca_el, inscripcion_alumno_id,
  vinculo_evaluacion_id, unidad_origen_id, origen, registro_legacy
)
select i.tenant_id, i.alumno_id,
       '18000000-0000-4000-8000-000000000016', 'entregado',
       i.tenant_id::text || '/entregas/' || i.alumno_id::text ||
         '/18000000-0000-4000-8000-000000000016/nueva.pdf',
       'nueva.pdf', now(), now() + interval '10 days', i.id,
       v.id, '16000000-0000-4000-8000-000000000012',
       'descriptiveSubmission', false
from public.inscripciones_alumno i
join public.vinculos_evaluacion_ejercicio v
  on v.tenant_id = i.tenant_id
 and v.ejercicio_id = '18000000-0000-4000-8000-000000000016'
where i.alumno_id = '1a000000-0000-4000-8000-000000000002' and i.activo;
