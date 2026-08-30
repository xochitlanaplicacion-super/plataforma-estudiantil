import { notFound } from 'next/navigation';

import {
  AcademicStep13Evidence,
  type AcademicStep13EvidenceRole,
  type AcademicStep13EvidenceState,
} from '@/components/academic/AcademicStep13Evidence';

export const dynamic = 'force-dynamic';

const roles = new Set<AcademicStep13EvidenceRole>(['student', 'management']);
const states = new Set<AcademicStep13EvidenceState>(['results', 'empty', 'final', 'reopened']);

export default async function AcademicStep13EvidenceRoute({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; state?: string }>;
}) {
  if (process.env.NODE_ENV === 'production' && process.env.ACADEMIC_STEP13_EVIDENCE !== 'true') notFound();
  const params = await searchParams;
  const role = roles.has(params.role as AcademicStep13EvidenceRole)
    ? params.role as AcademicStep13EvidenceRole : 'student';
  const state = states.has(params.state as AcademicStep13EvidenceState)
    ? params.state as AcademicStep13EvidenceState : 'results';
  return <AcademicStep13Evidence role={role} state={state} />;
}
