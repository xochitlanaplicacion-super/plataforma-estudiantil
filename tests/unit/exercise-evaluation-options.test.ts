import { describe, expect, it } from 'vitest';

import { selectPublishedEvaluationSchemes } from '@/lib/academic/exercise-evaluation-options';

describe('selector de esquemas para actividades', () => {
  it('mantiene seleccionable la versión activa mientras existe un borrador nuevo', () => {
    const result = selectPublishedEvaluationSchemes([
      {
        id: 'publicado', asignacion_profesor_id: 'ingles-a',
        periodo_evaluacion_id: 'periodo-1', estado: 'activo', version: 1,
      },
      {
        id: 'edicion', asignacion_profesor_id: 'ingles-a',
        periodo_evaluacion_id: 'periodo-1', estado: 'borrador', version: 2,
      },
      {
        id: 'otro-grupo', asignacion_profesor_id: 'ingles-b',
        periodo_evaluacion_id: 'periodo-1', estado: 'activo', version: 1,
      },
    ], 'ingles-a');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'publicado', estado: 'activo' });
  });

  it('expone el borrador más reciente sólo cuando todavía no existe publicado', () => {
    const result = selectPublishedEvaluationSchemes([
      {
        id: 'borrador-1', asignacion_profesor_id: 'ingles-a',
        periodo_evaluacion_id: 'periodo-1', estado: 'borrador', version: 1,
      },
      {
        id: 'borrador-2', asignacion_profesor_id: 'ingles-a',
        periodo_evaluacion_id: 'periodo-1', estado: 'borrador', version: 2,
      },
    ], 'ingles-a');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'borrador-2', version: 2 });
  });
});
