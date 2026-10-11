/* ============================================================================
 * Squeak & Destroy — ads.js  ::  CA.Ads — ad abstraction (native + web portals).
 *
 * MONETIZATION MODEL (locked 2026-06-08, extended 2026-06-09 for web portals):
 *   Mobile (iOS / Android)      → FREE with ads + $4.99 IAP to REMOVE ADS.
 *                                 Uses AdMob via @capacitor-community/admob.
 *   Web PORTALS (Poki / CrazyGames) → FREE with the PORTAL's own ad SDK. The
 *                                 portal serves rewarded + interstitial ads and
 *                                 pays a revenue share. Activated ONLY when the
 *                                 portal SDK is present on the page.
 *   Plain web (lospolo.hu) / Electron / Steam → NO ads, ever. With no native
 *                                 plugin AND no portal SDK on the page, EVERY
 *                                 method here stays a safe NO-OP — the SkyNet
 *                                 web build is completely unaffected.
 *
 * HOW THE WEB-PORTAL PATH TURNS ON (no effect on the normal site):
 *   ads.js never injects an ad SDK by itself. A portal SUBMISSION uses its own
 *   index.html that includes the portal's SDK script, e.g.
 *     Poki:        <script src="//game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>
 *     CrazyGames:  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
 *   When that script is present it exposes window.PokiSDK / window.CrazyGames,
 *   which CA.Ads.init() detects and initialises. On lospolo.hu neither global
 *   exists, so _detectPortal() returns null and everything is a no-op.
 *   (Optional convenience: CA.Ads.loadPortalSDK('poki'|'crazygames') will inject
 *   the script at runtime — only call it from a portal build, never the site.)
 *
 * STRATEGY (from the launch research — see docs/MOBILE_MONETIZATION.md):
 *   - REWARDED is the primary, opt-in format (double coins, REVIVE, extra weapon
 *     crate, etc.). Player-initiated → protects retention + store/portal rating.
 *   - INTERSTITIAL is used SPARINGLY between matches. On NATIVE we enforce our own
 *     frequency cap; on a PORTAL we just call the SDK's commercial break and let
 *     the portal decide whether/when to actually show one (their policy).
 *   - Suppressed entirely once the player bought ad-free (CA.Entitlement.isFull()).
 *
 * DESIGN RULES (match the rest of the codebase):
 *   - Vanilla browser JS, CA.* namespace, ES2018-clean (no ?? / optional-chain /
 *     arrow), idempotent load, node --check must pass.
 *   - Feature-detect EVERYTHING; never throw. Every public method try/catch'd.
 *
 * PUBLIC API:
 *   CA.Ads.init()           -> Promise   : init native plugin AND/OR portal SDK.
 *   CA.Ads.rewarded()       -> Promise<boolean> : show a rewarded video; resolves
 *                              true ONLY if watched to completion (→ grant reward).
 *                              Routes to native AdMob, else the portal SDK, else false.
 *   CA.Ads.interstitial()   -> Promise   : show a between-match ad (native capped /
 *                              portal-decided); no-op if ad-free or unavailable.
 *   CA.Ads.gameplayStart()  -> void      : tell the portal SDK gameplay (re)started.
 *   CA.Ads.gameplayStop()   -> void      : tell the portal SDK gameplay paused/ended.
 *   CA.Ads.loadingFinished()-> void      : tell the portal SDK the game finished loading.
 *   CA.Ads.available()      -> boolean   : is the NATIVE ad plugin usable here?
 *   CA.Ads.portalAvailable()-> boolean   : is a web-portal ad SDK ready here?
 *   CA.Ads.canReward()      -> boolean   : is ANY rewarded source available?
 *   CA.Ads.adFree()         -> boolean   : has the player removed ads?
 *
 * LOAD ORDER: AFTER entitlement.js (CA.Entitlement) and i18n.js / core (CA.events).
 * ==========================================================================*/
(function(){
  'use strict';
  if (!window.CA) window.CA = {};
  if (CA.Ads) return;   // idempotent

  // ----------------------------------------------------------------------------
  // ⚠️ TEST AD UNIT IDs — Google's official AdMob test units. They ALWAYS serve
  // a test ad and never generate revenue / never risk an account ban. REPLACE
  // these with your real ad unit IDs from the AdMob console before shipping a
  // production NATIVE build (see docs/MOBILE_MONETIZATION.md).
  // (Poki / CrazyGames do NOT use ad-unit IDs — their SDK serves ads directly.)
  // ----------------------------------------------------------------------------
  var TEST_IDS = {
    ios: {
      rewarded:     'ca-app-pub-3940256099942544/1712485313',
      interstitial: 'ca-app-pub-3940256099942544/4411468910',
      banner:       'ca-app-pub-3940256099942544/2934735716'
    },
    android: {
      rewarded:     'ca-app-pub-3940256099942544/5224354917',
      interstitial: 'ca-app-pub-3940256099942544/1033173712',
      banner:       'ca-app-pub-3940256099942544/6300978111'
    }
  };

  // Frequency cap for NATIVE interstitials: at most 1 every N finished matches.
  var INTERSTITIAL_EVERY_N_MATCHES = 3;

  // Portal SDK script URLs (only used by the optional loadPortalSDK helper).
  var PORTAL_SDK_URL = {
    poki:       '//game-cdn.poki.com/scripts/v2/poki-sdk.js',
    crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js'
  };

  var A = {
    _ready:    false,   // init() resolved
    _native:   false,   // running inside Capacitor with the ad plugin present
    _plugin:   null,    // the AdMob plugin object (window.Capacitor plugin)
    _matchCount: 0,     // finished matches since last interstitial (native cap)
    _useTestIds: true,  // flip to false (or gate on a build flag) for production
    _portal:   null,    // 'poki' | 'crazygames' | null
    _portalReady: false,// portal SDK init() resolved

    /* ---- platform helpers ---- */
    _isNative: function(){
      try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
      catch(e){ return !!window.Capacitor; }
    },
    _platform: function(){
      try { return (window.Capacitor && window.Capacitor.getPlatform) ? window.Capacitor.getPlatform() : 'web'; }
      catch(e){ return 'web'; }
    },
    _getPlugin: function(){
      // @capacitor-community/admob registers as Capacitor.Plugins.AdMob.
      try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) {
          return window.Capacitor.Plugins.AdMob;
        }
        if (window.AdMob) return window.AdMob; // some bundlers expose it globally
      } catch(e){}
      return null;
    },
    _ids: function(){
      var p = this._platform();
      var set = (p === 'ios') ? TEST_IDS.ios : TEST_IDS.android;
      // When real IDs are wired, branch on this._useTestIds here.
      return set;
    },

    /* ---- portal (web) helpers ---- */
    // Which web-portal ad SDK (if any) is present on this page?
    _detectPortal: function(){
      try {
        if (window.PokiSDK) return 'poki';
        if (window.CrazyGames && window.CrazyGames.SDK) return 'crazygames';
      } catch(e){}
      return null;
    },
    // Optional: inject a portal SDK at runtime. ONLY call from a portal build —
    // never on lospolo.hu (it would pull an external ad SDK onto the site).
    loadPortalSDK: function(which){
      try {
        var url = PORTAL_SDK_URL[which];
        if (!url) return Promise.resolve(false);
        if (this._detectPortal()) return Promise.resolve(true); // already present
        return new Promise(function(resolve){
          var s = document.createElement('script');
          s.src = url; s.async = true;
          s.onload = function(){ resolve(true); };
          s.onerror = function(){ resolve(false); };
          (document.head || document.documentElement).appendChild(s);
        });
      } catch(e){ return Promise.resolve(false); }
    },
    // Best-effort: mute/unmute game audio around a portal ad (portals expect the
    // game to silence itself while an ad plays). Fully guarded; no-op if absent.
    _audioForAd: function(muting){
      try { if (CA.Audio && CA.Audio.setAdMute) { CA.Audio.setAdMute(!!muting); return; } } catch(e){}
      try { if (CA.events) CA.events.emit(muting ? 'adStarted' : 'adEnded'); } catch(e){}
    },

    /* ---- public state ---- */
    // is there a usable NATIVE ad plugin on this platform?
    available: function(){
      return !!(this._native && this._plugin);
    },
    // is a web-portal ad SDK ready on this page?
    portalAvailable: function(){
      return !!(this._portal && this._portalReady);
    },
    // is ANY rewarded ad source available (native OR portal)?
    canReward: function(){
      if (this.adFree()) return false;
      return this.available() || this.portalAvailable();
    },
    // has the player removed ads (bought the $4.99 IAP / full unlock)?
    adFree: function(){
      try { return !!(CA.Entitlement && CA.Entitlement.isFull && CA.Entitlement.isFull()); }
      catch(e){ return false; }
    },

    /* ---- init: native plugin AND/OR portal SDK; safe no-op everywhere else ---- */
    init: function(){
      var self = this;
      if (self._ready) return Promise.resolve();
      self._ready = true;
      var tasks = [];
      // (1) native AdMob (mobile app shell)
      try {
        self._native = self._isNative();
        if (self._native) {
          self._plugin = self._getPlugin();
          if (self._plugin && typeof self._plugin.initialize === 'function') {
            tasks.push(Promise.resolve(self._plugin.initialize.call(self._plugin, {
              initializeForTesting: self._useTestIds
            })).catch(function(){}));
          }
        }
      } catch(e){}
      // (2) web portal SDK (Poki / CrazyGames) — only if its global is present.
      try { tasks.push(self._initPortal()); } catch(e){}
      return Promise.all(tasks).then(function(){}).catch(function(){});
    },

    // Detect + initialise whichever portal SDK is on the page (no-op if none).
    _initPortal: function(){
      var self = this;
      var which = self._detectPortal();
      self._portal = which;
      if (!which) return Promise.resolve();
      try {
        if (which === 'poki' && window.PokiSDK && typeof window.PokiSDK.init === 'function') {
          return Promise.resolve(window.PokiSDK.init()).then(function(){
            self._portalReady = true;
            try { if (typeof window.PokiSDK.gameLoadingFinished === 'function') window.PokiSDK.gameLoadingFinished(); } catch(e){}
          }).catch(function(){ /* still no-op if init rejects */ });
        }
        if (which === 'crazygames' && window.CrazyGames.SDK && typeof window.CrazyGames.SDK.init === 'function') {
          return Promise.resolve(window.CrazyGames.SDK.init()).then(function(){
            self._portalReady = true;
          }).catch(function(){});
        }
      } catch(e){}
      return Promise.resolve();
    },

    /* ---- gameplay / loading markers (portals use these for ad timing/UX) ---- */
    gameplayStart: function(){
      try {
        if (!this.portalAvailable()) return;
        if (this._portal === 'poki' && window.PokiSDK.gameplayStart) window.PokiSDK.gameplayStart();
        else if (this._portal === 'crazygames' && window.CrazyGames.SDK.game) window.CrazyGames.SDK.game.gameplayStart();
      } catch(e){}
    },
    gameplayStop: function(){
      try {
        if (!this.portalAvailable()) return;
        if (this._portal === 'poki' && window.PokiSDK.gameplayStop) window.PokiSDK.gameplayStop();
        else if (this._portal === 'crazygames' && window.CrazyGames.SDK.game) window.CrazyGames.SDK.game.gameplayStop();
      } catch(e){}
    },
    loadingFinished: function(){
      try {
        if (!this.portalAvailable()) return;
        if (this._portal === 'poki' && window.PokiSDK.gameLoadingFinished) window.PokiSDK.gameLoadingFinished();
        else if (this._portal === 'crazygames' && window.CrazyGames.SDK.game && window.CrazyGames.SDK.game.loadingStop) window.CrazyGames.SDK.game.loadingStop();
      } catch(e){}
    },

    /* ---- REWARDED (primary): resolve true only if watched to completion ---- */
    rewarded: function(){
      var self = this;
      try {
        if (self.adFree()) return Promise.resolve(false);
        // (1) native AdMob first
        if (self.available()) {
          var p = self._plugin, ids = self._ids();
          if (typeof p.prepareRewardVideoAd === 'function' && typeof p.showRewardVideoAd === 'function') {
            return Promise.resolve(p.prepareRewardVideoAd({ adId: ids.rewarded }))
              .then(function(){ return p.showRewardVideoAd(); })
              .then(function(reward){
                var granted = !!reward;
                try { if (granted && CA.events) CA.events.emit('adRewardGranted', reward); } catch(e){}
                return granted;
              })
              .catch(function(){ return false; });
          }
        }
        // (2) web portal
        if (self.portalAvailable()) return self._portalRewarded();
        return Promise.resolve(false);
      } catch(e){ return Promise.resolve(false); }
    },

    // Portal rewarded video → Promise<boolean> (true only on full completion).
    _portalRewarded: function(){
      var self = this;
      return new Promise(function(resolve){
        var done = false;
        var finish = function(ok){
          if (done) return; done = true;
          self._audioForAd(false);
          var g = !!ok;
          try { if (g && CA.events) CA.events.emit('adRewardGranted', { portal: self._portal }); } catch(e){}
          resolve(g);
        };
        try {
          self._audioForAd(true);
          if (self._portal === 'poki' && window.PokiSDK && typeof window.PokiSDK.rewardedBreak === 'function') {
            Promise.resolve(window.PokiSDK.rewardedBreak()).then(function(ok){ finish(ok); }, function(){ finish(false); });
            return;
          }
          if (self._portal === 'crazygames' && window.CrazyGames.SDK && window.CrazyGames.SDK.ad) {
            window.CrazyGames.SDK.ad.requestAd('rewarded', {
              adStarted: function(){},
              adFinished: function(){ finish(true); },
              adError:    function(){ finish(false); }
            });
            return;
          }
          finish(false);
        } catch(e){ finish(false); }
      });
    },

    /* ---- INTERSTITIAL (between matches; ad-free → never) ---- */
    // Call markMatchFinished() from the match-over flow; interstitial() decides
    // (native: our cap; portal: the SDK decides) whether an ad should show.
    markMatchFinished: function(){
      try { this._matchCount++; } catch(e){}
    },
    _capReached: function(){
      return this._matchCount >= INTERSTITIAL_EVERY_N_MATCHES;
    },
    interstitial: function(){
      var self = this;
      try {
        if (self.adFree()) return Promise.resolve();            // bought ad-free → never
        // (1) native AdMob — frequency-capped by us
        if (self.available()) {
          if (!self._capReached()) return Promise.resolve();
          var p = self._plugin, ids = self._ids();
          if (typeof p.prepareInterstitial !== 'function' || typeof p.showInterstitial !== 'function') {
            return Promise.resolve();
          }
          self._matchCount = 0;
          return Promise.resolve(p.prepareInterstitial({ adId: ids.interstitial }))
            .then(function(){ return p.showInterstitial(); })
            .catch(function(){});
        }
        // (2) web portal — let the SDK decide whether to actually show one.
        if (self.portalAvailable()) return self._portalCommercial();
        return Promise.resolve();
      } catch(e){ return Promise.resolve(); }
    },

    // Portal interstitial / commercial break (no reward).
    _portalCommercial: function(){
      var self = this;
      return new Promise(function(resolve){
        var done = false;
        var finish = function(){ if (done) return; done = true; self._audioForAd(false); resolve(); };
        try {
          self._audioForAd(true);
          if (self._portal === 'poki' && window.PokiSDK && typeof window.PokiSDK.commercialBreak === 'function') {
            Promise.resolve(window.PokiSDK.commercialBreak()).then(finish, finish);
            return;
          }
          if (self._portal === 'crazygames' && window.CrazyGames.SDK && window.CrazyGames.SDK.ad) {
            window.CrazyGames.SDK.ad.requestAd('midgame', {
              adFinished: finish,
              adError:    finish
            });
            return;
          }
          finish();
        } catch(e){ finish(); }
      });
    }
  };

  // Best-effort auto-wiring: when a match ends, tell the portal gameplay stopped.
  // (gameplayStart() is called by the game when a match begins — see core hook.)
  try {
    if (CA.events && CA.events.on) {
      CA.events.on('gameOver', function(){ try { A.gameplayStop(); } catch(e){} });
    }
  } catch(e){}

  CA.Ads = A;
})();
