// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  confirm: vi.fn(),
  upload: vi.fn(),
  preparePhoto: vi.fn(),
}));

vi.mock('@/lib/actions/entregas', () => ({
  prepararCargaFotosAlumno: mocks.prepare,
  confirmarCargaFotosAlumno: mocks.confirm,
  prepararCargaEntregaAlumno: vi.fn(),
  confirmarCargaEntregaAlumno: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: mocks.upload }) } }),
}));
vi.mock('@/lib/storage/photo-gallery', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/storage/photo-gallery')>(),
  prepareSubmissionPhoto: mocks.preparePhoto,
}));
vi.mock('@/components/shared/AccionesArchivoEntrega', () => ({ AccionesArchivoEntrega: () => null }));
vi.mock('@/components/shared/GaleriaEntrega', () => ({ GaleriaEntrega: () => null }));

import { EntregaAlumno } from '@/components/shared/EntregaAlumno';

function photo(name: string) {
  return new File(['jpeg'], name, { type: 'image/jpeg' });
}

function mainInput(container: HTMLElement) {
  const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement | null;
  if (!input) throw new Error('Falta el selector principal');
  return input;
}

beforeEach(() => {
  mocks.prepare.mockReset().mockImplementation(async (items: unknown[]) => ({
    uploadIntentId: 'intent',
    uploads: items.map((_, index) => ({ path: `foto-${index}`, token: `token-${index}` })),
  }));
  mocks.confirm.mockReset().mockImplementation(async (input: { fotos: { archivoNombre: string }[] }) => ({
    archivo_path: 'foto-0',
    fotos_json: input.fotos.map((item, index) => ({ path: `foto-${index}`, name: item.archivoNombre })),
    caduca_el: '2026-10-10',
  }));
  mocks.upload.mockReset().mockResolvedValue({ error: null });
  mocks.preparePhoto.mockReset().mockImplementation(async (file: File) => file);
  URL.createObjectURL = vi.fn(() => `blob:preview-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('EntregaAlumno: carga de varias fotos', () => {
  it('previsualiza las 5 fotos elegidas juntas y sólo las envía tras confirmar', async () => {
    const { container } = render(<EntregaAlumno ejercicioId="ejercicio" />);
    expect(mainInput(container).multiple).toBe(true);
    fireEvent.change(mainInput(container), { target: { files: Array.from({ length: 5 }, (_, i) => photo(`foto-${i + 1}.jpg`)) } });
    expect(await screen.findByText(/5\/15 fotos listas/)).toBeVisible();
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Fotos listas para enviar' })).getAllByRole('img')).toHaveLength(5));
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar Entrega' }));
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledOnce());
    expect(mocks.prepare.mock.calls[0][0]).toHaveLength(5);
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(5));
    expect(mocks.confirm.mock.calls[0][0].fotos).toHaveLength(5);
    expect(await screen.findByText('5 fotos guardadas en esta entrega')).toBeVisible();
  });

  it('el botón de añadir varias fotos no abre también el selector principal', async () => {
    const { container } = render(<EntregaAlumno ejercicioId="ejercicio" />);
    const mainClick = vi.spyOn(mainInput(container), 'click');
    const photosInput = container.querySelector('input[type="file"][accept="image/*"][multiple]') as HTMLInputElement;
    const photosClick = vi.spyOn(photosInput, 'click');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Añadir varias fotos' }));
    expect(photosClick).toHaveBeenCalledOnce();
    expect(mainClick).not.toHaveBeenCalled();
  });

  it('no sustituye silenciosamente fotos preparadas por un documento', async () => {
    const { container } = render(<EntregaAlumno ejercicioId="ejercicio" />);
    fireEvent.change(mainInput(container), { target: { files: [photo('uno.jpg'), photo('dos.jpg')] } });
    expect(await screen.findByText(/2\/15 fotos listas/)).toBeVisible();
    fireEvent.change(mainInput(container), { target: { files: [new File(['pdf'], 'tarea.pdf', { type: 'application/pdf' })] } });
    expect(screen.getByText('Ya tienes fotos preparadas. Quítalas antes de elegir un documento.')).toBeVisible();
    expect(screen.getByText(/2\/15 fotos listas/)).toBeVisible();
  });

  it('no da éxito si el servidor confirma menos fotos de las seleccionadas', async () => {
    mocks.confirm.mockResolvedValueOnce({
      archivo_path: 'foto-0', fotos_json: [{ path: 'foto-0', name: 'uno.jpg' }], caduca_el: '2026-10-10',
    });
    const { container } = render(<EntregaAlumno ejercicioId="ejercicio" />);
    fireEvent.change(mainInput(container), { target: { files: [photo('uno.jpg'), photo('dos.jpg')] } });
    await screen.findByText(/2\/15 fotos listas/);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar Entrega' }));
    expect(await screen.findByText(/El servidor no confirmó todas las fotos/)).toBeVisible();
    expect(screen.getByText(/2\/15 fotos listas/)).toBeVisible();
    expect(screen.queryByText('1 foto guardada en esta entrega')).not.toBeInTheDocument();
  });

  it('impide enviar mientras procesa fotos y permite hacerlo sólo cuando están listas', async () => {
    let finishProcessing!: (file: File) => void;
    mocks.preparePhoto.mockImplementationOnce((file: File) => new Promise<File>((resolve) => { finishProcessing = () => resolve(file); }));
    const { container } = render(<EntregaAlumno ejercicioId="ejercicio" />);
    fireEvent.change(mainInput(container), { target: { files: [photo('uno.jpg')] } });
    expect(screen.getByRole('button', { name: 'Enviar Entrega' })).toBeDisabled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    finishProcessing(photo('uno.jpg'));
    expect(await screen.findByText(/1\/15 fotos listas/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar Entrega' })).toBeEnabled();
  });

  it('mantiene la cámara abierta para varias capturas y detiene el stream al cerrar', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })));
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 100 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 100 });

    render(<EntregaAlumno ejercicioId="ejercicio" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tomar fotos seguidas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tomar varias fotos' });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    fireEvent.loadedMetadata(dialog.querySelector('video')!);
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Tomar foto' }));
    expect(await within(dialog).findByText(/1\/15 fotos listas/)).toBeVisible();
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Tomar foto' }));
    expect(await within(dialog).findByText(/2\/15 fotos listas/)).toBeVisible();
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Terminar y revisar fotos' }));
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.getByText(/2\/15 fotos listas/)).toBeVisible();
  });
});
