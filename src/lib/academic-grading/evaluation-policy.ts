import { z } from 'zod';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const isoDateSchema = z.string().regex(isoDatePattern, 'Usa una fecha ISO YYYY-MM-DD').refine(
  (value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  },
  'La fecha no existe',
);

export const evaluationPeriodInputSchema = z.object({
  tenantId: z.string().uuid(),
  cycleId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  order: z.number().int().positive().max(32767),
  startsOn: isoDateSchema,
  endsOn: isoDateSchema,
  semanticColor: z.enum(['primary', 'secondary', 'accent', 'muted']),
  state: z.enum(['borrador', 'activo']).default('borrador'),
  createdBy: z.string().uuid(),
}).superRefine((period, context) => {
  if (period.startsOn > period.endsOn) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsOn'],
      message: 'El fin debe ser igual o posterior al inicio',
    });
  }
});

export const evaluationSchemeInputSchema = z.object({
  tenantId: z.string().uuid(),
  cycleId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  periodId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  scale: z.literal('0-10').optional(),
  passingGrade: z.number().finite().min(0).max(10).default(6),
  displayDecimals: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(1),
  roundingMode: z.literal('half_up').default('half_up'),
  notSubmittedTreatment: z.literal('zero_on_close').default('zero_on_close'),
  notSubmittedValue: z.literal(0).default(0),
  justifiedTreatment: z.literal('exclude').default('exclude'),
  state: z.enum(['borrador', 'activo', 'archivado']).default('borrador'),
  version: z.number().int().positive().default(1),
  createdBy: z.string().uuid(),
});

export type EvaluationPeriodInput = z.input<typeof evaluationPeriodInputSchema>;
export type EvaluationSchemeInput = z.input<typeof evaluationSchemeInputSchema>;

export function assertPeriodWithinCycle(
  period: Pick<z.output<typeof evaluationPeriodInputSchema>, 'startsOn' | 'endsOn'>,
  cycle: { startsOn: string; endsOn: string },
): void {
  if (period.startsOn < cycle.startsOn || period.endsOn > cycle.endsOn) {
    throw new RangeError('El periodo debe estar contenido en las fechas del ciclo');
  }
}

export function evaluationPeriodsOverlap(
  first: Pick<z.output<typeof evaluationPeriodInputSchema>, 'startsOn' | 'endsOn'>,
  second: Pick<z.output<typeof evaluationPeriodInputSchema>, 'startsOn' | 'endsOn'>,
): boolean {
  return first.startsOn <= second.endsOn && second.startsOn <= first.endsOn;
}
