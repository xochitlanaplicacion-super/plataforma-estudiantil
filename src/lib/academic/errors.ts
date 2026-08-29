import { ZodError } from 'zod';

import type {
  AcademicActionFailureStatus,
  AcademicActionResult,
  AcademicPublicErrorCode,
  AcademicPublicErrorDto,
} from './dto';

export type AcademicApplicationErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'closed'
  | 'disabled'
  | 'timeout'
  | 'unexpected';

const PUBLIC_ERROR_BY_KIND: Readonly<
  Record<AcademicApplicationErrorKind, AcademicPublicErrorDto>
> = {
  unauthenticated: {
    code: 'ACADEMIC_UNAUTHENTICATED',
    message: 'Tu sesión no es válida o expiró.',
    httpStatus: 401,
  },
  forbidden: {
    code: 'ACADEMIC_FORBIDDEN',
    message: 'No tienes autorización para realizar esta operación académica.',
    httpStatus: 403,
  },
  not_found: {
    code: 'ACADEMIC_NOT_FOUND',
    message: 'El recurso académico no existe o no está disponible.',
    httpStatus: 404,
  },
  conflict: {
    code: 'ACADEMIC_CONFLICT',
    message: 'La información cambió mientras trabajabas. Actualiza antes de continuar.',
    httpStatus: 409,
  },
  validation: {
    code: 'ACADEMIC_VALIDATION',
    message: 'Los datos académicos enviados no son válidos.',
    httpStatus: 422,
  },
  closed: {
    code: 'ACADEMIC_CLOSED',
    message: 'Las calificaciones de este alcance están cerradas.',
    httpStatus: 409,
  },
  disabled: {
    code: 'ACADEMIC_DISABLED',
    message: 'La nueva gestión de calificaciones todavía no está habilitada para esta institución.',
    httpStatus: 503,
  },
  timeout: {
    code: 'ACADEMIC_TIMEOUT',
    message: 'La operación académica excedió el tiempo permitido.',
    httpStatus: 504,
  },
  unexpected: {
    code: 'ACADEMIC_UNEXPECTED',
    message: 'No fue posible completar la operación académica.',
    httpStatus: 500,
  },
};

export class AcademicApplicationError extends Error {
  readonly kind: AcademicApplicationErrorKind;
  readonly publicError: AcademicPublicErrorDto;

  constructor(kind: AcademicApplicationErrorKind, options?: { cause?: unknown }) {
    const publicError = PUBLIC_ERROR_BY_KIND[kind];
    super(publicError.message, options);
    this.name = 'AcademicApplicationError';
    this.kind = kind;
    this.publicError = { ...publicError };
  }
}

interface SupabaseErrorLike {
  code?: string | null;
  message?: string | null;
  status?: number | null;
  statusCode?: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asSupabaseError(error: unknown): SupabaseErrorLike {
  if (!isRecord(error)) return {};
  return {
    code: typeof error.code === 'string' ? error.code : null,
    message: typeof error.message === 'string' ? error.message : null,
    status: typeof error.status === 'number' ? error.status : null,
    statusCode: typeof error.statusCode === 'number' ? error.statusCode : null,
  };
}

export function mapSupabaseAcademicError(error: unknown): AcademicApplicationError {
  const candidate = asSupabaseError(error);
  const message = candidate.message ?? '';
  const status = candidate.status ?? candidate.statusCode;

  if (message.includes('ACADEMIC_SCOPE_CLOSED')) {
    return new AcademicApplicationError('closed', { cause: error });
  }
  if (candidate.code === 'PT401' || status === 401 || candidate.code === 'PGRST301') {
    return new AcademicApplicationError('unauthenticated', { cause: error });
  }
  if (candidate.code === 'PT403' || status === 403 || candidate.code === '42501') {
    return new AcademicApplicationError('forbidden', { cause: error });
  }
  if (candidate.code === 'PT404' || status === 404 || candidate.code === 'PGRST116') {
    return new AcademicApplicationError('not_found', { cause: error });
  }
  if (
    candidate.code === 'PT409'
    || status === 409
    || ['23503', '23505', '40001', '40P01', '55P03'].includes(candidate.code ?? '')
  ) {
    return new AcademicApplicationError('conflict', { cause: error });
  }
  if (candidate.code === 'PT400' || status === 400) {
    return new AcademicApplicationError('validation', { cause: error });
  }
  if (candidate.code === 'PT422' || status === 422) {
    return new AcademicApplicationError('validation', { cause: error });
  }
  if (['22003', '22023', '23514', 'P0001'].includes(candidate.code ?? '')) {
    return new AcademicApplicationError('validation', { cause: error });
  }
  if (candidate.code === '23P01') {
    return new AcademicApplicationError('conflict', { cause: error });
  }
  return new AcademicApplicationError('unexpected', { cause: error });
}

export function normalizeAcademicError(error: unknown): AcademicApplicationError {
  if (error instanceof AcademicApplicationError) return error;
  if (error instanceof ZodError) {
    return new AcademicApplicationError('validation', { cause: error });
  }
  if (error instanceof Error) {
    if (error.message === 'No autenticado') {
      return new AcademicApplicationError('unauthenticated', { cause: error });
    }
    if (
      error.message === 'No autorizado'
      || error.message === 'Usuario inactivo'
      || error.message === 'Institución suspendida'
      || error.message === 'Perfil sin institución asignada'
    ) {
      return new AcademicApplicationError('forbidden', { cause: error });
    }
  }
  return new AcademicApplicationError('unexpected', { cause: error });
}

function failureStatus(kind: AcademicApplicationErrorKind): AcademicActionFailureStatus {
  return kind === 'timeout' || kind === 'unexpected' ? 'error' : kind;
}

export function academicFailureResult<T>(error: unknown): AcademicActionResult<T> {
  const normalized = normalizeAcademicError(error);
  return {
    ok: false,
    status: failureStatus(normalized.kind),
    error: { ...normalized.publicError },
  };
}

export function academicSuccessResult<T>(
  data: T,
  options: { empty?: boolean } = {},
): AcademicActionResult<T> {
  return { ok: true, status: options.empty ? 'empty' : 'success', data };
}

export function publicErrorCodeFor(kind: AcademicApplicationErrorKind): AcademicPublicErrorCode {
  return PUBLIC_ERROR_BY_KIND[kind].code;
}
