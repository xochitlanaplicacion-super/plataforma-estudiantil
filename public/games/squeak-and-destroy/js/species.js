/* ============================================================================
 * CUTE ANIMALS — species.js  ::  CA.Species  (Agent Critters)
 * ----------------------------------------------------------------------------
 * Features #6 (új állatok), #7 (passzívok), #8 (faj-ultimate hivatkozás),
 * supports #9 (csapatszerkesztő reads this list).
 *
 * CA.Species is a registry keyed by species id. entities.js reads it to DRAW
 * units (dispatch to draw() when present, else its built-in capybara/worm),
 * apply PASSIVES (in entities.update), and to know each species' ULTIMATE
 * weapon id (weapons.js implements those weapon ids, see hazards/weapons).
 *
 * SIX species (ids):
 *   'capybara' 🐹  passive 'swim'  ultimate 'capybomb'
 *   'worm'     🪱  passive 'dig'   ultimate 'drill'
 *   'hedgehog' 🦔  passive 'roll'  ultimate 'spikeball'
 *   'beaver'   🦫  passive 'build' ultimate 'logtoss'
 *   'frog'     🐸  passive 'leap'  ultimate 'bellyflop'
 *   'bird'     🦅  passive 'glide' ultimate 'eggbomb'
 *
 * NOTE: capybara & worm draw() are left null on purpose — entities.js draws
 * those two natively (consistent with the existing adorable art). The four new
 * species supply a full draw(ctx,u,anim). All drawing reuses the shared helper
 * bag CA.Entities._h (eyes/blink/roundRect/hitFlash) so the look stays uniform.
 * Each draw runs in entities' local space: origin at the unit centre, already
 * mirrored by facing and squash/stretch-scaled. UNIT_R ≈ 16 (readable at 32px).
 * ==========================================================================*/
(function(){
  const U = CA.util;
  const TWO_PI = Math.PI*2;

  // EN translations for species passive descriptions (rendered via t(passiveDesc)).
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Úszik — lassabban fullad és kissé lebeg a vízen.':
      'Swims — drowns slower and bobs slightly on water.',
    'Beás a terepbe — rövid alagutat fúr lefelé.':
      'Digs into terrain — bores a short tunnel downward.',
    'Gurul — gyors mozgásnál tüskés gömbként sebzi az ellenfelet.':
      'Rolls — at high speed hits enemies as a spiky ball.',
    'Épít — egy kis fal-gátat rak le maga elé.':
      'Builds — places a small wall barrier in front of itself.',
    'Ugrik — sokkal magasabbra és messzebbre szökell.':
      'Leaps — jumps much higher and farther.',
    'Siklik — ugrás után rövid ideig lebegve csökken az esése.':
      'Glides — after a jump floats briefly, slowing its fall.',
    'Rönk-rakétás — ugrás után siklik, lassabban esik.':
      'Log-rocket — glides after a jump, falling slower.',
    'Szárnyas — ugrás után lebegve, lassabban esik.':
      'Winged — floats after a jump, falling slower.',
    'Fürge — ugrás után rövid ideig siklik, lágyabban ér földet.':
      'Nimble — glides briefly after a jump, landing softer.',
    'Macskaügyes — sokkal messzebbre és magasabbra szökell.':
      'Cat-agile — leaps much higher and farther.',
    'Csúszdázik — ugrás után a hasán siklik, lassabban esik.':
      'Toboggans — slides on its belly after a jump, falling slower.',
  });

  // grab the shared helper bag exposed by entities.js (filled in its IIFE).
  // guarded so loading order never throws; falls back to tiny local stubs.
  function H(){ return (CA.Entities && CA.Entities._h) || _stub; }
  const _stub = {
    eye(ctx,x,y,r,blink){ ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,r,0,TWO_PI); ctx.fill();
      ctx.fillStyle='#2a2018'; ctx.beginPath(); ctx.arc(x,y,r*0.55,0,TWO_PI); ctx.fill(); },
    rr(ctx,x,y,w,h,r){ ctx.fillRect(x,y,w,h); },
    hitFlash(){}, darken:(c)=>c, lighten:(c)=>c,
  };

  // pull the unit's "emotion" once per draw. Centralised so every species
  // reacts the same way to charging / win / damage (#28).
  function emotion(u){
    const a = u.anim || {};
    const S = CA.state;
    const active = S.activeUnitId===u.id && S.mode===CA.GameState.PLAYING;
    // #35 — flinch (near a blast) reads as scared; celebrate (win-hop) as happy.
    const flinching = (a.flinch||0) > 0.05;
    const nervous = (active && S.charging) || flinching;  // scared while charging or ducking
    const happy   = (a.celebrate||0) > 0 ||
                    (S.mode===CA.GameState.GAME_OVER &&
                     S.winnerTeamId!=null && u.teamId===S.winnerTeamId);
    // a fresh hit OR a strong flinch pops the surprised "O_O" eyes briefly.
    const surprised = (a.hitFlash||0) > 0.45 || (a.flinch||0) > 0.6;
    return { active, aiming:active && a._aiming, nervous, happy, surprised,
             mood: restingMood(u),
             blink:(a.blink>0) && !surprised && !happy };
  }

  /* ---- resting mouth MOOD (cute-spooky variety, #neutral-faces) -------------
   * Not everyone permanently grins. Each unit gets a STABLE resting mood
   * derived deterministically from its id (so it never flickers per-frame):
   *   ~50% 'neutral'  (small straight line)
   *   ~30% 'sad'      (slightly downturned)
   *   ~20% 'smile'    (gentle little smile, never a big grin)
   * Guarded so a missing/odd id can never throw. Active emotion states
   * (happy/celebrate/surprised/nervous) still override this resting mouth at
   * the draw sites below. */
  function restingMood(u){
    try{
      const id = (u && u.id != null) ? String(u.id) : 'x';
      let hsh = 0;
      for(let i=0;i<id.length;i++){ hsh = (hsh*31 + id.charCodeAt(i)) >>> 0; }
      const r = hsh % 100;
      if(r < 50) return 'neutral';
      if(r < 80) return 'sad';
      return 'smile';
    }catch(_){ return 'neutral'; }
  }

  /* ---- shared resting-mouth drawer. Draws a subtle mouth centred at (cx,cy)
   *      with half-width w, using the unit's stable mood. Skipped entirely
   *      when an active expression already owns the face (happy/surprised/
   *      nervous) so emotion overrides stay intact. `color`/`lw` optional. */
  function drawMoodMouth(ctx, cx, cy, w, e, color, lw){
    try{
      if(!e || e.happy || e.surprised || e.nervous) return; // emotion overrides
      const col = color || '#2a2018';
      ctx.strokeStyle = col; ctx.lineWidth = lw || 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const mood = e.mood || 'neutral';
      if(mood === 'sad'){          // gentle downturn
        ctx.moveTo(cx - w, cy + w*0.18);
        ctx.quadraticCurveTo(cx, cy - w*0.30, cx + w, cy + w*0.18);
      } else if(mood === 'smile'){ // small, soft smile (never a big grin)
        ctx.moveTo(cx - w, cy - w*0.10);
        ctx.quadraticCurveTo(cx, cy + w*0.42, cx + w, cy - w*0.10);
      } else {                     // neutral — tiny straight line
        ctx.moveTo(cx - w*0.75, cy);
        ctx.lineTo(cx + w*0.75, cy);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    }catch(_){ /* never throw from drawing */ }
  }

  /* ------------------------------------------------------------------ HEDGEHOG
   * Cute round body, spiky back, button nose. When rolling (passive 'roll')
   * entities sets anim.rolling=true → we draw a tucked spiky ball that spins. */
  function drawHedgehog(ctx, u, a){
    const h = H(); const e = emotion(u);
    const R = CA.config.UNIT_R;
    const team = CA.getTeam(u.teamId) || {color:'#888'};
    const col = team.color || '#7a8c3a';
    const body='#a98158', bodyL='#c69f73', spike='#6b5236', spikeL='#8a6a45';

    // rolling ball mode (passive in motion) -----------------------------------
    if(a.rolling){
      const spin = a.rollSpin||0;
      ctx.save();
      ctx.rotate(spin);
      // spiky disc
      ctx.fillStyle = spike;
      ctx.beginPath(); ctx.arc(0,0,R*1.05,0,TWO_PI); ctx.fill();
      const spikes=12;
      ctx.fillStyle = spikeL;
      for(let i=0;i<spikes;i++){
        const ang=(i/spikes)*TWO_PI;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang)*R*0.95, Math.sin(ang)*R*0.95);
        ctx.lineTo(Math.cos(ang+0.14)*R*1.4, Math.sin(ang+0.14)*R*1.4);
        ctx.lineTo(Math.cos(ang-0.14)*R*1.4, Math.sin(ang-0.14)*R*1.4);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0,0,R*0.55,0,TWO_PI); ctx.fill();
      ctx.restore();
      // tiny motion-line eyes (dizzy but determined)
      ctx.strokeStyle='#2a2018'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(R*0.18,-R*0.1,R*0.12,0.2,Math.PI-0.2); ctx.stroke();
      if(a.hitFlash>0) h.hitFlash(ctx, R*1.4, a.hitFlash);
      return;
    }

    // standing/walking ---------------------------------------------------------
    const walk = u.anim.state==='walk';
    const legSwing = walk ? Math.sin(u.anim.walkPhase)*3 : 0;

    // little feet
    ctx.fillStyle = '#5a4329';
    h.rr(ctx, -R*0.42 - legSwing*0.3, R*0.55, 6, 6, 2);
    h.rr(ctx,  R*0.18 + legSwing*0.3, R*0.55, 6, 6, 2);

    // spiky cloak (back half)
    ctx.save();
    const spikeRows=3, perRow=6;
    for(let r=0;r<spikeRows;r++){
      ctx.fillStyle = r%2 ? spike : spikeL;
      for(let i=0;i<perRow;i++){
        const ang = Math.PI*0.55 + (i/(perRow-1))*Math.PI*1.0;
        const bx = Math.cos(ang)*R*(0.62+r*0.12);
        const by = Math.sin(ang)*R*(0.62+r*0.12) - R*0.05;
        const len = R*(0.34 - r*0.06);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx-Math.cos(ang)*len*0.4 - Math.sin(ang)*len, by-Math.sin(ang)*len*0.4 + Math.cos(ang)*len);
        ctx.lineTo(bx+Math.cos(ang)*len*0.4, by+Math.sin(ang)*len*0.4);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();

    // round face/body
    const grd = ctx.createLinearGradient(0,-R,0,R);
    grd.addColorStop(0,bodyL); grd.addColorStop(1,body);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(R*0.14, R*0.12, R*0.78, R*0.72, 0,0,TWO_PI); ctx.fill();

    // pointy snout
    ctx.fillStyle = bodyL;
    ctx.beginPath(); ctx.ellipse(R*0.78, R*0.2, R*0.3, R*0.22, 0,0,TWO_PI); ctx.fill();
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.arc(R*1.0, R*0.18, R*0.11, 0, TWO_PI); ctx.fill(); // nose

    // ears
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(R*0.2, -R*0.5, R*0.18, 0, TWO_PI); ctx.fill();

    // blush
    ctx.fillStyle='rgba(255,120,120,0.25)';
    ctx.beginPath(); ctx.arc(R*0.5, R*0.34, R*0.13, 0, TWO_PI); ctx.fill();

    // eyes — react to emotion
    drawEmotiveEyes(ctx, R*0.45, R*0.02, R*0.36, -R*0.02, R*0.18, R*0.16, e);

    // resting mouth (below the snout/nose), subtle mood
    drawMoodMouth(ctx, R*0.78, R*0.42, R*0.16, e, '#3a2a1a', 1.6);

    // team accent collar
    ctx.fillStyle = col; ctx.strokeStyle = h.darken(col,0.25); ctx.lineWidth=1;
    h.rr(ctx, -R*0.1, R*0.34, R*0.55, R*0.18, 3);

    if(a.hitFlash>0) h.hitFlash(ctx, R*1.1, a.hitFlash);
  }

  /* ------------------------------------------------------------------- BEAVER
   * Round brown body, big flat tail, two big front teeth (builder!). */
  function drawBeaver(ctx, u, a){
    const h = H(); const e = emotion(u);
    const R = CA.config.UNIT_R;
    const team = CA.getTeam(u.teamId) || {color:'#888'};
    const col = team.color || '#9c6b3a';
    const fur='#7a5230', furL='#9a6c44', furD='#5e3e23', tail='#4a3320';
    const walk = u.anim.state==='walk';
    const legSwing = walk ? Math.sin(u.anim.walkPhase)*3 : 0;

    // big flat scaly tail (behind, to the back)
    ctx.save();
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.ellipse(-R*0.85, R*0.45, R*0.5, R*0.28, -0.3, 0, TWO_PI); ctx.fill();
    ctx.strokeStyle = '#33240f'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(-R*1.2, R*0.35); ctx.lineTo(-R*0.5, R*0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-R*1.1, R*0.55); ctx.lineTo(-R*0.45, R*0.6); ctx.stroke();
    ctx.restore();

    // feet
    ctx.fillStyle = furD;
    h.rr(ctx, -R*0.4 - legSwing*0.3, R*0.55, 7, 7, 2);
    h.rr(ctx,  R*0.2 + legSwing*0.3, R*0.55, 7, 7, 2);

    // chunky body
    const grd = ctx.createLinearGradient(0,-R,0,R);
    grd.addColorStop(0,furL); grd.addColorStop(1,fur);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, R*0.16, R*0.92, R*0.8, 0,0,TWO_PI); ctx.fill();

    // belly patch
    ctx.fillStyle = 'rgba(220,190,150,0.45)';
    ctx.beginPath(); ctx.ellipse(R*0.05, R*0.34, R*0.45, R*0.45, 0,0,TWO_PI); ctx.fill();

    // head
    const hx=R*0.5, hy=-R*0.3;
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(hx, hy, R*0.6, R*0.55, 0,0,TWO_PI); ctx.fill();

    // round ears
    ctx.fillStyle = furD;
    ctx.beginPath(); ctx.arc(hx-R*0.18, hy-R*0.5, R*0.14,0,TWO_PI); ctx.fill();
    ctx.beginPath(); ctx.arc(hx+R*0.3, hy-R*0.46, R*0.14,0,TWO_PI); ctx.fill();

    // muzzle + nose
    ctx.fillStyle = furL;
    ctx.beginPath(); ctx.ellipse(hx+R*0.4, hy+R*0.16, R*0.26, R*0.22,0,0,TWO_PI); ctx.fill();
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.ellipse(hx+R*0.55, hy+R*0.05, R*0.1, R*0.08,0,0,TWO_PI); ctx.fill();

    // BIG buck teeth (beaver signature)
    ctx.fillStyle = '#fff';
    h.rr(ctx, hx+R*0.36, hy+R*0.26, R*0.12, R*0.22, 1);
    h.rr(ctx, hx+R*0.5,  hy+R*0.26, R*0.12, R*0.22, 1);
    ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(hx+R*0.49,hy+R*0.26); ctx.lineTo(hx+R*0.49,hy+R*0.46); ctx.stroke();

    // blush
    ctx.fillStyle='rgba(255,120,120,0.22)';
    ctx.beginPath(); ctx.arc(hx+R*0.05, hy+R*0.28, R*0.12,0,TWO_PI); ctx.fill();

    // eyes
    drawEmotiveEyes(ctx, hx+R*0.28, hy-R*0.04, hx-R*0.1, hy-R*0.02, R*0.17, R*0.15, e);

    // resting lip line above the buck teeth, subtle mood
    drawMoodMouth(ctx, hx+R*0.42, hy+R*0.22, R*0.16, e, '#3a2a1a', 1.4);

    // team hard-hat (builder accent!)
    ctx.fillStyle = col; ctx.strokeStyle=h.darken(col,0.3); ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(hx+R*0.05, hy-R*0.42, R*0.42, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillRect(hx-R*0.4, hy-R*0.46, R*0.9, R*0.08);

    if(a.hitFlash>0) h.hitFlash(ctx, R*1.15, a.hitFlash);
  }

  /* --------------------------------------------------------------------- FROG
   * Green, big bulgy eyes on top, wide smile, long legs (leaper!). */
  function drawFrog(ctx, u, a){
    const h = H(); const e = emotion(u);
    const R = CA.config.UNIT_R;
    const team = CA.getTeam(u.teamId) || {color:'#888'};
    const col = team.color || '#4caf50';
    const body='#5fb84e', bodyL='#82d56e', bodyD='#3f8c36', belly='#d8f0b0';
    const airborne = !u.grounded;
    const walk = u.anim.state==='walk';

    // LEGS — clearly readable cute frog legs (so it's not just a head/blob).
    // Drawn BEHIND the body. Two folded bent hind legs (thigh + shin + webbed
    // foot) and two little front feet. Splayed mid-leap, folded & gently
    // bobbing while walking, calmly folded at rest. A small walk wobble uses
    // u.anim.walkPhase like the other species.
    const sw = walk ? Math.sin(u.anim.walkPhase)*2.2 : 0;
    ctx.save();
    ctx.lineJoin='round'; ctx.lineCap='round';

    // helper: one bent hind leg. dir=+1 right / -1 left (already mirrored by
    // facing upstream). `kick` opens the knee out (used mid-leap).
    function hindLeg(dir, kick, bob){
      // thigh sits at the back-lower flank, shin folds down to a webbed foot
      const hipX = dir*R*0.5,  hipY = R*0.32 + bob;
      const kneeX = dir*(R*0.78 + kick*R*0.25), kneeY = R*0.36 + bob - kick*R*0.10;
      const ftX  = dir*(R*0.6 + kick*R*0.55),  ftY  = R*0.66 + bob + kick*R*0.04;
      // thigh (chunky), drawn as a rounded limb
      ctx.strokeStyle = bodyD; ctx.lineWidth = R*0.26;
      ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kneeX, kneeY); ctx.stroke();
      // shin
      ctx.lineWidth = R*0.18;
      ctx.beginPath(); ctx.moveTo(kneeX, kneeY); ctx.lineTo(ftX, ftY); ctx.stroke();
      // webbed foot (3 toes fanned out, forward)
      ctx.fillStyle = bodyL;
      ctx.beginPath();
      ctx.moveTo(ftX, ftY);
      ctx.lineTo(ftX + dir*R*0.30, ftY - R*0.10);
      ctx.lineTo(ftX + dir*R*0.34, ftY + R*0.06);
      ctx.lineTo(ftX + dir*R*0.26, ftY + R*0.18);
      ctx.lineTo(ftX, ftY + R*0.12);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = bodyD; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ftX+dir*R*0.10, ftY); ctx.lineTo(ftX+dir*R*0.30, ftY-R*0.02); ctx.stroke();
    }

    if(airborne){
      // mid-leap: both hind legs kicked out behind, front feet tucked forward
      hindLeg(-1, 1.0, 0);
      hindLeg( 1, 1.0, 0);
    } else {
      // grounded: folded hind legs with a tiny alternating walk bob
      hindLeg(-1, 0.15, sw*0.18);
      hindLeg( 1, 0.15, -sw*0.18);
    }

    // two little front feet peeking out under the chin (always visible)
    ctx.fillStyle = bodyL; ctx.strokeStyle = bodyD; ctx.lineWidth = 1;
    [[-R*0.26, sw*0.12], [R*0.26, -sw*0.12]].forEach(([fx, fb])=>{
      ctx.beginPath();
      ctx.ellipse(fx, R*0.74 + fb, R*0.14, R*0.09, 0, 0, TWO_PI);
      ctx.fill(); ctx.stroke();
      // tiny toe splits
      ctx.beginPath(); ctx.moveTo(fx-R*0.05, R*0.78+fb); ctx.lineTo(fx-R*0.05, R*0.84+fb);
      ctx.moveTo(fx+R*0.05, R*0.78+fb); ctx.lineTo(fx+R*0.05, R*0.84+fb); ctx.stroke();
    });
    ctx.lineCap='butt'; ctx.lineJoin='miter';
    ctx.restore();

    // body
    const grd = ctx.createLinearGradient(0,-R,0,R);
    grd.addColorStop(0,bodyL); grd.addColorStop(1,body);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, R*0.12, R*0.92, R*0.74, 0,0,TWO_PI); ctx.fill();

    // belly
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(0, R*0.34, R*0.5, R*0.4, 0,0,TWO_PI); ctx.fill();

    // spots
    ctx.fillStyle = bodyD;
    ctx.beginPath(); ctx.arc(-R*0.45,-R*0.1,R*0.13,0,TWO_PI); ctx.fill();
    ctx.beginPath(); ctx.arc( R*0.5,-R*0.05,R*0.1,0,TWO_PI); ctx.fill();

    // mouth — worried wobble when nervous, otherwise a subtle resting mood
    if(e.nervous){
      ctx.strokeStyle='#2e6e28'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(0, R*0.05, R*0.42, 0.35, Math.PI-0.35); ctx.stroke();
    } else {
      drawMoodMouth(ctx, 0, R*0.02, R*0.34, e, '#2e6e28', 2);
    }

    // big bulgy eyes ON TOP of the head (frog signature)
    const eyR = R*0.32;
    [-R*0.42, R*0.42].forEach((ex)=>{
      ctx.fillStyle = bodyL;
      ctx.beginPath(); ctx.arc(ex, -R*0.62, eyR, 0, TWO_PI); ctx.fill();
    });
    drawEmotiveEyes(ctx, R*0.42, -R*0.62, -R*0.42, -R*0.62, R*0.2, R*0.2, e, true);

    // team scarf
    ctx.fillStyle = col; ctx.strokeStyle=h.darken(col,0.25); ctx.lineWidth=1;
    h.rr(ctx, -R*0.5, R*0.18, R*1.0, R*0.16, 3);

    if(a.hitFlash>0) h.hitFlash(ctx, R*1.1, a.hitFlash);
  }

  /* --------------------------------------------------------------------- BIRD
   * Little round chick/raptor with a beak and flappy wings (glider!). */
  function drawBird(ctx, u, a){
    const h = H(); const e = emotion(u);
    const R = CA.config.UNIT_R;
    const team = CA.getTeam(u.teamId) || {color:'#888'};
    const col = team.color || '#d68a2e';
    const body='#e8c66a', bodyL='#f6e09a', wing='#c79a3a', wingD='#9a7528', beak='#f0922e';
    const airborne = !u.grounded;
    // flap phase: faster when gliding, gentle idle otherwise
    const flap = a.gliding ? Math.sin(u.anim.t*4)*0.6
               : airborne  ? Math.sin(u.anim.t*2.4)*0.45
               : Math.sin(u.anim.t*1.0)*0.12;

    // tail feathers
    ctx.save();
    ctx.fillStyle = wingD;
    ctx.beginPath(); ctx.moveTo(-R*0.7, R*0.1);
    ctx.lineTo(-R*1.25, -R*0.05); ctx.lineTo(-R*1.2, R*0.25);
    ctx.lineTo(-R*0.7, R*0.35); ctx.closePath(); ctx.fill();
    ctx.restore();

    // far wing (behind)
    ctx.save();
    ctx.fillStyle = wingD;
    ctx.translate(-R*0.1, -R*0.05); ctx.rotate(-flap*0.5);
    ctx.beginPath(); ctx.ellipse(-R*0.2, R*0.05, R*0.55, R*0.26, -0.3,0,TWO_PI); ctx.fill();
    ctx.restore();

    // little legs (tucked when airborne)
    ctx.strokeStyle = beak; ctx.lineWidth=2.2;
    if(!airborne){
      ctx.beginPath(); ctx.moveTo(-R*0.15,R*0.6); ctx.lineTo(-R*0.15,R*0.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( R*0.2, R*0.6); ctx.lineTo( R*0.2, R*0.85); ctx.stroke();
    }

    // round body
    const grd = ctx.createLinearGradient(0,-R,0,R);
    grd.addColorStop(0,bodyL); grd.addColorStop(1,body);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, R*0.1, R*0.78, R*0.74, 0,0,TWO_PI); ctx.fill();

    // belly
    ctx.fillStyle='rgba(255,250,230,0.6)';
    ctx.beginPath(); ctx.ellipse(R*0.05, R*0.3, R*0.42, R*0.42, 0,0,TWO_PI); ctx.fill();

    // head tuft
    ctx.strokeStyle = wing; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,-R*0.6); ctx.quadraticCurveTo(R*0.1,-R*1.0,R*0.25,-R*0.85); ctx.stroke();

    // beak
    ctx.fillStyle = beak;
    ctx.beginPath();
    ctx.moveTo(R*0.6, -R*0.05); ctx.lineTo(R*1.0, R*0.06); ctx.lineTo(R*0.6, R*0.18);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.18)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(R*0.6,R*0.06); ctx.lineTo(R*0.92,R*0.06); ctx.stroke();

    // eyes
    drawEmotiveEyes(ctx, R*0.42, -R*0.18, R*0.05, -R*0.16, R*0.16, R*0.15, e);

    // near wing (in front, flapping)
    ctx.save();
    ctx.fillStyle = wing;
    ctx.translate(R*0.05, R*0.0); ctx.rotate(flap*0.7);
    ctx.beginPath(); ctx.ellipse(-R*0.1, R*0.1, R*0.6, R*0.3, -0.2,0,TWO_PI); ctx.fill();
    ctx.fillStyle = wingD;
    ctx.beginPath(); ctx.ellipse(-R*0.35, R*0.18, R*0.2, R*0.12, -0.2,0,TWO_PI); ctx.fill();
    ctx.restore();

    // team neckerchief
    ctx.fillStyle = col; ctx.strokeStyle=h.darken(col,0.25); ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(R*0.1,R*0.18); ctx.lineTo(R*0.5,R*0.22); ctx.lineTo(R*0.25,R*0.46);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    if(a.hitFlash>0) h.hitFlash(ctx, R*1.05, a.hitFlash);
  }

  /* ---- shared emotive eyes: routes through entities' _drawEye but layers the
   *      emotion expressions (#28) on top. (xR/yR = right eye, xL/yL = left). */
  function drawEmotiveEyes(ctx, xR, yR, xL, yL, rR, rL, e, bulgy){
    const h = H();
    const blink = e.blink;
    // happy → closed upcurved "^_^"
    if(e.happy){
      ctx.strokeStyle='#2a2018'; ctx.lineWidth=2;
      [[xR,yR,rR],[xL,yL,rL]].forEach(([x,y,r])=>{
        ctx.beginPath(); ctx.moveTo(x-r,y+r*0.2); ctx.quadraticCurveTo(x,y-r*0.6,x+r,y+r*0.2); ctx.stroke();
      });
      return;
    }
    // surprised → big round whites with tiny pupils
    if(e.surprised){
      [[xR,yR,rR],[xL,yL,rL]].forEach(([x,y,r])=>{
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,r*1.15,0,TWO_PI); ctx.fill();
        ctx.fillStyle='#2a2018'; ctx.beginPath(); ctx.arc(x,y,r*0.4,0,TWO_PI); ctx.fill();
      });
      return;
    }
    // nervous → wide whites, pupils darting back (away from the shot)
    const aiming = e.aiming;
    [[xR,yR,rR],[xL,yL,rL]].forEach(([x,y,r])=>{
      if(blink){
        ctx.strokeStyle='#2a2018'; ctx.lineWidth=1.6;
        ctx.beginPath(); ctx.moveTo(x-r,y); ctx.quadraticCurveTo(x,y+r*0.5,x+r,y); ctx.stroke();
        return;
      }
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(x,y,e.nervous?r*1.1:r,0,TWO_PI); ctx.fill();
      let ph = aiming ? 0.30 : 0;
      if(e.nervous) ph = -0.3;                 // look back, scared
      const py = e.nervous ? -r*0.15 : r*0.05;
      ctx.fillStyle='#2a2018';
      ctx.beginPath(); ctx.arc(x+r*ph, y+py, r*0.5, 0, TWO_PI); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(x+r*ph-r*0.18, y-r*0.18, r*0.2, 0, TWO_PI); ctx.fill();
    });
    if(bulgy && e.nervous){
      // sweat drop for extra nerves
      ctx.fillStyle='rgba(140,200,255,0.85)';
      ctx.beginPath(); ctx.ellipse(xR+rR*1.2, yR+rR*0.5, rR*0.18, rR*0.3, 0,0,TWO_PI); ctx.fill();
    }
  }

  /* ----------------------------------------------------------------------- BAT
   * (v4 class-hero: Nekromanta). Dark fuzzy round body, big pointy ears, tiny
   * membrane wings, big eyes, little fangs. Used by the Necromancer class which
   * layers a floating soul-wisp + purple aura on top (see classes.js draw). */
  function drawBat(ctx, u, a){
    const h = H(); const e = emotion(u);
    const R = CA.config.UNIT_R;
    const team = CA.getTeam(u.teamId) || {color:'#888'};
    const col = team.color || '#7a4fb0';
    const fur='#3a2f4a', furL='#574668', furD='#241d30', wing='#4a3a5e', wingD='#2c2238';
    const airborne = !u.grounded;
    const flap = airborne ? Math.sin(u.anim.t*5)*0.7 : Math.sin(u.anim.t*1.4)*0.18;

    // wings (drawn behind body, membrane with two finger-struts each side)
    function wingSide(dir){
      ctx.save();
      ctx.translate(dir*R*0.45, -R*0.05);
      ctx.rotate(dir*(-0.2 - flap*0.8));
      ctx.fillStyle = wing; ctx.strokeStyle = wingD; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -R*0.1);
      ctx.quadraticCurveTo(dir*R*0.9, -R*0.5, dir*R*1.25, R*0.05);
      ctx.quadraticCurveTo(dir*R*0.95, R*0.05, dir*R*0.9, R*0.4);
      ctx.quadraticCurveTo(dir*R*0.65, R*0.18, dir*R*0.5, R*0.45);
      ctx.quadraticCurveTo(dir*R*0.3, R*0.2, dir*R*0.1, R*0.4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // finger struts
      ctx.beginPath(); ctx.moveTo(0,-R*0.05); ctx.lineTo(dir*R*0.9, R*0.05);
      ctx.moveTo(0,-R*0.05); ctx.lineTo(dir*R*0.65, R*0.18); ctx.stroke();
      ctx.restore();
    }
    wingSide(-1); wingSide(1);

    // little feet (tucked when airborne)
    if(!airborne){
      ctx.fillStyle = furD;
      h.rr(ctx, -R*0.3, R*0.6, 6, 6, 2);
      h.rr(ctx,  R*0.12, R*0.6, 6, 6, 2);
    }

    // round fuzzy body
    const grd = ctx.createLinearGradient(0,-R,0,R);
    grd.addColorStop(0,furL); grd.addColorStop(1,fur);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, R*0.12, R*0.74, R*0.7, 0,0,TWO_PI); ctx.fill();

    // belly fluff
    ctx.fillStyle = 'rgba(120,100,150,0.4)';
    ctx.beginPath(); ctx.ellipse(0, R*0.3, R*0.4, R*0.38, 0,0,TWO_PI); ctx.fill();

    // big pointy ears
    ctx.fillStyle = fur; ctx.strokeStyle = furD; ctx.lineWidth = 1;
    [[-R*0.4,-1],[R*0.4,1]].forEach(([ex,dir])=>{
      ctx.beginPath();
      ctx.moveTo(ex, -R*0.45);
      ctx.lineTo(ex+dir*R*0.18, -R*1.15);
      ctx.lineTo(ex+dir*R*0.38, -R*0.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(180,140,210,0.45)';
      ctx.beginPath();
      ctx.moveTo(ex+dir*R*0.06, -R*0.55);
      ctx.lineTo(ex+dir*R*0.18, -R*1.0);
      ctx.lineTo(ex+dir*R*0.28, -R*0.55);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = fur;
    });

    // blush
    ctx.fillStyle='rgba(255,130,170,0.22)';
    ctx.beginPath(); ctx.arc(-R*0.42, R*0.16, R*0.12, 0, TWO_PI); ctx.fill();
    ctx.beginPath(); ctx.arc( R*0.42, R*0.16, R*0.12, 0, TWO_PI); ctx.fill();

    // big eyes
    drawEmotiveEyes(ctx, R*0.32, -R*0.18, -R*0.32, -R*0.18, R*0.2, R*0.2, e);

    // resting mouth (subtle mood) above the spooky little fangs
    drawMoodMouth(ctx, 0, R*0.16, R*0.13, e, '#241d30', 1.3);

    // tiny fangs
    if(!e.happy){
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.moveTo(-R*0.1, R*0.18); ctx.lineTo(-R*0.04, R*0.34); ctx.lineTo(-R*0.16, R*0.2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo( R*0.1, R*0.18); ctx.lineTo( R*0.04, R*0.34); ctx.lineTo( R*0.16, R*0.2); ctx.closePath(); ctx.fill();
    }

    // team accent collar
    ctx.fillStyle = col; ctx.strokeStyle = h.darken(col,0.25); ctx.lineWidth=1;
    h.rr(ctx, -R*0.4, R*0.42, R*0.8, R*0.14, 3);

    if(a.hitFlash>0) h.hitFlash(ctx, R*1.2, a.hitFlash);
  }

  /* ----------------------------------------------------------------------- OWL
   * (v4 class-hero: Mágus). Round feathery body, huge eyes, little beak, ear
   * tufts. The Mage class adds a tiny wizard hat + sparkle on top (classes.js). */
  function drawOwl(ctx, u, a){
    const h = H(); const e = emotion(u);
    const R = CA.config.UNIT_R;
    const team = CA.getTeam(u.teamId) || {color:'#888'};
    const col = team.color || '#5a7fd0';
    const body='#8a6e4e', bodyL='#a98a64', bodyD='#5e4a32', beak='#f0a82e', face='#d8c6a8';
    const airborne = !u.grounded;
    const flap = airborne ? Math.sin(u.anim.t*4)*0.55 : Math.sin(u.anim.t*1.1)*0.1;

    // tail feathers
    ctx.fillStyle = bodyD;
    ctx.beginPath(); ctx.moveTo(-R*0.2, R*0.6);
    ctx.lineTo(-R*0.35, R*0.95); ctx.lineTo(0, R*0.85);
    ctx.lineTo(R*0.35, R*0.95); ctx.lineTo(R*0.2, R*0.6); ctx.closePath(); ctx.fill();

    // far wing
    ctx.save();
    ctx.translate(-R*0.55, R*0.0); ctx.rotate(-flap*0.5);
    ctx.fillStyle = bodyD;
    ctx.beginPath(); ctx.ellipse(0, R*0.1, R*0.3, R*0.55, 0.1,0,TWO_PI); ctx.fill();
    ctx.restore();

    // little feet
    if(!airborne){
      ctx.strokeStyle = beak; ctx.lineWidth=2.2;
      ctx.beginPath(); ctx.moveTo(-R*0.18,R*0.65); ctx.lineTo(-R*0.18,R*0.86); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( R*0.18,R*0.65); ctx.lineTo( R*0.18,R*0.86); ctx.stroke();
    }

    // round feathery body
    const grd = ctx.createLinearGradient(0,-R,0,R);
    grd.addColorStop(0,bodyL); grd.addColorStop(1,body);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, R*0.1, R*0.8, R*0.82, 0,0,TWO_PI); ctx.fill();

    // belly feather rows
    ctx.strokeStyle='rgba(255,250,235,0.35)'; ctx.lineWidth=1.4;
    for(let i=0;i<3;i++){
      ctx.beginPath(); ctx.arc(0, R*0.2 + i*R*0.18, R*0.4 - i*R*0.05, 0.3, Math.PI-0.3); ctx.stroke();
    }

    // ear tufts
    ctx.fillStyle = bodyD;
    [[-R*0.42,-1],[R*0.42,1]].forEach(([ex,dir])=>{
      ctx.beginPath();
      ctx.moveTo(ex, -R*0.5);
      ctx.lineTo(ex+dir*R*0.18, -R*0.95);
      ctx.lineTo(ex+dir*R*0.3, -R*0.5);
      ctx.closePath(); ctx.fill();
    });

    // big facial disc (two overlapping circles)
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.arc(-R*0.3, -R*0.18, R*0.4, 0, TWO_PI); ctx.fill();
    ctx.beginPath(); ctx.arc( R*0.3, -R*0.18, R*0.4, 0, TWO_PI); ctx.fill();

    // beak
    ctx.fillStyle = beak;
    ctx.beginPath();
    ctx.moveTo(0, -R*0.05); ctx.lineTo(-R*0.12, R*0.12); ctx.lineTo(R*0.12, R*0.12);
    ctx.closePath(); ctx.fill();

    // huge owl eyes (extra-large whites)
    [[-R*0.3,-R*0.18],[R*0.3,-R*0.18]].forEach(([ex,ey])=>{
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, R*0.34, 0, TWO_PI); ctx.fill();
      ctx.strokeStyle = bodyD; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(ex, ey, R*0.34, 0, TWO_PI); ctx.stroke();
    });
    drawEmotiveEyes(ctx, R*0.3, -R*0.18, -R*0.3, -R*0.18, R*0.2, R*0.2, e);

    // resting mouth just below the beak, subtle mood
    drawMoodMouth(ctx, 0, R*0.26, R*0.15, e, '#5e4a32', 1.4);

    // team accent collar
    ctx.fillStyle = col; ctx.strokeStyle = h.darken(col,0.25); ctx.lineWidth=1;
    h.rr(ctx, -R*0.42, R*0.42, R*0.84, R*0.14, 3);

    if(a.hitFlash>0) h.hitFlash(ctx, R*1.2, a.hitFlash);
  }

  /* ---------------------------------------------------------------------- FOX
   * Sleek orange body, white chest/cheeks, big triangular ears with dark tips,
   * a long bushy white-tipped tail that sways with a gentle idle motion. */
  function drawFox(ctx, u, a){
    const h = H(); const e = emotion(u);
    const R = CA.config.UNIT_R;
    const team = CA.getTeam(u.teamId) || {color:'#888'};
    const col = team.color || '#e07a2e';
    const fur='#e0772c', furL='#f2954a', furD='#b8591a', cream='#f6ead5', dark='#3a2516';
    const walk = u.anim.state==='walk';
    const legSwing = walk ? Math.sin(u.anim.walkPhase)*3 : 0;
    // bushy tail sways gently at idle, swishes faster when walking
    const tailSway = Math.sin(u.anim.t*(walk?2.4:1.0) + (u.id||0))*0.22;

    // big bushy tail (behind, sweeping up the back)
    ctx.save();
    ctx.translate(-R*0.7, R*0.2);
    ctx.rotate(-0.5 + tailSway);
    const tg = ctx.createLinearGradient(0,0,-R*1.1,0);
    tg.addColorStop(0,fur); tg.addColorStop(1,furL);
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.ellipse(-R*0.55, 0, R*0.7, R*0.34, 0,0,TWO_PI); ctx.fill();
    ctx.fillStyle = cream;  // white tail tip
    ctx.beginPath(); ctx.ellipse(-R*1.1, 0, R*0.22, R*0.2, 0,0,TWO_PI); ctx.fill();
    ctx.restore();

    // little legs
    ctx.fillStyle = furD;
    h.rr(ctx, -R*0.4 - legSwing*0.3, R*0.55, 6, 8, 2);
    h.rr(ctx,  R*0.2 + legSwing*0.3, R*0.55, 6, 8, 2);

    // body
    const grd = ctx.createLinearGradient(0,-R,0,R);
    grd.addColorStop(0,furL); grd.addColorStop(1,fur);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, R*0.16, R*0.82, R*0.72, 0,0,TWO_PI); ctx.fill();

    // cream chest
    ctx.fillStyle = cream;
    ctx.beginPath(); ctx.ellipse(R*0.05, R*0.34, R*0.4, R*0.42, 0,0,TWO_PI); ctx.fill();

    // big triangular ears (dark tips)
    [[-R*0.42,-1],[R*0.42,1]].forEach(([ex,dir])=>{
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.moveTo(ex - dir*R*0.1, -R*0.45);
      ctx.lineTo(ex + dir*R*0.12, -R*1.05);
      ctx.lineTo(ex + dir*R*0.4, -R*0.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = dark;  // dark tip
      ctx.beginPath();
      ctx.moveTo(ex + dir*R*0.06, -R*0.78);
      ctx.lineTo(ex + dir*R*0.12, -R*1.05);
      ctx.lineTo(ex + dir*R*0.24, -R*0.74);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,200,180,0.5)';  // inner ear
      ctx.beginPath();
      ctx.moveTo(ex + dir*R*0.02, -R*0.52);
      ctx.lineTo(ex + dir*R*0.12, -R*0.9);
      ctx.lineTo(ex + dir*R*0.26, -R*0.55);
      ctx.closePath(); ctx.fill();
    });

    // pointed snout + cream muzzle
    ctx.fillStyle = cream;
    ctx.beginPath(); ctx.ellipse(R*0.6, R*0.16, R*0.34, R*0.24, 0,0,TWO_PI); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(R*0.9, R*0.1, R*0.1, 0, TWO_PI); ctx.fill(); // nose

    // blush
    ctx.fillStyle='rgba(255,120,120,0.22)';
    ctx.beginPath(); ctx.arc(R*0.4, R*0.28, R*0.12, 0, TWO_PI); ctx.fill();

    // eyes
    drawEmotiveEyes(ctx, R*0.42, -R*0.1, -R*0.02, -R*0.1, R*0.16, R*0.15, e);

    // resting mouth near the snout
    drawMoodMouth(ctx, R*0.62, R*0.34, R*0.15, e, dark, 1.5);

    // team accent collar
    ctx.fillStyle = col; ctx.strokeStyle = h.darken(col,0.25); ctx.lineWidth=1;
    h.rr(ctx, -R*0.45, R*0.42, R*0.9, R*0.16, 3);

    if(a.hitFlash>0) h.hitFlash(ctx, R*1.15, a.hitFlash);
  }

  /* ---------------------------------------------------------------------- CAT
   * Round fluffy body, pointy ears, big eyes, tiny triangle nose, whiskers and
   * a curling tail that flicks gently at idle (the universal cute favourite). */
  function drawCat(ctx, u, a){
    const h = H(); const e = emotion(u);
    const R = CA.config.UNIT_R;
    const team = CA.getTeam(u.teamId) || {color:'#888'};
    const col = team.color || '#8a8f99';
    const fur='#8a8f99', furL='#aab0ba', furD='#6a6f79', belly='#e6e9ee', pink='#e79aa8', dark='#2a2620';
    const walk = u.anim.state==='walk';
    const legSwing = walk ? Math.sin(u.anim.walkPhase)*3 : 0;
    // curling tail flicks gently
    const tailFlick = Math.sin(u.anim.t*(walk?2.6:1.2) + (u.id||0))*0.3;

    // curling tail (behind, arcing up)
    ctx.save();
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.strokeStyle = furD; ctx.lineWidth = R*0.24;
    ctx.beginPath();
    ctx.moveTo(-R*0.55, R*0.4);
    ctx.quadraticCurveTo(-R*1.1, R*0.2 + tailFlick*R*0.3, -R*0.95, -R*0.35 + tailFlick*R*0.4);
    ctx.stroke();
    ctx.fillStyle = furL;  // light tail tip
    ctx.beginPath(); ctx.arc(-R*0.95, -R*0.35 + tailFlick*R*0.4, R*0.14, 0, TWO_PI); ctx.fill();
    ctx.lineCap='butt'; ctx.lineJoin='miter';
    ctx.restore();

    // little legs/paws
    ctx.fillStyle = furD;
    h.rr(ctx, -R*0.4 - legSwing*0.3, R*0.58, 7, 7, 3);
    h.rr(ctx,  R*0.18 + legSwing*0.3, R*0.58, 7, 7, 3);

    // round body
    const grd = ctx.createLinearGradient(0,-R,0,R);
    grd.addColorStop(0,furL); grd.addColorStop(1,fur);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, R*0.14, R*0.82, R*0.76, 0,0,TWO_PI); ctx.fill();

    // light belly patch
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(R*0.02, R*0.34, R*0.42, R*0.42, 0,0,TWO_PI); ctx.fill();

    // pointy ears with pink inner
    [[-R*0.42,-1],[R*0.42,1]].forEach(([ex,dir])=>{
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.moveTo(ex - dir*R*0.08, -R*0.5);
      ctx.lineTo(ex + dir*R*0.16, -R*1.02);
      ctx.lineTo(ex + dir*R*0.42, -R*0.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = pink;
      ctx.beginPath();
      ctx.moveTo(ex + dir*R*0.04, -R*0.54);
      ctx.lineTo(ex + dir*R*0.16, -R*0.9);
      ctx.lineTo(ex + dir*R*0.28, -R*0.54);
      ctx.closePath(); ctx.fill();
    });

    // blush
    ctx.fillStyle='rgba(255,120,140,0.22)';
    ctx.beginPath(); ctx.arc(-R*0.42, R*0.16, R*0.12, 0, TWO_PI); ctx.fill();
    ctx.beginPath(); ctx.arc( R*0.42, R*0.16, R*0.12, 0, TWO_PI); ctx.fill();

    // tiny triangle nose
    ctx.fillStyle = pink;
    ctx.beginPath();
    ctx.moveTo(0, R*0.06); ctx.lineTo(-R*0.08, -R*0.02); ctx.lineTo(R*0.08, -R*0.02);
    ctx.closePath(); ctx.fill();

    // whiskers
    ctx.strokeStyle='rgba(60,55,50,0.45)'; ctx.lineWidth=1;
    [-1,1].forEach(side=>{
      ctx.beginPath();
      ctx.moveTo(side*R*0.18, R*0.08); ctx.lineTo(side*R*0.7, R*0.0);
      ctx.moveTo(side*R*0.18, R*0.14); ctx.lineTo(side*R*0.7, R*0.16);
      ctx.stroke();
    });

    // eyes
    drawEmotiveEyes(ctx, R*0.34, -R*0.16, -R*0.34, -R*0.16, R*0.18, R*0.18, e);

    // resting mouth below the nose
    drawMoodMouth(ctx, 0, R*0.2, R*0.14, e, dark, 1.4);

    // team accent collar (with little bell)
    ctx.fillStyle = col; ctx.strokeStyle = h.darken(col,0.25); ctx.lineWidth=1;
    h.rr(ctx, -R*0.45, R*0.42, R*0.9, R*0.15, 3);
    ctx.fillStyle = '#f0c64a';
    ctx.beginPath(); ctx.arc(0, R*0.52, R*0.1, 0, TWO_PI); ctx.fill();

    if(a.hitFlash>0) h.hitFlash(ctx, R*1.12, a.hitFlash);
  }

  /* -------------------------------------------------------------------- PENGUIN
   * Round black body, white belly, orange beak + feet, little flipper wings that
   * gently waggle at idle (faster when airborne / sliding). Adorable waddler. */
  function drawPenguin(ctx, u, a){
    const h = H(); const e = emotion(u);
    const R = CA.config.UNIT_R;
    const team = CA.getTeam(u.teamId) || {color:'#888'};
    const col = team.color || '#3a4655';
    const body='#3a4150', bodyL='#566073', bodyD='#272c38', belly='#f2f4f8', beak='#f0922e', feet='#e88526';
    const airborne = !u.grounded;
    const walk = u.anim.state==='walk';
    // flipper waggle: gentle idle, faster when airborne/sliding
    const flap = a.gliding ? Math.sin(u.anim.t*4)*0.6
               : airborne  ? Math.sin(u.anim.t*2.6)*0.45
               : Math.sin(u.anim.t*1.1 + (u.id||0))*0.16;

    // little orange feet
    ctx.fillStyle = feet;
    const fw = walk ? Math.sin(u.anim.walkPhase)*2 : 0;
    [[-R*0.3, fw],[R*0.3, -fw]].forEach(([fx,fb])=>{
      ctx.beginPath();
      ctx.ellipse(fx + fb*0.3, R*0.72, R*0.2, R*0.1, 0, 0, TWO_PI);
      ctx.fill();
    });

    // far flipper (behind)
    ctx.save();
    ctx.translate(-R*0.6, R*0.0); ctx.rotate(-0.3 - flap*0.7);
    ctx.fillStyle = bodyD;
    ctx.beginPath(); ctx.ellipse(0, R*0.15, R*0.2, R*0.46, 0,0,TWO_PI); ctx.fill();
    ctx.restore();

    // round body
    const grd = ctx.createLinearGradient(0,-R,0,R);
    grd.addColorStop(0,bodyL); grd.addColorStop(1,body);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, R*0.1, R*0.74, R*0.84, 0,0,TWO_PI); ctx.fill();

    // big white belly
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(0, R*0.22, R*0.5, R*0.62, 0,0,TWO_PI); ctx.fill();

    // white face patch
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(0, -R*0.22, R*0.46, R*0.4, 0,0,TWO_PI); ctx.fill();

    // beak
    ctx.fillStyle = beak;
    ctx.beginPath();
    ctx.moveTo(R*0.06, -R*0.18); ctx.lineTo(R*0.5, -R*0.06); ctx.lineTo(R*0.06, R*0.02);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.18)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(R*0.06,-R*0.08); ctx.lineTo(R*0.42,-R*0.06); ctx.stroke();

    // blush
    ctx.fillStyle='rgba(255,140,150,0.22)';
    ctx.beginPath(); ctx.arc(-R*0.34, -R*0.12, R*0.12, 0, TWO_PI); ctx.fill();
    ctx.beginPath(); ctx.arc( R*0.34, -R*0.12, R*0.12, 0, TWO_PI); ctx.fill();

    // eyes
    drawEmotiveEyes(ctx, R*0.26, -R*0.28, -R*0.26, -R*0.28, R*0.16, R*0.16, e);

    // near flipper (in front, waggling)
    ctx.save();
    ctx.translate(R*0.58, R*0.0); ctx.rotate(0.3 + flap*0.8);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, R*0.15, R*0.2, R*0.46, 0,0,TWO_PI); ctx.fill();
    ctx.restore();

    // team accent bowtie (penguins love formalwear)
    ctx.fillStyle = col; ctx.strokeStyle = h.darken(col,0.25); ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(0, R*0.06); ctx.lineTo(-R*0.22, -R*0.04); ctx.lineTo(-R*0.22, R*0.16); ctx.closePath();
    ctx.moveTo(0, R*0.06); ctx.lineTo(R*0.22, -R*0.04); ctx.lineTo(R*0.22, R*0.16); ctx.closePath();
    ctx.fill(); ctx.stroke();

    if(a.hitFlash>0) h.hitFlash(ctx, R*1.2, a.hitFlash);
  }

  // ---- REGISTRY -----------------------------------------------------------
  CA.Species.capybara = { id:'capybara', name:'Capybara', emoji:'🐹',
    colors:{ body:'#8a6a45', accent:'#a07f55' },
    passive:'swim', passiveDesc:'Úszik — lassabban fullad és kissé lebeg a vízen.',
    ultimate:'capybomb', draw:null /* entities draws natively */ };

  CA.Species.worm = { id:'worm', name:'Worm', emoji:'🪱',
    colors:{ body:'#e59ac0', accent:'#cf7ea7' },
    passive:'dig', passiveDesc:'Beás a terepbe — rövid alagutat fúr lefelé.',
    ultimate:'drill', draw:null /* entities draws natively */ };

  CA.Species.hedgehog = { id:'hedgehog', name:'Sün', emoji:'🦔',
    colors:{ body:'#a98158', accent:'#6b5236' },
    passive:'roll', passiveDesc:'Gurul — gyors mozgásnál tüskés gömbként sebzi az ellenfelet.',
    ultimate:'spikeball', draw:drawHedgehog };

  CA.Species.beaver = { id:'beaver', name:'Hód', emoji:'🦫',
    colors:{ body:'#7a5230', accent:'#4a3320' },
    passive:'build', passiveDesc:'Épít — egy kis fal-gátat rak le maga elé.',
    ultimate:'logtoss', draw:drawBeaver };

  CA.Species.frog = { id:'frog', name:'Béka', emoji:'🐸',
    colors:{ body:'#5fb84e', accent:'#3f8c36' },
    passive:'leap', passiveDesc:'Ugrik — sokkal magasabbra és messzebbre szökell.',
    ultimate:'bellyflop', draw:drawFrog };

  CA.Species.bird = { id:'bird', name:'Madár', emoji:'🦅',
    colors:{ body:'#e8c66a', accent:'#c79a3a' },
    passive:'glide', passiveDesc:'Siklik — ugrás után rövid ideig lebegve csökken az esése.',
    ultimate:'eggbomb', draw:drawBird };

  /* --------------------------------------------------------------------- KOALA
   * Round grey body, big fuzzy round ears, large dark oval nose, small dark
   * eyes, light belly. Drawn fully with canvas primitives like the others. */
  function drawKoala(ctx, u, a){
    const h = H(); const e = emotion(u);
    const R = CA.config.UNIT_R;
    const team = CA.getTeam(u.teamId) || {color:'#888'};
    const col = team.color || '#7d8893';
    const fur='#9aa6b1', furL='#bcc6cf', furD='#727d88', belly='#e2e8ee', nose='#3a3f45';
    const walk = u.anim.state==='walk';
    const legSwing = walk ? Math.sin(u.anim.walkPhase)*3 : 0;

    // little feet
    ctx.fillStyle = furD;
    h.rr(ctx, -R*0.42 - legSwing*0.3, R*0.6, 7, 7, 2);
    h.rr(ctx,  R*0.18 + legSwing*0.3, R*0.6, 7, 7, 2);

    // big fuzzy round ears (drawn behind the head)
    const ears=[[-R*0.62,-R*0.55],[R*0.62,-R*0.55]];
    ears.forEach(([ex,ey])=>{
      ctx.fillStyle = fur;
      ctx.beginPath(); ctx.arc(ex, ey, R*0.46, 0, TWO_PI); ctx.fill();
      // fuzzy inner ear
      ctx.fillStyle = furL;
      ctx.beginPath(); ctx.arc(ex, ey, R*0.26, 0, TWO_PI); ctx.fill();
      ctx.fillStyle = 'rgba(255,170,180,0.30)';
      ctx.beginPath(); ctx.arc(ex, ey+R*0.04, R*0.15, 0, TWO_PI); ctx.fill();
    });

    // round body
    const grd = ctx.createLinearGradient(0,-R,0,R);
    grd.addColorStop(0,furL); grd.addColorStop(1,fur);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, R*0.14, R*0.84, R*0.78, 0,0,TWO_PI); ctx.fill();

    // light belly patch
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(R*0.02, R*0.36, R*0.44, R*0.42, 0,0,TWO_PI); ctx.fill();

    // cheek fluff (round face contour)
    ctx.fillStyle = furL;
    ctx.beginPath(); ctx.arc(-R*0.46, R*0.04, R*0.26, 0, TWO_PI); ctx.fill();
    ctx.beginPath(); ctx.arc( R*0.46, R*0.04, R*0.26, 0, TWO_PI); ctx.fill();

    // large dark oval nose (koala signature)
    ctx.fillStyle = nose;
    ctx.beginPath(); ctx.ellipse(0, R*0.16, R*0.3, R*0.36, 0,0,TWO_PI); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(-R*0.1, R*0.04, R*0.1, R*0.13, 0,0,TWO_PI); ctx.fill();

    // blush
    ctx.fillStyle='rgba(255,150,170,0.22)';
    ctx.beginPath(); ctx.arc(-R*0.5, R*0.18, R*0.13, 0, TWO_PI); ctx.fill();
    ctx.beginPath(); ctx.arc( R*0.5, R*0.18, R*0.13, 0, TWO_PI); ctx.fill();

    // small dark eyes — react to emotion
    drawEmotiveEyes(ctx, R*0.4, -R*0.2, -R*0.4, -R*0.2, R*0.15, R*0.15, e);

    // resting mouth below the big nose, subtle mood
    drawMoodMouth(ctx, 0, R*0.44, R*0.18, e, '#3a3f45', 1.6);

    // team accent scarf
    ctx.fillStyle = col; ctx.strokeStyle = h.darken(col,0.25); ctx.lineWidth=1;
    h.rr(ctx, -R*0.5, R*0.44, R*1.0, R*0.16, 3);

    if(a.hitFlash>0) h.hitFlash(ctx, R*1.15, a.hitFlash);
  }
  // ---- Koala (drawn procedurally on the canvas, like the other species) ----
  CA.Species.koala = { id:'koala', name:'Koala', emoji:'🐨',
    colors:{ body:'#a9b3bd', accent:'#7d8893' },
    passive:'glide', passiveDesc:'Rönk-rakétás — ugrás után siklik, lassabban esik.',
    ultimate:'logtoss', draw:drawKoala };

  /* ---- Bat (v4 Nekromanta hero) — procedural, like the others ---- */
  CA.Species.bat = { id:'bat', name:'Denevér', emoji:'🦇',
    colors:{ body:'#3a2f4a', accent:'#574668' },
    passive:'glide', passiveDesc:'Szárnyas — ugrás után lebegve, lassabban esik.',
    ultimate:'bone_spear', draw:drawBat };

  /* ---- Owl (v4 Mágus hero) — procedural, like the others ---- */
  CA.Species.owl = { id:'owl', name:'Bagoly', emoji:'🦉',
    colors:{ body:'#8a6e4e', accent:'#5e4a32' },
    passive:'glide', passiveDesc:'Szárnyas — ugrás után lebegve, lassabban esik.',
    ultimate:'fireball', draw:drawOwl };

  /* ---- Fox (Róka) — nimble glider, procedural like the others ---- */
  CA.Species.fox = { id:'fox', name:'Róka', emoji:'🦊',
    colors:{ body:'#e0772c', accent:'#b8591a' },
    passive:'glide', passiveDesc:'Fürge — ugrás után rövid ideig siklik, lágyabban ér földet.',
    ultimate:'logtoss', draw:drawFox };

  /* ---- Cat (Macska) — agile leaper, procedural like the others ---- */
  CA.Species.cat = { id:'cat', name:'Macska', emoji:'🐱',
    colors:{ body:'#8a8f99', accent:'#6a6f79' },
    passive:'leap', passiveDesc:'Macskaügyes — sokkal messzebbre és magasabbra szökell.',
    ultimate:'bellyflop', draw:drawCat };

  /* ---- Penguin (Pingvin) — belly-slide glider, procedural like the others ---- */
  CA.Species.penguin = { id:'penguin', name:'Pingvin', emoji:'🐧',
    colors:{ body:'#3a4150', accent:'#272c38' },
    passive:'glide', passiveDesc:'Csúszdázik — ugrás után a hasán siklik, lassabban esik.',
    ultimate:'eggbomb', draw:drawPenguin };

  CA.Species.list = function(){
    return ['capybara','worm','hedgehog','beaver','frog','bird','koala','bat','owl',
            'fox','cat','penguin'];
  };

  CA.Species.init = function(){};
})();
