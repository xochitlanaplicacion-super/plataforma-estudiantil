import { z } from 'zod';

const percentage = z.number().finite().min(0).max(100).multipleOf(0.0001);
const baseSubcriterion = {
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  internalWeight: percentage,
  order: z.number().int().positive().max(32767),
  active: z.boolean(),
};

export const evaluationSubcriterionSchema = z.discriminatedUnion('type', [
  z.object({
    ...baseSubcriterion,
    type: z.literal('directo'),
    configuration: z.object({}).strict(),
  }).strict(),
  z.object({
    ...baseSubcriterion,
    type: z.literal('actividades'),
    configuration: z.object({ agregacion: z.literal('promedio') }).strict(),
  }).strict(),
  z.object({
    ...baseSubcriterion,
    type: z.literal('participacion'),
    configuration: z.discriminatedUnion('modo', [
      z.object({ modo: z.literal('maximo_grupo') }).strict(),
      z.object({ modo: z.literal('meta_fija'), meta: z.number().finite().positive() }).strict(),
    ]),
  }).strict(),
]);

export const evaluationCriterionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  type: z.enum(['directo', 'actividades', 'participacion', 'hibrido']),
  weight: percentage,
  order: z.number().int().positive().max(32767),
  active: z.boolean(),
  subcriteria: z.array(evaluationSubcriterionSchema),
}).strict();

export type EvaluationCriterionInput = z.infer<typeof evaluationCriterionSchema>;
export type EvaluationSubcriterionInput = z.infer<typeof evaluationSubcriterionSchema>;
