import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ supabase: null as any }));

vi.mock('@/lib/tenant/context', () => ({
  requireTenantSession: vi.fn(async () => ({ supabase: session.supabase, tenantId: 'tenant-a' })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), unstable_noStore: vi.fn() }));

import { syncGroupFromBaseGroup } from '@/lib/actions/academic';

type Row = { id: string; tenant_id: string; sync_id: string | null; [key: string]: any };
type Operation = { kind: 'insert' | 'update'; table: string; values: Row[] | Record<string, unknown> };

function fakeDatabase(options: { failExerciseUpdate?: boolean; concurrentExerciseSync?: boolean } = {}) {
  const rows: Record<string, Row[]> = {
    unidades: [{ id: 'unit-source', tenant_id: 'tenant-a', materia_id: 'source', sync_id: null, created_at: '2026-09-20T12:00:00Z' }],
    temas: [{ id: 'topic-source', tenant_id: 'tenant-a', unidad_id: 'unit-source', sync_id: null }],
    ejercicios: [{ id: 'exercise-source', tenant_id: 'tenant-a', tema_id: 'topic-source', sync_id: null, created_at: '2026-09-20T12:00:00Z', titulo: 'Tarea' }],
    slides: [{ id: 'slide-source', tenant_id: 'tenant-a', tema_id: 'topic-source', sync_id: null }],
    resources: [{ id: 'resource-source', tenant_id: 'tenant-a', tema_id: 'topic-source', sync_id: null }],
  };
  const operations: Operation[] = [];
  let nextId = 0;

  const from = vi.fn((table: string) => ({
    select: (columns: string) => query(table, 'select', null, columns),
    insert: (values: Row | Row[]) => query(table, 'insert', values, null),
    update: (values: Record<string, unknown>) => query(table, 'update', values, null),
  }));

  function query(table: string, kind: 'select' | 'insert' | 'update', values: any, initialColumns: string | null) {
    const filters: Array<(row: Row) => boolean> = [];
    let columns = initialColumns;
    const execute = async () => {
      if (kind === 'select') {
        const data = (rows[table] || []).filter((row) => filters.every((filter) => filter(row)))
          .map((row) => columns === 'sync_id' ? { sync_id: row.sync_id } : { ...row });
        return { data, error: null };
      }
      if (kind === 'update') {
        if (table === 'ejercicios' && options.failExerciseUpdate) {
          return { data: null, error: { message: 'sync update denied' } };
        }
        if (table === 'ejercicios' && options.concurrentExerciseSync) {
          rows.ejercicios.find((row) => row.id === 'exercise-source')!.sync_id = 'concurrent-sync';
        }
        const matched = (rows[table] || []).filter((row) => filters.every((filter) => filter(row)));
        matched.forEach((row) => Object.assign(row, values));
        operations.push({ kind, table, values });
        return { data: matched.map((row) => ({ sync_id: row.sync_id })), error: null };
      }
      const inserted = (Array.isArray(values) ? values : [values]).map((value) => ({
        ...value, id: `copy-${++nextId}`,
      }));
      rows[table].push(...inserted);
      operations.push({ kind, table, values: inserted });
      return { data: columns ? inserted.map((row) => ({ id: row.id })) : null, error: null };
    };
    const result: any = {
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return result; },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return result; },
      is(key: string, value: null) { filters.push((row) => row[key] === value); return result; },
      select(value: string) { columns = value; return result; },
      async single() {
        const response = await execute();
        return { ...response, data: response.data?.[0] ?? null };
      },
      async maybeSingle() {
        const response = await execute();
        return { ...response, data: response.data?.[0] ?? null };
      },
      then(resolve: any, reject: any) { return execute().then(resolve, reject); },
    };
    return result;
  }

  session.supabase = { from };
  return { rows, operations, from };
}

describe('syncGroupFromBaseGroup', () => {
  it('persists one source sync ID per item and reuses it across target subjects', async () => {
    const db = fakeDatabase();

    expect(await syncGroupFromBaseGroup('source', ['target-a', 'target-b']))
      .toEqual({ success: true });

    for (const table of ['unidades', 'temas', 'ejercicios', 'slides', 'resources']) {
      const [source, ...copies] = db.rows[table];
      expect(source.sync_id).toBeTruthy();
      expect(copies).toHaveLength(2);
      expect(copies.map((copy) => copy.sync_id)).toEqual([source.sync_id, source.sync_id]);
      expect(db.operations.filter((op) => op.kind === 'update' && op.table === table))
        .toEqual([{ kind: 'update', table, values: { sync_id: source.sync_id } }]);
    }
    expect(db.rows.ejercicios[0].created_at).toBe('2026-09-20T12:00:00Z');
    expect(db.operations.findIndex((op) => op.kind === 'update' && op.table === 'ejercicios'))
      .toBeLessThan(db.operations.findIndex((op) => op.kind === 'insert' && op.table === 'ejercicios'));
    expect(db.from).not.toHaveBeenCalledWith('resultados_ejercicios');
  });

  it('uses a concurrently assigned source ID instead of the generated candidate', async () => {
    const db = fakeDatabase({ concurrentExerciseSync: true });

    expect(await syncGroupFromBaseGroup('source', ['target-a', 'target-b']))
      .toEqual({ success: true });
    expect(db.rows.ejercicios.map((row) => row.sync_id))
      .toEqual(['concurrent-sync', 'concurrent-sync', 'concurrent-sync']);
  });

  it('keeps an existing source ID without updating its row', async () => {
    const db = fakeDatabase();
    db.rows.ejercicios[0].sync_id = 'existing-sync';

    expect(await syncGroupFromBaseGroup('source', ['target-a']))
      .toEqual({ success: true });
    expect(db.rows.ejercicios.map((row) => row.sync_id))
      .toEqual(['existing-sync', 'existing-sync']);
    expect(db.operations.some((op) => op.kind === 'update' && op.table === 'ejercicios'))
      .toBe(false);
  });

  it('stops before inserting exercise copies when the source ID cannot be saved', async () => {
    const db = fakeDatabase({ failExerciseUpdate: true });

    expect(await syncGroupFromBaseGroup('source', ['target-a']))
      .toEqual({ success: false, error: 'sync update denied' });
    expect(db.rows.ejercicios).toHaveLength(1);
  });
});
