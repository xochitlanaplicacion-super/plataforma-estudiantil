import { describe, expect, it } from 'vitest';
import {
  assertPeriodWithinCycle,
  evaluationPeriodInputSchema,
  evaluationPeriodsOverlap,
  evaluationSchemeInputSchema,
} from '@/lib/academic-grading/evaluation-policy';

const actorId = '00000000-0000-4000-8000-000000000001';
const tenantId = '00000000-0000-4000-8000-000000000002';
const cycleId = '00000000-0000-4000-8000-000000000003';

describe('contrato UX de periodos y esquemas', () => {
  it('acepta un periodo valido sin admitir el estado cerrado desde formularios', () => {
    const parsed = evaluationPeriodInputSchema.parse({
      tenantId,
      cycleId,
      name: 'Periodo 1',
      order: 1,
      startsOn: '2026-08-31',
      endsOn: '2026-11-27',
      semanticColor: 'primary',
      createdBy: actorId,
    });
    expect(parsed.state).toBe('borrador');
    expect(() => evaluationPeriodInputSchema.parse({ ...parsed, state: 'cerrado' })).toThrow();
  });

  it('rechaza fechas invertidas o inexistentes', () => {
    const base = {
      tenantId,
      cycleId,
      name: 'Periodo',
      order: 1,
      semanticColor: 'accent' as const,
      createdBy: actorId,
    };
    expect(() => evaluationPeriodInputSchema.parse({
      ...base,
      startsOn: '2026-12-01',
      endsOn: '2026-11-01',
    })).toThrow();
    expect(() => evaluationPeriodInputSchema.parse({
      ...base,
      startsOn: '2026-02-30',
      endsOn: '2026-03-01',
    })).toThrow();
  });

  it('detecta contencion y solapamiento inclusivo', () => {
    const cycle = { startsOn: '2026-08-31', endsOn: '2027-07-16' };
    expect(() => assertPeriodWithinCycle({
      startsOn: '2026-08-30',
      endsOn: '2026-11-27',
    }, cycle)).toThrow(RangeError);
    expect(evaluationPeriodsOverlap(
      { startsOn: '2026-08-31', endsOn: '2026-11-27' },
      { startsOn: '2026-11-27', endsOn: '2027-03-12' },
    )).toBe(true);
    expect(evaluationPeriodsOverlap(
      { startsOn: '2026-08-31', endsOn: '2026-11-27' },
      { startsOn: '2026-11-28', endsOn: '2027-03-12' },
    )).toBe(false);
  });

  it('fija la escala 0-10 y todas las reglas institucionales', () => {
    const valid = {
      tenantId,
      cycleId,
      assignmentId: '00000000-0000-4000-8000-000000000004',
      periodId: '00000000-0000-4000-8000-000000000005',
      name: 'Esquema ordinario',
      createdBy: actorId,
    };
    expect(evaluationSchemeInputSchema.parse(valid)).toMatchObject({
      passingGrade: 6,
      displayDecimals: 1,
      roundingMode: 'half_up',
      notSubmittedTreatment: 'zero_on_close',
      notSubmittedValue: 0,
      justifiedTreatment: 'exclude',
    });
    expect(() => evaluationSchemeInputSchema.parse({ ...valid, scale: '0-100' })).toThrow();
    expect(() => evaluationSchemeInputSchema.parse({ ...valid, passingGrade: 10.0001 })).toThrow();
    expect(() => evaluationSchemeInputSchema.parse({ ...valid, notSubmittedValue: 5 })).toThrow();
  });
});
