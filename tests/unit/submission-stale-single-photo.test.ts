import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.fn();
vi.mock('@/lib/tenant/context', () => ({
  requireTenantSession: vi.fn(async () => ({
    supabase: {}, admin: { from }, tenantId: 'tenant-test', user: { id: 'student-test' },
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/notifications/submission-push', () => ({ dispatchSubmissionPush: vi.fn() }));

import { confirmarCargaEntregaAlumno, prepararCargaEntregaAlumno } from '@/lib/actions/entregas';

const photo = {
  ejercicioId: '70fdfd88-30b3-46c7-889a-16e2a390662a',
  archivoNombre: 'tarea.jpg', archivoTipo: 'image/jpeg', archivoTamano: 2_820_492,
};

describe('protección contra una pestaña antigua de entrega', () => {
  beforeEach(() => from.mockReset());

  it('rechaza una foto por la ruta antigua antes de crear un intento de carga', async () => {
    const result = await prepararCargaEntregaAlumno(photo);
    expect(result.error).toMatch(/Recarga la página.*galería/);
    expect(from).not.toHaveBeenCalled();
  });

  it('no confirma como archivo único una foto firmada por una pestaña antigua', async () => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    };
    from.mockReturnValue(query);
    const result = await confirmarCargaEntregaAlumno({
      ...photo,
      archivoPath: `tenant-test/entregas/student-test/${photo.ejercicioId}/1d746e82-ef17-4824-b9a5-f0b621371277`,
      uploadIntentId: '1d746e82-ef17-4824-b9a5-f0b621371278',
    });
    expect(result.error).toMatch(/Recarga la página.*galería/);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('resultados_ejercicios');
  });
});
