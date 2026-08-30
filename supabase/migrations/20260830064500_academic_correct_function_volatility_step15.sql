-- Paso 15: alinear la volatilidad declarada del motor académico con las
-- expresiones STABLE que PostgreSQL usa dentro de sus recorridos JSON.
-- No cambia firmas, permisos, datos ni resultados numéricos.
set search_path = '';

alter function private.academic_evaluate_sources(jsonb, text, text, text)
  stable;
alter function private.calcular_calificacion_academica_paso7(jsonb)
  stable;
alter function public.calcular_calificacion_academica(jsonb)
  stable;

do $step15_volatility_guard$
begin
  if exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid in (
      'private.academic_evaluate_sources(jsonb,text,text,text)'::regprocedure,
      'private.calcular_calificacion_academica_paso7(jsonb)'::regprocedure,
      'public.calcular_calificacion_academica(jsonb)'::regprocedure
    )
      and p.provolatile <> 's'
  ) then
    raise exception
      'STEP15_VOLATILITY_GUARD: el motor académico debe ser STABLE';
  end if;
end
$step15_volatility_guard$;
