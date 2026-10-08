"use strict";
/* ============================================================================
   EFFETS — particules HDR instanciees (fumee, etincelles etirees, debris, lueurs),
   trainee lumineuse nitro, traces de pneus, lignes de vitesse, poussiere en suspension.
   Les couleurs passees sont "visuelles" (sRGB) ; elles sont converties en lineaire.
   ============================================================================ */

const PARTICLES_VS = [
  "attribute vec3 iPos; attribute vec3 iColor; attribute vec2 iSize; attribute float iAlpha; attribute float iRot;",
  "attribute vec3 iVel; attribute float iStretch;",
  "varying vec2 vUv; varying vec3 vColor; varying float vAlpha;",
  "void main(){",
  "  vUv = uv; vColor = iColor; vAlpha = iAlpha;",
  "  vec4 mv = viewMatrix * vec4(iPos, 1.0);",
  "  vec2 q = position.xy; vec2 corner;",
  "  if (iStretch > 0.001) {",
  "    vec2 d = (viewMatrix * vec4(iVel, 0.0)).xy; float l = length(d);",
  "    d = l > 1e-4 ? d / l : vec2(1.0, 0.0);",
  "    vec2 pd = vec2(-d.y, d.x);",
  "    float len = iSize.x * (1.0 + iStretch * length(iVel));",
  "    corner = d * q.x * len + pd * q.y * iSize.y;",
  "  } else {",
  "    float c = cos(iRot), s = sin(iRot);",
  "    corner = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * iSize;",
  "  }",
  "  mv.xy += corner;",
  "  gl_Position = projectionMatrix * mv;",
  "}"
].join("\n");
const PARTICLES_FS = [
  "precision highp float;",
  "uniform sampler2D map;",
  "varying vec2 vUv; varying vec3 vColor; varying float vAlpha;",
  "void main(){",
  "  vec4 t = texture2D(map, vUv);",
  "  if (t.a * vAlpha < 0.004) discard;",
  "  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);",
  "}"
].join("\n");

const _lin = (v) => v * v; // approximation sRGB -> lineaire

class ParticlePool {
  constructor(count, texture, blending, order) {
    this.count = count; this.cursor = 0; this.p = [];
    for (let i = 0; i < count; i++) this.p.push({ life: 0, ttl: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, svx: 0, svy: 0, svz: 0, stretch: 0, s0: 1, s1: 0, r: 1, g: 1, b: 1, r1: 1, g1: 1, b1: 1, a0: 1, a1: 0, rot: 0, vr: 0, grav: 0, drag: 0.96, bounce: 0, glow: 1 });
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute("position", base.getAttribute("position"));
    geo.setAttribute("uv", base.getAttribute("uv"));
    this.iPos = new Float32Array(count * 3); this.iColor = new Float32Array(count * 3); this.iSize = new Float32Array(count * 2);
    this.iAlpha = new Float32Array(count); this.iRot = new Float32Array(count); this.iVel = new Float32Array(count * 3); this.iStretch = new Float32Array(count);
    const mk = (arr, n, dyn) => { const a = new THREE.InstancedBufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    geo.setAttribute("iPos", mk(this.iPos, 3)); geo.setAttribute("iColor", mk(this.iColor, 3)); geo.setAttribute("iSize", mk(this.iSize, 2));
    geo.setAttribute("iAlpha", mk(this.iAlpha, 1)); geo.setAttribute("iRot", mk(this.iRot, 1)); geo.setAttribute("iVel", mk(this.iVel, 3)); geo.setAttribute("iStretch", mk(this.iStretch, 1));
    geo.instanceCount = count;
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } }, vertexShader: PARTICLES_VS, fragmentShader: PARTICLES_FS,
      transparent: true, depthWrite: false, blending: blending || THREE.NormalBlending, toneMapped: false
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order || 8;
    scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, o) {
    o = o || {};
    const p = this.p[this.cursor];
    this.cursor = (this.cursor + 1) % this.count;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    const sv = o.sv; p.svx = sv ? sv[0] : vx; p.svy = sv ? sv[1] : vy; p.svz = sv ? sv[2] : vz;
    p.stretch = o.stretch || 0;
    p.ttl = o.ttl != null ? o.ttl : 1; p.life = p.ttl;
    p.s0 = o.s0 != null ? o.s0 : 1; p.s1 = o.s1 != null ? o.s1 : p.s0 * 0.4;
    const r = o.r != null ? o.r : 1, g = o.g != null ? o.g : 1, b = o.b != null ? o.b : 1;
    p.glow = o.glow || 1;
    p.r = _lin(r) * p.glow; p.g = _lin(g) * p.glow; p.b = _lin(b) * p.glow;
    p.r1 = _lin(o.r1 != null ? o.r1 : r) * p.glow; p.g1 = _lin(o.g1 != null ? o.g1 : g) * p.glow; p.b1 = _lin(o.b1 != null ? o.b1 : b) * p.glow;
    p.a0 = o.a0 != null ? o.a0 : 1; p.a1 = o.a1 != null ? o.a1 : 0; p.am = o.am != null ? o.am : null; p.thin = o.thin || 0.35;
    p.rot = o.rot != null ? o.rot : 0; p.vr = o.vr != null ? o.vr : 0;
    p.grav = o.grav != null ? o.grav : 0; p.drag = o.drag != null ? o.drag : 0.96; p.bounce = o.bounce || 0;
  }
  update(dt) {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const p = this.p[i], o = i * 3;
      if (p.life <= 0) { this.iAlpha[i] = 0; this.iSize[i * 2] = 0; this.iSize[i * 2 + 1] = 0; this.iPos[o + 1] = -999; continue; }
      p.life -= dt;
      const t = 1 - p.life / p.ttl, d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.bounce > 0 && p.y < 0.04 && p.vy < 0) { p.y = 0.04; p.vy = -p.vy * 0.42; p.vx *= 0.7; p.vz *= 0.7; if (Math.abs(p.vy) < 0.4) p.bounce = 0; }
      p.rot += p.vr * dt;
      this.iPos[o] = p.x; this.iPos[o + 1] = p.y; this.iPos[o + 2] = p.z;
      const s = lerp(p.s0, p.s1, t);
      this.iSize[i * 2] = s; this.iSize[i * 2 + 1] = p.stretch > 0 ? Math.max(0.01, s * p.thin) : s;
      this.iColor[o] = lerp(p.r, p.r1, t); this.iColor[o + 1] = lerp(p.g, p.g1, t); this.iColor[o + 2] = lerp(p.b, p.b1, t);
      this.iAlpha[i] = p.am != null ? (t < 0.5 ? lerp(p.a0, p.am, t * 2) : lerp(p.am, p.a1, (t - 0.5) * 2)) : lerp(p.a0, p.a1, t);
      this.iRot[i] = p.rot;
      this.iVel[o] = p.stretch > 0 ? (p.bounce ? p.vx : p.svx) : 0; this.iVel[o + 1] = p.stretch > 0 ? (p.bounce ? p.vy : p.svy) : 0; this.iVel[o + 2] = p.stretch > 0 ? (p.bounce ? p.vz : p.svz) : 0;
      this.iStretch[i] = p.stretch;
    }
    const A = this.geo.attributes;
    A.iPos.needsUpdate = A.iColor.needsUpdate = A.iSize.needsUpdate = A.iAlpha.needsUpdate = A.iRot.needsUpdate = A.iVel.needsUpdate = A.iStretch.needsUpdate = true;
  }
}

let fxSmoke, fxSpark, fxDebris, fxGlow, fxWind, fxDust, nitroTrail, skids;

function buildFxTextures() {
  TEX.smoke = canvasTex(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(0.5, "rgba(255,255,255,.4)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { x.fillStyle = "rgba(255,255,255," + Math.random() * 0.06 + ")"; x.beginPath(); x.arc(64 + (Math.random() - 0.5) * 70, 64 + (Math.random() - 0.5) * 70, 4 + Math.random() * 12, 0, 6.3); x.fill(); }
  }, 1, 1, true);
  TEX.spark = canvasTex(64, 64, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.85)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }, 1, 1, true);
  TEX.glowSoft = canvasTex(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }, 1, 1, true);
  TEX.square = canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = "rgba(255,255,255,1)"; x.fillRect(8, 8, 48, 48);
  }, 1, 1, true);
  TEX.streak = canvasTex(64, 16, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 4, w, 8);
  }, 1, 1, true);
  [TEX.smoke, TEX.spark, TEX.glowSoft, TEX.square, TEX.streak].forEach((t) => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; });
}

/* ------------------------- Traînée lumineuse de la nitro ------------------------- */
class NitroTrail {
  constructor() {
    this.N = 34;
    this.pos = []; for (let i = 0; i < this.N; i++) this.pos.push(new THREE.Vector3(0, -99, 0));
    const geo = new THREE.BufferGeometry();
    this.attrPos = new THREE.BufferAttribute(new Float32Array(this.N * 2 * 3), 3); this.attrPos.setUsage(THREE.DynamicDrawUsage);
    const t = new Float32Array(this.N * 2), idx = [];
    for (let i = 0; i < this.N; i++) { t[i * 2] = i / (this.N - 1); t[i * 2 + 1] = i / (this.N - 1); }
    for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setAttribute("position", this.attrPos);
    geo.setAttribute("aT", new THREE.BufferAttribute(t, 1));
    geo.setAttribute("aSide", new THREE.BufferAttribute(new Float32Array(this.N * 2).map((_, i) => (i % 2 ? 1 : -1)), 1));
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 } },
      vertexShader: "attribute float aT; attribute float aSide; varying float vT; varying float vS; void main(){ vT = aT; vS = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: [
        "precision highp float; uniform float uI; varying float vT; varying float vS;",
        "void main(){",
        "  float edge = 1.0 - abs(vS) * 0.0;",
        "  vec3 head = vec3(2.6, 5.2, 9.0); vec3 tail = vec3(0.05, 0.25, 1.4);",
        "  vec3 c = mix(head, tail, pow(vT, 0.6));",
        "  float a = (1.0 - vT) * (1.0 - vT) * uI;",
        "  gl_FragColor = vec4(c, a);",
        "}"
      ].join("\n"),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
    scene.add(this.mesh);
    this.intensity = 0; this.accum = 0;
  }
  reset(p) { for (let i = 0; i < this.N; i++) this.pos[i].copy(p); this.intensity = 0; }
  update(dt, headPos, active) {
    this.intensity = damp(this.intensity, active ? 1 : 0, active ? 14 : 6, dt);
    this.accum += dt;
    if (this.accum > 0.012) {
      this.accum = 0;
      for (let i = this.N - 1; i > 0; i--) this.pos[i].copy(this.pos[i - 1]);
    }
    this.pos[0].copy(headPos);
    const P = this.attrPos.array;
    for (let i = 0; i < this.N; i++) {
      const t = i / (this.N - 1), w = 0.18 * (1 - t * 0.85) * (0.5 + this.intensity * 0.7);
      const p = this.pos[i];
      P[i * 6] = p.x - w; P[i * 6 + 1] = p.y; P[i * 6 + 2] = p.z;
      P[i * 6 + 3] = p.x + w; P[i * 6 + 4] = p.y; P[i * 6 + 5] = p.z;
    }
    this.attrPos.needsUpdate = true;
    this.mat.uniforms.uI.value = this.intensity;
    this.mesh.visible = this.intensity > 0.01;
  }
}

/* ------------------------------ Traces de pneus ------------------------------ */
class SkidMarks {
  constructor(max) {
    this.max = max; this.cur = 0;
    this.info = [];
    for (let i = 0; i < max; i++) this.info.push({ born: -99, a: 0 });
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3); this.col = new Float32Array(max * 4 * 4);
    const idx = [];
    for (let i = 0; i < max; i++) { const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    for (let i = 0; i < max * 4; i++) this.pos[i * 3 + 1] = -50;
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4));
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }
  add(x, y, z, w, len, alpha, t) {
    const i = this.cur; this.cur = (this.cur + 1) % this.max;
    const b = i * 12;
    const y0 = y + 0.02;
    const P = this.pos;
    P[b] = x - w; P[b + 1] = y0; P[b + 2] = z - len;
    P[b + 3] = x + w; P[b + 4] = y0; P[b + 5] = z - len;
    P[b + 6] = x + w; P[b + 7] = y0; P[b + 8] = z + len;
    P[b + 9] = x - w; P[b + 10] = y0; P[b + 11] = z + len;
    this.info[i].born = t; this.info[i].a = alpha;
    this.geo.attributes.position.needsUpdate = true;
  }
  update(t) {
    const C = this.col;
    for (let i = 0; i < this.max; i++) {
      const inf = this.info[i], age = t - inf.born, a = age > 12 ? 0 : inf.a * (1 - age / 12);
      for (let k = 0; k < 4; k++) { const o = (i * 4 + k) * 4; C[o] = 0.02; C[o + 1] = 0.02; C[o + 2] = 0.025; C[o + 3] = a; }
    }
    this.geo.attributes.color.needsUpdate = true;
  }
  clear() { for (let i = 0; i < this.max; i++) { this.info[i].born = -99; for (let k = 0; k < 12; k++) if (k % 3 === 1) this.pos[i * 12 + k] = -50; } this.geo.attributes.position.needsUpdate = true; }
}

function buildParticles() {
  buildFxTextures();
  fxSmoke = new ParticlePool(520, TEX.smoke, THREE.NormalBlending, 6);
  fxDebris = new ParticlePool(260, TEX.square, THREE.NormalBlending, 6);
  fxSpark = new ParticlePool(700, TEX.spark, THREE.AdditiveBlending, 8);
  fxGlow = new ParticlePool(160, TEX.glowSoft, THREE.AdditiveBlending, 9);
  fxWind = new ParticlePool(90, TEX.streak, THREE.NormalBlending, 7);
  fxDust = new ParticlePool(140, TEX.glowSoft, THREE.AdditiveBlending, 7);
  nitroTrail = new NitroTrail();
  skids = new SkidMarks(220);
}
function updateParticles(dt) {
  fxSmoke.update(dt); fxDebris.update(dt); fxSpark.update(dt); fxGlow.update(dt); fxWind.update(dt); fxDust.update(dt);
}

/* ------------------------------ Emetteurs ------------------------------ */
function smokePuff(x, y, z, o) {
  o = o || {};
  const g = o.g != null ? o.g : 0.86;
  fxSmoke.emit(x, y, z, rnd(-0.4, 0.4), rnd(0.6, 1.5), rnd(-0.4, 0.4), {
    ttl: o.ttl || rnd(0.5, 1.0), s0: o.s0 || rnd(0.3, 0.6), s1: (o.s0 || 0.5) * 2.8,
    r: o.r != null ? o.r : 0.86, g: g, b: o.b != null ? o.b : 0.9,
    a0: o.a0 != null ? o.a0 : 0.4, a1: 0, rot: rnd(0, 6.3), vr: rnd(-1.6, 1.6), drag: 0.94
  });
}
function sparksBurst(x, y, z, n, o) {
  o = o || {};
  for (let i = 0; i < n; i++) {
    fxSpark.emit(x, y, z, rnd(-1, 1) * (o.power || 5), rnd(1.5, 6), rnd(-1, 1) * (o.power || 5), {
      ttl: rnd(0.2, 0.55), s0: rnd(0.22, 0.5), s1: 0.06, stretch: 0.045,
      r: o.r != null ? o.r : 1, g: o.g != null ? o.g : 0.78, b: o.b != null ? o.b : 0.3,
      r1: 1, g1: 0.25, b1: 0.05, glow: o.glow || 5,
      a0: 1, grav: 18, drag: 0.9, bounce: 1
    });
  }
}
function debrisBurst(x, y, z, n, colors) {
  for (let i = 0; i < n; i++) {
    const col = colors ? pick(colors) : [0.9, 0.9, 0.95];
    fxDebris.emit(x, y + rnd(0, 1), z, rnd(-5, 5), rnd(4, 9), rnd(-5, 5), {
      ttl: rnd(0.7, 1.3), s0: rnd(0.1, 0.3), s1: rnd(0.05, 0.2),
      r: col[0], g: col[1], b: col[2], a0: 1, a1: 0.4,
      grav: 18, rot: rnd(0, 6.3), vr: rnd(-12, 12), drag: 0.92, bounce: 1
    });
  }
}
function heartsBurst(x, y, z, n) {
  for (let i = 0; i < n; i++) {
    fxGlow.emit(x + rnd(-0.4, 0.4), y + rnd(0, 0.3), z + rnd(-0.4, 0.4), rnd(-0.5, 0.5), rnd(1, 2.2), rnd(-0.5, 0.5), {
      ttl: rnd(0.8, 1.3), s0: 0.5, s1: 0.18, r: 1, g: 0.3, b: 0.55, r1: 1, g1: 0.55, b1: 0.8, glow: 3.2,
      a0: 0.95, drag: 0.95, rot: rnd(0, 6.3), vr: rnd(-2, 2)
    });
  }
}
function confettiBurst(x, y, z, n) {
  const cols = [[1, 0.3, 0.2], [1, 0.8, 0.2], [0.2, 0.9, 0.5], [0.3, 0.7, 1], [1, 0.4, 0.8]];
  for (let i = 0; i < n; i++) {
    const col = pick(cols);
    fxDebris.emit(x + rnd(-8, 8), y + rnd(0, 6), z + rnd(-8, 8), rnd(-2, 2), rnd(-1, 2), rnd(-2, 2), {
      ttl: rnd(1.6, 3), s0: rnd(0.14, 0.3), s1: rnd(0.1, 0.22), r: col[0], g: col[1], b: col[2],
      a0: 1, a1: 0.7, grav: 3.2, rot: rnd(0, 6.3), vr: rnd(-7, 7), drag: 0.985
    });
  }
}
// onde de choc lumineuse (impact, ramassage)
function flashGlow(x, y, z, r, g, b, size, glow) {
  fxGlow.emit(x, y, z, 0, 0, 0, { ttl: 0.35, s0: size * 0.4, s1: size, r: r, g: g, b: b, glow: glow || 3, a0: 0.9, a1: 0 });
}

/* --------------------- Ambiance : vent et poussiere --------------------- */
let dustAcc = 0, windAcc = 0;
function ambientFx(dt, spd, focusX, focusZ) {
  // poussiere lumineuse dans le rayon de soleil
  dustAcc += dt * 14;
  while (dustAcc > 1) {
    dustAcc -= 1;
    fxDust.emit(focusX + rnd(-13, 13), rnd(0.8, 9), focusZ - rnd(4, 55), rnd(-0.2, 0.2), rnd(-0.05, 0.25), rnd(-0.3, 0.3), {
      ttl: rnd(3, 6), s0: rnd(0.07, 0.16), s1: rnd(0.03, 0.08), r: 1, g: 0.86, b: 0.6, glow: 2.2, a0: 0.0, am: rnd(0.35, 0.8), a1: 0.0, drag: 0.99
    });
  }
  // lignes de vitesse de part et d'autre
  if (spd > 0.5) {
    windAcc += dt * (18 + spd * 40);
    while (windAcc > 1) {
      windAcc -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      fxWind.emit(focusX + side * rnd(2.4, 8.5), rnd(0.4, 5.5), focusZ - rnd(8, 38), 0, 0, 0, {
        ttl: rnd(0.14, 0.3), s0: rnd(3, 6.5) * spd, s1: rnd(3, 6.5) * spd, sv: [0, 0, 1], stretch: 1, thin: 0.035,
        r: 1, g: 1, b: 1, a0: 0.0, am: clamp((spd - 0.4) * 0.9, 0, 0.6), a1: 0.0, drag: 1
      });
    }
  }
}
