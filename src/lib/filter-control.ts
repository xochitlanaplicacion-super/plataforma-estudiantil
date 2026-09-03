export function normalizeFilterName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function splitRosterText(value: string) {
  return value.split(/\r?\n/).map((line) => line.replace(/^\s*\d+[.)-]?\s*/, '').trim()).filter((line) => line.length >= 2);
}

export const FILTER_REASONS = [
  { value: 'trafico', label: 'Tráfico' },
  { value: 'transporte', label: 'Problema de transporte' },
  { value: 'salud', label: 'Salud o consulta médica' },
  { value: 'familiar', label: 'Situación familiar' },
  { value: 'clima', label: 'Clima' },
  { value: 'documentacion', label: 'Trámite o documentación' },
  { value: 'otro', label: 'Otro' },
] as const;
