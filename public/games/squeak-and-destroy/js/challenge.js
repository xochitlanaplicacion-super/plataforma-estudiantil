/* ============================================================================
 * Squeak & Destroy — challenge.js  ::  CA.Challenge
 * ----------------------------------------------------------------------------
 * SCORE-BASED, ASYNC competition layer (NO real-time, NO deterministic
 * lockstep). Everyone plays the SAME seed/setup, scores the run LOCALLY and
 * submits the score to the match.php backend. Two flavours:
 *
 *   DAILY  "Crypt Challenge" — one fixed solo scenario per UTC day, identical
 *          for every player on Earth that day (capybara heroes vs an AI worm
 *          team). cid = 'daily_YYYYMMDD'.
 *   DUEL   self-contained async friend duel — the duel config (seed + setup)
 *          is ENCODED into a shareable URL-safe code; opening the link plays
 *          the exact same fixed match. cid = 'duel_<short hash of the code>'.
 *
 * Auth mirrors the leaderboard auto-submit (CA.Account.user.uid + token).
 *
 * The whole module is defensive: nothing here is allowed to throw into the UI
 * or the game loop. Every public method try/catches and returns a safe value.
 *
 * ── PUBLIC API (the UI module js/menu-challenge.js is written against this) ──
 *   CA.Challenge.dailyId()            -> 'daily_YYYYMMDD' (UTC)
 *   CA.Challenge.dailySeed()          -> stable int derived from the UTC date
 *   CA.Challenge.dailyConfig()        -> fixed CA.newGame opts for today
 *   CA.Challenge.start(kind, cfgOrCode)
 *   CA.Challenge.createDuel(opts)     -> {cid, code, url}
 *   CA.Challenge.parseDuel(codeOrUrl) -> config | null
 *   CA.Challenge.openDuel(codeOrUrl)  -> start('duel', cfg)
 *   CA.Challenge.standings(cid)       -> Promise<{ok, scores?}>
 *   CA.Challenge.localBest(cid)       -> number | null
 *   CA.Challenge.lastResult()         -> {cid,kind,score,shots,won} | null
 *   CA.Challenge.isActive()           -> boolean
 *
 * ── SCORING FORMULA (documented) ──
 *   WIN:  base 1000
 *       + kills * 150
 *       + max(0, 600 - shots*40)        (efficiency: fewer shots = more points)
 *       + timeBonus  = max(0, 400 - floor(elapsedSeconds))   (speed bonus)
 *   LOSS: participation 50 (still submitted, so the board shows you tried).
 *   Final score is clamped to a non-negative integer.
 *
 * ── PERSISTENCE ──
 *   localStorage key 'ca_challenge' -> { "<cid>": <bestScore:int>, ... }
 * ==========================================================================*/
(function(){
  if (!window.CA) return;

  // ---- i18n: HU string IS the key; register EN here. CA.t() resolves. -------
  try {
    if (CA.i18n && CA.i18n.addEN) CA.i18n.addEN({
      'Kripta-kihívás':'Crypt Challenge',
      'Napi kihívás':'Daily Challenge',
      'Párbaj':'Duel',
      'Párbaj-kihívás':'Duel Challenge',
      'Legjobb pontod':'Your best',
      'Új csúcs!':'New best!',
      'Pont beküldve':'Score submitted',
      'Beküldés sikertelen':'Submit failed',
      'Hívd ki egy barátod!':'Challenge a friend!',
      'Másold ki a linket és küldd el a barátodnak.':'Copy the link and send it to a friend.',
      'pont':'pts',
      'Napi kihívás teljesítve: +':'Daily challenge complete: +',
      ' érme':' coins',
      // virality: "challenge me" deep-link share affordances
      'Hívd ki a haverod':'Challenge a friend',
      'Hívd ki egy haverod erre a pályára! ':'Challenge a friend to this arena! ',
      'Link kimásolva!':'Link copied!',
      '⚔️ Hívd ki a haverod':'⚔️ Challenge a friend',
      'Verd meg a napi pontom! ':'Beat my daily score! '
    });
  } catch(e){}

  var C = CA.config, S = CA.state, U = CA.util;

  // localStorage key holding the per-cid local best scores.
  var STORE_KEY = 'ca_challenge';

  // localStorage key holding the per-UTC-day DAILY attempt record (one-shot/day).
  //   { "<dailyId>": { attempted:true, won:bool, score:int, reward:int, ts:int } }
  // Keyed by dailyId() ('daily_YYYYMMDD') so it auto-resets at UTC midnight; only
  // the current day's entry is ever read (stale entries are harmless).
  var DAILY_KEY = 'ca_daily';

  // DAILY reward economy (coins, soft currency — cosmetic-only, NOT pay-to-win).
  //   reward = BASE + min(MAX_BONUS, floor(score / SCORE_PER_COIN))
  // Granted EXACTLY ONCE per UTC day (idempotent on the per-day attempt record).
  var DAILY_REWARD_BASE = 50;     // flat reward just for finishing today's daily
  var DAILY_SCORE_PER_COIN = 25;  // every 25 score points -> +1 bonus coin
  var DAILY_BONUS_MAX = 150;      // cap on the score-scaled bonus
  // a LOSS still finished the one-shot attempt, but earns no coins.
  function dailyRewardFor(won, score){
    try {
      if (!won) return 0;
      var bonus = Math.min(DAILY_BONUS_MAX,
        Math.floor(Math.max(0, score || 0) / DAILY_SCORE_PER_COIN));
      return DAILY_REWARD_BASE + bonus;
    } catch(e){ return won ? DAILY_REWARD_BASE : 0; }
  }
  // what a PERFECT-ish run could pay, for the "what do I get" hint on the screen.
  function dailyMaxReward(){ return DAILY_REWARD_BASE + DAILY_BONUS_MAX; }

  // cid must match the backend regex ^[a-z0-9_-]{1,48}$
  var CID_RE = /^[a-z0-9_-]{1,48}$/;

  // NATIVE builds (Capacitor/file://) hit a CROSS-ORIGIN API_BASE; the SkyNet SSO
  // cookie only rides with credentials:'include'. Web is same-origin (no-op).
  // Mirrors account.js _creds(). (#native-sso)
  function creds(){ return (CA.API_BASE && CA.API_BASE !== '') ? 'include' : 'same-origin'; }

  // last finished challenge run summary (for the UI to display).
  var _last = null;
  // ensure we only wire the 'fired'/'gameOver' listeners once.
  var _wired = false;

  /* ---------------------------------------------------------------------------
   * tiny helpers
   * ------------------------------------------------------------------------- */
  function nowMs(){ try { return Date.now(); } catch(e){ return 0; } }

  // stable 32-bit-ish hash of a string -> short lowercase base36 token.
  function shortHash(str){
    str = String(str == null ? '' : str);
    var h = 2166136261;            // FNV-1a-ish
    for (var i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    // mix length in so equal-prefix strings diverge a little more
    h = (h ^ (str.length * 2654435761)) >>> 0;
    return h.toString(36);
  }

  // URL-safe base64 of a JS value (via JSON). Returns '' on failure.
  function encodeCfg(obj){
    try {
      var json = JSON.stringify(obj);
      // encodeURIComponent first so non-ASCII survives btoa.
      var b64 = btoa(unescape(encodeURIComponent(json)));
      // make it URL-safe (no +, /, =).
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch(e){ return ''; }
  }

  // inverse of encodeCfg. Returns the decoded value or null on garbage.
  function decodeCfg(code){
    try {
      if (code == null) return null;
      var s = String(code).trim();
      if (!s) return null;
      var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var json = decodeURIComponent(escape(atob(b64)));
      var obj = JSON.parse(json);
      return (obj && typeof obj === 'object') ? obj : null;
    } catch(e){ return null; }
  }

  // pull a bare duel code out of a full URL (or return the trimmed input).
  function extractCode(codeOrUrl){
    try {
      if (codeOrUrl == null) return '';
      var s = String(codeOrUrl).trim();
      if (!s) return '';
      var m = s.match(/[?&]duel=([^&#\s]+)/);
      if (m) return decodeURIComponent(m[1]);
      // not a url with ?duel= → treat the whole thing as the bare code.
      return s;
    } catch(e){ return ''; }
  }

  function origin(){
    try {
      if (location && location.origin && location.protocol.indexOf('http') === 0)
        return location.origin + (location.pathname || '');
    } catch(e){}
    // native / file build → point at the live origin (mirror CA.API_BASE intent).
    return 'https://skynet.lospolo.hu/animals/';
  }

  /* ---------------------------------------------------------------------------
   * local best store (localStorage 'ca_challenge')
   * ------------------------------------------------------------------------- */
  function readStore(){
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch(e){ return {}; }
  }
  function writeStore(o){
    try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch(e){}
  }
  // store best; returns true if this score beat (or set) the stored best.
  function storeBest(cid, score){
    try {
      if (!cid) return false;
      score = Math.max(0, Math.floor(score || 0));
      var store = readStore();
      var prev = (typeof store[cid] === 'number' && isFinite(store[cid])) ? store[cid] : null;
      if (prev == null || score > prev){
        store[cid] = score;
        writeStore(store);
        return true;
      }
      return false;
    } catch(e){ return false; }
  }

  /* ---------------------------------------------------------------------------
   * DAILY one-shot store (localStorage 'ca_daily') — one attempt per UTC day.
   * ------------------------------------------------------------------------- */
  function readDaily(){
    try {
      var raw = localStorage.getItem(DAILY_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch(e){ return {}; }
  }
  function writeDaily(o){
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(o)); } catch(e){}
  }
  // today's attempt record, or null if not attempted yet.
  function dailyRecord(){
    try {
      var rec = readDaily()[dailyId()];
      return (rec && typeof rec === 'object' && rec.attempted) ? rec : null;
    } catch(e){ return null; }
  }
  // has today's daily already been played (win OR lose)?
  function dailyAttempted(){ return !!dailyRecord(); }

  // Record today's attempt + grant the reward EXACTLY ONCE (idempotent: if the
  // day's record already exists it is returned untouched, never re-granting).
  // `cid` is the ARMED run's daily-id (ch.cid) — recomputing dailyId() here
  // booked a run finishing after UTC midnight onto the NEW day (burning it).
  // A `pending` stub (written at start) is overwritten by the real result.
  function markDailyAttempt(won, score, cid){
    try {
      var id = cid || dailyId();
      var store = readDaily();
      if (store[id] && store[id].attempted && !store[id].pending) return store[id]; // already done today
      score = Math.max(0, Math.floor(score || 0));
      var reward = dailyRewardFor(won, score);
      var rec = { attempted:true, won:!!won, score:score, reward:reward, ts:nowMs() };
      store[id] = rec;
      writeDaily(store);
      // grant coins (soft currency, guarded; never throws). Only on a win/payout.
      try {
        if (reward > 0 && CA.Meta && CA.Meta.addCoins) CA.Meta.addCoins(reward, 'dailyChallenge');
      } catch(_){}
      return rec;
    } catch(e){ return null; }
  }

  // Public state read for the menu — pure, side-effect-free.
  // -> { id, attempted, won, score, reward, maxReward, rewardBase }
  function dailyState(){
    var rec = dailyRecord();
    return {
      id: dailyId(),
      attempted: !!rec,
      won: !!(rec && rec.won),
      score: (rec && typeof rec.score === 'number') ? rec.score : 0,
      reward: (rec && typeof rec.reward === 'number') ? rec.reward : 0,
      maxReward: dailyMaxReward(),
      rewardBase: DAILY_REWARD_BASE
    };
  }

  // ms until the next UTC midnight (when a fresh daily unlocks). >= 0.
  function msUntilNextDaily(){
    try {
      var d = new Date();
      var next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
      return Math.max(0, next - d.getTime());
    } catch(e){ return 0; }
  }

  /* ---------------------------------------------------------------------------
   * DAILY id / seed / config
   * ------------------------------------------------------------------------- */
  function utcParts(){
    try {
      var d = new Date();
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
    } catch(e){ return { y: 2026, m: 1, d: 1 }; }
  }
  function pad2(n){ return (n < 10 ? '0' : '') + n; }

  function dailyId(){
    try {
      var p = utcParts();
      return 'daily_' + p.y + pad2(p.m) + pad2(p.d);
    } catch(e){ return 'daily_20260101'; }
  }

  function dailySeed(){
    try {
      var p = utcParts();
      // YYYYMMDD as a stable integer — same for everyone on a given UTC day.
      return p.y * 10000 + p.m * 100 + p.d;
    } catch(e){ return 20260101; }
  }

  // pick a class that actually exists, else fall back gracefully.
  function safeClass(want){
    try {
      if (CA.Classes && CA.Classes[want] && CA.Classes[want].abilities) return want;
      var list = (CA.Classes && CA.Classes.list) ? CA.Classes.list() : [];
      if (list.length) return list[0];
    } catch(e){}
    return undefined; // core tolerates undefined class
  }

  // themes that maps.js ships (deterministic pick from the date seed).
  var THEMES = ['grass','desert','jungle','snow','cave','volcano'];

  // The FIXED solo scenario for today — identical for ALL players. Player gets a
  // capybara hero team (fixed roster of 3 with classes) vs an AI worm team.
  // Derived ONLY from the date (NOT from the player's saved team).
  function dailyConfig(){
    try {
      var seed = dailySeed();
      var theme = THEMES[(seed % THEMES.length + THEMES.length) % THEMES.length];
      var playerClasses = [ safeClass('guardian'), safeClass('hunter'), safeClass('mage') ];
      var enemyClasses  = [ safeClass('necro'), safeClass('engineer'), safeClass('healer') ];
      return {
        gameMode: 'classic',
        theme: theme,
        seed: seed,
        vsAI: true,
        weather: 'clear',
        teams: [
          { kind:'capybara', name:'Kripta-kihívás', isAI:false, aiLevel:0,
            classes: playerClasses, size: 3 },
          { kind:'worm', name:'Napi ellenfél', isAI:true, aiLevel:2,
            classes: enemyClasses, size: 3 }
        ]
      };
    } catch(e){
      // last-ditch minimal config (still deterministic-ish, never throws).
      return { gameMode:'classic', theme:'grass', seed:20260101, vsAI:true,
        teams:[ { kind:'capybara', isAI:false, size:3 },
                { kind:'worm', isAI:true, aiLevel:2, size:3 } ] };
    }
  }

  /* ---------------------------------------------------------------------------
   * DUELS — self-contained (config encoded in the code, no server creation)
   * ------------------------------------------------------------------------- */
  // Build the tiny JSON config that gets encoded into a duel code.
  function buildDuelConfig(opts){
    opts = opts || {};
    var seed = (typeof opts.seed === 'number' && isFinite(opts.seed))
      ? (opts.seed | 0)
      : (U && U.randInt ? U.randInt(1, 1e9) : Math.floor(Math.random() * 1e9) + 1);
    var theme = (typeof opts.theme === 'string' && opts.theme) ? opts.theme
      : THEMES[(seed % THEMES.length + THEMES.length) % THEMES.length];
    var pCls = Array.isArray(opts.playerClasses) ? opts.playerClasses
      : [ safeClass('hunter'), safeClass('guardian'), safeClass('mage') ];
    var eCls = Array.isArray(opts.enemyClasses) ? opts.enemyClasses
      : [ safeClass('necro'), safeClass('healer'), safeClass('engineer') ];
    return {
      gameMode: 'classic',
      theme: theme,
      seed: seed,
      vsAI: true,
      weather: 'clear',
      teams: [
        { kind:'capybara', name:'Párbaj', isAI:false, aiLevel:0, classes:pCls, size:3 },
        { kind:'worm', name:'Ellenfél', isAI:true, aiLevel:2, classes:eCls, size:3 }
      ]
    };
  }

  // cid for a given duel code: 'duel_<shortHash>' (always matches CID_RE).
  function duelCid(code){
    var cid = 'duel_' + shortHash(code);
    if (cid.length > 48) cid = cid.slice(0, 48);
    return CID_RE.test(cid) ? cid : 'duel_x';
  }

  function createDuel(opts){
    try {
      var cfg = buildDuelConfig(opts);
      var code = encodeCfg(cfg);
      if (!code) return null;
      var cid = duelCid(code);
      var url = origin() + '?duel=' + encodeURIComponent(code);
      return { cid: cid, code: code, url: url };
    } catch(e){ return null; }
  }

  // Decode a duel code (or full URL) back into a CA.newGame config. The decoded
  // config carries its cid so start() can use it. Returns null on garbage.
  function parseDuel(codeOrUrl){
    try {
      var code = extractCode(codeOrUrl);
      if (!code) return null;
      var cfg = decodeCfg(code);
      if (!cfg || !Array.isArray(cfg.teams) || cfg.teams.length < 2) return null;
      // attach the cid + raw code so start('duel', cfg) can score against it.
      cfg._cid = duelCid(code);
      cfg._duelCode = code;
      return cfg;
    } catch(e){ return null; }
  }

  function openDuel(codeOrUrl){
    var cfg = parseDuel(codeOrUrl);
    if (!cfg) return false;
    return start('duel', cfg);
  }

  /* ---------------------------------------------------------------------------
   * START a scoring run
   * ------------------------------------------------------------------------- */
  function start(kind, cfgOrCode){
    try {
      wire(); // make sure scoring listeners are attached

      var cfg, cid;
      if (kind === 'daily'){
        // ONE-SHOT per UTC day: refuse to start if today's daily was already
        // played (win OR lose). Duels are unaffected by this guard.
        if (dailyAttempted()) return false;
        cfg = dailyConfig();
        cid = dailyId();
        // consume the one-shot AT START (pending stub) — quitting via pause->menu
        // or reloading mid-run no longer grants unlimited free retries. The stub
        // is overwritten with the real result by markDailyAttempt at game over.
        try {
          var _ds = readDaily();
          if (!_ds[cid]) { _ds[cid] = { attempted:true, pending:true, won:false, score:0, reward:0, ts:nowMs() }; writeDaily(_ds); }
        } catch(_){}
      } else if (kind === 'duel'){
        // accept a decoded config OR a raw code/url.
        cfg = (cfgOrCode && typeof cfgOrCode === 'object') ? cfgOrCode : parseDuel(cfgOrCode);
        if (!cfg) return false;
        cid = cfg._cid || (cfg._duelCode ? duelCid(cfg._duelCode) : duelCid(encodeCfg(cfg)));
      } else {
        return false;
      }

      // arm the scoring run BEFORE newGame so the 'gameStart' reset stays clean.
      S._challenge = { kind: kind, cid: cid, shots: 0, startTs: nowMs() };

      // strip our private fields so they don't confuse core/newGame.
      var opts = {};
      for (var k in cfg){ if (cfg.hasOwnProperty(k) && k.charAt(0) !== '_') opts[k] = cfg[k]; }

      if (typeof CA.newGame === 'function') CA.newGame(opts);
      else { S._challenge = null; return false; }

      return true;
    } catch(e){
      try { S._challenge = null; } catch(_){}
      return false;
    }
  }

  /* ---------------------------------------------------------------------------
   * SCORING — only ever runs while S._challenge is set (a challenge run is
   * active), so NORMAL matches are never scored/submitted.
   * ------------------------------------------------------------------------- */
  function computeScore(won, kills, shots, elapsedMs){
    try {
      if (!won) return 50; // participation
      kills = Math.max(0, kills | 0);
      shots = Math.max(0, shots | 0);
      var secs = Math.max(0, Math.floor((elapsedMs || 0) / 1000));
      var efficiency = Math.max(0, 600 - shots * 40);
      var timeBonus  = Math.max(0, 400 - secs);
      var score = 1000 + kills * 150 + efficiency + timeBonus;
      return Math.max(0, Math.floor(score));
    } catch(e){ return won ? 1000 : 50; }
  }

  // submit best score to match.php (only when signed in). Best-effort; silent.
  function submitScore(cid, score, meta){
    try {
      var A = CA.Account;
      if (!A || !A.user || !A.user.uid) return; // anonymous → local only
      var url = CA.api ? CA.api('match.php') : 'match.php';
      fetch(url, {
        method: 'POST',
        credentials: creds(),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: cid,
          uid: A.user.uid,
          token: A.token || '',
          score: score | 0,
          meta: meta || {}
        })
      }).catch(function(){});
    } catch(e){}
  }

  function onFired(unit, weapon){
    try {
      var ch = S._challenge;
      if (!ch) return;
      // only the HUMAN team's real shots count toward the efficiency bonus —
      // the daily's AI opponent fires every turn and was inflating ch.shots
      // (corrupting the shared-seed leaderboard). Utilities don't count either.
      if (!unit) return;
      var t = (typeof CA.getTeam === 'function') ? CA.getTeam(unit.teamId) : null;
      if (!t || t.isAI !== false) return;
      if (CA.isShotWeapon && weapon && weapon.id && !CA.isShotWeapon(weapon.id)) return;
      ch.shots = (ch.shots || 0) + 1;
    } catch(e){}
  }

  function onGameOver(winnerTeamId){
    try {
      var ch = S._challenge;
      if (!ch) return;                  // not a challenge run → never score/submit
      S._challenge = null;              // consume immediately (idempotent)

      // did the human (non-AI) team win?
      var won = false;
      try {
        var wt = (typeof CA.getTeam === 'function') ? CA.getTeam(winnerTeamId) : null;
        won = !!(wt && wt.isAI === false);
      } catch(_){}

      // kills + turns from the live match stats (best-effort).
      // ONLY the human team's kills count — totalKills summed every team, so the
      // AI killing YOUR units paid +150 each into your score (losing > winning).
      var kills = 0, turns = 0;
      try {
        var ms = (CA.Meta && CA.Meta.matchStats) ? CA.Meta.matchStats() : null;
        if (ms && ms.kills){
          var ptid = null;
          for (var ti = 0; ti < (S.teams || []).length; ti++){
            if (S.teams[ti] && S.teams[ti].isAI === false){ ptid = S.teams[ti].id; break; }
          }
          if (ptid != null && ms.kills[ptid] != null) kills = ms.kills[ptid] | 0;
        }
      } catch(_){}
      try { turns = (S.round | 0) || 0; } catch(_){}

      var shots = ch.shots | 0;
      var elapsed = nowMs() - (ch.startTs || nowMs());
      var score = computeScore(won, kills, shots, elapsed);

      // store local best + remember whether we beat it.
      var beat = storeBest(ch.cid, score);

      // record the run for the UI.
      _last = { cid: ch.cid, kind: ch.kind, score: score, shots: shots, won: won };

      if (ch.kind === 'daily'){
        // DAILY one-shot: persist today's attempt + grant its reward exactly ONCE
        // per UTC day (idempotent inside markDailyAttempt). This is the ONLY coin
        // payout for the daily — the generic per-run grant below is for duels.
        try {
          var drec = markDailyAttempt(won, score, ch.cid);
          if (drec && typeof drec.reward === 'number') _last.reward = drec.reward;
        } catch(_){}
      } else {
        // award a few coins for participating / beating your best (cosmetic soft
        // currency — guarded; never throws). Coins, not pay-to-win.
        try {
          if (CA.Meta && CA.Meta.addCoins){
            // coins only on a win or a new best — the flat 15/run participation
            // grant made instant-loss duel restarts a coin farm.
            var coins = (won || beat) ? (15 + (won ? 25 : 0) + (beat ? 20 : 0)) : 0;
            if (coins > 0) CA.Meta.addCoins(coins, 'challenge:' + ch.kind);
          }
        } catch(_){}
      }

      // RANKED SEASON: this challenge/duel result earns Ranglista-pont (RP). Guarded.
      try { if (CA.Ranked && CA.Ranked.recordResult){
        CA.Ranked.recordResult({ kind: ch.kind, score: score, won: won }); } } catch(_){}
      // CLAN points: contribute a slice of the score to your clan (best-effort).
      try { if (CA.Clans && CA.Clans.contribute){
        CA.Clans.contribute(Math.min(500, Math.round(score / 10))); } } catch(_){}

      // submit to the backend if signed in (tiny meta only).
      try {
        var team = '';
        try { var t = (S.teams || []).filter(function(x){ return x && !x.isAI; })[0]; if (t) team = t.kind || ''; } catch(_){}
        submitScore(ch.cid, score, { team: team, shots: shots, turns: turns });
      } catch(_){}
    } catch(e){
      try { S._challenge = null; } catch(_){}
    }
  }

  // subscribe ONCE to the scoring events.
  function wire(){
    try {
      if (_wired || !CA.events || !CA.events.on) return;
      _wired = true;
      CA.events.on('fired', function(){ onFired(); });
      CA.events.on('gameOver', function(winnerTeamId){ onGameOver(winnerTeamId); });
    } catch(e){}
  }

  /* ---------------------------------------------------------------------------
   * STANDINGS — GET match.php?cid=...&limit=... (8s timeout/abort like the
   * leaderboard screen). Resolves {ok:false} on any failure; never throws.
   * ------------------------------------------------------------------------- */
  function standings(cid, limit){
    return new Promise(function(resolve){
      try {
        if (!cid || !CID_RE.test(cid)){ resolve({ ok:false }); return; }
        limit = (typeof limit === 'number' && limit > 0) ? (limit | 0) : 20;
        var url = (CA.api ? CA.api('match.php') : 'match.php')
          + '?cid=' + encodeURIComponent(cid) + '&limit=' + limit;
        var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timer = setTimeout(function(){ try { if (ctl) ctl.abort(); } catch(_){} }, 8000);
        var opts = ctl ? { signal: ctl.signal, credentials:creds() } : { credentials:creds() };
        fetch(url, opts)
          .then(function(r){ return r.json(); })
          .then(function(data){
            clearTimeout(timer);
            if (data && data.ok && Array.isArray(data.scores)) resolve(data);
            else resolve({ ok:false });
          })
          .catch(function(){ clearTimeout(timer); resolve({ ok:false }); });
      } catch(e){ resolve({ ok:false }); }
    });
  }

  /* ---------------------------------------------------------------------------
   * public getters
   * ------------------------------------------------------------------------- */
  function localBest(cid){
    try {
      if (!cid) return null;
      var store = readStore();
      var v = store[cid];
      return (typeof v === 'number' && isFinite(v)) ? v : null;
    } catch(e){ return null; }
  }

  function lastResult(){ return _last; }

  function isActive(){
    try { return !!(S && S._challenge); } catch(e){ return false; }
  }

  /* ---------------------------------------------------------------------------
   * VIRALITY — "challenge me" deep-links + one-tap share.
   * Every share carries a ?duel= deep-link (consumed by index.html →
   * CA.Challenge.openDuel) so the recipient drops straight into the SAME arena.
   * All guarded — never throws, degrades to a copyable URL.
   * ------------------------------------------------------------------------- */

  // a brief toast via CA.events (the codebase's canonical toast channel). No-op
  // if the event bus is absent.
  function toast(text){
    try { if (CA.events && CA.events.emit) CA.events.emit('toast', String(text || '')); } catch(_){}
  }

  // Build a "challenge me" deep-link for TODAY'S daily: a self-contained duel
  // SEEDED with the daily seed, so opening the link plays the exact same arena
  // everyone got today. Falls back to a plain origin URL if duel creation fails.
  function dailyShareUrl(){
    try {
      var res = createDuel({ seed: dailySeed() });
      if (res && res.url) return res.url;
    } catch(_){}
    try { return origin(); } catch(_){ return 'https://skynet.lospolo.hu/animals/'; }
  }

  // Generic one-tap share of a deep-link URL. Order of preference:
  //   1. CA.Portal invite/share (ONLY when a portal SDK is live + the method
  //      exists) — guarded typeof check; the portal owns off-platform sharing.
  //   2. navigator.share (mobile share sheet) with a friendly title/text.
  //   3. clipboard copy (+ a toast) — the universal desktop/web fallback.
  // `opts.text` is an optional accompanying message. Returns true if a share
  // path was invoked, false if everything failed. NEVER throws.
  function shareUrl(url, opts){
    opts = opts || {};
    url = String(url || '');
    if (!url) return false;
    var title = opts.title || 'Squeak & Destroy';
    var text  = opts.text  || (CA.t ? CA.t('Hívd ki a haverod') : 'Hívd ki a haverod');

    // 1) portal-native invite, only when a live portal SDK exposes one.
    try {
      if (CA.Portal && typeof CA.Portal.active === 'function' && CA.Portal.active()){
        var fns = ['inviteLink','shareLink','happyTime','invite','share'];
        for (var i = 0; i < fns.length; i++){
          var fn = CA.Portal[fns[i]];
          if (typeof fn === 'function'){
            try { fn.call(CA.Portal, { url: url, text: text, title: title }); return true; }
            catch(_){ /* fall through to web paths */ }
          }
        }
      }
    } catch(_){}

    // 2) native web-share sheet (mobile).
    try {
      if (typeof navigator !== 'undefined' && navigator.share){
        navigator.share({ title: title, text: text, url: url })['catch'](function(){});
        return true;
      }
    } catch(_){}

    // 3) clipboard fallback (+ toast).
    return copyToClipboard(url);
  }

  // copy text to the clipboard with a legacy fallback; toasts on success. Bool.
  function copyToClipboard(text){
    text = String(text || '');
    if (!text) return false;
    var ok = function(){ toast(CA.t ? CA.t('Link kimásolva!') : 'Link kimásolva!'); };
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(ok, function(){ if (legacyCopy(text)) ok(); });
        return true;
      }
    } catch(_){}
    if (legacyCopy(text)){ ok(); return true; }
    return false;
  }
  function legacyCopy(text){
    try {
      if (typeof document === 'undefined' || !document.body) return false;
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var done = false; try { done = document.execCommand('copy'); } catch(_){}
      document.body.removeChild(ta);
      return !!done;
    } catch(_){ return false; }
  }

  // wire scoring listeners as soon as the module loads (so a deep-linked duel
  // start outside our start() path is still scored if S._challenge gets set).
  wire();

  /* ---------------------------------------------------------------------------
   * export
   * ------------------------------------------------------------------------- */
  CA.Challenge = {
    dailyId: dailyId,
    dailySeed: dailySeed,
    dailyConfig: dailyConfig,
    // DAILY one-shot status / reward economy (for the menu UI).
    dailyAttempted: dailyAttempted,
    dailyState: dailyState,
    dailyMaxReward: dailyMaxReward,
    msUntilNextDaily: msUntilNextDaily,
    start: start,
    createDuel: createDuel,
    parseDuel: parseDuel,
    openDuel: openDuel,
    standings: standings,
    localBest: localBest,
    lastResult: lastResult,
    isActive: isActive,
    // VIRALITY — "challenge me" deep-link + one-tap share (all guarded).
    dailyShareUrl: dailyShareUrl,
    shareUrl: shareUrl,
    copyLink: copyToClipboard,
    // exposed for tests / advanced callers (not part of the required surface):
    _computeScore: computeScore,
    _STORE_KEY: STORE_KEY,
    _DAILY_KEY: DAILY_KEY
  };
})();
