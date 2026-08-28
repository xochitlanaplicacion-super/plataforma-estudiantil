import type { DecimalInput } from './types';

export const INTERNAL_DECIMALS = 8;
export const INTERNAL_SCALE = 100_000_000n;
export const WEIGHT_DECIMALS = 4;
export const WEIGHT_SCALE = 10_000n;

export function parseFixed(
  input: DecimalInput,
  decimals: number,
  label: string,
): bigint {
  const value = typeof input === 'number' ? input.toString() : input.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new RangeError(`${label} debe ser un decimal finito.`);
  }
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  if (fraction.length > decimals) {
    throw new RangeError(`${label} admite como máximo ${decimals} decimales.`);
  }
  const units = BigInt(whole) * (10n ** BigInt(decimals))
    + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals));
  return negative ? -units : units;
}

export function roundDivideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('El denominador debe ser positivo.');
  if (numerator < 0n) throw new RangeError('El motor académico no acepta valores negativos.');
  return (numerator + denominator / 2n) / denominator;
}

export function rescaleHalfUp(value: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (toDecimals >= fromDecimals) return value * (10n ** BigInt(toDecimals - fromDecimals));
  return roundDivideHalfUp(value, 10n ** BigInt(fromDecimals - toDecimals));
}

export function formatFixed(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  if (decimals === 0) return `${negative ? '-' : ''}${absolute}`;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function formatInternal(value: bigint, outputDecimals = 4): string {
  return formatFixed(rescaleHalfUp(value, INTERNAL_DECIMALS, outputDecimals), outputDecimals);
}

export function formatWeight(value: bigint): string {
  return formatFixed(value, WEIGHT_DECIMALS);
}
