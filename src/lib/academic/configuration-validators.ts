import { z } from 'zod';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const expectedUpdate = z.string().datetime({ offset: true }).optional();
const baseMutation = z.object({ id: uuid.optional(), expectedUpdatedAt: expectedUpdate }).strict();

export const academicCycleMutationSchema = baseMutation.extend({
  name: z.string().trim().min(1).max(120),
  startsOn: date,
  endsOn: date,
  state: z.enum(['borrador', 'activo', 'cerrado', 'archivado']),
  timezone: z.string().trim().min(1).max(80).default('America/Mexico_City'),
}).strict().refine((value) => value.startsOn < value.endsOn, {
  path: ['endsOn'], message: 'La fecha final debe ser posterior a la inicial.',
}).refine((value) => !value.id || Boolean(value.expectedUpdatedAt), {
  path: ['expectedUpdatedAt'], message: 'La versión esperada es obligatoria al editar.',
});

export const academicPeriodMutationSchema = baseMutation.extend({
  cycleId: uuid,
  name: z.string().trim().min(1).max(120),
  order: z.number().int().min(1).max(99),
  startsOn: date,
  endsOn: date,
  semanticColor: z.enum(['primary', 'secondary', 'accent', 'muted']).default('primary'),
  state: z.enum(['borrador', 'activo']),
}).strict().refine((value) => value.startsOn <= value.endsOn, {
  path: ['endsOn'], message: 'La fecha final no puede ser anterior a la inicial.',
}).refine((value) => !value.id || Boolean(value.expectedUpdatedAt), {
  path: ['expectedUpdatedAt'], message: 'La versión esperada es obligatoria al editar.',
});

export const academicSchemeMutationSchema = baseMutation.extend({
  cycleId: uuid,
  assignmentId: uuid,
  periodId: uuid,
  name: z.string().trim().min(1).max(160),
  passingGrade: z.number().finite().min(0).max(10),
  displayDecimals: z.union([z.literal(0), z.literal(1), z.literal(2)]),
}).strict().refine((value) => !value.id || Boolean(value.expectedUpdatedAt), {
  path: ['expectedUpdatedAt'], message: 'La versión esperada es obligatoria al editar.',
});

const subcriterionConfiguration = z.union([
  z.object({}).strict(),
  z.object({ agregacion: z.literal('promedio') }).strict(),
  z.object({ modo: z.literal('maximo_grupo') }).strict(),
  z.object({ modo: z.literal('meta_fija'), meta: z.number().finite().positive() }).strict(),
]);

export const academicCriterionMutationSchema = baseMutation.extend({
  schemeId: uuid,
  name: z.string().trim().min(1).max(120),
  type: z.enum(['directo', 'actividades', 'participacion', 'hibrido']),
  weight: z.number().finite().min(0).max(100),
  order: z.number().int().min(1).max(99),
  active: z.boolean().default(true),
}).strict().refine((value) => !value.id || Boolean(value.expectedUpdatedAt), {
  path: ['expectedUpdatedAt'], message: 'La versión esperada es obligatoria al editar.',
});

export const academicSubcriterionMutationSchema = baseMutation.extend({
  criterionId: uuid,
  name: z.string().trim().min(1).max(120),
  type: z.enum(['directo', 'actividades', 'participacion']),
  internalWeight: z.number().finite().min(0).max(100),
  order: z.number().int().min(1).max(99),
  configuration: subcriterionConfiguration,
  active: z.boolean().default(true),
}).strict().refine((value) => !value.id || Boolean(value.expectedUpdatedAt), {
  path: ['expectedUpdatedAt'], message: 'La versión esperada es obligatoria al editar.',
});

export const academicActivateSchemeSchema = z.object({
  schemeId: uuid,
  expectedVersion: z.number().int().positive(),
}).strict();

export const academicCopySchemeSchema = z.object({
  schemeId: uuid,
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(1).max(160),
}).strict();

export type AcademicCycleMutationInput = z.output<typeof academicCycleMutationSchema>;
export type AcademicPeriodMutationInput = z.output<typeof academicPeriodMutationSchema>;
export type AcademicSchemeMutationInput = z.output<typeof academicSchemeMutationSchema>;
export type AcademicCriterionMutationInput = z.output<typeof academicCriterionMutationSchema>;
export type AcademicSubcriterionMutationInput = z.output<typeof academicSubcriterionMutationSchema>;
export type AcademicActivateSchemeInput = z.output<typeof academicActivateSchemeSchema>;
export type AcademicCopySchemeInput = z.output<typeof academicCopySchemeSchema>;
