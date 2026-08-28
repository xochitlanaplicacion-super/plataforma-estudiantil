#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="academic-step6-db-$RANDOM-$$"
POSTGREST_NAME="academic-step6-rest-$RANDOM-$$"
NETWORK_NAME="academic-step6-net-$RANDOM-$$"
POSTGRES_IMAGE="${STEP6_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"
POSTGREST_IMAGE="${STEP6_POSTGREST_IMAGE:-postgrest/postgrest:v12.2.12}"
JWT_SECRET="academic-step6-local-jwt-secret-at-least-32-bytes"
FIXTURE="$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
EXISTING_DATA="$REPO_ROOT/supabase/tests/fixtures/step2_existing_data.sql"
STRUCTURE_TEST="$REPO_ROOT/supabase/tests/database/010_paso6_structure.sql"
MATRIX_TEST="$REPO_ROOT/supabase/tests/database/011_paso6_security_matrix.sql"
MIGRATIONS=(
  "$REPO_ROOT/supabase/migrations/20260827012356_academic_cycles_enrollments_assignments.sql"
  "$REPO_ROOT/supabase/migrations/20260827031813_academic_periods_evaluation_schemes.sql"
  "$REPO_ROOT/supabase/migrations/20260827042953_academic_evaluation_criteria_weights.sql"
  "$REPO_ROOT/supabase/migrations/20260827052745_academic_grade_sources.sql"
  "$REPO_ROOT/supabase/migrations/20260827235444_academic_rls_grants_secure_read_models.sql"
)

cleanup() {
  docker rm -f "$POSTGREST_NAME" "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker network rm "$NETWORK_NAME" >/dev/null 2>&1 || true
  [[ -n "${MATRIX_COMMIT_FILE:-}" ]] && rm -f "$MATRIX_COMMIT_FILE"
}
trap cleanup EXIT INT TERM

docker network create "$NETWORK_NAME" >/dev/null
docker run -d --name "$CONTAINER_NAME" --network "$NETWORK_NAME" \
  -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=postgres "$POSTGRES_IMAGE" >/dev/null
for _attempt in $(seq 1 60); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER_NAME")"
  [[ "$health" == "healthy" ]] && break
  [[ "$health" == "unhealthy" ]] && { docker logs --tail 100 "$CONTAINER_NAME"; exit 1; }
  sleep 2
done
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME")" == "healthy" ]]
DB_URL="postgresql://postgres:postgres@${CONTAINER_NAME}:5432/postgres"
HOST_PORT="$(docker port "$CONTAINER_NAME" 5432/tcp | awk -F: 'NR == 1 {print $NF}')"
HOST_DB_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres"
run_sql() { psql "$HOST_DB_URL" -X -v ON_ERROR_STOP=1 "$@"; }
run_tap() {
  local output
  output="$(run_sql -f "$1")"
  printf '%s\n' "$output"
  ! grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)' <<<"$output"
}
load_step6() {
  run_sql -f "$FIXTURE" >/dev/null
  [[ "${1:-clean}" == "existing" ]] && run_sql -f "$EXISTING_DATA" >/dev/null
  for migration in "${MIGRATIONS[@]}"; do run_sql -f "$migration" >/dev/null; done
}

echo "[Paso 6] Escenario 1/6: estructura y grants sobre base limpia"
load_step6 clean
run_tap "$STRUCTURE_TEST"

echo "[Paso 6] Escenario 2/6: matriz RLS de dos tenants y cuatro roles"
load_step6 existing
run_tap "$STRUCTURE_TEST"
MATRIX_COMMIT_FILE="$(mktemp)"
sed 's/^rollback;$/commit;/' "$MATRIX_TEST" > "$MATRIX_COMMIT_FILE"
run_tap "$MATRIX_COMMIT_FILE"
run_sql -c "update public.tenants set estado='activo' where id='10000000-0000-4000-8000-000000000001'" >/dev/null

echo "[Paso 6] Escenario 3/6: EXPLAIN de predicados RLS"
EXPLAIN_OUTPUT="$(run_sql -Atqc "set enable_seqscan=off; set role authenticated; select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',false); explain (costs off) select * from public.calificaciones_directas where tenant_id='10000000-0000-4000-8000-000000000001' and asignacion_profesor_id='1f000000-0000-4000-8000-000000000001';")"
printf '%s\n' "$EXPLAIN_OUTPUT"
grep -Eq 'academic_direct_grades_rls_idx' <<<"$EXPLAIN_OUTPUT"

echo "[Paso 6] Escenario 4/6: REST real con JWT y casos IDOR/BOLA"
run_sql <<'SQL' >/dev/null
create or replace function public.step6_test_apply_jwt_claims()
returns void language plpgsql set search_path = '' as $$
declare claim_sub text;
begin
  claim_sub := current_setting('request.jwt.claims', true)::jsonb ->> 'sub';
  if claim_sub is not null then
    perform set_config('request.jwt.claim.sub', claim_sub, true);
  end if;
end;
$$;
grant execute on function public.step6_test_apply_jwt_claims() to anon, authenticated;
SQL
docker run -d --name "$POSTGREST_NAME" --network "$NETWORK_NAME" \
  -e PGRST_DB_URI="$DB_URL" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" \
  -e PGRST_DB_PRE_REQUEST=public.step6_test_apply_jwt_claims \
  -p 127.0.0.1::3000 "$POSTGREST_IMAGE" >/dev/null
REST_PORT="$(docker port "$POSTGREST_NAME" 3000/tcp | awk -F: 'NR == 1 {print $NF}')"
REST_URL="http://127.0.0.1:${REST_PORT}"
for _attempt in $(seq 1 60); do
  curl -fsS "$REST_URL/" >/dev/null 2>&1 && break
  sleep 1
done

base64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt_for() {
  local sub="$1" now exp header payload unsigned signature
  now="$(date +%s)"; exp="$((now + 600))"
  header="$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | base64url)"
  payload="$(printf '{"role":"authenticated","sub":"%s","iat":%s,"exp":%s}' "$sub" "$now" "$exp" | base64url)"
  unsigned="${header}.${payload}"
  signature="$(printf '%s' "$unsigned" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64url)"
  printf '%s.%s\n' "$unsigned" "$signature"
}
rest_get() {
  local token="$1" path="$2" body_file="$3"
  curl -sS -o "$body_file" -w '%{http_code}' \
    -H "Authorization: Bearer $token" -H "Accept: application/json" \
    "$REST_URL/$path"
}
assert_json() {
  local expression="$1" body_file="$2"
  node -e "const fs=require('node:fs'); const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if(!($expression)){ console.error(JSON.stringify(d)); process.exit(1); }" "$body_file"
}
TEACHER_A_JWT="$(jwt_for '1a000000-0000-4000-8000-000000000003')"
TEACHER_A2_JWT="$(jwt_for '1a000000-0000-4000-8000-000000000005')"
STUDENT_A_JWT="$(jwt_for '1a000000-0000-4000-8000-000000000002')"
ADMIN_A_JWT="$(jwt_for '1a000000-0000-4000-8000-000000000001')"
SUSPENDED_JWT="$(jwt_for '1a000000-0000-4000-8000-000000000004')"
REST_BODY="$(mktemp)"
trap 'rm -f "$REST_BODY"; cleanup' EXIT INT TERM

[[ "$(rest_get "$TEACHER_A_JWT" 'vista_libreta_profesor?select=asignacion_profesor_id,valor_fuente' "$REST_BODY")" == "200" ]]
assert_json 'd.length===1 && Number(d[0].valor_fuente)===8' "$REST_BODY"
[[ "$(rest_get "$TEACHER_A_JWT" 'vista_libreta_profesor?asignacion_profesor_id=eq.1f000000-0000-4000-8000-000000000002' "$REST_BODY")" == "200" ]]
assert_json 'd.length===0' "$REST_BODY"
[[ "$(rest_get "$TEACHER_A2_JWT" 'vista_libreta_profesor?select=valor_fuente' "$REST_BODY")" == "200" ]]
assert_json 'd.length===1 && Number(d[0].valor_fuente)===9' "$REST_BODY"
[[ "$(rest_get "$STUDENT_A_JWT" 'vista_calificaciones_alumno?select=valor_fuente' "$REST_BODY")" == "200" ]]
assert_json 'd.length===2' "$REST_BODY"
[[ "$(rest_get "$STUDENT_A_JWT" 'vista_libreta_profesor' "$REST_BODY")" == "200" ]]
assert_json 'd.length===0' "$REST_BODY"
[[ "$(rest_get "$ADMIN_A_JWT" 'calificaciones_directas?select=tenant_id' "$REST_BODY")" == "200" ]]
assert_json "d.length===2 && !d.some(x=>x.tenant_id!=='10000000-0000-4000-8000-000000000001')" "$REST_BODY"
[[ "$(rest_get "$SUSPENDED_JWT" 'calificaciones_directas' "$REST_BODY")" == "200" ]]
assert_json 'd.length===0' "$REST_BODY"
ANON_STATUS="$(curl -sS -o "$REST_BODY" -w '%{http_code}' "$REST_URL/vista_calificaciones_alumno")"
[[ "$ANON_STATUS" == "401" || "$ANON_STATUS" == "403" ]]

echo "[Paso 6] Escenario 5/6: lint/Advisor de seguridad"
npx supabase db lint --db-url "${HOST_DB_URL}?sslmode=disable" \
  --schema public,private --level error --fail-on error
[[ "$(run_sql -Atqc "select count(*) from pg_policy where polpermissive and polcmd='*' and polrelid in ('public.resultados_ejercicios'::regclass,'public.calificaciones_directas'::regclass,'public.eventos_participacion'::regclass)")" == "0" ]]
[[ "$(run_sql -Atqc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prosecdef and (p.proconfig is null or not p.proconfig @> array['search_path=\"\"'])")" == "0" ]]

echo "[Paso 6] Escenario 6/6: rollback transaccional deny-by-default"
run_sql -f "$FIXTURE" >/dev/null
run_sql -f "$EXISTING_DATA" >/dev/null
for migration in "${MIGRATIONS[@]:0:4}"; do run_sql -f "$migration" >/dev/null; done
ROLLBACK_RESULT="$({ printf 'begin;\n'; sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' "${MIGRATIONS[4]}"; printf 'rollback;\n'; printf "select (to_regclass('public.vista_libreta_profesor') is null)::text || ',' || (to_regprocedure('private.can_manage_teaching_assignment(uuid,uuid)') is null)::text || ',' || exists(select 1 from pg_policy where polrelid='public.calificaciones_directas'::regclass and polname='academic_direct_professor_own_manage')::text;\n"; } | run_sql -At)"
[[ "$(tail -n 1 <<<"$ROLLBACK_RESULT")" == "true,true,true" ]]

echo "Paso 6 DB: RLS, grants, JWT REST, IDOR/BOLA, índices, lint y rollback aprobados"
