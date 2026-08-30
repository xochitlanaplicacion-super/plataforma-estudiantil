import { z } from 'zod';

import { assertGrade10, percentage100ToGrade10 } from './scale';

const exerciseResultResponseSchema = z.object({
  status: z.enum(['saved', 'locked', 'expired']),
  saved: z.boolean(),
  replayed: z.boolean().optional(),
  sourceId: z.string().uuid().optional(),
  grade: z.number().min(0).max(10).optional(),
  attemptGrade: z.number().min(0).max(10).optional(),
  rawPercentage: z.number().min(0).max(100).optional(),
  rowVersion: z.number().int().positive().optional(),
  attempts: z.number().int().nonnegative().optional(),
  blocked: z.boolean().optional(),
  correlationId: z.string().uuid().optional(),
  message: z.string().optional(),
});

export type ExerciseResultResponse = z.infer<typeof exerciseResultResponseSchema>;

export function validateAutomaticAttempt(input: {
  hits: number;
  total: number;
  rawPercentage: number;
}) {
  if (!Number.isInteger(input.hits) || !Number.isInteger(input.total)
      || input.total <= 0 || input.hits < 0 || input.hits > input.total) {
    throw new RangeError('El resultado del intento es inválido.');
  }
  const calculated = (input.hits * 100) / input.total;
  if (!Number.isFinite(input.rawPercentage)
      || Math.abs(calculated - input.rawPercentage) > 0.01) {
    throw new RangeError('El porcentaje no coincide con los aciertos del intento.');
  }
  return {
    rawPercentage: input.rawPercentage,
    grade: percentage100ToGrade10(input.rawPercentage),
  };
}

export function validateDescriptiveGrade(grade: number) {
  return assertGrade10(grade);
}

export function parseExerciseResultResponse(value: unknown): ExerciseResultResponse {
  return exerciseResultResponseSchema.parse(value);
}

export function academicExerciseErrorMessage(error: { message?: string } | null) {
  const message = error?.message || '';
  if (message.includes('ACADEMIC_VERSION_CONFLICT')) {
    return 'La calificación cambió en otra sesión. Actualiza la lista e inténtalo de nuevo.';
  }
  if (message.includes('ACADEMIC_SCOPE_CLOSED')) {
    return 'El periodo de evaluación está cerrado y ya no admite cambios.';
  }
  if (message.includes('ACADEMIC_ACTIVE_LINK_NOT_FOUND')) {
    return 'El ejercicio aún no tiene un periodo y criterio de evaluación activos.';
  }
  if (message.includes('ACADEMIC_ENROLLMENT_NOT_FOUND')) {
    return 'El alumno no tiene una inscripción activa para esta asignación.';
  }
  if (message.includes('ACADEMIC_') || message.includes('permission denied')) {
    return 'No tienes permiso para guardar este resultado en su contexto académico.';
  }
  return message || 'No se pudo guardar el resultado académico.';
}
