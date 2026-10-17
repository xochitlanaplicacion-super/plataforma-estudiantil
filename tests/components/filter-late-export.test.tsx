// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  draft: vi.fn(), saveDraft: vi.fn(), exportHistory: vi.fn(), saveAs: vi.fn(), toast: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/actions/filter-control', () => ({
  addFilterStudents: vi.fn(), createLateEntry: vi.fn(), exportFilterLateArrivalsHistory: mocks.exportHistory,
  getStudentLateAlert: vi.fn(), searchFilterReporters: vi.fn(), searchFilterStudents: vi.fn(),
}));
vi.mock('@/lib/filter-early-departure-draft', () => ({
  getLateEntryDraft: mocks.draft, saveLateEntryDraft: mocks.saveDraft,
  clearLateEntryDraft: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('file-saver', () => ({ saveAs: mocks.saveAs }));

import ExcelJS from 'exceljs';
import { FilterLateLog } from '@/components/filter/FilterLateLog';

const data = {
  tenantId: 'plantel-uno', actorUserId: 'encargado', actorName: 'Encargada de filtro',
  isGeneral: false, groups: [], levels: [], students: [], recent: [],
};
const clock = { iso: '2026-10-16T12:00:00.000Z', success: true, timezone: 'America/Mexico_City' };
const entry = (id: string) => ({
  id, arrivedAt: '2026-10-16T12:00:00.000Z', reasonCode: 'trafico', reasonLabel: 'Tráfico', reasonDetail: null,
  evidenceAttached: id.endsWith('-0'),
  reporterName: 'Encargada de filtro', registeredByUserId: 'encargado', createdAt: '2026-10-16T12:01:00.000Z',
  clientRequestId: `solicitud-${id}`, groupEventId: null,
});
const row = (id: string, name: string, count: number) => ({
  studentId: id, studentName: name, studentActive: id !== 'alumno-inactivo', groupId: 'grupo-uno',
  levelName: 'Primaria', gradeName: 'Sexto', groupName: 'A', totalLateEntries: count,
  entries: Array.from({ length: count }, (_, index) => entry(`${id}-${index}`)),
});

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  mocks.draft.mockResolvedValue(null);
  mocks.saveDraft.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('Excel de la bitácora de retardos', () => {
  it('descarga un XLSX real con resumen ordenado e historial íntegro, sin alumnos con cero', async () => {
    mocks.exportHistory.mockResolvedValue({
      success: true, generatedAt: '2026-10-16T15:00:00.000Z', institutionName: 'Colegio Xóchitlán',
      institutionColor: '#07876A', timezone: 'America/Mexico_City',
      rows: [row('alumno-uno', 'Ana Pérez', 1), row('alumno-cero', 'Cero López', 0), row('alumno-inactivo', 'Beto Ruiz', 2)],
    });
    render(<FilterLateLog initialData={data} initialClock={clock} />);
    const button = await screen.findByRole('button', { name: 'Descargar historial en Excel' });
    expect(button.className).toContain('bg-primary');
    expect(screen.getByRole('button', { name: 'Reiniciar proceso' })).toBeVisible();
    fireEvent.click(button);

    await waitFor(() => expect(mocks.saveAs).toHaveBeenCalledTimes(1), { timeout: 8000 });
    const [blob, filename] = mocks.saveAs.mock.calls[0] as [Blob, string];
    expect(filename).toBe('retardos-colegio-xochitlan-2026-10-16.xlsx');
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readBlob(blob));
    const summary = workbook.getWorksheet('Resumen'); const history = workbook.getWorksheet('Historial');
    expect(summary).toBeDefined(); expect(history).toBeDefined();
    expect(summary!.getRow(6).getCell(2).value).toBe('Beto Ruiz');
    expect(summary!.getRow(6).getCell(7).value).toBe(2);
    expect(summary!.getRow(7).getCell(2).value).toBe('Ana Pérez');
    expect(summary!.getRow(8).getCell(2).value).toBeNull();
    expect(summary!.getRow(5).getCell(3).value).toBe('Nivel actual');
    expect(summary!.getRow(5).getCell(1).fill).toMatchObject({ fgColor: { argb: 'FF07876A' } });
    expect([6, 7, 8].map((number) => history!.getRow(number).getCell(2).value)).toEqual(['Beto Ruiz', 'Beto Ruiz', 'Ana Pérez']);
    expect(history!.getRow(5).getCell(11).value).toBe('Evidencia adjunta');
    expect([6, 7, 8].map((number) => history!.getRow(number).getCell(11).value)).toEqual(['Sí', 'No', 'Sí']);
    expect(history!.getRow(9).getCell(2).value).toBeNull();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Excel descargado' }));
  }, 20000);

  it('no descarga un archivo vacío cuando no hay retardos', async () => {
    mocks.exportHistory.mockResolvedValue({ success: true, generatedAt: '2026-10-16T15:00:00.000Z', institutionName: 'Colegio', institutionColor: '#07876A', timezone: 'America/Mexico_City', rows: [] });
    render(<FilterLateLog initialData={data} initialClock={clock} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar historial en Excel' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'No hay retardos registrados' })));
    expect(mocks.saveAs).not.toHaveBeenCalled();
  });
});
