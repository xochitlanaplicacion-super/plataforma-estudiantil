import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  academicExerciseErrorMessage,
  parseExerciseResultResponse,
  validateAutomaticAttempt,
  validateDescriptiveGrade,
} from '@/lib/academic-grading/exercise-results';

describe('Paso 12: contrato de resultados de ejercicios', () => {
  it.each([
    [0, 10, 0, 0],
    [5, 10, 50, 5],
    [10, 10, 100, 10],
  ])('convierte %s/%s (%s%%) una sola vez a %s/10', (hits, total, raw, grade) => {
    expect(validateAutomaticAttempt({ hits, total, rawPercentage: raw }).grade).toBe(grade);
  });

  it('rechaza porcentaje manipulado, rango descriptivo y conteos imposibles', () => {
    expect(() => validateAutomaticAttempt({ hits: 1, total: 2, rawPercentage: 60 })).toThrow();
    expect(() => validateAutomaticAttempt({ hits: 3, total: 2, rawPercentage: 100 })).toThrow();
    expect(() => validateDescriptiveGrade(10.01)).toThrow();
    expect(validateDescriptiveGrade(8.5)).toBe(8.5);
  });

  it('valida la respuesta JSON canónica y no admite notas fuera de 0-10', () => {
    expect(parseExerciseResultResponse({
      status: 'saved', saved: true, grade: 7.5, rowVersion: 2,
    })).toMatchObject({ grade: 7.5, rowVersion: 2 });
    expect(() => parseExerciseResultResponse({
      status: 'saved', saved: true, grade: 75,
    })).toThrow();
  });

  it('traduce conflictos y cierres en mensajes accionables', () => {
    expect(academicExerciseErrorMessage({ message: 'ACADEMIC_VERSION_CONFLICT' }))
      .toContain('otra sesión');
    expect(academicExerciseErrorMessage({ message: 'ACADEMIC_SCOPE_CLOSED' }))
      .toContain('cerrado');
  });

  it('obliga a alumno y profesor a usar la misma RPC sin escritura admin de notas', () => {
    const root = process.cwd();
    const alumno = readFileSync(join(root, 'src/lib/actions/alumno.ts'), 'utf8');
    const entregas = readFileSync(join(root, 'src/lib/actions/entregas.ts'), 'utf8');
    expect(alumno).toContain("rpc('guardar_resultado_ejercicio_academico'");
    expect(entregas).toContain("rpc('guardar_resultado_ejercicio_academico'");
    expect(alumno.slice(alumno.indexOf('export async function saveExerciseResult'),
      alumno.indexOf('export async function getMateriasYTemasParaAlumno')))
      .not.toMatch(/admin\s*\.\s*from\('resultados_ejercicios'\)/);
    expect(entregas.slice(entregas.indexOf('export async function calificarEntregaDescriptiva'),
      entregas.indexOf('export async function getEntregasDeEjercicio')))
      .not.toMatch(/admin\s*\.\s*from\('resultados_ejercicios'\)/);
  });

  it('exige periodo/criterio al crear y enlaza también ejercicios sincronizados', () => {
    const root = process.cwd();
    const dashboard = readFileSync(join(root, 'src/app/dashboard/profesor/page.tsx'), 'utf8');
    const actions = readFileSync(join(root, 'src/lib/actions/academic.ts'), 'utf8');
    expect(dashboard).toContain('Ubicación en la evaluación *');
    expect(dashboard).toContain('Cada grupo debe tener un periodo y criterio');
    expect(actions).toContain("rpc('configurar_vinculo_evaluacion_ejercicio'");
    expect(actions).toContain(".eq('sync_id', cleanData.sync_id)");
    expect(actions).toContain('configureExerciseEvaluationLinks(supabaseAdmin, data, evaluationSelections)');
  });

  it('retira calificacion_manual de consumidores, conservándola sólo en tipos de rollback', () => {
    const root = process.cwd();
    for (const file of [
      'src/lib/actions/alumno.ts',
      'src/lib/actions/entregas.ts',
      'src/lib/actions/academic.ts',
      'src/lib/actions/auditoria.ts',
      'src/components/shared/EntregaAlumno.tsx',
      'src/components/shared/PanelEntregasProfesor.tsx',
      'src/components/shared/PanelEntregasGlobales.tsx',
    ]) {
      expect(readFileSync(join(root, file), 'utf8'), file).not.toContain('calificacion_manual');
    }
  });
});
