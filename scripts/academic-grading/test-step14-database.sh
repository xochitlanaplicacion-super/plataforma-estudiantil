#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="academic-step14-db-$RANDOM-$$"
POSTGRES_IMAGE="${STEP14_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
FIXTURE="$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
EXISTING_DATA="$REPO_ROOT/supabase/tests/fixtures/step2_existing_data.sql"
LEGACY_DATA="$REPO_ROOT/supabase/tests/fixtures/step12_pre_migration_data.sql"
STRUCTURE_TEST="$REPO_ROOT/supabase/tests/database/017_paso14_structure.sql"
BEHAVIOR_TEST="$REPO_ROOT/supabase/tests/database/018_paso14_behavior.sql"
STEP14_MIGRATION="$REPO_ROOT/supabase/migrations/20260830050405_academic_cutover_existing_tenant_step14.sql"
MIGRATIONS=(
  "$REPO_ROOT/supabase/migrations/20260827012356_academic_cycles_enrollments_assignments.sql"
  "$REPO_ROOT/supabase/migrations/20260827031813_academic_periods_evaluation_schemes.sql"
  "$REPO_ROOT/supabase/migrations/20260827042953_academic_evaluation_criteria_weights.sql"
  "$REPO_ROOT/supabase/migrations/20260827052745_academic_grade_sources.sql"
  "$REPO_ROOT/supabase/migrations/20260827235444_academic_rls_grants_secure_read_models.sql"
  "$REPO_ROOT/supabase/migrations/20260828014613_academic_deterministic_calculation_engine.sql"
  "$REPO_ROOT/supabase/migrations/20260828042542_academic_atomic_grade_mutations_closures.sql"
  "$REPO_ROOT/supabase/migrations/20260829032136_academic_unify_exercise_results_step12.sql"
)

cleanup() { docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run -d --name "$CONTAINER_NAME" -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD=postgres "$POSTGRES_IMAGE" >/dev/null
for _attempt in $(seq 1 60); do
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
reset_database() { run_sql -c 'drop schema public cascade; create schema public;' >/dev/null; }
load_before_step14() {
  local mode="${1:-clean}"
  run_sql -f "$FIXTURE" >/dev/null
  if [[ "$mode" == "existing" ]]; then
    run_sql -f "$EXISTING_DATA" >/dev/null
    run_sql -f "$LEGACY_DATA" >/dev/null
  fi
  for migration in "${MIGRATIONS[@]}"; do run_sql -f "$migration" >/dev/null; done
}
checksum() {
  run_sql -Atqc "select md5(string_agg(value,',' order by value)) from (
    select 's:'||id||':'||estado||':'||coalesce(migration_version,'') value from public.esquemas_evaluacion
    union all select 'c:'||id||':'||peso from public.criterios_evaluacion
    union all select 'v:'||id||':'||ejercicio_id||':'||coalesce(migration_version,'') from public.vinculos_evaluacion_ejercicio
    union all select 'r:'||id||':'||coalesce(calificacion::text,'null')||':'||coalesce(migration_version,'') from public.resultados_ejercicios
  ) rows"
}

echo "[Paso 14] Escenario 1/6: instalación limpia"
load_before_step14 clean
run_sql -f "$STEP14_MIGRATION" >/dev/null
run_tap "$STRUCTURE_TEST"
[[ "$(run_sql -Atqc 'select count(*) from public.tenant_academic_rollout')" == "0" ]]

echo "[Paso 14] Escenario 2/6: clon lógico con histórico 0-100 ya normalizado"
reset_database
load_before_step14 existing
run_sql -f "$STEP14_MIGRATION" >/dev/null
run_tap "$STRUCTURE_TEST"
run_tap "$BEHAVIOR_TEST"

echo "[Paso 14] Escenario 3/6: segunda ejecución y checksum lógico"
BEFORE="$(checksum)"
run_sql -f "$STEP14_MIGRATION" >/dev/null
AFTER="$(checksum)"
[[ -n "$BEFORE" && "$BEFORE" == "$AFTER" ]]
[[ "$(run_sql -Atqc "select count(*) from public.auditoria where accion='academic.cutover.dual_started' and detalles->>'migration'='step14-cutover-v1'")" == "2" ]]

echo "[Paso 14] Escenario 4/6: lint e índices de operación"
npx supabase db lint --db-url "${HOST_DB_URL}?sslmode=disable" \
  --schema public,private --level error --fail-on error
EXPLAIN_OUTPUT="$(run_sql -Atqc "set enable_seqscan=off; explain (costs off) select tenant_id from public.tenant_academic_rollout where mode='dual';")"
printf '%s\n' "$EXPLAIN_OUTPUT"
grep -q 'tenant_academic_rollout_mode_idx' <<<"$EXPLAIN_OUTPUT"

echo "[Paso 14] Escenario 5/6: preflight ambiguo falla cerrado"
run_sql -c "insert into public.asignaciones_profesor (
  id,profesor_id,nivel_id,carrera_id,grado_id,grupo_id,materia_id,activo,tenant_id,
  ciclo_escolar_id,tipo_participacion,vigencia_desde
) select '1f000000-0000-4000-8000-000000000099',profesor_id,nivel_id,carrera_id,
  grado_id,grupo_id,materia_id,true,tenant_id,ciclo_escolar_id,'apoyo',vigencia_desde
  from public.asignaciones_profesor where id='1f000000-0000-4000-8000-000000000001';" >/dev/null
run_sql -c "update public.vinculos_evaluacion_ejercicio set activo=false
  where tenant_id='10000000-0000-4000-8000-000000000001';" >/dev/null
if run_sql -f "$STEP14_MIGRATION" >/tmp/step14-ambiguous.log 2>&1; then
  echo 'La preflight ambigua debía fallar' >&2; exit 1
fi
grep -q 'asignacion ambigua' /tmp/step14-ambiguous.log

echo "[Paso 14] Escenario 6/6: rollback transaccional íntegro"
reset_database
load_before_step14 existing
ROLLBACK_RESULT="$({ printf 'begin;\n'; sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' "$STEP14_MIGRATION"; printf 'rollback;\n'; printf "select (to_regclass('public.tenant_academic_rollout') is null)::text || ',' || (not exists(select 1 from information_schema.columns where table_schema='public' and table_name='resultados_ejercicios' and column_name='migration_version'))::text;\n"; } | run_sql -At)"
[[ "$(tail -n 1 <<<"$ROLLBACK_RESULT")" == "true,true" ]]

rm -f /tmp/step14-repeat.log /tmp/step14-ambiguous.log
echo "Paso 14 DB: limpia, existente, repetición, aislamiento, aprovisionamiento vacío, preflight y rollback aprobados"
