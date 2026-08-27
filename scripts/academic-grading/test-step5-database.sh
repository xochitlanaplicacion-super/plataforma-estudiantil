#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="academic-step5-db-$RANDOM-$$"
POSTGRES_IMAGE="${STEP5_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
FIXTURE="$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
EXISTING_DATA="$REPO_ROOT/supabase/tests/fixtures/step2_existing_data.sql"
MIGRATIONS=(
  "$REPO_ROOT/supabase/migrations/20260827012356_academic_cycles_enrollments_assignments.sql"
  "$REPO_ROOT/supabase/migrations/20260827031813_academic_periods_evaluation_schemes.sql"
  "$REPO_ROOT/supabase/migrations/20260827042953_academic_evaluation_criteria_weights.sql"
  "$REPO_ROOT/supabase/migrations/20260827052745_academic_grade_sources.sql"
)

cleanup() { docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker run -d --name "$CONTAINER_NAME" -e POSTGRES_PASSWORD=postgres -p 127.0.0.1::5432 "$POSTGRES_IMAGE" >/dev/null
for _attempt in $(seq 1 60); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER_NAME")"
  [[ "$health" == "healthy" ]] && break
  [[ "$health" == "unhealthy" ]] && { docker logs --tail 100 "$CONTAINER_NAME"; exit 1; }
  sleep 2
done
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME")" == "healthy" ]]
HOST_PORT="$(docker port "$CONTAINER_NAME" 5432/tcp | awk -F: 'NR == 1 {print $NF}')"
DB_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres"
run_sql() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 "$@"; }
run_tap() {
  local output
  output="$(run_sql -f "$1")"
  printf '%s\n' "$output"
  ! grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)' <<<"$output"
}
load_step5() {
  run_sql -f "$FIXTURE" >/dev/null
  [[ "${1:-clean}" == "existing" ]] && run_sql -f "$EXISTING_DATA" >/dev/null
  for migration in "${MIGRATIONS[@]}"; do run_sql -f "$migration" >/dev/null; done
}

echo "[Paso 5] Escenario 1/4: estructura sobre base limpia"
load_step5 clean
run_tap "$REPO_ROOT/supabase/tests/database/008_paso5_structure.sql"

echo "[Paso 5] Escenario 2/4: integridad, trazabilidad y RLS"
load_step5 existing
run_tap "$REPO_ROOT/supabase/tests/database/008_paso5_structure.sql"
run_tap "$REPO_ROOT/supabase/tests/database/009_paso5_integrity_rls.sql"

echo "[Paso 5] Escenario 3/4: índices de lectura"
EXPLAIN_OUTPUT="$(run_sql -Atqc "set enable_seqscan=off; explain (costs off) select asignacion_profesor_id,periodo_evaluacion_id from public.calificaciones_directas where tenant_id='10000000-0000-4000-8000-000000000001' order by asignacion_profesor_id,periodo_evaluacion_id;")"
printf '%s\n' "$EXPLAIN_OUTPUT"
grep -Eq 'calificaciones_directas_assignment_period_idx' <<<"$EXPLAIN_OUTPUT"
npx supabase db lint --db-url "${DB_URL}?sslmode=disable" \
  --schema public,private --level error --fail-on error

echo "[Paso 5] Escenario 4/4: rollback transaccional"
run_sql -f "$FIXTURE" >/dev/null
run_sql -f "$EXISTING_DATA" >/dev/null
for migration in "${MIGRATIONS[@]:0:3}"; do run_sql -f "$migration" >/dev/null; done
ROLLBACK_RESULT="$({ printf 'begin;\n'; sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' "${MIGRATIONS[3]}"; printf 'rollback;\n'; printf "select (to_regclass('public.vinculos_evaluacion_ejercicio') is null)::text || ',' || (to_regclass('public.calificaciones_directas') is null)::text || ',' || (to_regclass('public.eventos_participacion') is null)::text || ',' || (not exists(select 1 from information_schema.columns where table_schema='public' and table_name='resultados_ejercicios' and column_name='vinculo_evaluacion_id'))::text;\n"; } | run_sql -At)"
[[ "$(tail -n 1 <<<"$ROLLBACK_RESULT")" == "true,true,true,true" ]]

echo "Paso 5 DB: estructura, integridad, RLS, índices y rollback aprobados"
