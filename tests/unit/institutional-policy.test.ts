import { describe, expect, it } from 'vitest';
import { INITIAL_ACADEMIC_CYCLE, INITIAL_GRADING_RULES } from '@/lib/academic-grading/institutional-policy';

describe('política institucional congelada en el Paso 1', () => {
  it('mantiene todos los periodos dentro del ciclo, ordenados y sin solapamiento', () => {
    const periods = INITIAL_ACADEMIC_CYCLE.periods;
    expect(periods).toHaveLength(3);
    expect(periods[0].startDate).toBe(INITIAL_ACADEMIC_CYCLE.startDate);
    expect(periods.at(-1)?.endDate).toBe(INITIAL_ACADEMIC_CYCLE.endDate);

    for (const [index, period] of periods.entries()) {
      expect(period.order).toBe(index + 1);
      expect(period.startDate <= period.endDate).toBe(true);
      expect(period.startDate >= INITIAL_ACADEMIC_CYCLE.startDate).toBe(true);
      expect(period.endDate <= INITIAL_ACADEMIC_CYCLE.endDate).toBe(true);
      if (index > 0) expect(periods[index - 1].endDate < period.startDate).toBe(true);
    }
  });

  it('fija aprobatoria, presentación y estados sin convertir justificados a cero', () => {
    expect(INITIAL_GRADING_RULES).toMatchObject({
      passingGrade: 6,
      displayDecimals: 1,
      roundingMode: 'half_up',
      notSubmittedTreatment: 'zero_on_close',
      justifiedTreatment: 'exclude',
      reopenRoles: ['superuser', 'admin'],
    });
  });
});
