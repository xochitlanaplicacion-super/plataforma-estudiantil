import { describe, expect, it } from 'vitest';

import {
  mapAcademicReadError,
  neutralAcademicNotFound,
} from '@/lib/academic-grading/secure-read-models';

describe('contrato de lecturas académicas tenant-safe', () => {
  it('distingue sesión inválida, permiso y conflicto sin exponer SQL', () => {
    expect(mapAcademicReadError({ code: 'PGRST301', message: 'jwt' })).toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
    expect(mapAcademicReadError({ code: '42501', message: 'permission denied' })).toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    expect(mapAcademicReadError({ code: '40001', message: 'serialization' })).toMatchObject({
      status: 409,
      code: 'conflict',
    });
  });

  it('usa 404 neutral para no revelar si una fila existe en otro tenant', () => {
    expect(neutralAcademicNotFound()).toEqual({
      ok: false,
      status: 404,
      code: 'not_found',
      message: 'El recurso académico no existe o no está disponible.',
    });
  });

  it('normaliza fallos inesperados sin devolver mensajes internos', () => {
    expect(mapAcademicReadError({ code: 'XX000', message: 'sensitive detail' })).toEqual({
      ok: false,
      status: 500,
      code: 'unexpected',
      message: 'No fue posible consultar la información académica.',
    });
  });
});
