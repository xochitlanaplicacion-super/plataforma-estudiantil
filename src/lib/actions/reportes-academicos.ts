'use server';

import { z } from 'zod';
import { requireTenantSession } from '@/lib/tenant/context';

const assignmentSchema = z.object({
  id: z.string().uuid(),
  subjectName: z.string(),
  groupName: z.string(),
  levelName: z.string(),
  gradeName: z.string(),
});
const attendanceEntry = z.object({
  status: z.enum(['presente', 'ausente']),
  observation: z.string(),
});
const resultEntry = z.object({
  grade: z.number().nullable(),
  state: z.string(),
  participationPoints: z.number(),
  participationCount: z.number(),
});
const conceptGrade = z.object({
  grade: z.number(),
  observation: z.string(),
  updatedAt: z.string(),
});
const reportSchema = z.object({
  generatedAt: z.string(),
  tenant: z.object({
    id: z.string().uuid(),
    name: z.string(),
    logoUrl: z.string().nullable(),
    primaryColor: z.string(),
    secondaryColor: z.string(),
  }),
  teacher: z.object({ id: z.string().uuid(), name: z.string() }),
  cycle: z.object({ id: z.string().uuid(), name: z.string() }),
  period: z.object({
    id: z.string().uuid(),
    name: z.string(),
    startDate: z.string(),
    endDate: z.string(),
  }),
  assignment: z.object({
    id: z.string().uuid(),
    subjectName: z.string(),
    levelName: z.string(),
    gradeName: z.string(),
    groupName: z.string(),
    shift: z.string().nullable(),
  }),
  attendanceDates: z.array(z.string()),
  criteria: z.array(
    z.object({
      key: z.string(),
      criterionId: z.string().uuid(),
      subcriterionId: z.string().uuid().nullable(),
      criterionName: z.string(),
      subcriterionName: z.string().nullable(),
      type: z.string(),
      weight: z.number(),
      internalWeight: z.number().nullable(),
    }),
  ),
  concepts: z.array(
    z.object({
      id: z.string().uuid(),
      criterionKey: z.string(),
      name: z.string(),
      type: z.string(),
      createdAt: z.string(),
    }),
  ),
  students: z.array(
    z.object({
      enrollmentId: z.string().uuid(),
      studentId: z.string().uuid(),
      studentType: z.enum(['registered', 'provisional']),
      provisionalId: z.string().uuid().nullable(),
      name: z.string(),
      enrollmentCode: z.string().nullable(),
      attendance: z.record(z.string(), attendanceEntry),
      results: z.record(z.string(), resultEntry),
      conceptGrades: z.record(z.string(), conceptGrade),
    }),
  ),
});

export type AcademicReport = z.infer<typeof reportSchema>;
export type AcademicReportData = {
  assignments: z.infer<typeof assignmentSchema>[];
  selectedAssignmentId: string | null;
  report: AcademicReport | null;
};

export async function loadAcademicReportAction(input?: unknown): Promise<{ ok: true; data: AcademicReportData } | { ok: false; message: string }> {
  try {
    const session = await requireTenantSession(['profesor']);
    const [contextResult, metadataResult] = await Promise.all([session.supabase.rpc('obtener_contexto_docente_movil'), session.supabase.rpc('obtener_asignaciones_credenciales_docente_movil')]);
    if (contextResult.error) throw contextResult.error;
    if (metadataResult.error) throw metadataResult.error;
    const context = z
      .object({
        assignments: z.array(
          z.object({
            id: z.string().uuid(),
            subjectName: z.string(),
            groupName: z.string(),
          }),
        ),
      })
      .parse(contextResult.data);
    const metadata = z.array(assignmentSchema).parse(metadataResult.data);
    const byId = new Map(metadata.map((row) => [row.id, row]));
    const assignments = context.assignments.map(
      (row) =>
        byId.get(row.id) ?? {
          ...row,
          levelName: 'Nivel sin especificar',
          gradeName: 'Grado sin especificar',
        },
    );
    const requested = typeof input === 'string' ? z.string().uuid().safeParse(input) : null;
    const selectedAssignmentId = requested?.success && assignments.some((row) => row.id === requested.data) ? requested.data : (assignments[0]?.id ?? null);
    if (!selectedAssignmentId)
      return {
        ok: true,
        data: { assignments, selectedAssignmentId: null, report: null },
      };
    const reportResult = await session.supabase.rpc('obtener_reporte_academico_docente_unificado', { p_asignacion_id: selectedAssignmentId });
    if (reportResult.error) throw reportResult.error;
    return {
      ok: true,
      data: {
        assignments,
        selectedAssignmentId,
        report: reportSchema.parse(reportResult.data),
      },
    };
  } catch (error) {
    console.error('No se pudo cargar el reporte académico del profesor.', error);
    return {
      ok: false,
      message: 'No se pudo cargar el reporte académico. Actualiza la página e inténtalo nuevamente.',
    };
  }
}
