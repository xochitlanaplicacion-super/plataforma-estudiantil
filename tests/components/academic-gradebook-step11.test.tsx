// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GradebookEditor } from '@/components/academic/GradebookEditor';
import type { AcademicGradebookWorkspaceDto } from '@/lib/academic/gradebook-dto';
import type { EditAcademicGradesInput } from '@/lib/academic/validators';

afterEach(cleanup);

const ID = {
  assignment: '10000000-0000-4000-8000-000000000001', period: '10000000-0000-4000-8000-000000000002',
  enrollment: '10000000-0000-4000-8000-000000000003', student: '10000000-0000-4000-8000-000000000004',
  criterion: '10000000-0000-4000-8000-000000000005', scheme: '10000000-0000-4000-8000-000000000006',
  source: '10000000-0000-4000-8000-000000000007', correlation: '10000000-0000-4000-8000-000000000008',
};

function makeWorkspace(overrides: Partial<AcademicGradebookWorkspaceDto> = {}): AcademicGradebookWorkspaceDto {
  return {
    context: { assignmentId: ID.assignment, cycleId: ID.scheme, cycleName: '2026-2027', cycleState: 'activo', subjectId: ID.criterion, subjectName: 'Matemáticas', groupId: ID.student, groupName: 'A', teacherId: ID.student, teacherName: 'Docente', active: true, periods: [{ id: ID.period, name: 'Primer periodo', startsOn: '2026-08-01', endsOn: '2026-10-01', order: 1, state: 'activo' }] },
    scheme: { id: ID.scheme, name: 'Esquema activo', version: 1, passingGrade: 6, displayDecimals: 1 },
    periodState: 'activo', closed: false,
    students: [{ enrollmentId: ID.enrollment, studentId: ID.student, fullName: 'Ramírez Ana', enrollmentCode: 'M001' }],
    columns: [{ id: `direct:${ID.criterion}:root`, label: 'Examen', criterionName: 'Examen', subcriterionName: null, criterionId: ID.criterion, subcriterionId: null, sourceType: 'directCriterion', exerciseId: null, editable: true, scale: '0-10', order: 1 }],
    cells: [], studentCount: 1, truncated: false, loadedAt: '2026-08-28T18:00:00.000Z',
    ...overrides,
  };
}

function successWorkspace(data = makeWorkspace()) {
  return Promise.resolve({ ok: true as const, status: 'success' as const, data });
}

const breakdown = { engineVersion: 'academic-deterministic-v1' as const, scale: '0-10' as const, exactGrade: '9.0000', displayGrade: '9.0', displayDecimals: 1 as const, complete: true, criteria: [], warnings: [] };

describe('Paso 11: editor accesible y explícito', () => {
  it('edita, marca sin guardar, guarda un lote y confirma recarga', async () => {
    const saved = makeWorkspace({ cells: [{ enrollmentId: ID.enrollment, columnId: `direct:${ID.criterion}:root`, sourceId: ID.source, sourceType: 'directCriterion', criterionId: ID.criterion, subcriterionId: null, state: 'calificado', grade: 9, observation: null, rowVersion: 1, updatedAt: '2026-08-28T18:01:00Z', editable: true }] });
    const onSave = vi.fn(async (_input: EditAcademicGradesInput) => ({ ok: true as const, status: 'success' as const, data: { status: 'saved' as const, replayed: false, correlationId: ID.correlation, items: [{ sourceType: 'directCriterion' as const, sourceId: ID.source, rowVersion: 1, state: 'calificado', grade: 9 }] } }));
    const user = userEvent.setup();
    render(<GradebookEditor workspace={makeWorkspace()} onReload={() => successWorkspace(saved)} onSave={onSave} onBreakdown={async () => ({ ok: true, status: 'success', data: breakdown })} />);
    const input = screen.getAllByLabelText('Ramírez Ana, Examen, calificación de 0 a 10')[0];
    await user.type(input, '9');
    expect(screen.getAllByText('Sin guardar').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0]).toMatchObject({ items: [expect.objectContaining({ grade: 9 })] });
    expect(await screen.findByText('Cambios guardados y verificados al recargar la libreta.')).toBeVisible();
    expect(screen.getByLabelText('Recibo de auditoría del guardado')).toHaveTextContent(ID.correlation);
  });

  it('bloquea una nota fuera de 0–10 y no envía el lote', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<GradebookEditor workspace={makeWorkspace()} onReload={() => successWorkspace()} onSave={onSave} onBreakdown={async () => ({ ok: true, status: 'success', data: breakdown })} />);
    await user.type(screen.getAllByLabelText('Ramírez Ana, Examen, calificación de 0 a 10')[0], '11');
    expect(screen.getAllByText('La calificación debe estar entre 0 y 10.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Guardar lote' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('permite navegación por flechas/Enter y expone versión móvil sin tabla horizontal', () => {
    const second = { ...makeWorkspace().students[0], enrollmentId: ID.source, fullName: 'Zavala Luis' };
    render(<GradebookEditor workspace={makeWorkspace({ students: [...makeWorkspace().students, second], studentCount: 2 })} onReload={() => successWorkspace()} onSave={vi.fn()} onBreakdown={async () => ({ ok: true, status: 'success', data: breakdown })} />);
    const inputs = screen.getAllByLabelText(/calificación de 0 a 10/);
    inputs[0].focus();
    fireEvent.keyDown(inputs[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(inputs[1]);
    expect(screen.getByTestId('desktop-gradebook')).toHaveClass('hidden');
    expect(screen.getByTestId('mobile-gradebook')).toHaveClass('md:hidden');
  });

  it('reconcilia un timeout confirmado sin reenviar automáticamente', async () => {
    const persisted = makeWorkspace({ cells: [{ enrollmentId: ID.enrollment, columnId: `direct:${ID.criterion}:root`, sourceId: ID.source, sourceType: 'directCriterion', criterionId: ID.criterion, subcriterionId: null, state: 'calificado', grade: 8, observation: null, rowVersion: 1, updatedAt: '2026-08-28T18:01:00Z', editable: true }] });
    const onSave = vi.fn(async () => ({ ok: false as const, status: 'error' as const, error: { code: 'ACADEMIC_TIMEOUT' as const, message: 'Tiempo agotado', httpStatus: 504 as const } }));
    const user = userEvent.setup();
    render(<GradebookEditor workspace={makeWorkspace()} onReload={() => successWorkspace(persisted)} onSave={onSave} onBreakdown={async () => ({ ok: true, status: 'success', data: breakdown })} />);
    await user.type(screen.getAllByLabelText('Ramírez Ana, Examen, calificación de 0 a 10')[0], '8');
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));
    expect(await screen.findByText(/recarga confirmó que todo el lote sí quedó guardado/)).toBeVisible();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('ante conflicto no sobrescribe y exige decisión de conciliación', async () => {
    const remote = makeWorkspace({ cells: [{ enrollmentId: ID.enrollment, columnId: `direct:${ID.criterion}:root`, sourceId: ID.source, sourceType: 'directCriterion', criterionId: ID.criterion, subcriterionId: null, state: 'calificado', grade: 7, observation: null, rowVersion: 2, updatedAt: '2026-08-28T18:02:00Z', editable: true }] });
    const onSave = vi.fn(async () => ({ ok: false as const, status: 'conflict' as const, error: { code: 'ACADEMIC_CONFLICT' as const, message: 'Conflicto', httpStatus: 409 as const } }));
    const user = userEvent.setup();
    render(<GradebookEditor workspace={makeWorkspace()} onReload={() => successWorkspace(remote)} onSave={onSave} onBreakdown={async () => ({ ok: true, status: 'success', data: breakdown })} />);
    await user.type(screen.getAllByLabelText('Ramírez Ana, Examen, calificación de 0 a 10')[0], '9');
    await user.click(screen.getByRole('button', { name: 'Guardar lote' }));
    expect(await screen.findByRole('heading', { name: 'Conciliar cambios recientes' })).toBeVisible();
    expect(screen.getAllByLabelText('Ramírez Ana, Examen, calificación de 0 a 10')[0]).toHaveValue(9);
    expect(onSave).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Aplicar mis valores sobre la versión reciente' }));
    expect(screen.getByText(/Tus valores quedaron sobre la versión reciente/)).toBeVisible();
    expect(screen.getAllByLabelText('Ramírez Ana, Examen, calificación de 0 a 10')[0]).toHaveValue(9);
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('cerrado es read-only y no presenta infracciones axe críticas/serias', async () => {
    const { container } = render(<GradebookEditor workspace={makeWorkspace({ closed: true, periodState: 'cerrado' })} onReload={() => successWorkspace()} onSave={vi.fn()} onBreakdown={async () => ({ ok: true, status: 'success', data: breakdown })} />);
    expect(screen.getAllByLabelText('Ramírez Ana, Examen, calificación de 0 a 10')[0]).toBeDisabled();
    expect(screen.getByText('Cerrado · sólo lectura')).toBeVisible();
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|hsl\(/i);
    const report = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(report.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
  }, 20_000);
});
