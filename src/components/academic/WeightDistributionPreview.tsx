'use client';

import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Plus, Scale, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EvaluationCriterionInput } from '@/lib/academic-grading/criterion-policy';
import { effectiveWeight, sumWeights } from '@/lib/academic-grading/weights';
import { validateDistribution } from '@/lib/academic-grading/distribution-validation';
import { cn } from '@/lib/utils';

interface WeightDistributionPreviewProps {
  criteria: readonly EvaluationCriterionInput[];
  disabled?: boolean;
  onAdd?: () => void;
  onMove?: (criterionId: string, direction: 'up' | 'down') => void;
  onDeactivate?: (criterionId: string) => void;
  onRedistribute?: () => void;
}

function formatPercentage(value: number): string {
  return `${value.toFixed(4)}%`;
}

export function WeightDistributionPreview({
  criteria,
  disabled = false,
  onAdd,
  onMove,
  onDeactivate,
  onRedistribute,
}: WeightDistributionPreviewProps) {
  const activeCriteria = criteria.filter((criterion) => criterion.active);
  const validation = validateDistribution(criteria);
  const { total } = validation;
  const status = validation.valid ? 'exact' : total === 100 ? 'invalidInternal' : total < 100 ? 'incomplete' : 'over';
  const statusPresentation = {
    exact: { Icon: CheckCircle2, text: 'Distribución válida: total exacto', className: 'text-success' },
    incomplete: { Icon: AlertTriangle, text: 'Distribución incompleta', className: 'text-warning' },
    over: { Icon: XCircle, text: 'Distribución excedida', className: 'text-destructive' },
    invalidInternal: { Icon: AlertTriangle, text: 'Total principal correcto, pero hay errores en subcriterios', className: 'text-destructive' },
  }[status];
  const StatusIcon = statusPresentation.Icon;

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="weight-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="weight-title" className="flex items-center gap-2 font-semibold">
            <Scale aria-hidden="true" /> Distribución de evaluación
          </h2>
          <p className="text-sm text-muted-foreground">Los pesos son porcentajes; las calificaciones conservan la escala 0–10.</p>
        </div>
        {onAdd ? <Button type="button" size="sm" onClick={onAdd} disabled={disabled}><Plus />Agregar criterio</Button> : null}
      </header>

      <output
        aria-live="polite"
        aria-label="estado del total de ponderaciones"
        className={cn('flex items-center gap-2 rounded-md border p-3 font-medium', statusPresentation.className)}
      >
        <StatusIcon aria-hidden="true" />
        <span>{statusPresentation.text}: {formatPercentage(total)}</span>
      </output>
      {validation.errors.length > 0 ? <ul className="list-disc space-y-2 pl-5 text-sm text-destructive" aria-label="Errores de la distribución">{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}

      <ol className="space-y-3" aria-label="criterios de evaluación">
        {criteria.map((criterion, index) => (
          <li key={criterion.id} className={cn('rounded-md border p-3', !criterion.active && 'opacity-60')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{criterion.name}</p>
                <p className="text-sm text-muted-foreground">{criterion.type} · {formatPercentage(criterion.weight)}</p>
              </div>
              <div className="flex gap-1" aria-label={`acciones de ${criterion.name}`}>
                {onMove ? (
                  <>
                    <Button type="button" variant="outline" size="icon" aria-label={`Subir ${criterion.name}`} disabled={disabled || index === 0} onClick={() => onMove(criterion.id, 'up')}><ArrowUp /></Button>
                    <Button type="button" variant="outline" size="icon" aria-label={`Bajar ${criterion.name}`} disabled={disabled || index === criteria.length - 1} onClick={() => onMove(criterion.id, 'down')}><ArrowDown /></Button>
                  </>
                ) : null}
                {onDeactivate && criterion.active ? <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onDeactivate(criterion.id)}>Desactivar</Button> : null}
              </div>
            </div>

            {criterion.active && criterion.subcriteria.some((child) => child.active) ? <p className="mt-2 text-sm font-medium">Total interno: {formatPercentage(sumWeights(criterion.subcriteria.filter((child) => child.active).map((child) => child.internalWeight)))} de 100%. Este reparto corresponde al {formatPercentage(criterion.weight)} del criterio.</p> : null}
            {criterion.subcriteria.length > 0 ? (
              <ul className="mt-3 space-y-1 border-l pl-3" aria-label={`subcriterios de ${criterion.name}`}>
                {criterion.subcriteria.map((subcriterion) => (
                  <li key={subcriterion.id} className="flex flex-wrap justify-between gap-2 text-sm">
                    <span>{subcriterion.name} · interno {formatPercentage(subcriterion.internalWeight)}{!subcriterion.active ? ' · Inactivo (no cuenta)' : ''}</span>
                    <span className="font-medium">impacto efectivo {formatPercentage(criterion.active && subcriterion.active ? effectiveWeight(criterion.weight, subcriterion.internalWeight) : 0)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>

      {onRedistribute ? (
        <Button type="button" variant="outline" onClick={onRedistribute} disabled={disabled || activeCriteria.length === 0 || total === 100}>
          Redistribuir proporcionalmente a 100%
        </Button>
      ) : null}
      <p className="sr-only">Sólo puede guardarse y activarse una distribución superior e interna que sume exactamente cien por ciento.</p>
    </section>
  );
}
