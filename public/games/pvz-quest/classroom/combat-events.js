const IMPORTANT = new Set(['mower', 'wave', 'wave-start', 'wave-ending', 'tactical', 'closing', 'finished', 'sun']);
const LIFECYCLE = new Set(['defeat', 'death', 'deployment', 'deploy', 'invasion']);

function aggregatePulseEvents(events) {
  const result = [], damage = new Map(), bites = new Map();
  for (const event of events) {
    // A death, fresh deployment or phase transition starts a new visual span.
    // Never move later damage across these events or into an earlier life.
    if (IMPORTANT.has(event.type) || LIFECYCLE.has(event.type)) {
      damage.clear(); bites.clear();
    }
    const damagePulse = event.type === 'damage' && event.unitId != null && Number.isFinite(event.amount);
    const bitePulse = event.type === 'bite' && event.targetId != null;
    if (!damagePulse && !bitePulse) {
      result.push(event);
      continue;
    }
    const grouped = damagePulse ? damage : bites;
    const key = damagePulse ? event.unitId : event.targetId;
    const previous = grouped.get(key);
    if (!previous) {
      const combined = { ...event };
      grouped.set(key, combined); result.push(combined);
      continue;
    }
    const total = damagePulse ? previous.amount + event.amount : null;
    const sourceId = previous.sourceId === event.sourceId ? previous.sourceId : null;
    // The latest coordinates belong to the current visual position. Multiple
    // attackers cannot be attributed to whichever happened to bite last.
    Object.assign(previous, event);
    if (sourceId !== undefined || Object.hasOwn(previous, 'sourceId')) previous.sourceId = sourceId;
    if (damagePulse) previous.amount = total;
  }
  return result;
}

/** Preserve lane sweeps and wave transitions when a large horde generates particle bursts. */
export function compactCombatEvents(events, limit = 200, { aggregateDamage = false } = {}) {
  const visuals = aggregateDamage ? aggregatePulseEvents(events) : events;
  if (visuals.length <= limit) return visuals;
  const important = visuals.map((event, index) => IMPORTANT.has(event.type)
    || aggregateDamage && LIFECYCLE.has(event.type) ? index : -1).filter(index => index >= 0);
  const keep = new Set(important);
  for (let index = visuals.length - 1; index >= 0 && keep.size < limit; index -= 1) keep.add(index);
  return visuals.filter((event, index) => keep.has(index));
}
