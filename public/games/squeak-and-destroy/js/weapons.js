/* ============================================================================
 * CUTE ANIMALS — weapons.js  ::  AGENT C — Weapons, Projectiles, Combat, Aiming
 * ----------------------------------------------------------------------------
 * GOAL: a juicy Worms-style ARSENAL + ballistic projectile physics + the
 * charged-power firing model + the aim reticle. Detonation routes ALL damage
 * through CA.explode(x,y,radius,damage,knockback) — never touch terrain/units
 * directly.
 *
 * IMPLEMENT on CA.Weapons (EXACT):
 *   init(ctx)
 *   LIST                       -> array of Weapon objects (see contract shape).
 *                                Provide AT LEAST these, balanced & fun:
 *      bazooka  (wind-affected, on-impact, r~55 dmg~45)        endsTurn
 *      grenade  (throwable, fuse~3s, bounce~0.5, r~55 dmg~50)  endsTurn
 *      dynamite (drop at feet, fuse~3s, r~75 dmg~60)           endsTurn
 *      shotgun  (instant hitscan, 2 shots, short range)        not-end-1st
 *      cluster  (grenade that splits into bomblets)            endsTurn
 *      airstrike(call planes, drops bombs along a line)        endsTurn
 *      capybomb (a szent capybara-bomba 🐹, huge r~110)         endsTurn
 *      teleport (utility: move active unit to clicked spot)    not-end
 *      melee    (knockback bonk, short range)                  not-end
 *      drill/girder OPTIONAL extras if time permits.
 *   fireCharged(unit, weaponId, power)  -> called on space-release with
 *                                power 0..1.
 *   update(dt)                 -> integrate every projectile.
 *   render(ctx)                -> draw projectiles + trails + reticle + power bar.
 *   currentWeapon()            -> the selected Weapon object.
 *   predict(unit,weaponId,power)-> {x,y} estimated landing point (for the AI).
 *
 * FIRING MODEL:
 *  - aim angle: unit.aimAngle (radians, +up); direction also uses unit.facing.
 *    muzzle = unit pos + offset along aim. Velocity ~ 6..22 px/frame by power.
 *  - Wind sign convention: positive state.wind pushes +x. affectedByWind weapons
 *    (bazooka, cluster bomblets) feel it; grenades/dynamite generally don't.
 * ==========================================================================*/
(function(){
  const C=CA.config, S=CA.state, U=CA.util;

  /* EN translations: weapon display names + combat toasts + crate reward labels.
   * The weapon `name` fields stay Hungarian (they are the i18n keys); ui.js wraps
   * them with CA.t() at display time. */
  CA.i18n.addEN({
    'Capy-csapás':'Capy-Slam', 'CSAPÁS feloldva!':'SLAM unlocked!',
    // ---- weapon names ----
    'Rakéta':'Rocket', 'Gránát':'Grenade', 'Dinamit':'Dynamite',
    'Sörétes':'Shotgun', 'Kazettás':'Cluster', 'Légicsapás':'Airstrike',
    'Capy-bomba':'Capy-Bomb', 'Teleport':'Teleport', 'Portál':'Portal', 'Bökő':'Prod',
    'Fúró':'Drill', 'Tüskegolyó':'Spikeball', 'Rönkdobás':'Log Toss',
    'Hasas':'Belly Flop', 'Tojásbomba':'Egg Bomb', 'Kötél':'Rope',
    'Ejtőernyő':'Parachute', 'Tartó':'Girder', 'Napalm':'Napalm',
    'Gázgránát':'Gas Grenade', 'Akna':'Mine', 'Irányított':'Guided',
    'Időzítő gránát':'Timer Grenade', 'Lézer':'Laser', 'Mágnes-akna':'Magnet Mine',
    'Füstgránát':'Smoke Grenade',
    // ---- NEW weapons / utilities ----
    'Jetpack':'Jetpack', 'Lángvágó':'Blowtorch', 'Önvezérlő rakéta':'Homing Missile',
    'Holdjárás':'Low Gravity', 'Roham-süni':'Charge Hog', 'Mesterlövész':'Sniper',
    'Baseball-ütő':'Baseball Bat', 'MIRV':'MIRV', 'Gurítóbomba':'Roller',
    'Napalm-csapás':'Napalm Strike', 'Akna-csapás':'Mine Strike', 'Befagyás':'Freeze',
    // ---- v4 class ability names ----
    'Csontváz':'Skeleton', 'Zombi':'Zombie', 'Csontlándzsa':'Bone Spear',
    'Pajzsfal':'Shield Wall', 'Földrengés':'Ground Slam', 'Provokáció':'Taunt',
    'Tűzgolyó':'Fireball', 'Fagykör':'Frost Nova', 'Láncvillám':'Chain Lightning',
    'Töltött lövés':'Charged Shot', 'Megjelölés':'Mark Target', 'Sortűz':'Multishot',
    'Falépítés':'Build Wall', 'Lövegtorony':'Deploy Turret', 'Csapda':'Place Trap',
    'Gyógysugár':'Heal Beam', 'Áldás-aura':'Buff Aura', 'Feltámasztás':'Revive',
    // ---- ultra-rare grandiose ultimates ----
    'Mágikus gömb':'Magic Orb', 'Atombomba':'Nuke', 'Tűzgolyók':'Fire Rain',
    'Fekete lyuk':'Black Hole', 'Meteorzápor':'Meteor Shower', 'Földindulás':'Quake',
    // ---- combat toasts ----
    'KOMBÓ':'COMBO', 'KRITIKUS!':'CRITICAL!',
    // ---- status effects ----
    'szédül!':'is dizzy!', 'Dominó!':'Domino!',
    // ---- crate / reward labels ----
    'Élet':'Health', 'Pajzs':'Shield', 'TELI ÉLET!':'FULL HEALTH!',
    'LÖVÉS!':'SHOTS!', 'Készlet':'Supply', 'fegyver':'weapon',
  });

  /* ---- Arsenal ----------------------------------------------------------- */
  const LIST=[
    // power ballistic — the bread & butter; wind matters
    {id:'bazooka', name:'Rakéta',    emoji:'🚀', category:'projectile', ammo:-1, power:true,  radius:55,  damage:45, knockback:1.1, fuse:null, bounce:0,    affectedByWind:true,  endsTurn:true, universal:true},
    // STACK BONUS (Jani): stand on a teammate's head -> the team unlocks one big
    // aimed rocket. Granted via core's stack detector (ammo:0 base). _kind 'shell'
    // (default fire path) = a huge boom; squeak SFX on grant.
    // capyslam: NEM universal — a sávban csak a stack-bónusz grant után jelenik
    // meg (core.checkStackBonus állítja a S._crateWeapons['capyslam']-et); így
    // nincs örökre szürke 🐹 slot a meccs elejétől (QA P2).
    {id:'capyslam', name:'Capy-csapás', emoji:'🐹', category:'special', ammo:0, power:true, radius:78, damage:64, knockback:1.7, fuse:null, bounce:0, affectedByWind:true, endsTurn:true},
    // power throwable — lobbed, bounces, timed
    {id:'grenade', name:'Gránát',    emoji:'💣', category:'throwable',  ammo:-1, power:true,  radius:55,  damage:50, knockback:1.2, fuse:3,    bounce:0.5,  affectedByWind:false, endsTurn:true, universal:true},
    // dropped at feet — big, no power needed
    {id:'dynamite',name:'Dinamit',   emoji:'🧨', category:'throwable',  ammo:3,  power:true,  radius:75,  damage:60, knockback:1.4, fuse:3,    bounce:0.25, affectedByWind:false, endsTurn:true, universal:true},
    // instant hitscan — two pellets, first shot keeps the turn alive
    {id:'shotgun', name:'Sörétes',   emoji:'🔫', category:'gun',        ammo:-1, power:false, radius:28,  damage:34, knockback:0.7, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true, universal:true},
    // power ballistic — splits into bomblets that fall & pop
    {id:'cluster', name:'Kazettás',  emoji:'🧆', category:'projectile', ammo:3,  power:true,  radius:44,  damage:36, knockback:1.0, fuse:2.4,  bounce:0.3,  affectedByWind:true,  endsTurn:true, universal:true},
    // targeted — a flight of bombs along the aim/mouse x
    {id:'airstrike',name:'Légicsapás',emoji:'✈️',category:'special',    ammo:2,  power:false, radius:40,  damage:32, knockback:0.9, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true},
    // a szent capybara-bomba — devastating, single use
    {id:'capybomb',name:'Capy-bomba',emoji:'🐹', category:'special',    ammo:1,  power:true,  radius:110, damage:90, knockback:1.8, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true},
    // utility — relocate, no damage, keeps turn
    {id:'teleport',name:'Teleport',  emoji:'🌀', category:'utility',    ammo:2,  power:false, radius:0,   damage:0,  knockback:0,   fuse:null, bounce:0,    affectedByWind:false, endsTurn:false, universal:true},
    // utility — place a PAIR of linked portals; projectiles (and the firing unit)
    // entering one exit the other with redirected velocity. Keeps the turn.
    {id:'portal',  name:'Portál',    emoji:'🌌', category:'utility',    ammo:4,  power:false, radius:0,   damage:0,  knockback:0,   fuse:null, bounce:0,    affectedByWind:false, endsTurn:false, universal:true},
    // melee — short range shove, can knock foes off cliffs/into water
    {id:'melee',   name:'Bökő',      emoji:'👊', category:'special',    ammo:-1, power:false, radius:28,  damage:18, knockback:3.2, fuse:null, bounce:0,    affectedByWind:false, endsTurn:false},

    /* ===== #8 SPECIES ULTIMATES (once/twice-per-match) ================== */
    // worm: burrowing drill shell — tunnels through terrain then detonates
    {id:'drill',    name:'Fúró',     emoji:'🛠️', category:'special',    ammo:2,  power:true,  radius:60,  damage:52, knockback:1.3, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true},
    // hedgehog: heavy bouncing spiked ball — multi-bounce, contact damage
    {id:'spikeball',name:'Tüskegolyó',emoji:'🦔',category:'special',    ammo:2,  power:true,  radius:48,  damage:34, knockback:1.4, fuse:5,    bounce:0.72, affectedByWind:false, endsTurn:true},
    // beaver: big thrown log — boom + heavy knockback
    {id:'logtoss',  name:'Rönkdobás',emoji:'🪵', category:'special',    ammo:2,  power:true,  radius:62,  damage:46, knockback:2.4, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true},
    // frog: short high lob -> wide shallow crater
    {id:'bellyflop',name:'Hasas',    emoji:'🐸', category:'special',    ammo:2,  power:true,  radius:90,  damage:36, knockback:1.1, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true},
    // bird: lobbed egg that splits into 3 yolk splats
    {id:'eggbomb',  name:'Tojásbomba',emoji:'🥚',category:'special',    ammo:2,  power:true,  radius:40,  damage:28, knockback:0.9, fuse:null, bounce:0,    affectedByWind:true,  endsTurn:true},

    /* ===== #11 MOVEMENT / UTILITY ====================================== */
    // ninja rope/grapple — pulls the unit toward the hit point, keeps turn
    {id:'rope',     name:'Kötél',    emoji:'🪢', category:'utility',    ammo:3,  power:false, radius:0,   damage:0,  knockback:0,   fuse:null, bounce:0,    affectedByWind:false, endsTurn:false},
    // parachute — slows fall while active, keeps turn
    {id:'parachute',name:'Ejtőernyő',emoji:'🪂', category:'utility',    ammo:-1, power:false, radius:0,   damage:0,  knockback:0,   fuse:null, bounce:0,    affectedByWind:false, endsTurn:false, universal:true},
    // girder — place a small solid platform, keeps turn
    {id:'girder',   name:'Tartó',    emoji:'🧱', category:'utility',    ammo:3,  power:false, radius:0,   damage:0,  knockback:0,   fuse:null, bounce:0,    affectedByWind:false, endsTurn:false},

    /* ===== #12 SPREADING HAZARDS ======================================= */
    // napalm shell -> spawns several 'fire' seeds on impact
    {id:'napalm',   name:'Napalm',   emoji:'🔥', category:'projectile', ammo:2,  power:true,  radius:34,  damage:24, knockback:0.8, fuse:null, bounce:0,    affectedByWind:true,  endsTurn:true},
    // gas grenade -> expanding poison cloud
    {id:'gasgrenade',name:'Gázgránát',emoji:'☣️',category:'throwable',  ammo:2,  power:true,  radius:0,   damage:0,  knockback:0,   fuse:2.2,  bounce:0.4,  affectedByWind:false, endsTurn:true},
    // mine — places an armed proximity mine
    {id:'mine',     name:'Akna',     emoji:'⚠️', category:'special',    ammo:3,  power:false, radius:42,  damage:48, knockback:1.3, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true, universal:true},
    // magnet-mine — armed mine that slowly homes toward the nearest enemy
    {id:'magnetmine',name:'Mágnes-akna',emoji:'🧲',category:'special',  ammo:1,  power:true,  radius:46,  damage:46, knockback:1.3, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true},

    /* ===== NEW: timed / tactical ====================================== */
    // timer grenade — like a grenade but with a player-set 1..5s fuse
    {id:'timergrenade',name:'Időzítő gránát',emoji:'⏱️',category:'throwable',ammo:-1,power:true,radius:55,damage:50,knockback:1.2,fuse:3,bounce:0.5,affectedByWind:false,endsTurn:true},
    // bouncing laser — fast straight shot that reflects off terrain a few times
    {id:'laser',    name:'Lézer',    emoji:'⚡', category:'gun',        ammo:3,  power:false, radius:30,  damage:34, knockback:0.8, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true},
    // smoke grenade — no damage, spawns a lingering obscuring smoke cloud
    {id:'smokegrenade',name:'Füstgránát',emoji:'🌫️',category:'throwable',ammo:3,power:true,radius:0,damage:0,knockback:0,fuse:2.2,bounce:0.4,affectedByWind:false,endsTurn:false},

    /* ===== #13 GUIDED ================================================== */
    // steerable rocket — arrow keys / mouse nudge heading for ~2s then boom
    {id:'guided',   name:'Irányított',emoji:'🛰️',category:'projectile', ammo:2,  power:true,  radius:54,  damage:44, knockback:1.1, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true},

    /* ===== v4 CLASS ABILITY WEAPONS ==================================== */
    /* ammo:-1 (infinite, gated by cooldown). cooldown = N of THIS hero's turns. */

    // -- NECRO (summoner) --
    {id:'summon_skeleton', name:'Csontváz', emoji:'💀', icon:'💀', category:'ability', ability:true, cls:'necro', cooldown:1, ammo:-1, power:false, radius:0,  damage:0,  knockback:0,   affectedByWind:false, endsTurn:true},
    {id:'summon_zombie',   name:'Zombi',    emoji:'🧟', icon:'🧟', category:'ability', ability:true, cls:'necro', cooldown:2, ammo:-1, power:false, radius:0,  damage:0,  knockback:0,   affectedByWind:false, endsTurn:true},
    {id:'bone_spear',      name:'Csontlándzsa', emoji:'🦴', icon:'🦴', category:'ability', ability:true, cls:'necro', cooldown:1, ammo:-1, power:true,  radius:40, damage:34, knockback:1.0, affectedByWind:false, endsTurn:true},

    // -- GUARDIAN (tank) --
    {id:'shield_wall', name:'Pajzsfal',   emoji:'🛡️', icon:'🛡️', category:'ability', ability:true, cls:'guardian', cooldown:2, ammo:-1, power:false, radius:0,  damage:0,  knockback:0,   affectedByWind:false, endsTurn:false},
    {id:'ground_slam', name:'Földrengés', emoji:'💥', icon:'💥', category:'ability', ability:true, cls:'guardian', cooldown:1, ammo:-1, power:true,  radius:80, damage:22, knockback:2.6, affectedByWind:false, endsTurn:true},
    {id:'taunt',       name:'Provokáció', emoji:'📢', icon:'📢', category:'ability', ability:true, cls:'guardian', cooldown:2, ammo:-1, power:false, radius:0,  damage:0,  knockback:0,   affectedByWind:false, endsTurn:false},

    // -- MAGE --
    {id:'fireball',       name:'Tűzgolyó',   emoji:'🔥', icon:'🔥', category:'ability', ability:true, cls:'mage', cooldown:2, ammo:-1, power:true,  radius:42, damage:34, knockback:0.9, affectedByWind:false, endsTurn:true},
    {id:'frost_nova',     name:'Fagykör',    emoji:'❄️', icon:'❄️', category:'ability', ability:true, cls:'mage', cooldown:1, ammo:-1, power:true,  radius:50, damage:14, knockback:0.6, affectedByWind:false, endsTurn:true},
    {id:'chain_lightning',name:'Láncvillám', emoji:'⚡', icon:'⚡', category:'ability', ability:true, cls:'mage', cooldown:1, ammo:-1, power:true,  radius:34, damage:30, knockback:0.8, affectedByWind:false, endsTurn:true},

    // -- HUNTER --
    {id:'charged_shot', name:'Töltött lövés', emoji:'🎯', icon:'🎯', category:'ability', ability:true, cls:'hunter', cooldown:1, ammo:-1, power:true,  radius:30, damage:44, knockback:1.3, affectedByWind:true,  endsTurn:true},
    {id:'mark_target',  name:'Megjelölés',    emoji:'🔻', icon:'🔻', category:'ability', ability:true, cls:'hunter', cooldown:2, ammo:-1, power:false, radius:0,  damage:0,  knockback:0,   affectedByWind:false, endsTurn:false},
    {id:'multishot',    name:'Sortűz',        emoji:'🏹', icon:'🏹', category:'ability', ability:true, cls:'hunter', cooldown:2, ammo:-1, power:true,  radius:34, damage:24, knockback:0.8, affectedByWind:true,  endsTurn:true},

    // -- ENGINEER --
    {id:'build_wall',   name:'Falépítés',    emoji:'🧱', icon:'🧱', category:'ability', ability:true, cls:'engineer', cooldown:1, ammo:-1, power:false, radius:0,  damage:0,  knockback:0,   affectedByWind:false, endsTurn:false},
    {id:'deploy_turret',name:'Lövegtorony',  emoji:'🔫', icon:'🔫', category:'ability', ability:true, cls:'engineer', cooldown:3, ammo:-1, power:false, radius:0,  damage:0,  knockback:0,   affectedByWind:false, endsTurn:true},
    {id:'place_trap',   name:'Csapda',       emoji:'⚠️', icon:'⚠️', category:'ability', ability:true, cls:'engineer', cooldown:1, ammo:-1, power:false, radius:44, damage:34, knockback:1.3, affectedByWind:false, endsTurn:false},

    // -- HEALER --
    {id:'heal_beam', name:'Gyógysugár', emoji:'💚', icon:'💚', category:'ability', ability:true, cls:'healer', cooldown:1, ammo:-1, power:false, radius:0, damage:0, knockback:0, affectedByWind:false, endsTurn:false},
    {id:'buff_aura', name:'Áldás-aura', emoji:'✨', icon:'✨', category:'ability', ability:true, cls:'healer', cooldown:2, ammo:-1, power:false, radius:0, damage:0, knockback:0, affectedByWind:false, endsTurn:false},
    {id:'revive',    name:'Feltámasztás', emoji:'😇', icon:'😇', category:'ability', ability:true, cls:'healer', cooldown:4, ammo:-1, power:false, radius:0, damage:0, knockback:0, affectedByWind:false, endsTurn:true},

    /* ===== NEW WEAPONS & MOVEMENT (agent) ============================== */
    // utility — jetpack: a small fuel budget for free flight; keeps the turn
    {id:'jetpack',  name:'Jetpack',   emoji:'🚀', category:'utility',    ammo:2,  power:false, radius:0,   damage:0,  knockback:0,   fuse:null, bounce:0,    affectedByWind:false, endsTurn:false, universal:true},
    // utility — blowtorch: carve a horizontal tunnel in the facing direction
    {id:'blowtorch',name:'Lángvágó',  emoji:'🔦', category:'utility',    ammo:2,  power:false, radius:0,   damage:0,  knockback:0,   fuse:null, bounce:0,    affectedByWind:false, endsTurn:false, universal:true},
    // homing missile — fire-and-forget rocket that steers toward nearest enemy
    {id:'homing',   name:'Önvezérlő rakéta',emoji:'🛸',category:'projectile',ammo:1,power:true, radius:52,  damage:42, knockback:1.1, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true, universal:true},
    // utility — low gravity: floaty turn for everything (units + projectiles)
    {id:'lowgrav',  name:'Holdjárás', emoji:'🌙', category:'utility',    ammo:2,  power:false, radius:0,   damage:0,  knockback:0,   fuse:null, bounce:0,    affectedByWind:false, endsTurn:false, universal:true},
    // walking critter bomb — trots toward the nearest enemy, then explodes
    {id:'chargehog',name:'Roham-süni',emoji:'🦔', category:'special',    ammo:2,  power:false, radius:60,  damage:48, knockback:1.4, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true},
    // sniper rifle — long-range hitscan, charge + distance-scaled damage
    {id:'sniper',   name:'Mesterlövész',emoji:'🎯',category:'gun',       ammo:3,  power:true,  radius:16,  damage:42, knockback:0.9, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true, universal:true},
    // baseball bat — big-knockback directional fling (melee variant)
    {id:'bat',      name:'Baseball-ütő',emoji:'🏏',category:'special',   ammo:-1, power:false, radius:30,  damage:22, knockback:5.0, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true, universal:true},
    // MIRV — artillery shell that splits into several warheads at apex
    {id:'mirv',     name:'MIRV',      emoji:'☄️', category:'projectile', ammo:2,  power:true,  radius:46,  damage:34, knockback:1.0, fuse:null, bounce:0,    affectedByWind:true,  endsTurn:true, universal:true},
    // roller — bomb that hugs the ground into trenches after landing, then booms
    {id:'roller',   name:'Gurítóbomba',emoji:'🎳',category:'projectile', ammo:2,  power:true,  radius:58,  damage:46, knockback:1.2, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true, universal:true},
    // napalm-strike — airstrike variant that drops fire seeds
    {id:'napalmstrike',name:'Napalm-csapás',emoji:'🔥',category:'special',ammo:2,power:false, radius:32,  damage:20, knockback:0.7, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true},
    // mine-strike — airstrike variant that drops armed mines
    {id:'minestrike',name:'Akna-csapás',emoji:'⚠️',category:'special',  ammo:2,  power:false, radius:42,  damage:40, knockback:1.2, fuse:null, bounce:0,    affectedByWind:false, endsTurn:true},
    // freeze — encase self: next incoming hit is reduced; cleared next turn
    {id:'freeze',   name:'Befagyás',  emoji:'🧊', category:'utility',    ammo:2,  power:false, radius:0,   damage:0,  knockback:0,   fuse:null, bounce:0,    affectedByWind:false, endsTurn:false, universal:true},

    /* ===== ULTRA-RARE GRANDIOSE ULTIMATES (ammo:1 each) =================
     * Six showcase weapons. Each is single-use, turn-ending, and routes ALL
     * damage through CA.explode (via boom). Their time-developing behaviour
     * lives on dedicated projectile _kinds handled in update(); the spectacle
     * lives in fx.js. Radii/particle counts are hard-capped so an empty map or
     * a shot over open water can never freeze or throw. */
    // magic orb — a slow glowing sphere that carves a ~30%-of-map horizontal gouge
    {id:'magicorb', name:'Mágikus gömb', emoji:'🔮', category:'special', ammo:0, power:true,  radius:70,  damage:48, knockback:1.2, fuse:null, bounce:0, affectedByWind:false, endsTurn:true},
    // nuke — ~20× a dynamite blast, layered mushroom cloud
    {id:'nuke',     name:'Atombomba',    emoji:'☢️', category:'special', ammo:0, power:false, radius:75,  damage:60, knockback:1.4, fuse:null, bounce:0, affectedByWind:false, endsTurn:true},
    // fire rain — a wide band rains down many exploding fireballs that set fires
    {id:'firerain', name:'Tűzgolyók',    emoji:'🔥', category:'special', ammo:0, power:false, radius:40,  damage:30, knockback:0.9, fuse:null, bounce:0, affectedByWind:false, endsTurn:true},
    // black hole — a gravity vortex that sucks units & debris in, then implodes→booms
    {id:'blackhole',name:'Fekete lyuk',  emoji:'🕳️', category:'special', ammo:0, power:true,  radius:120, damage:80, knockback:2.2, fuse:null, bounce:0, affectedByWind:false, endsTurn:true},
    // meteor shower — several meteors slam in at an angle, each a medium-large boom
    {id:'meteors',  name:'Meteorzápor',  emoji:'☄️', category:'special', ammo:0, power:false, radius:54,  damage:42, knockback:1.3, fuse:null, bounce:0, affectedByWind:false, endsTurn:true},
    // quake — screen-wide shake; terrain collapses at random points; everyone rattled
    {id:'quake',    name:'Földindulás',  emoji:'🌋', category:'special', ammo:0, power:false, radius:64,  damage:26, knockback:1.4, fuse:null, bounce:0, affectedByWind:false, endsTurn:true},
  ];

  // snapshot each weapon's DEFAULT ammo so we can restore it every new match —
  // ammo lives on these shared singletons and was never reset, so finite weapons
  // stayed depleted for the whole browser session (gameplay review #2).
  LIST.forEach(function(w){ w._ammo0 = w.ammo; });

  const byId = (id)=> LIST.find(w=>w.id===id) || LIST[0];

  // ULTRA-RARE grand ultimates — crate-only (base ammo:0, no `universal` flag).
  // Each crate pickup grants exactly ONE charge (see pickupCrate).
  const MEGA_IDS = ['nuke','magicorb','firerain','blackhole','meteors','quake'];
  // tag the ultimates so the HUD can give them a distinct border (Jani).
  MEGA_IDS.forEach(function(id){ var w=LIST.find(function(x){return x.id===id;}); if(w) w._mega=true; });

  // nearest alive enemy unit to (x,y) that is NOT on ownerTeam. Returns unit|null.
  function nearestEnemy(x, y, ownerTeamId){
    let best=null, bd=Infinity;
    const units = (S.units||[]);
    for (const t of units){
      if (!t.alive) continue;
      if (ownerTeamId!=null && t.teamId===ownerTeamId) continue;
      const d = U.dist(x,y,t.x,t.y);
      if (d<bd){ bd=d; best=t; }
    }
    return best;
  }
  function teamOfOwner(ownerId){
    const o = (ownerId!=null) ? CA.getUnit(ownerId) : null;
    return o ? o.teamId : null;
  }

  // nearest alive ALLY HERO (non-minion) on the same team, excluding self.
  // If wantDead is true, returns the nearest DEAD hero teammate instead.
  function nearestAlly(u, wantDead){
    let best=null, bd=Infinity;
    for (const t of (S.units||[])){
      if (!t || t.id===u.id) continue;
      if (t.minion) continue;
      if (t.teamId!==u.teamId) continue;
      if (wantDead ? t.alive : !t.alive) continue;
      const d = U.dist(u.x,u.y,t.x,t.y);
      if (d<bd){ bd=d; best=t; }
    }
    return best;
  }

  // place an ability on cooldown for N of this hero's turns (shared v4 contract).
  // honours a skill-tree cooldown-reduction flag (unit._cdr, integer turns off).
  function setCooldown(u, w){
    if (!u || !w) return;
    u.cooldowns = u.cooldowns || {};
    let cd = w.cooldown||0;
    // per-fire override (e.g. healer's cheap_revive shortens the revive cooldown).
    // Consumed once so it never leaks to other weapons or later turns.
    if (w._cdOverride!=null){ cd = w._cdOverride; w._cdOverride = null; }
    if (u._cdr) cd = Math.max(0, cd - (u._cdr|0));
    u.cooldowns[w.id] = Math.max(0, Math.round(cd));
  }

  // a safe spot just in front of (or beside) the unit to drop a minion/structure.
  // Tries the facing side first, clamps to world, lifts out of solid terrain.
  function frontSpot(u, dist){
    const d = (dist==null?34:dist);
    let x = u.x + u.facing*d;
    x = U.clamp(x, C.UNIT_R, C.WORLD_W-C.UNIT_R);
    let y = u.y;
    if (CA.Terrain && CA.Terrain.heightAt){
      var gy = CA.Terrain.heightAt(x) - C.UNIT_R;
      // ONLY adopt the ground at the front-x if it sits near the CASTER's own
      // level. On multi-platform maps heightAt() returns the surface of whatever
      // platform spans that column — which could be an OVERHEAD platform — so the
      // minion was being dropped onto a DIFFERENT (higher) platform far from the
      // caster (Jani: "a felső platformra rakta"). If the front ground is well
      // above/below the caster, keep the minion beside the caster and let physics
      // settle it onto the caster's own platform.
      if (Math.abs(gy - u.y) <= C.UNIT_R*3) y = gy;
    }
    if (CA.Terrain && CA.Terrain.isSolid){
      let guard=0;
      while (CA.Terrain.isSolid(x,y) && y>0 && guard++<300) y -= 2;
    }
    y = U.clamp(y, 0, (S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL)-C.UNIT_R);
    return { x, y };
  }

  // FIX 1 — self-contained floating reward texts (crate pickups, etc).
  // Each: {x,y,text,life,maxLife,color}. Advanced in update(), drawn in render().
  const FLOATERS = [];
  // #5 self-contained obscuring smoke puffs (drawn in render, fade over ~2 turns)
  const SMOKE = [];
  // v4 chain-lightning arcs (self-contained, drawn for a few frames in render)
  const LIGHTNING = [];

  /* ---- PORTAL weapon (MED genre feature) --------------------------------
   * SCOPE: this is a PROJECTILE-redirection + SELF-TELEPORT tool, kept entirely
   * inside weapons.js (the projectile update path we own). It does NOT teleport
   * OTHER units mid-flight — full unit-through-portal would need entities.js
   * physics, which this agent must NOT touch. So:
   *   • Firing places a PAIR of linked portals (1st shot = A, 2nd shot = B).
   *   • Any in-flight projectile that enters A is relocated to B (and vice-versa)
   *     with its velocity ROTATED to exit along the portal's facing.
   *   • Completing the pair self-teleports the FIRING unit to portal A (reusing
   *     the same relocation logic as the teleport weapon) — a strong repositioner.
   * PORTALS holds the live pair: { a:{x,y,ang}, b:{x,y,ang}, ownerId }. ang is the
   * exit direction (radians). Cleared at turnEnd and on a fresh game. */
  let PORTALS = { a:null, b:null, ownerId:null };
  const PORTAL_R = 22;            // entry/exit mouth radius
  let _portalCooldown = 0;        // frames a projectile is immune after warping (avoid ping-pong)
  let _portalTurns = 0;           // turn-ends a COMPLETED pair survives (multi-use, any unit)
  const PORTAL_LIFE_TURNS = 3;    // a placed pair stays usable for ~3 turns

  // Walk/fall a UNIT through a live portal pair (Jani: "más is belemehessen meg én
  // is többször"). ANY unit overlapping a mouth is relocated to the OTHER mouth,
  // nudged clear along its exit facing, with a per-unit cooldown so it can't
  // ping-pong. Momentum is preserved (rotated to the exit direction).
  function tryPortalUnit(u){
    if (!PORTALS.a || !PORTALS.b || !u || !u.alive) return;
    if ((u._portalCd||0) > 0) return;
    let from=null, to=null;
    const reach = PORTAL_R + C.UNIT_R*0.5;
    if (U.dist(u.x,u.y, PORTALS.a.x,PORTALS.a.y) <= reach){ from=PORTALS.a; to=PORTALS.b; }
    else if (U.dist(u.x,u.y, PORTALS.b.x,PORTALS.b.y) <= reach){ from=PORTALS.b; to=PORTALS.a; }
    if (!from) return;
    const out = PORTAL_R + C.UNIT_R + 6;
    u.x = U.clamp(to.x + Math.cos(to.ang)*out, C.UNIT_R, C.WORLD_W-C.UNIT_R);
    u.y = U.clamp(to.y + Math.sin(to.ang)*out, 0, (S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL)-C.UNIT_R);
    const sp = Math.hypot(u.vx, u.vy);
    u.vx = Math.cos(to.ang)*sp; u.vy = Math.sin(to.ang)*sp;
    u.grounded = false;
    u._portalCd = 26;             // ~0.43s before this unit can warp again
    try{ if (CA.events) CA.events.emit('sfx','teleport'); }catch(e){}
    if (fx() && fx().spawnParticles){
      fx().spawnParticles({x:from.x,y:from.y,count:6,spdMin:0.5,spdMax:2,life:16,size:3,color:'#5bd6ff'});
      fx().spawnParticles({x:to.x,  y:to.y,  count:8,spdMin:0.6,spdMax:2.4,life:18,size:3,color:'#b07bff'});
    }
  }
  function addFloater(x, y, text, color){
    if (!text) return;
    FLOATERS.push({ x, y, text, life:90, maxLife:90, color:color||'#fff' });
  }

  // shotgun's "first of two" tracking, reset on each turn
  let shotgunShotsLeft = 0;

  CA.events.on('turnStart', ()=>{ shotgunShotsLeft = 0; });

  /* ---- helpers ----------------------------------------------------------- */

  // speed in px/frame from charge power (0..1)  ~6..22
  function chargeSpeed(power){ return 6 + U.clamp(power,0,1)*16; }

  // muzzle position for a unit (slightly forward + up from center)
  function muzzle(u){ return { x:u.x + u.facing*16, y:u.y - 8 }; }

  // initial velocity for a launched/lobbed projectile
  function launchVel(u, power, speedScale){
    const a = -u.aimAngle;               // +aimAngle = up; canvas y is down
    const sp = chargeSpeed(power) * (speedScale||1);
    return { vx: Math.cos(a)*sp*u.facing, vy: Math.sin(a)*sp };
  }

  function spawnProjectile(o){
    // QA P2/P3: capture the owner's team AT FIRE TIME. Once the firing unit dies,
    // teamOfOwner()/S.units.find() returns null → the friend-skip guard is bypassed
    // and the live projectile (held by core for the full turn) homes onto / hits the
    // shooter's OWN teammates. _ownerTeam is the stable fallback for every guard.
    const _ot = (o._ownerTeam !== undefined && o._ownerTeam !== null)
              ? o._ownerTeam : teamOfOwner(o.ownerId);
    const p = {
      id:U.nextId(), weaponId:o.weaponId, ownerId:o.ownerId,
      x:o.x, y:o.y, vx:o.vx||0, vy:o.vy||0, r:o.r||5,
      affectedByWind: !!o.affectedByWind,
      fuse: (o.fuse===undefined ? null : o.fuse),
      bounce: o.bounce||0,
      spriteRot:0, alive:true,
      _w:o._w, _kind:o._kind||'shell',
      _ownerTeam: (_ot!=null ? _ot : null),
      data:o.data||{},
    };
    S.projectiles.push(p);
    return p;
  }

  function trail(p, color){
    if (CA.FX && CA.FX.spawnParticles && (S.frame & 1)===0){
      CA.FX.spawnParticles({ x:p.x, y:p.y, count:1, spdMin:0.1, spdMax:0.6,
        life:14, size:2.5, color:color||'#bbb' });
    }
  }

  function puff(x,y,color,count){
    if (CA.FX && CA.FX.spawnParticles)
      CA.FX.spawnParticles({ x, y, count:count||8, spdMin:0.5, spdMax:3,
        life:18, size:3, color:color||'#ccc' });
  }

  // Physical ammunition becomes inert in water. Magical projectiles and the
  // terrain-boring phase of the drill retain their own special integrators.
  const SINKING_KINDS = new Set(['shell','bomblet','bomb','napalmbomb','minebomb',
    'cluster','dynamite','timergrenade','magnetmine','spikeball','log','bellyflop',
    'egg','yolk','roller','capybomb','capyslam','guided','homing','mirv','napalm',
    'gas','smoke','bonespear','arrow','chargedshot','drill']);
  function canSink(p){
    if (p._kind==='drill' && p.data && p.data.tunnel>0) return false;
    return p.fuse!=null || SINKING_KINDS.has(p._kind);
  }
  function waterBubbles(p, wl, count){
    if (CA.FX && CA.FX.waterBubbles){
      CA.FX.waterBubbles(p.x, Math.max(wl+3,p.y), count, wl);
    } else if (CA.FX && CA.FX.spawnParticles){
      CA.FX.spawnParticles({x:p.x, y:Math.max(wl+3,p.y), count,
        angle:-Math.PI/2, spread:0.35, spdMin:0.6, spdMax:1.3,
        gravity:-0.008, life:24, size:2, color:'#c8eeff'});
    }
  }
  function sinkProjectile(p, wl, x0, y0){
    if (p._submerged) return;
    // Stop at the first surface crossing, even on a long/fast simulation step.
    if (y0!=null && y0+p.r<wl && p.y>y0){
      const t=U.clamp((wl-p.r-y0)/(p.y-y0),0,1);
      p.x=x0+(p.x-x0)*t;
      p.y=wl-p.r+0.1;
    }
    p._submerged=true;
    p.data=p.data||{};
    p.data.waterEntry={x:p.x,y:wl};
    p.data.submergedLife=0;
    const rocket=(p.weaponId==='bazooka' || p._kind==='guided' || p._kind==='homing');
    p.data.maxSubmergedLife=rocket?36:84; // finite, independent of a live fuse
    p.data.bubbleCd=8;
    p.vx=0;
    p.vy=U.clamp(Math.abs(p.vy)*0.16+1.1,1.2,3.2);
    p.affectedByWind=false;
    if (p.id===S._guidedId) S._guidedId=null;
    if (CA.FX && CA.FX.waterSplash) CA.FX.waterSplash(p.x,wl,rocket?0.55:0.8);
    else { puff(p.x,wl,'#bfe6ff',10); CA.events.emit('sfx','splash'); }
    waterBubbles(p,wl,3);
  }
  function updateSubmerged(p,k,wl){
    p.data.submergedLife+=k;
    p.vx=0; // no wind, portals, homing, contact damage or underwater carving
    p.vy=Math.min(3.4,p.vy+0.026*k);
    p.y=Math.max(wl-p.r+0.1,p.y+p.vy*k);
    p.spriteRot=U.lerp(p.spriteRot,Math.PI/2,Math.min(1,0.08*k));
    p.data.bubbleCd-=k;
    if (p.data.bubbleCd<=0){ waterBubbles(p,wl,2); p.data.bubbleCd=9; }
    if (p.data.submergedLife>=p.data.maxSubmergedLife || p.y>C.WORLD_H+40){
      p.alive=false;
    }
  }
  function reboundProjectile(p,contact,sx,sy){
    let c=contact;
    if (!c){
      const t=CA.Terrain;
      let nx=(t.isSolid(sx-3,sy)?1:0)-(t.isSolid(sx+3,sy)?1:0);
      let ny=(t.isSolid(sx,sy-3)?1:0)-(t.isSolid(sx,sy+3)?1:0);
      const len=Math.hypot(nx,ny);
      if (len>0){ nx/=len; ny/=len; } else { nx=0; ny=-1; }
      c={nx,ny,depth:0};
    }
    // The sweep left us at its last clear point; a small normal nudge prevents
    // the same pixels catching the outgoing grenade again on the next frame.
    p.x+=c.nx*0.5;
    p.y+=c.ny*0.5;
    const dot=p.vx*c.nx+p.vy*c.ny;
    if (dot<0){
      p.vx=(p.vx-2*dot*c.nx)*p.bounce;
      p.vy=(p.vy-2*dot*c.ny)*p.bounce;
      p.vx*=0.86; // retain the existing friction and restitution balance
    }
    if (Math.hypot(p.vx,p.vy)<0.6){ p.vx*=0.5; p.vy=0; }
    p.spriteRot=Math.atan2(p.vy,p.vx);
    CA.events.emit('sfx','tick');
  }

  /* ---- combo (#7) + critical-head-hit (#8) ------------------------------- */
  // Wrap a CA.explode call: detect multi-enemy combos and head-crits, emit the
  // appropriate events, and deliver a small crit-bonus through CA.explode too.
  // ownerTeamId lets us count only ENEMIES of the firing unit.
  // isAbility: the detonating weapon is an actual class ABILITY (w.ability).
  // The skill-tree _dmgMul (mage elemental / hunter aimed / engineer turret +
  // the mage +15% passive) is meant for ability damage ONLY — applying it to a
  // hero's plain bazooka/grenade/shotgun was a balance bug. The outgoing buff
  // aura (outgoingDamageMult) still applies to ALL shots (intended).
  function boom(x, y, radius, dmg, kb, ownerId, isAbility, data){
    const ownerTeam = teamOfOwner(ownerId);
    // resolve the firing unit so the skill-tree multipliers actually bite
    const owner = (ownerId!=null) ? CA.getUnit(ownerId) : null;
    // QA3 #3 — the projectile may already carry an EXPLICIT, pre-applied crit
    // (charged_shot bakes ×1.35 into dmg + clears _critNext at fire time). When it
    // does, boom must NOT roll/force its own crit on top → that was the double-dip.
    const explicitCrit = !!(data && data.crit);
    // ── scale ability damage ONCE at the top: tree _dmgMul × outgoing buffs ──
    if (owner){
      if (isAbility) dmg *= (owner._dmgMul||1);
      dmg *= (CA.Entities && CA.Entities.outgoingDamageMult) ? CA.Entities.outgoingDamageMult(owner) : 1;
      // FIX #12 — honour the double-damage crate reward: ×2 this shot, then clear
      // the flag so it only applies once. (granted by grantRandomReward 'double'.)
      if (owner.nextShotDouble){
        dmg *= 2;
        owner.nextShotDouble = false;
        try{ CA.events.emit('toast', '✖2 '+CA.t('LÖVÉS!')); }catch(e){}
      }
    }
    // ── flat crit roll: owner crit chance + hunter 'sniper' passive base 15% ──
    // QA3 #3: if the projectile already baked an explicit crit, skip the roll
    // entirely (no extra force, no supplemental blast) — use the damage as-is.
    let forcedCrit=false;
    if (!explicitCrit){
      const cls = owner && CA.classOf && CA.classOf(owner);
      const critCh = (owner && owner._critBonus || 0) + ((cls && cls.passive==='sniper') ? 0.15 : 0);
      if (critCh>0 && Math.random() < critCh) forcedCrit=true;
      // QA3 #2: mark_target (_critNext) now buffs the owner's NEXT shot of ANY
      // kind. charged_shot already consumed+baked it at fire time, so we only see
      // _critNext here for OTHER weapons → force the crit and consume it once.
      if (owner && owner._critNext){
        forcedCrit = true;
        owner._critNext = false;
      }
    }
    // gather enemy units that sit inside the blast (pre-explode snapshot)
    let critUnit=null, critBest=Infinity, hits=0, nearestHit=null, nearestD=Infinity;
    // STUN ("Szédülés") — record each enemy hit + the damage the blast is about to
    // deal it (mirrors entities.damageInRadius falloff) so AFTER the explode we can
    // daze any SURVIVOR that took a big single hit. Cheap: a tiny array per blast.
    const STUN_THRESHOLD = 32;   // a single hit ≥ this dazes a survivor for its next turn
    let stunCands = null;
    if (radius>0){
      for (const t of (S.units||[])){
        if (!t.alive) continue;
        if (ownerTeam!=null && t.teamId===ownerTeam) continue;
        const d = U.dist(x,y,t.x,t.y);
        if (d <= radius + C.UNIT_R){
          hits++;
          if (d < nearestD){ nearestD=d; nearestHit=t; }
          // head crit: blast centre is ABOVE the unit centre (near the head)
          // and close to the top of the unit.
          const headY = t.y - C.UNIT_R*0.7;
          const hd = U.dist(x,y,t.x,headY);
          if (y < t.y - 2 && hd < C.UNIT_R*1.1 && hd < critBest){ critBest=hd; critUnit=t; }
          // estimate the HP damage this blast will land on t (same falloff as
          // entities.damageInRadius). Never stun the firing owner.
          if (t.id !== ownerId){
            const reach = radius + C.UNIT_R;
            const f = U.clamp(1 - d/reach, 0, 1);
            const est = dmg * f;
            if (est >= STUN_THRESHOLD){
              if (!stunCands) stunCands = [];
              stunCands.push(t);
            }
          }
        }
      }
    }
    // a rolled crit (skill/sniper) forces the existing crit branch onto whoever
    // got hit, even when the blast wasn't a clean headshot.
    if (forcedCrit && !critUnit && nearestHit) critUnit = nearestHit;

    // the main blast
    CA.explode(x, y, radius, dmg, kb);

    // #7 combo: a single shot that catches 2+ enemies
    if (hits>=2){
      try{
        CA.events.emit('combo', hits);
        CA.events.emit('toast', '🔥 '+CA.t('KOMBÓ')+' ×'+hits+'!');
      }catch(e){}
    }
    // #8 crit: ~+40% bonus delivered as a tiny supplemental blast on the head,
    // routed through CA.explode (radius small enough to not really carve).
    if (critUnit){
      try{ CA.events.emit('crit', critUnit); }catch(e){}
      try{ CA.events.emit('toast', '💥 '+CA.t('KRITIKUS!')); }catch(e){}
      const bonus = dmg * (forcedCrit ? 0.5 : 0.4);
      const bx = critUnit.x, by = critUnit.y - C.UNIT_R*0.7;
      CA.explode(bx, by, 6, bonus, kb*0.3);
      puff(bx, by, '#ff5', 10);
    }
    // STUN ("Szédülés") — a big single hit dazes a SURVIVING unit so it skips its
    // NEXT turn (core.js startTurn consumes u.stunned). Cap 1 so it can lose at
    // most one turn from this. Dead units / the firing owner are never stunned.
    if (stunCands){
      let dazed=false;
      for (const t of stunCands){
        if (!t || !t.alive) continue;        // died in the blast → no point dazing
        if ((t.stunned||0) >= 1) continue;   // already pending a skip — cap at 1
        t.stunned = 1;
        if (t.anim) t.anim.stunPop = 1;       // brief render pop (entities.js)
        dazed=true;
      }
      if (dazed){ try{ CA.events.emit('sfx','tick'); }catch(e){} }
    }
  }

  /* ---- detonation -------------------------------------------------------- */
  function detonate(p){
    if (!p.alive) return;
    p.alive = false;
    if (p.id===S._guidedId) S._guidedId=null;
    if (p._submerged) return; // expired inert ammunition never explodes underwater
    const w = p._w || byId(p.weaponId);

    if (p._kind==='smoke'){
      // no damage — just a thick, lingering smoke cloud (#5)
      spawnSmoke(p.x, p.y);
      CA.events.emit('sfx','tick');
      return;
    }

    if (p._kind==='laser'){
      // small radius pop on expiry / final bounce (#3)
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      return;
    }

    if (p._kind==='magnetmine'){
      // armed magnet-mine reached its target -> standard blast (#4)
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      return;
    }

    if (p._kind==='cluster'){
      // primary pop, then scatter bomblets
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      const n = 5;
      for (let i=0;i<n;i++){
        const ang = -Math.PI/2 + U.rand(-0.9, 0.9);
        const sp  = U.rand(3, 6.5);
        spawnProjectile({
          weaponId:'cluster', ownerId:p.ownerId,
          x:p.x, y:p.y - 4,
          vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp,
          r:3, affectedByWind:true, fuse:null, bounce:0,
          _w:{ radius:32, damage:26, knockback:0.8 }, _kind:'bomblet',
        });
      }
      return;
    }

    if (p._kind==='napalm'){
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      spawnNapalm(p.x, p.y);
      return;
    }

    // homing missile: standard blast where it finally connects (#3 high-pri)
    if (p._kind==='homing'){
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      return;
    }

    // roller: standard blast once it has rolled into a trench / hit something (#9)
    if (p._kind==='roller'){
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      return;
    }

    // napalm-strike bomb: blast + a patch of fire seeds (airstrike variant #10)
    if (p._kind==='napalmbomb'){
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      spawnNapalm(p.x, p.y);
      return;
    }

    // mine-strike bomb: a soft pop, then it leaves an armed proximity mine (#10)
    if (p._kind==='minebomb'){
      CA.explode(p.x, p.y, 14, 6, 0.4);
      if (CA.Hazards && CA.Hazards.add)
        CA.Hazards.add('mine', p.x, p.y-4, { ownerId:p.ownerId, r:w.radius, dmg:w.damage, kb:w.knockback });
      else
        boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);  // no hazard hook → just blast
      return;
    }

    // MIRV: the SHELL itself just blasts if it somehow reaches here without having
    // split; the warheads it spawns are plain shells handled by the default below.
    if (p._kind==='mirv'){
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      return;
    }

    if (p._kind==='gas'){
      // small pop, then a poison cloud
      CA.explode(p.x, p.y, 14, 6, 0.4);
      spawnGas(p.x, p.y, p.ownerId);
      return;
    }

    if (p._kind==='fireball'){
      // impact blast + a lingering fire zone (reuse the napalm hazard seeds)
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      spawnNapalm(p.x, p.y, (p.data && p.data.zoneTurns) || 0);
      return;
    }

    if (p._kind==='frost'){
      // small AoE + a slippery/slow frost zone around the impact
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      spawnFrost(p.x, p.y, p.ownerId, (p.data && p.data.zoneTurns) || 0);
      // FROST NOVA: anything caught in the freeze loses its NEXT turn (Jani:
      // "ha lefagyasztom, 1 köre maradjon ki"). startTurn consumes u.stunned.
      try{ var _fr=w.radius, _fo=p.ownerId, _FU=(CA.state&&CA.state.units)||[];
        for(var _fi=0;_fi<_FU.length;_fi++){ var _ft=_FU[_fi];
          if(_ft && _ft.alive && _ft.id!==_fo && U.dist(p.x,p.y,_ft.x,_ft.y) < _fr+C.UNIT_R){
            if((_ft.stunned||0)<1){ _ft.stunned=1; if(_ft.anim) _ft.anim.stunPop=1; } } }
      }catch(e){}
      return;
    }

    if (p._kind==='chainlight'){
      // hit the impact point, then arc to 2 more nearest enemies
      const ownerTeam = teamOfOwner(p.ownerId);
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      let fx=p.x, fy=p.y;
      const hit = {};
      for (let c=0;c<2;c++){
        let best=null, bd=Infinity;
        for (const t of (S.units||[])){
          if (!t.alive) continue;
          if (ownerTeam!=null && t.teamId===ownerTeam) continue;
          if (hit[t.id]) continue;
          const d=U.dist(fx,fy,t.x,t.y);
          if (d<bd && d<220){ bd=d; best=t; }
        }
        if (!best) break;
        hit[best.id]=true;
        // draw an arc (self-contained, lives a few frames)
        LIGHTNING.push({ x1:fx, y1:fy, x2:best.x, y2:best.y-4, life:10, maxLife:10 });
        boom(best.x, best.y-4, w.radius*0.85, Math.round(w.damage*0.75), w.knockback*0.8, p.ownerId, w && w.ability);
        puff(best.x, best.y, '#bdf', 8);
        fx=best.x; fy=best.y-4;
      }
      return;
    }

    /* ===== ULTRA-RARE GRANDIOSE ULTIMATES (detonation) ================== */
    // nuke: ~20× dynamite via concentric blasts + mushroom cloud
    if (p._kind==='nuke'){
      nukeBlast(p.x, p.y, p.ownerId);
      return;
    }
    // magic orb: a final magical blast where it stops (carving happens in update)
    if (p._kind==='magicorb'){
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      if (CA.FX && CA.FX.magicGlow) CA.FX.magicGlow(p.x, p.y, w.radius*1.3);
      return;
    }
    // fire-rain fireball: blast + a fire patch (reuse napalm hazard seeds / FX)
    if (p._kind==='firemeteor'){
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      spawnNapalm(p.x, p.y);
      if (CA.FX && CA.FX.magicGlow) {} // (fire glow handled by explosion FX)
      return;
    }
    // meteor: a medium-large blast where it lands
    if (p._kind==='meteor'){
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      return;
    }
    // black hole: plant the vortex; the implosion boom fires when the vortex ends
    if (p._kind==='blackhole'){
      S._blackhole = { x:p.x, y:p.y, t: 150, max:150, r: w.radius, ownerId:p.ownerId,
                       dmg:w.damage, kb:w.knockback };
      if (CA.FX && CA.FX.vortex) CA.FX.vortex(p.x, p.y, w.radius);
      try{ CA.events.emit('sfx','tick'); }catch(e){}
      return;
    }

    if (p._kind==='egg'){
      // primary splat, then 3 yolk bomblets
      boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
      for (let i=0;i<3;i++){
        const ang=-Math.PI/2 + (i-1)*0.55 + U.rand(-0.12,0.12);
        const sp=U.rand(2.4,4.5);
        spawnProjectile({ weaponId:'eggbomb', ownerId:p.ownerId, x:p.x, y:p.y-4,
          vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp, r:4, affectedByWind:true, fuse:null, bounce:0,
          _w:{ radius:26, damage:16, knockback:0.7 }, _kind:'yolk' });
      }
      return;
    }

    boom(p.x, p.y, w.radius, w.damage, w.knockback, p.ownerId, w && w.ability, p.data);
  }

  /* ---- instant weapons --------------------------------------------------- */

  // hitscan along the aim line: carve a small crater at first solid/unit hit
  function fireHitscan(u, w){
    const a = -u.aimAngle;
    const dx = Math.cos(a)*u.facing, dy = Math.sin(a);
    const m = muzzle(u);
    const MAX = 420, STEP = 4;
    let hx = m.x + dx*MAX, hy = m.y + dy*MAX, hit = false;
    for (let d=8; d<=MAX; d+=STEP){
      const px = m.x + dx*d, py = m.y + dy*d;
      // muzzle flash trail
      if ((d % 16)===0) puff(px, py, '#fe9', 1);
      if (px<0||px>C.WORLD_W||py<0||py>C.WORLD_H){ hx=px; hy=py; break; }
      // unit hit (skip self)
      let unitHit=false;
      for (const t of S.units){
        if (!t.alive || t.id===u.id) continue;
        if (U.dist(px,py,t.x,t.y) <= C.UNIT_R){ unitHit=true; break; }
      }
      if (unitHit){ hx=px; hy=py; hit=true; break; }
      if (CA.Terrain && CA.Terrain.isSolid(px,py)){ hx=px; hy=py; hit=true; break; }
    }
    puff(hx, hy, '#f80', 10);
    boom(hx, hy, w.radius, w.damage, w.knockback, u.id, w && w.ability);
  }

  // short-range shove in the aim direction
  function fireMelee(u, w){
    const a = -u.aimAngle;
    const dx = Math.cos(a)*u.facing, dy = Math.sin(a);
    const reach = 34;
    const hx = u.x + dx*reach, hy = u.y - 6 + dy*reach;
    puff(hx, hy, '#fff', 8);
    CA.events.emit('sfx','hit');   // a POKE/bonk — NOT an explosion (Jani: ne explode hang)
    // direct hit + a hefty directional shove — NO terrain carve, NO explosion FX.
    // (was boom() = the explosion pipeline, which looked/sounded like a blast.)
    for (const t of S.units){
      if (!t.alive || t.id===u.id) continue;
      if (U.dist(hx,hy,t.x,t.y) <= w.radius + C.UNIT_R){
        try{ CA.Entities.damage(t, w.damage, {x:hx,y:hy}); }catch(e){ t.hp-=w.damage; if(t.hp<=0)t.alive=false; }
        t.vx += dx*7; t.vy += -3.2; t.grounded=false;   // directional poke
      }
    }
  }

  // true only when the FULL unit body (head..feet) is clear of solid terrain at
  // (x,y). The center-only isSolid check let teleport bury a unit in a thick
  // hill/ledge: the head clears but the body stays embedded, the leg push-out
  // guard can't lift it out, worldSettled() never trips and the unit stuck the
  // next turn (Jani: "2× teleport után beragad"). We probe the whole height.
  function bodyClear(x, y){
    if (!(CA.Terrain && CA.Terrain.isSolid)) return true;
    if (CA.Terrain.isSolid(x, y)) return false;             // center
    if (CA.Terrain.isSolid(x, y - C.UNIT_R)) return false;  // head
    if (CA.Terrain.isSolid(x, y + C.UNIT_R*0.8)) return false; // feet
    return true;
  }
  // find the nearest fully-clear spot to (tx,ty): first walk straight up, then
  // probe sideways at each height. Returns {x,y} or null if nothing fits.
  function nearestClearSpot(tx, ty){
    const WL = (S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL);
    const stepUp = 4, stepSide = C.UNIT_R, maxUp = 240, maxSide = C.UNIT_R*6;
    for (let dy=0; dy<=maxUp; dy+=stepUp){
      const cy = ty - dy;
      if (cy < C.UNIT_R) break;
      if (bodyClear(tx, cy)) return { x:tx, y:cy };
      for (let dx=stepSide; dx<=maxSide; dx+=stepSide){
        const lx = U.clamp(tx-dx, C.UNIT_R, C.WORLD_W-C.UNIT_R);
        const rx = U.clamp(tx+dx, C.UNIT_R, C.WORLD_W-C.UNIT_R);
        if (cy < WL-C.UNIT_R && bodyClear(lx, cy)) return { x:lx, y:cy };
        if (cy < WL-C.UNIT_R && bodyClear(rx, cy)) return { x:rx, y:cy };
      }
    }
    return null;
  }

  // relocate the active unit to the aimed/mouse spot (no damage).
  // Returns true if it teleported, false to FIZZLE (no move, no ammo/turn spent)
  // when the target can't fit anywhere clear.
  function fireTeleport(u){
    let tx = S.input.mouseWorldX, ty = S.input.mouseWorldY;
    if (!(tx>0 && tx<C.WORLD_W)){ // fall back to a spot in front along aim
      const a=-u.aimAngle; tx = u.x + Math.cos(a)*u.facing*180; ty = u.y - 80;
    }
    tx = U.clamp(tx, C.UNIT_R, C.WORLD_W-C.UNIT_R);
    ty = U.clamp(ty, 0, (S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL)-C.UNIT_R);
    // resolve a spot where the WHOLE body fits (not just the center) so the unit
    // never ends up embedded in thick terrain.
    const spot = nearestClearSpot(tx, ty);
    if (!spot){ // nowhere safe -> fizzle (don't move, don't consume the turn)
      puff(tx, ty, '#bbb', 4);
      CA.events.emit('sfx','tick');
      return false;
    }
    puff(u.x, u.y, '#9cf', 16);
    u.x = spot.x; u.y = spot.y; u.vx=0; u.vy=0; u.grounded=false;
    puff(spot.x, spot.y, '#9cf', 16);
    CA.events.emit('sfx','jump');
    try{ CA.events.emit('sfx','teleport'); }catch(e){}
    return true;
  }

  // resolve the aimed/mouse spot for placing a portal (same model as teleport),
  // lifted out of solid ground so the mouth isn't buried. Returns {x,y}.
  function portalSpot(u){
    let tx = S.input.mouseWorldX, ty = S.input.mouseWorldY;
    if (!(tx>0 && tx<C.WORLD_W)){
      const a=-u.aimAngle; tx = u.x + Math.cos(a)*u.facing*180; ty = u.y - 80;
    }
    tx = U.clamp(tx, PORTAL_R, C.WORLD_W-PORTAL_R);
    ty = U.clamp(ty, PORTAL_R, (S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL)-PORTAL_R);
    if (CA.Terrain && CA.Terrain.isSolid){
      let guard=0;
      while (CA.Terrain.isSolid(tx,ty) && ty>PORTAL_R && guard++<400) ty -= 2;
    }
    return { x:tx, y:ty };
  }

  // PORTAL: 1st fire places A, 2nd places B (completing the link); a 3rd fire
  // resets and starts a fresh A. Each portal's exit direction (ang) points from
  // the firing unit toward the placed spot, so warped projectiles fly "outward".
  // Returns true (always consumes a charge — placing a portal is the action).
  function firePortal(u){
    const s = portalSpot(u);
    const ang = Math.atan2(s.y - (u.y-8), s.x - u.x);  // unit -> spot heading
    if (!PORTALS.a || (PORTALS.a && PORTALS.b) || PORTALS.ownerId!==u.id){
      // start a fresh pair (first portal, or reset after a completed pair / new owner)
      PORTALS = { a:{ x:s.x, y:s.y, ang:ang }, b:null, ownerId:u.id };
      puff(s.x, s.y, '#a6f', 16);
      try{ CA.events.emit('toast', '🌌 A'); }catch(e){}
      CA.events.emit('sfx','jump');
    } else {
      // place the second portal, completing the link
      PORTALS.b = { x:s.x, y:s.y, ang:ang };
      _portalTurns = PORTAL_LIFE_TURNS;   // the live pair now survives a few turns
      puff(s.x, s.y, '#6cf', 16);
      // SELF-TELEPORT option: warp the firing unit to portal A so it's instantly
      // useful as a repositioner. Resolve a FULL-body-clear spot (same rule as
      // fireTeleport) so the unit never ends up embedded in thick terrain; if
      // portal A sits inside a solid block with no room, skip the warp but still
      // complete the link (the portal pair itself is the action).
      const ax0 = U.clamp(PORTALS.a.x, C.UNIT_R, C.WORLD_W-C.UNIT_R);
      const ay0 = U.clamp(PORTALS.a.y, 0, (S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL)-C.UNIT_R);
      const aspot = nearestClearSpot(ax0, ay0);
      if (aspot){
        puff(u.x, u.y, '#a6f', 16);
        u.x = aspot.x; u.y = aspot.y; u.vx=0; u.vy=0; u.grounded=false;
        puff(aspot.x, aspot.y, '#6cf', 16);
      }
      try{ CA.events.emit('toast', '🌌 B'); }catch(e){}
      CA.events.emit('sfx','jump');
      try{ CA.events.emit('sfx','teleport'); }catch(e){}   // completing the link warps the unit
    }
    return true;
  }

  // teleport a projectile from one portal mouth to the other, rotating its
  // velocity so it exits along the destination portal's facing (ang). Called
  // from the projectile update loop while a complete pair exists.
  function tryPortalProjectile(p){
    if (!PORTALS.a || !PORTALS.b) return false;
    if (_portalCooldown>0) return false;
    let from=null, to=null;
    if (U.dist(p.x,p.y, PORTALS.a.x,PORTALS.a.y) <= PORTAL_R){ from=PORTALS.a; to=PORTALS.b; }
    else if (U.dist(p.x,p.y, PORTALS.b.x,PORTALS.b.y) <= PORTAL_R){ from=PORTALS.b; to=PORTALS.a; }
    if (!from || !to) return false;
    const speed = Math.hypot(p.vx,p.vy) || 6;
    // exit just outside the destination mouth, flying along its facing
    p.x = to.x + Math.cos(to.ang)*(PORTAL_R+2);
    p.y = to.y + Math.sin(to.ang)*(PORTAL_R+2);
    p.vx = Math.cos(to.ang)*speed;
    p.vy = Math.sin(to.ang)*speed;
    p.spriteRot = to.ang;
    _portalCooldown = 8;          // brief immunity so it doesn't instantly re-enter
    puff(from.x, from.y, '#a6f', 10);
    puff(to.x, to.y, '#6cf', 10);
    CA.events.emit('sfx','tick');
    return true;
  }
  // PORTALS PERSIST across turns now (Jani: more than one unit, more than once).
  // A COMPLETED pair survives PORTAL_LIFE_TURNS turn-ends so anyone can use it
  // repeatedly; an abandoned HALF pair (only A placed) is cleared at turn end.
  CA.events.on('turnEnd', function(){
    _portalCooldown = 0;
    if (PORTALS.a && PORTALS.b){
      _portalTurns--;
      if (_portalTurns <= 0){ PORTALS = { a:null, b:null, ownerId:null }; }
    } else {
      PORTALS = { a:null, b:null, ownerId:null };   // half-placed → drop it
    }
    // clear an unused mark_target so a guaranteed-crit can't leak to a later turn
    try{ var _us=(S&&S.units)||[]; for(var _i=0;_i<_us.length;_i++){ if(_us[_i]) _us[_i]._critNext=false; } }catch(e){} });
  // and on a fresh game so a half-placed pair never leaks across matches
  CA.events.on('gameStart', function(){
    PORTALS = { a:null, b:null, ownerId:null }; _portalCooldown=0;
    S._blackhole = null;   // never leak a live vortex across matches
    // QA P3: az előző meccs füstje/lebegő szövegei/villám-ívei ne úszjanak át
    // az új meccs terepe fölé (a SMOKE akár ~9s-ig élt).
    SMOKE.length = 0; FLOATERS.length = 0; LIGHTNING.length = 0;
    // restore every weapon's default ammo + clear crate-granted unlocks each match.
    // NOTE: ammo is now tracked PER TEAM (CA.state.teamAmmo). resetAmmo() clears the
    // per-team counters; the base (_ammo0 → ammo) restore stays as the lazy-init source.
    LIST.forEach(function(w){ if(w._ammo0!=null) w.ammo=w._ammo0; });
    if (CA.resetAmmo) CA.resetAmmo();
    if (CA.state) CA.state._crateWeapons = {};
    // LOADOUT (Jani): each team starts with ONE RANDOM ultimate charge, unless
    // opted out (S.teamUltimate===false). Done AFTER the reset so it isn't wiped.
    // Ammo is per-team (addAmmo with teamId); _crateWeapons unlocks it for the
    // ability/weapon bar. A team can only fire the ultimate it actually has ammo for.
    try {
      if (CA.state && CA.state.teamUltimate !== false && Array.isArray(CA.state.teams) && CA.addAmmo){
        for (var _ti=0; _ti<CA.state.teams.length; _ti++){
          var _tm = CA.state.teams[_ti]; if(!_tm || _tm.id==null) continue;
          var _ult = MEGA_IDS[Math.floor(Math.random()*MEGA_IDS.length)];
          CA.addAmmo(_ult, 1, _tm.id);
          (CA.state._crateWeapons = CA.state._crateWeapons||{})[_ult] = true;
        }
      }
    } catch(e){}
  });

  // a flight of bombs falling along a vertical line at the target x.
  // `kind` parameterizes the payload: 'bomb' (default — plain blast),
  // 'napalmbomb' (drops fire seeds on impact) or 'minebomb' (drops armed mines).
  // Reused by the napalm-strike / mine-strike airstrike variants.
  function fireAirstrike(u, w, kind){
    let tx = S.input.mouseWorldX;
    if (!(tx>0 && tx<C.WORLD_W)){ const a=-u.aimAngle; tx = u.x + Math.cos(a)*u.facing*260; }
    tx = U.clamp(tx, 40, C.WORLD_W-40);
    // bombing run direction: use the mouse when it's a valid on-screen spot,
    // otherwise fall back to the unit's facing (AI / offscreen / mouse at 0).
    const mwx = S.input.mouseWorldX;
    const dir = (mwx>0 && mwx<C.WORLD_W) ? ((mwx>u.x)?1:-1) : (u.facing>=0?1:-1);
    const n = 5, spread = 26;
    for (let i=0;i<n;i++){
      const ox = (i-(n-1)/2)*spread*dir;
      spawnProjectile({
        weaponId:w.id, ownerId:u.id,
        x:tx+ox, y:10, vx:dir*1.6, vy:2.2 + i*0.15,
        r:4, affectedByWind:false, fuse:null, bounce:0,
        _w:{ radius:w.radius, damage:w.damage, knockback:w.knockback }, _kind:(kind||'bomb'),
      });
    }
  }

  /* ===== ULTRA-RARE GRANDIOSE ULTIMATES ================================== */

  // pick a target x: the mouse if it's a valid on-screen world spot, else a
  // point in front of the unit along its aim/facing. Always clamped to world.
  function targetX(u, fallbackDist){
    let tx = S.input.mouseWorldX;
    if (!(tx>0 && tx<C.WORLD_W)){ const a=-u.aimAngle; tx = u.x + Math.cos(a)*u.facing*(fallbackDist||260); }
    return U.clamp(tx, 40, C.WORLD_W-40);
  }

  // #U1 MAGIC ORB — a big slow glowing sphere fired along the aim. As it flies it
  // CARVES the terrain at intervals (total ~30% of world width) and blasts. It
  // bores through ground (so it can't just thud to a stop on the first hill) and
  // detonates on enemy contact / off-world. data.carveBudget = px of width left to
  // carve; data.carveCd throttles carve+blast ticks.
  function fireMagicOrb(u, w){
    const m = muzzle(u);
    const dir = (u.facing||1);
    // Jani: go ALL the way across the map in ONE straight lane, MUCH faster (was a
    // slow lob that carved only ~30% then popped). Flat fast bore — slight upward
    // bias so gravity keeps it roughly level over a long lane.
    spawnProjectile({
      weaponId:w.id, ownerId:u.id, x:m.x, y:m.y,
      vx:dir*12, vy:-0.6,
      r:12, affectedByWind:false, fuse:null, bounce:0, _w:w, _kind:'magicorb',
      data:{ carveBudget: Math.round(1.1*C.WORLD_W), carveCd:0, carveR:22 },
    });
    return true;
  }

  // #U2 NUKE — dropped at the target; ~20× a dynamite blast delivered as a few
  // concentric CA.explode calls (so the mega-radius doesn't carve in one giant
  // pass) plus a layered mushroom-cloud FX. Radius capped to a sane share of the
  // world so it never freezes. Drops as a heavy projectile from above the target.
  function fireNuke(u, w){
    const tx = targetX(u, 200);
    spawnProjectile({
      weaponId:w.id, ownerId:u.id, x:tx, y:8, vx:0, vy:3.2,
      r:9, affectedByWind:false, fuse:null, bounce:0, _w:w, _kind:'nuke',
    });
    return true;
  }

  // shared nuke detonation: ~20× dynamite. dyn = the dynamite LIST entry.
  function nukeBlast(x, y, ownerId){
    const dyn = byId('dynamite');
    const baseR = dyn.radius, baseDmg = dyn.damage, baseKb = dyn.knockback;
    // 20× the AREA-equivalent reach, capped so terrain.destroy + damage stay sane.
    const megaR = Math.min(Math.round(baseR*5.2), Math.round(C.WORLD_W*0.45)); // ~390 capped
    const megaDmg = baseDmg*3;            // lethal but not absurd at the rim
    const megaKb  = baseKb*2.2;
    // a couple of concentric rings so the carve + falloff read as one huge crater
    // without a single destroy() pass over a quarter of the map.
    boom(x, y, megaR, megaDmg, megaKb, ownerId, false);
    boom(x, y, Math.round(megaR*0.6), Math.round(megaDmg*0.7), megaKb*0.7, ownerId, false);
    boom(x, y, Math.round(megaR*0.32), Math.round(megaDmg*0.5), megaKb*0.5, ownerId, false);
    if (CA.FX && CA.FX.mushroomCloud) CA.FX.mushroomCloud(x, y, megaR);
    if (S.camera) S.camera.shake = Math.min(28, (S.camera.shake||0) + 26);
    try{ CA.events.emit('sfx','boom_big'); }catch(e){}
  }

  // #U3 FIRE RAIN — choose a WIDE band (~half the world) around the target and
  // rain 10–20 fireballs into it, staggered via per-projectile data.delay. Each
  // fireball explodes and lays a patch of fire (reusing the napalm hazard seeds).
  function fireFireRain(u, w){
    const tx = targetX(u, 240);
    const band = Math.round(C.WORLD_W*0.50);
    const half = band/2;
    const cheap = !!(CA.settings && CA.settings.quality==='low');
    const n = cheap ? 10 : U.randInt(13, 18);
    for (let i=0;i<n;i++){
      const fx = U.clamp(tx + U.rand(-half, half), 30, C.WORLD_W-30);
      spawnProjectile({
        weaponId:w.id, ownerId:u.id, x:fx, y:-U.rand(10,60),
        vx:U.rand(-0.6,0.6), vy:U.rand(2.4,3.8),
        r:6, affectedByWind:false, fuse:null, bounce:0,
        _w:{ radius:w.radius, damage:w.damage, knockback:w.knockback }, _kind:'firemeteor',
        data:{ delay: Math.round(i*U.rand(5,11)) },   // staggered onset
      });
    }
    if (S.camera) S.camera.shake = Math.min(20, (S.camera.shake||0)+6);
    try{ CA.events.emit('sfx','fire'); }catch(e){}
    return true;
  }

  // #U4 BLACK HOLE — fired along the aim; on impact it plants a gravity vortex
  // (handled in update via S._blackhole) for ~2.5s that pulls nearby units AND
  // loose projectiles toward the centre, then implodes into one big boom.
  function fireBlackHole(u, w){
    const v = launchVel(u, 0.95);
    const m = muzzle(u);
    spawnProjectile({
      weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
      r:7, affectedByWind:false, fuse:null, bounce:0, _w:w, _kind:'blackhole',
    });
    return true;
  }

  // #U5 METEOR SHOWER — a target area gets struck by several meteors that fall in
  // at an ANGLE (ballistic, fiery trail), staggered via data.delay; each is a
  // medium-large boom. Wider spread than airstrike, comes from the sky diagonally.
  function fireMeteors(u, w){
    const tx = targetX(u, 240);
    const spread = Math.round(C.WORLD_W*0.16);
    const cheap = !!(CA.settings && CA.settings.quality==='low');
    const n = cheap ? 8 : U.randInt(10, 13);
    const dir = (Math.random()<0.5)?-1:1;     // diagonal incoming direction
    for (let i=0;i<n;i++){
      const aimX = U.clamp(tx + U.rand(-spread, spread), 30, C.WORLD_W-30);
      // start off the top edge, offset opposite the travel dir so it arrives at aimX
      const sx = U.clamp(aimX - dir*U.rand(120,220), -60, C.WORLD_W+60);
      spawnProjectile({
        weaponId:w.id, ownerId:u.id, x:sx, y:-U.rand(20,80),
        vx:dir*U.rand(2.2,3.4), vy:U.rand(3.2,4.4),
        r:7, affectedByWind:false, fuse:null, bounce:0,
        _w:{ radius:w.radius, damage:w.damage, knockback:w.knockback }, _kind:'meteor',
        data:{ delay: Math.round(i*U.rand(6,13)) },
      });
    }
    if (S.camera) S.camera.shake = Math.min(22, (S.camera.shake||0)+8);
    return true;
  }

  // #U6 QUAKE — a screen-wide event handled immediately (no projectile): big
  // camera shake, terrain collapses in several random vertical gouges below the
  // surface (opening chasms), and every unit takes a small rattling hit + nudge.
  // Damage routed through CA.explode at each collapse column so it's pipeline-safe.
  function fireQuake(u, w){
    const cheap = !!(CA.settings && CA.settings.quality==='low');
    const cols = cheap ? 5 : U.randInt(7, 10);
    const ownerTeam = u.teamId;
    const WL = (S.waterLevel!=null ? S.waterLevel : C.WATER_LEVEL);
    // TARGETED like the airstrike (Jani): the chasms open in a BAND around the
    // aimed/mouse spot, not at random across the whole map.
    const qtx = targetX(u, 240);
    const qhalf = Math.round(C.WORLD_W*0.18);   // ~36% of the world wide
    for (let i=0;i<cols;i++){
      // pick a column x within the aimed band, carve DOWN from the surface
      const cx = U.clamp(qtx + U.rand(-qhalf, qhalf), 30, C.WORLD_W-30);
      let surfY = (CA.Terrain && CA.Terrain.heightAt) ? CA.Terrain.heightAt(cx) : (WL-40);
      if (!(surfY>0 && surfY<C.WORLD_H)) surfY = WL-40;
      const depth = Math.min(C.WORLD_H-surfY, U.rand(120, 240));
      if (CA.Terrain && CA.Terrain.destroy){
        const step = 24;
        for (let dy=0; dy<depth; dy+=step){
          CA.Terrain.destroy(cx, surfY+dy, 20);
        }
      }
      // a contained surface boom at the chasm mouth (damage + FX, capped radius)
      boom(cx, surfY, w.radius, w.damage, w.knockback, u.id, false);
    }
    // rattle EVERY unit: a small velocity kick + a light direct hit (no friendly
    // immunity here — it's an earthquake, it shakes everyone), capped so it can't
    // one-shot. Use damageInRadius directly per-unit would bypass the pipeline, so
    // instead drop a tiny capped CA.explode on each (cheap, pipeline-safe).
    for (const t of (S.units||[])){
      if (!t || !t.alive) continue;
      t.vy = (t.vy||0) - U.rand(2, 4);            // bounce them off the ground
      t.vx = (t.vx||0) + U.rand(-1.5, 1.5);
      t.grounded = false;
    }
    if (CA.FX && CA.FX.quakeFx) CA.FX.quakeFx();
    if (S.camera) S.camera.shake = Math.min(28, (S.camera.shake||0) + 28);
    try{ CA.events.emit('sfx','boom_big'); }catch(e){}
    return true;
  }

  /* ---- NEW WEAPONS & MOVEMENT (agent) ----------------------------------- */

  // HIGH #1 — JETPACK: arm a small fuel budget on the unit; entities.js reads the
  // flag each frame and applies thrust on input until the fuel runs out or it
  // catches fire. No damage, keeps the turn (mirrors the parachute-flag pattern).
  function fireJetpack(u){
    u._jetpack = { fuel: 130 };          // ~2.2s of held thrust @60fps
    puff(u.x, u.y+C.UNIT_R-2, '#fc6', 8);
    CA.events.emit('sfx','jump');
    try{ CA.events.emit('sfx','jetpack'); }catch(e){}   // one-shot on activate (loop handled by file if present)
    return true;
  }

  // HIGH #2 — BLOWTORCH: carve a horizontal tunnel in the facing direction over
  // a short distance (repeated Terrain.destroy along facing), nudging the unit
  // forward into the fresh cavity. A near-template of the worm dig() action.
  function fireBlowtorch(u){
    if (!CA.Terrain || !CA.Terrain.destroy){
      puff(u.x, u.y, '#f80', 4);
      return false;                       // no terrain hook — fizzle (keep ammo/turn)
    }
    const steps = 9, r = C.UNIT_R*0.7;
    let cx = u.x, cy = u.y, moved = false;
    for (let i=0;i<steps;i++){
      cx += u.facing * (r*0.9);
      if (cx < C.UNIT_R || cx > C.WORLD_W-C.UNIT_R) break;
      CA.Terrain.destroy(cx, cy, r);
      puff(cx, cy, '#f80', 2);
      moved = true;
    }
    if (moved){
      // slide the unit forward into the carved tunnel (clamped, settle next frame)
      u.x = U.clamp(u.x + u.facing*(r*steps*0.5), C.UNIT_R, C.WORLD_W-C.UNIT_R);
      u.vx = 0; u.grounded = false;
      CA.events.emit('sfx','tick');
      try{ CA.events.emit('sfx','blowtorch'); }catch(e){}
    }
    return moved;
  }

  // MED #4 — LOW GRAVITY: floaty turn. Set a temporary gravity multiplier that
  // entities.js consumes in BOTH the unit and projectile integrators (read via
  // CA.Entities.gravityMult / the local lowGravMult below). Cleared at turnEnd.
  let lowGravMult = 1;
  function gravMult(){ return lowGravMult; }
  function fireLowGrav(){
    lowGravMult = 0.45;                    // everything falls slow this turn
    if (S.units){
      for (const t of S.units){ if (t.alive && CA.FX && CA.FX.spawnParticles)
        CA.FX.spawnParticles({ x:t.x, y:t.y-6, count:3, spdMin:0.2, spdMax:1, life:30, size:2.4, color:'#cdf' }); }
    }
    try{ CA.events.emit('toast', '🌙 '+CA.t('Holdjárás')); }catch(e){}
    CA.events.emit('sfx','tick');
    return true;
  }
  // entities.js reads this to scale gravity for units AND projectiles.
  CA.gravityMult = function(){ return lowGravMult; };
  // reset the floaty multiplier when the turn ends (one-turn effect).
  CA.events.on('turnEnd', function(){ lowGravMult = 1; });

  // MED #11 — FREEZE: encase self in ice. A per-unit `_frozen` flag entities.js
  // honours in damage() (incoming hit reduced) and clears on the unit's next
  // turn start. No damage, keeps the turn (utility).
  function fireFreeze(u){
    u._frozen = 2;                        // turns of protection (cleared on next turn)
    if (CA.FX && CA.FX.spawnParticles)
      CA.FX.spawnParticles({ x:u.x, y:u.y, count:16, spdMin:0.4, spdMax:2.4, life:26, size:3, color:'#bdeeff' });
    try{ CA.events.emit('toast', '🧊 '+CA.t('Befagyás')); }catch(e){}
    CA.events.emit('sfx','tick');
    return true;
  }

  // MED #5 — WALKING CRITTER BOMB ("Roham-süni"): deploy a self-moving minion
  // that trots toward the nearest enemy then explodes (reuses the entities.js
  // minion movement / contact-boom code via a dedicated 'chargehog' kind).
  function fireChargeHog(u, w){
    const s = frontSpot(u, 30);
    const m = spawnMinion({ kind:'chargehog', x:s.x, y:s.y, ownerTeamId:u.teamId,
      life:2, hp:24, r:w.radius, dmg:w.damage, kb:w.knockback });
    puff(s.x, s.y, '#caa', 10);
    CA.events.emit('sfx','jump');
    return m || true;                     // even if entities not ready, treat as fired
  }

  // MED #6 — SNIPER RIFLE: long-range hitscan with charge + distance-scaled
  // damage. Extends the shotgun hitscan path: farther & more-charged = harder.
  function fireSniper(u, w, power){
    const a = -u.aimAngle;
    const dx = Math.cos(a)*u.facing, dy = Math.sin(a);
    const m = muzzle(u);
    const MAX = 1200, STEP = 4;           // much longer reach than the shotgun
    let hx = m.x + dx*MAX, hy = m.y + dy*MAX, hit = false, travel = MAX;
    for (let d=8; d<=MAX; d+=STEP){
      const px = m.x + dx*d, py = m.y + dy*d;
      if ((d % 28)===0) puff(px, py, '#cff', 1);
      if (px<0||px>C.WORLD_W||py<0||py>C.WORLD_H){ hx=px; hy=py; travel=d; break; }
      let unitHit=false;
      for (const t of S.units){
        if (!t.alive || t.id===u.id) continue;
        if (U.dist(px,py,t.x,t.y) <= C.UNIT_R){ unitHit=true; break; }
      }
      if (unitHit){ hx=px; hy=py; hit=true; travel=d; break; }
      if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(px,py)){ hx=px; hy=py; hit=true; travel=d; break; }
    }
    // damage scales with charge (0.6..1.4) AND distance (up to +60% at long range)
    const distBonus = 1 + 0.4*U.clamp(travel/MAX, 0, 1);
    const dmg = Math.round(w.damage * (0.6 + 0.8*U.clamp(power,0,1)) * distBonus);
    // a thin tracer along the shot line so the long beam reads on screen
    if (CA.FX && CA.FX.spawnParticles){
      for (let d=24; d<travel; d+=40) CA.FX.spawnParticles({ x:m.x+dx*d, y:m.y+dy*d, count:1, spdMin:0.1, spdMax:0.4, life:10, size:1.6, color:'#dff' });
    }
    puff(hx, hy, '#cff', 12);
    boom(hx, hy, w.radius, dmg, w.knockback, u.id, w && w.ability);
    CA.events.emit('sfx','fire');
    try{ CA.events.emit('sfx','charged_shot'); }catch(e){}   // sniper = charged-shot SFX
  }

  // MED #7 — BASEBALL BAT: a directional fling melee with HUGE knockback and a
  // pronounced upward arc (a heavy-hitting variant of fireMelee). Can punt foes
  // clean off cliffs / into water. Light damage, big launch.
  function fireBat(u, w){
    const a = -u.aimAngle;
    const dx = Math.cos(a)*u.facing, dy = Math.sin(a);
    const reach = 32;
    const hx = u.x + dx*reach, hy = u.y - 6 + dy*reach;
    puff(hx, hy, '#fff', 10);
    CA.events.emit('sfx','boom');
    // QA P1: a boom() sebzés-sugara (radius 30 + UNIT_R 16) MINDIG elérte magát
    // az ütőt is (32px-re üt) → minden lendítés ön-sebzés + hátralökés volt.
    // Ground-slam minta: snapshot & restore a használóra.
    const _hp=u.hp, _shield=u.shield, _vx=u.vx, _vy=u.vy, _alive=u.alive, _grounded=u.grounded;
    boom(hx, hy, w.radius, w.damage, w.knockback, u.id, w && w.ability);
    u.hp=_hp; u.shield=_shield; u.vx=_vx; u.vy=_vy; u.alive=_alive; u.grounded=_grounded;
    // the signature FLING: a big directional shove plus a strong upward pop.
    for (const t of S.units){
      if (!t.alive || t.id===u.id) continue;
      if (U.dist(hx,hy,t.x,t.y) <= w.radius + C.UNIT_R){
        t.vx += dx*16; t.vy += -9; t.grounded=false;
      }
    }
    if (S.camera) S.camera.shake = Math.min(18, (S.camera.shake||0)+8);
  }

  /* ---- #11 movement / utility ------------------------------------------- */

  // ninja rope/grapple: raycast along aim to terrain, then pull the unit there
  function fireRope(u){
    let tx = S.input.mouseWorldX, ty = S.input.mouseWorldY;
    const haveMouse = (tx>0 && tx<C.WORLD_W);
    const m = muzzle(u);
    let dx, dy;
    if (haveMouse){
      dx = tx - m.x; dy = ty - m.y;
      const len = Math.hypot(dx,dy)||1; dx/=len; dy/=len;
    } else {
      const a=-u.aimAngle; dx=Math.cos(a)*u.facing; dy=Math.sin(a);
    }
    const MAX=460, STEP=4;
    let hx=null, hy=null;
    for (let d=10; d<=MAX; d+=STEP){
      const px=m.x+dx*d, py=m.y+dy*d;
      if (px<0||px>C.WORLD_W||py<0) break;
      if (py>=(S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL)) break;
      if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(px,py)){ hx=px; hy=py; break; }
    }
    if (hx==null){ // nothing to grab — fizzle, don't consume turn
      puff(m.x+dx*40, m.y+dy*40, '#bbb', 4);
      CA.events.emit('sfx','tick');
      return false;
    }
    // #6 launch the unit toward the anchor: an initial hop into the swing PLUS
    // a brief sustained pull impulse (applied over several frames in update())
    // so it reads as a smooth swing rather than one instant yank. Keeps the turn.
    const adx = hx-u.x, ady = hy-u.y;
    const dlen = Math.hypot(adx,ady)||1;
    const pull = U.clamp(dlen*0.05, 4, 10);
    u.vx = (adx/dlen)*pull*0.6;
    u.vy = (ady/dlen)*pull*0.6 - 2.5;  // a little hop into the swing
    u.grounded=false;
    // t = render life; pull/pt = sustained-pull strength + remaining frames
    u._rope = { x:hx, y:hy, t:26, pull:pull, pt:22 };
    puff(hx, hy, '#fe9', 6);
    CA.events.emit('sfx','jump');
    return true;
  }

  // parachute: set a flag the update loop reads to damp vy
  function fireParachute(u){
    u.parachute = 240; // frames of slow-fall
    puff(u.x, u.y-18, '#fff', 8);
    CA.events.emit('sfx','jump');
    return true;
  }

  // girder: place a small solid platform under the mouse/aim point
  function fireGirder(u){
    let tx=S.input.mouseWorldX, ty=S.input.mouseWorldY;
    if (!(tx>0 && tx<C.WORLD_W)){ const a=-u.aimAngle; tx=u.x+Math.cos(a)*u.facing*120; ty=u.y+20; }
    tx=U.clamp(tx,40,C.WORLD_W-40);
    ty=U.clamp(ty,40,(S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL)-6);
    if (CA.Terrain && CA.Terrain.paintSolid){
      // paint a few overlapping discs to make a stubby platform
      for(let i=-1;i<=1;i++) CA.Terrain.paintSolid(tx+i*14, ty, 11);
      puff(tx, ty, '#caa', 8);
      CA.events.emit('sfx','tick');
      return true;
    }
    // no paint hook available — fizzle without consuming the turn
    puff(tx, ty, '#caa', 4);
    return false;
  }

  /* ---- v4 CLASS ABILITIES ----------------------------------------------- */
  // All guard CA.Entities.spawnMinion / CA.Terrain.paintSolid (may not exist yet).
  // Each returns true if it actually fired (so a fizzle won't waste the cooldown).

  function spawnMinion(opts){
    if (CA.Entities && typeof CA.Entities.spawnMinion === 'function'){
      try { return CA.Entities.spawnMinion(opts) || true; }
      catch(e){ return false; }
    }
    return false;
  }

  // -- NECRO ----------------------------------------------------------------
  function fireSummonSkeleton(u){
    const n = 1 + (u._minionBonus|0);
    const isSummoner = !!(CA.classOf && CA.classOf(u) && CA.classOf(u).passive==='summon');
    let any=false;
    for (let i=0;i<n;i++){
      const s = frontSpot(u, 30 + i*22);
      const ok = spawnMinion({ kind:'skeleton', x:s.x, y:s.y, ownerTeamId:u.teamId,
        life:2 + (isSummoner?1:0), hp:Math.round(24*(u._minionHpMul||1)) });
      any = any || ok;
      puff(s.x, s.y, '#cfcfcf', 10);
    }
    CA.events.emit('sfx','jump');
    try{ CA.events.emit('sfx','cast_summon'); }catch(e){}
    return any || true; // even if entities not ready, treat as fired (cooldown OK)
  }
  function fireSummonZombie(u){
    const s = frontSpot(u, 30);
    const isSummoner = !!(CA.classOf && CA.classOf(u) && CA.classOf(u).passive==='summon');
    spawnMinion({ kind:'zombie', x:s.x, y:s.y, ownerTeamId:u.teamId,
      life:3 + (isSummoner?1:0), hp:Math.round(60*(u._minionHpMul||1)) });
    puff(s.x, s.y, '#7a8a5a', 12);
    CA.events.emit('sfx','jump');
    try{ CA.events.emit('sfx','cast_summon'); }catch(e){}
    return true;
  }
  function fireBoneSpear(u, w, power){
    const v = launchVel(u, power, 1.15); // fast, flat
    const m = muzzle(u);
    spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
      r:5, affectedByWind:false, fuse:null, bounce:0, _w:w, _kind:'bonespear',
      data:{ pierce:2 } });           // can pass through up to 2 units before boom
    CA.events.emit('sfx','fire');
    return true;
  }

  // -- GUARDIAN -------------------------------------------------------------
  function fireShieldWall(u){
    // PAJZSFAL = a strong PERSONAL energy shield (the Guardian's defensive buff) —
    // NOT bricks. (The Engineer's "Falépítés" is the one that builds a terrain wall;
    // they used to be the same — Jani.) Absorbs a big chunk of incoming damage.
    u.shield = (u.shield||0) + 45;
    puff(u.x, u.y-C.UNIT_R*0.3, '#9cf', 18);
    puff(u.x, u.y-C.UNIT_R*0.3, '#cfe', 10);
    CA.events.emit('sfx','tick');
    try{ CA.events.emit('sfx','shield_up'); }catch(e){}
    return true;
  }
  function fireGroundSlam(u, w){
    const gx = u.x, gy = u.y + C.UNIT_R*0.4;
    const zb = Math.min(1.5, u._zoneBonus||1);   // cap bonus to avoid griefing
    // Ground slam is a DEFENSIVE point-blank stomp — it must NOT hurt/launch the
    // caster (it detonates at the caster's own feet, so without this the Guardian
    // self-damaged + self-launched every cast). Snapshot & restore the caster.
    const _hp=u.hp, _shield=u.shield, _vx=u.vx, _vy=u.vy, _alive=u.alive, _grounded=u.grounded;
    boom(gx, gy, w.radius*zb, w.damage, w.knockback, u.id, w && w.ability);
    // restore EVERYTHING incl. alive/grounded — a low-HP self-hit could flip
    // alive=false (and emit unitDied) before this; without restoring it the caster
    // becomes a "ghost" (hp>0 but alive=false, uncontrollable).
    u.hp=_hp; u.shield=_shield; u.vx=_vx; u.vy=_vy; u.alive=_alive; u.grounded=_grounded;
    if (S.camera) S.camera.shake = Math.min(24, (S.camera.shake||0)+12);
    puff(gx, gy, '#caa', 18);
    CA.events.emit('sfx','boom');
    return true;
  }
  function fireTaunt(u){
    // turn-based AI-targeting flag (entities/AI reads unit.taunt). NOT anim.taunt.
    u.taunt = 2;
    // small shield to nearby allies so the taunt isn't suicidal
    for (const t of (S.units||[])){
      if (!t.alive || t.minion || t.teamId!==u.teamId || t.id===u.id) continue;
      if (U.dist(u.x,u.y,t.x,t.y) < 140) t.shield = (t.shield||0) + 10;
    }
    try{ CA.events.emit('toast', '📢 '+CA.t('Provokáció')); }catch(e){}
    if (u.anim) u.anim.celebrate = 0.8;
    CA.events.emit('sfx','tick');
    try{ CA.events.emit('sfx','taunt'); }catch(e){}
    return true;
  }

  // -- MAGE -----------------------------------------------------------------
  function fireFireball(u, w, power){
    const v = launchVel(u, power);
    const m = muzzle(u);
    const zb = Math.min(1.5, u._zoneBonus||1);   // cap bonus to avoid griefing
    // clone _w (never mutate the shared LIST entry) with the scaled blast radius
    const pw = { radius:w.radius*zb, damage:w.damage, knockback:w.knockback };
    spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
      r:6, affectedByWind:false, fuse:null, bounce:0, _w:pw, _kind:'fireball',
      data:{ zoneTurns:(u._zoneTurns||0) } });
    try{ CA.events.emit('sfx','cast_fire'); }catch(e){}
    return true;
  }
  function fireFrostNova(u, w, power){
    const v = launchVel(u, power);
    const m = muzzle(u);
    const zb = Math.min(1.5, u._zoneBonus||1);   // cap bonus to avoid griefing
    const pw = { radius:w.radius*zb, damage:w.damage, knockback:w.knockback };
    spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
      r:6, affectedByWind:false, fuse:null, bounce:0, _w:pw, _kind:'frost',
      data:{ zoneTurns:(u._zoneTurns||0) } });
    try{ CA.events.emit('sfx','cast_frost'); }catch(e){}
    return true;
  }
  function fireChainLightning(u, w, power){
    const v = launchVel(u, power, 1.2);
    const m = muzzle(u);
    spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
      r:4, affectedByWind:false, fuse:null, bounce:0, _w:w, _kind:'chainlight' });
    try{ CA.events.emit('sfx','cast_lightning'); }catch(e){}
    return true;
  }

  // -- HUNTER ---------------------------------------------------------------
  function fireChargedShot(u, w, power){
    // power scales damage too: a fully-charged precise shot hits hard.
    const v = launchVel(u, power, 1.3); // fast & flat
    const m = muzzle(u);
    const dmg = Math.round(w.damage * (0.7 + 0.6*U.clamp(power,0,1)));
    const isCrit = !!u._critNext;
    if (u._critNext) u._critNext = false; // consume the mark/crit buff
    spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
      r:4, affectedByWind:w.affectedByWind, fuse:null, bounce:0,
      _w:{ radius:w.radius, damage: isCrit ? Math.round(dmg*1.35) : dmg, knockback:w.knockback },
      _kind:'chargedshot', data:{ crit:isCrit } });
    CA.events.emit('sfx','fire');
    try{ CA.events.emit('sfx','charged_shot'); }catch(e){}
    return true;
  }
  function fireMarkTarget(u){
    // simplest contract reading: buff THIS unit's next shot to a guaranteed crit.
    u._critNext = true;
    try{ CA.events.emit('toast', '🔻 '+CA.t('Megjelölés')); }catch(e){}
    puff(u.x, u.y-C.UNIT_R, '#f55', 8);
    CA.events.emit('sfx','tick');
    return true;
  }
  function fireMultishot(u, w, power){
    const m = muzzle(u);
    for (let i=-1;i<=1;i++){
      const v = launchVel(u, power, 1.1);
      // fan the three shots around the aim
      const spread = i*0.12;
      const cs=Math.cos(spread), sn=Math.sin(spread);
      const vx = v.vx*cs - v.vy*sn;
      const vy = v.vx*sn + v.vy*cs;
      spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:vx, vy:vy,
        r:4, affectedByWind:w.affectedByWind, fuse:null, bounce:0,
        _w:{ radius:w.radius, damage:w.damage, knockback:w.knockback }, _kind:'arrow' });
    }
    CA.events.emit('sfx','fire');
    return true;
  }

  // -- ENGINEER -------------------------------------------------------------
  function fireBuildWall(u){
    let tx=S.input.mouseWorldX, ty=S.input.mouseWorldY;
    if (!(tx>0 && tx<C.WORLD_W)){ const s=frontSpot(u,40); tx=s.x; ty=s.y; }
    tx=U.clamp(tx,40,C.WORLD_W-40);
    ty=U.clamp(ty,40,(S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL)-6);
    if (CA.Terrain && CA.Terrain.paintSolid){
      // FALÉPÍTÉS = a TALL brick wall at the chosen spot (real cover/blocker) — the
      // Engineer's construction. Taller + wider than before so it's clearly NOT the
      // Guardian's personal shield (they used to look identical — Jani).
      for (let j=-4;j<=4;j++) CA.Terrain.paintSolid(tx, ty - j*12, 12);
      puff(tx, ty, '#caa', 12);
      CA.events.emit('sfx','tick');
      try{ CA.events.emit('sfx','build'); }catch(e){}
      return true;
    }
    puff(tx, ty, '#caa', 4);
    return true; // ability still "used" even if no paint hook
  }
  function fireDeployTurret(u){
    const s = frontSpot(u, 30);
    const dmgMul = (u._dmgMul||1);
    const turret = spawnMinion({ kind:'turret', x:s.x, y:s.y, ownerTeamId:u.teamId,
      life:4, hp:Math.round(40*(u._buildHpMul||1)), dmgMul:dmgMul });
    // stamp dmgMul on the spawned turret so its own shots scale (read in entities.js)
    if (turret && typeof turret==='object') turret.dmgMul = dmgMul;
    puff(s.x, s.y, '#8ad', 12);
    CA.events.emit('sfx','tick');
    try{ CA.events.emit('sfx','build'); }catch(e){}
    return true;
  }
  function firePlaceTrap(u, w){
    if (CA.Hazards && CA.Hazards.add){
      const zb = Math.min(1.5, u._zoneBonus||1);   // cap bonus to avoid griefing
      CA.Hazards.add('mine', u.x, u.y+C.UNIT_R-4,
        { ownerId:u.id, r:w.radius*zb, dmg:w.damage, kb:w.knockback, turns:(u._zoneTurns||0) });
      puff(u.x, u.y+8, '#aaa', 6);
      CA.events.emit('sfx','tick');
      try{ CA.events.emit('sfx','mine_arm'); }catch(e){}   // trap armed (more specific than 'build')
      return true;
    }
    puff(u.x, u.y+8, '#aaa', 4);
    return true;
  }

  // -- HEALER ---------------------------------------------------------------
  function fireHealBeam(u){
    const ally = nearestAlly(u, false);
    if (!ally) { // no friend in need — heal self a little so it isn't wasted
      const heal = Math.round(18 * (u._healMul||1));
      u.hp = U.clamp(u.hp+heal, 0, u.maxHp||u.hp);
      addFloater(u.x, u.y-16, '+'+heal+' 💚', '#6f6');
      puff(u.x, u.y, '#5d5', 12);
      try{ CA.events.emit('sfx','heal'); }catch(e){}
      return true;
    }
    if (U.dist(u.x,u.y,ally.x,ally.y) > 360){ // out of range -> fizzle, keep cd-free
      puff(u.x, u.y-10, '#5d5', 4);
      return false;
    }
    const heal = Math.round(28 * (u._healMul||1));
    ally.hp = U.clamp(ally.hp + heal, 0, ally.maxHp||ally.hp);
    if (ally.anim) ally.anim.hitFlash = 0;
    addFloater(ally.x, ally.y-16, '+'+heal+' 💚', '#6f6');
    // a beam flash from healer to ally (self-contained floater path)
    puff(u.x, u.y-8, '#6f6', 6); puff(ally.x, ally.y-8, '#6f6', 12);
    try{ CA.events.emit('sfx','heal'); }catch(e){}
    return true;
  }
  function fireBuffAura(u){
    const isShield = (S.frame & 1)===0; // alternate flavour; both are useful
    let any=false;
    for (const t of (S.units||[])){
      if (!t.alive || t.minion || t.teamId!==u.teamId) continue;
      if (U.dist(u.x,u.y,t.x,t.y) > 150) continue;
      t.buffs = t.buffs || [];
      t.buffs.push(isShield ? {type:'shield',amt:25,turns:2} : {type:'dmg',amt:0.25,turns:2});
      if (isShield) t.shield = (t.shield||0) + 25;
      puff(t.x, t.y-10, '#fd6', 8);
      any=true;
    }
    try{ CA.events.emit('toast', '✨ '+CA.t('Áldás-aura')); }catch(e){}
    try{ CA.events.emit('sfx','shield_up'); }catch(e){}
    return any || true;
  }
  function fireRevive(u){
    const dead = nearestAlly(u, true);
    if (!dead){ puff(u.x,u.y-10,'#fff',4); return false; } // nobody to revive -> fizzle
    let s = frontSpot(u, 30);
    // never resurrect over open water: if the ground under the spot is at/under
    // the LIVE waterline, fall back to the caster's own feet.
    try{
      const wl = (S.waterLevel!=null ? S.waterLevel : C.WATER_LEVEL);
      if (CA.Terrain && CA.Terrain.heightAt && CA.Terrain.heightAt(s.x) >= wl - 6) s = { x:u.x, y:u.y };
    }catch(e){}
    // relocate FIRST, then run the canonical revive — Entities.revive resets the
    // stale death state (grave physics, taunt, buffs) and emits unitRevived;
    // the old hand-rolled path left all of that behind (wrong tombstone y on the
    // unit's SECOND death, sticky stun/buffs).
    dead.x = s.x; dead.y = s.y;
    const _ok = (CA.Entities && CA.Entities.revive) ? CA.Entities.revive(dead, 30) : false;
    if (!_ok){
      dead.alive = true; dead.hp = 30;
      dead._graveVy = 0; dead._graveSettled = false; dead._graveY = null;
    }
    dead.vx = 0; dead.vy = 0; dead.grounded = false;
    if (dead.anim){ dead.anim.hitFlash=0; dead.anim.celebrate=1; }
    addFloater(dead.x, dead.y-18, '😇 +30', '#9f9');
    puff(dead.x, dead.y, '#9f9', 20);
    if (S.camera) S.camera.shake = Math.min(16, (S.camera.shake||0)+6);
    // cheap_revive skill node (classes.js): u._reviveCost < 1 -> a cheaper revive
    // shortens the cooldown proportionally (e.g. 0.5 => half the wait), so the
    // healer can resurrect allies more often. setCooldown reads _cdOverride once.
    if (u._reviveCost!=null && u._reviveCost<1){
      const rw = byId('revive');
      if (rw) rw._cdOverride = Math.max(1, Math.round((rw.cooldown||4)*u._reviveCost));
    }
    try{ CA.events.emit('toast', '😇 '+CA.t('Feltámasztás')); }catch(e){}
    try{ CA.events.emit('sfx','heal'); }catch(e){}
    return true;
  }

  /* ---- #12 hazard-spawning helpers (called on detonate) ----------------- */
  function spawnNapalm(x,y,zoneTurns){
    if (!CA.Hazards || !CA.Hazards.add) return;
    const zt = zoneTurns|0;                 // extra lingering turns from the tree
    const n=5;
    for(let i=0;i<n;i++){
      const ox=(i-(n-1)/2)*14 + U.rand(-4,4);
      CA.Hazards.add('fire', x+ox, y-2,
        { gens:2 + zt, life:U.randInt(110,160) + zt*120, turns:zt });
    }
  }
  function spawnGas(x,y,owner){
    if (CA.Hazards && CA.Hazards.add) CA.Hazards.add('poison', x, y-8, { ownerId:owner, drift:U.rand(-0.2,0.2) });
  }
  // v4 frost nova: try a 'frost' hazard zone (slippery/slow). If the hazard
  // system doesn't know 'frost', mark nearby units _frost (slowed) directly.
  function spawnFrost(x,y,owner,zoneTurns){
    const zt = zoneTurns|0;                 // extra lingering turns from the tree
    let used=false;
    if (CA.Hazards && CA.Hazards.add){
      try { CA.Hazards.add('frost', x, y-6, { ownerId:owner, life:U.randInt(120,180) + zt*120, r:46, turns:zt }); used=true; }
      catch(e){ used=false; }
    }
    // slow / slip flag on units caught in the nova, regardless of hazard support
    for (const t of (S.units||[])){
      if (!t.alive) continue;
      if (U.dist(x,y,t.x,t.y) < 56){ t._frost = 2; t.vx *= 0.5; }
    }
    // a ring of icy puffs so it always reads on screen
    if (CA.FX && CA.FX.spawnParticles)
      CA.FX.spawnParticles({ x, y, count:16, spdMin:0.5, spdMax:3, life:26, size:3, color:'#bdeeff' });
  }
  // #5 smoke grenade: a thick, lingering (≈2 turns) obscuring cloud — no damage.
  // Self-contained: it lives as a list of slow 'smoke' puffs in SMOKE[] and is
  // also fed into CA.FX as smoke particles for extra density.
  function spawnSmoke(x,y){
    // many heavy, slow-rising smoke particles via the FX system (if present)
    if (CA.FX && CA.FX.spawnParticles){
      for (let i=0;i<3;i++){
        CA.FX.spawnParticles({ x:x+U.rand(-10,10), y:y+U.rand(-8,8), count:14,
          spdMin:0.2, spdMax:1.4, life:U.randInt(150,230), size:U.rand(7,13),
          grow:0.55, color:'rgba(150,150,155,0.55)', kind:'smoke' });
      }
    }
    // self-contained obscuring puffs (drawn in render, ~2 turns ≈ 480 frames)
    const n=14;
    for (let i=0;i<n;i++){
      SMOKE.push({
        x:x+U.rand(-26,26), y:y+U.rand(-22,10),
        r:U.rand(16,30), life:U.randInt(420,540), maxLife:540,
        vx:U.rand(-0.18,0.18), vy:U.rand(-0.22,-0.05),
        sway:U.rand(0,6.28), grow:U.rand(0.06,0.16),
      });
    }
    puff(x, y, '#bbb', 10);
    CA.events.emit('sfx','tick');
  }

  /* ---- #15 CRATES -------------------------------------------------------- */
  const CRATE_KINDS=['weapon','health','utility'];
  let crateCap = 6;

  // TASK 2 — the 3 mystery-box artworks on disk. 'mystery' gets a flag so its
  // reward is a bigger/random surprise.
  const BOX_IMAGES = [
    { img:'box1',    mystery:false },
    { img:'box2',    mystery:false },
    { img:'mystery', mystery:true  },
  ];

  function spawnCrate(){
    if (!S.crates) S.crates=[];
    if (S.crates.length >= crateCap) return;
    const x = U.rand(80, C.WORLD_W-80);
    const box = U.pick(BOX_IMAGES);
    // a mystery box ignores the normal kind split — it's always a surprise.
    let kind, item=null;
    if (box.mystery){
      kind = 'mystery';
    } else {
      kind = U.pick(CRATE_KINDS);
      if (kind==='weapon'){
        item = U.pick(['dynamite','cluster','airstrike','spikeball','logtoss','eggbomb','drill','napalm','mine','guided','gasgrenade','bellyflop',
          // ULTRA-RARE megas — now crate-only (base ammo:0, no universal flag); a
          // crate pickup is the ONLY way to get a single usable charge of one.
          'nuke','magicorb','firerain','blackhole','meteors','quake']);
      } else if (kind==='utility'){
        item = U.pick(['rope','parachute','girder','teleport']);
      }
    }
    S.crates.push({ x, y:-20, vy:0, kind, item, grounded:false,
                    box:box.img, mystery:box.mystery, sway:U.rand(0,6.28) });
  }

  // grant a random reward to a unit (used by health/mystery boxes). Returns a
  // short label describing what happened.
  function grantRandomReward(u, big){
    const roll = Math.random();
    // big mystery boxes lean toward generous outcomes; normal ones are milder
    if (roll < (big?0.30:0.40)){
      const heal = big ? U.randInt(45,80) : U.randInt(20,35);
      u.hp = U.clamp(u.hp + heal, 0, u.maxHp);
      if (u.anim) u.anim.hitFlash = 0;
      puff(u.x, u.y, '#5d5', big?20:14);
      return '+'+heal+' ❤ '+CA.t('Élet');
    } else if (roll < (big?0.85:0.85)){
      // ammo for a random (finite-ammo) weapon — a megák és a capyslam KIZÁRVA
      // (QA P2: a "random ammo" +2..+4 NUKE-töltetet is adhatott, pedig a láda-út
      // megáknál pontosan 1-et ad).
      const pool = LIST.filter(w=>w.ammo>=0 && w.id!=='melee' && !w._mega && w.id!=='capyslam');
      const w = U.pick(pool) || byId('dynamite');
      const add = big ? U.randInt(2,4) : 2;
      CA.addAmmo(w.id, add, u.teamId);   // ammo goes to the picking-up unit's team
      (S._crateWeapons=S._crateWeapons||{})[w.id]=true;
      return w.emoji+' '+CA.t(w.name)+' +'+add;
    } else {
      // a one-off power buff stashed on the unit (read elsewhere if wired; the
      // reward still reads as a fun surprise even if purely cosmetic here)
      const powers = big
        ? ['fullheal','double','shield','airdrop']
        : ['heal','shield'];
      const pw = U.pick(powers);
      if (pw==='fullheal'){ u.hp = u.maxHp; puff(u.x,u.y,'#6f6',22); return '❤ '+CA.t('TELI ÉLET!'); }
      if (pw==='heal'){ const h=U.randInt(15,30); u.hp=U.clamp(u.hp+h,0,u.maxHp); puff(u.x,u.y,'#5d5',12); return '+'+h+' ❤ '+CA.t('Élet'); }
      if (pw==='double'){ u.nextShotDouble = true; puff(u.x,u.y,'#fc6',16); return '✖2 '+CA.t('LÖVÉS!'); }
      if (pw==='shield'){ const amt=(big?60:30); u.shield = (u.shield||0) + amt; puff(u.x,u.y,'#9cf',16); return '🛡️ '+CA.t('Pajzs')+' +'+amt; }
      if (pw==='airdrop'){ // extra ammo to TWO random weapons (megák kizárva, ld. fent)
        const pool = LIST.filter(w=>w.ammo>=0 && w.id!=='melee' && !w._mega && w.id!=='capyslam');
        for(let i=0;i<2;i++){ const w=U.pick(pool); if(w) CA.addAmmo(w.id, 3, u.teamId); }
        puff(u.x,u.y,'#fc6',20); return '🎁 '+CA.t('Készlet')+' (2 '+CA.t('fegyver')+' +3)';
      }
    }
    return '🎁';
  }

  // expose a helper the core/modes can call directly too
  function pickupCrate(u, c){
    let msg='', color='#fff';
    if (c.kind==='mystery'){
      // TASK 2 — mystery.png: a bigger, fully-random surprise
      msg = '❓ ' + grantRandomReward(u, true);
      color='#ffd54a';
      // celebratory burst
      puff(c.x, c.y, '#fd6', 18);
      puff(c.x, c.y-6, '#9cf', 12);
      if (CA.state && CA.state.camera) CA.state.camera.shake = Math.min(20, (CA.state.camera.shake||0)+8);
    } else if (c.kind==='health'){
      const heal=U.randInt(25,40);
      u.hp = U.clamp(u.hp + heal, 0, u.maxHp);
      if (u.anim){ u.anim.hitFlash=0; }
      msg='+'+heal+' ❤ '+CA.t('Élet');
      color='#5d5';
      puff(c.x, c.y, '#5d5', 14);
    } else {
      const w = byId(c.item);
      if (w){
        // ULTRA-RARE megas are single-use ultimates: a crate grants exactly ONE
        // charge. Ordinary crate weapons grant the usual +2.
        const isMega = (MEGA_IDS.indexOf(w.id) >= 0);
        const add = isMega ? 1 : 2;
        CA.addAmmo(w.id, add, u.teamId);   // crate ammo to the picking-up unit's team
        // make crate weapons selectable in the ability bar (else you "don't get" it)
        (S._crateWeapons=S._crateWeapons||{})[w.id]=true;
        msg=w.emoji+' '+CA.t(w.name)+' +'+add;
      }
      color = c.kind==='utility' ? '#9cf' : '#fc6';
      puff(c.x, c.y, color, 14);
    }
    // FIX 1 — pickup SFX (kept) + a self-contained floating reward label so the
    // player always sees what the crate gave.
    CA.events.emit('sfx', 'pickup');
    CA.events.emit('cratePickup', u, c, msg);
    addFloater(c.x, c.y-14, msg, color);
  }

  // fallback drawn crate (when the box PNG isn't available) — local space
  function drawFallbackCrate(ctx, c){
    const col = c.kind==='mystery' ? '#a4a' : c.kind==='health' ? '#3b6'
              : c.kind==='utility' ? '#37a' : '#a73';
    ctx.fillStyle = col;
    ctx.fillRect(-9,-9,18,18);
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=2; ctx.strokeRect(-9,-9,18,18);
    ctx.fillStyle='#fff';
    ctx.font='bold 13px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const icon = c.kind==='mystery' ? '?' : c.kind==='health' ? '+'
               : c.kind==='utility' ? '?' : '★';
    ctx.fillText(icon, 0, 1);
  }

  // Sky-drop cadence: exactly ONE crate every 3 rounds (round 3, 6, 9, …).
  // No per-second random spam — the only source of crates is this trigger.
  CA.events.on('newRound', (round)=>{
    const r = (typeof round==='number') ? round : (S.round||0);
    if (r>0 && r%3===0) spawnCrate();
  });

  // TASK A — a crate that falls into water SINKS (rising bubbles) and is gone.
  //  Guarded; if anything is missing it just marks the crate dead.
  function sinkCrate(c){
    try{
      if (c._sinking) return;               // already sinking — don't re-splash
      c._sinking = true;
      c._dead = true;                        // consumed: removed at end of loop
      CA.events.emit('sfx','splash');        // first water-contact splash
      // rising bubbles (fx)
      try{
        if (CA.FX && CA.FX.spawnParticles){
          CA.FX.spawnParticles({ x:c.x, y:c.y, count:18, spdMin:0.4, spdMax:2.2,
            life:34, size:3, color:'#bfe6ff' });
        }
      }catch(e){}
      puff(c.x, c.y, '#bfe6ff', 10);
    }catch(e){}
  }

  // TASK B — burst a crate that got hit by a projectile / explosion. Grants the
  //  reward to the projectile owner if available & nearby-ish, else just pops it.
  function burstCrate(c, ownerId){
    try{
      if (c._dead) return;
      let owner = null;
      try{ if (ownerId!=null && CA.getUnit) owner = CA.getUnit(ownerId); }catch(e){ owner=null; }
      c._dead = true;
      if (owner && owner.alive){
        // give the reward to the firing unit (text floats over the crate)
        pickupCrate(owner, c);
      } else {
        // No projectile owner (burst by an EXPLOSION, or the owner was lost):
        // credit the ACTIVE unit. In a turn-based match whoever set off the blast
        // IS the current player, so "if I hit a crate, its contents are mine"
        // holds even when the hit came from a blast rather than a direct pellet.
        var au = null; try{ au = CA.activeUnit ? CA.activeUnit() : null; }catch(e){ au = null; }
        if (au && au.alive){
          pickupCrate(au, c);
        } else {
          // truly nobody to credit — just burst it open with a puff + neutral floater
          try{ CA.events.emit('sfx','pickup'); }catch(e){}
          puff(c.x, c.y, c.kind==='mystery' ? '#fd6' : c.kind==='health' ? '#5d5' : '#fc6', 16);
          try{ addFloater(c.x, c.y-14, '💥', '#fff'); }catch(e){}
        }
      }
    }catch(e){}
  }

  // Explosions burst nearby crates too — not only a direct projectile overlap.
  // A grenade/rocket/blast landing next to a crate counts as "hitting" it; the
  // reward goes to the active shooter (burstCrate's owner-fallback resolves it).
  CA.events.on('explosion', function(x, y, radius){
    try{
      if (!S.crates || !S.crates.length) return;
      var r = (typeof radius === 'number' && radius > 0) ? radius : 0;
      for (var i=0;i<S.crates.length;i++){
        var c = S.crates[i];
        if (!c || c._dead) continue;
        if (U.dist(x, y, c.x, c.y) < r + 12){ burstCrate(c, null); }
      }
    }catch(e){}
  });

  function updateCrates(k){
    if (!S.crates || !S.crates.length) return;
    const u = CA.activeUnit();
    const HALF = 10;                         // crate half-height (drawn ~±s, settles -10)
    const waterY = (CA.state && CA.state.waterLevel) || C.WATER_LEVEL;
    const projs = (S.projectiles && S.projectiles.length) ? S.projectiles : null;
    for (const c of S.crates){
      if (c._dead) continue;
      // TASK B — shootable: any live projectile within the crate radius bursts it.
      if (projs){
        for (const p of projs){
          if (!p || !p.alive || p._submerged) continue;
          if (U.dist(p.x, p.y, c.x, c.y) < (HALF + (p.r||5) + 4)){
            burstCrate(c, p.ownerId);
            break;
          }
        }
        if (c._dead) continue;
      }
      // TASK A — a crate whose centre drops below the water line SINKS away.
      if (c.y > waterY){
        sinkCrate(c);
        continue;
      }
      if (!c.grounded){
        c.vy += C.GRAVITY*0.5*k;            // parachuted: slow descent
        if (c.vy>2.6) c.vy=2.6;             // gentle terminal velocity
        c.y += c.vy*k;
        // gentle sway under the canopy
        c.sway = (c.sway||0) + 0.05*k;
        c.x += Math.sin(c.sway)*0.5*k;
        // land on terrain or water
        const gy = (CA.Terrain && CA.Terrain.heightAt) ? CA.Terrain.heightAt(c.x) : waterY;
        // if it would settle on/under the water line, sink instead of float
        if (c.y >= waterY-HALF && (gy-HALF) >= waterY-HALF){
          sinkCrate(c);
          continue;
        }
        if (c.y >= gy-HALF || c.y >= waterY-HALF){
          c.y = Math.min(gy-HALF, waterY-HALF);
          c.grounded=true; c.vy=0;
          puff(c.x, c.y+8, '#ddd', 6);
        }
      } else {
        // FIX 2 — a grounded crate must FALL if the terrain under it is blown
        // away. Only act when unsupported (no jitter at rest).
        const solidBelow = CA.Terrain && CA.Terrain.isSolid
                         ? CA.Terrain.isSolid(c.x, c.y + HALF + 2) : true;
        const atWater = c.y >= waterY - HALF - 0.5;
        const atBottom = c.y >= C.WORLD_H - HALF - 0.5;
        if (!solidBelow && !atWater && !atBottom){
          c.vy = (c.vy||0) + C.GRAVITY*k;     // ordinary gravity (no parachute)
          if (c.vy>9) c.vy=9;
          c.y += c.vy*k;
          // settle the moment it meets a surface / water / world bottom
          const gy = (CA.Terrain && CA.Terrain.heightAt) ? CA.Terrain.heightAt(c.x) : waterY;
          // if water is the lowest surface here, it SINKS instead of floating
          if (c.y >= waterY-HALF && (gy-HALF) >= waterY-HALF){
            sinkCrate(c);
            continue;
          }
          const landY = Math.min(gy - HALF, waterY - HALF, C.WORLD_H - HALF);
          if (c.y >= landY){
            c.y = landY; c.vy = 0;
            puff(c.x, c.y+8, '#ddd', 5);
          }
        } else {
          c.vy = 0;                           // resting — stay put, no reposition
        }
      }
      // pickup by the ACTIVE unit walking near it
      if (u && u.alive && CA.canControl && CA.canControl()){
        if (U.dist(u.x,u.y,c.x,c.y) < C.UNIT_R+14){ c._dead=true; pickupCrate(u, c); }
      }
    }
    S.crates = S.crates.filter(c=>!c._dead);
  }

  /* ---- public API -------------------------------------------------------- */
  CA.Weapons = {
    init(){ if(!S.selectedWeapon) S.selectedWeapon='bazooka'; },
    LIST,
    currentWeapon(){ return byId(S.selectedWeapon); },

    // #1 timer-grenade fuse: player-presettable 1..5s. Default 3s.
    timerFuse: 3,
    // cycle 1 -> 2 -> 3 -> 4 -> 5 -> 1 (UI / a key can call this). Returns new value.
    cycleTimerFuse(){
      this.timerFuse = (this.timerFuse % 5) + 1;
      try{ CA.events.emit('timerFuse', this.timerFuse); }catch(e){}
      return this.timerFuse;
    },

    fireCharged(u, wid, power){
      if (!u || !u.alive) return;
      const w = byId(wid);
      if (CA.ammoOf(w.id, u.teamId)===0) return false; // out of ammo (this team), do nothing
      // QA guards (the AI fires straight through here, so enforce centrally):
      // on-cooldown abilities must NOT fire, and the custom weapon-set restriction
      // applies to the AI too (return false → AI fizzle-guard ends the turn).
      if (w.ability && u.cooldowns && u.cooldowns[w.id] > 0) return false;
      if (CA.weaponAllowed && !CA.weaponAllowed(w.id)) return false;

      let didFire = true;

      switch(w.id){
        case 'shotgun': {
          // SINGLE shot that ends the turn — the old two-shot design kept colliding
          // with the one-shot-per-turn rule (dead 2nd shot for humans, AI cascade).
          // Fire the hitscan and end the turn like any normal weapon.
          fireHitscan(u, w);
          CA.onFired(u, w);          // w.id='shotgun', endsTurn:true → clean turn end
          return;
        }
        case 'melee':   fireMelee(u, w);   break;
        case 'teleport':didFire = fireTeleport(u); break;
        case 'portal':  didFire = firePortal(u); break;
        case 'airstrike':fireAirstrike(u, w); break;

        /* ---- #11 utilities: may fizzle (don't consume ammo/turn) ---- */
        case 'rope':      didFire = fireRope(u);      break;
        case 'parachute': didFire = fireParachute(u); break;
        case 'girder':    didFire = fireGirder(u);    break;

        /* ---- #12 mine: placed at feet ---- */
        case 'mine': {
          if (CA.Hazards && CA.Hazards.add){
            CA.Hazards.add('mine', u.x, u.y+C.UNIT_R-4, { ownerId:u.id, r:w.radius, dmg:w.damage, kb:w.knockback });
            puff(u.x, u.y+8, '#aaa', 6);
            CA.events.emit('sfx','tick');
          } else didFire=false;
          break;
        }

        /* ---- #4 magnet-mine: lobbed, settles, then homes to nearest enemy ---- */
        case 'magnetmine': {
          const v = launchVel(u, power, 0.85);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:7, affectedByWind:false, fuse:null, bounce:0.3, _w:w, _kind:'magnetmine',
            data:{ armed:false, arm:40, homeSpeed:1.6, life:600 } });   // life: armed-lifetime budget so it can't crawl forever
          break;
        }

        /* ---- #1 timer grenade: same as grenade but uses the preset fuse ---- */
        case 'timergrenade': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          const fuse = U.clamp(CA.Weapons.timerFuse||3, 1, 5);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:6, affectedByWind:false, fuse:fuse, bounce:w.bounce, _w:w, _kind:'timergrenade',
            data:{ maxFuse:fuse } });
          break;
        }

        /* ---- #3 bouncing laser: fast straight shot, reflects, then pops ---- */
        case 'laser': {
          const a = -u.aimAngle;
          const sp = 22; // fast, fixed (power-independent)
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id,
            x:m.x, y:m.y, vx:Math.cos(a)*u.facing*sp, vy:Math.sin(a)*sp,
            r:3, affectedByWind:false, fuse:null, bounce:0, _w:w, _kind:'laser',
            data:{ bounces:0, maxBounces:4, life:220, trail:[] } });
          break;
        }

        /* ---- #5 smoke grenade: thrown, detonates into an obscuring cloud ---- */
        case 'smokegrenade': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:6, affectedByWind:false, fuse:w.fuse, bounce:w.bounce, _w:w, _kind:'smoke' });
          break;
        }

        /* ---- ballistic specials with custom projectile kinds ---- */
        case 'drill': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:6, affectedByWind:false, fuse:null, bounce:0, _w:w, _kind:'drill',
            data:{ tunnel:0, maxTunnel:130 } });
          break;
        }
        case 'spikeball': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:9, affectedByWind:false, fuse:w.fuse, bounce:w.bounce, _w:w, _kind:'spikeball',
            data:{ hitCd:0 } });
          break;
        }
        case 'logtoss': {
          const v = launchVel(u, power, 0.95);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:11, affectedByWind:false, fuse:w.fuse, bounce:w.bounce, _w:w, _kind:'log' });
          break;
        }
        case 'bellyflop': {
          // short, high lob — boost vertical, cut horizontal
          const v = launchVel(u, power, 0.7);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx*0.6, vy:v.vy*1.25,
            r:10, affectedByWind:false, fuse:null, bounce:0, _w:w, _kind:'bellyflop' });
          break;
        }
        case 'eggbomb': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:7, affectedByWind:w.affectedByWind, fuse:w.fuse, bounce:w.bounce, _w:w, _kind:'egg' });
          break;
        }
        case 'napalm': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:5, affectedByWind:w.affectedByWind, fuse:null, bounce:0, _w:w, _kind:'napalm' });
          break;
        }
        case 'gasgrenade': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:6, affectedByWind:false, fuse:w.fuse, bounce:w.bounce, _w:w, _kind:'gas' });
          break;
        }
        case 'guided': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          const p=spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:6, affectedByWind:false, fuse:null, bounce:0, _w:w, _kind:'guided',
            data:{ steer:120, speed:Math.hypot(v.vx,v.vy)||8 } });
          S._guidedId = p.id;  // active guided projectile for steering
          break;
        }

        /* ---- NEW WEAPONS & MOVEMENT (agent) -------------------------- */
        // utilities may FIZZLE (don't consume ammo / turn) -> didFire flag.
        case 'jetpack':   didFire = fireJetpack(u);       break;
        case 'blowtorch': didFire = fireBlowtorch(u);     break;
        case 'lowgrav':   didFire = fireLowGrav();        break;
        case 'freeze':    didFire = fireFreeze(u);        break;
        case 'chargehog': didFire = fireChargeHog(u, w);  break;
        case 'bat':       fireBat(u, w);                  break;
        case 'sniper': {
          fireSniper(u, w, power);
          CA.spendAmmo(w.id, u.teamId);
          CA.onFired(u, w);              // endsTurn:true, hitscan resolves instantly
          return;
        }
        case 'napalmstrike': fireAirstrike(u, w, 'napalmbomb'); break;
        case 'minestrike':   fireAirstrike(u, w, 'minebomb');   break;

        /* ---- ULTRA-RARE GRANDIOSE ULTIMATES ---- */
        case 'magicorb':  didFire = fireMagicOrb(u, w);  break;
        case 'nuke':      didFire = fireNuke(u, w);      break;
        case 'firerain':  didFire = fireFireRain(u, w);  break;
        case 'blackhole': didFire = fireBlackHole(u, w); break;
        case 'meteors':   didFire = fireMeteors(u, w);   break;
        case 'quake':     didFire = fireQuake(u, w);     break;
        case 'homing': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:6, affectedByWind:false, fuse:null, bounce:0, _w:w, _kind:'homing',
            data:{ speed:Math.max(7, Math.hypot(v.vx,v.vy)||8), life:200 } });
          break;
        }
        case 'mirv': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:6, affectedByWind:w.affectedByWind, fuse:null, bounce:0, _w:w, _kind:'mirv',
            data:{ split:false, lastVy:v.vy } });
          break;
        }
        case 'roller': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({ weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:7, affectedByWind:false, fuse:null, bounce:0, _w:w, _kind:'roller',
            data:{ rolling:false, dir:1, speed:3.2, roll:160 } });
          break;
        }

        /* ---- v4 CLASS ABILITIES -------------------------------------- */
        case 'summon_skeleton': didFire = fireSummonSkeleton(u);      break;
        case 'summon_zombie':   didFire = fireSummonZombie(u);        break;
        case 'bone_spear':      didFire = fireBoneSpear(u, w, power);  break;
        case 'shield_wall':     didFire = fireShieldWall(u);          break;
        case 'ground_slam':     didFire = fireGroundSlam(u, w);       break;
        case 'taunt':           didFire = fireTaunt(u);               break;
        case 'fireball':        didFire = fireFireball(u, w, power);  break;
        case 'frost_nova':      didFire = fireFrostNova(u, w, power); break;
        case 'chain_lightning': didFire = fireChainLightning(u, w, power); break;
        case 'charged_shot':    didFire = fireChargedShot(u, w, power); break;
        case 'mark_target':     didFire = fireMarkTarget(u);          break;
        case 'multishot':       didFire = fireMultishot(u, w, power); break;
        case 'build_wall':      didFire = fireBuildWall(u);           break;
        case 'deploy_turret':   didFire = fireDeployTurret(u);        break;
        case 'place_trap':      didFire = firePlaceTrap(u, w);        break;
        case 'heal_beam':       didFire = fireHealBeam(u);            break;
        case 'buff_aura':       didFire = fireBuffAura(u);            break;
        case 'revive':          didFire = fireRevive(u);              break;

        case 'dynamite': {
          // THROWN like a grenade — arcs with aim + power, fuse ticks, light bounce.
          // A quick tap still lobs it a short way (min power) so it's never "stuck".
          const v = launchVel(u, Math.max(power, 0.42));
          const m = muzzle(u);
          spawnProjectile({
            weaponId:w.id, ownerId:u.id,
            x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:6, affectedByWind:false, fuse:w.fuse, bounce:0.25, _w:w, _kind:'dynamite',
          });
          break;
        }

        case 'cluster': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({
            weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:5, affectedByWind:w.affectedByWind, fuse:w.fuse, bounce:w.bounce, _w:w, _kind:'cluster',
          });
          break;
        }

        case 'capybomb': {
          const v = launchVel(u, power, 0.92); // a touch heavier lob
          const m = muzzle(u);
          spawnProjectile({
            weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:10, affectedByWind:w.affectedByWind, fuse:w.fuse, bounce:w.bounce, _w:w, _kind:'capybomb',
          });
          break;
        }

        // CAPY-CSAPÁS: nagyobb, aranyló rakéta saját 🐹-nyikkanással (backlog #6) —
        // így nem ugyanaz a szürke löveg, mint a bazooka; a stack-bónusz külön él.
        case 'capyslam': {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({
            weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:9, affectedByWind:w.affectedByWind, fuse:w.fuse, bounce:w.bounce, _w:w, _kind:'capyslam',
          });
          try{ CA.events.emit('sfx','select'); }catch(e){}
          try{ if(CA.Voices && CA.Voices.speak) CA.Voices.speak(u.species||u.kind, 'fire'); }catch(e){}
          break;
        }

        // bazooka, grenade, and any other ballistic power weapon
        default: {
          const v = launchVel(u, power);
          const m = muzzle(u);
          spawnProjectile({
            weaponId:w.id, ownerId:u.id, x:m.x, y:m.y, vx:v.vx, vy:v.vy,
            r:5, affectedByWind:w.affectedByWind, fuse:w.fuse, bounce:w.bounce, _w:w, _kind:'shell',
          });
        }
      }

      if (!didFire) return;
      // v4 abilities: gate by per-hero cooldown instead of consuming global ammo.
      if (w.ability) setCooldown(u, w);
      CA.spendAmmo(w.id, u.teamId);
      CA.onFired(u, w);
    },

    update(dt){
      const k = dt || 1;
      // QA3 #5 — projectiles must collide/detonate against the LIVE water line.
      // Units use the dynamic, rising S.waterLevel (sudden-death); projectiles
      // historically used the static C.WATER_LEVEL → shots passed through risen
      // water. Use the dynamic value, falling back to the static config.
      const WL = (S.waterLevel != null ? S.waterLevel : C.WATER_LEVEL);

      // #11 parachute: damp the active unit's fall while the flag is set
      const au = CA.activeUnit();
      if (au && au.alive){
        if (au.parachute>0){
          au.parachute -= k;
          if (au.vy>1.2){ au.vy *= 0.86; if (au.vy<1.2) au.vy=1.2; }
          // gentle wind drift under canopy
          au.vx += C.MAX_WIND * (S.wind||0) * 0.5 * k;
          if (au.parachute<=0) au.parachute=0;
          if (au.grounded) au.parachute=0;
        }
        if (au._rope!=null && au._rope.t>0){
          au._rope.t -= k;
          // #6 brief sustained pull toward the anchor for a smooth swing
          if (au._rope.pt>0 && !au.grounded){
            au._rope.pt -= k;
            const rdx = au._rope.x - au.x, rdy = au._rope.y - au.y;
            const rl = Math.hypot(rdx,rdy)||1;
            const f = (au._rope.pull||6) * 0.05;
            au.vx += (rdx/rl)*f*k;
            au.vy += (rdy/rl)*f*k - 0.04*k; // tiny lift to counter gravity mid-swing
          }
        }
      }

      // #15 crates: gravity / landing / pickup
      updateCrates(k);

      // PORTAL: tick down the post-warp immunity window (shared by all projectiles)
      if (_portalCooldown>0) _portalCooldown -= k;
      // PORTAL — UNITS walk/fall through too (multi-use, any unit). Tick each unit's
      // own warp cooldown and relocate any unit overlapping a live portal mouth.
      if (PORTALS.a && PORTALS.b && S.units){
        for (var _pu=0; _pu<S.units.length; _pu++){
          var _puU = S.units[_pu];
          if (_puU && _puU._portalCd>0) _puU._portalCd -= k;
          tryPortalUnit(_puU);
        }
      }

      // ULTIMATE — BLACK HOLE: while the vortex lives it drags nearby units AND
      // loose projectiles toward its centre; when it expires it IMPLODES into one
      // big boom. All pull is velocity-nudges (the knockback pattern, inverted).
      if (S._blackhole){
        const bh = S._blackhole;
        bh.t -= k;
        const pullR = bh.r;          // influence radius
        const core  = bh.r*0.18;
        // suck units (everyone — it's a singularity; capped so it can't fling wildly)
        for (const t of (S.units||[])){
          if (!t || !t.alive) continue;
          const dx = bh.x - t.x, dy = bh.y - t.y;
          const d = Math.hypot(dx,dy)||1;
          if (d < pullR){
            const f = (1 - d/pullR) * 0.7;          // stronger nearer the centre
            t.vx = (t.vx||0) + (dx/d)*f*k;
            t.vy = (t.vy||0) + (dy/d)*f*k;
            t.grounded = false;
          }
        }
        // suck loose projectiles too (skip the blackhole's own kind if any linger)
        for (const q of (S.projectiles||[])){
          if (!q || !q.alive || q._submerged) continue;
          if (q.data && q.data.delay>0) continue;   // not active yet
          const dx = bh.x - q.x, dy = bh.y - q.y;
          const d = Math.hypot(dx,dy)||1;
          if (d < pullR){
            const f = (1 - d/pullR) * 0.9;
            q.vx = (q.vx||0) + (dx/d)*f*k;
            q.vy = (q.vy||0) + (dy/d)*f*k;
          }
        }
        // swirling debris FX while it lives
        if (CA.FX && CA.FX.vortexTick) CA.FX.vortexTick(bh.x, bh.y, bh.r, 1 - bh.t/bh.max);
        if (S.camera && (S.frame&3)===0) S.camera.shake = Math.min(20, (S.camera.shake||0)+2);
        if (bh.t<=0){
          // implosion → one big blast at the centre
          boom(bh.x, bh.y, bh.r, bh.dmg, bh.kb, bh.ownerId, false);
          boom(bh.x, bh.y, Math.round(bh.r*0.5), Math.round(bh.dmg*0.6), bh.kb*0.6, bh.ownerId, false);
          if (CA.FX && CA.FX.vortexCollapse) CA.FX.vortexCollapse(bh.x, bh.y, bh.r);
          if (S.camera) S.camera.shake = Math.min(28, (S.camera.shake||0)+22);
          try{ CA.events.emit('sfx','boom_big'); }catch(e){}
          S._blackhole = null;
        }
      }

      for (const p of S.projectiles){
        if (!p.alive) continue;

        // Rising water can engulf a resting grenade between simulation steps.
        // Handle this before portals, enemy contact and weapon-specific logic.
        if (p._submerged){ updateSubmerged(p,k,WL); continue; }
        if (!(p.data && p.data.delay>0) && canSink(p) && p.y+p.r>=WL){
          sinkProjectile(p,WL);
          continue;
        }

        // STAGGERED ONSET: fire-rain fireballs and meteors carry a data.delay so
        // they don't all arrive on the same frame. While delayed the projectile is
        // fully dormant (no move, no collision) — just count the delay down.
        if (p.data && p.data.delay>0){ p.data.delay -= k; continue; }

        // PORTAL redirection: a complete portal pair warps any projectile that
        // enters one mouth out the other (velocity rotated to the exit facing).
        // Checked first so it applies to every projectile kind/integrator below.
        if (PORTALS.a && PORTALS.b) tryPortalProjectile(p);

        // UNIVERSAL DIRECT HIT: a damaging projectile that touches an ENEMY unit
        // detonates ON CONTACT — it must not pass THROUGH the body and only blow
        // up on the ground (Jani). Owner's whole team is skipped (no friendly det
        // + no muzzle blast). Drill tunnels, so it's excluded.
        {
          const pw = byId(p.weaponId);
          // spikeball kizárva: az a guruló-pattogó kontakt-pofozó (lenti loop)
          // sebzésén él — a teljes detonáció az első ellenség-érintésre pont a
          // multi-bounce lényegét ölte meg (QA P1).
          if (pw && (pw.radius>0 || pw.damage>0) && p._kind!=='drill' && p._kind!=='spikeball'){
            // owner may be DEAD now → fall back to the team captured at fire time
            let ot=(S.units.find(t=>t.id===p.ownerId)||{}).teamId;
            if (ot==null) ot=p._ownerTeam;
            for (const t of S.units){
              if (!t.alive || (ot!=null && t.teamId===ot)) continue;
              if (U.dist(p.x,p.y,t.x,t.y) <= C.UNIT_R + (p.r||4)){ detonate(p); break; }
            }
            if (!p.alive) continue;
          }
        }

        // ULTIMATE — MAGIC ORB: a slow glowing sphere that BORES through terrain
        // along its flight, carving a wide horizontal gouge (total ~30% of the
        // world width) and blasting as it goes. It ignores most gravity so it
        // ploughs roughly straight. Detonates when its carve budget is spent, on
        // off-world, or on the universal direct-hit above.
        if (p._kind==='magicorb' && p.data){
          p.vy += C.GRAVITY*0.12*k;               // barely droops
          p.x += p.vx*k; p.y += p.vy*k;
          p.spriteRot += 0.18*k;
          if (CA.FX && CA.FX.magicTrail) CA.FX.magicTrail(p.x, p.y);
          else trail(p, '#c9f');
          // periodic carve + small blast along the path (throttled)
          p.data.carveCd -= k;
          if (p.data.carveCd<=0 && p.data.carveBudget>0){
            p.data.carveCd = 4;                    // ~ every 4 frames
            const cr = p.data.carveR;
            if (CA.Terrain && CA.Terrain.destroy) CA.Terrain.destroy(p.x, p.y, cr);
            // a modest blast so units in the gouge take damage (capped, pipeline)
            boom(p.x, p.y, Math.round(cr*1.4), Math.round((p._w.damage||40)*0.5), (p._w.knockback||1)*0.6, p.ownerId, false);
            // budget is spent in horizontal carve-width (diameter per tick)
            p.data.carveBudget -= cr*2;
            if (CA.FX && CA.FX.magicGlow) CA.FX.magicGlow(p.x, p.y, cr*1.5);
          }
          if (p.x<-40||p.x>C.WORLD_W+40||p.y<-200||p.y>C.WORLD_H+40){ detonate(p); continue; }
          if (p.y>=WL){ puff(p.x,WL,'#c9f',12); detonate(p); continue; }
          if (p.data.carveBudget<=0){ detonate(p); continue; }   // gouge complete
          continue;
        }

        // #13 guided: steer heading toward input/mouse for a short window
        if (p._kind==='guided' && p.id===S._guidedId && p.data){
          if (p.data.steer>0){
            p.data.steer -= k;
            // QA P1: az AI által kilőtt guided-et a JÁTÉKOS egere terelte (a
            // mousemove AI-körben is frissíti a mouseWorld-öt) → a játékos az AI
            // rakétáját a saját csapatába húzhatta. Csak EMBERI kör irányíthat.
            const _humanTurn = !((S.teams[S.currentTeamIdx]||{}).isAI);
            // build a steer vector from arrow keys
            let sx=0, sy=0;
            if (_humanTurn){
              if (S.input.left)  sx-=1;
              if (S.input.right) sx+=1;
              if (S.input.up)    sy-=1;
              if (S.input.down)  sy+=1;
              if (sx===0 && sy===0){
                // fall back to mouse aim if available
                const mx=S.input.mouseWorldX, my=S.input.mouseWorldY;
                if (mx>0 && mx<C.WORLD_W){ sx=mx-p.x; sy=my-p.y; }
              }
            }
            if (sx!==0 || sy!==0){
              const tl=Math.hypot(sx,sy)||1; sx/=tl; sy/=tl;
              const sp=p.data.speed;
              // nudge velocity toward steer dir, keep speed ~constant
              p.vx = U.lerp(p.vx, sx*sp, 0.12*k);
              p.vy = U.lerp(p.vy, sy*sp, 0.12*k);
              const cl=Math.hypot(p.vx,p.vy)||1; p.vx=p.vx/cl*sp; p.vy=p.vy/cl*sp;
            }
            if (p.data.steer<=0){ detonate(p); continue; }  // burns out -> boom
          }
          // guided ignores gravity while steering
          const x0=p.x,y0=p.y;
          p.x += p.vx*k; p.y += p.vy*k;
          p.spriteRot = Math.atan2(p.vy, p.vx);
          trail(p, '#9cf');
          if (p.x<-40||p.x>C.WORLD_W+40||p.y<-200||p.y>C.WORLD_H+40){ p.alive=false; S._guidedId=null; continue; }
          if (p.y+p.r>=WL){ sinkProjectile(p,WL,x0,y0); continue; }
          if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(p.x,p.y)){ detonate(p); continue; }
          continue;
        }

        // #8 drill: flies FLAT toward the aim, then bores STRAIGHT through terrain a
        // fixed distance, then booms. Light gravity (0.3×) so it slams into the
        // hillside in the aimed line and actually drills, instead of arcing over flat
        // ground and splashing into the water far away ("eldobódik", Jani).
        if (p._kind==='drill' && p.data){
          p.vy += C.GRAVITY*0.3*k;
          // once it has bitten into terrain, keep boring along its CURRENT heading
          // (don't let the small residual gravity curve it back out of the ground).
          if (p.data.tunnel>0){ const sp=Math.hypot(p.vx,p.vy)||1; const dx=p.data.dirx, dy=p.data.diry; p.vx=dx*sp; p.vy=dy*sp; }
          const x0=p.x,y0=p.y;
          p.x += p.vx*k; p.y += p.vy*k;
          p.spriteRot = Math.atan2(p.vy, p.vx);
          if ((S.frame&1)===0) puff(p.x, p.y, '#ca8', 1);
          // QA P0: a felfelé kifúródó drillnek nem volt y<-200 kill-határa, és a
          // fix-irányú fúrás + a gravitáció stabil FELFELÉ driftbe konvergált →
          // halhatatlan lövedék, ami a meccs végéig túszul ejtette a kamerát.
          if (p.x<-40||p.x>C.WORLD_W+40||p.y<-200||p.y>C.WORLD_H+40){ p.alive=false; continue; }
          if (p.data.tunnel<=0 && p.y+p.r>=WL){ sinkProjectile(p,WL,x0,y0); continue; }
          // ha fúrás közben LEVEGŐBE ér (átfúrta a vékony falat/párkányt) →
          // robbanjon ott, ne repüljön tovább a semmiben (QA P0).
          if (p.data.tunnel>0 && !(CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(p.x,p.y))){
            detonate(p); continue;
          }
          // DIRECT HIT while still airborne (not yet boring): the drill is excluded
          // from the universal direct-hit (so it can tunnel), but a unit standing on
          // flat ground was being passed THROUGH (whiff). Detonate on enemy contact
          // before it starts boring. Owner's whole team is skipped.
          if (p.data.tunnel<=0){
            let ot=(S.units.find(t=>t.id===p.ownerId)||{}).teamId;
            if (ot==null) ot=p._ownerTeam;
            for (const t of S.units){
              if (!t.alive || (ot!=null && t.teamId===ot)) continue;
              if (U.dist(p.x,p.y,t.x,t.y) <= C.UNIT_R + (p.r||4)){ detonate(p); break; }
            }
            if (!p.alive) continue;
          }
          // Water only disables an airborne drill; an active tunnel keeps boring.
          if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(p.x,p.y)){
            // lock the boring heading on the first bite so light gravity can't curve it out
            if (p.data.tunnel<=0){ const sp=Math.hypot(p.vx,p.vy)||1; p.data.dirx=p.vx/sp; p.data.diry=p.vy/sp; }
            // carve a narrow tunnel as it bores
            if (CA.Terrain.destroy) CA.Terrain.destroy(p.x, p.y, 8);
            p.data.tunnel += Math.hypot(p.vx,p.vy)*k;
            if (p.data.tunnel >= p.data.maxTunnel){ detonate(p); continue; }
          }
          continue;
        }

        // v4 bone_spear: fast, light-gravity piercing shaft. On contact with a
        // unit it detonates a small blast THERE but keeps flying (pierce>0),
        // detonating fully on terrain/water/expiry or when pierce runs out.
        if (p._kind==='bonespear' && p.data){
          p.vy += C.GRAVITY*0.35*k;  // mostly flat
          const px0=p.x, py0=p.y;
          p.x += p.vx*k; p.y += p.vy*k;
          p.spriteRot = Math.atan2(p.vy, p.vx);
          if ((S.frame&1)===0) puff(p.x, p.y, '#dcd', 1);
          // QA P0: a lassú (grav 0.35) bone_spear-t egy portál/fekete lyuk a
          // pálya FÖLÉ tolhatta; y<-200 kill-határ nélkül a core a teljes ~6s-ig
          // élve tartotta (drill ~2482 / homing ~2684 mintára).
          if (p.x<-40||p.x>C.WORLD_W+40||p.y<-200||p.y>C.WORLD_H+40){ p.alive=false; continue; }
          if (p.y+p.r>=WL){ sinkProjectile(p,WL,px0,py0); continue; }
          // pierce: swept unit check, blast each NEW victim, decrement pierce.
          // Route the pierce hit through boom() (not raw CA.explode) so it gets
          // the same crit/combo/_dmgMul treatment as the final detonation.
          if (p.data.pierce>0){
            const pw = p._w || byId(p.weaponId);
            p.data._hit = p.data._hit || {};
            for (const t of S.units){
              if (!t.alive || t.id===p.ownerId) continue;
              if (p.data._hit[t.id]) continue;
              if (U.dist(p.x,p.y,t.x,t.y) < p.r+C.UNIT_R){
                p.data._hit[t.id]=true;
                boom(p.x, p.y, 24, 22, 0.9, p.ownerId, pw && pw.ability);
                puff(p.x, p.y, '#eee', 8);
                p.data.pierce--;
                if (p.data.pierce<=0){ detonate(p); break; }
              }
            }
            if (!p.alive) continue;
          }
          if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(p.x,p.y)){
            p.x=px0; p.y=py0; detonate(p); continue;
          }
          continue;
        }

        // #3 laser: fast, gravity/wind-immune straight shot that REFLECTS off
        // solid terrain up to maxBounces times, then detonates (small radius).
        if (p._kind==='laser' && p.data){
          p.data.life -= k;
          // keep a short trail for the render
          if (p.data.trail){
            p.data.trail.push({x:p.x,y:p.y});
            if (p.data.trail.length>10) p.data.trail.shift();
          }
          // swept move so a fast laser can't tunnel through thin walls
          const speed = Math.hypot(p.vx,p.vy)||1;
          const steps = Math.max(1, Math.ceil(speed/3));
          let detonated=false, expired=false;
          for (let s=0; s<steps && p.alive; s++){
            const nx = p.x + (p.vx/steps)*k;
            const ny = p.y + (p.vy/steps)*k;
            // off-world / water -> pop
            if (nx<-20||nx>C.WORLD_W+20||ny<-200){ p.x=nx; p.y=ny; expired=true; break; }
            if (ny>=WL){ p.x=nx; p.y=WL; puff(nx,WL,'#7cf',6); detonated=true; break; }
            if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(nx,ny)){
              // reflect off the surface normal (sample like the bounce code)
              const cc = CA.Terrain.collideCircle ? CA.Terrain.collideCircle(p.x, p.y, p.r) : null;
              let nrx, nry;
              if (cc){ nrx=cc.nx; nry=cc.ny; }
              else {
                // numeric normal: probe solidity around the point
                nrx = (CA.Terrain.isSolid(p.x-3,p.y)?1:0) - (CA.Terrain.isSolid(p.x+3,p.y)?1:0);
                nry = (CA.Terrain.isSolid(p.x,p.y-3)?1:0) - (CA.Terrain.isSolid(p.x,p.y+3)?1:0);
                const nl=Math.hypot(nrx,nry); if(nl>0){ nrx/=nl; nry/=nl; } else { nrx=0; nry=-1; }
              }
              const dot = p.vx*nrx + p.vy*nry;
              p.vx = p.vx - 2*dot*nrx;
              p.vy = p.vy - 2*dot*nry;
              // nudge out of the surface so we don't re-collide instantly
              p.x += nrx*2; p.y += nry*2;
              puff(p.x, p.y, '#9ef', 4);
              p.data.bounces++;
              CA.events.emit('sfx','tick');
              if (p.data.bounces > p.data.maxBounces){ detonated=true; }
              break;
            }
            // unit hit -> pop
            let uhit=false;
            for (const t of S.units){
              if (!t.alive) continue;
              if (U.dist(nx,ny,t.x,t.y) < p.r+C.UNIT_R){ uhit=true; break; }
            }
            p.x=nx; p.y=ny;
            if (uhit){ detonated=true; break; }
          }
          p.spriteRot = Math.atan2(p.vy, p.vx);
          if (detonated){ detonate(p); continue; }
          if (expired || p.data.life<=0){ detonate(p); continue; }
          continue;
        }

        // #4 magnet-mine: lobs, settles on ground, ARMS, then slowly homes
        // horizontally toward the nearest enemy and detonates on contact.
        if (p._kind==='magnetmine' && p.data){
          if (!p.data.armed){
            // still flying: normal ballistic + bounce until it settles
            p.vy += C.GRAVITY*k;
            const x0=p.x, y0=p.y;
            p.x += p.vx*k; p.y += p.vy*k;
            p.spriteRot = Math.atan2(p.vy, p.vx);
            if (p.x<-40||p.x>C.WORLD_W+40||p.y>C.WORLD_H+40){ p.alive=false; continue; }
            if (p.y+p.r>=WL){ sinkProjectile(p,WL,x0,y0); continue; }
            if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(p.x,p.y)){
              // settle on the surface, then arm
              p.x=x0; p.y=y0;
              p.vx=0; p.vy=0; p.data.armed=true; p.data.arm=40;
              puff(p.x, p.y, '#aaf', 6);
              CA.events.emit('sfx','tick');
            }
            continue;
          }
          // armed: count down arming, then home toward nearest enemy
          if (p.data.arm>0){ p.data.arm-=k; continue; }
          // élesedett akna = HAZÁRD, nem "lövés": a kamera ne kövesse és ne
          // blokkolja a zoomot az ellenfél teljes körén át (QA P1, core._noFollow).
          p._noFollow = true;
          // lifetime guard: a fully-armed mine that never reaches a foe must not
          // crawl forever — burn down a budget and self-detonate when it expires.
          if (p.data.life!=null){
            p.data.life -= k;
            if (p.data.life<=0){ detonate(p); continue; }
          }
          // owner may be DEAD → fall back to the team captured at fire time so an
          // armed mine never re-targets / hits its own surviving teammates.
          let ownerTeam = teamOfOwner(p.ownerId);
          if (ownerTeam==null) ownerTeam = p._ownerTeam;
          const tgt = nearestEnemy(p.x, p.y, ownerTeam);
          if (tgt){
            const dir = Math.sign(tgt.x - p.x) || 0;
            p.vx = U.clamp(p.vx + dir*0.12*k, -p.data.homeSpeed, p.data.homeSpeed);
            // contact detonation
            if (U.dist(p.x,p.y,tgt.x,tgt.y) < C.UNIT_R + p.r + 4){ detonate(p); continue; }
          } else {
            p.vx *= 0.9;
          }
          // crawl along, hugging the ground (re-settle vertically). ANTI-TELEPORT
          // guard (roller-minta, QA P2): ha az oszlop teteje hirtelen sokkal
          // feljebb van (átlóg egy platform fölénk), NE ugorjon fel rá.
          const x0=p.x,y0=p.y;
          p.x += p.vx*k;
          p.x = U.clamp(p.x, 6, C.WORLD_W-6);
          if (CA.Terrain && CA.Terrain.heightAt){
            const gy = CA.Terrain.heightAt(p.x);
            const ny = gy - p.r - 1;
            const dyv = ny - p.y;
            if (dyv > -24 && dyv < 20) p.y = ny;          // normál talaj-követés
            else if (dyv >= 20) { p.y += Math.min(6, dyv); } // szakadékba: essen, ne teleportáljon
            // dyv <= -24: platform fölénk lóg → maradunk a jelenlegi magasságon
          }
          if (p.y+p.r>=WL){ sinkProjectile(p,WL,x0,y0); continue; }
          if ((S.frame&7)===0) puff(p.x, p.y-2, '#9af', 1);
          continue;
        }

        // HIGH #3 — HOMING MISSILE: fire-and-forget rocket that steers toward the
        // nearest enemy (reuses nearestEnemy + magnet-mine-style tracking), then
        // detonates on terrain/water/unit/expiry. Ignores gravity while thrusting.
        if (p._kind==='homing' && p.data){
          p.data.life -= k;
          // owner may be DEAD → fall back to the fire-time team so the missile
          // never steers into a surviving teammate.
          let ownerTeam = teamOfOwner(p.ownerId);
          if (ownerTeam==null) ownerTeam = p._ownerTeam;
          const tgt = nearestEnemy(p.x, p.y, ownerTeam);
          const sp = p.data.speed;
          if (tgt){
            // steer the velocity vector toward the target, keep speed constant
            let sx = tgt.x - p.x, sy = (tgt.y - C.UNIT_R*0.4) - p.y;
            const tl = Math.hypot(sx,sy)||1; sx/=tl; sy/=tl;
            p.vx = U.lerp(p.vx, sx*sp, 0.10*k);
            p.vy = U.lerp(p.vy, sy*sp, 0.10*k);
            const cl = Math.hypot(p.vx,p.vy)||1; p.vx=p.vx/cl*sp; p.vy=p.vy/cl*sp;
            // contact detonation
            if (U.dist(p.x,p.y,tgt.x,tgt.y) < C.UNIT_R + p.r + 2){ detonate(p); continue; }
          }
          const x0=p.x,y0=p.y;
          p.x += p.vx*k; p.y += p.vy*k;
          p.spriteRot = Math.atan2(p.vy, p.vx);
          trail(p, '#fa6');
          if (p.x<-40||p.x>C.WORLD_W+40||p.y<-200||p.y>C.WORLD_H+40){ p.alive=false; continue; }
          if (p.y+p.r>=WL){ sinkProjectile(p,WL,x0,y0); continue; }
          if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(p.x,p.y)){ detonate(p); continue; }
          if (p.data.life<=0){ detonate(p); continue; }
          continue;
        }

        // MED #8 — MIRV: an artillery shell that SPLITS at apex (vy crosses 0 from
        // up to down) into several arcing warheads (reuse the cluster bomblet
        // spawn). Wind-affected like an ordinary shell until it splits.
        if (p._kind==='mirv' && p.data){
          p.vy += C.GRAVITY * gravMult() * k;
          if (p.affectedByWind) p.vx += C.MAX_WIND * S.wind * k;
          const wasUp = p.data.lastVy < 0;
          p.data.age = (p.data.age||0) + k;
          // split once: at the arc's peak, OR after a short airtime fallback so a
          // FLAT/downward shot still MIRVs (was a dud single shell otherwise).
          if (!p.data.split && ((wasUp && p.vy >= 0) || p.data.age > 42)){
            p.data.split = true;
            p.alive = false;
            puff(p.x, p.y, '#fc6', 12);
            CA.events.emit('sfx','tick');
            const n = 5;
            // `w` is NOT in scope in update(); use the MIRV shell's own stats
            // (set as _w when fired) with a byId fallback — previously this threw
            // a ReferenceError and the MIRV spawned ZERO warheads (did nothing).
            const mw = p._w || byId('mirv');
            for (let i=0;i<n;i++){
              const ang = -Math.PI/2 + (i-(n-1)/2)*0.34 + U.rand(-0.06,0.06);
              const spd = U.rand(4, 7);
              spawnProjectile({
                weaponId:'mirv', ownerId:p.ownerId,
                x:p.x, y:p.y, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
                r:4, affectedByWind:true, fuse:null, bounce:0,
                _w:{ radius:mw.radius, damage:mw.damage, knockback:mw.knockback }, _kind:'shell',
              });
            }
            continue;
          }
          p.data.lastVy = p.vy;
          const x0=p.x,y0=p.y;
          p.x += p.vx*k; p.y += p.vy*k;
          p.spriteRot = Math.atan2(p.vy, p.vx);
          trail(p, '#fc6');
          if (p.x<-40||p.x>C.WORLD_W+40||p.y>C.WORLD_H+40){ p.alive=false; continue; }
          if (p.y+p.r>=WL){ sinkProjectile(p,WL,x0,y0); continue; }
          if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(p.x,p.y)){ detonate(p); continue; }
          continue;
        }

        // MED #9 — ROLLER: a bomb that, after it lands, HUGS the ground (follows
        // Terrain.heightAt) rolling downhill into trenches, then detonates when it
        // settles, hits a wall/unit, or its roll budget expires.
        if (p._kind==='roller' && p.data){
          if (!p.data.rolling){
            // airborne phase — ordinary ballistic until it first touches ground
            p.vy += C.GRAVITY * gravMult() * k;
            const x0=p.x, y0=p.y;
            p.x += p.vx*k; p.y += p.vy*k;
            p.spriteRot = Math.atan2(p.vy, p.vx);
            if (p.x<-40||p.x>C.WORLD_W+40||p.y>C.WORLD_H+40){ p.alive=false; continue; }
            if (p.y+p.r>=WL){ sinkProjectile(p,WL,x0,y0); continue; }
            if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(p.x,p.y)){
              p.x=x0; p.y=y0;
              p.data.rolling = true;
              p.data.dir = (p.vx>=0)?1:-1;     // keep rolling the way it was thrown
              p.vy = 0;
              CA.events.emit('sfx','tick');
            }
            continue;
          }
          // rolling phase: trundle along the surface, sinking into trenches
          p.data.roll -= k;
          // unit contact → boom
          for (const t of S.units){
            if (!t.alive || t.id===p.ownerId) continue;
            if (U.dist(p.x,p.y,t.x,t.y) < C.UNIT_R + p.r){ detonate(p); break; }
          }
          if (!p.alive) continue;
          const x0=p.x,y0=p.y;
          const nx = U.clamp(p.x + p.data.dir*p.data.speed*k, 6, C.WORLD_W-6);
          // blocked by an uphill wall taller than the roller → settle & boom
          if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(nx, p.y - p.r)){ detonate(p); continue; }
          p.x = nx;
          if (CA.Terrain && CA.Terrain.heightAt){
            const gy = CA.Terrain.heightAt(p.x);
            const targetY = gy - p.r - 1;
            const dy = targetY - p.y;
            // ANTI-TELEPORT on stacked maps (Ég): heightAt() returns the surface of
            // WHATEVER platform spans this column — which can be an OVERHEAD one.
            // If the surface jumps far UP, we've hit the platform-above's edge →
            // settle & boom (don't teleport up). If it drops far DOWN, we rolled off
            // an edge → go back to airborne so it FALLS to the platform below
            // (visible arc) instead of snapping there.
            if (dy < -24){ detonate(p); continue; }
            else if (dy > 20){
              p.data.rolling = false;
              p.vx = p.data.dir * p.data.speed; p.vy = 0;
              continue;
            } else {
              p.y = targetY;   // normal small step along the surface (slopes/trenches)
            }
          }
          if (p.y+p.r>=WL){ sinkProjectile(p,WL,x0,y0); continue; }
          p.spriteRot += p.data.dir*0.3*k;
          if ((S.frame&3)===0) puff(p.x, p.y, '#caa', 1);
          if (p.x<=6 || p.x>=C.WORLD_W-6 || p.data.roll<=0){ detonate(p); continue; }
          continue;
        }

        // forces (gravity honours the low-gravity utility multiplier)
        p.vy += C.GRAVITY * gravMult() * k;
        if (p.affectedByWind) p.vx += C.MAX_WIND * S.wind * k;

        // integrate (remember pre-move pos for swept collision below)
        const px0 = p.x, py0 = p.y;
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.spriteRot = Math.atan2(p.vy, p.vx);

        // Sweep the entire motion for both shells AND fused bouncing objects.
        // Circle contacts catch slopes before the grenade's centre burrows into
        // them; 2px sampling also catches thin terrain at high launch speeds.
        const dx=p.x-px0,dy=p.y-py0;
        const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/2));
        const bouncy=p.bounce>0 && p.fuse!=null && p.fuse>0;
        for (let s=1;s<=steps;s++){
          const t=s/steps,sx=px0+dx*t,sy=py0+dy*t;
          if (canSink(p) && sy+p.r>=WL){
            p.x=sx; p.y=sy;
            sinkProjectile(p,WL,px0,py0);
            break;
          }
          if (sy>=WL) break; // grand ultimates retain their surface-impact effect
          if (CA.Terrain && CA.Terrain.isSolid){
            const contact=bouncy && CA.Terrain.collideCircle
              ? CA.Terrain.collideCircle(sx,sy,p.r) : null;
            if (contact || CA.Terrain.isSolid(sx,sy)){
              const clear=(s-1)/steps;
              p.x=px0+dx*clear; p.y=py0+dy*clear;
              if (bouncy) reboundProjectile(p,contact,sx,sy);
              else detonate(p);
              break;
            }
          }
        }
        if (!p.alive || p._submerged) continue;

        // #8 spikeball: contact damage to units while bouncing (throttled)
        if (p._kind==='spikeball' && p.data){
          if (p.data.hitCd>0) p.data.hitCd-=k;
          if (p.data.hitCd<=0){
            // QA P1: a saját csapatot HAGYJA KI — alacsony erőnél a labda még a
            // csőtorkolatnál (18px) volt az 1. frame-en → azonnali arcon-robbanás,
            // és gurulás közben a mellette álló társakat is pofozta.
            let _ot=(S.units.find(t=>t.id===p.ownerId)||{}).teamId;
            if (_ot==null) _ot=p._ownerTeam;
            for (const t of S.units){
              if (!t.alive || (_ot!=null && t.teamId===_ot)) continue;
              if (U.dist(p.x,p.y,t.x,t.y) < p.r+C.UNIT_R){
                CA.explode(p.x, p.y, 26, 18, 1.0);
                p.data.hitCd=18;
                break;
              }
            }
          }
        }

        // trail
        if (p._kind==='meteor' || p._kind==='firemeteor'){
          if (CA.FX && CA.FX.meteorTrail) CA.FX.meteorTrail(p.x, p.y, p.vx, p.vy);
          else trail(p, '#f83');
        } else
        trail(p, p._kind==='capyslam' ? '#ffcf4a'
              : p._kind==='capybomb' ? '#fc6'
              : p._kind==='napalm' ? '#f72'
              : p._kind==='gas' ? '#9e6'
              : p._kind==='nuke' ? '#dd5'
              : (p._kind==='bomblet'||p._kind==='cluster'||p._kind==='yolk' ? '#fa0' : '#ccc'));

        // fuse
        if (p.fuse!=null){
          p.fuse -= (1/60)*k;
          if (p.fuse<=0){ detonate(p); continue; }
        }

        // off-world cleanup
        if (p.x<-40 || p.x>C.WORLD_W+40 || p.y>C.WORLD_H+40){ p.alive=false; continue; }

        // Magic and grand ultimates retain their explicit surface effects.
        // Physical ammunition has already entered its inert sinking state.
        if (p.y >= WL){
          puff(p.x, WL, '#7cf', 10);
          const bigUlt = (p._kind==='nuke' || p._kind==='meteor' || p._kind==='firemeteor' || p._kind==='blackhole');
          if (p.fuse!=null || bigUlt) detonate(p); else p.alive=false;
          continue;
        }

      }
      S.projectiles = S.projectiles.filter(p=>p.alive);

      // FIX 1 — advance floating reward texts: rise + fade, drop the dead ones.
      for (const f of FLOATERS){ f.life -= k; f.y -= 0.45*k; }
      for (let i=FLOATERS.length-1; i>=0; i--){ if (FLOATERS[i].life<=0) FLOATERS.splice(i,1); }

      // #5 advance obscuring smoke puffs: drift, swell, fade; drop the dead ones.
      for (const s of SMOKE){
        s.life -= k;
        s.sway += 0.03*k;
        s.x += (s.vx + Math.sin(s.sway)*0.12) * k;
        s.y += s.vy * k;
        s.r += s.grow * k;
      }
      for (let i=SMOKE.length-1; i>=0; i--){ if (SMOKE[i].life<=0) SMOKE.splice(i,1); }

      // v4 chain-lightning arcs fade fast
      for (const L of LIGHTNING){ L.life -= k; }
      for (let i=LIGHTNING.length-1; i>=0; i--){ if (LIGHTNING[i].life<=0) LIGHTNING.splice(i,1); }
    },

    render(ctx){
      // --- FIX 1: floating reward texts (world space, above the unit/crate) ---
      if (FLOATERS.length){
        ctx.save();
        ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.font='bold 14px sans-serif';
        for (const f of FLOATERS){
          const a = U.clamp(f.life / f.maxLife, 0, 1);
          ctx.globalAlpha = a;
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.strokeText(f.text, f.x, f.y);
          ctx.fillStyle = f.color || '#fff';
          ctx.fillText(f.text, f.x, f.y);
        }
        ctx.restore();
      }

      // --- projectiles + trails (world space; camera already applied) ---
      for (const p of S.projectiles){
        if (!p.alive) continue;
        ctx.save();
        if (p._submerged){
          const left=p.data.maxSubmergedLife-p.data.submergedLife;
          ctx.globalAlpha*=0.68*U.clamp(left/18,0,1);
        }
        ctx.translate(p.x, p.y);

        // Projectiles are drawn procedurally (hand-drawn canvas shapes) per kind.
        if (p._kind==='capybomb'){
          // chubby capy-bomb
          ctx.fillStyle='#caa45a';
          ctx.beginPath(); ctx.arc(0,0,10,0,7); ctx.fill();
          ctx.fillStyle='#3a2a14';
          ctx.beginPath(); ctx.arc(-3.5,-2,1.6,0,7); ctx.arc(3.5,-2,1.6,0,7); ctx.fill();
          // sparkly fuse
          if (!p._submerged){
            ctx.fillStyle = (S.frame&2)?'#ff5':'#fa0';
            ctx.beginPath(); ctx.arc(0,-12,2.4,0,7); ctx.fill();
          }
        } else if (p._kind==='dynamite'){
          ctx.rotate(p.spriteRot);
          ctx.fillStyle='#c33'; ctx.fillRect(-9,-4,18,8);
          ctx.fillStyle='#fff'; ctx.fillRect(-9,-1,18,2);
        } else if (p._kind==='bomblet'||p._kind==='cluster'){
          ctx.fillStyle='#444'; ctx.beginPath(); ctx.arc(0,0,p.r,0,7); ctx.fill();
          if (!p._submerged){ ctx.fillStyle='#fa0'; ctx.beginPath(); ctx.arc(0,-p.r,1.4,0,7); ctx.fill(); }
        } else if (p.weaponId==='grenade'){
          ctx.fillStyle='#2c5'; ctx.beginPath(); ctx.arc(0,0,6,0,7); ctx.fill();
          ctx.strokeStyle='#173'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(0,0,6,0,7); ctx.stroke();
          if (!p._submerged){ ctx.fillStyle='#fa0'; ctx.beginPath(); ctx.arc(0,-7,1.6,0,7); ctx.fill(); }
        } else if (p._kind==='timergrenade'){
          // grenade body + the remaining whole seconds printed on it (#1)
          ctx.fillStyle='#357'; ctx.beginPath(); ctx.arc(0,0,7,0,7); ctx.fill();
          ctx.strokeStyle='#9cf'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(0,0,7,0,7); ctx.stroke();
          if (!p._submerged){
            ctx.fillStyle = (S.frame&2)?'#ff5':'#fa0';
            ctx.beginPath(); ctx.arc(0,-8,1.8,0,7); ctx.fill();
            const secs = Math.max(0, Math.ceil(p.fuse||0));
            ctx.fillStyle='#fff'; ctx.font='bold 9px sans-serif';
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(String(secs), 0, 1);
          }
        } else if (p._kind==='laser'){
          // glowing bolt with a short reflective trail (#3)
          if (p.data && p.data.trail && p.data.trail.length>1){
            ctx.save();
            ctx.translate(-p.x,-p.y); // trail points are in world space
            ctx.strokeStyle='rgba(150,230,255,0.5)'; ctx.lineWidth=2;
            ctx.beginPath();
            const tr=p.data.trail;
            for (let i=0;i<tr.length;i++){ if(i===0) ctx.moveTo(tr[i].x,tr[i].y); else ctx.lineTo(tr[i].x,tr[i].y); }
            ctx.stroke();
            ctx.restore();
          }
          ctx.fillStyle='#cfffff';
          ctx.beginPath(); ctx.arc(0,0,3.2,0,7); ctx.fill();
          ctx.strokeStyle='rgba(120,220,255,0.9)'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(0,0,5.5,0,7); ctx.stroke();
        } else if (p._kind==='magnetmine'){
          // a horseshoe-ish magnet body; pulses when armed (#4)
          const armed = p.data && p.data.armed;
          ctx.fillStyle = armed ? ((S.frame&8)?'#f55':'#a33') : '#666';
          ctx.beginPath(); ctx.arc(0,0,p.r,0,7); ctx.fill();
          ctx.fillStyle='#c33'; ctx.fillRect(-p.r,-p.r*0.5,p.r*0.7,p.r*0.5);
          ctx.fillStyle='#37c'; ctx.fillRect(p.r*0.3,-p.r*0.5,p.r*0.7,p.r*0.5);
          ctx.fillStyle='#eee'; ctx.font='bold 8px sans-serif';
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText('🧲', 0, 1);
        } else if (p._kind==='smoke'){
          // the thrown canister before it pops
          ctx.fillStyle='#778'; ctx.beginPath(); ctx.arc(0,0,5,0,7); ctx.fill();
          ctx.fillStyle='#cdd'; ctx.fillRect(-1.4,-7,2.8,4);
        } else if (p._kind==='bomb' || p._kind==='napalmbomb' || p._kind==='minebomb'){ // airstrike bombs
          ctx.rotate(p.spriteRot);
          ctx.fillStyle = p._kind==='napalmbomb' ? '#a40' : p._kind==='minebomb' ? '#444' : '#555';
          ctx.beginPath(); ctx.ellipse(0,0,7,3.5,0,0,7); ctx.fill();
          ctx.fillStyle = p._kind==='napalmbomb' ? '#f72' : '#999'; ctx.fillRect(5,-3,3,6);
        } else if (p._kind==='homing'){
          ctx.rotate(p.spriteRot);
          ctx.fillStyle='#b55'; ctx.fillRect(-8,-3,14,6);
          if (!p._submerged){ ctx.fillStyle = (S.frame&2)?'#ff7':'#fa3'; ctx.fillRect(-10,-2,3,4); } // thruster flame
          ctx.fillStyle='#fff'; ctx.beginPath(); ctx.moveTo(6,-3); ctx.lineTo(11,0); ctx.lineTo(6,3); ctx.closePath(); ctx.fill();
        } else if (p._kind==='mirv'){
          ctx.rotate(p.spriteRot);
          ctx.fillStyle='#a86'; ctx.fillRect(-7,-3,14,6);
          ctx.fillStyle='#fc6'; ctx.beginPath(); ctx.arc(0,0,2.4,0,7); ctx.fill();
          ctx.fillStyle='#ccc'; ctx.fillRect(-9,-2,2,4);
        } else if (p._kind==='roller'){
          ctx.rotate(p.spriteRot);
          ctx.fillStyle='#777'; ctx.beginPath(); ctx.arc(0,0,p.r,0,7); ctx.fill();
          ctx.strokeStyle='#333'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,p.r,0,7); ctx.stroke();
          ctx.strokeStyle='#999'; ctx.lineWidth=1.5;
          ctx.beginPath(); ctx.moveTo(-p.r,0); ctx.lineTo(p.r,0); ctx.moveTo(0,-p.r); ctx.lineTo(0,p.r); ctx.stroke();
        } else if (p._kind==='drill'){
          ctx.rotate(p.spriteRot);
          ctx.fillStyle='#888'; ctx.fillRect(-8,-3,12,6);
          ctx.fillStyle='#bbb'; // drill bit
          ctx.beginPath(); ctx.moveTo(4,-4); ctx.lineTo(11,0); ctx.lineTo(4,4); ctx.closePath(); ctx.fill();
        } else if (p._kind==='spikeball'){
          ctx.fillStyle='#553'; ctx.beginPath(); ctx.arc(0,0,p.r,0,7); ctx.fill();
          ctx.strokeStyle='#332'; ctx.lineWidth=2;
          for(let s=0;s<8;s++){ const a=s/8*6.28; ctx.beginPath(); ctx.moveTo(Math.cos(a)*p.r,Math.sin(a)*p.r); ctx.lineTo(Math.cos(a)*(p.r+5),Math.sin(a)*(p.r+5)); ctx.stroke(); }
        } else if (p._kind==='log'){
          ctx.rotate(p.spriteRot);
          ctx.fillStyle='#8a5a2b'; ctx.fillRect(-13,-6,26,12);
          ctx.fillStyle='#c98'; ctx.beginPath(); ctx.arc(13,0,6,0,7); ctx.fill();
          ctx.fillStyle='#a76'; ctx.beginPath(); ctx.arc(13,0,3,0,7); ctx.fill();
        } else if (p._kind==='bellyflop'){
          ctx.fillStyle='#6c4'; ctx.beginPath(); ctx.arc(0,0,p.r,0,7); ctx.fill();
          ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-3,-3,2.2,0,7); ctx.arc(3,-3,2.2,0,7); ctx.fill();
          ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(-3,-3,1,0,7); ctx.arc(3,-3,1,0,7); ctx.fill();
        } else if (p._kind==='egg'||p._kind==='yolk'){
          ctx.fillStyle='#fff'; ctx.beginPath(); ctx.ellipse(0,0,p.r*0.85,p.r,0,0,7); ctx.fill();
          ctx.fillStyle='#fb3'; ctx.beginPath(); ctx.arc(0,1,p.r*0.4,0,7); ctx.fill();
        } else if (p._kind==='napalm'){
          ctx.rotate(p.spriteRot);
          ctx.fillStyle='#a40'; ctx.fillRect(-7,-3,14,6);
          ctx.fillStyle='#f72'; ctx.fillRect(7,-2,3,4);
        } else if (p._kind==='gas'){
          ctx.fillStyle='#5a3'; ctx.beginPath(); ctx.arc(0,0,6,0,7); ctx.fill();
          if (!p._submerged){ ctx.fillStyle='#9e6'; ctx.beginPath(); ctx.arc(0,-7,1.6,0,7); ctx.fill(); }
        } else if (p._kind==='guided'){
          ctx.rotate(p.spriteRot);
          ctx.fillStyle='#357'; ctx.fillRect(-8,-3,14,6);
          ctx.fillStyle='#9cf'; ctx.fillRect(6,-2,4,4);
          ctx.fillStyle='#fff'; ctx.beginPath(); ctx.moveTo(-8,-3); ctx.lineTo(-12,-5); ctx.lineTo(-8,0); ctx.closePath(); ctx.fill();
        } else if (p._kind==='bonespear'){
          ctx.rotate(p.spriteRot);
          ctx.fillStyle='#eae6d8'; ctx.fillRect(-9,-2,14,4);            // bone shaft
          ctx.fillStyle='#fff'; ctx.beginPath();                        // tip
          ctx.moveTo(5,-4); ctx.lineTo(12,0); ctx.lineTo(5,4); ctx.closePath(); ctx.fill();
          ctx.fillStyle='#cbb'; ctx.fillRect(-9,-3,3,6);                // knob
        } else if (p._kind==='fireball'){
          const fl = 5 + (S.frame&3);
          ctx.fillStyle='rgba(255,140,30,0.55)'; ctx.beginPath(); ctx.arc(0,0,fl+3,0,7); ctx.fill();
          ctx.fillStyle='#ffb030'; ctx.beginPath(); ctx.arc(0,0,5,0,7); ctx.fill();
          ctx.fillStyle='#ffe79a'; ctx.beginPath(); ctx.arc(0,0,2.4,0,7); ctx.fill();
        } else if (p._kind==='frost'){
          ctx.fillStyle='#bdeeff'; ctx.beginPath(); ctx.arc(0,0,5,0,7); ctx.fill();
          ctx.strokeStyle='#eaffff'; ctx.lineWidth=1.5;
          for (let s=0;s<6;s++){ const a=s/6*6.28; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*7,Math.sin(a)*7); ctx.stroke(); }
        } else if (p._kind==='chainlight'){
          ctx.fillStyle='#dff'; ctx.beginPath(); ctx.arc(0,0,3,0,7); ctx.fill();
          ctx.strokeStyle='rgba(150,200,255,0.9)'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(0,0,5,0,7); ctx.stroke();
        } else if (p._kind==='chargedshot'){
          ctx.rotate(p.spriteRot);
          ctx.fillStyle = (p.data&&p.data.crit)?'#f55':'#cc4';
          ctx.fillRect(-9,-1.6,15,3.2);                                 // dart body
          ctx.fillStyle='#fff'; ctx.beginPath();
          ctx.moveTo(6,-3); ctx.lineTo(12,0); ctx.lineTo(6,3); ctx.closePath(); ctx.fill();
        } else if (p._kind==='arrow'){
          ctx.rotate(p.spriteRot);
          ctx.strokeStyle='#964'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(7,0); ctx.stroke();
          ctx.fillStyle='#ccc'; ctx.beginPath(); ctx.moveTo(7,-3); ctx.lineTo(12,0); ctx.lineTo(7,3); ctx.closePath(); ctx.fill();
        } else { // bazooka / generic shell
          ctx.rotate(p.spriteRot);
          ctx.fillStyle='#333'; ctx.fillRect(-7,-3,14,6);
          ctx.fillStyle='#f80'; ctx.fillRect(7,-2,3,4);
          ctx.fillStyle='#ccc'; ctx.fillRect(-9,-2,2,4);
        }
        ctx.restore();
      }

      // --- #5 obscuring smoke clouds (drawn OVER projectiles to hide them) ---
      if (SMOKE.length){
        ctx.save();
        for (const s of SMOKE){
          const a = U.clamp(s.life/s.maxLife, 0, 1);
          // soft grey blobs, denser in the centre
          const g = ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,s.r);
          g.addColorStop(0, 'rgba(140,140,148,'+(0.7*a).toFixed(3)+')');
          g.addColorStop(1, 'rgba(140,140,148,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
        }
        ctx.restore();
      }

      // --- v4 chain-lightning arcs (jagged bolts between hit points) ---
      if (LIGHTNING.length){
        ctx.save();
        ctx.lineCap='round';
        for (const L of LIGHTNING){
          const a = U.clamp(L.life/L.maxLife, 0, 1);
          ctx.globalAlpha = a;
          ctx.strokeStyle = '#dff'; ctx.lineWidth = 3;
          // a few jagged segments for a lightning feel
          const segs=5, dx=(L.x2-L.x1)/segs, dy=(L.y2-L.y1)/segs;
          ctx.beginPath(); ctx.moveTo(L.x1, L.y1);
          for (let i=1;i<segs;i++){
            ctx.lineTo(L.x1+dx*i + U.rand(-6,6), L.y1+dy*i + U.rand(-6,6));
          }
          ctx.lineTo(L.x2, L.y2); ctx.stroke();
          ctx.strokeStyle='rgba(150,200,255,0.6)'; ctx.lineWidth=6; ctx.stroke();
        }
        ctx.globalAlpha=1;
        ctx.restore();
      }

      // --- PORTAL mouths (swirling rings; A = violet, B = cyan) ---
      if (PORTALS.a || PORTALS.b){
        const drawPortal = (pt, col)=>{
          if (!pt) return;
          const f = (S.frame||0);
          ctx.save();
          ctx.translate(pt.x, pt.y);
          // glow
          const g = ctx.createRadialGradient(0,0,2, 0,0,PORTAL_R+6);
          g.addColorStop(0, col);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.55; ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0,0,PORTAL_R+6,0,7); ctx.fill();
          ctx.globalAlpha = 1;
          // spinning ring
          ctx.rotate((f*0.06));
          ctx.strokeStyle = col; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(0,0,PORTAL_R,PORTAL_R*0.78,0,0,7); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(0,0,PORTAL_R*0.6,PORTAL_R*0.46,0,0,7); ctx.stroke();
          ctx.restore();
          // little exit-direction arrow so the redirect is readable
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.ang);
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(PORTAL_R, 0); ctx.lineTo(PORTAL_R+10, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(PORTAL_R+10,0); ctx.lineTo(PORTAL_R+5,-4); ctx.lineTo(PORTAL_R+5,4); ctx.closePath(); ctx.fillStyle=col; ctx.fill();
          ctx.restore();
        };
        drawPortal(PORTALS.a, '#b07bff');
        drawPortal(PORTALS.b, '#5bd6ff');
      }

      // --- #11 rope line + parachute canopy on the active unit ---
      const au = CA.activeUnit();
      if (au && au.alive){
        if (au._rope && au._rope.t>0){
          ctx.save();
          ctx.strokeStyle='rgba(180,140,90,0.9)'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.moveTo(au.x, au.y-6); ctx.lineTo(au._rope.x, au._rope.y); ctx.stroke();
          ctx.fillStyle='#fe9'; ctx.beginPath(); ctx.arc(au._rope.x, au._rope.y, 3, 0, 7); ctx.fill();
          ctx.restore();
        }
        if (au.parachute>0 && !au.grounded){
          ctx.save();
          ctx.translate(au.x, au.y);
          ctx.fillStyle='#e44';
          ctx.beginPath(); ctx.moveTo(-20,-26); ctx.quadraticCurveTo(0,-44,20,-26); ctx.closePath(); ctx.fill();
          ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(-20,-26); ctx.lineTo(-5,-12); ctx.moveTo(20,-26); ctx.lineTo(5,-12); ctx.moveTo(0,-44); ctx.lineTo(0,-12); ctx.stroke();
          ctx.restore();
        }
      }

      // --- aim reticle + predicted arc + power bar ---
      const u = CA.activeUnit();
      if (!u || !u.alive || !CA.canControl()) return;
      const w = this.currentWeapon();
      const a = -u.aimAngle, dir = u.facing;
      const m = muzzle(u);

      const showArc = !CA.settings || CA.settings.showTrajectory !== false; // #31 toggle
      // SNIPER is hitscan (a straight long shot) — the ballistic ARC is misleading
      // and too long (Jani: "szaggatott vonal ott nem kell csak a kicsi"). Skip the
      // dashed arc for it; it still gets the short muzzle aim line below.
      if (w.power && showArc && w.id !== 'sniper'){
        // dotted predicted trajectory arc (uses live power if charging, else preview)
        const previewPow = S.charging ? S.power : 0.65;
        const pts = simulate(u, w, previewPow, 120);
        ctx.save();
        ctx.setLineDash([4,6]);
        ctx.strokeStyle='rgba(255,255,255,0.55)';
        ctx.lineWidth=2;
        ctx.beginPath();
        for (let i=0;i<pts.length;i++){ const pt=pts[i]; if(i===0)ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y); }
        ctx.stroke();
        ctx.setLineDash([]);
        // landing marker
        if (pts.length){ const e=pts[pts.length-1];
          ctx.strokeStyle='rgba(255,80,80,0.8)';
          ctx.beginPath(); ctx.arc(e.x,e.y,6,0,7); ctx.stroke(); }
        ctx.restore();
      } else if (w.id==='teleport' || w.id==='airstrike' || w.id==='rope' || w.id==='girder' || w.id==='portal' || w.id==='nuke' || w.id==='quake'){
        // target marker at mouse — airstrike-style aiming (nuke/quake drop on the targeted spot)
        const tx=S.input.mouseWorldX, ty=S.input.mouseWorldY;
        if (tx>0 && tx<C.WORLD_W){
          ctx.save();
          ctx.strokeStyle = (w.id==='portal') ? (PORTALS.a && !PORTALS.b ? 'rgba(91,214,255,0.9)' : 'rgba(176,123,255,0.9)')
                          : (w.id==='teleport'||w.id==='rope') ? 'rgba(150,200,255,0.9)' : (w.id==='girder' ? 'rgba(210,180,140,0.9)'
                          : (w.id==='nuke') ? 'rgba(255,214,70,0.95)' : (w.id==='quake') ? 'rgba(255,140,60,0.95)' : 'rgba(255,120,120,0.9)');
          ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(tx,ty,10,0,7); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(tx-14,ty); ctx.lineTo(tx+14,ty);
          ctx.moveTo(tx,ty-14); ctx.lineTo(tx,ty+14); ctx.stroke();
          ctx.restore();
        }
      }

      // short aim line from the muzzle (always shown for orientation)
      ctx.save();
      ctx.strokeStyle='rgba(255,255,255,0.6)';
      ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + Math.cos(a)*dir*46, m.y + Math.sin(a)*46);
      ctx.stroke();
      // reticle dot at line end
      ctx.fillStyle='rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(m.x+Math.cos(a)*dir*46, m.y+Math.sin(a)*46, 2.5, 0, 7); ctx.fill();
      ctx.restore();

      // power bar while charging
      if (S.charging){
        const bw=44, bh=5, bx=u.x-bw/2, by=u.y-C.UNIT_R-22;
        ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(bx-1,by-1,bw+2,bh+2);
        // green->yellow->red gradient feel by lerping
        const p=S.power;
        ctx.fillStyle = p<0.5 ? '#5d5' : p<0.8 ? '#ed3' : '#f44';
        ctx.fillRect(bx, by, bw*p, bh);
      }
    },

    // light trajectory simulation for the AI — returns estimated landing point
    predict(u, weaponId, power){
      const w = byId(weaponId);
      if (!u) return { x:0, y:0 };
      // non-ballistic weapons resolve at a sensible fixed point
      if (w.id==='teleport' || w.id==='airstrike'){
        let tx=S.input.mouseWorldX;
        if (!(tx>0 && tx<C.WORLD_W)){ const a=-u.aimAngle; tx=u.x+Math.cos(a)*u.facing*220; }
        return { x:tx, y: CA.Terrain&&CA.Terrain.heightAt?CA.Terrain.heightAt(tx):C.WATER_LEVEL };
      }
      if (w.id==='shotgun' || w.id==='melee' || w.id==='laser' || w.id==='sniper' || w.id==='bat'){
        const a=-u.aimAngle, dx=Math.cos(a)*u.facing, dy=Math.sin(a);
        const reach = (w.id==='melee'||w.id==='bat')?34:(w.id==='sniper'?600:300);
        return { x:u.x+dx*reach, y:u.y-6+dy*reach };
      }
      if (w.id==='napalmstrike' || w.id==='minestrike'){
        let tx=S.input.mouseWorldX;
        if (!(tx>0 && tx<C.WORLD_W)){ const a=-u.aimAngle; tx=u.x+Math.cos(a)*u.facing*220; }
        return { x:tx, y: CA.Terrain&&CA.Terrain.heightAt?CA.Terrain.heightAt(tx):C.WATER_LEVEL };
      }
      // utility / placed / self-target abilities: resolve at the unit
      if (w.id==='jetpack' || w.id==='blowtorch' || w.id==='lowgrav' || w.id==='freeze' ||
          w.id==='chargehog' ||
          w.id==='rope' || w.id==='parachute' || w.id==='girder' || w.id==='mine' ||
          w.id==='summon_skeleton' || w.id==='summon_zombie' || w.id==='shield_wall' ||
          w.id==='ground_slam' || w.id==='taunt' || w.id==='mark_target' ||
          w.id==='build_wall' || w.id==='deploy_turret' || w.id==='place_trap' ||
          w.id==='heal_beam' || w.id==='buff_aura' || w.id==='revive'){
        return { x:u.x, y:u.y };
      }
      const pts = simulate(u, w, power, 240);
      const last = pts.length ? pts[pts.length-1] : { x:u.x, y:u.y };
      return { x:last.x, y:last.y };
    },

    /* ---- #15 crate rendering (core calls this in world space) ---------- */
    renderCrates(ctx){
      const crates = S.crates;
      if (!crates || !crates.length) return;
      for (const c of crates){
        ctx.save();
        ctx.translate(c.x, c.y);
        // parachute while falling (swayed with the box)
        if (!c.grounded){
          const tilt = Math.sin(c.sway||0)*0.12;
          ctx.save(); ctx.rotate(tilt);
          ctx.fillStyle = c.mystery ? '#ffe39a' : '#fff';
          ctx.beginPath(); ctx.moveTo(-16,-22); ctx.quadraticCurveTo(0,-38,16,-22); ctx.closePath(); ctx.fill();
          ctx.strokeStyle='rgba(120,120,120,0.7)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(-16,-22); ctx.lineTo(-6,-9); ctx.moveTo(16,-22); ctx.lineTo(6,-9); ctx.stroke();
          ctx.restore();
        }

        // TASK 2 — use one of the 3 box artworks when decoded; else fall back
        // to the colored drawn crate.
        const boxImg = (c.box && CA.img) ? CA.img('assets/boxes/'+c.box+'.png') : null;
        if (boxImg){
          const s = c.mystery ? 16 : 13;        // mystery boxes a touch bigger
          // gentle bob/glow for mystery boxes once grounded
          if (c.mystery && c.grounded){
            const pulse = 0.4 + Math.sin((S.frame||0)*0.12)*0.25;
            ctx.save();
            ctx.globalAlpha = pulse; ctx.fillStyle = '#ffd54a';
            ctx.beginPath(); ctx.arc(0,0,s+6,0,7); ctx.fill();
            ctx.restore();
          }
          try { ctx.drawImage(boxImg, -s, -s, s*2, s*2); }
          catch(e){ drawFallbackCrate(ctx, c); }
        } else {
          drawFallbackCrate(ctx, c);
        }
        ctx.restore();
      }
    },
  };

  /* ---- shared trajectory simulator (used by render arc + predict) -------- */
  // Returns an array of points until first solid/water/off-world hit.
  function simulate(u, w, power, maxSteps){
    const m = muzzle(u);
    const v = (w.id==='capybomb') ? launchVel(u, power, 0.92)
            : (w.id==='magnetmine') ? launchVel(u, power, 0.85)
            : launchVel(u, power);
    let x=m.x, y=m.y, vx=v.vx, vy=v.vy;
    const pts=[{x,y}];
    const steps = maxSteps||180;
    // match the live integrator (~2793): honour the low-gravity utility so the AI
    // doesn't mis-predict the landing during a floaty turn.
    const gm = (CA.gravityMult ? CA.gravityMult() : 1);
    for (let i=0;i<steps;i++){
      vy += C.GRAVITY * gm;
      if (w.affectedByWind) vx += C.MAX_WIND*S.wind;
      x += vx; y += vy;
      pts.push({x,y});
      if (x<0 || x>C.WORLD_W || y>=(S.waterLevel != null ? S.waterLevel : C.WATER_LEVEL)) break;
      if (CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(x,y)){
        // bouncy weapons would bounce, but for an aim hint we stop at first contact
        break;
      }
    }
    return pts;
  }
})();
