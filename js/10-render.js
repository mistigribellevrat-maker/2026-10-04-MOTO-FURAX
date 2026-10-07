"use strict";
/* ============================================================================
   RENDU — pipeline HDR premium
   scène (MSAA, demi-flottant) -> bloom (chaîne de mips) -> composition finale
   (ACES, étalonnage, vignette, aberration chromatique, flou radial nitro,
   tilt-shift, grain) + qualité adaptative (résolution dynamique).
   ============================================================================ */

// Flux couleur linéaire correct : les couleurs hexadécimales sont du sRGB.
THREE.ColorManagement.legacyMode = false;

const QUALITY_LEVELS = {
  ultra:  { pr: 2.0,  msaa: 4, shadow: 4096, bloom: 6, fx: 1.0 },
  high:   { pr: 1.6,  msaa: 4, shadow: 2048, bloom: 5, fx: 1.0 },
  medium: { pr: 1.25, msaa: 2, shadow: 2048, bloom: 4, fx: 0.6 },
  low:    { pr: 1.0,  msaa: 0, shadow: 1024, bloom: 0, fx: 0.0 }
};
const QUALITY_ORDER = ["low", "medium", "high", "ultra"];

const POST_VS = [
  "varying vec2 vUv;",
  "void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }"
].join("\n");

const BLOOM_PREFILTER_FS = [
  "precision highp float;",
  "uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee;",
  "varying vec2 vUv;",
  "void main(){",
  "  vec3 c = texture2D(tSrc, vUv).rgb;",
  "  c = min(c, vec3(24.0));",
  "  float br = max(c.r, max(c.g, c.b));",
  "  float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);",
  "  rq = rq * rq / (4.0 * uKnee + 1e-4);",
  "  float w = max(rq, br - uThreshold) / max(br, 1e-4);",
  "  gl_FragColor = vec4(c * w, 1.0);",
  "}"
].join("\n");

const BLOOM_DOWN_FS = [
  "precision highp float;",
  "uniform sampler2D tSrc; uniform vec2 uTexel;",
  "varying vec2 vUv;",
  "void main(){",
  "  vec2 t = uTexel;",
  "  vec3 a = texture2D(tSrc, vUv + t * vec2(-2.0,  2.0)).rgb;",
  "  vec3 b = texture2D(tSrc, vUv + t * vec2( 0.0,  2.0)).rgb;",
  "  vec3 c = texture2D(tSrc, vUv + t * vec2( 2.0,  2.0)).rgb;",
  "  vec3 d = texture2D(tSrc, vUv + t * vec2(-2.0,  0.0)).rgb;",
  "  vec3 e = texture2D(tSrc, vUv).rgb;",
  "  vec3 f = texture2D(tSrc, vUv + t * vec2( 2.0,  0.0)).rgb;",
  "  vec3 g = texture2D(tSrc, vUv + t * vec2(-2.0, -2.0)).rgb;",
  "  vec3 h = texture2D(tSrc, vUv + t * vec2( 0.0, -2.0)).rgb;",
  "  vec3 i = texture2D(tSrc, vUv + t * vec2( 2.0, -2.0)).rgb;",
  "  vec3 j = texture2D(tSrc, vUv + t * vec2(-1.0,  1.0)).rgb;",
  "  vec3 k = texture2D(tSrc, vUv + t * vec2( 1.0,  1.0)).rgb;",
  "  vec3 l = texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb;",
  "  vec3 m = texture2D(tSrc, vUv + t * vec2( 1.0, -1.0)).rgb;",
  "  vec3 r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;",
  "  gl_FragColor = vec4(r, 1.0);",
  "}"
].join("\n");

const BLOOM_UP_FS = [
  "precision highp float;",
  "uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius;",
  "varying vec2 vUv;",
  "void main(){",
  "  vec2 t = uTexel * uRadius;",
  "  vec3 a = texture2D(tSrc, vUv + t * vec2(-1.0,  1.0)).rgb;",
  "  vec3 b = texture2D(tSrc, vUv + t * vec2( 0.0,  1.0)).rgb;",
  "  vec3 c = texture2D(tSrc, vUv + t * vec2( 1.0,  1.0)).rgb;",
  "  vec3 d = texture2D(tSrc, vUv + t * vec2(-1.0,  0.0)).rgb;",
  "  vec3 e = texture2D(tSrc, vUv).rgb;",
  "  vec3 f = texture2D(tSrc, vUv + t * vec2( 1.0,  0.0)).rgb;",
  "  vec3 g = texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb;",
  "  vec3 h = texture2D(tSrc, vUv + t * vec2( 0.0, -1.0)).rgb;",
  "  vec3 i = texture2D(tSrc, vUv + t * vec2( 1.0, -1.0)).rgb;",
  "  vec3 r = e * 4.0 + (b + d + f + h) * 2.0 + (a + c + g + i);",
  "  gl_FragColor = vec4(r / 16.0, 1.0);",
  "}"
].join("\n");

const COMPOSITE_FS = [
  "precision highp float;",
  "uniform sampler2D tScene; uniform sampler2D tBloom;",
  "uniform vec2 uRes; uniform float uTime;",
  "uniform float uExposure, uBloom, uVignette, uAberration, uRadial, uTilt, uTiltFocus, uTiltBand, uBlurPx;",
  "uniform float uGrain, uSat, uContrast, uTintAmt, uDesat, uHasBloom;",
  "uniform vec2 uCenter;",
  "uniform vec3 uTint;",
  "uniform vec3 uShadowTint; uniform vec3 uHighTint;",
  "varying vec2 vUv;",
  "float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }",
  "vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }",
  "vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }",
  "void main(){",
  "  vec2 uv = vUv;",
  "  vec2 px = 1.0 / uRes;",
  "  float asp = uRes.x / uRes.y;",
  "  vec2 dir = uv - uCenter;",
  "  float dist = length(dir * vec2(asp, 1.0));",
  "  float noise = ign(gl_FragCoord.xy + fract(uTime) * 61.0);",
  "  vec3 col;",
  // tilt-shift : flou croissant en s'eloignant de la bande de nettete
  "  float tilt = smoothstep(uTiltBand, uTiltBand + 0.34, abs(uv.y - uTiltFocus)) * uTilt;",
  "  float rad = tilt * uBlurPx;",
  "  if (uRadial > 0.002) {",
  "    vec3 acc = vec3(0.0); float wsum = 0.0;",
  "    for (int i = 0; i < 12; i++) {",
  "      float f = float(i) / 11.0;",
  "      float w = 1.0 - f * 0.55;",
  "      acc += texture2D(tScene, uv - dir * uRadial * (f + noise * 0.08)).rgb * w; wsum += w;",
  "    }",
  "    col = acc / wsum;",
  "  } else if (rad > 0.6) {",
  "    vec3 acc = vec3(0.0);",
  "    for (int i = 0; i < 12; i++) {",
  "      float fi = float(i) + noise;",
  "      float r = sqrt(fi / 12.0) * rad;",
  "      float a = fi * 2.399963;",
  "      acc += texture2D(tScene, uv + vec2(cos(a), sin(a)) * r * px).rgb;",
  "    }",
  "    col = acc / 12.0;",
  "  } else if (uAberration > 0.0001) {",
  "    vec2 off = dir * uAberration * (0.4 + dist * 1.6);",
  "    col = vec3(texture2D(tScene, uv + off).r, texture2D(tScene, uv).g, texture2D(tScene, uv - off).b);",
  "  } else {",
  "    col = texture2D(tScene, uv).rgb;",
  "  }",
  "  if (uHasBloom > 0.5) col += texture2D(tBloom, uv).rgb * uBloom;",
  "  col *= uExposure;",
  "  col = aces(col);",
  "  col = toSRGB(col);",
  // etalonnage : ombres froides / hautes lumieres chaudes, contraste, saturation
  "  float l = dot(col, vec3(0.299, 0.587, 0.114));",
  "  col = mix(col, col * uShadowTint, (1.0 - smoothstep(0.0, 0.55, l)) * 0.55);",
  "  col = mix(col, col * uHighTint,   smoothstep(0.45, 1.0, l) * 0.5);",
  "  col = (col - 0.5) * uContrast + 0.5;",
  "  float l2 = dot(col, vec3(0.299, 0.587, 0.114));",
  "  col = mix(vec3(l2), col, uSat);",
  "  col = mix(col, vec3(l2), uDesat);",
  // vignette
  "  float v = smoothstep(0.35, 1.05, dist * 0.92);",
  "  col *= 1.0 - v * uVignette;",
  "  col = mix(col, uTint, uTintAmt * (0.25 + v * 0.75));",
  // grain + dither
  "  col += (ign(gl_FragCoord.xy * 1.37 + uTime * 13.0) - 0.5) * uGrain;",
  "  col += (noise - 0.5) / 255.0;",
  "  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
  "}"
].join("\n");

const RENDER = {
  renderer: null, canvas: null, container: null,
  level: "high", auto: true, scale: 1, maxScale: 1,
  hdr: false, w: 0, h: 0, cssW: 0, cssH: 0, pr: 1,
  rtScene: null, mips: [], quad: null, quadScene: null, quadCam: null,
  mats: {}, ema: 16.7, slowT: 0, fastT: 0, lastAdjust: 0, frames: 0, time: 0,
  shadowRefresh: null,
  fx: {
    exposure: 0.94, bloom: 0.3, bloomThreshold: 1.85, vignette: 0.32, aberration: 0.0006,
    radial: 0, tilt: 0.5, tiltFocus: 0.3, tiltBand: 0.2, blurPx: 2.6, grain: 0.022,
    sat: 1.1, contrast: 1.07, tint: new THREE.Color(1, 0.1, 0.05), tintAmt: 0, desat: 0,
    cx: 0.5, cy: 0.45
  },

  init(container, opts) {
    opts = opts || {};
    this.container = container;
    const q = new URLSearchParams(location.search);
    const wanted = q.get("quality") || q.get("q") || (opts.level || "auto");
    this.userLevel = wanted;
    this.auto = wanted === "auto" && q.get("auto") !== "0";
    this.level = QUALITY_LEVELS[wanted] ? wanted : "high";
    const renderer = new THREE.WebGLRenderer({
      antialias: false, alpha: false, stencil: false, depth: true,
      powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve
    });
    renderer.autoClear = false;
    renderer.info.autoReset = false;   // compteur d'image complet (toutes les passes)
    renderer.outputEncoding = THREE.LinearEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 1);
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    container.appendChild(this.canvas);
    const caps = renderer.capabilities;
    this.hdr = !!(caps.isWebGL2 && renderer.extensions.has("EXT_color_buffer_float"));
    if (!caps.isWebGL2 && this.level !== "low") this.level = "medium";

    // quad plein ecran
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    const sm = (fs, uniforms, blend) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: POST_VS, fragmentShader: fs, uniforms: uniforms,
        depthTest: false, depthWrite: false, toneMapped: false
      });
      if (blend) { m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.transparent = true; }
      return m;
    };
    const U = (v) => ({ value: v });
    this.mats.prefilter = sm(BLOOM_PREFILTER_FS, { tSrc: U(null), uTexel: U(new THREE.Vector2()), uThreshold: U(1), uKnee: U(0.6) });
    this.mats.down = sm(BLOOM_DOWN_FS, { tSrc: U(null), uTexel: U(new THREE.Vector2()) });
    this.mats.up = sm(BLOOM_UP_FS, { tSrc: U(null), uTexel: U(new THREE.Vector2()), uRadius: U(1.0) }, true);
    this.mats.comp = sm(COMPOSITE_FS, {
      tScene: U(null), tBloom: U(null), uRes: U(new THREE.Vector2(1, 1)), uTime: U(0),
      uExposure: U(1), uBloom: U(0.3), uVignette: U(0.3), uAberration: U(0), uRadial: U(0),
      uTilt: U(0.6), uTiltFocus: U(0.3), uTiltBand: U(0.15), uBlurPx: U(3),
      uGrain: U(0.02), uSat: U(1), uContrast: U(1), uTintAmt: U(0), uDesat: U(0), uHasBloom: U(1),
      uCenter: U(new THREE.Vector2(0.5, 0.45)), uTint: U(new THREE.Color(1, 0, 0)),
      uShadowTint: U(new THREE.Vector3(0.97, 1.0, 1.05)), uHighTint: U(new THREE.Vector3(1.05, 1.0, 0.93))
    });
    this.applyLevel(this.level, true);
    return renderer;
  },

  applyLevel(name, silent) {
    const L = QUALITY_LEVELS[name];
    this.level = name;
    this.cfg = L;
    this.maxScale = 1;
    if (!silent) this.scale = 1;
    if (this.shadowRefresh) this.shadowRefresh(L.shadow);
    this.resize(true);
  },

  // Reglage utilisateur : "auto" (adaptatif) ou un niveau fixe
  setUserLevel(name) {
    this.userLevel = name;
    this.auto = name === "auto";
    this.scale = 1; this.slowT = this.fastT = 0; this.lastAdjust = this.time;
    this.applyLevel(name === "auto" ? "high" : name);
  },

  // Reduit / augmente la qualite d'un cran
  stepLevel(dir) {
    const i = QUALITY_ORDER.indexOf(this.level) + dir;
    if (i < 0 || i >= QUALITY_ORDER.length) return false;
    this.applyLevel(QUALITY_ORDER[i]);
    return true;
  },

  resize(force) {
    const css = this.container.getBoundingClientRect();
    const cw = Math.max(2, Math.floor(css.width || window.innerWidth));
    const ch = Math.max(2, Math.floor(css.height || window.innerHeight));
    const pr = Math.min(window.devicePixelRatio || 1, this.cfg.pr);
    const sw = Math.max(2, Math.floor(cw * pr));
    const sh = Math.max(2, Math.floor(ch * pr));
    const w = Math.max(2, Math.floor(sw * this.scale));
    const h = Math.max(2, Math.floor(sh * this.scale));
    if (!force && sw === this.w0 && sh === this.h0 && w === this.w && h === this.h) return;
    this.cssW = cw; this.cssH = ch; this.pr = pr; this.w0 = sw; this.h0 = sh; this.w = w; this.h = h;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(sw, sh, false);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this._allocTargets();
    if (this.onResize) this.onResize(cw, ch);
  },

  _allocTargets() {
    const L = this.cfg;
    if (this.rtScene) this.rtScene.dispose();
    this.mips.forEach((m) => m.dispose());
    this.mips = [];
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rtScene = new THREE.WebGLRenderTarget(this.w, this.h, {
      type: type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: true, stencilBuffer: false, samples: this.renderer.capabilities.isWebGL2 ? L.msaa : 0
    });
    this.rtScene.texture.generateMipmaps = false;
    this.hasBloom = L.bloom > 0;
    if (this.hasBloom) {
      let bw = Math.max(2, this.w >> 1), bh = Math.max(2, this.h >> 1);
      for (let i = 0; i < L.bloom; i++) {
        const rt = new THREE.WebGLRenderTarget(bw, bh, {
          type: type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
          depthBuffer: false, stencilBuffer: false
        });
        rt.texture.generateMipmaps = false;
        this.mips.push(rt);
        bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      }
    }
  },

  _pass(mat, target, clear) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    if (clear) this.renderer.clear(true, false, false);
    this.renderer.render(this.quadScene, this.quadCam);
  },

  render(scene, camera, dt) {
    const r = this.renderer, fx = this.fx, L = this.cfg;
    this.time += dt;
    r.info.reset();
    // 1. scene -> HDR
    r.setRenderTarget(this.rtScene);
    r.clear(true, true, false);
    r.render(scene, camera);
    // 2. bloom
    const hasBloom = this.hasBloom && this.mips.length > 0;
    if (hasBloom) {
      const M = this.mats, mips = this.mips;
      M.prefilter.uniforms.tSrc.value = this.rtScene.texture;
      M.prefilter.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
      M.prefilter.uniforms.uThreshold.value = fx.bloomThreshold;
      this._pass(M.prefilter, mips[0], false);
      for (let i = 1; i < mips.length; i++) {
        M.down.uniforms.tSrc.value = mips[i - 1].texture;
        M.down.uniforms.uTexel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height);
        this._pass(M.down, mips[i], false);
      }
      for (let i = mips.length - 1; i >= 1; i--) {
        M.up.uniforms.tSrc.value = mips[i].texture;
        M.up.uniforms.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height);
        M.up.uniforms.uRadius.value = 1.0;
        this._pass(M.up, mips[i - 1], false);
      }
    }
    // 3. composition -> ecran
    const u = this.mats.comp.uniforms;
    u.tScene.value = this.rtScene.texture;
    u.tBloom.value = hasBloom ? this.mips[0].texture : this.rtScene.texture;
    u.uHasBloom.value = hasBloom ? 1 : 0;
    u.uRes.value.set(this.w, this.h);
    u.uTime.value = this.time % 100;
    u.uExposure.value = fx.exposure;
    u.uBloom.value = fx.bloom;
    u.uVignette.value = fx.vignette;
    u.uAberration.value = fx.aberration * L.fx;
    u.uRadial.value = fx.radial * (L.fx > 0 ? 1 : 0.6);
    u.uTilt.value = fx.tilt * L.fx;
    u.uTiltFocus.value = fx.tiltFocus;
    u.uTiltBand.value = fx.tiltBand;
    u.uBlurPx.value = fx.blurPx * (this.h / 1080 + 0.35);
    u.uGrain.value = fx.grain * (L.fx > 0 ? 1 : 0.5);
    u.uSat.value = fx.sat;
    u.uContrast.value = fx.contrast;
    u.uTintAmt.value = fx.tintAmt;
    u.uDesat.value = fx.desat;
    u.uCenter.value.set(fx.cx, fx.cy);
    u.uTint.value.copy(fx.tint);
    r.setRenderTarget(null);
    r.setViewport(0, 0, this.w0, this.h0);
    this._pass(this.mats.comp, null, false);
    this.frames++;
  },

  // Qualite adaptative : mesure le temps de frame et ajuste la resolution interne
  tick(rawMs) {
    if (!this.auto) return;
    if (rawMs > 250) return; // onglet en arriere-plan / chargement
    this.ema += (rawMs - this.ema) * 0.06;
    const now = this.time;
    if (now - this.lastAdjust < 2.2 || this.frames < 90) return;
    if (this.ema > 21.5) {
      this.slowT += rawMs / 1000; this.fastT = 0;
      if (this.slowT > 1.2) {
        this.slowT = 0; this.lastAdjust = now;
        if (this.scale > 0.62) { this.scale = Math.max(0.6, this.scale - 0.12); this.resize(true); }
        else if (this.stepLevel(-1)) { this.scale = 0.85; this.resize(true); }
      }
    } else if (this.ema < 12.5) {
      this.fastT += rawMs / 1000; this.slowT = 0;
      if (this.fastT > 5) {
        this.fastT = 0; this.lastAdjust = now;
        if (this.scale < 0.99) { this.scale = Math.min(1, this.scale + 0.1); this.resize(true); }
        else if (this.level !== "ultra" && this.level !== "high" && this.stepLevel(1)) { /* remonte jusqu'a high */ }
      }
    } else { this.slowT = Math.max(0, this.slowT - rawMs / 2000); this.fastT = 0; }
  }
};
