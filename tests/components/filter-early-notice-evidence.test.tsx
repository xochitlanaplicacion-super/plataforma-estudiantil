// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ draft: vi.fn(), save: vi.fn().mockResolvedValue(undefined), create: vi.fn(), toast: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/actions/filter-control', () => ({
  addFilterStudents: vi.fn(), createEarlyDeparture: mocks.create, getFilterEvidenceUrl: vi.fn(), searchFilterStudents: vi.fn(),
}));
vi.mock('@/lib/filter-early-departure-draft', () => ({
  getEarlyDepartureDraft: mocks.draft,
  saveEarlyDepartureDraft: mocks.save,
  clearEarlyDepartureDraft: vi.fn().mockResolvedValue(undefined),
  persistFile: (file: File | null) => file ? { blob: file, name: file.name, type: file.type, lastModified: file.lastModified, size: file.size } : null,
  restoreFileForUpload: async (persisted: { blob: Blob; name: string; type: string } | null) => persisted ? new File([persisted.blob], persisted.name, { type: persisted.type }) : null,
}));
vi.mock('@/components/filter/FilterEvidenceCapture', () => ({
  FilterEvidenceCapture: ({ label, onChange }: { label: string; onChange: (file: File) => void }) =>
    <button type="button" onClick={() => onChange(new File(['aviso'], 'aviso.jpg', { type: 'image/jpeg' }))}>{label}</button>,
}));
vi.mock('@/components/filter/FilterNoticeEvidencePreview', () => ({
  FilterNoticeEvidencePreview: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock('@/components/filter/FilterSignaturePad', () => ({ FilterSignaturePad: () => null }));

import { FilterEarlyDepartureWizard } from '@/components/filter/FilterEarlyDepartureWizard';

const student = { id: 'alumno-1', full_name: 'Alumno de prueba', group_id: 'grupo-1' };
const clock = { iso: '2026-10-16T12:00:00.000Z', timezone: 'America/Mexico_City' };
const data = { tenantId: 'colegio', actorUserId: 'guardia', actorName: 'Encargada', isGeneral: false, groups: [], levels: [], students: [student], recent: [] };
const values = { notifiedParty: 'madre', notifiedStaffName: 'Docente titular', notificationMethod: 'whatsapp', departureReason: 'cita_medica' };
const completeValues = { ...values, pickupPersonName: 'Madre de familia', relationship: 'madre', deliveringTeacherName: 'Docente titular', confirmed: true };
const persistedPhoto = { blob: new Blob(['foto'], { type: 'image/jpeg' }), name: 'persona.jpg', type: 'image/jpeg', lastModified: 1 };
const persistedSignature = { blob: new Blob(['firma'], { type: 'image/png' }), name: 'firma.png', type: 'image/png', lastModified: 1 };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Evidencia opcional del aviso en salidas anticipadas', () => {
  it('muestra el archivo ya cargado en el preregistro y permite avanzar sin duplicarlo', async () => {
    const order = {
      id: '00000000-0000-4000-8000-000000000001', kind: 'early' as const, studentIds: [student.id], preliminary: {},
      evidencePath: 'preregistros/aviso.jpg', evidenceUrl: 'https://example.test/aviso.jpg',
    };
    mocks.draft.mockResolvedValue({
      version: 1, clientRequestId: order.id, step: 2, status: 'draft', updatedAt: clock.iso,
      values, student, students: [student], notificationEvidence: null,
      identificationEvidence: null, pickupPersonPhoto: null, finalHandoverPhoto: null, pickupSignature: null,
    });
    render(<FilterEarlyDepartureWizard initialData={data} initialClock={clock} preRegistration={order} />);

    expect(await screen.findByText('Paso 3 de 5: Aviso y motivo')).toBeVisible();
    expect(screen.getByText('Aviso adjuntado en el preregistro')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Adjuntar un aviso distinto (opcional)' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('Paso 4 de 5: Entrega de alumnos')).toBeVisible();
  }, 15000);

  it('guarda en el borrador local la evidencia que se adjunta al flujo manual', async () => {
    mocks.draft.mockResolvedValue({
      version: 1, clientRequestId: 'solicitud-manual', step: 2, status: 'draft', updatedAt: clock.iso,
      values, student, students: [student], notificationEvidence: null,
      identificationEvidence: null, pickupPersonPhoto: null, finalHandoverPhoto: null, pickupSignature: null,
    });
    render(<FilterEarlyDepartureWizard initialData={data} initialClock={clock} />);
    expect(await screen.findByText('Paso 3 de 5: Aviso y motivo')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Adjuntar evidencia del aviso (opcional)' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('colegio:guardia', expect.objectContaining({
      notificationEvidence: expect.objectContaining({ name: 'aviso.jpg', type: 'image/jpeg' }),
    })), { timeout: 1500 });
  });

  it('envía la orden del preregistro para reutilizar el aviso sin cargar otro archivo', async () => {
    const order = {
      id: '00000000-0000-4000-8000-000000000002', kind: 'early' as const, studentIds: [student.id], preliminary: {},
      evidencePath: 'preregistros/aviso.jpg', evidenceUrl: 'https://example.test/aviso.jpg',
    };
    mocks.draft.mockResolvedValue({
      version: 1, clientRequestId: order.id, step: 4, status: 'draft', updatedAt: clock.iso,
      values: completeValues, student, students: [student], notificationEvidence: null,
      identificationEvidence: null, pickupPersonPhoto: persistedPhoto, finalHandoverPhoto: persistedPhoto, pickupSignature: persistedSignature,
    });
    mocks.create.mockResolvedValue({ success: true, duplicate: false });
    render(<FilterEarlyDepartureWizard initialData={data} initialClock={clock} preRegistration={order} />);
    expect(await screen.findByText('Paso 5 de 5: Confirmación')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar salida anticipada' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1), { timeout: 2500 });
    const submitted = mocks.create.mock.calls[0][0] as FormData;
    expect(submitted.get('preRegistrationId')).toBe(order.id);
    expect(submitted.get('reusePreRegistrationEvidence')).toBe('true');
    expect(submitted.get('notificationEvidence')).toBeNull();
  }, 15000);

  it('envía la foto opcional adjuntada en el flujo manual', async () => {
    const notice = { blob: new Blob(['aviso'], { type: 'image/jpeg' }), name: 'aviso.jpg', type: 'image/jpeg', lastModified: 1 };
    mocks.draft.mockResolvedValue({
      version: 1, clientRequestId: '00000000-0000-4000-8000-000000000003', step: 4, status: 'draft', updatedAt: clock.iso,
      values: completeValues, student, students: [student], notificationEvidence: notice,
      identificationEvidence: null, pickupPersonPhoto: persistedPhoto, finalHandoverPhoto: persistedPhoto, pickupSignature: persistedSignature,
    });
    mocks.create.mockResolvedValue({ success: true, duplicate: false });
    render(<FilterEarlyDepartureWizard initialData={data} initialClock={clock} />);
    expect(await screen.findByText('Paso 5 de 5: Confirmación')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar salida anticipada' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1), { timeout: 2500 });
    const submitted = mocks.create.mock.calls[0][0] as FormData;
    expect((submitted.get('notificationEvidence') as File).name).toBe('aviso.jpg');
    expect(submitted.get('reusePreRegistrationEvidence')).toBeNull();
  }, 15000);
});
