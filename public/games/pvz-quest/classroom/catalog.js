import { unitForProfile, getBalanceProfile } from './balance-profiles.js';

/**
 * Classroom-only rules for the characters actually present in this copy.
 * These are round-based teaching values, not the original real-time values.
 *
 * Sprite coordinates are inclusive FRAME INDICES, not pixel coordinates.
 * A frame is taken from (frameX * width, frameY * height). The sheets have
 * eleven columns; the end coordinates stop before attack/death animations.
 *
 * The inherited "melon_pult.png" is visibly a corn catapult. Its old melon
 * card and projectile are deliberately not reused. Legacy plant cards also
 * contain printed prices, so the new UI draws its own cards from these sprites.
 */

function plant(id, name, cost, hp, damage, ability, description, sprite, projectile) {
    return Object.freeze({
        id,
        side: "plants",
        name,
        cost,
        hp,
        damage,
        move: 0,
        ability,
        description,
        sprite: Object.freeze(sprite),
        ...(projectile ? { projectile } : {}),
    });
}

function zombie(id, name, cost, hp, damage, move, ability, description, sprite) {
    return Object.freeze({
        id,
        side: "zombies",
        name,
        cost,
        hp,
        damage,
        move,
        ability,
        description,
        sprite: Object.freeze(sprite),
    });
}

const pea = "/assets/images/Plants/PB00.png";

export const ZOMBIE_SPEED_PRESETS = Object.freeze([0.35, 0.55, 0.8, 1, 1.3, 1.7]);
export function zombieSpeedForWave(round) {
    return ZOMBIE_SPEED_PRESETS[Math.min(ZOMBIE_SPEED_PRESETS.length - 1, Math.max(0, Math.floor(round || 1) - 1))];
}

export const PLANTS = Object.freeze([
    plant(
        "sunflower", "Girasol", 50, 6, 0, "sunflower",
        "Produce 25 soles mientras siga vivo. Puedes plantar más; sólo los primeros 4 girasoles vivos producen soles a la vez.",
        { src: "/assets/images/Plants/SunFlowerSprite_73x74.png", width: 73, height: 74, startX: 0, startY: 0, endX: 2, endY: 2 },
    ),
    plant(
        "peashooter", "Lanzaguisantes", 100, 5, 1, "shooter",
        "Dispara al primer zombi que encuentre por delante en su carril. Daño: 1 por ronda.",
        { src: "/assets/images/Plants/PeashooterSprite_71x71.png", width: 71, height: 71, startX: 0, startY: 0, endX: 2, endY: 2 },
        pea,
    ),
    plant(
        "snow-pea", "Guisante de hielo", 175, 4, 1, "ice-shooter",
        "Dispara guisantes azules. Cada impacto causa 1 de daño y ralentiza al zombi un 30% durante 4 segundos; los impactos renuevan el efecto sin acumularlo.",
        { src: "/assets/images/Plants/PeashooterSprite_71x71.png", width: 71, height: 71, startX: 0, startY: 0, endX: 2, endY: 2 },
        pea,
    ),
    plant(
        "wallnut", "Nuez", 50, 10, 0, "wall",
        "No dispara: bloquea el paso y soporta 10 puntos de daño. Se agrieta mientras los zombis la van comiendo.",
        { src: "/assets/images/Plants/WallNutSprite_65x73.png", width: 65, height: 73, startX: 0, startY: 0, endX: 5, endY: 1 },
    ),
    plant(
        "potato-mine", "Patatapum", 25, 1, 0, "mine",
        "Se arma después de una ronda. Al pisarla, elimina a un zombi terrestre y desaparece. No alcanza a globos ni dragones flotantes.",
        { src: "/assets/images/Plants/PotatoMineSprite_132x93.png", width: 132, height: 93, startX: 0, startY: 0, endX: 10, endY: 0 },
    ),
    plant(
        "repeater", "Repetidora", 200, 6, 2, "repeater",
        "Dispara dos guisantes al primer zombi por delante en su carril. Daño total: 2 por ronda.",
        { src: "/assets/images/Plants/RepeaterSprite_73x71.png", width: 73, height: 71, startX: 0, startY: 0, endX: 2, endY: 2 },
        pea,
    ),
    plant(
        "threepeater", "Tripitidora", 225, 6, 1, "threepeater",
        "Dispara en su carril y en los dos carriles vecinos que existan. Cada impacto causa 1 punto de daño.",
        { src: "/assets/images/Plants/ThreepeaterSprite_73x80.png", width: 73, height: 80, startX: 0, startY: 0, endX: 4, endY: 1 },
        pea,
    ),
    plant(
        "chomper", "Planta carnívora", 150, 8, 0, "chomper",
        "Devora a un zombi terrestre cercano y mastica durante 20 segundos antes de volver a comer. No alcanza a globos ni dragones flotantes.",
        { src: "/assets/images/Plants/ChomperSprite_130x114.png", width: 130, height: 114, startX: 0, startY: 0, endX: 2, endY: 2 },
    ),
    plant(
        "spikeweed", "Pinchohierba", 75, 4, 1, "spikes",
        "Daña a los zombis terrestres que atraviesan su casilla y reduce su avance un 40% mientras pisan los pinchos. No daña ni ralentiza a globos ni dragones flotantes.",
        { src: "/assets/images/Plants/SpikeweedSprite_100x41.png", width: 100, height: 41, startX: 0, startY: 0, endX: 9, endY: 1 },
    ),
    plant(
        "corn-pult", "Elotepulta", 200, 8, 2, "lobber",
        "Lanza elotes al primer zombi por delante en su carril. Daño: 2 por ronda. El personaje disponible es de maíz, no de sandía.",
        { src: "/assets/images/Plants/melon_pult.png", width: 459, height: 345, startX: 0, startY: 0, endX: 0, endY: 0 },
    ),
]);

export const ZOMBIES = Object.freeze([
    zombie(
        "common", "Zombi común", 25, 5, 1, 1, "basic",
        "Tiene 5 de vida y acelera con cada oleada. Si encuentra una planta, la muerde: 1 punto de daño.",
        { src: "/assets/images/Zombies/ZombieSprite_166x144.png", width: 166, height: 144, startX: 0, startY: 0, endX: 2, endY: 4 },
    ),
    zombie(
        "cone", "Zombi cono", 50, 8, 1, 1, "armor",
        "Su cono le permite resistir 8 puntos de daño. Muerde con daño 1 y acelera con cada oleada.",
        { src: "/assets/images/Zombies/ConeheadZombieSprite_166x144.png", width: 166, height: 144, startX: 0, startY: 0, endX: 2, endY: 4 },
    ),
    zombie(
        "bucket", "Zombi cubeta", 100, 12, 1, 1, "armor",
        "La cubeta le permite resistir 12 puntos de daño. Muerde con daño 1 y acelera con cada oleada.",
        { src: "/assets/images/Zombies/BucketheadZombieSprite_166x144.png", width: 166, height: 144, startX: 0, startY: 0, endX: 2, endY: 4 },
    ),
    zombie(
        "football", "Zombi jugador", 175, 12, 2, 2, "fast",
        "Corre al doble de velocidad sin atravesar plantas que lo bloqueen. Tiene 12 de vida y muerde con daño 2.",
        { src: "/assets/images/Zombies/FootballZombieWalk_300.png", width: 300, height: 300, startX: 0, startY: 0, endX: 7, endY: 2 },
    ),
    zombie(
        "balloon", "Zombi globo", 100, 5, 1, 1, "flying",
        "Tiene 5 de vida, acelera con cada oleada y flota sobre minas y pinchos. En esta modalidad los tiradores sí pueden alcanzarlo.",
        { src: "/assets/images/Zombies/ballonZombieSprite_207x197.png", width: 207, height: 197, startX: 0, startY: 0, endX: 1, endY: 1 },
    ),
    zombie(
        "dragon", "Zombi dragón", 500, 19, 3, 1, "flying-heavy",
        "El dragón flotante tiene 19 de vida. Evita minas, carnívoras y pinchos sin recibir su daño ni ralentización. No invoca ayudantes.",
        { src: "/assets/images/Zombies/dragonZombie_464x400.png", width: 464, height: 400, startX: 0, startY: 0, endX: 5, endY: 2 },
    ),
]);

export const UNITS = Object.freeze(Object.fromEntries(
    [...PLANTS, ...ZOMBIES].map((unit) => [unit.id, unit]),
));

const CLASSIC_UNITS = Object.freeze(Object.fromEntries(
    Object.values(UNITS).map(unit => [unit.id, unitForProfile(unit, 'classic')]),
));
const PROFILE_UNITS = Object.freeze({ aula: UNITS, classic: CLASSIC_UNITS });
const PROFILE_LISTS = Object.freeze(Object.fromEntries(Object.entries(PROFILE_UNITS)
    .map(([id, units]) => [id, Object.freeze(Object.values(units))])));

/** The omitted profile keeps legacy callers and sprite metadata unchanged. */
export function getUnit(id, profile = 'aula') {
    getBalanceProfile(profile);
    const units = PROFILE_UNITS[profile];
    return Object.hasOwn(units, id) ? units[id] : undefined;
}
export function getUnits(profile = 'aula') {
    getBalanceProfile(profile);
    return PROFILE_LISTS[profile];
}
