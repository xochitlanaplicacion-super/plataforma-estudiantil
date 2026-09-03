'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantSession } from '@/lib/tenant/context';
import { FILTER_REASONS, normalizeFilterName } from '@/lib/filter-control';

const FILTER_ROLES = ['superuser', 'admin', 'encargado_filtro'] as const;
const EARLY_RELATIONSHIPS = ['madre', 'padre', 'tutor', 'abuelo', 'hermano', 'familiar_autorizado', 'otro'] as const;
const EARLY_NOTIFICATION_METHODS = ['whatsapp', 'llamada', 'sms', 'presencial', 'otro'] as const;
const EARLY_REASONS = ['cita_medica', 'malestar', 'asunto_familiar', 'salida_autorizada', 'cambio_transporte', 'otro'] as const;
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EVIDENCE_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'];

async function requireFilterAccess() {
  const context = await requireTenantSession([...FILTER_ROLES]);
  const { data: feature } = await context.admin.from('tenant_features').select('primary_filter_enabled')
    .eq('tenant_id', context.tenantId).maybeSingle();
  if (!feature?.primary_filter_enabled) throw new Error('El servicio Control de Filtro no está activo para esta institución.');
  return context;
}

async function audit(context: Awaited<ReturnType<typeof requireFilterAccess>>, action: string, entityType: string, entityId?: string, details: Record<string, unknown> = {}) {
  const { error } = await context.admin.from('filter_audit_log').insert({
    tenant_id: context.tenantId, actor_user_id: context.user.id,
    actor_name: `${context.profile.nombre} ${context.profile.apellidos}`.trim(),
    action, entity_type: entityType, entity_id: entityId || null, details,
  });
  if (error) throw new Error(`No se pudo registrar la auditoría: ${error.message}`);
}

async function getAllActiveFilterStudents(context: Awaited<ReturnType<typeof requireFilterAccess>>) {
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
  const [{ data: levels }, { data: groups }, students, { data: settings }, { data: staff }, { data: recent }] = await Promise.all([
    context.admin.from('filter_levels').select('*').eq('tenant_id', context.tenantId).order('sort_order').order('name'),
    context.admin.from('filter_groups').select('*').eq('tenant_id', context.tenantId).order('sort_order').order('grade_name').order('group_name'),
    getAllActiveFilterStudents(context),
    context.admin.from('filter_alert_settings').select('*').eq('tenant_id', context.tenantId).maybeSingle(),
    context.admin.from('filter_staff_profiles').select('is_general').eq('tenant_id', context.tenantId).eq('user_id', context.user.id).maybeSingle(),
    context.admin.from('filter_late_entries').select('*, filter_students(full_name), profiles:registered_by_user_id(nombre,apellidos)').eq('tenant_id', context.tenantId).order('arrived_at', { ascending: false }).limit(100),
  ]);
  return { levels: levels || [], groups: groups || [], students, settings, isGeneral: Boolean(staff?.is_general), actorName: `${context.profile.nombre} ${context.profile.apellidos}`.trim(), recent: recent || [] };
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
    isGeneral: Boolean(staff?.is_general),
    actorName: `${context.profile.nombre} ${context.profile.apellidos}`.trim(),
    recent: recent || [],
  };
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
      if (file.size > 10 * 1024 * 1024 || !['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) throw new Error('La evidencia debe ser imagen o PDF de hasta 10 MB.');
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'; evidencePath = `${context.tenantId}/${studentId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await context.admin.storage.from('filtro-evidencias').upload(evidencePath, file, { upsert: false, contentType: file.type }); if (error) throw error;
    }
    const { data: entry, error } = await context.admin.from('filter_late_entries').insert({ tenant_id: context.tenantId, student_id: studentId, arrived_at: arrivedAt, reason_code: reasonCode, reason_detail: reasonDetail || null, evidence_path: evidencePath, registered_by_user_id: context.user.id, reporter_name: reporterName }).select('id').single();
    if (error) {
      if (evidencePath) await context.admin.storage.from('filtro-evidencias').remove([evidencePath]);
      throw error;
    }
    await context.admin.from('filter_reporters').upsert({ tenant_id: context.tenantId, name: reporterName, normalized_name: normalizeFilterName(reporterName), last_used_at: new Date().toISOString(), created_by: context.user.id }, { onConflict: 'tenant_id,normalized_name' });
    await audit(context, 'late_entry.created', 'late_entry', entry.id, { studentId, reporterName, reasonCode, hasEvidence: Boolean(evidencePath) });
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
  if (value.size > 10 * 1024 * 1024) throw new Error(`${label} no puede superar 10 MB.`);
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
    const basePath = `${context.tenantId}/salidas/${clientRequestId}`;
    const uploads = [
      { file: identificationFile, path: `${basePath}/identificacion.${extensionForFile(identificationFile)}` },
      { file: pickupPhoto, path: `${basePath}/persona.${extensionForFile(pickupPhoto)}` },
      { file: handoverPhoto, path: `${basePath}/entrega.${extensionForFile(handoverPhoto)}` },
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

export async function updateFilterAlertSettings(input: { enabled: boolean; threshold: number; windowUnit: string; windowValue: number }) {
  try {
    const context = await requireFilterAccess();
    const { error } = await context.admin.from('filter_alert_settings').upsert({ tenant_id: context.tenantId, enabled: input.enabled, threshold: input.threshold, window_unit: input.windowUnit, window_value: input.windowValue, updated_at: new Date().toISOString(), updated_by: context.user.id }); if (error) throw error;
    await audit(context, 'alert_settings.updated', 'settings', context.tenantId, input);
    revalidatePath('/dashboard/filtro/alertas'); return { success: true };
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
