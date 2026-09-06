import type { EvaluationCriterionInput } from './criterion-policy';
import { sumWeights } from './weights';

type Criterion = Pick<EvaluationCriterionInput, 'id' | 'name' | 'type' | 'weight' | 'active'> & {
  subcriteria: readonly Pick<EvaluationCriterionInput['subcriteria'][number], 'name' | 'type' | 'internalWeight' | 'active'>[];
};

const typeNames = { directo: 'Captura manual', actividades: 'Promedio de actividades', participacion: 'Participación', hibrido: 'Mixto con subcriterios' };

/** Shared by the summary and activation control: 100% at the top is not enough. */
export function validateDistribution(criteria: readonly Criterion[]) {
  const active = criteria.filter((criterion) => criterion.active);
  const total = sumWeights(active.map((criterion) => criterion.weight));
  const errors: string[] = [];
  if (!active.length) errors.push('Agrega al menos un criterio activo.');
  if (total !== 100) errors.push(`Los criterios principales suman ${total}%; deben sumar 100%.`);
  for (const criterion of active) {
    const children = criterion.subcriteria.filter((child) => child.active);
    if (criterion.type === 'hibrido' && children.length < 2) errors.push(`“${criterion.name}”: un criterio mixto necesita al menos dos subcriterios activos.`);
    if (children.length) {
      const internal = sumWeights(children.map((child) => child.internalWeight));
      if (internal !== 100) errors.push(`“${criterion.name}”: sus subcriterios suman ${internal}% interno; ${internal < 100 ? `falta ${sumWeights([100 - internal])}%` : `sobran ${Number((internal - 100).toFixed(4))}%`} para repartir el 100% de este criterio.`);
      for (const child of children) {
        if (child.internalWeight <= 0) errors.push(`“${criterion.name}” → “${child.name}”: el peso interno debe ser mayor que 0%.`);
        if (criterion.type !== 'hibrido' && child.type !== criterion.type) errors.push(`“${criterion.name}” usa ${typeNames[criterion.type]}, pero “${child.name}” usa ${typeNames[child.type]}. Los tipos deben coincidir, o debes configurar un criterio mixto con al menos dos subcriterios.`);
      }
    }
  }
  return { total, errors, valid: errors.length === 0 };
}
