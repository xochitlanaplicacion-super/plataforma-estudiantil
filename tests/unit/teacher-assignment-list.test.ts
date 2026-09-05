import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Listado administrativo de carga docente', () => {
  it('consulta la relación canónica de profesor y limita ambos catálogos al tenant autenticado', () => {
    const actions = readFileSync('src/lib/actions/academic.ts', 'utf8');
    expect(actions).toContain('profiles:profiles!asignaciones_profesor_profesor_tenant_fkey(nombre, apellidos)');
    expect(actions).toMatch(/export async function getProfesores[\s\S]*?\.eq\('tenant_id', tenantId\)[\s\S]*?\.eq\('rol', 'profesor'\)/);
    expect(actions).toMatch(/export async function getAsignacionesProfesor[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  });

  it('el panel del alumno usa las relaciones canónicas y limita sus materias al tenant y grupo', () => {
    const actions = readFileSync('src/lib/actions/alumno.ts', 'utf8');
    expect(actions).toContain('materias!asignaciones_profesor_materia_tenant_fkey(id, nombre, clave)');
    expect(actions).toContain('profiles!asignaciones_profesor_profesor_tenant_fkey(nombre, apellidos)');
    expect(actions).toMatch(/export async function getAlumnoDashboardData[\s\S]*?\.from\('asignaciones_profesor'\)[\s\S]*?\.eq\('tenant_id', tenantId\)[\s\S]*?\.eq\('grupo_id', profile\.grupo_id\)/);
    expect(actions).toMatch(/\.from\('vinculos_evaluacion_ejercicio'\)[\s\S]*?\.eq\('tenant_id', tenantId\)[\s\S]*?\.in\('asignacion_profesor_id', asignacionIds\)/);
    expect(actions).toMatch(/\.from\('resultados_ejercicios'\)[\s\S]*?\.eq\('tenant_id', tenantId\)[\s\S]*?\.eq\('alumno_id', userId\)/);
    expect(actions).toMatch(/export async function getMateriasYTemasParaAlumno[\s\S]*?materias!asignaciones_profesor_materia_tenant_fkey[\s\S]*?\.eq\("tenant_id", tenantId\)/);
    expect(actions).not.toContain('profiles!asignaciones_profesor_profesor_id_fkey');
  });

  it('la pantalla informa un fallo de carga en vez de mostrar cero asignaciones silenciosamente', () => {
    const page = readFileSync('src/app/dashboard/admin/profesores/page.tsx', 'utf8');
    expect(page).toContain('No se pudo cargar la carga académica');
    expect(page).toContain('setAsignaciones(asig.data || [])');
  });
});
