-- Se aplica después de desplegar la interfaz jerárquica para mantener compatibilidad
-- durante el cambio de versión sin dejar endpoints antiguos disponibles.
drop function if exists public.crear_encuesta(
  text, text, text, uuid, text[], timestamptz
);
drop function if exists public.actualizar_encuesta(
  uuid, text, text, text, uuid, text[], timestamptz, boolean
);
