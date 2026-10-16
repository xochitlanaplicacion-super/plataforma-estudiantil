// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  earlyDraft: vi.fn(),
  extraordinaryDraft: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/actions/filter-control', () => ({
  addFilterStudents: vi.fn(), createEarlyDeparture: vi.fn(), createExtraordinaryHandoff: vi.fn(),
  getFilterEvidenceUrl: vi.fn(), searchFilterReporters: vi.fn(), searchFilterStudents: vi.fn(),
}));
vi.mock('@/lib/filter-early-departure-draft', () => ({
  getEarlyDepartureDraft: mocks.earlyDraft,
  getExtraordinaryHandoffDraft: mocks.extraordinaryDraft,
  saveEarlyDepartureDraft: vi.fn().mockResolvedValue(undefined),
  saveExtraordinaryHandoffDraft: vi.fn().mockResolvedValue(undefined),
  clearEarlyDepartureDraft: vi.fn().mockResolvedValue(undefined),
  clearExtraordinaryHandoffDraft: vi.fn().mockResolvedValue(undefined),
  persistFile: vi.fn().mockReturnValue(null),
  restoreFileForUpload: vi.fn().mockImplementation(async (persisted) => persisted ? new File(['foto'], 'persona.jpg', { type: 'image/jpeg' }) : null),
}));
vi.mock('@/components/filter/FilterEvidenceCapture', () => ({ FilterEvidenceCapture: ({ label }: { label: string }) => <div>{label}</div> }));
vi.mock('@/components/filter/FilterNoticeEvidencePreview', () => ({ FilterNoticeEvidencePreview: () => null }));
vi.mock('@/components/filter/FilterSignaturePad', () => ({ FilterSignaturePad: () => null }));

import { FilterEarlyDepartureWizard } from '@/components/filter/FilterEarlyDepartureWizard';
import { FilterExtraordinaryWizard } from '@/components/filter/FilterExtraordinaryWizard';

const student = { id: 'alumno-1', full_name: 'Alumno de prueba', group_id: 'grupo-1' };
const portrait = { blob: {}, name: 'persona.jpg', type: 'image/jpeg', lastModified: 1 };
const clock = { iso: '2026-10-15T12:00:00.000Z', timezone: 'America/Mexico_City' };
const data = { tenantId: 'colegio', actorUserId: 'guardia', actorName: 'Encargada', isGeneral: false, groups: [], levels: [], students: [], recent: [], contacts: [], requireVerifiedGuardianContact: false };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Identificación opcional en Filtro', () => {
  it('deja avanzar la salida anticipada sin credencial cuando sí hay foto de la persona', async () => {
    mocks.earlyDraft.mockResolvedValue({
      version: 1, clientRequestId: 'solicitud-1', step: 1, status: 'draft', updatedAt: clock.iso,
      values: { pickupPersonName: 'Persona de prueba', relationship: 'madre' }, student, students: [student],
      identificationEvidence: null, pickupPersonPhoto: portrait, finalHandoverPhoto: null, pickupSignature: null,
    });
    render(<FilterEarlyDepartureWizard initialData={data} initialClock={clock} />);
    expect(await screen.findByText('Paso 2 de 5: Persona que retira')).toBeVisible();
    expect(screen.getByText('Identificación opcional · foto de la persona obligatoria')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('Paso 3 de 5: Aviso y motivo')).toBeVisible();
  });

  it('bloquea la salida anticipada si falta la foto de la persona', async () => {
    mocks.earlyDraft.mockResolvedValue({
      version: 1, clientRequestId: 'solicitud-sin-foto-1', step: 1, status: 'draft', updatedAt: clock.iso,
      values: { pickupPersonName: 'Persona de prueba', relationship: 'madre' }, student, students: [student],
      identificationEvidence: null, pickupPersonPhoto: null, finalHandoverPhoto: null, pickupSignature: null,
    });
    render(<FilterEarlyDepartureWizard initialData={data} initialClock={clock} />);
    expect(await screen.findByText('Paso 2 de 5: Persona que retira')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('Paso 2 de 5: Persona que retira')).toBeVisible();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Toma o adjunta la foto de la persona que retira.' }));
  });

  it('deja avanzar la entrega extraordinaria sin credencial y usa verificación no documental', async () => {
    mocks.extraordinaryDraft.mockResolvedValue({
      version: 1, clientRequestId: 'solicitud-2', step: 1, status: 'draft', updatedAt: clock.iso,
      values: { pickupPersonName: 'Persona de prueba', pickupRelationship: 'familiar', adultConfirmed: true, identityMatches: true, noVisibleImpairment: true },
      student, students: [student],
      files: { identificationFront: null, identificationBack: null, pickupPersonPhoto: portrait, authorizationEvidence: null, finalHandoverPhoto: null, pickupSignature: null },
    });
    render(<FilterExtraordinaryWizard initialData={data} initialClock={clock} />);
    expect(await screen.findByText('Paso 2: Persona e identidad')).toBeVisible();
    expect(screen.getByText('Registré el nombre y la relación declarados por la persona y fotografié su rostro')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('Paso 3: Consentimiento')).toBeVisible();
  });

  it('bloquea la entrega extraordinaria si falta la foto de la persona', async () => {
    mocks.extraordinaryDraft.mockResolvedValue({
      version: 1, clientRequestId: 'solicitud-sin-foto-2', step: 1, status: 'draft', updatedAt: clock.iso,
      values: { pickupPersonName: 'Persona de prueba', pickupRelationship: 'familiar', adultConfirmed: true, identityMatches: true, noVisibleImpairment: true },
      student, students: [student],
      files: { identificationFront: null, identificationBack: null, pickupPersonPhoto: null, authorizationEvidence: null, finalHandoverPhoto: null, pickupSignature: null },
    });
    render(<FilterExtraordinaryWizard initialData={data} initialClock={clock} />);
    expect(await screen.findByText('Paso 2: Persona e identidad')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('Paso 2: Persona e identidad')).toBeVisible();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Toma una fotografía en vivo de la persona.' }));
  });
});
