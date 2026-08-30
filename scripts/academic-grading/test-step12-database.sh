#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="academic-step12-db-$RANDOM-$$"
POSTGRES_IMAGE="${STEP12_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
FIXTURE="$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
EXISTING_DATA="$REPO_ROOT/supabase/tests/fixtures/step2_existing_data.sql"
LEGACY_DATA="$REPO_ROOT/supabase/tests/fixtures/step12_pre_migration_data.sql"
ACADEMIC_CONTEXT="$REPO_ROOT/supabase/tests/fixtures/step12_academic_context.sql"
STRUCTURE_TEST="$REPO_ROOT/supabase/tests/database/015_paso12_structure.sql"
BEHAVIOR_TEST="$REPO_ROOT/supabase/tests/database/016_paso12_behavior.sql"
STEP12_MIGRATION="$REPO_ROOT/supabase/migrations/20260829032136_academic_unify_exercise_results_step12.sql"
MIGRATIONS=(
  "$REPO_ROOT/supabase/migrations/20260827012356_academic_cycles_enrollments_assignments.sql"
  "$REPO_ROOT/supabase/migrations/20260827031813_academic_periods_evaluation_schemes.sql"
  "$REPO_ROOT/supabase/migrations/20260827042953_academic_evaluation_criteria_weights.sql"
  "$REPO_ROOT/supabase/migrations/20260827052745_academic_grade_sources.sql"
  "$REPO_ROOT/supabase/migrations/20260827235444_academic_rls_grants_secure_read_models.sql"
  "$REPO_ROOT/supabase/migrations/20260828014613_academic_deterministic_calculation_engine.sql"
  "$REPO_ROOT/supabase/migrations/20260828042542_academic_atomic_grade_mutations_closures.sql"
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
load_before_step12() {
  run_sql -f "$FIXTURE" >/dev/null
  if [[ "${1:-clean}" == "existing" ]]; then
    run_sql -f "$EXISTING_DATA" >/dev/null
    run_sql -f "$LEGACY_DATA" >/dev/null
  fi
  for migration in "${MIGRATIONS[@]}"; do run_sql -f "$migration" >/dev/null; done
  if [[ "${1:-clean}" == "existing" ]]; then
    run_sql -f "$ACADEMIC_CONTEXT" >/dev/null
  fi
}

echo "[Paso 12] Escenario 1/5: instalación limpia y estructura segura"
load_before_step12 clean
run_sql -f "$STEP12_MIGRATION" >/dev/null
run_tap "$STRUCTURE_TEST"

echo "[Paso 12] Escenario 2/5: backfill, equivalencia, RPC y aislamiento"
reset_database
load_before_step12 existing
run_sql -f "$STEP12_MIGRATION" >/dev/null
run_tap "$STRUCTURE_TEST"
run_tap "$BEHAVIOR_TEST"

echo "[Paso 12] Escenario 3/5: lint SQL de public/private"
npx supabase db lint --db-url "${HOST_DB_URL}?sslmode=disable" \
  --schema public,private --level error --fail-on error

echo "[Paso 12] Escenario 4/5: índice de vínculo activo usado por el planificador"
EXPLAIN_OUTPUT="$(run_sql -Atqc "set enable_seqscan=off; explain (costs off) select id from public.vinculos_evaluacion_ejercicio where tenant_id='10000000-0000-4000-8000-000000000001' and ejercicio_id='18000000-0000-4000-8000-000000000015' and activo;")"
printf '%s\n' "$EXPLAIN_OUTPUT"
grep -q 'vinculos_evaluacion_one_active_exercise_uidx' <<<"$EXPLAIN_OUTPUT"

echo "[Paso 12] Escenario 5/5: rollback transaccional íntegro"
reset_database
load_before_step12 existing
ROLLBACK_RESULT="$({ printf 'begin;\n'; sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' "$STEP12_MIGRATION"; printf 'rollback;\n'; printf "select (to_regprocedure('public.guardar_resultado_ejercicio_academico(uuid,text,uuid,bigint,uuid,integer,integer,numeric,numeric,text,jsonb)') is null)::text || ',' || (to_regclass('public.vinculos_evaluacion_one_active_exercise_uidx') is null)::text || ',' || (position('exercise_result' in pg_get_constraintdef(oid))=0)::text from pg_constraint where conrelid='public.solicitudes_mutacion_academica'::regclass and conname='solicitudes_mutacion_operacion_valida';\n"; } | run_sql -At)"
[[ "$(tail -n 1 <<<"$ROLLBACK_RESULT")" == "true,true,true" ]]

echo "Paso 12 DB: escala 0-10, backfill, idempotencia, CAS, auditoría, aislamiento y rollback aprobados"
