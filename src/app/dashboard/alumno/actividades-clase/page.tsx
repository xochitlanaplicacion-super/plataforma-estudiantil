import { StudentSessionList } from '@/components/classroom-games/StudentSessionList';
import { loadStudentClassroomSessionsAction } from '@/lib/actions/classroom-games';

export default async function StudentClassroomActivitiesPage() {
  const result = await loadStudentClassroomSessionsAction();
  if (!result.ok) return <main className="rounded-2xl border p-6"><h1 className="text-2xl font-bold">Actividades en clase</h1><p className="mt-2 text-destructive">{result.message}</p></main>;
  return <StudentSessionList initialSessions={result.data}/>;
}
