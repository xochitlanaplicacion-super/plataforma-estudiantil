import type { Json, Tables } from '@/lib/database.types';
import {
  calculateAcademicGrade,
  rowsToCalculationInput,
  type AcademicCalculationBreakdown,
  type AcademicCalculationInput,
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

export interface AcademicCriterionTemplate {
  id: string;
  label: string;
  type: 'directo' | 'actividades' | 'participacion' | 'hibrido';
  weight: string;
  order: number;
  subcriteria: {
    id: string;
    label: string;
    type: 'directo' | 'actividades' | 'participacion';
    internalWeight: string;
    order: number;
  }[];
}

export interface AcademicOverdueSource {
  exerciseId: string;
  criterionId: string;
  subcriterionId: string | null;
  resultId?: string;
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
  templates?: readonly AcademicCriterionTemplate[],
  overdueSources: readonly AcademicOverdueSource[] = [],
): AcademicCalculationBreakdown {
  if (rows.length === 0 && !templates?.length) return emptyCalculation(displayDecimals);
  const input = rowsToCalculationInput(rows as readonly BreakdownRow[], {
    periodState: periodState as 'borrador' | 'activo' | 'cerrado',
    displayDecimals,
    roundingMode: 'half_up',
  });
  if (templates?.length) {
    const byId = new Map(input.criteria.map((criterion) => [criterion.id, criterion]));
    input.criteria = templates.map((template): AcademicCalculationInput['criteria'][number] => {
      const existing = byId.get(template.id);
      return {
        id: template.id,
        label: template.label,
        type: template.type,
        weight: template.weight,
        order: template.order,
        sources: template.subcriteria.length ? [] : (existing?.sources ?? []),
        subcriteria: template.subcriteria.map((subcriterion) => ({
          id: subcriterion.id,
          label: subcriterion.label,
          type: subcriterion.type,
          internalWeight: subcriterion.internalWeight,
          order: subcriterion.order,
          sources: existing?.subcriteria.find((item) => item.id === subcriterion.id)?.sources ?? [],
        })),
      };
    });
  }
  for (const overdue of overdueSources) {
    const criterion = input.criteria.find((item) => item.id === overdue.criterionId);
    if (!criterion) continue;
    const sources = overdue.subcriterionId
      ? criterion.subcriteria.find((item) => item.id === overdue.subcriterionId)?.sources
      : criterion.sources;
    if (!sources) continue;
    const virtual = {
      id: `virtual-overdue:${overdue.exerciseId}`,
      state: 'no_entregado' as const,
      scale: '0-10' as const,
      value: null,
      virtualOverdue: true,
    };
    (sources as Array<typeof virtual>).push(virtual);
  }
  return calculateAcademicGrade(input);
}

export function projectAcademicResult(input: {
  context: AcademicResultProjectionContext;
  rows: readonly SourceRow[];
  latestClosure: ClosureRow | null;
  criteriaTemplates?: readonly AcademicCriterionTemplate[];
  overdueSources?: readonly AcademicOverdueSource[];
}): AcademicResultBaseDto {
  const activeCriterionIds = input.criteriaTemplates?.length
    ? new Set(input.criteriaTemplates.map((criterion) => criterion.id)) : null;
  const activeRows = activeCriterionIds
    ? input.rows.filter((row) => row.criterio_evaluacion_id && activeCriterionIds.has(row.criterio_evaluacion_id))
    : input.rows;
  const live = calculateLiveAcademicResult(
    activeRows,
    input.context.periodState,
    input.context.displayDecimals,
    input.criteriaTemplates,
    input.overdueSources,
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
  const visibleSourceIds = new Set(activeRows.map((row) => row.fuente_id));
  const sourceCount = activeRows.length + (input.overdueSources?.filter((source) =>
    !source.resultId || !visibleSourceIds.has(source.resultId)).length ?? 0);
  const resolvedSourceCount = activeRows.filter((row) => RESOLVED_STATES.has(row.estado ?? '')).length;
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
    virtualZeroCount: input.overdueSources?.length ?? 0,
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
