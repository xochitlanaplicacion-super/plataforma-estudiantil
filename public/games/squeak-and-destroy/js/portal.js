/* ============================================================================
 * Squeak & Destroy — portal.js :: CA.Portal
 * Transport-AGNOSTIC web-portal ad/lifecycle layer (Poki + CrazyGames).
 *
 * GOAL: one tiny, defensive abstraction the game can call WITHOUT knowing which
 * portal (if any) hosts it. The main web build and the Electron/Steam build run
 * WITHOUT a portal context → every CA.Portal.* call is a NO-OP and NO SDK is
 * ever injected or loaded. Only the gated /demo build (or an explicit override)
 * runs in a portal context.
 *
 * ── PORTAL DETECTION (read by build integrator) ────────────────────────────
 * A portal context is active when ANY of these resolve to a known portal id:
 *   1. window.CA_PORTAL          — build-time global ('poki' | 'crazygames')
 *      (the integrator can set this in index.html / build.js for the /demo build)
 *   2. CA.PORTAL                 — same, but on the CA namespace
 *   3. ?portal=poki / ?portal=crazygames  — URL query param (QA / per-host)
 * Anything else (absent / unknown value) → NO portal → full NO-OP.
 *
 * ── SDK SELF-INJECTION ─────────────────────────────────────────────────────
 * The SDK <script> is injected from JS on init() — NEVER from index.html — so
 * the main build never even fetches a portal SDK.
 *   Poki        → //game-cdn.poki.com/scripts/v2/poki-sdk.js
 *   CrazyGames  → https://sdk.crazygames.com/crazygames-sdk-v3.js
 *
 * ── UNIFIED API (Promise-based, defensive, NO-OP without an SDK) ────────────
 *   CA.Portal.init()            : Promise<void>   load + init SDK, signal loaded
 *   CA.Portal.gameplayStart()   : void            a match started (PLAYING)
 *   CA.Portal.gameplayStop()    : void            a match ended / left to menu
 *   CA.Portal.interstitial()    : Promise<void>   show a between-match ad break
 *   CA.Portal.rewarded()        : Promise<bool>   show rewarded ad → true if earned
 *   CA.Portal.active()          : bool            is a live portal SDK present?
 *
 * The interstitial/rewarded breaks pause + mute the game defensively for the
 * duration of the ad and restore the prior state afterwards, so even if a hook
 * ever fires mid-flow nothing keeps running/playing audio under the ad.
 * ==========================================================================*/
(function(){
  'use strict';

  // ---- portal detection (pure, no side effects) ---------------------------
  function detectPortal(){
    try {
      var p = (window.CA_PORTAL || (window.CA && CA.PORTAL) || '');
      if (!p){
        var m = /[?&]portal=([a-z]+)/i.exec(location.search || '');
        if (m) p = m[1];
      }
      p = String(p || '').toLowerCase();
      if (p === 'poki') return 'poki';
      if (p === 'crazygames' || p === 'crazy' || p === 'cg') return 'crazygames';
    } catch(e){}
    return null;        // no / unknown portal → full NO-OP
  }

  var WHICH = detectPortal();      // 'poki' | 'crazygames' | null  (resolved once)
  var SDK = null;                  // the live SDK handle once init() resolves
  var GAME = null;                 // CrazyGames game module (SDK.game), if any
  var AD = null;                   // CrazyGames ad module (SDK.ad), if any
  var initP = null;                // memoized init() promise
  var playing = false;             // dedupe gameplayStart/Stop

  function noop(){}
  var resolved = function(v){ return Promise.resolve(v); };

  // ---- defensive ad-break gate: pause + mute the game, restore after -------
  function beginBreak(){
    var prev = { paused: undefined, muted: undefined };
    try { if (CA.state){ prev.paused = CA.state.paused; CA.state.paused = true; } } catch(e){}
    try { if (CA.Audio){ prev.muted = CA.Audio.muted; CA.Audio.muted = true; } } catch(e){}
    return prev;
  }
  function endBreak(prev){
    try { if (CA.state && prev && prev.paused !== undefined) CA.state.paused = prev.paused; } catch(e){}
    try { if (CA.Audio && prev && prev.muted !== undefined) CA.Audio.muted = prev.muted; } catch(e){}
  }

  // ---- dynamic <script> injection -----------------------------------------
  function injectScript(src){
    return new Promise(function(resolve, reject){
      try {
        var s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = function(){ resolve(); };
        s.onerror = function(){ reject(new Error('portal SDK load failed: ' + src)); };
        (document.head || document.documentElement).appendChild(s);
      } catch(e){ reject(e); }
    });
  }

  /* ========================== POKI adapter ============================== */
  var pokiAdapter = {
    init: function(){
      // poki.html already ships the SDK <script> tag — injecting it AGAIN meant
      // 2x download + 2x init against Poki's init-once guidance.
      var load = (window.PokiSDK) ? resolved() : injectScript('//game-cdn.poki.com/scripts/v2/poki-sdk.js');
      return load.then(function(){
        if (typeof window.PokiSDK === 'undefined' || !window.PokiSDK) throw new Error('PokiSDK missing');
        SDK = window.PokiSDK;
        var p;
        try { p = SDK.init(); } catch(e){ p = null; }
        p = (p && typeof p.then === 'function') ? p : resolved();
        return p.then(function(){
          try { SDK.gameLoadingFinished(); } catch(e){}
        }, function(){
          // SDK.init() can reject behind ad-blockers — still mark loaded so the
          // game proceeds; subsequent ad calls just no-op/resolve.
          try { SDK.gameLoadingFinished(); } catch(e){}
        });
      });
    },
    gameplayStart: function(){ try { SDK.gameplayStart(); } catch(e){} },
    gameplayStop:  function(){ try { SDK.gameplayStop();  } catch(e){} },
    interstitial: function(){
      var prev = beginBreak();
      var done = function(){ endBreak(prev); };
      try {
        var p = SDK.commercialBreak();
        if (p && typeof p.then === 'function') return p.then(done, done);
      } catch(e){}
      done(); return resolved();
    },
    rewarded: function(){
      var prev = beginBreak();
      try {
        var p = SDK.rewardedBreak();
        if (p && typeof p.then === 'function'){
          return p.then(function(ok){ endBreak(prev); return ok !== false; },
                        function(){ endBreak(prev); return false; });
        }
      } catch(e){}
      endBreak(prev); return resolved(false);
    },
    // Poki has no native friend-invite link → null (caller falls back to the
    // game's own ?duel= deep-link via navigator.share / clipboard).
    inviteLink: function(){ return resolved(null); },
    happyTime: function(){ try { if (SDK && SDK.happyTime) SDK.happyTime(); } catch(e){} }
  };

  /* ======================= CRAZYGAMES adapter =========================== */
  var cgAdapter = {
    init: function(){
      return injectScript('https://sdk.crazygames.com/crazygames-sdk-v3.js').then(function(){
        var root = window.CrazyGames && window.CrazyGames.SDK;
        if (!root) throw new Error('CrazyGames SDK missing');
        SDK = root;
        var p;
        try { p = SDK.init(); } catch(e){ p = null; }
        p = (p && typeof p.then === 'function') ? p : resolved();
        return p.then(function(){
          try { GAME = SDK.game || null; } catch(e){ GAME = null; }
          try { AD = SDK.ad || null; } catch(e){ AD = null; }
        }, function(){ /* init failed → adapter stays active but ad calls no-op */ });
      });
    },
    gameplayStart: function(){ try { if (GAME && GAME.gameplayStart) GAME.gameplayStart(); } catch(e){} },
    gameplayStop:  function(){ try { if (GAME && GAME.gameplayStop)  GAME.gameplayStop();  } catch(e){} },
    interstitial: function(){
      if (!AD || !AD.requestAd) return resolved();
      var prev = beginBreak();
      return new Promise(function(resolve){
        var fin = function(){ endBreak(prev); resolve(); };
        try {
          AD.requestAd('midgame', { adFinished: fin, adError: fin, adStarted: noop });
        } catch(e){ fin(); }
      });
    },
    rewarded: function(){
      if (!AD || !AD.requestAd) return resolved(false);
      var prev = beginBreak();
      return new Promise(function(resolve){
        var earned = false;
        var done = function(){ endBreak(prev); resolve(earned); };
        try {
          AD.requestAd('rewarded', {
            adStarted: noop,
            adFinished: function(){ earned = true; done(); },
            adError: function(){ earned = false; done(); }
          });
        } catch(e){ done(); }
      });
    },
    // CrazyGames native friend-invite: SDK.game.inviteLink({...}) → shareable URL
    // that re-launches the game on CG with the params. Handles sync or promise.
    inviteLink: function(params){
      try {
        if (GAME && GAME.inviteLink){
          var r = GAME.inviteLink(params || {});
          if (r && typeof r.then === 'function') return r.then(function(u){ return u || null; }, function(){ return null; });
          return resolved(r || null);
        }
      } catch(e){}
      return resolved(null);
    },
    happyTime: function(){ try { if (GAME && GAME.happytime) GAME.happytime(); } catch(e){} }
  };

  var adapter = WHICH === 'poki' ? pokiAdapter
              : WHICH === 'crazygames' ? cgAdapter
              : null;

  /* ========================== PUBLIC API ================================ */
  var Portal = {
    which: WHICH,                       // 'poki' | 'crazygames' | null (for diagnostics)

    // is a live portal SDK present? (false until init resolves an SDK handle)
    active: function(){ return !!(adapter && SDK); },

    // load + init the SDK exactly once. Resolves even on SDK failure (NO-OP mode).
    init: function(){
      if (!adapter) return resolved();          // no portal context → NO-OP
      if (initP) return initP;
      initP = adapter.init().catch(function(e){
        try { console.warn('[Portal] init failed, running ad-free:', (e && e.message) || e); } catch(_){}
        SDK = null;                              // ensure active() stays false
      });
      return initP;
    },

    gameplayStart: function(){
      if (!this.active()) return;
      // if a prior match was abandoned to the menu without a gameOver, close it
      // out first so the portal sees a clean stop→start (idempotent either way).
      if (playing){ try { adapter.gameplayStop(); } catch(e){} }
      playing = true;
      adapter.gameplayStart();
    },

    gameplayStop: function(){
      if (!this.active() || !playing) return;
      playing = false;
      adapter.gameplayStop();
    },

    // between-match ad break. The game should already be paused/in-menu, but we
    // pause+mute defensively for the break's duration just in case.
    interstitial: function(){
      if (!this.active()) return resolved();
      return adapter.interstitial();
    },

    // rewarded ad → resolves true only if the reward was actually earned.
    rewarded: function(){
      if (!this.active()) return resolved(false);
      return adapter.rewarded();
    },

    // friend-invite link (portal-native). Resolves to a shareable URL string, or
    // null when no portal / unsupported → caller falls back to the game's own
    // ?duel= deep-link via navigator.share / clipboard.
    inviteLink: function(params){
      if (!this.active() || !adapter.inviteLink) return resolved(null);
      try { return adapter.inviteLink(params); } catch(e){ return resolved(null); }
    },

    // celebratory "happy moment" hook (win/last-kill). No-op without a portal.
    happyTime: function(){
      if (!this.active() || !adapter.happyTime) return;
      try { adapter.happyTime(); } catch(e){}
    }
  };

  CA.Portal = Portal;
})();
