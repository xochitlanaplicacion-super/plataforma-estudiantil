// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), toast: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/actions/filter-preregistrations', () => ({ createFilterPreregistration: mocks.create }));
vi.mock('@/components/filter/FilterEvidenceCapture', () => ({
  FilterEvidenceCapture: ({ label, onChange }: { label: string; onChange: (file: File) => void }) =>
    <button type="button" onClick={() => onChange(new File(['aviso'], 'aviso.jpg', { type: 'image/jpeg' }))}>{label}</button>,
}));

import { FilterPreRegistrationForm } from '@/components/filter/FilterPreRegistrationForm';

const students = [
  { id: '00000000-0000-4000-8000-000000000001', full_name: 'Ana García', group_label: 'Primaria · 6° · A' },
  { id: '00000000-0000-4000-8000-000000000002', full_name: 'Luis López', group_label: 'Primaria · 6° · A' },
];

beforeEach(() => { mocks.create.mockReset(); mocks.toast.mockReset(); mocks.refresh.mockReset(); });
afterEach(cleanup);

describe('preregistro compartido de Filtro', () => {
  it('exige alumno y evidencia antes de guardar una orden', () => {
    render(<FilterPreRegistrationForm initialData={{ actorKind: 'teacher', actorName: 'Profesora Rosa', students }} />);
    fireEvent.click(screen.getByRole('button', { name: /Salida anticipada/ }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar orden pendiente/ }));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Selecciona al menos un alumno' }));
    expect(mocks.create).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Buscar alumno'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('option', { name: /Ana García/ }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar orden pendiente/ }));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Adjunta la evidencia del aviso' }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('guarda orden preliminar sin afirmar que Filtro completó la autorización', async () => {
    mocks.create.mockResolvedValue({ success: true, id: 'orden-1' });
    render(<FilterPreRegistrationForm initialData={{ actorKind: 'teacher', actorName: 'Profesora Rosa', students }} />);
    fireEvent.click(screen.getByRole('button', { name: /Entrega extraordinaria/ }));
    fireEvent.change(screen.getByLabelText('Buscar alumno'), { target: { value: 'Luis' } });
    fireEvent.click(screen.getByRole('option', { name: /Luis López/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Evidencia del mensaje o aviso' }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar orden pendiente/ }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const sent = mocks.create.mock.calls[0][0] as FormData;
    expect(sent.get('kind')).toBe('extraordinary');
    expect(JSON.parse(String(sent.get('studentIds')))).toEqual([students[1].id]);
    expect(sent.get('evidence')).toBeInstanceOf(File);
    expect(sent.get('reporterName')).toBe('Profesora Rosa');
    expect(sent.has('authorizationVerifierName')).toBe(false);
    expect(await screen.findByText('Orden guardada en pendientes')).toBeVisible();
  });

  it('exige nombre declarado al usar la cuenta compartida', () => {
    render(<FilterPreRegistrationForm initialData={{ actorKind: 'filter', actorName: 'Cuenta Filtro', students }} />);
    fireEvent.click(screen.getByRole('button', { name: /Entrega extraordinaria/ }));
    fireEvent.change(screen.getByLabelText('Buscar alumno'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('option', { name: /Ana García/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Evidencia del mensaje o aviso' }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar orden pendiente/ }));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Indica quién inicia el preregistro' }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('conserva el identificador de una orden en un reintento sin marcar verificación final', async () => {
    mocks.create.mockResolvedValueOnce({ success: false, error: 'Conexión interrumpida' }).mockResolvedValueOnce({ success: true, id: 'orden-2' });
    render(<FilterPreRegistrationForm initialData={{ actorKind: 'teacher', actorName: 'Profesora Rosa', students }} />);
    fireEvent.click(screen.getByRole('button', { name: /Salida anticipada/ }));
    fireEvent.change(screen.getByLabelText('Buscar alumno'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('option', { name: /Ana García/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Evidencia del mensaje o aviso' }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar orden pendiente/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /Guardar orden pendiente/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Guardar orden pendiente/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));

    const first = mocks.create.mock.calls[0][0] as FormData;
    const second = mocks.create.mock.calls[1][0] as FormData;
    expect(first.get('clientRequestId')).toBe(second.get('clientRequestId'));
    expect(first.get('notifiedStaffName')).toBe('Profesora Rosa');
    expect(first.has('authorizationVerifierName')).toBe(false);
  });
});
