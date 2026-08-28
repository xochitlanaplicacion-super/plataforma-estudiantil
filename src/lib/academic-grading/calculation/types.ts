import type {
  AcademicPeriodState,
  AcademicResultState,
  EvaluationCriterionType,
  EvaluationSubcriterionType,
} from '../contracts';

export type DecimalInput = string | number;
export type CalculationSourceScale = '0-1' | '0-10';
export type CalculationWarningCode =
  | 'PENDING_SOURCE'
  | 'NOT_SUBMITTED_OPEN_PERIOD'
  | 'JUSTIFIED_EXCLUDED'
  | 'ZERO_DENOMINATOR_EXCLUDED'
  | 'NO_COMPUTABLE_SOURCES'
  | 'NO_COMPUTABLE_CRITERIA';

export interface CalculationSource {
  id: string;
  state: AcademicResultState;
  scale: CalculationSourceScale;
  value: DecimalInput | null;
  zeroDenominatorExcluded?: boolean;
}

export interface CalculationSubcriterion {
  id: string;
  label: string;
  type: EvaluationSubcriterionType;
  internalWeight: DecimalInput;
  order: number;
  sources: readonly CalculationSource[];
}

export interface CalculationCriterion {
  id: string;
  label: string;
  type: EvaluationCriterionType;
  weight: DecimalInput;
  order: number;
  sources: readonly CalculationSource[];
  subcriteria: readonly CalculationSubcriterion[];
}

export interface AcademicCalculationInput {
  periodState: AcademicPeriodState;
  displayDecimals: 0 | 1 | 2;
  roundingMode: 'half_up';
  criteria: readonly CalculationCriterion[];
}

export interface CalculationWarning {
  code: CalculationWarningCode;
  criterionId: string | null;
  subcriterionId: string | null;
  sourceId: string | null;
}

export interface SourceBreakdown {
  sourceId: string;
  state: AcademicResultState;
  included: boolean;
  ratio: string | null;
  canonicalGrade: string | null;
}

export interface SubcriterionBreakdown {
  subcriterionId: string;
  label: string;
  originalWeight: string;
  effectiveWeight: string;
  ratio: string | null;
  canonicalGrade: string | null;
  contributionToCriterion: string;
  contributionToTotal: string;
  sources: SourceBreakdown[];
}

export interface CriterionBreakdown {
  criterionId: string;
  label: string;
  originalWeight: string;
  effectiveWeight: string;
  ratio: string | null;
  canonicalGrade: string | null;
  contributionToTotal: string;
  subcriteria: SubcriterionBreakdown[];
  sources: SourceBreakdown[];
}

export interface AcademicCalculationBreakdown {
  engineVersion: 'academic-deterministic-v1';
  scale: '0-10';
  exactGrade: string | null;
  displayGrade: string | null;
  displayDecimals: 0 | 1 | 2;
  complete: boolean;
  criteria: CriterionBreakdown[];
  warnings: CalculationWarning[];
}
