-- El operador global de la plataforma no es el superusuario académico de un tenant.
-- Las identidades con app_metadata.role = platform_admin se registran únicamente
-- en auth.users + platform_admins y no reciben un perfil escolar.

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
  if new.raw_app_meta_data->>'role' = 'platform_admin' then
    return new;
  end if;

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

-- Revoca la elevación accidental de cualquier director inicial de escuela.
delete from public.platform_admins pa
where exists (
  select 1
  from public.tenants t
  where t.initial_superuser_id = pa.user_id
);
