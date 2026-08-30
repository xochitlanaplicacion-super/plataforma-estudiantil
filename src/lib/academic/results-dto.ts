import type { AcademicCalculationBreakdown } from '@/lib/academic-grading/calculation';

import type { AcademicContextDto, AcademicPageDto } from './dto';

export const ACADEMIC_RESULTS_MAX_STUDENTS = 200 as const;
export const ACADEMIC_RESULTS_MAX_SOURCE_ROWS = 10_000 as const;
export const ACADEMIC_RESULTS_EXPORT_MAX_ROWS = 1_000 as const;
export const ACADEMIC_RESULTS_EXPORT_MAX_BYTES = 1_048_576 as const;

export type AcademicPublishedResultState = 'provisional' | 'final' | 'reopened';

export interface AcademicResultCriterionDto {
  criterionId: string;
  label: string;
  originalWeight: string;
  effectiveWeight: string;
  canonicalGrade: string | null;
  contributionToTotal: string;
  complete: boolean;
}

export interface AcademicResultBaseDto {
  assignmentId: string;
  enrollmentId: string;
  cycleId: string;
  cycleName: string;
  subjectId: string;
  subjectName: string;
  groupId: string;
  groupName: string;
  teacherId: string;
  teacherName: string;
  periodId: string;
  periodName: string;
  periodState: string;
  schemeId: string;
  schemeVersion: number;
  passingGrade: number;
  displayDecimals: 0 | 1 | 2;
  publicationState: AcademicPublishedResultState;
  closureVersion: number | null;
  closedAt: string | null;
  exactGrade: string | null;
  displayGrade: string | null;
  complete: boolean;
  sourceCount: number;
  resolvedSourceCount: number;
  missingSourceCount: number;
  progressPercent: number;
  criteria: AcademicResultCriterionDto[];
  warnings: AcademicCalculationBreakdown['warnings'];
}

export interface AcademicStudentResultDto extends AcademicResultBaseDto {}

export interface AcademicTenantStudentResultDto extends AcademicResultBaseDto {
  studentId: string;
  studentName: string;
  enrollmentCode: string | null;
}

export interface AcademicStudentResultsDto extends AcademicPageDto<AcademicStudentResultDto> {
  cycles: Array<{ id: string; name: string }>;
  periods: Array<{ id: string; cycleId: string; name: string; state: string }>;
  generatedAt: string;
}

export interface AcademicTenantResultsSummaryDto {
  visibleStudents: number;
  withGrade: number;
  complete: number;
  missing: number;
  provisional: number;
  final: number;
  reopened: number;
  average: string | null;
  captureProgressPercent: number;
}

export interface AcademicTenantResultsDto {
  context: AcademicContextDto;
  periodId: string;
  periodName: string;
  periodState: string;
  closureVersion: number | null;
  results: AcademicPageDto<AcademicTenantStudentResultDto>;
  summary: AcademicTenantResultsSummaryDto;
  generatedAt: string;
}

export interface AcademicResultsExportDto {
  filename: string;
  mimeType: 'text/csv;charset=utf-8';
  content: string;
  rowCount: number;
  byteLength: number;
}
