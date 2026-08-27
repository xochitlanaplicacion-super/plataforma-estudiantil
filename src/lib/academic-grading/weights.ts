const DECIMAL_PLACES = 4;
const UNIT_SCALE = 10 ** DECIMAL_PLACES;
const HUNDRED_UNITS = 100 * UNIT_SCALE;

function toUnits(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError('Cada peso debe ser un número finito entre 0 y 100.');
  }

  const units = Math.round(value * UNIT_SCALE);
  if (Math.abs(value * UNIT_SCALE - units) > 1e-7) {
    throw new RangeError('Cada peso admite como máximo cuatro decimales.');
  }
  return units;
}

function fromUnits(units: number): number {
  return units / UNIT_SCALE;
}

/** Suma porcentajes con aritmética entera de cuatro decimales. */
export function sumWeights(weights: readonly number[]): number {
  return fromUnits(weights.reduce((sum, weight) => sum + toUnits(weight), 0));
}

/**
 * Redistribuye proporcionalmente a 100.0000%. El residuo se asigna por mayor
 * resto y, en empate, por índice original. Por ello es determinista e idempotente.
 */
export function redistributeWeights(weights: readonly number[]): number[] {
  if (weights.length === 0) return [];

  const source = weights.map(toUnits);
  const sourceTotal = source.reduce((sum, weight) => sum + weight, 0);
  if (sourceTotal === HUNDRED_UNITS) return source.map(fromUnits);

  const exactNumerators = sourceTotal === 0
    ? source.map(() => HUNDRED_UNITS)
    : source.map((weight) => weight * HUNDRED_UNITS);
  const denominator = sourceTotal === 0 ? source.length : sourceTotal;
  const allocated = exactNumerators.map((numerator) => Math.floor(numerator / denominator));
  const residue = HUNDRED_UNITS - allocated.reduce((sum, weight) => sum + weight, 0);

  const priority = exactNumerators
    .map((numerator, index) => ({ index, remainder: numerator % denominator }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (let index = 0; index < residue; index += 1) {
    allocated[priority[index].index] += 1;
  }

  return allocated.map(fromUnits);
}

/** Peso real de un subcriterio dentro del total institucional. */
export function effectiveWeight(criterionWeight: number, internalWeight: number): number {
  const product = toUnits(criterionWeight) * toUnits(internalWeight);
  return fromUnits(Math.round(product / HUNDRED_UNITS));
}

export function isExactHundred(weights: readonly number[]): boolean {
  return weights.reduce((sum, weight) => sum + toUnits(weight), 0) === HUNDRED_UNITS;
}
