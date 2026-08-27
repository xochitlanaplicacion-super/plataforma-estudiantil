#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="academic-step4-db-$RANDOM-$$"
POSTGRES_IMAGE="${STEP4_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
FIXTURE="$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
EXISTING_DATA="$REPO_ROOT/supabase/tests/fixtures/step2_existing_data.sql"
STEP2_MIGRATION="$REPO_ROOT/supabase/migrations/20260827012356_academic_cycles_enrollments_assignments.sql"
STEP3_MIGRATION="$REPO_ROOT/supabase/migrations/20260827031813_academic_periods_evaluation_schemes.sql"
STEP4_MIGRATION="$REPO_ROOT/supabase/migrations/20260827042953_academic_evaluation_criteria_weights.sql"
STRUCTURE_TEST="$REPO_ROOT/supabase/tests/database/006_paso4_structure.sql"
INTEGRITY_TEST="$REPO_ROOT/supabase/tests/database/007_paso4_integrity_rls.sql"

cleanup() { docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run -d --name "$CONTAINER_NAME" -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1::5432 "$POSTGRES_IMAGE" >/dev/null
for _attempt in $(seq 1 60); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER_NAME")"
  [[ "$health" == "healthy" ]] && break
  if [[ "$health" == "unhealthy" ]]; then docker logs --tail 100 "$CONTAINER_NAME"; exit 1; fi
  sleep 2
done
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME")" == "healthy" ]] || { echo "PostgreSQL desechable no alcanzó estado healthy" >&2; exit 1; }

HOST_PORT="$(docker port "$CONTAINER_NAME" 5432/tcp | awk -F: 'NR == 1 {print $NF}')"
DB_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres"
run_sql() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 "$@"; }
run_tap() {
  local output
  output="$(run_sql -f "$1")"
  printf '%s\n' "$output"
  if grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)' <<<"$output"; then echo "Falló pgTAP: $1" >&2; exit 1; fi
}
load_step3() {
  run_sql -f "$FIXTURE" >/dev/null
  [[ "${1:-clean}" == "existing" ]] && run_sql -f "$EXISTING_DATA" >/dev/null
  run_sql -f "$STEP2_MIGRATION" >/dev/null
  run_sql -f "$STEP3_MIGRATION" >/dev/null
}

echo "[Paso 4] Escenario 1/5: base limpia"
load_step3 clean
run_sql -f "$STEP4_MIGRATION" >/dev/null
run_tap "$STRUCTURE_TEST"

echo "[Paso 4] Escenario 2/5: datos históricos sintéticos, integridad y RLS"
load_step3 existing
run_sql -f "$STEP4_MIGRATION" >/dev/null
run_tap "$STRUCTURE_TEST"
run_tap "$INTEGRITY_TEST"

echo "[Paso 4] Escenario 3/5: índice tenant/esquema/activos"
EXPLAIN_OUTPUT="$(run_sql -Atqc "set enable_seqscan=off; explain (costs off) select id,nombre,peso from public.criterios_evaluacion where tenant_id='10000000-0000-4000-8000-000000000001' and esquema_evaluacion_id='1e000000-0000-4000-8000-000000000100' and activo order by orden;")"
printf '%s\n' "$EXPLAIN_OUTPUT"
grep -Eq 'criterios_evaluacion_esquema_activos_idx' <<<"$EXPLAIN_OUTPUT" || { echo "EXPLAIN no usó el índice parcial esperado" >&2; exit 1; }

echo "[Paso 4] Escenario 4/5: serialización real entre edición y activación"
run_sql -c "
insert into public.esquemas_evaluacion (id,tenant_id,ciclo_escolar_id,asignacion_profesor_id,periodo_evaluacion_id,nombre,created_by)
select '1e000000-0000-4000-8000-000000000200',a.tenant_id,a.ciclo_escolar_id,a.id,p.id,'Carrera concurrente','1a000000-0000-4000-8000-000000000001'
from public.asignaciones_profesor a join public.periodos_evaluacion p on p.tenant_id=a.tenant_id and p.ciclo_escolar_id=a.ciclo_escolar_id
where a.id='1f000000-0000-4000-8000-000000000001' and p.orden=1;
insert into public.criterios_evaluacion (id,tenant_id,esquema_evaluacion_id,nombre,tipo,peso,orden,created_by) values
('1c000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000200','Primero','directo',60,1,'1a000000-0000-4000-8000-000000000001'),
('1c000000-0000-4000-8000-000000000202','10000000-0000-4000-8000-000000000001','1e000000-0000-4000-8000-000000000200','Segundo','directo',40,2,'1a000000-0000-4000-8000-000000000001');" >/dev/null
CONCURRENCY_LOG="$(mktemp)"
(
  run_sql -c "begin; update public.criterios_evaluacion set peso=30 where id='1c000000-0000-4000-8000-000000000202'; select pg_sleep(2); commit;" >"$CONCURRENCY_LOG" 2>&1
) &
MUTATION_PID=$!
sleep 1
set +e
ACTIVATION_OUTPUT="$(run_sql -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true); select * from public.activar_esquema_evaluacion('1e000000-0000-4000-8000-000000000200',1);" 2>&1)"
ACTIVATION_STATUS=$?
set -e
wait "$MUTATION_PID"
rm -f "$CONCURRENCY_LOG"
if [[ "$ACTIVATION_STATUS" -eq 0 ]] || ! grep -q 'sumar exactamente 100.0000' <<<"$ACTIVATION_OUTPUT"; then
  echo "La activación no se serializó contra la edición concurrente" >&2
  printf '%s\n' "$ACTIVATION_OUTPUT" >&2
  exit 1
fi
echo "La activación esperó el lock y rechazó el total concurrente 90.0000"

echo "[Paso 4] Escenario 5/5: rollback transaccional local"
load_step3 existing
ROLLBACK_RESULT="$({ printf 'begin;\n'; sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' "$STEP4_MIGRATION"; printf 'rollback;\n'; printf "select (to_regclass('public.criterios_evaluacion') is null)::text || ',' || (to_regclass('public.subcriterios_evaluacion') is null)::text || ',' || (not exists(select 1 from information_schema.columns where table_schema='public' and table_name='esquemas_evaluacion' and column_name='copiado_desde_id'))::text;\n"; } | run_sql -At)"
[[ "$(tail -n 1 <<<"$ROLLBACK_RESULT")" == "true,true,true" ]] || { echo "Rollback no restauró el estado posterior al Paso 3" >&2; exit 1; }

echo "Paso 4 DB: limpia, existente, pgTAP, RLS, RPC, EXPLAIN y rollback aprobados"
