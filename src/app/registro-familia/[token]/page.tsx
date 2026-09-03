import { FamilyRegistrationForm } from '@/components/filter/FamilyRegistrationForm';
import { getFamilyRegistrationContext } from '@/lib/actions/filter-family-public';

export default async function FamilyRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const context = await getFamilyRegistrationContext(token);
  if (!context.success) return <main className="flex min-h-screen items-center justify-center bg-muted p-6"><div className="max-w-lg rounded-xl border bg-card p-8 text-center"><h1 className="text-2xl font-bold">Enlace no disponible</h1><p className="mt-3 text-muted-foreground">{context.error}</p></div></main>;
  return <FamilyRegistrationForm token={token} context={context} />;
}
