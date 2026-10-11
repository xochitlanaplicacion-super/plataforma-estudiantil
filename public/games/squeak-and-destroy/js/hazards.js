/* ============================================================================
 * CUTE ANIMALS — hazards.js  ::  CA.Hazards  (Agent Arsenal)
 * ----------------------------------------------------------------------------
 * Features #12 (terjedő tűz/napalm, mérgező felhő), #14 (aknák/csapdák).
 * Lives in CA.state.hazards = [ {kind, x, y, r, life, ...} ].
 *
 * IMPLEMENT on CA.Hazards (EXACT):
 *   init()
 *   add(kind, x, y, opts)   -> spawn a hazard. kinds:
 *        'fire'  : burns, SPREADS to nearby flammable ground over time, damages
 *                  units in radius each tick, dies out after a while. Leaves
 *                  scorch. (napalm = many fire seeds.)
 *        'poison': a gas cloud that drifts/expands, damages units inside per
 *                  tick (small), fades.
 *        'mine'  : armed proximity mine sitting on terrain; when a unit comes
 *                  near (not the owner, after a short arm delay) -> CA.explode.
 *        'barrel': explosive prop placed by World; chain-detonates via CA.explode
 *                  when a nearby explosion happens or it takes blast.
 *   update(dt)   -> tick all hazards: fire spread (check CA.Terrain.isSolid to
 *                  only spread on ground; you may lightly scorch via CA.Terrain
 *                  but do NOT carve big holes), per-tick damage via
 *                  CA.Entities.damage / CA.explode for mines, lifetime/cull.
 *                  Spawn FX via CA.FX.spawnParticles (guard it).
 *   render(ctx)  -> draw hazards in WORLD space (camera already applied):
 *                  flickering flames, translucent gas, blinking mine, barrel.
 *
 * DAMAGE: continuous hazards (fire/poison) call CA.Entities.damage(unit, dmg)
 * directly for per-tick damage (NOT CA.explode, to avoid terrain carving every
 * frame). Mines detonate via CA.explode(x,y,r,dmg,kb) once.
 * Weapons.js spawns these (napalm shell -> several 'fire'; gas grenade ->
 * 'poison'; mine weapon -> 'mine'). Keep performance sane (cap counts).
 * ==========================================================================*/
(function(){
  const C=CA.config, S=CA.state, U=CA.util;

  /* hard caps for perf */
  const CAP = { fire:48, poison:40, mine:24, barrel:40 };

  /* per-unit DoT (fire/poison) throttle. Without this, fire damaged a unit EVERY
   * frame (~66 dmg/s for ONE seed) and overlapping napalm seeds STACKED → death in
   * 1-2 ticks. Now a unit takes at most one DoT tick per DOT_TICK_FRAMES, no matter
   * how many overlapping seeds it stands in. */
  const DOT_TICK_FRAMES = 8;   // ~7.5 ticks/sec
  const FIRE_TICK   = 1.8;     // ~13.5 dmg/sec in fire
  const POISON_TICK = 1.1;     // ~8 dmg/sec in poison gas

  function ent(){ return CA.Entities; }
  function fx(){ return CA.FX; }
  function solid(x,y){ return CA.Terrain && CA.Terrain.isSolid && CA.Terrain.isSolid(x,y); }
  function heightAt(x){ return (CA.Terrain && CA.Terrain.heightAt) ? CA.Terrain.heightAt(x) : C.WATER_LEVEL; }

  function countKind(kind){
    let n=0; for(const h of S.hazards) if(h.kind===kind) n++; return n;
  }

  function spawnFX(o){ if(fx() && fx().spawnParticles) fx().spawnParticles(o); }

  /* spawn a single hazard object with sane defaults per-kind */
  function make(kind, x, y, opts){
    opts = opts||{};
    const base = { id:U.nextId(), kind, x, y, alive:true };
    if(kind==='fire'){
      Object.assign(base, {
        r: opts.r!=null?opts.r:20,
        life: opts.life!=null?opts.life:U.randInt(120,180), // frames
        maxLife: 0,
        dmg: opts.dmg!=null?opts.dmg:1.1,    // per-tick (scaled by dt)
        spreadCd: U.randInt(10,26),          // frames until it tries to spread
        gens: opts.gens!=null?opts.gens:3,   // remaining spread generations
        flick: Math.random()*6.28,
      });
      base.maxLife = base.life;
    } else if(kind==='poison'){
      Object.assign(base, {
        r: opts.r!=null?opts.r:26,
        rMax: opts.rMax!=null?opts.rMax:64,
        life: opts.life!=null?opts.life:200,
        maxLife: 0,
        dmg: opts.dmg!=null?opts.dmg:0.5,
        drift: opts.drift!=null?opts.drift:0,
        t: Math.random()*6.28,
      });
      base.maxLife = base.life;
    } else if(kind==='mine'){
      Object.assign(base, {
        r: opts.r!=null?opts.r:42,           // explosion radius
        trig: opts.trig!=null?opts.trig:34,  // proximity trigger distance
        dmg: opts.dmg!=null?opts.dmg:48,
        kb: opts.kb!=null?opts.kb:1.3,
        ownerId: opts.ownerId!=null?opts.ownerId:null,
        arm: opts.arm!=null?opts.arm:40,     // frames until armed
        life: opts.life!=null?opts.life:99999,
        fuse: null,                          // set when triggered (tiny delay)
        blink: 0,
      });
    } else if(kind==='barrel'){
      Object.assign(base, {
        r: opts.r!=null?opts.r:78,           // explosion radius (big)
        dmg: opts.dmg!=null?opts.dmg:60,
        kb: opts.kb!=null?opts.kb:1.5,
        hp: opts.hp!=null?opts.hp:1,
        life: opts.life!=null?opts.life:99999,
        fuse: null,                          // tiny delay once triggered for chains
      });
    } else {
      Object.assign(base, { r:opts.r||24, life:opts.life||120 });
    }
    return base;
  }

  function detonateMine(h){
    h.alive=false;
    CA.explode(h.x, h.y, h.r, h.dmg, h.kb);
  }
  function detonateBarrel(h){
    h.alive=false;
    CA.explode(h.x, h.y, h.r, h.dmg, h.kb);
  }

  /* ----- LÁNCREAKCIÓ (chain reaction / domino) -----------------------------
   * Any explosion that overlaps an ARMED barrel or mine queues it to detonate
   * on a SHORT delay so the chain visibly ripples. Each detonation re-emits the
   * 'explosion' event (via CA.explode), which re-enters this handler and chains
   * further. Guards:
   *   - mark each hazard `chaining` once so it can't be re-queued / double-blow,
   *   - cap detonations PER FRAME (chainBudget) so a dense field can't spike,
   *   - cap re-entrancy depth so a pathological emit-loop can never recurse
   *     unbounded. Anything over budget simply waits for the next frame's
   *     fuse tick (still ripples, just paced).                                */
  let chainBudget = 0;        // detonations allowed to be queued this frame
  let chainDepth  = 0;        // re-entrancy guard for the event handler
  const CHAIN_BUDGET_PER_FRAME = 12;
  const CHAIN_MAX_DEPTH = 24;

  function chainFromBlast(x, y, radius){
    if(chainDepth > CHAIN_MAX_DEPTH) return;
    chainDepth++;
    try{
      const H = S.hazards;
      if(!H || !H.length) return;
      const r = (typeof radius==='number' && radius>0) ? radius : 0;
      for(let i=0;i<H.length;i++){
        const h = H[i];
        if(!h || !h.alive || h.chaining) continue;
        if(h.kind!=='barrel' && h.kind!=='mine') continue;
        if(h.fuse!=null) continue;          // already counting down
        if(h.kind==='mine' && h.arm>0) continue; // unarmed mine isn't live yet
        const d = U.dist(x, y, h.x, h.y);
        if(d < r + 26){
          if(chainBudget <= 0) continue;    // out of budget this frame -> next tick
          chainBudget--;
          h.chaining = true;
          // short, slightly staggered fuse (frames) so the ripple reads
          h.fuse = U.rand(0.05, 0.20);
          spawnFX({x:h.x, y:h.y-4, count:2, spdMin:0.3, spdMax:1.2, life:12, size:3, color:'#fd6'});
        }
      }
    } catch(e){ /* never throw out of an event handler */ }
    chainDepth--;
  }

  CA.events.on('explosion', (x,y,radius)=>{ chainFromBlast(x,y,radius); });

  CA.Hazards = {
    init(){
      CA.state.hazards = CA.state.hazards || [];
      CA.state.hazards.length = 0;
    },

    add(kind, x, y, opts){
      if(!CA.state.hazards) CA.state.hazards = [];
      const cap = CAP[kind] || 60;
      if(countKind(kind) >= cap){
        // recycle the oldest of this kind to stay within cap
        for(let i=0;i<S.hazards.length;i++){ if(S.hazards[i].kind===kind){ S.hazards.splice(i,1); break; } }
      }
      const h = make(kind, x, y, opts);
      S.hazards.push(h);
      if(kind==='fire')  spawnFX({x, y:y-2, count:4, spdMin:0.4, spdMax:1.6, life:16, size:3, color:'#fb3'});
      if(kind==='poison')spawnFX({x, y, count:5, spdMin:0.3, spdMax:1.2, life:24, size:4, color:'#8d5'});
      return h;
    },

    update(dt){
      const k = dt || 1;
      // refill the per-frame chain-detonation budget so a dense barrel/mine
      // field ripples over several frames instead of all blowing at once.
      chainBudget = CHAIN_BUDGET_PER_FRAME;
      chainDepth = 0;
      // tick down each unit's DoT (fire/poison) cooldown once per frame
      if(S.units){ for(let _i=0;_i<S.units.length;_i++){ const _u=S.units[_i]; if(_u && _u._dotCd>0) _u._dotCd -= k; } }
      const H = S.hazards;
      if(!H || !H.length) return;

      for(let i=0;i<H.length;i++){
        const h=H[i];
        if(!h.alive) continue;

        if(h.kind==='fire'){
          // water puts fire OUT: if the flame is at/below the (dynamic) water
          // surface, extinguish it with a little puff of steam.
          var _wl = (S.waterLevel!=null ? S.waterLevel : C.WATER_LEVEL);
          if(h.y >= _wl - 2){
            h.alive=false;
            spawnFX({x:h.x, y:_wl-2, count:5, spdMin:0.3, spdMax:1.1, life:22, size:U.rand(3,5), color:'#cdd'});
            continue;
          }
          h.life -= k;
          h.flick += 0.4*k;
          // per-tick damage to units within radius
          for(const u of S.units){
            if(!u.alive) continue;
            if(U.dist(h.x,h.y,u.x,u.y) < h.r + C.UNIT_R*0.6){
              if((u._dotCd||0)<=0){ if(ent() && ent().damage) ent().damage(u, FIRE_TICK, 'fire'); u._dotCd = DOT_TICK_FRAMES; }
            }
          }
          // flame particles
          if((S.frame & 3)===0) spawnFX({x:h.x+U.rand(-4,4), y:h.y-2, count:1, spdMin:0.4, spdMax:1.4, life:14, size:U.rand(2,4), color:(S.frame&8)?'#fb3':'#f72'});
          // spread along ground
          h.spreadCd -= k;
          if(h.spreadCd<=0 && h.gens>0 && countKind('fire')<CAP.fire-2){
            h.spreadCd = U.randInt(14,30);
            const dir = Math.random()<0.5?-1:1;
            const nx = h.x + dir*U.rand(14,24);
            // find ground surface near nx and seed there if there's flammable ground
            const gy = heightAt(nx);
            if(gy < _wl && solid(nx, gy+3)){
              const seed = make('fire', nx, gy-4, { gens:h.gens-1, life:U.randInt(90,150), r:U.randInt(16,22) });
              H.push(seed);
            } else {
              h.gens--; // nowhere to spread that way
            }
          }
          if(h.life<=0){
            h.alive=false;
            // light scorch (very small carve) — optional & guarded
            if(CA.Terrain && CA.Terrain.destroy && Math.random()<0.25) CA.Terrain.destroy(h.x, h.y, 5);
          }
          continue;
        }

        if(h.kind==='poison'){
          h.life -= k;
          h.t += 0.05*k;
          // expand then drift slightly with wind
          if(h.r < h.rMax) h.r += 0.25*k;
          h.x += (h.drift + (S.wind||0)*0.3) * k;
          // gentle per-tick damage to units inside
          for(const u of S.units){
            if(!u.alive) continue;
            if(U.dist(h.x,h.y,u.x,u.y) < h.r){
              if((u._dotCd||0)<=0){ if(ent() && ent().damage) ent().damage(u, POISON_TICK, 'poison'); u._dotCd = DOT_TICK_FRAMES; }
            }
          }
          if((S.frame & 5)===0) spawnFX({x:h.x+U.rand(-h.r*0.5,h.r*0.5), y:h.y+U.rand(-h.r*0.4,h.r*0.4), count:1, spdMin:0.1, spdMax:0.6, life:30, size:U.rand(4,7), color:'#9e6'});
          if(h.life<=0) h.alive=false;
          continue;
        }

        // QA P2: akna/hordó NE lebegjen a levegőben, ha kirobbant alóla a talaj —
        // essen le az új felszínre (a ládák ugyanezt a fixet már megkapták).
        if(h.kind==='mine' || h.kind==='barrel'){
          const _hr = (h.kind==='barrel') ? 14 : 6;
          if(!solid(h.x, h.y + _hr + 2)){
            h._vy = Math.min(8, (h._vy||0) + 0.5*k);
            h.y += h._vy*k;
            if(h.prop) h.prop.y = h.y + 14;   // a rajzolt hordó-prop kövesse
            const _wlh = (S.waterLevel!=null ? S.waterLevel : C.WATER_LEVEL);
            if(h.y >= _wlh + 10){              // mély vízbe esett → csendben elmerül
              h.alive=false;
              if(h.prop) h.prop._dead = true;
              spawnFX({x:h.x, y:_wlh, count:6, spdMin:0.5, spdMax:1.6, life:20, size:3, color:'#bfe6ff'});
              continue;
            }
          } else if(h._vy){ h._vy = 0; }
        }

        if(h.kind==='mine'){
          if(h.fuse!=null){
            h.fuse -= (1/60)*k;
            h.blink += 0.6*k;
            if(h.fuse<=0) detonateMine(h);
            continue;
          }
          if(h.arm>0){ h.arm -= k; h.blink += 0.15*k; continue; }
          h.blink += 0.3*k;
          // QA3 #4 — proximity TRIGGER ignores the owner's whole TEAM, not just
          // the exact owner unit (a teammate walking over your mine no longer sets
          // it off). Resolve the owner's team from the owner unit; enemies still
          // trigger it. (The blast radius below still hits everyone in range.)
          let ownerTeam = null;
          if(h.ownerId!=null && CA.getUnit){
            const ow = CA.getUnit(h.ownerId);
            if(ow) ownerTeam = ow.teamId;
          }
          for(const u of S.units){
            if(!u.alive) continue;
            if(h.ownerId!=null && u.id===h.ownerId) continue;
            if(ownerTeam!=null && u.teamId===ownerTeam) continue;
            if(U.dist(h.x,h.y,u.x,u.y) < h.trig + C.UNIT_R){
              h.fuse = 0.18; // brief beep before boom
              CA.events.emit('sfx','tick');
              break;
            }
          }
          continue;
        }

        if(h.kind==='barrel'){
          if(h.fuse!=null){
            h.fuse -= (1/60)*k;
            if(h.fuse<=0) detonateBarrel(h);
          }
          continue;
        }

        // unknown kind: just age out
        if(h.life!=null){ h.life-=k; if(h.life<=0) h.alive=false; }
      }

      S.hazards = H.filter(h=>h.alive);
    },

    render(ctx){
      const H = S.hazards;
      if(!H || !H.length) return;
      const low = CA.settings && CA.settings.quality==='low';

      for(const h of H){
        if(!h.alive) continue;

        if(h.kind==='fire'){
          const fade = U.clamp(h.life/Math.max(1,h.maxLife),0,1);
          // animated flame SPRITE (25-frame 5x5 sheet, black bg -> additive). Each
          // patch flickers on its own phase. Enabled on ALL quality tiers (one
          // cached drawImage is cheaper than the procedural flame paths); falls
          // back to the procedural twin-flame only until the sheet has loaded.
          // `?v=` cache-busts past any stale/404 cache from a mid-deploy load.
          const sheet = CA.img ? CA.img('assets/fx/fire5x5.png?v='+(CA.ASSET_V||'1')) : null;
          if(sheet){
            const FS = sheet.naturalWidth/5;            // frame W (5x5 grid)
            const FH = (sheet.naturalHeight/5)||FS;     // frame H (defensive if sheet isn't square)
            if(h._fp==null) h._fp = (Math.abs((h.x|0)*131+(h.y|0)*17)%25); // per-fire phase
            const fr = (((S.frame>>1) + h._fp) % 25 + 25) % 25;
            const col = fr%5, row = (fr/5)|0;
            const w = h.r*2.6, ht = h.r*3.0;            // flame is taller than wide
            ctx.save();
            ctx.globalAlpha = U.clamp(0.65*fade + 0.35, 0, 1);
            ctx.globalCompositeOperation = 'lighter';   // black bg vanishes, flame glows
            ctx.drawImage(sheet, col*FS, row*FH, FS, FH, h.x-w/2, h.y+4-ht, w, ht);
            ctx.restore();
            continue;
          }
          const wob = Math.sin(h.flick)*3;
          ctx.save();
          ctx.globalAlpha = 0.55*fade + 0.35;
          ctx.globalCompositeOperation = low ? 'source-over' : 'lighter';
          // outer flame
          ctx.fillStyle = '#f63';
          ctx.beginPath();
          ctx.moveTo(h.x-h.r*0.55, h.y+3);
          ctx.quadraticCurveTo(h.x-h.r*0.4, h.y-h.r*0.7+wob, h.x, h.y-h.r-Math.abs(wob));
          ctx.quadraticCurveTo(h.x+h.r*0.4, h.y-h.r*0.7-wob, h.x+h.r*0.55, h.y+3);
          ctx.closePath(); ctx.fill();
          // inner core
          ctx.fillStyle = '#fd6';
          ctx.beginPath();
          ctx.moveTo(h.x-h.r*0.3, h.y+2);
          ctx.quadraticCurveTo(h.x, h.y-h.r*0.6+wob, h.x, h.y-h.r*0.8);
          ctx.quadraticCurveTo(h.x, h.y-h.r*0.6-wob, h.x+h.r*0.3, h.y+2);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          continue;
        }

        if(h.kind==='poison'){
          const fade = U.clamp(h.life/Math.max(1,h.maxLife),0,1);
          ctx.save();
          ctx.globalAlpha = 0.22*fade + 0.06;
          ctx.fillStyle = '#7c3';
          for(let b=0;b<4;b++){
            const a = h.t + b*1.6;
            const ox = Math.cos(a)*h.r*0.4, oy = Math.sin(a*1.3)*h.r*0.3;
            ctx.beginPath(); ctx.arc(h.x+ox, h.y+oy, h.r*0.7, 0, 7); ctx.fill();
          }
          ctx.restore();
          continue;
        }

        if(h.kind==='mine'){
          const armed = h.arm<=0;
          const on = (Math.sin(h.blink*3)>0);
          ctx.save();
          // body
          ctx.fillStyle = '#444';
          ctx.beginPath(); ctx.arc(h.x, h.y, 7, 0, 7); ctx.fill();
          // spikes
          ctx.strokeStyle='#666'; ctx.lineWidth=2;
          for(let s=0;s<6;s++){ const a=s/6*6.28; ctx.beginPath(); ctx.moveTo(h.x+Math.cos(a)*6,h.y+Math.sin(a)*6); ctx.lineTo(h.x+Math.cos(a)*10,h.y+Math.sin(a)*10); ctx.stroke(); }
          // blinking light
          ctx.fillStyle = (h.fuse!=null) ? (on?'#f00':'#900') : (armed ? (on?'#f33':'#511') : '#5af');
          ctx.beginPath(); ctx.arc(h.x, h.y-2, 2.4, 0, 7); ctx.fill();
          ctx.restore();
          continue;
        }

        if(h.kind==='barrel'){
          ctx.save();
          ctx.translate(h.x, h.y);
          // barrel body
          ctx.fillStyle = '#b33';
          ctx.beginPath(); ctx.moveTo(-9,-13); ctx.lineTo(9,-13); ctx.lineTo(9,13); ctx.lineTo(-9,13); ctx.closePath(); ctx.fill();
          ctx.fillStyle='#822';
          ctx.fillRect(-9,-5,18,3); ctx.fillRect(-9,3,18,3);
          // hazard mark
          ctx.fillStyle = (h.fuse!=null && (S.frame&4)) ? '#ff0' : '#fc0';
          ctx.beginPath(); ctx.arc(0,-3,4,0,7); ctx.fill();
          ctx.fillStyle='#b33';
          ctx.beginPath(); ctx.arc(0,-3,1.6,0,7); ctx.fill();
          ctx.restore();
          continue;
        }
      }
    },
  };
})();
