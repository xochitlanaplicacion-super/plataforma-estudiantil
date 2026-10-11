/* ============================================================================
 * Squeak & Destroy — RANKED SEASONS logic (CA.Ranked).
 * Havi ranked szezon: a játékos Ranglista-pontot (RP) gyűjt a napi kihívásból és
 * a duellből. Az RP cuki-spooky TIER-ekre képződik le. Minden szezon (UTC YYYYMM)
 * az RP nullázódik; a szezononkénti globális ranglista a meglévő match.php-ben él
 * (cid = 'ranked_'+seasonId), a szerver a játékos LEGJOBB RP-jét tartja.
 *
 * Az integrátor a kihívás-folyamatból hívja a CA.Ranked.recordResult(res)-t.
 *
 * Védekező: SOHA nem dob. Ha a CA.api / match.php nem elérhető, az RP akkor is
 * lokálisan követődik. 8s fetch-timeout.
 * ==========================================================================*/
(function(){
  if(!window.CA) window.CA = {};

  if(CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
    // tier nevek (EN)
    'Sírkerti Újonc':'Graveyard Rookie',
    'Csont-csavargó':'Bone Drifter',
    'Csont-lovag':'Bone Knight',
    'Fantom':'Phantom',
    'Krypta-úr':'Crypt Lord',
  });

  var LS_KEY = 'ca_ranked';

  // ---- TIER tábla (RP küszöb növekvő sorrendben) ------------------------
  var TIERS = [
    { idx:0, name:'Sírkerti Újonc', emoji:'🦴', min:0    },
    { idx:1, name:'Csont-csavargó', emoji:'💀', min:300  },
    { idx:2, name:'Csont-lovag',    emoji:'⚔️', min:800  },
    { idx:3, name:'Fantom',         emoji:'👻', min:1500 },
    { idx:4, name:'Krypta-úr',      emoji:'👑', min:2500 },
  ];

  // ---- kis util ---------------------------------------------------------
  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function toInt(v){ var n=parseInt(v,10); return isFinite(n)?n:0; }

  function pad2(n){ return (n<10?'0':'')+n; }
  function seasonId(){
    try{
      var d = new Date();
      return '' + d.getUTCFullYear() + pad2(d.getUTCMonth()+1);   // 'YYYYMM' (UTC)
    }catch(e){ return '000000'; }
  }

  // ---- localStorage {season, rp, best, lastSeason, lastTier} ------------
  function read(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      var o = JSON.parse(raw);
      if(o && typeof o==='object') return o;
    }catch(e){}
    return null;
  }
  function write(o){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(o)); }catch(e){}
  }

  // current in-memory model (loaded once, then mutated/persisted)
  var data = (function(){
    var cur = seasonId();
    var o = read() || {};
    var rp   = toInt(o.rp);
    var best = toInt(o.best);
    var model;
    if(o.season !== cur){
      // szezon-váltás: RP nullázódik; megjegyezzük az előző szezont/tiert
      var prevTier = tierForRP(rp);
      model = {
        season: cur, rp: 0, best: 0,
        lastSeason: (o.season || null),
        lastTier: (o.season ? prevTier.name : null)
      };
      write(model);
    } else {
      model = {
        season: cur,
        rp: rp<0?0:rp,
        best: best<rp?(rp<0?0:rp):best,
        lastSeason: (o.lastSeason || null),
        lastTier: (o.lastTier || null)
      };
    }
    return model;
  })();

  // tier lookup a nyers RP-ből (belső, hogy a load is használhassa)
  function tierForRP(rp){
    rp = toInt(rp);
    var t = TIERS[0];
    for(var i=0;i<TIERS.length;i++){ if(rp >= TIERS[i].min) t = TIERS[i]; }
    return t;
  }

  // ---- timeout-os fetch JSON (sosem dob → null) -------------------------
  function fetchJSON(url, opts){
    return new Promise(function(resolve){
      var done=false, timer=null, ctl=null;
      function finish(v){ if(done) return; done=true; if(timer){ clearTimeout(timer); } resolve(v); }
      try{
        if(typeof AbortController!=='undefined'){ ctl=new AbortController(); }
        timer = setTimeout(function(){ try{ if(ctl) ctl.abort(); }catch(_){ } finish(null); }, 8000);
        var o = Object.assign({}, opts||{});
        if(!o.credentials) o.credentials = creds();
        if(ctl) o.signal = ctl.signal;
        fetch(url, o).then(function(res){ return res.json(); })
          .then(function(j){ finish(j); })
          .catch(function(){ finish(null); });
      }catch(e){ finish(null); }
    });
  }

  function apiUrl(path){ try{ return CA.api ? CA.api(path) : path; }catch(e){ return path; } }
  // NATIVE builds (Capacitor/file://) hit a CROSS-ORIGIN API_BASE; the SkyNet SSO
  // cookie only rides with credentials:'include'. Web is same-origin (no-op).
  // Mirrors account.js _creds(). (#native-sso)
  function creds(){ return (CA.API_BASE && CA.API_BASE !== '') ? 'include' : 'same-origin'; }

  // ---- állapot / tierek ------------------------------------------------
  function tierFor(rp){ return tierForRP(rp); }

  function state(){
    var rp = toInt(data.rp); if(rp<0) rp=0;
    var t  = tierForRP(rp);
    var nxt = (t.idx < TIERS.length-1) ? TIERS[t.idx+1] : null;
    var toNext = nxt ? Math.max(0, nxt.min - rp) : 0;
    var pct;
    if(nxt){
      var span = nxt.min - t.min;
      pct = span>0 ? clamp((rp - t.min)/span, 0, 1) : 1;
    } else {
      pct = 1;  // max tier
    }
    return {
      seasonId: data.season,
      rp: rp,
      best: toInt(data.best),
      tier: { idx:t.idx, name:t.name, emoji:t.emoji, min:t.min },
      next: nxt ? { name:nxt.name, min:nxt.min } : null,
      toNext: toNext,
      pct: pct,
      lastSeason: data.lastSeason || null,
      lastTier: data.lastTier || null
    };
  }

  // ---- szerver-beküldés (legjobb RP/szezon) ----------------------------
  function submit(rp){
    try{
      var A = CA.Account;
      if(!A || !A.user || !A.user.uid) return;   // csak bejelentkezve
      var t = tierForRP(rp);
      var body = {
        cid:   'ranked_' + data.season,
        uid:   A.user.uid,
        token: A.token || '',
        score: toInt(rp),
        meta:  { tier: t.name }
      };
      // tűz-és-felejtsd; a szerver a legjobbat tartja, így additív hívások OK-k.
      fetchJSON(apiUrl('match.php'), {
        method:'POST', credentials:creds(),
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
    }catch(e){}
  }

  // ---- RP módosítás ----------------------------------------------------
  function addRP(n, reason){
    try{
      n = toInt(n);
      var rp = toInt(data.rp) + n;
      if(rp < 0) rp = 0;
      data.rp = rp;
      if(rp > toInt(data.best)) data.best = rp;
      write(data);
      var st = state();
      try{ if(CA.events) CA.events.emit('rankedChanged', st); }catch(_){}
      return st;
    }catch(e){
      try{ return state(); }catch(_){ return null; }
    }
  }

  // ---- eredmény rögzítése (integrátor hívja) ---------------------------
  // res = { kind:'daily'|'duel', score, won }
  function recordResult(res){
    try{
      res = res || {};
      var gain = 0;
      if(res.kind === 'daily'){
        gain = clamp(Math.round(toInt(res.score)/15), 5, 120);
      } else if(res.kind === 'duel'){
        gain = res.won ? 45 : 10;
      } else {
        return state();   // ismeretlen típus → nincs változás
      }
      var st = addRP(gain, res.kind);
      // szerver-beküldés az új RP-vel (a legjobbat tartja)
      submit(toInt(data.rp));
      return st;
    }catch(e){
      try{ return state(); }catch(_){ return null; }
    }
  }

  // ---- szezon-ranglista (GET) ------------------------------------------
  function standings(){
    return new Promise(function(resolve){
      try{
        var url = apiUrl('match.php') + '?cid=ranked_' + encodeURIComponent(data.season) + '&limit=25';
        fetchJSON(url).then(function(j){
          if(j && j.ok && Array.isArray(j.scores)){
            resolve({ ok:true, scores:j.scores });
          } else {
            resolve({ ok:false, scores:[] });
          }
        });
      }catch(e){ resolve({ ok:false, scores:[] }); }
    });
  }

  // ---- public API ------------------------------------------------------
  CA.Ranked = {
    TIERS: TIERS,
    seasonId: seasonId,
    state: state,
    tierFor: tierFor,
    recordResult: recordResult,
    addRP: addRP,
    standings: standings
  };
})();
