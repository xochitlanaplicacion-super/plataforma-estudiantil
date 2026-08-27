import type { Grade10 } from './scale';

export type AcademicRole = 'superuser' | 'admin' | 'profesor' | 'alumno';
export type AcademicPeriodState = 'borrador' | 'activo' | 'cerrado';
export type EvaluationSchemeState = 'borrador' | 'activo' | 'archivado';
export type AcademicResultState =
  | 'sin_capturar'
  | 'pendiente'
  | 'entregado'
  | 'tardio'
  | 'no_entregado'
  | 'justificado'
  | 'calificado';
export type EvaluationSourceKind =
  | 'automaticExercise'
  | 'descriptiveSubmission'
  | 'directCriterion'
  | 'participation';
export type GradeRoundingMode = 'half_up';
export type EvaluationCriterionType = 'directo' | 'actividades' | 'participacion' | 'hibrido';
export type EvaluationSubcriterionType = Exclude<EvaluationCriterionType, 'hibrido'>;

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

export interface EvaluationPeriodContract {
  id: string;
  tenantId: string;
  cycleId: string;
  name: string;
  order: number;
  startsOn: string;
  endsOn: string;
  semanticColor: 'primary' | 'secondary' | 'accent' | 'muted';
  state: AcademicPeriodState;
}

export interface EvaluationSchemeContract {
  id: string;
  tenantId: string;
  cycleId: string;
  assignmentId: string;
  periodId: string;
  name: string;
  scale: '0-10';
  passingGrade: Grade10;
  displayDecimals: 0 | 1 | 2;
  roundingMode: 'half_up';
  notSubmittedTreatment: 'zero_on_close';
  notSubmittedValue: 0;
  justifiedTreatment: 'exclude';
  state: EvaluationSchemeState;
  version: number;
  copiedFromId: string | null;
}

export type EvaluationSubcriterionConfiguration =
  | Record<string, never>
  | { agregacion: 'promedio' }
  | { modo: 'maximo_grupo' }
  | { modo: 'meta_fija'; meta: number };

export interface EvaluationSubcriterionContract {
  id: string;
  tenantId: string;
  criterionId: string;
  name: string;
  type: EvaluationSubcriterionType;
  internalWeight: number;
  effectiveWeight: number;
  order: number;
  configuration: EvaluationSubcriterionConfiguration;
  active: boolean;
}

export interface EvaluationCriterionContract {
  id: string;
  tenantId: string;
  schemeId: string;
  name: string;
  type: EvaluationCriterionType;
  weight: number;
  order: number;
  active: boolean;
  subcriteria: ReadonlyArray<EvaluationSubcriterionContract>;
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

export interface EvaluationSourceRow {
  sourceId: string;
  sourceKind: EvaluationSourceKind;
  tenantId: string;
  cycleId: string;
  assignmentId: string;
  periodId: string;
  criterionId: string;
  subcriterionId: string | null;
  enrollmentId: string;
  studentId: string;
  exerciseId: string | null;
  state: AcademicResultState;
  grade: Grade10 | null;
  rowVersion: number;
}

export interface EvaluationSourceColumn {
  criterionId: string;
  subcriterionId: string | null;
  sourceKind: EvaluationSourceKind;
  label: string;
  editable: boolean;
}
