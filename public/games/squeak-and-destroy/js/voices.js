/* ============================================================================
 * SQUEAK & DESTROY — voices.js  ::  CA.Voices  (Agent Voicebox)
 * ----------------------------------------------------------------------------
 * Tiny SYNTHESIZED voices: each of the 9 species gets a cute little WebAudio
 * "blip" so a unit "speaks" when its turn starts (and a smaller chance on
 * fire / hurt / win). Pure oscillator + noise synthesis — NO external assets.
 *
 * DESIGN (mirrors fx.js's audio model, never modifies it):
 *   - Reuses CA.Audio's shared AudioContext + master (SFX) bus when present
 *     (CA.Audio.ctx / CA.Audio.master), so iOS unlock + mute/volume routing are
 *     inherited for free. Falls back to its own lazily-built ctx only if CA.Audio
 *     never exposed one (defensive; normally fx.js owns it).
 *   - Respects mute + volume exactly like fx.js: gain is scaled by CA.Audio's
 *     effective SFX volume (CA.Audio._sfxVol() when available, else mirrors the
 *     muted + CA.settings.sfxVol math). No new persisted setting is invented.
 *   - No-op (silent) if audio isn't unlocked yet (ctx missing / suspended) —
 *     never forces a resume from a non-gesture, never throws.
 *
 * THROTTLE (like fx.js's character SFX, ~18-30%): voices only play on a
 * FRACTION of events so they're charming, not chatty. Per-kind rates are easy
 * constants below, plus a tiny per-unit cooldown so rapid events don't stack.
 *
 * Public API:
 *   CA.Voices.speak(species, kind, unitId)   // kind: 'turn'|'fire'|'hurt'|'win'
 *                                            // unitId optional (drives cooldown)
 *   CA.Voices.init()                         // idempotent; auto-called + self-wires
 *
 * Self-wires (once) via CA.events:
 *   'turnStart' (teamIdx, unit) -> speak(unit.species, 'turn')
 *   'fired'     (unit, weapon)  -> speak(unit.species, 'fire')
 *   'unitDied'  (unit)          -> speak(unit.species, 'hurt')   (a last squeak)
 *   'gameOver'  (winnerTeamId)  -> speak(<a winner unit>, 'win')
 * ==========================================================================*/
(function(){
  if (!window.CA) window.CA = {};

  /* ---- THROTTLE constants (fraction of events that actually speak) -------- *
   * Turn-start is the headline event so it's noticeable but not every time;
   * fire/hurt are deliberately rarer so combat doesn't turn into a chorus.    */
  var RATE = {
    turn: 0.55,   // ~55% of turn-starts get a greeting blip
    fire: 0.18,   // ~18% of shots get a little battle-squeak
    hurt: 0.22,   // ~22% of deaths get a last squeak (multi-kill won't chatter)
    win:  1.00    // victory always celebrates
  };
  // per-unit cooldown (ms): a single unit won't speak again until this elapses,
  // so a flurry of events (multi-hit, rapid fire) can't stack into a stutter.
  var UNIT_COOLDOWN_MS = 900;
  // global floor (ms): no two voices ever overlap closer than this, regardless
  // of which unit. Raised from 140 → 650 so a multi-hit / multi-death AI turn
  // can't stack the same squeak ~8x in a row (reported "hihihi" spam).
  var GLOBAL_COOLDOWN_MS = 650;

  // a gentle master scale on top of CA.Audio's SFX volume so voices sit politely
  // UNDER the punchy weapon SFX (they're flavour, not feedback).
  var VOICE_GAIN = 0.55;

  /* ---- per-species voice "recipes" --------------------------------------- *
   * Each recipe is an array of one or more "blips". A blip:
   *   { type, f0, f1, dur, vol, atk, delay, noise }
   *   type  : oscillator waveform ('sine'|'triangle'|'sawtooth'|'square')
   *   f0/f1 : start/end frequency (Hz) — f1 gives a pitch envelope (glide)
   *   dur   : seconds (<~0.25 total per voice)
   *   vol   : 0..1 relative gain (further scaled by SFX vol + VOICE_GAIN)
   *   atk   : attack time (s)
   *   delay : start offset (s) within the voice — used for two-note calls
   *   noise : if true, this blip is a filtered noise burst instead of a tone
   *           { cutoff, cutoff1, filter } describe the noise band
   * Tuned to feel like each animal; nothing is longer than ~250ms.            */
  var RECIPES = {
    // capybara — low, warm, chill chirp (the zen office crew). Rounded sine with
    // a tiny upward lilt so it reads relaxed/content, clearly above the koala grunt.
    capybara: [ { type:'sine', f0:300, f1:370, dur:0.15, vol:0.5, atk:0.012 } ],

    // worm — wet descending squelch (a damp little "blorp")
    worm: [ { type:'sawtooth', f0:420, f1:130, dur:0.16, vol:0.34, atk:0.004 },
            { noise:true, filter:'lowpass', cutoff:900, cutoff1:200, dur:0.12, vol:0.18 } ],

    // hedgehog — tiny quick snuffle (short, soft, breathy)
    hedgehog: [ { type:'triangle', f0:680, f1:560, dur:0.06, vol:0.3, atk:0.003 },
                { noise:true, filter:'highpass', cutoff:1800, cutoff1:1200, dur:0.07, vol:0.16, delay:0.05 } ],

    // beaver — nasal BUZZ (a busy little builder hum). A two-step square so it
    // reads as a chattery "meh-eh", distinct from the capybara's smooth sine.
    beaver: [ { type:'square', f0:250, f1:235, dur:0.09, vol:0.22, atk:0.005 },
              { type:'square', f0:225, f1:215, dur:0.09, vol:0.2,  atk:0.005, delay:0.09 } ],

    // frog — ribbit: two quick low blips
    frog: [ { type:'sawtooth', f0:240, f1:200, dur:0.07, vol:0.4, atk:0.004 },
            { type:'sawtooth', f0:200, f1:170, dur:0.08, vol:0.4, atk:0.004, delay:0.1 } ],

    // bird — bright rising tweet
    bird: [ { type:'sine', f0:1100, f1:1900, dur:0.12, vol:0.34, atk:0.004 } ],

    // koala — LOW grunt (rumbly, sleepy). Dropped a touch + a faint noise rasp so
    // it's unmistakably the deepest, growliest voice of the bunch.
    koala: [ { type:'sawtooth', f0:138, f1:96, dur:0.2, vol:0.42, atk:0.01 },
             { noise:true, filter:'lowpass', cutoff:500, cutoff1:160, dur:0.14, vol:0.12, delay:0.02 } ],

    // bat — high screechy click (spooky little necromancer)
    bat: [ { type:'square', f0:2400, f1:3200, dur:0.05, vol:0.22, atk:0.001 },
           { noise:true, filter:'highpass', cutoff:3000, cutoff1:5000, dur:0.04, vol:0.12, delay:0.03 } ],

    // owl — two-note hoot (the wise mage)
    owl: [ { type:'sine', f0:430, f1:400, dur:0.1, vol:0.4, atk:0.012 },
           { type:'sine', f0:380, f1:360, dur:0.12, vol:0.4, atk:0.012, delay:0.13 } ],

    // fox — quick yip then a tiny rising squeak ("ring-ding"). Bright & sly.
    fox: [ { type:'triangle', f0:900, f1:1250, dur:0.07, vol:0.3, atk:0.003 },
           { type:'triangle', f0:1300, f1:1600, dur:0.06, vol:0.26, atk:0.003, delay:0.09 } ],

    // cat — soft "meow": a rising-then-falling sine that reads as a little mew.
    cat: [ { type:'sine', f0:620, f1:880, dur:0.09, vol:0.34, atk:0.008 },
           { type:'sine', f0:820, f1:560, dur:0.12, vol:0.32, atk:0.006, delay:0.09 } ],

    // penguin — squat two-note honk/squawk (a cheerful little "ehh-ehh").
    penguin: [ { type:'sawtooth', f0:520, f1:430, dur:0.08, vol:0.3, atk:0.004 },
               { type:'sawtooth', f0:560, f1:450, dur:0.08, vol:0.28, atk:0.004, delay:0.1 } ]
  };

  // a fallback recipe for any unknown species id (a neutral little chirp)
  var DEFAULT_RECIPE = [ { type:'triangle', f0:520, f1:600, dur:0.1, vol:0.32, atk:0.006 } ];

  /* ---- SAMPLE LAYER (real recorded voices) ------------------------------- *
   * Optional upgrade over synthesis: if a real sample for (species, kind) is
   * available AND decodes, we play it; otherwise we fall back to the synth
   * recipe above (zero regression). .mp3 decodes everywhere (iOS-safe); .ogg
   * only decodes on iOS 17+ / modern browsers — on older iOS the .ogg entries
   * simply fail to decode and we keep the synth voice. Buffers load lazily on
   * first use (after audio unlock) and are cached. Files: assets/audio/voice/. */
  var SAMPLE_BASE = 'assets/audio/voice/';
  // per-species idle ('turn') voices. Species NOT listed here keep their synth
  // 'turn' voice (e.g. beaver/penguin, whose synth fits better than our samples).
  var SAMPLES = {
    capybara: ['cap_idle.mp3'],
    cat:      ['cat_idle.mp3'],
    frog:     ['frog_idle.mp3'],
    bird:     ['bird_idle.mp3'],
    worm:     ['worm_idle.mp3','worm_1.ogg','worm_2.ogg'],
    hedgehog: ['hog_idle.mp3','breath.ogg','nose.ogg'],
    koala:    ['koala_1.ogg','koala_2.ogg','koala_3.ogg','koala_4.ogg','koala_5.ogg'],
    owl:      ['ooh.ogg'],
    bat:      ['weird_1.ogg','weird_2.ogg','weird_3.ogg'],
    fox:      ['bark_1.ogg','bark_2.ogg','howl.ogg']
  };
  // shared pools (used for EVERY species). hurt mixes mp3+ogg so a real "ouch"
  // survives even on iOS<17 (the mp3 entries). win = celebratory cute pool.
  var HURT_POOL = ['hurt_a.mp3','hurt_b.mp3','hurt_1.ogg','hurt_2.ogg','hurt_3.ogg','hurt_4.ogg','hurt_5.ogg','scream.ogg','monster_1.ogg'];
  var WIN_POOL  = ['cute_1.ogg','cute_2.ogg','cute_3.ogg','cute_4.ogg','cute_5.ogg','cute_6.ogg','ooh.ogg'];
  var IDLE_FALLBACK = ['cute_1.ogg','cute_2.ogg','cute_3.ogg','cute_4.ogg']; // unknown species only

  // resolve candidate sample files for (species, kind). null => use synthesis.
  function sampleList(species, kind){
    if (kind==='hurt') return HURT_POOL;
    if (kind==='win')  return WIN_POOL;
    if (kind==='turn'){
      if (SAMPLES[species]) return SAMPLES[species];
      if (!RECIPES[species]) return IDLE_FALLBACK; // unknown species -> cute pool
      return null;                                 // known species w/o sample -> synth
    }
    return null; // 'fire' (and anything else) -> synth
  }

  // filename -> AudioBuffer | 'pending' | 'fail' (undefined = not requested yet)
  var _bufs = {};
  function loadBuf(ctx, file){
    if (_bufs[file] !== undefined) return;          // already loading/loaded/failed
    _bufs[file] = 'pending';
    try{
      fetch(SAMPLE_BASE + file).then(function(r){ return r.arrayBuffer(); }).then(function(ab){
        // support both promise & callback decodeAudioData forms (iOS Safari).
        var done = function(buf){ _bufs[file] = buf; };
        var fail = function(){ _bufs[file] = 'fail'; };
        var p; try { p = ctx.decodeAudioData(ab, done, fail); } catch(e){ fail(); return; }
        if (p && p.then) p.then(done, fail);
      }).catch(function(){ _bufs[file] = 'fail'; });
    }catch(e){ _bufs[file] = 'fail'; }
  }
  // play a decoded sample buffer at `t` -> bus, with per-kind pitch + gain.
  function playSample(ctx, bus, buf, t, vscale, pitchMul){
    try{
      var src = ctx.createBufferSource(); src.buffer = buf;
      src.playbackRate.value = Math.max(0.5, Math.min(2, pitchMul));
      var g = ctx.createGain();
      // samples peak ~full-scale; the synth blips peak ~0.4*vscale, so scale the
      // sample down to sit at a comparable, polite level under the weapon SFX.
      g.gain.value = Math.max(0.0001, Math.min(1, vscale * 0.85));
      src.connect(g); g.connect(bus);
      src.start(t);
      return true;
    }catch(e){ return false; }
  }

  /* ---- per-kind pitch nudge (multiplies every blip's frequency) ---------- *
   * turn = neutral; fire = a touch up (excited); hurt = down (ouch); win = up. */
  var KIND_PITCH = { turn:1.0, fire:1.08, hurt:0.78, win:1.18 };
  // per-kind overall gain nudge (hurt slightly softer, win a touch louder)
  var KIND_GAIN  = { turn:1.0, fire:0.9, hurt:0.85, win:1.1 };

  var _cooldowns = {};   // unitId -> last-spoke timestamp (ms)
  var _lastAny   = 0;    // last time ANY voice played (ms)
  var _wired     = false;
  var _ownCtx    = null; // our own ctx, ONLY if CA.Audio never exposed one

  function now(){ return (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now(); }

  // resolve the AudioContext to use: prefer CA.Audio's (shared unlock/routing).
  function getCtx(){
    try{
      var A = CA.Audio;
      if (A && A.ctx) return A.ctx;          // reuse the shared, already-unlocked ctx
      // Fallback: build our own ONLY if fx.js never made one. We do NOT resume it
      // from here (no gesture) — it'll be 'suspended' until something resumes it,
      // and speak() no-ops while suspended, which is the desired behaviour.
      if (_ownCtx) return _ownCtx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      _ownCtx = new AC();
      return _ownCtx;
    }catch(e){ return null; }
  }

  // the SFX-bus destination node to connect into. Prefer CA.Audio.master so our
  // voices ride the same bus as weapon SFX; else connect straight to destination.
  function getBus(ctx){
    try{ if (CA.Audio && CA.Audio.master) return CA.Audio.master; }catch(e){}
    return ctx.destination;
  }

  // effective SFX volume (0 when muted). Mirror fx.js exactly; reuse its helper
  // when available so any future change there is inherited automatically.
  function sfxVol(){
    try{
      var A = CA.Audio;
      if (A && typeof A._sfxVol === 'function') return A._sfxVol();
      var muted = (CA.settings && CA.settings.muted) || (A && A.muted);
      if (muted) return 0;
      return (CA.settings && CA.settings.sfxVol!=null) ? CA.settings.sfxVol : 0.3;
    }catch(e){ return 0; }
  }

  // is audio "unlocked" enough to make sound right now? (ctx exists + running)
  function audioReady(ctx){
    return !!(ctx && ctx.state==='running');
  }

  // lazily build (once) a shared noise buffer for our own ctx fallback. When we
  // reuse CA.Audio's ctx we prefer its buffer; else make a tiny one.
  var _noiseBufCache = null;
  function noiseBuf(ctx){
    try{
      if (CA.Audio && CA.Audio.ctx===ctx && CA.Audio._noiseBuf) return CA.Audio._noiseBuf;
      if (_noiseBufCache && _noiseBufCache._ctx===ctx) return _noiseBufCache.buf;
      var len = Math.floor(ctx.sampleRate*0.4);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i=0;i<len;i++) d[i] = Math.random()*2-1;
      _noiseBufCache = { _ctx:ctx, buf:buf };
      return buf;
    }catch(e){ return null; }
  }

  // play ONE blip (tone or noise) at absolute time `t` on ctx -> bus.
  function playBlip(ctx, bus, b, t, vscale, pitchMul){
    try{
      var dur = b.dur!=null ? b.dur : 0.12;
      var atk = b.atk!=null ? b.atk : 0.005;
      var vol = (b.vol!=null ? b.vol : 0.4) * vscale;
      if (vol <= 0.0002) return;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t+atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
      g.connect(bus);

      if (b.noise){
        var nb = noiseBuf(ctx);
        if (!nb) return;
        var src = ctx.createBufferSource(); src.buffer = nb;
        var filt = ctx.createBiquadFilter();
        filt.type = b.filter || 'bandpass';
        var c0 = (b.cutoff!=null ? b.cutoff : 1200) * pitchMul;
        filt.frequency.setValueAtTime(Math.max(40, c0), t);
        if (b.cutoff1!=null) filt.frequency.exponentialRampToValueAtTime(Math.max(40, b.cutoff1*pitchMul), t+dur);
        src.connect(filt); filt.connect(g);
        src.start(t); src.stop(t+dur+0.02);
      } else {
        var o = ctx.createOscillator();
        o.type = b.type || 'sine';
        o.frequency.setValueAtTime(Math.max(20, b.f0*pitchMul), t);
        if (b.f1!=null) o.frequency.exponentialRampToValueAtTime(Math.max(20, b.f1*pitchMul), t+dur);
        o.connect(g);
        o.start(t); o.stop(t+dur+0.02);
      }
    }catch(e){ /* never throw from audio */ }
  }

  CA.Voices = {
    // expose the tunables (read-only convenience for integrators / tuning)
    RATE: RATE,

    init: function(){
      // wire ONCE. Guarded so a missing event bus or double-include never throws.
      try{
        if (_wired || !CA.events || !CA.events.on) return;
        _wired = true;

        CA.events.on('turnStart', function(teamIdx, unit){
          try{ CA.Voices.speak(speciesOf(unit), 'turn', unit && unit.id); }catch(e){}
        });
        CA.events.on('fired', function(unit /*, weapon */){
          try{ CA.Voices.speak(speciesOf(unit), 'fire', unit && unit.id); }catch(e){}
        });
        CA.events.on('unitDied', function(unit){
          try{ CA.Voices.speak(speciesOf(unit), 'hurt', unit && unit.id); }catch(e){}
        });
        CA.events.on('gameOver', function(winnerTeamId){
          try{
            var u = aWinnerUnit(winnerTeamId);
            CA.Voices.speak(speciesOf(u), 'win', u && u.id);
          }catch(e){}
        });
      }catch(e){ /* never throw */ }
    },

    /* speak(species, kind, unitId)
     *   species : a species id string ('capybara'...) OR a unit-ish object.
     *   kind    : 'turn'|'fire'|'hurt'|'win' (defaults to 'turn').
     *   unitId  : optional; used for the per-unit cooldown. Falls back to species.
     * Respects mute/volume, throttle + cooldowns, and no-ops if audio isn't
     * unlocked. Returns true if a voice was actually scheduled. */
    speak: function(species, kind, unitId){
      try{
        kind = kind || 'turn';
        // allow passing a unit object as the first arg for convenience
        if (species && typeof species === 'object') species = speciesOf(species);
        var id = (species||'') + '';
        if (!id) return false;

        // mute / volume gate (cheap, before any RNG so muted = truly silent)
        var v = sfxVol();
        if (v <= 0.0002) return false;

        // NEVER speak on the menu — voices are in-match flavour only. (mute is
        // already covered by sfxVol()==0 above.) Guarded + defensive.
        try{
          if (CA.GameState && CA.state && CA.state.mode===CA.GameState.MENU) return false;
        }catch(e){}

        var ctx = getCtx();
        if (!audioReady(ctx)) return false;   // not unlocked yet -> silent no-op

        // THROTTLE: only speak on a fraction of events.
        var rate = RATE[kind]!=null ? RATE[kind] : RATE.turn;
        if (Math.random() >= rate) return false;

        // cooldowns: per-unit (so one critter doesn't chatter) + a global floor.
        var key = (unitId!=null) ? ('u'+unitId) : ('s'+id);
        var tnow = now();
        if (tnow - _lastAny < GLOBAL_COOLDOWN_MS) return false;
        var last = _cooldowns[key] || 0;
        if (tnow - last < UNIT_COOLDOWN_MS) return false;
        _cooldowns[key] = tnow;
        _lastAny = tnow;
        // prune stale cooldown entries so the map can't grow unbounded across many
        // matches in one session (unit ids differ per match). Cheap, occasional.
        try { var ks=Object.keys(_cooldowns); if (ks.length>64){ for (var pi=0;pi<ks.length;pi++){ if (tnow-(_cooldowns[ks[pi]]||0) > 60000) delete _cooldowns[ks[pi]]; } } } catch(e){}

        var recipe = RECIPES[id] || DEFAULT_RECIPE;
        var bus = getBus(ctx);
        var pitch = (KIND_PITCH[kind]!=null ? KIND_PITCH[kind] : 1.0)
                    * (0.97 + Math.random()*0.06);   // tiny per-call detune for life
        var vscale = v * VOICE_GAIN * (KIND_GAIN[kind]!=null ? KIND_GAIN[kind] : 1.0);

        // SAMPLE LAYER: prefer a real recorded voice; fall back to synthesis.
        var files = sampleList(id, kind);
        if (files && files.length){
          for (var fi=0; fi<files.length; fi++) loadBuf(ctx, files[fi]);
          var ready = [];
          for (var fj=0; fj<files.length; fj++){ var bf=_bufs[files[fj]]; if (bf && bf!=='pending' && bf!=='fail') ready.push(bf); }
          if (ready.length){
            var sbuf = ready[(Math.random()*ready.length)|0];
            if (playSample(ctx, bus, sbuf, ctx.currentTime, vscale, pitch)) return true;
          }
          // samples not decoded yet (first use this session) -> synth this time.
        }

        var t0 = ctx.currentTime;
        for (var i=0;i<recipe.length;i++){
          var b = recipe[i];
          playBlip(ctx, bus, b, t0 + (b.delay||0), vscale, pitch);
        }
        return true;
      }catch(e){ return false; }   // never throw
    }
  };

  // resolve a species id from a unit-ish object (u.species || u.kind), tolerant
  // of being handed a bare string already.
  function speciesOf(u){
    if (!u) return '';
    if (typeof u === 'string') return u;
    return (u.species || u.kind || '') + '';
  }

  // find SOME living unit on the winning team to "speak" the victory line.
  function aWinnerUnit(winnerTeamId){
    try{
      if (winnerTeamId==null) return CA.activeUnit ? CA.activeUnit() : null;
      var units = (CA.state && CA.state.units) || [];
      for (var i=0;i<units.length;i++){
        var u = units[i];
        if (u && u.alive && u.teamId===winnerTeamId && !u.minion) return u;
      }
      // fall back to any unit on that team
      for (var j=0;j<units.length;j++){
        if (units[j] && units[j].teamId===winnerTeamId) return units[j];
      }
    }catch(e){}
    return null;
  }

  // self-wire on load (like menu-leaderboard.js). init() is idempotent.
  CA.Voices.init();
})();
