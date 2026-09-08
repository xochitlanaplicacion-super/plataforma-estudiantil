-- Permite al servicio global reemplazar un hostname en su misma fila.
-- La identidad del tenant permanece estable y los datos académicos no se reescriben.

create or replace function public.replace_tenant_domain_for_service(
  p_tenant_id uuid,
  p_domain_id uuid,
  p_hostname text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_hostname text;
  saved_hostname text;
  domain_is_primary boolean;
begin
  normalized_hostname := private.normalize_hostname(p_hostname);
  if normalized_hostname is null or normalized_hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
    raise exception 'Dominio inválido' using errcode = '22023';
  end if;

  select es_principal
    into domain_is_primary
  from public.tenant_domains
  where id = p_domain_id and tenant_id = p_tenant_id
  for update;

  if domain_is_primary is null then
    raise exception 'Dominio no encontrado' using errcode = 'P0002';
  end if;

  update public.tenant_domains
  set hostname = normalized_hostname,
      estado = 'verificado',
      verificado_at = now(),
      updated_at = now()
  where id = p_domain_id and tenant_id = p_tenant_id
  returning hostname into saved_hostname;

  if domain_is_primary then
    update public.configuracion_sistema
    set url_plataforma = 'https://' || saved_hostname,
        updated_at = now()
    where tenant_id = p_tenant_id;
  end if;

  return saved_hostname;
end;
$$;

revoke all on function public.replace_tenant_domain_for_service(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.replace_tenant_domain_for_service(uuid, uuid, text)
  to service_role;
