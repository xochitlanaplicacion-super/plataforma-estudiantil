import { describe, expect, it } from 'vitest';
import { evaluationCriterionSchema, evaluationSubcriterionSchema } from '@/lib/academic-grading/criterion-policy';

const base = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Actividades',
  internalWeight: 50,
  order: 1,
  active: true,
};

describe('contrato de criterios y configuración JSON', () => {
  it.each([
    { ...base, type: 'directo', configuration: {} },
    { ...base, type: 'actividades', configuration: { agregacion: 'promedio' } },
    { ...base, type: 'participacion', configuration: { modo: 'maximo_grupo' } },
    { ...base, type: 'participacion', configuration: { modo: 'meta_fija', meta: 12 } },
  ])('acepta la configuración cerrada de $type', (value) => {
    expect(evaluationSubcriterionSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    { ...base, type: 'directo', configuration: { extra: true } },
    { ...base, type: 'actividades', configuration: { agregacion: 'suma' } },
    { ...base, type: 'participacion', configuration: { modo: 'meta_fija', meta: 0 } },
    { ...base, type: 'hibrido', configuration: {} },
  ])('rechaza configuración ambigua o anidación híbrida: $type', (value) => {
    expect(evaluationSubcriterionSchema.safeParse(value).success).toBe(false);
  });

  it('separa el peso porcentual del contrato de calificación 0-10', () => {
    const result = evaluationCriterionSchema.safeParse({
      id: base.id,
      name: 'Calificación directa',
      type: 'directo',
      weight: 100,
      order: 1,
      active: true,
      subcriteria: [],
    });
    expect(result.success).toBe(true);
  });

  it.each([-0.0001, 100.0001, 12.34567])('rechaza peso inválido %s', (weight) => {
    expect(evaluationCriterionSchema.safeParse({
      id: base.id,
      name: 'Inválido',
      type: 'directo',
      weight,
      order: 1,
      active: true,
      subcriteria: [],
    }).success).toBe(false);
  });
});
