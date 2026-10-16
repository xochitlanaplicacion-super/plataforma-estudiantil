// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireTenantSession: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/tenant/context', () => ({ requireTenantSession: mocks.requireTenantSession }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { createEarlyDeparture, createExtraordinaryHandoff } from '@/lib/actions/filter-control';

const tenantId = '11111111-1111-4111-8111-111111111111';
const studentA = '22222222-2222-4222-8222-222222222222';
const studentB = '33333333-3333-4333-8333-333333333333';
const groupId = '44444444-4444-4444-8444-444444444444';
const levelId = '55555555-5555-4555-8555-555555555555';
const requestId = '66666666-6666-4666-8666-666666666666';
const actorId = '77777777-7777-4777-8777-777777777777';
const finalRowId = '88888888-8888-4888-8888-888888888888';
const preliminaryEvidencePath = `${tenantId}/preregistros/${requestId}/aviso.jpg`;

type Row = Record<string, any>;
type Kind = 'early' | 'extraordinary';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(kind: Kind, studentIds = [studentA]) {
  const tables: Record<string, Row[]> = {
    tenant_features: [{ tenant_id: tenantId, primary_filter_enabled: true, timezone: 'America/Mexico_City' }],
    filter_students: [
      { tenant_id: tenantId, id: studentA, full_name: 'Ana Pérez', group_id: groupId, active: true },
      { tenant_id: tenantId, id: studentB, full_name: 'Bruno Díaz', group_id: groupId, active: true },
    ],
    filter_groups: [{ tenant_id: tenantId, id: groupId, level_id: levelId, grade_name: 'Primero', group_name: 'A' }],
    filter_levels: [{ tenant_id: tenantId, id: levelId, name: 'Primaria' }],
    filter_staff_profiles: [],
    filter_alert_settings: [{ tenant_id: tenantId, require_verified_guardian_contact: false }],
    filter_preregistrations: [{
      id: requestId, tenant_id: tenantId, kind, student_ids: studentIds, status: 'pending',
      evidence_path: preliminaryEvidencePath, completed_at: null,
    }],
    filter_early_departures: [],
    filter_extraordinary_handoffs: [],
    filter_audit_log: [],
    filter_reporters: [],
  };
  const uploads: string[] = [];
  const removals: string[][] = [];
  const events: string[] = [];
  let beforeFinalInsert: (() => Promise<void>) | null = null;
  let failUploadMatching: string | null = null;

  const from = (table: string) => {
    const predicates: Array<(row: Row) => boolean> = [];
    let action: 'read' | 'insert' | 'update' | 'upsert' = 'read';
    let payload: Row | Row[] = {};
    let limit: number | null = null;
    const rows = () => (tables[table] || []).filter((row) => predicates.every((predicate) => predicate(row)));
    const execute = async () => {
      if (action === 'insert') {
        const values = Array.isArray(payload) ? payload : [payload];
        if (table === 'filter_early_departures' || table === 'filter_extraordinary_handoffs') {
          await beforeFinalInsert?.();
        }
        const inserted = values.map((value, index) => ({ id: value.id || (table === 'filter_audit_log' ? `audit-${tables.filter_audit_log.length + index + 1}` : finalRowId), ...value }));
        (tables[table] ||= []).push(...inserted);
        events.push(`${table}.insert`);
        return { data: inserted, error: null };
      }
      if (action === 'update') {
        const selected = rows();
        for (const row of selected) Object.assign(row, payload);
        events.push(`${table}.update`);
        return { data: selected, error: null };
      }
      if (action === 'upsert') return { data: null, error: null };
      const selected = rows();
      return { data: limit === null ? selected : selected.slice(0, limit), error: null };
    };
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { predicates.push((row) => values.includes(row[key])); return query; },
      limit: (value: number) => { limit = value; return query; },
      insert: (value: Row | Row[]) => { action = 'insert'; payload = value; return query; },
      update: (value: Row) => { action = 'update'; payload = value; return query; },
      upsert: (value: Row) => { action = 'upsert'; payload = value; return query; },
      maybeSingle: async () => { const result = await execute(); return { data: result.data?.[0] || null, error: result.error }; },
      single: async () => { const result = await execute(); return { data: result.data?.[0] || null, error: result.error }; },
      then: (resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) => execute().then(resolve, reject),
    };
    return query;
  };

  mocks.requireTenantSession.mockImplementation(async () => ({
    tenantId,
    user: { id: actorId },
    profile: { nombre: 'Encargado', apellidos: 'de Filtro', rol: 'encargado_filtro' },
    admin: {
      from,
      storage: { from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { error: failUploadMatching && path.includes(failUploadMatching) ? { message: 'Falló la carga de prueba' } : null };
        },
        remove: async (paths: string[]) => { removals.push(paths); return { error: null }; },
      }) },
    },
  }));
  return {
    tables, uploads, removals, events,
    waitBeforeFinalInsert: (wait: () => Promise<void>) => { beforeFinalInsert = wait; },
    failUploadWhenPathIncludes: (text: string) => { failUploadMatching = text; },
  };
}

function image(name: string) { return new File(['imagen'], name, { type: 'image/jpeg' }); }
function signature() { return new File(['firma'], 'firma.png', { type: 'image/png' }); }

function earlyForm() {
  const form = new FormData();
  form.set('clientRequestId', requestId);
  form.set('preRegistrationId', requestId);
  form.set('studentId', studentA);
  form.set('studentIds', JSON.stringify([studentA]));
  form.set('relationship', 'madre');
  form.set('notificationMethod', 'llamada');
  form.set('departureReason', 'cita_medica');
  form.set('notifiedParty', 'madre');
  form.set('confirmed', 'true');
  form.set('pickupPersonName', 'María Pérez');
  form.set('notifiedStaffName', 'Personal de guardia');
  form.set('deliveringTeacherName', 'Docente de grupo');
  form.set('pickupPersonPhoto', image('persona.jpg'));
  form.set('finalHandoverPhoto', image('entrega.jpg'));
  form.set('pickupSignature', signature());
  return form;
}

function extraordinaryForm() {
  const form = new FormData();
  form.set('clientRequestId', requestId);
  form.set('preRegistrationId', requestId);
  form.set('studentId', studentA);
  form.set('studentIds', JSON.stringify([studentA]));
  form.set('deliveryContext', 'horario_escolar');
  form.set('pickupRelationship', 'familiar');
  form.set('authorizationMethod', 'llamada');
  form.set('status', 'entregado');
  form.set('manualAuthorizerName', 'Madre autorizante');
  form.set('manualAuthorizerRelationship', 'madre');
  form.set('adultConfirmed', 'true');
  form.set('identityMatches', 'true');
  form.set('noVisibleImpairment', 'true');
  form.set('institutionApproved', 'true');
  form.set('protocolConfirmed', 'true');
  form.set('consentStatus', 'confirmado');
  form.set('deliveryReason', 'Autorización excepcional de la familia');
  form.set('pickupPersonName', 'María Pérez');
  form.set('authorizationVerifierName', 'Personal de guardia');
  form.set('approverName', 'Dirección escolar');
  form.set('deliveringTeacherName', 'Docente de grupo');
  form.set('pickupPersonPhoto', image('persona.jpg'));
  form.set('finalHandoverPhoto', image('entrega.jpg'));
  form.set('pickupSignature', signature());
  return form;
}

beforeEach(() => {
  mocks.requireTenantSession.mockReset();
  mocks.revalidatePath.mockReset();
});

describe('captura final vinculada a un preregistro de Filtro', () => {
  it('completa una orden anticipada sólo después de insertar la bitácora final', async () => {
    const db = setup('early');
    const insertStarted = deferred();
    const releaseInsert = deferred();
    db.waitBeforeFinalInsert(async () => { insertStarted.resolve(); await releaseInsert.promise; });

    const submission = createEarlyDeparture(earlyForm());
    await Promise.race([
      insertStarted.promise,
      submission.then((result) => { throw new Error(`La captura terminó antes de insertar: ${JSON.stringify(result)}`); }),
    ]);
    expect(db.tables.filter_early_departures).toHaveLength(0);
    expect(db.tables.filter_preregistrations[0].status).toBe('pending');

    releaseInsert.resolve();
    expect(await submission).toMatchObject({ success: true, duplicate: false, groupEventId: requestId, count: 1 });
    expect(db.tables.filter_early_departures).toHaveLength(1);
    expect(db.tables.filter_preregistrations[0].status).toBe('completed');
    expect(db.events.indexOf('filter_early_departures.insert')).toBeLessThan(db.events.indexOf('filter_preregistrations.update'));
  });

  it('vincula el aviso ya cargado al registro final anticipado sin volver a subirlo', async () => {
    const db = setup('early');
    const form = earlyForm();
    form.set('reusePreRegistrationEvidence', 'true');
    const result = await createEarlyDeparture(form);
    expect(result).toMatchObject({ success: true, duplicate: false });
    expect(db.tables.filter_early_departures[0].notification_evidence_path).toBe(preliminaryEvidencePath);
    expect(db.uploads).toHaveLength(3);
    expect(db.removals).toHaveLength(0);
  });

  it('rechaza reutilizar un aviso cuya ruta no pertenece al preregistro validado', async () => {
    const db = setup('early');
    db.tables.filter_preregistrations[0].evidence_path = 'otro-tenant/preregistros/otro/aviso.jpg';
    const form = earlyForm();
    form.set('reusePreRegistrationEvidence', 'true');
    const result = await createEarlyDeparture(form);
    expect(result.success).toBe(false);
    expect(result.error).toContain('no corresponde a esta institución u orden');
    expect(db.tables.filter_early_departures).toHaveLength(0);
    expect(db.uploads).toHaveLength(0);
    expect(db.removals).toHaveLength(0);
  });

  it.each([
    { label: 'tipo', kind: 'extraordinary' as const, studentIds: [studentA] },
    { label: 'alumno', kind: 'early' as const, studentIds: [studentB] },
  ])('rechaza una orden vinculada con $label diferente', async ({ kind, studentIds }) => {
    const db = setup(kind, studentIds);
    const result = await createEarlyDeparture(earlyForm());
    expect(result.success).toBe(false);
    expect(result.error).toContain('La orden no corresponde con el tipo o los alumnos');
    expect(db.tables.filter_preregistrations[0].status).toBe('pending');
    expect(db.tables.filter_early_departures).toHaveLength(0);
    expect(db.uploads).toHaveLength(0);
  });

  it('exige archivo final si no se elige reutilizar el aviso del preregistro extraordinario', async () => {
    const db = setup('extraordinary');
    const form = extraordinaryForm();
    const missingEvidence = await createExtraordinaryHandoff(form);
    expect(missingEvidence.success).toBe(false);
    expect(missingEvidence.error).toContain('La evidencia de autorización verificada');
    expect(db.tables.filter_preregistrations[0].status).toBe('pending');
    expect(db.tables.filter_extraordinary_handoffs).toHaveLength(0);
    expect(db.uploads).toHaveLength(0);

    form.set('authorizationEvidence', image('autorizacion-final.jpg'));
    const submitted = await createExtraordinaryHandoff(form);
    expect(submitted).toMatchObject({ success: true, duplicate: false });
    expect(db.tables.filter_extraordinary_handoffs[0].authorization_evidence_path).toContain('/autorizacion.jpg');
    expect(db.tables.filter_extraordinary_handoffs[0].authorization_evidence_path).not.toBe(preliminaryEvidencePath);
    expect(db.tables.filter_preregistrations[0].status).toBe('completed');
  });

  it('admite el aviso del preregistro extraordinario como evidencia final tras las verificaciones', async () => {
    const db = setup('extraordinary');
    const form = extraordinaryForm();
    form.set('reusePreRegistrationEvidence', 'true');
    const result = await createExtraordinaryHandoff(form);
    expect(result).toMatchObject({ success: true, duplicate: false });
    const final = db.tables.filter_extraordinary_handoffs[0];
    expect(final.authorization_evidence_path).toBe(preliminaryEvidencePath);
    expect(final.authorization_verifier_name).toBe('Personal de guardia');
    expect(final.consent_status).toBe('confirmado');
    expect(db.uploads).toHaveLength(3);
    expect(db.removals).toHaveLength(0);
    expect(db.tables.filter_preregistrations[0].status).toBe('completed');
  });

  it('no sustituye el consentimiento final por una foto del preregistro', async () => {
    const db = setup('extraordinary');
    const form = extraordinaryForm();
    form.set('reusePreRegistrationEvidence', 'true');
    form.set('consentStatus', 'sin_respuesta');
    const result = await createExtraordinaryHandoff(form);
    expect(result.success).toBe(false);
    expect(result.error).toContain('faltan validaciones obligatorias');
    expect(db.tables.filter_extraordinary_handoffs).toHaveLength(0);
    expect(db.uploads).toHaveLength(0);
  });

  it('ante un error de carga conserva intacto el archivo preexistente del preregistro', async () => {
    const db = setup('extraordinary');
    db.failUploadWhenPathIncludes('/entrega.');
    const form = extraordinaryForm();
    form.set('reusePreRegistrationEvidence', 'true');
    const result = await createExtraordinaryHandoff(form);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Falló la carga de prueba');
    expect(db.removals.flat()).not.toContain(preliminaryEvidencePath);
    expect(db.removals.flat()).toEqual(expect.arrayContaining([expect.stringContaining('/persona.jpg')]));
    expect(db.tables.filter_preregistrations[0].status).toBe('pending');
  });

  it('reconcilia un reintento sin duplicar la salida final ya guardada', async () => {
    const db = setup('early');
    db.tables.filter_early_departures.push({
      id: finalRowId, tenant_id: tenantId, group_event_id: requestId,
      client_request_id: requestId, student_id: studentA,
    });
    const result = await createEarlyDeparture(earlyForm());
    expect(result).toMatchObject({ success: true, duplicate: true, id: finalRowId, count: 1 });
    expect(db.tables.filter_early_departures).toHaveLength(1);
    expect(db.tables.filter_preregistrations[0].status).toBe('completed');
    expect(db.uploads).toHaveLength(0);
    expect(db.removals).toHaveLength(0);
  });
});
