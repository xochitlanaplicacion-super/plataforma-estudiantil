export function resolveExerciseUnitId(
  temas: { unidad_id?: unknown } | Array<{ unidad_id?: unknown }> | null | undefined
) {
  const tema = Array.isArray(temas) ? temas[0] : temas;
  return typeof tema?.unidad_id === 'string' && tema.unidad_id ? tema.unidad_id : null;
}
