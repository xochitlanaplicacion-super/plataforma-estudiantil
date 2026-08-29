import { notFound } from 'next/navigation';

import { AcademicStep11Evidence, type AcademicStep11EvidenceState } from '@/components/academic/AcademicStep11Evidence';

export const dynamic = 'force-dynamic';

const states = new Set<AcademicStep11EvidenceState>([
  'workspace', 'loading', 'empty', 'error', 'forbidden', 'closed', 'conflict', 'timeout', 'large',
]);

export default async function AcademicStep11EvidenceRoute({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const params = await searchParams;
  if (process.env.NODE_ENV === 'production' && process.env.ACADEMIC_STEP11_EVIDENCE !== 'true') notFound();
  const state = states.has(params.state as AcademicStep11EvidenceState)
    ? params.state as AcademicStep11EvidenceState : 'workspace';
  return <AcademicStep11Evidence state={state} />;
}
