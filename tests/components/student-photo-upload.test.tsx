// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  confirm: vi.fn(),
  prepareDocument: vi.fn(),
  confirmDocument: vi.fn(),
  upload: vi.fn(),
  preparePhoto: vi.fn(),
}));

vi.mock('@/lib/actions/entregas', () => ({
  prepararCargaFotosAlumno: mocks.prepare,
  confirmarCargaFotosAlumno: mocks.confirm,
  prepararCargaEntregaAlumno: mocks.prepareDocument,
  confirmarCargaEntregaAlumno: mocks.confirmDocument,
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
  mocks.prepareDocument.mockReset().mockResolvedValue({
    uploadIntentId: 'intent-documento', archivoPath: 'documento-1', token: 'token-documento', contentType: 'application/pdf',
  });
  mocks.confirmDocument.mockReset().mockResolvedValue({
    success: true, archivo_path: 'documento-1', caduca_el: '2026-10-10',
  });
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

  it('sube hasta tres fotos a la vez, informa el avance y conserva el orden al confirmar', async () => {
    const pending = new Map<string, () => void>();
    let active = 0;
    let maxActive = 0;
    mocks.upload.mockImplementation((path: string) => new Promise((resolve) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      pending.set(path, () => { active -= 1; resolve({ error: null }); });
    }));
    let finishConfirm!: (value: unknown) => void;
    mocks.confirm.mockImplementationOnce(() => new Promise((resolve) => { finishConfirm = resolve; }));
    const { container } = render(<EntregaAlumno ejercicioId="ejercicio" />);
    fireEvent.change(mainInput(container), { target: { files: Array.from({ length: 5 }, (_, i) => photo(`foto-${i + 1}.jpg`)) } });
    await screen.findByText(/5\/15 fotos listas/);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar Entrega' }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(3));
    expect(screen.getByText('Fotos subidas: 0 de 5')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Progreso de fotos' })).toHaveAttribute('value', '0');
    expect(mocks.confirm).not.toHaveBeenCalled();

    await act(async () => { pending.get('foto-2')!(); });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(4));
    expect(screen.getByText('Fotos subidas: 1 de 5')).toBeVisible();
    await act(async () => { pending.get('foto-0')!(); });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(5));
    await act(async () => { pending.get('foto-1')!(); });
    await act(async () => { pending.get('foto-4')!(); });
    expect(mocks.confirm).not.toHaveBeenCalled();
    await act(async () => { pending.get('foto-3')!(); });
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
    expect(screen.getByText('Verificando y guardando 5 fotos…')).toBeVisible();
    expect(screen.queryByText('5 fotos guardadas en esta entrega')).not.toBeInTheDocument();
    expect(maxActive).toBe(3);
    expect(mocks.confirm.mock.calls[0][0].fotos.map((file: { archivoNombre: string }) => file.archivoNombre))
      .toEqual(['foto-1.jpg', 'foto-2.jpg', 'foto-3.jpg', 'foto-4.jpg', 'foto-5.jpg']);
    await act(async () => { finishConfirm({ archivo_path: 'foto-0',
      fotos_json: Array.from({ length: 5 }, (_, index) => ({ path: `foto-${index}`, name: `foto-${index + 1}.jpg` })),
      caduca_el: '2026-10-10' }); });
    expect(await screen.findByText('5 fotos guardadas en esta entrega')).toBeVisible();
  });

  it('no confirma una galería si falla cualquiera de las fotos', async () => {
    mocks.upload.mockImplementation(async (path: string) => ({
      error: path === 'foto-2' ? new Error('Se perdió la conexión') : null,
    }));
    const { container } = render(<EntregaAlumno ejercicioId="ejercicio" />);
    fireEvent.change(mainInput(container), { target: { files: Array.from({ length: 5 }, (_, i) => photo(`foto-${i + 1}.jpg`)) } });
    await screen.findByText(/5\/15 fotos listas/);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar Entrega' }));
    expect(await screen.findByText(/No se pudo subir la foto 3 \(foto-3.jpg\): Se perdió la conexión/)).toBeVisible();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(screen.getByText(/5\/15 fotos listas/)).toBeVisible();
    expect(screen.queryByText('5 fotos guardadas en esta entrega')).not.toBeInTheDocument();
  });

  it('reintenta registrar una galería ya subida sin volver a preparar ni subir fotos', async () => {
    mocks.confirm.mockResolvedValueOnce({ error: 'No se pudo registrar la galería.' });
    const { container } = render(<EntregaAlumno ejercicioId="ejercicio" entregaExistente={{
      archivo_nombre: 'foto anterior.jpg', archivo_path: 'foto-anterior', calificacion: null,
    }} />);
    fireEvent.change(mainInput(container), { target: { files: [photo('uno.jpg'), photo('dos.jpg')] } });
    await screen.findByText(/2\/15 fotos listas/);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Actualizar Entrega' }));

    expect(await screen.findByRole('button', { name: 'Reintentar guardar' })).toBeEnabled();
    expect(screen.getByText(/2 fotos subidas; falta registrar la entrega/)).toBeVisible();
    expect(screen.getByText('foto anterior.jpg')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Quitar foto 1' })).toBeDisabled();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    const firstConfirmation = mocks.confirm.mock.calls[0][0];

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar guardar' }));
    expect(await screen.findByText('2 fotos guardadas en esta entrega')).toBeVisible();
    expect(mocks.confirm).toHaveBeenCalledTimes(2);
    expect(mocks.confirm.mock.calls[1][0]).toEqual(firstConfirmation);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Reintentar guardar' })).not.toBeInTheDocument();
  });

  it('reintenta guardar un PDF ya subido sin duplicar la carga y conserva el anterior hasta confirmar', async () => {
    mocks.confirmDocument.mockResolvedValueOnce({ error: 'No se pudo registrar el PDF.' });
    const { container } = render(<EntregaAlumno ejercicioId="ejercicio" entregaExistente={{
      archivo_nombre: 'tarea anterior.pdf', archivo_path: 'documento-anterior', calificacion: null,
    }} />);
    fireEvent.change(mainInput(container), { target: { files: [new File(['pdf'], 'tarea nueva.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText('tarea nueva.pdf')).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Actualizar Entrega' }));

    expect(await screen.findByRole('button', { name: 'Reintentar guardar' })).toBeEnabled();
    expect(screen.getByText('tarea anterior.pdf')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Quitar documento seleccionado' })).toBeDisabled();
    expect(mocks.prepareDocument).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledOnce();
    const firstConfirmation = mocks.confirmDocument.mock.calls[0][0];

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar guardar' }));
    await waitFor(() => expect(mocks.confirmDocument).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('tarea anterior.pdf')).not.toBeInTheDocument());
    expect(screen.getByText('tarea nueva.pdf')).toBeVisible();
    expect(mocks.confirmDocument.mock.calls[1][0]).toEqual(firstConfirmation);
    expect(mocks.prepareDocument).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Reintentar guardar' })).not.toBeInTheDocument();
  });

  it('identifica la foto que no se puede procesar sin reemplazar las demás', async () => {
    const { container } = render(<EntregaAlumno ejercicioId="ejercicio" />);
    fireEvent.change(mainInput(container), { target: { files: [photo('buena.jpg')] } });
    await screen.findByText(/1\/15 fotos listas/);
    mocks.preparePhoto.mockRejectedValueOnce(new Error('Formato no compatible'));
    fireEvent.change(mainInput(container), { target: { files: [new File(['heic'], 'otra.heic', { type: 'image/heic' })] } });
    expect(await screen.findByText(/Foto 2 \(otra.heic\): Este navegador no pudo abrir la foto HEIC\/HEIF/)).toBeVisible();
    expect(screen.getByText(/1\/15 fotos listas/)).toBeVisible();
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
