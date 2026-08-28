// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcademicClosureDialog } from '@/components/academic/AcademicClosureDialog';
import type { AcademicClosurePreview } from '@/lib/academic-grading/mutation-contracts';

afterEach(cleanup);

const completePreview: AcademicClosurePreview = {
  assignmentId: 'assignment',
  periodId: 'period',
  totalCount: 2,
  missingCount: 0,
  canClose: true,
  students: [],
};

describe('contrato visual de cierre y reapertura del Paso 8', () => {
  it('resume faltantes y no permite cerrar un alcance incompleto', () => {
    render(
      <AcademicClosureDialog
        open
        mode="close"
        preview={{
          ...completePreview,
          missingCount: 1,
          canClose: false,
          students: [{
            enrollmentId: 'enrollment', complete: false,
            exactGrade: null, displayGrade: null,
            warnings: [{ code: 'PENDING_SOURCE' }],
          }],
        }}
        state={{ status: 'idle' }}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('1 matrícula con datos pendientes.')).toBeVisible();
    expect(screen.getByText(/PENDING_SOURCE/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled();
  });

  it('exige motivo y entrega el texto normalizado al confirmar', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { container } = render(
      <AcademicClosureDialog
        open
        mode="reopen"
        preview={completePreview}
        state={{ status: 'idle' }}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Confirmar reapertura' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Motivo obligatorio'), '  Corrección autorizada  ');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('Corrección autorizada');
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|hsl\(/i);
  });

  it('distingue conflicto de guardado sin perder el diálogo', () => {
    render(
      <AcademicClosureDialog
        open
        mode="close"
        preview={completePreview}
        state={{ status: 'conflict', code: 'CONFLICT', message: 'La versión cambió.' }}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('La versión cambió.');
  });
});
