export const WEEKLY_PUBLICATION_TARGET = 3 as const;

export type TeacherWeeklyExceptionKind =
  | 'vacaciones'
  | 'ausencia_autorizada'
  | 'ingreso_tardio'
  | 'otra';

export interface TeacherWeeklyException {
  kind: TeacherWeeklyExceptionKind;
  note: string;
  authorizedAt: string;
  teacherStartedOn: string | null;
}

export interface TeacherActivityEvidence {
  id: string;
  logicalActivityId: string;
  exerciseId: string;
  title: string;
  publishedAt: string;
  activityType: string | null;
  subjectName: string | null;
  dueAt: string | null;
  groupIds: string[];
  groupNames: string[];
}

export type TeacherWeekEligibility =
  | 'tracked'
  | 'historical'
  | 'rollout'
  | 'in_progress'
  | 'partial_range';

export type TeacherWeekStatus =
  | 'met'
  | 'below_goal'
  | 'in_progress'
  | 'informational'
  | 'excused';

export interface TeacherActivityWeek {
  start: string;
  end: string;
  eligibility: TeacherWeekEligibility;
}

export interface TeacherActivityTeacherWeek {
  weekStart: string;
  weekEnd: string;
  target: typeof WEEKLY_PUBLICATION_TARGET;
  published: number;
  status: TeacherWeekStatus;
  nonApplicableReason: 'inactive' | 'no_assignment' | 'before_registration' | 'registration_week' | null;
  exception: TeacherWeeklyException | null;
  evidence: TeacherActivityEvidence[];
  studentSubmissions: number | null;
  teacherReviews: number | null;
}

export interface TeacherActivityTeacher {
  id: string;
  name: string;
  email: string;
  status: string;
  weeks: TeacherActivityTeacherWeek[];
  totalPublished: number;
  weeksMet: number;
  trackedWeeks: number;
  pendingReviews: number;
  exceptions: string[];
}

export interface TeacherActivityAuditReport {
  generatedAt: string;
  scope: {
    tenantId: string;
    tenantName: string;
    timezone: string;
    from: string;
    to: string;
    trackingStartedAt: string | null;
  };
  currentWeek: { start: string; end: string };
  weeks: TeacherActivityWeek[];
  teachers: TeacherActivityTeacher[];
  pilot?: import('./pilot-report').PilotTeacherActivityReport | null;
  pilotError?: string | null;
  metricNotes: {
    studentSubmissions: string;
    teacherReviews: string;
    pendingReviews: string;
  };
}

export interface MyWeeklyTeacherGoal {
  generatedAt: string;
  week: { start: string; end: string };
  trackingStartedAt: string;
  published: number;
  target: typeof WEEKLY_PUBLICATION_TARGET;
  remaining: number;
  status: 'met' | 'in_progress' | 'informational' | 'excused';
  nonApplicableReason: TeacherActivityTeacherWeek['nonApplicableReason'];
  exception: TeacherWeeklyException | null;
  evidence: TeacherActivityEvidence[];
  pendingReviews: number;
  note: string;
}

export interface TeacherRow {
  id: string;
  nombre: string | null;
  apellidos: string | null;
  email: string | null;
  estatus: string;
  created_at?: string | null;
  hasActiveAssignment?: boolean;
}

export interface PublicationRow {
  id: string;
  logical_activity_id: string;
  exercise_id: string;
  credited_teacher_id: string;
  published_at: string;
  title: string;
  activity_type: string | null;
  subject_name: string | null;
  due_at: string | null;
  group_ids: string[];
  group_names: string[];
}

export interface MetricRow {
  teacherId: string;
  occurredAt: string;
}

export interface WeeklyExceptionRow {
  teacher_id: string;
  week_start: string;
  kind: TeacherWeeklyExceptionKind;
  note: string | null;
  created_at: string;
  updated_at: string;
  teacher_started_on: string | null;
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function localDate(timestamp: string | Date, timezone: string): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error('La fecha de actividad no es válida.');
  let formatter = dateFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatterCache.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const value = (part: string) => parts.find((item) => item.type === part)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  return addDays(day, -(weekday === 0 ? 6 : weekday - 1));
}

export function parseDateRange(
  input: { from?: string; to?: string } | undefined,
  today: string,
): { from: string; to: string } {
  const from = input?.from ?? addDays(mondayOf(today), -49);
  const to = input?.to ?? today;
  for (const value of [from, to]) {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== value) {
      throw new Error('Selecciona fechas válidas en formato AAAA-MM-DD.');
    }
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days < 0) throw new Error('La fecha inicial no puede ser posterior a la final.');
  if (days > 365) throw new Error('Selecciona un rango de hasta 366 días.');
  if (to > today) throw new Error('La fecha final no puede ser futura.');
  if (Boolean(input?.from) !== Boolean(input?.to)) {
    throw new Error('Indica ambas fechas para filtrar el informe.');
  }
  return { from, to };
}

export function buildWeeks(
  from: string,
  to: string,
  today: string,
  trackingStartedAt: string | null,
  timezone: string,
): TeacherActivityWeek[] {
  const trackingDay = trackingStartedAt ? localDate(trackingStartedAt, timezone) : null;
  const weeks: TeacherActivityWeek[] = [];
  for (let start = mondayOf(from); start <= to; start = addDays(start, 7)) {
    const end = addDays(start, 6);
    let eligibility: TeacherWeekEligibility;
    if (!trackingDay || end < trackingDay) eligibility = 'historical';
    else if (start <= trackingDay) eligibility = 'rollout';
    else if (start <= today && today <= end) eligibility = 'in_progress';
    else if (start < from || end > to) eligibility = 'partial_range';
    else eligibility = 'tracked';
    weeks.push({ start, end, eligibility });
  }
  return weeks;
}

export function buildTeacherActivityAuditReport(input: {
  generatedAt: string;
  tenantId: string;
  tenantName: string;
  timezone: string;
  from: string;
  to: string;
  trackingStartedAt: string | null;
  teachers: TeacherRow[];
  publications: PublicationRow[];
  submissions: MetricRow[];
  reviews: MetricRow[];
  pendingReviews?: Record<string, number>;
  exceptions: WeeklyExceptionRow[];
}): TeacherActivityAuditReport {
  const today = localDate(input.generatedAt, input.timezone);
  const weeks = buildWeeks(input.from, input.to, today, input.trackingStartedAt, input.timezone);
  const weekByDay = (day: string) => {
    if (day < input.from || day > input.to) return null;
    return mondayOf(day);
  };
  const publicationMap = new Map<string, TeacherActivityEvidence[]>();
  const seenLogicalIds = new Set<string>();
  for (const row of input.publications) {
    const day = localDate(row.published_at, input.timezone);
    const week = weekByDay(day);
    if (!week) continue;
    const uniqueKey = `${row.credited_teacher_id}:${row.logical_activity_id}`;
    if (seenLogicalIds.has(uniqueKey)) continue;
    seenLogicalIds.add(uniqueKey);
    const key = `${row.credited_teacher_id}:${week}`;
    const current = publicationMap.get(key) ?? [];
    current.push({
      id: row.id,
      logicalActivityId: row.logical_activity_id,
      exerciseId: row.exercise_id,
      title: row.title,
      publishedAt: row.published_at,
      activityType: row.activity_type,
      subjectName: row.subject_name,
      dueAt: row.due_at,
      groupIds: row.group_ids,
      groupNames: row.group_names,
    });
    publicationMap.set(key, current);
  }
  const countMetrics = (rows: MetricRow[]) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const week = weekByDay(localDate(row.occurredAt, input.timezone));
      if (!week) continue;
      const key = `${row.teacherId}:${week}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const submissions = countMetrics(input.submissions);
  const reviews = countMetrics(input.reviews);
  const exceptions = new Map(input.exceptions.map((row) => [`${row.teacher_id}:${row.week_start}`, row]));
  const teachers = input.teachers.map((teacher): TeacherActivityTeacher => {
    const teacherWeeks = weeks.map((week): TeacherActivityTeacherWeek => {
      const key = `${teacher.id}:${week.start}`;
      const evidence = publicationMap.get(key) ?? [];
      const rawException = exceptions.get(key);
      const exception: TeacherWeeklyException | null = rawException ? {
        kind: rawException.kind,
        note: rawException.note ?? '',
        authorizedAt: rawException.updated_at,
        teacherStartedOn: rawException.teacher_started_on,
      } : null;
      const registeredDay = teacher.created_at ? localDate(teacher.created_at, input.timezone) : null;
      const nonApplicableReason = teacher.estatus !== 'activo' ? 'inactive'
        : teacher.hasActiveAssignment === false ? 'no_assignment'
        : registeredDay && week.end < registeredDay ? 'before_registration'
        : registeredDay && week.start <= registeredDay && registeredDay <= week.end ? 'registration_week'
        : null;
      let status: TeacherWeekStatus;
      if (exception) status = 'excused';
      else if (nonApplicableReason) status = 'informational';
      else if (week.eligibility === 'tracked') {
        status = evidence.length >= WEEKLY_PUBLICATION_TARGET ? 'met' : 'below_goal';
      } else if (week.eligibility === 'in_progress') {
        status = evidence.length >= WEEKLY_PUBLICATION_TARGET ? 'met' : 'in_progress';
      } else status = 'informational';
      const metricsAvailable = week.eligibility !== 'historical' && week.eligibility !== 'rollout';
      return {
        weekStart: week.start,
        weekEnd: week.end,
        target: WEEKLY_PUBLICATION_TARGET,
        published: evidence.length,
        status,
        nonApplicableReason,
        exception,
        evidence,
        studentSubmissions: metricsAvailable ? (submissions.get(key) ?? 0) : null,
        teacherReviews: metricsAvailable ? (reviews.get(key) ?? 0) : null,
      };
    });
    const notes: string[] = [];
    if (teacher.estatus !== 'activo') notes.push('El perfil no está activo actualmente; su vigencia histórica requiere revisión administrativa.');
    if (teacher.hasActiveAssignment === false) notes.push('No tiene una asignación activa actualmente; sus semanas no se clasifican como incumplimiento.');
    if (teacherWeeks.some((week) => week.status === 'informational')) {
      notes.push('Las semanas previas a la captura de eventos, de despliegue o parciales son informativas.');
    }
    return {
      id: teacher.id,
      name: [teacher.nombre, teacher.apellidos].filter(Boolean).join(' ').trim() || teacher.email || teacher.id,
      email: teacher.email ?? '',
      status: teacher.estatus,
      weeks: teacherWeeks,
      totalPublished: teacherWeeks.reduce((total, week) => total + week.published, 0),
      weeksMet: teacherWeeks.filter((week) => week.status === 'met' && week.weekEnd < today).length,
      trackedWeeks: teacherWeeks.filter((week) => week.status === 'met' || week.status === 'below_goal').filter((week) => week.weekEnd < today).length,
      pendingReviews: input.pendingReviews?.[teacher.id] ?? 0,
      exceptions: notes,
    };
  });
  const currentStart = mondayOf(today);
  return {
    generatedAt: input.generatedAt,
    scope: {
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      timezone: input.timezone,
      from: input.from,
      to: input.to,
      trackingStartedAt: input.trackingStartedAt,
    },
    currentWeek: { start: currentStart, end: addDays(currentStart, 6) },
    weeks,
    teachers,
    metricNotes: {
      studentSubmissions: 'Entregas descriptivas observadas por fecha de primer envío, atribuidas al responsable actual de la actividad. Si se sustituyó al profesor, esta cifra no reconstruye la autoría histórica; no forma parte de la meta semanal.',
      teacherReviews: 'Resultados actualmente calificados por el docente, agrupados por fecha de calificación; una corrección posterior puede cambiar esta cifra. No es un historial inmutable ni forma parte de la meta.',
      pendingReviews: 'Entregas descriptivas que siguen pendientes de revisión al generar el informe, atribuidas al responsable actual de la actividad. Es un estado actual, no un historial ni parte de la meta semanal.',
    },
  };
}
