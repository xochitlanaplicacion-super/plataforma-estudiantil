-- Datos sintéticos heredados creados antes de las migraciones académicas.
-- Permiten demostrar 75/100 -> 7.5/10 y, sobre todo, 5/100 -> 0.5/10 sin
-- inferir la escala por el valor final.
insert into public.unidades (id, materia_id, titulo, tenant_id) values
  ('16000000-0000-4000-8000-000000000012',
   '15000000-0000-4000-8000-000000000001', 'Unidad Paso 12',
   '10000000-0000-4000-8000-000000000001');

insert into public.temas (id, unidad_id, titulo, tenant_id) values
  ('17000000-0000-4000-8000-000000000012',
   '16000000-0000-4000-8000-000000000012', 'Tema Paso 12',
   '10000000-0000-4000-8000-000000000001');

insert into public.ejercicios (
  id, tema_id, titulo, tipo, fecha_entrega, tenant_id
) values
  ('18000000-0000-4000-8000-000000000012',
   '17000000-0000-4000-8000-000000000012', 'Automático histórico 75',
   'opcion_multiple', '2027-06-01T23:59:59Z',
   '10000000-0000-4000-8000-000000000001'),
  ('18000000-0000-4000-8000-000000000013',
   '17000000-0000-4000-8000-000000000012', 'Automático histórico 5',
   'opcion_multiple', '2027-06-01T23:59:59Z',
   '10000000-0000-4000-8000-000000000001'),
  ('18000000-0000-4000-8000-000000000014',
   '17000000-0000-4000-8000-000000000012', 'Descriptiva histórica',
   'actividad_descriptiva', '2027-06-01T23:59:59Z',
   '10000000-0000-4000-8000-000000000001'),
  ('18000000-0000-4000-8000-000000000015',
   '17000000-0000-4000-8000-000000000012', 'Automático nuevo',
   'opcion_multiple', '2027-06-01T23:59:59Z',
   '10000000-0000-4000-8000-000000000001'),
  ('18000000-0000-4000-8000-000000000016',
   '17000000-0000-4000-8000-000000000012', 'Descriptiva nueva',
   'actividad_descriptiva', '2027-06-01T23:59:59Z',
   '10000000-0000-4000-8000-000000000001'),
  ('18000000-0000-4000-8000-000000000017',
   '17000000-0000-4000-8000-000000000012', 'Automático vencido',
   'opcion_multiple', '2020-01-01T23:59:59Z',
   '10000000-0000-4000-8000-000000000001'),
  ('18000000-0000-4000-8000-000000000018',
   '17000000-0000-4000-8000-000000000012', 'Configurable sin vínculo',
   'opcion_multiple', '2027-06-01T23:59:59Z',
   '10000000-0000-4000-8000-000000000001');

insert into public.resultados_ejercicios (
  alumno_id, ejercicio_id, calificacion, aciertos, total_preguntas, intentos,
  suma_calificaciones, bloqueado, historico_intentos, tenant_id
) values
  ('1a000000-0000-4000-8000-000000000002',
   '18000000-0000-4000-8000-000000000012', 75, 10, 10, 2, 150, true,
   '[{"intento":1,"calificacion":50,"aciertos":5,"total_preguntas":10},{"intento":2,"calificacion":100,"aciertos":10,"total_preguntas":10}]'::jsonb,
   '10000000-0000-4000-8000-000000000001'),
  ('1a000000-0000-4000-8000-000000000002',
   '18000000-0000-4000-8000-000000000013', 5, 1, 20, 1, 5, false,
   '[{"intento":1,"calificacion":5,"aciertos":1,"total_preguntas":20}]'::jsonb,
   '10000000-0000-4000-8000-000000000001'),
  ('1a000000-0000-4000-8000-000000000002',
   '18000000-0000-4000-8000-000000000014', 80, 0, 0, 0, 0, true,
   '[]'::jsonb, '10000000-0000-4000-8000-000000000001');

update public.resultados_ejercicios
set calificacion_manual = 8,
    archivo_path = '10000000-0000-4000-8000-000000000001/entregas/1a000000-0000-4000-8000-000000000002/18000000-0000-4000-8000-000000000014/evidencia.pdf',
    archivo_nombre = 'evidencia.pdf', primer_envio_en = now(),
    caduca_el = now() + interval '10 days'
where ejercicio_id = '18000000-0000-4000-8000-000000000014';
