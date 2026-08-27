'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { requireTenantSession } from '@/lib/tenant/context';
import {
  buildAcademicContextIndicator,
  type AcademicContextIndicator,
  type AcademicCycleSummary,
} from '@/lib/academic-grading/cycle-context';

export async function getAcademicContextIndicator(): Promise<{
  data: AcademicContextIndicator | null;
  error: string | null;
}> {
  noStore();

  try {
    const { supabase, tenantId } = await requireTenantSession(['superuser', 'admin']);
    const [cycleResult, studentsResult, enrollmentsResult, assignmentsResult] = await Promise.all([
      supabase
        .from('ciclos_escolares')
        .select('id, nombre, fecha_inicio, fecha_fin, estado, zona_horaria')
        .eq('tenant_id', tenantId)
        .eq('estado', 'activo')
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('rol', 'alumno')
        .eq('estatus', 'activo'),
      supabase
        .from('inscripciones_alumno')
        .select('id, ciclos_escolares!inner(estado)', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .eq('ciclos_escolares.estado', 'activo'),
      supabase
        .from('asignaciones_profesor')
        .select('id, ciclos_escolares!inner(estado)', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .eq('ciclos_escolares.estado', 'activo'),
    ]);

    const firstError = cycleResult.error
      || studentsResult.error
      || enrollmentsResult.error
      || assignmentsResult.error;
    if (firstError) return { data: null, error: firstError.message };

    const cycle: AcademicCycleSummary | null = cycleResult.data
      ? {
          id: cycleResult.data.id,
          name: cycleResult.data.nombre,
          startsOn: cycleResult.data.fecha_inicio,
          endsOn: cycleResult.data.fecha_fin,
          timezone: cycleResult.data.zona_horaria,
          state: cycleResult.data.estado as AcademicCycleSummary['state'],
        }
      : null;

    return {
      data: buildAcademicContextIndicator(cycle, {
        activeStudents: studentsResult.count,
        activeEnrollments: enrollmentsResult.count,
        activeAssignments: assignmentsResult.count,
      }),
      error: null,
    };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'No fue posible resolver el contexto académico' };
  }
}
