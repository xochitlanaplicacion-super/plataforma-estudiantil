export const ACADEMIC_MUTATION_MAX_ROWS = 100 as const;

export type AcademicSourceType =
  | 'directCriterion'
  | 'automaticExercise'
  | 'descriptiveSubmission';

export type AcademicGradeState =
  | 'sin_capturar'
  | 'pendiente'
  | 'entregado'
  | 'tardio'
  | 'no_entregado'
  | 'justificado'
  | 'calificado';

export interface AcademicGradeMutationItem {
  sourceType: AcademicSourceType;
  sourceId?: string | null;
  enrollmentId: string;
  criterionId?: string;
  subcriterionId?: string | null;
  state: AcademicGradeState;
  grade: number | null;
  observation?: string | null;
  expectedRowVersion: number;
}

export interface EditAcademicGradesRpcArgs {
  p_asignacion_id: string;
  p_periodo_id: string;
  p_items: AcademicGradeMutationItem[];
  p_motivo: string;
  p_idempotency_key: string;
  p_correlation_id?: string | null;
}

export interface AcademicGradeMutationResultItem {
  sourceType: AcademicSourceType;
  sourceId: string;
  rowVersion: number;
  state: AcademicGradeState;
  grade: number | null;
}

export interface EditAcademicGradesRpcResult {
  status: 'saved';
  replayed: boolean;
  correlationId: string;
  items: AcademicGradeMutationResultItem[];
}

export interface AcademicClosureRpcArgs {
  p_asignacion_id: string;
  p_periodo_id: string;
  p_motivo: string;
  p_idempotency_key: string;
  p_correlation_id?: string | null;
}

export interface AcademicClosureRpcResult {
  status: 'closed' | 'reopened';
  replayed: boolean;
  correlationId: string;
  version: number;
  snapshotCount: number;
}

export interface AcademicClosureStudentPreview {
  enrollmentId: string;
  complete: boolean;
  exactGrade: string | null;
  displayGrade: string | null;
  warnings: Array<{ code: string }>;
}

export interface AcademicClosurePreview {
  assignmentId: string;
  periodId: string;
  totalCount: number;
  missingCount: number;
  canClose: boolean;
  students: AcademicClosureStudentPreview[];
}

export type AcademicSaveState =
  | { status: 'idle' }
  | { status: 'saving'; idempotencyKey: string }
  | { status: 'saved'; correlationId: string; replayed: boolean }
  | { status: 'conflict'; code: AcademicMutationErrorCode; message: string }
  | { status: 'error'; code: AcademicMutationErrorCode; message: string };

export type AcademicMutationErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'TRANSIENT'
  | 'UNKNOWN';

export interface AcademicMutationError {
  code: AcademicMutationErrorCode;
  httpStatus: 400 | 401 | 403 | 404 | 409 | 422 | 503;
  message: string;
  retryable: boolean;
}

interface RpcErrorLike {
  code?: string | null;
  message?: string | null;
  status?: number | null;
  statusCode?: number | null;
}

const STATUS_BY_SQLSTATE: Readonly<Record<string, AcademicMutationError['httpStatus']>> = {
  PT400: 400,
  PT401: 401,
  PT403: 403,
  PT404: 404,
  PT409: 409,
  PT422: 422,
};

const TRANSIENT_SQLSTATES = new Set(['40001', '40P01', '55P03']);
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function mapAcademicMutationError(error: RpcErrorLike): AcademicMutationError {
  const rawStatus = error.code ? STATUS_BY_SQLSTATE[error.code] : undefined;
  const statusCandidate = rawStatus ?? error.status ?? error.statusCode;
  const isTransient =
    (error.code ? TRANSIENT_SQLSTATES.has(error.code) : false) ||
    (statusCandidate ? TRANSIENT_HTTP_STATUSES.has(statusCandidate) : false);
  const httpStatus: AcademicMutationError['httpStatus'] = isTransient
    ? 503
    : statusCandidate === 400 || statusCandidate === 401 || statusCandidate === 403 ||
        statusCandidate === 404 || statusCandidate === 409 || statusCandidate === 422
      ? statusCandidate
      : 400;
  const code: AcademicMutationErrorCode = isTransient
    ? 'TRANSIENT'
    : httpStatus === 400
      ? 'BAD_REQUEST'
      : httpStatus === 401
        ? 'UNAUTHENTICATED'
        : httpStatus === 403
          ? 'FORBIDDEN'
          : httpStatus === 404
            ? 'NOT_FOUND'
            : httpStatus === 409
              ? 'CONFLICT'
              : httpStatus === 422
                ? 'UNPROCESSABLE'
                : 'UNKNOWN';
  return {
    code,
    httpStatus,
    message: error.message?.trim() || 'No fue posible guardar la calificación.',
    retryable: isTransient,
  };
}

export function shouldRetryAcademicMutation(
  error: RpcErrorLike,
  options: { hasIdempotencyKey: boolean; attempt: number; maxAttempts?: number },
): boolean {
  const maxAttempts = options.maxAttempts ?? 3;
  return (
    options.hasIdempotencyKey &&
    options.attempt < maxAttempts &&
    mapAcademicMutationError(error).retryable
  );
}

export function toAcademicSaveState(error: RpcErrorLike): AcademicSaveState {
  const mapped = mapAcademicMutationError(error);
  if (mapped.httpStatus === 409) {
    return { status: 'conflict', code: mapped.code, message: mapped.message };
  }
  return { status: 'error', code: mapped.code, message: mapped.message };
}
