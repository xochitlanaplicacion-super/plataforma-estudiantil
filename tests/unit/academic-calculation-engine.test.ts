import { describe, expect, it } from 'vitest';

import goldenCases from '../fixtures/academic-grading-step7-golden.json';
import {
  calculateAcademicGrade,
  isDeterministicGradingEnabled,
  isLegacyEquivalent,
  type AcademicCalculationInput,
} from '@/lib/academic-grading/calculation';

describe('motor académico determinista 0-10', () => {
  for (const fixture of goldenCases) {
    it(`caso dorado: ${fixture.name}`, () => {
      const result = calculateAcademicGrade(fixture.input as AcademicCalculationInput);
      expect(result).toMatchObject({
        engineVersion: 'academic-deterministic-v1',
        scale: '0-10',
        exactGrade: fixture.expected.exactGrade,
        displayGrade: fixture.expected.displayGrade,
        complete: fixture.expected.complete,
      });
      expect(result.criteria.map((criterion) => criterion.contributionToTotal))
        .toEqual(fixture.expected.contributions);
      const sum = result.criteria.reduce(
        (total, criterion) => total + Number(criterion.contributionToTotal),
        0,
      );
      expect(sum.toFixed(4)).toBe(result.exactGrade);
      expect(Number(result.exactGrade)).toBeGreaterThanOrEqual(0);
      expect(Number(result.exactGrade)).toBeLessThanOrEqual(10);
    });
  }

  it.each([
    ['0.0000', '0.0000'], ['50.0000', '5.0000'], ['100.0000', '10.0000'],
  ])('comprueba equivalencia heredada %s → %s', (legacy, canonical) => {
    expect(isLegacyEquivalent(legacy, canonical)).toBe(true);
  });

  it('rechaza notas fuera de 0-10 y ratios fuera de 0-1', () => {
    for (const [scale, value] of [['0-10', '-0.0001'], ['0-10', '10.0001'], ['0-1', '1.0001']] as const) {
      const invalid = structuredClone(goldenCases[7].input);
      invalid.criteria[0].sources[0] = { ...invalid.criteria[0].sources[0], scale, value };
      expect(() => calculateAcademicGrade(invalid as AcademicCalculationInput)).toThrow(RangeError);
    }
  });

  it('es independiente del orden de criterios, subcriterios y fuentes', () => {
    const original = goldenCases[2].input;
    const reversed = structuredClone(original);
    reversed.criteria.reverse();
    reversed.criteria[0].subcriteria.reverse();
    for (const subcriterion of reversed.criteria[0].subcriteria) subcriterion.sources.reverse();
    expect(calculateAcademicGrade(reversed as AcademicCalculationInput))
      .toEqual(calculateAcademicGrade(original as AcademicCalculationInput));
  });

  it('mantiene invariantes en una malla determinista de notas y pesos', () => {
    for (let gradeA = 0; gradeA <= 10; gradeA += 1) {
      for (let weightA = 0; weightA <= 100; weightA += 5) {
        const input: AcademicCalculationInput = {
          periodState: 'activo', displayDecimals: 2, roundingMode: 'half_up',
          criteria: [
            { id: 'a', label: 'A', type: 'directo', weight: weightA, order: 1, subcriteria: [], sources: [{ id: 'a1', state: 'calificado', scale: '0-10', value: gradeA }] },
            { id: 'b', label: 'B', type: 'directo', weight: 100 - weightA, order: 2, subcriteria: [], sources: [{ id: 'b1', state: 'calificado', scale: '0-10', value: 10 - gradeA }] },
          ],
        };
        const result = calculateAcademicGrade(input);
        expect(Number(result.exactGrade)).toBeGreaterThanOrEqual(0);
        expect(Number(result.exactGrade)).toBeLessThanOrEqual(10);
        expect(result.criteria.reduce((sum, item) => sum + Number(item.contributionToTotal), 0).toFixed(4))
          .toBe(result.exactGrade);
      }
    }
  });

  it('conserva cero cuando todas las fuentes computables valen cero', () => {
    const input = structuredClone(goldenCases[1].input);
    for (const source of input.criteria[0].sources) source.value = '0.00000000';
    const result = calculateAcademicGrade(input as AcademicCalculationInput);
    expect(result.exactGrade).toBe('0.0000');
    expect(result.criteria[0].contributionToTotal).toBe('0.0000');
  });

  it.each(['sin_capturar', 'pendiente', 'entregado', 'tardio'] as const)(
    'trata %s como faltante explícito y nunca como cero',
    (state) => {
      const input = structuredClone(goldenCases[7].input);
      input.criteria[0].sources[0] = {
        ...input.criteria[0].sources[0], state, value: null,
      };
      const result = calculateAcademicGrade(input as AcademicCalculationInput);
      expect(result.exactGrade).toBeNull();
      expect(result.complete).toBe(false);
      expect(result.warnings.map((warning) => warning.code)).toContain('PENDING_SOURCE');
    },
  );

  it('mantiene apagado el corte nuevo por defecto y permite rollback inmediato', () => {
    expect(isDeterministicGradingEnabled(undefined)).toBe(false);
    expect(isDeterministicGradingEnabled('false')).toBe(false);
    expect(isDeterministicGradingEnabled('true')).toBe(true);
  });
});
