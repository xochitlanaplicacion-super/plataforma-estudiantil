import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_RESULT_LABELS,
  automaticExercise,
  descriptiveSubmission,
  directCriterion,
  participation,
} from '@/lib/academic-grading/source-adapters';

describe('adaptadores de fuentes de calificación', () => {
  it('normaliza el porcentaje automático una sola vez a 0-10', () => {
    expect(automaticExercise(87.5)).toMatchObject({ state: 'calificado', grade: 8.75 });
  });

  it('separa entrega descriptiva puntual y tardía de una nota', () => {
    const dueAt = new Date('2026-09-10T12:00:00Z');
    expect(descriptiveSubmission({ submittedAt: new Date('2026-09-10T11:59:00Z'), dueAt }))
      .toMatchObject({ state: 'entregado', grade: null });
    expect(descriptiveSubmission({ submittedAt: new Date('2026-09-10T12:01:00Z'), dueAt }))
      .toMatchObject({ state: 'tardio', grade: null });
  });

  it('exige nota sólo para estado calificado y admite justificado sin nota', () => {
    expect(directCriterion({ state: 'justificado', grade: null }).grade).toBeNull();
    expect(() => directCriterion({ state: 'calificado', grade: null })).toThrow();
    expect(() => directCriterion({ state: 'entregado', grade: 8 })).toThrow();
  });

  it('normaliza participación por máximo de grupo o meta fija', () => {
    expect(participation({ points: 3, normalization: { mode: 'maximo_grupo', groupMaximum: 4, zeroDenominator: 'cero' } }).ratio).toBe(.75);
    expect(participation({ points: 12, normalization: { mode: 'meta_fija', target: 10, zeroDenominator: 'cero' } }).ratio).toBe(1);
  });

  it('define denominador cero y rechaza participación negativa', () => {
    expect(participation({ points: 0, normalization: { mode: 'maximo_grupo', groupMaximum: 0, zeroDenominator: 'excluir' } }).ratio).toBeNull();
    expect(() => participation({ points: -1, normalization: { mode: 'meta_fija', target: 5, zeroDenominator: 'cero' } })).toThrow();
  });

  it('expone etiquetas para todos los estados canónicos', () => {
    expect(Object.keys(ACADEMIC_RESULT_LABELS)).toHaveLength(7);
    expect(ACADEMIC_RESULT_LABELS.no_entregado).toBe('No entregado');
  });
});
