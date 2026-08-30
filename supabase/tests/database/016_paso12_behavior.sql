begin;
set local search_path = public, extensions;
select plan(32);

-- Backfill: casos dorados y repetición sin segunda división.
select is((select calificacion from public.resultados_ejercicios where ejercicio_id=
  '18000000-0000-4000-8000-000000000012'), 7.5000::numeric,
  'Promedio histórico 75/100 queda 7.5/10');
select is((select suma_calificaciones from public.resultados_ejercicios where ejercicio_id=
  '18000000-0000-4000-8000-000000000012'), 15.0000::numeric,
  'Suma histórica se reconstruye en 0-10');
select is((select historico_intentos->0->>'porcentaje_bruto' from public.resultados_ejercicios
  where ejercicio_id='18000000-0000-4000-8000-000000000012'), '50.0000',
  'Histórico conserva porcentaje bruto explícito');
select is((select historico_intentos->1->>'calificacion_10' from public.resultados_ejercicios
  where ejercicio_id='18000000-0000-4000-8000-000000000012'), '10.0000',
  'Histórico conserva nota canónica explícita');
select is((select calificacion from public.resultados_ejercicios where ejercicio_id=
  '18000000-0000-4000-8000-000000000013'), 0.5000::numeric,
  '5/100 no se confunde con 5/10');
select is((select calificacion from public.resultados_ejercicios where ejercicio_id=
  '18000000-0000-4000-8000-000000000014'), 8.0000::numeric,
  'Descriptiva histórica conserva 8/10 sin multiplicar');
select is((select count(*) from public.resultados_ejercicios where registro_legacy),
  0::bigint, 'Filas con contexto inequívoco quedan enlazadas');
select is(
  private.normalize_legacy_attempt_history(
    private.normalize_legacy_attempt_history('[{"calificacion":50,"aciertos":1,"total_preguntas":2}]')
  ),
  private.normalize_legacy_attempt_history('[{"calificacion":50,"aciertos":1,"total_preguntas":2}]'),
  'Normalizar dos veces produce el mismo JSON');

-- Profesor configura el ejercicio sin vínculo y repetir no duplica.
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select is((public.configurar_vinculo_evaluacion_ejercicio(
  '18000000-0000-4000-8000-000000000018',
  '1f000000-0000-4000-8000-000000000001',
  (select id from public.periodos_evaluacion where tenant_id='10000000-0000-4000-8000-000000000001' and orden=1),
  '1c120000-0000-4000-8000-000000000001',null
)->>'sourceType'), 'automaticExercise', 'Profesor configura su ejercicio evaluable');
select lives_ok($$select public.configurar_vinculo_evaluacion_ejercicio(
  '18000000-0000-4000-8000-000000000018',
  '1f000000-0000-4000-8000-000000000001',
  (select id from public.periodos_evaluacion where tenant_id='10000000-0000-4000-8000-000000000001' and orden=1),
  '1c120000-0000-4000-8000-000000000001',null)$$,
  'Repetir configuración es idempotente');
reset role;
select is((select count(*) from public.vinculos_evaluacion_ejercicio where ejercicio_id=
  '18000000-0000-4000-8000-000000000018' and activo), 1::bigint,
  'Configuración repetida no duplica vínculo');

-- Automático: 0, 50 y 100 se convierten una sola vez y el perfecto bloquea.
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
select is((public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000015','automatic_attempt',
  '12000000-0000-4000-8000-000000000001',0,null,0,10,0,null,null,'[]')->>'grade')::numeric,
  0.0000::numeric, '0/100 se guarda como 0/10');
select is((public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000015','automatic_attempt',
  '12000000-0000-4000-8000-000000000002',1,null,5,10,50,null,null,'[]')->>'attemptGrade')::numeric,
  5.0000::numeric, '50/100 se convierte en 5/10');
select is((public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000015','automatic_attempt',
  '12000000-0000-4000-8000-000000000003',2,null,10,10,100,null,null,'[]')->>'attemptGrade')::numeric,
  10.0000::numeric, '100/100 se convierte en 10/10');
select is((select calificacion from public.resultados_ejercicios where ejercicio_id=
  '18000000-0000-4000-8000-000000000015'), 5.0000::numeric,
  'Múltiples intentos promedian 0, 5 y 10 en escala canónica');
select is((select bloqueado from public.resultados_ejercicios where ejercicio_id=
  '18000000-0000-4000-8000-000000000015'), true,
  'Intento perfecto bloquea intentos posteriores');
select is((public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000015','automatic_attempt',
  '12000000-0000-4000-8000-000000000004',3,null,1,10,10,null,null,'[]')->>'status'),
  'locked', 'Registro perfecto no recibe otro intento');
select is((select intentos from public.resultados_ejercicios where ejercicio_id=
  '18000000-0000-4000-8000-000000000015'), 3,
  'Bloqueo perfecto no incrementa intentos');
select is((public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000015','automatic_attempt',
  '12000000-0000-4000-8000-000000000003',2,null,10,10,100,null,null,'[]')->>'replayed')::boolean,
  true, 'Misma clave idempotente reproduce la respuesta');
select throws_like($$select public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000018','automatic_attempt',
  '12000000-0000-4000-8000-000000000005',0,null,1,2,60,null,null,'[]')$$,
  '%ACADEMIC_AUTOMATIC_PERCENTAGE_MISMATCH%', 'Porcentaje manipulado se rechaza');
select is((public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000017','automatic_attempt',
  '12000000-0000-4000-8000-000000000006',0,null,1,1,100,null,null,'[]')->>'status'),
  'expired', 'Ejercicio vencido practica sin guardar');
reset role;
select is((select count(*) from public.resultados_ejercicios where ejercicio_id=
  '18000000-0000-4000-8000-000000000017'), 0::bigint,
  'Ejercicio vencido no crea resultado');

-- Descriptiva usa la misma RPC, CAS y auditoría, sin *10.
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select is((public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000016','descriptive_grade',
  '12000000-0000-4000-8000-000000000007',1,
  '1a000000-0000-4000-8000-000000000002',null,null,null,8.5,'Buen trabajo',null
)->>'grade')::numeric, 8.5000::numeric, 'Descriptiva persiste directamente 8.5/10');
select is((select row_version from public.resultados_ejercicios where ejercicio_id=
  '18000000-0000-4000-8000-000000000016'), 2::bigint,
  'Descriptiva incrementa versión optimista');
select throws_like($$select public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000016','descriptive_grade',
  '12000000-0000-4000-8000-000000000008',1,
  '1a000000-0000-4000-8000-000000000002',null,null,null,9,null,null)$$,
  '%ACADEMIC_VERSION_CONFLICT%', 'Versión anterior no sobrescribe calificación');
reset role;
select is((select count(*) from public.auditoria where accion in (
  'academic.exercise_result.created','academic.exercise_result.updated'
)), 4::bigint, 'Cada mutación real deja una auditoría y los replays no duplican');

-- Profesor ajeno, tenant B y usuario suspendido fallan cerrados.
insert into public.profiles (id,tenant_id,rol,estatus,nombre,apellidos,email,curp)
values ('1a000000-0000-4000-8000-000000000019',
  '10000000-0000-4000-8000-000000000001','profesor','activo','Ajeno','A',
  'foreign-step12@example.invalid','SYNTHETICFOREIGN12');
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000019',true);
select throws_like($$select public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000016','descriptive_grade',
  '12000000-0000-4000-8000-000000000009',2,
  '1a000000-0000-4000-8000-000000000002',null,null,null,9,null,null)$$,
  '%ACADEMIC_DESCRIPTIVE_GRADE_FORBIDDEN%', 'Profesor ajeno no califica');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','2a000000-0000-4000-8000-000000000002',true);
select throws_like($$select public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000018','automatic_attempt',
  '12000000-0000-4000-8000-000000000010',0,null,1,1,100,null,null,'[]')$$,
  '%ACADEMIC_ACTIVE_LINK_NOT_FOUND%', 'Alumno de tenant B no usa ejercicio A');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000004',true);
select throws_like($$select public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000018','automatic_attempt',
  '12000000-0000-4000-8000-000000000011',0,null,1,1,100,null,null,'[]')$$,
  '%ACADEMIC_MEMBERSHIP_INACTIVE%', 'Usuario suspendido no guarda');
reset role;

-- Cierre bloquea incluso con enlace válido.
insert into public.cierres_calificaciones (
  tenant_id,ciclo_escolar_id,inscripcion_id,asignacion_id,periodo_id,
  esquema_id,esquema_version,resultado_exacto,resultado_visual,breakdown,
  version_cierre,estado,motivo,correlation_id,closed_by
)
select a.tenant_id,a.ciclo_escolar_id,i.id,a.id,p.id,e.id,e.version,
  8,8,'{}',1,'cerrado','Cierre Paso 12',
  '12000000-0000-4000-8000-000000000012','1a000000-0000-4000-8000-000000000001'
from public.asignaciones_profesor a
join public.inscripciones_alumno i on i.tenant_id=a.tenant_id
 and i.ciclo_escolar_id=a.ciclo_escolar_id and i.grupo_id=a.grupo_id
join public.periodos_evaluacion p on p.tenant_id=a.tenant_id
 and p.ciclo_escolar_id=a.ciclo_escolar_id and p.orden=1
join public.esquemas_evaluacion e on e.asignacion_profesor_id=a.id
 and e.periodo_evaluacion_id=p.id
where a.id='1f000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
select throws_like($$select public.guardar_resultado_ejercicio_academico(
  '18000000-0000-4000-8000-000000000018','automatic_attempt',
  '12000000-0000-4000-8000-000000000013',0,null,1,1,100,null,null,'[]')$$,
  '%ACADEMIC_SCOPE_CLOSED%', 'Alcance cerrado rechaza resultado');
reset role;

select is((select count(*) from public.resultados_ejercicios
  where calificacion is not null and calificacion not between 0 and 10),
  0::bigint, 'No queda ninguna nota fuera de 0-10');
select is((select count(*) from (
  select r.tenant_id,r.inscripcion_alumno_id,r.vinculo_evaluacion_id
  from public.resultados_ejercicios r
  join public.vinculos_evaluacion_ejercicio v
    on v.id=r.vinculo_evaluacion_id and v.tenant_id=r.tenant_id
  where not r.registro_legacy
  group by r.tenant_id,r.inscripcion_alumno_id,r.vinculo_evaluacion_id
  having count(*) > 1
) duplicate_sources), 0::bigint, 'Cada fuente canónica aparece una sola vez');

select * from finish();
rollback;
