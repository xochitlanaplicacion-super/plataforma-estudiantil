-- A teacher's active evaluation link is the source of truth for the mobile
-- grading catalogue. "publicado" controls student availability on the web and
-- must not hide a linked physical/descriptive task from its teacher.
do $migration$
declare
  definition text;
  previous_filter constant text :=
    $part$and e.tipo='actividad_descriptiva' and e.publicado and e.visible is distinct from false$part$;
  linked_filter constant text :=
    $part$and e.tipo='actividad_descriptiva' and e.visible is distinct from false$part$;
begin
  definition := pg_get_functiondef(
    'private.obtener_tareas_descriptivas_docente_movil(uuid)'::regprocedure
  );

  if position(previous_filter in definition) = 0 then
    raise exception
      'Descriptive mobile catalogue changed: review publication filter before applying';
  end if;

  definition := replace(definition, previous_filter, linked_filter);
  execute definition;
end
$migration$;
