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

// Toutes les motos ont EXACTEMENT les memes performances : seul le style change (equite entre les enfants).
// Les deux dernieres se debloquent avec les etoiles gagnees par le pilote.
const BIKE_PERF = { maxSpeed: 42, accel: 16.5, nitroSpeed: 61, health: 110 };
const BIKES = [
  { id: "cross", name: "CROSS 125", desc: "Orange pétard, la bécane des trottoirs.", color: 0xff4d00, accent: 0xffffff, stars: 0 },
  { id: "ssb", name: "SUPERBIKE SSB", desc: "Bleu électrique et liseré or.", color: 0x0fb4ff, accent: 0xffdd55, stars: 0 },
  { id: "v8", name: "FURAX V8", desc: "Jaune taxi, look de brute.", color: 0xffbe0b, accent: 0x222222, stars: 0 },
  { id: "proto", name: "PROTO 500", desc: "Vert fluo de prototype.", color: 0x39ff6a, accent: 0x111111, stars: 3 },
  { id: "rocket", name: "FUSÉE DE POCHE", desc: "Rose bonbon et chrome.", color: 0xff3fb4, accent: 0xf2f2f2, stars: 6 }
].map((b) => Object.assign({}, BIKE_PERF, b));

/* ------------------------------- PILOTES -------------------------------- */
// EQUITE : tous les pilotes ont la meme vitesse, la meme solidite de base et le meme chrono possible.
// Chacun gagne du temps a SA facon (sauts, chocs, frolements, agilite, nitro). Que des qualites.
// mods : jump (hauteur), landNitro (nitro a la reception), hitSlow (part du ralentissement subi aux chocs),
//   dmg (degats subis), nearNitro (nitro par frolement), nitroDrain, steer, hitbox, nitroRegen, coffee (s), friend
const PILOTS = [
  {
    id: "oscar", name: "OSCAR", nick: "Le roi des airs", jacket: 0xff7a1a, jacket2: 0x23252c, helmet: 0xffffff, accent: "#ff7a1a",
    stats: [5, 3, 3, 3, 3],
    mods: { jump: 1.2, landNitro: 18 },
    passive: "Saute plus haut que tout le monde, et chaque réception après un vrai saut recharge sa nitro.",
    power: { id: "superjump", name: "SUPER SAUT", desc: "Bond géant, même en plein vol : passe par-dessus tout ce qui est bas.", cd: 6 }
  },
  {
    id: "arthur", name: "ARTHUR", nick: "Le costaud", jacket: 0x3c8f4a, jacket2: 0xe8e4da, helmet: 0x2b2d33, accent: "#3ddc84",
    stats: [3, 5, 3, 3, 3],
    mods: { hitSlow: 0.5, dmg: 0.7, hitNitro: 15 },
    passive: "Rien ne l'arrête : il ralentit deux fois moins aux chocs, sa moto s'abîme moins, et chaque choc lui donne de la nitro.",
    power: { id: "ram", name: "BÉLIER", desc: "4 s : il renverse tout ce qui est bas sur son passage, sans dégâts.", cd: 12 }
  },
  {
    id: "tom", name: "TOM", nick: "La fusée", jacket: 0xd62839, jacket2: 0x15171c, helmet: 0xffd23f, accent: "#ff2e4d",
    stats: [3, 3, 5, 3, 3],
    mods: { nearNitro: 8 },
    passive: "Maître de la nitro : chaque frôlement d'obstacle remplit sa jauge en un éclair.",
    power: { id: "hyper", name: "HYPER NITRO", desc: "Nitro pleine et illimitée pendant 2 secondes.", cd: 20 }
  },
  {
    id: "yanis", name: "YANIS", nick: "L'anguille", jacket: 0x1f9fd8, jacket2: 0xf2f2f2, helmet: 0x1a1a1a, accent: "#22e0ff",
    stats: [3, 3, 3, 5, 3],
    mods: { steer: 1.35, hitbox: 0.62, dashNitro: 30, nearNitro: 7 },
    passive: "Ultra agile : il tourne plus vite que les autres, se faufile dans les plus petits trous et chaque frôlement lui donne de la nitro.",
    power: { id: "dash", name: "ESQUIVE", desc: "Écart éclair sur le côté, intouchable une demi-seconde, avec un coup de turbo.", cd: 4 }
  },
  {
    id: "clothilde", name: "CLOTHILDE", nick: "La maligne", jacket: 0x8a4fd0, jacket2: 0xffd6ea, helmet: 0xff5c93, accent: "#c77dff",
    stats: [3, 3, 3, 3, 5], ponytail: 0x6a3a1c,
    mods: { nitroRegen: 2.7, coffee: 10, coffeeNitro: 40, friend: true },
    passive: "Toujours un coup d'avance : nitro qui se recharge très vite, cafés à +10 s et +40 nitro, et la copine lui donne un boost.",
    power: { id: "call", name: "APPEL À PAPA", desc: "Elle appelle papa : il décroche et s'arrête 4 secondes.", cd: 15 }
  }
];
const PILOT_STATS = ["saut", "solidité", "nitro", "agilité", "malice"];
const PMOD_DEFAULT = { coffeeNitro: 0, hitNitro: 0, dashNitro: 0, jump: 1, landNitro: 0, hitSlow: 1, dmg: 1, nearNitro: 5, nitroDrain: 1, steer: 1, hitbox: 1, nitroRegen: 1, coffee: 6, friend: false, speed: 1, accel: 1, health: 1 };

/* --------------------------------- AIDE ---------------------------------- */
// Choisie par pilote (donc par enfant). Les records sont classes par niveau d'aide : la comparaison reste honnete.
const AIDS = [
  { id: 0, name: "AUCUNE", short: "", dadPace: 0, dmg: 1, steerAssist: 0, time: 0 },
  { id: 1, name: "UN PEU", short: "aide +", dadPace: 0.03, dmg: 0.75, steerAssist: 0.5, time: 5 },
  { id: 2, name: "BEAUCOUP", short: "aide ++", dadPace: 0.06, dmg: 0.5, steerAssist: 1, time: 10 }
];

/* -------------------------------- NIVEAUX -------------------------------- */
// Chaque niveau fixe son chrono, sa densite d'obstacles, la frequence des surprises, sa meteo et ses defis.
// (la distance reste 2000 m pour tous : la route et le college sont construits une seule fois)
const LEVELS = [
  {
    id: "college", name: "NIVEAU 1 · COLLÈGE MOLIÈRE", short: "COLLÈGE", time: 60, density: 1, events: 1, weather: "sun",
    challenges: [
      { id: "win", text: "Arriver avant la sonnerie" },
      { id: "clean", text: "Arriver avec moins de 3 chocs" },
      { id: "combo", text: "Faire un combo x5" }
    ]
  },
  {
    id: "rain", name: "NIVEAU 2 · JOUR DE PLUIE", short: "PLUIE", time: 64, density: 1.1, events: 1.15, weather: "rain",
    challenges: [
      { id: "win", text: "Arriver avant la sonnerie" },
      { id: "dry", text: "Toucher moins de 3 flaques" },
      { id: "fast", text: "Arriver en moins de 52 s" }
    ]
  },
  { id: "soon-3", name: "NIVEAU 3 · BIENTÔT", short: "BIENTÔT", locked: true }
];
const DAILY = {
  id: "daily", name: "DÉFI DU JOUR", short: "DÉFI DU JOUR", time: 60, density: 1.05, events: 1, weather: "sun",
  challenges: [{ id: "win", text: "Arriver avant la sonnerie" }, { id: "clean", text: "Arriver avec moins de 3 chocs" }, { id: "combo", text: "Faire un combo x5" }]
};
const todayKey = () => { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); };

/* ----------------------------- 2. SAUVEGARDE ----------------------------- */
const SAVE_KEY = "motorFuraxSaveV1";
let save = {
  best: null, bestHealth: 0, bike: 0, pilot: 0, level: 0, bestScore: 0, muted: false, runs: 0, quality: "auto", engine: "doux",
  mode: "level",          // "level" ou "daily"
  aid: {},                // niveau d'aide par pilote
  bikes: {},              // moto choisie par pilote
  rec: {},                // records : rec[mode][pilote][aide] = { time, score }
  stars: {},              // etoiles : stars[pilote][niveau] = [bool, bool, bool]
  wins: {},               // victoires par niveau (deblocage)
  ghosts: {},             // fantome du record : ghosts[mode|pilote|aide] = { t, d:[x,y,z,...] }
  clip: false             // enregistrement video des courses
};
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = Object.assign(save, JSON.parse(raw));
} catch (e) { /* stockage indisponible : partie quand meme */ }
if (!(save.pilot >= 0 && save.pilot < PILOTS.length)) save.pilot = 0;
if (!LEVELS[save.level] || LEVELS[save.level].locked) save.level = 0;
if (!BIKES[save.bike]) save.bike = 0;
const curPilot = () => PILOTS[save.pilot] || PILOTS[0];
// caracteristique du pilote courant (valeur neutre si le pilote ne la modifie pas)
const pmod = (k) => { const v = curPilot().mods[k]; return v == null ? PMOD_DEFAULT[k] : v; };
const curAid = () => AIDS[save.aid[curPilot().id] || 0] || AIDS[0];
const curLevel = () => save.mode === "daily" ? DAILY : (LEVELS[save.level] || LEVELS[0]);
const modeKey = () => save.mode === "daily" ? "daily-" + todayKey() : LEVELS[save.level].id;
// niveau 2 debloque des la premiere victoire au niveau 1 (par n'importe quel pilote)
const levelUnlocked = (i) => !!LEVELS[i] && !LEVELS[i].locked && (i === 0 || (save.wins[LEVELS[i - 1].id] || 0) > 0);
const pilotStars = (pid) => { const s = save.stars[pid] || {}; return Object.keys(s).reduce((a, k) => a + s[k].filter(Boolean).length, 0); };
function persistSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}
