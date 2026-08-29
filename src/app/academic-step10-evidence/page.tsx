import { notFound } from 'next/navigation';

import { AcademicStep10Evidence, type AcademicEvidenceState } from '@/components/academic/AcademicStep10Evidence';

export const dynamic = 'force-dynamic';

const states = new Set<AcademicEvidenceState>(['workspace', 'loading', 'empty', 'error', 'forbidden']);

export default async function AcademicStep10EvidenceRoute({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; evidence?: string }>;
}) {
  const params = await searchParams;
  if (
    process.env.NODE_ENV === 'production'
    && process.env.ACADEMIC_STEP10_EVIDENCE !== 'true'
  ) notFound();
  const state = states.has(params.state as AcademicEvidenceState)
    ? params.state as AcademicEvidenceState
    : 'workspace';
  return <AcademicStep10Evidence state={state} />;
}
