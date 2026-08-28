#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="academic-step9-types-$RANDOM-$$"
POSTGRES_IMAGE="${STEP9_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
GENERATED_TYPES="$(mktemp)"
FIXTURE="$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
MIGRATIONS=(
  "$REPO_ROOT/supabase/migrations/20260827012356_academic_cycles_enrollments_assignments.sql"
  "$REPO_ROOT/supabase/migrations/20260827031813_academic_periods_evaluation_schemes.sql"
  "$REPO_ROOT/supabase/migrations/20260827042953_academic_evaluation_criteria_weights.sql"
  "$REPO_ROOT/supabase/migrations/20260827052745_academic_grade_sources.sql"
  "$REPO_ROOT/supabase/migrations/20260827235444_academic_rls_grants_secure_read_models.sql"
  "$REPO_ROOT/supabase/migrations/20260828014613_academic_deterministic_calculation_engine.sql"
  "$REPO_ROOT/supabase/migrations/20260828042542_academic_atomic_grade_mutations_closures.sql"
)

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -f "$GENERATED_TYPES"
}
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
psql "$HOST_DB_URL" -X -v ON_ERROR_STOP=1 -f "$FIXTURE" >/dev/null
for migration in "${MIGRATIONS[@]}"; do
  psql "$HOST_DB_URL" -X -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

npx supabase gen types typescript \
  --db-url "${HOST_DB_URL}?sslmode=disable" \
  --schema public >"$GENERATED_TYPES"

for contract in \
  'cierres_calificaciones:' \
  'solicitudes_mutacion_academica:' \
  'calcular_resultado_academico:' \
  'previsualizar_cierre_calificaciones:' \
  'editar_calificaciones_academicas:' \
  'cerrar_calificaciones_academicas:' \
  'reabrir_calificaciones_academicas:'; do
  grep -Fq "$contract" "$GENERATED_TYPES"
  grep -Fq "$contract" "$REPO_ROOT/src/lib/database.types.ts"
done

for column in \
  'snapshot_parent_id: string | null' \
  'resultado_exacto: number' \
  'version_cierre: number' \
  'idempotency_key: string' \
  'request_hash: string' \
  'respuesta: Json | null'; do
  grep -Fq "$column" "$GENERATED_TYPES"
  grep -Fq "$column" "$REPO_ROOT/src/lib/database.types.ts"
done

if rg -n '\bany\b' "$REPO_ROOT/src/lib/academic" "$REPO_ROOT/src/lib/actions/calificaciones.ts"; then
  exit 1
fi

printf '%s\n' 'Paso 9 types: Supabase gen types y contratos académicos sincronizados'
