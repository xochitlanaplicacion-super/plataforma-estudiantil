#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="academic-step15-db-$RANDOM-$$"
POSTGRES_IMAGE="${STEP15_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
FIXTURE="$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
EXISTING_DATA="$REPO_ROOT/supabase/tests/fixtures/step2_existing_data.sql"
LEGACY_DATA="$REPO_ROOT/supabase/tests/fixtures/step12_pre_migration_data.sql"
SECURITY_TEST="$REPO_ROOT/supabase/tests/database/019_paso15_security.sql"
STEP15_MIGRATION="$REPO_ROOT/supabase/migrations/20260830060100_academic_remove_legacy_exercise_policies_step15.sql"
STEP15_VOLATILITY_MIGRATION="$REPO_ROOT/supabase/migrations/20260830064500_academic_correct_function_volatility_step15.sql"
STEP15_LEGACY_VOLATILITY_MIGRATION="$REPO_ROOT/supabase/migrations/20260830065500_academic_correct_legacy_normalizer_volatility_step15.sql"
TEACHER_MOBILE_MIGRATION="$REPO_ROOT/supabase/migrations/20260906050427_teacher_mobile_capture.sql"
TEACHER_MOBILE_TEST="$REPO_ROOT/supabase/tests/database/020_teacher_mobile_capture.sql"
TEACHER_PROVISIONAL_MIGRATION="$REPO_ROOT/supabase/migrations/20260906072000_teacher_mobile_provisional_students.sql"
TEACHER_PROVISIONAL_TEST="$REPO_ROOT/supabase/tests/database/021_teacher_mobile_provisional_students.sql"
MIGRATIONS=(
  "$REPO_ROOT/supabase/migrations/20260827012356_academic_cycles_enrollments_assignments.sql"
  "$REPO_ROOT/supabase/migrations/20260827031813_academic_periods_evaluation_schemes.sql"
  "$REPO_ROOT/supabase/migrations/20260827042953_academic_evaluation_criteria_weights.sql"
  "$REPO_ROOT/supabase/migrations/20260827052745_academic_grade_sources.sql"
  "$REPO_ROOT/supabase/migrations/20260827235444_academic_rls_grants_secure_read_models.sql"
  "$REPO_ROOT/supabase/migrations/20260828014613_academic_deterministic_calculation_engine.sql"
  "$REPO_ROOT/supabase/migrations/20260828042542_academic_atomic_grade_mutations_closures.sql"
  "$REPO_ROOT/supabase/migrations/20260829032136_academic_unify_exercise_results_step12.sql"
  "$REPO_ROOT/supabase/migrations/20260830050405_academic_cutover_existing_tenant_step14.sql"
)

cleanup() { docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run -d --name "$CONTAINER_NAME" -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD=postgres "$POSTGRES_IMAGE" >/dev/null
for _attempt in $(seq 1 120); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER_NAME")"
  [[ "$health" == "healthy" ]] && break
  [[ "$health" == "unhealthy" ]] && { docker logs --tail 100 "$CONTAINER_NAME"; exit 1; }
  sleep 2
done
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME")" == "healthy" ]]
HOST_PORT="$(docker port "$CONTAINER_NAME" 5432/tcp | awk -F: 'NR == 1 {print $NF}')"
HOST_DB_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres"
run_sql() { psql "$HOST_DB_URL" -X -v ON_ERROR_STOP=1 "$@"; }
run_tap() {
  local output
  if ! output="$(run_sql -f "$1" 2>&1)"; then printf '%s\n' "$output"; return 1; fi
  printf '%s\n' "$output"
  ! grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)' <<<"$output"
}

run_sql -f "$FIXTURE" >/dev/null
run_sql -f "$EXISTING_DATA" >/dev/null
run_sql -f "$LEGACY_DATA" >/dev/null
for migration in "${MIGRATIONS[@]}"; do run_sql -f "$migration" >/dev/null; done

echo "[Paso 15] Escenario 1/6: reproducir políticas heredadas observadas en producción"
run_sql <<'SQL' >/dev/null
alter table public.ejercicios enable row level security;
create policy tenant_boundary on public.ejercicios as restrictive
  for all to public
  using (tenant_id = (select private.current_tenant_id()))
  with check (tenant_id = (select private.current_tenant_id()));
create policy tenant_admin_manage on public.ejercicios
  for all to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[])))
  with check ((select private.has_tenant_role(
    tenant_id, array['superuser','admin']::text[])));
create policy tenant_member_read on public.ejercicios
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy tenant_professor_manage on public.ejercicios
  for all to authenticated
  using ((select private.has_tenant_role(
    tenant_id, array['profesor']::text[])))
  with check ((select private.has_tenant_role(
    tenant_id, array['profesor']::text[])));
create policy "Acceso total admin ejercicios" on public.ejercicios
  for all to authenticated using (true);
create policy "Ejercicios lectura pública" on public.ejercicios
  for select to public using (true);
create policy "Profesores gestionan ejercicios" on public.ejercicios
  for all to public using (auth.role() = 'authenticated');
SQL

echo "[Paso 15] Escenario 2/6: migración idempotente sin cambios de datos"
BEFORE="$(run_sql -Atqc "select md5(string_agg(id::text||':'||tenant_id::text,',' order by id)) from public.ejercicios")"
run_sql -f "$STEP15_MIGRATION" >/dev/null
run_sql -f "$STEP15_MIGRATION" >/dev/null
run_sql -f "$STEP15_VOLATILITY_MIGRATION" >/dev/null
run_sql -f "$STEP15_VOLATILITY_MIGRATION" >/dev/null
run_sql -f "$STEP15_LEGACY_VOLATILITY_MIGRATION" >/dev/null
run_sql -f "$STEP15_LEGACY_VOLATILITY_MIGRATION" >/dev/null
run_sql <<'SQL' >/dev/null
alter table public.profiles add column if not exists matricula text;
create table if not exists public.configuracion_sistema (
  tenant_id uuid primary key references public.tenants(id),
  nombre_corto text,
  logo_url text,
  color_primario text,
  color_secundario text
);
SQL
run_sql -f "$TEACHER_MOBILE_MIGRATION" >/dev/null
run_sql -f "$TEACHER_MOBILE_TEST" >/dev/null
run_sql -f "$TEACHER_PROVISIONAL_MIGRATION" >/dev/null
run_sql -f "$TEACHER_PROVISIONAL_TEST" >/dev/null
AFTER="$(run_sql -Atqc "select md5(string_agg(id::text||':'||tenant_id::text,',' order by id)) from public.ejercicios")"
[[ -n "$BEFORE" && "$BEFORE" == "$AFTER" ]]

echo "[Paso 15] Escenario 3/6: pgTAP de anonimato, roles y tenant A/B"
run_tap "$SECURITY_TEST"

echo "[Paso 15] Escenario 4/6: lint SQL y Advisor de seguridad"
npx supabase db lint --db-url "${HOST_DB_URL}?sslmode=disable" \
  --schema public,private --level error --fail-on error
ADVISOR_OUTPUT="$(npx supabase db advisors --db-url "${HOST_DB_URL}?sslmode=disable" \
  --type security --level warn --fail-on none --output json)"
if grep -q 'rls_policy_always_true_public_ejercicios' <<<"$ADVISOR_OUTPUT"; then
  echo 'El Advisor todavía detecta una política insegura en ejercicios' >&2
  exit 1
fi

echo "[Paso 15] Escenario 5/6: EXPLAIN ANALYZE con libreta de 200 alumnos"
run_sql <<'SQL' >/dev/null
insert into public.profiles (
  id, tenant_id, rol, estatus, nombre, apellidos, email, curp, grupo_id
)
select md5('step15-student-' || sample)::uuid,
       '10000000-0000-4000-8000-000000000001', 'alumno', 'activo',
       'Alumno ' || sample, 'Carga Paso 15',
       'step15-student-' || sample || '@example.invalid',
       'S15STU' || lpad(sample::text, 12, '0'),
       '14000000-0000-4000-8000-000000000001'
from generate_series(1, 199) sample;

insert into public.inscripciones_alumno (
  id, tenant_id, alumno_id, ciclo_escolar_id, nivel_id, carrera_id,
  grado_id, grupo_id, fecha_inicio, activo
)
select md5('step15-enrollment-' || sample)::uuid,
       '10000000-0000-4000-8000-000000000001',
       md5('step15-student-' || sample)::uuid, c.id,
       '11000000-0000-4000-8000-000000000001',
       '12000000-0000-4000-8000-000000000001',
       '13000000-0000-4000-8000-000000000001',
       '14000000-0000-4000-8000-000000000001', c.fecha_inicio, true
from generate_series(1, 199) sample
cross join lateral (
  select id, fecha_inicio from public.ciclos_escolares
  where tenant_id = '10000000-0000-4000-8000-000000000001'
    and estado = 'activo' limit 1
) c;

insert into public.resultados_ejercicios (
  alumno_id, ejercicio_id, calificacion, aciertos, total_preguntas,
  estado, intentos, suma_calificaciones, bloqueado, historico_intentos,
  tenant_id, inscripcion_alumno_id, vinculo_evaluacion_id,
  unidad_origen_id, origen, calificado_por, calificado_at,
  registro_legacy
)
select i.alumno_id, v.ejercicio_id,
       (6 + mod(row_number() over (order by i.id), 5))::numeric,
       8, 10, 'calificado', 1, 8, false, '[]'::jsonb,
       i.tenant_id, i.id, v.id, t.unidad_id, v.origen,
       a.profesor_id, now(), false
from public.inscripciones_alumno i
join public.asignaciones_profesor a
  on a.tenant_id = i.tenant_id and a.ciclo_escolar_id = i.ciclo_escolar_id
 and a.grupo_id = i.grupo_id and a.activo
join lateral (
  select id, ejercicio_id, origen
  from public.vinculos_evaluacion_ejercicio
  where tenant_id = a.tenant_id and asignacion_profesor_id = a.id and activo
  order by periodo_evaluacion_id, ejercicio_id limit 1
) v on true
join public.ejercicios ex
  on ex.id = v.ejercicio_id and ex.tenant_id = i.tenant_id
join public.temas t
  on t.id = ex.tema_id and t.tenant_id = ex.tenant_id
where i.tenant_id = '10000000-0000-4000-8000-000000000001'
on conflict do nothing;

insert into public.cierres_calificaciones (
  tenant_id, ciclo_escolar_id, inscripcion_id, asignacion_id, periodo_id,
  esquema_id, esquema_version, resultado_exacto, resultado_visual,
  breakdown, version_cierre, estado, motivo, correlation_id,
  closed_by
)
select i.tenant_id, i.ciclo_escolar_id, i.id, a.id,
       e.periodo_evaluacion_id, e.id, e.version, 8.0000, 8.00,
       jsonb_build_object('fixture', 'step15-performance'), 1, 'cerrado',
       'Certificación de rendimiento Paso 15',
       md5('step15-closure-' || i.id::text)::uuid, a.profesor_id
from public.inscripciones_alumno i
join public.asignaciones_profesor a
  on a.tenant_id = i.tenant_id and a.ciclo_escolar_id = i.ciclo_escolar_id
 and a.grupo_id = i.grupo_id and a.activo
join lateral (
  select id, periodo_evaluacion_id, version
  from public.esquemas_evaluacion
  where tenant_id = a.tenant_id and asignacion_profesor_id = a.id
    and estado = 'activo'
  order by periodo_evaluacion_id limit 1
) e on true
where i.tenant_id = '10000000-0000-4000-8000-000000000001'
on conflict do nothing;

analyze public.profiles;
analyze public.inscripciones_alumno;
analyze public.resultados_ejercicios;
analyze public.cierres_calificaciones;
SQL

GRADEBOOK_PLAN="$(run_sql -Atqc "set role authenticated; set request.jwt.claim.sub='1a000000-0000-4000-8000-000000000003'; explain (analyze,buffers,format json) select * from public.vista_libreta_profesor where tenant_id='10000000-0000-4000-8000-000000000001' and asignacion_profesor_id='1f000000-0000-4000-8000-000000000001' limit 200;")"
SOURCE_RLS_PLAN="$(run_sql -Atqc "set role authenticated; set request.jwt.claim.sub='1a000000-0000-4000-8000-000000000003'; explain (analyze,buffers,format json) select * from public.resultados_ejercicios where tenant_id='10000000-0000-4000-8000-000000000001' limit 200;")"
CLOSURE_PLAN="$(run_sql -Atqc "set role authenticated; set request.jwt.claim.sub='1a000000-0000-4000-8000-000000000003'; explain (analyze,buffers,format json) select * from public.cierres_calificaciones where tenant_id='10000000-0000-4000-8000-000000000001' and asignacion_id='1f000000-0000-4000-8000-000000000001' order by version_cierre desc limit 200;")"
export GRADEBOOK_PLAN SOURCE_RLS_PLAN CLOSURE_PLAN
node <<'NODE'
const budgets = [
  ['gradebook', 'GRADEBOOK_PLAN', 250, 200],
  ['source_rls', 'SOURCE_RLS_PLAN', 150, 200],
  ['closure', 'CLOSURE_PLAN', 150, 200],
];
for (const [label, key, budgetMs, rowBudget] of budgets) {
  const result = JSON.parse(process.env[key])[0];
  const ms = Number(result['Execution Time']);
  const rows = Number(result.Plan['Actual Rows']);
  console.log(`PERF ${label}_ms=${ms.toFixed(3)} rows=${rows} budget_ms=${budgetMs} row_budget=${rowBudget}`);
  if (!Number.isFinite(ms) || ms > budgetMs || rows > rowBudget) process.exitCode = 1;
}
NODE
unset GRADEBOOK_PLAN SOURCE_RLS_PLAN CLOSURE_PLAN

echo "[Paso 15] Escenario 6/6: guardia falla si desaparece la barrera RESTRICTIVE"
run_sql -c 'drop policy tenant_boundary on public.ejercicios; create policy tenant_boundary on public.ejercicios for all to public using (true) with check (true);' >/dev/null
if run_sql -f "$STEP15_MIGRATION" >/tmp/step15-rls-guard.log 2>&1; then
  echo 'La guardia debía rechazar tenant_boundary permisiva' >&2
  exit 1
fi
grep -q 'STEP15_RLS_GUARD' /tmp/step15-rls-guard.log

echo "Paso 15 DB: políticas heredadas retiradas, anonimato y aislamiento A/B certificados"
