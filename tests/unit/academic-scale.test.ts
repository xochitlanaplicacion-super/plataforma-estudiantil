import { describe, expect, it } from 'vitest';
import {
  GRADE_MAX,
  GRADE_MIN,
  assertGrade10,
  percentage100ToGrade10,
  roundGradeForDisplay,
} from '@/lib/academic-grading/scale';

describe('contrato canónico de escala 0–10', () => {
  it('mantiene límites técnicos inmutables', () => {
    expect(GRADE_MIN).toBe(0);
    expect(GRADE_MAX).toBe(10);
  });

  it.each([
    [0, 0],
    [50, 5],
    [85.5, 8.55],
    [100, 10],
  ])('convierte una sola vez %s/100 a %s/10', (percentage, grade) => {
    expect(percentage100ToGrade10(percentage)).toBe(grade);
  });

  it.each([-1, 100.0001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza porcentajes inválidos: %s',
    (value) => expect(() => percentage100ToGrade10(value)).toThrow(RangeError),
  );

  it.each([-0.0001, 10.0001, Number.NaN, Number.NEGATIVE_INFINITY])(
    'rechaza calificaciones inválidas: %s',
    (value) => expect(() => assertGrade10(value)).toThrow(RangeError),
  );

  it('separa el valor exacto del redondeo visual', () => {
    const exact = assertGrade10(8.56);
    expect(roundGradeForDisplay(exact, 1, 'half_up')).toBe(8.6);
    expect(roundGradeForDisplay(assertGrade10(8.55), 1, 'half_up')).toBe(8.6);
    expect(roundGradeForDisplay(exact, 1, 'truncate')).toBe(8.5);
    expect(exact).toBe(8.56);
  });
});
