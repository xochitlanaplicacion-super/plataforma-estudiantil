-- La constancia del aviso recibido es opcional tanto en la captura manual
-- como en una salida finalizada desde un preregistro. La ruta pertenece al
-- depósito privado filtro-evidencias y la valida la acción de servidor.
alter table public.filter_early_departures
  add column if not exists notification_evidence_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'filter_early_notification_evidence_path_check'
      and conrelid = 'public.filter_early_departures'::regclass
  ) then
    alter table public.filter_early_departures
      add constraint filter_early_notification_evidence_path_check
      check (
        notification_evidence_path is null
        or length(btrim(notification_evidence_path)) between 3 and 1000
      ) not valid;
  end if;
end $$;

alter table public.filter_early_departures
  validate constraint filter_early_notification_evidence_path_check;
