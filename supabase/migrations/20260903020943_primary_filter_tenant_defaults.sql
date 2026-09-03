create or replace function public.initialize_filter_tenant_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_features(tenant_id) values (new.id)
    on conflict (tenant_id) do nothing;
  insert into public.filter_alert_settings(tenant_id) values (new.id)
    on conflict (tenant_id) do nothing;
  return new;
end;
$$;

revoke all on function public.initialize_filter_tenant_defaults() from public, anon, authenticated;

drop trigger if exists initialize_filter_tenant_defaults on public.tenants;
create trigger initialize_filter_tenant_defaults
after insert on public.tenants
for each row execute function public.initialize_filter_tenant_defaults();
