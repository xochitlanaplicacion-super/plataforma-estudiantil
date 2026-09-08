-- Una encuesta que cambia de audiencia o grupo no debe conservar votos del destino anterior.
create or replace function private.reset_encuesta_votes_on_audience_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.audiencia is distinct from old.audiencia
     or new.grupo_id is distinct from old.grupo_id then
    delete from public.encuesta_votos
    where encuesta_id = old.id and tenant_id = old.tenant_id;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_encuesta_votes_on_audience_change on public.encuestas;
create trigger reset_encuesta_votes_on_audience_change
before update of audiencia, grupo_id on public.encuestas
for each row
execute function private.reset_encuesta_votes_on_audience_change();

revoke all on function private.reset_encuesta_votes_on_audience_change() from public, anon, authenticated;
grant execute on function private.reset_encuesta_votes_on_audience_change() to service_role;
