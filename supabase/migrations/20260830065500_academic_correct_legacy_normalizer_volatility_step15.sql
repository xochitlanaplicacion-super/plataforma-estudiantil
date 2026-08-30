-- Paso 15: completar el saneamiento de volatilidad detectado por plpgsql_check.
-- La normalización conserva la misma firma, permisos, entrada y salida.
set search_path = '';

alter function private.normalize_legacy_attempt_history(jsonb)
  stable;

do $step15_legacy_volatility_guard$
begin
  if (
    select p.provolatile <> 's'
    from pg_catalog.pg_proc p
    where p.oid =
      'private.normalize_legacy_attempt_history(jsonb)'::regprocedure
  ) then
    raise exception
      'STEP15_VOLATILITY_GUARD: el normalizador heredado debe ser STABLE';
  end if;
end
$step15_legacy_volatility_guard$;
