import { describe, expect, it } from 'vitest';
import { getActiveDashboardNavHref } from '@/lib/dashboard-navigation';

const menus = [
  {
    items: [
      { href: '/dashboard/profesor' },
      { href: '/dashboard/profesor/calificaciones' },
      { href: '/dashboard/profesor/entregas' },
    ],
  },
  {
    items: [
      { href: '/dashboard/alumno' },
      { href: '/dashboard/alumno/materias' },
      { href: '/dashboard/alumno/calificaciones' },
    ],
  },
];

describe('getActiveDashboardNavHref', () => {
  it('marks only the professor section, not the parent portal link', () => {
    expect(getActiveDashboardNavHref('/dashboard/profesor/entregas', menus)).toBe('/dashboard/profesor/entregas');
    expect(getActiveDashboardNavHref('/dashboard/profesor/calificaciones', menus)).toBe('/dashboard/profesor/calificaciones');
  });

  it('marks only the student section, including nested routes', () => {
    expect(getActiveDashboardNavHref('/dashboard/alumno/materias', menus)).toBe('/dashboard/alumno/materias');
    expect(getActiveDashboardNavHref('/dashboard/alumno/calificaciones/periodo-1', menus)).toBe('/dashboard/alumno/calificaciones');
  });

  it('keeps the portal active on its own route and maps an exercise to subjects', () => {
    expect(getActiveDashboardNavHref('/dashboard/alumno', menus)).toBe('/dashboard/alumno');
    expect(getActiveDashboardNavHref('/dashboard/alumno/ejercicios/abc', menus)).toBe('/dashboard/alumno/materias');
  });

  it('respects segment boundaries and leaves unrelated routes unselected', () => {
    expect(getActiveDashboardNavHref('/dashboard/profesor/entregas-extra', menus)).toBe('/dashboard/profesor');
    expect(getActiveDashboardNavHref('/dashboard/filtro/reportes', menus)).toBeNull();
  });
});
