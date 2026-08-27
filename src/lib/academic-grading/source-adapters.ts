import type { AcademicResultState, EvaluationSourceKind } from './contracts';
import { assertGrade10, percentage100ToGrade10, type Grade10 } from './scale';

const SCORELESS_STATES = new Set<AcademicResultState>([
  'sin_capturar', 'pendiente', 'entregado', 'tardio', 'no_entregado', 'justificado',
]);

export const ACADEMIC_RESULT_LABELS: Readonly<Record<AcademicResultState, string>> = {
  sin_capturar: 'Sin capturar',
  pendiente: 'Pendiente',
  entregado: 'Entregado',
  tardio: 'Entrega tardía',
  no_entregado: 'No entregado',
  justificado: 'Justificado',
  calificado: 'Calificado',
};

export interface CanonicalSourcePayload {
  sourceKind: EvaluationSourceKind;
  state: AcademicResultState;
  grade: Grade10 | null;
  observation: string | null;
}

export function assertStateAndGrade(
  state: AcademicResultState,
  grade: number | null,
): Grade10 | null {
  if (state === 'calificado') {
    if (grade === null) throw new RangeError('El estado calificado exige una nota 0-10.');
    return assertGrade10(grade);
  }
  if (!SCORELESS_STATES.has(state) || grade !== null) {
    throw new RangeError(`El estado ${state} no admite una nota numérica.`);
  }
  return null;
}

export function automaticExercise(
  percentage: number,
  observation: string | null = null,
): CanonicalSourcePayload {
  return {
    sourceKind: 'automaticExercise',
    state: 'calificado',
    grade: percentage100ToGrade10(percentage),
    observation,
  };
}

export function descriptiveSubmission(input: {
  submittedAt: Date;
  dueAt: Date | null;
  observation?: string | null;
}): CanonicalSourcePayload {
  return {
    sourceKind: 'descriptiveSubmission',
    state: input.dueAt && input.submittedAt > input.dueAt ? 'tardio' : 'entregado',
    grade: null,
    observation: input.observation ?? null,
  };
}

export function directCriterion(input: {
  state: AcademicResultState;
  grade: number | null;
  observation?: string | null;
}): CanonicalSourcePayload {
  return {
    sourceKind: 'directCriterion',
    state: input.state,
    grade: assertStateAndGrade(input.state, input.grade),
    observation: input.observation ?? null,
  };
}

export type ParticipationNormalization =
  | { mode: 'maximo_grupo'; groupMaximum: number; zeroDenominator: 'cero' | 'excluir' }
  | { mode: 'meta_fija'; target: number; zeroDenominator: 'cero' | 'excluir' };

export function participation(input: {
  points: number;
  normalization: ParticipationNormalization;
}): { sourceKind: 'participation'; points: number; denominator: number; ratio: number | null } {
  if (!Number.isFinite(input.points) || input.points < 0) {
    throw new RangeError('La participación acumulada no puede ser negativa.');
  }
  const denominator = input.normalization.mode === 'meta_fija'
    ? input.normalization.target
    : input.normalization.groupMaximum;
  if (!Number.isFinite(denominator) || denominator < 0) {
    throw new RangeError('El denominador de participación no puede ser negativo.');
  }
  if (denominator === 0) {
    return {
      sourceKind: 'participation', points: input.points, denominator,
      ratio: input.normalization.zeroDenominator === 'cero' ? 0 : null,
    };
  }
  return {
    sourceKind: 'participation', points: input.points, denominator,
    ratio: Math.min(1, Math.max(0, input.points / denominator)),
  };
}
