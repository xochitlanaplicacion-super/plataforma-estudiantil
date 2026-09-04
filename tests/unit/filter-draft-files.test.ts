// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { persistFile, restoreFile, restoreFileForUpload } from '@/lib/filter-early-departure-draft';

describe('archivos de borradores de Control de Filtro', () => {
  it('reconstruye un File portable conservando nombre, MIME y tamaño', () => {
    const original = new File([new Uint8Array([1, 2, 3, 4])], 'evidencia.jpg', { type: 'image/jpeg', lastModified: 1234 });
    const persisted = persistFile(original);
    const restored = restoreFile(persisted);

    expect(restored).toBeInstanceOf(File);
    expect(restored?.name).toBe('evidencia.jpg');
    expect(restored?.type).toBe('image/jpeg');
    expect(restored?.size).toBe(original.size);
    expect(restored?.lastModified).toBe(1234);
    expect(persistFile(original)).toBe(persisted);
  });

  it('rechaza una copia local incompleta en vez de enviar datos corruptos', () => {
    const original = new File([new Uint8Array([1, 2, 3])], 'firma.png', { type: 'image/png' });
    const persisted = persistFile(original);
    expect(persisted).not.toBeNull();
    expect(restoreFile({ ...persisted!, size: persisted!.blob.size + 1 })).toBeNull();
  });

  it('materializa todos los bytes antes de preparar una carga recuperada', async () => {
    const original = new File([new Uint8Array([8, 6, 7, 5, 3, 0, 9])], 'foto.webp', { type: 'image/webp', lastModified: 9876 });
    const restored = await restoreFileForUpload(persistFile(original));

    expect(restored).toBeInstanceOf(File);
    expect(restored?.name).toBe('foto.webp');
    expect(restored?.type).toBe('image/webp');
    expect(restored?.lastModified).toBe(9876);
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('Resultado inválido'));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(restored!);
    });
    expect(Array.from(new Uint8Array(bytes))).toEqual([8, 6, 7, 5, 3, 0, 9]);
  });
});
