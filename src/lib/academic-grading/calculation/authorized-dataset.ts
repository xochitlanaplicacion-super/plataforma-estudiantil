import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@/lib/database.types';

import { mapAcademicReadError, type AcademicReadResult } from '../secure-read-models';
import type {
  AcademicCalculationInput,
  CalculationCriterion,
  CalculationSource,
  CalculationSubcriterion,
} from './types';

const DEFAULT_ROW_LIMIT = 500;
const MAX_ROW_LIMIT = 1_000;
type BreakdownRow = Tables<'vista_desglose_calificacion'>;

export type AuthorizedCalculationDatasetResult = AcademicReadResult<AcademicCalculationInput>;

function required<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`El read model no devolvió ${label}.`);
  return value;
}

function mapSource(row: BreakdownRow): CalculationSource {
  const criterionId = required(row.criterio_evaluacion_id, 'criterio_evaluacion_id');
  return {
    id: row.fuente_id ?? [
      'participation', criterionId, row.subcriterio_evaluacion_id ?? 'parent',
    ].join(':'),
    state: required(row.estado, 'estado') as CalculationSource['state'],
    scale: required(row.escala_fuente, 'escala_fuente') as CalculationSource['scale'],
    value: row.valor_fuente,
    zeroDenominatorExcluded:
      row.tipo_fuente === 'participation'
      && row.estado === 'pendiente'
      && row.valor_fuente === null,
  };
}

/**
 * Convierte una sola respuesta RLS-safe en el dataset puro del motor. No
 * contiene nombre, correo, matrícula ni otro dato personal del alumno.
 */
export function rowsToCalculationInput(
  rows: readonly BreakdownRow[],
  options: Pick<AcademicCalculationInput, 'periodState' | 'displayDecimals' | 'roundingMode'>,
): AcademicCalculationInput {
  const criteria = new Map<string, CalculationCriterion>();
  for (const row of rows) {
    const criterionId = required(row.criterio_evaluacion_id, 'criterio_evaluacion_id');
    let criterion = criteria.get(criterionId);
    if (!criterion) {
      criterion = {
        id: criterionId,
        label: required(row.criterio_nombre, 'criterio_nombre'),
        type: required(row.criterio_tipo, 'criterio_tipo') as CalculationCriterion['type'],
        weight: required(row.criterio_peso, 'criterio_peso'),
        order: criteria.size + 1,
        sources: [],
        subcriteria: [],
      };
      criteria.set(criterionId, criterion);
    }
    const source = mapSource(row);
    if (row.subcriterio_evaluacion_id === null) {
      (criterion.sources as CalculationSource[]).push(source);
      continue;
    }
    let subcriterion = criterion.subcriteria.find(
      (item) => item.id === row.subcriterio_evaluacion_id,
    );
    if (!subcriterion) {
      subcriterion = {
        id: row.subcriterio_evaluacion_id,
        label: required(row.subcriterio_nombre, 'subcriterio_nombre'),
        type: required(row.subcriterio_tipo, 'subcriterio_tipo') as CalculationSubcriterion['type'],
        internalWeight: required(row.peso_interno, 'peso_interno'),
        order: criterion.subcriteria.length + 1,
        sources: [],
      };
      (criterion.subcriteria as CalculationSubcriterion[]).push(subcriterion);
    }
    (subcriterion.sources as CalculationSource[]).push(source);
  }
  return { ...options, criteria: [...criteria.values()] };
}

/**
 * Una sola consulta, filtrada por la vista security_invoker y acotada a
 * limit+1 para detectar truncamiento sin N+1 ni paginación OFFSET.
 */
export async function loadAuthorizedCalculationDataset(
  client: SupabaseClient<Database>,
  input: {
    assignmentId: string;
    enrollmentId: string;
    periodId: string;
    periodState: AcademicCalculationInput['periodState'];
    displayDecimals: AcademicCalculationInput['displayDecimals'];
    limit?: number;
  },
): Promise<AuthorizedCalculationDatasetResult> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_ROW_LIMIT, 1), MAX_ROW_LIMIT);
  const { data, error } = await client
    .from('vista_desglose_calificacion')
    .select('*')
    .eq('asignacion_profesor_id', input.assignmentId)
    .eq('inscripcion_alumno_id', input.enrollmentId)
    .eq('periodo_evaluacion_id', input.periodId)
    .order('criterio_evaluacion_id')
    .order('subcriterio_evaluacion_id')
    .order('fuente_id')
    .limit(limit + 1);

  if (error) return mapAcademicReadError(error);
  if ((data?.length ?? 0) > limit) {
    return {
      ok: false,
      status: 409,
      code: 'conflict',
      message: 'El desglose excede el límite seguro; aplica un alcance más específico.',
    };
  }
  try {
    return {
      ok: true,
      status: 200,
      data: rowsToCalculationInput(data ?? [], {
        periodState: input.periodState,
        displayDecimals: input.displayDecimals,
        roundingMode: 'half_up',
      }),
    };
  } catch {
    return {
      ok: false,
      status: 500,
      code: 'unexpected',
      message: 'El read model académico devolvió un contrato inválido.',
    };
  }
}
