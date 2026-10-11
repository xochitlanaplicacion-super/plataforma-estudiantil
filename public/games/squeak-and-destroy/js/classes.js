/* ============================================================================
 * CUTE ANIMALS — classes.js  ::  CA.Classes  (v4 CLASS-HERO SYSTEM)
 * ----------------------------------------------------------------------------
 * Each unit is a HERO of a CLASS: an animal with a passive, 3 abilities and an
 * upgradeable skill tree. Cute-spooky theme. This file OWNS CA.Classes and the
 * per-class draw OVERLAY that entities.js layers on top of the species art.
 *
 * SHARED v4 CONTRACT (see contract.js):
 *   CA.Classes[id] = { id, name, animal, verb, color, baseHp,
 *     passive, passiveDesc, abilities:[weaponId...],
 *     tree:[{id,name,desc,max,apply(unit,rank)}], draw?(ctx,u,a) }
 *   CA.Classes.list() / CA.classOf(u) already exist in contract.js.
 *
 * SIX classes (id → animal):
 *   'necro'    🦇 Denevér / Nekromanta / "Summon"
 *   'guardian' 🐹 Capybara / Védő (Tank) / "Shield"
 *   'mage'     🦉 Bagoly   / Mágus / "Elements"
 *   'hunter'   🦅 Sólyom   / Vadász (Sniper) / "Precision"
 *   'engineer' 🦫 Hód      / Mérnök (Builder) / "Build"
 *   'healer'   🐨 Koala    / Gyógyító (Support) / "Support"
 *
 * SKILL-TREE NODES set readable unit-fields other agents/modules consume:
 *   unit._minionBonus  (+ minions summoned)
 *   unit._minionHpMul  (× minion maxHp)
 *   unit._zoneBonus    (+ aura/zone radius scale, 1=base)
 *   unit._zoneTurns    (+ extra turns on zones/auras)
 *   unit._cdr          (- turns off ability cooldowns)
 *   unit._dmgMul       (× ability damage)
 *   unit._critBonus    (+ crit chance, 0..1)
 *   unit._chargeMul    (× aim-charge speed)
 *   unit.shieldBase    (flat shield refreshed each turn)
 *   unit._buildHpMul   (× built structure / turret maxHp)
 *   unit._healMul      (× heal value)
 *   unit._reviveCost   (× revive cost)
 *   unit.maxHp / unit.hp  (bumped directly by +maxHP nodes)
 * Everything is best-effort & never throws.
 * ==========================================================================*/
(function(){
  'use strict';
  var TWO_PI = Math.PI*2;

  /* ---- English translations for every user-facing class string (names,
   *      passives, skill-tree node names + descriptions). Keys must match the
   *      Hungarian literals used below EXACTLY. ---- */
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    // class names
    'Nekromanta':'Necromancer', 'Védő':'Guardian', 'Mágus':'Mage',
    'Vadász':'Hunter', 'Mérnök':'Engineer', 'Gyógyító':'Healer',
    // passive descriptions
    'Élőhalott-úr — az általa idézett csontvázak és zombik tovább élnek a pályán.':
      'Undead lord — the skeletons and zombies he summons linger longer on the map.',
    'Páncélos — minden bejövő sebzésből keveset elnyel, és sok életereje van.':
      'Armored — absorbs a little of all incoming damage and has lots of health.',
    'Elemkovács — az elemi képességei (tűz/fagy/villám) több sebzést okoznak.':
      'Elementalist — his elemental abilities (fire/frost/lightning) deal more damage.',
    'Mesterlövész — alap eséllyel kritikus találatot ad, és pontosan céloz.':
      'Sharpshooter — has a base chance to crit and aims precisely.',
    'Építőmester — a lerakott falai, csapdái és tornyai erősebbek.':
      'Master builder — his deployed walls, traps and turrets are stronger.',
    'Támogató — a közelében álló szövetségesek a kör elején keveset regenerálódnak.':
      'Support — allies standing near him regenerate a little at the start of the turn.',
    // skill-tree node names
    '+1 csontváz':'+1 Skeleton', 'Erős mininok':'Tough Minions',
    'Lélek-robbanás +sugár':'Soul Burst +radius', 'Idézés cooldown -1':'Summon cooldown -1',
    '+pajzs':'+Shield', 'Földrengés +sugár':'Earthquake +radius',
    '+maxHP':'+max HP', 'Provokáció cooldown -1':'Taunt cooldown -1',
    'Elemi +sebzés':'Elemental +damage', 'Zóna +időtartam':'Zone +duration',
    'Zóna +sugár':'Zone +radius', 'Varázs cooldown -1':'Spell cooldown -1',
    '+krit esély':'+Crit chance', 'Töltés gyorsabb':'Faster charge',
    'Lövés +sebzés':'Shot +damage', 'Cél-jelölés cooldown -1':'Mark target cooldown -1',
    'Épület +HP':'Building +HP', 'Torony +sebzés':'Turret +damage',
    'Csapda +sugár':'Trap +radius', 'Építés cooldown -1':'Build cooldown -1',
    'Gyógyítás +érték':'Healing +value', 'Aura +sugár':'Aura +radius',
    'Aura +időtartam':'Aura +duration', 'Élesztés olcsóbb':'Cheaper revive',
    // skill-tree node descriptions
    'Idézésenként eggyel több minion jelenik meg.':'One more minion appears per summon.',
    'A minionjaid +25% életerőt kapnak rangonként.':'Your minions gain +25% health per rank.',
    'A minionok halálakor robbanó lélek-energia nagyobb sugarú.':
      'The soul energy that bursts when minions die has a larger radius.',
    'Az idéző képességek újratöltése rangonként 1 körrel rövidebb.':
      'Summoning abilities recharge 1 turn faster per rank.',
    'A körönként megújuló alap-pajzs +12 ponttal nő rangonként.':
      'The shield refreshed each turn grows by +12 points per rank.',
    'A földrengés (ground slam) lökéshulláma nagyobb sugarú.':
      'The ground slam shockwave has a larger radius.',
    'Maximális életerő +25 rangonként.':'Maximum health +25 per rank.',
    'A taunt/provokáció gyorsabban tölthető újra.':'Taunt recharges faster.',
    'Minden elemi képesség +20% sebzést okoz rangonként.':
      'Every elemental ability deals +20% damage per rank.',
    'A fagy/tűz zónák rangonként +1 körrel tovább maradnak.':
      'Frost/fire zones last +1 turn longer per rank.',
    'Az elemi zónák és a frost nova nagyobb sugarúak.':
      'Elemental zones and the frost nova have a larger radius.',
    'Az elemi képességek újratöltése rangonként 1 körrel rövidebb.':
      'Elemental abilities recharge 1 turn faster per rank.',
    'Kritikus találat esélye +12% rangonként.':'Critical hit chance +12% per rank.',
    'A töltött lövés (charged shot) gyorsabban éri el a teljes erőt.':
      'The charged shot reaches full power faster.',
    'A célzott lövések +15% sebzést okoznak rangonként.':'Aimed shots deal +15% damage per rank.',
    'A mark target gyorsabban tölthető újra.':'Mark target recharges faster.',
    'A felépített falak és tornyok +30% életerőt kapnak rangonként.':
      'Built walls and turrets gain +30% health per rank.',
    'A lerakott tornyok +20% sebzést okoznak rangonként.':
      'Deployed turrets deal +20% damage per rank.',
    'A lerakott csapdák és aknák nagyobb hatósugarúak.':
      'Deployed traps and mines have a larger radius.',
    'Az építő képességek újratöltése rangonként 1 körrel rövidebb.':
      'Building abilities recharge 1 turn faster per rank.',
    'A gyógyítás +25% életerőt ad vissza rangonként.':'Healing restores +25% more health per rank.',
    'A buff/gyógyító aura nagyobb sugarú.':'The buff/heal aura has a larger radius.',
    'A buff aura rangonként +1 körrel tovább tart.':'The buff aura lasts +1 turn longer per rank.',
    'Az élesztés (revive) költsége rangonként -25%.':'Revive cost -25% per rank.',
  });

  /* ---- shared field-init helper: ensures the readable flags exist so nodes
   *      can ADD onto them idempotently. Safe to call on any unit. ---- */
  function ensureFields(u){
    if(!u) return;
    if(u._minionBonus  == null) u._minionBonus  = 0;
    if(u._minionHpMul  == null) u._minionHpMul  = 1;
    if(u._zoneBonus    == null) u._zoneBonus    = 1;
    if(u._zoneTurns    == null) u._zoneTurns    = 0;
    if(u._cdr          == null) u._cdr          = 0;
    if(u._dmgMul       == null) u._dmgMul       = 1;
    if(u._critBonus    == null) u._critBonus    = 0;
    if(u._chargeMul    == null) u._chargeMul    = 1;
    if(u.shieldBase    == null) u.shieldBase    = 0;
    if(u._buildHpMul   == null) u._buildHpMul   = 1;
    if(u._healMul      == null) u._healMul      = 1;
    if(u._reviveCost   == null) u._reviveCost   = 1;
  }
  // expose for other modules that (re)build a unit's class fields
  CA.Classes._ensureFields = ensureFields;

  /* small guard wrapper so a bad node never breaks spawning/leveling */
  function safeApply(fn){
    return function(u, rank){ try{ ensureFields(u); fn(u, rank||1); }catch(e){} };
  }

  /* ======================================================================
   * CLASS-DRAW OVERLAYS
   * Each returns nothing; draws in entities' local unit space (origin = centre,
   * already mirrored/scaled). entities.js should call CA.classOf(u).draw(ctx,u,a)
   * AFTER the species body so these sit on top. All guarded, never throw.
   * ==================================================================== */
  var R = function(){ return (CA.config && CA.config.UNIT_R) || 16; };

  // soft pulsing aura ring used by several classes
  function aura(ctx, u, color, scale){
    var r = R(); var t = (u.anim && u.anim.t) || 0;
    var puls = 1 + Math.sin(t*2.2)*0.06;
    ctx.save();
    ctx.globalAlpha = 0.18;
    var g = ctx.createRadialGradient(0, R()*0.1, r*0.4, 0, R()*0.1, r*(scale||1.7)*puls);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, r*0.1, r*(scale||1.7)*puls, 0, TWO_PI); ctx.fill();
    ctx.restore();
  }

  // 🦇 NECRO — floating soul-wisp + purple aura
  function drawNecro(ctx, u, a){
    try{
      var r = R(); var t=(u.anim&&u.anim.t)||0;
      aura(ctx, u, 'rgba(150,80,210,0.9)', 1.8);
      // floating little skull/soul wisp above the head
      var bob = Math.sin(t*2.0)*r*0.12;
      var sx = -r*0.7, sy = -r*1.25 + bob;
      ctx.save();
      ctx.globalAlpha = 0.92;
      // wisp trail
      ctx.fillStyle = 'rgba(180,120,240,0.35)';
      ctx.beginPath(); ctx.ellipse(sx, sy+r*0.3, r*0.16, r*0.3, 0,0,TWO_PI); ctx.fill();
      // skull
      ctx.fillStyle = '#efe9f6';
      ctx.beginPath(); ctx.arc(sx, sy, r*0.24, 0, TWO_PI); ctx.fill();
      ctx.fillRect(sx-r*0.16, sy, r*0.32, r*0.18);
      // eye sockets glow
      ctx.fillStyle = '#8a3fd0';
      ctx.beginPath(); ctx.arc(sx-r*0.09, sy-r*0.02, r*0.06, 0, TWO_PI); ctx.fill();
      ctx.beginPath(); ctx.arc(sx+r*0.09, sy-r*0.02, r*0.06, 0, TWO_PI); ctx.fill();
      ctx.restore();
    }catch(e){}
  }

  // 🐹 GUARDIAN — shield emblem
  function drawGuardian(ctx, u, a){
    try{
      var r = R();
      // glow if the hero currently has shield up
      if((u.shield||0) > 0) aura(ctx, u, 'rgba(120,200,255,0.9)', 1.6);
      ctx.save();
      var sx = r*0.6, sy = r*0.06;
      // shield body
      ctx.fillStyle = '#cfd8e6'; ctx.strokeStyle = '#3a5878'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy - r*0.42);
      ctx.lineTo(sx + r*0.34, sy - r*0.28);
      ctx.lineTo(sx + r*0.34, sy + r*0.12);
      ctx.quadraticCurveTo(sx, sy + r*0.5, sx - r*0.34, sy + r*0.12);
      ctx.lineTo(sx - r*0.34, sy - r*0.28);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // cross emblem
      ctx.strokeStyle = '#3a5878'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sy-r*0.26); ctx.lineTo(sx, sy+r*0.22);
      ctx.moveTo(sx-r*0.22, sy-r*0.04); ctx.lineTo(sx+r*0.22, sy-r*0.04); ctx.stroke();
      ctx.restore();
    }catch(e){}
  }

  // 🦉 MAGE — tiny wizard hat + sparkle
  function drawMage(ctx, u, a){
    try{
      var r = R(); var t=(u.anim&&u.anim.t)||0;
      ctx.save();
      // wizard hat sitting between the ear tufts
      var hx = 0, hy = -r*0.78;
      ctx.fillStyle = '#3a2c6a';
      ctx.beginPath();
      ctx.moveTo(hx, hy - r*0.85);
      ctx.lineTo(hx + r*0.5, hy + r*0.18);
      ctx.lineTo(hx - r*0.5, hy + r*0.18);
      ctx.closePath(); ctx.fill();
      // hat brim
      ctx.fillStyle = '#2a2050';
      ctx.beginPath(); ctx.ellipse(hx, hy + r*0.2, r*0.6, r*0.16, 0, 0, TWO_PI); ctx.fill();
      // hat band + star
      ctx.fillStyle = '#f3c948';
      ctx.fillRect(hx - r*0.34, hy - r*0.02, r*0.68, r*0.12);
      // bent tip
      ctx.fillStyle = '#3a2c6a';
      ctx.beginPath(); ctx.arc(hx, hy - r*0.85, r*0.08, 0, TWO_PI); ctx.fill();
      // sparkles
      var sp = (Math.sin(t*3)+1)*0.5;
      ctx.fillStyle = 'rgba(255,240,160,' + (0.5 + sp*0.5) + ')';
      star(ctx, hx + r*0.55, hy - r*0.3, r*0.12*(0.6+sp*0.5));
      ctx.fillStyle = 'rgba(180,220,255,' + (0.4 + (1-sp)*0.5) + ')';
      star(ctx, hx - r*0.55, hy + r*0.05, r*0.1*(0.6+(1-sp)*0.5));
      ctx.restore();
    }catch(e){}
  }
  function star(ctx, cx, cy, rad){
    ctx.beginPath();
    for(var i=0;i<4;i++){
      var ang = i*(Math.PI/2);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang)*rad, cy + Math.sin(ang)*rad);
    }
    ctx.lineWidth = Math.max(1, rad*0.5);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();
  }

  // 🦅 HUNTER — sleek feather crest
  function drawHunter(ctx, u, a){
    try{
      var r = R();
      ctx.save();
      // feather crest sweeping back from the head
      ctx.fillStyle = '#c0392b'; ctx.strokeStyle = '#7a2018'; ctx.lineWidth = 1;
      var bx = -r*0.1, by = -r*0.55;
      [0, 1, 2].forEach(function(i){
        ctx.beginPath();
        ctx.moveTo(bx - i*r*0.18, by - i*r*0.04);
        ctx.quadraticCurveTo(bx - i*r*0.4 - r*0.3, by - r*0.55,
                             bx - i*r*0.18 - r*0.45, by - r*0.2);
        ctx.quadraticCurveTo(bx - i*r*0.3, by + r*0.02, bx - i*r*0.18, by);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      });
      // mark-target reticle glow if a target is marked this turn
      if(u._marked || (u.buffs && u.buffs.some && u.buffs.some(function(b){return b&&b.type==='mark';}))){
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, r*0.1, r*1.3, 0, TWO_PI); ctx.stroke();
      }
      ctx.restore();
    }catch(e){}
  }

  // 🦫 ENGINEER — hard-hat + wrench vibe
  function drawEngineer(ctx, u, a){
    try{
      var r = R();
      ctx.save();
      // hard hat over the head
      var hx = r*0.5, hy = -r*0.72;
      ctx.fillStyle = '#f2b21a'; ctx.strokeStyle = '#b07e08'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx, hy, r*0.46, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillRect(hx - r*0.5, hy - r*0.02, r*1.0, r*0.1);
      // hat ridge
      ctx.strokeStyle = '#b07e08'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(hx, hy - r*0.46); ctx.lineTo(hx, hy); ctx.stroke();
      // little wrench in front
      ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = r*0.14;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r*0.85, r*0.0); ctx.lineTo(r*1.15, r*0.35); ctx.stroke();
      ctx.fillStyle = '#9aa3ad';
      ctx.beginPath(); ctx.arc(r*0.82, -r*0.06, r*0.16, 0, TWO_PI); ctx.fill();
      ctx.lineCap = 'butt';
      ctx.restore();
    }catch(e){}
  }

  // 🐨 HEALER — soft glow + floating heart aura
  function drawHealer(ctx, u, a){
    try{
      var r = R(); var t=(u.anim&&u.anim.t)||0;
      aura(ctx, u, 'rgba(120,240,170,0.9)', 1.7);
      // floating hearts
      ctx.save();
      for(var i=0;i<2;i++){
        var ph = t*1.4 + i*Math.PI;
        var hx = (i? r*0.8 : -r*0.8) + Math.sin(ph)*r*0.1;
        var hy = -r*0.9 - ((ph*0.4)% (r*0.5));
        var al = 0.5 + 0.4*Math.sin(ph*1.3);
        ctx.globalAlpha = Math.max(0.15, al);
        ctx.fillStyle = '#ff9bb6';
        heart(ctx, hx, hy, r*0.16);
      }
      ctx.restore();
    }catch(e){}
  }
  function heart(ctx, cx, cy, s){
    ctx.beginPath();
    ctx.moveTo(cx, cy + s*0.4);
    ctx.bezierCurveTo(cx + s, cy - s*0.4, cx + s*0.5, cy - s, cx, cy - s*0.3);
    ctx.bezierCurveTo(cx - s*0.5, cy - s, cx - s, cy - s*0.4, cx, cy + s*0.4);
    ctx.closePath(); ctx.fill();
  }

  /* ======================================================================
   * THE SIX CLASSES
   * ==================================================================== */

  CA.Classes.necro = {
    id:'necro', name:'Nekromanta', animal:'bat', verb:'Summon',
    color:'#9650d8', baseHp:95, moveMul:1.0,
    passive:'summon',
    passiveDesc:'Élőhalott-úr — az általa idézett csontvázak és zombik tovább élnek a pályán.',
    abilities:['summon_skeleton','summon_zombie','bone_spear'],
    tree:[
      { id:'extra_skeleton', name:'+1 csontváz', max:2,
        desc:'Idézésenként eggyel több minion jelenik meg.',
        apply: safeApply(function(u, rank){ u._minionBonus += rank; }) },
      { id:'tough_minions', name:'Erős mininok', max:3,
        desc:'A minionjaid +25% életerőt kapnak rangonként.',
        apply: safeApply(function(u, rank){ u._minionHpMul = 1 + 0.25*rank; }) },
      { id:'soul_burst', name:'Lélek-robbanás +sugár', max:2,
        desc:'A minionok halálakor robbanó lélek-energia nagyobb sugarú.',
        apply: safeApply(function(u, rank){ u._zoneBonus = 1 + 0.25*rank; }) },
      { id:'dark_focus', name:'Idézés cooldown -1', max:2,
        desc:'Az idéző képességek újratöltése rangonként 1 körrel rövidebb.',
        apply: safeApply(function(u, rank){ u._cdr += rank; }) },
    ],
    draw: drawNecro,
  };

  CA.Classes.guardian = {
    id:'guardian', name:'Védő', animal:'capybara', verb:'Shield',
    color:'#4f8fd8', baseHp:130, moveMul:0.86,
    passive:'tanky',
    passiveDesc:'Páncélos — minden bejövő sebzésből keveset elnyel, és sok életereje van.',
    abilities:['shield_wall','ground_slam','taunt'],
    tree:[
      { id:'bigger_shield', name:'+pajzs', max:3,
        desc:'A körönként megújuló alap-pajzs +12 ponttal nő rangonként.',
        apply: safeApply(function(u, rank){ u.shieldBase += 12*rank; }) },
      { id:'quake_radius', name:'Földrengés +sugár', max:2,
        desc:'A földrengés (ground slam) lökéshulláma nagyobb sugarú.',
        apply: safeApply(function(u, rank){ u._zoneBonus = 1 + 0.3*rank; }) },
      { id:'fortify_hp', name:'+maxHP', max:3,
        desc:'Maximális életerő +25 rangonként.',
        apply: safeApply(function(u, rank){ u.maxHp = (u.maxHp||0) + 25*rank; if(u.hp!=null) u.hp += 25*rank; }) },
      { id:'iron_will', name:'Provokáció cooldown -1', max:1,
        desc:'A taunt/provokáció gyorsabban tölthető újra.',
        apply: safeApply(function(u, rank){ u._cdr += rank; }) },
    ],
    draw: drawGuardian,
  };

  CA.Classes.mage = {
    id:'mage', name:'Mágus', animal:'owl', verb:'Elements',
    color:'#7a5fe0', baseHp:95, moveMul:1.05,
    passive:'mage',
    passiveDesc:'Elemkovács — az elemi képességei (tűz/fagy/villám) több sebzést okoznak.',
    abilities:['fireball','frost_nova','chain_lightning'],
    tree:[
      { id:'elemental_power', name:'Elemi +sebzés', max:3,
        desc:'Minden elemi képesség +20% sebzést okoz rangonként.',
        apply: safeApply(function(u, rank){ u._dmgMul = 1 + 0.2*rank; }) },
      { id:'lingering_zone', name:'Zóna +időtartam', max:2,
        desc:'A fagy/tűz zónák rangonként +1 körrel tovább maradnak.',
        apply: safeApply(function(u, rank){ u._zoneTurns += rank; }) },
      { id:'wide_nova', name:'Zóna +sugár', max:2,
        desc:'Az elemi zónák és a frost nova nagyobb sugarúak.',
        apply: safeApply(function(u, rank){ u._zoneBonus = 1 + 0.22*rank; }) },
      { id:'arcane_haste', name:'Varázs cooldown -1', max:2,
        desc:'Az elemi képességek újratöltése rangonként 1 körrel rövidebb.',
        apply: safeApply(function(u, rank){ u._cdr += rank; }) },
    ],
    draw: drawMage,
  };

  CA.Classes.hunter = {
    id:'hunter', name:'Vadász', animal:'bird', verb:'Precision',
    color:'#d8714f', baseHp:90, moveMul:1.18,
    passive:'sniper',
    passiveDesc:'Mesterlövész — alap eséllyel kritikus találatot ad, és pontosan céloz.',
    abilities:['charged_shot','mark_target','multishot'],
    tree:[
      { id:'crit_chance', name:'+krit esély', max:3,
        desc:'Kritikus találat esélye +12% rangonként.',
        apply: safeApply(function(u, rank){ u._critBonus = Math.min(0.9, 0.12*rank); }) },
      { id:'fast_charge', name:'Töltés gyorsabb', max:2,
        desc:'A töltött lövés (charged shot) gyorsabban éri el a teljes erőt.',
        apply: safeApply(function(u, rank){ u._chargeMul = 1 + 0.25*rank; }) },
      { id:'piercing', name:'Lövés +sebzés', max:2,
        desc:'A célzott lövések +15% sebzést okoznak rangonként.',
        apply: safeApply(function(u, rank){ u._dmgMul = 1 + 0.15*rank; }) },
      { id:'eagle_eye', name:'Cél-jelölés cooldown -1', max:1,
        desc:'A mark target gyorsabban tölthető újra.',
        apply: safeApply(function(u, rank){ u._cdr += rank; }) },
    ],
    draw: drawHunter,
  };

  CA.Classes.engineer = {
    id:'engineer', name:'Mérnök', animal:'beaver', verb:'Build',
    color:'#e0a23a', baseHp:105, moveMul:0.9,
    passive:'build',
    passiveDesc:'Építőmester — a lerakott falai, csapdái és tornyai erősebbek.',
    abilities:['build_wall','deploy_turret','place_trap'],
    tree:[
      { id:'reinforced', name:'Épület +HP', max:3,
        desc:'A felépített falak és tornyok +30% életerőt kapnak rangonként.',
        apply: safeApply(function(u, rank){ u._buildHpMul = 1 + 0.3*rank; }) },
      { id:'turret_power', name:'Torony +sebzés', max:3,
        desc:'A lerakott tornyok +20% sebzést okoznak rangonként.',
        apply: safeApply(function(u, rank){ u._dmgMul = 1 + 0.2*rank; }) },
      { id:'bigger_trap', name:'Csapda +sugár', max:2,
        desc:'A lerakott csapdák és aknák nagyobb hatósugarúak.',
        apply: safeApply(function(u, rank){ u._zoneBonus = 1 + 0.25*rank; }) },
      { id:'overclock', name:'Építés cooldown -1', max:2,
        desc:'Az építő képességek újratöltése rangonként 1 körrel rövidebb.',
        apply: safeApply(function(u, rank){ u._cdr += rank; }) },
    ],
    draw: drawEngineer,
  };

  CA.Classes.healer = {
    id:'healer', name:'Gyógyító', animal:'koala', verb:'Support',
    color:'#46c98a', baseHp:90, moveMul:1.15,
    passive:'support',
    passiveDesc:'Támogató — a közelében álló szövetségesek a kör elején keveset regenerálódnak.',
    abilities:['heal_beam','buff_aura','revive'],
    tree:[
      { id:'greater_heal', name:'Gyógyítás +érték', max:3,
        desc:'A gyógyítás +25% életerőt ad vissza rangonként.',
        apply: safeApply(function(u, rank){ u._healMul = 1 + 0.25*rank; }) },
      { id:'wide_aura', name:'Aura +sugár', max:2,
        desc:'A buff/gyógyító aura nagyobb sugarú.',
        apply: safeApply(function(u, rank){ u._zoneBonus = 1 + 0.3*rank; }) },
      { id:'lasting_aura', name:'Aura +időtartam', max:2,
        desc:'A buff aura rangonként +1 körrel tovább tart.',
        apply: safeApply(function(u, rank){ u._zoneTurns += rank; }) },
      { id:'cheap_revive', name:'Élesztés olcsóbb', max:2,
        desc:'Az élesztés (revive) költsége rangonként -25%.',
        apply: safeApply(function(u, rank){ u._reviveCost = Math.max(0.25, 1 - 0.25*rank); }) },
    ],
    draw: drawHealer,
  };

  /* ---- generic class-overlay dispatcher: entities.js can call this once after
   *      drawing the species body. Resolves via CA.classOf(u) and runs draw. ---- */
  CA.Classes.drawOverlay = function(ctx, u, a){
    try{
      var c = CA.classOf(u);
      if(c && typeof c.draw === 'function') c.draw(ctx, u, a || (u && u.anim) || {});
    }catch(e){}
  };

  /* ---- helper: apply ALL of a unit's learned skill-tree ranks. Other agents
   *      (spawn/level code) may call this; reads unit.skills = {nodeId:rank}. ---- */
  CA.Classes.applyTree = function(u){
    try{
      ensureFields(u);
      var c = CA.classOf(u); if(!c || !c.tree) return;
      var skills = u.skills || {};
      for(var i=0;i<c.tree.length;i++){
        var node = c.tree[i];
        var rank = skills[node.id] || 0;
        if(rank > 0 && typeof node.apply === 'function') node.apply(u, rank);
      }
    }catch(e){}
  };

  /* ---- helper: resolve the species/animal id a class hero should render as.
   *      entities.js uses this to pick the species draw before the overlay. ---- */
  CA.Classes.animalOf = function(u){
    // v4.3: render as the unit's TEAM SPECIES first (single-species teams); the
    // class animal is only a fallback for class-only contexts.
    var c = CA.classOf(u);
    return (u && (u.species || u.kind)) || (c && c.animal) || null;
  };

  /* ---- DEMO helper: the class ids selectable in the demo build. Returns the
   *      full registry unless demo-locked, then intersects with CA.DEMO_CLASSES.
   *      Pickers (menu) call this; CA.Classes.list() itself stays unrestricted. */
  CA.Classes.demoList = function(){
    try{
      var all = CA.Classes.list();
      if(!(CA.demoLocked && CA.demoLocked()) || !Array.isArray(CA.DEMO_CLASSES)) return all;
      var sub = all.filter(function(id){ return CA.DEMO_CLASSES.indexOf(id) >= 0; });
      return sub.length ? sub : all;   // defensive: never return an empty picker
    }catch(e){ return CA.Classes.list(); }
  };

  CA.Classes.init = function(){};
})();
