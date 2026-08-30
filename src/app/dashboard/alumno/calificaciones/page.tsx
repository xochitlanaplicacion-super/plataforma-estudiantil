import { AcademicStudentResultsPage } from '@/components/academic/AcademicStudentResultsPage';
import { requireTenantSession } from '@/lib/tenant/context';

export default async function StudentResultsRoute() {
  await requireTenantSession(['alumno']);
  return <AcademicStudentResultsPage />;
}
