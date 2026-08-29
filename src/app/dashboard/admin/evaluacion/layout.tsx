import { ShieldX } from 'lucide-react';

import { requireTenantSession } from '@/lib/tenant/context';

export default async function AcademicEvaluationLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireTenantSession(['superuser', 'admin']);
  } catch {
    return (
      <main className="mx-auto max-w-2xl rounded-xl border bg-card p-6 text-card-foreground" aria-labelledby="academic-forbidden-title">
        <ShieldX className="mb-3 size-8 text-destructive" aria-hidden="true" />
        <h1 id="academic-forbidden-title" className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-muted-foreground" role="alert">
          Esta configuración requiere una sesión activa con rol de administrador o superusuario de la institución.
        </p>
      </main>
    );
  }
  return children;
}
