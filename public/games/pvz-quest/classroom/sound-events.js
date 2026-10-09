// Only local sounds already shipped by the community copy. Never fetch a new
// recording or assume an absent "brains" file exists.
export const EFFECT_NAMES = Object.freeze([
  'click', 'points', 'plantation', 'pea_shoot', 'pea_hit', 'chomp', 'puff',
  'zombie_groan', 'zombie_fall', 'bucket_zombie_fall', 'zombieFinalKill',
]);

export function combatSoundNames(events = []) {
  const names = new Set();
  const types = new Set(events.map(event => event.type));
  if (types.has('mower')) names.add('zombieFinalKill');
  if (types.has('mine')) names.add('puff');
  if (types.has('freeze')) names.add('freeze');
  if (types.has('bite') || types.has('chomp')) names.add('chomp');
  if (types.has('shot')) {
    names.add('pea_shoot');
    if (events.some(event => event.type === 'damage' && event.side === 'zombies')) names.add('pea_hit');
  }
  if (types.has('deployment') || types.has('deploy')) names.add('plantation');
  if (types.has('sun') || types.has('victory') || types.has('finished')) names.add('points');
  if (!types.has('mower')) {
    if (events.some(event => event.type === 'defeat' && event.side === 'zombies' && event.typeId === 'bucket')) names.add('bucket_zombie_fall');
    if (events.some(event => event.type === 'defeat' && event.side === 'zombies' && event.typeId !== 'bucket')) names.add('zombie_fall');
  }
  return [...names];
}
