import { TeacherSessionManager } from '@/components/classroom-games/TeacherSessionManager';
import { loadTeacherClassroomAction } from '@/lib/actions/classroom-games';
import { ClassroomGameRepertoire } from '@/components/classroom-games/ClassroomGameRepertoire';
import { requireTenantSession } from '@/lib/tenant/context';

export default async function TeacherClassroomActivitiesPage() {
  const result = await loadTeacherClassroomAction();
  if (!result.ok) {
    // A local game does not depend on online classroom tables. Still verify the
    // teacher role/tenant before rendering it when the online loader fails.
    try { await requireTenantSession(['profesor']); }
    catch { return <main className="rounded-2xl border p-6"><h1 className="text-2xl font-bold">Actividades en clase</h1><p className="mt-2 text-destructive">{result.message}</p></main>; }
    return <main className="space-y-6 pb-16"><h1 className="text-3xl font-black">Actividades en clase</h1><ClassroomGameRepertoire/><section className="rounded-2xl border p-6"><h2 className="text-xl font-bold">Duelo en línea</h2><p className="mt-2 text-destructive">{result.message}</p><p className="mt-2 text-sm text-muted-foreground">El repertorio local permanece disponible; este aviso sólo corresponde a las salas en línea.</p></section></main>;
  }
  return <TeacherSessionManager initialData={result.data}/>;
}
