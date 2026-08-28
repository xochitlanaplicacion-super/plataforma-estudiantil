import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/database.types';
import type { AcademicRepositoryContext } from '@/lib/academic/repository';

vi.mock('server-only', () => ({}));

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

const context: AcademicRepositoryContext = {
  tenantId: IDS.tenant,
  actorId: IDS.actor,
  role: 'profesor',
};

describe('Paso 9: repositorio Supabase', () => {
  let SupabaseAcademicRepository: typeof import('@/lib/academic/repository').SupabaseAcademicRepository;

  beforeAll(async () => {
    ({ SupabaseAcademicRepository } = await import('@/lib/academic/repository'));
  });

  it('mapea el guardado exclusivamente a la RPC atómica del Paso 8', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
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
      },
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;
    const repository = new SupabaseAcademicRepository(client);
    await repository.editGrades(context, {
      assignmentId: IDS.assignment,
      periodId: IDS.period,
      items: [{
        sourceType: 'directCriterion',
        sourceId: IDS.source,
        enrollmentId: IDS.enrollment,
        criterionId: IDS.criterion,
        state: 'calificado',
        grade: 9.5,
        expectedRowVersion: 1,
      }],
      reason: 'Corrección justificada',
      idempotencyKey: IDS.idempotency,
      correlationId: IDS.correlation,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][0]).toBe('editar_calificaciones_academicas');
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('tenant_id');
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('actor_id');
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_asignacion_id: IDS.assignment,
      p_periodo_id: IDS.period,
      p_idempotency_key: IDS.idempotency,
    });
  });

  it.each([
    ['previewClosure', 'previsualizar_cierre_calificaciones', {
      assignmentId: IDS.assignment,
      periodId: IDS.period,
    }, {
      assignmentId: IDS.assignment,
      periodId: IDS.period,
      totalCount: 0,
      missingCount: 0,
      canClose: false,
      students: [],
    }],
    ['closeGrades', 'cerrar_calificaciones_academicas', {
      assignmentId: IDS.assignment,
      periodId: IDS.period,
      reason: 'Cierre autorizado',
      idempotencyKey: IDS.idempotency,
      correlationId: IDS.correlation,
    }, {
      status: 'closed',
      replayed: false,
      correlationId: IDS.correlation,
      version: 1,
      snapshotCount: 0,
    }],
    ['reopenGrades', 'reabrir_calificaciones_academicas', {
      assignmentId: IDS.assignment,
      periodId: IDS.period,
      reason: 'Reapertura autorizada',
      idempotencyKey: IDS.idempotency,
      correlationId: IDS.correlation,
    }, {
      status: 'reopened',
      replayed: false,
      correlationId: IDS.correlation,
      version: 2,
      snapshotCount: 0,
    }],
  ] as const)('mapea %s a %s', async (method, rpcName, input, data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    const client = { rpc } as unknown as SupabaseClient<Database>;
    const repository = new SupabaseAcademicRepository(client);
    if (method === 'previewClosure') {
      await repository.previewClosure(context, input);
    } else if (method === 'closeGrades') {
      await repository.closeGrades(context, input);
    } else {
      await repository.reopenGrades(context, input);
    }
    expect(rpc).toHaveBeenCalledWith(rpcName, expect.any(Object));
  });

  it('consulta la libreta por la vista security_invoker, tenant y alcance paginado', async () => {
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    builder.range.mockResolvedValue({ data: [], error: null, count: 0 });
    const from = vi.fn().mockReturnValue(builder);
    const client = { from } as unknown as SupabaseClient<Database>;
    const repository = new SupabaseAcademicRepository(client);
    const result = await repository.listGradebook(context, {
      assignmentId: IDS.assignment,
      periodId: IDS.period,
      page: 2,
      pageSize: 25,
    });
    expect(from).toHaveBeenCalledWith('vista_libreta_profesor');
    expect(builder.eq).toHaveBeenCalledWith('tenant_id', IDS.tenant);
    expect(builder.eq).toHaveBeenCalledWith('asignacion_profesor_id', IDS.assignment);
    expect(builder.eq).toHaveBeenCalledWith('periodo_evaluacion_id', IDS.period);
    expect(builder.range).toHaveBeenCalledWith(25, 49);
    expect(result).toMatchObject({ page: 2, pageSize: 25, total: 0 });
  });
});
