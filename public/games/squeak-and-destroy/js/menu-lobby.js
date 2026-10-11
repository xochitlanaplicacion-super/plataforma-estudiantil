/* ============================================================================
 * Squeak & Destroy — menu-lobby.js :: the MULTIPLAYER ONLINE ROOM screen ('lobby')
 * ----------------------------------------------------------------------------
 * A DOM submenu (over the gameplay canvas) for the online lobby. Registers
 * itself with CA.Menu and is driven entirely by CA.Net (host/join/quick-match +
 * room view: code, player list, map/mode pickers, ready, start, chat, leave).
 *
 * Robustness: every CA.Net call is guarded (methods may be absent). The view
 * re-renders on CA.events ('net:chat','playerJoined','net:roomcfg',
 * 'net:matchmaking') AND on the CA.Net internal bus (roster/hosted/joined/left/
 * connected/playerLeft), plus a light interval while the screen is active.
 * Listeners are attached once and torn down when the screen hides.
 * ==========================================================================*/
(function(){
  'use strict';

  /* ---- EN translations for this screen ---- */
  if (window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Online szoba':'Online room',
    'Neved':'Your name',
    'Játékos':'Player',
    '🎮 Szoba létrehozása':'🎮 Create room',
    '🔎 Keress ellenfelet':'🔎 Find opponent',
    'Ellenfél keresése…':'Searching for opponent…',
    'Mégse':'Cancel',
    'Csatlakozás kóddal':'Join with a code',
    'KÓD':'CODE',
    '➜ Belépés':'➜ Join',
    'Szobakód':'Room code',
    '📋 Másolás':'📋 Copy',
    'Másolva!':'Copied!',
    'Játékosok':'Players',
    '(te)':'(you)',
    'Pálya':'Map',
    'Mód':'Mode',
    'Klasszikus':'Classic',
    'FFA':'FFA',
    'AI':'AI',
    'Készen állok':'I am ready',
    '▶ Indítás':'▶ Start',
    'Várj a többi játékosra…':'Waiting for other players…',
    'Csak a host indíthat':'Only the host can start',
    'Beszélgetés':'Chat',
    'Írj üzenetet…':'Type a message…',
    '➤ Küld':'➤ Send',
    '🚪 Kilépés':'🚪 Leave',
    'Még nem vagy szobában.':'You are not in a room yet.',
    'Hozz létre egyet, keress ellenfelet, vagy lépj be egy kóddal.':'Create one, find an opponent, or join with a code.',
    'Csatlakozás…':'Connecting…',
    'Kapcsolódva':'Connected',
    'Host':'Host',
    'Készen áll':'Ready',
    'Vár':'Waiting',
    'Néző':'Spectator',
    'Beállítások a hosttól':'Settings from the host',
    'Találat! Csatlakozás…':'Matched! Connecting…',
    'Keresés megszakítva.':'Search cancelled.',
    'Hiba a kereséskor.':'Error while searching.',
    // experimental notice + clear connection states
    '🧪 Online játék — béta':'🧪 Online play — beta',
    'Most egy hálózaton (ugyanaz a wifi/router) vagy két böngészőfülön a legmegbízhatóbb. A nyílt interneten a kapcsolat a hálózattól függ (TURN-szerver kellhet).':
      'Most reliable on the same network (same wifi/router) or two browser tabs right now. On the open internet, connecting depends on your network (a TURN server may be needed).',
    '💡 Tipp: nyisd meg a játékot két fülön, az egyikben hozz létre szobát, a másikban lépj be a kóddal.':
      '💡 Tip: open the game in two tabs, create a room in one, join with the code in the other.',
    'Csatlakozás folyamatban…':'Connecting…',
    'Várakozás az ellenfélre…':'Waiting for opponent…',
    'Oszd meg a kódot az ellenfeleddel.':'Share the code with your opponent.',
    'Nem sikerült csatlakozni':'Could not connect',
    'Az ellenfél kilépett.':'The opponent left.',
    'A kapcsolat megszakadt.':'The connection was lost.',
    '🔄 Újra':'🔄 Retry',
    'Újrakapcsolódás…':'Reconnecting…',
    'Rövid fennakadás — próbálunk újrakapcsolódni.':'Brief hiccup — trying to reconnect.',
    'Keresés időtúllépés — próbáld újra.':'Search timed out — try again.',
    'Még keresünk… (oszd meg a kódot is, ha akarod)':'Still searching… (or share a code instead)',
  });

  if (window.CA && CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Vissza':'Back',
    '🌐 Nyitott szobák':'🌐 Open rooms',
    'Nyitott szobák':'Open rooms',
    'Csatlakozás':'Join',
    'Publikus szoba (bárki láthatja a lobbyban)':'Public room (anyone can see it in the lobby)',
    'Privát szoba (csak kóddal)':'Private room (code only)',
    'Nincs nyitott szoba — hozz létre egyet, vagy keress ellenfelet.':'No open rooms — create one or find an opponent.',
    'Válassz fajt':'Choose a species',
    'Játékosok száma':'Number of players',
    'Nézőként csatlakoztál (a szoba megtelt).':'You joined as a spectator (the room is full).',
    // fake-room transparency badge + native share
    '🤖 Gyakorló bot':'🤖 Practice bot',
    'Demo':'Demo',
    'Ez egy gyakorló meccs a gép ellen — nem valódi online ellenfél.':
      'This is a practice match against the computer — not a real online opponent.',
    'Megosztás':'Share',
    'Csatlakozz a szobámhoz: ':'Join my room: ',
    // "challenge a friend" duel deep-link share (virality)
    '⚔️ Hívd ki a haverod':'⚔️ Challenge a friend',
    'Küldj egy linket — a haverod egyből egy pályára kerül veled.':
      'Send a link — your friend drops straight into an arena with you.',
    'Hívd ki egy haverod erre a pályára! ':'Challenge a friend to this arena! ',
    'Link kimásolva!':'Link copied!',
    'Link másolása sikertelen':'Could not copy the link',
  });

  /* a safe call into CA.Net (returns fallback if method missing/throws) */
  function net(){ return (window.CA && CA.Net) ? CA.Net : null; }
  function call(method, fallback){
    const N = net(); if (!N || typeof N[method] !== 'function') return fallback;
    try{ return N[method].apply(N, Array.prototype.slice.call(arguments,2)); }
    catch(e){ return fallback; }
  }

  function build(API){
    const E   = API.el;
    const esc = API.esc;
    const T   = API.t;
    const { screen, body } = API.screen('🌐','Online szoba');

    /* persistent local chat buffer (cap 50) so it survives re-renders */
    let chat = [];
    const CHAT_CAP = 50;

    /* matchmaking UI state */
    let mmState = null;   // null | 'searching' | 'waiting' | 'timeout'
    let mmStarted = 0;    // ms timestamp when the current search began (for timeout)
    let mmTimer = null;   // client-side search-timeout handle
    const MM_SEARCH_TIMEOUT_MS = 60000; // give up the auto-search after ~60s

    /* PUBLIC LOBBY — real open rooms discovered via CA.Net.listRooms() (Jani:
     * "a multiba belépve lássam mint egy lobbyt; a find fedezze fel a szobákat"). */
    let lobbyRooms = [];        // [{code,name,theme,mode,players,age}]
    let roomsT = 0;            // last refresh (ms) — throttle the poll
    let createPublic = true;   // new rooms are PUBLIC by default (privacy toggle)
    function refreshRooms(){
      const now = Date.now();
      if (now - roomsT < 2500) return;   // throttle: ~every 2.5s
      roomsT = now;
      const p = call('listRooms', null);
      if (p && typeof p.then === 'function'){
        p.then(function(list){
          const arr = Array.isArray(list) ? list : [];
          // re-render only if the visible set actually changed (avoid flicker)
          const sig = arr.map(function(r){ return r.code+':'+r.players; }).join(',');
          if (sig !== lobbyRooms.__sig){ lobbyRooms = arr; lobbyRooms.__sig = sig; render(); }
        }).catch(function(){});
      }
    }

    function stopMmTimeout(){ if (mmTimer){ clearTimeout(mmTimer); mmTimer = null; } }
    // Begin the client-side timeout: if no opponent is found within the window we
    // cancel the server ticket and tell the player to retry or use a code instead.
    function startMmTimeout(){
      stopMmTimeout();
      mmStarted = Date.now();
      mmTimer = setTimeout(function(){
        mmTimer = null;
        if (mmState === 'searching' || mmState === 'waiting'){
          call('cancelMatch', undefined);
          mmState = 'timeout';
          render();
        }
      }, MM_SEARCH_TIMEOUT_MS);
    }

    /* ---- FAKE "open rooms" so the lobby never looks empty -------------------
     * Cosmetic only: these are NOT real network rooms. Joining one plays out a
     * short fake "connecting -> connected + bot chat" beat, then the ▶ Start
     * launches a LOCAL AI skirmish dressed as the online match we "joined" — so
     * it is never a dead-end "couldn't connect". Pure client-side; it never
     * touches matchmake.php / signal.php and can't interfere with real MP. */
    let fakeRoom = null;          // { srv, phase:'connecting'|'joined', myName }
    let fakeChat = [];            // chat lines shown inside a fake room
    let FAKE_SERVERS = null;      // lazily generated (after CA.Maps is ready)
    const fakeTimers = [];
    function clearFakeTimers(){ while (fakeTimers.length){ clearTimeout(fakeTimers.pop()); } }
    function fakeAfter(ms, fn){ const id = setTimeout(fn, ms); fakeTimers.push(id); return id; }
    function randCode(){ const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s+=a[Math.floor(Math.random()*a.length)]; return s; }
    // nyelvfüggő pool: HU-n a magyar nevek/chat, minden más nyelven nemzetközi
    // (Jani/QA: ES/PT/ZH játékosnak magyar szobák idegen-szerverként olvasódtak).
    function _isHu(){ try{ return (CA.i18n && CA.i18n.lang) === 'hu'; }catch(e){ return true; } }
    function pickReady(){ const a = _isHu()
        ? ['Mehet? 👍','Készen állsz? 🎮','Nyomjuk? 🔥','Kezdhetjük? 🚀']
        : ['Ready? 👍','You set? 🎮',"Let's go? 🔥",'Start? 🚀','GG? 😎'];
      return a[Math.floor(Math.random()*a.length)]; }
    function _greet(name){ return (_isHu() ? 'Szia ' : 'Hi ') + name + '! 👋'; }
    function makeFakeServers(){
      const clans = _isHu()
        ? ['🦫 Hódok','🐸 Békalesők','🦔 Sünkommandó','🐹 Capy Klán','🦅 Sasok','🐨 Koala Banda','🪱 Kukac Brigád','🐰 Tappancs','💥 Pixel Banda','🔥 Vadócok']
        : ['🦫 Beavers','🐸 Frog Squad','🦔 Spike Force','🐹 Capy Clan','🦅 Eagles','🐨 Koala Gang','🪱 Worm Brigade','🐰 Paws','💥 Pixel Crew','🔥 Wildcats'];
      const hosts = _isHu()
        ? ['Józsi','Tomi','Niki','Bütyök','Mókus','Brúnó','Zoé','Pici','Dani','Réka','Bandi','Csabi']
        : ['Alex','Max','Sam','Leo','Mia','Nina','Tom','Kai','Zoe','Ben','Lily','Finn'];
      const kinds = ['worm','frog','hedgehog','beaver','koala','bird'];
      const maps  = safeMapList();
      const pick  = function(a){ return a[Math.floor(Math.random()*a.length)]; };
      const used  = {}; const out = [];
      for (let i=0;i<3;i++){
        let label, guard=0; do { label = pick(clans); guard++; } while (used[label] && guard<40);
        used[label] = 1;
        out.push({
          code: randCode(), label: label, host: pick(hosts), botKind: pick(kinds),
          theme: pick(maps), mode: 'classic', ai: 1,
          ping: 18 + Math.floor(Math.random()*70),
        });
      }
      return out;
    }
    function openRooms(){ if (!FAKE_SERVERS) FAKE_SERVERS = makeFakeServers(); return FAKE_SERVERS; }

    // Click a fake server -> play the short "connecting + bot greets" beat.
    function joinFake(s, myName){
      call('setName', undefined, myName);
      clearFakeTimers();
      fakeRoom = { srv:s, phase:'connecting', myName:(myName||'Játékos') };
      fakeChat = [];
      render();
      fakeAfter(1100, function(){
        if (!fakeRoom) return;
        fakeRoom.phase = 'joined'; render();
        fakeAfter(800,  function(){ if (!fakeRoom) return; fakeChat.push({ name:s.host, text:_greet(fakeRoom.myName) }); render(); });
        fakeAfter(2400, function(){ if (!fakeRoom) return; fakeChat.push({ name:s.host, text:pickReady() }); render(); });
      });
    }

    // ▶ Start in a fake room: launch a real LOCAL AI match (you vs the bot host).
    function startFakeGame(s, myName){
      clearFakeTimers();
      fakeRoom = null; fakeChat = [];
      if (CA.newGame) CA.newGame({
        teams: [
          { kind:'capybara', name:(myName||'Játékos'), isAI:false, aiLevel:0 },
          { kind:(s.botKind||'worm'), name:s.host, isAI:true, aiLevel:(s.ai!=null?s.ai:1) },
        ],
        gameMode: s.mode || 'classic',
        theme: s.theme,
      });
      if (CA.UI && CA.UI.setScreen) CA.UI.setScreen('main');
    }

    /* listener / interval bookkeeping (attach-once, detach on hide) */
    let bound = false;
    let pollTimer = null;
    const netHandlers = {};      // event -> fn (CA.Net.on bus)
    const evHandlers  = {};      // event -> fn (CA.events)

    /* the single mount point we re-render into */
    const view = E('div','section');
    view.style.width = '100%';
    body.append(view);

    /* ---------------------------------------------------------------- helpers */
    function online(){ return !!call('isOnline', false); }
    function selfId(){ return call('selfId', null); }

    function makeBackBtn(){ /* header back already handled by API.screen */ }

    /* Tear down any active room (created/hosting OR joined/connecting) before we
     * leave the screen. Treating Back as Leave: a host that created a room and
     * pressed Back must close it instead of orphaning it (no opponent yet ⇒ the
     * room would otherwise keep polling/waiting). Idempotent + fully guarded so
     * single-player (no role, net optional) is never affected. */
    function leaveRoom(){
      // a fake "open room" we were sitting in -> just drop it + its timers.
      if (fakeRoom){ clearFakeTimers(); fakeRoom = null; fakeChat = []; }
      // online() => CA.Net has a live role (host or client), in any sub-state
      // (created/waiting, connecting, or connected). CA.Net.leave() cancels any
      // quick-match search, tears down the transport (stops WebRTC poll/timers),
      // and resets status to idle.
      if (online()){
        call('leave', undefined);
        chat = [];
      } else if (mmState){
        // not in a room yet but a quick-match search is running -> cancel its server
        // ticket and timer so we don't leave a dangling queue entry behind.
        stopMmTimeout();
        call('cancelMatch', undefined);
        mmState = null;
      }
    }

    /* The framework's header Back button (added by API.screen via head()) is
     * hardwired to setScreen('main'); it has no Leave awareness. We wrap its
     * onclick so Back first closes the room, THEN performs the original nav. */
    function hookBackButton(){
      const back = screen.querySelector && screen.querySelector('.btn-back');
      if (!back || back._lobbyHooked) return;
      back._lobbyHooked = true;
      const orig = back.onclick;
      back.onclick = function(ev){
        try{ leaveRoom(); }catch(_){}
        if (typeof orig === 'function') return orig.call(this, ev);
      };
    }

    /* preserve a focused input's value/caret across full re-renders */
    function focusedField(){
      const a = document.activeElement;
      if (a && a.tagName === 'INPUT' && view.contains(a)) {
        return { key: a.dataset.k || '', val: a.value, start: a.selectionStart, end: a.selectionEnd };
      }
      return null;
    }
    function restoreField(snap){
      if (!snap || !snap.key) return;
      const inp = view.querySelector('input[data-k="'+snap.key+'"]');
      if (inp){ if (snap.val!=null) inp.value = snap.val;   // restore the typed text (was a no-op → name reset on every re-render)
        inp.focus();
        try{ if (snap.start!=null) inp.setSelectionRange(snap.start, snap.end); }catch(_){}
      }
    }

    /* ============================================================ RENDER ROOT */
    function render(){
      const snap = focusedField();
      view.innerHTML = '';
      if (online()) renderRoom();
      else if (fakeRoom) renderFakeRoom();
      else renderLobby();
      API.applyI18n(view);
      restoreField(snap);
    }

    /* ---------------------------------------------------- STATE A: not in room */
    function renderLobby(){
      // name field
      const p = API.panel();

      // experimental / same-network notice (honest gating: internet play depends
      // on the players' networks; same-LAN or two tabs is the reliable path now).
      // DISMISSIBLE: X + localStorage persist via API.infoCard (returns null once
      // the user has closed it), so it doesn't nag on every entry.
      const notice = API.infoCard && API.infoCard('lobby_beta_v1',
        '<b>' + T('🧪 Online játék — béta') + '</b><br>'
        + T('Most egy hálózaton (ugyanaz a wifi/router) vagy két böngészőfülön a legmegbízhatóbb. A nyílt interneten a kapcsolat a hálózattól függ (TURN-szerver kellhet).'));
      if (notice) p.append(notice);

      const nameSec = E('div','section');
      nameSec.append(E('h3', null, '<span data-t="Neved">Neved</span>'));
      const nameField = API.field('');
      nameField.input.maxLength = 18;   // QA P2: korlátlan MP-név ne folyjon szét a HUD-on
      nameField.input.dataset.k = 'name';
      nameField.input.value = call('selfName', '') || 'Játékos';
      nameField.input.placeholder = T('Játékos');
      // select-all on focus so typing replaces the default — DON'T wipe it (Jani:
      // "ha belekattolok újrakezdi"); clearing + the re-render reset wiped the name.
      nameField.input.addEventListener('focus', function(){ try{ this.select(); }catch(_){} });
      nameSec.append(nameField);
      p.append(nameSec);

      const curName = ()=> (nameField.input.value.trim() || 'Játékos');

      // Kick off (or restart) the quick-match search: set the name, flip UI state,
      // arm the client-side timeout, and let CA.Net drive status via the callback.
      function startSearch(){
        call('setName', undefined, curName());
        mmState = 'searching';
        startMmTimeout();
        const ok = call('findMatch', false, function(status){
          if (!status) return;
          if (status.state === 'searching' || status.state === 'waiting'){
            mmState = status.state;
          } else if (status.state === 'matched'){
            stopMmTimeout(); mmState = 'searching';   // connecting; lobby flips to room view
          } else {                                     // cancelled / error
            stopMmTimeout(); mmState = null;
          }
          render();
        });
        if (ok === false){ stopMmTimeout(); mmState = null; }  // findMatch unavailable
        render();
      }

      // primary actions
      const act = E('div','section');

      const createBtn = API.btn('<span data-t="🎮 Szoba létrehozása">🎮 Szoba létrehozása</span>',
        'btn--green btn--lg btn--block', function(){
          call('setName', undefined, curName());
          call('host', undefined, { public: createPublic });
          render();
        });
      act.append(createBtn);
      // PUBLIC / PRIVATE toggle for the room being created (Jani: publikus alapból,
      // privátra állítható, ha valaki nem akarja megosztani).
      const privRow = E('div','row'); privRow.style.cssText='align-items:center;gap:8px;margin-top:4px;';
      const privLbl = E('div','muted'); privLbl.style.flex='1'; privLbl.style.fontSize='13px';
      const paintPriv = function(){
        privLbl.innerHTML = createPublic
          ? '🌐 <span data-t="Publikus szoba (bárki láthatja a lobbyban)">Publikus szoba (bárki láthatja a lobbyban)</span>'
          : '🔒 <span data-t="Privát szoba (csak kóddal)">Privát szoba (csak kóddal)</span>';
      };
      const privBtn = API.btn(createPublic?'🌐':'🔒','btn--ghost btn--sm', function(){
        createPublic = !createPublic; privBtn.textContent = createPublic?'🌐':'🔒'; paintPriv();
        // if a room is already open, flip its listing live
        call('setRoomPublic', undefined, createPublic);
      });
      paintPriv(); privRow.append(privLbl, privBtn); act.append(privRow);

      // quick match block
      if (mmState === 'timeout'){
        // search ran out (no opponent within the window) -> clear feedback + retry.
        const to = E('div','card section');
        to.append(E('div', null, '<b>⌛ <span data-t="Keresés időtúllépés — próbáld újra.">Keresés időtúllépés — próbáld újra.</span></b>'));
        const retry = API.btn('<span data-t="🔎 Keress ellenfelet">🔎 Keress ellenfelet</span>', 'btn--block', function(){
          startSearch();
        });
        const stop = API.btn('<span data-t="Mégse">Mégse</span>', 'btn--ghost btn--block', function(){
          mmState = null; render();
        });
        to.append(retry, stop);
        act.append(to);
      } else if (mmState){
        const searching = E('div','card section');
        searching.append(E('div', null, '<span data-t="Ellenfél keresése…">Ellenfél keresése…</span> <span class="muted">'+(mmState==='waiting'?'⏳':'…')+'</span>'));
        // after a few seconds of waiting, hint that a code is an alternative.
        if (mmState === 'waiting' && mmStarted && (Date.now()-mmStarted) > 6000){
          const hint = E('div','muted'); hint.style.fontSize = '12px'; hint.style.marginTop = '2px';
          hint.innerHTML = '<span data-t="Még keresünk… (oszd meg a kódot is, ha akarod)">Még keresünk… (oszd meg a kódot is, ha akarod)</span>';
          searching.append(hint);
        }
        const cancel = API.btn('<span data-t="Mégse">Mégse</span>', 'btn--red btn--block', function(){
          stopMmTimeout();
          call('cancelMatch', undefined);
          mmState = null; render();
        });
        searching.append(cancel);
        act.append(searching);
      } else {
        const findBtn = API.btn('<span data-t="🔎 Keress ellenfelet">🔎 Keress ellenfelet</span>',
          'btn--block', function(){ startSearch(); });
        act.append(findBtn);
      }
      p.append(act);

      // CHALLENGE-A-FRIEND — a prominent virality action: generate a self-contained
      // duel deep-link (?duel=…, consumed by index.html → CA.Challenge.openDuel)
      // and share it. navigator.share on mobile, else clipboard + toast; a live
      // portal SDK's invite is preferred when present (all guarded in challenge.js).
      if (window.CA && CA.Challenge && typeof CA.Challenge.createDuel === 'function'){
        const duelSec = E('div','section');
        const dCard = E('div','card');
        dCard.style.cssText = 'border-left:3px solid var(--gold)';
        dCard.append(E('div', null, '<b><span data-t="⚔️ Hívd ki a haverod">⚔️ Hívd ki a haverod</span></b>'));
        const hint = E('div','muted'); hint.style.cssText = 'font-size:12px;margin-top:2px';
        hint.innerHTML = '<span data-t="Küldj egy linket — a haverod egyből egy pályára kerül veled.">Küldj egy linket — a haverod egyből egy pályára kerül veled.</span>';
        dCard.append(hint);
        const dBtn = API.btn('<span data-t="⚔️ Hívd ki a haverod">⚔️ Hívd ki a haverod</span>',
          'btn--lg btn--block', function(){ shareDuelInvite(dBtn); });
        // brand orange to match the primary accent.
        dBtn.style.cssText += ';background:#E8711A;color:#fff;margin-top:var(--s2)';
        dCard.append(dBtn);
        duelSec.append(dCard);
        p.append(duelSec);
      }

      // OPEN ROOMS — REAL public rooms discovered from the backend (lobby view).
      refreshRooms();
      const roomsSec = E('div','section');
      roomsSec.append(E('h3', null, '🌐 <span data-t="Nyitott szobák">Nyitott szobák</span>'));
      if (!lobbyRooms.length){
        const empty = E('div','muted'); empty.style.fontSize='13px';
        empty.innerHTML = '<span data-t="Nincs nyitott szoba — hozz létre egyet, vagy keress ellenfelet.">Nincs nyitott szoba — hozz létre egyet, vagy keress ellenfelet.</span>';
        roomsSec.append(empty);
      } else {
        lobbyRooms.forEach(function(r){
          const tEmoji = ({grass:'🌳',desert:'🏜️',snow:'❄️',jungle:'🌴',cave:'🦇',islands:'🏝️',volcano:'🌋',sky:'☁️',beach:'🏖️',candy:'🍭',space:'🛰️',graveyard:'🪦',halloween:'🎃'})[r.theme]||'🎮';
          const cnt = '👥 '+(r.players||1)+'/'+(r.max||2);
          const rb = API.btn(
            tEmoji+' <b>'+esc(r.name||'Játékos')+'</b> <span class="muted">#'+esc(r.code)+' · '+cnt+'</span>',
            'btn--block', function(){
              call('setName', undefined, curName());
              call('join', undefined, r.code);
              render();
            });
          rb.style.textAlign='left';
          roomsSec.append(rb);
        });
      }
      p.append(roomsSec);

      // join by code
      const joinSec = E('div','section');
      joinSec.append(E('h3', null, '<span data-t="Csatlakozás kóddal">Csatlakozás kóddal</span>'));
      const joinRow = E('div','row');
      joinRow.style.alignItems = 'flex-end';
      const codeField = API.field(T('KÓD'));
      codeField.style.flex = '1';
      codeField.input.dataset.k = 'code';
      codeField.input.placeholder = T('Szobakód');
      codeField.input.maxLength = 8;
      codeField.input.autocapitalize = 'characters';
      codeField.input.style.textTransform = 'uppercase';
      const joinBtn = API.btn('<span data-t="➜ Belépés">➜ Belépés</span>', 'btn--gold', function(){
        const code = (codeField.input.value || '').trim().toUpperCase();
        if (!code) { codeField.input.focus(); return; }
        call('setName', undefined, curName());
        call('join', undefined, code);
        render();
      });
      codeField.input.addEventListener('keydown', function(e){ if (e.key === 'Enter') joinBtn.click(); });
      joinRow.append(codeField, joinBtn);
      joinSec.append(joinRow);
      p.append(joinSec);

      view.append(p);
    }

    /* ---------------------------------------------------- STATE B: in the room */
    function renderRoom(){
      const isHost = !!call('isHost', false);
      const myId   = selfId();
      const code   = call('code', '') || '';
      const cfg    = (net() && net().roomConfig) || {};

      // --- room code + copy ---
      const top = API.panel();
      const codeSec = E('div','section');
      codeSec.append(E('h3', null, '<span data-t="Szobakód">Szobakód</span>'));
      const codeRow = E('div','row row--between');
      const codeBig = E('div', null,
        '<span style="font-size:30px;font-weight:800;letter-spacing:4px;color:var(--gold);font-variant-numeric:tabular-nums">'+esc(code)+'</span>');
      const copyBtn = API.btn('<span data-t="📋 Másolás">📋 Másolás</span>', 'btn--ghost btn--sm', function(){
        copyText(code, copyBtn);
      });
      // native share (mobile share sheet) with clipboard fallback — mirrors the
      // duel-share in menu-challenge.js so the code can be shared from a phone.
      const shareBtn = API.btn('📤 <span data-t="Megosztás">Megosztás</span>', 'btn--ghost btn--sm', function(){
        shareText(code, shareBtn);
      });
      const codeBtns = E('div','row'); codeBtns.style.gap = 'var(--s3)';
      codeBtns.append(copyBtn, shareBtn);
      codeRow.append(codeBig, codeBtns);
      codeSec.append(codeRow);

      // connection status — clear, explicit states from CA.Net.status():
      //   connecting -> waiting (host, no opponent) -> connected ; or failed / closed.
      const st = call('status', call('isConnected', true) ? 'connected' : 'connecting');
      const cStat = E('div', null);
      cStat.style.fontSize = '14px';
      cStat.style.marginTop = 'var(--s1)';
      let dot, label, sub = '';
      if (st === 'connected'){
        dot = '🟢'; label = '<span data-t="Kapcsolódva">Kapcsolódva</span>';
        cStat.style.color = 'var(--green)';
      } else if (st === 'reconnecting'){
        // transient drop inside the grace window — don't alarm the player; we are
        // waiting for the link to heal before declaring the opponent gone.
        dot = '🟠'; label = '<span data-t="Újrakapcsolódás…">Újrakapcsolódás…</span>';
        sub = '<span data-t="Rövid fennakadás — próbálunk újrakapcsolódni.">Rövid fennakadás — próbálunk újrakapcsolódni.</span>';
        cStat.style.color = 'var(--gold)';
      } else if (st === 'waiting'){
        dot = '⏳'; label = '<span data-t="Várakozás az ellenfélre…">Várakozás az ellenfélre…</span>';
        sub = '<span data-t="Oszd meg a kódot az ellenfeleddel.">Oszd meg a kódot az ellenfeleddel.</span>';
        cStat.style.color = 'var(--gold)';
      } else if (st === 'failed'){
        dot = '🔴'; label = '<b><span data-t="Nem sikerült csatlakozni">Nem sikerült csatlakozni</span></b>';
        sub = '<span data-t="Most egy hálózaton (ugyanaz a wifi/router) vagy két böngészőfülön a legmegbízhatóbb. A nyílt interneten a kapcsolat a hálózattól függ (TURN-szerver kellhet).">Most egy hálózaton (ugyanaz a wifi/router) vagy két böngészőfülön a legmegbízhatóbb. A nyílt interneten a kapcsolat a hálózattól függ (TURN-szerver kellhet).</span>';
        cStat.style.color = 'var(--red, #e04545)';
      } else if (st === 'closed'){
        dot = '🔴'; label = '<span data-t="Az ellenfél kilépett.">Az ellenfél kilépett.</span>';
        cStat.style.color = 'var(--red, #e04545)';
      } else { // connecting / idle
        dot = '🟡'; label = '<span data-t="Csatlakozás folyamatban…">Csatlakozás folyamatban…</span>';
        cStat.style.color = 'var(--gold)';
      }
      cStat.innerHTML = dot + ' ' + label;
      codeSec.append(cStat);
      if (sub){
        const subEl = E('div','muted'); subEl.style.fontSize = '12px'; subEl.style.marginTop = '2px';
        subEl.innerHTML = sub; codeSec.append(subEl);
      }
      // on a hard failure, offer Retry (host re-hosts / client re-joins) + Leave.
      if (st === 'failed'){
        const retryRow = E('div','row');
        retryRow.style.marginTop = 'var(--s1)';
        const retryBtn = API.btn('<span data-t="🔄 Újra">🔄 Újra</span>', 'btn--gold btn--sm', function(){
          const wasHost = !!call('isHost', false);
          const c = call('code', '') || '';
          call('leave', undefined);
          if (wasHost) call('host', undefined, { code:c });
          else if (c) call('join', undefined, c);
          render();
        });
        retryRow.append(retryBtn);
        codeSec.append(retryRow);
      }
      top.append(codeSec);
      view.append(top);

      // --- player list ---
      const pl = API.panel();
      const plSec = E('div','section');
      // header shows the live count "X / max" (Jani: "írja a lobbyban hány player van, max 4")
      const pcnt = call('playerCount', { players:0, max:2 }) || { players:0, max:2 };
      const spById = (sid)=>{ try{ return CA.Species && CA.Species[sid]; }catch(e){ return null; } };
      plSec.append(E('h3', null, '<span data-t="Játékosok">Játékosok</span> <span class="muted">'+pcnt.players+' / '+pcnt.max+'</span>'));
      const players = call('players', []) || [];
      players.forEach(function(p){
        const card = API.card();
        const row = E('div','row row--between');
        const sp = !p.spectator && spById(p.species);
        const spEmoji = sp ? (sp.emoji + ' ') : '';
        const who = (p.isHost ? '👑 ' : '') + spEmoji + esc(p.name || '?') +
          (p.id === myId ? ' <span class="muted" data-t="(te)">(te)</span>' : '');
        row.append(E('div', null, '<span>'+who+'</span>'));
        let badge;
        if (p.spectator) badge = '<span class="muted" data-t="Néző">Néző</span>';
        else if (p.ready) badge = '<span style="color:var(--green)">✓ <span data-t="Készen áll">Készen áll</span></span>';
        else badge = '<span class="muted" data-t="Vár">Vár</span>';
        row.append(E('div', null, badge));
        card.append(row);
        plSec.append(card);
      });
      pl.append(plSec);
      view.append(pl);

      // --- SPECIES picker: every player chooses the animal they'll play as ---
      const spPanel = API.panel();
      const spSec = E('div','section');
      spSec.append(E('h3', null, '🐾 <span data-t="Válassz fajt">Válassz fajt</span>'));
      const myP = players.find(function(p){ return p.id === myId; });
      const mySp = (myP && myP.species) || call('mySpecies', null);
      const spList = (CA.Species && CA.Species.list) ? (function(){ try{ return CA.Species.list(); }catch(e){ return []; } })() : [];
      if (myP && myP.spectator){
        spSec.append(E('div','card','<span class="muted" data-t="Nézőként csatlakoztál (a szoba megtelt).">Nézőként csatlakoztál (a szoba megtelt).</span>'));
      } else {
        const spChips = E('div','opt-grid');
        spList.forEach(function(s){
          const c = API.chip((s.emoji?s.emoji+' ':'')+esc(s.name||s.id), s.id===mySp, function(){
            call('setSpecies', undefined, s.id); render();
          });
          c.classList.add('chip--grid');
          spChips.append(c);
        });
        spSec.append(spChips);
      }
      spPanel.append(spSec);
      view.append(spPanel);

      // --- config: host edits, others read-only ---
      const cfgPanel = API.panel();

      // MAX PLAYERS (2–4) — host only (Jani: "lehessen meghatározni 2-4 közt")
      if (isHost){
        const mpSec = E('div','section');
        mpSec.append(E('h3', null, '👥 <span data-t="Játékosok száma">Játékosok száma</span>'));
        const mpChips = E('div','chips');
        const curMax = call('maxPlayers', 2) || 2;
        [2,3,4].forEach(function(n){
          const c = API.chip(String(n), n===curMax, function(){ call('setMaxPlayers', undefined, n); render(); });
          mpChips.append(c);
        });
        mpSec.append(mpChips);
        cfgPanel.append(mpSec);
      }

      // MAP picker
      const mapSec = E('div','section');
      mapSec.append(E('h3', null, '<span data-t="Pálya">Pálya</span>'));
      const maps = (CA.Maps && CA.Maps.list) ? safeMapList() : ['grass'];
      const curTheme = cfg.theme || maps[0];
      if (isHost){
        const mapChips = E('div','opt-grid');
        maps.forEach(function(id){
          const m = (CA.Maps && CA.Maps.get) ? safeMapGet(id) : {};
          const label = (m.emoji ? m.emoji + ' ' : '') + esc(m.name || id);
          const c = API.chip(label, id === curTheme, function(){
            call('setRoomConfig', undefined, { theme:id });
            render();
          });
          c.classList.add('chip--grid');
          mapChips.append(c);
        });
        mapSec.append(mapChips);
      } else {
        const m = (CA.Maps && CA.Maps.get) ? safeMapGet(curTheme) : {};
        mapSec.append(E('div','card', (m.emoji ? m.emoji + ' ' : '') + esc(m.name || curTheme)));
      }
      cfgPanel.append(mapSec);

      // MODE picker
      const modeSec = E('div','section');
      modeSec.append(E('h3', null, '<span data-t="Mód">Mód</span>'));
      const modes = [['classic','Klasszikus'],['ffa','FFA'],['aivsai','AI']];
      const curMode = cfg.gameMode || 'classic';
      if (isHost){
        const modeChips = E('div','chips');
        modes.forEach(function(pair){
          const id = pair[0], label = pair[1];
          const c = API.chip('<span data-t="'+esc(label)+'">'+esc(label)+'</span>', id === curMode, function(){
            call('setRoomConfig', undefined, { gameMode:id });
            render();
          });
          modeChips.append(c);
        });
        modeSec.append(modeChips);
      } else {
        const lbl = (modes.find(function(p){ return p[0]===curMode; }) || [curMode, curMode])[1];
        modeSec.append(E('div','card', '<span class="muted" data-t="Beállítások a hosttól">Beállítások a hosttól</span>: <b><span data-t="'+esc(lbl)+'">'+esc(lbl)+'</span></b>'));
      }
      cfgPanel.append(modeSec);
      view.append(cfgPanel);

      // --- ready toggle + start ---
      const ctl = API.panel();
      const ctlSec = E('div','section');

      const me = players.find(function(p){ return p.id === myId; });
      const readyRow = E('div','row row--between card');
      readyRow.append(E('div', null, '<span data-t="Készen állok">Készen állok</span>'));
      const sw = E('label','switch');
      const swIn = E('input'); swIn.type = 'checkbox'; swIn.checked = !!(me && me.ready);
      swIn.onchange = function(){ call('toggleReady', undefined); render(); };
      sw.append(swIn, E('span','track'));
      readyRow.append(sw);
      ctlSec.append(readyRow);

      if (isHost){
        const canStart = !!call('canStart', false);
        const startBtn = API.btn('<span data-t="▶ Indítás">▶ Indítás</span>', 'btn--gold btn--lg btn--block', function(){
          if (call('canStart', false)) call('start', undefined);
        });
        if (!canStart) startBtn.disabled = true;
        ctlSec.append(startBtn);
        if (!canStart) ctlSec.append(E('div','muted','<span data-t="Várj a többi játékosra…">Várj a többi játékosra…</span>'));
      } else {
        ctlSec.append(E('div','muted','<span data-t="Csak a host indíthat">Csak a host indíthat</span>'));
      }
      ctl.append(ctlSec);
      view.append(ctl);

      // --- chat ---
      const chatPanel = API.panel();
      const chatSec = E('div','section');
      chatSec.append(E('h3', null, '<span data-t="Beszélgetés">Beszélgetés</span>'));

      const log = E('div','card');
      log.style.height = '160px';
      log.style.overflowY = 'auto';
      log.style.display = 'flex';
      log.style.flexDirection = 'column';
      log.style.gap = 'var(--s1)';
      chat.forEach(function(m){
        const line = E('div', null,
          '<b style="color:'+(m.self?'var(--gold)':'var(--accent)')+'">'+esc(m.name||'?')+':</b> '+esc(m.text||''));
        line.style.fontSize = '14px';
        log.append(line);
      });
      chatSec.append(log);
      // auto-scroll to bottom after mount
      setTimeout(function(){ log.scrollTop = log.scrollHeight; }, 0);

      const chatRow = E('div','row');
      chatRow.style.alignItems = 'flex-end';
      const chatField = API.field('');
      chatField.style.flex = '1';
      chatField.input.dataset.k = 'chat';
      chatField.input.placeholder = T('Írj üzenetet…');
      chatField.input.maxLength = 200;
      const sendBtn = API.btn('<span data-t="➤ Küld">➤ Küld</span>', 'btn--green', function(){
        const txt = (chatField.input.value || '').trim();
        if (!txt) { chatField.input.focus(); return; }
        call('sendChat', undefined, txt);
        chatField.input.value = '';
        chatField.input.focus();
      });
      chatField.input.addEventListener('keydown', function(e){ if (e.key === 'Enter') sendBtn.click(); });
      chatRow.append(chatField, sendBtn);
      chatSec.append(chatRow);
      chatPanel.append(chatSec);
      view.append(chatPanel);

      // --- leave ---
      const leaveBtn = API.btn('<span data-t="🚪 Kilépés">🚪 Kilépés</span>', 'btn--red btn--block', function(){
        call('leave', undefined);
        chat = [];
        render();
      });
      leaveBtn.style.maxWidth = '320px';
      leaveBtn.style.margin = 'var(--s2) auto 0';
      view.append(leaveBtn);
    }

    /* ------------------------------------------ STATE C: in a FAKE "open room" */
    function renderFakeRoom(){
      const s = fakeRoom.srv;
      const joined = (fakeRoom.phase === 'joined');

      // code + status
      const top = API.panel();
      const cs = E('div','section');

      // TRANSPARENCY BADGE — a fake "open room" is actually a LOCAL AI match, NOT
      // a real online opponent. Make that unmistakable so we never look like we
      // faked a real match (reputation / fair-play risk at launch).
      const fakeBadge = E('div','card');
      fakeBadge.style.cssText = 'border-left:3px solid var(--gold);margin-bottom:var(--s2)';
      fakeBadge.innerHTML =
        '<div><b><span data-t="🤖 Gyakorló bot">🤖 Gyakorló bot</span></b> '
        + '<span class="muted" style="font-size:12px">· <span data-t="Demo">Demo</span></span></div>'
        + '<div class="muted" style="font-size:12px;margin-top:2px">'
        + '<span data-t="Ez egy gyakorló meccs a gép ellen — nem valódi online ellenfél.">Ez egy gyakorló meccs a gép ellen — nem valódi online ellenfél.</span></div>';
      cs.append(fakeBadge);

      cs.append(E('h3', null, '<span data-t="Szobakód">Szobakód</span>'));
      cs.append(E('div', null,
        '<span style="font-size:30px;font-weight:800;letter-spacing:4px;color:var(--gold)">'+esc(s.code)+'</span>'));
      const stat = E('div', null); stat.style.fontSize = '14px'; stat.style.marginTop = 'var(--s1)';
      if (joined){ stat.style.color = 'var(--green)'; stat.innerHTML = '🟢 <span data-t="Kapcsolódva">Kapcsolódva</span>'; }
      else { stat.style.color = 'var(--gold)'; stat.innerHTML = '🟡 <span data-t="Csatlakozás folyamatban…">Csatlakozás folyamatban…</span>'; }
      cs.append(stat);
      top.append(cs); view.append(top);

      // players (bot host + you)
      const pl = API.panel(); const ps = E('div','section');
      ps.append(E('h3', null, '<span data-t="Játékosok">Játékosok</span>'));
      [ { name:s.host, host:true, ready:true },
        { name:fakeRoom.myName, me:true, ready:joined } ].forEach(function(pp){
        const card = API.card(); const r = E('div','row row--between');
        r.append(E('div', null, '<span>'+(pp.host?'👑 ':'')+esc(pp.name)+
          (pp.me?' <span class="muted" data-t="(te)">(te)</span>':'')+'</span>'));
        r.append(E('div', null, pp.ready
          ? '<span style="color:var(--green)">✓ <span data-t="Készen áll">Készen áll</span></span>'
          : '<span class="muted" data-t="Vár">Vár</span>'));
        card.append(r); ps.append(card);
      });
      pl.append(ps); view.append(pl);

      // map (read-only)
      const cp = API.panel(); const ms = E('div','section');
      ms.append(E('h3', null, '<span data-t="Pálya">Pálya</span>'));
      const m = safeMapGet(s.theme);
      ms.append(E('div','card', (m.emoji ? m.emoji+' ' : '')+esc(m.name||s.theme)));
      cp.append(ms); view.append(cp);

      // start
      const ctl = API.panel(); const ctlSec = E('div','section');
      const startBtn = API.btn('<span data-t="▶ Indítás">▶ Indítás</span>', 'btn--gold btn--lg btn--block',
        function(){ startFakeGame(s, fakeRoom.myName); });
      if (!joined) startBtn.disabled = true;
      ctlSec.append(startBtn);
      if (!joined) ctlSec.append(E('div','muted','<span data-t="Csatlakozás folyamatban…">Csatlakozás folyamatban…</span>'));
      ctl.append(ctlSec); view.append(ctl);

      // chat (bot lines + you can type; the bot acks once)
      const chp = API.panel(); const chSec = E('div','section');
      chSec.append(E('h3', null, '<span data-t="Beszélgetés">Beszélgetés</span>'));
      const log = E('div','card');
      log.style.height = '140px'; log.style.overflowY = 'auto';
      log.style.display = 'flex'; log.style.flexDirection = 'column'; log.style.gap = 'var(--s1)';
      fakeChat.forEach(function(mm){
        const line = E('div', null,
          '<b style="color:'+(mm.self?'var(--gold)':'var(--accent)')+'">'+esc(mm.name||'?')+':</b> '+esc(mm.text||''));
        line.style.fontSize = '14px'; log.append(line);
      });
      chSec.append(log);
      setTimeout(function(){ log.scrollTop = log.scrollHeight; }, 0);
      const crow = E('div','row'); crow.style.alignItems = 'flex-end';
      const cf = API.field(''); cf.style.flex = '1'; cf.input.dataset.k = 'fchat';
      cf.input.placeholder = T('Írj üzenetet…'); cf.input.maxLength = 200;
      const sb = API.btn('<span data-t="➤ Küld">➤ Küld</span>', 'btn--green', function(){
        const txt = (cf.input.value || '').trim(); if (!txt){ cf.input.focus(); return; }
        fakeChat.push({ name:fakeRoom.myName, text:txt, self:true }); cf.input.value = '';
        fakeAfter(700, function(){ if (!fakeRoom) return; fakeChat.push({ name:s.host, text:'👍' }); render(); });
        render();
      });
      cf.input.addEventListener('keydown', function(e){ if (e.key === 'Enter') sb.click(); });
      crow.append(cf, sb); chSec.append(crow); chp.append(chSec); view.append(chp);

      // leave
      const leaveBtn = API.btn('<span data-t="🚪 Kilépés">🚪 Kilépés</span>', 'btn--red btn--block',
        function(){ clearFakeTimers(); fakeRoom = null; fakeChat = []; render(); });
      leaveBtn.style.maxWidth = '320px'; leaveBtn.style.margin = 'var(--s2) auto 0';
      view.append(leaveBtn);
    }

    /* ----------------------------------------------------------- map helpers */
    function safeMapList(){
      try{ const l = CA.Maps.list(); return (Array.isArray(l) && l.length) ? l : ['grass']; }
      catch(e){ return ['grass']; }
    }
    function safeMapGet(id){
      try{ return CA.Maps.get(id) || {}; }catch(e){ return {}; }
    }

    /* ----------------------------------------------------------- copy helper */
    function copyText(text, btn){
      const done = function(){
        const old = btn.innerHTML;
        btn.innerHTML = '<span data-t="Másolva!">Másolva!</span>';
        API.applyI18n(btn);
        setTimeout(function(){ btn.innerHTML = old; API.applyI18n(btn); }, 1200);
      };
      try{
        if (navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(text).then(done, function(){ legacyCopy(text); done(); });
        } else { legacyCopy(text); done(); }
      }catch(e){ try{ legacyCopy(text); done(); }catch(_){} }
    }
    /* native share helper — opens the OS share sheet (navigator.share) with a
     * friendly message + the room code; on platforms without it (desktop) we
     * fall back to copying. Mirrors doShare() in menu-challenge.js. */
    function shareText(code, btn){
      const msg = T('Csatlakozz a szobámhoz: ') + code;
      try{
        if (navigator.share){
          navigator.share({ title:'Animal Battle Ground', text:msg }).catch(function(){});
          return;
        }
      }catch(e){}
      copyText(code, btn);   // fallback: copy the code
    }
    /* "challenge a friend" duel invite — generate a self-contained duel deep-link
     * via CA.Challenge.createDuel() and share it. Prefers CA.Challenge.shareUrl()
     * (navigator.share → live-portal invite → clipboard+toast, all guarded inside
     * challenge.js); falls back to a local navigator.share/copy if that helper is
     * absent. Brief on-button "Link kimásolva!" feedback. Never throws. */
    function shareDuelInvite(btn){
      const C = (window.CA && CA.Challenge) ? CA.Challenge : null;
      if (!C || typeof C.createDuel !== 'function') return;
      let res = null;
      try{ res = C.createDuel(); }catch(_){ res = null; }
      const url = (res && (res.url || res.code)) || '';
      if (!url) return;
      const msg = T('Hívd ki egy haverod erre a pályára! ');
      // preferred: the shared, fully-guarded share helper in challenge.js.
      if (typeof C.shareUrl === 'function'){
        let shared = false;
        try{ shared = !!C.shareUrl(url, { title:'Animal Battle Ground', text: msg }); }catch(_){ shared = false; }
        if (shared){ flashCopied(btn); return; }
      }
      // fallback: local navigator.share, then clipboard.
      try{
        if (navigator.share){ navigator.share({ title:'Animal Battle Ground', text: msg, url: url }).catch(function(){}); return; }
      }catch(_){}
      copyDuelUrl(url, btn);
    }
    function copyDuelUrl(url, btn){
      const done = function(){ flashCopied(btn); };
      try{
        if (navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(url).then(done, function(){ legacyCopy(url); done(); });
          return;
        }
      }catch(_){}
      try{ legacyCopy(url); done(); }catch(_){}
    }
    // brief "Link kimásolva!" label on the share button, then restore it.
    function flashCopied(btn){
      try{
        if (!btn) return;
        const old = btn.innerHTML;
        btn.innerHTML = '<span data-t="Link kimásolva!">Link kimásolva!</span>';
        API.applyI18n(btn);
        setTimeout(function(){ btn.innerHTML = old; API.applyI18n(btn); }, 1400);
      }catch(_){}
    }
    function legacyCopy(text){
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); }catch(_){}
      document.body.removeChild(ta);
    }

    /* --------------------------------------------------- listeners / interval */
    function pushChat(m){
      chat.push({ name:m.name, text:m.text, self:!!m.self });
      if (chat.length > CHAT_CAP) chat.splice(0, chat.length - CHAT_CAP);
    }

    function attach(){
      if (bound) return;
      bound = true;
      const N = net();

      // chat: append to buffer, then re-render
      evHandlers['net:chat'] = function(m){ if (m) pushChat(m); render(); };
      // room config changed by host
      evHandlers['net:roomcfg'] = function(){ render(); };
      // matchmaking status (mirror of the findMatch callback, in case)
      evHandlers['net:matchmaking'] = function(status){
        if (!status) return;
        if (status.state === 'searching' || status.state === 'waiting'){ mmState = status.state; }
        else if (status.state === 'matched'){ stopMmTimeout(); mmState = 'searching'; }
        else { stopMmTimeout(); mmState = null; }   // cancelled / error
        render();
      };
      // playerJoined fires on CA.events per the contract; subscribe there too
      evHandlers['playerJoined'] = function(){ render(); };
      // connection status changes (connecting/waiting/connected/failed/closed)
      evHandlers['net:status'] = function(){ render(); };

      if (CA.events && CA.events.on){
        Object.keys(evHandlers).forEach(function(ev){ CA.events.on(ev, evHandlers[ev]); });
      }

      // CA.Net's own bus carries roster / lifecycle events
      if (N && N.on){
        ['roster','playerJoined','playerLeft','hosted','joined','left','connected',
         'roomConfig','start','rematch','status','connectFailed','opponentLeft',
         'reconnecting']
          .forEach(function(ev){
            netHandlers[ev] = function(){ render(); };
            try{ N.on(ev, netHandlers[ev]); }catch(_){}
          });
      }

      // light interval: cheap safety net for state we might miss (connection
      // handshake, ready flags arriving via roster, mm timeouts). Re-render only.
      if (!pollTimer) pollTimer = setInterval(function(){ render(); }, 1000);
    }

    function detach(){
      if (!bound) return;
      bound = false;
      const N = net();
      if (CA.events && CA.events.off){
        Object.keys(evHandlers).forEach(function(ev){ CA.events.off(ev, evHandlers[ev]); });
      }
      if (N && N.off){
        Object.keys(netHandlers).forEach(function(ev){ try{ N.off(ev, netHandlers[ev]); }catch(_){} });
      }
      if (pollTimer){ clearInterval(pollTimer); pollTimer = null; }
      stopMmTimeout();
      clearFakeTimers();
    }

    /* When the screen hides, the framework stops calling onShow. We can't hook a
     * direct "hide" callback, so we detach via a screen-visibility watcher tied
     * to the interval: onShow re-attaches; a MutationObserver on the .active
     * class tears the listeners + interval down when we leave the screen. */
    let mo = null;
    function watchVisibility(){
      if (mo) return;
      try{
        mo = new MutationObserver(function(){
          if (!screen.classList.contains('active')){
            // Screen hidden (onHide-equivalent): treat leaving as Leave so a
            // created/joined room is closed, not orphaned. This catches EVERY
            // navigation path (header Back, ESC -> CA.Menu.back(), or any other
            // setScreen away from 'lobby'). leaveRoom() is a guarded no-op offline.
            leaveRoom();
            detach();
          } else {
            attach();
          }
        });
        mo.observe(screen, { attributes:true, attributeFilter:['class'] });
      }catch(_){ /* MutationObserver unavailable -> interval still self-renders */ }
    }

    return {
      el: screen,
      onShow(){
        // (re)build the current view and (re)attach listeners every time shown
        render();
        attach();
        watchVisibility();
        // wrap the header Back button so it closes any active room (Back == Leave)
        hookBackButton();
      },
    };
  }

  if (window.CA && CA.Menu && CA.Menu.register) CA.Menu.register('lobby', build);
})();
