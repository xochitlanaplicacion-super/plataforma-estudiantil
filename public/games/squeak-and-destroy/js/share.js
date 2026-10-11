/* ============================================================================
 * CUTE ANIMALS — share.js  ::  CA.Share — shareable gameplay CLIPS + brag cards.
 *
 * Turns the live game canvas into something a player can post: a short WebM
 * clip of the last few seconds of action (via MediaRecorder + captureStream),
 * with a graceful fallback to a static PNG "brag card" everywhere that can't
 * record (iOS Safari etc.). Watermarked with the logo + squeakanddestroy.com +
 * room/seed when available.
 *
 * DESIGN RULES (matches the rest of the codebase):
 *   - Vanilla JS, CA.* namespace, ES5-ish but runs in the browser only (this
 *     file is NOT deployed to the PHP 5.6 server as PHP; node --check must pass).
 *   - Feature-detect EVERYTHING. NEVER throw if an API is missing — every public
 *     method is wrapped in try/catch and degrades silently.
 *   - i18n via CA.t() with HU keys; EN registered through CA.i18n.addEN().
 *   - Mirrors ui.js shareScreenshot()'s proven share-sheet / download path.
 *
 * PUBLIC API (the integrator wires a button + build entry to these):
 *   CA.Share.init(canvas)        -> wire up; safe to call repeatedly. canvas
 *                                   optional (defaults to CA.canvas).
 *   CA.Share.markMoment()        -> flag "something cool just happened" so the
 *                                   exported clip is centered on the action.
 *   CA.Share.exportClip()        -> Promise<{blob,type,ext,name,url}> — a WebM
 *                                   clip if recording is available, else a PNG
 *                                   brag card. Resolves null only if nothing at
 *                                   all could be produced (should be rare).
 *   CA.Share.shareClip()         -> exportClip() then navigator.share (file) /
 *                                   download / open-in-tab. Returns a Promise.
 *   CA.Share.bragCard()          -> Promise<blob|null> — the universal PNG card.
 *   CA.Share.isRecording()       -> bool
 *   CA.Share.canRecord()         -> bool (feature-detect result)
 *   CA.Share.stop()              -> stop + clean up the recorder/stream.
 * ==========================================================================*/
(function(){
  'use strict';
  if (!window.CA) window.CA = {};
  if (CA.Share) return;   // already loaded (idempotent)

  var t = function(s){ try{ return (CA.t ? CA.t(s) : s); }catch(_){ return s; } };

  /* ---- EN strings for the share UI / watermark ---- */
  try{ if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    '🎬 Klip megosztása':'🎬 Share clip',
    'Klip mentve':'Clip saved',
    'Animal Battle Ground klip':'Animal Battle Ground clip',
    '🏆 Nézd a meccsemet!':'🏆 Watch my match!',
    'Szoba':'Room', 'Mag':'Seed', 'Pont':'Score', 'Fegyver':'Weapon',
    '🏆 Oszd meg a meccsed!':'🏆 Share your match!',
    'Mentsd a képeidhez, vagy oszd meg — ':'Save it to your photos, or share it — ',
    '💾 Mentés':'💾 Save', '📤 Megosztás':'📤 Share', 'Bezár':'Close',
    'Megosztás előkészítése…':'Preparing share…',
    // virality: the "challenge me" deep-link appended to every off-portal share
    '⚔️ Hívd ki te is: ':'⚔️ Your turn: '
  }); }catch(_){}

  var SITE = 'squeakanddestroy.com';
  var CLIP_MS = 5000;             // target rolling window length (~5s)
  var TIMESLICE = 1000;          // emit a chunk each second -> small ring buffer
  var FPS = 30;

  /* --------------------------------------------------------------------------
   * Feature detection. Recording needs canvas.captureStream + MediaRecorder
   * + a supported WebM mime. iOS Safari typically fails one of these -> PNG.
   * ------------------------------------------------------------------------*/
  function pickMime(){
    try{
      if (typeof MediaRecorder === 'undefined') return null;
      var cands = ['video/webm;codecs=vp9','video/webm;codecs=vp8',
                   'video/webm','video/mp4'];
      for (var i=0;i<cands.length;i++){
        try{ if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(cands[i])) return cands[i]; }catch(_){}
      }
    }catch(_){}
    return null;
  }

  function canRecord(canvas){
    try{
      var cv = canvas || CA.canvas;
      if (!cv || typeof cv.captureStream !== 'function') return false;
      if (typeof MediaRecorder === 'undefined') return false;
      return !!pickMime();
    }catch(_){ return false; }
  }

  /* --------------------------------------------------------------------------
   * Module state.
   * ------------------------------------------------------------------------*/
  var _canvas = null;
  var _stream = null;
  var _rec = null;
  var _mime = null;
  var _ext = 'webm';
  var _chunks = [];        // ring buffer of {data, t} recent encoded blobs
  var _recording = false;
  var _momentT = 0;        // timestamp of the last markMoment()
  var _inited = false;
  var _menuWatch = null;   // interval that stops the recorder if we leave a match for the MENU

  function now(){ return (window.performance && performance.now) ? performance.now() : Date.now(); }

  /* Trim the chunk ring so it only keeps roughly the last CLIP_MS of footage
   * (plus one slice of slack). Keeps memory + export size tiny on long matches. */
  function trimRing(){
    try{
      var cutoff = now() - (CLIP_MS + TIMESLICE * 2);
      // NEVER drop chunk 0 — it carries the WebM/MP4 init segment (EBML header);
      // shifting it off on matches longer than the ring produced a corrupt,
      // unplayable export. Trim from index 1 and prepend the header on export.
      while (_chunks.length > 2 && _chunks[1].t < cutoff) _chunks.splice(1, 1);
    }catch(_){}
  }

  /* --------------------------------------------------------------------------
   * Recorder lifecycle. Continuous record with a short timeslice gives us a
   * cheap rolling buffer: each ondataavailable chunk is timestamped and old
   * ones are dropped, so exportClip() concatenates only recent footage.
   * ------------------------------------------------------------------------*/
  function startRecording(){
    if (_recording) return true;
    try{
      var cv = _canvas || CA.canvas;
      if (!canRecord(cv)) return false;
      _mime = pickMime();
      _ext  = (_mime && _mime.indexOf('mp4') >= 0) ? 'mp4' : 'webm';
      _stream = cv.captureStream(FPS);
      var opts = {};
      if (_mime) opts.mimeType = _mime;
      try{ opts.videoBitsPerSecond = 2500000; }catch(_){}
      _rec = new MediaRecorder(_stream, opts);
      _chunks = [];
      _rec.ondataavailable = function(e){
        try{ if (e && e.data && e.data.size > 0){ _chunks.push({ data:e.data, t:now() }); trimRing(); } }catch(_){}
      };
      _rec.onerror = function(){ try{ stop(); }catch(_){} };
      _rec.start(TIMESLICE);
      _recording = true;
      startMenuWatch();   // auto-stop if the player abandons the match to the menu
      return true;
    }catch(_){
      _recording = false;
      try{ if (_stream){ _stream.getTracks().forEach(function(tr){ try{ tr.stop(); }catch(__){} }); } }catch(__){}
      _stream = null; _rec = null;
      return false;
    }
  }

  /* Ask the recorder to flush whatever it has buffered right now (so the
   * exported clip includes footage up to this instant). Resolves when flushed. */
  function flush(){
    return new Promise(function(resolve){
      try{
        if (!_rec || _rec.state === 'inactive'){ resolve(); return; }
        var done = false;
        var fin = function(){ if (done) return; done = true; resolve(); };
        // requestData fires an extra ondataavailable synchronously-ish; give it a tick.
        try{ if (typeof _rec.requestData === 'function'){ _rec.requestData(); } }catch(_){}
        setTimeout(fin, 220);
      }catch(_){ resolve(); }
    });
  }

  function stop(){
    stopMenuWatch();   // tear down the return-to-menu watcher (idempotent; no double-stop)
    try{
      if (_rec && _rec.state !== 'inactive'){ try{ _rec.stop(); }catch(_){} }
    }catch(_){}
    try{
      if (_stream){ _stream.getTracks().forEach(function(tr){ try{ tr.stop(); }catch(__){} }); }
    }catch(_){}
    _rec = null; _stream = null; _recording = false;
  }

  /* --------------------------------------------------------------------------
   * Context probes — all guarded; any of these subsystems may be absent.
   * ------------------------------------------------------------------------*/
  function inMatch(){
    try{ return !!(CA.state && CA.GameState && CA.state.mode === CA.GameState.PLAYING); }catch(_){ return false; }
  }
  // True once the player has LEFT the match for the main menu (abandoned mid-match).
  // GAME_OVER is intentionally EXCLUDED — that path stops the recorder via the
  // 'gameOver' event (which also flushes a final beat). This catches the quit-to-
  // menu case, where no gameOver fires and the recorder would otherwise leak.
  //
  // The 'gauntlet' between-wave DRAFT also parks S.mode at MENU briefly (modes.js
  // gauntlet.onTurnEnd) then resumes the SAME match without re-firing 'gameStart',
  // so we must NOT stop the recorder there — exclude that screen.
  function backInMenu(){
    try{
      if (!(CA.state && CA.GameState && CA.state.mode === CA.GameState.MENU)) return false;
      var scr = (CA.UI && CA.UI.screen) ? CA.UI.screen() : null;
      if (scr === 'gauntlet') return false;   // transient in-run draft, not an abandon
      return true;
    }catch(_){ return false; }
  }
  // While recording, poll for a return-to-menu transition (there is no dedicated
  // event for it) and stop the recorder if so. Cleared in stop() — no double-stop.
  function startMenuWatch(){
    if (_menuWatch) return;
    try{
      _menuWatch = setInterval(function(){
        try{
          if (!_recording){ stopMenuWatch(); return; }
          if (backInMenu()){ stop(); }   // stop() clears _menuWatch + flips _recording
        }catch(_){}
      }, 600);
    }catch(_){ _menuWatch = null; }
  }
  function stopMenuWatch(){
    try{ if (_menuWatch){ clearInterval(_menuWatch); } }catch(_){}
    _menuWatch = null;
  }
  function roomCode(){
    try{ if (CA.Net && CA.Net.isOnline && CA.Net.isOnline() && CA.Net.code) return CA.Net.code() || ''; }catch(_){}
    return '';
  }
  function seedStr(){
    try{
      var s = (CA.state && (CA.state.seed != null ? CA.state.seed : (CA.state.modeData && CA.state.modeData.seed)));
      return (s != null) ? String(s) : '';
    }catch(_){ return ''; }
  }
  function winnerName(){
    try{
      var id = CA.state && CA.state.winnerTeamId;
      if (id == null) return '';
      var team = CA.getTeam ? CA.getTeam(id) : null;
      return team ? (team.name || '') : '';
    }catch(_){ return ''; }
  }
  function scoreStr(){
    try{
      var st = CA.state && CA.state.stats;
      if (st && st.kills){
        var total = 0; for (var k in st.kills){ if (st.kills.hasOwnProperty(k)) total += (st.kills[k]||0); }
        if (total) return String(total);
      }
    }catch(_){}
    return '';
  }
  function weaponName(){
    try{
      var id = CA.state && CA.state.selectedWeapon;
      if (CA.Weapons && CA.Weapons.currentWeapon){ var w = CA.Weapons.currentWeapon(); if (w) return t(w.name || w.id || id); }
      return id ? String(id) : '';
    }catch(_){ return ''; }
  }
  function avatarImg(){
    try{
      var u = CA.activeUnit ? CA.activeUnit() : null;
      var sp = u && CA.speciesOf ? CA.speciesOf(u) : null;
      if (sp && sp.id) return CA.speciesIcon ? CA.speciesIcon(sp.id) : null;
    }catch(_){}
    return null;
  }
  function logoImg(){ try{ return CA.img ? CA.img('assets/logo.png') : null; }catch(_){ return null; } }

  /* --------------------------------------------------------------------------
   * VIRALITY — every shared clip/card is a REFERRAL. Two parts:
   *   1. a watermark URL (the game site), and
   *   2. a "challenge me" deep-link (CA.Challenge ?duel= link) so a viewer can
   *      drop straight into the same kind of match.
   * PORTAL GUARD: Poki / CrazyGames forbid driving traffic off-platform, so on a
   * live portal build we MUST NOT bake a raw external URL into the share. There
   * we fall back to the bare game NAME with no domain / no external deep-link.
   * ------------------------------------------------------------------------*/
  var GAME_NAME = 'Animal Battle Ground';
  function portalActive(){
    try{ return !!(CA.Portal && typeof CA.Portal.active === 'function' && CA.Portal.active()); }catch(_){ return false; }
  }
  // The "challenge me" deep-link for the watermark/share text — EMPTY on a
  // portal build (no off-platform URL allowed there). Guarded; never throws.
  function deepLink(){
    try{
      if (portalActive()) return '';                 // portal forbids external URLs
      if (CA.Challenge && typeof CA.Challenge.dailyShareUrl === 'function'){
        var u = CA.Challenge.dailyShareUrl();
        if (u) return String(u);
      }
    }catch(_){}
    return '';
  }
  // The external label baked into the watermark + share text. On a portal build
  // this is just the game name (no domain); off-portal it is the site URL.
  function shareTag(){ return portalActive() ? GAME_NAME : SITE; }
  // Accompanying share-sheet text: catchphrase + (off-portal) site, plus the
  // deep-link appended so the share itself carries the referral.
  function shareText(){
    var s = t('🏆 Nézd a meccsemet!') + ' ' + shareTag();
    var dl = deepLink();
    if (dl) s += '\n' + t('⚔️ Hívd ki te is: ') + dl;
    return s;
  }

  /* --------------------------------------------------------------------------
   * Watermark — drawn onto an overlay canvas (for the brag card) or composited
   * over a clip's poster. Mirrors ui.js colour scheme (#E8711A / #3D2800).
   * ------------------------------------------------------------------------*/
  function drawWatermark(g, W, H){
    try{
      g.save();
      var pad = Math.round(W * 0.018) + 6;
      var fs  = Math.max(13, Math.round(H * 0.028));
      // bottom strip
      var stripH = fs + pad;
      g.globalAlpha = 0.55;
      g.fillStyle = '#3D2800';
      g.fillRect(0, H - stripH, W, stripH);
      g.globalAlpha = 1;
      var x = pad;
      var lg = logoImg();
      if (lg){
        var lh = stripH - 6, lw = lh * (lg.naturalWidth / Math.max(1, lg.naturalHeight));
        try{ g.drawImage(lg, x, H - stripH + 3, lw, lh); x += lw + 8; }catch(_){}
      }
      g.fillStyle = '#E8711A';
      g.font = '700 ' + fs + 'px system-ui, -apple-system, Arial, sans-serif';
      g.textBaseline = 'middle';
      // Brand label: the site URL off-portal, the bare game name on a portal build
      // (Poki/CrazyGames forbid baking an external domain into shared media).
      g.fillText(shareTag(), x, H - stripH/2);
      // right side: a "challenge me" deep-link badge (off-portal only) so the clip
      // is a referral; falls back to room / seed when no deep-link is available.
      var rc = roomCode(), sd = seedStr();
      var dl = deepLink();
      var tag;
      if (dl){
        // show a compact host form of the deep-link (the full URL is long); the
        // share-sheet TEXT carries the full clickable link.
        var host = dl; try{ host = dl.replace(/^https?:\/\//,'').replace(/\?.*$/,'') + ' ⚔️'; }catch(_){}
        tag = host;
      } else {
        tag = rc ? (t('Szoba') + ' ' + rc) : (sd ? (t('Mag') + ' ' + sd.slice(0,8)) : '');
      }
      if (tag){
        g.textAlign = 'right';
        g.fillStyle = '#ffd9a8';
        g.fillText(tag, W - pad, H - stripH/2);
        g.textAlign = 'left';
      }
      g.restore();
    }catch(_){}
  }

  /* --------------------------------------------------------------------------
   * Brag card — the universal fallback. Composes the current frame + a header
   * (score/weapon/avatar/winner) + watermark onto an offscreen canvas -> PNG.
   * Returns a Promise<Blob|null>.
   * ------------------------------------------------------------------------*/
  function bragCard(){
    return new Promise(function(resolve){
      try{
        var src = _canvas || CA.canvas;
        if (!src || !src.width){ resolve(null); return; }
        var W = 1280, H = 720;
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        var g = c.getContext('2d');
        if (!g){ resolve(null); return; }
        // backdrop + the live frame
        g.fillStyle = '#1c1208'; g.fillRect(0,0,W,H);
        try{ g.drawImage(src, 0, 0, W, H); }catch(_){}
        // darkening gradient at top for legible header text
        try{
          var gr = g.createLinearGradient(0,0,0,H*0.32);
          gr.addColorStop(0,'rgba(28,18,8,0.78)'); gr.addColorStop(1,'rgba(28,18,8,0)');
          g.fillStyle = gr; g.fillRect(0,0,W,H*0.32);
        }catch(_){}
        // header text
        var win = winnerName(), score = scoreStr(), wpn = weaponName();
        var hx = 28, hy = 30;
        var av = avatarImg();
        if (av){ try{ g.drawImage(av, hx, hy, 84, 84); hx += 96; }catch(_){} }
        g.fillStyle = '#fff';
        g.font = '800 44px system-ui, -apple-system, Arial, sans-serif';
        g.textBaseline = 'top';
        var title = win ? (win + ' ' + t(' csapata győzött!')) : t('🏆 Nézd a meccsemet!');
        g.fillText(title, hx, hy);
        g.font = '600 26px system-ui, -apple-system, Arial, sans-serif';
        g.fillStyle = '#ffd9a8';
        var sub = [];
        if (score) sub.push(t('Pont') + ': ' + score);
        if (wpn)   sub.push(t('Fegyver') + ': ' + wpn);
        if (sub.length) g.fillText(sub.join('   •   '), hx, hy + 56);
        drawWatermark(g, W, H);
        var done = function(blob){ resolve(blob || null); };
        if (c.toBlob){
          c.toBlob(function(b){ done(b); }, 'image/png');
        } else {
          // very old browser: synth a blob from the data URL
          try{
            var url = c.toDataURL('image/png');
            fetch(url).then(function(r){ return r.blob(); }).then(done).catch(function(){ done(null); });
          }catch(_){ resolve(null); }
        }
      }catch(_){ resolve(null); }
    });
  }

  /* --------------------------------------------------------------------------
   * exportClip — WebM blob from the rolling buffer, else the PNG brag card.
   * Returns Promise<{blob,type,ext,name,url}|null>.
   * ------------------------------------------------------------------------*/
  function stamp(){ try{ return Date.now(); }catch(_){ return 0; } }

  function exportClip(){
    return new Promise(function(resolve){
      try{
        // Path A: buffered footage. The chunks SURVIVE stop() — the recorder is
        // already stopped ~0.5s after game over while the share button is tapped
        // seconds later, so gating on _recording made the clip path dead (every
        // share fell back to the PNG brag card).
        if (_chunks.length){
          var _fin = (_recording && _rec) ? flush() : Promise.resolve();
          _fin.then(function(){
            try{
              trimRing();
              var parts = _chunks.map(function(ch){ return ch.data; });
              if (!parts.length){ bragThen(resolve); return; }
              var blob = new Blob(parts, { type:(_mime || 'video/webm') });
              if (!blob || blob.size < 1024){ bragThen(resolve); return; }
              resolve(wrap(blob, blob.type || 'video/webm', _ext));
            }catch(_){ bragThen(resolve); }
          });
          return;
        }
        // Path B: fallback brag card.
        bragThen(resolve);
      }catch(_){ bragThen(resolve); }
    });
  }

  function bragThen(resolve){
    bragCard().then(function(b){
      if (!b){ resolve(null); return; }
      resolve(wrap(b, 'image/png', 'png'));
    }).catch(function(){ resolve(null); });
  }

  function wrap(blob, type, ext){
    var name = 'animal-battle-ground-' + stamp() + '.' + ext;
    var url = null; try{ url = URL.createObjectURL(blob); }catch(_){}
    return { blob:blob, type:type, ext:ext, name:name, url:url };
  }

  /* --------------------------------------------------------------------------
   * shareClip — native share sheet (file) -> download -> open-in-tab.
   * Mirrors ui.js shareScreenshot()'s flow. Best-effort, never throws.
   * ------------------------------------------------------------------------*/
  // Instant full-screen cover shown the MOMENT the player taps Share, so nothing
  // (the menu, a re-render, the canvas clearing) can flash during the ~1s WebM
  // export before the brag card / share sheet appears (Jani: PC-n 1mp-re bevillan
  // a MENÜ megosztáskor). Removed as soon as the card/share/download takes over.
  function _showPrep(){
    try{
      if (typeof document === 'undefined' || !document.body) return null;
      var d = document.createElement('div');
      d.setAttribute('data-ca-share-prep','1');
      d.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(10,7,3,0.92);'+
        'display:flex;align-items:center;justify-content:center;color:#E8711A;'+
        'font:800 20px system-ui,sans-serif;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);';
      d.textContent = '⏳ ' + (t('Megosztás előkészítése…') || 'Preparing…');
      document.body.appendChild(d);
      return d;
    }catch(_){ return null; }
  }
  function _hidePrep(d){ try{ if (d && d.parentNode) d.parentNode.removeChild(d); }catch(_){} }

  function shareClip(){
    var _prep = _showPrep();
    var done = function(v){ _hidePrep(_prep); return v; };
    return exportClip().then(function(out){
      if (!out){ _hidePrep(_prep); return false; }
      try{
        // Prefer the Web Share API with the actual file (mobile + real share sheet).
        if (navigator.canShare && typeof File === 'function'){
          var file = new File([out.blob], out.name, { type:out.type });
          if (navigator.canShare({ files:[file] }) && navigator.share){
            _hidePrep(_prep);   // the OS share sheet is taking over
            return navigator.share({
              files:[file],
              title: t('Animal Battle Ground klip'),
              text:  shareText()
            }).then(function(){ revoke(out); return true; })
              // user cancelled or the sheet errored -> show the in-game card preview, not a silent download.
              .catch(function(){ if (!showCardOverlay(out)) download(out); return true; });
          }
        }
      }catch(_){}
      // No native share (in-app webview / desktop without share): show the designed
      // brag card in an overlay with explicit Save / Share actions instead of a
      // confusing silent <a download> (which iOS opens as a useless file page).
      _hidePrep(_prep);
      try{ if (showCardOverlay(out)) return true; }catch(_){}
      download(out);
      return true;
    }).catch(function(){ _hidePrep(_prep); return false; });
  }

  /* --------------------------------------------------------------------------
   * showCardOverlay — the no-native-share delivery. Renders the designed brag
   * card in a full-viewport overlay so the player SEES it (with clear Save /
   * Share / Close actions) instead of having a PNG silently downloaded into a
   * dead-end file viewer. Best-effort; returns true on success, never throws.
   * ------------------------------------------------------------------------*/
  function showCardOverlay(out){
    try{
      if (!out || typeof document === 'undefined' || !document.body) return false;
      var revoked = false;
      var back = document.createElement('div');
      back.setAttribute('data-ca-share-overlay','1');
      back.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,7,3,0.82);' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'gap:14px;padding:18px;box-sizing:border-box;-webkit-backdrop-filter:blur(2px);';

      var close = function(){
        try{ if (back && back.parentNode) back.parentNode.removeChild(back); }catch(_){}
        if (!revoked){ revoked = true; try{ revoke(out); }catch(_){} }
      };

      // caption
      var cap = document.createElement('div');
      cap.textContent = t('🏆 Oszd meg a meccsed!');
      cap.style.cssText = 'color:#E8711A;font-weight:800;font-size:18px;text-align:center;' +
        'font-family:system-ui,-apple-system,Arial,sans-serif;';
      back.appendChild(cap);

      // the card image
      var img = document.createElement('img');
      try{ img.src = out.url || URL.createObjectURL(out.blob); }catch(_){}
      img.style.cssText = 'max-width:92vw;max-height:62vh;border-radius:12px;' +
        'box-shadow:0 8px 30px rgba(0,0,0,.5);border:2px solid #E8711A;';
      back.appendChild(img);

      // hint
      var hint = document.createElement('div');
      hint.textContent = t('Mentsd a képeidhez, vagy oszd meg — ') + shareTag();
      hint.style.cssText = 'color:#ffd9a8;opacity:0.85;font-size:13px;text-align:center;' +
        'font-family:system-ui,-apple-system,Arial,sans-serif;';
      back.appendChild(hint);

      // button row
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;justify-content:center;';
      var primaryCss = 'min-height:44px;padding:10px 18px;border:0;border-radius:22px;' +
        'background:#E8711A;color:#fff;font-weight:700;font-size:15px;cursor:pointer;' +
        'font-family:system-ui,-apple-system,Arial,sans-serif;';
      var ghostCss = 'min-height:44px;padding:10px 18px;border:1px solid #E8711A;border-radius:22px;' +
        'background:#3D2800;color:#ffd9a8;font-weight:700;font-size:15px;cursor:pointer;' +
        'font-family:system-ui,-apple-system,Arial,sans-serif;';

      var bSave = document.createElement('button');
      bSave.textContent = t('💾 Mentés');
      bSave.style.cssText = primaryCss;
      bSave.onclick = function(){ try{ download(out); }catch(_){} close(); };
      row.appendChild(bSave);

      // Share button only when a native share sheet exists.
      try{
        if (navigator.share && typeof File === 'function'){
          var bShare = document.createElement('button');
          bShare.textContent = t('📤 Megosztás');
          bShare.style.cssText = primaryCss;
          bShare.onclick = function(){
            try{
              var file = new File([out.blob], out.name, { type:out.type });
              navigator.share({
                files:[file],
              title: t('Animal Battle Ground klip'),
                text:  shareText()
              }).then(function(){ close(); }).catch(function(){});
            }catch(_){}
          };
          row.appendChild(bShare);
        }
      }catch(_){}

      var bClose = document.createElement('button');
      bClose.textContent = t('Bezár');
      bClose.style.cssText = ghostCss;
      bClose.onclick = function(){ close(); };
      row.appendChild(bClose);

      back.appendChild(row);

      // backdrop click (but not on the children) closes
      back.addEventListener('click', function(e){ if (e.target === back) close(); });

      document.body.appendChild(back);
      return true;
    }catch(_){ return false; }
  }

  function download(out){
    try{
      var href = out.url || (out.url = (function(){ try{ return URL.createObjectURL(out.blob); }catch(_){ return null; } })());
      if (!href) throw new Error('no url');
      var a = document.createElement('a');
      a.href = href; a.download = out.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      // give the download a moment before revoking the object URL
      setTimeout(function(){ revoke(out); }, 4000);
    }catch(_){
      try{ if (out.url) window.open(out.url, '_blank'); }catch(__){}
    }
  }
  function revoke(out){ try{ if (out && out.url){ URL.revokeObjectURL(out.url); out.url = null; } }catch(_){} }

  /* --------------------------------------------------------------------------
   * Public surface + optional auto-wiring through CA.events.
   * ------------------------------------------------------------------------*/
  function init(canvas){
    try{
      _canvas = canvas || CA.canvas || _canvas;
      if (_inited) return CA.Share;
      _inited = true;
      // Auto-manage the recorder around the match lifecycle (all optional).
      try{
        if (CA.events && CA.events.on){
          CA.events.on('gameStart', function(){ try{ if (inMatch() || true) startRecording(); }catch(_){} });
          CA.events.on('gameOver',  function(){
            // capture a final beat of the win-cam, then stop + release the stream.
            try{ flush().then(function(){ setTimeout(stop, 300); }); }catch(_){ stop(); }
          });
        }
      }catch(_){}
      // If a match is already running when we init (hot-load), start now.
      try{ if (inMatch()) startRecording(); }catch(_){}
    }catch(_){}
    return CA.Share;
  }

  function markMoment(){
    try{
      _momentT = now();
      // ensure we're recording so the moment is actually captured
      if (!_recording && inMatch()) startRecording();
    }catch(_){}
  }

  CA.Share = {
    init: init,
    markMoment: markMoment,
    exportClip: exportClip,
    shareClip: shareClip,
    bragCard: bragCard,
    stop: stop,
    isRecording: function(){ return !!_recording; },
    canRecord: function(){ return canRecord(_canvas); },
    lastMoment: function(){ return _momentT; }
  };
})();
