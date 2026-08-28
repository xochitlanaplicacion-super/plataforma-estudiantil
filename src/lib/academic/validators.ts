import { z } from 'zod';

import {
  ACADEMIC_MUTATION_MAX_BYTES,
  ACADEMIC_MUTATION_MAX_ROWS,
  ACADEMIC_PAGE_DEFAULT_SIZE,
  ACADEMIC_PAGE_MAX_SIZE,
} from './dto';

const uuid = z.string().uuid();
const reason = z.string().trim().min(3).max(500);

export const academicPageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(ACADEMIC_PAGE_MAX_SIZE).default(ACADEMIC_PAGE_DEFAULT_SIZE),
}).strict();

export const academicContextQuerySchema = academicPageSchema;

export const academicScopeQuerySchema = academicPageSchema.extend({
  assignmentId: uuid,
  periodId: uuid,
}).strict();

export const academicBreakdownQuerySchema = academicScopeQuerySchema.extend({
  enrollmentId: uuid,
}).strict();

export const academicStudentGradesQuerySchema = academicPageSchema.extend({
  periodId: uuid.optional(),
}).strict();

export const academicAuditQuerySchema = academicPageSchema.extend({
  correlationId: uuid.optional(),
}).strict();

const gradeState = z.enum([
  'sin_capturar',
  'pendiente',
  'entregado',
  'tardio',
  'no_entregado',
  'justificado',
  'calificado',
]);

export const academicGradeMutationItemSchema = z.object({
  sourceType: z.enum(['directCriterion', 'automaticExercise', 'descriptiveSubmission']),
  sourceId: uuid.nullish(),
  enrollmentId: uuid,
  criterionId: uuid.optional(),
  subcriterionId: uuid.nullish(),
  state: gradeState,
  grade: z.number().finite().min(0).max(10).nullable(),
  observation: z.string().trim().max(2_000).nullish(),
  expectedRowVersion: z.number().int().min(0),
}).strict().superRefine((item, context) => {
  if (item.state === 'calificado' && item.grade === null) {
    context.addIssue({ code: 'custom', path: ['grade'], message: 'La nota es obligatoria al calificar.' });
  }
  if (item.state !== 'calificado' && item.grade !== null) {
    context.addIssue({ code: 'custom', path: ['grade'], message: 'Sólo el estado calificado admite nota.' });
  }
  if (item.sourceType === 'directCriterion' && !item.criterionId) {
    context.addIssue({ code: 'custom', path: ['criterionId'], message: 'El criterio es obligatorio.' });
  }
  if (item.sourceType !== 'directCriterion' && !item.sourceId) {
    context.addIssue({ code: 'custom', path: ['sourceId'], message: 'La fuente es obligatoria.' });
  }
  if (item.sourceType === 'directCriterion' && !item.sourceId && item.expectedRowVersion !== 0) {
    context.addIssue({ code: 'custom', path: ['expectedRowVersion'], message: 'Una nota nueva inicia en versión cero.' });
  }
});

export const editAcademicGradesSchema = z.object({
  assignmentId: uuid,
  periodId: uuid,
  items: z.array(academicGradeMutationItemSchema).min(1).max(ACADEMIC_MUTATION_MAX_ROWS),
  reason,
  idempotencyKey: uuid,
  correlationId: uuid.nullish(),
}).strict().superRefine((input, context) => {
  const byteLength = new TextEncoder().encode(JSON.stringify(input.items)).byteLength;
  if (byteLength > ACADEMIC_MUTATION_MAX_BYTES) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'El lote excede el tamaño permitido.' });
  }
});

export const academicClosureCommandSchema = z.object({
  assignmentId: uuid,
  periodId: uuid,
  reason,
  idempotencyKey: uuid,
  correlationId: uuid.nullish(),
}).strict();

export const academicClosurePreviewSchema = z.object({
  assignmentId: uuid,
  periodId: uuid,
  totalCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  canClose: z.boolean(),
  students: z.array(z.object({
    enrollmentId: uuid,
    complete: z.boolean(),
    exactGrade: z.string().nullable(),
    displayGrade: z.string().nullable(),
    warnings: z.array(z.object({ code: z.string().min(1) }).passthrough()),
  }).passthrough()),
}).strict();

export const academicMutationResultSchema = z.object({
  status: z.literal('saved'),
  replayed: z.boolean(),
  correlationId: uuid,
  items: z.array(z.object({
    sourceType: z.enum(['directCriterion', 'automaticExercise', 'descriptiveSubmission']),
    sourceId: uuid,
    rowVersion: z.number().int().nonnegative(),
    state: gradeState,
    grade: z.number().min(0).max(10).nullable(),
  }).strict()),
}).strict();

export const academicClosureResultSchema = z.object({
  status: z.enum(['closed', 'reopened']),
  replayed: z.boolean(),
  correlationId: uuid,
  version: z.number().int().positive(),
  snapshotCount: z.number().int().nonnegative(),
}).strict();

export const academicCalculatedResultSchema = z.object({
  engineVersion: z.literal('academic-deterministic-v1'),
  scale: z.literal('0-10'),
  exactGrade: z.string().nullable(),
  displayGrade: z.string().nullable(),
  displayDecimals: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  complete: z.boolean(),
  criteria: z.array(z.record(z.string(), z.unknown())),
  warnings: z.array(z.object({
    code: z.string().min(1),
    criterionId: uuid.nullable(),
    subcriterionId: uuid.nullable(),
    sourceId: z.string().nullable(),
  }).strict()),
}).strict();

export type AcademicContextQueryInput = z.output<typeof academicContextQuerySchema>;
export type AcademicScopeQueryInput = z.output<typeof academicScopeQuerySchema>;
export type AcademicBreakdownQueryInput = z.output<typeof academicBreakdownQuerySchema>;
export type AcademicStudentGradesQueryInput = z.output<typeof academicStudentGradesQuerySchema>;
export type AcademicAuditQueryInput = z.output<typeof academicAuditQuerySchema>;
export type EditAcademicGradesInput = z.output<typeof editAcademicGradesSchema>;
export type AcademicClosureCommandInput = z.output<typeof academicClosureCommandSchema>;
