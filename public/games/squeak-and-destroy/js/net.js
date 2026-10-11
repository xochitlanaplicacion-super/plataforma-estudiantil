/* ============================================================================
 * CUTE ANIMALS — net.js  ::  CA.Net — online multiplayer + LOBBY  (Agent Net)
 * ----------------------------------------------------------------------------
 * Online play with a simple LOBBY (host/join by code), built so it can later
 * plug into a real server / Steam. THIS FILE owns the netcode + transport.
 * The lobby SCREEN lives in screens.js ('lobby') and is driven by CA.Net.
 *
 * Design goal: a TRANSPORT-AGNOSTIC seam. Define CA.Net.transport with a small
 * interface (connect/host/join/send/onMessage/close) and provide at least one
 * working implementation for a web prototype (e.g. WebRTC DataChannel via a
 * tiny manual/QR signaling, or a WebSocket room server stub). Keep the game
 * loop authoritative on the HOST; clients send inputs, host broadcasts state
 * snapshots (units/projectiles/turn). Turn-based ⇒ low bandwidth, forgiving.
 *
 * IMPLEMENT on CA.Net (suggested):
 *   init()
 *   host(opts)->roomCode         // become authoritative host, open a room
 *   join(roomCode)               // connect to a host
 *   leave()
 *   isOnline()  isHost()  players()  state()  // for the lobby screen
 *   sendInput(input)             // client -> host (move/aim/fire/weapon)
 *   // host broadcasts CA.state deltas; clients apply them (read-only sim)
 *   on(event, fn) / emit         // 'playerJoined','playerLeft','stateSync','start'
 *
 * INTEGRATION: when an online match starts, call CA.newGame({gameMode:'online',
 *   teams:[...] }) on all peers with the SAME seed (host picks seed + sends it).
 *   Clients must not run AI/local turn logic for remote teams — gate via
 *   CA.Net.isHost()/ownership. Add a 'online' mode entry if helpful (you may
 *   edit modes? NO — modes.js is owned elsewhere; instead drive via newGame opts
 *   + a CA.Net.isMyTurn() guard the lobby/host enforces).
 *
 * STEAM/HOOK notes (document inline): for a Steam build the transport swaps to
 * Steam networking (relay/lobby) behind the same interface; web prototype proves
 * the hook. Keep everything defensive; never break offline single-player.
 * ==========================================================================*/

/* ============================================================================
 * WHAT WORKS IN THIS WEB PROTOTYPE (honest summary — read me):
 *
 *  • The DEFAULT transport is BroadcastChannel (with a localStorage fallback).
 *    It connects multiple BROWSER TABS / WINDOWS ON THE SAME MACHINE by a room
 *    code. This is fully demonstrable offline: open the game in two tabs, Host
 *    in one, Join with the code in the other, Ready up, Start — the host runs
 *    the real game and the client renders the live snapshot read-only. This
 *    proves the entire host-authoritative netcode + lobby + ownership seam.
 *
 *  • A WebRTC DataChannel transport (manual copy/paste signaling) is ALSO
 *    provided (CA.Net.transports.webrtc). It works peer-to-peer across the real
 *    internet WITHOUT our own server for the data path, BUT the offer/answer
 *    SDP must be exchanged out-of-band (copy/paste in the lobby), and reliable
 *    NAT traversal generally needs a STUN/TURN server. So WebRTC here is a
 *    "works-on-the-internet-with-manual-signaling" demo, not a one-click join.
 *
 *  • For a production one-click internet experience you still need EITHER a tiny
 *    signaling/relay WebSocket server (to swap SDP automatically) OR — for the
 *    Steam build — Steam's lobby + relay, which slots in behind this exact
 *    transport interface (see CA.Net.transports.steam stub at the bottom).
 *
 *  Single-player is 100% unaffected: CA.Net.isOnline() is false until you host
 *  or join, and none of this code runs in the offline path.
 * ==========================================================================*/
(function(){
  'use strict';

  // EN translations for matchmaking + connection error messages (shown to player).
  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Matchmaking nem elérhető.':'Matchmaking is not available.',
    'Ismeretlen matchmaking válasz.':'Unknown matchmaking response.',
    'Hálózati hiba a kereséskor.':'Network error while searching.',
    'Nem sikerült csatlakozni (időtúllépés). Internetes játékhoz TURN-szerver kellhet — egy hálózaton (vagy két fülön) megbízhatóbb.':
      'Could not connect (timeout). Internet play may need a TURN server — same network (or two tabs) is more reliable.',
    'A kapcsolat megszakadt.':'The connection was lost.',
    'Az ellenfél kilépett.':'The opponent left.',
    'Újrakapcsolódás…':'Reconnecting…',
    '⚠ Nincs adat a hosttól — a kapcsolat megszakadhatott.':'⚠ No data from the host — the connection may have dropped.'
  });

  /* ---- tiny event bus (own, so we never clash with CA.events) ---- */
  function Emitter(){ this._h = {}; }
  Emitter.prototype.on = function(ev, fn){ (this._h[ev]=this._h[ev]||[]).push(fn); return fn; };
  Emitter.prototype.off= function(ev, fn){ const a=this._h[ev]; if(a){ const i=a.indexOf(fn); if(i>=0)a.splice(i,1);} };
  Emitter.prototype.emit=function(ev){ const a=this._h[ev]; if(!a) return; const args=[].slice.call(arguments,1);
    for(const fn of a.slice()){ try{ fn.apply(null,args); }catch(e){} } };

  /* ============================================================================
   * TRANSPORT INTERFACE (the swappable seam)
   * ----------------------------------------------------------------------------
   * A transport is an object with:
   *   open()                         -> Promise|void  (one-time init)
   *   host(code, handlers)           -> become host of `code`
   *   join(code, handlers)           -> connect to host of `code`
   *   send(msg)                      -> deliver msg to the OTHER side(s)
   *   onMessage(cb)                  -> cb(msg) for every inbound message
   *   close()                        -> tear down
   *   caps()                         -> { name, p2p, internet, needsSignaling }
   *
   * Messages are plain JSON objects with a `t` (type) field. The CA.Net layer
   * on top is transport-agnostic: it only calls send()/onMessage(). Swapping to
   * Steam = swapping this object; nothing above changes.
   * ==========================================================================*/

  /* ---------------------------------------------------------------------------
   * (1) BroadcastChannel transport — cross-tab on one machine (DEFAULT, works).
   * Every peer joins a channel named by the room code. We tag each message with
   * a per-peer id so a peer ignores its own echoes. This faithfully emulates a
   * star topology (host + clients) with near-zero latency, perfect for a
   * local demo of the full online flow.
   * ------------------------------------------------------------------------- */
  function BroadcastTransport(){
    this._ch = null; this._cb = null; this._code = null;
    this._lsKey = null; this._lsHandler = null;
    this.peerId = 'p' + Math.random().toString(36).slice(2,9);
  }
  BroadcastTransport.prototype.caps = function(){
    return { name:'BroadcastChannel (egy gépen, több fül)', p2p:true, internet:false, needsSignaling:false };
  };
  BroadcastTransport.prototype.open = function(){ return true; };
  BroadcastTransport.prototype._bind = function(code){
    this._code = code;
    const chanName = 'ca_room_' + code;
    if (typeof BroadcastChannel !== 'undefined'){
      this._ch = new BroadcastChannel(chanName);
      this._ch.onmessage = (e)=>{
        const m = e.data;
        if (!m || m.__from === this.peerId) return; // ignore self
        if (this._cb) this._cb(m.payload);
      };
    } else {
      // localStorage fallback (older browsers / file://). 'storage' fires in
      // OTHER tabs only, which is exactly the cross-tab channel we want.
      this._lsKey = chanName;
      this._lsHandler = (e)=>{
        if (e.key !== this._lsKey || !e.newValue) return;
        let m; try{ m = JSON.parse(e.newValue); }catch(_){ return; }
        if (!m || m.__from === this.peerId) return;
        if (this._cb) this._cb(m.payload);
      };
      window.addEventListener('storage', this._lsHandler);
    }
  };
  BroadcastTransport.prototype.host = function(code, h){ this._bind(code); };
  BroadcastTransport.prototype.join = function(code, h){ this._bind(code); };
  BroadcastTransport.prototype.send = function(payload){
    const wrapped = { __from:this.peerId, payload };
    if (this._ch){ try{ this._ch.postMessage(wrapped); }catch(_){} }
    else if (this._lsKey){
      // bump a nonce so identical messages still trigger 'storage' in other tabs
      wrapped.__n = Math.random();
      try{ localStorage.setItem(this._lsKey, JSON.stringify(wrapped)); }catch(_){}
    }
  };
  BroadcastTransport.prototype.onMessage = function(cb){ this._cb = cb; };
  BroadcastTransport.prototype.close = function(){
    if (this._ch){ try{ this._ch.close(); }catch(_){} this._ch=null; }
    if (this._lsHandler){ window.removeEventListener('storage', this._lsHandler); this._lsHandler=null; }
    this._cb=null;
  };

  /* ---------------------------------------------------------------------------
   * (2) WebRTC DataChannel transport — peer-to-peer over the internet with
   * AUTOMATIC signaling via the PHP relay `signal.php` (one-click join).
   *
   * The data path stays pure P2P (RTCDataChannel); the relay is used ONLY to
   * swap the SDP offer/answer + trickle ICE candidates while connecting. Once
   * the channel is OPEN we stop polling for offer/answer (but keep accepting
   * late ICE for a short grace window), so the relay sees no game traffic.
   *
   * Signaling protocol (matches signal.php — a two-box mailbox per room):
   *   • POST {room, box:'host'|'guest', msg:{...}}   -> append to that box
   *   • POST {room, action:'reset'}                  -> clear the room
   *   • GET  signal.php?room&box&since=N             -> {msgs:[{seq,msg}], now}
   *   Convention: each peer POSTs into the OTHER peer's box and GET-polls its
   *   OWN box.  HOST owns box='host', GUEST owns box='guest'.
   *
   * Flow (fully automatic — the user only shares a 4-char room CODE):
   *   HOST  : reset room -> createOffer -> POST offer to guest box -> poll host
   *           box for {answer} + {ice}; trickle our ICE -> guest box.
   *   GUEST : poll guest box for {offer} -> createAnswer -> POST answer to host
   *           box -> poll guest box for {ice}; trickle our ICE -> host box.
   *
   * Limits (be honest): a public STUN server handles typical home NATs, but
   * STRICT / SYMMETRIC NATs need a TURN relay (out of scope here — add a TURN
   * entry to iceServers if you have one). Needs a real 2-peer test to confirm
   * traversal on a given network pair.  Manual copy/paste fallback (acceptOffer
   * /acceptAnswer + _onLocalDesc) is kept but is NO LONGER required.
   * ------------------------------------------------------------------------- */
  const SIGNAL_URL  = (CA.api ? CA.api('signal.php') : 'signal.php');     // native build -> live origin (else same-origin)
  const MATCH_URL   = (CA.api ? CA.api('matchmake.php') : 'matchmake.php'); // native build -> live origin (else same-origin)
  // NATIVE builds (Capacitor/file://) hit a CROSS-ORIGIN API_BASE; the SkyNet SSO
  // session cookie only rides with credentials:'include'. Web is same-origin →
  // 'same-origin' (no-op). Mirrors account.js _creds(). (#native-sso)
  const CREDS = function(){ return (CA.API_BASE && CA.API_BASE !== '') ? 'include' : 'same-origin'; };
  const MATCH_POLL_MS = 1500;        // matchmaking poll cadence (~1.5s)
  const POLL_MS     = 1000;          // ~1s poll cadence
  const ICE_GRACE_MS= 12000;         // keep accepting late ICE this long after connect
  // Hard ceiling on the WebRTC handshake. If the DataChannel is not OPEN within
  // this window we give up and report a clear failure instead of polling forever.
  // This is the single most important "honest gating" knob: on the open internet,
  // a strict/symmetric NAT pair with NO TURN relay simply cannot connect, so we
  // must surface a timeout rather than leave the lobby spinning indefinitely.
  // (See the TURN-SERVER HOOK in WebRTCTransport.open() — true internet play
  //  needs a TURN server we don't ship.)
  const CONNECT_TIMEOUT_MS = 25000;  // ~25s: enough for ICE on LAN/home NAT, then fail
  // Reconnect grace: after a GOOD connect, a transient ICE 'disconnected' or a
  // DataChannel close gets this long to recover before we declare the opponent
  // gone. Covers brief wifi roams / blips on same-LAN + P2P links. We do NOT
  // re-run the SDP handshake here (that needs the relay/signaling round-trip and
  // is out of scope) — we simply wait for ICE to heal itself, which it usually
  // does for short blips. Longer outages still end the match honestly.
  const RECONNECT_GRACE_MS = 8000;   // ~8s recovery window before "opponent left"

  function WebRTCTransport(){
    this.pc = null; this.dc = null; this._cb = null; this._isHost = false;
    this._onLocalDesc = null;        // legacy manual-signaling hook (optional)
    this._code = null;
    this._secret = null;             // per-match shared secret (P2-4); REQUIRED on every signal.php POST/GET
    this._myBox = null;              // the box THIS peer polls (host->'host', guest->'guest')
    this._otherBox = null;           // the box THIS peer POSTs into
    this._since = 0;                 // GET cursor: highest seq we've consumed from _myBox
    this._pollTimer = null;
    this._iceStopTimer = null;
    this._connectTimer = null;       // handshake watchdog (CONNECT_TIMEOUT_MS)
    this._connected = false;
    this._failed = false;            // terminal: handshake timed out or ICE failed
    this._haveRemote = false;        // remote description set yet? (gate queued ICE)
    this._pendingIce = [];           // ICE candidates that arrived before remote desc
    this._gotOffer = false;          // guest: already consumed an offer?
    this._gotAnswer = false;         // host: already consumed an answer?
  }
  WebRTCTransport.prototype.caps = function(){
    return { name:'WebRTC P2P (auto jelzés, internet)', p2p:true, internet:true, needsSignaling:false };
  };
  WebRTCTransport.prototype._supported = function(){
    return typeof RTCPeerConnection !== 'undefined';
  };
  WebRTCTransport.prototype.open = function(){
    if (!this._supported()) throw new Error('WebRTC not supported');
    this.pc = new RTCPeerConnection({ iceServers:[
      { urls:'stun:stun.l.google.com:19302' },
      { urls:'stun:global.stun.twilio.com:3478' },
      // ----------------------------------------------------------------------
      // FREE PUBLIC TURN RELAY (OpenRelay / Metered) — enables connections across
      // STRICT / SYMMETRIC NATs (two different machines/networks) WITHOUT us
      // hosting our own TURN server. STUN above covers typical home routers; this
      // relay covers the cases STUN can't (mobile carriers, double-NAT, AP
      // isolation). It's a FREE tier → best-effort (can rate-limit / be slow); a
      // dedicated TURN is still better for production, but this makes one-click
      // internet play actually work for most pairs instead of timing out.
      { urls:'turn:openrelay.metered.ca:80',                 username:'openrelayproject', credential:'openrelayproject' },
      { urls:'turn:openrelay.metered.ca:443',                username:'openrelayproject', credential:'openrelayproject' },
      { urls:'turn:openrelay.metered.ca:443?transport=tcp',  username:'openrelayproject', credential:'openrelayproject' },
      // ----------------------------------------------------------------------
      // CUSTOM TURN OVERRIDE — set CA.Net.turnConfig = { urls, username, credential }
      // BEFORE hosting/joining to add your OWN (more reliable) relay on top.
      ...(Net.turnConfig && Net.turnConfig.urls ? [{
        urls:       Net.turnConfig.urls,        // e.g. 'turn:your.turn.host:3478'
        username:   Net.turnConfig.username,    // TURN username
        credential: Net.turnConfig.credential,  // TURN password / credential
      }] : []),
      // Or hard-code one directly, e.g.:
      // { urls:'turn:your.turn.host:3478', username:'u', credential:'p' },
    ] });
    // Trickle: as soon as we learn a local ICE candidate, relay it to the peer.
    this.pc.onicecandidate = (e)=>{
      if (e.candidate){ this._post(this._otherBox, { kind:'ice', cand:e.candidate }); }
    };
    // ICE connection state: detect a FAILED negotiation early (typically a NAT we
    // can't traverse without TURN) and report it instead of waiting for the full
    // handshake timeout. 'disconnected' is transient (don't fail on it); 'failed'
    // is terminal for our purposes.
    this.pc.oniceconnectionstatechange = ()=>{
      if (!this.pc) return;
      const st = this.pc.iceConnectionState;
      if ((st === 'failed') && !this._connected){
        this._fail('ICE failed (NAT/TURN)');
      }
      // RECONNECT GRACE: 'disconnected' is TRANSIENT (a brief network blip, wifi
      // roam, tab throttle). After a good connect we do NOT declare the opponent
      // gone — we surface a 'reconnecting' hint and let the layer above start a
      // short grace timer; ICE often recovers on its own to 'connected'/'completed'.
      // (See CA.Net._wireTransportLifecycle for the grace window + give-up.)
      if (this._connected){
        if (st === 'disconnected'){ if (this.onReconnecting) this.onReconnecting(); }
        else if (st === 'connected' || st === 'completed'){ if (this.onReconnected) this.onReconnected(); }
      }
    };
    return true;
  };
  // Arm the handshake watchdog — call when host()/join() begins the negotiation.
  WebRTCTransport.prototype._armConnectTimeout = function(){
    if (this._connectTimer) return;
    this._connectTimer = setTimeout(()=>{
      this._connectTimer = null;
      if (!this._connected) this._fail('timeout');
    }, CONNECT_TIMEOUT_MS);
  };
  // Terminal failure: stop all timers/polling and notify the layer above ONCE.
  // Honest gating lives here — rather than hang, we tell the lobby it failed so it
  // can show "couldn't connect" (and hint that internet play may need a TURN relay).
  WebRTCTransport.prototype._fail = function(reason){
    if (this._failed || this._connected) return;   // never fail after a good connect
    this._failed = true;
    this._stopPoll();
    if (this._connectTimer){ clearTimeout(this._connectTimer); this._connectTimer = null; }
    if (this.onFailed) this.onFailed(reason || 'failed');
  };
  WebRTCTransport.prototype._wireChannel = function(dc){
    this.dc = dc;
    dc.onmessage = (e)=>{ let m; try{ m=JSON.parse(e.data); }catch(_){ return; } if(this._cb) this._cb(m); };
    dc.onopen = ()=>{
      this._connected = true;
      this._failed = false;
      // handshake succeeded -> cancel the watchdog timeout.
      if (this._connectTimer){ clearTimeout(this._connectTimer); this._connectTimer = null; }
      // Stop polling for offer/answer; keep accepting late ICE for a grace window
      // so candidates still in flight can complete/upgrade the connection.
      this._stopPoll();
      if (this._iceStopTimer) clearTimeout(this._iceStopTimer);
      this._iceStopTimer = setTimeout(()=>{ /* nothing more to do; ICE window closed */ }, ICE_GRACE_MS);
      if (this.onConnected) this.onConnected();
    };
    // Channel closed AFTER a successful connect => the peer dropped/left. (A close
    // before connect is just teardown of a failed attempt and is ignored here.)
    dc.onclose = ()=>{ if (this._connected && this.onClosed) this.onClosed(); };
  };

  /* ----- relay helpers (all defensive; never throw, tolerate transient errors) ----- */
  WebRTCTransport.prototype._post = function(box, msg){
    // secret REQUIRED: without it signal.php returns 403 (P2-4). We still send
    // the request (defensive); a 403 just yields null and the handshake stalls,
    // surfaced via the existing connect timeout rather than a crash.
    if (!this._code || !box || !this._secret) return Promise.resolve(null);
    return fetch(SIGNAL_URL, {
      method:'POST', credentials:CREDS(),
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ room:this._code, secret:this._secret, box:box, msg:msg }),
    }).then(r=>r.json()).catch(()=>null);
  };
  WebRTCTransport.prototype._reset = function(){
    if (!this._code || !this._secret) return Promise.resolve(null);
    return fetch(SIGNAL_URL, {
      method:'POST', credentials:CREDS(),
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ room:this._code, secret:this._secret, action:'reset' }),
    }).then(r=>r.json()).catch(()=>null);
  };
  // Poll OUR box and dispatch each new message. Keeps the since-cursor advancing.
  WebRTCTransport.prototype._pollOnce = function(){
    if (!this._code || !this._myBox || !this._secret) return Promise.resolve();
    const url = SIGNAL_URL + '?room=' + encodeURIComponent(this._code) +
                '&secret=' + encodeURIComponent(this._secret) +
                '&box=' + encodeURIComponent(this._myBox) + '&since=' + this._since;
    return fetch(url, { credentials:CREDS() }).then(r=>r.json()).then(j=>{
      if (!j || !j.ok || !Array.isArray(j.msgs)) return;
      for (const item of j.msgs){
        if (typeof item.seq === 'number' && item.seq > this._since) this._since = item.seq;
        this._handleSignal(item.msg);
      }
    }).catch(()=>{ /* transient error -> keep polling on next tick */ });
  };
  WebRTCTransport.prototype._startPoll = function(){
    if (this._pollTimer) return;
    const loop = ()=>{ this._pollOnce().finally(()=>{
      if (this._pollTimer != null) this._pollTimer = setTimeout(loop, POLL_MS);
    }); };
    this._pollTimer = setTimeout(loop, 0); // first poll immediately
  };
  WebRTCTransport.prototype._stopPoll = function(){
    if (this._pollTimer){ clearTimeout(this._pollTimer); this._pollTimer = null; }
  };

  // Apply a queued/late ICE candidate (only valid once remote desc is set).
  WebRTCTransport.prototype._addIce = function(cand){
    if (!cand) return;
    if (!this._haveRemote){ this._pendingIce.push(cand); return; }
    try{ this.pc.addIceCandidate(cand).catch(()=>{}); }catch(_){}
  };
  WebRTCTransport.prototype._flushIce = function(){
    const q = this._pendingIce; this._pendingIce = [];
    for (const c of q) this._addIce(c);
  };

  // Dispatch one relayed signaling message {kind:'offer'|'answer'|'ice', ...}.
  WebRTCTransport.prototype._handleSignal = function(msg){
    if (!msg || !msg.kind || !this.pc) return;
    if (msg.kind === 'ice'){ this._addIce(msg.cand); return; }
    if (msg.kind === 'offer' && !this._isHost && !this._gotOffer){
      this._gotOffer = true;
      this.pc.setRemoteDescription(msg.sdp)
        .then(()=>{ this._haveRemote = true; this._flushIce(); return this.pc.createAnswer(); })
        .then(a=> this.pc.setLocalDescription(a))
        .then(()=>{ this._post(this._otherBox, { kind:'answer', sdp:this.pc.localDescription }); })
        .catch(()=>{ this._gotOffer = false; /* allow a retry on next poll */ });
      return;
    }
    if (msg.kind === 'answer' && this._isHost && !this._gotAnswer){
      this._gotAnswer = true;
      // a guest is now negotiating with us -> START the ICE handshake watchdog
      // (deferred from host() so an EMPTY waiting room never times out).
      this._armConnectTimeout();
      this.pc.setRemoteDescription(msg.sdp)
        .then(()=>{ this._haveRemote = true; this._flushIce(); })
        .catch(()=>{ this._gotAnswer = false; });
      return;
    }
  };

  // resolve once ICE gathering completes => one self-contained SDP blob
  // (only used by the LEGACY manual copy/paste fallback below)
  WebRTCTransport.prototype._localBlob = function(){
    return new Promise((resolve)=>{
      const pc = this.pc;
      if (pc.iceGatheringState === 'complete'){ resolve(JSON.stringify(pc.localDescription)); return; }
      const chk = ()=>{ if (pc.iceGatheringState === 'complete'){ pc.removeEventListener('icegatheringstatechange', chk); resolve(JSON.stringify(pc.localDescription)); } };
      pc.addEventListener('icegatheringstatechange', chk);
      setTimeout(()=>{ if (pc.localDescription) resolve(JSON.stringify(pc.localDescription)); }, 2500);
    });
  };

  // HOST side — AUTOMATIC: reset room, create offer, POST to guest box, poll host box.
  WebRTCTransport.prototype.host = function(code, h){
    this._isHost = true;
    this._code = (code||'').toUpperCase();
    this._secret = (h && h.secret) ? String(h.secret) : null;   // per-match secret (P2-4)
    this._myBox = 'host'; this._otherBox = 'guest'; this._since = 0;
    if (!this.pc) this.open();
    const dc = this.pc.createDataChannel('ca');
    this._wireChannel(dc);
    // 1) clear any stale room state, 2) make the offer, 3) start listening.
    this._reset().then(()=> this.pc.createOffer())
      .then(o=> this.pc.setLocalDescription(o))
      .then(()=>{
        // POST the offer for the guest. (Trickle ICE flows via onicecandidate.)
        this._post(this._otherBox, { kind:'offer', sdp:this.pc.localDescription });
        // legacy hook (kept; harmless if no manual UI listens)
        if (this._onLocalDesc){ this._localBlob().then(b=> this._onLocalDesc('offer', b)); }
      })
      .catch(()=>{});
    this._startPoll(); // poll OUR (host) box for the guest's answer + ICE
    // NOTE: the host does NOT arm the connect watchdog here. A freshly-created
    // room legitimately sits EMPTY until a guest joins — arming a 25s timer now
    // made the host "fail" while it was only WAITING for an opponent. Instead we
    // arm the ICE watchdog the moment a guest's ANSWER arrives (see _handleSignal),
    // i.e. once an actual negotiation is in flight. Until then the host just polls.
  };

  // GUEST side — AUTOMATIC: poll guest box for the host's offer, then answer.
  WebRTCTransport.prototype.join = function(code, h){
    this._isHost = false;
    this._code = (code||'').toUpperCase();
    this._secret = (h && h.secret) ? String(h.secret) : null;   // per-match secret (P2-4)
    this._myBox = 'guest'; this._otherBox = 'host'; this._since = 0;
    if (!this.pc) this.open();
    this.pc.ondatachannel = (e)=> this._wireChannel(e.channel);
    this._startPoll(); // poll OUR (guest) box; _handleSignal will answer the offer
    this._armConnectTimeout(); // fail loudly if no host offer / connection in time
  };

  /* ----- LEGACY manual copy/paste signaling (fallback; no longer required) -----
   * QA P3: a beillesztett blobot try/catch védi — egy hibás paste eddig
   * kezeletlen kivételt dobott (minden más JSON.parse a js/-ben védett). */
  WebRTCTransport.prototype.acceptOffer = function(offerBlob){
    let offer; try{ offer = JSON.parse(offerBlob); }catch(e){ return Promise.reject(new Error('invalid offer code')); }
    this._gotOffer = true;
    return this.pc.setRemoteDescription(offer)
      .then(()=>{ this._haveRemote = true; this._flushIce(); return this.pc.createAnswer(); })
      .then(a=> this.pc.setLocalDescription(a))
      .then(()=> this._localBlob())
      .then(blob=>{ if (this._onLocalDesc) this._onLocalDesc('answer', blob); });
  };
  WebRTCTransport.prototype.acceptAnswer = function(answerBlob){
    let ans; try{ ans = JSON.parse(answerBlob); }catch(e){ return Promise.reject(new Error('invalid answer code')); }
    this._gotAnswer = true;
    return this.pc.setRemoteDescription(ans)
      .then(()=>{ this._haveRemote = true; this._flushIce(); });
  };

  // LIVE link health (for the reconnect grace decision). True only when the
  // DataChannel is open AND ICE is in a healthy state right now — unlike the
  // sticky `_connected` flag (which stays true for the whole session after the
  // first open). Used to decide whether a transient drop actually recovered.
  WebRTCTransport.prototype.isLive = function(){
    if (!this.dc || this.dc.readyState !== 'open') return false;
    if (!this.pc) return false;
    const st = this.pc.iceConnectionState;
    return (st === 'connected' || st === 'completed');
  };
  WebRTCTransport.prototype.send = function(msg){
    if (this.dc && this.dc.readyState === 'open'){ try{ this.dc.send(JSON.stringify(msg)); }catch(_){} }
  };
  WebRTCTransport.prototype.onMessage = function(cb){ this._cb = cb; };
  WebRTCTransport.prototype.close = function(){
    this._stopPoll();
    if (this._iceStopTimer){ clearTimeout(this._iceStopTimer); this._iceStopTimer = null; }
    if (this._connectTimer){ clearTimeout(this._connectTimer); this._connectTimer = null; }
    // null the callbacks so a late onclose/onicefail can't fire after teardown.
    this.onConnected = null; this.onClosed = null; this.onFailed = null;
    this.onReconnecting = null; this.onReconnected = null;
    if (this.dc){ try{ this.dc.onclose = null; this.dc.close(); }catch(_){} this.dc=null; }
    if (this.pc){ try{ this.pc.close(); }catch(_){} this.pc=null; }
    this._cb=null; this._secret=null;
  };

  /* ---------------------------------------------------------------------------
   * (3) WebSocket-room transport — STUB. If you stand up a tiny relay server
   * (e.g. `ws://host/room/<code>` that fans messages out to the room), this is
   * the one-click internet path. Left unimplemented because we have no server.
   * The interface is identical, so CA.Net needs zero changes to adopt it.
   * ------------------------------------------------------------------------- */
  function WebSocketTransport(url){
    this.url = url || ''; this.ws=null; this._cb=null; this._code=null;
  }
  WebSocketTransport.prototype.caps = function(){
    return { name:'WebSocket relay (szerver kell)', p2p:false, internet:true, needsSignaling:false };
  };
  WebSocketTransport.prototype.open = function(){ /* connect when host/join given a code */ return true; };
  WebSocketTransport.prototype._connect = function(code){
    this._code = code;
    try{
      this.ws = new WebSocket(this.url.replace('{code}', encodeURIComponent(code)));
      this.ws.onmessage = (e)=>{ let m; try{ m=JSON.parse(e.data); }catch(_){ return; } if(this._cb) this._cb(m); };
    }catch(e){ /* no server -> stays a stub */ }
  };
  WebSocketTransport.prototype.host = function(code,h){ this._connect(code); };
  WebSocketTransport.prototype.join = function(code,h){ this._connect(code); };
  WebSocketTransport.prototype.send = function(msg){ if(this.ws && this.ws.readyState===1){ try{ this.ws.send(JSON.stringify(msg)); }catch(_){} } };
  WebSocketTransport.prototype.onMessage = function(cb){ this._cb=cb; };
  WebSocketTransport.prototype.close = function(){ if(this.ws){ try{ this.ws.close(); }catch(_){} this.ws=null; } this._cb=null; };

  /* ---------------------------------------------------------------------------
   * (4) STEAM transport — STUB documenting the future hook.
   * On a Steam build you replace the body with Steamworks calls:
   *   open()  -> SteamAPI_Init()
   *   host()  -> ISteamMatchmaking::CreateLobby(); store lobby id as the "code"
   *   join()  -> JoinLobby(code); members discovered via lobby data
   *   send()  -> ISteamNetworkingMessages::SendMessageToUser() (relay, reliable)
   *   onMessage -> poll ReceiveMessagesOnChannel() each frame
   * Because CA.Net only ever calls host/join/send/onMessage/close, NOTHING in
   * the game logic or lobby UI changes. THIS is the multiplayer hook for Steam.
   * ------------------------------------------------------------------------- */
  function SteamTransport(){ this._cb=null; }
  SteamTransport.prototype.caps = function(){ return { name:'Steam Lobby + Relay', p2p:true, internet:true, needsSignaling:false }; };
  SteamTransport.prototype.open = function(){ throw new Error('Steam transport is a build-time stub (needs Steamworks).'); };
  SteamTransport.prototype.host = function(){};
  SteamTransport.prototype.join = function(){};
  SteamTransport.prototype.send = function(){};
  SteamTransport.prototype.onMessage = function(cb){ this._cb=cb; };
  SteamTransport.prototype.close = function(){};

  /* ============================================================================
   * CA.Net — the transport-agnostic online layer + lobby model + host sim sync.
   * ==========================================================================*/
  const bus = new Emitter();

  // Message types on the wire (all JSON, `t` = type):
  //   join    {t,id,name}              client announces itself (-> host)
  //   roster  {t,players}              host broadcasts authoritative player list
  //   ready   {t,id,ready}             client toggles ready (-> host)
  //   cfg     {t,cfg}                  host broadcasts the chosen room config (-> all)
  //   chat    {t,id,name,text}         any peer -> relayed to all (lobby chat)
  //   start   {t,seed,teams,gameMode,cfg}  host: begin match (-> all)
  //   input   {t,id,input}             client intent for ITS turn (-> host)
  //   snap    {t,s}                    host state snapshot (-> all clients)
  //   fx      {t,x,y,r,d}              host: an explosion happened (-> clients render it)
  //   fired   {t,uid,wid}             host: a unit fired (-> clients: muzzle sfx/quip)
  //   leave   {t,id}                   peer leaving

  const Net = {
    transports: {
      broadcast: () => new BroadcastTransport(),
      webrtc:    () => new WebRTCTransport(),
      websocket: (url) => new WebSocketTransport(url),
      steam:     () => new SteamTransport(),
    },

    /* live state */
    _t: null,                 // active transport
    _role: null,              // 'host' | 'client' | null
    // Coarse connection status for the lobby UI. One of:
    //   'idle' | 'connecting' | 'waiting' (host has no guest yet) |
    //   'connected' | 'reconnecting' (transient drop, in grace window) |
    //   'failed' | 'closed' (opponent left / link dropped)
    // Mirrors the real transport state; emitted via the 'status' bus event AND
    // CA.events 'net:status' so the lobby can render clear states (and stop
    // showing a perpetual spinner when a connection can't be made).
    _status: 'idle',
    _statusMsg: '',           // human-readable detail for 'failed'/'closed'
    _code: null,
    _secret: null,            // per-match shared secret (P2-4): issued by matchmake.php at
                              // pairing/register/claim; REQUIRED on every signal.php POST/GET.
    _selfId: null,
    _selfName: 'Játékos',
    _players: [],             // [{id,name,ready,teamId,isHost}]
    _started: false,
    _myTeamIds: [],           // team ids this client controls in the live match
    _lastSnap: null,
    _snapAccum: 0,
    _hbAccum: 0,              // periodic authoritative-heartbeat accumulator (host)
    _reconnectTimer: null,    // brief auto-reconnect grace timer (transient drops)
    _hostBound: false,
    // DEFAULT to WebRTC + auto-signaling so host()/join(code) connect over the
    // INTERNET with one click (no copy/paste). Cross-tab on one machine is still
    // available via setTransport('broadcast') if ever needed.
    transportName: 'webrtc',
    webrtcSignal: { localKind:null, localBlob:'', stage:'idle' }, // legacy lobby UI (unused in auto flow)

    /* Match configuration chosen in the lobby by the HOST and shared with every
     * peer (theme / gameMode / weather / aiLevel / …). Readable by all peers as
     * CA.Net.roomConfig. Defaults to {} so the lobby can always read it. */
    roomConfig: {},

    /* TURN-SERVER config slot (strict/symmetric NAT). Leave urls empty to use
     * STUN-only (default). To enable a relay fallback, set e.g.:
     *   CA.Net.turnConfig = { urls:'turn:your.turn.host:3478', username:'u', credential:'p' };
     * BEFORE hosting/joining. It is merged into iceServers in WebRTCTransport.open(). */
    turnConfig: { urls:'', username:'', credential:'' },

    /* ----- quick-match (matchmaking) live state ----- */
    _mmTicket: null,          // our matchmaking ticket id while queued
    _mmTimer: null,           // poll timer handle
    _mmOnStatus: null,        // caller's status callback
    _mmActive: false,         // are we currently searching?

    /* ----- spectator state ----- */
    _spectator: false,        // true => this peer only watches (never gets a team/turn)

    /* client-side input bookkeeping (so we forward clean INTENTS to the host
     * and never let the client mutate authoritative state locally) */
    _cliPower: 0, _cliCharging: false, _cliJumpLatch: false, _cliLastWeapon: null,
    _origCanControl: null, _origFireCharged: null, _origJump: null, _inputAccum: 0,
    _cliShimBound: false,

    /* ----- public flags used by core/ui/screens to gate input ----- */
    isOnline(){ return !!this._role; },
    isHost(){ return this._role === 'host'; },
    isClient(){ return this._role === 'client'; },
    isStarted(){ return this._started; },
    code(){ return this._code; },
    players(){ return this._players.slice(); },
    selfId(){ return this._selfId; },
    selfName(){ return this._selfName; },
    transportCaps(){ return this._t ? this._t.caps() : null; },
    isSpectator(){ return !!this._spectator; },

    /* Coarse status for the lobby UI (see _status doc above). */
    status(){ return this._status; },
    statusMessage(){ return this._statusMsg; },

    /* Set + broadcast the lobby connection status (idempotent on same state). */
    _setStatus(s, msg){
      if (s === this._status && (msg||'') === (this._statusMsg||'')) return;
      this._status = s;
      this._statusMsg = msg || '';
      try{ bus.emit('status', s, this._statusMsg); }catch(_){}
      try{ if (CA.events) CA.events.emit('net:status', { state:s, message:this._statusMsg }); }catch(_){}
    },

    /* Is the transport actually CONNECTED (data path open)? For WebRTC this is
     * true once the DataChannel opens; for the cross-tab/relay transports there
     * is no handshake, so being online-with-a-role is treated as connected. */
    isConnected(){
      if (!this._role) return false;
      if (this._t instanceof WebRTCTransport) return !!this._t._connected;
      return true;
    },

    /* Is it MY turn? Offline => always true (single-player untouched).
     * Online host: true when the active team is owned by the host OR by no
     * remote (host drives all local/AI teams). Online client: true only when
     * the live active team is one this client owns. */
    isMyTurn(teamId){
      if (!this._role || !this._started) return true;
      if (this._spectator) return false;   // spectators never get a turn
      const S = CA.state;
      const id = (teamId!=null) ? teamId : (S.teams[S.currentTeamIdx] && S.teams[S.currentTeamIdx].id);
      if (this._role === 'host') return this._isHostTeam(id);
      return this._myTeamIds.indexOf(id) >= 0;
    },

    on(ev, fn){ return bus.on(ev, fn); },
    off(ev, fn){ return bus.off(ev, fn); },

    init(){
      try{ const n = localStorage.getItem('ca_net_name'); if (n) this._selfName = n; }catch(_){}
      this._bindHooks();
    },

    setName(name){
      this._selfName = (String(name||'').trim()) || 'Játékos';
      try{ localStorage.setItem('ca_net_name', this._selfName); }catch(_){}
      if (this._selfId){
        const me = this._players.find(p=>p.id===this._selfId);
        if (me){ me.name = this._selfName;
          if (this.isHost()) this._broadcastRoster();
          else this._send({ t:'join', id:this._selfId, name:this._selfName });
        }
      }
    },

    setTransport(name){ if (this.transports[name]) this.transportName = name; },

    /* ---------------- PUBLIC LOBBY (room discovery) ----------------
     * listRooms() -> Promise<[{code,name,theme,mode,players,age}]> — the open
     * public rooms a player can join directly from the lobby (Jani: "a find
     * fedezze fel a szobákat; a multiba belépve lássam mint egy lobbyt").
     * Never throws; resolves [] on any error. */
    listRooms(){
      return this._mmFetch({ action:'rooms' })
        .then(j=> (j && j.ok && Array.isArray(j.rooms)) ? j.rooms : [])
        .catch(()=> []);
    },
    /* HOST: keep our public room listed (heartbeat) while it waits for a player. */
    _startRoomBeat(){
      this._stopRoomBeat();
      if (!this.isHost() || this._public === false) return;
      const beat = ()=>{
        if (!this.isHost() || this._started || this._public === false){ this._stopRoomBeat(); return; }
        const players = (this._players && this._players.length) || 1;
        this._mmFetch({ action:'roombeat', room:this._code, players, max:this.maxPlayers() }).catch(()=>{});
      };
      this._roomBeatTimer = setInterval(beat, 20000);   // < MM_ROOM_TTL (45s)
    },
    _stopRoomBeat(){ if (this._roomBeatTimer){ clearInterval(this._roomBeatTimer); this._roomBeatTimer = null; } },
    /* remove our room from the public lobby (match started / host left / private). */
    _unlistRoom(){
      this._stopRoomBeat();
      if (this._code){ this._mmFetch({ action:'unlist', room:this._code }).catch(()=>{}); }
    },
    /* Toggle the CURRENT host room public/private while waiting in the lobby. */
    setRoomPublic(pub){
      this._public = !!pub;
      if (!this.isHost() || !this._code) return;
      if (this._public){ this._acquireSecret('host', this._code); this._startRoomBeat(); }
      else { this._unlistRoom(); }
      bus.emit('roomPublic', this._public);
    },
    isRoomPublic(){ return this._public !== false; },

    /* ============================ QUICK MATCH ============================
     * "Keress ellenfelet" — auto-pair two players with NO code typing, via the
     * relative `matchmake.php` queue. We POST {action:'find'}; if queued we poll
     * {action:'poll'} every ~1.5s until matched, then automatically host(room)
     * (role==='host') or join(room) (role==='guest') so the normal WebRTC
     * auto-signaling takes over and the match connects. Status is surfaced to the
     * caller via onStatus(...) AND CA.events.emit('net:matchmaking', status).
     * Fully defensive: every fetch is wrapped, polling stops on cancel/connect/error.
     * ================================================================= */
    findMatch(onStatus){
      // already searching? ignore a duplicate call.
      if (this._mmActive) return false;
      this._mmActive = true;
      this._mmTicket = null;
      this._mmOnStatus = (typeof onStatus === 'function') ? onStatus : null;

      const emit = (status)=>{
        try{ if (this._mmOnStatus) this._mmOnStatus(status); }catch(_){}
        try{ if (CA.events) CA.events.emit('net:matchmaking', status); }catch(_){}
      };

      // when matched: tear down the search and connect via the existing flow.
      // `secret` is the per-match shared secret (P2-4) issued by matchmake.php to
      // BOTH peers; we pass it into host()/join() so it rides every signal.php call.
      const onMatched = (room, role, secret)=>{
        this._stopMatchPoll();
        this._mmActive = false; this._mmTicket = null;
        emit({ state:'matched', room, role });
        try{
          if (role === 'host') this.host({ code: room, secret: secret });
          else                 this.join(room, { secret: secret });
        }catch(e){
          emit({ state:'error', error:String(e && e.message || e) });
        }
      };

      emit({ state:'searching' });

      // POST the find request.
      this._mmFetch({ action:'find', name:this._selfName })
        .then(j=>{
          if (!this._mmActive) return;             // cancelled while in flight
          if (!j || !j.ok){ this._mmFail(CA.t('Matchmaking nem elérhető.')); return; }
          if (j.status === 'matched' && j.room){
            onMatched(j.room, j.role || 'guest', j.secret || '');
          } else if (j.status === 'waiting' && j.ticket){
            this._mmTicket = j.ticket;
            emit({ state:'waiting', ticket:j.ticket });
            this._startMatchPoll(onMatched);
          } else {
            this._mmFail(CA.t('Ismeretlen matchmaking válasz.'));
          }
        })
        .catch(()=>{ this._mmFail(CA.t('Hálózati hiba a kereséskor.')); });
      return true;
    },

    /* Cancel an in-progress quick match. Stops polling and best-effort tells the
     * server to drop our ticket. Safe to call any time (no-op if not searching). */
    cancelMatch(){
      if (!this._mmActive && !this._mmTicket) return;
      const ticket = this._mmTicket;
      this._stopMatchPoll();
      this._mmActive = false; this._mmTicket = null;
      if (ticket){ this._mmFetch({ action:'cancel', ticket }).catch(()=>{}); }
      const status = { state:'cancelled' };
      try{ if (this._mmOnStatus) this._mmOnStatus(status); }catch(_){}
      try{ if (CA.events) CA.events.emit('net:matchmaking', status); }catch(_){}
      this._mmOnStatus = null;
    },

    _mmFail(message){
      this._stopMatchPoll();
      this._mmActive = false; this._mmTicket = null;
      const status = { state:'error', error:message };
      try{ if (this._mmOnStatus) this._mmOnStatus(status); }catch(_){}
      try{ if (CA.events) CA.events.emit('net:matchmaking', status); }catch(_){}
    },

    /* Acquire the per-match shared secret (P2-4) for the manual host/join flow,
     * where there is no quick-match pairing to issue one. The room CODE is the
     * "knock"; the SECRET is granted on a successful matchmake handshake:
     *   • HOST  -> action:'register' mints (or returns the existing) secret for
     *             the code and seeds the signal-room record with it.
     *   • GUEST -> action:'claim' presents the code; gets the secret iff a room
     *             record with one exists (i.e. the host registered first).
     * Resolves to a non-empty secret string on success, or '' on failure. Never
     * throws (degrades gracefully — the caller surfaces a clear error). */
    _acquireSecret(role, code){
      const action = (role === 'host') ? 'register' : 'claim';
      const body = { action: action, room: code };
      // HOST: advertise the room in the public lobby unless it's private. The
      // register call is idempotent on the secret, so folding the listing in here
      // costs no extra round-trip. (Lobby discovery — Jani: "a find fedezze fel".)
      if (role === 'host'){
        body.public = (this._public !== false);
        body.name = this._selfName;
        body.max = this.maxPlayers();
        body.players = (this._players && this._players.length) || 1;
        if (this._roomTheme) body.theme = this._roomTheme;
        if (this._roomMode)  body.mode  = this._roomMode;
      }
      return this._mmFetch(body)
        .then(j=>{
          if (j && j.ok && j.secret){
            // a register may hand back a normalized/picked room code — adopt it.
            if (role === 'host' && j.room) this._code = String(j.room).toUpperCase();
            return String(j.secret);
          }
          return '';
        })
        .catch(()=> '');
    },

    // POST a JSON body to matchmake.php; resolves to parsed JSON or null. Never throws.
    _mmFetch(body){
      try{
        return fetch(MATCH_URL, {
          method:'POST', credentials:CREDS(),
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify(body),
        }).then(r=>r.json()).catch(()=>null);
      }catch(_){ return Promise.resolve(null); }
    },

    _startMatchPoll(onMatched){
      if (this._mmTimer) return;
      const loop = ()=>{
        if (!this._mmActive || !this._mmTicket){ this._stopMatchPoll(); return; }
        this._mmFetch({ action:'poll', ticket:this._mmTicket })
          .then(j=>{
            if (!this._mmActive) return;           // cancelled meanwhile
            if (!j || !j.ok){ /* transient -> keep polling */ }
            else if (j.status === 'matched' && j.room){ onMatched(j.room, j.role || 'guest', j.secret || ''); return; }
            // still waiting (or transient) -> schedule next poll
            if (this._mmActive) this._mmTimer = setTimeout(loop, MATCH_POLL_MS);
          })
          .catch(()=>{ if (this._mmActive) this._mmTimer = setTimeout(loop, MATCH_POLL_MS); });
      };
      this._mmTimer = setTimeout(loop, MATCH_POLL_MS);
    },
    _stopMatchPoll(){
      if (this._mmTimer){ clearTimeout(this._mmTimer); this._mmTimer = null; }
    },

    /* ============================ EMOTE / REACTIONS ============================
     * A quick broadcast reaction any peer (player OR spectator) can send. The
     * host re-fans it to all clients; everyone (incl. the sender) gets a
     * CA.events.emit('net:emote', {name, emoji}) so the UI can pop it. This rides
     * on the lobby/relay channel and is independent of the turn/sim logic. */
    sendEmote(emoji){
      emoji = String(emoji==null?'':emoji).slice(0, 8);
      if (!emoji || !this._role) return;
      const name = this._selfName;
      // show locally right away
      try{ if (CA.events) CA.events.emit('net:emote', { name, emoji, self:true }); }catch(_){}
      const msg = { t:'emote', id:this._selfId, name, emoji };
      if (this.isHost()) this._broadcast(msg);   // host fans out to all clients
      else this._send(msg);                       // client -> host (host re-relays)
    },

    /* ============================ REMATCH ============================
     * Host-only: start a NEW match with the SAME already-connected peers and the
     * SAME roomConfig — WITHOUT reconnecting (the transport / WebRTC channel stays
     * up). It simply clears the started flag and re-runs the existing start flow,
     * so every peer re-newGame()s with a fresh seed. Guests follow because start()
     * broadcasts the 'start' payload exactly as for a first match. */
    rematch(opts){
      if (!this.isHost()) return false;
      if (!this.isConnected()) return false;
      // reset per-match state so canStart()/start() behave like a fresh match,
      // but KEEP players, roster, ownership map and the live transport.
      this._removeControlGates();
      try{ if (CA.state) CA.state.paused = false; }catch(_){}
      this._started = false;
      this._myTeamIds = [];
      this._lastSnap = null;
      this._snapAccum = 0;
      this._cliPower = 0; this._cliCharging = false; this._cliJumpLatch = false;
      // re-ready everyone (a finished match may have left ready flags as-is; that's
      // fine — they're all still ready) and re-run the normal start flow.
      bus.emit('rematch');
      try{ if (CA.events) CA.events.emit('net:rematch', {}); }catch(_){}
      return this.start(opts);
    },

    /* ---------------- LOBBY: chat + room config ---------------- */

    /* Send a chat line. The sender emits its own line immediately (self:true);
     * every peer that receives it emits net:chat so the lobby can display it.
     * Works in both directions (host<->client) via the star topology relay. */
    sendChat(text){
      text = String(text==null?'':text).trim();
      if (!text) return;
      const name = this._selfName;
      // show locally right away
      if (CA.events) CA.events.emit('net:chat', { name, text, self:true });
      const msg = { t:'chat', id:this._selfId, name, text };
      if (this.isHost()) this._broadcast(msg);   // host fans out to all clients
      else this._send(msg);                       // client -> host (host re-relays)
    },

    /* HOST sets the match config and shares it with everyone. Stored on
     * CA.Net.roomConfig (readable by all peers). When the host starts the match
     * this config is used so every peer plays the SAME map/mode/weather. */
    setRoomConfig(cfg){
      cfg = cfg || {};
      this.roomConfig = Object.assign({}, this.roomConfig, cfg);
      if (this.isHost()){
        this._broadcast({ t:'cfg', cfg:this.roomConfig });
      }
      if (CA.events) CA.events.emit('net:roomcfg', this.roomConfig);
      bus.emit('roomConfig', this.roomConfig);
      return this.roomConfig;
    },

    /* ---- PLAYER COUNT + SPECIES (lobby room setup) ---------------------------
     * maxPlayers (2–4) lives in roomConfig (host sets it). playerCount() exposes
     * {players,max} for the lobby header. setSpecies(sp) lets EACH player pick the
     * animal they'll play as; the choice rides the roster so everyone sees it and
     * the host uses it when building teams at start (Jani). */
    maxPlayers(){ const m = (this.roomConfig && this.roomConfig.maxPlayers)|0; return (m>=2&&m<=4)?m:2; },
    setMaxPlayers(n){ n=Math.max(2,Math.min(4,n|0)); return this.setRoomConfig({ maxPlayers:n }); },
    playerCount(){
      const playing = this._players.filter(p=>!p.spectator).length;
      return { players: playing, max: this.maxPlayers() };
    },
    setSpecies(sp){
      sp = String(sp||'').trim(); if (!sp) return;
      this._species = sp;
      const me = this._players.find(p=>p.id===this._selfId);
      if (me) me.species = sp;
      if (this.isHost()) this._broadcastRoster();
      else this._send({ t:'species', id:this._selfId, species:sp });
      bus.emit('roster', this.players());
    },
    mySpecies(){ return this._species || null; },

    /* ---------------- HOST ---------------- */
    host(opts){
      opts = opts || {};
      // Guard against a duplicate host/join while one is already live/connecting:
      // a second call would orphan the first transport and confuse the room. The
      // caller should leave() first; we no-op (returning the live code) instead.
      if (this._role){ return this._code; }
      this._teardownTransport();
      this._role = 'host';
      // PUBLIC by default; the lobby's privacy toggle / opts.public can make it
      // private (code-only, not listed). Metadata for the lobby listing.
      this._public = (opts.public !== false);
      this._roomTheme = opts.theme || this._roomTheme || '';
      this._roomMode  = opts.gameMode || opts.mode || this._roomMode || '';
      this._code = (opts.code || this._genCode()).toUpperCase();
      this._selfId = this._selfId || ('h'+Math.random().toString(36).slice(2,9));
      this._players = [{ id:this._selfId, name:this._selfName, ready:true, isHost:true, teamId:null }];
      this._started = false; this._myTeamIds = [];

      // per-match secret (P2-4): quick-match passes it in opts.secret; a MANUAL
      // host mints one via matchmake 'register' before negotiating (below).
      this._secret = (opts.secret) ? String(opts.secret) : null;

      const t = this._makeTransport();
      this._t = t;
      try{ t.open(); }catch(e){ bus.emit('error', 'Transport open failed: '+e.message); this._role=null; this._setStatus('idle'); return null; }
      t.onMessage((m)=> this._onHostMessage(m));
      this._wireWebrtcSignal(t);
      this._wireTransportLifecycle(t);
      // The host has no guest yet -> 'waiting' ("Várakozás az ellenfélre…"), NOT
      // 'connecting' (which read as a failing handshake while the room sat empty).
      // Once a guest's answer arrives the lifecycle flips this to 'connected'.
      this._setStatus('waiting');

      // Start the actual transport negotiation. For WebRTC we MUST have a secret
      // first (signal.php 403s without it). Non-WebRTC transports (cross-tab/relay)
      // need no secret and start immediately — single-/same-machine flow unchanged.
      const startHost = ()=>{
        try{ t.host(this._code, { secret:this._secret }); }catch(e){ bus.emit('error', 'host() failed: '+e.message); }
        bus.emit('hosted', this._code);
        bus.emit('roster', this.players());
        // keep the public room listed while it waits (heartbeat refreshes its TTL)
        this._startRoomBeat();
      };
      if ((t instanceof WebRTCTransport) && !this._secret){
        // MANUAL host: mint a secret (and possibly a normalized code), then start.
        this._acquireSecret('host', this._code).then(secret=>{
          if (this._t !== t){ return; } // left/torn down while in flight
          if (!secret){
            this._setStatus('failed', CA.t('Matchmaking nem elérhető.'));
            bus.emit('error', CA.t('Matchmaking nem elérhető.'));
            return;
          }
          this._secret = secret;
          startHost();
        });
      } else {
        startHost();
      }
      return this._code;
    },

    /* ---------------- JOIN ---------------- */
    /* Join a room as a SPECTATOR: connects + receives snapshots like a normal
     * client, but announces spectator:true so the host never assigns it a team
     * or a turn. The spectator renders the host's snapshots read-only and can
     * chat / send emotes. Just a thin flag-then-join wrapper over join(). */
    joinAsSpectator(code){
      this._spectator = true;
      return this.join(code, { spectator:true });
    },

    join(code, opts){
      code = (String(code||'').trim()).toUpperCase();
      if (!code){ bus.emit('error', 'Adj meg szobakódot.'); return false; }
      // Guard against a duplicate host/join while one is already live/connecting
      // (a stray second tap on Join would orphan the first transport).
      if (this._role){ return false; }
      // opts.spectator (or a prior joinAsSpectator) => watch-only role
      if (opts && opts.spectator) this._spectator = true;
      this._teardownTransport();
      this._role = 'client';
      this._code = code;
      this._selfId = this._selfId || ('c'+Math.random().toString(36).slice(2,9));
      this._players = [];
      this._started = false; this._myTeamIds = [];

      // per-match secret (P2-4): quick-match passes it in opts.secret; a MANUAL
      // code-only join must CLAIM it from matchmake using the code as the knock.
      this._secret = (opts && opts.secret) ? String(opts.secret) : null;

      const t = this._makeTransport();
      this._t = t;
      try{ t.open(); }catch(e){ bus.emit('error', 'Transport open failed: '+e.message); this._role=null; this._setStatus('idle'); return false; }
      t.onMessage((m)=> this._onClientMessage(m));
      this._wireWebrtcSignal(t);
      this._wireTransportLifecycle(t);
      this._setStatus((t instanceof WebRTCTransport) ? 'connecting' : 'connected');

      // announce ourselves to the host (broadcast/relay deliver immediately;
      // for WebRTC this fires once the DataChannel opens — see onConnected).
      const announce = ()=> this._send({ t:'join', id:this._selfId, name:this._selfName, spectator:this._spectator });
      if (t instanceof WebRTCTransport){
        t.onConnected = ()=>{
          if (this._reconnectTimer){ clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
          this._setStatus('connected'); announce(); bus.emit('connected');
        };
      }

      // Start the transport. WebRTC needs the secret first (signal.php 403s
      // without it). Non-WebRTC transports start immediately + announce now.
      const startJoin = ()=>{
        try{ t.join(this._code, { secret:this._secret }); }catch(e){ bus.emit('error', 'join() failed: '+e.message); }
        if (!(t instanceof WebRTCTransport)) announce();
        bus.emit('joined', this._code);
      };
      if ((t instanceof WebRTCTransport) && !this._secret){
        // MANUAL code-only join: claim the secret with the code, then connect. If
        // no secret can be obtained (host never registered / unsecured room) we
        // degrade gracefully with a clear error instead of crashing or hanging.
        this._acquireSecret('client', this._code).then(secret=>{
          if (this._t !== t){ return; } // left/torn down while in flight
          if (!secret){
            this._setStatus('failed', CA.t('Nem sikerült csatlakozni (időtúllépés). Internetes játékhoz TURN-szerver kellhet — egy hálózaton (vagy két fülön) megbízhatóbb.'));
            bus.emit('error', CA.t('Matchmaking nem elérhető.'));
            return;
          }
          this._secret = secret;
          startJoin();
        });
      } else {
        startJoin();
      }
      return true;
    },

    /* Wire the transport's connection lifecycle (WebRTC only fires these) into our
     * coarse status + the bus, so the lobby can show connected / failed / opponent
     * left instead of hanging. HONEST GATING: a 'failed' here is usually a NAT pair
     * we can't traverse without a TURN relay (which we don't ship) — see the
     * TURN-SERVER HOOK + CONNECT_TIMEOUT_MS comments above. */
    _wireTransportLifecycle(t){
      if (!(t instanceof WebRTCTransport)) return;
      // host's onConnected: a guest's channel opened -> we're truly connected.
      // (the client's onConnected is set in join() so it can also announce()).
      if (this.isHost()){
        t.onConnected = ()=>{
          if (this._reconnectTimer){ clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
          this._setStatus('connected'); bus.emit('connected');
        };
      }
      t.onFailed = (reason)=>{
        if (this._status === 'connected') return;   // ignore a late fail after connect
        this._setStatus('failed',
          CA.t('Nem sikerült csatlakozni (időtúllépés). Internetes játékhoz TURN-szerver kellhet — egy hálózaton (vagy két fülön) megbízhatóbb.'));
        bus.emit('error', CA.t('Nem sikerült csatlakozni (időtúllépés). Internetes játékhoz TURN-szerver kellhet — egy hálózaton (vagy két fülön) megbízhatóbb.'));
        bus.emit('connectFailed', reason);
      };
      // RECONNECT GRACE WINDOW (transient drop -> try to recover before declaring
      // the opponent gone). On ICE 'disconnected' we flip to a 'reconnecting' status
      // and start a timer; if ICE recovers ('connected'/'completed') OR the channel
      // is still actually open we cancel it and go back to 'connected'. Only if the
      // window elapses without recovery do we treat it as a real drop ('closed').
      // This smooths over wifi roams / brief blips on same-LAN and P2P links.
      t.onReconnecting = ()=>{
        if (this._status === 'closed') return;            // already torn down
        if (this._reconnectTimer) return;                 // grace already running
        this._setStatus('reconnecting', CA.t('Újrakapcsolódás…'));
        bus.emit('reconnecting');
        this._reconnectTimer = setTimeout(()=>{
          this._reconnectTimer = null;
          // recovered? (live link == DataChannel open AND ICE healthy NOW)
          if (this._t === t && typeof t.isLive === 'function' && t.isLive()){ this._setStatus('connected'); return; }
          this._setStatus('closed', CA.t('A kapcsolat megszakadt.'));
          bus.emit('error', CA.t('A kapcsolat megszakadt.'));
          bus.emit('opponentLeft');
        }, RECONNECT_GRACE_MS);
      };
      t.onReconnected = ()=>{
        if (this._reconnectTimer){ clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        if (this._status === 'reconnecting') this._setStatus('connected');
      };
      t.onClosed = ()=>{
        // channel dropped after a good connect. Give the reconnect grace a chance
        // FIRST (the DataChannel onclose can fire on a transient ICE blip too); if
        // the grace recovers, great — otherwise it will escalate to 'closed'. If a
        // grace is already running we let it own the outcome; if not, start one.
        if (this._status === 'closed') return;
        if (this._reconnectTimer) return;                 // grace already deciding
        this._setStatus('reconnecting', CA.t('Újrakapcsolódás…'));
        bus.emit('reconnecting');
        this._reconnectTimer = setTimeout(()=>{
          this._reconnectTimer = null;
          if (this._t === t && typeof t.isLive === 'function' && t.isLive()){ this._setStatus('connected'); return; }
          this._setStatus('closed', CA.t('Az ellenfél kilépett.'));
          bus.emit('error', CA.t('A kapcsolat megszakadt.'));
          bus.emit('opponentLeft');
        }, RECONNECT_GRACE_MS);
      };
    },

    leave(){
      // also abort any in-progress quick-match search.
      try{ this.cancelMatch(); }catch(_){}
      // pull our room from the public lobby so a late joiner can't pick a dead room
      try{ if (this.isHost()) this._unlistRoom(); }catch(_){}
      try{ this._stopRoomBeat(); }catch(_){}
      if (this._role){
        try{ this._send({ t:'leave', id:this._selfId }); }catch(_){}
      }
      // Best-effort close the room on the SIGNALING side too. For a host that
      // CREATED a room and is still WAITING (no guest yet), the relay mailbox
      // holds our stale offer; resetting it means a late guest can't pick up an
      // orphaned/dead room after we leave. Guarded: only when the active WebRTC
      // host transport exposes _reset(); never throws; runs before teardown
      // (which nulls _code and closes the transport).
      try{
        if (this.isHost() && this._t && (this._t instanceof WebRTCTransport) &&
            typeof this._t._reset === 'function'){
          this._t._reset();
        }
      }catch(_){}
      if (this._reconnectTimer){ clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
      this._teardownTransport();
      this._removeControlGates();
      try{ if (CA.state) CA.state.paused = false; }catch(_){}
      this._role = null; this._code = null; this._secret = null; this._players = [];
      this._spectator = false;
      this._started = false; this._myTeamIds = []; this._lastSnap = null;
      this._snapAccum = 0; this._hbAccum = 0;
      this._cliPower = 0; this._cliCharging = false; this._cliJumpLatch = false;
      this.webrtcSignal = { localKind:null, localBlob:'', stage:'idle' };
      // clear status WITHOUT re-emitting an error (we initiated this leave).
      this._status = 'idle'; this._statusMsg = '';
      try{ if (CA.events) CA.events.emit('net:status', { state:'idle', message:'' }); }catch(_){}
      bus.emit('left');
    },

    toggleReady(){
      const me = this._players.find(p=>p.id===this._selfId);
      if (!me) return;
      me.ready = !me.ready;
      if (this.isHost()){ this._broadcastRoster(); }
      else { this._send({ t:'ready', id:this._selfId, ready:me.ready }); }
    },

    canStart(){
      // need >= 2 PLAYING players (spectators don't count toward the minimum);
      // everyone (incl. spectators, who auto-ready) must be ready.
      const playing = this._players.filter(p=>!p.spectator);
      return this.isHost() && !this._started &&
        playing.length >= 2 && this._players.every(p=>p.ready);
    },

    /* HOST picks seed + team config and starts the match for everyone. The
     * lobby's chosen roomConfig (theme/gameMode/weather/…) is merged in so every
     * peer generates the SAME world. */
    start(opts){
      if (!this.canStart()) return false;
      opts = Object.assign({}, this.roomConfig || {}, opts || {});
      const seed = (opts.seed!=null) ? opts.seed : (CA.util ? CA.util.randInt(1,1e9) : (Date.now()%1e9));
      // Assign one team per PLAYING player, in join order. SPECTATORS are skipped
      // (they get no team / no turn — they only watch). Team ids are 1-based to
      // match core.js (team.id = i+1). Even players => capybara, odd => worm,
      // so the classic roster/colors apply.
      const playing = this._players.filter(p=>!p.spectator);
      this._players.forEach(p=>{ if (p.spectator) p.teamId = null; });
      const teams = playing.map((p, i)=>{
        p.teamId = i+1;
        return {
          // each player's OWN species choice (Jani); fall back to the classic
          // capybara/worm alternation if they didn't pick one.
          kind: p.species || ((i%2===0) ? 'capybara' : 'worm'),
          name: p.name,
          isAI: false,            // all online teams are human-driven; ownership gates input
          aiLevel: 0,
          _ownerId: p.id,
        };
      });
      const payload = { t:'start', seed, teams,
        gameMode:(opts.gameMode||'classic'),
        theme: opts.theme, weather: opts.weather, risingWater: !!opts.risingWater };
      this._broadcast(payload);
      this._beginMatch(payload, /*asHost*/true);
      return true;
    },

    /* ---------------- match lifecycle ---------------- */
    _beginMatch(payload, asHost){
      // fresh match (incl. rematch): drop any stale snapshot/pause from a prior
      // match so the new seeded world isn't clobbered by an old mirror frame.
      this._lastSnap = null;
      try{ if (CA.state) CA.state.paused = false; }catch(_){}
      this._started = true;
      // record which team ids THIS peer owns (for input gating)
      this._myTeamIds = this._players.filter(p=>p.id===this._selfId).map(p=>p.teamId).filter(x=>x!=null);
      // sanitize teams for CA.newGame (strip our _ownerId helper but remember it)
      this._teamOwners = {};
      const teams = payload.teams.map((t, i)=>{
        this._teamOwners[i+1] = t._ownerId;
        return { kind:t.kind, name:t.name, color:t.color, isAI:!!t.isAI, aiLevel:t.aiLevel||0 };
      });
      // EVERY peer calls newGame with identical args => identical seeded world.
      if (CA.newGame) CA.newGame({
        seed:payload.seed, teams,
        gameMode: payload.gameMode || 'classic',
        theme: payload.theme,
        weather: payload.weather,
        risingWater: !!payload.risingWater,
      });
      // install host-authoritative control gates (idempotent)
      this._installControlGates();
      this._snapAccum = 0;
      this._cliPower = 0; this._cliCharging = false; this._cliJumpLatch = false;
      // the match has begun — delist the room from the public lobby (host).
      try{ if (asHost) this._unlistRoom(); }catch(_){}
      // HOST: broadcast authoritative unit names so clients in another LANGUAGE
      // don't show locally-generated (mismatched) names. A couple of retries cover
      // a client whose channel opened a beat after 'start'.
      if (asHost){
        this._broadcastNames();
        setTimeout(()=>{ try{ if (this._started) this._broadcastNames(); }catch(_){} }, 600);
        setTimeout(()=>{ try{ if (this._started) this._broadcastNames(); }catch(_){} }, 1800);
      }
      this._lastSnapAt = Date.now();   // reset the sync watchdog at match start
      bus.emit('start', payload);
      // jump the UI out of the lobby into the live game
      if (CA.UI && CA.UI.setScreen) CA.UI.setScreen('main');
    },

    /* ----------------------------------------------------------------------------
     * HOST-AUTHORITATIVE CONTROL GATES (installed once a match begins).
     *
     * We cannot edit core.js, so we wrap the two functions that ALL local-input
     * paths (PC keyboard, PC mouse, mobile buttons, core's applyInputToUnit) go
     * through: CA.canControl and CA.Weapons.fireCharged.
     *
     *  • CA.canControl(): offline -> unchanged. Online -> only TRUE when it is
     *    THIS peer's turn AND this peer is the authoritative driver of the active
     *    unit. On the HOST that means the active team is host-owned (the host
     *    never locally steers a remote client's unit). On the CLIENT the local
     *    sim is frozen (S.paused), so its canControl is effectively false and the
     *    client never mutates authoritative state — it only forwards INTENTS.
     *
     *  • CA.Weapons.fireCharged(): on the CLIENT we DON'T fire locally (that would
     *    spawn a divergent projectile); instead we forward a fire intent so the
     *    HOST fires authoritatively and the result streams back in snapshots.
     * ------------------------------------------------------------------------- */
    _installControlGates(){
      const self = this;
      if (!this._origCanControl && typeof CA.canControl === 'function'){
        this._origCanControl = CA.canControl;
        CA.canControl = function(){
          const ok = self._origCanControl.apply(this, arguments);
          if (!self._role || !self._started) return ok;           // offline path untouched
          if (self.isClient()) return false;                      // client never drives the sim
          // host: only drive the active unit if the active team is host-owned
          return ok && self._hostControlsActive();
        };
      }
      if (!this._origFireCharged && CA.Weapons && typeof CA.Weapons.fireCharged === 'function'){
        this._origFireCharged = CA.Weapons.fireCharged.bind(CA.Weapons);
        CA.Weapons.fireCharged = function(u, wid, power){
          if (self.isOnline() && self._started && self.isClient()){
            // forward intent instead of firing locally
            self._forwardFire(u, wid, power);
            return;
          }
          return self._origFireCharged(u, wid, power);
        };
      }
      // CLIENT jump override: the on-screen MOBILE jump button (ui.js) calls
      // CA.Entities.jump directly. On the client we must NOT hop the unit locally
      // (the host owns its position); forward a jump INTENT instead. Desktop jump
      // is handled by the keyboard shim below; both end up as { jump:true }.
      if (!this._origJump && CA.Entities && typeof CA.Entities.jump === 'function'){
        this._origJump = CA.Entities.jump.bind(CA.Entities);
        CA.Entities.jump = function(u){
          if (self.isOnline() && self._started && self.isClient()){
            if (self._mineActive()) self.sendInput({ jump:true });
            return;
          }
          return self._origJump(u);
        };
      }
      // CLIENT fire/jump shim: because the client's canControl() is false (the
      // sim is frozen), core's own fire/jump handlers never run. We install our
      // OWN listeners so the client can charge & release a shot / jump on its
      // turn, all funnelled into forwarded INTENTS. Installed once, gated inside.
      if (!this._cliShimBound){
        this._cliShimBound = true;
        const active = ()=> self.isOnline() && self._started && self.isClient() && self._mineActive()
          && (CA.state.phase===CA.TurnPhase.AIM || CA.state.phase===CA.TurnPhase.RETREAT);
        const fireKey = ()=> (CA.settings && CA.settings.keymap && CA.settings.keymap.fire) || 'Enter';
        const jumpKey = ()=> (CA.settings && CA.settings.keymap && CA.settings.keymap.jump) || 'Space';
        // keyboard charge (hold fire key) -> release fires
        window.addEventListener('keydown', (e)=>{
          if (!active()) return;
          if (e.code === fireKey()){ self._cliCharging = true; e.preventDefault(); }
          else if (e.code === jumpKey()){ self.sendInput({ jump:true }); e.preventDefault(); }
        }, true);
        window.addEventListener('keyup', (e)=>{
          if (e.code === fireKey() && self._cliCharging){ self._releaseClientFire(); }
        }, true);
        // mouse charge (desktop): hold LMB on the canvas to charge, release to fire
        const cv = CA.canvas || document.querySelector('canvas');
        const isTouchDev = ('ontouchstart' in window) || (navigator.maxTouchPoints>0);
        if (cv && !isTouchDev){
          cv.addEventListener('mousedown', (e)=>{
            if (e.button!==0 || !active()) return;
            // don't start a shot when tapping a HUD/weapon button
            if (CA.UI && CA.UI.isUIHit && CA.UI.isUIHit(CA.state.input.mouseX, CA.state.input.mouseY)) return;
            self._cliCharging = true;
          }, true);
          cv.addEventListener('mouseup', (e)=>{ if (e.button===0 && self._cliCharging) self._releaseClientFire(); }, true);
        }
        // TOUCH charge (mobile guest): core's native touch FIRE button is gated by
        // canControl() (false on the client) and core's power ramp is paused, so a
        // mobile guest otherwise can't fire. We add our own: pressing the PLAY AREA
        // (not a HUD/weapon/▲▼/◀▶ button) charges; releasing fires — funnelled into
        // the same forwarded intent as desktop. Aiming on mobile uses the ▲▼ touch
        // buttons, which set S.input.up/down and are forwarded by the input pump.
        if (cv && isTouchDev){
          cv.addEventListener('pointerdown', (e)=>{
            if (e.pointerType==='mouse' || !active()) return;
            const r = cv.getBoundingClientRect();
            const sx = (e.clientX-r.left)*(cv.width/r.width);
            const sy = (e.clientY-r.top)*(cv.height/r.height);
            if (CA.UI && CA.UI.isUIHit && CA.UI.isUIHit(sx, sy)) return; // let HUD/move/aim buttons work
            self._cliCharging = true;
          }, true);
          const endTouch = (e)=>{ if (e.pointerType!=='mouse' && self._cliCharging) self._releaseClientFire(); };
          cv.addEventListener('pointerup', endTouch, true);
          cv.addEventListener('pointercancel', endTouch, true);
        }
      }
    },

    // client: release the charged shot -> forward fire intent via fireCharged
    _releaseClientFire(){
      const S = CA.state;
      this._cliCharging = false;
      const u = CA.activeUnit();
      const pow = this._cliPower || 0.05;
      this._cliPower = 0; S.charging = false; S.power = 0;
      if (u && CA.Weapons && CA.Weapons.fireCharged){
        CA.Weapons.fireCharged(u, S.selectedWeapon, pow); // overridden -> forwards intent
      }
    },
    _removeControlGates(){
      if (this._origCanControl){ CA.canControl = this._origCanControl; this._origCanControl = null; }
      if (this._origFireCharged && CA.Weapons){ CA.Weapons.fireCharged = this._origFireCharged; this._origFireCharged = null; }
      if (this._origJump && CA.Entities){ CA.Entities.jump = this._origJump; this._origJump = null; }
    },

    // host: is the currently-active team owned by the host player?
    _hostControlsActive(){
      const S = CA.state; const team = S.teams[S.currentTeamIdx];
      return !!team && this._isHostTeam(team.id);
    },

    _isHostTeam(teamId){
      // Host owns its own team AND acts as authority; remote-owned teams are
      // driven by their client's forwarded input. For the host's LOCAL control
      // gate we only let it steer the team(s) the host player owns.
      const me = this._players.find(p=>p.isHost);
      return !!(me && me.teamId === teamId);
    },

    /* ----- host: apply a client's forwarded input onto the live unit -----
     * Strictly authority-checked: the input is applied ONLY if it comes from the
     * player who owns the team whose turn it currently is. Anything else (a
     * client trying to act out of turn, or to move the opponent's unit) is
     * silently dropped — this is what makes the model host-authoritative. */
    _applyRemoteInput(msg){
      const S = CA.state;
      if (!this._started) return;
      const team = S.teams[S.currentTeamIdx];
      if (!team) return;
      // only accept input from the player who owns the ACTIVE team
      const ownerId = this._teamOwners && this._teamOwners[team.id];
      if (ownerId == null || ownerId !== msg.id) return;
      // and only while the active unit can actually act this turn
      if (this._origCanControl && !this._origCanControl()) {
        // still allow an explicit endTurn through so a client can pass
        if (msg.input && msg.input.endTurn && CA.endTurn) CA.endTurn();
        return;
      }
      const u = CA.activeUnit(); if (!u || !u.alive) return;
      const inp = msg.input || {};
      // weapon select first (so a fire in the same packet uses the right weapon)
      if (inp.weapon){ S.selectedWeapon = inp.weapon; }
      // aim / facing are owned by the controlling client
      if (typeof inp.aimAngle === 'number') u.aimAngle = inp.aimAngle;
      if (typeof inp.facing === 'number') u.facing = inp.facing;
      // movement (client sends a walk direction each tick while a key/button held)
      if ((inp.walk === -1 || inp.walk === 1) && CA.Entities && CA.Entities.walk){
        if ((S._moveBudget||0) > 0){
          const bx = u.x;
          CA.Entities.walk(u, inp.walk);
          S._moveBudget -= Math.abs(u.x - bx);
        }
      }
      // jump is edge-triggered by the client (sent once per press)
      if (inp.jump && CA.Entities && CA.Entities.jump){ CA.Entities.jump(u); }
      // mirror the client's live charge so the host's power bar / state matches
      if (typeof inp.power === 'number'){ S.power = inp.power; }
      if (typeof inp.charging === 'boolean'){ S.charging = inp.charging; }
      // FIRE — host fires authoritatively using the host's real fireCharged
      if (inp.fire && this._origFireCharged){
        S.charging = false;
        this._origFireCharged(u, S.selectedWeapon, (typeof inp.power==='number'?inp.power:0.6));
        S.power = 0;
      }
      if (inp.endTurn && CA.endTurn){ CA.endTurn(); }
    },

    /* ----- client: forward a fire intent to the host (instead of firing) ----- */
    _forwardFire(u, wid, power){
      this.sendInput({
        fire:true,
        weapon: wid || (CA.state && CA.state.selectedWeapon),
        power: (typeof power==='number') ? power : (CA.state ? CA.state.power : 0.6),
        aimAngle: u ? u.aimAngle : 0,
        facing: u ? u.facing : 1,
      });
      // reset the client's local charge display
      this._cliCharging = false; this._cliPower = 0;
      if (CA.state){ CA.state.charging = false; CA.state.power = 0; }
    },

    /* ----- client: replay a host explosion (terrain carve + FX + shake + sfx).
     * We do NOT re-apply damage here (unit HP comes authoritatively from snaps);
     * we only reproduce the deterministic visuals so the client SEES the shot. */
    _replayExplosion(m){
      try{
        if (CA.Terrain && CA.Terrain.destroy) CA.Terrain.destroy(m.x, m.y, m.r);
        if (CA.state) CA.state.camera.shake = Math.min(28, (CA.state.camera.shake||0) + m.r*0.25);
        if (CA.events){
          CA.events.emit('explosion', m.x, m.y, m.r, m.d||0); // FX listens -> particles
          CA.events.emit('sfx', m.r > 55 ? 'boom_big' : 'boom');
        }
      }catch(_){}
    },

    /* ----- client: replay a host "fired" cue (muzzle sfx + unit quip) ----- */
    _replayFired(m){
      try{
        const u = m.uid!=null ? CA.getUnit(m.uid) : null;
        if (CA.events){ CA.events.emit('fired', u, { id:m.wid }); CA.events.emit('sfx','fire'); }
      }catch(_){}
    },

    /* ----- client: send my intent for my turn to the host ----- */
    sendInput(input){
      if (!this.isClient() || !this._started) return;
      this._send({ t:'input', id:this._selfId, input });
    },

    /* ============================ HOST SNAPSHOTS ============================
     * The host serializes the bits a client needs to RENDER the world faithfully
     * and broadcasts them. Turn-based => we only need a modest rate; we push
     * every few frames while anything is moving, and once on each turn change.
     * ===================================================================== */
    _snapshot(){
      const S = CA.state;
      return {
        f: S.frame,
        mode: S.mode, phase: S.phase,
        cti: S.currentTeamIdx, aid: S.activeUnitId,
        wind: S.wind, water: S.waterLevel, turn: Math.round(S.turnTimer*10)/10,
        winner: S.winnerTeamId,
        sw: S.selectedWeapon, pw: Math.round((S.power||0)*100)/100, ch: !!S.charging,
        u: S.units.map(u=>[u.id, Math.round(u.x), Math.round(u.y), Math.round(u.hp),
                           u.alive?1:0, u.facing, Math.round(u.aimAngle*100)/100, u.teamId]),
        p: S.projectiles.filter(p=>p.alive).map(p=>[p.id, p.weaponId, Math.round(p.x), Math.round(p.y),
                           Math.round(p.vx*10)/10, Math.round(p.vy*10)/10, p.r||4]),
      };
    },

    _applySnapshot(s){
      const S = CA.state;
      if (!s) return;
      this._lastSnapAt = Date.now();   // for the client's "host sync" indicator
      // never let a stale snapshot move time backwards (out-of-order delivery)
      if (this._lastSnap && typeof s.f === 'number' && typeof this._lastSnap.f === 'number'
          && s.f < this._lastSnap.f) return;
      this._lastSnap = s;
      // turn / world scalars — the host is the single source of truth
      S.currentTeamIdx = s.cti; S.activeUnitId = s.aid;
      S.wind = s.wind; S.waterLevel = s.water; S.turnTimer = s.turn;
      S.phase = s.phase; S.mode = s.mode; S.winnerTeamId = s.winner;
      // weapon: keep the client's own selection authoritative-locally while it is
      // OUR turn (we forward the change to the host; the snapshot would otherwise
      // echo a stale weapon for a frame and flicker the HUD).
      if (s.sw && !this._mineActive()) S.selectedWeapon = s.sw;
      // power bar / aim. On the CLIENT, the unit we are CURRENTLY controlling on
      // OUR turn is locally PREDICTED (we set its aim/facing/power from local
      // input each frame and forward the intent). Re-applying the ~RTT-old echoed
      // snapshot onto that unit is what made aiming feel "stuck/jittery" (bug #3),
      // so we SKIP the locally-controlled unit here and trust local prediction;
      // the host stays authoritative for everything else (incl. firing).
      const ownId = this._predictedUnitId();   // unit this client predicts, or null
      if (ownId == null){                       // not predicting -> host owns power
        S.power = (typeof s.pw==='number') ? s.pw : S.power;
        S.charging = !!s.ch;
      }
      // units (match by id; host & client share ids because of identical seed)
      if (Array.isArray(s.u)){
        for (const row of s.u){
          const u = CA.getUnit(row[0]); if (!u) continue;
          // ALWAYS take authoritative position/hp/alive from the host so shots,
          // damage, deaths and terrain-driven displacement appear on the client.
          u.x=row[1]; u.y=row[2]; u.hp=row[3]; u.alive=!!row[4];
          // aim/facing: skip ONLY the unit we are locally predicting on our turn,
          // so the client's live aim isn't clobbered by the stale echo. For every
          // other unit (the opponent's, AI's, idle ones) the host is the truth.
          if (row[0] !== ownId){ u.facing=row[5]; u.aimAngle=row[6]; }
          u.vx=0; u.vy=0; u.grounded=true; // client doesn't simulate; freeze physics
        }
      }
      // projectiles — rebuild the live set as simple render-only sprites
      if (Array.isArray(s.p)){
        S.projectiles.length = 0;
        for (const row of s.p){
          S.projectiles.push({ id:row[0], weaponId:row[1], ownerId:null,
            x:row[2], y:row[3], vx:row[4], vy:row[5], r:row[6],
            affectedByWind:false, fuse:null, bounce:0, spriteRot:0, alive:true, data:{} });
        }
      }
      bus.emit('stateSync', s);
    },

    /* HOST → CLIENT authoritative unit NAMES. Names are generated locally from the
     * seed, but CA.rosterOf() is LANGUAGE-dependent (HU vs EN/…), so two players in
     * different languages got different names (Jani: "a nevek sem jók"). The host
     * broadcasts its id→name map once the match begins; clients adopt it. */
    _applyNames(list){
      if (!Array.isArray(list)) return;
      for (const row of list){
        const u = CA.getUnit(row[0]); if (u && row[1]) u.name = row[1];
      }
      bus.emit('namesSync', list);
    },
    _broadcastNames(){
      try{
        const list = (CA.state.units||[]).map(u=>[u.id, u.name]);
        this._broadcast({ t:'names', n:list });
      }catch(_){}
    },

    /* ===================== HOOKS INTO THE GAME LOOP =====================
     * We cannot edit core.js, so we piggy-back on CA.events + a light rAF tick.
     *  • HOST: every frame, throttle-broadcast a snapshot so clients mirror it.
     *  • CLIENT: continuously re-apply the latest snapshot so the local loop
     *    (which still runs) can't diverge from host truth; suppress local AI by
     *    having all online teams be isAI:false and gating control via isMyTurn.
     * =================================================================== */
    _bindHooks(){
      if (this._hostBound) return; this._hostBound = true;

      // Snapshot pump (host) + freeze/forward pump (client). Driven off rAF so it
      // tracks the render loop without touching core.
      const tick = ()=>{
        try{
          if (this._role && this._started){
            if (this.isHost()){
              this._snapAccum++;
              // push every frame while things move OR while a REMOTE client is on
              // turn (so their forwarded aim/move/charge echoes back instantly and
              // never feels "stuck"); sparsely while idle on the host's own turn.
              const moving = CA.state.projectiles.some(p=>p.alive) ||
                             CA.state.units.some(u=>u.alive && (Math.abs(u.vx)>0.2||Math.abs(u.vy)>0.2));
              const remoteTurn = !this._hostControlsActive();
              const every = (moving || remoteTurn) ? 1 : 8;
              if (this._snapAccum >= every){ this._snapAccum = 0; this._broadcast({ t:'snap', s:this._snapshot() }); }
              // DESYNC INSURANCE — periodic AUTHORITATIVE heartbeat. Independent of
              // the throttle above: even on a fully idle board (host's own turn, no
              // motion) we re-broadcast the full state at least ~once/sec. Snapshots
              // are already full-state, so one received heartbeat resynchronises a
              // client that somehow missed an earlier frame (out-of-order/late
              // delivery). Cheap (turn-based, low rate) and never moves time
              // backwards on the client (guarded by snapshot frame ordering).
              this._hbAccum = (this._hbAccum||0) + 1;
              if (this._hbAccum >= 60){ this._hbAccum = 0;
                if (every !== 1) this._broadcast({ t:'snap', s:this._snapshot() }); }
            } else if (this.isClient()){
              // CLIENT IS A PURE MIRROR: never simulate locally. Freezing the
              // local sim (S.paused) means core's step() applies no movement,
              // physics, projectiles, turn timer or fire — so the client can
              // never move any unit (its own or the opponent's). It only renders
              // the host's snapshots and forwards its INTENTS.
              if (CA.state) CA.state.paused = true;
              if (this._lastSnap) this._applySnapshot(this._lastSnap);
              this._captureAndForwardClientInput();
              this._clientCameraFollow();
              // SYNC WATCHDOG: if the host's snapshots stop arriving the board
              // silently freezes with locally-generated (often wrong) state. Turn
              // that mystery into a clear, recoverable signal (Jani MP-teszt).
              const since = Date.now() - (this._lastSnapAt || 0);
              if (since > 4000 && !this._syncWarned){
                this._syncWarned = true;
                try{ CA.events.emit('toast', CA.t('⚠ Nincs adat a hosttól — a kapcsolat megszakadhatott.')); }catch(_){}
              } else if (since < 1500 && this._syncWarned){
                this._syncWarned = false;   // data resumed
              }
            }
          }
        }catch(_){}
        requestAnimationFrame(tick);
      };
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(tick);

      if (CA.events){
        // HOST: relay every explosion + fire so clients reproduce the visuals.
        CA.events.on('explosion', (x,y,r,d)=>{
          if (this.isHost() && this._started) this._broadcast({ t:'fx', x:Math.round(x), y:Math.round(y), r:Math.round(r), d:Math.round(d||0) });
        });
        CA.events.on('fired', (unit, weapon)=>{
          if (this.isHost() && this._started){
            this._broadcast({ t:'fired', uid: unit?unit.id:null, wid: weapon?weapon.id:null });
            // push a snapshot right away so clients see the projectile spawn fast
            this._broadcast({ t:'snap', s:this._snapshot() });
          }
        });
        // HOST: a TURN HANDOFF is the single most important state change to deliver
        // reliably — if a client misses it, it would keep predicting the wrong unit
        // or think it's still its turn. Throttling can delay it, so on every
        // turnStart we BURST a fresh authoritative snapshot immediately (and reset
        // the throttle accumulator so the next pump frame also pushes). This makes
        // the handoff crisp on the guest even on a quiet board. (Reliable-ordered
        // WebRTC/BroadcastChannel rarely drop, but this removes the throttle delay.)
        CA.events.on('turnStart', ()=>{
          if (this.isHost() && this._started){
            this._snapAccum = 0;
            this._broadcast({ t:'snap', s:this._snapshot() });
          }
        });
        // HOST: MATCH END is equally critical — push a final authoritative snapshot
        // so the guest reliably sees the winner/GAME_OVER even if the last regular
        // snapshot was throttled or in flight.
        CA.events.on('gameOver', ()=>{
          if (this.isHost() && this._started){
            this._snapAccum = 0;
            this._broadcast({ t:'snap', s:this._snapshot() });
          }
        });
        // CLIENT: the "End turn" button calls CA.endTurn() which emits turnEnd;
        // forward it as a pass intent (the local turnEnd is cosmetic — paused).
        CA.events.on('turnEnd', ()=>{
          if (this.isOnline() && this.isClient() && this._started && this._mineActive()) this.sendInput({ endTurn:true });
        });
        // OPPONENT LEFT mid-match → END the match (Jani: a HOST eddig csak ment
        // tovább, ha a joiner kilépett). A maradó játékos nyer (az ellenfél feladta);
        // a kliens-oldal is lezár, ha a HOST tűnt el. CSAK élő online meccs alatt.
        bus.on('opponentLeft', ()=>{
          try{
            if (!this._role || !this._started) return;
            const S = CA.state;
            if (!S || S.mode !== CA.GameState.PLAYING) return;
            // a saját (helyi) csapat nyer; ha valamiért nincs, döntetlen
            let winId = (this._myTeamIds && this._myTeamIds.length) ? this._myTeamIds[0] : null;
            // ha nincs saját élő egységünk, inkább a még élő csapat nyerjen
            if (winId == null && S.teams && S.teams.length){ winId = S.teams[0] && S.teams[0].id; }
            S.mode = CA.GameState.GAME_OVER;
            S.winnerTeamId = winId;
            this._started = false;
            try{ CA.events.emit('toast', CA.t('Az ellenfél kilépett.')); }catch(_){}
            CA.events.emit('gameOver', winId);
          }catch(_){}
        });
      }
    },

    /* ----- client: read local input INTENTS and forward to the host -----
     * Direction/aim keys & mobile buttons set S.input.* regardless of canControl,
     * and the mouse position is always tracked, so we can build a faithful intent
     * even though the local sim is frozen. We only forward on OUR turn. */
    _captureAndForwardClientInput(){
      const S = CA.state;
      if (!this._mineActive()) {  // not our turn -> make sure nothing is "held"
        this._cliCharging = false; this._cliPower = 0; this._cliJumpLatch = false;
        this._cliLastWeapon = null;  // re-sync weapon on our next turn
        return;
      }
      // is the active unit allowed to act this turn (aim/retreat phase)?
      const canAct = (S.phase === CA.TurnPhase.AIM || S.phase === CA.TurnPhase.RETREAT);
      const u = CA.activeUnit();
      if (!u || !u.alive || !canAct) return;

      const inp = {};
      // walk direction (held)
      if (S.input.left && !S.input.right) inp.walk = -1;
      else if (S.input.right && !S.input.left) inp.walk = 1;
      // aim: prefer mouse on desktop (tracked even while paused), else W/S keys
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints>0);
      const cw = CA.Weapons && CA.Weapons.currentWeapon && CA.Weapons.currentWeapon();
      if (!isTouch && cw && cw.power && typeof S.input.mouseWorldX === 'number'){
        const dx = S.input.mouseWorldX - u.x, dy = S.input.mouseWorldY - (u.y-8);
        inp.facing = dx>=0 ? 1 : -1;
        inp.aimAngle = Math.max(-Math.PI/2, Math.min(Math.PI/2, Math.atan2(-dy, Math.abs(dx))));
      } else {
        // keyboard / mobile aim nudge
        let a = u.aimAngle;
        if (S.input.up)   a = Math.min(Math.PI/2, a + 0.03);
        if (S.input.down) a = Math.max(-Math.PI/2, a - 0.03);
        if (a !== u.aimAngle) inp.aimAngle = a;
      }
      // LOCAL PREDICTION: write the chosen aim/facing straight onto our active
      // unit so it turns/aims INSTANTLY (no waiting for the host's echo). The
      // snapshot apply now skips this unit (see _predictedUnitId), so this is the
      // visible truth on our screen until the host confirms — eliminates the
      // "aim stuck / can't adjust on my turn" bug (#3). Walk is NOT predicted
      // (it has a server-side move budget); we let the authoritative x stream in.
      if (typeof inp.facing === 'number') u.facing = inp.facing;
      if (typeof inp.aimAngle === 'number') u.aimAngle = inp.aimAngle;
      // weapon: only forward when it actually changed (avoids idle spam)
      if (S.selectedWeapon && S.selectedWeapon !== this._cliLastWeapon){
        inp.weapon = S.selectedWeapon; this._cliLastWeapon = S.selectedWeapon;
      }
      // (jump is edge-triggered separately by the client fire/jump shim, which
      //  sends { jump:true } once per press — see _installControlGates.)

      // charge handling: the local sim is frozen (paused) so core's fire button
      // can't charge. Our own shim sets _cliCharging while the fire key/LMB is
      // held; we ramp the power here and forward it so the host's power matches.
      if (this._cliCharging){
        this._cliPower = Math.min(1, this._cliPower + 0.018);
        S.charging = true; S.power = this._cliPower;  // drive the local power bar
        inp.charging = true; inp.power = this._cliPower;
      }

      // throttle: send every ~2 frames, or immediately when there's a discrete
      // change worth pushing (keeps bandwidth low, latency tiny on LAN/P2P).
      this._inputAccum = (this._inputAccum||0) + 1;
      const hasIntent = ('walk' in inp) || ('aimAngle' in inp) || ('charging' in inp) || ('weapon' in inp);
      if (hasIntent && this._inputAccum >= 2){ this._inputAccum = 0; this.sendInput(inp); }
    },

    /* client: drive the camera ourselves. core's updateCamera() lives inside
     * step(), which we skip via S.paused, so without this the client's view would
     * freeze. Follow a live projectile if any, else the active unit. */
    _clientCameraFollow(){
      const S = CA.state; if (!S || !CA.focusCamera) return;
      let tx=null, ty=null;
      const liveP = S.projectiles.filter(p=>p.alive);
      if (liveP.length){ const p = liveP[liveP.length-1]; tx=p.x; ty=p.y; }
      else { const u = CA.activeUnit(); if (u){ tx=u.x; ty=u.y; } }
      if (tx==null) return;
      CA.focusCamera(tx, ty);   // sets camera.targetX/targetY (clamped)
      const cam = S.camera;
      cam.x += (cam.targetX - cam.x) * 0.12;
      cam.y += (cam.targetY - cam.y) * 0.12;
      if (cam.shake>0) cam.shake = Math.max(0, cam.shake - 0.9);
    },

    // is the currently-active team owned by THIS (client) peer?
    _mineActive(){
      const S = CA.state; const team = S.teams[S.currentTeamIdx];
      return !!team && this._myTeamIds.indexOf(team.id) >= 0;
    },

    /* Which unit (id) does THIS client locally PREDICT this frame?
     * Only the active unit, only on OUR turn, only in an actionable phase. When
     * this returns a non-null id, _applySnapshot leaves that unit's aim/facing/
     * power alone (local prediction wins) so aiming is smooth and never "stuck".
     * Returns null otherwise (host fully authoritative — incl. on turn handover,
     * so the first snapshot of our turn seeds a clean aim before we touch it). */
    _predictedUnitId(){
      if (!this.isOnline() || !this.isClient() || !this._started) return null;
      if (!this._mineActive()) return null;
      const S = CA.state;
      if (S.phase !== CA.TurnPhase.AIM && S.phase !== CA.TurnPhase.RETREAT) return null;
      const u = CA.activeUnit();
      return (u && u.alive) ? u.id : null;
    },

    /* ---------------- message routing ---------------- */
    _onHostMessage(m){
      if (!m || !m.t) return;
      switch(m.t){
        case 'join': {
          let p = this._players.find(x=>x.id===m.id);
          if (!p){
            // MAX PLAYERS cap (2–4): once the room is full, a newcomer joins as a
            // SPECTATOR (watch-only) instead of being rejected outright.
            const playing = this._players.filter(x=>!x.spectator).length;
            const full = playing >= this.maxPlayers();
            const asSpec = !!m.spectator || full;
            p = { id:m.id, name:m.name||'Játékos', ready:!!asSpec, isHost:false, teamId:null, spectator:asSpec, species:m.species||null };
            this._players.push(p); bus.emit('playerJoined', p);
          }
          else { p.name = m.name||p.name; if (m.spectator!=null) p.spectator = !!m.spectator; if (m.species) p.species = m.species; }
          // a guest is now present -> the host room is connected (covers the
          // cross-tab/relay transports where there is no WebRTC onConnected).
          this._setStatus('connected');
          this._broadcastRoster();
          // bring the newcomer up to date with the current room config
          this._broadcast({ t:'cfg', cfg:this.roomConfig });
          break;
        }
        case 'ready': {
          const p = this._players.find(x=>x.id===m.id); if (p){ p.ready = !!m.ready; this._broadcastRoster(); }
          break;
        }
        case 'species': {
          const p = this._players.find(x=>x.id===m.id); if (p && m.species){ p.species = String(m.species); this._broadcastRoster(); }
          break;
        }
        case 'chat': {
          // re-broadcast so all OTHER clients see it; emit locally for the host UI
          this._broadcast(m);
          if (CA.events) CA.events.emit('net:chat', { name:m.name||'?', text:m.text||'', self:false });
          break;
        }
        case 'leave': {
          const i = this._players.findIndex(x=>x.id===m.id);
          if (i>=0){ const [gone]=this._players.splice(i,1); bus.emit('playerLeft', gone); this._broadcastRoster();
            bus.emit('opponentLeft', gone);
            // back to waiting if no non-spectator guests remain.
            const others = this._players.filter(x=>!x.isHost && !x.spectator);
            if (!others.length) this._setStatus('waiting', CA.t('Az ellenfél kilépett.'));
          }
          break;
        }
        case 'emote': {
          // re-broadcast so all OTHER clients see it; emit locally for the host UI
          this._broadcast(m);
          if (CA.events) CA.events.emit('net:emote', { name:m.name||'?', emoji:m.emoji||'', self:false });
          break;
        }
        case 'input': this._applyRemoteInput(m); break;
      }
    },

    _onClientMessage(m){
      if (!m || !m.t) return;
      switch(m.t){
        case 'roster': this._players = m.players||[]; bus.emit('roster', this.players()); break;
        case 'cfg':    this.roomConfig = Object.assign({}, this.roomConfig, m.cfg||{});
                       if (CA.events) CA.events.emit('net:roomcfg', this.roomConfig);
                       bus.emit('roomConfig', this.roomConfig); break;
        case 'chat':
          // ignore the echo of my own line (I already showed it as self:true)
          if (m.id !== this._selfId && CA.events) CA.events.emit('net:chat', { name:m.name||'?', text:m.text||'', self:false });
          break;
        case 'emote':
          // ignore the echo of my own emote (I already showed it as self:true)
          if (m.id !== this._selfId && CA.events) CA.events.emit('net:emote', { name:m.name||'?', emoji:m.emoji||'', self:false });
          break;
        case 'start':
          // a 'start' arriving while we're already in a match is a host REMATCH;
          // surface it so the UI can react, then re-begin with the fresh payload.
          if (this._started && CA.events){ try{ CA.events.emit('net:rematch', {}); }catch(_){} }
          this._beginMatch(m, false);
          break;
        case 'snap':   this._lastSnapAt = Date.now(); this._applySnapshot(m.s); break;
        case 'names':  this._applyNames(m.n); break;
        case 'fx':     this._replayExplosion(m); break;
        case 'fired':  this._replayFired(m); break;
        case 'leave':
          if (m.id){
            const gone = this._players.find(x=>x.id===m.id);
            const i=this._players.findIndex(x=>x.id===m.id); if(i>=0) this._players.splice(i,1);
            bus.emit('roster', this.players());
            // the HOST leaving (or our last opponent) tears the room down for us.
            if (gone && gone.isHost){ this._setStatus('closed', CA.t('Az ellenfél kilépett.')); bus.emit('opponentLeft', gone); }
          }
          break;
      }
    },

    _broadcastRoster(){
      // strip private helpers; ship a clean roster (incl. each player's chosen
      // species + spectator flag so every peer's lobby shows the same line-up).
      const clean = this._players.map(p=>({ id:p.id, name:p.name, ready:!!p.ready, isHost:!!p.isHost, teamId:p.teamId, species:p.species||null, spectator:!!p.spectator }));
      this._broadcast({ t:'roster', players:clean });
      bus.emit('roster', this.players());
    },

    /* ---------------- transport plumbing ---------------- */
    _makeTransport(){
      const f = this.transports[this.transportName] || this.transports.broadcast;
      return f();
    },
    _wireWebrtcSignal(t){
      if (t instanceof WebRTCTransport){
        this.webrtcSignal = { localKind:null, localBlob:'', stage: this.isHost()?'creating-offer':'waiting-offer' };
        t._onLocalDesc = (kind, blob)=>{
          this.webrtcSignal.localKind = kind;
          this.webrtcSignal.localBlob = blob;
          this.webrtcSignal.stage = (kind==='offer') ? 'offer-ready' : 'answer-ready';
          bus.emit('signal', kind, blob);
        };
        t.onClosed = ()=> bus.emit('error', 'A kapcsolat megszakadt.');
      }
    },
    // Lobby calls these for WebRTC manual signaling:
    webrtcAcceptOffer(blob){ if (this._t instanceof WebRTCTransport){ this.webrtcSignal.stage='answering'; return this._t.acceptOffer(blob); } },
    webrtcAcceptAnswer(blob){ if (this._t instanceof WebRTCTransport){ this.webrtcSignal.stage='connecting'; return this._t.acceptAnswer(blob); } },

    _send(msg){ if (this._t) this._t.send(msg); },
    _broadcast(msg){ if (this._t) this._t.send(msg); }, // star topology: send == fan-out

    _teardownTransport(){ if (this._t){ try{ this._t.close(); }catch(_){} this._t=null; } },

    _genCode(){
      const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s='';
      for (let i=0;i<4;i++) s += A[Math.floor(Math.random()*A.length)];
      return s;
    },
  };

  CA.Net = Net;

  // Self-init: core.js boot does NOT include 'Net' in its module init list, so
  // we bootstrap ourselves. init() is idempotent and, while offline (no role),
  // the snapshot pump is a guarded no-op — single-player is unaffected.
  try{ Net.init(); }catch(_){}
})();
