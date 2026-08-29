import type { AcademicContextDto, AcademicMutationResultDto } from './dto';

export const ACADEMIC_GRADEBOOK_MAX_STUDENTS = 200 as const;
export const ACADEMIC_GRADEBOOK_MAX_CELLS = 10_000 as const;

export type AcademicGradeState =
  | 'sin_capturar'
  | 'pendiente'
  | 'entregado'
  | 'tardio'
  | 'no_entregado'
  | 'justificado'
  | 'calificado';

export type AcademicGradeSourceType =
  | 'directCriterion'
  | 'automaticExercise'
  | 'descriptiveSubmission'
  | 'participation';

export interface AcademicGradebookStudentDto {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  enrollmentCode: string | null;
}

export interface AcademicGradebookColumnDto {
  id: string;
  label: string;
  criterionName: string;
  subcriterionName: string | null;
  criterionId: string;
  subcriterionId: string | null;
  sourceType: AcademicGradeSourceType;
  exerciseId: string | null;
  editable: boolean;
  scale: '0-10' | '0-1';
  order: number;
}

export interface AcademicGradebookCellDto {
  enrollmentId: string;
  columnId: string;
  sourceId: string | null;
  sourceType: AcademicGradeSourceType;
  criterionId: string;
  subcriterionId: string | null;
  state: AcademicGradeState;
  grade: number | null;
  observation: string | null;
  rowVersion: number;
  updatedAt: string | null;
  editable: boolean;
}

export interface AcademicGradebookSchemeDto {
  id: string;
  name: string;
  version: number;
  passingGrade: number;
  displayDecimals: 0 | 1 | 2;
}

export interface AcademicGradebookWorkspaceDto {
  context: AcademicContextDto;
  scheme: AcademicGradebookSchemeDto | null;
  periodState: string;
  closed: boolean;
  students: AcademicGradebookStudentDto[];
  columns: AcademicGradebookColumnDto[];
  cells: AcademicGradebookCellDto[];
  studentCount: number;
  truncated: boolean;
  loadedAt: string;
}

export interface AcademicGradebookSaveReceiptDto extends AcademicMutationResultDto {
  requestedItems: number;
}
