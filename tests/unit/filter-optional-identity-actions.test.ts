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
const studentId = '22222222-2222-4222-8222-222222222222';
const groupId = '33333333-3333-4333-8333-333333333333';
const levelId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';

function mockFilterDatabase() {
  const inserted: Array<{ table: string; rows: any[] }> = [];
  const uploads: Array<{ path: string; file: File }> = [];
  const removed: string[][] = [];
  const dataFor = (table: string) => {
    if (table === 'tenant_features') return { primary_filter_enabled: true, timezone: 'America/Mexico_City' };
    if (table === 'filter_students') return [{ id: studentId, full_name: 'Alumno de prueba', group_id: groupId }];
    if (table === 'filter_groups') return [{ id: groupId, level_id: levelId, grade_name: 'Primero', group_name: 'A' }];
    if (table === 'filter_levels') return [{ id: levelId, name: 'Primaria' }];
    if (table === 'filter_staff_profiles') return { is_general: false };
    if (table === 'filter_alert_settings') return { require_verified_guardian_contact: false };
    return [];
  };
  const from = (table: string) => {
    let action: 'read' | 'insert' = 'read';
    let rows: any[] = [];
    const query: any = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'range', 'gte', 'ilike']) query[method] = () => query;
    query.insert = (value: any) => {
      action = 'insert';
      rows = Array.isArray(value) ? value : [value];
      inserted.push({ table, rows });
      return query;
    };
    query.upsert = async () => ({ data: null, error: null });
    query.maybeSingle = async () => ({ data: Array.isArray(dataFor(table)) ? null : dataFor(table), error: null });
    query.single = async () => ({ data: dataFor(table), error: null });
    query.then = (resolve: (value: any) => unknown, reject: (error: unknown) => unknown) => Promise.resolve({
      data: action === 'insert'
        ? rows.map((row) => ({ id: '66666666-6666-4666-8666-666666666666', student_id: row.student_id }))
        : dataFor(table),
      error: null,
    }).then(resolve, reject);
    return query;
  };
  const storage = {
    upload: async (path: string, file: File) => { uploads.push({ path, file }); return { error: null }; },
    remove: async (paths: string[]) => { removed.push(paths); return { error: null }; },
  };
  mocks.requireTenantSession.mockResolvedValue({
    tenantId,
    user: { id: '77777777-7777-4777-8777-777777777777' },
    profile: { nombre: 'Encargado', apellidos: 'de prueba', rol: 'encargado_filtro' },
    admin: { from, storage: { from: () => storage } },
  });
  return { inserted, uploads, removed };
}

function image(name = 'foto.jpg') { return new File(['imagen'], name, { type: 'image/jpeg' }); }
function signature() { return new File(['firma'], 'firma.png', { type: 'image/png' }); }

function earlyForm() {
  const form = new FormData();
  form.set('clientRequestId', requestId);
  form.set('studentId', studentId);
  form.set('studentIds', JSON.stringify([studentId]));
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
  form.set('studentId', studentId);
  form.set('studentIds', JSON.stringify([studentId]));
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
  form.set('authorizationEvidence', image('autorizacion.jpg'));
  form.set('finalHandoverPhoto', image('entrega.jpg'));
  form.set('pickupSignature', signature());
  return form;
}

beforeEach(() => { mocks.requireTenantSession.mockReset(); mocks.revalidatePath.mockReset(); });

describe('Evidencia de identificación opcional en Control de Filtro', () => {
  it('guarda salida anticipada sin credencial, pero con fotografía de la persona', async () => {
    const db = mockFilterDatabase();
    const result = await createEarlyDeparture(earlyForm());
    expect(result.success).toBe(true);
    const row = db.inserted.find((item) => item.table === 'filter_early_departures')?.rows[0];
    expect(row.identification_evidence_path).toBeNull();
    expect(row.pickup_person_photo_path).toContain('/persona.jpg');
    expect(db.uploads).toHaveLength(3);
    expect(db.uploads.map((item) => item.file.name)).not.toContain('identificacion.jpg');
  });

  it('rechaza la salida anticipada si falta la fotografía de la persona', async () => {
    const db = mockFilterDatabase();
    const form = earlyForm();
    form.delete('pickupPersonPhoto');
    const result = await createEarlyDeparture(form);
    expect(result.success).toBe(false);
    expect(result.error).toContain('La foto de la persona que retira');
    expect(db.uploads).toHaveLength(0);
  });

  it('guarda entrega extraordinaria sin inventar tipo, frente ni reverso de identificación', async () => {
    const db = mockFilterDatabase();
    const form = extraordinaryForm();
    form.set('identificationType', 'ine'); // Un borrador puede conservar esta elección tras retirar el archivo.
    const result = await createExtraordinaryHandoff(form);
    expect(result.success).toBe(true);
    const row = db.inserted.find((item) => item.table === 'filter_extraordinary_handoffs')?.rows[0];
    expect(row.identification_type).toBeNull();
    expect(row.identification_type_other).toBeNull();
    expect(row.identification_front_path).toBeNull();
    expect(row.identification_back_path).toBeNull();
    expect(row.identity_status).toBe('no_verificable');
    expect(row.pickup_person_photo_path).toContain('/persona.jpg');
    expect(db.uploads).toHaveLength(4);
  });

  it('mantiene la captura del documento cuando se adjunta el frente con tipo válido', async () => {
    const db = mockFilterDatabase();
    const form = extraordinaryForm();
    form.set('identificationType', 'ine');
    form.set('identificationFront', image('identificacion.jpg'));
    const result = await createExtraordinaryHandoff(form);
    expect(result.success).toBe(true);
    const row = db.inserted.find((item) => item.table === 'filter_extraordinary_handoffs')?.rows[0];
    expect(row.identification_type).toBe('ine');
    expect(row.identification_front_path).toContain('/identificacion-frente.jpg');
    expect(row.identity_status).toBe('coincide');
    expect(db.uploads).toHaveLength(5);
  });

  it('rechaza la entrega extraordinaria si falta la fotografía de la persona', async () => {
    const db = mockFilterDatabase();
    const form = extraordinaryForm();
    form.delete('pickupPersonPhoto');
    const result = await createExtraordinaryHandoff(form);
    expect(result.success).toBe(false);
    expect(result.error).toContain('La fotografía de la persona');
    expect(db.uploads).toHaveLength(0);
  });

  it('no acepta foto del reverso sin frente', async () => {
    const db = mockFilterDatabase();
    const form = extraordinaryForm();
    form.set('identificationBack', image('reverso.jpg'));
    const result = await createExtraordinaryHandoff(form);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Adjunta primero el frente');
    expect(db.uploads).toHaveLength(0);
  });
});
