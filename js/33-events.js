"use strict";
/* ============================================================================
   EVENEMENTS SURPRISES, TREMPLINS, FROLEMENTS ET SCORE
   - Directeur d'evenements : toutes les 9-14 s, une surprise (voiture folle, voiture a contresens,
     raccourci de papa, chantier surprise, pluie de bonus). Jamais deux courses identiques.
   - Voiture folle : arrive par derriere, double, se rabat sur toi (queue de poisson) puis zigzague.
   - Frolements : passer tout pres d'un obstacle sans le toucher rapporte des points, de la nitro et
     fait monter le multiplicateur de combo (perdu au premier choc).
   ============================================================================ */
const freeEnts = [];              // entites hors chunks (voitures, evenements)
let crazyRef = null;              // voiture folle en cours (indicateur de menace)

function addFreeEnt(e) {
  e.chunk = null; e.free = true;
  e.obj.position.set(e.x, e.baseY || 0, e.z);
  scene.add(e.obj);
  ents.push(e); freeEnts.push(e);
  return e;
}
function removeFreeEnt(e) {
  scene.remove(e.obj);
  disposeTempRecursive(e.obj);
  const i = ents.indexOf(e); if (i >= 0) ents.splice(i, 1);
  const j = freeEnts.indexOf(e); if (j >= 0) freeEnts.splice(j, 1);
  if (crazyRef === e) crazyRef = null;
}
function clearFreeEnts() {
  for (let i = freeEnts.length - 1; i >= 0; i--) removeFreeEnt(freeEnts[i]);
  crazyRef = null;
  const th = $("hud-threat"); if (th) th.className = "hud-threat";
}

/* --------------------------------- SCORE ----------------------------------- */
function addScore(st, pts, label, bump) {
  if (bump) { st.combo = Math.min(8, st.combo + 1); st.comboT = 5; audio.combo(st.combo); }
  const gain = Math.round(pts * (bump ? st.combo : 1));
  st.score += gain;
  if (label) showPickup(label + "  +" + gain);
  return gain;
}
function breakCombo(st) {
  if (st.combo > 1 && st.comboT > 0) showPickup("COMBO PERDU");
  st.combo = 1; st.comboT = 0;
}

/* ------------------------------- FROLEMENTS -------------------------------- */
function checkNearMiss(st) {
  if (player.speed < 14) return;
  const hb = pmod("hitbox");
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.dead || e.nm || e.type === "item" || e.type === "phone" || e.type === "puddle" || e.type === "ramp" || e.type === "crazycar") continue;
    const w = entWorld(e);
    if (player.z > w.z - e.hl - 0.6) continue;      // pas encore depasse
    e.nm = true;
    if (e.wasHit || w.z - player.z > 30) continue;
    const gap = Math.abs(player.x - w.x) - (e.hw + 0.55 * hb);
    if (gap < 0 && player.y > 0.3) {
      addScore(st, 40, "PAR-DESSUS !", true);
    } else if (gap >= 0 && gap < 1.5) {
      addScore(st, gap < 0.6 ? 70 : 45, gap < 0.6 ? "RAS-LES-PÂQUERETTES !" : "FRÔLÉ !", true);
      st.nitro = Math.min(100, st.nitro + pmod("nearNitro"));
      audio.whoosh();
    }
  }
}

/* -------------------------------- TREMPLINS -------------------------------- */
function buildRampProto() {
  const bb = new BB();
  // profil (x = avant, y = hauteur) extrude sur la largeur : pente qui monte vers l'avant (-z)
  bb.g("paint").extrude([[-1.8, 0], [1.8, 0], [1.8, 0.9]], 3.2, 0.03, 0, 0.02, 0, 0xf2c200, { ry: Math.PI / 2 });
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4, len = 3.6, ang = Math.atan2(0.9, len);
    bb.g("matte").box(3.0, 0.03, 0.32, 0, 0.04 + t * 0.9, 1.8 - t * 3.6, 0x17181c, { rx: ang });
  }
  bb.g("metal").box(3.3, 0.9, 0.12, 0, 0.45, -1.82, 0x5a6270);
  const g = bb.finish();
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return markShared(g);
}
function makeRamp() {
  if (!PROP.ramp) PROP.ramp = buildRampProto();
  return regEnt(PROP.ramp.clone(true), { type: "ramp", level: "GROUND", hw: 1.5, hl: 0.4, hh: 0.9, damage: 0 });
}
function hitRamp(e, st) {
  e.hitCd = 1.5;
  if (!player.grounded || player.speed < 8) return;
  player.vy = (9.5 + player.speed * 0.13) * Math.sqrt(pmod("jump"));
  player.grounded = false;
  player.airT = 0;
  audio.jump(); addShake(0.2);
  smokePuff(player.x, 0.4, player.z + 0.5, { s0: 0.5, a0: 0.3 });
  showAlert("TREMPLIN !", "gold", 900);
  addScore(st, 60, null, true);
}

/* ------------------------------ VOITURE FOLLE ------------------------------ */
const CRAZY_COLORS = [0xff2fa0, 0x9cff2e, 0xff8a00, 0x00e5ff, 0xffe600];
function makeCrazyCar() {
  const g = new THREE.Group();
  const body = makeCarProto(pick(["sedan", "hatch", "suv"]), pick(CRAZY_COLORS)).clone();
  g.add(body);
  // gyrophare de fou furieux sur le toit
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), ownMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.2), toneMapped: false })));
  lamp.position.set(0, 1.85, 0.2); g.add(lamp);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const e = regEnt(g, { type: "crazycar", level: "FULL", hw: 0.95, hl: 2.3, hh: 1.6, damage: 20, moving: true });
  e.body = body; e.lamp = lamp;
  return e;
}
function spawnCrazyCar(st) {
  const e = makeCrazyCar();
  const side = player.x > 0.6 ? -1 : (player.x < -0.6 ? 1 : (Math.random() < 0.5 ? -1 : 1));
  e.side = side;
  e.x = clamp(player.x + side * 3.6, -5.6, 5.6);
  e.z = player.z + 36;
  e.lane = e.x;
  e.speed = Math.max(player.speed, 18) + 13;
  e.phase = "chase"; e.t = 0; e.nm = true; e.prevX = e.x;
  e.update = updateCrazyCar;
  addFreeEnt(e);
  crazyRef = e;
  st.seenCrazy = true;
  audio.horn();
  showAlert("VOITURE FOLLE DERRIÈRE !", "", 1900);
}
function updateCrazyCar(e, dt, P) {
  e.t += dt;
  const rel = e.z - P.z;                        // > 0 : la voiture est derriere la moto
  const roadX = CFG.ROAD_W / 2 - 1.0;
  let target = e.x, vmax = 4;
  if (e.phase === "chase") {
    e.speed = damp(e.speed, Math.max(P.speed, 18) + 12, 2, dt);
    target = e.lane + Math.sin(e.t * 2.6) * 1.3;
    if (Math.random() < dt * 0.8) audio.horn();
    if (rel < 10) { e.phase = "swerve"; e.swT = 0; audio.screech(); }
  } else if (e.phase === "swerve") {
    // queue de poisson : elle se rabat sur la trajectoire de la moto
    e.swT += dt;
    e.speed = Math.max(P.speed, 18) + 6.5;
    // elle vise la moto tant qu'elle est a sa hauteur ; une fois devant, elle garde sa ligne
    target = rel > -2.5 ? P.x : e.x; vmax = 6.8;
    if (e.hitPlayer) e.swT = 99;
    if (Math.random() < dt * 12) smokePuff(e.x + rnd(-0.8, 0.8), 0.2, e.z + 1.8, { s0: 0.4, a0: 0.35, ttl: 0.6 });
    if (rel < -9 || e.swT > 2.6) {
      e.phase = "flee";
      if (!e.hitPlayer && gameState && !gameState.endSeq) {
        addScore(gameState, 150, "VOITURE FOLLE ÉVITÉE !", true);
        gameState.nitro = Math.min(100, gameState.nitro + 15);
      }
    }
  } else {
    e.speed = damp(e.speed, Math.max(P.speed, 26) + 10, 1.5, dt);
    target = Math.sin(e.t * 1.7) * roadX * 0.85; vmax = 5;
    if (rel < -170 || e.z < -CFG.TOTAL_DIST - 40) e.dead = true;
  }
  target = clamp(target, -roadX, roadX);
  e.x += clamp(target - e.x, -vmax * dt, vmax * dt);
  e.z -= e.speed * dt;
  const vx = (e.x - e.prevX) / Math.max(dt, 1e-4); e.prevX = e.x;
  e.obj.position.set(e.x, 0, e.z);
  e.obj.rotation.y = damp(e.obj.rotation.y, -vx * 0.06, 8, dt);
  e.body.rotation.z = damp(e.body.rotation.z, vx * 0.012, 6, dt);
  e.lamp.material.color.setRGB(Math.sin(clockT * 18) > 0 ? 3 : 0.3, 0.4, Math.sin(clockT * 18) > 0 ? 0.2 : 2.5);
}

/* --------------------------- VOITURE A CONTRESENS --------------------------- */
function spawnOncoming(st) {
  const lanes = [-4.5, 0, 4.5];
  let lane = lanes.reduce((a, b) => Math.abs(b - player.x) < Math.abs(a - player.x) ? b : a);
  if (Math.random() < 0.35) lane = pick(lanes);
  const g = new THREE.Group();
  const body = makeCarProto(pick(["van", "suv", "sedan"]), pick(CAR_COLORS)).clone();
  body.rotation.y = Math.PI;                    // face a la moto
  g.add(body);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const e = regEnt(g, { type: "oncoming", level: "FULL", hw: 1.0, hl: 2.4, hh: 1.6, damage: 24, moving: true });
  e.x = lane; e.z = player.z - 170; e.speed = 14; e.honked = false;
  e.update = (ent, dt, P) => {
    ent.z += ent.speed * dt;
    ent.obj.position.set(ent.x, 0, ent.z);
    const ahead = P.z - ent.z;
    if (!ent.honked && -ahead < 70 && -ahead > 0) { ent.honked = true; audio.horn(); }
    if (ent.z > P.z + 50) ent.dead = true;
  };
  addFreeEnt(e);
  showAlert("VOITURE À CONTRESENS !", "gold", 1800);
}

/* ----------------------------- AUTRES SURPRISES ----------------------------- */
function surpriseRoadworks() {
  const lanes = [-4.5, 0, 4.5].sort(() => Math.random() - 0.5).slice(0, 2);
  const z = player.z - 95;
  lanes.forEach((x, i) => {
    const e = makeConeCluster();
    e.x = x + rnd(-0.6, 0.6); e.z = z - i * rnd(0, 6);
    addFreeEnt(e);
  });
  showAlert("CHANTIER SURPRISE !", "gold", 1500);
}
function surpriseBonus() {
  const x = pick([-4.5, 0, 4.5]), kind = Math.random() < 0.65 ? "nitro" : "coffee";
  for (let i = 0; i < 3; i++) {
    const e = makeItem(kind);
    e.x = x; e.z = player.z - 80 - i * 7;
    addFreeEnt(e);
  }
  showAlert(kind === "nitro" ? "PLUIE DE NITRO !" : "CAFÉS À EMPORTER !", "cyan", 1500);
}
function dadShortcut() {
  if (dad.dist < 26) return false;
  dad.dist = Math.max(15, dad.dist - rnd(12, 17));
  audio.horn();
  showAlert("PAPA A PRIS UN RACCOURCI !", "", 1800);
  return true;
}

/* -------------------------- DIRECTEUR D'EVENEMENTS -------------------------- */
function updateEvents(dt, st) {
  if (st.comboT > 0) { st.comboT -= dt; if (st.comboT <= 0) st.combo = 1; }
  // nettoyage des entites libres
  for (let i = freeEnts.length - 1; i >= 0; i--) {
    const e = freeEnts[i];
    if (!e.moving && !e.dead && e.z - player.z > 40) e.dead = true;
    if (e.dead) removeFreeEnt(e);
  }
  // indicateur : la voiture folle arrive par derriere
  const th = $("hud-threat");
  const c = crazyRef;
  const showT = c && !c.dead && c.phase !== "flee" && c.z - player.z > 2;
  const cls = showT ? "hud-threat on " + (c.x < player.x - 0.8 ? "left" : (c.x > player.x + 0.8 ? "right" : "")) : "hud-threat";
  if (th.className !== cls) th.className = cls;

  if (DBG.noObstacles || st.endSeq) return;
  st.evT -= dt;
  if (st.evT > 0 || CFG.TOTAL_DIST - st.distance < 260) return;
  st.evT = rnd(CFG.EVENT_GAP[0], CFG.EVENT_GAP[1]) / LEVELS[save.level].events;
  if (crazyRef) { st.evT = 3; return; }
  // la voiture folle est garantie au moins une fois par course
  if (!st.seenCrazy && st.raceTime > 16) { spawnCrazyCar(st); return; }
  const r = Math.random();
  if (r < 0.34) spawnCrazyCar(st);
  else if (r < 0.56) spawnOncoming(st);
  else if (r < 0.72) { if (!dadShortcut()) surpriseRoadworks(); }
  else if (r < 0.87) surpriseRoadworks();
  else surpriseBonus();
}
