'use server';

import { z } from 'zod';
import { requireTenantSession } from '@/lib/tenant/context';
import { mergeReportExercises, type ReportExercise, type ReportExerciseGrade } from '@/lib/academic/report-exercise-merge';

const workRow = z.object({
  exerciseId: z.string().uuid(), exerciseTitle: z.string(), exerciseType: z.string(),
  studentId: z.string().uuid(), studentName: z.string(), enrollmentId: z.string().uuid(),
  grade: z.number().nullable(), state: z.string().nullable(), completedAt: z.string().nullable(),
  hits: z.number().nullable(), totalQuestions: z.number().nullable(), attempts: z.number().nullable(),
  hasUpload: z.boolean(), photoCount: z.number().int().nonnegative(), weighted: z.boolean(),
});
const workReport = z.object({ assignmentId: z.string().uuid(), periodId: z.string().uuid(), rows: z.array(workRow) });
export type TeacherWorkReport = z.infer<typeof workReport>;

export async function loadTeacherWorkReportAction(assignmentId: string): Promise<
  { ok: true; data: TeacherWorkReport } | { ok: false; message: string }> {
  try {
    if (!z.string().uuid().safeParse(assignmentId).success) return { ok: false, message: 'Selecciona una materia y grupo.' };
    const { supabase } = await requireTenantSession(['profesor']);
    const { data, error } = await supabase.rpc('obtener_reporte_trabajos_docente', { p_asignacion_id: assignmentId });
    if (error) throw error;
    return { ok: true, data: workReport.parse(data) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No se pudo cargar el reporte de trabajos.' };
  }
}

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
    pendingCountsAsZero: z.boolean(),
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
      dueAt: z.string().nullable().optional(),
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

async function includeLinkedExercises(
  report: AcademicReport,
  supabase: Awaited<ReturnType<typeof requireTenantSession>>['supabase'],
): Promise<AcademicReport> {
  const { data: links, error: linkError } = await supabase
    .from('vinculos_evaluacion_ejercicio')
    .select('id, ejercicio_id, criterio_evaluacion_id, subcriterio_evaluacion_id, origen, created_at')
    .eq('tenant_id', report.tenant.id)
    .eq('asignacion_profesor_id', report.assignment.id)
    .eq('periodo_evaluacion_id', report.period.id)
    .eq('activo', true)
    .limit(1001);
  if (linkError) throw linkError;
  if (!links?.length) return report;
  if (links.length > 1000) throw new Error('El reporte supera 1000 tareas vinculadas; acota el periodo.');
  const exercises: ReportExercise[] = [];
  const grades: ReportExerciseGrade[] = [];
  for (let index = 0; index < links.length; index += 100) {
    const group = links.slice(index, index + 100);
    const { data: tasks, error: taskError } = await supabase.from('ejercicios')
      .select('id, titulo, fecha_entrega, publicado, visible')
      .eq('tenant_id', report.tenant.id)
      .in('id', group.map((link) => link.ejercicio_id));
    if (taskError) throw taskError;
    const byId = new Map((tasks ?? []).map((task) => [task.id, task]));
    for (const link of group) {
      const task = byId.get(link.ejercicio_id);
      if (!task || task.publicado === false || task.visible === false) continue;
      const createdAt = link.created_at;
      exercises.push({
        id: task.id,
        criterionKey: `${link.criterio_evaluacion_id}:${link.subcriterio_evaluacion_id ?? 'root'}`,
        name: task.titulo,
        type: link.origen,
        createdAt,
        activityDate: createdAt.slice(0, 10),
        dueAt: task.fecha_entrega,
      });
    }
    for (let offset = 0; offset < 20000; offset += 500) {
      const { data: results, error: resultError } = await supabase.from('resultados_ejercicios')
        .select('vinculo_evaluacion_id, ejercicio_id, inscripcion_alumno_id, estado, calificacion, observacion, updated_at')
        .eq('tenant_id', report.tenant.id)
        .in('vinculo_evaluacion_id', group.map((link) => link.id))
        .range(offset, offset + 499);
      if (resultError) throw resultError;
      for (const result of results ?? []) {
        if (result.estado !== 'calificado' || result.calificacion === null || !result.inscripcion_alumno_id) continue;
        grades.push({
          exerciseId: result.ejercicio_id,
          enrollmentId: result.inscripcion_alumno_id,
          grade: Number(result.calificacion),
          observation: result.observacion ?? '',
          updatedAt: result.updated_at,
        });
      }
      if ((results?.length ?? 0) < 500) break;
      if (offset === 19500) throw new Error('El reporte supera 20000 resultados; acota el periodo.');
    }
  }
  const { data: descriptiveData, error: descriptiveError } = await supabase.rpc(
    'obtener_tareas_descriptivas_docente_movil',
    { p_asignacion_id: report.assignment.id },
  );
  if (descriptiveError) throw descriptiveError;
  const descriptiveTasks = z.object({ tasks: z.array(z.object({
    id: z.string().uuid(),
    students: z.array(z.object({
      provisionalId: z.string().uuid().optional(),
      grade: z.number().nullable(),
    }).passthrough()),
  }).passthrough()) }).passthrough().parse(descriptiveData).tasks;
  for (const task of descriptiveTasks) {
    for (const student of task.students) {
      if (!student.provisionalId || student.grade === null) continue;
      grades.push({
        exerciseId: task.id,
        enrollmentId: student.provisionalId,
        grade: student.grade,
        observation: '',
        updatedAt: '',
      });
    }
  }
  return mergeReportExercises(report, exercises, grades);
}

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
    const globalResult = from || to
      ? await session.supabase.rpc('obtener_reporte_academico_docente_unificado_rango', {
        p_asignacion_id: selectedAssignmentId,
        p_fecha_desde: null,
        p_fecha_hasta: null,
      })
      : { data: null, error: null };
    if (globalResult.error) throw globalResult.error;
    const activeCriteria = new Set(z.array(z.object({ key: z.string() }).passthrough())
      .parse(rawReport.criteria).map((row) => row.key));
    const globalStudents = globalResult.data
      ? z.array(z.object({ enrollmentId: z.string().uuid(), results: z.record(z.string(), resultEntry) }).passthrough())
        .parse(z.record(z.string(), z.unknown()).parse(globalResult.data).students)
      : [];
    const globalByStudent = new Map(globalStudents.map((student) => [student.enrollmentId, student.results]));
    const reportPeriodId = z.object({ id: z.string().uuid() }).parse(rawReport.period).id;
    const { data: activeScheme, error: schemeError } = await session.supabase
      .from('esquemas_evaluacion')
      .select('pendientes_vencidos_como_cero')
      .eq('tenant_id', session.tenant.id)
      .eq('asignacion_profesor_id', selectedAssignmentId)
      .eq('periodo_evaluacion_id', reportPeriodId)
      .eq('estado', 'activo').maybeSingle();
    if (schemeError) throw schemeError;
    const rawConcepts = z.array(z.record(z.string(), z.unknown())).parse(rawReport.concepts);
    const enrichedReport = {
      ...rawReport,
      calculationPolicy: {
        ...z.record(z.string(), z.unknown()).parse(rawReport.calculationPolicy),
        pendingCountsAsZero: activeScheme?.pendientes_vencidos_como_cero ?? false,
      },
      concepts: rawConcepts.filter((concept) => activeCriteria.has(z.string().parse(concept.criterionKey)))
        .map((concept) => {
        const id = z.string().uuid().parse(concept.id);
        const context = contextByConcept[id];
        return {
          ...concept,
          activityDate: context?.activityDate ?? z.string().parse(concept.createdAt).slice(0, 10),
          dueAt: null,
          attendance: context?.attendance ?? {},
        };
        }),
      students: z.array(z.record(z.string(), z.unknown())).parse(rawReport.students)
        .map((student) => ({ ...student,
          results: globalByStudent.get(z.string().uuid().parse(student.enrollmentId)) ?? student.results,
        })),
    };
    return {
      ok: true,
      data: {
        assignments,
        selectedAssignmentId,
        report: await includeLinkedExercises(reportSchema.parse(enrichedReport), session.supabase),
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
