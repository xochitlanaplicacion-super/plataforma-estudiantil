import { describe, expect, it, vi } from 'vitest';

import { createAcademicActionHandlers } from '@/lib/academic/action-handler';
import type {
  AcademicClosurePreviewDto,
  AcademicClosureResultDto,
  AcademicMutationResultDto,
  AcademicPageDto,
} from '@/lib/academic/dto';
import { AcademicApplicationError, mapSupabaseAcademicError } from '@/lib/academic/errors';
import { isAcademicGradingV2Enabled } from '@/lib/academic/feature-flags';
import type { AcademicRepository } from '@/lib/academic/repository';
import { AcademicService } from '@/lib/academic/service';

const IDS = {
  tenant: '10000000-0000-4000-8000-000000000001',
  actor: '1a000000-0000-4000-8000-000000000003',
  assignment: '1f000000-0000-4000-8000-000000000001',
  period: '1d000000-0000-4000-8000-000000000001',
  enrollment: '1e000000-0000-4000-8000-000000000001',
  criterion: '1c000000-0000-4000-8000-000000000001',
  idempotency: '91000000-0000-4000-8000-000000000001',
  correlation: '92000000-0000-4000-8000-000000000001',
  source: '93000000-0000-4000-8000-000000000001',
};

function emptyPage<T>(): AcademicPageDto<T> {
  return {
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  };
}

const mutationResult: AcademicMutationResultDto = {
  status: 'saved',
  replayed: false,
  correlationId: IDS.correlation,
  items: [{
    sourceType: 'directCriterion',
    sourceId: IDS.source,
    rowVersion: 2,
    state: 'calificado',
    grade: 9.5,
  }],
};

const closureResult: AcademicClosureResultDto = {
  status: 'closed',
  replayed: false,
  correlationId: IDS.correlation,
  version: 1,
  snapshotCount: 1,
};

const previewResult: AcademicClosurePreviewDto = {
  assignmentId: IDS.assignment,
  periodId: IDS.period,
  totalCount: 1,
  missingCount: 0,
  canClose: true,
  students: [],
};

function makeRepository(overrides: Partial<AcademicRepository> = {}): AcademicRepository {
  return {
    listContext: async () => emptyPage(),
    listGradebook: async () => emptyPage(),
    listBreakdown: async () => emptyPage(),
    listStudentGrades: async () => emptyPage(),
    listAudit: async () => emptyPage(),
    calculateResult: async () => ({
      engineVersion: 'academic-deterministic-v1',
      scale: '0-10',
      exactGrade: '9.5000',
      displayGrade: '9.5',
      displayDecimals: 1,
      complete: true,
      criteria: [],
      warnings: [],
    }),
    previewClosure: async () => previewResult,
    editGrades: async () => mutationResult,
    closeGrades: async () => closureResult,
    reopenGrades: async () => ({ ...closureResult, status: 'reopened', version: 2 }),
    ...overrides,
  };
}

function makeService(
  repository: AcademicRepository,
  role: 'superuser' | 'admin' | 'profesor' | 'alumno' = 'profesor',
  featureEnabled = true,
): AcademicService {
  return new AcademicService(repository, {
    tenantId: IDS.tenant,
    actorId: IDS.actor,
    role,
    featureEnabled,
  });
}

function validMutation(items = 1) {
  return {
    assignmentId: IDS.assignment,
    periodId: IDS.period,
    items: Array.from({ length: items }, (_, index) => ({
      sourceType: 'directCriterion' as const,
      sourceId: IDS.source,
      enrollmentId: IDS.enrollment,
      criterionId: IDS.criterion,
      state: 'calificado' as const,
      grade: 9.5,
      expectedRowVersion: index + 1,
    })),
    reason: 'Corrección justificada',
    idempotencyKey: IDS.idempotency,
    correlationId: IDS.correlation,
  };
}

describe('Paso 9: feature flag servidor/tenant', () => {
  it('es deny-by-default y requiere switch global más tenant autorizado', () => {
    const context = { tenantId: IDS.tenant, tenantSlug: 'colegio-demo' };
    expect(isAcademicGradingV2Enabled(context, {})).toBe(false);
    expect(isAcademicGradingV2Enabled(context, {
      ACADEMIC_GRADING_V2_ENABLED: 'true',
    })).toBe(false);
    expect(isAcademicGradingV2Enabled(context, {
      ACADEMIC_GRADING_V2_ENABLED: 'true',
      ACADEMIC_GRADING_V2_TENANTS: 'otro-tenant, colegio-demo',
    })).toBe(true);
    expect(isAcademicGradingV2Enabled(context, {
      ACADEMIC_GRADING_V2_ENABLED: 'on',
      ACADEMIC_GRADING_V2_TENANTS: '*',
    })).toBe(true);
  });

  it('permite rollout persistente dual/canonical y conserva el apagado de emergencia', () => {
    const context = { tenantId: IDS.tenant, tenantSlug: 'colegio-demo' };
    expect(isAcademicGradingV2Enabled(context, {}, 'legacy')).toBe(false);
    expect(isAcademicGradingV2Enabled(context, {}, 'dual')).toBe(true);
    expect(isAcademicGradingV2Enabled(context, {}, 'canonical')).toBe(true);
    expect(isAcademicGradingV2Enabled(context, {
      ACADEMIC_GRADING_V2_ENABLED: 'false',
    }, 'canonical')).toBe(false);
  });
});
describe('Paso 9: servicio y validación duplicada', () => {
  it('no consulta el repositorio cuando el tenant no está habilitado', async () => {
    const listContext = vi.fn<AcademicRepository['listContext']>();
    const service = makeService(makeRepository({ listContext }), 'profesor', false);
    await expect(service.listContext()).rejects.toMatchObject({ kind: 'disabled' });
    expect(listContext).not.toHaveBeenCalled();
  });

  it('rechaza roles fuera de capacidad antes de tocar datos', async () => {
    const editGrades = vi.fn<AcademicRepository['editGrades']>();
    const student = makeService(makeRepository({ editGrades }), 'alumno');
    await expect(student.editGrades(validMutation())).rejects.toMatchObject({ kind: 'forbidden' });
    expect(editGrades).not.toHaveBeenCalled();
  });

  it('rechaza UUID manipulados, campos extra y lotes mayores de 100', async () => {
    const editGrades = vi.fn<AcademicRepository['editGrades']>();
    const teacher = makeService(makeRepository({ editGrades }));
    await expect(teacher.editGrades({
      ...validMutation(),
      assignmentId: 'tenant-ajeno',
    })).rejects.toBeDefined();
    await expect(teacher.editGrades({
      ...validMutation(),
      tenantId: 'no-se-acepta-desde-el-cliente',
    })).rejects.toBeDefined();
    await expect(teacher.editGrades(validMutation(101))).rejects.toBeDefined();
    expect(editGrades).not.toHaveBeenCalled();
  });

  it('impone la semántica estado/nota y la versión cero para una fuente nueva', async () => {
    const service = makeService(makeRepository());
    await expect(service.editGrades({
      ...validMutation(),
      items: [{
        ...validMutation().items[0],
        state: 'pendiente',
        grade: 8,
      }],
    })).rejects.toBeDefined();
    await expect(service.editGrades({
      ...validMutation(),
      items: [{
        ...validMutation().items[0],
        sourceId: null,
        expectedRowVersion: 3,
      }],
    })).rejects.toBeDefined();
  });

  it('entrega al repositorio sólo contexto autenticado y entrada normalizada', async () => {
    const editGrades = vi.fn<AcademicRepository['editGrades']>(async () => mutationResult);
    const service = makeService(makeRepository({ editGrades }));
    await expect(service.editGrades(validMutation())).resolves.toEqual(mutationResult);
    expect(editGrades).toHaveBeenCalledOnce();
    expect(editGrades.mock.calls[0][0]).toEqual({
      tenantId: IDS.tenant,
      actorId: IDS.actor,
      role: 'profesor',
    });
    expect(editGrades.mock.calls[0][1]).not.toHaveProperty('tenantId');
    expect(editGrades.mock.calls[0][1].reason).toBe('Corrección justificada');
  });
});

describe('Paso 9: handlers equivalentes a endpoints públicos', () => {
  it('normaliza sesión ausente sin filtrar el error interno', async () => {
    const handlers = createAcademicActionHandlers({
      createService: async () => { throw new Error('No autenticado'); },
      revalidate: vi.fn(),
    });
    await expect(handlers.listContext()).resolves.toEqual({
      ok: false,
      status: 'unauthenticated',
      error: {
        code: 'ACADEMIC_UNAUTHENTICATED',
        message: 'Tu sesión no es válida o expiró.',
        httpStatus: 401,
      },
    });
  });

  it('distingue empty de success en consultas paginadas', async () => {
    const handlers = createAcademicActionHandlers({
      createService: async () => makeService(makeRepository(), 'admin'),
      revalidate: vi.fn(),
    });
    const result = await handlers.listAudit();
    expect(result).toMatchObject({ ok: true, status: 'empty' });
  });

  it('no revalida ni devuelve datos parciales si la RPC termina en conflicto', async () => {
    const revalidate = vi.fn();
    const repository = makeRepository({
      editGrades: async () => { throw new AcademicApplicationError('conflict'); },
    });
    const handlers = createAcademicActionHandlers({
      createService: async () => makeService(repository),
      revalidate,
    });
    const result = await handlers.editGrades(validMutation());
    expect(result).toMatchObject({ ok: false, status: 'conflict' });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('revalida el alcance validado sólo después de guardar', async () => {
    const revalidate = vi.fn();
    const handlers = createAcademicActionHandlers({
      createService: async () => makeService(makeRepository()),
      revalidate,
    });
    const result = await handlers.editGrades(validMutation());
    expect(result).toMatchObject({ ok: true, status: 'success' });
    expect(revalidate).toHaveBeenCalledWith({
      assignmentId: IDS.assignment,
      periodId: IDS.period,
    });
  });

  it('impide que un profesor consulte auditoría o cierre periodos', async () => {
    const handlers = createAcademicActionHandlers({
      createService: async () => makeService(makeRepository(), 'profesor'),
      revalidate: vi.fn(),
    });
    await expect(handlers.listAudit()).resolves.toMatchObject({ ok: false, status: 'forbidden' });
    await expect(handlers.closeGrades({
      assignmentId: IDS.assignment,
      periodId: IDS.period,
      reason: 'Cierre del periodo',
      idempotencyKey: IDS.idempotency,
    })).resolves.toMatchObject({ ok: false, status: 'forbidden' });
  });
});

describe('Paso 9: sanitización de errores Supabase', () => {
  it('distingue cerrado, conflicto y validación sin exponer SQL', () => {
    expect(mapSupabaseAcademicError({ code: 'PT409', message: 'ACADEMIC_SCOPE_CLOSED' }))
      .toMatchObject({ kind: 'closed', message: 'Las calificaciones de este alcance están cerradas.' });
    expect(mapSupabaseAcademicError({ code: 'PT409', message: 'detail: private row' }))
      .toMatchObject({ kind: 'conflict', message: 'La información cambió mientras trabajabas. Actualiza antes de continuar.' });
    expect(mapSupabaseAcademicError({ code: 'PT422', message: 'sensitive SQL' }))
      .toMatchObject({ kind: 'validation', message: 'Los datos académicos enviados no son válidos.' });
  });
});
