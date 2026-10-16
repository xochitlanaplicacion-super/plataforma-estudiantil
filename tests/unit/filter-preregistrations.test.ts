// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireTenantSession: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('@/lib/tenant/context', () => ({ requireTenantSession: mocks.requireTenantSession }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  completeFilterPreRegistration,
  createFilterPreregistration,
  getFilterPreRegistration,
  getFilterPreregistrationFormData,
  listFilterPreRegistrations,
} from '@/lib/actions/filter-preregistrations';

const tenantId = '11111111-1111-4111-8111-111111111111';
const teacherId = '22222222-2222-4222-8222-222222222222';
const filterUserId = '33333333-3333-4333-8333-333333333333';
const studentA = '44444444-4444-4444-8444-444444444444';
const studentB = '55555555-5555-4555-8555-555555555555';
const filterGroupA = '66666666-6666-4666-8666-666666666666';
const filterGroupB = '77777777-7777-4777-8777-777777777777';
const academicGroupA = '88888888-8888-4888-8888-888888888888';
const academicGroupB = '99999999-9999-4999-8999-999999999999';
const gradeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const levelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const filterLevelId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const cycleId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const requestId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const careerId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function setup(role: 'profesor' | 'encargado_filtro' = 'encargado_filtro') {
  const tables: Record<string, any[]> = {
    tenant_features: [{ tenant_id: tenantId, primary_filter_enabled: true, timezone: 'America/Mexico_City' }],
    ciclos_escolares: [{ tenant_id: tenantId, id: cycleId, estado: 'activo' }],
    asignaciones_profesor: [
      { tenant_id: tenantId, id: 'a', grupo_id: academicGroupA, grado_id: gradeId, nivel_id: levelId, ciclo_escolar_id: cycleId, profesor_id: teacherId, activo: true, tipo_participacion: 'titular', vigencia_desde: '2026-01-01', vigencia_hasta: null },
      { tenant_id: tenantId, id: 'b', grupo_id: academicGroupB, grado_id: gradeId, nivel_id: levelId, ciclo_escolar_id: cycleId, profesor_id: filterUserId, activo: true, tipo_participacion: 'titular', vigencia_desde: '2026-01-01', vigencia_hasta: null },
    ],
    grupos: [
      { tenant_id: tenantId, id: academicGroupA, carrera_id: careerId, grado_id: gradeId, nombre: 'GRUPO A', activo: true },
      { tenant_id: tenantId, id: academicGroupB, carrera_id: careerId, grado_id: gradeId, nombre: 'GRUPO B', activo: true },
    ],
    carreras: [{ tenant_id: tenantId, id: careerId, nivel_id: levelId, activo: true }],
    grados: [{ tenant_id: tenantId, id: gradeId, nombre: 'PRIMER AÑO', activo: true }],
    niveles: [{ tenant_id: tenantId, id: levelId, nombre: 'PRIMARIA MAYOR', activo: true }],
    filter_levels: [{ tenant_id: tenantId, id: filterLevelId, name: 'Primaria' }],
    filter_groups: [
      { tenant_id: tenantId, id: filterGroupA, level_id: filterLevelId, grade_name: 'Primero', group_name: 'A' },
      { tenant_id: tenantId, id: filterGroupB, level_id: filterLevelId, grade_name: 'Primero', group_name: 'B' },
    ],
    filter_students: [
      { tenant_id: tenantId, id: studentA, full_name: 'Ana Pérez', group_id: filterGroupA, active: true },
      { tenant_id: tenantId, id: studentB, full_name: 'Bruno Díaz', group_id: filterGroupB, active: true },
    ],
    filter_preregistrations: [],
    filter_early_departures: [],
    filter_extraordinary_handoffs: [],
    filter_audit_log: [],
  };
  const uploads: string[] = [];
  const removed: string[] = [];
  const from = (table: string) => {
    const predicates: Array<(row: any) => boolean> = [];
    let action: 'read' | 'insert' | 'update' = 'read';
    let payload: any;
    let range: [number, number] | null = null;
    const rows = () => (tables[table] || []).filter((row) => predicates.every((predicate) => predicate(row)));
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { predicates.push((row) => values.includes(row[key])); return query; },
      order: () => query,
      range: (fromIndex: number, toIndex: number) => { range = [fromIndex, toIndex]; return query; },
      insert: (value: any) => { action = 'insert'; payload = value; return query; },
      update: (value: any) => { action = 'update'; payload = value; return query; },
      maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
      then: (resolve: (result: any) => unknown, reject?: (error: unknown) => unknown) => {
        if (action === 'insert') {
          const values = Array.isArray(payload) ? payload : [payload];
          for (const value of values) (tables[table] ||= []).push({ status: 'pending', created_at: '2026-10-15T10:00:00Z', completed_at: null, ...value });
          return Promise.resolve({ data: values, error: null }).then(resolve, reject);
        }
        if (action === 'update') {
          for (const row of rows()) Object.assign(row, payload);
          return Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
        }
        const selected = rows();
        return Promise.resolve({ data: range ? selected.slice(range[0], range[1] + 1) : selected, error: null }).then(resolve, reject);
      },
    };
    return query;
  };
  const storage = {
    upload: async (path: string) => { uploads.push(path); return { error: null }; },
    remove: async (paths: string[]) => { removed.push(...paths); return { error: null }; },
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://example.test/${path}` }, error: null }),
    createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ signedUrl: `https://example.test/${path}` })), error: null }),
  };
  mocks.requireTenantSession.mockImplementation(async () => ({
    tenantId,
    user: { id: role === 'profesor' ? teacherId : filterUserId },
    profile: { nombre: role === 'profesor' ? 'Docente' : 'Cuenta', apellidos: role === 'profesor' ? 'Titular' : 'Compartida', rol: role },
    admin: { from, storage: { from: () => storage } },
  }));
  return { tables, uploads, removed };
}

function form(kind: 'early' | 'extraordinary' = 'early', students = [studentA]) {
  const data = new FormData();
  data.set('clientRequestId', requestId);
  data.set('kind', kind);
  data.set('studentIds', JSON.stringify(students));
  data.set('evidence', new File(['aviso'], 'mensaje.jpg', { type: 'image/jpeg' }));
  if (kind === 'early') {
    data.set('notifiedStaffName', 'Personal que recibió aviso');
    data.set('notifiedParty', 'madre');
    data.set('notificationMethod', 'whatsapp');
  } else {
    data.set('deliveryContext', 'horario_escolar');
    data.set('deliveryReason', 'Entrega extraordinaria solicitada por la madre');
    data.set('reporterName', 'Personal que recibió aviso');
  }
  return data;
}

beforeEach(() => { mocks.requireTenantSession.mockReset(); mocks.revalidatePath.mockReset(); });

describe('preregistros cooperativos de Control de Filtro', () => {
  it('limita al docente titular a alumnos de grupos académicos coincidentes', async () => {
    const db = setup('profesor');
    const available = await getFilterPreregistrationFormData();
    expect(available.actorKind).toBe('teacher');
    expect(available.students.map((student) => student.id)).toEqual([studentA]);
    const rejected = await createFilterPreregistration(form('early', [studentB]));
    expect(rejected.success).toBe(false);
    expect(db.uploads).toHaveLength(0);
    const accepted = await createFilterPreregistration(form());
    expect(accepted).toEqual({ success: true, id: requestId });
    expect(db.tables.filter_preregistrations[0].created_by_actor_kind).toBe('teacher');
  });

  it('bloquea una coincidencia ambigua aunque el segundo grupo académico no tenga docente asignado', async () => {
    const db = setup('profesor');
    db.tables.grupos.push({ tenant_id: tenantId, id: '12345678-1234-4234-8234-123456789abc', carrera_id: careerId,
      grado_id: gradeId, nombre: 'A', activo: true });
    const available = await getFilterPreregistrationFormData();
    expect(available.students).toHaveLength(0);
    expect(available.rosterWarning).toContain('sin ambigüedad');
  });

  it('evalúa la vigencia del docente con la fecha de la institución, no UTC', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-16T03:00:00Z')); // Aún es 15 de octubre en Ciudad de México.
      const db = setup('profesor');
      db.tables.asignaciones_profesor[0].vigencia_hasta = '2026-10-15';
      const available = await getFilterPreregistrationFormData();
      expect(available.students.map((student) => student.id)).toEqual([studentA]);
    } finally { vi.useRealTimers(); }
  });

  it('permite a la cuenta compartida iniciar la orden con nombre declarado y evidencia privada', async () => {
    const db = setup();
    const created = await createFilterPreregistration(form('extraordinary'));
    expect(created).toEqual({ success: true, id: requestId });
    const stored = db.tables.filter_preregistrations[0];
    expect(stored.tenant_id).toBe(tenantId);
    expect(stored.declared_staff_name).toBe('Personal que recibió aviso');
    expect(stored.created_by_actor_kind).toBe('filter');
    expect(stored.status).toBe('pending');
    expect(db.uploads[0]).toContain(`${tenantId}/preregistros/${requestId}/`);
    const opened = await getFilterPreRegistration(requestId);
    expect(opened.order?.evidenceUrl).toContain('/preregistros/');
    expect(opened.order?.preliminary.deliveryContext).toBe('horario_escolar');
    expect(db.tables.filter_preregistrations[0].status).toBe('pending');
  });

  it('un reintento con el mismo identificador no sube otra foto ni duplica la orden', async () => {
    const db = setup();
    expect((await createFilterPreregistration(form())).success).toBe(true);
    expect((await createFilterPreregistration(form())).success).toBe(true);
    expect(db.tables.filter_preregistrations).toHaveLength(1);
    expect(db.uploads).toHaveLength(1);
  });

  it('sólo retira de pendientes tras confirmar todas las filas finales', async () => {
    const db = setup();
    await createFilterPreregistration(form());
    const before = await listFilterPreRegistrations();
    expect(before.orders).toHaveLength(1);
    const premature = await completeFilterPreRegistration(requestId, 'early', [studentA]);
    expect(premature.success).toBe(false);
    expect(db.tables.filter_preregistrations[0].status).toBe('pending');
    db.tables.filter_early_departures.push({ tenant_id: tenantId, group_event_id: requestId, student_id: studentA });
    const completed = await completeFilterPreRegistration(requestId, 'early', [studentA]);
    expect(completed.success).toBe(true);
    expect(db.tables.filter_preregistrations[0].status).toBe('completed');
    expect((await listFilterPreRegistrations()).orders).toHaveLength(0);
  });

  it('no considera completo un grupo si se repite un alumno y falta otro', async () => {
    const db = setup();
    expect((await createFilterPreregistration(form('early', [studentA, studentB]))).success).toBe(true);
    db.tables.filter_early_departures.push(
      { tenant_id: tenantId, group_event_id: requestId, student_id: studentA },
      { tenant_id: tenantId, group_event_id: requestId, student_id: studentA },
    );
    expect((await completeFilterPreRegistration(requestId, 'early', [studentA, studentB])).success).toBe(false);
    expect(db.tables.filter_preregistrations[0].status).toBe('pending');
  });

  it('rechaza cierre por tipo incorrecto y al docente no le concede cierre final', async () => {
    const db = setup();
    await createFilterPreregistration(form());
    db.tables.filter_extraordinary_handoffs.push({ tenant_id: tenantId, group_event_id: requestId, student_id: studentA });
    expect((await completeFilterPreRegistration(requestId, 'extraordinary', [studentA])).success).toBe(false);
    setup('profesor');
    expect((await completeFilterPreRegistration(requestId, 'early', [studentA])).success).toBe(false);
  });

  it('protege la nueva tabla con RLS y prohíbe escritura directa desde el navegador', () => {
    const migration = readFileSync('supabase/migrations/20261016044741_filter_preregistrations.sql', 'utf8');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('private.has_filter_access(tenant_id)');
    expect(migration).toContain('actor.id = created_by_user_id');
    expect(migration).toContain('feature.primary_filter_enabled');
    expect(migration).toContain('revoke all on public.filter_preregistrations from anon, authenticated');
    expect(migration).toContain('grant select on public.filter_preregistrations to authenticated');
  });
});
