-- Keep existing identities, data, security checks, grants and function signatures.
-- Both current numeric columns support up to 99 points without a type rewrite.
set lock_timeout = '5s';
set statement_timeout = '60s';
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.registrar_participacion_docente_movil(uuid,uuid,uuid,uuid,numeric,text,uuid,uuid,uuid)'::regprocedure);
  if position('p_puntos > 5 then' in definition) = 0 then
    raise exception 'Unexpected participation function; inspect before changing its validation';
  end if;
  definition := replace(definition, 'p_puntos > 5 then', 'p_puntos > 99 or p_puntos is null then');
  execute definition;

  definition := pg_get_functiondef('public.registrar_captura_provisional_docente_movil(uuid,uuid,uuid,uuid,text,numeric,text,text,text,uuid,uuid,uuid)'::regprocedure);
  if position('p_valor<=0 or p_valor>5' in definition) = 0 then
    raise exception 'Unexpected provisional function; inspect before changing its validation';
  end if;
  definition := replace(definition, 'p_valor<=0 or p_valor>5', 'p_valor is null or p_valor<=0 or p_valor>99');
  execute definition;
end $migration$;

alter table public.capturas_provisionales_docente
  drop constraint capturas_provisionales_valor_check,
  add constraint capturas_provisionales_valor_check check (
    (tipo_captura = 'calificacion' and valor between 0 and 10)
    or (tipo_captura = 'participacion' and valor > 0 and valor <= 99)
    or (tipo_captura = 'participacion_resta' and valor > 0 and valor <= 100)
  );
reset lock_timeout;
reset statement_timeout;
