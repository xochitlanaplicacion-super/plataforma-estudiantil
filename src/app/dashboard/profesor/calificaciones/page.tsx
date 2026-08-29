import { ShieldX } from 'lucide-react';

import { AcademicGradebookPage } from '@/components/academic/AcademicGradebookPage';
import { requireTenantSession } from '@/lib/tenant/context';

export default async function TeacherGradebookRoute() {
  try {
    await requireTenantSession(['profesor']);
  } catch {
    return (
      <main className="mx-auto max-w-2xl rounded-xl border bg-card p-6 text-card-foreground" aria-labelledby="gradebook-forbidden-title">
        <ShieldX className="mb-3 size-8 text-destructive" aria-hidden="true" />
        <h1 id="gradebook-forbidden-title" className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-muted-foreground" role="alert">
          La libreta requiere una sesión activa de profesor de esta institución.
        </p>
      </main>
    );
  }
  return <AcademicGradebookPage />;
}
