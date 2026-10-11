/* ============================================================================
 * Squeak & Destroy — puzzles.js  ::  CA.Puzzles
 * ----------------------------------------------------------------------------
 * HAND-AUTHORED single-player PUZZLE MISSIONS ("Fejtörők").
 *
 * Each puzzle is a FIXED, deterministic scenario — same terrain + same enemy
 * layout for everyone — where the player must wipe out a small set of PASSIVE
 * enemy dummies. The fewer shots used, the more stars (★) you earn:
 *   shots <= par                 -> 3★   ("par" = the intended clever-shot count)
 *   shots <= ceil(par * 1.6)     -> 2★
 *   otherwise (still won)        -> 1★
 *   lost                         -> 0★
 *
 * DETERMINISM
 *   The whole scenario is reproduced from a fixed `seed` (terrain + seeded
 *   spawns) passed to CA.newGame. Where a puzzle needs EXACT unit placement we
 *   additionally overlay forced x/y/hp onto the spawned units AFTER newGame —
 *   the same technique CA.loadGame uses (iterate S.teams -> team.unitIds ->
 *   CA.getUnit -> set u.x/u.y/u.hp). A puzzle that only relies on the seed
 *   leaves the spawns untouched.
 *
 * WEAPON RESTRICTION
 *   The core engine's S.rules.weaponSet only supports 'all', the category sets
 *   (melee/explosive/crate) or a SINGLE weapon id — it has no native ALLOWED-
 *   LIST. To restrict to an arbitrary SUBSET without editing core.js, this
 *   module wraps CA.weaponAllowed defensively: when a puzzle is active AND
 *   declares an `allowed` list, the wrapper enforces that subset (utilities
 *   always pass, so a turn can never soft-lock); otherwise it delegates to the
 *   original engine implementation, so NORMAL matches are completely untouched.
 *
 * Everything here is DEFENSIVE: nothing is allowed to throw into the UI or the
 * game loop. Every public method try/catches and returns a safe value.
 *
 * ── PUBLIC API ──
 *   CA.Puzzles.list()        -> [{ id, name, hint, par, stars, locked }]
 *   CA.Puzzles.start(id)     -> boolean   (sets up + launches the puzzle)
 *   CA.Puzzles.progress()    -> { stars:{id:n}, total, max }
 *   CA.Puzzles.lastResult()  -> { id, stars, shots, won } | null
 *   CA.Puzzles.isActive()    -> boolean
 *
 * ── PERSISTENCE ──
 *   localStorage key 'ca_puzzles' -> { "<id>": <bestStars 0..3>, ... }
 * ==========================================================================*/
(function(){
  if (!window.CA) return;

  var C = CA.config, S = CA.state, U = CA.util;

  // localStorage key holding per-puzzle best stars (0..3).
  var STORE_KEY = 'ca_puzzles';

  // last finished puzzle run summary (for the UI to display).
  var _last = null;
  // ensure we only wire the 'fired'/'gameOver' listeners + weaponAllowed wrap once.
  var _wired = false;

  /* ---------------------------------------------------------------------------
   * i18n: the HU string IS the key; register EN here. CA.t() resolves it.
   * ------------------------------------------------------------------------- */
  try {
    if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
      'Fejtörők':'Puzzles',
      'Fejtörő':'Puzzle',
      'Célpontok':'Targets',
      'Egy lövés, két kukac':'One shot, two worms',
      'Csak egy gránátod van — ahogy a kukacok egy vonalban ülnek, egyetlen jól időzített dobás mindkettőt elviszi.':
        'You only get one grenade — line the worms up and a single well-timed throw takes both.',
      'Pattanó bazooka':'Banked bazooka',
      'A kukac fal mögött bújik. Pattintsd a lövést a mennyezetről vagy célozz ívben — a szél is besegít.':
        'The worm hides behind a wall. Bank the shot off the ceiling or arc it over — the wind helps.',
      'Szakadék fölött':'Across the chasm',
      'Két kukac a túloldali peremen. Egy erős dinamit a megfelelő helyre, és mindkettő a vízbe zuhan.':
        'Two worms on the far ledge. One well-placed dynamite and both tumble into the water.',
      'Aknamező':'Minefield',
      'Ne pazarold a lőszert — lökd a kukacokat egymásnak vagy a peremre. A visszarúgás a barátod.':
        'Do not waste ammo — knock the worms into each other or off the edge. Knockback is your friend.',
      'Lézershow':'Laser show',
      'Három kukac szoros sorban. A lézer átüt mindenen, ami egy vonalban van — keresd a tökéletes szöget.':
        'Three worms in a tight row. The laser punches through anything in line — find the perfect angle.',
      'A nagy finálé':'The grand finale',
      'Négy kukac, korlátozott lőszer. Capy-bomba a tömegre, a maradékot bazookával — tervezd meg a sorrendet.':
        'Four worms, limited ammo. Capy-bomb the cluster, mop up with the bazooka — plan your order.',
      '★ szerezve':'★ earned',
      'Tökéletes! 3★':'Perfect! 3★',
      'Zárolva':'Locked',

      // --- p7..p18 (new missions) ---
      'Vízbe lökve':'Pushed into the water',
      'Egyetlen ütés a peremen ülő kukacnak — a baseball-ütő hatalmas lökése egyenesen a vízbe repíti.':
        'A single swing at the worm on the ledge — the bat\'s huge knockback sends it straight into the water.',
      'Dominó':'Domino',
      'Sorban állnak egy lejtőn. Lökd meg a felsőt rönkdobással, és sorra zuhannak egymásra, mint a dominó.':
        'They stand in a line on a slope. Shove the top one with the log toss and they topple onto each other like dominoes.',
      'Pattintós lézer':'Bank-shot laser',
      'A célpont egy zugban bújik. A lézer nem ível — pattintsd a megfelelő szögben a falról, hogy átérjen.':
        'The target hides in a nook. The laser does not arc — bank it off the wall at the right angle to reach.',
      'Omladozó perem':'Crumbling ledge',
      'Ne a kukacot lődd — a lába alatti földet. Ha kirobbantod a peremet, magával viszi a vízbe.':
        'Do not shoot the worm — shoot the ground beneath its feet. Blow out the ledge and it falls into the water.',
      'Szélkapitány':'Wind captain',
      'Erős oldalszél fúj. Olvasd le az irányát és erejét, majd a tojásbombát a szélbe célozva ívelj a fal mögé.':
        'A strong crosswind blows. Read its direction and strength, then aim the egg-bomb into the wind to arc behind the wall.',
      'Csapdamester':'Trap master',
      'Egy aknát ügyesen elhelyezve a két kukac közé — a robbanás visszarúgása mindkettőt elviszi egyszerre.':
        'Place one mine cleverly between the two worms — the blast knockback takes them both at once.',
      'Kazettás eső':'Cluster rain',
      'Négy kukac szorosan egymás mellett. Egy kazettás bomba a közepükre szórja a repeszeit — robbantsd szét a csapatot.':
        'Four worms packed together. One cluster bomb rains shrapnel over the middle — shatter the squad.',
      'Légi csapásmérés':'Air strike run',
      'A célpontok egy vonalban, fedezék nélkül. Egy jól időzített légicsapás végigsöpör a soron.':
        'The targets line up with no cover. One well-timed air strike sweeps down the whole row.',
      'Temetői keringő':'Graveyard waltz',
      'A temetőben sírkövek közt bújnak. Pattintós gránát vagy gurítóbomba kerüli ki a köveket — találd meg az utat.':
        'They hide among the headstones in the graveyard. A banked grenade or a roller bomb skirts the stones — find the path.',
      'Lökd a szakadékba':'Shove into the abyss',
      'Három kukac egy keskeny hídon. Földrengéssel vagy rönkdobással lökd le mindet — egy ütemben, ha tudod.':
        'Three worms on a narrow bridge. Use the ground slam or log toss to shove them all off — in one beat if you can.',
      'Mesterlövész-galéria':'Sniper gallery',
      'Öt apró célpont, csak mesterlövésszel. Minden golyó számít — egyetlen kihagyott lövés és odalett a három csillag.':
        'Five tiny targets, sniper only. Every bullet counts — one missed shot and the three stars are gone.',
      'Capy-armageddon':'Capy-armageddon',
      'A végső próba: öt kukac, egyetlen Capy-bomba a tömegre, a maradékot bazookával és gránáttal. A sorrend minden.':
        'The final trial: five worms, one Capy-bomb on the cluster, mop up with bazooka and grenade. Order is everything.'
    });
  } catch(e){}

  /* ---------------------------------------------------------------------------
   * AUTHORED PUZZLE SET — ~6 escalating missions.
   *
   * def fields:
   *   id           stable string id (also the localStorage key)
   *   name, hint   HU strings (EN registered above)
   *   theme        maps.js theme id
   *   seed         deterministic terrain/spawn seed
   *   par          shots for 3★
   *   enemyCount   number of passive enemy dummies (1..5)
   *   playerClasses per-unit class ids for the (single) player hero(es)
   *   weapons      optional ALLOWED weapon-id subset (utilities always allowed)
   *   startWeapon  weapon selected when the puzzle starts
   *   forced       optional { player:[{x,y,hp}...], enemy:[{x,y,hp}...] }
   *                exact positions/hp overlaid AFTER spawn (index-aligned).
   * ------------------------------------------------------------------------- */
  var PUZZLES = [
    {
      id: 'p1_double_worm',
      name: 'Egy lövés, két kukac',
      hint: 'Csak egy gránátod van — ahogy a kukacok egy vonalban ülnek, egyetlen jól időzített dobás mindkettőt elviszi.',
      theme: 'grass', seed: 770011, par: 1, enemyCount: 2,
      playerClasses: ['hunter'],
      weapons: ['grenade'], startWeapon: 'grenade'
    },
    {
      id: 'p2_bank_shot',
      name: 'Pattanó bazooka',
      hint: 'A kukac fal mögött bújik. Pattintsd a lövést a mennyezetről vagy célozz ívben — a szél is besegít.',
      theme: 'cave', seed: 880022, par: 1, enemyCount: 1,
      playerClasses: ['guardian'],
      weapons: ['bazooka'], startWeapon: 'bazooka'
    },
    {
      id: 'p3_chasm',
      name: 'Szakadék fölött',
      hint: 'Két kukac a túloldali peremen. Egy erős dinamit a megfelelő helyre, és mindkettő a vízbe zuhan.',
      theme: 'jungle', seed: 990033, par: 1, enemyCount: 2,
      playerClasses: ['hunter'],
      weapons: ['dynamite','grenade'], startWeapon: 'dynamite'
    },
    {
      id: 'p4_knockback',
      name: 'Aknamező',
      hint: 'Ne pazarold a lőszert — lökd a kukacokat egymásnak vagy a peremre. A visszarúgás a barátod.',
      theme: 'desert', seed: 1010044, par: 2, enemyCount: 3,
      playerClasses: ['guardian'],
      weapons: ['bat','melee','bazooka'], startWeapon: 'bat'
    },
    {
      id: 'p5_laser_line',
      name: 'Lézershow',
      hint: 'Három kukac szoros sorban. A lézer átüt mindenen, ami egy vonalban van — keresd a tökéletes szöget.',
      theme: 'snow', seed: 1120055, par: 2, enemyCount: 3,
      playerClasses: ['hunter'],
      weapons: ['laser','sniper'], startWeapon: 'laser'
    },
    {
      id: 'p6_finale',
      name: 'A nagy finálé',
      hint: 'Négy kukac, korlátozott lőszer. Capy-bomba a tömegre, a maradékot bazookával — tervezd meg a sorrendet.',
      theme: 'volcano', seed: 1230066, par: 3, enemyCount: 4,
      playerClasses: ['guardian'],
      weapons: ['capybomb','bazooka','grenade'], startWeapon: 'capybomb'
    },

    /* === NEW MISSIONS p7..p18 — escalating, mechanic-showcase ============== */
    {
      id: 'p7_push_water',
      name: 'Vízbe lökve',
      hint: 'Egyetlen ütés a peremen ülő kukacnak — a baseball-ütő hatalmas lökése egyenesen a vízbe repíti.',
      theme: 'islands', seed: 1340077, par: 1, enemyCount: 1,
      playerClasses: ['guardian'],
      weapons: ['bat','melee'], startWeapon: 'bat'
    },
    {
      id: 'p8_domino',
      name: 'Dominó',
      hint: 'Sorban állnak egy lejtőn. Lökd meg a felsőt rönkdobással, és sorra zuhannak egymásra, mint a dominó.',
      theme: 'snow', seed: 1450088, par: 1, enemyCount: 3,
      playerClasses: ['guardian'],
      weapons: ['logtoss','bat'], startWeapon: 'logtoss'
    },
    {
      id: 'p9_bank_laser',
      name: 'Pattintós lézer',
      hint: 'A célpont egy zugban bújik. A lézer nem ível — pattintsd a megfelelő szögben a falról, hogy átérjen.',
      theme: 'cave', seed: 1560099, par: 1, enemyCount: 2,
      playerClasses: ['hunter'],
      weapons: ['laser','sniper'], startWeapon: 'laser'
    },
    {
      id: 'p10_crumble',
      name: 'Omladozó perem',
      hint: 'Ne a kukacot lődd — a lába alatti földet. Ha kirobbantod a peremet, magával viszi a vízbe.',
      theme: 'jungle', seed: 1670110, par: 1, enemyCount: 2,
      playerClasses: ['hunter'],
      weapons: ['drill','dynamite','grenade'], startWeapon: 'drill'
    },
    {
      id: 'p11_wind',
      name: 'Szélkapitány',
      hint: 'Erős oldalszél fúj. Olvasd le az irányát és erejét, majd a tojásbombát a szélbe célozva ívelj a fal mögé.',
      theme: 'desert', seed: 1780121, par: 1, enemyCount: 2,
      playerClasses: ['hunter'],
      weapons: ['eggbomb','bazooka'], startWeapon: 'eggbomb'
    },
    {
      id: 'p12_trap',
      name: 'Csapdamester',
      hint: 'Egy aknát ügyesen elhelyezve a két kukac közé — a robbanás visszarúgása mindkettőt elviszi egyszerre.',
      theme: 'space', seed: 1890132,  /* QA 2026-06-10: 'city' nincs regisztralva (grass-ra esett vissza) */ par: 1, enemyCount: 2,
      playerClasses: ['engineer'],
      weapons: ['mine','grenade'], startWeapon: 'mine'
    },
    {
      id: 'p13_cluster',
      name: 'Kazettás eső',
      hint: 'Négy kukac szorosan egymás mellett. Egy kazettás bomba a közepükre szórja a repeszeit — robbantsd szét a csapatot.',
      theme: 'volcano', seed: 1900143, par: 2, enemyCount: 4,
      playerClasses: ['hunter'],
      weapons: ['cluster','grenade'], startWeapon: 'cluster'
    },
    {
      id: 'p14_airstrike',
      name: 'Légi csapásmérés',
      hint: 'A célpontok egy vonalban, fedezék nélkül. Egy jól időzített légicsapás végigsöpör a soron.',
      theme: 'space', seed: 2010154, par: 2, enemyCount: 4,
      playerClasses: ['hunter'],
      weapons: ['airstrike','bazooka'], startWeapon: 'airstrike'
    },
    {
      id: 'p15_graveyard',
      name: 'Temetői keringő',
      hint: 'A temetőben sírkövek közt bújnak. Pattintós gránát vagy gurítóbomba kerüli ki a köveket — találd meg az utat.',
      theme: 'graveyard', seed: 2120165, par: 2, enemyCount: 3,
      playerClasses: ['guardian'],
      weapons: ['grenade','roller','bazooka'], startWeapon: 'grenade'
    },
    {
      id: 'p16_shove_abyss',
      name: 'Lökd a szakadékba',
      hint: 'Három kukac egy keskeny hídon. Földrengéssel vagy rönkdobással lökd le mindet — egy ütemben, ha tudod.',
      theme: 'cave', seed: 2230176, par: 2, enemyCount: 3,
      playerClasses: ['guardian'],
      weapons: ['ground_slam','logtoss','bat'], startWeapon: 'ground_slam'
    },
    {
      id: 'p17_sniper_gallery',
      name: 'Mesterlövész-galéria',
      hint: 'Öt apró célpont, csak mesterlövésszel. Minden golyó számít — egyetlen kihagyott lövés és odalett a három csillag.',
      theme: 'desert', seed: 2340187, par: 3, enemyCount: 5,
      playerClasses: ['hunter'],
      weapons: ['sniper'], startWeapon: 'sniper'
    },
    {
      id: 'p18_capy_armageddon',
      name: 'Capy-armageddon',
      hint: 'A végső próba: öt kukac, egyetlen Capy-bomba a tömegre, a maradékot bazookával és gránáttal. A sorrend minden.',
      theme: 'graveyard', seed: 2450198, par: 3, enemyCount: 5,
      playerClasses: ['guardian'],
      weapons: ['capybomb','bazooka','grenade','cluster'], startWeapon: 'capybomb'
    }
  ];

  function defById(id){
    for (var i = 0; i < PUZZLES.length; i++){ if (PUZZLES[i].id === id) return PUZZLES[i]; }
    return null;
  }
  function indexOfId(id){
    for (var i = 0; i < PUZZLES.length; i++){ if (PUZZLES[i].id === id) return i; }
    return -1;
  }

  /* ---------------------------------------------------------------------------
   * star store (localStorage 'ca_puzzles')
   * ------------------------------------------------------------------------- */
  function readStore(){
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch(e){ return {}; }
  }
  function writeStore(o){
    try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch(e){}
  }
  function starsOf(id){
    try {
      var v = readStore()[id];
      v = (typeof v === 'number' && isFinite(v)) ? (v | 0) : 0;
      return U && U.clamp ? U.clamp(v, 0, 3) : Math.max(0, Math.min(3, v));
    } catch(e){ return 0; }
  }
  // store best stars; returns true if this beat (or set) the stored best.
  function storeStars(id, stars){
    try {
      if (!id) return false;
      stars = Math.max(0, Math.min(3, stars | 0));
      var store = readStore();
      var prev = (typeof store[id] === 'number' && isFinite(store[id])) ? (store[id] | 0) : 0;
      if (stars > prev){ store[id] = stars; writeStore(store); return true; }
      return false;
    } catch(e){ return false; }
  }

  /* ---------------------------------------------------------------------------
   * pick a class that actually exists, else degrade gracefully (core tolerates
   * an undefined class).
   * ------------------------------------------------------------------------- */
  function safeClass(want){
    try {
      if (CA.Classes && CA.Classes[want] && CA.Classes[want].abilities) return want;
      var list = (CA.Classes && CA.Classes.list) ? CA.Classes.list() : [];
      if (list.length) return list[0];
    } catch(e){}
    return undefined;
  }
  function safeClasses(arr){
    var out = [];
    if (Array.isArray(arr)) for (var i = 0; i < arr.length; i++) out.push(safeClass(arr[i]));
    return out;
  }

  // a puzzle is LOCKED until the PREVIOUS one has >=1 star; the first is always
  // unlocked.
  function isLocked(idx){
    if (idx <= 0) return false;
    var prev = PUZZLES[idx - 1];
    return !(prev && starsOf(prev.id) >= 1);
  }

  /* ---------------------------------------------------------------------------
   * WEAPON-RESTRICTION wrapper (subset support without editing core).
   * Saved once, delegates to the original unless an active puzzle declares an
   * allowed subset. Utilities/abilities always pass so a turn can't soft-lock.
   * ------------------------------------------------------------------------- */
  var _origWeaponAllowed = null;
  function installWeaponWrap(){
    try {
      if (typeof CA.weaponAllowed !== 'function') return;
      if (CA.weaponAllowed._puzzleWrapped) return;
      _origWeaponAllowed = CA.weaponAllowed;
      var wrapped = function(wid){
        try {
          var p = S._puzzle;
          if (p && p.allowed && p.allowed.length){
            if (!wid) return true;
            // always allow pure reposition utilities + non-damaging support.
            try { if (CA.isReusableUtil && CA.isReusableUtil(wid)) return true; } catch(_){}
            try {
              var L = (CA.Weapons && CA.Weapons.LIST) || [];
              var w = null;
              for (var i = 0; i < L.length; i++){ if (L[i].id === wid){ w = L[i]; break; } }
              if (w && w.category === 'utility') return true;
              if (w && w.ability && !(w.power || w.damage > 0)) return true;
            } catch(_){}
            return p.allowed.indexOf(wid) >= 0;
          }
        } catch(_){}
        // not a restricted puzzle turn → original engine behaviour (normal
        // matches + single-weapon weaponSet locks are completely unaffected).
        return _origWeaponAllowed ? _origWeaponAllowed(wid) : true;
      };
      wrapped._puzzleWrapped = true;
      CA.weaponAllowed = wrapped;
    } catch(e){}
  }

  /* ---------------------------------------------------------------------------
   * build the deterministic CA.newGame config for a puzzle def.
   * Player = capybara (human), enemy = worm passive dummies (aiLevel:0).
   * ------------------------------------------------------------------------- */
  function buildConfig(def){
    var pCls = safeClasses(def.playerClasses && def.playerClasses.length ? def.playerClasses : ['hunter']);
    var enemyN = Math.max(1, Math.min(5, def.enemyCount | 0 || 1));  // QA 2026-06-10: p17/p18 5 celpontot deklaral, a 4-es clamp levagta
    var playerN = Math.max(1, pCls.length);
    var cfg = {
      gameMode: 'classic',
      theme: def.theme || 'grass',
      seed: (typeof def.seed === 'number') ? def.seed : 1,
      vsAI: true,
      weather: 'clear',
      // wind off so a puzzle's intended shot is fully deterministic.
      rules: { wind: false, suddenDeath: 0 },
      teams: [
        { kind: 'capybara', name: 'Fejtörő', isAI: false, aiLevel: 0,
          classes: pCls, size: playerN },
        // PASSIVE dummies: aiLevel 0 → they never act (mirrors CA.startDev).
        { kind: 'worm', name: 'Célpontok', isAI: true, aiLevel: 0,
          size: enemyN }
      ]
    };
    return cfg;
  }

  // overlay exact positions/hp onto already-spawned units (loadGame technique).
  function applyForced(def){
    try {
      if (!def.forced) return;
      var apply = function(teamIdx, list){
        if (!Array.isArray(list) || !list.length) return;
        var team = S.teams && S.teams[teamIdx];
        if (!team || !team.unitIds) return;
        for (var i = 0; i < list.length && i < team.unitIds.length; i++){
          var u = CA.getUnit ? CA.getUnit(team.unitIds[i]) : null;
          var f = list[i];
          if (!u || !f) continue;
          if (typeof f.x === 'number') u.x = f.x;
          if (typeof f.y === 'number') u.y = f.y;
          if (typeof f.hp === 'number'){ u.hp = f.hp; if (f.hp > (u.maxHp || 0)) u.maxHp = f.hp; }
          u.vx = 0; u.vy = 0; u.grounded = false; // let it settle onto terrain
        }
      };
      apply(0, def.forced.player);
      apply(1, def.forced.enemy);
    } catch(e){ /* forced placement must never break a puzzle */ }
  }

  /* ---------------------------------------------------------------------------
   * START a puzzle run.
   * ------------------------------------------------------------------------- */
  function start(id){
    try {
      wire(); // listeners + weaponAllowed wrap

      var def = defById(id);
      if (!def) return false;

      // arm the run BEFORE newGame so the 'gameStart' reset stays clean. The
      // 'allowed' list (if any) drives the weaponAllowed wrapper.
      S._puzzle = {
        id: def.id,
        par: Math.max(1, def.par | 0 || 1),
        shots: 0,
        startTs: (function(){ try { return Date.now(); } catch(e){ return 0; } })(),
        allowed: (Array.isArray(def.weapons) && def.weapons.length) ? def.weapons.slice() : null
      };

      if (typeof CA.newGame !== 'function'){ S._puzzle = null; return false; }
      CA.newGame(buildConfig(def));

      // AFTER spawn: forced positions/hp, then weapon selection.
      applyForced(def);

      // select the start weapon (respecting the restriction).
      try {
        var want = def.startWeapon;
        if (want && (!S._puzzle.allowed || S._puzzle.allowed.indexOf(want) >= 0)) S.selectedWeapon = want;
        else if (S._puzzle.allowed && S._puzzle.allowed.length) S.selectedWeapon = S._puzzle.allowed[0];
        // final guard: if the pick is somehow illegal, fall back to a legal one.
        if (CA.weaponAllowed && !CA.weaponAllowed(S.selectedWeapon) && CA.fallbackAllowedWeapon){
          S.selectedWeapon = CA.fallbackAllowedWeapon();
        }
      } catch(_){}

      return true;
    } catch(e){
      try { S._puzzle = null; } catch(_){}
      return false;
    }
  }

  /* ---------------------------------------------------------------------------
   * SCORING — only ever runs while S._puzzle is set, so NORMAL matches are
   * never scored.
   * ------------------------------------------------------------------------- */
  function starsFor(won, shots, par){
    if (!won) return 0;
    par = Math.max(1, par | 0 || 1);
    shots = Math.max(0, shots | 0);
    if (shots <= par) return 3;
    if (shots <= Math.ceil(par * 1.6)) return 2;
    return 1;
  }

  function onFired(){
    try {
      var p = S._puzzle;
      if (p) p.shots = (p.shots || 0) + 1;
    } catch(e){}
  }

  function onGameOver(winnerTeamId){
    try {
      var p = S._puzzle;
      if (!p) return;              // not a puzzle run → never score
      S._puzzle = null;           // consume immediately (idempotent)

      // did the human (non-AI) team win? (= player survived & enemies dead)
      var won = false;
      try {
        var wt = (typeof CA.getTeam === 'function') ? CA.getTeam(winnerTeamId) : null;
        won = !!(wt && wt.isAI === false);
      } catch(_){}

      var shots = p.shots | 0;
      var stars = starsFor(won, shots, p.par);

      // persist best stars; remember whether this was a first-time 3★.
      var hadThreeBefore = (starsOf(p.id) >= 3);
      storeStars(p.id, stars);

      _last = { id: p.id, stars: stars, shots: shots, won: won };

      // award coins on the FIRST 3★ only (guarded; cosmetic soft currency).
      try {
        if (stars >= 3 && !hadThreeBefore && CA.Meta && CA.Meta.addCoins){
          CA.Meta.addCoins(50, 'puzzle:' + p.id);
        }
      } catch(_){}

      // celebratory toast (guarded).
      try {
        if (CA.events && CA.events.emit){
          if (stars >= 3) CA.events.emit('toast', '🧩 ' + CA.t('Tökéletes! 3★'));
          else if (stars > 0) CA.events.emit('toast', '🧩 ' + stars + CA.t('★ szerezve'));
        }
      } catch(_){}
    } catch(e){
      try { S._puzzle = null; } catch(_){}
    }
  }

  // subscribe ONCE to the scoring events + install the weapon-restriction wrap.
  function wire(){
    try {
      installWeaponWrap();
      if (_wired || !CA.events || !CA.events.on) return;
      _wired = true;
      CA.events.on('fired', function(){ onFired(); });
      CA.events.on('gameOver', function(winnerTeamId){ onGameOver(winnerTeamId); });
    } catch(e){}
  }

  /* ---------------------------------------------------------------------------
   * public API
   * ------------------------------------------------------------------------- */
  function list(){
    try {
      var out = [];
      for (var i = 0; i < PUZZLES.length; i++){
        var d = PUZZLES[i];
        out.push({
          id: d.id,
          name: d.name,
          hint: d.hint,
          par: Math.max(1, d.par | 0 || 1),
          stars: starsOf(d.id),
          locked: isLocked(i),
          // signature weapon for this puzzle → lets the UI show a per-puzzle icon
          // (variety) instead of the same enemy head on every card.
          weapon: d.startWeapon || (Array.isArray(d.weapons) && d.weapons[0]) || null
        });
      }
      return out;
    } catch(e){ return []; }
  }

  function progress(){
    try {
      var stars = {}, total = 0;
      for (var i = 0; i < PUZZLES.length; i++){
        var s = starsOf(PUZZLES[i].id);
        stars[PUZZLES[i].id] = s;
        total += s;
      }
      return { stars: stars, total: total, max: 3 * PUZZLES.length };
    } catch(e){ return { stars: {}, total: 0, max: 3 * PUZZLES.length }; }
  }

  function lastResult(){ return _last; }

  function isActive(){
    try { return !!(S && S._puzzle); } catch(e){ return false; }
  }

  // wire scoring listeners as soon as the module loads (so a puzzle started by
  // any path is still scored once S._puzzle gets set).
  wire();

  /* ---------------------------------------------------------------------------
   * export
   * ------------------------------------------------------------------------- */
  CA.Puzzles = {
    list: list,
    start: start,
    progress: progress,
    lastResult: lastResult,
    isActive: isActive,
    // exposed for tests / advanced callers (not part of the required surface):
    _STORE_KEY: STORE_KEY,
    _starsFor: starsFor,
    _defs: PUZZLES
  };
})();
