import {
  formatFixed,
  formatInternal,
  formatWeight,
  INTERNAL_DECIMALS,
  INTERNAL_SCALE,
  parseFixed,
  rescaleHalfUp,
  roundDivideHalfUp,
  WEIGHT_DECIMALS,
  WEIGHT_SCALE,
} from './fixed-decimal';
import type {
  AcademicCalculationBreakdown,
  AcademicCalculationInput,
  CalculationCriterion,
  CalculationSource,
  CalculationWarning,
  CriterionBreakdown,
  SourceBreakdown,
  SubcriterionBreakdown,
} from './types';

const TEN_INTERNAL = 10n * INTERNAL_SCALE;
const HUNDRED_WEIGHT = 100n * WEIGHT_SCALE;

interface EvaluatedSources {
  ratio: bigint | null;
  breakdown: SourceBreakdown[];
}

interface InternalSubcriterion {
  source: CalculationCriterion['subcriteria'][number];
  weight: bigint;
  ratio: bigint | null;
  breakdown: SourceBreakdown[];
}

interface InternalCriterion {
  source: CalculationCriterion;
  weight: bigint;
  ratio: bigint | null;
  sources: SourceBreakdown[];
  subcriteria: InternalSubcriterion[];
}

function validateRange(value: bigint, min: bigint, max: bigint, label: string): bigint {
  if (value < min || value > max) throw new RangeError(`${label} está fuera de rango.`);
  return value;
}

function sourceRatio(
  source: CalculationSource,
  periodState: AcademicCalculationInput['periodState'],
  criterionId: string,
  subcriterionId: string | null,
  warnings: CalculationWarning[],
): SourceBreakdown & { ratioUnits: bigint | null } {
  const context = { criterionId, subcriterionId, sourceId: source.id };
  if (![
    'sin_capturar', 'pendiente', 'entregado', 'tardio',
    'no_entregado', 'justificado', 'calificado',
  ].includes(source.state)) {
    throw new RangeError('La fuente contiene un estado académico desconocido.');
  }
  if (!['0-1', '0-10'].includes(source.scale)) {
    throw new RangeError('La fuente contiene una escala desconocida.');
  }
  if (source.state === 'justificado') {
    if (source.value !== null) throw new RangeError('Un resultado justificado no admite valor.');
    warnings.push({ code: 'JUSTIFIED_EXCLUDED', ...context });
    return { sourceId: source.id, state: source.state, included: false, ratio: null, canonicalGrade: null, ratioUnits: null };
  }
  if (source.state === 'no_entregado') {
    if (source.value !== null) throw new RangeError('Un resultado no entregado no admite valor.');
    if (periodState === 'cerrado') {
      return { sourceId: source.id, state: source.state, included: true, ratio: '0.00000000', canonicalGrade: '0.0000', ratioUnits: 0n };
    }
    warnings.push({ code: 'NOT_SUBMITTED_OPEN_PERIOD', ...context });
    return { sourceId: source.id, state: source.state, included: false, ratio: null, canonicalGrade: null, ratioUnits: null };
  }
  if (source.state !== 'calificado') {
    if (source.value !== null) throw new RangeError(`El estado ${source.state} no admite valor.`);
    warnings.push({
      code: source.zeroDenominatorExcluded ? 'ZERO_DENOMINATOR_EXCLUDED' : 'PENDING_SOURCE',
      ...context,
    });
    return { sourceId: source.id, state: source.state, included: false, ratio: null, canonicalGrade: null, ratioUnits: null };
  }
  if (source.value === null) throw new RangeError('El estado calificado exige valor.');
  const raw = parseFixed(source.value, INTERNAL_DECIMALS, 'El valor de fuente');
  const max = source.scale === '0-1' ? INTERNAL_SCALE : TEN_INTERNAL;
  validateRange(raw, 0n, max, 'El valor de fuente');
  const ratioUnits = source.scale === '0-1' ? raw : roundDivideHalfUp(raw, 10n);
  return {
    sourceId: source.id,
    state: source.state,
    included: true,
    ratio: formatFixed(ratioUnits, INTERNAL_DECIMALS),
    canonicalGrade: formatInternal(ratioUnits * 10n),
    ratioUnits,
  };
}

function evaluateSources(
  sources: readonly CalculationSource[],
  periodState: AcademicCalculationInput['periodState'],
  criterionId: string,
  subcriterionId: string | null,
  warnings: CalculationWarning[],
): EvaluatedSources {
  const withUnits = [...sources]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((source) => sourceRatio(source, periodState, criterionId, subcriterionId, warnings));
  const included = withUnits.filter((item) => item.ratioUnits !== null);
  const ratio = included.length === 0
    ? null
    : roundDivideHalfUp(
      included.reduce((sum, item) => sum + (item.ratioUnits ?? 0n), 0n),
      BigInt(included.length),
    );
  if (ratio === null) warnings.push({ code: 'NO_COMPUTABLE_SOURCES', criterionId, subcriterionId, sourceId: null });
  return { ratio, breakdown: withUnits.map(({ ratioUnits: _ratioUnits, ...item }) => item) };
}

function calculateCriterion(
  criterion: CalculationCriterion,
  periodState: AcademicCalculationInput['periodState'],
  warnings: CalculationWarning[],
): InternalCriterion {
  const weight = validateRange(
    parseFixed(criterion.weight, WEIGHT_DECIMALS, 'El peso del criterio'),
    0n,
    HUNDRED_WEIGHT,
    'El peso del criterio',
  );
  if (criterion.type === 'hibrido' && criterion.subcriteria.length === 0) {
    throw new RangeError('Un criterio híbrido exige subcriterios.');
  }
  if (criterion.subcriteria.length === 0) {
    const evaluated = evaluateSources(criterion.sources, periodState, criterion.id, null, warnings);
    return { source: criterion, weight, ratio: evaluated.ratio, sources: evaluated.breakdown, subcriteria: [] };
  }
  if (criterion.sources.length > 0) throw new RangeError('Un criterio con subcriterios no admite fuentes directas en el padre.');
  const subcriteria = [...criterion.subcriteria]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((subcriterion) => {
      const subWeight = validateRange(
        parseFixed(subcriterion.internalWeight, WEIGHT_DECIMALS, 'El peso interno'),
        0n,
        HUNDRED_WEIGHT,
        'El peso interno',
      );
      const evaluated = evaluateSources(
        subcriterion.sources,
        periodState,
        criterion.id,
        subcriterion.id,
        warnings,
      );
      return { source: subcriterion, weight: subWeight, ratio: evaluated.ratio, breakdown: evaluated.breakdown };
    });
  if (subcriteria.reduce((sum, item) => sum + item.weight, 0n) !== HUNDRED_WEIGHT) {
    throw new RangeError('Los pesos internos deben sumar exactamente 100.0000%.');
  }
  const computable = subcriteria.filter((item) => item.ratio !== null && item.weight > 0n);
  const denominator = computable.reduce((sum, item) => sum + item.weight, 0n);
  const ratio = denominator === 0n
    ? null
    : roundDivideHalfUp(
      computable.reduce((sum, item) => sum + (item.ratio ?? 0n) * item.weight, 0n),
      denominator,
    );
  return { source: criterion, weight, ratio, sources: [], subcriteria };
}

function gradeContribution(ratio: bigint, weight: bigint, denominator: bigint): bigint {
  return roundDivideHalfUp(ratio * 10n * weight, denominator);
}

export function calculateAcademicGrade(input: AcademicCalculationInput): AcademicCalculationBreakdown {
  if (input.roundingMode !== 'half_up') throw new RangeError('Sólo se admite redondeo half_up.');
  const warnings: CalculationWarning[] = [];
  const criteria = [...input.criteria]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((criterion) => calculateCriterion(criterion, input.periodState, warnings));
  if (criteria.reduce((sum, item) => sum + item.weight, 0n) !== HUNDRED_WEIGHT) {
    throw new RangeError('Los pesos de criterios deben sumar exactamente 100.0000%.');
  }
  const computable = criteria.filter((item) => item.ratio !== null && item.weight > 0n);
  const denominator = computable.reduce((sum, item) => sum + item.weight, 0n);
  if (denominator === 0n) {
    warnings.push({ code: 'NO_COMPUTABLE_CRITERIA', criterionId: null, subcriterionId: null, sourceId: null });
  }
  const criterionBreakdowns: CriterionBreakdown[] = criteria.map((criterion) => {
    const effectiveWeight = criterion.ratio === null || denominator === 0n
      ? 0n
      : roundDivideHalfUp(criterion.weight * HUNDRED_WEIGHT, denominator);
    const contribution = criterion.ratio === null || denominator === 0n
      ? 0n
      : gradeContribution(criterion.ratio, criterion.weight, denominator);
    const availableSubWeight = criterion.subcriteria
      .filter((item) => item.ratio !== null && item.weight > 0n)
      .reduce((sum, item) => sum + item.weight, 0n);
    const subcriteria: SubcriterionBreakdown[] = criterion.subcriteria.map((subcriterion) => {
      const effectiveInternal = subcriterion.ratio === null || availableSubWeight === 0n
        ? 0n
        : roundDivideHalfUp(subcriterion.weight * HUNDRED_WEIGHT, availableSubWeight);
      const contributionToCriterion = subcriterion.ratio === null || availableSubWeight === 0n
        ? 0n
        : gradeContribution(subcriterion.ratio, subcriterion.weight, availableSubWeight);
      const contributionToTotal = subcriterion.ratio === null || availableSubWeight === 0n || denominator === 0n
        ? 0n
        : roundDivideHalfUp(
          subcriterion.ratio * 10n * subcriterion.weight * criterion.weight,
          availableSubWeight * denominator,
        );
      return {
        subcriterionId: subcriterion.source.id,
        label: subcriterion.source.label,
        originalWeight: formatWeight(subcriterion.weight),
        effectiveWeight: formatWeight(effectiveInternal),
        ratio: subcriterion.ratio === null ? null : formatFixed(subcriterion.ratio, INTERNAL_DECIMALS),
        canonicalGrade: subcriterion.ratio === null ? null : formatInternal(subcriterion.ratio * 10n),
        contributionToCriterion: formatInternal(contributionToCriterion),
        contributionToTotal: formatInternal(contributionToTotal),
        sources: subcriterion.breakdown,
      };
    });
    return {
      criterionId: criterion.source.id,
      label: criterion.source.label,
      originalWeight: formatWeight(criterion.weight),
      effectiveWeight: formatWeight(effectiveWeight),
      ratio: criterion.ratio === null ? null : formatFixed(criterion.ratio, INTERNAL_DECIMALS),
      canonicalGrade: criterion.ratio === null ? null : formatInternal(criterion.ratio * 10n),
      contributionToTotal: formatInternal(contribution),
      subcriteria,
      sources: criterion.sources,
    };
  });
  const totalUnits = denominator === 0n
    ? null
    : criterionBreakdowns.reduce(
      (sum, criterion) => sum + parseFixed(criterion.contributionToTotal, INTERNAL_DECIMALS, 'La contribución'),
      0n,
    );
  const exactUnits = totalUnits === null ? null : rescaleHalfUp(totalUnits, INTERNAL_DECIMALS, 4);
  return {
    engineVersion: 'academic-deterministic-v1',
    scale: '0-10',
    exactGrade: exactUnits === null ? null : formatFixed(exactUnits, 4),
    displayGrade: exactUnits === null
      ? null
      : formatFixed(rescaleHalfUp(exactUnits, 4, input.displayDecimals), input.displayDecimals),
    displayDecimals: input.displayDecimals,
    complete: warnings.every((warning) => ![
      'PENDING_SOURCE', 'NOT_SUBMITTED_OPEN_PERIOD', 'NO_COMPUTABLE_SOURCES', 'NO_COMPUTABLE_CRITERIA',
      'ZERO_DENOMINATOR_EXCLUDED',
    ].includes(warning.code)),
    criteria: criterionBreakdowns,
    warnings,
  };
}

export function isLegacyEquivalent(
  legacyPercentage: number | string,
  canonicalGrade: string | null,
  tolerance: number | string = '0.0000',
): boolean {
  if (canonicalGrade === null) return false;
  const legacy = validateRange(
    parseFixed(legacyPercentage, INTERNAL_DECIMALS, 'La nota heredada'),
    0n,
    100n * INTERNAL_SCALE,
    'La nota heredada',
  );
  const canonical = parseFixed(canonicalGrade, INTERNAL_DECIMALS, 'La nota canónica');
  const allowed = validateRange(
    parseFixed(tolerance, INTERNAL_DECIMALS, 'La tolerancia'),
    0n,
    INTERNAL_SCALE,
    'La tolerancia',
  );
  const difference = legacy / 10n >= canonical ? legacy / 10n - canonical : canonical - legacy / 10n;
  return difference <= allowed;
}

export function isDeterministicGradingEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}
