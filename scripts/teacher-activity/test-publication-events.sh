#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_NAME="teacher-activity-test-$RANDOM-$$"
POSTGRES_IMAGE="${TEACHER_ACTIVITY_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.159}"

cleanup() { docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run -d --name "$CONTAINER_NAME" -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD=postgres "$POSTGRES_IMAGE" >/dev/null
for _attempt in $(seq 1 180); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER_NAME")"
  [[ "$health" == "healthy" ]] && break
  sleep 2
done
if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME")" != "healthy" ]]; then
  docker logs --tail 100 "$CONTAINER_NAME"
  exit 1
fi
HOST_PORT="$(docker port "$CONTAINER_NAME" 5432/tcp | awk -F: 'NR == 1 {print $NF}')"
AUDIT_TEST_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres"
run_sql() { psql "$AUDIT_TEST_URL" -X -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null; }

run_sql "$REPO_ROOT/supabase/tests/fixtures/step2_pre_migration_schema.sql"
run_sql "$REPO_ROOT/supabase/tests/fixtures/step2_existing_data.sql"
run_sql "$REPO_ROOT/supabase/tests/fixtures/step12_pre_migration_data.sql"

for migration in \
  20260827012356_academic_cycles_enrollments_assignments.sql \
  20260827031813_academic_periods_evaluation_schemes.sql \
  20260827042953_academic_evaluation_criteria_weights.sql \
  20260827052745_academic_grade_sources.sql \
  20260827235444_academic_rls_grants_secure_read_models.sql \
  20260828014613_academic_deterministic_calculation_engine.sql \
  20260828042542_academic_atomic_grade_mutations_closures.sql; do
  run_sql "$REPO_ROOT/supabase/migrations/$migration"
done

run_sql "$REPO_ROOT/supabase/tests/fixtures/step12_academic_context.sql"
psql "$AUDIT_TEST_URL" -X -v ON_ERROR_STOP=1 -q \
  -c "update public.ejercicios set created_by = '1a000000-0000-4000-8000-000000000003' where id = '18000000-0000-4000-8000-000000000012'" >/dev/null

for migration in \
  20260829032136_academic_unify_exercise_results_step12.sql \
  20260830050405_academic_cutover_existing_tenant_step14.sql; do
  run_sql "$REPO_ROOT/supabase/migrations/$migration"
done

psql "$AUDIT_TEST_URL" -X -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null
alter table public.ejercicios enable row level security;
create policy tenant_boundary on public.ejercicios as restrictive
  for all to public
  using (tenant_id = (select private.current_tenant_id()))
  with check (tenant_id = (select private.current_tenant_id()));
SQL

for migration in \
  20260830060100_academic_remove_legacy_exercise_policies_step15.sql \
  20261001013212_teacher_activity_publication_events.sql \
  20261001022312_teacher_activity_subject_snapshot.sql \
  20261001051436_teacher_activity_active_links_without_exercise_flags.sql; do
  run_sql "$REPO_ROOT/supabase/migrations/$migration"
done

run_sql "$REPO_ROOT/supabase/tests/database/024_teacher_activity_publication_events.sql"
printf '%s\n' 'Seguimiento docente: migraciones y prueba de publicaciones aprobadas.'
