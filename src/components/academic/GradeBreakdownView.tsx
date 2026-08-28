import type { AcademicCalculationBreakdown } from '@/lib/academic-grading/calculation';

const WARNING_LABELS: Record<AcademicCalculationBreakdown['warnings'][number]['code'], string> = {
  PENDING_SOURCE: 'Hay una calificación pendiente de captura.',
  NOT_SUBMITTED_OPEN_PERIOD: 'Una entrega faltante aún no cuenta como cero porque el periodo sigue abierto.',
  JUSTIFIED_EXCLUDED: 'Una actividad justificada fue excluida del cálculo.',
  ZERO_DENOMINATOR_EXCLUDED: 'La participación sin denominador fue excluida del cálculo.',
  NO_COMPUTABLE_SOURCES: 'No hay fuentes computables para una sección.',
  NO_COMPUTABLE_CRITERIA: 'Todavía no hay criterios computables.',
};

/** Contrato presentacional marca blanca para el futuro control “Ver desglose”. */
export function GradeBreakdownView({ result }: { result: AcademicCalculationBreakdown }) {
  return (
    <section aria-labelledby="academic-breakdown-title" className="space-y-4">
      <header>
        <h2 id="academic-breakdown-title" className="text-lg font-semibold">Ver desglose</h2>
        <p className="text-sm text-muted-foreground">
          Calificación visual: <strong>{result.displayGrade ?? 'Sin datos'}</strong>
          {result.exactGrade !== null && <> · exacta: {result.exactGrade}</>}
          {' '}· escala {result.scale}
        </p>
      </header>

      {result.warnings.length > 0 && (
        <ul aria-label="Advertencias del cálculo" className="space-y-1 text-sm text-muted-foreground">
          {result.warnings.map((warning, index) => (
            <li key={`${warning.code}-${warning.sourceId ?? index}`}>{WARNING_LABELS[warning.code]}</li>
          ))}
        </ul>
      )}

      <ol className="space-y-3">
        {result.criteria.map((criterion) => (
          <li key={criterion.criterionId} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <span>{criterion.label}</span>
              <span>{criterion.contributionToTotal} / {result.exactGrade ?? '—'}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Nota {criterion.canonicalGrade ?? 'sin datos'} · peso efectivo {criterion.effectiveWeight}%
            </p>
            {criterion.subcriteria.length > 0 && (
              <ul className="mt-2 space-y-1 border-l border-border pl-3 text-sm">
                {criterion.subcriteria.map((subcriterion) => (
                  <li key={subcriterion.subcriterionId}>
                    {subcriterion.label}: {subcriterion.canonicalGrade ?? 'sin datos'} · aporta {subcriterion.contributionToTotal}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
