/* ============================================================================
 * CUTE ANIMALS — modes.js  ::  CA.Modes  (Agent Shell, wave 2)
 * ----------------------------------------------------------------------------
 * Features #16 (kampány), #17 (túlélő), #18 (arcade/idő-támadás), #19 (erőd),
 * #20 (FFA / bővített hot-seat 3-4 fő).  'classic' is the default (no entry
 * needed — core's built-in elimination win applies when CA.activeMode() is null
 * OR a mode omits checkWin).
 *
 * core.js calls these hooks WHEN PRESENT (all optional):
 *   setup(opts) -> return an array of team configs to override the default, or
 *                  null to keep opts.teams/legacy. (e.g. survival: 1 human team
 *                  + escalating AI; FFA: 3-4 teams from opts.)
 *   onGameStart(opts), onTurnStart(teamIdx,unit), onTurnEnd(teamIdx),
 *   update(dt), checkWin() -> teamId|null|undefined  (undefined = keep playing),
 *   render(ctx) [screen space HUD for the mode], renderWorld(ctx).
 *
 * Suggested modes:
 *   'classic'  : (optional) leave undefined -> core default elimination.
 *   'ffa'      : 3-4 teams (from opts.teams), last team standing. Mostly relies
 *                on core's default win (>=2 teams alive). Provide setup() to take
 *                opts.numTeams / opts.teams. (#10, #20 hot-seat.)
 *   'survival' : 1 player team vs waves of AI; each cleared wave spawns a bigger
 *                AI team; track wave count in CA.state.modeData; win=survive N
 *                waves, lose=player team wiped. (#17)
 *   'arcade'   : time/score attack — track score in modeData, show timer; (#18).
 *   'campaign' : sequence of preset levels (theme+enemy comp) of rising
 *                difficulty, advance on win; (#16).
 *   'forts'    : each team starts on/with a built base to demolish; (#19).
 *
 * Use CA.state.modeData as scratch. Read CA.aliveUnitsOfTeam, CA.state.teams.
 * The UI (wave 2) presents these in the New Game screen and may show CA.Modes
 * metadata (name/desc). Keep classic untouched.
 * ==========================================================================*/
(function(){
  const S = CA.state;
  const U = CA.util;
  const SPECIES = ['capybara','worm','hedgehog','frog'];
  const COLORS  = ['#caa472','#7fc97f','#d98f8f','#8fb6d9','#c9b06b','#b69fd9'];

  // ---- HUD layout helpers (mirror ui.js's metrics()/safeAreaTopCss, which are
  // module-private to ui.js) so mode-drawn HUD bits are ui-scaled + notch-safe. --
  let _modeSafeTopCss = -1;                   // -1 = not measured yet (cached)
  function hudSafeAreaTopCss(){
    if (_modeSafeTopCss >= 0) return _modeSafeTopCss;
    let px = 0;
    try {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;'+
        'padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;';
      document.body.appendChild(probe);
      px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      document.body.removeChild(probe);
    } catch(_) { px = 0; }
    _modeSafeTopCss = (isFinite(px) && px > 0) ? px : 0;
    return _modeSafeTopCss;
  }
  function hudMetrics(){
    const VW = CA.config.VIEW_W, VH = CA.config.VIEW_H;
    const cv = CA.canvas;
    const cssW = ((cv && cv.clientWidth) || window.innerWidth || VW) || 1;
    const dpr = U.clamp(VW / cssW, 1, 3);
    const aspect = VW / VH;
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const desktop = !isTouch && aspect >= 1.45 && cssW >= 900;
    let ui = dpr;
    if (desktop) ui = U.clamp(VH / 720, 0.9, 2.0);
    else         ui = U.clamp(dpr * 0.92, 1.0, 2.4);
    return { dpr: dpr, ui: ui, isTouch: isTouch };
  }

  /* EN translations for mode names, descriptions + every directly-drawn label. */
  CA.i18n.addEN({
    // ---- mode names ----
    'Free-for-all':'Free-for-all', 'AI vs AI':'AI vs AI', 'Arcade':'Arcade',
    'Kampány':'Campaign', 'Erődök':'Forts', 'Túlélő':'Survival',
    'Király a hegyen':'King of the Hill', 'Mesterlövész':'Sniper',
    'Bomba-futár':'Bomb Run', 'Koop vs Gép':'Co-op vs AI',
    'Napi kihívás':'Daily Challenge', 'Gyors meccs':'Quick Match', 'Oktató':'Tutorial',
    // ---- mode descriptions ----
    '3-4 csapat egymás ellen, hot-seat. Az utolsó talpon maradó nyer.':
      '3-4 teams against each other, hot-seat. Last one standing wins.',
    'Két gép csapat harcol — te csak nézed. Oda-vissza játszanak.':
      'Two AI teams fight — you just watch. They play back and forth.',
    'Idő- és pontvadászat: 120 mp alatt szerezz minél több találatot!':
      'Time & score attack: land as many hits as you can in 120 seconds!',
    '6 pálya, egyre nehezebb. Verd vissza az ellenséget grasstól a vulkánig!':
      '6 levels, ever harder. Push back the enemy from meadow to volcano!',
    'Két csapat saját emelt bázison. Robbantsd szét az ellenfél erődjét!':
      'Two teams on raised bases. Blow up the enemy fortress!',
    'Egy csapat végtelen, egyre erősebb AI-hullámok ellen. Meddig bírod?':
      'One team against endless, ever-stronger AI waves. How long can you last?',
    'A pálya közepén lévő zóna az úr. Aki több körön át uralja, nyer!':
      'The central zone rules. Hold it over more rounds to win!',
    'Csak nagy hatótávú, precíz fegyverek. Egy lövés, egy találat!':
      'Long-range, precise weapons only. One shot, one hit!',
    'Juttasd el a bombát az ellenfél térfelére! Aki betör, nyer.':
      'Carry the bomb to the enemy side! Whoever breaks in wins.',
    'Két emberi csapat együtt egy gép-horda ellen. Közös győzelem vagy bukás!':
      'Two human teams together against an AI horde. Win or fall together!',
    'Mindennap ugyanaz a pálya és szél mindenkinek. Ma melyik a tiéd?':
      'Same map and wind for everyone each day. Which is yours today?',
    'Pörgős menet: 3 egység/csapat, rövid körök. Pár perc az egész!':
      'Fast match: 3 units/team, short turns. The whole thing takes minutes!',
    'Vezetett gyakorlópálya: mozgás, célzás, tüzelés, fegyverváltás.':
      'Guided practice: movement, aiming, firing, weapon switching.',
    // ---- in-game drawn banners / hints / labels ----
    'AI vs AI — nézőmód':'AI vs AI — spectator mode',
    'Mesterlövész':'Sniper',
    'Engedélyezett':'Allowed',
    'Hullám':'Wave', 'túlélés':'survival',
    'Király a hegyen!':'King of the Hill!',
    'cél':'goal',
    'Bomba-futár!':'Bomb Run!',
    'Vidd a bombát a 🎯 zónába!':'Carry the bomb to the 🎯 zone!',
    'Koop vs Gép':'Co-op vs AI',
    'Koop — verd szét a gép-hordát!':'Co-op — smash the AI horde!',
    'Napi kihívás':'Daily Challenge', 'Napi':'Daily',
    'Gyors meccs':'Quick Match', 'fő/csapat':'units/team',
    'Oktató':'Tutorial',
    'pálya':'level',
    // campaign level names
    'Zöld mezők':'Green Meadows', 'Vulkán — Főnök':'Volcano — Boss',
    // tutorial steps
    'Mozgás: A / D billentyűk vagy a ◀ ▶ gombok.':'Move: A / D keys or the ◀ ▶ buttons.',
    'Célzás: W / S vagy az egér mozgatása fel-le.':'Aim: W / S or move the mouse up/down.',
    'Tüzelés: tartsd nyomva a SPACE-t (erő), majd engedd el!':'Fire: hold SPACE (power), then release!',
    'Fegyverváltás: Q / E vagy a fegyver-ikonokra kattintva.':'Switch weapon: Q / E or click the weapon icons.',
    'Győzz: lődd ki a bábut! 🎯':'Win: take out the dummy! 🎯',
    // ---- sudden death (core escalation) ----
    'Hirtelen halál!':'Sudden Death!', 'Hirtelen halál':'Sudden Death',
    // ---- micro-modes ----
    'Golf':'Golf', 'Verseny':'Race', 'Utolsó állás':'Last Stand',
    'Minél kevesebb lövésből juttasd az egységet a 🏁 zónába!':
      'Get a unit to the 🏁 zone in as few shots as possible!',
    'Versenyfutás: ki ér elsőként a 🏁 célzónába?':
      'A race: who reaches the 🏁 goal zone first?',
    'Egyetlen hős, egyre erősödő hullámok. Meddig állsz talpon?':
      'One lone hero, ever-stronger waves. How long can you stand?',
    'lövés':'shots', 'Cél elérve!':'Goal reached!', 'Befutott!':'Finished!',
    // ---- campaign objectives ----
    'Csillagok':'Stars', 'Célok':'Objectives',
    'Győzz le minden ellenséget':'Defeat all enemies',
    'Győzz legfeljebb {n} körből':'Win in {n} turns or fewer',
    'Tarts életben legalább {n} egységet':'Keep at least {n} units alive',
    'Ne szenvedj sebzést':'Take no damage',
    'Fejezd be {n} körön belül':'Finish within {n} rounds',
    // ---- team names (rendered via t(team.name)) ----
    'Gépcsapat A':'AI Team A','Gépcsapat B':'AI Team B',
    'Hősök':'Heroes','Ellenség':'Enemy',
    'Kék erőd':'Blue Fort','Piros erőd':'Red Fort',
    'Túlélők':'Survivors','Hegylakók':'Highlanders','Ostromlók':'Besiegers',
    'Lövészek':'Snipers','Célpontok':'Targets',
    'Futárok':'Runners','Védők':'Defenders',
    'Szövetség':'Alliance','Szövetség 1':'Alliance 1','Szövetség 2':'Alliance 2','Gép-horda':'AI Horde',
    'Napi ellenfél':'Daily Opponent','Kékek':'Blues','Pirosak':'Reds',
    'Tanonc':'Apprentice','Csapat':'Team','Bábu':'Dummy',
    'Golfozó':'Golfer','Kék futó':'Blue Runner','Piros futó':'Red Runner',
    'A hős':'The Hero','Hullám ':'Wave ','Hullám 1':'Wave 1',
    // ---- GAUNTLET (roguelite run) + BOSS RUSH ----
    'Gauntlet':'Gauntlet', 'Bossrohamok':'Boss Rush',
    'Roguelite menet: hullámról hullámra, közben válassz fejlesztést. A végén egy FŐNÖK!':
      'Roguelite run: wave after wave, draft an upgrade between each. A BOSS at the end!',
    'Csak a főnökök: győzd le sorban mind a hármat!':
      'Bosses only: defeat all three in a row!',
    'Bajnok':'Champion', 'Kihívók':'Challengers',
    'Mega-Worm':'Mega-Worm', 'Hordó-Gólem':'Barrel-Golem', 'Necro-Királynő':'Necro-Queen',
    'FŐNÖK':'BOSS', 'Főnök közeleg!':'A boss approaches!',
    'Válassz fejlesztést':'Choose an upgrade',
    'Menet vége':'Run over', 'Hullámok túlélve:':'Waves survived:',
    'Érme':'Coins', 'Győzelem!':'Victory!', 'A menet teljesítve!':'Run complete!',
    // ---- NEST DEFENSE (Védd a fészket) ----
    'Védd a fészket':'Defend the Nest',
    'Védd meg a fészket 5 ellenséges hullámtól! Ha a fészek elpusztul, vége.':
      'Protect the nest from 5 enemy waves! If the nest is destroyed, it is over.',
    'Fészek':'Nest', 'A fészek!':'The Nest!', 'Védd a fészket!':'Defend the nest!',
    'A fészek elesett!':'The nest has fallen!',
  });

  /* -------- shared helpers (private) ------------------------------------- */

  // species that actually exist in CA.Species (fall back to capybara/worm).
  function safeSpecies(want){
    if (CA.Species && CA.Species[want]) return want;
    if (CA.Species && CA.Species.capybara) return 'capybara';
    return want || 'capybara';
  }

  // Build a fresh team object + spawn its units mid-game (used by survival waves).
  // Returns the new team (already pushed into S.teams) or null on failure.
  function spawnEnemyTeam(cfg){
    if (!CA.Entities || !CA.Entities.spawnTeams) return null;
    const id = (S.teams.reduce((m,t)=>Math.max(m,t.id),0) || 0) + 1;
    const kind = safeSpecies(cfg.species || 'worm');
    const team = {
      id, name: cfg.name || ('Hullám '+id), kind, species: kind,
      color: cfg.color || COLORS[(id-1) % COLORS.length],
      isAI: true, aiLevel: cfg.aiLevel != null ? cfg.aiLevel : 1,
      unitIds: [], units: Array.isArray(cfg.units) ? cfg.units : undefined,
      // size: explicit per-wave override (bosses spawn a SINGLE giant unit).
      size: (typeof cfg.size==='number' && cfg.size>0) ? cfg.size : undefined,
    };
    S.teams.push(team);
    S.numTeams = S.teams.length;
    CA.Entities.spawnTeams([team]);  // spawns CA.config.TEAM_SIZE units
    // Optional per-unit HP scaling so late waves feel tougher.
    if (cfg.hpScale && cfg.hpScale !== 1){
      CA.aliveUnitsOfTeam(team.id).forEach(u=>{
        u.maxHp = Math.round(u.maxHp * cfg.hpScale);
        u.hp = u.maxHp;
      });
    }
    return team;
  }

  /* ======================================================================= *
   *  #20 / #10 — FFA (3-4 player hot-seat), last team standing.
   *  Relies on core's default elimination win (>=2 teams) -> no checkWin.
   * ======================================================================= */
  CA.Modes.ffa = {
    id: 'ffa',
    name: 'Free-for-all',
    desc: '3-4 csapat egymás ellen, hot-seat. Az utolsó talpon maradó nyer.',
    setup(opts){
      opts = opts || {};
      // Preferred: explicit roster from the UI — use as-is.
      if (Array.isArray(opts.teams) && opts.teams.length >= 2) return opts.teams;
      // Else build N teams alternating species.
      let n = opts.numTeams || 3;
      n = U.clamp(n, 2, 4) | 0;
      const humans = (opts.humans != null) ? opts.humans : 1; // how many hot-seat humans
      const out = [];
      for (let i=0;i<n;i++){
        out.push({
          species: safeSpecies(SPECIES[i % SPECIES.length]),
          name: CA.t('Csapat') + ' ' + (i+1),
          color: COLORS[i % COLORS.length],
          isAI: (typeof opts.humans === 'number') ? (i >= humans) : !!(opts.isAI && opts.isAI[i]),
          aiLevel: opts.aiLevel != null ? opts.aiLevel : 1,
        });
      }
      return out;
    },
    // No checkWin -> core's default last-team-standing elimination applies.
  };

  /* ======================================================================= *
   *  AI vs AI — spectator. Two AI teams fight; the human just watches.
   *  Both teams isAI:true so core never waits on human input; the turn manager
   *  alternates teams and CA.AI.takeTurn drives each side ("oda-vissza").
   *  Win = core's default last-team-standing elimination (no checkWin needed).
   * ======================================================================= */
  CA.Modes.aivsai = {
    id: 'aivsai',
    name: 'AI vs AI',
    desc: 'Két gép csapat harcol — te csak nézed. Oda-vissza játszanak.',

    // Anti-stalemate: a spectator AI-vs-AI match must always terminate. Core only
    // auto-enables sudden-death for classic/ffa, so seed a default here (the New
    // Game custom rule-set still overrides via normalizeRules(opts.rules, …)).
    rules: { suddenDeath: 180, waterRise: 26, sdToOneHp: true },

    setup(opts){
      opts = opts || {};
      const lvl = (opts.aiLevel != null) ? opts.aiLevel : 1;
      // If the UI passed an explicit roster, honour it but FORCE both AI.
      if (Array.isArray(opts.teams) && opts.teams.length >= 2){
        return opts.teams.map((t,i)=>{
          t = t || {};
          t.isAI = true;                                   // human only spectates
          if (t.aiLevel == null) t.aiLevel = lvl;
          if (t.color == null) t.color = COLORS[i % COLORS.length];
          return t;
        });
      }
      // Default: two AI teams with different species for fun.
      return [
        { species: safeSpecies('capybara'), name: 'Gépcsapat A',
          color: COLORS[0], isAI: true, aiLevel: lvl },
        { species: safeSpecies('worm'),     name: 'Gépcsapat B',
          color: COLORS[1], isAI: true, aiLevel: lvl },
      ];
    },

    // Tiny on-screen hint so the spectator knows it's hands-off.
    // [P2/P3] ui-scaled + safe-area aware, anchored BELOW the wind block so it no
    // longer collides with the centered hourglass or gets notch-clipped (was raw y=28).
    render(ctx){
      const M = hudMetrics(); const ui = M.ui;
      const safeTop = Math.round(hudSafeAreaTopCss() * (M.dpr || 1));
      ctx.save();
      ctx.font = 'bold '+(16*ui)+'px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 4*ui;
      const cx = (ctx.canvas.width||1280)/2;
      // mirror ui.js's centered layout: hourglass top=padTop, height cs, wind block
      // below it. Sit clear of (below) the wind block.
      const padTop = 12*ui + safeTop + 5*ui;
      const cs = (M.isTouch ? 36*0.7 : 36) * ui;
      const windBottom = (padTop + cs + 10*ui) + 2*ui + 9*ui + 18*ui;
      const y = Math.round(windBottom + 18*ui);
      const ic = 20*ui;
      const rb = CA.img && CA.img('assets/ui/robot.png');
      const t = CA.t('AI vs AI — nézőmód');
      const tw = ctx.measureText(t).width;
      ctx.strokeText(t, cx+ic*0.55, y); ctx.fillText(t, cx+ic*0.55, y);   // shift text right for the icon
      if(rb) ctx.drawImage(rb, cx - tw/2 - ic*0.55, y - ic*0.7, ic, ic);
      else { ctx.fillText('🤖', cx - tw/2 - ic*0.2, y); }
      ctx.restore();
    },
    // No checkWin -> core's default last-team-standing elimination applies.
  };

  /* ======================================================================= *
   *  #18 — ARCADE. Time/score attack.
   * ======================================================================= */
  CA.Modes.arcade = {
    id: 'arcade',
    name: 'Arcade',
    desc: 'Idő- és pontvadászat: 120 mp alatt szerezz minél több találatot!',
    DURATION: 120,
    // Patthelyzet-óra: passzív AI esetén ne tartson örökké (UI rules felülír).
    rules: { suddenDeath: 240, waterRise: 14, sdToOneHp: true },

    setup(opts){
      opts = opts || {};
      if (Array.isArray(opts.teams) && opts.teams.length >= 2) return opts.teams;
      return [
        { species:'capybara', name:'Játékos', isAI:false, aiLevel:0, color:COLORS[0] },
        { species:safeSpecies('worm'), name:'Bot', isAI:true,
          aiLevel: opts.aiLevel != null ? opts.aiLevel : 1, color:COLORS[1] },
      ];
    },

    onGameStart(){
      S.modeData.timeLeft = CA.Modes.arcade.DURATION * 60; // store in frames
      S.modeData.score = {};                                // teamId -> points
      S.teams.forEach(t=> S.modeData.score[t.id] = 0);
      // attribute kills to the team of the last unit that fired
      S.modeData._lastShooterTeam = null;
      // Hook once PER SESSION (mode-object flag, not md): S.modeData resets to {}
      // every game, so a md-level flag would re-register these listeners each
      // start and leak duplicate handlers (matches campaign._dmgHooked).
      if (!CA.Modes.arcade._arcadeHooked){
        CA.Modes.arcade._arcadeHooked = true;
        CA.events.on('fired', (unit)=>{ if(unit) S.modeData._lastShooterTeam = unit.teamId; });
        CA.events.on('unitDied', (u)=>{
          const md = S.modeData;
          if (!md || md.score == null) return;
          const killer = md._lastShooterTeam;
          if (killer != null && killer !== (u && u.teamId)){
            md.score[killer] = (md.score[killer]||0) + 100;
          }
        });
      }
    },

    update(dt){
      const md = S.modeData;
      if (md.timeLeft == null) return;
      md.timeLeft -= (dt || 1);
      if (md.timeLeft < 0) md.timeLeft = 0;
    },

    checkWin(){
      const md = S.modeData;
      // end EARLY on a wipe — don't make the lone survivor wait out the clock.
      try {
        const aliveTeams = S.teams.filter(t=>CA.aliveHeroesOfTeam(t.id).length>0);
        if (aliveTeams.length <= 1) return aliveTeams.length ? aliveTeams[0].id : null;
      } catch(e){}
      if (md.timeLeft == null || md.timeLeft > 0) return undefined;
      // time up — highest score wins; tie -> first human team.
      let best = null, bestScore = -1;
      S.teams.forEach(t=>{
        const sc = (md.score && md.score[t.id]) || 0;
        if (sc > bestScore){ bestScore = sc; best = t.id; }
      });
      if (best == null){
        const human = S.teams.find(t=>!t.isAI);
        return human ? human.id : (S.teams[0] ? S.teams[0].id : null);
      }
      return best;
    },

    render(ctx){
      const md = S.modeData;
      if (md.timeLeft == null) return;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 4;
      const secs = Math.ceil(md.timeLeft / 60);
      const mm = Math.floor(secs/60), ss = secs % 60;
      const tstr = mm + ':' + (ss<10?'0':'') + ss;
      const cx = (ctx.canvas.width||1280)/2;
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.strokeText(tstr, cx, 40); ctx.fillText(tstr, cx, 40);
      // scoreboard
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'left';
      let y = 64;
      S.teams.forEach(t=>{
        const line = t.name + ': ' + ((md.score && md.score[t.id])||0);
        ctx.fillStyle = t.color || '#fff';
        ctx.strokeText(line, 16, y); ctx.fillText(line, 16, y);
        y += 22;
      });
      ctx.restore();
    },
  };

  /* ======================================================================= *
   *  #16 — CAMPAIGN. Sequence of preset levels of rising difficulty.
   * ======================================================================= */
  CA.Modes.campaign = {
    id: 'campaign',
    name: 'Kampány',
    desc: '6 pálya, egyre nehezebb. Verd vissza az ellenséget grasstól a vulkánig!',

    // Each level defines per-level objectives (besides the win itself). `stars`
    // (0..3) = number of objectives satisfied on victory. Objective knobs:
    //   maxTurns  — win using <= N of the PLAYER's turns
    //   keepAlive — finish with >= N player units alive
    //   noDamage  — the player team took no damage all match
    //   maxRounds — finish within N full rounds
    levels: [
      { name:'Zöld mezők',   theme:'grass',   enemy:{ species:'worm',     count:2, aiLevel:0 },
        obj:{ maxTurns:6, keepAlive:2 } },
      { name:'Sivatag',      theme:'desert',  enemy:{ species:'hedgehog', count:3, aiLevel:1 },
        obj:{ maxTurns:8, keepAlive:3 } },
      { name:'Dzsungel',     theme:'jungle',  enemy:{ species:'frog',     count:3, aiLevel:1 },
        obj:{ maxTurns:8, noDamage:true } },
      { name:'Hómező',       theme:'snow',    enemy:{ species:'worm',     count:4, aiLevel:1 },
        obj:{ maxTurns:10, keepAlive:3 } },
      { name:'Barlang',      theme:'cave',    enemy:{ species:'hedgehog', count:4, aiLevel:2 },
        obj:{ maxRounds:8, keepAlive:2 } },
      { name:'Vulkán — Főnök', theme:'volcano', enemy:{ species:'frog',   count:5, aiLevel:2 },
        obj:{ maxTurns:12, noDamage:true } },
    ],

    _curLevel(opts){
      const max = CA.Modes.campaign.levels.length;
      let lv = (opts && opts.level != null) ? opts.level
             : (S.modeData && S.modeData.level != null) ? S.modeData.level
             : null;
      if (lv == null){
        // a finished campaign (done flag, or a stored level past the last one)
        // starts a FRESH run at level 1 rather than re-dropping into the finale.
        let done = false;
        try { done = localStorage.getItem('ca_campaign_done') === '1'; } catch(e){}
        try { lv = parseInt(localStorage.getItem('ca_campaign'), 10); } catch(e){}
        if (done || (lv && !isNaN(lv) && lv > max)) return 1;   // start over
        if (!lv || isNaN(lv)) lv = 1;
      }
      return U.clamp(lv|0, 1, max);
    },

    setup(opts){
      opts = opts || {};
      const lv = CA.Modes.campaign._curLevel(opts);
      S.modeData.level = lv;
      const def = CA.Modes.campaign.levels[lv-1];
      // set the theme implicitly for this level
      if (def.theme) S.theme = def.theme;
      // Player team: honour the New Game roster (faj/kaszt/méret) if the menu
      // passed one via opts.teams[0]; otherwise the default hero team. Force the
      // player to human regardless.
      const player = (Array.isArray(opts.teams) && opts.teams[0]) || {
        species:'capybara', name:'Hősök', isAI:false, aiLevel:0,
      };
      player.isAI = false; player.aiLevel = 0;
      const enemy = {
        species: safeSpecies(def.enemy.species),
        name: 'Ellenség',
        color: COLORS[1],
        isAI: true,
        aiLevel: def.enemy.aiLevel,
        // per-level enemy count (spawnTeams' sizeOf honours team.size).
        size: (typeof def.enemy.count === 'number' && def.enemy.count > 0)
          ? def.enemy.count : undefined,
      };
      return [player, enemy];
    },

    onGameStart(){
      const md = S.modeData;
      const lv = md.level || 1;
      const def = CA.Modes.campaign.levels[lv-1];
      md.banner = {
        text: lv + '. ' + CA.t('pálya') + ' — ' + (def ? CA.t(def.name) : ''),
        t: 200,
      };
      // ---- objective tracking ----
      md.playerTeamId = S.teams[0] && S.teams[0].id;
      md.playerTurns = 0;          // how many turns the player has taken
      md.tookDamage = false;       // any damage to a player unit this match
      // Hook once PER SESSION (not per game): S.modeData resets to {} each game,
      // so a md-level flag would re-register this listener on every campaign start
      // and leak duplicates. A mode-object flag registers it exactly once; the
      // handler reads S.modeData/S.gameMode live, so it stays correct across games.
      if (!CA.Modes.campaign._dmgHooked){
        CA.Modes.campaign._dmgHooked = true;
        CA.events.on('unitDamaged', (u, amount)=>{
          const m = S.modeData;
          if (S.gameMode!=='campaign' || !m) return;
          if (u && u.teamId === m.playerTeamId && (amount||0) > 0) m.tookDamage = true;
        });
      }
    },

    // Count the player's own turns (used by the maxTurns objective).
    onTurnStart(teamIdx, unit){
      const md = S.modeData;
      if (unit && unit.teamId === md.playerTeamId) md.playerTurns = (md.playerTurns||0) + 1;
    },

    update(){
      if (S.modeData.banner && S.modeData.banner.t > 0) S.modeData.banner.t--;
    },

    // Evaluate the level's objectives at victory and return the 0..3 star total
    // plus a labelled list for the game-over screen.
    _evalObjectives(def, md){
      const out = [];
      const pAlive = CA.aliveUnitsOfTeam(md.playerTeamId).length;
      const o = (def && def.obj) || {};
      // primary objective: defeating all enemies (always met when we win)
      out.push({ label: CA.t('Győzz le minden ellenséget'), ok: true });
      if (o.maxTurns != null){
        out.push({ label: CA.t('Győzz legfeljebb {n} körből').replace('{n}', o.maxTurns),
                   ok: (md.playerTurns||0) <= o.maxTurns });
      }
      if (o.maxRounds != null){
        out.push({ label: CA.t('Fejezd be {n} körön belül').replace('{n}', o.maxRounds),
                   ok: (S.round||1) <= o.maxRounds });
      }
      if (o.keepAlive != null){
        out.push({ label: CA.t('Tarts életben legalább {n} egységet').replace('{n}', o.keepAlive),
                   ok: pAlive >= o.keepAlive });
      }
      if (o.noDamage){
        out.push({ label: CA.t('Ne szenvedj sebzést'), ok: !md.tookDamage });
      }
      // stars = satisfied objectives, capped at 3 (winning guarantees >=1).
      const stars = U.clamp(out.filter(x=>x.ok).length, 0, 3);
      return { stars, objectives: out.slice(0, 3) };
    },

    // Win = enemy eliminated; lose = player eliminated. On win, advance + persist,
    // compute stars + rewards, and publish CA.state.campaignResult BEFORE gameOver.
    checkWin(){
      const teams = S.teams;
      const player = teams[0], enemy = teams[1];
      if (!player || !enemy) return undefined;
      const md = S.modeData;
      const pAlive = CA.aliveHeroesOfTeam(player.id).length;   // HEROES: a lone minion neither wins nor keeps you "alive"
      const eAlive = CA.aliveHeroesOfTeam(enemy.id).length;
      if (pAlive === 0) return null;           // lose (draw/over)
      if (eAlive === 0){
        const lv = md.level || 1;
        const max = CA.Modes.campaign.levels.length;
        const def = CA.Modes.campaign.levels[lv-1];
        const next = Math.min(max + 1, lv + 1); // max+1 == campaign finished
        const complete = (lv >= max);
        try {
          // persist the REAL next level (may be max+1 = "completed"), not a value
          // clamped back to max — otherwise replays always re-drop into the finale.
          localStorage.setItem('ca_campaign', String(next));
          if (complete) localStorage.setItem('ca_campaign_done', '1');
          else localStorage.removeItem('ca_campaign_done');
        } catch(e){}
        md.nextLevel = next;                    // UI reads this for "next level"
        md.campaignComplete = complete;
        // ---- stars + rewards + result publish ----
        const res = CA.Modes.campaign._evalObjectives(def, md);
        // publish for the polish agent's game-over screen (BEFORE gameOver emit).
        CA.state.campaignResult = { level: lv, stars: res.stars, objectives: res.objectives };
        md.stars = res.stars; md.objectives = res.objectives;   // also keep on modeData
        // persist + grant via the meta contract (guarded — meta may be absent).
        try { if (CA.Meta && CA.Meta.setCampaignStars)   CA.Meta.setCampaignStars(lv, res.stars); } catch(e){}
        try { if (CA.Meta && CA.Meta.grantCampaignReward) CA.Meta.grantCampaignReward(lv, res.stars); } catch(e){}
        return player.id;                       // win (core emits gameOver next)
      }
      return undefined;
    },

    render(ctx){
      const md = S.modeData;
      if (md.banner && md.banner.t > 0){
        const a = Math.min(1, md.banner.t/60);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 6;
        ctx.font = 'bold 42px system-ui, sans-serif';
        const cx = (ctx.canvas.width||1280)/2, cy = (ctx.canvas.height||720)/2 - 70;
        ctx.strokeText(md.banner.text, cx, cy); ctx.fillText(md.banner.text, cx, cy);
        ctx.restore();
      }
    },
  };

  /* ======================================================================= *
   *  #19 — FORTS. Two teams each on a raised base. Elimination win (default).
   * ======================================================================= */
  CA.Modes.forts = {
    id: 'forts',
    name: 'Erődök',
    desc: 'Két csapat saját emelt bázison. Robbantsd szét az ellenfél erődjét!',
    // Patthelyzet-óra: passzív AI esetén ne tartson örökké (UI rules felülír).
    rules: { suddenDeath: 240, waterRise: 14, sdToOneHp: true },

    setup(opts){
      opts = opts || {};
      if (Array.isArray(opts.teams) && opts.teams.length >= 2) return opts.teams;
      const nm = opts.teamNames || {};
      return [
        { species:'capybara', name:(nm.capybara||'Kék erőd'), isAI:false, aiLevel:0, color:COLORS[3] },
        { species:safeSpecies('worm'), name:(nm.worm||'Piros erőd'),
          isAI: opts.vsAI !== false, aiLevel: opts.aiLevel != null ? opts.aiLevel : 1, color:COLORS[2] },
      ];
    },

    onGameStart(){
      // Build a raised solid platform under each team's units, if the terrain
      // editor hook is available. Purely additive (paintSolid) so it's safe.
      if (!CA.Terrain || !CA.Terrain.paintSolid) return;
      const C = CA.config;
      S.teams.forEach(team=>{
        const units = CA.aliveUnitsOfTeam(team.id);
        if (!units.length) return;
        let minX = Infinity, maxX = -Infinity, topY = Infinity;
        units.forEach(u=>{ minX=Math.min(minX,u.x); maxX=Math.max(maxX,u.x); topY=Math.min(topY,u.y); });
        const platTop = Math.min(topY + C.UNIT_R + 2, C.WATER_LEVEL - 40);
        const x0 = minX - 70, x1 = maxX + 70;
        // Paint a thick column of solid discs from platform top down a ways.
        for (let x = x0; x <= x1; x += 14){
          for (let y = platTop; y <= platTop + 120; y += 14){
            CA.Terrain.paintSolid(x, y, 16);
          }
        }
        // Side walls for cover.
        for (let y = platTop - 60; y <= platTop; y += 14){
          CA.Terrain.paintSolid(x0, y, 14);
          CA.Terrain.paintSolid(x1, y, 14);
        }
        // Re-seat units on top of their fresh platform so they don't sink.
        units.forEach(u=>{
          u.y = platTop - C.UNIT_R - 1;
          u.vx = 0; u.vy = 0; u.grounded = false;
        });
      });
    },
    // No checkWin -> core's default elimination applies.
  };

  /* ======================================================================= *
   *  shared HUD helper — a centred fading banner used by several new modes.
   * ======================================================================= */
  function drawBanner(ctx, md){
    if (!md || !md.banner || md.banner.t <= 0) return;
    const a = Math.min(1, md.banner.t/60);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 6;
    ctx.font = 'bold 44px system-ui, sans-serif';
    const cx = (ctx.canvas.width||1280)/2, cy = (ctx.canvas.height||720)/2 - 70;
    ctx.strokeText(md.banner.text, cx, cy); ctx.fillText(md.banner.text, cx, cy);
    ctx.restore();
  }
  function tickBanner(){ const md=S.modeData; if (md && md.banner && md.banner.t>0) md.banner.t--; }
  // draw small top-left label line
  function drawLabel(ctx, lines, x, y){
    ctx.save();
    ctx.textAlign='left'; ctx.fillStyle='#fff';
    ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=4;
    ctx.font='bold 20px system-ui, sans-serif';
    let yy = y;
    (Array.isArray(lines)?lines:[lines]).forEach(L=>{
      ctx.strokeText(L, x, yy); ctx.fillText(L, x, yy); yy += 26;
    });
    ctx.restore();
  }

  /* ======================================================================= *
   *  NEW MODES (spec 16,17,18,19,20,21,22,38). Wave-2 additions.
   * ======================================================================= */

  /* ----------------------------------------------------------------------- *
   *  16. SURVIVAL (id 'survival') — endless waves; the player never "wins",
   *  they survive as long as possible (score = waves survived).
   * ----------------------------------------------------------------------- */
  CA.Modes.survival = {
    id: 'survival',
    name: 'Túlélő',
    desc: 'Egy csapat végtelen, egyre erősebb AI-hullámok ellen. Meddig bírod?',

    setup(opts){
      opts = opts || {};
      const player = (Array.isArray(opts.teams) && opts.teams[0]) || {
        species: 'capybara', name: 'Túlélők', isAI: false, aiLevel: 0,
      };
      player.isAI = false; player.aiLevel = 0;
      const enemy = {
        species: safeSpecies('worm'), name: 'Hullám 1',
        color: COLORS[1], isAI: true, aiLevel: 1,
      };
      return [player, enemy];
    },

    onGameStart(){
      const md = S.modeData;
      md.wave = 1;
      md.playerTeamId = S.teams[0] && S.teams[0].id;
      md.enemyTeamId  = S.teams[1] && S.teams[1].id;
      md.banner = { text: CA.t('Hullám') + ' 1', t: 150 };
    },

    update(){ tickBanner(); },

    // After a turn settles: if the wave is dead, spawn a bigger/stronger one.
    onTurnEnd(){
      const md = S.modeData;
      if (md.playerTeamId == null) return;
      if (!CA.aliveHeroesOfTeam(md.playerTeamId).length) return;    // player wiped (HEROES; a lone minion is not "alive") -> loss via checkWin
      if (CA.aliveHeroesOfTeam(md.enemyTeamId).length > 0) return;  // wave still alive (HEROES only; minions don't keep a wave alive)
      // wave cleared -> spawn the next, harder wave (endless).
      md.wave++;
      const w = md.wave;
      const team = spawnEnemyTeam({
        species: U.pick(SPECIES),
        name: CA.t('Hullám') + ' ' + w,
        aiLevel: Math.min(2, 1 + Math.floor(w/3)),
        hpScale: 1 + (w-1)*0.15,                 // each wave tougher
      });
      if (team){
        md.enemyTeamId = team.id;
        md.banner = { text: CA.t('Hullám') + ' ' + w + '!', t: 150 };
        CA.events.emit('sfx', 'boom');
      }
    },

    // Player can only ever LOSE (return the surviving AI team). Score = waves.
    checkWin(){
      const md = S.modeData;
      if (md.playerTeamId == null) return undefined;
      if (!CA.aliveHeroesOfTeam(md.playerTeamId).length){   // HEROES: a lone surviving minion is not "still playing"
        md.wavesSurvived = (md.wave||1) - 1;     // the wave you fell on isn't "survived"
        return md.enemyTeamId != null ? md.enemyTeamId : null;
      }
      return undefined;
    },

    render(ctx){
      const md = S.modeData;
      drawLabel(ctx, CA.t('Hullám') + ' ' + (md.wave||1) + '  (' + CA.t('túlélés') + ')', 16, 64);
      drawBanner(ctx, md);
    },
  };

  /* ----------------------------------------------------------------------- *
   *  17. KOTH — Király a hegyen. Control the central hilltop zone.
   *  Each completed ROUND, the team with the most units inside the zone scores
   *  +1. First team to POINTS_TO_WIN wins.
   * ----------------------------------------------------------------------- */
  CA.Modes.koth = {
    id: 'koth',
    name: 'Király a hegyen',
    desc: 'A pálya közepén lévő zóna az úr. Aki több körön át uralja, nyer!',
    POINTS_TO_WIN: 5,
    // Patthelyzet-óra: passzív AI esetén a meccs sose tartson örökké (a New Game
    // egyéni szabálykészlete a normalizeRules-on át felülír). Itt rövidebb (180).
    rules: { suddenDeath: 180, waterRise: 14, sdToOneHp: true },

    setup(opts){
      opts = opts || {};
      if (Array.isArray(opts.teams) && opts.teams.length >= 2) return opts.teams;
      return [
        { species:'capybara', name:'Hegylakók', isAI:false, aiLevel:0, color:COLORS[0] },
        { species:safeSpecies('worm'), name:'Ostromlók', isAI:true,
          aiLevel: opts.aiLevel != null ? opts.aiLevel : 1, color:COLORS[1] },
      ];
    },

    _zone(){
      const C = CA.config;
      const cx = C.WORLD_W/2;
      const w  = 260;                            // zone half-handled via radius below
      return { cx, x0: cx - w/2, x1: cx + w/2, halfW: w/2, top: 0, bottom: C.WATER_LEVEL };
    },

    onGameStart(){
      const md = S.modeData;
      md.score = {};
      S.teams.forEach(t=> md.score[t.id] = 0);
      md._scoredRound = S.round;                 // avoid double-scoring a round
      md.banner = { text: CA.t('Király a hegyen!'), t: 150 };
      // Hook once PER SESSION (mode-object flag, not md): S.modeData resets to {}
      // every game, so a md-level flag would re-register this listener each start
      // and leak duplicate handlers (matches campaign._dmgHooked).
      if (!CA.Modes.koth._kothHooked){
        CA.Modes.koth._kothHooked = true;
        // Score at the start of each new round (the previous round just ended).
        CA.events.on('newRound', ()=> CA.Modes.koth._scoreRound());
      }
    },

    _scoreRound(){
      const md = S.modeData;
      if (S.gameMode !== 'koth') return;
      if (md._scoredRound === S.round) return;
      md._scoredRound = S.round;
      const z = CA.Modes.koth._zone();
      let best = -1, bestTeam = null, tie = false;
      S.teams.forEach(t=>{
        const inZone = CA.aliveUnitsOfTeam(t.id).filter(u=>Math.abs(u.x - z.cx) <= z.halfW).length;
        if (inZone > best){ best = inZone; bestTeam = t.id; tie = false; }
        else if (inZone === best && best > 0){ tie = true; }
      });
      if (bestTeam != null && best > 0 && !tie){
        md.score[bestTeam] = (md.score[bestTeam]||0) + 1;
        md.banner = { text: (CA.getTeam(bestTeam)||{}).name + ' +1', t: 110 };
        CA.events.emit('sfx', 'select');
      }
    },

    update(){ tickBanner(); },

    checkWin(){
      const md = S.modeData;
      if (!md.score) return undefined;
      // threshold win
      for (const t of S.teams){
        if ((md.score[t.id]||0) >= CA.Modes.koth.POINTS_TO_WIN) return t.id;
      }
      // also fall back to elimination so a wiped team still ends it.
      const alive = S.teams.filter(t=>CA.aliveUnitsOfTeam(t.id).length>0);
      if (alive.length === 1) return alive[0].id;
      if (alive.length === 0) return null;
      return undefined;
    },

    renderWorld(ctx){
      const z = CA.Modes.koth._zone();
      const C = CA.config;
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(z.x0, 0, z.x1 - z.x0, C.WATER_LEVEL);
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(z.x0, 0); ctx.lineTo(z.x0, C.WATER_LEVEL);
      ctx.moveTo(z.x1, 0); ctx.lineTo(z.x1, C.WATER_LEVEL);
      ctx.stroke();
      ctx.restore();
    },

    render(ctx){
      const md = S.modeData;
      const lines = ['👑 ' + CA.t('Király a hegyen') + ' (' + CA.t('cél') + ': ' + CA.Modes.koth.POINTS_TO_WIN + ')'];
      S.teams.forEach(t=> lines.push(t.name + ': ' + ((md.score && md.score[t.id])||0)));
      drawLabel(ctx, lines, 16, 64);
      drawBanner(ctx, md);
    },
  };

  /* ----------------------------------------------------------------------- *
   *  18. SNIPER — Mesterlövész. 2 teams, restricted to long-range precise
   *  weapons. We can't edit weapons.js, so we FORCE S.selectedWeapon to a
   *  sniper-ish weapon at each human turn and show the restriction. Quick.
   * ----------------------------------------------------------------------- */
  CA.Modes.sniper = {
    id: 'sniper',
    name: 'Mesterlövész',
    desc: 'Csak nagy hatótávú, precíz fegyverek. Egy lövés, egy találat!',
    ALLOWED: ['shotgun','laser','bazooka'],   // long-range / precise picks
    // Patthelyzet-óra: passzív AI esetén ne tartson örökké (UI rules felülír).
    rules: { suddenDeath: 240, waterRise: 14, sdToOneHp: true },

    setup(opts){
      opts = opts || {};
      if (Array.isArray(opts.teams) && opts.teams.length >= 2){
        return opts.teams.map((t,i)=>{ t=t||{}; if(t.color==null) t.color=COLORS[i%COLORS.length]; return t; });
      }
      return [
        { species:'capybara', name:'Lövészek', isAI:false, aiLevel:0, color:COLORS[0] },
        { species:safeSpecies('worm'), name:'Célpontok', isAI:true,
          aiLevel: opts.aiLevel != null ? opts.aiLevel : 1, color:COLORS[1] },
      ];
    },

    onGameStart(){
      S.modeData.banner = { text: '🎯 ' + CA.t('Mesterlövész'), t: 130 };
      // start everyone on the default sniper weapon.
      S.selectedWeapon = CA.Modes.sniper.ALLOWED[0];
    },

    // Force the selected weapon to a precise one at the start of each turn.
    onTurnStart(){
      const allowed = CA.Modes.sniper.ALLOWED;
      if (allowed.indexOf(S.selectedWeapon) < 0){
        S.selectedWeapon = allowed[0];
      }
      S.modeData.hint = { text: CA.t('Engedélyezett') + ': ' + allowed.join(' / '), t: 220 };
    },

    update(){
      tickBanner();
      const h = S.modeData.hint; if (h && h.t>0) h.t--;
      // keep nudging away from forbidden weapons mid-turn (best-effort; ui may switch).
      if (CA.Modes.sniper.ALLOWED.indexOf(S.selectedWeapon) < 0){
        S.selectedWeapon = CA.Modes.sniper.ALLOWED[0];
      }
    },

    render(ctx){
      drawBanner(ctx, S.modeData);
      const h = S.modeData.hint;
      if (h && h.t>0){
        ctx.save(); ctx.globalAlpha = Math.min(1, h.t/40);
        drawLabel(ctx, h.text, 16, 64);
        ctx.restore();
      } else {
        drawLabel(ctx, '🎯 ' + CA.t('Mesterlövész'), 16, 64);
      }
    },
    // No checkWin -> core's default elimination decides the winner.
  };

  /* ----------------------------------------------------------------------- *
   *  19. BOMBRUN — Bomba-futár. Carry the bomb to the enemy spawn region.
   *  Each team has a target zone = the enemy's starting side. The team's
   *  designated carrier (the unit nearest that side) scores by entering it.
   *  Simplest robust version: a team WINS when ANY of its alive units stands
   *  inside the opponent's target zone.
   * ----------------------------------------------------------------------- */
  CA.Modes.bombrun = {
    id: 'bombrun',
    name: 'Bomba-futár',
    desc: 'Juttasd el a bombát az ellenfél térfelére! Aki betör, nyer.',
    ZONE_W: 200,
    // Patthelyzet-óra: passzív AI esetén ne tartson örökké (UI rules felülír).
    rules: { suddenDeath: 240, waterRise: 14, sdToOneHp: true },

    setup(opts){
      opts = opts || {};
      if (Array.isArray(opts.teams) && opts.teams.length >= 2){
        return opts.teams.slice(0,2).map((t,i)=>{ t=t||{}; if(t.color==null) t.color=COLORS[i%COLORS.length]; return t; });
      }
      return [
        { species:'capybara', name:'Futárok', isAI:false, aiLevel:0, color:COLORS[0] },
        { species:safeSpecies('worm'), name:'Védők', isAI:true,
          aiLevel: opts.aiLevel != null ? opts.aiLevel : 1, color:COLORS[1] },
      ];
    },

    onGameStart(){
      const md = S.modeData;
      const C = CA.config, W = CA.Modes.bombrun.ZONE_W;
      // team[0] starts on the LEFT, its target is the RIGHT edge (enemy base).
      // team[1] starts on the RIGHT, its target is the LEFT edge.
      md.target = {};
      if (S.teams[0]) md.target[S.teams[0].id] = { x0: C.WORLD_W - W, x1: C.WORLD_W, side:'right' };
      if (S.teams[1]) md.target[S.teams[1].id] = { x0: 0, x1: W, side:'left' };
      md.banner = { text: '💣 ' + CA.t('Bomba-futár!'), t: 130 };
    },

    update(){ tickBanner(); },

    checkWin(){
      const md = S.modeData;
      if (!md.target) return undefined;
      for (const t of S.teams){
        const z = md.target[t.id];
        if (!z) continue;
        const reached = CA.aliveUnitsOfTeam(t.id).some(u=> u.x >= z.x0 && u.x <= z.x1);
        if (reached){ md.bombDelivered = t.id; return t.id; }
      }
      // elimination fallback (a team with no units can't deliver).
      const alive = S.teams.filter(t=>CA.aliveUnitsOfTeam(t.id).length>0);
      if (alive.length === 1) return alive[0].id;
      if (alive.length === 0) return null;
      return undefined;
    },

    renderWorld(ctx){
      const md = S.modeData;
      if (!md.target) return;
      const C = CA.config;
      ctx.save();
      S.teams.forEach(t=>{
        const z = md.target[t.id];
        if (!z) return;
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = t.color || '#ff5252';
        ctx.fillRect(z.x0, 0, z.x1 - z.x0, C.WATER_LEVEL);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = t.color || '#ff5252';
        ctx.font = 'bold 40px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎯', (z.x0+z.x1)/2, 80);
      });
      ctx.restore();
    },

    render(ctx){
      drawLabel(ctx, '💣 ' + CA.t('Vidd a bombát a 🎯 zónába!'), 16, 64);
      drawBanner(ctx, S.modeData);
    },
  };

  /* ----------------------------------------------------------------------- *
   *  20. COOP — Koop vs Gép. Two allied HUMAN teams vs one AI horde.
   *  Humans win when the AI is wiped; lose when all human units are gone.
   *  NOTE: core has no "alliance" concept, so humans can technically hit each
   *  other — but they share the win/lose condition and play together.
   * ----------------------------------------------------------------------- */
  CA.Modes.coop = {
    id: 'coop',
    name: 'Koop vs Gép',
    desc: 'Két emberi csapat együtt egy gép-horda ellen. Közös győzelem vagy bukás!',
    // Patthelyzet-óra: passzív AI esetén ne tartson örökké (UI rules felülír).
    rules: { suddenDeath: 240, waterRise: 14, sdToOneHp: true },

    setup(opts){
      opts = opts || {};
      const lvl = opts.aiLevel != null ? opts.aiLevel : 2;
      const aiHorde = { species:safeSpecies('worm'), name:'Gép-horda', isAI:true, aiLevel:lvl, color:COLORS[2] };
      // Honour the New Game roster for the HUMAN alliance side(s) if provided
      // (faj/kaszt/méret a New Game-ből); the AI horde stays a default opponent.
      if (Array.isArray(opts.teams) && opts.teams.length){
        const humans = opts.teams.map((t,i)=>{
          t = t || {};
          t.isAI = false; t.aiLevel = 0;                 // allied humans, hot-seat
          if (t.color == null) t.color = COLORS[i % COLORS.length];
          if (t.name == null) t.name = CA.t('Szövetség') + ' ' + (i+1);
          return t;
        });
        return humans.concat([aiHorde]);
      }
      return [
        { species:'capybara', name:'Szövetség 1', isAI:false, aiLevel:0, color:COLORS[0] },
        { species:safeSpecies('frog'), name:'Szövetség 2', isAI:false, aiLevel:0, color:COLORS[3] },
        aiHorde,
      ];
    },

    onGameStart(){
      const md = S.modeData;
      md.humanTeamIds = S.teams.filter(t=>!t.isAI).map(t=>t.id);
      md.aiTeamIds    = S.teams.filter(t=> t.isAI).map(t=>t.id);
      md.banner = { text: '🤝 ' + CA.t('Koop vs Gép'), t: 140 };
    },

    update(){ tickBanner(); },

    checkWin(){
      const md = S.modeData;
      if (!md.humanTeamIds) return undefined;
      const humansAlive = md.humanTeamIds.some(id=>CA.aliveHeroesOfTeam(id).length>0); // HEROES: a lone summoned minion is not "still playing"
      const aiAlive      = md.aiTeamIds.some(id=>CA.aliveUnitsOfTeam(id).length>0);
      if (!humansAlive) return (md.aiTeamIds[0] != null ? md.aiTeamIds[0] : null); // humans lost
      if (!aiAlive)     return md.humanTeamIds[0];                                  // humans won
      return undefined;
    },

    render(ctx){
      drawLabel(ctx, '🤝 ' + CA.t('Koop — verd szét a gép-hordát!'), 16, 64);
      drawBanner(ctx, S.modeData);
    },
  };

  /* ----------------------------------------------------------------------- *
   *  21. DAILY — Napi kihívás. Classic, but with a deterministic date seed so
   *  everyone gets the same map + wind today.
   * ----------------------------------------------------------------------- */
  CA.Modes.daily = {
    id: 'daily',
    name: 'Napi kihívás',
    desc: 'Mindennap ugyanaz a pálya és szél mindenkinek. Ma melyik a tiéd?',
    // Patthelyzet-óra: passzív AI esetén ne tartson örökké (UI rules felülír).
    rules: { suddenDeath: 240, waterRise: 14, sdToOneHp: true },
    // Weather pool a daily-determinizmushoz (a Weather.set ezeket fogadja el).
    WX: ['clear','rain','snow','fog','storm'],

    _dateSeed(){
      // YYYYMMDD as a deterministic seed — UTC, so "same map for everyone each
      // day" actually holds across timezones (challenge.js is UTC too).
      try {
        const d = new Date();
        return d.getUTCFullYear()*10000 + (d.getUTCMonth()+1)*100 + d.getUTCDate();
      } catch(e){ return 20260101; }
    },

    // Deterministic THEME for today's seed (sorted theme list -> stable across
    // clients regardless of object key order). Falls back to 'grass'.
    _seedTheme(seed){
      let themes = ['grass'];
      try {
        const list = (CA.Maps && CA.Maps.list) ? CA.Maps.list().slice() : [];
        const usable = list.filter(id => id && id !== 'random').sort();
        if (usable.length) themes = usable;
      } catch(e){}
      return themes[(seed >>> 0) % themes.length];
    },

    // Deterministic WEATHER for today's seed (offset so it's not always == theme idx).
    _seedWeather(seed){
      const wx = CA.Modes.daily.WX;
      return wx[((seed >>> 0) + 3) % wx.length];
    },

    setup(opts){
      opts = opts || {};
      // Inject the deterministic seed so terrain + (downstream) wind match for all.
      opts.seed = CA.Modes.daily._dateSeed();
      S.seed = opts.seed; // core reads opts.seed after setup, but be explicit/safe.
      // FORCE a seeded THEME + WEATHER so every player today gets the SAME map and
      // wx — the player's New Game theme/weather pick must NOT leak into a ranked
      // daily (fairness / leaderboard integrity). setup() runs after core set
      // S.theme/weather but BEFORE Terrain.generate, so overriding here takes hold.
      const seed = opts.seed;
      S.theme = CA.Modes.daily._seedTheme(seed);
      try { if (CA.Weather && CA.Weather.set) CA.Weather.set(CA.Modes.daily._seedWeather(seed)); } catch(e){}
      if (Array.isArray(opts.teams) && opts.teams.length >= 2) return opts.teams;
      return [
        { species:'capybara', name:'Te', isAI:false, aiLevel:0, color:COLORS[0] },
        { species:safeSpecies('worm'), name:'Napi ellenfél', isAI:true,
          aiLevel: opts.aiLevel != null ? opts.aiLevel : 1, color:COLORS[1] },
      ];
    },

    onGameStart(){
      S.modeData.seed = CA.Modes.daily._dateSeed();
      S.modeData.banner = { text: '📅 ' + CA.t('Napi kihívás'), t: 140 };
    },

    update(){ tickBanner(); },

    render(ctx){
      drawLabel(ctx, '📅 ' + CA.t('Napi') + ': #' + (S.modeData.seed || CA.Modes.daily._dateSeed()), 16, 64);
      drawBanner(ctx, S.modeData);
    },
    // No checkWin -> classic elimination.
  };

  /* ----------------------------------------------------------------------- *
   *  22. QUICK — Gyors meccs. Classic but FAST: fewer units + shorter timer.
   *  spawnTeams always makes TEAM_SIZE units, so we TRIM each team down to
   *  UNITS_PER_TEAM in onGameStart (remove extras), and shorten the turn timer.
   * ----------------------------------------------------------------------- */
  CA.Modes.quick = {
    id: 'quick',
    name: 'Gyors meccs',
    desc: 'Pörgős menet: 3 egység/csapat, rövid körök. Pár perc az egész!',
    UNITS_PER_TEAM: 3,
    TURN_TIME: 25,

    setup(opts){
      opts = opts || {};
      if (Array.isArray(opts.teams) && opts.teams.length >= 2) return opts.teams;
      return [
        { species:'capybara', name:'Kékek', isAI:false, aiLevel:0, color:COLORS[0] },
        { species:safeSpecies('worm'), name:'Pirosak', isAI:true,
          aiLevel: opts.aiLevel != null ? opts.aiLevel : 1, color:COLORS[1] },
      ];
    },

    onGameStart(){
      const keep = CA.Modes.quick.UNITS_PER_TEAM;
      // Trim each team to `keep` units: remove the extras from S.units + team.unitIds.
      S.teams.forEach(team=>{
        const mine = S.units.filter(u=>u.teamId===team.id);
        const extras = mine.slice(keep);
        extras.forEach(u=>{
          const i = S.units.indexOf(u); if (i>=0) S.units.splice(i,1);
          if (team.unitIds){ const j = team.unitIds.indexOf(u.id); if (j>=0) team.unitIds.splice(j,1); }
        });
      });
      // Make sure the active unit is still valid.
      if (!CA.getUnit(S.activeUnitId)){
        const first = S.units.find(u=>u.teamId === (S.teams[0]&&S.teams[0].id));
        if (first) S.activeUnitId = first.id;
      }
      // Shorter timer for this match.
      S.turnTimer = CA.Modes.quick.TURN_TIME;
      S.modeData.banner = { text: '⚡ ' + CA.t('Gyors meccs'), t: 120 };
    },

    // Keep enforcing the shorter cap when each turn (re)starts.
    onTurnStart(){ S.turnTimer = Math.min(S.turnTimer, CA.Modes.quick.TURN_TIME); },

    update(){ tickBanner(); },

    render(ctx){
      // no persistent top-left mode label — the centre banner already announces
      // the mode at the start (Jani: bal fentre ne írja ki a módot).
      drawBanner(ctx, S.modeData);
    },
    // No checkWin -> classic elimination.
  };

  /* ----------------------------------------------------------------------- *
   *  38. TUTORIAL — Oktató. 1 player unit + 1 dummy AI. Step hints teach
   *  movement, aiming, firing, weapon-switch. Win when the dummy is defeated.
   * ----------------------------------------------------------------------- */
  CA.Modes.tutorial = {
    id: 'tutorial',
    name: 'Oktató',
    desc: 'Vezetett gyakorlópálya: mozgás, célzás, tüzelés, fegyverváltás.',
    STEPS: [
      'Mozgás: A / D billentyűk vagy a ◀ ▶ gombok.',
      'Célzás: W / S vagy az egér mozgatása fel-le.',
      'Tüzelés: tartsd nyomva a SPACE-t (erő), majd engedd el!',
      'Fegyverváltás: Q / E vagy a fegyver-ikonokra kattintva.',
      'Győzz: lődd ki a bábut! 🎯',
    ],

    setup(opts){
      opts = opts || {};
      return [
        { species:'capybara', name:'Tanonc', isAI:false, aiLevel:0, color:COLORS[0] },
        // Dummy: AI level 0 so it barely acts; we also trim it to a single unit.
        { species:safeSpecies('worm'), name:'Bábu', isAI:true, aiLevel:0, color:COLORS[2] },
      ];
    },

    onGameStart(){
      const md = S.modeData;
      // Trim BOTH teams to a single unit (1 player, 1 dummy).
      S.teams.forEach((team, ti)=>{
        const mine = S.units.filter(u=>u.teamId===team.id);
        mine.slice(1).forEach(u=>{
          const i = S.units.indexOf(u); if (i>=0) S.units.splice(i,1);
          if (team.unitIds){ const j = team.unitIds.indexOf(u.id); if (j>=0) team.unitIds.splice(j,1); }
        });
      });
      if (!CA.getUnit(S.activeUnitId)){
        const first = S.units.find(u=>u.teamId === (S.teams[0]&&S.teams[0].id));
        if (first) S.activeUnitId = first.id;
      }
      md.playerTeamId = S.teams[0] && S.teams[0].id;
      md.dummyTeamId  = S.teams[1] && S.teams[1].id;
      md.step = 0;
      md.banner = { text: '🎓 ' + CA.t('Oktató'), t: 120 };

      // ---- ACTION-GATED progression ----
      // The tutorial advances on real ACTIONS, not turn count (turn-mashing must
      // not "complete" it). core.js emits these signals on a human turn:
      //   step 0 (move)          -> 'walked'
      //   step 1 (aim)           -> 'aimed'
      //   step 2 (fire)          -> 'fired'
      //   step 3 (switch weapon) -> 'weaponChanged' (or 'unitSwitched' as a guard)
      //   step 4 (win)           -> terminal (handled by checkWin)
      // Each handler only advances when the player is on the EXPECTED step, so
      // out-of-order actions are tolerated and never skip ahead.
      // Hook once PER SESSION (not per game): S.modeData resets to {} each game, so
      // an md-level flag would re-register these listeners on every tutorial start
      // and leak duplicates. A mode-object flag registers them exactly once; the
      // handlers read S.modeData/S.gameMode live, so they stay correct across games
      // (matches the campaign._dmgHooked pattern).
      if (!CA.Modes.tutorial._tutHooked){
        CA.Modes.tutorial._tutHooked = true;
        const advance = (fromStep)=>{
          const m = S.modeData;
          if (S.gameMode!=='tutorial' || !m) return;
          if ((m.step||0) === fromStep){
            m.step = Math.min(fromStep + 1, CA.Modes.tutorial.STEPS.length - 1);
            CA.events.emit('sfx','select');
          }
        };
        // hook the most plausible existing action signals (see core.emitActionSignals).
        CA.events.on('walked',        ()=> advance(0));
        CA.events.on('aimed',         ()=> advance(1));
        CA.events.on('fired',         (u)=>{ try{ if(u && S.modeData && u.teamId===S.modeData.playerTeamId) advance(2); }catch(e){ advance(2); } });
        // weapon switch: 'weaponChanged' is the precise signal; also accept a unit
        // swap as a near-equivalent "you changed your loadout" action (defensive).
        CA.events.on('weaponChanged', ()=> advance(3));
        CA.events.on('unitSwitched',  ()=> advance(3));
      }
    },

    update(){ tickBanner(); },

    checkWin(){
      const md = S.modeData;
      if (md.dummyTeamId == null) return undefined;
      if (!CA.aliveUnitsOfTeam(md.dummyTeamId).length) return md.playerTeamId; // taught + won
      if (!CA.aliveUnitsOfTeam(md.playerTeamId).length) return md.dummyTeamId; // (shouldn't happen)
      return undefined;
    },

    render(ctx){
      const md = S.modeData;
      const step = CA.t(CA.Modes.tutorial.STEPS[md.step||0] || '');
      ctx.save();
      // hint box across the top
      ctx.textAlign='center';
      const cx = (ctx.canvas.width||1280)/2;
      ctx.font='bold 22px system-ui, sans-serif';
      ctx.fillStyle='rgba(0,0,0,.55)';
      const pad=14, tw = ctx.measureText(step).width;
      ctx.fillRect(cx - tw/2 - pad, 14, tw + pad*2, 40);
      ctx.fillStyle='#fff';
      ctx.fillText(step, cx, 42);
      ctx.restore();
      drawLabel(ctx, '🎓 ' + CA.t('Oktató') + ' ' + ((md.step||0)+1) + '/' + CA.Modes.tutorial.STEPS.length, 16, 80);
      drawBanner(ctx, md);
    },
  };

  /* ======================================================================= *
   *  MICRO-MODES (golf / race / laststand). Small, data-driven, reuse the
   *  bombrun zone plumbing + survival waves. Selectable in the New Game picker.
   * ======================================================================= */

  /* ----------------------------------------------------------------------- *
   *  GOLF — fewest shots to land a unit in the 🏁 target zone. Reuses the
   *  bombrun-style "reach a zone" check + counts the player's shots ('fired').
   * ----------------------------------------------------------------------- */
  CA.Modes.golf = {
    id: 'golf',
    name: 'Golf',
    desc: 'Minél kevesebb lövésből juttasd az egységet a 🏁 zónába!',
    locked: true,
    ZONE_W: 180,
    // single player team is enough; an idle dummy keeps the turn manager happy.
    setup(opts){
      opts = opts || {};
      const player = (Array.isArray(opts.teams) && opts.teams[0]) || {
        species:'capybara', name:'Golfozó', isAI:false, aiLevel:0,
      };
      player.isAI = false; player.aiLevel = 0;
      return [ player,
        { species:safeSpecies('worm'), name:'Bábu', isAI:true, aiLevel:0, color:COLORS[2] } ];
    },
    onGameStart(){
      const md = S.modeData, C = CA.config, W = CA.Modes.golf.ZONE_W;
      md.playerTeamId = S.teams[0] && S.teams[0].id;
      // goal zone: the far RIGHT edge of the world (like bombrun's right target).
      md.goal = { x0: C.WORLD_W - W, x1: C.WORLD_W };
      md.shots = 0;
      md.banner = { text: '⛳ ' + CA.t('Golf'), t: 130 };
      // Hook once PER SESSION (mode-object flag, not md): S.modeData resets to {}
      // every game, so a md-level flag would re-register this listener each start
      // and leak duplicate handlers (matches campaign._dmgHooked).
      if (!CA.Modes.golf._golfHooked){
        CA.Modes.golf._golfHooked = true;
        CA.events.on('fired', (u)=>{ const m=S.modeData;
          if (S.gameMode==='golf' && m && u && u.teamId===m.playerTeamId) m.shots=(m.shots||0)+1; });
      }
    },
    update(){ tickBanner(); },
    checkWin(){
      const md = S.modeData;
      if (!md.goal) return undefined;
      const reached = CA.aliveUnitsOfTeam(md.playerTeamId)
        .some(u=> u.x >= md.goal.x0 && u.x <= md.goal.x1);
      if (reached){ md.goalReached = true; md.banner = { text: CA.t('Cél elérve!'), t: 140 }; return md.playerTeamId; }
      if (!CA.aliveUnitsOfTeam(md.playerTeamId).length) return null; // fell in / drowned
      return undefined;
    },
    renderWorld(ctx){
      const md = S.modeData; if (!md.goal) return; const C = CA.config;
      ctx.save();
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#ffd34d';
      ctx.fillRect(md.goal.x0, 0, md.goal.x1 - md.goal.x0, C.WATER_LEVEL);
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff';
      ctx.font = 'bold 40px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🏁', (md.goal.x0+md.goal.x1)/2, 80);
      ctx.restore();
    },
    render(ctx){
      const md = S.modeData;
      drawLabel(ctx, '⛳ ' + CA.t('Golf') + '  ' + (md.shots||0) + ' ' + CA.t('lövés'), 16, 64);
      drawBanner(ctx, md);
    },
  };

  /* ----------------------------------------------------------------------- *
   *  RACE — first unit to reach the 🏁 goal zone wins. Two teams race to the
   *  centre/right; reuses the bombrun zone-reach check.
   * ----------------------------------------------------------------------- */
  CA.Modes.race = {
    id: 'race',
    name: 'Verseny',
    desc: 'Versenyfutás: ki ér elsőként a 🏁 célzónába?',
    locked: true,
    ZONE_W: 160,
    setup(opts){
      opts = opts || {};
      if (Array.isArray(opts.teams) && opts.teams.length >= 2){
        return opts.teams.slice(0,2).map((t,i)=>{ t=t||{}; if(t.color==null) t.color=COLORS[i%COLORS.length]; return t; });
      }
      return [
        { species:'capybara', name:'Kék futó', isAI:false, aiLevel:0, color:COLORS[3] },
        { species:safeSpecies('worm'), name:'Piros futó', isAI:true,
          aiLevel: opts.aiLevel != null ? opts.aiLevel : 1, color:COLORS[2] },
      ];
    },
    onGameStart(){
      const md = S.modeData, C = CA.config, W = CA.Modes.race.ZONE_W;
      // a single shared goal zone in the centre of the map — first to it wins.
      md.goal = { x0: C.WORLD_W/2 - W/2, x1: C.WORLD_W/2 + W/2 };
      md.banner = { text: '🏁 ' + CA.t('Verseny'), t: 130 };
    },
    update(){ tickBanner(); },
    checkWin(){
      const md = S.modeData;
      if (!md.goal) return undefined;
      for (const t of S.teams){
        const inGoal = CA.aliveUnitsOfTeam(t.id).some(u=> u.x >= md.goal.x0 && u.x <= md.goal.x1);
        if (inGoal){ md.winner = t.id; md.banner = { text: CA.t('Befutott!'), t: 140 }; return t.id; }
      }
      const alive = S.teams.filter(t=>CA.aliveUnitsOfTeam(t.id).length>0);
      if (alive.length === 1) return alive[0].id;
      if (alive.length === 0) return null;
      return undefined;
    },
    renderWorld(ctx){
      const md = S.modeData; if (!md.goal) return; const C = CA.config;
      ctx.save();
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#9ad';
      ctx.fillRect(md.goal.x0, 0, md.goal.x1 - md.goal.x0, C.WATER_LEVEL);
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff';
      ctx.font = 'bold 40px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🏁', (md.goal.x0+md.goal.x1)/2, 80);
      ctx.restore();
    },
    render(ctx){
      drawLabel(ctx, '🏁 ' + CA.t('Verseny'), 16, 64);
      drawBanner(ctx, S.modeData);
    },
  };

  /* ----------------------------------------------------------------------- *
   *  LAST STAND — a SINGLE hero against escalating waves. Reuses the survival
   *  wave machinery but trims the player to one unit.
   * ----------------------------------------------------------------------- */
  CA.Modes.laststand = {
    id: 'laststand',
    name: 'Utolsó állás',
    desc: 'Egyetlen hős, egyre erősödő hullámok. Meddig állsz talpon?',
    locked: true,
    setup(opts){
      opts = opts || {};
      const player = (Array.isArray(opts.teams) && opts.teams[0]) || {
        species:'capybara', name:'A hős', isAI:false, aiLevel:0,
      };
      player.isAI = false; player.aiLevel = 0;
      return [ player,
        { species:safeSpecies('worm'), name:'Hullám 1', color:COLORS[1], isAI:true, aiLevel:1 } ];
    },
    onGameStart(){
      const md = S.modeData;
      // trim the player team to a SINGLE unit (the lone hero).
      const pTeam = S.teams[0];
      if (pTeam){
        const mine = S.units.filter(u=>u.teamId===pTeam.id);
        mine.slice(1).forEach(u=>{
          const i = S.units.indexOf(u); if (i>=0) S.units.splice(i,1);
          if (pTeam.unitIds){ const j = pTeam.unitIds.indexOf(u.id); if (j>=0) pTeam.unitIds.splice(j,1); }
        });
        if (!CA.getUnit(S.activeUnitId)){ const f=S.units.find(u=>u.teamId===pTeam.id); if(f) S.activeUnitId=f.id; }
      }
      md.wave = 1;
      md.playerTeamId = S.teams[0] && S.teams[0].id;
      md.enemyTeamId  = S.teams[1] && S.teams[1].id;
      md.banner = { text: CA.t('Hullám') + ' 1', t: 150 };
    },
    update(){ tickBanner(); },
    // identical wave-escalation to survival (one cleared -> spawn a tougher one).
    onTurnEnd(){
      const md = S.modeData;
      if (md.playerTeamId == null) return;
      if (!CA.aliveHeroesOfTeam(md.playerTeamId).length) return;     // player wiped (HEROES; a lone minion is not "alive") -> loss via checkWin
      if (CA.aliveHeroesOfTeam(md.enemyTeamId).length > 0) return;   // wave still alive (HEROES only; minions don't keep a wave alive)
      md.wave++;
      const w = md.wave;
      const team = spawnEnemyTeam({
        species: U.pick(SPECIES),
        name: CA.t('Hullám') + ' ' + w,
        aiLevel: Math.min(2, 1 + Math.floor(w/3)),
        hpScale: 1 + (w-1)*0.18,
      });
      if (team){
        md.enemyTeamId = team.id;
        md.banner = { text: CA.t('Hullám') + ' ' + w + '!', t: 150 };
        CA.events.emit('sfx', 'boom');
      }
    },
    checkWin(){
      const md = S.modeData;
      if (md.playerTeamId == null) return undefined;
      if (!CA.aliveHeroesOfTeam(md.playerTeamId).length){   // HEROES: a lone surviving minion is not "still playing"
        md.wavesSurvived = (md.wave||1) - 1;
        return md.enemyTeamId != null ? md.enemyTeamId : null;
      }
      return undefined;
    },
    render(ctx){
      const md = S.modeData;
      drawLabel(ctx, '🛡️ ' + CA.t('Utolsó állás') + ' — ' + CA.t('Hullám') + ' ' + (md.wave||1), 16, 64);
      drawBanner(ctx, md);
    },
  };

  /* ----------------------------------------------------------------------- *
   *  NEST DEFENSE — Védd a fészket. PvE: the player defends a stationary NEST
   *  (an objective point with HP, tracked purely in S.modeData — no new engine
   *  entity) against WAVES of AI worms. Each wave is bigger/tougher. Enemy units
   *  that get close to the nest chip its HP each frame; the player wins by
   *  clearing the FINAL wave, loses if the nest HP hits 0 or all heroes die.
   *  Reuses the survival wave machinery (spawnEnemyTeam) + the shared banner/HUD.
   * ----------------------------------------------------------------------- */
  CA.Modes.nest = {
    id: 'nest',
    name: 'Védd a fészket',
    desc: 'Védd meg a fészket 5 ellenséges hullámtól! Ha a fészek elpusztul, vége.',
    MAX_WAVES: 5,
    NEST_HP: 300,
    NEST_RADIUS: 46,        // visual + damage proximity radius
    NEST_DMG: 0.6,          // HP lost per enemy unit per frame while inside radius

    setup(opts){
      opts = opts || {};
      const player = (Array.isArray(opts.teams) && opts.teams[0]) || {
        species: 'capybara', name: 'Védők', isAI: false, aiLevel: 0,
      };
      player.isAI = false; player.aiLevel = 0;
      const enemy = {
        species: safeSpecies('worm'), name: CA.t('Hullám') + ' 1',
        color: COLORS[1], isAI: true, aiLevel: 1,
      };
      return [player, enemy];
    },

    onGameStart(){
      const md = S.modeData;
      const C = CA.config;
      md.wave = 1;
      md.maxWave = CA.Modes.nest.MAX_WAVES;
      md.playerTeamId = S.teams[0] && S.teams[0].id;
      md.enemyTeamId  = S.teams[1] && S.teams[1].id;
      md.nestHp = CA.Modes.nest.NEST_HP;
      md.nestMaxHp = CA.Modes.nest.NEST_HP;
      // Nest sits near the player's side: anchor it on the first alive player
      // unit's x (the team they must protect), clamped to the world; ground it
      // just above the water line. Defensive defaults if anything's missing.
      let nx = (C && C.WORLD_W ? C.WORLD_W * 0.18 : 200);
      try {
        const pu = CA.aliveUnitsOfTeam(md.playerTeamId);
        if (pu && pu.length){
          let sx = 0; pu.forEach(u=>{ sx += u.x; });
          nx = sx / pu.length;
        }
      } catch(e){}
      const wl = (C && C.WATER_LEVEL) ? C.WATER_LEVEL : 600;
      md.nest = { x: nx, y: wl - CA.Modes.nest.NEST_RADIUS - 10, r: CA.Modes.nest.NEST_RADIUS };
      md.banner = { text: '🪺 ' + CA.t('A fészek!'), t: 160 };
    },

    update(){
      tickBanner();
      const md = S.modeData;
      if (!md || !md.nest || md.nestHp == null) return;
      // Once the match is decided, stop chipping the nest — lingering enemy
      // minions must NOT steal a loss after the win/lose has been called.
      if (S.mode !== CA.GameState.PLAYING) return;
      // Enemy units standing near the nest chip its HP (the "reach it" loss path).
      if (md.enemyTeamId == null) return;
      let enemies;
      // HEROES only: summoned minions are transient and must not be able to
      // demolish the nest on a wave whose actual attackers (heroes) are already
      // cleared — that would flip a won match into a loss.
      try { enemies = CA.aliveHeroesOfTeam(md.enemyTeamId); } catch(e){ return; }
      if (!enemies || !enemies.length) return;
      const nx = md.nest.x, ny = md.nest.y, reach = md.nest.r + 30;
      let inRange = 0;
      enemies.forEach(u=>{
        const dx = u.x - nx, dy = u.y - ny;
        if (dx*dx + dy*dy <= reach*reach) inRange++;
      });
      if (inRange > 0){
        md.nestHp -= CA.Modes.nest.NEST_DMG * inRange;
        if (md.nestHp < 0) md.nestHp = 0;
      }
    },

    // After a settled turn: if the current wave is cleared and the nest still
    // stands, spawn the next (bigger/tougher) wave — until the final wave.
    onTurnEnd(){
      const md = S.modeData;
      if (md.playerTeamId == null || md.nestHp <= 0) return;
      if (!CA.aliveUnitsOfTeam(md.playerTeamId).length) return;       // wiped -> checkWin loss
      if (CA.aliveHeroesOfTeam(md.enemyTeamId).length > 0) return;    // wave still alive (HEROES only; minions don't keep a wave alive)
      if (md.wave >= md.maxWave) return;                              // final wave cleared -> checkWin win
      md.wave++;
      const w = md.wave;
      const team = spawnEnemyTeam({
        species: U.pick(SPECIES),
        name: CA.t('Hullám') + ' ' + w,
        aiLevel: Math.min(2, 1 + Math.floor(w/3)),
        // each wave a touch tougher; scales unit HP via spawnEnemyTeam.
        hpScale: 1 + (w-1)*0.12,
      });
      if (team){
        md.enemyTeamId = team.id;
        md.banner = { text: CA.t('Hullám') + ' ' + w + '/' + md.maxWave + '!', t: 150 };
        CA.events.emit('sfx', 'boom');
      }
    },

    // WIN: final wave cleared (nest survived). LOSE (return null): nest destroyed
    // or all heroes dead.
    checkWin(){
      const md = S.modeData;
      if (md.playerTeamId == null) return undefined;
      // nest destroyed -> loss (draw/over for the player).
      if (md.nestHp != null && md.nestHp <= 0){ md.nestDown = true; return null; }
      // all player heroes dead -> loss.
      if (!CA.aliveHeroesOfTeam(md.playerTeamId).length){
        md.wavesSurvived = (md.wave||1) - 1;
        return md.enemyTeamId != null ? md.enemyTeamId : null;
      }
      // final wave fully cleared AND nest alive -> win (HEROES only; lingering
      // minions must not block the win).
      if (md.wave >= md.maxWave && md.enemyTeamId != null &&
          !CA.aliveHeroesOfTeam(md.enemyTeamId).length){
        md.wavesSurvived = md.maxWave;
        return md.playerTeamId;
      }
      return undefined;
    },

    // Draw the nest in WORLD space (so it tracks the map/camera).
    renderWorld(ctx){
      const md = S.modeData;
      if (!md || !md.nest) return;
      const n = md.nest;
      ctx.save();
      // ground pad
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#8a5a2b';
      ctx.beginPath();
      ctx.ellipse(n.x, n.y + n.r*0.55, n.r*1.15, n.r*0.55, 0, 0, Math.PI*2);
      ctx.fill();
      // nest emoji (fallback to a simple shape if measureText/emoji unavailable)
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + Math.round(n.r*1.6) + 'px system-ui, sans-serif';
      try { ctx.fillText('🪺', n.x, n.y); }
      catch(e){ ctx.fillStyle = '#caa472'; ctx.beginPath(); ctx.arc(n.x, n.y, n.r*0.7, 0, Math.PI*2); ctx.fill(); }
      // HP bar above the nest
      const bw = n.r*2, bh = 8, bx = n.x - bw/2, by = n.y - n.r - 18;
      const frac = (md.nestMaxHp>0) ? U.clamp((md.nestHp||0)/md.nestMaxHp, 0, 1) : 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(bx-1, by-1, bw+2, bh+2);
      ctx.fillStyle = frac>0.5 ? '#5fd35f' : frac>0.25 ? '#e8c34d' : '#e85b5b';
      ctx.fillRect(bx, by, bw*frac, bh);
      ctx.restore();
    },

    // Screen-space HUD: wave counter + nest HP bar + new-wave banner.
    render(ctx){
      const md = S.modeData;
      const wv  = (md && md.wave) || 1;
      const mx  = (md && md.maxWave) || CA.Modes.nest.MAX_WAVES;
      const hp  = Math.max(0, Math.round((md && md.nestHp) || 0));
      const mhp = (md && md.nestMaxHp) || CA.Modes.nest.NEST_HP;
      drawLabel(ctx, [
        '🪺 ' + CA.t('Védd a fészket'),
        CA.t('Hullám') + ' ' + wv + '/' + mx,
        CA.t('Fészek') + ': ' + hp + '/' + mhp,
      ], 16, 64);
      // a slim nest HP bar under the label
      ctx.save();
      const bw = 200, bh = 12, bx = 16, by = 140;
      const frac = mhp>0 ? U.clamp(hp/mhp, 0, 1) : 0;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(bx-1, by-1, bw+2, bh+2);
      ctx.fillStyle = frac>0.5 ? '#5fd35f' : frac>0.25 ? '#e8c34d' : '#e85b5b';
      ctx.fillRect(bx, by, bw*frac, bh);
      ctx.restore();
      drawBanner(ctx, md);
    },
  };

  /* ======================================================================= *
   *  PvE BOSSES — data definitions. Each boss is a single oversized AI unit
   *  (CA.Entities.makeBoss scales HP + visual size + crown). `signature` is just
   *  a telegraph label + a weapon the AI is nudged toward; the AI fires it via
   *  the normal weapon dispatcher (no weapons.js edit needed).
   * ----------------------------------------------------------------------- */
  CA.Modes.BOSSES = {
    megaworm:    { id:'megaworm',    name:'Mega-Worm',      species:'worm',
                   hp:520, scale:2.3, color:'rgba(60,150,60,1)',
                   signature:{ weapon:'bazooka', label:'🪱 ' + 'Mega-Worm' } },
    barrelgolem: { id:'barrelgolem', name:'Hordó-Gólem',    species:'hedgehog',
                   hp:680, scale:2.5, color:'rgba(150,90,30,1)',
                   signature:{ weapon:'grenade', label:'🛢️ ' + 'Hordó-Gólem' } },
    necroqueen:  { id:'necroqueen',  name:'Necro-Királynő', species:'frog',
                   hp:600, scale:2.2, color:'rgba(120,40,170,1)',
                   signature:{ weapon:'bazooka', label:'👑 ' + 'Necro-Királynő' } },
  };
  const BOSS_ORDER = ['megaworm','barrelgolem','necroqueen'];

  // Spawn a boss as its own AI team (one giant unit). Returns the team or null.
  function spawnBossTeam(bossId, aiLevel){
    const def = CA.Modes.BOSSES[bossId] || CA.Modes.BOSSES.megaworm;
    const team = spawnEnemyTeam({
      species: def.species,
      name: CA.t(def.name),
      color: '#9b59b6',
      aiLevel: (aiLevel != null) ? aiLevel : 2,
      size: 1,                                   // a boss team is ONE giant unit
    });
    if (!team) return null;
    // safety net: if spawnTeams ignored size, trim to a single giant unit.
    const mine = CA.aliveUnitsOfTeam(team.id);
    mine.slice(1).forEach(u=>{
      const i = S.units.indexOf(u); if (i>=0) S.units.splice(i,1);
      if (team.unitIds){ const j = team.unitIds.indexOf(u.id); if (j>=0) team.unitIds.splice(j,1); }
    });
    const boss = CA.aliveUnitsOfTeam(team.id)[0];
    if (boss && CA.Entities && CA.Entities.makeBoss){
      CA.Entities.makeBoss(boss, def);
      // nudge the boss toward its signature weapon (AI reads S.selectedWeapon on its turn)
      boss._preferWeapon = def.signature && def.signature.weapon;
      // P4: stamp the signature so telegraphBoss can show the proper banner label
      // (it reads boss._bossSignature; without this it always fell back to "☠️ name").
      boss._bossSignature = def.signature;
    }
    team._boss = bossId;
    return team;
  }

  // Telegraph a boss's signature attack at the start of ITS turn (a fading banner
  // so the player can read/brace). The AI then fires through the normal dispatcher.
  function telegraphBoss(teamIdx){
    const team = S.teams[teamIdx];
    if (!team || !team.isAI) return;
    const boss = CA.aliveUnitsOfTeam(team.id).find(u=>u._boss);
    if (!boss) return;
    const sig = boss._bossSignature;
    const label = (sig && sig.label) ? sig.label : '☠️ ' + (boss.name||'');
    S.modeData.banner = { text: label + ' — ' + CA.t('Főnök közeleg!'), t: 130 };
    // best-effort: nudge the AI toward the boss's signature weapon for the turn.
    if (boss._preferWeapon) S.selectedWeapon = boss._preferWeapon;
    CA.events.emit('sfx','boom');
  }

  /* ======================================================================= *
   *  GAUNTLET — roguelite run. The player's team faces escalating AI waves.
   *  Between waves a 3-card DRAFT (menu-gauntlet.js) offers an upgrade. The run
   *  has a fixed length (RUN_WAVES); the FINAL wave is a BOSS. Death ends the
   *  run with a summary + a coin reward (CA.Meta.addCoins, guarded).
   *
   *  Pause model for the draft: when a wave is cleared mid-run we flip the engine
   *  into MENU mode + show the 'gauntlet' DOM screen (the sim freezes in step()).
   *  The draft screen calls CA.Modes.gauntlet.applyDraft(card) -> resume(), which
   *  spawns the next wave and hands the turn back to the player.
   * ----------------------------------------------------------------------- */

  // The draft pool. Each card: id, icon, name (HU key), desc (HU key), apply(md).
  // apply() mutates run state / the player's units. All effects are read by the
  // existing engine (maxHp/hp, _dmgMul, crate spawns, extra unit spawn).
  function playerUnits(md){ return md.playerTeamId!=null ? CA.aliveUnitsOfTeam(md.playerTeamId) : []; }

  const DRAFT_POOL = [
    { id:'maxhp',  icon:'❤️', name:'+25 max HP',     desc:'Minden egységed maximális életereje +25.',
      apply(md){ playerUnits(md).forEach(u=>{ u.maxHp += 25; u.hp += 25; }); md.perks.maxhp = (md.perks.maxhp||0)+1; } },
    { id:'heal',   icon:'➕', name:'Teljes gyógyulás', desc:'Az egész csapatod teljesen feltöltődik.',
      apply(md){ playerUnits(md).forEach(u=>{ u.hp = u.maxHp; }); } },
    { id:'damage', icon:'⚔️', name:'+15% sebzés',    desc:'A csapatod minden sebzése +15%.',
      apply(md){ playerUnits(md).forEach(u=>{ u._dmgMul = (u._dmgMul||1) * 1.15; }); md.perks.damage = (md.perks.damage||0)+1; } },
    { id:'shield', icon:'🛡️', name:'+20 pajzs',      desc:'Minden egységed +20 pajzsot kap.',
      apply(md){ playerUnits(md).forEach(u=>{ u.shield = (u.shield||0) + 20; u.shieldBase = (u.shieldBase||0) + 20; }); } },
    { id:'crate',  icon:'📦', name:'Extra láda',      desc:'Egy fegyverláda pottyan a pályára.',
      apply(md){ try{ if(CA.Weapons && CA.Weapons.spawnCrate){ CA.Weapons.spawnCrate(); CA.Weapons.spawnCrate(); } }catch(e){} } },
    { id:'recruit',icon:'🐹', name:'Új harcos',       desc:'Egy friss egység csatlakozik a csapatodhoz.',
      apply(md){ try{ CA.Modes.gauntlet._recruit(md); }catch(e){} } },
    { id:'crit',   icon:'💥', name:'Szerencse',       desc:'Nagyobb eséllyel viszel be kritikus találatot.',
      apply(md){ playerUnits(md).forEach(u=>{ u._critBonus = (u._critBonus||0) + 0.12; }); md.perks.crit=(md.perks.crit||0)+1; } },
  ];

  CA.Modes.gauntlet = {
    id: 'gauntlet',
    name: 'Gauntlet',
    desc: 'Roguelite menet: hullámról hullámra, közben válassz fejlesztést. A végén egy FŐNÖK!',
    RUN_WAVES: 6,            // total waves; the last is a boss
    DRAFT_POOL: DRAFT_POOL,

    setup(opts){
      opts = opts || {};
      const player = (Array.isArray(opts.teams) && opts.teams[0]) || {
        species:'capybara', name:'Bajnok', isAI:false, aiLevel:0,
      };
      player.isAI = false; player.aiLevel = 0;
      const enemy = {
        species: safeSpecies('worm'), name: CA.t('Hullám')+' 1',
        color: COLORS[1], isAI:true, aiLevel:1,
      };
      return [player, enemy];
    },

    onGameStart(){
      const md = S.modeData;
      md.wave = 1;
      md.maxWave = CA.Modes.gauntlet.RUN_WAVES;
      md.playerTeamId = S.teams[0] && S.teams[0].id;
      md.enemyTeamId  = S.teams[1] && S.teams[1].id;
      md.perks = {};
      md.runOver = false;
      md.awaitingDraft = false;
      md.coinsAwarded = 0;
      md.banner = { text: CA.t('Hullám')+' 1', t:150 };
      // light run-state persistence (current run only)
      try{ localStorage.setItem('ca_gauntlet', JSON.stringify({ wave:1, ts:Date.now() })); }catch(e){}
    },

    update(){ tickBanner(); },

    onTurnStart(teamIdx){ telegraphBoss(teamIdx); },

    // After each settled turn: if the wave is dead and the run continues, OFFER A
    // DRAFT (pause + DOM screen). The draft screen resumes the run.
    onTurnEnd(){
      const md = S.modeData;
      if (md.playerTeamId == null || md.runOver || md.awaitingDraft) return;
      if (!CA.aliveHeroesOfTeam(md.playerTeamId).length) return;       // wiped (HEROES; a lone minion is not "alive") -> checkWin handles loss
      if (CA.aliveHeroesOfTeam(md.enemyTeamId).length > 0) return;     // wave still alive (HEROES only; minions don't keep a wave alive)
      // wave cleared.
      if (md.wave >= md.maxWave){
        // beat the final (boss) wave -> run WON.
        md.runOver = true; md.runWon = true;
        CA.Modes.gauntlet._reward(md, true);
        return;                                                        // checkWin returns player -> win screen
      }
      // offer the between-wave draft.
      md.awaitingDraft = true;
      md.draftCards = CA.Modes.gauntlet._rollDraft();
      CA.events.emit('sfx','select');
      // freeze the sim + show the DOM draft screen.
      S.mode = CA.GameState.MENU;
      try{ if (CA.UI && CA.UI.setScreen) CA.UI.setScreen('gauntlet'); }catch(e){}
    },

    // Pick 3 distinct random draft cards.
    _rollDraft(){
      const pool = DRAFT_POOL.slice();
      const out = [];
      while (out.length < 3 && pool.length){
        const i = Math.floor(Math.random()*pool.length);
        out.push(pool.splice(i,1)[0]);
      }
      return out;
    },

    // Called by menu-gauntlet.js when the player clicks a card.
    applyDraft(cardId){
      const md = S.modeData;
      if (!md || !md.awaitingDraft) return;
      const card = (md.draftCards||[]).find(c=>c.id===cardId) || DRAFT_POOL.find(c=>c.id===cardId);
      if (card && typeof card.apply==='function'){ try{ card.apply(md); }catch(e){} }
      md.awaitingDraft = false;
      md.draftCards = null;
      CA.Modes.gauntlet._resume();
    },

    // Spawn the next wave (boss on the final one) + resume play on the player's turn.
    _resume(){
      const md = S.modeData;
      md.wave++;
      const w = md.wave;
      let team;
      if (w >= md.maxWave){
        // final wave = BOSS (cycle through the roster as the run gets longer).
        const bossId = BOSS_ORDER[(w-1) % BOSS_ORDER.length];
        team = spawnBossTeam(bossId, 2);
        md.banner = { text: '☠️ ' + CA.t('FŐNÖK') + '!', t:200 };
      } else {
        team = spawnEnemyTeam({
          species: U.pick(SPECIES),
          name: CA.t('Hullám')+' '+w,
          aiLevel: Math.min(2, 1 + Math.floor(w/3)),
          hpScale: 1 + (w-1)*0.18,
        });
        md.banner = { text: CA.t('Hullám')+' '+w+'!', t:150 };
      }
      if (team) md.enemyTeamId = team.id;
      try{ localStorage.setItem('ca_gauntlet', JSON.stringify({ wave:w, ts:Date.now() })); }catch(e){}
      // hand the turn back to the player and un-freeze.
      const pIdx = S.teams.findIndex(t=>t.id===md.playerTeamId);
      if (pIdx>=0) S.currentTeamIdx = pIdx;
      S.mode = CA.GameState.PLAYING;
      try{ if (CA.UI && CA.UI.setScreen) CA.UI.setScreen('main'); }catch(e){}
      CA.Modes.gauntlet._beginPlayerTurn();
      CA.events.emit('sfx','boom');
    },

    // Minimal "start the player's turn" (startTurn is private in core.js). Enough
    // to give control back: pick a live player unit, reset phase/timer/inputs.
    _beginPlayerTurn(){
      const md = S.modeData;
      const units = CA.aliveUnitsOfTeam(md.playerTeamId);
      if (!units.length) return;
      S.activeUnitId = units[0].id;
      S.phase = CA.TurnPhase.AIM;
      S.turnTimer = (S.rules && S.rules.turnTime>0) ? S.rules.turnTime : (CA.config.TURN_TIME||30);
      S.firedThisTurn = false; S.power = 0; S.charging = false;
      if (S.input){ S.input.left=S.input.right=S.input.up=S.input.down=false; }
      S._pendingNext = false; S._pendingFrames = 0;
      try{ CA.events.emit('turnStart', S.currentTeamIdx, units[0]); }catch(e){}
    },

    // Add one fresh player unit (the 'recruit' draft). Reuses spawnTeams on a
    // throwaway team object that points at the EXISTING player team id.
    _recruit(md){
      const pTeam = CA.getTeam(md.playerTeamId);
      if (!pTeam || !CA.Entities || !CA.Entities.spawnTeams) return;
      const before = CA.aliveUnitsOfTeam(pTeam.id).length;
      // a one-unit add: spawn onto the same team via a 1-size shim team.
      const shim = { id: pTeam.id, kind: pTeam.kind, species: pTeam.species||pTeam.kind,
                     color: pTeam.color, isAI:false, aiLevel:0, unitIds: pTeam.unitIds,
                     size:1, classes: pTeam.classes };
      try{ CA.Entities.spawnTeams([shim]); }catch(e){}
    },

    // Coin reward via the meta contract (guarded, read-only contract).
    _reward(md, won){
      if (md.coinsAwarded) return;
      const waves = (md.wave||1);
      const coins = waves*15 + (won?100:0);
      md.coinsAwarded = coins;
      try{ if (CA.Meta && CA.Meta.addCoins) CA.Meta.addCoins(coins, won?'gauntlet:win':'gauntlet:end'); }catch(e){}
    },

    checkWin(){
      const md = S.modeData;
      if (md.playerTeamId == null) return undefined;
      // while drafting the sim is frozen but checkWin may still be polled — keep playing.
      if (md.awaitingDraft) return undefined;
      if (!CA.aliveHeroesOfTeam(md.playerTeamId).length){   // HEROES: a lone surviving minion is not "still playing"
        md.wavesSurvived = (md.wave||1) - 1;
        CA.Modes.gauntlet._reward(md, false);
        return md.enemyTeamId != null ? md.enemyTeamId : null;       // loss
      }
      if (md.runOver && md.runWon) return md.playerTeamId;            // run complete -> win
      return undefined;
    },

    render(ctx){
      const md = S.modeData;
      const line = '🗡️ ' + CA.t('Gauntlet') + '  ' + CA.t('Hullám') + ' ' +
                   (md.wave||1) + '/' + (md.maxWave||CA.Modes.gauntlet.RUN_WAVES) +
                   (md.wave>=(md.maxWave||0) ? '  ☠️' : '');
      drawLabel(ctx, line, 16, 64);
      drawBanner(ctx, md);
    },
  };

  /* ----------------------------------------------------------------------- *
   *  BOSS RUSH — the three bosses in sequence, no waves in between. Reuses the
   *  gauntlet boss-spawn machinery. Win = beat all three; lose = player wiped.
   * ----------------------------------------------------------------------- */
  CA.Modes.bossrush = {
    id: 'bossrush',
    name: 'Bossrohamok',
    desc: 'Csak a főnökök: győzd le sorban mind a hármat!',
    setup(opts){
      opts = opts || {};
      const player = (Array.isArray(opts.teams) && opts.teams[0]) || {
        species:'capybara', name:'Kihívók', isAI:false, aiLevel:0,
      };
      player.isAI = false; player.aiLevel = 0;
      // first boss spawned in onGameStart (so makeBoss can run after spawn).
      return [player,
        { species:safeSpecies(CA.Modes.BOSSES[BOSS_ORDER[0]].species),
          name: CA.t(CA.Modes.BOSSES[BOSS_ORDER[0]].name), color:'#9b59b6', isAI:true, aiLevel:2 }];
    },
    onGameStart(){
      const md = S.modeData;
      md.playerTeamId = S.teams[0] && S.teams[0].id;
      md.bossIdx = 0;
      md.enemyTeamId = S.teams[1] && S.teams[1].id;
      // upgrade the auto-spawned enemy team's units into the first boss.
      const def = CA.Modes.BOSSES[BOSS_ORDER[0]];
      const mine = CA.aliveUnitsOfTeam(md.enemyTeamId);
      mine.slice(1).forEach(u=>{ const i=S.units.indexOf(u); if(i>=0) S.units.splice(i,1);
        const team=CA.getTeam(md.enemyTeamId); if(team&&team.unitIds){ const j=team.unitIds.indexOf(u.id); if(j>=0) team.unitIds.splice(j,1); } });
      const boss = CA.aliveUnitsOfTeam(md.enemyTeamId)[0];
      if (boss && CA.Entities && CA.Entities.makeBoss){ CA.Entities.makeBoss(boss, def); boss._preferWeapon = def.signature && def.signature.weapon; boss._bossSignature = def.signature; }
      md.banner = { text: '☠️ ' + CA.t(def.name), t:180 };
    },
    update(){ tickBanner(); },
    onTurnStart(teamIdx){ telegraphBoss(teamIdx); },
    onTurnEnd(){
      const md = S.modeData;
      if (md.playerTeamId == null) return;
      if (!CA.aliveHeroesOfTeam(md.playerTeamId).length) return;      // wiped (HEROES; a lone minion is not "alive") -> loss via checkWin
      if (CA.aliveHeroesOfTeam(md.enemyTeamId).length > 0) return;    // boss alive (HEROES only; summoned minions don't keep the boss "alive")
      // boss down -> next boss (if any).
      md.bossIdx++;
      if (md.bossIdx >= BOSS_ORDER.length) return;                    // all dead -> checkWin wins
      const bossId = BOSS_ORDER[md.bossIdx];
      const team = spawnBossTeam(bossId, 2);
      if (team){ md.enemyTeamId = team.id;
        md.banner = { text: '☠️ ' + CA.t(CA.Modes.BOSSES[bossId].name), t:180 };
        CA.events.emit('sfx','boom'); }
    },
    checkWin(){
      const md = S.modeData;
      if (md.playerTeamId == null) return undefined;
      if (!CA.aliveHeroesOfTeam(md.playerTeamId).length) return md.enemyTeamId!=null?md.enemyTeamId:null;   // HEROES: a lone surviving minion is not "still playing"
      if (md.bossIdx >= BOSS_ORDER.length){
        try{ if (CA.Meta && CA.Meta.addCoins) CA.Meta.addCoins(150, 'bossrush:win'); }catch(e){}
        return md.playerTeamId;
      }
      return undefined;
    },
    render(ctx){
      const md = S.modeData;
      drawLabel(ctx, '☠️ ' + CA.t('Bossrohamok') + '  ' + ((md.bossIdx||0)+1) + '/' + BOSS_ORDER.length, 16, 64);
      drawBanner(ctx, md);
    },
  };

  /* ----------------------------------------------------------------------- */
  CA.Modes.init = function(){
    // Restore campaign progress so the UI can show the unlocked level.
    try {
      const max = CA.Modes.campaign.levels.length;
      const done = localStorage.getItem('ca_campaign_done') === '1';
      const lv = parseInt(localStorage.getItem('ca_campaign'), 10);
      // a completed campaign has everything unlocked; otherwise show the stored level.
      if (done || (lv && !isNaN(lv) && lv > max)) CA.Modes.campaign._unlocked = max;
      else if (lv && !isNaN(lv)) CA.Modes.campaign._unlocked = U.clamp(lv,1,max);
      CA.Modes.campaign._done = done || (lv > max);
    } catch(e){}
  };
})();
