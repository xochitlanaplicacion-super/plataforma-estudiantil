/* ============================================================================
 * CUTE ANIMALS — ai.js   ::  AGENT D (part 2) — Computer opponent
 * ----------------------------------------------------------------------------
 * GOAL: a believable Worms-style AI. On its turn it picks a target, chooses a
 * weapon, computes aim angle + power for a ballistic hit (accounting for wind),
 * optionally repositions, then fires. Three difficulty levels via team.aiLevel
 * (0 easy / 1 normal / 2 hard): higher = better aim, less random error,
 * smarter weapon choice.
 *
 * IMPLEMENT on CA.AI (EXACT):
 *   init(ctx)
 *   takeTurn(unit, team)       -> called by core at turn start for AI teams.
 *   update(dt)                 -> drive the multi-frame plan; robust to deaths.
 *
 * #21 smarter target selection (low-hp & clustered, weighted by aiLevel)
 * #22 weapon choice by situation + AI personalities + reposition on hard
 * #23 wind compensation via a weapons.js-matched trajectory sim + shrinking aim error
 * ==========================================================================*/
(function(){
  const S=CA.state, U=CA.util, C=CA.config;
  let plan=null;

  /* ----- local trajectory simulation (mirrors weapons.js integration) -----
   * Returns the landing point AND the closest approach to an optional target
   * (tx,ty). The closest-approach matters for fast/flat shots (bazooka into a
   * cliff face, hitscan-ish lobs) where the projectile flies THROUGH the target
   * band before its terminal landing point — ranking by landing alone would miss
   * a shot that actually grazes the foe mid-flight. We run our OWN integrator so
   * we can sample the whole path; it mirrors weapons.js simulate() exactly
   * (muzzle = u.x+facing*16, y-8; speed = 6+power*16; wind = MAX_WIND*S.wind on
   * affectedByWind weapons; gravity = GRAVITY) so the predicted arc matches the
   * real projectile and shots actually connect. */
  // per-weapon launch speed scale (mirror weapons.js launchVel(...,scale)) so the
  // predicted arc matches the real throw for these specials (else they mis-aim).
  // bellyflop: launchVel(...,0.7) majd vx*0.6/vy*1.25 → átlagosan ~0.55 effektív
  // skála (QA P2: az AI béka-ultija e nélkül mindig messze túllőtt). logtoss 0.95,
  // magnetmine 0.85 a weapons.js fireCharged skálái szerint.
  var WEAPON_SPEED_SCALE={charged_shot:1.3, bone_spear:1.15, multishot:1.1, capybomb:0.92,
                          bellyflop:0.55, logtoss:0.95, magnetmine:0.85};
  // per-weapon gravity scale (mirror weapons.js per-projectile integration) so the
  // predicted DROP matches reality — these specials fall slower than full GRAVITY,
  // so without this the AI overshoots (necro bone_spear, worm-ult drill, magicorb).
  // Values cross-checked vs weapons.js: drill 0.3 (~L2299), bone_spear 0.35 (~L2336),
  // magicorb 0.12 (~L2236).
  var WEAPON_GRAV_SCALE={bone_spear:0.35, drill:0.3, magicorb:0.12};
  function simulate(unit, weapon, aimAngle, power, tx, ty){
    const sp=(6+U.clamp(power,0,1)*16) * (WEAPON_SPEED_SCALE[weapon.id]||1);
    const a=-aimAngle;
    const dir=unit.facing;
    let x=unit.x+dir*16, y=unit.y-8;
    let vx=Math.cos(a)*sp*dir, vy=Math.sin(a)*sp;
    const wind = weapon.affectedByWind ? C.MAX_WIND*S.wind : 0;
    const water = (S.waterLevel!=null) ? S.waterLevel : C.WATER_LEVEL;
    const fuse = weapon.fuse;
    const haveT = (tx!=null && ty!=null);
    let minD = Infinity, t=0;
    const touch = haveT ? ((weapon.radius||0)*0.6 + C.UNIT_R) : 0;
    for(let i=0;i<400;i++){
      vy+=C.GRAVITY*(WEAPON_GRAV_SCALE[weapon.id]||1); vx+=wind;
      x+=vx; y+=vy; t+=1/60;
      if(haveT){ const d=U.dist(x,y,tx,ty); if(d<minD) minD=d;
        // a fuse-less projectile that already swept right through the target band
        // would detonate ~here on contact; treat that as the landing point so the
        // solver scores a graze as a real hit, not as wherever it eventually falls.
        if(fuse==null && (weapon.bounce||0)<=0 && d<=touch) return {x,y,hit:true,minD};
      }
      if(fuse!=null && t>=fuse) return {x,y,hit:true,minD};
      if(x<0||x>C.WORLD_W||y>C.WORLD_H) return {x,y,hit:false,minD};
      if(y>=water) return {x,y,hit:false,minD};
      if(CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(x,y)){
        if((weapon.bounce||0)>0 && fuse!=null){ y-=vy; vy*=-(weapon.bounce); vx*=0.6; }
        else return {x,y,hit:true,minD};
      }
    }
    return {x,y,hit:false,minD};
  }

  /* count how much damage a blast at (bx,by) would do to enemies of `unit`, and
   * how much to `unit`'s own team — used to rank candidate shots by OUTCOME, not
   * just by distance-to-target. Mirrors the falloff model in entities.js. */
  function blastScore(unit, weapon, bx, by){
    const r=(weapon&&weapon.radius)||0;
    if(r<=0) return {foe:0, self:0};   // utility/no-radius weapon
    let foe=0, self=0;
    const reach=r + C.UNIT_R;
    for(const t of S.units){
      if(!t.alive) continue;
      const d=U.dist(bx,by,t.x,t.y);
      if(d>=reach) continue;
      const dmg=(weapon.damage||0)*U.clamp(1-d/reach,0,1);
      if(t.id===unit.id || t.teamId===unit.teamId) self+=dmg;
      else foe+=dmg;
    }
    return {foe, self};
  }

  /* weapon ids that are hitscan / line / non-ballistic: a power+angle ballistic
   * solve does not model them. They fire straight along the aim, so we solve them
   * by pointing the aim at the target (the fire code re-derives the line). */
  const HITSCAN = {shotgun:1, sniper:1, laser:1, bat:1, melee:1};
  function isHitscan(weapon){ return !!(weapon && HITSCAN[weapon.id]); }
  // weapons that drop straight onto a chosen column / point (no ballistic arc):
  // airstrike + its variants land along the mouse-world X we set at fire time.
  const DROP = {airstrike:1, napalmstrike:1, minestrike:1};
  function isDrop(weapon){ return !!(weapon && DROP[weapon.id]); }

  /* score a candidate landing point: enemy damage, minus a heavy penalty for
   * self/team damage, minus a mild pull toward the aimed point so near-misses
   * still beat air shots. `minD` is the projectile's closest approach to the
   * target along its whole path (graze credit for flat/fast shots). */
  function scoreLanding(unit, weapon, land, tx, ty){
    const d=U.dist(land.x,land.y,tx,ty);
    const md=(land.minD!=null && isFinite(land.minD)) ? land.minD : d;
    const bs=blastScore(unit, weapon, land.x, land.y);
    // if the path grazed closer than the landing, credit a blast there too — a
    // bazooka that flies through a foe should rank as a hit, not a long overshoot.
    let foe=bs.foe, self=bs.self;
    if(md < d - 4 && (weapon.radius||0) > 0){
      const bm=blastScore(unit, weapon, tx, ty);  // approx: blast at the target
      const scale=U.clamp(1 - md/((weapon.radius||0)+C.UNIT_R), 0, 1);
      foe=Math.max(foe, bm.foe*scale); self=Math.max(self, bm.self*scale);
    }
    const aimD=Math.min(d, md);
    const net = foe*1.0 - self*2.4 - aimD*0.14;
    return {net, d:aimD, foe, self};
  }

  /* search angle/power (and BOTH facings) for the shot that does the best net
   * damage to enemies while sparing our own team. Coarse grid first, then a LOCAL
   * REFINEMENT pass around the best hit so Normal/Hard actually land (not just
   * "near"). Falls back to closest-landing when nothing hits anyone. Angle range
   * spans up AND down so the AI can shoot downhill. Iterations are hard-capped:
   * grid (≤2 facings × angles × powers) + a fixed 5×5 refine grid → always ends. */
  function solveShot(unit, weapon, tx, ty, level){
    const savedFacing=unit.facing;

    // hitscan/melee: no ballistic solve — aim straight at the target.
    if(isHitscan(weapon)){
      const fc = tx>=unit.x ? 1 : -1;
      const dx=Math.abs(tx-unit.x), dy=(unit.y-8)-ty;
      const ang=U.clamp(Math.atan2(dy, Math.max(8,dx)), -0.9, 1.45);
      unit.facing=fc;
      const bs=blastScore(unit, weapon, tx, ty);
      unit.facing=savedFacing;
      return {ang, pw:0.85, d:0, land:{x:tx,y:ty,minD:0}, facing:fc, foe:bs.foe, self:bs.self};
    }
    // airstrike-style drops: the bombs fall onto the mouse-X we point at the
    // target; the blast happens at the target column, so score it there.
    if(isDrop(weapon)){
      const fc = tx>=unit.x ? 1 : -1;
      const gy = (CA.Terrain&&CA.Terrain.heightAt) ? CA.Terrain.heightAt(tx) : ty;
      const ly = Math.min(ty, gy);
      const bs=blastScore(unit, weapon, tx, ly);
      return {ang:0.4, pw:0.6, d:0, land:{x:tx,y:ly,minD:0}, facing:fc, foe:bs.foe, self:bs.self};
    }

    let best=null, bestNet=-Infinity;
    const angles = level>=2
      ? [-0.5,-0.3,-0.2,-0.1,0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4]
      : level>=1
      ? [-0.4,-0.25,-0.1,0.05,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.15,1.3]
      : [-0.4,-0.15,0.1,0.25,0.4,0.55,0.7,0.85,1.0,1.15,1.3];
    const powers = level>=2
      ? [0.25,0.32,0.4,0.48,0.56,0.64,0.72,0.8,0.88,0.95,1.0]
      : level>=1
      ? [0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0]
      : [0.3,0.45,0.6,0.75,0.9,1.0];
    // prefer the facing toward the target, but a clustered/odd target may be
    // reachable better the other way — search both on normal/hard.
    const facings = level>=1 ? [savedFacing, -savedFacing] : [savedFacing];
    for(const fc of facings){
      unit.facing=fc;
      for(const ang of angles){
        for(const pw of powers){
          const land=simulate(unit, weapon, ang, pw, tx, ty);
          const sc=scoreLanding(unit, weapon, land, tx, ty);
          if(sc.net>bestNet){ bestNet=sc.net; best={ang, pw, d:sc.d, land, facing:fc, foe:sc.foe, self:sc.self}; }
        }
      }
    }

    // LOCAL REFINEMENT (normal/hard): hill-climb a tight grid around the best
    // coarse shot to convert near-misses into hits. Bounded 5×5 (level 1) /
    // 7×7 (level 2) samples — no loop, can't hang.
    if(best && level>=1){
      const aStep = level>=2 ? 0.025 : 0.05;
      const pStep = level>=2 ? 0.02  : 0.04;
      const n = level>=2 ? 3 : 2;     // ± n steps each axis
      unit.facing=best.facing;
      for(let ai=-n; ai<=n; ai++){
        for(let pi=-n; pi<=n; pi++){
          if(ai===0 && pi===0) continue;
          const ang=U.clamp(best.ang+ai*aStep, -0.9, 1.45);
          const pw =U.clamp(best.pw +pi*pStep, 0.2, 1);
          const land=simulate(unit, weapon, ang, pw, tx, ty);
          const sc=scoreLanding(unit, weapon, land, tx, ty);
          if(sc.net>bestNet){ bestNet=sc.net; best={ang, pw, d:sc.d, land, facing:best.facing, foe:sc.foe, self:sc.self}; }
        }
      }
    }

    unit.facing=savedFacing;
    return best;
  }

  /* line-of-fire probe: rough check that a low ballistic line from `unit` to `e`
   * isn't blocked by a thick wall of terrain right in front of us. Cheap + only
   * used to nudge target preference on harder levels. */
  function roughlyReachable(unit, e){
    if(!(CA.Terrain && CA.Terrain.isSolid)) return true;
    const steps=16;
    const dist=U.dist(unit.x,unit.y,e.x,e.y);
    // arc height scales with distance (a longer lob clears more terrain), capped.
    const arc=U.clamp(dist*0.28, 40, 160);
    let blocked=0;
    for(let i=1;i<steps;i++){
      const t=i/steps;
      const x=unit.x+(e.x-unit.x)*t;
      const y=unit.y+(e.y-unit.y)*t - Math.sin(t*Math.PI)*arc;
      if(CA.Terrain.isSolid(x,y)) blocked++;
    }
    return blocked<=4;   // a few solid samples (hills) are fine; a wall is not
  }

  /* #21 target weighting: distance + low-hp pull + cluster bonus + reachability,
   * scaled by level. Lower score = better. Easy mostly grabs the nearest foe;
   * hard hunts wounded/clustered/reachable targets (and goes for the kill). */
  function pickTarget(unit, level){
    const enemies=S.units.filter(u=>u.alive && u.teamId!==unit.teamId);
    if(!enemies.length) return null;
    let best=null;
    for(const e of enemies){
      const d=U.dist(unit.x,unit.y,e.x,e.y);
      const hpFactor=e.hp/Math.max(1,e.maxHp);
      // cluster: count allies-of-target near it -> juicy multi-hit
      let cluster=0;
      for(const o of enemies){ if(o!==e && U.dist(o.x,o.y,e.x,e.y)<70) cluster++; }
      const hpWeight=[40,170,300][level]??170;
      const clusterBonus=[0,50,100][level]??50;
      let score = d*0.7 + hpFactor*hpWeight - cluster*clusterBonus;
      // TAUNT/Provokáció: a guardian who used taunt FORCES enemy AI to target it
      // (this is what makes the ability actually do something — it sets e.taunt>0).
      if((e.taunt||0) > 0) score -= 100000;
      // finishing blow: heavily favour a foe we can likely one-shot. Normal goes
      // for ~easy kills too (a wounded foe is the highest-value target); hard is
      // hungrier and finishes from higher hp.
      const killHp=[0,55,75][level]??55;
      if(level>=1 && e.hp<=killHp) score -= (level>=2?260:180);
      // reachability nudge (normal/hard): penalise foes walled off from us
      if(level>=1 && !roughlyReachable(unit,e)) score += 260;
      if(!best || score<best.score) best={e, d, score, cluster};
    }
    return best;
  }

  /* #22 weapon choice: personality + situation + ults/hazards */
  function chooseWeapon(unit, target, level, persona){
    const L=(CA.Weapons&&CA.Weapons.LIST)||[];
    // has(): weapon is usable RIGHT NOW. Besides ammo, reject an ABILITY weapon
    // that is still on cooldown — otherwise chooseWeapon could hand the plan an
    // on-cooldown ult/ability, which fireCharged then rejects → wasted turn.
    // (chooseAbility already filters cooldowns via readyAbilities; mirror it here.)
    const cds = (unit && unit.cooldowns) || {};
    const has=id=>{
      const w=L.find(w=>w.id===id);
      if(!w || CA.ammoOf(w.id, unit&&unit.teamId)===0) return null;
      if(w.ability && (cds[id]||0) > 0) return null;   // ability on cooldown
      return w;
    };
    const dist=target.d;
    const dy=Math.abs(target.e.y-unit.y);
    const cluster=target.cluster||0;
    const myHp=unit.hp/Math.max(1,unit.maxHp);
    const sp=CA.speciesOf ? CA.speciesOf(unit) : null;
    const ult=sp && sp.ultimate ? has(sp.ultimate) : null;

    // BRUTAL ULTIMATES (Jani): if the AI picked up / was granted a mega ultimate
    // (nuke/magicorb/firerain/blackhole/meteors/quake) it should USE it when there's
    // a sensible target — these are rare, one-shot and devastating, don't hoard them.
    // CAPY-CSAPÁS (capyslam): a stack-bónusz nagy célzott rakétája — ha az AI-nak
    // van belőle (fejre-állással ő is megszerezheti), használja, ne hoardolja
    // (backlog #6). Erős, de nem mega, ezért a megák ELŐTT, sima célzott lövésként.
    {
      const cs=has('capyslam');
      if(cs && dist>40 && dist<1500 && Math.random()<(level>=2?0.9:0.75)) return cs;
    }
    {
      const MEGAS=['nuke','meteors','firerain','blackhole','quake','magicorb'];
      const haveMega=[];
      for(let mi=0;mi<MEGAS.length;mi++){ const w=has(MEGAS[mi]); if(w) haveMega.push(w); }
      if(haveMega.length){
        // "makes sense": a real target exists (a lone foe is still worth a nuke).
        const sensible = (cluster>=1) || (dist>50 && dist<1400);
        const useChance = level>=2 ? 0.92 : level>=1 ? 0.8 : 0.6;
        if(sensible && Math.random()<useChance){
          // prefer an AREA mega on a cluster; otherwise whatever we have.
          const pick = (cluster>=1)
            ? (has('nuke')||has('meteors')||has('firerain')||has('blackhole')||has('quake')||has('magicorb'))
            : haveMega[0];
          if(pick) return pick;
        }
      }
    }

    // #3 boss signature weapon: modes.js sets unit._preferWeapon when a boss
    // telegraphs its signature. Bias toward it when it's actually usable now (has
    // ammo / off cooldown via has(), and a sane firing range per solveShot later).
    // Kept a BIAS, not absolute: if unusable or clearly the wrong tool (e.g. a
    // close foe vs a long-range signature), we fall through to normal logic.
    if(unit && unit._preferWeapon){
      const pref=has(unit._preferWeapon);
      // don't force a melee/very-short signature at long range or vice-versa; use
      // the same range cue the rest of this fn relies on (radius-based self-frag
      // safety is handled later in planWeaponShot). Mild guard only.
      const prefBad = pref && pref.radius>80 && dist<160;   // big-blast on a hugger
      if(pref && !prefBad){
        // strong bias: usually take it, but leave a small chance to vary so it is
        // not a hard lock (kamikaze/self-preservation logic below can still win on
        // the next call). Higher difficulty commits harder to the telegraph.
        const sigChance = level>=2 ? 0.9 : level>=1 ? 0.8 : 0.65;
        if(Math.random() < sigChance) return pref;
      }
    }

    // KAMIKAZE: if low hp and a foe is close, go all-in with a big self-area weapon
    if(persona==='kamikaze' && myHp<0.45 && dist<150){
      return has('capybomb') || has('dynamite') || has('grenade') || has('bazooka') || L[0];
    }

    // NEW UNIVERSAL WEAPONS (variety): occasionally pick a damaging new toy when it
    // fits the range. Low chance so existing selection still dominates; conditions
    // keep each pick sensible (homing self-steers; mirv/roller want open ground;
    // sniper is long & precise; bat is a close knockback fling). #2
    {
      const nv=[];
      // homing: reliable at most ranges (it steers), great when walled off / far
      if(dist>120 && dist<620) nv.push(has('homing'));
      // mirv: splits at apex -> good on far / clustered targets
      if(dist>180 && (cluster>=1 || dist<560)) nv.push(has('mirv'));
      // roller: hugs ground into trenches -> good at mid range, level ground-ish
      if(dist>120 && dist<420) nv.push(has('roller'));
      // sniper: long, precise, line-ish -> far + reachable
      if(dist>260 && dist<700) nv.push(has('sniper'));
      // bat: close-range knockback (can fling into water) -> very close
      if(dist<70) nv.push(has('bat'));
      const pool=nv.filter(Boolean);
      // ~18% on normal+, a touch less on easy, so opponents feel varied.
      const newChance = level>=1 ? 0.18 : 0.10;
      if(pool.length && Math.random()<newChance) return U.pick(pool);
    }

    // big-area ult/cluster weapon on a clustered group of foes (far -> spread fire)
    if(cluster>=2 && dist>120){
      // cluster/airstrike/capybomb or the species ultimate are all good here
      const pool=[has('cluster'), has('airstrike'), has('capybomb'),
                  (ult && dist>90 && !(ult.radius>80 && dist<160)) ? ult : null]
                 .filter(Boolean);
      if(pool.length && (level>=1 || Math.random()<0.5)) return U.pick(pool);
    }

    // species ultimate on a clean mid/far lob (aggressive spends it readily)
    if(ult && dist>110 && dist<580 && !(ult.radius>80 && dist<160)){
      const ultChance = persona==='aggressive' ? 0.5 : (level>=1 ? 0.3 : 0.18);
      if(Math.random()<ultChance) return ult;
    }

    // occasional area-denial / variety picks at distance (napalm / gas / mine drop)
    if(dist>150 && dist<580 && Math.random()<0.22){
      const v=U.pick(['napalm','gasgrenade','cluster','guided'].map(has).filter(Boolean));
      if(v) return v;
    }
    // sometimes just drop a mine to vary play (close enemy, not on top of us)
    if(dist>50 && dist<140 && Math.random()<0.15){ const mn=has('mine'); if(mn) return mn; }

    // very close -> melee shove (can knock into water) or grenade/dynamite
    if(dist<70){
      if(persona!=='cautious' && Math.random()<0.45){ const ml=has('melee'); if(ml) return ml; }
      return has('dynamite')||has('grenade')||has('bazooka')||L[0];
    }
    if(dist<150){
      // close-ish: grenade / dynamite, a little randomized so it varies
      const pool=[has('grenade'), has('dynamite')].filter(Boolean);
      if(pool.length && dy<150) return U.pick(pool);
      const dyn=has('dynamite'); if(dyn) return dyn;
    }

    // mid/far -> mix bazooka with grenade/cluster/guided so it isn't always bazooka
    if(dist>360){ const g=has('guided'); if(g && level>=1 && Math.random()<0.4) return g; }
    const midPool=[has('bazooka'), has('grenade'),
                   (dist>220?has('cluster'):null)].filter(Boolean);
    if(midPool.length) return U.pick(midPool);
    // FINAL FALLBACK: never return undefined. Prefer a usable staple; if every
    // staple is out of ammo, hand back ANY usable weapon, then any LIST weapon at
    // all (last resort) so callers/simulate() always get a real {id,...} object.
    return has('bazooka') || has('shotgun')
        || L.find(w=>w && CA.ammoOf(w.id, unit&&unit.teamId)!==0)
        || L[0]
        || {id:'bazooka', damage:30, radius:34, affectedByWind:true};
  }

  /* ============================================================================
   * v4 — CLASS ABILITIES. On its turn an AI hero may use a class ability instead
   * of a plain weapon. Abilities are weapons in CA.Weapons.LIST tagged
   * {ability:true, cls, cooldown}; unit.cooldowns[id] is turns-left (0 = ready).
   * We look up the ready ones, then pick by class + situation. Offensive aimed
   * abilities (power+radius) go through the SAME solveShot/aim path as weapons;
   * self/ally/utility abilities fire as a point action toward a chosen spot.
   * Everything here is defensive — a missing class system just yields no pick.
   * ==========================================================================*/

  // all ability weapons this hero owns and can use right now (cooldown ready).
  function readyAbilities(unit){
    const L=(CA.Weapons&&CA.Weapons.LIST)||[];
    if(!unit || !unit.cls || !L.length) return [];
    // the class def lists the ability ids it should have; fall back to cls-tag.
    const def = (typeof CA.classOf==='function') ? CA.classOf(unit) : null;
    const allow = (def && Array.isArray(def.abilities) && def.abilities.length)
      ? def.abilities : null;
    const cds = unit.cooldowns || {};
    const out=[];
    for(const w of L){
      if(!w || !w.ability) continue;
      if(w.cls && unit.cls && w.cls!==unit.cls) continue;
      if(allow && allow.indexOf(w.id)<0) continue;
      if(CA.ammoOf(w.id, unit&&unit.teamId)===0) continue;
      if((cds[w.id]||0) > 0) continue;     // still on cooldown
      out.push(w);
    }
    return out;
  }
  const hasAbil=(list,id)=>list.find(w=>w.id===id)||null;

  // wounded ally (not self) of this hero's team, most-hurt first. minions excluded.
  function woundedAlly(unit, frac){
    let best=null, bestMiss=0;
    for(const a of S.units){
      if(!a.alive || a.minion || a.teamId!==unit.teamId || a.id===unit.id) continue;
      const f=a.hp/Math.max(1,a.maxHp);
      if(f>frac) continue;
      const miss=(a.maxHp||100)-a.hp;
      if(miss>bestMiss){ bestMiss=miss; best=a; }
    }
    return best;
  }
  // a fallen ally hero we could revive (dead, not a minion, same team).
  function deadAlly(unit){
    for(const a of S.units){ if(!a.alive && !a.minion && a.teamId===unit.teamId) return a; }
    return null;
  }
  // any nearby ally to protect/buff before a push?
  function allyNear(unit, r){
    for(const a of S.units){ if(a.alive && !a.minion && a.teamId===unit.teamId && a.id!==unit.id && U.dist(unit.x,unit.y,a.x,a.y)<r) return a; }
    return null;
  }

  /* Choose a class ability to use this turn, or null to fall back to weapons.
   * Returns { weapon, kind:'aim'|'point', aimTarget:{x,y}, why } where:
   *   'aim'   -> resolve angle/power via solveShot like a normal weapon.
   *   'point' -> fire as a point action toward aimTarget (mouse-targeted /
   *              self-cast utility); minimal aim, no ballistic solve needed.
   * Difficulty (level) gates how eagerly/cleverly abilities are used. */
  function chooseAbility(unit, target, level, persona){
    const ab = readyAbilities(unit);
    if(!ab.length) return null;
    const tgt=target.e, dist=target.d, cluster=target.cluster||0;
    const myHp=unit.hp/Math.max(1,unit.maxHp);
    const cls=unit.cls;
    // base willingness to spend an ability rises with difficulty. Normal is held
    // back from Hard (0.62 vs 0.92) so it commits its cooldown abilities less
    // optimally — difficulty changes DECISIONS, not just aim radians.
    const eager = level>=2 ? 0.92 : level>=1 ? 0.62 : 0.55;
    const roll = ()=>Math.random()<eager;
    const aimAt = { x:tgt.x, y:tgt.y-6 };

    if(cls==='necro'){
      // pressure: summon when enemies are far (build a wall of minions) — but a
      // clean mid lob with bone_spear is great damage when in range.
      const spear=hasAbil(ab,'bone_spear');
      if(spear && dist>90 && dist<560 && roll()) return {weapon:spear, kind:'aim', aimTarget:aimAt, why:'bone_spear'};
      const sk=hasAbil(ab,'summon_skeleton'), zo=hasAbil(ab,'summon_zombie');
      if((sk||zo) && (dist>240 || cluster>=2) && roll()){
        // skeleton is cheaper/faster; zombie is the heavier press.
        return {weapon: (dist>360 && zo)?zo:(sk||zo), kind:'point', aimTarget:{x:unit.x+unit.facing*40,y:unit.y}, why:'summon'};
      }
      if(spear) return {weapon:spear, kind:'aim', aimTarget:aimAt, why:'bone_spear'};
      return null;
    }

    if(cls==='guardian'){
      const taunt=hasAbil(ab,'taunt'), slam=hasAbil(ab,'ground_slam'), wall=hasAbil(ab,'shield_wall');
      // low + enemies close -> taunt to soak / shield_wall to brace
      if(myHp<0.5 && dist<200){
        if(taunt && roll()) return {weapon:taunt, kind:'point', aimTarget:{x:unit.x,y:unit.y}, why:'taunt'};
        if(wall && roll())  return {weapon:wall,  kind:'point', aimTarget:{x:unit.x,y:unit.y}, why:'shield_wall'};
      }
      // ground_slam on an adjacent / very-close enemy (its big radius shines up close)
      if(slam && dist<150 && roll()) return {weapon:slam, kind:'aim', aimTarget:aimAt, why:'ground_slam'};
      // brace before a push if a fragile ally is nearby
      if(wall && allyNear(unit,160) && level>=1 && roll()) return {weapon:wall, kind:'point', aimTarget:{x:unit.x,y:unit.y}, why:'shield_wall'};
      return null;
    }

    if(cls==='mage'){
      const chain=hasAbil(ab,'chain_lightning'), fb=hasAbil(ab,'fireball'), frost=hasAbil(ab,'frost_nova');
      // chain lightning loves groups
      if(chain && cluster>=2 && dist<560 && roll()) return {weapon:chain, kind:'aim', aimTarget:aimAt, why:'chain_lightning'};
      // frost on a tight cluster to lock them / soften
      if(frost && cluster>=1 && dist>70 && dist<480 && roll()) return {weapon:frost, kind:'aim', aimTarget:aimAt, why:'frost_nova'};
      // fireball on an exposed single target (reliable burst)
      if(fb && dist>60 && dist<600 && roll()) return {weapon:fb, kind:'aim', aimTarget:aimAt, why:'fireball'};
      // fallbacks if a preferred one was on cooldown
      if(fb) return {weapon:fb, kind:'aim', aimTarget:aimAt, why:'fireball'};
      if(chain) return {weapon:chain, kind:'aim', aimTarget:aimAt, why:'chain_lightning'};
      return null;
    }

    if(cls==='hunter'){
      const cs=hasAbil(ab,'charged_shot'), mark=hasAbil(ab,'mark_target'), multi=hasAbil(ab,'multishot');
      // mark a healthy/important far target first (sets up a clean kill), then it
      // doesn't end the turn so the hunter could follow up — but the simple plan
      // fires once, so only mark when we WON'T also have a great shot this turn.
      if(mark && level>=2 && dist>300 && roughlyReachable(unit,tgt) && Math.random()<0.35)
        return {weapon:mark, kind:'point', aimTarget:aimAt, why:'mark'};
      // multishot into a cluster
      if(multi && cluster>=2 && dist>120 && dist<600 && roll()) return {weapon:multi, kind:'aim', aimTarget:aimAt, why:'multishot'};
      // charged_shot for a clean long, reachable shot (its bread & butter)
      if(cs && dist>140 && roughlyReachable(unit,tgt) && roll()) return {weapon:cs, kind:'aim', aimTarget:aimAt, why:'charged_shot'};
      if(cs && roll()) return {weapon:cs, kind:'aim', aimTarget:aimAt, why:'charged_shot'};
      return null;
    }

    if(cls==='engineer'){
      const turret=hasAbil(ab,'deploy_turret'), wall=hasAbil(ab,'build_wall'), trap=hasAbil(ab,'place_trap');
      // defensive turret when foes are pressing and we're not about to die
      if(turret && dist<420 && myHp>0.4 && (level>=1?roll():Math.random()<0.4))
        return {weapon:turret, kind:'point', aimTarget:{x:unit.x+unit.facing*30,y:unit.y}, why:'turret'};
      // trap a chokepoint / the approach when an enemy is closing in
      if(trap && dist<160 && roll())
        return {weapon:trap, kind:'point', aimTarget:{x:unit.x+unit.facing*48,y:unit.y}, why:'trap'};
      // wall up for defense when low or pressured
      if(wall && (myHp<0.55 || dist<120) && roll())
        return {weapon:wall, kind:'point', aimTarget:{x:unit.x+unit.facing*36,y:unit.y}, why:'wall'};
      return null;
    }

    if(cls==='healer'){
      const heal=hasAbil(ab,'heal_beam'), rev=hasAbil(ab,'revive'), buff=hasAbil(ab,'buff_aura');
      // revive a fallen ally (high value, only when one exists)
      const dead=rev?deadAlly(unit):null;
      if(rev && dead && roll()) return {weapon:rev, kind:'point', aimTarget:{x:dead.x,y:dead.y}, why:'revive'};
      // heal the most-wounded ally (or self if badly hurt)
      const hurt=heal?woundedAlly(unit,0.6):null;
      if(heal && hurt && roll()) return {weapon:heal, kind:'point', aimTarget:{x:hurt.x,y:hurt.y}, why:'heal_ally'};
      if(heal && myHp<0.45) return {weapon:heal, kind:'point', aimTarget:{x:unit.x,y:unit.y}, why:'heal_self'};
      // buff before a push (ally nearby, decent hp, not in a panic)
      if(buff && allyNear(unit,180) && myHp>0.5 && level>=1 && roll())
        return {weapon:buff, kind:'point', aimTarget:{x:unit.x,y:unit.y}, why:'buff'};
      return null;
    }

    return null;
  }

  /* would firing here hurt me badly? (avoid adjacent-terrain self-frag) */
  function selfDamageRisk(unit, weapon, landX, landY){
    if(!weapon) return false;
    const d=U.dist(unit.x,unit.y,landX,landY);
    // if the predicted blast radius reaches us, it's risky
    return d < (weapon.radius||0) + C.UNIT_R + 6;
  }

  /* ----- movement safety: don't step off into water or a deep pit ----- */
  // Is it safe for `unit` to be standing at world-x `nx`? Checks that there is
  // solid ground reasonably close below, and that it's above the water line.
  function safeGroundAt(nx){
    nx = U.clamp(nx, C.UNIT_R, C.WORLD_W - C.UNIT_R);
    const water = (S.waterLevel!=null) ? S.waterLevel : C.WATER_LEVEL;
    let groundY = C.WORLD_H;
    if(CA.Terrain && typeof CA.Terrain.heightAt==='function'){
      groundY = CA.Terrain.heightAt(nx);
    }
    // ground at/under water = drowning spot -> unsafe
    if(groundY >= water - 2) return false;
    return true;
  }

  // Can `unit` take one walk step in `dir` without walking off an edge?
  function canStep(unit, dir){
    if(!unit) return false;
    const nx = unit.x + dir*4;                 // a touch ahead of one walk step
    if(nx <= C.UNIT_R || nx >= C.WORLD_W-C.UNIT_R) return false;
    if(!safeGroundAt(nx)) return false;
    // big drop ahead? (cliff) — measure ground depth vs our feet
    const water = (S.waterLevel!=null) ? S.waterLevel : C.WATER_LEVEL;
    if(CA.Terrain && typeof CA.Terrain.heightAt==='function'){
      const gy = CA.Terrain.heightAt(nx);
      if(gy >= water - 2) return false;
      // refuse to walk into a pit much lower than current footing
      if(gy - (unit.y + C.UNIT_R) > 90) return false;
    }
    return true;
  }

  /* Decide a reposition: how many frames to walk and in which direction.
   * Happens on ALL difficulties at least sometimes; scales with level. */
  function planRepose(unit, target, level, shot){
    const tx = target.e.x;
    const dist = target.d;

    // CRATE SEEKING (Jani: az AI vegye fel a közeli ládát). Before the normal
    // reposition, if a live grounded crate is within a sensible horizontal reach
    // AND on roughly the same level (not on an overhead platform), walk to it —
    // the pickup auto-triggers when the active unit walks near it (see
    // Weapons.updateCrates). A crate (weapon/health/utility) is worth the detour.
    try {
      if (S.crates && S.crates.length){
        const reach = [120, 220, 340][level] ?? 220;
        let best = null, bestDx = 1e9;
        for (let ci=0; ci<S.crates.length; ci++){
          const cr = S.crates[ci];
          if (!cr || cr._dead || !cr.grounded) continue;
          const dx = cr.x - unit.x, adx = Math.abs(dx);
          if (adx < reach && Math.abs(cr.y - unit.y) < 90 && adx < bestDx){
            const cdir = dx >= 0 ? 1 : -1;
            if (canStep(unit, cdir)){ best = cr; bestDx = adx; }
          }
        }
        if (best){
          const gdir = (best.x - unit.x) >= 0 ? 1 : -1;
          const need = Math.min(95, Math.ceil(bestDx/2) + 6);  // ~2px/frame + a little
          return { frames: need, dir: gdir, crate:true };
        }
      }
    } catch(e){}

    // baseline chance + per-level walk budget
    const chance = [0.62, 0.8, 0.92][level] ?? 0.8;
    if(Math.random() > chance) return {frames:0, dir:1};

    let dir;
    // far away or bad solution -> close the gap toward the target
    if(dist > 320 || (shot && shot.d > 90)){
      dir = tx >= unit.x ? 1 : -1;
    } else if(dist < 90){
      // too close -> back off a little to avoid self-frag / get a cleaner lob
      dir = tx >= unit.x ? -1 : 1;
    } else {
      // mid range -> small random jockeying for a better firing line
      dir = Math.random()<0.5 ? 1 : -1;
    }
    // if that direction is unsafe (edge/water), try the other way
    if(!canStep(unit, dir)){
      dir = -dir;
      if(!canStep(unit, dir)) return {frames:0, dir:1}; // boxed in -> don't move
    }
    // walk budget grows with difficulty; even easy walks a little
    const span = [[14,30],[24,52],[34,78]][level] ?? [24,52];
    const frames = U.randInt(span[0], span[1]);
    return {frames, dir};
  }

  /* pick a personality for a team (stable per team via aiPersona) */
  function personaFor(team, level){
    if(team && team.aiPersona) return team.aiPersona;
    const pool = level>=2 ? ['aggressive','aggressive','cautious','kamikaze']
               : level>=1 ? ['aggressive','cautious','cautious']
               : ['cautious','aggressive'];
    const p=U.pick(pool);
    if(team) team.aiPersona=p;
    return p;
  }

  /* Build an AIMED weapon/ability shot plan (target + weapon + solved angle/power),
   * or null if no shot exists. Pulled out of takeTurn so it can be re-run after a
   * non-turn-ending support ability (so the AI still ATTACKS that turn). #1
   *   allowAbility=false -> force a plain weapon (used for the support follow-up,
   *                         which must actually deal damage / end the turn).
   *   noRepose=true      -> skip the walk phase (already moved/acted this turn). */
  function planWeaponShot(unit, team, level, persona, allowAbility, noRepose){
    const tgt=pickTarget(unit, level);
    if(!tgt) return null;
    unit.facing = tgt.e.x>=unit.x ? 1 : -1;

    // offensive AIM ability decision (point-casts are handled by takeTurn only).
    let abil=null;
    if(allowAbility){
      try{ abil=chooseAbility(unit, tgt, level, persona); }catch(e){ abil=null; }
      // a point-cast ability has no ballistic shot here — ignore it on this path.
      if(abil && abil.kind!=='aim') abil=null;
    }

    let weapon = abil ? abil.weapon : chooseWeapon(unit, tgt, level, persona);
    const aimY=tgt.e.y-6;
    let shot=solveShot(unit, weapon, tgt.e.x, aimY, level);
    if(!shot){
      // ability had no solution — fall back to a plain weapon before giving up.
      if(abil){
        weapon=chooseWeapon(unit, tgt, level, persona);
        shot=solveShot(unit, weapon, tgt.e.x, aimY, level);
        abil=null;
      }
      if(!shot) return null;
    }

    // #3 DON'T WASTE THE TURN on a weapon that can't actually connect. If the
    // chosen weapon's best solved shot lands on nobody (foe≈0), try the reliable
    // staples and keep whichever connects best. Normal/Hard only — Easy is allowed
    // to flub. Bounded: a fixed handful of candidate weapons, each one solveShot.
    if(level>=1 && !abil && (shot.foe||0) < 1){
      const L=(CA.Weapons&&CA.Weapons.LIST)||[];
      // direct-fire vs lobbed staples + a homing option (steers around terrain),
      // ordered so a clear line-of-sight foe gets a direct hit and a walled one
      // gets a lob / self-guiding shot.
      const cands = ['bazooka','grenade','cluster','homing','sniper','dynamite'];
      for(const id of cands){
        if(weapon && id===weapon.id) continue;
        const w=L.find(w=>w.id===id && CA.ammoOf(w.id, unit&&unit.teamId)!==0);
        if(!w) continue;
        if(w.ability && (unit.cooldowns&&unit.cooldowns[id]>0)) continue;
        const s2=solveShot(unit, w, tgt.e.x, aimY, level);
        if(s2 && (s2.foe||0) > (shot.foe||0) && (s2.self||0) <= (s2.foe||0)*0.5){
          weapon=w; shot=s2;
        }
      }
    }

    // #22 self-frag avoidance: if the best shot would hurt our own team (or land
    // on top of us), swap to a safer option (bazooka/grenade) — and if THAT is
    // still risky, fall back to a harmless point shot rather than self-frag.
    const risky = s => !s || selfDamageRisk(unit, weapon, s.land.x, s.land.y) || (s.self||0) > (s.foe||0)*0.5;
    // For an offensive ABILITY we only bail if it would land on top of US (true
    // self-frag); otherwise we keep the (valuable, cooldown-gated) ability.
    const abilSelfFrag = abil ? selfDamageRisk(unit, weapon, shot.land.x, shot.land.y) : false;
    if((abil ? abilSelfFrag : risky(shot))){
      const L=(CA.Weapons&&CA.Weapons.LIST)||[];
      if(abil){ abil=null; }   // dropping the ability -> swap to a safe weapon
      for(const id of ['bazooka','grenade','shotgun']){
        const safe=L.find(w=>w.id===id && CA.ammoOf(w.id, unit&&unit.teamId)!==0);
        if(!safe) continue;
        const s2=solveShot(unit, safe, tgt.e.x, aimY, level);
        if(s2 && !selfDamageRisk(unit, safe, s2.land.x, s2.land.y) && (s2.self||0) <= (s2.foe||0)*0.5){
          weapon=safe; shot=s2; break;
        }
      }
    }

    // adopt the facing the solver settled on (it may shoot the OTHER way)
    if(shot.facing!=null) unit.facing=shot.facing;

    // aim error that shrinks with difficulty (radians). Easy AI is genuinely
    // wild (and occasionally flubs power hard); normal is competent and lands
    // most shots; hard is near-precise. Power gets a parallel jitter.
    //  L0 ≈ 7°  angle / wide power  -> sloppy, misses a fair bit
    //  L1 ≈ 2.9° angle / tight      -> competent BUT fallible (clearly beatable)
    //  L2 ≈ 0.6° angle / minimal    -> near-optimal
    // Normal widened to 0.05 rad so it visibly misjudges some lobs — the gap to
    // Hard is now a real skill gap, not a hair of jitter on otherwise-perfect aim.
    const angErr=[0.13,0.05,0.011][level]??0.05;
    const pwErr =[0.13,0.028,0.012][level]??0.028;
    let targetAng=U.clamp(shot.ang + U.rand(-angErr,angErr), -0.9, 1.45);
    let power    =U.clamp(shot.pw  + U.rand(-pwErr,pwErr), 0.2, 1);
    // L0 occasionally fluffs the shot harder so Easy stays gentle/beatable.
    if(level<=0 && Math.random()<0.3){
      targetAng=U.clamp(targetAng + U.rand(-0.12,0.12), -0.9, 1.45);
      power    =U.clamp(power + U.rand(-0.18,0.18), 0.2, 1);
    }

    if(unit.aimAngle==null) unit.aimAngle=0.2;

    // Reposition first (all difficulties walk at least sometimes; easy walks a
    // little, hard walks purposefully). Direction respects edges/water/pits.
    const rep=noRepose ? {frames:0,dir:1} : planRepose(unit, tgt, level, shot);

    // INITIAL THINK DELAY: idle ~1.2–1.9s before doing anything, so the AI's turn
    // doesn't snap straight into walking/aiming. Remember the real first phase in
    // afterThink and restore it once the pause elapses. Skip the pause if the turn
    // timer is already very low (don't risk timing the turn out).
    const lowTime = (S.turnTimer!=null && S.turnTimer < 2.5);
    return {
      unit, weapon, team, level,
      targetAng, power,
      facing: unit.facing,
      phase: lowTime ? (rep.frames>0?'move':'aim') : 'think',
      afterThink: rep.frames>0 ? 'move' : 'aim',
      wait: U.randInt(70,115),
      moveFrames: rep.frames,
      moveDir: rep.dir,
      aimFrames:0,
      thinkPause:U.randInt(22,40),
      fired:false,
      replanTarget:tgt.e,
      // v4: mark offensive abilities so the fire phase sets their cooldown, and
      // hand the ability its mouse-world aim target (some read S.input.mouse*).
      // Airstrike-style drops ALSO read mouse-world X — point it at the target so
      // the bombing run lands on the foe instead of a stale/forward default.
      isAbility: !!abil,
      mouse: abil ? {x:tgt.e.x, y:aimY}
           : isDrop(weapon) ? {x:tgt.e.x, y:shot.land.y}
           : null,
    };
  }

  CA.AI={
    init(){ plan=null; },

    takeTurn(unit, team){
      plan=null;
      if(!unit || !unit.alive){ CA.endTurn(); return; }
      const level=(team&&team.aiLevel!=null)?team.aiLevel:1;
      // aiLevel<=0 = PASSIVE dummy (puzzle/tutorial/golf targets) — never acts.
      // Without this gate level 0 just meant "sloppy aim": the supposedly idle
      // dummies shot back, killed players and corrupted puzzle par/star counts.
      if(level<=0){ CA.endTurn(); return; }
      const persona=personaFor(team, level);
      const tgt=pickTarget(unit, level);
      if(!tgt){ CA.endTurn(); return; }

      unit.facing = tgt.e.x>=unit.x ? 1 : -1;

      // v4 — class ability decision FIRST. If a good ability fits, use it; else
      // fall through to the normal weapon-aim logic. Never throws.
      let abil=null;
      try{ abil=chooseAbility(unit, tgt, level, persona); }catch(e){ abil=null; }

      // POINT-CAST ability (summon / heal / buff / turret / wall / trap / mark /
      // taunt / revive): no ballistic solve. Aim roughly at the cast spot, set the
      // mouse-world target the ability reads, then fire. Robust point-action plan.
      if(abil && abil.kind==='point'){
        const at=abil.aimTarget||{x:unit.x+unit.facing*30,y:unit.y};
        unit.facing = at.x>=unit.x ? 1 : -1;
        if(unit.aimAngle==null) unit.aimAngle=0.2;
        // a gentle aim toward the spot (purely cosmetic for point-casts)
        const dx=at.x-unit.x, dy=(at.y-6)-(unit.y-8);
        const aimAng=U.clamp(Math.atan2(-dy, Math.max(20,Math.abs(dx)))*0.6, -0.6, 1.0);
        // INITIAL THINK DELAY (see planWeaponShot): pause before the cast unless
        // the turn timer is already very low. Point-casts always resume in 'aim'.
        const lowTime = (S.turnTimer!=null && S.turnTimer < 2.5);
        plan={
          unit, weapon:abil.weapon, team, level, persona,
          targetAng:aimAng, power:0.6,
          facing:unit.facing,
          phase:lowTime?'aim':'think', afterThink:'aim', wait:U.randInt(70,115),
          moveFrames:0, moveDir:1, aimFrames:0,
          thinkPause:U.randInt(16,30), fired:false,
          replanTarget:tgt.e,
          isAbility:true, mouse:{x:at.x, y:at.y},
        };
        return;
      }

      // Otherwise build a normal aimed weapon/ability shot. Guard the whole build:
      // if planning throws (e.g. simulate() deref on an unexpected undefined weapon),
      // the turn would hang because endTurn never runs. End the turn on any throw.
      let p=null;
      try{ p=planWeaponShot(unit, team, level, persona, true, false); }
      catch(e){ CA.endTurn(); return; }
      if(!p){ CA.endTurn(); return; }
      p.persona=persona;
      plan=p;
    },

    update(dt){
      if(!plan) return;
      const u=plan.unit;
      if(!u || !u.alive){ plan=null; CA.endTurn(); return; }
      // never let a stale plan puppeteer a unit on another team's turn: if the
      // plan's unit isn't the current ACTIVE AI unit, drop it. (A turn can end via
      // the timer/settle backstop before the plan fired, leaving plan set.)
      var _cur=S.teams[S.currentTeamIdx];
      if(!_cur || !_cur.isAI || u.teamId!==_cur.id || u.id!==S.activeUnitId){
        // The planned unit is no longer the active AI unit. Dropping the plan and
        // relying on core's hard-cap idles to the long turn timer (the cap only
        // fires once _pendingNext is set). If we're still mid-AIM with nothing
        // pending, end the turn now so play advances promptly.
        if(_cur && _cur.isAI && S.phase===CA.TurnPhase.AIM && !S._pendingNext){ plan=null; CA.endTurn(); return; }
        plan=null; return;
      }
      if(!CA.canControl || !CA.canControl()){
        if(plan.fired){ plan=null; }
        return;
      }

      // THINK PHASE: a brief idle pause at the start of the turn so the AI looks
      // like it's sizing things up instead of firing the instant it's up. Holds an
      // 'idle' pose (NOT aiming yet) until the wait elapses, then resumes the real
      // first phase (move/aim). This burns AIM-phase time, which has the whole turn.
      if(plan.phase==='think'){
        if(u.anim) u.anim.state='idle';
        if(--plan.wait <= 0){
          plan.phase = plan.afterThink || (plan.moveFrames>0?'move':'aim');
        }
        return;
      }

      // WALK PHASE: walk a few frames toward/away — but STOP at edges/water/pits
      // and respect the per-turn move budget (same limit a human player has).
      if(plan.phase==='move'){
        // edge guard: if the next step would walk us off into water or a deep
        // pit, abort walking immediately and proceed to aim from here. Also stop
        // when the shared move budget is exhausted.
        if(!canStep(u, plan.moveDir) || (S._moveBudget||0) <= 0){
          plan.moveFrames=0;
        } else {
          u.facing=plan.moveDir;
          const bx=u.x;
          if(CA.Entities && CA.Entities.walk) CA.Entities.walk(u, plan.moveDir);
          S._moveBudget = (S._moveBudget||0) - Math.abs(u.x - bx);
          if(u.anim) u.anim.state='walk';
          plan.moveFrames--;
          // OCCASIONAL HOP: a little personality mid-walk. ~30% of moving turns
          // produce a single hop (rolled once, the first frame we consider it),
          // then a small per-frame chance picks WHEN. Independent of walk()/budget.
          if(plan._hopRoll===undefined) plan._hopRoll = Math.random()<0.30;
          if(plan._hopRoll && !plan._hopped && u.grounded && Math.random()<0.04){
            plan._hopped=true;
            try{ if(CA.Entities && CA.Entities.jump) CA.Entities.jump(u); }catch(e){}
          }
        }
        if(plan.moveFrames<=0){
          // re-solve from the new spot so the shot stays accurate
          const lvl=(plan.level!=null)?plan.level:1;
          let t=plan.replanTarget;
          let re=null;
          // #3 target may have DIED during the walk (chain reaction, fall, fire).
          // Don't fire at stale coords — re-pick a live target; if none remain,
          // end the turn cleanly instead of lobbing into an empty grave.
          if(!(t && t.alive)){
            re=pickTarget(u, lvl);
            if(!re){ plan=null; CA.endTurn(); return; }
            t=re.e; plan.replanTarget=t;
          }
          // #4 re-validate ammo: a weapon that hit 0 ammo mid-turn would fizzle on
          // fireCharged and waste the turn. If empty, re-choose a usable weapon.
          if(plan.weapon && CA.ammoOf(plan.weapon.id, u.teamId)===0){
            const re2 = (re && re.e===t) ? re : pickTarget(u, lvl);
            if(re2){
              try{ const w2=chooseWeapon(u, re2, lvl, plan.persona); if(w2) plan.weapon=w2; }
              catch(e){}
            }
          }
          u.facing = t.x>=u.x ? 1 : -1;
          const s=solveShot(u, plan.weapon, t.x, t.y-6, lvl);
          if(s){
            if(s.facing!=null){ u.facing=s.facing; }
            plan.facing=u.facing;
            plan.targetAng=U.clamp(s.ang,-0.9,1.45); plan.power=U.clamp(s.pw,0.2,1);
          } else { plan.facing=u.facing; }
          plan.phase='aim';
        }
        return;
      }

      if(plan.phase==='aim'){
        u.aimAngle=U.lerp(u.aimAngle, plan.targetAng, 0.14);
        u.facing=plan.facing!=null?plan.facing:u.facing;
        if(u.anim) u.anim.state='aim';
        plan.aimFrames++;
        if(Math.abs(u.aimAngle-plan.targetAng)<0.02 || plan.aimFrames>70){
          u.aimAngle=plan.targetAng;
          plan.phase='settle';
          plan.wait=plan.thinkPause;
        }
        return;
      }

      if(plan.phase==='settle'){
        if(plan.wait-- > 0) return;
        plan.phase='fire';
        return;
      }

      if(plan.phase==='fire'){
        if(!plan.fired){
          plan.fired=true;
          const w=plan.weapon;
          const wid=w ? w.id : (S.selectedWeapon||'bazooka');
          S.selectedWeapon=wid;
          // mouse-targeted abilities (heal/turret/trap/revive/charged_shot/…) read
          // S.input.mouseWorld*; point the cursor at our chosen cast spot.
          if(plan.mouse){ S.input.mouseWorldX=plan.mouse.x; S.input.mouseWorldY=plan.mouse.y; }
          const endsTurn = w ? (w.endsTurn!==false) : true;
          // a non-damaging support/utility (taunt/shield_wall/mark/buff/build/heal):
          // it leaves the turn open — we should FOLLOW UP with an attack, not waste
          // the turn. A damaging non-ender (e.g. bat) already attacked. #1
          const isSupport = w && (w.endsTurn===false) && !((w.damage||0) > 0);
          try{
            const didFire = CA.Weapons.fireCharged(u, wid, plan.power);
            // CONTRACT: firing an ability sets its cooldown. core only DECREMENTS
            // cooldowns at turn start, so we set it here defensively (idempotent —
            // only when the ability fired and isn't already on cooldown).
            if(w && w.ability && (w.cooldown||0) > 0){
              u.cooldowns = u.cooldowns || {};
              // turns-left until ready again (core decrements at each of this
              // hero's turn starts). Only set if the key is MISSING — setCooldown
              // legitimately stores 0 when the hero's CDR fully cancels it, and
              // overwriting that re-imposed the full unreduced cooldown.
              if(!(wid in u.cooldowns)) u.cooldowns[wid] = w.cooldown;
            }
            // P4: kill the ~4s AI dead-air. A damaging shot makes core enter the
            // RETREAT phase + cap turnTimer to RETREAT_TIME (=4s); but the AI does
            // nothing further, so every AI shot is followed by 4s of the timer
            // draining before endTurn fires — brutal in AI-vs-AI. For AI teams
            // ONLY, shorten that retreat wait to ~0.6s. This does NOT cut off
            // projectile resolution: the timer only drains while phase is
            // AIM/RETREAT, and once endTurn fires the turn advances via
            // worldSettled()/_pendingFrames (with the 110-frame hard fallback), so
            // a live projectile still flies + resolves before the next team acts.
            // Human retreat is untouched (this branch only runs on an AI turn).
            {
              var _cur2 = S.teams[S.currentTeamIdx];
              if(_cur2 && _cur2.isAI && S.firedThisTurn){
                S.turnTimer = Math.min(S.turnTimer, 0.6);
              }
            }
            // SUPPORT FOLLOW-UP: after a non-damaging support, re-plan a weapon
            // shot from here and fire it THIS turn (guarded to run at most once so
            // it can never loop/softlock). If no good shot exists, end the turn.
            if(!endsTurn && isSupport && !plan.didFollowUp){
              const t=plan.team, lvl=(plan.level!=null)?plan.level:1, pp=plan.persona;
              let next=null;
              // only follow up if the actor is still in control (alive + game live).
              if(u.alive && (!CA.canControl || CA.canControl()) && !S.firedThisTurn){
                next=planWeaponShot(u, t, lvl, pp, false /*no ability*/, true /*no walk*/);
              }
              if(next){
                next.persona=pp;
                next.didFollowUp=true;     // never chain a second follow-up
                plan=next;                  // resume aim→fire with the attack
                return;
              }
              CA.endTurn();                 // no shot available -> end cleanly
            }
            // other non-turn-ending weapons (melee/bat/already-attacked): the simple
            // AI has no further follow-up, so end the turn explicitly.
            else if(!endsTurn) CA.endTurn();
            // FIZZLE GUARD: an endsTurn ability that DIDN'T actually fire (e.g.
            // revive with no dead ally) won't run onFired → the turn would hang
            // until the 45s timer. fireCharged returns `false` only for
            // out-of-ammo / on-cooldown / not-allowed; a GENUINE fizzle returns
            // `undefined`, so the old `didFire===false` missed it. Gate on "did
            // NOT fire" instead, and use !S.firedThisTurn as the proof of a real
            // shot: a successful damaging weapon (incl. bazooka/shotgun, which
            // also return undefined) sets firedThisTurn via onFired, so this never
            // double-ends a turn that already fired.
            else if(didFire !== true && !S.firedThisTurn) CA.endTurn();
          }
          catch(e){ CA.endTurn(); }
        }
        plan=null;
        return;
      }
    }
  };
})();
