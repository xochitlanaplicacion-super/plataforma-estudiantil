import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFilterLateHistoryRows,
  collectFilterLateHistoryPages,
  type FilterLateHistorySourceEntry,
} from '@/lib/filter-late-export';

const mocks = vi.hoisted(() => ({ requireTenantSession: vi.fn() }));
vi.mock('@/lib/tenant/context', () => ({ requireTenantSession: mocks.requireTenantSession }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { exportFilterLateArrivalsHistory } from '@/lib/actions/filter-control';

const tenantId = 'tenant-a';
const groupId = 'group-a';
const levelId = 'level-a';

function source(overrides: Partial<FilterLateHistorySourceEntry> = {}): FilterLateHistorySourceEntry {
  return {
    id: 'entry-a', studentId: 'student-a', studentName: 'Ana Pérez', studentActive: true,
    groupId, arrivedAt: '2026-10-15T08:00:00.000Z', reasonCode: 'trafico',
    reasonDetail: null, evidenceAttached: false, reporterName: 'Docente', registeredByUserId: 'actor-a',
    createdAt: '2026-10-15T08:01:00.000Z', clientRequestId: 'request-a', groupEventId: 'event-a',
    ...overrides,
  };
}

beforeEach(() => mocks.requireTenantSession.mockReset());

describe('historial completo de retardos', () => {
  it('agrupa por ID, incluye alumnos inactivos con retardos y ordena de mayor a menor', () => {
    const rows = buildFilterLateHistoryRows([
      source({ id: 'a-1', studentName: 'Alex', arrivedAt: '2026-10-01T08:00:00Z', evidenceAttached: true }),
      source({ id: 'b-1', studentId: 'student-b', studentName: 'Alex', studentActive: false }),
      source({ id: 'a-2', studentName: 'Alex', arrivedAt: '2026-10-16T08:00:00Z', reasonCode: 'salud' }),
    ], [{ id: groupId, levelId, gradeName: 'Sexto', groupName: 'B' }], [{ id: levelId, name: 'Primaria' }]);

    expect(rows.map((row) => [row.studentId, row.totalLateEntries])).toEqual([
      ['student-a', 2], ['student-b', 1],
    ]);
    expect(rows[1].studentActive).toBe(false);
    expect(rows[0].entries.map((entry) => entry.id)).toEqual(['a-2', 'a-1']);
    expect(rows[0].entries[0].reasonLabel).toBe('Salud o consulta médica');
    expect(rows[0].entries[1].evidenceAttached).toBe(true);
    expect(rows[0].gradeName).toBe('Sexto');
  });

  it('no corta al alcanzar 1000 filas y avanza por cursor estable', async () => {
    const all = Array.from({ length: 1_201 }, (_, index) => ({ id: `entry-${String(index).padStart(4, '0')}` }));
    const cursors: Array<string | null> = [];
    const rows = await collectFilterLateHistoryPages(async (afterId, pageSize) => {
      cursors.push(afterId);
      return all.filter((row) => afterId === null || row.id > afterId).slice(0, pageSize);
    }, 500);
    expect(rows).toHaveLength(1_201);
    expect(cursors).toEqual([null, 'entry-0499', 'entry-0999']);
  });

  it('rechaza una página que repite el cursor para evitar exportar un historial incompleto', async () => {
    await expect(collectFilterLateHistoryPages(async () => [{ id: 'same' }], 1))
      .rejects.toThrow(/cambió de orden/);
  });

  it('consulta todas las páginas sólo del tenant y omite registros posteriores al corte', async () => {
    const studentRows = [
      { id: 'student-a', tenant_id: tenantId, full_name: 'Ana Pérez', active: true, group_id: groupId },
      { id: 'student-b', tenant_id: tenantId, full_name: 'Bruno Díaz', active: false, group_id: groupId },
      { id: 'student-zero', tenant_id: tenantId, full_name: 'Cero', active: true, group_id: groupId },
      { id: 'student-other', tenant_id: 'tenant-b', full_name: 'Otro', active: true, group_id: 'group-other' },
    ];
    const lateRows = Array.from({ length: 1_200 }, (_, index) => ({
      id: `late-${String(index).padStart(4, '0')}`, tenant_id: tenantId, student_id: 'student-a',
      arrived_at: '2026-10-01T08:00:00Z', reason_code: 'trafico', reason_detail: null, evidence_path: index === 0 ? 'private/legacy-photo.jpg' : null,
      reporter_name: 'Docente', registered_by_user_id: 'actor-a', created_at: '2026-10-01T08:01:00Z',
      client_request_id: `request-${index}`, group_event_id: `group-${index}`,
    }));
    lateRows.push({ ...lateRows[0], id: 'late-1200', student_id: 'student-b' });
    lateRows.push({ ...lateRows[0], id: 'late-1201', tenant_id: 'tenant-b', student_id: 'student-other' });
    lateRows.push({ ...lateRows[0], id: 'late-1202', created_at: '2100-01-01T00:00:00Z' });
    const tables: Record<string, Record<string, unknown>[]> = {
      tenant_features: [{ tenant_id: tenantId, primary_filter_enabled: true, timezone: 'America/Mexico_City' }],
      filter_late_entries: lateRows,
      filter_groups: [{ id: groupId, tenant_id: tenantId, level_id: levelId, grade_name: 'Sexto', group_name: 'B' }],
      filter_levels: [{ id: levelId, tenant_id: tenantId, name: 'Primaria' }],
      configuracion_sistema: [{ tenant_id: tenantId, nombre_completo: 'Colegio Xochitlán', color_primario: '#007A64' }],
    };
    const reads: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
    const audits: Record<string, unknown>[] = [];
    let latePages = 0;
    const from = (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const predicates: Array<(row: Record<string, unknown>) => boolean> = [];
      let pageLimit: number | null = null;
      let orderKey: string | null = null;
      let insertPayload: Record<string, unknown> | null = null;
      const execute = async () => {
        if (insertPayload) { audits.push(insertPayload); return { data: [insertPayload], error: null }; }
        reads.push({ table, filters: [...filters] });
        if (table === 'filter_late_entries') latePages += 1;
        let rows = (tables[table] || []).filter((row) => predicates.every((predicate) => predicate(row)));
        if (orderKey) rows = rows.sort((a, b) => String(a[orderKey!]).localeCompare(String(b[orderKey!])));
        if (pageLimit !== null) rows = rows.slice(0, pageLimit);
        if (table === 'filter_late_entries') rows = rows.map((row) => ({
          ...row, filter_students: studentRows.find((student) => student.id === row.student_id) || null,
        }));
        return { data: rows, error: null };
      };
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); predicates.push((row) => row[key] === value); return query; },
        lte: (key: string, value: unknown) => { predicates.push((row) => String(row[key]) <= String(value)); return query; },
        gt: (key: string, value: unknown) => { predicates.push((row) => String(row[key]) > String(value)); return query; },
        in: (key: string, values: unknown[]) => { predicates.push((row) => values.includes(row[key])); return query; },
        order: (key: string) => { orderKey = key; return query; },
        limit: (value: number) => { pageLimit = value; return query; },
        insert: (payload: Record<string, unknown>) => { insertPayload = payload; return query; },
        maybeSingle: async () => { const result = await execute(); return { data: result.data[0] || null, error: result.error }; },
        then: (resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) => execute().then(resolve, reject),
      };
      return query;
    };
    mocks.requireTenantSession.mockResolvedValue({
      tenantId, tenant: { nombre: 'Institución' }, user: { id: 'actor-a' },
      profile: { nombre: 'Encargado', apellidos: 'Filtro', rol: 'encargado_filtro' },
      admin: { from },
    });

    const result = await exportFilterLateArrivalsHistory();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(latePages).toBe(3);
    expect(result.rows.map((row) => [row.studentId, row.totalLateEntries])).toEqual([
      ['student-a', 1_200], ['student-b', 1],
    ]);
    expect(result.rows[1].studentActive).toBe(false);
    expect(result.rows[0].entries.some((entry) => entry.evidenceAttached)).toBe(true);
    expect(JSON.stringify(result.rows)).not.toContain('private/legacy-photo.jpg');
    expect(result.institutionName).toBe('Colegio Xochitlán');
    expect(result.institutionColor).toBe('#007A64');
    expect(reads.every(({ filters }) => filters.some(([key, value]) => key === 'tenant_id' && value === tenantId))).toBe(true);
    expect(audits).toEqual([expect.objectContaining({
      tenant_id: tenantId, action: 'late_entry.exported',
      details: expect.objectContaining({ studentCount: 2, lateEntryCount: 1_201 }),
    })]);
    expect(JSON.stringify(audits)).not.toContain('Ana Pérez');
  });
});
