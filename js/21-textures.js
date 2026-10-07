"use strict";
/* ============================================================================
   TEXTURES PBR PROCEDURALES
   Chaque surface = albedo + normal (derivee d'une carte de hauteur) +
   ORM (G = rugosite, B = metal) + emissive. Tout est genere au demarrage.
   ============================================================================ */

function cv(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d", { willReadFrequently: true }); return c; }

// Pile de calques pour peindre d'un coup albedo / hauteur / ORM / emissive
class Layers {
  constructor(w, h, base) {
    base = base || {};
    this.w = w; this.h = h;
    this.cA = cv(w, h); this.cH = cv(w, h); this.cO = cv(w, h); this.cE = cv(w, h);
    this.A = this.cA.getContext("2d"); this.H = this.cH.getContext("2d");
    this.O = this.cO.getContext("2d"); this.E = this.cE.getContext("2d");
    this.A.fillStyle = base.a || "#888"; this.A.fillRect(0, 0, w, h);
    this.H.fillStyle = "rgb(" + (base.h != null ? base.h : 128) + "," + (base.h != null ? base.h : 128) + "," + (base.h != null ? base.h : 128) + ")"; this.H.fillRect(0, 0, w, h);
    this.O.fillStyle = Layers.orm(base.r != null ? base.r : 0.9, base.m || 0); this.O.fillRect(0, 0, w, h);
    this.E.fillStyle = "#000"; this.E.fillRect(0, 0, w, h);
  }
  static orm(r, m) { return "rgb(255," + Math.round(clamp(r, 0, 1) * 255) + "," + Math.round(clamp(m, 0, 1) * 255) + ")"; }
  static g(v) { v = Math.round(clamp(v, 0, 255)); return "rgb(" + v + "," + v + "," + v + ")"; }
  // rect : couleur (albedo), hauteur 0..255, rugosite, metal, emissive (couleur ou null)
  rect(x, y, w, h, a, hh, r, m, e) {
    if (a) { this.A.fillStyle = a; this.A.fillRect(x, y, w, h); }
    if (hh != null) { this.H.fillStyle = Layers.g(hh); this.H.fillRect(x, y, w, h); }
    if (r != null) { this.O.fillStyle = Layers.orm(r, m || 0); this.O.fillRect(x, y, w, h); }
    if (e) { this.E.fillStyle = e; this.E.fillRect(x, y, w, h); }
  }
  // meme rect avec transparence (albedo seulement + hauteur optionnelle)
  tint(x, y, w, h, rgba, hh) {
    this.A.fillStyle = rgba; this.A.fillRect(x, y, w, h);
    if (hh != null) { this.H.fillStyle = Layers.g(hh); this.H.fillRect(x, y, w, h); }
  }
  line(x0, y0, x1, y1, lw, a, hh) {
    if (a) { this.A.strokeStyle = a; this.A.lineWidth = lw; this.A.beginPath(); this.A.moveTo(x0, y0); this.A.lineTo(x1, y1); this.A.stroke(); }
    if (hh != null) { this.H.strokeStyle = Layers.g(hh); this.H.lineWidth = lw; this.H.beginPath(); this.H.moveTo(x0, y0); this.H.lineTo(x1, y1); this.H.stroke(); }
  }
  grad(x, y, w, h, c0, c1, r, m) {
    const g = this.A.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    this.A.fillStyle = g; this.A.fillRect(x, y, w, h);
    if (r != null) { this.O.fillStyle = Layers.orm(r, m || 0); this.O.fillRect(x, y, w, h); }
  }
  // grain fin sur albedo et hauteur
  grain(amount, rng, size) {
    const n = Math.floor(this.w * this.h / 14);
    for (let i = 0; i < n; i++) {
      const x = rng() * this.w, y = rng() * this.h, v = rng();
      this.A.fillStyle = v > 0.5 ? "rgba(255,255,255," + (amount * 0.5 * rng()) + ")" : "rgba(0,0,0," + (amount * rng()) + ")";
      this.A.fillRect(x, y, size || 1.5, size || 1.5);
      this.H.fillStyle = v > 0.5 ? "rgba(255,255,255," + (amount * 0.4 * rng()) + ")" : "rgba(0,0,0," + (amount * 0.7 * rng()) + ")";
      this.H.fillRect(x, y, size || 1.5, size || 1.5);
    }
  }
  // transforme en jeu de textures three.js
  toTextures(normalStrength, opts) {
    opts = opts || {};
    const mk = (canvas, srgb) => {
      const t = new THREE.CanvasTexture(canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = opts.aniso || 8;
      t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
      return t;
    };
    const set = {
      map: mk(this.cA, true),
      normalMap: mk(heightToNormal(this.cH, normalStrength || 3), false),
      orm: mk(this.cO, false)
    };
    if (opts.emissive) set.emissiveMap = mk(this.cE, true);
    return set;
  }
}

// carte de hauteur -> normal map (tileable, differences centrales ; boucle typee sans appels)
function heightToNormal(hc, strength) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext("2d").getImageData(0, 0, w, h).data;
  const hf = new Float32Array(w * h);
  for (let i = 0, n = w * h; i < n; i++) hf[i] = src[i * 4] * (1 / 255);
  const out = cv(w, h), ox = out.getContext("2d"), id = ox.createImageData(w, h), d = id.data;
  for (let y = 0; y < h; y++) {
    const r0 = y * w, rU = ((y - 1 + h) % h) * w, rD = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const xl = x === 0 ? w - 1 : x - 1, xr = x === w - 1 ? 0 : x + 1;
      const dx = (hf[r0 + xl] - hf[r0 + xr]) * strength;
      const dy = (hf[rD + x] - hf[rU + x]) * strength;
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (r0 + x) * 4;
      d[i] = (dx * l * 0.5 + 0.5) * 255; d[i + 1] = (dy * l * 0.5 + 0.5) * 255; d[i + 2] = (l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  ox.putImageData(id, 0, 0);
  return out;
}

function pbrMaterial(set, o) {
  o = o || {};
  return new THREE.MeshStandardMaterial(Object.assign({
    map: set.map, normalMap: set.normalMap, roughnessMap: set.orm, metalnessMap: set.orm,
    roughness: 1, metalness: 1, vertexColors: true, envMapIntensity: 1,
    normalScale: new THREE.Vector2(1, 1)
  }, set.emissiveMap ? { emissiveMap: set.emissiveMap, emissive: new THREE.Color(0xffffff), emissiveIntensity: o.emissiveIntensity || 1.0 } : {}, o.mat || {}));
}

/* ----------------------------- FACADES (6 styles) ---------------------------- */
// Tuile : 4 modules (colonnes) x 2 etages, module = 256 px = 3,2 m
const FAC = { MOD: 256, COLS: 4, ROWS: 2, W: 1024, H: 512 };

function paintGlassPane(L, x, y, w, h, rng, o) {
  o = o || {};
  const tone = o.tone || [["#26394f", "#5d7d9d"], ["#1f3347", "#4d6f90"], ["#2b3f55", "#6a88a8"]][Math.floor(rng() * 3)];
  L.grad(x, y, w, h, tone[0], tone[1], 0.05, o.metal != null ? o.metal : 0.55);
  L.rect(x, y, w, h, null, o.recess != null ? o.recess : 70);
  // reflet diagonal du ciel
  L.A.save(); L.A.beginPath(); L.A.rect(x, y, w, h); L.A.clip();
  L.A.fillStyle = "rgba(255,255,255,.13)";
  L.A.beginPath(); L.A.moveTo(x + w * 0.1, y + h); L.A.lineTo(x + w * 0.55, y); L.A.lineTo(x + w * 0.75, y); L.A.lineTo(x + w * 0.3, y + h); L.A.fill();
  L.A.restore();
  const roll = rng();
  if (roll < (o.curtain != null ? o.curtain : 0.42)) {
    const c = ["#efe6d2", "#d8c9a8", "#c9d5e2", "#e8cfc5", "#b9c7a8"][Math.floor(rng() * 5)];
    const cw = w * (0.38 + rng() * 0.3);
    L.A.fillStyle = c; L.A.globalAlpha = 0.9; L.A.fillRect(x, y, cw, h * (0.55 + rng() * 0.45));
    if (rng() < 0.5) L.A.fillRect(x + w - cw * 0.8, y, cw * 0.8, h * (0.5 + rng() * 0.4));
    L.A.globalAlpha = 1;
    L.rect(x, y, 0, 0, null, null, 0.9, 0);
  } else if (roll < 0.58) {
    L.A.fillStyle = "rgba(14,16,22,.7)"; L.A.fillRect(x, y + h * 0.1, w, h * 0.9);
  }
  if (rng() < (o.lit != null ? o.lit : 0.16)) {
    L.E.fillStyle = rng() < 0.8 ? "rgba(255,190,110,.55)" : "rgba(180,220,255,.45)";
    L.E.fillRect(x + 2, y + 2, w - 4, h - 4);
  }
}

function paintFacade(style, seed) {
  const rng = mulberry32(seed);
  const MOD = FAC.MOD;
  const baseCols = [
    "#dccfb6", "#a9553b", "#f0e6d6", "#46515f", "#b9b5ac", "#d9c9a1"
  ];
  const L = new Layers(FAC.W, FAC.H, { a: baseCols[style], r: 0.88, m: 0 });
  for (let r = 0; r < FAC.ROWS; r++) {
    for (let c = 0; c < FAC.COLS; c++) {
      const x0 = c * MOD, y0 = r * MOD;
      if (style === 0) { // ---- Haussmann
        for (let j = 0; j < 6; j++) { L.line(x0, y0 + j * 42, x0 + MOD, y0 + j * 42, 1.4, "rgba(110,95,72,.28)", 108); }
        L.rect(x0, y0 + 236, MOD, 14, "#ebdfc6", 178);
        L.rect(x0, y0 + 250, MOD, 6, "#bba98a", 120);
        L.rect(x0 + 54, y0 + 24, 148, 204, "#efe4cd", 168);
        L.rect(x0 + 70, y0 + 40, 116, 172, null, 70);
        paintGlassPane(L, x0 + 72, y0 + 42, 54, 168, rng);
        paintGlassPane(L, x0 + 130, y0 + 42, 54, 168, rng);
        L.rect(x0 + 125, y0 + 40, 6, 172, "#e8e0cf", 150);
        L.rect(x0 + 70, y0 + 96, 116, 5, "#e8e0cf", 150);
        if (r === 0 || (r === 1 && rng() < 0.4)) {
          L.rect(x0 + 48, y0 + 208, 160, 12, "#cdbfa2", 200);
          for (let b = 0; b < 20; b++) L.rect(x0 + 54 + b * 7.6, y0 + 168, 2.2, 40, "#1d1d22", 215, 0.4, 0.85);
          L.rect(x0 + 52, y0 + 164, 152, 4, "#1d1d22", 225, 0.4, 0.85);
        }
        L.rect(x0 + 80, y0 + 12, 96, 12, "#e2d6bb", 172);
      } else if (style === 1) { // ---- brique
        const bh = 12, bw = 30;
        for (let by = 0; by < MOD; by += bh) {
          for (let bx = -(Math.floor(by / bh) % 2) * bw / 2; bx < MOD; bx += bw) {
            const k = rng(), hh = 8 + Math.floor(k * 8);
            L.rect(x0 + bx + 1, y0 + by + 1, bw - 2, bh - 2, "hsl(" + (8 + k * 12) + "," + (42 + rng() * 14) + "%," + (32 + rng() * 12) + "%)", 150 + hh, 0.93);
          }
        }
        L.rect(x0 + 56, y0 + 46, 144, 168, "#f2eee4", 176);
        L.rect(x0 + 66, y0 + 56, 124, 148, null, 70);
        paintGlassPane(L, x0 + 68, y0 + 58, 58, 144, rng);
        paintGlassPane(L, x0 + 130, y0 + 58, 58, 144, rng);
        L.rect(x0 + 124, y0 + 56, 8, 148, "#f2eee4", 160);
        L.rect(x0 + 48, y0 + 206, 160, 11, "#d8d2c4", 200, 0.8);
        L.rect(x0 + 50, y0 + 34, 156, 12, "#bdb5a5", 190, 0.85);
        L.rect(x0, y0 + 244, MOD, 12, "#7a4331", 185, 0.9);
      } else if (style === 2) { // ---- stuc pastel + volets
        L.rect(x0, y0 + 240, MOD, 16, "rgba(255,255,255,0)", 160);
        L.tint(x0, y0 + 240, MOD, 16, "rgba(255,255,255,.35)");
        L.rect(x0 + 82, y0 + 56, 92, 140, "#fbf6ec", 176);
        L.rect(x0 + 88, y0 + 62, 80, 128, null, 70);
        paintGlassPane(L, x0 + 90, y0 + 64, 76, 124, rng, { curtain: 0.5 });
        L.rect(x0 + 126, y0 + 62, 5, 128, "#fbf6ec", 160);
        const shut = ["#4c7a99", "#6f8f57", "#a35a4a", "#2f5f6b"][Math.floor(rng() * 4)];
        [[50, 30], [174, 30]].forEach((s) => {
          L.rect(x0 + s[0], y0 + 56, 30, 140, shut, 150, 0.7);
          for (let k = 0; k < 14; k++) L.rect(x0 + s[0] + 2, y0 + 60 + k * 10, 26, 3, "rgba(0,0,0,.25)", 120);
        });
        L.rect(x0 + 66, y0 + 196, 124, 18, "#7a5a3c", 190, 0.85);
        for (let f = 0; f < 9; f++) { L.rect(x0 + 72 + f * 13, y0 + 188, 9, 10, rng() < 0.5 ? "#d4455a" : "#e9b22f", 205, 0.8); }
        L.rect(x0 + 70, y0 + 46, 116, 8, "#ece4d2", 185);
      } else if (style === 3) { // ---- bureaux, mur-rideau
        L.rect(x0, y0, MOD, MOD, "#3a4552", 130, 0.5, 0.6);
        for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
          paintGlassPane(L, x0 + 6 + px * 124, y0 + 6 + py * 108, 118, 100, rng, { curtain: 0.22, lit: 0.1, metal: 0.78, recess: 95,
            tone: [["#1f4768", "#6fa1c4"], ["#254b57", "#78a8aa"], ["#2c3f66", "#7f93bd"], ["#1c3a52", "#5e92b4"]][Math.floor(rng() * 4)] });
        }
        L.rect(x0, y0 + 222, MOD, 34, "#4f5b69", 150, 0.4, 0.6);
        L.rect(x0, y0 + 250, MOD, 6, "#9aa6b3", 190, 0.3, 0.9);
      } else if (style === 4) { // ---- habitat collectif
        for (let k = 0; k < 8; k++) L.line(x0, y0 + k * 32, x0 + MOD, y0 + k * 32, 1.2, "rgba(60,58,52,.22)", 112);
        L.rect(x0 + 24, y0 + 44, 208, 96, "#2c3038", 175);
        L.rect(x0 + 30, y0 + 50, 196, 84, null, 70);
        paintGlassPane(L, x0 + 32, y0 + 52, 94, 80, rng);
        paintGlassPane(L, x0 + 130, y0 + 52, 94, 80, rng);
        const pc = ["#d9742c", "#2c8c8c", "#e0b92f", "#e8e4da", "#7a5aa0"][Math.floor(rng() * 5)];
        L.rect(x0 + 24, y0 + 140, 208, 40, pc, 150, 0.6);
        L.rect(x0 + 8, y0 + 190, 240, 22, "#cfcbc2", 205, 0.9);
        for (let b = 0; b < 30; b++) L.rect(x0 + 10 + b * 8, y0 + 160 + 28, 1.8, 28, "#222", 210, 0.5, 0.7);
        L.rect(x0 + 8, y0 + 184, 240, 5, "#222", 215, 0.5, 0.7);
      } else { // ---- art deco
        L.rect(x0, y0, 26, MOD, "#e6d8b5", 170);
        L.rect(x0 + 230, y0, 26, MOD, "#e6d8b5", 170);
        L.rect(x0 + 26, y0 + 190, 204, 66, "#c4b38d", 150);
        for (let k = 0; k < 5; k++) { L.line(x0 + 26, y0 + 200 + k * 11, x0 + 230, y0 + 200 + k * 11, 1.6, "rgba(90,70,40,.45)", 186); }
        [58, 154].forEach((wx) => {
          L.rect(x0 + wx - 6, y0 + 32, 56, 152, "#e6d8b5", 172);
          L.rect(x0 + wx, y0 + 38, 44, 140, null, 70);
          paintGlassPane(L, x0 + wx + 1, y0 + 39, 42, 138, rng);
        });
        L.rect(x0 + 26, y0 + 12, 204, 12, "#e6d8b5", 178);
      }
    }
  }
  L.grain(0.18, rng, 1.6);
  // salissures verticales sous les rebords
  for (let i = 0; i < 40; i++) {
    const x = rng() * FAC.W, y = rng() * FAC.H, h = 30 + rng() * 90;
    const g = L.A.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "rgba(40,34,28,.12)"); g.addColorStop(1, "rgba(40,34,28,0)");
    L.A.fillStyle = g; L.A.fillRect(x, y, 3 + rng() * 8, h);
  }
  return L;
}

/* ------------------------------ VITRINES (RDC) ------------------------------ */
// Atlas de devantures : 10 tuiles 1024x320 (2 colonnes x 5 lignes)
const SHOP = { W: 1024, H: 320, COLS: 2, ROWS: 5 };
const SHOP_DEFS = [
  { name: "BOULANGERIE", sign: "#e0a22e", text: "#3b1d08", awning: "#c0392b", inner: "#ffcf86", kind: "shop" },
  { name: "PHARMACIE", sign: "#139a5a", text: "#f4fff8", awning: null, inner: "#e8fff4", kind: "shop", cross: true },
  { name: "CAFÉ DU COIN", sign: "#23314a", text: "#ffe2a0", awning: "#8a2b2b", inner: "#ffb869", kind: "shop" },
  { name: "MARCHÉ FRAIS", sign: "#3a8f3a", text: "#ffffff", awning: "#e8e8e8", inner: "#f4ffe0", kind: "shop" },
  { name: "TABAC PRESSE", sign: "#7d1a1a", text: "#ffe9c4", awning: null, inner: "#ffc980", kind: "shop", diamond: true },
  { name: "FLEURISTE", sign: "#c25a8a", text: "#fff0f6", awning: "#e8a2c0", inner: "#ffe2ec", kind: "shop" },
  { name: "SSB ENERGY", sign: "#0a1a3a", text: "#ffffff", awning: "#ff2e4d", inner: "#cfe3ff", kind: "shop", ssb: true },
  { name: "COIFFURE", sign: "#4b3a7a", text: "#ffffff", awning: null, inner: "#ffe8d6", kind: "shop" },
  { name: "", sign: null, text: null, awning: null, inner: "#ffe3b0", kind: "home", door: "#2f5f6b" },
  { name: "", sign: null, text: null, awning: null, inner: "#ffd9a0", kind: "home", door: "#8a2b2b" }
];

function paintShop(def, seed) {
  const rng = mulberry32(seed);
  const W = SHOP.W, H = SHOP.H;
  const L = new Layers(W, H, { a: "#d8cdb6", r: 0.85, m: 0 });
  L.grain(0.2, rng, 1.6);
  // soubassement
  L.rect(0, H - 30, W, 30, "#7e776b", 170, 0.8);
  // piliers
  [0, W - 34].forEach((x) => L.rect(x, 0, 34, H, "#c8bda3", 168));
  if (def.kind === "shop") {
    // enseigne
    L.rect(34, 8, W - 68, 78, def.sign, 185, 0.45, 0.2, def.sign.replace("#", "") ? "rgba(255,255,255,0.0)" : null);
    L.rect(34, 8, W - 68, 6, "rgba(255,255,255,.22)", 200);
    L.A.fillStyle = def.text; L.A.textAlign = "center"; L.A.textBaseline = "middle";
    L.A.font = "700 62px Rajdhani, 'Arial Narrow', Arial, sans-serif";
    L.A.fillText(def.name, W / 2, 50);
    L.E.fillStyle = "rgba(255,255,255,.6)"; L.E.textAlign = "center"; L.E.textBaseline = "middle";
    L.E.font = "700 62px Rajdhani, 'Arial Narrow', Arial, sans-serif";
    L.E.fillText(def.name, W / 2, 50);
    L.H.fillStyle = Layers.g(235); L.H.textAlign = "center"; L.H.textBaseline = "middle";
    L.H.font = "700 62px Rajdhani, 'Arial Narrow', Arial, sans-serif";
    L.H.fillText(def.name, W / 2, 50);
    if (def.cross) {
      L.rect(W - 118, 20, 20, 54, "#5ff09a", 220, 0.4, 0, "rgba(120,255,170,.9)"); L.rect(W - 135, 37, 54, 20, "#5ff09a", 220, 0.4, 0, "rgba(120,255,170,.9)");
      L.rect(98, 20, 20, 54, "#5ff09a", 220, 0.4, 0, "rgba(120,255,170,.9)"); L.rect(81, 37, 54, 20, "#5ff09a", 220, 0.4, 0, "rgba(120,255,170,.9)");
    }
    if (def.diamond) {
      L.A.fillStyle = "#d62828"; L.A.beginPath(); L.A.moveTo(W - 76, 14); L.A.lineTo(W - 46, 48); L.A.lineTo(W - 76, 82); L.A.lineTo(W - 106, 48); L.A.fill();
      L.E.fillStyle = "rgba(255,70,70,.8)"; L.E.beginPath(); L.E.moveTo(W - 76, 14); L.E.lineTo(W - 46, 48); L.E.lineTo(W - 76, 82); L.E.lineTo(W - 106, 48); L.E.fill();
    }
    // vitrines (3) + porte
    const panes = [[56, 216], [300, 216], [768, 200]];
    panes.forEach((p, i) => {
      const x = p[0], w = p[1], y = 108, h = H - 108 - 38;
      L.rect(x - 8, y - 8, w + 16, h + 16, "#3a3a3f", 150, 0.4, 0.7);
      L.grad(x, y, w, h, "#6f93b5", "#ffe2b8", 0.05, 0.5);
      L.rect(x, y, w, h, null, 66);
      // interieur : etageres + produits colores
      L.A.fillStyle = "rgba(255,230,180,.55)"; L.A.fillRect(x + 4, y + 4, w - 8, h - 8);
      for (let s = 0; s < 3; s++) {
        L.A.fillStyle = "rgba(90,60,40,.7)"; L.A.fillRect(x + 6, y + 18 + s * 36, w - 12, 5);
        for (let k = 0; k < 7; k++) {
          L.A.fillStyle = ["#d94f4f", "#e9b22f", "#4f9ed9", "#6fbf5a", "#f08ab4", "#fff"][Math.floor(rng() * 6)];
          L.A.fillRect(x + 12 + k * (w / 7.6), y + 4 + s * 36, 11 + rng() * 14, 14 + rng() * 10);
        }
      }
      L.E.fillStyle = def.inner; L.E.globalAlpha = 0.5; L.E.fillRect(x + 4, y + 4, w - 8, h - 8); L.E.globalAlpha = 1;
      // reflet
      L.A.fillStyle = "rgba(255,255,255,.12)";
      L.A.beginPath(); L.A.moveTo(x, y + h); L.A.lineTo(x + w * 0.5, y); L.A.lineTo(x + w * 0.7, y); L.A.lineTo(x + w * 0.2, y + h); L.A.fill();
    });
    // porte
    L.rect(560, 112, 160, H - 112 - 30, "#2c2c33", 170, 0.4, 0.7);
    L.rect(572, 124, 136, H - 124 - 44, null, 70);
    L.grad(572, 124, 136, H - 124 - 44, "#7ba3c8", "#ffe2b8", 0.05, 0.5);
    L.E.fillStyle = "rgba(255,225,170,.4)"; L.E.fillRect(572, 124, 136, H - 124 - 44);
    L.rect(700, 190, 6, 34, "#d8d8dc", 220, 0.2, 1);
    // store/auvent
    if (def.awning) {
      const n = 14, aw = (W - 68) / n;
      for (let i = 0; i < n; i++) L.rect(34 + i * aw, 86, aw, 20, i % 2 ? def.awning : "#f4efe4", 205, 0.8);
      L.rect(34, 104, W - 68, 4, "rgba(0,0,0,.35)", 100);
    }
  } else { // entree d'immeuble
    L.rect(150, 40, 724, 8, "#e6dcc4", 200);
    L.rect(240, 70, 140, H - 70 - 30, "#2a2a30", 178);
    L.rect(430, 52, 164, H - 52 - 30, def.door, 190, 0.45, 0.2);
    L.rect(442, 64, 140, 120, null, 90);
    L.grad(442, 64, 140, 120, "#6f93b5", "#e0cfa6", 0.05, 0.5);
    L.E.fillStyle = "rgba(255,210,150,.35)"; L.E.fillRect(442, 64, 140, 120);
    L.rect(560, 190, 8, 30, "#e9d8a0", 225, 0.25, 1);
    L.rect(640, 70, 140, H - 70 - 30, "#2a2a30", 178);
    [[256, 60], [660, 60]].forEach((p) => {
      L.rect(p[0], 82, 108, 140, "#3b3b42", 175);
      paintGlassPane(L, p[0] + 6, 88, 96, 128, rng, { curtain: 0.5 });
    });
    L.rect(412, 22, 200, 24, "#f2ead6", 200);
    L.A.fillStyle = "#4a3b2a"; L.A.font = "700 18px Rajdhani, Arial"; L.A.textAlign = "center"; L.A.fillText("Nº " + (2 + Math.floor(rng() * 40)), 512, 40);
    L.rect(180, H - 62, 664, 32, "#9d9588", 190);
  }
  return L;
}

/* -------------------------------- ROUTE ------------------------------------- */
// Tuile de 14 m (largeur) x 16 m (longueur) ; 3 voies de 4,5 m
const ROADTEX = { W: 1024, H: 1024, WM: 14, LM: 16 };
function paintRoad() {
  const rng = mulberry32(90210);
  const W = ROADTEX.W, H = ROADTEX.H, ppm = W / ROADTEX.WM, ppmv = H / ROADTEX.LM;
  const L = new Layers(W, H, { a: "#3b3e44", r: 0.88, m: 0 });
  // usure : voies sombres/lisses (traces de pneus) autour du centre de chaque voie
  [-4.5, 0, 4.5].forEach((lx) => {
    [-0.85, 0.85].forEach((off) => {
      const cx = (lx + off + 7) * ppm;
      const g = L.A.createLinearGradient(cx - 0.55 * ppm, 0, cx + 0.55 * ppm, 0);
      g.addColorStop(0, "rgba(10,10,12,0)"); g.addColorStop(0.5, "rgba(10,10,12,.36)"); g.addColorStop(1, "rgba(10,10,12,0)");
      L.A.fillStyle = g; L.A.fillRect(cx - 0.55 * ppm, 0, 1.1 * ppm, H);
      L.O.fillStyle = "rgba(255,150,0,.35)"; // plus lisse
      const go = L.O.createLinearGradient(cx - 0.5 * ppm, 0, cx + 0.5 * ppm, 0);
      go.addColorStop(0, "rgba(255,150,0,0)"); go.addColorStop(0.5, "rgba(255,150,0,.55)"); go.addColorStop(1, "rgba(255,150,0,0)");
      L.O.fillStyle = go; L.O.fillRect(cx - 0.5 * ppm, 0, 1.0 * ppm, H);
    });
  });
  // plaques de reprise
  for (let i = 0; i < 5; i++) {
    const x = rng() * W * 0.8, y = rng() * H, w = 90 + rng() * 280, h = 60 + rng() * 200, v = 38 + rng() * 14;
    L.rect(x, y, w, h, "rgb(" + v + "," + (v + 1) + "," + (v + 4) + ")", 122, 0.82);
    L.A.strokeStyle = "rgba(8,8,10,.5)"; L.A.lineWidth = 3; L.A.strokeRect(x, y, w, h);
    L.H.strokeStyle = Layers.g(96); L.H.lineWidth = 3; L.H.strokeRect(x, y, w, h);
  }
  // taches d'huile
  for (let i = 0; i < 14; i++) {
    const lane = [-4.5, 0, 4.5][Math.floor(rng() * 3)], x = (lane + (rng() - 0.5) * 1.4 + 7) * ppm, y = rng() * H, r = 18 + rng() * 40;
    const g = L.A.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, "rgba(6,6,8,.5)"); g.addColorStop(1, "rgba(6,6,8,0)");
    L.A.fillStyle = g; L.A.beginPath(); L.A.arc(x, y, r, 0, 6.3); L.A.fill();
    const go = L.O.createRadialGradient(x, y, 2, x, y, r);
    go.addColorStop(0, "rgba(255,90,0,.7)"); go.addColorStop(1, "rgba(255,90,0,0)");
    L.O.fillStyle = go; L.O.beginPath(); L.O.arc(x, y, r, 0, 6.3); L.O.fill();
  }
  L.grain(0.55, rng, 2);
  for (let i = 0; i < 9000; i++) { // gravillons
    const x = rng() * W, y = rng() * H, v = 60 + rng() * 80;
    L.A.fillStyle = "rgba(" + v + "," + (v + 2) + "," + (v + 6) + "," + (0.2 + rng() * 0.4) + ")"; L.A.fillRect(x, y, 1 + rng() * 2.2, 1 + rng() * 2.2);
    L.H.fillStyle = "rgba(255,255,255," + (0.15 + rng() * 0.3) + ")"; L.H.fillRect(x, y, 1.6, 1.6);
  }
  // fissures (le joint de goudron noir)
  for (let i = 0; i < 9; i++) {
    let x = rng() * W, y = rng() * H;
    L.A.strokeStyle = "rgba(6,6,8,.8)"; L.A.lineWidth = 1.6 + rng() * 2; L.A.beginPath(); L.A.moveTo(x, y);
    L.H.strokeStyle = Layers.g(40); L.H.lineWidth = 2.4 + rng() * 2; L.H.beginPath(); L.H.moveTo(x, y);
    for (let j = 0; j < 8; j++) { x += (rng() - 0.5) * 70; y += 20 + rng() * 50; L.A.lineTo(x, y); L.H.lineTo(x, y); }
    L.A.stroke(); L.H.stroke();
  }
  // marquage : lignes de rive pleines, separateurs de voie en tirets (3 m / 5 m)
  const paint = (x, y, w, h) => {
    L.A.fillStyle = "#e9e6dc"; L.A.fillRect(x, y, w, h);
    L.H.fillStyle = Layers.g(150); L.H.fillRect(x, y, w, h);
    L.O.fillStyle = Layers.orm(0.62, 0); L.O.fillRect(x, y, w, h);
    // usure de la peinture
    for (let k = 0; k < (w * h) / 55; k++) {
      L.A.fillStyle = "rgba(45,47,52," + (0.25 + rng() * 0.6) + ")"; L.A.fillRect(x + rng() * w, y + rng() * h, 1 + rng() * 2.5, 1 + rng() * 3);
    }
  };
  [-6.5, 6.5].forEach((lx) => paint((lx + 7) * ppm - 5, 0, 10, H));
  [-2.25, 2.25].forEach((lx) => { for (let z = 0; z < LM_DASHES; z++) paint((lx + 7) * ppm - 4.5, z * ppmv * 8 + 6, 9, 3 * ppmv); });
  return L;
}
const LM_DASHES = 2;

function paintPaving() {
  const rng = mulberry32(777);
  const S = 512, n = 4, s = S / n;
  const L = new Layers(S, S, { a: "#85827b", r: 0.86, m: 0 });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 128 + rng() * 30 - 14;
    L.rect(x * s + 3, y * s + 3, s - 6, s - 6, "rgb(" + v + "," + (v - 2) + "," + (v - 8) + ")", 150 + rng() * 14, 0.84 + rng() * 0.1);
    L.A.strokeStyle = "rgba(255,255,255,.14)"; L.A.lineWidth = 2; L.A.strokeRect(x * s + 3.5, y * s + 3.5, s - 7, s - 7);
  }
  L.grain(0.6, rng, 2);
  for (let i = 0; i < 6; i++) { // taches de chewing-gum / humidite
    const x = rng() * S, y = rng() * S, r = 4 + rng() * 14;
    L.A.fillStyle = "rgba(70,66,60," + (0.1 + rng() * 0.2) + ")"; L.A.beginPath(); L.A.arc(x, y, r, 0, 6.3); L.A.fill();
  }
  return L;
}

function paintGrass() {
  const rng = mulberry32(31337);
  const S = 512;
  const L = new Layers(S, S, { a: "#4d7f33", r: 0.95, m: 0 });
  for (let i = 0; i < 9000; i++) {
    const x = rng() * S, y = rng() * S, g = 70 + rng() * 90, l = 3 + rng() * 6;
    L.A.strokeStyle = "rgba(" + (g * 0.55) + "," + g + "," + (g * 0.35) + "," + (0.35 + rng() * 0.4) + ")";
    L.A.lineWidth = 1.2; L.A.beginPath(); L.A.moveTo(x, y); L.A.lineTo(x + (rng() - 0.5) * 3, y - l); L.A.stroke();
    L.H.strokeStyle = "rgba(255,255,255," + (0.2 + rng() * 0.3) + ")"; L.H.lineWidth = 1.2; L.H.beginPath(); L.H.moveTo(x, y); L.H.lineTo(x, y - l); L.H.stroke();
  }
  for (let i = 0; i < 700; i++) { // fleurs / pâquerettes
    const x = rng() * S, y = rng() * S;
    L.A.fillStyle = rng() < 0.6 ? "rgba(255,255,255,.85)" : "rgba(255,214,70,.85)"; L.A.fillRect(x, y, 2, 2);
  }
  for (let i = 0; i < 30; i++) { // zones de terre
    const x = rng() * S, y = rng() * S, r = 10 + rng() * 26;
    const g = L.A.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, "rgba(120,92,56,.28)"); g.addColorStop(1, "rgba(120,92,56,0)");
    L.A.fillStyle = g; L.A.beginPath(); L.A.arc(x, y, r, 0, 6.3); L.A.fill();
  }
  return L;
}

function paintRoof() {
  const rng = mulberry32(4242);
  const S = 256;
  const L = new Layers(S, S, { a: "#5a5c60", r: 0.92, m: 0 });
  for (let i = 0; i < 16; i++) { const x = rng() * S, y = rng() * S, w = 30 + rng() * 80, v = 70 + rng() * 40; L.rect(x, y, w, 30 + rng() * 60, "rgba(" + v + "," + v + "," + (v + 4) + ",.5)", 128 + rng() * 14); }
  for (let x = 0; x < S; x += 64) L.line(x, 0, x, S, 2, "rgba(20,20,24,.5)", 100);
  L.grain(0.9, rng, 2);
  return L;
}

/* --------------------------- ATLAS DE DECALS ROUTIERS --------------------------- */
// 1024x1024 : zebra | fleche | plaque d'egout | grille | texte ECOLE | tache de pneu | feuilles
const DECAL = {
  zebra: [0, 0, 512, 256], arrow: [512, 0, 256, 256], manhole: [768, 0, 256, 256],
  grate: [0, 256, 256, 256], ecole: [256, 256, 512, 256], skid: [768, 256, 256, 256],
  leaves: [0, 512, 512, 256], bus: [512, 512, 512, 256]
};
function paintDecals() {
  const rng = mulberry32(555);
  const c = cv(1024, 1024), x = c.getContext("2d");
  x.clearRect(0, 0, 1024, 1024);
  // zebra : 8 bandes
  for (let i = 0; i < 8; i++) { x.fillStyle = "rgba(236,233,222,.94)"; x.fillRect(12 + i * 62, 18, 36, 220); }
  for (let i = 0; i < 2600; i++) { x.fillStyle = "rgba(0,0,0," + rng() * 0.5 + ")"; x.globalCompositeOperation = "destination-out"; x.fillRect(rng() * 512, rng() * 256, 1 + rng() * 3, 1 + rng() * 3); x.globalCompositeOperation = "source-over"; }
  // fleche droite
  x.fillStyle = "rgba(236,233,222,.92)"; x.beginPath(); x.moveTo(640, 20); x.lineTo(700, 100); x.lineTo(666, 100); x.lineTo(666, 236); x.lineTo(614, 236); x.lineTo(614, 100); x.lineTo(580, 100); x.fill();
  // plaque d'egout
  x.fillStyle = "#1e1f22"; x.beginPath(); x.arc(896, 128, 100, 0, 6.3); x.fill();
  x.strokeStyle = "#3b3d42"; x.lineWidth = 6; x.beginPath(); x.arc(896, 128, 92, 0, 6.3); x.stroke();
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { if (i * i + j * j < 11) { x.fillStyle = "#34363b"; x.fillRect(896 + i * 22 - 7, 128 + j * 22 - 7, 14, 14); } }
  // grille d'avaloir
  x.fillStyle = "#18191c"; x.fillRect(20, 276, 216, 160);
  x.fillStyle = "#34363b"; for (let i = 0; i < 9; i++) x.fillRect(30 + i * 23, 286, 8, 140);
  x.strokeStyle = "#4a4d54"; x.lineWidth = 5; x.strokeRect(20, 276, 216, 160);
  // ECOLE
  x.fillStyle = "rgba(240,236,222,.92)"; x.font = "900 150px 'Arial Black', Impact, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.save(); x.translate(512, 384); x.scale(1, 1.6); x.fillText("ÉCOLE", 0, 0); x.restore();
  // trace de pneu (freinage)
  x.strokeStyle = "rgba(0,0,0,.55)"; x.lineWidth = 14; x.lineCap = "round";
  [[800, 266], [856, 266]].forEach((p) => { x.beginPath(); x.moveTo(p[0], p[1]); x.bezierCurveTo(p[0] + 8, 340, p[0] - 8, 400, p[0] + 10, 500); x.stroke(); });
  // feuilles mortes
  for (let i = 0; i < 90; i++) {
    x.fillStyle = ["rgba(176,96,30,.85)", "rgba(200,140,40,.85)", "rgba(120,80,30,.85)", "rgba(150,60,30,.85)"][Math.floor(rng() * 4)];
    x.save(); x.translate(rng() * 500 + 6, 520 + rng() * 240); x.rotate(rng() * 6.3); x.beginPath(); x.ellipse(0, 0, 5 + rng() * 6, 3 + rng() * 3, 0, 0, 6.3); x.fill(); x.restore();
  }
  // voie de bus
  x.fillStyle = "rgba(220,60,50,.55)"; x.fillRect(522, 522, 492, 236);
  x.fillStyle = "rgba(240,236,222,.92)"; x.font = "900 120px 'Arial Black', Impact, sans-serif";
  x.save(); x.translate(768, 640); x.scale(1, 1.5); x.fillText("BUS", 0, 0); x.restore();
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* ------------------------------ CONSTRUCTION ------------------------------ */
// Renvoie la liste des etapes (label, fonction) : le demarrage les execute une a une
// pour afficher une barre de progression sans jamais figer la page.
function cityTextureSteps() {
  const T = GFX.tex;
  T.facade = [];
  GFX.mat.facade = [];
  const steps = [];
  for (let i = 0; i < 6; i++) {
    steps.push(["Façades " + (i + 1) + "/6", () => {
      const set = paintFacade(i, 1000 + i * 77).toTextures(i === 3 ? 2.5 : 3.6, { emissive: true });
      T.facade.push(set);
      GFX.mat.facade.push(pbrMaterial(set, { emissiveIntensity: 1.15 }));
    }]);
  }
  steps.push(["Devantures", () => {
    const atlasA = cv(SHOP.W * SHOP.COLS, SHOP.H * SHOP.ROWS), atlasH = cv(atlasA.width, atlasA.height), atlasO = cv(atlasA.width, atlasA.height), atlasE = cv(atlasA.width, atlasA.height);
    SHOP_DEFS.forEach((d, i) => {
      const L = paintShop(d, 300 + i * 13), cx = (i % SHOP.COLS) * SHOP.W, cy = Math.floor(i / SHOP.COLS) * SHOP.H;
      atlasA.getContext("2d").drawImage(L.cA, cx, cy); atlasH.getContext("2d").drawImage(L.cH, cx, cy);
      atlasO.getContext("2d").drawImage(L.cO, cx, cy); atlasE.getContext("2d").drawImage(L.cE, cx, cy);
    });
    const mkAtlas = (cnv, srgb) => { const t = new THREE.CanvasTexture(cnv); t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding; t.anisotropy = 8; return t; };
    T.shop = { map: mkAtlas(atlasA, true), normalMap: mkAtlas(heightToNormal(atlasH, 3.0), false), orm: mkAtlas(atlasO, false), emissiveMap: mkAtlas(atlasE, true) };
    GFX.mat.shop = pbrMaterial(T.shop, { emissiveIntensity: 1.3 });
  }]);
  steps.push(["Chaussée", () => {
    T.road = paintRoad().toTextures(2.6);
    GFX.mat.road = pbrMaterial(T.road, { mat: { vertexColors: false, envMapIntensity: 1.05 } });
  }]);
  steps.push(["Trottoirs et pelouses", () => {
    T.paving = paintPaving().toTextures(3.2);
    GFX.mat.paving = pbrMaterial(T.paving, { mat: { vertexColors: false } });
    T.grass = paintGrass().toTextures(2.0);
    GFX.mat.grass = pbrMaterial(T.grass, { mat: { vertexColors: false } });
    T.roof = paintRoof().toTextures(2.6);
    GFX.mat.roof = pbrMaterial(T.roof, { mat: { vertexColors: true } });
  }]);
  steps.push(["Marquages", () => {
    T.decals = paintDecals();
    GFX.mat.decal = new THREE.MeshStandardMaterial({
      map: T.decals, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, vertexColors: false, envMapIntensity: 0.4
    });
  }]);
  return steps;
}
