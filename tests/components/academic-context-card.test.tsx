// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AcademicContextCard } from '@/components/admin/AcademicContextCard';

describe('AcademicContextCard', () => {
  it('expone de forma legible el ciclo y sus conteos sin controles de edición', () => {
    render(<AcademicContextCard context={{
      cycle: {
        id: 'cycle-test',
        name: '2026-2027',
        startsOn: '2026-08-31',
        endsOn: '2027-07-16',
        timezone: 'America/Mexico_City',
        state: 'activo',
      },
      activeStudents: 1,
      activeEnrollments: 1,
      activeAssignments: 2,
      isCoherent: true,
    }} />);

    expect(screen.getByText('Contexto académico vigente')).toBeVisible();
    expect(screen.getByText(/2026-2027/)).toBeVisible();
    expect(screen.getByText('Matrículas coherentes')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('explica la ausencia de ciclo activo', () => {
    render(<AcademicContextCard context={null} />);
    expect(screen.getByText('No existe un ciclo escolar activo para esta institución.')).toBeVisible();
  });
});
