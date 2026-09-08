import { QuestionBankManager } from '@/components/classroom-games/QuestionBankManager';
import { loadTeacherClassroomAction } from '@/lib/actions/classroom-games';

export default async function TeacherQuestionBankPage() {
  const result = await loadTeacherClassroomAction();
  if (!result.ok) return <main className="rounded-2xl border p-6"><h1 className="text-2xl font-bold">Banco de actividades</h1><p className="mt-2 text-destructive">{result.message}</p></main>;
  return <QuestionBankManager initialData={result.data}/>;
}
