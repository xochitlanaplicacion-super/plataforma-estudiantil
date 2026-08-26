import type {
  AcademicScope,
  GradeMutationCommand,
  InstitutionalGradingRules,
  TenantAcademicContext,
} from '@/lib/academic-grading/contracts';
import { assertGrade10 } from '@/lib/academic-grading/scale';

// All IDs and names are synthetic. They must never be replaced with production PII.
export const tenantAContext: TenantAcademicContext = {
  tenantId: '00000000-0000-4000-8000-0000000000a1',
  userId: '00000000-0000-4000-8000-0000000000b1',
  role: 'profesor',
  userStatus: 'activo',
  tenantStatus: 'activo',
};

export const tenantBContext: TenantAcademicContext = {
  ...tenantAContext,
  tenantId: '00000000-0000-4000-8000-0000000000a2',
  userId: '00000000-0000-4000-8000-0000000000b2',
};

export const academicScopeA: AcademicScope = {
  cycleId: '00000000-0000-4000-8000-000000000101',
  periodId: '00000000-0000-4000-8000-000000000102',
  assignmentId: '00000000-0000-4000-8000-000000000103',
  levelId: '00000000-0000-4000-8000-000000000104',
  careerId: null,
  gradeId: '00000000-0000-4000-8000-000000000105',
  groupId: '00000000-0000-4000-8000-000000000106',
  subjectId: '00000000-0000-4000-8000-000000000107',
};

export const approvedRulesFixture: InstitutionalGradingRules = {
  passingGrade: assertGrade10(6),
  displayDecimals: 1,
  roundingMode: 'half_up',
  notSubmittedTreatment: 'zero_on_close',
  justifiedTreatment: 'exclude',
  reopenRoles: ['superuser', 'admin'],
};

export const gradeMutationFixture: GradeMutationCommand = {
  tenantId: tenantAContext.tenantId,
  actorId: tenantAContext.userId,
  assignmentId: academicScopeA.assignmentId,
  enrollmentId: '00000000-0000-4000-8000-000000000108',
  periodId: academicScopeA.periodId,
  criterionId: '00000000-0000-4000-8000-000000000109',
  resultState: 'calificado',
  grade: assertGrade10(8.5),
  reason: 'Fixture sintético de prueba',
  expectedRowVersion: 1,
  idempotencyKey: '00000000-0000-4000-8000-000000000110',
};
