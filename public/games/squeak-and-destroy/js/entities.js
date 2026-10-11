/* ============================================================================
 * CUTE ANIMALS — entities.js  ::  AGENT B — Characters, Teams, Animation, ART
 * ----------------------------------------------------------------------------
 * GOAL: the living things. Two ADORABLE species — 🐹 Capybaras & 🪱 Worms —
 * with personality, walk/aim/hit animations, physics on the terrain, fall
 * damage, drowning. THIS IS WHERE THE "CUTE" LIVES. Make them charming:
 * blinking eyes, little feet, idle bob, squash/stretch, team-colored bands,
 * tiny name tags. All canvas-drawn (no external images).
 *
 * IMPLEMENT on CA.Entities (EXACT names):
 *   init(ctx)
 *   spawnTeams(teams)          -> for each team in CA.state.teams, create
 *                                CA.config.TEAM_SIZE units, push to
 *                                CA.state.units, fill team.unitIds. Place them
 *                                spread across the map using CA.Terrain.heightAt,
 *                                not overlapping, not over water.
 *   update(dt)                 -> integrate gravity for ALL units, resolve
 *                                terrain collision (CA.Terrain.collideCircle /
 *                                isSolid), set grounded, apply fall damage when
 *                                landing fast (config FALL_DMG_*), drown units
 *                                whose feet pass CA.config.WATER_LEVEL.
 *   walk(unit, dir)            -> move active unit horizontally if grounded &
 *                                slope climbable (step up small ledges). Sets
 *                                facing + 'walk' anim.
 *   jump(unit)                 -> small hop (only if grounded & it's their turn).
 *   render(ctx)                -> draw every alive unit (world space). Draw the
 *                                ACTIVE unit's facing/health highlight. Draw a
 *                                small aim reticle handled by Weapons/UI, NOT here.
 *   damageInRadius(x,y,r,maxDmg,knockback)
 *                              -> falloff damage to units within r; apply
 *                                knockback impulse (vx,vy) away from blast;
 *                                clamp hp; mark dead + emit 'unitDied'; emit
 *                                'unitDamaged'. (Called by CA.explode — do NOT
 *                                call CA.explode from here, infinite loop.)
 *   damage(unit, amount)       -> helper used above & by drowning/fall.
 *
 * Unit shape: see contract.js. Use CA.util for clamp/lerp/rand.
 * Each team's kind: teams[i].kind === 'capybara' | 'worm'. color = teams[i].color.
 * Give units fun Hungarian-ish names (e.g. capybaras: "Bobó","Cuki","Maxi","Dö";
 *   worms: "Giliszta Géza","Kukac Pál","Féregh","Nyúzi"). Be playful.
 *
 * Animation: keep unit.anim={state,t}; advance t in update; render reads it.
 * Active unit is CA.activeUnit(). It's that unit's turn — show aim pose.
 * ==========================================================================*/
(function(){
  const C=CA.config, S=CA.state, U=CA.util;

  // v5.0 — CAPTAIN PERK (#5): a csapatkapitány (arany csillagos egység) HP-szorzója.
  // A "tankier leader" trópus — könnyen hangolható egyetlen helyen.
  //
  // v5.1 — a +20% lapos bónusz kis (2-3 fős) csapatoknál túl ingadozó volt, ezért
  // a csapatmérettel SKÁLÁZZUK: effektív szorzó = 1 + 0.20 * clamp(teamSize/5, 0.5, 1)
  //   → 2 fős csapat: 1 + 0.20*0.5  = 1.10  (+10%)
  //   → 5 fős (teli) csapat: 1 + 0.20*1.0 = 1.20  (+20%)
  // EGYETLEN hangolható hely; mind a friss spawn, mind a save/load ezen megy át.
  const CAPTAIN_HP_BONUS = 0.20;            // teli (5 fős) csapatnál +20%
  function captainHpMul(teamSize){
    const ts = Math.max(1, teamSize|0);
    const f  = Math.max(0.5, Math.min(1, ts/5));   // clamp(teamSize/5, 0.5, 1)
    return 1 + CAPTAIN_HP_BONUS * f;
  }

  // i18n — EN translations for the unit speech-bubble QUIPS (see QUIPS table
  // below). HU is the default/key; CA.t() returns the literal in HU mode and
  // these strings in EN mode. Capybaras = chill office crew; worms = scrappy
  // & energetic production crew — keep the EN punchy and short.
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    // — status effects —
    'Dominó!':'Domino!',
    // — capybara —
    'Én jövök!':'My turn!',
    'Nyugi, megoldom.':'Relax, I got this.',
    'Lássuk csak…':'Let’s see…',
    'Oké, fókusz.':'Okay, focus.',
    'Bumm!':'Boom!',
    'Csá!':'Later!',
    'Ez fájt!':'That hurt!',
    'Hé!':'Hey!',
    'Jaj nekem!':'Oh no!',
    'Megvan!':'Gotcha!',
    'Sajnálom!':'Sorry!',
    'Pá-pá!':'Bye-bye!',
    'Hopp!':'Whoops!',
    'Hmm…':'Hmm…',
    'Kávé kéne.':'I need coffee.',
    'Szép idő.':'Nice weather.',
    '*ásít*':'*yawn*',
    'Jaj, a víz!':'Oh no, water!',
    'Nem tudok úszni!':'I can’t swim!',
    'Segítség!':'Help!',
    'Győztünk!':'We won!',
    'Ez az!':'Yes!',
    'Adminisztráció FTW!':'Paperwork FTW!',
    // — worm —
    'Mehet!':'Let’s do it!',
    'Na, gyerünk!':'Come on!',
    'Az enyém!':'It’s mine!',
    'Csapassuk!':'Let’s go!',
    'Kapd ki!':'Take this!',
    'Booom!':'Booom!',
    'Áú, a hátam!':'Ow, my back!',
    'Hé, ez csalás!':'Hey, that’s cheating!',
    'Megfogtalak!':'Got you!',
    'Hahó!':'Yoo-hoo!',
    'Viszlát!':'See ya!',
    'Bingó!':'Bingo!',
    'Ásni jó.':'Digging rules.',
    'Nyam, föld.':'Yum, dirt.',
    'Csiribiri…':'Wiggle-wiggle…',
    '*fütyül*':'*whistles*',
    'Vizes leszek!':'I’ll get wet!',
    'Brrr!':'Brrr!',
    'Nem úszok!':'I don’t swim!',
    'Gyártás nyert!':'Production wins!',
    'Hurrá!':'Hooray!',
    'Megcsináltuk!':'We did it!',
    // — shared between species —
    'Tűz!':'Fire!',
    'Nesze!':'Take that!',
    'Aú!':'Ow!'
  });

  // Playful Hungarian-flavoured rosters (extra names for >4 team sizes).
  const CAPY_NAMES=['Bobó','Cuki','Maxi','Dö','Pufi','Mütyür','Brokeszi','Zsömi'];
  const WORM_NAMES=['Giliszta Géza','Kukac Pál','Féregh','Nyúzi','Tekergő','Csősz','Pondró','Gilu'];

  const TWO_PI = Math.PI*2;

  // --- small helpers -------------------------------------------------------
  function darken(hex, f){
    // f in 0..1, fraction of black to mix in
    const c = parseHex(hex);
    return `rgb(${(c.r*(1-f))|0},${(c.g*(1-f))|0},${(c.b*(1-f))|0})`;
  }
  function lighten(hex, f){
    const c = parseHex(hex);
    return `rgb(${(c.r+(255-c.r)*f)|0},${(c.g+(255-c.g)*f)|0},${(c.b+(255-c.b)*f)|0})`;
  }
  function parseHex(hex){
    let h=(hex||'#888').replace('#','');
    if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return { r:parseInt(h.slice(0,2),16)||0, g:parseInt(h.slice(2,4),16)||0, b:parseInt(h.slice(4,6),16)||0 };
  }

  function fx(){ return (CA.FX && CA.FX.spawnParticles) ? CA.FX : null; }

  // -------------------------------------------------------------------------
  // ADDITIVE JUICE — Verlet "secondary motion" chain for a dangly back
  // appendage (tail/ear tuft). A handful of points in the unit's LOCAL space
  // hanging off an anchor; each frame they fall under a soft gravity, are
  // dragged by the unit's own motion/recoil, and snap back toward a rest pose
  // via stiffness. Result: the tip LAGS and swings when the unit walks, jumps
  // or gets hit. Subtle by design (small displacement) and 100% cosmetic — it
  // never touches physics/aim/facing. reducedMotion + low-quality aware at the
  // call sites (this helper is pure math). CHAIN_PTS points per unit.
  const CHAIN_PTS = 3;             // anchor + 2 free links — cheap, reads well
  const CHAIN_SEG = C.UNIT_R*0.55; // rest length between links (local space)
  function makeChain(){
    // points hang straight down from a local anchor at the unit's lower-back.
    const pts = new Array(CHAIN_PTS);
    for(let i=0;i<CHAIN_PTS;i++){
      pts[i] = { x:0, y:i*CHAIN_SEG, px:0, py:i*CHAIN_SEG };
    }
    return { pts, vx:0, vy:0 };   // vx/vy = last-known driver velocity (for damping)
  }
  // Integrate one chain. `drive` = the unit's frame displacement (px) that
  // should drag the chain (motion + recoil impulse), `k` = dt scale, `grav` a
  // gentle downward pull. Verlet: x += (x-px)*damp - drive (anchor inertia),
  // then 2 relaxation passes pin point 0 and keep segment lengths.
  function tickChain(ch, driveX, driveY, k, grav){
    const pts = ch.pts;
    const damp = 0.86;            // velocity retention (lag/swing feel)
    for(let i=0;i<pts.length;i++){
      const p = pts[i];
      let nx = p.x + (p.x - p.px)*damp;
      let ny = p.y + (p.y - p.py)*damp + grav*k;
      // free points get dragged opposite to the unit's motion (inertia);
      // the anchor (i===0) is hard-pinned below in the relax pass.
      if(i>0){ nx -= driveX*0.5; ny -= driveY*0.5; }
      p.px = p.x; p.py = p.y;
      p.x = nx;   p.y = ny;
    }
    // relax: pin anchor to rest, hold segment lengths (2 iters = stable+cheap)
    for(let it=0; it<2; it++){
      pts[0].x = 0; pts[0].y = 0;       // anchor at local origin (rest)
      for(let i=1;i<pts.length;i++){
        const a=pts[i-1], b=pts[i];
        let dx=b.x-a.x, dy=b.y-a.y;
        let d=Math.sqrt(dx*dx+dy*dy)||0.0001;
        const diff=(d-CHAIN_SEG)/d*0.5;
        const ox=dx*diff, oy=dy*diff;
        if(i-1>0){ a.x+=ox; a.y+=oy; }  // anchor stays pinned
        b.x-=ox; b.y-=oy;
        // soft stiffness: bias the link back toward straight-down rest so it
        // never flails — keeps it subtle and self-recovering.
        b.x += (a.x - b.x)*0.10;
        b.y += (a.y + CHAIN_SEG - b.y)*0.10;
      }
    }
  }

  // Reusable rising-bubble emitter for anything sinking in water. Guarded so it
  // never throws if FX is missing. Uses spawnParticles' `lift` (subtracts from
  // vy → upward drift) + gravity:0 so bubbles float toward the surface, in a
  // soft watery blue.
  function emitBubbles(x, y, count){
    const F = fx(); if(!F) return;
    try {
      F.spawnParticles({
        x:x, y:y, count:(count||2),
        spdMin:0.2, spdMax:0.8, life:24, size:2, color:'#bfe6ff',
        lift:1.2, gravity:0   // gentle upward rise, no fall-back
      });
    } catch(_){ /* never throw from cosmetics */ }
  }

  // =========================================================================
  // #7 — SURFACE FRICTION by map theme + weather. Returns a small descriptor
  // the physics & walk() read. The intent is TACTILE variety, not chaos:
  //  - SLIPPERY (snow/ice maps, or any weather with slip>0): the ground holds
  //    momentum longer (higher retained vx after a step), and walking ramps up
  //    more gradually, so units glide a touch when they stop. Subtle.
  //  - STICKY (jungle/mud): slightly reduced top walk speed — heavy, draggy feel.
  //  - normal (grass/desert/everything else): the original numbers.
  // `slip` is 0..1; we tie its strength to S.weather.slip when present, else a
  // theme baseline. Kept conservative so units stay fully controllable and
  // grounded units never jitter (this only changes ACTIVE walking & decel).
  // =========================================================================
  function surface(){
    const theme = (S.theme||'').toLowerCase();
    const w = S.weather || null;
    const wSlip = (w && typeof w.slip === 'number') ? w.slip : 0;
    // icy themes have an inherent baseline slip even in clear weather
    const themeSlip = (theme==='snow' || theme==='ice' || theme==='arctic') ? 0.30 : 0;
    // weather slip stacks but is capped; clear weather on grass = 0
    const slip = U.clamp(Math.max(themeSlip, wSlip), 0, 0.85);
    // sticky/slow on jungle & explicit mud themes
    const sticky = (theme==='jungle' || theme==='mud' || theme==='swamp');

    // ground horizontal friction multiplier per frame. Base game used 0.80
    // (fast stop). Higher = more retained momentum (slippery). Lower = grippier.
    // slip 0 -> 0.80 (normal), slip 0.85 -> ~0.936 (long glide), clamped sane.
    const groundFric = U.clamp(0.80 + slip*0.16, 0.80, 0.95);
    // how readily walking accelerates the unit toward top speed. On ice you
    // build/lose speed gradually (low accel); on normal ground it's instant-ish.
    const walkAccel = U.clamp(1 - slip*0.78, 0.18, 1);     // 1 = instant, <1 = gradual
    // top walk step size (px/step). Sticky terrain drags it down a touch.
    const walkStep = sticky ? 1.5 : 2.0;
    // below this |vx| a grounded unit is snapped to rest (prevents micro-drift
    // / jitter). On ice we allow a longer creep before snapping to zero.
    const restEps = slip>0 ? 0.04 + slip*0.10 : 0.02;
    return { slip, sticky, groundFric, walkAccel, walkStep, restEps };
  }

  // =========================================================================
  // #3 — PER-UNIT COSMETIC VARIETY. A tiny named registry of head/face overlays
  // so every animal looks individual. Each entry has draw(ctx, R, u, a) that
  // renders in the unit's LOCAL space (origin = centre, already mirrored by
  // facing & squash-scaled, +x = forward). Keep them simple & readable at ~32px.
  // The registry is intentionally easy to extend — a future "Csapat szerkesztő"
  // (team editor) can let the player pick a cosmetic id explicitly. Assignment is
  // deterministic (hash of unit identity + seed) so it survives save/load, where
  // units are regenerated from the seed.
  // Head anchor used below: hx≈R*0.55 forward, hy≈-R*0.3 up (matches capy/worm).
  // =========================================================================
  const COSMETICS = {
    // angry eyebrows + a little frown crease
    grumpy: { draw(ctx, R){
      ctx.strokeStyle='#3a2a1a'; ctx.lineWidth=2.2; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(R*0.30,-R*0.66); ctx.lineTo(R*0.66,-R*0.50); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(R*0.02,-R*0.62); ctx.lineTo(R*0.30,-R*0.50); ctx.stroke();
      ctx.lineCap='butt';
    }},
    // eyepatch + striped bandana
    pirate: { draw(ctx, R){
      // bandana over the crown
      ctx.fillStyle='#c0392b'; ctx.strokeStyle='#8e271c'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(R*0.40,-R*0.62,R*0.62,Math.PI*1.05,Math.PI*1.95); ctx.fill();
      ctx.fillRect(-R*0.18,-R*0.86,R*1.16,R*0.16);
      // white polka dots
      ctx.fillStyle='rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(R*0.16,-R*0.78,1.4,0,TWO_PI); ctx.fill();
      ctx.beginPath(); ctx.arc(R*0.66,-R*0.78,1.4,0,TWO_PI); ctx.fill();
      // knot tail at the back
      ctx.fillStyle='#c0392b';
      ctx.beginPath(); ctx.moveTo(-R*0.16,-R*0.78); ctx.lineTo(-R*0.46,-R*0.62);
      ctx.lineTo(-R*0.40,-R*0.86); ctx.closePath(); ctx.fill();
      // eyepatch over the back eye + strap
      ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(R*0.66,-R*0.58); ctx.lineTo(-R*0.10,-R*0.42); ctx.stroke();
      ctx.fillStyle='#1a1a1a';
      ctx.beginPath(); ctx.ellipse(R*0.10,-R*0.34,R*0.16,R*0.18,0,0,TWO_PI); ctx.fill();
    }},
    // yellow construction hard-hat (fitting for the "Gyártás" worm crew).
    // Anchored to the head crown: head ~ (hx,hy) r≈hr; dome rests ON the head.
    helmet: { draw(ctx, R){
      const hx=R*0.42, hy=-R*0.40;           // head centre
      const brimY = hy - R*0.30;             // where the hat sits on the head
      const domeR = R*0.58;
      // rounded dome cap sitting on the crown
      ctx.fillStyle='#f5b800'; ctx.strokeStyle='#c79100'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.arc(hx, brimY, domeR, Math.PI, 0); ctx.fill(); ctx.stroke();
      // dark band where the dome meets the brim
      ctx.fillStyle='#3a2f15';
      ctx.fillRect(hx-domeR, brimY-R*0.07, domeR*2, R*0.07);
      // front brim/visor jutting forward (+x = facing forward)
      ctx.fillStyle='#f5b800'; ctx.strokeStyle='#c79100'; ctx.lineWidth=1;
      ctx.beginPath();
      ctx.ellipse(hx+R*0.22, brimY, domeR*0.95, R*0.13, 0, 0, Math.PI);
      ctx.fill(); ctx.stroke();
      // crest ridge over the dome
      ctx.strokeStyle='#d9a200'; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.moveTo(hx, brimY-domeR); ctx.lineTo(hx, brimY-R*0.04); ctx.stroke();
      // little highlight
      ctx.strokeStyle='rgba(255,255,255,0.45)'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(hx, brimY, domeR*0.7, Math.PI*1.15, Math.PI*1.45); ctx.stroke();
    }},
    // derpy googly eyes + tongue sticking out
    silly: { draw(ctx, R){
      // big wobbly googly eyes on top of the existing eyes
      ctx.fillStyle='#fff'; ctx.strokeStyle='#222'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(R*0.62,-R*0.36,R*0.22,0,TWO_PI); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(R*0.20,-R*0.32,R*0.20,0,TWO_PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#111';
      ctx.beginPath(); ctx.arc(R*0.70,-R*0.30,R*0.09,0,TWO_PI); ctx.fill();
      ctx.beginPath(); ctx.arc(R*0.14,-R*0.40,R*0.08,0,TWO_PI); ctx.fill();
      // tongue out
      ctx.fillStyle='#ff6f9c';
      ctx.beginPath(); ctx.ellipse(R*0.60,R*0.02,R*0.12,R*0.18,0,0,TWO_PI); ctx.fill();
    }},
    // round spectacles
    glasses: { draw(ctx, R){
      ctx.strokeStyle='#2b2b2b'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(R*0.58,-R*0.34,R*0.22,0,TWO_PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(R*0.16,-R*0.30,R*0.20,0,TWO_PI); ctx.stroke();
      // bridge between the lenses
      ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.moveTo(R*0.30,-R*0.32); ctx.lineTo(R*0.42,-R*0.33); ctx.stroke();
      // shine
      ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(R*0.58,-R*0.34,R*0.14,Math.PI*1.1,Math.PI*1.5); ctx.stroke();
    }},
    // red mohawk along the crown
    mohawk: { draw(ctx, R){
      ctx.fillStyle='#e0392b'; ctx.strokeStyle='#a81f12'; ctx.lineWidth=1;
      const baseX=R*0.40, baseY=-R*0.66;
      ctx.beginPath();
      ctx.moveTo(baseX-R*0.40, baseY);
      for(let i=-2;i<=2;i++){
        const sx=baseX + i*R*0.18;
        ctx.lineTo(sx-R*0.05, baseY - R*0.55*(1-Math.abs(i)*0.18));
        ctx.lineTo(sx+R*0.05, baseY);
      }
      ctx.lineTo(baseX+R*0.40, baseY);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }},
    // baseball cap sitting on the crown with a forward brim
    cap: { draw(ctx, R){
      const hx=R*0.42, hy=-R*0.40, brimY=hy-R*0.28, domeR=R*0.52;
      ctx.fillStyle='#2e6fd6'; ctx.strokeStyle='#1f4e9c'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.arc(hx, brimY, domeR, Math.PI, 0); ctx.fill(); ctx.stroke();
      // forward brim (+x = facing forward)
      ctx.beginPath();
      ctx.ellipse(hx+R*0.30, brimY, domeR*0.85, R*0.11, 0, 0, Math.PI);
      ctx.fill(); ctx.stroke();
      // button on top
      ctx.fillStyle='#1f4e9c';
      ctx.beginPath(); ctx.arc(hx, brimY-domeR, R*0.06, 0, TWO_PI); ctx.fill();
    }},
    // curly handlebar moustache
    mustache: { draw(ctx, R){
      ctx.fillStyle='#3a2a1a';
      ctx.beginPath();
      ctx.moveTo(R*0.18, R*0.04);
      ctx.quadraticCurveTo(R*0.40,-R*0.06, R*0.62, R*0.04);
      ctx.quadraticCurveTo(R*0.46, R*0.12, R*0.40, R*0.06);
      ctx.quadraticCurveTo(R*0.34, R*0.12, R*0.18, R*0.04);
      ctx.closePath(); ctx.fill();
    }},
    // cute hair-bow on top
    bow: { draw(ctx, R){
      ctx.fillStyle='#ff5fa2'; ctx.strokeStyle='#d6336c'; ctx.lineWidth=1;
      const bx=R*0.30, by=-R*0.70;
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx-R*0.26,by-R*0.16); ctx.lineTo(bx-R*0.26,by+R*0.16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx+R*0.26,by-R*0.16); ctx.lineTo(bx+R*0.26,by+R*0.16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#d6336c'; ctx.beginPath(); ctx.arc(bx,by,R*0.08,0,TWO_PI); ctx.fill();
    }},
    // head bandage wrap with a knot
    bandage: { draw(ctx, R){
      ctx.fillStyle='#f3ede0'; ctx.strokeStyle='#cdc3ad'; ctx.lineWidth=1;
      ctx.save();
      ctx.translate(R*0.40,-R*0.30); ctx.rotate(-0.5);
      ctx.fillRect(-R*0.62,-R*0.10,R*1.24,R*0.20);
      ctx.strokeRect(-R*0.62,-R*0.10,R*1.24,R*0.20);
      // knot
      ctx.beginPath(); ctx.moveTo(R*0.40,0); ctx.lineTo(R*0.62,-R*0.12); ctx.lineTo(R*0.60,R*0.14); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }},
    // real over-ear headphones: a thick band arcing over the crown + two ear
    // cups on the sides of the head. Anchored to head centre (hx,hy).
    headphones: { draw(ctx, R){
      const hx=R*0.42, hy=-R*0.38;     // head centre
      const hr=R*0.74;                 // band radius (hugs over the crown)
      // padded headband arc over the top of the head
      ctx.strokeStyle='#2b2b2b'; ctx.lineWidth=R*0.18; ctx.lineCap='round';
      ctx.beginPath(); ctx.arc(hx, hy, hr, Math.PI*1.18, Math.PI*1.82); ctx.stroke();
      // thin highlight along the band
      ctx.strokeStyle='#555'; ctx.lineWidth=R*0.06;
      ctx.beginPath(); ctx.arc(hx, hy, hr, Math.PI*1.20, Math.PI*1.80); ctx.stroke();
      ctx.lineCap='butt';
      // two rounded ear cups on the sides of the head
      const cupY = hy + R*0.06, cupW = R*0.20, cupH = R*0.30;
      const cupX = hr*0.96;            // horizontal reach from head centre
      ctx.fillStyle='#333'; ctx.strokeStyle='#111'; ctx.lineWidth=1.2;
      // front cup
      ctx.beginPath(); ctx.ellipse(hx+cupX, cupY, cupW, cupH, 0, 0, TWO_PI); ctx.fill(); ctx.stroke();
      // back cup
      ctx.beginPath(); ctx.ellipse(hx-cupX, cupY, cupW, cupH, 0, 0, TWO_PI); ctx.fill(); ctx.stroke();
      // soft inner pads
      ctx.fillStyle='#6a6a6a';
      ctx.beginPath(); ctx.ellipse(hx+cupX, cupY, cupW*0.5, cupH*0.55, 0, 0, TWO_PI); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx-cupX, cupY, cupW*0.5, cupH*0.55, 0, 0, TWO_PI); ctx.fill();
    }},
    // plain — no overlay (so not everyone is decorated)
    plain: { draw(){} },
  };
  // The order here also defines the deterministic distribution bucket order.
  const COSMETIC_IDS = Object.keys(COSMETICS);

  // -------------------------------------------------------------------------
  // #3b — PER-SPECIES COSMETIC ANCHOR. Every cosmetic above is drawn around a
  // head sitting near (R*0.42, -R*0.40) with eyes ~ -R*0.32 — tuned for the
  // capybara/worm crew. Other species carry their heads/eyes elsewhere (koala
  // sits high between big ears, frog's eyes bulge up on top), so the overlay
  // floats. We fix it by translating (and lightly scaling) the WHOLE overlay
  // per species before the cosmetic draws, so hats land on the crown & glasses
  // land over the eyes for each animal. Deterministic — pure lookup, no random.
  //   dy  : vertical shift in R-units (negative = up toward a higher head)
  //   dx  : forward shift in R-units  (+x = facing forward)
  //   s   : uniform scale of the overlay (heads differ in size)
  // capybara/worm keep the identity transform so their look is untouched.
  // -------------------------------------------------------------------------
  const COSMETIC_ANCHOR = {
    capybara: { dx: 0,        dy: 0,        s: 1.00 },
    worm:     { dx: -C.UNIT_R*0.12, dy: C.UNIT_R*0.06, s: 0.92 },
    hedgehog: { dx: -C.UNIT_R*0.10, dy: C.UNIT_R*0.30, s: 0.94 }, // head low, near body centre
    beaver:   { dx: C.UNIT_R*0.06,  dy: C.UNIT_R*0.02, s: 1.00 },
    frog:     { dx: 0,        dy: -C.UNIT_R*0.24, s: 0.96 }, // bulgy eyes ride high on the crown
    bird:     { dx: -C.UNIT_R*0.04, dy: C.UNIT_R*0.06, s: 0.92 },
    koala:    { dx: -C.UNIT_R*0.06, dy: C.UNIT_R*0.18, s: 1.02 }, // head high but cosmetic origin too high → nudge down between ears
    // the 5 extra selectable species fell back to the capybara anchor → hats /
    // glasses / headphones floated off. Anchored to each one's head (fine-tune later).
    bat:      { dx: 0,              dy: -C.UNIT_R*0.30, s: 0.90 }, // small head rides high
    owl:      { dx: 0,              dy: -C.UNIT_R*0.10, s: 0.96 }, // big round head
    fox:      { dx: C.UNIT_R*0.04,  dy: C.UNIT_R*0.04,  s: 0.96 },
    cat:      { dx: 0,              dy: -C.UNIT_R*0.06, s: 0.94 },
    penguin:  { dx: 0,              dy: C.UNIT_R*0.10,  s: 0.88 }, // head low, near body top
  };
  function cosmeticAnchor(u){
    const id = (u && (u.species || u.kind)) || 'capybara';
    return COSMETIC_ANCHOR[id] || COSMETIC_ANCHOR.capybara;
  }

  // -------------------------------------------------------------------------
  // #3c — COSMETIC POSITION OVERRIDES (editor-tunable, baked-in defaults).
  // The position editor (chars.html) lets us drag a cosmetic onto each animal
  // and SAVE the result to localStorage. We read it here and apply it ON TOP
  // of the built-in per-species anchor above, so a saved tweak takes effect in
  // the actual game without re-touching this draw code each time.
  //
  // localStorage key : "ca_cosmetic_offsets"
  // JSON shape       : { "<species>|<cosmetic>": { dx, dy, scale, rot }, ... }
  //   dx, dy : EXTRA shift in R-units (px = value * C.UNIT_R), added after the
  //            per-species anchor translate. +x = facing forward, +y = down.
  //   scale  : EXTRA uniform scale MULTIPLIER on top of the anchor scale (1=none)
  //   rot    : EXTRA rotation in RADIANS, applied around the (post-shift) origin.
  // Keys:
  //   "<species>|<cosmetic>"  e.g. "frog|glasses"  — per-species-per-cosmetic.
  //   "*|<cosmetic>"          e.g. "*|glasses"     — per-cosmetic fallback
  //                                                   (applies to every species).
  // Lookup order: exact species key first, else the "*" fallback, else nothing.
  // Defensive: any read/parse error → no overrides, defaults stand. Cached once
  // and refreshable via CA.Entities.reloadCosmeticOffsets() (the editor calls it
  // through a storage event / postMessage isn't needed — same-page lives in its
  // own tab, the game re-reads on its next load).
  // -------------------------------------------------------------------------
  const COSMETIC_OFFSET_KEY = 'ca_cosmetic_offsets';
  let _cosmeticOffsets = null;     // null = not yet loaded; {} = merged result
  // SERVER-side offsets (cosmetics.php). Fetched once at boot so EVERY player
  // sees the same positions the editor saved — no per-browser localStorage needed.
  // Precedence in the merged map (loadCosmeticOffsets): baked < server < localStorage.
  // The local editor's in-progress preview (localStorage) always wins over the
  // shared server value; a fresh player (no localStorage) gets the server value.
  let _serverOffsets = null;       // null = not yet fetched; {} = fetched/empty
  let _serverFetched = false;      // guards against re-fetching on every miss
  function readLocalOffsets(){
    var out = {};
    try {
      if(typeof localStorage !== 'undefined'){
        const raw = localStorage.getItem(COSMETIC_OFFSET_KEY);
        if(raw){
          const parsed = JSON.parse(raw);
          if(parsed && typeof parsed === 'object') out = parsed;
        }
      }
    } catch(_){ out = {}; /* never break render over storage */ }
    return out;
  }
  function loadCosmeticOffsets(){
    if(_cosmeticOffsets !== null) return _cosmeticOffsets;
    // merge: server first, then localStorage on top (localStorage wins).
    var merged = {};
    try {
      if(_serverOffsets && typeof _serverOffsets === 'object'){
        for(var k in _serverOffsets){ if(Object.prototype.hasOwnProperty.call(_serverOffsets,k)) merged[k] = _serverOffsets[k]; }
      }
    } catch(_){}
    try {
      var loc = readLocalOffsets();
      for(var k2 in loc){ if(Object.prototype.hasOwnProperty.call(loc,k2)) merged[k2] = loc[k2]; }
    } catch(_){}
    _cosmeticOffsets = merged;
    return _cosmeticOffsets;
  }
  // Async: pull the shared offsets from cosmetics.php once. On success we merge
  // them in and bust the cache so the next frame draws with the global values.
  // Defensive: any failure leaves the baked/localStorage path completely intact.
  function loadServerCosmetics(){
    if(_serverFetched) return;
    _serverFetched = true;
    try {
      if(typeof fetch !== 'function') return;
      var base = (window.CA && CA.API_BASE) ? CA.API_BASE : '';
      var url = (base || '') + 'cosmetics.php';
      fetch(url, { method:'GET' }).then(function(r){
        return r && r.ok ? r.json() : null;
      }).then(function(data){
        if(data && typeof data === 'object'){
          _serverOffsets = data;
          _cosmeticOffsets = null;   // bust merge cache → re-merge on next draw
        }
      })['catch'](function(){ /* offline / 404 → keep baked + localStorage */ });
    } catch(_){ /* never break boot over a fetch */ }
  }
  // Resolve the override for a (species, cosmetic) pair, honouring the "*"
  // per-cosmetic fallback. Returns null when there is nothing to apply.
  function cosmeticOverride(species, cosmeticId){
    if(!cosmeticId) return null;
    const map = loadCosmeticOffsets();
    if(!map) return null;
    const o = map[species + '|' + cosmeticId] || map['*|' + cosmeticId];
    return (o && typeof o === 'object') ? o : null;
  }

  // small deterministic string hash (FNV-1a) -> uint32
  function hashStr(str){
    let h = 0x811c9dc5 >>> 0;
    str = String(str);
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  // pick a cosmetic id deterministically from a STABLE unit key + the world seed.
  // We use the team id + roster slot (NOT the volatile runtime u.id) because on
  // save/load the game re-spawns units with fresh ids — but the same seed, teams
  // and spawn order — so this key reproduces the identical look.
  function pickCosmetic(key){
    const seed = (S.seed!=null) ? S.seed : 0;
    const h = hashStr(key + ':' + seed);
    // ~28% get the plain look; the rest spread over the decorated traits.
    if((h % 100) < 28) return 'plain';
    const decorated = COSMETIC_IDS.filter(id=>id!=='plain');
    return decorated[(h >>> 7) % decorated.length];
  }

  // species passive id for a unit (null if unknown) ------------------------
  function passiveOf(u){
    const sp = CA.speciesOf(u);
    return sp ? sp.passive : null;
  }

  // Beaver-built walls. Owned here (entities), drawn in render, treated as
  // solid by THIS module's physics. Stored on state so save/restore & AI can
  // see them; never touches terrain internals (which are module-private).
  function walls(){ return (S.builtWalls = S.builtWalls || []); }
  function pointInWall(x, y){
    const ws = S.builtWalls; if(!ws) return false;
    for(let i=0;i<ws.length;i++){ const w=ws[i];
      if(x>=w.x && x<=w.x+w.w && y>=w.y && y<=w.y+w.h) return true; }
    return false;
  }
  // solid = terrain OR a built wall (used by unit physics & climbing)
  function solidAt(x, y){
    return CA.Terrain.isSolid(x, y) || pointInWall(x, y);
  }

  // --- UNIT-vs-UNIT vertical collision -------------------------------------
  // Units (heroes + minions, both live in S.units) can STAND ON EACH OTHER'S
  // heads instead of phasing through. radiusOf returns a unit's collision
  // radius (minions carry their own .radius; heroes use C.UNIT_R).
  function radiusOf(u){ return (u && u.minion) ? (u.radius || 10) : C.UNIT_R; }

  // Find the highest live OTHER unit whose HEAD (top) sits just beneath `u`'s
  // feet and overlaps horizontally — i.e. the surface `u` would land on. Only
  // considers units at/below the faller (their top must be near or under the
  // faller's feet) so we never snag on a unit that is actually above. Returns
  // the support unit or null. Dead units / graves are skipped (no .alive).
  // O(n) per call; n is tiny (~10-20). `feetY` is the faller's foot line.
  function unitHeadBelow(u, feetY){
    const ru = radiusOf(u);
    let best = null, bestTop = Infinity;
    const units = S.units;
    for(let i=0;i<units.length;i++){
      const o = units[i];
      if(!o || o===u || !o.alive) continue;
      const ro = radiusOf(o);
      // horizontal overlap: centres within the sum of radii (a touch tighter so
      // a unit standing clearly to the side isn't treated as a platform).
      if(Math.abs(o.x - u.x) > (ru + ro) * 0.85) continue;
      const oTop = o.y - ro;                 // the other unit's head line
      // the support must be at/below the faller's feet (within a small tolerance
      // above so a tiny pre-overlap still snaps), and be the HIGHEST such head.
      if(oTop < feetY - 4) continue;         // its head is above our feet → not below us
      // QA P1: GAP-LIMIT — csak az 1 frame-nyi zuhanáson belüli fej számít
      // támasznak. E nélkül a robbantással feldobott egység a pálya tetejéről
      // AZONNAL visszateleportált a társa fejére (se ív, se esés-sebzés).
      if(oTop - feetY > Math.max(6, (u.vy||0) + 2)) continue;
      if(oTop < bestTop){ bestTop = oTop; best = o; }
    }
    return best;
  }

  // Is it currently THIS unit's controllable turn?
  function isActiveTurn(u){
    return u && S.activeUnitId===u.id && S.mode===CA.GameState.PLAYING;
  }

  // =========================================================================
  // TASK 3 — SPEECH BUBBLES. Short Hungarian quips above an animal's head,
  // driven by game events + occasional inline triggers. Non-spammy: each unit
  // has a per-unit cooldown so they don't natter every frame.
  // =========================================================================
  // species-flavoured word lists. capybaras = chill office crew; worms = scrappy
  // production crew — a little personality in the word choice.
  const QUIPS = {
    capybara: {
      turn:  ['Én jövök!','Nyugi, megoldom.','Lássuk csak…','Oké, fókusz.'],
      fire:  ['Tűz!','Nesze!','Bumm!','Csá!'],
      hurt:  ['Aú!','Ez fájt!','Hé!','Jaj nekem!'],
      kill:  ['Megvan!','Sajnálom!','Pá-pá!','Hopp!'],
      idle:  ['Hmm…','Kávé kéne.','Szép idő.','*ásít*'],
      water: ['Jaj, a víz!','Nem tudok úszni!','Segítség!'],
      win:   ['Győztünk!','Ez az!','Adminisztráció FTW!'],
    },
    worm: {
      turn:  ['Mehet!','Na, gyerünk!','Az enyém!','Csapassuk!'],
      fire:  ['Tűz!','Nesze!','Kapd ki!','Booom!'],
      hurt:  ['Aú!','Ez fájt!','Áú, a hátam!','Hé, ez csalás!'],
      kill:  ['Megfogtalak!','Hahó!','Viszlát!','Bingó!'],
      idle:  ['Ásni jó.','Nyam, föld.','Csiribiri…','*fütyül*'],
      water: ['Vizes leszek!','Brrr!','Nem úszok!'],
      win:   ['Gyártás nyert!','Hurrá!','Megcsináltuk!'],
    },
  };
  function quipFor(u, cat){
    const k = (u && (QUIPS[u.kind] ? u.kind : (QUIPS[u.species] ? u.species : 'worm'))) || 'worm';
    const list = (QUIPS[k] && QUIPS[k][cat]) || QUIPS.worm[cat] || ['…'];
    // pick the HU phrase, then route through CA.t so EN mode shows the English
    // equivalent (HU stays the literal). Emote glyphs never pass through here.
    return CA.t(U.pick(list));
  }
  // make a unit "say" something (respects a small per-unit cooldown so kills/
  // fires that overlap don't stutter). `force` bypasses the cooldown.
  function say(u, cat, dur, force){
    if (!u || !u.alive || !u.anim) return;
    const a = u.anim;
    if (!force && (a._sayCd||0) > 0) return;
    a.bubble = quipFor(u, cat);
    a.bubbleT = dur || 1.2;
    a._sayCd = (cat==='idle') ? 6 : 2.4;   // seconds before this unit speaks again
  }

  // #35 — EMOTE bubbles. Reuse the exact same bubble mechanism as say(): just
  // pop a single glyph into anim.bubble. Cheaper than a new system and renders
  // through the existing speech-bubble path in _drawOverlay. `force` bypasses
  // the per-unit speak cooldown (used for celebrate/taunt reactions).
  function emote(u, glyph, dur, force){
    if (!u || !u.alive || !u.anim) return;
    const a = u.anim;
    if (!force && (a._sayCd||0) > 0) return;
    a.bubble = glyph;
    a.bubbleT = dur || 1.2;
    a._sayCd = 2.0;
  }

  // ---- event-driven quips -------------------------------------------------
  CA.events.on('turnStart', (teamIdx, unit)=>{
    if (unit && Math.random() < 0.7) say(unit, 'turn', 1.6, true);
    // SELECT chirp — a unit becomes active. Fired ONCE here (turnStart runs once
    // per turn), and only for a HUMAN-controlled unit so the AI doesn't spam it.
    // Guarded: a missing event bus / team lookup must never throw.
    try{
      const tm = (unit && CA.getTeam && unit.teamId!=null) ? CA.getTeam(unit.teamId) : null;
      // character voice on turn start: only ~1 in 4 turns (was every turn = annoying)
      if (unit && !(tm && tm.isAI) && Math.random() < 0.25){ CA.events.emit('sfx','select'); }
    }catch(e){}
    // clear agent movement/utility flags as the unit's NEW turn begins:
    //  • freeze protection lasts until the encased unit acts again
    //  • a leftover jetpack budget never carries between turns
    if (unit){
      // (_frozen/_frost now tick for the WHOLE team in core.startTurn — incl.
      // the stun-skip path that never emits this event; jetpack reset stays.)
      unit._jetpack = null;
    }
  });
  CA.events.on('fired', (unit)=>{
    if (unit) say(unit, 'fire', 1.0, true);
    // ADDITIVE JUICE — fire RECOIL: a brief backward lean + tiny positional
    // kick that decays over ~0.3s, read by _drawUnit's transform. The recoil
    // impulse is also fed into the verlet chain (in update) so the tail/ears
    // snap. Lean AWAY from the shot direction (opposite facing). Cosmetic only.
    if (unit && unit.anim){
      unit.anim.recoil = 1;
      unit.anim._recoilDir = -(unit.facing || 1);   // kick backward
    }
  });
  CA.events.on('unitDied', (victim)=>{
    // credit the active unit with a kill quip if it's an enemy of the victim
    const killer = CA.activeUnit();
    if (killer && killer.alive && victim && killer.id!==victim.id &&
        killer.teamId!==victim.teamId){
      if(Math.random()<0.85) say(killer, 'kill', 1.4, true);
      // little happy hop of triumph (visual only — squash/stretch bounce in the
      // render transform; never moves the unit). Throttled by its own timer.
      if(killer.anim && (killer.anim.killHop||0)<=0) killer.anim.killHop = 1;
    }
  });
  CA.events.on('gameOver', (winnerTeamId)=>{
    // CHEER — the winning team's units celebrate. Emitted ONCE per match here
    // (gameOver fires once); guarded against a missing event bus.
    try{ CA.events.emit('sfx','cheer'); }catch(e){}
    for (const u of S.units){
      if (u.alive && u.teamId===winnerTeamId){
        say(u, 'win', 3.0, true);
        // #35 — winning team celebrates: a multi-second hop + happy eyes pose.
        // staggered start so they don't all bounce in lockstep.
        const a = u.anim;
        a.celebrate = 4.0;
        a._emoteCd = (u.id % 5) * 0.25;   // delay the 💪/🎉 emote a touch
      }
    }
  });

  // #35 — TAUNT: when the active unit lands a hit on an enemy, it strikes a
  // brief cocky pose (and may flash 😎). Driven off unitDamaged so a glancing
  // hit counts too; the kill quip above still fires on unitDied.
  CA.events.on('unitDamaged', (victim, amount)=>{
    const shooter = CA.activeUnit();
    if (shooter && shooter.alive && victim && shooter.id!==victim.id &&
        shooter.teamId!==victim.teamId){
      const a = shooter.anim;
      if ((a.taunt||0) <= 0){            // don't re-trigger every damage tick
        a.taunt = 0.9;
        // landed a hit -> taunt SFX. The a.taunt<=0 guard already throttles this
        // to once per cocky-pose window (not per damage tick), so no spam.
        if(Math.random() < 0.3){ try{ CA.events.emit('sfx','taunt'); }catch(e){} }
        if ((amount||0) >= 14 && Math.random()<0.5) emote(shooter, '😎', 1.1);
      }
    }
  });

  // #35 — FLINCH: any living unit within ~120px of an explosion does a quick
  // duck/shiver. Cheap O(units) scan; staggered intensity by distance. Units
  // very close to a blast also yelp a 😱.
  CA.events.on('explosion', (x, y, radius)=>{
    const reach = 120 + (radius||0);
    for (const u of S.units){
      if (!u.alive || !u.anim) continue;
      const d = U.dist(x, y, u.x, u.y);
      if (d < reach && d > C.UNIT_R){     // skip the direct victim (it's reacting via hit/hurt)
        const near = 1 - d/reach;
        u.anim.flinch = Math.max(u.anim.flinch||0, 0.5 + near*0.4);
        u.anim._flinchDir = (x > u.x) ? -1 : 1;   // duck away from the blast
        if (near > 0.55 && Math.random() < 0.3) emote(u, '😱', 1.0);
      }
    }
  });
  // =========================================================================
  // v4 — per-ROUND ticking for class combat state + minion lifespans. Driven by
  // core's 'newRound' event (emitted once per full team rotation). Heroes tick
  // their taunt/buffs down; minions tick `life` and expire at 0. Robust: a unit
  // missing any field is tolerated.
  // =========================================================================
  function applyBuff(u, buff){
    // add a buff to a unit; {type:'shield'} immediately grows the shield pool,
    // {type:'dmg'} is stored as an outgoing multiplier consulted by shots.
    if(!u || !buff || !buff.type) return;
    u.buffs = Array.isArray(u.buffs) ? u.buffs : [];
    u.buffs.push({ type:buff.type, amt:(+buff.amt||0), turns:(buff.turns|0)||1 });
    if(buff.type==='shield') u.shield = (u.shield||0) + (+buff.amt||0);
  }
  // outgoing damage multiplier for a unit's shots from active {type:'dmg'} buffs.
  // weapons.js can read this (CA.Entities.outgoingDamageMult) to scale damage.
  function outgoingDamageMult(u){
    if(!u || !Array.isArray(u.buffs)) return 1;
    let m = 1;
    for(const b of u.buffs){ if(b && b.type==='dmg') m *= (1 + (+b.amt||0)); }
    return m;
  }
  function tickRound(){
    const units = S.units || [];
    const expired = [];
    for(const u of units){
      if(!u.alive) continue;
      // MINION lifespan (in rounds)
      if(u.minion){
        if(typeof u.life === 'number'){
          u.life -= 1;
          if(u.life <= 0){
            // skeletons & chargehogs go out with a bang; others just crumble.
            if((u.minionKind==='skeleton' || u.minionKind==='chargehog') && CA.Entities && CA.Entities._minionBoom){
              try { CA.Entities._minionBoom(u, u.minionKind); } catch(e){ u.alive=false; }
            } else {
              u.alive=false; u.vx=0; u.vy=0;
              if(u.anim){ u.anim.state='dead'; u.anim.deathT=0; }
              if(fx()) fx().spawnParticles({x:u.x,y:u.y,count:10,spdMin:0.6,spdMax:2.6,life:22,size:2.6,
                color: u.minionKind==='zombie' ? '#9bd17a' : '#b8b8c0'});
              CA.events.emit('minionExpired', u);
            }
            expired.push(u);
          }
        }
        continue;                 // minions don't carry hero taunt/buffs
      }
      // HERO combat-state decay
      if((u.taunt||0) > 0){ u.taunt = Math.max(0, u.taunt - 1); }
      if(Array.isArray(u.buffs) && u.buffs.length){
        for(const b of u.buffs){ if(b && typeof b.turns==='number') b.turns -= 1; }
        u.buffs = u.buffs.filter(b=>b && (b.turns==null || b.turns > 0));
      }
    }
  }
  CA.events.on('newRound', tickRound);

  // #35 — emote eye state for the NATIVE capy/worm draws (species.js has its own
  // `emotion()`). Cheap: just reads per-unit anim flags. happy > surprised > scared.
  function emoteEyeState(u){
    const a = u.anim || {};
    const S = CA.state;
    const happy = (a.celebrate||0) > 0 ||
                  (S.mode===CA.GameState.GAME_OVER && S.winnerTeamId!=null && u.teamId===S.winnerTeamId);
    const surprised = (a.hitFlash||0) > 0.45 || (a.flinch||0) > 0.6;
    const scared = (a.flinch||0) > 0.05;
    return { happy, surprised, scared };
  }

  // Does the current weapon use a charged "power" aim (lean-forward pose)?
  function powerWeaponEquipped(){
    try { return !!(CA.Weapons && CA.Weapons.currentWeapon && CA.Weapons.currentWeapon().power); }
    catch(e){ return false; }
  }

  CA.Entities = {
    init(ctx){ try{ loadServerCosmetics(); }catch(_){} /* pull shared cosmetic offsets once */ },

    // v5.1 — CAPTAIN PERK alkalmazása EGY helyen (friss spawn + save/load is ezen
    // megy át). A csapat MÉRETE alapján skáláz (lásd captainHpMul fent). Az AKTUÁLIS
    // (class + skill-tree utáni) maxHp-poolra hívandó, EGYSZER. maxHp-t és hp-t növeli.
    applyCaptainPerk(u, teamSize){
      if (!u) return;
      u.maxHp = Math.round(u.maxHp * captainHpMul(teamSize));
      u.hp = u.maxHp;
      return u.maxHp;
    },

    // PUBLIC: fetch the shared (server) cosmetic offsets. Safe to call multiple
    // times — it self-guards and only fetches once. Boot calls it via init().
    loadServerCosmetics(){ try{ loadServerCosmetics(); }catch(_){} },

    // v4 — public combat helpers (weapons.js / class skill-trees call these):
    //  applyBuff(unit,{type:'dmg'|'shield',amt,turns}) — adds a buff, ticked per
    //    round; 'shield' grows the shield pool immediately.
    //  outgoingDamageMult(unit) — multiplier from the unit's active 'dmg' buffs.
    //  heal(unit,amount) / revive(unit,hp) — used by heal_beam/revive weapons;
    //    clamp to maxHp and re-enter a revived unit into the turn rotation.
    applyBuff(u, buff){ try { applyBuff(u, buff); } catch(e){} },
    outgoingDamageMult(u){ try { return outgoingDamageMult(u); } catch(e){ return 1; } },

    // clamp-safe heal; returns the actual amount restored.
    heal(u, amount){
      if(!u || !u.alive) return 0;
      amount = Math.max(0, +amount||0);
      const before = u.hp;
      u.hp = U.clamp(u.hp + amount, 0, u.maxHp);
      const gained = u.hp - before;
      if(gained>0){
        if(u.anim) u.anim.hitFlash = Math.max(u.anim.hitFlash||0, 0); // no red flash on heal
        if(fx()) fx().spawnParticles({x:u.x,y:u.y-4,count:6,spdMin:0.5,spdMax:2,life:22,size:2.6,color:'#7fff9b'});
        CA.events.emit('unitHealed', u, gained);
        CA.events.emit('sfx','click');
      }
      return gained;
    },

    // bring a DEAD hero back so it re-enters the rotation (core uses
    // CA.aliveHeroesOfTeam, which keys off alive && !minion — so alive=true is
    // all that's needed). Minions can't be revived (they expire by design).
    revive(u, hp){
      if(!u || u.alive || u.minion) return false;
      u.alive = true;
      u.hp = U.clamp((typeof hp==='number' && hp>0) ? hp : Math.round(u.maxHp*0.5), 1, u.maxHp);
      u.vx = 0; u.vy = 0; u.grounded = false;
      u._blastCorpse=false; u._blastCorpseLife=0; u._blastFlight=null;
      u.shield = u.shield || 0; u.taunt = 0; u.buffs = [];
      u.cooldowns = u.cooldowns || {};
      if(u.anim){ u.anim.state='idle'; u.anim.deathT=0; u.anim.hitFlash=0; }
      // reset grave physics so a future death starts fresh
      u._graveVy=0; u._graveSettled=false; u._graveY=null;
      if(fx()) fx().spawnParticles({x:u.x,y:u.y-6,count:12,spdMin:0.6,spdMax:2.6,life:30,size:3,color:'#cfffe0'});
      CA.events.emit('unitRevived', u);
      CA.events.emit('sfx','jump');
      return true;
    },

    // -----------------------------------------------------------------------
    // PvE BOSS upgrade — turn an already-spawned hero into a giant boss variant.
    //   makeBoss(unit, def) where def = {
    //     id:'megaworm'|'barrelgolem'|'necroqueen', name, hp, scale, color, signature }
    // Scales HP + visual size (_bossScale, read by _drawUnit) and flags _boss so
    // the draw path adds a crown/aura + the mode telegraphs its signature attack.
    // NEVER throws — a broken boss def must not stop the match.
    makeBoss(u, def){
      try{
        if(!u) return u;
        def = def || {};
        u._boss = true;
        u._bossId = def.id || 'boss';
        u._bossScale = (typeof def.scale==='number' && def.scale>0) ? def.scale : 1.9;
        u._bossSignature = def.signature || null;
        if(def.name) u.name = def.name;
        if(def.color) u._bossColor = def.color;
        const hp = (typeof def.hp==='number' && def.hp>0) ? def.hp : 360;
        u.maxHp = hp; u.hp = hp;
        // bosses brush off knockback a touch (heavier body)
        u._kbResist = (typeof def.kbResist==='number') ? def.kbResist : 0.45;
      }catch(e){}
      return u;
    },

    spawnTeams(teams){
      teams = teams || S.teams;
      const margin = 120;
      const span = C.WORLD_W - margin*2;
      // units per team: explicit team.size, else this game's S.teamSize override
      // (from the New Game "units / team" picker), else the global default.
      const sizeOf = (t)=> Math.max(1, Math.min(8, (t && t.size|0) || (S.teamSize|0) || C.TEAM_SIZE));
      const total = teams.reduce((n,t)=> n + sizeOf(t), 0);
      const placed = []; // x positions already used (avoid overlap)
      const minGap = C.UNIT_R*2 + 26;

      // Interleave teams across the map so opponents aren't all clustered.
      let slot = 0;
      teams.forEach((team)=>{
        team.unitIds = team.unitIds || [];
        // team species (fallback to kind); a team-builder may pass per-unit specs.
        const teamSpecies = team.species || team.kind;
        const perUnit = Array.isArray(team.units) ? team.units : null;
        const roster = CA.rosterOf ? CA.rosterOf(team.kind).names
                       : (CA.ROSTER && CA.ROSTER[team.kind] && CA.ROSTER[team.kind].names);
        const names = roster && roster.length ? roster
                     : (team.kind==='capybara' ? CAPY_NAMES : WORM_NAMES);
        const teamSize = sizeOf(team);
        for(let i=0;i<teamSize;i++){
          const uspec = perUnit && perUnit[i] ? perUnit[i] : null;
          const species = (uspec && uspec.species) || teamSpecies || team.kind;
          let x = margin + (span/(total+1))*(slot+1);
          x = this._findSpawnX(x, placed, minGap, margin);
          placed.push(x);
          slot++;

          // Drop onto terrain top; never let feet start under water.
          // LIVE water level — in sudden death S.waterLevel rises every round and
          // mid-game spawns (survival waves, gauntlet recruits) reuse this path;
          // clamping to the static config line parked fresh units UNDER water.
          const _wl = (S.waterLevel != null ? S.waterLevel : C.WATER_LEVEL);
          let topY = CA.Terrain.heightAt(x);
          if(topY >= C.WORLD_H) topY = _wl - 4; // no ground column -> sit near water line
          let cy = topY - C.UNIT_R - 1;
          if(cy + C.UNIT_R > _wl) cy = _wl - C.UNIT_R - 2;

          const facing = (x < C.WORLD_W/2) ? 1 : -1;
          const name = (uspec && uspec.name) || names[i % names.length];
          const u = {
            id: U.nextId(),
            teamId: team.id,
            kind: team.kind,
            species,                       // #6/#7 — drives draw() + passive
            name,
            x, y: cy,
            vx: 0, vy: 0,
            hp: C.UNIT_MAX_HP, maxHp: C.UNIT_MAX_HP,
            alive: true,
            facing,
            aimAngle: 0.5 * facing,
            grounded: false,
            buildsLeft: 2,                 // beaver 'build' charges
            glideUsed: false,             // bird 'glide' once-per-airtime
            // v4 CLASS-HERO combat state (always present; _assignClass tunes them)
            cls: null, cooldowns: {}, shield: 0, taunt: 0, buffs: [],
            anim: { state:'idle', t: U.rand(0,100), blink:0, blinkAt:U.rand(40,160),
                    land:0, hitFlash:0, deathT:0, walkPhase:U.rand(0,TWO_PI),
                    rolling:false, rollSpin:0, gliding:false, _aiming:false,
                    bubble:null, bubbleT:0,
                    // #35 richer emotes — short anim states read by the render path
                    flinch:0, _flinchDir:1, celebrate:0, taunt:0,
                    // richer hurt/jump juice
                    hurtKick:0, _hurtDir:-1, hitFlashWhite:0,
                    jumpCrouch:0, airStretch:0, killHop:0,
                    idleAnim:null, idleAnimT:0, idleAnimAt:U.rand(120,300),
                    blinkKind:0,
                    // ADDITIVE JUICE — fire recoil (decays ~0.3s) + verlet
                    // secondary-motion chain (lazily built in update()).
                    recoil:0, _recoilDir:-1, tail:null, _px:0, _py:0,
                    _emoteCd:0 },
          };
          // #3 per-unit appearance trait — deterministic from (team,slot)+seed so
          // it survives save/load (units re-spawn with fresh ids but identical
          // seed+order). Honour an explicit team-editor choice if given.
          u.cosmetic = { id: (uspec && uspec.cosmetic) || pickCosmetic(team.id + '#' + i) };
          // v4.10 — persistent-team identity: stamp the saved team id (_tid) and
          // this animal's stable unit id (_uid) so the per-animal skill tree applies
          // at spawn and earns XP at game-over. Also flag the captain (cosmetic only).
          u._tid = (team.tid != null) ? team.tid : null;
          u._uid = (uspec && uspec.uid != null) ? uspec.uid : null;
          u._captain = (team.captain != null && team.captain === i);
          // grave-marker physics state (#9) — only used once dead.
          u._graveVy = 0; u._graveSettled = false; u._graveY = null;
          // v4 — CLASS-HERO assignment + apply (combat fields, baseHp, skill tree)
          this._assignClass(u, team, uspec, i);
          // v5.0 — CAPTAIN PERK (#5): the team captain is a tankier leader. Applied
          // AFTER _assignClass so it scales off the FINAL pool (classic + class +
          // skill-tree HP all included). The gold-star marker is now a real asset,
          // not just cosmetic. v5.1: a perk a csapatMÉRETtel skáláz (captainHpMul),
          // EGY közös helyen (applyCaptainPerk) — a save/load is ezt hívja.
          if (u._captain){ this.applyCaptainPerk(u, teamSize); }
          S.units.push(u);
          team.unitIds.push(u.id);
        }
      });
    },

    // -----------------------------------------------------------------------
    // v4 — assign a CLASS to a freshly-spawned hero and apply it. Robust to a
    // totally absent class system (CA.Classes empty) and absent meta/skill-tree.
    //  • cls comes from uspec.cls, else team.classes[i], else a deterministic
    //    rotation over the registered classes (variety) — but only if any exist.
    //  • applying sets maxHp/hp from the class baseHp, (re)inits combat fields,
    //    then walks the class skill-tree applying each unlocked node at its rank.
    // NEVER throws: a broken class def must not stop a unit from spawning.
    _assignClass(u, team, uspec, idx){
      try {
        // combat fields are guaranteed present (set in the unit literal) — keep
        // them clean here too in case a caller reused an object.
        u.cooldowns = u.cooldowns || {};
        u.shield = u.shield || 0;
        u.taunt  = u.taunt  || 0;
        u.buffs  = Array.isArray(u.buffs) ? u.buffs : [];

        const reg = CA.Classes || {};
        const ids = (typeof reg.list === 'function') ? reg.list() : [];
        // pick a class id (only if the registry actually has classes)
        let cls = (uspec && uspec.cls) ||
                  (team && Array.isArray(team.classes) ? team.classes[idx] : null) ||
                  null;
        if (!cls && ids.length){
          // deterministic rotation: team offset + slot, so a 6-class spread cycles
          const off = (team && team.id != null) ? (team.id|0) : 0;
          cls = ids[(off + idx) % ids.length];
        }
        if (!cls || !reg[cls]){ u.cls = u.cls || null; return; }   // classic (no class) — leave as-is
        u.cls = cls;
        const def = reg[cls];
        // v4.3: a hero renders as its TEAM SPECIES (a Capybara team is ALL
        // capybaras, a Worm team is ALL worms) — the CLASS shows ONLY as an
        // overlay (hat / shield / aura) + its abilities. Earlier builds overrode
        // u.species with the class animal (necro=bat, mage=owl…) which mixed the
        // species inside one team; reverted so teams are single-species "animal
        // groups" again, with the class as a visible ROLE on top.

        // baseHp drives the hero's pool; fall back to the unit's current max.
        const baseHp = (typeof def.baseHp === 'number' && def.baseHp > 0) ? def.baseHp : (u.maxHp || 100);
        u.maxHp = baseHp;
        u.hp = baseHp;

        // skill-tree: apply every unlocked node at its rank. rank source (v4.10) =
        // CA.Meta.skillRankForUnit(u,nodeId): prefers this ANIMAL's per-team tree
        // (u._tid/_uid), else falls back to the per-class tree, else 0.
        const tree = Array.isArray(def.tree) ? def.tree : [];
        const rankOf = (CA.Meta && typeof CA.Meta.skillRankForUnit === 'function')
          ? (nodeId)=>{ try { return CA.Meta.skillRankForUnit(u, nodeId) | 0; } catch(e){ return 0; } }
          : ((CA.Meta && typeof CA.Meta.skillRank === 'function')
              ? (nodeId)=>{ try { return CA.Meta.skillRank(cls, nodeId) | 0; } catch(e){ return 0; } }
              : ()=>0);
        for (const node of tree){
          if (!node || typeof node.apply !== 'function') continue;
          let rank = rankOf(node.id);
          if (rank > 0){
            if (typeof node.max === 'number') rank = Math.min(rank, node.max);
            try { node.apply(u, rank); } catch(e){ /* one bad node never breaks spawn */ }
          }
        }
        // skill-tree nodes may have bumped maxHp (e.g. unit.maxHp += X). A fresh
        // hero spawns at FULL health, so top hp up to the (possibly larger) pool.
        // (A node that explicitly set u.hp lower than maxHp is still honoured.)
        // v4 class-passive FLOORS — the class identity is always on, even at
        // skill-rank 0 (before any skill-tree node is unlocked). Defensive Math.max
        // so a higher tree-granted multiplier is never clobbered.
        try {
          const pas = def && def.passive;
          if (pas === 'mage')  u._dmgMul     = Math.max(u._dmgMul     || 1, 1.15);  // arcane: +15% shot dmg
          if (pas === 'build') u._buildHpMul = Math.max(u._buildHpMul || 1, 1.2);   // engineer: +20% build hp
          // necro 'summon' (minion longevity) & hunter 'sniper' (base crit) are
          // owned by the weapons.js agent — NOT duplicated here.
        } catch(e){ /* never block spawn on a passive floor */ }
        if (u.maxHp < 1) u.maxHp = 1;
        u.hp = u.maxHp;     // fresh hero spawns at full (incl. any +maxHp from the tree)
        if (typeof u.shieldBase === 'number' && u.shieldBase > 0) u.shield = Math.max(u.shield, u.shieldBase);
      } catch(e){ /* never block spawning on a class error */ if(u && u.cls===undefined) u.cls=null; }
    },

    _findSpawnX(x, placed, minGap, margin){
      // nudge sideways until not overlapping & not over deep water column
      let tries = 0, dir = 1, step = 18;
      // mid-game waves: also avoid spawning ON TOP of any ALIVE unit already on
      // the field, or inside the nest (nest-defense mode) — otherwise enemies
      // land on the player / inside the nest and instantly do damage.
      const nest = (S.modeData && S.modeData.nest) ? S.modeData.nest : null;
      // #2 — never spawn onto a MOVING platform (islands raft etc.): if a unit
      // lands on the raft it gets ferried off / dumped into the water ("mozgó
      // platformon spawnoltam"). Reject any column inside a platform's FULL
      // horizontal sweep so the chosen X always rests on solid, static ground.
      const onMovingPlatform = (px)=>{
        const plats = CA.Terrain && CA.Terrain.platforms;
        if(!plats || !plats.length) return false;
        for(const pl of plats){
          if(!pl) continue;
          // y-axis lifts don't change which column they cover; x-axis rafts do.
          const sweep = (pl.axis === 'y') ? 0 : ((pl.range||0)*0.5 + 8);
          const lo = (pl.x0|0) - sweep;
          const hi = (pl.x0|0) + (pl.w||0) + sweep;
          if(px >= lo && px <= hi) return true;
        }
        return false;
      };
      const ok = (px)=>{
        if(px<margin || px>C.WORLD_W-margin) return false;
        for(const p of placed) if(Math.abs(p-px)<minGap) return false;
        // keep clear of existing live units
        for(const u of S.units) if(u && u.alive && Math.abs(u.x-px)<minGap) return false;
        // keep clear of the nest footprint
        if(nest && typeof nest.x==='number' && Math.abs(nest.x-px) < ((nest.r||0)+40)) return false;
        // never land on a moving platform (would carry the unit off / drown it)
        if(onMovingPlatform(px)) return false;
        // avoid columns whose ground is at/under the LIVE water (sudden death
        // raises S.waterLevel; static C.WATER_LEVEL let risen-water columns pass)
        const _wl = (S.waterLevel != null ? S.waterLevel : C.WATER_LEVEL);
        const top = CA.Terrain.heightAt(px);
        if(top < _wl - 8) return true;                 // solid land above water
        return false;
      };
      let px = x;
      while(!ok(px) && tries<80){ px = x + dir*step*((tries>>1)+1); dir*=-1; tries++; }
      if(tries>=80){
        // last resort: accept overlap, but STILL keep off a moving platform and
        // out of deep water if we can find any such column by a coarse scan.
        px = U.clamp(x, margin, C.WORLD_W-margin);
        const _wl2 = (S.waterLevel != null ? S.waterLevel : C.WATER_LEVEL);
        if(onMovingPlatform(px) || CA.Terrain.heightAt(px) >= _wl2 - 8){
          for(let sx=margin; sx<=C.WORLD_W-margin; sx+=14){
            if(!onMovingPlatform(sx) && CA.Terrain.heightAt(sx) < _wl2 - 8){ px = sx; break; }
          }
        }
      }
      return px;
    },

    // -----------------------------------------------------------------------
    update(dt){
      const k = dt || 1; // dt normalized to ~1 @60fps
      const waterY = (S.waterLevel!=null) ? S.waterLevel : C.WATER_LEVEL; // #5 dynamic
      const surf = surface(); // #7 — friction model for the current theme/weather
      // Cull DEAD minions so a drowned/expired one never lingers on screen (heroes
      // keep a body/gravestone; minions vanish). Done BEFORE the loop = frame-safe.
      // (Jani: "lövegtorony vízbe esett, nem tűnik el")
      if(S.units){ for(var _q=0;_q<S.units.length;_q++){ var _m=S.units[_q]; if(_m && _m.minion && !_m.alive){ S.units=S.units.filter(function(u){return u && (u.alive || !u.minion);}); break; } } }
      for(const u of S.units){
        const a = u.anim;

        if(!u.alive){
          // A fatal blast still has a physical aftermath. Do not turn its
          // launched body into a stationary grave until it actually lands.
          if (u._blastCorpse){
            this._updateBlastCorpse(u,k,waterY);
            a.deathT=Math.min(0.32,(a.deathT||0)+0.006*k);
            continue;
          }
          a.deathT += 0.04*k;
          // #9 — the grave-marker is a physics object: if the ground under it is
          // later destroyed (by an explosion), it falls and re-settles on the
          // terrain below, instead of floating in mid-air.
          this._updateGrave(u, k);
          continue;
        }

        // v4 — MINIONS run their own cheap physics + AI and skip all the hero
        // personality/passive logic below. They never take turns; their AI acts
        // every frame. _updateMinion handles gravity, terrain, contact & drown.
        if(u.minion){
          try { this._updateMinion(u, k, waterY, surf); } catch(e){ /* never throw */ }
          continue;
        }

        const passive = passiveOf(u);
        if (u._blastFlight){
          const flight=u._blastFlight;
          flight.age+=k;
          if ((u.grounded && Math.hypot(u.vx,u.vy)<0.65) || flight.age>420){
            u._blastFlight=null;
          } else {
            flight.rotation+=flight.spin*k;
            if (fx() && CA.FX.knockbackTrail) CA.FX.knockbackTrail(u);
          }
        }

        // --- advance animation timers ---
        a.t += 0.12*k;
        if(a.hitFlash>0) a.hitFlash = Math.max(0, a.hitFlash - 0.06*k);
        if(a.land>0)     a.land     = Math.max(0, a.land - 0.08*k);
        if(a.bubbleT>0)  a.bubbleT  = Math.max(0, a.bubbleT - 0.016*k);
        else a.bubble = null;
        // TASK 3 — speech-bubble cooldown + occasional idle/danger quips
        if(a._sayCd>0) a._sayCd = Math.max(0, a._sayCd - 0.016*k);
        // expose "aiming" pose flag for species draw() (#28 emotions)
        a._aiming = isActiveTurn(u) && powerWeaponEquipped();
        // blink scheduler — staggered per unit id so the whole team never blinks
        // on the same frame (deterministic-leaning: id offsets the first blink).
        a.blinkAt -= k;
        if(a.blink>0){ a.blink -= k; }
        else if(a.blinkAt<=0){
          // blink VARIETY so the team never feels robotic: most are a normal
          // single blink, a few are a quick double-blink, a rare one is a slow
          // sleepy blink. blinkKind is read by the eye drawer (purely cosmetic).
          const r = (u.id*29 + Math.floor(a.t)) % 10;
          if(r===0){ a.blink = 14; a.blinkKind = 2; }          // slow sleepy blink
          else if(r<=2){ a.blink = 6;  a.blinkKind = 1; }      // quick double-blink
          else { a.blink = 7;  a.blinkKind = 0; }              // normal blink
          a.blinkAt = 70 + (u.id*37 % 140) + U.rand(0,40); // staggered, mostly fixed
        } else if(a.blink<=0 && a.blinkKind===1 && a.blinkAt>40 && (u.id*7+Math.floor(a.t*3))%17===0){
          // the second flick of a double-blink shortly after the first closes
          a.blink = 5; a.blinkKind = 0;
        }

        // v4 — shield-hit flash decay (bluish ring drawn while >0)
        if(a._shieldHit>0) a._shieldHit = Math.max(0, a._shieldHit - 0.05*k);
        // STUN ("Szédülés") — short pop after a daze is applied/consumed (decays).
        if(a.stunPop>0) a.stunPop = Math.max(0, a.stunPop - 0.04*k);

        // #35 — short reaction/emote anim timers (all read by the render path).
        if(a.flinch>0)    a.flinch    = Math.max(0, a.flinch    - 0.05*k);
        if(a.taunt>0)     a.taunt     = Math.max(0, a.taunt     - 0.03*k);
        // HURT recoil + bright "again" flash decay (faster than the red hitFlash
        // so the kick is snappy and the white pop is just a couple of frames).
        if(a.hurtKick>0)     a.hurtKick     = Math.max(0, a.hurtKick     - 0.11*k);
        if(a.hitFlashWhite>0)a.hitFlashWhite= Math.max(0, a.hitFlashWhite- 0.22*k);
        // JUMP juice: the takeoff crouch pops fast; the in-air stretch is held
        // while rising fast and eased out as the unit slows / falls / lands.
        if(a.jumpCrouch>0) a.jumpCrouch = Math.max(0, a.jumpCrouch - 0.30*k);
        if(!u.grounded){
          // stretch proportional to upward speed (tall on the way up, neutral at apex)
          const up = U.clamp((-u.vy)/7, 0, 1);
          a.airStretch += (up - a.airStretch) * Math.min(1, 0.25*k);
        } else if(a.airStretch>0){
          a.airStretch = Math.max(0, a.airStretch - 0.30*k);
        }
        // happy hop after a kill (set by the unitDied handler) pops then settles.
        if(a.killHop>0) a.killHop = Math.max(0, a.killHop - 0.04*k);
        // FIRE RECOIL — backward lean + small positional kick that decays over
        // ~0.3s (≈18 frames @60). Triggered by the 'fired' event (see below).
        // Read by _drawUnit's transform; never touches physics/aim.
        if(a.recoil>0) a.recoil = Math.max(0, a.recoil - 0.055*k);
        // VERLET secondary motion — only worth ticking when motion can read
        // (not low-quality, not reducedMotion). Lazily build the chain. Drive
        // it with the unit's own frame displacement + the recoil impulse so the
        // back appendage lags on walk/jump and snaps on a shot.
        {
          const reducedMv = !!(CA.settings && CA.settings.reducedMotion);
          const lowQ = !!(CA.settings && CA.settings.quality === 'low');
          if(!reducedMv && !lowQ){
            if(!a.tail) a.tail = makeChain();
            // frame displacement in the unit's facing-LOCAL space (so the sway
            // direction is consistent regardless of which way it faces).
            const fdx = (u.x - (a._px||u.x)) * (u.facing||1);
            const fdy = (u.y - (a._py||u.y));
            // recoil shoves the chain forward (opposite the lean) as a one-shot
            // impulse, scaled by how fresh the recoil is.
            const rImp = a.recoil>0 ? a.recoil*2.2 : 0;
            tickChain(a.tail, U.clamp(fdx + rImp*(a._recoilDir||-1), -6, 6),
                              U.clamp(fdy, -6, 6), k, 0.55);
          } else if(a.tail){
            a.tail = null;   // free it if settings flipped to reduced/low
          }
          a._px = u.x; a._py = u.y;
        }
        if(a._emoteCd>0)  a._emoteCd  = Math.max(0, a._emoteCd  - 0.016*k);
        if(a.celebrate>0){
          a.celebrate = Math.max(0, a.celebrate - 0.016*k);
          // pop a 💪 emote once, after the per-unit stagger delay elapses
          if(a._emoteCd<=0 && !a.bubble && a.celebrate>2.0){ emote(u, '💪', 1.4, true); a._emoteCd=99; }
        }
        // #35 — idle micro-animations: at long, staggered intervals a standing,
        // non-active unit does a tiny "look around" / "yawn" so it feels alive.
        if(a.idleAnimT>0){
          a.idleAnimT = Math.max(0, a.idleAnimT - k);
          if(a.idleAnimT<=0) a.idleAnim = null;
        } else {
          a.idleAnimAt -= k;
          if(a.idleAnimAt<=0){
            if(u.grounded && a.state==='idle' && !isActiveTurn(u) && a.celebrate<=0){
              const r = (u.id*53 + Math.floor(a.t)) % 3;
              a.idleAnim = (r===0) ? 'look' : (r===1) ? 'yawn' : 'twitch';
              a.idleAnimT = (a.idleAnim==='yawn') ? 80 : 50;
              if(a.idleAnim==='yawn' && !a.bubble) emote(u, '😴', 1.4);
            }
            a.idleAnimAt = U.rand(150,360);              // varied gap (more lively)
          }
        }

        // --- physics: gravity (ONLY while airborne) + integrate ---
        // Applying gravity every frame even at rest was the cause of the 1px
        // "shake": gravity nudged the unit down, collision shoved it back up,
        // forever. Gating gravity on !grounded + holding a resting unit still
        // (no per-frame reposition) makes grounded units perfectly stable.
        // bird 'glide': while airborne, moving & still rising-or-falling slowly,
        // reduced gravity. Activated in jump(); auto-ends on land.
        // low-gravity utility (weapons.js): a temporary, turn-scoped multiplier on
        // gravity for units AND projectiles. Read via CA.gravityMult() (1 normally).
        const gMul = (CA.gravityMult ? CA.gravityMult() : 1);
        let grav = C.GRAVITY * gMul;
        if(passive==='glide' && a.gliding && !u.grounded){
          grav = C.GRAVITY * gMul * 0.32;          // float
          if(u.vy > 2.6) u.vy = 2.6;               // terminal-velocity cap while gliding
          // tiny lift wobble + feather particles
          if((S.frame % 6)===0 && fx())
            fx().spawnParticles({x:u.x,y:u.y+C.UNIT_R*0.5,count:1,spdMin:0.2,spdMax:0.8,life:20,size:2,color:'#fff'});
        }
        if(!u.grounded) u.vy += grav*k;

        // JETPACK (weapons.js sets u._jetpack={fuel}). While the active, controllable
        // unit holds a movement key, burn fuel for upward/lateral thrust. Mirrors the
        // parachute-flag pattern: state lives entirely on the unit + here. Ends when
        // the fuel runs out OR the unit catches fire (a burning pilot can't fly).
        if(u._onFire>0) u._onFire = Math.max(0, u._onFire - k);
        if(u._jetpack){
          if((u._onFire||0) > 0){
            u._jetpack = null;                      // on fire → jetpack cuts out
          } else if(isActiveTurn(u) && CA.canControl && CA.canControl()){
            const inp = S.input || {};
            let thrust = false;
            if(inp.up){    u.vy -= 0.62*k; thrust = true; }     // lift (beats gravity)
            if(inp.left){  u.vx -= 0.22*k; u.facing=-1; thrust = true; }
            if(inp.right){ u.vx += 0.22*k; u.facing=1;  thrust = true; }
            if(thrust){
              u.grounded = false;
              u.vy = U.clamp(u.vy, -6.5, 8);        // cap climb speed
              u.vx = U.clamp(u.vx, -5, 5);
              u._jetpack.fuel -= k;
              if((S.frame % 2)===0 && fx())
                fx().spawnParticles({x:u.x, y:u.y+C.UNIT_R-2, count:2, spdMin:0.6, spdMax:2.2, life:14, size:2.6, color:'#fc6'});
              if(u._jetpack.fuel <= 0){ u._jetpack = null; }     // out of gas
            }
          }
        }
        // PER-STEP SPEED CAP (anti knockback-teleport). Blast impulses are additive
        // (u.vx/vy += …), so a close / powerful / stacked (cluster, chained) hit can
        // pile velocity far past a renderable per-step move (repro saw up to ~138
        // px/step). Uncapped, the loop's 1–3 steps/frame traverse the whole airborne
        // arc in a single rendered frame → the unit "flew up then instantly appeared
        // where it would have landed" (Jani's offline glitch). Cap the SPEED (keeps
        // direction) so the arc always animates; 22 px/step is generous — still a
        // punchy, far-flying launch, just spread over more frames. Also doubles as a
        // sane terminal velocity (prevents fast-fall tunnelling into terrain).
        var _sp = Math.hypot(u.vx, u.vy);
        if(_sp > 22){ var _sc = 22/_sp; u.vx *= _sc; u.vy *= _sc; }
        // DEDICATED FALL terminal velocity (anti "teleport to the platform below"
        // on stacked maps like Ég). A long drop with uncapped downward speed crossed
        // a thin gap in ~1 frame and read as a teleport (Jani). Capping vy only (not
        // vx) keeps the knockback arc's horizontal reach but always animates the fall
        // over several frames and stops fast-fall tunnelling through thin platforms.
        if(u.vy > 17) u.vy = 17;
        u.x  += u.vx*k;
        u.y  += u.vy*k;

        // horizontal air/ground friction. #7 — ground friction is now surface-
        // dependent: slippery (snow/ice/weather-slip) retains momentum so units
        // glide a bit after stopping; sticky/normal use the original grip. Air
        // friction is unchanged. The rest-snap epsilon is widened on ice so a
        // long, gentle creep is allowed (still snapped to 0 to avoid jitter).
        u.vx *= u.grounded ? Math.pow(surf.groundFric, k) : Math.pow(0.985, k);
        if(Math.abs(u.vx) < surf.restEps) u.vx = 0;

        // --- world bounds (horizontal) ---
        if(u.x < C.UNIT_R){ u.x = C.UNIT_R; if(u.vx<0) u.vx=0; }
        if(u.x > C.WORLD_W-C.UNIT_R){ u.x = C.WORLD_W-C.UNIT_R; if(u.vx>0) u.vx=0; }
        // --- world ceiling: a strong upward knockback could fling a unit far
        // above the world where the camera can't follow. Allow a small arc up
        // but clamp so it never flies to infinity.
        if(u.y < -240){ u.y = -240; if(u.vy < 0) u.vy = 0; }

        // --- terrain collision / resting ---
        const feetY = u.y + C.UNIT_R;
        const wasGrounded = u.grounded;

        if(solidAt(u.x, feetY)){
          // feet INSIDE solid -> landing: fall damage (only if we were falling) + push up
          const fallV = u.vy;
          // swimmers & gliders take softer falls (#7 — subtle, not OP)
          let fallMin = C.FALL_DMG_MIN_V;
          if(passive==='glide') fallMin += 4;
          if(passive==='leap')  fallMin += 3;   // frogs are built to land
          if(!wasGrounded && fallV > fallMin){
            this.damage(u, (fallV - fallMin) * C.FALL_DMG_SCALE);
            a.land = 1; // big squash
            if(fx()) fx().spawnParticles({x:u.x,y:feetY,count:6,spdMin:0.5,spdMax:2.2,life:18,size:2.5,color:'#9c7a45'});
            // a soft sideways dust puff fanning out from the feet on a hard landing
            if(fx() && CA.FX.dustPuff){ try{ CA.FX.dustPuff(u.x, feetY, 0, 1.0); }catch(_){ } }
            CA.events.emit('sfx','land');
          } else if(!wasGrounded && fallV>1.5){
            a.land = U.clamp(fallV/14, 0, 0.7);
            // gentle touchdown puff for ordinary little hops/steps off ledges
            if(fallV>3.5 && fx() && CA.FX.dustPuff){ try{ CA.FX.dustPuff(u.x, feetY, 0, 0.5); }catch(_){ } }
          }
          // push fully out of solid ground if embedded. The old cap of 60px
          // couldn't lift a unit that ended up deep inside thick terrain (e.g.
          // a teleport into a hillside) -> it stayed buried and stuck. Allow the
          // push to span the full terrain depth so a unit can never wedge inside.
          let guard=0;
          while(solidAt(u.x, u.y+C.UNIT_R) && guard<C.WORLD_H){ u.y -= 1; guard++; }
          u.vy = 0; u.grounded = true;
        } else if(u.vy >= 0 && solidAt(u.x, feetY+1)){
          // resting ~1px above the surface -> HOLD still. No reposition => no jitter.
          u.vy = 0; u.grounded = true;
        } else if(u.vy >= 0 && (solidAt(u.x, feetY+2) || solidAt(u.x, feetY+3))){
          // a small gap below (≤3px) and settling -> drop onto the surface ONCE
          let sy = Math.floor(feetY)+2;
          while(!solidAt(u.x, sy) && sy < feetY+5) sy++;
          u.y = sy - C.UNIT_R - 1; u.vy = 0; u.grounded = true;
        } else {
          // airborne (or moving up) -> sidewall resolution so we don't tunnel into cliffs
          u.grounded = false;
          const probe = u.y + C.UNIT_R - 6;
          if(u.vx>0 && solidAt(u.x+C.UNIT_R, probe)){ u.x -= u.vx*k; u.vx=0; }
          else if(u.vx<0 && solidAt(u.x-C.UNIT_R, probe)){ u.x -= u.vx*k; u.vx=0; }
        }

        // --- UNIT-vs-UNIT: stand on another unit's HEAD ----------------------
        // The terrain pass above runs first (it owns fall-damage & terrain
        // grounding). If the terrain did NOT ground us, but a live unit's head
        // is directly below our feet, REST ON IT. This lets a falling/standing
        // unit sit on top of another instead of phasing through, and the head-
        // unit reads as a solid surface so the rider can walk/jump off it.
        if(!u.grounded && u.vy >= 0){
          const support = unitHeadBelow(u, feetY);
          if(support){
            const supTop = support.y - radiusOf(support);
            const restY  = supTop - C.UNIT_R;        // our centre when standing on its head
            // only land if we're at/above that rest line (settling down onto it),
            // not punching up through it from below.
            if(u.y <= restY + C.UNIT_R){
              // soft fall-damage parity with terrain: a hard drop onto a head still
              // hurts a little (re-uses the same threshold), but no terrain dust.
              const fallV = u.vy;
              let fallMin = C.FALL_DMG_MIN_V;
              if(passive==='glide') fallMin += 4;
              if(passive==='leap')  fallMin += 3;
              if(!wasGrounded && fallV > fallMin){
                this.damage(u, (fallV - fallMin) * C.FALL_DMG_SCALE);
                a.land = 1;
                CA.events.emit('sfx','land');
              } else if(!wasGrounded && fallV>1.5){
                a.land = U.clamp(fallV/14, 0, 0.7);
              }
              // SNAP to the head + a 1px tolerance so two stacked units don't
              // micro-bounce (the rider sits a hair above, gravity is gated off
              // by grounded, so it stays perfectly still — same anti-jitter trick
              // the terrain rest uses).
              u.y = restY - 1;
              u.vy = 0;
              u.grounded = true;
            }
          }
        }

        // SIDE-PUSH: if two LIVE units are essentially on the same spot
        // horizontally (centres almost coincident) gently shove them apart so a
        // pair can't permanently occupy the same column and "fuse". Tiny, capped,
        // and only when very overlapped → no visible jitter for normal spacing.
        if(u.alive){
          const units = S.units;
          for(let i=0;i<units.length;i++){
            const o = units[i];
            if(!o || o===u || !o.alive) continue;
            const minDx = (radiusOf(u) + radiusOf(o)) * 0.6;
            const dx = u.x - o.x;
            const ady = Math.abs(u.y - o.y);
            // only resolve when nearly co-located both axes (true overlap, not a
            // stack where one is clearly on the other's head).
            if(Math.abs(dx) < minDx && ady < (radiusOf(u)+radiusOf(o))*0.5){
              const push = Math.min(1.2, (minDx - Math.abs(dx)) * 0.5);
              const dir = (dx >= 0) ? 1 : -1;
              const nx = U.clamp(u.x + dir*push, C.UNIT_R, C.WORLD_W-C.UNIT_R);
              // don't shove INTO a wall/terrain at body height.
              if(!solidAt(nx, u.y + C.UNIT_R - 6)) u.x = nx;
              break;                                  // one nudge per frame is enough
            }
          }
        }

        // glide ends + glide-charge resets the moment we touch ground
        if(u.grounded){ a.gliding = false; u.glideUsed = false; }

        // --- DROWN-OR-SWIM (uses DYNAMIC waterLevel, #5) -----------------------
        // Core rule: a unit that is NOT the active unit (it's not its turn) and
        // is in DEEP water DROWNS — it sinks with a bubbling effect, then dies.
        // The ACTIVE unit keeps the SWIM grace: it floats on the surface (buoyant
        // bob + drag) so the player can paddle back to shore, and only takes the
        // slow drown trickle if shoved very deep under. The capybara 'swim'
        // species trait floats longer even when active (extra buoyancy + a softer,
        // slower drown), so a capy that falls in off-turn lingers a beat instead
        // of going down like a stone. Deterministic + guarded; the shallow /
        // rising-water interaction is unchanged (shallow standing = not "deep").
        const submersion = (u.y + C.UNIT_R*0.6) - waterY;   // >0 once the lower body touches the water
        const inWater = submersion > 0;
        const canSwim = (passive === 'swim');                // capybara
        // phase-aware: only keep SWIM grace while the unit is actually controllable
        // (AIM/RETREAT). Once the turn ends (SETTLE/handoff) a unit floating in deep
        // water stops getting buoyant grace → it settles/drowns promptly instead of
        // bobbing forever and forcing the ~1.8s settle fallback every turn.
        const active  = isActiveTurn(u) && (!CA.canControl || CA.canControl());
        // noWater téma (űr): alul NINCS víz — nincs úszás/splash/buborék. A vonal
        // alá kerülés ugyanúgy halálos, mint vízben a mélyvíz-szabály (UNIT_R*0.35),
        // csak azonnali: az egység az űrbe veszik, víz-FX nélkül.
        const _thNW = (CA.Maps && CA.Maps[S.theme]) ? CA.Maps[S.theme] : null;
        if(_thNW && _thNW.noWater){
          if(inWater && submersion > C.UNIT_R*0.35){
            this.damage(u, 9999, 'fall');   // űrbe zuhant — azonnali halál
            if(!u.alive) continue;
          }
        } else
        if(inWater){
          // "DEEP" = pushed well under the surface AND no solid footing within
          // reach below (genuinely floating, not just standing in a shallow
          // puddle / a submerged shelf). Capybaras need a touch more depth to
          // count as "deep" so their float feels real.
          const deepMargin = C.UNIT_R * (canSwim ? 0.9 : 0.35);
          const noFooting = !solidAt(u.x, u.y + C.UNIT_R + 4) && !solidAt(u.x, u.y + C.UNIT_R + 10);
          // DEEP = well under the surface = DROWNS, even if standing on the
          // underwater bedrock floor (water is lethal — Jani: haljanak meg). Footing
          // only saves you while SHALLOW (wading at the very edge).
          const deep = submersion > deepMargin;

          // splash + sfx on first water contact (any unit, any turn).
          if(!u._sinking){
            u._sinking = true;
            if(fx()) fx().spawnParticles({x:u.x,y:waterY,count:14,spdMin:1,spdMax:4,life:26,size:3,color:'#bfe6ff'});
            CA.events.emit('sfx','splash');
          }
          if(u._drownCd>0) u._drownCd-=k;
          const isFrog = (u.species==='frog' || u.kind==='frog');
          const hasFooting = solidAt(u.x, u.y + C.UNIT_R + 4) || solidAt(u.x, u.y + C.UNIT_R + 10);

          if(isFrog){
            // FROG = natural swimmer (Jani): rides the surface forever, never
            // drowns, takes no water damage. Bobs up to the waterline; counts as
            // grounded when calm at the surface so it can hop off the water.
            // QA P1: a felhajtóerő eddig FELTÉTEL NÉLKÜL húzott felfelé (a felszín
            // fölött is) → örök fel-le pattogás, 2-3 splash/mp, és a worldSettled()
            // sosem lett igaz (minden körvég a 110 frame-es fallbackre futott).
            // Fix: lift csak a felszín ALATT + nyugalmi snap a felszínen.
            const surfY = waterY - C.UNIT_R*0.4;
            if(u.y > surfY) u.vy -= 0.6*k;                 // lift CSAK víz alatt
            u.vy *= Math.pow(0.84,k); u.vx *= Math.pow(0.96,k);
            if(u.y > surfY) u.y += (surfY - u.y)*0.20;     // float up to the surface
            if(Math.abs(u.y - surfY) < 1.5 && Math.abs(u.vy) < 0.8){ u.y = surfY; u.vy = 0; }
            u.grounded = (Math.abs(u.y - surfY) < C.UNIT_R*0.45 && Math.abs(u.vy) < 1.3);
            // splash-reset védelem: nyugalmi lebegésnél maradjon "vízben" állapot,
            // ne triggereljen újra belecsobbanást a mikro-bobbing.
            if((S.frame % 14)===0 && fx() && Math.abs(u.vy) > 0.5)
              fx().spawnParticles({x:u.x,y:waterY,count:2,spdMin:0.3,spdMax:1.2,life:16,size:2,color:'#bfe6ff'});
            // no drown — skip the lethal branches entirely
          } else if(!deep && hasFooting){
            // SHALLOW wading on a submerged shelf → stay GROUNDED so the player can
            // JUMP OUT of a small puddle (Jani). Light drag, no drown.
            u.grounded = true;
            u.vx *= Math.pow(0.9,k);
          } else if(active){
            u.grounded = false;
            // SWIM grace for the ACTIVE unit only — float + paddle back to shore
            // during YOUR turn. Off-turn, water is lethal (below).
            u.vy -= 0.55*k;                       // buoyant lift
            u.vy *= Math.pow(0.86, k);            // vertical drag (bob, don't plummet)
            u.vx *= Math.pow(0.95, k);            // light horizontal drag → paddle to shore
            if((S.frame % 10)===0 && fx())
              fx().spawnParticles({x:u.x,y:waterY,count:2,spdMin:0.4,spdMax:1.4,life:18,size:2,color:'#bfe6ff'});
            // shoved VERY deep even on your own turn → slow drown.
            if(submersion > C.UNIT_R*1.6){
              if((u._drownCd||0)<=0){ this.damage(u, (canSwim ? 8 : 11), 'drown'); u._drownCd=8; }
              if((S.frame % 6)===0) emitBubbles(u.x, u.y, 2);
              if(!u.alive) continue;
            }
          } else {
            // OFF-TURN in DEEP water → DROWN. Water is lethal: a unit that falls in
            // dies (Jani: haljanak meg). Sinks with bubbles + drown DoT (~1s TTK;
            // capybaras a touch slower for the swim flavour, but they still die).
            u.grounded = false;
            if(!u._drowning){ u._drowning = true; CA.events.emit('sfx','drown'); }
            u.vx *= Math.pow(0.82, k);
            u.vy = Math.max(u.vy, canSwim ? 0.9 : 1.2);   // steady sink
            if((S.frame % 6)===0) emitBubbles(u.x, u.y, canSwim ? 2 : 3);
            if((u._drownCd||0)<=0){ this.damage(u, (canSwim ? 8 : 11), 'drown'); u._drownCd=8; }
            if(!u.alive) continue;
          }
        } else if(u._sinking || u._drowning){
          // climbed back out / water level dropped → reset water state.
          u._sinking = false;
          u._drowning = false;
          u._drownCd = 0;
        }

        // --- mozgó platform CARRY: ha az egység egy X-tengelyű platformon áll,
        //     a platform frame-enkénti Δx-e vigye magával (QA P2: eddig a padló
        //     "kicsúszott" alóla és az egység leesett/vízbe pottyant). ---
        if(u.grounded && CA.Terrain && CA.Terrain.platformDeltaX){
          const _pdx = CA.Terrain.platformDeltaX(u.x, u.y + C.UNIT_R + 2);
          if(_pdx) u.x = U.clamp(u.x + _pdx, C.UNIT_R, C.WORLD_W - C.UNIT_R);
        }

        // --- hedgehog 'roll': fast horizontal movement = spinning spiky ball
        //     that does small contact damage to enemies it bumps. Subtle. ---
        if(passive==='roll'){
          const spd = Math.abs(u.vx);
          const rolling = spd > 2.1;       // only when really moving
          a.rolling = rolling;
          if(rolling){
            a.rollSpin += (u.vx*0.06)*k;   // spin matches travel direction
            for(const o of S.units){
              if(o===u || !o.alive || o.teamId===u.teamId) continue;
              if(U.dist(u.x,u.y,o.x,o.y) < C.UNIT_R*2 - 2){
                if((o.anim._rollCd||0) <= 0){
                  this.damage(o, 6);                 // small contact tick
                  const ang = Math.atan2(o.y-u.y, o.x-u.x);
                  o.vx += Math.cos(ang)*3 + u.vx*0.4; o.vy += Math.sin(ang)*2 - 1.5;
                  o.grounded = false;
                  o.anim._rollCd = 22;               // ~0.35s cooldown per victim
                  CA.events.emit('sfx','hurt');
                }
              }
            }
          }
        }
        if(a._rollCd>0) a._rollCd = Math.max(0, a._rollCd - k);

        // --- maintain anim state machine for grounded idle/walk ---
        if(u.grounded){
          if(Math.abs(u.vx) > 0.35){ if(a.state!=='hit'){ a.state='walk'; } a.walkPhase += 0.35*k; }
          else if(a.state==='walk' || a.state==='hit'){ if(a.hitFlash<=0) a.state='idle'; }
        }
        if(a.hitFlash<=0 && a.state==='hit') a.state='idle';

        // TASK 3 — flavour quips while idle (rare, non-active units chatter a bit;
        // active units mostly stay quiet so they don't cover the aim line) and a
        // nervous quip when standing close to the water's edge.
        if(u.grounded && a.state==='idle' && !a.bubble && (a._sayCd||0)<=0){
          const nearWater = (u.y + C.UNIT_R) > (waterY - 46) && (u.y + C.UNIT_R) < waterY;
          const lowHp = u.hp <= u.maxHp*0.28;
          if(nearWater){
            // #35 — a panicky 😱 at the water's edge, otherwise the spoken quip
            if(Math.random() < 0.0025*k) emote(u, '😱', 1.3);
            else if(Math.random() < 0.004*k) say(u, 'water', 1.4);
          } else if(lowHp && !isActiveTurn(u) && Math.random() < 0.0016*k){
            emote(u, '😱', 1.2);                        // near-death nerves
          } else if(!isActiveTurn(u) && Math.random() < 0.0009*k){
            say(u, 'idle', 1.6);
            // VOICE — occasional idle mumble. say() above already set a ~6s
            // per-unit speak cooldown (a._sayCd) and this whole branch is behind
            // a tiny probability, so this is inherently RARE; an extra 1-in-3
            // gate keeps the audio rarer still than the visible quip. No spam.
            if(Math.random() < 0.18){ try{ CA.events.emit('sfx','voice'); }catch(e){} }
          }
        }
      }

      // DOMINÓ knockback-chain — a unit flung fast enough that it SLAMS into
      // another alive unit transfers a small bump of damage + mutual knockback to
      // BOTH and pops a "🁢 Dominó!" toast. Guarded against frame-spam (per-unit
      // cooldown) and runaway chains (a small per-turn cap). Cheap O(n²) over the
      // few units on screen, only entered when someone is actually moving fast.
      try {
        const DOM_SPEED = 6.5;      // |v| px/frame a unit must exceed to "slam"
        const DOM_CAP   = 4;        // max Dominó hits per turn (anti chain-explosion)
        if (S._dominoCount == null) S._dominoCount = 0;
        for (const u of S.units){
          if (!u.alive) continue;
          const a = u.anim; if (a && a._dominoCd>0) a._dominoCd = Math.max(0, a._dominoCd - k);
          const spd = Math.sqrt(u.vx*u.vx + u.vy*u.vy);
          if (spd < DOM_SPEED) continue;
          if (a && a._dominoCd>0) continue;
          for (const o of S.units){
            if (o===u || !o.alive) continue;
            if (o.anim && o.anim._dominoCd>0) continue;
            if (U.dist(u.x,u.y,o.x,o.y) >= C.UNIT_R*2 - 1) continue;
            if (S._dominoCount >= DOM_CAP) break;
            S._dominoCount++;
            // damage scales with the slammer's speed (6..10), split onto BOTH
            const bump = U.clamp(4 + spd*0.45, 6, 10);
            this.damage(o, bump);
            this.damage(u, bump*0.5);
            // mutual knockback along the impact axis
            const ang = Math.atan2(o.y-u.y, o.x-u.x);
            o.vx += Math.cos(ang)*3.2; o.vy += Math.sin(ang)*2 - 1.4; o.grounded=false;
            u.vx -= Math.cos(ang)*1.6; u.vy -= 1.0; u.grounded=false;
            if (o.anim) o.anim._dominoCd = 18;   // ~0.3s — fires once per collision
            if (a) a._dominoCd = 18;
            try { CA.events.emit('toast', '🁢 ' + CA.t('Dominó!')); } catch(e){}
            try { CA.events.emit('sfx','hurt'); } catch(e){}
            break;   // one slam per fast unit per frame
          }
        }
      } catch(e){ /* domino juice never throws */ }

      // CHARGE-UP DUST SHUDDER — while the active unit is charging a shot
      // (S.charging), a subtle puff of dust shivers up under its feet, building
      // with the charge power (S.power). Pure combat-juice anticipation. Cheap &
      // throttled (every few frames), reduced-motion/low-q aware via dustPuff,
      // suppressed entirely under reducedMotion. Never throws.
      try{
        if(S.charging && CA.activeUnit && CA.FX && CA.FX.dustPuff &&
           !(CA.settings && CA.settings.reducedMotion)){
          const cu = CA.activeUnit();
          if(cu && cu.alive && cu.grounded){
            const pow = U.clamp((typeof S.power==='number') ? S.power : 0.4, 0, 1);
            // faster shudder the more charged it is (every 3..7 frames)
            const every = Math.max(3, Math.round(7 - pow*4));
            if((S.frame % every) === 0){
              CA.FX.dustPuff(cu.x, cu.y + C.UNIT_R - 1, 0, 0.25 + pow*0.35);
            }
          }
        }
      }catch(e){ /* anticipation juice never throws */ }
    },

    // -----------------------------------------------------------------------
    walk(u, dir){
      if(!u || !u.alive) return;
      u.facing = dir;
      if(!u.grounded){ // air steering; stronger while swimming so you can reach shore
        const wY = (S.waterLevel!=null) ? S.waterLevel : C.WATER_LEVEL;
        const inWater = (u.y + C.UNIT_R*0.4 > wY);
        u.vx = U.clamp(u.vx + dir*(inWater?0.5:0.25), inWater?-4:-3, inWater?4:3);
        return;
      }
      // #7 — surface affects how a step feels:
      //  - sticky themes (jungle/mud): smaller step → slower walk.
      //  - slippery (ice/snow/weather slip): we ramp the step UP from a small
      //    fraction toward the full step (walkAccel), AND feed leftover speed
      //    into vx so the unit keeps gliding after the key is released. On
      //    normal ground walkAccel≈1 so the original snappy step is preserved.
      const surf = surface();
      // frost nova chill (weapons.js sets u._frost; ticks down at the team's
      // turn start) — the advertised "slowed" effect: half walk speed. This flag
      // was previously written but never consumed anywhere.
      const _chill = (u._frost||0) > 0 ? 0.5 : 1;
      const fullStep = surf.walkStep * _chill;
      const stepX = dir*fullStep*surf.walkAccel;
      const nx = U.clamp(u.x + stepX, C.UNIT_R, C.WORLD_W-C.UNIT_R);

      // #5 — DON'T WALK INTO/THROUGH ANOTHER LIVE UNIT (Jani: "a karaktereket ne
      // tudjam eltolni" — walking must not shove teammates/foes around). Treat
      // another unit at body height like a soft wall: block the step only when it
      // would move us CLOSER to them (so an already-overlapped unit can still walk
      // OUT, never gets wedged). A clear head-stack (large Δy) is NOT blocked.
      {
        const uu = S.units;
        for(let bi=0; bi<uu.length; bi++){
          const o = uu[bi];
          if(!o || o===u || !o.alive) continue;
          if(Math.abs(u.y - o.y) >= (radiusOf(u)+radiusOf(o))*0.7) continue; // stacked → ignore
          const minDx = (radiusOf(u)+radiusOf(o))*0.85;
          const ndx = Math.abs(nx - o.x), cdx = Math.abs(u.x - o.x);
          if(ndx < minDx && ndx <= cdx){            // step heads INTO them → blocked
            if(u.anim.state==='walk') u.anim.state='idle';
            return;
          }
        }
      }

      const footMid  = u.y + C.UNIT_R - 4;   // small step
      const footHigh = u.y + C.UNIT_R - 8;   // tallest climbable ledge (lowered: no
                                             // scaling near-vertical walls / overhangs)

      // glide momentum: on slippery ground accumulate velocity (capped) toward
      // the full step speed so released keys leave a little carry. No effect on
      // normal ground (slip 0) where vx is killed by ground friction anyway.
      const addGlide = (moved)=>{
        if(surf.slip>0 && moved){
          const target = dir*fullStep*0.6;       // glide top speed (px/frame)
          u.vx = U.clamp(u.vx + dir*fullStep*surf.walkAccel*0.5,
                         Math.min(0,target), Math.max(0,target));
        }
      };

      if(!solidAt(nx, footMid)){
        // clear ahead — walk, then settle down onto any small drop next frame via gravity
        u.x = nx; addGlide(true);
        if(u.anim.state!=='hit') u.anim.state='walk';
      } else if(!solidAt(nx, footHigh)){
        // small ledge — step up
        u.x = nx; u.y -= 5; addGlide(true);
        if(u.anim.state!=='hit') u.anim.state='walk';
      } else {
        // steep wall / cliff — blocked, stay put but keep facing
        if(u.anim.state==='walk') u.anim.state='idle';
      }
    },

    jump(u){
      if(!u || !u.alive) return;
      const passive = passiveOf(u);

      // --- bird 'glide': a second "jump" press while airborne flaps into a glide
      //     (reduced gravity while moving) instead of re-jumping. Once per airtime. ---
      if(!u.grounded){
        if(passive==='glide' && !u.glideUsed){
          u.glideUsed = true;
          u.anim.gliding = true;
          if(u.vy > 0) u.vy *= 0.35;            // arrest the fall on the flap
          u.vy -= 1.6;                          // little lift
          u.vx += u.facing*1.4;                 // glide forward
          if(fx()) fx().spawnParticles({x:u.x,y:u.y,count:5,spdMin:0.5,spdMax:2,life:22,size:2.5,color:'#fff'});
          CA.events.emit('sfx','jump');
        } else {
          // SWIM KICK: a unit floating in water can kick upward/forward to reach
          // shore or hop out of a small pool (else it's stranded swimming).
          // QA P2: a küszöb R*0.6-tal (a lebegési egyensúly szintjével) — a R*0.4
          // a bobbing tetején elnyelte a gombnyomást ("halott gomb" érzés).
          const wY = (S.waterLevel!=null) ? S.waterLevel : C.WATER_LEVEL;
          if(u.y + C.UNIT_R*0.65 > wY){
            u.vy = -6.4; u.vx += u.facing*2.8;
            if(fx()) fx().spawnParticles({x:u.x,y:wY,count:5,spdMin:0.6,spdMax:2,life:18,size:2.5,color:'#bfe6ff'});
            CA.events.emit('sfx','jump');
          }
        }
        return;
      }

      // grounded hop. frogs 'leap' much higher & farther (#7).
      if(passive==='leap'){
        u.vy = -10.4;
        u.vx += u.facing*4.2;
        if(fx()) fx().spawnParticles({x:u.x,y:u.y+C.UNIT_R,count:5,spdMin:0.6,spdMax:2,life:16,size:2.5,color:'#82d56e'});
      } else {
        u.vy = -6.2;
        u.vx += u.facing*2.4;
      }
      u.grounded = false;
      u.glideUsed = false;                       // fresh airtime → glide available
      u.anim.gliding = false;
      u.anim.state = 'idle';
      // ANTICIPATION + LIFTOFF juice: a quick pre-takeoff squash (jumpCrouch) that
      // springs into an in-air stretch (airStretch, sustained while rising). Both
      // are read by _drawUnit's squash/stretch transform and decay safely; they
      // never touch physics. A small launch dust puff if FX is available.
      u.anim.jumpCrouch = 1;
      u.anim.airStretch = 1;
      if(fx() && CA.FX.dustPuff){ try{ CA.FX.dustPuff(u.x, u.y+C.UNIT_R, u.facing*0.6, 0.8); }catch(_){ } }
      CA.events.emit('sfx','jump');
    },

    // -----------------------------------------------------------------------
    // #7 beaver 'build' ACTION — place a small solid wall in front of the unit.
    // Exposed so UI/weapons can wire a button. Returns true if a wall was built.
    build(u){
      u = u || CA.activeUnit();
      if(!u || !u.alive || !u.grounded) return false;
      if(passiveOf(u) !== 'build') return false;
      if((u.buildsLeft||0) <= 0) return false;
      const R = C.UNIT_R;
      const w = 14, h = 40;
      const wx = Math.round(u.x + u.facing*(R+8) - w/2);
      const wy = Math.round(u.y + R - h);        // wall sits on the ground, rises up
      // don't build straight into another unit
      for(const o of S.units){ if(o.alive && o!==u && U.dist(o.x,o.y, wx+w/2, wy+h/2) < R+10) return false; }
      walls().push({ x:wx, y:wy, w, h, ownerId:u.id, t:0, maxHp:60, hp:60 });
      u.buildsLeft--;
      if(fx()) fx().spawnParticles({x:wx+w/2,y:wy+h,count:8,spdMin:0.5,spdMax:2.5,life:20,size:2.5,color:'#9a6c44'});
      CA.events.emit('sfx','land');
      return true;
    },

    // -----------------------------------------------------------------------
    // #7 worm 'dig' ACTION — burrow a short tunnel into the terrain in the
    // facing direction (gentle downward), carving harmlessly via Terrain.destroy.
    // Exposed so UI/weapons can wire a button. Returns true if it dug.
    dig(u){
      u = u || CA.activeUnit();
      if(!u || !u.alive) return false;
      if(passiveOf(u) !== 'dig') return false;
      if(!CA.Terrain || !CA.Terrain.destroy) return false;
      const steps = 7, r = C.UNIT_R*0.7;
      let cx = u.x, cy = u.y, moved=false;
      for(let i=0;i<steps;i++){
        cx += u.facing * (r*0.9);
        cy += r*0.55;                          // angle slightly downward
        if(cx < C.UNIT_R || cx > C.WORLD_W-C.UNIT_R) break;
        if(cy + C.UNIT_R*0.4 > ((S.waterLevel!=null)?S.waterLevel:C.WATER_LEVEL)) break; // don't dig into water
        CA.Terrain.destroy(cx, cy, r);          // carve (no damage — pure tunnel)
        moved = true;
      }
      if(moved){
        u.x = U.clamp(cx, C.UNIT_R, C.WORLD_W-C.UNIT_R);
        u.y = cy; u.vx = 0; u.vy = 0.5; u.grounded = false;
        if(fx()) fx().spawnParticles({x:u.x,y:u.y,count:10,spdMin:0.6,spdMax:2.6,life:20,size:2.6,color:'#9c7a45'});
        CA.events.emit('sfx','land');
      }
      return moved;
    },

    // -----------------------------------------------------------------------
    damage(u, amount, cause){
      if(!u || !u.alive) return;
      amount = Math.max(0, amount);
      if(amount<=0) return;
      // DEV sandbox: apply REAL HP damage so the HP bar shows how much each weapon
      // deals (Jani: "rendes élet legyen, hogy lássam mennyit sebez 1-1 fegyver"),
      // but FLOOR at 1 HP so the dummy never dies → you can keep spam-testing every
      // weapon without the match ending. Still shows the floating number + flash.
      if(S.dev && !(u.minion && cause==='drown')){
        // (minions drowning are exempt from the dev floor — a turret/zombie that
        // fell in the lake otherwise sank and bubbled forever at 1 HP)
        try{ if(u.anim) u.anim.hitFlash=1;
          u.hp = Math.max(1, (u.hp||0) - amount);
          CA.events.emit('unitDamaged', u, amount, {unit:u, amount:amount, crit:!!(cause&&cause.crit), x:u.x, y:u.y}); }catch(e){}
        return;
      }
      // v4 — SHIELD absorbs incoming damage first (drowning bypasses it: you
      // can't shield against the lake). Whatever the shield can't soak hits HP.
      if(cause!=='drown' && (u.shield||0) > 0){
        const soak = Math.min(u.shield, amount);
        u.shield -= soak;
        amount   -= soak;
        if(soak > 0){
          u.anim.hitFlash = Math.max(u.anim.hitFlash, 0.6);  // bluish flash handled in render
          u.anim._shieldHit = 0.6;
          CA.events.emit('sfx','hurt');
          if(fx()) fx().spawnParticles({x:u.x,y:u.y-2,count:4,spdMin:0.6,spdMax:2,life:16,size:2.4,color:'#9cf'});
        }
        if(amount<=0){
          // still a "hit" for taunt/quip reactions. positional (unit,amount) is
          // preserved for existing listeners; 3rd arg is the rich juice payload.
          CA.events.emit('unitDamaged', u, soak, { unit:u, amount:soak, crit:!!(cause&&cause.crit), x:u.x, y:u.y });
          return;                                    // fully absorbed — no HP loss
        }
      }
      // v4 class passive — GUARDIAN ('tanky') takes 15% less damage to HP. Applied
      // to the post-shield amount, before the HP subtraction. Never goes negative.
      if(u && CA.classOf && CA.classOf(u) && CA.classOf(u).passive==='tanky'){
        amount = Math.max(0, amount * 0.85);
      }
      // FREEZE utility (weapons.js sets u._frozen): encased in ice → incoming
      // damage is heavily reduced (drowning still bypasses, like the shield).
      // Cleared on the unit's next turn start (see the turnStart handler below).
      if(cause!=='drown' && (u._frozen||0) > 0){
        amount = Math.max(0, amount * 0.35);
        if(u.anim){ u.anim.hitFlash = Math.max(u.anim.hitFlash||0, 0.5); }
        if(fx()) fx().spawnParticles({x:u.x,y:u.y-2,count:4,spdMin:0.5,spdMax:1.8,life:16,size:2.4,color:'#bdeeff'});
      }
      // mark a unit as briefly "on fire" when burned, so the jetpack utility cuts
      // out (a burning pilot can't fly). Decays each frame in update().
      if(cause==='fire') u._onFire = 30;
      const _crit = !!(cause && cause.crit);
      u.hp = U.clamp(u.hp - amount, 0, u.maxHp);
      u.anim.hitFlash = 1;
      // richer HURT reaction: a quick recoil/flinch away from the hit + a white
      // "again" hit-flash that's punchier than the lingering red overlay. Scales
      // a touch with how big the hit was so a chip-shot reads small, a heavy hit
      // reads dramatic. Read by _drawUnit's transform. reducedMotion-safe (the
      // render path keeps it tiny and it never affects aim/facing/physics).
      const _hurtMag = U.clamp((amount||0)/22, 0.35, 1);
      u.anim.hurtKick = Math.max(u.anim.hurtKick||0, _hurtMag);
      // recoil leans AWAY from the shooter when we know one, else away from facing
      const _src = (cause && typeof cause==='object' && cause.x!=null) ? cause.x : null;
      u.anim._hurtDir = (_src!=null) ? (_src > u.x ? -1 : 1) : -(u.facing||1);
      u.anim.hitFlashWhite = 1;                              // bright single-frame pop
      if(u.anim.state!=='dead') u.anim.state = 'hit';
      // big-hit speech bubble (#28) — playful Hungarian "ow!" with personality
      if(amount >= 18 && cause!=='drown'){
        say(u, 'hurt', 1.1, true);
      }
      // positional (unit,amount) kept for legacy listeners (meta/ui/quips); 3rd
      // arg is the rich payload the floating-damage-number UI subscribes to.
      CA.events.emit('unitDamaged', u, amount, { unit:u, amount, crit:_crit, x:u.x, y:u.y });
      CA.events.emit('sfx', cause==='drown' ? 'splash' : 'hurt');
      if(u.hp<=0){
        u.hp = 0;
        u.alive = false;
        const launched=cause && cause.kind==='blast' && u._blastFlight && Math.hypot(u.vx,u.vy)>0.8 && !u.minion;
        u._blastCorpse=!!launched;
        u._blastCorpseLife=0;
        if (!launched){ u.vx = 0; u.vy = 0; }
        u.anim.state = 'dead';
        u.anim.deathT = 0;
        if(fx()) fx().spawnParticles({x:u.x,y:u.y-4,count:10,spdMin:1,spdMax:3.5,life:32,size:3,
          color: u.kind==='capybara' ? '#fff' : '#cfe'});
        CA.events.emit('unitDied', u);
        CA.events.emit('sfx','die');
      }
    },

    damageInRadius(x, y, r, maxDmg, knockback){
      const kb = knockback || 1;
      // explosions also knock down beaver walls within reach
      if(S.builtWalls && S.builtWalls.length){
        for(const w of S.builtWalls){
          const cx=w.x+w.w/2, cy=w.y+w.h/2;
          const d=U.dist(x,y,cx,cy);
          if(d < r + Math.max(w.w,w.h)){
            const f=U.clamp(1-d/(r+Math.max(w.w,w.h)),0,1);
            w.hp -= maxDmg*f;
            if(fx()) fx().spawnParticles({x:cx,y:cy,count:4,spdMin:0.5,spdMax:2,life:16,size:2.2,color:'#9a6c44'});
          }
        }
        S.builtWalls = S.builtWalls.filter(w=>w.hp>0);
      }
      for(const u of S.units){
        if(!u.alive) continue;
        const d = U.dist(x, y, u.x, u.y);
        const reach = r + C.UNIT_R;
        if(d < reach){
          const f = U.clamp(1 - d/reach, 0, 1);
          // knockback FIRST (so a fatal hit still launches the corpse a touch)
          let ang = Math.atan2(u.y - y, u.x - x);
          if(!isFinite(ang) || d<0.001) ang = -Math.PI/2; // straight up if dead-centre
          // _kbResist (bosses): heavier bodies shrug off part of the impulse
          const imp = kb * f * 9 * (1 - (u._kbResist || 0));
          u.vx += Math.cos(ang)*imp;
          u.vy += Math.sin(ang)*imp - 2.2*(1 - (u._kbResist || 0)); // slight upward bias = satisfying pop
          u.grounded = false;
          // Cosmetic tumbling reads the same impulse used by gameplay. It
          // never changes collision radius, trajectory, damage or facing.
          u._blastFlight={age:0,rotation:0,
            spin:U.clamp((u.vx||Math.cos(ang)*2)*0.014,-0.16,0.16)};
          this.damage(u, maxDmg * f, {kind:'blast',x:x,y:y});
          CA.events.emit('blastLaunched',u,{x:x,y:y,impulse:imp});
        }
      }
    },

    // =======================================================================
    // v4 — MINIONS. Class-summoned helpers that NEVER take a turn (core rotates
    // on CA.aliveHeroesOfTeam). They have cheap per-frame physics + AI and a
    // turn-counted `life`. Damageable + collidable for free (they're alive units
    // in S.units, so explosions, projectiles & shots already hit/block on them).
    // =======================================================================
    // default life (in ROUNDS) + base hp + radius per kind.
    _MINION_DEF: {
      skeleton:  { life:2, hp:18, r:9  },
      zombie:    { life:3, hp:55, r:12 },
      turret:    { life:3, hp:40, r:11 },
      // walking critter bomb ("Roham-süni") — trots at the enemy, then explodes.
      chargehog: { life:2, hp:24, r:11 },
    },

    // spawnMinion({kind,x,y,ownerTeamId,life,hp}) -> the new minion unit (or null)
    spawnMinion(opts){
      try {
        opts = opts || {};
        const kind = (opts.kind && this._MINION_DEF[opts.kind]) ? opts.kind : 'skeleton';
        const def  = this._MINION_DEF[kind];
        const owner = (opts.ownerTeamId != null) ? opts.ownerTeamId : (CA.activeUnit() ? CA.activeUnit().teamId : null);
        const hp   = (typeof opts.hp === 'number' && opts.hp > 0) ? opts.hp : def.hp;
        const life = (typeof opts.life === 'number' && opts.life > 0) ? opts.life : def.life;
        let x = (typeof opts.x === 'number') ? opts.x : C.WORLD_W/2;
        let y = (typeof opts.y === 'number') ? opts.y : 0;
        x = U.clamp(x, def.r, C.WORLD_W - def.r);

        const m = {
          id: U.nextId(),
          teamId: owner,            // friendly to the owner team (turn rotation skips it: minion:true)
          ownerTeamId: owner,
          kind: 'minion',
          minion: true,
          minionKind: kind,
          species: null,
          name: kind,
          x, y, vx:0, vy:0,
          hp, maxHp: hp,
          alive: true,
          facing: 1,
          radius: def.r,            // minions use their own radius for draw/AI
          grounded: false,
          life,                     // remaining ROUNDS before it expires
          cooldowns:{}, shield:0, taunt:0, buffs:[],
          _fireCd: 0,               // turret: frames until next auto-shot
          _contactCd: 0,            // zombie: frames between contact ticks
          // chargehog: weapon-supplied blast on self-destruct (fallbacks if absent)
          _boomR: (typeof opts.r==='number'?opts.r:0), _boomDmg:(typeof opts.dmg==='number'?opts.dmg:0), _boomKb:(typeof opts.kb==='number'?opts.kb:0),
          anim: { state:'idle', t:U.rand(0,100), deathT:0, hitFlash:0, walkPhase:U.rand(0,TWO_PI),
                  bubble:null, bubbleT:0, blink:0, blinkAt:U.rand(40,160), land:0 },
          _graveVy:0, _graveSettled:false, _graveY:null,
        };
        S.units.push(m);
        if(fx()) fx().spawnParticles({x, y, count:8, spdMin:0.6, spdMax:2.4, life:20, size:2.6,
          color: kind==='skeleton' ? '#e8e8ea' : kind==='zombie' ? '#9bd17a' : '#b8b8c0'});
        CA.events.emit('sfx','land');
        CA.events.emit('minionSpawned', m);
        return m;
      } catch(e){ return null; }
    },

    // nearest ALIVE enemy hero to a minion (enemies of its owner team). Minions
    // chase heroes, not each other, so the board stays readable.
    _nearestEnemyHero(m){
      let best=null, bd=Infinity;
      for(const o of S.units){
        if(!o.alive || o.minion) continue;
        if(o.teamId === m.ownerTeamId) continue;     // skip friendlies
        const d = U.dist(m.x, m.y, o.x, o.y);
        if(d < bd){ bd=d; best=o; }
      }
      return best ? { unit:best, dist:bd } : null;
    },

    // cheap physics shared by all minions: gravity, terrain rest, side-walls,
    // world bounds and instant drown. Mirrors the hero physics but trimmed.
    _minionPhysics(m, k, waterY){
      const R = m.radius || 10;
      m.anim.t += 0.12*k;
      if(m.anim.hitFlash>0) m.anim.hitFlash = Math.max(0, m.anim.hitFlash - 0.06*k);
      if(m.anim.land>0)     m.anim.land     = Math.max(0, m.anim.land - 0.08*k);
      if(m._fireCd>0)    m._fireCd    = Math.max(0, m._fireCd    - k);
      if(m._contactCd>0) m._contactCd = Math.max(0, m._contactCd - k);

      if(!m.grounded) m.vy += C.GRAVITY*k;
      m.x += m.vx*k;
      m.y += m.vy*k;
      m.vx *= m.grounded ? Math.pow(0.80,k) : Math.pow(0.985,k);
      if(Math.abs(m.vx) < 0.04) m.vx = 0;

      if(m.x < R){ m.x=R; if(m.vx<0) m.vx=0; }
      if(m.x > C.WORLD_W-R){ m.x=C.WORLD_W-R; if(m.vx>0) m.vx=0; }

      const feetY = m.y + R;
      if(solidAt(m.x, feetY)){
        let guard=0; while(solidAt(m.x, m.y+R) && guard<60){ m.y-=1; guard++; }
        m.vy=0; m.grounded=true;
      } else if(m.vy>=0 && (solidAt(m.x,feetY+1)||solidAt(m.x,feetY+2)||solidAt(m.x,feetY+3))){
        let sy=Math.floor(feetY)+1; while(!solidAt(m.x,sy) && sy<feetY+5) sy++;
        m.y=sy-R-1; m.vy=0; m.grounded=true;
      } else {
        m.grounded=false;
        const probe = m.y + R - 5;
        if(m.vx>0 && solidAt(m.x+R, probe)){ m.x -= m.vx*k; m.vx=0; }
        else if(m.vx<0 && solidAt(m.x-R, probe)){ m.x -= m.vx*k; m.vx=0; }
      }

      // drown — minions can't swim. SINK quickly (~0.5s) with bubbles instead of
      // instant death. Splash + sfx only on first contact.
      if(m.y + R*0.4 > waterY){
        if(!m._sinking){
          m._sinking = true;
          if(fx()) fx().spawnParticles({x:m.x,y:waterY,count:10,spdMin:1,spdMax:3.5,life:22,size:2.6,color:'#bfe6ff'});
          CA.events.emit('sfx','splash');
        }
        m.grounded = false;
        m.vx *= Math.pow(0.80, k);
        m.vy = Math.max(m.vy, 1.4);             // a touch faster than units
        if((S.frame % 6)===0) emitBubbles(m.x, m.y, 2);
        this.damage(m, 22*k, 'drown');          // ~0.5s to die while sinking
        return m.alive;        // dead once HP runs out
      } else if(m._sinking){
        m._sinking = false;
      }
      return m.alive;
    },

    // main per-frame minion update: physics, then kind-specific AI.
    _updateMinion(m, k, waterY, surf){
      if(!this._minionPhysics(m, k, waterY)) return;
      const tgt = this._nearestEnemyHero(m);
      const kind = m.minionKind;
      const R = m.radius || 10;

      if(kind==='skeleton'){
        // walk toward nearest enemy; EXPLODE on contact (or when life runs out).
        if(tgt){
          m.facing = (tgt.unit.x > m.x) ? 1 : -1;
          if(m.grounded){
            m.vx += m.facing*0.6*k;
            m.vx = U.clamp(m.vx, -3.2, 3.2);
            m.anim.state='walk'; m.anim.walkPhase += 0.4*k;
            this._minionTraverse(m, R, k);    // step up ledges / hop over walls
          }
          // contact → boom
          if(tgt.dist < R + C.UNIT_R + 2){
            this._minionBoom(m, 'skeleton');
            return;
          }
        } else {
          m.anim.state='idle';
        }
      }
      else if(kind==='chargehog'){
        // walking critter bomb: charges FAST at the nearest enemy and detonates a
        // sizeable (weapon-supplied) blast on contact — or when its life runs out.
        if(tgt){
          m.facing = (tgt.unit.x > m.x) ? 1 : -1;
          if(m.grounded){
            m.vx += m.facing*0.9*k;
            m.vx = U.clamp(m.vx, -4.2, 4.2);     // quicker than a skeleton
            m.anim.state='walk'; m.anim.walkPhase += 0.5*k;
            this._minionTraverse(m, R, k);       // step up ledges / hop over walls
          }
          if(tgt.dist < R + C.UNIT_R + 2){
            this._minionBoom(m, 'chargehog');
            return;
          }
        } else {
          m.anim.state='idle';
        }
      }
      else if(kind==='zombie'){
        // tanky shambler: marches toward the enemy and GRINDS it down on contact.
        if(tgt){
          m.facing = (tgt.unit.x > m.x) ? 1 : -1;
          if(m.grounded){
            m.vx += m.facing*0.42*k;
            m.vx = U.clamp(m.vx, -2.1, 2.1);
            m.anim.state='walk'; m.anim.walkPhase += 0.3*k;
            this._minionTraverse(m, R, k);    // step up ledges / hop over walls
          }
          // contact → real damage with only a small shove (so it doesn't punt the
          // target out of reach and then have to chase it forever).
          if(tgt.dist < R + C.UNIT_R + 2 && m._contactCd<=0){
            m._contactCd = 28;                // ~0.47s between bites (slower)
            // NERF (Jani: "iszonyat erős, 3 embert kinyír"): smaller per-bite dmg
            // and a TINY radius so it grinds ONE target down over time instead of
            // wiping a cluster. (The placement fix also stops it spawning INTO a
            // group.) 16→9 dmg, r6→r4.
            CA.explode(tgt.unit.x, tgt.unit.y, 4, 9, 0.5);
            CA.events.emit('sfx','hurt');
          }
        } else {
          m.anim.state='idle';
        }
      }
      else if(kind==='turret'){
        // stationary sentry: fire ONCE per ENEMY turn (not a constant ~1.8s stream),
        // and ONLY during a live, unpaused, playing turn — never in a menu / pause /
        // between-turns / game-over. (#turret-spam + #turret-in-menu)
        m.vx = 0; m.anim.state='idle';
        if(tgt){
          m.facing = (tgt.unit.x > m.x) ? 1 : -1;
          const TP = CA.TurnPhase || {};
          const live = (S.mode===CA.GameState.PLAYING && !S.paused &&
                        (S.phase===TP.AIM || S.phase===TP.RETREAT));
          const curTeam = S.teams && S.teams[S.currentTeamIdx];
          const enemyTurn = curTeam && curTeam.id !== m.ownerTeamId;   // attack on foes' turns
          const turnId = (S.round||0)*32 + (S.currentTeamIdx||0);
          if(live && enemyTurn && m._lastTurnFired!==turnId){
            m._lastTurnFired = turnId;
            m._fireCd = 600;                  // keep the eye "calm" until the next turn
            this._turretFire(m, tgt.unit);
          }
        }
      }
    },

    // help a walking minion cross terrain: step up small ledges, and HOP over
    // taller walls / out of dips so it can actually reach enemies across hills.
    _minionTraverse(m, R, k){
      const dir = Math.sign(m.vx) || m.facing || 1;
      const nx = m.x + dir*(R*0.7);
      const blockedLow  = solidAt(nx, m.y+R-4);     // something at foot height ahead
      if(!blockedLow) return;
      if(!solidAt(nx, m.y+R-16)){
        m.y -= 10;                                   // small ledge → step up
      } else if(!solidAt(nx, m.y-R)){
        // a wall taller than a step but with clear space above → hop over it
        m.vy = -5.2; m.grounded = false; m.vx = dir*1.8;
      } else {
        // solid all the way up (dead end): nudge back so we don't grind in place
        m.vx = -dir*0.4;
      }
    },

    // skeleton self-destruct: a small explosion centred on it, then it dies.
    _minionBoom(m, kind){
      const x=m.x, y=m.y;
      m.alive=false; m.vx=0; m.vy=0;
      // remove from rotation cleanly; mark dead so render/cleanup handle it.
      const col = (kind==='chargehog') ? '#caa' : '#fff';
      if(fx()) fx().spawnParticles({x,y,count:14,spdMin:1,spdMax:4,life:26,size:3,color:col});
      // chargehog carries its weapon's blast (set at spawn); skeleton uses the
      // original small self-destruct values.
      if(kind==='chargehog'){
        CA.explode(x, y, (m._boomR>0?m._boomR:48), (m._boomDmg>0?m._boomDmg:40), (m._boomKb>0?m._boomKb:1.4));
      } else {
        CA.explode(x, y, 34, 30, 1.4);
      }
      CA.events.emit('minionExpired', m);
    },

    // turret shot: predict a touch of lead, then deliver a small explosion at the
    // target (cheap + robust — no live projectile needed, mirrors CA.explode use).
    _turretFire(m, target){
      const lead = 0.10;
      const tx = U.clamp(target.x + target.vx*lead*8, C.UNIT_R, C.WORLD_W-C.UNIT_R);
      const ty = target.y;
      m.anim.land = 0.5;                       // little recoil pop
      if(fx()) fx().spawnParticles({x:m.x + m.facing*(m.radius||10), y:m.y-4, count:4, spdMin:0.6, spdMax:2.2, life:14, size:2.2, color:'#ffd27a'});
      CA.events.emit('sfx','boom');
      // v4 class passive — the engineer/mage owner's _dmgMul is stamped onto the
      // turret as `dmgMul` at spawn (by the weapons.js agent). Scale the shot.
      const dmg = 14 * (m.dmgMul || 1);
      CA.explode(tx, ty, 16, dmg, 0.7);
    },

    // -----------------------------------------------------------------------
    // #9 — GRAVE-MARKER PHYSICS. The tombstone rendered for a dead unit gets a
    // tiny physics state: if the terrain directly beneath its base is gone, it
    // falls under gravity and lands on whatever solid (or water surface) is
    // below, then settles cleanly. Mirrors how a live unit only applies gravity
    // when unsupported and holds still when resting (no per-frame jitter).
    _updateBlastCorpse(u,k,waterY){
      u._blastCorpseLife=(u._blastCorpseLife||0)+k;
      if (u._blastFlight){
        u._blastFlight.age+=k;
        u._blastFlight.rotation+=u._blastFlight.spin*k;
      }
      u.vy=Math.min(17,u.vy+C.GRAVITY*k);
      const speed=Math.hypot(u.vx,u.vy);
      if (speed>22){ u.vx*=22/speed; u.vy*=22/speed; }
      if (u.y<=-240 && u.vy<0) u.vy=0;
      const steps=Math.max(1,Math.ceil(Math.hypot(u.vx,u.vy)*k/3));
      for (let i=0;i<steps;i++){
        const nx=U.clamp(u.x+u.vx*k/steps,C.UNIT_R,C.WORLD_W-C.UNIT_R);
        const ny=u.y+u.vy*k/steps;
        if (u.vy>=0 && solidAt(nx,ny+C.UNIT_R)){
          u.grounded=true; u.vx=u.vy=0; break;
        }
        if (solidAt(nx+Math.sign(u.vx)*C.UNIT_R,ny)) u.vx=0;
        else u.x=nx;
        u.y=Math.max(-240,ny);
      }
      u.vx*=Math.pow(u.y>waterY ? 0.82 : 0.985,k);
      if (u.y+C.UNIT_R>=waterY){
        if (!u._sinking){
          u._sinking=true;
          if (fx() && CA.FX.waterSplash) CA.FX.waterSplash(u.x,waterY);
        }
        u.vy=Math.min(2.2,Math.max(1.2,u.vy));
        if ((S.frame%6)===0) emitBubbles(u.x,u.y,2);
      }
      if (u.grounded || u.y>C.WORLD_H || u._blastCorpseLife>180){
        u._blastCorpse=false; u._blastFlight=null;
        u.vx=u.vy=0;
        u._graveY=u.y+C.UNIT_R-2; u._graveVy=0; u._graveSettled=false;
      }
    },

    _updateGrave(u, k){
      const R = C.UNIT_R;
      // base ground-line of the marker (where the stone meets the ground / grass)
      if(u._graveY == null){ u._graveY = u.y + R - 2; u._graveVy = 0; u._graveSettled = false; }
      const waterY = (S.waterLevel!=null) ? S.waterLevel : C.WATER_LEVEL;

      // supported if there's solid just below the base (small tolerance), OR if
      // it has reached the water surface (it bobs there like a unit would sink).
      const supported = solidAt(u.x, u._graveY + 1) || solidAt(u.x, u._graveY + 2);

      if(supported){
        // rest exactly on the surface: nudge down/up to the contact line ONCE,
        // then hold still — no reposition while already resting (no shake).
        if(!u._graveSettled){
          let guard = 0;
          // climb out if buried
          while(solidAt(u.x, u._graveY) && guard<40){ u._graveY -= 1; guard++; }
          // drop the tiny remaining gap onto the surface
          guard = 0;
          while(!solidAt(u.x, u._graveY + 1) && guard<40){ u._graveY += 1; guard++; }
          u._graveSettled = true;
        }
        u._graveVy = 0;
        return;
      }

      // unsupported → fall
      u._graveSettled = false;
      u._graveVy += C.GRAVITY * k;
      if(u._graveVy > 12) u._graveVy = 12;     // terminal velocity
      u._graveY += u._graveVy * k;

      // drowned in water? DON'T float on the surface — keep sinking (slower, as
      // if through water) toward the bottom, trailing bubbles, then settle/remove
      // when it reaches solid ground or the world floor.
      if(u._graveY > waterY){
        u._graveVy = Math.min(u._graveVy, 2.0);   // water drag → slow descent
        if((S.frame % 6)===0) emitBubbles(u.x, u._graveY - R*0.4, 2);
      }
      // reached the world floor → settle at the bottom (rendered off-screen, so
      // it effectively disappears under the water instead of floating).
      if(u._graveY > C.WORLD_H){
        u._graveY = C.WORLD_H; u._graveVy = 0; u._graveSettled = true;
      }
    },

    // =======================================================================
    //  RENDER — the adorable bit.
    // =======================================================================
    render(ctx){
      // beaver walls sit in the world, under the units
      this._drawWalls(ctx);
      // draw dead units first (under the living), then alive
      for(const u of S.units) if(!u.alive) this._drawUnit(ctx, u);
      for(const u of S.units) if(u.alive)  this._drawUnit(ctx, u);
    },

    // ---- beaver dam/wall pieces (world space) ----------------------------
    _drawWalls(ctx){
      const ws = S.builtWalls; if(!ws || !ws.length) return;
      for(const w of ws){
        ctx.save();
        // stacked logs look
        const n = Math.max(1, Math.round(w.h/9));
        for(let i=0;i<n;i++){
          const y = w.y + i*(w.h/n);
          const grd = ctx.createLinearGradient(w.x, y, w.x+w.w, y);
          grd.addColorStop(0,'#7a5230'); grd.addColorStop(0.5,'#9a6c44'); grd.addColorStop(1,'#5e3e23');
          ctx.fillStyle = grd;
          this._roundRectAbs(ctx, w.x, y+0.5, w.w, (w.h/n)-1, 3);
          ctx.fillStyle='rgba(0,0,0,0.18)';
          ctx.beginPath(); ctx.arc(w.x+w.w*0.5, y+(w.h/n)*0.5, 1.6, 0, TWO_PI); ctx.fill();
        }
        // damage tint
        const frac = U.clamp((w.hp||0)/(w.maxHp||60),0,1);
        if(frac<1){ ctx.fillStyle=`rgba(40,20,8,${(1-frac)*0.45})`;
          this._roundRectAbs(ctx, w.x, w.y, w.w, w.h, 3); }
        ctx.restore();
      }
    },

    // v4.10 — PUBLIC: render a faithful in-game portrait of a team-editor unit
    // spec onto a <canvas>. spec = { species, cls, cosmetic, captain, color }.
    // Used by the team editor so the player sees their actual characters (species
    // + class overlay + cosmetic/helmet + captain star). Static (no animation).
    renderPortrait(canvas, spec){
      if(!canvas || !canvas.getContext) return;
      // NOTE: this helper is frequently called as a BARE function (e.g.
      // `var fn = CA.Entities.renderPortrait; fn(canvas, …)` in the team editor),
      // so `this` is NOT CA.Entities. Resolve a stable reference instead — using
      // `this._drawCapybara` here threw for capybara/worm (which draw natively),
      // leaving only the fallback blob, while registered species (bat/koala/…)
      // worked because they draw via the standalone sp.draw(). (#capy-portrait)
      const self = CA.Entities;
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0,0,W,H);
      spec = spec || {};
      const color = spec.color || '#caa472';
      const species = spec.species || 'capybara';
      const u = {
        id:-1, teamId:-1, kind: species, species: species,
        name:'', x:0, y:0, vx:0, vy:0, facing:1, alive:true, grounded:true,
        hp:100, maxHp:100, shield:0, taunt:0, buffs:[], cooldowns:{}, minion:false,
        cls: spec.cls||null, cosmetic:{ id: spec.cosmetic||null }, _captain: !!spec.captain,
        anim:{ state:'idle', t:0, blink:0, blinkAt:999, land:0, hitFlash:0, deathT:0,
               walkPhase:0, rolling:false, rollSpin:0, gliding:false, _aiming:false,
               bubble:null, bubbleT:0, flinch:0, _flinchDir:1, celebrate:0, taunt:0,
               hurtKick:0, _hurtDir:-1, hitFlashWhite:0, jumpCrouch:0, airStretch:0, killHop:0,
               idleAnim:null, idleAnimT:0, idleAnimAt:999, blinkKind:0, _emoteCd:0 }
      };
      // sp colours used for the fallback blob if the body draw can't run
      const sp = (CA.speciesOf) ? CA.speciesOf(u) : null;
      const fbBody = (sp && sp.colors && sp.colors.body) ||
                     (species==='worm' ? '#e59ac0' : '#8a6a45');

      const scale = Math.min(W, H) / (C.UNIT_R*3.6);
      const R = C.UNIT_R;

      // ROBUSTNESS: each stage runs in its OWN save/restore so a partial failure
      // in one (e.g. a species draw that throws after pushing canvas state) can
      // never leak transform/alpha/composite into the next stage and "hide" the
      // body — the historic bug where only a faint class overlay showed. We also
      // hard-reset alpha/composite before every stage.
      const resetState = ()=>{ ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; };
      const setupSpace = ()=>{
        ctx.translate(W/2, H*0.60);
        ctx.scale(scale, scale);
        ctx.scale(u.facing, 1);          // match the in-game mirrored local space
      };

      // ---- STAGE 1: SPECIES BODY (always drawn; fallback if it can't) ----
      let bodyOK = false;
      ctx.save();
      resetState();
      try {
        setupSpace();
        // capybara/worm draw NATIVELY (their species.draw is null); every other
        // registered species supplies its own draw(). Resolve explicitly so the
        // null-draw case never falls through to "nothing".
        if(sp && typeof sp.draw === 'function'){
          sp.draw(ctx, u, u.anim);
        } else if(species === 'worm'){
          self._drawWorm(ctx, u, color, {active:false, aiming:false, hitFlash:0});
        } else {
          self._drawCapybara(ctx, u, color, {active:false, aiming:false, hitFlash:0});
        }
        bodyOK = true;
      } catch(e){ bodyOK = false; }
      ctx.restore();

      // VISIBLE FALLBACK: if the species draw threw, paint a simple but clearly-
      // visible round body so the portrait is never blank (only a faint overlay).
      if(!bodyOK){
        ctx.save();
        resetState();
        try {
          setupSpace();
          const grd = ctx.createLinearGradient(0,-R,0,R);
          grd.addColorStop(0, lighten(fbBody,0.25)); grd.addColorStop(1, fbBody);
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.ellipse(0, R*0.1, R*0.95, R*0.9, 0, 0, TWO_PI); ctx.fill();
          // simple eyes so it still reads as a critter
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(R*0.30, -R*0.1, R*0.18, 0, TWO_PI); ctx.fill();
          ctx.beginPath(); ctx.arc(-R*0.18, -R*0.08, R*0.16, 0, TWO_PI); ctx.fill();
          ctx.fillStyle = '#2a2018';
          ctx.beginPath(); ctx.arc(R*0.32, -R*0.08, R*0.09, 0, TWO_PI); ctx.fill();
          ctx.beginPath(); ctx.arc(-R*0.16, -R*0.06, R*0.08, 0, TWO_PI); ctx.fill();
        } catch(e){}
        ctx.restore();
      }

      // ---- STAGE 2: COSMETIC (hat/glasses/captain star) ----
      ctx.save();
      resetState();
      try { setupSpace(); self._drawCosmetic(ctx, u); } catch(e){}
      ctx.restore();

      // ---- STAGE 3: CLASS OVERLAY — drawn LIGHTER so the small portrait body is
      // never obscured (a full-strength aura could wash the 84px tile). ----
      if(spec.cls && CA.Classes && CA.Classes.drawOverlay){
        ctx.save();
        resetState();
        try {
          setupSpace();
          ctx.globalAlpha = 0.7;          // soften the overlay over the tiny body
          CA.Classes.drawOverlay(ctx, u, u.anim);
        } catch(e){}
        ctx.restore();
      }
      resetState();
    },

    // PUBLIC: force-reload the editor-saved cosmetic position overrides (#3c).
    // chars.html (the position editor) writes localStorage and can call this on
    // a live game instance to preview without a reload; normal games pick up the
    // saved values lazily on first cosmetic draw.
    reloadCosmeticOffsets(){
      _cosmeticOffsets = null;
      return loadCosmeticOffsets();
    },

    // SECONDARY-MOTION appendage — a small tapered tail/tuft hanging off the
    // unit's lower-back, its tip dragged by the verlet chain (a.tail) so it lags
    // and flicks on walk/jump/recoil. Called from _drawUnit in facing-mirrored
    // local space (so +x = forward, the body faces right). No-op when there's no
    // chain (only built when motion is allowed: not reducedMotion, not low-Q) or
    // when the unit is dead/minion. Pure cosmetic; never throws. iOS-safe (plain
    // fills, no filter / shadowBlur).
    _drawBackAppendage(ctx, u){
      const a = u && u.anim;
      const ch = a && a.tail;
      if(!ch || !ch.pts || !u.alive) return;
      // chain points hang straight DOWN in local space from origin; the tip's
      // (x,y) carries the lag/swing. Read the last point, clamp the displacement
      // so it stays SUBTLE no matter how violent the driver was.
      const tip = ch.pts[ch.pts.length-1];
      const swayX = U.clamp(tip.x, -6, 6);
      const swayY = U.clamp(tip.y - (ch.pts.length-1)*CHAIN_SEG, -5, 5); // delta from rest
      // anchor at the lower-back; appendage points backward (-x) and the chain
      // bends the tip. Tapered fill in a slightly darker team tint sits under body.
      const R = C.UNIT_R;
      const ax = -R*0.72, ay = R*0.20;          // root on the rear-lower body
      const len = R*0.85;
      const tx = ax - len + swayX, ty = ay + swayY + len*0.25; // tip trails back & down
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.16)';        // soft self-shadow so it reads behind
      ctx.beginPath();
      ctx.moveTo(ax, ay - 2.4);
      ctx.quadraticCurveTo((ax+tx)/2, (ay+ty)/2 - 1, tx, ty);
      ctx.quadraticCurveTo((ax+tx)/2, (ay+ty)/2 + 2.2, ax, ay + 2.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },

    _drawUnit(ctx, u){
      // v4 — minions get their own cute-spooky procedural look.
      if(u.minion){ this._drawMinion(ctx, u); return; }
      const team = CA.getTeam(u.teamId) || {color:'#888'};
      const color = team.color || '#888';
      const a = u.anim;
      const active = isActiveTurn(u);
      const aiming = active && powerWeaponEquipped();

      // ---- breathing / bob / squash-stretch transform ----
      let bob = u.alive ? Math.sin(a.t*0.9)*1.3 : 0;
      let sx = 1, sy = 1;
      let extraX = 0, tilt = 0;
      const reducedM = !!(CA.settings && CA.settings.reducedMotion);
      if(u.alive){
        // JUMP anticipation/landing squash + in-air stretch (built on `land`).
        // jumpCrouch: a quick pre-takeoff squash. airStretch: a vertical stretch
        // while rising. land: the existing landing squash. They layer cleanly.
        if(a.land>0){ sx = 1 + a.land*0.35; sy = 1 - a.land*0.35; }      // land squash
        else if(a.jumpCrouch>0){ const j=a.jumpCrouch; sx = 1 + j*0.28; sy = 1 - j*0.28; } // crouch
        else if(a.airStretch>0.02 && !u.grounded){ const s=a.airStretch; sx = 1 - s*0.18; sy = 1 + s*0.22; } // stretch up
        else { const br = Math.sin(a.t*0.9)*0.03; sx = 1 - br; sy = 1 + br; } // breathe
        // #35 — CELEBRATE: lively little hop (winning team after gameOver)
        if(a.celebrate>0){
          const hop = Math.abs(Math.sin(a.t*2.4));      // 0..1, bouncy
          bob -= hop*7;                                 // jump up
          const st = 1 + hop*0.12; sx *= (2-st); sy *= st;   // stretch up on the hop
        }
        // #35 — FLINCH: quick duck + tiny shiver away from a nearby blast.
        // Combat juice: a comedic DUCK/FLATTEN ripple — units in blast range but
        // not killed flatten down then spring back. We shape the squash with a
        // sine of the remaining flinch so it reads as a bouncy reaction (squash
        // hard at impact, overshoot a touch on the way out) rather than a flat lerp.
        if(a.flinch>0){
          const fl = a.flinch;
          const duck = Math.sin(U.clamp(fl,0,1)*Math.PI);  // 0->1->0 bounce envelope
          bob += fl*4 + duck*3;                         // crouch down + extra flatten dip
          sx *= 1 + (fl*0.10 + duck*0.14);              // wider as it flattens
          sy *= 1 - (fl*0.10 + duck*0.16);              // shorter (comedic pancake)
          extraX += Math.sin(a.t*30)*fl*1.6;            // shiver
          tilt = (a._flinchDir||1) * fl*0.10;           // lean away
        }
        // #35 — TAUNT: brief cocky lean-back/up after landing a hit
        if(a.taunt>0){
          bob -= a.taunt*2;
          tilt += a.taunt*0.08;                         // chin up
        }
        // #35 — IDLE micro-animations: a gentle look-around sway, a stretchy
        // yawn squash, or a quick twitch shiver. All tiny so they read as "alive"
        // without disturbing the aim/facing.
        if(a.idleAnim){
          const p = a.idleAnimT;                        // counts down
          if(a.idleAnim==='look'){ tilt += Math.sin(p*0.18)*0.07; }
          else if(a.idleAnim==='yawn'){
            const yw = Math.sin((1 - p/80)*Math.PI);     // 0->1->0 over the yawn
            sx *= 1 - yw*0.06; sy *= 1 + yw*0.10; bob -= yw*1.5;
          }
          else if(a.idleAnim==='twitch'){ extraX += Math.sin(p*0.9)*0.8; }
        }
        // ALWAYS-ON idle life: a whisper-soft head sway so a standing, non-active
        // unit is never perfectly frozen. This is pure CHARM (sub-pixel tilt, no
        // screen motion) so it stays ON even under reducedMotion — that flag is for
        // screen-shake / slow-mo / kill-cam, NOT the cute character life. Skipped
        // only while active or mid-reaction. (Fixes "frozen animals" on iPhones
        // that have iOS Reduce Motion enabled.)
        if(u.grounded && a.state==='idle' && !active &&
           a.flinch<=0 && a.hurtKick<=0 && a.celebrate<=0){
          // two detuned sines per unit (id offsets the phase) = organic, non-loopy
          tilt   += Math.sin(a.t*0.5 + u.id*1.3)*0.024;
          extraX += Math.sin(a.t*0.37 + u.id*0.7)*0.55;
        }
        // HURT recoil: a quick knock-back lean + jolt away from the hit. Snappy
        // and brief (hurtKick decays fast). Layered over everything else.
        if(a.hurtKick>0){
          const hk = a.hurtKick;
          extraX += (a._hurtDir||-1) * hk*3.2;          // jolt away
          tilt   += (a._hurtDir||-1) * hk*0.12;         // recoil lean
          sx *= 1 + hk*0.08; sy *= 1 - hk*0.06;         // brief squash
          if(!reducedM) extraX += Math.sin(a.t*40)*hk*1.0;  // tiny shudder
        }
        // KILL HOP: a happy little bounce of triumph after scoring a kill.
        if(a.killHop>0){
          const hop = Math.sin(U.clamp(1-a.killHop,0,1)*Math.PI); // 0->1->0 arc
          bob -= hop*6;
          sx *= (1 - hop*0.10); sy *= (1 + hop*0.12);
        }
        // FIRE RECOIL: a brief backward lean + tiny positional kick when the unit
        // fires, decaying over ~0.3s (anim.recoil, set by the 'fired' event and
        // ticked down in update). Composes additively with everything above and a
        // touch of body squash so the shot has weight. Pure cosmetic. Honoured even
        // under reducedMotion (it's character punch, not screen motion) but the
        // sine "kick-back jitter" is gated off when reducedMotion is on.
        if(a.recoil>0){
          const rc = a.recoil;
          const dir = a._recoilDir || -(u.facing||1);
          extraX += dir * rc*2.4;                       // shove backward
          tilt   += dir * rc*0.10;                      // lean back
          sx *= 1 + rc*0.05; sy *= 1 - rc*0.04;         // brief recoil squash
        }
      }
      if (u._blastFlight && !u.grounded && !reducedM){
        tilt+=u._blastFlight.rotation;
        bob=0;
      }
      const hitFlash = a.hitFlash;

      ctx.save();
      ctx.translate(u.x + extraX, u.y + bob);
      if(tilt) ctx.rotate(tilt);

      // ---- active unit highlight: soft halo + bobbing arrow ----
      if(active){
        const pulse = 0.18 + Math.sin(a.t*2)*0.08;
        ctx.save();
        ctx.fillStyle = `rgba(255,240,150,${pulse})`;
        ctx.beginPath(); ctx.arc(0, 2, C.UNIT_R+12, 0, TWO_PI); ctx.fill();
        ctx.restore();
      }

      // ---- ground contact shadow ----
      if(u.alive){
        ctx.save();
        ctx.fillStyle='rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(0, C.UNIT_R-1, C.UNIT_R*0.95*sx, 4.5, 0, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
      }

      // mirror by facing
      ctx.scale(u.facing, 1);
      ctx.scale(sx, sy);

      // ---- PvE BOSS: scale the whole body up + a menacing dark aura ----
      if(u._boss && u.alive){
        const bs = u._bossScale || 1.9;
        // pulsing aura ring behind the giant body
        ctx.save();
        ctx.scale(u.facing, 1);                       // cancel facing for the symmetric ring
        const ap = 0.10 + 0.05*Math.abs(Math.sin(a.t*1.4));
        ctx.fillStyle = u._bossColor ? u._bossColor : 'rgba(120,30,160,1)';
        ctx.globalAlpha = ap;
        ctx.beginPath(); ctx.arc(0, 2, (C.UNIT_R+8)*bs, 0, TWO_PI); ctx.fill();
        ctx.restore();
        ctx.scale(bs, bs);                            // everything below draws giant
      }

      if(!u.alive){
        this._drawDead(ctx, u, color);
      } else {
        // SECONDARY MOTION — a little dangly back appendage (tail/ear tuft) whose
        // tip lags behind & swings via the verlet chain on a.tail (ticked in
        // update). Drawn FIRST so it sits behind the body. Generic so it reads for
        // every species; skipped when there's no chain (reducedMotion / low-Q —
        // a.tail is only built then). We're in facing-mirrored local space here, so
        // +x is "forward": the appendage anchors at the lower-back (-x) and the
        // chain tip offset makes it trail & flick on walk/jump/recoil.
        this._drawBackAppendage(ctx, u, color);
        const sp = CA.speciesOf(u);
        if(sp && typeof sp.draw === 'function'){
          // custom species art (hedgehog/beaver/frog/bird) — local space already
          // mirrored + scaled; draw() reads emotion from CA.state itself.
          sp.draw(ctx, u, u.anim);
        } else if((u.species||u.kind)==='capybara' || u.kind==='capybara'){
          this._drawCapybara(ctx, u, color, {active, aiming, hitFlash});
        } else {
          this._drawWorm(ctx, u, color, {active, aiming, hitFlash});
        }
        // #37 colleague photo avatar face (drawn over the animal head if loaded)
        this._drawAvatarFace(ctx, u);
        // bright white "impact" pop the instant a hit lands (a couple of frames,
        // separate from the lingering red hitFlash) — gives damage a crisp punch.
        // Strengthened (combat juice): a solid additive white silhouette fill PLUS
        // a quick outward bloom ring on the first frames so the hit really reads.
        if((a.hitFlashWhite||0) > 0.02){
          const w = a.hitFlashWhite;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          // core silhouette flash — punchier alpha, eased so the peak is bright
          ctx.globalAlpha = U.clamp(w*0.85, 0, 0.85);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(0, 0, C.UNIT_R*1.08, 0, TWO_PI); ctx.fill();
          // brief expanding bloom ring (only while the pop is fresh, w>0.5) — a
          // thin bright outline that flings outward as the flash fades. Sub-pixel
          // cheap and reduced-motion safe (it's just a stroked arc, no shake).
          if(w > 0.5){
            const k = (w - 0.5) / 0.5;                    // 1 at spawn -> 0 mid-life
            ctx.globalAlpha = U.clamp(k*0.6, 0, 0.6);
            ctx.lineWidth = 2 + (1-k)*3;
            ctx.strokeStyle = '#fffbe8';
            ctx.beginPath(); ctx.arc(0, 0, C.UNIT_R*(1.1 + (1-k)*0.9), 0, TWO_PI); ctx.stroke();
          }
          ctx.restore();
        }
        // #4 low-HP scuffs/blood on the body (over species art)
        this._drawWounds(ctx, u);
        // #3 per-unit cosmetic trait overlay (hat/glasses/etc. on top of all)
        this._drawCosmetic(ctx, u);
        // v4 class overlay (necro aura, mage hat, hunter crest, …) — mirrored space
        if(!u.minion && CA.Classes && CA.Classes.drawOverlay){ try{ CA.Classes.drawOverlay(ctx, u, u.anim); }catch(e){} }
        // PvE BOSS crown — a spiky golden diadem over the head (drawn un-mirrored).
        if(u._boss){
          ctx.save();
          ctx.scale(u.facing, 1);                     // symmetric crown regardless of facing
          const cy = -C.UNIT_R - 4;                   // sit just above the head (local, pre-bossScale space)
          ctx.fillStyle = '#ffcf3a'; ctx.strokeStyle = '#7a5400'; ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(-7, cy+4);
          ctx.lineTo(-7, cy-2); ctx.lineTo(-3.5, cy+1.5); ctx.lineTo(0, cy-4);
          ctx.lineTo(3.5, cy+1.5); ctx.lineTo(7, cy-2); ctx.lineTo(7, cy+4);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          // little gems
          ctx.fillStyle = '#ff5577';
          ctx.beginPath(); ctx.arc(0, cy+2, 1.1, 0, TWO_PI); ctx.fill();
          ctx.restore();
        }
        // v4 — SHIELD bubble: a soft bluish dome while shield>0, brighter on a
        // recent absorb (anim._shieldHit). Drawn un-mirrored (circle, symmetric).
        if((u.shield||0) > 0 || (a._shieldHit||0) > 0){
          ctx.save();
          ctx.scale(u.facing, 1);                 // cancel the facing flip
          const hit = a._shieldHit||0;
          const base = (u.shield||0)>0 ? 0.16 : 0;
          const pulse = base + 0.10*Math.abs(Math.sin(a.t*1.6)) + hit*0.5;
          ctx.strokeStyle = `rgba(150,200,255,${U.clamp(pulse+0.25,0,0.9)})`;
          ctx.lineWidth = 2 + hit*2;
          ctx.beginPath(); ctx.arc(0, 2, C.UNIT_R+5, 0, TWO_PI); ctx.stroke();
          ctx.fillStyle = `rgba(150,200,255,${U.clamp(pulse,0,0.4)})`;
          ctx.beginPath(); ctx.arc(0, 2, C.UNIT_R+5, 0, TWO_PI); ctx.fill();
          ctx.restore();
        }

        // FREEZE ("Befagyás") — while u._frozen>0 (set by weapons.js fireFreeze)
        // encase the body in a translucent light-blue ice shell so the player can
        // SEE the freeze is active. Cheap (one filled+stroked circle); drawn
        // un-mirrored (symmetric). Guarded so it never throws.
        try {
          if((u._frozen||0) > 0){
            ctx.save();
            ctx.scale(u.facing, 1);                 // cancel the facing flip
            // soft icy body tint
            ctx.fillStyle = 'rgba(170,225,255,0.32)';
            ctx.beginPath(); ctx.arc(0, 2, C.UNIT_R+3, 0, TWO_PI); ctx.fill();
            // frosty rim
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(210,240,255,0.75)';
            ctx.beginPath(); ctx.arc(0, 2, C.UNIT_R+3, 0, TWO_PI); ctx.stroke();
            ctx.restore();
          }
        } catch(e){ /* ice shell never throws */ }

        // STUN ("Szédülés") — orbiting dizzy stars above a dazed unit (u.stunned>0)
        // or for a brief moment when one is first applied/consumed (anim.stunPop).
        // reducedMotion → the stars sit still instead of orbiting. Cheap (≤3 glyphs).
        try {
          if((u.stunned||0) > 0 || (a.stunPop||0) > 0){
            ctx.save();
            ctx.scale(u.facing, 1);                 // cancel the facing flip
            const reducedStun = !!(CA.settings && CA.settings.reducedMotion);
            const cy = -C.UNIT_R - 7;               // above the head
            const spin = reducedStun ? 0 : a.t*2.2;
            const glyphs = ['✦','★','✧'];
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffe066';
            for(let i=0;i<3;i++){
              const ang = spin + i*(TWO_PI/3);
              const ox = Math.cos(ang)*7;
              const oy = cy + Math.sin(ang)*2.6;     // squashed orbit (top-down-ish)
              ctx.globalAlpha = 0.55 + 0.45*((Math.sin(ang)+1)/2);
              ctx.fillText(glyphs[i], ox, oy);
            }
            ctx.restore();
          }
        } catch(e){ /* dizzy stars never throw */ }
      }

      ctx.restore();

      // ---- UI overlays (NOT mirrored / scaled): name tag, hp bar, arrow ----
      this._drawOverlay(ctx, u, team, active);
    },

    // ---- v4 MINIONS: small cute-spooky figures (skeleton/zombie/turret) ----
    _drawMinion(ctx, u){
      const team = CA.getTeam(u.ownerTeamId!=null?u.ownerTeamId:u.teamId) || {color:'#aaa'};
      const tcol = team.color || '#aaa';
      const R = u.radius || 10;
      const a = u.anim || {state:'idle', t:0, hitFlash:0, deathT:0, land:0};
      const dead = !u.alive;
      const bob = u.alive ? Math.sin(a.t*0.9)*1.0 : 0;
      const lifeFrac = (u.maxHp>0) ? U.clamp(u.hp/u.maxHp,0,1) : 1;

      ctx.save();
      ctx.translate(u.x, u.y + bob);

      // ground shadow
      if(u.alive){
        ctx.save(); ctx.fillStyle='rgba(0,0,0,0.20)';
        ctx.beginPath(); ctx.ellipse(0, R-1, R*0.9, 4, 0, 0, TWO_PI); ctx.fill(); ctx.restore();
      }

      ctx.scale(u.facing||1, 1);
      // squash on landing/recoil
      if(a.land>0){ ctx.scale(1+a.land*0.25, 1-a.land*0.25); }

      if(dead){
        // tiny poof/fade — minions just crumble, no tombstone
        const t=U.clamp(a.deathT,0,1);
        ctx.globalAlpha=(1-t)*0.7; ctx.fillStyle='#ddd';
        for(let i=0;i<4;i++){ const ang=i/4*TWO_PI; ctx.beginPath();
          ctx.arc(Math.cos(ang)*R*(0.4+t), Math.sin(ang)*R*(0.4+t)-t*4, R*0.4*(1-t*0.6),0,TWO_PI); ctx.fill(); }
        ctx.restore(); return;
      }

      const kind = u.minionKind;
      if(kind==='skeleton'){
        // little bone figure: skull + ribby body. Ticking toward a fuse-glow when
        // close to expiring (life<=1) so the player reads the imminent boom.
        const danger = (typeof u.life==='number' && u.life<=1);
        // body / spine
        ctx.strokeStyle='#dfe0e4'; ctx.lineWidth=3; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(0,-R*0.1); ctx.lineTo(0,R*0.6); ctx.stroke();
        // ribs
        ctx.lineWidth=2;
        for(let i=0;i<3;i++){ const ry=R*0.05+i*R*0.22;
          ctx.beginPath(); ctx.moveTo(-R*0.4,ry); ctx.lineTo(R*0.4,ry); ctx.stroke(); }
        // legs
        ctx.beginPath(); ctx.moveTo(0,R*0.6); ctx.lineTo(-R*0.3,R); ctx.moveTo(0,R*0.6); ctx.lineTo(R*0.3,R); ctx.stroke();
        ctx.lineCap='butt';
        // skull
        ctx.fillStyle = danger ? '#fff0d0' : '#f3f3f5';
        ctx.beginPath(); ctx.arc(0,-R*0.45,R*0.55,0,TWO_PI); ctx.fill();
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.ellipse(0,-R*0.2,R*0.35,R*0.18,0,0,TWO_PI); ctx.fill();
        // eye sockets (glow red when about to blow)
        ctx.fillStyle = danger ? '#ff4d4d' : '#2a2a2a';
        ctx.beginPath(); ctx.arc(-R*0.2,-R*0.5,R*0.13,0,TWO_PI); ctx.fill();
        ctx.beginPath(); ctx.arc( R*0.2,-R*0.5,R*0.13,0,TWO_PI); ctx.fill();
        // little fuse spark on the crown when danger
        if(danger){ ctx.fillStyle='#ffd27a';
          ctx.beginPath(); ctx.arc(0,-R*1.05 + Math.sin(a.t*3)*1.5, R*0.16,0,TWO_PI); ctx.fill(); }
      }
      else if(kind==='zombie'){
        // greenish hunched shambler, arms out front
        const g='#7cb05a', gd='#5d8a40', gl='#9bd17a';
        // body
        const grd=ctx.createLinearGradient(0,-R,0,R); grd.addColorStop(0,gl); grd.addColorStop(1,g);
        ctx.fillStyle=grd;
        ctx.beginPath(); ctx.ellipse(0,R*0.15,R*0.7,R*0.8,0,0,TWO_PI); ctx.fill();
        // outstretched arms
        ctx.strokeStyle=gd; ctx.lineWidth=4; ctx.lineCap='round';
        const sw=Math.sin(a.walkPhase||a.t)*0.15;
        ctx.beginPath(); ctx.moveTo(R*0.2,-R*0.05); ctx.lineTo(R*0.95, -R*0.05 + sw*R); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(R*0.2, R*0.1); ctx.lineTo(R*0.9, R*0.1 - sw*R); ctx.stroke();
        ctx.lineCap='butt';
        // head
        ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(R*0.1,-R*0.55,R*0.5,0,TWO_PI); ctx.fill();
        // dead-eyes + stitched mouth
        ctx.fillStyle='#1d2a16';
        ctx.beginPath(); ctx.arc(-R*0.05,-R*0.6,R*0.1,0,TWO_PI); ctx.fill();
        ctx.beginPath(); ctx.arc( R*0.28,-R*0.6,R*0.1,0,TWO_PI); ctx.fill();
        ctx.strokeStyle='#33502a'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(-R*0.1,-R*0.32); ctx.lineTo(R*0.35,-R*0.32); ctx.stroke();
        for(let i=-1;i<=2;i++){ ctx.beginPath(); ctx.moveTo(i*R*0.12-R*0.02,-R*0.38); ctx.lineTo(i*R*0.12-R*0.02,-R*0.26); ctx.stroke(); }
      }
      else if(kind==='chargehog'){
        // a scrappy spiky ball on little legs; eyes/fuse-spark glow red as it
        // nears its blast (life<=1) so the imminent detonation reads clearly.
        const danger = (typeof u.life==='number' && u.life<=1);
        // body
        ctx.fillStyle = danger ? '#8a6a4a' : '#6b5237';
        ctx.beginPath(); ctx.arc(0, R*0.1, R*0.75, 0, TWO_PI); ctx.fill();
        // spikes radiating out
        ctx.strokeStyle = danger ? '#caa' : '#4a3a26'; ctx.lineWidth=2;
        for(let s=0;s<10;s++){ const ang=s/10*TWO_PI; const c=Math.cos(ang), sn=Math.sin(ang);
          ctx.beginPath(); ctx.moveTo(c*R*0.7, R*0.1+sn*R*0.7); ctx.lineTo(c*R*1.05, R*0.1+sn*R*1.05); ctx.stroke(); }
        // little legs
        ctx.strokeStyle='#3a2a1a'; ctx.lineWidth=2; ctx.lineCap='round';
        const lw=Math.sin(a.walkPhase||a.t)*0.2;
        ctx.beginPath(); ctx.moveTo(-R*0.3,R*0.7); ctx.lineTo(-R*0.3,R*1.0+lw*R*0.3);
        ctx.moveTo(R*0.3,R*0.7); ctx.lineTo(R*0.3,R*1.0-lw*R*0.3); ctx.stroke();
        ctx.lineCap='butt';
        // snout + eyes
        ctx.fillStyle='#caa489'; ctx.beginPath(); ctx.arc(R*0.6,0,R*0.22,0,TWO_PI); ctx.fill();
        ctx.fillStyle='#1a1a1a'; ctx.beginPath(); ctx.arc(R*0.68,-R*0.02,R*0.06,0,TWO_PI); ctx.fill();
        ctx.fillStyle = danger ? '#ff4d4d' : '#222';
        ctx.beginPath(); ctx.arc(R*0.32,-R*0.18,R*0.12,0,TWO_PI); ctx.fill();
        if(danger){ ctx.fillStyle='#ffd27a';
          ctx.beginPath(); ctx.arc(0,-R*0.95 + Math.sin(a.t*3)*1.5, R*0.16,0,TWO_PI); ctx.fill(); }
      }
      else { // turret
        const base='#7a7f88', baseD='#565a61', barrel='#c0c4cc';
        // base plate
        ctx.fillStyle=baseD; this._roundRect(ctx,-R*0.8, R*0.4, R*1.6, R*0.5, 3);
        // dome housing
        const grd=ctx.createLinearGradient(0,-R,0,R); grd.addColorStop(0,'#9aa0aa'); grd.addColorStop(1,base);
        ctx.fillStyle=grd;
        ctx.beginPath(); ctx.arc(0,R*0.1,R*0.6,Math.PI,0); ctx.fill();
        this._roundRect(ctx,-R*0.6,R*0.1,R*1.2,R*0.4,2);
        // barrel pointing forward (+x)
        ctx.fillStyle=barrel; this._roundRect(ctx, R*0.2,-R*0.1, R*0.95, R*0.26, 3);
        ctx.fillStyle=baseD; this._roundRect(ctx, R*1.05,-R*0.14, R*0.16, R*0.34, 2);
        // little eye/scope light
        ctx.fillStyle = (u._fireCd<=14) ? '#ff6a6a' : '#7fffa0';
        ctx.beginPath(); ctx.arc(-R*0.05,-R*0.1,R*0.14,0,TWO_PI); ctx.fill();
      }

      // team-colour band so you can tell whose minion it is
      ctx.fillStyle=tcol; ctx.globalAlpha=0.9;
      this._roundRect(ctx,-R*0.5,R*0.62,R*1.0,R*0.18,2);
      ctx.globalAlpha=1;

      // hit flash
      if(a.hitFlash>0){ this._hitFlash(ctx, R*1.05, a.hitFlash); }

      ctx.restore();

      // small HP bar + life dots (unmirrored overlay)
      if(u.alive){
        const bw=22, bh=4, bx=u.x-bw/2, by=u.y-R-12;
        ctx.save();
        ctx.fillStyle='rgba(0,0,0,0.55)'; this._roundRectAbs(ctx,bx-1,by-1,bw+2,bh+2,2);
        ctx.fillStyle = lifeFrac>0.5 ? '#9be08a' : lifeFrac>0.25 ? '#ffd23f' : '#ff5a5a';
        this._roundRectAbs(ctx,bx,by,bw*lifeFrac,bh,2);
        // remaining-life pips
        if(typeof u.life==='number'){
          ctx.fillStyle=tcol;
          for(let i=0;i<Math.min(u.life,5);i++){ ctx.beginPath(); ctx.arc(bx+3+i*5, by-5, 1.6, 0, TWO_PI); ctx.fill(); }
        }
        ctx.restore();
      }
    },

    // ---- CAPYBARA --------------------------------------------------------
    _drawCapybara(ctx, u, color, st){
      const R = C.UNIT_R;
      const lean = st.aiming ? 0.18 : 0;     // lean forward when aiming
      const em = emoteEyeState(u);           // #35 happy/scared/surprised override
      const blink = u.anim.blink>0 && !em.happy;
      const walking = u.anim.state==='walk';
      const legSwing = walking ? Math.sin(u.anim.walkPhase)*3 : Math.sin(u.anim.t*0.9)*0.6;

      // body base colours
      const body = '#8a6a45', bodyD = '#6f5436', bodyL = '#a07f55';

      // --- legs (little stubs, behind body) ---
      ctx.save();
      ctx.fillStyle = bodyD;
      this._roundRect(ctx, -R*0.55 - legSwing*0.4, R*0.45, 7, 9, 3);
      this._roundRect(ctx,  R*0.30 + legSwing*0.4, R*0.45, 7, 9, 3);
      ctx.restore();

      // --- chunky rounded body ---
      ctx.save();
      ctx.translate(lean*R, 0);
      const grd = ctx.createLinearGradient(0, -R, 0, R);
      grd.addColorStop(0, bodyL); grd.addColorStop(1, body);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(0, R*0.18, R*1.02, R*0.86, 0, 0, TWO_PI);
      ctx.fill();

      // --- head (big blunt block fused to body) ---
      const hx = R*0.62, hy = -R*0.35;
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(hx, hy, R*0.70, R*0.62, 0, 0, TWO_PI);
      ctx.fill();

      // little rounded ears
      ctx.fillStyle = bodyD;
      ctx.beginPath(); ctx.arc(hx+R*0.18, hy-R*0.55, R*0.20, 0, TWO_PI); ctx.fill();
      ctx.beginPath(); ctx.arc(hx-R*0.30, hy-R*0.52, R*0.18, 0, TWO_PI); ctx.fill();
      ctx.fillStyle = lighten(color,0.4);
      ctx.beginPath(); ctx.arc(hx+R*0.18, hy-R*0.52, R*0.10, 0, TWO_PI); ctx.fill();

      // blunt snout / muzzle
      ctx.fillStyle = bodyL;
      ctx.beginPath();
      ctx.ellipse(hx+R*0.52, hy+R*0.18, R*0.34, R*0.30, 0, 0, TWO_PI);
      ctx.fill();
      // nostrils
      ctx.fillStyle = '#5a4329';
      ctx.beginPath(); ctx.ellipse(hx+R*0.62, hy+R*0.10, 2.4, 3.0, 0, 0, TWO_PI); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx+R*0.48, hy+R*0.12, 2.0, 2.6, 0, 0, TWO_PI); ctx.fill();
      // gentle mouth
      ctx.strokeStyle='#5a4329'; ctx.lineWidth=1.4; ctx.beginPath();
      ctx.arc(hx+R*0.52, hy+R*0.30, R*0.16, 0.15, Math.PI-0.15); ctx.stroke();

      // blush
      ctx.fillStyle='rgba(255,120,120,0.28)';
      ctx.beginPath(); ctx.arc(hx+R*0.05, hy+R*0.28, R*0.16, 0, TWO_PI); ctx.fill();

      // --- eyes (big calm; #35 emote override for happy/scared/surprised) ---
      const bk = u.anim.blinkKind||0;
      this._drawEmoteEye(ctx, hx+R*0.30, hy-R*0.05, R*0.20, blink, st.aiming, em, bk);
      this._drawEmoteEye(ctx, hx-R*0.18, hy-R*0.02, R*0.17, blink, st.aiming, em, bk);

      ctx.restore(); // un-lean

      // --- team bandana / scarf around the neck ---
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = darken(color,0.25); ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(R*0.05, -R*0.02);
      ctx.quadraticCurveTo(R*0.55, R*0.12, R*0.30, R*0.36);
      ctx.lineTo(R*0.05, R*0.28);
      ctx.quadraticCurveTo(-R*0.10, R*0.12, R*0.05, -R*0.02);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // little knot
      ctx.beginPath(); ctx.arc(R*0.10, R*0.05, R*0.12, 0, TWO_PI); ctx.fill();
      ctx.restore();

      // --- hit flash overlay ---
      if(st.hitFlash>0){ this._hitFlash(ctx, R*1.15, st.hitFlash); }
    },

    // ---- WORM ------------------------------------------------------------
    _drawWorm(ctx, u, color, st){
      const R = C.UNIT_R;
      const em = emoteEyeState(u);           // #35 happy/scared/surprised override
      const blink = u.anim.blink>0 && !em.happy;
      const wig = u.anim.t;
      const lean = st.aiming ? 0.20 : 0;

      const skin = '#e59ac0', skinD = '#cf7ea7', skinL = '#f6c2db';

      // --- segmented tail/body curving up to the head (drawn back-to-front) ---
      const segs = 4;
      for(let i=segs;i>=1;i--){
        const t = i/segs;
        const wob = Math.sin(wig*1.6 - i*0.8)* (3.2*(1-t)+1);
        const px = -R*0.85*t + wob*0.6;
        const py = R*0.55 - i*0.5 + Math.cos(wig*1.6 - i*0.7)*1.2;
        const rad = R*(0.34 + 0.10*(1-t));
        ctx.fillStyle = i%2 ? skin : skinD;
        ctx.beginPath(); ctx.arc(px, py, rad, 0, TWO_PI); ctx.fill();
      }

      // --- round head (front) ---
      ctx.save();
      ctx.translate(lean*R, 0);
      const headWob = Math.sin(wig*1.6)*1.5;
      const hx = R*0.30, hy = -R*0.10 + headWob*0.3;
      const grd = ctx.createRadialGradient(hx-R*0.2, hy-R*0.2, R*0.1, hx, hy, R*0.75);
      grd.addColorStop(0, skinL); grd.addColorStop(1, skin);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(hx, hy, R*0.70, 0, TWO_PI); ctx.fill();

      // tiny antenna with a bobble
      ctx.strokeStyle = skinD; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(hx+R*0.05, hy-R*0.62);
      ctx.quadraticCurveTo(hx+R*0.05+headWob, hy-R*1.0, hx+R*0.18+headWob, hy-R*1.05);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(hx+R*0.18+headWob, hy-R*1.10, R*0.14, 0, TWO_PI); ctx.fill();

      // blush
      ctx.fillStyle='rgba(220,60,110,0.22)';
      ctx.beginPath(); ctx.arc(hx-R*0.18, hy+R*0.22, R*0.13, 0, TWO_PI); ctx.fill();
      ctx.beginPath(); ctx.arc(hx+R*0.34, hy+R*0.20, R*0.12, 0, TWO_PI); ctx.fill();

      // big eyes (#35 emote override for happy/scared/surprised)
      const bk = u.anim.blinkKind||0;
      this._drawEmoteEye(ctx, hx+R*0.26, hy-R*0.06, R*0.20, blink, st.aiming, em, bk);
      this._drawEmoteEye(ctx, hx-R*0.18, hy-R*0.02, R*0.18, blink, st.aiming, em, bk);

      // little smile (a wide grin while celebrating)
      ctx.strokeStyle='#b85f88'; ctx.lineWidth=1.5; ctx.beginPath();
      if(em.happy) ctx.arc(hx+R*0.05, hy+R*0.14, R*0.24, 0.15, Math.PI-0.15);
      else ctx.arc(hx+R*0.05, hy+R*0.20, R*0.18, 0.2, Math.PI-0.2);
      ctx.stroke();
      ctx.restore();

      // --- team band around the body ---
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = darken(color,0.25); ctx.lineWidth=1;
      this._roundRect(ctx, -R*0.18, R*0.02, R*0.5, R*0.42, 3);
      ctx.restore();

      if(st.hitFlash>0){ this._hitFlash(ctx, R*1.0, st.hitFlash); }
    },

    // ---- #3 COSMETIC overlay: draw the unit's appearance trait in the unit's
    //      mirrored local space (origin centre, +x forward). Stays cute & small.
    _drawCosmetic(ctx, u){
      // v4.10 — CAPTAIN marker: a small gold star floating above the head so the
      // team captain is spottable at a glance. v5.0 (#5): the captain now ALSO has
      // a HP perk (+10–20%, csapatmérettel skálázva — see applyCaptainPerk) — a real leader, not
      // just a badge. The star is the at-a-glance "tankier target" cue.
      if (u && u._captain){
        ctx.save();
        ctx.translate(0, -C.UNIT_R*1.5);
        const R5 = C.UNIT_R*0.36, r5 = R5*0.45;
        ctx.beginPath();
        for (let k=0;k<10;k++){ const ang=-Math.PI/2 + k*Math.PI/5; const rr=(k%2===0)?R5:r5;
          const px=Math.cos(ang)*rr, py=Math.sin(ang)*rr; if(k===0)ctx.moveTo(px,py); else ctx.lineTo(px,py); }
        ctx.closePath();
        ctx.fillStyle='#ffd23f'; ctx.fill(); ctx.strokeStyle='#7a5500'; ctx.lineWidth=1; ctx.stroke();
        ctx.restore();
      }
      const c = u.cosmetic;
      if(!c || !c.id) return;
      const def = COSMETICS[c.id];
      if(!def || typeof def.draw !== 'function') return;
      ctx.save();
      // per-species anchor so the overlay sits ON the head / over the eyes
      const an = cosmeticAnchor(u);
      ctx.translate(an.dx, an.dy);
      if(an.s !== 1) ctx.scale(an.s, an.s);
      // editor-saved override (see #3c): EXTRA shift/scale/rotation on top of the
      // baked anchor. Defensive: missing/garbage values fall back to neutral.
      const ov = cosmeticOverride((u && (u.species || u.kind)) || 'capybara', c.id);
      if(ov){
        const R = C.UNIT_R;
        const ox = (typeof ov.dx === 'number') ? ov.dx : 0;
        const oy = (typeof ov.dy === 'number') ? ov.dy : 0;
        if(ox || oy) ctx.translate(ox * R, oy * R);
        if(typeof ov.rot === 'number' && ov.rot) ctx.rotate(ov.rot);
        const os = (typeof ov.scale === 'number' && ov.scale > 0) ? ov.scale : 1;
        if(os !== 1) ctx.scale(os, os);
      }
      try { def.draw(ctx, C.UNIT_R, u, u.anim); } catch(e){ /* never break render */ }
      ctx.restore();
    },

    // ---- #4 LOW-HP WOUNDS: scuffs/scratches as HP drops, more blood-spots &
    //      a tiny bandage at very low HP. Positions are DETERMINISTIC (hash of
    //      unit id), never Math.random at render time, so they don't flicker.
    _drawWounds(ctx, u){
      const frac = U.clamp(u.hp/u.maxHp, 0, 1);
      if(frac >= 0.65) return;                 // healthy → nothing
      const R = C.UNIT_R;
      // how hurt: 0 at 0.65 HP up to 1 at 0 HP
      const hurt = U.clamp((0.65 - frac)/0.65, 0, 1);
      const h = hashStr('wound:'+u.id);
      // deterministic pseudo-random in [0,1) from bit slices of the hash
      const rnd = (i)=>(((h >>> ((i*5)%27)) & 0xff) / 256);

      ctx.save();
      // a few small reddish scratches (count scales with how hurt)
      const scratches = Math.min(4, 1 + Math.floor(hurt*4));
      ctx.strokeStyle = 'rgba(170,40,40,0.7)'; ctx.lineWidth = 1.4; ctx.lineCap='round';
      for(let i=0;i<scratches;i++){
        const ang = rnd(i)*TWO_PI;
        const rad = R*(0.15 + rnd(i+9)*0.6);
        const cx = Math.cos(ang)*rad, cy = Math.sin(ang)*rad + R*0.1;
        const len = R*(0.16 + rnd(i+3)*0.16);
        const dir = ang + 0.6;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(dir)*len, cy - Math.sin(dir)*len);
        ctx.lineTo(cx + Math.cos(dir)*len, cy + Math.sin(dir)*len);
        ctx.stroke();
      }
      ctx.lineCap='butt';

      // dirt smudges always once we're below 0.65
      ctx.fillStyle = 'rgba(90,70,45,0.30)';
      for(let i=0;i<2;i++){
        const ang = rnd(i+5)*TWO_PI;
        const rad = R*(0.2 + rnd(i+7)*0.5);
        ctx.beginPath();
        ctx.ellipse(Math.cos(ang)*rad, Math.sin(ang)*rad + R*0.12, R*0.16, R*0.10, ang, 0, TWO_PI);
        ctx.fill();
      }

      // SEVERELY hurt (<0.35): blood spots + a little plaster/bandage
      if(frac < 0.35){
        const sev = U.clamp((0.35 - frac)/0.35, 0, 1);
        ctx.fillStyle = 'rgba(180,30,30,0.7)';
        const spots = 2 + Math.floor(sev*3);
        for(let i=0;i<spots;i++){
          const ang = rnd(i+11)*TWO_PI;
          const rad = R*(0.1 + rnd(i+13)*0.6);
          const sr  = R*(0.06 + rnd(i+15)*0.07);
          ctx.beginPath();
          ctx.arc(Math.cos(ang)*rad, Math.sin(ang)*rad + R*0.1, sr, 0, TWO_PI);
          ctx.fill();
        }
        // cute crossed plaster on the cheek
        const px = R*0.45, py = -R*0.05;
        ctx.save();
        ctx.translate(px, py); ctx.rotate(0.5);
        ctx.fillStyle = '#ffd9a0'; ctx.strokeStyle='#e0b173'; ctx.lineWidth=0.8;
        this._roundRect(ctx, -R*0.22, -R*0.07, R*0.44, R*0.14, 2); ctx.stroke();
        ctx.fillStyle='rgba(180,140,90,0.6)';
        for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.arc(i*R*0.12, 0, 0.9, 0, TWO_PI); ctx.fill(); }
        ctx.restore();
      }
      ctx.restore();
    },

    // ---- DEAD pose (#30): poof, faded body, crossed eyes, and a haloed
    //      little angel-spirit floating up. The named tombstone is drawn in
    //      the (unmirrored) overlay so the text reads correctly. -----------
    _drawDead(ctx, u, color){
      const R=C.UNIT_R;
      const t = U.clamp(u.anim.deathT,0,1);
      const sp = CA.speciesOf(u);
      const bodyCol = (sp && sp.colors && sp.colors.body) ||
                      (u.kind==='capybara' ? '#8a6a45' : '#e59ac0');

      // initial POOF cloud (first ~0.4 of deathT)
      if(t < 0.5){
        ctx.save();
        const p = t/0.5;
        ctx.globalAlpha = (1-p)*0.7;
        ctx.fillStyle = '#fff';
        for(let i=0;i<5;i++){
          const ang = i/5*TWO_PI;
          const rr = R*(0.5+p*1.0);
          ctx.beginPath(); ctx.arc(Math.cos(ang)*rr, Math.sin(ang)*rr - p*4, R*0.45*(1-p*0.5), 0, TWO_PI); ctx.fill();
        }
        ctx.restore();
      }

      // crumpled faded body — with a brief DEATH TUMBLE: the body flops over and
      // settles, a quick spin that eases out as it comes to rest (~first half of
      // deathT). Direction keyed off facing so it tumbles away naturally. Skipped
      // for reducedMotion (just lies flat). Cheap: one rotate over the existing draw.
      ctx.save();
      ctx.globalAlpha = 0.5*(1-t*0.6);
      const reducedM = !!(CA.settings && CA.settings.reducedMotion);
      if(!reducedM){
        const tum = U.clamp(t/0.5, 0, 1);                 // 0..1 over the first half
        const rest = (u.facing||1) * 0.9;                 // final flopped angle
        // ease-out: spins fast then settles toward `rest`
        ctx.rotate(rest * (1 - (1-tum)*(1-tum)));
        ctx.translate(0, (1-tum)*-R*0.25);                // a little hop as it flops
      }
      ctx.fillStyle = bodyCol;
      ctx.beginPath(); ctx.ellipse(0, R*0.4, R*0.95, R*0.5, 0, 0, TWO_PI); ctx.fill();
      // crossed-out eyes (X X)
      ctx.globalAlpha = 0.7*(1-t*0.5);
      ctx.strokeStyle='#333'; ctx.lineWidth=2;
      [[-R*0.35],[R*0.05]].forEach(([ex])=>{
        const ey = R*0.18, s=R*0.12;
        ctx.beginPath(); ctx.moveTo(ex-s,ey-s); ctx.lineTo(ex+s,ey+s);
        ctx.moveTo(ex+s,ey-s); ctx.lineTo(ex-s,ey+s); ctx.stroke();
      });
      ctx.restore();

      // rising little ANGEL spirit (halo + tiny wings) ----------------------
      ctx.save();
      ctx.globalAlpha = U.clamp(0.9-t*0.7,0,0.9);
      const floatY = -R*0.6 - t*30;
      const sway = Math.sin(u.anim.deathT*4)*3;
      ctx.translate(sway, floatY);
      // halo
      ctx.strokeStyle='rgba(255,235,140,0.95)'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.ellipse(0,-R*0.62,R*0.3,R*0.12,0,0,TWO_PI); ctx.stroke();
      // little wings
      ctx.fillStyle='rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.ellipse(-R*0.45,0,R*0.22,R*0.12,-0.5,0,TWO_PI); ctx.fill();
      ctx.beginPath(); ctx.ellipse( R*0.45,0,R*0.22,R*0.12, 0.5,0,TWO_PI); ctx.fill();
      // ghost/angel body
      ctx.fillStyle='rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(0,0,R*0.42,Math.PI,0);
      ctx.lineTo(R*0.42, R*0.5);
      for(let i=2;i>=-2;i--){ ctx.lineTo(i*R*0.21, R*(i%2?0.55:0.42)); }
      ctx.closePath(); ctx.fill();
      // sweet closed eyes ^ ^
      ctx.strokeStyle='#666'; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.moveTo(-R*0.2,-R*0.04); ctx.quadraticCurveTo(-R*0.12,-R*0.14,-R*0.04,-R*0.04); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( R*0.04,-R*0.04); ctx.quadraticCurveTo( R*0.12,-R*0.14, R*0.2,-R*0.04); ctx.stroke();
      ctx.restore();
    },

    // ---- shared eye drawer (white + iris + shine; squints when aiming) ----
    _drawEye(ctx, x, y, r, blink, aiming, blinkKind){
      if(blink){
        // closed-eye curve; a slow/sleepy blink (kind 2) sits a touch deeper so a
        // long blink reads as drowsy rather than identical to a quick one.
        const deep = (blinkKind===2) ? 0.72 : 0.5;
        ctx.strokeStyle='#3a2a1a'; ctx.lineWidth=1.6;
        ctx.beginPath(); ctx.moveTo(x-r,y); ctx.quadraticCurveTo(x,y+r*deep,x+r,y); ctx.stroke();
        return;
      }
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(x,y,r,0,TWO_PI); ctx.fill();
      const ph = aiming ? 0.30 : 0;            // pupil shifts forward when aiming
      ctx.fillStyle='#2a2018';
      ctx.beginPath(); ctx.arc(x+r*ph, y+r*0.05, r*0.55, 0, TWO_PI); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(x+r*ph-r*0.18, y-r*0.18, r*0.20, 0, TWO_PI); ctx.fill();
    },

    // #35 — like _drawEye but layers emote expressions (happy ^_^ / surprised
    // O_O / scared wide-darting) on top. Falls through to the normal eye.
    _drawEmoteEye(ctx, x, y, r, blink, aiming, em, blinkKind){
      if(em){
        if(em.happy){                                   // closed upcurved ^_^
          ctx.strokeStyle='#2a2018'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.moveTo(x-r,y+r*0.2); ctx.quadraticCurveTo(x,y-r*0.6,x+r,y+r*0.2); ctx.stroke();
          return;
        }
        if(em.surprised){                               // big white + tiny pupil
          ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,r*1.15,0,TWO_PI); ctx.fill();
          ctx.fillStyle='#2a2018'; ctx.beginPath(); ctx.arc(x,y,r*0.4,0,TWO_PI); ctx.fill();
          return;
        }
        if(em.scared && !blink){                        // wide whites, pupil back
          ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,r*1.1,0,TWO_PI); ctx.fill();
          ctx.fillStyle='#2a2018'; ctx.beginPath(); ctx.arc(x-r*0.3,y-r*0.1,r*0.5,0,TWO_PI); ctx.fill();
          return;
        }
      }
      this._drawEye(ctx, x, y, r, blink, aiming, blinkKind);
    },

    _hitFlash(ctx, r, amt){
      ctx.save();
      ctx.globalAlpha = 0.55*amt;
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TWO_PI); ctx.fill();
      ctx.restore();
    },

    // ---- name tag + hp bar + active arrow (screen-upright, world space) ---
    _drawOverlay(ctx, u, team, active){
      // bosses are drawn at u._bossScale, so push the name/HP bar above the giant body.
      const R=C.UNIT_R * ((u._boss && u.alive) ? (u._bossScale||1.9) : 1);
      const topY = u.y - R - (u.alive?14:6);

      // active-turn bobbing arrow pointing down at the unit
      if(active && u.alive){
        const ay = u.y - R - 30 + Math.sin(u.anim.t*2)*3;
        ctx.save();
        ctx.fillStyle = team.color || '#ffd23f';
        ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1.5;
        ctx.beginPath();
        ctx.moveTo(u.x, ay+12);
        ctx.lineTo(u.x-7, ay);
        ctx.lineTo(u.x+7, ay);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }

      // --- DEAD: a little named tombstone where they fell (#30) ---
      if(!u.alive && !u._blastCorpse){
        const dt = U.clamp(u.anim.deathT,0,1);
        if(dt > 0.35){
          const a = U.clamp((dt-0.35)/0.4, 0, 1);     // tombstone rises in
          ctx.save();
          ctx.globalAlpha = a;
          // grave base follows its own physics y (#9): falls/settles with terrain
          const gx = u.x, gy = (u._graveY!=null) ? u._graveY : (u.y + R - 2);
          const sw = 24, sh = 30;
          // stone
          ctx.fillStyle = '#9aa4ad';
          this._roundRectAbs(ctx, gx-sw/2, gy-sh, sw, sh, 10);
          ctx.fillStyle = '#7d878f';
          this._roundRectAbs(ctx, gx-sw/2, gy-sh+6, sw, sh-6, 0);
          // RIP-style cross
          ctx.strokeStyle='#5f686f'; ctx.lineWidth=2.4;
          ctx.beginPath(); ctx.moveTo(gx, gy-sh+6); ctx.lineTo(gx, gy-sh+18); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(gx-5, gy-sh+10); ctx.lineTo(gx+5, gy-sh+10); ctx.stroke();
          // name plate under the cross
          ctx.font = '700 8px system-ui, sans-serif';
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillStyle='#3a4046';
          const nm = u.name.length>9 ? u.name.slice(0,8)+'…' : u.name;
          ctx.fillText(nm, gx, gy-6);
          // little grass tuft
          ctx.strokeStyle='#5fa84e'; ctx.lineWidth=1.6;
          ctx.beginPath(); ctx.moveTo(gx-sw/2-3, gy); ctx.lineTo(gx-sw/2-5, gy-5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(gx+sw/2+3, gy); ctx.lineTo(gx+sw/2+5, gy-5); ctx.stroke();
          ctx.restore();
        }
        return; // no living name-pill / hp bar / bubble for dead
      }

      // name tag (prefix the player's CLAN tag on their own units, e.g. "[BOO] Bobó")
      ctx.save();
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      let label = u.name;
      try { if(team && team.isAI===false && CA.Clans && CA.Clans.myTag){
        const _tg=CA.Clans.myTag(); if(_tg) label='['+_tg+'] '+u.name; } } catch(_){}
      const tw = ctx.measureText(label).width + 12;
      const tagY = topY - 1;
      // pill background tinted by team
      ctx.fillStyle = 'rgba(20,20,28,0.62)';
      this._roundRectAbs(ctx, u.x-tw/2, tagY-8, tw, 15, 7);
      ctx.fillStyle = team.color || '#fff';
      this._roundRectAbs(ctx, u.x-tw/2, tagY-8, 4, 15, 2); // team color tab
      ctx.fillStyle = '#fff';
      ctx.fillText(label, u.x+2, tagY-0.5);
      ctx.restore();

      // HP bar (living)
      {
        const bw=34, bh=5, bx=u.x-bw/2, by=topY+9;
        const frac = U.clamp(u.hp/u.maxHp,0,1);
        ctx.save();
        ctx.fillStyle='rgba(0,0,0,0.55)';
        this._roundRectAbs(ctx, bx-1, by-1, bw+2, bh+2, 3);
        // HP bar uses the TEAM colour (so you can tell teams apart at a glance);
        // only when badly hurt (<30%) does it flip to red as a danger cue.
        const teamCol = (team && team.color) || '#5fd35f';
        const col = frac>0.3 ? teamCol : '#ff5a5a';
        ctx.fillStyle=col;
        this._roundRectAbs(ctx, bx, by, bw*frac, bh, 2.5);
        ctx.restore();
      }

      // TASK 3 — speech bubble: sits ABOVE the name pill + hp bar (and above
      // the active-turn arrow), so it never covers the animal or the aim line.
      if(u.anim.bubble && u.anim.bubbleT>0){
        ctx.save();
        // pop-in scale at the very start, fade-out near the end
        const tt = u.anim.bubbleT;
        const appear = U.clamp((1.6 - tt) / 0.18, 0, 1);     // grows in
        const scale = 0.6 + 0.4*appear;
        ctx.globalAlpha = U.clamp(tt*1.6, 0, 1);
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        const msg = u.anim.bubble;
        const bw = Math.max(26, ctx.measureText(msg).width + 16);
        const bh = 20;
        // lift above the active arrow (which peaks at u.y-R-30) and the name tag
        const bx = u.x, by = u.y - R - (active ? 46 : 34);
        ctx.translate(bx, by);
        ctx.scale(scale, scale);
        // bubble body
        ctx.fillStyle='rgba(255,255,255,0.96)';
        ctx.strokeStyle='rgba(0,0,0,0.18)'; ctx.lineWidth=1.5;
        this._roundRectAbs(ctx, -bw/2, -bh/2, bw, bh, 9);
        ctx.stroke();
        // little tail pointing down at the animal
        ctx.fillStyle='rgba(255,255,255,0.96)';
        ctx.beginPath(); ctx.moveTo(-5, bh/2-1); ctx.lineTo(5, bh/2-1); ctx.lineTo(0, bh/2+6); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#333';
        ctx.fillText(msg, 0, 0);
        ctx.restore();
      }
    },

    // ---- tiny canvas helpers --------------------------------------------
    // rounded rect that FILLS in current local (mirrored) space; if `fill` true also fills
    _roundRect(ctx, x, y, w, h, r){
      ctx.beginPath();
      ctx.moveTo(x+r,y);
      ctx.arcTo(x+w,y,x+w,y+h,r);
      ctx.arcTo(x+w,y+h,x,y+h,r);
      ctx.arcTo(x,y+h,x,y,r);
      ctx.arcTo(x,y,x+w,y,r);
      ctx.closePath();
      ctx.fill();
    },
    // absolute-space rounded rect (used by overlays, not mirrored)
    _roundRectAbs(ctx, x, y, w, h, r){
      r = Math.min(r, w/2, h/2);
      ctx.beginPath();
      ctx.moveTo(x+r,y);
      ctx.arcTo(x+w,y,x+w,y+h,r);
      ctx.arcTo(x+w,y+h,x,y+h,r);
      ctx.arcTo(x,y+h,x,y,r);
      ctx.arcTo(x,y,x+w,y,r);
      ctx.closePath();
      ctx.fill();
    },

    // =======================================================================
    // PHOTO AVATARS (removed in the open-source build)
    // The closed-source builds could clip a real colleague's photo onto a unit's
    // head, keyed off the internal staff roster. That mapped real names to an
    // internal photo host, so it is not part of the public game: the drawn
    // animal face is now the only face. The hook stays so the render path in
    // _drawUnit() is unchanged, and so a fork can implement its own avatars.
    // =======================================================================
    useAvatars: false,

    /* Return an Image to clip over the unit's head, or null for the drawn face. */
    _getAvatar(){ return null; },

    /* Draw the avatar photo (if _getAvatar provides one) as a circular face. */
    _drawAvatarFace(ctx, u){
      if (!this.useAvatars) return;
      let img;
      try { img = this._getAvatar(u); } catch(e){ img = null; }
      if (!img) return;
      const R = C.UNIT_R;
      const fx0 = R*0.55, fy0 = -R*0.28, fr = R*0.62;
      ctx.save();
      ctx.scale(u.facing, 1);              // un-mirror so the photo is never flipped
      ctx.beginPath(); ctx.arc(fx0, fy0, fr, 0, TWO_PI); ctx.clip();
      try { ctx.drawImage(img, fx0-fr, fy0-fr, fr*2, fr*2); }
      catch(e){ ctx.restore(); return; }
      ctx.restore();
      const team = CA.getTeam(u.teamId) || {color:'#fff'};
      ctx.save();
      ctx.scale(u.facing, 1);
      ctx.strokeStyle = team.color || '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fx0, fy0, fr, 0, TWO_PI); ctx.stroke();
      ctx.restore();
    },

    // =======================================================================
    // shared helper bag for species.js draw() functions — keeps the new
    // species' art consistent with the native capy/worm look (#6).
    // =======================================================================
    _h: {
      eye(ctx,x,y,r,blink,aiming){ CA.Entities._drawEye(ctx,x,y,r,blink,aiming); },
      rr(ctx,x,y,w,h,r){ CA.Entities._roundRect(ctx,x,y,w,h,r); },
      rrAbs(ctx,x,y,w,h,r){ CA.Entities._roundRectAbs(ctx,x,y,w,h,r); },
      hitFlash(ctx,r,amt){ CA.Entities._hitFlash(ctx,r,amt); },
      darken, lighten,
    },
  };
})();
