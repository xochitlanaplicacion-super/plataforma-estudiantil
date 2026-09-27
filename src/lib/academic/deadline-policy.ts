/** An absent, invalid, or future deadline must never create a virtual zero. */
export function isPastDeadline(dueAt: string | null | undefined, asOf: string | number): boolean {
  if (!dueAt) return false;
  const deadline = Date.parse(dueAt);
  const now = typeof asOf === 'number' ? asOf : Date.parse(asOf);
  return Number.isFinite(deadline) && Number.isFinite(now) && deadline < now;
}
