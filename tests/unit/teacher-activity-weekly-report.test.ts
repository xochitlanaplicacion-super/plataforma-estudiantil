import { describe, expect, it } from 'vitest';
import {
  buildTeacherActivityAuditReport,
  buildWeeks,
  localDate,
  parseDateRange,
  type PublicationRow,
} from '@/lib/teacher-activity/weekly-report';

const teacher = {
  id: 'teacher-1',
  nombre: 'Ana',
  apellidos: 'López',
  email: 'ana@example.edu',
  estatus: 'activo',
};

function event(id: string, publishedAt: string, logicalId = id): PublicationRow {
  return {
    id,
    logical_activity_id: logicalId,
    exercise_id: `exercise-${id}`,
    credited_teacher_id: teacher.id,
    published_at: publishedAt,
    title: `Actividad ${id}`,
    activity_type: 'actividad_descriptiva',
    subject_name: 'Inglés 1',
    due_at: null,
    group_ids: ['group-1'],
    group_names: ['Primero A'],
  };
}

function report(overrides: Partial<Parameters<typeof buildTeacherActivityAuditReport>[0]> = {}) {
  return buildTeacherActivityAuditReport({
    generatedAt: '2026-10-20T12:00:00.000Z',
    tenantId: 'tenant-1',
    tenantName: 'Escuela',
    timezone: 'America/Mexico_City',
    from: '2026-09-21',
    to: '2026-10-18',
    trackingStartedAt: '2026-09-30T12:00:00.000Z',
    teachers: [teacher],
    publications: [],
    submissions: [],
    reviews: [],
    exceptions: [],
    ...overrides,
  });
}

describe('teacher weekly activity report', () => {
  it('uses the tenant calendar day before assigning a UTC timestamp to a week', () => {
    expect(localDate('2026-10-05T03:00:00.000Z', 'America/Mexico_City')).toBe('2026-10-04');
    const result = report({
      publications: [event('a', '2026-10-05T03:00:00.000Z')],
    });
    expect(result.teachers[0].weeks.find((week) => week.weekStart === '2026-09-28')?.published).toBe(1);
    expect(result.teachers[0].weeks.find((week) => week.weekStart === '2026-10-05')?.published).toBe(0);
  });

  it('marks pre-rollout and rollout weeks informational, including zero-event weeks', () => {
    const weeks = buildWeeks(
      '2026-09-21', '2026-10-18', '2026-10-20',
      '2026-09-30T12:00:00.000Z', 'America/Mexico_City',
    );
    expect(weeks.map((week) => week.eligibility)).toEqual([
      'historical', 'rollout', 'tracked', 'tracked',
    ]);
    const result = report();
    expect(result.teachers[0].weeks.map((week) => week.status)).toEqual([
      'informational', 'informational', 'below_goal', 'below_goal',
    ]);
    expect(result.teachers[0].weeks[0].studentSubmissions).toBeNull();
    expect(result.teachers[0].weeks[1].teacherReviews).toBeNull();
    expect(result.teachers[0].trackedWeeks).toBe(2);
  });

  it('counts a logical publication once and never counts submissions or reviews toward the goal', () => {
    const result = report({
      publications: [
        event('a', '2026-10-06T15:00:00.000Z', 'logical-a'),
        event('copy-a', '2026-10-07T15:00:00.000Z', 'logical-a'),
        event('b', '2026-10-08T15:00:00.000Z'),
        event('c', '2026-10-09T15:00:00.000Z'),
      ],
      submissions: Array.from({ length: 10 }, () => ({
        teacherId: teacher.id,
        occurredAt: '2026-10-08T15:00:00.000Z',
      })),
      reviews: Array.from({ length: 4 }, () => ({
        teacherId: teacher.id,
        occurredAt: '2026-10-08T15:00:00.000Z',
      })),
      pendingReviews: { [teacher.id]: 3 },
    });
    const week = result.teachers[0].weeks[2];
    expect(week).toMatchObject({
      published: 3,
      target: 3,
      status: 'met',
      studentSubmissions: 10,
      teacherReviews: 4,
    });
    expect(week.evidence).toHaveLength(3);
    expect(week.evidence[0].groupNames).toEqual(['Primero A']);
    expect(week.evidence[0].subjectName).toBe('Inglés 1');
    expect(result.teachers[0].pendingReviews).toBe(3);
  });

  it('preserves evidence but exempts an authorized week from compliance denominators', () => {
    const result = report({
      publications: [event('a', '2026-10-13T15:00:00.000Z')],
      exceptions: [{
        teacher_id: teacher.id,
        week_start: '2026-10-12',
        kind: 'ingreso_tardio',
        note: 'Ingresó el miércoles',
        teacher_started_on: '2026-10-14',
        created_at: '2026-10-12T16:00:00.000Z',
        updated_at: '2026-10-13T16:00:00.000Z',
      }],
    });
    const week = result.teachers[0].weeks[3];
    expect(week.status).toBe('excused');
    expect(week.published).toBe(1);
    expect(week.exception).toMatchObject({
      kind: 'ingreso_tardio',
      teacherStartedOn: '2026-10-14',
      authorizedAt: '2026-10-13T16:00:00.000Z',
    });
    expect(result.teachers[0].trackedWeeks).toBe(1);
  });

  it('does not certify a selected partial week or a week still in progress', () => {
    const partial = buildWeeks('2026-10-07', '2026-10-18', '2026-10-20',
      '2026-09-30T12:00:00.000Z', 'America/Mexico_City');
    expect(partial[0].eligibility).toBe('partial_range');
    const current = buildWeeks('2026-10-19', '2026-10-20', '2026-10-20',
      '2026-09-30T12:00:00.000Z', 'America/Mexico_City');
    expect(current[0].eligibility).toBe('in_progress');
  });

  it('does not mark retired, unassigned or newly registered teachers as below goal', () => {
    const retired = report({ teachers: [{ ...teacher, estatus: 'inactivo', hasActiveAssignment: false }] });
    expect(retired.teachers[0].weeks[2]).toMatchObject({ status: 'informational', nonApplicableReason: 'inactive' });
    expect(retired.teachers[0].trackedWeeks).toBe(0);

    const unassigned = report({ teachers: [{ ...teacher, hasActiveAssignment: false }] });
    expect(unassigned.teachers[0].weeks[2]).toMatchObject({ status: 'informational', nonApplicableReason: 'no_assignment' });

    const newcomer = report({ teachers: [{ ...teacher, created_at: '2026-10-07T12:00:00.000Z' }] });
    expect(newcomer.teachers[0].weeks[2]).toMatchObject({ status: 'informational', nonApplicableReason: 'registration_week' });
    expect(newcomer.teachers[0].weeks[1]).toMatchObject({ status: 'informational', nonApplicableReason: 'before_registration' });
  });

  it('rejects invalid, unpaired, future and oversized ranges', () => {
    expect(() => parseDateRange({ from: '2026-02-30', to: '2026-03-01' }, '2026-10-20')).toThrow();
    expect(() => parseDateRange({ from: '2026-10-01' }, '2026-10-20')).toThrow();
    expect(() => parseDateRange({ from: '2026-10-19', to: '2026-10-21' }, '2026-10-20')).toThrow();
    expect(() => parseDateRange({ from: '2025-01-01', to: '2026-10-20' }, '2026-10-20')).toThrow();
  });
});
