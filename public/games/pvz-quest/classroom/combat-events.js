const IMPORTANT = new Set(['mower', 'wave', 'wave-start', 'wave-ending', 'tactical', 'closing', 'finished', 'sun']);

/** Preserve lane sweeps and wave transitions when a large horde generates particle bursts. */
export function compactCombatEvents(events, limit = 200) {
  if (events.length <= limit) return events;
  const important = events.map((event, index) => IMPORTANT.has(event.type) ? index : -1).filter(index => index >= 0);
  const keep = new Set(important);
  for (let index = events.length - 1; index >= 0 && keep.size < limit; index -= 1) keep.add(index);
  return events.filter((event, index) => keep.has(index));
}
