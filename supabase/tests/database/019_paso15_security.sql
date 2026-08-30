begin;
set local search_path = public, extensions;
select plan(14);

select has_function('private', 'current_active_tenant_id', array[]::text[],
  'Existe contexto activo cacheable para RLS');
select is(has_function_privilege('anon',
  'private.current_active_tenant_id()', 'EXECUTE'), false,
  'Anon no ejecuta el helper de contexto activo');
select is((select count(*) from pg_policies
  where schemaname = 'public'
    and policyname = 'academic_active_tenant_boundary'
    and permissive = 'RESTRICTIVE'
    and qual like '%current_active_tenant_id%'), 11::bigint,
  'Las once fronteras académicas usan un InitPlan activo y restrictivo');

select is((select count(*) from pg_policies
  where schemaname = 'public' and tablename = 'ejercicios'
    and policyname = 'Acceso total admin ejercicios'), 0::bigint,
  'No sobrevive la política autenticada USING true');
select is((select count(*) from pg_policies
  where schemaname = 'public' and tablename = 'ejercicios'
    and policyname = 'Ejercicios lectura pública'), 0::bigint,
  'No sobrevive la lectura pública de ejercicios');
select is((select count(*) from pg_policies
  where schemaname = 'public' and tablename = 'ejercicios'
    and policyname = 'Profesores gestionan ejercicios'), 0::bigint,
  'No sobrevive la gestión genérica por cualquier autenticado');
select is((select not p.polpermissive
  from pg_policy p
  where p.polrelid = 'public.ejercicios'::regclass
    and p.polname = 'tenant_boundary'), true,
  'tenant_boundary continúa siendo RESTRICTIVE');
select is((select relrowsecurity from pg_class
  where oid = 'public.ejercicios'::regclass), true,
  'RLS continúa habilitado en ejercicios');
select is((select count(*) from pg_policies
  where schemaname = 'public' and tablename = 'ejercicios'
    and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
    and (qual = 'true' or with_check = 'true')), 0::bigint,
  'Ninguna política de mutación de ejercicios permite true');

insert into public.ejercicios (id, titulo, tenant_id)
values ('58000000-0000-4000-8000-000000000002', 'Ejercicio B Paso 15',
        '20000000-0000-4000-8000-000000000002');

set local role anon;
select is((select count(*) from public.ejercicios), 0::bigint,
  'Anon no enumera ejercicios de ningún tenant');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',
  '1a000000-0000-4000-8000-000000000003', true);
select ok((select count(*) from public.ejercicios
  where tenant_id = '10000000-0000-4000-8000-000000000001') > 0,
  'Profesor A conserva acceso a ejercicios de su tenant');
select is((select count(*) from public.ejercicios
  where tenant_id = '20000000-0000-4000-8000-000000000002'), 0::bigint,
  'Profesor A no enumera ejercicios del tenant B');
select throws_ok(
  $$insert into public.ejercicios (titulo, tenant_id)
    values ('Cruce bloqueado', '20000000-0000-4000-8000-000000000002')$$,
  '42501', null,
  'Profesor A no puede insertar en tenant B');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',
  '2a000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.ejercicios
  where id = '58000000-0000-4000-8000-000000000002'), 1::bigint,
  'Profesor B sí consulta el ejercicio de su tenant');
reset role;

select * from finish();
rollback;
