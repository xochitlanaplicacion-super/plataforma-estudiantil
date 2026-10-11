/* ============================================================================
 * Squeak & Destroy — perf-tier.js  ::  CA.PerfTier — startup perf auto-tier.
 *
 * GOAL: pick a sensible DEFAULT graphics quality ('low'|'normal'|'high') on the
 * very first run, so a weak phone doesn't start on the 'high' code default and
 * stutter, and a beefy desktop isn't needlessly throttled — WITHOUT ever
 * fighting an explicit user choice. Quality is read all over (fx.js
 * lowQ/medQ/qScale/maxParticles, weather, hazards, entities) to scale particle
 * counts / DPR / effects, so getting the first frames right matters.
 *
 * PURE ADD-ON: if applyDefault() is never called, the game is byte-for-byte
 * unchanged. If called, it ONLY sets a default; it never overrides a quality the
 * user has already saved through the settings screen.
 *
 * PUBLIC API (called by core.js init, guarded):
 *   CA.PerfTier.detect()        -> 'low'|'normal'|'high'
 *        Cheap, SYNCHRONOUS static heuristic (cores / memory / DPR / mobile).
 *   CA.PerfTier.benchmark(cb)   -> void  (async, optional refinement)
 *        ~0.5s of idle rAF frame-delta sampling; if achieved FPS is
 *        consistently <45, nudges the tier DOWN one step, then cb(finalTier).
 *        Completely safe / no-op if rAF|performance is unavailable. Non-blocking.
 *   CA.PerfTier.applyDefault()  -> void  (the one call core.js makes)
 *        If the user has an EXPLICIT saved quality → DO NOTHING. Otherwise set
 *        CA.settings.quality = detect() immediately, then kick off benchmark()
 *        to (maybe) lower it once measured — still respecting a later explicit
 *        choice. Fully try/catch'd; never throws.
 *
 * DESIGN RULES (match the rest of the codebase):
 *   - Vanilla browser JS, CA.* namespace, ES2018-clean (no ?? / optional-chain /
 *     arrow fns where it matters), IIFE module, idempotent load.
 *   - Feature-detect EVERYTHING; never throw. iOS-safe; no canvas creation.
 *   - node --check must pass.
 *
 * EXPLICIT-CHOICE DETECTION: settings persist to localStorage 'ca_settings'
 * (see contract.js). CA.settings.save() ALWAYS writes a `quality` field, and the
 * settings screen (ui.js) calls save() the moment the user toggles quality. So
 * the presence of a `quality` field in the stored 'ca_settings' blob == the user
 * has an effective, explicit quality. When that blob has a quality we leave it
 * alone. We additionally remember our own auto-pick in 'ca_perf_auto' so a value
 * we wrote ourselves is never mistaken for a user choice on a later run.
 * ==========================================================================*/
(function(){
  'use strict';
  if (!window.CA) window.CA = {};
  if (CA.PerfTier) return;   // idempotent

  var SETTINGS_KEY = 'ca_settings';   // matches contract.js
  var AUTO_KEY     = 'ca_perf_auto';  // our own marker: the value WE auto-applied

  var TIERS = ['low', 'normal', 'high'];

  // ---- small safe helpers ---------------------------------------------------
  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch(e){} }

  // Step a tier value DOWN by one ('high'->'normal'->'low'->'low').
  function stepDown(tier){
    var i = TIERS.indexOf(tier);
    if (i < 0) return 'normal';
    return TIERS[Math.max(0, i - 1)];
  }

  // Coarse mobile detection: a touch-primary device. Touch points + UA, kept
  // deliberately loose (iPadOS reports as desktop Safari, handled via DPR/cores).
  function isMobileUA(){
    try {
      var ua = (navigator.userAgent || navigator.vendor || '') + '';
      if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)) return true;
    } catch(e){}
    try {
      // Pointer/touch fallback (iPadOS desktop-mode, hybrids).
      var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      var touch  = ('ontouchstart' in window) || (navigator.maxTouchPoints > 1);
      if (coarse && touch) return true;
    } catch(e){}
    return false;
  }

  // --------------------------------------------------------------------------
  // detect() — cheap synchronous static heuristic.
  //
  // Signals (all feature-detected; missing ones fall back to neutral defaults):
  //   cores = navigator.hardwareConcurrency   (logical CPUs; absent on old iOS)
  //   mem   = navigator.deviceMemory          (GiB, Chrome-only, absent elsewhere)
  //   dpr   = window.devicePixelRatio         (display density)
  //   mobile= touch + UA coarse-pointer check
  //
  // THRESHOLDS / RATIONALE (rules of thumb from the perf research):
  //   1. Very high DPR (>=3) AND few cores (<=4)  -> 'low'
  //      Dense phone screens push ~3x the pixels; with <=4 cores the fill-rate +
  //      JS budget can't keep up at 'high'. (The game also caps DPR at 1.75 in
  //      core.js, but raw DPR is still the best proxy for "lots of pixels".)
  //   2. Explicitly weak: cores <= 2, OR deviceMemory <= 2 GiB  -> 'low'
  //      Low-end / budget phones and old tablets.
  //   3. Mobile, but not weak: -> 'normal'
  //      Modern phones (6-8 cores, DPR ~2.5-3) run the game fine at 'normal';
  //      'high' glow/particles are the first thing to cost frames on a phone.
  //   4. Desktop / iPad-class: many cores (>=8) AND DPR <= 2  -> 'high'
  //      Laptops/desktops and big iPads with moderate density + CPU headroom.
  //      (deviceMemory, when present, must also not be tiny — covered by rule 2.)
  //   5. Everything else (mid desktops, unknown signals) -> 'normal'  (safe middle).
  // --------------------------------------------------------------------------
  function detect(){
    try {
      var cores  = (typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number')
                     ? navigator.hardwareConcurrency : 0;     // 0 == unknown
      var mem    = (typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number')
                     ? navigator.deviceMemory : 0;            // 0 == unknown / not reported
      var dpr    = (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0)
                     ? window.devicePixelRatio : 1;
      var mobile = isMobileUA();

      // 1. Dense display + weak CPU -> lean low.
      if (dpr >= 3 && cores > 0 && cores <= 4) return 'low';

      // 2. Explicitly weak hardware (known-small core count or memory).
      if ((cores > 0 && cores <= 2) || (mem > 0 && mem <= 2)) return 'low';

      // 3. Mobile but not flagged weak -> normal (phones rarely want 'high').
      if (mobile) return 'normal';

      // 4. Desktop / iPad-class with CPU headroom and moderate density -> high.
      if (cores >= 8 && dpr <= 2) return 'high';

      // 5. Safe middle for everything else / unknown signals.
      return 'normal';
    } catch(e){
      return 'normal';   // never throw; neutral default
    }
  }

  // --------------------------------------------------------------------------
  // benchmark(cb) — optional async refinement. Samples a handful of idle rAF
  // frame deltas (~0.5s) and, if the achieved FPS is consistently below 45,
  // steps the CURRENT tier down one. Draws nothing — pure timing. Non-blocking;
  // no-op (cb(currentTier)) if rAF / performance.now is unavailable.
  //
  // `cb` receives the FINAL tier this measurement suggests (the current tier
  // unchanged, or one step lower). It does NOT itself mutate CA.settings —
  // applyDefault() decides whether to apply the result.
  // --------------------------------------------------------------------------
  function benchmark(cb){
    var current = 'normal';
    try { if (CA.settings && CA.settings.quality) current = CA.settings.quality; } catch(e){}

    function done(tier){ try { if (typeof cb === 'function') cb(tier); } catch(e){} }

    try {
      var hasRAF = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function');
      var now = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
                  ? function(){ return performance.now(); }
                  : function(){ return Date.now(); };
      if (!hasRAF){ done(current); return; }

      var SAMPLES = 24;          // ~0.4s at 60fps, ~0.8s at 30fps — short either way
      var deltas = [];
      var last = now();
      var startWall = last;
      var MAX_MS = 1500;         // hard ceiling so a backgrounded tab can't hang us

      function frame(){
        try {
          var t = now();
          var dt = t - last;
          last = t;
          // Skip the first delta (warm-up) and any absurd gaps (tab throttling /
          // backgrounding produce huge dt that would falsely look "slow").
          if (deltas.length > 0 || dt < 200){
            if (dt > 0 && dt < 200) deltas.push(dt);
          }
          if (deltas.length < SAMPLES && (t - startWall) < MAX_MS){
            window.requestAnimationFrame(frame);
            return;
          }
          finish();
        } catch(e){
          done(current);   // any hiccup mid-sample → leave tier as-is
        }
      }

      function finish(){
        try {
          if (deltas.length < 6){ done(current); return; }   // too few samples → trust static tier
          // median delta is robust against a stray slow/fast frame.
          var sorted = deltas.slice().sort(function(a,b){ return a - b; });
          var mid = sorted[Math.floor(sorted.length / 2)];
          var fps = mid > 0 ? (1000 / mid) : 60;
          if (fps < 45){ done(stepDown(current)); }
          else { done(current); }
        } catch(e){
          done(current);
        }
      }

      window.requestAnimationFrame(frame);
    } catch(e){
      done(current);
    }
  }

  // --------------------------------------------------------------------------
  // hasExplicitQuality() — true if the user has an explicit, effective quality
  // choice we must respect. See header note: the stored 'ca_settings' blob
  // carries a `quality` field iff settings have been persisted (and ui.js saves
  // the instant the user toggles quality). A value we auto-wrote ourselves last
  // run is recorded in 'ca_perf_auto' and is NOT treated as a user choice.
  // --------------------------------------------------------------------------
  function hasExplicitQuality(){
    try {
      var raw = lsGet(SETTINGS_KEY);
      if (!raw) return false;                    // nothing saved → first run → no choice
      var obj = null;
      try { obj = JSON.parse(raw); } catch(e){ return false; }
      if (!obj || typeof obj.quality === 'undefined' || obj.quality === null) return false;

      var saved = obj.quality;
      var auto  = lsGet(AUTO_KEY);
      // If the saved quality matches ANY value WE auto-applied (the synchronous
      // static pick AND/OR the post-benchmark refinement — both recorded), it's
      // our default echoed back by an unrelated save(), not an explicit user pick.
      // (Without tracking BOTH, an unrelated save() firing between the static pick
      // and the benchmark could lock a weak device onto the un-refined high tier.)
      var autoList = (auto || '').split(',');
      if (autoList.indexOf(saved) >= 0) return false;
      return true;                               // a quality we didn't write → user's choice
    } catch(e){
      // On any uncertainty, err toward RESPECTING a possible choice (do nothing).
      return true;
    }
  }

  // Remember the value we auto-applied so future runs can tell it apart from a
  // genuine user choice. We do NOT write into 'ca_settings' (no fake "user
  // chose" flag) — the user stays free to pick later; their save() will then
  // store a quality that differs from our marker and win permanently.
  function rememberAuto(tier){
    try{
      var cur = lsGet(AUTO_KEY); var list = cur ? cur.split(',') : [];
      if (list.indexOf(tier) < 0) list.push(tier);
      if (list.length > 3) list = list.slice(-3);   // keep recent: static pick + refinement
      lsSet(AUTO_KEY, list.join(','));
    }catch(e){ try{ lsSet(AUTO_KEY, tier); }catch(_){} }
  }

  // --------------------------------------------------------------------------
  // applyDefault() — the single entry point core.js calls (guarded, once).
  // --------------------------------------------------------------------------
  function applyDefault(){
    try {
      if (!CA.settings) return;                  // settings not loaded yet → nothing to do
      if (hasExplicitQuality()) return;          // respect the user's explicit choice

      // 1. Synchronous static pick so the very first frames render correctly.
      var tier = detect();
      CA.settings.quality = tier;
      rememberAuto(tier);

      // 2. Async refinement — may lower the tier if the device underperforms.
      //    Applied only if the user STILL hasn't made an explicit choice by then.
      //    MOBILON KIHAGYVA (Jani): a statikus detect() default marad, az FPS-alapú
      //    auto-leminősítés ne fusson — egy betöltési akadás miatt low-ra esett,
      //    pedig magason is tökéletes. A felhasználó kézzel bármit beállíthat.
      if (isMobileUA()) return;
      try {
        benchmark(function(finalTier){
          try {
            if (hasExplicitQuality()) return;    // user picked while we measured → respect it
            if (finalTier && finalTier !== CA.settings.quality){
              CA.settings.quality = finalTier;
              rememberAuto(finalTier);
            }
          } catch(e){}
        });
      } catch(e){}
    } catch(e){
      // never throw out of init
    }
  }

  CA.PerfTier = {
    detect: detect,
    benchmark: benchmark,
    applyDefault: applyDefault
  };

})();
