-- Durable notification worker. No grades, uploads or existing records are changed.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function private.dispatch_kibo_push_tick() returns void
language plpgsql security definer set search_path='' as $$
declare endpoint text; credential text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='kibo_push_worker_url';
  select decrypted_secret into credential from vault.decrypted_secrets where name='kibo_push_worker_secret';
  if endpoint is null or credential is null then return; end if;
  perform net.http_post(url:=endpoint,
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),
    body:='{}'::jsonb,timeout_milliseconds:=30000);
end $$;
revoke all on function private.dispatch_kibo_push_tick() from public,anon,authenticated;

select cron.schedule('kibo-submission-push','* * * * *','select private.dispatch_kibo_push_tick();');
