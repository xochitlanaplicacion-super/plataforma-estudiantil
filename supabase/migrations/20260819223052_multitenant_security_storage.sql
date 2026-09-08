-- Barreras funcionales por tenant, políticas de contenido y Storage tenantizado.

-- Sincronizar claims protegidos de usuarios históricos.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) ||
  jsonb_build_object('tenant_id', p.tenant_id::text, 'role', p.rol::text)
from public.profiles p
where p.id = u.id and p.tenant_id is not null;

-- Las contraseñas nunca deben persistirse en una tabla de aplicación.
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
    matricula, numero_empleado, tenant_id
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
    safe_tenant_id
  ) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

update public.profiles set password_plain = null where password_plain is not null;
alter table public.profiles drop column if exists password_plain;

-- Una política permisiva de lectura para miembros del mismo tenant. La política
-- RESTRICTIVE tenant_boundary sigue siendo la barrera final.
do $member_read$
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
    execute format('drop policy if exists tenant_member_read on public.%I', table_name);
    execute format(
      'create policy tenant_member_read on public.%I for select to authenticated using (tenant_id = (select private.current_tenant_id()))',
      table_name
    );
  end loop;
end
$member_read$;

-- Los profesores conservan la gestión académica que ya existía, pero sólo en
-- su institución gracias a tenant_boundary.
do $professor_content$
declare
  table_name text;
  content_tables constant text[] := array[
    'agrupaciones_profesor', 'ejercicios', 'fechas_evaluacion', 'material_apoyo',
    'recursos', 'resources', 'resultados_ejercicios', 'slides', 'temas', 'unidades'
  ];
begin
  foreach table_name in array content_tables loop
    execute format('drop policy if exists tenant_professor_manage on public.%I', table_name);
    execute format(
      'create policy tenant_professor_manage on public.%I for all to authenticated using ((select private.has_tenant_role(tenant_id, array[''profesor'']::text[]))) with check ((select private.has_tenant_role(tenant_id, array[''profesor'']::text[])))',
      table_name
    );
  end loop;
end
$professor_content$;

drop policy if exists tenant_member_insert_usage on public.ai_token_usage;
create policy tenant_member_insert_usage on public.ai_token_usage for insert to authenticated
with check (tenant_id = (select private.current_tenant_id()) and user_id = (select auth.uid()));

-- Reglas de Storage: el primer segmento siempre es el tenant inmutable.
create or replace function private.can_access_storage_object(
  target_bucket text,
  object_name text,
  mutation boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
  tenant uuid := private.current_tenant_id();
begin
  if tenant is null or parts[1] is distinct from tenant::text then return false; end if;
  if not mutation then return true; end if;

  if target_bucket = 'avatars' then
    return parts[3] = (select auth.uid())::text
      or private.has_tenant_role(tenant, array['superuser','admin']::text[]);
  elsif target_bucket = 'entregas-alumnos' then
    return parts[3] = (select auth.uid())::text
      or private.has_tenant_role(tenant, array['superuser','admin','profesor']::text[]);
  elsif target_bucket in ('logos-institucion','programas-archivos','credenciales-watermark','credenciales-reverso') then
    return private.has_tenant_role(tenant, array['superuser','admin']::text[]);
  elsif target_bucket in ('material-apoyo','diapositivas-assets','recursos-educativos') then
    return private.has_tenant_role(tenant, array['superuser','admin','profesor']::text[]);
  end if;
  return false;
end;
$$;
revoke all on function private.can_access_storage_object(text, text, boolean) from public;
grant execute on function private.can_access_storage_object(text, text, boolean) to authenticated, service_role;

drop policy if exists tenant_storage_select on storage.objects;
create policy tenant_storage_select on storage.objects for select to authenticated
using ((select private.can_access_storage_object(bucket_id, name, false)));

drop policy if exists tenant_storage_insert on storage.objects;
create policy tenant_storage_insert on storage.objects for insert to authenticated
with check ((select private.can_access_storage_object(bucket_id, name, true)));

drop policy if exists tenant_storage_update on storage.objects;
create policy tenant_storage_update on storage.objects for update to authenticated
using ((select private.can_access_storage_object(bucket_id, name, true)))
with check ((select private.can_access_storage_object(bucket_id, name, true)));

drop policy if exists tenant_storage_delete on storage.objects;
create policy tenant_storage_delete on storage.objects for delete to authenticated
using ((select private.can_access_storage_object(bucket_id, name, true)));

-- Cambio de dominio principal atómico: no toca datos académicos.
create or replace function public.set_primary_tenant_domain_for_service(
  p_tenant_id uuid,
  p_domain_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_hostname text;
begin
  select hostname into selected_hostname
  from public.tenant_domains
  where id = p_domain_id and tenant_id = p_tenant_id
  for update;
  if selected_hostname is null then raise exception 'Dominio no encontrado'; end if;

  update public.tenant_domains set es_principal = false, updated_at = now()
  where tenant_id = p_tenant_id and es_principal;
  update public.tenant_domains
  set es_principal = true, estado = 'verificado', verificado_at = coalesce(verificado_at, now()), updated_at = now()
  where id = p_domain_id and tenant_id = p_tenant_id;
  update public.configuracion_sistema
  set url_plataforma = 'https://' || selected_hostname, updated_at = now()
  where tenant_id = p_tenant_id;
  return selected_hostname;
end;
$$;
revoke all on function public.set_primary_tenant_domain_for_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_primary_tenant_domain_for_service(uuid, uuid) to service_role;

-- Corregir la firma de lectura SMTP para que no haya columnas ambiguas.
drop function if exists public.get_tenant_smtp_for_service(uuid);
create function public.get_tenant_smtp_for_service(p_tenant_id uuid)
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
  select s.smtp_host, s.smtp_port, s.smtp_user, ds.decrypted_secret,
         s.smtp_from_name, s.activo
  from public.tenant_smtp_settings s
  left join vault.decrypted_secrets ds on ds.id = s.smtp_password_secret_id
  where s.tenant_id = p_tenant_id;
$$;
revoke all on function public.get_tenant_smtp_for_service(uuid) from public, anon, authenticated;
grant execute on function public.get_tenant_smtp_for_service(uuid) to service_role;
