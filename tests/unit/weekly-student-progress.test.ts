import { describe, expect, it } from 'vitest';
import { getStudentWeeklyProgress, isDeliveredStudentResult } from '@/lib/academic/weekly-student-progress';

describe('avance semanal privado del alumno', () => {
  it('usa lunes a domingo en la zona del plantel y excluye actividades sin fecha', () => {
    const progress = getStudentWeeklyProgress([
      { fecha_entrega: '2026-09-28', haEntregado: true },
      { fecha_entrega: '2026-10-04', haEntregado: false },
      { fecha_entrega: '2026-10-05', haEntregado: true },
      { fecha_entrega: null, haEntregado: true },
    ], new Date('2026-10-05T04:30:00.000Z'), 'America/Mexico_City');

    expect(progress).toEqual({ weekStart: '2026-09-28', weekEnd: '2026-10-04', completed: 1, total: 2 });
  });

  it('cuenta cero explícito como entrega y no un resultado sin capturar', () => {
    expect(isDeliveredStudentResult({ estado: 'calificado', calificacion: 0 })).toBe(true);
    expect(isDeliveredStudentResult({ estado: null, calificacion: 0 })).toBe(true);
    expect(isDeliveredStudentResult({ estado: 'sin_capturar', calificacion: null })).toBe(false);
    expect(isDeliveredStudentResult({ estado: 'pendiente', calificacion: null })).toBe(false);
    const progress = getStudentWeeklyProgress([
      { fecha_entrega: '2026-09-30T23:59:00', haEntregado: true },
      { fecha_entrega: '2026-10-01T23:59:00', haEntregado: false },
    ], new Date('2026-09-30T18:00:00.000Z'), 'America/Mexico_City');

    expect(progress.completed).toBe(1);
    expect(progress.total).toBe(2);
  });
});
