#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="academic-step3-db-$RANDOM-$$"
POSTGRES_IMAGE="${STEP3_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
FIXTURE="$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
EXISTING_DATA="$REPO_ROOT/supabase/tests/fixtures/step2_existing_data.sql"
STEP2_MIGRATION="$REPO_ROOT/supabase/migrations/20260827012356_academic_cycles_enrollments_assignments.sql"
STEP3_MIGRATION="$REPO_ROOT/supabase/migrations/20260827031813_academic_periods_evaluation_schemes.sql"
STRUCTURE_TEST="$REPO_ROOT/supabase/tests/database/004_paso3_structure.sql"
INTEGRITY_TEST="$REPO_ROOT/supabase/tests/database/005_paso3_integrity_rls.sql"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1::5432 \
  "$POSTGRES_IMAGE" >/dev/null

for _attempt in $(seq 1 60); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER_NAME")"
  if [[ "$health" == "healthy" ]]; then break; fi
  if [[ "$health" == "unhealthy" ]]; then
    docker logs --tail 100 "$CONTAINER_NAME"
    exit 1
  fi
  sleep 2
done

if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME")" != "healthy" ]]; then
  echo "PostgreSQL desechable no alcanzó estado healthy" >&2
  exit 1
fi

HOST_PORT="$(docker port "$CONTAINER_NAME" 5432/tcp | awk -F: 'NR == 1 {print $NF}')"
DB_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres"

run_sql() {
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 "$@"
}

run_tap() {
  local test_file="$1"
  local output
  output="$(run_sql -f "$test_file")"
  printf '%s\n' "$output"
  if grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)' <<<"$output"; then
    echo "Falló pgTAP: $test_file" >&2
    exit 1
  fi
}

load_step2() {
  run_sql -f "$FIXTURE" >/dev/null
  if [[ "${1:-clean}" == "existing" ]]; then
    run_sql -f "$EXISTING_DATA" >/dev/null
  fi
  run_sql -f "$STEP2_MIGRATION" >/dev/null
}

echo "[Paso 3] Escenario 1/4: base limpia"
load_step2 clean
run_sql -f "$STEP3_MIGRATION" >/dev/null
run_tap "$STRUCTURE_TEST"

echo "[Paso 3] Escenario 2/4: base con datos históricos sintéticos"
load_step2 existing
run_sql -f "$STEP3_MIGRATION" >/dev/null
run_tap "$STRUCTURE_TEST"
run_tap "$INTEGRITY_TEST"

echo "[Paso 3] Escenario 3/4: índices usados por consultas tenant/ciclo"
EXPLAIN_OUTPUT="$(run_sql -Atqc "
  set enable_seqscan=off;
  explain (costs off)
  select id, nombre, estado, fecha_inicio, fecha_fin
  from public.periodos_evaluacion
  where tenant_id='10000000-0000-4000-8000-000000000001'
    and ciclo_escolar_id=(
      select id from public.ciclos_escolares
      where tenant_id='10000000-0000-4000-8000-000000000001' limit 1
    )
    and estado='borrador'
  order by fecha_inicio;")"
printf '%s\n' "$EXPLAIN_OUTPUT"
if ! grep -Eq 'periodos_evaluacion_(tenant_cycle_state_dates_idx|un_activo_por_ciclo_idx)' <<<"$EXPLAIN_OUTPUT"; then
  echo "EXPLAIN no utilizó el índice tenant/ciclo esperado" >&2
  exit 1
fi

echo "[Paso 3] Escenario 4/4: rollback transaccional local"
load_step2 existing
ROLLBACK_RESULT="$({
  printf 'begin;\n'
  sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' "$STEP3_MIGRATION"
  printf 'rollback;\n'
  printf "select (to_regclass('public.periodos_evaluacion') is null)::text || ',' || (to_regclass('public.esquemas_evaluacion') is null)::text || ',' || (to_regclass('public.academic_assignments_id_tenant_cycle_uidx') is null)::text;\n"
} | run_sql -At)"

if [[ "$(tail -n 1 <<<"$ROLLBACK_RESULT")" != "true,true,true" ]]; then
  echo "El rollback local no restauró exactamente el estado posterior al Paso 2" >&2
  exit 1
fi

echo "Paso 3 DB: limpia, existente, pgTAP, RLS, EXPLAIN y rollback aprobados"
