// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => vi.fn());
vi.mock('@/lib/actions/entregas', () => ({ obtenerAccesoArchivoEntrega: access }));
vi.mock('@/components/shared/AccionesArchivoEntrega', () => ({ AccionesArchivoEntrega: () => null }));

import { GaleriaEntrega } from '@/components/shared/GaleriaEntrega';

const photos = [{ path: 'private/first', name: 'pagina-1.jpg' }];

beforeEach(() => access.mockReset());
afterEach(() => cleanup());

describe('galería de entregas', () => {
  it('muestra un error y permite renovar el acceso si falla el enlace de la foto', async () => {
    access.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ url: 'https://example.test/photo' });
    render(<GaleriaEntrega photos={photos} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir esta foto');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar foto' }));
    await waitFor(() => expect(screen.getByRole('img', { name: /Foto 1/ })).toHaveAttribute('src', 'https://example.test/photo'));
    expect(access).toHaveBeenCalledTimes(2);
  });

  it('no queda cargando indefinidamente si el enlace existe pero falla la imagen', async () => {
    access.mockResolvedValue({ url: 'https://example.test/expired' });
    render(<GaleriaEntrega photos={photos} />);
    const image = await screen.findByRole('img', { name: /Foto 1/ });
    fireEvent.error(image);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo abrir esta foto');
  });
});
