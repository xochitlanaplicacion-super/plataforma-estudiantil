import { describe, expect, it } from 'vitest';
import { buildTeacherActivityAuditReport } from '@/lib/teacher-activity/weekly-report';
import { buildTeacherActivityPdf } from '@/lib/reports/teacher-activity-pdf';

describe('PDF de seguimiento docente', () => {
  it('crece en páginas sin comprimir el anexo cuando hay muchas actividades y nombres largos', async () => {
    const report = buildTeacherActivityAuditReport({
      generatedAt: '2026-10-20T18:00:00Z',
      tenantId: 'tenant-1',
      tenantName: 'Colegio de Prueba',
      timezone: 'America/Mexico_City',
      from: '2026-10-05',
      to: '2026-10-18',
      trackingStartedAt: '2026-09-30T18:00:00Z',
      teachers: [{
        id: 'teacher-1',
        nombre: 'María Josefina de los Ángeles',
        apellidos: 'Hernández Rodríguez de la Fuente',
        email: 'docente@example.edu',
        estatus: 'activo',
        hasActiveAssignment: true,
      }],
      publications: Array.from({ length: 40 }, (_, index) => ({
        id: `event-${index}`,
        logical_activity_id: `logical-${index}`,
        exercise_id: `exercise-${index}`,
        credited_teacher_id: 'teacher-1',
        published_at: '2026-10-06T18:00:00Z',
        title: `Actividad detallada número ${index} para revisar conceptos y respuestas de los estudiantes`,
        activity_type: 'actividad_descriptiva',
        subject_name: 'Inglés para todos los grados de secundaria',
        due_at: '2026-10-15T23:59:00Z',
        group_ids: ['group-1'],
        group_names: ['Primero de Secundaria Grupo A'],
      })),
      submissions: [],
      reviews: [],
      pendingReviews: { 'teacher-1': 4 },
      exceptions: [],
    });

    const pdf = await buildTeacherActivityPdf({
      report,
      institution: { name: 'Colegio de Prueba', logoUrl: null },
    });

    expect(pdf.getNumberOfPages()).toBeGreaterThan(5);
    expect(pdf.output('arraybuffer').byteLength).toBeGreaterThan(10_000);
  });
});
