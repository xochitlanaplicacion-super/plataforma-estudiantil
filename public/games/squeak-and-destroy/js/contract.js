/* ============================================================================
 * CUTE ANIMALS — contract.js
 * THE SINGLE SOURCE OF TRUTH. All modules read from here. DO NOT redefine
 * these shapes elsewhere. Owned by the integrator (Claude). Agents may READ
 * everything here but should only ADD small helpers if truly needed.
 * ==========================================================================*/
window.CA = window.CA || {};

/* ---- Backend base URL ----
 * On the live web the PHP backend is same-origin, so relative paths work.
 * In a packaged native build (Capacitor/Electron) the app runs from file://
 * (or capacitor://) where relative *.php 404s — so point every backend fetch at
 * the live origin. Helper: CA.api('account.php') → correct URL in all builds.
 *
 * SELF-HOSTING: set CA.BACKEND_ORIGIN to your own deployment (trailing slash) if
 * you package a native build that needs the optional PHP backend. Leave it empty
 * to run fully offline — every online feature degrades to a no-op.             */
CA.BACKEND_ORIGIN = '';   // e.g. 'https://example.com/squeak/'
CA.API_BASE = (function(){
  try {
    var p = location.protocol;
    if (p === 'file:' || p === 'capacitor:' || p === 'ionic:' || window.Capacitor)
      return CA.BACKEND_ORIGIN;
  } catch(e){}
  return '';   // same-origin (web): relative paths
})();
CA.api = function(path){ return (CA.API_BASE || '') + path; };

/* ---- DEMO MODE (App Store / Steam free demo) ----
 * True when launched with ?demo (or &demo) in the query string, or when served
 * from a /demo/ path. The menu uses this to restrict the home + New Game screens
 * to a small free-demo allowlist. Non-demo behavior is unchanged when false. */
CA.DEMO = false;
try {
  CA.DEMO = (/[?&]demo\b/.test(location.search) || /\/demo\//.test(location.pathname));
} catch(e){ CA.DEMO = false; }

/* ---- DEMO content gate ----
 * True ONLY when running the demo build AND the player has NOT unlocked the full
 * version (supporter key, or ?full=1). The full web build (CA.DEMO=false)
 * NEVER locks. Use this — not CA.DEMO directly — anywhere we restrict content. */
CA.demoLocked = function(){
  return !!CA.DEMO && !(CA.Entitlement && CA.Entitlement.isFull && CA.Entitlement.isFull());
};

/* Universal/utility weapon ids offered in the demo (class-abilities are limited
 * separately via DEMO_CLASSES). All ids verified against CA.Weapons.LIST. */
CA.DEMO_WEAPONS = ['bazooka','grenade','dynamite','shotgun','cluster','mine','teleport','parachute','drill','airstrike'];

/* Class ids selectable in the demo (2). The full build offers all of CA.Classes.list(). */
CA.DEMO_CLASSES = ['necro','guardian'];

/* ---- Tunable config ---- */
CA.config = {
  WORLD_W: 2400,        // world pixel width
  WORLD_H: 1000,        // world pixel height
  VIEW_W: 1280,         // canvas backing width
  VIEW_H: 720,          // canvas backing height
  GRAVITY: 0.32,        // px / frame^2  (loop is normalized to 60fps via dt)
  MAX_WIND: 0.16,       // px / frame^2 horizontal at |wind|=1
  TURN_TIME: 45,        // seconds per turn
  RETREAT_TIME: 4,      // seconds of movement allowed after firing
  WATER_LEVEL: 940,     // world y; a unit whose feet sink below this drowns
  TEAM_SIZE: 5,
  UNIT_R: 16,           // collision radius of a unit (px)
  UNIT_MAX_HP: 100,
  FALL_DMG_MIN_V: 9,    // vertical speed above which landing hurts
  FALL_DMG_SCALE: 3,    // hp per (v - min) unit
};

/* ---- Team rosters (legacy fallback) ----
 * `team` is the default team name (overridable on the New Game screen), `names`
 * are the unit names. This is only a last-resort fallback: the live rosters are
 * the per-language ones in i18n.js (CA.ROSTER_HU / CA.ROSTER_EN), picked by
 * CA.rosterOf(kind). Edit those to rename teams/units.                        */
CA.ROSTER = {
  capybara: { team: 'Capybaras', names: ['Biscuit','Waffles','Nugget','Pumpkin','Marsh'] },
  worm:     { team: 'Wrigglers', names: ['Squiggles','Noodle','Wiggly','Slinky','Twist'] },
};

/* ---- Enums ---- */
CA.GameState = { MENU: 'menu', PLAYING: 'playing', TURN_END: 'turnEnd', GAME_OVER: 'gameOver' };
CA.TurnPhase = { AIM: 'aim', FIRING: 'firing', SETTLE: 'settle', RETREAT: 'retreat' };

/* ----------------------------------------------------------------------------
 * SHAPES (documentation — these are the objects passed around)
 *
 * Team   = { id:int, name:str, kind:'capybara'|'worm', color:'#hex',
 *            isAI:bool, aiLevel:0|1|2, unitIds:[int] }
 *
 * Unit   = { id:int, teamId:int, kind:'capybara'|'worm', name:str,
 *            x:float, y:float,         // world position of CENTER
 *            vx:float, vy:float,       // velocity (px/frame @60)
 *            hp:int, maxHp:int, alive:bool,
 *            facing:1|-1,              // 1 = right
 *            aimAngle:float,           // radians, 0 = facing-forward & level, +up
 *            grounded:bool,
 *            anim:{state:str, t:float}, // 'idle'|'walk'|'aim'|'hit'|'dead'
 *            cosmetic:{ id:str, ... }   // per-unit appearance trait (owner: entities.js):
 *                                       // grumpy/pirate/helmet/silly/glasses/mohawk/...
 *                                       // assigned deterministically at spawn so it
 *                                       // survives save/load; future "Team editor" sets it.
 *          }
 *
 * Projectile = { id:int, weaponId:str, ownerId:int,
 *            x,y,vx,vy:float, r:float,
 *            affectedByWind:bool, fuse:float|null,  // seconds until detonate, null=on-impact
 *            bounce:float,           // 0..1 restitution, 0 = explode on hit
 *            spriteRot:float, alive:bool, data:{} }
 *
 * Particle = { x,y,vx,vy, life, maxLife, size, color, kind } // owned by FX
 *
 * Weapon = { id:str, name:str, emoji:str, category:'projectile'|'throwable'|
 *            'gun'|'special'|'utility',
 *            ammo:int,              // -1 = infinite
 *            power:bool,            // true = uses charged power (space hold)
 *            radius:float,          // explosion radius
 *            damage:float,          // max damage at epicenter
 *            knockback:float,       // impulse scale
 *            fuse:float|null, bounce:float, affectedByWind:bool,
 *            endsTurn:bool }        // does using it end the turn
 * ------------------------------------------------------------------------- */

/* ---- Live game state (mutated by modules, read by all) ---- */
CA.state = {
  mode: CA.GameState.MENU,
  phase: CA.TurnPhase.AIM,
  timeScale: 1,            // 1=normal; <1 = slow-motion (camera juice / win-cam). core multiplies dt.
  teams: [],
  units: [],
  projectiles: [],
  particles: [],
  currentTeamIdx: 0,
  activeUnitId: null,
  wind: 0,                 // -1..1
  turnTimer: CA.config.TURN_TIME,
  firedThisTurn: false,
  camera: { x: 0, y: 0, zoom: 1, baseZoom: 1, userZoom: 1, targetX: 0, targetY: 0, shake: 0 },
  selectedWeapon: 'bazooka',
  power: 0,                // 0..1 charge while space held
  charging: false,
  input: { left:false, right:false, up:false, down:false, mouseX:0, mouseY:0, mouseWorldX:0, mouseWorldY:0 },
  frame: 0,
  winnerTeamId: null,
  paused: false,

  /* ---- v2 fields ---- */
  gameMode: 'classic',     // 'classic'|'campaign'|'survival'|'arcade'|'forts'|'ffa'  (see CA.Modes)
  modeData: {},            // free scratch space for the active mode
  theme: 'jungle',         // active map theme id — Jani: dzsungel az első/alap pálya (see CA.Maps)
  numTeams: 2,
  round: 1,                // full rounds elapsed (all teams played once = +1)
  weather: { type:'clear', gust:0, fog:0, slip:0, t:0 },  // owned by CA.Weather
  waterLevel: 940,         // LIVE water surface (starts at config.WATER_LEVEL; rises in sudden-death)
  risingWater: false,
  crates: [],              // weapon/health/utility crates on the field (owned by CA.Weapons)
  hazards: [],             // fire/poison/mine zones (owned by CA.Hazards)
  killcam: null,           // {x,y,t} transient camera focus on a death
  stats: {},               // per-match stats (kills per team, shots, etc.) — owned by meta
  teamAmmo: {},            // PER-TEAM finite-ammo counters: teamAmmo[teamId][weaponId]=int.
                           //   Lazy-filled from each weapon's base ammo (w._ammo0 ?? w.ammo)
                           //   on first access. Owned by CA.ammoOf/spendAmmo/addAmmo/resetAmmo.
};

/* ---- Tiny synchronous event bus ---- */
CA.events = {
  _h: {},
  on(ev, fn){ (this._h[ev] = this._h[ev] || []).push(fn); return fn; },
  off(ev, fn){ const a=this._h[ev]; if(a){ const i=a.indexOf(fn); if(i>=0)a.splice(i,1);} },
  emit(ev, ...args){ const a=this._h[ev]; if(a) for(const fn of a.slice()) fn(...args); },
};
/* Known events (emit/listen freely):
 *   'explosion'   (x,y,radius,damage)
 *   'unitDamaged' (unit, amount)
 *   'unitDied'    (unit)
 *   'turnStart'   (teamIdx, unit)
 *   'turnEnd'     (teamIdx)
 *   'fired'       (unit, weapon)
 *   'gameOver'    (winnerTeamId)
 *   'sfx'         (name)  -> FX/Audio listens
 */

/* ---- Utility helpers (safe to use everywhere) ---- */
CA.util = {
  clamp:(v,a,b)=>v<a?a:v>b?b:v,
  lerp:(a,b,t)=>a+(b-a)*t,
  dist:(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by),
  rand:(a,b)=>a+Math.random()*(b-a),
  randInt:(a,b)=>Math.floor(a+Math.random()*(b-a+1)),
  pick:(arr)=>arr[Math.floor(Math.random()*arr.length)],
  // deterministic-ish id
  _id:0, nextId(){ return ++this._id; },
};

/* ----------------------------------------------------------------------------
 * GLOBAL EXPLOSION PIPELINE — the ONE way damage happens.
 * Weapons/AI call CA.explode(...). It carves terrain, damages units with
 * falloff + knockback, and triggers FX + screen shake. This keeps modules
 * decoupled: weapons.js never calls entities.js or terrain.js directly.
 * ------------------------------------------------------------------------- */
CA.explode = function(x, y, radius, maxDamage, knockback){
  if (CA.Terrain && CA.Terrain.destroy) CA.Terrain.destroy(x, y, radius);
  if (CA.Entities && CA.Entities.damageInRadius) CA.Entities.damageInRadius(x, y, radius, maxDamage, knockback || 1);
  CA.state.camera.shake = Math.min(28, (CA.state.camera.shake||0) + radius * 0.25);
  CA.events.emit('explosion', x, y, radius, maxDamage);
  CA.events.emit('sfx', radius > 55 ? 'boom_big' : 'boom');
};

/* Convenience accessors used across modules */
CA.getUnit   = (id)=> CA.state.units.find(u=>u.id===id) || null;
CA.getTeam   = (id)=> CA.state.teams.find(t=>t.id===id) || null;
CA.activeUnit= ()=> CA.getUnit(CA.state.activeUnitId);
CA.aliveUnitsOfTeam = (teamId)=> CA.state.units.filter(u=>u.teamId===teamId && u.alive);

/* ============================================================================
 * PER-TEAM AMMO — finite-ammo weapons are tracked PER TEAM (fairness fix).
 * The weapon LIST singletons keep their BASE ammo in `_ammo0` (snapshot) / `ammo`
 * (legacy default); the live per-team counters live in CA.state.teamAmmo.
 *
 * DEFENSIVE: if Weapons isn't loaded yet, or a weapon id is unknown, or the
 * base ammo is infinite (<0), these fall back to the OLD shared behaviour so a
 * missing accessor never breaks gameplay. Infinite (base<0) is ALWAYS infinite
 * for every team (dev/∞), and never consumed.
 * ------------------------------------------------------------------------- */
CA._weaponById = function(wid){
  try{ var L=(CA.Weapons&&CA.Weapons.LIST)||null; return L?L.find(function(w){return w.id===wid;}):null; }
  catch(e){ return null; }
};
// base ammo of a weapon: the per-match snapshot _ammo0, else legacy ammo field.
CA._baseAmmo = function(w){
  if(!w) return -1;                                   // unknown → treat as infinite (old: no guard)
  var b = (w._ammo0!=null) ? w._ammo0 : w.ammo;
  return (b==null) ? -1 : b;
};
// resolve a team id: explicit arg → active unit's team → 0.
CA._resolveTeamId = function(teamId){
  if(teamId!=null) return teamId;
  try{ var u=CA.activeUnit(); if(u && u.teamId!=null) return u.teamId; }catch(e){}
  return 0;
};
/* Current finite ammo of weapon `wid` for `teamId` (default = active unit's team).
 * Returns -1 for infinite/dev/∞ or when the weapon can't be resolved. Lazy-inits
 * the per-team counter from the weapon's base ammo on first access.            */
CA.ammoOf = function(wid, teamId){
  // DEV sandbox: EVERY weapon is infinite/fireable so all of them (incl. the
  // crate-only ammo:0 ultimates — nuke / meteors / quake / magic orb / fire rain /
  // black hole) can be spam-tested. Without this they showed but did nothing
  // (ammo 0 → fire refused). (Jani: "a mágikus gömb / meteorzápor… nem csinál semmit")
  try{ if(CA.state && CA.state.dev) return -1; }catch(e){}
  var w = CA._weaponById(wid);
  var base = CA._baseAmmo(w);
  if(base < 0) return -1;                             // infinite → always infinite
  var tid = CA._resolveTeamId(teamId);
  var S = CA.state; if(!S) return base;              // no state → old default
  var bag = S.teamAmmo || (S.teamAmmo = {});
  var t = bag[tid] || (bag[tid] = {});
  if(t[wid]==null) t[wid] = base;                    // lazy-init from base
  return t[wid];
};
/* Consume one round of `wid` for `teamId`. No-op for infinite weapons; never
 * drops below 0. */
CA.spendAmmo = function(wid, teamId){
  var w = CA._weaponById(wid);
  var base = CA._baseAmmo(w);
  if(base < 0) return;                                // infinite → no consume
  var cur = CA.ammoOf(wid, teamId);                   // ensures lazy-init
  if(cur > 0){
    var tid = CA._resolveTeamId(teamId);
    CA.state.teamAmmo[tid][wid] = cur - 1;
  }
};
/* Pickup: add `n` rounds of `wid` to `teamId` (finite weapons only). */
CA.addAmmo = function(wid, n, teamId){
  var w = CA._weaponById(wid);
  var base = CA._baseAmmo(w);
  if(base < 0) return;                                // infinite → nothing to add
  var cur = CA.ammoOf(wid, teamId);                   // ensures lazy-init
  var tid = CA._resolveTeamId(teamId);
  CA.state.teamAmmo[tid][wid] = cur + (n||0);
};
/* New match: clear all per-team counters (they re-lazy-init from base on use). */
CA.resetAmmo = function(){ if(CA.state) CA.state.teamAmmo = {}; };

/* ============================================================================
 * v2 SHARED REGISTRIES — modules fill these in their own files. Declared here
 * so every module can read them. Each is a plain object/namespace; the owning
 * module (named) populates it in its init/IIFE.
 * ==========================================================================*/

/* CA.Species — animal definitions (owner: species.js / Agent Critters).
 * Shape per id: { id, name, emoji, colors:{body,accent}, passive:'swim'|'dig'|
 *   'roll'|'glide'|'build'|null, passiveDesc, ultimate:'<weaponId>', draw(ctx,u,anim) }
 * Classic teams use 'capybara' and 'worm'. */
CA.Species = CA.Species || {};
CA.speciesOf = (u)=> (u && CA.Species[u.species||u.kind]) || CA.Species[u && u.kind] || null;

/* ============================================================================
 * v4 CLASS-HERO SYSTEM (owner: classes.js). Each unit is a hero of a CLASS with
 * a passive + 3 abilities + an upgradeable skill tree. Cute-spooky theme.
 * CA.Classes[id] = {
 *   id, name, animal, verb, color, baseHp,
 *   passive:'tanky'|'summon'|'mage'|'sniper'|'build'|'support', passiveDesc,
 *   abilities:[ '<weaponId>', ... ],   // ability weapon-ids (in CA.Weapons.LIST,
 *                                      //   tagged ability:true, cls:id, cooldown:N)
 *   tree:[ { id, name, desc, max, apply(unit,rank) } ],  // skill-tree nodes
 *   draw(ctx,u,anim)                   // optional class-specific drawing
 * }
 * UNIT (extended): cls:'<classId>', cooldowns:{abilityId:turnsLeft}, shield:0,
 *   taunt:0(turns), buffs:[{type,amt,turns}].  MINION unit: minion:true,
 *   ownerTeamId:int, minionKind:'skeleton'|'zombie'|'turret'|..., life:int(turns).
 * ABILITIES are fired like weapons (ui ability-bar selects them); firing sets the
 * unit's cooldown; core decrements cooldowns at the hero's turn start.
 * ========================================================================== */
CA.Classes = CA.Classes || {};
CA.classOf = (u)=> (u && u.cls && CA.Classes[u.cls]) || null;
CA.Classes.list = function(){ return Object.keys(CA.Classes).filter(function(k){ var v=CA.Classes[k]; return v && typeof v==='object' && v.abilities; }); };

/* turn rotation + win-check use HEROES only (minions never take turns and don't
 * keep a team "alive" on their own). */
CA.aliveHeroesOfTeam = (teamId)=> CA.state.units.filter(u=>u.teamId===teamId && u.alive && !u.minion);
CA.minionsOfTeam = (teamId)=> CA.state.units.filter(u=>u.alive && u.minion && (u.ownerTeamId===teamId || u.teamId===teamId));

/* Species artwork loader — lazily loads assets/species/<id>.png (e.g. the
 * Freepik flat icons), caches the Image, and returns it once decoded (else null
 * so callers fall back to the canvas-drawn animal). Never throws / blocks. */
CA._iconCache = {};
CA.speciesIcon = function(id){
  if (!id) return null;
  // this build ships no species PNGs (see CA.MISSING_ART) — go straight to the
  // code-drawn animal instead of firing a 404 per species.
  if (CA._isMissingArt && CA._isMissingArt('assets/species/' + id + '.png')) return null;
  const c = CA._iconCache;
  if (id in c){ const im=c[id]; return (im && im.complete && im.naturalWidth>0) ? im : null; }
  try {
    const img = new Image();
    img.onerror = ()=>{ c[id] = null; };
    img.src = 'assets/species/' + id + '.png';
    c[id] = img;
  } catch(e){ c[id] = null; }
  return null;
};

/* Generic image loader (logo, HUD icons, …). Lazy-loads any path under the
 * project, caches by path, returns the decoded Image or null (fallback). */
CA._imgCache = {};
/* single source of truth for image cache-busters (?v=) — bump when re-exporting
 * any art so all consumers (fx/hazards/menus) bust in lockstep. */
CA.ASSET_V = '43905';
/* Art that this build deliberately does not ship (restricted licences — see
 * docs/ASSET_LICENSING.md) plus weapons that never had an icon. Every one of
 * these has a code-drawn or emoji fallback, so requesting them would only cost a
 * guaranteed 404 per entry. Matched as a path PREFIX (before the ?v= buster).
 * Restore a file locally and delete its line here to get the image back. */
CA.MISSING_ART = [
  'assets/species/', 'assets/bg/', 'assets/boxes/', 'assets/fx/', 'assets/maps/',
  'assets/john.jpg',
  'assets/ui/clock.png', 'assets/ui/heart.png', 'assets/ui/robot.png', 'assets/ui/sound.png',
  'assets/weapons/bat.png', 'assets/weapons/bazooka.png', 'assets/weapons/bellyflop.png',
  'assets/weapons/blowtorch.png', 'assets/weapons/bone_spear.png', 'assets/weapons/cluster.png',
  'assets/weapons/deploy_turret.png', 'assets/weapons/drill.png', 'assets/weapons/dynamite.png',
  'assets/weapons/eggbomb.png', 'assets/weapons/freeze.png', 'assets/weapons/grenade.png',
  'assets/weapons/guided.png', 'assets/weapons/homing.png', 'assets/weapons/jetpack.png',
  'assets/weapons/lowgrav.png', 'assets/weapons/mine.png', 'assets/weapons/mirv.png',
  'assets/weapons/napalm.png', 'assets/weapons/parachute.png', 'assets/weapons/place_trap.png',
  'assets/weapons/portal.png', 'assets/weapons/quake.png', 'assets/weapons/roller.png',
  'assets/weapons/shotgun.png', 'assets/weapons/sniper.png', 'assets/weapons/summon_skeleton.png',
  'assets/weapons/summon_zombie.png', 'assets/weapons/teleport.png'
];
CA._isMissingArt = function(path){
  var p = String(path).split('?')[0].replace(/^\.?\//, '');
  for (var i = 0; i < CA.MISSING_ART.length; i++){
    if (p.indexOf(CA.MISSING_ART[i]) === 0) return true;
  }
  return false;
};

CA.img = function(path){
  if (!path) return null;
  if (CA._isMissingArt(path)) return null;
  const c = CA._imgCache;
  if (path in c){ const im=c[path]; return (im && im.complete && im.naturalWidth>0) ? im : null; }
  try { const img=new Image(); img.onerror=()=>{ c[path]=null; }; img.src=path; c[path]=img; }
  catch(e){ c[path]=null; }
  return null;
};

/* CA.Maps — map themes (owner: maps.js / Agent World).
 * Shape per id: { id, name, palette:{sky:[..stops..], hill1, hill2, dirt, grass,
 *   rock, water}, gen(mctx,W,H,rng), props:[...], daytime:'day'|'dusk'|'night' } */
CA.Maps = CA.Maps || { list(){ return Object.keys(CA.Maps).filter(k=>typeof CA.Maps[k]==='object'); } };

/* CA.Modes — game modes (owner: modes.js / Agent Shell).
 * Shape per id: { id, name, desc, setup(opts)->teamConfigs|null, onGameStart(),
 *   onTurnStart(teamIdx,unit), onTurnEnd(teamIdx), checkWin()->teamId|undefined|null,
 *   render(ctx) } — any hook optional; core calls them when present. */
CA.Modes = CA.Modes || {};
CA.activeMode = ()=> CA.Modes[CA.state.gameMode] || null;

/* CA.Weather, CA.Hazards, CA.Meta — filled by their modules; guarded everywhere. */

/* ---- Persistent settings (localStorage 'ca_settings') ---- */
CA.settings = {
  muted: false,
  musicVol: 0.3,        // default 30% (user pref); music also ×0.35 in-game = quiet
  sfxVol: 0.8,          // default 80% (user pref) — SFX punchy; only music is quiet
  quality: 'high',        // 'high'|'low' (low = fewer particles, no glow)
  showTrajectory: true,   // full predicted arc while aiming
  killcam: true,
  postfx: false,          // OPT-IN WebGL post-pass (bloom/grade). OFF until verified per-device; also ?postfx URL switch.
  /* ---- accessibility / comfort (idea #39) — owned by ui.js settings screen ---- */
  aimSensitivity: 1.0,    // 0.5..2.0 multiplier for keyboard/touch aim speed
  leftHanded: false,      // mirror the mobile touch controls (move<->fire sides)
  colorblind: 'off',      // 'off'|'deuter'|'protan'|'tritan' team-color remap hint
  haptics: true,          // mobile vibration feedback on hits/fire
  reducedMotion: false,   // suppress screen-shake / slow-mo / kill-cam (comfort/a11y)
  music: true,            // background music on/off (default ON; toggle now wired in fx._syncMusic)
  keymap: {               // physical e.code values; rebindable
    left:'KeyA', right:'KeyD', aimUp:'KeyW', aimDown:'KeyS',
    jump:'Space', fire:'Enter', nextWeapon:'Tab', pause:'KeyP', switchUnit:'KeyQ'
  },
  load(){
    try{ const s=JSON.parse(localStorage.getItem('ca_settings')||'null');
      if(s){ Object.assign(this, s); this.keymap = Object.assign({left:'KeyA',right:'KeyD',aimUp:'KeyW',aimDown:'KeyS',jump:'Space',fire:'Enter',nextWeapon:'Tab',pause:'KeyP',switchUnit:'KeyQ'}, s.keymap||{});
        // first run with this build: honour the OS reduced-motion preference as default
        if(s.reducedMotion===undefined){ try{ if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.reducedMotion=true; }catch(e){} } } }
    catch(e){}
    // sanitize: never trust localStorage — clamp/whitelist so a bad blob can't break audio/quality.
    var clamp01=function(v,d){ return (typeof v==='number'&&isFinite(v))?Math.max(0,Math.min(1,v)):d; };
    this.musicVol=clamp01(this.musicVol,0.3); this.sfxVol=clamp01(this.sfxVol,0.8);
    this.aimSensitivity=(typeof this.aimSensitivity==='number'&&isFinite(this.aimSensitivity))?Math.max(0.5,Math.min(2,this.aimSensitivity)):1.0;
    if(this.quality!=='low'&&this.quality!=='normal'&&this.quality!=='high') this.quality='high';  // 'ultra' retired → coerces to high
    if(['off','deuter','protan','tritan'].indexOf(this.colorblind)<0) this.colorblind='off';
    // QA P0: a whitelist a ES/PT/ZH bővítés ELŐTTI volt ('hu'/'en') → minden
    // reloadnál törölte a spanyol/portugál/kínai választást, és a következő
    // save() véglegesen 'en'-re írta. Tartsd szinkronban az i18n nyelvlistával!
    if(['hu','en','es','pt','zh','de'].indexOf(this.lang)<0) this.lang=undefined;   // let i18n DEF decide
    ['showTrajectory','killcam','postfx','leftHanded','haptics','reducedMotion','music'].forEach(function(k){ this[k]=!!this[k]; }, this);
    // mute is session-only (Jani): ALWAYS start unmuted, ignore any legacy persisted value.
    this.muted=false;
    return this;
  },
  save(){
    try{ localStorage.setItem('ca_settings', JSON.stringify({
      /* muted is INTENTIONALLY omitted — mute is session-only (Jani szabálya);
         persisting it could cause a stuck silent start. */
      musicVol:this.musicVol, sfxVol:this.sfxVol, quality:this.quality, postfx:this.postfx,
      showTrajectory:this.showTrajectory, killcam:this.killcam, keymap:this.keymap,
      aimSensitivity:this.aimSensitivity, leftHanded:this.leftHanded, colorblind:this.colorblind,
      haptics:this.haptics, reducedMotion:this.reducedMotion, music:this.music, lang:this.lang })); }
    catch(e){}
  },
};
CA.settings.load();
