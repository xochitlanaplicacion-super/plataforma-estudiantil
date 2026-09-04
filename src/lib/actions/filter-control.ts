'use server';

import { revalidatePath } from 'next/cache';
import { createHash, randomBytes } from 'node:crypto';
import { requireTenantSession } from '@/lib/tenant/context';
import { FILTER_REASONS, normalizeFilterName } from '@/lib/filter-control';

const FILTER_ROLES = ['superuser', 'admin', 'encargado_filtro'] as const;
const EARLY_RELATIONSHIPS = ['madre', 'padre', 'tutor', 'abuelo', 'hermano', 'familiar_autorizado', 'otro'] as const;
const EARLY_NOTIFICATION_METHODS = ['whatsapp', 'llamada', 'sms', 'presencial', 'otro'] as const;
const EARLY_REASONS = ['cita_medica', 'malestar', 'asunto_familiar', 'salida_autorizada', 'cambio_transporte', 'otro'] as const;
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EVIDENCE_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'];
const EXTRAORDINARY_CONTEXTS = ['horario_escolar', 'fin_jornada', 'emergencia', 'otro'] as const;
const EXTRAORDINARY_RELATIONSHIPS = ['familiar', 'persona_confianza', 'transportista', 'personal_medico', 'autoridad', 'otro'] as const;
const EXTRAORDINARY_ID_TYPES = ['ine', 'pasaporte', 'licencia', 'cedula', 'institucional', 'otro'] as const;
const EXTRAORDINARY_AUTH_METHODS = ['llamada', 'videollamada', 'whatsapp', 'correo', 'documento', 'presencial'] as const;
const EXTRAORDINARY_STATUSES = ['entregado', 'rechazado', 'cancelado'] as const;

function isMissingSchemaColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error && ['42703', 'PGRST204'].includes(String(error.code)));
}

function isMissingSchemaRoutine(error: { code?: string; message?: string } | null) {
  return Boolean(error && ['42883', 'PGRST202'].includes(String(error.code)));
}

async function requireFilterAccess() {
  const context = await requireTenantSession([...FILTER_ROLES]);
  const { data: feature } = await context.admin.from('tenant_features').select('primary_filter_enabled,timezone')
    .eq('tenant_id', context.tenantId).maybeSingle();
  if (!feature?.primary_filter_enabled) throw new Error('El servicio Control de Filtro no está activo para esta institución.');
  return { ...context, filterTimezone: feature.timezone || 'America/Mexico_City' };
}

function filterClock(timezone: string) {
  const now = new Date();
  return { success: true as const, iso: now.toISOString(), timezone, display: new Intl.DateTimeFormat('es-MX', { timeZone: timezone, dateStyle: 'full', timeStyle: 'medium' }).format(now) };
}

async function requireFilterManager() {
  const context = await requireTenantSession(['superuser', 'admin']);
  const { data: feature } = await context.admin.from('tenant_features').select('primary_filter_enabled')
    .eq('tenant_id', context.tenantId).maybeSingle();
  if (!feature?.primary_filter_enabled) throw new Error('El servicio Control de Filtro no está activo para esta institución.');
  return context;
}

async function audit(context: Awaited<ReturnType<typeof requireTenantSession>>, action: string, entityType: string, entityId?: string, details: Record<string, unknown> = {}) {
  const { error } = await context.admin.from('filter_audit_log').insert({
    tenant_id: context.tenantId, actor_user_id: context.user.id,
    actor_name: `${context.profile.nombre} ${context.profile.apellidos}`.trim(),
    action, entity_type: entityType, entity_id: entityId || null, details,
  });
  if (error) throw new Error(`No se pudo registrar la auditoría: ${error.message}`);
}

async function getAllActiveFilterStudents(context: Awaited<ReturnType<typeof requireTenantSession>>) {
  const rows: any[] = []; const pageSize = 1000;
  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await context.admin.from('filter_students').select('*').eq('tenant_id', context.tenantId).eq('active', true).order('full_name').range(from, from + pageSize - 1);
    if (error) throw error; rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function getFilterFeatureStatus() {
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    const { data } = await context.admin.from('tenant_features').select('primary_filter_enabled')
      .eq('tenant_id', context.tenantId).maybeSingle();
    return { success: true, enabled: Boolean(data?.primary_filter_enabled) };
  } catch (error) { return { success: false, enabled: false, error: error instanceof Error ? error.message : 'No autorizado' }; }
}

export async function getFilterDashboardData() {
  const context = await requireFilterAccess();
  const [{ data: levels }, { data: groups }, students, { data: settings }, { data: staff }, { data: recent }, { data: contacts }] = await Promise.all([
    context.admin.from('filter_levels').select('*').eq('tenant_id', context.tenantId).order('sort_order').order('name'),
    context.admin.from('filter_groups').select('*').eq('tenant_id', context.tenantId).order('sort_order').order('grade_name').order('group_name'),
    getAllActiveFilterStudents(context),
    context.admin.from('filter_alert_settings').select('*').eq('tenant_id', context.tenantId).maybeSingle(),
    context.admin.from('filter_staff_profiles').select('is_general').eq('tenant_id', context.tenantId).eq('user_id', context.user.id).maybeSingle(),
    context.admin.from('filter_late_entries').select('*, filter_students(full_name), profiles:registered_by_user_id(nombre,apellidos)').eq('tenant_id', context.tenantId).order('arrived_at', { ascending: false }).limit(100),
    context.admin.from('filter_guardian_contacts').select('id,student_id,full_name,relationship,phone,email,verification_status,active').eq('tenant_id', context.tenantId).eq('active', true).order('full_name'),
  ]);
  return { levels: levels || [], groups: groups || [], students, settings, contacts: contacts || [], tenantId: context.tenantId, actorUserId: context.user.id, clock: filterClock(context.filterTimezone), canManageGuardians: ['superuser','admin'].includes(String(context.profile.rol)), isGeneral: Boolean(staff?.is_general), actorName: `${context.profile.nombre} ${context.profile.apellidos}`.trim(), recent: recent || [] };
}

export async function getEarlyDepartureDashboardData() {
  const context = await requireFilterAccess();
  const [{ data: levels }, { data: groups }, students, { data: staff }, { data: recent }] = await Promise.all([
    context.admin.from('filter_levels').select('*').eq('tenant_id', context.tenantId).order('sort_order').order('name'),
    context.admin.from('filter_groups').select('*').eq('tenant_id', context.tenantId).order('sort_order').order('grade_name').order('group_name'),
    getAllActiveFilterStudents(context),
    context.admin.from('filter_staff_profiles').select('is_general').eq('tenant_id', context.tenantId).eq('user_id', context.user.id).maybeSingle(),
    context.admin.from('filter_early_departures').select('*').eq('tenant_id', context.tenantId).order('departed_at', { ascending: false }).limit(100),
  ]);
  return {
    levels: levels || [], groups: groups || [], students,
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    clock: filterClock(context.filterTimezone),
    isGeneral: Boolean(staff?.is_general),
    actorName: `${context.profile.nombre} ${context.profile.apellidos}`.trim(),
    recent: recent || [],
  };
}

export async function getExtraordinaryDashboardData() {
  const context = await requireFilterAccess();
  const [{ data: levels }, { data: groups }, students, { data: contacts }, { data: staff }, { data: recent }, { data: earlyDepartures }, settingsResult] = await Promise.all([
    context.admin.from('filter_levels').select('*').eq('tenant_id', context.tenantId).order('sort_order').order('name'),
    context.admin.from('filter_groups').select('*').eq('tenant_id', context.tenantId).order('sort_order').order('grade_name').order('group_name'),
    getAllActiveFilterStudents(context),
    context.admin.from('filter_guardian_contacts').select('id,student_id,full_name,relationship,phone,email,verification_status')
      .eq('tenant_id', context.tenantId).eq('active', true).eq('verification_status', 'verified').order('full_name'),
    context.admin.from('filter_staff_profiles').select('is_general').eq('tenant_id', context.tenantId).eq('user_id', context.user.id).maybeSingle(),
    context.admin.from('filter_extraordinary_handoffs').select('*').eq('tenant_id', context.tenantId).order('registered_at', { ascending: false }).limit(100),
    context.admin.from('filter_early_departures').select('id,student_id,student_name,departed_at').eq('tenant_id', context.tenantId).order('departed_at', { ascending: false }).limit(500),
    context.admin.from('filter_alert_settings').select('require_verified_guardian_contact').eq('tenant_id', context.tenantId).maybeSingle(),
  ]);
  const guardianPolicyError = settingsResult.error && !isMissingSchemaColumn(settingsResult.error)
    ? 'No fue posible consultar la política institucional. Reintenta antes de iniciar una entrega.'
    : null;
  return {
    tenantId: context.tenantId, actorUserId: context.user.id, clock: filterClock(context.filterTimezone),
    levels: levels || [], groups: groups || [], students, contacts: contacts || [], recent: recent || [], earlyDepartures: earlyDepartures || [],
    isGeneral: Boolean(staff?.is_general), actorName: `${context.profile.nombre} ${context.profile.apellidos}`.trim(),
    canManageGuardians: ['superuser', 'admin'].includes(String(context.profile.rol)),
    requireVerifiedGuardianContact: settingsResult.data?.require_verified_guardian_contact !== false,
    guardianPolicyError,
  };
}

export async function createFamilyRegistrationInvite(studentId: string) {
  try {
    const context = await requireFilterManager();
    const { data: student } = await context.admin.from('filter_students').select('id').eq('id', studentId).eq('tenant_id', context.tenantId).eq('active', true).single();
    if (!student) throw new Error('El alumno no pertenece al padrón activo de esta institución.');
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await context.admin.from('filter_family_invites').update({ active: false, revoked_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).eq('student_id', student.id).eq('active', true);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await context.admin.from('filter_family_invites').insert({ tenant_id: context.tenantId, student_id: student.id, token_hash: tokenHash, expires_at: expiresAt, created_by: context.user.id }).select('id').single();
    if (error) throw error;
    await audit(context, 'family_invite.created', 'family_invite', data.id, { studentId: student.id, expiresAt });
    return { success: true, path: `/registro-familia/${token}`, expiresAt };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo crear el enlace.' }; }
}

export async function getFilterFamiliesData() {
  const context = await requireFilterAccess();
  const [students, { data: groups }, { data: levels }, { data: registrations }, { data: contacts }, { data: people }] = await Promise.all([
    getAllActiveFilterStudents(context),
    context.admin.from('filter_groups').select('*').eq('tenant_id', context.tenantId),
    context.admin.from('filter_levels').select('*').eq('tenant_id', context.tenantId),
    context.admin.from('filter_family_registrations').select('*').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(1000),
    context.admin.from('filter_guardian_contacts').select('*').eq('tenant_id', context.tenantId).eq('active', true),
    context.admin.from('filter_registration_pickup_people').select('*').eq('tenant_id', context.tenantId).eq('active', true),
  ]);
  const paths = [...new Set([...(registrations || []).flatMap((row: any) => [row.face_photo_path,row.identification_front_path,row.identification_back_path,row.signature_path]), ...(people || []).flatMap((row: any) => [row.face_photo_path,row.identification_path])].filter(Boolean))];
  const signed = paths.length ? await context.admin.storage.from('filtro-evidencias').createSignedUrls(paths, 600) : { data: [], error: null };
  if (signed.error) throw signed.error;
  return { students, groups: groups || [], levels: levels || [], registrations: registrations || [], contacts: contacts || [], people: people || [], canManage: true, canIssueInvites: ['superuser','admin'].includes(String(context.profile.rol)), urls: Object.fromEntries((signed.data || []).map((item: any) => [item.path, item.signedUrl])) };
}

export async function reviewFamilyRegistration(input: { registrationId: string; status: 'approved' | 'rejected' | 'duplicate'; notes?: string; studentId?: string }) {
  try {
    const context = await requireFilterAccess();
    const { data: registration } = await context.admin.from('filter_family_registrations').select('id,student_id').eq('id', input.registrationId).eq('tenant_id', context.tenantId).single();
    if (!registration) throw new Error('Solicitud no encontrada.');
    let studentId = registration.student_id;
    if (input.studentId) {
      const { data: student } = await context.admin.from('filter_students').select('id').eq('id', input.studentId).eq('tenant_id', context.tenantId).eq('active', true).single();
      if (!student) throw new Error('El alumno destino no pertenece a este tenant.');
      studentId = student.id;
    }
    const { error } = await (context.admin as any).rpc('review_filter_family_registration', {
      target_tenant_id: context.tenantId, target_registration_id: registration.id, target_student_id: studentId,
      target_status: input.status, target_notes: input.notes?.trim().slice(0, 2000) || '', actor_id: context.user.id,
      actor_name: `${context.profile.nombre} ${context.profile.apellidos}`.trim(),
    });
    if (error) throw error;
    revalidatePath('/dashboard/filtro/familias');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo revisar la solicitud.' }; }
}

export async function getFilterReportsData() {
  const context = await requireFilterAccess();
  const [{ data: early }, { data: extraordinary }, { data: institution }] = await Promise.all([
    context.admin.from('filter_early_departures').select('*').eq('tenant_id', context.tenantId).order('registered_at', { ascending: false }).limit(1000),
    context.admin.from('filter_extraordinary_handoffs').select('*').eq('tenant_id', context.tenantId).order('registered_at', { ascending: false }).limit(1000),
    context.admin.from('configuracion_sistema').select('nombre_completo,nombre_corto,logo_url,color_primario,direccion,telefono_contacto,correo_contacto')
      .eq('tenant_id', context.tenantId).maybeSingle(),
  ]);
  return { tenantId: context.tenantId, early: early || [], extraordinary: extraordinary || [], institution: institution || {}, actorName: `${context.profile.nombre} ${context.profile.apellidos}`.trim() };
}

export async function upsertFilterStructure(input: { levelName: string; gradeName: string; groupName: string }) {
  try {
    const context = await requireFilterAccess();
    const levelName = input.levelName.trim(); const gradeName = input.gradeName.trim(); const groupName = input.groupName.trim() || 'A';
    if (!levelName || !gradeName) throw new Error('Nivel y grado son obligatorios.');
    const { data: level, error: levelError } = await context.admin.from('filter_levels').upsert({ tenant_id: context.tenantId, name: levelName, created_by: context.user.id }, { onConflict: 'tenant_id,name' }).select('id').single();
    if (levelError) throw levelError;
    const { data: group, error } = await context.admin.from('filter_groups').upsert({ tenant_id: context.tenantId, level_id: level.id, grade_name: gradeName, group_name: groupName, created_by: context.user.id }, { onConflict: 'tenant_id,level_id,grade_name,group_name' }).select('*').single();
    if (error) throw error;
    await audit(context, 'group.upserted', 'group', group.id, { levelName, gradeName, groupName });
    revalidatePath('/dashboard/filtro'); return { success: true, group };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar el grupo.' }; }
}

export async function addFilterStudents(input: { groupId: string; names: string[] }) {
  try {
    const context = await requireFilterAccess();
    const { data: group } = await context.admin.from('filter_groups').select('id').eq('tenant_id', context.tenantId).eq('id', input.groupId).single();
    if (!group) throw new Error('Grupo no encontrado en esta institución.');
    const unique = [...new Set(input.names.map((name) => name.trim()).filter((name) => name.length >= 2))];
    if (!unique.length || unique.length > 1000) throw new Error('Incluye entre 1 y 1000 alumnos por carga.');
    const { data, error } = await context.admin.from('filter_students').upsert(unique.map((fullName) => ({ tenant_id: context.tenantId, group_id: group.id, full_name: fullName, normalized_name: normalizeFilterName(fullName), active: true, created_by: context.user.id, updated_by: context.user.id, updated_at: new Date().toISOString() })), { onConflict: 'tenant_id,group_id,normalized_name' }).select('id');
    if (error) throw error;
    await audit(context, 'students.imported', 'student', undefined, { groupId: group.id, count: data?.length || 0 });
    revalidatePath('/dashboard/filtro/alumnos'); return { success: true, count: data?.length || 0 };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudieron cargar alumnos.' }; }
}

export async function addFilterGuardianContact(input: { studentId: string; fullName: string; relationship: string; phone?: string; email?: string }) {
  try {
    const context = await requireFilterManager();
    const fullName = input.fullName.trim(); const phone = input.phone?.trim() || null; const email = input.email?.trim().toLowerCase() || null;
    if (fullName.length < 2) throw new Error('El nombre del contacto es obligatorio.');
    if (!['madre', 'padre', 'tutor'].includes(input.relationship)) throw new Error('El parentesco no es válido.');
    if (!phone && !email) throw new Error('Registra al menos un teléfono o correo oficial.');
    const { data: student } = await context.admin.from('filter_students').select('id').eq('tenant_id', context.tenantId).eq('id', input.studentId).eq('active', true).single();
    if (!student) throw new Error('Alumno no encontrado en esta institución.');
    const now = new Date().toISOString();
    const { data, error } = await context.admin.from('filter_guardian_contacts').insert({
      tenant_id: context.tenantId, student_id: student.id, full_name: fullName, relationship: input.relationship,
      phone, email, source: 'staff', verification_status: 'verified', verified_at: now, verified_by: context.user.id,
      created_by: context.user.id, updated_by: context.user.id, updated_at: now,
    }).select('id').single();
    if (error) throw error;
    await audit(context, 'guardian_contact.created', 'guardian_contact', data.id, { studentId: student.id, relationship: input.relationship, hasPhone: Boolean(phone), hasEmail: Boolean(email) });
    revalidatePath('/dashboard/filtro/alumnos'); revalidatePath('/dashboard/filtro/entregas-extraordinarias');
    return { success: true, id: data.id };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar el contacto oficial.' }; }
}

export async function deleteFilterStudents(ids: string[]) {
  try {
    const context = await requireFilterAccess();
    const safeIds = [...new Set(ids)].slice(0, 1000); if (!safeIds.length) throw new Error('Selecciona alumnos.');
    const { data, error } = await context.admin.from('filter_students').update({ active: false, updated_by: context.user.id, updated_at: new Date().toISOString() }).eq('tenant_id', context.tenantId).in('id', safeIds).select('id');
    if (error) throw error;
    await audit(context, 'students.deleted', 'student', undefined, { ids: (data || []).map((row) => row.id), count: data?.length || 0 });
    revalidatePath('/dashboard/filtro/alumnos'); return { success: true, count: data?.length || 0 };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudieron eliminar.' }; }
}

export async function getFilterCurrentTime() {
  try {
    const context = await requireFilterAccess();
    const { data } = await context.admin.from('tenant_features').select('timezone').eq('tenant_id', context.tenantId).single();
    const timezone = data?.timezone || 'America/Mexico_City';
    const now = new Date();
    return { success: true, iso: now.toISOString(), timezone, display: new Intl.DateTimeFormat('es-MX', { timeZone: timezone, dateStyle: 'full', timeStyle: 'medium' }).format(now) };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo obtener la hora.' }; }
}

export async function searchFilterStudents(query: string) {
  try {
    const context = await requireFilterAccess(); const normalized = normalizeFilterName(query);
    if (!normalized) return { success: true, data: [] };
    const { data, error } = await context.admin.rpc('search_filter_students', { target_tenant_id: context.tenantId, search_text: normalized, max_results: 12 });
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error) { return { success: false, data: [], error: error instanceof Error ? error.message : 'Error de búsqueda' }; }
}

export async function searchFilterReporters(query: string) {
  try {
    const context = await requireFilterAccess(); const normalized = normalizeFilterName(query);
    const { data } = await context.admin.from('filter_reporters').select('id,name').eq('tenant_id', context.tenantId).ilike('normalized_name', `%${normalized}%`).order('last_used_at', { ascending: false }).limit(10);
    return { success: true, data: data || [] };
  } catch { return { success: false, data: [] }; }
}

function windowStart(settings: any, now: Date) {
  if (!settings?.enabled || settings.window_unit === 'global') return null;
  const date = new Date(now); const amount = Number(settings.window_value || 1);
  if (settings.window_unit === 'days') date.setDate(date.getDate() - amount);
  if (settings.window_unit === 'months') date.setMonth(date.getMonth() - amount);
  if (settings.window_unit === 'years') date.setFullYear(date.getFullYear() - amount);
  return date.toISOString();
}

function tenantLocalDateTimeToIso(value: string, timezone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error('La fecha y hora manual no son válidas.');
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0));
  let guess = desired;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    guess += desired - represented;
  }
  return new Date(guess).toISOString();
}

export async function getStudentLateAlert(studentId: string) {
  try {
    const context = await requireFilterAccess();
    const { data: settings } = await context.admin.from('filter_alert_settings').select('*').eq('tenant_id', context.tenantId).single();
    let query = context.admin.from('filter_late_entries').select('*', { count: 'exact', head: true }).eq('tenant_id', context.tenantId).eq('student_id', studentId);
    const start = windowStart(settings, new Date()); if (start) query = query.gte('arrived_at', start);
    const { count, error } = await query; if (error) throw error;
    return { success: true, count: count || 0, alert: Boolean(settings?.enabled && (count || 0) >= Number(settings.threshold)), settings };
  } catch (error) { return { success: false, count: 0, alert: false, error: error instanceof Error ? error.message : 'No se pudo consultar.' }; }
}

export async function createLateEntry(formData: FormData) {
  try {
    const context = await requireFilterAccess();
    const clientRequestId = String(formData.get('clientRequestId') || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) throw new Error('El identificador local no es válido. Recarga la pantalla.');
    const { data: previousAudit } = await context.admin.from('filter_audit_log').select('entity_id').eq('tenant_id', context.tenantId).eq('action', 'late_entry.created').contains('details', { clientRequestId }).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (previousAudit?.entity_id) return { success: true, duplicate: true, id: previousAudit.entity_id };
    const previousRequest = await context.admin.from('filter_late_entries').select('id').eq('tenant_id', context.tenantId).eq('client_request_id', clientRequestId).maybeSingle();
    const supportsRequestId = !previousRequest.error;
    if (previousRequest.data) {
      await audit(context, 'late_entry.created', 'late_entry', previousRequest.data.id, { clientRequestId, recoveredFromIdempotentRetry: true });
      return { success: true, duplicate: true, id: previousRequest.data.id };
    }
    const studentId = String(formData.get('studentId') || '');
    const automaticTime = String(formData.get('automaticTime') || 'true') === 'true';
    const { data: feature } = await context.admin.from('tenant_features').select('timezone').eq('tenant_id', context.tenantId).single();
    const arrivedAt = automaticTime ? new Date().toISOString() : tenantLocalDateTimeToIso(String(formData.get('arrivedAt') || ''), feature?.timezone || 'America/Mexico_City');
    const reasonCode = String(formData.get('reasonCode') || 'otro'); const reasonDetail = String(formData.get('reasonDetail') || '').trim();
    const reporterInput = String(formData.get('reporterName') || '').trim();
    if (!FILTER_REASONS.some((reason) => reason.value === reasonCode)) throw new Error('El motivo seleccionado no es válido.');
    if (reasonCode === 'otro' && reasonDetail.length < 2) throw new Error('Especifica el motivo del retardo.');
    const { data: staff } = await context.admin.from('filter_staff_profiles').select('is_general').eq('tenant_id', context.tenantId).eq('user_id', context.user.id).maybeSingle();
    const actorName = `${context.profile.nombre} ${context.profile.apellidos}`.trim();
    const reporterName = staff?.is_general ? reporterInput : actorName;
    if (!studentId || !arrivedAt || reporterName.length < 2) throw new Error('Alumno, hora y nombre de quien registra son obligatorios.');
    const { data: student } = await context.admin.from('filter_students').select('id').eq('tenant_id', context.tenantId).eq('id', studentId).single();
    if (!student) throw new Error('Alumno no encontrado.');
    let evidencePath: string | null = null; const file = formData.get('evidence');
    if (file instanceof File && file.size > 0) {
      const limit = 1_500_000;
      if (file.size > limit || !['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) throw new Error('La evidencia no tiene un formato o tamaño compatible. Vuelve a seleccionarla.');
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'; evidencePath = `${context.tenantId}/retardos/${clientRequestId}/evidencia.${ext}`;
      const { error } = await context.admin.storage.from('filtro-evidencias').upload(evidencePath, file, { upsert: true, contentType: file.type }); if (error) throw new Error(`No se pudo guardar la evidencia: ${error.message}`);
    }
    const baseEntry = { tenant_id: context.tenantId, student_id: studentId, arrived_at: arrivedAt, reason_code: reasonCode, reason_detail: reasonDetail || null, evidence_path: evidencePath, registered_by_user_id: context.user.id, reporter_name: reporterName };
    let insertResult = await context.admin.from('filter_late_entries').insert(supportsRequestId ? { ...baseEntry, client_request_id: clientRequestId } : baseEntry).select('id').single();
    if (insertResult.error && ['42703', 'PGRST204'].includes(insertResult.error.code || '')) insertResult = await context.admin.from('filter_late_entries').insert(baseEntry).select('id').single();
    const { data: entry, error } = insertResult;
    if (error) {
      if (error.code === '23505') {
        const { data: duplicate } = await context.admin.from('filter_late_entries').select('id').eq('tenant_id', context.tenantId).eq('client_request_id', clientRequestId).single();
        if (duplicate) {
          const { data: duplicateAudit } = await context.admin.from('filter_audit_log').select('id').eq('tenant_id', context.tenantId).eq('action', 'late_entry.created').eq('entity_id', duplicate.id).maybeSingle();
          if (!duplicateAudit) await audit(context, 'late_entry.created', 'late_entry', duplicate.id, { clientRequestId, recoveredFromIdempotentRetry: true });
          return { success: true, duplicate: true, id: duplicate.id };
        }
      }
      if (evidencePath) await context.admin.storage.from('filtro-evidencias').remove([evidencePath]);
      throw error;
    }
    await context.admin.from('filter_reporters').upsert({ tenant_id: context.tenantId, name: reporterName, normalized_name: normalizeFilterName(reporterName), last_used_at: new Date().toISOString(), created_by: context.user.id }, { onConflict: 'tenant_id,normalized_name' });
    await audit(context, 'late_entry.created', 'late_entry', entry.id, { clientRequestId, studentId, reporterName, reasonCode, hasEvidence: Boolean(evidencePath) });
    revalidatePath('/dashboard/filtro/retardos'); return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar el retardo.' }; }
}

function requiredFormText(formData: FormData, key: string, label: string, maxLength = 500) {
  const value = String(formData.get(key) || '').trim();
  if (value.length < 2) throw new Error(`${label} es obligatorio.`);
  if (value.length > maxLength) throw new Error(`${label} es demasiado largo.`);
  return value;
}

function validatedUpload(formData: FormData, key: string, label: string, allowedTypes: string[]) {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size < 1) throw new Error(`${label} es obligatoria.`);
  const limit = 1_500_000;
  if (value.size > limit) throw new Error(`${label} supera el tamaño optimizado permitido. Vuelve a seleccionarla.`);
  if (!allowedTypes.includes(value.type)) throw new Error(`${label} tiene un formato no permitido.`);
  return value;
}

function extensionForFile(file: File) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' } as Record<string, string>)[file.type];
}

export async function createEarlyDeparture(formData: FormData) {
  try {
    const context = await requireFilterAccess();
    const clientRequestId = String(formData.get('clientRequestId') || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
      throw new Error('El identificador del borrador no es válido. Reinicia el proceso.');
    }
    const { data: previous } = await context.admin.from('filter_early_departures').select('id')
      .eq('tenant_id', context.tenantId).eq('client_request_id', clientRequestId).maybeSingle();
    if (previous) {
      const { data: previousAudit } = await context.admin.from('filter_audit_log').select('id')
        .eq('tenant_id', context.tenantId).eq('action', 'early_departure.created').eq('entity_id', previous.id).maybeSingle();
      if (!previousAudit) await audit(context, 'early_departure.created', 'early_departure', previous.id, { recoveredFromIdempotentRetry: true });
      return { success: true, duplicate: true, id: previous.id };
    }

    const studentId = String(formData.get('studentId') || '');
    const { data: student, error: studentError } = await context.admin.from('filter_students')
      .select('id,full_name,group_id').eq('tenant_id', context.tenantId).eq('id', studentId).eq('active', true).single();
    if (studentError || !student) throw new Error('El alumno no existe o ya no está activo en esta institución.');
    const { data: group, error: groupError } = await context.admin.from('filter_groups')
      .select('id,level_id,grade_name,group_name').eq('tenant_id', context.tenantId).eq('id', student.group_id).single();
    if (groupError || !group) throw new Error('No se encontró el grado y grupo actual del alumno.');
    const { data: level, error: levelError } = await context.admin.from('filter_levels')
      .select('name').eq('tenant_id', context.tenantId).eq('id', group.level_id).single();
    if (levelError || !level) throw new Error('No se encontró el nivel actual del alumno.');

    const relationship = String(formData.get('relationship') || '') as typeof EARLY_RELATIONSHIPS[number];
    const notificationMethod = String(formData.get('notificationMethod') || '') as typeof EARLY_NOTIFICATION_METHODS[number];
    const departureReason = String(formData.get('departureReason') || '') as typeof EARLY_REASONS[number];
    const notifiedParty = String(formData.get('notifiedParty') || '');
    if (!EARLY_RELATIONSHIPS.includes(relationship)) throw new Error('El parentesco no es válido.');
    if (!EARLY_NOTIFICATION_METHODS.includes(notificationMethod)) throw new Error('El medio de notificación no es válido.');
    if (!EARLY_REASONS.includes(departureReason)) throw new Error('El motivo de salida no es válido.');
    if (!['madre', 'padre', 'tutor'].includes(notifiedParty)) throw new Error('Selecciona a quién se notificó.');
    const relationshipOther = relationship === 'otro' ? requiredFormText(formData, 'relationshipOther', 'El parentesco', 120) : null;
    const notificationMethodOther = notificationMethod === 'otro' ? requiredFormText(formData, 'notificationMethodOther', 'El medio de notificación', 120) : null;
    const departureReasonOther = departureReason === 'otro' ? requiredFormText(formData, 'departureReasonOther', 'El motivo de salida', 220) : null;
    if (String(formData.get('confirmed')) !== 'true') throw new Error('Debes confirmar la verificación de identidad y la notificación.');

    const { data: feature } = await context.admin.from('tenant_features').select('timezone').eq('tenant_id', context.tenantId).single();
    const automaticTime = String(formData.get('automaticTime') || 'true') === 'true';
    const departedAt = automaticTime ? new Date().toISOString() : tenantLocalDateTimeToIso(String(formData.get('departedAt') || ''), feature?.timezone || 'America/Mexico_City');
    const { data: staff } = await context.admin.from('filter_staff_profiles').select('is_general')
      .eq('tenant_id', context.tenantId).eq('user_id', context.user.id).maybeSingle();
    const actorName = `${context.profile.nombre} ${context.profile.apellidos}`.trim();
    const reporterName = staff?.is_general ? requiredFormText(formData, 'reporterName', 'El nombre de quien registra', 180) : actorName;

    const identificationFile = validatedUpload(formData, 'identificationEvidence', 'La identificación presentada', EVIDENCE_MIME_TYPES);
    const pickupPhoto = validatedUpload(formData, 'pickupPersonPhoto', 'La foto de la persona que retira', IMAGE_MIME_TYPES);
    const handoverPhoto = validatedUpload(formData, 'finalHandoverPhoto', 'La foto final del adulto y el alumno', IMAGE_MIME_TYPES);
    const pickupSignature = validatedUpload(formData, 'pickupSignature', 'La firma de la persona que retira', ['image/png']);
    const basePath = `${context.tenantId}/salidas/${clientRequestId}`;
    const uploads = [
      { file: identificationFile, path: `${basePath}/identificacion.${extensionForFile(identificationFile)}` },
      { file: pickupPhoto, path: `${basePath}/persona.${extensionForFile(pickupPhoto)}` },
      { file: handoverPhoto, path: `${basePath}/entrega.${extensionForFile(handoverPhoto)}` },
      { file: pickupSignature, path: `${basePath}/firma.png` },
    ];
    const uploadedPaths: string[] = [];
    for (const upload of uploads) {
      const { error } = await context.admin.storage.from('filtro-evidencias').upload(upload.path, upload.file, { upsert: true, contentType: upload.file.type });
      if (error) {
        if (uploadedPaths.length) await context.admin.storage.from('filtro-evidencias').remove(uploadedPaths);
        throw new Error(`No se pudo guardar ${upload.file.name}: ${error.message}`);
      }
      uploadedPaths.push(upload.path);
    }

    const { data: entry, error } = await context.admin.from('filter_early_departures').insert({
      tenant_id: context.tenantId,
      client_request_id: clientRequestId,
      student_id: student.id,
      student_name: student.full_name,
      level_name: level.name,
      grade_name: group.grade_name,
      group_name: group.group_name,
      departed_at: departedAt,
      pickup_person_name: requiredFormText(formData, 'pickupPersonName', 'El nombre de quien retira', 220),
      relationship,
      relationship_other: relationshipOther,
      identification_evidence_path: uploads[0].path,
      pickup_person_photo_path: uploads[1].path,
      notified_party: notifiedParty,
      notified_staff_name: requiredFormText(formData, 'notifiedStaffName', 'El nombre del personal notificado', 220),
      notification_method: notificationMethod,
      notification_method_other: notificationMethodOther,
      departure_reason: departureReason,
      departure_reason_other: departureReasonOther,
      description: String(formData.get('description') || '').trim().slice(0, 4000) || null,
      delivering_teacher_name: requiredFormText(formData, 'deliveringTeacherName', 'El docente que entrega', 220),
      registered_by_user_id: context.user.id,
      reporter_name: reporterName,
      final_handover_photo_path: uploads[2].path,
      pickup_signature_path: uploads[3].path,
      identity_and_notification_confirmed: true,
    }).select('id').single();
    if (error) {
      if (error.code === '23505') {
        const { data: duplicate } = await context.admin.from('filter_early_departures').select('id')
          .eq('tenant_id', context.tenantId).eq('client_request_id', clientRequestId).single();
        if (duplicate) {
          const { data: duplicateAudit } = await context.admin.from('filter_audit_log').select('id')
            .eq('tenant_id', context.tenantId).eq('action', 'early_departure.created').eq('entity_id', duplicate.id).maybeSingle();
          if (!duplicateAudit) await audit(context, 'early_departure.created', 'early_departure', duplicate.id, { recoveredFromIdempotentRetry: true });
          return { success: true, duplicate: true, id: duplicate.id };
        }
      }
      await context.admin.storage.from('filtro-evidencias').remove(uploads.map((upload) => upload.path));
      throw error;
    }
    await context.admin.from('filter_reporters').upsert({
      tenant_id: context.tenantId, name: reporterName, normalized_name: normalizeFilterName(reporterName),
      last_used_at: new Date().toISOString(), created_by: context.user.id,
    }, { onConflict: 'tenant_id,normalized_name' });
    await audit(context, 'early_departure.created', 'early_departure', entry.id, {
      studentId: student.id, reporterName, relationship, notificationMethod, departureReason,
      academicSnapshot: { level: level.name, grade: group.grade_name, group: group.group_name },
    });
    revalidatePath('/dashboard/filtro/salidas');
    return { success: true, duplicate: false, id: entry.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar la salida anticipada.' };
  }
}

function maskedContact(contact: { phone?: string | null; email?: string | null }) {
  if (contact.phone) {
    const digits = contact.phone.replace(/\D/g, '');
    return `Teléfono terminado en ${digits.slice(-4).padStart(4, '•')}`;
  }
  const [user, domain] = String(contact.email || '').split('@');
  return `${user?.slice(0, 2) || ''}•••@${domain || 'correo registrado'}`;
}

export async function createExtraordinaryHandoff(formData: FormData) {
  try {
    const context = await requireFilterAccess();
    const clientRequestId = String(formData.get('clientRequestId') || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) throw new Error('El identificador del borrador no es válido.');
    const { data: previous } = await context.admin.from('filter_extraordinary_handoffs').select('id').eq('tenant_id', context.tenantId).eq('client_request_id', clientRequestId).maybeSingle();
    if (previous) {
      const { data: previousAudit } = await context.admin.from('filter_audit_log').select('id').eq('tenant_id', context.tenantId).eq('action', 'extraordinary_handoff.created').eq('entity_id', previous.id).maybeSingle();
      if (!previousAudit) await audit(context, 'extraordinary_handoff.created', 'extraordinary_handoff', previous.id, { clientRequestId, recoveredFromIdempotentRetry: true });
      return { success: true, duplicate: true, id: previous.id };
    }

    const studentId = String(formData.get('studentId') || '');
    const { data: student } = await context.admin.from('filter_students').select('id,full_name,group_id').eq('tenant_id', context.tenantId).eq('id', studentId).eq('active', true).single();
    if (!student) throw new Error('El alumno no existe o no está activo en esta institución.');
    const { data: group } = await context.admin.from('filter_groups').select('id,level_id,grade_name,group_name').eq('tenant_id', context.tenantId).eq('id', student.group_id).single();
    if (!group) throw new Error('No se encontró el grupo actual del alumno.');
    const { data: level } = await context.admin.from('filter_levels').select('name').eq('tenant_id', context.tenantId).eq('id', group.level_id).single();
    if (!level) throw new Error('No se encontró el nivel actual del alumno.');
    const { data: handoffPolicy, error: handoffPolicyError } = await context.admin
      .from('filter_alert_settings')
      .select('require_verified_guardian_contact')
      .eq('tenant_id', context.tenantId)
      .maybeSingle();
    if (handoffPolicyError && !isMissingSchemaColumn(handoffPolicyError)) throw new Error('No se pudo comprobar la política institucional de entregas.');
    const verifiedGuardianPolicyAvailable = !handoffPolicyError;
    const requireVerifiedGuardianContact = handoffPolicy?.require_verified_guardian_contact !== false;
    const guardianContactId = String(formData.get('guardianContactId') || '');
    let guardian: { id: string; full_name: string; relationship: string; phone: string | null; email: string | null } | null = null;
    if (guardianContactId) {
      const { data } = await context.admin.from('filter_guardian_contacts').select('id,full_name,relationship,phone,email')
        .eq('tenant_id', context.tenantId).eq('student_id', student.id).eq('id', guardianContactId).eq('active', true).eq('verification_status', 'verified').maybeSingle();
      guardian = data;
      if (!guardian) throw new Error('El contacto seleccionado no es un contacto verificado de este alumno e institución.');
    } else if (requireVerifiedGuardianContact) {
      throw new Error('Selecciona un contacto oficial verificado del alumno.');
    }

    const deliveryContext = String(formData.get('deliveryContext') || '') as typeof EXTRAORDINARY_CONTEXTS[number];
    const pickupRelationship = String(formData.get('pickupRelationship') || '') as typeof EXTRAORDINARY_RELATIONSHIPS[number];
    const identificationType = String(formData.get('identificationType') || '') as typeof EXTRAORDINARY_ID_TYPES[number];
    const authorizationMethod = String(formData.get('authorizationMethod') || '') as typeof EXTRAORDINARY_AUTH_METHODS[number];
    const status = String(formData.get('status') || '') as typeof EXTRAORDINARY_STATUSES[number];
    if (!EXTRAORDINARY_CONTEXTS.includes(deliveryContext)) throw new Error('El contexto de entrega no es válido.');
    if (!EXTRAORDINARY_RELATIONSHIPS.includes(pickupRelationship)) throw new Error('La relación de quien retira no es válida.');
    if (!EXTRAORDINARY_ID_TYPES.includes(identificationType)) throw new Error('El tipo de identificación no es válido.');
    if (!EXTRAORDINARY_AUTH_METHODS.includes(authorizationMethod)) throw new Error('El método de autorización no es válido.');
    if (!EXTRAORDINARY_STATUSES.includes(status)) throw new Error('La resolución no es válida.');

    const manualAuthorizerRelationship = String(formData.get('manualAuthorizerRelationship') || '');
    if (!guardian && !['madre', 'padre', 'tutor'].includes(manualAuthorizerRelationship)) {
      throw new Error('Selecciona el parentesco de quien autorizó manualmente.');
    }
    const authorizerName = guardian?.full_name || requiredFormText(formData, 'manualAuthorizerName', 'El nombre de quien autoriza', 220);
    const authorizerRelationship = guardian?.relationship || manualAuthorizerRelationship;
    const manualAuthorizerContact = String(formData.get('manualAuthorizerContact') || '').trim().slice(0, 180);
    if (!guardian && ['llamada', 'videollamada', 'whatsapp', 'correo'].includes(authorizationMethod) && manualAuthorizerContact.length < 5) {
      throw new Error('Registra el teléfono, correo o referencia utilizada para confirmar la autorización.');
    }
    const authorizerChannelSnapshot = guardian
      ? maskedContact(guardian)
      : (manualAuthorizerContact ? `Referencia declarada: ${manualAuthorizerContact}` : 'Sin contacto oficial verificado; autorizado por política institucional');

    const deliveryContextOther = deliveryContext === 'otro' ? requiredFormText(formData, 'deliveryContextOther', 'El contexto', 120) : null;
    const pickupRelationshipOther = pickupRelationship === 'otro' ? requiredFormText(formData, 'pickupRelationshipOther', 'La relación', 120) : null;
    const identificationTypeOther = identificationType === 'otro' ? requiredFormText(formData, 'identificationTypeOther', 'El tipo de identificación', 120) : null;
    const delivered = status === 'entregado';
    const adultConfirmed = String(formData.get('adultConfirmed')) === 'true';
    const identityMatches = String(formData.get('identityMatches')) === 'true';
    const noVisibleImpairment = String(formData.get('noVisibleImpairment')) === 'true';
    const institutionApproved = String(formData.get('institutionApproved')) === 'true';
    const protocolConfirmed = String(formData.get('protocolConfirmed')) === 'true';
    const identityStatus = String(formData.get('identityStatus') || '');
    const consentStatus = String(formData.get('consentStatus') || '');
    if (!['coincide', 'no_coincide', 'no_verificable'].includes(identityStatus)) throw new Error('Selecciona el resultado de identidad.');
    if (!['confirmado', 'rechazado', 'sin_respuesta'].includes(consentStatus)) throw new Error('Selecciona el resultado del consentimiento.');
    if (delivered && (!adultConfirmed || !identityMatches || !noVisibleImpairment || !institutionApproved || !protocolConfirmed || identityStatus !== 'coincide' || consentStatus !== 'confirmado')) {
      throw new Error('No se puede entregar: faltan validaciones obligatorias de identidad, consentimiento o aprobación.');
    }

    const { data: feature } = await context.admin.from('tenant_features').select('timezone').eq('tenant_id', context.tenantId).single();
    const timezone = feature?.timezone || 'America/Mexico_City';
    const automaticTime = String(formData.get('automaticTime') || 'true') === 'true';
    const departedAt = delivered ? (automaticTime ? new Date().toISOString() : tenantLocalDateTimeToIso(String(formData.get('departedAt') || ''), timezone)) : null;
    const authorizationAutomaticTime = String(formData.get('authorizationAutomaticTime') || 'true') === 'true';
    const authorizedAt = authorizationAutomaticTime ? new Date().toISOString() : tenantLocalDateTimeToIso(String(formData.get('authorizedAt') || ''), timezone);
    const expiresInput = String(formData.get('authorizationExpiresAt') || '');
    const authorizationExpiresAt = expiresInput ? tenantLocalDateTimeToIso(expiresInput, timezone) : null;
    if (authorizationExpiresAt && authorizationExpiresAt <= authorizedAt) throw new Error('La vigencia debe ser posterior a la autorización.');
    const linkedEarlyDepartureId = String(formData.get('linkedEarlyDepartureId') || '') || null;
    if (linkedEarlyDepartureId) {
      const { data: linked } = await context.admin.from('filter_early_departures').select('id').eq('tenant_id', context.tenantId).eq('student_id', student.id).eq('id', linkedEarlyDepartureId).single();
      if (!linked) throw new Error('La salida anticipada vinculada no corresponde al alumno.');
    }
    const { data: staff } = await context.admin.from('filter_staff_profiles').select('is_general').eq('tenant_id', context.tenantId).eq('user_id', context.user.id).maybeSingle();
    const actorName = `${context.profile.nombre} ${context.profile.apellidos}`.trim();
    const reporterName = staff?.is_general ? requiredFormText(formData, 'reporterName', 'El nombre de quien registra', 180) : actorName;

    const identificationFront = validatedUpload(formData, 'identificationFront', 'El frente de la identificación', EVIDENCE_MIME_TYPES);
    const identificationBackValue = formData.get('identificationBack');
    const identificationBack = identificationBackValue instanceof File && identificationBackValue.size > 0
      ? validatedUpload(formData, 'identificationBack', 'El reverso de la identificación', EVIDENCE_MIME_TYPES) : null;
    const personPhoto = validatedUpload(formData, 'pickupPersonPhoto', 'La fotografía de la persona', IMAGE_MIME_TYPES);
    const authorizationEvidence = validatedUpload(formData, 'authorizationEvidence', 'La evidencia de autorización', EVIDENCE_MIME_TYPES);
    const vehicleValue = formData.get('vehiclePhoto');
    const vehiclePhoto = vehicleValue instanceof File && vehicleValue.size > 0 ? validatedUpload(formData, 'vehiclePhoto', 'La fotografía del vehículo', IMAGE_MIME_TYPES) : null;
    const finalPhoto = delivered ? validatedUpload(formData, 'finalHandoverPhoto', 'La fotografía final de entrega', IMAGE_MIME_TYPES) : null;
    const signature = delivered ? validatedUpload(formData, 'pickupSignature', 'La firma de quien recibe', ['image/png']) : null;
    const basePath = `${context.tenantId}/entregas-extraordinarias/${clientRequestId}`;
    const uploads = [
      { key: 'identificationFront', file: identificationFront, path: `${basePath}/identificacion-frente.${extensionForFile(identificationFront)}` },
      ...(identificationBack ? [{ key: 'identificationBack', file: identificationBack, path: `${basePath}/identificacion-reverso.${extensionForFile(identificationBack)}` }] : []),
      { key: 'pickupPersonPhoto', file: personPhoto, path: `${basePath}/persona.${extensionForFile(personPhoto)}` },
      { key: 'authorizationEvidence', file: authorizationEvidence, path: `${basePath}/autorizacion.${extensionForFile(authorizationEvidence)}` },
      ...(vehiclePhoto ? [{ key: 'vehiclePhoto', file: vehiclePhoto, path: `${basePath}/vehiculo.${extensionForFile(vehiclePhoto)}` }] : []),
      ...(finalPhoto ? [{ key: 'finalHandoverPhoto', file: finalPhoto, path: `${basePath}/entrega.${extensionForFile(finalPhoto)}` }] : []),
      ...(signature ? [{ key: 'pickupSignature', file: signature, path: `${basePath}/firma.png` }] : []),
    ];
    const paths = new Map<string, string>();
    for (const upload of uploads) {
      const { error } = await context.admin.storage.from('filtro-evidencias').upload(upload.path, upload.file, { upsert: true, contentType: upload.file.type });
      if (error) { if (paths.size) await context.admin.storage.from('filtro-evidencias').remove([...paths.values()]); throw new Error(`No se pudo guardar ${upload.file.name}: ${error.message}`); }
      paths.set(upload.key, upload.path);
    }

    const entryPayload: Record<string, unknown> = {
      tenant_id: context.tenantId, client_request_id: clientRequestId, student_id: student.id, guardian_contact_id: guardian?.id || null,
      linked_early_departure_id: linkedEarlyDepartureId, student_name: student.full_name, level_name: level.name,
      grade_name: group.grade_name, group_name: group.group_name, departed_at: departedAt,
      delivery_context: deliveryContext, delivery_context_other: deliveryContextOther,
      delivery_reason: requiredFormText(formData, 'deliveryReason', 'El motivo de la entrega', 1000),
      pickup_person_name: requiredFormText(formData, 'pickupPersonName', 'El nombre de la persona', 220),
      pickup_person_phone: String(formData.get('pickupPersonPhone') || '').trim() || null,
      pickup_relationship: pickupRelationship, pickup_relationship_other: pickupRelationshipOther,
      adult_confirmed: adultConfirmed, identification_type: identificationType, identification_type_other: identificationTypeOther,
      identification_reference: requiredFormText(formData, 'identificationReference', 'La referencia de identificación', 12),
      identification_front_path: paths.get('identificationFront'), identification_back_path: paths.get('identificationBack') || null,
      pickup_person_photo_path: paths.get('pickupPersonPhoto'), vehicle_description: String(formData.get('vehicleDescription') || '').trim().slice(0, 500) || null,
      vehicle_photo_path: paths.get('vehiclePhoto') || null, identity_matches: identityMatches, no_visible_impairment: noVisibleImpairment,
      authorizer_name: authorizerName, authorizer_relationship: authorizerRelationship, authorizer_channel_snapshot: authorizerChannelSnapshot,
      authorization_method: authorizationMethod, authorized_at: authorizedAt, authorization_expires_at: authorizationExpiresAt,
      authorization_statement: requiredFormText(formData, 'authorizationStatement', 'La declaración de autorización', 2000),
      authorization_evidence_path: paths.get('authorizationEvidence'), authorization_verifier_name: requiredFormText(formData, 'authorizationVerifierName', 'El personal que verificó', 220),
      one_time_code: String(formData.get('oneTimeCode') || '').trim().slice(0, 12) || null,
      identity_status: identityStatus, consent_status: consentStatus, validator_name: requiredFormText(formData, 'validatorName', 'El personal que valida', 220),
      witness_name: requiredFormText(formData, 'witnessName', 'El segundo responsable o testigo', 220),
      approver_name: delivered ? requiredFormText(formData, 'approverName', 'El responsable que aprueba', 220) : String(formData.get('approverName') || '').trim() || null,
      institution_approved: institutionApproved, status,
      resolution_reason: delivered ? null : requiredFormText(formData, 'resolutionReason', 'El motivo de la resolución', 1000),
      delivering_teacher_name: delivered ? requiredFormText(formData, 'deliveringTeacherName', 'El docente que entrega', 220) : null,
      reporter_name: reporterName, registered_by_user_id: context.user.id,
      final_handover_photo_path: paths.get('finalHandoverPhoto') || null, pickup_signature_path: paths.get('pickupSignature') || null,
      final_observations: String(formData.get('finalObservations') || '').trim().slice(0, 4000) || null, protocol_confirmed: protocolConfirmed,
    };
    if (verifiedGuardianPolicyAvailable) entryPayload.verified_guardian_contact_required = requireVerifiedGuardianContact;
    const { data: entry, error } = await context.admin.from('filter_extraordinary_handoffs').insert(entryPayload).select('id').single();
    if (error) {
      if (error.code === '23505') {
        const { data: duplicate } = await context.admin.from('filter_extraordinary_handoffs').select('id').eq('tenant_id', context.tenantId).eq('client_request_id', clientRequestId).single();
        if (duplicate) {
          const { data: duplicateAudit } = await context.admin.from('filter_audit_log').select('id').eq('tenant_id', context.tenantId).eq('action', 'extraordinary_handoff.created').eq('entity_id', duplicate.id).maybeSingle();
          if (!duplicateAudit) await audit(context, 'extraordinary_handoff.created', 'extraordinary_handoff', duplicate.id, { clientRequestId, recoveredFromIdempotentRetry: true });
          return { success: true, duplicate: true, id: duplicate.id };
        }
      }
      await context.admin.storage.from('filtro-evidencias').remove([...paths.values()]); throw error;
    }
    await context.admin.from('filter_reporters').upsert({ tenant_id: context.tenantId, name: reporterName, normalized_name: normalizeFilterName(reporterName), last_used_at: new Date().toISOString(), created_by: context.user.id }, { onConflict: 'tenant_id,normalized_name' });
    await audit(context, 'extraordinary_handoff.created', 'extraordinary_handoff', entry.id, { studentId: student.id, guardianContactId: guardian?.id || null, requireVerifiedGuardianContact, status, deliveryContext, hasVehiclePhoto: Boolean(vehiclePhoto) });
    revalidatePath('/dashboard/filtro/entregas-extraordinarias'); revalidatePath('/dashboard/filtro/reportes');
    return { success: true, duplicate: false, id: entry.id };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar la entrega extraordinaria.' }; }
}

export async function getFilterReportPackets(selection: Array<{ type: 'early' | 'extraordinary'; id: string }>) {
  try {
    const context = await requireFilterAccess();
    const safe = selection.filter((item) => ['early', 'extraordinary'].includes(item.type) && /^[0-9a-f-]{36}$/i.test(item.id)).slice(0, 100);
    if (!safe.length) throw new Error('Selecciona al menos un reporte.');
    const earlyIds = safe.filter((item) => item.type === 'early').map((item) => item.id);
    const extraordinaryIds = safe.filter((item) => item.type === 'extraordinary').map((item) => item.id);
    const [{ data: early }, { data: extraordinary }, { data: institution }] = await Promise.all([
      earlyIds.length ? context.admin.from('filter_early_departures').select('*').eq('tenant_id', context.tenantId).in('id', earlyIds) : Promise.resolve({ data: [] }),
      extraordinaryIds.length ? context.admin.from('filter_extraordinary_handoffs').select('*').eq('tenant_id', context.tenantId).in('id', extraordinaryIds) : Promise.resolve({ data: [] }),
      context.admin.from('configuracion_sistema').select('nombre_completo,nombre_corto,logo_url,color_primario,direccion,telefono_contacto,correo_contacto').eq('tenant_id', context.tenantId).maybeSingle(),
    ]);
    const pathKeys = ['identification_evidence_path','pickup_person_photo_path','final_handover_photo_path','pickup_signature_path','identification_front_path','identification_back_path','vehicle_photo_path','authorization_evidence_path'];
    const paths = [...new Set([...(early || []), ...(extraordinary || [])].flatMap((row: any) => pathKeys.map((key) => row[key]).filter(Boolean)))];
    const signed = paths.length ? await context.admin.storage.from('filtro-evidencias').createSignedUrls(paths, 600) : { data: [], error: null };
    if (signed.error) throw signed.error;
    const urls = Object.fromEntries((signed.data || []).map((item: any) => [item.path, item.signedUrl]));
    await audit(context, 'filter_reports.exported', 'filter_report', undefined, { count: safe.length, ids: safe });
    return { success: true, early: early || [], extraordinary: extraordinary || [], institution: institution || {}, urls };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudieron preparar los reportes.' }; }
}

export async function updateFilterAlertSettings(input: { enabled: boolean; threshold: number; windowUnit: string; windowValue: number; requireVerifiedGuardianContact: boolean }) {
  try {
    const context = await requireFilterAccess();
    if (typeof input.enabled !== 'boolean' || typeof input.requireVerifiedGuardianContact !== 'boolean') throw new Error('Las políticas recibidas no son válidas.');
    if (!['days', 'months', 'years', 'global'].includes(input.windowUnit)) throw new Error('El periodo seleccionado no es válido.');
    if (!Number.isInteger(input.threshold) || input.threshold < 1 || input.threshold > 100) throw new Error('El umbral debe estar entre 1 y 100.');
    if (!Number.isInteger(input.windowValue) || input.windowValue < 1 || input.windowValue > 100) throw new Error('La cantidad del periodo debe estar entre 1 y 100.');
    const { error: transactionalError } = await (context.admin as any).rpc('update_filter_alert_settings_atomic', {
      target_tenant_id: context.tenantId,
      actor_id: context.user.id,
      setting_enabled: input.enabled,
      setting_threshold: input.threshold,
      setting_window_unit: input.windowUnit,
      setting_window_value: input.windowValue,
      setting_require_verified_guardian_contact: input.requireVerifiedGuardianContact,
    });

    if (!transactionalError) {
      revalidatePath('/dashboard/filtro/alertas');
      revalidatePath('/dashboard/filtro/entregas-extraordinarias');
      return { success: true, verifiedGuardianPolicyAvailable: true };
    }
    if (!isMissingSchemaRoutine(transactionalError)) throw transactionalError;

    // Compatibilidad temporal: permite desplegar la aplicación antes de la
    // migración, conserva la regla segura anterior y no muestra el switch.
    const compatibleUpdate = {
      tenant_id: context.tenantId,
      enabled: input.enabled,
      threshold: input.threshold,
      window_unit: input.windowUnit,
      window_value: input.windowValue,
      updated_at: new Date().toISOString(),
      updated_by: context.user.id,
    };
    const { error: compatibleError } = await context.admin.from('filter_alert_settings').upsert(compatibleUpdate);
    if (compatibleError) throw compatibleError;
    revalidatePath('/dashboard/filtro/alertas');
    revalidatePath('/dashboard/filtro/entregas-extraordinarias');
    try {
      await audit(context, 'alert_settings.updated', 'settings', context.tenantId, { enabled: input.enabled, threshold: input.threshold, windowUnit: input.windowUnit, windowValue: input.windowValue, verifiedGuardianPolicyAvailable: false });
      return { success: true, verifiedGuardianPolicyAvailable: false };
    } catch {
      return { success: true, verifiedGuardianPolicyAvailable: false, warning: 'La configuración de retardos sí quedó guardada, pero no fue posible confirmar su registro de auditoría.' };
    }
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar.' }; }
}

export async function getFilterEvidenceUrl(path: string) {
  try {
    const context = await requireFilterAccess();
    if (!path.startsWith(`${context.tenantId}/`)) throw new Error('Evidencia fuera de la institución.');
    const { data, error } = await context.admin.storage.from('filtro-evidencias').createSignedUrl(path, 300);
    if (error) throw error;
    return { success: true, url: data.signedUrl };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo abrir la evidencia.' }; }
}
