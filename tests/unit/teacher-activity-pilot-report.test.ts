import { describe, expect, it } from 'vitest';
import { mondayOf, type PublicationRow } from '@/lib/teacher-activity/weekly-report';
import {
  buildPilotTeacherActivityReport,
  pilotWindowForTenant,
  type PilotExerciseRow,
} from '@/lib/teacher-activity/pilot-report';

const teacher = {
  id: 'teacher-a', nombre: 'Ana', apellidos: 'López', email: 'ana@example.edu',
  estatus: 'activo', hasActiveAssignment: true,
};

function exercise(input: Partial<PilotExerciseRow> & Pick<PilotExerciseRow, 'id' | 'created_at'>): PilotExerciseRow {
  return {
    sync_id: null,
    created_by: teacher.id,
    titulo: input.id,
    tipo: 'actividad_descriptiva',
    publicado: true,
    visible: true,
    ...input,
  };
}

function publication(logicalId: string, publishedAt: string): PublicationRow {
  return {
    id: `event-${logicalId}`,
    logical_activity_id: logicalId,
    exercise_id: `exercise-${logicalId}`,
    credited_teacher_id: teacher.id,
    published_at: publishedAt,
    title: logicalId,
    activity_type: 'actividad_descriptiva',
    subject_name: 'Inglés',
    due_at: null,
    group_ids: [],
    group_names: [],
  };
}

describe('corte preliminar docente', () => {
  it('keeps 27 September in the pilot even though it is a Sunday, without changing official weeks', () => {
    expect(mondayOf('2026-09-27')).toBe('2026-09-21');
    expect(pilotWindowForTenant('xochitlan', '2026-09-30')).toEqual({ from: '2026-09-27', through: '2026-09-30' });
    expect(pilotWindowForTenant('xochitlan', '2026-10-10')).toEqual({ from: '2026-09-27', through: '2026-10-04' });
    expect(pilotWindowForTenant('another-school', '2026-09-30')).toBeNull();
  });

  it('deduplicates copies and excludes a newly copied activity whose original predates the pilot', () => {
    const report = buildPilotTeacherActivityReport({
      from: '2026-09-27', through: '2026-09-30', asOf: '2026-10-01T04:00:00Z',
      timezone: 'America/Mexico_City',
      teachers: [teacher, { ...teacher, id: 'teacher-b', nombre: 'Bea', hasActiveAssignment: true }],
      exerciseRows: [
        exercise({ id: 'new-original', sync_id: 'new-sync', created_at: '2026-09-27T18:00:00Z' }),
        exercise({ id: 'new-copy', sync_id: 'new-sync', created_at: '2026-09-29T18:00:00Z' }),
        exercise({ id: 'old-original', sync_id: 'old-sync', created_at: '2026-09-26T18:00:00Z' }),
        exercise({ id: 'old-copy', sync_id: 'old-sync', created_at: '2026-09-29T19:00:00Z' }),
        exercise({ id: 'draft', created_at: '2026-09-30T18:00:00Z', publicado: false }),
        exercise({ id: 'pre-local-day', created_at: '2026-09-27T04:00:00Z' }),
      ],
      visibleExerciseIds: new Set(['new-copy', 'old-copy']),
      publications: [publication('older-activity-published-now', '2026-09-30T18:00:00Z')],
    });
    expect(report.teachers[0]).toMatchObject({
      createdExisting: 2,
      visibleNow: 1,
      verifiedPublications: 1,
      status: 'visible_now',
    });
    expect(report.teachers[0].evidence.map((item) => item.logicalId)).toEqual(['new-sync', 'draft']);
    expect(report.teachers[1]).toMatchObject({
      createdExisting: 0,
      visibleNow: 0,
      verifiedPublications: 0,
      status: 'no_current_evidence',
    });
  });

  it('separates previously created tasks published now, current hidden tasks, and non-applicable teachers', () => {
    const report = buildPilotTeacherActivityReport({
      from: '2026-09-27', through: '2026-10-04', asOf: '2026-10-01T04:00:00Z',
      timezone: 'America/Mexico_City',
      teachers: [teacher, { ...teacher, id: 'teacher-c', estatus: 'inactivo' }],
      exerciseRows: [
        exercise({ id: 'hidden', created_at: '2026-09-28T18:00:00Z', visible: false }),
        exercise({ id: 'outside-owner', created_by: 'admin-id', created_at: '2026-09-29T18:00:00Z' }),
      ],
      visibleExerciseIds: new Set(),
      publications: [publication('older-activity-published-now', '2026-09-30T18:00:00Z')],
    });
    expect(report.teachers[0]).toMatchObject({
      createdExisting: 1,
      visibleNow: 0,
      verifiedPublications: 1,
      status: 'published_then_hidden',
    });
    expect(report.teachers[1].status).toBe('not_applicable');
    expect(report.unattributed.map((item) => item.exerciseId)).toEqual(['outside-owner']);
  });

  it('flags contradictory current authors among synchronized copies', () => {
    const report = buildPilotTeacherActivityReport({
      from: '2026-09-27', through: '2026-09-30', asOf: '2026-10-01T04:00:00Z',
      timezone: 'America/Mexico_City', teachers: [teacher],
      exerciseRows: [
        exercise({ id: 'one', sync_id: 'sync', created_at: '2026-09-27T18:00:00Z' }),
        exercise({ id: 'two', sync_id: 'sync', created_by: 'teacher-b', created_at: '2026-09-28T18:00:00Z' }),
      ],
      visibleExerciseIds: new Set(['one']), publications: [],
    });
    expect(report.teachers[0].evidence[0].mixedCurrentAuthors).toBe(true);
  });

  it('does not present a new teacher or a justified week as ordinary missing activity', () => {
    const report = buildPilotTeacherActivityReport({
      from: '2026-09-27', through: '2026-09-30', asOf: '2026-10-01T04:00:00Z',
      timezone: 'America/Mexico_City',
      teachers: [
        { ...teacher, id: 'new', created_at: '2026-09-29T18:00:00Z' },
        { ...teacher, id: 'excused' },
      ],
      exerciseRows: [], visibleExerciseIds: new Set(), publications: [],
      exceptions: [{
        teacher_id: 'excused', week_start: '2026-09-28', kind: 'ausencia_autorizada',
        note: 'Permiso institucional', created_at: '2026-09-28T18:00:00Z',
        updated_at: '2026-09-28T18:00:00Z', teacher_started_on: null,
      }],
    });
    expect(report.teachers.find((row) => row.teacherId === 'new')?.status).toBe('joined_during_pilot');
    expect(report.teachers.find((row) => row.teacherId === 'excused')?.status).toBe('exception_review');
  });
});
