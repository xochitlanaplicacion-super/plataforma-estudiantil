import { TeacherSessionManager } from '@/components/classroom-games/TeacherSessionManager';
import { loadTeacherClassroomAction } from '@/lib/actions/classroom-games';

export default async function TeacherClassroomActivitiesPage() {
  const result = await loadTeacherClassroomAction();
  if (!result.ok) return <main className="rounded-2xl border p-6"><h1 className="text-2xl font-bold">Actividades en clase</h1><p className="mt-2 text-destructive">{result.message}</p></main>;
  return <TeacherSessionManager initialData={result.data}/>;
}
