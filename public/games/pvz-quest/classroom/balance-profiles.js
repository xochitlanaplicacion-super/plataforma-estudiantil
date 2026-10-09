/** Combat presets, not interchangeable hit-point scales.
 * Reference: community reconstruction of PvZ 1 PC, not official EA docs:
 * https://github.com/Patoke/re-plants-vs-zombies/blob/main/Lawn/Zombie.cpp
 * https://github.com/Patoke/re-plants-vs-zombies/blob/main/Lawn/Plant.cpp
 * https://github.com/Patoke/re-plants-vs-zombies/blob/main/Lawn/Projectile.cpp
 * Classic preserves classroom prices, questions, slowing and assistance.
 */
export const DEFAULT_BALANCE_PROFILE = 'classic';

export const BALANCE_PROFILES = Object.freeze({
  classic: Object.freeze({
    id: 'classic', name: 'Clásico — resistencia PvZ1', shortName: 'Clásico',
    description: 'Predeterminado. Plantas comunes: 300 de vida; nuez: 4,000. Guisantes de 20 de daño cada 1.5 s y mordidas de 100 de daño/s. Zombis con protección mucho más resistentes. Dragón: 2,000 de vida, 750 cerebros y avance al 55% del común en todas las oleadas. Se conservan los otros precios, premios y reglas del aula; no es una réplica exacta del original.',
    rules: Object.freeze({ shotSeconds: 1.5, biteSeconds: 0.04, mineArmSeconds: 15,
      chompRestSeconds: 42, spikeSeconds: 1, freezeSeconds: 4,
      iceSlowFactor: 0.7, spikeSlowFactor: 0.6, zombieRetireHp: 90 }),
  }),
  aula: Object.freeze({
    id: 'aula', name: 'Aula — balance anterior', shortName: 'Aula',
    description: 'El balance que ya probaron en clase, sin cambios: común 5, cono 8, cubeta y fútbol 12, globo 5, dragón 19; nuez 10. En continuo, disparos cada 2.4 s y mordidas cada 1.5 s; en rondas conserva el ritmo táctico anterior. Carnívora: 20 s de recuperación. Elige esta opción para volver a la experiencia anterior.',
    rules: Object.freeze({ shotSeconds: 2.4, biteSeconds: 1.5, mineArmSeconds: 5,
      chompRestSeconds: 20, spikeSeconds: 2, freezeSeconds: 4,
      iceSlowFactor: 0.7, spikeSlowFactor: 0.6, zombieRetireHp: 0 }),
  }),
});

// Missing fields in legacy states deliberately mean Aula. New UI sessions
// always pass DEFAULT_BALANCE_PROFILE explicitly, so old matches never change.
export function getBalanceProfile(id = 'aula') {
  if (typeof id !== 'string' || !Object.hasOwn(BALANCE_PROFILES, id)) throw new Error('Selecciona el perfil Clásico o Aula.');
  return BALANCE_PROFILES[id];
}
export const profileRules = (id = 'aula') => getBalanceProfile(id).rules;

const classicStats = Object.freeze({
  sunflower: { hp: 300, damage: 0 }, peashooter: { hp: 300, damage: 20 },
  'snow-pea': { hp: 300, damage: 20 }, wallnut: { hp: 4000, damage: 0 },
  'potato-mine': { hp: 300, damage: 0 }, repeater: { hp: 300, damage: 40 },
  threepeater: { hp: 300, damage: 20 }, chomper: { hp: 300, damage: 0 },
  spikeweed: { hp: 300, damage: 20 }, 'corn-pult': { hp: 300, damage: 20 },
  common: { hp: 270, damage: 4 }, cone: { hp: 640, damage: 4 },
  bucket: { hp: 1370, damage: 4 }, football: { hp: 1670, damage: 4 },
  balloon: { hp: 290, damage: 4 }, dragon: { hp: 2000, cost: 750, move: 0.55, damage: 4 },
});

const classicDescriptions = Object.freeze({
  sunflower: 'Produce soles automáticos. Hasta cuatro girasoles vivos producen a la vez; se conserva la economía educativa.',
  peashooter: 'Dispara un guisante de 20 de daño aproximadamente cada 1.5 segundos al primer zombi por delante.',
  'snow-pea': 'Guisantes azules de 20 de daño cada 1.5 segundos; frenan un 30% durante 4 segundos renovables, sin acumular porcentajes.',
  wallnut: 'Bloquea zombis terrestres. Sus 4,000 de vida equivalen a unos 40 segundos de mordidas de un único zombi sin ralentización. Se agrieta al perder vida.',
  'potato-mine': 'Se arma en 15 segundos de combate. Elimina al primer zombi terrestre que la pisa y desaparece; no alcanza a globos ni dragones.',
  repeater: 'Dos guisantes por ráfaga: 40 de daño total aproximadamente cada 1.5 segundos.',
  threepeater: 'Dispara 20 de daño por carril aproximadamente cada 1.5 segundos en su fila y las dos vecinas.',
  chomper: 'Devora un zombi terrestre y se recupera durante aproximadamente 42 segundos entre cerrar la boca, masticar y tragar. No alcanza a globos ni dragones.',
  spikeweed: 'Causa 20 de daño por segundo de contacto terrestre y frena un 40% mientras la pisan. Globos y dragones la evitan.',
  'corn-pult': 'Elotes de 20 de daño aproximadamente cada 1.5 segundos. Conserva el personaje de maíz disponible; no se convierte en sandía.',
  common: '270 de vida. Muerde con 100 de daño por segundo. Deja de atacar al perder la cabeza, después de aproximadamente 10 guisantes.',
  cone: '270 de cuerpo + 370 de cono: 640 de vida. Aproximadamente 28 guisantes hasta dejar de atacar; mordidas de 100 de daño por segundo.',
  bucket: '270 de cuerpo + 1,100 de cubeta: 1,370 de vida. Aproximadamente 65 guisantes hasta dejar de atacar; mordidas de 100 de daño por segundo.',
  football: '270 de cuerpo + 1,400 de protección: 1,670 de vida. Corre al doble y soporta aproximadamente 80 guisantes antes de dejar de atacar.',
  balloon: '270 de cuerpo + 20 del globo. Evita minas, pinchos y bloqueadores. Por adaptación del aula los tiradores sí lo alcanzan.',
  dragon: 'Jefe flotante adaptado con 2,000 de vida y precio de 750 cerebros. Avanza siempre al 55% de la velocidad del zombi común de esa oleada. Evita minas, pinchos y carnívoras; no aplasta plantas ni invoca ayudantes.',
});

export function unitForProfile(unit, id = 'aula') {
  getBalanceProfile(id);
  if (id === 'aula') return unit;
  return Object.freeze({ ...unit, ...classicStats[unit.id], description: classicDescriptions[unit.id] ?? unit.description });
}
