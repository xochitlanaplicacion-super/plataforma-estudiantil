/* ============================================================================
 * CUTE ANIMALS — weather.js  ::  CA.Weather  (Agent World)
 * ----------------------------------------------------------------------------
 * Feature #3 (időjárás: eső/hó/köd/széllökés).  Writes CA.state.weather =
 *   { type, gust, fog, slip, t }. Other systems READ it:
 *   - core adds gust to wind feel; entities.js reads weather.slip (slippery
 *     ground -> more sliding) for #3; weapons feel stronger wind in gusts.
 *   - fx/this draws rain/snow particles + fog overlay.
 *
 * IMPLEMENT on CA.Weather (EXACT):
 *   init()
 *   set(type)        -> set weather: 'clear'|'rain'|'snow'|'fog'|'storm'.
 *                       Configure slip (rain/storm > 0), fog (fog/storm > 0),
 *                       gust amplitude (storm high). Random if type omitted.
 *   onNewRound()     -> optionally drift/gust the wind, randomize gust phase.
 *   update(dt)       -> advance weather.t; modulate weather.gust (sin) for
 *                       storm; CA.state.wind may be nudged by gusts (small).
 *   renderFx(ctx)    -> WORLD-space rain streaks / snow flakes (camera applied).
 *   renderOverlay(ctx) -> SCREEN-space fog veil / darkening (uses CA.config.VIEW_*).
 *
 * Respect CA.settings.quality==='low' (fewer particles). Keep cheap.
 * ==========================================================================*/
(function(){
  const C = CA.config;
  const U = CA.util;
  let W = C.WORLD_W, H = C.WORLD_H;

  // ---- deterministic weather RNG (QA3 [P2]) -------------------------------
  // core.js made the wind a pure function of (S.seed, turn) via windRand(), but
  // this module used to overwrite S.wind every frame from a Math.random()-seeded
  // gust phase + a Math.random() per-round kick → two clients on the SAME daily/
  // duel seed got DIFFERENT wind on rain/snow/storm (unfair). windRand() below is
  // the same mulberry32 mix core uses, kept local (core's copy is private). It
  // returns [0,1) purely from (seed, step), so seeding gustPhase / the round kick
  // from it makes the whole wind stream identical for the same seed. The gust
  // FEEL (amplitude/phase shape) is unchanged — only its source is deterministic.
  function windRand(seed, step){
    let a = (((seed>>>0) ^ Math.imul((step|0)+1, 0x9E3779B1)) >>> 0) || 1;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // the active match seed (falls back to 0 → still deterministic for a given map).
  function seed(){ return (CA.state && CA.state.seed|0) || 0; }
  // a replay-deterministic step that advances each round AND each weather (re)set,
  // so successive gust phases / kicks differ but are identical across clients on
  // the same seed. Mirrors core's (round,team) indexing with a local set-counter.
  let wxStep = 0;
  function nextRand(){ return windRand(seed(), wxStep++); }

  // per-type tuning
  //  slip    : ground slipperiness fed to entities.js friction model (0..1)
  //  fog     : overlay veil strength
  //  gustAmp : amplitude of the sinusoidal gust that rides on top of base wind
  //  windAmp : how far gusts are allowed to DRIFT the actual S.wind over a turn
  //            (px-equivalent in the -1..1 wind space). Storm swings hardest so
  //            wind-affected shots are genuinely harder to read mid-flight.
  const TYPES = {
    clear: { slip:0,    fog:0,    gustAmp:0,    windAmp:0    },
    rain:  { slip:0.35, fog:0.10, gustAmp:0.05, windAmp:0.12 },
    snow:  { slip:0.45, fog:0.18, gustAmp:0.03, windAmp:0.08 },  // slippery ground
    fog:   { slip:0,    fog:0.55, gustAmp:0,    windAmp:0    },
    storm: { slip:0.50, fog:0.25, gustAmp:0.30, windAmp:0.55 },  // big variable wind
  };

  // particle pools (lazy) — positions in WORLD space, recycled (no GC churn)
  let parts = null;       // {x,y,vx,vy,len,sz}
  let partType = null;
  let gustPhase = 0;
  // the "calm" wind this turn; gusts swing the live S.wind around this anchor so
  // the indicator visibly drifts back and forth instead of walking off to ±1.
  let baseWind = 0;

  /* ----- WEATHER HAZARDS (#15) ---------------------------------------------
   * Storm -> occasional lightning strike (telegraph, then a small CA.explode).
   * Snow  -> occasional light avalanche (sliding snow particles + light shove).
   * Both are rate-limited from onNewRound (a per-turn cooldown counter) and the
   * actual event is sequenced inside update() with a brief telegraph so it's
   * fair. All damage routes through CA.explode; everything is guarded so it can
   * never throw or loop.                                                      */
  // lightning state machine: 'idle' -> 'aim' (telegraph) -> 'strike' -> 'idle'
  let bolt = { phase:'idle', t:0, x:0, y:0, jag:null, flash:0 };
  let strikeCd = 0;     // turns to wait before another lightning is allowed
  // avalanche: a short-lived band of sliding debris particles
  let avalanche = null; // { x, dir, w, parts:[{x,y,vx,vy,sz,life}], life }
  let avCd = 0;         // turns to wait before another avalanche

  // reduced-motion gate (a11y). fx.js reads CA.settings.reducedMotion; mirror it
  // here AND honour the OS-level prefers-reduced-motion so the weather system
  // (the only one that ignored it) no longer flashes/animates against the user's
  // vestibular/photosensitivity needs.
  function reduced(){
    return !!(CA.settings && CA.settings.reducedMotion) ||
           (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion:reduce)').matches);
  }

  // VIEW_* are backing-canvas pixels; this pass already has the camera scale.
  // Derive its world rectangle every frame so flight zoom/pan and resize cannot
  // leave a straight edge in the weather. Padding includes camera shake and
  // pixel snapping in core's world transform.
  function worldView(){
    const cam = CA.state.camera || {};
    const zoom = Number.isFinite(cam.zoom) && cam.zoom > 0 ? cam.zoom : 1;
    const pad = 40 + ((Number.isFinite(cam.shake) ? Math.abs(cam.shake) : 0) + 1) / zoom;
    return {
      x: Number.isFinite(cam.x) ? cam.x : 0,
      y: Number.isFinite(cam.y) ? cam.y : 0,
      w: C.VIEW_W / zoom, h: C.VIEW_H / zoom, pad,
    };
  }

  // The pool is a repeating world field, including the virtual sky above y=0.
  // Draw only its visible copies; camera motion never moves particles or changes
  // their simulation/RNG stream. Usually each particle has just one copy.
  function visibleParts(view, draw){
    if (!parts) return;
    const x0 = view.x - view.pad, x1 = view.x + view.w + view.pad;
    const y0 = view.y - view.pad, y1 = view.y + view.h + view.pad;
    for (let i=0;i<parts.length;i++){
      const p = parts[i];
      const ix0 = Math.ceil((x0 - p.x) / W), ix1 = Math.floor((x1 - p.x) / W);
      const iy0 = Math.ceil((y0 - p.y) / H), iy1 = Math.floor((y1 - p.y) / H);
      for (let ix=ix0;ix<=ix1;ix++){
        for (let iy=iy0;iy<=iy1;iy++) draw(p, p.x + ix*W, p.y + iy*H);
      }
    }
  }

  // ---- biome / theme atmosphere (signature graveyard mood) ---------------
  // CA.state.theme is the canonical biome signal (fx.js / core.js / terrain.js
  // all read it). We key a cheap full-viewport tint to it in renderOverlay, on
  // TOP of any existing fog/storm wash (fx.js already adds a daytime tint +
  // vignette, so these are kept LIGHT to avoid muddying readability).
  //   graveyard -> cool purple/blue veil (the signature spooky mood)
  //   cave/dark/night-ish themes -> a slight blue darken
  //   everything else -> neutral (null, no extra tint)
  function biomeTint(){
    const th = (CA.state && CA.state.theme || '') + '';
    if (th === 'graveyard') return { col:'40,10,70', a:0.16 };   // cool purple veil
    if (/cave|cavern|dark|underground|night/i.test(th)) return { col:'10,18,46', a:0.14 }; // blue darken
    return null;
  }

  // ---- ground-fog strip (signature graveyard) ----------------------------
  // A cheap rolling fog band near the bottom of the viewport: a horizontal
  // gradient strip baked ONCE into an offscreen canvas, then drawImage'd twice
  // (tiled) with a slowly scrolling offset. No per-frame gradient/createRadial.
  let fogStrip = null;       // cached offscreen canvas (2x viewport width)
  let fogStripW = 0;         // its width (tracked so a resize rebuilds it)
  let fogScroll = 0;         // horizontal scroll offset (px)
  function ensureFogStrip(VW, VH){
    const w = (VW*2)|0, h = Math.max(40, (VH*0.42)|0);
    if (fogStrip && fogStripW === w && fogStrip.height === h) return fogStrip;
    let cv = null;
    try{
      cv = (typeof document !== 'undefined' && document.createElement)
        ? document.createElement('canvas') : null;
    } catch(e){ cv = null; }
    if (!cv) { fogStrip = null; return null; }
    cv.width = w; cv.height = h;
    const g2 = cv.getContext && cv.getContext('2d');
    if (!g2) { fogStrip = null; return null; }   // null-check getContext (iOS-safe)
    // vertical fade: transparent at top -> soft fog at bottom
    const vg = g2.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0,   'rgba(200,205,220,0)');
    vg.addColorStop(0.6, 'rgba(198,204,222,0.10)');
    vg.addColorStop(1,   'rgba(196,202,224,0.22)');
    g2.fillStyle = vg;
    g2.fillRect(0, 0, w, h);
    // a few soft horizontal lumps so the band isn't a flat bar — baked in once.
    g2.globalCompositeOperation = 'source-over';
    g2.fillStyle = 'rgba(205,210,228,0.10)';
    const lumps = 6;
    for (let i=0;i<lumps;i++){
      const cx = (i+0.5)/lumps * w + ((i*53)%37) - 18;
      const cy = h*0.78, rx = w/lumps*0.7, ry = h*0.55;
      g2.beginPath();
      g2.ellipse ? g2.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2)
                 : g2.arc(cx, cy, ry, 0, Math.PI*2);
      g2.fill();
    }
    fogStrip = cv; fogStripW = w;
    return fogStrip;
  }

  function clampWorldX(x){ return U.clamp(x, 20, W-20); }

  function groundY(x){
    // surface y at world-x; fall back to a sensible band if terrain absent
    if (CA.Terrain && CA.Terrain.heightAt){
      const gy = CA.Terrain.heightAt(x);
      if (typeof gy === 'number' && isFinite(gy)) return gy;
    }
    return C.WATER_LEVEL - 60;
  }

  // pick a target x: bias toward a random alive unit so strikes feel deliberate,
  // else a random ground point. Never throws.
  function pickStrikeX(){
    try{
      const units = (CA.state.units||[]).filter(u=>u && u.alive);
      if (units.length && Math.random() < 0.6){
        const u = units[(Math.random()*units.length)|0];
        return clampWorldX(u.x + (Math.random()*2-1)*40);
      }
    } catch(e){}
    return clampWorldX(Math.random()*W);
  }

  // build a jagged bolt polyline from sky to ground for drawing
  function makeJag(x, gy){
    const pts = [];
    let y = -20, cx = x;
    const segs = 7 + (Math.random()*4|0);
    for (let i=0;i<=segs;i++){
      const t = i/segs;
      pts.push({ x: cx, y: y + (gy+20)*t });
      cx = x + (Math.random()*2-1) * 26 * (1 - t*0.4);
    }
    pts[pts.length-1].x = x; // land precisely on target
    return pts;
  }

  function triggerLightning(){
    if (bolt.phase !== 'idle') return;
    const x = pickStrikeX();
    bolt.x = x;
    bolt.y = groundY(x);
    bolt.phase = 'aim';
    bolt.t = 0;
    bolt.jag = null;
    bolt.flash = 0;
  }

  function doStrike(){
    bolt.jag = makeJag(bolt.x, bolt.y);
    // reduced-motion: keep the gameplay effect (particles + blast) but kill the
    // full-screen white FLASH — that's the photosensitivity/vestibular hazard.
    bolt.flash = reduced() ? 0 : 1;
    // particles + small blast at the strike point. Small radius/dmg so it's
    // spice, not a death-ray. ALL damage via CA.explode.
    try{
      if (CA.FX && CA.FX.spawnParticles){
        CA.FX.spawnParticles({ x:bolt.x, y:bolt.y, count:14, spdMin:0.6, spdMax:3.4, life:22, size:3, color:'#ffd' });
        CA.FX.spawnParticles({ x:bolt.x, y:bolt.y, count:8,  spdMin:0.4, spdMax:2.2, life:26, size:4, color:'#9cf' });
      }
    } catch(e){}
    try{
      if (typeof CA.explode === 'function') CA.explode(bolt.x, bolt.y, 30, 22, 1.0);
    } catch(e){}
    try{ CA.events.emit('sfx','boom'); } catch(e){}
  }

  function triggerAvalanche(){
    if (avalanche) return;
    const dir = Math.random()<0.5 ? -1 : 1;
    // start near a side, slide toward the middle
    const x = dir>0 ? U.rand(40, W*0.35) : U.rand(W*0.65, W-40);
    const low = CA.settings && CA.settings.quality==='low';
    let n = low ? 22 : 46;
    if (reduced()) n = Math.round(n * 0.5);   // calmer debris field under reduced-motion
    const parts = new Array(n);
    for (let i=0;i<n;i++){
      const px = x + (Math.random()*2-1)*70;
      parts[i] = {
        x: px,
        y: groundY(px) - 40 - Math.random()*60,
        vx: dir * (1.4 + Math.random()*1.6),
        vy: 0.5 + Math.random()*0.8,
        sz: 2 + Math.random()*3,
        life: 60 + (Math.random()*40|0),
      };
    }
    avalanche = { x, dir, w:140, parts, life: 90 };
  }

  function updateAvalanche(dt){
    if (!avalanche) return;
    const a = avalanche;
    a.life -= dt;
    let anyAlive = false;
    for (let i=0;i<a.parts.length;i++){
      const p = a.parts[i];
      if (p.life <= 0) continue;
      anyAlive = true;
      p.life -= dt;
      p.vy = Math.min(p.vy + 0.06*dt, 4);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // settle on the ground surface
      const gy = groundY(p.x);
      if (p.y >= gy){ p.y = gy; p.vy = 0; p.vx *= 0.86; }
    }
    // light shove of units the slide rolls over (knockback only, ~0 damage).
    // Routed through CA.explode with tiny radius/dmg so it stays in the pipeline.
    if ((CA.state.frame & 7) === 0){
      try{
        for (const u of (CA.state.units||[])){
          if (!u || !u.alive) continue;
          // only shove near the leading edge of the slide
          let near = false;
          for (let i=0;i<a.parts.length;i+=6){
            const p = a.parts[i];
            if (p.life>0 && U.dist(p.x,p.y,u.x,u.y) < 26){ near = true; break; }
          }
          if (near && typeof CA.explode === 'function'){
            CA.explode(u.x - a.dir*4, u.y, 12, 0.4, 0.5);
          }
        }
      } catch(e){}
    }
    if (a.life <= 0 || !anyAlive) avalanche = null;
  }

  function ensureParts(type){
    // Terrain can change the map width (graveyard is wider) after module load.
    W = C.WORLD_W; H = C.WORLD_H;
    const low = CA.settings && CA.settings.quality === 'low';
    let n = 0;
    if (type === 'rain' || type === 'storm') n = low ? 70 : 180;
    else if (type === 'snow') n = low ? 50 : 140;
    // reduced-motion: halve the falling-particle field so the screen is far calmer
    // (still hints the weather, without a dense moving curtain).
    if (reduced()) n = Math.round(n * 0.5);
    if (n === 0){ parts = null; partType = type; return; }
    parts = new Array(n);
    for (let i=0;i<n;i++){
      parts[i] = {
        x: Math.random()*W,
        y: Math.random()*H,
        vx: 0, vy: 0,
        len: 6 + Math.random()*10,
        sz: 1 + Math.random()*2.4,
        ph: Math.random()*Math.PI*2,
      };
    }
    partType = type;
  }

  CA.Weather = {
    init(){
      if(!CA.state.weather) CA.state.weather={type:'clear',gust:0,fog:0,slip:0,t:0};
      // seed-derived gust phase so the wind stream is identical for the same seed
      // (QA3 [P2]) — replaces Math.random()*2π.
      wxStep = 0;
      gustPhase = nextRand()*Math.PI*2;
      baseWind = CA.state.wind || 0;
      bolt = { phase:'idle', t:0, x:0, y:0, jag:null, flash:0 };
      avalanche = null;
      strikeCd = 1; avCd = 1;
      ensureParts(CA.state.weather.type);
    },

    set(type){
      if (!type || type==='random'){
        // weighted random: clear most common (the 'random' picker value lands here)
        type = U.pick(['clear','clear','rain','snow','fog','storm']);
      }
      const cfg = TYPES[type] || TYPES.clear;
      CA.state.weather = { type, gust:0, fog:cfg.fog, slip:cfg.slip, t:0 };
      // seed-derived gust phase (QA3 [P2]) — same seed → same gust stream.
      gustPhase = nextRand()*Math.PI*2;
      baseWind = CA.state.wind || 0;  // anchor gust swings to the current wind
      // reset hazard schedulers when weather changes
      bolt = { phase:'idle', t:0, x:0, y:0, jag:null, flash:0 };
      avalanche = null;
      strikeCd = 1; avCd = 1;
      ensureParts(type);
    },

    // sensible DEFAULT weather for a theme (the New-Game flow can call this to
    // pick a fitting opening weather instead of always 'clear'). Pure lookup:
    // returns a weather TYPE string ('clear'|'rain'|'snow'|'fog'|'storm'). The
    // graveyard leans atmospheric — fog, with an occasional light rain — and
    // never re-enables anything that was explicitly disabled (no spook wind /
    // amb_wind here; fog & rain are normal weather types). Defensive default.
    defaultFor(theme){
      switch((theme||'').toLowerCase()){
        case 'graveyard': return Math.random() < 0.6 ? 'fog' : 'rain';
        case 'snow':      return 'snow';
        default:          return 'clear';
      }
    },

    onNewRound(){
      const w = CA.state.weather;
      if (!w) return;
      // seed-derived gust phase + weather-shift roll + wind kick so the round-to-
      // round wind progression is identical for every client on the same seed
      // (QA3 [P2]) — these all replace Math.random(). Same feel, deterministic.
      gustPhase = nextRand()*Math.PI*2;
      // a small chance to shift weather between rounds for variety
      if (nextRand() < 0.18) this.set();
      // pick a fresh calm wind for the turn. Storms start from a wilder base so
      // every turn's wind reads differently; calm weather drifts only a touch.
      const cfg = TYPES[w.type] || TYPES.clear;
      const kick = (w.type==='storm') ? (nextRand()*2-1)*0.45 : (nextRand()*2-1)*0.15;
      CA.state.wind = U.clamp((CA.state.wind||0) + kick, -1, 1);
      baseWind = CA.state.wind;

      // ----- weather-hazard scheduling (rate-limited, fair) -----------------
      // Lightning only during storms; avalanche only on snow maps. Each has a
      // per-turn cooldown so they sprinkle in (~once every few turns) rather
      // than firing constantly.
      if (strikeCd > 0) strikeCd--;
      if (avCd > 0) avCd--;
      const theme = (CA.state.theme||'').toLowerCase();
      if (w.type === 'storm' && strikeCd <= 0 && bolt.phase === 'idle'){
        if (Math.random() < 0.45){ triggerLightning(); strikeCd = 2 + (Math.random()*2|0); }
      }
      if (theme === 'snow' && avCd <= 0 && !avalanche){
        if (Math.random() < 0.35){ triggerAvalanche(); avCd = 3 + (Math.random()*2|0); }
      }
    },

    update(dt){
      const w = CA.state.weather;
      if (!w) return;
      dt = dt || 1;
      w.t += dt;
      const cfg = TYPES[w.type] || TYPES.clear;

      // gust: sinusoidal, strongest & faster for storm. Two summed sines give
      // the storm an irregular, hard-to-predict swing instead of a clean wave.
      gustPhase += dt * (w.type==='storm' ? 0.07 : 0.025);
      let gustN = Math.sin(gustPhase);
      if (w.type==='storm') gustN = 0.7*gustN + 0.3*Math.sin(gustPhase*2.3 + 1.1);
      w.gust = gustN * cfg.gustAmp;

      // WIND IS CONSTANT FOR THE WHOLE TURN (Jani: "a szél össze-vissza megy néha
      // egy körön belül"). Worms-style — the wind is fixed when the turn starts and
      // must NOT swing while you aim, or shots become unreadable/unfair. So we no
      // longer drift CA.state.wind here; it stays at this turn's `baseWind` (set at
      // turn start). `w.gust`/`gustN` are still computed ABOVE purely so the rain/
      // snow PARTICLES below keep their lively atmospheric sway — the gameplay wind
      // value the projectiles read is untouched mid-turn.

      // advance particles
      if (parts){
        const baseWind = (CA.state.wind||0) * 4 + w.gust * 30;
        for (let i=0;i<parts.length;i++){
          const p = parts[i];
          if (w.type==='snow'){
            p.x += (baseWind*0.4 + Math.sin(w.t*0.05 + p.ph)*0.8) * dt;
            p.y += (0.9 + p.sz*0.25) * dt;
          } else { // rain / storm
            p.x += (baseWind + 1.5) * dt;
            p.y += (11 + p.sz*2) * dt;
          }
          // recycle when off the world band
          if (p.y > H){ p.y = -10; p.x = Math.random()*W; }
          if (p.x > W+20){ p.x = -20; }
          else if (p.x < -20){ p.x = W+20; }
        }
      }

      // ----- lightning state machine ----------------------------------------
      // aim: telegraph for ~38 frames (flickering target marker) so it's fair;
      // strike: bright bolt + small CA.explode; then a short fade back to idle.
      if (bolt.phase === 'aim'){
        bolt.t += dt;
        if (bolt.t >= 38){ bolt.phase = 'strike'; bolt.t = 0; doStrike(); }
      } else if (bolt.phase === 'strike'){
        bolt.t += dt;
        bolt.flash = Math.max(0, bolt.flash - 0.06*dt);
        if (bolt.t >= 18){ bolt.phase = 'idle'; bolt.jag = null; bolt.flash = 0; }
      }

      // ----- avalanche ------------------------------------------------------
      if (avalanche) updateAvalanche(dt);

      // ----- ground-fog scroll (graveyard) ----------------------------------
      // advance the rolling-fog offset here so renderOverlay stays draw-only.
      // reduced-motion: crawl (still readable as fog, but no distracting drift).
      const fogSpd = reduced() ? 0.04 : 0.25;
      fogScroll += fogSpd * dt;
      if (fogStripW > 0) fogScroll %= fogStripW;
    },

    renderFx(ctx){
      const w = CA.state.weather;
      if (!w || !parts) return;
      const view = worldView();
      const vx0 = view.x - view.pad, vx1 = view.x + view.w + view.pad;
      const vy0 = view.y - view.pad, vy1 = view.y + view.h + view.pad;

      if (w.type==='snow'){
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        visibleParts(view, (p,x,y)=>{
          ctx.beginPath(); ctx.arc(x, y, p.sz*0.9, 0, Math.PI*2); ctx.fill();
        });
      } else { // rain / storm streaks
        ctx.strokeStyle = w.type==='storm' ? 'rgba(170,190,220,0.55)' : 'rgba(180,200,230,0.45)';
        ctx.lineWidth = 1.4;
        const skew = (CA.state.wind||0) * 6 + w.gust*40;
        ctx.beginPath();
        visibleParts(view, (p,x,y)=>{
          ctx.moveTo(x, y);
          ctx.lineTo(x - skew*0.3 - 1, y + p.len);
        });
        ctx.stroke();
        ctx.lineWidth = 1;

        // occasional lightning flash for storm — suppressed under reduced-motion
        // (the strobe-like full-screen white is the worst a11y offender here).
        if (w.type==='storm' && !reduced()){
          const flash = Math.sin(w.t*0.9) > 0.985;
          if (flash){
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(vx0, vy0, vx1-vx0, vy1-vy0);
          }
        }
      }

      // ----- lightning telegraph + bolt (world space) -----------------------
      if (bolt.phase === 'aim'){
        // flickering aim line + target marker so the player sees it coming.
        // reduced-motion: hold it STEADY (no flicker) — still a clear telegraph.
        const blink = reduced() ? true : (Math.sin(bolt.t*0.8) > 0);
        ctx.save();
        ctx.globalAlpha = blink ? 0.55 : 0.25;
        ctx.strokeStyle = 'rgba(255,240,160,0.9)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6,6]);
        ctx.beginPath(); ctx.moveTo(bolt.x, Math.min(-20, vy0)); ctx.lineTo(bolt.x, bolt.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,220,120,0.9)';
        ctx.beginPath(); ctx.arc(bolt.x, bolt.y, 10 + (blink?4:0), 0, Math.PI*2); ctx.stroke();
        ctx.restore();
      } else if (bolt.phase === 'strike' && bolt.jag){
        ctx.save();
        // whole-screen flash burst on strike
        if (bolt.flash > 0){
          ctx.fillStyle = 'rgba(255,255,255,'+(0.30*bolt.flash).toFixed(3)+')';
          ctx.fillRect(vx0, vy0, vx1-vx0, vy1-vy0);
        }
        ctx.globalCompositeOperation = 'lighter';
        // glow pass then bright core
        ctx.strokeStyle = 'rgba(150,200,255,0.6)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(bolt.jag[0].x, Math.min(bolt.jag[0].y, vy0));
        for (let i=0;i<bolt.jag.length;i++) ctx.lineTo(bolt.jag[i].x, bolt.jag[i].y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(bolt.jag[0].x, Math.min(bolt.jag[0].y, vy0));
        for (let i=0;i<bolt.jag.length;i++) ctx.lineTo(bolt.jag[i].x, bolt.jag[i].y);
        ctx.stroke();
        ctx.restore();
      }

      // ----- avalanche debris (world space) ---------------------------------
      if (avalanche){
        ctx.save();
        ctx.fillStyle = 'rgba(245,250,255,0.9)';
        for (let i=0;i<avalanche.parts.length;i++){
          const p = avalanche.parts[i];
          if (p.life <= 0) continue;
          if (p.x < vx0 || p.x > vx1) continue;
          if (p.y < vy0 || p.y > vy1) continue;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
      }
    },

    renderOverlay(ctx){
      const w = CA.state.weather;
      if (!w) return;
      const VW = C.VIEW_W, VH = C.VIEW_H;

      // biome spooky-tint — a single cheap full-viewport wash keyed to the map
      // theme, UNDER the fog veil below. Kept light so it composes cleanly with
      // fx.js's daytime tint + vignette (don't double-darken into mud). Runs on
      // all quality tiers (a single fillRect is effectively free).
      const bt = biomeTint();
      if (bt){
        ctx.save();
        ctx.fillStyle = 'rgba('+bt.col+','+bt.a+')';
        ctx.fillRect(0,0,VW,VH);
        ctx.restore();
      }

      // fog veil — flat screen-space wash + a soft vertical gradient
      if (w.fog > 0){
        ctx.save();
        const g = ctx.createLinearGradient(0,0,0,VH);
        g.addColorStop(0,   'rgba(210,216,224,'+(w.fog*0.55).toFixed(3)+')');
        g.addColorStop(0.5, 'rgba(200,208,218,'+(w.fog*0.40).toFixed(3)+')');
        g.addColorStop(1,   'rgba(190,200,212,'+(w.fog*0.65).toFixed(3)+')');
        ctx.fillStyle = g;
        ctx.fillRect(0,0,VW,VH);
        ctx.restore();
      }

      // storm darkening (vignette-ish top-down dim)
      if (w.type==='storm'){
        ctx.save();
        ctx.fillStyle = 'rgba(20,24,40,0.22)';
        ctx.fillRect(0,0,VW,VH);
        ctx.restore();
      }

      // ----- signature graveyard ground-fog band ---------------------------
      // A cheap rolling fog strip near the bottom of the viewport: a gradient
      // strip baked ONCE (ensureFogStrip), drawImage'd twice at a scrolling
      // offset so it tiles seamlessly. Graveyard-only; skipped on low quality.
      const low = CA.settings && CA.settings.quality === 'low';
      if ((CA.state && CA.state.theme) === 'graveyard' && !low){
        const strip = ensureFogStrip(VW, VH);
        if (strip){
          const sw = strip.width, sh = strip.height;
          const y = VH - sh;
          // scroll leftward; draw two copies so the seam is always off-screen.
          let off = -(fogScroll % sw);
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(strip, off, y);
          ctx.drawImage(strip, off + sw, y);
          ctx.restore();
        }
      }
    },
  };
})();
