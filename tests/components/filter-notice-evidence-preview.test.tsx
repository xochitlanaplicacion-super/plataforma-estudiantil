// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getOrder: vi.fn(), toast: vi.fn() }));

vi.mock('@/lib/actions/filter-preregistrations', () => ({ getFilterPreRegistration: mocks.getOrder }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { FilterNoticeEvidencePreview } from '@/components/filter/FilterNoticeEvidencePreview';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('visor de evidencia del aviso', () => {
  it('renueva el enlace protegido y permite ampliar la imagen del preregistro', async () => {
    mocks.getOrder.mockResolvedValue({ success: true, order: { evidenceUrl: 'https://example.test/foto-vigente.jpg' } });
    render(<FilterNoticeEvidencePreview url="https://example.test/foto-vencida.jpg" orderId="orden-1" />);

    await waitFor(() => expect(screen.getByAltText('Miniatura de aviso recibido')).toHaveAttribute('src', 'https://example.test/foto-vigente.jpg'));
    fireEvent.click(screen.getByRole('button', { name: 'Ver y ampliar' }));
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Aviso recibido' })).toHaveAttribute('src', 'https://example.test/foto-vigente.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Acercar imagen' }));
    expect(screen.getByText('125%')).toBeVisible();
    expect(mocks.getOrder).toHaveBeenCalledTimes(2);
  });

  it('acepta archivos PDF elegidos durante el registro sin tratarlos como preregistro', async () => {
    render(<FilterNoticeEvidencePreview url="blob:archivo" mimeType="application/pdf" />);
    expect(screen.getByText('Archivo seleccionado para este registro.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ver y ampliar' }));
    expect(await screen.findByTitle('Aviso recibido')).toHaveAttribute('src', 'blob:archivo');
    expect(mocks.getOrder).not.toHaveBeenCalled();
  });
});
