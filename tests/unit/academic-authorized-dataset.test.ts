import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database, Tables } from '@/lib/database.types';
import {
  loadAuthorizedCalculationDataset,
  rowsToCalculationInput,
} from '@/lib/academic-grading/calculation';

const row: Tables<'vista_desglose_calificacion'> = {
  tenant_id: 'tenant', ciclo_escolar_id: 'cycle', asignacion_profesor_id: 'assignment',
  periodo_evaluacion_id: 'period', inscripcion_alumno_id: 'enrollment', alumno_id: 'student',
  criterio_evaluacion_id: 'criterion', criterio_nombre: 'Participación',
  criterio_tipo: 'participacion', criterio_peso: 100,
  subcriterio_evaluacion_id: null, subcriterio_nombre: null, subcriterio_tipo: null,
  peso_interno: null, tipo_fuente: 'participation', fuente_id: null,
  estado: 'pendiente', valor_fuente: null, escala_fuente: '0-1', observacion: null,
  row_version: null, actualizado_at: null,
};

describe('adaptador autorizado del motor', () => {
  it('elimina PII y conserva la causa explícita de denominador cero', () => {
    const dataset = rowsToCalculationInput([row], {
      periodState: 'activo', displayDecimals: 1, roundingMode: 'half_up',
    });
    expect(dataset.criteria[0].sources[0]).toMatchObject({
      id: 'participation:criterion:parent',
      zeroDenominatorExcluded: true,
    });
    expect(JSON.stringify(dataset)).not.toContain('student');
    expect(JSON.stringify(dataset)).not.toContain('tenant');
  });

  it('hace una sola consulta acotada a limit+1 y devuelve contrato puro', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [row], error: null });
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit,
    };
    const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient<Database>;
    const result = await loadAuthorizedCalculationDataset(client, {
      assignmentId: 'assignment', enrollmentId: 'enrollment', periodId: 'period',
      periodState: 'activo', displayDecimals: 1, limit: 25,
    });
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(26);
    expect(result.ok).toBe(true);
  });

  it('falla cerrado si limit+1 demuestra truncamiento', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [row, row], error: null });
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit,
    };
    const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient<Database>;
    const result = await loadAuthorizedCalculationDataset(client, {
      assignmentId: 'assignment', enrollmentId: 'enrollment', periodId: 'period',
      periodState: 'activo', displayDecimals: 1, limit: 1,
    });
    expect(result).toMatchObject({ ok: false, status: 409, code: 'conflict' });
  });
});
