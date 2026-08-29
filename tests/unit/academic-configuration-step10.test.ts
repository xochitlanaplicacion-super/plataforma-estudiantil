import { describe, expect, it, vi } from 'vitest';

import { AcademicConfigurationService } from '@/lib/academic/configuration-service';
import {
  academicActivateSchemeSchema,
  academicCycleMutationSchema,
  academicSchemeMutationSchema,
} from '@/lib/academic/configuration-validators';
import type { SupabaseAcademicConfigurationRepository } from '@/lib/academic/configuration-repository';

const IDS = {
  tenant: '10000000-0000-4000-8000-000000000001',
  actor: '1a000000-0000-4000-8000-000000000003',
  scheme: '1b000000-0000-4000-8000-000000000001',
  cycle: '1c000000-0000-4000-8000-000000000001',
  assignment: '1d000000-0000-4000-8000-000000000001',
  period: '1e000000-0000-4000-8000-000000000001',
};

function repositoryDouble() {
  return {
    load: vi.fn(async () => ({ cycles: [], periods: [], assignments: [], schemes: [] })),
    saveCycle: vi.fn(), savePeriod: vi.fn(), saveScheme: vi.fn(),
    saveCriterion: vi.fn(), saveSubcriterion: vi.fn(),
    activateScheme: vi.fn(), copyScheme: vi.fn(),
  } as unknown as SupabaseAcademicConfigurationRepository;
}

describe('Paso 10: contratos administrativos', () => {
  it('mantiene la escala 0–10 fuera de la entrada editable', () => {
    const result = academicSchemeMutationSchema.safeParse({
      cycleId: IDS.cycle, assignmentId: IDS.assignment, periodId: IDS.period,
      name: 'Esquema institucional', passingGrade: 6, displayDecimals: 1,
      scale: '0-100',
    });
    expect(result.success).toBe(false);
  });

  it('valida fechas, concurrencia esperada y versión positiva', () => {
    expect(academicCycleMutationSchema.safeParse({
      name: '2026-2027', startsOn: '2027-01-01', endsOn: '2026-01-01',
      state: 'borrador', timezone: 'America/Mexico_City',
    }).success).toBe(false);
    expect(academicCycleMutationSchema.safeParse({
      id: IDS.cycle, name: '2026-2027', startsOn: '2026-01-01', endsOn: '2027-01-01',
      state: 'activo', timezone: 'America/Mexico_City',
    }).success).toBe(false);
    expect(academicActivateSchemeSchema.safeParse({ schemeId: IDS.scheme, expectedVersion: 0 }).success).toBe(false);
  });

  it('bloquea profesor antes de consultar y deriva tenant/actor del contexto', async () => {
    const repository = repositoryDouble();
    const professor = new AcademicConfigurationService(repository, {
      tenantId: IDS.tenant, actorId: IDS.actor, role: 'profesor', featureEnabled: true,
    });
    await expect(professor.load()).rejects.toMatchObject({ kind: 'forbidden' });
    expect(repository.load).not.toHaveBeenCalled();

    const admin = new AcademicConfigurationService(repository, {
      tenantId: IDS.tenant, actorId: IDS.actor, role: 'admin', featureEnabled: true,
    });
    await admin.load();
    expect(repository.load).toHaveBeenCalledWith({
      tenantId: IDS.tenant, actorId: IDS.actor, role: 'admin',
    });
  });

  it('conserva deny-by-default cuando el feature flag no habilita al tenant', async () => {
    const repository = repositoryDouble();
    const service = new AcademicConfigurationService(repository, {
      tenantId: IDS.tenant, actorId: IDS.actor, role: 'superuser', featureEnabled: false,
    });
    await expect(service.load()).rejects.toMatchObject({ kind: 'disabled' });
    expect(repository.load).not.toHaveBeenCalled();
  });
});
