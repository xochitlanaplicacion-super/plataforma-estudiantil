/* ============================================================================
 * CUTE ANIMALS — screens.js  ::  CA.Screens  (Agent Screens, wave 2)
 * ----------------------------------------------------------------------------
 * Extra full-screen MENU pages that ui.js delegates to, so the big menu file
 * stays manageable. Features: #36 (profil/XP), #40 (ranglista), #39
 * (eredmények galéria), #2 (pályaszerkesztő UI).
 *
 * CONTRACT WITH ui.js (Agent UI owns ui.js, which drives the menu screen-state):
 *   ui.js exposes:  CA.UI.setScreen(name)  and  CA.UI.screen()  (getter).
 *   When CA.UI.screen() is one of YOUR screens ('profile'|'leaderboard'|
 *   'achievements'|'editor'), ui.js calls:
 *       CA.Screens.render(name, ctx)          // draw the whole page incl. a Back button
 *       CA.Screens.handlePointer(name, p)->bool  // p={x,y} in canvas px; return true if handled
 *   Your Back buttons call CA.UI.setScreen('main'). ui.js adds the menu buttons
 *   that switch INTO your screens, so you just render + handle them.
 *
 * IMPLEMENT on CA.Screens (EXACT):
 *   init()
 *   list()  -> ['profile','leaderboard','achievements','editor']
 *   render(name, ctx)            -> draw page (screen space, CA.config.VIEW_W/H,
 *                                   live every frame). Cute, consistent style.
 *   handlePointer(name, p)->bool -> hit-test your buttons; return true if consumed.
 *   isTextInputActive()          -> for the editor (name field) if you add one.
 *
 * Pages:
 *  - 'profile' (#36): show CA.Meta.profile — level, XP bar to next level,
 *    games/wins/kills, unlocked species. Read CA.Meta.levelFor / addXp etc.
 *  - 'leaderboard' (#40): CA.Meta.profile.leaderboard sorted by score (name,score,date).
 *  - 'achievements' (#39): grid of CA.Meta.achievements catalog with locked/unlocked
 *    state (CA.Meta.profile.achievements[id]).
 *  - 'editor' (#2): a terrain paint UI driving CA.Maps.editor (beginEdit/paint/
 *    erase/clear/save/load/list). Let the user pick a base theme, paint/erase with
 *    pointer drag on a scaled preview (or directly), name + save, and load
 *    existing. The editor only EDITS + SAVES — it never launches a match (a custom
 *    map needs the full New-Game settings, so it's played from New Game instead).
 *    Coordinate via CA.Maps.editor + localStorage.
 *
 * Be defensive: guard CA.Meta / CA.Maps.editor existence. Reuse a rounded-rect
 * helper locally (don't depend on ui.js internals). Read CA.config.VIEW_* live.
 * ==========================================================================*/
(function(){
  const C = CA.config;
  const IS_TOUCH = (typeof window!=='undefined') &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints>0));

  // tiny safe translate helper (CA.t always exists per i18n.js, but stay robust)
  const T = (s)=> (CA.t ? CA.t(s) : s);

  /* ---- EN translations for every user-facing string in this file ---- */
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    // common
    '‹ Vissza':'‹ Back',
    'Bezár':'Close',
    // editor — prop palette
    'Fa':'Tree',
    'Fenyő':'Pine',
    'Kaktusz':'Cactus',
    'Kristály':'Crystal',
    'Szikla':'Rock',
    'Hordó':'Barrel',
    'Hóember':'Snowman',
    // lobby — net status messages
    'Kapcsolódva ✓':'Connected ✓',
    'Másold ki a kódot és küldd a társadnak.':'Copy the code and send it to your partner.',
    'Játékos':'Player',
    // leaderboard
    'Nincs kapcsolat':'No connection',
    'Nincs még pontod a beküldéshez.':'No score to submit yet.',
    'Beküldés…':'Submitting…',
    'Beküldve ✓':'Submitted ✓',
    'Beküldés sikertelen':'Submit failed',
    'Csapat':'Team',
    // profile
    '📊 Profil':'📊 Profile',
    'Szint':'Level',
    '🎮 Meccsek':'🎮 Matches',
    '🏆 Győzelmek':'🏆 Wins',
    '📈 Nyerési arány':'📈 Win rate',
    '💥 Kill-ek':'💥 Kills',
    '🎯 Pontosság':'🎯 Accuracy',
    '🔫 Kedvenc fegyver':'🔫 Favorite weapon',
    '🔥 Legnagyobb kombó':'🔥 Biggest combo',
    '🌊 Túlélt hullámok':'🌊 Waves survived',
    'Összes XP: ':'Total XP: ',
    'Statisztika':'Stats',
    '🎯 Kihívások':'🎯 Challenges',
    'kész':'done',
    '🎟️ Szezon-pálya':'🎟️ Season track',
    'Tier ':'Tier ',
    'Fajok':'Species',
    // leaderboard page
    '🏆 Ranglista':'🏆 Leaderboard',
    '⏳ Betöltés…':'⏳ Loading…',
    '⏳ Beküldés…':'⏳ Submitting…',
    '🔄 Frissítés':'🔄 Refresh',
    '📤 Küldd be a pontod':'📤 Submit your score',
    'Betöltés…':'Loading…',
    'Online ranglista ✓':'Online leaderboard ✓',
    ' — helyi lista':' — local list',
    'Még nincs eredmény.':'No scores yet.',
    'Játssz egy meccset, és felkerülsz! 🐹':'Play a match to get on the board! 🐹',
    'Név':'Name',
    'Pont':'Score',
    // achievements
    '🌟 Eredmények':'🌟 Achievements',
    '🎯 Aktív kihívások':'🎯 Active challenges',
    // editor page
    '✏️ Pályaszerkesztő':'✏️ Level editor',
    'Rajzolj terepet, rakj le tárgyakat, mentsd el a pályád.':'Paint terrain, place props, save your map.',
    'Ecsetméret':'Brush size',
    'Műveletek':'Actions',
    'Alap téma':'Base theme',
    'Eszköz':'Tool',
    '✏️ Rajzol':'✏️ Draw',
    '🧽 Radír':'🧽 Erase',
    'Tárgyak':'Props',
    'Ecset: ':'Brush: ',
    '🗑 Törlés':'🗑 Clear',
    '📂 Betöltés':'📂 Load',
    'koppints a lerakáshoz: ':'tap to place: ',
    'radírozás':'erasing',
    'rajzolás':'drawing',
    'Húzd / koppints a felületen: ':'Drag / tap on the surface: ',
    'Név:':'Name:',
    'pálya neve…':'map name…',
    '💾 Mentés':'💾 Save',
    'A szerkesztő nem érhető el (CA.Maps.editor hiányzik).':'The editor is unavailable (CA.Maps.editor missing).',
    '📂 Mentett pályák':'📂 Saved maps',
    'Nincs mentett pálya.':'No saved maps.',
    'Betöltve: ':'Loaded: ',
    'Törölve: ':'Deleted: ',
    'Téma: ':'Theme: ',
    'Tárgy: ':'Prop: ',
    'Pálya törölve':'Map cleared',
    'Adj nevet a pályának!':'Give the map a name!',
    'Mentve: ':'Saved: ',
    'Mentés sikertelen':'Save failed',
    'Lerakva: ':'Placed: ',
    // editor — new tools / UX (wave: editor overhaul)
    'Forma':'Shape',
    '● Kör':'● Round',
    '■ Négyzet':'■ Square',
    'Extrák':'Extras',
    '↶ Vissza':'↶ Undo',
    '↷ Újra':'↷ Redo',
    '🪣 Kitölt':'🪣 Fill',
    '⬓ Sík talaj':'⬓ Flat ground',
    '🪞 Tükrözés':'🪞 Mirror',
    '# Rács':'# Grid',
    'Biztos törlöd?':'Really clear?',
    'Igen, törlés':'Yes, clear',
    'Mégse':'Cancel',
    'Nincs mit visszavonni':'Nothing to undo',
    'Nincs mit megismételni':'Nothing to redo',
    'Visszavonva':'Undone',
    'Megismételve':'Redone',
    'Kitöltve':'Filled',
    'Sík talaj kész':'Flat ground ready',
    'Tükrözés be':'Mirror on',
    'Tükrözés ki':'Mirror off',
    'Rács be':'Grid on',
    'Rács ki':'Grid off',
    // lobby page
    '🌐 Online szoba':'🌐 Online Room',
    'A hálózati modul (CA.Net) nem érhető el.':'The network module (CA.Net) is unavailable.',
    'Neved':'Your name',
    '🎮 Szoba létrehozása':'🎮 Create Room',
    'vagy lépj be egy kóddal':'or join with a code',
    'KÓD':'CODE',
    '➜ Belépés':'➜ Join',
    'Hozz létre egy szobát, és oszd meg a kódot — a társad ezzel a kóddal tud belépni.':'Create a room and share the code — your partner can join with it.',
    '🚪 Kilépés':'🚪 Leave',
    'Szobakód — oszd meg a társaddal':'Room code — share it with your partner',
    '➡ A te kódod':'➡ Your code',
    '➡ A te válaszod':'➡ Your answer',
    ' (másold ki):':' (copy it):',
    '📋 Másolás':'📋 Copy',
    '⬅ Illeszd be a társad válaszát:':'⬅ Paste your partner’s answer:',
    '⬅ Illeszd be a Host kódját:':'⬅ Paste the host’s code:',
    '…ide illeszd (Ctrl/Cmd+V)…':'…paste here (Ctrl/Cmd+V)…',
    '✔ Alkalmaz':'✔ Apply',
    'Játékosok (':'Players (',
    '(te) ':'(you) ',
    '✓ Kész':'✓ Ready',
    '… vár':'… waiting',
    'Várakozás játékosokra…':'Waiting for players…',
    '✓ Készen állok':'✓ Ready',
    'Készülök… (koppints, ha kész)':'Getting ready… (tap when ready)',
    '▶ Indítás':'▶ Start',
    '▶ Indítás (min. 2 kész játékos)':'▶ Start (min. 2 ready players)',
    'A Host indítja a meccset, ha mindenki kész.':'The host starts the match when everyone is ready.',
    '🗺️ Pálya':'🗺️ Map',
    '🗺️ Pálya (a Host választ)':'🗺️ Map (host chooses)',
    '🎯 Mód':'🎯 Mode',
    'Klasszikus':'Classic',
    '💬 Csevegés':'💬 Chat',
    'Még nincs üzenet — írj valamit! 🐹':'No messages yet — say something! 🐹',
    'Te':'You',
    'Írj üzenetet…':'Type a message…',
    '➤ Küld':'➤ Send',
    // lobby messages
    'Szoba kész: ':'Room ready: ',
    'Hostolás sikertelen':'Hosting failed',
    'Adj meg szobakódot.':'Enter a room code.',
    'Csatlakozás: ':'Joining: ',
    'Csatlakozás sikertelen':'Join failed',
    'Kiléptél a szobából.':'You left the room.',
    'Kód a vágólapon ✓':'Code copied ✓',
    'Kód: ':'Code: ',
    'Pálya: ':'Map: ',
    'Mód: ':'Mode: ',
    'Legalább 2 kész játékos kell az indításhoz.':'At least 2 ready players are needed to start.',
    'Vágólapra másolva ✓':'Copied to clipboard ✓',
    'Másolás nem sikerült — jelöld ki kézzel.':'Copy failed — select it manually.',
    'Másold ki kézzel a kódmezőből.':'Copy it manually from the code box.',
    'Előbb illeszd be a kódot.':'Paste the code first.',
    'Válasz feldolgozva — kapcsolódás…':'Answer processed — connecting…',
    'Ajánlat feldolgozva — válasz generálása…':'Offer processed — generating answer…',
    'Hibás kód.':'Invalid code.',
  });

  /* ----------------------------------------------------------------------
   * Vertical SCROLL support (mobile-first). The canvas has no native scroll,
   * so each page can declare a "content height" during render; we offset all
   * drawing by `scroll.y[page]` and clamp it. Wheel + touch-drag adjust it.
   * Pages opt in by calling beginScroll()/endScroll() around their content and
   * subtracting scrollY() from y-coordinates.
   * -------------------------------------------------------------------- */
  const scroll = {
    y:{ editor:0 },
    max:{ editor:0 },
    cur:null,                // page currently being rendered (for the scroll math)
    drag:null,               // {id, startClientY, startY} active touch-drag
    hooked:false,
  };
  function curPage(){ return (CA.UI && CA.UI.screen) ? CA.UI.screen() : scroll.cur; }
  function scrollYOf(page){ return scroll.y[page]||0; }
  function clampScroll(page){
    const m = scroll.max[page]||0;
    if (scroll.y[page]<0) scroll.y[page]=0;
    if (scroll.y[page]>m) scroll.y[page]=m;
  }
  // Set the content height that a page needs; updates clamp for that page.
  function setContentHeight(page, contentBottomY){
    // contentBottomY is the lowest drawn y (in the page's own, pre-scroll space).
    const overflow = Math.max(0, contentBottomY - C.VIEW_H + 24);
    scroll.max[page] = overflow;
    clampScroll(page);
  }
  // convert a clientY delta to canvas-px delta (so drag feels 1:1)
  function clientToCanvasScale(){
    const cv = CA.canvas; if (!cv) return 1;
    const r = cv.getBoundingClientRect();
    return r.height ? (cv.height / r.height) : 1;
  }
  function hookScroll(){
    if (scroll.hooked || typeof window==='undefined') return;
    scroll.hooked = true;
    const cv = CA.canvas; if (!cv) return;
    const PAGES = { editor:1 };
    cv.addEventListener('wheel', (e)=>{
      const pg = curPage(); if (!PAGES[pg]) return;
      if (!(scroll.max[pg]>0)) return;
      scroll.y[pg] += e.deltaY * (e.deltaMode===1 ? 16 : 1);
      clampScroll(pg);
      e.preventDefault();
    }, { passive:false });
    // touch-drag to scroll (only when the page actually overflows)
    cv.addEventListener('touchstart', (e)=>{
      const pg = curPage(); if (!PAGES[pg]) return;
      if (!(scroll.max[pg]>0)) return;
      const t = e.changedTouches[0]; if (!t) return;
      scroll.drag = { id:t.identifier, startClientY:t.clientY, startY:scroll.y[pg], moved:0, pg };
    }, { passive:true });
    cv.addEventListener('touchmove', (e)=>{
      const d = scroll.drag; if (!d) return;
      let t=null; for (const ct of e.changedTouches){ if (ct.identifier===d.id){ t=ct; break; } }
      if (!t) return;
      const dy = (t.clientY - d.startClientY) * clientToCanvasScale();
      d.moved = Math.max(d.moved, Math.abs(dy));
      scroll.y[d.pg] = d.startY - dy;     // drag up -> content moves up
      clampScroll(d.pg);
      if (Math.abs(dy)>4) e.preventDefault();
    }, { passive:false });
    const endDrag = ()=>{ scroll.drag = null; };
    cv.addEventListener('touchend', endDrag, { passive:true });
    cv.addEventListener('touchcancel', endDrag, { passive:true });
  }

  /* ---- local draw + hit helpers (no dependency on ui.js internals) ---- */
  function rr(ctx,x,y,w,h,r){
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }
  function inRect(p,b){ return p && b && p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h; }

  // DARK menu palette — matches the HTML/CSS menu system (css/menu.css). The
  // whole app should feel like one piece, so these canvas pages reuse the SAME
  // background gradient the DOM #menu-root paints, plus the menu's translucent
  // panels, cream/light text and purple accent buttons.
  const PAL = {
    // background gradient stops — match #menu-root in css/menu.css:
    //   linear-gradient(160deg,#222b3a 0%,#1b2330 100%) with radial highlights
    //   (#36465f top-right, #2a3650 bottom-left).
    bgTop:'#222b3a', bgMid:'#1e2632', bgBot:'#1b2330',
    bgGlowTR:'#36465f', bgGlowBL:'#2a3650',
    // dark translucent panel + faint light border (matches .panel/--panel)
    panel:'rgba(46,58,76,0.72)', panelEdge:'rgba(255,255,255,0.10)',
    // inset/well surfaces inside panels
    well:'rgba(0,0,0,0.28)', wellSoft:'rgba(255,255,255,0.06)',
    // text
    ink:'#fff7e6',            // primary light/cream text (headings, values)
    inkSoft:'#9fc0d2',        // secondary muted blue-grey
    inkSofter:'#bfe0f0',      // gentle light blue
    // accent button colors (same family as the menu)
    accent:'#e0a93f',         // gold (primary action)
    accent2:'#3f86a4',        // blue
    good:'#3fa45a',           // green
    bad:'#a4503f',            // red
    purple:'#8a6db0',
    gold:'#ffd76a',           // bright gold highlight
    grey:'#33485a',           // neutral dark slot
  };

  function bg(ctx, title){
    const W=C.VIEW_W, H=C.VIEW_H;
    // Mirror the DOM menu background (css/menu.css #menu-root): a 160deg linear
    // base gradient + two soft radial highlights (top-right & bottom-left), so
    // the canvas editor blends seamlessly with the HTML menus behind/around it.
    // 160deg ≈ pointing down-left; approximate with a diagonal linear gradient.
    const lg = ctx.createLinearGradient(W,0,0,H);
    lg.addColorStop(0, PAL.bgTop); lg.addColorStop(1, PAL.bgBot);
    ctx.fillStyle = lg; ctx.fillRect(0,0,W,H);
    // top-right warm glow (radial-gradient 1200x700 at 70% -10%, #36465f→transparent)
    const gr1 = ctx.createRadialGradient(W*0.70, -H*0.10, 0, W*0.70, -H*0.10, Math.max(W,H)*0.8);
    gr1.addColorStop(0, PAL.bgGlowTR); gr1.addColorStop(0.6, 'rgba(54,70,95,0)');
    ctx.fillStyle = gr1; ctx.fillRect(0,0,W,H);
    // bottom-left cool glow (radial-gradient 900x600 at -10% 110%, #2a3650→transparent)
    const gr2 = ctx.createRadialGradient(-W*0.10, H*1.10, 0, -W*0.10, H*1.10, Math.max(W,H)*0.7);
    gr2.addColorStop(0, PAL.bgGlowBL); gr2.addColorStop(0.55, 'rgba(42,54,80,0)');
    ctx.fillStyle = gr2; ctx.fillRect(0,0,W,H);
    // faint floating bubbles for cuteness (like the menu bokeh)
    ctx.save();
    for(let i=0;i<14;i++){
      const x=((i*137)%W)+30, y=((i*89)%H)+24;
      ctx.fillStyle = 'rgba(255,255,255,'+(0.03+0.03*((i*7)%5)/5)+')';
      ctx.beginPath(); ctx.arc(x,y, 12+(i%4)*8, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
    // title (cream with a soft dark shadow). Smaller than before so it doesn't
    // dominate the top of the editor / canvas screens.
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    // Baloo 2 (the DOM menus' heading font) — NOT system-ui, so the canvas header
    // matches the other screens' titles. (@import-ed by menu.css.)
    ctx.font = '800 30px ' + EFONT;
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillText(title, W/2+2, 54);
    ctx.fillStyle=PAL.ink;            ctx.fillText(title, W/2, 52);
  }

  // Menu-style button: drop shadow, colored fill, glossy top, light label.
  function button(ctx, b, label, opts){
    opts = opts || {};
    const fill = opts.fill || PAL.accent;
    const r = opts.r!=null?opts.r:12;
    // drop shadow
    rr(ctx, b.x+2, b.y+3, b.w, b.h, r); ctx.fillStyle='rgba(0,0,0,0.30)'; ctx.fill();
    // body
    rr(ctx, b.x, b.y, b.w, b.h, r); ctx.fillStyle = fill; ctx.fill();
    // glossy top-half highlight
    rr(ctx, b.x, b.y, b.w, b.h/2, r); ctx.fillStyle='rgba(255,255,255,0.13)'; ctx.fill();
    if (opts.sel){ rr(ctx,b.x,b.y,b.w,b.h,r); ctx.lineWidth=3; ctx.strokeStyle='#fff7e6'; ctx.stroke(); ctx.lineWidth=1; }
    ctx.fillStyle = opts.textColor || '#fff';
    ctx.font = opts.font || '600 18px system-ui, sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, b.x+b.w/2, b.y+b.h/2+1);
  }

  // env(safe-area-inset-*) isn't readable from JS directly, so probe it with a
  // throwaway off-screen element. Canvas works in BACKING px → callers ×dpr.
  // Kept local (the file intentionally doesn't depend on ui.js internals).
  let _safeTL=null;                          // {top,left} in CSS px, cached
  function safeAreaTopLeftCss(){
    if(_safeTL) return _safeTL;
    let top=0,left=0;
    try{
      const probe=document.createElement('div');
      probe.style.cssText='position:fixed;left:0;top:0;width:0;height:0;'+
        'padding-top:env(safe-area-inset-top,0px);'+
        'padding-left:env(safe-area-inset-left,0px);'+
        'visibility:hidden;pointer-events:none;';
      document.body.appendChild(probe);
      const cs=getComputedStyle(probe);
      top=parseFloat(cs.paddingTop)||0; left=parseFloat(cs.paddingLeft)||0;
      document.body.removeChild(probe);
    }catch(_){ top=0; left=0; }
    _safeTL={ top:(isFinite(top)&&top>0)?top:0, left:(isFinite(left)&&left>0)?left:0 };
    return _safeTL;
  }
  try{
    window.addEventListener('resize', ()=>{ _safeTL=null; });
    window.addEventListener('orientationchange', ()=>{ _safeTL=null; });
  }catch(_){}

  // Finger-sized, reachable back button. Bigger hitbox on touch devices, and
  // nudged inward from the screen edge so the notch / rounded corner never
  // clips it. backRect() is the single source of truth for BOTH the drawn
  // button and the hit-test, so they can never drift apart.
  function backRect(){
    // desktop: compact pill matching the menu's .btn--sm Back (smaller than the
    // big action buttons) — flat ghost style is applied in backButton().
    if (!IS_TOUCH) return { x:24, y:22, w:104, h:38 };
    const dpr=(C.VIEW_W && window.innerWidth) ? (C.VIEW_W/window.innerWidth) : 1;
    const sa=safeAreaTopLeftCss();
    // small screens (narrow phones) get a bit more breathing room.
    const smallCss = (window.innerWidth||9999) < 420;
    const baseCss = smallCss ? 16 : 12;       // min margin from the edge (CSS px)
    const x = Math.round((baseCss + sa.left) * dpr);
    const y = Math.round((baseCss + sa.top)  * dpr);
    return { x, y, w:132, h:56 };
  }
  // Back button styled to MATCH the standard DOM menu Back (.btn.btn--ghost
  // .btn--sm.btn-back in css/menu.css): a flat translucent "panel" fill with a
  // faint light border, cream ink text, small radius (--r1=8px) — NOT the glossy
  // colored action button used elsewhere. The leading "‹" chevron mirrors the
  // menu markup ('‹ <span>Vissza</span>').
  function backButton(ctx){
    const b = backRect();
    const r = 8;
    // flat ghost panel (no drop shadow / no gloss)
    rr(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fillStyle = PAL.panel; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = PAL.panelEdge;
    rr(ctx, b.x, b.y, b.w, b.h, r); ctx.stroke(); ctx.lineWidth = 1;
    // label: cream ink, Baloo font like the menu, sm weight/size (700 14px),
    // bumped a touch on touch devices for legibility on the larger hitbox.
    ctx.fillStyle = PAL.ink;
    ctx.font = ef(IS_TOUCH ? '700 16px' : '700 14px');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(T('‹ Vissza'), b.x + b.w/2, b.y + b.h/2 + 1);
    ctx.textBaseline = 'alphabetic';
    return b;
  }

  // Dark translucent card (same look as the menu panels).
  function panel(ctx, x,y,w,h){
    rr(ctx,x,y,w,h,18);
    ctx.fillStyle=PAL.panel; ctx.fill();
    ctx.lineWidth=2; ctx.strokeStyle=PAL.panelEdge; ctx.stroke(); ctx.lineWidth=1;
  }

  /* ============================================================
   * Editor state (module-local). CA.Maps.editor holds the ops/mask.
   * ============================================================ */
  const ed = {
    started:false,           // beginEdit called for current theme
    theme:'jungle',
    brush:24,                // world-px radius
    solid:true,              // true=paint, false=erase
    tool:'draw',             // 'draw'|'erase'|'prop' (mirrors CA.Maps.editor.tool)
    propKind:'tree',         // current prop when tool==='prop'
    name:'',
    focused:false,           // name field focused
    showLoad:false,          // load list overlay open
    keyHooked:false,
    msg:'', msgT:0,
    // preview rect in screen space (filled during render)
    pv:{ x:0,y:0,w:0,h:0 },
    // --- new editor UX state ---
    baseSeed:0,              // deterministic seed of the current base terrain
                             //   (so undo/redo can rebuild it exactly)
    shape:'round',           // brush shape: 'round' | 'square'
    mirror:false,            // horizontal symmetry painting
    grid:false,              // grid overlay toggle
    confirmClear:false,      // inline "really clear?" confirm flag
    confirmClearT:0,         // auto-dismiss timer for the confirm
    history:[],              // undo stack of {ops, props}
    future:[],               // redo stack
    cursor:null,             // last pointer pos over preview {x,y} (screen px)
    cursorInPv:false,        // is the cursor currently inside the preview?
    strokeOpen:false,        // a drag-stroke is in progress (for history coalescing)
    // HYBRID DOM toolbar: when true the canvas draws ONLY the paint preview
    // (terrain + cursor + props); the toolbar, name field, save button and load
    // overlay are rendered by the DOM module (js/menu-editor.js) and the canvas
    // toolbar hit-tests are skipped. The paint area becomes the full preview.
    domMode:true,
  };

  function setMsg(t){ ed.msg=t; ed.msgT=2.2; }

  const HISTORY_CAP = 24;    // how many undo steps we keep

  // Deep-ish snapshot of the editor backend's mutable map state (ops + props).
  function edSnapshot(){
    const E = CA.Maps && CA.Maps.editor; if (!E) return null;
    return {
      ops: Array.isArray(E.ops) ? E.ops.map(function(o){ return o; }) : [],
      props: Array.isArray(E.placedProps) ? E.placedProps.slice() : [],
    };
  }

  // Push the CURRENT state onto the undo stack (call BEFORE a mutating action).
  function edPushHistory(){
    const s = edSnapshot(); if (!s) return;
    ed.history.push(s);
    if (ed.history.length > HISTORY_CAP) ed.history.shift();
    ed.future.length = 0;   // any new edit invalidates the redo branch
  }

  // Regenerate the base terrain (deterministic) then replay a given op list.
  // This is how undo/redo and load rebuild an exact map state without depending
  // on maps.js internals (we drive the public Terrain + editor hooks only).
  function edRebuild(ops, props){
    const E = CA.Maps && CA.Maps.editor; if (!E) return;
    try{
      if (CA.Terrain && CA.Terrain.generate){
        if (CA.state) CA.state.theme = ed.theme;
        CA.Terrain.generate(ed.baseSeed>>>0, ed.theme);
      }
      for (let i=0;i<ops.length;i++){
        const op = ops[i];
        if (op.clear){ if (CA.Terrain.clearAll) CA.Terrain.clearAll(); }
        else if (op.prop){ /* props don't touch the mask */ }
        else if (op.solid && CA.Terrain.paintSolid) CA.Terrain.paintSolid(op.x,op.y,op.r);
        else if (!op.solid && CA.Terrain.carve)      CA.Terrain.carve(op.x,op.y,op.r);
      }
    }catch(e){}
    E.ops = ops.slice();
    E.placedProps = props.slice();
  }

  function edUndo(){
    if (!ed.history.length) { setMsg(T('Nincs mit visszavonni')); return; }
    const cur = edSnapshot(); if (cur) ed.future.push(cur);
    if (ed.future.length > HISTORY_CAP) ed.future.shift();
    const prev = ed.history.pop();
    edRebuild(prev.ops, prev.props);
    setMsg(T('Visszavonva'));
  }
  function edRedo(){
    if (!ed.future.length) { setMsg(T('Nincs mit megismételni')); return; }
    const cur = edSnapshot(); if (cur) ed.history.push(cur);
    const next = ed.future.pop();
    edRebuild(next.ops, next.props);
    setMsg(T('Megismételve'));
  }

  // Mirror a world-x across the world centre line (for symmetry painting).
  function mirrorX(x){ return C.WORLD_W - x; }

  // Apply one paint/erase stamp at (wx,wy), honouring brush shape + mirror.
  // A square brush is emulated with a tight cluster of round stamps (the only
  // mask primitive the public Terrain API exposes is a disc), so the visible
  // footprint becomes a filled square of side ~2r.
  function edStamp(E, wx, wy, r, solid){
    const stampOne = function(x,y){
      if (ed.shape==='square'){
        const half = r, step = Math.max(3, r*0.6);
        for (let oy=-half; oy<=half; oy+=step){
          for (let ox=-half; ox<=half; ox+=step){
            if (solid) E.paint(x+ox, y+oy, step, true);
            else       (E.erase ? E.erase(x+ox, y+oy, step) : E.paint(x+ox, y+oy, step, false));
          }
        }
      } else {
        if (solid) E.paint(x, y, r, true);
        else       (E.erase ? E.erase(x, y, r) : E.paint(x, y, r, false));
      }
    };
    stampOne(wx, wy);
    if (ed.mirror) stampOne(mirrorX(wx), wy);
  }

  // Flood the whole map flat: clear, then lay a solid ground slab to the water
  // line so the user gets a clean canvas to sculpt from.
  function edFlatGround(){
    const E = CA.Maps && CA.Maps.editor; if (!E) return;
    edPushHistory();
    if (E.clear) E.clear();
    const W=C.WORLD_W, groundY=(C.WATER_LEVEL!=null?C.WATER_LEVEL:C.WORLD_H*0.7);
    const r=46, step=r*1.3;
    for (let y=groundY+r; y<C.WORLD_H+r; y+=step){
      for (let x=0; x<=W; x+=step){
        E.paint(x, y, r, true);
      }
    }
    setMsg(T('Sík talaj kész'));
  }

  // Flood-fill style "fill": stamp solid ground across the whole visible area
  // (a cheap, predictable fill the editor's disc API can express).
  function edFill(){
    const E = CA.Maps && CA.Maps.editor; if (!E) return;
    edPushHistory();
    const r=46, step=r*1.3;
    for (let y=r; y<C.WORLD_H+r; y+=step){
      for (let x=0; x<=C.WORLD_W; x+=step){
        E.paint(x, y, r, true);
      }
    }
    setMsg(T('Kitöltve'));
  }

  /* ------------------------------------------------------------------ *
   * EDITOR design tokens — bring the level editor in line with the new
   * HTML/CSS menu system (css/menu.css). The shared canvas PAL stays the
   * same (navy bg + dark panels, used by every page), but the editor adopts
   * the menus' PURPLE primary accent and the 'Baloo 2' font so it reads as
   * one piece with the rebuilt menus. These are scoped to the editor only.
   * ------------------------------------------------------------------ */
  const EPAL = {
    accent:'#a06cff',   // menu --accent (purple) — primary action / selection
    accent2:'#7c4dff',  // menu --accent-2 (deeper purple)
    chipSel:'#7c4dff',  // selected chip bg (matches .chip.sel)
    chip:'rgba(255,255,255,0.07)',     // idle chip bg
    chipEdge:'rgba(255,255,255,0.14)', // chip border
    good:'#3fa45a', bad:'#a4503f', blue:'#3f86a4',
    ink:'#f3ead6', inkSoft:'#c7d6e4', inkDim:'#9fb3c6',
  };
  // 'Baloo 2' is @import-ed by menu.css; fall back gracefully if not yet loaded.
  const EFONT = "'Baloo 2','Segoe UI',system-ui,sans-serif";
  const ef = (spec)=> spec+" "+EFONT;   // e.g. ef('700 16px')

  // A chip-style toggle button matching the new .chip look (rounded, subtle
  // border, purple when selected). Returns nothing; caller stores the hitbox.
  function chip(ctx, b, label, opts){
    opts = opts || {};
    const sel = !!opts.sel, r = opts.r!=null?opts.r:10;
    rr(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fillStyle = sel ? (opts.selFill||EPAL.chipSel) : (opts.fill||EPAL.chip);
    ctx.fill();
    ctx.lineWidth = sel?0:1.5;
    if (!sel){ ctx.strokeStyle = EPAL.chipEdge; ctx.stroke(); }
    if (sel){ // soft glow ring like .chip.sel box-shadow
      rr(ctx, b.x, b.y, b.w, b.h, r);
      ctx.lineWidth=2; ctx.strokeStyle='rgba(160,108,255,0.55)'; ctx.stroke();
    }
    ctx.lineWidth=1;
    ctx.fillStyle = sel ? '#fff' : (opts.textColor||EPAL.inkSoft);
    // auto-shrink the font so the label never spills past the chip edges
    const baseFont = opts.font || '600 14px';
    const maxW = b.w - 8;                       // inner horizontal padding
    let fontStr = baseFont;
    ctx.font = ef(fontStr);
    if (ctx.measureText(label).width > maxW){
      const m = baseFont.match(/(\d+(?:\.\d+)?)px/);
      if (m){
        const basePx = parseFloat(m[1]);
        let px = basePx;
        while (px > 7 && ctx.measureText(label).width > maxW){
          px -= 0.5;
          fontStr = baseFont.replace(/(\d+(?:\.\d+)?)px/, px+'px');
          ctx.font = ef(fontStr);
        }
      }
    }
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, b.x+b.w/2, b.y+b.h/2+1);
    ctx.textBaseline='alphabetic';
  }

  // A solid pill action button in the Baloo font (used for Clear/Load/Save).
  function actionBtn(ctx, b, label, fill, textColor, font){
    const r = 12;
    rr(ctx, b.x+1, b.y+2, b.w, b.h, r); ctx.fillStyle='rgba(0,0,0,0.28)'; ctx.fill(); // shadow
    rr(ctx, b.x, b.y, b.w, b.h, r); ctx.fillStyle=fill; ctx.fill();
    rr(ctx, b.x, b.y, b.w, b.h/2, r); ctx.fillStyle='rgba(255,255,255,0.13)'; ctx.fill(); // gloss
    ctx.fillStyle = textColor||'#fff';
    ctx.font = ef(font||'700 15px');
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, b.x+b.w/2, b.y+b.h/2+1);
    ctx.textBaseline='alphabetic';
  }

  // Placeable props for the editor palette (kind matches CA.Maps.editor.propKind)
  const PROP_PALETTE = [
    { kind:'tree',      emoji:'🌳', name:'Fa' },
    { kind:'pine',      emoji:'🌲', name:'Fenyő' },
    { kind:'palm',      emoji:'🌴', name:'Pálma' },
    { kind:'cactus',    emoji:'🌵', name:'Kaktusz' },
    { kind:'crystal',   emoji:'💎', name:'Kristály' },
    { kind:'rockspire', emoji:'🪨', name:'Szikla' },
    { kind:'barrel',    emoji:'🛢️', name:'Hordó' },
    { kind:'snowman',   emoji:'⛄', name:'Hóember' },
    { kind:'igloo',     emoji:'🧊', name:'Iglu' },
    { kind:'penguin',   emoji:'🐧', name:'Pingvin' },
    { kind:'pumpkin',   emoji:'🎃', name:'Tök' },
    { kind:'tombstone', emoji:'🪦', name:'Sírkő' },
    { kind:'deadtree',  emoji:'🥀', name:'Halott fa' },
    { kind:'cryptlantern', emoji:'🏮', name:'Lámpás' },
    { kind:'cauldron',  emoji:'⚗️', name:'Üst' },
    { kind:'glowmushroom', emoji:'🍄', name:'Fénygomba' },
    { kind:'lollipop',  emoji:'🍭', name:'Nyalóka' },
    { kind:'candycane', emoji:'🍬', name:'Cukor' },
    { kind:'cupcake',   emoji:'🧁', name:'Süti' },
    { kind:'starfish',  emoji:'⭐', name:'Csillag' },
    { kind:'tikitotem', emoji:'🗿', name:'Totem' },
    { kind:'bigfern',   emoji:'🌿', name:'Páfrány' },
    { kind:'chest',     emoji:'🧰', name:'Láda' },
  ];

  // push the local tool/prop selection into the maps.js editor backend
  function syncEditorTool(){
    const E = CA.Maps && CA.Maps.editor;
    if (!E) return;
    E.tool = ed.tool;
    if (ed.tool==='prop') E.propKind = ed.propKind;
  }

  // after ANY match the terrain belongs to that match (craters, other theme) —
  // force a fresh beginEdit on the next editor entry or saves become garbage.
  try{ CA.events.on('gameStart', function(){ ed.started=false; }); }catch(e){}

  function ensureEditor(){
    if (!(CA.Maps && CA.Maps.editor)) return false;
    if (!ed.started){
      try {
        // ADOPT the seed beginEdit rolled (it already generated the base from
        // it) — rolling a SECOND seed here regenerated DIFFERENT base hills
        // than the one save() persisted, so loaded maps never matched (QA).
        CA.Maps.editor.beginEdit(ed.theme);
        ed.baseSeed = (CA.Maps.editor.baseSeed>>>0) || ((Math.random()*1e9)|0);
        ed.started=true;
        ed.history.length=0; ed.future.length=0;   // fresh base ⇒ fresh history
      } catch(e){ return false; }
    }
    syncEditorTool();
    return true;
  }

  // map a screen-space preview point to world coords
  function pvToWorld(px,py){
    const W = C.WORLD_W, H = C.WORLD_H;
    const fx = (px - ed.pv.x) / ed.pv.w;
    const fy = (py - ed.pv.y) / ed.pv.h;
    return { x: fx*W, y: fy*H, fx, fy };
  }

  CA.Screens = {
    init(){
      ed.theme = (CA.Maps && CA.Maps.editor && CA.Maps.editor.theme) || 'grass';
      this._hookKeys();
      hookScroll();
    },

    list(){ return ['editor']; },

    isTextInputActive(){ return !!ed.focused; },

    /* keydown listener for the editor name field (mirrors ui.js pattern) */
    _hookKeys(){
      if (ed.keyHooked || typeof window==='undefined') return;
      ed.keyHooked = true;
      window.addEventListener('keydown', (e)=>{
        // editor-screen keyboard shortcuts (only when the editor is the active
        // screen and the name field is NOT being typed into):
        const onEditor = !!(CA.UI && CA.UI.screen && CA.UI.screen()==='editor');
        // Don't hijack keys while a real DOM input is focused (the hybrid
        // toolbar's name field) — otherwise 'g'/'m' typed into the name would
        // also toggle grid/mirror.
        const ae = (typeof document!=='undefined') ? document.activeElement : null;
        const domTyping = !!(ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.isContentEditable));
        if (onEditor && !ed.focused && !domTyping){
          const lk = (e.key||'').toLowerCase();
          if ((e.ctrlKey||e.metaKey) && lk==='z' && !e.shiftKey){ edUndo(); e.preventDefault(); return; }
          if ((e.ctrlKey||e.metaKey) && (lk==='y' || (lk==='z' && e.shiftKey))){ edRedo(); e.preventDefault(); return; }
          if (lk==='g'){ ed.grid=!ed.grid; e.preventDefault(); return; }
          if (lk==='m'){ ed.mirror=!ed.mirror; e.preventDefault(); return; }
        }
        if (!ed.focused) return;
        const k = e.key;
        if (k==='Backspace'){ ed.name = ed.name.slice(0,-1); e.preventDefault(); return; }
        if (k==='Enter' || k==='Escape'){ ed.focused=false; e.preventDefault(); return; }
        if (k.length===1 && ed.name.length<24){
          // allow letters, numbers, space, dash, underscore
          if (/[\w \-áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(k)){ ed.name += k; e.preventDefault(); }
        }
      });
    },

    render(name, ctx){
      // Detect screen ENTRY (name changed since last frame) to kick off the
      // leaderboard fetch. Cached scores show instantly; the fetch refreshes.
      if (name !== this._lastScreen){
        if (name==='editor'){
          // entering the editor: clear transient overlays so nothing lingers
          ed.confirmClear=false; ed.cursorInPv=false;
        }
        this._lastScreen = name;
      }
      // SELF-HEAL: make sure a base terrain exists the instant the editor is on
      // screen. The DOM toolbar's onShow() also calls ensureEditor(), but if the
      // editor backend (CA.Maps.editor) wasn't ready at that moment the preview
      // would be stuck on the flat-green placeholder ("no map"). ensureEditor()
      // guards on ed.started, so this is a cheap no-op once the base is built.
      if (name==='editor' && !ed.started){ try{ ensureEditor(); }catch(e){} }
      ctx.save();
      if (name==='editor')    this._renderEditor(ctx);
      // fade transient message
      if (ed.msgT>0){ ed.msgT -= 1/60; }
      // auto-dismiss the inline clear confirm if the user ignores it
      if (ed.confirmClear && ed.confirmClearT>0){ ed.confirmClearT -= 1/60; if (ed.confirmClearT<=0) ed.confirmClear=false; }
      ctx.restore();
    },

    handlePointer(name, p){
      if (!p) return false;
      // If this pointerdown was actually the end of a scroll-drag, swallow it
      // so a flick doesn't accidentally trigger a button underneath.
      if (scroll.drag && scroll.drag.moved>8){ return true; }
      // Back button common to all pages.
      if (inRect(p, backRect())){
        if (CA.UI && CA.UI.setScreen) CA.UI.setScreen('main');
        return true;
      }
      if (name==='editor')         return this._hitEditor(p);
      return false;
    },

    /* ========================================================== *
     * #2 LEVEL EDITOR
     * ========================================================== */
    _renderEditor(ctx){
      const W=C.VIEW_W, H=C.VIEW_H;
      bg(ctx, T('✏️ Pályaszerkesztő'));
      // The DOM toolbar (menu-editor.js) has its OWN back button, so in hybrid
      // (domMode) the canvas one would just show through behind the panel as a
      // big duplicate (Jani). Only draw the canvas back button in non-DOM mode.
      if (!ed.domMode) backButton(ctx);

      const hasEd = !!(CA.Maps && CA.Maps.editor);

      // ============================================================ *
       // HYBRID DOM MODE: the toolbar / name / save / load overlay all live
       // in the DOM (js/menu-editor.js). The canvas draws ONLY the paint
       // preview. We reserve a left band the same width as the DOM panel so the
       // preview is centred in the remaining space and never sits under it.
       if (ed.domMode){
         this._edButtons = {};            // no canvas toolbar hitboxes in DOM mode
         this._renderEditorPreview(ctx, hasEd);
         return;
       }
      // ============================================================ */

      // subtitle under the title (matches the menus' muted helper lines)
      ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      ctx.fillStyle=EPAL.inkDim; ctx.font=ef('600 14px');
      ctx.fillText(T('Rajzolj terepet, rakj le tárgyakat, mentsd el a pályád.'), W/2, 80);

      // ----- left toolbar (a single clean grouped panel column) -----
      // 3-column chip grids keep the (up to 10) themes + 7 props + 6 extras tidy.
      // The full panel is ~623px tall (bottom ~731px with 10 themes). On short
      // backings (VIEW_H below that) it would clip the Extras/Actions rows, so
      // the panel is rendered inside a clipped, vertically SCROLLABLE viewport
      // (see below) — the Clear/Load actions are always reachable.
      const sbX=24, sbY=108, sbW=270;
      const PAD = 16;                          // inner left/right padding
      const labX = sbX+PAD;                    // x for left-aligned labels
      const colX = sbX+PAD;                    // x for full-width controls
      const colW = sbW-PAD*2;                  // width for full-width controls
      const HEAD = 20;                         // heading advance
      const SECT = 6;                          // gap after a section
      // Pre-compute the panel height from the (deterministic) content so the
      // panel always wraps its toolbar exactly (mirrors the row math below).
      const _themeN = ((CA.Maps && CA.Maps.list) ? CA.Maps.list() : ['grass']).length;
      const _themeRows = Math.ceil(_themeN/3);
      const _propRows  = Math.ceil(PROP_PALETTE.length/3);
      const _exRows    = Math.ceil(6/3);
      let _ch = 26;                            // ty start offset (sbY+26)
      _ch += HEAD + _themeRows*(28+5) + SECT;  // themes
      _ch += HEAD + 34 + SECT;                 // tool seg
      _ch += HEAD + _propRows*(28+5) + SECT;   // props
      _ch += HEAD + 30 + 6 + 30 + SECT;        // brush (shape row + slider)
      _ch += HEAD + _exRows*(30+5) + SECT;     // extras
      _ch += HEAD + 34;                        // actions
      _ch += 12;                               // bottom inset
      const sbH = _ch;

      // --- toolbar vertical SCROLL (short-screen safety) ---------------------
      // On short backings (VIEW_H < panel bottom) the lower sections (Extras,
      // Actions) would be clipped & untappable. We scroll ONLY the toolbar:
      // every chip/button Y is offset by `tSy`, the panel region is clipped,
      // and the hit-tests subtract the same offset (see _hitEditor). The
      // preview + bottom bar stay anchored on the right, unaffected.
      // We reuse the file's `scroll` infra (page 'editor' is registered).
      const sbBottomMargin = 16;                 // gap below the panel
      // visible viewport height for the toolbar within the canvas
      const sbViewH = Math.max(120, H - sbY - sbBottomMargin);
      // content overflow → how far we can scroll
      const sbOverflow = Math.max(0, sbH - sbViewH);
      scroll.max['editor'] = sbOverflow;         // wheel/drag clamp target
      clampScroll('editor');
      const tSy = (sbOverflow>0) ? scrollYOf('editor') : 0;  // applied to toolbar Y

      // draw the panel at the scrolled position, clipped to the viewport so it
      // never paints over the title / below the canvas.
      ctx.save();
      ctx.beginPath();
      ctx.rect(sbX-6, sbY-2, sbW+12, sbViewH+2);
      ctx.clip();
      this._edScrollY = tSy;                      // stash for hit-testing
      this._edScrollClip = { x:sbX-6, y:sbY-2, w:sbW+12, h:sbViewH+2 };
      panel(ctx, sbX, sbY - tSy, sbW, sbH);

      // section heading (eyebrow style: small, muted, uppercase) + thin rule
      const heading = (text, hy)=>{
        ctx.textAlign='left'; ctx.textBaseline='alphabetic';
        ctx.fillStyle=EPAL.inkDim; ctx.font=ef('700 11px');
        ctx.fillText(text.toUpperCase(), labX, hy);
        rr(ctx, labX, hy+7, colW, 1.5, 1); ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fill();
      };

      this._edButtons = {}; // collect hitboxes for handlePointer
      // All toolbar Y positions start from the scrolled origin, so the whole
      // column (chips, sliders, action row) moves together with `tSy`. The
      // hitboxes recorded below are therefore in *scrolled* (on-screen) space,
      // matching the pointer coords directly — no extra offset needed at hit
      // time, but we re-clamp scroll there so render/hit agree on the same tSy.
      let ty = sbY+26 - tSy;

      // --- Base theme (3-col chip grid) ---
      heading(T('Alap téma'), ty); ty+=HEAD;
      const themes = (CA.Maps && CA.Maps.list) ? CA.Maps.list() : ['grass'];
      const tCols=3, tGap=5, tW=(colW-tGap*(tCols-1))/tCols, tH=28;
      const tBtns = [];
      for (let i=0;i<themes.length;i++){
        const th = themes[i];
        const col=i%tCols, row=Math.floor(i/tCols);
        const b={ x:colX+col*(tW+tGap), y:ty+row*(tH+5), w:tW, h:tH, theme:th };
        const active = (ed.theme===th);
        const t = (CA.Maps && CA.Maps.get) ? CA.Maps.get(th) : ((CA.Maps && CA.Maps[th])||{});
        // localize the theme display name (maps.js addEN: 'Mező'→'Meadow', …)
        const lab = ((t.emoji?t.emoji+' ':'') + (t.name?T(t.name):th));
        chip(ctx, b, lab, { sel:active, font:'600 10px', r:8, textColor:EPAL.ink });
        tBtns.push(b);
      }
      this._edButtons.themes = tBtns;
      ty += Math.ceil(themes.length/tCols)*(tH+5) + SECT;

      // --- Tool: draw / erase toggle (segmented control) ---
      heading(T('Eszköz'), ty); ty+=HEAD;
      const segGap=6;
      const drawB={ x:colX, y:ty, w:(colW-segGap)/2, h:34 };
      const eraseB={ x:drawB.x+drawB.w+segGap, y:ty, w:(colW-segGap)/2, h:34 };
      const drawSel = (ed.tool==='draw'), eraseSel = (ed.tool==='erase');
      chip(ctx, drawB,  T('✏️ Rajzol'), { sel:drawSel,  selFill:EPAL.good, font:'700 13px' });
      chip(ctx, eraseB, T('🧽 Radír'),  { sel:eraseSel, selFill:EPAL.bad,  font:'700 13px' });
      this._edButtons.draw=drawB; this._edButtons.erase=eraseB;
      ty += 34+SECT;

      // --- Prop palette (3-col chip grid) ---
      heading(T('Tárgyak'), ty); ty+=HEAD;
      const pCols = 3, pGap = 5;
      const pW = (colW - pGap*(pCols-1))/pCols, pH = 28;
      const propBtns = [];
      for (let i=0;i<PROP_PALETTE.length;i++){
        const pr = PROP_PALETTE[i];
        const col = i%pCols, row = Math.floor(i/pCols);
        const b = { x:colX + col*(pW+pGap), y:ty + row*(pH+5), w:pW, h:pH, propKind:pr.kind };
        const sel = (ed.tool==='prop' && ed.propKind===pr.kind);
        chip(ctx, b, pr.emoji+' '+T(pr.name), { sel:sel, font:'600 10px', r:8, textColor:EPAL.ink });
        propBtns.push(b);
      }
      this._edButtons.props = propBtns;
      ty += Math.ceil(PROP_PALETTE.length/pCols)*(pH+5) + SECT;

      // --- Brush size (heading + value pill, live swatch + shape, then slider) ---
      heading(T('Ecsetméret'), ty); ty+=HEAD;
      // value pill on the right of the heading row
      ctx.textAlign='right'; ctx.textBaseline='alphabetic';
      ctx.fillStyle=EPAL.accent; ctx.font=ef('800 13px');
      ctx.fillText(ed.brush+' px', labX+colW, ty-HEAD);
      // row: [live brush preview swatch] [● round] [■ square]
      const swW=30, swH=30;
      const swatch={ x:colX, y:ty, w:swW, h:swH };
      rr(ctx, swatch.x, swatch.y, swatch.w, swatch.h, 8);
      ctx.fillStyle='rgba(0,0,0,0.30)'; ctx.fill();
      ctx.lineWidth=1.5; ctx.strokeStyle=EPAL.chipEdge; rr(ctx,swatch.x,swatch.y,swatch.w,swatch.h,8); ctx.stroke(); ctx.lineWidth=1;
      // a circle/square scaled to show RELATIVE brush size (6..80 → small..fills)
      const swR = (3 + (ed.brush-6)/(80-6) * (swW/2-4));
      ctx.fillStyle='rgba(160,108,255,0.85)';
      if (ed.shape==='square'){ const s=swR*2; ctx.fillRect(swatch.x+swW/2-swR, swatch.y+swH/2-swR, s, s); }
      else { ctx.beginPath(); ctx.arc(swatch.x+swW/2, swatch.y+swH/2, swR, 0, Math.PI*2); ctx.fill(); }
      // shape chips
      const shGap=6, shX=swatch.x+swW+8, shW=(colW-swW-8-shGap)/2;
      const roundB={ x:shX, y:ty, w:shW, h:swH };
      const squareB={ x:roundB.x+shW+shGap, y:ty, w:shW, h:swH };
      chip(ctx, roundB,  T('● Kör'),     { sel:ed.shape==='round',  font:'700 12px', r:8 });
      chip(ctx, squareB, T('■ Négyzet'), { sel:ed.shape==='square', font:'700 11px', r:8 });
      this._edButtons.shapeRound=roundB; this._edButtons.shapeSquare=squareB;
      ty += swH+6;
      // slider: − [track] +
      const minusB={ x:colX, y:ty, w:32, h:30 };
      const plusB ={ x:sbX+sbW-PAD-32, y:ty, w:32, h:30 };
      const trackX=minusB.x+minusB.w+8, trackW=plusB.x-trackX-8, trackY=ty+9, trackH=12;
      chip(ctx, minusB, '−', { fill:EPAL.chip, textColor:EPAL.ink, font:'800 20px', r:9 });
      chip(ctx, plusB,  '+', { fill:EPAL.chip, textColor:EPAL.ink, font:'800 20px', r:9 });
      rr(ctx, trackX, trackY, trackW, trackH, 6); ctx.fillStyle='rgba(0,0,0,0.30)'; ctx.fill();
      const bf = Math.max(0,Math.min(1,(ed.brush-6)/(80-6)));
      rr(ctx, trackX, trackY, Math.max(trackH,trackW*bf), trackH, 6); ctx.fillStyle=EPAL.accent; ctx.fill();
      // knob
      const knobX = trackX + Math.max(trackH/2, trackW*bf);
      ctx.beginPath(); ctx.arc(knobX, trackY+trackH/2, 8, 0, Math.PI*2);
      ctx.fillStyle='#fff'; ctx.fill();
      ctx.lineWidth=2; ctx.strokeStyle=EPAL.accent; ctx.stroke(); ctx.lineWidth=1;
      this._edButtons.brushMinus=minusB; this._edButtons.brushPlus=plusB;
      // clickable track (tap anywhere to set brush size); generous vertical hitbox
      this._edButtons.brushTrack={ x:trackX, y:ty-2, w:trackW, h:34, tx:trackX, tw:trackW };
      ty += 30+SECT;

      // --- Extras: undo/redo, fill/flat, mirror/grid (3-col chip grid) ---
      heading(T('Extrák'), ty); ty+=HEAD;
      const xGap=5, xW=(colW-xGap*2)/3, xH=30;
      const exAt=(i)=>({ x:colX+(i%3)*(xW+xGap), y:ty+Math.floor(i/3)*(xH+5), w:xW, h:xH });
      const undoB=exAt(0), redoB=exAt(1), fillB=exAt(2),
            flatB=exAt(3), mirrorB=exAt(4), gridB=exAt(5);
      const canUndo = ed.history.length>0, canRedo = ed.future.length>0;
      ctx.save(); ctx.globalAlpha = canUndo?1:0.4;
      chip(ctx, undoB, T('↶ Vissza'), { font:'700 11px', r:8 }); ctx.restore();
      ctx.save(); ctx.globalAlpha = canRedo?1:0.4;
      chip(ctx, redoB, T('↷ Újra'),   { font:'700 11px', r:8 }); ctx.restore();
      chip(ctx, fillB, T('🪣 Kitölt'),    { font:'700 11px', r:8 });
      chip(ctx, flatB, T('⬓ Sík talaj'),  { font:'700 10px', r:8 });
      chip(ctx, mirrorB, T('🪞 Tükrözés'), { sel:ed.mirror, selFill:EPAL.blue, font:'700 10px', r:8 });
      chip(ctx, gridB,   T('# Rács'),      { sel:ed.grid,   selFill:EPAL.blue, font:'700 11px', r:8 });
      this._edButtons.undo=undoB; this._edButtons.redo=redoB;
      this._edButtons.fill=fillB; this._edButtons.flat=flatB;
      this._edButtons.mirror=mirrorB; this._edButtons.grid=gridB;
      ty += _exRows*(xH+5) + SECT;

      // --- Actions: clear / load (clear becomes an inline confirm) ---
      heading(T('Műveletek'), ty); ty+=HEAD;
      const actGap=6;
      const clearB={ x:colX, y:ty, w:(colW-actGap)/2, h:34 };
      const loadB ={ x:clearB.x+clearB.w+actGap, y:ty, w:(colW-actGap)/2, h:34 };
      if (ed.confirmClear){
        // inline two-step confirm (no native alert): Clear → "Yes, clear",
        // Load → "Cancel".
        actionBtn(ctx, clearB, T('Igen, törlés'), EPAL.bad,  '#fff', '700 12px');
        actionBtn(ctx, loadB,  T('Mégse'),        EPAL.grey, '#fff', '700 13px');
      } else {
        actionBtn(ctx, clearB, T('🗑 Törlés'),   EPAL.bad,  '#fff', '700 13px');
        actionBtn(ctx, loadB,  T('📂 Betöltés'), EPAL.blue, '#fff', '700 13px');
      }
      this._edButtons.clear=clearB; this._edButtons.load=loadB; ty+=46;

      // end the toolbar clip/scroll region
      ctx.restore();

      // scrollbar hint when the toolbar overflows (so users know it scrolls)
      if (sbOverflow>0){
        const trkX = sbX+sbW+4, trkY = sbY, trkH = sbViewH;
        rr(ctx, trkX, trkY, 4, trkH, 2); ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fill();
        const thumbH = Math.max(28, trkH * (sbViewH/sbH));
        const thumbY = trkY + (trkH-thumbH) * (sbOverflow>0 ? (tSy/sbOverflow) : 0);
        rr(ctx, trkX, thumbY, 4, thumbH, 2); ctx.fillStyle='rgba(160,108,255,0.55)'; ctx.fill();
      }

      // ----- center: preview -----
      // Narrow-width safety: anchor the preview to the toolbar's right edge but
      // floor its width so it (and the bottom bar buttons pinned to pvX/pvW)
      // never collapse or render off-canvas. On very narrow backings we also
      // pull pvX left (toward the toolbar) to claw back room before flooring.
      const PV_MIN_W = 360, PV_GAP = 26;
      let pvX = sbX+sbW+PV_GAP, pvY=116;
      let pvW = W - pvX - PV_GAP;
      if (pvW < PV_MIN_W){
        // try to reclaim space by shrinking the left gap (min 8px) before we
        // give up and let the preview overlap the (scrollable) toolbar.
        const wantX = W - PV_GAP - PV_MIN_W;
        pvX = Math.max(sbX+sbW+8, Math.min(pvX, wantX));
        pvW = Math.max(PV_MIN_W, W - pvX - PV_GAP);
      }
      const pvH=Math.round(pvW * (C.WORLD_H/C.WORLD_W));
      ed.pv = { x:pvX, y:pvY, w:pvW, h:pvH };
      // framed preview (purple-tinted border to match the new accent)
      rr(ctx, pvX-4, pvY-4, pvW+8, pvH+8, 16);
      ctx.fillStyle='rgba(160,108,255,0.18)'; ctx.fill();
      ctx.lineWidth=2; ctx.strokeStyle='rgba(160,108,255,0.35)';
      rr(ctx, pvX-4, pvY-4, pvW+8, pvH+8, 16); ctx.stroke(); ctx.lineWidth=1;
      // preview backdrop (sky)
      ctx.save();
      rr(ctx, pvX, pvY, pvW, pvH, 12); ctx.clip();
      const pg = ctx.createLinearGradient(0,pvY,0,pvY+pvH);
      pg.addColorStop(0,'#bfe6ff'); pg.addColorStop(1,'#eaf7ff');
      ctx.fillStyle=pg; ctx.fillRect(pvX,pvY,pvW,pvH);

      // draw schematic terrain by sampling CA.Terrain.isSolid on a coarse grid
      if (CA.Terrain && CA.Terrain.isSolid && ed.started){
        const stepX = 5, stepY = 7;            // screen-px sampling steps
        const wx = C.WORLD_W/pvW, wy = C.WORLD_H/pvH;
        ctx.fillStyle='#7fae5a';
        for (let sx=0; sx<pvW; sx+=stepX){
          for (let sy=0; sy<pvH; sy+=stepY){
            const X=(sx)*wx, Y=(sy)*wy;
            let solid=false;
            try{ solid = CA.Terrain.isSolid(X,Y); }catch(e){}
            if (solid){ ctx.fillRect(pvX+sx, pvY+sy, stepX, stepY); }
          }
        }
      } else if (!ed.started){
        // schematic placeholder if we couldn't start the editor
        ctx.fillStyle='#9bc47a';
        ctx.fillRect(pvX, pvY+pvH*0.6, pvW, pvH*0.4);
      }
      // water line schematic
      const wl = (CA.config.WATER_LEVEL/C.WORLD_H)*pvH;
      ctx.fillStyle='rgba(90,170,230,0.35)';
      ctx.fillRect(pvX, pvY+wl, pvW, pvH-wl);
      // placed props (emoji markers, mapped from world -> preview space)
      const placed = (CA.Maps && CA.Maps.editor && CA.Maps.editor.placedProps) || [];
      if (placed.length){
        ctx.textAlign='center'; ctx.textBaseline='alphabetic'; ctx.font='16px system-ui';
        for (const pp of placed){
          const def = PROP_PALETTE.find(d=>d.kind===pp.kind);
          const px = pvX + (pp.x/C.WORLD_W)*pvW;
          const py = pvY + (pp.y/C.WORLD_H)*pvH;
          ctx.fillText(def?def.emoji:'❓', px, py);
        }
      }

      // grid overlay (alignment helper) — drawn inside the clipped preview
      if (ed.grid){
        ctx.lineWidth=1; ctx.strokeStyle='rgba(255,255,255,0.16)';
        const cells=10;
        ctx.beginPath();
        for (let i=1;i<cells;i++){
          const gx=pvX+pvW*i/cells; ctx.moveTo(gx,pvY); ctx.lineTo(gx,pvY+pvH);
        }
        const rows=Math.round(cells*(pvH/pvW));
        for (let j=1;j<rows;j++){
          const gy=pvY+pvH*j/rows; ctx.moveTo(pvX,gy); ctx.lineTo(pvX+pvW,gy);
        }
        ctx.stroke(); ctx.lineWidth=1;
      }

      // mirror axis (centre line) when symmetry painting is on
      if (ed.mirror){
        const mx=pvX+pvW/2;
        ctx.save();
        ctx.setLineDash([6,5]); ctx.lineWidth=2; ctx.strokeStyle='rgba(63,134,164,0.85)';
        ctx.beginPath(); ctx.moveTo(mx,pvY); ctx.lineTo(mx,pvY+pvH); ctx.stroke();
        ctx.restore();
      }

      // live cursor brush preview (a ring/box at the actual brush radius), plus
      // its mirror twin when symmetry is on. Only while the cursor is over the
      // canvas (desktop hover) so touch isn't cluttered.
      if (ed.cursorInPv && ed.cursor && ed.tool!=='prop'){
        const scale = pvW/C.WORLD_W;          // world→preview px
        const rPv = Math.max(2, ed.brush*scale);
        const isErase = (ed.tool==='erase');
        const drawCursor = (cx)=>{
          ctx.lineWidth=2; ctx.strokeStyle = isErase ? 'rgba(220,120,100,0.95)' : 'rgba(160,108,255,0.95)';
          ctx.fillStyle   = isErase ? 'rgba(220,120,100,0.18)' : 'rgba(160,108,255,0.18)';
          if (ed.shape==='square'){
            ctx.beginPath(); ctx.rect(cx-rPv, ed.cursor.y-rPv, rPv*2, rPv*2); ctx.fill(); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.arc(cx, ed.cursor.y, rPv, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          }
          ctx.lineWidth=1;
        };
        drawCursor(ed.cursor.x);
        if (ed.mirror){
          const mcx = (pvX+pvW) - (ed.cursor.x - pvX);   // reflected across centre
          ctx.save(); ctx.globalAlpha=0.6; drawCursor(mcx); ctx.restore();
        }
      }
      ctx.restore();

      // floating tool/brush badge near the cursor (outside the clip so the text
      // is never cut off at the canvas edge)
      if (ed.cursorInPv && ed.cursor){
        const tlabel = ed.tool==='prop'
          ? ((PROP_PALETTE.find(d=>d.kind===ed.propKind)||{}).emoji||'')+' '+T((PROP_PALETTE.find(d=>d.kind===ed.propKind)||{}).name||ed.propKind)
          : (ed.tool==='erase' ? T('🧽 Radír')+' '+ed.brush+'px' : T('✏️ Rajzol')+' '+ed.brush+'px');
        ctx.font=ef('700 12px'); ctx.textAlign='left'; ctx.textBaseline='middle';
        const tw=ctx.measureText(tlabel).width+16;
        let bx=ed.cursor.x+14, by=ed.cursor.y-20;
        if (bx+tw>pvX+pvW) bx=ed.cursor.x-14-tw;          // flip if it would overflow right
        rr(ctx, bx, by-11, tw, 22, 7); ctx.fillStyle='rgba(8,22,32,0.88)'; ctx.fill();
        ctx.lineWidth=1; ctx.strokeStyle=EPAL.chipEdge; rr(ctx,bx,by-11,tw,22,7); ctx.stroke(); ctx.lineWidth=1;
        ctx.fillStyle=EPAL.ink; ctx.fillText(tlabel, bx+8, by+1);
        ctx.textBaseline='alphabetic';
      }

      // usage hint — drawn as a subtle pill INSIDE the bottom of the preview so it
      // never collides with the "Név:" label / action bar below it (#editor-overlap).
      const toolHint = ed.tool==='prop'
        ? (T('koppints a lerakáshoz: ')+T((PROP_PALETTE.find(d=>d.kind===ed.propKind)||{}).name||ed.propKind))
        : (ed.tool==='erase' ? T('radírozás') : T('rajzolás'));
      ctx.font=ef('600 12px'); ctx.textAlign='center'; ctx.textBaseline='middle';
      const _hint = T('Húzd / koppints a felületen: ')+toolHint;
      const _hw = ctx.measureText(_hint).width + 18;
      const _hx = pvX+pvW/2, _hy = pvY+pvH-13;
      rr(ctx, _hx-_hw/2, _hy-10, _hw, 20, 8); ctx.fillStyle='rgba(8,22,32,0.72)'; ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.88)'; ctx.fillText(_hint, _hx, _hy);
      ctx.textBaseline='alphabetic';

      // ----- bottom bar: name field + save (a touch lower for breathing room) -----
      // A map is only EDITED + SAVED here — there is intentionally NO "Play this"
      // button: a custom map needs the full New-Game settings (mode, teams, rules,
      // etc.), so players launch it from New Game, not the editor. Narrow-width
      // safety: keep name + save fully ON-canvas; drop save below the name field
      // when there isn't room for them side-by-side.
      const barRight = W - 8;                 // never paint past here
      const avail = Math.max(60, barRight - pvX);  // never negative
      const bGapA = 14;
      // layout tiers: 0 = name | save on one row; 1 = name row, save below.
      let layout = 0;
      let saveW = 160;
      let nameW = pvW*0.58;
      if (nameW + bGapA + saveW > avail){
        // try shrinking save + name field to keep one row
        saveW = 130; nameW = Math.max(140, avail - bGapA - saveW);
        if (nameW + bGapA + saveW > avail){
          // one row impossible → name field full width, save drops below it
          layout = 1; nameW = avail; saveW = Math.min(220, avail);
        }
      }
      const barY = pvY+pvH+42;
      // name label
      ctx.textAlign='left'; ctx.fillStyle=EPAL.inkSoft; ctx.font=ef('700 13px');
      ctx.textBaseline='alphabetic';
      ctx.fillText(T('Név:'), pvX, barY-22);
      // name field (matches .input: dark well, purple focus ring)
      const nf={ x:pvX, y:barY-14, w:nameW, h:44 };
      rr(ctx, nf.x, nf.y, nf.w, nf.h, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fill();
      if (ed.focused){ // focus ring like .input:focus
        rr(ctx, nf.x-3, nf.y-3, nf.w+6, nf.h+6, 13);
        ctx.lineWidth=3; ctx.strokeStyle='rgba(160,108,255,0.45)'; ctx.stroke(); ctx.lineWidth=1;
      }
      rr(ctx, nf.x, nf.y, nf.w, nf.h, 10);
      ctx.lineWidth=2; ctx.strokeStyle = ed.focused?EPAL.accent:'rgba(255,255,255,0.12)'; ctx.stroke(); ctx.lineWidth=1;
      ctx.save(); rr(ctx, nf.x, nf.y, nf.w, nf.h, 10); ctx.clip();
      ctx.font=ef('600 17px'); ctx.textAlign='left'; ctx.textBaseline='middle';
      if (ed.name){ ctx.fillStyle=EPAL.ink; ctx.globalAlpha=1; }
      else { ctx.fillStyle=EPAL.inkDim; ctx.globalAlpha=ed.focused?0:1; }
      const shown = ed.name || T('pálya neve…');
      ctx.fillText(shown + (ed.focused && ed.name && (Math.floor(Date.now()/400)%2===0)?'|':''), nf.x+14, nf.y+nf.h/2+1);
      // blinking caret in empty focused field
      if (ed.focused && !ed.name && (Math.floor(Date.now()/400)%2===0)){
        ctx.globalAlpha=1; ctx.fillStyle=EPAL.ink; ctx.fillText('|', nf.x+14, nf.y+nf.h/2+1);
      }
      ctx.globalAlpha=1; ctx.restore(); ctx.textBaseline='alphabetic';
      this._edButtons.nameField=nf;

      // Save button. Beside the name field when there's room, otherwise on a
      // second row under the (full-width) name field. Clamp so its right edge
      // never exceeds barRight.
      const saveFont = saveW<140 ? '700 14px' : '700 16px';
      let saveB, bottomY;                      // bottomY: y used for the transient toast
      if (layout===0){
        // single row: name | save
        saveB = { x:nf.x+nf.w+bGapA, y:barY-14, w:saveW, h:44 };
        bottomY = barY+30;
      } else {
        // name row, then save on a second row
        const rowY = barY + 44;
        saveB = { x:pvX, y:rowY, w:saveW, h:44 };
        bottomY = rowY + 44;
      }
      // Final safety clamp: never let the button cross barRight.
      if (saveB.x + saveB.w > barRight){ saveB.w = Math.max(80, barRight - saveB.x); }
      actionBtn(ctx, saveB, T('💾 Mentés'), EPAL.good, '#fff', saveFont);
      this._edButtons.save=saveB;

      // transient message — a pinned toast clamped to stay ON-canvas even when
      // VIEW_H is small (it used to draw at barY+52 and fall off the bottom).
      if (ed.msgT>0 && ed.msg){
        ctx.font=ef('700 15px'); ctx.textAlign='left'; ctx.textBaseline='middle';
        const mw = ctx.measureText(ed.msg).width + 22;
        let my = bottomY + 22;
        // clamp so the whole pill stays within the canvas height
        if (my+16 > H-8) my = H-24;
        if (my < 60) my = 60;
        let mx = pvX;
        if (mx+mw > W-8) mx = Math.max(8, W-8-mw);
        ctx.globalAlpha = Math.min(1, ed.msgT);
        rr(ctx, mx, my-15, mw, 30, 9); ctx.fillStyle='rgba(8,22,32,0.92)'; ctx.fill();
        ctx.lineWidth=1; ctx.strokeStyle=EPAL.accent; rr(ctx,mx,my-15,mw,30,9); ctx.stroke(); ctx.lineWidth=1;
        ctx.fillStyle=EPAL.accent; ctx.fillText(ed.msg, mx+11, my+1);
        ctx.globalAlpha=1; ctx.textBaseline='alphabetic';
      }

      // ----- load list overlay -----
      if (ed.showLoad) this._renderLoadOverlay(ctx);

      if (!hasEd){
        ctx.textAlign='center'; ctx.fillStyle=PAL.bad; ctx.font=ef('700 18px');
        ctx.fillText(T('A szerkesztő nem érhető el (CA.Maps.editor hiányzik).'), W/2, H-20);
      }
    },

    /* ---------------------------------------------------------------- *
     * HYBRID preview-only render (DOM toolbar mode). Draws JUST the paint
     * surface (terrain schematic + props + grid/mirror guides + live brush
     * cursor + usage hint). The toolbar, name field, save button and the
     * saved-maps list are all owned by the DOM (js/menu-editor.js). We reserve
     * a left band (`PANEL_BAND`) the width of the DOM panel so the preview is
     * centred in the remaining canvas and never hides under the panel.
     * ---------------------------------------------------------------- */
    _renderEditorPreview(ctx, hasEd){
      const W=C.VIEW_W, H=C.VIEW_H;
      // Canvas coords are BACKING px (= CSS px × dpr, dpr capped ~1.75). The DOM
      // toolbar is laid out in CSS px, so to reserve matching bands we convert
      // CSS sizes → backing px with the live dpr (canvas.width / cssWidth).
      let dpr = 1;
      try{
        const cv = ctx.canvas;
        const cssW = (cv.style && parseFloat(cv.style.width)) || cv.clientWidth || cv.width;
        if (cssW>0) dpr = cv.width / cssW;
      }catch(e){}
      if (!(dpr>0)) dpr = 1;
      const cssW = W / dpr;                        // viewport width in CSS px
      // Side panel vs bottom sheet MUST match css/menu.css: the toolbar becomes a
      // BOTTOM SHEET at `@media (max-width:720px)` (i.e. cssW <= 720) and stays a
      // LEFT PANEL only when cssW > 720. Using `>=720` here mis-reserved a left
      // band at exactly 720 (where the CSS already moved the toolbar to the
      // bottom), so the preview was pushed right of a panel that wasn't there.
      const sidePanel = (cssW > 720);
      // CSS panel width 296 + left margin 16 + a gap → reserve in backing px.
      // Never let the reserved left band swallow the whole canvas (a bad dpr read
      // could blow PANEL_BAND past W and collapse availW): cap it to ~55% of W.
      let PANEL_BAND = sidePanel ? Math.round((296 + 16) * dpr) : 0;
      if (PANEL_BAND > W*0.55) PANEL_BAND = Math.round(W*0.55);
      const TOPGAP = Math.round(96 * dpr);         // below the title
      // On phones the DOM toolbar is a BOTTOM SHEET (≤46vh in css/menu.css), so
      // reserve that band at the bottom; on desktop only a small gap is needed.
      const BOTGAP = sidePanel ? Math.round(24*dpr) : Math.round(H*0.46) + Math.round(16*dpr);
      const PV_GAP = Math.round(24 * dpr);
      const leftX = PANEL_BAND + PV_GAP;
      const availW = Math.max(120, W - leftX - PV_GAP);
      const availH = Math.max(120, H - TOPGAP - BOTGAP);
      // size the preview to the world aspect, fit inside the available box
      const aspect = C.WORLD_H / C.WORLD_W;
      let pvW = availW, pvH = Math.round(pvW * aspect);
      if (pvH > availH){ pvH = availH; pvW = Math.round(pvH / aspect); }
      let pvX = leftX + (availW - pvW)/2;
      let pvY = TOPGAP + (availH - pvH)/2;
      // Final safety clamp: whatever the dpr / orientation math produced, keep the
      // whole framed preview (it has a ~4px border) inside the visible canvas so
      // it can never be pushed off-screen and read as "no map". Margin = PV_GAP.
      const M = PV_GAP;
      if (pvW > W - 2*M){ pvW = W - 2*M; pvH = Math.round(pvW * aspect); }
      if (pvH > H - 2*M){ pvH = H - 2*M; pvW = Math.round(pvH / aspect); }
      pvX = Math.max(M, Math.min(pvX, W - M - pvW));
      pvY = Math.max(M, Math.min(pvY, H - M - pvH));
      ed.pv = { x:pvX, y:pvY, w:pvW, h:pvH };

      // framed preview (purple-tinted border to match the accent)
      rr(ctx, pvX-4, pvY-4, pvW+8, pvH+8, 16);
      ctx.fillStyle='rgba(160,108,255,0.18)'; ctx.fill();
      ctx.lineWidth=2; ctx.strokeStyle='rgba(160,108,255,0.35)';
      rr(ctx, pvX-4, pvY-4, pvW+8, pvH+8, 16); ctx.stroke(); ctx.lineWidth=1;
      // preview backdrop (sky)
      ctx.save();
      rr(ctx, pvX, pvY, pvW, pvH, 12); ctx.clip();
      const pg = ctx.createLinearGradient(0,pvY,0,pvY+pvH);
      pg.addColorStop(0,'#bfe6ff'); pg.addColorStop(1,'#eaf7ff');
      ctx.fillStyle=pg; ctx.fillRect(pvX,pvY,pvW,pvH);

      // schematic terrain by sampling CA.Terrain.isSolid on a coarse grid
      if (CA.Terrain && CA.Terrain.isSolid && ed.started){
        const stepX = 5, stepY = 7;
        const wx = C.WORLD_W/pvW, wy = C.WORLD_H/pvH;
        ctx.fillStyle='#7fae5a';
        for (let sx=0; sx<pvW; sx+=stepX){
          for (let sy=0; sy<pvH; sy+=stepY){
            const X=(sx)*wx, Y=(sy)*wy;
            let solid=false;
            try{ solid = CA.Terrain.isSolid(X,Y); }catch(e){}
            if (solid){ ctx.fillRect(pvX+sx, pvY+sy, stepX, stepY); }
          }
        }
      } else if (!ed.started){
        ctx.fillStyle='#9bc47a';
        ctx.fillRect(pvX, pvY+pvH*0.6, pvW, pvH*0.4);
      }
      // water line schematic
      const wl = (CA.config.WATER_LEVEL/C.WORLD_H)*pvH;
      ctx.fillStyle='rgba(90,170,230,0.35)';
      ctx.fillRect(pvX, pvY+wl, pvW, pvH-wl);
      // placed props (emoji markers)
      const placed = (CA.Maps && CA.Maps.editor && CA.Maps.editor.placedProps) || [];
      if (placed.length){
        ctx.textAlign='center'; ctx.textBaseline='alphabetic'; ctx.font='16px system-ui';
        for (const pp of placed){
          const def = PROP_PALETTE.find(d=>d.kind===pp.kind);
          const px = pvX + (pp.x/C.WORLD_W)*pvW;
          const py = pvY + (pp.y/C.WORLD_H)*pvH;
          ctx.fillText(def?def.emoji:'❓', px, py);
        }
      }
      // grid overlay
      if (ed.grid){
        ctx.lineWidth=1; ctx.strokeStyle='rgba(255,255,255,0.16)';
        const cells=10;
        ctx.beginPath();
        for (let i=1;i<cells;i++){ const gx=pvX+pvW*i/cells; ctx.moveTo(gx,pvY); ctx.lineTo(gx,pvY+pvH); }
        const rows=Math.round(cells*(pvH/pvW));
        for (let j=1;j<rows;j++){ const gy=pvY+pvH*j/rows; ctx.moveTo(pvX,gy); ctx.lineTo(pvX+pvW,gy); }
        ctx.stroke(); ctx.lineWidth=1;
      }
      // mirror axis
      if (ed.mirror){
        const mx=pvX+pvW/2;
        ctx.save();
        ctx.setLineDash([6,5]); ctx.lineWidth=2; ctx.strokeStyle='rgba(63,134,164,0.85)';
        ctx.beginPath(); ctx.moveTo(mx,pvY); ctx.lineTo(mx,pvY+pvH); ctx.stroke();
        ctx.restore();
      }
      // live cursor brush preview
      if (ed.cursorInPv && ed.cursor && ed.tool!=='prop'){
        const scale = pvW/C.WORLD_W;
        const rPv = Math.max(2, ed.brush*scale);
        const isErase = (ed.tool==='erase');
        const drawCursor = (cx)=>{
          ctx.lineWidth=2; ctx.strokeStyle = isErase ? 'rgba(220,120,100,0.95)' : 'rgba(160,108,255,0.95)';
          ctx.fillStyle   = isErase ? 'rgba(220,120,100,0.18)' : 'rgba(160,108,255,0.18)';
          if (ed.shape==='square'){ ctx.beginPath(); ctx.rect(cx-rPv, ed.cursor.y-rPv, rPv*2, rPv*2); ctx.fill(); ctx.stroke(); }
          else { ctx.beginPath(); ctx.arc(cx, ed.cursor.y, rPv, 0, Math.PI*2); ctx.fill(); ctx.stroke(); }
          ctx.lineWidth=1;
        };
        drawCursor(ed.cursor.x);
        if (ed.mirror){ const mcx=(pvX+pvW)-(ed.cursor.x-pvX); ctx.save(); ctx.globalAlpha=0.6; drawCursor(mcx); ctx.restore(); }
      }
      ctx.restore();

      // floating tool/brush badge near the cursor (outside the clip)
      if (ed.cursorInPv && ed.cursor){
        const tlabel = ed.tool==='prop'
          ? ((PROP_PALETTE.find(d=>d.kind===ed.propKind)||{}).emoji||'')+' '+T((PROP_PALETTE.find(d=>d.kind===ed.propKind)||{}).name||ed.propKind)
          : (ed.tool==='erase' ? T('🧽 Radír')+' '+ed.brush+'px' : T('✏️ Rajzol')+' '+ed.brush+'px');
        ctx.font=ef('700 12px'); ctx.textAlign='left'; ctx.textBaseline='middle';
        const tw=ctx.measureText(tlabel).width+16;
        let bx=ed.cursor.x+14, by=ed.cursor.y-20;
        if (bx+tw>pvX+pvW) bx=ed.cursor.x-14-tw;
        rr(ctx, bx, by-11, tw, 22, 7); ctx.fillStyle='rgba(8,22,32,0.88)'; ctx.fill();
        ctx.lineWidth=1; ctx.strokeStyle=EPAL.chipEdge; rr(ctx,bx,by-11,tw,22,7); ctx.stroke(); ctx.lineWidth=1;
        ctx.fillStyle=EPAL.ink; ctx.fillText(tlabel, bx+8, by+1);
        ctx.textBaseline='alphabetic';
      }

      // usage hint pill inside the bottom of the preview
      const toolHint = ed.tool==='prop'
        ? (T('koppints a lerakáshoz: ')+T((PROP_PALETTE.find(d=>d.kind===ed.propKind)||{}).name||ed.propKind))
        : (ed.tool==='erase' ? T('radírozás') : T('rajzolás'));
      ctx.font=ef('600 12px'); ctx.textAlign='center'; ctx.textBaseline='middle';
      const _hint = T('Húzd / koppints a felületen: ')+toolHint;
      const _hw = ctx.measureText(_hint).width + 18;
      const _hx = pvX+pvW/2, _hy = pvY+pvH-13;
      rr(ctx, _hx-_hw/2, _hy-10, _hw, 20, 8); ctx.fillStyle='rgba(8,22,32,0.72)'; ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.88)'; ctx.fillText(_hint, _hx, _hy);
      ctx.textBaseline='alphabetic';

      // transient message — pinned just under the preview, clamped on-canvas
      if (ed.msgT>0 && ed.msg){
        ctx.font=ef('700 15px'); ctx.textAlign='left'; ctx.textBaseline='middle';
        const mw = ctx.measureText(ed.msg).width + 22;
        let my = pvY + pvH + 26;
        if (my+16 > H-8) my = H-24;
        if (my < 60) my = 60;
        let mx = pvX;
        if (mx+mw > W-8) mx = Math.max(8, W-8-mw);
        ctx.globalAlpha = Math.min(1, ed.msgT);
        rr(ctx, mx, my-15, mw, 30, 9); ctx.fillStyle='rgba(8,22,32,0.92)'; ctx.fill();
        ctx.lineWidth=1; ctx.strokeStyle=EPAL.accent; rr(ctx,mx,my-15,mw,30,9); ctx.stroke(); ctx.lineWidth=1;
        ctx.fillStyle=EPAL.accent; ctx.fillText(ed.msg, mx+11, my+1);
        ctx.globalAlpha=1; ctx.textBaseline='alphabetic';
      }

      if (!hasEd){
        ctx.textAlign='center'; ctx.fillStyle=PAL.bad; ctx.font=ef('700 16px'); ctx.textBaseline='alphabetic';
        ctx.fillText(T('A szerkesztő nem érhető el (CA.Maps.editor hiányzik).'), pvX+pvW/2, pvY+pvH/2);
      }
    },

    _renderLoadOverlay(ctx){
      const W=C.VIEW_W, H=C.VIEW_H;
      ctx.fillStyle='rgba(8,20,30,0.62)'; ctx.fillRect(0,0,W,H);
      const ow=W*0.5, oh=H*0.6, ox=W/2-ow/2, oy=H/2-oh/2;
      panel(ctx, ox, oy, ow, oh);
      ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      ctx.fillStyle=EPAL.ink; ctx.font=ef('800 24px');
      ctx.fillText(T('📂 Mentett pályák'), W/2, oy+46);

      const names = (CA.Maps && CA.Maps.editor && CA.Maps.editor.list) ? CA.Maps.editor.list() : [];
      this._loadHits = [];
      if (!names.length){
        ctx.fillStyle=EPAL.inkDim; ctx.font=ef('600 18px');
        ctx.fillText(T('Nincs mentett pálya.'), W/2, oy+oh/2);
      } else {
        let y=oy+78;
        const rowW=ow-60, rowH=46, rx=ox+30;
        for (const nm of names){
          const rowB={ x:rx, y:y, w:rowW-56, h:rowH, name:nm, kind:'load' };
          const delB ={ x:rx+rowW-46, y:y+6, w:36, h:rowH-12, name:nm, kind:'del' };
          rr(ctx, rowB.x, rowB.y, rowB.w, rowB.h, 10); ctx.fillStyle=EPAL.chip; ctx.fill();
          ctx.lineWidth=1.5; ctx.strokeStyle=EPAL.chipEdge; ctx.stroke(); ctx.lineWidth=1;
          ctx.textAlign='left'; ctx.fillStyle=EPAL.ink; ctx.font=ef('600 18px'); ctx.textBaseline='middle';
          ctx.fillText('🗺️ '+nm, rowB.x+16, rowB.y+rowB.h/2);
          ctx.textBaseline='alphabetic';
          actionBtn(ctx, delB, '🗑', EPAL.bad, '#fff', '16px');
          this._loadHits.push(rowB, delB);
          y += rowH+8;
          if (y > oy+oh-74) break;
        }
      }
      const closeB={ x:W/2-72, y:oy+oh-52, w:144, h:42 };
      actionBtn(ctx, closeB, T('Bezár'), EPAL.blue, '#fff', '700 16px');
      this._loadClose = closeB;
    },

    _hitEditor(p){
      const E = CA.Maps && CA.Maps.editor;
      const B = this._edButtons || {};

      // load overlay swallows input first
      if (ed.showLoad){
        if (this._loadClose && inRect(p, this._loadClose)){ ed.showLoad=false; return true; }
        for (const h of (this._loadHits||[])){
          if (inRect(p,h)){
            if (h.kind==='load'){
              if (E && E.load){
                E.load(h.name); ed.theme=E.theme||ed.theme; ed.started=true; ed.name=h.name;
                // recover the saved base seed (ts) so undo/redo rebuilds the
                // exact loaded base; maps.js seeds generate() with payload.ts.
                try{
                  const pl = JSON.parse(localStorage.getItem('ca_map_'+h.name)||'null');
                  // payload.seed is the REAL base seed; ts only for legacy maps
                  ed.baseSeed = (pl && pl.seed!=null) ? (pl.seed>>>0) : ((pl && pl.ts) ? (pl.ts>>>0) : ed.baseSeed);
                }catch(_){}
                ed.history.length=0; ed.future.length=0;   // loaded map = fresh base
                setMsg(T('Betöltve: ')+h.name);
              }
              ed.showLoad=false;
            } else if (h.kind==='del'){
              if (E && E.remove){ E.remove(h.name); setMsg(T('Törölve: ')+h.name); }
            }
            return true;
          }
        }
        return true; // consume taps on the modal backdrop
      }

      // a tap anywhere other than the Clear/Cancel buttons dismisses the
      // pending clear-confirm (so it never lingers).
      if (ed.confirmClear && !(B.clear && inRect(p,B.clear)) && !(B.load && inRect(p,B.load))){
        ed.confirmClear=false;
      }

      // Toolbar buttons live inside a clipped, scrollable region. Only treat a
      // tap as a toolbar hit when it falls within the *visible* clip rect, so a
      // chip that's scrolled out of view (its recorded hitbox sits off-panel)
      // can't be triggered. Hitboxes are already in scrolled on-screen space
      // (built each render with the same tSy), so they align with `p` directly.
      const _clip = this._edScrollClip;
      const inToolbarView = !_clip || inRect(p, _clip);
      if (inToolbarView){
      // theme picker
      for (const tb of (B.themes||[])){
        if (inRect(p,tb)){
          ed.theme = tb.theme; ed.started=false;
          ensureEditor();
          // show the LOCALIZED theme name (not the raw id) in the toast
          const _tm = (CA.Maps && CA.Maps.get) ? CA.Maps.get(tb.theme) : null;
          setMsg(T('Téma: ')+(_tm && _tm.name ? T(_tm.name) : tb.theme));
          return true;
        }
      }
      if (B.draw && inRect(p,B.draw)){ ed.tool='draw'; ed.solid=true; syncEditorTool(); return true; }
      if (B.erase && inRect(p,B.erase)){ ed.tool='erase'; ed.solid=false; syncEditorTool(); return true; }
      for (const pb of (B.props||[])){
        if (inRect(p,pb)){ ed.tool='prop'; ed.propKind=pb.propKind; syncEditorTool();
          setMsg(T('Tárgy: ')+T((PROP_PALETTE.find(d=>d.kind===pb.propKind)||{}).name||pb.propKind)); return true; }
      }
      if (B.brushMinus && inRect(p,B.brushMinus)){ ed.brush=Math.max(6, ed.brush-6); return true; }
      if (B.brushPlus && inRect(p,B.brushPlus)){ ed.brush=Math.min(80, ed.brush+6); return true; }
      if (B.brushTrack && inRect(p,B.brushTrack)){
        const f = Math.max(0, Math.min(1, (p.x - B.brushTrack.tx) / B.brushTrack.tw));
        ed.brush = Math.round(6 + f*(80-6));
        return true;
      }
      // brush shape
      if (B.shapeRound && inRect(p,B.shapeRound)){ ed.shape='round'; return true; }
      if (B.shapeSquare && inRect(p,B.shapeSquare)){ ed.shape='square'; return true; }
      // extras
      if (B.undo && inRect(p,B.undo)){ edUndo(); return true; }
      if (B.redo && inRect(p,B.redo)){ edRedo(); return true; }
      if (B.fill && inRect(p,B.fill)){ ensureEditor(); edFill(); return true; }
      if (B.flat && inRect(p,B.flat)){ ensureEditor(); edFlatGround(); return true; }
      if (B.mirror && inRect(p,B.mirror)){ ed.mirror=!ed.mirror; setMsg(ed.mirror?T('Tükrözés be'):T('Tükrözés ki')); return true; }
      if (B.grid && inRect(p,B.grid)){ ed.grid=!ed.grid; setMsg(ed.grid?T('Rács be'):T('Rács ki')); return true; }

      // clear → inline two-step confirm (no native alert)
      if (B.clear && inRect(p,B.clear)){
        if (!ed.confirmClear){ ed.confirmClear=true; ed.confirmClearT=4; return true; }
        // confirmed
        ed.confirmClear=false;
        if (E && E.clear){ ensureEditor(); edPushHistory(); E.clear(); setMsg(T('Pálya törölve')); }
        return true;
      }
      if (B.load && inRect(p,B.load)){
        if (ed.confirmClear){ ed.confirmClear=false; return true; }  // doubles as "Cancel"
        ed.showLoad=true; return true;
      }
      } // end inToolbarView (scrolled-out toolbar chips are not tappable)

      if (B.nameField && inRect(p,B.nameField)){ ed.focused=true; return true; }
      else ed.focused=false;

      if (B.save && inRect(p,B.save)){
        const nm = (ed.name||'').trim();
        if (!nm){ setMsg(T('Adj nevet a pályának!')); ed.focused=true; return true; }
        if (E && E.save){ ensureEditor(); const ok=E.save(nm); setMsg(ok?(T('Mentve: ')+nm):T('Mentés sikertelen')); }
        return true;
      }
      // NOTE: the in-editor "Play this" action was removed on purpose — a custom
      // map needs the full New-Game settings (mode/teams/rules), so it can only
      // be launched from New Game, never directly from the editor.

      // preview paint / prop placement. (ui.js forwards each pointerDOWN here,
      // so every tap is one stamp + one undo step; the cursor preview tracks the
      // last touched point.)
      if (inRect(p, ed.pv)){
        ensureEditor();
        // remember the cursor so the brush preview + tool badge can draw there
        ed.cursor = { x:p.x, y:p.y }; ed.cursorInPv = true;
        const w = pvToWorld(p.x, p.y);
        edPushHistory();          // one undo step per stamp/place
        if (ed.tool==='prop'){
          // place the currently-selected prop at the world point (+ mirror twin)
          if (E && E.placeProp){
            syncEditorTool();
            E.placeProp(w.x, w.y);
            if (ed.mirror) E.placeProp(mirrorX(w.x), w.y);
            setMsg(T('Lerakva: ')+T((PROP_PALETTE.find(d=>d.kind===ed.propKind)||{}).name||ed.propKind));
          }
        } else if (E && E.paint){
          edStamp(E, w.x, w.y, ed.brush, ed.tool!=='erase');
        }
        return true;
      } else {
        // tapped outside the canvas → hide the floating cursor preview
        ed.cursorInPv = false;
      }

      return false;
    },

    /* ============================================================ *
     * EDITOR PUBLIC API — driven by the DOM toolbar (js/menu-editor.js).
     * These are thin wrappers around the existing module-local editor logic
     * (`ed`, `CA.Maps.editor`, edX functions); they do NOT reimplement the
     * paint backend. Every mutator is defensive: a missing CA.Maps.editor
     * leaves the canvas standing rather than throwing.
     * ============================================================ */
    editorAPI: {
      // lifecycle ----------------------------------------------------------
      ensure(){ return ensureEditor(); },
      available(){ return !!(CA.Maps && CA.Maps.editor); },
      // themes -------------------------------------------------------------
      getThemes(){
        const ids = (CA.Maps && CA.Maps.list) ? CA.Maps.list() : ['grass'];
        return ids.map(function(id){
          const t = (CA.Maps && CA.Maps.get) ? CA.Maps.get(id) : ((CA.Maps && CA.Maps[id])||{});
          return { id:id, emoji:(t && t.emoji)||'', name:(t && t.name)||id };
        });
      },
      theme(){ return ed.theme; },
      setTheme(id){
        if (ed.theme===id && ed.started) return;
        ed.theme = id; ed.started=false; ensureEditor();
        const _tm = (CA.Maps && CA.Maps.get) ? CA.Maps.get(id) : null;
        setMsg(T('Téma: ')+(_tm && _tm.name ? T(_tm.name) : id));
      },
      // tool ---------------------------------------------------------------
      tool(){ return ed.tool; },
      setTool(t){ ed.tool=t; ed.solid=(t!=='erase'); syncEditorTool(); },
      // props --------------------------------------------------------------
      props(){ return PROP_PALETTE.map(function(p){ return { kind:p.kind, emoji:p.emoji, name:p.name }; }); },
      prop(){ return (ed.tool==='prop') ? ed.propKind : null; },
      setProp(kind){
        ed.tool='prop'; ed.propKind=kind; syncEditorTool();
        setMsg(T('Tárgy: ')+T((PROP_PALETTE.find(function(d){return d.kind===kind;})||{}).name||kind));
      },
      // brush --------------------------------------------------------------
      brush(){ return ed.brush; },
      setBrush(px){ ed.brush = Math.max(6, Math.min(80, Math.round(px))); },
      brushMin(){ return 6; }, brushMax(){ return 80; },
      shape(){ return ed.shape; },
      setShape(s){ ed.shape = (s==='square')?'square':'round'; },
      // history ------------------------------------------------------------
      undo(){ edUndo(); }, redo(){ edRedo(); },
      canUndo(){ return ed.history.length>0; },
      canRedo(){ return ed.future.length>0; },
      // bulk ops -----------------------------------------------------------
      fill(){ ensureEditor(); edFill(); },
      flatGround(){ ensureEditor(); edFlatGround(); },
      mirror(){ return ed.mirror; },
      toggleMirror(){ ed.mirror=!ed.mirror; setMsg(ed.mirror?T('Tükrözés be'):T('Tükrözés ki')); return ed.mirror; },
      gridOn(){ return ed.grid; },
      toggleGrid(){ ed.grid=!ed.grid; setMsg(ed.grid?T('Rács be'):T('Rács ki')); return ed.grid; },
      clear(){
        const E = CA.Maps && CA.Maps.editor;
        if (E && E.clear){ ensureEditor(); edPushHistory(); E.clear(); setMsg(T('Pálya törölve')); return true; }
        return false;
      },
      // name + save --------------------------------------------------------
      name(){ return ed.name; },
      setName(s){ ed.name = (s||'').slice(0,24); },
      save(){
        const E = CA.Maps && CA.Maps.editor;
        const nm = (ed.name||'').trim();
        if (!nm){ setMsg(T('Adj nevet a pályának!')); return { ok:false, reason:'noname' }; }
        if (E && E.save){ ensureEditor(); const ok=E.save(nm); setMsg(ok?(T('Mentve: ')+nm):T('Mentés sikertelen')); return { ok:!!ok, name:nm }; }
        return { ok:false, reason:'noapi' };
      },
      // saved-maps list (for the DOM load dialog) --------------------------
      savedMaps(){
        const E = CA.Maps && CA.Maps.editor;
        return (E && E.list) ? (E.list()||[]) : [];
      },
      load(name){
        const E = CA.Maps && CA.Maps.editor;
        if (!(E && E.load)) return false;
        E.load(name); ed.theme=E.theme||ed.theme; ed.started=true; ed.name=name;
        try{
          const pl = JSON.parse(localStorage.getItem('ca_map_'+name)||'null');
          ed.baseSeed = (pl && pl.seed!=null) ? (pl.seed>>>0) : ((pl && pl.ts) ? (pl.ts>>>0) : ed.baseSeed);
        }catch(_){}
        ed.history.length=0; ed.future.length=0;
        setMsg(T('Betöltve: ')+name);
        return true;
      },
      removeMap(name){
        const E = CA.Maps && CA.Maps.editor;
        if (E && E.remove){ E.remove(name); setMsg(T('Törölve: ')+name); return true; }
        return false;
      },
      // localized transient toast text (so the DOM can mirror it if desired)
      message(){ return (ed.msgT>0) ? ed.msg : ''; },
    },
  };
})();
