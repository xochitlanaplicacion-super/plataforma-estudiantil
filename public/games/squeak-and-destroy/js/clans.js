/* ============================================================================
 * Squeak & Destroy — clans.js :: CA.Clans
 * Client for clans.php ("Crypts"): create / join / leave / contribute, plus
 * top + info listings. Caches the player's own clan (tag) in localStorage so
 * the in-game [TAG] tag-over-units renderer can read it synchronously/offline.
 *
 * Self-contained, vanilla JS, CA namespace. Never throws; every fetch is
 * guarded with an 8s abort timeout (mirrors js/menu-leaderboard.js style).
 * Public API (the menu-clan UI + the game both depend on THIS):
 *   CA.Clans.mine(force)   -> Promise<clan|null>   (caches + ca_clan localStorage)
 *   CA.Clans.myTag()       -> SYNC string  ('' if none)   <- in-game tag render
 *   CA.Clans.myClanCached()-> SYNC clan|null
 *   CA.Clans.create(name,tag) -> Promise<{ok,...}>  (cache + 'clanChanged')
 *   CA.Clans.join(tagOrId)    -> Promise<{ok,...}>  (cache + 'clanChanged')
 *   CA.Clans.leave()          -> Promise<{ok}>      (clears cache + event)
 *   CA.Clans.top(limit)       -> Promise<{ok,clans}>  (never throws)
 *   CA.Clans.info(tagOrId)    -> Promise<{ok,clan}>
 *   CA.Clans.contribute(pts)  -> Promise            (best-effort)
 * ==========================================================================*/
(function(){
  'use strict';
  if (!window.CA) window.CA = {};

  if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    'Klán':'Clan',
    'Klánok':'Clans',
    'Crypt':'Crypt',
    'Klán létrehozása':'Create clan',
    'Csatlakozás':'Join',
    'Kilépés a klánból':'Leave clan',
    'A klán megtelt.':'The clan is full.',
    'Már van klánod.':'You are already in a clan.',
    'Ez a tag már foglalt.':'That tag is taken.',
    'Érvénytelen tag (2-4 betű/szám).':'Invalid tag (2-4 letters/numbers).',
    'Érvénytelen név (3-24 karakter).':'Invalid name (3-24 characters).',
    'Nem vagy belépve.':'You are not logged in.',
    'Nincs kapcsolat':'No connection',
    'Hozzájárulás pontokkal':'Contribute points'
  });

  var ENDPOINT  = (CA.api ? CA.api('clans.php') : 'clans.php');   // native build -> live origin
  var CACHE_KEY = 'ca_clan';   // {tag, name, id, ts}

  var _clan = null;     // last fetched full clan object (or null)
  var _inflight = null; // de-dupe concurrent mine() fetches
  var _tagMemo = null;  // memoized myTag() result (null = not computed; invalidated on cache/account change)

  /* ---- account helpers ------------------------------------------------- */
  function acct(){ return (window.CA && CA.Account) ? CA.Account : null; }
  function signedIn(){ var A=acct(); return !!(A && A.user && A.user.uid); }
  function uid(){ var A=acct(); return (A && A.user) ? A.user.uid : null; }
  function token(){ var A=acct(); return (A && A.token) ? A.token : ''; }

  /* ---- localStorage cache (the SYNC source for myTag) ------------------ */
  function readCache(){
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') return o;
    } catch(e){}
    return null;
  }
  function writeCache(clan){
    _tagMemo = null;   // invalidate the myTag memo whenever the cache changes
    try {
      if (clan && clan.tag){
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          tag: String(clan.tag),
          name: clan.name != null ? String(clan.name) : '',
          id: clan.id != null ? clan.id : null,
          ts: Date.now()
        }));
      } else {
        localStorage.removeItem(CACHE_KEY);
      }
    } catch(e){}
  }
  function setClan(clan){
    _clan = (clan && typeof clan === 'object') ? clan : null;
    writeCache(_clan);
    try { if (CA.events) CA.events.emit('clanChanged', _clan); } catch(e){}
    return _clan;
  }

  /* ---- guarded fetch with 8s abort (mirrors menu-leaderboard.js) ------- */
  function fetchJSON(url, opts){
    var ctl, timer;
    try { ctl = new AbortController(); } catch(e){ ctl = null; }
    var o = {};
    if (opts) for (var k in opts){ if (opts.hasOwnProperty(k)) o[k] = opts[k]; }
    // NATIVE builds (Capacitor/file://) hit a CROSS-ORIGIN API_BASE; the SkyNet
    // SSO cookie only rides with credentials:'include'. Web is same-origin
    // (no-op). Mirrors account.js _creds(). (#native-sso)
    o.credentials = o.credentials || ((CA.API_BASE && CA.API_BASE !== '') ? 'include' : 'same-origin');
    if (ctl){ o.signal = ctl.signal; timer = setTimeout(function(){ try{ ctl.abort(); }catch(_){} }, 8000); }
    return fetch(url, o)
      .then(function(res){ return res.json(); })
      .then(function(data){ if (timer) clearTimeout(timer); return data; })
      .catch(function(){ if (timer) clearTimeout(timer); return null; });
  }
  function postJSON(body){
    return fetchJSON(ENDPOINT, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(body || {})
    });
  }
  function getJSON(qs){
    return fetchJSON(ENDPOINT + (qs ? ('?' + qs) : ''));
  }

  /* ---- client-side validation ----------------------------------------- */
  var TAG_RE = /^[A-Z0-9]{2,4}$/;
  function normTag(tag){ return (tag == null ? '' : String(tag)).trim().toUpperCase(); }
  function validTag(tag){ return TAG_RE.test(tag); }
  function validName(name){
    var n = (name == null ? '' : String(name)).trim();
    return n.length >= 3 && n.length <= 24;
  }

  /* ======================================================================
   * PUBLIC API
   * ==================================================================== */
  var Clans = {

    /* SYNC: cached clan tag string ('' if none). Memoized so the per-FRAME in-game
     * name-tag render never hits localStorage repeatedly (#perf-mytag). The memo is
     * invalidated on writeCache()/clanChanged/accountChanged (see _tagMemo resets). */
    myTag: function(){
      if (_clan && _clan.tag){ _tagMemo = String(_clan.tag); return _tagMemo; }
      if (_tagMemo != null) return _tagMemo;
      var c = readCache();
      _tagMemo = (c && c.tag) ? String(c.tag) : '';
      return _tagMemo;
    },

    /* SYNC: cached clan object (full if fetched this session, else the slim
     * localStorage record), or null. */
    myClanCached: function(){
      if (_clan) return _clan;
      return readCache();
    },

    /* Promise<clan|null>. Caches result + tag. Not signed in -> null.
     * `force` bypasses the in-session memo and re-fetches. */
    mine: function(force){
      if (!signedIn()){ _clan = null; writeCache(null); return Promise.resolve(null); }
      if (!force && _clan) return Promise.resolve(_clan);
      if (!force && _inflight) return _inflight;
      var qs = 'action=mine&uid=' + encodeURIComponent(uid()) + '&token=' + encodeURIComponent(token());
      var p = getJSON(qs).then(function(data){
        _inflight = null;
        if (data && data.ok){
          return setClan(data.clan || null);  // clan|null
        }
        // request failed or not-ok: keep whatever we have cached, return it
        return Clans.myClanCached();
      });
      _inflight = p;
      return p;
    },

    /* create(name, tag) -> Promise<{ok,...}>. Validates client-side first. */
    create: function(name, tag){
      if (!signedIn()) return Promise.resolve({ ok:false, err:'not_signed_in' });
      var t = normTag(tag);
      if (!validName(name)) return Promise.resolve({ ok:false, err:'bad_name' });
      if (!validTag(t))     return Promise.resolve({ ok:false, err:'bad_tag' });
      return postJSON({ action:'create', uid:uid(), token:token(), name:String(name).trim(), tag:t })
        .then(function(res){
          if (!res) return { ok:false, err:'no_connection' };
          if (res.ok && res.clan) setClan(res.clan);
          return res;
        });
    },

    /* join(tagOrId) -> Promise<{ok,...}>. */
    join: function(tagOrId){
      if (!signedIn()) return Promise.resolve({ ok:false, err:'not_signed_in' });
      var t = normTag(tagOrId);
      // Allow joining by tag (validated) — numeric ids are passed through as-is.
      var byId = (typeof tagOrId === 'number') || /^\d+$/.test(String(tagOrId == null ? '' : tagOrId).trim());
      if (!byId && !validTag(t)) return Promise.resolve({ ok:false, err:'bad_tag' });
      var body = { action:'join', uid:uid(), token:token() };
      if (byId) body.id = (typeof tagOrId === 'number') ? tagOrId : Number(String(tagOrId).trim());
      else      body.tag = t;
      return postJSON(body).then(function(res){
        if (!res) return { ok:false, err:'no_connection' };
        if (res.ok && res.clan) setClan(res.clan);
        return res;
      });
    },

    /* leave() -> Promise<{ok}>. Clears cache + emits clanChanged(null). */
    leave: function(){
      if (!signedIn()){ setClan(null); return Promise.resolve({ ok:true }); }
      return postJSON({ action:'leave', uid:uid(), token:token() }).then(function(res){
        // Clear local state regardless of server outcome on a not-found, but
        // only confirm-clear on ok/no-connection-graceful.
        if (res && res.ok){ setClan(null); return res; }
        if (!res) return { ok:false, err:'no_connection' };
        return res;
      });
    },

    /* top(limit) -> Promise<{ok,clans}>. Never throws. */
    top: function(limit){
      var n = parseInt(limit, 10); if (!isFinite(n) || n <= 0) n = 20;
      return getJSON('action=top&limit=' + n).then(function(data){
        if (data && data.ok && data.clans) return data;
        return { ok:false, clans:[] };
      });
    },

    /* info(tagOrId) -> Promise<{ok,clan}>. */
    info: function(tagOrId){
      var byId = (typeof tagOrId === 'number') || /^\d+$/.test(String(tagOrId == null ? '' : tagOrId).trim());
      var qs;
      if (byId) qs = 'action=info&id=' + encodeURIComponent((typeof tagOrId==='number')?tagOrId:String(tagOrId).trim());
      else {
        var t = normTag(tagOrId);
        if (!validTag(t)) return Promise.resolve({ ok:false, err:'bad_tag' });
        qs = 'action=info&tag=' + encodeURIComponent(t);
      }
      return getJSON(qs).then(function(data){
        if (data && data.ok) return data;
        return { ok:false };
      });
    },

    /* contribute(points) -> Promise. Best-effort, swallows errors. */
    contribute: function(points){
      if (!signedIn()) return Promise.resolve({ ok:false });
      var p = parseInt(points, 10); if (!isFinite(p) || p <= 0) return Promise.resolve({ ok:false });
      return postJSON({ action:'contribute', uid:uid(), token:token(), points:p })
        .then(function(res){ return res || { ok:false }; })
        .catch(function(){ return { ok:false }; });
    }
  };

  CA.Clans = Clans;

  /* ---- react to login/logout -------------------------------------------
   * On sign-in: refresh mine(). On logout (user==null): clear the cache so
   * myTag() stops reporting a stale clan. Guarded — never throws. */
  try {
    if (CA.events && CA.events.on){
      CA.events.on('accountChanged', function(user){
        try {
          if (user && user.uid){ Clans.mine(true); }
          else { _clan = null; _inflight = null; writeCache(null); }
        } catch(e){}
      });
    }
  } catch(e){}

  // Warm the in-session memo from any persisted cache so myClanCached() returns
  // the full-ish slim record immediately on load (myTag already reads storage).
  try { var boot = readCache(); if (boot) _clan = _clan || boot; } catch(e){}

})();
