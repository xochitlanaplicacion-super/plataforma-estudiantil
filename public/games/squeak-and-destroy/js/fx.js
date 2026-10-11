/* ============================================================================
 * CUTE ANIMALS — fx.js   ::  AGENT FX — Particles, Explosions, Audio, BG
 * ----------------------------------------------------------------------------
 * Features: #26 theme-aware parallax background + daytime, #27 explosion juice,
 * #29 procedural music + expanded SFX, #35 quality setting, #31/#32 support.
 *
 * Public API (PRESERVED + extended):
 *   CA.FX:   init(ctx), update(dt), render(ctx), renderBg(ctx),
 *            explosion(x,y,r), impactBurst(x,y,r), knockbackTrail(unit),
 *            waterBubbles(x,y,amount,waterLevel), spawnParticles(opts)
 *   CA.Audio: init(), play(name), muted, + start()/stop() (music)
 * ==========================================================================*/
(function(){
  const S=CA.state, U=CA.util, C=CA.config;

  // Full-scene washes are drawn after core applies the world camera transform.
  // Canvas pixels are not world units at cinematic/manual zoom: use the actual
  // visible world rectangle for sky, daytime tint and both vignettes.
  function worldViewport(){
    const cam=S.camera||{};
    const zoom=Number.isFinite(cam.zoom)&&cam.zoom>0?cam.zoom:1;
    return {x:cam.x||0,y:cam.y||0,w:C.VIEW_W/zoom,h:C.VIEW_H/zoom,
      pad:40+((Math.abs(cam.shake||0))+1)/zoom};
  }

  // biome -> ambience loop file (assets/audio/<name>.ogg). When the file exists,
  // it plays INSTEAD of the gameplay music. Missing files fall back to music
  // (CA.Audio.ambient marks them bad on load error). Theme ids per maps.js.
  const AMB_BY_THEME = {
    // grass/jungle -> amb_grass REMOVED: the file never shipped, so the 404
    // held bgMusic(null) during the async error window = a music-less gap at
    // the start of every session's first match on the two most common themes.
    cave:'amb_cave', islands:'amb_ocean',
    graveyard:'amb_cave'   // reuse the cave loop — spooky/echoey fits the Temető
    // amb_wind (spook wind on desert/snow/volcano) REMOVED — user: "szörnyű".
    // those + city/space play the normal gameplay music.
  };

  // ---- #26b PHOTO PARALLAX BACKGROUNDS — painterly layered art per theme.
  // Transparent overlay layers (far->near) composited OVER the dynamic sky
  // gradient (so day/dusk/night + sun/moon stay live). Lazy-loaded via CA.img;
  // only used on normal/high quality (low quality keeps the cheap procedural
  // hills). Layers live in assets/bg/<theme>/. par = parallax factor (small=far).
  const PHOTO_BG = {
    desert: { dir:'assets/bg/desert/', fade:0.10, fadeCol:'250,240,215', layers:[
      { f:'l1.png', par:0.10 }, { f:'l2.png', par:0.18 },
      { f:'l3.png', par:0.30 }, { f:'l4.png', par:0.45 } ] },
    jungle: { dir:'assets/bg/jungle/', fade:0.40, fadeCol:'214,232,222', topFill:'#002c22', layers:[
      { f:'l1.png', par:0.08 }, { f:'l2.png', par:0.16 },
      { f:'l3.png', par:0.28 }, { f:'l4.png', par:0.45 } ] },
    islands: { dir:'assets/bg/islands/', fade:0.12, fadeCol:'225,238,250', layers:[
      { f:'l1.png', par:0.06 }, { f:'l2.png', par:0.10 },
      { f:'l3.png', par:0.22 }, { f:'l4.png', par:0.40 } ] },
    graveyard: { dir:'assets/bg/graveyard/', fade:0.12, fadeCol:'26,18,40', layers:[
      { f:'l1.png', par:0.05 }, { f:'l2.png', par:0.09 }, { f:'l3.png', par:0.15 },
      { f:'l4.png', par:0.24 }, { f:'l5.png', par:0.34 }, { f:'l6.png', par:0.46 } ] },
    snow: { dir:'assets/bg/snow/', fade:0.12, fadeCol:'235,242,250', layers:[
      { f:'l1.png', par:0.08 }, { f:'l2.png', par:0.16 },
      { f:'l3.png', par:0.28 }, { f:'l4.png', par:0.44 } ] },
    halloween: { dir:'assets/bg/halloween/', topFill:'#896b3e', fade:0.20, fadeCol:'40,26,16', layers:[
      { f:'l1.png', par:0.04 }, { f:'l2.png', par:0.09 }, { f:'l3.png', par:0.15 },
      { f:'l4.png', par:0.24 }, { f:'l5.png', par:0.34 }, { f:'l6.png', par:0.46 } ] },
    beach: { dir:'assets/bg/beach/', fade:0.45, fadeCol:'225,238,250', layers:[
      { f:'l1.png', par:0.06 }, { f:'l2.png', par:0.10 },
      { f:'l3.png', par:0.22 }, { f:'l4.png', par:0.40 } ] },
    volcano: { dir:'assets/bg/volcano/', aligned:true, topFill:'#57516e', fade:0.05, fadeCol:'40,20,24', layers:[
      { f:'l1.png', par:0.05 }, { f:'l2.png', par:0.10 }, { f:'l3.png', par:0.15 },
      { f:'l4.png', par:0.21 }, { f:'l5.png', par:0.28 }, { f:'l6.png', par:0.36 },
      { f:'l7.png', par:0.44 }, { f:'l8.png', par:0.52 } ] },
    cave: { dir:'assets/bg/cave/', topFill:'#13303f', fade:0.24, fadeCol:'14,28,40', layers:[
      { f:'l1.jpg', par:0.05 } ] },
    space: { dir:'assets/bg/space/', topFill:'#380101', fade:0.45, fadeCol:'12,10,28', layers:[
      { f:'l1.png', par:0.03 }, { f:'l2.png', par:0.07 },
      { f:'l3.png', par:0.12 }, { f:'l4.png', par:0.18 } ] },
    candy: { dir:'assets/bg/candy/', fade:0.32, fadeCol:'255,228,238', layers:[
      { f:'l1.png', par:0.06 }, { f:'l2.png', par:0.14 }, { f:'l3.png', par:0.24 },
      { f:'l4.png', par:0.34 }, { f:'l5.png', par:0.46 } ] },
    grass: { dir:'assets/bg/grass/', fade:0.32, fadeCol:'205,228,235', layers:[
      { f:'l1.png', par:0.06 }, { f:'l2.png', par:0.12 }, { f:'l3.png', par:0.20 },
      { f:'l4.png', par:0.30 }, { f:'l5.png', par:0.44 } ] }
  };

  // particle caps scale with quality (#35)
  function maxParticles(){ var q=CA.settings&&CA.settings.quality; return q==='low'?300:(q==='normal'?380:450); }
  function lowQ(){ return CA.settings && CA.settings.quality==='low'; }
  // "Normál" must sit BETWEEN low and high — true 3-tier (#35 fix). medQ() is the
  // mid step: it's also true under low so a "low || normal" gate trims the same
  // heavy effects on both, while high keeps everything.
  function medQ(){ var q=CA.settings&&CA.settings.quality; return q==='low'||q==='normal'; }
  // generic 0..1 quality scalar for particle/bloom counts: low=0.5, normal=0.75,
  // high=1. Use round(n*qScale()) for any "drága" count so all three tiers differ.
  function qScale(){ var q=CA.settings&&CA.settings.quality; return q==='low'?0.5:(q==='normal'?0.75:1); }
  // colorblind on? core.js stores CA.settings.colorblind as 'off' | deficiency id.
  function cbOn(){ return !!(CA.settings && CA.settings.colorblind && CA.settings.colorblind!=='off'); }

  // floating-text base font (damage/heal numbers). Crit overrides to ~22px.
  const TEXT_FONT="bold 16px system-ui, -apple-system, sans-serif";
  // count live text particles (for the low-quality simultaneous-text cap)
  function textCount(){
    const arr=S.particles; let n=0;
    for(let i=0;i<arr.length;i++){ if(arr[i].kind==='text') n++; }
    return n;
  }

  // ---- procedural cloud / star layout (stable across frames) ----
  const clouds=[];
  for(let i=0;i<10;i++){
    clouds.push({ x:U.rand(0,C.WORLD_W*1.4), y:U.rand(40,240), s:U.rand(0.7,1.8), spd:U.rand(0.05,0.22), depth:U.rand(0.15,0.4) });
  }
  // a fainter, HIGHER & SLOWER cloud band for extra depth (parallax behind the main clouds)
  const farClouds=[];
  for(let i=0;i<7;i++){
    farClouds.push({ x:U.rand(0,C.WORLD_W*1.6), y:U.rand(20,150), s:U.rand(1.1,2.4), spd:U.rand(0.02,0.08), depth:U.rand(0.06,0.13) });
  }
  const stars=[];
  for(let i=0;i<70;i++){
    stars.push({ x:U.rand(0,C.WORLD_W), y:U.rand(0,420), r:U.rand(0.6,1.8), tw:U.rand(0,Math.PI*2), depth:U.rand(0.05,0.2) });
  }
  let bgT=0;

  // ---- GRAVEYARD silhouette layout (stable across frames) — a parallax band of
  // tombstones, bare dead trees and a distant crypt drawn as dark silhouettes in
  // front of the hills. Cheap: each is a couple of paths. Laid out once.
  const graveSil=(function(){
    const arr=[];
    let x=40;
    while(x < C.WORLD_W*1.3){
      const r=Math.random();
      if(r<0.16) arr.push({ kind:'tree',  x, s:0.8+Math.random()*0.7, depth:0.10 });
      else if(r<0.30) arr.push({ kind:'crypt', x, s:0.9+Math.random()*0.5, depth:0.08 }); // more crypts (Jani)
      else arr.push({ kind:'stone', x, s:0.7+Math.random()*0.8, depth:0.10+Math.random()*0.05 });
      x += 60+Math.random()*120;
    }
    // GUARANTEED prominent crypt centre-stage so the graveyard always reads as a
    // graveyard (Jani: "legyen kripta a háttérben"). Bigger scale, drawn last.
    arr.push({ kind:'crypt', x:C.WORLD_W*0.5, s:1.7, depth:0.07 });
    arr.push({ kind:'crypt', x:C.WORLD_W*0.18, s:1.3, depth:0.085 });
    return arr;
  })();
  // drifting fog band offsets (a few soft horizontal blobs)
  const graveFog=[];
  for(let i=0;i<5;i++){
    graveFog.push({ x:U.rand(0,C.WORLD_W*1.2), y:U.rand(440,620), s:U.rand(1.0,2.2), spd:U.rand(0.05,0.16), depth:U.rand(0.10,0.22) });
  }

  // ---- VOLCANO silhouette layout (stable across frames) — the volcano is no
  // longer playable terrain (Jani); instead a big dark volcano cone is drawn into
  // the BACKGROUND (like the graveyard silhouettes) with a glowing crater + a
  // lava run-off streak, plus drifting smoke/ash puffs rising from the summit.
  // Laid out once: one main cone + one or two smaller distant cones for depth.
  const volcSil=(function(){
    const arr=[];
    // main cone, slightly off-centre, farther/slower parallax so it sits "behind"
    arr.push({ x:C.WORLD_W*0.62, baseY:600, w:520, h:300, depth:0.10, main:true });
    // a smaller, hazier distant cone on the left for layered depth
    arr.push({ x:C.WORLD_W*0.22, baseY:580, w:300, h:160, depth:0.06, main:false });
    return arr;
  })();
  // rising smoke/ash puffs from the main crater (drift up + sideways, loop)
  const volcSmoke=[];
  for(let i=0;i<6;i++){
    volcSmoke.push({ t:U.rand(0,1), x:U.rand(-30,30), s:U.rand(0.8,1.8), spd:U.rand(0.0006,0.0016), sway:U.rand(0,Math.PI*2) });
  }

  // ---- DESERT heat-haze band: 2 sin-offset translucent ribbons at the horizon
  // (stable phase seeds; the shimmer is animated via bgT, not re-randomised). ----
  const desertHaze=[];
  for(let i=0;i<2;i++){
    desertHaze.push({ y:498+i*16, amp:5+i*3, ph:U.rand(0,Math.PI*2), spd:0.018+i*0.008, depth:0.07+i*0.03 });
  }

  // ---- JUNGLE fireflies: a handful of drifting glow points (stable home + a
  // slow looping orbit driven by bgT; never re-randomised per frame). ----
  const jungleFlies=[];
  for(let i=0;i<5;i++){
    jungleFlies.push({ x:U.rand(0,C.WORLD_W*1.2), y:U.rand(360,560), r:1.6+U.rand(0,1.4),
      ph:U.rand(0,Math.PI*2), spd:0.6+U.rand(0,0.8), rad:14+U.rand(0,18), depth:0.18+U.rand(0,0.12) });
  }

  // ---- GRAVEYARD fireflies: ~30 slow drifting warm green-yellow glow points
  // (signature spooky atmosphere). Stable home + slow looping orbit + gentle sine
  // bob, all driven by bgT (never re-randomised per frame). Rendered additively
  // via the baked glow sprite. Capped by quality tier & reducedMotion at draw time
  // (the array holds the high-tier max; the renderer slices it). ----
  const graveFlies=[];
  for(let i=0;i<30;i++){
    graveFlies.push({ x:U.rand(0,C.WORLD_W*1.2), y:U.rand(380,580), r:1.4+U.rand(0,1.3),
      ph:U.rand(0,Math.PI*2), spd:0.4+U.rand(0,0.7), rad:10+U.rand(0,16),
      bob:U.rand(0,Math.PI*2), depth:0.16+U.rand(0,0.14) });
  }

  // ---- CAVE drips + stalactite silhouettes (stable layout; drips loop on bgT) --
  const caveStal=[];          // hanging stalactite triangles along the cave ceiling
  for(let i=0;i<3;i++){
    caveStal.push({ x:U.rand(0,C.WORLD_W*1.2), w:26+U.rand(0,28), h:60+U.rand(0,80), depth:0.10+U.rand(0,0.06) });
  }
  const caveDrips=[];         // falling droplets (looping fall via phase)
  for(let i=0;i<6;i++){
    caveDrips.push({ x:U.rand(0,C.WORLD_W*1.2), top:U.rand(70,180), fall:U.rand(180,320),
      t:U.rand(0,1), spd:0.004+U.rand(0,0.004), depth:0.12+U.rand(0,0.06) });
  }

  // ---- ISLANDS far sails / islet silhouettes on the horizon (stable layout) ----
  const islSails=[];
  for(let i=0;i<2;i++){
    islSails.push({ x:U.rand(C.WORLD_W*0.2,C.WORLD_W*1.0), isle:Math.random()<0.5,
      s:0.8+U.rand(0,0.6), bob:U.rand(0,Math.PI*2), depth:0.05+i*0.02 });
  }

  // ---- SNOW: distant frosted mountain-peak silhouettes (stable layout) + a few
  // slow drifting glints (only as background accent; world snowfall is handled by
  // the weather particles). Stable seeds; glints loop on bgT, never re-randomised.
  const snowPeaks=(function(){
    const arr=[];
    // 3 frosty peaks at far/slow parallax so they sit behind the parallax hills
    arr.push({ x:C.WORLD_W*0.30, baseY:470, w:360, h:230, depth:0.05 });
    arr.push({ x:C.WORLD_W*0.66, baseY:450, w:440, h:300, depth:0.07 });
    arr.push({ x:C.WORLD_W*1.02, baseY:475, w:300, h:200, depth:0.06 });
    return arr;
  })();
  const snowGlint=[];
  for(let i=0;i<7;i++){
    snowGlint.push({ x:U.rand(0,C.WORLD_W*1.2), y:U.rand(120,400), r:0.8+U.rand(0,1.2),
      ph:U.rand(0,Math.PI*2), spd:0.5+U.rand(0,0.7), depth:0.08+U.rand(0,0.06) });
  }

  // ---- CITY: distant lit skyline silhouette. A stable row of buildings with a
  // deterministic lit-window pattern (no per-frame randomness). Two parallax rows.
  const cityRows=(function(){
    const rows=[];
    for(let r=0;r<2;r++){
      const buildings=[];
      const depth = r===0 ? 0.06 : 0.12;     // far row hazier/slower, near row crisper
      let cx=U.rand(0,120);
      while(cx < C.WORLD_W*1.3){
        const w = 40+U.rand(0,70);
        const h = (r===0 ? 90+U.rand(0,150) : 140+U.rand(0,220));
        // deterministic lit-window seed per building
        buildings.push({ x:cx, w, h, lit:U.rand(0,1) });
        cx += w + 6 + U.rand(0,18);
      }
      rows.push({ depth, buildings, baseY: r===0 ? 560 : 600 });
    }
    return rows;
  })();

  // ---- SPACE: a starfield (denser than the night stars) + 1 hazy nebula blob and
  // a faint distant planet silhouette. Stable seeds; additive twinkle via bgT. ----
  const spaceStars=[];
  for(let i=0;i<70;i++){
    spaceStars.push({ x:U.rand(0,C.WORLD_W*1.2), y:U.rand(0,520), r:U.rand(0.5,1.6),
      tw:U.rand(0,Math.PI*2), depth:U.rand(0.04,0.18) });
  }
  const spaceNebula={ x:C.WORLD_W*0.34, y:240, rx:300, ry:160, depth:0.04, hue:268 };
  const spacePlanet={ x:C.WORLD_W*0.78, y:170, r:64, depth:0.05 };

  // ---- per-match day phase seed (#11): a gently-varying time-of-day so each
  // match has its own light, drifting slowly across the round. Cheap math only.
  let dayPhase=Math.random();   // 0..1 baseline offset, re-seeded each match start

  // returns a smooth 0..1 day cycle value (0=deep night,0.5=noon,1=night again)
  function dayCycle(){
    // very slow drift over the match + the per-match seed. One full cycle ~ a
    // few thousand frames so it's a gentle shift, not a strobe.
    return (dayPhase + bgT*0.00007) % 1;
  }
  // a soft warm/cool tint overlay for the current daytime. Returns null to skip.
  function daytimeTint(forced){
    // forced: explicit theme daytime ('night'/'dusk'/'day') biases the cycle.
    let c=dayCycle();
    if(forced==='night') c=0.96;
    else if(forced==='dusk') c=0.80;
    // map cycle -> {color, alpha}. Dawn warm, noon clear, dusk warm, night blue.
    // c: 0 night .15 dawn .35-.65 day .80 dusk .96 night
    if(c<0.12 || c>0.90){ return {col:'10,16,40', a:0.34}; }        // night blue
    if(c<0.22){ const k=(c-0.12)/0.10; return {col:'255,150,90', a:0.20*(1-k)+0.06}; } // dawn warm fading
    if(c<0.62){ return null; }                                       // bright noon, no tint
    if(c<0.80){ const k=(c-0.62)/0.18; return {col:'255,140,70', a:0.04+0.16*k}; }    // afternoon -> dusk warm
    const k=(c-0.80)/0.10; return {col:'120,80,120', a:0.18+0.16*k}; // dusk -> night
  }
  // is the scene "dark" (cave theme or night-ish phase)? Drives the unit glow.
  function isDarkScene(forced){
    const th=(S.theme||'')+'';
    if(/cave|cavern|dark|underground/i.test(th)) return true;
    if(forced==='night') return true;
    const c=dayCycle();
    return (c<0.14 || c>0.86);
  }
  CA.events && CA.events.on && CA.events.on('gameStart', ()=>{ dayPhase=Math.random(); gravestones.length=0; });

  /* ------------------------------------------------------------------ *
   * GRAVESTONES / death markers (#4) — a small team-tinted headstone is
   * placed where a unit dies and stays for the rest of the match (cute-
   * spooky flavour). Kept in their OWN array (NOT S.particles, which gets
   * capped/shifted) so they persist. Cheap: a few rects + an arc per stone,
   * drawn in world space inside render(). Reset on gameStart.
   * A small spawn "rise" animation plays unless reducedMotion is on.
   * ------------------------------------------------------------------ */
  const gravestones=[];
  const GRAVE_CAP=40;                 // hard cap so a long match never bloats
  function reduced(){ return !!(CA.settings && CA.settings.reducedMotion); }
  CA.events && CA.events.on && CA.events.on('unitDied', function(unit){
    try{
      if(!unit || unit.x==null || unit.y==null) return;
      // tasteful screen-space kill pop (flash + tiny shake; reduced-motion aware)
      try{ if(CA.FX && CA.FX.killPop) CA.FX.killPop(unit.x, unit.y-4); }catch(_){}
      const team = (CA.getTeam && unit.teamId!=null) ? CA.getTeam(unit.teamId) : null;
      const col = (team && team.color) ? team.color : '#9aa6b2';
      if(gravestones.length>=GRAVE_CAP) gravestones.shift();
      gravestones.push({
        x: unit.x,
        y: unit.y,                    // ground spot (unit anchor is near its feet)
        color: col,
        variant: (Math.random()<0.5)?0:1,   // 0 = rounded headstone, 1 = cross
        tilt: U.rand(-0.06,0.06),     // slight lean so a row isn't uniform
        // spawn animation: 0..1 grow-in. reducedMotion => place instantly.
        t: reduced()?1:0
      });
    }catch(e){ /* never throw */ }
  });

  // draw all persistent gravestones (world space, called from render()).
  function renderGravestones(ctx){
    if(!gravestones.length) return;
    ctx.save();
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    for(let i=0;i<gravestones.length;i++){
      const gs=gravestones[i];
      if(gs.t<1) gs.t=Math.min(1, gs.t+0.08);
      const k=gs.t;                                  // grow-in scale 0..1
      const h=18*k, w=12*k;                          // stone size
      ctx.save();
      ctx.translate(gs.x, gs.y);
      ctx.rotate(gs.tilt);
      // little mound of dirt at the base (cheap ellipse)
      ctx.globalAlpha=0.6;
      ctx.fillStyle='rgba(40,30,22,0.9)';
      ctx.beginPath(); ctx.ellipse(0,0,w*0.95,3.2*k,0,0,7); ctx.fill();
      ctx.globalAlpha=1;
      // team-tinted stone, darkened so it reads as carved rock
      const stone=shade(gs.color,-0.45);
      ctx.fillStyle=stone;
      ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=1;
      if(gs.variant===0){
        // rounded headstone: rect with a domed top
        ctx.beginPath();
        ctx.moveTo(-w/2, 0);
        ctx.lineTo(-w/2, -h*0.55);
        ctx.arc(0, -h*0.55, w/2, Math.PI, 0, false);
        ctx.lineTo(w/2, 0);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // RIP-ish carved line (team color, faint)
        ctx.globalAlpha=0.55; ctx.fillStyle=shade(gs.color,0.15);
        ctx.fillRect(-w*0.28,-h*0.62,w*0.56,1.4*k);
        ctx.fillRect(-w*0.28,-h*0.50,w*0.56,1.4*k);
        ctx.globalAlpha=1;
      } else {
        // simple cross
        ctx.fillRect(-w*0.16, -h, w*0.32, h);        // vertical
        ctx.strokeRect(-w*0.16, -h, w*0.32, h);
        ctx.fillRect(-w*0.5, -h*0.72, w, w*0.32);    // horizontal
        ctx.strokeRect(-w*0.5, -h*0.72, w, w*0.32);
      }
      // top highlight so the stone has a bit of form
      ctx.globalAlpha=0.18; ctx.fillStyle='#fff';
      ctx.fillRect(-w/2, -h*0.55, w*0.35, h*0.5);
      ctx.globalAlpha=1;
      ctx.restore();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * MOVING BACKGROUND OBJECTS — drift across the sky at parallax depth.
   * Spawn off-screen, drift, loop. Capped & cheap; behind gameplay.
   * Types: balloon, plane (banner), kite, airship, birds.
   * ------------------------------------------------------------------ */
  const skyObjects=[];
  // theme flavour: volcano = ash/embers (handled in renderBg via particles-ish),
  // snow = fewer drifters. We bias the spawn pool by theme name.
  function skyObjCap(){
    if(lowQ()) return 0;                 // low quality => no drifters
    const th=(S.theme||'')+'';
    const themed=/snow|ice|tundra|arctic|volcano|lava|ember|ash/i.test(th);
    // SKY ('Ég'): the whole map IS the sky — pack it with more drifters.
    if(th==='sky') return medQ()?3:5;
    // 3-tier (#35 fix): high keeps the full band, normal a thinner one, low none.
    if(themed) return medQ()?1:2;
    return medQ()?2:4;
  }
  function spawnSkyObject(){
    const th=(S.theme||'')+'';
    let pool=['balloon','plane','kite','airship','birds','birds'];
    if(/snow|ice|tundra|arctic/i.test(th)) pool=['airship','birds','balloon'];
    if(/volcano|lava|ember|ash/i.test(th)) pool=['airship','birds','plane'];
    if(th==='sky') pool=['plane','plane','airship','balloon','kite','birds']; // sky = more planes

    const type=U.pick(pool);
    const dir=Math.random()<0.5?1:-1;
    // depth: smaller number = farther = slower & smaller & hazier
    const depth=U.rand(0.05,0.22);
    const y=U.rand(40,300);
    const off=200+U.rand(0,200);
    const x = dir>0 ? -off : (C.WORLD_W+off);
    const baseSpd=U.rand(0.25,0.7);
    const spd = baseSpd*dir*(0.6+depth*2);
    const hue=U.rand(0,1);
    skyObjects.push({ type, x, y, dir, depth, spd, t:U.rand(0,Math.PI*2),
                      s:U.rand(0.8,1.3), hue });
  }
  function updateSkyObjects(dt){
    const cap=skyObjCap();
    if(cap<=0){ skyObjects.length=0; return; }
    // prune anything that has drifted fully off the far side
    for(let i=skyObjects.length-1;i>=0;i--){
      const o=skyObjects[i];
      o.x += o.spd*dt;
      o.t += 0.04*dt;
      const margin=600;
      if((o.dir>0 && o.x>C.WORLD_W+margin) || (o.dir<0 && o.x<-margin)){
        skyObjects.splice(i,1);
      }
    }
    // top up toward cap, but stagger spawns so the sky isn't crowded at once
    if(skyObjects.length<cap && Math.random()<0.012){ spawnSkyObject(); }
  }

  function push(p){
    const arr=S.particles, cap=maxParticles();
    if(arr.length>=cap){ arr.shift(); }
    arr.push(p);
    return p;
  }

  // resolve active theme palette + daytime, with grass fallback (#26)
  function theme(){
    const t = CA.Maps && CA.Maps[S.theme];
    return (t && t.palette) ? t : null;
  }
  const FALLBACK_PAL={
    sky:['#5ea7d8','#8ec9ea','#d7efff'],
    hill1:'#bcd9b0', hill2:'#a3cf95',
    dirt:'#7a5a36', dirtDark:'#4f3a1e',
    water:'rgba(64,150,200,0.55)'
  };

  // terrain-coloured DEBRIS palette for the current theme. Returns an array of
  // 3-4 ground-ish hexes (dirt / dirtDark / hill tones) so blast chunks match
  // the map they're torn from. Defensive: falls back to the meadow browns.
  function debrisColors(){
    try{
      const t=theme();
      const p=(t&&t.palette)||FALLBACK_PAL;
      const cols=[];
      if(p.dirt) cols.push(p.dirt);
      if(p.dirtDark) cols.push(p.dirtDark);
      if(p.rock) cols.push(p.rock);
      if(p.hill2) cols.push(shade(p.hill2,-0.18));
      if(!cols.length) cols.push('#7a5a36','#5e4427','#8b6a40');
      return cols;
    }catch(e){ return ['#7a5a36','#5e4427','#8b6a40']; }
  }

  /* ------------------------------------------------------------------ *
   * PRE-RENDERED GLOW SPRITE (PERF). A soft white radial-gradient blob
   * baked ONCE into a small offscreen canvas at init, plus a couple of
   * pre-tinted copies (white / orange / yellow). The HOT per-particle
   * glow/flash/ember paths then `drawImage()` this sprite with
   * globalCompositeOperation='lighter' instead of calling
   * createRadialGradient() per particle per frame.
   *
   * iOS notes: the only shadowBlur-free way; we bake with ONE
   * createRadialGradient at init (no shadowBlur, no per-frame filter).
   * getContext('2d') can return null under iOS memory pressure — every
   * build is guarded and the callers fall back to the old gradient path
   * when `glowReady` is false.
   * ------------------------------------------------------------------ */
  var GLOW_SIZE=64;                    // sprite is GLOW_SIZE x GLOW_SIZE
  // ---- cartoon explosion sprite-sheet (GIF → 6×6 grid, 33 frames, gray keyed to
  // alpha so it composites source-over). Overlaid on the procedural blast. Lazy-
  // loaded; a missing/failed image silently leaves the procedural explosion alone.
  var EXPL_COLS=6, EXPL_CELL=128, EXPL_FRAMES=33;
  var _explImg=null, _explOK=false, _explSprites=[];
  var _powCooldown=0;
  const POW_SHAPE=[[-38,-5],[-27,-12],[-30,-22],[-13,-18],[-4,-27],[6,-19],[22,-23],[24,-12],[38,-7],[31,2],[38,12],[21,13],[16,23],[3,18],[-11,24],[-15,15],[-32,18],[-28,6]];
  const _knockTrailTimes=new WeakMap();
  CA.events && CA.events.on && CA.events.on('gameStart', function(){
    _powCooldown=0; _explSprites.length=0;
  });
  // PERF (QA #5): cache-elt háttér-gradiensek — a sky/water gradient világ-Y-ban
  // rögzített, a kamera-transzform pozícionálja fill-kor, így a kulcs csak a
  // téma-színektől + vízszinttől függ (nem a kameraállástól).
  var _skyGrad=null, _skyGradKey='';
  var _watGrad=null, _watGradKey='';
  function _loadExpl(){
    if(_explImg || typeof Image==='undefined') return;
    // sheet not shipped in this build → keep _explOK false, use the drawn burst
    if(CA._isMissingArt && CA._isMissingArt('assets/fx/explosion3.png')) return;
    try{
      _explImg=new Image();
      _explImg.onload=function(){ _explOK=(_explImg.width>0); };
      _explImg.onerror=function(){ _explOK=false; _explImg=null; };
      // ?v= cache-bust (minden más asset-fogyasztó konvenciója — re-export után
      // e nélkül a böngésző-cache a régi sheetet adta volna)
      _explImg.src='assets/fx/explosion3.png?v='+(CA.ASSET_V||'1');
    }catch(e){ _explImg=null; }
  }
  var glowReady=false;                 // true only when all sprites baked OK
  // tint index: 0=white, 1=orange, 2=yellow (warm green-yellow reuses 2/1)
  var glowSprites=[null,null,null];
  // tint multipliers applied to the baked white blob (source-over fill on a
  // copy). Kept warm to match the explosion palette.
  var GLOW_TINTS=[
    null,                 // 0: plain baked white blob
    '#ff9b30',            // 1: orange
    '#ffd24a'             // 2: yellow
  ];
  function _makeCanvas(w,h){
    try{
      if(typeof document==='undefined' || !document.createElement) return null;
      var c=document.createElement('canvas');
      c.width=w; c.height=h;
      return c;
    }catch(e){ return null; }
  }
  function _buildGlowSprite(){
    if(glowReady) return;             // bake once
    try{
      var base=_makeCanvas(GLOW_SIZE,GLOW_SIZE);
      if(!base) return;
      var bctx=base.getContext && base.getContext('2d');
      if(!bctx) return;               // iOS memory pressure -> fall back to gradients
      var c=GLOW_SIZE/2, rad=GLOW_SIZE/2;
      // ONE createRadialGradient, baked once: soft white core -> transparent.
      var g=bctx.createRadialGradient(c,c,0,c,c,rad);
      g.addColorStop(0,   'rgba(255,255,255,1)');
      g.addColorStop(0.35,'rgba(255,255,255,0.55)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.16)');
      g.addColorStop(1,   'rgba(255,255,255,0)');
      bctx.fillStyle=g;
      bctx.fillRect(0,0,GLOW_SIZE,GLOW_SIZE);
      glowSprites[0]=base;
      // tinted copies: draw the white blob, then multiply a flat colour over it
      // (keeps the soft alpha falloff, recolours the RGB).
      for(var ti=1;ti<GLOW_TINTS.length;ti++){
        var tc=_makeCanvas(GLOW_SIZE,GLOW_SIZE);
        if(!tc){ glowSprites[ti]=base; continue; }
        var tctx=tc.getContext && tc.getContext('2d');
        if(!tctx){ glowSprites[ti]=base; continue; }
        tctx.drawImage(base,0,0);
        tctx.globalCompositeOperation='source-in';   // recolour, keep alpha shape
        tctx.fillStyle=GLOW_TINTS[ti];
        tctx.fillRect(0,0,GLOW_SIZE,GLOW_SIZE);
        tctx.globalCompositeOperation='source-over';
        glowSprites[ti]=tc;
      }
      glowReady=true;
    }catch(e){ glowReady=false; }
  }
  // Draw a baked glow blob centred at (x,y) covering radius `r`, additively.
  // Caller is responsible for setting globalCompositeOperation='lighter' and
  // restoring it (we batch many of these between one save/restore). alpha is
  // applied via globalAlpha. tint: 0=white,1=orange,2=yellow. Returns true if
  // it drew (sprite ready), false so the caller can use the gradient fallback.
  function drawGlow(ctx,x,y,r,alpha,tint){
    if(!glowReady) return false;
    var spr=glowSprites[tint||0] || glowSprites[0];
    if(!spr) return false;
    var d=r*2;                         // sprite reaches its edge at radius r
    ctx.globalAlpha=alpha;
    ctx.drawImage(spr, x-r, y-r, d, d);
    return true;
  }

  CA.FX={
    init(){
      _buildGlowSprite();
      CA.events.on('explosion',(x,y,r)=>this.explosion(x,y,r));
      if(CA.Audio&&CA.Audio.init) CA.Audio.init();
      // ---- belt-and-braces AUDIO UNLOCK on the FIRST interaction anywhere ----
      // ui.js calls unlockAudio() on canvas taps, but the very first gesture might
      // land on a DOM control (input/button) or a path that doesn't, leaving iOS
      // Safari's AudioContext suspended and the menu music silent. This one-time
      // capture-phase listener guarantees the ctx is resumed + the current track
      // started from a real gesture, then removes itself. Idempotent & never throws.
      try{
        if(!CA.FX._unlockWired && typeof window!=='undefined' && window.addEventListener){
          CA.FX._unlockWired=true;
          var go=function(){
            try{ if(CA.Audio){ if(CA.Audio.init) CA.Audio.init(); else if(CA.Audio.unlock) CA.Audio.unlock(); } }catch(e){}
            window.removeEventListener('pointerdown',go,true);
            window.removeEventListener('touchstart',go,true);
            window.removeEventListener('mousedown',go,true);
            window.removeEventListener('keydown',go,true);
          };
          window.addEventListener('pointerdown',go,true);
          window.addEventListener('touchstart',go,true);
          window.addEventListener('mousedown',go,true);
          window.addEventListener('keydown',go,true);
        }
      }catch(e){}
      // #36: music is opt-in & gameplay-only — _syncMusic() (per frame) owns
      // start/stop entirely based on CA.settings.music + PLAYING mode. No need to
      // force-stop on gameStart anymore.
      // #34 burst confetti when the match ends (victory screen may also call it).
      CA.events.on('gameOver', (info)=>{
        try{
          const cx=(S.camera&&S.camera.x||0), cy=(S.camera&&S.camera.y||0);
          this.confetti(cx+C.VIEW_W*0.5, cy+60);
          this.confetti(cx+C.VIEW_W*0.25, cy+90, lowQ()?14:40);
          this.confetti(cx+C.VIEW_W*0.75, cy+90, lowQ()?14:40);
        }catch(e){}
      });
    },

    update(dt){
      bgT += (dt||1);
      _powCooldown=Math.max(0,_powCooldown-(dt||1));
      // advance + retire explosion sprite-sheet bursts
      if(_explSprites.length){
        for(var _e=_explSprites.length-1;_e>=0;_e--){ var s=_explSprites[_e]; s.t+=(dt||1); if(s.t>=s.dur) _explSprites.splice(_e,1); }
      }
      // keep moving background objects drifting (runs in menu + gameplay)
      updateSkyObjects(dt||1);
      // sync menu music to game mode every frame: on the menu -> play, else stop.
      this._syncMusic();
      const arr=S.particles;
      for(let i=0;i<arr.length;i++){
        const p=arr[i];
        p.life-=1;
        if(p.kind==='smoke'){ p.vy-=0.04; p.vx*=0.96; p.vy*=0.97; p.size+=p.grow||0.35; }
        else if(p.kind==='flash'){ p.size+=p.grow||1.6; }
        else if(p.kind==='ring'){ p.size+=p.grow||4; }
        else if(p.kind==='impact'){ p.size+=p.grow; }
        else if(p.kind==='pow'){
          // A short comic caption stays above the dust, below damage numbers.
          // Motion preference can change while an effect is already alive.
          if(!reduced()) p.y-=0.32;
          continue;
        }
        else if(p.kind==='bubble'){
          p.vx*=0.95;
          p.vy=Math.max(-1.5,p.vy-0.012);
          p.sway+=reduced()?0:0.10;
          p.x+=p.vx+(reduced()?0:Math.sin(p.sway)*0.15);
          p.y+=p.vy;
          // Follow a rising water line, and retire at the surface without sound.
          const wl=S.waterLevel!=null?S.waterLevel:(p.wl!=null?p.wl:C.WATER_LEVEL);
          if(p.y-p.size<=wl) p.life=0;
          continue;
        }
        else if(p.kind==='spark'){ p.px=p.x; p.py=p.y; p.vy+=0.22; p.vx*=0.97; }
        else if(p.kind==='ember'){ p.vy+=0.05; p.vx*=0.97; p.vy*=0.98; }   // hot, floaty afterglow
        else if(p.kind==='glow'||p.kind==='scorch'){ /* static, just fade */ }
        else if(p.kind==='text'){
          // floating damage/heal number: rise, ease, slight pop-in scale.
          // vy carries the rise speed (negative = up); ease it toward 0 so it
          // decelerates as it floats (worms-style). No gravity, no x drift
          // (crit gets a tiny horizontal shimmy below).
          p.vy*=0.94;
          p.x+=p.vx; p.y+=p.vy;
          p.vx*=0.90;
          // pop: scale springs from ~0.4 up past 1 then settles toward 1
          const age=1-(p.life/p.maxLife);           // 0..1 over life
          if(age<0.18){ p.scale=0.4 + (age/0.18)*0.85; } // quick pop to ~1.25
          else { p.scale += (1-p.scale)*0.25; }          // settle to 1.0
          // crit shimmy: a brief horizontal wobble near spawn
          if(p.shake && age<0.3){ p.sx=Math.sin(p.life*0.9)*p.shake*(0.3-age)/0.3; }
          else { p.sx=0; }
          continue;   // text doesn't share the generic move/water logic below
        }
        else if(p.kind==='confetti'){
          // flutter down: gentle gravity + sideways sway, terminal-ish fall
          p.vy+=0.05; if(p.vy>2.6) p.vy=2.6;
          p.sway=(p.sway||0)+0.12;
          p.vx=Math.sin(p.sway)*1.1 + (p.drift||0);
        }
        else { p.vy+=p.g!=null?p.g:0.18; p.vx*=0.985; } // dirt/water/generic
        p.x+=p.vx; p.y+=p.vy;
        if(p.rot!=null){ p.rot+=p.spin||0; }
        const wl=S.waterLevel||C.WATER_LEVEL;
        if((p.kind==='dirt'||p.kind==='water') && p.y>wl && p.vy>0){
          p.vy*=-0.32; p.vx*=0.6; p.y=wl;
        }
        // embers fizzle out the instant they touch water (no bounce — they die)
        else if(p.kind==='ember' && p.y>wl){ p.life=Math.min(p.life,3); }
      }
      // cull dead
      let w=0;
      for(let i=0;i<arr.length;i++){ if(arr[i].life>0) arr[w++]=arr[i]; }
      arr.length=w;

      // ---- subtle ground footsteps for the active unit while walking ----
      // Detect via the active unit's state WITHOUT touching entities.js: a
      // grounded unit with meaningful horizontal speed during play. Throttled
      // to ~every 12 frames so it's a soft patter, not a machine-gun.
      // ---- CHARGE / "ERŐ" power-bar audio ----
      // Poll S.charging (set by core.js while the aim power is held) so we own the
      // charge sound WITHOUT any other file emitting events. Rising tone while
      // held; release whoosh when it lets go with meaningful power (a cancel at
      // ~0 power just fades, no whoosh). Gated to active gameplay.
      try{
        const Ac=CA.Audio;
        if(Ac && Ac.ctx){
          const charging=!!(S.charging) && S.mode===CA.GameState.PLAYING;
          const pw=(S.power!=null)?S.power:0;
          if(charging){
            if(!this._wasCharging){ Ac.chargeStart && Ac.chargeStart(); this._wasCharging=true; }
            Ac.chargeUpdate && Ac.chargeUpdate(pw);
            this._lastChargePow=pw;   // remember the level at the moment of release
          } else if(this._wasCharging){
            this._wasCharging=false;
            const fired=(this._lastChargePow||0) > 0.06;   // >~0 power => a real shot
            Ac.chargeStop && Ac.chargeStop(fired);
            this._lastChargePow=0;
          }
        }
      }catch(e){ /* never throw */ }

      this._footstepT=(this._footstepT||0)-(dt||1);
      const A=CA.Audio;
      if(A && A.ctx && this._footstepT<=0 && CA.activeUnit &&
         S.mode===CA.GameState.PLAYING && A._sfxVol && A._sfxVol()>0){
        const u=CA.activeUnit();
        if(u && u.alive && u.grounded && Math.abs(u.vx||0)>0.6){
          A._footstep();
          this._footstepT=12;   // frames between steps
        }
      }
    },

    // #36 OPT-IN DYNAMIC MUSIC. Gated hard: only plays when CA.settings.music is
    // truthy AND we're in active gameplay (PLAYING). Never on the menu, never by
    // default (music defaults false). Cheap to call every frame — start()/stop()
    // are idempotent. Also feeds the loop a live "tension" value (0..1) so the
    // music intensifies when the turn timer runs low or many units are hurt.
    _syncMusic(){
      const A=CA.Audio; if(!A) return;
      try{
        // background music plays whenever not muted + musicVol>0. We do NOT gate on
        // settings.music — that broke audio for users whose saved settings carried
        // the old music:false default (the toggle was historically a no-op).
        // real background music files: menu theme on the menu, calm loop in-game.
        let want=null, amb=null;
        if(CA.GameState){
          if(S.mode===CA.GameState.MENU) want='menu';
          else if(S.mode===CA.GameState.PLAYING){
            want='play';
            // biome AMBIENCE replaces the gameplay music when its file exists.
            amb = AMB_BY_THEME[(S&&S.theme)||'grass'] || null;
          }
        }
        if(amb && A.ambient && A.ambient(amb)){
          if(A.bgMusic) A.bgMusic(null);          // ambience is playing -> music OFF
        } else {
          if(A.ambient) A.ambient(null);          // no ambience -> stop it, play music
          if(A.bgMusic) A.bgMusic(want);
        }
      }catch(e){ /* never throw */ }
    },

    // derive a 0..1 tension from turn timer (low time = tense) and unit damage.
    _computeTension(){
      try{
        let t=0;
        // turn timer counts DOWN from C.TURN_TIME -> 0; low time = tense.
        const tt=S.turnTimer, tmax=C.TURN_TIME||30;
        if(tt!=null && tmax>0){
          const frac=tt/tmax;
          if(frac<0.4) t=Math.max(t, U.clamp(1-frac/0.4,0,1)); // ramps in the last 40%
        }
        // hurt units: fraction of living units below half HP
        const units=S.units;
        if(units && units.length){
          let hurt=0, alive=0;
          for(let i=0;i<units.length;i++){
            const u=units[i]; if(!u||!u.alive) continue; alive++;
            const mx=u.maxHp!=null?u.maxHp:100;
            if(u.hp!=null && mx>0 && u.hp/mx<0.5) hurt++;
          }
          if(alive>0) t=Math.max(t, (hurt/alive)*0.8);
        }
        return U.clamp(t,0,1);
      }catch(e){ return 0; }
    },

    render(ctx){
      const arr=S.particles;
      const cheap=lowQ();
      // persistent death markers FIRST (world space) so live FX draw over them
      renderGravestones(ctx);
      // cartoon explosion sprite-sheet bursts (world space, over terrain; sparks/
      // debris particles layer on top). source-over — the sheet is alpha-keyed.
      if(_explOK && _explImg && _explSprites.length){
        ctx.save();
        for(var _i=0;_i<_explSprites.length;_i++){
          var e=_explSprites[_i];
          var fr=(e.t/e.dur*EXPL_FRAMES)|0; if(fr<0)fr=0; else if(fr>EXPL_FRAMES-1)fr=EXPL_FRAMES-1;
          var ex=(fr%EXPL_COLS)*EXPL_CELL, ey=((fr/EXPL_COLS)|0)*EXPL_CELL, sz=e.size;
          try{ ctx.drawImage(_explImg, ex,ey,EXPL_CELL,EXPL_CELL, (e.x-sz/2)|0,(e.y-sz/2)|0, sz, sz); }catch(_g){}
        }
        ctx.restore();
      }
      ctx.save();
      for(let i=0;i<arr.length;i++){
        const p=arr[i];
        const a=Math.max(0,Math.min(1,p.life/p.maxLife));
        if(p.kind==='text'||p.kind==='pow'){ continue; }  // captions drawn in a 2nd pass
        if(p.kind==='impact'){
          // One small path supplies a crisp, asymmetric cartoon flash. No image,
          // shadow, blur or per-frame gradient is needed, even on tablets.
          const age=1-a, rad=p.size;
          ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot||0);
          ctx.globalAlpha=a*a*0.9;
          ctx.fillStyle=age<0.35?'#fff3bb':'#ffc15b';
          ctx.strokeStyle='#d8743c'; ctx.lineWidth=cheap?1.2:2;
          ctx.beginPath();
          for(let j=0;j<20;j++){
            const ang=j*Math.PI/10;
            const rr=rad*(j%2?0.42:((j%4)?0.85:1));
            const px=Math.cos(ang)*rr, py=Math.sin(ang)*rr;
            if(j===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
          }
          ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
          continue;
        }
        if(p.kind==='bubble'){
          const radius=p.size*(0.8+(1-a)*0.25);
          ctx.globalAlpha=Math.min(0.85,a*2);
          ctx.lineWidth=cheap?1:1.2;
          ctx.strokeStyle='#bdeaff'; ctx.fillStyle='rgba(116,199,233,0.13)';
          ctx.beginPath(); ctx.arc(p.x,p.y,radius,0,Math.PI*2); ctx.fill(); ctx.stroke();
          if(!cheap){
            ctx.fillStyle='#f1fbff';
            ctx.beginPath(); ctx.arc(p.x-radius*0.30,p.y-radius*0.32,Math.max(0.5,radius*0.20),0,7); ctx.fill();
          }
          ctx.globalAlpha=1; ctx.lineWidth=1;
          continue;
        }
        if(p.kind==='smoke' && p.billow && !cheap){
          // Three overlapping lobes form one silhouette and one fill call.
          const radius=p.size*(0.5+a*0.6)+0.4;
          ctx.globalAlpha=a;
          ctx.fillStyle=p.color;
          ctx.beginPath();
          ctx.arc(p.x-radius*0.40,p.y+radius*0.10,radius*0.68,0,7);
          ctx.moveTo(p.x+radius*0.89,p.y-radius*0.28);
          ctx.arc(p.x+radius*0.12,p.y-radius*0.28,radius*0.77,0,7);
          ctx.moveTo(p.x+radius*1.01,p.y+radius*0.22);
          ctx.arc(p.x+radius*0.48,p.y+radius*0.22,radius*0.53,0,7);
          ctx.fill(); ctx.globalAlpha=1;
          continue;
        }
        if(p.kind==='flash'){
          if(cheap){
            // cheap solid flash, no gradient/lighter
            ctx.globalAlpha=a*0.7;
            ctx.fillStyle='rgba(255,225,150,'+(a*0.7).toFixed(3)+')';
            ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,7); ctx.fill();
            ctx.globalAlpha=1;
            continue;
          }
          ctx.globalCompositeOperation='lighter';
          // PERF: pre-rendered glow sprite (warm orange under-blob + bright
          // white-ish core) instead of a per-particle createRadialGradient.
          // Falls back to the original gradient if the sprite isn't ready.
          if(drawGlow(ctx, p.x, p.y, p.size, a*0.55, 1)){      // orange halo
            drawGlow(ctx, p.x, p.y, p.size*0.6, a*0.9, 2);      // yellow-white core
          } else {
            const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);
            g.addColorStop(0,'rgba(255,255,235,'+(a)+')');
            g.addColorStop(0.4,'rgba(255,200,90,'+(a*0.8)+')');
            g.addColorStop(1,'rgba(255,90,30,0)');
            ctx.globalAlpha=a*0.9;
            ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,7); ctx.fill();
          }
          ctx.globalAlpha=1;
          ctx.globalCompositeOperation='source-over';
          continue;
        }
        if(p.kind==='ring'){
          // expanding shockwave ring (stroked)
          if(!cheap) ctx.globalCompositeOperation='lighter';
          ctx.globalAlpha=a*0.7;
          ctx.lineWidth=Math.max(1,(p.thick||4)*a);
          ctx.strokeStyle=p.color||'rgba(255,240,210,0.9)';
          ctx.beginPath();
          if(p.flat) ctx.ellipse(p.x,p.y,p.size,p.size*p.flat,0,0,Math.PI*2);
          else ctx.arc(p.x,p.y,p.size,0,7);
          ctx.stroke();
          ctx.globalCompositeOperation='source-over';
          ctx.globalAlpha=1; ctx.lineWidth=1;
          continue;
        }
        if(p.kind==='glow'){
          // soft expanding orange afterglow (additive radial). Skip when cheap.
          if(cheap) continue;
          ctx.globalCompositeOperation='lighter';
          const ga=a*a*0.6;          // ease-out fade so it lingers then drops
          // PERF: baked orange glow sprite instead of per-particle gradient.
          if(!drawGlow(ctx, p.x, p.y, p.size, ga, 1)){
            const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);
            g.addColorStop(0,'rgba(255,150,50,'+(a*0.5).toFixed(3)+')');
            g.addColorStop(0.5,'rgba(255,90,20,'+(a*0.28).toFixed(3)+')');
            g.addColorStop(1,'rgba(120,30,0,0)');
            ctx.globalAlpha=ga;
            ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,7); ctx.fill();
          }
          ctx.globalCompositeOperation='source-over';
          ctx.globalAlpha=1;
          continue;
        }
        if(p.kind==='scorch'){
          // quick fading dark mark on the ground (cheap, source-over)
          ctx.globalAlpha=a*0.45;
          ctx.fillStyle='rgba(20,14,10,1)';
          ctx.save(); ctx.translate(p.x,p.y); ctx.scale(1,0.4);
          ctx.beginPath(); ctx.arc(0,0,p.size,0,7); ctx.fill(); ctx.restore();
          ctx.globalAlpha=1;
          continue;
        }
        if(p.kind==='ember'){
          // tiny hot point with additive bloom
          if(!cheap) ctx.globalCompositeOperation='lighter';
          ctx.globalAlpha=a;
          ctx.fillStyle=p.color;
          ctx.beginPath(); ctx.arc(p.x,p.y,p.size*(0.4+a*0.7)+0.3,0,7); ctx.fill();
          ctx.globalCompositeOperation='source-over';
          ctx.globalAlpha=1;
          continue;
        }
        if(p.kind==='confetti'){
          // small colored rect that flutters & spins; alpha fades near death
          ctx.globalAlpha=Math.min(1,a*1.4);
          ctx.fillStyle=p.color;
          ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot||0);
          // foreshorten on the spin axis so it looks like a flipping flake
          const sy=Math.abs(Math.cos((p.rot||0)*1.3))*0.7+0.3;
          ctx.scale(1,sy);
          const w=p.size, h=p.size*0.6;
          ctx.fillRect(-w/2,-h/2,w,h);
          ctx.restore();
          ctx.globalAlpha=1;
          continue;
        }
        if(p.kind==='spark'){
          // hot STREAK: a short additive line from previous->current position so
          // sparks read as fast tracers rather than dots. Same draw-call budget.
          // reducedMotion / cheap fall back to a plain warm dot (subtle).
          if(!cheap && !reduced() && p.px!=null && p.py!=null){
            ctx.globalCompositeOperation='lighter';
            ctx.globalAlpha=a;
            ctx.strokeStyle=p.color||'#ffd24a';
            ctx.lineWidth=Math.max(1,(p.size||2)*0.9);
            ctx.lineCap='round';
            ctx.beginPath(); ctx.moveTo(p.px,p.py); ctx.lineTo(p.x,p.y); ctx.stroke();
            ctx.globalCompositeOperation='source-over';
            ctx.globalAlpha=1; ctx.lineWidth=1;
            continue;
          }
          if(!cheap) ctx.globalCompositeOperation='lighter';
        }
        ctx.globalAlpha=a;
        ctx.fillStyle=p.color;
        if(p.kind==='dirt' && p.rot!=null){
          ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
          const s=p.size*(0.6+a*0.6); ctx.fillRect(-s/2,-s/2,s,s); ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(p.x,p.y,p.size*(0.5+a*0.6)+0.4,0,7); ctx.fill();
        }
        ctx.globalCompositeOperation='source-over';
      }
      ctx.globalAlpha=1;
      ctx.globalCompositeOperation='source-over';
      ctx.restore();

      // Draw the comic impact caption over smoke but before HP/damage text.
      for(let i=0;i<arr.length;i++){
        const p=arr[i]; if(p.kind!=='pow') continue;
        const a=U.clamp(p.life/p.maxLife,0,1), age=1-a;
        const sc=p.size*(reduced()?1:(age<0.16?0.78+age*1.7:1.05));
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot||0); ctx.scale(sc,sc);
        ctx.globalAlpha=Math.min(1,a*3);
        ctx.lineJoin='round'; ctx.lineWidth=2.4;
        ctx.fillStyle='#ffe78a'; ctx.strokeStyle='#593242';
        ctx.beginPath();
        for(let j=0;j<POW_SHAPE.length;j++){
          if(j===0) ctx.moveTo(POW_SHAPE[j][0],POW_SHAPE[j][1]); else ctx.lineTo(POW_SHAPE[j][0],POW_SHAPE[j][1]);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.font='900 22px system-ui, -apple-system, sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.lineWidth=3; ctx.strokeStyle='#593242'; ctx.strokeText('POW!',0,1);
        ctx.fillStyle='#fffaf0'; ctx.fillText('POW!',0,1);
        ctx.restore();
      }

      // ---- FLOATING TEXT (damage / heal / combo) — drawn ABOVE all other
      // particles so numbers stay legible over explosions & bright terrain.
      // World space (same camera transform as the particle pass above). Bold
      // font with a dark outline + shadow for readability. Pops in & fades.
      let hasText=false;
      for(let i=0;i<arr.length;i++){ if(arr[i].kind==='text'){ hasText=true; break; } }
      if(hasText){
        ctx.save();
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.lineJoin='round';
        for(let i=0;i<arr.length;i++){
          const p=arr[i];
          if(p.kind!=='text') continue;
          const a=Math.max(0,Math.min(1,p.life/p.maxLife));
          // fade: hold near-full for the first ~60% of life, then fade out
          const alpha=a>0.4 ? 1 : (a/0.4);
          const sc=p.scale!=null?p.scale:1;
          ctx.save();
          ctx.translate(p.x+(p.sx||0), p.y);
          ctx.scale(sc,sc);
          ctx.globalAlpha=alpha;
          ctx.font=p.font||TEXT_FONT;
          // dark outline for contrast over bright terrain
          ctx.lineWidth=p.size>=20?4:3;
          ctx.strokeStyle='rgba(0,0,0,0.85)';
          ctx.strokeText(p.text, 0, 0);
          // CRIT glow halo: a coloured shadow pass behind the fill so a crit reads
          // unmistakably apart from the flat-gold combo. Skipped on cheap quality.
          if(p.glow && !cheap){
            ctx.shadowColor=p.glow;
            ctx.shadowBlur=12;
            ctx.shadowOffsetY=0;
            ctx.fillStyle=p.glow;
            ctx.fillText(p.text, 0, 0);
          }
          // soft drop shadow under the fill
          ctx.shadowColor='rgba(0,0,0,0.55)';
          ctx.shadowBlur=cheap?0:3;
          ctx.shadowOffsetY=1;
          ctx.fillStyle=p.color||'#fff';
          ctx.fillText(p.text, 0, 0);
          ctx.restore();
        }
        ctx.restore();
        ctx.globalAlpha=1;
      }

      // #31/#32: subtle vignette flash during kill-cam (tasteful)
      if(S.killcam && CA.settings && CA.settings.killcam && !cheap){
        const kc=S.killcam, kt=(kc.t!=null)?kc.t:50;
        const a=U.clamp(kt/50,0,1)*0.18;
        if(a>0.001){
          ctx.save();
          const view=worldViewport(), cx=view.x, cy=view.y;
          const vg=ctx.createRadialGradient(cx+view.w/2,cy+view.h/2,view.h*0.25,
                                             cx+view.w/2,cy+view.h/2,view.h*0.8);
          vg.addColorStop(0,'rgba(120,0,0,0)');
          vg.addColorStop(1,'rgba(120,0,0,'+a.toFixed(3)+')');
          ctx.fillStyle=vg;
          ctx.fillRect(cx-view.pad,cy-view.pad,view.w+view.pad*2,view.h+view.pad*2);
          ctx.restore();
        }
      }
    },

    // #26b: draw the painterly layered parallax art for the current theme (if any),
    // tiled horizontally + scrolled at per-layer depth. Returns true if it drew
    // (caller then SKIPS the procedural hills). Enabled on ALL quality tiers — 4
    // cached drawImage calls are cheaper than the procedural hill paths/gradients.
    // Bails (false) only until every layer image has finished loading (hills show
    // first). `?v=` cache-busts past any stale/404 cache from a mid-deploy load.
    _photoBg(ctx, camX, camY, cheap){
      var cfg=PHOTO_BG[(S.theme||'')]; if(!cfg) return false;
      var imgs=[];
      for(var i=0;i<cfg.layers.length;i++){
        var im=CA.img(cfg.dir+cfg.layers[i].f+'?v='+(CA.ASSET_V||'1'));
        if(!im) return false;                 // not loaded yet -> hills fallback
        imgs.push(im);
      }
      var wl=S.waterLevel||C.WATER_LEVEL;
      var lh=C.WORLD_H*0.98;                   // layer world height
      var bottom=wl+40, top=bottom-lh;         // anchor just below the waterline
      var zoom=S.camera.zoom||1;
      var vw=C.VIEW_W/zoom;
      // ALIGNED packs (e.g. LudicArts volcano): layers share a width but have
      // DIFFERENT native heights and are bottom-anchored (full backdrop + shorter
      // foreground pieces). Scale ALL by ONE factor (tallest layer -> ~world H)
      // and draw each at its own height from the common ground line — never
      // stretch a short layer to full height.
      if(cfg.aligned){
        var tallest=1;
        for(var t=0;t<imgs.length;t++){ if(imgs[t].naturalHeight>tallest) tallest=imgs[t].naturalHeight; }
        var asc=lh/tallest;
        if(cfg.topFill){ ctx.fillStyle=cfg.topFill; ctx.fillRect(camX-vw, bottom-lh-720, vw*3, 724); }
        for(var ak=0;ak<imgs.length;ak++){
          var aimg=imgs[ak], apar=cfg.layers[ak].par;
          var adw=aimg.naturalWidth*asc, adh=aimg.naturalHeight*asc, atop=bottom-adh;
          var aoff=camX*(1-apar);
          var astart=aoff + Math.floor((camX-aoff)/adw)*adw - adw;
          for(var ax=astart; ax<camX+vw+adw; ax+=adw){ ctx.drawImage(aimg, ax, atop, adw, adh); }
        }
        if(cfg.fade>0){ ctx.save(); ctx.globalAlpha=cfg.fade; ctx.fillStyle='rgb('+(cfg.fadeCol||'225,235,230')+')'; ctx.fillRect(camX-vw, bottom-lh, vw*3, lh); ctx.restore(); }
        return true;
      }
      // themes whose FAR layer is opaque to its top edge (jungle canopy) showed
      // a hard seam at world y=0 when a high shot pans the camera above the
      // world — extend that colour upward before the layers draw.
      if(cfg.topFill){ ctx.fillStyle=cfg.topFill; ctx.fillRect(camX-vw, top-720, vw*3, 724); }
      for(var k=0;k<imgs.length;k++){
        var img=imgs[k], par=cfg.layers[k].par;
        var scale=lh/img.height, dw=img.width*scale;
        var off=camX*(1-par);                  // parallax: far layers shift less
        var startX=off + Math.floor((camX-off)/dw)*dw - dw;
        for(var x=startX; x<camX+vw+dw; x+=dw){ ctx.drawImage(img, x, top, dw, lh); }
      }
      // optional atmospheric haze WASH — mutes a too-vivid scene so the gameplay
      // (units/projectiles) reads clearly against it. Pale fill over the bg band
      // (under the terrain, which is drawn after renderBg). Per-theme `fade`.
      if(cfg.fade>0){
        ctx.save();
        ctx.globalAlpha=cfg.fade;
        ctx.fillStyle='rgb('+(cfg.fadeCol||'225,235,230')+')';
        ctx.fillRect(camX-vw, top, vw*3, lh);
        ctx.restore();
      }
      return true;
    },

    // preload the current theme's photo-bg layers (+ fire sheet) at game start,
    // so the network fetch completes during the intro banner (no hills->photo pop).
    preloadBg(){
      try{
        var cfg=PHOTO_BG[(S.theme||'')];
        if(cfg){ for(var i=0;i<cfg.layers.length;i++){ CA.img(cfg.dir+cfg.layers[i].f+'?v='+(CA.ASSET_V||'1')); } }
        CA.img('assets/fx/fire5x5.png?v='+(CA.ASSET_V||'1'));
        CA.img('assets/textures/ground.jpg?v='+(CA.ASSET_V||'1'));
        _loadExpl();   // a session ELSŐ robbanása se maradjon sprite nélkül (QA P3)
      }catch(e){}
    },

    renderBg(ctx){
      const camX=S.camera.x||0, camY=S.camera.y||0;
      const view=worldViewport();
      const t=theme();
      const pal=(t&&t.palette)||FALLBACK_PAL;
      const daytime=(t&&t.daytime)||'day';
      const sky=pal.sky||FALLBACK_PAL.sky;
      const cheap=lowQ();

      // ---- sky gradient (covers the whole world) ----
      // PERF (QA #5): a linear-gradient objektumot CACHE-eljük (téma-szín + vízszint
      // kulccsal) — eddig MINDEN frame-en újra létrejött (alloc a legforróbb úton).
      const wl=S.waterLevel||C.WATER_LEVEL;
      const _skKey=(sky[0]||'')+'|'+(sky[1]||'')+'|'+(sky[2]||'')+'|'+(wl|0);
      if(_skyGradKey!==_skKey){
        _skyGradKey=_skKey;
        _skyGrad=ctx.createLinearGradient(0,0,0,wl+60);
        _skyGrad.addColorStop(0, sky[0]||FALLBACK_PAL.sky[0]);
        _skyGrad.addColorStop(0.45, sky[1]||sky[0]||FALLBACK_PAL.sky[1]);
        _skyGrad.addColorStop(1, sky[2]||sky[1]||FALLBACK_PAL.sky[2]);
      }
      ctx.fillStyle=_skyGrad;
      // Fill the WHOLE camera viewport (not just the world bbox): when a high shot
      // pans the camera above the world top, the old world-bounded fill left the
      // dark PAGE background showing as a "brown ceiling" (Jani, Ég map). The sky
      // gradient is anchored in world-Y, so above y=0 it simply continues the top
      // sky colour — more sky, no brown band.
      ctx.fillRect(camX-view.pad, camY-view.pad, view.w+view.pad*2, view.h+view.pad*2);

      // ---- far parallax cloud band (high, slow, faint) for atmospheric depth ----
      if(!cheap && daytime!=='night'){
        const fcAlpha = daytime==='dusk'?0.4:0.5;
        const fcCol   = daytime==='dusk'?'#f0d8c4':'#eef6ff';
        for(const cl of farClouds){
          cl.x+=cl.spd;
          const span=C.WORLD_W*1.8;
          let cx=((cl.x - camX*cl.depth)%span); if(cx<-260) cx+=span;
          const cy=cl.y - camY*cl.depth*0.25;
          this._cloud(ctx,cx,cy,cl.s,fcAlpha,fcCol);
        }
      }

      // ---- night: stars + moon ; day/dusk: sun ----
      if(daytime==='night'){
        // twinkling stars (cheap dots)
        ctx.fillStyle='#fff';
        for(const st of stars){
          const sx=((st.x - camX*st.depth)%C.WORLD_W+C.WORLD_W)%C.WORLD_W;
          const sy=st.y - camY*st.depth*0.2;
          const tw=0.4+0.6*Math.abs(Math.sin(bgT*0.03+st.tw));
          ctx.globalAlpha=tw;
          ctx.beginPath(); ctx.arc(sx,sy,st.r,0,7); ctx.fill();
        }
        ctx.globalAlpha=1;
        // moon
        const mx=camX*0.05+C.VIEW_W*0.74, my=110;
        if(!cheap){
          const mg=ctx.createRadialGradient(mx,my,0,mx,my,150);
          mg.addColorStop(0,'rgba(220,230,255,0.55)');
          mg.addColorStop(1,'rgba(220,230,255,0)');
          ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(mx,my,150,0,7); ctx.fill();
        }
        ctx.fillStyle='#eef2ff'; ctx.beginPath(); ctx.arc(mx,my,34,0,7); ctx.fill();
        // crescent shadow
        ctx.fillStyle=sky[0]||'#0b0e1a';
        ctx.beginPath(); ctx.arc(mx+13,my-6,30,0,7); ctx.fill();
      } else {
        // sun — lower & warmer at dusk
        const dusk=(daytime==='dusk');
        const sunX=camX*0.05+C.VIEW_W*(dusk?0.68:0.78);
        const sunY=dusk?260:120;
        const core=dusk?'rgba(255,180,90,':'rgba(255,250,210,';
        if(!cheap){
          const sg=ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,dusk?240:180);
          sg.addColorStop(0, core+'0.9)');
          sg.addColorStop(1, core+'0)');
          ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(sunX,sunY,dusk?240:180,0,7); ctx.fill();
        }
        ctx.fillStyle= dusk?'#ffd089':'#fffbe0';
        ctx.beginPath(); ctx.arc(sunX,sunY,dusk?40:30,0,7); ctx.fill();
      }

      // ---- moving background objects (balloon/plane/kite/airship/birds) ----
      // drawn in the sky, behind the hills, at parallax depth.
      if(!cheap){
        const night=(daytime==='night');
        for(const o of skyObjects){
          const span=C.WORLD_W+1200;
          let ox=((o.x - camX*o.depth)%span); if(ox<-600) ox+=span;
          const oy=o.y - camY*o.depth*0.3;
          // aerial perspective: far objects (small depth) are hazy & faint
          const haze=U.clamp(1-(o.depth/0.22),0,1);   // 0..1, 1=farthest
          const alpha=(0.55+o.depth*2.0)*(night?0.7:1);
          this._skyObject(ctx,o,ox,oy,alpha,haze,night);
        }
      }

      // sky tint used for atmospheric haze on distant bands (matches horizon)
      const hazeCol = sky[2]||sky[1]||FALLBACK_PAL.sky[2];

      // ---- LAYERED PARALLAX silhouette bands w/ depth cues ----
      // ridgeHaze: a thin band of horizon-coloured fog along the crest so far
      // ridges desaturate into the sky (aerial perspective).
      // ao: a soft dark gradient where this layer meets the one in front
      // (ambient occlusion / drop-shadow between overlapping bands).
      const drawHills=(baseY,amp,col,par,wlen,phase,opt)=>{
        opt=opt||{};
        const ox=-camX*par - camY*par*0.2;
        const step=cheap?40:24;
        const crest=(x)=> baseY+Math.sin((x-ox)/wlen+phase)*amp + Math.sin((x-ox)/(wlen*0.37))*amp*0.3;

        // body
        ctx.fillStyle=col;
        ctx.beginPath();
        ctx.moveTo(-200,C.WORLD_H);
        for(let x=-200;x<=C.WORLD_W+200;x+=step){ ctx.lineTo(x,crest(x)); }
        ctx.lineTo(C.WORLD_W+200,C.WORLD_H);
        ctx.closePath(); ctx.fill();

        if(cheap) return;

        // ambient occlusion: darken the top ~70px of the body (where the layer
        // behind would cast shade) -> reads as overlapping depth.
        if(opt.ao>0){
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(-200,C.WORLD_H);
          for(let x=-200;x<=C.WORLD_W+200;x+=step){ ctx.lineTo(x,crest(x)); }
          ctx.lineTo(C.WORLD_W+200,C.WORLD_H);
          ctx.closePath(); ctx.clip();
          const aog=ctx.createLinearGradient(0,baseY-amp-30,0,baseY-amp+90);
          aog.addColorStop(0,'rgba(0,0,0,'+opt.ao+')');
          aog.addColorStop(1,'rgba(0,0,0,0)');
          ctx.fillStyle=aog;
          ctx.fillRect(-200,baseY-amp-30,C.WORLD_W+400,150);
          ctx.restore();
        }

        // atmospheric haze: a faint sky-coloured fog hugging the crest line so
        // distant ridges blend into the horizon.
        if(opt.haze>0){
          ctx.save();
          ctx.globalAlpha=opt.haze;
          ctx.strokeStyle=hazeCol;
          ctx.lineWidth=opt.hazeW||10;
          ctx.beginPath();
          for(let x=-200;x<=C.WORLD_W+200;x+=step){
            const y=crest(x);
            if(x===-200) ctx.moveTo(x,y); else ctx.lineTo(x,y);
          }
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha=1; ctx.lineWidth=1;
        }
      };
      const h1=pal.hill1||FALLBACK_PAL.hill1, h2=pal.hill2||FALLBACK_PAL.hill2;
      // #26b: painterly photo parallax (desert, …). If it draws, it REPLACES the
      // procedural mountain bands for this theme. Falls through to hills on low
      // quality or while the art is still loading.
      let _photoDrawn=false;
      try{ _photoDrawn=this._photoBg(ctx, camX, camY, cheap); }catch(e){ _photoDrawn=false; }
      // SKY ('Ég'): NO parallax hills — the map floats in open sky (only clouds +
      // planes behind the platforms). Every other theme keeps its mountain bands.
      if(!_photoDrawn && (S.theme||'')!=='sky'){
        // farthest mountains: most desaturated/hazy, slowest parallax
        drawHills(420, 130, shade(h2,-0.40), 0.06, 680, 3.1, {haze:0.55, hazeW:14, ao:0});
        // far mountains
        drawHills(470, 110, shade(h2,-0.26), 0.12, 560, 2.3, {haze:0.32, hazeW:11, ao:0.10});
        // mid hills
        drawHills(560, 70,  shade(h1,-0.05), 0.25, 420, 0.4, {haze:0.16, hazeW:9,  ao:0.16});
        // near hills (front-most, crispest, fastest parallax)
        drawHills(640, 55,  h2,               0.45, 300, 1.7, {haze:0,    hazeW:0,  ao:0.20});
      }

      // ---- GRAVEYARD spooky band: silhouette tombstones / dead trees / crypt +
      // a drifting low fog. Theme-gated; cheap; toned down on low-q / reducedMotion.
      if((S.theme||'')==='graveyard'){
        try{ this._graveyardBg(ctx, camX, camY, cheap); }catch(e){}
        try{ this._graveFireflies(ctx, camX, camY, cheap); }catch(e){}
      }

      // ---- VOLCANO spooky band: a big dark volcano cone silhouette with a
      // glowing crater + lava run-off and rising smoke/ash. Theme-gated; cheap;
      // toned down on low quality (glow/smoke skipped). ----
      // SKIP the procedural cone when the painterly volcano photo-bg drew — the
      // photo already has the volcano/lava landscape; the drawn cone clashed.
      if((S.theme||'')==='volcano' && !_photoDrawn){
        try{ this._volcanoBg(ctx, camX, camY, cheap); }catch(e){}
      }

      // ---- cheap per-theme background flavour (desert heat-haze / jungle
      // fireflies / cave drips+stalactites / islands far sails). Same pattern as
      // volcano/graveyard: theme-gated, stable layout, cheap, reducedMotion-aware.
      const _th=(S.theme||'');
      if(_th==='desert')      { try{ this._desertBg(ctx, camX, camY, cheap); }catch(e){} }
      else if(_th==='jungle') { try{ this._jungleBg(ctx, camX, camY, cheap); }catch(e){} }
      else if(_th==='cave' && !_photoDrawn) { try{ this._caveBg(ctx, camX, camY, cheap); }catch(e){} }
      else if(_th==='islands'){ try{ this._islandsBg(ctx, camX, camY, cheap); }catch(e){} }
      else if(_th==='snow')   { try{ this._snowBg(ctx, camX, camY, cheap, _photoDrawn); }catch(e){} }
      else if(_th==='city')   { try{ this._cityBg(ctx, camX, camY, cheap); }catch(e){} }
      else if(_th==='space')  { try{ this._spaceBg(ctx, camX, camY, cheap); }catch(e){} }

      // ---- drifting clouds (skip the bottom band on night for clarity) ----
      if(daytime!=='night' || !cheap){
        const cloudAlpha = daytime==='night' ? 0.35 : (daytime==='dusk'?0.7:0.85);
        const cloudCol   = daytime==='night' ? '#3a4252' : (daytime==='dusk'?'#f3d3b0':'#ffffff');
        for(const cl of clouds){
          cl.x+=cl.spd;
          const span=C.WORLD_W*1.6;
          let cx=((cl.x - camX*cl.depth)%span); if(cx<-200) cx+=span;
          const cy=cl.y - camY*cl.depth*0.3;
          this._cloud(ctx,cx,cy,cl.s,cloudAlpha,cloudCol);
        }
      }

      // ---- animated water band at LIVE waterLevel (#26) ----
      // SKY ('Ég') + noWater témák (Űr): NO water surface at all (Jani). We still
      // keep waterLevel for the drown/void logic (falling off = death), just don't DRAW it.
      if((S.theme||'')!=='sky' && !(t&&t.noWater)){
      const waterCol=pal.water||FALLBACK_PAL.water;
      // PERF (QA #5): cache a víz-gradienst (szín + vízszint kulccsal)
      const _wgKey=waterCol+'|'+(wl|0);
      if(_watGradKey!==_wgKey){
        _watGradKey=_wgKey;
        _watGrad=ctx.createLinearGradient(0,wl,0,C.WORLD_H);
        _watGrad.addColorStop(0, waterCol);
        _watGrad.addColorStop(1, deepen(waterCol));
      }
      ctx.fillStyle=_watGrad;
      ctx.beginPath();
      ctx.moveTo(-200,C.WORLD_H);
      const tt=bgT*0.04;
      const wstep=cheap?28:14;
      for(let x=-200;x<=C.WORLD_W+200;x+=wstep){
        const wx=x - camX*0.1;
        const y=wl + Math.sin(wx*0.018 + tt)*5 + Math.sin(wx*0.05 - tt*1.7)*3;
        ctx.lineTo(x,y);
      }
      ctx.lineTo(C.WORLD_W+200,C.WORLD_H);
      ctx.closePath(); ctx.fill();

      // glints on the surface (skip on low quality) (#12 live water)
      if(!cheap){
        // crest line highlight that traces the animated wave
        ctx.globalAlpha=0.5; ctx.strokeStyle='rgba(220,245,255,0.6)'; ctx.lineWidth=2;
        ctx.beginPath();
        for(let x=-200;x<=C.WORLD_W+200;x+=14){
          const wx=x - camX*0.1;
          const y=wl + Math.sin(wx*0.018 + tt)*5 + Math.sin(wx*0.05 - tt*1.7)*3;
          if(x===-200) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke(); ctx.globalAlpha=1; ctx.lineWidth=1;

        // travelling SHEEN — a few bright dashes sliding along the surface so the
        // water shimmers/reflects. Their phase rides bgT, so they drift over time.
        ctx.save();
        ctx.globalCompositeOperation='lighter';
        const sheenN=daytime==='night'?2:4;
        for(let k=0;k<sheenN;k++){
          // position cycles across the visible span, staggered per-streak
          const span=C.VIEW_W+400;
          const sx=camX-200 + ((bgT*(0.6+k*0.25) + k*317) % span);
          const wx=sx - camX*0.1;
          const sy=wl + Math.sin(wx*0.018 + tt)*5 + Math.sin(wx*0.05 - tt*1.7)*3;
          const tw=0.18+0.16*Math.abs(Math.sin(bgT*0.05+k));
          const len=40+20*Math.sin(bgT*0.03+k*1.7);
          const col=daytime==='dusk'?'rgba(255,210,150,':'rgba(210,240,255,';
          const grd=ctx.createLinearGradient(sx-len,0,sx+len,0);
          grd.addColorStop(0, col+'0)');
          grd.addColorStop(0.5, col+tw.toFixed(3)+')');
          grd.addColorStop(1, col+'0)');
          ctx.strokeStyle=grd; ctx.lineWidth=2;
          ctx.beginPath(); ctx.moveTo(sx-len,sy+1.5); ctx.lineTo(sx+len,sy+1.5); ctx.stroke();
        }
        ctx.restore();
        ctx.globalCompositeOperation='source-over';
        ctx.globalAlpha=1; ctx.lineWidth=1;
      }
      } // end: non-sky water band

      // ---- #11 DAYTIME TINT — soft warm/cool wash over the whole scene that
      // drifts gently across the match (dawn/noon/dusk/night). Cheap flat fill.
      let tint=null;
      try{ tint=daytimeTint(daytime); }catch(e){ tint=null; }
      if(tint && tint.a>0.005){
        ctx.save();
        ctx.globalCompositeOperation='source-over';
        ctx.fillStyle='rgba('+tint.col+','+tint.a.toFixed(3)+')';
        ctx.fillRect(camX-view.pad, camY-view.pad, view.w+view.pad*2, view.h+view.pad*2);
        ctx.restore();
      }

      // ---- #11 CAVE / NIGHT LIGHT — soft radial glow around the active unit and
      // around fire/explosion particles so dark maps feel lit. Additive, skipped
      // on low quality. Robust to a missing activeUnit.
      let dark=false;
      try{ dark=isDarkScene(daytime); }catch(e){ dark=false; }
      if(dark && !cheap){
        try{
          ctx.save();
          ctx.globalCompositeOperation='lighter';
          // glow around the active unit (the "torch")
          let u=null;
          if(CA.activeUnit){ try{ u=CA.activeUnit(); }catch(e){ u=null; } }
          if(u && u.alive && u.x!=null && u.y!=null){
            const lr=140;
            const lg=ctx.createRadialGradient(u.x,u.y-8,0,u.x,u.y-8,lr);
            lg.addColorStop(0,'rgba(255,224,150,0.34)');
            lg.addColorStop(0.5,'rgba(255,190,90,0.12)');
            lg.addColorStop(1,'rgba(255,160,60,0)');
            ctx.fillStyle=lg;
            ctx.beginPath(); ctx.arc(u.x,u.y-8,lr,0,7); ctx.fill();
          }
          // glow around hot particles (flash / glow / ember) so blasts light the cave
          const arr=S.particles;
          let lit=0;
          for(let i=0;i<arr.length && lit<24;i++){
            const p=arr[i];
            if(p.kind==='flash' || p.kind==='glow' || p.kind==='ember'){
              const a=Math.max(0,Math.min(1,p.life/p.maxLife));
              const gr=(p.kind==='ember'?40:p.size*1.6+30);
              const ga=(p.kind==='ember'?0.18:0.30)*a;
              if(ga<0.02) continue;
              // PERF: baked warm glow sprite (yellow tint) instead of a fresh
              // createRadialGradient per hot particle per frame. Fall back to the
              // gradient if the sprite couldn't be built.
              if(!drawGlow(ctx, p.x, p.y, gr, ga, 2)){
                const pg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,gr);
                pg.addColorStop(0,'rgba(255,210,120,'+ga.toFixed(3)+')');
                pg.addColorStop(1,'rgba(255,150,40,0)');
                ctx.globalAlpha=1;
                ctx.fillStyle=pg;
                ctx.beginPath(); ctx.arc(p.x,p.y,gr,0,7); ctx.fill();
              }
              lit++;
            }
          }
          ctx.restore();
          ctx.globalCompositeOperation='source-over';
        }catch(e){ ctx.globalCompositeOperation='source-over'; }
      }

      // ---- subtle full-screen vignette (depth framing) ----
      if(!cheap){
        const cx=camX, cy=camY;
        const vg=ctx.createRadialGradient(
          cx+view.w/2, cy+view.h*0.46, view.h*0.30,
          cx+view.w/2, cy+view.h*0.46, view.h*0.85);
        vg.addColorStop(0,'rgba(0,0,0,0)');
        vg.addColorStop(1, (daytime==='night'||dark)?'rgba(0,0,12,0.30)':'rgba(20,15,30,0.16)');
        ctx.fillStyle=vg;
        ctx.fillRect(cx-view.pad,cy-view.pad,view.w+view.pad*2,view.h+view.pad*2);
      }
    },

    // ---- GRAVEYARD background atmosphere (world space). Dark silhouettes of
    // tombstones / bare dead trees / a distant crypt in a parallax band, plus a
    // drifting low fog. Cheap + reducedMotion-aware (fog stilled / thinned). ----
    _graveyardBg(ctx, camX, camY, cheap){
      const rm = reduced();
      const baseY = 560;                  // silhouette footing band (over the hills)
      // ---- silhouettes (dark, slightly bluish so they read against indigo sky)
      ctx.save();
      ctx.fillStyle='#0d0a16';
      ctx.strokeStyle='#0d0a16';
      const span=C.WORLD_W*1.4;
      for(const o of graveSil){
        let ox=((o.x - camX*o.depth)%span); if(ox<-160) ox+=span;
        const oy=baseY - camY*o.depth*0.2;
        const s=o.s;
        if(o.kind==='stone'){
          const w=14*s, h=26*s, r=w/2;
          ctx.beginPath();
          ctx.moveTo(ox-r, oy);
          ctx.lineTo(ox-r, oy-h+r);
          ctx.arc(ox, oy-h+r, r, Math.PI, 0);
          ctx.lineTo(ox+r, oy);
          ctx.closePath(); ctx.fill();
        } else if(o.kind==='crypt'){
          const w=44*s, h=40*s;
          ctx.fillRect(ox-w/2, oy-h, w, h);
          // little gable roof
          ctx.beginPath();
          ctx.moveTo(ox-w/2-4, oy-h);
          ctx.lineTo(ox, oy-h-18*s);
          ctx.lineTo(ox+w/2+4, oy-h);
          ctx.closePath(); ctx.fill();
        } else { // dead tree
          const h=48*s, top=oy-h;
          ctx.lineCap='round'; ctx.lineWidth=5*s;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.quadraticCurveTo(ox-3, oy-h*0.6, ox+1, top); ctx.stroke();
          ctx.lineWidth=2.5*s;
          ctx.beginPath();
          ctx.moveTo(ox+1, top+6*s); ctx.quadraticCurveTo(ox-13*s, top, ox-22*s, top-12*s);
          ctx.moveTo(ox+1, top+2*s); ctx.quadraticCurveTo(ox+14*s, top-4*s, ox+23*s, top-15*s);
          ctx.moveTo(ox+1, top);     ctx.quadraticCurveTo(ox+2, top-13*s, ox-4*s, top-22*s);
          ctx.stroke();
          ctx.lineWidth=1;
        }
      }
      ctx.restore();
      // ---- a low iron fence line just in front of the silhouette band ----
      if(!cheap){
        ctx.save();
        ctx.strokeStyle='rgba(12,9,20,0.85)'; ctx.lineWidth=2;
        const fy=baseY+8 - camY*0.12;
        const ox=-(camX*0.12)%26;
        ctx.beginPath(); ctx.moveTo(-40,fy); ctx.lineTo(C.WORLD_W+40,fy); ctx.stroke();
        for(let x=-40+ox; x<C.WORLD_W+40; x+=26){
          ctx.beginPath(); ctx.moveTo(x,fy+4); ctx.lineTo(x,fy-12); ctx.stroke();
          ctx.beginPath(); ctx.arc(x,fy-13,2,0,7); ctx.fill();
        }
        ctx.restore();
      }
      // ---- drifting low fog band (soft pale blobs). Stilled & thinned for
      // reducedMotion / low quality so it stays gentle and cheap. ----
      if(!cheap){
        ctx.save();
        ctx.globalCompositeOperation='lighter';
        const fAlpha = rm ? 0.05 : 0.09;
        for(const f of graveFog){
          if(!rm) f.x += f.spd;
          const fspan=C.WORLD_W*1.3;
          let fx=((f.x - camX*f.depth)%fspan); if(fx<-300) fx+=fspan;
          const fyc=f.y - camY*f.depth*0.2;
          const gr=ctx.createRadialGradient(fx,fyc,0,fx,fyc,160*f.s);
          gr.addColorStop(0,'rgba(150,160,185,'+fAlpha.toFixed(3)+')');
          gr.addColorStop(1,'rgba(150,160,185,0)');
          ctx.fillStyle=gr;
          ctx.beginPath(); ctx.ellipse(fx,fyc,160*f.s,40*f.s,0,0,7); ctx.fill();
        }
        ctx.restore();
        ctx.globalCompositeOperation='source-over';
      }
    },

    // ---- GRAVEYARD FIREFLIES (world space). Slow drifting warm green-yellow
    // glow points that give the Temető its signature haunted-marsh shimmer. Each
    // fly has a stable home + a slow looping orbit + a gentle sine bob, all driven
    // by bgT (never re-randomised). Rendered additively via the BAKED glow sprite
    // (no per-particle createRadialGradient) with a colour-tinted fill underneath
    // so they read as green rather than the sprite's yellow.
    //   Quality cap: low = 0, normal ~ 15, high ~ 30.  reducedMotion: fewer + still.
    _graveFireflies(ctx, camX, camY, cheap){
      if(cheap) return;                                   // low tier: none
      const rm = reduced();
      var q = (CA.settings && CA.settings.quality)||'normal';
      var cap = (q==='high'||q==='ultra') ? 30 : 15;      // normal ~15, high/ultra ~30
      if(rm) cap = Math.min(cap, 8);                      // reducedMotion: fewer
      if(cap<=0) return;
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      for(var i=0;i<cap && i<graveFlies.length;i++){
        var fl=graveFlies[i];
        var ang = fl.ph + (rm?0:bgT*0.008*fl.spd);
        var ox = fl.x - camX*fl.depth + (rm?0:Math.cos(ang)*fl.rad);
        var oy = fl.y - camY*fl.depth*0.2 +
                 (rm?0:Math.sin(ang*1.4)*fl.rad*0.5 + Math.sin(bgT*0.03+fl.bob)*4);
        // gentle pulse so they flicker like marsh-lights
        var pulse = 0.45 + 0.55*Math.abs(Math.sin(bgT*0.035 + fl.ph));
        var a = (rm?0.45:pulse)*0.75;
        // soft warm-green halo via the baked sprite (yellow tint), with a green
        // fill underneath so the colour reads green; falls back to a tinted dot.
        var halo=fl.r*5;
        // green under-wash to colour the additive yellow sprite toward warm-green
        ctx.globalAlpha=a*0.30;
        ctx.fillStyle='rgba(120,210,70,1)';
        ctx.beginPath(); ctx.arc(ox,oy,halo*0.7,0,7); ctx.fill();
        if(!drawGlow(ctx, ox, oy, halo, a*0.7, 2)){       // 2 = yellow baked glow
          ctx.globalAlpha=a*0.7;
          ctx.fillStyle='rgba(200,255,140,1)';
          ctx.beginPath(); ctx.arc(ox,oy,halo*0.6,0,7); ctx.fill();
        }
        // bright warm core dot
        ctx.globalAlpha=a;
        ctx.fillStyle='rgba(220,255,170,1)';
        ctx.beginPath(); ctx.arc(ox,oy,fl.r,0,7); ctx.fill();
      }
      ctx.globalAlpha=1;
      ctx.restore();
      ctx.globalCompositeOperation='source-over';
    },

    // ---- VOLCANO background atmosphere (world space). One or two dark volcano
    // cone silhouettes in a parallax band, the main one with a glowing crater +
    // a lava run-off streak and rising smoke/ash puffs. Cheap + reducedMotion-
    // aware (smoke stilled; glow & smoke skipped on low quality). ----
    _volcanoBg(ctx, camX, camY, cheap){
      const rm = reduced();
      const span = C.WORLD_W*1.4;
      for(const v of volcSil){
        let ox = ((v.x - camX*v.depth)%span); if(ox<-v.w) ox+=span;
        const baseY = v.baseY - camY*v.depth*0.2;
        const topY  = baseY - v.h;
        const halfW = v.w*0.5;
        const craterHalf = v.w*0.16;          // half-width of the flat crater rim

        // ---- cone body (dark silhouette; the distant one a touch lighter/hazier)
        ctx.save();
        ctx.fillStyle = v.main ? '#1a0c0e' : '#241114';
        ctx.beginPath();
        ctx.moveTo(ox-halfW, baseY);
        ctx.lineTo(ox-craterHalf, topY);
        ctx.lineTo(ox+craterHalf, topY);
        ctx.lineTo(ox+halfW, baseY);
        ctx.closePath(); ctx.fill();
        ctx.restore();

        if(!v.main) continue;                 // only the main cone gets glow/lava/smoke

        // ---- glowing crater (a warm rim + soft radial bloom). Skip bloom on low-q.
        if(!cheap){
          ctx.save();
          ctx.globalCompositeOperation='lighter';
          const cgr=ctx.createRadialGradient(ox,topY,0,ox,topY,craterHalf*2.4);
          cgr.addColorStop(0,'rgba(255,170,60,0.45)');
          cgr.addColorStop(0.5,'rgba(255,90,30,0.20)');
          cgr.addColorStop(1,'rgba(255,60,20,0)');
          ctx.fillStyle=cgr;
          ctx.beginPath(); ctx.ellipse(ox,topY,craterHalf*2.4,craterHalf*1.4,0,0,7); ctx.fill();
          ctx.restore();
          ctx.globalCompositeOperation='source-over';
        }
        // bright crater lip (reads even on low quality)
        ctx.save();
        ctx.strokeStyle='rgba(255,140,50,0.9)'; ctx.lineWidth=cheap?3:4;
        ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(ox-craterHalf, topY+2);
        ctx.quadraticCurveTo(ox, topY+7, ox+craterHalf, topY+2);
        ctx.stroke();
        ctx.restore();

        // ---- lava run-off streak down one flank of the cone ----
        ctx.save();
        const lavaG=ctx.createLinearGradient(0,topY,0,baseY);
        lavaG.addColorStop(0,'rgba(255,200,90,0.85)');
        lavaG.addColorStop(0.5,'rgba(255,90,30,0.7)');
        lavaG.addColorStop(1,'rgba(170,30,10,0.25)');
        ctx.strokeStyle=lavaG; ctx.lineWidth=cheap?3:5; ctx.lineCap='round';
        const lx0=ox+craterHalf*0.4;
        ctx.beginPath();
        ctx.moveTo(lx0, topY+4);
        ctx.quadraticCurveTo(lx0+v.w*0.10, baseY-v.h*0.55, ox+halfW*0.55, baseY-v.h*0.12);
        ctx.stroke();
        ctx.restore();

        // ---- rising smoke / ash puffs from the crater (drift up + sway, loop) ----
        if(!cheap){
          ctx.save();
          for(const sm of volcSmoke){
            if(!rm) sm.t += sm.spd; if(sm.t>1) sm.t-=1;
            const rise = sm.t;                              // 0 at crater, 1 high up
            const px = ox + sm.x + Math.sin(sm.sway + rise*4)*22*rise;
            const py = topY - 12 - rise*180;
            const pr = (16 + rise*46)*sm.s;
            const pa = (1-rise)*0.22;                       // fade as it rises
            if(pa<0.01) continue;
            const sg=ctx.createRadialGradient(px,py,0,px,py,pr);
            // warm/ashy near the crater, greying as it cools higher up
            const col = rise<0.35 ? '90,70,66' : '70,66,72';
            sg.addColorStop(0,'rgba('+col+','+pa.toFixed(3)+')');
            sg.addColorStop(1,'rgba('+col+',0)');
            ctx.fillStyle=sg;
            ctx.beginPath(); ctx.arc(px,py,pr,0,7); ctx.fill();
          }
          ctx.restore();
        }
      }
    },

    // ---- DESERT background flavour (world space). A couple of sin-offset
    // translucent heat-haze ribbons shimmering along the horizon. Cheap; the
    // shimmer is stilled for reducedMotion and the 2nd ribbon dropped on low-q. --
    _desertBg(ctx, camX, camY, cheap){
      const rm = reduced();
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      const span=C.WORLD_W*1.4;
      const bands = cheap ? desertHaze.slice(0,1) : desertHaze;
      for(const h of bands){
        const y = h.y - camY*h.depth*0.2;
        const drift = rm ? 0 : bgT*h.spd;
        ctx.beginPath();
        for(let sx=-40; sx<=C.WORLD_W+40; sx+=24){
          const wx=sx - camX*h.depth;
          const wy=y + Math.sin(wx*0.012 + h.ph + drift)*h.amp;
          if(sx<=-40) ctx.moveTo(sx,wy); else ctx.lineTo(sx,wy);
        }
        ctx.lineTo(C.WORLD_W+40, y+30);
        ctx.lineTo(-40, y+30);
        ctx.closePath();
        const gr=ctx.createLinearGradient(0,y-h.amp,0,y+30);
        gr.addColorStop(0,'rgba(255,236,190,0.00)');
        gr.addColorStop(0.5,'rgba(255,228,170,0.07)');
        gr.addColorStop(1,'rgba(255,236,190,0.00)');
        ctx.fillStyle=gr; ctx.fill();
      }
      ctx.restore();
      ctx.globalCompositeOperation='source-over';
    },

    // ---- JUNGLE background flavour (world space). A few drifting firefly glow
    // points giving a dusk/twilight feel. Cheap (additive dots); fireflies hold
    // their home position under reducedMotion and thin out on low quality. ------
    _jungleBg(ctx, camX, camY, cheap){
      const rm = reduced();
      const flies = cheap ? jungleFlies.slice(0,3) : jungleFlies;
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      for(const fl of flies){
        const ang = fl.ph + (rm?0:bgT*0.01*fl.spd);
        const ox = fl.x - camX*fl.depth + (rm?0:Math.cos(ang)*fl.rad);
        const oy = fl.y - camY*fl.depth*0.2 + (rm?0:Math.sin(ang*1.3)*fl.rad*0.6);
        // gentle pulse so they twinkle like fireflies
        const pulse = 0.5 + 0.5*Math.abs(Math.sin(bgT*0.04 + fl.ph));
        const a = (rm?0.5:pulse)*0.8;
        const gr=ctx.createRadialGradient(ox,oy,0,ox,oy,fl.r*5);
        gr.addColorStop(0,'rgba(196,255,140,'+(a*0.9).toFixed(3)+')');
        gr.addColorStop(0.4,'rgba(150,230,90,'+(a*0.35).toFixed(3)+')');
        gr.addColorStop(1,'rgba(150,230,90,0)');
        ctx.fillStyle=gr;
        ctx.beginPath(); ctx.arc(ox,oy,fl.r*5,0,7); ctx.fill();
        ctx.fillStyle='rgba(225,255,180,'+a.toFixed(3)+')';
        ctx.beginPath(); ctx.arc(ox,oy,fl.r,0,7); ctx.fill();
      }
      ctx.restore();
      ctx.globalCompositeOperation='source-over';
    },

    // ---- CAVE background flavour (world space). 2-3 dark stalactite silhouettes
    // hanging from the ceiling + sparse looping drip droplets. Cheap; drips are
    // stilled for reducedMotion and skipped on low quality. ----
    _caveBg(ctx, camX, camY, cheap){
      const rm = reduced();
      const span=C.WORLD_W*1.4;
      // ---- hanging stalactite silhouettes (dark triangles from the ceiling) ----
      ctx.save();
      ctx.fillStyle='#0a0712';
      for(const s of caveStal){
        let ox=((s.x - camX*s.depth)%span); if(ox<-s.w) ox+=span;
        const oy=-camY*s.depth*0.2;          // anchored to the top of the world
        ctx.beginPath();
        ctx.moveTo(ox-s.w/2, oy-20);
        ctx.lineTo(ox+s.w/2, oy-20);
        ctx.lineTo(ox, oy+s.h);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // ---- sparse drip droplets falling from the ceiling (loop on phase) ----
      if(!cheap){
        ctx.save();
        for(const d of caveDrips){
          if(!rm) d.t += d.spd; if(d.t>1) d.t-=1;
          let ox=((d.x - camX*d.depth)%span); if(ox<-20) ox+=span;
          const oy = d.top + d.t*d.fall - camY*d.depth*0.2;
          const a = (1 - d.t)*0.5;            // fade as it falls
          if(a<0.02) continue;
          ctx.strokeStyle='rgba(150,180,210,'+a.toFixed(3)+')';
          ctx.lineWidth=1.5; ctx.lineCap='round';
          ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(ox,oy+6); ctx.stroke();
        }
        ctx.restore();
      }
    },

    // ---- ISLANDS background flavour (world space). 1-2 distant sails or islet
    // silhouettes bobbing on the far horizon. Cheap; bob stilled for
    // reducedMotion; the 2nd one dropped on low quality. ----
    _islandsBg(ctx, camX, camY, cheap){
      const rm = reduced();
      const span=C.WORLD_W*1.6;
      const wl=S.waterLevel||C.WATER_LEVEL;
      const items = cheap ? islSails.slice(0,1) : islSails;
      ctx.save();
      for(const it of items){
        let ox=((it.x - camX*it.depth)%span); if(ox<-80) ox+=span;
        const bob = rm ? 0 : Math.sin(bgT*0.012 + it.bob)*3;
        // sit the boats/islets DOWN at the waterline (Jani: a hajó "fölötte" volt a
        // víznek → kicsit lentebb, a vízbe). +4 puts the little hull into the water.
        const baseY = wl + 4 - camY*it.depth*0.2 + bob;
        const s=it.s;
        if(it.isle){
          // a small hazy islet hump with a single palm
          ctx.fillStyle='rgba(40,60,70,0.55)';
          ctx.beginPath();
          ctx.moveTo(ox-40*s, baseY);
          ctx.quadraticCurveTo(ox, baseY-26*s, ox+40*s, baseY);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle='rgba(35,55,60,0.6)'; ctx.lineWidth=2*s; ctx.lineCap='round';
          ctx.beginPath(); ctx.moveTo(ox, baseY-18*s); ctx.quadraticCurveTo(ox+4*s, baseY-40*s, ox+2*s, baseY-50*s); ctx.stroke();
          ctx.lineWidth=1.5*s;
          ctx.beginPath(); ctx.moveTo(ox+2*s,baseY-50*s); ctx.quadraticCurveTo(ox-14*s,baseY-52*s,ox-22*s,baseY-46*s);
          ctx.moveTo(ox+2*s,baseY-50*s); ctx.quadraticCurveTo(ox+16*s,baseY-52*s,ox+24*s,baseY-46*s); ctx.stroke();
        } else {
          // a distant triangular sail over a tiny dark hull
          ctx.fillStyle='rgba(230,235,240,0.65)';
          ctx.beginPath();
          ctx.moveTo(ox, baseY-42*s);
          ctx.lineTo(ox+18*s, baseY-6*s);
          ctx.lineTo(ox, baseY-6*s);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle='rgba(50,60,70,0.7)';
          ctx.beginPath();
          ctx.moveTo(ox-12*s, baseY-6*s);
          ctx.lineTo(ox+16*s, baseY-6*s);
          ctx.lineTo(ox+10*s, baseY+2*s);
          ctx.lineTo(ox-7*s, baseY+2*s);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    },

    // ---- SNOW background flavour (world space). Distant frosted mountain-peak
    // silhouettes (snow-capped) at far parallax + a few slow drifting glints. The
    // world snowfall is the weather system's job; this only adds a back accent.
    // Cheap; glints stilled for reducedMotion and the 2nd peak band thinned on
    // low quality (glints skipped on low-q). ----
    _snowBg(ctx, camX, camY, cheap, photoOn){
      const rm = reduced();
      const span=C.WORLD_W*1.4;
      ctx.save();
      // ---- frosty peak silhouettes — SKIP when the painterly photo-bg drew (it
      // already has its own mountains; the procedural peaks just clashed). Keep
      // the drifting glints below for atmosphere either way. ----
      for(const p of (photoOn ? [] : snowPeaks)){
        let ox=((p.x - camX*p.depth)%span); if(ox<-p.w) ox+=span;
        const baseY=p.baseY - camY*p.depth*0.2;
        const topY =baseY - p.h;
        const halfW=p.w*0.5;
        // body
        ctx.fillStyle='rgba(150,176,206,0.5)';
        ctx.beginPath();
        ctx.moveTo(ox-halfW, baseY);
        ctx.lineTo(ox-p.w*0.10, topY+p.h*0.20);
        ctx.lineTo(ox,         topY);
        ctx.lineTo(ox+p.w*0.12, topY+p.h*0.22);
        ctx.lineTo(ox+halfW,   baseY);
        ctx.closePath(); ctx.fill();
        // snow cap near the summit (a brighter wedge)
        ctx.fillStyle='rgba(238,246,255,0.7)';
        ctx.beginPath();
        ctx.moveTo(ox-p.w*0.14, topY+p.h*0.26);
        ctx.lineTo(ox,          topY);
        ctx.lineTo(ox+p.w*0.16, topY+p.h*0.28);
        ctx.lineTo(ox+p.w*0.05, topY+p.h*0.20);
        ctx.lineTo(ox-p.w*0.03, topY+p.h*0.24);
        ctx.closePath(); ctx.fill();
      }
      // ---- slow drifting glints (additive sparkle in the air) ----
      if(!cheap){
        ctx.globalCompositeOperation='lighter';
        for(const gl of snowGlint){
          const drift = rm ? 0 : Math.sin(bgT*0.01*gl.spd + gl.ph)*26;
          let ox=((gl.x + drift - camX*gl.depth)%span); if(ox<-20) ox+=span;
          const oy=gl.y - camY*gl.depth*0.2;
          const pulse = rm ? 0.5 : (0.4+0.6*Math.abs(Math.sin(bgT*0.05+gl.ph)));
          const a=pulse*0.5;
          const gr=ctx.createRadialGradient(ox,oy,0,ox,oy,gl.r*4);
          gr.addColorStop(0,'rgba(240,248,255,'+a.toFixed(3)+')');
          gr.addColorStop(1,'rgba(240,248,255,0)');
          ctx.fillStyle=gr;
          ctx.beginPath(); ctx.arc(ox,oy,gl.r*4,0,7); ctx.fill();
        }
        ctx.globalCompositeOperation='source-over';
      }
      ctx.restore();
    },

    // ---- CITY background flavour (world space). A distant lit-skyline silhouette
    // (two parallax rows) with deterministic lit-window dots. Cheap; the far row
    // is dropped on low quality and the windows are skipped (silhouette only) on
    // low-q; no per-frame randomness so the layout is stable. ----
    _cityBg(ctx, camX, camY, cheap){
      const span=C.WORLD_W*1.4;
      const rows = cheap ? cityRows.slice(1) : cityRows;   // low-q: only near row
      ctx.save();
      for(const row of rows){
        const far = row.depth<=0.07;
        // body colour: far row hazier/lighter, near row darker
        ctx.fillStyle = far ? 'rgba(44,40,72,0.55)' : 'rgba(26,24,44,0.8)';
        for(const b of row.buildings){
          let ox=((b.x - camX*row.depth)%span); if(ox<-b.w) ox+=span;
          const topY=row.baseY - b.h - camY*row.depth*0.2;
          ctx.fillRect(ox, topY, b.w, b.h+200);
        }
        // lit windows: a deterministic grid of warm dots (skip on low-q)
        if(!cheap){
          ctx.fillStyle = far ? 'rgba(255,210,120,0.35)' : 'rgba(255,220,140,0.6)';
          for(const b of row.buildings){
            let ox=((b.x - camX*row.depth)%span); if(ox<-b.w) ox+=span;
            const topY=row.baseY - b.h - camY*row.depth*0.2;
            const cols=Math.max(1, Math.floor(b.w/12));
            const rowsN=Math.max(2, Math.floor(b.h/16));
            for(let cy=0;cy<rowsN;cy++){
              for(let cx=0;cx<cols;cx++){
                // deterministic "is this window lit" from stable seeds
                const seed=Math.abs(Math.sin((b.lit+cx*0.37+cy*0.91)*43.0));
                if(seed>0.62){
                  ctx.fillRect(ox+5+cx*12, topY+6+cy*16, 4, 5);
                }
              }
            }
          }
        }
      }
      ctx.restore();
    },

    // ---- SPACE background flavour (world space). A denser additive starfield + a
    // soft nebula blob and a faint distant planet silhouette. Cheap; the nebula
    // bloom is skipped on low quality; twinkle stilled under reducedMotion. ----
    _spaceBg(ctx, camX, camY, cheap){
      const rm = reduced();
      const span=C.WORLD_W*1.2;
      ctx.save();
      // ---- soft nebula blob (additive; skip on low quality) ----
      if(!cheap){
        ctx.globalCompositeOperation='lighter';
        let nx=((spaceNebula.x - camX*spaceNebula.depth)%span); if(nx<-spaceNebula.rx) nx+=span;
        const ny=spaceNebula.y - camY*spaceNebula.depth*0.2;
        const ng=ctx.createRadialGradient(nx,ny,0,nx,ny,spaceNebula.rx);
        ng.addColorStop(0,'hsla('+spaceNebula.hue+',70%,60%,0.10)');
        ng.addColorStop(0.5,'hsla('+((spaceNebula.hue+30)%360)+',70%,55%,0.05)');
        ng.addColorStop(1,'hsla('+spaceNebula.hue+',70%,60%,0)');
        ctx.fillStyle=ng;
        ctx.beginPath(); ctx.ellipse(nx,ny,spaceNebula.rx,spaceNebula.ry,0,0,7); ctx.fill();
        ctx.globalCompositeOperation='source-over';
      }
      // ---- faint distant planet silhouette (dim disc + a darker crescent) ----
      let px=((spacePlanet.x - camX*spacePlanet.depth)%span); if(px<-spacePlanet.r) px+=span;
      const py=spacePlanet.y - camY*spacePlanet.depth*0.2;
      ctx.fillStyle='rgba(80,96,140,0.30)';
      ctx.beginPath(); ctx.arc(px,py,spacePlanet.r,0,7); ctx.fill();
      ctx.fillStyle='rgba(40,52,82,0.30)';
      ctx.beginPath(); ctx.arc(px+spacePlanet.r*0.35,py-spacePlanet.r*0.18,spacePlanet.r*0.92,0,7); ctx.fill();
      // ---- twinkling starfield (additive dots) ----
      ctx.globalCompositeOperation='lighter';
      const fld = cheap ? spaceStars.slice(0,30) : spaceStars;
      for(const st of fld){
        let ox=((st.x - camX*st.depth)%span); if(ox<-2) ox+=span;
        const oy=st.y - camY*st.depth*0.2;
        const tw = rm ? 0.7 : (0.35+0.65*Math.abs(Math.sin(bgT*0.04+st.tw)));
        ctx.fillStyle='rgba(220,232,255,'+(tw*0.85).toFixed(3)+')';
        ctx.beginPath(); ctx.arc(ox,oy,st.r,0,7); ctx.fill();
      }
      ctx.globalCompositeOperation='source-over';
      ctx.restore();
    },

    // ---- one drifting sky object (world space) ----
    _skyObject(ctx,o,x,y,alpha,haze,night){
      ctx.save();
      ctx.translate(x,y);
      ctx.globalAlpha=U.clamp(alpha,0,1);
      const bob=Math.sin(o.t)*4;       // gentle vertical bob
      switch(o.type){
        case 'balloon': {
          ctx.translate(0,bob);
          const s=o.s;
          // basket
          ctx.fillStyle=night?'#3a2f24':'#7a5530';
          ctx.fillRect(-5*s,26*s,10*s,7*s);
          // ropes
          ctx.strokeStyle='rgba(60,50,40,0.7)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(-5*s,26*s); ctx.lineTo(-9*s,12*s);
          ctx.moveTo(5*s,26*s); ctx.lineTo(9*s,12*s); ctx.stroke();
          // envelope (two-tone)
          const hue=Math.floor(o.hue*360);
          ctx.fillStyle=night?'#9aa0c0':('hsl('+hue+',65%,60%)');
          ctx.beginPath(); ctx.ellipse(0,0,16*s,20*s,0,0,7); ctx.fill();
          ctx.fillStyle=night?'#7f86ad':('hsl('+((hue+40)%360)+',60%,68%)');
          ctx.beginPath(); ctx.ellipse(7*s,0,7*s,20*s,0,0,7); ctx.fill();
          break;
        }
        case 'plane': {
          const d=o.dir, s=o.s;
          ctx.translate(0,bob*0.4);
          // body
          ctx.fillStyle=night?'#cfd6e6':'#f2f5fb';
          ctx.beginPath(); ctx.ellipse(0,0,12*s,4*s,0,0,7); ctx.fill();
          // tail
          ctx.beginPath();
          ctx.moveTo(-d*10*s,-1*s); ctx.lineTo(-d*15*s,-7*s); ctx.lineTo(-d*9*s,-1*s);
          ctx.closePath(); ctx.fill();
          // wing
          ctx.fillStyle=night?'#aab2c6':'#d7dce8';
          ctx.beginPath(); ctx.ellipse(0,2*s,5*s,2*s,0,0,7); ctx.fill();
          // trailing banner
          ctx.globalAlpha=U.clamp(alpha*0.9,0,1);
          const bx=-d*14*s, bw=46*s, bh=9*s;
          ctx.strokeStyle='rgba(80,80,90,0.5)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(-d*12*s,0); ctx.lineTo(bx,0); ctx.stroke();
          const hue=Math.floor(o.hue*360);
          ctx.fillStyle=night?'rgba(150,160,200,0.7)':('hsla('+hue+',70%,60%,0.85)');
          ctx.save(); ctx.translate(bx,0);
          ctx.beginPath();
          ctx.moveTo(0,-bh/2);
          ctx.lineTo(-d*bw,-bh/2 + Math.sin(o.t*1.3)*2);
          ctx.lineTo(-d*bw, bh/2 + Math.sin(o.t*1.3+0.6)*2);
          ctx.lineTo(0, bh/2);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
        case 'kite': {
          const s=o.s;
          ctx.translate(Math.sin(o.t*0.8)*6, bob);
          ctx.rotate(Math.sin(o.t)*0.12 + 0.2);
          const hue=Math.floor(o.hue*360);
          // diamond
          ctx.fillStyle=night?'#b3a0c8':('hsl('+hue+',70%,62%)');
          ctx.beginPath();
          ctx.moveTo(0,-12*s); ctx.lineTo(9*s,0); ctx.lineTo(0,14*s); ctx.lineTo(-9*s,0);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle='rgba(40,40,50,0.4)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(0,-12*s); ctx.lineTo(0,14*s);
          ctx.moveTo(-9*s,0); ctx.lineTo(9*s,0); ctx.stroke();
          // tail bows
          ctx.fillStyle=night?'#8f7fb0':('hsl('+((hue+180)%360)+',70%,65%)');
          for(let i=1;i<=4;i++){
            const ty=14*s+i*7*s, tx=Math.sin(o.t+i)*4*s;
            ctx.beginPath(); ctx.arc(tx,ty,2.2*s,0,7); ctx.fill();
          }
          break;
        }
        case 'airship': {
          const s=o.s, d=o.dir;
          ctx.translate(0,bob*0.5);
          // gondola
          ctx.fillStyle=night?'#3a3340':'#6b5d52';
          ctx.fillRect(-7*s,12*s,14*s,5*s);
          // envelope
          ctx.fillStyle=night?'#9098b8':'#c9b89a';
          ctx.beginPath(); ctx.ellipse(0,0,26*s,11*s,0,0,7); ctx.fill();
          // tail fin
          ctx.beginPath();
          ctx.moveTo(-d*24*s,0); ctx.lineTo(-d*34*s,-8*s); ctx.lineTo(-d*22*s,-3*s);
          ctx.closePath(); ctx.fill();
          // stripe
          ctx.strokeStyle=night?'rgba(70,75,100,0.8)':'rgba(150,110,70,0.7)';
          ctx.lineWidth=2*s;
          ctx.beginPath(); ctx.moveTo(-22*s,0); ctx.lineTo(22*s,0); ctx.stroke();
          break;
        }
        case 'birds':
        default: {
          const s=o.s, d=o.dir;
          ctx.strokeStyle=night?'rgba(200,205,225,0.7)':'rgba(40,45,55,0.6)';
          ctx.lineWidth=1.6*s; ctx.lineCap='round';
          for(let i=0;i<4;i++){
            const bxo=(i*14 - 21)*s*d;
            const byo=Math.sin(o.t + i*0.7)*4*s + (i%2)*3*s;
            const flap=4*s + Math.sin(o.t*3 + i)*3*s;
            ctx.beginPath();
            ctx.moveTo(bxo-6*s, byo);
            ctx.quadraticCurveTo(bxo, byo-flap, bxo+6*s, byo);
            ctx.stroke();
          }
          break;
        }
      }
      ctx.restore();
    },

    _cloud(ctx,x,y,s,alpha,col){
      ctx.save();
      ctx.globalAlpha=alpha!=null?alpha:0.85; ctx.fillStyle=col||'#ffffff';
      ctx.translate(x,y); ctx.scale(s,s);
      const blob=(dx,dy,r)=>{ ctx.beginPath(); ctx.arc(dx,dy,r,0,7); ctx.fill(); };
      blob(0,0,26); blob(28,6,22); blob(-26,8,20); blob(10,-14,20); blob(-8,-10,18);
      ctx.restore();
    },

    // ----------------------------------------------------------------------
    // LAYERED EXPLOSION (#5 juice pass). Everything scales by radius r so a
    // bazooka (r~55) reads great and a capybomb (r~110) reads epic. Sizes are
    // in WORLD units so it stays right at the game's moderate zoom.
    // Layers: scorch -> afterglow -> core flash -> shockwave ring(s) ->
    //         sparks -> embers -> dirt/debris -> smoke plume.
    // lowQ(): far fewer particles, NO additive/gradient layers (glow + 2nd
    // ring skipped, smoke/sparks/dirt slashed) — keeps it cheap, no regression.
    // ----------------------------------------------------------------------
    explosion(x,y,r){
      if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(r)||r<=0) return;
      const scale=U.clamp(r/55,0.5,2.2);   // 1.0 at bazooka, ~2.0 at capybomb
      const big=r>80;                       // capybomb-tier
      const cheap=lowQ();
      const red=reduced();
      const density=red?0.25:(cheap?1:qScale());
      const wl=S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL;
      const _tnw=theme();
      const water=(S.theme||'')!=='sky'&&!(_tnw&&_tnw.noWater);
      // A submerged grenade displaces water: bubbles and a pale pressure ring.
      // At the shoreline the existing droplets still sell the surface splash.
      if(water && y>wl+r*0.4){
        if(y-wl<r) this.waterSplash(x,wl,scale*0.65);
        this.waterBubbles(x,y,Math.round(8*scale),wl);
        push({ x,y,vx:0,vy:0,life:red?10:18,maxLife:red?10:18,
               size:r*0.25,grow:r*(red?0.035:0.10),thick:Math.max(2,r*0.04),
               color:'rgba(210,245,255,0.75)',kind:'ring' });
        return;
      }
      // cartoon sprite-sheet burst overlaid on the procedural blast (skip on low Q)
      if(!cheap && !red && r>=12){
        _loadExpl();
        _explSprites.push({ x:x, y:y, size:Math.max(48, r*2.6), t:0, dur:24 });
        if(_explSprites.length>14) _explSprites.shift();
      }
      // #12 INTERACTIVE WATER — if the blast happens at/near the water line,
      // throw up a SPLASH (ring + droplets) instead of (only) a dry boom.
      if(water && y > wl-r*0.6){ this.waterSplash(x, wl, scale); }

      // 0) quick dark scorch mark on the ground (cheap, optional). Only if the
      //    blast is near/over ground (not high in the air) so it reads right.
      if(y < wl+20){
        push({ x, y:Math.min(y+r*0.25, wl), vx:0, vy:0, life:46, maxLife:46,
               size:r*0.55, color:'#000', kind:'scorch' });
      }

      // 1) ORANGE AFTERGLOW — broad, soft additive bloom that lingers & fades
      //    (skipped on low quality — it's the most expensive layer).
      if(!cheap && !red){
        push({ x, y, vx:0, vy:0, life:26, maxLife:26, size:r*1.15, grow:r*0.02, kind:'glow' });
        if(big) push({ x, y, vx:0, vy:0, life:40, maxLife:40, size:r*1.6, grow:r*0.015, kind:'glow' });
      }

      // 2) BRIGHT CORE FLASH (additive 'lighter' gradient in render)
      push({ x, y, vx:0, vy:0, life:red?6:11, maxLife:11, size:r*(red?0.22:0.5), grow:r*(red?0.01:0.06), color:'#fff', kind:'flash' });
      if(!red) push({ x, y, vx:0, vy:0, life:7, maxLife:7, size:r*0.3, grow:r*0.1, color:'#fff', kind:'flash' });
      this.impactBurst(x,y,r);

      // 3) EXPANDING SHOCKWAVE RING(S) — make big booms feel BIG
      push({ x, y, vx:0, vy:0, life:red?9:14, maxLife:14, size:r*(red?0.2:0.4), grow:r*(red?0.035:0.18),
             thick:Math.max(2,r*(red?0.035:0.09)), color:'rgba(255,240,210,0.95)', kind:'ring' });
      if(!cheap && !red && r>40){
        push({ x, y, vx:0, vy:0, life:20, maxLife:20, size:r*0.2, grow:r*0.16,
               thick:Math.max(2,r*0.05), color:'rgba(255,170,90,0.7)', kind:'ring' });
        // a third, slower, fatter dust ring on capybomb-tier blasts
        if(big) push({ x, y, vx:0, vy:0, life:28, maxLife:28, size:r*0.15, grow:r*0.12,
                       thick:Math.max(2,r*0.04), color:'rgba(200,170,140,0.45)', kind:'ring' });
      }

      // 4) HOT SPARKS — ballistic, fast, additive, gravity (+ slight upward bias)
      const nSpark=Math.round((cheap?7:16)*scale*density);
      for(let i=0;i<nSpark;i++){
        const a=U.rand(0,Math.PI*2), sp=U.rand(3,9)*scale*(red?0.3:1);
        push({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-2, life:U.rand(10,24), maxLife:24,
               size:U.rand(1.5,3), color:U.pick(['#fff3b0','#ffd24a','#ff9b2e','#ffe9a0']), kind:'spark' });
      }

      // 5) EMBERS — slower, floaty, glowing orange afterglow bits that fade out
      //    (additive bloom; cut hard on low quality). They fizzle on water.
      const nEmber=cheap||red?0:Math.round(10*scale*density);
      for(let i=0;i<nEmber;i++){
        const a=U.rand(0,Math.PI*2), sp=U.rand(1,4.5)*scale;
        push({ x:x+U.rand(-r*0.15,r*0.15), y:y+U.rand(-r*0.15,r*0.15),
               vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-1.5, life:U.rand(26,54), maxLife:54,
               size:U.rand(1.2,2.6), color:U.pick(['#ffb347','#ff7b29','#ffd166','#ff5e1a']), kind:'ember' });
      }

      // 6) CHUNKY DIRT / DEBRIS — arc up & out, rotate, fall, bounce at water
      const nDirt=red?Math.min(5,Math.round(8*scale)):Math.round((cheap?8:20)*scale*density);
      for(let i=0;i<nDirt;i++){
        const a=U.rand(-Math.PI*0.95,-Math.PI*0.05), sp=U.rand(2,8)*scale*(red?0.35:1);
        push({ x:x+U.rand(-r*0.3,r*0.3), y:y+U.rand(-r*0.2,r*0.2),
               vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:U.rand(28,64), maxLife:64,
               size:U.rand(3,8)*scale, g:0.32, color:U.pick(['#7a5a36','#5e4427','#8b6a40','#6b4f2e']),
               kind:'dirt', rot:U.rand(0,7), spin:U.rand(-0.4,0.4) });
      }

      // 7) BILLOWING SMOKE PLUME — rises, drifts, expands, fades. Bigger & more
      //    on larger blasts; a couple of larger lazy puffs crown the plume.
      const nSmoke=red?2:Math.round((cheap?5:10)*scale*density);
      for(let i=0;i<nSmoke;i++){
        const a=U.rand(0,Math.PI*2), sp=U.rand(0.4,2)*scale;
        push({ x:x+U.rand(-10,10), y:y+U.rand(-10,10),
               vx:Math.cos(a)*sp*(red?0.1:0.6), vy:-U.rand(0.5,2)*scale*(red?0.25:1),
               life:U.rand(40,88), maxLife:88,
               size:U.rand(7,16)*scale, grow:(red?0.12:0.3)*scale,
               color:U.pick(['rgba(68,63,70,0.45)','rgba(107,94,87,0.40)','rgba(51,52,64,0.42)','rgba(136,116,93,0.35)']),
               kind:'smoke', billow:true });
      }
      if(!cheap && !red && big){
        for(let i=0;i<3;i++){
          push({ x:x+U.rand(-r*0.2,r*0.2), y:y-U.rand(0,r*0.3),
                 vx:U.rand(-1,1), vy:-U.rand(1,2.4)*scale,
                 life:U.rand(64,102), maxLife:102,
                 size:U.rand(16,26)*scale, grow:0.4*scale,
                 color:U.pick(['rgba(50,46,42,0.5)','rgba(80,72,64,0.45)','rgba(36,34,32,0.5)']),
                 kind:'smoke', billow:true });
        }
      }

      // 8) BIG-HIT "combat juice" layer — terrain-coloured DEBRIS biased away from
      //    the blast, a bright flash-ring, and a chunkier scaled smoke puff. Only
      //    on damaging-scale blasts (r>=34) so tiny pops stay clean. Never throws.
      if(r>=34) this.bigHit(x, y, r);
    },

    // Original procedural impact accent. Cluster blasts share a short caption
    // cooldown so a shower of shells never covers the field with labels.
    impactBurst(x,y,r){
      if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(r)||r<=0) return;
      const red=reduced(), cheap=lowQ();
      const sc=U.clamp(r/55,0.65,1.4);
      if(!red){
        push({ x,y,vx:0,vy:0,life:10,maxLife:10,size:r*0.35,grow:r*0.065,
               rot:U.rand(-0.25,0.25),kind:'impact' });
      }
      if(r<34 || _powCooldown>0) return;
      let captions=0;
      for(let i=0;i<S.particles.length;i++){ if(S.particles[i].kind==='pow') captions++; }
      if(captions>=(cheap?1:2)) return;
      _powCooldown=cheap?24:14;
      const life=red?22:28;
      const wl=S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL;
      push({ x:U.clamp(x+r*0.28,42*sc,C.WORLD_W-42*sc),
             y:Math.max(30*sc,Math.min(y-r*0.72,wl-34)),
             vx:0,vy:0,life,maxLife:life,size:sc*(cheap?0.9:1),
             rot:red?0:-0.09,kind:'pow' });
    },

    // Small smoke tail for the unit followed after a knockback. Call each frame;
    // the helper throttles itself per unit, and emits nothing underwater or with
    // reduced motion. It never changes unit physics or adds sound.
    knockbackTrail(unit){
      if(!unit || typeof unit!=='object' || reduced() || unit.grounded) return;
      if(!Number.isFinite(unit.x)||!Number.isFinite(unit.y)) return;
      const vx=unit.vx||0, vy=unit.vy||0;
      if(vx*vx+vy*vy<9) return;
      const wl=S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL;
      const water=theme();
      if((S.theme||'')!=='sky'&&!(water&&water.noWater)&&unit.y>=wl) return;
      const last=_knockTrailTimes.get(unit);
      if(last!=null && bgT-last<(lowQ()?6:3)) return;
      _knockTrailTimes.set(unit,bgT);
      push({ x:unit.x-vx*0.35,y:unit.y-6-vy*0.35,
             vx:-vx*0.04,vy:-0.22,life:24,maxLife:24,size:lowQ()?2.4:3.5,
             grow:0.16,color:'rgba(232,221,196,0.46)',kind:'smoke',billow:true });
    },

    // BIG-HIT FX — the visceral "this hurt something" layer the parent can call
    // directly (CA.FX.bigHit(x,y,r)) OR which fires automatically from explosion()
    // above. Sprays terrain-tinted debris chunks RADIALLY OUT (biased away from
    // the blast centre), a brief bright additive flash-ring, and a fat smoke puff
    // scaled by radius. Reduced-motion & low-quality aware (tone down, never spam);
    // counts are hard-capped so mobile stays smooth. Never throws.
    bigHit(x, y, r){
      try{
        if(x==null || y==null || !(r>0)) return;
        const cheap=lowQ();
        const red=reduced();
        const scale=U.clamp(r/55, 0.5, 2.2);
        const wl=S.waterLevel||C.WATER_LEVEL;
        const cols=debrisColors();

        // --- bright FLASH RING — a crisp expanding white shock that sells the hit.
        // Drawn additively via the 'ring' kind. One ring; reduced-motion keeps it
        // (it's a single cheap stroke) but smaller & dimmer.
        push({ x, y, vx:0, vy:0, life:red?9:13, maxLife:13,
               size:r*0.28, grow:r*(red?0.035:0.22),
               thick:Math.max(2, r*(red?0.05:0.085)),
               color:red?'rgba(255,248,225,0.7)':'rgba(255,250,235,0.95)', kind:'ring' });

        // --- terrain DEBRIS chunks — square 'dirt' particles flung radially OUTWARD
        // (biased away from centre) with spin + gravity; bounce/settle at water.
        // Count scales with radius, hard-capped, halved on low-q / reduced-motion.
        // MORE debris (Jani: "több cucc essen szét"): high≈20, capped higher, with
        // a few CHUNKIER pieces. Still halved on low-q / reduced-motion (qScale) so
        // weak devices stay smooth.
        let nDeb=Math.round((cheap?8:20)*scale*(cheap?1:qScale()));
        if(red) nDeb=Math.min(nDeb, cheap?5:9);
        nDeb=Math.min(nDeb, 32);                       // absolute cap
        for(let i=0;i<nDeb;i++){
          // spawn on a small ring around the centre so they read as torn-up ground,
          // then launch ALONG that outward direction (away from the blast).
          const ang=U.rand(0, Math.PI*2);
          const dist=U.rand(r*0.15, r*0.5);
          const ox=Math.cos(ang)*dist, oy=Math.sin(ang)*dist*0.7 - r*0.1;
          // outward speed, with an upward lift so chunks arc up & out (not into ground)
          const sp=U.rand(2.5, 9)*scale*(red?0.35:1);
          const vx=Math.cos(ang)*sp;
          const vy=Math.sin(ang)*sp*0.6 - U.rand(1.5,4.5)*scale*(red?0.35:1);   // bias up & away
          // every ~4th piece is a BIG chunk so it reads as the ground breaking apart
          const big=(i%4===0);
          push({ x:x+ox, y:y+oy, vx:vx, vy:vy,
                 life:U.rand(34,74), maxLife:74,
                 size:(big?U.rand(7,12):U.rand(3,7.5))*scale, g:0.34,
                 color:U.pick(cols), kind:'dirt',
                 rot:U.rand(0,7), spin:U.rand(-0.6,0.6) });
        }

        // --- CHUNKIER SMOKE PUFF scaled by radius — a couple of fat, slow puffs
        // crowning the impact. Skipped entirely on low-q + reduced-motion combo so
        // weak phones never choke; otherwise toned down.
        if(!(cheap && red)){
          // 3-tier smoke puffs: high=4, normal=3, low/reduced=2.
          let nP=red?2:(cheap?2:(medQ()?3:4));
          for(let i=0;i<nP;i++){
            push({ x:x+U.rand(-r*0.25,r*0.25), y:y-U.rand(0,r*0.25),
                   vx:U.rand(-0.8,0.8)*(red?0.25:1), vy:-U.rand(0.6,1.8)*scale*(red?0.3:1),
                   life:U.rand(40,76), maxLife:76,
                   size:U.rand(12,22)*scale, grow:(red?0.12:0.35)*scale,
                   color:U.pick(['rgba(70,64,58,0.5)','rgba(96,86,74,0.45)','rgba(48,44,40,0.5)']),
                   kind:'smoke', billow:true });
          }
        }

        // a faint flat scorch ring on the surface for ground-level blasts (cheap)
        if(!cheap && y < wl+20){
          push({ x, y:Math.min(y+r*0.2, wl), vx:0, vy:0, life:18, maxLife:18,
                 size:r*0.3, grow:r*0.06, thick:2,
                 color:'rgba(40,30,22,0.45)', kind:'ring' });
        }

        // BIG-BOOM screen shake — scales with blast radius so a HUGE explosion
        // (e.g. capybomb r~110) really rocks the screen, beyond the per-weapon
        // shake caps. reducedMotion → no shake. (user req: óriási robbanás rezegjen)
        if(!red && S.camera){
          const sh = U.clamp(r*0.26, 6, 34);
          S.camera.shake = Math.max(S.camera.shake||0, cheap ? sh*0.7 : sh);
        }
      }catch(e){ /* combat juice never throws */ }
    },

    /* ===== ULTRA-RARE GRANDIOSE ULTIMATE FX ============================== */
    // All built from the existing particle kinds (flash/glow/ring/spark/ember/
    // smoke/dirt) so they render through the generic pipeline and are auto-capped
    // by push(). Quality / reducedMotion aware; counts hard-capped; never throw.

    // NUKE mushroom cloud: blinding flash → fireball → rising stem + cap, layered
    // shock rings + a sky-wide white flash. r ~ the mega blast radius.
    mushroomCloud(x,y,r){
      try{
        if(x==null||y==null||!(r>0)) return;
        const cheap=lowQ(), red=reduced();
        const sc=U.clamp(r/200,0.6,2.0);
        const wl=S.waterLevel||C.WATER_LEVEL;
        const groundY=Math.min(y, wl-4);
        // 1) BLINDING double flash
        push({ x, y:groundY, vx:0, vy:0, life:16, maxLife:16, size:r*0.7, grow:r*0.05, color:'#fff', kind:'flash' });
        push({ x, y:groundY, vx:0, vy:0, life:9,  maxLife:9,  size:r*0.45, grow:r*0.1, color:'#fff', kind:'flash' });
        // 2) huge orange fireball glow
        if(!cheap){
          push({ x, y:groundY, vx:0, vy:0, life:44, maxLife:44, size:r*1.1, grow:r*0.02, kind:'glow' });
          push({ x, y:groundY, vx:0, vy:0, life:60, maxLife:60, size:r*1.5, grow:r*0.012, kind:'glow' });
        }
        // 3) layered shockwave rings
        for(let i=0;i<(cheap?1:3);i++){
          push({ x, y:groundY, vx:0, vy:0, life:18+i*8, maxLife:18+i*8,
                 size:r*0.3, grow:r*(0.16-i*0.03), thick:Math.max(3,r*(0.07-i*0.015)),
                 color:i===0?'rgba(255,245,210,0.95)':'rgba(255,160,80,0.6)', kind:'ring' });
        }
        // 4) RISING STEM — a column of smoke that climbs
        const nStem=red?4:(cheap?6:Math.round(12*sc));
        for(let i=0;i<Math.min(nStem,18);i++){
          push({ x:x+U.rand(-r*0.12,r*0.12), y:groundY-U.rand(0,r*0.4),
                 vx:U.rand(-0.5,0.5), vy:-U.rand(2.2,4)*sc,
                 life:U.rand(70,140), maxLife:140,
                 size:U.rand(14,26)*sc, grow:0.5*sc,
                 color:U.pick(['rgba(70,60,52,0.55)','rgba(120,90,64,0.5)','rgba(50,46,42,0.55)']),
                 kind:'smoke' });
        }
        // 5) the CAP — a fat puff that blooms up high and spreads
        const nCap=red?3:(cheap?4:Math.round(9*sc));
        for(let i=0;i<Math.min(nCap,14);i++){
          const a=U.rand(0,Math.PI*2), sp=U.rand(0.8,2.2)*sc;
          push({ x:x+U.rand(-r*0.2,r*0.2), y:groundY-r*0.55,
                 vx:Math.cos(a)*sp, vy:-U.rand(0.4,1.4)*sc,
                 life:U.rand(90,160), maxLife:160,
                 size:U.rand(20,36)*sc, grow:0.7*sc,
                 color:U.pick(['rgba(150,120,90,0.5)','rgba(100,80,60,0.5)','rgba(180,150,110,0.45)']),
                 kind:'smoke' });
        }
        // 6) hot sparks & embers spraying out of the fireball
        const nSpark=cheap?8:Math.round(22*sc);
        for(let i=0;i<Math.min(nSpark,40);i++){
          const a=U.rand(0,Math.PI*2), sp=U.rand(4,12)*sc;
          push({ x, y:groundY, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-3, life:U.rand(14,30), maxLife:30,
                 size:U.rand(1.6,3.2), color:U.pick(['#fff3b0','#ffd24a','#ff9b2e','#fff']), kind:'spark' });
        }
        if(!cheap){
          const nE=Math.round(16*sc);
          for(let i=0;i<Math.min(nE,30);i++){
            const a=U.rand(0,Math.PI*2), sp=U.rand(1.5,6)*sc;
            push({ x, y:groundY, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-2, life:U.rand(30,70), maxLife:70,
                   size:U.rand(1.4,3), color:U.pick(['#ffb347','#ff7b29','#ffd166','#ff5e1a']), kind:'ember' });
          }
        }
        if(!red && S.camera) S.camera.shake = Math.max(S.camera.shake||0, 28);
      }catch(e){}
    },

    // MAGIC ORB: a soft violet glow + arcane sparks at a point (carve tick / impact)
    magicGlow(x,y,r){
      try{
        if(x==null||y==null||!(r>0)) return;
        const cheap=lowQ();
        if(!cheap){
          push({ x, y, vx:0, vy:0, life:20, maxLife:20, size:r*0.9, grow:r*0.03, kind:'glow' });
        }
        push({ x, y, vx:0, vy:0, life:9, maxLife:9, size:r*0.4, grow:r*0.08, color:'#e6c8ff', kind:'flash' });
        push({ x, y, vx:0, vy:0, life:14, maxLife:14, size:r*0.3, grow:r*0.14, thick:Math.max(2,r*0.05),
               color:'rgba(190,140,255,0.8)', kind:'ring' });
        const n=cheap?5:12;
        for(let i=0;i<n;i++){
          const a=U.rand(0,Math.PI*2), sp=U.rand(2,6);
          push({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:U.rand(12,26), maxLife:26,
                 size:U.rand(1.5,3), color:U.pick(['#e6c8ff','#b07bff','#fff','#caa0ff']), kind:'spark' });
        }
      }catch(e){}
    },
    // small glowing wisp left behind the flying orb (cheap, throttled by caller)
    magicTrail(x,y){
      try{
        if((S.frame&1)!==0) return;
        push({ x:x+U.rand(-3,3), y:y+U.rand(-3,3), vx:U.rand(-0.3,0.3), vy:U.rand(-0.3,0.3),
               life:18, maxLife:18, size:U.rand(2.5,4.5),
               color:U.pick(['#c9a0ff','#e6c8ff','#b07bff']), kind:'ember' });
      }catch(e){}
    },

    // METEOR fiery trail behind a falling meteor (cheap, additive embers + smoke)
    meteorTrail(x,y,vx,vy){
      try{
        const cheap=lowQ();
        // a couple of hot embers streaming opposite the velocity
        const back=Math.atan2(-(vy||1),-(vx||0));
        for(let i=0;i<(cheap?1:2);i++){
          const a=back+U.rand(-0.3,0.3), sp=U.rand(0.5,1.8);
          push({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:U.rand(12,22), maxLife:22,
                 size:U.rand(2,4), color:U.pick(['#ffb347','#ff7b29','#ffd166','#fff3b0']), kind:'ember' });
        }
        if(!cheap && (S.frame&1)===0){
          push({ x, y, vx:Math.cos(back)*0.6, vy:Math.sin(back)*0.6, life:26, maxLife:26,
                 size:U.rand(4,7), grow:0.3, color:'rgba(90,70,60,0.4)', kind:'smoke' });
        }
      }catch(e){}
    },

    // BLACK HOLE: the moment it forms (dark core + inrushing ring)
    vortex(x,y,r){
      try{
        if(x==null||y==null||!(r>0)) return;
        push({ x, y, vx:0, vy:0, life:24, maxLife:24, size:r*0.9, grow:-r*0.02, thick:Math.max(3,r*0.06),
               color:'rgba(120,80,200,0.7)', kind:'ring' });
        push({ x, y, vx:0, vy:0, life:36, maxLife:36, size:r*0.5, grow:-r*0.01, color:'#1a0a2a', kind:'glow' });
      }catch(e){}
    },
    // per-frame swirl: pull a few sparks toward the centre on a spiral. prog 0..1.
    vortexTick(x,y,r,prog){
      try{
        if((S.frame&1)!==0) return;       // throttle
        const cheap=lowQ();
        if(cheap && (S.frame&3)!==0) return;
        const n=cheap?1:2;
        for(let i=0;i<n;i++){
          // spawn on the rim, give velocity tangential+inward so it spirals in
          const a=U.rand(0,Math.PI*2), rr=r*U.rand(0.55,0.95);
          const px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr;
          const inward=Math.atan2(y-py, x-px);
          const tang=inward+Math.PI*0.5;
          const sp=U.rand(2,4)*(0.6+prog*0.8);
          push({ x:px, y:py, vx:Math.cos(tang)*sp*0.7+Math.cos(inward)*sp, vy:Math.sin(tang)*sp*0.7+Math.sin(inward)*sp,
                 life:U.rand(14,22), maxLife:22, size:U.rand(1.5,3),
                 color:U.pick(['#c79bff','#9b6bff','#e6c8ff','#7a4fd0']), kind:'spark' });
        }
        // dark core pulse
        if(!cheap) push({ x, y, vx:0, vy:0, life:6, maxLife:6, size:r*0.22*(1-prog*0.4), grow:0, color:'#120820', kind:'glow' });
      }catch(e){}
    },
    // implosion → outward blast flourish (the actual boom FX comes from explosion())
    vortexCollapse(x,y,r){
      try{
        push({ x, y, vx:0, vy:0, life:10, maxLife:10, size:r*0.3, grow:r*0.12, color:'#fff', kind:'flash' });
        push({ x, y, vx:0, vy:0, life:18, maxLife:18, size:r*0.2, grow:r*0.16, thick:Math.max(3,r*0.06),
               color:'rgba(190,150,255,0.85)', kind:'ring' });
      }catch(e){}
    },

    // QUAKE: a brief gritty dust haze along the whole visible ground band + a
    // hard camera shake. Cheap; reducedMotion tones the shake down. Dust spawns
    // across the camera view so the whole screen feels it.
    quakeFx(){
      try{
        const cheap=lowQ(), red=reduced();
        const wl=S.waterLevel||C.WATER_LEVEL;
        const camX=(S.camera&&S.camera.x)||0;
        const viewW=C.VIEW_W||C.WORLD_W;
        const cols=debrisColors();
        const n=cheap?10:Math.round(22*qScale());
        for(let i=0;i<Math.min(n,30);i++){
          const x=camX+U.rand(0,viewW);
          let gy=(CA.Terrain&&CA.Terrain.heightAt)?CA.Terrain.heightAt(x):(wl-30);
          if(!(gy>0&&gy<C.WORLD_H)) gy=wl-30;
          push({ x, y:gy-U.rand(0,8), vx:U.rand(-1,1), vy:-U.rand(1,3),
                 life:U.rand(24,52), maxLife:52, size:U.rand(2,5), g:0.3,
                 color:U.pick(cols), kind:'dirt', rot:U.rand(0,7), spin:U.rand(-0.4,0.4) });
        }
        // QA P2: reducedMotion alatt NULLA rázás (a setting kontraktusa; a por-
        // partikelek így is átadják a földrengést) — eddig 14px így is rázott.
        if(S.camera && !red) S.camera.shake = Math.max(S.camera.shake||0, 28);
      }catch(e){}
    },

    // Small MUZZLE PUFF for when a weapon fires (self-contained, cheap). Other
    // modules can trigger it via CA.FX.muzzle(x,y,angle) or by emitting a
    // 'muzzle' event if wired elsewhere. angle = barrel direction (radians).
    muzzle(x,y,angle){
      const cheap=lowQ();
      const ang=(angle!=null)?angle:-Math.PI/2;
      if(!cheap){
        push({ x, y, vx:0, vy:0, life:6, maxLife:6, size:9, grow:1.4, color:'#fff', kind:'flash' });
      }
      const n=cheap?3:6;
      for(let i=0;i<n;i++){
        const a=ang+U.rand(-0.5,0.5), sp=U.rand(2,5);
        push({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:U.rand(7,14), maxLife:14,
               size:U.rand(1.2,2.4), color:U.pick(['#fff3b0','#ffd24a','#fff']), kind:'spark' });
      }
      // a wisp of smoke
      for(let i=0;i<(cheap?1:3);i++){
        const a=ang+U.rand(-0.6,0.6);
        push({ x, y, vx:Math.cos(a)*1.2, vy:Math.sin(a)*1.2-0.3, life:U.rand(20,40), maxLife:40,
               size:U.rand(3,6), grow:0.3, color:'rgba(120,115,110,0.4)', kind:'smoke' });
      }
    },

    // Soft LANDING DUST PUFF when something hits the ground (cheap, ground-hued).
    // Trigger via CA.FX.landDust(x,y) or spawnParticles({kind:'dirt',...}).
    landDust(x,y,strength){
      const s=U.clamp(strength!=null?strength:1,0.4,2.2);
      const n=Math.round((lowQ()?3:7)*s);
      for(let i=0;i<n;i++){
        const a=U.rand(-Math.PI*0.85,-Math.PI*0.15), sp=U.rand(0.6,2.4)*s;
        push({ x:x+U.rand(-6,6), y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp*0.5,
               life:U.rand(16,30), maxLife:30, size:U.rand(2,4.5)*s, g:0.12,
               color:U.pick(['rgba(150,135,110,0.5)','rgba(120,108,86,0.45)','rgba(170,158,130,0.4)']),
               kind:'dirt' });
      }
    },

    // RECOIL DUST — a small puff kicked OPPOSITE the fire direction (muzzle
    // back-blast) when a weapon fires. `angle` is the firing direction (radians);
    // the dust fans out toward angle+PI. Cheap, quality- & reducedMotion-aware,
    // hard-capped. Optional polish; never throws.
    recoilDust(x,y,angle){
      try{
        if(x==null || y==null) return;
        const cheap=lowQ();
        const red=reduced();
        const back=(angle!=null?angle:0)+Math.PI;     // opposite the shot
        let n=cheap?2:(red?2:4);
        for(let i=0;i<n;i++){
          const a=back+U.rand(-0.5,0.5), sp=U.rand(1,3);
          push({ x:x+U.rand(-3,3), y:y+U.rand(-3,3),
                 vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-0.4,
                 life:U.rand(14,26), maxLife:26, size:U.rand(3,6), grow:0.3,
                 color:U.pick(['rgba(150,140,125,0.4)','rgba(120,112,100,0.38)','rgba(170,160,145,0.32)']),
                 kind:'smoke' });
        }
      }catch(e){ /* cosmetics never throw */ }
    },

    // DUST PUFF — a low, soft kick of dust at a character's feet on jump-liftoff
    // and landing. Lighter & airier than landDust (a quick fade, low arc), with
    // an optional horizontal `dirBias` so liftoff dust fans out behind the unit.
    // Reduced-motion aware (halved, no extra ring), quality-capped. Never throws.
    //   x,y      = feet position (ground line)
    //   dirBias  = horizontal bias -1..1 (e.g. facing*0.6 on a directional hop)
    //   strength = 0..~1.5 overall punch (soft step ~0.5, hard land/jump ~1.0)
    dustPuff(x, y, dirBias, strength){
      try{
        const cheap=lowQ();
        const red=reduced();
        let s=U.clamp(strength!=null?strength:1, 0.3, 1.6);
        if(red) s*=0.5;                                  // gentler with reduced motion
        const bias=U.clamp(dirBias||0, -1, 1);
        let n=Math.round((cheap?3:7)*s);
        if(red) n=Math.min(n, 3);
        if(n<=0) return;
        for(let i=0;i<n;i++){
          // mostly-sideways, slightly-up puff; biased horizontally by dirBias
          const a=U.rand(-Math.PI*0.78, -Math.PI*0.22);
          const sp=U.rand(0.5,2.0)*s;
          const vx=Math.cos(a)*sp + bias*U.rand(0.6,1.6)*s;
          push({ x:x+U.rand(-5,5), y:y+U.rand(-1,2),
                 vx:vx, vy:Math.sin(a)*sp*0.45,
                 life:U.rand(14,26), maxLife:26, size:U.rand(2,4.2)*s, g:0.10,
                 color:U.pick(['rgba(168,150,120,0.45)','rgba(140,124,98,0.42)','rgba(186,170,140,0.36)']),
                 kind:'dirt' });
        }
        // a faint flat ground ring on the bigger puffs (skip when cheap/reduced)
        if(!cheap && !red && s>0.7){
          push({ x, y, vx:0, vy:0, life:14, maxLife:14, size:5*s, grow:2.4*s,
                 thick:Math.max(1,1.6*s), color:'rgba(200,188,160,0.35)', kind:'ring' });
        }
      }catch(e){ /* cosmetics never throw */ }
    },

    // KILL POP — a brief, tasteful screen-space punch when a unit dies: a small
    // additive flash at the death spot + a tiny camera shake. Fully reduced-motion
    // aware (no shake, much softer flash) and quality-capped. Wired off 'unitDied'
    // below; also callable directly. Never throws.
    killPop(x, y){
      try{
        const cheap=lowQ();
        const red=reduced();
        // small camera shake for impact — suppressed entirely under reduced motion
        if(!red && S.camera){ S.camera.shake = Math.min(14, (S.camera.shake||0) + (cheap?3:5)); }
        if(x==null || y==null) return;
        // quick bright pop at the death point (additive 'flash' particle, short-lived)
        const fa = red ? 0.5 : 1;
        push({ x, y, vx:0, vy:0, life:Math.round(9*fa)+3, maxLife:12,
               size: (cheap?10:16), grow:(cheap?1.0:1.6), color:'#fff', kind:'flash' });
        if(!cheap){
          push({ x, y, vx:0, vy:0, life:14, maxLife:14, size:8, grow:2.6,
                 thick:2, color:'rgba(255,235,200,0.7)', kind:'ring' });
        }
      }catch(e){ /* never throw from juice */ }
    },

    // #12 WATER SPLASH — a flat expanding ring on the surface + arcing droplets
    // + a tiny white foam crown. Cheap, water-hued; never throws. Also emits the
    // 'splash' SFX so it sounds wet. strength ~ blast scale (0.5..2.2).
    waterSplash(x, wl, strength){
      try{
        const _t=theme(); if(((S.theme||'')==='sky') || (_t&&_t.noWater)) return; // nincs viz -> nincs splash
        const s=U.clamp(strength!=null?strength:1, 0.4, 2.4);
        const cheap=lowQ();
        const red=reduced();
        // An actual flat ellipse rides the waterline, with small droplets above it.
        push({ x, y:wl, vx:0, vy:0, life:18, maxLife:18, size:6*s, grow:(red?1.2:3.4)*s,flat:0.22,
               thick:Math.max(1.5,2.5*s), color:'rgba(210,240,255,0.8)', kind:'ring' });
        if(!cheap && !red){
          push({ x, y:wl, vx:0, vy:0, life:24, maxLife:24, size:4*s, grow:2.6*s,flat:0.20,
                 thick:Math.max(1,1.6*s), color:'rgba(180,225,255,0.5)', kind:'ring' });
        }
        // arcing droplets — bluish water specks that fall back & bounce at wl
        const n=red?Math.min(3,Math.round(3*s)):Math.round((cheap?5:13)*s*(cheap?1:qScale()));
        for(let i=0;i<n;i++){
          const a=U.rand(-Math.PI*0.85,-Math.PI*0.15), sp=U.rand(2.5,7)*s*(red?0.35:1);
          push({ x:x+U.rand(-6*s,6*s), y:wl, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
                 life:U.rand(20,40), maxLife:40, size:U.rand(1.6,3.4)*s, g:0.34,
                 color:U.pick(['rgba(170,220,255,0.85)','rgba(210,240,255,0.8)','rgba(140,200,240,0.8)']),
                 kind:'water' });
        }
        // a low foam crown puff
        if(!cheap && !red){
          for(let i=0;i<Math.round(3*s);i++){
            push({ x:x+U.rand(-10*s,10*s), y:wl-U.rand(0,4), vx:U.rand(-0.8,0.8), vy:-U.rand(0.4,1.4)*s,
                   life:U.rand(20,36), maxLife:36, size:U.rand(4,8)*s, grow:0.25,
                   color:'rgba(235,250,255,0.45)', kind:'smoke' });
          }
        }
        // wet sound
        try{ CA.events && CA.events.emit && CA.events.emit('sfx','splash'); }catch(e){}
      }catch(e){}
    },

    // Quiet underwater trail for grenades and other sinking projectiles.
    // amount defaults to 3; batches and live bubbles are capped by quality.
    // wl is optional, and bubbles follow later changes to S.waterLevel.
    waterBubbles(x,y,amount,wl){
      if(!Number.isFinite(x)||!Number.isFinite(y)) return;
      const t=theme();
      if((S.theme||'')==='sky'||(t&&t.noWater)) return;
      const surface=Number.isFinite(wl)?wl:(S.waterLevel!=null?S.waterLevel:C.WATER_LEVEL);
      if(!Number.isFinite(surface)||y<=surface+2) return;
      const cheap=lowQ(), red=reduced();
      const requested=amount==null?3:amount;
      if(!Number.isFinite(requested)||requested<=0) return;
      const cap=red?12:(cheap?18:(medQ()?32:48));
      let live=0;
      for(let i=0;i<S.particles.length;i++){ if(S.particles[i].kind==='bubble') live++; }
      const n=Math.min(cap-live,red?1:(cheap?4:8),Math.ceil(requested*qScale()));
      for(let i=0;i<n;i++){
        const life=U.clamp(Math.ceil((y-surface)/0.8)+20,24,150);
        push({ x:x+U.rand(-5,5),y:y+U.rand(1,5),
               vx:U.rand(-0.12,0.12),vy:-U.rand(0.55,1.05)*(red?0.65:1),
               life,maxLife:life,size:U.rand(1.5,3.3),sway:U.rand(0,Math.PI*2),
               wl:surface,kind:'bubble' });
      }
    },

    // #34 CONFETTI — colorful rects that flutter down rotating. Public so the
    // victory screen (ui.js) can call it. Reduced (not skipped) on low quality.
    // x,y = burst origin; amount = particle count (defaults sensible).
    confetti(x,y,amount){
      try{
        const cheap=lowQ();
        let n=amount!=null?amount:(cheap?22:60);
        if(cheap) n=Math.max(6,Math.round(n*0.5));
        const cols=['#ff5d8f','#ffd23f','#3fd6ff','#7bffb0','#b07bff','#ff944d','#ff3f6e','#5fe1ff','#fff05f'];
        const ox=(x!=null)?x:((S.camera&&S.camera.x||0)+C.VIEW_W/2);
        const oy=(y!=null)?y:((S.camera&&S.camera.y||0)+80);
        for(let i=0;i<n;i++){
          const a=U.rand(-Math.PI*0.9,-Math.PI*0.1), sp=U.rand(2,9);
          push({ x:ox+U.rand(-30,30), y:oy+U.rand(-20,20),
                 vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-U.rand(1,4),
                 life:U.rand(70,140), maxLife:140,
                 size:U.rand(5,10), color:U.pick(cols),
                 kind:'confetti', rot:U.rand(0,7), spin:U.rand(-0.3,0.3),
                 sway:U.rand(0,7), drift:U.rand(-0.5,0.5) });
        }
      }catch(e){}
    },

    // FLOATING DAMAGE / HEAL / COMBO TEXT (public). ui.js calls this as
    //   CA.FX.damageText(x, y, text, { kind })   // alias: CA.fx.damageText
    // kind ∈ 'normal'|'crit'|'heal'|'combo'. Spawns a text particle that rises
    // ~34px over ~0.9s, pops in, then fades. Stored in S.particles (same array
    // as all FX) so it's updated/drawn every frame and cleared on new-game.
    // Guarded: never throws if x/y/text are missing.
    damageText(x, y, text, opts){
      try{
        if(x==null || y==null) return;
        if(text==null || text==='') return;
        opts=opts||{};
        const kind=opts.kind||'normal';
        // LOW-QUALITY cap: ignore new normal/heal/combo text past ~12 active so
        // weak phones stay smooth. Crits always show (important hits).
        if(lowQ() && kind!=='crit' && textCount()>=12) return;

        const cb=cbOn();
        let color, size, font, shake, txt=''+text, rise, glow=null;
        switch(kind){
          case 'crit':
            // CRIT must read clearly apart from COMBO (was both ~gold). White-hot
            // fill + an orange-gold GLOW halo (drawn in the render pass) — unmistakably
            // a big hit, and distinct from the flat-gold combo number.
            color='#ffffff';
            glow='#ff7a1a';
            size=22; font="bold 22px system-ui, -apple-system, sans-serif";
            shake=2.2; rise=40;
            break;
          case 'heal':
            // CVD-safe: green vs damage collapses under red-green deficiency, so
            // swap heal to Okabe-Ito blue when colorblind mode is on. Keep the
            // healthy green otherwise.
            color=cb?'#56b4e9':'#5dff8a'; size=16; font=TEXT_FONT; shake=0; rise=34;
            if(txt[0]!=='+' && txt[0]!=='-') txt='+'+txt;   // healing reads with a +
            break;
          case 'combo':
            color='#ffcf3f'; size=16; font=TEXT_FONT; shake=0.8; rise=34;   // flat gold
            break;
          case 'normal':
          default:
            // CVD-safe damage: shift plain white to high-contrast orange-yellow so
            // it never reads like (blue) heal; nudge the leading '−' so the sign
            // carries the meaning even without colour.
            color=cb?'#f0e442':'#ffffff'; size=16; font=TEXT_FONT; shake=0; rise=34;
            if(cb && txt[0]!=='+' && txt[0]!=='-' && /^[0-9]/.test(txt)) txt='−'+txt;
            break;
        }
        // lifetime in frames (~0.9s at 60fps). vy ramps the rise; it eases out
        // in update() so the total travel lands near `rise` px.
        const life=54;
        push({ x:x, y:y, vx:0, vy:-(rise/life)*2.0, life:life, maxLife:life,
               kind:'text', text:txt, color:color, size:size, font:font,
               glow:glow, shake:shake, scale:0.4, sx:0 });
      }catch(e){ /* never throw */ }
    },

    // Brief white HIT FLASH at a unit (optional helper). Decoupled from
    // entities: only reads unit.x/unit.y; no-ops safely otherwise.
    hitFlash(unit){
      try{
        if(!unit || unit.x==null || unit.y==null) return;
        if(lowQ()){
          push({ x:unit.x, y:(unit.y||0)-6, vx:0, vy:0, life:6, maxLife:6,
                 size:14, color:'#fff', kind:'flash' });
        } else {
          push({ x:unit.x, y:(unit.y||0)-6, vx:0, vy:0, life:9, maxLife:9,
                 size:18, grow:1.2, color:'#fff', kind:'flash' });
        }
      }catch(e){ /* never throw */ }
    },

    spawnParticles(o){
      o=o||{};
      let n=o.count||10;
      if(lowQ()) n=Math.max(1,Math.round(n*0.5));
      for(let i=0;i<n;i++){
        const a=o.angle!=null ? o.angle+U.rand(-(o.spread||Math.PI*2)/2,(o.spread||Math.PI*2)/2) : U.rand(0,Math.PI*2);
        const sp=U.rand(o.spdMin!=null?o.spdMin:1, o.spdMax!=null?o.spdMax:4);
        push({ x:o.x, y:o.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - (o.lift||0),
               life:o.life||30, maxLife:o.life||30, size:o.size||3,
               g:o.gravity!=null?o.gravity:0.18,
               color:o.color||'#fff', kind:o.kind||'generic' });
      }
    }
  };

  // ---- lower-case alias so callers can use CA.fx.damageText(...) (ui.js
  // expects this). Points at the SAME object as CA.FX; both stay in sync.
  if(!CA.fx) CA.fx=CA.FX;

  // ---- small color helpers (hex shade / rgba deepen) ----
  function shade(hex,amt){
    // amt: -1..1 (negative darkens). Accepts #rgb/#rrggbb; passthrough otherwise.
    if(typeof hex!=='string' || hex[0]!=='#') return hex;
    let h=hex.slice(1);
    if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    if(h.length!==6) return hex;
    let r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
    const f=(v)=>U.clamp(Math.round(amt<0 ? v*(1+amt) : v+(255-v)*amt),0,255);
    r=f(r); g=f(g); b=f(b);
    return 'rgb('+r+','+g+','+b+')';
  }
  function deepen(rgba){
    // darken an 'rgba(r,g,b,a)' string toward depth, bump alpha
    const m=/rgba?\(([^)]+)\)/.exec(rgba);
    if(!m) return rgba;
    const parts=m[1].split(',').map(s=>parseFloat(s));
    const r=Math.round((parts[0]||0)*0.45), g=Math.round((parts[1]||0)*0.5), b=Math.round((parts[2]||0)*0.6);
    const a=Math.min(1,(parts[3]!=null?parts[3]:1)+0.25);
    return 'rgba('+r+','+g+','+b+','+a.toFixed(2)+')';
  }

  /* ==========================================================================
   * AUDIO — synthesized WebAudio sound bank + procedural music. No files.
   * ========================================================================*/
  CA.Audio={
    muted:false,
    ctx:null,
    master:null,      // SFX bus
    musicGain:null,   // music bus
    _wired:false,
    _noiseBuf:null,
    _music:null,      // {timer, step} running loop
    _musicOn:false,
    _bg:null,         // HTMLAudioElement for real background music (menu/gameplay)
    _bgName:null,
    // ---- iOS volume fix: WebAudio routing for the HTMLAudio music/ambience ----
    // iOS Safari IGNORES HTMLMediaElement.volume entirely (any non-zero value
    // plays at FULL). The fix is to pipe the element through a MediaElementSource
    // -> dedicated GainNode -> ctx.destination; iOS DOES honour GainNode.gain.
    // createMediaElementSource can be called only ONCE per element, so we guard
    // with these flags/nodes and create them lazily once the ctx exists.
    _bgSrcNode:null,  // MediaElementAudioSourceNode for _bg (once-only)
    _bgGain:null,     // dedicated GainNode for _bg (iOS-respected volume)
    _ambSrcNode:null, // MediaElementAudioSourceNode for _amb (once-only)
    _ambGain:null,    // dedicated GainNode for _amb
    _visWired:false,  // visibilitychange handler attached?

    /* Lazily route an HTMLAudio element through the WebAudio graph so its volume
     * is actually respected on iOS. Creates the MediaElementSource + GainNode
     * exactly once (createMediaElementSource throws if called twice on the same
     * element), connects source -> gain -> ctx.destination, and returns the
     * GainNode (or null on failure / when WebAudio is unavailable). On failure
     * the caller falls back to the plain HTMLAudio .volume behaviour.
     *   el       : the HTMLAudioElement (_bg / _amb)
     *   srcFlag  : '_bgSrcNode' | '_ambSrcNode'
     *   gainFlag : '_bgGain'    | '_ambGain'   */
    _routeMediaEl:function(el, srcFlag, gainFlag){
      if(this[gainFlag]) return this[gainFlag];      // already routed
      if(!el || !this.ctx) return null;               // need ctx + element first
      // iOS TRAP: routing an element through createMediaElementSource while the
      // AudioContext is still 'suspended' (resume() is async and hasn't resolved
      // yet) permanently silences that element. Defer routing until the ctx is
      // actually 'running'. Until then the caller uses the plain element .volume,
      // so the element still plays (audibly, if unrouted) and we route it later
      // once the context is live — no permanent silence. (The recurring
      // "menu music missing on mobile" regression.)
      if(this.ctx.state!=='running') return null;
      try{
        var g=this.ctx.createGain();
        var src=this.ctx.createMediaElementSource(el); // ONCE per element
        src.connect(g);
        g.connect(this.ctx.destination);
        this[srcFlag]=src;
        this[gainFlag]=g;
        return g;
      }catch(e){
        // already-connected / ctx missing / unsupported -> fall back to .volume
        return null;
      }
    },

    /* ---- real background MUSIC (file-based, streamed, looped, quiet) ----
     * name: 'menu' -> menu theme, 'play' -> calm gameplay loop, null -> stop.
     * Respects mute + musicVol; autoplay rejections are retried each frame once
     * the user has interacted. Never throws. */
    _bgWantPlay:false,   // intent: should _bg be sounding right now? (drives retry)
    bgMusic:function(name){
      try{
        // QA P3: a vol-t az _bgName frissítése UTÁN számoljuk — különben a
        // menü→játék váltás első frame-jén a play-track a 0.9-es menü-ducköt
        // kapta (1 frame-es hangerő-blip).
        if(!name || this.muted){ this._bgWantPlay=false; if(this._bg) this._bg.pause(); if(!name) this._bgName=null; return; }
        // preload='none': a menü-zene (~5MB) ne versenyezzen a Poki "initial
        // download" méréssel — autoplay-gate miatt úgyis csak gesztusra indul,
        // a play() ott tölti be (backlog #1 initial-download diéta).
        if(!this._bg){ this._bg=new Audio(); this._bg.loop=true; this._bg.preload='none'; }
        // iOS Safari/WebKit CANNOT decode OGG → the gameplay track (play.ogg) was
        // dead-silent on iPhone. Detect OGG support once; if absent, use the
        // play.mp3 twin (universal) for a distinct in-match track on iOS, instead
        // of falling back to the menu theme.
        if(this._canOgg==null){ try{ var _a=document.createElement('audio');
          this._canOgg=!!(_a.canPlayType && _a.canPlayType('audio/ogg; codecs="vorbis"')); }catch(e){ this._canOgg=false; } }
        var src = (name==='menu') ? 'assets/music/menu.mp3'
                : (this._canOgg ? 'assets/music/play.ogg' : 'assets/music/play.mp3');
        if(this._bgName!==name){ this._bgName=name; this._bg.src=src; }
        var vol=this._bgVol();
        // iOS Safari IGNORES HTMLAudio.volume, so volume=0 still plays at full —
        // the REAL mute is to PAUSE. Pause whenever effective volume is ~0.
        if(vol<=0.001){ this._bgWantPlay=false; if(this._bg) this._bg.pause(); return; }
        this._bgWantPlay=true;
        // Route through WebAudio (gain node) so iOS honours partial volume. Routing
        // is DEFERRED until the ctx is 'running' (see _routeMediaEl) to avoid the
        // iOS suspended-routing silence trap; until then we use plain .volume.
        var hadGain=!!this._bgGain;
        var g=this._routeMediaEl(this._bg,'_bgSrcNode','_bgGain');
        if(g){ try{ g.gain.value=vol; }catch(e){} }
        // If routing was JUST established (the stream had been running unrouted, or
        // a poisoned play resolved paused===false while suspended), force a flush
        // so the now-routed graph actually outputs: pause then re-play.
        if(g && !hadGain && !this._bg.paused){ try{ this._bg.pause(); }catch(e){} }
        this._bg.volume = vol;   // (desktop honours this; iOS uses pause-at-zero above + gain)
        // Attempt play whenever the element is paused OR not actually advancing.
        // On iOS a play() kicked off while the ctx was suspended can resolve with
        // paused===false yet produce no sound; a re-kick once the ctx is running
        // recovers it. _kickIfStalled() also re-attempts on the resume callback.
        // THROTTLE pre-gesture: _syncMusic calls this every frame, and each
        // play() before the autoplay unlock spawns a rejected Promise (alloc +
        // console violation spam at 60fps). Retry at most ~1x/sec; the gesture
        // path (_kickIfStalled) still starts it instantly.
        if(this._bg.paused){
          var _nowT=Date.now();
          if(!this._playRetryT || _nowT-this._playRetryT>900){
            this._playRetryT=_nowT;
            var p=this._bg.play(); if(p&&p.catch) p.catch(function(){});
          }
        }
      }catch(e){}
    },
    /* Re-attempt a play() for any track that SHOULD be sounding but whose element
     * is paused (or whose routing was just established now that the ctx is live).
     * Called right after the ctx transitions to 'running' (resume callback) so the
     * very-first iOS gesture reliably starts the menu music even if the initial
     * play()/routing happened while the ctx was still suspended. Never throws. */
    _kickIfStalled:function(){
      try{
        if(this.muted) return;
        if(this._bgWantPlay && this._bg && this._bgVol()>0.001){
          // (re)route now that the ctx may be running, then ensure it plays
          var g=this._routeMediaEl(this._bg,'_bgSrcNode','_bgGain');
          if(g){ try{ g.gain.value=this._bgVol(); }catch(e){} }
          if(this._bg.paused){ var p=this._bg.play(); if(p&&p.catch) p.catch(function(){}); }
        }
        if(this._ambWantPlay && this._amb && this._ambVol()>0.001){
          var ga=this._routeMediaEl(this._amb,'_ambSrcNode','_ambGain');
          if(ga){ try{ ga.gain.value=this._ambVol(); }catch(e){} }
          if(this._amb.paused){ var pa=this._amb.play(); if(pa&&pa.catch) pa.catch(function(){}); }
        }
      }catch(e){}
    },
    // effective music volume (0..1), 0 when muted.
    // The IN-MATCH track ducks to 0.35 so it sits QUIETLY under gameplay SFX, but
    // the MENU/intro theme plays ALONE (no SFX bed) — ducking it to 0.35 made it
    // barely audible (Jani: "van csak nagyon halk"), so the menu track keeps a
    // much higher level.
    _bgVol:function(){
      var v=(CA.settings && CA.settings.musicVol!=null) ? CA.settings.musicVol : 0.3;
      if(this.muted) return 0;
      var duck=(this._bgName==='menu') ? 0.9 : 0.35;
      return Math.max(0, Math.min(1, v*duck));
    },
    // NOTE: named _applyBgVol (NOT _applyMusicVol) — there's a second
    // _applyMusicVol later in this object for the procedural bus.
    _applyBgVol:function(){
      var v=this._bgVol();
      if(this._bgGain){ try{ this._bgGain.gain.value=v; }catch(e){} }
      if(this._bg) this._bg.volume=v;
    },

    /* ---- biome AMBIENCE loop (assets/audio/<name>.ogg) ----
     * Plays INSTEAD of the gameplay music when the biome has an ambience file
     * (user request: "ha megy a mező háttérhang, a zene ne menjen"). If the file
     * is missing/unloadable we mark it bad and the caller falls back to bgMusic.
     * Returns true only while a real ambience track is (going to be) playing. */
    _amb:null, _ambName:null, _ambBad:{}, _ambWantPlay:false,
    ambient:function(name){
      try{
        var vol=this._ambVol();
        if(!name || this.muted || vol<=0.001){ this._ambWantPlay=false; if(this._amb) this._amb.pause(); if(!name) this._ambName=null; return false; }
        if(this._ambBad[name]) return false;                 // known-missing -> let music play
        if(!this._amb){ this._amb=new Audio(); this._amb.loop=true; this._amb.preload='auto';
          var self=this; this._amb.addEventListener('error',function(){ if(self._ambLoading) self._ambBad[self._ambLoading]=true; }); }
        var src=this._samplePath+name+'.ogg';
        // capture WHICH name this load is for — blacklisting by _ambName at
        // error time could brand a newly-requested (valid) track as bad if the
        // theme changed during the async load.
        if(this._ambName!==name){ this._ambName=name; this._ambLoading=name; this._amb.src=src; }
        this._ambWantPlay=true;
        // Route through WebAudio (gain node) so iOS honours partial volume.
        // Routing deferred until ctx 'running' (iOS silence trap); uses .volume meanwhile.
        var hadGain=!!this._ambGain;
        var g=this._routeMediaEl(this._amb,'_ambSrcNode','_ambGain');
        if(g){ try{ g.gain.value=vol; }catch(e){} }
        if(g && !hadGain && !this._amb.paused){ try{ this._amb.pause(); }catch(e){} }
        this._amb.volume = vol;
        // THROTTLE pre-gesture (a _bg ~900ms-es retry-fixének tükre, QA P2):
        // autoplay-unlock előtt a per-frame play() 60fps-sel szórta az elutasított
        // promise-okat (alloc + console-spam). A gesture-út (_kickIfStalled)
        // továbbra is azonnal indít.
        if(this._amb.paused){
          var _nowA=Date.now();
          if(!this._ambRetryT || _nowA-this._ambRetryT>900){
            this._ambRetryT=_nowA;
            var p=this._amb.play(); if(p&&p.catch) p.catch(function(){});
          }
        }
        return !this._ambBad[name];
      }catch(e){ return false; }
    },
    _ambVol:function(){
      var v=(CA.settings && CA.settings.musicVol!=null) ? CA.settings.musicVol : 0.3;
      // ambience sits gently under gameplay. reducedMotion players want a calmer
      // mix, so we drop the loop a touch further for them (still audible, softer).
      var scale=0.5;
      try{ if(CA.settings && CA.settings.reducedMotion) scale=0.35; }catch(e){}
      return this.muted ? 0 : Math.max(0, Math.min(1, v*scale));
    },
    _applyAmbVol:function(){
      var vol=this._ambVol();   // muted=>0, else clamp(musicVol*0.5)
      if(this._ambGain){ try{ this._ambGain.gain.value=vol; }catch(e){} }
      if(this._amb) this._amb.volume = vol;   // a touch fuller than music
    },

    /* ---- real sample bank (user-supplied SFX, augments the synth) ---- *
     * Event-name -> {file, gain}. When a mapping exists we play the decoded
     * sample (WAV or OGG — _loadSample is format-agnostic, decodeAudioData
     * sniffs the container) instead of the synth; if decode/fetch fails we
     * fall back to synth. Kenney UI/impact OGGs REPLACE the synth for
     * click/select/boom/boom_big; the synth stays as the failure fallback. */
    _samplePath:'assets/audio/',
    _sampleMap:{
      fire:   { file:'attack.wav',      gain:0.7 },
      hurt:   { file:'hit.wav',         gain:0.7 },
      die:    { file:'hit.wav',         gain:0.5 },   // reuse hit, softer
      jump:   { file:'jump.wav',        gain:0.6 },
      land:   { file:'landing.wav',     gain:0.65 },
      splash: { file:'step_water.wav',  gain:0.7 },
      teleport:{file:'teleport.wav',    gain:0.7 },
      // ---- Kenney OGG bank (replace synth for these events) ----
      click:  { file:'ui_click.ogg',    gain:0.6 },   // menu/button clicks
      select: { file:'ui_select.ogg',   gain:0.6 },   // weapon/option select
      boom:   { file:'impact_heavy.ogg',gain:0.7 },   // normal explosion
      boom_big:{file:'impact_metal.ogg',gain:0.85 },  // big explosion (+ layered impact_heavy, see _playSample)
      punch:  { file:'impact_punch.ogg',gain:0.7 },   // melee/punch (available; emit 'punch' to use)

      /* ---- NEW event SFX bank (files arrive later as assets/audio/<file>) ----
       * Each maps to a not-yet-present file: _playSample marks the file _failed
       * on fetch error and silently falls back to the synth case (or silence),
       * so these entries are SAFE before the files land — they go live the moment
       * the matching file is dropped into assets/audio/. */
      // -- abilities / weapons (emitted from weapons.js) --
      cast_fire:    { file:'cast_fire.ogg',     gain:0.7 },  // fireball / mage fire
      cast_frost:   { file:'cast_frost.ogg',    gain:0.7 },  // frost / freeze
      cast_lightning:{file:'cast_lightning.ogg',gain:0.7 },  // chain lightning
      cast_summon:  { file:'cast_summon.ogg',   gain:0.7 },  // necro summons
      shield_up:    { file:'shield_up.ogg',     gain:0.7 },  // shield_wall / buff_aura
      heal:         { file:'heal.ogg',          gain:0.7 },  // heal abilities
      // build: REMOVED — build.ogg is a long/looping 8MB clip that sounded
      // "infinite". Fall back to the short synth woody-tap ('build' case in the
      // synth) instead. (Jani: a falépítés SFX-e végtelen marad.)
      charged_shot: { file:'charged_shot.ogg',  gain:0.75 }, // sniper / charged_shot
      jetpack:      { file:'jetpack.ogg',       gain:0.6 },  // jetpack activate (best-effort one-shot)
      blowtorch:    { file:'blowtorch.ogg',     gain:0.6 },  // blowtorch on use
      mine_arm:     { file:'mine_arm.ogg',      gain:0.6 },  // mine / trap armed
      pickup:       { file:'pickup.ogg',        gain:0.55 }, // crate pickup
      // -- character (emitted from entities.js) --
      cheer:        { file:'cheer.ogg',         gain:0.7 },  // winning team celebrate
      taunt:        { file:'taunt.ogg',         gain:0.6 },  // on landing a hit / taunt ability
      voice:        { file:'voice.ogg',         gain:0.45 }, // occasional idle mumble (RARE)
      confused:     { file:'confused.ogg',      gain:0.55 }, // confused (optional)
      // -- meta / UI (emitted from meta.js / core.js) --
      coin:         { file:'coin.ogg',          gain:0.5 },  // addCoins
      chest:        { file:'chest.ogg',         gain:0.6 },  // chest open
      levelup:      { file:'levelup.ogg',       gain:0.65 }, // level up
      achievement:  { file:'achievement.ogg',   gain:0.65 }, // achievement unlock
      win:          { file:'win.ogg',           gain:0.7 },  // gameOver, human won
      lose:         { file:'lose.ogg',          gain:0.7 }   // gameOver, human lost
      // NOTE: 'select','die','jump','teleport' already mapped above; new files
      // (select.ogg/die.ogg) would replace ui_select/hit — leaving existing maps
      // intact so current sounds keep working until/unless those files arrive.
    },
    // extra samples to pre-warm but with no direct event mapping yet.
    _extraSamples:['ui_hover.ogg','impact_heavy.ogg'],
    _buffers:{},      // file -> AudioBuffer (decoded)
    _loading:{},      // file -> true while a fetch/decode is in flight
    _failed:{},       // file -> true if decode failed (use synth fallback)

    // Kick off a lazy fetch+decode of a WAV. Caches the AudioBuffer by file.
    _loadSample(file){
      if(!this.ctx) return;
      if(this._buffers[file]||this._loading[file]||this._failed[file]) return;
      this._loading[file]=true;
      const self=this, url=this._samplePath+file;
      try{
        fetch(url).then(r=>{ if(!r.ok) throw new Error('http '+r.status); return r.arrayBuffer(); })
          .then(ab=>new Promise((res,rej)=>{
            // support both Promise & callback decodeAudioData signatures
            const p=self.ctx.decodeAudioData(ab, res, rej);
            if(p&&p.then) p.then(res,rej);
          }))
          .then(buf=>{ self._buffers[file]=buf; delete self._loading[file]; })
          .catch(()=>{ self._failed[file]=true; delete self._loading[file]; });
      }catch(e){ this._failed[file]=true; delete this._loading[file]; }
    },

    // Try to play a mapped WAV for an event. Returns true if it handled the
    // event (played or kicked off a load), false to let the synth take over.
    _playSample(name){
      const map=this._sampleMap[name];
      if(!map||!this.ctx) return false;
      const file=map.file;
      if(this._failed[file]) return false;            // -> synth fallback
      const buf=this._buffers[file];
      if(!buf){ this._loadSample(file); return false; } // not ready yet -> synth this time
      const vol=this._sfxVol()*(map.gain!=null?map.gain:0.7);
      if(vol<=0.0002) return true;                    // muted/0 -> handled (silent)
      try{
        const ctx=this.ctx, t=ctx.currentTime;
        const src=ctx.createBufferSource(); src.buffer=buf;
        const g=ctx.createGain(); g.gain.setValueAtTime(vol,t);
        src.connect(g); g.connect(this.master);
        src.start(t);
        // BIG explosion: layer a deeper impact_heavy thump under the metallic
        // crack so it reads bigger. Skipped silently if not decoded yet.
        if(name==='boom_big'){
          const lb=this._buffers['impact_heavy.ogg'];
          if(lb){
            const ls=ctx.createBufferSource(); ls.buffer=lb;
            const lg=ctx.createGain(); lg.gain.setValueAtTime(this._sfxVol()*0.55,t);
            ls.connect(lg); lg.connect(this.master);
            ls.start(t);
          } else { this._loadSample('impact_heavy.ogg'); }
        }
      }catch(e){ return false; }
      return true;
    },

    // Soft, throttled walking footstep (called from CA.FX.update). Uses the
    // step_grass WAV at low gain; silently no-ops if not loaded/decoded.
    _footstep(){
      if(!this.ctx) return;
      const file='step_grass.wav';
      const buf=this._buffers[file];
      if(!buf){ this._loadSample(file); return; }
      const vol=this._sfxVol()*0.35;   // deliberately subtle
      if(vol<=0.0002) return;
      try{
        const ctx=this.ctx, t=ctx.currentTime;
        const src=ctx.createBufferSource(); src.buffer=buf;
        const g=ctx.createGain(); g.gain.setValueAtTime(vol,t);
        src.connect(g); g.connect(this.master);
        src.start(t);
      }catch(e){}
    },

    /* ---- CHARGE / "ERŐ" power build-up audio --------------------------------
     * The aim power-bar (S.power 0..1, filled while S.charging) had NO sound. We
     * add a soft RISING tone that tracks the charge level while held, then a short
     * release WHOOSH when it lets go (driven from CA.FX.update polling S.charging —
     * no other file needs to emit anything). All synth, cheap (one osc + one gain),
     * fully torn down on release. iOS-safe: rides the shared ctx; no-op if muted /
     * vol 0 / ctx missing. Never throws. */
    _chargeOsc:null, _chargeGain:null, _chargeFilt:null,
    chargeStart:function(){
      try{
        if(!this.ctx || this._chargeOsc) return;       // already running / no ctx
        if(this._sfxVol()<=0.0002) return;             // muted / silent -> skip
        const ctx=this.ctx, t=ctx.currentTime;
        const o=ctx.createOscillator(), g=ctx.createGain(), f=ctx.createBiquadFilter();
        o.type='sawtooth';
        o.frequency.setValueAtTime(140, t);            // low start; rises via update
        f.type='lowpass';
        f.frequency.setValueAtTime(600, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002,0.10*this._sfxVol()), t+0.06);
        o.connect(f); f.connect(g); g.connect(this.master);
        o.start(t);
        this._chargeOsc=o; this._chargeGain=g; this._chargeFilt=f;
      }catch(e){ this._chargeOsc=this._chargeGain=this._chargeFilt=null; }
    },
    // update the held charge tone toward power p (0..1): pitch + brightness + a
    // gentle volume swell. Cheap; called per frame from CA.FX.update while charging.
    chargeUpdate:function(p){
      try{
        if(!this.ctx || !this._chargeOsc) return;
        p=Math.max(0,Math.min(1,p||0));
        const ctx=this.ctx, t=ctx.currentTime;
        const sv=this._sfxVol();
        if(sv<=0.0002){ this.chargeStop(false); return; }   // muted mid-charge -> kill
        const freq=140 + p*p*620;                      // 140..760 Hz, eases up
        const cut =500 + p*2200;                       // open the filter as it builds
        const vol =Math.max(0.0002,(0.06+0.10*p)*sv);  // swell with power
        try{ this._chargeOsc.frequency.setTargetAtTime(freq, t, 0.04); }catch(e){}
        try{ this._chargeFilt.frequency.setTargetAtTime(cut, t, 0.05); }catch(e){}
        try{ this._chargeGain.gain.setTargetAtTime(vol, t, 0.05); }catch(e){}
      }catch(e){}
    },
    // stop the held tone. fired=true => the shot actually launched (a release
    // whoosh is added); false => a cancel (just fade out, no whoosh).
    chargeStop:function(fired){
      try{
        const o=this._chargeOsc, g=this._chargeGain;
        this._chargeOsc=this._chargeGain=this._chargeFilt=null;
        if(o && g && this.ctx){
          const ctx=this.ctx, t=ctx.currentTime;
          try{ g.gain.cancelScheduledValues(t); }catch(e){}
          try{ g.gain.setTargetAtTime(0.0001, t, 0.03); }catch(e){}
          try{ o.stop(t+0.12); }catch(e){}
        }
        // release WHOOSH: quick falling band-noise so a real shot has a punchy
        // "release". Only on an actual fire, and only if audible.
        if(fired && this.ctx && this._sfxVol()>0.0002){
          this._noise({filter:'bandpass', cutoff:1400, cutoff1:300, dur:0.18, vol:0.3, atk:0.004});
        }
      }catch(e){ this._chargeOsc=this._chargeGain=this._chargeFilt=null; }
    },

    /* ---- iOS-safe AUDIO UNLOCK (called from the first user gesture) ----
     * The recurring "no menu music on mobile" bug: iOS Safari starts the
     * AudioContext 'suspended' and refuses to play media unless BOTH ctx.resume()
     * and the element's .play() are kicked off from inside a user-gesture call
     * stack. The old code only fired ctx.resume() on the gesture and left the very
     * first bgMusic().play() to the next requestAnimationFrame (_syncMusic) — that
     * deferred call is NOT a gesture, so iOS silently dropped it and, because the
     * element was then "playing" (paused===false after a rejected promise was
     * swallowed), nothing ever retried. unlock() fixes this by:
     *   1) resuming the ctx now (in the gesture), and
     *   2) starting the track that _syncMusic would want THIS frame, synchronously.
     * It also re-asserts after the async resume resolves (covers the case where
     * resume() finishes a tick later). Idempotent, never throws, respects mute/vol.
     * Does NOT reintroduce any settings.music gate — music plays unless muted or
     * volume is 0. */
    unlock:function(){
      try{
        if(!this.ctx) return;
        var self=this;
        // 1) resume in-gesture; on resolve, re-assert the right track (resume can
        //    complete a tick after the gesture, after _syncMusic already ran).
        if(this.ctx.state==='suspended' && this.ctx.resume){
          var rp=this.ctx.resume();
          // On resume: pick the right track (_kickCurrent), THEN re-route+re-play
          // any element that was started/poisoned while the ctx was still
          // suspended (_kickIfStalled). This is the recovery for the iOS case
          // where the first play() resolved silently (paused===false) before the
          // ctx was running. setTimeout(0) as a belt-and-braces second pass in
          // case 'running' lands a microtask after the promise resolves.
          if(rp&&rp.then) rp.then(function(){ try{ self._kickCurrent(); self._kickIfStalled(); setTimeout(function(){ try{ self._kickIfStalled(); }catch(e){} },0); }catch(e){} },function(){});
        }
        // 2) start the track that should play right now, inside this gesture so iOS
        //    accepts the very first .play(). _syncMusic() owns ongoing start/stop;
        //    this just guarantees the FIRST start happens on a gesture.
        this._kickCurrent();
      }catch(e){ /* never throw */ }
    },

    /* Start/resume the bgMusic or ambience that the current game mode wants, right
     * now. Mirrors CA.FX._syncMusic's selection but is safe to call from a gesture
     * or a resume callback. No double-start: bgMusic/ambient only call .play() when
     * the element is paused, and _bgName/_ambName guard against re-setting src. */
    _kickCurrent:function(){
      try{
        var want=null, amb=null;
        if(CA.GameState && CA.state){
          if(CA.state.mode===CA.GameState.MENU) want='menu';
          else if(CA.state.mode===CA.GameState.PLAYING){
            want='play';
            amb=(typeof AMB_BY_THEME!=='undefined') ? (AMB_BY_THEME[(CA.state.theme)||'grass']||null) : null;
          }
        }
        if(amb && this.ambient && this.ambient(amb)){
          if(this.bgMusic) this.bgMusic(null);     // ambience wins -> music off
        } else {
          if(amb && this.ambient) this.ambient(null);
          if(want && this.bgMusic) this.bgMusic(want);
        }
      }catch(e){ /* never throw */ }
    },

    init(){
      if(!this._wired){ CA.events.on('sfx', n=>this.play(n)); this._wired=true; }
      try{
        if(!this.ctx){
          const AC=window.AudioContext||window.webkitAudioContext;
          if(!AC) return;
          this.ctx=new AC();
          this.master=this.ctx.createGain();
          this.master.gain.value=0.35;
          // Master-bus LIMITER/COMPRESSOR: cluster/airstrike chains stack several
          // identical booms in one frame and clip hard (esp. on phone speakers).
          // Route master -> compressor -> destination so peaks are tamed instead
          // of summing into distortion. Falls back to a direct connect if the node
          // is unavailable.
          try{
            if(this.ctx.createDynamicsCompressor){
              const comp=this.ctx.createDynamicsCompressor();
              comp.threshold.value=-8;
              comp.ratio.value=12;
              comp.attack.value=0.003;
              comp.release.value=0.12;
              this.master.connect(comp);
              comp.connect(this.ctx.destination);
              this._comp=comp;
            } else {
              this.master.connect(this.ctx.destination);
            }
          }catch(e){
            try{ this.master.connect(this.ctx.destination); }catch(e2){}
          }
          this.musicGain=this.ctx.createGain();
          this.musicGain.gain.value=0;
          this.musicGain.connect(this.ctx.destination);
          this._noiseBuf=this._makeNoise();
          // STAGGERED warm-load of the user samples (perf: the old loop fetched
          // ALL ~34 files in one burst at the first gesture = ~11.5MB instantly,
          // brutal on portal mobile). Now: one file every ~350ms — everything is
          // warm within ~12s, and any sample needed sooner is fetched on demand
          // by _playSample's lazy path (with the synth fallback for that play).
          try{
            const _q=[];
            for(const k in this._sampleMap){ _q.push(this._sampleMap[k].file); }
            _q.push('step_grass.wav');                       // footsteps (not event-mapped)
            for(const f of this._extraSamples){ _q.push(f); }
            const _self=this;
            (function _drain(){
              if(!_q.length) return;
              try{ _self._loadSample(_q.shift()); }catch(e){}
              setTimeout(_drain, 350);
            })();
          }catch(e){}
        }
        // Resume the context + (re)start the track that SHOULD be playing right
        // now, all inside this user-gesture call stack (init() is called from the
        // first pointerdown via ui.unlockAudio). iOS Safari only honours
        // ctx.resume() + media .play() that begin during a gesture — deferring the
        // first start to the rAF loop (the old behaviour) left the menu silent on
        // mobile. unlock() is idempotent so calling it on every gesture is safe.
        this.unlock();
        // Pause music/ambience when the tab/app is backgrounded (a background tab
        // used to keep the music playing). Resume on return if music should play.
        if(!this._visWired && typeof document!=='undefined' && document.addEventListener){
          var self=this;
          document.addEventListener('visibilitychange', function(){
            try{
              if(document.hidden){
                if(self._bg) self._bg.pause();
                if(self._amb) self._amb.pause();
                if(self.ctx && self.ctx.suspend) self.ctx.suspend();
              } else {
                if(self.ctx && self.ctx.state==='suspended' && self.ctx.resume){
                  var rp=self.ctx.resume();
                  // re-route+re-play once running (covers elements created/poisoned
                  // while the ctx was suspended in the background)
                  if(rp&&rp.then) rp.then(function(){ try{ self._kickIfStalled(); }catch(e){} },function(){});
                }
                // Resume only the track that should currently play (skip if muted
                // / vol 0); _syncMusic() re-asserts the right one next frame, but
                // un-pause the live element now for an instant resume.
                if(self._bg && self._bgName && !self.muted && self._bgVol()>0.001 && self._bg.paused){
                  var pb=self._bg.play(); if(pb&&pb.catch) pb.catch(function(){});
                }
                if(self._amb && self._ambName && !self.muted && self._ambVol()>0.001 && self._amb.paused){
                  var pa=self._amb.play(); if(pa&&pa.catch) pa.catch(function(){});
                }
              }
            }catch(e){}
          });
          this._visWired=true;
        }
        // if music was requested before unlock, (re)apply volume now
        this._applyMusicVol();
        // #36 NO AUTOPLAY: never start music here. _syncMusic() (called every
        // frame from CA.FX.update) starts it only when CA.settings.music===true
        // AND we're in PLAYING mode. Menu stays silent unless the player opts in
        // and a match is running.
      }catch(e){ /* audio not available */ }
    },

    _applyMusicVol(){
      if(!this.musicGain||!this.ctx) return;
      const muted=(CA.settings&&CA.settings.muted)||this.muted;
      const mv=(CA.settings&&CA.settings.musicVol!=null)?CA.settings.musicVol:0.3;
      // #36 tension lifts the bus a touch (max +30%) for urgency.
      const tension=U.clamp(this._tension!=null?this._tension:0,0,1);
      const target=(this._musicOn && !muted) ? mv*0.5*(1+0.3*tension) : 0;
      try{ this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.3); }catch(e){}
    },

    _sfxVol(){
      const muted=(CA.settings&&CA.settings.muted)||this.muted;
      if(muted) return 0;
      return (CA.settings&&CA.settings.sfxVol!=null)?CA.settings.sfxVol:0.3;
    },

    _makeNoise(){
      const ctx=this.ctx, len=Math.floor(ctx.sampleRate*0.5);
      const buf=ctx.createBuffer(1,len,ctx.sampleRate);
      const d=buf.getChannelData(0);
      for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
      return buf;
    },

    _now(){ return this.ctx.currentTime; },

    _tone(opts){
      const ctx=this.ctx, t=this._now()+(opts.delay||0);
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type=opts.type||'sine';
      o.frequency.setValueAtTime(opts.f0, t);
      if(opts.f1!=null) o.frequency.exponentialRampToValueAtTime(Math.max(1,opts.f1), t+(opts.dur||0.2));
      const vol=(opts.vol!=null?opts.vol:0.5)*this._sfxVol();
      if(vol<=0.0002) return;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t+(opts.atk||0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t+(opts.dur||0.2));
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t+(opts.dur||0.2)+0.02);
    },

    _noise(opts){
      const ctx=this.ctx, t=this._now()+(opts.delay||0);
      const src=ctx.createBufferSource(); src.buffer=this._noiseBuf;
      const g=ctx.createGain();
      const filt=ctx.createBiquadFilter();
      filt.type=opts.filter||'lowpass';
      filt.frequency.setValueAtTime(opts.cutoff||1200, t);
      if(opts.cutoff1!=null) filt.frequency.exponentialRampToValueAtTime(Math.max(60,opts.cutoff1), t+(opts.dur||0.3));
      const vol=(opts.vol!=null?opts.vol:0.5)*this._sfxVol();
      if(vol<=0.0002) return;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t+(opts.atk||0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t+(opts.dur||0.3));
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start(t); src.stop(t+(opts.dur||0.3)+0.02);
    },

    play(name){
      const muted=(CA.settings&&CA.settings.muted)||this.muted;
      if(muted) return;
      if(!this.ctx){ return; }
      // SFX throttle: a cluster/airstrike fires many identical sounds in one frame
      // which sum into clipping. If this exact `name` already played < ~40ms ago,
      // skip it — the compressor handles the rest. Keyed per-name so different
      // sounds still layer freely.
      try{
        const nowMs=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
        if(!this._lastPlay) this._lastPlay={};
        const prev=this._lastPlay[name];
        if(prev!=null && (nowMs-prev)<40) return;
        this._lastPlay[name]=nowMs;
      }catch(e){}
      try{ if(this.ctx.state==='suspended') this.ctx.resume(); }catch(e){}
      // Prefer the real WAV sample if this event maps to one and it's loaded.
      // Returns true when handled; false falls through to the synth fallback.
      if(this._playSample(name)) return;
      try{
      switch(name){
        case 'fire':
          this._tone({type:'sawtooth', f0:520, f1:120, dur:0.18, vol:0.4});
          this._noise({filter:'highpass', cutoff:900, cutoff1:300, dur:0.16, vol:0.35});
          break;
        case 'boom':
          this._tone({type:'sine', f0:180, f1:40, dur:0.4, vol:0.6});
          this._noise({filter:'lowpass', cutoff:1400, cutoff1:120, dur:0.45, vol:0.55});
          break;
        case 'boom_big':
          this._tone({type:'sine', f0:120, f1:28, dur:0.7, vol:0.75});
          this._tone({type:'triangle', f0:70, f1:24, dur:0.8, vol:0.5});
          this._noise({filter:'lowpass', cutoff:1800, cutoff1:90, dur:0.8, vol:0.7});
          // beefier: a deep SUB thump layered under the impact so it reads bigger.
          // Slower, lower sine that swells in a touch (longer attack) + lingers.
          this._tone({type:'sine', f0:46, f1:20, dur:1.0, vol:0.6, atk:0.03});
          break;
        case 'die':
          this._tone({type:'square', f0:300, f1:70, dur:0.45, vol:0.4});
          this._tone({type:'sine', f0:200, f1:50, dur:0.5, vol:0.3});
          break;
        case 'jump':
          this._tone({type:'square', f0:300, f1:620, dur:0.14, vol:0.3});
          break;
        case 'land':
          this._tone({type:'sine', f0:160, f1:70, dur:0.12, vol:0.3});
          this._noise({filter:'lowpass', cutoff:600, cutoff1:160, dur:0.12, vol:0.25});
          break;
        case 'splash':
          this._noise({filter:'bandpass', cutoff:1600, cutoff1:500, dur:0.35, vol:0.45});
          this._tone({type:'sine', f0:420, f1:140, dur:0.25, vol:0.2});
          break;
        case 'drown':
          // wet descending gurgle: low-pass noise burst + a down-glide sine "glug"
          this._noise({filter:'lowpass', cutoff:900, cutoff1:160, dur:0.5, vol:0.3});
          this._tone({type:'sine', f0:300, f1:90, dur:0.45, vol:0.22, atk:0.01});
          break;
        case 'select':
          this._tone({type:'triangle', f0:660, f1:880, dur:0.08, vol:0.3});
          break;
        case 'click':
          // crisp, pleasant UI click/pop for menu buttons
          this._tone({type:'sine', f0:900, f1:1500, dur:0.05, vol:0.28, atk:0.002});
          this._tone({type:'triangle', f0:1800, dur:0.03, vol:0.12, atk:0.001});
          break;
        case 'pickup':
          this._tone({type:'triangle', f0:880, f1:1320, dur:0.12, vol:0.35});
          this._tone({type:'sine', f0:1320, dur:0.1, vol:0.18});
          break;
        case 'achievement': {
          const notes=[784,988,1175];
          notes.forEach((f,i)=>{
            const ctx=this.ctx, t=this._now()+i*0.1;
            const o=ctx.createOscillator(), gg=ctx.createGain();
            o.type='triangle'; o.frequency.setValueAtTime(f,t);
            const v=0.35*this._sfxVol(); if(v<=0.0002) return;
            gg.gain.setValueAtTime(0.0001,t);
            gg.gain.exponentialRampToValueAtTime(v,t+0.02);
            gg.gain.exponentialRampToValueAtTime(0.0001,t+0.25);
            o.connect(gg); gg.connect(this.master); o.start(t); o.stop(t+0.27);
          });
          break;
        }
        case 'tick':
          this._tone({type:'square', f0:1200, dur:0.04, vol:0.25});
          break;
        case 'win': {
          const notes=[523,659,784,1047];
          notes.forEach((f,i)=>{
            const ctx=this.ctx, t=this._now()+i*0.13;
            const o=ctx.createOscillator(), gg=ctx.createGain();
            o.type='triangle'; o.frequency.setValueAtTime(f,t);
            const v=0.4*this._sfxVol(); if(v<=0.0002) return;
            gg.gain.setValueAtTime(0.0001,t);
            gg.gain.exponentialRampToValueAtTime(v,t+0.02);
            gg.gain.exponentialRampToValueAtTime(0.0001,t+0.3);
            o.connect(gg); gg.connect(this.master); o.start(t); o.stop(t+0.32);
          });
          break;
        }
        // ---- character / hit feedback (these map to not-yet-shipped files; the
        // synth below makes them AUDIBLE now, and stays as the fallback later) ----
        case 'hurt':
          // short pained "ow" — a quick down-glide + soft body noise
          this._tone({type:'square', f0:420, f1:180, dur:0.12, vol:0.32, atk:0.003});
          this._noise({filter:'bandpass', cutoff:1200, cutoff1:500, dur:0.1, vol:0.16});
          break;
        case 'teleport':
          // shimmery up-warble (two rising tones) — magic blink
          this._tone({type:'sine',     f0:300, f1:1400, dur:0.18, vol:0.28, atk:0.004});
          this._tone({type:'triangle', f0:600, f1:2200, dur:0.16, vol:0.16, atk:0.004});
          break;
        case 'punch':
          // thuddy melee impact: low body + tight noise crack
          this._tone({type:'sine', f0:200, f1:60, dur:0.12, vol:0.5, atk:0.002});
          this._noise({filter:'lowpass', cutoff:900, cutoff1:200, dur:0.08, vol:0.3});
          break;

        // ---- spell casts (mage/necro) ----
        case 'cast_fire':
          // whooshy fire conjure: rising filtered noise + warm tone
          this._noise({filter:'highpass', cutoff:300, cutoff1:1600, dur:0.3, vol:0.3, atk:0.02});
          this._tone({type:'sawtooth', f0:160, f1:420, dur:0.28, vol:0.22, atk:0.02});
          break;
        case 'cast_frost':
          // cold crystalline ring: high glassy tone + bright tinkle
          this._tone({type:'sine', f0:1500, f1:900, dur:0.3, vol:0.24, atk:0.01});
          this._tone({type:'triangle', f0:2600, f1:2000, dur:0.22, vol:0.12, atk:0.01});
          break;
        case 'cast_lightning':
          // crackly zap: bright noise burst + a fast high tone
          this._noise({filter:'highpass', cutoff:2200, cutoff1:5000, dur:0.18, vol:0.3, atk:0.001});
          this._tone({type:'square', f0:1800, f1:600, dur:0.12, vol:0.18, atk:0.001});
          break;
        case 'cast_summon':
          // dark rising drone — something rises from the ground
          this._tone({type:'sawtooth', f0:90, f1:260, dur:0.4, vol:0.26, atk:0.03});
          this._tone({type:'sine', f0:180, f1:120, dur:0.35, vol:0.18, atk:0.03});
          break;

        // ---- buffs / build / utility ----
        case 'shield_up':
          // protective rising chime (two-note up)
          this._tone({type:'triangle', f0:440, f1:660, dur:0.16, vol:0.3, atk:0.006});
          this._tone({type:'sine', f0:880, f1:1100, dur:0.18, vol:0.14, atk:0.006});
          break;
        case 'heal':
          // gentle warm sparkle up (soft, soothing)
          this._tone({type:'sine', f0:660, f1:990, dur:0.2, vol:0.26, atk:0.01});
          this._tone({type:'sine', f0:990, f1:1320, dur:0.16, vol:0.13, atk:0.01});
          break;
        case 'build':
          // light woody tap (hammer/place) — short knock
          this._tone({type:'square', f0:260, f1:160, dur:0.06, vol:0.28, atk:0.002});
          this._noise({filter:'bandpass', cutoff:1400, cutoff1:700, dur:0.05, vol:0.14});
          break;
        case 'charged_shot':
          // sharp, snappy launch: tight down-glide + airy crack (snipey)
          this._tone({type:'sawtooth', f0:900, f1:200, dur:0.16, vol:0.38, atk:0.002});
          this._noise({filter:'highpass', cutoff:1200, cutoff1:400, dur:0.14, vol:0.28});
          break;
        case 'jetpack':
          // breathy thrust: sustained band-noise puff
          this._noise({filter:'bandpass', cutoff:700, cutoff1:1100, dur:0.32, vol:0.24, atk:0.04});
          break;
        case 'blowtorch':
          // hissy flame jet: airy highpass noise
          this._noise({filter:'highpass', cutoff:1600, cutoff1:2400, dur:0.3, vol:0.22, atk:0.03});
          break;
        case 'mine_arm':
          // tiny mechanical "armed" beep-click
          this._tone({type:'square', f0:1400, dur:0.04, vol:0.22, atk:0.001});
          this._tone({type:'square', f0:1000, dur:0.04, vol:0.16, atk:0.001});
          break;

        // ---- crowd / voice flavour ----
        case 'cheer':
          // little celebratory up-chirp triad (lighter than 'win')
          this._tone({type:'triangle', f0:660, f1:880, dur:0.12, vol:0.3, atk:0.004});
          this._tone({type:'triangle', f0:990, f1:1320, dur:0.14, vol:0.2, atk:0.004});
          break;
        case 'taunt':
          // cheeky two-note "nyah" (down then up)
          this._tone({type:'sawtooth', f0:520, f1:300, dur:0.1, vol:0.26, atk:0.004});
          this._tone({type:'sawtooth', f0:360, f1:560, dur:0.12, vol:0.22, atk:0.004});
          break;
        case 'voice':
          // very soft idle mumble (rare; deliberately quiet)
          this._tone({type:'triangle', f0:340, f1:300, dur:0.1, vol:0.14, atk:0.01});
          break;
        case 'confused':
          // woozy wobble (down-up-down)
          this._tone({type:'sine', f0:500, f1:260, dur:0.22, vol:0.22, atk:0.008});
          break;

        // ---- meta / progression ----
        case 'coin':
          // classic bright two-note coin pickup
          this._tone({type:'square', f0:988, dur:0.06, vol:0.22, atk:0.002});
          this._tone({type:'square', f0:1319, dur:0.1, vol:0.2, atk:0.002, delay:0.06});
          break;
        case 'chest':
          // creak-then-sparkle: low open + bright reveal
          this._tone({type:'sawtooth', f0:200, f1:300, dur:0.16, vol:0.2, atk:0.01});
          this._tone({type:'sine', f0:1175, f1:1568, dur:0.18, vol:0.18, atk:0.01});
          break;
        case 'levelup': {
          // ascending fanfare (lighter than win's 4-note)
          const notesL=[523,659,880];
          notesL.forEach((f,i)=>{
            const ctx=this.ctx, t=this._now()+i*0.09;
            const o=ctx.createOscillator(), gg=ctx.createGain();
            o.type='triangle'; o.frequency.setValueAtTime(f,t);
            const v=0.33*this._sfxVol(); if(v<=0.0002) return;
            gg.gain.setValueAtTime(0.0001,t);
            gg.gain.exponentialRampToValueAtTime(v,t+0.02);
            gg.gain.exponentialRampToValueAtTime(0.0001,t+0.26);
            o.connect(gg); gg.connect(this.master); o.start(t); o.stop(t+0.28);
          });
          break;
        }
        case 'lose': {
          // sad descending trombone-ish triad
          const notesD=[392,330,262];
          notesD.forEach((f,i)=>{
            const ctx=this.ctx, t=this._now()+i*0.16;
            const o=ctx.createOscillator(), gg=ctx.createGain();
            o.type='sawtooth'; o.frequency.setValueAtTime(f,t);
            o.frequency.exponentialRampToValueAtTime(Math.max(20,f*0.94),t+0.3);
            const v=0.32*this._sfxVol(); if(v<=0.0002) return;
            gg.gain.setValueAtTime(0.0001,t);
            gg.gain.exponentialRampToValueAtTime(v,t+0.03);
            gg.gain.exponentialRampToValueAtTime(0.0001,t+0.34);
            o.connect(gg); gg.connect(this.master); o.start(t); o.stop(t+0.36);
          });
          break;
        }
        default:
          break;
      }
      }catch(e){ /* never throw from audio */ }
    },

    /* ---- procedural background music (#29) ---- */
    // A gentle 8-step arpeggio over a I–vi–IV–V-ish chord cycle, low volume.
    _CHORDS: [
      [261.63, 329.63, 392.00],   // C
      [220.00, 261.63, 329.63],   // Am
      [174.61, 220.00, 261.63],   // F
      [196.00, 246.94, 392.00],   // G
    ],

    start(){
      this._musicOn=true;
      if(!this.ctx){ /* will apply on init() after gesture */ return; }
      this._applyMusicVol();
      if(this._music) return;  // already running
      const self=this;
      let step=0, chord=0;
      const tick=()=>{
        if(!self._musicOn || !self.ctx){ return; }
        // #36 tension 0..1 (set by CA.FX._syncMusic). Higher = faster & more
        // intense: tempo speeds up, an extra pulsing low note adds urgency, and
        // the music bus volume lifts a touch.
        const tension=U.clamp(self._tension!=null?self._tension:0, 0, 1);
        const beat=0.34 - 0.10*tension;   // 0.34s relaxed -> 0.24s tense
        self._applyMusicVol();
        try{
          const muted=(CA.settings&&CA.settings.muted)||self.muted;
          if(!muted){
            const ch=self._CHORDS[chord%self._CHORDS.length];
            // arpeggio note
            const note=ch[step%ch.length] * (step%8>=4?2:1);
            self._musicNote(note, beat*1.6, 'triangle', 0.5);
            // soft bass on the downbeat
            if(step%4===0){ self._musicNote(ch[0]/2, beat*3, 'sine', 0.6); }
            // a sparkle every other bar
            if(step%8===2){ self._musicNote(ch[2]*2, beat, 'sine', 0.25); }
            // tension layer: a pulsing low drone on every beat once tense
            if(tension>0.35){ self._musicNote(ch[0]/2, beat*0.9, 'sawtooth', 0.18*tension); }
          }
          step++;
          if(step%8===0) chord++;
        }catch(e){}
        self._music={ timer:setTimeout(tick, beat*1000) };
      };
      tick();
    },

    _musicNote(freq, dur, type, vol){
      if(!this.ctx||!this.musicGain) return;
      try{
        const ctx=this.ctx, t=ctx.currentTime;
        const o=ctx.createOscillator(), g=ctx.createGain();
        o.type=type||'triangle'; o.frequency.setValueAtTime(freq,t);
        const v=(vol!=null?vol:0.5);
        g.gain.setValueAtTime(0.0001,t);
        g.gain.exponentialRampToValueAtTime(v, t+0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t+dur+0.05);
      }catch(e){}
    },

    stop(){
      this._musicOn=false;
      if(this._music && this._music.timer){ clearTimeout(this._music.timer); }
      this._music=null;
      this._applyMusicVol();
    }
  };

  /* ---- screen-space CINEMATIC GRADE (always-on "premium" look) ----------------
   * A warm contrast wash + a soft dark vignette over the gameplay (HUD draws on
   * top, so it stays crisp). Cheap + iOS-safe: ONE cached vignette sprite drawn
   * with drawImage + ONE warm 'overlay' fillRect per frame (no ctx.filter, no
   * per-frame gradient). Skipped on 'low' quality and whenever the WebGL post-pass
   * (Legmagasabb / opted-in 'high') is active, so the two never double up. */
  CA.FX.renderGrade = function(ctx){
    try{
      if(!ctx || !ctx.canvas) return;
      if(CA.settings && CA.settings.quality==='low') return;
      if(CA.PostFX && CA.PostFX.enabled && CA.PostFX.enabled()) return;   // WebGL owns the grade
      var w = ctx.canvas.width|0, h = ctx.canvas.height|0; if(!w || !h) return;
      var fn = CA.FX.renderGrade;
      if(fn._w!==w || fn._h!==h || !fn._vig){
        var c = (typeof document!=='undefined') ? document.createElement('canvas') : null;
        var g = c && c.getContext ? c.getContext('2d') : null;
        if(g){
          c.width=w; c.height=h;
          var rad = g.createRadialGradient(w*0.5,h*0.46,Math.min(w,h)*0.32, w*0.5,h*0.52,Math.max(w,h)*0.75);
          rad.addColorStop(0,'rgba(0,0,0,0)'); rad.addColorStop(0.60,'rgba(0,0,0,0)');
          rad.addColorStop(1,'rgba(6,4,14,0.46)');
          g.fillStyle=rad; g.fillRect(0,0,w,h);
          fn._vig=c; fn._w=w; fn._h=h;
        } else { fn._w=w; fn._h=h; }   // no offscreen → still draw the warm wash below
      }
      ctx.save();
      ctx.globalCompositeOperation='overlay';                 // boosts warmth+contrast (iOS Safari OK)
      ctx.fillStyle='rgba(255,150,70,0.13)';
      ctx.fillRect(0,0,w,h);
      ctx.globalCompositeOperation='source-over';
      if(fn._vig) ctx.drawImage(fn._vig,0,0);
      ctx.restore();
    }catch(e){ try{ ctx.globalCompositeOperation='source-over'; ctx.restore(); }catch(_){ } }
  };
})();
