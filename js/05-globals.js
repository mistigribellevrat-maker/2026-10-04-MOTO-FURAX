"use strict";
/* ============================================================================
   ETAT GLOBAL PARTAGE — scene, groupes, entites, ambiance, textures libres
   ============================================================================ */
let scene, camera, renderer, dirLight, sunTarget;
const three = { visible: true };
const worldGroup = new THREE.Group();
const entGroup = new THREE.Group();
const chunks = [];
const ents = [];
const ambient = [];   // fonctions d'animation d'ambiance appelees a chaque image
const TEX = {};
let clockT = 0;

// Enregistre une entite de jeu (collision + comportement) autour d'un objet 3D
function regEnt(obj, opt) {
  const e = Object.assign({
    obj: obj, type: "generic", level: "LOW", hw: 1, hl: 1, hh: 1, baseY: 0,
    dyn: false, dead: false, hitCd: 0, update: null
  }, opt);
  e.obj.userData.ent = e;
  return e;
}
// Marque tout un prototype comme partage : ses geometries ne sont jamais liberees (les clones les reutilisent)
function markShared(root) {
  root.traverse((o) => { if (o.geometry) o.geometry._shared = true; });
  return root;
}
// Libere la memoire GPU d'un sous-arbre : geometries NON partagees et materiaux marques "own" (crees par instance)
function disposeTempRecursive(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry._shared) o.geometry.dispose();
    const m = o.material;
    if (m && !Array.isArray(m) && m.userData && m.userData.own) m.dispose();
  });
}
const ownMat = (m) => { m.userData.own = true; return m; };

// Panneaux de manifestation (canvas)
function buildSignTextures() {
  TEX.protestSigns = ["NON AUX DEVOIRS", "LA SÉCHERIE EST UN MÉTIER", "RENDS L'ARGENT", "ON VEUT DES PISCINES", "TOUT DE SUITE !", "COLLÈGE MOLIÈRE = MOLLO"].map((t) => canvasTex(256, 160, (x, w, h) => {
    x.fillStyle = "#f4efe4"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#c8342a"; x.fillRect(0, 0, w, 14); x.fillRect(0, h - 14, w, 14);
    x.fillStyle = "#20242c"; x.font = "700 40px Rajdhani, Arial Narrow, Arial"; x.textAlign = "center";
    const words = t.split(" ");
    let line = "", y = 58;
    words.forEach((wd) => {
      if ((line + wd).length > 14) { x.fillText(line, w / 2, y); y += 36; line = wd + " "; }
      else line += wd + " ";
    });
    x.fillText(line.trim(), w / 2, y);
  }));
}

// Canards du parc
function makeDuck() {
  const bb = new BB();
  bb.g("matte").sphere(0.22, 0, 0.2, 0, 0xf4d24b, { sz: 1.3, sy: 0.85, ws: 10, hs: 8 });
  bb.g("matte").sphere(0.13, 0, 0.42, -0.16, 0xf4d24b, { ws: 8, hs: 6 });
  bb.g("matte").box(0.1, 0.05, 0.14, 0, 0.4, -0.33, 0xe8802a);
  bb.g("matte").sphere(0.022, 0.07, 0.46, -0.24, 0x111111, { ws: 5, hs: 4 });
  bb.g("matte").sphere(0.022, -0.07, 0.46, -0.24, 0x111111, { ws: 5, hs: 4 });
  const g = bb.finish();
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeDuckSwimmer(duck) {
  return (dt) => {
    const p = duck.userData.pond;
    if (!p) return;
    p.a += dt * 0.35;
    duck.position.x = p.x + Math.cos(p.a) * p.r;
    duck.position.z = p.z + Math.sin(p.a) * p.r;
    duck.position.y = 0.1 + Math.sin(clockT * 2 + p.a * 3) * 0.015;
    duck.rotation.y = -p.a;
  };
}

function buildWorld() {
  buildRoad();
  for (let i = 0; i < CFG.ACTIVE_CHUNKS; i++) makeChunk(i);
  buildCollages();
  buildPlayer();
}
