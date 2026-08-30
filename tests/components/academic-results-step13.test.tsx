// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/actions/calificaciones', () => ({
  loadMyAcademicResultsAction: vi.fn(),
  listAcademicContextAction: vi.fn(),
  loadAcademicTenantResultsAction: vi.fn(),
  exportAcademicTenantResultsAction: vi.fn(),
}));

import { AcademicStep13Evidence } from '@/components/academic/AcademicStep13Evidence';

afterEach(cleanup);

describe('Paso 13: interfaces de resultados', () => {
  it('alumno muestra sólo su resultado, estado provisional y desglose', () => {
    const { container } = render(<AcademicStep13Evidence role="student" state="results" />);
    expect(screen.getByRole('heading', { name: 'Mis calificaciones' })).toBeVisible();
    expect(screen.getByText('Provisional')).toBeVisible();
    expect(screen.getByText('9.3')).toBeVisible();
    expect(screen.getByText('Ver desglose propio')).toBeVisible();
    expect(container).not.toHaveTextContent('Alumno 02');
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|hsl\(/i);
  });

  it('admin ve filtros jerárquicos, progreso, faltantes y paginación', () => {
    render(<AcademicStep13Evidence role="management" state="results" />);
    expect(screen.getByLabelText('Filtros jerárquicos')).toBeVisible();
    expect(screen.getByText('28', { selector: 'p' })).toBeVisible();
    expect(screen.getByText('Faltantes')).toBeVisible();
    expect(screen.getByTestId('tenant-results-table')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Paginación de resultados' })).toBeVisible();
  });

  it('distingue final y reapertura con versión visible', () => {
    const { rerender } = render(<AcademicStep13Evidence role="student" state="final" />);
    expect(screen.getByText('Final')).toBeVisible();
    expect(screen.getByText(/cierre versión 2/i)).toBeVisible();
    rerender(<AcademicStep13Evidence role="student" state="reopened" />);
    expect(screen.getByText('Reabierta')).toBeVisible();
    expect(screen.getByText(/vuelve a ser provisional/i)).toBeVisible();
  });

  it('completa estados vacíos sin inventar notas', () => {
    const { rerender } = render(<AcademicStep13Evidence role="student" state="empty" />);
    expect(screen.getByTestId('student-results-empty')).toBeVisible();
    rerender(<AcademicStep13Evidence role="management" state="empty" />);
    expect(screen.getByText('No hay alumnos activos en este alcance')).toBeVisible();
  });

  it('no presenta infracciones axe críticas/serias', async () => {
    const { container } = render(<AcademicStep13Evidence role="management" state="final" />);
    const report = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(report.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
  }, 20_000);
});
