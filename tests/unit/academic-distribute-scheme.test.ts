import { describe, expect, it, vi } from 'vitest';
import { AcademicConfigurationService } from '@/lib/academic/configuration-service';
import type { SupabaseAcademicConfigurationRepository } from '@/lib/academic/configuration-repository';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture(existing = false) {
  const source = { id: id(1), assignmentId: id(2), cycleId: id(3), periodId: id(4), state: 'activo', version: 1, name: 'Evaluación', passingGrade: 6, displayDecimals: 1, criteria: [{ name: 'Examen', type: 'directo', weight: 100, order: 1, active: true, subcriteria: [] }] };
  const repo = {
    load: vi.fn().mockResolvedValue({ schemes: [source, ...(existing ? [{ ...source, id: id(9), assignmentId: id(5) }] : [])], assignments: [id(2), id(5)].map((assignmentId) => ({ id: assignmentId, teacherId: id(6), cycleId: id(3) })) }),
    applyTeacherCriteriaToAssignment: vi.fn().mockResolvedValue({ criterionCount: 1, mode: 'replaced' }),
  };
  const service = new AcademicConfigurationService(repo as unknown as SupabaseAcademicConfigurationRepository, { tenantId: id(10), actorId: id(6), role: 'profesor', featureEnabled: true });
  return { repo, service, input: { schemeId: id(1), expectedVersion: 1, assignmentIds: [id(5)] } };
}
describe('aplicar criterios a otras asignaciones', () => {
  it('aplica los criterios mediante una operación transaccional por destino', async () => {
    const { repo, service, input } = fixture();
    expect((await service.distributeScheme(input)).results[0].applied).toBe(true);
    expect(repo.applyTeacherCriteriaToAssignment).toHaveBeenCalledWith(id(1), 1, id(5));
  });
  it('rechaza destinos ajenos antes de escribir', async () => {
    const { repo, service, input } = fixture();
    await expect(service.distributeScheme({ ...input, assignmentIds: [id(99)] })).rejects.toMatchObject({ kind: 'forbidden' });
    expect(repo.applyTeacherCriteriaToAssignment).not.toHaveBeenCalled();
  });
  it('reemplaza los criterios existentes cuando la base confirma que no hay registros', async () => {
    const { repo, service, input } = fixture(true);
    expect((await service.distributeScheme(input)).results[0].applied).toBe(true);
    expect(repo.applyTeacherCriteriaToAssignment).toHaveBeenCalledWith(id(1), 1, id(5));
  });
  it('recalcula porcentajes equivalentes sin copiar ni perder notas', async () => {
    const { repo, service, input } = fixture(true);
    repo.applyTeacherCriteriaToAssignment.mockResolvedValueOnce({ criterionCount: 1, mode: 'reweighted' });
    const result = await service.distributeScheme(input);
    expect(result.results[0]).toMatchObject({ applied: true, message: expect.stringContaining('notas originales') });
  });
  it('no declara éxito ni oculta el motivo si el destino tiene registros', async () => {
    const { repo, service, input } = fixture();
    repo.applyTeacherCriteriaToAssignment.mockRejectedValueOnce(new Error('Esta materia ya tiene calificaciones vinculadas.'));
    const result = await service.distributeScheme(input);
    expect(result.results[0].message).toContain('calificaciones vinculadas');
    expect(result.results[0].applied).toBe(false);
  });
});
