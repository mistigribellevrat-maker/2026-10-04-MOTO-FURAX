"use strict";
/* ============================================================================
   NIVEAUX — meteo, boss de fin, aide au pilotage
   - Niveau 2 "Jour de pluie" : ciel gris, route mouillee qui brille, pluie, eclairs et tonnerre,
     adherence reduite, flaques partout et rafales de vent qui poussent la moto sur le cote.
   - Boss de fin (tous niveaux) : le principal et ses surveillants barrent la rue avec une banderole
     devant le college ; une seule breche, qui se deplace. On passe par la breche... ou par-dessus.
   - Aide : petite correction de trajectoire automatique pour les plus jeunes.
   ============================================================================ */

/* --------------------------------- METEO ---------------------------------- */
const WEATHER = { kind: "sun", base: null, rain: null, flashT: 6, thunder: 0 };
const RAIN_N = 1300, RAIN_BOX = { x: 44, y: 26, z: 70 };
function weatherGrip() { return WEATHER.kind === "rain" ? 0.55 : 1; }
function buildRain() {
  const pos = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) {
    const x = rnd(-RAIN_BOX.x / 2, RAIN_BOX.x / 2), y = rnd(0, RAIN_BOX.y), z = rnd(-RAIN_BOX.z, 10);
    pos.set([x, y, z, x + 0.05, y + 0.9, z + 0.25], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.LineBasicMaterial({ color: 0xc8d6e6, transparent: true, opacity: 0.38, depthWrite: false, fog: false });
  const l = new THREE.LineSegments(g, m);
  l.frustumCulled = false; l.renderOrder = 5; l.visible = false;
  scene.add(l);
  WEATHER.rain = l;
}
function applyWeather(kind) {
  if (!skyUniforms || !scene) return;
  const hemi = scene.children.find((o) => o.isHemisphereLight);
  if (!WEATHER.base) {
    WEATHER.base = {
      top: skyUniforms.uTop.value.clone(), mid: skyUniforms.uMid.value.clone(), hor: skyUniforms.uHor.value.clone(), sun: skyUniforms.uSunCol.value.clone(),
      fog: scene.fog.color.clone(), dens: scene.fog.density, dir: dirLight.intensity, hemi: hemi ? hemi.intensity : 0.5,
      sat: RENDER.fx.sat, rough: GFX.mat.road ? GFX.mat.road.roughness : 1, env: GFX.mat.road ? GFX.mat.road.envMapIntensity : 1
    };
  }
  const B = WEATHER.base;
  WEATHER.kind = kind;
  if (!WEATHER.rain) buildRain();
  const rain = kind === "rain";
  skyUniforms.uTop.value.copy(rain ? new THREE.Color(0x4a5563) : B.top);
  skyUniforms.uMid.value.copy(rain ? new THREE.Color(0x76808c) : B.mid);
  skyUniforms.uHor.value.copy(rain ? new THREE.Color(0x98a1aa) : B.hor);
  skyUniforms.uSunCol.value.copy(rain ? new THREE.Color(0x30343a) : B.sun);
  scene.fog.color.copy(rain ? new THREE.Color(0x8c959e) : B.fog);
  scene.fog.density = rain ? 0.0082 : B.dens;
  dirLight.intensity = rain ? 0.75 : B.dir;
  if (hemi) hemi.intensity = rain ? 0.95 : B.hemi;
  RENDER.fx.sat = rain ? 0.86 : B.sat;
  if (GFX.mat.road) { GFX.mat.road.roughness = rain ? B.rough * 0.35 : B.rough; GFX.mat.road.envMapIntensity = rain ? 2.2 : B.env; }
  WEATHER.rain.visible = rain;
  WEATHER.flashT = rnd(5, 9);
}
// appelee a chaque image (hors pause) : pluie qui tombe autour de la camera, eclairs
function weatherTick(dt) {
  if (WEATHER.kind !== "rain" || !WEATHER.rain) return;
  const r = WEATHER.rain, P = r.geometry.attributes.position, a = P.array;
  const fall = 26 * dt, fwd = (player.speed || 0) * dt;
  for (let i = 0; i < RAIN_N; i++) {
    const o = i * 6;
    let y = a[o + 1] - fall, z = a[o + 2] + fwd * 0.15;
    if (y < 0) { y += RAIN_BOX.y; a[o] = rnd(-RAIN_BOX.x / 2, RAIN_BOX.x / 2); z = rnd(-RAIN_BOX.z, 10); a[o + 3] = a[o] + 0.05; }
    if (z > 10) z -= RAIN_BOX.z;
    a[o + 1] = y; a[o + 4] = y + 0.9; a[o + 2] = z; a[o + 5] = z + 0.25;
  }
  P.needsUpdate = true;
  r.position.set(camera.position.x, 0, player.z - 6);
  if (app !== APP.RACE && app !== APP.COUNTDOWN) return;
  WEATHER.flashT -= dt;
  if (WEATHER.flashT <= 0) {
    WEATHER.flashT = rnd(7, 13);
    flash("good", 140);
    setTimeout(() => flash("good", 90), 220);
    WEATHER.thunder = rnd(0.5, 1.4);
  }
  if (WEATHER.thunder > 0) {
    WEATHER.thunder -= dt;
    if (WEATHER.thunder <= 0) { audio.noiseBurst(1.8, "lowpass", 140, 0.5, 0.7); addShake(0.12); }
  }
}

/* ------------------------------ RAFALES DE VENT ------------------------------ */
function updateGust(dt, st) {
  if (!st.gustT) return;
  if (st.gustT > 0 && !st.gustDir) {
    st.gustDir = Math.random() < 0.5 ? -1 : 1;
    showAlert(st.gustDir > 0 ? "RAFALE DE VENT ➜" : "⬅ RAFALE DE VENT", "cyan", 1300);
    audio.noiseBurst(1.6, "bandpass", 600, 0.18, 0.5);
  }
  st.gustT += dt;
  if (st.gustT > 0.8 && st.gustT < 2.4 && !st.endSeq) {
    player.x = clamp(player.x + st.gustDir * 4.2 * dt, -CFG.WALL_X, CFG.WALL_X);
    if (Math.random() < dt * 20) smokePuff(player.x - st.gustDir * 2, 0.6, player.z + rnd(-3, 3), { s0: 0.3, a0: 0.15, ttl: 0.5 });
  }
  if (st.gustT > 2.4) { st.gustT = 0; st.gustDir = 0; }
}

/* ------------------------------ BOSS : LE PRINCIPAL ------------------------------ */
const BOSS_DIST = 1935;               // distance de la banderole (le portail est a 2000 m)
let boss = null;
function bossBanner(w) {
  const tex = textSprite("PAS DE RETARD !", { w: 512, h: 96, fg: "#ffffff", bg: "#c8342a", font: "900 58px 'Arial Black', Impact, sans-serif" });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.7), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 }));
  m.position.y = 1.35;
  return m;
}
function spawnBoss(st) {
  const z = -BOSS_DIST;
  const people = [];
  const mk = (principal) => {
    const h = buildHuman(principal
      ? { h: 1.08, skin: 0xe8b48a, hair: 0x8a8a90, hairStyle: "balding", shirt: 0x2b3448, pants: 0x2b3448, shoe: 0x1a1a1a, armL: "hips", armR: "wave", mouth: 1, brow: 1, head: 1.3, build: 1.1 }
      : { h: rnd(0.98, 1.04), skin: pick(SKINS), hair: pick(HAIRS), hairStyle: pick(["short", "cap", "long"]), shirt: 0xf2d21b, pants: 0x2b3038, armL: "hold", armR: "hold", mouth: 1, head: 1.25 });
    h.root.rotation.y = Math.PI;
    h.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return h;
  };
  // deux murs (gauche / droite de la breche), chacun = une entite basse dont la largeur suit la breche
  const walls = [-1, 1].map((side) => {
    const g = new THREE.Group();
    const crew = [];
    for (let i = 0; i < 5; i++) { const h = mk(side < 0 && i === 4); g.add(h.root); crew.push(h); people.push(h); }
    const banner = bossBanner(1); g.add(banner);
    const e = regEnt(g, { type: "boss", level: "LOW", hw: 2, hl: 0.6, hh: 2.1, damage: 8, moving: true });
    e.side = side; e.crew = crew; e.banner = banner; e.x = 0; e.z = z; e.nm = false;
    addFreeEnt(e);
    return e;
  });
  boss = { walls: walls, t: 0, gap: 0, passed: false };
  showAlert("LE PRINCIPAL BARRE LA ROUTE !", "gold", 2400);
  playVoice(["principal"]);
  audio.horn();
  st.bossSpawned = true;
}
function updateBoss(dt, st) {
  if (!boss) return;
  boss.t += dt;
  const GW = 5.4, EDGE = CFG.WALL_X + 0.4;
  boss.gap = Math.sin(boss.t * 0.85) * 7.2;          // la breche se balade d'un trottoir a l'autre
  boss.walls.forEach((e) => {
    const a = e.side < 0 ? -EDGE : boss.gap + GW / 2, b = e.side < 0 ? boss.gap - GW / 2 : EDGE;
    const w = Math.max(0.4, b - a);
    e.x = (a + b) / 2; e.hw = w / 2;
    e.obj.position.set(e.x, 0, e.z);
    e.banner.scale.x = Math.max(0.01, w - 0.6);
    e.crew.forEach((h, i) => {
      h.root.position.x = (i / (e.crew.length - 1) - 0.5) * (w - 0.8);
      animateHuman(h, boss.t * 0.8 + i, 0.6);
    });
  });
  if (!boss.passed && player.z < -BOSS_DIST - 1.5) {
    boss.passed = true;
    if (!boss.walls.some((e) => e.wasHit)) { addScore(st, 200, player.y > 1 ? "PAR-DESSUS LE PRINCIPAL !" : "PRINCIPAL ESQUIVÉ !", true); slowMo(0.5); }
  }
}
function hitBoss(e, st, dx) {
  e.hitCd = 1.2;
  breakCombo(st);
  slowBy(0.2);
  player.stun = 0.6;
  player.z += 1.2;
  addShake(0.5);
  audio.crash(false);
  impactFeel("medium", player.x, player.worldY + 1, player.z - 0.5);
  showAlert("LE PRINCIPAL T'ARRÊTE !", "gold");
  applyDamage(e.damage, st);
}

/* --------------------------- MISE A JOUR DU NIVEAU --------------------------- */
function updateLevelFx(dt, st) {
  updateGust(dt, st);
  if (!st.bossSpawned && !DBG.noObstacles && CFG.TOTAL_DIST - st.distance < 230) spawnBoss(st);
  updateBoss(dt, st);
}
function resetLevelFx() { boss = null; }

/* --------------------------- AIDE AU PILOTAGE --------------------------- */
// direction (-1 / 0 / +1) pour s'ecarter du premier obstacle droit devant
function avoidDir() {
  let best = null, bd = 1e9;
  const look = player.speed * 0.9 + 6;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.dead || e.type === "item" || e.type === "puddle" || e.type === "ramp" || e.type === "phone") continue;
    const w = entWorld(e), ahead = player.z - w.z;
    if (ahead < 1 || ahead > look) continue;
    if (Math.abs(player.x - w.x) > e.hw + 1.3) continue;
    if (ahead < bd) { bd = ahead; best = w; }
  }
  if (!best) return 0;
  let d = player.x >= best.x ? 1 : -1;
  if (Math.abs(player.x + d * 3) > 10.5) d = -d;
  return d;
}
