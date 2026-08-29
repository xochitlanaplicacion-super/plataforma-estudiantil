import type { Json } from '@/lib/database.types';

export type AcademicCycleState = 'borrador' | 'activo' | 'cerrado' | 'archivado';
export type AcademicPeriodState = 'borrador' | 'activo' | 'cerrado';
export type AcademicSchemeState = 'borrador' | 'activo' | 'archivado';
export type AcademicCriterionType = 'directo' | 'actividades' | 'participacion' | 'hibrido';
export type AcademicSubcriterionType = Exclude<AcademicCriterionType, 'hibrido'>;

export interface AcademicCycleConfigurationDto {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  state: AcademicCycleState;
  timezone: string;
  updatedAt: string;
}

export interface AcademicPeriodConfigurationDto {
  id: string;
  cycleId: string;
  name: string;
  order: number;
  startsOn: string;
  endsOn: string;
  semanticColor: 'primary' | 'secondary' | 'accent' | 'muted';
  state: AcademicPeriodState;
  lockedAt: string | null;
  updatedAt: string;
}

export interface AcademicAssignmentOptionDto {
  id: string;
  cycleId: string;
  levelId: string;
  levelName: string;
  careerId: string;
  careerName: string;
  gradeId: string;
  gradeName: string;
  groupId: string;
  groupName: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
}

export interface AcademicSubcriterionConfigurationDto {
  id: string;
  criterionId: string;
  name: string;
  type: AcademicSubcriterionType;
  internalWeight: number;
  order: number;
  configuration: Json;
  active: boolean;
  updatedAt: string;
}

export interface AcademicCriterionConfigurationDto {
  id: string;
  schemeId: string;
  name: string;
  type: AcademicCriterionType;
  weight: number;
  order: number;
  active: boolean;
  updatedAt: string;
  subcriteria: AcademicSubcriterionConfigurationDto[];
}

export interface AcademicSchemeConfigurationDto {
  id: string;
  cycleId: string;
  assignmentId: string;
  periodId: string;
  name: string;
  scale: '0-10';
  passingGrade: number;
  displayDecimals: 0 | 1 | 2;
  roundingMode: 'half_up';
  missingRule: 'zero_on_close';
  missingValue: 0;
  excusedRule: 'exclude';
  state: AcademicSchemeState;
  version: number;
  copiedFromId: string | null;
  updatedAt: string;
  criteria: AcademicCriterionConfigurationDto[];
}

export interface AcademicConfigurationDto {
  cycles: AcademicCycleConfigurationDto[];
  periods: AcademicPeriodConfigurationDto[];
  assignments: AcademicAssignmentOptionDto[];
  schemes: AcademicSchemeConfigurationDto[];
}

export interface AcademicConfigurationMutationDto {
  id: string;
  updatedAt: string;
}

export interface AcademicSchemeVersionMutationDto {
  schemeId: string;
  state: AcademicSchemeState;
  version: number;
}
