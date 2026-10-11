/* ============================================================================
 * Squeak & Destroy — TEAM EDITOR submenu (DOM).
 * Registers screen id 'teamedit'. A custom-team builder: pick up to 5 heroes
 * (each shown as a LIVE PORTRAIT and customizable by species + class +
 * cosmetic/"helmet"), name the team, choose logo/color/banner/voice, mark one
 * unit as TEAM CAPTAIN, save/load/delete to localStorage 'ca_teams', and launch
 * a match vs the AI.
 *
 * Persistence schema (localStorage key 'ca_teams'):
 *   [ { tid:String, name:String, logo:String, color:String, banner:String,
 *       voiceBank:String, captain:Number(unit index, default 0),
 *       units:[ { uid:String, species:String, cls:classId, name:String,
 *                 cosmetic:String|null } ] (≤5) } ]
 *
 *   - `tid` (team id) + each `uid` (unit id) are STABLE unique strings. They are
 *     backfilled (never regenerated) on load AND on save — per-animal XP/skill
 *     progression in the engine is keyed to them, so regenerating would orphan
 *     a unit's progress. New teams/units get a fresh id once and keep it.
 *   - `captain` is an index into `units` (0-based, clamped, default 0). The
 *     captain is purely identity for now (gold star on the portrait) — NO
 *     gameplay perk is attached yet.
 *
 * Portraits: CA.Entities.renderPortrait(canvasEl,{species,cls,cosmetic,captain,
 * color}) draws a faithful static portrait. We keep a small 84×84 canvas per
 * unit and re-call it after any species/class/cosmetic/captain change so the
 * roster live-refreshes.
 *
 * Cosmetics: owned ids come from CA.Meta.cosmetics(); display name/rarity from
 * CA.Meta.COSMETIC_CATALOG[id] = { name, price, rarity }. The chosen cosmetic id
 * is stored as `unit.cosmetic`; the renderer honours `uspec.cosmetic` at spawn.
 *
 * Plays nicely with the v4 CLASS-HERO system (CA.Classes). If classes are not
 * loaded yet, shows a friendly note instead of crashing. Self-contained: only
 * uses the menu-framework API handed to build() + CA.Classes + CA.Entities +
 * CA.newGame.
 * ==========================================================================*/
(function(){
  'use strict';

  if (window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Csapat szerkesztő':'Team editor',
    'Csapat neve':'Team name',
    'Az osztályok még töltődnek…':'Classes are still loading…',
    'Egységek (max 5)':'Units (max 5)',
    'Egység':'Unit',
    'Egység neve':'Unit name',
    '💾 Mentés':'💾 Save',
    '🗑️ Törlés':'🗑️ Delete',
    'Biztos? ✓':'Sure? ✓',
    'Biztos? ✗':'Sure? ✗',
    'Csapat törölve':'Team deleted',
    'Adj nevet a csapatnak!':'Give the team a name!',
    '➕ Új csapat':'➕ New team',
    '👥 Csapataim':'👥 My teams',
    'Mentett csapatok':'Saved teams',
    '✏️ Szerkeszt':'✏️ Edit',
    'Még nincs mentett csapat. Építsd meg az elsőt lent!':'No saved teams yet. Build your first one below!',
    'Még nincs mentett csapat.':'No saved teams yet.',
    'Csapatépítő':'Team builder',
    'tag':'members',
    'Névtelen csapat':'Unnamed team',
    'Adj nevet a csapatnak a mentéshez.':'Give the team a name to save it.',
    'Csapat mentve':'Team saved',
    'egység':'units',
    'Csapat logó':'Team logo',
    'Osztály':'Class',
    'Csapat':'Team',
    'Csapatszín':'Team color',
    'Zászló':'Banner',
    'Hangbank':'Voice bank',
    'Kinézet':'Cosmetic',
    'Faj':'Species',
    '👑 Kapitány':'👑 Captain',
    'Kapitány':'Captain',
    'Nincs':'None',
    'Nincs birtokolt kinézet.':'No owned cosmetics.',
    // species HU names
    'Kapibara':'Capybara', 'Kukac':'Worm', 'Sün':'Hedgehog', 'Béka':'Frog',
    'Madár':'Bird', 'Bagoly':'Owl', 'Koala':'Koala', 'Denevér':'Bat', 'Hód':'Beaver',
    // rarities
    'Közönséges':'Common',
    'Ritka':'Rare',
    'Epikus':'Epic',
    'Legendás':'Legendary',
  });

  var STORE = 'ca_teams';
  var MAX_UNITS = 5;

  // Pick-list of team-logo emojis (~12).
  var TEAM_LOGOS = ['⚔️','🛡️','🔥','💀','🐹','🦊','⭐','👑','🍀','🌶️','⚡','🎯'];
  var DEFAULT_LOGO = TEAM_LOGOS[0];

  // Team color swatches (hex). First is the default.
  var TEAM_COLORS = ['#E8711A','#36A2EB','#34C759','#FF3B30','#AF52DE','#FFD60A','#FF6FB5','#8E8E93'];
  var DEFAULT_COLOR = TEAM_COLORS[0];

  // Team banner / flag emoji set (cheap, no assets).
  var TEAM_BANNERS = ['🏳️','🏴','🚩','🎌','🏁','🏴‍☠️','🟧','🟦','🟩','🟥','🟪','🟨'];
  var DEFAULT_BANNER = TEAM_BANNERS[0];

  // Voice-bank ids (id-only; no audio assets wired yet). label is shown to the user.
  var VOICE_BANKS = [
    { id:'default', label:'🎙️ Default' },
    { id:'squeaky', label:'🐹 Squeaky' },
    { id:'gruff',   label:'🐻 Gruff' },
    { id:'robot',   label:'🤖 Robot' },
    { id:'silent',  label:'🤐 Silent' }
  ];
  var DEFAULT_VOICE = VOICE_BANKS[0].id;

  // Rarity → HU label (translated via i18n) + accent color for the chip border.
  var RARITY_LABEL = { common:'Közönséges', rare:'Ritka', epic:'Epikus', legendary:'Legendás' };
  var RARITY_COLOR = { common:'#8E8E93', rare:'#36A2EB', epic:'#AF52DE', legendary:'#FFD60A' };

  // ---- cosmetics (guarded — CA.Meta may be absent or partial) --------------
  function ownedCosmetics(){
    try{
      var fn = (CA.Meta && CA.Meta.cosmetics);
      var a = (typeof fn==='function') ? fn() : null;
      return Array.isArray(a) ? a : [];
    }catch(e){ return []; }
  }
  function cosmeticMeta(id){
    var cat = (CA.Meta && CA.Meta.COSMETIC_CATALOG) || {};
    var d = (id && cat[id]) || {};
    var rarity = d.rarity || 'common';
    return {
      id: id,
      name: d.name || id || '?',
      rarity: rarity,
      rLabel: RARITY_LABEL[rarity] || rarity,
      rColor: RARITY_COLOR[rarity] || RARITY_COLOR.common
    };
  }

  // ---- species (per-unit; the game supports mixed-species teams) -----------
  // The 9 spawnable species ids + HU labels (translated via i18n).
  var SPECIES = [
    { id:'capybara', label:'Kapibara' },
    { id:'worm',     label:'Kukac' },
    { id:'hedgehog', label:'Sün' },
    { id:'frog',     label:'Béka' },
    { id:'bird',     label:'Madár' },
    { id:'owl',      label:'Bagoly' },
    { id:'koala',    label:'Koala' },
    { id:'bat',      label:'Denevér' },
    { id:'beaver',   label:'Hód' },
    { id:'fox',      label:'Róka' },
    { id:'cat',      label:'Macska' },
    { id:'penguin',  label:'Pingvin' }
  ];
  var SPECIES_IDS = SPECIES.map(function(s){ return s.id; });
  var DEFAULT_SPECIES = SPECIES_IDS[0];
  function speciesLabel(id){
    for(var i=0;i<SPECIES.length;i++){ if(SPECIES[i].id===id) return SPECIES[i].label; }
    return id||'?';
  }

  // Class id → big emoji. CA.Classes[id].animal is a SPECIES id (bat/owl/…),
  // not an emoji, so we map species → emoji (and class id → emoji as a fallback).
  // worm 🪱 + beaver 🦫 render as tofu/stripes in some fonts → use the widely-
  // supported glyphs (🐛 caterpillar, 🦦 otter) the rest of the menu uses.
  var SPECIES_EMOJI = { bat:'🦇', capybara:'🐹', owl:'🦉', bird:'🦅', beaver:'🦦', koala:'🐨', worm:'🐛', hedgehog:'🦔', frog:'🐸', fox:'🦊', cat:'🐱', penguin:'🐧' };
  var CLASS_EMOJI   = { necro:'🦇', guardian:'🛡️', mage:'🦉', hunter:'🦅', engineer:'🦫', healer:'🐨' };
  // Class id → short animal hint (HU label of the underlying species).
  var ANIMAL_HINT   = { bat:'denevér', capybara:'kapibara', owl:'bagoly', bird:'madár', beaver:'hód', koala:'koala' };

  // ---- stable ids ----------------------------------------------------------
  // tid/uid must be STABLE & unique; engine keys per-animal XP/skills to them.
  // NEVER regenerate an existing id — only mint one when it is missing.
  function newTid(){ return 't_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
  function newUid(){ return 'u_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

  // ---- persistence ---------------------------------------------------------
  function loadTeams(){
    var a;
    try{ var raw=localStorage.getItem(STORE); a=raw?JSON.parse(raw):[];
      if(!Array.isArray(a)) a=[]; }catch(e){ a=[]; }
    // backfill missing stable ids + captain on load (and persist if we changed
    // anything, so old saves are upgraded in place exactly once).
    var changed=false;
    a.forEach(function(team){
      if(!team) return;
      if(!team.tid){ team.tid=newTid(); changed=true; }
      var units=(team.units&&team.units.length)?team.units:(team.units=[]);
      units.forEach(function(u){
        if(!u) return;
        if(!u.uid){ u.uid=newUid(); changed=true; }
      });
      // captain: default 0, clamp into units range.
      var cap=(typeof team.captain==='number')?team.captain:0;
      if(units.length===0) cap=0;
      else if(cap<0||cap>=units.length) cap=0;
      if(team.captain!==cap){ team.captain=cap; changed=true; }
    });
    if(changed) saveTeams(a);
    return a;
  }
  function saveTeams(list){
    try{ localStorage.setItem(STORE, JSON.stringify(list||[])); }catch(e){}
  }

  // ---- portrait ------------------------------------------------------------
  // Draw a unit's live portrait via the engine helper. Re-called after every
  // species/class/cosmetic/captain change so the roster refreshes in place.
  // NOTE: actual painting goes through PortraitAnim (see below) so portraits
  // ANIMATE in place (idle "breathing" bob/sway) instead of being static.
  function paintPortrait(canvas, u, isCaptain){
    if(!canvas) return;
    PortraitAnim.register(canvas, {
      species: function(){ return u.species||DEFAULT_SPECIES; },
      cls:     function(){ return u.cls||null; },
      cosmetic:function(){ return u.cosmetic||null; },
      captain: function(){ return !!isCaptain; },
      color:   function(){ return draft.color||DEFAULT_COLOR; }
    });
  }

  // ---- shared portrait ANIMATOR --------------------------------------------
  // CA.Entities.renderPortrait draws a STATIC frame (it bakes anim.t:0). We can
  // not (and must not) edit entities.js, so we animate from the OUTSIDE: a single
  // requestAnimationFrame loop re-renders every currently-mounted portrait canvas
  // each frame, applying a cheap time-based idle transform (a subtle vertical
  // "breathing" bob + tiny scale pulse + sway) around the canvas centre BEFORE
  // calling renderPortrait. One rAF loop for the whole screen; only canvases that
  // are still in the DOM and visible are drawn; the loop is torn down in onHide so
  // it never leaks across screen changes. Honours prefers-reduced-motion (and the
  // in-game reducedMotion setting) by drawing a single static frame instead.
  function makePortraitAnimator(){
    var entries = [];        // { canvas, spec } — spec values are getter fns
    var raf = 0;
    var t0 = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();

    function reducedMotion(){
      if(CA.settings && CA.settings.reducedMotion) return true;
      try{ if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; }catch(e){}
      return false;
    }
    function nowMs(){ return (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now(); }
    function visible(cv){ return cv && cv.isConnected !== false && cv.offsetParent !== null; }

    // draw ONE portrait. `time` is seconds since start; `phase` desyncs each tile
    // so a roster doesn't bob in lockstep. When reduced, no transform is applied.
    function drawOne(e, time, phase, reduced){
      var cv = e.canvas;
      var ctx = cv.getContext && cv.getContext('2d');
      if(!ctx) return;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,cv.width,cv.height);
      if(!reduced){
        var cx = cv.width/2, cy = cv.height/2;
        var tt = time*2.0 + phase;
        var bob   = Math.sin(tt) * (cv.height*0.022);          // vertical breathing
        var sway  = Math.sin(tt*0.5 + phase) * 0.015;          // tiny horizontal sway (radians-ish skew via translate)
        var pulse = 1 + Math.sin(tt) * 0.012;                  // gentle scale pulse
        ctx.translate(cx, cy + bob);
        ctx.scale(pulse, pulse);
        ctx.translate(-cx + sway*cv.width, -cy);
      }
      try{
        var fn = CA.Entities && CA.Entities.renderPortrait;
        if(typeof fn==='function'){
          // renderPortrait does its own per-stage save/restore and an internal
          // clearRect; our base transform stays active for its draws, giving the
          // bob/scale/sway around the canvas centre. Decorative — never throw up.
          fn(cv, {
            species: e.spec.species(),
            cls:     e.spec.cls(),
            cosmetic:e.spec.cosmetic(),
            captain: e.spec.captain(),
            color:   e.spec.color()
          });
        }
      }catch(err){ /* portrait is decorative — never break the editor */ }
      ctx.setTransform(1,0,0,1,0,0);
    }

    function frame(){
      raf = 0;
      var reduced = reducedMotion();
      var time = (nowMs()-t0)/1000;
      // prune entries whose canvas left the DOM for good (renderUnits/rebuild
      // swap cards out frequently); this keeps the array from growing unbounded.
      var kept = [];
      for(var i=0;i<entries.length;i++){
        var e = entries[i];
        if(e.canvas.isConnected === false) continue;   // detached → forget it
        kept.push(e);
      }
      entries = kept;
      for(var j=0;j<entries.length;j++){
        var en = entries[j];
        if(!visible(en.canvas)) continue;   // attached but hidden → skip drawing
        drawOne(en, time, (j%7)*0.9, reduced);
      }
      // keep looping while we still have at least one tracked canvas AND motion is
      // wanted; if reduced, one static pass per registration is enough.
      if(entries.length && !reduced) raf = requestAnimationFrame(frame);
    }

    return {
      // register a canvas + its (getter-based) spec. Drawn immediately, then by
      // the loop. Re-registering the same canvas updates its spec in place.
      register: function(canvas, spec){
        if(!canvas) return;
        var found = null;
        for(var i=0;i<entries.length;i++){ if(entries[i].canvas===canvas){ found=entries[i]; break; } }
        if(found){ found.spec = spec; }
        else { entries.push({ canvas:canvas, spec:spec }); }
        // paint at least one frame right away (covers the reduced-motion case).
        var reduced = reducedMotion();
        var idx = found ? entries.indexOf(found) : (entries.length-1);
        drawOne(entries[idx], (nowMs()-t0)/1000, (idx%7)*0.9, reduced);
        if(!reduced && !raf) raf = requestAnimationFrame(frame);
      },
      // drop all tracked canvases (called before a full re-render so we never
      // animate orphaned/detached canvases).
      clear: function(){ entries = []; },
      // hard stop — cancel the loop and forget everything (onHide teardown).
      stop: function(){ if(raf){ cancelAnimationFrame(raf); raf=0; } entries = []; }
    };
  }
  var PortraitAnim = makePortraitAnimator();

  // ---- class helpers (guarded — CA.Classes may be empty at first) ----------
  function classIds(){
    try{ return (CA.Classes && CA.Classes.list) ? (CA.Classes.list()||[]) : []; }
    catch(e){ return []; }
  }
  function classMeta(id){
    var d=(CA.Classes && CA.Classes[id]) || {};
    var animal = d.animal||'';
    var emoji = CLASS_EMOJI[id] || SPECIES_EMOJI[animal] || '🐾';
    return {
      id: id,
      animal: animal,
      emoji: emoji,
      name: d.name||id||'?',
      hint: ANIMAL_HINT[animal] || animal || '',
      verb: d.verb||''
    };
  }

  // ---- working draft -------------------------------------------------------
  // draft.units holds ≤MAX_UNITS {uid,species,cls,name,cosmetic}. draft.tid is a
  // stable team id; draft.captain is an index into units (default 0).
  var draft = freshDraft();
  // Refs to the live name field + its inline error node (set during rebuild).
  // doSave() surfaces a missing-name error here instead of a native alert().
  var nameFieldRef = null;
  var nameErrRef = null;
  // TOP TAB state (Jani): 'saved' = Csapataim (saved list) · 'build' = Új csapat
  // (builder). Default to the saved list so the editor opens on your teams.
  var teTab = 'saved';
  function freshUnit(cls, sp){
    return { uid:newUid(), species:(sp||DEFAULT_SPECIES), cls:(cls||classIds()[0]||null), name:'', cosmetic:null };
  }
  function freshDraft(){
    var ids=classIds();
    var sp=DEFAULT_SPECIES;          // ONE species per team (Jani) — team-level now
    var units=[];
    var n = ids.length ? 3 : 0;   // start with a sensible 3 if classes ready
    for(var i=0;i<n;i++) units.push(freshUnit(ids[i % ids.length], sp));
    return { tid:newTid(), name:'', species:sp, logo:DEFAULT_LOGO, color:DEFAULT_COLOR, banner:DEFAULT_BANNER, voiceBank:DEFAULT_VOICE, captain:0, units:units };
  }
  function loadDraftFrom(team){
    var units = ((team && team.units) || []).slice(0, MAX_UNITS).map(function(u){
      return {
        // preserve the unit's stable id; mint one only if missing.
        uid: (u && u.uid) || newUid(),
        species: (u && u.species) || DEFAULT_SPECIES,
        cls: (u && u.cls) || (classIds()[0]||null),
        name:(u && u.name)||'',
        cosmetic: (u && u.cosmetic) || null
      };
    });
    var cap = (team && typeof team.captain==='number') ? team.captain : 0;
    if(units.length===0) cap=0; else if(cap<0||cap>=units.length) cap=0;
    // ONE species per team (Jani): derive the team species from the saved team
    // (explicit field, else the first unit) and NORMALISE every unit to it — so a
    // legacy mixed-species save is unified on load.
    var teamSp = (team && team.species) || (units[0] && units[0].species) || DEFAULT_SPECIES;
    units.forEach(function(u){ u.species = teamSp; });
    draft = {
      // preserve the team's stable id; mint one only if missing.
      tid: (team && team.tid) || newTid(),
      name: (team && team.name) || '',
      species: teamSp,
      logo: (team && team.logo) || DEFAULT_LOGO,
      color: (team && team.color) || DEFAULT_COLOR,
      banner: (team && team.banner) || DEFAULT_BANNER,
      voiceBank: (team && team.voiceBank) || DEFAULT_VOICE,
      captain: cap,
      units: units
    };
  }

  // ---- build ---------------------------------------------------------------
  function build(API){
    var built = API.screen('👥','Csapat szerkesztő');
    var screen = built.screen, body = built.body;

    function render(){ rebuild(API, body); }

    // onShow rebuilds (and restarts the portrait loop); onHide tears the rAF loop
    // down so it never leaks across screen changes.
    return {
      el:screen,
      onShow: function(){ render(); },
      onHide: function(){ PortraitAnim.stop(); }
    };
  }

  function rebuild(API, body){
    var el=API.el, esc=API.esc, t=API.t, btn=API.btn, chip=API.chip;
    // a full re-render detaches every old portrait canvas — drop them from the
    // animator so it never re-renders orphaned nodes (fresh ones re-register).
    PortraitAnim.clear();
    body.innerHTML='';

    var ids = classIds();

    // ---- identity panel: logo banner + name + logo picker ----
    var p = API.panel();

    // big logo + name banner at the top
    var banner = el('div','row');
    banner.style.alignItems='center';
    banner.style.gap='var(--s3)';
    var logoBig = el('div',null, esc(draft.logo||DEFAULT_LOGO));
    logoBig.style.fontSize='40px';
    logoBig.style.lineHeight='1';
    logoBig.style.width='56px';
    logoBig.style.height='56px';
    logoBig.style.display='flex';
    logoBig.style.alignItems='center';
    logoBig.style.justifyContent='center';
    logoBig.style.borderRadius='var(--r2)';
    logoBig.style.background='rgba(255,255,255,.06)';
    logoBig.style.border='1px solid var(--border)';
    logoBig.style.flex='0 0 auto';
    var bannerName = el('div',null,'<strong>'+esc((draft.name||'').trim()||t('Névtelen csapat'))+'</strong>');
    bannerName.style.fontSize='18px';
    banner.append(logoBig, bannerName);
    p.append(banner);

    // ---- team name field ----
    var nameSec = el('div','section');
    nameSec.append(el('h3',null,'<span data-t="Csapat neve">'+esc(t('Csapat neve'))+'</span>'));
    var nameField = API.field('');
    nameField.input.maxLength = 18;   // QA P2: a HUD/név-pill 18 karakterre méretezett
    nameField.input.value = draft.name||'';
    nameField.input.placeholder = t('Névtelen csapat');
    // inline field error (replaces the old native alert() on save with no name).
    var nameErr = el('div', null, '');
    nameErr.style.cssText = 'color:var(--red,#FF3B30);font-size:0.82em;margin-top:4px;min-height:1em;display:none;';
    nameField.input.oninput = function(){
      draft.name = nameField.input.value;
      bannerName.innerHTML='<strong>'+esc((draft.name||'').trim()||t('Névtelen csapat'))+'</strong>';
      // clear the inline error as soon as the user starts typing a name.
      if(nameErr.style.display!=='none' && (draft.name||'').trim()){
        nameErr.style.display='none'; nameErr.textContent='';
      }
    };
    nameSec.append(nameField);
    nameSec.append(nameErr);
    p.append(nameSec);
    // expose for doSave() (re-set on every rebuild so it always points at the live node).
    nameFieldRef = nameField;
    nameErrRef = nameErr;

    // ---- TEAM SPECIES (ONE per team — Jani) ----------------------------------
    // The whole team is one species; each unit only picks its CLASS below. Changing
    // it here applies the species to EVERY unit and refreshes their portraits.
    var tspSec = el('div','section');
    tspSec.append(el('h3',null,'<span data-t="Faj">'+esc(t('Faj'))+'</span>'));
    var tspGrid = el('div','opt-grid');
    tspGrid.style.cssText += ';padding-left:4px;padding-right:4px;margin-left:-4px;margin-right:-4px;';
    SPECIES.forEach(function(sp){
      var on=(draft.species===sp.id);
      var sc=chip(esc(SPECIES_EMOJI[sp.id]||'🐾')+' <span data-t="'+esc(sp.label)+'">'+esc(t(sp.label))+'</span>', on, function(){
        draft.species = sp.id;
        draft.units.forEach(function(u){ u.species = sp.id; });  // whole team follows
        rebuild(API, body);                                       // refresh chips + portraits
      });
      sc.classList.add('chip--grid');
      tspGrid.append(sc);
    });
    tspSec.append(tspGrid);
    p.append(tspSec);

    // ---- team logo picker ----
    var logoSec = el('div','section');
    logoSec.append(el('h3',null,'<span data-t="Csapat logó">'+esc(t('Csapat logó'))+'</span>'));
    var logoChips = el('div','chips');
    TEAM_LOGOS.forEach(function(lg){
      var on = (draft.logo||DEFAULT_LOGO)===lg;
      var c = chip(esc(lg), on, function(){
        draft.logo = lg;
        logoBig.innerHTML = esc(lg);
        // refresh selected state across the row
        logoChips.querySelectorAll('.chip').forEach(function(x){ x.classList.remove('sel'); });
        c.classList.add('sel');
      });
      c.style.fontSize='20px';
      c.style.minWidth='44px';
      c.style.justifyContent='center';
      logoChips.append(c);
    });
    logoSec.append(logoChips);
    p.append(logoSec);

    // ---- team color picker ----
    var colorSec = el('div','section');
    colorSec.append(el('h3',null,'<span data-t="Csapatszín">'+esc(t('Csapatszín'))+'</span>'));
    var colorChips = el('div','chips');
    function paintBanner(){
      var col = draft.color||DEFAULT_COLOR;
      logoBig.style.border='2px solid '+col;
      logoBig.style.boxShadow='0 0 0 2px rgba(0,0,0,.25) inset';
    }
    TEAM_COLORS.forEach(function(col){
      var on = (draft.color||DEFAULT_COLOR)===col;
      var c = chip('', on, function(){
        draft.color = col;
        colorChips.querySelectorAll('.chip').forEach(function(x){ x.classList.remove('sel'); });
        c.classList.add('sel');
        paintBanner();
        // team color feeds the portraits — refresh the whole roster.
        if(typeof refreshAllPortraits==='function') refreshAllPortraits();
      });
      c.style.minWidth='36px';
      c.style.height='32px';
      c.style.background=col;
      c.style.borderColor='rgba(255,255,255,.35)';
      colorChips.append(c);
    });
    colorSec.append(colorChips);
    p.append(colorSec);
    paintBanner();

    // ---- team banner / flag picker ----
    var bannerSec = el('div','section');
    bannerSec.append(el('h3',null,'<span data-t="Zászló">'+esc(t('Zászló'))+'</span>'));
    var bannerChips = el('div','chips');
    TEAM_BANNERS.forEach(function(bn){
      var on = (draft.banner||DEFAULT_BANNER)===bn;
      var c = chip(esc(bn), on, function(){
        draft.banner = bn;
        bannerChips.querySelectorAll('.chip').forEach(function(x){ x.classList.remove('sel'); });
        c.classList.add('sel');
      });
      c.style.fontSize='20px';
      c.style.minWidth='44px';
      c.style.justifyContent='center';
      bannerChips.append(c);
    });
    bannerSec.append(bannerChips);
    p.append(bannerSec);

    // ---- voice-bank picker (id only) ----
    var voiceSec = el('div','section');
    voiceSec.append(el('h3',null,'<span data-t="Hangbank">'+esc(t('Hangbank'))+'</span>'));
    var voiceChips = el('div','chips');
    VOICE_BANKS.forEach(function(vb){
      var on = (draft.voiceBank||DEFAULT_VOICE)===vb.id;
      var c = chip(esc(vb.label), on, function(){
        draft.voiceBank = vb.id;
        voiceChips.querySelectorAll('.chip').forEach(function(x){ x.classList.remove('sel'); });
        c.classList.add('sel');
      });
      voiceChips.append(c);
    });
    voiceSec.append(voiceChips);
    p.append(voiceSec);

    if(!ids.length){
      // classes not ready — friendly note, no crash.
      var note=el('div','muted','<span data-t="Az osztályok még töltődnek…">'+esc(t('Az osztályok még töltődnek…'))+'</span>');
      note.style.marginTop='var(--s3)';
      p.append(note);
      body.append(p);
      return;
    }

    // ---- unit slots ----
    var uSec = el('div','section');
    uSec.append(el('h3',null,'<span data-t="Egységek (max 5)">'+esc(t('Egységek (max 5)'))+'</span>'));

    // map uid -> portrait canvas so we can refresh in place without a full
    // re-render (e.g. when the team color changes or captaincy moves).
    var portraitCanvases = {};
    function refreshAllPortraits(){
      draft.units.forEach(function(u, i){
        paintPortrait(portraitCanvases[u.uid], u, draft.captain===i);
      });
    }

    function renderUnits(){
      portraitCanvases = {};
      // clear existing unit cards (keep the h3)
      while(uSec.children.length>1) uSec.removeChild(uSec.lastChild);

      draft.units.forEach(function(u, i){
        var meta = classMeta(u.cls);
        var isCaptain = (draft.captain===i);

        var card = API.card();
        card.style.marginBottom='var(--s2)';

        // ---- header row: LIVE PORTRAIT + species/class name + remove ----
        var head = el('div','row row--between');

        var idCol = el('div','row');
        idCol.style.gap='var(--s3)';
        idCol.style.alignItems='center';

        // live portrait canvas (84×84) drawn by CA.Entities.renderPortrait.
        var portraitBox = el('div',null,'');
        portraitBox.style.width='84px';
        portraitBox.style.height='84px';
        portraitBox.style.borderRadius='var(--r2)';
        portraitBox.style.background='rgba(255,255,255,.06)';
        portraitBox.style.border='1px solid var(--border)';
        portraitBox.style.flex='0 0 auto';
        portraitBox.style.overflow='hidden';
        var canvas = document.createElement('canvas');
        canvas.width = 84; canvas.height = 84;
        canvas.style.width='84px'; canvas.style.height='84px';
        canvas.style.display='block';
        portraitBox.append(canvas);
        portraitCanvases[u.uid] = canvas;
        paintPortrait(canvas, u, isCaptain);

        var nameCol = el('div',null,'');
        nameCol.append(el('div',null,'<strong>'+esc(t(speciesLabel(u.species)))+'</strong>'));
        var clsLine = el('div','muted','<span data-t="'+esc(meta.name)+'">'+esc(t(meta.name))+'</span>');
        clsLine.style.fontSize='0.85em';
        nameCol.append(clsLine);
        if(isCaptain){
          var capBadge = el('div',null,'👑 <span data-t="Kapitány">'+esc(t('Kapitány'))+'</span>');
          capBadge.style.fontSize='0.8em';
          capBadge.style.color='#FFD60A';
          nameCol.append(capBadge);
        }
        idCol.append(portraitBox, nameCol);

        var rm = btn('✕','btn--ghost btn--sm', function(){
          draft.units.splice(i,1);
          // keep captain pointing at a valid unit after removal.
          if(draft.captain>=draft.units.length) draft.captain=Math.max(0, draft.units.length-1);
          renderUnits();
        });
        rm.style.flex='0 0 auto';

        head.append(idCol, rm);
        card.append(head);

        // ---- captain toggle (exactly one captain; purely identity for now,
        // no gameplay perk attached) ----
        var capBtn = btn(
          '👑 <span data-t="Kapitány">'+esc(t('Kapitány'))+'</span>',
          isCaptain ? 'btn--gold btn--sm' : 'btn--ghost btn--sm',
          function(){
            if(draft.captain!==i){
              draft.captain = i;
              renderUnits();
            }
          }
        );
        capBtn.style.marginTop='var(--s2)';
        if(isCaptain) capBtn.disabled = true;
        card.append(capBtn);

        // NOTE: per-unit SPECIES picker removed — species is now chosen ONCE for
        // the whole team at the top (Jani: "1 csapatban NEM lehet mindenféle állat").
        // Each unit only picks its CLASS below; its species follows the team.

        // ---- class chip-grid: pick the class for this slot ----
        var clsGrid = el('div','opt-grid');
        clsGrid.style.marginTop='var(--s3)';
        // same selected-glow gutter as the species grid (keep the first chip's
        // purple outline from clipping on the left).
        clsGrid.style.cssText += ';padding-left:4px;padding-right:4px;margin-left:-4px;margin-right:-4px;';
        ids.forEach(function(cid){
          var cm = classMeta(cid);
          var on = (u.cls===cid);
          var cc = chip(esc(cm.emoji)+' <span data-t="'+esc(cm.name)+'">'+esc(t(cm.name))+'</span>', on, function(){
            u.cls = cid; renderUnits();
          });
          cc.classList.add('chip--grid');
          clsGrid.append(cc);
        });
        card.append(clsGrid);

        // ---- unit name field ----
        var nf = API.field('');
        nf.input.maxLength = 18;   // QA P2
        nf.input.value = u.name||'';
        nf.input.placeholder = t('Egység neve');
        nf.input.oninput = function(){ u.name = nf.input.value; };
        nf.style.marginTop='var(--s2)';
        card.append(nf);

        // ---- cosmetic picker (owned cosmetics; stored on u.cosmetic) ----
        var cosSec = el('div','section');
        cosSec.style.marginTop='var(--s2)';
        cosSec.append(el('h3',null,'<span data-t="Kinézet">'+esc(t('Kinézet'))+'</span>'));
        var owned = ownedCosmetics();
        if(!owned.length){
          cosSec.append(el('div','muted','<span data-t="Nincs birtokolt kinézet.">'+esc(t('Nincs birtokolt kinézet.'))+'</span>'));
        } else {
          // guard: if the stored cosmetic is no longer owned, clear it.
          if(u.cosmetic && owned.indexOf(u.cosmetic)<0) u.cosmetic=null;
          var cosGrid = el('div','opt-grid');
          // same selected-glow gutter as the species/class grids.
          cosGrid.style.cssText += ';padding-left:4px;padding-right:4px;margin-left:-4px;margin-right:-4px;';
          // "None" chip first
          var noneChip = chip('<span data-t="Nincs">'+esc(t('Nincs'))+'</span>', !u.cosmetic, function(){
            u.cosmetic = null; renderUnits();
          });
          noneChip.classList.add('chip--grid');
          cosGrid.append(noneChip);
          owned.forEach(function(cid){
            var cm = cosmeticMeta(cid);
            var on = (u.cosmetic===cid);
            var label = esc(t(cm.name))+' · <span style="color:'+cm.rColor+'">'+esc(t(cm.rLabel))+'</span>';
            var cc = chip(label, on, function(){
              u.cosmetic = cid; renderUnits();
            });
            cc.classList.add('chip--grid');
            cc.style.borderColor = on ? cm.rColor : '';
            cosGrid.append(cc);
          });
          cosSec.append(cosGrid);
        }
        card.append(cosSec);

        // ---- verb hint ----
        if(meta.verb){
          var hint = el('div','muted', esc(meta.verb));
          hint.style.fontSize='0.85em';
          hint.style.marginTop='var(--s1)';
          card.append(hint);
        }

        uSec.append(card);
      });

      // add-unit button (only if room left)
      var existing = uSec.querySelector('[data-add]');
      if(existing) existing.remove();
      if(draft.units.length < MAX_UNITS){
        var add = btn('➕ <span data-t="Egység">'+esc(t('Egység'))+'</span>','btn--ghost btn--sm btn--block', function(){
          draft.units.push(freshUnit(null, draft.species));  // inherit TEAM species (1 csapat = 1 faj)
          renderUnits();
        });
        add.dataset.add='1';
        uSec.append(add);
      }
    }
    renderUnits();
    p.append(uSec);

    // ---- action buttons ----
    var actSec = el('div','section');
    var actRow = el('div','row');
    actRow.style.flexWrap='wrap';
    actRow.style.gap='var(--s2)';

    actRow.append(btn('<span data-t="💾 Mentés">'+esc(t('💾 Mentés'))+'</span>','btn--green', function(){
      doSave(API, body);
    }));
    // 2-step inline confirm (no native confirm()): first tap arms ("Biztos? ✓"),
    // second tap within 4s actually deletes. Mirrors the level-editor Clear pattern.
    (function(){
      var delB = btn('<span data-t="🗑️ Törlés">'+esc(t('🗑️ Törlés'))+'</span>','btn--red', null);
      var armed=false, timer=null;
      function disarm(){
        armed=false; if(timer){ clearTimeout(timer); timer=null; }
        delB.classList.remove('btn--gold'); delB.classList.add('btn--red');
        delB.innerHTML='<span data-t="🗑️ Törlés">'+esc(t('🗑️ Törlés'))+'</span>';
      }
      delB.onclick = function(){
        if(!armed){
          armed=true;
          delB.classList.remove('btn--red'); delB.classList.add('btn--gold');
          delB.innerHTML='<span data-t="Biztos? ✓">'+esc(t('Biztos? ✓'))+'</span>';
          timer=setTimeout(disarm, 4000);
          return;
        }
        if(timer){ clearTimeout(timer); timer=null; }
        doDelete(API, body);   // rebuild() inside resets everything
      };
      actRow.append(delB);
    })();
    actRow.append(btn('<span data-t="➕ Új csapat">'+esc(t('➕ Új csapat'))+'</span>','btn--ghost', function(){
      draft = freshDraft(); rebuild(API, body);
    }));
    actSec.append(actRow);
    p.append(actSec);

    // ---- TOP TABS (Jani: "fent legyen kis submenü mint a Több menüben") ----
    //   1) 👥 Csapataim  → the saved-teams list
    //   2) ➕ Új csapat   → the builder (fresh team)
    // Editing a saved team (its ✏️ button) also switches to the builder tab with
    // that team loaded. This removes the old confusion of seeing BOTH the saved
    // list AND the builder (with another team's data) at once.
    var tabBar = el('div','seg');
    tabBar.style.cssText = 'margin:0 auto var(--s3);max-width:420px;';
    function mkTeTab(id, label){
      var b = el('button', null, '<span data-t="'+esc(label)+'">'+esc(t(label))+'</span>');
      if(teTab===id) b.classList.add('sel');
      b.onclick = function(){
        if(id==='build'){ draft = freshDraft(); }  // the "new team" tab = a fresh team
        teTab = id; rebuild(API, body);
      };
      return b;
    }
    tabBar.append(mkTeTab('saved','👥 Csapataim'), mkTeTab('build','➕ Új csapat'));
    body.append(tabBar);

    if(teTab === 'saved'){
      body.append(renderSavedTeams(API, body));
    } else {
      var builderHead = el('h2',null,'🛠️ <span data-t="Csapatépítő">'+esc(t('Csapatépítő'))+'</span>');
      builderHead.style.margin='0 0 var(--s2)';
      builderHead.style.fontSize='16px';
      builderHead.style.opacity='0.9';
      body.append(builderHead);
      body.append(p);
    }

    // NOTE: the "Play with this team" action moved OUT of the editor into NEW GAME
    // (a saved-team picker under the advanced view). The editor is now build/save
    // only — play a saved team from the New Game screen.
  }

  // ---- SAVED TEAMS panel (the headline) ------------------------------------
  // A prominent, "badass" card per saved team: big logo + banner, name with a
  // colour bar, member count, and the full roster (each animal as a LIVE animated
  // portrait + name + class). Each card has EDIT (load into the builder) + Delete.
  function renderSavedTeams(API, body){
    var el=API.el, esc=API.esc, t=API.t, btn=API.btn;
    var teams = loadTeams();

    var sPanel = API.panel();
    sPanel.append(el('h2',null,'🏆 <span data-t="Mentett csapatok">'+esc(t('Mentett csapatok'))+'</span>'));

    if(!teams.length){
      sPanel.append(el('div','muted','<span data-t="Még nincs mentett csapat. Építsd meg az elsőt lent!">'+esc(t('Még nincs mentett csapat. Építsd meg az elsőt lent!'))+'</span>'));
      return sPanel;
    }

    teams.forEach(function(team){
      var col = team.color || DEFAULT_COLOR;
      var nm = (team.name && team.name.trim()) || t('Névtelen csapat');
      var lg = team.logo || DEFAULT_LOGO;
      var units = (team.units||[]);
      var captainIdx = (typeof team.captain==='number') ? team.captain : 0;

      var c = API.card();
      c.style.marginBottom='var(--s3)';
      c.style.borderLeft='4px solid '+col;
      c.style.background='linear-gradient(135deg, '+hexA(col,0.14)+' 0%, rgba(255,255,255,.03) 60%)';
      c.style.boxShadow='0 0 0 1px '+hexA(col,0.35)+' inset';

      // ---- banner row: big logo tile + name + member count ----
      var head = el('div','row row--between');
      head.style.alignItems='center';

      var leftCol = el('div','row');
      leftCol.style.gap='var(--s3)';
      leftCol.style.alignItems='center';

      var logoTile = el('div',null, esc(lg));
      logoTile.style.fontSize='30px';
      logoTile.style.lineHeight='1';
      logoTile.style.width='52px';
      logoTile.style.height='52px';
      logoTile.style.display='flex';
      logoTile.style.alignItems='center';
      logoTile.style.justifyContent='center';
      logoTile.style.borderRadius='var(--r2)';
      logoTile.style.background=hexA(col,0.22);
      logoTile.style.border='2px solid '+col;
      logoTile.style.flex='0 0 auto';

      var titleCol = el('div',null,'');
      var nameLine = el('div',null,'<strong style="font-size:18px">'+esc(nm)+'</strong>'+(team.banner?(' '+esc(team.banner)):''));
      titleCol.append(nameLine);
      var cnt = units.length;
      titleCol.append(el('div','muted', cnt+' '+esc(t('tag'))));
      leftCol.append(logoTile, titleCol);
      head.append(leftCol);
      c.append(head);

      // ---- roster strip: live animated portrait + name + class per animal ----
      if(units.length){
        var roster = el('div','row');
        roster.style.cssText='flex-wrap:wrap;gap:var(--s3);margin-top:var(--s3);';
        units.forEach(function(u, ui){
          if(!u) return;
          var meta = classMeta(u.cls);
          var isCap = (captainIdx===ui);

          var slot = el('div',null,'');
          slot.style.cssText='display:flex;flex-direction:column;align-items:center;text-align:center;min-width:72px;flex:0 0 auto;';

          var pBox = el('div',null,'');
          pBox.style.cssText='width:64px;height:64px;border-radius:var(--r2);overflow:hidden;background:rgba(255,255,255,.06);border:1px solid '+(isCap?'#FFD60A':'var(--border)')+';';
          var cv = document.createElement('canvas');
          cv.width=64; cv.height=64;
          cv.style.cssText='width:64px;height:64px;display:block;';
          pBox.append(cv);
          slot.append(pBox);
          // animate this saved-roster portrait too (getter-based so the closure
          // captures the right unit/team without re-binding).
          PortraitAnim.register(cv, (function(unit, teamColor){
            return {
              species: function(){ return unit.species||DEFAULT_SPECIES; },
              cls:     function(){ return unit.cls||null; },
              cosmetic:function(){ return unit.cosmetic||null; },
              captain: function(){ return isCap; },
              color:   function(){ return teamColor||DEFAULT_COLOR; }
            };
          })(u, col));

          var unm = (u.name && u.name.trim()) || t(speciesLabel(u.species));
          var nmNode = el('div',null,'<strong style="font-size:12px">'+(isCap?'👑 ':'')+esc(unm)+'</strong>');
          nmNode.style.marginTop='4px';
          slot.append(nmNode);
          var clsNode = el('div','muted','<span data-t="'+esc(meta.name)+'">'+esc(t(meta.name))+'</span>');
          clsNode.style.fontSize='11px';
          slot.append(clsNode);

          roster.append(slot);
        });
        c.append(roster);
      }

      // ---- actions: Edit (load into builder) + Delete ----
      var actRow = el('div','row');
      actRow.style.cssText='gap:var(--s2);margin-top:var(--s3);';
      actRow.append(btn('<span data-t="✏️ Szerkeszt">'+esc(t('✏️ Szerkeszt'))+'</span>','btn--gold btn--sm', function(){
        loadDraftFrom(team);
        teTab = 'build';            // editing → jump to the builder tab with this team
        rebuild(API, body);
        try{ body.scrollTop = 0; }catch(e){}
      }));
      // 2-step inline confirm (no native confirm()): a mis-tap must NOT permanently
      // destroy an XP-filled team. First tap arms, second tap (within 4s) deletes.
      (function(){
        var delB = btn('<span data-t="🗑️ Törlés">'+esc(t('🗑️ Törlés'))+'</span>','btn--red btn--sm', null);
        var armed=false, timer=null;
        function disarm(){
          armed=false; if(timer){ clearTimeout(timer); timer=null; }
          delB.classList.remove('btn--gold'); delB.classList.add('btn--red');
          delB.innerHTML='<span data-t="🗑️ Törlés">'+esc(t('🗑️ Törlés'))+'</span>';
        }
        delB.onclick = function(){
          if(!armed){
            armed=true;
            delB.classList.remove('btn--red'); delB.classList.add('btn--gold');
            delB.innerHTML='<span data-t="Biztos? ✓">'+esc(t('Biztos? ✓'))+'</span>';
            timer=setTimeout(disarm, 4000);
            return;
          }
          if(timer){ clearTimeout(timer); timer=null; }
          var list = loadTeams().filter(function(tm){
            if(team.tid && tm && tm.tid===team.tid) return false;
            if(!team.tid && tm && (tm.name||'')===(team.name||'')) return false;
            return true;
          });
          saveTeams(list);
          try{ CA.events.emit('toast', t('Csapat törölve')); }catch(e){}
          // if we just deleted the team currently loaded in the draft, reset it.
          if(draft.tid===team.tid){ draft = freshDraft(); }
          rebuild(API, body);
        };
        actRow.append(delB);
      })();
      c.append(actRow);

      sPanel.append(c);
    });

    return sPanel;
  }

  // small hex → rgba() helper for the saved-team card tinting (accepts #RGB/#RRGGBB).
  function hexA(hex, a){
    var h = String(hex||'').replace('#','');
    if(h.length===3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h,16);
    if(isNaN(n)) return 'rgba(232,113,26,'+a+')';
    var r=(n>>16)&255, g=(n>>8)&255, b=n&255;
    return 'rgba('+r+','+g+','+b+','+a+')';
  }

  // ---- actions -------------------------------------------------------------
  function doSave(API, body){
    var nm = (draft.name||'').trim();
    if(!nm){
      // require a name — surface inline (NO native alert: it breaks the DOM design).
      if(nameErrRef){
        nameErrRef.textContent = API.t('Adj nevet a csapatnak!');
        nameErrRef.style.display = 'block';
      }
      if(nameFieldRef && nameFieldRef.input){
        try{ nameFieldRef.input.focus(); }catch(e){}
        try{ nameFieldRef.input.scrollIntoView({ block:'center' }); }catch(e){}
      }
      return;
    }
    var teams = loadTeams();
    // keep the draft's stable tid (mint only if somehow missing).
    if(!draft.tid) draft.tid = newTid();
    var savedUnits = draft.units.slice(0, MAX_UNITS).map(function(u){
      // backfill the unit's stable uid on save; never regenerate an existing one.
      if(!u.uid) u.uid = newUid();
      return {
        uid: u.uid,
        species: u.species||DEFAULT_SPECIES,
        cls: u.cls,
        name:(u.name||'').trim(),
        cosmetic:(u.cosmetic||null)
      };
    });
    var cap = (typeof draft.captain==='number') ? draft.captain : 0;
    if(savedUnits.length===0) cap=0; else if(cap<0||cap>=savedUnits.length) cap=0;
    draft.captain = cap;
    var team = {
      tid: draft.tid,
      name:nm,
      logo: draft.logo||DEFAULT_LOGO,
      color: draft.color||DEFAULT_COLOR,
      banner: draft.banner||DEFAULT_BANNER,
      voiceBank: draft.voiceBank||DEFAULT_VOICE,
      captain: cap,
      units: savedUnits
    };
    // match an existing save by stable tid first, then by name (legacy saves).
    var idx = -1;
    for(var i=0;i<teams.length;i++){ if(teams[i] && teams[i].tid===draft.tid){ idx=i; break; } }
    if(idx<0){ for(var j=0;j<teams.length;j++){ if((teams[j].name||'')===nm){ idx=j; break; } } }
    if(idx>=0) teams[idx]=team; else teams.push(team);
    saveTeams(teams);
    teTab = 'saved';   // after saving, return to the Csapataim list
    rebuild(API, body);
  }

  function doDelete(API, body){
    var nm = (draft.name||'').trim();
    var tid = draft.tid;
    if(!nm && !tid){ draft = freshDraft(); rebuild(API, body); return; }
    var teams = loadTeams().filter(function(tm){
      if(tid && tm && tm.tid===tid) return false;       // delete by stable id
      if(nm && (tm.name||'')===nm) return false;        // or by name (legacy)
      return true;
    });
    saveTeams(teams);
    draft = freshDraft();
    teTab = 'saved';   // after deleting, return to the Csapataim list
    rebuild(API, body);
  }

  // ---- register ------------------------------------------------------------
  if (window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('teamedit', build);
})();
