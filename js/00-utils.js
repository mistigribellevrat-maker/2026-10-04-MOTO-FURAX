"use strict";
/* ----------------------------- 0. UTILITAIRES ---------------------------- */
const DBG = { god: false, cam: null, studioObj: null, noObstacles: false }; // outils de test uniquement (voir MF.debug)
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const rnd = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const fmtTime = (s) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m + ":" + String(r).padStart(2, "0");
};
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function textSprite(text, opts) {
  opts = opts || {};
  const c = document.createElement("canvas");
  c.width = opts.w || 256; c.height = opts.h || 128;
  const x = c.getContext("2d");
  x.fillStyle = opts.bg || "rgba(0,0,0,0)";
  if (opts.bg) x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = opts.fg || "#fff";
  x.font = opts.font || "bold 64px 'Arial Black', sans-serif";
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, c.width / 2, c.height / 2 + (opts.dy || 0));
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}
function canvasTex(w, h, draw, repX, repY, linear) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repX) t.repeat.set(repX, repY || repX);
  t.encoding = linear ? THREE.LinearEncoding : THREE.sRGBEncoding;
  t.anisotropy = 8;
  return t;
}

/* ------------------------------- 1. CONFIG ------------------------------- */
const CFG = {
  HOME_IMAGE: "motor_furax.jpg",
  ROAD_W: 14,
  SIDEWALK_W: 4.6,
  SIDEWALK_H: 0.34,
  WALL_X: 11.9,
  CHUNK_LEN: 80,
  ACTIVE_CHUNKS: 6,
  TOTAL_DIST: 2000,
  TIME_LIMIT: 66,
  MAX_SPEED: 42,
  NITRO_SPEED: 62,
  ACCEL: 16.5,
  NITRO_ACCEL: 26,
  BRAKE: 46,
  DRAG: 7.5,
  NITRO_DRAIN: 30,
  NITRO_REGEN: 7.5,
  JUMP_V: 12.2,
  GRAVITY: 31,
  DAD_START: 34,
  DAD_MIN: 12,
  DAD_MAX: 30,
  STEP: 1 / 60
};

const BIKES = [
  { id: "cross", name: "CROSS 125", desc: "Légère, agile, increvable. La bécane parfaite pour les trottoirs.", maxSpeed: 42, accel: 16.5, nitroSpeed: 61, health: 105, color: 0xff4d00, accent: 0xffffff, stats: [3, 3, 2] },
  { id: "ssb", name: "SUPERBIKE SSB", desc: "Vitesse de pointe redoutable. Le freinage, on verra plus tard.", maxSpeed: 48, accel: 17.5, nitroSpeed: 68, health: 82, color: 0x0fb4ff, accent: 0xffdd55, stats: [5, 2, 2] },
  { id: "v8", name: "FURAX V8", desc: "Nitro double corps et suspensions de brute. Ça envoie fort.", maxSpeed: 43, accel: 16, nitroSpeed: 74, health: 122, color: 0xffbe0b, accent: 0x222222, stats: [3, 4, 5] }
];

/* ----------------------------- 2. SAUVEGARDE ----------------------------- */
const SAVE_KEY = "motorFuraxSaveV1";
let save = { best: null, bestHealth: 0, bike: 0, muted: false, runs: 0, quality: "auto" };
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = Object.assign(save, JSON.parse(raw));
} catch (e) { /* stockage indisponible : partie quand meme */ }
function persistSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}
