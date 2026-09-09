-- Las consultas derivan la fecha institucional del reloj del servidor; por ello
-- se declaran VOLATILE explícitamente para que el planificador no las reutilice.
alter function public.obtener_asistencia_docente_movil_unificada(uuid) volatile;
alter function public.obtener_resumen_participacion_docente_movil_unificado(uuid) volatile;
alter function public.obtener_reporte_academico_docente_unificado(uuid) volatile;
