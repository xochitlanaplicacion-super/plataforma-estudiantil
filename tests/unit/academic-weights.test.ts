import { describe, expect, it } from 'vitest';
import { effectiveWeight, isExactHundred, redistributeWeights, sumWeights } from '@/lib/academic-grading/weights';

describe('ponderaciones académicas porcentuales', () => {
  it.each([
    [[60, 40], 100],
    [[33.3333, 33.3333, 33.3334], 100],
    [[25.125, 24.875], 50],
    [[], 0],
  ] as const)('suma %j con exactitud de cuatro decimales', (weights, expected) => {
    expect(sumWeights(weights)).toBe(expected);
  });

  it('redistribuye proporcionalmente y resuelve el residuo por orden estable', () => {
    expect(redistributeWeights([1, 1, 1])).toEqual([33.3334, 33.3333, 33.3333]);
    expect(redistributeWeights([20, 30])).toEqual([40, 60]);
  });

  it('distribuye por igual un total cero y conserva exactamente 100', () => {
    const result = redistributeWeights([0, 0, 0]);
    expect(result).toEqual([33.3334, 33.3333, 33.3333]);
    expect(isExactHundred(result)).toBe(true);
  });

  it('es idempotente una vez normalizado', () => {
    const first = redistributeWeights([3.7, 5.2, 8.1, 2]);
    expect(redistributeWeights(first)).toEqual(first);
    expect(sumWeights(first)).toBe(100);
  });

  it('calcula el impacto efectivo sin confundir porcentaje con nota', () => {
    expect(effectiveWeight(40, 25)).toBe(10);
    expect(effectiveWeight(33.3333, 33.3333)).toBe(11.1111);
  });

  it.each([[-1], [100.0001], [Number.NaN], [Number.POSITIVE_INFINITY], [1.00001]])(
    'rechaza un peso fuera del contrato: %j',
    (weight) => expect(() => sumWeights([weight])).toThrow(RangeError),
  );
});
