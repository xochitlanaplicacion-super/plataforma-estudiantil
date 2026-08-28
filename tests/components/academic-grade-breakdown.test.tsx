// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import goldenCases from '../fixtures/academic-grading-step7-golden.json';
import { GradeBreakdownView } from '@/components/academic/GradeBreakdownView';
import {
  calculateAcademicGrade,
  type AcademicCalculationInput,
} from '@/lib/academic-grading/calculation';

afterEach(cleanup);

describe('contrato visual del desglose académico', () => {
  it('distingue valor exacto, visual, aporte y escala sin colores hardcodeados', () => {
    const result = calculateAcademicGrade(goldenCases[2].input as AcademicCalculationInput);
    const { container } = render(<GradeBreakdownView result={result} />);
    expect(screen.getByRole('heading', { name: 'Ver desglose' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => (
      element?.tagName === 'P' && element.textContent?.includes('Calificación visual: 7.40') === true
    ))).toHaveTextContent('exacta: 7.4000');
    expect(screen.getByText(/Híbrido/)).toBeInTheDocument();
    expect(screen.getByText((_, element) => (
      element?.tagName === 'LI' && element.textContent === 'Participación: 5.0000 · aporta 1.0000'
    ))).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|hsl\(/i);
  });

  it('presenta advertencias de datos faltantes sin convertirlos en cero', () => {
    const result = calculateAcademicGrade(goldenCases[3].input as AcademicCalculationInput);
    render(<GradeBreakdownView result={result} />);
    expect(screen.getByLabelText('Advertencias del cálculo')).toHaveTextContent(
      'aún no cuenta como cero',
    );
    expect(screen.getByText((_, element) => (
      element?.tagName === 'P' && element.textContent?.includes('Calificación visual: 8.0') === true
    ))).toBeInTheDocument();
  });
});
