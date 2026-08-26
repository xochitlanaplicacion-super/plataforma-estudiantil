import type { Grade10 } from './scale';

export type AcademicRole = 'superuser' | 'admin' | 'profesor' | 'alumno';
export type AcademicPeriodState = 'borrador' | 'activo' | 'cerrado';
export type AcademicResultState = 'sin_capturar' | 'calificado' | 'no_entrego' | 'justificado';
export type GradeRoundingMode = 'half_up';

export interface TenantAcademicContext {
  tenantId: string;
  userId: string;
  role: AcademicRole;
  userStatus: 'activo' | 'inactivo' | 'suspendido';
  tenantStatus: 'activo' | 'suspendido' | 'cancelado' | 'provisionando';
}

export interface AcademicScope {
  cycleId: string;
  periodId: string;
  assignmentId: string;
  levelId: string;
  careerId: string | null;
  gradeId: string;
  groupId: string;
  subjectId: string;
}

export interface InstitutionalGradingRules {
  passingGrade: Grade10;
  displayDecimals: 0 | 1 | 2;
  roundingMode: GradeRoundingMode;
  notSubmittedTreatment: 'zero_on_close';
  justifiedTreatment: 'exclude';
  reopenRoles: ReadonlyArray<Extract<AcademicRole, 'superuser' | 'admin'>>;
}

export interface GradeMutationCommand {
  tenantId: string;
  actorId: string;
  assignmentId: string;
  enrollmentId: string;
  periodId: string;
  criterionId: string;
  resultState: AcademicResultState;
  grade: Grade10 | null;
  reason: string;
  expectedRowVersion: number;
  idempotencyKey: string;
}

export interface GradeMutationResult {
  gradeResultId: string;
  exactGrade: Grade10 | null;
  rowVersion: number;
  auditId: string;
  updatedAt: string;
}
