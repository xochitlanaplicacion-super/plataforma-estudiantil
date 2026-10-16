'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { normalizeFilterName } from '@/lib/filter-control';
import { requireTenantSession } from '@/lib/tenant/context';

const ROLES = ['superuser', 'admin', 'encargado_filtro', 'profesor'] as const;
const FILTER_ROLES = ['superuser', 'admin', 'encargado_filtro'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
};

type Context = Awaited<ReturnType<typeof requireTenantSession>>;
type Kind = 'early' | 'extraordinary';
type ActorKind = 'teacher' | 'filter';
type Student = { id: string; full_name: string; group_label: string };
type Preliminary = Record<string, string>;

type FilterPreRegistrationBase = {
  id: string;
  status: 'pending' | 'completed';
  studentIds: string[];
  students: Student[];
  preliminary: Preliminary;
  evidencePath: string;
  evidenceUrl: string | null;
  createdAt: string;
  createdByName: string;
  createdByActorKind: ActorKind;
  declaredStaffName: string | null;
  completedAt: string | null;
};
export type FilterPreRegistrationOrder = FilterPreRegistrationBase & ({ kind: 'early' } | { kind: 'extraordinary' });

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function requirePreregistrationAccess() {
  const context = await requireTenantSession([...ROLES]);
  const { data, error } = await context.admin.from('tenant_features')
    .select('primary_filter_enabled,timezone').eq('tenant_id', context.tenantId).maybeSingle();
  if (error) throw error;
  if (!data?.primary_filter_enabled) throw new Error('Control de Filtro no está activo para esta institución.');
  const actorKind: ActorKind = context.profile.rol === 'profesor' ? 'teacher' : 'filter';
  return { ...context, actorKind, actorName: `${context.profile.nombre} ${context.profile.apellidos}`.trim(), filterTimezone: data.timezone || 'America/Mexico_City' };
}

async function requireFilterAccess() {
  const context = await requirePreregistrationAccess();
  if (!FILTER_ROLES.includes(context.profile.rol as typeof FILTER_ROLES[number])) {
    throw new Error('Sólo Control de Filtro puede completar órdenes.');
  }
  return context;
}

async function allRows<T>(makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
  throw new Error('El padrón es demasiado grande para cargarse de forma segura.');
}

async function filterStudentCatalog(context: Context, activeOnly: boolean): Promise<Array<Student & { group_id: string }>> {
  const [studentRows, groupResult, levelResult] = await Promise.all([
    allRows((from, to) => {
      let query = context.admin.from('filter_students').select('id,full_name,group_id')
        .eq('tenant_id', context.tenantId).order('id').range(from, to);
      if (activeOnly) query = query.eq('active', true);
      return query;
    }),
    context.admin.from('filter_groups').select('id,level_id,grade_name,group_name').eq('tenant_id', context.tenantId),
    context.admin.from('filter_levels').select('id,name').eq('tenant_id', context.tenantId),
  ]);
  if (groupResult.error) throw groupResult.error;
  if (levelResult.error) throw levelResult.error;
  const groups = new Map((groupResult.data || []).map((row) => [row.id, row]));
  const levels = new Map((levelResult.data || []).map((row) => [row.id, row]));
  return studentRows.map((row) => {
    const group = groups.get(row.group_id);
    const level = group ? levels.get(group.level_id) : null;
    return {
      id: row.id, full_name: row.full_name, group_id: row.group_id,
      group_label: group && level ? `${level.name} · ${group.grade_name} · Grupo ${group.group_name}` : 'Grupo no disponible',
    };
  }).sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));
}

function groupKey(level: string, grade: string, group: string) {
  const normalizedLevel = normalizeFilterName(level);
  const normalizedGrade = normalizeFilterName(grade).replace(/ ano$/, '');
  const normalizedGroup = normalizeFilterName(group).replace(/^grupo /, '');
  const ordinalGrade: Record<string, string> = {
    primer: '1', primero: '1', primera: '1',
    segundo: '2', segunda: '2', tercer: '3', tercero: '3', tercera: '3',
    cuarto: '4', cuarta: '4', quinto: '5', quinta: '5', sexto: '6', sexta: '6',
  };
  const levelKey = /^primaria (mayor|menor)$/.test(normalizedLevel) ? 'primaria' : normalizedLevel;
  return [levelKey, ordinalGrade[normalizedGrade] || normalizedGrade, normalizedGroup].join('|');
}

// Los dos padrones no comparten IDs. Sólo se emparejan nivel, grado y grupo
// con alias institucionales conocidos y sin colisiones entre grupos académicos.
function localDate(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
}

async function teacherFilterGroupIds(context: Context & { filterTimezone: string }): Promise<Set<string>> {
  const { data: activeCycles, error: cycleError } = await context.admin.from('ciclos_escolares')
    .select('id').eq('tenant_id', context.tenantId).eq('estado', 'activo');
  if (cycleError) throw cycleError;
  const cycleIds = (activeCycles || []).map((row) => row.id);
  if (!cycleIds.length) return new Set();

  const assignments = await allRows((from, to) => context.admin.from('asignaciones_profesor')
    .select('grupo_id,grado_id,nivel_id,vigencia_desde,vigencia_hasta')
    .eq('tenant_id', context.tenantId).eq('profesor_id', context.user.id)
    .eq('tipo_participacion', 'titular').eq('activo', true).in('ciclo_escolar_id', cycleIds)
    .order('id').range(from, to));
  const today = localDate(context.filterTimezone);
  const own = assignments.filter((row) => row.vigencia_desde <= today && (!row.vigencia_hasta || row.vigencia_hasta >= today));
  if (!own.length) return new Set();

  const [academicGroups, careers, grades, levels, filterGroups, filterLevels] = await Promise.all([
    context.admin.from('grupos').select('id,carrera_id,grado_id,nombre,activo').eq('tenant_id', context.tenantId),
    context.admin.from('carreras').select('id,nivel_id,activo').eq('tenant_id', context.tenantId),
    context.admin.from('grados').select('id,nombre,activo').eq('tenant_id', context.tenantId),
    context.admin.from('niveles').select('id,nombre,activo').eq('tenant_id', context.tenantId),
    context.admin.from('filter_groups').select('id,level_id,grade_name,group_name').eq('tenant_id', context.tenantId),
    context.admin.from('filter_levels').select('id,name').eq('tenant_id', context.tenantId),
  ]);
  for (const result of [academicGroups, careers, grades, levels, filterGroups, filterLevels]) if (result.error) throw result.error;
  const groupById = new Map((academicGroups.data || []).map((row) => [row.id, row]));
  const careerById = new Map((careers.data || []).map((row) => [row.id, row]));
  const gradeById = new Map((grades.data || []).map((row) => [row.id, row]));
  const levelById = new Map((levels.data || []).map((row) => [row.id, row]));
  const academicGroupKey = (group: NonNullable<typeof academicGroups.data>[number]) => {
    const career = careerById.get(group.carrera_id);
    const grade = gradeById.get(group.grado_id);
    const level = career ? levelById.get(career.nivel_id) : null;
    if (!career || !grade || !level || group.activo === false || career.activo === false || grade.activo === false || level.activo === false) return null;
    return groupKey(level.nombre, grade.nombre, group.nombre);
  };
  const academicGroupIdsByKey = new Map<string, Set<string>>();
  for (const group of academicGroups.data || []) {
    const key = academicGroupKey(group);
    if (!key) continue;
    if (!academicGroupIdsByKey.has(key)) academicGroupIdsByKey.set(key, new Set());
    academicGroupIdsByKey.get(key)!.add(group.id);
  }
  const ownKeys = new Set(own.map((assignment) => {
    const group = groupById.get(assignment.grupo_id);
    const career = group ? careerById.get(group.carrera_id) : null;
    if (!group || !career || group.grado_id !== assignment.grado_id || career.nivel_id !== assignment.nivel_id) return null;
    return academicGroupKey(group);
  }).filter((key): key is string => Boolean(key)));
  const filterLevelById = new Map((filterLevels.data || []).map((row) => [row.id, row.name]));
  const filterGroupIdsByKey = new Map<string, Set<string>>();
  for (const group of filterGroups.data || []) {
    const levelName = filterLevelById.get(group.level_id);
    if (!levelName) continue;
    const key = groupKey(levelName, group.grade_name, group.group_name);
    if (!filterGroupIdsByKey.has(key)) filterGroupIdsByKey.set(key, new Set());
    filterGroupIdsByKey.get(key)!.add(group.id);
  }
  const result = new Set<string>();
  for (const key of ownKeys) {
    if (academicGroupIdsByKey.get(key)?.size !== 1) continue;
    const matching = filterGroupIdsByKey.get(key);
    if (matching?.size === 1) result.add([...matching][0]);
  }
  return result;
}

async function accessibleStudents(context: Awaited<ReturnType<typeof requirePreregistrationAccess>>) {
  const students = await filterStudentCatalog(context, true);
  if (context.actorKind === 'filter') return students;
  const groupIds = await teacherFilterGroupIds(context);
  return students.filter((student) => groupIds.has(student.group_id));
}

function studentIdsFromForm(formData: FormData): string[] {
  let parsed: unknown;
  try { parsed = JSON.parse(String(formData.get('studentIds') || '')); }
  catch { throw new Error('La selección de alumnos no es válida.'); }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 5
    || !parsed.every((id) => typeof id === 'string' && UUID.test(id)) || new Set(parsed).size !== parsed.length) {
    throw new Error('Selecciona entre uno y cinco alumnos distintos.');
  }
  return parsed;
}

function optionalText(formData: FormData, key: string, maxLength: number, allowed?: readonly string[]) {
  const value = String(formData.get(key) || '').trim();
  if (!value) return '';
  if (value.length > maxLength || (allowed && !allowed.includes(value))) throw new Error(`El campo ${key} no es válido.`);
  return value;
}

function preliminaryFromForm(formData: FormData, kind: Kind, actorKind: ActorKind) {
  const preliminary: Preliminary = {};
  const put = (key: string, limit: number, allowed?: readonly string[]) => {
    const value = optionalText(formData, key, limit, allowed);
    if (value) preliminary[key] = value;
  };
  if (kind === 'early') {
    put('notifiedParty', 40, ['madre', 'padre', 'tutor', 'familiar_autorizado']);
    put('notifiedStaffName', 220);
    put('notificationMethod', 40, ['whatsapp', 'llamada', 'sms', 'presencial', 'otro']);
    put('notificationMethodOther', 120);
    put('departureReason', 40, ['cita_medica', 'malestar', 'asunto_familiar', 'salida_autorizada', 'cambio_transporte', 'otro']);
    put('departureReasonOther', 120);
    put('description', 4000);
    put('reporterName', 180);
    if (actorKind === 'filter' && (!preliminary.notifiedStaffName || preliminary.notifiedStaffName.length < 2)) {
      throw new Error('Indica el nombre del personal que recibió el aviso.');
    }
  } else {
    put('deliveryContext', 40, ['horario_escolar', 'fin_jornada', 'emergencia', 'otro']);
    put('deliveryContextOther', 120);
    put('deliveryReason', 1000);
    put('reporterName', 180);
    if (actorKind === 'filter' && (!preliminary.reporterName || preliminary.reporterName.length < 2)) {
      throw new Error('Indica el nombre del personal que recibió el aviso.');
    }
  }
  return preliminary;
}

async function signedEvidenceUrl(context: Context, path: string) {
  const { data, error } = await context.admin.storage.from('filtro-evidencias').createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new Error('No se pudo abrir la evidencia. Intenta de nuevo.');
  return data.signedUrl;
}

async function hydrateOrders(context: Context, rows: any[], signEvidence: boolean): Promise<FilterPreRegistrationOrder[]> {
  const catalog = await filterStudentCatalog(context, false);
  const byId = new Map(catalog.map((student) => [student.id, student]));
  const urls = new Map<string, string>();
  if (signEvidence && rows.length) {
    const paths = [...new Set(rows.map((row) => row.evidence_path))];
    const { data, error } = await context.admin.storage.from('filtro-evidencias').createSignedUrls(paths, 600);
    if (error) throw error;
    for (let index = 0; index < paths.length; index++) {
      if (data?.[index]?.signedUrl) urls.set(paths[index], data[index].signedUrl);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    studentIds: row.student_ids,
    students: row.student_ids.map((id: string) => byId.get(id) || { id, full_name: 'Alumno no disponible', group_label: 'Grupo no disponible' }),
    preliminary: row.preliminary || {},
    evidencePath: row.evidence_path,
    evidenceUrl: urls.get(row.evidence_path) || null,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    createdByActorKind: row.created_by_actor_kind,
    declaredStaffName: row.declared_staff_name,
    completedAt: row.completed_at,
  }));
}

export async function getFilterPreregistrationFormData() {
  const context = await requirePreregistrationAccess();
  const students = await accessibleStudents(context);
  return {
    actorKind: context.actorKind,
    actorName: context.actorName,
    students: students.map(({ id, full_name, group_label }) => ({ id, full_name, group_label })),
    rosterWarning: context.actorKind === 'teacher' && !students.length
      ? 'No hay alumnos del padrón de Filtro vinculados sin ambigüedad a tus grupos titulares activos. Solicita a la administración revisar nivel, grado y grupo.'
      : null,
  };
}

export async function createFilterPreregistration(formData: FormData): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const context = await requirePreregistrationAccess();
    const kind = String(formData.get('kind') || '');
    if (kind !== 'early' && kind !== 'extraordinary') throw new Error('Selecciona el tipo de salida.');
    const studentIds = studentIdsFromForm(formData);
    const allowed = new Set((await accessibleStudents(context)).map((student) => student.id));
    if (studentIds.some((id) => !allowed.has(id))) throw new Error('Algún alumno no pertenece a tus grupos autorizados.');
    const rawRequestId = String(formData.get('clientRequestId') || '');
    if (rawRequestId && !UUID.test(rawRequestId)) throw new Error('El identificador del preregistro no es válido.');
    const id = rawRequestId || randomUUID();
    const { data: existing, error: lookupError } = await context.admin.from('filter_preregistrations')
      .select('id,kind,student_ids,created_by_user_id,status').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      if (existing.created_by_user_id !== context.user.id || existing.kind !== kind
        || existing.student_ids.length !== studentIds.length || existing.student_ids.some((value: string) => !studentIds.includes(value))) {
        throw new Error('Este identificador ya pertenece a otro preregistro.');
      }
      if (existing.status !== 'pending') throw new Error('Esta orden ya fue completada. Inicia una nueva.');
      return { success: true, id };
    }

    const preliminary = preliminaryFromForm(formData, kind, context.actorKind);
    const evidence = formData.get('evidence');
    if (!(evidence instanceof File) || evidence.size < 1) throw new Error('Adjunta la foto o documento del aviso recibido.');
    if (!MIME_EXTENSIONS[evidence.type]) throw new Error('La evidencia debe ser una imagen JPG, PNG, WebP o PDF.');
    if (evidence.size > 10_000_000) throw new Error('La evidencia supera el límite de 10 MB.');
    const path = `${context.tenantId}/preregistros/${id}/${randomUUID()}/aviso.${MIME_EXTENSIONS[evidence.type]}`;
    const upload = await context.admin.storage.from('filtro-evidencias')
      .upload(path, evidence, { upsert: false, contentType: evidence.type });
    if (upload.error) throw new Error(`No se pudo guardar la evidencia: ${upload.error.message}`);

    const declaredStaffName = context.actorKind === 'filter'
      ? (kind === 'early' ? preliminary.notifiedStaffName : preliminary.reporterName)
      : (kind === 'early' ? preliminary.notifiedStaffName : preliminary.reporterName) || null;
    const { error: insertError } = await context.admin.from('filter_preregistrations').insert({
      id, tenant_id: context.tenantId, kind, student_ids: studentIds, evidence_path: path,
      preliminary, created_by_user_id: context.user.id, created_by_name: context.actorName,
      created_by_actor_kind: context.actorKind, declared_staff_name: declaredStaffName,
    });
    if (insertError) {
      await context.admin.storage.from('filtro-evidencias').remove([path]);
      if (insertError.code === '23505') {
        const { data: retry } = await context.admin.from('filter_preregistrations')
          .select('id,kind,student_ids,created_by_user_id,status').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
        if (retry?.created_by_user_id === context.user.id && retry.kind === kind && retry.status === 'pending'
          && retry.student_ids.length === studentIds.length && retry.student_ids.every((value: string) => studentIds.includes(value))) {
          return { success: true, id };
        }
      }
      throw insertError;
    }
    // La fila persistida es la fuente de verdad; un fallo del registro auxiliar
    // nunca convierte una orden ya guardada en un falso error para quien la inició.
    await context.admin.from('filter_audit_log').insert({
      tenant_id: context.tenantId, actor_user_id: context.user.id, actor_name: context.actorName,
      action: 'filter_preregistration.created', entity_type: 'filter_preregistration', entity_id: id,
      details: { kind, studentIds, declaredStaffName },
    });
    revalidatePath('/dashboard/filtro');
    revalidatePath('/dashboard/profesor');
    return { success: true, id };
  } catch (error) {
    return { success: false, error: errorText(error, 'No se pudo guardar el preregistro.') };
  }
}

export async function listFilterPreRegistrations(): Promise<{ success: boolean; orders: FilterPreRegistrationOrder[]; error?: string }> {
  try {
    const context = await requirePreregistrationAccess();
    const rows = await allRows((from, to) => {
      let query = context.admin.from('filter_preregistrations').select('*')
        .eq('tenant_id', context.tenantId).eq('status', 'pending')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to);
      if (context.actorKind === 'teacher') query = query.eq('created_by_user_id', context.user.id);
      return query;
    });
    return { success: true, orders: await hydrateOrders(context, rows, false) };
  } catch (error) {
    return { success: false, orders: [], error: errorText(error, 'No se pudieron cargar las órdenes.') };
  }
}

export async function getFilterPendingOrderCount(): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const context = await requireFilterAccess();
    const { count, error } = await context.admin.from('filter_preregistrations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId).eq('status', 'pending');
    if (error) throw error;
    return { success: true, count: count ?? 0 };
  } catch (error) {
    return { success: false, count: 0, error: errorText(error, 'No se pudieron contar las órdenes pendientes.') };
  }
}

export async function getFilterPreRegistration(id: string): Promise<{ success: boolean; order?: FilterPreRegistrationOrder; error?: string }> {
  try {
    if (!UUID.test(id)) throw new Error('La orden solicitada no es válida.');
    const context = await requirePreregistrationAccess();
    let query = context.admin.from('filter_preregistrations').select('*').eq('tenant_id', context.tenantId).eq('id', id);
    if (context.actorKind === 'teacher') query = query.eq('created_by_user_id', context.user.id);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Orden no encontrada.');
    const [order] = await hydrateOrders(context, [data], false);
    order.evidenceUrl = await signedEvidenceUrl(context, order.evidencePath);
    return { success: true, order };
  } catch (error) {
    return { success: false, error: errorText(error, 'No se pudo abrir la orden.') };
  }
}

export async function completeFilterPreRegistration(id: string, kind: Kind, expectedStudentIds: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (!UUID.test(id) || !['early', 'extraordinary'].includes(kind)) throw new Error('La orden no es válida.');
    if (!Array.isArray(expectedStudentIds) || expectedStudentIds.length < 1 || expectedStudentIds.length > 5
      || expectedStudentIds.some((value) => typeof value !== 'string' || !UUID.test(value))
      || new Set(expectedStudentIds).size !== expectedStudentIds.length) throw new Error('Los alumnos de la orden no son válidos.');
    const context = await requireFilterAccess();
    const { data: order, error: orderError } = await context.admin.from('filter_preregistrations')
      .select('id,kind,student_ids,status').eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new Error('La orden no existe.');
    if (order.kind !== kind || order.student_ids.length !== expectedStudentIds.length
      || order.student_ids.some((studentId: string) => !expectedStudentIds.includes(studentId))) {
      throw new Error('La orden no coincide con el tipo o los alumnos guardados.');
    }
    const table = kind === 'early' ? 'filter_early_departures' : 'filter_extraordinary_handoffs';
    const { data: finalRows, error: finalError } = await context.admin.from(table).select('student_id')
      .eq('tenant_id', context.tenantId).eq('group_event_id', id);
    if (finalError) throw finalError;
    const finalStudentIds = new Set((finalRows || []).map((row) => row.student_id));
    if ((finalRows || []).length !== order.student_ids.length
      || finalStudentIds.size !== order.student_ids.length
      || order.student_ids.some((studentId: string) => !finalStudentIds.has(studentId))) {
      throw new Error('La bitácora final aún no confirma a todos los alumnos. La orden seguirá pendiente.');
    }
    if (order.status === 'completed') return { success: true };
    const { error: updateError } = await context.admin.from('filter_preregistrations').update({
      status: 'completed', completed_at: new Date().toISOString(), completed_by_user_id: context.user.id,
    }).eq('tenant_id', context.tenantId).eq('id', id).eq('status', 'pending');
    if (updateError) throw updateError;
    await context.admin.from('filter_audit_log').insert({
      tenant_id: context.tenantId, actor_user_id: context.user.id, actor_name: context.actorName,
      action: 'filter_preregistration.completed', entity_type: 'filter_preregistration', entity_id: id,
      details: { kind, studentIds: order.student_ids },
    });
    revalidatePath('/dashboard/filtro');
    return { success: true };
  } catch (error) {
    return { success: false, error: errorText(error, 'No se pudo completar la orden.') };
  }
}
