import type { Json, Tables } from '@/lib/database.types';
import type { TenantRole } from '@/lib/tenant/context';

export const ACADEMIC_PAGE_DEFAULT_SIZE = 25 as const;
export const ACADEMIC_PAGE_MAX_SIZE = 50 as const;
export const ACADEMIC_MUTATION_MAX_ROWS = 100 as const;
export const ACADEMIC_MUTATION_MAX_BYTES = 262_144 as const;
export const ACADEMIC_READ_TIMEOUT_MS = 12_000 as const;
export const ACADEMIC_WRITE_TIMEOUT_MS = 20_000 as const;

export type AcademicApplicationRole = TenantRole;

export interface AcademicPageRequest {
  page: number;
  pageSize: number;
}

export interface AcademicPageDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface AcademicPeriodContextDto {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  order: number;
  state: string;
}

export interface AcademicContextDto {
  assignmentId: string;
  cycleId: string;
  cycleName: string;
  cycleState: string;
  subjectId: string;
  subjectName: string;
  groupId: string;
  groupName: string;
  teacherId: string;
  teacherName: string;
  active: boolean;
  periods: AcademicPeriodContextDto[];
}

export type AcademicGradebookRowDto = Tables<'vista_libreta_profesor'>;
export type AcademicBreakdownRowDto = Tables<'vista_desglose_calificacion'>;
export type AcademicStudentGradeRowDto = Tables<'vista_calificaciones_alumno'>;

export interface AcademicAuditDto {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorId: string | null;
  createdAt: string | null;
  details: Json | null;
}

export interface AcademicCalculationWarningDto {
  code: string;
  criterionId: string | null;
  subcriterionId: string | null;
  sourceId: string | null;
}

export interface AcademicCalculatedResultDto {
  engineVersion: 'academic-deterministic-v1';
  scale: '0-10';
  exactGrade: string | null;
  displayGrade: string | null;
  displayDecimals: 0 | 1 | 2;
  complete: boolean;
  criteria: Array<Record<string, unknown>>;
  warnings: AcademicCalculationWarningDto[];
}

export interface AcademicClosureStudentPreviewDto {
  enrollmentId: string;
  complete: boolean;
  exactGrade: string | null;
  displayGrade: string | null;
  warnings: Array<{ code: string }>;
}

export interface AcademicClosurePreviewDto {
  assignmentId: string;
  periodId: string;
  totalCount: number;
  missingCount: number;
  canClose: boolean;
  students: AcademicClosureStudentPreviewDto[];
}

export interface AcademicMutationResultItemDto {
  sourceType: 'directCriterion' | 'automaticExercise' | 'descriptiveSubmission';
  sourceId: string;
  rowVersion: number;
  state: string;
  grade: number | null;
}

export interface AcademicMutationResultDto {
  status: 'saved';
  replayed: boolean;
  correlationId: string;
  items: AcademicMutationResultItemDto[];
}

export interface AcademicClosureResultDto {
  status: 'closed' | 'reopened';
  replayed: boolean;
  correlationId: string;
  version: number;
  snapshotCount: number;
}

export type AcademicActionFailureStatus =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'closed'
  | 'disabled'
  | 'error';

export type AcademicPublicErrorCode =
  | 'ACADEMIC_UNAUTHENTICATED'
  | 'ACADEMIC_FORBIDDEN'
  | 'ACADEMIC_NOT_FOUND'
  | 'ACADEMIC_CONFLICT'
  | 'ACADEMIC_VALIDATION'
  | 'ACADEMIC_CLOSED'
  | 'ACADEMIC_DISABLED'
  | 'ACADEMIC_TIMEOUT'
  | 'ACADEMIC_UNEXPECTED';

export interface AcademicPublicErrorDto {
  code: AcademicPublicErrorCode;
  message: string;
  httpStatus: 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503 | 504;
}

export type AcademicActionResult<T> =
  | { ok: true; status: 'success' | 'empty'; data: T }
  | { ok: false; status: AcademicActionFailureStatus; error: AcademicPublicErrorDto };

export type AcademicResourceState<T> =
  | { status: 'loading' }
  | AcademicActionResult<T>;
