// Bobby Carrot Remastered - Post-Processing & Graphics Renderer (xBR-lv2 & Classic)

export class PostProcessingRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = localStorage.getItem("bobby_render_mode") || "HD_XBR";
    this.isWebGL = false;
    this.gl = null;
    this.programClassic = null;
    this.programXbr = null;
    this.texture = null;
    this.quadBuffer = null;

    // Output buffer resolution: 3x native (768 x 576) for pristine sub-pixel xBR smoothing
    this.canvas.width = 256 * 3;
    this.canvas.height = 192 * 3;

    this.initWebGL();
    this.updateCanvasStyling();
  }

  initWebGL() {
    try {
      this.gl = this.canvas.getContext("webgl", { alpha: false, depth: false, antialias: false }) ||
                this.canvas.getContext("experimental-webgl", { alpha: false, depth: false, antialias: false });
      if (!this.gl) throw new Error("WebGL no disponible");

      const gl = this.gl;

      const vsSource = `
        attribute vec2 a_position;
        varying vec2 v_texCoord;
        void main() {
          v_texCoord = a_position * 0.5 + 0.5;
          v_texCoord.y = 1.0 - v_texCoord.y;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `;

      const fsClassic = `
        precision highp float;
        uniform sampler2D u_texture;
        varying vec2 v_texCoord;
        void main() {
          gl_FragColor = texture2D(u_texture, v_texCoord);
        }
      `;

      const fsXbr = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_textureSize;
        varying vec2 v_texCoord;

        #define XBR_SCALE 3.0
        #define XBR_Y_WEIGHT 48.0
        #define XBR_EQ_THRESHOLD 15.0
        #define XBR_LV2_COEFFICIENT 2.0
        #define lv2_cf XBR_LV2_COEFFICIENT
        #define CORNER_C
        #define SMOOTH_TIPS

        const vec3 rgbw = vec3(14.352, 28.176, 5.472);

        const vec4 Ao = vec4( 1.0, -1.0, -1.0, 1.0 );
        const vec4 Bo = vec4( 1.0,  1.0, -1.0,-1.0 );
        const vec4 Co = vec4( 1.5,  0.5, -0.5, 0.5 );
        const vec4 Ax = vec4( 1.0, -1.0, -1.0, 1.0 );
        const vec4 Bx = vec4( 0.5,  2.0, -0.5,-2.0 );
        const vec4 Cx = vec4( 1.0,  1.0, -0.5, 0.0 );
        const vec4 Ay = vec4( 1.0, -1.0, -1.0, 1.0 );
        const vec4 By = vec4( 2.0,  0.5, -2.0,-0.5 );
        const vec4 Cy = vec4( 2.0,  0.0, -1.0, 0.5 );
        const vec4 Ci = vec4(0.25, 0.25, 0.25, 0.25);

        vec4 df(vec4 A, vec4 B) { return abs(A - B); }
        vec4 diff(vec4 A, vec4 B) { return step(0.001, abs(A - B)); }
        vec4 eq(vec4 A, vec4 B) { return step(df(A, B), vec4(XBR_EQ_THRESHOLD)); }
        vec4 neq(vec4 A, vec4 B) { return vec4(1.0) - eq(A, B); }
        vec4 wd(vec4 a, vec4 b, vec4 c, vec4 d, vec4 e, vec4 f, vec4 g, vec4 h) {
          return (df(a,b) + df(a,c) + df(d,e) + df(d,f) + 4.0*df(g,h));
        }
        float c_df(vec3 c1, vec3 c2) {
          vec3 dfc = abs(c1 - c2);
          return dfc.r + dfc.g + dfc.b;
        }

        void main() {
          float dx = 1.0 / u_textureSize.x;
          float dy = 1.0 / u_textureSize.y;

          vec4 t1 = v_texCoord.xxxy + vec4( -dx, 0.0, dx, -2.0*dy );
          vec4 t2 = v_texCoord.xxxy + vec4( -dx, 0.0, dx,     -dy );
          vec4 t3 = v_texCoord.xxxy + vec4( -dx, 0.0, dx,     0.0 );
          vec4 t4 = v_texCoord.xxxy + vec4( -dx, 0.0, dx,      dy );
          vec4 t5 = v_texCoord.xxxy + vec4( -dx, 0.0, dx,  2.0*dy );
          vec4 t6 = v_texCoord.xyyy + vec4( -2.0*dx, -dy, 0.0, dy );
          vec4 t7 = v_texCoord.xyyy + vec4(  2.0*dx, -dy, 0.0, dy );

          vec2 fp = fract(v_texCoord * u_textureSize);

          vec3 A1 = texture2D(u_texture, t1.xw).xyz;
          vec3 B1 = texture2D(u_texture, t1.yw).xyz;
          vec3 C1 = texture2D(u_texture, t1.zw).xyz;
          vec3 A  = texture2D(u_texture, t2.xw).xyz;
          vec3 B  = texture2D(u_texture, t2.yw).xyz;
          vec3 C  = texture2D(u_texture, t2.zw).xyz;
          vec3 D  = texture2D(u_texture, t3.xw).xyz;
          vec3 E  = texture2D(u_texture, t3.yw).xyz;
          vec3 F  = texture2D(u_texture, t3.zw).xyz;
          vec3 G  = texture2D(u_texture, t4.xw).xyz;
          vec3 H  = texture2D(u_texture, t4.yw).xyz;
          vec3 I  = texture2D(u_texture, t4.zw).xyz;
          vec3 G5 = texture2D(u_texture, t5.xw).xyz;
          vec3 H5 = texture2D(u_texture, t5.yw).xyz;
          vec3 I5 = texture2D(u_texture, t5.zw).xyz;
          vec3 A0 = texture2D(u_texture, t6.xy).xyz;
          vec3 D0 = texture2D(u_texture, t6.xz).xyz;
          vec3 G0 = texture2D(u_texture, t6.xw).xyz;
          vec3 C4 = texture2D(u_texture, t7.xy).xyz;
          vec3 F4 = texture2D(u_texture, t7.xz).xyz;
          vec3 I4 = texture2D(u_texture, t7.xw).xyz;

          vec4 b  = vec4(dot(B ,rgbw), dot(D ,rgbw), dot(H ,rgbw), dot(F ,rgbw));
          vec4 c  = vec4(dot(C ,rgbw), dot(A ,rgbw), dot(G ,rgbw), dot(I ,rgbw));
          vec4 d  = b.yzwx;
          vec4 e  = vec4(dot(E,rgbw));
          vec4 f  = b.wxyz;
          vec4 g  = c.zwxy;
          vec4 h  = b.zwxy;
          vec4 i  = c.wxyz;

          vec4 i4 = vec4(dot(I4,rgbw), dot(C1,rgbw), dot(A0,rgbw), dot(G5,rgbw));
          vec4 i5 = vec4(dot(I5,rgbw), dot(C4,rgbw), dot(A1,rgbw), dot(G0,rgbw));
          vec4 h5 = vec4(dot(H5,rgbw), dot(F4,rgbw), dot(B1,rgbw), dot(D0,rgbw));
          vec4 f4 = h5.yzwx;

          vec4 fx   = (Ao*fp.y+Bo*fp.x);
          vec4 fx_l = (Ax*fp.y+Bx*fp.x);
          vec4 fx_u = (Ay*fp.y+By*fp.x);

          vec4 irlv0 = diff(e,f) * diff(e,h);
          vec4 irlv1 = irlv0 * ( neq(f,b) * neq(f,c) + neq(h,d) * neq(h,g) + eq(e,i) * (neq(f,f4) * neq(f,i4) + neq(h,h5) * neq(h,i5)) + eq(e,g) + eq(e,c));

          vec4 irlv2l = diff(e,g) * diff(d,g);
          vec4 irlv2u = diff(e,c) * diff(b,c);

          vec4 delta   = vec4(1.0/XBR_SCALE);
          vec4 delta_l = vec4(0.5/XBR_SCALE, 1.0/XBR_SCALE, 0.5/XBR_SCALE, 1.0/XBR_SCALE);
          vec4 delta_u = delta_l.yxwz;

          vec4 fx45i = clamp((fx   + delta   -Co - Ci)/(2.0*delta  ), 0.0, 1.0);
          vec4 fx45  = clamp((fx   + delta   -Co     )/(2.0*delta  ), 0.0, 1.0);
          vec4 fx30  = clamp((fx_l + delta_l -Cx     )/(2.0*delta_l), 0.0, 1.0);
          vec4 fx60  = clamp((fx_u + delta_u -Cy     )/(2.0*delta_u), 0.0, 1.0);

          vec4 wd1 = wd( e, c,  g, i, h5, f4, h, f);
          vec4 wd2 = wd( h, d, i5, f, i4,  b, e, i);

          vec4 edri  = step(wd1, wd2) * irlv0;
          vec4 edr   = step(wd1 + vec4(0.1), wd2) * step(vec4(0.5), irlv1);
          vec4 edr_l = step( lv2_cf*df(f,g), df(h,c) ) * irlv2l * edr;
          vec4 edr_u = step( lv2_cf*df(h,c), df(f,g) ) * irlv2u * edr;

          fx45  = edr   * fx45;
          fx30  = edr_l * fx30;
          fx60  = edr_u * fx60;
          fx45i = edri  * fx45i;

          vec4 px = step(df(e,f), df(e,h));
          vec4 maximos = max(max(fx30, fx60), max(fx45, fx45i));

          vec3 res1 = E;
          res1 = mix(res1, mix(H, F, px.x), maximos.x);
          res1 = mix(res1, mix(B, D, px.z), maximos.z);

          vec3 res2 = E;
          res2 = mix(res2, mix(F, B, px.y), maximos.y);
          res2 = mix(res2, mix(D, H, px.w), maximos.w);

          vec3 res = mix(res1, res2, step(c_df(E, res1), c_df(E, res2)));
          gl_FragColor = vec4(res, 1.0);
        }
      `;

      const createProg = (fs) => {
        const comp = (type, src) => {
          const s = gl.createShader(type);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
          return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, comp(gl.VERTEX_SHADER, vsSource));
        gl.attachShader(p, comp(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        return p;
      };

      this.programClassic = createProg(fsClassic);
      this.programXbr = createProg(fsXbr);

      // Vertex quad buffer
      this.quadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]), gl.STATIC_DRAW);

      // Texture setup
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      this.isWebGL = true;
    } catch (e) {
      console.warn("WebGL no disponible para post-procesado xBR, usando fallback 2D:", e);
      this.isWebGL = false;
      this.ctx2d = this.canvas.getContext("2d");
    }
  }

  setMode(mode) {
    this.mode = mode;
    localStorage.setItem("bobby_render_mode", mode);
    this.updateCanvasStyling();
  }

  updateCanvasStyling() {
    if (this.mode === "HD_XBR") {
      this.canvas.classList.add("mode-hd");
      this.canvas.classList.remove("mode-classic");
    } else {
      this.canvas.classList.add("mode-classic");
      this.canvas.classList.remove("mode-hd");
    }
  }

  render(sourceCanvas) {
    if (!this.isWebGL) {
      if (this.ctx2d) {
        this.ctx2d.imageSmoothingEnabled = (this.mode === "HD_XBR");
        if (this.ctx2d.imageSmoothingEnabled) this.ctx2d.imageSmoothingQuality = "high";
        this.ctx2d.drawImage(sourceCanvas, 0, 0, this.canvas.width, this.canvas.height);
      }
      return;
    }

    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);

    const prog = (this.mode === "HD_XBR") ? this.programXbr : this.programClassic;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const posLoc = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texLoc = gl.getUniformLocation(prog, "u_texture");
    gl.uniform1i(texLoc, 0);

    if (this.mode === "HD_XBR") {
      const sizeLoc = gl.getUniformLocation(prog, "u_textureSize");
      gl.uniform2f(sizeLoc, 256.0, 192.0);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
