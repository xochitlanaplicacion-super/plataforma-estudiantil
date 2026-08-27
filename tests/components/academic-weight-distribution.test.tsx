// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeightDistributionPreview } from '@/components/academic/WeightDistributionPreview';
import type { EvaluationCriterionInput } from '@/lib/academic-grading/criterion-policy';

afterEach(cleanup);

function criteria(firstWeight: number, secondWeight: number): EvaluationCriterionInput[] {
  return [
    {
      id: '10000000-0000-4000-8000-000000000001', name: 'Actividades', type: 'hibrido',
      weight: firstWeight, order: 1, active: true,
      subcriteria: [
        {
          id: '20000000-0000-4000-8000-000000000001', name: 'Tareas', type: 'actividades',
          internalWeight: 25, order: 1, active: true, configuration: { agregacion: 'promedio' },
        },
        {
          id: '20000000-0000-4000-8000-000000000002', name: 'Participación', type: 'participacion',
          internalWeight: 75, order: 2, active: true, configuration: { modo: 'maximo_grupo' },
        },
      ],
    },
    {
      id: '10000000-0000-4000-8000-000000000002', name: 'Examen', type: 'directo',
      weight: secondWeight, order: 2, active: true, subcriteria: [],
    },
  ];
}

describe('vista aislada de ponderaciones', () => {
  it.each([
    [40, 60, 'Distribución válida: total exacto: 100.0000%'],
    [30, 60, 'Distribución incompleta: 90.0000%'],
    [60, 60, 'Distribución excedida: 120.0000%'],
  ] as const)('comunica visual y textualmente el total', (first, second, expected) => {
    render(<WeightDistributionPreview criteria={criteria(first, second)} />);
    expect(screen.getByLabelText('estado del total de ponderaciones')).toHaveTextContent(expected);
  });

  it('muestra el impacto efectivo y ejecuta acciones por ID', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const onDeactivate = vi.fn();
    const onRedistribute = vi.fn();
    render(
      <WeightDistributionPreview
        criteria={criteria(40, 50)}
        onMove={onMove}
        onDeactivate={onDeactivate}
        onRedistribute={onRedistribute}
      />,
    );

    expect(screen.getByText('impacto efectivo 10.0000%')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Bajar Actividades' }));
    expect(onMove).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001', 'down');
    await user.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]);
    expect(onDeactivate).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001');
    await user.click(screen.getByRole('button', { name: 'Redistribuir proporcionalmente a 100%' }));
    expect(onRedistribute).toHaveBeenCalledOnce();
  });
});
