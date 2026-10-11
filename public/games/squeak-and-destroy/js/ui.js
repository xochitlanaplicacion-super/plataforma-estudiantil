/* ============================================================================
 * CUTE ANIMALS — ui.js   ::  AGENT UI (v2) — HUD, Menus, Settings, Weapon panel
 * ----------------------------------------------------------------------------
 * All SCREEN-SPACE overlay (camera NOT applied). Polished cute HUD, a rich
 * multi-screen start menu (main/newgame/settings/credits + delegated
 * profile/leaderboard/achievements/editor via CA.Screens), expanded settings
 * (volume sliders + key rebind), pause overlay, paged weapon panel (21 weapons),
 * achievement toasts, and an expanded game-over screen.
 *
 * PUBLIC API on CA.UI:
 *   init(ctx), renderMenu(ctx), render(ctx),
 *   selectWeaponByIndex(i), cycleWeapon(dir),
 *   isUIHit(x,y), isTextInputActive(),
 *   setScreen(name), screen()
 *
 * Coords are in CANVAS pixels (CA.config.VIEW_W x VIEW_H, read LIVE each frame).
 * ==========================================================================*/
(function(){
  const C=CA.config, S=CA.state, U=CA.util, G=CA.GameState;
  const FONT='"Baloo 2","Comic Sans MS",system-ui,sans-serif';
  const CONTROLS_HINT='A/D mozgás · W/S célzás · SPACE ugrás · egér/Enter tüzelés · TAB fegyver · 1-9 választ · P szünet';
  const VERSION='v5.1.0';

  // ---- first-run contextual coachmarks (UX P1): teach move→aim→charge-fire→weapons
  // on the very first human turn, advancing on the ACTION itself. One-time, guarded
  // by localStorage 'ca_seen_coach'. Skipped in dev/challenge/puzzle + reduced to a
  // static caption under reducedMotion. ---------------------------------------------
  let _coachStep = -1;     // -1 uninit · 0 move · 1 aim · 2 fire · 3 weapons · 99 done
  let _coachAimRef = null;
  let _coachT = 0;
  let _coachSeen = false;  // mirrors localStorage 'ca_seen_coach'

  // ---- i18n: robust local helper + EN dictionary for every ui.js string ----
  // CA.t returns the Hungarian literal when lang==='hu' (default), or its EN
  // translation when lang==='en'. We register all ui.js translations here.
  const t = (CA && CA.t) ? CA.t : (s=>s);
  if(CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    // -- first-run coachmarks --
    '👟 Mozogj a gombokkal — a csík elfogy, ahogy lépsz':'👟 Move with the buttons — the bar drains as you walk',
    '▲▼ Célozz — a szaggatott ív mutatja a lövést':'▲▼ Aim — the dashed arc shows your shot',
    '🔥 Tartsd nyomva a tüzelést a feltöltéshez, engedd el a lövéshez!':'🔥 Hold fire to charge power, release to shoot!',
    'Válts fegyvert lent — a szürke nem használható':'Switch weapons below — greyed = unavailable',
    'Válassz képességet lent — a szürke még tölt':'Pick an ability below — greyed = on cooldown',
    // -- desktop (mouse/keyboard) coachmark variants --
    '👟 Mozogj az A/D billentyűkkel — a csík elfogy, ahogy lépsz':'👟 Move with the A/D keys — the bar drains as you walk',
    '🖱️ Célozz az egérrel — a szaggatott ív mutatja a lövést':'🖱️ Aim with the mouse — the dashed arc shows your shot',
    '🔥 Tartsd nyomva a kattintást (vagy Entert) a feltöltéshez, engedd el a lövéshez!':'🔥 Hold click (or Enter) to charge power, release to shoot!',
    // -- pause menu "How to play" help card --
    '❓ Hogyan játssz?':'❓ How to play?',
    'Mozgás — a lépéscsík elfogy, ahogy mész':'Movement — the move bar drains as you go',
    'Célzás — a szaggatott ív mutatja a lövést':'Aim — the dashed arc shows your shot',
    'Célzás — az egérrel, a szaggatott ív mutatja a lövést':'Aim — with the mouse, the dashed arc shows your shot',
    'Tüzelés — tartsd nyomva a töltéshez, engedd el a lövéshez':'Fire — hold to charge, release to shoot',
    'Fegyverváltás — koppints a lenti sávban':'Switch weapon — tap in the bar below',
    'Fegyverváltás — TAB vált, a számok közvetlenül választanak':'Switch weapon — TAB cycles, number keys pick directly',
    'Kör vége — ha elfogyott a lépés vagy lőttél':'End turn — once you have moved out or fired',
    'Koppints a bezáráshoz':'Tap to close',
    'Kattints vagy Esc a bezáráshoz':'Click or Esc to close',
    // -- share / game-over / settings --
    '🏆 Animal Battle Ground eredmény':'🏆 Animal Battle Ground result',
    '🍃 Mozgáscsökk.: ':'🍃 Reduced motion: ',
    'Vége a meccsnek':'Match over',
    'Sebaj — a következő meccs a tiéd lesz!':'No worries — the next match is yours!',
    // -- main menu --
    'Aranyos állatok':'Cute Animals','Cuki, de halálos':'Cute. But Deadly.',
    '▶ Folytatás':'▶ Continue',
    '🎮 Új játék':'🎮 New Game',
    '👥 Csapat szerkesztő':'👥 Team Editor',
    '🌐 Multiplayer':'🌐 Multiplayer',
    '⚙️ Beállítások':'⚙️ Settings',
    '👏 Készítők':'👏 Credits',
    '📊 Profil':'📊 Profile',
    '🏆 Ranglista':'🏆 Leaderboard',
    '🌟 Eredmények':'🌟 Achievements',
    '✏️ Szerkesztő':'✏️ Editor',
    'Available soon on Steam':'Available soon on Steam',
    // -- shared chrome --
    '‹ Vissza':'‹ Back',
    // -- HUD juice (turn banner + ability tooltip) --
    'te jössz':'your turn',
    'Lehűlés':'Cooldown',
    'kör':'turns',
    'azonnali':'instant',
    'Sebzés':'Damage',
    'Hatókör':'Radius',
    // -- new game screen --
    '🎮 Új játék':'🎮 New Game',
    '▶ Indítás':'▶ Start',
    '▼ görgess':'▼ scroll',
    'Mód':'Mode',
    'Pálya':'Map',
    'Időjárás':'Weather',
    'Opciók':'Options',
    'Csapatok':'Teams',
    'Klasszikus':'Classic',
    'Capybarák vs Worm-ök, 2 csapat.':'Capybaras vs Wrigglers, 2 teams.',
    '🎲 Véletlen':'🎲 Random',
    '☀️ Tiszta':'☀️ Clear',
    '🌧 Eső':'🌧 Rain',
    '❄️ Hó':'❄️ Snow',
    '🌫 Köd':'🌫 Fog',
    '⛈ Vihar':'⛈ Storm',
    '☠ Víz: BE':'☠ Water: ON',
    '☠ Víz: KI':'☠ Water: OFF',
    'Gép:':'AI:',
    'Könnyű':'Easy',
    'Normál':'Normal',
    'Nehéz':'Hard',
    '👥 2 Játékos (helyi)':'👥 2 Players (local)',
    '🤖 vs Gép':'🤖 vs AI',
    'Capybarák':'Capybaras',
    'Worm-ök':'Wrigglers',
    '🐹 Saját csapat:':'🐹 My team:',
    'Alap':'Default',
    'Csapat':'Team',
    'Ennek a módnak a csapatait a játék automatikusan állítja be.':'The game sets up the teams for this mode automatically.',
    '➖ Kevesebb':'➖ Fewer',
    '➕ Több':'➕ More',
    '🤖 Gép':'🤖 AI',
    '🙂 Ember':'🙂 Human',
    '🎲 Véletlen':'🎲 Random',
    '(név)':'(name)',
    // -- mode labels --
    'Free-for-all':'Free-for-all',
    'AI vs AI':'AI vs AI',
    'Túlélő':'Survival',
    'Király a hegyen':'King of the Hill',
    'Mesterlövész':'Sniper',
    'Bomba-futár':'Bomb Run',
    'Koop':'Co-op',
    'Napi kihívás':'Daily Challenge',
    'Gyors':'Quick',
    'Oktató':'Tutorial',
    'Kampány':'Campaign',
    'Arcade':'Arcade',
    'Erődök':'Forts',
    // -- mode-intro banner: names + one-line objectives (#mode-intro) --
    'Klasszikus csata':'Classic Battle',
    'Mindenki ellen':'Free-for-all',
    'Gép vs Gép':'AI vs AI',
    'Fészekrablás':'Nest Raid',
    'Tűzpróba':'Gauntlet',
    'Főnök-roham':'Boss Rush',
    'Túlélés':'Survival',
    'Király a dombon':'King of the Hill',
    'Mesterlövész-párbaj':'Sniper Duel',
    'Bomba-futás':'Bomb Run',
    'Kooperatív':'Co-op',
    'Gyors meccs':'Quick Match',
    'Golf':'Golf',
    'Verseny':'Race',
    'Utolsó állás':'Last Stand',
    'Oktatómód':'Tutorial',
    'Győzd le az ellenfél egész csapatát, hogy te maradj az utolsó.':'Defeat the entire enemy team to be the last one standing.',
    'Mindenki magáért! Kapard ki a győzelmet a többi csapat ellen.':'Every team for itself! Claw your way to victory against all the others.',
    'Dőlj hátra és nézd, ahogy a gépek harcolnak egymással.':'Sit back and watch the AI teams battle it out.',
    'Törj át a védőkön és pusztítsd el az ellenséges fészket.':'Break through the defenders and destroy the enemy nest.',
    'Élj túl egymást követő, egyre nehezebb hullámokat.':'Survive a series of increasingly tough waves.',
    'Győzd le a hatalmas főnököket egymás után.':'Defeat the mighty bosses one after another.',
    'Tarts ki, ameddig csak tudsz a végtelen ellenfél-hullámokkal szemben.':'Hold out as long as you can against endless waves of enemies.',
    'Foglald el és tartsd a dombot, amíg fel nem töltöd a pontmérőt.':'Capture and hold the hill until your meter fills up.',
    'Egy lövés, egy élet — találd el az ellenfelet, mielőtt ő tesz veled.':'One shot, one life — hit the enemy before they get you.',
    'Vidd el a bombát a célig, mielőtt felrobban!':'Carry the bomb to the goal before it blows up!',
    'Fogjatok össze, és együtt győzzétek le a gép csapatait.':'Team up and beat the AI teams together.',
    'Gyors meccs az alap szabályokkal — ugorj be és harcolj!':'A fast match with default rules — jump in and fight!',
    'Juttasd a labdát a lyukba a lehető legkevesebb lövésből.':'Sink the ball into the hole in as few shots as possible.',
    'Érj célba elsőként a pályán át!':'Be the first to reach the finish across the map!',
    'Védd meg az állásodat a túlerővel szemben, ameddig csak bírod.':'Defend your position against the odds for as long as you can.',
    'Teljesítsd a küldetést és szerezd meg a csillagokat.':'Complete the mission and earn your stars.',
    'Tanuld meg az alapokat: mozgás, célzás, tüzelés.':'Learn the basics: move, aim and fire.',
    'Idő- és pontvadászat: 120 másodperc alatt szerezz minél több találatot!':'Score & time attack: rack up as many hits as you can in 120 seconds!',
    'Mindkét csapat saját emelt erődön áll — robbantsd szét az ellenfél bázisát!':'Both teams stand on raised forts — blow the enemy base apart!',
    // -- game-over matchup header (#gameover-matchup) --
    ' vs ':' vs ',
    // -- settings screen --
    '⚙️ Beállítások':'⚙️ Settings',
    '🌐 Nyelv: Magyar':'🌐 Language: English',
    '🔇 Hang: KI':'🔇 Sound: OFF',
    '🔊 Hang: BE':'🔊 Sound: ON',
    '🎵 Zene hangerő':'🎵 Music volume',
    '🔊 Effekt hangerő':'🔊 SFX volume',
    '⛶ Teljes képernyő':'⛶ Fullscreen',
    'Minőség: ':'Quality: ',
    'Alacsony':'Low',
    'Magas':'High',
    'Legmagasabb ✨':'Highest ✨',
    'Röppálya: ':'Trajectory: ',
    'Kill-cam: ':'Kill-cam: ',
    'BE':'ON',
    'KI':'OFF',
    '♿ Kényelem':'♿ Comfort',
    '🎯 Célzás érzékenység':'🎯 Aim sensitivity',
    '🤚 Balkezes: BE':'🤚 Left-handed: ON',
    '🤚 Balkezes: KI':'🤚 Left-handed: OFF',
    '🎨 Színvak: ':'🎨 Colorblind: ',
    '📳 Rezgés: ':'📳 Haptics: ',
    '🎶 Zene: ':'🎶 Music: ',
    '⌨ Billentyűk':'⌨ Keys',
    'Balra':'Left',
    'Jobbra':'Right',
    'Célzás fel':'Aim up',
    'Célzás le':'Aim down',
    'Ugrás':'Jump',
    'Tüzelés':'Fire',
    'Fegyver':'Weapon',
    'Szünet':'Pause',
    'Egységváltás':'Switch unit',
    'Ez a gomb már foglalt':'That key is already bound',
    'nyomj egy gombot…':'press a key…',
    'Esc = mégse':'Esc = cancel',
    // -- credits --
    '👏 Készítők':'👏 Credits',
    'Los Polos Amigos':'Los Polos Amigos',
    'Készítette: Gebei János & Claude (Anthropic) — 2026':'Made by János Gebei & Claude (Anthropic) — 2026',
    '🐹 Capybarák — ':'🐹 Capybaras — ',
    '🪱 Worm-ök — ':'🪱 Wrigglers — ',
    'Ikonok / illusztrációk: Freepik (flaticon.com)':'Icons / illustrations: Freepik (flaticon.com)',
    // -- team editor --
    '👥 Csapat szerkesztő':'👥 Team Editor',
    '🎮 Játék ezzel':'🎮 Play with this',
    'Csapat neve':'Team name',
    'Egységek':'Units',
    'Műveletek':'Actions',
    '💾 Mentés':'💾 Save',
    '🗑️ Törlés':'🗑️ Delete',
    'Mentett csapatok':'Saved teams',
    'Még nincs mentett csapat. Állítsd be fent, majd 💾 Mentés.':'No saved teams yet. Set one up above, then 💾 Save.',
    '➕ Új csapat':'➕ New team',
    'egység':'unit',
    'Egység':'Unit',
    // team-editor status lines
    'Betöltve: ':'Loaded: ',
    '💾 Mentve: ':'💾 Saved: ',
    'Törölve (piszkozat)':'Deleted (draft)',
    '🗑️ Törölve':'🗑️ Deleted',
    'Új piszkozat':'New draft',
    // cosmetics
    'Sima':'Plain','Mogorva':'Grumpy','Kalóz':'Pirate','Sisak':'Helmet',
    'Bohókás':'Silly','Szemüveg':'Glasses','Taraj':'Mohawk','Sapka':'Cap',
    'Bajusz':'Mustache','Masni':'Bow','Kötés':'Bandage','Fejhallgató':'Headphones',
    // -- HUD --
    'gondolkodik…':'thinking…',
    'ERŐ':'POWER',
    'KILL-CAM':'KILL-CAM',
    // -- puzzle objective banner --
    '🧩 Fejtörő':'🧩 Puzzle',
    '🎯 Cél: ':'🎯 Goal: ',
    'Győzd le az összes ellenfelet':'Defeat all enemies',
    ' lövésből':' shots',
    '💡 ':'💡 ',
    'Kör vége':'End Turn',
    'Kör vége ⏭':'End Turn ⏭',
    'Q: karaktercsere':'Q: switch unit',
    '⏱️ Időzítő: ':'⏱️ Timer: ',
    '💨 SZÉL':'💨 WIND',
    'LŐ':'FIRE',
    // weapon category tabs
    'Mind':'All',
    'Lövedék':'Projectile',
    'Dobható':'Throwable',
    'Tűzfegyver':'Firearm',
    'Speciális':'Special',
    'Mozgás':'Movement',
    // -- pause overlay --
    '⏸ Szünet':'⏸ Paused',
    '▶ Folytatás':'▶ Resume',
    '🏠 Főmenü':'🏠 Main Menu',
    '⏸ Szünet':'⏸ Paused',
    'P = folytatás':'P = resume',
    // -- game over / victory --
    '🏆 Vége a meccsnek!':'🏆 Match over!',
    ' győzött!':' wins!', ' csapata győzött!':' wins!',
    'Döntetlen':'Draw',
    '⭐ MVP: ':'⭐ MVP: ',
    ' kill)':' kills)',
    '☠ Killek: ':'☠ Kills: ',
    '🎯 Lövések: ':'🎯 Shots: ',
    '🎯 Pontosság: ':'🎯 Accuracy: ',
    '🔥 Kombó: ×':'🔥 Combo: ×',
    '⬆️ Szint ':'⬆️ Level ',
    '🔄 Újra':'🔄 Replay',
    '▶ Következő':'▶ Next',
    '🏠 Menü':'🏠 Menu',
    // -- game-over re-engagement tease (#reengage) --
    '🎁 még 1 győzelem a következő jutalomig':'🎁 1 more win to the next reward',
    '🎁 még ':'🎁 ', ' győzelem a következő jutalomig':' more wins to the next reward',
    '⭐ ':'⭐ ', ' érme vár begyűjtésre':' coins waiting to be collected',
    '🏅 ':'🏅 ', ' a következő kihíváshoz':' to the next challenge',
    '🎖 még ':'🎖 ', ' XP a következő szezon-szinthez':' XP to the next season tier',
    '🔥 Játssz tovább — minden meccs közelebb visz a jutalomhoz!':'🔥 Keep playing — every match brings you closer to a reward!',
    // -- pause: quit confirmation (#quit-confirm) --
    'Biztos? Kilépsz a meccsből':'Sure? Quit the match',
    // -- misc dynamic name fallbacks (used when building team configs) --
    'Ellenfél':'Opponent',
    'Csapatom':'My Team',
    'KOMBÓ ×':'COMBO ×',
    '🔥 KOMBÓ ×':'🔥 COMBO ×',
    '💥 KRITIKUS!':'💥 CRITICAL!',
    // -- v4 class abilities / ability bar --
    'Képességek':'Abilities',
    'Univerzális':'Universal',
    // -- v4 class-select (New Game) --
    'Osztály':'Class',
    'Osztályok':'Classes',
    '🎲 Vegyes':'🎲 Mixed',
    'Válassz osztályt minden egységnek:':'Choose a class for each unit:',
    'Passzív: ':'Passive: ',
    'necro':'Necromancer','guardian':'Guardian','mage':'Mage',
    'hunter':'Hunter','engineer':'Engineer','healer':'Healer',
    // -- v4 skill-tree screen --
    '🌳 Képességfa':'🌳 Skill Tree',
    'Szint':'Level',
    'TP':'SP',
    'Elérhető pont: ':'Available points: ',
    'Nincs elérhető képességpont — szerezz több XP-t!':'No skill points available — earn more XP!',
    'Fejleszt':'Upgrade',
    'MAX':'MAX',
    'Rang: ':'Rank: ',
    'Nincs még osztály betöltve.':'No classes loaded yet.',
    'Válassz osztályt:':'Choose a class:',
  });

  // touch vs pointer device (matches the flag used for hiding on-screen pad)
  const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints>0);

  // Modes that are actually selectable in the New Game screen. The richer modes
  // (survival/koth/sniper/bombrun/coop/daily/quick/tutorial) are registered in
  // CA.Modes by modes.js and are now selectable too. Anything NOT in this list
  // (and not 'classic') is shown LOCKED.
  const SELECTABLE_MODES = ['classic','ffa',
    'survival','koth','sniper','bombrun','coop','daily','quick','tutorial',
    'campaign','arcade','forts'];
  function isModeUnlocked(id){ return SELECTABLE_MODES.indexOf(id)>=0; }
  // Hungarian fallback labels for modes (CA.Modes[id].name wins when present).
  const MODE_LABELS = {
    classic:'Klasszikus', ffa:'Free-for-all',
    survival:'Túlélő', koth:'Király a hegyen', sniper:'Mesterlövész',
    bombrun:'Bomba-futár', coop:'Koop', daily:'Napi kihívás',
    quick:'Gyors', tutorial:'Oktató', campaign:'Kampány', arcade:'Arcade',
    forts:'Erődök',
  };

  /* ---------- live layout metrics ----------------------------------------
   * VIEW_W/VIEW_H are the BACKING resolution (= cssPx × devicePixelRatio). On a
   * phone the backing can be ~1500-2200 while the physical display is only
   * ~390-844 CSS-px, so a "30px" font drawn in VIEW space looks tiny-but-dense
   * there and chunky on a 1:1 desktop. To make the menu/HUD feel consistent we
   * scale UI sizes by `ui` — roughly: how many backing-px equal one comfortable
   * UI unit. We derive it from the physical (CSS) short edge so phones get a
   * proportionally smaller/denser layout ("everything a bit smaller, more
   * fits") and desktops get a richer, bigger one.                            */
  function metrics(){
    const VW=C.VIEW_W, VH=C.VIEW_H;
    // effective device-pixel-ratio: backing px per CSS px. Use the CANVAS content-box
    // width (canvas.style.width, set in core.resize to the safe-area-padded box), NOT
    // window.innerWidth — on a notched landscape phone innerWidth includes the notch
    // ears, which under-scaled the HUD ~11%. (#hud-underscale)
    const _cv = CA.canvas;
    const cssW = ((_cv && _cv.clientWidth) || window.innerWidth || VW) || 1;
    const dpr  = U.clamp(VW/cssW, 1, 3);
    const cssH = VH/dpr;
    const aspect = VW/VH;
    // desktop = a real pointer device on a wide screen
    const desktop = !IS_TOUCH && aspect>=1.45 && cssW>=900;
    // UI scale: base everything on the backing px but keep phones compact.
    // ui≈1 means "1 backing px". We want ~ the same PHYSICAL size everywhere,
    // i.e. scale with dpr, but clamp so tiny/huge screens stay sane.
    let ui = dpr;
    if(desktop) ui = U.clamp(VH/720, 0.9, 2.0);     // crisp, generous on PC
    else        ui = U.clamp(dpr*0.92, 1.0, 2.4);   // dense on phones
    return { VW, VH, cssW, cssH, dpr, aspect, desktop, ui };
  }

  let menuBtns=[];           // {x,y,w,h,label,act} (active menu buttons this frame)
  let menuFields=[];         // {x,y,w,h,key} text-input fields (newgame screen)
  let menuSliders=[];        // {x,y,w,h,key} draggable sliders (settings screen)
  let weaponBtns=[];         // {x,y,w,h,id}
  let abilityBtns=[];        // {x,y,w,h,id,cd} v4 ability-bar buttons (cd=cooldown>0 => locked)
  let weaponNav=[];          // {x,y,w,h,act} weapon panel paging arrows
  let stClass=null;          // selected class id on the skill-tree screen
  let hudBtns=[];            // {x,y,w,h,id,act}  (endturn, mute, replay, pause...)
  let _portraitCache={};     // key -> offscreen <canvas> of a unit portrait (species+cosmetic+class)
  let touchBtns=[];          // {x,y,w,h,id,kind} on-screen mobile controls
  let menuT=0;
  // ---- ability tooltip (HUD juice): hover (PC) / tap-and-hold (mobile) -------
  let hoverPt=null;          // {x,y} last PC pointer-move position (canvas px)
  let abilityHold=null;      // { id, t } active tap-and-hold on an ability chip
  const ABILITY_HOLD_DELAY=0.28;   // seconds of hold before the tooltip shows

  // ---- multi-screen menu state ----
  let screen='main';                 // 'main'|'newgame'|'settings'|'credits'|'profile'|'leaderboard'|'achievements'|'editor'
  let caretT=0;

  // ---- vertical scroll for overflowing menu screens (settings / newgame) ----
  // scrollY is a per-screen offset (>=0) subtracted from every laid-out widget.
  // contentH/viewH are written each frame by the screen so the pointer/wheel
  // handlers can clamp the drag. scrollDrag tracks an active touch drag.
  let scrollY=0, scrollMaxY=0, scrollDragY=null, scrollDragStart=0, scrollMoved=0;
  function maxScroll(){ return Math.max(0, scrollMaxY); }
  function clampScroll(){ scrollY=U.clamp(scrollY, 0, maxScroll()); }
  // screens whose content can overflow the viewport and therefore drag-scroll
  function screenScrolls(){ return screen==='settings' || screen==='newgame' || screen==='teamedit' || screen==='skilltree'; }

  // ---- new-game selection (richer setup) ----
  let ng={
    gameMode:'classic',
    aiLevel:1,
    twoPlayer:false,           // classic 2-player (no AI)
    theme:'jungle',
    weather:'clear',           // clear|rain|snow|fog|storm|undefined(=random)
    risingWater:false,
    names:{capybara:'', worm:''},   // classic team names
    classes:[],                // v4: player team's per-unit class ids (length TEAM_SIZE; [] = mixed default)
    savedTeam:-1,              // index into ca_teams used for the PLAYER side (-1 = none)
    teams:[                    // ffa / builder rows
      {species:'capybara', name:'', isAI:false},
      {species:'worm',     name:'', isAI:true},
    ],
  };
  let focusedField=null;       // 'capybara' | 'worm' | 'team0'.. | 'tename' | 'teu0'.. | null

  // ---- team editor (Csapat szerkesztő) -----------------------------------
  // Cosmetic ids mirror entities.js COSMETICS (kept as a small local list so
  // ui.js needs no cross-module read). 'plain' = no overlay.
  const COSMETIC_IDS=['plain','grumpy','pirate','helmet','silly','glasses',
                      'mohawk','cap','mustache','bow','bandage','headphones'];
  const COSMETIC_NAMES={plain:'Sima', grumpy:'Mogorva', pirate:'Kalóz', helmet:'Sisak',
    silly:'Bohókás', glasses:'Szemüveg', mohawk:'Taraj', cap:'Sapka',
    mustache:'Bajusz', bow:'Masni', bandage:'Kötés', headphones:'Fejhallgató'};
  const TEAMS_KEY='ca_teams';   // localStorage: array of {name, units:[{species,cosmetic,name}]}

  function loadTeams(){
    try{ const a=JSON.parse(localStorage.getItem(TEAMS_KEY)||'[]'); return Array.isArray(a)?a:[]; }
    catch(_){ return []; }
  }
  function saveTeams(arr){
    try{ localStorage.setItem(TEAMS_KEY, JSON.stringify(arr||[])); }catch(_){}
  }
  function blankTeamUnit(i){
    const sp=(CA.Species&&CA.Species.list)?CA.Species.list():['capybara','worm'];
    return { species: sp[i%sp.length]||'capybara', cosmetic:'plain', name:'' };
  }
  function blankTeam(){
    const TS=(C.TEAM_SIZE||5);
    const units=[]; for(let i=0;i<TS;i++) units.push(blankTeamUnit(i));
    return { name:'', units };
  }
  // working draft currently being edited in the team editor
  let teEdit=blankTeam();
  let teSelected=-1;       // index of the saved team being edited (-1 = new/unsaved)
  let teStatus='';         // transient feedback line

  function teOpen(){ screen='teamedit'; focusedField=null; scrollY=0; scrollMaxY=0; }
  // load a saved team into the working draft (deep copy so edits aren't live)
  function teLoad(idx){
    const arr=loadTeams(); const t=arr[idx]; if(!t) return;
    const TS=(C.TEAM_SIZE||5); const units=[];
    for(let i=0;i<TS;i++){
      const su=(t.units&&t.units[i])||blankTeamUnit(i);
      units.push({ species:su.species||blankTeamUnit(i).species,
                   cosmetic:su.cosmetic||'plain', name:su.name||'' });
    }
    teEdit={ name:t.name||'', units };
    teSelected=idx; teStatus=CA.t('Betöltve: ')+(t.name||(CA.t('Csapat')+' '+(idx+1)));
    focusedField=null;
  }
  // persist the working draft (overwrites the selected slot, else appends)
  function teSave(){
    const arr=loadTeams();
    const rec={ name:(teEdit.name&&teEdit.name.trim())||(CA.t('Csapat')+' '+(arr.length+1)),
                units:teEdit.units.map(u=>({ species:u.species, cosmetic:u.cosmetic||'plain',
                                             name:(u.name||'').trim() })) };
    if(teSelected>=0 && arr[teSelected]) arr[teSelected]=rec;
    else { arr.push(rec); teSelected=arr.length-1; }
    saveTeams(arr); teStatus=CA.t('💾 Mentve: ')+rec.name;
  }
  function teDelete(){
    if(teSelected<0){ teEdit=blankTeam(); teStatus=CA.t('Törölve (piszkozat)'); focusedField=null; return; }
    const arr=loadTeams();
    if(arr[teSelected]) arr.splice(teSelected,1);
    saveTeams(arr);
    teSelected=-1; teEdit=blankTeam(); teStatus=CA.t('🗑️ Törölve'); focusedField=null;
  }

  // ---- settings: key-rebind capture ----
  let rebindAction=null;       // action key being captured (e.g. 'left'), or null

  // ---- settings overlay while paused ----
  let pauseSettings=false;
  // ---- "Hogyan játssz?" help/controls card while paused (re-accessible tutorial:
  // the first-turn coachmarks are one-shot, so this lets a player re-learn controls
  // any time). Mirrors pauseSettings; rendered as a canvas card, closed on tap/Esc. ----
  let pauseHelp=false;
  // ---- pause "🏠 Főmenü" quit confirmation (#quit-confirm) ----
  // first tap arms the confirm (button relabels to "Biztos? Kilépsz a meccsből"),
  // a second tap actually quits — so a mis-tap can't abandon a live match. Reset
  // whenever the pause overlay is left (resume / open settings).
  let quitConfirm=false;

  // ---- puzzle objective banner (#puzzle-objective) ----
  // shows WHAT TO DO for a few seconds when a Fejtörő starts, then a small
  // persistent hint chip. _puzzleBannerId tracks the active puzzle so the banner
  // re-arms whenever a new puzzle begins.
  let _puzzleBannerId=null;
  let _puzzleBannerT=0;

  // ---- weapon panel paging ----
  let weaponPage=0;

  // pointerId -> {kind,dir,id} for multi-touch hold buttons & slider drags
  const activePointers={};

  // ---- top-center toast queue (#7/#8) -------------------------------------
  // Self-contained: combo/crit/toast events are pushed here and rendered as a
  // brief auto-fading stack near the HUD's top-center. Each toast lives ~1.5s.
  const toastQueue=[];                 // {text, life, t}
  const TOAST_LIFE=1.5;
  function pushToast(text){
    if(!text) return;
    text=String(text);
    // dedupe: weapons.js emits BOTH 'combo'+'toast' (and 'crit'+'toast') for the
    // same event, so an identical, still-fresh toast is collapsed into one.
    for(const t of toastQueue){ if(t.text===text && t.t<0.2) return; }
    toastQueue.push({text, life:TOAST_LIFE, t:0});
    if(toastQueue.length>4) toastQueue.shift();   // cap the stack
  }

  // ---- "your turn" handoff banner (HUD juice) -----------------------------
  // A brief centered banner tinted with the active team's color. Non-blocking:
  // it only draws; input is never gated on it.
  let turnBanner=null;                 // { text, color, t, life }
  const TURN_BANNER_LIFE=0.9;
  function showTurnBanner(){
    try{
      const team=S.teams && S.teams[S.currentTeamIdx];
      if(!team) return;
      // only celebrate a HUMAN handoff — AI turns shouldn't pop "your turn".
      if(team.isAI) return;
      const emo = (team.species==='worm'||team.kind==='worm') ? '🪱' : '🐹';
      turnBanner={
        text: emo+' '+t(team.name)+' — '+t('te jössz'),
        color: team.color||'#ffd76a',
        t:0, life:TURN_BANNER_LIFE
      };
    }catch(_){ turnBanner=null; }
  }

  // ---- victory screen confetti latch + last-opts stash (#34) --------------
  let victoryShown=false;              // confetti fired once per game-over
  let lastNewGameOpts=null;            // stashed opts for "🔄 Újra"
  let _lastRunKind=null;               // {puzzle:id} | {challenge:kind} | null — re-arm scoring on replay

  // ---- mode-intro banner (#mode-intro) ------------------------------------
  // At the start of EVERY match we flash a centered banner: the mode's icon +
  // name + a one-line "mit kell csinálni" objective, for ~4s. Re-uses the
  // puzzle-banner look. Armed on the 'gameStart' event (core.js emits it in
  // newGame). Skipped when a puzzle is running (puzzles have their own banner).
  // id → { icon, name(HU key), goal(HU key) }. Unknown ids fall back to classic.
  const MODE_INTRO={
    classic:  { icon:'⚔️', name:'Klasszikus csata',     goal:'Győzd le az ellenfél egész csapatát, hogy te maradj az utolsó.' },
    ffa:      { icon:'🎯', name:'Mindenki ellen',        goal:'Mindenki magáért! Kapard ki a győzelmet a többi csapat ellen.' },
    aivsai:   { icon:'🤖', name:'Gép vs Gép',            goal:'Dőlj hátra és nézd, ahogy a gépek harcolnak egymással.' },
    nest:     { icon:'🥚', name:'Fészekrablás',          goal:'Törj át a védőkön és pusztítsd el az ellenséges fészket.' },
    gauntlet: { icon:'🔥', name:'Tűzpróba',              goal:'Élj túl egymást követő, egyre nehezebb hullámokat.' },
    bossrush: { icon:'👹', name:'Főnök-roham',           goal:'Győzd le a hatalmas főnököket egymás után.' },
    survival: { icon:'🌊', name:'Túlélés',               goal:'Tarts ki, ameddig csak tudsz a végtelen ellenfél-hullámokkal szemben.' },
    koth:     { icon:'👑', name:'Király a dombon',       goal:'Foglald el és tartsd a dombot, amíg fel nem töltöd a pontmérőt.' },
    sniper:   { icon:'🔭', name:'Mesterlövész-párbaj',   goal:'Egy lövés, egy élet — találd el az ellenfelet, mielőtt ő tesz veled.' },
    bombrun:  { icon:'💣', name:'Bomba-futás',           goal:'Vidd el a bombát a célig, mielőtt felrobban!' },
    coop:     { icon:'🤝', name:'Kooperatív',            goal:'Fogjatok össze, és együtt győzzétek le a gép csapatait.' },
    quick:    { icon:'⚡', name:'Gyors meccs',           goal:'Gyors meccs az alap szabályokkal — ugorj be és harcolj!' },
    golf:     { icon:'⛳', name:'Golf',                  goal:'Juttasd a labdát a lyukba a lehető legkevesebb lövésből.' },
    race:     { icon:'🏁', name:'Verseny',               goal:'Érj célba elsőként a pályán át!' },
    laststand:{ icon:'🛡️', name:'Utolsó állás',         goal:'Védd meg az állásodat a túlerővel szemben, ameddig csak bírod.' },
    campaign: { icon:'🗺️', name:'Kampány',              goal:'Teljesítsd a küldetést és szerezd meg a csillagokat.' },
    tutorial: { icon:'🎓', name:'Oktatómód',            goal:'Tanuld meg az alapokat: mozgás, célzás, tüzelés.' },
    arcade:   { icon:'🕹️', name:'Arcade',               goal:'Idő- és pontvadászat: 120 másodperc alatt szerezz minél több találatot!' },
    forts:    { icon:'🏰', name:'Erődök',               goal:'Mindkét csapat saját emelt erődön áll — robbantsd szét az ellenfél bázisát!' }
  };
  let _modeIntroT=-1;                  // <0 = not armed; counts up while shown
  const MODE_INTRO_LIFE=4.0;          // seconds the banner stays up
  function armModeIntro(){
    // don't pop over a puzzle's own intro banner
    if(S && S._puzzle){ _modeIntroT=-1; return; }
    _modeIntroT=0;
  }

  /* ---------- geometry helpers ---------- */
  function pt(e){
    const cv=CA.canvas, r=cv.getBoundingClientRect();
    return { x:(e.clientX-r.left)*(cv.width/r.width), y:(e.clientY-r.top)*(cv.height/r.height) };
  }
  function hit(b,p){ return p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h; }
  // greedy word-wrap to `maxW` px using the CURRENT ctx.font; returns line array.
  function wrapText(ctx, str, maxW){
    const words=String(str).split(/\s+/); const lines=[]; let line='';
    for(let i=0;i<words.length;i++){
      const test=line?(line+' '+words[i]):words[i];
      if(ctx.measureText(test).width>maxW && line){ lines.push(line); line=words[i]; }
      else line=test;
    }
    if(line) lines.push(line);
    return lines;
  }
  // ---- weapon-icon TINT: the game-icons PNGs are flat white (hard to read, and
  // invisible on the light "selected" chip). Recolor them per type (cached). ----
  const _tintCache={};
  function tintIcon(img, color){
    if(!img) return null;
    var w=img.naturalWidth||img.width||0, h=img.naturalHeight||img.height||0;
    if(!w || !h || (img.complete===false)) return null;   // not loaded yet → draw raw
    var key=(img.src||'')+'|'+color;
    var c=_tintCache[key];
    if(!c){
      c=document.createElement('canvas'); c.width=w; c.height=h;
      var g=c.getContext('2d');
      try{ g.drawImage(img,0,0,w,h); g.globalCompositeOperation='source-in';
           g.fillStyle=color; g.fillRect(0,0,w,h); }catch(e){ return null; }
      _tintCache[key]=c;
    }
    return c;
  }
  // colour for a weapon/ability icon: dark on the light selected chip, else a
  // soft type colour (abilities=lavender, damaging=warm orange, utility=mint).
  function iconTint(w, sel){
    if(sel) return '#2a1638';
    if(w && w.ability) return '#e7ccff';
    if(w && (w.damage>0)) return '#ffc888';
    return '#a6ecd0';
  }
  function rr(ctx,x,y,w,h,r){ r=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function isHumanTurn(){
    const t=S.teams[S.currentTeamIdx];
    return t && t.isAI===false;
  }
  function unlockAudio(){ if(CA.Audio&&CA.Audio.init) CA.Audio.init(); }
  // menu UI click feedback — fired on every button / tab / toggle tap
  function clickSfx(){ try{ if(CA.Audio&&CA.Audio.play) CA.Audio.play('click'); }catch(_){} }

  // ---------- screenshot / share (game-over screen) ----------
  // Snapshot the live canvas to a PNG, then: on a capable mobile use the native
  // share sheet with the image file; otherwise download it (anchor[download])
  // or open it in a new tab. Whole thing is best-effort and never throws.
  function shareScreenshot(){
    clickSfx();
    try{
      const cv=CA.canvas; if(!cv || !cv.toDataURL) return;
      const url=cv.toDataURL('image/png');
      const fname='animal-battle-ground-'+Date.now()+'.png';
      // Prefer the Web Share API with a file (mobile) when supported.
      let shared=false;
      try{
        if(navigator.canShare && typeof fetch==='function'){
          // dataURL → Blob → File without a network round-trip.
          fetch(url).then(function(r){ return r.blob(); }).then(function(blob){
            const file=new File([blob], fname, { type:'image/png' });
            if(navigator.canShare({ files:[file] }) && navigator.share){
              navigator.share({ files:[file], title:'Animal Battle Ground',
                text:t('🏆 Animal Battle Ground eredmény') }).catch(function(){});
            } else {
              downloadDataUrl(url, fname);
            }
          }).catch(function(){ downloadDataUrl(url, fname); });
          shared=true;
        }
      }catch(_){ shared=false; }
      if(!shared) downloadDataUrl(url, fname);
    }catch(_){ /* never throw */ }
  }
  function downloadDataUrl(url, fname){
    try{
      const a=document.createElement('a');
      a.href=url; a.download=fname;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
    }catch(_){
      // last resort: pop it in a new tab so the user can long-press / save.
      try{ window.open(url, '_blank'); }catch(__){}
    }
  }

  function hasScreens(){ return !!(CA.Screens && CA.Screens.list); }
  function isDelegatedScreen(name){
    if(!hasScreens()) return false;
    try{ return CA.Screens.list().indexOf(name)>=0; }catch(_){ return false; }
  }

  /* ---------- weapon category helpers ---------- */
  // Tabs over the 21 weapons. Each maps a label to the weapon `category` values.
  const WCATS=[
    {id:'all',        label:'Mind',     emoji:'🎒', cats:null},
    {id:'projectile', label:'Lövedék',  emoji:'🚀', cats:['projectile']},
    {id:'throwable',  label:'Dobható',  emoji:'💣', cats:['throwable']},
    {id:'gun',        label:'Tűzfegyver',emoji:'🔫', cats:['gun']},
    {id:'special',    label:'Speciális',emoji:'✨', cats:['special']},
    {id:'utility',    label:'Mozgás',   emoji:'🪂', cats:['utility']},
    // NOTE: WCATS labels are rendered via CA.t(c.label) at the tab draw site.
  ];
  let wcat='all';
  function filteredWeapons(){
    const L=(CA.Weapons&&CA.Weapons.LIST)||[];
    const cat=WCATS.find(c=>c.id===wcat);
    let out;
    if(!cat || !cat.cats) out=L.slice();
    else out=L.filter(w=>cat.cats.indexOf(w.category)>=0);
    // v4: class-ability weapons live in the dedicated ability-bar, never the
    // generic weapon strip (they'd otherwise pollute "Mind"/"Speciális").
    return out.filter(w=>!w.ability);
  }

  /* ---------- v4 class helpers (all guard a totally-absent class system) ---- */
  // ordered list of registered class ids (necro/guardian/mage/hunter/engineer/healer)
  function classIds(){
    try{ return (CA.Classes && CA.Classes.list) ? CA.Classes.list() : []; }catch(_){ return []; }
  }
  function classDef(id){ return (id && CA.Classes && CA.Classes[id]) || null; }
  // a sensible default class spread for a 5-unit team (cycles the registry)
  function defaultClasses(){
    const ids=classIds();
    if(!ids.length) return [];
    const out=[];
    for(let i=0;i<C.TEAM_SIZE;i++) out.push(ids[i%ids.length]);
    return out;
  }
  // The ABILITY weapons available to a unit's class, as weapon objects, plus the
  // UNIVERSAL weapons. Falls back to the plain weapon LIST when no class system.
  function abilityWeaponsFor(u){
    const L=(CA.Weapons&&CA.Weapons.LIST)||[];
    if(S.dev) return L.slice();   // dev sandbox: ALL weapons available in the bar
    const def=u && CA.classOf ? CA.classOf(u) : null;
    const out=[];
    // universal weapons (tagged universal:true) FIRST — always offered
    for(const w of L){ if(w.universal && out.indexOf(w)<0) out.push(w); }
    // crate-granted weapons (napalm/cluster/etc.) so picked-up rewards are usable
    const cw=(S._crateWeapons)||null;
    if(cw){ for(const w of L){ const _a=CA.ammoOf(w.id); if(cw[w.id] && (_a>0||_a<0) && out.indexOf(w)<0) out.push(w); } }
    // CLASS-specific abilities LAST (end of the row) — set apart visually too (Jani).
    if(def && Array.isArray(def.abilities)){
      for(const aid of def.abilities){ const w=L.find(x=>x.id===aid); if(w && out.indexOf(w)<0) out.push(w); }
    }
    // SPECIES ultimate (capybomb/drill/spikeball/logtoss/bellyflop/eggbomb …) —
    // the AI fires these (ai.js via speciesOf().ultimate), so the human player
    // must see them in the bar too. Append at the END if not already present.
    // cooldown/ammo gating is handled by the existing bar logic.
    const sp = CA.speciesOf && CA.speciesOf(u);
    if(sp && sp.ultimate){ const w=L.find(x=>x.id===sp.ultimate); if(w && out.indexOf(w)<0) out.push(w); }
    // DEMO content gate: keep all CLASS abilities (classes are already limited in
    // the loadout) but among NON-ability weapons (universal/crate/species-ultimate)
    // keep only the demo allowlist. Defensive: skip if the list is missing.
    if(CA.demoLocked && CA.demoLocked() && Array.isArray(CA.DEMO_WEAPONS)){
      return out.filter(w=> (w && w.ability) || (w && CA.DEMO_WEAPONS.indexOf(w.id)>=0));
    }
    return out;
  }

  CA.UI={
    init(){
      const cv=CA.canvas; if(!cv) return;
      cv.style.touchAction='none';

      // mute is SESSION-ONLY (Jani: master mute, de NE perzisztens) — always start
      // UN-MUTED so it can never get stuck silent across reloads / new sessions.
      try{ if(CA.Audio) CA.Audio.muted=false; if(CA.settings) CA.settings.muted=false; localStorage.removeItem('ca_muted'); }catch(_){}
      if(CA.Screens && CA.Screens.init){ try{ CA.Screens.init(); }catch(_){} }

      // ---- shareable clips (CA.Share): init the recorder + flag big moments ----
      // (skipped on the Poki build: the share button is hidden there, so the
      // continuous MediaRecorder+captureStream was pure CPU/memory cost)
      try{ if(!(typeof window!=='undefined' && window.CA_PORTAL==='poki') && CA.Share && CA.Share.init){ CA.Share.init(cv); } }catch(_){}
      try{ _coachSeen = (localStorage.getItem('ca_seen_coach')==='1'); }catch(_){}
      if(CA.events && CA.events.on){
        // central "Ujra" stash: the live DOM menu (menu.js) never set
        // lastNewGameOpts, so the game-over Replay either re-ran a STALE earlier
        // match or a lossy reconstruction. core emits the exact opts here.
        CA.events.on('gameStart', (opts)=>{ try{
          if(opts && typeof opts==='object') lastNewGameOpts = opts;
          _lastRunKind = (S._puzzle && S._puzzle.id!=null) ? {puzzle:S._puzzle.id}
                       : (S._challenge && S._challenge.kind) ? {challenge:S._challenge.kind} : null;
        }catch(_){} });
        // first-run coachmarks: the charge-fire step advances on the first shot
        CA.events.on('fired', ()=>{ if(_coachStep>=0 && _coachStep<3){ _coachStep=3; _coachT=0; } });
        // flag a kill/explosion so the exported clip centres on the action
        CA.events.on('unitDied', ()=>{ try{ if(CA.Share && CA.Share.markMoment) CA.Share.markMoment(); }catch(_){} });
        CA.events.on('explosion', ()=>{ try{ if(CA.Share && CA.Share.markMoment) CA.Share.markMoment(); }catch(_){} });
      }

      // ---- toast listeners (#7/#8): combo/crit/generic 'toast' events ----
      if(CA.events && CA.events.on){
        CA.events.on('toast', (text)=>pushToast(text));
        CA.events.on('combo', (hits)=>pushToast(t('🔥 KOMBÓ ×')+(hits||2)+'!'));
        CA.events.on('crit',  ()=>pushToast(t('💥 KRITIKUS!')));
        // ---- haptics (#39): vibrate on hits / fire when enabled ----
        CA.events.on('unitDamaged', ()=>doHaptic(18));
        CA.events.on('fired',       ()=>doHaptic(12));
        // ---- floating damage numbers (HUD juice) ----
        // entities.js emits: emit('unitDamaged', unit, amount, { unit, amount, crit, x, y }).
        // The structured payload (3rd arg) is the confirmed contract shape; we
        // fall back to (unit, amount) if it's ever omitted. fx.js owns rendering.
        CA.events.on('unitDamaged', (unit, amount, payload)=>{
          if(!CA.fx || !CA.fx.damageText) return;
          const d = (payload && typeof payload==='object') ? payload
                  : { x:(unit&&unit.x)||0, y:(unit&&unit.y)||0, amount, crit:false };
          const amt=Math.round(Math.abs(d.amount||0));
          if(amt<=0) return;
          try{ CA.fx.damageText(d.x||0, (d.y||0)-20, '-'+amt, { kind: d.crit?'crit':'normal' }); }catch(_){}
        });
        // ---- "your turn" handoff banner (HUD juice) ----
        CA.events.on('turnStart', ()=>{ showTurnBanner(); });
        // reset the victory confetti latch when a fresh game starts
        CA.events.on('turnStart', ()=>{ victoryShown=false; });
        // ---- mode-intro banner: arm on every fresh match (#mode-intro) ----
        CA.events.on('gameStart', ()=>{ armModeIntro(); });
      }

      // ---- text-input + key-rebind keydown listener ----
      window.addEventListener('keydown', e=>{
        // (1) key-rebind capture takes precedence anywhere in the menu
        if(rebindAction){
          e.preventDefault();
          if(e.stopImmediatePropagation) e.stopImmediatePropagation();
          if(e.code==='Escape'){ rebindAction=null; return; }
          if(CA.settings){
            const km=CA.settings.keymap;
            const oldCode=km[rebindAction];
            // DUPLICATE-KEY GUARD: if this code is already bound to a DIFFERENT
            // action, SWAP — the other action inherits the key we're replacing, so
            // no action is ever left without a binding (and no two share one key).
            let dupAct=null;
            for(const k in km){ if(k!==rebindAction && km[k]===e.code){ dupAct=k; break; } }
            if(dupAct){ km[dupAct]=oldCode; pushToast(t('Ez a gomb már foglalt')); }
            km[rebindAction]=e.code;
            CA.settings.save&&CA.settings.save();
          }
          rebindAction=null;
          if(CA.Audio&&CA.Audio.play)CA.Audio.play('select');
          return;
        }
        // (2) name fields (only on MENU, with a focused field)
        if(S.mode!==G.MENU || !focusedField) return;
        const k=e.key;
        const buf=fieldRef(focusedField);
        if(!buf) return;
        if(k==='Backspace'){ buf.set(buf.get().slice(0,-1)); e.preventDefault(); return; }
        if(k==='Enter'||k==='Escape'){ focusedField=null; e.preventDefault(); return; }
        if(k==='Tab'){ e.preventDefault(); return; }
        if(k.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey){
          if(buf.get().length<18) buf.set(buf.get()+k);
          e.preventDefault();
        }
      });

      // ---- timer-grenade fuse key (F): cycle 1..5s when that weapon is held ----
      window.addEventListener('keydown', e=>{
        if(S.mode!==G.PLAYING || S.paused) return;
        if(this.isTextInputActive&&this.isTextInputActive()) return;
        if(e.code!=='KeyF') return;
        if(S.selectedWeapon!=='timergrenade') return;
        if(!isHumanTurn()) return;
        if(CA.Weapons&&CA.Weapons.cycleTimerFuse){
          CA.Weapons.cycleTimerFuse();
          clickSfx();
          e.preventDefault();
        }
      });

      cv.addEventListener('pointerdown', e=>{
        const p=pt(e);

        // ---------- MENU (multi-screen) ----------
        if(S.mode===G.MENU){
          unlockAudio();

          // delegated full-page screens
          if(isDelegatedScreen(screen)){
            try{ CA.Screens.handlePointer(screen, p); }catch(_){}
            return;
          }

          // sliders (settings) — start a drag
          for(const sl of menuSliders){
            if(hit({x:sl.x-8,y:sl.y-10,w:sl.w+16,h:sl.h+20},p)){
              try{ cv.setPointerCapture(e.pointerId); }catch(_){}
              activePointers[e.pointerId]={kind:'slider', slider:sl};
              setSliderFromPointer(sl,p);
              clickSfx();
              return;
            }
          }
          // On scrollable screens (settings/newgame) defer the tap to pointerup so
          // a vertical drag scrolls instead of activating a button. We still let
          // text fields focus immediately (no scroll conflict on a tiny target).
          if(screenScrolls() && maxScroll()>0){
            try{ cv.setPointerCapture(e.pointerId); }catch(_){}
            activePointers[e.pointerId]={kind:'menuscroll', startY:p.y, startScroll:scrollY, p, moved:false};
            return;
          }
          // text fields focus
          let hitField=false;
          for(const f of menuFields){ if(hit(f,p)){ focusedField=f.key; hitField=true; break; } }
          if(hitField){ clickSfx(); if(CA.Audio&&CA.Audio.play)CA.Audio.play('select'); return; }
          // any button
          for(const b of menuBtns){ if(hit(b,p)){ focusedField=null; clickSfx(); b.act(); return; } }
          // tap empty -> defocus
          focusedField=null;
          return;
        }

        // ---------- GAME OVER ----------
        if(S.mode===G.GAME_OVER){
          for(const b of hudBtns){ if(hit(b,p)){ if(b.id==='mute'){ toggleMute(); } else { unlockAudio(); b.act&&b.act(); } return; } }
          return;
        }

        // ---------- PAUSE overlay (settings sub-page or pause menu) ----------
        if(S.paused && S.mode===G.PLAYING){
          if(pauseSettings){
            // the fixed Back/close control is checked FIRST so it always wins over
            // any body widget that may have scrolled under the header (#mobile-stuck).
            for(const b of hudBtns){ if(b.id==='pauseback' && hit(b,p)){ clickSfx(); b.act&&b.act(); return; } }
            for(const sl of menuSliders){
              if(hit({x:sl.x-8,y:sl.y-10,w:sl.w+16,h:sl.h+20},p)){
                try{ cv.setPointerCapture(e.pointerId); }catch(_){}
                activePointers[e.pointerId]={kind:'slider', slider:sl};
                setSliderFromPointer(sl,p);
                return;
              }
            }
            // TOUCH (#stuck-in-settings): a scroll capture used to swallow EVERY tap
            // on the toggle / segmented rows because the body was scrollable, so only
            // the sliders (handled above) ever reacted. Instead we capture a pointer
            // that REMEMBERS the widget under the finger: a real drag scrolls the body
            // and cancels that pending tap; a release without a meaningful drag fires
            // the remembered widget. This makes EVERY control respond on touch while
            // still allowing a vertical drag to scroll.
            if(IS_TOUCH){
              let pendBtn=null;
              for(const b of hudBtns){ if(b.id!=='pauseback' && hit(b,p)){ pendBtn=b; break; } }
              try{ cv.setPointerCapture(e.pointerId); }catch(_){}
              activePointers[e.pointerId]={kind:'pausescroll', startY:p.y, startScroll:scrollY,
                                           p, moved:false, scrollable:(maxScroll()>0), pendBtn};
              return;
            }
          }
          for(const b of hudBtns){ if(hit(b,p)){ clickSfx(); b.act&&b.act(); return; } }
          return;
        }

        // ---------- IN-GAME HUD (mute + pause always clickable) ----------
        for(const b of hudBtns){
          if((b.id==='mute'||b.id==='pause') && hit(b,p)){ b.act&&b.act(); return; }
        }

        // gameplay controls only on a HUMAN turn
        if(!isHumanTurn()) return;

        // end-turn
        for(const b of hudBtns){
          if(b.id==='endturn' && hit(b,p)){ if(CA.endTurn) CA.endTurn(); return; }
        }
        // timer-grenade fuse chip (tap to cycle 1..5s)
        for(const b of hudBtns){
          if(b.id==='timerfuse' && hit(b,p)){ b.act&&b.act(); return; }
        }
        // v4 ability-bar selection (on-cooldown abilities are not selectable)
        for(const b of abilityBtns){
          if(hit(b,p)){
            // tap-and-hold → show tooltip (works even for on-cooldown chips)
            abilityHold={ id:b.id, t:0 };
            if(b.cd>0){ return; }     // on cooldown — ignore the SELECT (tooltip still shows)
            clickSfx(); S.selectedWeapon=b.id; if(CA.events)CA.events.emit('sfx','select'); return;
          }
        }
        // weapon-panel paging arrows / tabs
        for(const b of weaponNav){ if(hit(b,p)){ clickSfx(); b.act(); if(CA.events)CA.events.emit('sfx','select'); return; } }
        // weapon selection (an unavailable weapon is greyed out & not selectable)
        for(const b of weaponBtns){
          if(hit(b,p)){
            if(weaponUnavailable(b.id)){ return; }   // depleted/cd/forbidden/spent: ignore the tap
            clickSfx(); S.selectedWeapon=b.id; if(CA.events)CA.events.emit('sfx','select'); return;
          }
        }
        // on-screen touch controls (hold buttons)
        for(const b of touchBtns){
          if(hit(b,p)){
            try{ cv.setPointerCapture(e.pointerId); }catch(_){}
            activePointers[e.pointerId]={kind:b.kind, dir:b.dir, id:b.id};
            applyTouch(b, true);
            return;
          }
        }
      });

      cv.addEventListener('pointermove', e=>{
        // PC hover position for the ability-bar tooltip (mouse only; touch uses
        // tap-and-hold instead). Cheap: just stash the canvas-space point.
        if(e.pointerType!=='touch'){ hoverPt=pt(e); }
        const ap=activePointers[e.pointerId];
        if(!ap){
          // a held-down ability chip that the finger dragged off cancels its hold
          if(abilityHold){
            const p=pt(e); let still=false;
            for(const b of abilityBtns){ if(b.id===abilityHold.id && hit(b,p)){ still=true; break; } }
            if(!still) abilityHold=null;
          }
          return;
        }
        if(ap.kind==='slider'){ setSliderFromPointer(ap.slider, pt(e)); return; }
        if(ap.kind==='menuscroll' || ap.kind==='pausescroll'){
          const cur=pt(e);
          const dy=cur.y-ap.startY;
          if(Math.abs(dy)>6) ap.moved=true;
          // only actually scroll when there is overflow to scroll (pausescroll may be
          // armed purely to remember a tapped widget on a non-overflowing body).
          if(ap.kind!=='pausescroll' || ap.scrollable){ scrollY=ap.startScroll-dy; clampScroll(); }
          return;
        }
      });

      const release=e=>{
        abilityHold=null;            // end any tap-and-hold tooltip
        const ap=activePointers[e.pointerId];
        if(ap){
          if(ap.kind==='slider'){ if(CA.settings&&CA.settings.save)CA.settings.save(); }
          else if(ap.kind==='menuscroll'){
            // A true tap (no meaningful drag) activates the widget under it.
            if(!ap.moved && S.mode===G.MENU){
              const p=ap.p;
              let done=false;
              for(const f of menuFields){ if(hit(f,p)){ focusedField=f.key; clickSfx(); if(CA.Audio&&CA.Audio.play)CA.Audio.play('select'); done=true; break; } }
              if(!done) for(const b of menuBtns){ if(hit(b,p)){ focusedField=null; clickSfx(); b.act(); done=true; break; } }
              if(!done) focusedField=null;
            }
          }
          else if(ap.kind==='pausescroll'){
            // pause-settings body: a true tap (no meaningful drag) activates the
            // widget the finger went down on. We prefer the widget REMEMBERED at
            // pointerdown (pendBtn) so a tap always hits the control under the finger
            // even if a tiny jitter nudged scrollY; fall back to a fresh hit-test.
            if(!ap.moved){
              if(ap.pendBtn && ap.pendBtn.act){ clickSfx(); ap.pendBtn.act(); }
              else { const p=ap.p; for(const b of hudBtns){ if(hit(b,p)){ clickSfx(); b.act&&b.act(); break; } } }
            }
          }
          else releaseTouch(ap);
          delete activePointers[e.pointerId];
        }
      };
      cv.addEventListener('pointerup', release);
      cv.addEventListener('pointercancel', release);
      cv.addEventListener('pointerleave', ()=>{ hoverPt=null; abilityHold=null; /* keep gameplay holds; capture handles those */ });

      // mouse-wheel scroll for overflowing screens. Works on the MENU screens
      // (settings / newgame) AND the IN-GAME pause-settings overlay (PLAYING +
      // paused) — the latter was unscrollable on PC (no touch drag), so the
      // bottom of Settings was unreachable. (#pause-settings-wheel)
      cv.addEventListener('wheel', e=>{
        const onMenu = (S.mode===G.MENU && screenScrolls());
        if((onMenu || pauseSettings) && maxScroll()>0){
          e.preventDefault();
          scrollY+=e.deltaY; clampScroll();
        }
      }, {passive:false});
    },

    /* ---- screen-state API for screens.js ---- */
    setScreen(name){ screen=name||'main'; focusedField=null; rebindAction=null; scrollY=0; scrollMaxY=0; try{ if(CA.resize) CA.resize(); }catch(_){} },
    screen(){ return screen; },

    /* ====================================================================
     * MENU
     * ==================================================================*/
    renderMenu(ctx){
      // v4: screens converted to the HTML menu (CA.Menu) are drawn by the DOM —
      // the canvas must NOT draw them underneath. Just clear to the dark bg.
      // EXCEPTION — the level editor is a HYBRID screen: the DOM renders only
      // the toolbar (transparent overlay), while the CANVAS keeps drawing the
      // paint preview (terrain + cursor). So for 'editor' we fall through and
      // delegate to CA.Screens.render below even though CA.Menu "handles" it.
      if(window.CA && CA.Menu && CA.Menu.handles && CA.Menu.handles(screen) && screen!=='editor') return;
      menuT+=1/60; caretT+=1/60;
      menuBtns=[]; menuFields=[]; menuSliders=[];
      ctx.textBaseline='alphabetic';

      // reset scroll whenever the active screen changes
      if(screen!==this._lastScreen){ this._lastScreen=screen; scrollY=0; scrollMaxY=0; }
      // non-scrolling screens never keep an offset
      if(!screenScrolls()){ scrollY=0; scrollMaxY=0; }

      // delegate full pages to CA.Screens
      if(isDelegatedScreen(screen)){
        try{ CA.Screens.render(screen, ctx); }catch(_){ screen='main'; }
        return;
      }

      // shared background gradient + bokeh
      const g=ctx.createLinearGradient(0,0,0,C.VIEW_H);
      g.addColorStop(0,'#1b3b54'); g.addColorStop(0.6,'#16475f'); g.addColorStop(1,'#0c2230');
      ctx.fillStyle=g; ctx.fillRect(0,0,C.VIEW_W,C.VIEW_H);
      for(let i=0;i<24;i++){
        const x=((i*137)%C.VIEW_W) + Math.sin(menuT*0.4+i)*20;
        const y=((i*89)%C.VIEW_H) + Math.cos(menuT*0.3+i)*16;
        // spooky-cute: every 3rd bokeh gets a soft purple glow (tasteful accent)
        ctx.fillStyle=(i%3===0)
          ? 'rgba(176,140,230,'+(0.04+0.03*((i*7)%5)/5)+')'
          : 'rgba(255,255,255,'+(0.03+0.03*((i*7)%5)/5)+')';
        ctx.beginPath(); ctx.arc(x,y,12+(i%4)*8,0,7); ctx.fill();
      }

      if(screen==='main')          this._menuMain(ctx);
      else if(screen==='newgame')  this._menuNewGame(ctx);
      else if(screen==='settings') this._menuSettings(ctx);
      else if(screen==='credits')  this._menuCredits(ctx);
      else if(screen==='teamedit') this._menuTeamEdit(ctx);
      else if(screen==='skilltree') this._menuSkillTree(ctx);
      else { screen='main'; this._menuMain(ctx); }
    },

    /* ---------- shared menu widgets ---------- */
    _menuButton(ctx, b){
      ctx.fillStyle='rgba(0,0,0,0.3)'; rr(ctx,b.x+3,b.y+4,b.w,b.h,14); ctx.fill();
      ctx.fillStyle=b.col||'#3f86a4'; rr(ctx,b.x,b.y,b.w,b.h,14); ctx.fill();
      if(b.sel){ ctx.strokeStyle='#fff7e6'; ctx.lineWidth=3; rr(ctx,b.x,b.y,b.w,b.h,14); ctx.stroke(); ctx.lineWidth=1; }
      ctx.fillStyle='rgba(255,255,255,0.15)'; rr(ctx,b.x,b.y,b.w,b.h/2,14); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='bold '+(b.fs||24)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      ctx.fillText(b.label, b.x+b.w/2, b.y+b.h/2+(b.fs?b.fs/3:8));
      menuBtns.push(b);
    },
    _backButton(ctx){
      const ui=metrics().ui;
      const b={x:16*ui, y:16*ui, w:132*ui, h:48*ui, label:t('‹ Vissza'), col:'#33485a',
               act:()=>{ focusedField=null; rebindAction=null; screen='main'; scrollY=0; scrollMaxY=0; }};
      ctx.fillStyle=b.col; rr(ctx,b.x,b.y,b.w,b.h,12); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='bold '+(18*ui)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(b.label, b.x+b.w/2, b.y+b.h/2); ctx.textBaseline='alphabetic';
      menuBtns.push(b);
    },
    // a tiny dark, circular Steam-style logo at (cx,cy), radius r.
    _steamLogo(ctx, cx, cy, r){
      ctx.save();
      ctx.beginPath(); ctx.arc(cx,cy,r,0,7);
      ctx.fillStyle='#1b2838'; ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.45)'; ctx.lineWidth=Math.max(1,r*0.12); ctx.stroke();
      // big node (lower-left) + small node (upper-right) joined by the "pipe"
      const bx=cx-r*0.3, by=cy+r*0.28, sr=r*0.34;
      const sx=cx+r*0.35, sy=cy-r*0.32, ssr=r*0.18;
      ctx.strokeStyle='#cfe6f2'; ctx.lineWidth=Math.max(1,r*0.13);
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(sx,sy); ctx.stroke();
      ctx.fillStyle='#cfe6f2'; ctx.beginPath(); ctx.arc(bx,by,sr,0,7); ctx.fill();
      ctx.fillStyle='#9fc0d2'; ctx.beginPath(); ctx.arc(bx,by,sr*0.42,0,7); ctx.fill();
      ctx.fillStyle='#cfe6f2'; ctx.beginPath(); ctx.arc(sx,sy,ssr,0,7); ctx.fill();
      ctx.restore();
    },
    // shared menu footer: copyright, "Available soon on Steam" w/ logo, version.
    _menuFooter(ctx, M){
      const ui=(M&&M.ui)||metrics().ui, VW=C.VIEW_W, VH=C.VIEW_H;
      ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      // baselines: copyright on top, Steam line below it (clear vertical gap so
      // the logo never reaches up into the copyright row).
      const copyY=VH-26*ui;          // copyright baseline
      const steamY=VH-8*ui;          // Steam-line baseline
      // copyright
      ctx.font=(12*ui)+'px '+FONT; ctx.fillStyle='#9fc0d2';
      ctx.fillText('© 2026 Los Polos Amigos — Animal Battle Ground', VW/2, copyY);
      // Steam line: a logo on the LEFT, then a clear gap, then the text. Both are
      // laid out as one CENTERED group measured via ctx.measureText so the logo
      // can never collide with the words.
      const steamTxt=t('Available soon on Steam');
      ctx.font=(12*ui)+'px '+FONT;
      const tw=ctx.measureText(steamTxt).width;
      const lr=7*ui;                 // logo radius
      const lgap=10*ui;              // gap between logo and text
      const block=lr*2+lgap+tw;      // total group width
      const gx=VW/2-block/2;         // left edge of the group
      const logoCx=gx+lr;
      const logoCy=steamY-4*ui;      // vertically center the logo on the text x-height
      this._steamLogo(ctx, logoCx, logoCy, lr);
      ctx.fillStyle='#bcd2df'; ctx.textAlign='left';
      ctx.fillText(steamTxt, gx+lr*2+lgap, steamY);
      ctx.textAlign='center';
      // version (subtle, bottom-right corner)
      ctx.font=(11*ui)+'px '+FONT; ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.textAlign='right';
      ctx.fillText(VERSION, VW-10*ui, VH-8*ui);
      ctx.textAlign='left';
    },
    _screenTitle(ctx, txt){
      const ui=metrics().ui;
      ctx.textAlign='center';
      ctx.font='bold '+(40*ui)+'px '+FONT;
      const y=58*ui;
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillText(txt, C.VIEW_W/2+3, y+3);
      ctx.fillStyle='#fff7e6';        ctx.fillText(txt, C.VIEW_W/2, y);
    },
    // small pill toggle/selector button
    _pill(ctx,b){
      ctx.fillStyle=b.sel?(b.col||'#3fa45a'):'rgba(255,255,255,0.12)';
      rr(ctx,b.x,b.y,b.w,b.h,10); ctx.fill();
      if(b.sel){ ctx.strokeStyle='#fff7e6'; ctx.lineWidth=2; rr(ctx,b.x,b.y,b.w,b.h,10); ctx.stroke(); ctx.lineWidth=1; }
      ctx.fillStyle=b.sel?'#fff':'#cfe6f2'; ctx.font=(b.bold?'bold ':'')+(b.fs||16)+'px '+FONT;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(b.label, b.x+b.w/2, b.y+b.h/2);
      ctx.textBaseline='alphabetic';
      menuBtns.push(b);
    },

    /* ---------- v4 class picker (New Game, player team) ----------
     * Renders TEAM_SIZE unit slots; each cycles through the registered classes.
     * Writes ng.classes[] (length TEAM_SIZE). A "🎲 Vegyes" pill resets to the
     * mixed default. Shows the selected class's passive briefly. Returns bottom y.
     * No-op (returns y unchanged) if the class system isn't loaded yet. */
    _classPickerNG(ctx, colL, colW, y, ui){
      const ids=classIds();
      if(!ids.length) return y;          // classic match, no class system -> skip
      // normalise ng.classes to a full TEAM_SIZE array (default = mixed)
      const def=defaultClasses();
      if(!Array.isArray(ng.classes) || ng.classes.length!==C.TEAM_SIZE){
        ng.classes=def.slice();
      }
      ctx.textAlign='left'; ctx.font='bold '+(14*ui)+'px '+FONT; ctx.fillStyle='#d6aaff';
      ctx.fillText(t('🌳 ')+t('Osztályok'), colL, y+4*ui);
      let py=y+14*ui;
      // "Vegyes" reset pill
      this._pill(ctx,{x:colL,y:py,w:Math.min(120*ui,colW*0.34),h:32*ui,label:t('🎲 Vegyes'),
        sel:false,col:'#8a6db0',fs:12*ui, act:()=>{ ng.classes=defaultClasses(); }});
      py+=40*ui;
      // one cycling pill per unit slot
      const perRow=Math.max(1, Math.floor(colW/(Math.min(168*ui,colW)+8*ui)));
      const cellW=Math.min(168*ui,(colW-(perRow-1)*8*ui)/perRow);
      const cycle=(i,dir)=>{ const cur=ids.indexOf(ng.classes[i]); const nn=ids.length;
        ng.classes[i]=ids[((cur<0?0:cur)+dir+nn)%nn]; };
      for(let i=0;i<C.TEAM_SIZE;i++){
        const col=i%perRow, row=(i/perRow)|0;
        const cx=colL+col*(cellW+8*ui), ry=py+row*40*ui;
        const d=classDef(ng.classes[i]);
        const emoji=(d&&d.animal)?d.animal:'❓';
        const nm=(d&&d.name)?t(d.name):t(ng.classes[i]||'');
        this._pill(ctx,{x:cx,y:ry,w:cellW,h:34*ui,label:emoji+' '+nm,sel:true,col:'#5a3f7a',fs:12*ui,
          act:()=>cycle(i,1)});
      }
      const rows=Math.ceil(C.TEAM_SIZE/perRow);
      py+=rows*40*ui;
      // passive of the FIRST slot's class (a quick hint of what classes do)
      const d0=classDef(ng.classes[0]);
      if(d0 && d0.passiveDesc){
        ctx.textAlign='left'; ctx.font=(12*ui)+'px '+FONT; ctx.fillStyle='#bfa9d6';
        ctx.fillText(t('Passzív: ')+t(d0.passiveDesc), colL, py+10*ui);
        py+=18*ui;
      }
      return py;
    },

    /* ---------- MAIN screen ---------- */
    _menuMain(ctx){
      const M=metrics();
      if(M.desktop) return this._menuMainDesktop(ctx, M);
      return this._menuMainCompact(ctx, M);
    },

    // -- stylized Animal Battle Ground wordmark under the logo --
    _wordmark(ctx, cx, y, size){
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      const txt='Animal Battle Ground';
      // auto-fit the font so the (longer) name never overflows its zone
      let fs=size;
      ctx.font='800 '+fs+'px '+FONT;
      let w=ctx.measureText(txt).width;
      const maxW=cx*1.7;
      if(w>maxW){ fs=size*maxW/w; ctx.font='800 '+fs+'px '+FONT; w=ctx.measureText(txt).width; }
      // soft shadow
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillText(txt, cx+fs*0.04, y+fs*0.05);
      // warm gradient fill
      const g=ctx.createLinearGradient(cx-w/2,0,cx+w/2,0);
      g.addColorStop(0,'#ffd76a'); g.addColorStop(0.5,'#ff9bb3'); g.addColorStop(1,'#8fd0ff');
      ctx.fillStyle=g; ctx.fillText(txt, cx, y);
      ctx.lineJoin='round'; ctx.lineWidth=Math.max(1,fs*0.045);
      ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.strokeText(txt, cx, y);
      ctx.restore();
    },

    // -- MOBILE / narrow: a single CENTERED vertical column, sized to the phone
    // so every button + the copyright/Steam line + version always fit. --
    _menuMainCompact(ctx, M){
      const ui=M.ui, VW=M.VW, VH=M.VH;
      ctx.textAlign='center'; ctx.textBaseline='alphabetic';

      // ----- header: logo + wordmark + subtitle -----
      const bob=Math.sin(menuT*1.8)*6*ui;
      const logo=CA.img&&CA.img('assets/logo.png');
      const top=VH*0.035;
      const lh=Math.min(VH*0.22, 84*ui), logoBottom=top+lh;
      if(logo){
        const lw=lh*(logo.naturalWidth/logo.naturalHeight);
        ctx.drawImage(logo, VW/2-lw/2, top+bob, lw, lh);
      } else {
        ctx.font='bold '+(44*ui)+'px '+FONT;
        ctx.fillStyle='#fff7e6'; ctx.fillText('🐹🪱', VW/2, top+lh*0.7+bob);
      }
      const wm=22*ui;
      this._wordmark(ctx, VW/2, logoBottom+wm*0.9, wm);
      ctx.font=(13*ui)+'px '+FONT; ctx.fillStyle='#bfe0f0'; ctx.textAlign='center';
      ctx.fillText(t('Cuki, de halálos'), VW/2, logoBottom+wm*1.6);

      // ----- reserve a fixed footer band, then fit the column between -----
      const footerH=44*ui;                       // copyright + steam + version
      const colTop=logoBottom+wm*2.2;
      const colBottom=VH-footerH;
      const avail=colBottom-colTop;

      const hasSave=!!(CA.hasSave&&CA.hasSave());
      const primary=[];
      if(hasSave) primary.push([t('▶ Folytatás'),'#e0a93f',()=>{ unlockAudio(); if(CA.enterFullscreen)CA.enterFullscreen(); CA.loadGame&&CA.loadGame(); }]);
      primary.push([t('🎮 Új játék'),'#3fa45a',()=>{ screen='newgame'; }]);
      primary.push([t('👥 Csapat szerkesztő'),'#3f86a4',()=>{ teOpen(); }]);
      primary.push([t('🌳 Képességfa'),'#7a5fa0',()=>{ stClass=null; screen='skilltree'; }]);
      primary.push([t('🌐 Multiplayer'),'#c0694a',()=>{ screen='lobby'; }]);
      primary.push([t('⚙️ Beállítások'),'#3f86a4',()=>{ screen='settings'; }]);
      primary.push([t('👏 Készítők'),'#8a6db0',()=>{ screen='credits'; }]);
      const secRows=hasScreens()?2:0;

      // total = primary rows + a small gap + secondary rows. Solve for bh so it
      // fits the available height (clamped to comfortable, finger-sized bounds).
      const gap=9*ui, secGapTop=8*ui, secH_ratio=0.78;
      const rows=primary.length;
      // avail = rows*bh + (rows-1)*gap + (secRows? secGapTop + secRows*(bh*secH_ratio) + (secRows-1)*gap : 0)
      let denom=rows + secRows*secH_ratio;
      let extra=(rows-1)*gap + (secRows? secGapTop + (secRows-1)*gap : 0);
      let bh=(avail-extra)/denom;
      bh=U.clamp(bh, 34*ui, 52*ui);

      const bw=Math.min(VW*0.78, 320*ui), x=VW/2-bw/2;
      let y=colTop;
      const fs=Math.min(20*ui, bh*0.45);
      for(const it of primary){ this._menuButton(ctx,{x,y,w:bw,h:bh,label:it[0],col:it[1],fs,act:it[2]}); y+=bh+gap; }

      if(hasScreens()){
        y+=secGapTop-gap;     // tighten before the 2×2 grid
        const sb=[{label:t('📊 Profil'),s:'profile'},{label:t('🏆 Ranglista'),s:'leaderboard'},
                  {label:t('🌟 Eredmények'),s:'achievements'},{label:t('✏️ Szerkesztő'),s:'editor'}];
        const sgap=8*ui, sw=(bw-sgap)/2, sh=bh*secH_ratio;
        for(let i=0;i<sb.length;i++){
          const col=i%2, row=(i/2)|0;
          this._menuButton(ctx,{x:x+col*(sw+sgap),y:y+row*(sh+gap),w:sw,h:sh,
            label:sb[i].label,col:'#2d6079',fs:Math.min(13*ui,sh*0.4),act:()=>{ screen=sb[i].s; }});
        }
      }

      // ----- footer: copyright + Steam line + version -----
      this._menuFooter(ctx, M);
    },

    // -- DESKTOP / wide: richer two-zone hero (left art + right tidy panel) --
    _menuMainDesktop(ctx, M){
      const ui=M.ui, VW=M.VW, VH=M.VH;
      ctx.textAlign='center'; ctx.textBaseline='alphabetic';

      // LEFT hero zone: big logo + wordmark + animated mascots framing it
      const heroCx=VW*0.34;
      const bob=Math.sin(menuT*1.8)*9*ui;
      const logo=CA.img&&CA.img('assets/logo.png');
      let lh=Math.min(VH*0.42, 240*ui), logoTop=VH*0.16;
      if(logo){
        const lw=lh*(logo.naturalWidth/logo.naturalHeight);
        ctx.drawImage(logo, heroCx-lw/2, logoTop+bob, lw, lh);
      } else {
        ctx.font='bold '+(90*ui)+'px '+FONT; ctx.fillStyle='#fff7e6';
        ctx.fillText('🐹🪱', heroCx, logoTop+lh*0.7+bob);
      }
      this._wordmark(ctx, heroCx, logoTop+lh+44*ui, 46*ui);
      ctx.font=(18*ui)+'px '+FONT; ctx.fillStyle='#bfe0f0';
      ctx.fillText(t('Cuki, de halálos'), heroCx, logoTop+lh+74*ui);
      // (decorative capybara + worm mascots removed — menu is now just the
      // user-provided logo + wordmark + buttons)

      // RIGHT panel: framed column of buttons
      const pw=Math.min(VW*0.34, 420*ui), px=VW*0.66-pw/2;
      const bw=pw-48*ui, bx=px+24*ui;
      const bh=54*ui, gap=14*ui, fs=22*ui;
      // panel backdrop
      const items=[];
      if(CA.hasSave&&CA.hasSave()) items.push([t('▶ Folytatás'),'#e0a93f',()=>{ unlockAudio(); if(CA.enterFullscreen)CA.enterFullscreen(); CA.loadGame&&CA.loadGame(); }]);
      items.push([t('🎮 Új játék'),'#3fa45a',()=>{ screen='newgame'; }]);
      items.push([t('👥 Csapat szerkesztő'),'#3f86a4',()=>{ teOpen(); }]);
      items.push([t('🌳 Képességfa'),'#7a5fa0',()=>{ stClass=null; screen='skilltree'; }]);
      items.push([t('🌐 Multiplayer'),'#c0694a',()=>{ screen='lobby'; }]);
      items.push([t('⚙️ Beállítások'),'#3f86a4',()=>{ screen='settings'; }]);
      items.push([t('👏 Készítők'),'#8a6db0',()=>{ screen='credits'; }]);
      const secH=40*ui, secGap=12*ui;
      const panelH=24*ui + items.length*(bh+gap) + 8*ui + 2*(secH+secGap) + 16*ui;
      const py=VH/2-panelH/2;
      ctx.fillStyle='rgba(8,22,32,0.55)'; rr(ctx,px,py,pw,panelH,22*ui); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.10)'; ctx.lineWidth=2; rr(ctx,px,py,pw,panelH,22*ui); ctx.stroke(); ctx.lineWidth=1;

      let y=py+24*ui;
      for(const it of items){ this._menuButton(ctx,{x:bx,y,w:bw,h:bh,label:it[0],col:it[1],fs,act:it[2]}); y+=bh+gap; }
      y+=8*ui;
      if(hasScreens()){
        const sb=[{label:t('📊 Profil'),s:'profile'},{label:t('🏆 Ranglista'),s:'leaderboard'},
                  {label:t('🌟 Eredmények'),s:'achievements'},{label:t('✏️ Szerkesztő'),s:'editor'}];
        const sw=(bw-secGap)/2;
        for(let i=0;i<sb.length;i++){
          const col=i%2, row=(i/2)|0;
          this._menuButton(ctx,{x:bx+col*(sw+secGap),y:y+row*(secH+secGap),w:sw,h:secH,
            label:sb[i].label,col:'#2d6079',fs:15*ui,act:()=>{ screen=sb[i].s; }});
        }
      }

      this._menuFooter(ctx, M);
    },

    /* ---------- ÚJ JÁTÉK screen ----------
     * One unified, CENTERED, scrollable layout for BOTH phone and desktop.
     * Fixed chrome: title (top-center), ‹ Vissza (top-left), ▶ Indítás (bottom
     * bar). The section content (Mód / Pálya / Időjárás / Beállítások /
     * Csapatok) lives in a clipped, drag-/wheel-scrollable column so nothing is
     * ever clipped at the edges and everything is reachable on a small screen. */
    _menuNewGame(ctx){
      const M=metrics();
      const ui=M.ui, VW=M.VW, VH=M.VH;

      // ---- fixed regions ----
      const titleBottom=Math.round(96*ui);
      const startBarH=86*ui;                       // bottom Indítás bar height
      const viewTop=titleBottom;
      const viewBottom=VH-startBarH;

      // ---- centered content column ----
      const colW=Math.min(VW*0.86, 880*ui);
      const colL=VW/2-colW/2;

      // scrolled origin: everything below is offset by -scrollY.
      // Start well below the card's rounded top so the first heading ("Mód") is
      // never clipped by the rounded corner (#2 — "Mód-ba belelóg").
      let y=viewTop+42*ui - scrollY;
      const secGap=12*ui;
      const sectionLabel=(txt)=>{ ctx.textAlign='left'; ctx.font='bold '+(18*ui)+'px '+FONT; ctx.fillStyle='#fff7e6'; ctx.fillText(t(txt), colL, y); y+=14*ui; };

      // Panel card backdrop. It is a FIXED rounded card filling the scroll
      // viewport (between the title and the start bar); the section content
      // scrolls INSIDE it and is clipped to it, so nothing ever visually hangs
      // outside the rounded edge ("kilóg"). The card spans the centered column.
      const cardPad=14*ui;
      const cardX=colL-cardPad, cardW=colW+cardPad*2;
      const cardY=viewTop+6*ui, cardH=(viewBottom-8*ui)-cardY;
      const cardR=20*ui;
      ctx.fillStyle='rgba(8,22,32,0.55)'; rr(ctx,cardX,cardY,cardW,cardH,cardR); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.10)'; ctx.lineWidth=2; rr(ctx,cardX,cardY,cardW,cardH,cardR); ctx.stroke(); ctx.lineWidth=1;

      // clip the scrolling body to the CARD so it never paints over the title /
      // start bar AND never spills past the card's rounded edges.
      ctx.save();
      rr(ctx,cardX,cardY,cardW,cardH,cardR); ctx.clip();
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';

      // ===== MODE =====
      sectionLabel('Mód');
      const modeList=[{id:'classic', name:t('Klasszikus'), desc:t('Capybarák vs Worm-ök, 2 csapat.')}];
      const seenModes={classic:true};
      // 1) preferred ordering: the explicitly-unlocked modes (so the new ones —
      //    survival/koth/sniper/bombrun/coop/daily/quick/tutorial — always show
      //    even before any other-agent registration is iterated).
      for(const id of SELECTABLE_MODES){
        if(id==='classic' || seenModes[id]) continue;
        const m=(CA.Modes&&CA.Modes[id])||null;
        if(!m) continue;   // not registered (yet) — skip silently
        modeList.push({id, name:(m.name||MODE_LABELS[id]||id), desc:m.desc||''});
        seenModes[id]=true;
      }
      // 2) any OTHER registered modes (locked styling unless whitelisted).
      if(CA.Modes){
        for(const k of Object.keys(CA.Modes)){
          const m=CA.Modes[k];
          if(m && typeof m==='object' && m.id && m.name && !seenModes[m.id]){
            modeList.push({id:m.id, name:(MODE_LABELS[m.id]||m.name), desc:m.desc||''});
            seenModes[m.id]=true;
          }
        }
      }
      // Mód pills span the FULL width and wrap as needed (kept first).
      let mx=colL, my=y+6*ui; const mph=34*ui, mpgap=8*ui;
      for(const m of modeList){
        const locked=!isModeUnlocked(m.id);
        const label=(locked?'🔒 ':'')+t(m.name);
        ctx.font='bold '+(14*ui)+'px '+FONT;
        const tw=ctx.measureText(label).width+24*ui;
        if(mx+tw>colL+colW){ mx=colL; my+=mph+mpgap; }
        if(locked){
          // dimmed, NON-selectable (not pushed into menuBtns)
          ctx.globalAlpha=0.45;
          ctx.fillStyle='rgba(255,255,255,0.10)'; rr(ctx,mx,my,tw,mph,9*ui); ctx.fill();
          ctx.fillStyle='#9fb4c2'; ctx.font='bold '+(14*ui)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(label, mx+tw/2, my+mph/2); ctx.textBaseline='alphabetic'; ctx.textAlign='left';
          ctx.globalAlpha=1;
        } else {
          this._pill(ctx,{x:mx,y:my,w:tw,h:mph,label:t(m.name),sel:ng.gameMode===m.id,col:'#3f86a4',fs:14*ui,bold:true,
            act:()=>{ if(isModeUnlocked(m.id)) ng.gameMode=m.id; }});
        }
        mx+=tw+mpgap;
      }
      y=my+mph+4*ui;
      const selMode=modeList.find(m=>m.id===ng.gameMode);
      if(selMode && selMode.desc){
        ctx.textAlign='left'; ctx.font=(13*ui)+'px '+FONT; ctx.fillStyle='#9fc0d2';
        ctx.fillText(t(selMode.desc), colL, y+13*ui); y+=20*ui;
      }
      y+=secGap;

      // ===== PÁLYA + IDŐJÁRÁS — two columns side by side (no scroll) =====
      // On wide screens Pálya fills the left half, Időjárás the right half; on a
      // narrow screen they stack. Both wrap inside their own column.
      const twoCol = colW>=520*ui;
      const halfW  = twoCol ? (colW-24*ui)/2 : colW;
      const leftL  = colL;
      const rightL = twoCol ? (colL+halfW+24*ui) : colL;
      const ph=34*ui, pgap=6*ui;

      // small wrapped-pill group renderer; returns the bottom y it consumed.
      const pillGroup=(items, gx, gw, gy, getSel, onPick)=>{
        let px=gx, py=gy;
        for(const it of items){
          ctx.font=(13*ui)+'px '+FONT;
          const tw=Math.min(gw, ctx.measureText(it.label).width+18*ui);
          if(px+tw>gx+gw+0.5){ px=gx; py+=ph+pgap; }
          this._pill(ctx,{x:px,y:py,w:tw,h:ph,label:it.label,sel:getSel(it),col:it.col||'#3fa45a',fs:13*ui,
            act:()=>onPick(it)});
          px+=tw+pgap;
        }
        return py+ph;
      };

      const headRow=y;            // both column headings share this baseline
      sectionLabel('Pálya');
      const themes=(CA.Maps&&CA.Maps.list)?CA.Maps.list():['grass'];
      const themeItems=themes.map(tid=>{ const d=(CA.Maps&&CA.Maps[tid])||{};
        return {id:tid, label:(d.emoji?d.emoji+' ':'')+t(d.name||tid), col:'#3fa45a'}; });
      // #14 random pálya: a "🎲 Véletlen" entry that starts with theme 'random'
      // (CA.Maps.get('random') resolves it to a real theme at generate time).
      themeItems.push({id:'random', label:t('🎲 Véletlen'), col:'#8a6db0'});
      const palyaBottom=pillGroup(themeItems, leftL, halfW, y+6*ui,
        it=>ng.theme===it.id, it=>{ ng.theme=it.id; });

      // Időjárás heading drawn at the same head row, in the right column
      let wxBottom;
      const wlist=[
        {label:t('☀️ Tiszta'), v:'clear'}, {label:t('🌧 Eső'), v:'rain'},
        {label:t('❄️ Hó'), v:'snow'},     {label:t('🌫 Köd'), v:'fog'},
        {label:t('⛈ Vihar'), v:'storm'},  {label:t('🎲 Véletlen'), v:undefined},
      ];
      if(twoCol){
        ctx.textAlign='left'; ctx.font='bold '+(18*ui)+'px '+FONT; ctx.fillStyle='#fff7e6';
        ctx.fillText(t('Időjárás'), rightL, headRow);
        wxBottom=pillGroup(wlist, rightL, halfW, headRow+20*ui,
          w=>ng.weather===w.v, w=>{ ng.weather=w.v; });
        y=Math.max(palyaBottom, wxBottom)+secGap;
      } else {
        y=palyaBottom+secGap;
        sectionLabel('Időjárás');
        y=pillGroup(wlist, colL, colW, y+6*ui, w=>ng.weather===w.v, w=>{ ng.weather=w.v; })+secGap;
      }

      // ===== OPCIÓK: Emelkedő víz + Gép szintje — one compact row =====
      sectionLabel('Opciók');
      let oy=y+6*ui;
      const rwW=Math.min(196*ui, colW*0.4);
      this._pill(ctx,{x:colL,y:oy,w:rwW,h:ph,label:(ng.risingWater?t('☠ Víz: BE'):t('☠ Víz: KI')),
        sel:ng.risingWater,col:'#a4503f',fs:13*ui, act:()=>{ ng.risingWater=!ng.risingWater; }});
      ctx.textAlign='left'; ctx.font='bold '+(13*ui)+'px '+FONT; ctx.fillStyle='#cfe6f2'; ctx.textBaseline='middle';
      let dx=colL+rwW+14*ui;
      ctx.fillText(t('Gép:'), dx, oy+ph/2); ctx.textBaseline='alphabetic';
      dx+=ctx.measureText(t('Gép:')).width+8*ui;
      const diffs=[['Könnyű',0],['Normál',1],['Nehéz',2]];
      for(const d of diffs){
        ctx.font=(13*ui)+'px '+FONT; const tw=ctx.measureText(t(d[0])).width+18*ui;
        this._pill(ctx,{x:dx,y:oy,w:tw,h:ph,label:t(d[0]),sel:ng.aiLevel===d[1],col:'#8a6db0',fs:13*ui,
          act:()=>{ ng.aiLevel=d[1]; }});
        dx+=tw+6*ui;
      }
      y=oy+ph+secGap;

      // ===== CSAPATOK (mode-dependent) =====
      if(ng.gameMode==='classic'){
        sectionLabel('Csapatok');
        let cy=y+6*ui;
        this._pill(ctx,{x:colL,y:cy,w:Math.min(220*ui,colW),h:34*ui,
          label:(ng.twoPlayer?t('👥 2 Játékos (helyi)'):t('🤖 vs Gép')),
          sel:ng.twoPlayer,col:'#3fa45a',fs:13*ui, act:()=>{ ng.twoPlayer=!ng.twoPlayer; }});
        cy+=46*ui;
        // two name fields: side-by-side on wide, stacked on narrow
        const stack=colW<520*ui;
        const fw=stack?colW:(colW-30*ui)/2;
        this._nameFieldInline(ctx,'capybara','🐹 '+( (CA.rosterOf?CA.rosterOf('capybara').team:(CA.ROSTER&&CA.ROSTER.capybara.team))||t('Capybarák')), colL, cy, fw, false, ui);
        if(stack){
          this._nameFieldInline(ctx,'worm','🪱 '+( (CA.rosterOf?CA.rosterOf('worm').team:(CA.ROSTER&&CA.ROSTER.worm.team))||t('Worm-ök')), colL, cy+60*ui, fw, false, ui);
          y=cy+60*ui+64*ui;
        } else {
          this._nameFieldInline(ctx,'worm','🪱 '+( (CA.rosterOf?CA.rosterOf('worm').team:(CA.ROSTER&&CA.ROSTER.worm.team))||t('Worm-ök')), colL+fw+30*ui, cy, fw, false, ui);
          y=cy+64*ui;
        }
        // ---- v4 class picker (player team) ----
        y=this._classPickerNG(ctx, colL, colW, y, ui)+secGap;
        // ---- saved team picker (player side) ----
        const saved=loadTeams();
        if(saved.length){
          if(ng.savedTeam>=saved.length) ng.savedTeam=-1;   // stale index guard
          ctx.textAlign='left'; ctx.font='bold '+(14*ui)+'px '+FONT; ctx.fillStyle='#cfe6f2';
          ctx.fillText(t('🐹 Saját csapat:'), colL, y+4*ui);
          let py=y+14*ui;
          this._pill(ctx,{x:colL,y:py,w:Math.min(150*ui,colW*0.4),h:32*ui,label:t('Alap'),
            sel:ng.savedTeam<0,col:'#3f86a4',fs:13*ui, act:()=>{ ng.savedTeam=-1; }});
          let px=colL+Math.min(150*ui,colW*0.4)+8*ui;
          for(let si=0;si<saved.length;si++){
            const lab='👥 '+(saved[si].name||(t('Csapat')+' '+(si+1)));
            ctx.font=(13*ui)+'px '+FONT; const tw=Math.min(colW, ctx.measureText(lab).width+22*ui);
            if(px+tw>colL+colW){ px=colL; py+=40*ui; }
            this._pill(ctx,{x:px,y:py,w:tw,h:32*ui,label:lab,sel:ng.savedTeam===si,col:'#3f86a4',fs:13*ui,
              act:()=>{ ng.savedTeam=si; }});
            px+=tw+8*ui;
          }
          y=py+32*ui+secGap;
        } else { ng.savedTeam=-1; }
      } else if(ng.gameMode==='ffa'){
        sectionLabel(t('Csapatok')+' ('+ng.teams.length+')');
        // FFA: free choice of ANY species per team (not just unlocked ones) — the
        // setup is a sandbox roster, so the whole CA.Species registry is offered.
        const allSp=(CA.Species&&CA.Species.list)?CA.Species.list():['capybara','worm'];
        const stepSp=(t,dir)=>{ const cur=allSp.indexOf(t.species); const n=allSp.length||1;
          t.species=allSp[((cur<0?0:cur)+dir+n)%n]||t.species; };
        const rowH=42*ui;
        const narrow=colW<560*ui;
        const arrW=26*ui;
        for(let i=0;i<ng.teams.length;i++){
          const t=ng.teams[i]; const ry=y+6*ui+i*rowH;
          this._teamPic(ctx, {species:t.species, kind:t.species, color:'#2d6079'}, colL, ry+1*ui, 34*ui);
          const sp=(CA.Species&&CA.Species[t.species])||{};
          // species picker: ◀  [emoji name]  ▶  — tapping the middle also cycles.
          const pickX=colL+42*ui;
          const spW=narrow?110*ui:150*ui;
          this._pill(ctx,{x:pickX,y:ry,w:arrW,h:36*ui,label:'◀',sel:false,col:'#2d6079',fs:15*ui,
            act:()=>{ stepSp(t,-1); }});
          this._pill(ctx,{x:pickX+arrW+4*ui,y:ry,w:spW,h:36*ui,label:(sp.emoji?sp.emoji+' ':'')+CA.t(sp.name||t.species),
            sel:true,col:'#2d6079',fs:14*ui, act:()=>{ stepSp(t,1); }});
          this._pill(ctx,{x:pickX+arrW+4*ui+spW+4*ui,y:ry,w:arrW,h:36*ui,label:'▶',sel:false,col:'#2d6079',fs:15*ui,
            act:()=>{ stepSp(t,1); }});
          const aiW=narrow?84*ui:108*ui;
          const nameX=pickX+arrW+4*ui+spW+4*ui+arrW+8*ui;
          const nameW=Math.max(70*ui, (colL+colW-aiW-8*ui)-nameX);
          this._nameFieldInline(ctx,'team'+i,CA.t('Csapat')+' '+(i+1), nameX, ry, nameW, true, ui);
          this._pill(ctx,{x:colL+colW-aiW,y:ry,w:aiW,h:36*ui,label:(t.isAI?CA.t('🤖 Gép'):CA.t('🙂 Ember')),
            sel:!t.isAI,col:'#3fa45a',fs:13*ui, act:()=>{ t.isAI=!t.isAI; }});
        }
        y+=6*ui+ng.teams.length*rowH+6*ui;
        this._pill(ctx,{x:colL,y:y,w:124*ui,h:34*ui,label:t('➖ Kevesebb'),sel:false,col:'#a4503f',fs:13*ui,
          act:()=>{ if(ng.teams.length>2){ ng.teams.pop(); if(focusedField&&focusedField.indexOf('team')===0)focusedField=null; } }});
        this._pill(ctx,{x:colL+134*ui,y:y,w:124*ui,h:34*ui,label:t('➕ Több'),sel:false,col:'#3fa45a',fs:13*ui,
          act:()=>{ if(ng.teams.length<4){ ng.teams.push({species:allSp[ng.teams.length%allSp.length]||'capybara', name:'', isAI:true}); } }});
        y+=42*ui;
      } else {
        sectionLabel('Csapatok');
        ctx.textAlign='left'; ctx.font=(15*ui)+'px '+FONT; ctx.fillStyle='#9fc0d2';
        ctx.fillText(t('Ennek a módnak a csapatait a játék automatikusan állítja be.'), colL, y+16*ui);
        y+=32*ui;
      }

      ctx.restore();   // end scroll-clip

      // ---- record content height for scroll clamping ----
      // The scrollable viewport is the CARD interior, so clamp against the card's
      // inner bottom (with a little breathing room) — this lets the user scroll
      // the last name fields fully into view, cleanly inside the rounded card.
      const cardInnerBottom=cardY+cardH-12*ui;
      const contentBottom=y+scrollY;       // absolute (remove the -scrollY offset)
      scrollMaxY=Math.max(0, contentBottom+16*ui-cardInnerBottom);
      clampScroll();

      // ---- fixed chrome (drawn on top, unclipped) ----
      // bottom Indítás bar backdrop
      ctx.fillStyle='rgba(8,22,32,0.85)'; ctx.fillRect(0, viewBottom, VW, startBarH);
      const sw=Math.min(360*ui, VW*0.8), sx=VW/2-sw/2, sy=viewBottom+(startBarH-60*ui)/2;
      this._menuButton(ctx,{x:sx,y:sy,w:sw,h:60*ui,label:t('▶ Indítás'),col:'#e0a93f',fs:28*ui,
                            act:()=>startNewGame()});

      this._screenTitle(ctx,t('🎮 Új játék'));
      this._backButton(ctx);
      // scroll affordance hint when there is more below
      if(scrollMaxY>0 && scrollY<scrollMaxY-2){
        ctx.textAlign='center'; ctx.font=(13*ui)+'px '+FONT; ctx.fillStyle='rgba(255,255,255,0.55)';
        ctx.fillText(t('▼ görgess'), VW/2, viewBottom-8*ui);
      }
    },

    /* ---------- 🌳 KÉPESSÉGFA (skill-tree) screen ----------
     * Pick a class (chips at the top), then upgrade its tree nodes. Every CA.Meta
     * call is guarded (the module may be absent or return undefined). Dark/spooky
     * theme, scrollable card, reachable ‹ Vissza. */
    _menuSkillTree(ctx){
      const M=metrics();
      const ui=M.ui, VW=M.VW, VH=M.VH;

      const titleBottom=Math.round(96*ui);
      const viewTop=titleBottom, viewBottom=VH-14*ui;
      const colW=Math.min(VW*0.86, 880*ui), colL=VW/2-colW/2;
      let y=viewTop+42*ui - scrollY;
      const secGap=12*ui;

      // card backdrop (spooky purple-tinted)
      const cardPad=14*ui, cardX=colL-cardPad, cardW=colW+cardPad*2;
      const cardY=viewTop+6*ui, cardH=(viewBottom-8*ui)-cardY, cardR=20*ui;
      ctx.fillStyle='rgba(22,10,34,0.6)'; rr(ctx,cardX,cardY,cardW,cardH,cardR); ctx.fill();
      ctx.strokeStyle='rgba(180,140,230,0.18)'; ctx.lineWidth=2; rr(ctx,cardX,cardY,cardW,cardH,cardR); ctx.stroke(); ctx.lineWidth=1;

      ctx.save();
      rr(ctx,cardX,cardY,cardW,cardH,cardR); ctx.clip();
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';

      const ids=classIds();
      if(!ids.length){
        ctx.font=(16*ui)+'px '+FONT; ctx.fillStyle='#cdbfe0';
        ctx.fillText(t('Nincs még osztály betöltve.'), colL, y+20*ui);
        ctx.restore();
        this._screenTitle(ctx,t('🌳 Képességfa'));
        this._backButton(ctx);
        scrollMaxY=0; return;
      }
      // default-select the first class
      if(!stClass || ids.indexOf(stClass)<0) stClass=ids[0];

      // ---- class chips ----
      ctx.font='bold '+(15*ui)+'px '+FONT; ctx.fillStyle='#d6aaff';
      ctx.fillText(t('Válassz osztályt:'), colL, y); y+=14*ui;
      let px=colL, py=y+6*ui; const chH=38*ui, chGap=8*ui;
      for(const id of ids){
        const d=classDef(id);
        const lab=((d&&d.animal)?d.animal+' ':'')+(d?t(d.name):t(id));
        ctx.font='bold '+(14*ui)+'px '+FONT;
        const tw=ctx.measureText(lab).width+22*ui;
        if(px+tw>colL+colW){ px=colL; py+=chH+chGap; }
        this._pill(ctx,{x:px,y:py,w:tw,h:chH,label:lab,sel:stClass===id,col:'#6a4a92',fs:14*ui,bold:true,
          act:()=>{ stClass=id; }});
        px+=tw+chGap;
      }
      y=py+chH+secGap;

      const def=classDef(stClass);
      // ---- class header: level / XP / available points ----
      const Meta=CA.Meta||null;
      const lvl=(Meta&&Meta.classLevel)?(Meta.classLevel(stClass)||1):1;
      const xp=(Meta&&Meta.classXP)?(Meta.classXP(stClass)||0):0;
      const nextXp=(Meta&&Meta.classXpForLevel)?(Meta.classXpForLevel(lvl+1)||0):0;
      const pts=(Meta&&Meta.skillPoints)?(Meta.skillPoints(stClass)||0):0;

      ctx.textAlign='left'; ctx.font='bold '+(18*ui)+'px '+FONT; ctx.fillStyle='#fff7e6';
      const cname=def?t(def.name):t(stClass);
      ctx.fillText(((def&&def.animal)?def.animal+' ':'')+cname, colL, y+6*ui);
      ctx.font=(14*ui)+'px '+FONT; ctx.fillStyle='#bfa9d6';
      ctx.fillText(t('Szint')+' '+lvl+'  ·  XP '+Math.floor(xp)+(nextXp>xp?(' / '+Math.floor(nextXp)):''), colL, y+26*ui);
      y+=36*ui;
      // available points badge
      ctx.font='bold '+(15*ui)+'px '+FONT;
      ctx.fillStyle=pts>0?'#ffd76a':'#9a8cb0';
      ctx.fillText(t('Elérhető pont: ')+pts+' '+t('TP'), colL, y+8*ui);
      y+=14*ui;
      if(pts<=0){
        ctx.font=(12*ui)+'px '+FONT; ctx.fillStyle='#9a8cb0';
        ctx.fillText(t('Nincs elérhető képességpont — szerezz több XP-t!'), colL, y+14*ui);
        y+=18*ui;
      }
      // passive reminder
      if(def && def.passiveDesc){
        ctx.font=(12*ui)+'px '+FONT; ctx.fillStyle='#bfa9d6';
        ctx.fillText(t('Passzív: ')+t(def.passiveDesc), colL, y+14*ui);
        y+=18*ui;
      }
      y+=secGap;

      // ---- skill-tree node cards ----
      const tree=(def && Array.isArray(def.tree)) ? def.tree : [];
      const cardGap=10*ui;
      for(const node of tree){
        const nodeId=node.id;
        const rank=(Meta&&Meta.skillRank)?(Meta.skillRank(stClass,nodeId)||0):0;
        const max=(typeof node.max==='number'&&node.max>0)?node.max:1;
        const maxed=rank>=max;
        const ncH=Math.max(58*ui, 44*ui+(node.desc?16*ui:0));
        // card bg
        ctx.fillStyle='rgba(255,255,255,0.06)'; rr(ctx,colL,y,colW,ncH,12*ui); ctx.fill();
        ctx.strokeStyle=maxed?'rgba(255,215,106,0.4)':'rgba(180,140,230,0.18)'; ctx.lineWidth=1.5;
        rr(ctx,colL,y,colW,ncH,12*ui); ctx.stroke(); ctx.lineWidth=1;
        // name + rank
        ctx.textAlign='left'; ctx.font='bold '+(15*ui)+'px '+FONT; ctx.fillStyle='#fff7e6';
        ctx.fillText(t(node.name||nodeId), colL+14*ui, y+22*ui);
        ctx.font='bold '+(13*ui)+'px '+FONT; ctx.fillStyle=maxed?'#ffd76a':'#cdbfe0';
        ctx.fillText(t('Rang: ')+rank+'/'+max, colL+14*ui, y+ (node.desc?40*ui:ncH-12*ui));
        if(node.desc){
          ctx.textAlign='left'; ctx.font=(12*ui)+'px '+FONT; ctx.fillStyle='#bfa9d6';
          ctx.fillText(t(node.desc), colL+14*ui, y+ncH-10*ui);
        }
        // pip indicators (filled = bought)
        const pipR=4*ui, pipGap=12*ui; let pipX=colL+colW-16*ui-(max-1)*pipGap-pipR;
        for(let p=0;p<max;p++){
          ctx.beginPath(); ctx.arc(pipX+p*pipGap, y+18*ui, pipR, 0, 7);
          ctx.fillStyle = p<rank ? '#ffd76a' : 'rgba(255,255,255,0.18)'; ctx.fill();
        }
        // Fejleszt / MAX button
        const bw=Math.min(150*ui,colW*0.32), bx=colL+colW-bw-14*ui, by=y+ncH-40*ui;
        if(maxed){
          ctx.fillStyle='rgba(255,215,106,0.18)'; rr(ctx,bx,by,bw,30*ui,9*ui); ctx.fill();
          ctx.fillStyle='#ffd76a'; ctx.font='bold '+(13*ui)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(t('MAX'), bx+bw/2, by+15*ui); ctx.textBaseline='alphabetic';
        } else {
          const canUp=pts>0;
          this._pill(ctx,{x:bx,y:by,w:bw,h:30*ui,label:t('Fejleszt')+' ▸',sel:canUp,col:'#5a8a4a',fs:13*ui,bold:true,
            act:()=>{ if(CA.Meta&&CA.Meta.upgradeSkill){ try{ CA.Meta.upgradeSkill(stClass,nodeId); clickSfx(); }catch(_){}} }});
          if(!canUp){
            // grey it out visually (pill already drawn; overlay a dim)
            ctx.fillStyle='rgba(22,10,34,0.45)'; rr(ctx,bx,by,bw,30*ui,9*ui); ctx.fill();
          }
        }
        y+=ncH+cardGap;
      }
      if(!tree.length){
        ctx.font=(14*ui)+'px '+FONT; ctx.fillStyle='#9a8cb0';
        ctx.fillText('—', colL, y+16*ui); y+=24*ui;
      }

      ctx.restore();   // end scroll-clip

      const cardInnerBottom=cardY+cardH-12*ui;
      const contentBottom=y+scrollY;
      scrollMaxY=Math.max(0, contentBottom+16*ui-cardInnerBottom);
      clampScroll();

      this._screenTitle(ctx,t('🌳 Képességfa'));
      this._backButton(ctx);
      if(scrollMaxY>0 && scrollY<scrollMaxY-2){
        ctx.textAlign='center'; ctx.font=(13*ui)+'px '+FONT; ctx.fillStyle='rgba(255,255,255,0.55)';
        ctx.fillText(t('▼ görgess'), VW/2, viewBottom-2*ui);
      }
    },


    // compact inline name field at (x,y). `ui` scales the box/fonts (default 1).
    _nameFieldInline(ctx,key,label,x,y,w,small,ui){
      ui=ui||1;
      ctx.textAlign='left'; ctx.font=(small?(13*ui):(15*ui))+'px '+FONT; ctx.fillStyle='#cfe6f2'; ctx.textBaseline='alphabetic';
      if(!small) ctx.fillText(label, x, y-6*ui);
      const fh=(small?38:40)*ui, fy=small?y:y+4*ui;
      const focused=focusedField===key;
      ctx.fillStyle=focused?'rgba(255,255,255,0.96)':'rgba(255,255,255,0.85)';
      rr(ctx,x,fy,w,fh,10*ui); ctx.fill();
      ctx.strokeStyle=focused?'#ffd76a':'rgba(0,0,0,0.25)'; ctx.lineWidth=focused?3:2;
      rr(ctx,x,fy,w,fh,10*ui); ctx.stroke(); ctx.lineWidth=1;
      const buf=fieldRef(key); const val=buf?buf.get():'';
      ctx.font=(17*ui)+'px '+FONT;
      if(val){ ctx.fillStyle='#1d2b34'; ctx.fillText(val, x+12*ui, fy+fh/2+6*ui); }
      else   { ctx.fillStyle='#8aa0ad'; ctx.fillText(small?label:t('(név)'), x+12*ui, fy+fh/2+6*ui); }
      if(focused && (caretT%1)<0.5){
        const tw=val?ctx.measureText(val).width:0;
        ctx.fillStyle='#1d2b34'; ctx.fillRect(x+12*ui+tw+2, fy+9*ui, 2, fh-18*ui);
      }
      menuFields.push({x,y:fy,w,h:fh,key});
    },

    /* ---------- BEÁLLÍTÁSOK screen ---------- */
    _menuSettings(ctx){
      const ui=metrics().ui;
      const top=Math.round(96*ui);
      // clip the scrolling body to the area below the (fixed) title; the body
      // applies the scrollY offset itself and reports its height for clamping.
      const clipTop=top-8*ui;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, clipTop, C.VIEW_W, C.VIEW_H-clipTop); ctx.clip();
      this._renderSettingsBody(ctx, top, true);
      ctx.restore();
      // fixed chrome on top of the scrolling body
      this._screenTitle(ctx,t('⚙️ Beállítások'));
      this._backButton(ctx);
    },

    // shared settings body — used by the settings screen AND the pause overlay.
    // returns nothing; pushes its widgets into menuBtns/menuSliders.
    // When `scroll` is true the body is laid out at full UI scale and offset by
    // the shared scrollY (the caller has clipped + handles the drag/wheel); we
    // record the total content height in scrollMaxY so the offset can be clamped.
    // When `scroll` is false (pause overlay) it auto-shrinks to fit instead.
    _renderSettingsBody(ctx, top, scroll){
      const st=CA.settings||{};
      const M=metrics();
      const actions=[
        ['left',t('Balra')],['right',t('Jobbra')],['aimUp',t('Célzás fel')],['aimDown',t('Célzás le')],
        ['jump',t('Ugrás')],['fire',t('Tüzelés')],['nextWeapon',t('Fegyver')],['pause',t('Szünet')],
        ['switchUnit',t('Egységváltás')],
      ];
      const showFS=!IS_TOUCH;               // hide "Teljes képernyő" on touch (#4)
      const showKeys=!IS_TOUCH;             // hide the key-rebind section on touch (no keyboard) (Jani)
      const rebindRows=Math.ceil(actions.length/2);

      // un-scaled content height at ui=1:
      // base controls + accessibility block (#39): heading 28 + aim slider 54
      // + leftHanded/colorblind 58 + haptics/music 58 + reducedMotion/killcam 58 = 256
      const baseH = 58 + 50+12 + 54+58 + (showFS?58:0) + 58 + 60 + 10
                  + 256
                  + (showKeys ? rebindRows*(38+8) + 18 + 28 : 0);   // key-rebind block (hidden on touch)
      let ui=M.ui;
      if(scroll){
        // full scale; overflow handled by scrolling. Offset the whole body.
        top = top - scrollY;
      } else {
        // pause overlay: shrink-to-fit (never enlarge past metric ui).
        const avail=(M.VH - top - 16*M.ui);
        const fit=avail/baseH;
        ui=Math.min(M.ui, Math.max(0.7, fit*M.ui));
      }

      const colW=Math.min(C.VIEW_W*0.86, 520*ui), x=C.VIEW_W/2-colW/2; let y=top;
      const muted=(CA.Audio&&CA.Audio.muted)||st.muted;
      const halfW=(colW-16*ui)/2;

      // ----- language switch (near the top) -----
      // QA P3: 5-nyelvű CIKLUS (hu→en→es→pt→zh), nem bináris hu⇄en — a régi
      // toggle egy ES/PT/ZH játékost egy koppintással magyarra dobott.
      const _LL=['hu','en','es','pt','zh','de'];
      const _LN={hu:'Magyar',en:'English',es:'Español',pt:'Português',zh:'中文',de:'Deutsch'};
      const _cl=(CA.i18n&&CA.i18n.lang)||'en';
      this._menuButton(ctx,{x,y,w:colW,h:46*ui,
        label:'🌐 '+(_LN[_cl]||_cl)+' ›',
        col:'#3f86a4',fs:18*ui, act:()=>{
          const i=_LL.indexOf((CA.i18n&&CA.i18n.lang)||'en');
          const nx=_LL[(i+1)%_LL.length];
          if(CA.i18n&&CA.i18n.setLang) CA.i18n.setLang(nx);
          if(CA.settings&&CA.settings.save) CA.settings.save();
        }});
      y+=58*ui;

      // mute toggle
      this._menuButton(ctx,{x,y,w:colW,h:50*ui,
        label:muted?t('🔇 Hang: KI'):t('🔊 Hang: BE'),
        col:muted?'#a4503f':'#3fa45a',fs:20*ui, act:()=>toggleMute()});
      y+=62*ui;

      // volume sliders
      this._slider(ctx,'musicVol',t('🎵 Zene hangerő'), x, y, colW, ui); y+=54*ui;
      this._slider(ctx,'sfxVol',t('🔊 Effekt hangerő'), x, y, colW, ui); y+=58*ui;

      // toggles. On touch we DROP the fullscreen button (auto-fills the screen).
      const qLabel=t('Minőség: ')+((st.quality==='low')?t('Alacsony'):(st.quality==='normal')?t('Normál'):t('Magas'));
      if(showFS){
        this._menuButton(ctx,{x,y,w:halfW,h:46*ui,label:t('⛶ Teljes képernyő'),col:'#3f86a4',fs:16*ui,
          act:()=>{ if(CA.toggleFullscreen)CA.toggleFullscreen(); }});
        this._menuButton(ctx,{x:x+halfW+16*ui,y,w:halfW,h:46*ui,
          label:qLabel,col:'#8a6db0',fs:16*ui,
          act:()=>{ st.quality=(st.quality==='low')?'normal':(st.quality==='normal')?'high':'low'; st.save&&st.save(); }});
        y+=58*ui;
      } else {
        // single full-width quality toggle when fullscreen is hidden
        this._menuButton(ctx,{x,y,w:colW,h:46*ui,
          label:qLabel,col:'#8a6db0',fs:16*ui,
          act:()=>{ st.quality=(st.quality==='low')?'normal':(st.quality==='normal')?'high':'low'; st.save&&st.save(); }});
        y+=58*ui;
      }
      this._menuButton(ctx,{x,y,w:halfW,h:46*ui,
        label:t('Röppálya: ')+(st.showTrajectory?t('BE'):t('KI')),col:st.showTrajectory?'#3fa45a':'#33485a',fs:16*ui,
        act:()=>{ st.showTrajectory=!st.showTrajectory; st.save&&st.save(); }});
      this._menuButton(ctx,{x:x+halfW+16*ui,y,w:halfW,h:46*ui,
        label:t('Kill-cam: ')+(st.killcam?t('BE'):t('KI')),col:st.killcam?'#3fa45a':'#33485a',fs:16*ui,
        act:()=>{ st.killcam=!st.killcam; st.save&&st.save(); }});
      y+=60*ui;

      // ----- accessibility / comfort (#39) -----
      ctx.textAlign='center'; ctx.font='bold '+(17*ui)+'px '+FONT; ctx.fillStyle='#fff7e6';
      ctx.fillText(t('♿ Kényelem'), C.VIEW_W/2, y); y+=18*ui;

      // aim sensitivity 0.5..2.0 — reuse the 0..1 slider, mapped via a key shim.
      // We store the raw 0.5..2.0 value but the slider widget works in 0..1, so
      // we draw a custom sensitivity slider here (label + value + track).
      this._aimSlider(ctx, x, y, colW, ui); y+=54*ui;

      // leftHanded toggle + colorblind cycle (one row)
      const cbNames={off:t('KI'), deuter:'Deuter', protan:'Protan', tritan:'Tritan'};
      const cb=st.colorblind||'off';
      this._menuButton(ctx,{x,y,w:halfW,h:46*ui,
        label:(st.leftHanded?t('🤚 Balkezes: BE'):t('🤚 Balkezes: KI')),
        col:st.leftHanded?'#3fa45a':'#33485a',fs:15*ui,
        act:()=>{ st.leftHanded=!st.leftHanded; st.save&&st.save(); }});
      this._menuButton(ctx,{x:x+halfW+16*ui,y,w:halfW,h:46*ui,
        label:t('🎨 Színvak: ')+(cbNames[cb]||cb),col:cb!=='off'?'#8a6db0':'#33485a',fs:15*ui,
        act:()=>{ const order=['off','deuter','protan','tritan'];
          const i=order.indexOf(st.colorblind||'off');
          st.colorblind=order[(i+1)%order.length]; st.save&&st.save(); }});
      y+=58*ui;

      // haptics toggle (music toggle removed — music is always on; the music-volume
      // slider at 0 silences it. The toggle was a confusing no-op.)
      this._menuButton(ctx,{x,y,w:colW,h:46*ui,
        label:t('📳 Rezgés: ')+(st.haptics?t('BE'):t('KI')),col:st.haptics?'#3fa45a':'#33485a',fs:15*ui,
        act:()=>{ st.haptics=!st.haptics; st.save&&st.save(); }});
      y+=58*ui;

      // reduced-motion toggle (QA P3: a Kill-cam toggle fentebb már szerepel a
      // Röppálya mellett — a duplikátum törölve, csak helyet foglalt)
      this._menuButton(ctx,{x,y,w:colW,h:46*ui,
        label:t('🍃 Mozgáscsökk.: ')+(st.reducedMotion?t('BE'):t('KI')),col:st.reducedMotion?'#3fa45a':'#33485a',fs:15*ui,
        act:()=>{ st.reducedMotion=!st.reducedMotion; st.save&&st.save(); }});
      y+=58*ui;

      // ----- key rebind list (DESKTOP only — hidden on touch, no keyboard) -----
      if(showKeys){
      ctx.textAlign='center'; ctx.font='bold '+(17*ui)+'px '+FONT; ctx.fillStyle='#fff7e6';
      ctx.fillText(t('⌨ Billentyűk'), C.VIEW_W/2, y); y+=10*ui;
      const km=(st.keymap)||{};
      const rowW=(colW-16*ui)/2, rh=38*ui, rgap=8*ui;
      for(let i=0;i<actions.length;i++){
        const a=actions[i];
        const col=i%2, row=(i/2)|0;
        const rx=x+col*(rowW+16*ui), ry=y+row*(rh+rgap);
        const capturing=rebindAction===a[0];
        ctx.fillStyle=capturing?'rgba(255,215,106,0.92)':'rgba(255,255,255,0.10)';
        rr(ctx,rx,ry,rowW,rh,8); ctx.fill();
        ctx.textAlign='left'; ctx.font=(14*ui)+'px '+FONT; ctx.fillStyle=capturing?'#222':'#cfe6f2'; ctx.textBaseline='middle';
        ctx.fillText(a[1], rx+12*ui, ry+rh/2);
        ctx.textAlign='right'; ctx.font='bold '+(13*ui)+'px '+FONT; ctx.fillStyle=capturing?'#a4503f':'#ffd76a';
        ctx.fillText(capturing?t('nyomj egy gombot…'):prettyCode(km[a[0]]), rx+rowW-12*ui, ry+rh/2);
        ctx.textBaseline='alphabetic';
        menuBtns.push({x:rx,y:ry,w:rowW,h:rh,act:()=>{ rebindAction=a[0]; }});
      }
      y+=rebindRows*(rh+rgap)+6*ui;

      if(rebindAction){
        ctx.textAlign='center'; ctx.font=(13*ui)+'px '+FONT; ctx.fillStyle='#9fc0d2';
        ctx.fillText(t('Esc = mégse'), C.VIEW_W/2, y+12*ui);
      }
      y+=24*ui;
      }   // end if(showKeys)

      // record total content height so the scroll offset can be clamped
      if(scroll){
        const contentBottom=y;           // already includes -scrollY offset
        const total=contentBottom+scrollY;     // absolute body bottom (no offset)
        // Reserve the bottom safe-area inset (home-indicator) PLUS a margin so the
        // LAST row can always scroll fully into view on short landscape phones
        // (#settings-bottom-clip). On touch include the inset; desktop = 0.
        const botInset=IS_TOUCH?Math.round(safeAreaBottomCss()*((M.dpr)||1)):0;
        scrollMaxY=Math.max(0, total-(C.VIEW_H-16*M.ui-botInset));
        clampScroll();
      }
    },

    // a draggable/clickable slider bound to CA.settings[key] (0..1)
    // Layout: label + % value on their own line, the track sits well below them
    // so the knob never overlaps the text. Caller reserves ~54*ui per slider.
    _slider(ctx,key,label,x,y,w,ui){
      ui=ui||1;
      const st=CA.settings||{};
      const val=U.clamp((st[key]!=null?st[key]:0.5),0,1);
      ctx.textAlign='left'; ctx.font=(15*ui)+'px '+FONT; ctx.fillStyle='#cfe6f2'; ctx.textBaseline='alphabetic';
      ctx.fillText(label, x, y+2);
      ctx.textAlign='right'; ctx.fillStyle='#ffd76a'; ctx.font='bold '+(14*ui)+'px '+FONT;
      ctx.fillText(Math.round(val*100)+'%', x+w, y+2);
      const sy=y+22*ui, sh=12*ui, kr=11*ui;
      ctx.fillStyle='rgba(0,0,0,0.35)'; rr(ctx,x,sy,w,sh,6); ctx.fill();
      ctx.fillStyle='#3fa45a'; rr(ctx,x,sy,w*val,sh,6); ctx.fill();
      // knob
      const kx=x+w*val;
      ctx.fillStyle='#fff7e6'; ctx.beginPath(); ctx.arc(kx,sy+sh/2,kr,0,7); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(kx,sy+sh/2,kr,0,7); ctx.stroke(); ctx.lineWidth=1;
      menuSliders.push({x,y:sy,w,h:sh,key});
    },

    // aim-sensitivity slider bound to CA.settings.aimSensitivity (0.5..2.0)
    _aimSlider(ctx,x,y,w,ui){
      ui=ui||1;
      const st=CA.settings||{};
      const min=0.5, max=2.0;
      const val=U.clamp((st.aimSensitivity!=null?st.aimSensitivity:1.0), min, max);
      const frac=(val-min)/(max-min);
      ctx.textAlign='left'; ctx.font=(15*ui)+'px '+FONT; ctx.fillStyle='#cfe6f2'; ctx.textBaseline='alphabetic';
      ctx.fillText(t('🎯 Célzás érzékenység'), x, y+2);
      ctx.textAlign='right'; ctx.fillStyle='#ffd76a'; ctx.font='bold '+(14*ui)+'px '+FONT;
      ctx.fillText(val.toFixed(2)+'×', x+w, y+2);
      const sy=y+22*ui, sh=12*ui, kr=11*ui;
      ctx.fillStyle='rgba(0,0,0,0.35)'; rr(ctx,x,sy,w,sh,6); ctx.fill();
      ctx.fillStyle='#3fa45a'; rr(ctx,x,sy,w*frac,sh,6); ctx.fill();
      const kx=x+w*frac;
      ctx.fillStyle='#fff7e6'; ctx.beginPath(); ctx.arc(kx,sy+sh/2,kr,0,7); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(kx,sy+sh/2,kr,0,7); ctx.stroke(); ctx.lineWidth=1;
      menuSliders.push({x,y:sy,w,h:sh,key:'aimSensitivity',min,max});
    },

    /* ---------- KÉSZÍTŐK screen ---------- */
    _menuCredits(ctx){
      this._backButton(ctx);
      this._screenTitle(ctx,t('👏 Készítők'));

      const ui=metrics().ui;
      ctx.textAlign='center';
      let y=Math.round(120*ui);
      ctx.font='bold '+(34*ui)+'px '+FONT; ctx.fillStyle='#fff7e6';
      ctx.fillText('Animal Battle Ground', C.VIEW_W/2, y); y+=44*ui;
      ctx.font=(20*ui)+'px '+FONT; ctx.fillStyle='#bfe0f0';
      ctx.fillText(t('Los Polos Amigos'), C.VIEW_W/2, y); y+=30*ui;
      ctx.font=(16*ui)+'px '+FONT; ctx.fillStyle='#9fc0d2';
      ctx.fillText(t('Készítette: Gebei János & Claude (Anthropic) — 2026'), C.VIEW_W/2, y); y+=46*ui;

      ctx.font='bold '+(18*ui)+'px '+FONT; ctx.fillStyle='#caa472';
      ctx.fillText(t('🐹 Capybarák — ')+(CA.ROSTER?CA.ROSTER.capybara.team:''), C.VIEW_W/2, y); y+=26*ui;
      ctx.font=(16*ui)+'px '+FONT; ctx.fillStyle='#e6d6bf';
      if(CA.ROSTER) ctx.fillText(CA.ROSTER.capybara.names.join('  •  '), C.VIEW_W/2, y); y+=44*ui;

      ctx.font='bold '+(18*ui)+'px '+FONT; ctx.fillStyle='#7fc97f';
      ctx.fillText(t('🪱 Worm-ök — ')+(CA.ROSTER?CA.ROSTER.worm.team:''), C.VIEW_W/2, y); y+=26*ui;
      ctx.font=(16*ui)+'px '+FONT; ctx.fillStyle='#d2ecd2';
      if(CA.ROSTER) ctx.fillText(CA.ROSTER.worm.names.join('  •  '), C.VIEW_W/2, y); y+=50*ui;

      // asset attribution
      ctx.font=(13*ui)+'px '+FONT; ctx.fillStyle='#8fa6b4';
      ctx.fillText(t('Ikonok / illusztrációk: Freepik (flaticon.com)'), C.VIEW_W/2, y);
    },

    /* ---------- 👥 CSAPAT SZERKESZTŐ screen ----------
     * Scrollable, clipped card (like Új játék): a team-name field, up to
     * TEAM_SIZE unit rows (preview + name + species picker + cosmetic picker),
     * a 💾/🗑️ action row, and a list of saved teams to load. Persists to
     * localStorage under TEAMS_KEY. */
    _menuTeamEdit(ctx){
      const M=metrics(); const ui=M.ui, VW=M.VW, VH=M.VH;
      const allSp=(CA.Species&&CA.Species.list)?CA.Species.list():['capybara','worm'];

      // fixed regions
      const titleBottom=Math.round(96*ui);
      const barH=86*ui;
      const viewTop=titleBottom, viewBottom=VH-barH;

      const colW=Math.min(VW*0.90, 880*ui), colL=VW/2-colW/2;

      // card backdrop + clip (scroll body inside)
      const cardPad=14*ui;
      const cardX=colL-cardPad, cardW=colW+cardPad*2;
      const cardY=viewTop+6*ui, cardH=(viewBottom-8*ui)-cardY, cardR=20*ui;
      ctx.fillStyle='rgba(8,22,32,0.55)'; rr(ctx,cardX,cardY,cardW,cardH,cardR); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.10)'; ctx.lineWidth=2; rr(ctx,cardX,cardY,cardW,cardH,cardR); ctx.stroke(); ctx.lineWidth=1;

      ctx.save();
      rr(ctx,cardX,cardY,cardW,cardH,cardR); ctx.clip();
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';

      let y=viewTop+42*ui - scrollY;
      const secGap=12*ui;
      const label=(txt)=>{ ctx.textAlign='left'; ctx.font='bold '+(18*ui)+'px '+FONT; ctx.fillStyle='#fff7e6'; ctx.fillText(t(txt), colL, y); y+=14*ui; };

      // ===== TEAM NAME =====
      label('Csapat neve');
      this._nameFieldInline(ctx,'tename',t('Csapat neve'), colL, y+6*ui, Math.min(colW,360*ui), false, ui);
      y+=6*ui+62*ui+secGap;

      // ===== UNITS =====
      label(t('Egységek')+' ('+teEdit.units.length+')');
      let cy=y+6*ui;
      const rowH=48*ui;
      const narrow=colW<560*ui;
      const arrW=24*ui, pic=36*ui;
      const stepArr=(arr,cur,dir)=>{ const n=arr.length||1; const i=arr.indexOf(cur);
        return arr[((i<0?0:i)+dir+n)%n]; };
      for(let i=0;i<teEdit.units.length;i++){
        const u=teEdit.units[i]; const ry=cy+i*(rowH+8*ui);
        // live preview (species avatar)
        this._teamPic(ctx, {species:u.species, kind:u.species, color:'#2d6079'}, colL, ry+(rowH-pic)/2, pic);
        const sp=(CA.Species&&CA.Species[u.species])||{};
        let bx=colL+pic+8*ui;
        // species picker  ◀ [name] ▶
        const spW=narrow?96*ui:128*ui;
        this._pill(ctx,{x:bx,y:ry+(rowH-34*ui)/2,w:arrW,h:34*ui,label:'◀',sel:false,col:'#2d6079',fs:14*ui,
          act:()=>{ u.species=stepArr(allSp,u.species,-1); }});
        bx+=arrW+3*ui;
        this._pill(ctx,{x:bx,y:ry+(rowH-34*ui)/2,w:spW,h:34*ui,label:(sp.emoji?sp.emoji+' ':'')+t(sp.name||u.species),
          sel:true,col:'#2d6079',fs:13*ui, act:()=>{ u.species=stepArr(allSp,u.species,1); }});
        bx+=spW+3*ui;
        this._pill(ctx,{x:bx,y:ry+(rowH-34*ui)/2,w:arrW,h:34*ui,label:'▶',sel:false,col:'#2d6079',fs:14*ui,
          act:()=>{ u.species=stepArr(allSp,u.species,1); }});
        bx+=arrW+8*ui;
        // cosmetic picker  ◀ [name] ▶
        const coW=narrow?96*ui:128*ui;
        this._pill(ctx,{x:bx,y:ry+(rowH-34*ui)/2,w:arrW,h:34*ui,label:'◀',sel:false,col:'#8a6db0',fs:14*ui,
          act:()=>{ u.cosmetic=stepArr(COSMETIC_IDS,u.cosmetic||'plain',-1); }});
        bx+=arrW+3*ui;
        this._pill(ctx,{x:bx,y:ry+(rowH-34*ui)/2,w:coW,h:34*ui,label:'🎩 '+t(COSMETIC_NAMES[u.cosmetic||'plain']||'Sima'),
          sel:(u.cosmetic&&u.cosmetic!=='plain'),col:'#8a6db0',fs:12*ui, act:()=>{ u.cosmetic=stepArr(COSMETIC_IDS,u.cosmetic||'plain',1); }});
        bx+=coW+3*ui;
        this._pill(ctx,{x:bx,y:ry+(rowH-34*ui)/2,w:arrW,h:34*ui,label:'▶',sel:false,col:'#8a6db0',fs:14*ui,
          act:()=>{ u.cosmetic=stepArr(COSMETIC_IDS,u.cosmetic||'plain',1); }});
        bx+=arrW+8*ui;
        // unit name field (fills the rest of the row)
        const nameW=Math.max(80*ui,(colL+colW)-bx);
        this._nameFieldInline(ctx,'teu'+i,t('Egység')+' '+(i+1), bx, ry+(rowH-34*ui)/2, nameW, true, ui);
      }
      y=cy+teEdit.units.length*(rowH+8*ui)+secGap;

      // ===== ACTION ROW: save / delete =====
      label('Műveletek');
      let ay=y+6*ui; const abH=40*ui;
      this._pill(ctx,{x:colL,y:ay,w:Math.min(160*ui,colW*0.45),h:abH,label:t('💾 Mentés'),
        sel:true,col:'#3fa45a',fs:15*ui,bold:true, act:()=>{ teSave(); }});
      this._pill(ctx,{x:colL+Math.min(160*ui,colW*0.45)+10*ui,y:ay,w:Math.min(150*ui,colW*0.42),h:abH,
        label:t('🗑️ Törlés'),sel:false,col:'#a4503f',fs:15*ui,bold:true, act:()=>{ teDelete(); }});
      y=ay+abH+secGap;
      if(teStatus){
        ctx.textAlign='left'; ctx.font=(13*ui)+'px '+FONT; ctx.fillStyle='#ffd76a';
        ctx.fillText(teStatus, colL, y); y+=20*ui;
      }

      // ===== SAVED TEAMS list =====
      const saved=loadTeams();
      label(t('Mentett csapatok')+' ('+saved.length+')');
      if(!saved.length){
        ctx.textAlign='left'; ctx.font=(14*ui)+'px '+FONT; ctx.fillStyle='#9fc0d2';
        ctx.fillText(t('Még nincs mentett csapat. Állítsd be fent, majd 💾 Mentés.'), colL, y+16*ui);
        y+=30*ui;
      } else {
        let sy=y+6*ui; const slH=38*ui;
        for(let i=0;i<saved.length;i++){
          const rec=saved[i];
          const sel=teSelected===i;
          this._pill(ctx,{x:colL,y:sy,w:colW,h:slH,
            label:(sel?'✅ ':'📋 ')+(rec.name||(t('Csapat')+' '+(i+1)))+'  ('+((rec.units&&rec.units.length)||0)+' '+t('egység')+')',
            sel, col:'#2d6079', fs:14*ui, bold:sel, act:()=>{ teLoad(i); }});
          sy+=slH+6*ui;
        }
        y=sy+4*ui;
        // new/clear draft
        this._pill(ctx,{x:colL,y:y,w:Math.min(180*ui,colW),h:36*ui,label:t('➕ Új csapat'),
          sel:false,col:'#3fa45a',fs:13*ui, act:()=>{ teEdit=blankTeam(); teSelected=-1; teStatus=t('Új piszkozat'); focusedField=null; }});
        y+=44*ui;
      }

      ctx.restore();   // end clip

      // record scroll height
      const cardInnerBottom=cardY+cardH-12*ui;
      const contentBottom=y+scrollY;
      scrollMaxY=Math.max(0, contentBottom+16*ui-cardInnerBottom);
      clampScroll();

      // ---- fixed chrome ----
      ctx.fillStyle='rgba(8,22,32,0.85)'; ctx.fillRect(0, viewBottom, VW, barH);
      const useW=Math.min(360*ui, VW*0.8), useX=VW/2-useW/2, useY=viewBottom+(barH-60*ui)/2;
      this._menuButton(ctx,{x:useX,y:useY,w:useW,h:60*ui,label:t('🎮 Játék ezzel'),col:'#e0a93f',fs:24*ui,
        act:()=>{ teStartGame(); }});

      this._screenTitle(ctx,t('👥 Csapat szerkesztő'));
      this._backButton(ctx);
      if(scrollMaxY>0 && scrollY<scrollMaxY-2){
        ctx.textAlign='center'; ctx.font=(13*ui)+'px '+FONT; ctx.fillStyle='rgba(255,255,255,0.55)';
        ctx.fillText(t('▼ görgess'), VW/2, viewBottom-8*ui);
      }
    },

    /* ====================================================================
     * IN-GAME HUD
     * ==================================================================*/
    render(ctx){
      if(CA.Armory && CA.Armory.sync) CA.Armory.sync();
      ctx.textBaseline='alphabetic';
      hudBtns=[];
      const M=metrics(); const ui=M.ui;

      const team=S.teams[S.currentTeamIdx];
      const pad=12*ui;
      // Horizontal safe-area inset for top-edge HUD (curved corners / notch ear on
      // phones). Desktop → {l:0,r:0}. Left elements shift right by insL, right
      // elements shift left by insR. See topHudInsetPx().
      const ins=topHudInsetPx(M);
      // (#hud-left-too-inward / #hud-right-too-inward) nudge the TOP-LEFT roster
      // banner back toward the left edge (smaller left pad + only ~60% of the
      // safe-area ear) and the TOP-RIGHT cluster slightly closer to the right edge.
      const padL=Math.round(6*ui+ins.l*0.6), padR=Math.round(7*ui+ins.r*0.6);
      // vertical top inset: clear the notch/status-bar + a few px so the top HUD row
      // (team banner, hourglass, pause/mute, end-turn) never touches/overflows the
      // top edge. (#hud-top-overlap)
      const padTop = pad + Math.round(safeAreaTopCss()*((M.dpr)||1)) + 5*ui;

      // ----- top-left: current team + active unit banner (compact) -----
      if(team){
        const u=CA.activeUnit();
        const bw=Math.min(C.VIEW_W*0.46, 290*ui), bh=46*ui;
        ctx.fillStyle='rgba(0,0,0,0.35)'; rr(ctx,padL,padTop,bw,bh,10*ui); ctx.fill();
        ctx.fillStyle=team.color; rr(ctx,padL,padTop,7*ui,bh,4*ui); ctx.fill();
        // active character's FACE on the LEFT (Jani) — the species avatar in a chip.
        let txtX = padL+14*ui;
        if(u){
          const fsz=34*ui, fx=padL+12*ui, fy=padTop+(bh-fsz)/2;
          ctx.save(); ctx.beginPath(); rr(ctx,fx,fy,fsz,fsz,8*ui); ctx.clip();
          ctx.fillStyle='rgba(255,255,255,0.12)'; ctx.fillRect(fx,fy,fsz,fsz);
          // Jani: show the ACTUAL CHARACTER (species + cosmetic), the same portrait
          // the Team Editor draws — not the plain species/team logo. Falls back to
          // the species icon, then an emoji, so a missing portrait never blanks the HUD.
          const port = this._unitPortrait(u);
          if(port && port.width){ ctx.imageSmoothingEnabled=true; if('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality='high'; ctx.drawImage(port, fx, fy, fsz, fsz); }
          else {
            const fimg = CA.speciesIcon && CA.speciesIcon(u.species);
            if(fimg && fimg.complete && fimg.naturalWidth>0){ ctx.drawImage(fimg, fx, fy, fsz, fsz); }
            else { ctx.font=(fsz*0.66)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff'; ctx.fillText(u.species==='worm'?'🐛':'🐹', fx+fsz/2, fy+fsz/2+1); ctx.textBaseline='alphabetic'; ctx.textAlign='left'; }
          }
          ctx.restore();
          txtX = fx+fsz+9*ui;
        }
        ctx.textAlign='left'; ctx.textBaseline='alphabetic';
        ctx.font='bold '+(17*ui)+'px '+FONT; ctx.fillStyle=team.color;
        // a11y: prefix the active team's name with its shape badge in colour-blind
        // mode so the player can tell whose turn it is by form, not just colour.
        if(CA.settings && CA.settings.colorblind && CA.settings.colorblind!=='off'){
          let _tix=0; try{ _tix=(S.teams||[]).indexOf(team); if(_tix<0) _tix=0; }catch(e){}
          const _sh=this._teamShape(_tix);
          ctx.fillText(_sh, txtX, padTop+19*ui);
          txtX += ctx.measureText(_sh).width+5*ui;
        }
        const _nm=t(team.name);
        ctx.fillText(_nm, txtX, padTop+19*ui);
        if(team.isAI){ const rb=CA.img&&CA.img('assets/ui/robot.png'); const rx=txtX+ctx.measureText(_nm).width+6*ui, rsz=18*ui;
          if(rb) ctx.drawImage(rb, rx, padTop+5*ui, rsz, rsz); else ctx.fillText('🤖', rx, padTop+19*ui); }
        ctx.font=(13*ui)+'px '+FONT; ctx.fillStyle='#fff';
        let _cls=''; try{ const cd=u&&CA.classOf?CA.classOf(u):null; if(cd&&cd.name) _cls=' – '+t(cd.name); }catch(e){}
        ctx.fillText((u?u.name:'—') + _cls + (team.isAI?'  ('+t('gondolkodik…')+')':''), txtX, padTop+37*ui);

        // ----- TAP-TO-SWITCH (touch only): tapping the active-unit banner chip
        // cycles to the next own alive hero — the on-screen replacement for the Q
        // key (the dead 'switch' touch button was never placed). Gated to a human
        // turn that hasn't fired/moved yet AND a team with >1 alive hero, mirroring
        // CA.switchUnit()'s own pre-conditions so the chip only invites a tap when
        // a switch will actually happen. (#touch-cant-switch-unit)
        let _canSwitch=false;
        try{
          _canSwitch = IS_TOUCH && isHumanTurn() && S.mode===G.PLAYING && !S.paused
            && !S.firedThisTurn && !S._movedThisTurn
            && CA.aliveHeroesOfTeam && (CA.aliveHeroesOfTeam(team.id)||[]).length>1;
        }catch(e){ _canSwitch=false; }
        if(_canSwitch){
          // small 🔄 affordance pinned to the chip's top-right so it reads as tappable
          ctx.textAlign='right'; ctx.textBaseline='middle';
          ctx.font=(15*ui)+'px '+FONT; ctx.fillStyle='rgba(255,255,255,0.9)';
          ctx.fillText('🔄', padL+bw-8*ui, padTop+13*ui);
          ctx.textAlign='left'; ctx.textBaseline='alphabetic';
          // register the WHOLE banner rect as a tap target (already ≥44px tall) that
          // calls CA.switchUnit(); core re-validates, so a stale frame can't misfire.
          hudBtns.push({ id:'switchunit', x:padL, y:padTop, w:bw, h:bh,
            act:function(){ if(CA.switchUnit) CA.switchUnit(); } });
        }
      }

      // ----- top-right: pause + mute (compact) -----
      const bs=38*ui;                          // button size
      const mute={id:'mute', x:C.VIEW_W-padR-bs, y:padTop, w:bs, h:bs, act:()=>toggleMute()};
      const pa={id:'pause', x:mute.x-bs-8*ui, y:padTop, w:bs, h:bs, act:()=>{ S.paused=!S.paused; pauseSettings=false; pauseHelp=false; quitConfirm=false; }};
      for(const b of [pa,mute]){ ctx.fillStyle='rgba(0,0,0,0.4)'; rr(ctx,b.x,b.y,b.w,b.h,9*ui); ctx.fill(); }
      // SVG icons (user-supplied): play/pause + sound on/off; emoji fallback.
      const muted=!!(CA.Audio&&CA.Audio.muted);
      const icoPause = CA.img && CA.img(S.paused?'assets/ui/play.svg':'assets/ui/pause.svg');
      const icoSnd   = CA.img && CA.img(muted?'assets/ui/snd-off.svg':'assets/ui/snd-on.svg');
      const isz=20*ui;
      if(icoPause) ctx.drawImage(icoPause, pa.x+(bs-isz)/2, pa.y+(bs-isz)/2, isz, isz);
      else { ctx.font=(20*ui)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff'; ctx.fillText(S.paused?'▶':'⏸', pa.x+pa.w/2, pa.y+pa.h/2); ctx.textBaseline='alphabetic'; }
      if(icoSnd) ctx.drawImage(icoSnd, mute.x+(bs-isz)/2, mute.y+(bs-isz)/2, isz, isz);
      else { ctx.font=(20*ui)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff'; ctx.fillText(muted?'🔇':'🔊', mute.x+mute.w/2, mute.y+mute.h/2); ctx.textBaseline='alphabetic'; }
      // Apple HIG: these top-cluster buttons draw at 38*ui (~35 CSS px on dpr≥2),
      // below the 44px minimum. Mirror the _weaponPanel/_abilityBar MIN44 trick —
      // keep the VISUAL rect, but push an INFLATED hit-rect into hudBtns. The
      // horizontal pad is capped to half the inter-button gap (8*ui) so adjacent
      // hit-rects don't overlap; the vertical grows DOWN only (never up into the notch).
      const _MIN44 = IS_TOUCH ? Math.round(44*((M&&M.dpr)||1)) : 0;
      const _infl = b => {
        if(!IS_TOUCH) return { x:b.x, y:b.y, w:b.w, h:b.h, id:b.id, act:b.act };
        const xp = Math.min(Math.max(0, Math.ceil((_MIN44 - b.w)/2)), Math.floor(4*ui)); // < half the 8*ui gap
        const need = Math.max(0, _MIN44 - b.h);                                            // grow DOWN only (notch-safe)
        return { x:b.x-xp, y:b.y, w:b.w+xp*2, h:b.h+need, id:b.id, act:b.act };
      };
      hudBtns.push(_infl(pa)); hudBtns.push(_infl(mute));

      // ----- end-turn: compact pill in the TOP cluster, left of pause/mute -----
      // (used rarely, so it lives small & top-aligned next to pause/mute rather than
      //  as the old oversized bottom-corner button). Visible only on a human turn.
      if(isHumanTurn() && S.mode===G.PLAYING && !S.paused){
        const eth=bs;                          // same height as pause/mute (square row)
        const etw=Math.round(112*ui);          // compact pill — generous tap target
        const et={id:'endturn', x:pa.x-etw-8*ui, y:padTop, w:etw, h:eth};
        ctx.fillStyle='rgba(0,0,0,0.3)'; rr(ctx,et.x+2,et.y+2,et.w,et.h,9*ui); ctx.fill();
        ctx.fillStyle='#d9534f'; rr(ctx,et.x,et.y,et.w,et.h,9*ui); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,0.15)'; rr(ctx,et.x,et.y,et.w,et.h/2,9*ui); ctx.fill();
        ctx.fillStyle='#fff'; ctx.font='bold '+(14*ui)+'px '+FONT;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        // nudge ~2px down: canvas 'middle' baseline renders visually a touch high,
        // so the label sat above the pill centre (reported repeatedly).
        ctx.fillText(t('Kör vége ⏭'), et.x+et.w/2, et.y+et.h/2 + Math.round(2*ui));
        ctx.textAlign='left'; ctx.textBaseline='alphabetic';
        // same MIN44 treatment: width (112*ui) already clears 44, only the height
        // (bs=38*ui) needs growing — inflate DOWN via the shared _infl helper.
        hudBtns.push(_infl(et));
      }

      // ----- top-center: turn timer — HOURGLASS (homokóra) -----
      // Signature differentiator vs. Worms: a cute canvas hourglass whose top bulb
      // DRAINS and bottom bulb FILLS as the turn counts down, with a live falling-
      // sand stream and the integer seconds beside it. Turns red & urgent < ~5s.
      const cs=(IS_TOUCH?36*0.7:36)*ui, ccx=C.VIEW_W/2;   // mobile: 30% smaller hourglass (Jani)
      const tt=this._hourglass(ctx, ccx, padTop, cs, ui);

      // ----- wind indicator (just under the hourglass) -----
      this._wind(ctx, ccx, padTop+cs+10*ui, ui);

      // ----- team rosters (below the pause/mute buttons) -----
      const rosterBottom=this._rosters(ctx, M, padTop+bs+8*ui, padR);

      // ----- weapon panel -----
      this._weaponPanel(ctx, M);

      // ----- power bar while charging -----
      if(S.charging){
        const pw=Math.min(C.VIEW_W*0.5,300*ui), px=C.VIEW_W/2-pw/2, py=C.VIEW_H-148*ui;
        ctx.fillStyle='rgba(0,0,0,0.45)'; rr(ctx,px-6*ui,py-6*ui,pw+12*ui,24*ui,8*ui); ctx.fill();
        const grd=ctx.createLinearGradient(px,0,px+pw,0);
        grd.addColorStop(0,'#7CFC00'); grd.addColorStop(0.6,'#FFD000'); grd.addColorStop(1,'#FF3030');
        ctx.fillStyle=grd; rr(ctx,px,py,pw*U.clamp(S.power,0,1),12*ui,6*ui); ctx.fill();
        ctx.fillStyle='#fff'; ctx.font=(13*ui)+'px '+FONT; ctx.textAlign='center';
        ctx.fillText(t('ERŐ'), C.VIEW_W/2, py-12*ui);
      }

      // (end-turn button now lives in the TOP cluster next to pause/mute — see above)

      // ----- on-screen mobile controls -----
      this._touchControls(ctx);

      // ----- PC hint: character switch (unobtrusive, bottom-left) -----
      if(!IS_TOUCH && isHumanTurn() && S.mode===G.PLAYING && !S.paused && !S.firedThisTurn){
        ctx.textAlign='left'; ctx.textBaseline='alphabetic';
        ctx.font=(13*ui)+'px '+FONT;
        ctx.shadowColor='rgba(0,0,0,0.8)'; ctx.shadowBlur=3*ui;
        ctx.fillStyle='rgba(255,255,255,0.7)';
        // prefix a swap icon so the PC hint reads visually as "switch" (Jani)
        ctx.fillText('🔄 '+t('Q: karaktercsere'), pad, C.VIEW_H-pad);
        ctx.shadowColor='transparent'; ctx.shadowBlur=0;
      }

      // ----- timer-grenade fuse control -----
      this._timerFuse(ctx, M);

      // ----- per-turn MOVEMENT budget bar (Worms-style: no infinite walking) -----
      this._moveBar(ctx, M);

      // ----- first-run contextual coachmarks (teach the core verbs once) -----
      this._coach(ctx, M);

      // ----- achievement toasts (Jani: FENT, a homokóra alatt jelenjen meg/tűnjön el) -----
      this._toasts(ctx, M, padTop+cs+34*ui);

      // ----- top-center combo/crit/toast stack -----
      this._centerToasts(ctx, M);

      // ----- "your turn" handoff banner -----
      this._turnBanner(ctx, M);

      // ----- kill-cam banner (touch): drawn LOWER, clear of the top notch -----
      // (#killcam-clipped) core.js paints a kill-cam banner at ~3.5% of the canvas
      // height, which on notched phones lands UNDER the status bar / notch and is
      // ~top-10% clipped. We can only edit ui.js, so on TOUCH we paint our own
      // banner BELOW the safe-area top strip so it is always fully visible. (The
      // core banner is brief & translucent; this one sits clearly lower.)
      if(IS_TOUCH && S.killcam && S.killcam.t>0){ this._killCamBanner(ctx, M); }

      // ----- mode-intro banner (#mode-intro): icon + name + objective, ~4s -----
      // Skipped during pause/game-over and while a puzzle owns the banner.
      if(_modeIntroT>=0 && S.mode===G.PLAYING && !S.paused && !S._puzzle){ this._modeIntroBanner(ctx, M); }
      else if(S._puzzle || S.paused || S.mode!==G.PLAYING){ _modeIntroT=-1; }

      // ----- puzzle objective banner (Fejtörő) -----
      if(S._puzzle && S.mode===G.PLAYING && !S.paused){ this._puzzleBanner(ctx, M); }
      else if(!S._puzzle){ _puzzleBannerId=null; _puzzleBannerT=0; }

      // ----- pause overlay -----
      // ONLINE CLIENT: it is "paused" only to FREEZE its local sim (it mirrors the
      // host's snapshots); it is NOT a user pause. Showing the pause overlay there
      // covered the live mirrored game and made "Resume" do nothing (the net tick
      // re-pauses every frame). So suppress the overlay for an online client.
      if(S.paused && S.mode===G.PLAYING && !(CA.Net && CA.Net.isClient && CA.Net.isClient())){ this._pauseOverlay(ctx); }

      // ----- game over -----
      if(S.mode===G.GAME_OVER){ this._gameOver(ctx); }
    },

    /* ---------- pause overlay (menu / settings sub-page) ---------- */
    _pauseOverlay(ctx){
      // dim everything; also clear in-game hudBtns (we replace them here)
      ctx.fillStyle='rgba(8,16,24,0.7)'; ctx.fillRect(0,0,C.VIEW_W,C.VIEW_H);
      hudBtns=[];
      menuBtns=[]; menuSliders=[];

      // ---- "Hogyan játssz?" help/controls card (re-accessible tutorial) ----
      // A simple, scrollless card listing the controls, branched on IS_TOUCH so it
      // matches the player's device. Closes on tap/click anywhere or Escape. No
      // listeners are added — it reuses the canvas hudBtns hit-test path, so there
      // is nothing to leak. (Renders INSTEAD of the pause menu while open.)
      if(pauseHelp){
        this._pauseHelp(ctx);
        return;
      }

      if(pauseSettings){
        const M=metrics();
        const ui=M.ui;
        // Push the whole header (title + Back) BELOW the status-bar / notch safe
        // area, otherwise on notched phones a constant y:16*ui sits UNDER the
        // status bar and the Back button is not tappable (#stuck-in-settings).
        // safeAreaTopCss() is in CSS px → multiply by dpr for backing px.
        const safeTop=Math.round(safeAreaTopCss()*((M.dpr)||1));
        // LANDSCAPE NOTCH: the iPhone notch ear sits on the LEFT/RIGHT in landscape
        // (safe-area-inset-top≈0 then), so a Back button at a constant x:14*ui was
        // hidden UNDER the left notch and untappable (#mobile-stuck-landscape). Inset
        // the Back by the left safe-area so it always clears the ear.
        const safeLeft=Math.round(safeAreaLeftCss()*((M.dpr)||1));
        // The Back/close control is painted AFTER the body so it is ALWAYS visible &
        // tappable on mobile — independent of how the body lays out / overflows.
        // Touch target is >=44 CSS px tall (44*ui, ui>=1) per Apple HIG.
        const bb={id:'pauseback', x:Math.round(14*ui)+safeLeft, y:Math.round(Math.max(safeTop,10*ui)+8*ui),
          w:Math.round(150*ui), h:Math.round(46*ui),
          act:()=>{ pauseSettings=false; rebindAction=null; scrollY=0; scrollMaxY=0; }};
        // header band height — reserve space so the body starts below the title + Back.
        // Tightened (#settings-bottom-clip): start the list HIGHER so the top
        // "Nyelv / Magyar" row is visible on short landscape phones; the rest scrolls.
        const headH=Math.round(bb.y+bb.h+6*ui);

        // ----- body -----
        // A body MINDENHOL scrollozható (clippelt sáv a fejléc alatt) — QA P1: a
        // PC-s shrink-to-fit matek (fit*M.ui) 1080p-n túl-skálázott, a görgő-fix
        // (#pause-settings-wheel) pedig halott kód volt, mert scroll=false mellett
        // a scrollMaxY sosem íródott → az alsó sorok elérhetetlenek maradtak.
        // Desktopon a kerék görget (a wheel-handler már él), touch-on a drag.
        {
          const clipTop=headH-6*ui;
          ctx.save();
          ctx.beginPath(); ctx.rect(0, clipTop, C.VIEW_W, C.VIEW_H-clipTop); ctx.clip();
          this._renderSettingsBody(ctx, headH+4*ui, /*scroll=*/true);
          ctx.restore();
        }

        // ----- fixed header (title + Back) painted ON TOP of the body -----
        ctx.fillStyle='rgba(8,16,24,0.92)'; ctx.fillRect(0,0,C.VIEW_W,headH);
        ctx.textAlign='center'; ctx.font='bold '+(28*ui)+'px '+FONT; ctx.fillStyle='#fff7e6';
        ctx.textBaseline='middle'; ctx.fillText(t('⚙️ Beállítások'), C.VIEW_W/2, bb.y+bb.h/2); ctx.textBaseline='alphabetic';
        ctx.fillStyle='#33485a'; rr(ctx,bb.x,bb.y,bb.w,bb.h,12); ctx.fill();
        ctx.fillStyle='#fff'; ctx.font='bold '+(17*ui)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(t('‹ Vissza'), bb.x+bb.w/2, bb.y+bb.h/2); ctx.textBaseline='alphabetic';

        // expose the settings buttons + back button to the pause pointer path
        // (sliders are handled separately via the menuSliders drag path).
        // Back is LAST so its hit-rect wins over any body widget that slid under it.
        hudBtns=menuBtns.concat([bb]);
        return;
      }

      const ui=metrics().ui;
      ctx.textAlign='center';
      ctx.font='bold '+(52*ui)+'px '+FONT; ctx.fillStyle='#fff';
      ctx.fillText(t('⏸ Szünet'), C.VIEW_W/2, C.VIEW_H/2-100*ui);

      const bw=280*ui, bh=52*ui, x=C.VIEW_W/2-bw/2, gap=14*ui; let y=C.VIEW_H/2-46*ui;
      const mk=(label,col,act)=>{
        const b={x,y,w:bw,h:bh,act};
        ctx.fillStyle='rgba(0,0,0,0.3)'; rr(ctx,b.x+3,b.y+4,b.w,b.h,14*ui); ctx.fill();
        ctx.fillStyle=col; rr(ctx,b.x,b.y,b.w,b.h,14*ui); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,0.15)'; rr(ctx,b.x,b.y,b.w,b.h/2,14*ui); ctx.fill();
        ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
        // (#pause-label-offcenter) the "⚙️" gear carries a VS16 selector (️) that
        // renders as an extra zero-width/tofu box on the canvas fallback font, padding
        // the right side so the label looked right-aligned. Strip VS16 for a balanced,
        // truly-centered glyph (other labels use plain emoji and were already fine).
        const _lbl=String(label).replace(/️/g,'');
        // shrink-to-fit so a longer label (e.g. the quit-confirm prompt) stays on the
        // button instead of spilling out the sides (#quit-confirm).
        let _fs=21*ui; const _inner=bw-22*ui;
        for(let _k=0;_k<24;_k++){ ctx.font='bold '+_fs+'px '+FONT; if(ctx.measureText(_lbl).width<=_inner||_fs<=12) break; _fs-=Math.max(1,_fs*0.06); }
        ctx.fillText(_lbl, b.x+b.w/2, b.y+bh/2); ctx.textBaseline='alphabetic';
        hudBtns.push(b); y+=bh+gap;
      };
      mk(t('▶ Folytatás'), '#3fa45a', ()=>{ quitConfirm=false; pauseHelp=false; S.paused=false; });
      mk(t('❓ Hogyan játssz?'), '#a4853f', ()=>{ quitConfirm=false; pauseHelp=true; });
      mk(t('⚙️ Beállítások'), '#3f86a4', ()=>{ quitConfirm=false; pauseSettings=true; scrollY=0; scrollMaxY=0; });
      // 🏠 Főmenü — 2-step quit confirm (#quit-confirm): first tap arms (relabel to
      // "Biztos? Kilépsz a meccsből", brighter warning red), second tap quits. A
      // mis-tap therefore can't abandon a live match.
      mk(quitConfirm?t('Biztos? Kilépsz a meccsből'):t('🏠 Főmenü'), quitConfirm?'#d05636':'#a4503f', ()=>{
        if(!quitConfirm){ quitConfirm=true; return; }
        quitConfirm=false;
        // mentsük a meccset kilépés előtt, hogy a "▶ Folytatás" visszahozza
        // (csak normál játszmát — puzzle/challenge nem mentődik) (backlog #8).
        try{ if(!S._puzzle && !S._challenge && CA.saveGame) CA.saveGame(); }catch(e){}
        // clear any active puzzle/challenge run so its weapon-restriction / scoring
        // never leaks into the next normal match (#puzzle-leak).
        S._puzzle=null; S._challenge=null;
        S.paused=false; pauseSettings=false; pauseHelp=false; S.mode=G.MENU; screen='main';
        if(CA.Audio&&CA.Audio.stop)CA.Audio.stop();
      });

      ctx.font=(15*ui)+'px '+FONT; ctx.fillStyle='#9fc0d2';
      ctx.fillText(t('P = folytatás'), C.VIEW_W/2, y+8*ui);
    },

    /* ---------- "Hogyan játssz?" help / controls card ----------
     * Re-accessible tutorial (the first-turn coachmarks only ever show once). A
     * simple centered card listing the controls, branched on IS_TOUCH so the glyphs
     * match the device. Closed by a tap/click ANYWHERE (a single full-card hit-rect
     * pushed into hudBtns) or Escape (handled in onEsc). No DOM listeners → no leak. */
    _pauseHelp(ctx){
      const ui=metrics().ui;
      // controls, branched on input type. Each row: [icon/keys, label].
      const rows = IS_TOUCH ? [
        ['◀ ▶', t('Mozgás — a lépéscsík elfogy, ahogy mész')],
        ['▲ ▼', t('Célzás — a szaggatott ív mutatja a lövést')],
        ['🔥', t('Tüzelés — tartsd nyomva a töltéshez, engedd el a lövéshez')],
        ['🔁', t('Fegyverváltás — koppints a lenti sávban')],
        ['⏭️', t('Kör vége — ha elfogyott a lépés vagy lőttél')],
      ] : [
        ['A / D', t('Mozgás — a lépéscsík elfogy, ahogy mész')],
        ['🖱️', t('Célzás — az egérrel, a szaggatott ív mutatja a lövést')],
        ['Kattintás / Enter', t('Tüzelés — tartsd nyomva a töltéshez, engedd el a lövéshez')],
        ['TAB / 1-9', t('Fegyverváltás — TAB vált, a számok közvetlenül választanak')],
        ['Kör vége gomb', t('Kör vége — ha elfogyott a lépés vagy lőttél')],
      ];

      // card box, measure-fit width so the longest row stays inside
      ctx.save();
      ctx.textBaseline='alphabetic';
      const titleFs=Math.round(30*ui), keyFs=Math.round(17*ui), lblFs=Math.round(16*ui);
      // determine needed width
      let needW=0;
      ctx.font='bold '+titleFs+'px '+FONT; needW=Math.max(needW, ctx.measureText(t('❓ Hogyan játssz?')).width);
      for(const r of rows){
        ctx.font='bold '+keyFs+'px '+FONT; const kw=ctx.measureText(r[0]).width;
        ctx.font=lblFs+'px '+FONT; const lw=ctx.measureText(r[1]).width;
        needW=Math.max(needW, kw+18*ui+lw);
      }
      const pad=22*ui;
      const cardW=Math.min(C.VIEW_W*0.92, needW+pad*2+90*ui);
      const rowH=Math.round(40*ui);
      const cardH=Math.round(titleFs+18*ui + rows.length*rowH + 30*ui + pad*2);
      const cx=C.VIEW_W/2, cardX=cx-cardW/2, cardY=Math.round(C.VIEW_H/2-cardH/2);

      // panel
      ctx.fillStyle='rgba(0,0,0,0.35)'; rr(ctx,cardX+4*ui,cardY+5*ui,cardW,cardH,18*ui); ctx.fill();
      ctx.fillStyle='rgba(14,22,32,0.97)'; rr(ctx,cardX,cardY,cardW,cardH,18*ui); ctx.fill();
      ctx.strokeStyle='#E8711A'; ctx.lineWidth=2.5*ui; rr(ctx,cardX,cardY,cardW,cardH,18*ui); ctx.stroke(); ctx.lineWidth=1;

      // title
      let yy=cardY+pad+titleFs*0.8;
      ctx.textAlign='center'; ctx.font='bold '+titleFs+'px '+FONT; ctx.fillStyle='#fff7e6';
      ctx.fillText(t('❓ Hogyan játssz?'), cx, yy);
      yy+=titleFs*0.5+16*ui;

      // rows — left-aligned keys column, label to its right
      const keyX=cardX+pad;
      const lblX=cardX+pad+92*ui;
      ctx.textBaseline='middle';
      for(const r of rows){
        const ry=yy+rowH/2;
        ctx.textAlign='left'; ctx.font='bold '+keyFs+'px '+FONT; ctx.fillStyle='#E8711A';
        ctx.fillText(r[0], keyX, ry);
        ctx.font=lblFs+'px '+FONT; ctx.fillStyle='#dfe7ee';
        ctx.fillText(r[1], lblX, ry);
        yy+=rowH;
      }

      // close hint
      ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      ctx.font=(14*ui)+'px '+FONT; ctx.fillStyle='#9fc0d2';
      ctx.fillText(IS_TOUCH ? t('Koppints a bezáráshoz') : t('Kattints vagy Esc a bezáráshoz'),
        cx, cardY+cardH-pad);
      ctx.restore();

      // single full-screen hit-rect: a tap/click ANYWHERE closes the card. Reuses the
      // canvas pointer path (line ~929 pause hudBtns loop) — no listeners, no leak.
      hudBtns.push({ id:'pausehelpclose', x:0, y:0, w:C.VIEW_W, h:C.VIEW_H,
        act:()=>{ pauseHelp=false; } });
    },

    /* ---------- game over / VICTORY screen (#34) ---------- */
    _gameOver(ctx){
      const ui=metrics().ui;
      const reduced=!!(CA.settings&&CA.settings.reducedMotion);
      // WIN vs LOSE split: did a HUMAN (non-AI) team take the win? On a draw
      // (no winner) we treat it as a non-victory, somber screen.
      const won=(S.teams||[]).some(function(tm){ return tm.id===S.winnerTeamId && !tm.isAI; });
      // cool/muted backdrop on a loss, warm-dark on a win
      ctx.fillStyle=won?'rgba(8,16,24,0.78)':'rgba(14,16,26,0.86)'; ctx.fillRect(0,0,C.VIEW_W,C.VIEW_H);
      hudBtns=[];
      const w=CA.getTeam(S.winnerTeamId);
      ctx.textAlign='center';
      // measure-and-shrink: pick the largest bold font (≤px) at which `str` fits
      // `maxW`, so long Hungarian team names / labels don't overflow on small
      // screens. (#gameover-overflow)
      const fitFont=function(str, px, maxW){
        let f=px;
        for(let k=0;k<24;k++){
          ctx.font='bold '+f+'px '+FONT;
          if(ctx.measureText(str).width<=maxW || f<=11) break;
          f-=Math.max(1, f*0.06);
        }
        return f;
      };

      // ---- celebratory confetti, fired ONCE — ONLY on a human win ----
      if(!victoryShown){
        victoryShown=true;
        if(won && w && CA.FX && CA.FX.confetti){
          try{
            CA.FX.confetti(C.VIEW_W*0.5, C.VIEW_H*0.22, reduced?20:60);
            if(!reduced){
              CA.FX.confetti(C.VIEW_W*0.25, C.VIEW_H*0.30, 36);
              CA.FX.confetti(C.VIEW_W*0.75, C.VIEW_H*0.30, 36);
            }
          }catch(_){}
        }
      }

      let y=C.VIEW_H*0.15;
      if(won){
        // ---- VICTORY: celebratory banner ----
        ctx.font='bold '+(26*ui)+'px '+FONT; ctx.fillStyle='#ffd76a';
        ctx.fillText(t('🏆 Vége a meccsnek!'), C.VIEW_W/2, y); y+=52*ui;
        // a small celebratory flourish line above the winner (skipped if reduced)
        // big winner line: "🏆 <Csapatnév> csapata győzött!"
        { const _wl=w?('🏆 '+t(w.name)+t(' csapata győzött!')):t('Győzelem!');
          ctx.font='bold '+fitFont(_wl, 46*ui, C.VIEW_W-28*ui)+'px '+FONT; ctx.fillStyle=w?w.color:'#fff';
          ctx.fillText(_wl, C.VIEW_W/2, y); } y+=44*ui;
        ctx.font='bold '+(20*ui)+'px '+FONT; ctx.fillStyle='#ffe9a8';
        ctx.fillText(reduced?t('Győzelem!'):t('🎉 Bajnok! 🎉'), C.VIEW_W/2, y); y+=34*ui;
      } else {
        // ---- DEFEAT: somber, cool palette, no trophy, encouraging line ----
        ctx.font='bold '+(26*ui)+'px '+FONT; ctx.fillStyle='#9fb4c8';
        ctx.fillText(t('Vége a meccsnek'), C.VIEW_W/2, y); y+=52*ui;
        { const _dl=S.winnerTeamId==null?t('🤝 Döntetlen'):t('💀 Vereség');
          ctx.font='bold '+fitFont(_dl, 46*ui, C.VIEW_W-28*ui)+'px '+FONT; ctx.fillStyle='#c7d2dc';
          ctx.fillText(_dl, C.VIEW_W/2, y); } y+=44*ui;
        ctx.font=(19*ui)+'px '+FONT; ctx.fillStyle='#8fa6ba';
        ctx.fillText(t('Sebaj — a következő meccs a tiéd lesz!'), C.VIEW_W/2, y); y+=34*ui;
      }

      // ---- "X vs Y" matchup header (#gameover-matchup) ----
      // Show WHO played WHOM: each team as its emoji + name in its own colour.
      // 2 teams → "A vs B" (centered, measure-fit). 3+ teams (FFA) → a compact
      // single line of all teams joined by " · ". Falls back silently if absent.
      (function(){
        const teams=(S.teams||[]).filter(function(tm){ return !!tm; });
        if(teams.length<2) return;
        const emoOf=function(tm){
          const k=tm.kind||tm.species;
          return (k==='worm') ? '🪱' : '🐹';
        };
        const maxW=C.VIEW_W-28*ui;
        ctx.textAlign='center'; ctx.textBaseline='alphabetic';
        if(teams.length===2){
          // segments: [A] [ vs ] [B] — fit the whole line to width, then draw
          // each segment in its own colour, centered as a group.
          const a=teams[0], b=teams[1];
          const sa=emoOf(a)+' '+t(a.name), vs=t(' vs '), sb=emoOf(b)+' '+t(b.name);
          const fs=fitFont(sa+vs+sb, 22*ui, maxW);
          ctx.font='bold '+fs+'px '+FONT;
          const wa=ctx.measureText(sa).width, wv=ctx.measureText(vs).width, wb=ctx.measureText(sb).width;
          let dx=C.VIEW_W/2-(wa+wv+wb)/2;
          ctx.textAlign='left';
          ctx.fillStyle=a.color||'#fff';      ctx.fillText(sa, dx, y); dx+=wa;
          ctx.fillStyle='#9fb4c8';            ctx.fillText(vs, dx, y); dx+=wv;
          ctx.fillStyle=b.color||'#fff';      ctx.fillText(sb, dx, y); dx+=wb;
          ctx.textAlign='center';
          y+=30*ui;
        } else {
          // FFA / 3+ teams: compact " · "-joined list, fit to width.
          const parts=teams.map(function(tm){ return emoOf(tm)+' '+t(tm.name); });
          const line=parts.join('  ·  ');
          const fs=fitFont(line, 19*ui, maxW);
          ctx.font='bold '+fs+'px '+FONT;
          // draw each part in its colour, separators in neutral grey, centered.
          const sep='  ·  ';
          const ws=parts.map(function(p){ return ctx.measureText(p).width; });
          const wsep=ctx.measureText(sep).width;
          let total=0; for(let i=0;i<ws.length;i++){ total+=ws[i]; if(i<ws.length-1) total+=wsep; }
          let dx=C.VIEW_W/2-total/2;
          ctx.textAlign='left';
          for(let i=0;i<parts.length;i++){
            ctx.fillStyle=teams[i].color||'#fff'; ctx.fillText(parts[i], dx, y); dx+=ws[i];
            if(i<parts.length-1){ ctx.fillStyle='#9fb4c8'; ctx.fillText(sep, dx, y); dx+=wsep; }
          }
          ctx.textAlign='center';
          y+=28*ui;
        }
      })();

      // ---- match stats + MVP (guard if absent) ----
      const ms=(CA.Meta&&CA.Meta.matchStats)?CA.Meta.matchStats():null;
      if(ms){
        let totalKills=0, bestTeam=null, bestKills=-1;
        for(const k in ms.kills){ if(ms.kills.hasOwnProperty(k)){
          totalKills+=ms.kills[k];
          if(ms.kills[k]>bestKills){ bestKills=ms.kills[k]; bestTeam=k; }
        } }
        const shots=ms.shots||0;
        // accuracy: prefer an explicit field, else derive hits/shots if present
        let acc=null;
        if(typeof ms.accuracy==='number') acc=ms.accuracy;
        else if(typeof ms.hits==='number' && shots>0) acc=ms.hits/shots;
        const combo=ms.biggestCombo||ms.bestCombo||ms.maxCombo||null;
        // MVP: prefer an explicit ms.mvp (unit/team), else the top-kill team.
        let mvpName=null;
        if(ms.mvp){ mvpName=ms.mvp.name||(ms.mvp.team&&CA.getTeam(ms.mvp.team)&&CA.getTeam(ms.mvp.team).name)||ms.mvp; }
        else if(bestTeam!=null && bestKills>0){ const bt=CA.getTeam(bestTeam); mvpName=bt?bt.name:null; }
        if(mvpName){
          ctx.font='bold '+(20*ui)+'px '+FONT; ctx.fillStyle='#ffd76a';
          ctx.fillText(t('⭐ MVP: ')+mvpName+(bestKills>0?(' ('+bestKills+t(' kill)')):''), C.VIEW_W/2, y);
          y+=30*ui;
        }
        // stat line: kills · shots · (accuracy) · (combo)
        let stat=t('☠ Killek: ')+totalKills+'    '+t('🎯 Lövések: ')+shots;
        if(acc!=null) stat+='    '+t('🎯 Pontosság: ')+Math.round(acc*100)+'%';
        if(combo)     stat+='    '+t('🔥 Kombó: ×')+combo;
        ctx.font=(18*ui)+'px '+FONT; ctx.fillStyle='#cfe6f2';
        ctx.fillText(stat, C.VIEW_W/2, y);
        y+=34*ui;
      }
      if(CA.Meta&&CA.Meta.profile){
        const p=CA.Meta.profile;
        ctx.font=(18*ui)+'px '+FONT; ctx.fillStyle='#bfe0f0';
        ctx.fillText(t('⬆️ Szint ')+p.level+'   ·   '+(p.xp||0)+' XP', C.VIEW_W/2, y);
        y+=20*ui;
        if(CA.Meta.xpForLevel){
          const cur=CA.Meta.xpForLevel(p.level), nxt=CA.Meta.xpForLevel(p.level+1);
          const frac=nxt>cur?U.clamp(((p.xp||0)-cur)/(nxt-cur),0,1):0;
          const bw=300*ui, bx=C.VIEW_W/2-bw/2, by=y+8*ui;
          ctx.fillStyle='rgba(255,255,255,0.12)'; rr(ctx,bx,by,bw,10*ui,5*ui); ctx.fill();
          ctx.fillStyle='#3fa45a'; rr(ctx,bx,by,bw*frac,10*ui,5*ui); ctx.fill();
          y+=28*ui;
        }
      }

      // ---- campaign star rating + objective checklist (#3) ----
      // Rendered only when the modes agent stashed a result on the state:
      //   CA.state.campaignResult = { level, stars:0..3, objectives:[{label,ok}] }
      // Absent on a normal (non-campaign) match → nothing extra drawn.
      const cr=S.campaignResult;
      if(cr && typeof cr==='object'){
        const earned=U.clamp(cr.stars|0,0,3);
        // three stars centered, filled up to `earned` (gold) else dim outline.
        const sSz=34*ui, sGap=10*ui, sTot=3*sSz+2*sGap;
        let sx=C.VIEW_W/2-sTot/2; const sy=y+sSz*0.5;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        for(let s=0;s<3;s++){
          const lit=s<earned;
          ctx.font=(sSz)+'px '+FONT;
          ctx.fillStyle=lit?'#ffd05a':'rgba(255,255,255,0.22)';
          ctx.fillText(lit?'⭐':'☆', sx+sSz/2, sy);
          sx+=sSz+sGap;
        }
        ctx.textBaseline='alphabetic';
        y+=sSz+10*ui;
        // objective checklist (each {label, ok}); ok→green check, else grey cross
        if(Array.isArray(cr.objectives)){
          ctx.font=(15*ui)+'px '+FONT; ctx.textAlign='center';
          for(let o=0;o<cr.objectives.length;o++){
            const ob=cr.objectives[o]; if(!ob) continue;
            const ok=!!ob.ok;
            ctx.fillStyle=ok?'#7fd18a':'#9aa6b2';
            ctx.fillText((ok?'✅ ':'⬜ ')+t(ob.label||''), C.VIEW_W/2, y);
            y+=21*ui;
          }
          y+=6*ui;
        }
      }

      // ---- re-engagement tease (#reengage) ----
      // The single highest-value re-engagement moment: pull a REAL progress hint
      // from CA.Meta (next achievement-ish challenge, coin balance, or season-tier
      // progress) so the player sees a concrete, near-term reward to come back for.
      // Falls back to a generic encouraging line. All reads are guarded — never throws.
      (function(){
        let line=null;
        try{
          const Meta=CA.Meta;
          if(Meta){
            // 1) nearest unfinished challenge with measurable progress → "🏅 N to the next challenge"
            let chList=null;
            try{ if(typeof Meta.activeChallenges==='function') chList=Meta.activeChallenges(); }catch(_){}
            if(!chList){ try{ if(typeof Meta.challenges==='function') chList=Meta.challenges(); }catch(_){} }
            if(Array.isArray(chList)){
              let best=null, bestRem=Infinity;
              for(let i=0;i<chList.length;i++){
                const c=chList[i]; if(!c||c.done) continue;
                const g=+c.goal||0, pr=+c.progress||0;
                if(g>0 && pr<g){ const rem=g-pr; if(rem<bestRem){ bestRem=rem; best=c; } }
              }
              if(best){
                if(/win|győz|nyer/i.test(best.kind||best.id||best.desc||'') && bestRem<=3){
                  line=(bestRem===1)?t('🎁 még 1 győzelem a következő jutalomig')
                                    :(t('🎁 még ')+bestRem+t(' győzelem a következő jutalomig'));
                } else {
                  line=t('🏅 ')+bestRem+t(' a következő kihíváshoz');
                }
              }
            }
            // 2) season-tier XP to next locked tier → "🎖 N XP to next season tier"
            if(!line && typeof Meta.seasonTiers==='function'){
              let tiers=null; try{ tiers=Meta.seasonTiers(); }catch(_){}
              const sx=(Meta.profile&&+Meta.profile.seasonXP)||0;
              if(Array.isArray(tiers)){
                for(let i=0;i<tiers.length;i++){
                  const tr=tiers[i];
                  if(tr && !tr.unlocked && +tr.xp>sx){ line=t('🎖 még ')+((+tr.xp)-sx)+t(' XP a következő szezon-szinthez'); break; }
                }
              }
            }
            // 3) coin balance to spend → "⭐ N coins waiting to be collected"
            if(!line && typeof Meta.coins==='function'){
              let c=0; try{ c=Meta.coins()||0; }catch(_){}
              if(c>0) line=t('⭐ ')+c+t(' érme vár begyűjtésre');
            }
          }
        }catch(_){ line=null; }
        if(!line) line=t('🔥 Játssz tovább — minden meccs közelebb visz a jutalomhoz!');
        ctx.textAlign='center'; ctx.textBaseline='alphabetic';
        const teaseFs=fitFont(line, 18*ui, C.VIEW_W-32*ui);
        ctx.font='bold '+teaseFs+'px '+FONT; ctx.fillStyle='#ffd76a';
        ctx.fillText(line, C.VIEW_W/2, y);
        y+=30*ui;
      })();

      // buttons
      const nextLevel=(S.modeData&&S.modeData.nextLevel)||null;
      const campaignDone=!!(S.modeData&&S.modeData.campaignComplete);
      const btnY=Math.max(y+10*ui, C.VIEW_H/2+30*ui);
      const bh=54*ui, gap=18*ui;
      // count: Újra + Menü + (Következő?) + Megosztás
      // POKI build hides Share (no external squeakanddestroy.com link — Poki policy).
      const _pokiBuild = (typeof window!=='undefined' && window.CA_PORTAL==='poki');
      let count=(_pokiBuild?2:3) + ((nextLevel && !campaignDone)?1:0);
      const maxRow=C.VIEW_W-28*ui;
      // 2×2 GRID on narrow phones (#gameover-2x2): laying 4 (or 3) buttons in a
      // single row squeezes them so "Megosztás" got ellipsised to "Meg…". On touch +
      // a narrow viewport, lay them out as a 2-column grid so the labels stay
      // readable. Desktop / wide stays a single 1×N row.
      const NARROW = IS_TOUCH && C.VIEW_W < 620*ui;
      const grid = NARROW && count>=3;
      let cols, rows, bw, gridX0, gridY0;
      if(grid){
        cols=2; rows=Math.ceil(count/cols);
        bw=Math.min(260*ui, (maxRow-(cols-1)*gap)/cols);
        const totalW=cols*bw+(cols-1)*gap;
        gridX0=C.VIEW_W/2-totalW/2; gridY0=btnY;
      } else {
        // single row: shrink the button width so the whole row always fits the
        // viewport (with a small margin) — keeps the row on-screen on narrow phones.
        bw=Math.min(230*ui, (maxRow-(count-1)*gap)/count);
        const totalW=count*bw+(count-1)*gap;
        gridX0=C.VIEW_W/2-totalW/2; gridY0=btnY;
      }
      let bIdx=0;
      const mk=(label,col,act)=>{
        let bxp, byp;
        if(grid){
          const c=bIdx%cols, r=(bIdx/cols)|0;
          // center a lone trailing button on the last row (e.g. 3 buttons → bottom row has 1)
          const rowCount=Math.min(cols, count-r*cols);
          const rowW=rowCount*bw+(rowCount-1)*gap;
          const rowX0=C.VIEW_W/2-rowW/2;
          bxp=rowX0+(c)*(bw+gap); byp=gridY0+r*(bh+gap);
        } else {
          bxp=gridX0+bIdx*(bw+gap); byp=gridY0;
        }
        const b={x:bxp,y:byp,w:bw,h:bh,act};
        ctx.fillStyle='rgba(0,0,0,0.3)'; rr(ctx,b.x+3,b.y+4,b.w,b.h,16*ui); ctx.fill();
        ctx.fillStyle=col; rr(ctx,b.x,b.y,b.w,b.h,16*ui); ctx.fill();
        ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
        // shrink the label font to fit the (possibly narrow) button, then truncate
        // with an ellipsis as a last resort so long labels never spill out. (#gameover-overflow)
        const inner=bw-16*ui;
        let fs=fitFont(label, 23*ui, inner), lbl=label;
        if(ctx.measureText(lbl).width>inner){
          while(lbl.length>1 && ctx.measureText(lbl+'…').width>inner) lbl=lbl.slice(0,-1);
          lbl+='…';
        }
        ctx.font='bold '+fs+'px '+FONT;
        ctx.fillText(lbl, b.x+b.w/2, b.y+b.h/2); ctx.textBaseline='alphabetic';
        hudBtns.push(b); bIdx++;
      };
      // 🔄 Újra: replay the SAME setup. Prefer the opts stashed at game start
      // (exact same teams/options), else reconstruct from the live state.
      mk(t('🔄 Újra'), '#3fa45a', ()=>{ unlockAudio(); victoryShown=false;
        // puzzle/challenge retry MUST re-arm through its own start() — a raw
        // newGame replay ran unrestricted & unscored (stars never granted, so
        // the next puzzle stayed locked).
        try{
          if(_lastRunKind && _lastRunKind.puzzle!=null && CA.Puzzles && CA.Puzzles.start){
            if(CA.Puzzles.start(_lastRunKind.puzzle)) return;
          }
          if(_lastRunKind && _lastRunKind.challenge && CA.Challenge && CA.Challenge.start){
            if(CA.Challenge.start(_lastRunKind.challenge)) return; // daily one-shot may refuse -> fall through
          }
        }catch(_){}
        CA.newGame(lastNewGameOpts || buildReplayOpts()); });
      if(nextLevel && !campaignDone){
        mk(t('▶ Következő'), '#e0a93f', ()=>{ unlockAudio(); victoryShown=false;
          CA.newGame({ gameMode:'campaign', level:nextLevel }); });
      }
      mk(t('🏠 Menü'), '#8a6db0', ()=>{ S.mode=G.MENU; screen='main'; victoryShown=false;
        if(CA.Audio&&CA.Audio.stop)CA.Audio.stop(); });
      // 📤 Megosztás: prefer a short gameplay CLIP (CA.Share → WebM on desktop, PNG
      // "brag card" fallback on iOS); if the module is missing, fall back to the
      // single-frame PNG screenshot. Entirely best-effort, never throws.
      // SKIPPED on the Poki build (its brag card carries an external site URL,
      // which portals disallow — keep the player on Poki).
      if(!_pokiBuild) mk(t('📤 Megosztás'), '#3f86a4', ()=>{
        try{ if(CA.Share && CA.Share.shareClip){ CA.Share.shareClip(); return; } }catch(_){}
        shareScreenshot();
      });

      // mute corner
      const bsz=42*ui;
      const mb={id:'mute', x:C.VIEW_W-bsz-14*ui, y:14*ui, w:bsz, h:bsz, act:()=>toggleMute()};
      ctx.fillStyle='rgba(0,0,0,0.4)'; rr(ctx,mb.x,mb.y,mb.w,mb.h,10*ui); ctx.fill();
      ctx.font=(20*ui)+'px '+FONT; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText((CA.Audio&&CA.Audio.muted)?'🔇':'🔊', mb.x+mb.w/2, mb.y+mb.h/2); ctx.textBaseline='alphabetic';
      hudBtns.push(mb);
    },

    /* ---------- achievement toasts ---------- */
    // Jani: az achievement-kiírás FENT, a homokóra alatt jelenjen meg és ott
    // tűnjön el (felső-közép) — eddig jobb oldalon, a roster alatt volt.
    // `anchorTop` = a homokóra+szél blokk alja (render adja át); felülről lecsúszik.
    _toasts(ctx, M, anchorTop){
      if(!(CA.Meta && Array.isArray(CA.Meta.toasts)) || !CA.Meta.toasts.length) return;
      const list=CA.Meta.toasts;
      const ui=(M&&M.ui)||metrics().ui;
      // STAGGER: show at most MAXV at once (FIFO from the front); the rest WAIT.
      const MAXV=2, th=52*ui;
      const tw=Math.min(320*ui, C.VIEW_W-32*ui);
      const cx=C.VIEW_W/2;                          // FELSŐ-KÖZÉP
      const top=(typeof anchorTop==='number'?anchorTop:92)+6*ui;
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      const n=Math.min(MAXV, list.length);
      for(let slot=0; slot<n; slot++){
        const t=list[slot];                 // front of the queue = oldest, shown first
        if(t.t==null) t.t=3.0;
        t.t-=1/60;
        const appear=U.clamp((3.0-t.t)/0.25,0,1);     // slide-in (felülről)
        const fade=U.clamp(t.t/0.4,0,1);              // fade-out
        const a=Math.max(0,Math.min(appear,fade));
        // lefelé csúszik be a homokóra alól, és ott halványul el
        const y=top+slot*(th+8*ui) - (1-appear)*18*ui;
        const sx=cx-tw/2;
        ctx.globalAlpha=a;
        ctx.fillStyle='rgba(20,30,42,0.92)'; rr(ctx,sx,y,tw,th,12*ui); ctx.fill();
        ctx.fillStyle='#ffd76a'; rr(ctx,sx,y,6*ui,th,3*ui); ctx.fill();
        ctx.font=(26*ui)+'px '+FONT; ctx.textAlign='left'; ctx.fillStyle='#fff';
        ctx.fillText(t.icon||'⭐', sx+16*ui, y+th/2+9*ui);
        ctx.font='bold '+(16*ui)+'px '+FONT; ctx.fillStyle='#fff7e6';
        ctx.fillText(CA.t(t.text)||'', sx+52*ui, y+th/2+6*ui);
        ctx.globalAlpha=1;
      }
      // cull expired from the FRONT (so the next queued toast slides in)
      while(list.length && list[0].t!=null && list[0].t<=0) list.shift();
    },

    /* ---------- top-center toast stack (#7/#8: combo/crit/toast) ---------- */
    _centerToasts(ctx, M){
      if(!toastQueue.length) return;
      const ui=(M&&M.ui)||metrics().ui;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      // advance + cull
      for(let i=toastQueue.length-1;i>=0;i--){
        const t=toastQueue[i];
        t.t+=1/60;
        if(t.t>=t.life){ toastQueue.splice(i,1); }
      }
      // draw newest at the top, older ones stacked below, fading out
      const cx=C.VIEW_W/2;
      // Anchor BELOW the wind indicator (which itself sits below the hourglass), not a
      // fixed 70*ui — on notched/landscape phones the hourglass+wind sit lower and the
      // old constant Y made the center toasts overlap them. Mirror render()'s layout:
      //   hourglass top = padTop, height cs(=36*ui); wind label at padTop+cs+10*ui,
      //   wind bar = +7*ui offset, +9*ui height. (#center-toast-overlap)
      const padTop = 12*ui + Math.round(safeAreaTopCss()*((M&&M.dpr)||1)) + 5*ui;
      // wind block: bar at windCy+2*ui (h 9*ui), then the SZÉL label ~15*ui below it.
      const cs=(IS_TOUCH?36*0.7:36)*ui, windCy=padTop+cs+10*ui, windBottom=windCy+2*ui+9*ui+18*ui;
      let y=Math.round(Math.max(70*ui, windBottom+14*ui));
      for(let i=toastQueue.length-1;i>=0;i--){
        const t=toastQueue[i];
        const appear=U.clamp(t.t/0.15,0,1);
        const fade=U.clamp((t.life-t.t)/0.3,0,1);
        const a=Math.min(appear,fade);
        const rise=(1-appear)*10*ui;
        ctx.font='bold '+(20*ui)+'px '+FONT;
        const tw=ctx.measureText(t.text).width;
        const pw=tw+28*ui, ph=34*ui, px=cx-pw/2, py=y-ph/2-rise;
        ctx.globalAlpha=a*0.92;
        ctx.fillStyle='rgba(20,30,42,0.92)'; rr(ctx,px,py,pw,ph,12*ui); ctx.fill();
        ctx.strokeStyle='rgba(255,221,106,0.7)'; ctx.lineWidth=2; rr(ctx,px,py,pw,ph,12*ui); ctx.stroke(); ctx.lineWidth=1;
        ctx.globalAlpha=a;
        ctx.fillStyle='#fff7e6'; ctx.fillText(t.text, cx, py+ph/2+1);
        ctx.globalAlpha=1;
        y+=ph+8*ui;
      }
      ctx.textBaseline='alphabetic';
    },

    /* ---------- "your turn" handoff banner (HUD juice) ---------- */
    // ~0.9s centered banner tinted with the active team color. Pure overlay —
    // never blocks input, fades in/out, self-culls.
    _turnBanner(ctx, M){
      if(!turnBanner) return;
      const ui=(M&&M.ui)||metrics().ui;
      turnBanner.t+=1/60;
      if(turnBanner.t>=turnBanner.life){ turnBanner=null; return; }
      const tb=turnBanner;
      const appear=U.clamp(tb.t/0.18,0,1);
      const fade=U.clamp((tb.life-tb.t)/0.3,0,1);
      const a=Math.min(appear,fade);
      const cx=C.VIEW_W/2, cy=Math.round(C.VIEW_H*0.34);
      const rise=(1-appear)*14*ui;
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font='bold '+(28*ui)+'px '+FONT;
      const tw=ctx.measureText(tb.text).width;
      const pw=tw+44*ui, ph=54*ui, px=cx-pw/2, py=cy-ph/2-rise;
      ctx.globalAlpha=a*0.9;
      ctx.fillStyle='rgba(12,18,28,0.86)'; rr(ctx,px,py,pw,ph,16*ui); ctx.fill();
      ctx.strokeStyle=tb.color; ctx.lineWidth=3*ui; rr(ctx,px,py,pw,ph,16*ui); ctx.stroke(); ctx.lineWidth=1;
      // team-color accent bar on the left edge — clip to the banner's rounded
      // shape and paint a PLAIN rect, so the bar's left corners follow the
      // banner radius and its right edge is a single clean straight line. The
      // old rr(...8*ui...,16*ui) drew an 8px-wide rounded rect whose own corners
      // poked out a stray notch/line on the left edge. (#turnbanner-leftedge)
      ctx.save();
      rr(ctx,px,py,pw,ph,16*ui); ctx.clip();
      ctx.fillStyle=tb.color; ctx.fillRect(px, py, 8*ui, ph);
      ctx.restore();
      ctx.globalAlpha=a;
      ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillText(tb.text, cx+2*ui, py+ph/2+2*ui);
      ctx.fillStyle=tb.color;          ctx.fillText(tb.text, cx, py+ph/2);
      ctx.restore();
      ctx.globalAlpha=1; ctx.textBaseline='alphabetic';
    },

    /* ---------- kill-cam banner (touch only) — drawn LOWER (#killcam-clipped) ----
     * Mirrors core.js's alpha curve (S.killcam.t runs 78→0) but pins the pill BELOW
     * the top safe-area strip so the notch never clips it on phones. */
    _killCamBanner(ctx, M){
      const kc=S.killcam; if(!kc || kc.t<=0) return;
      const ui=(M&&M.ui)||metrics().ui;
      const a=Math.min(1, kc.t/20)*Math.min(1,(78-kc.t)/8);
      if(a<=0) return;
      // clear the notch/status-bar: start below the safe-area top inset + a margin.
      const safeTop=Math.round(safeAreaTopCss()*((M&&M.dpr)||1));
      const cx=C.VIEW_W/2;
      const fs=Math.round(20*ui);
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font='bold '+fs+'px '+FONT;
      const label='💀 '+t('KILL-CAM');
      const tw=ctx.measureText(label).width;
      const pw=tw+34*ui, ph=40*ui;
      const px=cx-pw/2, py=safeTop+10*ui;
      ctx.globalAlpha=a*0.85;
      ctx.fillStyle='rgba(8,10,16,0.9)'; rr(ctx,px,py,pw,ph,12*ui); ctx.fill();
      ctx.strokeStyle='rgba(255,212,90,0.9)'; ctx.lineWidth=2*ui; rr(ctx,px,py,pw,ph,12*ui); ctx.stroke(); ctx.lineWidth=1;
      ctx.globalAlpha=a;
      ctx.fillStyle='#ffd45a'; ctx.fillText(label, cx, py+ph/2);
      ctx.restore();
      ctx.globalAlpha=1; ctx.textBaseline='alphabetic';
    },

    /* ---------- puzzle objective banner (#puzzle-objective) ----------
     * When a Fejtörő (S._puzzle) starts, tell the player WHAT TO DO: a centered
     * banner (name + goal + par + hint) for a few seconds, then a small persistent
     * hint chip near the top. All strings localize via CA.t(). Fields are read from
     * CA.Puzzles._defs by id (name / par / hint / enemyCount). */
    _puzzleBanner(ctx, M){
      const ui=(M&&M.ui)||metrics().ui;
      const pz=S._puzzle; if(!pz) return;
      // re-arm the banner whenever a new puzzle begins
      if(_puzzleBannerId!==pz.id){ _puzzleBannerId=pz.id; _puzzleBannerT=0; }
      _puzzleBannerT+=1/60;
      // look up the rich definition (name / hint / enemyCount) by id
      let def=null;
      try{ const defs=(CA.Puzzles&&CA.Puzzles._defs)||[]; for(let i=0;i<defs.length;i++){ if(defs[i].id===pz.id){ def=defs[i]; break; } } }catch(_){}
      const par=Math.max(1, pz.par|0||1);
      const name=def&&def.name?t(def.name):t('🧩 Fejtörő');
      const goal=t('Győzd le az összes ellenfelet');
      const parLine=t('🎯 Cél: ')+par+t(' lövésből');
      const hint=def&&def.hint?(t('💡 ')+t(def.hint)):'';

      const FULL=8.4;                       // seconds the big banner stays up (2× — Jani: nem volt idő elolvasni)
      const cx=C.VIEW_W/2;
      const safeTop=Math.round(safeAreaTopCss()*((M&&M.dpr)||1));

      if(_puzzleBannerT<FULL){
        // ----- big centered intro banner -----
        const appear=U.clamp(_puzzleBannerT/0.25,0,1);
        const fade=U.clamp((FULL-_puzzleBannerT)/0.5,0,1);
        const a=Math.min(appear,fade);
        const maxW=Math.min(C.VIEW_W*0.9, 560*ui);
        // wrap the hint to fit the card width
        ctx.font=(14*ui)+'px '+FONT;
        const hintLines=hint?wrapText(ctx, hint, maxW-40*ui):[];
        const titleH=30*ui, goalH=22*ui, parH=20*ui, lineH=18*ui;
        const ph=18*ui + titleH + goalH + parH + (hintLines.length?(8*ui+hintLines.length*lineH):0) + 14*ui;
        const pw=maxW;
        const px=cx-pw/2, py=Math.max(safeTop+12*ui, C.VIEW_H*0.16);
        ctx.save();
        ctx.globalAlpha=a;
        ctx.fillStyle='rgba(12,18,28,0.9)'; rr(ctx,px,py,pw,ph,16*ui); ctx.fill();
        ctx.strokeStyle='#e0a93f'; ctx.lineWidth=3*ui; rr(ctx,px,py,pw,ph,16*ui); ctx.stroke(); ctx.lineWidth=1;
        ctx.textAlign='center'; ctx.textBaseline='alphabetic';
        let ty=py+14*ui+titleH*0.6;
        ctx.font='bold '+(22*ui)+'px '+FONT; ctx.fillStyle='#ffd76a'; ctx.fillText('🧩 '+name, cx, ty); ty+=goalH+2*ui;
        ctx.font=(16*ui)+'px '+FONT; ctx.fillStyle='#cfe6f2'; ctx.fillText(goal, cx, ty); ty+=parH;
        ctx.font='bold '+(15*ui)+'px '+FONT; ctx.fillStyle='#9fe0b0'; ctx.fillText(parLine, cx, ty); ty+=10*ui;
        if(hintLines.length){
          ctx.font=(14*ui)+'px '+FONT; ctx.fillStyle='#e6d6bf';
          for(let i=0;i<hintLines.length;i++){ ty+=lineH; ctx.fillText(hintLines[i], cx, ty); }
        }
        ctx.restore();
        ctx.globalAlpha=1; ctx.textBaseline='alphabetic';
      } else {
        // ----- small persistent hint chip (top-center, under the hourglass row) -----
        const label=parLine;
        ctx.save();
        ctx.font='bold '+(13*ui)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
        const tw=ctx.measureText(label).width;
        const pw=tw+22*ui, ph=26*ui, py=safeTop+76*ui, px=cx-pw/2;
        ctx.globalAlpha=0.92;
        ctx.fillStyle='rgba(12,18,28,0.7)'; rr(ctx,px,py,pw,ph,10*ui); ctx.fill();
        ctx.strokeStyle='rgba(224,169,63,0.7)'; ctx.lineWidth=1.5*ui; rr(ctx,px,py,pw,ph,10*ui); ctx.stroke(); ctx.lineWidth=1;
        ctx.fillStyle='#ffd76a'; ctx.fillText(label, cx, py+ph/2);
        ctx.restore();
        ctx.globalAlpha=1; ctx.textBaseline='alphabetic';
      }
    },

    /* ---------- mode-intro banner (#mode-intro) ----------
     * On every fresh match (any mode) flash a centered card with the mode's
     * ICON + name and a one-line objective ("mit kell csinálni"), for ~4s.
     * Mirrors the puzzle-banner look (same card / appear-fade curve). Armed by
     * armModeIntro() on the 'gameStart' event; never shown over a puzzle. */
    _modeIntroBanner(ctx, M){
      const ui=(M&&M.ui)||metrics().ui;
      _modeIntroT+=1/60;
      if(_modeIntroT>=MODE_INTRO_LIFE){ _modeIntroT=-1; return; }
      const mode=(S&&S.gameMode)||'classic';
      const def=MODE_INTRO[mode]||MODE_INTRO.classic;
      const title=(def.icon||'')+' '+t(def.name);
      const goal=t(def.goal);

      const cx=C.VIEW_W/2;
      const safeTop=Math.round(safeAreaTopCss()*((M&&M.dpr)||1));
      const appear=U.clamp(_modeIntroT/0.25,0,1);
      const fade=U.clamp((MODE_INTRO_LIFE-_modeIntroT)/0.5,0,1);
      const a=Math.min(appear,fade);
      const maxW=Math.min(C.VIEW_W*0.9, 560*ui);

      // wrap the objective to the card width
      ctx.font=(15*ui)+'px '+FONT;
      const goalLines=goal?wrapText(ctx, goal, maxW-40*ui):[];
      const titleH=30*ui, goalLineH=20*ui;
      const ph=18*ui + titleH + (goalLines.length?(10*ui+goalLines.length*goalLineH):0) + 14*ui;
      const pw=maxW;
      // Jani (mobil): a mód-banner FÜGGŐLEGESEN is középre — eddig a felső 16%-nál
      // ült, és rálógott a HUD-ra (homokóra/roster/szél). Desktopon marad fent.
      const px=cx-pw/2;
      const py=IS_TOUCH ? Math.round((C.VIEW_H-ph)/2 - C.VIEW_H*0.04)
                        : Math.max(safeTop+12*ui, C.VIEW_H*0.16);
      ctx.save();
      ctx.globalAlpha=a;
      ctx.fillStyle='rgba(12,18,28,0.9)'; rr(ctx,px,py,pw,ph,16*ui); ctx.fill();
      ctx.strokeStyle='#e0a93f'; ctx.lineWidth=3*ui; rr(ctx,px,py,pw,ph,16*ui); ctx.stroke(); ctx.lineWidth=1;
      ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      let ty=py+14*ui+titleH*0.6;
      ctx.font='bold '+(22*ui)+'px '+FONT; ctx.fillStyle='#ffd76a'; ctx.fillText(title, cx, ty); ty+=10*ui;
      if(goalLines.length){
        ctx.font=(15*ui)+'px '+FONT; ctx.fillStyle='#cfe6f2';
        for(let i=0;i<goalLines.length;i++){ ty+=goalLineH; ctx.fillText(goalLines[i], cx, ty); }
      }
      ctx.restore();
      ctx.globalAlpha=1; ctx.textBaseline='alphabetic';
    },

    /* ---------- timer-grenade fuse control (#1) ---------- */
    // Shown only when the timer grenade is selected on a human turn. A small
    // tappable chip near the weapon name; tap (or press F on PC) cycles 1..5s.
    // Persistent, screen-space movement meter. It stays readable even when the
    // camera follows a jump or the character stands still; cyan is not HP.
    _moveBar(ctx, M){
      if(S.mode!==G.PLAYING || S.paused) return;
      if(!isHumanTurn()) return;
      if(S.phase!==CA.TurnPhase.AIM && S.phase!==CA.TurnPhase.RETREAT) return;
      const max=S._moveBudgetMax||0; if(max<=0) return;
      const u=CA.activeUnit&&CA.activeUnit(); if(!u||!u.alive) return;
      const frac=U.clamp((S._moveBudget||0)/max,0,1);
      const ui=(M&&M.ui)||1;
      const padTop = 12*ui + Math.round(safeAreaTopCss()*((M&&M.dpr)||1)) + 5*ui;
      const ins=topHudInsetPx(M);
      const x=Math.round(6*ui+ins.l*0.6), y=Math.round(padTop+52*ui);
      const w=Math.round(Math.min(290*ui,C.VIEW_W*0.35)), h=Math.round(20*ui);
      ctx.save();
      ctx.fillStyle='rgba(12,25,36,0.82)'; rr(ctx,x,y,w,55*ui,10*ui); ctx.fill();
      ctx.font='bold '+(14*ui)+'px '+FONT; ctx.textBaseline='middle';
      ctx.textAlign='left'; ctx.fillStyle='#d6f7ff';
      ctx.fillText('👟 '+t('Mozgás'),x+10*ui,y+14*ui);
      ctx.textAlign='right'; ctx.fillStyle='#fff';
      ctx.fillText(Math.round(frac*100)+'%',x+w-10*ui,y+14*ui);
      const bx=x+10*ui, by=y+28*ui, bw=w-20*ui;
      ctx.fillStyle='#102733'; rr(ctx,bx,by,bw,h,7*ui); ctx.fill();
      ctx.fillStyle=frac>0.15?'#2fd0e8':'#a0ecf5';
      if(frac>0){ rr(ctx,bx,by,bw*frac,h,Math.min(7*ui,bw*frac/2)); ctx.fill(); }
      ctx.strokeStyle='#90e4f0'; ctx.lineWidth=1.5*ui;
      rr(ctx,bx,by,bw,h,7*ui); ctx.stroke();
      ctx.restore();
    },

    // first-run contextual coachmarks — a single caption that advances on the
    // ACTION itself (move → aim → charge-fire → weapons). One-time per device.
    _coach(ctx, M){
      if(_coachStep>=99) return;
      if(_coachSeen && _coachStep<0) return;           // already learned, never start
      if(S.mode!==G.PLAYING || S.paused) return;
      if(!isHumanTurn() || (CA.canControl && !CA.canControl())) return;
      if(S.dev || S._challenge || S._puzzle) return;   // not during dev/challenge/puzzle
      const u=CA.activeUnit&&CA.activeUnit(); if(!u||!u.alive) return;
      // init on the first eligible frame — and mark SEEN immediately so it only ever
      // shows on THIS first turn and can never nag again (even if interrupted).
      if(_coachStep<0){
        if(_coachSeen) return;
        // Only START on a truly FRESH turn — never mid-action, otherwise step 1
        // ("move with the buttons") shows after the player already moved/fired and
        // the captions desync from what they're doing. (#coach-midturn)
        if(S.firedThisTurn || S._movedThisTurn) return;
        _coachStep=0; _coachT=0; _coachAimRef=u.aimAngle||0;
        _coachSeen=true; try{ localStorage.setItem('ca_seen_coach','1'); }catch(_){}
      }
      _coachT+=1/60;
      // advance on the real ACTION *or* a per-step timeout, so it NEVER gets stuck.
      // Timeouts are 60% SHORTER than before (Jani: captions lingered too long) —
      // 7→2.8 / 6→2.4 / 8→3.2 / 4→1.6s. The action triggers still fire first.
      if(_coachStep===0 && (S._movedThisTurn || _coachT>2.8)){ _coachStep=1; _coachT=0; _coachAimRef=u.aimAngle||0; }
      else if(_coachStep===1 && (Math.abs((u.aimAngle||0)-(_coachAimRef||0))>0.06 || _coachT>2.4)){ _coachStep=2; _coachT=0; }
      else if(_coachStep===2 && _coachT>3.2){ _coachStep=3; _coachT=0; }  // (also advanced by the 'fired' event)
      else if(_coachStep===3 && _coachT>1.6){ _coachStep=99; return; }
      const ui=(M&&M.ui)||1;
      // Step-3 copy must match the bar the active unit actually shows: a CLASS hero
      // sees the ability bar (Képességek), a classic unit sees the weapon strip.
      // Mirror _weaponPanel's early-return condition. (#coach-wrongbar)
      let _usesAbilityBar=false;
      try{ const cdf=CA.classOf?CA.classOf(u):null;
        _usesAbilityBar=!!(cdf && Array.isArray(cdf.abilities) && cdf.abilities.length); }catch(e){}
      // Branch the move/aim/fire copy on input type: touch players have on-screen
      // buttons + a hold-to-charge fire pad, desktop players use the mouse to aim and
      // click/Enter to fire (#coach-desktop-glyphs).
      const caps=IS_TOUCH ? [
        t('👟 Mozogj a gombokkal — a csík elfogy, ahogy lépsz'),
        t('▲▼ Célozz — a szaggatott ív mutatja a lövést'),
        t('🔥 Tartsd nyomva a tüzelést a feltöltéshez, engedd el a lövéshez!'),
        _usesAbilityBar
          ? t('Válassz képességet lent — a szürke még tölt')
          : t('Válts fegyvert lent — a szürke nem használható')
      ] : [
        t('👟 Mozogj az A/D billentyűkkel — a csík elfogy, ahogy lépsz'),
        t('🖱️ Célozz az egérrel — a szaggatott ív mutatja a lövést'),
        t('🔥 Tartsd nyomva a kattintást (vagy Entert) a feltöltéshez, engedd el a lövéshez!'),
        _usesAbilityBar
          ? t('Válassz képességet lent — a szürke még tölt')
          : t('Válts fegyvert lent — a szürke nem használható')
      ];
      const cap=caps[U.clamp(_coachStep,0,3)]||'';
      ctx.save();
      ctx.font='bold '+(16*ui)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
      const tw=Math.min(C.VIEW_W*0.92, ctx.measureText(cap).width+40*ui), th=Math.round(42*ui);
      const cx=C.VIEW_W/2, cy=C.VIEW_H-Math.round((IS_TOUCH?168:96)*ui);
      // pulsing border unless reducedMotion (then a steady ring)
      const red=!!(CA.settings&&CA.settings.reducedMotion);
      const pulse=red?0.9:(0.6+0.4*Math.abs(Math.sin(Date.now()/350)));
      ctx.fillStyle='rgba(8,16,24,0.9)'; rr(ctx,cx-tw/2,cy-th/2,tw,th,12*ui); ctx.fill();
      ctx.strokeStyle='rgba(232,113,26,'+pulse.toFixed(2)+')'; ctx.lineWidth=2.5*ui; rr(ctx,cx-tw/2,cy-th/2,tw,th,12*ui); ctx.stroke(); ctx.lineWidth=1;
      ctx.fillStyle='#fff7e6'; ctx.fillText(cap, cx, cy);
      // little "1/3 … 3/3" step dots above the caption
      const steps=3; const dy=cy-th/2-12*ui;
      for(let i=0;i<steps;i++){ const dx=cx-(steps-1)*7*ui/1 + i*14*ui;
        ctx.fillStyle = (i<=Math.min(_coachStep,2)) ? '#E8711A' : 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.arc(dx, dy, 3.2*ui, 0, Math.PI*2); ctx.fill(); }
      ctx.restore();
    },

    _timerFuse(ctx, M){
      if(S.mode!==G.PLAYING || S.paused) return;
      if(!isHumanTurn()) return;
      if(S.selectedWeapon!=='timergrenade') return;
      const ui=(M&&M.ui)||1;
      const fuse=(CA.Weapons&&CA.Weapons.timerFuse)||3;
      const label=t('⏱️ Időzítő: ')+fuse+'s'+(IS_TOUCH?' ⟳':'  (F)');
      ctx.font='bold '+(15*ui)+'px '+FONT;
      const tw=ctx.measureText(label).width+24*ui, th=36*ui;
      const x=C.VIEW_W/2-tw/2, y=Math.round(118*ui);
      ctx.fillStyle='rgba(20,30,42,0.9)'; rr(ctx,x,y,tw,th,10*ui); ctx.fill();
      ctx.strokeStyle='rgba(255,221,106,0.85)'; ctx.lineWidth=2; rr(ctx,x,y,tw,th,10*ui); ctx.stroke(); ctx.lineWidth=1;
      ctx.fillStyle='#fff7e6'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(label, C.VIEW_W/2, y+th/2); ctx.textBaseline='alphabetic';
      hudBtns.push({id:'timerfuse', x, y, w:tw, h:th, act:()=>{
        if(CA.Weapons&&CA.Weapons.cycleTimerFuse){ CA.Weapons.cycleTimerFuse(); clickSfx(); }
      }});
    },

    /* ---------- turn-timer HOURGLASS (homokóra) ----------
     * Draws a cute canvas hourglass centered horizontally on `cx`, top edge at
     * `topY`, fitting a `cs`×`cs` box. The top bulb empties and the bottom bulb
     * fills proportional to remaining time; a falling-sand stream connects them
     * while time remains. Urgent (red + faster stream) under ~5s. Honours
     * CA.settings.reducedMotion (static sand, no stream wiggle/shimmer).
     * Returns the integer seconds (so the caller need not recompute).
     */
    _hourglass(ctx, cx, topY, cs, ui){
      ui=ui||1;
      const reduced=!!(CA.settings&&CA.settings.reducedMotion);
      const tRaw=Math.max(0, S.turnTimer||0);
      const tt=Math.ceil(tRaw);
      // total turn time: custom rule overrides the engine default; guard div-by-0.
      const total=Math.max(1, (S.rules&&S.rules.turnTime>0)?S.rules.turnTime:(C.TURN_TIME||45));
      const frac=U.clamp(tRaw/total,0,1);      // 1 = full (start), 0 = empty (end)
      const urgent=tRaw<=5;
      const t2=reduced?0:(Date.now()/1000);    // animation phase (s)

      // --- glass geometry: a centered hourglass within a cs×cs box ---
      // The number sits to the RIGHT, so shift the glass a touch left of cx.
      const gw=cs*0.62, gh=cs;                  // glass width / height
      const gx=cx-gw*0.5-cs*0.32;               // glass left (leaves room for digits)
      const gcx=gx+gw/2;                        // glass center-x
      const gy=topY;
      const neck=gw*0.12;                       // half-width of the neck pinch
      const wood=urgent?'#c75b4a':'#8a5a2b';    // frame colour (reddens when urgent)
      const woodHi=urgent?'#e08a7c':'#b07c46';
      const sandCol=urgent?'#ff7a4a':'#ffd05a'; // sand colour

      // bulb outlines (two triangles meeting at the neck) ----------------------
      const lx=gx, rx=gx+gw, midX=gcx, topYy=gy, botY=gy+gh, midY=gy+gh/2;
      function topBulbPath(){
        ctx.beginPath();
        ctx.moveTo(lx, topYy); ctx.lineTo(rx, topYy);
        ctx.lineTo(midX+neck, midY); ctx.lineTo(midX-neck, midY);
        ctx.closePath();
      }
      function botBulbPath(){
        ctx.beginPath();
        ctx.moveTo(midX-neck, midY); ctx.lineTo(midX+neck, midY);
        ctx.lineTo(rx, botY); ctx.lineTo(lx, botY);
        ctx.closePath();
      }

      ctx.save();
      // glass body (subtle translucent fill) ----------------------------------
      ctx.fillStyle='rgba(210,235,245,0.16)';
      topBulbPath(); ctx.fill(); botBulbPath(); ctx.fill();

      // --- sand in the TOP bulb (drains downward; its TOP surface drops) ------
      // Top bulb is an inverted triangle (wide at top, point at neck). The sand
      // remaining = frac of its area; the surface y rises from neck → top as frac
      // grows. We clip to the bulb and paint a rectangle from surfaceY down.
      ctx.save(); topBulbPath(); ctx.clip();
      // area-correct surface: for an inverted triangle the filled (bottom) area
      // fraction f maps to a surface at height h where (remaining)=f. With the
      // point at the bottom, filling from the point up by linear height gives
      // area ∝ height² , so heightFrac = sqrt(frac).
      const topH=midY-topYy;
      const topSurf=midY - topH*Math.sqrt(frac);
      ctx.fillStyle=sandCol;
      ctx.fillRect(lx-1, topSurf, gw+2, botY-topSurf);
      // little rounded heap dip on the surface (skip when reduced for stillness)
      if(!reduced && frac>0.02){
        ctx.fillStyle='rgba(0,0,0,0.10)';
        ctx.beginPath();
        ctx.ellipse(midX, topSurf+1*ui, gw*0.30, 2.2*ui, 0, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();

      // --- sand in the BOTTOM bulb (fills upward; a growing heap) -------------
      // Bottom bulb is an upright triangle (point at neck, wide at base). Filled
      // amount = (1-frac). With the wide side at the bottom, filling from the base
      // up: heightFrac = 1 - sqrt(frac)  (mirror of the top).
      ctx.save(); botBulbPath(); ctx.clip();
      const botH=botY-midY;
      const heapH=botH*(1-Math.sqrt(frac));
      const heapTop=botY-heapH;
      ctx.fillStyle=sandCol;
      ctx.fillRect(lx-1, heapTop, gw+2, botY-heapTop);
      // a soft mound on top of the bottom pile
      if(heapH>1.5*ui){
        ctx.fillStyle=woodHi;
        ctx.beginPath();
        const mw=gw*0.5*(1-Math.sqrt(frac))+gw*0.10;
        ctx.moveTo(midX-mw, heapTop+1*ui);
        ctx.quadraticCurveTo(midX, heapTop-3*ui, midX+mw, heapTop+1*ui);
        ctx.fill();
        ctx.fillStyle=sandCol; // recolour body (mound highlight only on rim)
      }
      ctx.restore();

      // --- falling-sand STREAM through the neck (only while draining) ---------
      if(frac>0.001 && frac<0.999){
        ctx.fillStyle=sandCol;
        const sw=Math.max(1.2*ui, neck*0.55);
        ctx.fillRect(midX-sw/2, midY-2*ui, sw, botY-midY); // thin column down the lower bulb
        if(!reduced){
          // a few animated grains streaking down for life
          for(let i=0;i<3;i++){
            const ph=(t2*(urgent?5:3)+i*0.37)%1;
            const gyp=midY + ph*(botY-midY-2*ui);
            const wob=Math.sin((t2*6)+i*2.1)*neck*0.4;
            ctx.fillRect(midX-0.8*ui+wob, gyp, 1.6*ui, 2.4*ui);
          }
        }
      }

      // --- wooden frame: end caps + side posts -------------------------------
      ctx.lineJoin='round'; ctx.lineCap='round';
      ctx.strokeStyle=wood; ctx.lineWidth=2.4*ui;
      topBulbPath(); ctx.stroke(); botBulbPath(); ctx.stroke();
      // top & bottom caps (rounded bars)
      ctx.fillStyle=wood;
      rr(ctx, lx-3*ui, topYy-3*ui, gw+6*ui, 4*ui, 2*ui); ctx.fill();
      rr(ctx, lx-3*ui, botY-1*ui,  gw+6*ui, 4*ui, 2*ui); ctx.fill();
      // glass shimmer highlight (skip when reduced for a static, calm look)
      if(!reduced){
        ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=1.2*ui;
        ctx.beginPath();
        ctx.moveTo(lx+gw*0.22, topYy+2*ui); ctx.lineTo(midX-neck*0.4, midY-1*ui);
        ctx.stroke();
      }
      ctx.restore();

      // --- seconds number beside the hourglass --------------------------------
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.font='bold '+(24*ui)+'px '+FONT;
      const numX=gx+gw+8*ui, numY=gy+gh*0.5;
      ctx.lineWidth=4*ui; ctx.strokeStyle='rgba(0,0,0,0.55)';
      ctx.strokeText(String(tt), numX, numY);
      ctx.fillStyle = urgent ? '#ff6a5a' : '#fff7e6';
      // gentle pulse on the digits when urgent (stillness honoured by reducedMotion)
      if(urgent && !reduced){
        const pulse=0.7+0.3*Math.abs(Math.sin(t2*6));
        ctx.globalAlpha=pulse;
      }
      ctx.fillText(String(tt), numX, numY);
      ctx.globalAlpha=1; ctx.lineWidth=1;
      ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      return tt;
    },

    /* ---------- wind indicator ---------- */
    _wind(ctx, cx, cy, ui){
      ui=ui||1;
      const w=S.wind||0, mag=Math.abs(w);
      ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      // bar FIRST (at the top of the wind zone) ...
      const bw=110*ui, bx=cx-bw/2, by=cy+2*ui, bh=9*ui;
      ctx.fillStyle='rgba(0,0,0,0.35)'; rr(ctx,bx,by,bw,bh,5*ui); ctx.fill();
      const fill=mag*(bw/2);
      ctx.fillStyle = mag>0.66?'#ff7a4a':(mag>0.33?'#ffd24a':'#9fe0a0');
      if(w>=0){ rr(ctx,cx,by,fill,bh,5*ui); ctx.fill(); }
      else { rr(ctx,cx-fill,by,fill,bh,5*ui); ctx.fill(); }
      ctx.fillStyle='#fff'; ctx.fillRect(cx-1*ui,by-2*ui,2*ui,bh+4*ui);
      ctx.fillStyle='#fff'; ctx.font=(15*ui)+'px '+FONT;
      ctx.fillText(w>=0?'→':'←', w>=0?(bx+bw+12*ui):(bx-12*ui), by+bh);
      // ... then the "SZÉL" label BELOW the bar (Jani: a szél-kiírás a progressbar alatt)
      ctx.font=(12*ui)+'px '+FONT; ctx.fillStyle='#dff';
      ctx.fillText(t('💨 SZÉL'), cx, by+bh+15*ui);
    },

    /* ---------- team rosters (with species picture) — compact ---------- */
    _rosters(ctx, M, top, padR){
      const ui=(M&&M.ui)||1;
      const rightPad=(typeof padR==='number')?padR:12*ui;   // safe-area-aware right margin
      const W=Math.min(C.VIEW_W*0.34, 220*ui), ix=36*ui;   // box width + inner text offset
      const x=C.VIEW_W-W-rightPad;
      const rowH=34*ui, rgap=8*ui, pic=26*ui;
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      // a11y: when colour-blind mode is on, teams also get a distinct SHAPE so they
      // can be told apart without relying on the team colour alone (HP bar + name
      // are both team-coloured). Off by default → the clean look is preserved.
      const cbOn = !!(CA.settings && CA.settings.colorblind && CA.settings.colorblind!=='off');
      let y=top||(70*ui);
      let _ti=-1;
      for(const t of S.teams){
        _ti++;
        const alive=CA.aliveUnitsOfTeam(t.id);
        const totalHp=Math.round(alive.reduce((s,u)=>s+Math.max(0,u.hp),0));
        const maxTotal=(t.unitIds?t.unitIds.length:C.TEAM_SIZE)*C.UNIT_MAX_HP;
        ctx.fillStyle='rgba(0,0,0,0.35)'; rr(ctx,x,y,W,rowH,7*ui); ctx.fill();
        this._teamPic(ctx, t, x+5*ui, y+(rowH-pic)/2, pic);
        const frac=maxTotal? U.clamp(totalHp/maxTotal,0,1):0;
        const barW=W-ix-12*ui;
        ctx.fillStyle='rgba(255,255,255,0.12)'; rr(ctx,x+ix,y+rowH-11*ui,barW,7*ui,4*ui); ctx.fill();
        ctx.fillStyle=t.color; rr(ctx,x+ix,y+rowH-11*ui,barW*frac,7*ui,4*ui); ctx.fill();
        const robot = CA.img && CA.img('assets/ui/robot.png');
        const heart = CA.img && CA.img('assets/ui/heart.png');
        ctx.fillStyle=t.color; ctx.font='bold '+(12*ui)+'px '+FONT; ctx.textAlign='left';
        // a11y team-shape badge (only when colour-blind mode is active)
        let _nameX=x+ix;
        if(cbOn){
          const sh=this._teamShape(_ti);
          ctx.save();
          ctx.font=(12*ui)+'px '+FONT; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
          ctx.fillText(sh, _nameX, y+13*ui);
          const sw=ctx.measureText(sh).width+4*ui;
          ctx.restore();
          ctx.fillStyle=t.color; ctx.font='bold '+(12*ui)+'px '+FONT; ctx.textAlign='left';
          _nameX += sw;
        }
        ctx.fillText(CA.t(t.name), _nameX, y+13*ui);
        if(t.isAI){ const nx=_nameX+ctx.measureText(CA.t(t.name)).width+5*ui; const rs=13*ui;
          if(robot) ctx.drawImage(robot, nx, y+2*ui, rs,rs); else ctx.fillText('🤖', nx, y+13*ui); }
        const hpStr=totalHp+'  ('+alive.length+'/'+(t.unitIds?t.unitIds.length:C.TEAM_SIZE)+')';
        ctx.fillStyle='#fff'; ctx.textAlign='right'; ctx.font=(11*ui)+'px '+FONT;
        ctx.fillText((heart?'':'❤ ')+hpStr, x+W-7*ui, y+13*ui);
        if(heart){ const hs=12*ui; ctx.drawImage(heart, x+W-9*ui-ctx.measureText(hpStr).width-hs-3*ui, y+2*ui, hs,hs); }
        ctx.textAlign='left';
        y+=rowH+rgap;
      }
      return y;   // bottom edge of the roster stack (so toasts can anchor below it)
    },

    /* a11y: a distinct shape glyph per team index so teams are distinguishable by
       form, not just colour (used in colour-blind mode). Cycles past 4 teams. */
    _teamShape(i){ const sh=['▲','●','■','◆','★','▼']; return sh[((i%sh.length)+sh.length)%sh.length]; },

    /* draw a team's species picture in a rounded square; PNG if loaded else disc+emoji */
    _teamPic(ctx, t, x, y, s){
      const sp = (t.species||t.kind);
      const img = CA.speciesIcon && CA.speciesIcon(sp);
      ctx.save();
      rr(ctx, x, y, s, s, 8);
      ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.fill();
      ctx.clip();
      if(img){
        // high-quality downscale of the 512px source straight into the box
        // (no tiny intermediate canvas) so the avatar stays crisp.
        ctx.imageSmoothingEnabled=true;
        if('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality='high';
        ctx.drawImage(img, 0,0, img.naturalWidth||img.width, img.naturalHeight||img.height, x, y, s, s);
      }
      else {
        ctx.fillStyle = t.color; ctx.fillRect(x,y,s,s);
        const em = (CA.Species && CA.Species[sp] && CA.Species[sp].emoji) || '🐹';
        ctx.fillStyle='#fff'; ctx.font=(s*0.6|0)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(em, x+s/2, y+s/2+1); ctx.textBaseline='alphabetic';
      }
      ctx.restore();
    },

    /* Offscreen portrait of an ACTUAL unit (species + cosmetic + class), the same
     * faithful render the Team Editor uses (CA.Entities.renderPortrait). Cached on
     * an offscreen canvas keyed by the unit's visual identity so we only re-render
     * when the species/cosmetic/class/captain changes. Returns a <canvas> or null. */
    _unitPortrait(u){
      if(!u) return null;
      const rp = CA.Entities && CA.Entities.renderPortrait;
      if(typeof rp!=='function') return null;
      const cosId = (u.cosmetic && u.cosmetic.id) || '';
      const cls   = u.cls || (u.cls===0?0:'');
      const team  = (S.teams && u.teamId!=null && S.teams[u.teamId]) || null;
      const color = (team && team.color) || '#caa472';
      const key   = (u.species||u.kind||'capybara')+'|'+cosId+'|'+cls+'|'+(u._captain?1:0)+'|'+color;
      let cv = _portraitCache[key];
      if(cv) return cv;
      try{
        cv = document.createElement('canvas');
        cv.width = cv.height = 96;
        rp(cv, { species:u.species||u.kind, cls:u.cls||null,
                 cosmetic:cosId||null, captain:!!u._captain, color:color });
        _portraitCache[key] = cv;
        return cv;
      }catch(e){ return null; }
    },

    /* ---------- weapon panel (paged, category tabs) ---------- */
    _weaponPanel(ctx, M){
      weaponBtns=[]; weaponNav=[];
      const ui=(M&&M.ui)||1;
      const full=(CA.Weapons&&CA.Weapons.LIST)||[];
      if(!full.length) return;
      // hide during AI turn / pause / game-over to keep it clean (weaponBtns/Nav
      // already reset above, so no stale, inert hit-rects linger on the AI's turn)
      if(S.mode!==G.PLAYING || S.paused || !isHumanTurn()) return;

      // On TOUCH the whole weapon-HUD is ~20% smaller (Jani: "legyen kisebb
      // mobilon az a rész 20%-al") — scale every metric (cell/tab/fonts/pads)
      // by `ts`. Desktop keeps 1:1.
      const ts = IS_TOUCH ? 0.8 : 1;

      // On touch the weapon-HUD is drawn 20% smaller, which makes the tabs/arrows/
      // cells fiddly to hit. Keep the VISUAL size, but grow the HIT-rects by a pad
      // on touch (≈10px each side) so the tap targets stay finger-friendly.
      const hitPad = IS_TOUCH ? Math.round(10*ui) : 0;
      // Apple HIG minimum tap target = 44 CSS px → 44*dpr backing px. The visual
      // cells/tabs are 20% smaller on touch, so grow the hit-rects to meet 44px.
      // padFor(visual) = per-side pad needed to make a `visual`-px edge span MIN44.
      const MIN44 = IS_TOUCH ? Math.round(44*((M&&M.dpr)||1)) : 0;
      const padFor = v => Math.max(hitPad, Math.ceil((MIN44 - v)/2));
      // push a rect into `arr` with its hit-area inflated. `xp` lets adjacent items
      // (tabs/cells separated by a small gap) use a smaller horizontal pad so their
      // hit-rects don't overlap (which would let an earlier item steal the tap).
      const pushHit = (arr, r, xp, yp) => { const px=(xp==null)?hitPad:xp; const py=(yp==null)?hitPad:yp;
        arr.push({ x:r.x-px, y:r.y-py, w:r.w+px*2, h:r.h+py*2, id:r.id, act:r.act }); };
      // asymmetric variant: independent up/down vertical pads (so a tab can grow
      // UP into the free space above without its DOWN pad overlapping the cell row).
      const pushHitV = (arr, r, xp, upPad, dnPad) => { const px=(xp==null)?hitPad:xp;
        arr.push({ x:r.x-px, y:r.y-upPad, w:r.w+px*2, h:r.h+upPad+dnPad, id:r.id, act:r.act }); };

      // (#weapon-2rows) On TOUCH lay the strip out in TWO rows so each icon can be
      // BIGGER (easier to distinguish) instead of one cramped single row. Desktop
      // stays a single row at the original size.
      const WROWS = IS_TOUCH ? 2 : 1;
      // bump the touch cell back up (the 2-row grid has the vertical room for it).
      const cell=(IS_TOUCH?46*ui:40*ui*ts), gap=(IS_TOUCH?6*ui:5*ui*ts);
      const vgap = 6*ui;                         // gap BETWEEN the two rows (touch)
      // The panel sits bottom-center. On TOUCH the thumb pads occupy both bottom
      // corners — reserve that horizontal band + pin the panel to the BOTTOM so
      // it never floats mid-screen and never overlaps the move/aim/fire buttons.
      let leftBound=14*ui, rightBound=C.VIEW_W-14*ui;
      // `baseBottom` = the BOTTOM edge of the weapon-cell row.
      let baseBottom=C.VIEW_H;
      // vertical gaps between row → tabs → selected-name (tightened on touch)
      let rowGap=22*ui*ts, tabGap=12*ui*ts;
      if(IS_TOUCH){
        const tl=touchLayout(ui);
        leftBound = tl.padRight + 14*ui;            // right edge of the LEFT pad
        rightBound = C.VIEW_W - tl.padRight - 14*ui;// mirror for the RIGHT pad
        // The pads hug the bottom CORNERS, leaving the bottom-CENTER free (the
        // switch button was removed on mobile). Pin the weapon row's BOTTOM to
        // the SAME level as the thumb pads' bottom edge, so the whole HUD hugs
        // the very bottom of the screen and never floats mid-screen.
        baseBottom = tl.bottom + tl.big;            // bottom edge of the thumb pads
        rowGap=10*ui; tabGap=7*ui;                  // tight stack so it stays low
      }
      const bandW=rightBound-leftBound;
      const bandCx=(leftBound+rightBound)/2;

      // v4: a hero WITH A CLASS uses ONLY the ability bar (its class abilities +
      // universal basics, with cooldowns) — NOT the full 25-weapon arsenal. So
      // each class actually plays differently. Skip the tabs + generic strip.
      { const au=CA.activeUnit?CA.activeUnit():null; const cdf=au&&CA.classOf?CA.classOf(au):null;
        if(cdf && Array.isArray(cdf.abilities) && cdf.abilities.length){
          // Drop the ability bar LOWER (Jani: minimise what it covers). baseBottom
          // already sits `pad(16*ui)+safe-inset` above the screen edge; reclaim most
          // of that pad so the bar hugs the bottom. The safe-area inset stays intact
          // inside touchLayout() so iPhone home-indicators never overlap it.
          const abBottom = IS_TOUCH ? baseBottom + Math.round(12*ui) : baseBottom;
          this._abilityBar(ctx, ui, ts, bandCx, abBottom);
          return;
        } }

      // y of the weapon cell row(s) + tab row above it.
      // blockH spans ALL rows (2 on touch) so the strip pins to the bottom and the
      // tabs sit above the FULL grid (#weapon-2rows).
      const blockH = WROWS*cell + (WROWS-1)*vgap;
      const y = baseBottom - blockH - rowGap;     // TOP row's y
      const tabH=19*ui*ts, tabY=y-tabH-tabGap;

      // ---- category tabs (centered in the band) ----
      ctx.font='bold '+(10.5*ui*ts)+'px '+FONT;
      let totalTab=0; const tabWs=[];
      for(const c of WCATS){ const tw=ctx.measureText(c.emoji+' '+t(c.label)).width+11*ui*ts; tabWs.push(tw); totalTab+=tw+5*ui*ts; }
      totalTab-=5*ui*ts;
      let tabX=bandCx-totalTab/2;
      for(let i=0;i<WCATS.length;i++){
        const c=WCATS[i], tw=tabWs[i];
        const sel=wcat===c.id;
        ctx.fillStyle=sel?'rgba(255,221,106,0.95)':'rgba(0,0,0,0.45)';
        rr(ctx,tabX,tabY,tw,tabH,6*ui*ts); ctx.fill();
        ctx.fillStyle=sel?'#222':'#cde'; ctx.font='bold '+(10.5*ui*ts)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(c.emoji+' '+t(c.label), tabX+tw/2, tabY+tabH/2);
        ctx.textBaseline='alphabetic';
        // 44px target: tabH (~15*ui) is far below MIN44, so grow the hit-rect.
        // Cap DOWN pad to stay clear of the cell row below (it grew UP by ≤tabGap*0.4),
        // and put the remaining vertical reach UPWARD into the free space above tabs.
        { const tabDn=Math.min(padFor(tabH), Math.round(tabGap*0.5));
          const tabUp=Math.max(hitPad, padFor(tabH)*2 - tabDn);
          pushHitV(weaponNav, {x:tabX,y:tabY,w:tw,h:tabH,act:()=>{ wcat=c.id; weaponPage=0; }}, Math.round(2*ui*ts), tabUp, tabDn); }
        tabX+=tw+5*ui*ts;
      }

      // ---- filtered, paged strip (fits inside the band) ----
      const L=filteredWeapons();
      const arrowW=36*ui*ts;
      // budget for cells = band minus arrows (if paged) minus padding
      const reserve=2*(arrowW+10*ui*ts)+20*ui*ts;
      // cells PER ROW that fit the band; a page holds perRow × WROWS cells.
      const perRow=Math.max(1, Math.floor((bandW-reserve)/(cell+gap)));
      const perPage=perRow*WROWS;
      const pages=Math.max(1, Math.ceil(L.length/perPage));
      if(weaponPage>=pages) weaponPage=pages-1;
      if(weaponPage<0) weaponPage=0;
      const start=weaponPage*perPage;
      const slice=L.slice(start, start+perPage);
      const n=slice.length;
      // strip width = the WIDER of the (up to two) rows in this page.
      const cols=Math.min(n, perRow);
      const stripW=cols*cell+(cols-1)*gap;
      const blockW=stripW+(pages>1?(arrowW+10*ui*ts)*2:0);
      let bx0=bandCx-blockW/2;

      // Subtle grey rounded backdrop strip behind the whole weapon row, styled to
      // match the category-tab chips above it (same grey tone / corner radius).
      // The selected weapon's yellow chip + depleted red tint still draw ON TOP.
      {
        const pan=7*ui*ts;
        ctx.fillStyle='rgba(0,0,0,0.45)';
        rr(ctx, bx0-pan, y-pan*0.6, blockW+pan*2, blockH+pan*1.2, 10*ui*ts); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1;
        rr(ctx, bx0-pan, y-pan*0.6, blockW+pan*2, blockH+pan*1.2, 10*ui*ts); ctx.stroke();
      }

      let sx=bx0;
      if(pages>1){
        const la={x:sx,y:y+blockH/2-arrowW/2,w:arrowW,h:arrowW,act:()=>{ weaponPage=(weaponPage-1+pages)%pages; }};
        ctx.fillStyle='rgba(255,255,255,0.14)'; rr(ctx,la.x,la.y,la.w,la.h,9*ui*ts); ctx.fill();
        ctx.fillStyle='#fff'; ctx.font='bold '+(20*ui*ts)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('‹', la.x+la.w/2, la.y+la.h/2); ctx.textBaseline='alphabetic';
        pushHit(weaponNav, la);
        sx+=arrowW+10*ui*ts;
      }

      for(let i=0;i<n;i++){
        const w=slice[i];
        // grid placement: WROWS rows × perRow cols (single row on desktop).
        const col=i%perRow, row=(i/perRow)|0;
        const x=sx+col*(cell+gap);
        const cyy=y+row*(cell+vgap);          // this cell's TOP-Y (row offset)
        const sel=w.id===S.selectedWeapon;
        // dim (greyed) when truly UNAVAILABLE — not just depleted ammo, but also an
        // ability on cooldown, a weapon-set-forbidden pick, or a shot already spent
        // this turn. (Matches the ability-bar dim so a dead pick never looks normal.)
        const _u0=CA.activeUnit&&CA.activeUnit();
        const _onCd=!!(w.ability && _u0 && _u0.cooldowns && _u0.cooldowns[w.id]>0);
        const _notAllow=!!(CA.weaponAllowed && !CA.weaponAllowed(w.id));
        const _spent=!!(S.firedThisTurn && CA.isShotWeapon && CA.isShotWeapon(w.id));
        const out=(CA.ammoOf(w.id)===0) || _onCd || _notAllow || _spent;
        // chip ONLY for the selected weapon (or a faint red one for depleted).
        // Everything else floats chrome-free over the world.
        if(sel){
          ctx.fillStyle='rgba(255,221,106,0.95)'; rr(ctx,x,cyy,cell,cell,11*ui*ts); ctx.fill();
          ctx.strokeStyle='#fff'; ctx.lineWidth=2; rr(ctx,x,cyy,cell,cell,11*ui*ts); ctx.stroke(); ctx.lineWidth=1;
        } else if(out){
          // unavailable (depleted / on cooldown / forbidden / spent) reads grey-dark,
          // not red — and is non-selectable (see weaponUnavailable tap guards).
          ctx.fillStyle='rgba(15,15,18,0.62)'; rr(ctx,x,cyy,cell,cell,11*ui*ts); ctx.fill();
        }
        // weapon ICON: assets/weapons/<id>.png, fallback to emoji.
        // a soft drop-shadow keeps unchipped icons readable over the world.
        // airstrike: the white game-icons png doesn't read as a plane → force the ✈️ emoji (Jani).
        const wimg = w.id!=='airstrike' && CA.img && CA.img('assets/weapons/'+w.id+'.png');
        if(wimg){
          ctx.globalAlpha=out?0.30:1;
          if(!sel){ ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=4*ui; ctx.shadowOffsetY=1*ui; }
          // alpha-bbox crop so every icon fills its cell uniformly (like the rocket),
          // regardless of transparent PNG padding. Falls back to the full image draw.
          const b=iconBBox(wimg,w.id);
          if(b){
            const scale=(cell*0.74)/Math.max(b.sw,b.sh);
            const dw=b.sw*scale, dh=b.sh*scale;
            ctx.drawImage(wimg, b.sx,b.sy,b.sw,b.sh, x+(cell-dw)/2, cyy+(cell-dh)/2, dw, dh);
          } else {
            const is=cell*0.66;
            ctx.drawImage(wimg, x+(cell-is)/2, cyy+cell*0.10, is, is);
          }
          ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
          ctx.globalAlpha=1;
        } else {
          ctx.textAlign='center'; ctx.textBaseline='alphabetic';
          ctx.font=(20*ui*ts)+'px '+FONT;
          if(!sel){ ctx.shadowColor='rgba(0,0,0,0.7)'; ctx.shadowBlur=4*ui; }
          ctx.fillStyle=sel?'#222':(out?'rgba(255,200,200,0.6)':'#fff');
          ctx.fillText(w.emoji||'•', x+cell/2, cyy+cell*0.6);
          ctx.shadowColor='transparent'; ctx.shadowBlur=0;
        }
        // ammo count — a small white number in the BOTTOM-RIGHT corner, like a
        // hallmark/stamp. FINITE → the count; INFINITE (-1) → '∞' (Jani kérése);
        // depleted (0) draws nothing (the grey cell already signals it).
        const _amt=CA.ammoOf(w.id);
        const _atxt = (_amt>0) ? String(_amt) : (_amt<0 ? '∞' : null);
        if(_atxt!=null){
          ctx.font='bold '+((_amt<0?12:10)*ui*ts)+'px '+FONT;   // ∞ a hair bigger to read
          const _ax=x+cell-3*ui*ts, _ay=cyy+cell-4*ui*ts;
          // tiny dark pill behind the digit so it reads over any icon
          const _aw=ctx.measureText(_atxt).width;
          ctx.fillStyle='rgba(0,0,0,0.85)';
          rr(ctx, _ax-_aw-3*ui*ts, _ay-10*ui*ts, _aw+6*ui*ts, 12*ui*ts, 3*ui*ts); ctx.fill();
          ctx.textAlign='right'; ctx.textBaseline='alphabetic';
          ctx.fillStyle='#fff';
          ctx.fillText(_atxt, _ax, _ay);
        }
        const gi=full.indexOf(w);
        if(gi>=0 && gi<9){
          if(!sel){ ctx.shadowColor='rgba(0,0,0,0.85)'; ctx.shadowBlur=3*ui; }
          ctx.textAlign='left'; ctx.textBaseline='alphabetic';
          ctx.font='bold '+(9*ui*ts)+'px '+FONT; ctx.fillStyle=sel?'#555':'#ffe';
          ctx.fillText(String(gi+1), x+4*ui*ts, cyy+12*ui*ts);
        }
        ctx.shadowColor='transparent'; ctx.shadowBlur=0;
        // 44px target: keep cells finger-friendly. Horizontal growth capped to gap/2.
        // Vertical pad capped to vgap/2 so adjacent rows' hit-rects never overlap;
        // the bigger touch cell (46*ui) already meets/clears MIN44 on its own.
        { const cPadV=(WROWS>1)?Math.round(vgap/2):Math.round(rowGap);
          const cUp=Math.round(Math.min(hitPad, (WROWS>1?vgap/2:tabGap*0.4)));
          const cDn=Math.max(hitPad, Math.min(padFor(cell)*2 - cUp, cPadV));
          pushHitV(weaponBtns, {x,y:cyy,w:cell,h:cell,id:w.id},
            Math.round(gap/2), cUp, cDn); }
      }
      sx+=cols*(cell+gap)-gap;

      if(pages>1){
        sx+=10*ui*ts;
        const ra={x:sx,y:y+blockH/2-arrowW/2,w:arrowW,h:arrowW,act:()=>{ weaponPage=(weaponPage+1)%pages; }};
        ctx.fillStyle='rgba(255,255,255,0.14)'; rr(ctx,ra.x,ra.y,ra.w,ra.h,9*ui*ts); ctx.fill();
        ctx.fillStyle='#fff'; ctx.font='bold '+(20*ui*ts)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('›', ra.x+ra.w/2, ra.y+ra.h/2); ctx.textBaseline='alphabetic';
        pushHit(weaponNav, ra);
        ctx.font=(11*ui*ts)+'px '+FONT; ctx.fillStyle='#9ab'; ctx.textAlign='center';
        ctx.fillText((weaponPage+1)+'/'+pages, bandCx, y+blockH+14*ui*ts);
      }

      // selected name (above tabs) — soft shadow so it reads over the world
      const cw=(CA.Weapons&&CA.Weapons.currentWeapon)?CA.Weapons.currentWeapon():full.find(x=>x.id===S.selectedWeapon);
      let nameY=tabY-5*ui*ts;
      if(cw){ ctx.textAlign='center'; ctx.font='bold '+(13*ui*ts)+'px '+FONT; ctx.fillStyle='#fff';
        ctx.shadowColor='rgba(0,0,0,0.85)'; ctx.shadowBlur=4*ui;
        ctx.fillText(t(cw.name), bandCx, nameY);
        ctx.shadowColor='transparent'; ctx.shadowBlur=0; }

      // ---- v4 CLASS-ABILITY BAR (above the selected-name / weapon tabs) ----
      // Only on a HUMAN hero's turn whose class actually has abilities.
      this._abilityBar(ctx, ui, ts, bandCx, nameY-20*ui*ts);
    },

    /* ---------- v4 ability bar (class abilities + universal weapons) ----------
     * A compact horizontal row of icon+name buttons. Abilities on cooldown are
     * dimmed with the remaining-turn count and are not selectable. Selecting an
     * ability just sets S.selectedWeapon (same as a weapon). Reuses the weapon-
     * panel scale (ui*ts) so it stays bottom-anchored & 20% smaller on touch. */
    _abilityBar(ctx, ui, ts, cx, bottomY){
      abilityBtns=[];
      if(S.mode!==G.PLAYING || S.paused) return;
      if(!isHumanTurn()) return;
      const u=CA.activeUnit?CA.activeUnit():null;
      if(!u || !u.alive) return;
      const list=abilityWeaponsFor(u);
      // nothing class-specific AND no universal weapon -> skip (classic match)
      const hasAbility=list.some(w=>w.ability);
      if(!hasAbility) return;            // classic (no class system) -> keep old panel only

      let cell=34*ui*ts, gap=6*ui*ts, pad=6*ui*ts;
      const n=list.length;
      // Wrap to the screen width so no ability chip ever runs off-edge (which made
      // it both invisible AND untappable — the hit-rects below use the laid-out x).
      // A class hero's bar = 3 abilities + ~18 universal weapons (~21 cells).
      const maxRowW = C.VIEW_W*0.92;
      let perRow;
      if (S.dev){ const fpr=Math.max(1,Math.floor((maxRowW+gap)/(cell+gap))); const wantRows = n>16 ? 3 : (n>8 ? 2 : 1); perRow = Math.max(1, Math.min(fpr, Math.ceil(n/wantRows))); }
      else if (IS_TOUCH && n>8){
        // MOBILE: force TWO rows. Cells are ~30% SMALLER than before (Jani: the bar
        // covered too much of the bottom of the level) — apply a ×0.7 factor to the
        // base + capped fill size. The VISUAL shrinks; the hit-rect MIN44 inflation
        // below keeps every chip ≥44 CSS-px tappable.
        perRow = Math.ceil(n/2);
        const TSHRINK = 0.7;                     // Jani: ~30% smaller on touch
        cell = Math.max(cell*TSHRINK, Math.min(52*ui*TSHRINK, (maxRowW-(perRow-1)*gap)/perRow));
      }
      else { const fpr=Math.max(1,Math.floor((maxRowW+gap)/(cell+gap))); perRow = Math.min(n, fpr); }   // desktop: single row unless overflow -> wrap
      const rows = Math.ceil(n/perRow);
      // Apple HIG min tap target = 44 CSS px → 44*dpr backing px. The visual chips
      // can be far smaller (≈27*ui on a packed mobile bar), so the hit-rects below
      // grow toward MIN44 (visual stays small). Computed once, used in the loop.
      const _dpr = IS_TOUCH ? (metrics().dpr||1) : 0;
      const MIN44 = IS_TOUCH ? Math.round(44*_dpr) : 0;
      const devLbl = S.dev ? 11*ui*ts : 0;          // extra row height for the DEV name label
      // (#ability-2row-mistap) On TOUCH the chip hit-rects grow vertically toward
      // MIN44 (UP for the lower row, DOWN for the upper) — with only `gap` between
      // rows those inflated zones overlapped in the inter-row band, so a tap meant
      // for the bottom row landed on the top-row chip. Widen the BETWEEN-ROW gap on
      // touch so the two hit-zones separate cleanly. Horizontal column `gap` (and the
      // hit-rect pad math that keys off it) is left untouched → desktop unchanged.
      // (#ability-44 after ×0.7 shrink) The smaller touch cell (~33*dpr) no longer
      // reaches MIN44 on its own, so the hit-rects must inflate ~5*dpr per side. The
      // per-side cap is vgap*0.45, so widen the inter-row band on touch (8→14*ui) to
      // give that inflation room — without this the two rows' hit-zones can't grow to
      // 44px. Even at 14*ui the 2-row block is still ~20% shorter than before (smaller
      // cells), so the bar still covers less of the level. Desktop keeps `gap`.
      const vgap = IS_TOUCH ? 14*ui : gap;
      const rowH = cell+vgap+devLbl;
      const topY = (bottomY-cell) - (rows-1)*rowH;
      const widestN = Math.min(perRow, n);
      const stripW = widestN*cell+(widestN-1)*gap;
      const bH = (rows-1)*rowH + cell + devLbl;

      // backdrop chip strip (spooky purple tint to set abilities apart) — all rows
      const bx0 = cx-stripW/2;
      ctx.fillStyle='rgba(40,16,56,0.5)';
      rr(ctx, bx0-pad, topY-pad*0.7, stripW+pad*2, bH+pad*1.4, 10*ui*ts); ctx.fill();
      ctx.strokeStyle='rgba(180,140,230,0.22)'; ctx.lineWidth=1;
      rr(ctx, bx0-pad, topY-pad*0.7, stripW+pad*2, bH+pad*1.4, 10*ui*ts); ctx.stroke();

      for(let i=0;i<n;i++){
        const w=list[i];
        const row=(i/perRow)|0, col=i%perRow;
        const itemsInRow=(row===rows-1)?(n-perRow*(rows-1)):perRow;
        const rowW=itemsInRow*cell+(itemsInRow-1)*gap;
        const x=(cx-rowW/2)+col*(cell+gap);
        const y=topY+row*rowH;
        const cd=(w.ability && u.cooldowns && u.cooldowns[w.id]>0) ? (u.cooldowns[w.id]|0) : 0;
        const sel=w.id===S.selectedWeapon;
        const depleted=!w.ability && CA.ammoOf && CA.ammoOf(w.id)===0;   // out of ammo → inactive + darker
        const hov=!IS_TOUCH && hoverPt && hoverPt.x>=x && hoverPt.x<=x+cell && hoverPt.y>=y-3*ui && hoverPt.y<=y+cell+3*ui;
        // base chip
        if(sel){
          ctx.fillStyle='rgba(214,170,255,0.95)'; rr(ctx,x,y,cell,cell,9*ui*ts); ctx.fill();
          ctx.strokeStyle='#fff'; ctx.lineWidth=2; rr(ctx,x,y,cell,cell,9*ui*ts); ctx.stroke(); ctx.lineWidth=1;
        } else if(w._mega){
          // ULTRA-RARE ultimate → distinct crimson/pink border so it stands apart
          // from class abilities (amber) and plain weapons (none). (Jani)
          ctx.fillStyle='rgba(70,18,46,0.7)'; rr(ctx,x,y,cell,cell,9*ui*ts); ctx.fill();
          ctx.strokeStyle='rgba(255,90,150,0.95)'; ctx.lineWidth=2.6*ui*ts; rr(ctx,x,y,cell,cell,9*ui*ts); ctx.stroke(); ctx.lineWidth=1;
        } else if(w.ability){
          // CLASS-specific ability — richer purple fill + a warm amber border so it
          // clearly stands apart from the universal weapons (Jani).
          ctx.fillStyle='rgba(96,56,128,0.7)'; rr(ctx,x,y,cell,cell,9*ui*ts); ctx.fill();
          ctx.strokeStyle='rgba(255,206,120,0.9)'; ctx.lineWidth=2*ui*ts; rr(ctx,x,y,cell,cell,9*ui*ts); ctx.stroke(); ctx.lineWidth=1;
        } else {
          ctx.fillStyle='rgba(255,255,255,0.10)'; rr(ctx,x,y,cell,cell,9*ui*ts); ctx.fill();
        }
        // subtle HOVER highlight (PC) — just a soft glow + thin rim, NO magnify
        // (Jani: csak 1 kis hover). The selected chip keeps its own highlight.
        if(hov && !sel){
          ctx.fillStyle='rgba(255,255,255,0.14)'; rr(ctx,x,y,cell,cell,9*ui*ts); ctx.fill();
          ctx.strokeStyle='rgba(255,255,255,0.65)'; ctx.lineWidth=1.5*ui*ts; rr(ctx,x,y,cell,cell,9*ui*ts); ctx.stroke(); ctx.lineWidth=1;
        }
        // icon: prefer the weapon PNG (white game-icons), else emoji glyph
        // airstrike: force the ✈️ emoji (the png icon doesn't read as a plane).
        ctx.globalAlpha=(cd>0||depleted)?0.32:1;
        const aImg = w.id!=='airstrike' && CA.img && CA.img('assets/weapons/'+w.id+'.png');
        if(aImg){
          const isz=cell*0.62;
          if(!sel){ ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=3*ui; }
          ctx.drawImage(aImg, x+(cell-isz)/2, y+(cell-isz)/2, isz, isz);
          ctx.shadowColor='transparent'; ctx.shadowBlur=0;
        } else {
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.font=(17*ui*ts)+'px '+FONT;
          if(!sel){ ctx.shadowColor='rgba(0,0,0,0.7)'; ctx.shadowBlur=3*ui; }
          ctx.fillStyle=sel?'#2a1638':'#fff';
          // center emoji at the exact cell centre (y+cell/2) so emoji icons line up
          // with the PNG icons (which are centered) — no more "some higher, some lower".
          ctx.fillText(w.icon||w.emoji||'•', x+cell/2, y+cell*0.5);
          ctx.shadowColor='transparent'; ctx.shadowBlur=0;
        }
        ctx.globalAlpha=1;
        // cooldown overlay: dim + remaining-turns number
        if(cd>0){
          ctx.fillStyle='rgba(8,4,14,0.55)'; rr(ctx,x,y,cell,cell,9*ui*ts); ctx.fill();
          ctx.fillStyle='#ffd6f0'; ctx.font='bold '+(15*ui*ts)+'px '+FONT;
          ctx.fillText(String(cd), x+cell/2, y+cell*0.5);
        }
        // out-of-ammo → extra dark "inactive" wash (Jani: legyen sötétebb + inaktív)
        if(depleted){ ctx.fillStyle='rgba(8,4,14,0.62)'; rr(ctx,x,y,cell,cell,9*ui*ts); ctx.fill(); }
        // AMMO COUNT bottom-right: finite → number, infinite (ammo:-1) → '∞'.
        // Abilities are cooldown-based (no ammo) → skipped. (Jani: hányadik kérés...)
        if(!w.ability){
          var _am=(CA.ammoOf?CA.ammoOf(w.id):-1);
          var _atx=(_am>0)?String(_am):(_am<0?'∞':null);
          if(_atx!=null){
            ctx.textAlign='right'; ctx.textBaseline='alphabetic';
            ctx.font='bold '+((_am<0?12:10)*ui*ts)+'px '+FONT;
            var _ax=x+cell-3*ui*ts, _ay=y+cell-3.5*ui*ts, _aw=ctx.measureText(_atx).width;
            ctx.fillStyle='rgba(0,0,0,0.85)'; rr(ctx,_ax-_aw-3*ui*ts,_ay-10*ui*ts,_aw+6*ui*ts,12*ui*ts,3*ui*ts); ctx.fill();
            ctx.fillStyle='#fff'; ctx.fillText(_atx,_ax,_ay);
          }
        }
        // DEV: tiny name under each cell so every weapon is identifiable (Jani —
        // so he can tell which to tweak; truncated to fit). Only in the sandbox.
        if(S.dev){
          ctx.textAlign='center'; ctx.textBaseline='top';
          ctx.font='bold '+(7.5*ui*ts)+'px '+FONT; ctx.fillStyle='#e6dcff';
          let nm=t(w.name||w.id); if(nm.length>11) nm=nm.slice(0,10)+'…';
          ctx.fillText(nm, x+cell/2, y+cell+1.5*ui*ts);
        }
        ctx.textBaseline='alphabetic';
        // hit-target — grow the tap area toward a real 44 CSS-px on TOUCH (Apple HIG),
        // mirroring _weaponPanel's MIN44 math. The VISUAL cell stays small; only the
        // invisible tap zone grows. HORIZONTAL pad stays capped to gap/2 so adjacent
        // chips never steal each other's tap (same tradeoff as the weapon strip).
        // The per-side shortfall to 44px is pushed VERTICALLY: mostly UP into the free
        // space above the row, with a small DOWN pad (capped so multi-row chips don't
        // overlap). On a packed mobile bar `cell` can drop near 27*ui — well under
        // 44px — so without this the chips were sub-target. (#ability-44)
        var _hp=Math.round(gap/2);                              // H capped: no sibling overlap
        var _need=Math.max(0, Math.ceil((MIN44-cell)/2));      // per-side pad still owed for 44
        // Between-row vertical pads must fit inside the inter-row band (`vgap` on
        // touch) so the upper row's DOWN pad and the lower row's UP pad never meet.
        // Cap each at ~vgap/2 (rows>1); single-row keeps the old generous values.
        var _vg=(rows>1)?vgap:gap;
        var _hdnCap=(rows>1)?Math.round(_vg*0.45):Math.round(gap*1.0);
        var _hdn=(rows>1)?Math.min(_need,_hdnCap):Math.max(Math.round(gap*0.6), Math.min(_need, _hdnCap));
        var _hupBase=(rows>1)?Math.round(_vg*0.45):Math.round(cell*0.5);
        var _hupCap=(rows>1)?Math.round(_vg*0.45):Infinity;    // rows>1: keep UP inside the band too
        var _hup=Math.min(_hupCap, Math.max(_hupBase, (_need*2)-_hdn)); // push the remainder UP (free space)
        abilityBtns.push({x:x-_hp,y:y-_hup,w:cell+2*_hp,h:cell+_hup+_hdn,id:w.id,cd});
      }

      // header label above the top row — shows the SELECTED weapon's NAME (e.g.
      // "GRÁNÁT") instead of the generic "Abilities", so you always see what's
      // equipped (Jani). Falls back to "Abilities" if nothing is selected.
      const _selW = list.find(w=>w.id===S.selectedWeapon)
                 || (CA.Weapons && CA.Weapons.currentWeapon && CA.Weapons.currentWeapon());
      const _headLbl = _selW ? t(_selW.name || _selW.id).toUpperCase() : t('Képességek');
      ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      ctx.font='bold '+(11*ui*ts)+'px '+FONT; ctx.fillStyle='#ffe08a';
      ctx.shadowColor='rgba(0,0,0,0.85)'; ctx.shadowBlur=3*ui;
      ctx.fillText(_headLbl, cx, topY-pad*0.7-3*ui*ts);
      ctx.shadowColor='transparent'; ctx.shadowBlur=0;

      // (No dock magnify — Jani preferred a plain subtle hover highlight, drawn
      // inline in the cell loop above; selection = colour change on click.)

      // ---- tooltip: hover (PC) / tap-and-hold (mobile) -----------------------
      // Shows the ability NAME + one-line effect + cooldown length. Defensive:
      // if anything is missing it simply doesn't draw.
      try{
        let tipBtn=null;
        if(!IS_TOUCH && hoverPt){
          for(const b of abilityBtns){ if(hit(b,hoverPt)){ tipBtn=b; break; } }
        }
        if(abilityHold){
          abilityHold.t+=1/60;
          if(abilityHold.t>=ABILITY_HOLD_DELAY){
            for(const b of abilityBtns){ if(b.id===abilityHold.id){ tipBtn=b; break; } }
          }
        }
        if(tipBtn){
          const def=list.find(w=>w.id===tipBtn.id) || (CA.Weapons&&CA.Weapons.LIST||[]).find(w=>w.id===tipBtn.id);
          if(def){ this._abilityTip(ctx, ui, ts, def, tipBtn, y-pad); }
        }
      }catch(_){}
    },

    /* ---------- ability tooltip body (name + 1-line effect + cooldown) ------- */
    _abilityTip(ctx, ui, ts, def, btn, barTopY){
      const s=ui*ts;
      const name=t(def.name||def.id||'—');
      // one-line effect synthesized from the weapon def (no `desc` field exists).
      const parts=[];
      if(def.damage>0) parts.push(t('Sebzés')+' '+Math.round(def.damage));
      if(def.radius>0) parts.push(t('Hatókör')+' '+Math.round(def.radius));
      if(def.knockback>1) parts.push('💨');
      const effect=parts.join(' · ') || (def.endsTurn ? t('Kör vége ⏭') : '—');
      // cooldown line
      const cdN=def.cooldown|0;
      const cdLine=t('Lehűlés')+': '+(cdN>0 ? (cdN+' '+t('kör')) : t('azonnali'));

      ctx.save();
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      const fName='bold '+(13*s)+'px '+FONT, fBody=(11*s)+'px '+FONT;
      ctx.font=fName; const w1=ctx.measureText(name).width;
      ctx.font=fBody; const w2=ctx.measureText(effect).width, w3=ctx.measureText(cdLine).width;
      const padX=10*s, padY=8*s, lh=15*s;
      const boxW=Math.max(w1,w2,w3)+padX*2;
      const boxH=padY*2+lh*3;
      // anchor: centered over the chip, clamped to the viewport, sitting ABOVE the bar
      let bx=btn.x+btn.w/2-boxW/2;
      bx=U.clamp(bx, 6*s, C.VIEW_W-boxW-6*s);
      let by=barTopY-12*s-boxH;
      if(by<6*s) by=btn.y+btn.h+8*s;       // not enough room above → drop below
      ctx.globalAlpha=0.97;
      ctx.fillStyle='rgba(14,10,22,0.95)'; rr(ctx,bx,by,boxW,boxH,9*s); ctx.fill();
      ctx.strokeStyle='rgba(214,170,255,0.6)'; ctx.lineWidth=1.5*s; rr(ctx,bx,by,boxW,boxH,9*s); ctx.stroke(); ctx.lineWidth=1;
      ctx.globalAlpha=1;
      let ty=by+padY+11*s;
      ctx.fillStyle='#ffd6f0'; ctx.font=fName; ctx.fillText(name, bx+padX, ty); ty+=lh;
      ctx.fillStyle='#dfe7ef'; ctx.font=fBody; ctx.fillText(effect, bx+padX, ty); ty+=lh;
      ctx.fillStyle='#9fb3c6'; ctx.fillText(cdLine, bx+padX, ty);
      ctx.restore();
    },

    /* ---------- on-screen mobile controls (MOBILE ONLY) ---------- */
    _touchControls(ctx){
      touchBtns=[];
      if(!IS_TOUCH) return;
      if(S.mode!==G.PLAYING || !isHumanTurn() || S.paused) return;
      const ui=metrics().ui;
      const tl=touchLayout(ui);
      const big=tl.big, pad=tl.pad, gap=tl.gap, bottom=tl.bottom;
      const A=0.28;
      const draw=(b,label,active)=>{
        ctx.fillStyle='rgba(20,30,40,'+(active?A+0.25:A)+')';
        rr(ctx,b.x,b.y,b.w,b.h,16*ui); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,'+(A+0.1)+')'; ctx.lineWidth=2; rr(ctx,b.x,b.y,b.w,b.h,16*ui); ctx.stroke(); ctx.lineWidth=1;
        ctx.fillStyle='rgba(255,255,255,0.92)'; ctx.font=(28*ui)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(label, b.x+b.w/2, b.y+b.h/2);
        ctx.textBaseline='alphabetic';
      };
      const reg=(x,y,kind,dir,id)=>{ const b={x,y,w:big,h:big,kind,dir,id}; touchBtns.push(b); return b; };

      // #39 left-handed: mirror the two clusters horizontally so the MOVE cluster
      // lives on the RIGHT and the AIM/FIRE+JUMP cluster on the LEFT.
      const lefty=!!(CA.settings&&CA.settings.leftHanded);
      // x-anchors for each cluster (origin = left edge of the cluster)
      const moveX0 = lefty ? (C.VIEW_W-2*big-gap-pad) : pad;          // move ◀▶ pair origin
      const aimWallX = lefty ? pad : (C.VIEW_W-big-pad);             // fire/jump x (against a wall)

      // MOVE cluster: ◀ ▶ on the bottom row only (jump moved to the AIM/FIRE side
      // for one-hand ergonomics — Jani's mobile feedback).
      const lb=reg(moveX0, bottom, 'move', -1, 'left');
      const rb=reg(moveX0+big+gap, bottom, 'move', 1, 'right');
      draw(lb,'◀', S.input.left);
      draw(rb,'▶', S.input.right);

      // NOTE: the bottom-CENTER is intentionally left FREE for the weapon panel
      // (Jani: the weapons must sit at the very bottom). The 🔄 switch-unit
      // button is removed on mobile for now (Q still switches on PC).

      // JUMP lives at the BOTTOM CORNER of the aim/fire wall (the spot the old
      // big End-Turn button used to occupy). On the default right-hand layout this
      // puts ⤴ on the RIGHT, under the firing thumb.
      const jb=reg(aimWallX, bottom, 'jump', 0, 'jump');
      draw(jb,'⤴', false);

      // AIM/FIRE/JUMP cluster (Jani mobil-feedback, kép alapján):
      //  - a ▲▼ célzó-nyilak LEJJEBB, az ugrásgomb melletti oszlop ALJÁRA
      //    (eddig magasan lebegtek, belógtak a játéktérbe);
      //  - a LŐ gomb NAGYOBB (a fal-oszlopban, az ugrásgomb FÖLÖTT, a hüvelykujj
      //    alatt) — eddig kicsi volt és a karakterre lógott.
      // Fal-oszlop (jobb szél): alul ⤴ ugrás, fölötte 🔥 LŐ.
      // Mellette (egy oszloppal beljebb): alul ▼, fölötte ▲ — a jump szintjéig le.
      const fbig = big;                              // LŐ ugyanakkora, mint a többi (nagyobb)
      const aimX = lefty ? (aimWallX+big+gap) : (aimWallX-big-gap);
      const ab_dn=reg(aimX, bottom, 'aim', -1, 'aimDown');            // alul (jump szintje)
      const ab_up=reg(aimX, bottom-big-gap, 'aim', 1, 'aimUp');       // fölötte
      // FIRE a fal-oszlopban, az ugrás FÖLÖTT
      const fvis={ x:aimWallX, y:Math.round(bottom-fbig-gap), w:fbig, h:fbig };
      const fb={ x:fvis.x, y:fvis.y, w:fvis.w, h:fvis.h, kind:'fire', dir:0, id:'fire' };
      touchBtns.push(fb);
      draw(ab_up,'▲', S.input.up);
      draw(ab_dn,'▼', S.input.down);
      ctx.fillStyle='rgba(200,60,50,'+(S.charging?0.85:0.5)+')';
      rr(ctx,fvis.x,fvis.y,fvis.w,fvis.h,18*ui); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=3; rr(ctx,fvis.x,fvis.y,fvis.w,fvis.h,18*ui); ctx.stroke(); ctx.lineWidth=1;
      ctx.fillStyle='#fff'; ctx.font='bold '+(20*ui)+'px '+FONT; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('🔥', fvis.x+fvis.w/2, fvis.y+fvis.h/2-8*ui);
      ctx.font='bold '+(15*ui)+'px '+FONT; ctx.fillText(t('LŐ'), fvis.x+fvis.w/2, fvis.y+fvis.h/2+15*ui);
      ctx.textBaseline='alphabetic';
    },

    /* ---------- mascots ---------- */
    _mascotCapy(ctx, x, y, sc){
      sc=sc||2.2;
      ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
      ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0,40,42,8,0,0,7); ctx.fill();
      ctx.fillStyle='#caa472';
      ctx.beginPath(); ctx.ellipse(0,8,40,30,0,0,7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-30,-12,22,20,0,0,7); ctx.fill();
      ctx.fillStyle='#3a2c1c';
      ctx.beginPath(); ctx.arc(-40,-16,3,0,7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-50,-6,6,5,0,0,7); ctx.fill();
      ctx.fillStyle='#a3835a'; ctx.beginPath(); ctx.arc(-24,-30,7,0,7); ctx.fill();
      ctx.restore();
    },
    _mascotWorm(ctx, x, y, sc){
      sc=sc||2.2;
      ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
      ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0,40,34,7,0,0,7); ctx.fill();
      ctx.strokeStyle='#7fc97f'; ctx.lineWidth=20; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-22,30); ctx.quadraticCurveTo(-30,-10,0,-18); ctx.quadraticCurveTo(28,-26,20,-44); ctx.stroke();
      ctx.lineWidth=1;
      ctx.fillStyle='#7fc97f'; ctx.beginPath(); ctx.arc(20,-44,13,0,7); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(24,-48,4,0,7); ctx.fill();
      ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(25,-48,2,0,7); ctx.fill();
      ctx.restore();
    },

    /* ====================================================================
     * weapon selection helpers
     * ==================================================================*/
    selectWeaponByIndex(i){
      const L=(CA.Weapons&&CA.Weapons.LIST)||[];
      const w=L[i]; if(!w || CA.ammoOf(w.id)===0) return;
      const u=CA.activeUnit&&CA.activeUnit();
      if(w.ability && u && u.cooldowns && u.cooldowns[w.id]>0) return;   // on cooldown
      if(CA.weaponAllowed && !CA.weaponAllowed(w.id)) return;            // weapon-set forbidden
      S.selectedWeapon=w.id; ensureWeaponVisible(w.id); if(CA.events)CA.events.emit('sfx','select');
    },
    cycleWeapon(d){
      // QA: cycle only the CURRENT hero's selectable weapons — class-filtered
      // (abilityWeaponsFor), not depleted, ability not on cooldown, and allowed by
      // the custom weapon-set rule. (Old code cycled the whole LIST incl. other
      // classes' + on-cooldown abilities.)
      const u=CA.activeUnit&&CA.activeUnit();
      let L=(u && typeof abilityWeaponsFor==='function') ? abilityWeaponsFor(u) : ((CA.Weapons&&CA.Weapons.LIST)||[]);
      L=L.filter(function(w){ return w && CA.ammoOf(w.id)!==0
        && !(w.ability && u && u.cooldowns && u.cooldowns[w.id]>0)
        && !(CA.weaponAllowed && !CA.weaponAllowed(w.id)); });
      if(!L.length) return;
      const dir=(d||1)>=0?1:-1;
      let i=L.findIndex(function(w){return w.id===S.selectedWeapon;});
      if(i<0) i = dir>0 ? -1 : 0;
      const ni=(i+dir+L.length)%L.length;
      S.selectedWeapon=L[ni].id;
      ensureWeaponVisible(L[ni].id);
      if(CA.events)CA.events.emit('sfx','select');
    },

    /* ====================================================================
     * helpers exposed for core.js
     * ==================================================================*/
    // The large chooser and compact strip share availability and selection.
    weaponDefs(u){
      u=u||(CA.activeUnit&&CA.activeUnit());
      const def=u&&CA.classOf?CA.classOf(u):null;
      return def&&Array.isArray(def.abilities)&&def.abilities.length
        ? abilityWeaponsFor(u) : filteredWeapons();
    },
    weaponUnavailable(id){ return weaponUnavailable(id); },
    hasIntroBanner(){ return _modeIntroT>=0 || !!(S._puzzle && _puzzleBannerT<8.4); },
    chooseWeapon(id){
      if(S.mode!==G.PLAYING || !isHumanTurn() || S.paused) return false;
      const list=this.weaponDefs();
      if(!list.some(w=>w.id===id) || weaponUnavailable(id)) return false;
      S.selectedWeapon=id;
      S._lastWeapon=id;
      ensureWeaponVisible(id);
      if(CA.events){ CA.events.emit('weaponChanged',id); CA.events.emit('sfx','select'); }
      return true;
    },
    // number-key weapon select (1..9,0 → slots 0..9 of the current ability/weapon bar)
    selectSlot(n){
      const u=CA.activeUnit(); if(!u || S.mode!==G.PLAYING) return;
      let list=null; try{ list = abilityWeaponsFor(u); }catch(_){}
      if(!list || !list.length) return;
      const w=list[n]; if(!w) return;
      // unavailable (depleted / on-cooldown / weapon-set-forbidden / spent) → ignore
      if(weaponUnavailable(w.id)) return;
      S.selectedWeapon=w.id; if(CA.events)CA.events.emit('sfx','select');
    },
    // ESC while in-game: settings sub-page → pause menu → resume → (else) pause.
    onEsc(){
      if(S.mode!==G.PLAYING) return;
      if(S.paused){ if(pauseHelp){ pauseHelp=false; } else if(pauseSettings){ pauseSettings=false; } else { S.paused=false; quitConfirm=false; } }
      else { S.paused=true; pauseSettings=false; pauseHelp=false; }
    },
    isTextInputActive(){
      if(CA.Armory && CA.Armory.isOpen()) return true;
      if(rebindAction) return true;
      // a focused DOM <input>/<textarea> (teamedit/login/duel-code) also counts —
      // so global key shortcuts never fire while the player is typing.
      try{ var ae=document.activeElement;
        if(ae && (ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.isContentEditable)) return true;
      }catch(_e){}
      if(S.mode===G.MENU && !!focusedField) return true;
      if(hasScreens() && CA.Screens.isTextInputActive){
        try{ if(CA.Screens.isTextInputActive()) return true; }catch(_){}
      }
      return false;
    },
    isUIHit(x,y){
      if(CA.Armory && CA.Armory.isOpen()) return true;
      const p={x,y};
      if(S.mode===G.MENU){
        if(isDelegatedScreen(screen)) return true; // delegated page owns the whole canvas
        for(const f of menuFields){ if(hit(f,p)) return true; }
        for(const s of menuSliders){ if(hit({x:s.x-8,y:s.y-10,w:s.w+16,h:s.h+20},p)) return true; }
        for(const b of menuBtns){ if(hit(b,p)) return true; }
        return false;
      }
      // pause overlay eats everything — EXCEPT for an online client (no overlay there)
      if(S.paused && S.mode===G.PLAYING && !(CA.Net && CA.Net.isClient && CA.Net.isClient())) return true;
      for(const b of hudBtns){ if(hit(b,p)) return true; }
      for(const b of abilityBtns){ if(hit(b,p)) return true; }
      for(const b of weaponBtns){ if(hit(b,p)) return true; }
      for(const b of weaponNav){ if(hit(b,p)) return true; }
      for(const b of touchBtns){ if(hit(b,p)) return true; }
      return false;
    }
  };

  /* ---------- module-private helpers ---------- */

  // a getter/setter wrapper for a focused text field, by key
  function fieldRef(key){
    if(key==='capybara') return { get:()=>ng.names.capybara, set:v=>ng.names.capybara=v };
    if(key==='worm')     return { get:()=>ng.names.worm,     set:v=>ng.names.worm=v };
    if(key && key.indexOf('team')===0){
      const i=parseInt(key.slice(4),10);
      if(ng.teams[i]) return { get:()=>ng.teams[i].name||'', set:v=>ng.teams[i].name=v };
    }
    if(key==='tename') return { get:()=>teEdit.name||'', set:v=>teEdit.name=v };
    if(key && key.indexOf('teu')===0){
      const i=parseInt(key.slice(3),10);
      if(teEdit.units[i]) return { get:()=>teEdit.units[i].name||'', set:v=>teEdit.units[i].name=v };
    }
    return null;
  }

  // ammo count of a weapon by id (-1 = infinite, 0 = depleted/non-selectable)
  function weaponAmmo(id){
    const w=((CA.Weapons&&CA.Weapons.LIST)||[]).find(x=>x.id===id);
    return w?CA.ammoOf(id):-1;
  }

  // a weapon is UNAVAILABLE (greyed & non-selectable) when depleted, its ability is
  // on cooldown, the weapon-set forbids it, or its shot is already spent this turn.
  // Mirrors the `out` predicate drawn in the weapon bar (drawHUD, ~line 3585).
  function weaponUnavailable(id){
    const u0=CA.activeUnit&&CA.activeUnit();
    const w=((CA.Weapons&&CA.Weapons.LIST)||[]).find(x=>x.id===id);
    const onCd=!!(w && w.ability && u0 && u0.cooldowns && u0.cooldowns[id]>0);
    const notAllow=!!(CA.weaponAllowed && !CA.weaponAllowed(id));
    const spent=!!(S.firedThisTurn && CA.isShotWeapon && CA.isShotWeapon(id));
    return CA.ammoOf(id)===0 || onCd || notAllow || spent;
  }

  // alpha bounding-box cache for weapon icons (keyed by id). The source PNGs have
  // inconsistent transparent padding, so drawing at a fixed size makes some icons
  // look small. We scan the image's alpha channel ONCE, find the opaque content
  // rect, cache it, and the bar draws that rect fitted into the cell — so every
  // icon fills its cell uniformly (like the rocket, whose box ≈ the full image).
  var _iconBox = {};
  function iconBBox(img, id){
    if(_iconBox.hasOwnProperty(id)) return _iconBox[id];
    if(!img || !img.complete || !img.naturalWidth) return null; // not ready yet — retry next frame
    try{
      const nw=img.naturalWidth, nh=img.naturalHeight;
      const cap=96;
      const s=Math.min(1, cap/Math.max(nw,nh));        // downscale big icons for a quick scan
      const cw=Math.max(1, Math.round(nw*s)), ch=Math.max(1, Math.round(nh*s));
      const cn=document.createElement('canvas'); cn.width=cw; cn.height=ch;
      const cx=cn.getContext('2d');
      cx.clearRect(0,0,cw,ch);
      cx.drawImage(img, 0,0, cw,ch);
      const d=cx.getImageData(0,0,cw,ch).data;
      let minX=cw, minY=ch, maxX=-1, maxY=-1;
      for(let yy=0; yy<ch; yy++){
        for(let xx=0; xx<cw; xx++){
          if(d[(yy*cw+xx)*4+3] > 24){
            if(xx<minX) minX=xx; if(xx>maxX) maxX=xx;
            if(yy<minY) minY=yy; if(yy>maxY) maxY=yy;
          }
        }
      }
      if(maxX<minX || maxY<minY){ _iconBox[id]=null; return null; } // fully transparent
      // back to image-natural coordinates
      const inv=1/s;
      const box={ sx:minX*inv, sy:minY*inv, sw:(maxX-minX+1)*inv, sh:(maxY-minY+1)*inv, w:nw, h:nh };
      _iconBox[id]=box;
      return box;
    }catch(_e){
      _iconBox[id]=null; return null; // tainted/other failure → fall back to full-image draw
    }
  }

  function unlockedSpecies(){
    const all=(CA.Species)?Object.keys(CA.Species).filter(k=>CA.Species[k] && CA.Species[k].id):[];
    if(!all.length) return ['capybara','worm'];
    if(CA.Meta && CA.Meta.isUnlocked){
      const u=all.filter(id=>CA.Meta.isUnlocked(id));
      return u.length?u:['capybara','worm'];
    }
    return all;
  }

  // make sure the selected weapon is on the current page/tab so highlight is visible
  function ensureWeaponVisible(id){
    const cat=WCATS.find(c=>c.id===wcat);
    if(cat && cat.cats){
      const w=((CA.Weapons&&CA.Weapons.LIST)||[]).find(x=>x.id===id);
      if(w && cat.cats.indexOf(w.category)<0) wcat='all';
    }
    const L=filteredWeapons();
    const idx=L.findIndex(x=>x.id===id);
    if(idx<0) return;
    const perPage=Math.max(1, Math.floor((C.VIEW_W-200)/(60+8)));
    weaponPage=Math.floor(idx/perPage);
  }

  function prettyCode(code){
    if(!code) return '—';
    if(code.indexOf('Key')===0) return code.slice(3);
    if(code.indexOf('Digit')===0) return code.slice(5);
    if(code.indexOf('Arrow')===0) return code.slice(5);
    const map={Space:'␣',Enter:'⏎',Tab:'⇥',ShiftLeft:'⇧L',ShiftRight:'⇧R',
      ControlLeft:'CtrlL',ControlRight:'CtrlR',Escape:'Esc',Backquote:'`'};
    return map[code]||code;
  }

  // v4: the player's chosen class spread for the New Game classic team.
  // Returns a TEAM_SIZE-long array of valid class ids, or [] when the class
  // system is absent / the player left it on the mixed default (let core decide).
  function playerClassList(){
    const ids=classIds();
    if(!ids.length) return [];
    const def=defaultClasses();
    const arr=(Array.isArray(ng.classes)&&ng.classes.length===C.TEAM_SIZE)?ng.classes:def;
    // keep only valid ids; fall back to the default for any stale/missing slot
    return arr.map((c,i)=> (c&&ids.indexOf(c)>=0) ? c : def[i] );
  }
  // Stamp a class spread onto an explicit team config: both team.classes (read by
  // entities via team.classes[idx]) AND per-unit units[i].cls (read first, so it
  // works even if core doesn't forward team.classes).
  function applyClasses(team, classes){
    if(!team || !Array.isArray(classes) || !classes.length) return;
    team.classes=classes.slice();
    const units=Array.isArray(team.units)?team.units.slice():[];
    for(let i=0;i<C.TEAM_SIZE;i++){
      units[i]=Object.assign({}, units[i]||{}, { cls:classes[i] });
    }
    team.units=units;
  }

  // Start a game from the New Game screen using the current selection.
  function startNewGame(){
    focusedField=null;
    // never launch a locked/unfinished mode (defensive — the UI already blocks it)
    if(!isModeUnlocked(ng.gameMode)) ng.gameMode='classic';
    const opts={
      gameMode: ng.gameMode,
      theme: ng.theme,
      weather: ng.weather,
      risingWater: ng.risingWater,
      aiLevel: ng.aiLevel,
    };

    // v4: the player's chosen class spread (length TEAM_SIZE, or [] = mixed).
    const playerClasses=playerClassList();

    if(ng.gameMode==='classic'){
      // If the player picked a SAVED team, build an explicit 2-team config so the
      // saved per-unit species/names/cosmetics are honoured (player vs AI).
      const saved=loadTeams();
      if(ng.savedTeam>=0 && saved[ng.savedTeam]){
        const player=teamConfigFromDraft(saved[ng.savedTeam]);
        if(ng.names.capybara.trim()) player.name=ng.names.capybara.trim();
        applyClasses(player, playerClasses);
        const aiSp = player.species==='worm' ? 'capybara' : 'worm';
        opts.teams=[ player,
          { name:(ng.names.worm.trim())||CA.t('Ellenfél'), species:aiSp, kind:aiSp,
            isAI: !ng.twoPlayer, aiLevel: ng.aiLevel } ];
      } else if(playerClasses.length){
        // No saved team, but classes were chosen — build an explicit player team
        // so the per-unit classes reach entities (core forwards units + classes).
        const player={ name:(ng.names.capybara.trim())||(CA.rosterOf?CA.rosterOf('capybara').team:'Capybarák'),
                       species:'capybara', kind:'capybara', isAI:false, aiLevel:0 };
        applyClasses(player, playerClasses);
        opts.teams=[ player,
          { name:(ng.names.worm.trim())||CA.t('Ellenfél'), species:'worm', kind:'worm',
            isAI: !ng.twoPlayer, aiLevel: ng.aiLevel } ];
      } else {
        opts.vsAI = !ng.twoPlayer;
        opts.teamNames={ capybara:ng.names.capybara.trim(), worm:ng.names.worm.trim() };
      }
    } else if(ng.gameMode==='ffa'){
      opts.teams = ng.teams.map((t,i)=>({
        species: t.species,
        name: (t.name&&t.name.trim()) || (CA.t('Csapat')+' '+(i+1)),
        isAI: !!t.isAI,
        aiLevel: ng.aiLevel,
      }));
    }
    // (campaign/survival/arcade/forts: the mode's setup() builds teams)

    unlockAudio();
    if(CA.enterFullscreen) CA.enterFullscreen();
    lastNewGameOpts=opts; victoryShown=false;   // stash for the victory "🔄 Újra"
    CA.newGame(opts);
  }

  // Build an explicit team config from the team-editor draft (or a saved team
  // record). units:[{species,name,cosmetic}] is honoured by spawnTeams +
  // entities (per-unit species & cosmetic override the deterministic defaults).
  function teamConfigFromDraft(t){
    const units=(t.units||[]).map(u=>({
      species: u.species||'capybara',
      name: (u.name||'').trim(),
      cosmetic: u.cosmetic||'plain',
    }));
    const first=(units[0]&&units[0].species)||'capybara';
    return {
      name:(t.name&&t.name.trim())||CA.t('Csapatom'),
      species:first, kind:first, isAI:false, aiLevel:0,
      units,
    };
  }

  // Launch a match from the team editor: the draft becomes the player's team,
  // with a single AI opponent (a worm crew) so it works without FFA setup.
  function teStartGame(){
    focusedField=null;
    const player=teamConfigFromDraft(teEdit);
    const aiSpecies = player.species==='worm' ? 'capybara' : 'worm';
    const opts={
      gameMode:'ffa',                 // ffa reads opts.teams verbatim
      theme:'jungle', weather:'clear', risingWater:false, aiLevel:1,
      teams:[ player,
              { name:CA.t('Ellenfél'), species:aiSpecies, kind:aiSpecies, isAI:true, aiLevel:1 } ],
    };
    unlockAudio();
    if(CA.enterFullscreen) CA.enterFullscreen();
    lastNewGameOpts=opts; victoryShown=false;   // stash for the victory "🔄 Újra"
    CA.newGame(opts);
  }

  // Build replay options that re-create the just-finished match.
  function buildReplayOpts(){
    const o={ gameMode:S.gameMode, theme:S.theme, risingWater:S.risingWater };
    if(S.weather&&S.weather.type) o.weather=S.weather.type;
    if(S.gameMode==='classic'){
      const t0=S.teams[0], t1=S.teams[1];
      o.vsAI = !!(t1&&t1.isAI);
      o.aiLevel = (t1&&t1.aiLevel)||1;
      o.teamNames = { capybara:t0?t0.name:'', worm:t1?t1.name:'' };
    } else if(S.gameMode==='campaign'){
      o.level = (S.modeData&&S.modeData.level)||1;
    } else if(S.gameMode==='ffa'){
      o.teams = S.teams.map(t=>({ species:t.species||t.kind, name:t.name, isAI:t.isAI, aiLevel:t.aiLevel, color:t.color }));
    }
    return o;
  }

  // shared geometry for the on-screen touch pad — used by both the pad renderer
  // and the weapon panel so they never overlap. Each side cluster occupies a
  // horizontal band of width `padRight` from its wall, and rises to y=`top`.
  // ---- bottom safe-area inset (iOS home indicator), in CSS px, cached ----------
  // env(safe-area-inset-bottom) isn't readable from JS directly, so we probe it
  // with a throwaway off-screen element whose paddingBottom is set to the env().
  // The canvas works in BACKING px, so callers multiply this by the dpr.
  let _safeBottomCss=-1;                    // -1 = not measured yet
  function safeAreaBottomCss(){
    if(_safeBottomCss>=0) return _safeBottomCss;
    let px=0;
    try{
      const probe=document.createElement('div');
      probe.style.cssText='position:fixed;left:-9999px;bottom:0;width:0;height:0;'+
        'padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;';
      document.body.appendChild(probe);
      px=parseFloat(getComputedStyle(probe).paddingBottom)||0;
      document.body.removeChild(probe);
    }catch(_){ px=0; }
    _safeBottomCss = (isFinite(px)&&px>0) ? px : 0;
    return _safeBottomCss;
  }
  // ---- top safe-area inset (iOS notch / status-bar), in CSS px, cached --------
  // Same throwaway-probe trick as the bottom inset. On a notched phone the canvas
  // origin can sit UNDER the status bar / notch, so anything drawn at a small
  // constant y (e.g. the pause-settings Back button) would be untappable. Callers
  // multiply by dpr to convert CSS px → backing px.
  let _safeTopCss=-1;                       // -1 = not measured yet
  function safeAreaTopCss(){
    if(_safeTopCss>=0) return _safeTopCss;
    let px=0;
    try{
      const probe=document.createElement('div');
      probe.style.cssText='position:fixed;left:-9999px;top:0;width:0;height:0;'+
        'padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;';
      document.body.appendChild(probe);
      px=parseFloat(getComputedStyle(probe).paddingTop)||0;
      document.body.removeChild(probe);
    }catch(_){ px=0; }
    _safeTopCss = (isFinite(px)&&px>0) ? px : 0;
    return _safeTopCss;
  }
  // ---- horizontal safe-area insets (curved corners / notch on landscape), CSS px,
  // cached. On phones the top-edge HUD elements (team label left, mute/pause/
  // end-turn + rosters right) get clipped by rounded corners / the notch ear.
  // We probe env(safe-area-inset-left/right) the same throwaway-element way and
  // pull those elements a touch further IN. Callers multiply by dpr (CSS→backing).
  let _safeLeftCss=-1, _safeRightCss=-1;    // -1 = not measured yet
  function _probeInset(side){
    let px=0;
    try{
      const probe=document.createElement('div');
      probe.style.cssText='position:fixed;left:-9999px;top:0;width:0;height:0;'+
        'padding-'+side+':env(safe-area-inset-'+side+',0px);visibility:hidden;pointer-events:none;';
      document.body.appendChild(probe);
      px=parseFloat(getComputedStyle(probe)['padding'+side.charAt(0).toUpperCase()+side.slice(1)])||0;
      document.body.removeChild(probe);
    }catch(_){ px=0; }
    return (isFinite(px)&&px>0) ? px : 0;
  }
  function safeAreaLeftCss(){
    if(_safeLeftCss>=0) return _safeLeftCss;
    _safeLeftCss=_probeInset('left'); return _safeLeftCss;
  }
  function safeAreaRightCss(){
    if(_safeRightCss>=0) return _safeRightCss;
    _safeRightCss=_probeInset('right'); return _safeRightCss;
  }
  // Backing-px horizontal insets for the top HUD row. Touch only — desktop gets 0
  // so nothing shifts on PC. Returns {l, r} already scaled by dpr.
  function topHudInsetPx(M){
    if(!IS_TOUCH) return { l:0, r:0 };
    const dpr=((M&&M.dpr)||(metrics().dpr)||1);
    return { l:Math.round(safeAreaLeftCss()*dpr), r:Math.round(safeAreaRightCss()*dpr) };
  }
  // Re-measure on orientation/resize (a landscape↔portrait flip changes the inset).
  try{
    window.addEventListener('resize', ()=>{ _safeBottomCss=-1; _safeTopCss=-1; _safeLeftCss=-1; _safeRightCss=-1; });
    window.addEventListener('orientationchange', ()=>{ _safeBottomCss=-1; _safeTopCss=-1; _safeLeftCss=-1; _safeRightCss=-1; });
  }catch(_){}

  function touchLayout(ui){
    ui=ui||1;
    const big=64*ui, pad=16*ui, gap=10*ui;
    // honour the iOS home-indicator: lift the whole bottom row by the inset so
    // the buttons don't sit UNDER the home bar. inset is CSS px → scale by dpr.
    const dpr=(metrics().dpr)||1;
    const inset=safeAreaBottomCss()*dpr;
    const bottom=C.VIEW_H-big-pad-inset;    // y of the bottom button row
    const top=bottom-big-gap;               // y of the upper buttons (jump/aimUp)
    const padRight=2*big+pad+gap;           // band a side cluster spans from the wall
    return { big, pad, gap, bottom, top, padRight, inset };
  }

  // #39 haptics: short vibration on hit/fire when enabled and supported.
  function doHaptic(ms){
    try{
      if(CA.settings && CA.settings.haptics && navigator && navigator.vibrate){
        navigator.vibrate(ms||15);
      }
    }catch(_){}
  }

  function toggleMute(){
    const cur = (CA.Audio&&CA.Audio.muted) || (CA.settings&&CA.settings.muted);
    const nv=!cur;
    if(CA.Audio) CA.Audio.muted=nv;
    if(CA.settings){ CA.settings.muted=nv; }   // session-only: do NOT persist (Jani)
    try{ localStorage.removeItem('ca_muted'); }catch(_){}
    if(!nv){ unlockAudio(); CA.Audio&&CA.Audio.play&&CA.Audio.play('select'); }
  }

  // slider drag -> set CA.settings[key].  A slider may carry a {min,max} range
  // (e.g. aimSensitivity 0.5..2.0); without one it maps to the 0..1 default.
  function setSliderFromPointer(sl, p){
    if(!CA.settings) return;
    const t=U.clamp((p.x-sl.x)/sl.w, 0, 1);
    if(sl.min!=null && sl.max!=null){
      const v=sl.min + t*(sl.max-sl.min);
      CA.settings[sl.key]=Math.round(v*20)/20;   // 0.05 steps
    } else {
      CA.settings[sl.key]=Math.round(t*100)/100;
    }
  }

  // ---- touch hold helpers ----
  function applyTouch(b, down){
    switch(b.kind){
      case 'move':
        if(b.dir<0) S.input.left=down; else S.input.right=down;
        break;
      case 'aim':
        if(b.dir>0) S.input.up=down; else S.input.down=down;
        break;
      case 'jump':
        if(down && CA.canControl && CA.canControl()){
          if(CA.Entities&&CA.Entities.jump) CA.Entities.jump(CA.activeUnit());
        }
        break;
      case 'switch':
        if(down && CA.switchUnit) CA.switchUnit();
        break;
      case 'fire':
        if(down){ if(CA.firePress) CA.firePress(); else if(CA.canControl&&CA.canControl()){ S.charging=true; } }
        break;
    }
  }
  function releaseTouch(ap){
    switch(ap.kind){
      case 'move':
        if(ap.dir<0) S.input.left=false; else S.input.right=false;
        break;
      case 'aim':
        if(ap.dir>0) S.input.up=false; else S.input.down=false;
        break;
      case 'fire':
        if(S.selectedWeapon==='parachute'){ const u=CA.activeUnit(); if(u && u.parachute>0) u.parachute=0; S.charging=false; break; }
        if(S.charging){
          S.charging=false;
          const u=CA.activeUnit();
          if(u && CA.canControl && CA.canControl() && CA.Weapons && CA.Weapons.fireCharged){
            CA.Weapons.fireCharged(u, S.selectedWeapon, S.power);
          }
          S.power=0;
        }
        break;
    }
  }
})();
