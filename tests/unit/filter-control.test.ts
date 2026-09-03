import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeFilterName, splitRosterText } from '@/lib/filter-control';

describe('Control de Filtro multitenant', () => {
  it('normaliza acentos, puntuación y espacios para búsqueda tolerante', () => {
    expect(normalizeFilterName('  García-López,  María José ')).toBe('garcia lopez maria jose');
  });

  it('convierte una columna numerada en nombres utilizables', () => {
    expect(splitRosterText('1. ANA PÉREZ\n  2 JUAN LÓPEZ\n\n3')).toEqual(['ANA PÉREZ', 'JUAN LÓPEZ']);
  });

  it('la migración vincula alumnos y retardos al mismo tenant y usa evidencia privada', () => {
    const sql = readFileSync('supabase/migrations/20260903014338_primary_filter_control.sql', 'utf8');
    expect(sql).toContain('primary_filter_enabled boolean not null default false');
    expect(sql).toContain('filter_late_student_tenant_fk foreign key (student_id, tenant_id)');
    expect(sql).toContain("values ('filtro-evidencias','filtro-evidencias',false");
    expect(sql).toContain("p.rol::text in ('superuser','admin','encargado_filtro')");
  });

  it('los tenants futuros reciben valores desactivados automáticamente', () => {
    const sql = readFileSync('supabase/migrations/20260903020943_primary_filter_tenant_defaults.sql', 'utf8');
    expect(sql).toContain('after insert on public.tenants');
    expect(sql).toContain('insert into public.tenant_features');
    expect(sql).toContain('insert into public.filter_alert_settings');
  });
});
