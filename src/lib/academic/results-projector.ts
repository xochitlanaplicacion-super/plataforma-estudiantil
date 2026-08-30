import type { Json, Tables } from '@/lib/database.types';
import {
  calculateAcademicGrade,
  rowsToCalculationInput,
  type AcademicCalculationBreakdown,
} from '@/lib/academic-grading/calculation';

import type {
  AcademicPublishedResultState,
  AcademicResultBaseDto,
  AcademicResultCriterionDto,
  AcademicTenantResultsSummaryDto,
} from './results-dto';

type StudentGradeRow = Tables<'vista_calificaciones_alumno'>;
type BreakdownRow = Tables<'vista_desglose_calificacion'>;
type SourceRow = StudentGradeRow | BreakdownRow;
type ClosureRow = Pick<Tables<'cierres_calificaciones'>,
  'estado' | 'version_cierre' | 'resultado_exacto' | 'resultado_visual'
  | 'breakdown' | 'closed_at' | 'esquema_version'>;

export interface AcademicResultProjectionContext {
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
}

const RESOLVED_STATES = new Set(['calificado', 'justificado', 'no_entregado']);

function isObject(value: Json | null): value is Record<string, Json | undefined> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: Json | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function asBoolean(value: Json | undefined): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function closureBreakdown(value: Json): AcademicCalculationBreakdown | null {
  if (!isObject(value)) return null;
  const criteria = value.criteria;
  const warnings = value.warnings;
  const decimals = value.displayDecimals;
  if (
    value.engineVersion !== 'academic-deterministic-v1'
    || value.scale !== '0-10'
    || !Array.isArray(criteria)
    || !Array.isArray(warnings)
    || (decimals !== 0 && decimals !== 1 && decimals !== 2)
  ) return null;
  return value as unknown as AcademicCalculationBreakdown;
}

function criteriaFromBreakdown(result: AcademicCalculationBreakdown): AcademicResultCriterionDto[] {
  return result.criteria.map((criterion) => ({
    criterionId: criterion.criterionId,
    label: criterion.label,
    originalWeight: criterion.originalWeight,
    effectiveWeight: criterion.effectiveWeight,
    canonicalGrade: criterion.canonicalGrade,
    contributionToTotal: criterion.contributionToTotal,
    complete: criterion.canonicalGrade !== null,
  }));
}

function formatGrade(value: number, decimals: 0 | 1 | 2): string {
  return value.toFixed(decimals);
}

function emptyCalculation(decimals: 0 | 1 | 2): AcademicCalculationBreakdown {
  return {
    engineVersion: 'academic-deterministic-v1',
    scale: '0-10',
    exactGrade: null,
    displayGrade: null,
    displayDecimals: decimals,
    complete: false,
    criteria: [],
    warnings: [{
      code: 'NO_COMPUTABLE_CRITERIA',
      criterionId: null,
      subcriterionId: null,
      sourceId: null,
    }],
  };
}

export function calculateLiveAcademicResult(
  rows: readonly SourceRow[],
  periodState: string,
  displayDecimals: 0 | 1 | 2,
): AcademicCalculationBreakdown {
  if (rows.length === 0) return emptyCalculation(displayDecimals);
  return calculateAcademicGrade(rowsToCalculationInput(rows as readonly BreakdownRow[], {
    periodState: periodState as 'borrador' | 'activo' | 'cerrado',
    displayDecimals,
    roundingMode: 'half_up',
  }));
}

export function projectAcademicResult(input: {
  context: AcademicResultProjectionContext;
  rows: readonly SourceRow[];
  latestClosure: ClosureRow | null;
}): AcademicResultBaseDto {
  const live = calculateLiveAcademicResult(
    input.rows,
    input.context.periodState,
    input.context.displayDecimals,
  );
  const closure = input.latestClosure;
  const publicationState: AcademicPublishedResultState = closure?.estado === 'cerrado'
    ? 'final'
    : closure?.estado === 'reabierto'
      ? 'reopened'
      : 'provisional';
  const immutable = publicationState === 'final' && closure
    ? closureBreakdown(closure.breakdown)
    : null;
  const result = immutable ?? live;
  const sourceCount = input.rows.length;
  const resolvedSourceCount = input.rows.filter((row) => RESOLVED_STATES.has(row.estado ?? '')).length;
  const missingSourceCount = Math.max(0, sourceCount - resolvedSourceCount);

  return {
    ...input.context,
    publicationState,
    closureVersion: closure?.version_cierre ?? null,
    closedAt: closure?.closed_at ?? null,
    schemeVersion: publicationState === 'final' && closure
      ? closure.esquema_version
      : input.context.schemeVersion,
    exactGrade: publicationState === 'final' && closure
      ? closure.resultado_exacto.toFixed(4)
      : result.exactGrade,
    displayGrade: publicationState === 'final' && closure
      ? formatGrade(closure.resultado_visual, input.context.displayDecimals)
      : result.displayGrade,
    complete: publicationState === 'final' || result.complete,
    sourceCount,
    resolvedSourceCount,
    missingSourceCount,
    progressPercent: sourceCount === 0 ? 0 : Math.round((resolvedSourceCount / sourceCount) * 100),
    criteria: criteriaFromBreakdown(result),
    warnings: result.warnings,
  };
}

export function summarizeTenantResults(
  rows: readonly AcademicResultBaseDto[],
): AcademicTenantResultsSummaryDto {
  const numeric = rows
    .map((row) => row.exactGrade === null ? null : Number(row.exactGrade))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const resolved = rows.reduce((sum, row) => sum + row.resolvedSourceCount, 0);
  const sources = rows.reduce((sum, row) => sum + row.sourceCount, 0);
  return {
    visibleStudents: rows.length,
    withGrade: numeric.length,
    complete: rows.filter((row) => row.complete).length,
    missing: rows.filter((row) => !row.complete).length,
    provisional: rows.filter((row) => row.publicationState === 'provisional').length,
    final: rows.filter((row) => row.publicationState === 'final').length,
    reopened: rows.filter((row) => row.publicationState === 'reopened').length,
    average: numeric.length === 0
      ? null
      : (numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(2),
    captureProgressPercent: sources === 0 ? 0 : Math.round((resolved / sources) * 100),
  };
}

export function averageAcademicResults(
  rows: readonly Pick<AcademicResultBaseDto, 'exactGrade'>[],
  decimals: 0 | 1 | 2 = 1,
): string | null {
  const numeric = rows
    .map((row) => row.exactGrade === null ? null : Number(row.exactGrade))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return numeric.length === 0
    ? null
    : (numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(decimals);
}

export function parseClosureComplete(value: Json): boolean | null {
  if (!isObject(value)) return null;
  return asBoolean(value.complete);
}

export function parseClosureDisplayGrade(value: Json): string | null {
  if (!isObject(value)) return null;
  return asString(value.displayGrade);
}
