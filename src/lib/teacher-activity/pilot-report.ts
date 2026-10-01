import { addDays, localDate, type PublicationRow, type TeacherRow, type WeeklyExceptionRow } from './weekly-report';

// Exceptional trial window requested by this school. It is separate from the
// normal Monday–Sunday goal and never manufactures publication events.
export const XOCHITLAN_TEACHER_PILOT = {
  from: '2026-09-27',
  through: '2026-10-04',
} as const;

export interface PilotExerciseRow {
  id: string;
  sync_id: string | null;
  created_by: string | null;
  created_at: string | null;
  titulo: string;
  tipo: string | null;
}

export interface PilotActivityEvidence {
  logicalId: string;
  exerciseId: string;
  title: string;
  activityType: string | null;
  createdAt: string;
  visibleNow: boolean;
  currentAuthorId: string | null;
  mixedCurrentAuthors: boolean;
  possibleCopy: boolean;
}

export type PilotTeacherStatus =
  | 'visible_now'
  | 'published_then_hidden'
  | 'created_not_visible'
  | 'copy_review'
  | 'joined_during_pilot'
  | 'exception_review'
  | 'no_current_evidence'
  | 'not_applicable';

export interface PilotTeacherActivity {
  teacherId: string;
  name: string;
  email: string;
  status: PilotTeacherStatus;
  createdExisting: number;
  visibleNow: number;
  verifiedPublications: number;
  evidence: PilotActivityEvidence[];
}

export interface PilotTeacherActivityReport {
  from: string;
  through: string;
  asOf: string;
  timezone: string;
  teachers: PilotTeacherActivity[];
  unattributed: PilotActivityEvidence[];
  caveat: string;
}

export function pilotWindowForTenant(slug: string, today: string) {
  if (slug !== 'xochitlan' || today < XOCHITLAN_TEACHER_PILOT.from) return null;
  return {
    from: XOCHITLAN_TEACHER_PILOT.from,
    through: today < XOCHITLAN_TEACHER_PILOT.through ? today : XOCHITLAN_TEACHER_PILOT.through,
  };
}

/** Reconstructs only surviving creation rows; never calls them publication dates. */
export function buildPilotTeacherActivityReport(input: {
  from: string;
  through: string;
  asOf: string;
  timezone: string;
  teachers: TeacherRow[];
  exerciseRows: PilotExerciseRow[];
  visibleExerciseIds: ReadonlySet<string>;
  publications: PublicationRow[];
  exceptions?: WeeklyExceptionRow[];
}): PilotTeacherActivityReport {
  const knownTeachers = new Set(input.teachers.map((teacher) => teacher.id));
  const byLogical = new Map<string, PilotExerciseRow[]>();
  for (const row of input.exerciseRows) {
    const logicalId = row.sync_id || row.id;
    const siblings = byLogical.get(logicalId) ?? [];
    siblings.push(row);
    byLogical.set(logicalId, siblings);
  }

  const evidence: PilotActivityEvidence[] = [];
  for (const [logicalId, siblings] of byLogical) {
    const dated = siblings.filter((row) => row.created_at && !Number.isNaN(Date.parse(row.created_at)))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
    if (!dated.length) continue;
    const original = dated[0];
    const createdAt = original.created_at!;
    const localCreated = localDate(createdAt, input.timezone);
    if (localCreated < input.from || localCreated > input.through || createdAt > input.asOf) continue;
    const currentAuthors = new Set(siblings.map((row) => row.created_by).filter(Boolean));
    const possibleCopy = original.sync_id !== null
      && !siblings.some((row) => row.id === logicalId);
    evidence.push({
      logicalId,
      exerciseId: original.id,
      title: original.titulo,
      activityType: original.tipo,
      createdAt,
      visibleNow: siblings.some((row) => input.visibleExerciseIds.has(row.id)),
      currentAuthorId: original.created_by,
      mixedCurrentAuthors: currentAuthors.size > 1,
      possibleCopy,
    });
  }
  evidence.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.logicalId.localeCompare(b.logicalId));

  const verified = new Map<string, Set<string>>();
  const currentLogicalByExerciseId = new Map(input.exerciseRows
    .map((row) => [row.id, row.sync_id || row.id] as const));
  const visibleLogicalIds = new Set(input.exerciseRows
    .filter((row) => input.visibleExerciseIds.has(row.id))
    .flatMap((row) => row.sync_id ? [row.id, row.sync_id] : [row.id]));
  const visibleVerified = new Map<string, Set<string>>();
  for (const event of input.publications) {
    const day = localDate(event.published_at, input.timezone);
    if (day < input.from || day > input.through || event.published_at > input.asOf) continue;
    const logical = verified.get(event.credited_teacher_id) ?? new Set<string>();
    logical.add(event.logical_activity_id);
    verified.set(event.credited_teacher_id, logical);
    if (input.visibleExerciseIds.has(event.exercise_id) || visibleLogicalIds.has(event.logical_activity_id)) {
      const visible = visibleVerified.get(event.credited_teacher_id) ?? new Set<string>();
      visible.add(currentLogicalByExerciseId.get(event.exercise_id) ?? event.logical_activity_id);
      visibleVerified.set(event.credited_teacher_id, visible);
    }
  }

  const teachers = input.teachers.map((teacher): PilotTeacherActivity => {
    const own = evidence.filter((row) => row.currentAuthorId === teacher.id);
    const identifiableCreations = own.filter((row) => !row.possibleCopy);
    const visibleActivities = new Set(own.filter((row) => row.visibleNow).map((row) => row.logicalId));
    for (const logicalId of visibleVerified.get(teacher.id) ?? []) visibleActivities.add(logicalId);
    const visibleNow = visibleActivities.size;
    const verifiedPublications = verified.get(teacher.id)?.size ?? 0;
    const registeredDay = teacher.created_at ? localDate(teacher.created_at, input.timezone) : null;
    const joinedAfterPilot = registeredDay !== null && registeredDay > input.through;
    const joinedDuringPilot = registeredDay !== null && registeredDay > input.from
      && registeredDay <= input.through;
    const hasException = input.exceptions?.some((exception) => exception.teacher_id === teacher.id
      && exception.week_start <= input.through
      && addDays(exception.week_start, 6) >= input.from) ?? false;
    const status: PilotTeacherStatus = teacher.estatus !== 'activo' || teacher.hasActiveAssignment === false || joinedAfterPilot
      ? 'not_applicable'
      : visibleNow > 0 ? 'visible_now'
        : verifiedPublications > 0 ? 'published_then_hidden'
          : identifiableCreations.length > 0 ? 'created_not_visible'
            : own.length > 0 ? 'copy_review'
              : hasException ? 'exception_review'
                : joinedDuringPilot ? 'joined_during_pilot'
                  : 'no_current_evidence';
    return {
      teacherId: teacher.id,
      name: [teacher.nombre, teacher.apellidos].filter(Boolean).join(' ').trim() || teacher.email || teacher.id,
      email: teacher.email ?? '',
      status,
      createdExisting: identifiableCreations.length,
      visibleNow,
      verifiedPublications,
      evidence: own,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return {
    from: input.from,
    through: input.through,
    asOf: input.asOf,
    timezone: input.timezone,
    teachers,
    unattributed: evidence.filter((row) => !row.currentAuthorId || !knownTeachers.has(row.currentAuthorId)),
    caveat: 'Corte preliminar, distinto de la meta oficial de 3 publicaciones por semana. «Creadas» cuenta originales identificables que aún existen; las posibles copias sin origen localizable se muestran aparte y no se suman. Una copia sin vínculo de sincronización puede parecer una creación. «Con vínculo hoy» indica acceso directo del alumno mediante evaluación activa, no presencia en su catálogo: una unidad inactiva puede ocultarla. Antes del registro inmutable no puede certificarse cuándo se publicó, y una sustitución docente puede cambiar la autoría actual.',
  };
}
