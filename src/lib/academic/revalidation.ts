import 'server-only';

import { revalidatePath } from 'next/cache';

import type { AcademicActionRevalidationScope } from './action-handler';

const ACADEMIC_REVALIDATION_PATHS = Object.freeze([
  '/dashboard/profesor',
  '/dashboard/profesor/calificaciones',
  '/dashboard/admin/auditoria',
  '/dashboard/alumno/materias',
]);

const ACADEMIC_CONFIGURATION_PATHS = Object.freeze([
  '/dashboard/admin/evaluacion/ciclos',
  '/dashboard/admin/evaluacion/esquemas',
  '/dashboard/profesor/criterios-evaluacion',
  '/dashboard/admin/auditoria',
]);

export function revalidateAcademicRoutes(_scope: AcademicActionRevalidationScope): void {
  for (const path of ACADEMIC_REVALIDATION_PATHS) revalidatePath(path);
}

export function revalidateAcademicConfigurationRoutes(): void {
  for (const path of ACADEMIC_CONFIGURATION_PATHS) revalidatePath(path);
}
