import { describe, expect, it } from 'vitest';
import { summarizeStudentPlatformWork } from '@/lib/academic/teacher-work-summary';

describe('summarizeStudentPlatformWork', () => {
  it('promedia tareas calificadas por alumno aunque no tengan criterio con peso', () => {
    const result = summarizeStudentPlatformWork([
      { enrollmentId: 'b', studentName: 'Zoe', grade: 8, state: 'calificado' },
      { enrollmentId: 'a', studentName: 'Ana', grade: 0, state: 'calificado' },
      { enrollmentId: 'a', studentName: 'Ana', grade: 10, state: 'calificado' },
      { enrollmentId: 'a', studentName: 'Ana', grade: null, state: 'entregado' },
    ]);

    expect(result).toEqual([
      { enrollmentId: 'a', studentName: 'Ana', resultCount: 3, gradedCount: 2, averageGrade: 5 },
      { enrollmentId: 'b', studentName: 'Zoe', resultCount: 1, gradedCount: 1, averageGrade: 8 },
    ]);
  });

  it('no convierte entregas pendientes en ceros ni inventa promedio', () => {
    expect(summarizeStudentPlatformWork([
      { enrollmentId: 'a', studentName: 'Ana', grade: null, state: 'entregado' },
      { enrollmentId: 'a', studentName: 'Ana', grade: null, state: 'pendiente' },
    ])).toEqual([
      { enrollmentId: 'a', studentName: 'Ana', resultCount: 2, gradedCount: 0, averageGrade: null },
    ]);
  });

  it('ignora notas no calificadas o no finitas', () => {
    expect(summarizeStudentPlatformWork([
      { enrollmentId: 'a', studentName: 'Ana', grade: 9, state: 'entregado' },
      { enrollmentId: 'a', studentName: 'Ana', grade: Number.NaN, state: 'calificado' },
      { enrollmentId: 'a', studentName: 'Ana', grade: 7, state: 'calificado' },
    ])[0]).toEqual({
      enrollmentId: 'a', studentName: 'Ana', resultCount: 3, gradedCount: 1, averageGrade: 7,
    });
  });
});
