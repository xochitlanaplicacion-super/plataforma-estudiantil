-- Endurecimiento de funciones históricas detectadas por Security Advisor.

drop policy if exists "Admin y Superuser ven todos los perfiles" on public.profiles;
drop policy if exists "Superuser gestiona perfiles" on public.profiles;

revoke all on function public.get_active_storage_urls(text) from public, anon, authenticated;
revoke all on function public.get_auth_role() from public, anon, authenticated;
revoke all on function public.is_admin_or_super() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
revoke all on function public.seed_pagos_alumnos_activos() from public, anon, authenticated;
revoke all on function public.update_profile(uuid, varchar, varchar, varchar, varchar, varchar, varchar) from public, anon, authenticated;
grant execute on function public.get_active_storage_urls(text) to service_role;
grant execute on function public.seed_pagos_alumnos_activos() to service_role;
grant execute on function public.update_profile(uuid, varchar, varchar, varchar, varchar, varchar, varchar) to service_role;

alter function public.get_active_storage_urls(text) set search_path = '';
alter function public.seed_pagos_alumnos_activos() set search_path = '';
alter function public.set_current_timestamp_updated_at() set search_path = '';
alter function public.update_updated_at() set search_path = '';
alter function public.update_updated_at_column() set search_path = '';

create or replace function public.consumir_cuota_servicio(p_servicio text)
returns table(usados_nuevo integer, limite integer, cuota_excedida boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_usados integer;
  v_limite integer;
  v_tenant uuid := private.current_tenant_id();
begin
  if v_tenant is null then raise exception 'Tenant requerido'; end if;
  select usados, limite_total into v_usados, v_limite
  from public.config_cuotas_servicio
  where tenant_id = v_tenant and servicio = p_servicio
  for update;
  if not found then raise exception 'Cuota no configurada para %', p_servicio; end if;
  if v_usados >= v_limite then
    return query select v_usados, v_limite, true;
    return;
  end if;
  update public.config_cuotas_servicio
  set usados = usados + 1, updated_at = now()
  where tenant_id = v_tenant and servicio = p_servicio;
  return query select v_usados + 1, v_limite, false;
end;
$$;

create or replace function public.generar_folio_recibo(prefijo text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  nuevo_numero bigint;
begin
  nuevo_numero := nextval('public.folio_pagos_seq');
  return prefijo || '-' || lpad(nuevo_numero::text, 5, '0');
end;
$$;

create or replace function public.update_profile(
  p_user_id uuid,
  p_nombre varchar,
  p_apellidos varchar,
  p_curp varchar,
  p_telefono varchar,
  p_matricula varchar,
  p_numero_empleado varchar
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set nombre = coalesce(p_nombre, nombre),
      apellidos = coalesce(p_apellidos, apellidos),
      curp = coalesce(p_curp, curp),
      telefono = coalesce(p_telefono, telefono),
      matricula = coalesce(p_matricula, matricula),
      numero_empleado = coalesce(p_numero_empleado, numero_empleado),
      updated_at = timezone('utc', now())
  where id = p_user_id;
  return found;
end;
$$;
revoke all on function public.update_profile(uuid, varchar, varchar, varchar, varchar, varchar, varchar) from public, anon, authenticated;
grant execute on function public.update_profile(uuid, varchar, varchar, varchar, varchar, varchar, varchar) to service_role;

-- Políticas explícitas para tablas exclusivamente operadas por backend. No se
-- restauran grants al cliente; eliminan estados ambiguos de RLS sin política.
drop policy if exists platform_admin_audit_read on public.platform_audit;
create policy platform_admin_audit_read on public.platform_audit for select to authenticated
using ((select private.is_platform_admin()));
drop policy if exists platform_admin_provisioning_read on public.tenant_provisioning;
create policy platform_admin_provisioning_read on public.tenant_provisioning for select to authenticated
using ((select private.is_platform_admin()));
drop policy if exists tenant_admin_smtp_metadata_read on public.tenant_smtp_settings;
create policy tenant_admin_smtp_metadata_read on public.tenant_smtp_settings for select to authenticated
using ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));

-- Índices para todas las FK públicas que aún no tengan un índice de cobertura.
do $foreign_key_indexes$
declare
  fk record;
  columns_sql text;
  index_name text;
begin
  for fk in
    select c.oid, c.conrelid, c.conname, c.conkey, n.nspname, cls.relname
    from pg_constraint c
    join pg_class cls on cls.oid = c.conrelid
    join pg_namespace n on n.oid = cls.relnamespace
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and (i.indkey::smallint[])[1:cardinality(c.conkey)] = c.conkey
      )
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ordinality)
      into columns_sql
    from unnest(fk.conkey) with ordinality as k(attnum, ordinality)
    join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum;
    index_name := left('idx_' || fk.relname || '_' || replace(columns_sql, '"', '') || '_fk', 63);
    execute format('create index if not exists %I on %I.%I (%s)', index_name, fk.nspname, fk.relname, columns_sql);
  end loop;
end
$foreign_key_indexes$;
