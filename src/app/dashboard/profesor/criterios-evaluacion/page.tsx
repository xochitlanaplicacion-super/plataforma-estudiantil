import { ShieldX } from 'lucide-react';

import { AcademicSchemesPage } from '@/components/academic/AcademicSchemesPage';
import { requireTenantSession } from '@/lib/tenant/context';

export default async function TeacherEvaluationCriteriaRoute() {
  try {
    await requireTenantSession(['profesor']);
  } catch {
    return (
      <main className="mx-auto max-w-2xl rounded-xl border bg-card p-6 text-card-foreground" aria-labelledby="criteria-forbidden-title">
        <ShieldX className="mb-3 size-8 text-destructive" aria-hidden="true" />
        <h1 id="criteria-forbidden-title" className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-muted-foreground" role="alert">
          Los criterios requieren una sesión activa de profesor de esta institución.
        </p>
      </main>
    );
  }

  return <AcademicSchemesPage audience="teacher" />;
}
