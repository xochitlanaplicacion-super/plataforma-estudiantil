import { describe, expect, it, vi } from 'vitest';
import { AcademicConfigurationService } from '@/lib/academic/configuration-service';
import type { SupabaseAcademicConfigurationRepository } from '@/lib/academic/configuration-repository';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture(existing = false) {
  const source = { id: id(1), assignmentId: id(2), cycleId: id(3), periodId: id(4), state: 'activo', version: 1, name: 'Evaluación', passingGrade: 6, displayDecimals: 1, criteria: [{ name: 'Examen', type: 'directo', weight: 100, order: 1, active: true, subcriteria: [] }] };
  const repo = {
    load: vi.fn().mockResolvedValue({ schemes: [source, ...(existing ? [{ ...source, id: id(9), assignmentId: id(5) }] : [])], assignments: [id(2), id(5)].map((assignmentId) => ({ id: assignmentId, teacherId: id(6), cycleId: id(3) })) }),
    saveScheme: vi.fn().mockResolvedValue({ id: id(7) }),
    saveCriterion: vi.fn().mockResolvedValue({ id: id(8) }),
    saveSubcriterion: vi.fn(), activateScheme: vi.fn().mockResolvedValue({}),
  };
  const service = new AcademicConfigurationService(repo as unknown as SupabaseAcademicConfigurationRepository, { tenantId: id(10), actorId: id(6), role: 'profesor', featureEnabled: true });
  return { repo, service, input: { schemeId: id(1), expectedVersion: 1, assignmentIds: [id(5)] } };
}
describe('aplicar criterios a otras asignaciones', () => {
  it('guarda criterios y activa con el contexto del profesor y tenant', async () => {
    const { repo, service, input } = fixture();
    expect((await service.distributeScheme(input)).results[0].applied).toBe(true);
    expect(repo.saveScheme).toHaveBeenCalledWith({ tenantId: id(10), actorId: id(6), role: 'profesor' }, expect.objectContaining({ assignmentId: id(5), periodId: id(4) }));
    expect(repo.saveCriterion).toHaveBeenCalledOnce();
    expect(repo.activateScheme).toHaveBeenCalledOnce();
  });
  it('rechaza destinos ajenos antes de escribir', async () => {
    const { repo, service, input } = fixture();
    await expect(service.distributeScheme({ ...input, assignmentIds: [id(99)] })).rejects.toMatchObject({ kind: 'forbidden' });
    expect(repo.saveScheme).not.toHaveBeenCalled();
  });
  it('no reemplaza esquemas existentes', async () => {
    const { repo, service, input } = fixture(true);
    expect((await service.distributeScheme(input)).results[0].applied).toBe(false);
    expect(repo.saveScheme).not.toHaveBeenCalled();
  });
  it('no declara éxito si falla una copia', async () => {
    const { repo, service, input } = fixture();
    repo.saveCriterion.mockRejectedValueOnce(new Error('network'));
    const result = await service.distributeScheme(input);
    expect(result.results[0].message).toContain('borrador');
    expect(result.results[0].applied).toBe(false);
    expect(repo.activateScheme).not.toHaveBeenCalled();
  });
});
