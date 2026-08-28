import 'server-only';

import { revalidatePath } from 'next/cache';

import type { AcademicActionRevalidationScope } from './action-handler';

const ACADEMIC_REVALIDATION_PATHS = Object.freeze([
  '/dashboard/profesor',
  '/dashboard/admin/auditoria',
  '/dashboard/alumno/materias',
]);

export function revalidateAcademicRoutes(_scope: AcademicActionRevalidationScope): void {
  for (const path of ACADEMIC_REVALIDATION_PATHS) revalidatePath(path);
}
