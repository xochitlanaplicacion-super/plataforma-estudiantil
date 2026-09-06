import { ShieldX } from 'lucide-react';
import { TeacherParticipationDashboard } from '@/components/academic/TeacherParticipationDashboard';
import { loadTeacherParticipationAction } from '@/lib/actions/participaciones';
import { requireTenantSession } from '@/lib/tenant/context';

export default async function TeacherParticipationPage(){
  try{await requireTenantSession(['profesor']);}catch{return <main className="mx-auto max-w-2xl rounded-xl border bg-card p-6"><ShieldX className="mb-3 size-8 text-destructive"/><h1 className="text-2xl font-bold">Acceso restringido</h1><p className="mt-2 text-muted-foreground">Esta sección requiere una sesión activa de profesor.</p></main>;}
  const result=await loadTeacherParticipationAction();
  if(!result.ok)return <main className="mx-auto max-w-2xl rounded-xl border bg-card p-6"><h1 className="text-2xl font-bold">Participación diaria</h1><p role="alert" className="mt-3 text-destructive">{result.message}</p></main>;
  return <TeacherParticipationDashboard initialData={result.data}/>;
}
