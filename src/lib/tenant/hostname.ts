/** Normalize a hostname without changing its DNS identity. */
export function normalizeHostname(value?: string | null): string {
  const first = (value || '').split(',')[0].trim().toLowerCase();
  return first
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

/**
 * Vercel can redirect an apex domain to its `www` counterpart (or vice versa).
 * The exact host is always first so an explicitly registered host wins.
 */
export function getHostnameCandidates(value?: string | null): string[] {
  const exact = normalizeHostname(value);
  if (!exact) return [];
  if (exact === 'localhost' || exact === '127.0.0.1' || exact.endsWith('.localhost')) {
    return [exact];
  }

  const counterpart = exact.startsWith('www.') ? exact.slice(4) : `www.${exact}`;
  return counterpart && counterpart !== exact ? [exact, counterpart] : [exact];
}
