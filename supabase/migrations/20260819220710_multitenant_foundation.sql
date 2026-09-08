-- Fundación multitenant para la plataforma estudiantil.
-- Migración aditiva: crea el tenant Xochitlán y asigna todos los datos existentes.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.normalize_hostname(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(coalesce(value, ''))), '^https?://', ''),
        '/.*$', ''
      ),
      ':[0-9]+$', ''
    ),
    ''
  );
$$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  nombre text not null,
  estado text not null default 'activo'
    check (estado in ('provisionando', 'activo', 'suspendido', 'cancelado')),
  initial_superuser_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_normalized check (slug = lower(slug))
);

create unique index if not exists tenants_slug_unique_idx on public.tenants (lower(slug));

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  hostname text not null,
  es_principal boolean not null default false,
  estado text not null default 'verificado'
    check (estado in ('pendiente', 'verificado', 'rechazado', 'desactivado')),
  verificado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_domains_hostname_normalized
    check (hostname = private.normalize_hostname(hostname))
);

create unique index if not exists tenant_domains_hostname_unique_idx
  on public.tenant_domains (lower(hostname));
create index if not exists tenant_domains_tenant_id_idx
  on public.tenant_domains (tenant_id);
create unique index if not exists tenant_domains_one_primary_idx
  on public.tenant_domains (tenant_id) where es_principal;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_provisioning (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  idempotency_key uuid not null default gen_random_uuid(),
  estado text not null default 'pending'
    check (estado in ('pending', 'tenant_created', 'auth_created', 'ready', 'failed', 'rolled_back')),
  initial_superuser_id uuid references auth.users(id) on delete set null,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists tenant_provisioning_tenant_id_idx
  on public.tenant_provisioning (tenant_id);

create table if not exists public.platform_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  accion text not null,
  detalles jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_tenant_created_idx
  on public.platform_audit (tenant_id, created_at desc);
create index if not exists platform_audit_actor_created_idx
  on public.platform_audit (actor_user_id, created_at desc);

create table if not exists public.tenant_smtp_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  smtp_host text not null default 'smtp.gmail.com',
  smtp_port integer not null default 465 check (smtp_port between 1 and 65535),
  smtp_user text,
  smtp_password_secret_id uuid,
  smtp_from_name text,
  activo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Crear el tenant que absorbe el 100% de los datos actuales.
insert into public.tenants (slug, nombre, estado)
values ('xochitlan', 'Colegio Xochitlán', 'activo')
on conflict ((lower(slug))) do update
set nombre = excluded.nombre,
    updated_at = now();

-- Quitar las restricciones históricas de fila única para permitir una por tenant.
alter table public.configuracion_sistema drop constraint if exists config_single_row;

create sequence if not exists public.configuracion_sistema_id_seq;
select setval(
  'public.configuracion_sistema_id_seq',
  greatest(coalesce((select max(id) from public.configuracion_sistema), 0), 1),
  true
);
alter table public.configuracion_sistema
  alter column id set default nextval('public.configuracion_sistema_id_seq');
alter sequence public.configuracion_sistema_id_seq owned by public.configuracion_sistema.id;

create sequence if not exists public.pago_de_servicios_id_seq;
select setval(
  'public.pago_de_servicios_id_seq',
  greatest(coalesce((select max(id) from public.pago_de_servicios), 0), 1),
  true
);
alter table public.pago_de_servicios
  alter column id set default nextval('public.pago_de_servicios_id_seq');
alter sequence public.pago_de_servicios_id_seq owned by public.pago_de_servicios.id;

-- Todas estas tablas pertenecen a una escuela.
do $tenant_columns$
declare
  table_name text;
  tenant_tables constant text[] := array[
    'abonos_pago', 'acreditaciones_alumnos', 'agrupaciones_profesor',
    'ai_alumno_daily_messages', 'ai_session_categories', 'ai_daily_web_searches',
    'ai_red_list_alerts', 'ai_token_usage', 'ai_usage_log', 'alumno_chat_history',
    'asignaciones_profesor', 'aspirantes', 'auditoria', 'carreras',
    'config_credenciales', 'config_cuotas_servicio', 'configuracion_sistema',
    'credenciales_autorizadas', 'ejercicios', 'fechas_evaluacion', 'grados',
    'grupo_materias', 'grupos', 'inscripciones_alumno', 'material_apoyo',
    'materias', 'mensajes_acreditacion', 'mensajes_clases',
    'mensajes_clases_vistos', 'mensajes_contacto', 'mensajes_internos',
    'mensajes_vistos', 'niveles', 'notificaciones', 'pago_de_servicios',
    'pagos_alumno', 'plan_pagos', 'profesor_chat_history', 'profiles', 'recursos',
    'resources', 'resultados_ejercicios', 'slides', 'temas', 'unidades',
    'video_progreso_alumno'
  ];
begin
  foreach table_name in array tenant_tables loop
    execute format(
      'alter table public.%I add column if not exists tenant_id uuid',
      table_name
    );
    execute format(
      'update public.%I set tenant_id = (select id from public.tenants where slug = %L) where tenant_id is null',
      table_name,
      'xochitlan'
    );
  end loop;
end
$tenant_columns$;

-- El perfil del platform admin puede ser global en el futuro; el resto debe tener tenant.
do $tenant_constraints$
declare
  table_name text;
  tenant_tables constant text[] := array[
    'abonos_pago', 'acreditaciones_alumnos', 'agrupaciones_profesor',
    'ai_alumno_daily_messages', 'ai_session_categories', 'ai_daily_web_searches',
    'ai_red_list_alerts', 'ai_token_usage', 'ai_usage_log', 'alumno_chat_history',
    'asignaciones_profesor', 'aspirantes', 'auditoria', 'carreras',
    'config_credenciales', 'config_cuotas_servicio', 'configuracion_sistema',
    'credenciales_autorizadas', 'ejercicios', 'fechas_evaluacion', 'grados',
    'grupo_materias', 'grupos', 'inscripciones_alumno', 'material_apoyo',
    'materias', 'mensajes_acreditacion', 'mensajes_clases',
    'mensajes_clases_vistos', 'mensajes_contacto', 'mensajes_internos',
    'mensajes_vistos', 'niveles', 'notificaciones', 'pago_de_servicios',
    'pagos_alumno', 'plan_pagos', 'profesor_chat_history', 'recursos', 'resources',
    'resultados_ejercicios', 'slides', 'temas', 'unidades', 'video_progreso_alumno'
  ];
begin
  foreach table_name in array tenant_tables loop
    execute format('alter table public.%I alter column tenant_id set not null', table_name);
  end loop;

  foreach table_name in array array_append(tenant_tables, 'profiles') loop
    if not exists (
      select 1 from pg_constraint
      where conname = table_name || '_tenant_id_fkey'
        and conrelid = format('public.%I', table_name)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (tenant_id) references public.tenants(id) on delete restrict',
        table_name,
        table_name || '_tenant_id_fkey'
      );
    end if;
    execute format(
      'create index if not exists %I on public.%I (tenant_id)',
      table_name || '_tenant_id_idx',
      table_name
    );
  end loop;
end
$tenant_constraints$;

-- Restricciones que antes eran globales ahora son únicas dentro de una escuela.
alter table public.config_cuotas_servicio drop constraint if exists config_cuotas_servicio_pkey;
alter table public.config_cuotas_servicio
  add constraint config_cuotas_servicio_pkey primary key (tenant_id, servicio);

alter table public.mensajes_acreditacion drop constraint if exists mensajes_acreditacion_tipo_key;
alter table public.mensajes_acreditacion
  add constraint mensajes_acreditacion_tenant_tipo_key unique (tenant_id, tipo);

alter table public.acreditaciones_alumnos drop constraint if exists acreditaciones_alumnos_curp_key;
alter table public.acreditaciones_alumnos
  add constraint acreditaciones_alumnos_tenant_curp_key unique (tenant_id, curp);

alter table public.profiles drop constraint if exists profiles_curp_key;
alter table public.profiles
  add constraint profiles_tenant_curp_key unique (tenant_id, curp);

do $one_per_tenant$
begin
  if not exists (select 1 from pg_constraint where conname = 'configuracion_sistema_tenant_key') then
    alter table public.configuracion_sistema
      add constraint configuracion_sistema_tenant_key unique (tenant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'config_credenciales_tenant_key') then
    alter table public.config_credenciales
      add constraint config_credenciales_tenant_key unique (tenant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pago_de_servicios_tenant_key') then
    alter table public.pago_de_servicios
      add constraint pago_de_servicios_tenant_key unique (tenant_id);
  end if;
end
$one_per_tenant$;

-- Estado de servicio administrado por el superduperuser.
alter table public.pago_de_servicios
  add column if not exists duracion_dias integer not null default 30,
  add column if not exists ia_habilitada boolean not null default true,
  add column if not exists bloquear_acceso_usuarios boolean not null default false,
  add column if not exists mensaje_bloqueo text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

do $service_checks$
begin
  if not exists (select 1 from pg_constraint where conname = 'pago_de_servicios_duracion_check') then
    alter table public.pago_de_servicios
      add constraint pago_de_servicios_duracion_check
      check (duracion_dias between 1 and 3660);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pago_de_servicios_estado_check') then
    alter table public.pago_de_servicios
      add constraint pago_de_servicios_estado_check
      check (estado in ('SI', 'NO'));
  end if;
end
$service_checks$;

-- Inicializar relación de propietario y acceso de plataforma con el superuser existente.
update public.tenants t
set initial_superuser_id = p.id,
    created_by = p.id,
    updated_at = now()
from (
  select id
  from public.profiles
  where rol = 'superuser' and tenant_id = (select id from public.tenants where slug = 'xochitlan')
  order by created_at
  limit 1
) p
where t.slug = 'xochitlan';

insert into public.platform_admins(user_id)
select initial_superuser_id from public.tenants
where slug = 'xochitlan' and initial_superuser_id is not null
on conflict (user_id) do update set activo = true;

insert into public.tenant_domains(tenant_id, hostname, es_principal, estado, verificado_at)
select
  c.tenant_id,
  coalesce(private.normalize_hostname(c.url_plataforma), 'plataforma-estudiantil.vercel.app'),
  true,
  'verificado',
  now()
from public.configuracion_sistema c
where c.tenant_id = (select id from public.tenants where slug = 'xochitlan')
on conflict ((lower(hostname))) do update
set tenant_id = excluded.tenant_id,
    es_principal = true,
    estado = 'verificado',
    verificado_at = coalesce(public.tenant_domains.verificado_at, now()),
    updated_at = now();

insert into public.tenant_provisioning(tenant_id, estado, initial_superuser_id, created_by)
select id, 'ready', initial_superuser_id, created_by
from public.tenants
where slug = 'xochitlan'
  and not exists (
    select 1 from public.tenant_provisioning tp where tp.tenant_id = public.tenants.id
  );

-- Guardar la contraseña de aplicación SMTP existente en Vault y vaciar el texto plano.
do $smtp_migration$
declare
  cfg record;
  secret_id uuid;
  secret_name text;
begin
  for cfg in
    select tenant_id, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_name
    from public.configuracion_sistema
    where smtp_user is not null
  loop
    secret_id := null;
    secret_name := 'tenant_smtp_' || cfg.tenant_id::text;

    if nullif(cfg.smtp_password, '') is not null then
      select id into secret_id from vault.secrets where name = secret_name limit 1;
      if secret_id is null then
        select vault.create_secret(cfg.smtp_password, secret_name, 'SMTP app password per tenant')
          into secret_id;
      else
        perform vault.update_secret(secret_id, cfg.smtp_password);
      end if;
    end if;

    insert into public.tenant_smtp_settings(
      tenant_id, smtp_host, smtp_port, smtp_user,
      smtp_password_secret_id, smtp_from_name, activo
    ) values (
      cfg.tenant_id,
      coalesce(nullif(cfg.smtp_host, ''), 'smtp.gmail.com'),
      coalesce(cfg.smtp_port, 465),
      cfg.smtp_user,
      secret_id,
      cfg.smtp_from_name,
      true
    )
    on conflict (tenant_id) do update set
      smtp_host = excluded.smtp_host,
      smtp_port = excluded.smtp_port,
      smtp_user = excluded.smtp_user,
      smtp_password_secret_id = coalesce(excluded.smtp_password_secret_id, public.tenant_smtp_settings.smtp_password_secret_id),
      smtp_from_name = excluded.smtp_from_name,
      updated_at = now();
  end loop;

  update public.configuracion_sistema
  set smtp_password = null
  where smtp_password is not null;
end
$smtp_migration$;

-- Funciones de contexto para RLS.
create or replace function private.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1;
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = (select auth.uid()) and pa.activo
  );
$$;

create or replace function private.has_tenant_role(target_tenant_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.tenant_id = target_tenant_id
      and p.rol::text = any(allowed_roles)
      and p.estatus = 'activo'
  );
$$;

revoke all on function private.current_tenant_id() from public;
revoke all on function private.is_platform_admin() from public;
revoke all on function private.has_tenant_role(uuid, text[]) from public;
grant usage on schema private to anon, authenticated, service_role;
grant execute on function private.current_tenant_id() to anon, authenticated, service_role;
grant execute on function private.is_platform_admin() to authenticated, service_role;
grant execute on function private.has_tenant_role(uuid, text[]) to authenticated, service_role;

-- Completar tenant_id desde la sesión y volverlo inmutable.
create or replace function private.enforce_tenant_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.tenant_id is not null
     and new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id is immutable';
  end if;

  if new.tenant_id is null then
    new.tenant_id := private.current_tenant_id();
  end if;

  if new.tenant_id is null and tg_table_name <> 'profiles' then
    raise exception 'tenant_id is required for %.%', tg_table_schema, tg_table_name;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_tenant_id() from public, anon, authenticated;

do $tenant_triggers$
declare
  table_name text;
  tenant_tables constant text[] := array[
    'abonos_pago', 'acreditaciones_alumnos', 'agrupaciones_profesor',
    'ai_alumno_daily_messages', 'ai_session_categories', 'ai_daily_web_searches',
    'ai_red_list_alerts', 'ai_token_usage', 'ai_usage_log', 'alumno_chat_history',
    'asignaciones_profesor', 'aspirantes', 'auditoria', 'carreras',
    'config_credenciales', 'config_cuotas_servicio', 'configuracion_sistema',
    'credenciales_autorizadas', 'ejercicios', 'fechas_evaluacion', 'grados',
    'grupo_materias', 'grupos', 'inscripciones_alumno', 'material_apoyo',
    'materias', 'mensajes_acreditacion', 'mensajes_clases',
    'mensajes_clases_vistos', 'mensajes_contacto', 'mensajes_internos',
    'mensajes_vistos', 'niveles', 'notificaciones', 'pago_de_servicios',
    'pagos_alumno', 'plan_pagos', 'profesor_chat_history', 'profiles', 'recursos',
    'resources', 'resultados_ejercicios', 'slides', 'temas', 'unidades',
    'video_progreso_alumno'
  ];
begin
  foreach table_name in array tenant_tables loop
    execute format('drop trigger if exists enforce_tenant_id on public.%I', table_name);
    execute format(
      'create trigger enforce_tenant_id before insert or update on public.%I for each row execute function private.enforce_tenant_id()',
      table_name
    );
  end loop;
end
$tenant_triggers$;

-- El trigger de Auth sólo confía en app_metadata, nunca en user_metadata para autorización.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_role text;
  safe_tenant_id uuid;
begin
  safe_role := case
    when new.raw_app_meta_data->>'role' in ('superuser', 'admin', 'profesor', 'alumno')
      then new.raw_app_meta_data->>'role'
    else 'alumno'
  end;

  begin
    safe_tenant_id := nullif(new.raw_app_meta_data->>'tenant_id', '')::uuid;
  exception when invalid_text_representation then
    safe_tenant_id := null;
  end;

  insert into public.profiles(
    id, email, nombre, apellidos, curp, rol, estatus,
    matricula, numero_empleado, tenant_id, password_plain
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'apellidos', ''),
    coalesce(new.raw_user_meta_data->>'curp', ''),
    safe_role,
    case when safe_tenant_id is null then 'inactivo' else 'activo' end,
    coalesce(new.raw_user_meta_data->>'matricula', ''),
    coalesce(new.raw_user_meta_data->>'numero_empleado', ''),
    safe_tenant_id,
    null
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Una política RESTRICTIVE impide cruces de tenant aunque sobreviva una política permisiva antigua.
do $tenant_rls$
declare
  table_name text;
  tenant_tables constant text[] := array[
    'abonos_pago', 'acreditaciones_alumnos', 'agrupaciones_profesor',
    'ai_alumno_daily_messages', 'ai_session_categories', 'ai_daily_web_searches',
    'ai_red_list_alerts', 'ai_token_usage', 'ai_usage_log', 'alumno_chat_history',
    'asignaciones_profesor', 'aspirantes', 'auditoria', 'carreras',
    'config_credenciales', 'config_cuotas_servicio', 'configuracion_sistema',
    'credenciales_autorizadas', 'ejercicios', 'fechas_evaluacion', 'grados',
    'grupo_materias', 'grupos', 'inscripciones_alumno', 'material_apoyo',
    'materias', 'mensajes_acreditacion', 'mensajes_clases',
    'mensajes_clases_vistos', 'mensajes_contacto', 'mensajes_internos',
    'mensajes_vistos', 'niveles', 'notificaciones', 'pago_de_servicios',
    'pagos_alumno', 'plan_pagos', 'profesor_chat_history', 'recursos', 'resources',
    'resultados_ejercicios', 'slides', 'temas', 'unidades', 'video_progreso_alumno'
  ];
begin
  foreach table_name in array tenant_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists tenant_boundary on public.%I', table_name);
    execute format(
      'create policy tenant_boundary on public.%I as restrictive for all to public using (tenant_id = (select private.current_tenant_id())) with check (tenant_id = (select private.current_tenant_id()))',
      table_name
    );
    execute format('drop policy if exists tenant_admin_manage on public.%I', table_name);
    execute format(
      'create policy tenant_admin_manage on public.%I for all to authenticated using ((select private.has_tenant_role(tenant_id, array[''superuser'',''admin'']::text[]))) with check ((select private.has_tenant_role(tenant_id, array[''superuser'',''admin'']::text[])))',
      table_name
    );
  end loop;

  alter table public.profiles enable row level security;
  drop policy if exists tenant_boundary on public.profiles;
  create policy tenant_boundary on public.profiles as restrictive for all to public
    using (
      tenant_id = (select private.current_tenant_id())
      or id = (select auth.uid())
    )
    with check (
      tenant_id = (select private.current_tenant_id())
      or id = (select auth.uid())
    );
  drop policy if exists tenant_admin_manage on public.profiles;
  create policy tenant_admin_manage on public.profiles for all to authenticated
    using ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])))
    with check ((select private.has_tenant_role(tenant_id, array['superuser','admin']::text[])));
end
$tenant_rls$;

-- RLS de las tablas de plataforma y configuración sensible.
alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.platform_admins enable row level security;
alter table public.tenant_provisioning enable row level security;
alter table public.platform_audit enable row level security;
alter table public.tenant_smtp_settings enable row level security;

drop policy if exists tenant_members_read_tenant on public.tenants;
create policy tenant_members_read_tenant on public.tenants for select to authenticated
using (id = (select private.current_tenant_id()));

drop policy if exists tenant_members_read_domains on public.tenant_domains;
create policy tenant_members_read_domains on public.tenant_domains for select to authenticated
using (tenant_id = (select private.current_tenant_id()));

drop policy if exists platform_admin_reads_self on public.platform_admins;
create policy platform_admin_reads_self on public.platform_admins for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.tenant_provisioning, public.platform_audit, public.tenant_smtp_settings
  from anon, authenticated;
grant select on public.tenants, public.tenant_domains, public.platform_admins to authenticated;
grant select, insert, update, delete on public.tenants, public.tenant_domains,
  public.platform_admins, public.tenant_provisioning, public.platform_audit,
  public.tenant_smtp_settings to service_role;

-- RPC exclusivamente para el backend con service_role.
create or replace function public.get_tenant_smtp_for_service(p_tenant_id uuid)
returns table (
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_password text,
  smtp_from_name text,
  activo boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.smtp_host,
    s.smtp_port,
    s.smtp_user,
    ds.decrypted_secret,
    s.smtp_from_name,
    s.activo
  from public.tenant_smtp_settings s
  left join vault.decrypted_secrets ds on ds.id = s.smtp_password_secret_id
  where s.tenant_id = p_tenant_id;
$$;

create or replace function public.set_tenant_smtp_for_service(
  p_tenant_id uuid,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_user text,
  p_smtp_password text,
  p_smtp_from_name text,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_id uuid;
  secret_name text := 'tenant_smtp_' || p_tenant_id::text;
begin
  select smtp_password_secret_id into secret_id
  from public.tenant_smtp_settings
  where tenant_id = p_tenant_id;

  if nullif(p_smtp_password, '') is not null then
    if secret_id is null then
      select id into secret_id from vault.secrets where name = secret_name limit 1;
    end if;
    if secret_id is null then
      select vault.create_secret(p_smtp_password, secret_name, 'SMTP app password per tenant')
        into secret_id;
    else
      perform vault.update_secret(secret_id, p_smtp_password);
    end if;
  end if;

  insert into public.tenant_smtp_settings(
    tenant_id, smtp_host, smtp_port, smtp_user,
    smtp_password_secret_id, smtp_from_name, activo, updated_by
  ) values (
    p_tenant_id,
    coalesce(nullif(p_smtp_host, ''), 'smtp.gmail.com'),
    coalesce(p_smtp_port, 465),
    nullif(p_smtp_user, ''),
    secret_id,
    nullif(p_smtp_from_name, ''),
    true,
    p_updated_by
  )
  on conflict (tenant_id) do update set
    smtp_host = excluded.smtp_host,
    smtp_port = excluded.smtp_port,
    smtp_user = excluded.smtp_user,
    smtp_password_secret_id = coalesce(excluded.smtp_password_secret_id, public.tenant_smtp_settings.smtp_password_secret_id),
    smtp_from_name = excluded.smtp_from_name,
    activo = true,
    updated_at = now(),
    updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.get_tenant_smtp_for_service(uuid) from public, anon, authenticated;
revoke all on function public.set_tenant_smtp_for_service(uuid, text, integer, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.get_tenant_smtp_for_service(uuid) to service_role;
grant execute on function public.set_tenant_smtp_for_service(uuid, text, integer, text, text, text, uuid) to service_role;

alter view public.ai_category_summary set (security_invoker = true);
alter view public.vista_alumnos_inscritos set (security_invoker = true);

insert into public.platform_audit(actor_user_id, tenant_id, accion, detalles)
select
  created_by,
  id,
  'tenant_migrated',
  jsonb_build_object('slug', slug, 'source', 'single_tenant_backfill')
from public.tenants
where slug = 'xochitlan';
