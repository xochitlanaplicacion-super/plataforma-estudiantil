import { describe, expect, it } from 'vitest';
import { isPastDeadline } from '@/lib/academic/deadline-policy';

describe('virtual zero deadline policy', () => {
  const now = '2026-09-26T12:00:00.000Z';

  it('counts only a deadline that has already passed', () => {
    expect(isPastDeadline('2026-09-25T12:00:00.000Z', now)).toBe(true);
    expect(isPastDeadline('2026-09-26T12:00:00.000Z', now)).toBe(false);
    expect(isPastDeadline('2026-09-27T12:00:00.000Z', now)).toBe(false);
  });

  it('keeps missing or invalid deadlines null', () => {
    expect(isPastDeadline(null, now)).toBe(false);
    expect(isPastDeadline(undefined, now)).toBe(false);
    expect(isPastDeadline('invalid', now)).toBe(false);
  });
});
