#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="academic-step7-db-$RANDOM-$$"
POSTGRES_IMAGE="${STEP7_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
FIXTURE="$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
EXISTING_DATA="$REPO_ROOT/supabase/tests/fixtures/step2_existing_data.sql"
ENGINE_TEST="$REPO_ROOT/supabase/tests/database/012_paso7_engine.sql"
MATRIX_TEST="$REPO_ROOT/supabase/tests/database/011_paso6_security_matrix.sql"
MIGRATIONS=(
  "$REPO_ROOT/supabase/migrations/20260827012356_academic_cycles_enrollments_assignments.sql"
  "$REPO_ROOT/supabase/migrations/20260827031813_academic_periods_evaluation_schemes.sql"
  "$REPO_ROOT/supabase/migrations/20260827042953_academic_evaluation_criteria_weights.sql"
  "$REPO_ROOT/supabase/migrations/20260827052745_academic_grade_sources.sql"
  "$REPO_ROOT/supabase/migrations/20260827235444_academic_rls_grants_secure_read_models.sql"
  "$REPO_ROOT/supabase/migrations/20260828014613_academic_deterministic_calculation_engine.sql"
)

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  [[ -n "${MATRIX_COMMIT_FILE:-}" ]] && rm -f "$MATRIX_COMMIT_FILE"
}
trap cleanup EXIT INT TERM
docker run -d --name "$CONTAINER_NAME" -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD=postgres "$POSTGRES_IMAGE" >/dev/null
for _attempt in $(seq 1 60); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER_NAME")"
  [[ "$health" == "healthy" ]] && break
  sleep 2
done
if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME")" != "healthy" ]]; then
  docker logs --tail 100 "$CONTAINER_NAME"
  exit 1
fi
HOST_PORT="$(docker port "$CONTAINER_NAME" 5432/tcp | awk -F: 'NR == 1 {print $NF}')"
HOST_DB_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres"
run_sql() { psql "$HOST_DB_URL" -X -v ON_ERROR_STOP=1 "$@"; }
load_step7() {
  run_sql -f "$FIXTURE" >/dev/null
  [[ "${1:-clean}" == "existing" ]] && run_sql -f "$EXISTING_DATA" >/dev/null
  for migration in "${MIGRATIONS[@]}"; do run_sql -f "$migration" >/dev/null; done
}
run_golden() {
  local output
  output="$({ node "$REPO_ROOT/scripts/academic-grading/generate-step7-golden-sql.mjs"; sed -e '/^begin;$/d' -e '/^rollback;$/d' "$ENGINE_TEST"; } | run_sql)"
  printf '%s\n' "$output"
  ! grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)' <<<"$output"
}

echo "[Paso 7] Escenario 1/5: migración y casos dorados sobre base limpia"
load_step7 clean
run_golden

echo "[Paso 7] Escenario 2/5: equivalencia sobre base existente sintética"
load_step7 existing
run_golden
MATRIX_COMMIT_FILE="$(mktemp)"
sed 's/^rollback;$/commit;/' "$MATRIX_TEST" > "$MATRIX_COMMIT_FILE"
run_sql -f "$MATRIX_COMMIT_FILE" >/dev/null
run_sql -c "update public.tenants set estado='activo' where id='10000000-0000-4000-8000-000000000001'" >/dev/null
run_sql -c "delete from public.criterios_evaluacion where peso=0" >/dev/null
run_sql <<'SQL' >/dev/null
set role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',false);
select public.activar_esquema_evaluacion(id, version)
from public.esquemas_evaluacion
where id in (
  '1e600000-0000-4000-8000-000000000001',
  '1e600000-0000-4000-8000-000000000002'
);
SQL

echo "[Paso 7] Escenario 3/5: lectura autorizada, límite y aislamiento"
run_sql <<'SQL' >/dev/null
set role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',false);
select public.calcular_resultado_academico(
  d.asignacion_profesor_id, d.inscripcion_alumno_id, d.periodo_evaluacion_id
) from public.calificaciones_directas d
where d.asignacion_profesor_id='1f000000-0000-4000-8000-000000000001'
limit 1;
SQL
[[ "$(run_sql -Atqc "set role authenticated; select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',false); select count(*) from public.vista_desglose_calificacion where asignacion_profesor_id='1f000000-0000-4000-8000-000000000002';")" == *$'\n0' || "$(run_sql -Atqc "set role authenticated; select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',false); select count(*) from public.vista_desglose_calificacion where asignacion_profesor_id='1f000000-0000-4000-8000-000000000002';")" == "0" ]]

echo "[Paso 7] Escenario 4/5: EXPLAIN sin índice adicional injustificado"
EXPLAIN_OUTPUT="$(run_sql -Atqc "set enable_seqscan=off; set role authenticated; select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',false); explain (costs off) select * from public.vista_desglose_calificacion where asignacion_profesor_id='1f000000-0000-4000-8000-000000000001' and inscripcion_alumno_id='1e000000-0000-4000-8000-000000000001' and periodo_evaluacion_id='1d000000-0000-4000-8000-000000000001';")"
printf '%s\n' "$EXPLAIN_OUTPUT"
grep -Eq 'calificaciones_directas_assignment_period_idx|academic_direct_grades_rls_idx|resultados_ejercicios' <<<"$EXPLAIN_OUTPUT"
npx supabase db lint --db-url "${HOST_DB_URL}?sslmode=disable" --schema public,private --level error --fail-on error

echo "[Paso 7] Escenario 5/5: rollback transaccional"
run_sql -f "$FIXTURE" >/dev/null
run_sql -f "$EXISTING_DATA" >/dev/null
for migration in "${MIGRATIONS[@]:0:5}"; do run_sql -f "$migration" >/dev/null; done
ROLLBACK_RESULT="$({ printf 'begin;\n'; sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' "${MIGRATIONS[5]}"; printf 'rollback;\n'; printf "select (to_regprocedure('public.calcular_calificacion_academica(jsonb)') is null)::text || ',' || (to_regprocedure('public.calcular_resultado_academico(uuid,uuid,uuid)') is null)::text;\n"; } | run_sql -At)"
[[ "$(tail -n 1 <<<"$ROLLBACK_RESULT")" == "true,true" ]]

echo "Paso 7 DB: motor numeric, equivalencia exacta, aislamiento, EXPLAIN, lint y rollback aprobados"
