// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ draft: vi.fn(), toast: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/actions/filter-control', () => ({
  addFilterStudents: vi.fn(), createExtraordinaryHandoff: vi.fn(), searchFilterReporters: vi.fn(), searchFilterStudents: vi.fn(),
}));
vi.mock('@/lib/filter-early-departure-draft', () => ({
  getExtraordinaryHandoffDraft: mocks.draft,
  saveExtraordinaryHandoffDraft: vi.fn().mockResolvedValue(undefined),
  clearExtraordinaryHandoffDraft: vi.fn().mockResolvedValue(undefined),
  persistFile: vi.fn().mockReturnValue(null),
  restoreFileForUpload: vi.fn().mockImplementation(async (persisted) => persisted ? new File(['foto'], 'comprobante.jpg', { type: 'image/jpeg' }) : null),
}));
vi.mock('@/components/filter/FilterEvidenceCapture', () => ({ FilterEvidenceCapture: ({ label }: { label: string }) => <div>{label}</div> }));
vi.mock('@/components/filter/FilterNoticeEvidencePreview', () => ({ FilterNoticeEvidencePreview: () => <div>Vista previa del aviso</div> }));
vi.mock('@/components/filter/FilterSignaturePad', () => ({ FilterSignaturePad: () => null }));

import { FilterExtraordinaryWizard } from '@/components/filter/FilterExtraordinaryWizard';

const student = { id: 'alumno-1', full_name: 'Alumno de prueba', group_id: 'grupo-1' };
const order = {
  id: '00000000-0000-4000-8000-000000000001', kind: 'extraordinary' as const, studentIds: [student.id], preliminary: {},
  evidencePath: 'preregistros/aviso.jpg', evidenceUrl: 'https://example.test/aviso.jpg', createdByActorKind: 'teacher' as const,
};
const clock = { iso: '2026-10-16T12:00:00.000Z', timezone: 'America/Mexico_City' };
const data = {
  tenantId: 'colegio', actorUserId: 'guardia', actorName: 'Encargada', isGeneral: false,
  groups: [], levels: [], students: [student], recent: [], contacts: [], requireVerifiedGuardianContact: false,
};
const requiredValues = {
  manualAuthorizerName: 'Madre de familia', manualAuthorizerRelationship: 'madre',
  authorizationMethod: 'whatsapp', authorizationVerifierName: 'Encargada de filtro',
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Evidencia precargada de entrega extraordinaria', () => {
  it('permite usar el aviso existente sin pedir otra carga y lo muestra para revisión', async () => {
    mocks.draft.mockResolvedValue({
      version: 1, clientRequestId: order.id, step: 2, status: 'draft', updatedAt: clock.iso,
      values: requiredValues, student, students: [student], files: {},
    });
    render(<FilterExtraordinaryWizard initialData={data} initialClock={clock} preRegistration={order} />);

    expect(await screen.findByText('Paso 3: Consentimiento')).toBeVisible();
    expect(screen.getByText('Vista previa del aviso')).toBeVisible();
    expect(screen.getByRole('radio', { name: /Usar el aviso ya cargado/ })).toBeChecked();
    expect(screen.queryByText('Evidencia de la autorización verificada')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('Paso 4: Validación institucional')).toBeVisible();
  });

  it('exige otro archivo si se elige reemplazar el aviso', async () => {
    mocks.draft.mockResolvedValue({
      version: 1, clientRequestId: order.id, step: 2, status: 'draft', updatedAt: clock.iso,
      values: requiredValues, student, students: [student], files: {},
    });
    render(<FilterExtraordinaryWizard initialData={data} initialClock={clock} preRegistration={order} />);

    expect(await screen.findByText('Paso 3: Consentimiento')).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: /Adjuntar otra comprobación/ }));
    expect(screen.getByText('Evidencia de la autorización verificada')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('Paso 3: Consentimiento')).toBeVisible();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Adjunta evidencia de la autorización verificada o reutiliza el aviso recibido.' }));
  });
});
