#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="academic-step2-db-$RANDOM-$$"
POSTGRES_IMAGE="${STEP2_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
FIXTURE="$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
EXISTING_DATA="$REPO_ROOT/supabase/tests/fixtures/step2_existing_data.sql"
MIGRATION="$REPO_ROOT/supabase/migrations/20260827012356_academic_cycles_enrollments_assignments.sql"
STRUCTURE_TEST="$REPO_ROOT/supabase/tests/database/002_paso2_structure.sql"
INTEGRITY_TEST="$REPO_ROOT/supabase/tests/database/003_paso2_integrity_rls.sql"

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

echo "[Paso 2] Escenario 1/3: base limpia"
run_sql -f "$FIXTURE" >/dev/null
run_sql -f "$MIGRATION" >/dev/null
run_tap "$STRUCTURE_TEST"

echo "[Paso 2] Escenario 2/3: base con datos históricos sintéticos"
run_sql -f "$FIXTURE" >/dev/null
run_sql -f "$EXISTING_DATA" >/dev/null
run_sql -f "$MIGRATION" >/dev/null
run_tap "$STRUCTURE_TEST"
run_tap "$INTEGRITY_TEST"

echo "[Paso 2] Escenario 3/3: rollback transaccional local"
run_sql -f "$FIXTURE" >/dev/null
ROLLBACK_RESULT="$({
  printf 'begin;\n'
  sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' "$MIGRATION"
  printf 'rollback;\n'
  printf "select (to_regclass('public.ciclos_escolares') is null)::text || ',' || (not exists (select 1 from information_schema.columns where table_schema='public' and table_name='inscripciones_alumno' and column_name='ciclo_escolar_id'))::text;\n"
} | run_sql -At)"

if [[ "$(tail -n 1 <<<"$ROLLBACK_RESULT")" != "true,true" ]]; then
  echo "El rollback local no restauró la línea base" >&2
  exit 1
fi

echo "Paso 2 DB: base limpia, base existente, RLS, integridad y rollback aprobados"
