#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="academic-step8-db-$RANDOM-$$"
CONCURRENT_A=""
CONCURRENT_B=""
POSTGRES_IMAGE="${STEP8_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
FIXTURE="$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
EXISTING_DATA="$REPO_ROOT/supabase/tests/fixtures/step2_existing_data.sql"
STRUCTURE_TEST="$REPO_ROOT/supabase/tests/database/013_paso8_structure.sql"
BEHAVIOR_TEST="$REPO_ROOT/supabase/tests/database/014_paso8_atomic_behavior.sql"
ENGINE_TEST="$REPO_ROOT/supabase/tests/database/012_paso7_engine.sql"
MATRIX_TEST="$REPO_ROOT/supabase/tests/database/011_paso6_security_matrix.sql"
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
  [[ -n "$CONCURRENT_A" ]] && rm -f "$CONCURRENT_A"
  [[ -n "$CONCURRENT_B" ]] && rm -f "$CONCURRENT_B"
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
run_sql() { psql "$HOST_DB_URL" -X -v ON_ERROR_STOP=1 "$@"; }
run_tap() {
  local output
  if ! output="$(run_sql -f "$1" 2>&1)"; then
    printf '%s\n' "$output"
    return 1
  fi
  printf '%s\n' "$output"
  ! grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)' <<<"$output"
}
load_step8() {
  run_sql -f "$FIXTURE" >/dev/null
  run_sql -f "$EXISTING_DATA" >/dev/null
  for migration in "${MIGRATIONS[@]}"; do run_sql -f "$migration" >/dev/null; done
  run_sql -c "update public.periodos_evaluacion set id='1d000000-0000-4000-8000-000000000001' where tenant_id='10000000-0000-4000-8000-000000000001' and orden=1; update public.periodos_evaluacion set id='2d000000-0000-4000-8000-000000000002' where tenant_id='20000000-0000-4000-8000-000000000002' and orden=1;" >/dev/null
  sed 's/^rollback;$/commit;/' "$MATRIX_TEST" | run_sql >/dev/null
  run_sql -c "update public.tenants set estado='activo' where id='10000000-0000-4000-8000-000000000001'; delete from public.criterios_evaluacion where peso=0;" >/dev/null
  run_sql <<'SQL' >/dev/null
set role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',false);
select public.activar_esquema_evaluacion(id, version)
from public.esquemas_evaluacion
where id in (
  '1e600000-0000-4000-8000-000000000001',
  '1e600000-0000-4000-8000-000000000002'
);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','2a000000-0000-4000-8000-000000000001',false);
select public.activar_esquema_evaluacion(id, version)
from public.esquemas_evaluacion
where id='2e600000-0000-4000-8000-000000000002';
SQL
}

echo "[Paso 8] Escenario 1/6: estructura, grants y guardas"
load_step8
run_tap "$STRUCTURE_TEST"

echo "[Paso 8] Escenario 2/6: regresión exacta del motor y completitud corregida"
GOLDEN_OUTPUT="$({ node "$REPO_ROOT/scripts/academic-grading/generate-step7-golden-sql.mjs"; sed -e '/^begin;$/d' -e '/^rollback;$/d' "$ENGINE_TEST"; } | run_sql)"
printf '%s\n' "$GOLDEN_OUTPUT"
! grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)' <<<"$GOLDEN_OUTPUT"

echo "[Paso 8] Escenario 3/6: idempotencia, CAS, rollback, cierre y reapertura"
run_tap "$BEHAVIOR_TEST"

echo "[Paso 8] Escenario 4/6: concurrencia real de dos versiones"
run_sql -f "$FIXTURE" >/dev/null
run_sql -f "$EXISTING_DATA" >/dev/null
for migration in "${MIGRATIONS[@]}"; do run_sql -f "$migration" >/dev/null; done
run_sql -c "update public.periodos_evaluacion set id='1d000000-0000-4000-8000-000000000001' where tenant_id='10000000-0000-4000-8000-000000000001' and orden=1; update public.periodos_evaluacion set id='2d000000-0000-4000-8000-000000000002' where tenant_id='20000000-0000-4000-8000-000000000002' and orden=1;" >/dev/null
sed 's/^rollback;$/commit;/' "$MATRIX_TEST" | run_sql >/dev/null
run_sql -c "update public.tenants set estado='activo' where id='10000000-0000-4000-8000-000000000001'; delete from public.criterios_evaluacion where peso=0;" >/dev/null
run_sql <<'SQL' >/dev/null
set role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',false);
select public.activar_esquema_evaluacion(id, version)
from public.esquemas_evaluacion where id='1e600000-0000-4000-8000-000000000001';
SQL
SOURCE_ID="$(run_sql -Atqc "select id from public.calificaciones_directas where asignacion_profesor_id='1f000000-0000-4000-8000-000000000001'")"
ENROLLMENT_ID="$(run_sql -Atqc "select inscripcion_alumno_id from public.calificaciones_directas where id='$SOURCE_ID'")"
CRITERION_ID="$(run_sql -Atqc "select criterio_evaluacion_id from public.calificaciones_directas where id='$SOURCE_ID'")"
INITIAL_VERSION="$(run_sql -Atqc "select row_version from public.calificaciones_directas where id='$SOURCE_ID'")"
rpc_sql() {
  local grade="$1" key="$2"
  printf "set role authenticated; select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',false); select public.editar_calificaciones_academicas('1f000000-0000-4000-8000-000000000001','1d000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('sourceType','directCriterion','sourceId','%s','enrollmentId','%s','criterionId','%s','state','calificado','grade',%s,'expectedRowVersion',%s)),'Concurrencia real','%s');\n" "$SOURCE_ID" "$ENROLLMENT_ID" "$CRITERION_ID" "$grade" "$INITIAL_VERSION" "$key"
}
CONCURRENT_A="$(mktemp)"
CONCURRENT_B="$(mktemp)"
rpc_sql 8.1 84000000-0000-4000-8000-000000000001 | psql "$HOST_DB_URL" -X -v ON_ERROR_STOP=1 >"$CONCURRENT_A" 2>&1 & PID_A=$!
rpc_sql 9.2 84000000-0000-4000-8000-000000000002 | psql "$HOST_DB_URL" -X -v ON_ERROR_STOP=1 >"$CONCURRENT_B" 2>&1 & PID_B=$!
set +e
wait "$PID_A"; STATUS_A=$?
wait "$PID_B"; STATUS_B=$?
set -e
[[ "$STATUS_A" -eq 0 && "$STATUS_B" -ne 0 || "$STATUS_A" -ne 0 && "$STATUS_B" -eq 0 ]]
grep -q 'ACADEMIC_VERSION_CONFLICT' "$CONCURRENT_A" "$CONCURRENT_B"
[[ "$(run_sql -Atqc "select count(*) from public.auditoria where accion='academic.grade.updated'")" == "1" ]]
[[ "$(run_sql -Atqc "select row_version from public.calificaciones_directas where id='$SOURCE_ID'")" == "$((INITIAL_VERSION + 1))" ]]

echo "[Paso 8] Escenario 5/6: lint y planes de índices"
npx supabase db lint --db-url "${HOST_DB_URL}?sslmode=disable" \
  --schema public,private --level error --fail-on error
EXPLAIN_OUTPUT="$(run_sql -Atqc "set enable_seqscan=off; explain (costs off) select * from public.cierres_calificaciones where tenant_id='10000000-0000-4000-8000-000000000001' and asignacion_id='1f000000-0000-4000-8000-000000000001' and periodo_id='1d000000-0000-4000-8000-000000000001' order by version_cierre desc limit 1;")"
printf '%s\n' "$EXPLAIN_OUTPUT"
grep -q 'cierres_scope_latest_idx' <<<"$EXPLAIN_OUTPUT"

echo "[Paso 8] Escenario 6/6: rollback transaccional"
run_sql -f "$FIXTURE" >/dev/null
run_sql -f "$EXISTING_DATA" >/dev/null
for migration in "${MIGRATIONS[@]:0:6}"; do run_sql -f "$migration" >/dev/null; done
ROLLBACK_RESULT="$({ printf 'begin;\n'; sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' "${MIGRATIONS[6]}"; printf 'rollback;\n'; printf "select (to_regclass('public.cierres_calificaciones') is null)::text || ',' || (to_regprocedure('public.editar_calificaciones_academicas(uuid,uuid,jsonb,text,uuid,uuid)') is null)::text || ',' || (to_regclass('public.solicitudes_mutacion_academica') is null)::text;\n"; } | run_sql -At)"
[[ "$(tail -n 1 <<<"$ROLLBACK_RESULT")" == "true,true,true" ]]

echo "Paso 8 DB: RPC atómica, idempotencia, concurrencia, auditoría, cierre/reapertura y rollback aprobados"
