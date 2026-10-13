/* ============================================================================
 * Squeak & Destroy — HTML MENU framework (DOM overlay).
 * Replaces the canvas-drawn menus with a real, consistent HTML/CSS UI. Gameplay
 * stays on the canvas. This module owns: main menu, New Game, Settings (more to
 * come). Screens NOT yet converted fall back to the legacy canvas UI seamlessly.
 *
 * Sync model: the single source of truth is CA.UI.screen() + CA.state.mode.
 *  - mode!==MENU            -> hide the whole overlay (gameplay).
 *  - mode===MENU & DOM_SCREENS[screen] -> show that DOM screen (canvas menu is a no-op).
 *  - mode===MENU & other screen        -> hide overlay, legacy canvas renders it.
 * ==========================================================================*/
(function(){
  const S = CA.state;
  const T = (s)=> (CA.t ? CA.t(s) : s);
  // screens this DOM module renders (everything else stays on the canvas for now)
  const DOM_SCREENS = { main:1, newgame:1, settings:1 };

  /* ---- English translations for the HTML menu chrome (home / New Game /
   *      Settings). Keys must match the Hungarian literals / data-t values
   *      used below EXACTLY. ---- */
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    // home
    'Cuki, de halálos':'Cute. But Deadly.',
    'Új játék':'New Game', 'Csapat szerkesztő':'Team Editor', 'Képességfa':'Skill Tree',
    'Beállítások':'Settings', 'Készítők':'Credits', 'Profil':'Profile',
    'Ranglista':'Leaderboard', 'Eredmények':'Achievements', 'Szerkesztő':'Editor',
    'Súgó':'Help', 'Kapcsolat':'Contact', 'Több':'More',
    '✨ Reklámmentesség feloldása':'✨ Unlock Ad-Free', '🙏 Hamarosan — köszönjük a támogatást!':'🙏 Coming soon — thanks for the support!',
    '✅ Reklámmentes — feloldva':'✅ Ad-Free — unlocked', '⏳ Vásárlás folyamatban…':'⏳ Purchasing…',
    '🎉 Köszönjük! Reklámmentes mód aktív.':'🎉 Thank you! Ad-Free is active.', 'A bolt jelenleg nem elérhető.':'The store is not available right now.',
    '↺ Vásárlások visszaállítása':'↺ Restore purchases', '✅ Visszaállítva!':'✅ Restored!',
    'Nem találtunk korábbi vásárlást.':'No previous purchase found.',
    // new game
    'Mód':'Mode', 'Klasszikus':'Classic', 'Pálya':'Map', 'Véletlen':'Random',
    'Capybarák vs Worm-ök, 2 csapat.':'Capybaras vs Wrigglers, 2 teams.',
    'Időjárás':'Weather', 'Tiszta':'Clear', 'Eső':'Rain', 'Hó':'Snow',
    'Köd':'Fog', 'Vihar':'Storm',
    'Opciók':'Options', 'Emelkedő víz':'Rising Water', 'Ultimate / csapat':'Ultimate / team', 'Gép szintje':'AI Level',
    'Könnyű':'Easy', 'Normál':'Normal', 'Nehéz':'Hard',
    'A csapatod osztályai':'Your Team Classes', 'Véletlen mix':'Random Mix', 'Indítás':'Start',
    'Véletlen csapat':'Random team', 'Gyors indítás':'Quick start', 'Meglepetés':'Surprise',
    'Becsült hossz':'Est. length', 'perc':'min',
    'A te csapatod':'Your Team', 'Player 1 csapata':'Player 1 team', 'Player 2 csapata':'Player 2 team',
    'Ellenfél csapata (gép)':'Opponent team (AI)',
    'Teljesítmény: alacsony minőség':'Performance: low quality',
    'Kukac':'Worm', 'Sün':'Hedgehog', 'Béka':'Frog', 'Bagoly':'Owl', 'Madár':'Bird', 'Denevér':'Bat', 'Hód':'Beaver',
    'Róka':'Fox', 'Macska':'Cat', 'Pingvin':'Penguin',
    'Egységek / csapat':'Units / team', 'Csapatok':'Teams', 'Bejelentkezve:':'Signed in:', 'Bejelentkezés szükséges':'Sign in required',
    // per-team configurator (FFA / AI vs AI hot-seat)
    'Csapat-beállítás':'Team setup', 'Ember':'Human', 'Gép':'AI', 'Faj':'Species',
    'Csapat':'Team', 'Player':'Player',
    // animal-team names (3+ team free-for-all)
    'Capybarák':'Capybaras', 'Worm-ök':'Wrigglers', 'Sünök':'Hedgehogs', 'Békák':'Frogs',
    'Baglyok':'Owls', 'Madarak':'Birds', 'Koalák':'Koalas', 'Denevérek':'Bats', 'Hódok':'Beavers',
    'Rókák':'Foxes', 'Macskák':'Cats', 'Pingvinek':'Penguins',
    // settings
    'Általános':'General', 'Nyelv':'Language', 'Hang':'Sound',
    'Zene hangerő':'Music Volume', 'Effekt hangerő':'SFX Volume', 'Dinamikus zene':'Dynamic Music',
    'Játék':'Game', 'Minőség':'Quality', 'Alacsony':'Low', 'Magas':'High',
    'Röppálya':'Trajectory', 'Kényelem':'Accessibility',
    'Célzás-érzékenység':'Aim Sensitivity', 'Balkezes':'Left-handed', 'Rezgés':'Haptics',
    'Színvak mód':'Colorblind Mode', 'Mozgáscsökkentés':'Reduced Motion', 'KI':'OFF',
    // home meta nav
    'Napi jutalom':'Daily Reward', 'Bolt':'Shop', 'Szezon':'Season',
    // custom rule-set editor
    'Egyedi szabályok':'Custom Rules', 'Kezdő HP':'Starting HP', 'Kör ideje':'Turn Time',
    'Visszavonulás':'Retreat Time', 'Szél':'Wind', 'Szél erőssége':'Wind Strength',
    'Hirtelen halál':'Sudden Death', 'Vízszint emelkedés':'Water Rise',
    'SD: 1 HP-ra vág':'SD: cap to 1 HP', 'Fegyverkészlet':'Weapon Set',
    'Mind':'All', 'Közelharc':'Melee', 'Robbanó':'Explosive', 'Csak láda':'Crate only',
    // rule presets (Gyors sablonok). 'Klasszikus' already mapped above.
    'Gyors':'Fast', 'Hardcore':'Hardcore', 'Béke':'Peace',
    // micro-mode names (also defined in modes.js, kept here for menu i18n pass)
    'Golf':'Golf', 'Verseny':'Race', 'Utolsó állás':'Last Stand',
    // re-enabled stable game-mode names (HU defined in modes.js m.name; EN here)
    'Oktató':'Tutorial', 'Kampány':'Campaign', 'Túlélő':'Survival',
    'Király a hegyen':'King of the Hill', 'Erődök':'Forts',
    'Gauntlet':'Gauntlet', 'Bossrohamok':'Boss Rush', 'Védd a fészket':'Defend the Nest',
    'Gyors meccs':'Quick Match', 'Napi kihívás':'Daily Challenge',
    // shared chrome
    'Vissza':'Back', 'Bezár':'Close', 'Hamarosan':'Coming soon',
    'Nyílt forráskódú · GitHub':'Open source · GitHub',
    'Bővített beállítások':'Advanced settings', 'Egyszerű nézet':'Simple view',
    // saved-team picker (play a team built in the Team Editor)
    'Mentett csapat':'Saved team', 'Nincs (alap csapat)':'None (default team)',
    'Még nincs mentett csapat. Hozz létre egyet a Csapat szerkesztőben.':'No saved teams yet. Create one in the Team Editor.',
    'Névtelen csapat':'Unnamed team', 'egység':'units',
    // saved-map picker (play a map built in the level Editor)
    'Mentett pálya':'Saved map', 'Generált (véletlen)':'Generated (random)',
    // map preview modal (tap the New Game preview for a large view + biome blurb)
    'Pálya előnézet':'Map preview', 'Nagyításhoz koppints':'Tap to enlarge',
    // per-biome gameplay blurbs (shown big in the preview modal)
    'zárt barlang, belső kavernák':'enclosed cave, inner caverns',
    'szigetek nyílt tenger felett — a vízbe lökés halálos':'islands over open sea — knocking into the water is lethal',
    'nincs talaj, lebegő platformok — leesés = halál':'no ground, floating platforms — falling = death',
    'lávás terep, forró felszín':'lava terrain, scorching surface',
    'kísérteties, szélesebb pálya':'eerie, wider arena',
    'cukor-világ, édes domborzat':'candy world, sweet terrain',
    'tengerpart, lágy homok':'seaside, soft sand',
    'csúszós hó, fagyott felszín':'slippery snow, frozen surface',
    'dűnék, nyílt sivatag':'dunes, open desert',
    'dús dzsungel, sűrű növényzet':'lush jungle, dense foliage',
    'alacsony grav-érzet, állomás-folyosók':'low-grav feel, station corridors',
    'kísértetjárta, sötét pálya':'haunted, dark arena',
    'füves mező, klasszikus terep':'grassy meadow, classic terrain',
  });

  let root=null, screens={}, built=false, curScreen='main', visible=false;
  const onShowFns={};        // id -> fn() called when that screen becomes active
  const onHideFns={};        // id -> fn() called when that screen stops being active (timer/RAF teardown)
  let pending=[];            // registrations queued before build()
  let lastActive=null;

  function el(tag, cls, html){ const e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
  function setScreen(s){ if(CA.UI&&CA.UI.setScreen) CA.UI.setScreen(s); curScreen=s; sync(true); }

  /* ---------------------------------------------------------------- HOME --- */
  function buildHome(){
    const sc=el('section','screen','');
    const home=el('div','home');

    const brand=el('div','home-brand');
    const img=el('img'); img.alt='Animal Battle Ground'; img.src='assets/logo.png';
    // the logo PNG IS the wordmark → drop the duplicate gradient text title; keep
    // just the tagline ("Cuki, de halálos" / "Cute. But Deadly.") under the logo.
    const tag=el('div','home-tagline'); tag.dataset.t='Cuki, de halálos';
    brand.append(img,tag);

    const menu=el('div','home-menu');
    // screens that require a signed-in account (else inactive)
    const NEEDS_LOGIN={ teamedit:1, skilltree:1, lobby:1, profile:1, achievements:1 };
    const gated=[]; // {b, scr, ic, label, cls}
    // DEMO MODE: only these home destinations stay active; everything else on the
    // home screen is locked + disabled. Robust allowlist (see CA.DEMO).
    // Súgó + Kapcsolat stay reachable in demo (info-only, not gameplay).
    const DEMO_ALLOWED={ newgame:1, settings:1, credits:1, help:1, contact:1 };
    const demoButtons=[]; // {b, scr} — every home/economy button (for demo lock pass)
    function isDemo(){ try{ return !!(window.CA && CA.DEMO); }catch(e){ return false; } }
    // Apply the demo lock to a single button: lock visual + disabled when the
    // destination isn't in the allowlist. Returns true if it locked the button.
    function applyDemoLock(b, scr){
      if(!isDemo()) return false;
      if(DEMO_ALLOWED[scr]) return false;
      b.disabled=true; b.classList.add('locked');
      if(!/🔒/.test(b.innerHTML)) b.innerHTML += ' 🔒';
      return true;
    }
    function paintDemo(){ demoButtons.forEach(d=>{ applyDemoLock(d.b, d.scr); }); }
    // account / login status button — logged in → Profile, logged out → Login screen.
    const acctBtn=el('button','btn btn--ghost btn--block','');
    acctBtn.onclick=()=>setScreen((CA.Account&&CA.Account.user)?'profile':'login');
    function paintAcct(){ const A=CA.Account||{}; const u=A.user;
      acctBtn.innerHTML = u ? ('🟢 <span data-t="Bejelentkezve:">Bejelentkezve:</span> '+esc(u.name||''))
                            : ('🔑 <span data-t="Fiók">Fiók</span>'); applyI18n(acctBtn); }
    function paintGate(){ const li=!!(CA.Account&&CA.Account.user);
      // logged-out gated buttons are now truly INACTIVE: keep the lock visual but
      // also disable so they can't be clicked. (Login stays reachable via the
      // account/profile button at the top.)
      gated.forEach(g=>{ g.b.disabled=!li; g.b.classList.toggle('locked', !li);
        g.b.title = li?'' : (T('Bejelentkezés szükséges'));
        g.b.innerHTML='<span>'+g.ic+'</span> <span data-t="'+g.label+'">'+g.label+'</span>'+(li?'':' 🔒');
        applyI18n(g.b); });
      // re-apply the demo lock so it survives login-state repaints (it overrides
      // and locks/disables every non-allowlisted home + economy button).
      paintDemo(); }
    function repaint(){ paintAcct(); paintGate(); }
    repaint(); try{ if(CA.events) CA.events.on('accountChanged', repaint); }catch(e){}
    // ✨ Ad-free unlock — LIVE purchase flow via CA.Entitlement (RevenueCat-shaped).
    // Shown ONLY on a native store build (Capacitor/Steam: canBuy()). On web it
    // stays hidden (the web build is the free, fully-unlocked funnel). When the
    // wrapper hasn't wired window.Purchases yet, purchase() resolves with an
    // honest "store unavailable" error instead of the old fake "Hamarosan".
    const _ENT = CA.Entitlement;
    const adFreeBtn=el('button','btn btn--gold btn--block','');
    function _adFreeLabel(){
      if (_ENT && _ENT.isFull && _ENT.isFull()){
        adFreeBtn.innerHTML='<span data-t="✅ Reklámmentes — feloldva">✅ Reklámmentes — feloldva</span>';
        adFreeBtn.disabled = true;
      } else {
        const pr = (_ENT && _ENT.price) ? (' ('+_ENT.price+')') : '';
        adFreeBtn.innerHTML='<span data-t="✨ Reklámmentesség feloldása">✨ Reklámmentesség feloldása</span>'+esc(pr);
        adFreeBtn.disabled = false;
      }
      applyI18n(adFreeBtn);
    }
    adFreeBtn.onclick=()=>{
      if (!_ENT || !_ENT.purchase || (_ENT.isFull && _ENT.isFull())) return;
      adFreeBtn.disabled = true;
      adFreeBtn.innerHTML='<span data-t="⏳ Vásárlás folyamatban…">⏳ Vásárlás folyamatban…</span>'; applyI18n(adFreeBtn);
      _ENT.purchase().then((res)=>{
        if (res && res.ok){
          adFreeBtn.innerHTML='<span data-t="🎉 Köszönjük! Reklámmentes mód aktív.">🎉 Köszönjük! Reklámmentes mód aktív.</span>'; applyI18n(adFreeBtn);
          setTimeout(_adFreeLabel, 2200);
        } else {
          const msg = (res && res.err) ? res.err : T('A bolt jelenleg nem elérhető.');
          adFreeBtn.innerHTML='<span>'+esc(msg)+'</span>';
          setTimeout(_adFreeLabel, 2600);
        }
      }).catch(()=>{ _adFreeLabel(); });
    };
    // Apple App Review REQUIRES a visible "Restore purchases" entry point.
    const restoreBtn=el('button','btn btn--ghost btn--sm btn--block','<span data-t="↺ Vásárlások visszaállítása">↺ Vásárlások visszaállítása</span>');
    restoreBtn.onclick=()=>{
      if (!_ENT || !_ENT.restore) return;
      restoreBtn.disabled=true;
      _ENT.restore().then((res)=>{
        restoreBtn.disabled=false;
        const msg = (res && res.ok) ? T('✅ Visszaállítva!') : ((res && res.err) || T('Nem találtunk korábbi vásárlást.'));
        try{ CA.events.emit('toast', msg); }catch(e){}
        _adFreeLabel();
      }).catch(()=>{ restoreBtn.disabled=false; });
    };
    try{ if(CA.events) CA.events.on('entitlementChanged', _adFreeLabel); }catch(e){}
    _adFreeLabel();
    // DEMO = web/native trial (no ads, no accounts there) → hide BOTH the ad-free
    // unlock and the account/login (Jani: demón ezek értelmetlenek).
    // The purchase UI only appears where there is actually a store: canBuy()
    // (Capacitor iOS/Android free+IAP build, or Steam demo). Web keeps it hidden.
    if(!CA.DEMO && _ENT && _ENT.canBuy && _ENT.canBuy()){
      menu.appendChild(adFreeBtn);
      menu.appendChild(restoreBtn);
    }
    if(!CA.DEMO){ menu.appendChild(acctBtn); }
    // ▶ Folytatás — csak ha van mentett meccs (ca_save). A pause→Főmenű eddig
    // egyirányú ajtó volt, pedig a CA.saveGame/loadGame létezik (backlog #8).
    const resumeBtn=el('button','btn btn--lg btn--block btn--green',
      '<span>▶</span> <span data-t="Folytatás">Folytatás</span>');
    resumeBtn.onclick=()=>{ try{ if(CA.loadGame && CA.loadGame()){ return; } }catch(e){} setScreen('newgame'); };
    function paintResume(){ try{ resumeBtn.style.display = (CA.hasSave && CA.hasSave()) ? '' : 'none'; }catch(e){ resumeBtn.style.display='none'; } }
    paintResume();
    menu.appendChild(resumeBtn);
    try{ if(CA.events){ ['gameSaved','gameOver','accountChanged'].forEach(ev=>CA.events.on(ev, paintResume)); } }catch(e){}
    onShowFns['main']=(function(prev){ return function(){ try{ if(prev) prev(); }catch(e){} paintResume(); }; })(onShowFns['main']);
    const big=[
      ['🎮','Új játék','newgame','btn--green'],
      ['🗓️','Napi kihívás','challenge','btn--purple'],
      ['🧩','Fejtörők','puzzles','btn--green'],
      ['👥','Csapat szerkesztő','teamedit','btn'],
      ['🌳','Képességfa','skilltree','btn--purple'],
      ['🌐','Multiplayer','lobby','btn--red'],
      ['✏️','Szerkesztő','editor','btn'],
      ['⚙️','Beállítások','settings','btn'],
    ];
    big.forEach(([ic,label,scr,cls])=>{
      const b=el('button','btn btn--lg btn--block '+cls,'<span>'+ic+'</span> <span data-t="'+label+'">'+label+'</span>');
      b.onclick=()=>{ if(NEEDS_LOGIN[scr] && !(CA.Account&&CA.Account.user)){ setScreen('login'); return; } setScreen(scr); };
      if(NEEDS_LOGIN[scr]) gated.push({b,scr,ic,label,cls});
      demoButtons.push({b,scr});
      menu.appendChild(b);
    });
    // ---- HUB: a single "📂 Több" button opens the secondary screens, which share
    // a top tab-bar (Profil · Ranglista · Eredmények · Pörgetés · Bolt · Szezon ·
    // Klán · Rangsor · Súgó · Készítők · Kapcsolat — see buildHubTabs). Editor +
    // Settings stay as their own buttons above. NOT demo-locked (Súgó/Kapcsolat
    // live in the hub); each gated tab still routes to login on its own.
    const moreBtn=el('button','btn btn--lg btn--block btn--purple','<span>📂</span> <span data-t="Több">Több</span>');
    moreBtn.onclick=()=>setScreen('leaderboard');   // a public hub tab; the rest reachable via the tabs
    menu.appendChild(moreBtn);
    // DEMO MODE: the HUB exposes economy tabs (Bolt/Szezon/Klán/Rangsor) that are
    // NOT in DEMO_ALLOWED, so demo-lock the "Több" button too ('leaderboard' isn't
    // allowlisted → applyDemoLock locks + disables it). Non-demo: unchanged.
    demoButtons.push({b:moreBtn, scr:'leaderboard'});
    // daily-reward dot on the hub button when a spin/claim is available.
    function paintHubBadge(){
      let claimable=false;
      try{ if(CA.Meta && CA.Meta.dailyStatus){ const st=CA.Meta.dailyStatus(); claimable=!!(st && st.claimable); } }catch(e){}
      let dot=moreBtn.querySelector('.daily-dot');
      if(claimable && !dot){ dot=el('span','daily-dot',' 🔴'); moreBtn.appendChild(dot); }
      else if(!claimable && dot){ dot.remove(); }
    }
    paintHubBadge();
    try{ if(CA.events){ ['dailyClaimed','dailySpun','accountChanged','metaImported'].forEach(ev=>CA.events.on(ev, paintHubBadge)); } }catch(e){}

    // ---- META-GAZDASÁG NAV (Napi jutalom · Bolt · Szezon) — a teljesen lekódolt
    // kozmetikai gazdaság (Pörgetés/Bolt/Battle Pass) gyors elérése a főképernyőről,
    // nem csak a "Több" hub alól. Flag mögött, hogy egy kapcsolóval ki/be legyen.
    // 2026-06-15 (Jani): a főmenüből NE — zsúfolta a Home-ot. A Napi/Bolt/Szezon
    // továbbra is elérhető a "Több" hub fül alól. (Kapcsoló maradt visszakapcsolásra.)
    const SHOW_ECONOMY_NAV = false;
    if(SHOW_ECONOMY_NAV){
      const econRow=el('div','home-econ-nav');
      econRow.style.display='flex'; econRow.style.gap='8px'; econRow.style.marginTop='6px';
      [['🎡','Napi jutalom','daily'],['🛒','Bolt','shop'],['🎟️','Szezon','battlepass']].forEach(function(it){
        const b=el('button','btn btn--ghost btn--block','<span>'+it[0]+'</span> <span data-t="'+it[1]+'">'+it[1]+'</span>');
        b.style.flex='1';
        b.onclick=function(){ if(!(CA.Account&&CA.Account.user)){ setScreen('login'); return; } setScreen(it[2]); };
        demoButtons.push({b:b, scr:it[2]});
        econRow.appendChild(b);
      });
      menu.appendChild(econRow);
    }

    repaint();

    home.append(brand,menu);
    sc.appendChild(home);

    const foot=el('div','home-foot','© 2026 Los Polos Amigos — Animal Battle Ground · 💛 <a href="https://github.com/lospolosadwords-dev/squeak-and-destroy" target="_blank" rel="noopener" data-t="Nyílt forráskódú · GitHub">Nyílt forráskódú · GitHub</a> · 💬 <a href="https://discord.gg/sBfBdB8AzK" target="_blank" rel="noopener">Discord</a>');
    const ver=el('span','ver'); ver.id='menu-ver'; ver.textContent='';
    foot.appendChild(ver);
    sc.appendChild(foot);
    return sc;
  }

  /* ------------------------------------------------------------ NEW GAME --- */
  // saved custom teams (built in the Team Editor) live here; the New Game screen
  // can pick ONE to play with (replaces the species/class pickers for team 1).
  const TEAMS_STORE='ca_teams';
  function loadSavedTeams(){
    let a;
    try{ const raw=localStorage.getItem(TEAMS_STORE); a=raw?JSON.parse(raw):[]; if(!Array.isArray(a)) a=[]; }
    catch(e){ a=[]; }
    return a.filter(function(t){ return t && (t.units&&t.units.length); });
  }
  // species id -> portrait emoji (same widely-supported glyph set as ANIMAL_EMOJI).
  function savedTeamEmoji(sp){ return ({ bat:'🦇', capybara:'🐹', owl:'🦉', bird:'🦅', beaver:'🦦', koala:'🐨', worm:'🐛', hedgehog:'🦔', frog:'🐸', fox:'🦊', cat:'🐱', penguin:'🐧' })[sp]||'🐾'; }
  // seasonal default theme: October → graveyard, Dec/Jan → snow, else grass (the
  // player can still pick any theme in the map grid; this just sets the default).
  // Default map = Dzsungel (Jani). A SEASONAL special theme (graveyard in Oct,
  // snow in Dec/Jan) still wins; only the plain everyday default flips grass→jungle.
  const _seasonTheme=(function(){ try{ var s=(CA.Maps&&CA.Maps.seasonalTheme&&CA.Maps.seasonalTheme()); return (s && s!=='grass') ? s : 'jungle'; }catch(e){ return 'jungle'; } })();
  // per-team slots for the FFA / AI vs AI configurator (hot-seat up to 4). Each
  // slot: { isAI:bool, aiLevel:0-2, species:id }. Lazily defaulted in syncSlots().
  let ng={ mode:'classic', theme:_seasonTheme, weather:'clear', water:false, teamUltimate:true, ai:1, size:4, teams:2, species:'capybara', species2:'frog', classicHuman2:false, classes:[], savedTid:null,
    savedMap:null,    // name of a saved level-editor map to play (null => generated)
    slots:null,
    // custom rule-set ("Egyedi szabályok"). enabled=false -> engine defaults are
    // used (opts.rules omitted entirely). All knobs map to S.rules in core.js.
    rulesOn:false,
    rules:{ startHp:100, turnTime:45, retreatTime:4, wind:true, windStrength:1,
            suddenDeath:0, waterRise:26, sdToOneHp:true, weaponSet:'all' } };
  // singular species names for the "your animal" picker (HU canonical + EN via addEN)
  const SPECIES_NAME={ capybara:'Capybara', worm:'Kukac', hedgehog:'Sün', frog:'Béka',
    owl:'Bagoly', bird:'Madár', koala:'Koala', bat:'Denevér', beaver:'Hód',
    fox:'Róka', cat:'Macska', penguin:'Pingvin' };
  const MAX_SLOTS=5;
  // distinct animal species, one per team (player gets capybara first).
  const TEAM_SPECIES=['capybara','worm','hedgehog','frog','owl','bird','koala','bat','beaver',
    'fox','cat','penguin'];
  // localized team names per species (HU shown by default; EN via addEN below).
  const SPECIES_TEAM={ capybara:['Capybarák','Capybaras'], worm:['Worm-ök','Wrigglers'],
    hedgehog:['Sünök','Hedgehogs'], frog:['Békák','Frogs'], owl:['Baglyok','Owls'],
    bird:['Madarak','Birds'], koala:['Koalák','Koalas'], bat:['Denevérek','Bats'], beaver:['Hódok','Beavers'],
    fox:['Rókák','Foxes'], cat:['Macskák','Cats'], penguin:['Pingvinek','Penguins'] };
  // canonical (HU) team name; CA.t() translates it to EN at draw time (registered below).
  function teamName(sp){ const m=SPECIES_TEAM[sp]; return m?m[0]:undefined; }
  // 1-of-each balanced loadout: n DISTINCT classes cycling the registry from offset.
  function balancedClasses(n, offset){ const ids=classList(); if(!ids.length) return [];
    const out=[]; for(let i=0;i<n;i++) out.push(ids[((offset||0)+i)%ids.length]); return out; }
  function modeList(){
    // 'aivsai' (AI vs AI nézőmód) KIVÉVE (Jani 2026-06-10: "ne legyen, nem kell").
    const order=['classic','campaign','ffa','nest','gauntlet','bossrush','survival','koth','sniper','bombrun','coop','daily','quick','tutorial','golf','race','laststand','arcade','forts'];
    const M=CA.Modes||{};
    // 'classic' is the engine DEFAULT (no CA.Modes entry) — always offer it.
    const names={classic:'Klasszikus'};
    const out=[];
    order.forEach(id=>{ const m=M[id];
      if(id==='classic' || m) out.push({id, name:(m&&m.name)||names[id]||id, desc:(m&&m.desc)||(id==='classic'?'Capybarák vs Worm-ök, 2 csapat.':'')}); });
    return out;
  }
  // In the demo build this is limited to CA.DEMO_CLASSES (via CA.Classes.demoList);
  // the full build returns every registered class. Both the player class chips and
  // balancedClasses() draw from here, so the limit applies to the whole loadout.
  function classList(){ try{
    if(CA.Classes&&CA.Classes.demoList) return CA.Classes.demoList();
    return (CA.Classes&&CA.Classes.list)?CA.Classes.list():[];
  }catch(e){ return []; } }
  // worm 🪱 + beaver 🦫 are newer emoji that render as tofu/stripes in some fonts
  // → use widely-supported glyphs (🐛 caterpillar, 🦦 otter) so chips never break.
  const ANIMAL_EMOJI={ bat:'🦇', capybara:'🐹', owl:'🦉', bird:'🦅', beaver:'🦦', koala:'🐨', worm:'🐛', hedgehog:'🦔', frog:'🐸', fox:'🦊', cat:'🐱', penguin:'🐧' };
  function classMeta(id){ const d=(CA.Classes&&CA.Classes[id])||{}; const a=d.animal||''; return {animal:ANIMAL_EMOJI[a]||'', name:d.name||id}; }

  function buildNewGame(){
    const sc=el('section','screen','');
    sc.append(head(T_title('🎮','Új játék')));
    const body=el('div','screen-scroll');
    // ÖTLET #4: GYORS INDÍTÁS — egy koppintás a képernyő tetején, a jelenlegi
    // (legutóbbi) beállításokkal azonnal indít, görgetés nélkül.
    const quickRow=el('div','row'); quickRow.style.maxWidth='420px'; quickRow.style.margin='0 auto var(--s2)'; quickRow.style.gap='var(--s2)';
    const quick=el('button','btn btn--gold btn--lg','⚡ <span data-t="Gyors indítás">Gyors indítás</span>');
    quick.style.flex='1';
    // Gyors indítás: a JELENLEGI (legutóbbi) beállításokkal indít azonnal.
    quick.onclick=()=>startGame();
    // ÖTLET: Meglepetés — fajok (mindkettő) + osztályok + pálya + időjárás sorsolása,
    // majd AZONNALI indítás (rndTeam-logika + random map/weather + startGame()).
    const surprise=el('button','btn btn--ghost btn--lg','🎲 <span data-t="Meglepetés">Meglepetés</span>');
    surprise.style.flex='1';
    surprise.onclick=()=>{
      const pick=a=>a[Math.floor(Math.random()*a.length)];
      ng.species=pick(TEAM_SPECIES); ng.species2=pick(TEAM_SPECIES);
      const cids=classList(); if(cids.length){ for(let i=0;i<MAX_SLOTS;i++) ng.classes[i]=pick(cids); }
      if(Array.isArray(ng.slots)) ng.slots.forEach(s=>{ if(s){ s.species=pick(TEAM_SPECIES); s._touched=true; } });
      let mlist=(CA.Maps&&CA.Maps.list)?CA.Maps.list():['grass'];
      if(Array.isArray(mlist)&&mlist.length) ng.theme=pick(mlist); ng.savedMap=null;
      ng.weather=pick(['clear','rain','snow','fog','storm']);
      startGame();
    };
    quickRow.append(quick,surprise);
    // (Jani: a Gyors indítás + Meglepetés ALULRA kerül, az Indítás mellé — lásd
    //  a body végén; itt csak definiáljuk, nem ide append-eljük.)
    const panel=el('div','panel section');

    // mode
    const mSec=el('div','section'); mSec.append(el('h3',null,'<span data-t="Mód">Mód</span>'));
    const mChips=el('div','chips');
    const desc=el('div','muted','');
    // playable modes. classic/ffa/aivsai were the originals; the micro-modes
    // (golf/race/laststand) + tutorial are LOCKED-capable but selectable now.
    // AKTÍV: classic/ffa/aivsai/nest + gauntlet/bossrush (a két roguelite menet kódja
    // kész — CA.Modes.gauntlet / CA.Modes.bossrush, modes.js). A még befejezetlen
    // micro-módok (tutorial, golf, race, laststand) maradnak 🔒.
    // Jani: a befejezett, STABIL módok újra elérhetők. AI vs AI KIVÉVE
    // (2026-06-10: "ne legyen"). A micro-módok (golf/race/laststand/arcade) még
    // befejezetlenek → maradnak 🔒.
    const ENABLED_MODES={ classic:1, ffa:1, tutorial:1,
      campaign:1, survival:1, koth:1, forts:1, gauntlet:1, bossrush:1,
      nest:1, quick:1, daily:1 };
    // DEMO MODE: only Classic is selectable in the free demo.
    const demoNG=(function(){ try{ return !!(window.CA && CA.DEMO); }catch(e){ return false; } })();
    if(demoNG && ng.mode!=='classic') ng.mode='classic';
    modeList().filter(m=> !demoNG || m.id==='classic').forEach(m=>{
      const on=(!demoNG || m.id==='classic') && !!ENABLED_MODES[m.id];
      const c=el('button','chip'+(on?'':' locked'),'<span data-t="'+esc(m.name)+'">'+esc(m.name)+'</span>'+(on?'':' 🔒'));
      if(on){ c.onclick=()=>{ ng.mode=m.id; renderNG(); }; }
      else { c.disabled=true; c.title=T('Hamarosan'); }
      c.dataset.mode=m.id; mChips.appendChild(c);
    });
    mSec.append(mChips,desc); mSec._desc=desc;

    // map + weather (two columns on wide). Jani: rengeteg a választás → LENYÍLÓK
    // (gombtenger helyett), egy egységes nézetben (nincs "bővített" toggle).
    // dropdown helper: items=[{val,name,emoji}], onPick(val). Re-localizable.
    function dropdown(items, getVal, setVal){
      const s=el('select','ng-select');
      items.forEach(it=>{ const o=document.createElement('option'); o.value=it.val;
        o.dataset.nm=it.name||it.val; o.dataset.em=it.emoji||'';
        o.textContent=(it.emoji?it.emoji+' ':'')+T(it.name||it.val); s.appendChild(o); });
      s.onchange=()=>{ setVal(s.value); renderNG(); };
      s._reloc=()=>{ [...s.options].forEach(o=>{ o.textContent=(o.dataset.em?o.dataset.em+' ':'')+T(o.dataset.nm); }); };
      return s;
    }
    const grid=el('div','row'); grid.style.alignItems='flex-start'; grid.style.gap='var(--s5)';
    const mapSec=el('div','section'); mapSec.style.flex='1'; mapSec.style.minWidth='240px';
    mapSec.append(el('h3',null,'<span data-t="Pálya">Pálya</span>'));
    let maps=(CA.Maps&&CA.Maps.list)?CA.Maps.list():['grass']; maps.push('random');
    if(demoNG){ const DEMO_MAPS={ grass:1, desert:1, volcano:1 }; maps=maps.filter(id=>DEMO_MAPS[id]); if(!maps.length) maps=['grass'];
      if(!DEMO_MAPS[ng.theme]) ng.theme='grass'; }
    const mapItems=maps.map(id=>{ const m=(CA.Maps&&CA.Maps.get)?CA.Maps.get(id):{};
      return { val:id, emoji:id==='random'?'🎲':(m.emoji||''), name:id==='random'?'Véletlen':(m.name||id) }; });
    const mapSel=dropdown(mapItems, ()=>ng.theme, v=>ng.theme=v);
    mapSec.append(mapSel);
    // perf (Jani: a régi nagy PNG-knél 2-3 mp volt a preview-betöltés) — a preview-k
    // most JPEG-ek (~10× kisebb); ráadásul idle-ben ELŐTÖLTJÜK mindet, így a pálya-
    // váltáskor a kép azonnal megjelenik a böngésző-cache-ből (egyesével, hogy ne
    // foglalja le a sávszélt egyszerre). Csak egyszer, a screen építésekor.
    // (skipped entirely when the previews aren't shipped — see CA.MISSING_ART)
    try{ var _plist=maps.filter(function(id){ return id!=='random'; }), _pi=0;
      var _preload=function(){ if(_pi>=_plist.length) return; var _u='assets/maps/'+_plist[_pi]+'.jpg?v='+(CA.ASSET_V||'1');
        if(!(CA._isMissingArt && CA._isMissingArt(_u))){ var pim=new Image(); pim.src=_u; }
        _pi++; setTimeout(_preload, 60); };
      if(!(CA._isMissingArt && CA._isMissingArt('assets/maps/'))) setTimeout(_preload, 120);
    }catch(e){}
    // ÖTLET #1: pálya-előnézet a lenyíló alá (a kiválasztott téma thumbnailje).
    // ÖTLET #1b: biome-leírások (téma → 1 soros játékmenet-jellegzetesség).
    const MAP_BLURB={
      grass:'füves mező, klasszikus terep',
      desert:'dűnék, nyílt sivatag',
      snow:'csúszós hó, fagyott felszín',
      jungle:'dús dzsungel, sűrű növényzet',
      cave:'zárt barlang, belső kavernák',
      islands:'szigetek nyílt tenger felett — a vízbe lökés halálos',
      volcano:'lávás terep, forró felszín',
      sky:'nincs talaj, lebegő platformok — leesés = halál',
      beach:'tengerpart, lágy homok',
      candy:'cukor-világ, édes domborzat',
      space:'alacsony grav-érzet, állomás-folyosók',
      graveyard:'kísérteties, szélesebb pálya',
      halloween:'kísértetjárta, sötét pálya'
    };
    // pálya-előnézet kép a lenyíló alá; koppintásra nagy modál nyílik (info-only).
    const mapPrevWrap=el('div','ng-map-prev-wrap');
    mapPrevWrap.style.position='relative'; mapPrevWrap.style.display='inline-block';
    mapPrevWrap.style.cursor='pointer';
    const mapPrev=el('img','ng-map-prev'); mapPrev.alt=''; mapPrev.loading='lazy';
    mapPrev.style.cursor='pointer'; mapPrev.style.display='block';
    // hiányzó thumbnail → ne mutasson törött-kép ikont (mint menu-challenge.js dImg).
    mapPrev.onerror=function(){ this.style.display='none'; mapPrevWrap.style.display='none'; };
    // "tappable" jelzés: nagyító-hint a sarokban
    const mapPrevHint=el('div','ng-map-prev-hint','🔍');
    mapPrevHint.style.position='absolute'; mapPrevHint.style.right='6px'; mapPrevHint.style.bottom='6px';
    mapPrevHint.style.background='rgba(61,40,0,.72)'; mapPrevHint.style.color='#fff';
    mapPrevHint.style.borderRadius='999px'; mapPrevHint.style.padding='2px 7px';
    mapPrevHint.style.fontSize='13px'; mapPrevHint.style.lineHeight='1'; mapPrevHint.style.pointerEvents='none';
    mapPrevWrap.title=T('Nagyításhoz koppints');
    mapPrevWrap.append(mapPrev, mapPrevHint);
    mapSec.append(mapPrevWrap);

    // ----- nagy pálya-előnézet modál (info-only, NEM vált témát) -----
    function openMapModal(){
      const theme=ng.theme;
      if(!theme || theme==='random') return;
      closeMapModal(); // sose duplázzon
      const m=(CA.Maps&&CA.Maps.get)?CA.Maps.get(theme):{};
      const ov=el('div','ng-mapmodal');
      ov.style.position='fixed'; ov.style.inset='0'; ov.style.zIndex='9999';
      ov.style.background='rgba(0,0,0,.66)'; ov.style.display='flex';
      ov.style.alignItems='center'; ov.style.justifyContent='center'; ov.style.padding='var(--s5,16px)';
      const box=el('div','ng-mapmodal-box');
      box.style.position='relative'; box.style.maxWidth='min(560px,92vw)'; box.style.width='100%';
      box.style.background='#3D2800'; box.style.border='2px solid #E8711A';
      box.style.borderRadius='14px'; box.style.padding='18px'; box.style.textAlign='center';
      box.style.boxShadow='0 12px 40px rgba(0,0,0,.5)';
      const x=el('button','ng-mapmodal-x','✕');
      x.setAttribute('aria-label', T('Bezár'));
      x.style.position='absolute'; x.style.top='8px'; x.style.right='10px';
      x.style.background='transparent'; x.style.border='0'; x.style.color='#fff';
      x.style.fontSize='22px'; x.style.lineHeight='1'; x.style.cursor='pointer';
      const big=el('img','ng-mapmodal-img');
      big.alt='';
      var _bu='assets/maps/'+theme+'.jpg?v='+(CA.ASSET_V||'1');
      if(CA._isMissingArt && CA._isMissingArt(_bu)) big.style.display='none'; else big.src=_bu;
      big.style.width='100%'; big.style.maxHeight='52vh'; big.style.objectFit='contain';
      big.style.borderRadius='10px'; big.style.background='rgba(0,0,0,.25)';
      big.onerror=function(){ this.style.display='none'; };
      const ttl=el('div','ng-mapmodal-title', esc((m&&m.emoji?m.emoji+' ':'')+T(m&&m.name?m.name:theme)));
      ttl.style.color='#E8711A'; ttl.style.fontSize='22px'; ttl.style.fontWeight='800';
      ttl.style.margin='12px 0 4px';
      const blurb=el('div','ng-mapmodal-desc', esc(T(MAP_BLURB[theme]||'')));
      blurb.style.color='#f3e3cf'; blurb.style.fontSize='15px'; blurb.style.lineHeight='1.35';
      box.append(x, big, ttl, blurb);
      ov.append(box);
      // bezárás: backdrop, X, Escape — listener-szivárgás nélkül
      ov.onclick=function(ev){ if(ev.target===ov) closeMapModal(); };
      x.onclick=closeMapModal;
      ov._esc=function(ev){ if(ev.key==='Escape') closeMapModal(); };
      document.addEventListener('keydown', ov._esc);
      _mapModal=ov;
      document.body.appendChild(ov);
    }
    function closeMapModal(){
      const ov=_mapModal; if(!ov) return; _mapModal=null;
      if(ov._esc) document.removeEventListener('keydown', ov._esc);
      ov.onclick=null;
      if(ov.parentNode) ov.parentNode.removeChild(ov);
    }
    let _mapModal=null;
    mapPrevWrap.onclick=openMapModal;

    const wSec=el('div','section'); wSec.style.flex='1'; wSec.style.minWidth='240px';
    wSec.append(el('h3',null,'<span data-t="Időjárás">Időjárás</span>'));
    const wItems=[['clear','☀️','Tiszta'],['rain','🌧️','Eső'],['snow','❄️','Hó'],['fog','🌫️','Köd'],['storm','⛈️','Vihar'],['random','🎲','Véletlen']]
      .map(([val,emoji,name])=>({val,emoji,name}));
    const wSel=dropdown(wItems, ()=>ng.weather, v=>ng.weather=v);
    wSec.append(wSel);
    grid.append(mapSec,wSec);

    // options
    const oSec=el('div','section'); oSec.append(el('h3',null,'<span data-t="Opciók">Opciók</span>'));
    const oRow=el('div','row row--between');
    const waterLbl=el('label','switch','<span data-t="Emelkedő víz">Emelkedő víz</span>');
    // match the other inline option labels' muted colour/size (not bright cream)
    waterLbl.style.color='var(--ink-dim)'; waterLbl.style.fontSize='13px';
    const waterIn=el('input'); waterIn.type='checkbox'; waterIn.onchange=()=>{ ng.water=waterIn.checked; };
    waterLbl.prepend(); waterLbl.append(waterIn, el('span','track')); waterLbl._in=waterIn;
    // each team starts with 1 random ultimate (Jani). Default ON.
    const ultLbl=el('label','switch','<span data-t="Ultimate / csapat">Ultimate / csapat</span>');
    ultLbl.style.color='var(--ink-dim)'; ultLbl.style.fontSize='13px';
    const ultIn=el('input'); ultIn.type='checkbox'; ultIn.checked=(ng.teamUltimate!==false);
    ultIn.onchange=()=>{ ng.teamUltimate=ultIn.checked; };
    ultLbl.append(ultIn, el('span','track')); ultLbl._in=ultIn;
    const aiWrap=el('div','row'); aiWrap.append(el('span','muted','<span data-t="Gép szintje">Gép szintje</span>'));
    const seg=el('div','seg');
    [['Könnyű',0],['Normál',1],['Nehéz',2]].forEach(([nm,v])=>{ const b=el('button',null,'<span data-t="'+nm+'">'+nm+'</span>'); b.onclick=()=>{ ng.ai=v; renderNG(); }; b.dataset.ai=v; seg.appendChild(b); });
    aiWrap.append(seg); oRow.append(waterLbl,ultLbl,aiWrap);
    // number of teams (3+ => animal free-for-all with distinct species)
    const tmWrap=el('div','row'); tmWrap.append(el('span','muted','<span data-t="Csapatok">Csapatok</span>'));
    const tmSeg=el('div','seg');
    [2,3,4].forEach(v=>{ const b=el('button',null,String(v)); b.onclick=()=>{ ng.teams=v; renderNG(); }; b.dataset.teams=v; tmSeg.appendChild(b); });
    tmWrap.append(tmSeg); oRow.append(tmWrap);
    // units per team (applies to every mode incl. AI vs AI)
    const szWrap=el('div','row'); szWrap.append(el('span','muted','<span data-t="Egységek / csapat">Egységek / csapat</span>'));
    const szSeg=el('div','seg');
    [2,3,4,5].forEach(v=>{ const b=el('button',null,String(v)); b.onclick=()=>{ ng.size=v; renderNG(); }; b.dataset.size=v; szSeg.appendChild(b); });
    szWrap.append(szSeg); oRow.append(szWrap);
    oSec.append(oRow); oSec._water=waterIn; oSec._seg=seg; oSec._szSeg=szSeg; oSec._tmSeg=tmSeg;

    // TEAM species picker(s) — LENYÍLÓK (Jani: 12 faj × csapat = gombtenger volt).
    // Player 1 always; Player 2 only in Classic; hidden in AI vs AI.
    const spItems=TEAM_SPECIES.map(sp=>({ val:sp, emoji:ANIMAL_EMOJI[sp]||'', name:SPECIES_NAME[sp]||sp }));
    const spSec=el('div','section'); const spH=el('h3',null,'<span data-t="A te csapatod">A te csapatod</span>'); spSec.append(spH);
    const spGrid=dropdown(spItems, ()=>ng.species, v=>ng.species=v); spSec.append(spGrid);
    // ÖTLET #3: a kiválasztott faj passzív-képességének leírása a lenyíló alatt.
    const spDesc=el('div','ng-sp-desc muted'); spSec.append(spDesc);
    // ÖTLET #2: véletlen csapat (mindkét fél faja + osztályok sorsolása, indítás nélkül).
    const rndTeam=el('button','btn btn--ghost btn--sm','🎲 <span data-t="Véletlen csapat">Véletlen csapat</span>');
    rndTeam.onclick=()=>{
      const pick=a=>a[Math.floor(Math.random()*a.length)];
      ng.species=pick(TEAM_SPECIES); ng.species2=pick(TEAM_SPECIES);
      const ids=classList(); if(ids.length){ for(let i=0;i<MAX_SLOTS;i++) ng.classes[i]=pick(ids); }
      if(Array.isArray(ng.slots)) ng.slots.forEach(s=>{ if(s){ s.species=pick(TEAM_SPECIES); s._touched=true; } });
      renderNG();
    };
    spSec.append(rndTeam);
    // Player 2 (Classic only)
    const spSec2=el('div','section');
    const spH2=el('h3',null,'Equipo 2 (computadora)'); spSec2.append(spH2);
    const spGrid2=dropdown(spItems, ()=>ng.species2, v=>ng.species2=v); spSec2.append(spGrid2);
    const spDesc2=el('div','ng-sp-desc muted'); spSec2.append(spDesc2);
    const p2Mode=el('div','section ng-human-choice');
    p2Mode.append(el('h3',null,'¿Quién controla el equipo 2?'));
    p2Mode.append(el('p','muted','Para una batalla entre alumnos o equipos, elige «Dos equipos humanos». Ambos juegan por turnos en esta pantalla.'));
    const p2Seg=el('div','seg');
    [['🤖 Contra la computadora',false],['🙂 Dos equipos humanos',true]].forEach(([label,isHuman])=>{
      const b=el('button',null,label); b.dataset.human=isHuman?'1':'0';
      b.onclick=()=>{ ng.classicHuman2=isHuman; renderNG(); };
      p2Seg.appendChild(b);
    });
    p2Mode.append(p2Seg); p2Mode._humanSeg=p2Seg;

    // ---- Per-team configurator (FFA / AI vs AI hot-seat up to 4) ----
    // Lets the user pick, FOR EACH team: Ember (Player N) vs Gép (+ AI level) and
    // the species. The Csapatok (2-4) picker above controls how many slots show.
    // Defaults: ffa -> team 1 Human, rest AI; aivsai -> all AI. The produced rows
    // are read in startGame() to build opts.teams. Hidden for all other modes.
    const tcSec=el('div','section'); tcSec.append(el('h3',null,'<span data-t="Csapat-beállítás">Csapat-beállítás</span>'));
    const tcRows=el('div','section');
    tcSec.append(tcRows);
    // ensure ng.slots exists + matches the current team count / mode defaults.
    function ensureSlots(){
      const n=ng.teams||2, aivs=(ng.mode==='aivsai');
      if(!Array.isArray(ng.slots)) ng.slots=[];
      const pool=[ng.species].concat(TEAM_SPECIES.filter(s=>s!==ng.species));
      for(let i=0;i<MAX_SLOTS;i++){
        if(!ng.slots[i]) ng.slots[i]={ isAI:true, aiLevel:ng.ai, species:pool[i%pool.length] };
      }
      // mode-driven HUMAN/AI defaults only applied when a slot hasn't been
      // user-touched (tracked via _touched). ffa: slot0 human; aivsai: all AI.
      for(let i=0;i<n;i++){ const s=ng.slots[i];
        if(!s._touched){ s.isAI = aivs ? true : (i!==0); }
        if(aivs) s.isAI=true; // AI vs AI: nobody is human (forced)
      }
    }
    // (re)build the per-team rows for the current team count. Only does a full DOM
    // rebuild when the team count or mode changed (selection-only updates go via
    // paintTeamCfg) so clicks inside the configurator don't blow away the rows.
    let _tcSig=null;
    function renderTeamCfg(){
      ensureSlots();
      const n=ng.teams||2, aivs=(ng.mode==='aivsai');
      const sig=ng.mode+'/'+n;
      if(sig===_tcSig && tcRows.children.length===n) return; // structure unchanged
      _tcSig=sig;
      tcRows.innerHTML='';
      for(let i=0;i<n;i++){ (function(idx){
        const s=ng.slots[idx];
        const card=el('div','card section');
        // header: team N + a Human/AI toggle segment
        const hdr=el('div','row row--between');
        const lbl=el('div',null,'<b>'+T('Csapat')+' '+(idx+1)+'</b>');
        hdr.append(lbl);
        const kindSeg=el('div','seg');
        const human=el('button',null,'<span data-t="Ember">Ember</span>');
        const ai=el('button',null,'<span data-t="Gép">Gép</span>');
        human.onclick=()=>{ if(aivs) return; s.isAI=false; s._touched=true; renderNG(); };
        ai.onclick=()=>{ s.isAI=true; s._touched=true; renderNG(); };
        kindSeg.append(human,ai);
        if(aivs){ human.disabled=true; } // AI vs AI: human not selectable
        hdr.append(kindSeg);
        card.append(hdr);
        // AI level segment (only when this slot is AI)
        const aiWrap=el('div','row'); aiWrap.append(el('span','muted','<span data-t="Gép szintje">Gép szintje</span>'));
        const lvlSeg=el('div','seg');
        [['Könnyű',0],['Normál',1],['Nehéz',2]].forEach(([nm,v])=>{ const b=el('button',null,'<span data-t="'+nm+'">'+nm+'</span>'); b.onclick=()=>{ s.aiLevel=v; s._touched=true; renderNG(); }; b.dataset.lvl=v; lvlSeg.appendChild(b); });
        aiWrap.append(lvlSeg); card.append(aiWrap);
        // species picker (per team) — LENYÍLÓ (gombtenger helyett)
        const spWrap=el('div','section'); spWrap.append(el('span','muted','<span data-t="Faj">Faj</span>'));
        const spG=dropdown(spItems, ()=>s.species, v=>{ s.species=v; s._touched=true; });
        spWrap.append(spG); card.append(spWrap);
        tcRows.appendChild(card);
        // stash refs for selection painting
        card._slot=s; card._human=human; card._ai=ai; card._aiWrap=aiWrap; card._lvlSeg=lvlSeg; card._spG=spG;
      })(i); }
      applyI18n(tcRows);
    }
    // reflect current selection state into the (already built) rows.
    function paintTeamCfg(){
      const aivs=(ng.mode==='aivsai');
      [...tcRows.children].forEach(card=>{ const s=card._slot; if(!s) return;
        card._human.classList.toggle('sel', !s.isAI && !aivs);
        card._ai.classList.toggle('sel', s.isAI || aivs);
        card._aiWrap.style.display = (s.isAI || aivs) ? '' : 'none';
        [...card._lvlSeg.children].forEach(b=>b.classList.toggle('sel', (+b.dataset.lvl)===s.aiLevel));
        if(card._spG){ card._spG.value=s.species; if(card._spG._reloc) card._spG._reloc(); }
      });
    }
    tcSec._render=renderTeamCfg; tcSec._paint=paintTeamCfg;

    // class loadout (player team)
    const cSec=el('div','section'); cSec.append(el('h3',null,'<span data-t="A csapatod osztályai">A csapatod osztályai</span>'));
    const cRow=el('div','chips'); const ids=classList();
    for(let i=0;i<MAX_SLOTS;i++){ if(!ng.classes[i]) ng.classes[i]=ids[i%Math.max(1,ids.length)]||null;
      const c=el('button','chip',''); c.dataset.slot=i; c.onclick=()=>{ const cur=ids.indexOf(ng.classes[i]); ng.classes[i]=ids[(cur+1)%ids.length]; renderNG(); }; cRow.appendChild(c); }
    const mixBtn=el('button','btn btn--ghost btn--sm','🎲 <span data-t="Véletlen mix">Véletlen mix</span>');
    // keep it 1-of-each (distinct) but rotate which class lands in which slot
    mixBtn.onclick=()=>{ const off=ids.length?Math.floor(Math.random()*ids.length):0; for(let i=0;i<MAX_SLOTS;i++) ng.classes[i]=ids[(off+i)%Math.max(1,ids.length)]; renderNG(); };
    // a kiválasztott (különböző) osztályok szerep-leírása — a játékos eddig csak a
    // NEVET látta, nem tudta mit csinál a Nekromanta vs Mérnök. (renderNG frissíti.)
    const cDesc=el('div','ng-class-desc muted');
    cSec.append(cRow, mixBtn, cDesc); cSec._row=cRow; cSec.style.display = ids.length?'':'none';

    // ---- Mentett csapat (play a team built in the Team Editor) ----
    // Picking a saved team replaces team 1's species + class loadout: the engine
    // gets the exact units (uid/species/cls/cosmetic) + tid/captain the editor
    // would have forwarded. "Nincs" falls back to the normal species/class flow.
    const tSec=el('div','section'); tSec.append(el('h3',null,'<span data-t="Mentett csapat">Mentett csapat</span>'));
    const tGrid=el('div','opt-grid');
    function renderSavedTeams(){
      tGrid.innerHTML='';
      const saved=loadSavedTeams();
      if(!saved.length){
        // no saved teams: clear any stale selection + show a hint, hide the grid.
        ng.savedTid=null;
        tGrid.style.display='none';
        if(!tSec._note){ tSec._note=el('div','muted','<span data-t="Még nincs mentett csapat. Hozz létre egyet a Csapat szerkesztőben.">Még nincs mentett csapat. Hozz létre egyet a Csapat szerkesztőben.</span>'); tSec.append(tSec._note); applyI18n(tSec._note); }
        return;
      }
      if(tSec._note){ tSec._note.remove(); tSec._note=null; }
      tGrid.style.display='';
      // drop a stale selection (saved team deleted since last visit).
      if(ng.savedTid && !saved.some(function(t){ return t.tid===ng.savedTid; })) ng.savedTid=null;
      // "Nincs" chip first → normal (no saved team) New Game flow.
      const none=el('button','chip chip--grid','<span data-t="Nincs (alap csapat)">Nincs (alap csapat)</span>');
      none.onclick=()=>{ ng.savedTid=null; renderNG(); }; none.dataset.tid=''; tGrid.appendChild(none);
      saved.forEach(function(team){
        const nm=(team.name&&team.name.trim())||T('Névtelen csapat');
        const lg=team.logo||'⚔️';
        const prev=(team.units||[]).slice(0,5).map(function(u){ return savedTeamEmoji(u.species); }).join('');
        const c=el('button','chip chip--grid', esc(lg)+' '+esc(nm)+' <span class="muted">'+esc(prev)+'</span>');
        c.onclick=()=>{ ng.savedTid=team.tid; renderNG(); }; c.dataset.tid=team.tid||''; tGrid.appendChild(c);
      });
      applyI18n(tGrid);
    }
    tSec.append(tGrid);
    tSec._render=renderSavedTeams;

    // ---- Mentett pálya (play a map built in the level Editor) ----
    // The level editor saves maps to localStorage (CA.Maps.editor.save/list/load);
    // CA.newGame({editorMap:name}) replays that map instead of generating one.
    // Only shown when ≥1 saved map exists. Default chip = "Generált (véletlen)".
    const mSecSaved=el('div','section'); mSecSaved.append(el('h3',null,'<span data-t="Mentett pálya">Mentett pálya</span>'));
    const mmGrid=el('div','opt-grid');
    function renderSavedMaps(){
      let saved=[];
      try{ saved=(CA.Maps&&CA.Maps.editor&&CA.Maps.editor.list)?CA.Maps.editor.list():[]; }catch(e){ saved=[]; }
      if(!Array.isArray(saved)) saved=[];
      // hide the whole section when there are no saved maps.
      if(!saved.length){ ng.savedMap=null; mSecSaved.style.display='none'; mmGrid.innerHTML=''; return; }
      mSecSaved.style.display='';
      // drop a stale selection (map deleted since last visit).
      if(ng.savedMap && saved.indexOf(ng.savedMap)<0) ng.savedMap=null;
      mmGrid.innerHTML='';
      // default chip first → generated (random) terrain, no editorMap passed.
      const def=el('button','chip chip--grid','🎲 <span data-t="Generált (véletlen)">Generált (véletlen)</span>');
      def.onclick=()=>{ ng.savedMap=null; renderNG(); }; def.dataset.mapname=''; mmGrid.appendChild(def);
      saved.forEach(function(name){
        const c=el('button','chip chip--grid','🗺️ '+esc(name));
        c.onclick=()=>{ ng.savedMap=name; renderNG(); }; c.dataset.mapname=name; mmGrid.appendChild(c);
      });
      applyI18n(mmGrid);
    }
    mSecSaved.append(mmGrid);
    mSecSaved._render=renderSavedMaps;

    // ---- Egyedi szabályok (custom rule-set editor) ----
    const rSec=buildRulesSection();

    // ---- EGY NÉZET (Jani): nincs "bővített beállítások" toggle, minden látszik;
    // a sok választás LENYÍLÓKBAN van (pálya/időjárás/faj), így nem gombtenger. ----
    const advWrap=el('div'); advWrap.append(oSec, tcSec, spSec, spSec2, cSec);
    // Saved team + Saved map + Custom rules are FULL-VERSION features — hidden in the demo (Jani).
    if(!(window.CA && CA.DEMO)){ advWrap.append(tSec, mSecSaved, rSec.el); }
    panel.append(mSec, p2Mode, grid, advWrap);
    body.append(panel);

    // start bar
    const start=el('button','btn btn--gold btn--lg btn--block','▶ <span data-t="Indítás">Indítás</span>');
    start.style.maxWidth='420px'; start.style.margin='var(--s2) auto 0';
    start.onclick=startGame;
    body.append(start);
    // Gyors indítás + Meglepetés az Indítás ALÁ (Jani: "alul legyen, ahol az Indítás")
    body.append(quickRow);
    // becsült meccshossz (csapatok × egységek × kör-idő alapján). renderNG frissíti.
    const estEl=el('div','ng-est muted'); estEl.style.textAlign='center'; estEl.style.margin='var(--s2) auto 0';
    body.append(estEl);

    // ÖTLET #3: TAPADÓS INDÍTÁS (mobil konverzió) — touch / keskeny nézeten az
    // Indítás mindig elérhető a görgető-panel alján (nem kell végiggörgetni a sűrű
    // opciós panelt). Egy klón gomb, ugyanazt a startGame()-et hívja. Csak touch /
    // keskeny viewporton jelenik meg → desktop layout érintetlen.
    var _isTouch=false;
    try{ _isTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints>0) ||
      (window.matchMedia && window.matchMedia('(max-width: 640px)').matches)); }catch(e){ _isTouch=false; }
    if(_isTouch){
      const stickyBar=el('div','ng-sticky-play');
      stickyBar.style.position='sticky'; stickyBar.style.bottom='0'; stickyBar.style.zIndex='20';
      stickyBar.style.marginTop='var(--s2)';
      stickyBar.style.marginLeft='calc(-1 * var(--s5, 16px))';
      stickyBar.style.marginRight='calc(-1 * var(--s5, 16px))';
      stickyBar.style.padding='8px var(--s5, 16px)';
      stickyBar.style.paddingBottom='calc(8px + env(safe-area-inset-bottom, 0px))';
      stickyBar.style.background='linear-gradient(to top, rgba(61,40,0,.97) 65%, rgba(61,40,0,0))';
      const stickyStart=el('button','btn btn--gold btn--lg btn--block','▶ <span data-t="Indítás">Indítás</span>');
      stickyStart.style.maxWidth='420px'; stickyStart.style.margin='0 auto'; stickyStart.style.background='#E8711A';
      stickyStart.onclick=startGame;
      stickyBar.append(stickyStart);
      body.append(stickyBar);
    }

    sc.append(body);
    sc._ng={ mChips, desc, mapGrid:mapSel, wGrid:wSel, seg, szSeg, tmSeg, spGrid, spGrid2, spSec, spSec2, p2Mode, cSec, spH, spH2, water:waterIn, cRow, ids, rules:rSec, tSec, tGrid, tcSec, mSecSaved, mmGrid, mapPrev, mapPrevWrap, spDesc, spDesc2, cDesc, estEl };
    // P2 FIX: a nagy pálya-előnézet modál (closeMapModal) eddig CSAK a backdrop/X/Escape-re
    // záródott. A globális Vissza gombbal elhagyva a fix z-index:9999 overlay + a document
    // keydown listener a következő képernyő fölött ragadt. → a screen onHide-jára kötjük.
    // (closeMapModal no-op, ha nincs nyitott modál.)
    onHideFns['newgame']=closeMapModal;
    return sc;
  }

  /* The custom rule-set editor. A master toggle gates a body of steppers /
   * switches / a weapon-set segment. All values live on ng.rules and are passed
   * to CA.newGame as opts.rules ONLY when ng.rulesOn (else engine defaults). */
  function buildRulesSection(){
    const sec=el('div','section');
    const head=el('div','row row--between');
    head.append(el('h3',null,'<span data-t="Egyedi szabályok">Egyedi szabályok</span>'));
    const onLbl=el('label','switch'); const onIn=el('input'); onIn.type='checkbox';
    onIn.checked=ng.rulesOn; onIn.onchange=()=>{ ng.rulesOn=onIn.checked; renderNG(); };
    onLbl.append(onIn, el('span','track')); head.append(onLbl);
    sec.append(head);

    const bodyW=el('div','section'); // holds the knobs, hidden when master off

    // integer stepper row: − value + with min/max/step.
    function stepper(labelKey, get, set, min, max, step, suffix){
      const r=el('div','row row--between card');
      r.append(el('div',null,'<span data-t="'+esc(labelKey)+'">'+esc(labelKey)+'</span>'));
      const ctl=el('div','seg');
      const dec=el('button',null,'−'); const val=el('span','range-val'); const inc=el('button',null,'+');
      function show(){ val.textContent = get() + (suffix||''); }
      dec.onclick=()=>{ set(Math.max(min, get()-step)); show(); };
      inc.onclick=()=>{ set(Math.min(max, get()+step)); show(); };
      ctl.append(dec,val,inc); r.append(ctl); show(); r._sync=show; return r;
    }
    function toggle(labelKey, get, set){
      const r=el('div','row row--between card');
      r.append(el('div',null,'<span data-t="'+esc(labelKey)+'">'+esc(labelKey)+'</span>'));
      const lbl=el('label','switch'); const i=el('input'); i.type='checkbox'; i.checked=!!get();
      i.onchange=()=>{ set(i.checked); renderNG(); }; lbl.append(i, el('span','track'));
      r.append(lbl); r._sync=()=>{ i.checked=!!get(); }; return r;
    }

    const R=ng.rules;
    const hp  =stepper('Kezdő HP',     ()=>R.startHp,    v=>R.startHp=v,    25,300,5,'');
    const tt  =stepper('Kör ideje',    ()=>R.turnTime,   v=>R.turnTime=v,   10,120,5,'s');
    const rt  =stepper('Visszavonulás',()=>R.retreatTime,v=>R.retreatTime=v, 0, 15,1,'s');
    const wind=toggle('Szél',          ()=>R.wind,       v=>R.wind=v);
    const ws  =stepper('Szél erőssége',()=>Math.round(R.windStrength*100), v=>R.windStrength=v/100, 0,300,25,'%');
    const sd  =stepper('Hirtelen halál',()=>R.suddenDeath,v=>R.suddenDeath=v, 0,600,30,'s');
    const wr  =stepper('Vízszint emelkedés',()=>R.waterRise,v=>R.waterRise=v, 0,120,2,'px');
    const oneHp=toggle('SD: 1 HP-ra vág',()=>R.sdToOneHp, v=>R.sdToOneHp=v);

    // weapon-set restriction segment (generalized sniper lock).
    const wsRow=el('div','row row--between card');
    wsRow.append(el('div',null,'<span data-t="Fegyverkészlet">Fegyverkészlet</span>'));
    const wsSeg=el('div','seg');
    [['Mind','all'],['Közelharc','melee'],['Robbanó','explosive'],['Csak láda','crate']].forEach(([nm,v])=>{
      const b=el('button',null,'<span data-t="'+esc(nm)+'">'+esc(nm)+'</span>');
      b.onclick=()=>{ R.weaponSet=v; renderNG(); }; b.dataset.ws=v; wsSeg.appendChild(b);
    });
    wsRow.append(wsSeg);
    function syncWs(){ [...wsSeg.children].forEach(b=>b.classList.toggle('sel', b.dataset.ws===R.weaponSet)); }

    // ---- Gyors sablonok (rule presets). Mindegyik beállítja a vonatkozó
    // ng.rules értékeket + bekapcsolja a szabályokat, majd renderNG() frissít. ----
    const presetRow=el('div','chips');
    const PRESETS=[
      ['Gyors',    { startHp:75,  turnTime:25, retreatTime:3, wind:true,  windStrength:1,   suddenDeath:120, waterRise:26, sdToOneHp:true,  weaponSet:'all' }],
      ['Klasszikus',{ startHp:100, turnTime:45, retreatTime:4, wind:true,  windStrength:1,   suddenDeath:0,   waterRise:26, sdToOneHp:true,  weaponSet:'all' }],
      ['Hardcore', { startHp:50,  turnTime:30, retreatTime:2, wind:true,  windStrength:1.5, suddenDeath:90,  waterRise:30, sdToOneHp:true,  weaponSet:'all' }],
      ['Béke',     { startHp:200, turnTime:60, retreatTime:5, wind:false, windStrength:1,   suddenDeath:0,   waterRise:0,  sdToOneHp:false, weaponSet:'all' }]
    ];
    PRESETS.forEach(([nm,vals])=>{
      const c=el('button','chip','<span data-t="'+esc(nm)+'">'+esc(nm)+'</span>');
      c.onclick=()=>{ for(const k in vals) R[k]=vals[k]; ng.rulesOn=true; renderNG(); };
      presetRow.appendChild(c);
    });

    bodyW.append(presetRow,hp,tt,rt,wind,ws,sd,wr,oneHp,wsRow);
    sec.append(bodyW);

    const rows=[hp,tt,rt,wind,ws,sd,wr,oneHp];
    function sync(){
      onIn.checked=ng.rulesOn;
      bodyW.style.display = ng.rulesOn ? '' : 'none';
      // wind-strength only matters when wind is on
      ws.style.display = R.wind ? '' : 'none';
      // SD water-rise + 1-HP only matter when sudden death is enabled
      const sdOn = R.suddenDeath>0;
      wr.style.display = sdOn ? '' : 'none';
      oneHp.style.display = sdOn ? '' : 'none';
      rows.forEach(r=>{ if(r._sync) r._sync(); });
      syncWs();
    }
    return { el:sec, sync };
  }

  function renderNG(){
    const sc=screens.newgame; if(!sc||!sc._ng) return; const r=sc._ng;
    [...r.mChips.children].forEach(c=>c.classList.toggle('sel', c.dataset.mode===ng.mode));
    const md=(CA.Modes&&CA.Modes[ng.mode])||{}; r.desc.textContent=T(md.desc||'');
    // dropdowns: set value + re-localize option labels (lang switch safe)
    if(r.mapGrid){ r.mapGrid.value=ng.theme; if(r.mapGrid._reloc) r.mapGrid._reloc(); }
    if(r.wGrid){ r.wGrid.value=ng.weather; if(r.wGrid._reloc) r.wGrid._reloc(); }
    // ÖTLET #1: pálya-előnézet kép (a 'random' / hiányzó preview rejtve)
    if(r.mapPrev){
      const _pu = 'assets/maps/'+ng.theme+'.jpg?v='+(CA.ASSET_V||'1');
      const hasPrev = ng.theme && ng.theme!=='random' && !ng.savedMap
                      && !(CA._isMissingArt && CA._isMissingArt(_pu));
      if(hasPrev){ r.mapPrev.style.display='block'; r.mapPrev.src=_pu; }
      else r.mapPrev.style.display='none';
      if(r.mapPrevWrap) r.mapPrevWrap.style.display = hasPrev ? 'inline-block' : 'none';
    }
    // ÖTLET #3: faj passzív-leírás (mindkét csapaté)
    const spInfo=(sp)=>{ try{ const s=CA.Species&&CA.Species[sp]; return s&&s.passiveDesc?T(s.passiveDesc):''; }catch(e){ return ''; } };
    if(r.spDesc)  r.spDesc.textContent  = spInfo(ng.species);
    if(r.spDesc2) r.spDesc2.textContent = spInfo(ng.species2);
    [...r.seg.children].forEach(b=>b.classList.toggle('sel', (+b.dataset.ai)===ng.ai));
    if(r.szSeg) [...r.szSeg.children].forEach(b=>b.classList.toggle('sel', (+b.dataset.size)===ng.size));
    if(r.tmSeg) [...r.tmSeg.children].forEach(b=>b.classList.toggle('sel', (+b.dataset.teams)===ng.teams));
    if(r.spGrid){ r.spGrid.value=ng.species; if(r.spGrid._reloc) r.spGrid._reloc(); }
    if(r.spGrid2){ r.spGrid2.value=ng.species2; if(r.spGrid2._reloc) r.spGrid2._reloc(); }
    if(r.p2Mode){ r.p2Mode.style.display=ng.mode==='classic'?'':'none';
      [...r.p2Mode._humanSeg.children].forEach(b=>{
        const selected=(b.dataset.human==='1')===!!ng.classicHuman2;
        b.classList.toggle('sel',selected); b.setAttribute('aria-pressed',String(selected));
      }); }
    r.water.checked=ng.water;
    // saved-team picker: (re)build the list + reflect the selection.
    if(r.tSec && r.tSec._render) r.tSec._render();
    if(r.tGrid) [...r.tGrid.children].forEach(c=>c.classList.toggle('sel', (c.dataset.tid||'')===(ng.savedTid||'')));
    // saved-map picker: (re)build the list + reflect the selection.
    if(r.mSecSaved && r.mSecSaved._render) r.mSecSaved._render();
    if(r.mmGrid) [...r.mmGrid.children].forEach(c=>c.classList.toggle('sel', (c.dataset.mapname||'')===(ng.savedMap||'')));
    const hasSaved=!!ng.savedTid;
    // AI vs AI: you don't play → hide your team + loadout. Classic: show Player 2 picker.
    // A picked saved team supplies team 1's species + classes, so hide those pickers.
    const aivs=(ng.mode==='aivsai'), classic=(ng.mode==='classic');
    // FFA / AI vs AI use the per-team configurator instead of the single-team
    // species pickers below — show it, hide the legacy per-mode pickers.
    const usesCfg=(ng.mode==='ffa' || ng.mode==='aivsai');
    if(r.tcSec){ r.tcSec.style.display = usesCfg ? '' : 'none';
      if(usesCfg){ if(r.tcSec._render) r.tcSec._render(); if(r.tcSec._paint) r.tcSec._paint(); } }
    if(r.spSec) r.spSec.style.display = (aivs || hasSaved || usesCfg) ? 'none' : '';
    if(r.cSec)  r.cSec.style.display  = (aivs || hasSaved || usesCfg || !r.ids.length) ? 'none' : '';
    if(r.tSec)  r.tSec.style.display  = (aivs || usesCfg) ? 'none' : '';
    if(r.spSec2) r.spSec2.style.display = classic ? '' : 'none';
    if(r.spH2) r.spH2.textContent=ng.classicHuman2?'Equipo 2 (humano)':'Equipo 2 (computadora)';
    if(r.spH) r.spH.innerHTML = classic ? '<span data-t="Player 1 csapata">Player 1 csapata</span>' : '<span data-t="A te csapatod">A te csapatod</span>';
    const spEmoji=ANIMAL_EMOJI[ng.species]||'🐹';
    // osztály szerep-leírás (passiveDesc) egy adott id-hez.
    const clsDesc=(id)=>{ try{ const d=CA.Classes&&CA.Classes[id]; return d&&d.passiveDesc?T(d.passiveDesc):''; }catch(e){ return ''; } };
    [...r.cRow.children].forEach((c,i)=>{ c.style.display = i<ng.size ? '' : 'none';
      // the player team is all of the chosen species; the chip shows it + its class role.
      const m=classMeta(ng.classes[i]); c.innerHTML=spEmoji+' <span data-t="'+esc(m.name)+'">'+esc(T(m.name))+'</span>';
      // tooltip: a szerep rövid leírása (Nekromanta vs Mérnök stb.)
      const d=clsDesc(ng.classes[i]); if(d) c.title=T(m.name)+' — '+d; else c.removeAttribute('title'); });
    // ÖTLET #2: a kiválasztott (különböző) osztályok szerep-leírása egy-egy sorban.
    if(r.cDesc){
      const seen={}; const lines=[];
      for(let i=0;i<ng.size && i<r.cRow.children.length;i++){ const id=ng.classes[i];
        if(!id || seen[id]) continue; seen[id]=1;
        const m=classMeta(id), d=clsDesc(id);
        lines.push('<b>'+esc(T(m.name))+'</b>'+(d?' — '+esc(d):''));
      }
      r.cDesc.innerHTML=lines.join('<br>');
    }
    if(r.rules && r.rules.sync) r.rules.sync();
    // becsült meccshossz: csapatok × egységek × kör-idő (durva heurisztika).
    if(r.estEl){
      const tt=(ng.rulesOn && ng.rules && ng.rules.turnTime) ? ng.rules.turnTime : 45;
      const units=(ng.teams||2)*(ng.size||4);
      // minden egységnek átlagosan ~1.6 körre van szüksége; turnTime mp-ben → perc.
      const mins=Math.max(1, Math.round(units*tt*1.6/60));
      r.estEl.innerHTML='⏱ <span data-t="Becsült hossz">Becsült hossz</span>: ~'+mins+' '+T('perc');
      applyI18n(r.estEl);
    }
    applyI18n(r.spH);
  }

  // Build a PLAYER team-opts object from a saved (Team Editor) team. Mirrors the
  // mapping the editor's old doPlay() used: tid + captain + per-unit
  // uid/species/cls/cosmetic are forwarded so the engine keys XP/skills correctly
  // and spawns the exact custom roster. Returns null if the team is unusable.
  function savedTeamOpts(team, isAI, aiLevel){
    if(!team) return null;
    const MAXU=5;
    const units=(team.units||[]).slice(0,MAXU).filter(function(u){ return u && u.cls; });
    if(!units.length) return null;
    let cap=(typeof team.captain==='number')?team.captain:0;
    if(cap<0||cap>=units.length) cap=0;
    return {
      kind: units[0].species||'capybara',
      isAI: !!isAI, aiLevel: aiLevel||0,
      name: (team.name&&team.name.trim()) || teamName(units[0].species||'capybara'),
      tid: team.tid||null,                              // stable team id (XP/skills)
      captain: cap,                                     // captain unit index (identity)
      logo: team.logo||null, color: team.color||null,
      banner: team.banner||null, voiceBank: team.voiceBank||null,
      size: units.length,
      classes: units.map(function(u){ return u.cls; }),
      units: units.map(function(u){
        return { uid:u.uid||null, species:u.species||'capybara', cls:u.cls,
                 name:(u.name||'').trim(), cosmetic:u.cosmetic||null };
      })
    };
  }
  // the currently-picked saved team (or null). Only used for the PLAYER team.
  function pickedSavedTeam(){
    if(!ng.savedTid) return null;
    const saved=loadSavedTeams();
    for(let i=0;i<saved.length;i++){ if(saved[i] && saved[i].tid===ng.savedTid) return saved[i]; }
    return null;
  }

  function startGame(){
    // Intro auto-play on new game is DISABLED for now (Jani: megnézte, majd máskor
    // finomítjuk). Still fully reachable for testing via the ?intro URL switch
    // (see build()). To re-enable later: restore the CA.Intro.maybePlayOnce(startGame) call.
    const n=ng.size||4, nTeams=ng.teams||2, ids=classList();
    const opts={ gameMode:ng.mode, theme:ng.theme, weather:ng.weather, risingWater:ng.water, teamUltimate:(ng.teamUltimate!==false), aiLevel:ng.ai, vsAI:true, teamSize:n };
    // saved level-editor map: replay it instead of generating terrain (core.js
    // opts.editorMap → CA.Maps.editor.load). Adopts the map's saved theme too.
    if(ng.savedMap) opts.editorMap=ng.savedMap;
    // custom rule-set: only attach when the master toggle is on (else engine defaults).
    if(ng.rulesOn){
      const R=ng.rules;
      opts.rules={ startHp:R.startHp, turnTime:R.turnTime, retreatTime:R.retreatTime,
        wind:R.wind, windStrength:R.windStrength, suddenDeath:R.suddenDeath,
        waterRise:R.waterRise, sdToOneHp:R.sdToOneHp, weaponSet:R.weaponSet };
    }
    const allAI = (ng.mode==='aivsai');
    // run modes (gauntlet / bossrush / survival / laststand): a single PLAYER team
    // vs mode-spawned enemies. Pass team[0] so the player's species + classes +
    // size are honoured; the mode's setup() builds the first enemy itself.
    // campaign + golf are single-PLAYER-team modes: the mode's setup() consumes
    // opts.teams[0] (player's species/classes/size) and builds the rest itself.
    const runMode={gauntlet:1,bossrush:1,survival:1,laststand:1,nest:1,campaign:1,golf:1};
    if(runMode[ng.mode] && ids.length){
      opts.teams=[ { kind:ng.species, name:teamName(ng.species),
        isAI:false, aiLevel:0, classes:ng.classes.slice(0,n), size:n } ];
      // PLAYER picked a saved team (Team Editor): use the exact custom roster.
      const pickedRun=pickedSavedTeam();
      const soptsRun=pickedRun && savedTeamOpts(pickedRun, false, 0);
      if(soptsRun) opts.teams[0]=soptsRun;
    }
    // CO-OP: a single human PLAYER team; coop.setup() adds the AI ally + the
    // enemy waves. Pass the player's chosen species/classes/size as teams[0]
    // (and honour a picked saved team) so the New Game picker actually applies.
    if(ng.mode==='coop' && ids.length){
      opts.teams=[ { kind:ng.species, name:teamName(ng.species),
        isAI:false, aiLevel:0, classes:ng.classes.slice(0,n), size:n } ];
      const pickedCo=pickedSavedTeam();
      const soptsCo=pickedCo && savedTeamOpts(pickedCo, false, 0);
      if(soptsCo) opts.teams[0]=soptsCo;
    }
    // FFA / AI vs AI: build the roster from the per-team configurator (ng.slots).
    // Each slot drives one team's Human/AI flag, AI level, and species. AI vs AI
    // forces every team to AI. Distinct species per team where the user left the
    // default (the configurator pre-fills distinct species). Honours the saved
    // team for the first HUMAN slot (Team Editor roster) when one is picked.
    const cfgMode = (ng.mode==='ffa' || ng.mode==='aivsai');
    if(cfgMode && ids.length){
      const slots=Array.isArray(ng.slots)?ng.slots:[];
      opts.gameMode = allAI ? 'aivsai' : 'ffa';
      opts.numTeams = nTeams;
      opts.teams=[];
      let firstHumanIdx=-1;
      for(let i=0;i<nTeams;i++){
        const s=slots[i]||{ isAI:(allAI||i!==0), aiLevel:ng.ai, species:(TEAM_SPECIES[i]||'capybara') };
        const isAI = allAI ? true : !!s.isAI;
        const sp = s.species || TEAM_SPECIES[i%TEAM_SPECIES.length] || 'capybara';
        if(!isAI && firstHumanIdx<0) firstHumanIdx=i;
        opts.teams.push({ kind:sp, name:teamName(sp), isAI:isAI,
          aiLevel: isAI ? (typeof s.aiLevel==='number'?s.aiLevel:ng.ai) : 0,
          // human teams use the player's chosen class loadout; AI teams get a
          // balanced 1-of-each spread offset per team so they differ.
          classes: isAI ? balancedClasses(n,i) : ng.classes.slice(0,n), size:n });
      }
      // a picked saved team (Team Editor) fills the FIRST human slot, if any.
      if(firstHumanIdx>=0){
        const picked=pickedSavedTeam();
        const sopts=picked && savedTeamOpts(picked, false, 0);
        if(sopts) opts.teams[firstHumanIdx]=sopts;
      }
      try{ CA.newGame(opts); }catch(e){ console.warn('newGame failed',e); }
      return;
    }
    // standard "battle" modes honour the Teams + Units pickers; special modes
    // (survival / co-op / tutorial / arcade) keep their own bespoke setup.
    const battle={classic:1,quick:1,sniper:1,koth:1,bombrun:1,daily:1,race:1,arcade:1,forts:1};
    if(battle[ng.mode] && ids.length){
      // species pool: the player's chosen animal FIRST, then the rest (distinct).
      const pool=[ng.species].concat(TEAM_SPECIES.filter(s=>s!==ng.species));
      if(nTeams>=3){
        // ANIMAL FREE-FOR-ALL: N teams, each a DISTINCT animal species, each with a
        // balanced 1-of-each class spread. Team 1 = the player (unless AI vs AI).
        opts.gameMode = allAI ? 'aivsai' : 'ffa';
        opts.numTeams = nTeams;
        opts.teams=[];
        for(let i=0;i<nTeams;i++){
          const sp=pool[i%pool.length];
          opts.teams.push({ kind:sp, name:teamName(sp), isAI: allAI || i!==0, aiLevel:ng.ai,
            classes: (i===0 && !allAI) ? ng.classes.slice(0,n) : balancedClasses(n,i), size:n });
        }
      } else {
        // 2-team. CLASSIC asks both Player 1 & Player 2 species; other modes use a
        // distinct enemy species automatically.
        const p1=ng.species;
        const p2=(ng.mode==='classic') ? ng.species2 : (pool[1]||'worm');
        opts.teams=[
          { kind:p1, isAI:allAI, name:teamName(p1), classes:ng.classes.slice(0,n), size:n },
          { kind:p2, isAI:!ng.classicHuman2, aiLevel:ng.ai, name:teamName(p2), classes:balancedClasses(n,1), size:n },
        ];
      }
      // PLAYER picked a saved team (Team Editor): replace team[0] (the player team)
      // with the exact custom roster. Skipped in AI vs AI (no player team).
      if(!allAI){
        const picked=pickedSavedTeam();
        const sopts=picked && savedTeamOpts(picked, false, 0);
        if(sopts && opts.teams && opts.teams.length) opts.teams[0]=sopts;
      }
    }
    try{ CA.newGame(opts); }catch(e){ console.warn('newGame failed',e); }
  }

  /* ------------------------------------------------------------ SETTINGS --- */
  function buildSettings(){
    const sc=el('section','screen','');
    sc.append(head(T_title('⚙️','Beállítások')));
    const body=el('div','screen-scroll');
    const G=CA.settings;

    // language + audio
    const p1=el('div','panel section');
    p1.append(el('h3',null,'<span data-t="Általános">Általános</span>'));
    p1.append(segRow('🌐 <span data-t="Nyelv">Nyelv</span>',[['🇭🇺 HU','hu'],['🇬🇧 EN','en'],['🇪🇸 ES','es'],['🇧🇷 PT','pt'],['🇨🇳 中文','zh'],['🇩🇪 DE','de']], ()=> (CA.i18n?CA.i18n.lang:'hu'), v=>{ if(CA.i18n)CA.i18n.setLang(v); refreshAll(); }));
    p1.append(toggleRow('🔊 <span data-t="Hang">Hang</span>', ()=>!G.muted, v=>{ G.muted=!v; if(CA.Audio)CA.Audio.muted=G.muted; G.save&&G.save(); }));
    p1.append(sliderRow('🎵 <span data-t="Zene hangerő">Zene hangerő</span>', ()=>G.musicVol, v=>{ G.musicVol=v; G.save&&G.save(); }));
    p1.append(sliderRow('🔉 <span data-t="Effekt hangerő">Effekt hangerő</span>', ()=>G.sfxVol, v=>{ G.sfxVol=v; G.save&&G.save(); }));
    // (removed the "Dinamikus zene" toggle — music is always on; the music-volume
    // slider at 0 silences it. The toggle was a confusing no-op.)

    // gameplay
    const p2=el('div','panel section');
    p2.append(el('h3',null,'<span data-t="Játék">Játék</span>'));
    p2.append(segRow('✨ <span data-t="Minőség">Minőség</span>',[['Alacsony','low'],['Normál','normal'],['Magas','high']], ()=>G.quality, v=>{ G.quality=v; G.save&&G.save(); try{ if(CA.resize) CA.resize(); }catch(e){} }));
    p2.append(toggleRow('📈 <span data-t="Röppálya">Röppálya</span>', ()=>!!G.showTrajectory, v=>{ G.showTrajectory=v; G.save&&G.save(); }));
    p2.append(toggleRow('💀 <span data-t="Kill-cam">Kill-cam</span>', ()=>!!G.killcam, v=>{ G.killcam=v; G.save&&G.save(); }));

    // accessibility
    const p3=el('div','panel section');
    p3.append(el('h3',null,'<span data-t="Kényelem">Kényelem</span>'));
    p3.append(sliderRow('🎯 <span data-t="Célzás-érzékenység">Célzás-érzékenység</span>', ()=>(G.aimSensitivity-0.5)/1.5, v=>{ G.aimSensitivity=+(0.5+v*1.5).toFixed(2); G.save&&G.save(); }, x=>(0.5+(x)/100*1.5).toFixed(2)+'×'));
    p3.append(sliderRow('🖐 <span data-t="Tamaño de botones táctiles">Tamaño de botones táctiles</span>', ()=>(G.touchScale-0.75)/0.75, v=>{ G.touchScale=+(0.75+v*0.75).toFixed(2); G.save&&G.save(); }, x=>(0.75+(x)/100*0.75).toFixed(2)+'×'));
    const editTouch=el('button','btn btn--gold btn--block','✋ Ajustar posición de cada botón táctil');
    editTouch.type='button'; editTouch.onclick=()=>{ if(CA.openTouchEditor) CA.openTouchEditor(); };
    p3.append(editTouch);
    p3.append(toggleRow('🤚 <span data-t="Balkezes">Balkezes</span>', ()=>!!G.leftHanded, v=>{ G.leftHanded=v; G.save&&G.save(); }));
    p3.append(toggleRow('📳 <span data-t="Rezgés">Rezgés</span>', ()=>!!G.haptics, v=>{ G.haptics=v; G.save&&G.save(); }));
    p3.append(toggleRow('🍃 <span data-t="Mozgáscsökkentés">Mozgáscsökkentés</span>', ()=>!!G.reducedMotion, v=>{ G.reducedMotion=v; G.save&&G.save(); }));
    p3.append(segRow('🎨 <span data-t="Színvak mód">Színvak mód</span>',[['KI','off'],['Deuter','deuter'],['Protan','protan'],['Tritan','tritan']], ()=>G.colorblind||'off', v=>{ G.colorblind=v; G.save&&G.save(); }));

    body.append(p1,p2,p3);
    sc.append(body);
    return sc;
  }

  /* -------------------------------------------------------- components ----- */
  function head(titleNode){ const h=el('div','screen-head');
    const back=el('button','btn btn--ghost btn--sm btn-back','‹ <span data-t="Vissza">Vissza</span>'); back.onclick=()=>setScreen('main');
    h.append(back, titleNode); return h; }
  function T_title(icon, label){ return el('div','screen-title','<span>'+icon+'</span> <span data-t="'+esc(label)+'">'+esc(label)+'</span>'); }
  function rowShell(labelHtml){ const r=el('div','row row--between card'); r.append(el('div',null,labelHtml)); return r; }
  function toggleRow(labelHtml, get, set){ const r=rowShell(labelHtml);
    const lbl=el('label','switch'); const i=el('input'); i.type='checkbox'; i.checked=!!get();
    i.onchange=()=>set(i.checked); lbl.append(i, el('span','track')); r.append(lbl); r._sync=()=>{ i.checked=!!get(); }; return r; }
  function sliderRow(labelHtml, get, set, fmt){ const r=el('div','card section'); r.append(el('div',null,labelHtml));
    const rr=el('div','range-row'); const inp=el('input','range'); inp.type='range'; inp.min=0; inp.max=100;
    inp.value=Math.round((get()||0)*100); const val=el('div','range-val');
    const show=()=> val.textContent = fmt?fmt(+inp.value):(inp.value+'%');
    inp.oninput=()=>{ set(+inp.value/100); show(); }; show();
    rr.append(inp,val); r.append(rr); r._sync=()=>{ inp.value=Math.round((get()||0)*100); show(); }; return r; }
  function segRow(labelHtml, opts, get, set){ const r=rowShell(labelHtml); const seg=el('div','seg');
    opts.forEach(([nm,v])=>{ const b=el('button',null,'<span data-t="'+esc(nm)+'">'+esc(nm)+'</span>'); b.onclick=()=>{ set(v); upd(); }; b.dataset.v=v; seg.appendChild(b); });
    function upd(){ [...seg.children].forEach(b=>b.classList.toggle('sel', b.dataset.v===String(get()))); }
    upd(); r.append(seg); r._sync=upd; return r; }

  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  /* ----------------------------------------------------------- i18n pass --- */
  function applyI18n(node){ (node||root).querySelectorAll('[data-t]').forEach(e=>{ e.textContent=T(e.dataset.t); }); }
  function refreshAll(){ applyI18n(); renderNG(); root.querySelectorAll('.card,.range-row').forEach(()=>{});
    Object.values(screens).forEach(sc=> sc.querySelectorAll('*').forEach(e=>{ if(e._sync)e._sync(); }));
    document.querySelectorAll('#menu-root [data-t]').forEach(e=>e.textContent=T(e.dataset.t)); }

  /* ------------------------------------------------------------- build ----- */
  // build + register a screen. builder(API) returns a DOM section element OR
  // { el, onShow }. onShow() runs each time the screen becomes active (refresh data).
  // ---- HUB: the secondary screens share a top tab-bar (Jani: egy menü, felül
  // tabok). Editor stays a separate home button (it's a tool, not a hub page).
  // [icon, label, screenId, needsLogin]
  const HUB_TABS=[
    ['📊','Profil','profile',1],['🏆','Ranglista','leaderboard',0],['⭐','Eredmények','achievements',1],
    ['🎡','Pörgetés','daily',1],['🛒','Bolt','shop',1],['🎟️','Szezon','battlepass',1],
    ['🦇','Klán','clan',1],['🏅','Rangsor','ranked',0],['❓','Súgó','help',0],
    ['👏','Készítők','credits',0],['✉️','Kapcsolat','contact',0]
  ];
  const HUB_IDS={}; HUB_TABS.forEach(t=>HUB_IDS[t[2]]=1);
  // Rebuild every hub screen's tab-bar so the login-gated tabs (Pörgetés/Bolt/
  // Profil/Eredmények/Szezon/Klán) flip from locked→active the instant the user
  // logs in — without this, `locked` is frozen at build time and the tabs stay
  // INACTIVE until you fully leave + re-enter the hub. (Jani: "beléptem mégis
  // inaktív maradt minden a Több alatti menü.")  Wired to 'accountChanged' below.
  function refreshHubTabs(){
    try{
      Object.keys(HUB_IDS).forEach(function(id){
        const e=screens[id]; if(!e) return;
        const old=e.querySelector('.hub-tabs-wrap'); if(!old||!old.parentNode) return;
        const fresh=buildHubTabs(id);
        old.parentNode.replaceChild(fresh, old);
        try{ applyI18n(fresh); }catch(_){}
      });
    }catch(e){}
  }
  function buildHubTabs(currentId){
    const bar=el('div','hub-tabs');
    // 2-ROW WRAP layout (Jani: "ez legyen inkább 2 soros, ne csúszkás") — the chips
    // wrap onto multiple rows, centered; NO horizontal scroll, NO ◀▶ arrows.
    bar.style.cssText='display:flex;flex-wrap:wrap;justify-content:center;gap:6px;padding:2px;flex:1 1 auto;min-width:0;';
    HUB_TABS.forEach(([ic,label,id,need])=>{
      const locked = need && !(CA.Account&&CA.Account.user);
      const c=el('button','chip'+(id===currentId?' sel':'')+(locked?' locked':''),'<span>'+ic+'</span> <span data-t="'+esc(label)+'">'+esc(label)+'</span>'+(locked?' <span>🔒</span>':''));
      c.style.cssText='flex:0 0 auto;white-space:nowrap;';
      if(locked){ c.onclick=()=>{}; }
      else { c.onclick=()=>{ setScreen(id); }; }
      bar.appendChild(c);
    });
    const wrap=el('div','hub-tabs-wrap');
    wrap.appendChild(bar);
    return wrap;
  }

  function buildScreen(id, builder){
    try{
      const res = builder(API);
      const e = (res && res.nodeType) ? res : (res && res.el);
      if(!e) return;
      DOM_SCREENS[id]=1; screens[id]=e; if(res && res.onShow) onShowFns[id]=res.onShow;
      if(res && res.onHide) onHideFns[id]=res.onHide;
      // hub member → inject the shared tab-bar at the top of its scroll body.
      if(HUB_IDS[id]){ try{ const b=e.querySelector('.screen-scroll')||e; b.insertBefore(buildHubTabs(id), b.firstChild); }catch(e2){} }
      if(root){ root.appendChild(e); applyI18n(e); }
    }catch(err){ console.warn('[menu] screen build failed:', id, err); }
  }

  function build(){
    if(built) return;
    root=document.getElementById('menu-root'); if(!root){ root=el('div'); root.id='menu-root'; document.body.appendChild(root); }
    built=true;
    buildScreen('main', buildHome);
    buildScreen('newgame', buildNewGame);
    buildScreen('settings', buildSettings);
    pending.forEach(([id,b])=>buildScreen(id,b)); pending=[];
    applyI18n();
    if(CA.events) CA.events.on('langChanged', refreshAll);
    if(CA.events) CA.events.on('accountChanged', refreshHubTabs);
    // ?intro — play the cinematic on demand for testing (ignores the seen-flag).
    // Delayed so it lands over the brand splash. (Jani: skynet…/animals/?intro)
    try{
      if(/[?&]intro\b/.test(location.search||'') && CA.Intro && CA.Intro.replay){
        setTimeout(function(){ try{ CA.Intro.replay(function(){}); }catch(e){} }, 500);
      }
    }catch(e){}
  }

  /* ------------------------------------------------------------- sync ------ */
  function sync(force){
    if(!built) return;
    const inMenu = (S.mode===(CA.GameState&&CA.GameState.MENU));
    const scr = (CA.UI&&CA.UI.screen)?CA.UI.screen():'main';
    const domHandles = inMenu && DOM_SCREENS[scr];
    if(domHandles){
      if(!visible || force){ root.classList.add('show'); visible=true; }
      // activate the right screen
      const want = screens[scr] ? scr : 'main';
      Object.keys(screens).forEach(k=> screens[k].classList.toggle('active', k===want));
      curScreen=want;
      if(want!==lastActive){
        // leaving the previous screen → fire its onHide (timer/RAF teardown)
        if(lastActive && onHideFns[lastActive]){ try{ onHideFns[lastActive](); }catch(e){} }
        lastActive=want; const f=onShowFns[want]; if(f){ try{ f(); }catch(e){} }
        // Each hub screen has its OWN tab strip (scrollLeft defaults to 0). When
        // you scroll the strip right and tap a tab (e.g. Súgó), the NEW screen's
        // strip would open scrolled fully left — looking like the scroll "jumped
        // back". Center the selected chip in the now-visible strip so the current
        // tab stays in view. (Jani: "rákattintok a Súgóra, visszaugrik balra")
        try{
          const _bar = screens[want] && screens[want].querySelector('.hub-tabs');
          const _sel = _bar && _bar.querySelector('.chip.sel');
          if(_bar && _sel){
            const _center=()=>{ _bar.scrollLeft = Math.max(0, _sel.offsetLeft - (_bar.clientWidth - _sel.offsetWidth)/2); };
            _center(); setTimeout(_center, 0);   // again after layout (sizes can be 0 pre-show)
          }
        }catch(_e){}
        // QA P1: a renderNG csak BELÉPÉSKOR fusson, ne minden frame-en — a 60fps-es
        // teljes DOM-újraépítés a mentett-csapat/pálya chipeket a pointerdown és a
        // pointerup KÖZÖTT cserélte le, így a kattintás gyakran elveszett (+ GC-churn).
        // Az interaktív chipek változáskor maguk hívják a renderNG()-t.
        if(want==='newgame') renderNG();
      }
      if(want==='main'){ const v=document.getElementById('menu-ver'); if(v) v.textContent = (document.title.match(/v[\d.]+/)||[''])[0]; }
    } else {
      // left the menu entirely (into a game) → fire the active screen's onHide + reset
      if(lastActive && onHideFns[lastActive]){ try{ onHideFns[lastActive](); }catch(e){} }
      lastActive=null;
      if(visible || force){ root.classList.remove('show'); visible=false; }
    }
  }

  /* ------------------------------------------------------------- API ------- */
  // Toolkit handed to screen builders so every screen uses the SAME components.
  const API = {
    el, esc, t:T, go:setScreen, applyI18n,
    head,                                   // head(titleNode) -> header w/ back button
    title:T_title,                          // title('⚙️','Beállítások') -> .screen-title node
    toggleRow, sliderRow, segRow,           // settings-style rows (label + control + ._sync)
    // a full screen scaffold: returns {screen, body}; body is the scroll container
    screen(icon, label){
      const sc=el('section','screen','');
      sc.append(head(T_title(icon,label)));
      const body=el('div','screen-scroll'); sc.append(body);
      return { screen:sc, body };
    },
    btn(label, cls, onClick){ const b=el('button','btn '+(cls||''), label); if(onClick)b.onclick=onClick; return b; },
    panel(){ return el('div','panel section'); },
    card(){ return el('div','card'); },
    chip(label, sel, onClick){ const c=el('button','chip'+(sel?' sel':''), label); if(onClick)c.onclick=onClick; return c; },
    field(labelText){ const f=el('div','field'); if(labelText)f.append(el('label',null,labelText)); const i=el('input','input'); f.append(i); f.input=i; return f; },
    // Dismissible info banner. Returns a node (prepend it to a screen body) or
    // null if the user already X-ed it (persisted in localStorage). `html` may
    // contain markup; pass already-localized text via API.t(...).
    //   var ic = API.infoCard('shop_v1', API.t('...')); if(ic) body.insertBefore(ic, body.firstChild);
    infoCard(id, html){
      try{ if(localStorage.getItem('ca_info_'+id)==='1') return null; }catch(e){}
      const c=el('div','panel section info-card');
      c.style.cssText='position:relative;border-left:3px solid #E8711A;';
      const tx=el('div','muted'); tx.style.cssText='padding-right:24px;font-size:13px;line-height:1.45;'; tx.innerHTML=html;
      const x=el('button',null,'✕');
      x.style.cssText='position:absolute;top:6px;right:8px;background:none;border:0;color:#9aa7b3;font-size:15px;cursor:pointer;line-height:1;padding:4px;';
      x.setAttribute('aria-label',T('Bezár'));
      x.onclick=function(){ try{localStorage.setItem('ca_info_'+id,'1');}catch(e){} if(c.parentNode) c.parentNode.removeChild(c); };
      c.append(tx); c.append(x);
      return c;
    },
  };

  CA.Menu = {
    handles:(s)=>!!DOM_SCREENS[s],
    go:setScreen,
    // ESC / Back: if we're on a sub-screen, return to the main menu. Returns
    // true when it actually navigated (so the caller can swallow the key).
    back(){ const cur=(CA.UI&&CA.UI.screen)?CA.UI.screen():curScreen;
      if(cur && cur!=='main'){ setScreen('main'); return true; } return false; },
    ui:API,
    /* register a submenu screen from a separate file (menu-*.js).
     * id: screen id (matches CA.UI.setScreen(id) the home buttons trigger).
     * builder(API) -> section element OR { el, onShow }. */
    register(id, builder){ if(built) buildScreen(id, builder); else pending.push([id, builder]); },
    refresh:refreshAll,
    init(){ build(); loop(); },
    sync,
  };
  function loop(){ try{ sync(); }catch(e){} requestAnimationFrame(loop); }

  // build as soon as the DOM is ready (boot also calls init)
  if(document.readyState!=='loading') setTimeout(()=>{ try{ CA.Menu.init(); }catch(e){} },0);
  else document.addEventListener('DOMContentLoaded', ()=>{ try{ CA.Menu.init(); }catch(e){} });
})();
