/* ============================================================================
 * CUTE ANIMALS — postfx.js  ::  OPTIONAL WebGL post-processing overlay
 * ----------------------------------------------------------------------------
 * A thin, self-contained WebGL1 post-processing module. It takes the game's
 * main 2D <canvas>, runs a cheap full-screen shader chain (dual-Kawase bloom →
 * warm grade + ACES tone-map + vignette + optional shockwave ripple) and paints
 * the result to a transparent overlay GL canvas positioned EXACTLY over the 2D
 * canvas.
 *
 * DESIGN RULES (this is the highest-risk addition to a LIVE game):
 *   - 100% ADDITIVE. If ANYTHING fails — no WebGL1, context creation fails,
 *     shader compile/link fails, context lost — every method becomes a no-op
 *     and the plain 2D canvas keeps rendering untouched.
 *   - OFF by default. The integrator (core.js) only ever calls apply() on the
 *     'high' quality tier AND only when available() is true. setEnabled toggles
 *     the overlay's visibility (display:none when inactive → 2D canvas shows).
 *   - iOS Safari is mandatory: WebGL1 only, NO 32-bit float render targets
 *     (UNSIGNED_BYTE textures everywhere), runtime precision check (highp →
 *     mediump fallback), and full webglcontextlost/restored handling.
 *
 * Public API (all guarded by the integrator; all safe to call when down):
 *   CA.PostFX.init(mainCanvas) -> bool   (idempotent; true on success)
 *   CA.PostFX.available()      -> bool   (init ok AND context alive)
 *   CA.PostFX.resize(w,h,dpr)            (resize GL canvas + targets)
 *   CA.PostFX.apply(srcCanvas)           (upload + render chain; no-op if down)
 *   CA.PostFX.shockwave(x,y)             (trigger decaying radial ripple)
 *   CA.PostFX.setEnabled(bool) / enabled() -> bool   (master switch, def OFF)
 *   CA.PostFX.dispose()                  (free GL resources)
 * ==========================================================================*/
(function(){
  'use strict';
  if (!window.CA) window.CA = {};

  // ----- module state -------------------------------------------------------
  var gl = null;                 // the WebGL1 rendering context (null when down)
  var mainCanvas = null;         // the game's visible 2D canvas (reference)
  var glCanvas = null;           // our transparent overlay canvas
  var contextLost = false;       // set true on 'webglcontextlost'
  var initFailed = false;        // a hard failure → stay no-op until dispose
  var enabledFlag = false;       // master switch (default OFF)

  // GL objects
  var quadBuf = null;            // fullscreen-quad vertex buffer (2 triangles)
  var srcTex = null;             // texture holding the uploaded 2D canvas frame
  var progBright = null;         // bright-pass program
  var progBlur = null;           // Kawase down/upsample blur program
  var progComposite = null;      // final grade/tonemap/vignette/shockwave program
  var fbHalf = null, texHalf = null;       // half-res target
  var fbQuarter = null, texQuarter = null; // quarter-res target

  // sizes (backing pixels)
  var bw = 0, bh = 0;            // full backing resolution
  var glDpr = 1;

  // shockwave decay state
  var shockTime = 0;             // seconds remaining (0 = inactive)
  var shockDur = 0.4;            // total lifetime (~0.4s)
  var shockX = 0.5, shockY = 0.5;// center in normalized UV (0..1, y up)
  var lastApplyMs = 0;           // for per-frame dt of the shock decay

  // precision qualifier chosen at runtime (highp if supported, else mediump)
  var precQ = 'highp';

  // ----- tiny WebGL helpers -------------------------------------------------

  // Pick the best supported fragment-shader float precision. iOS supports highp
  // in fragment shaders on all modern devices, but we degrade gracefully if not.
  function pickPrecision(){
    try {
      var hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      if (hp && hp.precision > 0) return 'highp';
    } catch(e){}
    return 'mediump';
  }

  function compile(type, src){
    var sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
      // Swallow the log to console in dev; never throw (fail-safe to no-op).
      try { if (window.console) console.warn('[PostFX] shader compile failed:', gl.getShaderInfoLog(sh)); } catch(_){}
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function link(vsSrc, fsSrc){
    var vs = compile(gl.VERTEX_SHADER, vsSrc);
    var fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs){ if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs); return null; }
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    // Shaders can be detached/deleted once linked.
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)){
      try { if (window.console) console.warn('[PostFX] program link failed:', gl.getProgramInfoLog(p)); } catch(_){}
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }

  // Create an UNSIGNED_BYTE RGBA texture + framebuffer at (w,h). NO float targets
  // (iOS lacks them). Returns {fb, tex} or null on failure.
  function makeTarget(w, h){
    w = Math.max(1, w|0); h = Math.max(1, h|0);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok){ gl.deleteTexture(tex); gl.deleteFramebuffer(fb); return null; }
    return { fb: fb, tex: tex, w: w, h: h };
  }

  // ----- shader sources -----------------------------------------------------
  // A single fullscreen-quad vertex shader. aPos is in clip space [-1..1]; we
  // derive UV in [0..1]. (No flip here — we flip on UPLOAD via UNPACK_FLIP_Y so
  // the texture matches the canvas orientation, then sample straight.)
  function VS(){
    return ''+
      'attribute vec2 aPos;\n'+
      'varying vec2 vUv;\n'+
      'void main(){\n'+
      '  vUv = aPos * 0.5 + 0.5;\n'+
      '  gl_Position = vec4(aPos, 0.0, 1.0);\n'+
      '}\n';
  }

  // Bright-pass: keep only luminance above the threshold, soft knee. Cheap.
  function FS_BRIGHT(){
    return 'precision '+precQ+' float;\n'+
      'varying vec2 vUv;\n'+
      'uniform sampler2D uTex;\n'+
      'uniform float uThreshold;\n'+
      'void main(){\n'+
      '  vec3 c = texture2D(uTex, vUv).rgb;\n'+
      '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));\n'+
      // soft knee around the threshold so bloom ramps in gently
      '  float k = smoothstep(uThreshold, uThreshold + 0.25, l);\n'+
      '  gl_FragColor = vec4(c * k, 1.0);\n'+
      '}\n';
  }

  // Dual-Kawase style blur: 4 diagonal taps offset by uOffset texels. Used for
  // both downsample (write to smaller target) and upsample (write to larger).
  function FS_BLUR(){
    return 'precision '+precQ+' float;\n'+
      'varying vec2 vUv;\n'+
      'uniform sampler2D uTex;\n'+
      'uniform vec2 uTexel;\n'+    // 1.0/targetSize of the SOURCE texture
      'uniform float uOffset;\n'+  // tap spread in texels
      'void main(){\n'+
      '  vec2 o = uTexel * uOffset;\n'+
      '  vec3 s = vec3(0.0);\n'+
      '  s += texture2D(uTex, vUv + vec2( o.x,  o.y)).rgb;\n'+
      '  s += texture2D(uTex, vUv + vec2(-o.x,  o.y)).rgb;\n'+
      '  s += texture2D(uTex, vUv + vec2( o.x, -o.y)).rgb;\n'+
      '  s += texture2D(uTex, vUv + vec2(-o.x, -o.y)).rgb;\n'+
      '  gl_FragColor = vec4(s * 0.25, 1.0);\n'+
      '}\n';
  }

  // Final composite: optional shockwave UV ripple → base color + additive bloom
  // → warm tint → ACES filmic tone-map → vignette.
  function FS_COMPOSITE(){
    return 'precision '+precQ+' float;\n'+
      'varying vec2 vUv;\n'+
      'uniform sampler2D uScene;\n'+   // full-res scene (sharp)
      'uniform sampler2D uBloom;\n'+   // blurred bloom (low-res, upsampled by LINEAR)
      'uniform float uBloomAmt;\n'+
      'uniform float uShock;\n'+       // 0..1 decaying amplitude (0 = no ripple)
      'uniform vec2  uShockC;\n'+      // ripple center in UV
      'uniform float uAspect;\n'+      // w/h, to keep the ripple round
      // ACES filmic approximation (Narkowicz 2015) — gentle highlight rolloff.
      'vec3 aces(vec3 x){\n'+
      '  float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;\n'+
      '  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);\n'+
      '}\n'+
      'void main(){\n'+
      '  vec2 uv = vUv;\n'+
      // --- shockwave: radial ripple, zero cost when uShock≈0 ---
      '  if (uShock > 0.001){\n'+
      '    vec2 d = uv - uShockC;\n'+
      '    d.x *= uAspect;\n'+         // correct for aspect so the ring is circular
      '    float dist = length(d);\n'+
      '    float ring = sin(dist * 38.0 - uShock * 26.0);\n'+
      // amplitude falls off with distance and with the (already decaying) uShock
      '    float amp = uShock * 0.018 * exp(-dist * 4.0);\n'+
      '    uv += normalize(d + 1e-5) * ring * amp;\n'+
      '  }\n'+
      '  vec3 scene = texture2D(uScene, uv).rgb;\n'+
      '  vec3 bloom = texture2D(uBloom, uv).rgb;\n'+
      '  vec3 col = scene + bloom * uBloomAmt;\n'+
      // --- subtle warm grade: lift R, trim B slightly ---
      '  col *= vec3(1.045, 1.005, 0.955);\n'+
      // --- ACES filmic tone-map (prevents white blowout from the bloom add) ---
      '  col = aces(col);\n'+
      // --- cheap radial vignette ---
      '  vec2 vd = vUv - 0.5;\n'+
      '  float vig = smoothstep(0.95, 0.35, dot(vd, vd) * 2.2);\n'+
      '  col *= mix(0.82, 1.0, vig);\n'+
      '  gl_FragColor = vec4(col, 1.0);\n'+
      '}\n';
  }

  // ----- draw plumbing ------------------------------------------------------

  // Bind the fullscreen quad to attribute 0 for the current program.
  function bindQuad(){
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  // Draw a fullscreen pass: program `p`, source texture `tex` (unit 0) into the
  // given framebuffer (null = the visible default backbuffer) at (vw,vh).
  function drawPass(p, srcTexture, fb, vw, vh){
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, vw, vh);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTexture);
    var loc = gl.getUniformLocation(p, 'uTex');
    if (loc) gl.uniform1i(loc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // ----- (re)build GL resources at the current backing size -----------------
  function buildResources(){
    // fullscreen quad: two CCW triangles covering clip space
    if (!quadBuf){
      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1,-1,  1,-1,  -1, 1,
        -1, 1,  1,-1,   1, 1
      ]), gl.STATIC_DRAW);
    }

    // programs (compile once)
    if (!progBright)   progBright   = link(VS(), FS_BRIGHT());
    if (!progBlur)     progBlur     = link(VS(), FS_BLUR());
    if (!progComposite)progComposite= link(VS(), FS_COMPOSITE());
    if (!progBright || !progBlur || !progComposite) return false;

    // scene texture (we re-upload it each frame via texImage2D from the canvas)
    if (!srcTex){
      srcTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    return true;
  }

  // (Re)allocate the half/quarter render targets for the current size.
  function buildTargets(){
    var hw = Math.max(1, bw >> 1), hh = Math.max(1, bh >> 1);
    var qw = Math.max(1, bw >> 2), qh = Math.max(1, bh >> 2);
    // free old
    if (fbHalf){ gl.deleteFramebuffer(fbHalf.fb); gl.deleteTexture(fbHalf.tex); fbHalf=null; }
    if (fbQuarter){ gl.deleteFramebuffer(fbQuarter.fb); gl.deleteTexture(fbQuarter.tex); fbQuarter=null; }
    fbHalf = makeTarget(hw, hh);
    fbQuarter = makeTarget(qw, qh);
    if (!fbHalf || !fbQuarter){
      // partial failure → tear down targets; apply() will no-op safely
      if (fbHalf){ gl.deleteFramebuffer(fbHalf.fb); gl.deleteTexture(fbHalf.tex); fbHalf=null; }
      if (fbQuarter){ gl.deleteFramebuffer(fbQuarter.fb); gl.deleteTexture(fbQuarter.tex); fbQuarter=null; }
      return false;
    }
    texHalf = fbHalf.tex; texQuarter = fbQuarter.tex;
    return true;
  }

  // ----- context-loss handling ---------------------------------------------
  function onContextLost(e){
    // Prevent the default so a restore is possible; mark unavailable so the
    // game falls back to its 2D canvas (which we also hide our overlay for).
    try { e.preventDefault(); } catch(_){}
    contextLost = true;
    enabledFlag = false;
    try { if (glCanvas) glCanvas.style.display = 'none'; } catch(_){}
    // GL objects are invalid now; null them so a restore rebuilds cleanly.
    quadBuf=srcTex=progBright=progBlur=progComposite=null;
    fbHalf=fbQuarter=texHalf=texQuarter=null;
  }
  function onContextRestored(){
    contextLost = false;
    try {
      if (gl && buildResources() && buildTargets()){
        // resources back; integrator will re-enable via setEnabled on next frame
      } else {
        initFailed = true; // could not rebuild → stay no-op
      }
    } catch(_){ initFailed = true; }
  }

  // ----- overlay canvas placement ------------------------------------------
  // Mirror the main canvas's CSS box exactly, sit above it, ignore pointer input.
  function positionOverlay(){
    if (!glCanvas || !mainCanvas) return;
    var s = glCanvas.style;
    s.position = 'absolute';
    s.pointerEvents = 'none';
    // Match the on-screen CSS size of the main canvas. We read its rendered box
    // via offset* (layout px). The integrator owns layout; we only overlay.
    s.left = (mainCanvas.offsetLeft || 0) + 'px';
    s.top  = (mainCanvas.offsetTop  || 0) + 'px';
    s.width  = (mainCanvas.offsetWidth  || mainCanvas.clientWidth  || 0) + 'px';
    s.height = (mainCanvas.offsetHeight || mainCanvas.clientHeight || 0) + 'px';
    // z-index just above the main canvas; keep modest so HUD DOM (if any) wins.
    var z = 0;
    try { z = parseInt(getComputedStyle(mainCanvas).zIndex, 10) || 0; } catch(_){}
    s.zIndex = String(z + 1);
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================
  var PostFX = {

    // Idempotent. Returns true on success, false if WebGL1 is unavailable or
    // context creation failed. Never throws.
    init: function(canvasEl){
      try {
        if (initFailed) return false;
        if (gl && !contextLost) {           // already up
          mainCanvas = canvasEl || mainCanvas;
          positionOverlay();
          return true;
        }
        if (!canvasEl) return false;
        mainCanvas = canvasEl;

        // Create / reuse the overlay canvas.
        if (!glCanvas){
          glCanvas = document.createElement('canvas');
          glCanvas.id = 'ca-postfx';
          glCanvas.setAttribute('aria-hidden', 'true');
          glCanvas.style.display = 'none';   // OFF by default → 2D canvas shows
          // Insert right after the main canvas so it overlays in the same flow.
          if (mainCanvas.parentNode){
            mainCanvas.parentNode.insertBefore(glCanvas, mainCanvas.nextSibling);
          } else {
            document.body.appendChild(glCanvas);
          }
        }

        // WebGL1 context attributes tuned for an overlay compositing pass.
        var attrs = {
          alpha: true,            // transparent overlay
          antialias: false,       // we post-process; AA is wasted fill-rate
          depth: false, stencil: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: false,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false
        };
        // MUST null-check both context names (iOS old Safari = experimental).
        var ctx = null;
        try { ctx = glCanvas.getContext('webgl', attrs); } catch(_){ ctx = null; }
        if (!ctx){ try { ctx = glCanvas.getContext('experimental-webgl', attrs); } catch(_){ ctx = null; } }
        if (!ctx){ initFailed = false; return false; }  // no WebGL1 → graceful no-op
        gl = ctx;
        contextLost = false;

        // context-loss listeners (attach once)
        glCanvas.addEventListener('webglcontextlost', onContextLost, false);
        glCanvas.addEventListener('webglcontextrestored', onContextRestored, false);

        // runtime precision pick (highp → mediump fallback)
        precQ = pickPrecision();

        // Initial backing size from the main canvas's backing store.
        bw = Math.max(1, (mainCanvas.width  || 1));
        bh = Math.max(1, (mainCanvas.height || 1));
        glCanvas.width = bw; glCanvas.height = bh;

        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // canvas → texture orientation

        if (!buildResources()){ this.dispose(); initFailed = true; return false; }
        if (!buildTargets()){ this.dispose(); initFailed = true; return false; }

        positionOverlay();
        return true;
      } catch(e){
        try { if (window.console) console.warn('[PostFX] init failed:', e); } catch(_){}
        // Soft failure: leave initFailed false so a later retry can succeed, but
        // ensure we are in a no-op state right now.
        gl = null;
        return false;
      }
    },

    // True only if init succeeded AND the context is alive (not lost).
    available: function(){
      return !!(gl && !contextLost && !initFailed && progComposite && fbHalf && fbQuarter && srcTex);
    },

    // Resize the GL canvas + render targets to match (backing px) + dpr.
    resize: function(w, h, dpr){
      try {
        if (!this.available()) return;
        w = Math.max(1, w|0); h = Math.max(1, h|0);
        glDpr = dpr || 1;
        if (w === bw && h === bh) { positionOverlay(); return; } // no change
        bw = w; bh = h;
        glCanvas.width = bw; glCanvas.height = bh;
        buildTargets();
        positionOverlay();
      } catch(e){ /* fail-safe: leave prior size */ }
    },

    // Upload srcCanvas as a texture and render the full post chain to the
    // visible GL canvas. No-op when unavailable or disabled.
    apply: function(srcCanvas){
      try {
        if (!this.available() || !enabledFlag) return;
        var src = srcCanvas || mainCanvas;
        if (!src || !src.width || !src.height) return;

        // Keep targets in sync if the source backing size drifted (e.g. the
        // integrator forgot a resize call). Cheap guard.
        if (src.width !== bw || src.height !== bh){
          this.resize(src.width, src.height, glDpr);
          if (!this.available()) return;
        }

        // advance the shockwave decay using real wall-clock dt
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        var dt = lastApplyMs ? Math.min(0.1, (now - lastApplyMs) / 1000) : 0;
        lastApplyMs = now;
        if (shockTime > 0) shockTime = Math.max(0, shockTime - dt);

        gl.disable(gl.BLEND);

        // 1) upload the 2D canvas into srcTex (full res)
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

        bindQuad();

        var hw = fbHalf.w, hh = fbHalf.h;
        var qw = fbQuarter.w, qh = fbQuarter.h;

        // 2a) bright-pass → HALF res target (downsample #1)
        gl.useProgram(progBright);
        var locTh = gl.getUniformLocation(progBright, 'uThreshold');
        if (locTh) gl.uniform1f(locTh, 0.70);
        drawPass(progBright, srcTex, fbHalf.fb, hw, hh);

        // 2b) Kawase downsample HALF → QUARTER (blur pass #1)
        gl.useProgram(progBlur);
        var uTexel = gl.getUniformLocation(progBlur, 'uTexel');
        var uOff   = gl.getUniformLocation(progBlur, 'uOffset');
        if (uTexel) gl.uniform2f(uTexel, 1.0 / hw, 1.0 / hh);
        if (uOff)   gl.uniform1f(uOff, 1.5);
        drawPass(progBlur, texHalf, fbQuarter.fb, qw, qh);

        // 2c) Kawase upsample QUARTER → HALF (blur pass #2, wider tap)
        gl.useProgram(progBlur);
        uTexel = gl.getUniformLocation(progBlur, 'uTexel');
        uOff   = gl.getUniformLocation(progBlur, 'uOffset');
        if (uTexel) gl.uniform2f(uTexel, 1.0 / qw, 1.0 / qh);
        if (uOff)   gl.uniform1f(uOff, 2.5);
        drawPass(progBlur, texQuarter, fbHalf.fb, hw, hh);
        // → texHalf now holds the bloom; it is upsampled to full res by LINEAR
        //   sampling inside the composite pass (no extra full-res blur pass).

        // 3) final composite to the visible backbuffer (full res)
        gl.useProgram(progComposite);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, bw, bh);

        // scene (unit 0) + bloom (unit 1)
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        var locScene = gl.getUniformLocation(progComposite, 'uScene');
        if (locScene) gl.uniform1i(locScene, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texHalf);
        var locBloom = gl.getUniformLocation(progComposite, 'uBloom');
        if (locBloom) gl.uniform1i(locBloom, 1);

        var locAmt = gl.getUniformLocation(progComposite, 'uBloomAmt');
        if (locAmt) gl.uniform1f(locAmt, 0.85);

        // shockwave uniforms (amplitude 0 → branch is skipped in-shader)
        var amp = shockDur > 0 ? (shockTime / shockDur) : 0;   // 1 → 0 over life
        var locShock = gl.getUniformLocation(progComposite, 'uShock');
        if (locShock) gl.uniform1f(locShock, amp);
        var locShockC = gl.getUniformLocation(progComposite, 'uShockC');
        if (locShockC) gl.uniform2f(locShockC, shockX, shockY);
        var locAspect = gl.getUniformLocation(progComposite, 'uAspect');
        if (locAspect) gl.uniform1f(locAspect, bh > 0 ? (bw / bh) : 1.0);

        bindQuad();
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // leave texture unit back on 0 for tidiness
        gl.activeTexture(gl.TEXTURE0);
      } catch(e){
        // Any draw error → fail safe: disable so the 2D canvas shows through.
        try { if (window.console) console.warn('[PostFX] apply failed:', e); } catch(_){}
        try { this.setEnabled(false); } catch(_){}
      }
    },

    // Trigger a brief radial UV ripple centered at screen px (x,y), decaying
    // over ~0.4s. Coordinates are in BACKING pixels (same space as canvas.width).
    shockwave: function(x, y){
      try {
        if (!this.available()) return;
        // Convert backing px → UV. Note: the texture is FLIP_Y'd on upload, and
        // composite samples vUv straight, so vUv.y already runs top→bottom like
        // canvas px. Map directly.
        shockX = bw > 0 ? (x / bw) : 0.5;
        shockY = bh > 0 ? (y / bh) : 0.5;
        shockX = Math.min(1, Math.max(0, shockX));
        shockY = Math.min(1, Math.max(0, shockY));
        shockTime = shockDur;
      } catch(e){ /* ignore */ }
    },

    // Master switch. When OFF (or unavailable) the overlay is hidden so the
    // plain 2D canvas is what the player sees.
    setEnabled: function(on){
      enabledFlag = !!on && this.available();
      try {
        if (glCanvas){
          glCanvas.style.display = enabledFlag ? 'block' : 'none';
          if (enabledFlag) positionOverlay();
        }
      } catch(_){}
    },
    enabled: function(){ return !!enabledFlag; },

    // Free all GL resources + drop the overlay. Safe to call multiple times.
    dispose: function(){
      try {
        if (gl){
          if (quadBuf) gl.deleteBuffer(quadBuf);
          if (srcTex) gl.deleteTexture(srcTex);
          if (progBright) gl.deleteProgram(progBright);
          if (progBlur) gl.deleteProgram(progBlur);
          if (progComposite) gl.deleteProgram(progComposite);
          if (fbHalf){ gl.deleteFramebuffer(fbHalf.fb); gl.deleteTexture(fbHalf.tex); }
          if (fbQuarter){ gl.deleteFramebuffer(fbQuarter.fb); gl.deleteTexture(fbQuarter.tex); }
        }
      } catch(_){}
      quadBuf=srcTex=progBright=progBlur=progComposite=null;
      fbHalf=fbQuarter=texHalf=texQuarter=null;
      try {
        if (glCanvas){
          glCanvas.removeEventListener('webglcontextlost', onContextLost, false);
          glCanvas.removeEventListener('webglcontextrestored', onContextRestored, false);
          glCanvas.style.display = 'none';
        }
      } catch(_){}
      gl = null;
      enabledFlag = false;
      shockTime = 0;
      // Keep glCanvas in the DOM (hidden) so a later init() can reuse it; clear
      // size to release backbuffer memory.
      try { if (glCanvas){ glCanvas.width = 1; glCanvas.height = 1; } } catch(_){}
    }
  };

  CA.PostFX = PostFX;
})();
