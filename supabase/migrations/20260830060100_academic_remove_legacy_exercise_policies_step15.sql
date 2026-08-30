-- Paso 15: retirar políticas heredadas de ejercicios que anulaban la
-- autorización académica dentro de un tenant o exponían filas a anon.
--
-- Esta migración no modifica datos. La barrera tenant_boundary permanece
-- RESTRICTIVE y las políticas tenant_admin_manage, tenant_professor_manage y
-- tenant_member_read conservan el comportamiento autorizado existente.
set search_path = '';

-- Contexto activo sin argumentos: las políticas lo convierten en InitPlan y
-- evitan volver a consultar perfil/tenant por cada fila de una libreta.
create or replace function private.current_active_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.tenant_id
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = (select auth.uid())
    and p.estatus = 'activo'
    and t.estado = 'activo'
  limit 1;
$$;
revoke all on function private.current_active_tenant_id()
  from public, anon, authenticated;
grant execute on function private.current_active_tenant_id()
  to authenticated, service_role;

-- Mismos permisos del Paso 6, resueltos con una sola consulta indexable en
-- lugar de encadenar tres funciones SECURITY DEFINER por cada fila.
create or replace function private.can_manage_teaching_assignment(
  target_tenant_id uuid,
  target_assignment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles actor
    join public.tenants tenant on tenant.id = actor.tenant_id
    where actor.id = (select auth.uid())
      and actor.tenant_id = target_tenant_id
      and actor.estatus = 'activo'
      and tenant.estado = 'activo'
      and (
        actor.rol in ('superuser', 'admin')
        or (
          actor.rol = 'profesor'
          and exists (
            select 1 from public.asignaciones_profesor assignment
            where assignment.id = target_assignment_id
              and assignment.tenant_id = target_tenant_id
              and assignment.profesor_id = actor.id
              and assignment.activo
          )
        )
      )
  );
$$;

create or replace function private.can_view_enrollment(
  target_tenant_id uuid,
  target_enrollment_id uuid,
  target_assignment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles actor
    join public.tenants tenant on tenant.id = actor.tenant_id
    join public.inscripciones_alumno enrollment
      on enrollment.id = target_enrollment_id
     and enrollment.tenant_id = target_tenant_id
     and enrollment.activo
    where actor.id = (select auth.uid())
      and actor.tenant_id = target_tenant_id
      and actor.estatus = 'activo'
      and tenant.estado = 'activo'
      and (
        actor.rol in ('superuser', 'admin')
        or (actor.rol = 'alumno' and enrollment.alumno_id = actor.id)
        or (
          actor.rol = 'profesor'
          and exists (
            select 1 from public.asignaciones_profesor assignment
            where assignment.id = target_assignment_id
              and assignment.tenant_id = target_tenant_id
              and assignment.ciclo_escolar_id = enrollment.ciclo_escolar_id
              and assignment.grupo_id = enrollment.grupo_id
              and assignment.profesor_id = actor.id
              and assignment.activo
          )
        )
      )
  );
$$;

create or replace function private.can_view_enrollment(
  target_tenant_id uuid,
  target_enrollment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles actor
    join public.tenants tenant on tenant.id = actor.tenant_id
    join public.inscripciones_alumno enrollment
      on enrollment.id = target_enrollment_id
     and enrollment.tenant_id = target_tenant_id
     and enrollment.activo
    where actor.id = (select auth.uid())
      and actor.tenant_id = target_tenant_id
      and actor.estatus = 'activo'
      and tenant.estado = 'activo'
      and (
        actor.rol in ('superuser', 'admin')
        or (actor.rol = 'alumno' and enrollment.alumno_id = actor.id)
        or (
          actor.rol = 'profesor'
          and exists (
            select 1 from public.asignaciones_profesor assignment
            where assignment.tenant_id = target_tenant_id
              and assignment.ciclo_escolar_id = enrollment.ciclo_escolar_id
              and assignment.grupo_id = enrollment.grupo_id
              and assignment.profesor_id = actor.id
              and assignment.activo
          )
        )
      )
  );
$$;

revoke all on function private.can_manage_teaching_assignment(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.can_view_enrollment(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.can_view_enrollment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_manage_teaching_assignment(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.can_view_enrollment(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function private.can_view_enrollment(uuid, uuid)
  to authenticated, service_role;

do $step15_boundary_initplan$
declare
  target_table text;
begin
  foreach target_table in array array[
    'ciclos_escolares', 'inscripciones_alumno', 'asignaciones_profesor',
    'periodos_evaluacion', 'esquemas_evaluacion',
    'criterios_evaluacion', 'subcriterios_evaluacion',
    'vinculos_evaluacion_ejercicio', 'resultados_ejercicios',
    'calificaciones_directas', 'eventos_participacion'
  ] loop
    execute format(
      'drop policy if exists academic_active_tenant_boundary on public.%I',
      target_table
    );
    execute format(
      'create policy academic_active_tenant_boundary on public.%I as restrictive for all to authenticated using (tenant_id = (select private.current_active_tenant_id())) with check (tenant_id = (select private.current_active_tenant_id()))',
      target_table
    );
  end loop;
end
$step15_boundary_initplan$;

alter table public.ejercicios enable row level security;

drop policy if exists "Acceso total admin ejercicios"
  on public.ejercicios;
drop policy if exists "Ejercicios lectura pública"
  on public.ejercicios;
drop policy if exists "Profesores gestionan ejercicios"
  on public.ejercicios;

do $step15_rls_guard$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'ejercicios'
      and p.polname = 'tenant_boundary'
      and not p.polpermissive
  ) then
    raise exception
      'STEP15_RLS_GUARD: ejercicios requiere tenant_boundary RESTRICTIVE';
  end if;
end
$step15_rls_guard$;

comment on table public.ejercicios is
  'Actividades académicas aisladas por tenant; lectura y mutación requieren sesión y políticas de rol.';
