import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@/lib/database.types';

export type AcademicReadStatus = 401 | 403 | 404 | 409 | 500;
export type AcademicReadFailureCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unexpected';

export interface AcademicReadFailure {
  ok: false;
  status: AcademicReadStatus;
  code: AcademicReadFailureCode;
  message: string;
}

export type AcademicReadResult<T> =
  | { ok: true; status: 200; data: T }
  | AcademicReadFailure;

export type TeacherGradebookRow = Tables<'vista_libreta_profesor'>;
export type GradeBreakdownRow = Tables<'vista_desglose_calificacion'>;
export type StudentGradeRow = Tables<'vista_calificaciones_alumno'>;

const NEUTRAL_NOT_FOUND: AcademicReadFailure = {
  ok: false,
  status: 404,
  code: 'not_found',
  message: 'El recurso académico no existe o no está disponible.',
};

export function neutralAcademicNotFound(): AcademicReadFailure {
  return { ...NEUTRAL_NOT_FOUND };
}

export function mapAcademicReadError(
  error: Pick<PostgrestError, 'code' | 'message'> & { status?: number },
): AcademicReadFailure {
  if (error.status === 401 || error.code === 'PGRST301' || error.code === 'PGRST302') {
    return {
      ok: false,
      status: 401,
      code: 'unauthenticated',
      message: 'La sesión no es válida o expiró.',
    };
  }
  if (error.status === 403 || error.code === '42501') {
    return {
      ok: false,
      status: 403,
      code: 'forbidden',
      message: 'No tienes autorización para consultar este recurso académico.',
    };
  }
  if (
    error.status === 409
    || ['23503', '23505', '40001', '40P01'].includes(error.code)
  ) {
    return {
      ok: false,
      status: 409,
      code: 'conflict',
      message: 'El recurso cambió durante la operación. Actualiza e inténtalo de nuevo.',
    };
  }
  return {
    ok: false,
    status: 500,
    code: 'unexpected',
    message: 'No fue posible consultar la información académica.',
  };
}

export async function readTeacherGradebook(
  client: SupabaseClient<Database>,
  input: { assignmentId: string; periodId: string },
): Promise<AcademicReadResult<TeacherGradebookRow[]>> {
  const { data, error } = await client
    .from('vista_libreta_profesor')
    .select('*')
    .eq('asignacion_profesor_id', input.assignmentId)
    .eq('periodo_evaluacion_id', input.periodId);

  if (error) return mapAcademicReadError(error);
  return { ok: true, status: 200, data: data ?? [] };
}

export async function readGradeBreakdown(
  client: SupabaseClient<Database>,
  input: { assignmentId: string; enrollmentId: string; periodId: string },
): Promise<AcademicReadResult<GradeBreakdownRow[]>> {
  const { data, error } = await client
    .from('vista_desglose_calificacion')
    .select('*')
    .eq('asignacion_profesor_id', input.assignmentId)
    .eq('inscripcion_alumno_id', input.enrollmentId)
    .eq('periodo_evaluacion_id', input.periodId);

  if (error) return mapAcademicReadError(error);
  return { ok: true, status: 200, data: data ?? [] };
}

export async function readStudentGrades(
  client: SupabaseClient<Database>,
  input: { periodId?: string } = {},
): Promise<AcademicReadResult<StudentGradeRow[]>> {
  let query = client.from('vista_calificaciones_alumno').select('*');
  if (input.periodId) query = query.eq('periodo_evaluacion_id', input.periodId);
  const { data, error } = await query;

  if (error) return mapAcademicReadError(error);
  return { ok: true, status: 200, data: data ?? [] };
}

export async function readStudentGradeSource(
  client: SupabaseClient<Database>,
  sourceId: string,
): Promise<AcademicReadResult<StudentGradeRow>> {
  const { data, error } = await client
    .from('vista_calificaciones_alumno')
    .select('*')
    .eq('fuente_id', sourceId)
    .maybeSingle();

  if (error) return mapAcademicReadError(error);
  if (!data) return neutralAcademicNotFound();
  return { ok: true, status: 200, data };
}
