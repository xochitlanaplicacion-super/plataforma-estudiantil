/* ============================================================================
 * CUTE ANIMALS — core.js
 * Game loop, turn manager, camera, input router, win detection.
 * Owned by integrator. Calls module lifecycle hooks in a fixed order.
 * Each module is OPTIONAL at load time (stubs allowed) — guard every call.
 * ==========================================================================*/
(function(){
  const C = CA.config, S = CA.state, U = CA.util;
  let canvas, ctx, lastT = 0, acc = 0;
  const STEP = 1000 / 60;
  const nowMs = ()=> (window.performance && performance.now) ? performance.now() : Date.now();

  // ---- deterministic wind (QA3 [P2]) -------------------------------------
  // Daily/Duel maps are seeded (terrain + spawns), but the wind used to come
  // from Math.random() → two players on the same daily seed got DIFFERENT wind,
  // breaking "same map for everyone" + fair leaderboard comparison. windRand()
  // derives a value in [0,1) purely from (seed, step) via a mulberry32 mix, so
  // the wind sequence is a pure function of the match seed + the turn index.
  function windRand(seed, step){
    let a = (((seed>>>0) ^ Math.imul((step|0)+1, 0x9E3779B1)) >>> 0) || 1;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // a monotonic, REPLAY-DETERMINISTIC turn index: same on every client that
  // reaches the same (round, team) state — no wall-clock / RNG dependence.
  function windStep(){
    return (S.round|0) * ((S.numTeams|0)||1) + (S.currentTeamIdx|0);
  }

  // ---- HUD layout helpers (mirror ui.js so core-drawn HUD bits line up) -------
  // ui.js owns metrics()/safeAreaTopCss() as module-privates (not on CA.UI), so
  // we replicate the same math here for the few HUD elements core draws itself
  // (e.g. the sudden-death indicator). Keep these in sync with ui.js.
  let _sdSafeTopCss = -1;                     // -1 = not measured yet (cached)
  function hudSafeAreaTopCss(){
    if (_sdSafeTopCss >= 0) return _sdSafeTopCss;
    let px = 0;
    try {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;'+
        'padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;';
      document.body.appendChild(probe);
      px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      document.body.removeChild(probe);
    } catch(_) { px = 0; }
    _sdSafeTopCss = (isFinite(px) && px > 0) ? px : 0;
    return _sdSafeTopCss;
  }
  // dpr + ui scale, derived the same way ui.js metrics() does (backing px / CSS px,
  // clamped). Used to size + place core-drawn HUD consistently across devices.
  function hudMetrics(){
    const VW = C.VIEW_W, VH = C.VIEW_H;
    const cv = canvas || CA.canvas;
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

  function call(mod, fn, ...a){
    if (CA[mod] && typeof CA[mod][fn]==='function'){
      // defense-in-depth: a throw inside one module's render/update must NOT kill
      // the whole frame loop (a single bad UI render once trapped the player on a
      // dead Settings screen). Log it (the on-screen 🐛 console captures it) and
      // keep the loop alive.
      try { return CA[mod][fn](...a); }
      catch(e){ try{ console.error('['+mod+'.'+fn+']', (e&&e.message)||e); }catch(_){} }
    }
  }

  // EN strings for the turn-manager status-effect toasts (stun skip + crumbling
  // ledges). HU keys are the canonical strings; CA.t() resolves them at emit time.
  try { if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'szédül!':'is dizzy!',
    'Omladozó párkány!':'Crumbling ledge!',
    'Recseg a párkány…':'The ledge is creaking…',
    // ---- first-run onboarding coachmark ----
    '👋 Új vagy? Próbáld ki a 30 mp-es gyakorlót!':'👋 New here? Try the 30-second practice!',
    '▶ Tutorial':'▶ Tutorial',
    'Később':'Later',
  }); } catch(e){}

  /* ---------- Responsive sizing ---------- *
   * The canvas backing resolution tracks the window so the game fills the
   * whole screen (true fullscreen feel on PC, edge-to-edge on mobile). All HUD
   * rects are rebuilt every frame from C.VIEW_W/VIEW_H, so resizing is safe.
   * Capped below the world size so the camera never reveals past the map.   */
  function resize(){
    if (!canvas) return;
    // Backing resolution = CSS size × devicePixelRatio (capped). Using a HIGH
    // backing res makes fixed-px HUD elements proportionally SMALLER on phones
    // (fixes "everything too big/zoomed"), shows MORE of the world, is crisp on
    // retina, AND — because backing aspect == window aspect — the canvas FILLS
    // the window with NO stretch and NO black bars on desktop.
    // Size to the #game-wrap CONTENT box (it's padded by the safe-area insets),
    // NOT the full window. Sizing to window.inner* made the canvas larger than its
    // padded parent → it overflowed symmetrically and shifted toward the non-notch
    // side in landscape, pushing edge HUD / touch-buttons under the notch / off the
    // opposite edge on notched iPhones. clientWidth/Height excludes the padding.
    const _wrap = canvas.parentElement;
    // CLAMP to the actually-VISIBLE viewport. In an installed PWA (standalone,
    // viewport-fit=cover) the #game-wrap content box can be TALLER than the visible
    // area → the canvas overflowed, pushing the top HUD above the screen and the
    // touch controls below it ("can't see anything in the app"). visualViewport is
    // the true visible rect; never let the canvas exceed it. (#pwa-overflow)
    const _vv = (typeof window!=='undefined') ? window.visualViewport : null;
    const vpW = (_vv && _vv.width)  || window.innerWidth  || 320;
    const vpH = (_vv && _vv.height) || window.innerHeight || 240;
    const cssW = Math.max(320, Math.min(((_wrap && _wrap.clientWidth)  || vpW), vpW));
    const cssH = Math.max(240, Math.min(((_wrap && _wrap.clientHeight) || vpH), vpH));
    // Backing-resolution cap TIED TO THE QUALITY SETTING (Jani): the HUD/text is
    // canvas-drawn, so the backing res = how crisp it looks vs. fill-rate cost.
    //   HIGH   → ~native retina (sharp HUD)      dpr≤2.5 / ≤3000px
    //   NORMAL → balanced                        dpr≤2.0 / ≤2200px
    //   LOW    → fast (fewer pixels)             dpr≤1.4 / ≤1400px
    // The player trades sharpness for performance in Settings; PerfTier also
    // auto-picks a tier on first run and trims FX if FPS dips.
    var _q = (CA.settings && CA.settings.quality) || 'normal';
    var _dprCap = _q==='high' ? 2.5 : _q==='low' ? 1.4 : 2.0;
    var _maxW   = _q==='high' ? 3000 : _q==='low' ? 1400 : 2200;
    let dpr = Math.min(window.devicePixelRatio || 1, _dprCap);
    const MAXW = _maxW;
    if (cssW * dpr > MAXW) dpr = MAXW / cssW;
    C.VIEW_W = Math.round(cssW * dpr);
    C.VIEW_H = Math.round(cssH * dpr);
    canvas.width = C.VIEW_W; canvas.height = C.VIEW_H;
    canvas.style.width  = cssW + 'px';   // display fills the window (aspect matches backing)
    canvas.style.height = cssH + 'px';
    S.camera.zoom = clampZoom(playZoom() * (S.camera.userZoom||1));
    clampCamera();
    // optional WebGL post-processing layer: keep its framebuffer in sync with the
    // backing resolution. No-op (and never throws) when the module isn't loaded.
    try{ if (CA.PostFX && CA.PostFX.resize) CA.PostFX.resize(canvas.width, canvas.height, dpr); }catch(e){}
  }
  CA.resize = resize;

  /* Landscape-only on phones: TRUE while a touch device is in PORTRAIT (the
   * rotate-hint is up). Matches the CSS gate "(orientation:portrait) and
   * (max-width:920px)". Used to NOT start/run a live match until landscape. */
  function orientationBlocked(){
    try {
      var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints>0);
      if (!touch) return false;
      return (window.innerHeight > window.innerWidth) &&
             Math.min(window.innerWidth, window.innerHeight) <= 920;
    } catch(e){ return false; }
  }
  CA.orientationBlocked = orientationBlocked;

  /* ---------- Camera zoom model (Worms-style) ----------
   * Normal play is zoomed IN on the active unit (units are a nice big size —
   * PLAY_VIEW_H world px shown vertically). The moment a shot is in the air the
   * camera smoothly zooms OUT to follow the projectile (so you see the whole
   * arc), then zooms back in. userZoom (mouse wheel / +- on PC) is a manual
   * multiplier on the play zoom. We never reveal past the world's left/right
   * edges. The cave shows sky because the unit-centered view + the map's top
   * headroom keep the ceiling/air on screen.                                    */
  const ZOOM_MIN = 0.85, ZOOM_MAX = 1.9;        // manual multiplier range
  const SKY_HEADROOM = -360;                     // how far ABOVE the world top the camera may pan
  const PLAY_VIEW_H = 720;                       // world px shown vertically (moderate, stable)
  function widthFloorZoom(){ return C.VIEW_W / C.WORLD_W; }            // never show beyond width
  function playZoom(){ return Math.max(C.VIEW_H / PLAY_VIEW_H, widthFloorZoom()); }
  function fitZoom(){ return Math.max(C.VIEW_H / C.WORLD_H, widthFloorZoom()); } // whole height
  // Never reveal past the world bounds. Shot zoom is presentation only: it
  // cannot change the simulation, the player's manual zoom or an aiming angle.
  function clampZoom(z){ return U.clamp(z, fitZoom(), playZoom()*ZOOM_MAX); }
  function targetZoom(){
    const base = playZoom() * (S.camera.userZoom||1);
    const shot = S._shotCamera;
    const ratio = shot && !(CA.settings && CA.settings.reducedMotion)
      ? (shot.zoomRatio || 1) : 1;
    return clampZoom(base * ratio);
  }
  // world px currently visible
  function viewW(){ return C.VIEW_W / S.camera.zoom; }
  function viewH(){ return C.VIEW_H / S.camera.zoom; }
  // dynamic top floor: normally 0, but when something we're watching is shoved
  // ABOVE the world top (y<0) let the camera pan up into the virtual sky so the
  // unit/projectile stays visible instead of being clamped off-screen.
  function camTopFloor(){
    try {
      // MARGIN (not strictly y<0): grant the sky headroom as soon as something we
      // watch climbs NEAR the world top, not exactly at it. Without the margin a
      // unit hovering around y≈0 (e.g. a GLIDING bat) flipped y<0 true/false every
      // frame → camTopFloor toggled 0↔headroom → the camera jittered and the unit
      // "disappeared/reappeared" at the top edge (Jani: denevér repülés-glitch).
      // The margin keeps the headroom engaged across the boundary so the camera
      // follows the flyer up smoothly.
      if (S.projectiles && S.projectiles.some(p=>p.alive && p.y<120)) return SKY_HEADROOM;
      const u = CA.activeUnit && CA.activeUnit();
      if (u && u.alive && u.y<120) return SKY_HEADROOM;
      const watched = S._shotCamera && CA.getUnit(S._shotCamera.unitId);
      if (watched && watched.y<120) return SKY_HEADROOM;
    } catch(_e){}
    return 0;
  }
  function clampCamera(){
    const mx = Math.max(0, C.WORLD_W - viewW());
    const my = Math.max(0, C.WORLD_H - viewH());
    const topY = Math.min(0, camTopFloor());   // <=0 (never positive)
    S.camera.x = U.clamp(S.camera.x, 0, mx);
    S.camera.y = U.clamp(S.camera.y, topY, my);
    S.camera.targetX = U.clamp(S.camera.targetX, 0, mx);
    S.camera.targetY = U.clamp(S.camera.targetY, topY, my);
  }
  /* PC: wheel zoom toward a screen point (cursor) keeping that world point fixed.
   * Only active when not currently auto-zoomed-out for a live shot.            */
  CA.zoomBy = function(factor, screenX, screenY){
    if (S.projectiles.some(p=>p.alive && !p._noFollow) || S._shotCamera) return;
    const before = (screenX!=null) ? CA.screenToWorld(screenX, screenY) : null;
    S.camera.userZoom = U.clamp((S.camera.userZoom||1) * factor, ZOOM_MIN, ZOOM_MAX);
    S.camera.zoom = clampZoom(playZoom() * S.camera.userZoom);
    if (before){
      S.camera.x = before.x - screenX / S.camera.zoom;
      S.camera.y = before.y - screenY / S.camera.zoom;
    }
    clampCamera();
    S.camera.targetX = S.camera.x; S.camera.targetY = S.camera.y;
  };
  CA.resetZoom = function(){ S.camera.userZoom = 1; };

  /* Enter OS/browser fullscreen — only meaningful on desktop; safe no-op on
   * touch devices and when already fullscreen. Must be called from a gesture. */
  CA.enterFullscreen = function(){
    try {
      if (document.fullscreenElement) return;
      const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      if (isTouch) return; // phones already fill the screen; don't force it
      const el = document.getElementById('game-wrap') || document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(()=>{});
    } catch(e){}
  };
  CA.toggleFullscreen = function(){
    try {
      if (document.fullscreenElement){ document.exitFullscreen && document.exitFullscreen(); }
      else { const el=document.getElementById('game-wrap')||document.documentElement; el.requestFullscreen && el.requestFullscreen().catch(()=>{}); }
    } catch(e){}
  };

  /* ---------- Boot ---------- */
  CA.boot = function(canvasEl){
    canvas = canvasEl;
    ctx = canvasEl.getContext('2d');
    CA.ctx = ctx; CA.canvas = canvas;
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', resize);
    // standalone PWA: the visible viewport settles late + changes on rotate/chrome
    // show-hide → re-measure on those events and a couple of delayed passes.
    try { window.addEventListener('orientationchange', function(){ setTimeout(resize, 60); setTimeout(resize, 350); }); } catch(e){}
    try { if (window.visualViewport){ window.visualViewport.addEventListener('resize', resize); window.visualViewport.addEventListener('scroll', resize); } } catch(e){}
    setTimeout(resize, 250); setTimeout(resize, 800);   // catch late standalone layout
    bindInput();
    // module inits (v2 modules are optional/guarded — order: data first)
    ['Maps','Species','Weather','Terrain','Entities','Weapons','Hazards','FX','Modes','Meta','Screens','UI','Armory','AI']
      .forEach(m=>call(m,'init',ctx));
    // web-portal (Poki / CrazyGames) lifecycle+ad layer. NO-OP (and loads no SDK)
    // unless a portal context is detected — the main web/Electron build is untouched.
    try { if (CA.Portal && CA.Portal.init) CA.Portal.init(); } catch(e){}
    // optional perf auto-tier: pick a sensible DEFAULT quality on first run only.
    // PerfTier.applyDefault() itself no-ops when the user has chosen a quality, so
    // an explicit setting is never overridden. No-op when the module isn't loaded.
    try { if (CA.PerfTier && CA.PerfTier.applyDefault) CA.PerfTier.applyDefault(); } catch(e){}
    // optional WebGL post-processing layer (bloom/shockwave). init() is cheap +
    // guarded; .apply() is only invoked later on the 'high' tier (see render()).
    try { if (CA.PostFX && CA.PostFX.init) CA.PostFX.init(canvas); } catch(e){}
    requestAnimationFrame(loop);
    // First-run onboarding coachmark DISABLED (Jani 2026-06-10: "az Új vagy? tutorial
    // ne legyen"). The maybeOnboard()/showOnboardPrompt() helpers stay defined but
    // are no longer invoked, so no first-run tutorial prompt ever appears.
    // try { maybeOnboard(); } catch(e){}
  };

  /* ---------- First-run onboarding coachmark ----------
   * On the very first launch only, show a dismissible prompt on the menu steering
   * the player into the 30s tutorial. Never blocks the menu, fires exactly once
   * (localStorage 'ca_onboarded'), and degrades silently if anything is missing.
   * Skipped in the demo build and on deep-link/duel/?intro launches (the player
   * arrived with intent — don't interrupt).                                      */
  const ONBOARD_KEY = 'ca_onboarded';
  function maybeOnboard(){
    // already shown / never nag again
    try { if (localStorage.getItem(ONBOARD_KEY)) return; } catch(e){ return; }
    // respect the demo build — don't force tutorial there
    try { if (CA.DEMO) return; } catch(e){}
    // skip deep-links / duels / the cinematic test switch (arrived with intent)
    try {
      var q = (typeof location!=='undefined' && location.search) || '';
      if (/[?&](intro|duel|room|seed|puzzle|daily|challenge|portal)\b/.test(q)) return;
    } catch(e){}
    // need the menu DOM + the tutorial mode to exist, or there's nothing to offer
    try { if (!(CA.Modes && CA.Modes.tutorial && typeof CA.newGame === 'function')) return; } catch(e){ return; }

    // Poll for the menu to actually be visible (boot reveals it AFTER the splash +
    // optional intro), then show the coachmark. Bounded so it can't poll forever.
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      var shown = false;
      try {
        var root = (typeof document!=='undefined') ? document.getElementById('menu-root') : null;
        var inMenu = (S && CA.GameState && S.mode === CA.GameState.MENU);
        if (root && root.classList && root.classList.contains('show') && inMenu){
          shown = showOnboardPrompt();
        }
      } catch(e){ shown = false; }
      if (shown || tries > 60){ clearInterval(iv); }   // ~12s cap @ 200ms
    }, 200);
  }

  function showOnboardPrompt(){
    var T = (CA.t) ? CA.t : function(s){ return s; };
    try {
      // mark as shown immediately so it never nags again (even if the player ignores it)
      try { localStorage.setItem(ONBOARD_KEY, '1'); } catch(e){}

      var host = document.getElementById('menu-root') || document.body;
      var card = document.createElement('div');
      card.id = 'ca-onboard';
      card.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:10000;'+
        'max-width:min(92vw,420px);background:#fff;color:#3D2800;border-radius:14px;'+
        'box-shadow:0 8px 30px rgba(0,0,0,0.28);padding:14px 16px;'+
        'font-family:"Baloo 2",system-ui,sans-serif;text-align:center;border:2px solid #E8711A;';

      var msg = document.createElement('div');
      msg.style.cssText = 'font-weight:700;font-size:15px;line-height:1.35;margin-bottom:10px;';
      msg.textContent = T('👋 Új vagy? Próbáld ki a 30 mp-es gyakorlót!');

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:center;';

      function close(){ try { if (card && card.parentNode) card.parentNode.removeChild(card); } catch(e){} }

      var go = document.createElement('button');
      go.textContent = T('▶ Tutorial');
      go.style.cssText = 'flex:1;padding:9px 12px;border:0;border-radius:10px;cursor:pointer;'+
        'background:#E8711A;color:#fff;font-weight:800;font-size:14px;font-family:inherit;';
      go.onclick = function(){
        close();
        // mirror menu-help.js's tutorial CTA exactly (mode.setup builds teams/theme)
        try { if (typeof CA.newGame === 'function') CA.newGame({ gameMode:'tutorial' }); } catch(e){}
      };

      var later = document.createElement('button');
      later.textContent = T('Később');
      later.style.cssText = 'padding:9px 14px;border:1px solid #d9c9b0;border-radius:10px;cursor:pointer;'+
        'background:#f5efe6;color:#3D2800;font-weight:700;font-size:14px;font-family:inherit;';
      later.onclick = close;

      row.appendChild(go); row.appendChild(later);
      card.appendChild(msg); card.appendChild(row);
      host.appendChild(card);
      return true;
    } catch(e){ return true; }   // marked shown already; never retry on error
  }

  /* ---------- New game ----------
   * opts:
   *   teams: [ { kind|species, name, color, isAI, aiLevel } ... ]  // N teams (FFA-ready)
   *   vsAI, aiLevel, teamNames:{capybara,worm}  // legacy 2-team shorthand (classic)
   *   theme:'grass'|... , gameMode:'classic'|... , weather:'clear'|... , risingWater:bool
   * A game mode (CA.Modes[gameMode].setup) may override the team configs.        */
  const TEAM_COLORS = ['#caa472','#7fc97f','#d98f8f','#8fb6d9','#c9b06b','#b69fd9'];
  // ---- colorblind-safe team palettes (idea: review "törött accessibility-ígéret") --
  // The default palette leans on red(#d98f8f)/green(#7fc97f) which collapse under
  // red-green CVD. When CA.settings.colorblind != 'off' we swap in an Okabe-Ito
  // derived palette ordered so the first two teams (the common 1v1) stay maximally
  // separable for that specific deficiency.
  const CB_PALETTES = {
    // deuteranopia + protanopia (red-green): rely on orange vs blue vs yellow
    deuter: ['#e69f00','#56b4e9','#f0e442','#0072b2','#cc79a7','#999999'],
    protan: ['#e69f00','#56b4e9','#f0e442','#0072b2','#cc79a7','#999999'],
    // tritanopia (blue-yellow): rely on red/pink vs cyan vs green, avoid blue+yellow adjacency
    tritan: ['#d55e00','#56b4e9','#009e73','#cc79a7','#e69f00','#999999'],
  };
  function teamPalette(){
    const cb = (CA.settings && CA.settings.colorblind) || 'off';
    return (cb !== 'off' && CB_PALETTES[cb]) ? CB_PALETTES[cb] : TEAM_COLORS;
  }

  /* ---------- Custom rule-set (New Game "Egyedi szabályok") ----------
   * A normalized, fully-defaulted rules object. Every knob is OPTIONAL — an
   * absent value falls back to the engine default so a vanilla game is unchanged.
   * Read by newGame + the turn manager. opts.rules wins over a mode's own
   * mode.rules defaults (merged underneath).                                     */
  const DEFAULT_RULES = {
    startHp: 0,          // 0 = use the unit/species default maxHp
    turnTime: 0,         // 0 = config.TURN_TIME
    retreatTime: 0,      // 0 = config.RETREAT_TIME
    wind: true,          // wind on/off
    windStrength: 1,     // multiplier on wind magnitude
    suddenDeath: 0,      // seconds of play before escalation; 0 = off
    waterRise: 0,        // px the water surface climbs each round once SD is active (0 = HP-cap only path uses default)
    sdToOneHp: true,     // when SD triggers, cap every unit to 1 HP (Worms-style)
    weaponSet: 'all',    // 'all'|'melee'|'explosive'|'crate'|'<weaponId>' (single-weapon lock)
  };
  function normalizeRules(rules, modeRules){
    const out = {};
    for (const k in DEFAULT_RULES) out[k] = DEFAULT_RULES[k];
    // mode defaults first (so the UI / explicit opts override them)
    if (modeRules) for (const k in modeRules){ if (modeRules[k] != null) out[k] = modeRules[k]; }
    if (rules)     for (const k in rules)    { if (rules[k]    != null) out[k] = rules[k];    }
    // sanity clamps
    out.startHp     = U.clamp(out.startHp|0, 0, 999);
    out.turnTime    = U.clamp(out.turnTime|0, 0, 300);
    out.retreatTime = U.clamp(out.retreatTime|0, 0, 60);
    out.windStrength= U.clamp(+out.windStrength || 1, 0, 3);
    out.suddenDeath = U.clamp(out.suddenDeath|0, 0, 3600);
    out.waterRise   = U.clamp(out.waterRise|0, 0, 200);
    out.wind        = !!out.wind;
    out.sdToOneHp   = !!out.sdToOneHp;
    if (typeof out.weaponSet !== 'string' || !out.weaponSet) out.weaponSet = 'all';
    return out;
  }
  CA.normalizeRules = normalizeRules;
  // the active mode object during newGame (before S.gameMode-driven helpers run).
  function mode0(){ return CA.Modes && CA.Modes[S.gameMode]; }

  /* ---------- Weapon-set restriction (reusable sniper-style lock) ----------
   * Generalizes the old sniper ALLOWED list. Reads S.rules.weaponSet. A weapon
   * is allowed unless the active rule excludes it. Utilities/abilities/support
   * are ALWAYS allowed (you must be able to reposition/heal); the restriction
   * only constrains DAMAGING shots so a turn is never soft-locked.              */
  function weaponCategory(wid){
    const L = (CA.Weapons && CA.Weapons.LIST) || [];
    const w = L.find(x=>x.id===wid);
    return w ? (w.category||'') : '';
  }
  CA.weaponAllowed = function(wid){
    const set = (S.rules && S.rules.weaponSet) || 'all';
    if (set === 'all') return true;
    if (!wid) return true;
    // always allow pure reposition utilities + non-damaging support abilities
    if (CA.isReusableUtil && CA.isReusableUtil(wid)) return true;
    const L = (CA.Weapons && CA.Weapons.LIST) || [];
    const w = L.find(x=>x.id===wid);
    if (w && w.category==='utility') return true;
    if (w && w.ability && !(w.power || w.damage>0)) return true; // support abilities
    const cat = w ? (w.category||'') : '';
    if (set === 'melee')     return wid==='melee' || wid==='bat' || cat==='special' && (wid==='chargehog'||wid==='spikeball');
    if (set === 'explosive') return cat==='projectile' || cat==='throwable' || wid==='dynamite' || wid==='capybomb';
    // crate-only: a base-kit fegyverek tiltottak, de a LÁDÁBÓL felvett fegyverek
    // engedélyezettek — e nélkül a mód full játszhatatlan volt (QA P1: senki nem
    // tudott lőni, csak sudden-death döntetlen lehetett a vége).
    if (set === 'crate')     return !!(S._crateWeapons && S._crateWeapons[wid]);
    // otherwise treat the rule as a single allowed weapon id
    return wid === set;
  };
  // the weapon a restricted match should default to when the current pick is illegal.
  function fallbackAllowedWeapon(){
    const set = (S.rules && S.rules.weaponSet) || 'all';
    const prefer = { melee:'melee', explosive:'grenade', crate:'bazooka' };
    if (prefer[set] && CA.weaponAllowed(prefer[set])) return prefer[set];
    if (set !== 'all' && set !== 'melee' && set !== 'explosive' && set !== 'crate') return set; // single weapon
    const L = (CA.Weapons && CA.Weapons.LIST) || [];
    const ok = L.find(w=> (w.power || w.damage>0) && CA.weaponAllowed(w.id));
    return ok ? ok.id : 'bazooka';
  }
  CA.fallbackAllowedWeapon = fallbackAllowedWeapon;

  CA.newGame = function(opts){
    opts = opts || {};
    // NOTE: we used to DEFER newGame while the phone was portrait, but that silently
    // no-op'd "Start" (new game / puzzles / daily challenge) — the match starts
    // immediately now; the loop FREEZES it (no sim/SFX, music paused) while portrait
    // and the rotate-hint covers the screen, then it resumes on landscape. (#start-fix)
    U._id = 0;
    S.projectiles.length = 0; S.particles.length = 0; S.units.length = 0; S.teams.length = 0;
    S.crates.length = 0; S.hazards.length = 0; S.particles.length = 0; S._crateWeapons = {};
    S.winnerTeamId = null; S.firedThisTurn = false; S.frame = 0; S.round = 1;
    S.killcam = null; S.modeData = {}; S.stats = {};
    // QA P1: az előző meccs maradványai átszivárogtak az újba —
    //  - builtWalls: a mérnök/hód falai a KÖVETKEZŐ meccsen is szilárdak voltak
    //    (láthatatlan eredetű, levegőben lógó falak egy másik pályán);
    //  - _pendingNext + társai: settle-ablak közben kilépve (Főmenü) az új meccs
    //    első körét azonnal továbbléptette / a kamerát a régi becsapódásra húzta.
    S.builtWalls = [];
    S._pendingNext = false; S._pendingFrames = 0; S._settleWait = 0;
    S._camHold = null; S._shotCamera = null; S._hitSlow = false; S._hitSlowF = 0;
    S.gameMode = opts.gameMode || 'classic';
    S.theme = opts.theme || 'jungle';
    // PER-THEME WORLD WIDTH (Jani: a Temető kicsit kicsi → 1.5×). Scale only the
    // WIDTH (not height) so the waterline / spawn heights stay put; terrain.js
    // builds its canvas from C.WORLD_W at generate-time, and the camera reads it
    // live, so a wider value just makes a roomier arena. Set every newGame so it's
    // always correct (2400 base; graveyard 3600).
    // (pre-pass only — terrain.generate() re-derives WORLD_W centrally AFTER the
    // theme is final, covering 'random' rolls and editor-map themes too.)
    try { CA.config.WORLD_W = (S.theme === 'graveyard') ? 3600 : 2400; } catch(e){}
    // LOADOUT (Jani): each team gets 1 random ultimate. Default ON for the free
    // battle modes (classic/ffa/aivsai); OFF for puzzle/daily/challenge/campaign
    // (those have fixed/balanced weapon sets). New Game can override via opts.
    var _gmU = opts.gameMode || 'classic';
    S.teamUltimate = (opts.teamUltimate != null) ? !!opts.teamUltimate
                   : (['classic','ffa','aivsai'].indexOf(_gmU) >= 0);
    // units per team for THIS game (from the New Game picker); 0 = use default.
    S.teamSize = Math.max(0, Math.min(8, opts.teamSize|0));
    S.dev = !!opts.dev;   // dev sandbox: real HP (floored at 1, no death), all weapons, no 1-shot limit
    S.risingWater = !!opts.risingWater;
    S.waterLevel = C.WATER_LEVEL;

    // ---- custom rule-set (New Game "Egyedi szabályok" panel) ----------------
    // A normalized rules object lives on S.rules; newGame + the turn manager read
    // it. Every knob is optional and falls back to the engine default, so an
    // absent / partial opts.rules behaves exactly like before. Modes may also
    // seed defaults via mode.rules (merged UNDER opts.rules so the UI wins).
    let _modeRules = (mode0()&&mode0().rules) || null;
    // classic/ffa have no bespoke mode rules — give them a default sudden-death
    // (overridable by the custom rule-set) so a stalemate can't drag forever.
    if ((S.gameMode==='classic' || S.gameMode==='ffa') && !_modeRules){
      // Jani: Sudden Death jött túl hamar → later (240s→360s) + a MIN-ROUND gate
      // (sdMinRound) so it never escalates before round 8 even if the timer ran out.
      _modeRules = { suddenDeath: 360, waterRise: 14, sdToOneHp: true, sdMinRound: 8 };
    }
    S.rules = normalizeRules(opts.rules, _modeRules);

    // wind: rules can disable it or scale its strength. Seed-derived so a daily/
    // duel seed yields the SAME wind for every player (QA3 [P2]). opts.seed is the
    // deterministic source for seeded modes; absent it, S.seed is assigned below
    // from a random value, so plain skirmish still varies match-to-match.
    {
      const _ws = (opts.seed!=null) ? (opts.seed>>>0) : U.randInt(1, 1e9);
      // remember the resolved seed so S.seed (assigned later) stays consistent.
      S._pendingSeed = _ws;
      S.wind = S.rules.wind ? ((windRand(_ws, 0)*2-1) * 0.7 * S.rules.windStrength) : 0;
    }

    // sudden death: a GLOBAL countdown (in seconds of real play). When it hits 0
    // the match escalates each subsequent round (rising water + 1-HP cap). 0 = off.
    S.suddenDeath = S.rules.suddenDeath|0;        // configured threshold (s); 0 = disabled
    S.sdTimer = S.suddenDeath;                     // remaining seconds until escalation
    S.sdActive = false;                            // true once the timer expires
    // NOTE: rising water turns on ONLY when sudden-death actually triggers (see
    // the SD activation in the turn loop) or when the match was explicitly started
    // with opts.risingWater. A configured waterRise RATE must NOT make the water
    // climb from round 1 — that was the "water rises fast with no warning" bug.

    // weather
    if (CA.Weather && CA.Weather.set) CA.Weather.set(opts.weather || 'clear');
    else S.weather = { type:opts.weather||'clear', gust:0, fog:0, slip:0, t:0 };

    // ---- determine team configs ----
    let teamConfigs = opts.teams;
    const mode = CA.Modes && CA.Modes[S.gameMode];
    if (mode && mode.setup){ const tc = mode.setup(opts); if (tc) teamConfigs = tc; }
    if (!teamConfigs){
      // legacy classic 2-team default (capybara vs worm) with optional custom names
      const nm = opts.teamNames || {};
      const _rc = CA.rosterOf ? CA.rosterOf('capybara') : (CA.ROSTER && CA.ROSTER.capybara);
      const _rw = CA.rosterOf ? CA.rosterOf('frog')     : (CA.ROSTER && CA.ROSTER.frog);
      const capyName = (nm.capybara && String(nm.capybara).trim()) || (_rc && _rc.team) || 'Capybarák';
      // default enemy is now FROGS (Jani: Classic + demo = Capybara vs Frog, not Worms)
      const foeName = (nm.frog && String(nm.frog).trim()) || (nm.worm && String(nm.worm).trim()) || (_rw && _rw.team) || 'Békák';
      teamConfigs = [
        { kind:'capybara', name:capyName, isAI:false, aiLevel:0 },
        { kind:'frog',     name:foeName, isAI: opts.vsAI !== false, aiLevel: opts.aiLevel ?? 1 },
      ];
    }
    const PAL = teamPalette();
    const cbOn = PAL !== TEAM_COLORS;   // colorblind mode forces the safe palette
    teamConfigs.forEach((tc, i)=>{
      const kind = tc.species || tc.kind || (i===0?'capybara':'worm');
      // default name = the species' roster team name (Capybaras / Worms, localized)
      // so English mode never shows a stray "Csapat N".
      const _r = CA.rosterOf ? CA.rosterOf(kind) : null;
      const defName = (_r && _r.team) || ('Csapat '+(i+1));
      S.teams.push({
        id: i+1, name: tc.name || defName, kind, species: kind,
        // colorblind ON: force the CVD-safe palette even over custom team colors
        // (guaranteed distinguishability is the whole point of the mode).
        color: cbOn ? PAL[i % PAL.length] : (tc.color || PAL[i % PAL.length]),
        isAI: !!tc.isAI, aiLevel: tc.aiLevel ?? 1, unitIds: [],
        units: tc.units, // optional explicit per-unit species/names for team-builder
        classes: tc.classes, // v4: per-unit class ids (from the class picker)
        size: tc.size, // v4.3: explicit units-per-team (else S.teamSize / default)
        tid: tc.tid,         // v4.10: saved-team id → per-animal skill tree + XP
        // v4.10: index of the captain unit. v5.0 (#5): default 0 for EVERY team
        // (not just saved ones) so every squad has a captain — the gold-star unit
        // now also carries the captain HP perk (see Entities._assignClass).
        captain: (tc.captain != null) ? tc.captain : 0,
      });
    });
    S.numTeams = S.teams.length;

    // reuse the seed already resolved for the initial wind so terrain + wind share
    // one seed (deterministic for daily/duel; random-but-consistent for skirmish).
    S.seed = (opts.seed!=null) ? opts.seed : (S._pendingSeed!=null ? S._pendingSeed : U.randInt(1, 1e9));

    // ---- EDITOR MAP support (opts.editorMap) -------------------------------
    // When the New-Game picker passes a saved editor-map name/id, replay that
    // map's deterministic op-list instead of a random generate. The editor's
    // load() ITSELF regenerates the base theme + replays paint/prop ops onto
    // the terrain mask (maps.js), and leaves CA.Maps.editor.placedProps
    // populated so terrain.js renders the placed props in a real match.
    // Falls back to normal generation if the map is missing/invalid.
    let _editorLoaded = false;
    const _editorName = (opts.editorMap != null) ? String(opts.editorMap) : '';
    const _ed = CA.Maps && CA.Maps.editor;
    if (_editorName && _ed && typeof _ed.load === 'function'){
      let ok = false;
      try { ok = _ed.load(_editorName) === true; } catch(e){ ok = false; }
      if (ok){
        _editorLoaded = true;
        _ed.editing = false;                 // it's a live match now, not the editor
        // adopt the map's saved theme so palette/fx/water match the terrain.
        if (_ed.theme){ S.theme = _ed.theme; }
      }
    }
    if (!_editorLoaded){
      // normal path: random generate. Clear any stale editor props so a leftover
      // editor session can't leak decorations into a freshly generated match.
      if (_ed){ _ed.placedProps = []; }
      call('Terrain','generate', S.seed, S.theme);
    }
    // photo-bg preload AFTER the theme is FINAL (random resolved by terrain,
    // editor map's theme adopted above) — preloading on the raw opts.theme made
    // random/editor matches skip it ("hills flash then photo pops" returned).
    try { CA.FX && CA.FX.preloadBg && CA.FX.preloadBg(); } catch(e){}
    call('Entities','spawnTeams', S.teams);

    // custom starting HP: override every spawned unit's maxHp/hp (0 = keep default).
    if (S.rules.startHp > 0){
      S.units.forEach(u=>{ if(u){ u.maxHp = S.rules.startHp; u.hp = S.rules.startHp; } });
    }
    // ensure the selected weapon respects a weapon-set restriction from the start.
    if (S.rules.weaponSet !== 'all' && !CA.weaponAllowed(S.selectedWeapon)){
      S.selectedWeapon = fallbackAllowedWeapon();
    }

    S.currentTeamIdx = 0;
    S.mode = CA.GameState.PLAYING;
    S.paused = false;
    S.timeScale = 1; S._slowmoT = 0;   // clear any leftover game-over slow-mo (#timescale-reset)
    // mobile starts more zoomed-in so units/terrain are easier to see (bumped +20%)
    const _touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    S.camera.userZoom = _touch ? 1.45 : 1; S.camera.zoom = clampZoom(playZoom()*S.camera.userZoom); clampCamera();
    if (mode && mode.onGameStart) mode.onGameStart(opts);
    CA.events.emit('gameStart', opts);
    S.charging=false; S.power=0;
    CA._swallowMouseUntil = nowMs() + 400; // ignore the click that launched the game
    // loadGame() overlays saved unit state AFTER newGame and runs its own
    // startTurn — skip this one so the turn doesn't start twice (which fired
    // turnStart twice and could let the AI act on pre-overlay positions).
    if (!opts._noStart) startTurn(true);
  };

  /* DEV sandbox (/animals/dev): a jungle map, 1 player capybara vs 1 dummy frog,
   * ALL weapons in the bar, REAL HP (so weapon damage is visible) floored at 1 so
   * the dummy never dies, no one-shot limit. */
  CA.startDev = function(){
    // dev sandbox = local PvP 1v1 (both human / hotseat) so weapons can be tested
    // freely against a controllable opponent. dev:true gives all weapons + real-HP
    // damage (floored at 1, never dies) + no one-shot-per-turn limit.
    CA.newGame({ dev:true, gameMode:'classic', theme:'jungle', weather:'clear',
      teamSize:1, aiLevel:0, vsAI:false,
      teams:[ { kind:'capybara', isAI:false, classes:['necro'],   size:1 },
              { kind:'frog',     isAI:false, classes:['guardian'], size:1 } ] });
  };

  /* ---------- Turn management ---------- */
  function firstAliveUnit(teamIdx){
    const team = S.teams[teamIdx];
    const alive = CA.aliveHeroesOfTeam(team.id);
    if (!alive.length) return null;
    // rotate: pick the one after the last active, else first
    const lastIdx = alive.findIndex(u=>u.id===team._lastActive);
    return alive[(lastIdx+1) % alive.length];
  }

  // OMLADOZÓ PÁRKÁNYOK ("Crumbling ledges") — a unit standing on a THIN, hollow-
  // underneath overhang slowly weakens it; after a couple of its team's turns the
  // ledge gives way and is carved out (the unit then falls). Pure use of the PUBLIC
  // CA.Terrain API (isSolid / isBedrock / destroy) — terrain.js is never edited.
  // Cheap: a handful of vertical probes per alive hero, once per team turn.
  const LEDGE_THIN_PX   = 14;  // ledge counts as "thin" if solid runs ≤ this deep under the feet
  const LEDGE_HOLLOW_PX = 18;  // …and is empty for at least this far below that
  const LEDGE_STAND_TURNS = 2; // crumbles after the unit has stood on it this many of its turns
  function ledgeIsThin(x, footY){
    try {
      const T = CA.Terrain;
      if (!T || !T.isSolid || !T.destroy) return false;
      // must actually be standing ON solid ground at the feet
      if (!T.isSolid(x, footY + 1)) return false;
      // never crumble indestructible bedrock
      if (T.isBedrock && T.isBedrock(x, footY + 1)) return false;
      // measure how deep the solid runs straight down…
      let depth = 0;
      for (let dy = 1; dy <= LEDGE_THIN_PX + 1; dy++){
        if (T.isBedrock && T.isBedrock(x, footY + dy)) return false; // bedrock support → safe
        if (T.isSolid(x, footY + dy)) depth = dy; else break;
      }
      if (depth === 0 || depth > LEDGE_THIN_PX) return false;        // no ground, or thick/solid → safe
      // …then confirm it's hollow underneath (an unsupported overhang)
      for (let dy = depth + 1; dy <= depth + LEDGE_HOLLOW_PX; dy++){
        if (T.isSolid(x, footY + dy)) return false;                  // supported below → safe
      }
      return true;
    } catch(e){ return false; }
  }
  function crumbleLedges(team){
    try {
      const T = CA.Terrain;
      if (!T || !T.destroy) return;
      const roster = CA.aliveHeroesOfTeam(team.id) || [];
      for (const h of roster){
        if (!h || !h.alive || !h.grounded) { if (h) h._ledgeStand = 0; continue; }
        const footY = h.y + C.UNIT_R;
        if (ledgeIsThin(h.x, footY)){
          h._ledgeStand = (h._ledgeStand || 0) + 1;
          if (h._ledgeStand >= LEDGE_STAND_TURNS){
            h._ledgeStand = 0;
            // carve the thin support out from under the feet → the unit falls
            T.destroy(h.x, footY + Math.round(LEDGE_THIN_PX/2), C.UNIT_R + 6);
            h.grounded = false;
            try { CA.events.emit('toast', '🧱 ' + CA.t('Omladozó párkány!')); } catch(e){}
            try { CA.events.emit('sfx','boom'); } catch(e){}
          } else {
            // about-to-go warning toast on the first turn it lingers
            try { CA.events.emit('toast', '🧱 ' + CA.t('Recseg a párkány…')); } catch(e){}
          }
        } else {
          h._ledgeStand = 0;
        }
      }
    } catch(e){ /* terrain crumble never breaks a turn */ }
  }

  const MOVE_BUDGET = 620;   // max world-px a unit may walk per turn (Worms-style limit)
  // (re)compute the per-turn walking budget for a SPECIFIC unit from its class
  // moveMul. Called at turn start AND when switching/selecting a unit pre-move, so
  // the budget always matches the unit you're actually controlling. (#move-budget)
  function setMoveBudgetFor(unit){
    let _mul = 1;
    try { const cdef = unit && unit.cls && CA.classOf ? CA.classOf(unit) : null;
          if (cdef && typeof cdef.moveMul === 'number') _mul = cdef.moveMul; } catch(e){}
    S._moveBudgetMax = Math.round(MOVE_BUDGET * _mul);
    S._moveBudget = S._moveBudgetMax;
  }
  function startTurn(fresh){
    // never start a turn on a finished match — onNewRound() can end the game
    // (sudden-death draw) and control still falls back into advanceTeam→startTurn,
    // which would spawn a stray turnStart + run AI.takeTurn after game-over.
    if (S.mode !== CA.GameState.PLAYING) return;
    S._shotCamera = null; S._camHold = null;
    S.phase = CA.TurnPhase.AIM;
    // custom turn time (S.rules.turnTime>0) overrides the engine default.
    S.turnTimer = (S.rules && S.rules.turnTime>0) ? S.rules.turnTime : C.TURN_TIME;
    // AI gets a few extra seconds per turn (Jani: több másodperce legyen, mint nekem).
    if (S.teams && S.teams[S.currentTeamIdx] && S.teams[S.currentTeamIdx].isAI) S.turnTimer += 5;
    S.firedThisTurn = false;
    S.power = 0; S.charging = false;
    // clear ALL held inputs so a unit never inherits a stuck direction from the
    // previous turn (e.g. a key released during the AI's turn) and walks by itself.
    S.input.left = S.input.right = S.input.up = S.input.down = false;
    S._movedThisTurn = false;     // once you walk, you can't swap units (Q) this turn
    S._dominoCount = 0;           // DOMINÓ knockback-chain cap resets each turn (entities.js)
    // per-turn action-signal flags (tutorial action-gate) — reset each turn.
    S._walkSignalled = false; S._aimSignalled = false; S._aimRef = null;
    // per-turn wind drift — seed-derived so the wind progression is identical for
    // every player on the same seed (QA3 [P2]). windStep() is replay-deterministic.
    // gentle per-turn drift (±0.15) so the wind shifts gradually instead of whipping
    // back and forth across rounds (Jani: "a szél a 2-3. körben drasztikusan oda-vissza").
    S.wind = U.clamp(S.wind + (windRand(S.seed|0, windStep()) - 0.5)*0.3, -1, 1);

    const team = S.teams[S.currentTeamIdx];
    const unit = firstAliveUnit(S.currentTeamIdx);
    if (!unit){ endTurn(); return; }
    team._lastActive = unit.id;
    S.activeUnitId = unit.id;

    // tick FREEZE for the WHOLE team at its turn start — the old tick lived in
    // the emitted turnStart event (never fired on the stun-skip path below) and
    // only hit the auto-picked unit, so _frozen could stick forever on stunned
    // or never-rotated units (permanent 65% damage reduction).
    try {
      const _ru = CA.aliveHeroesOfTeam ? (CA.aliveHeroesOfTeam(team.id) || []) : [];
      for (const _h of _ru){ if ((_h._frozen||0) > 0) _h._frozen -= 1; if ((_h._frost||0) > 0) _h._frost -= 1; }
    } catch(e){}

    // STUN ("Szédülés") — if the unit chosen to act is dazed, it loses THIS turn:
    // consume one stun stack, toast/sfx, briefly focus the camera, then advance to
    // the next team. This can never infinite-loop: each call resolves to a single
    // team turn (advanceTeam moves to a DIFFERENT team), so even if every unit on a
    // team is stunned the team simply passes cleanly, one skip per team turn.
    if ((unit.stunned||0) > 0){
      try {
        unit.stunned = Math.max(0, unit.stunned - 1);
        if (unit.anim){ unit.anim.stunPop = 1; }
        const nm = unit.name || (CA.classOf && CA.classOf(unit) && CA.classOf(unit).name) || 'Egység';
        try { CA.events.emit('toast', '😵 ' + nm + ' ' + CA.t('szédül!')); } catch(e){}
        try { CA.events.emit('sfx','tick'); } catch(e){}
        focusCamera(unit.x, unit.y, false);
      } catch(e){ /* a skipped turn must never break the game */ }
      // pass to the next team (cleanly, after a short settle) instead of giving control
      endTurn();
      return;
    }

    // per-class walking budget (tanky Guardian walks less, agile Hunter/Healer more).
    setMoveBudgetFor(unit);

    // v4 CLASS PASSIVES at turn start (guarded — a passive must never break a turn).
    try {
      const roster = CA.aliveHeroesOfTeam(team.id) || [];
      for (const h of roster){
        if (!h || !h.alive) continue;
        const cdef = CA.classOf ? CA.classOf(h) : null;
        if (!cdef) continue;
        // GUARDIAN ('tanky'): refresh shield to its base each of the team's turns.
        if (cdef.passive === 'tanky'){
          h.shield = Math.max(h.shield || 0, h.shieldBase || 0);
        }
        // HEALER ('support'): regen aura — top up allies within 150px by +6 hp.
        if (cdef.passive === 'support'){
          for (const a of roster){
            if (!a || !a.alive || a.hp >= a.maxHp) continue;
            if (U.dist(h.x, h.y, a.x, a.y) <= 150){
              a.hp = U.clamp((a.hp || 0) + 6, 0, a.maxHp);
            }
          }
        }
      }
    } catch(e){ /* passives never block a turn */ }
    // OMLADOZÓ PÁRKÁNYOK — weaken/crumble thin overhangs under this team's units.
    crumbleLedges(team);
    // v4: tick down this hero's ability cooldowns at the start of their turn
    if (unit.cooldowns){ for (const k in unit.cooldowns){ if (unit.cooldowns[k]>0) unit.cooldowns[k]--; } }
    // PER-TEAM weapon memory: restore THIS team's own last pick so an opponent's
    // choice (especially the AI's, e.g. it grabbed the shotgun) never LEAKS into
    // your turn (Jani). Defaults to a valid weapon on the first turn; the
    // class-kit / cooldown / ammo / weapon-set checks below still sanitize it.
    if (team) S.selectedWeapon = team._weapon || fallbackAllowedWeapon();
    // v4: keep the selected weapon valid for this hero's class kit (else default bazooka)
    if (unit.cls && CA.classOf){ const cdef=CA.classOf(unit);
      if (cdef && Array.isArray(cdef.abilities)){
        const kit=cdef.abilities.slice(); const WL=(CA.Weapons&&CA.Weapons.LIST)||[];
        WL.forEach(w=>{ if(w.universal) kit.push(w.id); });
        if (kit.length && kit.indexOf(S.selectedWeapon)<0) S.selectedWeapon='bazooka';
      }
    }
    // safety: if the selected weapon is on cooldown / out of ammo for THIS hero,
    // fall back to the always-ready bazooka so you can ALWAYS take a shot.
    try{
      const sw=(CA.Weapons&&CA.Weapons.LIST||[]).find(x=>x.id===S.selectedWeapon);
      const onCd=unit.cooldowns && unit.cooldowns[S.selectedWeapon]>0;
      const noAmmo=sw && CA.ammoOf(sw.id)===0;
      if (onCd || noAmmo) S.selectedWeapon='bazooka';
    }catch(e){}
    // custom weapon-set restriction: nudge off any forbidden pick at turn start.
    if (S.rules && S.rules.weaponSet !== 'all' && !CA.weaponAllowed(S.selectedWeapon)){
      S.selectedWeapon = fallbackAllowedWeapon();
    }
    S._lastWeapon = S.selectedWeapon;   // track for the 'weaponChanged' action signal
    // MOBILE: gently zoom IN on the acting unit each turn (own AND enemy turns) so
    // the player sees the character + nearby field up close. Pinch-zoom still works
    // within the turn; the next turn re-focuses. Desktop keeps its manual zoom.
    try {
      var _tz = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      if (_tz){ S.camera.userZoom = 1.8; S.camera.zoom = clampZoom(playZoom()*S.camera.userZoom); clampCamera(); }
    } catch(e){}
    focusCamera(unit.x, unit.y, true);
    const mode = CA.activeMode();
    if (mode && mode.onTurnStart) mode.onTurnStart(S.currentTeamIdx, unit);
    CA.events.emit('turnStart', S.currentTeamIdx, unit);
    if (team.isAI) call('AI','takeTurn', unit, team);
  }

  /* Switch to another of your own units before firing (Q on PC / button on
   * mobile). Only allowed on a human turn that hasn't fired yet. */
  CA.switchUnit = function(){
    if (S.mode!==CA.GameState.PLAYING) return false;
    const team = S.teams[S.currentTeamIdx];
    // can't swap units once you've fired OR already moved this one (Worms-style)
    if (!team || team.isAI || S.firedThisTurn || S._movedThisTurn || !canControl()) return false;
    const alive = CA.aliveHeroesOfTeam(team.id);
    if (alive.length < 2) return false;
    const idx = alive.findIndex(u=>u.id===S.activeUnitId);
    const next = alive[(idx+1) % alive.length];
    if (!next || next.id===S.activeUnitId) return false;
    team._lastActive = next.id;
    S.activeUnitId = next.id;
    setMoveBudgetFor(next);   // the new unit gets ITS class's fresh walking budget
    S.power=0; S.charging=false; S.input.left=S.input.right=false;
    focusCamera(next.x, next.y, false);
    CA.events.emit('sfx','click');
    CA.events.emit('unitSwitched', next);
    return true;
  };

  /* Worm-select by CLICK/TAP: pick a SPECIFIC alive unit of your own team by
   * clicking it, as long as you haven't fired/moved yet this turn (same pre-turn
   * lock as switchUnit). Returns true if it selected a *different* unit (so the
   * input layer can swallow the click instead of starting a charge). Guarded:
   * if nothing valid is clicked it returns false and normal aim/fire proceeds. */
  CA.selectUnitAt = function(worldX, worldY){
    if (S.mode!==CA.GameState.PLAYING) return false;
    const team = S.teams[S.currentTeamIdx];
    if (!team || team.isAI || S.firedThisTurn || S._movedThisTurn || !canControl()) return false;
    const alive = CA.aliveHeroesOfTeam(team.id);
    if (alive.length < 2) return false;
    // nearest own alive unit under the cursor (within a generous touch radius)
    let best=null, bd=Infinity;
    const R = C.UNIT_R + 12;
    for (const u of alive){
      const d = U.dist(worldX, worldY, u.x, u.y);
      if (d <= R && d < bd){ bd=d; best=u; }
    }
    if (!best || best.id===S.activeUnitId) return false;
    team._lastActive = best.id;
    S.activeUnitId = best.id;
    setMoveBudgetFor(best);   // tapped unit gets ITS class's fresh walking budget
    S.power=0; S.charging=false; S.input.left=S.input.right=false;
    focusCamera(best.x, best.y, false);
    CA.events.emit('sfx','click');
    CA.events.emit('unitSwitched', best);
    return true;
  };

  CA.endTurn = function(){ endTurn(); };
  function endTurn(){
    if (S.mode !== CA.GameState.PLAYING) return;
    // PHASE GUARD (Jani: "néha ugyanaz a fél jön újra"): csak ÉLŐ körben (AIM/
    // RETREAT) zárjuk le. Egy késleltetett/duplikált endTurn (AI több ágból, MP-
    // forward hálózati késéssel, timer+unitDied verseny) eddig a MÁR elindult új
    // kört zárta le (phase visszaállt AIM-re) → átugrott egy csapatot → ugyanaz
    // a fél jött kétszer. SETTLE alatt / már függő váltásnál no-op.
    if (S._pendingNext) return;
    if (!(S.phase === CA.TurnPhase.AIM || S.phase === CA.TurnPhase.RETREAT)) return;
    CA.events.emit('turnEnd', S.currentTeamIdx);
    S.phase = CA.TurnPhase.SETTLE;
    S._settleWait = 0;
    S._pendingFrames = 0;
    // a feketelyuk-él (truthy→falsy) figyeléséhez a kör elején a JELENLEGI állapotot
    // vesszük kiindulásnak, hogy egy korábbi körből maradt _bhPrev ne nullázzon hibásan.
    S._bhPrev = !!S._blackhole;
    S._pendingNext = true;   // advance once world settles
  }

  function advanceTeam(){
    S._pendingNext = false;
    S._pendingFrames = 0;
    const mode = CA.activeMode();
    if (mode && mode.onTurnEnd) mode.onTurnEnd(S.currentTeamIdx);
    if (checkWin()) return;
    const prevIdx = S.currentTeamIdx;
    try{ const _ot=S.teams[prevIdx]; if(_ot) _ot._weapon=S.selectedWeapon; }catch(e){}  // remember the outgoing team's weapon (per-team memory → no AI→human leak)
    let guard = 0;
    do { S.currentTeamIdx = (S.currentTeamIdx + 1) % S.teams.length; guard++; }
    while (CA.aliveHeroesOfTeam(S.teams[S.currentTeamIdx].id).length === 0 && guard < 16);
    // Backstop: if the rotation can't find ANY team with a living hero (e.g. a
    // minion-counting mode kept the match alive on a lone summoned minion), don't
    // spin empty turns with no controllable unit — end the match (draw) so control
    // returns to the player. checkWin() above already handles last-team-standing.
    if (CA.aliveHeroesOfTeam(S.teams[S.currentTeamIdx].id).length === 0){
      S.mode = CA.GameState.GAME_OVER; S.winnerTeamId = null;
      CA.events.emit('gameOver', null); return;
    }
    // a full round elapsed when we wrap back to (or past) team 0
    if (S.currentTeamIdx <= prevIdx){ S.round++; onNewRound(); }
    startTurn(true);
  }

  // Cap every alive unit to 1 HP — the classic Worms sudden-death escalation.
  function applySuddenDeathHpCap(){
    if (!(S.rules && S.rules.sdToOneHp)) return;
    S.units.forEach(u=>{ if (u && u.alive && u.hp>1){ u.hp = 1; u.maxHp = Math.max(1, Math.min(u.maxHp,1)); } });
  }

  function onNewRound(){
    // AUTOSAVE körönként (csak normál játszma) → a "▶ Folytatás" mindig a legutóbbi
    // kör elejéről tölt, akkor is ha a tab/böngésző bezárult (backlog #8).
    try{ if(!S._puzzle && !S._challenge && S.gameMode!=='tutorial' && CA.saveGame) CA.saveGame(); }catch(e){}
    // rising water — once sudden-death is active (or the match was started with
    // rising water) the surface climbs each round. Custom rule sets the rate.
    if (S.risingWater){
      const rise = (S.rules && S.rules.waterRise>0) ? S.rules.waterRise : 14;
      S.waterLevel = Math.max(300, S.waterLevel - rise);
      CA.events.emit('waterRose', S.waterLevel);
    }
    // keep capping to 1 HP each round while sudden-death is active (regen/heals
    // can't undo it — the noose stays tight).
    if (S.sdActive) applySuddenDeathHpCap();
    // anti-stalemate: if sudden-death drags on (passive AIs that never connect),
    // force a DRAW after a cap of SD rounds so the match can never run forever.
    if (S.sdActive){
      S._sdRounds = (S._sdRounds||0) + 1;
      if (S._sdRounds > 20 && S.mode===CA.GameState.PLAYING){
        S.mode = CA.GameState.GAME_OVER; S.winnerTeamId = null;   // draw
        CA.events.emit('gameOver', null);
        return;
      }
    }
    if (CA.Weather && CA.Weather.onNewRound) CA.Weather.onNewRound();
    CA.events.emit('newRound', S.round);
  }

  /* ---------- Action signals (tutorial action-gate) ----------
   * The tutorial advances on real ACTIONS rather than turn count. Core knows
   * exactly when each happens, so it emits clean signals here:
   *   'walked'        — the active human unit moved this turn (first px)
   *   'aimed'         — the aim angle was changed via input this turn
   *   'weaponChanged' — the selected weapon changed on a human turn
   *   'fired'         — already emitted by CA.onFired
   * unitSwitched is also emitted by CA.switchUnit. Listeners must guard
   * defensively (these fire many times; the tutorial de-dupes by step).         */
  function emitActionSignals(){
    const team = S.teams[S.currentTeamIdx];
    if (!team || team.isAI || !canControl()) return;
    // moved: _movedThisTurn flips true inside applyInputToUnit on the first walk.
    if (S._movedThisTurn && !S._walkSignalled){ S._walkSignalled = true; CA.events.emit('walked', CA.activeUnit()); }
    // aimed: detect any aim-angle change this turn (keyboard or mouse).
    const u = CA.activeUnit();
    if (u){
      if (S._aimRef == null) S._aimRef = u.aimAngle;
      if (!S._aimSignalled && Math.abs((u.aimAngle||0) - (S._aimRef||0)) > 0.04){
        S._aimSignalled = true; CA.events.emit('aimed', u);
      }
    }
    // weapon changed: compare against the snapshot taken at turn start.
    if (S.selectedWeapon !== S._lastWeapon){
      S._lastWeapon = S.selectedWeapon;
      CA.events.emit('weaponChanged', S.selectedWeapon);
    }
  }

  function checkWin(){
    const mode = CA.activeMode();
    if (mode && mode.checkWin){
      const r = mode.checkWin();   // teamId => win, null => draw/over, undefined => continue
      if (r !== undefined){ S.mode=CA.GameState.GAME_OVER; S.winnerTeamId=r; CA.events.emit('gameOver', r); return true; }
      return false;
    }
    const alive = S.teams.filter(t=>CA.aliveHeroesOfTeam(t.id).length > 0);
    if (alive.length <= 1){
      S.mode = CA.GameState.GAME_OVER;
      S.winnerTeamId = alive.length ? alive[0].id : null;
      CA.events.emit('gameOver', S.winnerTeamId);
      return true;
    }
    return false;
  }

  /* world "settled" = no live projectiles and all units grounded/slow */
  function worldSettled(){
    if (S.projectiles.some(p=>p.alive)) return false;
    // egy KÉSLELTETETT fegyver-effekt (feketelyuk-vortex) még zajlik: a lövedék
    // gyorsan detonál, de a vortex ~2,5s-ig húz + a VÉGÉN robban. Amíg él, a kör
    // NEM nyugodt, így nem vált át (Jani: "csak ha robbant, ~2 mp múlva jöjjek").
    if (S._blackhole) return false;
    return S.units.every(u=>(!u.alive && !u._blastCorpse) || (u.grounded && Math.abs(u.vy)<0.4 && Math.abs(u.vx)<0.4));
  }

  /* called by weapons after a shot is fired */
  // pure REPOSITION utilities: reusable, never "spend" the turn's single shot.
  function isReusableUtil(wid){ return wid==='teleport'||wid==='parachute'||wid==='rope'||wid==='girder'; }
  CA.isReusableUtil = isReusableUtil;
  // a "shot" = a DAMAGING weapon (consumes your one shot/turn). Support abilities
  // (shield/heal/buff/taunt/build/mark) and mobility utils do NOT — so you can
  // still take your shot after using them.
  function isShotWeapon(wid){
    if (isReusableUtil(wid)) return false;
    // smoke grenade is a non-damaging VISION utility (power-thrown but damage:0);
    // it must NOT consume your one shot for the turn. (#smoke-burns-shot)
    if (wid==='smokegrenade') return false;
    const L=(CA.Weapons&&CA.Weapons.LIST)||[];
    const w=L.find(x=>x.id===wid);
    if (!w) return true;                 // unknown → treat as a shot (safe default)
    return !!(w.power || (w.damage>0));
  }
  CA.isShotWeapon = isShotWeapon;

  CA.onFired = function(unit, weapon){
    // a reposition utility doesn't count as your one shot for the turn
    // only a DAMAGING shot consumes your one-shot-per-turn (support/utility don't).
    // DEV sandbox: never lock firing so every weapon can be spam-tested.
    if (!S.dev && weapon && (weapon.id ? isShotWeapon(weapon.id) : (weapon.power || weapon.damage>0))) S.firedThisTurn = true;
    if (unit && weapon && (weapon.id ? isShotWeapon(weapon.id) : weapon.damage>0)){
      // Hitscan/melee resolve before onFired; retain the impact they JUST
      // produced instead of erasing their victims with an empty shot tracker.
      const impact=S._shotCamera;
      if (!(impact && impact.impactFrame===S.frame && impact.affectedIds.length)){
        S._shotCamera = makeShotCamera(unit.x, unit.y, unit);
      }
    }
    CA.events.emit('fired', unit, weapon);
    CA.events.emit('sfx','fire');
    if (weapon.endsTurn !== false){
      // allow a short retreat window unless weapon forbids (custom rule may resize it)
      S.phase = CA.TurnPhase.RETREAT;
      const rt = (S.rules && S.rules.retreatTime>0) ? S.rules.retreatTime : C.RETREAT_TIME;
      S.turnTimer = Math.min(S.turnTimer, rt);
    }
  };

  /* ---------- Camera ---------- */
  function focusCamera(wx, wy, snap){
    // bias the focus point toward the UPPER part of the screen so MORE of the
    // playfield shows BELOW the unit (less empty sky strip, more ground).
    S.camera.targetX = U.clamp(wx - viewW()/2, 0, Math.max(0,C.WORLD_W - viewW()));
    S.camera.targetY = U.clamp(wy - viewH()*0.40, Math.min(0,camTopFloor()), Math.max(0,C.WORLD_H - viewH()));
    if (snap){ S.camera.x = S.camera.targetX; S.camera.y = S.camera.targetY; }
  }
  CA.focusCamera = focusCamera;

  function makeShotCamera(x, y, shooter){
    return { projectileId:null, affectedIds:[], unitId:null, x:x, y:y,
      shooterX:shooter ? shooter.x : x, shooterY:shooter ? shooter.y : y,
      shooterId:shooter ? shooter.id : null, hold:0, age:0,
      stage:'projectile', zoomRatio:0.76 };
  }
  function cameraFlight(u){
    return !!u && (u.alive || u._blastCorpse) &&
      (u._drowning || !u.grounded || Math.hypot(u.vx||0, u.vy||0)>0.65);
  }
  function rememberImpact(x, y, radius){
    if (S.mode!==CA.GameState.PLAYING) return;
    const shot = S._shotCamera || (S._shotCamera=makeShotCamera(x,y,CA.activeUnit()));
    shot.x=x; shot.y=y; shot.hold=48;
    shot.impactFrame=S.frame;
    shot.stage='impact'; shot.zoomRatio=0.84;
    for (const u of S.units){
      if (u && Math.hypot(u.x-x,u.y-y)<radius+C.UNIT_R+4 &&
          shot.affectedIds.indexOf(u.id)<0) shot.affectedIds.push(u.id);
    }
  }
  // This signal comes from the existing radial impulse, NOT from a second
  // physics engine. It also lets direct hits retain the victim through landing.
  CA.events.on('blastLaunched', (u, blast)=>{
    if (!u || !blast || S.mode!==CA.GameState.PLAYING) return;
    const shot=S._shotCamera || (S._shotCamera=makeShotCamera(blast.x,blast.y,CA.activeUnit()));
    if (shot.affectedIds.indexOf(u.id)<0) shot.affectedIds.push(u.id);
    shot.hold=48; shot.impactFrame=S.frame;
    shot.x=blast.x; shot.y=blast.y; shot.stage='impact';
  });
  CA.events.on('explosion', (x,y,r,damage)=>{
    if (r>=8 && damage>0) rememberImpact(x,y,r);
  });

  function updateCamera(){
    // Keep one projectile identity: cluster fragments must not make the camera
    // bounce between targets. Armed mines (_noFollow) remain ordinary hazards.
    const liveP = S.projectiles.filter(p=>p.alive && !p._noFollow);
    if (!S._shotCamera && liveP.length) S._shotCamera=makeShotCamera(liveP[0].x,liveP[0].y,CA.activeUnit());
    let shot=S._shotCamera, focus=null, leadX=0, leadY=0;
    if (shot){
      shot.age++;
      const p=liveP.find(p=>p.id===shot.projectileId) || liveP[0];
      if (p){
        shot.projectileId=p.id; shot.stage='projectile'; shot.hold=48;
        // Keep the last point on land, or the water entrance once ammunition
        // drops deep below the surface. The surface splash/bubbles stay visible.
        const entry=p._submerged && p.data && p.data.waterEntry;
        shot.x=entry ? entry.x : p.x; shot.y=entry ? entry.y : p.y;
        focus={x:p.x,y:entry ? Math.min(p.y,entry.y+100) : p.y};
        if (!p._submerged){ leadX=U.clamp(p.vx*8,-100,100); leadY=U.clamp(p.vy*6,-70,70); }
        const arc=Math.max(PLAY_VIEW_H,Math.abs(p.y-shot.shooterY)+260,
          (Math.abs(p.x-shot.shooterX)+300)*C.VIEW_H/C.VIEW_W);
        shot.zoomRatio=U.clamp((C.VIEW_H/arc)/(playZoom()*(S.camera.userZoom||1)),0.58,0.76);
      } else {
        let victim=CA.getUnit(shot.unitId);
        if (!cameraFlight(victim)){
          const moving=shot.affectedIds.map(id=>CA.getUnit(id)).filter(cameraFlight);
          moving.sort((a,b)=>Math.hypot(b.vx||0,b.vy||0)-Math.hypot(a.vx||0,a.vy||0));
          if (moving.length) victim=moving[0];
        }
        if (victim && cameraFlight(victim) && shot.age<480){
          shot.unitId=victim.id; shot.stage='aftermath'; shot.hold=42; shot.zoomRatio=0.82;
          focus=victim; shot.x=victim.x; shot.y=victim.y;
          if (CA.FX && CA.FX.knockbackTrail) CA.FX.knockbackTrail(victim);
          leadX=U.clamp((victim.vx||0)*7,-90,90); leadY=U.clamp((victim.vy||0)*5,-50,70);
          if (S.killcam && !victim.alive){ S.killcam.x=victim.x; S.killcam.y=victim.y; }
        } else if (shot.hold>0 && shot.age<480){
          shot.stage='impact'; shot.hold--; shot.zoomRatio=0.88;
          focus={x:shot.x,y:shot.y};
        } else {
          shot.stage='return'; shot.zoomRatio=1;
          if (Math.abs(S.camera.zoom-clampZoom(playZoom()*(S.camera.userZoom||1)))<0.015 || shot.age>540){
            S._shotCamera=null; shot=null;
          }
        }
      }
    }
    const reduced=!!(CA.settings && CA.settings.reducedMotion);
    S.camera.zoom=U.lerp(S.camera.zoom || targetZoom(),targetZoom(),reduced ? 0.18 : 0.065);
    if (focus) focusCamera(focus.x+(reduced ? 0 : leadX),focus.y+(reduced ? 0 : leadY));
    else if (S.killcam && S.killcam.t>0) focusCamera(S.killcam.x,S.killcam.y);
    else { const u=CA.activeUnit(); if (u) focusCamera(u.x,u.y); }
    if (S.killcam && S.killcam.t>0) S.killcam.t--;
    else if (S.killcam) S.killcam = null;
    const smoothing=reduced ? 0.20 : focus ? (shot && shot.stage==='projectile' ? 0.18 : 0.12) : 0.075;
    S.camera.x=U.lerp(S.camera.x,S.camera.targetX,smoothing);
    S.camera.y=U.lerp(S.camera.y,S.camera.targetY,smoothing);
    clampCamera();
    S.camera.followStage=shot ? shot.stage : 'unit';
    if (S.camera.shake>0) S.camera.shake = Math.max(0, S.camera.shake - 0.9);
  }

  // kill-cam: snap to a death and HOLD there a beat so it's actually seen. Only
  // arms when no projectile is mid-flight at expiry; turn-advance waits for it
  // (see step()). Triggers on ANY death (blast, fall, drowning).
  CA.events.on('unitDied', (u)=>{
    if (CA.settings && CA.settings.killcam && !CA.settings.reducedMotion && u && S.mode===CA.GameState.PLAYING){
      S.killcam = { x:u.x, y:u.y, t:78 };
      CA.events.emit('sfx','click');
    }
    // if the ACTIVE unit dies on its own turn (e.g. drowns / walks into water),
    // end the turn immediately — don't make the player wait out the timer.
    if (u && u.id===S.activeUnitId && S.mode===CA.GameState.PLAYING &&
        (S.phase===CA.TurnPhase.AIM || S.phase===CA.TurnPhase.RETREAT) && !S._pendingNext){
      endTurn();
    }
  });

  /* world<->screen */
  CA.worldToScreen = (wx,wy)=>({ x:(wx-S.camera.x)*S.camera.zoom, y:(wy-S.camera.y)*S.camera.zoom });
  CA.screenToWorld = (sx,sy)=>({ x:sx/S.camera.zoom + S.camera.x, y:sy/S.camera.zoom + S.camera.y });

  /* ---------- Input ----------
   * PC controls:
   *   Move  : A / D   (or ← / →)
   *   Aim   : W / S   (or ↑ / ↓)
   *   Jump  : Space
   *   Fire  : hold left mouse (aim toward cursor) OR hold Enter — release to fire
   *   Weapon: Tab cycles, 1-9 select.   Pause: P
   * Mobile keeps the on-screen touch buttons (handled in ui.js).            */
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints>0);

  // a 0-ammo weapon can't be fired (UI also greys it out + skips it on cycle)
  function selectedAmmoOk(){
    const cw = CA.Weapons && CA.Weapons.currentWeapon && CA.Weapons.currentWeapon();
    return !cw || CA.ammoOf(cw.id) !== 0;
  }
  CA.canFireSelected = selectedAmmoOk;

  // HOLD weapons (parachute): press = open, release = close — no power charge.
  function isHoldWeapon(wid){ return wid==='parachute'; }
  function firePress(){
    if (!canControl() || !selectedAmmoOk()) return;
    if (isHoldWeapon(S.selectedWeapon)){
      const u = CA.activeUnit();
      if (u && !(u.parachute>1e6)){ u.parachute = 1e9; if(CA.events) CA.events.emit('sfx','jump'); }
      return;
    }
    // already used your one shot this turn → don't even start charging (no ERŐ bar)
    if (S.firedThisTurn && isShotWeapon(S.selectedWeapon)) return;
    // weapon-set restriction: a forbidden DAMAGING weapon can't be charged/fired.
    if (isShotWeapon(S.selectedWeapon) && !CA.weaponAllowed(S.selectedWeapon)){
      S.selectedWeapon = fallbackAllowedWeapon();
    }
    S.charging = true;
  }
  CA.firePress = firePress;

  function fireRelease(){
    // hold weapon (parachute): release closes it, no shot fired
    if (isHoldWeapon(S.selectedWeapon)){
      const u = CA.activeUnit(); if (u && u.parachute>0) u.parachute = 0;
      S.charging=false; S.power=0; return;
    }
    if (!S.charging) return;
    S.charging=false;
    const u = CA.activeUnit();
    // #40 cancel an accidental tap: a power weapon released at ~0 charge doesn't fire.
    const cw = CA.Weapons && CA.Weapons.currentWeapon && CA.Weapons.currentWeapon();
    const tooWeak = cw && cw.power && cw.id!=='dynamite' && S.power < 0.03; // dynamite always throws (even a tap)
    // ONE shot per turn — but reposition utilities (teleport/parachute/…) stay usable
    let blocked = S.firedThisTurn && isShotWeapon(S.selectedWeapon);
    // weapon-set restriction also blocks the actual shot (defensive — turn-start
    // + firePress already nudge selection, but the UI can switch mid-charge).
    if (isShotWeapon(S.selectedWeapon) && !CA.weaponAllowed(S.selectedWeapon)) blocked = true;
    if (u && canControl() && selectedAmmoOk() && !tooWeak && !blocked) call('Weapons','fireCharged', u, S.selectedWeapon, S.power);
    S.power=0;
  }

  function aimAtMouse(){
    const u = CA.activeUnit(); if(!u) return;
    const dx = S.input.mouseWorldX - u.x, dy = S.input.mouseWorldY - (u.y-8);
    u.facing = dx>=0 ? 1 : -1;
    u.aimAngle = U.clamp(Math.atan2(-dy, Math.abs(dx)), -Math.PI/2, Math.PI/2);
  }

  // rebindable keymap (physical e.code). Arrows always work as a fallback for move/aim.
  const km = ()=> (CA.settings && CA.settings.keymap) || {left:'KeyA',right:'KeyD',aimUp:'KeyW',aimDown:'KeyS',jump:'Space',fire:'Enter',nextWeapon:'Tab',pause:'KeyP',switchUnit:'KeyQ'};

  function bindInput(){
    const dn = (e,v)=>{
      if (S.mode!==CA.GameState.PLAYING) return;
      if (v && CA.UI && CA.UI.isTextInputActive && CA.UI.isTextInputActive()) return;
      const team = S.teams[S.currentTeamIdx];
      // ignore key PRESSES during the AI's turn, but ALWAYS honour key RELEASES
      // (v===false) so an input can't get stuck true when released off-turn.
      if (v && team && team.isAI) return;
      const k=e.key, c=e.code, m=km();
      if      (k==='ArrowLeft'  || c===m.left)   S.input.left=v;
      else if (k==='ArrowRight' || c===m.right)  S.input.right=v;
      else if (k==='ArrowUp'    || c===m.aimUp)  S.input.up=v;
      else if (k==='ArrowDown'  || c===m.aimDown)S.input.down=v;
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', e=>dn(e,true));
    window.addEventListener('keyup',   e=>dn(e,false));
    // ESC: in a DOM menu → go back to main; in-game → close settings / pause / resume.
    window.addEventListener('keydown', e=>{
      if (e.key!=='Escape' && e.key!=='Esc') return;
      // The turn chooser closes only with its explicit X, not with pause keys.
      if (CA.Armory && CA.Armory.isOpen()) return;
      // if a DOM text field is focused, ESC should blur it — not jump to Home and
      // discard unsaved input (team name, login, duel/room code). A 2nd ESC navigates.
      var ae = document.activeElement;
      if (ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.isContentEditable)){
        try{ ae.blur(); }catch(_e){} e.preventDefault(); return;
      }
      if (S.mode === CA.GameState.MENU){
        if (CA.Menu && CA.Menu.back && CA.Menu.back()) e.preventDefault();
        return;
      }
      if (S.mode === CA.GameState.PLAYING){
        if (CA.UI && CA.UI.onEsc) CA.UI.onEsc(); else S.paused = !S.paused;
        e.preventDefault();
      }
    });
    window.addEventListener('keydown', e=>{
      if (S.mode!==CA.GameState.PLAYING) return;
      if (CA.UI && CA.UI.isTextInputActive && CA.UI.isTextInputActive()) return;
      const team = S.teams[S.currentTeamIdx];
      if (team && team.isAI) return;
      const c=e.code, m=km();
      if (c===m.jump){ if(canControl()) call('Entities','jump', CA.activeUnit()); e.preventDefault(); }
      else if (c===m.fire){ firePress(); e.preventDefault(); }
      else if (c===m.switchUnit){ CA.switchUnit(); e.preventDefault(); }
      else if (c===m.nextWeapon){ call('UI','cycleWeapon', 1); e.preventDefault(); }
      else if (/^[0-9]$/.test(e.key)){ const d=parseInt(e.key,10); call('UI','selectSlot', d===0?9:d-1); e.preventDefault(); }
      else if (c===m.pause){ S.paused=!S.paused; e.preventDefault(); }
    });
    // zoom keys work even while spectating (AI vs AI) — separate listener
    window.addEventListener('keydown', e=>{
      if (S.mode!==CA.GameState.PLAYING || isTouch) return;
      if (CA.Armory && CA.Armory.isOpen()) return;
      if (e.key==='+'||e.key==='='){ CA.zoomBy(1.15, canvas.width/2, canvas.height/2); e.preventDefault(); }
      else if (e.key==='-'||e.key==='_'){ CA.zoomBy(1/1.15, canvas.width/2, canvas.height/2); e.preventDefault(); }
      // zoom-reset moved off '0' (which is the 10th weapon slot) to avoid a double-bind.
      else if (e.code==='Backquote' || e.code==='Numpad0'){ CA.resetZoom(); e.preventDefault(); }
    });
    window.addEventListener('keyup', e=>{ if (e.code===km().fire) fireRelease(); });

    if (!canvas) return;
    // suppress the browser right-click menu over the play canvas
    canvas.addEventListener('contextmenu', e=>e.preventDefault());
    // track mouse position (world + screen)
    canvas.addEventListener('mousemove', e=>{
      const r=canvas.getBoundingClientRect();
      S.input.mouseX=(e.clientX-r.left)*(canvas.width/r.width);
      S.input.mouseY=(e.clientY-r.top)*(canvas.height/r.height);
      const w=CA.screenToWorld(S.input.mouseX,S.input.mouseY);
      S.input.mouseWorldX=w.x; S.input.mouseWorldY=w.y;
      // PC: the aim (and dashed trajectory) ALWAYS follows the cursor on a human
      // turn with a power weapon — not only while charging. Keyboard W/S still
      // works (last input wins, since this only fires on actual mouse movement).
      const tm = S.teams[S.currentTeamIdx];
      if (!isTouch && tm && !tm.isAI && canControl()){   // desktop only — on touch the ▲▼ buttons aim
        const cw = CA.Weapons && CA.Weapons.currentWeapon && CA.Weapons.currentWeapon();
        if (cw && cw.power) aimAtMouse();
      }
    });
    // hold-left-mouse to aim+charge, release to fire (desktop only — mobile uses touch buttons)
    canvas.addEventListener('mousedown', e=>{
      if (e.button!==0 || isTouch) return;
      if (S.mode!==CA.GameState.PLAYING) return;
      // swallow the very click that started the game (Indítás) so it doesn't leak
      // into an immediate charge/aim on turn 1.
      if (CA._swallowMouseUntil && nowMs() < CA._swallowMouseUntil) return;
      const team = S.teams[S.currentTeamIdx];
      if (team && team.isAI) return;
      // don't start a shot when clicking a HUD/weapon/touch button
      if (CA.UI && CA.UI.isUIHit && CA.UI.isUIHit(S.input.mouseX, S.input.mouseY)) return;
      // Worm-select: clicking another of your own alive units (pre-fire/pre-move)
      // switches to it instead of starting a charge.
      if (CA.selectUnitAt && CA.selectUnitAt(S.input.mouseWorldX, S.input.mouseWorldY)) return;
      aimAtMouse(); firePress();
    });
    // QA P2: a mouseup a WINDOW-ra kell, nem a canvasra — a canvason KÍVÜL
    // (vagy ablakon kívül) elengedett egér eddig töltve hagyta a lövést, ami
    // max erőn automatikusan elsült.
    window.addEventListener('mouseup', e=>{ if (e.button===0 && !isTouch) fireRelease(); });
    // PC: mouse-wheel zoom toward the cursor (1×..2.6×)
    canvas.addEventListener('wheel', e=>{
      if (isTouch || S.mode!==CA.GameState.PLAYING) return;
      e.preventDefault();
      const r=canvas.getBoundingClientRect();
      const sx=(e.clientX-r.left)*(canvas.width/r.width);
      const sy=(e.clientY-r.top)*(canvas.height/r.height);
      CA.zoomBy(e.deltaY<0 ? 1.12 : 1/1.12, sx, sy);
    }, { passive:false });
  }
  function canControl(){
    // QA P2: game-over képernyőn (vagy menüben) elengedett töltés eddig MÉG
    // ellőtte a lövést (phase ragadt AIM-ben) → lövedék lógott a vége-képernyőn.
    if (S.mode !== CA.GameState.PLAYING) return false;
    if (!(S.phase===CA.TurnPhase.AIM || S.phase===CA.TurnPhase.RETREAT) || S.paused) return false;
    if (CA.Armory && CA.Armory.isOpen()) return false;
    // ONLINE: gate ALL local input paths (walk/aim/jump/charge/fire) by turn
    // OWNERSHIP at the single source. Previously only CA.canControl was wrapped by
    // net.js, but core's own input handlers call THIS local canControl(), so the
    // HOST could still steer the GUEST's unit on the guest's turn. isMyTurn() is
    // true only when this peer owns the active team (offline => always true).
    if (CA.Net && CA.Net.isOnline && CA.Net.isOnline()){
      try { if (CA.Net.isMyTurn && !CA.Net.isMyTurn()) return false; } catch(e){}
    }
    return true;
  }
  CA.canControl = canControl;

  function applyInputToUnit(){
    const u = CA.activeUnit(); if(!u||!u.alive) return;
    const team = S.teams[S.currentTeamIdx]; if (team.isAI) return;
    if (!canControl()) return;
    // limited walking budget per turn — can't run across the whole map
    if ((S.input.left || S.input.right) && (S._moveBudget||0) > 0){
      const bx = u.x;
      call('Entities','walk', u, S.input.left ? -1 : 1);
      const d = Math.abs(u.x - bx);
      S._moveBudget -= d;
      if (d > 0.5) S._movedThisTurn = true;
    }
    // aim with up/down
    const aimStep = 0.03 * ((CA.settings && CA.settings.aimSensitivity) || 1); // #39
    // while a jetpack is active, W/S drive thrust (entities.js) — don't ALSO twist
    // the aim angle, or "fly up" silently re-aims the shot.
    const jp = !!(u && u._jetpack);
    if (S.input.up   && !jp) u.aimAngle = U.clamp(u.aimAngle + aimStep, -Math.PI/2, Math.PI/2);
    if (S.input.down && !jp) u.aimAngle = U.clamp(u.aimAngle - aimStep, -Math.PI/2, Math.PI/2);
    if (S.charging){ const _cu=CA.activeUnit&&CA.activeUnit(); S.power = Math.min(1, S.power + 0.018*((_cu&&_cu._chargeMul)||1));
      if (S.power>=1) fireRelease();   // reached MAX → auto-fire (don't stall at full power) (Jani)
    }
  }

  /* ---------- Main loop ---------- */
  // adaptive quality: if HIGH can't sustain ~43fps in gameplay, drop to LOW once
  // (per session) — fixes "stutters on high even on new hardware". Transparent toast.
  let _perfAcc=0, _perfN=0, _perfDropped=false;
  // mobil-detektálás: a felhasználó kérése, hogy MOBILON sose kapcsoljon le
  // magától a minőség — csak ő állíthatja át (egy betöltési akadás eddig leejtette,
  // pedig magason is tökéletes; a kézi 'high' választást is felülírta).
  const _isMobileDev = (function(){ try{ return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent||''); }catch(e){ return false; } })();
  function _perfCheck(ms){
    if (_perfDropped) return;
    if (_isMobileDev) return;   // mobilon NINCS auto-leminősítés (Jani kérése)
    if (!(CA.settings && CA.settings.quality && CA.settings.quality!=='low')) return;
    if (S.mode!==CA.GameState.PLAYING){ _perfAcc=0; _perfN=0; return; }
    _perfAcc+=ms; _perfN++;
    if (_perfN>=150){
      const avg=_perfAcc/_perfN; _perfAcc=0; _perfN=0;
      if (avg>23){   // sustained < ~43 fps
        _perfDropped=true;
        // session-only: do NOT persist (a transient stutter must not pin the
        // profile to low forever / on later capable hardware). #8 mobile review.
        // 3 tiers: step DOWN one level (high→normal→low) rather than straight to low.
        try{ CA.settings.quality = (CA.settings.quality==='high') ? 'normal' : 'low'; }catch(e){}
        try{ CA.events.emit('toast','⚡ ' + (CA.t?CA.t('Teljesítmény: alacsony minőség'):'Teljesítmény: alacsony minőség')); }catch(e){}
      }
    }
  }

  function loop(t){
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    let frameMs = Math.min(50, t - lastT); lastT = t;
    // Freeze a LIVE match while the phone is PORTRAIT — no sim tick (so no SFX) and
    // pause the music; the rotate-hint is showing. fx _syncMusic restores music when
    // stepping resumes in landscape. (Menu music in portrait is untouched.) (#orient-run)
    if (S.mode===CA.GameState.PLAYING && orientationBlocked()){
      if (!S._oriHeld){ S._oriHeld = true; try { if (CA.Audio && CA.Audio.bgMusic) CA.Audio.bgMusic(null); } catch(e){}
        // ambience too — _syncMusic (the only thing that pauses _amb) lives in
        // FX.update, which never runs while frozen, so the biome loop (grass/
        // jungle/cave/islands/graveyard) kept sounding behind the rotate-hint.
        try { if (CA.Audio && CA.Audio.ambient) CA.Audio.ambient(null); } catch(e){} }
      render();
      return;
    }
    S._oriHeld = false;
    _perfCheck(frameMs);
    // timeScale<1 advances the sim slower -> slow-motion (win-cam / juice).
    const tscale = (S.timeScale==null) ? 1 : Math.max(0.05, Math.min(1, S.timeScale));
    acc += frameMs * tscale;
    while (acc >= STEP){ step(); acc -= STEP; }
    // restore from slow-mo over real frames (not sim time, so duration is stable)
    if (S._slowmoT>0){ S._slowmoT--; if (S._slowmoT<=0) S.timeScale = 1; }
    // hit slow-mo: hold a CONSTANT slow speed until the launched unit LANDS
    // (worldSettled) — no mid-air speed-up. Safety cap ~4s so it can never stick.
    if (S._hitSlow && !(S._slowmoT>0)){
      S._hitSlowF = (S._hitSlowF||0)+1;
      var _settled=true; try{ _settled = (typeof worldSettled==='function') ? worldSettled() : true; }catch(e){}
      if ((_settled && S._hitSlowF>6) || S._hitSlowF>240){ S._hitSlow=false; S.timeScale=1; }
    }
    render();
  }

  // hit-stop: a few frozen frames on a damaging blast for extra impact "juice"
  CA.events.on('explosion', (x,y,r)=>{
    if (S.mode===CA.GameState.PLAYING && !(CA.settings && CA.settings.reducedMotion)) S._hitstop = Math.min(6, Math.max(S._hitstop||0, Math.round((r||0)*0.06)));
    // SLOW-MO so the post-shot knockback / fall is readable (Jani). A CONSTANT,
    // slightly-faster slow (0.7×) held until the launched unit LANDS (worldSettled)
    // — NOT a fixed window that speeds back up mid-air. Only when a live unit is in
    // the blast; reducedMotion-safe; doesn't fight the win-cam slow-mo.
    try{
      if (S.mode===CA.GameState.PLAYING && !(CA.settings && CA.settings.reducedMotion) && !S._hitSlow && !((S._slowmoT||0)>0)){
        var _hit=false, _U=S.units;
        if (Array.isArray(_U)) for (var _i=0;_i<_U.length;_i++){ var _u=_U[_i];
          if (_u && _u.alive && Math.hypot(_u.x-x, _u.y-y) < (r||0)+34){ _hit=true; break; } }
        if (_hit){ S.timeScale = 0.7; S._hitSlow = true; S._hitSlowF = 0; }
      }
    }catch(_e){}
    // optional WebGL ripple at the blast (screen-space). No-op unless PostFX is
    // loaded + active; never throws.
    try{ if (CA.PostFX && CA.PostFX.available && CA.PostFX.available()){ var p=CA.worldToScreen(x,y); CA.PostFX.shockwave(p.x, p.y); } }catch(e){}
  });
  // win-cam slow-motion juice (#37): brief slow-mo when the match ends.
  CA.events.on('gameOver', ()=>{ if (CA.settings && CA.settings.reducedMotion){ S.timeScale = 1; S._slowmoT = 0; } else { S.timeScale = 0.4; S._slowmoT = 110; } });

  // WIN / LOSE jingle — emitted ONCE here (this is the single chosen place; the
  // ui.js result screen does NOT emit these). 'win' if a HUMAN (non-AI) team won,
  // else 'lose'. winnerTeamId may be null on a draw -> treat as 'lose'. Fully
  // guarded so a missing event bus / team lookup never throws.
  CA.events.on('gameOver', (winnerTeamId)=>{
    try{
      let humanWon = false;
      if (winnerTeamId != null && Array.isArray(S.teams)){
        for (let i=0;i<S.teams.length;i++){
          const t = S.teams[i];
          if (t && t.id===winnerTeamId){ humanWon = !t.isAI; break; }
        }
      }
      CA.events.emit('sfx', humanWon ? 'win' : 'lose');
    }catch(e){ /* never throw from audio */ }
  });

  // ---- web-portal (Poki / CrazyGames) gameplay signals + between-match ad --
  // All NO-OP unless CA.Portal.active() (portal context only). gameplayStart on
  // match start (PLAYING), gameplayStop on game-over. We also fire ONE
  // interstitial at game-over: this is a natural break (the player is dropping
  // to the result/menu, the loop is already in slow-mo/stopping), never mid-play.
  CA.events.on('gameStart', function(){
    try { if (CA.Portal && CA.Portal.active && CA.Portal.active()) CA.Portal.gameplayStart(); } catch(e){}
  });
  CA.events.on('gameOver', function(){
    try {
      if (CA.Portal && CA.Portal.active && CA.Portal.active()){
        CA.Portal.gameplayStop();
        CA.Portal.interstitial();   // between-match break (game is ending → menu)
      }
    } catch(e){}
  });

  // STACK BONUS — when 2+ same-team heroes are stacked (one standing on another's
  // head, which the entities physics already supports), the team unlocks ONE big
  // aimed rocket ('capyslam'). Granted once per round per team; squeak + toast.
  function checkStackBonus(){
    try{
      const units = S.units; if(!units || !CA.addAmmo) return;
      const R = CA.config.UNIT_R || 16;
      for(let i=0;i<units.length;i++){
        const u = units[i];
        if(!u || !u.alive || u.minion || !u.grounded) continue;
        for(let j=0;j<units.length;j++){
          const o = units[j];
          if(o===u || !o || !o.alive || o.minion || o.teamId!==u.teamId) continue;
          const dx = Math.abs(u.x - o.x), dy = o.y - u.y;   // o below u
          if(dx < R*1.25 && dy > R*0.8 && dy < R*2.6){
            const team = CA.getTeam ? CA.getTeam(u.teamId) : null;
            // QA P2: a korai `return` az ELSŐ (már latchelt) páron kilépett, így
            // egy MÁSIK, egyszerre stackelő csapat sosem kapta meg a bónuszát
            // → latchelt páron csak ezt a belső ciklust hagyjuk el (continue).
            if(!(team && team._stackRound !== S.round)) break;
            team._stackRound = S.round;
            CA.addAmmo('capyslam', 1, team.id);
            // a fegyver-sávban csak ammóval jelenik meg (crate-unlock minta) —
            // így nincs örökre szürke "halott" 🐹 slot a meccs elejétől.
            (S._crateWeapons = S._crateWeapons || {})['capyslam'] = true;
            // toast + hang csak EMBERI csapatnak — az ellenfél AI bónuszáról szóló
            // kontextus nélküli "CSAPÁS feloldva!" csak zavart okozott.
            if(!team.isAI){
              try{ CA.events.emit('toast', '🐹 ' + CA.t('CSAPÁS feloldva!')); }catch(e){}
              try{ CA.events.emit('sfx', 'select'); }catch(e){}
              try{ CA.events.emit('sfx', 'powerup'); }catch(e){}
            }
            return;
          }
        }
      }
    }catch(e){}
  }

  function step(){
    // Read the large chooser without losing turn time, movement, ammo or HP.
    // This is not a pause toggle: closing it restores the original play state.
    if (CA.Armory && CA.Armory.isOpen()){ call('FX','update',1); return; }
    if (S.mode===CA.GameState.PLAYING && !S.paused && (S._hitstop||0)>0){ S._hitstop--; return; } // hit-stop freeze
    if (S.mode!==CA.GameState.PLAYING || S.paused){ call('FX','update',1); return; }
    S.frame++;
    applyInputToUnit();
    if ((S.frame & 7)===0) checkStackBonus();   // ~8x/sec is plenty

    // turn timer
    if (S.phase===CA.TurnPhase.AIM || S.phase===CA.TurnPhase.RETREAT){
      S.turnTimer -= 1/60;
      if (S.turnTimer<=0) endTurn();
    }

    // sudden-death: a GLOBAL countdown of active play. On expiry, escalate (water
    // rise + optional 1-HP cap, applied per round in onNewRound). Counts down only
    // while a human/AI turn is actually live so pauses/settles don't drain it.
    if (S.suddenDeath>0 && !S.sdActive && (S.phase===CA.TurnPhase.AIM || S.phase===CA.TurnPhase.RETREAT)){
      S.sdTimer -= 1/60;
      // MIN-ROUND gate (Jani): never escalate before this round even if the timer
      // expired — gives "at least +5 more rounds" of normal play first.
      var _sdMinRound = (S.rules && S.rules.sdMinRound|0) || 0;
      if (S.sdTimer <= 0 && S.round >= _sdMinRound){
        S.sdTimer = 0; S.sdActive = true; S.risingWater = true;
        S.modeData = S.modeData || {};
        // _sd flag: a render erre szűr, nem a lokalizált szövegre (QA P2 — a
        // /Hirtelen/ regex EN/ES/PT/ZH nyelven sosem talált → banner sosem látszott
        // és a t sosem fogyott le).
        S.modeData.banner = { text: '☠️ ' + CA.t('Hirtelen halál!'), t: 160, _sd: true };
        CA.events.emit('suddenDeath');
        CA.events.emit('sfx','boom');
        applySuddenDeathHpCap();   // immediate one-time cap so the round opens at 1 HP
      }
      // gate-blokk alatt ne menjen negatívba (QA P2: a HUD "☠️ -37s"-t mutatott)
      if (S.sdTimer < 0) S.sdTimer = 0;
    }

    // action signals for the action-gated tutorial (and any listener). Emitted from
    // core where the action truly happens, only on a controllable human turn.
    emitActionSignals();

    call('Weather','update', 1);
    call('Entities','update', 1);
    call('Weapons','update', 1);
    call('Hazards','update', 1);
    call('AI','update', 1);
    call('FX','update', 1);
    { const m=CA.activeMode(); if (m && m.update) m.update(1); }
    updateCamera();

    // settle -> advance (but hold while the kill-cam is showing a death).
    // Tightened so the post-timeout "frozen" pause is ~1-2s, not 4-5s.
    if (S._pendingNext){
      S._pendingFrames = (S._pendingFrames||0)+1;
      const killcamHolding = S.killcam && S.killcam.t>0;
      const shotHolding = S._shotCamera && S._shotCamera.hold>0 && S._shotCamera.age<480;
      // After the AI takes its shot, LINGER ~1.5s on the result so the player can
      // see what happened before the turn snaps back to them (Jani: túl gyorsan vált).
      const _aiTurn = S.teams[S.currentTeamIdx] && S.teams[S.currentTeamIdx].isAI;
      const _settleNeed = (_aiTurn && S.firedThisTurn) ? 90 : 10;
      if (worldSettled() && !killcamHolding && !shotHolding){ S._settleWait=(S._settleWait||0)+1; if (S._settleWait>_settleNeed){ advanceTeam(); } }
      else S._settleWait=0;
      // hard fallback: never let a turn stall (~1.8s even if nothing settles) —
      // DE amíg időzített (fuse-os) lövedék VAGY feketelyuk-vortex él, várjuk ki a
      // robbanását (max ~6s), különben a késleltetett fegyver az EMBERI kör elején
      // robbant (Jani: feketelyuk; QA P1: AI-gránát).
      // QA (Jani 2026-06-10): a lassú, NEM-fuse lövedék (necro csontlándzsa: grav 0.35,
      // sokáig repül) eddig kicsúszott a hard-cap alól — 110 frame (~1.8s) után átváltott
      // a kör, miközben a csont MÉG a levegőben volt, és az emberi kör elején ért le.
      // Most BÁRMELY élő lövedék (fuse-os vagy sem) kitolja a hard-capet ~6s-ra, így a
      // lövés mindig leér, mielőtt a következő fél jönne.
      // QA (2026-06-15): egy ELDOBOTT, élesített mágnesakna (_noFollow, ~10s élet)
      // NEM a kör része — mégis a hosszú 360-frame hard-capen tartotta MINDEN
      // következő kört. A veszély-lövedékeket (_noFollow) kizárjuk a busy-tesztből.
      let _fuseAlive = false, _projAlive = false;
      for (const p of S.projectiles){ if (p.alive && !p._noFollow){ _projAlive = true; if (p.fuse > 0) _fuseAlive = true; } }
      // feketelyuk-vortex: amikor KIALSZIK (truthy→falsy), a cap 360→110-re esik, de a
      // _pendingFrames már meghaladhatja a 110-et → a kör átváltana, miközben az
      // egységek még a levegőben vannak az implózió boom()-jától. Ha most aludt ki,
      // nullázzuk a _pendingFrames-t, hogy a beesés még leülepedjen.
      const _bhNow = !!S._blackhole;
      if (S._bhPrev && !_bhNow){ S._pendingFrames = 0; }
      S._bhPrev = _bhNow;
      const _victimFlight = S._shotCamera && S._shotCamera.age<480 && cameraFlight(CA.getUnit(S._shotCamera.unitId));
      const _busy = _projAlive || _fuseAlive || _bhNow || _victimFlight;
      const _hardCap = _busy ? 480 : shotHolding ? 180 : 110;
      if (S._pendingFrames > _hardCap){ advanceTeam(); }
    }
  }

  /* sudden-death HUD: a brief "Hirtelen halál!" banner on trigger + a small
   * persistent skull label while active. Mode-agnostic (classic/ffa have no
   * mode render). Also shows a countdown in the last 10s before it triggers. */
  function renderSuddenDeath(ctx){
    if (!S.suddenDeath) return;
    // [P1] SD HUD is PLAYING-only. S.sdActive is never cleared on game-over, so
    // without this guard the persistent skull paints OVER the GAME-OVER overlay.
    if (S.mode !== CA.GameState.PLAYING) return;
    const md = S.modeData || {};
    // trigger banner — SD only fires in classic/ffa (neither ticks a banner via a
    // mode update), so we own the tick here. Match on the SD text so we never
    // fight a mode that happens to draw its own banner.
    if (md.banner && md.banner.t>0 && md.banner._sd){
      md.banner.t--;
      const a = Math.min(1, md.banner.t/40);
      ctx.save(); ctx.globalAlpha=a; ctx.textAlign='center';
      ctx.fillStyle='#ff5a5a'; ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=6;
      ctx.font='bold 44px system-ui, sans-serif';
      const cx=(ctx.canvas.width||1280)/2, cy=(ctx.canvas.height||720)/2 - 70;
      ctx.strokeText(md.banner.text, cx, cy); ctx.fillText(md.banner.text, cx, cy);
      ctx.restore();
    }
    // small persistent indicator: countdown before SD, skull once active.
    // [P2] TOP-CENTER, ui-scaled, safe-area aware. Was top-RIGHT raw px (overlapped
    // the roster HP text on desktop + notch-clipped on iPhone). Mirror ui.js's
    // centered hourglass/wind layout and anchor BELOW the wind block so we never
    // overlap the hourglass / wind / portrait.
    const M = hudMetrics(); const ui = M.ui;
    const safeTop = Math.round(hudSafeAreaTopCss() * (M.dpr || 1));
    let label;
    ctx.save(); ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.font='bold '+(18*ui)+'px system-ui, sans-serif';
    ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=4*ui;
    if (S.sdActive){ ctx.fillStyle='#ff5a5a'; label='☠️ ' + CA.t('Hirtelen halál'); }
    else if (S.sdTimer <= 0){
      // a timer lejárt, de a kör-kapu (sdMinRound) még tart → a kaput mutatjuk,
      // nem egy örök "0s"-t (QA P2)
      var _mr = (S.rules && S.rules.sdMinRound|0) || 0;
      if (_mr > S.round){ ctx.fillStyle='#ffd45a'; label='☠️ ' + CA.t('Kör') + ' ' + _mr; }
      else { ctx.restore(); return; }
    }
    else if (S.sdTimer <= 12){ ctx.fillStyle='#ffd45a'; label='☠️ ' + Math.ceil(S.sdTimer) + 's'; }
    else { ctx.restore(); return; }
    const cx=(ctx.canvas.width||1280)/2;
    // ui.js: padTop = 12*ui + safeTop + 5*ui; hourglass cs; wind label at +cs+10*ui;
    // wind block bottom ≈ windCy+2*ui+9*ui+18*ui. Sit a touch below that.
    const padTop = 12*ui + safeTop + 5*ui;
    const cs = (M.isTouch ? 36*0.7 : 36) * ui;
    const windBottom = (padTop + cs + 10*ui) + 2*ui + 9*ui + 18*ui;
    // +42*ui leaves a row for the AI-vs-AI spectator banner (modes.js) at
    // windBottom+18*ui, so SD + spectator HUD stack instead of overlapping.
    const y = Math.round(windBottom + 42*ui);
    ctx.strokeText(label, cx, y); ctx.fillText(label, cx, y);
    ctx.restore();
  }

  function render(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (S.mode===CA.GameState.MENU){
      // skip the CANVAS menu draw when the DOM menu overlay owns the screen (it
      // fully covers the canvas → that render was invisible work).
      // EXCEPTION — the level EDITOR is a HYBRID screen: its DOM overlay is a
      // TRANSPARENT toolbar (menu-editor.js) and the CANVAS must keep drawing the
      // paint preview (terrain + cursor) behind it. The editor IS a DOM screen
      // (M.register('editor')) so #menu-root is 'show', which previously skipped
      // the canvas → blank/dark center (Jani: "pályaszerkesztő közepe off"). So
      // for 'editor' we still render the canvas, mirroring ui.js renderMenu's
      // `screen!=='editor'` exception.
      var _mr = (typeof document!=='undefined' && document.getElementById) ? document.getElementById('menu-root') : null;
      var _scr = (CA.UI && CA.UI.screen) ? CA.UI.screen() : 'main';
      if (_scr==='editor' || !(_mr && _mr.classList && _mr.classList.contains('show'))) call('UI','renderMenu', ctx);
      return;
    }

    // world-space pass (camera transform + shake)
    ctx.save();
    const noShake = !!(CA.settings && CA.settings.reducedMotion);
    const sx = (S.camera.shake && !noShake)? U.rand(-S.camera.shake,S.camera.shake):0;
    const sy = (S.camera.shake && !noShake)? U.rand(-S.camera.shake,S.camera.shake):0;
    // pixel-snap the COMBINED (camera + shake) translate to whole device pixels to
    // kill sub-pixel antialiasing blur. Round once, on the final offset — NOT the
    // zoom (scale), and not camera/shake separately (that would add jitter).
    ctx.translate(Math.round(-S.camera.x*S.camera.zoom + sx), Math.round(-S.camera.y*S.camera.zoom + sy));
    ctx.scale(S.camera.zoom, S.camera.zoom);

    call('FX','renderBg', ctx);        // parallax sky/back (theme-aware)
    call('Terrain','render', ctx);
    call('Hazards','render', ctx);     // fire/poison/mines on the ground
    call('Weapons','renderCrates', ctx); // item crates (if any)
    call('Entities','render', ctx);
    call('Weapons','render', ctx);
    call('FX','render', ctx);          // particles in world space
    { const m=CA.activeMode(); if (m && m.renderWorld) m.renderWorld(ctx); }
    call('Weather','renderFx', ctx);   // rain/snow particles in world space
    ctx.restore();

    // cinematic grade (warm wash + vignette) over the gameplay, UNDER the HUD so
    // the HUD stays crisp. No-op on low / when the WebGL post-pass owns the grade.
    call('FX','renderGrade', ctx);

    // screen-space HUD
    call('UI','render', ctx);
    call('Weather','renderOverlay', ctx); // fog/vignette (screen space)
    { const m=CA.activeMode(); if (m && m.render) m.render(ctx); }

    // sudden-death banner + persistent label (works for modes WITHOUT a render
    // hook, e.g. classic/ffa). The mode banner above handles modes that draw one.
    renderSuddenDeath(ctx);

    // kill-cam banner (screen space, on top) — makes the kill-cam visible
    if (S.killcam && S.killcam.t>0){
      const a = Math.min(1, S.killcam.t/20) * Math.min(1, (78-S.killcam.t)/8);
      ctx.save();
      ctx.globalAlpha = 0.5*a;
      ctx.fillStyle='#000';
      ctx.fillRect(0,0,canvas.width, canvas.height*0.07);
      ctx.fillRect(0,canvas.height*0.93,canvas.width, canvas.height*0.07);
      ctx.globalAlpha = a;
      ctx.fillStyle='#ffd45a';
      const fs=Math.round(canvas.height*0.032);
      ctx.font='bold '+fs+'px system-ui,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      // On TOUCH, ui.js draws the KILL-CAM label LOWER (clear of the notch); skip
      // this top label there so it isn't shown twice. Keep the cinematic bars.
      var _touchKC = ('ontouchstart' in window) || (navigator.maxTouchPoints>0);
      if(!_touchKC) ctx.fillText('💀 KILL-CAM', canvas.width/2, canvas.height*0.035);
      ctx.restore();
    }

    // optional WebGL post-processing — runs LAST, after every 2D draw (world + HUD
    // + overlays) for this frame. Only active on the 'high' tier when the module is
    // present AND reports a live GL context; otherwise it's disabled (no-op) so the
    // default/lower tiers render byte-for-byte as the plain 2D canvas. Fully guarded.
    // WebGL post-pass HARD-OFF — Jani tested "Legmagasabb" and it looked terrible
    // ("szörnyű / túlzás"), so the post-pass is disabled and cannot be activated
    // (no ultra tier, no settings flag, no ?postfx). The Canvas2D cinematic grade
    // (CA.FX.renderGrade) stays as the look. PostFX module remains loaded but dormant.
    try{ if (CA.PostFX && CA.PostFX.setEnabled) CA.PostFX.setEnabled(false); }catch(e){}
  }

  /* ---------- Save / continue (localStorage 'ca_save') ----------
   * Stores the match setup + live unit states + seed so a game can be resumed.
   * Terrain is regenerated from the seed on load (craters are not persisted). */
  CA.saveGame = function(){
    if (S.mode!==CA.GameState.PLAYING) return false;
    const data = {
      seed:S.seed, theme:S.theme, gameMode:S.gameMode, round:S.round, wind:S.wind,
      waterLevel:S.waterLevel, risingWater:S.risingWater, currentTeamIdx:S.currentTeamIdx,
      // QA P1: a csapatméret nem volt mentve → 3v3 mentés 5v5-ként folytatódott
      // (2-2 fantom teli-HP egységgel), 8v8 mentésből 3-3 egység elveszett.
      teamSize: S.teamSize|0, rules: S.rules || null, teamUltimate: !!S.teamUltimate,
      teams: S.teams.map(t=>({ name:t.name, kind:t.kind, species:t.species, color:t.color,
        isAI:t.isAI, aiLevel:t.aiLevel, size: t.unitIds.length,
        // P2: a kapitány-index (captain) és a mentett-csapat azonosító (tid) eddig NEM
        // mentődött → betöltéskor minden csapat captain:0-ra esett vissza (rossz egység
        // kapta a kapitány-perköt + maxHp-t). Most per-csapat mentjük mindkettőt.
        captain: (t.captain != null ? t.captain : null), tid: (t.tid != null ? t.tid : null),
        units: t.unitIds.map(id=>{ const u=CA.getUnit(id); return u&&{species:u.species||u.kind,name:u.name,x:u.x,y:u.y,vx:u.vx||0,vy:u.vy||0,hp:u.hp,alive:u.alive,facing:u.facing,ammo:u.ammo,cls:u.cls||null,uid:(u._uid!=null?u._uid:undefined)}; }).filter(Boolean) })),
    };
    try{ localStorage.setItem('ca_save', JSON.stringify(data)); try{ CA.events.emit('gameSaved'); }catch(_e){} return true; }catch(e){ return false; }
  };
  CA.hasSave = function(){ try{ return !!localStorage.getItem('ca_save'); }catch(e){ return false; } };
  CA.clearSave = function(){ try{ localStorage.removeItem('ca_save'); CA.events.emit('gameSaved'); }catch(e){} };
  // egy befejezett meccs mentése elavult → töröljük, hogy a "▶ Folytatás" ne
  // töltsön vissza egy lezárt játszmát (backlog #8).
  CA.events.on('gameOver', function(){ try{ CA.clearSave(); }catch(e){} });
  CA.loadGame = function(){
    let data; try{ data=JSON.parse(localStorage.getItem('ca_save')||'null'); }catch(e){}
    if (!data) return false;
    // csapatméret: az explicit mentett érték, különben az első csapat unit-száma
    const _sz = (data.teamSize|0) || (data.teams && data.teams[0] && data.teams[0].size|0) ||
                (data.teams && data.teams[0] && data.teams[0].units && data.teams[0].units.length) || 0;
    // P2 FIX: a csapat-konfigot ÚGY adjuk át, hogy a spawnTeams a HELYES osztállyal
    // és kapitánnyal építse újra az egységeket (captain-index, tid, per-egység cls/uid).
    // Így a maxHp + kapitány-perk a JÓ egységre kerül (eddig minden csapat captain:0-ra
    // esett, mert a captain/tid/cls nem volt mentve). A dinamikus állapotot (hp, alive,
    // pozíció, sebesség, ammo, facing) CSAK EZUTÁN borítjuk rá.
    CA.newGame({ seed:data.seed, theme:data.theme, gameMode:data.gameMode, _noStart:true,
      teamSize:_sz, rules:data.rules||undefined, teamUltimate:data.teamUltimate,
      risingWater:data.risingWater, teams:data.teams.map(t=>({
        kind:t.species||t.kind, name:t.name, color:t.color, isAI:t.isAI, aiLevel:t.aiLevel,
        size: t.size, tid: (t.tid!=null?t.tid:undefined),
        captain: (t.captain!=null?t.captain:undefined),
        // per-egység spec: cls + uid (+ species/name) → spawnTeams a JÓ osztályt rakja
        units: (t.units||[]).map(su=>({ species:su.species, name:su.name,
          cls:(su.cls||undefined), uid:(su.uid!=null?su.uid:undefined) })),
      })) });
    // overlay saved unit states onto the freshly spawned teams. A spawnTeams már a
    // helyes osztállyal + kapitány-perkkel (helyes maxHp) építette fel az egységeket,
    // ezért itt CSAK a dinamikus állapotot írjuk felül — a cls/maxHp-t NEM bántjuk.
    S.round=data.round||1; S.wind=data.wind||0; S.waterLevel=data.waterLevel||C.WATER_LEVEL;
    data.teams.forEach((td,ti)=>{ const team=S.teams[ti]; if(!team) return;
      td.units.forEach((su,ui)=>{ const u=CA.getUnit(team.unitIds[ui]); if(!u) return;
        u.x=su.x; u.y=su.y; u.hp=su.hp; u.alive=su.alive; if(su.name)u.name=su.name;
        if(su.vx!=null)u.vx=su.vx; if(su.vy!=null)u.vy=su.vy;
        if(su.facing!=null)u.facing=su.facing; if(su.ammo!=null)u.ammo=su.ammo; });
      // a mentésben NEM szereplő (fantom) egységek nem létezhetnek — védőháló arra
      // az esetre, ha a spawn mégis többet rakott le, mint a mentett darabszám.
      if (td.units.length < team.unitIds.length){
        for (let k=td.units.length; k<team.unitIds.length; k++){
          const ghost=CA.getUnit(team.unitIds[k]); if(ghost){ ghost.alive=false; ghost.hp=0; }
        }
      }
    });
    S.currentTeamIdx = data.currentTeamIdx||0;
    startTurn(true);
    return true;
  };

  /* expose a couple of helpers used by UI/modes */
  CA.core = { startTurn, endTurn, advanceTeam, focusCamera, onNewRound, updateCamera, worldSettled };
})();
