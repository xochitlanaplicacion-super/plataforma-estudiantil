import { describe, expect, it } from 'vitest';

import {
  mapAcademicMutationError,
  shouldRetryAcademicMutation,
  toAcademicSaveState,
} from '@/lib/academic-grading/mutation-contracts';

describe('Paso 8: contrato estable de errores y reintentos', () => {
  it.each([
    ['PT400', 400, 'BAD_REQUEST'],
    ['PT401', 401, 'UNAUTHENTICATED'],
    ['PT403', 403, 'FORBIDDEN'],
    ['PT404', 404, 'NOT_FOUND'],
    ['PT409', 409, 'CONFLICT'],
    ['PT422', 422, 'UNPROCESSABLE'],
  ] as const)('mapea %s al estado HTTP %i', (sqlstate, status, code) => {
    expect(mapAcademicMutationError({ code: sqlstate, message: 'x' })).toEqual({
      code,
      httpStatus: status,
      message: 'x',
      retryable: false,
    });
  });

  it('expone el 409 como conflicto y no como error genérico', () => {
    expect(toAcademicSaveState({ code: 'PT409', message: 'Versión diferente' })).toEqual({
      status: 'conflict',
      code: 'CONFLICT',
      message: 'Versión diferente',
    });
  });

  it.each(['40001', '40P01', '55P03'])('sólo reintenta %s con clave idempotente', (code) => {
    expect(
      shouldRetryAcademicMutation(
        { code },
        { hasIdempotencyKey: true, attempt: 1, maxAttempts: 3 },
      ),
    ).toBe(true);
    expect(
      shouldRetryAcademicMutation(
        { code },
        { hasIdempotencyKey: false, attempt: 1, maxAttempts: 3 },
      ),
    ).toBe(false);
  });

  it('no reintenta validación, autorización, conflicto ni el último intento', () => {
    expect(
      shouldRetryAcademicMutation(
        { code: 'PT422' },
        { hasIdempotencyKey: true, attempt: 1 },
      ),
    ).toBe(false);
    expect(
      shouldRetryAcademicMutation(
        { code: '40001' },
        { hasIdempotencyKey: true, attempt: 3 },
      ),
    ).toBe(false);
  });
});
