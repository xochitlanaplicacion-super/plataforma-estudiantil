import { notFound } from 'next/navigation';
import { BetWinLoseRoom } from '@/components/classroom-games/BetWinLoseRoom';
import { loadClassroomGameStateAction } from '@/lib/actions/classroom-games';

export default async function StudentGameRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadClassroomGameStateAction(id);
  if (!result.ok || !result.data.ownParticipant) notFound();
  return <BetWinLoseRoom sessionId={id} initialState={result.data}/>;
}
