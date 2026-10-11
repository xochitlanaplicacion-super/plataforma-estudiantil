/* ============================================================================
 * CUTE ANIMALS — maps.js  ::  CA.Maps — map THEMES + level EDITOR  (Agent World)
 * ----------------------------------------------------------------------------
 * Feature #1 (tematikus pályák), #2 (pályaszerkesztő), supports #26 (daytime).
 *
 * CA.Maps is a registry of theme objects. terrain.js reads the ACTIVE theme
 * (CA.state.theme) to generate + paint terrain; fx.js reads the palette for the
 * sky/parallax/water. Provide AT LEAST these themes, each visually distinct:
 *   'grass'  (default, current look), 'desert', 'snow', 'jungle', 'cave',
 *   'islands' (archipelago), 'volcano'.
 *
 * Each theme: {
 *   id, name, emoji, daytime:'day'|'dusk'|'night',
 *   palette:{ sky:[ '#top','#mid','#bottom' ], hill1, hill2, dirt, dirtDark,
 *             grass, rock, water:'rgba(...)' },
 *   gen(mctx, W, H, rng) -> draws the SOLID shape (alpha) into mctx, like the
 *       current terrain.buildShape but themed (dunes for desert, jagged for
 *       volcano, lots of floating chunks for islands, big caverns for cave...).
 *   props:[ {kind,x,y,...} ]  // optional decorative/interactive props (#4 lives
 *       mostly in hazards/terrain; here just visual: cactus, palm, crystals...)
 * }
 *
 * EDITOR (#2): implement CA.Maps.editor with a simple paint model the UI can
 * drive: beginEdit(), paint(x,y,r,solid:bool), save(name)->localStorage,
 * load(name), list(). The UI (Agent Shell, wave 2) will provide the screen and
 * call these; expose them now so they can wire in.
 *
 * Keep `CA.Maps.list()` returning theme ids (already stubbed in contract).
 * Do NOT break the existing default — terrain falls back to its built-in gen if
 * a theme has no gen().
 * ==========================================================================*/
(function(){
  const C = CA.config;
  const U = CA.util;

  /* EN translations for the theme display names (ui.js wraps name with CA.t). */
  CA.i18n.addEN({
    'Mező':'Meadow', 'Sivatag':'Desert', 'Hómező':'Snow', 'Dzsungel':'Jungle',
    'Barlang':'Cave', 'Szigetek':'Islands', 'Vulkán':'Volcano',
    'Űrállomás':'Space', 'Temető':'Graveyard',
    'Ég':'Sky', 'Strand':'Beach', 'Cukorország':'Candy Land',
  });

  /* ------------------------------------------------------------------ *
   * Shared SOLID-shape helpers (used by theme gen()s). These draw the
   * destructible MASK alpha; terrain.js then paints it with the palette.
   * mctx is already cleared + source-over by terrain before gen() runs.
   * ------------------------------------------------------------------ */

  function noise1D(rng, n){
    const g = new Float32Array(n);
    for (let i=0;i<n;i++) g[i] = rng()*2-1;
    return function(t){
      const x = t*n;
      const i0 = Math.floor(x)%n, i1=(i0+1)%n;
      const f = x-Math.floor(x), s=f*f*(3-2*f);
      return g[i0]*(1-s)+g[i1]*s;
    };
  }

  /* fill a solid body under a surface line described by octaves; returns the
   * smoothed surface Float32Array so gen() can place props on it. */
  function fillSurface(mctx, W, H, rng, opts){
    opts = opts || {};
    const baseline = opts.baseline != null ? opts.baseline : (C.WATER_LEVEL - 120);
    const oct = opts.oct || [
      { n: noise1D(rng,6),  amp:150 },
      { n: noise1D(rng,14), amp:70 },
      { n: noise1D(rng,34), amp:30 },
      { n: noise1D(rng,80), amp:12 },
    ];
    const edgeLift = opts.edgeLift != null ? opts.edgeLift : 130;
    const surf = new Float32Array(W);
    for (let x=0;x<W;x++){
      const t=x/W; let y=baseline;
      for (const o of oct) y += o.n(t)*o.amp;
      const edge = Math.min(x, W-1-x)/260;
      if (edge<1) y -= (1-edge)*(1-edge)*edgeLift;
      surf[x] = U.clamp(y, 120, H-40);
    }
    const sm = new Float32Array(W); const R=4;
    for (let x=0;x<W;x++){
      let acc=0,cnt=0;
      for (let k=-R;k<=R;k++){ const xi=x+k; if(xi>=0&&xi<W){acc+=surf[xi];cnt++;} }
      sm[x]=acc/cnt;
    }
    mctx.fillStyle='#000';
    mctx.beginPath();
    mctx.moveTo(0,H);
    for (let x=0;x<W;x++) mctx.lineTo(x,sm[x]);
    mctx.lineTo(W,H); mctx.closePath(); mctx.fill();
    return sm;
  }

  function blob(mctx, cx, cy, rw, rh, rng){
    mctx.fillStyle='#000';
    mctx.beginPath();
    const pts=14;
    for (let i=0;i<=pts;i++){
      const a=(i/pts)*Math.PI*2;
      const jit=0.78+rng()*0.32;
      const yScale = Math.sin(a)>0 ? 1.15 : 0.85;
      const px=cx+Math.cos(a)*rw*jit;
      const py=cy+Math.sin(a)*rh*jit*yScale;
      if (i===0) mctx.moveTo(px,py); else mctx.lineTo(px,py);
    }
    mctx.closePath(); mctx.fill();
  }

  function carve(mctx, cx, cy, rw, rh){
    mctx.globalCompositeOperation='destination-out';
    mctx.beginPath(); mctx.ellipse(cx,cy,rw,rh,0,0,Math.PI*2); mctx.fill();
    mctx.globalCompositeOperation='source-over';
  }

  /* Scan the ALREADY-drawn mask alpha and return the true topmost-solid y per
   * column (or H if the column is empty). Mirrors terrain.js's built-in-theme
   * surface synthesis so props placed on this surface sit ON the real ground
   * instead of on an approximate (and often too-high → floating) estimate.
   * Cheap: runs once at map generation, not per frame. */
  function readSurface(mctx, W, H){
    const surf = new Float32Array(W).fill(H);
    let data;
    try { data = mctx.getImageData(0,0,W,H).data; }
    catch(e){ return surf; }            // tainted/unsupported → caller's fallback
    for (let x=0;x<W;x++){
      for (let y=0;y<H;y++){
        if (data[(y*W + x)*4 + 3] > 128){ surf[x]=y; break; }
      }
    }
    return surf;
  }

  /* ------------------------------------------------------------------ *
   * THEME GENERATORS
   * ------------------------------------------------------------------ */

  // gentle desert dunes: smoother, rounder surface + a couple of mesa chunks
  function genDesert(mctx, W, H, rng){
    const sm = fillSurface(mctx, W, H, rng, {
      baseline: C.WATER_LEVEL - 130,
      oct: [ { n:noise1D(rng,5), amp:120 }, { n:noise1D(rng,11), amp:55 }, { n:noise1D(rng,26), amp:18 } ],
      edgeLift: 110,
    });
    // a flat-topped mesa or two
    const mesas = 1 + Math.floor(rng()*2);
    for (let i=0;i<mesas;i++){
      const cx = W*(0.2+rng()*0.6);
      const top = sm[U.clamp(cx|0,0,W-1)] - (90+rng()*90);
      const hw = 80+rng()*120;
      mctx.fillStyle='#000';
      mctx.beginPath();
      mctx.moveTo(cx-hw, sm[U.clamp(cx|0,0,W-1)]);
      mctx.lineTo(cx-hw*0.7, top);
      mctx.lineTo(cx+hw*0.7, top);
      mctx.lineTo(cx+hw, sm[U.clamp((cx+hw)|0,0,W-1)]||H);
      mctx.closePath(); mctx.fill();
    }
    return sm;
  }

  // snow: same rolling base (drifts handled in palette/paint), a few drifts as bumps
  function genSnow(mctx, W, H, rng){
    const sm = fillSurface(mctx, W, H, rng, {
      baseline: C.WATER_LEVEL - 120,
      oct: [ { n:noise1D(rng,6), amp:140 }, { n:noise1D(rng,13), amp:60 }, { n:noise1D(rng,30), amp:24 }, { n:noise1D(rng,70), amp:9 } ],
    });
    // soft drift mounds on the surface
    const drifts = 3 + Math.floor(rng()*4);
    for (let i=0;i<drifts;i++){
      const cx = W*(0.1+rng()*0.8);
      const sy = sm[U.clamp(cx|0,0,W-1)];
      blob(mctx, cx, sy+8, 40+rng()*70, 20+rng()*20, rng);
    }
    return sm;
  }

  // jungle: lush layered hills + a couple floating mossy chunks
  function genJungle(mctx, W, H, rng){
    const sm = fillSurface(mctx, W, H, rng);
    const isl = 2 + Math.floor(rng()*2);
    for (let i=0;i<isl;i++){
      const cx=W*(0.15+rng()*0.7);
      const sh=sm[U.clamp(cx|0,0,W-1)];
      const cy=U.clamp(sh-(150+rng()*180),150,sh-90);
      blob(mctx, cx, cy, 80+rng()*110, 30+rng()*40, rng);
    }
    // a few overhang caves
    mctx.globalCompositeOperation='destination-out';
    for (let i=0;i<3;i++){
      const cx=W*(0.1+rng()*0.8);
      const sh=sm[U.clamp(cx|0,0,W-1)];
      mctx.beginPath(); mctx.ellipse(cx, sh+70+rng()*120, 50+rng()*70, 30+rng()*40, 0,0,Math.PI*2); mctx.fill();
    }
    mctx.globalCompositeOperation='source-over';
    return sm;
  }

  // cave: nearly-full solid block with big carved caverns -> enclosed underground
  // interior floor spots recorded while carving the cave so props (crystals,
  // stalagmites, glow-mushrooms) can be placed INSIDE the caverns/gallery, not
  // just on the top ceiling surface (Jani: "a CAVE-ba is rakjon ne csak felülre").
  let _caveSpots = [];
  function genCave(mctx, W, H, rng){
    _caveSpots = [];
    const cand = [];   // spot CANDIDATES — validated against the FINAL mask below
    // fill almost everything solid (leave a comfortable sky strip / headroom
    // at the very top so the map doesn't feel cramped — visible air above play)
    const ceil = 200 + rng()*60;
    mctx.fillStyle='#000';
    mctx.fillRect(0, ceil, W, H-ceil);
    // big caverns carved out
    mctx.globalCompositeOperation='destination-out';
    const caverns = 5 + Math.floor(rng()*4);
    for (let i=0;i<caverns;i++){
      const cx = W*(0.08+rng()*0.84);
      const cy = ceil + 120 + rng()*(H-ceil-300);
      const rw = 120+rng()*200;
      const rh = 80+rng()*150;
      mctx.beginPath(); mctx.ellipse(cx,cy,rw,rh,0,0,Math.PI*2); mctx.fill();
      // cavern floor candidates (centre + spread); exact y resolved post-carve
      cand.push({ x: cx, y: cy });
      cand.push({ x: U.clamp(cx - rw*0.45, 20, W-20), y: cy });
      cand.push({ x: U.clamp(cx + rw*0.45, 20, W-20), y: cy });
    }
    // a connecting horizontal gallery so the caverns link up & units can move
    const gy = ceil + 200 + rng()*150;
    const grh = 70+rng()*40;
    mctx.beginPath();
    mctx.ellipse(W*0.5, gy, W*0.42, grh, 0, 0, Math.PI*2); mctx.fill();
    mctx.globalCompositeOperation='source-over';
    // gallery floor candidates spread along its length
    for (let k=0;k<5;k++){
      cand.push({ x: W*(0.14 + k*0.18), y: gy });
    }
    // a few stalagmite pillars from the floor for footing
    const pillars = 3 + Math.floor(rng()*3);
    mctx.fillStyle='#000';
    for (let i=0;i<pillars;i++){
      const px=W*(0.12+rng()*0.76);
      const pw=24+rng()*40;
      const ptop = gy+20+rng()*60;
      mctx.beginPath();
      mctx.moveTo(px-pw, H);
      mctx.lineTo(px, ptop);
      mctx.lineTo(px+pw, H);
      mctx.closePath(); mctx.fill();
      // pillar apex is solid footing → probe from just above the apex
      cand.push({ x: px, y: ptop - 8 });
    }
    // VALIDATE the candidates against the FINAL mask (after ALL carving + pillar
    // fill): later carves could remove a floor (prop floats) and pillar fill
    // could entomb a spot (prop buried) — QA-audit P2. For each candidate walk
    // up out of any solid, then down to the first solid pixel = real floor.
    // Drop spots under the waterline (no underwater glowmushrooms) — QA P2.
    try {
      const data = mctx.getImageData(0,0,W,H).data;
      const solid = (x,y)=> (x>=0 && x<W && y>=0 && y<H) && data[((y|0)*W + (x|0))*4 + 3] > 128;
      const wl = (C.WATER_LEVEL|0) - 8;
      for (const s of cand){
        const x = U.clamp(s.x|0, 1, W-2);
        let y = U.clamp(s.y|0, ceil|0, H-2);
        let guard = 0;
        while (solid(x,y) && y > ceil && guard++ < H) y--;      // climb into air
        if (solid(x,y)) continue;                                // fully buried → drop
        guard = 0;
        while (!solid(x,y+1) && y < H-2 && guard++ < H) y++;     // descend to floor
        if (!solid(x,y+1)) continue;                             // no floor → drop
        if (y > wl) continue;                                    // underwater → drop
        _caveSpots.push({ x: s.x, y: y });
      }
    } catch(e){ /* tainted canvas → no interior props this round (top props remain) */ }
    // synthesize a "surface" array (topmost solid) for prop placement; use the
    // REAL mask tops so top-surface props can't float over carved-through crust.
    const real = readSurface(mctx, W, H);
    const sm = new Float32Array(W);
    for (let x=0;x<W;x++) sm[x] = (real[x] < H) ? real[x] : ceil;
    return sm;
  }
  // place n props on recorded interior cave floor spots — sampled WITHOUT
  // replacement (consumes the spot pool) so two props never stack on the
  // exact same pixel; falls back to reuse only when the pool runs dry.
  function scatterCaveInterior(kind, rng, n, jitterY){
    const props=[];
    for (let i=0;i<n;i++){
      if (!_caveSpots.length) break;
      const idx = (rng()*_caveSpots.length)|0;
      const s = _caveSpots.splice(idx,1)[0];
      props.push({ kind, x: s.x, y: s.y + (jitterY||0) });
    }
    return props;
  }

  // islands: many floating chunks over open ocean, low/no main landmass
  function genIslands(mctx, W, H, rng){
    const count = 6 + Math.floor(rng()*5);
    // approximate surface (per-column ellipse top) — used only as a FALLBACK if
    // the real mask readback below is unavailable (e.g. tainted canvas).
    const approx = new Float32Array(W).fill(H);
    for (let i=0;i<count;i++){
      const cx = W*(0.06 + rng()*0.88);
      const cy = U.clamp(C.WATER_LEVEL - 120 - rng()*360, 180, C.WATER_LEVEL-100);
      const rw = 70 + rng()*120;
      const rh = 26 + rng()*36;
      blob(mctx, cx, cy, rw, rh, rng);
      // per-column ellipse top (not a flat line) so the fallback also tracks the
      // rounded chunk surface rather than floating a flat strip above it.
      const x0 = Math.max(0,(cx-rw)|0), x1 = Math.min(W,(cx+rw)|0);
      for (let x=x0; x<x1; x++){
        const dx = (x - cx)/rw;
        const k = 1 - dx*dx;
        if (k <= 0) continue;
        const top = cy - rh*0.85*Math.sqrt(k);  // top half uses 0.85 yScale (see blob)
        if (top < approx[x]) approx[x]=top;
      }
    }
    // Read the TRUE topmost-solid surface from the freshly-drawn mask so props
    // (palms) sit ON each island's actual rounded top, not above it (Jani: a fák
    // lebegtek). Fall back to the per-column ellipse estimate if readback fails.
    const real = readSurface(mctx, W, H);
    const surf = new Float32Array(W);
    for (let x=0;x<W;x++) surf[x] = (real[x] < H) ? real[x] : approx[x];
    return surf;
  }

  // volcano: jagged black rock peaks with a central crater & lava pocket feel
  function genVolcano(mctx, W, H, rng){
    const baseline = C.WATER_LEVEL - 140;
    // jagged surface: high-frequency sharp octaves
    const oct = [
      { n:noise1D(rng,7),  amp:170 },
      { n:noise1D(rng,20), amp:90 },
      { n:noise1D(rng,55), amp:50 },
      { n:noise1D(rng,120),amp:24 },
    ];
    const surf = new Float32Array(W);
    for (let x=0;x<W;x++){
      const t=x/W; let y=baseline;
      for (const o of oct) y += o.n(t)*o.amp;
      // central volcano peak
      const dc = Math.abs(x - W*0.5)/(W*0.5);
      y -= (1-dc)*(1-dc)*220;
      const edge=Math.min(x,W-1-x)/260;
      if (edge<1) y -= (1-edge)*(1-edge)*120;
      surf[x] = U.clamp(y, 120, H-40);
    }
    // sharpen: minimal smoothing to keep jagged
    mctx.fillStyle='#000';
    mctx.beginPath(); mctx.moveTo(0,H);
    for (let x=0;x<W;x++) mctx.lineTo(x,surf[x]);
    mctx.lineTo(W,H); mctx.closePath(); mctx.fill();
    // carve a summit crater near center
    const cx = W*0.5, cyTop = surf[(W*0.5)|0];
    carve(mctx, cx, cyTop+50, 90+rng()*40, 60+rng()*30);
    return surf;
  }

  // city: a skyline of blocky flat-topped buildings (rooftops = the terrain),
  // with gaps (alleys/streets) between some of them. Dusk palette in theme.
  function genCity(mctx, W, H, rng){
    const surf = new Float32Array(W).fill(H);
    let x = 0;
    const groundY = H - 60;        // street level (thin solid base under it all)
    // thin connecting ground so units that fall between buildings still land
    mctx.fillStyle = '#000';
    mctx.fillRect(0, groundY, W, H - groundY);
    for (let i=0;i<W;i++) surf[i] = groundY;
    while (x < W){
      const bw = 90 + rng()*150;                 // building width
      const top = U.clamp(groundY - (120 + rng()*430), 150, groundY - 80);
      // building body
      mctx.fillStyle = '#000';
      mctx.fillRect(x, top, bw, groundY - top);
      // small rooftop fixtures (a setback box / antenna base) for silhouette
      if (rng() < 0.6){
        const fw = 18 + rng()*40, fh = 16 + rng()*30;
        const fx = x + rng()*(bw - fw);
        mctx.fillRect(fx, top - fh, fw, fh);
        for (let xi=Math.max(0,fx|0); xi<Math.min(W,(fx+fw)|0); xi++) surf[xi] = top - fh;
      }
      for (let xi=Math.max(0,x|0); xi<Math.min(W,(x+bw)|0); xi++)
        if (top < surf[xi]) surf[xi] = top;
      // a street gap before the next building (sometimes)
      const gap = rng() < 0.55 ? (24 + rng()*70) : 0;
      x += bw + gap;
    }
    return surf;
  }

  // space station: a dark starfield (palette) with a set of floating metal
  // platforms (slabs) — no big landmass, very "floaty". Low-gravity is a
  // nice-to-have handled by layout only (we can't change gravity from here).
  function genSpace(mctx, W, H, rng){
    const surf = new Float32Array(W).fill(H);
    const slabs = 7 + Math.floor(rng()*5);
    for (let i=0;i<slabs;i++){
      const sw = 110 + rng()*200;
      const sh = 26 + rng()*30;
      const sx = W*(0.04 + rng()*0.9) - sw*0.5;
      const sy = U.clamp(180 + rng()*(H-460), 150, H-220);
      // rounded-rect metal slab
      mctx.fillStyle = '#000';
      const r = Math.min(14, sh*0.5);
      mctx.beginPath();
      mctx.moveTo(sx+r, sy);
      mctx.lineTo(sx+sw-r, sy);
      mctx.quadraticCurveTo(sx+sw, sy, sx+sw, sy+r);
      mctx.lineTo(sx+sw, sy+sh-r);
      mctx.quadraticCurveTo(sx+sw, sy+sh, sx+sw-r, sy+sh);
      mctx.lineTo(sx+r, sy+sh);
      mctx.quadraticCurveTo(sx, sy+sh, sx, sy+sh-r);
      mctx.lineTo(sx, sy+r);
      mctx.quadraticCurveTo(sx, sy, sx+r, sy);
      mctx.closePath(); mctx.fill();
      for (let xi=Math.max(0,sx|0); xi<Math.min(W,(sx+sw)|0); xi++)
        if (sy < surf[xi]) surf[xi] = sy;
    }
    // a couple of small docking pads low down so dropped units have footing
    for (let i=0;i<2;i++){
      const sw = 160 + rng()*120, sx = W*(0.15 + i*0.5) - sw*0.5, sy = H-150;
      mctx.fillStyle = '#000';
      mctx.fillRect(sx, sy, sw, 22);
      for (let xi=Math.max(0,sx|0); xi<Math.min(W,(sx+sw)|0); xi++)
        if (sy < surf[xi]) surf[xi] = sy;
    }
    return surf;
  }

  // SKY ('Ég'): NO ground at all — a set of FIXED floating platforms at varied
  // heights that units fight across. Falling off drops you into the haze far
  // below (the bedrock floor / water plane = death). Clouds + planes drift in the
  // background automatically (the day cloud-band + the sky-objects system).
  function genSky(mctx, W, H, rng){
    const surf = new Float32Array(W).fill(H);   // H everywhere => "no ground"
    function slab(sx, sy, sw, sh){
      sx = Math.max(0, sx);
      const r = Math.min(16, sh*0.5);
      mctx.fillStyle = '#000';
      mctx.beginPath();
      mctx.moveTo(sx+r, sy);
      mctx.lineTo(sx+sw-r, sy);
      mctx.quadraticCurveTo(sx+sw, sy, sx+sw, sy+r);
      mctx.lineTo(sx+sw, sy+sh-r);
      mctx.quadraticCurveTo(sx+sw, sy+sh, sx+sw-r, sy+sh);
      mctx.lineTo(sx+r, sy+sh);
      mctx.quadraticCurveTo(sx, sy+sh, sx, sy+sh-r);
      mctx.lineTo(sx, sy+r);
      mctx.quadraticCurveTo(sx, sy, sx+r, sy);
      mctx.closePath(); mctx.fill();
      for (let xi=Math.max(0,sx|0); xi<Math.min(W,(sx+sw)|0); xi++)
        if (sy < surf[xi]) surf[xi] = sy;
    }
    // two big TEAM platforms (left + right) at a comfortable mid height so each
    // side has a reliable spawn footing, then a scatter of stepping platforms.
    const baseY = U.clamp(H*0.55, 240, H-220);
    const tw = 230;
    slab(W*0.05, baseY, tw, 30);
    slab(W*0.95 - tw, baseY, tw, 30);
    const extra = 5 + Math.floor(rng()*4);
    for (let i=0;i<extra;i++){
      const sw = 90 + rng()*150;
      const sx = W*(0.14 + rng()*0.72) - sw*0.5;
      const sy = U.clamp(150 + rng()*(H-360), 140, H-250);
      slab(sx, sy, sw, 22 + rng()*16);
    }
    return surf;
  }

  // graveyard: gently rolling cold earth (like grass but lower/flatter so the
  // tombstones read), with a couple of low burial-mound bumps. Spooky palette in
  // the theme; props add tombstones / dead trees / crypt below.
  function genGraveyard(mctx, W, H, rng){
    // graveyard is 1.5x wider (3600) so the old amplitudes read FLAT across it.
    // Bump the LOW-frequency octaves for bigger, gentle ROLLING hills ("lankás")
    // — more height variation without going jagged (high-freq octaves stay low).
    const sm = fillSurface(mctx, W, H, rng, {
      baseline: C.WATER_LEVEL - 140,
      oct: [ { n:noise1D(rng,6), amp:170 }, { n:noise1D(rng,13), amp:78 }, { n:noise1D(rng,28), amp:24 }, { n:noise1D(rng,64), amp:9 } ],
      edgeLift: 120,
    });
    // a few low grave-mound bumps on the surface (rounded, like the snow drifts)
    const mounds = 3 + Math.floor(rng()*3);
    for (let i=0;i<mounds;i++){
      const cx = W*(0.1+rng()*0.8);
      const sy = sm[U.clamp(cx|0,0,W-1)];
      blob(mctx, cx, sy+6, 34+rng()*48, 14+rng()*14, rng);
    }
    return sm;
  }

  /* ------------------------------------------------------------------ *
   * PROP placement helpers (decorative; barrels also become hazards)
   * ------------------------------------------------------------------ */
  function scatterProps(kind, surf, W, rng, n, jitterY, opts){
    const props=[];
    const H = C.WORLD_H;
    for (let i=0;i<n;i++){
      let x = W*(0.06 + rng()*0.88);
      let sy = surf[U.clamp(x|0,0,surf.length-1)];
      // floaty themes (city gaps / space gaps) have columns with NO ground
      // (surf===H). Retry a few times to land the prop on a real surface so it
      // doesn't float at the bottom of the world.
      let tries = 0;
      while (sy >= H - 2 && tries < 12){
        x = W*(0.04 + rng()*0.92);
        sy = surf[U.clamp(x|0,0,surf.length-1)];
        tries++;
      }
      if (sy >= H - 2) continue;  // give up: skip this prop rather than float it
      const _o = { kind, x, y: sy + (jitterY||0) };
      // opts.s = [min,max] random per-prop scale (size variants, e.g. candy)
      if (opts && opts.s) _o.scale = opts.s[0] + rng()*(opts.s[1]-opts.s[0]);
      props.push(_o);
    }
    return props;
  }

  /* ------------------------------------------------------------------ *
   * INDESTRUCTIBLE BEDROCK helpers (#bedrock genre feature)
   * Each theme's _buildBedrock(W,H,rng) returns a list of solid rects (mask
   * coords) that terrain.js bakes into its un-carvable second mask. ALWAYS
   * include a thin map-floor so the terrain can never be fully flattened /
   * drilled through into the void; some themes add platforms/border pillars
   * so forts have a hard footing that survives any bombardment.
   * ------------------------------------------------------------------ */
  function bedrockFloor(W, H){
    // Unbreakable floor set WELL below the waterline so a real, drownable water
    // layer exists above it. (At +8 the floor sat at the surface, so a unit that
    // fell in just stood on it with its body above the water and never drowned —
    // Jani: haljanak meg.) ~40px of water is enough to submerge + drown a unit.
    const fy = Math.min(H-8, (C.WATER_LEVEL|0) + 40);
    return { x:0, y:fy, w:W, h:H-fy };
  }
  // a small bedrock platform centred at (cx) whose TOP sits at ty
  function bedrockPlatform(cx, ty, w){
    return { x:(cx-w/2)|0, y:ty|0, w:w|0, h:18 };
  }

  /* ------------------------------------------------------------------ *
   * THEME REGISTRY
   * Each gen() takes (mctx,W,H,rng) and returns the surface array so we can
   * place props after the shape is built. terrain.js calls gen() and then
   * reads theme.props (which we (re)build via buildProps()).
   * ------------------------------------------------------------------ */

  function makeTheme(def){
    // wrap gen so it also (re)builds props onto def.props each generate
    const rawGen = def._gen;
    def.gen = rawGen ? function(mctx,W,H,rng){
      const surf = rawGen(mctx,W,H,rng);
      def.props = def._buildProps ? def._buildProps(surf,W,rng) : [];
      return surf;
    } : null;
    if (def.props == null) def.props = [];
    return def;
  }

  CA.Maps.grass = makeTheme({
    id:'grass', name:'Mező', emoji:'🌳', daytime:'day',
    palette:{ sky:['#5ea7d8','#8ec9ea','#d7efff'], hill1:'#bcd9b0', hill2:'#a3cf95',
              dirt:'#7a5a30', dirtDark:'#4f3a1e', grass:'#6abf52', rock:'#8a8a8a',
              water:'rgba(64,150,200,0.55)' },
    _gen:null,   // null => terrain uses its built-in generator
    // 1-2 cute trees on the meadow. Because _gen is null, terrain.js builds the
    // shape with its built-in generator and then calls this _buildProps with a
    // surface synthesised from the real mask (see terrain.generate()).
    _buildProps:(surf,W,rng)=>[
      ...scatterProps('tree', surf, W, rng, 1, 0),
      ...scatterProps('flower_patch', surf, W, rng, 3, -2),
      ...scatterProps('mushroom', surf, W, rng, 2, -2),
      ...scatterProps('beehive', surf, W, rng, 1, -2),
    ],
    props:[],
    // bedrock: ONLY the always-present floor. The two floating bedrock platforms
    // looked like out-of-place horizontal slabs on the open meadow (Jani: "nem kell
    // ilyen platform a Mezőhöz") → removed for the grass theme.
    _buildBedrock:(W,H,rng)=>[
      bedrockFloor(W,H),
    ],
  });

  CA.Maps.desert = makeTheme({
    id:'desert', name:'Sivatag', emoji:'🏜️', daytime:'day',
    palette:{ sky:['#f6c87a','#ffe3a8','#fff3d6'], hill1:'#e8c188', hill2:'#d9a85f',
              dirt:'#d9a44f', dirtDark:'#9c6e2c', grass:'#e8c66a', rock:'#b89460',
              water:'rgba(86,160,180,0.5)' },
    _gen: genDesert,
    _buildProps:(surf,W,rng)=>{
      // (the procedural background pyramid was removed once the painterly desert
      // photo-bg shipped — the bg already provides distant mesas/dunes, and the
      // drawn pyramid overlaid it oddly. Jani: "nem kell már".)
      return [
        ...scatterProps('cactus', surf, W, rng, 5, -2),
        ...scatterProps('palm',   surf, W, rng, 3, -2),
        ...scatterProps('barrel', surf, W, rng, 2, -10),
        ...scatterProps('tumbleweed', surf, W, rng, 3, -2),
        ...scatterProps('cowskull',   surf, W, rng, 2, 0),
      ];
    },
    // bedrock: floor + two stone "mesa cores" so the mesas can't be levelled.
    _buildBedrock:(W,H,rng)=>[
      bedrockFloor(W,H),
      bedrockPlatform(W*0.35, C.WATER_LEVEL-150-rng()*40, 130),
      bedrockPlatform(W*0.68, C.WATER_LEVEL-150-rng()*40, 130),
    ],
  });

  CA.Maps.snow = makeTheme({
    id:'snow', name:'Hómező', emoji:'❄️', daytime:'day',
    palette:{ sky:['#aac6e0','#cfe2f2','#eef6ff'], hill1:'#dfeaf4','hill2':'#c6d7e8',
              dirt:'#9fb0c0', dirtDark:'#6e7d8c', grass:'#f3f8ff', rock:'#8390a0',
              water:'rgba(120,170,200,0.5)' },
    _gen: genSnow,
    _buildProps:(surf,W,rng)=>[
      ...scatterProps('pine', surf, W, rng, 5, -2),
      ...scatterProps('snowman', surf, W, rng, 1 + Math.floor(rng()*2), 0),
      ...scatterProps('igloo',   surf, W, rng, 1, 0),
      ...scatterProps('penguin', surf, W, rng, 2, 0),
    ],
    // bedrock floor a vízszint ALATT — enélkül a terrain.js régi +8-as fallback
    // padlója élt, amin egy beütött egység derékig állt a vízben és SOSEM
    // fulladt meg (QA-audit P1).
    _buildBedrock:(W,H,rng)=>[ bedrockFloor(W,H) ],
  });

  CA.Maps.jungle = makeTheme({
    id:'jungle', name:'Dzsungel', emoji:'🌴', daytime:'day',
    palette:{ sky:['#7fb98a','#a9d6a6','#d6f0c8'], hill1:'#5fa05a', hill2:'#3f7d42',
              dirt:'#6b5226', dirtDark:'#3f3014', grass:'#3fae3a', rock:'#6f7b55',
              water:'rgba(48,140,120,0.55)' },
    _gen: genJungle,
    _buildProps:(surf,W,rng)=>[
      ...scatterProps('vine', surf, W, rng, 6, -2),
      ...scatterProps('palm', surf, W, rng, 4, -2),
      ...scatterProps('bigfern',     surf, W, rng, 3, -2),
      ...scatterProps('carnivflower', surf, W, rng, 2, -2),
    ],
    // bedrock floor a vízszint alatt (lásd snow — víz-halálosság QA P1)
    _buildBedrock:(W,H,rng)=>[ bedrockFloor(W,H) ],
  });

  CA.Maps.cave = makeTheme({
    id:'cave', name:'Barlang', emoji:'🦇', daytime:'night',
    palette:{ sky:['#0b0e1a','#141a2e','#1d2740'], hill1:'#1a2236', hill2:'#10182a',
              dirt:'#3a3340', dirtDark:'#1d1922', grass:'#4a4252', rock:'#6a6276',
              water:'rgba(40,70,110,0.6)' },
    _gen: genCave,
    _buildProps:(surf,W,rng)=>[
      // a couple on the top ceiling surface for silhouette…
      ...scatterProps('crystal', surf, W, rng, 2, -2),
      ...scatterProps('stalagmite', surf, W, rng, 1, 0),
      // …but most props sit INSIDE the caverns/gallery on the real floors
      ...scatterCaveInterior('crystal', rng, 4, -2),
      ...scatterCaveInterior('glowmushroom', rng, 4, -2),
      ...scatterCaveInterior('stalagmite', rng, 3, 0),
      ...scatterCaveInterior('cryptlantern', rng, 2, 0),
    ],
    // bedrock: floor + thick left/right cave walls so a drill can't bore clean
    // out of the playfield (the cave is enclosed; bedrock makes that literal).
    _buildBedrock:(W,H,rng)=>[
      bedrockFloor(W,H),
      { x:0,    y:180, w:16, h:H-180 },
      { x:W-16, y:180, w:16, h:H-180 },
    ],
    // #10 ONE slow vertical lift bridging the cavern galleries (subtle)
    _buildPlatforms:(W,H,rng)=>[
      { x0: W*(0.42+rng()*0.12), y0: H*0.55, w: 96, h: 16,
        axis:'y', range: 170, speed: 0.010, phase: rng()*6.28,
        color:'#5a5266', edge:'#9a90a8' },
    ],
  });

  CA.Maps.islands = makeTheme({
    id:'islands', name:'Szigetek', emoji:'🏝️', daytime:'day',
    palette:{ sky:['#56b0d8','#8fd0ea','#cdeeff'], hill1:'#7fc7d0', hill2:'#5aa8b8',
              dirt:'#8a6a3a', dirtDark:'#5a4424', grass:'#5fc26a', rock:'#8a8a8a',
              water:'rgba(40,150,190,0.6)' },
    _gen: genIslands,
    _buildProps:(surf,W,rng)=>[
      ...scatterProps('palm', surf, W, rng, 3, -2),
      ...scatterProps('chest', surf, W, rng, 1, -2),
      ...scatterProps('tikitorch', surf, W, rng, 2, -2),
      ...scatterProps('tikitotem', surf, W, rng, 1, 0),
    ],
    // NO moving platform on the islands (Jani: "ne legyen ilyen mozgó platform")
    // — the floating raft read as an out-of-place metal lift. Removed.
    // bedrock floor a vízszint alatt — a szigetek közé beütött egység eddig a
    // régi +8-as fallback padlón ÁLLT a tengerben és sosem fulladt meg, pedig
    // pont a vízbe lökés a pálya fő taktikája (QA P1).
    _buildBedrock:(W,H,rng)=>[ bedrockFloor(W,H) ],
  });

  CA.Maps.volcano = makeTheme({
    id:'volcano', name:'Vulkán', emoji:'🌋', daytime:'dusk',
    palette:{ sky:['#3a1320','#71202a','#c0532a'], hill1:'#2a1414', hill2:'#1a0e0e',
              dirt:'#3a2420', dirtDark:'#1c1110', grass:'#5a2a1a', rock:'#4a4044',
              water:'rgba(180,70,30,0.45)' },
    // Jani: a vulkán NE a játszható terep legyen. Normál terep épül (built-in
    // generator, mint a Mező), a vulkán-kúp pedig csak HÁTTÉR-sziluettként
    // rajzolódik ki az fx.js renderBg-ben (lásd _volcanoBg). Így nincs szilárd
    // {kind:'volcano'} prop a terepben, és nem kell középső plint-bedrock sem.
    _gen:null,   // null => terrain uses its built-in generator (normal terrain)
    _buildProps:(surf,W,rng)=>[
      // csak ártalmatlan dekoratív propok a normál terepen (nincs szilárd vulkán)
      ...scatterProps('rockspire', surf, W, rng, 4, -2),
      ...scatterProps('barrel',    surf, W, rng, 3, -10),
      ...scatterProps('lavabubble', surf, W, rng, 3, 0),
      ...scatterProps('emberrock',  surf, W, rng, 3, 0),
    ],
    // bedrock: ONLY the always-present floor (a vulkán már nem a terep, nincs mit
    // megtámasztani egy középső plinttel).
    _buildBedrock:(W,H,rng)=>[
      bedrockFloor(W,H),
    ],
  });

  // ÉG (Sky) — replaces the old City theme. A bright daytime sky with FIXED
  // floating platforms and NO ground floor; clouds + planes drift behind.
  CA.Maps.sky = makeTheme({
    id:'sky', name:'Ég', emoji:'☁️', daytime:'day',
    palette:{ sky:['#4aa0e0','#8fcdf0','#e3f4ff'], hill1:'#bfe0f5', hill2:'#a6d2ee',
              dirt:'#dfe9f2', dirtDark:'#b7c6d6', grass:'#ffffff', rock:'#c8d4e0',
              water:'rgba(150,190,230,0.42)' },
    _gen: genSky,
    // one barrel on a platform for flavour; the real "life" is the drifting
    // clouds + planes (sky-objects system, boosted for this theme in fx.js).
    _buildProps:(surf,W,rng)=>[
      ...scatterProps('cloudtuft', surf, W, rng, 3, -2),
      ...scatterProps('minilantern', surf, W, rng, 2, -2),
      ...scatterProps('pinwheel', surf, W, rng, 2, -2),
    ],
    // bedrock: ONLY the far-below death plane (no visible ground) — falling off a
    // platform drops you into the haze and drowns. The platforms themselves are
    // the painted (destructible) slabs from genSky.
    _buildBedrock:(W,H,rng)=>[
      bedrockFloor(W,H),
    ],
  });

  // STRAND (Beach) — sunny tropical shoreline: golden sand dunes, turquoise sea,
  // palms + beach umbrellas + a little sandcastle. Fills the "shoreline" gap.
  CA.Maps.beach = makeTheme({
    id:'beach', name:'Strand', emoji:'🏖️', daytime:'day',
    // softer SAND palette (Jani: a strand pereme "pixeles" volt): the top-edge
    // 'grass' colour is pulled close to the sand body so there's no harsh bright
    // rim making the destructible-mask jaggies pop; warmer, low-contrast dunes.
    palette:{ sky:['#3fa9e0','#7fd0f0','#dff6ff'], hill1:'#cfe7d8', hill2:'#bcdcc8',
              dirt:'#e7d09a', dirtDark:'#cbab6e', grass:'#edd7a4', rock:'#cdb98c',
              water:'rgba(46,170,210,0.55)' },
    _gen:null,   // built-in generator → soft rolling sand dunes
    _buildProps:(surf,W,rng)=>[
      ...scatterProps('palm',       surf, W, rng, 3, -2),
      ...scatterProps('umbrella',   surf, W, rng, 2, 0),
      ...scatterProps('sandcastle', surf, W, rng, 1, 0),
      ...scatterProps('starfish',   surf, W, rng, 3, 0),
    ],
    _buildBedrock:(W,H,rng)=>[ bedrockFloor(W,H) ],
  });

  // CUKORORSZÁG (Candy Land) — pastel sweets battlefield: strawberry-frosting
  // ground, cotton-candy sky, grape-syrup sea, lollipops + candy canes.
  CA.Maps.candy = makeTheme({
    id:'candy', name:'Cukorország', emoji:'🍭', daytime:'day',
    palette:{ sky:['#ffd3e8','#ffc0dd','#c9f0ff'], hill1:'#f7b8d2', hill2:'#f3a6c6',
              dirt:'#f7a8c4', dirtDark:'#d97aa0', grass:'#ff5fa2', rock:'#e7c0d4',
              water:'rgba(155,93,229,0.5)' },
    _gen:null,
    _buildProps:(surf,W,rng)=>[
      // size-varied sweets: a mix of small + big lollipops/canes for depth
      ...scatterProps('lollipop',  surf, W, rng, 3, 0, { s:[0.7, 1.0] }),
      ...scatterProps('lollipop',  surf, W, rng, 2, 0, { s:[1.3, 1.7] }),
      ...scatterProps('candycane', surf, W, rng, 2, 0, { s:[0.8, 1.1] }),
      ...scatterProps('candycane', surf, W, rng, 1, 0, { s:[1.4, 1.7] }),
      ...scatterProps('cupcake',   surf, W, rng, 3, 0),
    ],
    _buildBedrock:(W,H,rng)=>[ bedrockFloor(W,H) ],
  });

  CA.Maps.space = makeTheme({
    id:'space', name:'Űrállomás', emoji:'🛰️', daytime:'night',
    // noWater (Jani 2026-06-10): az űrben alul NE víz legyen, hanem a semmi —
    // nincs víz-sáv/splash/úszás; a vonal alá kerülő egység az űrbe zuhan (halál).
    noWater: true,
    palette:{ sky:['#05060f','#0a0e1e','#10182e'], hill1:'#1a2236', hill2:'#10182a',
              dirt:'#4a5568', dirtDark:'#222a38', grass:'#6a7a92', rock:'#9aa6ba',
              water:'rgba(40,70,130,0.5)' },
    _gen: genSpace,
    _buildProps:(surf,W,rng)=>[
      // glowing energy crystals scattered on the slabs read well on the dark bg
      ...scatterProps('crystal', surf, W, rng, 3, -2),
      ...scatterProps('minirocket', surf, W, rng, 1, -2),
      ...scatterProps('mooncrater', surf, W, rng, 3, -2),
    ],
    // noWater-rel: NINCS bedrock-padló a vonal alatt (vízben láthatatlan volt, az
    // űrben furcsa kőcsík lenne) — a halálosságot az entities void-szabálya adja
    // (a vonal alá esés = azonnali halál), így a QA P1 lethalitás megmarad.
    _buildBedrock:(W,H,rng)=>[],
    // #10 a couple of drifting maintenance lifts (floaty, low-grav vibe)
    _buildPlatforms:(W,H,rng)=>[
      { x0: W*0.22, y0: H*0.40, w: 120, h: 16, axis:'y', range: 150,
        speed: 0.008, phase: rng()*6.28, color:'#52607a', edge:'#aebcd2' },
      { x0: W*0.62, y0: H*0.50, w: 130, h: 16, axis:'x', range: 220,
        speed: 0.007, phase: rng()*6.28, color:'#52607a', edge:'#aebcd2' },
    ],
  });

  CA.Maps.graveyard = makeTheme({
    id:'graveyard', name:'Temető', emoji:'🪦', daytime:'night',
    palette:{ sky:['#140e22','#241640','#3a2458'], hill1:'#2a2636', hill2:'#1c1a28',
              dirt:'#403a3e', dirtDark:'#231f24', grass:'#4a4448', rock:'#7b7680',
              water:'rgba(60,70,90,0.55)' },
    _gen: genGraveyard,
    _buildProps:(surf,W,rng)=>[
      ...scatterProps('tombstone', surf, W, rng, 6, 0),
      ...scatterProps('deadtree',  surf, W, rng, 3, 0),
      ...scatterProps('barrel',    surf, W, rng, 1, -10),
      ...scatterProps('cryptlantern', surf, W, rng, 2, 0),
    ],
    // bedrock: floor + two stone crypt-footings so forts keep a hard footing.
    _buildBedrock:(W,H,rng)=>[
      bedrockFloor(W,H),
      bedrockPlatform(W*0.30, C.WATER_LEVEL-150-rng()*50, 140),
      bedrockPlatform(W*0.70, C.WATER_LEVEL-150-rng()*50, 140),
    ],
  });

  /* HALLOWEEN — spooky purple forest (CraftPix Halloween pack scene 2 photo-bg:
   * spider-webbed dead trees + glowing red mushrooms). Distinct from the
   * graveyard (that one is the moonlit cemetery): jungle-like rolling terrain
   * in haunted purples. (Jani: "+1 Halloween palya, hatter mar van hozza".) */
  CA.Maps.halloween = makeTheme({
    id:'halloween', name:'Halloween', emoji:'🎃', daytime:'night',
    palette:{ sky:['#1a0e24','#2c1838','#46243f'], hill1:'#3a2247', hill2:'#241430',
              dirt:'#4a3046', dirtDark:'#2a1a2a', grass:'#7a3b5e', rock:'#8a7090',
              water:'rgba(90,50,110,0.55)' },
    _gen: genJungle,
    _buildProps:(surf,W,rng)=>[
      // pumpkins in a mix of sizes (Jani: "kicsit nagyot a pályára")
      ...scatterProps('pumpkin',   surf, W, rng, 3, -2, { s:[0.8, 1.1] }),
      ...scatterProps('pumpkin',   surf, W, rng, 2, -2, { s:[1.4, 1.8] }),
      ...scatterProps('deadtree',  surf, W, rng, 3, 0),
      ...scatterProps('tombstone', surf, W, rng, 2, 0),
      ...scatterProps('cauldron',  surf, W, rng, 1, 0),
    ],
    _buildBedrock:(W,H,rng)=>[ bedrockFloor(W,H) ],
  });

  /* keep list() returning only theme ids (objects with a palette) */
  CA.Maps.list = function(){
    const ids = Object.keys(CA.Maps).filter(k=>{
      const v = CA.Maps[k];
      return v && typeof v === 'object' && v.palette;
    });
    // Jani: a DZSUNGEL legyen az első pálya, a Mező a dzsungel helyén → swap their
    // positions in the listed order (no big block moves; picker/order follow this).
    const gi = ids.indexOf('grass'), ji = ids.indexOf('jungle');
    if (gi >= 0 && ji >= 0){ const t = ids[gi]; ids[gi] = ids[ji]; ids[ji] = t; }
    return ids;
  };

  CA.Maps.get = function(id){
    if (id === 'random') return CA.Maps[CA.Maps.randomTheme()] || CA.Maps.grass;
    const t = CA.Maps[id];
    return (t && t.palette) ? t : CA.Maps.grass;
  };

  /* #14 RANDOM / véletlen pálya — pick a random REAL theme id. If a numeric
   * seed is passed the choice is DETERMINISTIC (so the same seed always yields
   * the same theme + the same terrain). Otherwise Math.random() is used.
   * The New-Game UI can offer a 'random' option and call this to resolve it. */
  CA.Maps.randomTheme = function(seed){
    const ids = CA.Maps.list().filter(id => id !== 'random');
    if (!ids.length) return 'grass';
    let r;
    if (seed != null && isFinite(seed)){
      // mulberry32-style hash of the seed -> [0,1)
      let a = (seed >>> 0) || 1;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    } else {
      r = Math.random();
    }
    return ids[Math.floor(r * ids.length) % ids.length];
  };

  /* SEASONAL auto-theme — returns a theme id appropriate for the current date,
   * or null if no season applies. Pure + side-effect-free (pass a Date to test):
   *   October            -> 'graveyard'  (Halloween / Temető)
   *   December & January  -> 'snow'       (winter; only if that theme exists)
   * Otherwise null. The integrator wires this as a New-Game default; it only
   * returns ids that are actually registered (defensive against missing themes). */
  CA.Maps.seasonalTheme = function(when){
    const d = (when instanceof Date) ? when : new Date();
    let m;
    try { m = d.getMonth(); } catch(e){ return null; }   // 0=Jan .. 11=Dec
    let id = null;
    if (m === 9) id = 'graveyard';                         // October
    else if (m === 11 || m === 0) id = 'snow';             // December / January
    if (!id) return null;
    // only return a theme that is actually registered with a palette
    const t = CA.Maps[id];
    return (t && t.palette) ? id : null;
  };

  CA.Maps.init = function(){};

  /* ================================================================== *
   * #2 LEVEL EDITOR — backend only. Drives the terrain MASK through the
   * exposed hooks (CA.Terrain.paintSolid / CA.Terrain.carve). Custom maps
   * are saved to localStorage as a list of paint ops + base theme.
   * ================================================================== */
  const PREFIX = 'ca_map_';

  CA.Maps.editor = {
    theme: 'grass',
    ops: [],        // recorded ops: {x,y,r,solid} (paint) OR {prop,x,y} (prop)
    editing: false,
    // base-terrain seed used to generate the hills the user edits ON TOP of.
    // Persisted in save() and reused by load() so a loaded map's BASE hills match
    // exactly what was on screen while editing (QA [P3] — was regenerated from
    // payload.ts, a different value, so only paint/prop ops replayed faithfully).
    baseSeed: 0,

    // ---- prop-placement state (UI in screens.js drives these) ----
    tool: 'draw',         // 'draw' | 'erase' | 'prop'
    propKind: 'tree',     // which prop placeProp() stamps
    placedProps: [],      // [{kind, x, y}] — rendered by terrain.js

    beginEdit(theme){
      this.theme = theme || CA.state.theme || 'grass';
      this.ops = [];
      this.placedProps = [];
      this.editing = true;
      // pick + REMEMBER the base seed so save() can persist it and load() can
      // reproduce the identical base hills (edited == loaded base — QA [P3]).
      this.baseSeed = (Math.random()*1e9)|0;
      // (re)generate the chosen theme as a clean base for editing
      if (CA.Terrain && CA.Terrain.generate){
        CA.state.theme = this.theme;
        CA.Terrain.generate(this.baseSeed>>>0, this.theme);
      }
      return true;
    },

    paint(x,y,r,solid){
      r = Math.max(2, r||16);
      if (solid === false) return this.erase(x,y,r);
      if (CA.Terrain && CA.Terrain.paintSolid) CA.Terrain.paintSolid(x,y,r);
      this.ops.push({ x, y, r, solid:true });
    },

    erase(x,y,r){
      r = Math.max(2, r||16);
      if (CA.Terrain && CA.Terrain.carve) CA.Terrain.carve(x,y,r);
      this.ops.push({ x, y, r, solid:false });
    },

    // place a decorative prop at world coords; persisted via a prop op so it
    // survives save/load and shows up in a real game (terrain.js renders them).
    placeProp(worldX, worldY){
      const kind = this.propKind || 'tree';
      this.placedProps.push({ kind, x:worldX, y:worldY });
      this.ops.push({ prop:kind, x:worldX, y:worldY });
    },

    clear(){
      // the clear IS an op — without recording it, load() regenerated the base
      // theme hills and resurrected them under maps built from a blank canvas.
      this.ops = [{ clear:true }];
      this.placedProps = [];
      if (CA.Terrain && CA.Terrain.clearAll) CA.Terrain.clearAll();
    },

    save(name){
      if (!name) return false;
      try{
        // persist the base seed so load() rebuilds the SAME base hills the user
        // edited on (QA [P3]). ts is kept only for back-compat / display.
        const payload = { name, theme:this.theme, seed:(this.baseSeed>>>0), ops:this.ops, v:1, ts:Date.now() };
        localStorage.setItem(PREFIX + name, JSON.stringify(payload));
        return true;
      }catch(e){ return false; }
    },

    load(name){
      if (!name) return false;
      let payload;
      try{ payload = JSON.parse(localStorage.getItem(PREFIX + name) || 'null'); }
      catch(e){ return false; }
      if (!payload || !Array.isArray(payload.ops)) return false;
      this.theme = payload.theme || 'grass';
      this.ops = payload.ops.slice();
      this.placedProps = [];
      // reuse the SAVED base seed so the loaded base hills match what was edited
      // (QA [P3]). Fall back to payload.ts for older maps saved before seed existed.
      this.baseSeed = (payload.seed != null ? payload.seed : (payload.ts || 1)) >>> 0;
      // rebuild: generate base theme, then replay the ops onto the mask
      if (CA.Terrain && CA.Terrain.generate){
        CA.state.theme = this.theme;
        CA.Terrain.generate(this.baseSeed, this.theme);
      }
      for (const op of this.ops){
        if (op.clear){
          if (CA.Terrain.clearAll) CA.Terrain.clearAll();
        } else if (op.prop){
          // prop op (backward-compatible: old maps simply have none)
          this.placedProps.push({ kind:op.prop, x:op.x, y:op.y });
        } else if (op.solid && CA.Terrain.paintSolid){
          CA.Terrain.paintSolid(op.x, op.y, op.r);
        } else if (!op.solid && CA.Terrain.carve){
          CA.Terrain.carve(op.x, op.y, op.r);
        }
      }
      return true;
    },

    list(){
      const out = [];
      try{
        for (let i=0;i<localStorage.length;i++){
          const k = localStorage.key(i);
          if (k && k.indexOf(PREFIX)===0) out.push(k.slice(PREFIX.length));
        }
      }catch(e){}
      return out;
    },

    remove(name){
      try{ localStorage.removeItem(PREFIX + name); return true; }catch(e){ return false; }
    },
  };
})();
