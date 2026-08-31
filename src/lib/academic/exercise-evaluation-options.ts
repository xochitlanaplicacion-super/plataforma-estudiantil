export interface ExerciseEvaluationSchemeOption {
  id: string;
  asignacion_profesor_id: string;
  periodo_evaluacion_id: string;
  estado: string;
  version: number;
}

/**
 * Devuelve una sola versión por periodo. La publicada siempre prevalece sobre
 * el borrador que el profesor pueda estar editando en paralelo.
 */
export function selectPublishedEvaluationSchemes<T extends ExerciseEvaluationSchemeOption>(
  schemes: T[],
  assignmentId: string,
): T[] {
  const assignmentSchemes = schemes.filter(
    (scheme) => scheme.asignacion_profesor_id === assignmentId,
  );
  const periodIds = [...new Set(
    assignmentSchemes.map((scheme) => scheme.periodo_evaluacion_id),
  )];

  return periodIds.map((periodId) => assignmentSchemes
    .filter((scheme) => scheme.periodo_evaluacion_id === periodId)
    .sort((left, right) => {
      if (left.estado === 'activo' && right.estado !== 'activo') return -1;
      if (right.estado === 'activo' && left.estado !== 'activo') return 1;
      return right.version - left.version;
    })[0]);
}
