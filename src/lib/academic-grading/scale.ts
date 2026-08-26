/** Canonical, immutable technical bounds for every academic grade. */
export const GRADE_MIN = 0 as const;
export const GRADE_MAX = 10 as const;

export type Grade10 = number & { readonly __grade10: unique symbol };

export function assertGrade10(value: number): Grade10 {
  if (!Number.isFinite(value) || value < GRADE_MIN || value > GRADE_MAX) {
    throw new RangeError(`La calificación debe estar entre ${GRADE_MIN} y ${GRADE_MAX}.`);
  }

  return value as Grade10;
}

/**
 * The only authorized conversion at the legacy 0–100 boundary.
 * It must not be applied to an already normalized grade.
 */
export function percentage100ToGrade10(percentage: number): Grade10 {
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new RangeError('El porcentaje debe estar entre 0 y 100.');
  }

  return assertGrade10(percentage / 10);
}

export function roundGradeForDisplay(
  grade: Grade10,
  decimals: 0 | 1 | 2,
  mode: 'half_up' | 'truncate',
): number {
  const factor = 10 ** decimals;
  const adjusted = mode === 'truncate'
    ? Math.trunc(grade * factor) / factor
    : Math.round((grade + Number.EPSILON) * factor) / factor;

  return Math.min(GRADE_MAX, Math.max(GRADE_MIN, adjusted));
}
