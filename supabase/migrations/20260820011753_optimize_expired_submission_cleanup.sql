-- El cron sólo consulta entregas que aún conservan un objeto en Storage.
-- El índice parcial evita recorrer resultados de ejercicios sin archivo.
create index if not exists idx_resultados_entregas_pendientes_caducidad
  on public.resultados_ejercicios (caduca_el)
  where archivo_path is not null and caduca_el is not null;
