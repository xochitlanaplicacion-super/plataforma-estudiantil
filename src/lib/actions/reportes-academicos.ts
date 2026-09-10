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
  expectedCount: z.number().int().nonnegative(),
  gradedCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  complete: z.boolean(),
  missingConceptNames: z.array(z.string()),
  calculationPolicy: z.enum(['explicit_grades_only_with_coverage', 'direct_grade']),
});
const conceptGrade = z.object({
  grade: z.number(),
  observation: z.string(),
  updatedAt: z.string(),
});
const conceptAttendanceContext = z.record(
  z.string(),
  z.object({
    activityDate: z.string(),
    attendance: z.record(z.string(), z.enum(['presente', 'ausente'])),
  }),
);
const reportSchema = z.object({
  generatedAt: z.string(),
  range: z.object({
    from: z.string(),
    to: z.string(),
    today: z.string(),
    isFullPeriod: z.boolean(),
  }),
  calculationPolicy: z.object({
    pendingCountsAsZero: z.literal(false),
    explicitZeroCounts: z.literal(true),
    partialAverageRequiresCoverage: z.literal(true),
  }),
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
      activityDate: z.string(),
      attendance: z.record(z.string(), z.enum(['presente', 'ausente'])),
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

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reportRequestSchema = z
  .object({
    assignmentId: z.string().uuid().optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
  });

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
    const legacyRequest = typeof input === 'string' ? z.string().uuid().safeParse(input) : null;
    const structuredRequest = typeof input === 'object' && input !== null
      ? reportRequestSchema.safeParse(input)
      : null;
    if (structuredRequest && !structuredRequest.success) {
      return { ok: false, message: structuredRequest.error.issues[0]?.message ?? 'El rango de fechas no es válido.' };
    }
    const requestedAssignmentId = legacyRequest?.success
      ? legacyRequest.data
      : structuredRequest?.success
        ? structuredRequest.data.assignmentId
        : undefined;
    const selectedAssignmentId = requestedAssignmentId && assignments.some((row) => row.id === requestedAssignmentId)
      ? requestedAssignmentId
      : (assignments[0]?.id ?? null);
    if (!selectedAssignmentId)
      return {
        ok: true,
        data: { assignments, selectedAssignmentId: null, report: null },
      };
    const from = structuredRequest?.success ? (structuredRequest.data.from ?? null) : null;
    const to = structuredRequest?.success ? (structuredRequest.data.to ?? null) : null;
    const [reportResult, conceptContextResult] = await Promise.all([
      session.supabase.rpc('obtener_reporte_academico_docente_unificado_rango', {
        p_asignacion_id: selectedAssignmentId,
        p_fecha_desde: from,
        p_fecha_hasta: to,
      }),
      session.supabase.rpc('obtener_contexto_asistencia_conceptos_docente', {
        p_asignacion_id: selectedAssignmentId,
        p_fecha_desde: from,
        p_fecha_hasta: to,
      }),
    ]);
    if (reportResult.error) throw reportResult.error;
    if (conceptContextResult.error) throw conceptContextResult.error;
    const contextByConcept = conceptAttendanceContext.parse(conceptContextResult.data);
    const rawReport = z.record(z.string(), z.unknown()).parse(reportResult.data);
    const rawConcepts = z.array(z.record(z.string(), z.unknown())).parse(rawReport.concepts);
    const enrichedReport = {
      ...rawReport,
      concepts: rawConcepts.map((concept) => {
        const id = z.string().uuid().parse(concept.id);
        const context = contextByConcept[id];
        return {
          ...concept,
          activityDate: context?.activityDate ?? z.string().parse(concept.createdAt).slice(0, 10),
          attendance: context?.attendance ?? {},
        };
      }),
    };
    return {
      ok: true,
      data: {
        assignments,
        selectedAssignmentId,
        report: reportSchema.parse(enrichedReport),
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
