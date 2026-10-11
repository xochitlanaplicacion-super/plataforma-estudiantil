/* ============================================================================
 * CUTE ANIMALS — terrain.js   ::  AGENT A — Terrain & Physics service
 * ----------------------------------------------------------------------------
 * GOAL: Worms-style DESTRUCTIBLE terrain + the collision service every other
 * module relies on. This is the most important physics primitive in the game.
 *
 * IMPLEMENT this public API on CA.Terrain (keep the names/signatures EXACT):
 *   init(ctx)
 *   generate(seed)            -> build a fresh randomized landscape into an
 *                                offscreen <canvas> mask. Rolling hills +
 *                                a few floating islands. Fill world width
 *                                CA.config.WORLD_W x WORLD_H. Leave sky empty.
 *   isSolid(x,y) -> bool       -> true if world pixel (x,y) is ground.
 *   destroy(x,y,r)             -> carve a circular crater (clear pixels) and
 *                                draw a scorched rim. Used by CA.explode.
 *   heightAt(x) -> y           -> topmost solid y at column x (WORLD_H if none).
 *   collideCircle(x,y,r) -> {nx,ny,depth} | null
 *                                surface normal + penetration depth for a
 *                                circle, used by projectile & unit physics.
 *   render(ctx)                -> draw terrain in WORLD space (camera already
 *                                applied by core). Cute layered look: grass
 *                                top, dirt body, subtle texture.
 *
 * v2 additions (Agent World):
 *   generate(seed, theme)      -> looks up CA.Maps[theme]; uses theme.gen for
 *                                the SOLID shape if present, else built-in gen.
 *                                Paints with the theme palette.
 *   paintSolid(x,y,r)          -> editor hook: add a solid disc to the MASK.
 *   carve(x,y,r)               -> editor hook: clear a disc from the MASK.
 *   clearAll()                 -> editor hook: wipe MASK to empty.
 *
 * TECH NOTES:
 *  - Use an offscreen canvas as the destructible MASK. isSolid reads its alpha
 *    (keep a cached ImageData; refresh the dirty region after destroy()).
 *  - destroy(): clear with globalCompositeOperation='destination-out'.
 *  - Performance: cache getImageData; only re-read changed rects.
 *  - Add a thin grass crust so craters look juicy.
 *  - Muddy tint near water tracks CA.state.waterLevel (rising water, #5).
 *  - generate() must place ground such that Entities.spawnTeams can drop units
 *    onto it (heightAt must return sensible values across the map).
 *
 * Coordinate space = world pixels. Do NOT apply camera (core does it).
 * ==========================================================================*/
(function(){
  const C = CA.config;
  // NOTE: W/H are re-read from C.WORLD_W/H at the start of every generate() —
  // core.js sets a per-theme WORLD_W (graveyard 3600 vs 2400 base) right before
  // generating, so caching these at module-load would build terrain at the stale
  // width and leave the wider arena's far side an empty void.
  let W = C.WORLD_W, H = C.WORLD_H;
  const U = CA.util;

  let mask, mctx, img;
  let painted, pctx;
  let ready = false;

  // #26c — tileable GROUND TEXTURE overlaid on the dirt body (the Worms W.M.D
  // depth trick). ONE neutral CC0 texture, composited 'overlay' so each theme's
  // palette still tints it. Lazy: paintRect uses it when loaded; once it finishes
  // loading after the initial (untextured) paint, render() triggers one full
  // repaint. _texFullDone is reset each generate().
  let _groundPat = null, _texFullDone = false;
  function groundPattern(){
    if (_groundPat) return _groundPat;
    try {
      var im = CA.img && CA.img('assets/textures/ground.jpg?v='+(CA.ASSET_V||'1'));
      if (im && pctx) _groundPat = pctx.createPattern(im, 'repeat');
    } catch(e){ _groundPat = null; }
    return _groundPat;
  }

  /* INDESTRUCTIBLE BEDROCK — a SECOND mask, separate from the destructible one.
   * destroy()/carve() never touch it; isSolid()/heightAt() include it; render()
   * draws it darker + striped so players can read "you can't dig through this".
   * Maps place bedrock (a thin floor / a few platforms) via CA.Terrain.paintBedrock
   * so terrain can never be fully flattened (protects forts, blocks drill-through).
   * bImg is a cached ImageData of bmask's alpha for fast isBedrock() lookups. */
  let bmask, bctx, bImg;
  // pre-rendered, styled bedrock layer (dark + diagonal hazard stripes), clipped
  // to the bedrock shape. Built once per generate(); blitted in render().
  let bpaint, bpctx;

  /* #10 MOVING PLATFORMS — logical solid blocks the game tracks separately from
   * the destructible MASK. Units collide via isSolid()/heightAt(), so we report
   * platform pixels as solid there; they oscillate horizontally or vertically
   * within `range` based on CA.state.frame (deterministic, no extra update hook
   * needed since render() runs every frame and isSolid recomputes live). Each:
   *   { x0, y0, w, h, axis:'x'|'y', range, speed, phase, color }
   * x0/y0 = home position; current pos derived from frame in platformPos(). */
  let platforms = [];

  function platformPos(pl){
    const f = (CA.state && CA.state.frame) || 0;
    const t = Math.sin(f * (pl.speed||0.012) + (pl.phase||0)) * (pl.range||0) * 0.5;
    if (pl.axis === 'y') return { x: pl.x0, y: pl.y0 + t };
    return { x: pl.x0 + t, y: pl.y0 };
  }

  function platformSolidAt(x, y){
    if (!platforms.length) return false;
    for (const pl of platforms){
      const p = platformPos(pl);
      if (x >= p.x && x < p.x + pl.w && y >= p.y && y < p.y + pl.h) return true;
    }
    return false;
  }

  // topmost platform surface at column x (or H if none) — feeds heightAt().
  function platformTopAt(x){
    let best = H;
    for (const pl of platforms){
      const p = platformPos(pl);
      if (x >= p.x && x < p.x + pl.w && p.y < best) best = p.y;
    }
    return best;
  }

  // per-frame Δx of the X-axis platform directly under a point (0 if none) —
  // entities használja, hogy a mozgó platform VIGYE magával a rajta állót
  // (QA P2: eddig kicsúszott a talp alól és a vízbe ejtette az egységet).
  function platformDeltaX(x, y){
    const f = (CA.state && CA.state.frame) || 0;
    for (const pl of platforms){
      if (pl.axis === 'y') continue;
      const p = platformPos(pl);
      if (x >= p.x - 2 && x < p.x + pl.w + 2 && y >= p.y - 4 && y < p.y + pl.h){
        const tPrev = Math.sin((f-1) * (pl.speed||0.012) + (pl.phase||0)) * (pl.range||0) * 0.5;
        return p.x - (pl.x0 + tPrev);
      }
    }
    return 0;
  }
  let curSeed = 1;
  let pal = null;          // active palette (from CA.Maps[theme])
  let curTheme = null;     // active theme object

  /* small seeded PRNG (mulberry32) — deterministic per seed */
  function makeRng(seed){
    let a = (seed >>> 0) || 1;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 1-D value noise built from a seeded gradient table */
  function makeNoise1D(rng, n){
    const g = new Float32Array(n);
    for (let i=0;i<n;i++) g[i] = rng()*2-1;
    return function(t){
      const x = t * n;
      const i0 = Math.floor(x) % n;
      const i1 = (i0+1) % n;
      const f = x - Math.floor(x);
      const s = f*f*(3-2*f);
      return g[i0]*(1-s) + g[i1]*s;
    };
  }

  /* ---- color helpers (parse #hex -> {r,g,b}, blend, shade) ---- */
  function hex2rgb(h){
    h = (h||'#808080').replace('#','');
    if (h.length===3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    const n = parseInt(h,16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  }
  function rgbStr(c,a){ return 'rgba('+(c.r|0)+','+(c.g|0)+','+(c.b|0)+','+(a==null?1:a)+')'; }
  function shade(c,f){ // f<1 darken, f>1 lighten
    return { r:U.clamp(c.r*f,0,255), g:U.clamp(c.g*f,0,255), b:U.clamp(c.b*f,0,255) };
  }

  /* ---------------------------------------------------------------------- *
   * BUILT-IN SOLID SHAPE (used when a theme has no gen())
   * ---------------------------------------------------------------------- */
  function buildShapeBuiltin(seed){
    const rng = makeRng(curSeed);
    const oct = [
      { n: makeNoise1D(rng, 6),  amp: 150 },
      { n: makeNoise1D(rng, 14), amp: 70 },
      { n: makeNoise1D(rng, 34), amp: 30 },
      { n: makeNoise1D(rng, 80), amp: 12 },
    ];
    const baseline = C.WATER_LEVEL - 120;
    const surf = new Float32Array(W);
    for (let x=0; x<W; x++){
      const t = x / W;
      let y = baseline;
      for (const o of oct) y += o.n(t) * o.amp;
      const edge = Math.min(x, W-1-x) / 260;
      if (edge < 1) y -= (1-edge)*(1-edge) * 130;
      surf[x] = U.clamp(y, 120, H-40);
    }
    const sm = new Float32Array(W); const R = 4;
    for (let x=0;x<W;x++){
      let acc=0,cnt=0;
      for (let k=-R;k<=R;k++){ const xi=x+k; if(xi>=0&&xi<W){ acc+=surf[xi]; cnt++; } }
      sm[x]=acc/cnt;
    }
    mctx.fillStyle = '#000';
    mctx.beginPath();
    mctx.moveTo(0, H);
    for (let x=0;x<W;x++) mctx.lineTo(x, sm[x]);
    mctx.lineTo(W, H);
    mctx.closePath();
    mctx.fill();

    const islandCount = 2 + Math.floor(rng()*3);
    for (let i=0;i<islandCount;i++){
      const cx = W*(0.15 + rng()*0.7);
      const surfHere = sm[U.clamp(cx|0,0,W-1)];
      const cy = U.clamp(surfHere - (140 + rng()*220), 150, surfHere - 90);
      drawBlob(cx, cy, 70 + rng()*120, 26 + rng()*40, rng);
    }

    const caveCount = 2 + Math.floor(rng()*3);
    mctx.globalCompositeOperation = 'destination-out';
    for (let i=0;i<caveCount;i++){
      const cx = W*(0.1 + rng()*0.8);
      const surfHere = sm[U.clamp(cx|0,0,W-1)];
      const cy = surfHere + 60 + rng()*180;
      mctx.beginPath();
      mctx.ellipse(cx, cy, 50 + rng()*90, 30 + rng()*55, 0, 0, Math.PI*2);
      mctx.fill();
    }
    mctx.globalCompositeOperation = 'source-over';
  }

  function drawBlob(cx, cy, rw, rh, rng){
    mctx.fillStyle = '#000';
    mctx.beginPath();
    const pts = 14;
    for (let i=0;i<=pts;i++){
      const a = (i/pts)*Math.PI*2;
      const jit = 0.78 + rng()*0.32;
      const yScale = Math.sin(a) > 0 ? 1.15 : 0.85;
      const px = cx + Math.cos(a)*rw*jit;
      const py = cy + Math.sin(a)*rh*jit*yScale;
      if (i===0) mctx.moveTo(px,py); else mctx.lineTo(px,py);
    }
    mctx.closePath();
    mctx.fill();
  }

  /* ---------------------------------------------------------------------- *
   * PAINTED LAYER — themed via `pal`, cached, repainted only on dirty rects.
   * ---------------------------------------------------------------------- */
  function paintRect(rx, ry, rw, rh){
    rx = Math.max(0, rx|0); ry = Math.max(0, ry|0);
    rw = Math.min(W-rx, rw|0); rh = Math.min(H-ry, rh|0);
    if (rw<=0 || rh<=0) return;

    const dirt     = hex2rgb(pal.dirt);
    const dirtDark = hex2rgb(pal.dirtDark);
    const rock     = hex2rgb(pal.rock);
    const grass    = hex2rgb(pal.grass);

    pctx.save();
    pctx.beginPath();
    pctx.rect(rx, ry, rw, rh);
    pctx.clip();
    pctx.clearRect(rx, ry, rw, rh);

    // 1) dirt body vertical gradient (dirt near top -> dirtDark deep down)
    const grad = pctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, rgbStr(shade(dirt,1.18)));
    grad.addColorStop(0.35, rgbStr(dirt));
    grad.addColorStop(0.70, rgbStr(shade(dirtDark,1.12)));
    grad.addColorStop(1.00, rgbStr(dirtDark));
    pctx.fillStyle = grad;
    pctx.fillRect(rx, ry, rw, rh);

    // 1a) GROUND TEXTURE overlay — tileable surface detail tinted by the dirt
    // gradient beneath (Worms-style depth). 'overlay' keeps the per-theme colour.
    var _pat = groundPattern();
    if (_pat){
      pctx.save();
      pctx.globalCompositeOperation = 'overlay';
      pctx.globalAlpha = 0.72;
      pctx.fillStyle = _pat;
      pctx.fillRect(rx, ry, rw, rh);
      pctx.restore();
    }

    // muddy tint near the LIVE water level (#5 rising water)
    const wl = CA.state.waterLevel || C.WATER_LEVEL;
    if (ry + rh > wl - 80){
      const my0 = Math.max(ry, wl - 80);
      const mg = pctx.createLinearGradient(0, wl-80, 0, H);
      mg.addColorStop(0, 'rgba(60,70,45,0)');
      mg.addColorStop(1, 'rgba(45,55,38,0.55)');
      pctx.fillStyle = mg;
      pctx.fillRect(rx, my0, rw, ry+rh-my0);
    }

    // 1b) mottled dirt clumps — soft tonal blobs that break up the flat gradient
    // for earthy depth (deterministic; radial so they read as patches, not dots).
    const rngM = makeRng((curSeed ^ ((rx*40503) ^ (ry*51787))) >>> 0);
    const blobs = Math.max(1, ((rw*rh)/3200)|0);
    for (let i=0;i<blobs;i++){
      const bx = rx + rngM()*rw, by = ry + rngM()*rh;
      const br = 11 + rngM()*26;
      const dark = rngM() < 0.56;
      const tone = dark ? shade(dirtDark, 0.78 + rngM()*0.22) : shade(dirt, 1.12 + rngM()*0.2);
      const bg = pctx.createRadialGradient(bx, by, 0, bx, by, br);
      bg.addColorStop(0, rgbStr(tone, dark ? 0.20 : 0.15));
      bg.addColorStop(1, rgbStr(tone, 0));
      pctx.fillStyle = bg;
      pctx.beginPath(); pctx.arc(bx, by, br, 0, Math.PI*2); pctx.fill();
    }

    // 2) dirt texture flecks + themed rock speckles (deterministic per seed)
    const rng = makeRng(curSeed ^ ((rx*73856093) ^ (ry*19349663)));
    const cells = Math.max(1, ((rw*rh)/90)|0);
    for (let i=0;i<cells;i++){
      const px = rx + rng()*rw;
      const py = ry + rng()*rh;
      const t = py/H;
      const d = (rng()*2-1);
      const shadeStr = d>0 ? 'rgba(255,235,200,' : 'rgba(0,0,0,';
      pctx.fillStyle = shadeStr + (0.04 + Math.abs(d)*0.05).toFixed(3) + ')';
      const s = 1 + rng()*2.2;
      pctx.fillRect(px, py, s, s);
      if (rng() < 0.05 + t*0.08){
        const rk = shade(rock, 0.85 + rng()*0.4);
        pctx.fillStyle = rgbStr(rk, 0.7);
        const rs = 2 + rng()*3.5;
        pctx.beginPath(); pctx.arc(px, py, rs, 0, Math.PI*2); pctx.fill();
        pctx.fillStyle = 'rgba(255,255,255,0.12)';
        pctx.beginPath(); pctx.arc(px-rs*0.3, py-rs*0.3, rs*0.4, 0, Math.PI*2); pctx.fill();
      }
    }

    // 3) grass/crust band following the surface — layered + clumpy + lit rim so
    // the edge reads as lush turf (bright rim → mid green → dark root shadow into
    // the dirt) instead of a flat green line. Tone & thickness vary per column.
    const data = img.data;
    const rootShadow = rgbStr(shade(grass, 0.55));   // dark green-brown where turf meets soil
    for (let x=rx; x<rx+rw; x++){
      let topY = -1;
      for (let y=ry; y<ry+rh; y++){
        if (data[(y*W + x)*4 + 3] > 128){ topY = y; break; }
      }
      if (topY < 0) continue;
      const aboveEmpty = (topY===0) || data[((topY-1)*W + x)*4 + 3] <= 128;
      if (!aboveEmpty) continue;
      // clumpy turf: two-octave noise drives per-column brightness + thickness so
      // the grass looks like tufts/patches rather than a uniform stripe.
      const clump = Math.sin(x*0.21 + curSeed*1.7) + Math.sin(x*0.061 + curSeed)*0.7;
      const lush  = 1.06 + Math.max(-0.5, clump)*0.16;      // brightness of this clump
      const wob = Math.sin(x*0.12 + curSeed)*1.2 + Math.sin(x*0.045)*1.6;
      const gh = 8 + (wob+3) + Math.max(0, clump)*2.4;      // thicker on lush clumps
      const gg = pctx.createLinearGradient(0, topY-2, 0, topY+gh);
      gg.addColorStop(0,    rgbStr(shade(grass, 1.34*lush)));   // lit top
      gg.addColorStop(0.45, rgbStr(shade(grass, lush)));        // body
      gg.addColorStop(0.82, rootShadow);                       // root shadow
      gg.addColorStop(1,    rgbStr(grass, 0));                  // fade into dirt
      pctx.fillStyle = gg;
      pctx.fillRect(x, topY-2, 1, gh+2);
      // bright sunlit rim on the very crest
      pctx.fillStyle = rgbStr(shade(grass, 1.72), 0.92);
      pctx.fillRect(x, topY-2, 1, 1.5);
    }
    pctx.restore();

    // 4) clip everything we just painted to the mask shape
    pctx.save();
    pctx.beginPath(); pctx.rect(rx, ry, rw, rh); pctx.clip();
    pctx.globalCompositeOperation = 'destination-in';
    pctx.drawImage(mask, 0, 0);
    pctx.globalCompositeOperation = 'source-over';
    pctx.restore();
  }

  /* refresh cached ImageData over a rect (after a mask change) */
  function refreshRect(x0,y0,w,h){
    x0 = Math.max(0,x0|0); y0 = Math.max(0,y0|0);
    w = Math.min(W-x0, w|0); h = Math.min(H-y0, h|0);
    if (w<=0||h<=0) return;
    const sub = mctx.getImageData(x0,y0,w,h);
    const sd = sub.data, dd = img.data;
    for (let j=0;j<h;j++){
      let di = ((y0+j)*W + x0)*4;
      let si = (j*w)*4;
      const rowEnd = si + w*4;
      while (si < rowEnd){ dd[di++]=sd[si++]; }
    }
  }

  /* ---------------------------------------------------------------------- *
   * PROPS — decorative items drawn over the terrain in world space.
   * Barrels are also registered as hazards (chain-explode) at generate time.
   * ---------------------------------------------------------------------- */
  function registerHazardProps(){
    if (!curTheme || !curTheme.props) return;
    if (!CA.Hazards || !CA.Hazards.add) return;
    for (const p of curTheme.props){
      if (p.kind === 'barrel'){
        // guard double-registration on regenerate
        if (p._hz) continue;
        // QA P2: az opts.r itt a ROBBANÁSI sugár (hazards.js make('barrel')
        // default 78, "big") — a korábbi r:18 a hordó ütközés-méretét adta át
        // tévedésből, így a lánc-robbanás 18px-es "tüsszentés" volt.
        try{ CA.Hazards.add('barrel', p.x, p.y - 14, { prop:p }); p._hz = true; }
        catch(e){}
      }
    }
  }

  function drawProp(ctx, p){
    const x = p.x, y = p.y;
    // #9: a dead prop is gone — except a TREE leaves a little stump behind.
    if (p._dead){
      if (p.kind === 'tree'){
        ctx.fillStyle = 'rgba(40,70,30,0.18)';
        ctx.beginPath(); ctx.ellipse(x, y, 14, 4, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#6e4f2a';
        ctx.fillRect(x-6, y-9, 12, 9);
        ctx.fillStyle = '#8a6a3a';
        ctx.beginPath(); ctx.ellipse(x, y-9, 6, 2.4, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(60,40,20,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y-9, 3, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y-9, 1.4, 0, Math.PI*2); ctx.stroke();
      }
      return;
    }
    switch(p.kind){
      case 'cactus': {
        ctx.fillStyle = '#3f8f4a';
        ctx.fillRect(x-5, y-34, 10, 34);
        ctx.fillRect(x-16, y-24, 11, 8);
        ctx.fillRect(x-16, y-24, 6, -14);
        ctx.fillRect(x+5, y-28, 11, 8);
        ctx.fillRect(x+10, y-28, 6, -16);
        ctx.fillStyle = '#2f6f3a';
        ctx.fillRect(x-5, y-34, 3, 34);
        break;
      }
      case 'palm': {
        ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 6; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x+6, y-30, x+2, y-52); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#3fae3a';
        for (let i=0;i<5;i++){
          const a = -Math.PI/2 + (i-2)*0.6;
          ctx.beginPath();
          ctx.moveTo(x+2, y-52);
          ctx.quadraticCurveTo(x+2+Math.cos(a)*22, y-52+Math.sin(a)*22-6,
                               x+2+Math.cos(a)*40, y-52+Math.sin(a)*40+8);
          ctx.lineTo(x+2+Math.cos(a)*38, y-52+Math.sin(a)*38+2);
          ctx.quadraticCurveTo(x+2+Math.cos(a)*20, y-52+Math.sin(a)*20, x+2, y-50);
          ctx.fill();
        }
        break;
      }
      case 'umbrella': {  // beach parasol — pole + striped half-dome canopy
        ctx.strokeStyle = '#b9a07a'; ctx.lineWidth = 3; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y-46); ctx.stroke(); ctx.lineWidth = 1; ctx.lineCap='butt';
        for (let i=0;i<6;i++){
          ctx.fillStyle = (i%2) ? '#ff6b5c' : '#fff6ee';
          const a0 = Math.PI + i*(Math.PI/6), a1 = a0 + Math.PI/6;
          ctx.beginPath(); ctx.moveTo(x, y-46); ctx.arc(x, y-46, 26, a0, a1); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'sandcastle': {  // little sandcastle with a flag
        ctx.fillStyle = '#d8b46a';
        ctx.fillRect(x-16, y-16, 32, 16);
        ctx.fillRect(x-16, y-23, 9, 7); ctx.fillRect(x-4, y-23, 8, 7); ctx.fillRect(x+7, y-23, 9, 7);
        ctx.fillStyle = '#c2a258'; ctx.fillRect(x-1, y-32, 2, 9);
        ctx.fillStyle = '#ff5c5c';
        ctx.beginPath(); ctx.moveTo(x+1, y-32); ctx.lineTo(x+10, y-29); ctx.lineTo(x+1, y-26); ctx.closePath(); ctx.fill();
        break;
      }
      case 'lollipop': {  // swirly lollipop on a white stick (scale-aware)
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.stroke(); ctx.lineWidth = 1; ctx.lineCap='butt';
        const lc = ['#ff5fa2','#ffd24a','#7ce0c3','#9b5de5'];
        ctx.fillStyle = lc[(x|0)%lc.length];
        ctx.beginPath(); ctx.arc(0, -46, 14, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i=0;i<24;i++){ const a=i*0.5, rr=i*0.52; const px=Math.cos(a)*rr, py=-46+Math.sin(a)*rr; if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); }
        ctx.stroke(); ctx.lineWidth = 1;
        ctx.restore(); break;
      }
      case 'candycane': {  // red/white striped candy cane (J) (scale-aware)
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.lineCap='round';
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.quadraticCurveTo(0, -46, 12, -46); ctx.stroke();
        ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 7; ctx.setLineDash([6,6]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.quadraticCurveTo(0, -46, 12, -46); ctx.stroke();
        ctx.setLineDash([]); ctx.lineWidth = 1; ctx.lineCap='butt';
        ctx.restore(); break;
      }
      case 'pine': {
        ctx.fillStyle = '#6e5230';
        ctx.fillRect(x-3, y-12, 6, 12);
        ctx.fillStyle = '#2f7d4a';
        for (let i=0;i<3;i++){
          const yy = y-12 - i*14;
          const w = 22 - i*5;
          ctx.beginPath(); ctx.moveTo(x, yy-18); ctx.lineTo(x-w, yy); ctx.lineTo(x+w, yy); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i=0;i<3;i++){
          const yy = y-12 - i*14;
          const w = 22 - i*5;
          ctx.beginPath(); ctx.moveTo(x, yy-18); ctx.lineTo(x-w*0.5, yy-9); ctx.lineTo(x+w*0.5, yy-9); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'vine': {
        ctx.strokeStyle = '#2f7d3a'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i=0;i<=10;i++){
          const yy = y - 4 - i*6;
          const xx = x + Math.sin(i*0.9)*6;
          if (i===0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke(); ctx.lineWidth = 1;
        ctx.fillStyle = '#4aae4a';
        for (let i=2;i<10;i+=2){
          const yy = y - 4 - i*6;
          const xx = x + Math.sin(i*0.9)*6;
          ctx.beginPath(); ctx.ellipse(xx+6, yy, 6, 3, 0.5, 0, Math.PI*2); ctx.fill();
        }
        break;
      }
      case 'crystal': {
        const cols = ['#7fd0ff','#a98fff','#7fffd0'];
        const col = cols[(x|0)%cols.length];
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x, y-30); ctx.lineTo(x-8, y-8); ctx.lineTo(x-3, y); ctx.lineTo(x+3, y); ctx.lineTo(x+8, y-8);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.moveTo(x, y-30); ctx.lineTo(x+2, y-8); ctx.lineTo(x+8, y-8); ctx.closePath(); ctx.fill();
        // glow
        ctx.save(); ctx.globalCompositeOperation='lighter';
        const g = ctx.createRadialGradient(x, y-14, 0, x, y-14, 26);
        g.addColorStop(0, 'rgba(160,220,255,0.35)');
        g.addColorStop(1, 'rgba(160,220,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y-14, 26, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        break;
      }
      case 'snowman': {
        // cute snowman: stacked white snowballs sitting on the ground at p.y
        const rB = 16, rM = 12, rH = 8;            // bottom / middle / head radii
        const yB = y - rB;                          // bottom ball centre
        const yM = yB - rB - rM + 6;                // middle ball centre (overlap)
        const yH = yM - rM - rH + 5;                // head centre (overlap)
        // soft shadow on the snow
        ctx.fillStyle = 'rgba(120,140,170,0.25)';
        ctx.beginPath(); ctx.ellipse(x, y, rB+4, 5, 0, 0, Math.PI*2); ctx.fill();
        // three snowballs
        ctx.fillStyle = '#fbfdff';
        ctx.beginPath(); ctx.arc(x, yB, rB, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, yM, rM, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, yH, rH, 0, Math.PI*2); ctx.fill();
        // subtle shading on the right side
        ctx.fillStyle = 'rgba(190,205,225,0.5)';
        ctx.beginPath(); ctx.arc(x+rB*0.35, yB, rB*0.85, -0.6, 1.2); ctx.fill();
        // twig arms
        ctx.strokeStyle = '#6e4a28'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x-rM*0.7, yM); ctx.lineTo(x-rM-10, yM-8);
        ctx.moveTo(x-rM-10, yM-8); ctx.lineTo(x-rM-16, yM-12);
        ctx.moveTo(x-rM-10, yM-8); ctx.lineTo(x-rM-15, yM-2);
        ctx.moveTo(x+rM*0.7, yM); ctx.lineTo(x+rM+10, yM-9);
        ctx.moveTo(x+rM+10, yM-9); ctx.lineTo(x+rM+16, yM-13);
        ctx.moveTo(x+rM+10, yM-9); ctx.lineTo(x+rM+15, yM-3);
        ctx.stroke(); ctx.lineWidth = 1;
        // coal buttons
        ctx.fillStyle = '#23272e';
        ctx.beginPath(); ctx.arc(x, yM-3, 1.6, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, yM+3, 1.6, 0, Math.PI*2); ctx.fill();
        // coal eyes
        ctx.beginPath(); ctx.arc(x-3, yH-1, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+3, yH-1, 1.5, 0, Math.PI*2); ctx.fill();
        // carrot nose
        ctx.fillStyle = '#e8852a';
        ctx.beginPath();
        ctx.moveTo(x, yH+1); ctx.lineTo(x+10, yH+3); ctx.lineTo(x, yH+3.5);
        ctx.closePath(); ctx.fill();
        // little hat
        ctx.fillStyle = '#2b3a5a';
        ctx.fillRect(x-rH-2, yH-rH+1, (rH+2)*2, 3);   // brim
        ctx.fillRect(x-rH+2, yH-rH-7, (rH-2)*2, 8);   // crown
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x-rH+2, yH-rH-1, (rH-2)*2, 2);   // hat band
        break;
      }
      case 'volcano': {
        // big centrepiece volcano: dark cone, glowing crater, flowing lava + smoke.
        const f = (CA.state && CA.state.frame) || 0;
        const baseHalf = 150;      // half-width at the base
        const topHalf  = 46;       // half-width at the crater rim
        const VH = 200;            // height of the cone
        const topY = y - VH;       // crater rim y
        // --- cone body ---
        const bodyGrad = ctx.createLinearGradient(0, topY, 0, y);
        bodyGrad.addColorStop(0, '#3a2724');
        bodyGrad.addColorStop(1, '#160d0c');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(x-baseHalf, y);
        ctx.lineTo(x-topHalf, topY);
        ctx.lineTo(x+topHalf, topY);
        ctx.lineTo(x+baseHalf, y);
        ctx.closePath(); ctx.fill();
        // shaded ridge on the right flank
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.moveTo(x+topHalf*0.3, topY);
        ctx.lineTo(x+topHalf, topY);
        ctx.lineTo(x+baseHalf, y);
        ctx.lineTo(x+baseHalf*0.3, y);
        ctx.closePath(); ctx.fill();
        // --- lava channel flowing down the left flank (animated drip) ---
        const flicker = 0.5 + 0.5*Math.sin(f*0.12);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x-topHalf+8, topY+4);
        ctx.lineTo(x-topHalf+20, topY+4);
        ctx.lineTo(x-baseHalf+44, y);
        ctx.lineTo(x-baseHalf+24, y);
        ctx.closePath(); ctx.clip();
        const lavaGrad = ctx.createLinearGradient(0, topY, 0, y);
        lavaGrad.addColorStop(0, '#ffe27a');
        lavaGrad.addColorStop(0.5, '#ff7a18');
        lavaGrad.addColorStop(1, '#b51e08');
        ctx.fillStyle = lavaGrad;
        ctx.fillRect(x-baseHalf, topY, baseHalf, VH+4);
        // animated bright blobs sliding down the channel
        ctx.globalCompositeOperation = 'lighter';
        for (let i=0;i<4;i++){
          const prog = ((f*0.01 + i*0.27) % 1);
          const ly = topY + prog*VH;
          const lx = x - topHalf + 12 + prog*(baseHalf-topHalf-22);
          ctx.fillStyle = 'rgba(255,210,90,'+(0.45*flicker).toFixed(3)+')';
          ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
        // --- glowing crater lava pool ---
        ctx.save();
        const poolY = topY + 3;
        const glowR = 40 + flicker*8;
        ctx.globalCompositeOperation = 'lighter';
        const cg = ctx.createRadialGradient(x, poolY, 4, x, poolY, glowR);
        cg.addColorStop(0, 'rgba(255,235,150,'+(0.85*flicker+0.1).toFixed(3)+')');
        cg.addColorStop(0.5, 'rgba(255,110,30,0.5)');
        cg.addColorStop(1, 'rgba(180,30,10,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(x, poolY, glowR, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        // molten pool ellipse at the rim
        ctx.fillStyle = '#ff5a12';
        ctx.beginPath(); ctx.ellipse(x, poolY, topHalf-4, 8, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,120,'+(0.6+0.4*flicker).toFixed(3)+')';
        ctx.beginPath(); ctx.ellipse(x, poolY, (topHalf-4)*0.6, 4, 0, 0, Math.PI*2); ctx.fill();
        // --- animated smoke puffs rising above the crater ---
        ctx.save();
        for (let i=0;i<5;i++){
          const prog = ((f*0.006 + i*0.2) % 1);           // 0 at crater -> 1 high up
          const sy = poolY - 18 - prog*150;
          const sx = x + Math.sin(f*0.02 + i*1.7)*18*prog;
          const sr = 12 + prog*34;
          const alpha = (1 - prog)*0.4;
          ctx.fillStyle = 'rgba(90,84,84,'+alpha.toFixed(3)+')';
          ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = 'rgba(140,130,130,'+(alpha*0.6).toFixed(3)+')';
          ctx.beginPath(); ctx.arc(sx-sr*0.3, sy-sr*0.2, sr*0.6, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'rockspire': {
        ctx.fillStyle = '#33282a';
        ctx.beginPath();
        ctx.moveTo(x-12, y); ctx.lineTo(x-4, y-38); ctx.lineTo(x+5, y-22); ctx.lineTo(x+12, y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(200,80,30,0.25)';
        ctx.fillRect(x-10, y-6, 20, 6);
        break;
      }
      case 'barrel': {
        // explosive barrel (also a hazard). Render only if not yet detonated.
        if (p._dead) break;
        ctx.fillStyle = '#b03a2a';
        ctx.fillRect(x-12, y-28, 24, 28);
        ctx.fillStyle = '#8a2a1e';
        ctx.fillRect(x-12, y-22, 24, 3);
        ctx.fillRect(x-12, y-8, 24, 3);
        ctx.fillStyle = '#ffd24a';
        ctx.font = 'bold 14px sans-serif'; ctx.textAlign='center';
        ctx.fillText('☢', x, y-10);
        ctx.textAlign='left';
        break;
      }
      case 'pyramid': {
        // distant background landmark: big, muted/hazy sand pyramid silhouette.
        // purely decorative (no mask/collision) — drawn over terrain but styled
        // soft & desaturated so it reads as far away behind the action.
        const PW = 185;            // half-width at the base (Jani: hátrébb → kisebb/távolibb)
        const PH = 215;            // height of the pyramid
        const apexY = y - PH;
        ctx.save();
        ctx.globalAlpha = 0.5;     // hazier = reads as further back
        // shaded (darker) right face
        ctx.fillStyle = '#b89968';
        ctx.beginPath();
        ctx.moveTo(x, apexY);
        ctx.lineTo(x+PW, y);
        ctx.lineTo(x, y);
        ctx.closePath(); ctx.fill();
        // sunlit (lighter) left face
        ctx.fillStyle = '#d8c08a';
        ctx.beginPath();
        ctx.moveTo(x, apexY);
        ctx.lineTo(x-PW, y);
        ctx.lineTo(x, y);
        ctx.closePath(); ctx.fill();
        // faint horizontal block courses across the whole silhouette
        ctx.strokeStyle = 'rgba(120,95,55,0.18)';
        ctx.lineWidth = 1;
        for (let i=1;i<10;i++){
          const t = i/10;
          const ly = apexY + PH*t;
          const lhw = PW*t;
          ctx.beginPath();
          ctx.moveTo(x-lhw, ly);
          ctx.lineTo(x+lhw, ly);
          ctx.stroke();
        }
        // soft sun glint along the lit edge
        ctx.strokeStyle = 'rgba(255,240,200,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, apexY); ctx.lineTo(x-PW, y); ctx.stroke();
        ctx.lineWidth = 1;
        // small base shadow grounding it in the haze
        ctx.fillStyle = 'rgba(90,70,40,0.18)';
        ctx.beginPath();
        ctx.ellipse(x, y+4, PW*0.85, 14, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'tree': {
        // cute deciduous tree: brown trunk + rounded green leafy canopy.
        // flat charming art style, sits on the ground at p.y.
        const trunkH = 26, trunkW = 7;
        // soft ground shadow
        ctx.fillStyle = 'rgba(40,70,30,0.18)';
        ctx.beginPath(); ctx.ellipse(x, y, 22, 5, 0, 0, Math.PI*2); ctx.fill();
        // trunk
        ctx.fillStyle = '#7a5a30';
        ctx.fillRect(x-trunkW/2, y-trunkH, trunkW, trunkH);
        ctx.fillStyle = '#5e4424';
        ctx.fillRect(x-trunkW/2, y-trunkH, 2, trunkH);
        // canopy: a few overlapping green blobs
        const cy = y - trunkH - 14;
        ctx.fillStyle = '#4fae3a';
        ctx.beginPath(); ctx.arc(x,      cy,    22, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x-18,   cy+6,  16, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+18,   cy+6,  16, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x-7,    cy-12, 15, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+9,    cy-10, 14, 0, Math.PI*2); ctx.fill();
        // lighter sunlit highlight on the upper-left of the canopy
        ctx.fillStyle = 'rgba(140,210,110,0.7)';
        ctx.beginPath(); ctx.arc(x-8, cy-10, 9, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+4, cy-4,  6, 0, Math.PI*2); ctx.fill();
        // darker underside shading
        ctx.fillStyle = 'rgba(40,110,40,0.35)';
        ctx.beginPath(); ctx.arc(x+12, cy+10, 12, 0, Math.PI*2); ctx.fill();
        break;
      }
      case 'tombstone': {
        // cute-spooky grey headstone: rounded-top slab on the ground at p.y,
        // tilted a touch so a row of them reads as an old graveyard. Flat art.
        const tilt = ((x|0)%5 - 2) * 0.03;          // stable per-x lean (-0.06..0.06)
        const w = 18, h = 30, r = w/2;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tilt);
        // soft ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath(); ctx.ellipse(0, 0, w*0.9, 4, 0, 0, Math.PI*2); ctx.fill();
        // stone body (rounded top)
        ctx.fillStyle = '#8a8590';
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(-r, -h+r);
        ctx.arc(0, -h+r, r, Math.PI, 0);
        ctx.lineTo(r, 0);
        ctx.closePath(); ctx.fill();
        // shaded right edge
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(r-4, -h+r, 4, h-r);
        // lighter left highlight
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(-r, -h+r, 3, h-r);
        // engraved cross
        ctx.strokeStyle = 'rgba(40,38,46,0.55)'; ctx.lineWidth = 2; ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(0, -h+8); ctx.lineTo(0, -h+20);
        ctx.moveTo(-5, -h+13); ctx.lineTo(5, -h+13);
        ctx.stroke(); ctx.lineWidth = 1;
        ctx.restore();
        break;
      }
      case 'pumpkin': {
        // jack-o'-lantern: ribbed orange pumpkin + stem + glowing carved face.
        // Sits ON the ground at p.y. A touch big (Jani). Cheap flat-vector art.
        const R = 30;                               // radius (kicsit nagy)
        const flick = 0.82 + 0.18*Math.abs(Math.sin((CA.state.frame||0)*0.05 + (x*0.7)));
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(p.scale||1, p.scale||1);
        // ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(0, -2, R*0.95, 6, 0, 0, Math.PI*2); ctx.fill();
        // stem
        ctx.fillStyle = '#5c7a2e';
        ctx.beginPath(); ctx.moveTo(-3,-R*0.92); ctx.lineTo(2,-R*1.18); ctx.lineTo(6,-R*1.12); ctx.lineTo(4,-R*0.86); ctx.closePath(); ctx.fill();
        // body — three overlapping ribbed lobes
        const lobe=(ox,rx,col)=>{ ctx.fillStyle=col; ctx.beginPath(); ctx.ellipse(ox,-R*0.5,rx,R*0.62,0,0,Math.PI*2); ctx.fill(); };
        lobe(-R*0.46, R*0.42, '#c85a16');           // left (shaded)
        lobe( R*0.46, R*0.42, '#c85a16');           // right (shaded)
        lobe(-R*0.20, R*0.50, '#f07c1e');           // mid-left
        lobe( R*0.20, R*0.50, '#f07c1e');           // mid-right
        lobe( 0,      R*0.56, '#ff8c24');           // centre (lit)
        // top highlight
        ctx.fillStyle='rgba(255,210,140,0.35)';
        ctx.beginPath(); ctx.ellipse(-R*0.12,-R*0.78,R*0.30,R*0.14,-0.4,0,Math.PI*2); ctx.fill();
        // carved face glow (warm, flickers a touch)
        ctx.globalCompositeOperation='lighter';
        ctx.fillStyle='rgba(255,170,40,'+(0.55*flick).toFixed(2)+')';
        // eyes (triangles)
        ctx.beginPath(); ctx.moveTo(-R*0.42,-R*0.62); ctx.lineTo(-R*0.18,-R*0.62); ctx.lineTo(-R*0.30,-R*0.40); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo( R*0.42,-R*0.62); ctx.lineTo( R*0.18,-R*0.62); ctx.lineTo( R*0.30,-R*0.40); ctx.closePath(); ctx.fill();
        // nose
        ctx.beginPath(); ctx.moveTo(0,-R*0.50); ctx.lineTo(-R*0.10,-R*0.34); ctx.lineTo(R*0.10,-R*0.34); ctx.closePath(); ctx.fill();
        // jagged grin
        ctx.beginPath(); ctx.moveTo(-R*0.50,-R*0.22);
        ctx.lineTo(-R*0.34,-R*0.06); ctx.lineTo(-R*0.18,-R*0.20); ctx.lineTo(0,-R*0.05);
        ctx.lineTo(R*0.18,-R*0.20); ctx.lineTo(R*0.34,-R*0.06); ctx.lineTo(R*0.50,-R*0.22);
        ctx.lineTo(R*0.30,-R*0.30); ctx.lineTo(0,-R*0.26); ctx.lineTo(-R*0.30,-R*0.30); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation='source-over';
        ctx.restore();
        break;
      }
      case 'deadtree': {
        // bare gnarled dead tree: dark trunk + a few crooked leafless branches.
        const trunkH = 44, trunkW = 7;
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.beginPath(); ctx.ellipse(x, y, 16, 4, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#37302c'; ctx.lineCap = 'round';
        // trunk
        ctx.lineWidth = trunkW;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x-3, y-trunkH*0.6, x+1, y-trunkH); ctx.stroke();
        // crooked bare branches
        ctx.lineWidth = 3;
        const top = y - trunkH;
        ctx.beginPath();
        ctx.moveTo(x+1, top+6); ctx.quadraticCurveTo(x-14, top+2, x-22, top-12);
        ctx.moveTo(x-12, top+1); ctx.lineTo(x-18, top-6);
        ctx.moveTo(x+1, top+2); ctx.quadraticCurveTo(x+15, top-4, x+24, top-16);
        ctx.moveTo(x+14, top-6); ctx.lineTo(x+20, top-13);
        ctx.moveTo(x+1, top); ctx.quadraticCurveTo(x+2, top-14, x-4, top-22);
        ctx.stroke();
        ctx.lineWidth = 1;
        break;
      }
      case 'flower_patch': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        const cols=['#ff7eb3','#ffd166','#8ad7ff'];
        for(let i=0;i<3;i++){ const fx=(i-1)*9, fy=-10-(i===1?6:0), col=cols[i];
          ctx.strokeStyle='#4f9a3a'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(fx,0); ctx.lineTo(fx,fy); ctx.stroke();
          ctx.fillStyle=col; for(let k=0;k<6;k++){ const a=k/6*6.283; ctx.beginPath(); ctx.ellipse(fx+Math.cos(a)*4,fy+Math.sin(a)*4,2.6,1.6,a,0,6.283); ctx.fill(); }
          ctx.fillStyle='#ffe08a'; ctx.beginPath(); ctx.arc(fx,fy,2,0,6.283); ctx.fill(); }
        ctx.lineWidth=1; ctx.restore(); break;
      }
      case 'mushroom': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0,-1,12,3,0,0,6.283); ctx.fill();
        ctx.fillStyle='#f3e9d2'; ctx.fillRect(-4,-16,8,16);              // stem
        ctx.fillStyle='#e2402f'; ctx.beginPath(); ctx.ellipse(0,-16,13,9,0,Math.PI,0); ctx.fill(); // cap
        ctx.fillStyle='rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(-5,-19,2,0,6.283); ctx.arc(5,-18,1.6,0,6.283); ctx.arc(0,-22,1.8,0,6.283); ctx.fill();
        ctx.restore(); break;
      }
      case 'beehive': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0,-1,13,3,0,0,6.283); ctx.fill();
        const cols=['#caa23a','#e0b94a','#f2cf63'];
        for(let i=0;i<3;i++){ ctx.fillStyle=cols[i]; ctx.beginPath(); ctx.ellipse(0,-6-i*9,13-i*2.5,6,0,0,6.283); ctx.fill(); }
        ctx.fillStyle='#3a2a14'; ctx.beginPath(); ctx.ellipse(0,-7,3,4,0,0,6.283); ctx.fill(); // door
        ctx.fillStyle='#f2cf63'; ctx.beginPath(); ctx.arc(11,-26,2,0,6.283); ctx.fill();       // bee body
        ctx.fillStyle='#2a2a2a'; ctx.fillRect(10,-27,2,2);
        ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=0.8; ctx.beginPath(); ctx.ellipse(11,-28,3,1.5,0,0,6.283); ctx.stroke(); ctx.lineWidth=1;
        ctx.restore(); break;
      }
      case 'stalagmite': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        const g=ctx.createLinearGradient(0,-30,0,0); g.addColorStop(0,'#8b93a6'); g.addColorStop(1,'#4a5266');
        ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(-9,0); ctx.lineTo(-3,-30); ctx.lineTo(2,-22); ctx.lineTo(9,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(-3,-30); ctx.lineTo(-1,-12); ctx.lineTo(-5,0); ctx.lineTo(-9,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#5aa15a'; ctx.beginPath(); ctx.ellipse(-3,-29,3,1.6,0,0,6.283); ctx.fill(); // mossy tip
        ctx.restore(); break;
      }
      case 'glowmushroom': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.save(); ctx.globalCompositeOperation='lighter'; const gg=ctx.createRadialGradient(0,-14,0,0,-14,22);
        gg.addColorStop(0,'rgba(60,230,210,0.35)'); gg.addColorStop(1,'rgba(60,230,210,0)'); ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(0,-14,22,0,6.283); ctx.fill(); ctx.restore();
        const caps=[[-6,-12,5],[6,-15,6],[0,-20,5]];
        for(const[mx,my,r] of caps){ ctx.strokeStyle='#bfe9e0'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(mx,0); ctx.lineTo(mx,my+2); ctx.stroke();
          ctx.fillStyle='#3fe6cf'; ctx.beginPath(); ctx.ellipse(mx,my,r,r*0.7,0,Math.PI,0); ctx.fill();
          ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(mx-r*0.3,my-1,1,0,6.283); ctx.fill(); }
        ctx.lineWidth=1; ctx.restore(); break;
      }
      case 'chest': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0,-1,16,3,0,0,6.283); ctx.fill();
        ctx.fillStyle='#7a4a22'; ctx.fillRect(-14,-13,28,13);                 // base
        ctx.fillStyle='#8a5628'; ctx.beginPath(); ctx.moveTo(-14,-13); ctx.quadraticCurveTo(0,-25,14,-13); ctx.closePath(); ctx.fill(); // lid
        ctx.fillStyle='#e3b23a'; ctx.fillRect(-14,-7,28,2.5); ctx.fillRect(-2,-13,4,13); // bands
        ctx.fillStyle='#ffe08a'; ctx.fillRect(-3,-8,6,3);                      // lock
        ctx.fillStyle='#ffe66a'; ctx.beginPath(); ctx.arc(-7,-13,1.6,0,6.283); ctx.arc(6,-14,1.4,0,6.283); ctx.fill(); // coins glint
        ctx.restore(); break;
      }
      case 'tikitorch': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='#caa46a'; ctx.fillRect(-2.5,-26,5,26);                  // bamboo
        ctx.strokeStyle='rgba(90,60,30,0.5)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-2.5,-10); ctx.lineTo(2.5,-10); ctx.moveTo(-2.5,-18); ctx.lineTo(2.5,-18); ctx.stroke();
        ctx.save(); ctx.globalCompositeOperation='lighter'; const fg=ctx.createRadialGradient(0,-30,0,0,-30,12); fg.addColorStop(0,'rgba(255,180,60,0.5)'); fg.addColorStop(1,'rgba(255,180,60,0)'); ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(0,-30,12,0,6.283); ctx.fill(); ctx.restore();
        ctx.fillStyle='#ff8a2b'; ctx.beginPath(); ctx.moveTo(0,-38); ctx.quadraticCurveTo(5,-30,0,-26); ctx.quadraticCurveTo(-5,-30,0,-38); ctx.fill();
        ctx.fillStyle='#ffd54a'; ctx.beginPath(); ctx.moveTo(0,-35); ctx.quadraticCurveTo(2.5,-30,0,-27); ctx.quadraticCurveTo(-2.5,-30,0,-35); ctx.fill();
        ctx.lineWidth=1; ctx.restore(); break;
      }
      case 'cloudtuft': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='#ffffff';
        ctx.beginPath(); ctx.arc(-9,-8,7,0,6.283); ctx.arc(9,-8,7,0,6.283); ctx.arc(0,-13,9,0,6.283); ctx.fill();
        ctx.fillRect(-16,-9,32,9);
        ctx.fillStyle='rgba(200,215,230,0.6)'; ctx.beginPath(); ctx.ellipse(0,-1,16,3,0,0,Math.PI); ctx.fill();
        ctx.restore(); break;
      }
      case 'minilantern': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.save(); ctx.globalCompositeOperation='lighter'; const lg=ctx.createRadialGradient(0,-18,0,0,-18,16); lg.addColorStop(0,'rgba(255,200,90,0.4)'); lg.addColorStop(1,'rgba(255,200,90,0)'); ctx.fillStyle=lg; ctx.beginPath(); ctx.arc(0,-18,16,0,6.283); ctx.fill(); ctx.restore();
        ctx.fillStyle='#b5532a'; ctx.fillRect(-7,-26,14,2); ctx.fillRect(-7,-11,14,2);  // caps
        ctx.fillStyle='#ffcf5e'; ctx.beginPath(); ctx.ellipse(0,-18,7,8,0,0,6.283); ctx.fill(); // body glow
        ctx.fillStyle='#c2402f'; ctx.fillRect(-1,-10,2,5); ctx.fillStyle='#e0b050'; ctx.beginPath(); ctx.arc(0,-5,1.4,0,6.283); ctx.fill(); // tassel
        ctx.restore(); break;
      }
      case 'pinwheel': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.strokeStyle='#9a6a3a'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-22); ctx.stroke(); ctx.lineWidth=1;
        const spin=(CA.state.frame||0)*0.06 + x; ctx.translate(0,-24); ctx.rotate(spin);
        const bl=['#ff7e57','#ffd166','#ff7e57','#ffd166'];
        for(let i=0;i<4;i++){ ctx.fillStyle=bl[i]; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(9,-3); ctx.lineTo(3,-9); ctx.closePath(); ctx.fill(); ctx.rotate(Math.PI/2); }
        ctx.fillStyle='#5a3a1a'; ctx.beginPath(); ctx.arc(0,0,2,0,6.283); ctx.fill();
        ctx.restore(); break;
      }
      case 'minirocket': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0,-1,10,3,0,0,6.283); ctx.fill();
        ctx.fillStyle='#e8edf5'; ctx.beginPath(); ctx.moveTo(-7,0); ctx.lineTo(-7,-20); ctx.quadraticCurveTo(0,-34,7,-20); ctx.lineTo(7,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#e0556a'; ctx.beginPath(); ctx.moveTo(0,-34); ctx.quadraticCurveTo(5,-26,7,-20); ctx.lineTo(0,-22); ctx.closePath(); ctx.fill(); // nose tint
        ctx.fillStyle='#cf4458'; ctx.beginPath(); ctx.moveTo(-7,-2); ctx.lineTo(-13,4); ctx.lineTo(-7,-9); ctx.closePath(); ctx.moveTo(7,-2); ctx.lineTo(13,4); ctx.lineTo(7,-9); ctx.closePath(); ctx.fill(); // fins
        ctx.fillStyle='#7fd0ff'; ctx.beginPath(); ctx.arc(0,-16,3.2,0,6.283); ctx.fill(); ctx.strokeStyle='#9aa7b3'; ctx.lineWidth=1; ctx.stroke(); // window
        ctx.restore(); break;
      }
      case 'mooncrater': {
        const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0,-1,15,3,0,0,6.283); ctx.fill();
        ctx.fillStyle='#aeb6c4'; ctx.beginPath(); ctx.moveTo(-15,0); ctx.quadraticCurveTo(-16,-12,-4,-15); ctx.quadraticCurveTo(12,-17,15,-4); ctx.quadraticCurveTo(16,0,15,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#8b93a6'; for(const[cx,cy,r] of [[-5,-9,3.5],[5,-6,2.6],[2,-12,2]]){ ctx.beginPath(); ctx.ellipse(cx,cy,r,r*0.7,0,0,6.283); ctx.fill(); }
        ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-7,-13,5,2,-0.4,0,6.283); ctx.fill();
        ctx.restore(); break;
      }
      case 'tumbleweed': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0,-1,13,3,0,0,6.283); ctx.fill();
        ctx.fillStyle='#c8a86a'; ctx.beginPath(); ctx.arc(0,-13,12,0,6.283); ctx.fill();
        ctx.strokeStyle='#8a6a38'; ctx.lineWidth=1.4; for(let i=0;i<9;i++){ const a=i*0.7; ctx.beginPath(); ctx.moveTo(Math.cos(a)*11,-13+Math.sin(a)*11); ctx.lineTo(Math.cos(a+2)*11,-13+Math.sin(a+2)*11); ctx.stroke(); }
        ctx.lineWidth=1; ctx.restore(); break; }
      case 'cowskull': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.strokeStyle='#e8e2d0'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(-9,-10); ctx.quadraticCurveTo(-18,-16,-15,-4); ctx.moveTo(9,-10); ctx.quadraticCurveTo(18,-16,15,-4); ctx.stroke(); ctx.lineWidth=1;
        ctx.fillStyle='#f1ecdd'; ctx.beginPath(); ctx.moveTo(-9,-14); ctx.quadraticCurveTo(0,-20,9,-14); ctx.quadraticCurveTo(11,-4,0,0); ctx.quadraticCurveTo(-11,-4,-9,-14); ctx.fill();
        ctx.fillStyle='#3a3528'; ctx.beginPath(); ctx.ellipse(-4,-11,2,2.6,0,0,6.283); ctx.ellipse(4,-11,2,2.6,0,0,6.283); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(-2,-3); ctx.lineTo(2,-3); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
      case 'bigfern': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.strokeStyle='#2f7d35'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(-6,-22,-16,-34); ctx.stroke();
        ctx.fillStyle='#3f9a42'; for(let i=0;i<6;i++){ const t=i/6, px=-t*16, py=-t*34-2, ln=7-t*5; ctx.beginPath(); ctx.ellipse(px-ln*0.5,py,ln,2.4,-0.6,0,6.283); ctx.fill(); ctx.beginPath(); ctx.ellipse(px+ln*0.5,py+2,ln,2.4,0.6,0,6.283); ctx.fill(); }
        ctx.lineWidth=1; ctx.restore(); break; }
      case 'carnivflower': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.strokeStyle='#3a7d3a'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-14); ctx.stroke(); ctx.lineWidth=1;
        ctx.fillStyle='#4caf50'; ctx.beginPath(); ctx.ellipse(-5,-22,6,9,-0.5,0,6.283); ctx.ellipse(5,-22,6,9,0.5,0,6.283); ctx.fill();
        ctx.fillStyle='#e7567f'; ctx.beginPath(); ctx.ellipse(0,-22,5,7,0,0,6.283); ctx.fill();
        ctx.fillStyle='#fff'; for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.moveTo(i*2,-29); ctx.lineTo(i*2-1,-26); ctx.lineTo(i*2+1,-26); ctx.closePath(); ctx.fill(); }
        ctx.restore(); break; }
      case 'tikitotem': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='#8a5a2a'; ctx.fillRect(-9,-34,18,34);
        ctx.fillStyle='#6e4420'; ctx.fillRect(-9,-34,18,3); ctx.fillRect(-9,-18,18,2);
        ctx.fillStyle='#3a2410'; ctx.beginPath(); ctx.arc(-4,-27,2.2,0,6.283); ctx.arc(4,-27,2.2,0,6.283); ctx.fill();
        ctx.fillRect(-6,-23,12,2); ctx.fillRect(-7,-12,14,4); ctx.restore(); break; }
      case 'igloo': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='rgba(120,150,190,0.25)'; ctx.beginPath(); ctx.ellipse(0,-1,20,4,0,0,6.283); ctx.fill();
        ctx.fillStyle='#eef4fb'; ctx.beginPath(); ctx.ellipse(0,0,20,18,0,Math.PI,0); ctx.fill();
        ctx.strokeStyle='rgba(150,175,205,0.6)'; ctx.lineWidth=1; for(const r of [7,13]){ ctx.beginPath(); ctx.ellipse(0,0,r,r*0.9,0,Math.PI,0); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-13,-9); ctx.lineTo(-7,-15); ctx.moveTo(13,-9); ctx.lineTo(7,-15); ctx.stroke();
        ctx.fillStyle='#1f3550'; ctx.beginPath(); ctx.ellipse(0,0,6,9,0,Math.PI,0); ctx.fill(); ctx.lineWidth=1; ctx.restore(); break; }
      case 'penguin': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0,-1,9,2.6,0,0,6.283); ctx.fill();
        ctx.fillStyle='#f0a23a'; ctx.beginPath(); ctx.moveTo(-4,-1); ctx.lineTo(-7,1); ctx.lineTo(-2,1); ctx.closePath(); ctx.moveTo(4,-1); ctx.lineTo(7,1); ctx.lineTo(2,1); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#2a2f3a'; ctx.beginPath(); ctx.ellipse(0,-12,9,13,0,0,6.283); ctx.fill();
        ctx.fillStyle='#f4f7fb'; ctx.beginPath(); ctx.ellipse(0,-10,5.5,9,0,0,6.283); ctx.fill();
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-3,-18,1.6,0,6.283); ctx.arc(3,-18,1.6,0,6.283); ctx.fill();
        ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(-3,-18,0.9,0,6.283); ctx.arc(3,-18,0.9,0,6.283); ctx.fill();
        ctx.fillStyle='#f0a23a'; ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(-2,-14); ctx.lineTo(2,-14); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
      case 'lavabubble': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        const g=ctx.createRadialGradient(0,-3,1,0,-3,16); g.addColorStop(0,'#ffb347'); g.addColorStop(0.6,'#e8531a'); g.addColorStop(1,'#7a1d08');
        ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(0,-3,16,6,0,0,6.283); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.fillStyle='rgba(255,150,40,0.5)'; ctx.beginPath(); ctx.arc(2,-9,5,0,6.283); ctx.fill(); ctx.restore();
        ctx.fillStyle='#ffd9a0'; ctx.beginPath(); ctx.arc(0,-11,1.4,0,6.283); ctx.fill(); ctx.restore(); break; }
      case 'emberrock': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='#37323a'; ctx.beginPath(); ctx.moveTo(-13,0); ctx.quadraticCurveTo(-15,-13,-2,-15); ctx.quadraticCurveTo(13,-16,14,-3); ctx.quadraticCurveTo(15,0,13,0); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle='rgba(255,120,40,0.9)'; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(-6,-3); ctx.lineTo(-2,-9); ctx.lineTo(3,-5); ctx.moveTo(5,-11); ctx.lineTo(8,-6); ctx.stroke(); ctx.restore(); ctx.lineWidth=1; ctx.restore(); break; }
      case 'starfish': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y-6); ctx.scale(sc,sc); ctx.rotate((x|0)%6*0.2);
        ctx.fillStyle='#ff8a4c'; ctx.beginPath(); for(let i=0;i<10;i++){ const a=i/10*6.283-1.57, r=i%2?4:11; const px=Math.cos(a)*r, py=Math.sin(a)*r; if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); } ctx.closePath(); ctx.fill();
        ctx.fillStyle='#ffb98a'; for(let i=0;i<5;i++){ const a=i/5*6.283-1.57; ctx.beginPath(); ctx.arc(Math.cos(a)*5,Math.sin(a)*5,1.1,0,6.283); ctx.fill(); } ctx.restore(); break; }
      case 'cupcake': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='#caa07a'; ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(-7,-13); ctx.lineTo(7,-13); ctx.lineTo(10,0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle='rgba(120,80,50,0.4)'; ctx.lineWidth=1; for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.moveTo(i*4,0); ctx.lineTo(i*4,-12); ctx.stroke(); } ctx.lineWidth=1;
        ctx.fillStyle='#ffd1e3'; ctx.beginPath(); ctx.ellipse(0,-15,10,6,0,0,6.283); ctx.ellipse(-4,-20,6,5,0,0,6.283); ctx.ellipse(4,-21,6,5,0,0,6.283); ctx.ellipse(0,-24,5,5,0,0,6.283); ctx.fill();
        ctx.fillStyle='#e0457b'; ctx.beginPath(); ctx.arc(0,-29,2.4,0,6.283); ctx.fill(); ctx.strokeStyle='#7a3a1a'; ctx.beginPath(); ctx.moveTo(0,-31); ctx.lineTo(2,-35); ctx.stroke(); ctx.restore(); break; }
      case 'cryptlantern': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='#2a2630'; ctx.fillRect(-2,-22,4,22);
        ctx.save(); ctx.globalCompositeOperation='lighter'; const lg=ctx.createRadialGradient(0,-28,0,0,-28,14); lg.addColorStop(0,'rgba(120,255,150,0.45)'); lg.addColorStop(1,'rgba(120,255,150,0)'); ctx.fillStyle=lg; ctx.beginPath(); ctx.arc(0,-28,14,0,6.283); ctx.fill(); ctx.restore();
        ctx.fillStyle='#1d1a24'; ctx.fillRect(-6,-34,12,12); ctx.fillStyle='#7dffa0'; ctx.beginPath(); ctx.ellipse(0,-28,3,4,0,0,6.283); ctx.fill();
        ctx.fillStyle='#2a2630'; ctx.beginPath(); ctx.moveTo(-7,-34); ctx.lineTo(0,-40); ctx.lineTo(7,-34); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
      case 'cauldron': { const sc=p.scale||1; ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
        ctx.fillStyle='#1c1c22'; ctx.fillRect(-7,-3,3,3); ctx.fillRect(4,-3,3,3);
        ctx.fillStyle='#26262e'; ctx.beginPath(); ctx.arc(0,-13,12,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#14141a'; ctx.beginPath(); ctx.ellipse(0,-21,12,3.5,0,0,6.283); ctx.fill();
        ctx.fillStyle='#4fd06a'; ctx.beginPath(); ctx.ellipse(0,-21,10,3,0,0,6.283); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.fillStyle='rgba(90,230,120,0.5)'; for(const[bx,by,br] of [[-3,-24,2],[3,-26,2.6],[0,-28,1.6]]){ ctx.beginPath(); ctx.arc(bx,by,br,0,6.283); ctx.fill(); } ctx.restore();
        ctx.restore(); break; }
    }
  }

  /* ---------------------------------------------------------------------- */
  function applyTheme(theme){
    curTheme = (CA.Maps && CA.Maps.get) ? CA.Maps.get(theme)
             : (CA.Maps && CA.Maps[theme] && CA.Maps[theme].palette ? CA.Maps[theme] : CA.Maps.grass);
    pal = (curTheme && curTheme.palette) ? curTheme.palette : {
      dirt:'#7a5a30', dirtDark:'#4f3a1e', grass:'#6abf52', rock:'#8a8a8a',
      sky:['#5ea7d8','#8ec9ea','#d7efff'], hill1:'#bcd9b0', hill2:'#a3cf95',
      water:'rgba(64,150,200,0.55)'
    };
  }

  /* ---------------------------------------------------------------------- *
   * #9 DESTRUCTIBLE PROPS — when an explosion lands near a decorative prop,
   * the prop reacts (topples / bursts / chips) and emits a few themed
   * particles into CA.state.particles. Purely visual + satisfying. Barrels
   * keep their existing hazard chain-explode behaviour (handled separately).
   * ---------------------------------------------------------------------- */
  let _explosionWired = false;

  // push a particle matching fx.js's particle shape (rotating square for
  // 'dirt'/wood, fading circle otherwise). Respects the particle cap loosely.
  function emitParticle(p){
    const arr = CA.state && CA.state.particles;
    if (!arr) return;
    if (arr.length > 1100) arr.shift();
    arr.push(p);
  }

  // approximate "radius of influence" for a prop kind (how close a blast must
  // be to knock it down) — bigger props read as more solid.
  function propHitRadius(kind){
    switch(kind){
      case 'tree': return 30;
      case 'snowman': return 24;
      case 'pyramid': return 200;   // huge landmark — chips, never fully dies
      case 'volcano': return 150;
      case 'cactus': return 18;
      case 'palm': case 'pine': return 24;
      case 'deadtree': return 26;
      case 'tombstone': return 18;
      case 'pumpkin':   return 30;
      case 'crystal': case 'rockspire': return 18;
      case 'vine': return 14;
      case 'flower_patch': case 'mushroom': case 'glowmushroom': return 14;
      case 'beehive': case 'stalagmite': case 'tikitorch': case 'minilantern': case 'pinwheel': case 'minirocket': return 18;
      case 'chest': case 'mooncrater': case 'cloudtuft': return 16;
      case 'tumbleweed': case 'cowskull': case 'bigfern': case 'carnivflower': case 'starfish': case 'cupcake': return 14;
      case 'tikitotem': case 'igloo': case 'penguin': case 'cryptlantern': case 'cauldron': case 'lavabubble': case 'emberrock': return 18;
      case 'lollipop': case 'candycane': return 16;
      case 'umbrella': case 'sandcastle': return 20;
      default: return 20;
    }
  }
  // scale-aware wrapper: a méretezett (p.scale) propok találati sugara kövesse a
  // vizuális méretet — egy 1.8×-os tök ne 1.0×-os hitboxszal éljen túl (QA P2).
  function propHitRadiusOf(p){
    return propHitRadius(p.kind) * (p.scale || 1);
  }

  function spawnPropDebris(p, blastX, blastY){
    const x = p.x, y = p.y;
    const dirX = Math.sign(x - blastX) || (Math.random()<0.5?-1:1);
    switch(p.kind){
      case 'tree': {
        // a puff of leaves + a couple of wood splinters
        const leaf = ['#4fae3a','#6abf52','#8bd06a','#3f8f3a'];
        for (let i=0;i<10;i++){
          const a = U.rand(-Math.PI,0);
          emitParticle({ x:x+U.rand(-14,14), y:y-30+U.rand(-26,6),
            vx:Math.cos(a)*U.rand(1,3)+dirX*0.8, vy:Math.sin(a)*U.rand(1,3),
            life:U.rand(40,80), maxLife:80, size:U.rand(2,4), g:0.06,
            color:U.pick(leaf), kind:'dirt', rot:U.rand(0,7), spin:U.rand(-0.3,0.3) });
        }
        for (let i=0;i<5;i++){
          const a = U.rand(-Math.PI,0);
          emitParticle({ x, y:y-12, vx:Math.cos(a)*U.rand(2,5)+dirX, vy:Math.sin(a)*U.rand(2,5),
            life:U.rand(30,60), maxLife:60, size:U.rand(2,5), g:0.32,
            color:U.pick(['#7a5a36','#5e4427','#8b6a40']), kind:'dirt', rot:U.rand(0,7), spin:U.rand(-0.4,0.4) });
        }
        break;
      }
      case 'snowman': {
        for (let i=0;i<16;i++){
          const a = U.rand(0,Math.PI*2), sp=U.rand(1,5);
          emitParticle({ x:x+U.rand(-10,10), y:y-24+U.rand(-20,8),
            vx:Math.cos(a)*sp+dirX*0.6, vy:Math.sin(a)*sp-1.5,
            life:U.rand(34,70), maxLife:70, size:U.rand(2,4.5), g:0.12,
            color:U.pick(['#ffffff','#eaf2ff','#cfe0f2']), kind:'spark' });
        }
        // carrot + coal flecks for charm
        for (let i=0;i<3;i++){
          const a=U.rand(-Math.PI,0);
          emitParticle({ x, y:y-30, vx:Math.cos(a)*U.rand(2,4)+dirX, vy:Math.sin(a)*U.rand(2,4),
            life:U.rand(30,55), maxLife:55, size:U.rand(1.5,3), g:0.3,
            color:i?'#23272e':'#e8852a', kind:'dirt', rot:U.rand(0,7), spin:U.rand(-0.4,0.4) });
        }
        break;
      }
      case 'pyramid': case 'volcano': {
        // chip: a spray of sandy/rock dust, prop stays standing
        const col = p.kind==='volcano' ? ['#3a2724','#160d0c','#5a3a30'] : ['#d8c08a','#b89968','#c9ad78'];
        for (let i=0;i<8;i++){
          const a=U.rand(-Math.PI,0), sp=U.rand(2,5);
          emitParticle({ x:blastX+U.rand(-12,12), y:blastY+U.rand(-8,8),
            vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:U.rand(26,50), maxLife:50,
            size:U.rand(2,5), g:0.3, color:U.pick(col), kind:'dirt', rot:U.rand(0,7), spin:U.rand(-0.4,0.4) });
        }
        break;
      }
      default: {
        // generic prop (cactus/palm/pine/crystal/vine/rockspire): a small burst
        // of debris tinted to the prop's look.
        const tint = (p.kind==='crystal') ? ['#7fd0ff','#a98fff','#7fffd0']
                   : (p.kind==='cactus'||p.kind==='palm'||p.kind==='pine'||p.kind==='vine') ? ['#3f8f4a','#4fae3a','#2f7d4a']
                   : (p.kind==='tombstone') ? ['#8a8590','#6b6770','#a39ea8']
                   : (p.kind==='deadtree') ? ['#37302c','#4a4038','#2a2420']
                   : ['#5e4427','#33282a','#6b4f2e'];
        for (let i=0;i<8;i++){
          const a=U.rand(-Math.PI,0), sp=U.rand(1.5,4.5);
          emitParticle({ x:x+U.rand(-8,8), y:y-14+U.rand(-12,4),
            vx:Math.cos(a)*sp+dirX*0.5, vy:Math.sin(a)*sp,
            life:U.rand(28,56), maxLife:56, size:U.rand(2,4), g:0.26,
            color:U.pick(tint), kind:'dirt', rot:U.rand(0,7), spin:U.rand(-0.4,0.4) });
        }
        break;
      }
    }
  }

  function onExplosionHitProps(x, y, r){
    if (!curTheme || !curTheme.props) return;
    for (const p of curTheme.props){
      if (p._dead) continue;
      if (p.kind === 'barrel') continue;   // barrels keep their hazard behaviour
      const hit = propHitRadiusOf(p);
      // measure from the prop's footing; trees/snowmen toppled from the base
      const d = U.dist(p.x, p.y, x, y);
      if (d < r + hit){
        const chippable = (p.kind==='pyramid' || p.kind==='volcano');
        spawnPropDebris(p, x, y);
        if (chippable){
          // landmarks chip but survive; track chip count, "die" only after many
          p._chips = (p._chips||0) + 1;
          if (p._chips >= 6) p._dead = true;
        } else {
          p._dead = true;   // drawProp skips dead props (tree => gone/stump)
        }
      }
    }
  }

  CA.Terrain = {
    platforms,   // #10 live list (re-pointed each generate); also a public read
    platformDeltaX,
    init(ctx){
      mask = document.createElement('canvas');
      mask.width = W; mask.height = H;
      mctx = mask.getContext('2d', { willReadFrequently: true });
      painted = document.createElement('canvas');
      painted.width = W; painted.height = H;
      pctx = painted.getContext('2d');
      // indestructible bedrock mask (separate alpha layer, never carved)
      bmask = document.createElement('canvas');
      bmask.width = W; bmask.height = H;
      bctx = bmask.getContext('2d', { willReadFrequently: true });
      bImg = null;
      bpaint = document.createElement('canvas');
      bpaint.width = W; bpaint.height = H;
      bpctx = bpaint.getContext('2d');
      // #9 wire prop reactions to explosions (once)
      if (!_explosionWired && CA.events && CA.events.on){
        CA.events.on('explosion', (x,y,r)=>onExplosionHitProps(x,y,r));
        _explosionWired = true;
      }
    },

    generate(seed, theme){
      if (!mctx) this.init();
      curSeed = (seed == null ? (Math.random()*1e9|0) : seed) >>> 0 || 1;
      _texFullDone = false; _groundPat = null;   // rebuild texture pattern for this map
      let useTheme = theme != null ? theme : (CA.state.theme || 'grass');
      // #14 resolve a 'random' theme deterministically from the seed so the
      // same seed always yields the same theme + terrain.
      if (useTheme === 'random' && CA.Maps && CA.Maps.randomTheme){
        useTheme = CA.Maps.randomTheme(curSeed);
        if (CA.state) CA.state.theme = useTheme;   // lock it in for the match
      }
      applyTheme(useTheme);
      // CENTRAL per-theme world width (graveyard 3600, else 2400) — set HERE,
      // after the theme is final, so EVERY generate caller gets the right arena:
      // newGame, the map editor (which otherwise inherited whatever width the
      // previous match left behind), editor-map load, and random rolls (which
      // resolve to graveyard only at this point). Then resize the mask/painted/
      // bedrock canvases so terrain spans the FULL arena.
      try { C.WORLD_W = (useTheme === 'graveyard') ? 3600 : 2400; } catch(e){}
      W = C.WORLD_W; H = C.WORLD_H;
      if (mask.width !== W || mask.height !== H){
        mask.width = W; mask.height = H;
        painted.width = W; painted.height = H;
        bmask.width = W; bmask.height = H;
        bpaint.width = W; bpaint.height = H;
      }

      // ---- build SOLID shape via theme.gen() or built-in ----
      mctx.setTransform(1,0,0,1,0,0);
      mctx.clearRect(0,0,W,H);
      mctx.globalCompositeOperation = 'source-over';
      const rng = makeRng(curSeed);
      if (curTheme && typeof curTheme.gen === 'function'){
        curTheme.gen(mctx, W, H, rng);
        img = mctx.getImageData(0,0,W,H);
      } else {
        buildShapeBuiltin(curSeed);
        img = mctx.getImageData(0,0,W,H);
        // No theme gen() ran, so makeTheme's wrapper never (re)built props.
        // Synthesize a surface array from the freshly-built built-in shape and
        // let the theme place its props on the REAL ground (grass trees etc.).
        if (curTheme && typeof curTheme._buildProps === 'function'){
          // compute topmost-solid surface straight from img (ready=false here,
          // so heightAt() can't be used yet — read the mask alpha directly).
          const data = img.data;
          const surf = new Float32Array(W);
          for (let x=0; x<W; x++){
            let topY = H;
            for (let y=0; y<H; y++){
              if (data[(y*W + x)*4 + 3] > 128){ topY = y; break; }
            }
            surf[x] = topY;
          }
          curTheme.props = curTheme._buildProps(surf, W, rng) || [];
        }
      }

      // ---- INDESTRUCTIBLE BEDROCK: build the second (un-carvable) mask ----
      // Clear it, then let the theme place bedrock via its _buildBedrock hook
      // (a list of rects, in mask coords). Every map gets a thin floor so the
      // terrain can never be fully flattened / drilled through into the void.
      if (bctx){
        bctx.setTransform(1,0,0,1,0,0);
        bctx.clearRect(0,0,W,H);
        bctx.globalCompositeOperation = 'source-over';
        bctx.fillStyle = '#000';
        let rects = null;
        if (curTheme && typeof curTheme._buildBedrock === 'function'){
          try { rects = curTheme._buildBedrock(W, H, rng); } catch(e){ rects = null; }
        }
        if (!Array.isArray(rects)){
          // default: a solid floor strip WELL below the water line so the map
          // always has an unbreakable bottom (forts/units never fall to void).
          // +40 (nem +8!): a +8-as padlón egy beütött egység teste a vízfelszín
          // FÖLÖTT állt, így sosem fulladt meg — a maps.js bedrockFloor()-jával
          // azonos mélység (QA P1 defense-in-depth a _buildBedrock nélküli témákra).
          const fy = Math.min(H-8, (C.WATER_LEVEL|0) + 40);
          rects = [ { x:0, y:fy, w:W, h:H-fy } ];
        }
        for (const r of rects){
          if (!r) continue;
          bctx.fillRect(r.x|0, r.y|0, Math.max(1,r.w|0), Math.max(1,r.h|0));
        }
        bImg = bctx.getImageData(0,0,W,H);

        // pre-render the bedrock VERY SUBTLY (user: "ne legyen ilyen hirtelen
        // látható"). A low-opacity dark WASH over the dirt — no opaque slab, no
        // hard top edge — so bedrock is barely perceptible, not an abrupt band.
        if (bpctx){
          bpctx.setTransform(1,0,0,1,0,0);
          bpctx.clearRect(0,0,W,H);
          // translucent dark wash (just darkens the dirt a touch where unbreakable)
          bpctx.fillStyle = 'rgba(58,54,64,0.6)';   // visible slate (was rgba(26,18,8,0.42) → vanished on dark maps; Jani)
          bpctx.fillRect(0,0,W,H);
          // faint speckle for a hint of rock
          const brng = makeRng(curSeed ^ 0x9e3779b1);
          bpctx.fillStyle = 'rgba(0,0,0,0.16)';
          for (let i=0;i<((W*H)/4200|0);i++){
            bpctx.fillRect(brng()*W, brng()*H, 1+brng()*2, 1+brng()*2);
          }
          // clip to the bedrock shape (NO hard top edge — soft, gradual look)
          bpctx.globalCompositeOperation = 'destination-in';
          bpctx.drawImage(bmask, 0, 0);
          bpctx.globalCompositeOperation = 'source-over';
        }
      }

      // ---- paint the pretty layer once (cached) ----
      pctx.setTransform(1,0,0,1,0,0);
      pctx.clearRect(0,0,W,H);
      const TILE = 400;
      for (let ty=0; ty<H; ty+=TILE)
        for (let tx=0; tx<W; tx+=TILE)
          paintRect(tx, ty, TILE, TILE);
      ready = true;

      // ---- #10 moving platforms: clone from the theme (if any) so we keep a
      // live, per-game copy with phase/home set. Themes declare them via a
      // _buildPlatforms(W,H,rng) hook OR a static `platforms` array. ----
      platforms = [];
      if (curTheme){
        let defs = null;
        if (typeof curTheme._buildPlatforms === 'function'){
          try { defs = curTheme._buildPlatforms(W, H, rng); } catch(e){ defs = null; }
        } else if (Array.isArray(curTheme.platforms)){
          defs = curTheme.platforms;
        }
        if (Array.isArray(defs)){
          for (const d of defs){
            platforms.push({
              x0: d.x0, y0: d.y0, w: d.w||90, h: d.h||16,
              axis: d.axis||'x', range: d.range||160,
              speed: d.speed||0.012, phase: d.phase||0,
              color: d.color || '#7a8aa0', edge: d.edge || '#c8d4e4',
            });
          }
        }
      }
      CA.Terrain.platforms = platforms;

      // ---- register explosive barrel props as hazards (#4), guarded ----
      registerHazardProps();
    },

    // true if (x,y) is INDESTRUCTIBLE bedrock (subset of isSolid). Used by
    // weapons/AI that want to avoid wasting digging tools on un-carvable rock.
    isBedrock(x,y){
      if (!bImg) return false;
      x|=0; y|=0;
      if (x<0 || y<0 || x>=W || y>=H) return false;
      return bImg.data[(y*W + x)*4 + 3] > 128;
    },

    isSolid(x,y){
      if (!ready) return false;
      x|=0; y|=0;
      if (x<0 || y<0 || x>=W || y>=H) return false;
      if (img.data[(y*W + x)*4 + 3] > 128) return true;
      // indestructible bedrock counts as solid ground too
      if (bImg && bImg.data[(y*W + x)*4 + 3] > 128) return true;
      // #10 moving platforms also count as solid ground
      return platforms.length ? platformSolidAt(x, y) : false;
    },

    heightAt(x){
      if (!ready) return H;
      x|=0;
      if (x<0 || x>=W) return H;
      const data = img.data;
      let top = H;
      for (let y=0; y<H; y++){
        if (data[(y*W + x)*4 + 3] > 128){ top = y; break; }
      }
      // indestructible bedrock can be the topmost surface too (e.g. a platform)
      if (bImg){
        const bd = bImg.data;
        for (let y=0; y<top; y++){
          if (bd[(y*W + x)*4 + 3] > 128){ top = y; break; }
        }
      }
      // #10 a platform above the ground (smaller y) becomes the new surface
      if (platforms.length){
        const pt = platformTopAt(x);
        if (pt < top) top = pt;
      }
      return top;
    },

    destroy(x,y,r){
      if (!ready) return;
      r = Math.max(2, r);

      mctx.globalCompositeOperation = 'destination-out';
      // main disc
      mctx.beginPath(); mctx.arc(x, y, r, 0, Math.PI*2); mctx.fill();
      // IRREGULAR crater (Jani: "ne legyen olyan szabályos a kráter"): bite a few
      // smaller lobes around/past the rim so the edge is organic, not a clean
      // circle. Deterministic per (x,y,r) so a re-render is stable. Lobes reach
      // out to ~1.55×r → the dirty/refresh rect below is widened to match.
      var _seed = (((x|0)*73856093) ^ ((y|0)*19349663) ^ ((r|0)*83492791)) >>> 0;
      function _rnd(){ _seed = (_seed*1664525 + 1013904223) >>> 0; return _seed/4294967296; }
      var _lobes = 5 + (r>38 ? 3 : 0);
      for (var _li=0; _li<_lobes; _li++){
        var _a  = (_li/_lobes)*Math.PI*2 + _rnd()*0.9;
        var _lr = r*(0.26 + _rnd()*0.30);          // lobe radius
        var _ld = r*(0.62 + _rnd()*0.42);          // distance from centre (bites the rim)
        mctx.beginPath(); mctx.arc(x+Math.cos(_a)*_ld, y+Math.sin(_a)*_ld, _lr, 0, Math.PI*2); mctx.fill();
      }
      mctx.globalCompositeOperation = 'source-over';

      const pad = 6;
      const reach = r*1.62 + pad;                  // covers the outer lobes (max _ld+_lr ≈ r*1.60)
      const x0 = (x - reach), y0 = (y - reach);
      const w = (reach*2), h = (reach*2);

      refreshRect(x0, y0, w, h);
      paintRect(x0, y0, w, h);

      // scorched rim, clipped to the (new) mask via source-atop
      pctx.save();
      pctx.beginPath();
      pctx.arc(x, y, r+pad, 0, Math.PI*2);
      pctx.clip();
      pctx.globalCompositeOperation = 'source-atop';
      const rim = pctx.createRadialGradient(x, y, Math.max(1,r-10), x, y, r+2);
      rim.addColorStop(0,   'rgba(0,0,0,0)');
      rim.addColorStop(0.78,'rgba(20,12,6,0)');
      rim.addColorStop(0.92,'rgba(28,16,8,0.85)');
      rim.addColorStop(1.0, 'rgba(10,6,3,0.95)');
      pctx.fillStyle = rim;
      pctx.beginPath(); pctx.arc(x, y, r+2, 0, Math.PI*2); pctx.fill();
      pctx.fillStyle = 'rgba(120,55,20,0.18)';
      pctx.beginPath(); pctx.arc(x, y, r*0.9, 0, Math.PI*2); pctx.fill();
      pctx.globalCompositeOperation = 'source-over';
      pctx.restore();

      // mark barrels in the blast as dead so they stop rendering (hazards.js
      // handles the actual chain detonation via CA.Hazards).
      if (curTheme && curTheme.props){
        for (const p of curTheme.props){
          if (p.kind==='barrel' && !p._dead && U.dist(p.x, p.y-14, x, y) < r+18) p._dead = true;
        }
      }
    },

    collideCircle(x,y,r){
      if (!ready) return null;
      r = Math.max(1, r);
      let sx = 0, sy = 0, hits = 0;
      const steps = 16;
      for (let i=0;i<steps;i++){
        const a = (i/steps)*Math.PI*2;
        const px = x + Math.cos(a)*r;
        const py = y + Math.sin(a)*r;
        if (this.isSolid(px, py)){
          sx -= Math.cos(a);
          sy -= Math.sin(a);
          hits++;
        }
      }
      if (hits === 0){
        if (this.isSolid(x, y)) return { nx:0, ny:-1, depth:r };
        return null;
      }
      let nx = sx, ny = sy;
      const len = Math.hypot(nx, ny);
      if (len < 1e-4){ nx = 0; ny = -1; }
      else { nx /= len; ny /= len; }
      const depth = (hits / steps) * r;
      return { nx, ny, depth: Math.max(0.5, depth) };
    },

    /* ---- #2 editor hooks: mutate the MASK + refresh cache/painted ---- */
    paintSolid(x,y,r){
      if (!ready) return;
      r = Math.max(2, r||16);
      mctx.globalCompositeOperation = 'source-over';
      mctx.fillStyle = '#000';
      mctx.beginPath(); mctx.arc(x,y,r,0,Math.PI*2); mctx.fill();
      const pad=6, x0=x-r-pad, y0=y-r-pad, w=r*2+pad*2, h=r*2+pad*2;
      refreshRect(x0,y0,w,h);
      paintRect(x0,y0,w,h);
    },

    carve(x,y,r){
      // same as destroy() but no scorch rim (clean editor erase)
      if (!ready) return;
      r = Math.max(2, r||16);
      mctx.globalCompositeOperation = 'destination-out';
      mctx.beginPath(); mctx.arc(x,y,r,0,Math.PI*2); mctx.fill();
      mctx.globalCompositeOperation = 'source-over';
      const pad=6, x0=x-r-pad, y0=y-r-pad, w=r*2+pad*2, h=r*2+pad*2;
      refreshRect(x0,y0,w,h);
      paintRect(x0,y0,w,h);
    },

    clearAll(){
      if (!ready) return;
      mctx.setTransform(1,0,0,1,0,0);
      mctx.clearRect(0,0,W,H);
      img = mctx.getImageData(0,0,W,H);
      pctx.setTransform(1,0,0,1,0,0);
      pctx.clearRect(0,0,W,H);
    },

    /* add an indestructible bedrock RECT to the second mask at runtime (editor /
     * map hook). Refreshes the cached alpha + repaints that patch of the styled
     * bedrock layer so it shows immediately. destroy()/carve() can never remove it. */
    paintBedrock(x,y,w,h){
      if (!bctx) return;
      x|=0; y|=0; w=Math.max(1,w|0); h=Math.max(1,h|0);
      bctx.globalCompositeOperation = 'source-over';
      bctx.fillStyle = '#000';
      bctx.fillRect(x,y,w,h);
      bImg = bctx.getImageData(0,0,W,H);
      if (bpctx){
        bpctx.save();
        bpctx.fillStyle = '#5b6470';                 // visible steel-slate (was #26242b → invisible on dark maps; Jani)
        bpctx.fillRect(x,y,w,h);
        bpctx.globalAlpha = 0.45; bpctx.strokeStyle = '#ffd24a'; bpctx.lineWidth = 7;
        bpctx.beginPath(); bpctx.rect(x,y,w,h); bpctx.clip();
        for (let d=x-h; d<x+w+h; d+=22){ bpctx.beginPath(); bpctx.moveTo(d,y); bpctx.lineTo(d-h,y+h); bpctx.stroke(); }
        bpctx.restore();
        bpctx.save(); bpctx.fillStyle='rgba(230,200,90,0.85)'; bpctx.fillRect(x,y,w,2); bpctx.restore();
      }
    },

    render(ctx){
      if (!ready) return;
      // if the ground texture finished loading AFTER the initial (untextured)
      // paint, repaint the whole world ONCE so the texture appears everywhere.
      if (!_texFullDone && groundPattern()){
        try { paintRect(0, 0, W, H); } catch(e){}
        _texFullDone = true;
      }
      // camera already applied by core; blit the cached painted world.
      ctx.drawImage(painted, 0, 0);
      // indestructible bedrock on top of the destructible dirt (it survives
      // craters, so drawing it over the painted layer keeps it visible).
      if (bpaint) ctx.drawImage(bpaint, 0, 0);
      // #10 moving platforms — drawn over terrain in world space, animated.
      if (platforms.length){
        for (const pl of platforms){
          const p = platformPos(pl);
          // shadow / underside
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(p.x, p.y + pl.h - 3, pl.w, 4);
          // metal body
          const g = ctx.createLinearGradient(0, p.y, 0, p.y + pl.h);
          g.addColorStop(0, pl.edge);
          g.addColorStop(0.18, pl.color);
          g.addColorStop(1, '#3c4656');
          ctx.fillStyle = g;
          ctx.fillRect(p.x, p.y, pl.w, pl.h);
          // top lip highlight + rivets
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(p.x, p.y, pl.w, 2);
          ctx.fillStyle = 'rgba(20,28,40,0.6)';
          const rivets = Math.max(2, (pl.w/26)|0);
          for (let i=0;i<rivets;i++){
            const rx = p.x + 6 + i*((pl.w-12)/(rivets-1||1));
            ctx.beginPath(); ctx.arc(rx, p.y + pl.h*0.5, 1.6, 0, Math.PI*2); ctx.fill();
          }
          // hazard stripe so the moving lift reads clearly
          ctx.save();
          ctx.beginPath(); ctx.rect(p.x, p.y+pl.h-5, pl.w, 4); ctx.clip();
          ctx.fillStyle = '#e7c84a';
          ctx.fillRect(p.x, p.y+pl.h-5, pl.w, 4);
          ctx.fillStyle = '#23272e';
          for (let sx = p.x - pl.h; sx < p.x + pl.w; sx += 12){
            ctx.beginPath();
            ctx.moveTo(sx, p.y+pl.h-1); ctx.lineTo(sx+6, p.y+pl.h-1);
            ctx.lineTo(sx+12, p.y+pl.h-5); ctx.lineTo(sx+6, p.y+pl.h-5);
            ctx.closePath(); ctx.fill();
          }
          ctx.restore();
        }
      }
      // decorative props on top (cheap; world-space)
      if (curTheme && curTheme.props && curTheme.props.length){
        for (const p of curTheme.props) drawProp(ctx, p);
      }
      // editor-placed props (#2): drawn while editing AND when a saved custom
      // map is loaded into a real game. Guarded so it's a no-op normally.
      const ed = CA.Maps && CA.Maps.editor;
      if (ed && ed.placedProps && ed.placedProps.length){
        for (const p of ed.placedProps) drawProp(ctx, p);
      }
    },
  };
})();
