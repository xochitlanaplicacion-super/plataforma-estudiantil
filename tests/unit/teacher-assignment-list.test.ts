import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Listado administrativo de carga docente', () => {
  it('consulta la relación canónica de profesor y limita ambos catálogos al tenant autenticado', () => {
    const actions = readFileSync('src/lib/actions/academic.ts', 'utf8');
    expect(actions).toContain('profiles:profiles!asignaciones_profesor_profesor_tenant_fkey(nombre, apellidos)');
    expect(actions).toMatch(/export async function getProfesores[\s\S]*?\.eq\('tenant_id', tenantId\)[\s\S]*?\.eq\('rol', 'profesor'\)/);
    expect(actions).toMatch(/export async function getAsignacionesProfesor[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  });

  it('la pantalla informa un fallo de carga en vez de mostrar cero asignaciones silenciosamente', () => {
    const page = readFileSync('src/app/dashboard/admin/profesores/page.tsx', 'utf8');
    expect(page).toContain('No se pudo cargar la carga académica');
    expect(page).toContain('setAsignaciones(asig.data || [])');
  });
});
