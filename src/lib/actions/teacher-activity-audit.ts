'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantSession } from '@/lib/tenant/context';
import {
  buildPilotTeacherActivityReport,
  pilotWindowForTenant,
  type PilotExerciseRow,
} from '@/lib/teacher-activity/pilot-report';
import {
  addDays,
  buildTeacherActivityAuditReport,
  localDate,
  mondayOf,
  parseDateRange,
  type MyWeeklyTeacherGoal,
  type PublicationRow,
  type TeacherActivityAuditReport,
  type TeacherRow,
  type TeacherWeeklyExceptionKind,
  type WeeklyExceptionRow,
} from '@/lib/teacher-activity/weekly-report';

export type {
  MyWeeklyTeacherGoal,
  TeacherActivityAuditReport,
  TeacherActivityEvidence,
  TeacherActivityTeacher,
  TeacherActivityTeacherWeek,
  TeacherActivityWeek,
  TeacherWeeklyException,
  TeacherWeeklyExceptionKind,
} from '@/lib/teacher-activity/weekly-report';

type AdminClient = Awaited<ReturnType<typeof requireTenantSession>>['admin'];
type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };
type MutationResult = { ok: true } | { ok: false; message: string };
type RowWithId = { id: string };

const PAGE_SIZE = 500;
const MAX_TEACHERS = 2_000;
const MAX_PUBLICATIONS = 20_000;
const MAX_RESULTS = 30_000;
const MAX_EXERCISES = 5_000;
const MAX_PILOT_ROWS = 10_000;

class ReportLimitError extends Error {}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ReportLimitError) return error.message;
  if (error instanceof Error && [
    'No autenticado', 'No autorizado', 'Usuario inactivo',
    'Perfil sin institución asignada', 'Institución suspendida',
  ].includes(error.message)) return error.message;
  if (error instanceof Error && /^(Selecciona|La fecha|Indica ambas)/.test(error.message)) return error.message;
  console.error('[teacher-activity-audit]', error);
  return fallback;
}

async function readPagedById<Row extends RowWithId>(
  label: string,
  maxRows: number,
  fetchPage: (lastId: string | null) => Promise<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  let lastId: string | null = null;
  while (true) {
    const { data, error } = await fetchPage(lastId);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data ?? [];
    if (page.length > PAGE_SIZE || rows.length + page.length > maxRows) {
      throw new ReportLimitError(`${label} supera el límite de ${maxRows} registros; reduce el rango del informe.`);
    }
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    lastId = page[page.length - 1].id;
  }
}

function timeQueryBounds(from: string, to: string) {
  // Every IANA timezone is within 14 hours of UTC. Two days of overlap avoid
  // midnight and daylight-saving gaps; local dates are checked after the read.
  return {
    lower: new Date(Date.parse(`${from}T00:00:00Z`) - 2 * 86_400_000).toISOString(),
    upper: new Date(Date.parse(`${addDays(to, 1)}T00:00:00Z`) + 2 * 86_400_000).toISOString(),
  };
}

async function readTeachers(admin: AdminClient, tenantId: string): Promise<TeacherRow[]> {
  return readPagedById('La lista de docentes', MAX_TEACHERS, async (lastId) => {
    let query = admin.from('profiles')
      .select('id, nombre, apellidos, email, estatus, created_at')
      .eq('tenant_id', tenantId)
      .eq('rol', 'profesor')
      .order('id')
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    return query;
  });
}

async function readActiveAssignmentTeachers(admin: AdminClient, tenantId: string): Promise<Set<string>> {
  const assignments = await readPagedById<RowWithId & { profesor_id: string }>(
    'Las asignaciones docentes', 10_000, async (lastId) => {
      let query = admin.from('asignaciones_profesor')
        .select('id, profesor_id')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('id')
        .limit(PAGE_SIZE);
      if (lastId) query = query.gt('id', lastId);
      return query;
    },
  );
  return new Set(assignments.map((assignment) => assignment.profesor_id));
}

async function readPublications(
  admin: AdminClient,
  tenantId: string,
  from: string,
  to: string,
  teacherId?: string,
): Promise<PublicationRow[]> {
  const { lower, upper } = timeQueryBounds(from, to);
  const rows = await readPagedById<Record<string, unknown> & RowWithId>(
    'Las publicaciones', MAX_PUBLICATIONS, async (lastId) => {
      let query = admin.from('teacher_activity_publication_events')
        .select('id, logical_activity_id, exercise_id, credited_teacher_id, published_at, title_snapshot, type_snapshot, subject_name_snapshot, due_at_snapshot, group_ids_snapshot, group_names_snapshot')
        .eq('tenant_id', tenantId)
        .gte('published_at', lower)
        .lt('published_at', upper)
        .order('id')
        .limit(PAGE_SIZE);
      if (teacherId) query = query.eq('credited_teacher_id', teacherId);
      if (lastId) query = query.gt('id', lastId);
      return query;
    },
  );
  return rows.map((row) => ({
    id: String(row.id),
    logical_activity_id: String(row.logical_activity_id),
    exercise_id: String(row.exercise_id),
    credited_teacher_id: String(row.credited_teacher_id),
    published_at: String(row.published_at),
    title: String(row.title_snapshot),
    activity_type: typeof row.type_snapshot === 'string' ? row.type_snapshot : null,
    subject_name: typeof row.subject_name_snapshot === 'string' ? row.subject_name_snapshot : null,
    due_at: typeof row.due_at_snapshot === 'string' ? row.due_at_snapshot : null,
    group_ids: Array.isArray(row.group_ids_snapshot) ? row.group_ids_snapshot.filter((id): id is string => typeof id === 'string') : [],
    group_names: Array.isArray(row.group_names_snapshot) ? row.group_names_snapshot.filter((name): name is string => typeof name === 'string') : [],
  }));
}

async function readPilotExerciseRows(
  admin: AdminClient,
  tenantId: string,
  from: string,
  through: string,
  publications: PublicationRow[],
): Promise<PilotExerciseRow[]> {
  const { lower, upper } = timeQueryBounds(from, through);
  const columns = 'id, sync_id, created_by, created_at, titulo, tipo';
  const candidates = await readPagedById<PilotExerciseRow>(
    'Las actividades del corte piloto', MAX_PILOT_ROWS, async (lastId) => {
      let query = admin.from('ejercicios').select(columns)
        .eq('tenant_id', tenantId)
        .gte('created_at', lower)
        .lt('created_at', upper)
        .order('id')
        .limit(PAGE_SIZE);
      if (lastId) query = query.gt('id', lastId);
      return query;
    },
  );
  // Read publication sources even when they were created before the pilot;
  // their current links may still make them visible to students today.
  const rows = new Map(candidates.map((row) => [row.id, row]));
  const publicationExerciseIds = [...new Set(publications.map((row) => row.exercise_id))];
  for (let index = 0; index < publicationExerciseIds.length; index += 100) {
    const batch = publicationExerciseIds.slice(index, index + 100);
    const sourceRows = await readPagedById<PilotExerciseRow>(
      'Las actividades publicadas del corte piloto', MAX_PILOT_ROWS, async (lastId) => {
        let query = admin.from('ejercicios').select(columns)
          .eq('tenant_id', tenantId).in('id', batch).order('id').limit(PAGE_SIZE);
        if (lastId) query = query.gt('id', lastId);
        return query;
      },
    );
    for (const row of sourceRows) rows.set(row.id, row);
    if (rows.size > MAX_PILOT_ROWS) {
      throw new ReportLimitError('El corte piloto supera el límite de actividades; solicita un informe más acotado.');
    }
  }

  // A synchronized copy created during the pilot does not become a new
  // original if another copy of the same logical activity predates the pilot.
  const syncIds = [...new Set([
    ...[...rows.values()].map((row) => row.sync_id).filter((id): id is string => Boolean(id)),
    ...publications.map((row) => row.logical_activity_id),
  ])];
  for (let index = 0; index < syncIds.length; index += 100) {
    const batch = syncIds.slice(index, index + 100);
    const [siblings, sourceRows] = await Promise.all([
      readPagedById<PilotExerciseRow>(
        'Las copias de actividades del corte piloto', MAX_PILOT_ROWS, async (lastId) => {
          let query = admin.from('ejercicios').select(columns)
            .eq('tenant_id', tenantId).in('sync_id', batch).order('id').limit(PAGE_SIZE);
          if (lastId) query = query.gt('id', lastId);
          return query;
        },
      ),
      readPagedById<PilotExerciseRow>(
        'Las actividades originales del corte piloto', MAX_PILOT_ROWS, async (lastId) => {
          let query = admin.from('ejercicios').select(columns)
            .eq('tenant_id', tenantId).in('id', batch).order('id').limit(PAGE_SIZE);
          if (lastId) query = query.gt('id', lastId);
          return query;
        },
      ),
    ]);
    for (const row of [...siblings, ...sourceRows]) rows.set(row.id, row);
    if (rows.size > MAX_PILOT_ROWS) {
      throw new ReportLimitError('El corte piloto supera el límite de actividades; solicita un informe más acotado.');
    }
  }
  return [...rows.values()];
}

async function readVisiblePilotExerciseIds(
  admin: AdminClient,
  tenantId: string,
  rows: PilotExerciseRow[],
): Promise<Set<string>> {
  const exerciseIds = rows.map((row) => row.id);
  type Link = RowWithId & { ejercicio_id: string; asignacion_profesor_id: string; periodo_evaluacion_id: string };
  const links: Link[] = [];
  for (let index = 0; index < exerciseIds.length; index += 100) {
    const batch = exerciseIds.slice(index, index + 100);
    const page = await readPagedById<Link>('Los vínculos del corte piloto', MAX_PILOT_ROWS, async (lastId) => {
      let query = admin.from('vinculos_evaluacion_ejercicio')
        .select('id, ejercicio_id, asignacion_profesor_id, periodo_evaluacion_id')
        .eq('tenant_id', tenantId).eq('activo', true)
        .in('ejercicio_id', batch).order('id').limit(PAGE_SIZE);
      if (lastId) query = query.gt('id', lastId);
      return query;
    });
    links.push(...page);
    if (links.length > MAX_PILOT_ROWS) throw new ReportLimitError('El corte piloto tiene demasiados vínculos activos.');
  }
  if (!links.length) return new Set();

  const activeAssignments = new Set<string>();
  const availablePeriods = new Set<string>();
  const assignmentIds = [...new Set(links.map((link) => link.asignacion_profesor_id))];
  const periodIds = [...new Set(links.map((link) => link.periodo_evaluacion_id))];
  for (let index = 0; index < assignmentIds.length; index += 100) {
    const { data, error } = await admin.from('asignaciones_profesor').select('id')
      .eq('tenant_id', tenantId).eq('activo', true)
      .in('id', assignmentIds.slice(index, index + 100));
    if (error) throw error;
    for (const row of data ?? []) activeAssignments.add(row.id);
  }
  for (let index = 0; index < periodIds.length; index += 100) {
    const { data, error } = await admin.from('periodos_evaluacion').select('id')
      .eq('tenant_id', tenantId).neq('estado', 'borrador')
      .in('id', periodIds.slice(index, index + 100));
    if (error) throw error;
    for (const row of data ?? []) availablePeriods.add(row.id);
  }
  return new Set(links.filter((link) => activeAssignments.has(link.asignacion_profesor_id)
    && availablePeriods.has(link.periodo_evaluacion_id)).map((link) => link.ejercicio_id));
}

async function readExceptions(
  admin: AdminClient,
  tenantId: string,
  from: string,
  to: string,
  teacherId?: string,
): Promise<WeeklyExceptionRow[]> {
  const { data, error } = await admin.from('teacher_activity_weekly_exceptions')
    .select('teacher_id, week_start, kind, note, created_at, updated_at, teacher_started_on')
    .eq('tenant_id', tenantId)
    .gte('week_start', mondayOf(from))
    .lte('week_start', mondayOf(to))
    .order('week_start')
    .limit(3_001);
  if (error) throw error;
  if ((data?.length ?? 0) > 3_000) throw new ReportLimitError('Hay demasiadas excepciones para el periodo solicitado.');
  return (data ?? []).filter((row) => !teacherId || row.teacher_id === teacherId) as WeeklyExceptionRow[];
}

async function readObservedMetrics(
  admin: AdminClient,
  tenantId: string,
  teacherIds: Set<string>,
  from: string,
  to: string,
): Promise<{ submissions: { teacherId: string; occurredAt: string }[]; reviews: { teacherId: string; occurredAt: string }[]; pendingReviews: Record<string, number> }> {
  const { lower, upper } = timeQueryBounds(from, to);
  type Submission = RowWithId & { ejercicio_id: string; primer_envio_en: string };
  type Review = RowWithId & { calificado_por: string; calificado_at: string };
  type PendingReview = RowWithId & { ejercicio_id: string };
  const [submissionRows, reviewRows, pendingRows] = await Promise.all([
    readPagedById<Submission>('Las entregas', MAX_RESULTS, async (lastId) => {
      let query = admin.from('resultados_ejercicios')
        .select('id, ejercicio_id, primer_envio_en')
        .eq('tenant_id', tenantId)
        .gte('primer_envio_en', lower)
        .lt('primer_envio_en', upper)
        .order('id')
        .limit(PAGE_SIZE);
      if (lastId) query = query.gt('id', lastId);
      return query;
    }),
    readPagedById<Review>('Las revisiones', MAX_RESULTS, async (lastId) => {
      let query = admin.from('resultados_ejercicios')
        .select('id, calificado_por, calificado_at')
        .eq('tenant_id', tenantId)
        .eq('estado', 'calificado')
        .not('calificado_por', 'is', null)
        .gte('calificado_at', lower)
        .lt('calificado_at', upper)
        .order('id')
        .limit(PAGE_SIZE);
      if (lastId) query = query.gt('id', lastId);
      return query;
    }),
    readPagedById<PendingReview>('Las entregas pendientes', MAX_RESULTS, async (lastId) => {
      let query = admin.from('resultados_ejercicios')
        .select('id, ejercicio_id')
        .eq('tenant_id', tenantId)
        .in('estado', ['entregado', 'tardio'])
        .order('id')
        .limit(PAGE_SIZE);
      if (lastId) query = query.gt('id', lastId);
      return query;
    }),
  ]);
  const exerciseIds = [...new Set([...submissionRows, ...pendingRows].map((row) => row.ejercicio_id))];
  if (exerciseIds.length > MAX_EXERCISES) {
    throw new ReportLimitError('Hay demasiadas actividades con entregas; reduce el rango del informe.');
  }
  const exerciseAuthors = new Map<string, { created_by: string | null; tipo: string | null }>();
  for (let index = 0; index < exerciseIds.length; index += 100) {
    const { data, error } = await admin.from('ejercicios')
      .select('id, created_by, tipo')
      .eq('tenant_id', tenantId)
      .in('id', exerciseIds.slice(index, index + 100));
    if (error) throw error;
    for (const exercise of data ?? []) exerciseAuthors.set(exercise.id, exercise);
  }
  const pendingReviews: Record<string, number> = {};
  for (const row of pendingRows) {
    const exercise = exerciseAuthors.get(row.ejercicio_id);
    if (exercise?.tipo !== 'actividad_descriptiva' || !exercise.created_by || !teacherIds.has(exercise.created_by)) continue;
    pendingReviews[exercise.created_by] = (pendingReviews[exercise.created_by] ?? 0) + 1;
  }
  return {
    submissions: submissionRows.flatMap((row) => {
      const exercise = exerciseAuthors.get(row.ejercicio_id);
      return exercise?.tipo === 'actividad_descriptiva' && exercise.created_by && teacherIds.has(exercise.created_by)
        ? [{ teacherId: exercise.created_by, occurredAt: row.primer_envio_en }] : [];
    }),
    reviews: reviewRows.flatMap((row) => teacherIds.has(row.calificado_por)
      ? [{ teacherId: row.calificado_por, occurredAt: row.calificado_at }] : []),
    pendingReviews,
  };
}

async function readTimezoneAndRollout(admin: AdminClient, tenantId: string) {
  const [feature, rollout] = await Promise.all([
    admin.from('tenant_features').select('timezone').eq('tenant_id', tenantId).maybeSingle(),
    admin.from('teacher_activity_tracking_rollouts').select('activated_at').eq('tenant_id', tenantId).single(),
  ]);
  if (feature.error) throw feature.error;
  if (rollout.error || !rollout.data) throw rollout.error ?? new Error('Falta el inicio de captura del tenant.');
  const candidate = feature.data?.timezone || 'America/Mexico_City';
  let timezone = candidate;
  try { new Intl.DateTimeFormat('en-US', { timeZone: candidate }); }
  catch { timezone = 'America/Mexico_City'; }
  return { timezone, trackingStartedAt: rollout.data.activated_at as string };
}

function includeRetiredPublicationAuthors(
  currentTeachers: TeacherRow[],
  publications: PublicationRow[],
): TeacherRow[] {
  const knownIds = new Set(currentTeachers.map((teacher) => teacher.id));
  const teachers = [...currentTeachers];
  for (const publication of publications) {
    if (knownIds.has(publication.credited_teacher_id)) continue;
    knownIds.add(publication.credited_teacher_id);
    teachers.push({
      id: publication.credited_teacher_id,
      nombre: 'Docente retirado',
      apellidos: null,
      email: null,
      estatus: 'retirado',
      hasActiveAssignment: false,
    });
  }
  if (teachers.length > MAX_TEACHERS) {
    throw new ReportLimitError(`La lista de docentes supera el límite de ${MAX_TEACHERS} registros; reduce el rango del informe.`);
  }
  return teachers;
}

export async function loadTeacherActivityAuditAction(
  input?: { from?: string; to?: string },
): Promise<ActionResult<TeacherActivityAuditReport>> {
  try {
    const { admin, tenantId, tenant } = await requireTenantSession(['admin', 'superuser']);
    const generatedAt = new Date().toISOString();
    const { timezone, trackingStartedAt } = await readTimezoneAndRollout(admin, tenantId);
    const today = localDate(generatedAt, timezone);
    const pilotWindow = pilotWindowForTenant(tenant.slug, today);
    const { from, to } = parseDateRange(input, today);
    const [currentTeachers, publications, exceptions, assignedTeachers] = await Promise.all([
      readTeachers(admin, tenantId),
      readPublications(admin, tenantId, from, to),
      readExceptions(admin, tenantId, from, to),
      readActiveAssignmentTeachers(admin, tenantId),
    ]);
    for (const teacher of currentTeachers) teacher.hasActiveAssignment = assignedTeachers.has(teacher.id);
    // An author may later be deactivated, deleted, or changed to another role.
    // The immutable event still belongs in a historical audit export.
    const teachers = includeRetiredPublicationAuthors(currentTeachers, publications);
    const [metrics, pilotResult] = await Promise.all([
      readObservedMetrics(admin, tenantId, new Set(teachers.map((teacher) => teacher.id)), from, to),
      pilotWindow ? (async () => {
        const [pilotPublications, pilotExceptions] = await Promise.all([
          readPublications(admin, tenantId, pilotWindow.from, pilotWindow.through),
          readExceptions(admin, tenantId, pilotWindow.from, pilotWindow.through),
        ]);
        const pilotTeachers = includeRetiredPublicationAuthors(currentTeachers, pilotPublications);
        const exerciseRows = await readPilotExerciseRows(
          admin, tenantId, pilotWindow.from, pilotWindow.through, pilotPublications,
        );
        const visibleExerciseIds = await readVisiblePilotExerciseIds(admin, tenantId, exerciseRows);
        return {
          data: buildPilotTeacherActivityReport({
            ...pilotWindow,
            asOf: generatedAt,
            timezone,
            teachers: pilotTeachers,
            exerciseRows,
            visibleExerciseIds,
            publications: pilotPublications,
            exceptions: pilotExceptions,
          }),
          error: null as string | null,
        };
      })().catch((error) => ({
        data: null,
        error: errorMessage(error, 'No se pudo reconstruir el corte piloto.'),
      })) : Promise.resolve({ data: null, error: null }),
    ]);
    return {
      ok: true,
      data: {
        ...buildTeacherActivityAuditReport({
        generatedAt,
        tenantId,
        tenantName: tenant.nombre,
        timezone,
        from,
        to,
        trackingStartedAt,
        teachers,
        publications,
        submissions: metrics.submissions,
        reviews: metrics.reviews,
        pendingReviews: metrics.pendingReviews,
        exceptions,
        }),
        pilot: pilotResult.data,
        pilotError: pilotResult.error,
      },
    };
  } catch (error) {
    return { ok: false, message: errorMessage(error, 'No se pudo cargar el informe semanal de docentes.') };
  }
}

async function countPendingReviews(admin: AdminClient, tenantId: string, teacherId: string): Promise<number> {
  const exercises = await readPagedById<RowWithId>('Las actividades del docente', MAX_EXERCISES, async (lastId) => {
    let query = admin.from('ejercicios').select('id')
      .eq('tenant_id', tenantId)
      .eq('created_by', teacherId)
      .eq('tipo', 'actividad_descriptiva')
      .order('id')
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    return query;
  });
  let total = 0;
  for (let index = 0; index < exercises.length; index += 100) {
    const { count, error } = await admin.from('resultados_ejercicios')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('ejercicio_id', exercises.slice(index, index + 100).map((row) => row.id))
      .in('estado', ['entregado', 'tardio']);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

export async function loadMyWeeklyTeacherGoalAction(): Promise<ActionResult<MyWeeklyTeacherGoal>> {
  try {
    const { admin, tenantId, tenant, user } = await requireTenantSession(['profesor']);
    const generatedAt = new Date().toISOString();
    const { timezone, trackingStartedAt } = await readTimezoneAndRollout(admin, tenantId);
    const today = localDate(generatedAt, timezone);
    const weekStart = mondayOf(today);
    const [publications, exceptions, pendingReviews, assignment, teacherResult] = await Promise.all([
      readPublications(admin, tenantId, weekStart, today, user.id),
      readExceptions(admin, tenantId, weekStart, today, user.id),
      countPendingReviews(admin, tenantId, user.id),
      admin.from('asignaciones_profesor').select('id').eq('tenant_id', tenantId)
        .eq('profesor_id', user.id).eq('activo', true).limit(1).maybeSingle(),
      admin.from('profiles').select('id,nombre,apellidos,email,estatus,created_at')
        .eq('tenant_id', tenantId).eq('id', user.id).single(),
    ]);
    if (assignment.error) throw assignment.error;
    if (teacherResult.error || !teacherResult.data) throw teacherResult.error ?? new Error('Perfil no encontrado');
    const report = buildTeacherActivityAuditReport({
      generatedAt,
      tenantId,
      tenantName: tenant.nombre,
      timezone,
      from: weekStart,
      to: today,
      trackingStartedAt,
      teachers: [{ ...teacherResult.data, hasActiveAssignment: Boolean(assignment.data) } as TeacherRow],
      publications,
      submissions: [],
      reviews: [],
      exceptions,
    });
    const week = report.teachers[0].weeks[0];
    const status = week.status === 'met' || week.status === 'excused'
      ? week.status : week.status === 'informational' ? 'informational' : 'in_progress';
    return {
      ok: true,
      data: {
        generatedAt,
        week: report.currentWeek,
        trackingStartedAt,
        published: week.published,
        target: week.target,
        remaining: Math.max(0, week.target - week.published),
        status,
        nonApplicableReason: week.nonApplicableReason,
        exception: week.exception,
        evidence: week.evidence,
        pendingReviews,
        note: week.exception
          ? 'La institución registró una excepción para esta semana. Las publicaciones visibles siguen mostrándose.'
          : week.nonApplicableReason === 'no_assignment'
            ? 'No tienes materias activas asignadas; esta semana no se clasifica como incumplimiento.'
          : week.nonApplicableReason === 'registration_week'
            ? 'Tu perfil se incorporó durante esta semana; el seguimiento es informativo.'
          : week.nonApplicableReason
            ? 'Esta semana no se clasifica como incumplimiento.'
          : status === 'informational'
            ? 'Esta semana comenzó antes de contar con evidencia completa; el conteo es informativo.'
            : 'La meta cuenta primeras publicaciones visibles para alumnos; revisar entregas es una métrica aparte.',
      },
    };
  } catch (error) {
    return { ok: false, message: errorMessage(error, 'No se pudo cargar la meta semanal.') };
  }
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validateExceptionInput(input: {
  teacherId: string;
  weekStart: string;
  kind: TeacherWeeklyExceptionKind;
  note?: string;
  teacherStartedOn?: string | null;
}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.teacherId)) {
    throw new Error('Selecciona un docente válido.');
  }
  if (!validDate(input.weekStart) || mondayOf(input.weekStart) !== input.weekStart) {
    throw new Error('Selecciona el lunes de una semana válida.');
  }
  if (!(['vacaciones', 'ausencia_autorizada', 'ingreso_tardio', 'otra'] as string[]).includes(input.kind)) {
    throw new Error('Selecciona un motivo de excepción válido.');
  }
  const note = (input.note ?? '').trim();
  if (note.length > 500 || (input.kind === 'otra' && !note)) {
    throw new Error('Escribe una nota de hasta 500 caracteres para la excepción.');
  }
  const startedOn = input.teacherStartedOn ?? null;
  if (input.kind === 'ingreso_tardio') {
    if (!startedOn || !validDate(startedOn) || startedOn < input.weekStart || startedOn > addDays(input.weekStart, 6)) {
      throw new Error('Indica la fecha de ingreso dentro de la semana seleccionada.');
    }
  } else if (startedOn) {
    throw new Error('La fecha de ingreso sólo aplica al ingreso a media semana.');
  }
  return { note, startedOn };
}

export async function setTeacherWeeklyExceptionAction(input: {
  teacherId: string;
  weekStart: string;
  kind: TeacherWeeklyExceptionKind;
  note?: string;
  teacherStartedOn?: string | null;
}): Promise<MutationResult> {
  try {
    const { admin, tenantId, user } = await requireTenantSession(['admin', 'superuser']);
    const { note, startedOn } = validateExceptionInput(input);
    const { data: teacher, error: teacherError } = await admin.from('profiles')
      .select('id')
      .eq('id', input.teacherId)
      .eq('tenant_id', tenantId)
      .eq('rol', 'profesor')
      .maybeSingle();
    if (teacherError) throw teacherError;
    if (!teacher) throw new Error('Selecciona un docente de esta institución.');
    const { error } = await admin.from('teacher_activity_weekly_exceptions').upsert({
      tenant_id: tenantId,
      teacher_id: input.teacherId,
      week_start: input.weekStart,
      kind: input.kind,
      note,
      teacher_started_on: startedOn,
      authorized_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,teacher_id,week_start' });
    if (error) throw error;
    revalidatePath('/dashboard/admin/auditoria');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, 'No se pudo guardar la excepción semanal.') };
  }
}

export async function clearTeacherWeeklyExceptionAction(input: {
  teacherId: string;
  weekStart: string;
}): Promise<MutationResult> {
  try {
    const { admin, tenantId } = await requireTenantSession(['admin', 'superuser']);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.teacherId)
      || !validDate(input.weekStart) || mondayOf(input.weekStart) !== input.weekStart) {
      throw new Error('Selecciona un docente y una semana válidos.');
    }
    const { error } = await admin.from('teacher_activity_weekly_exceptions')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('teacher_id', input.teacherId)
      .eq('week_start', input.weekStart);
    if (error) throw error;
    revalidatePath('/dashboard/admin/auditoria');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, 'No se pudo quitar la excepción semanal.') };
  }
}
