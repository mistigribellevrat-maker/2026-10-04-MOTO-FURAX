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
  HOME_IMAGE: "assets/affiche.jpg",          // affiche du jeu (ecran d'accueil) — format libre, 3:4 conseille
  PILOT_PHOTO_DIR: "assets/pilotes/",        // visages des pilotes : oscar.jpg, arthur.jpg, tom.jpg, yanis.jpg, clothilde.jpg
  ROAD_W: 14,
  SIDEWALK_W: 4.6,
  SIDEWALK_H: 0.34,
  WALL_X: 11.9,
  CHUNK_LEN: 80,
  ACTIVE_CHUNKS: 6,
  TOTAL_DIST: 2000,
  TIME_LIMIT: 60,
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
  DAD_PACE: 1.02,       // rythme de papa en multiple de TA vitesse de pointe (sans nitro) au depart...
  DAD_PACE_END: 1.06,   // ...et a l'arrivee : a fond sans nitro, il grignote toujours du terrain
  DAD_MAX_DIST: 55,
  EVENT_FIRST: 7,       // premier evenement surprise (s)
  EVENT_GAP: [9, 14],   // intervalle entre deux evenements (s)
  STEP: 1 / 60
};

const BIKES = [
  { id: "cross", name: "CROSS 125", desc: "Légère, agile, increvable. La bécane parfaite pour les trottoirs.", maxSpeed: 42, accel: 16.5, nitroSpeed: 61, health: 105, color: 0xff4d00, accent: 0xffffff, stats: [3, 3, 2] },
  { id: "ssb", name: "SUPERBIKE SSB", desc: "Vitesse de pointe redoutable. Le freinage, on verra plus tard.", maxSpeed: 48, accel: 17.5, nitroSpeed: 68, health: 82, color: 0x0fb4ff, accent: 0xffdd55, stats: [5, 2, 2] },
  { id: "v8", name: "FURAX V8", desc: "Nitro double corps et suspensions de brute. Ça envoie fort.", maxSpeed: 43, accel: 16, nitroSpeed: 74, health: 122, color: 0xffbe0b, accent: 0x222222, stats: [3, 4, 5] }
];

/* ------------------------------- PILOTES -------------------------------- */
// mods : multiplicateurs appliques a la moto choisie.
//   speed/accel/steer/health/jump : caracteristiques ; hitSlow : part du ralentissement subi aux chocs (1 = normal)
//   hitbox : largeur de collision ; nitroRegen : recharge ; nearNitro : nitro gagnee par frolement ; coffee : secondes par cafe
const PILOTS = [
  {
    id: "oscar", name: "OSCAR", nick: "Le casse-cou", jacket: 0xff7a1a, jacket2: 0x23252c, helmet: 0xffffff, accent: "#ff7a1a",
    stats: [3, 3, 2, 5],
    mods: { speed: 1, accel: 1, steer: 1, health: 0.9, jump: 1.2, hitSlow: 1, hitbox: 1, nitroRegen: 1, nearNitro: 5, coffee: 6 },
    passive: "Saute plus haut. Chaque réception après un vrai saut recharge sa nitro et rapporte des points.",
    power: { id: "superjump", name: "SUPER SAUT", desc: "Bond géant, même en plein vol : passe par-dessus tout ce qui est bas.", cd: 6 }
  },
  {
    id: "arthur", name: "ARTHUR", nick: "Le bulldozer", jacket: 0x3c8f4a, jacket2: 0xe8e4da, helmet: 0x2b2d33, accent: "#3ddc84",
    stats: [2, 2, 5, 2],
    mods: { speed: 0.97, accel: 0.9, steer: 0.92, health: 1.45, jump: 0.9, hitSlow: 0.45, hitbox: 1.05, nitroRegen: 1, nearNitro: 5, coffee: 6 },
    passive: "Moto blindée : encaisse bien plus de chocs et ralentit beaucoup moins quand il percute. Démarre lentement.",
    power: { id: "ram", name: "BÉLIER", desc: "4 s : il renverse tout ce qui est bas sur son passage, sans dégâts.", cd: 12 }
  },
  {
    id: "tom", name: "TOM", nick: "La fusée", jacket: 0xd62839, jacket2: 0x15171c, helmet: 0xffd23f, accent: "#ff2e4d",
    stats: [5, 2, 2, 3],
    mods: { speed: 1.07, accel: 1.1, steer: 0.84, health: 0.85, jump: 1, hitSlow: 1, hitbox: 1, nitroRegen: 1, nearNitro: 14, coffee: 6 },
    passive: "Le plus rapide de la bande. Frôler un obstacle remplit sa nitro. Mais il tient mal la route.",
    power: { id: "hyper", name: "HYPER NITRO", desc: "Nitro pleine et illimitée pendant 3 secondes.", cd: 14 }
  },
  {
    id: "yanis", name: "YANIS", nick: "L'anguille", jacket: 0x1f9fd8, jacket2: 0xf2f2f2, helmet: 0x1a1a1a, accent: "#22e0ff",
    stats: [3, 5, 2, 3],
    mods: { speed: 1, accel: 1.04, steer: 1.32, health: 0.85, jump: 1, hitSlow: 1, hitbox: 0.72, nitroRegen: 1, nearNitro: 5, coffee: 6 },
    passive: "Ultra maniable et plus fin que les autres : il se faufile là où personne ne passe.",
    power: { id: "dash", name: "ESQUIVE", desc: "Écart éclair sur le côté, intouchable pendant une demi-seconde.", cd: 4 }
  },
  {
    id: "clothilde", name: "CLOTHILDE", nick: "La stratège", jacket: 0x8a4fd0, jacket2: 0xffd6ea, helmet: 0xff5c93, accent: "#c77dff",
    stats: [3, 3, 3, 3], ponytail: 0x6a3a1c,
    mods: { speed: 1, accel: 1, steer: 1.05, health: 1, jump: 1, hitSlow: 1, hitbox: 1, nitroRegen: 1.4, nearNitro: 5, coffee: 10, friend: true },
    passive: "Cafés à +10 s, nitro qui se recharge vite, et la copine lui file un boost au lieu de la retenir.",
    power: { id: "call", name: "APPEL À PAPA", desc: "Elle appelle papa : il décroche et s'arrête 4 secondes.", cd: 15 }
  }
];
const PILOT_STATS = ["vitesse", "agilité", "solidité", "saut"];

/* -------------------------------- NIVEAUX -------------------------------- */
// Structure prete pour les prochains niveaux : chaque niveau fixe sa distance, son chrono, sa densite d'obstacles
// et la frequence des evenements surprises. Un seul niveau jouable pour l'instant.
const LEVELS = [
  { id: "college", name: "NIVEAU 1 · COLLÈGE MOLIÈRE", dist: 2000, time: 60, density: 1, events: 1, unlocked: true },
  { id: "soon-2", name: "NIVEAU 2 · BIENTÔT", unlocked: false },
  { id: "soon-3", name: "NIVEAU 3 · BIENTÔT", unlocked: false }
];

/* ----------------------------- 2. SAUVEGARDE ----------------------------- */
const SAVE_KEY = "motorFuraxSaveV1";
let save = { best: null, bestHealth: 0, bike: 0, pilot: 0, level: 0, bestScore: 0, muted: false, runs: 0, quality: "auto", engine: "doux" };
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = Object.assign(save, JSON.parse(raw));
} catch (e) { /* stockage indisponible : partie quand meme */ }
if (!(save.pilot >= 0 && save.pilot < PILOTS.length)) save.pilot = 0;
if (!(LEVELS[save.level] && LEVELS[save.level].unlocked)) save.level = 0;
CFG.TOTAL_DIST = LEVELS[save.level].dist;
CFG.TIME_LIMIT = LEVELS[save.level].time;
const curPilot = () => PILOTS[save.pilot] || PILOTS[0];
const pmod = (k) => { const v = curPilot().mods[k]; return v == null ? 1 : v; };   // caracteristique du pilote courant
function persistSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}
