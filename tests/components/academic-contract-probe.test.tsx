// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GRADE_MAX, GRADE_MIN } from '@/lib/academic-grading/scale';

function AcademicContractProbe() {
  return (
    <section aria-labelledby="grade-contract-title">
      <h1 id="grade-contract-title">Contrato de calificación</h1>
      <output aria-label="escala permitida">{GRADE_MIN}–{GRADE_MAX}</output>
    </section>
  );
}

describe('armazón de Testing Library', () => {
  it('renderiza y consulta semánticamente el contrato 0–10', () => {
    render(<AcademicContractProbe />);
    expect(screen.getByRole('heading', { name: 'Contrato de calificación' })).toBeVisible();
    expect(screen.getByLabelText('escala permitida')).toHaveTextContent('0–10');
  });
});
