import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ACADEMIC_FILES = [
  'src/lib/academic/action-handler.ts',
  'src/lib/academic/dto.ts',
  'src/lib/academic/errors.ts',
  'src/lib/academic/feature-flags.ts',
  'src/lib/academic/index.ts',
  'src/lib/academic/repository.ts',
  'src/lib/academic/revalidation.ts',
  'src/lib/academic/service.ts',
  'src/lib/academic/validators.ts',
  'src/lib/actions/calificaciones.ts',
];

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('Paso 9: contrato estático y bundle seguro', () => {
  it('mantiene el módulo nuevo sin any explícito', () => {
    for (const file of ACADEMIC_FILES) {
      expect(read(file), file).not.toMatch(/\bany\b/);
    }
  });

  it('no referencia service role, secret key ni variables públicas para el flag', () => {
    const source = ACADEMIC_FILES.map(read).join('\n');
    expect(source).not.toMatch(/SUPABASE_(SERVICE_ROLE|SECRET)_KEY/);
    expect(source).not.toMatch(/NEXT_PUBLIC_ACADEMIC/);
    expect(source).not.toMatch(/createSupabaseAdminClient/);
    expect(source).toContain('ACADEMIC_GRADING_V2_ENABLED');
    expect(source).toContain('ACADEMIC_GRADING_V2_TENANTS');
  });

  it('sincroniza tablas y RPC académicas del Paso 8 en Database types', () => {
    const databaseTypes = read('src/lib/database.types.ts');
    for (const contract of [
      'cierres_calificaciones:',
      'solicitudes_mutacion_academica:',
      'calcular_resultado_academico:',
      'previsualizar_cierre_calificaciones:',
      'editar_calificaciones_academicas:',
      'cerrar_calificaciones_academicas:',
      'reabrir_calificaciones_academicas:',
    ]) {
      expect(databaseTypes).toContain(contract);
    }
  });

  it('concentra cada RPC/view en el repositorio y no en las Server Actions', () => {
    const repository = read('src/lib/academic/repository.ts');
    const actions = read('src/lib/actions/calificaciones.ts');
    for (const endpoint of [
      'vista_libreta_profesor',
      'vista_desglose_calificacion',
      'vista_calificaciones_alumno',
      'calcular_resultado_academico',
      'previsualizar_cierre_calificaciones',
      'editar_calificaciones_academicas',
      'cerrar_calificaciones_academicas',
      'reabrir_calificaciones_academicas',
    ]) {
      expect(repository).toContain(endpoint);
      expect(actions).not.toContain(endpoint);
    }
  });
});
