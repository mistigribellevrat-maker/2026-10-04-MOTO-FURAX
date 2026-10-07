"use strict";
/* ============================================================================
   PARTIE 3 — GAMEPLAY : physique, poursuite, collisions, camera, HUD, boucle
   ============================================================================ */
let gameState = null;
let attract = false;
let last = 0;
let exhaustAcc = 0;
let viewZoom = 1;
const shake = { amp: 0, x: 0, y: 0, rot: 0 };
const hudCache = {};
let MAX_CHUNK_INDEX = Math.floor(CFG.TOTAL_DIST / CFG.CHUNK_LEN);

/* ---------------------------- OUTILS HUD / EFFETS -------------------------- */
function setText(el, v) {
  if (hudCache[el.id] !== v) { hudCache[el.id] = v; el.textContent = v; }
}
function setStyle(el, prop, v) {
  const k = el.id + prop;
  if (hudCache[k] !== v) { hudCache[k] = v; el.style[prop] = v; }
}
function flash(kind, dur) {
  const f = $("flash");
  f.className = "";
  void f.offsetWidth;
  f.className = kind;
  setTimeout(() => { f.className = ""; }, dur || 160);
}
function addShake(amp) { shake.amp = Math.min(1.6, shake.amp + amp); }
function showAlert(text, cls, dur) {
  const el = $("hud-alert");
  el.textContent = text;
  el.className = "on " + (cls || "");
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ""; }, dur || 1500);
}
function showPickup(text) {
  const el = $("hud-pickup");
  el.textContent = text;
  el.className = "on";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ""; }, 900);
}

/* -------------------------------- PARTIE / RESET --------------------------- */
function newState() {
  const def = BIKES[save.bike];
  return {
    raceTime: 0, timeLeft: CFG.TIME_LIMIT, integrity: def.health, integrityMax: def.health,
    nitro: 100, distance: 0, hits: 0, pickups: 0,
    endSeq: null, bannerShown: false, beeped: 0, finishing: false
  };
}
function resetPlayer() {
  const def = BIKES[save.bike];
  player.x = 0; player.y = 0; player.z = 0; player.vy = 0; player.speed = 0;
  player.vx = 0; player.slip = 0; player.stun = 0; player.lean = 0;
  player.grounded = true; player.wheelSpin = 0; player.worldY = 0;
  player.vxDir = 0;
  player.boostFlame.material.opacity = 0;
  player.bike.rotation.set(0, 0, 0);
  player.root.rotation.set(0, 0, 0);
  dad.dist = CFG.DAD_START; dad.speed = def.maxSpeed * 0.5; dad.x = 0; dad.z = CFG.DAD_START;
  dad.root.visible = false;
  player.root.visible = true;
  player.root.position.set(0, 0, 0);
  player.shadow.position.set(0, 0.015, 0);
}
function rebuildAllChunks(demo) {
  for (let i = 0; i < chunks.length; i++) {
    const ch = chunks[i];
    ch.visible = true;
    const idx = ch.userData.index;
    layoutChunk(ch, idx <= MAX_CHUNK_INDEX ? idx : i, demo);
  }
  // reparti proprement de 0
  chunks.forEach((ch, i) => {
    ch.visible = true;
    layoutChunk(ch, i, demo);
  });
}
function startRace() {
  audio.init(); audio.resume(); audio.uiBig();
  audio.setSiren(0, 0.05);
  closeModal();
  gameState = newState();
  resetPlayer();
  rebuildAllChunks(false);
  input.up = input.down = input.left = input.right = input.nitro = false;
  input.jumpQueued = false;
  attract = false;
  camera.position.set(0, 15.5, 17.5);
  camera.rotation.z = 0;
  hudCache.cdgo = 0;
  setApp(APP.COUNTDOWN);
  countdownT = 3.6;
  setCountdownText("3");
  $("banner-school").className = "";
  $("dmgborder").className = "";
  $("speedlines").className = "";
  $("hud-clock").className = "clock-time";
  refreshMuteBtn();
}
function beginJourney() {
  audio.init(); audio.resume(); audio.uiBig();
  setApp(APP.MENU);
}
function replay() { audio.uiBig(); startRace(); }
function goToMenu() {
  audio.ui();
  audio.setSiren(0, 0.05);
  gameState = null;
  setApp(APP.MENU);
}
function quitToHome() {
  audio.ui();
  audio.setSiren(0, 0.05);
  gameState = null;
  attract = false;
  dad.root.visible = false;
  rebuildAllChunks(true);
  player.x = 0; player.z = 0; player.root.position.set(0, 0, 0);
  player.root.visible = false;
  camera.position.set(0, 16, 30);
  setApp(APP.HOME);
}
function pauseRace() {
  if (app !== APP.RACE) return;
  audio.ui();
  audio.setSiren(0, 0.05);
  input.up = input.down = input.left = input.right = input.nitro = false;
  setApp(APP.PAUSE);
}
function resumeRace() {
  if (app !== APP.PAUSE) return;
  audio.ui(); audio.resume();
  setApp(APP.RACE);
}
function onAppChange(prev, next) {
  if (next === APP.MENU && prev !== APP.MENU) {
    gameState = null;
    attract = true;
    resetPlayer();
    dad.root.visible = false;
    rebuildAllChunks(true);
    player.z = 0; player.speed = 13;
    camera.position.set(0, 15.5, 30);
  }
  if (next === APP.HOME) {
    attract = false;
  }
}

/* ------------------------------- ATTRACT MODE ------------------------------ */
function updateAttract(dt) {
  player.z -= 13 * dt;
  player.x = Math.sin(clockT * 0.5) * 2.2;
  player.root.position.set(player.x, 0, player.z);
  player.bike.rotation.z = damp(player.bike.rotation.z, Math.cos(clockT * 0.5) * 0.06, 4, dt);
  player.wheelSpin -= (13 / 0.52) * dt;
  player.wheels.forEach((w) => { w.rotation.x = player.wheelSpin; });
  player.rider.rotation.x = -0.22;
  player.shadow.position.set(player.x, 0.015, player.z);
  recycleChunks(player.z, true);
}
function recycleChunks(focusZ, demo) {
  for (let i = 0; i < chunks.length; i++) {
    const ch = chunks[i];
    if (ch.position.z > focusZ + CFG.CHUNK_LEN * 0.85) {
      let idx = ch.userData.index + CFG.ACTIVE_CHUNKS;
      if (demo) idx = idx % Math.max(1, MAX_CHUNK_INDEX + 1);
      if (!demo && idx > MAX_CHUNK_INDEX + 2) { ch.visible = false; continue; }
      layoutChunk(ch, idx, demo);
    }
  }
}

/* --------------------------------- COURSE ---------------------------------- */
let countdownT = 0;
function setCountdownText(t) {
  const cd = $("countdown");
  cd.classList.remove("hidden");
  cd.innerHTML = "<b>" + t + "</b>";
}
function updateCountdown(dt) {
  countdownT -= dt;
  const prev = Math.ceil(countdownT + 0.0);
  if (countdownT <= 0.6) setCountdownText("GO !");
  else setCountdownText(String(Math.min(3, Math.ceil(countdownT - 0.6))));
  if (countdownT <= 0.6 && hudCache["cdgo"] !== 1) { hudCache["cdgo"] = 1; audio.beep(880, 0.3, "square", 0.2, 1400); flash("good", 220); }
  if (countdownT <= 0) {
    $("countdown").classList.add("hidden");
    hudCache["cdgo"] = 0;
    setApp(APP.RACE);
  }
}
function updateRace(dt) {
  const st = gameState;
  if (st.endSeq) { updateEndSeq(dt); return; }
  if (app === APP.COUNTDOWN) {
    updateCountdown(dt);
    player.wheelSpin -= 4 * dt;
    player.wheels.forEach((w) => { w.rotation.x = player.wheelSpin; });
    return;
  }
  st.raceTime += dt;
  st.timeLeft -= dt;

  updatePlayer(dt, st);
  updateDadEntity(dt, st);
  updateEnts(dt, st);
  collide(dt, st);
  recycleChunks(player.z, false);
  exhaustFx(dt, st);
  updateHUD(dt, st);

  if (st.timeLeft <= 0 && !st.endSeq) { st.timeLeft = 0; endRace(false, "time"); }
}

/* ------------------------------ PHYSIQUE JOUEUR ----------------------------- */
function updatePlayer(dt, st) {
  const def = BIKES[save.bike];
  const nitroActive = input.nitro && st.nitro > 0.5 && !player.stun;
  const brakePriority = input.down;

  let throttle = 0;
  if (brakePriority) throttle = -1;
  else if (input.up) throttle = 1;

  const maxCostSpeed = st.integrity > st.integrityMax * 0.3 ? 1 : 0.86;
  if (throttle > 0) player.speed += def.accel * dt * maxCostSpeed;
  else if (throttle < 0) player.speed -= CFG.BRAKE * dt;
  else player.speed -= CFG.DRAG * dt;

  if (nitroActive) {
    player.speed += CFG.NITRO_ACCEL * dt * maxCostSpeed;
    st.nitro = Math.max(0, st.nitro - CFG.NITRO_DRAIN * dt);
    if (Math.random() < 0.5) addShake(0.012);
  } else {
    st.nitro = Math.min(100, st.nitro + CFG.NITRO_REGEN * dt);
  }
  audio.setNitro(nitroActive);
  audio.setEngine(player.speed / def.maxSpeed, throttle, dt);

  const top = nitroActive ? def.nitroSpeed : def.maxSpeed;
  player.speed = clamp(player.speed, 0, top);
  if (player.stun > 0) player.stun -= dt;
  if (player.slip > 0) player.slip -= dt;

  // Direction laterale
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const speedK = 0.5 + 0.5 * Math.min(1, player.speed / def.maxSpeed);
  const slipK = player.slip > 0 ? 0.32 : 1;
  let targetVx = steer * 13.5 * speedK * slipK;
  if (player.stun > 0) targetVx *= 0.4;
  player.vx = damp(player.vx, targetVx, player.grounded ? 10 : 3.2, dt);
  if (player.slip > 0) player.vx += player.slipDir * 7.5 * Math.sin(player.slip * 9) * 0.6;

  let nx = player.x + player.vx * dt;
  if (nx > CFG.WALL_X || nx < -CFG.WALL_X) {
    const side = Math.sign(nx);
    nx = side * CFG.WALL_X;
    player.vx = 0;
    player.speed *= 0.965;
    if (player.speed > 6 && Math.random() < 0.75) {
      sparksBurst(nx + side * 0.25, player.worldY + 0.5, player.z + rnd(-0.5, 0.5), 3, { power: 3 });
      addShake(0.05);
      audio.noiseBurst(0.06, "highpass", 3200, 0.1);
    }
  }
  const wasOnRoad = Math.abs(player.x) <= CFG.ROAD_W / 2;
  const nowOnRoad = Math.abs(nx) <= CFG.ROAD_W / 2;
  if (wasOnRoad !== nowOnRoad && player.speed > 26 && player.grounded) {
    addShake(0.12);
    audio.noiseBurst(0.09, "lowpass", 500, 0.22);
    smokePuff(nx, 0.1, player.z, { s0: 0.28 });
  }
  player.x = nx;
  player.vxDir = steer;

  // Saut
  if (input.jumpQueued && player.grounded && player.stun <= 0) {
    player.vy = CFG.JUMP_V;
    player.grounded = false;
    audio.jump();
    smokePuff(player.x, 0.1, player.z + 0.6, { s0: 0.5, a0: 0.35 });
  }
  input.jumpQueued = false;
  if (!player.grounded) {
    player.vy -= CFG.GRAVITY * dt;
    if (nitroActive) player.vy += CFG.GRAVITY * 0.3 * dt * (player.vy > 0 ? 1 : 0.35);
    player.y += player.vy * dt;
    if (player.y <= 0 && player.vy < 0) {
      player.y = 0; player.vy = 0; player.grounded = true;
      audio.land();
      addShake(0.16);
      smokePuff(player.x, 0.08, player.z + 0.4, { s0: 0.45, a0: 0.3 });
      sparksBurst(player.x, 0.1, player.z + 0.5, 2, { power: 2 });
    }
    if (player.y < 0) player.y = 0;
  }

  // Avancee
  player.z -= player.speed * dt;
  st.distance = -player.z;

  // Sol (route / trottoir)
  const groundY = Math.abs(player.x) > CFG.ROAD_W / 2 ? CFG.SIDEWALK_H : 0;
  player.worldY = groundY + player.y;
  player.root.position.set(player.x, player.worldY, player.z);
  player.shadow.position.set(player.x, groundY + 0.015, player.z);
  const shScale = clamp(1 - player.y * 0.16, 0.45, 1);
  player.shadow.scale.set(shScale, shScale, shScale);
  player.shadow.material.opacity = 0.62 * shScale;

  animateBike(dt, nitroActive, st);

  // Victoire
  if (player.z <= -CFG.TOTAL_DIST && !st.endSeq) {
    endRace(true, "win");
  }
}
function animateBike(dt, nitroActive, st) {
  const def = BIKES[save.bike];
  const sr = clamp(player.speed / def.maxSpeed, 0, 1.4);
  player.wheelSpin -= (player.speed / 0.52) * dt;
  player.wheels.forEach((w) => { w.rotation.x = player.wheelSpin; });
  const steer = player.vxDir || 0;
  const leanZ = -steer * (0.25 + sr * 0.28) - (player.slip > 0 ? player.slipDir * 0.42 : 0);
  player.bike.rotation.z = damp(player.bike.rotation.z, clamp(leanZ, -0.75, 0.75), 7, dt);
  player.bike.rotation.y = damp(player.bike.rotation.y, steer * 0.09 + (player.slip > 0 ? player.slipDir * 0.55 : 0), 6, dt);
  const pitch = -0.03 * sr + (nitroActive ? 0.05 : 0) - (player.grounded ? 0 : clamp(player.vy * 0.012, -0.12, 0.12));
  player.root.rotation.x = damp(player.root.rotation.x, pitch, 5, dt);
  player.rider.rotation.x = damp(player.rider.rotation.x, -0.02 - sr * 0.22 + (input.down ? 0.16 : 0), 6, dt);
  player.rider.rotation.z = damp(player.rider.rotation.z, -steer * 0.12, 5, dt);
  player.steer.rotation.y = damp(player.steer.rotation.y, -steer * 0.3, 8, dt);
  if (player.stun > 0) {
    player.bike.rotation.z += Math.sin(clockT * 42) * 0.16 * player.stun;
    player.rider.rotation.z += Math.sin(clockT * 50) * 0.2 * player.stun;
  }
  const fl = player.boostFlame.material;
  const targetOp = nitroActive ? rnd(0.65, 1) : 0;
  fl.opacity = damp(fl.opacity, targetOp, nitroActive ? 25 : 8, dt);
  player.boostFlame.scale.set(rnd(0.85, 1.25), rnd(0.9, 1.5), rnd(0.85, 1.25));
  if (st && st.integrity < st.integrityMax * 0.3) {
    if (Math.random() < 0.3) smokePuff(player.x, player.worldY + 0.9, player.z + 0.4, { s0: 0.22, r: 0.25, g: 0.25, b: 0.27, a0: 0.5, ttl: 0.8 });
  }
}
function exhaustFx(dt, st) {
  const sr = clamp(player.speed / 30, 0, 2);
  exhaustAcc += dt * (8 + sr * 26);
  const bx = player.x + 0.24, by = player.worldY + 0.72, bz = player.z + 1.5;
  while (exhaustAcc > 1) {
    exhaustAcc -= 1;
    smokePuff(bx + rnd(-0.06, 0.06), by, bz, { s0: rnd(0.1, 0.2), ttl: rnd(0.35, 0.7), a0: 0.3, drag: 0.9 });
  }
  if (input.nitro && st.nitro > 0.5) {
    for (let i = 0; i < 2; i++) {
      fxSpark.emit(bx + rnd(-0.2, 0.2), by + rnd(-0.15, 0.25), bz + rnd(0, 0.6), rnd(-1.4, 1.4), rnd(-0.4, 1.2), rnd(3, 9), {
        ttl: rnd(0.16, 0.34), s0: rnd(0.14, 0.3), s1: 0.02, r: 0.5, g: 0.9, b: 1, r1: 0.2, g1: 0.5, b1: 1, a0: 0.9, drag: 0.9
      });
    }
  }
}

/* -------------------------------- POURSUITE --------------------------------- */
function updateDadEntity(dt, st) {
  const def = BIKES[save.bike];
  const target = Math.max(CFG.DAD_MIN, player.speed * 0.9 + 2.5);
  dad.speed = damp(dad.speed, target, 1.8, dt);
  dad.dist += (dad.speed - player.speed) * dt;
  dad.dist = clamp(dad.dist, 0, 55);
  dad.x = damp(dad.x, player.x + Math.sin(clockT * 1.3) * 0.8, 2.5, dt);
  dad.z = player.z + dad.dist;
  dad.root.visible = dad.dist < 26 && app === APP.RACE;
  dad.root.position.set(dad.x, 0, dad.z);
  dad.root.rotation.y = damp(dad.root.rotation.y, (player.x - dad.x) * -0.06, 4, dt);
  dad.root.rotation.z = Math.sin(clockT * 9) * 0.02 * clamp(1 - dad.dist / 20, 0, 1);
  dad.w1.rotation.x -= dad.speed * dt * 2.4;
  dad.w2.rotation.x -= dad.speed * dt * 2.4;
  if (dad.light) {
    dad.light.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(clockT * 7)) * 1.4;
  }
  fatherHot = dad.dist < 22;
  setStyle($("hud-dad"), "width", ((1 - clamp(dad.dist / 50, 0, 1)) * 100) + "%");
  setText($("hud-dad-num"), dad.dist < 50 ? Math.round(dad.dist) + " m" : "LOIN");
  $("hud-dad-bar").className = fatherHot ? "radar-bar hot" : "radar-bar";
  audio.setSiren(clamp(1 - (dad.dist - 3) / 36, 0, 1) * 0.85, dt);
  if (dad.dist <= 2.4 && !st.endSeq) {
    endRace(false, "dad");
  }
}

/* --------------------------------- ENTITES ---------------------------------- */
function updateEnts(dt, st) {
  for (let i = ents.length - 1; i >= 0; i--) {
    const e = ents[i];
    if (e.type === "phone") { updatePhone(e, dt, st); if (e.dead) { scene.remove(e.obj); ents.splice(i, 1); } continue; }
    if (e.dead) continue;
    if (e.dyn && e.update) e.update(e, dt, player, clockT);
    if (e.type === "cat" && e.spawnX == null) e.spawnX = e.obj.position.x;
    if (e.update && !e.dyn) e.update(e, dt, player, clockT);
  }
}
function updatePhone(e, dt, st) {
  e.t += dt;
  if (!e.landed) {
    e.vy -= CFG.GRAVITY * dt;
    e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
    e.obj.position.set(e.x, e.y, e.z);
    e.obj.rotation.x += dt * 14; e.obj.rotation.z += dt * 9;
    if (e.y <= 0.2) { e.y = 0.2; e.landed = true; e.vz *= 0.4; audio.beep(240, 0.1, "square", 0.08); }
  } else {
    e.x += e.vx * 0.25 * dt; e.z += e.vz * 0.2 * dt;
    if (e.t > 6) { e.dead = true; return; }
    e.obj.position.set(e.x, 0.2, e.z);
    e.obj.rotation.x = Math.PI / 2;
  }
  if (e.t > 5.4) e.dead = true;
}
function entWorld(e) {
  if (e.chunk) return { x: e.obj.position.x, z: e.chunk.position.z + e.obj.position.z };
  return { x: e.obj.position.x, z: e.obj.position.z };
}

/* -------------------------------- COLLISIONS -------------------------------- */
let fatherHot = false;
function collide(dt, st) {
  const px = player.x, pz = player.z, py = player.y;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.dead) continue;
    if (e.type === "item") {
      const w = entWorld(e);
      if (Math.abs(px - w.x) < e.hw + 0.7 && Math.abs(pz - w.z) < e.hl + 1.6 && py < e.hh + 0.4) {
        collectItem(e, st);
      }
      continue;
    }
    const w = entWorld(e);
    let wy = e.baseY || 0;
    if (e.type === "phone" && !e.landed) wy = e.y;
    const hw = e.hw + 0.55, hl = e.hl + 1.35;
    const dx = px - w.x, dz = pz - w.z;
    if (Math.abs(dx) > hw || Math.abs(dz) > hl) continue;
    if (py + wy > (e.hh + (wy > 0 ? 0.2 : 0)) && e.level === "LOW") continue;
    if (e.level === "GROUND" && py > 0.28) continue;
    if (e.hitCd > 0) { e.hitCd -= dt; resolveSolid(e, dx, dz, hw, hl, st, true); continue; }
    hitEntity(e, st, dx, dz, hw, hl);
  }
  fatherHot = dad.dist < 22;
}
function resolveSolid(e, dx, dz, hw, hl, st, gentil) {
  const pushX = hw - Math.abs(dx);
  const pushZ = hl - Math.abs(dz);
  if (pushX < pushZ) {
    player.x += Math.sign(dx || 1) * pushX;
    player.vx = 0;
  } else {
    player.z += Math.sign(dz || 1) * pushZ;
    if (Math.sign(dz) > 0) player.speed *= 0.4;
  }
}
function hitEntity(e, st, dx, dz, hw, hl) {
  const type = e.type;
  let dmg = e.damage || 0;
  e.hitCd = 0.7;
  if (type === "truck" || type === "bus") {
    const frontal = Math.abs(dx) < e.hw * 0.85;
    e.hitCd = 0.9;
    if (frontal) {
      player.speed = 0;
      player.z += 2.0;
      player.x += Math.sign(dx || rnd(-1, 1)) * 0.9;
      addShake(1.25);
      flash("hit", 260);
      debrisBurst(player.x, player.worldY + 0.8, player.z, 16, [[0.9, 0.9, 0.95], [0.4, 0.45, 0.55], [1, 0.3, 0.2]]);
      sparksBurst(player.x, player.worldY + 0.7, player.z, 14, { power: 7 });
      audio.crash(true);
      showAlert(type === "truck" ? "CRASH DANS LE CAMION SSB !" : "BUS SCOLAIRE PERCUTÉ !");
    } else {
      player.speed *= 0.35;
      addShake(0.5);
      audio.crash(false);
      sparksBurst(player.x + Math.sign(dx) * 0.5, player.worldY + 0.5, player.z, 8, { power: 5 });
      showAlert("FROTTEMENT !", "gold");
    }
    applyDamage(dmg, st);
  } else if (type === "protest") {
    player.speed *= 0.15;
    player.x += Math.sign(dx || 1) * 0.5;
    addShake(0.55);
    audio.crash(false);
    audio.noiseBurst(0.2, "bandpass", 500, 0.2);
    debrisBurst(player.x, player.worldY + 1, player.z, 8, [[0.9, 0.8, 0.2], [0.95, 0.95, 0.95]]);
    showAlert("BLOQUÉ PAR LES MANIFESTANTS !");
    applyDamage(dmg, st);
  } else if (type === "cat") {
    player.speed *= 0.82;
    player.slip = 1.1;
    player.slipDir = rnd(-1, 1);
    addShake(0.3);
    audio.meow();
    heartsBurst(player.x, player.worldY + 0.4, player.z, 5);
    showAlert("MIAOU ! CHAT SURPRIS !", "cyan");
    applyDamage(dmg, st);
    e.dead = true; e.obj.visible = false;
  } else if (type === "kid") {
    player.speed *= 0.6;
    addShake(0.35);
    audio.crash(false);
    debrisBurst(player.x, player.worldY + 0.6, player.z, 6, [[0.2, 0.5, 0.9]]);
    showAlert("EH, MA TROTTINETTE !", "gold");
    applyDamage(dmg, st);
    e.dead = true; e.obj.visible = false;
  } else if (type === "ballkid") {
    player.speed *= 0.8;
    addShake(0.2);
    audio.beep(320, 0.18, "triangle", 0.12);
    showAlert("LE BALLON !", "gold");
    applyDamage(dmg, st);
    e.dead = true; e.obj.visible = false;
  } else if (type === "cones") {
    player.speed *= 0.85;
    addShake(0.22);
    audio.noiseBurst(0.1, "bandpass", 900, 0.16);
    sparksBurst(worldX(e), 0.4, worldZ(e), 6, { power: 4 });
    showAlert("CÔNES DE CHANTIER !", "gold");
    applyDamage(dmg, st);
    e.dead = true; e.obj.visible = false;
  } else if (type === "girlfriend") {
    player.speed *= 0.45;
    player.stun = 0.5;
    addShake(0.3);
    audio.kiss();
    heartsBurst(worldX(e), 1.8, worldZ(e), 8);
    showAlert("TA COPINE TE RETIENT !", "cyan");
    applyDamage(4, st);
    e.hitCd = 1.5;
  } else if (type === "phone") {
    player.speed *= 0.7;
    player.stun = 0.7;
    addShake(0.5);
    flash("hit", 200);
    audio.crash(false);
    audio.beep(1400, 0.2, "square", 0.12, 300);
    sparksBurst(player.x, player.worldY + 1, player.z, 8, { power: 3 });
    showAlert("TEXTO EN PLEINE TÊTE !");
    applyDamage(dmg, st);
    e.dead = true;
  } else if (type === "puddle") {
    if (player.slip <= 0) {
      player.slip = 0.9;
      player.slipDir = rnd(-1, 1);
      audio.noiseBurst(0.35, "highpass", 1800, 0.2);
      fxSmoke.emit(player.x, 0.1, player.z, 0, 0.4, 0.6, { ttl: 0.7, s0: 1.1, s1: 2.4, r: 0.75, g: 0.85, b: 0.95, a0: 0.4, drag: 0.92 });
      showAlert("FLAQUE ! ÇA GLISSE !", "cyan");
    }
    e.hitCd = 2;
  }
}
function worldX(e) { return entWorld(e).x; }
function worldZ(e) { return entWorld(e).z; }
function collectItem(e, st) {
  e.dead = true;
  e.obj.visible = false;
  st.pickups++;
  audio.pickup();
  if (e.itemKind === "nitro") {
    st.nitro = Math.min(100, st.nitro + 35);
    showPickup("+35 NITRO");
    fxSpark.emit(player.x, player.worldY + 1, player.z, 0, 2, 0, { ttl: 0.5, s0: 0.5, s1: 0.1, r: 0.4, g: 0.85, b: 1, a0: 0.9 });
  } else if (e.itemKind === "coffee") {
    st.timeLeft += 6;
    showPickup("+6 SECONDES");
    audio.beep(700, 0.12, "square", 0.12, 1200);
  } else {
    st.integrity = Math.min(st.integrityMax, st.integrity + 14);
    showPickup("MOTO RÉPARÉE +14");
    audio.repair();
    fxSpark.emit(player.x, player.worldY + 1, player.z, 0, 2, 0, { ttl: 0.5, s0: 0.5, s1: 0.1, r: 0.4, g: 1, b: 0.5, a0: 0.9 });
  }
}
function applyDamage(dmg, st) {
  if (dmg <= 0) return;
  st.integrity = Math.max(0, st.integrity - dmg);
  st.hits++;
  if (st.integrity <= 0 && !st.endSeq) {
    endRace(false, "moto");
  }
}

/* ---------------------------------- HUD ------------------------------------ */
function updateHUD(dt, st) {
  const def = BIKES[save.bike];
  const kmh = Math.round(player.speed * 2.62);
  setText($("hud-speed"), String(kmh));
  setText($("hud-clock"), fmtTime(st.timeLeft));
  const crit = st.timeLeft < 12;
  $("hud-clock").className = crit ? "clock-time crit" : "clock-time";
  setText($("hud-dist"), Math.max(0, Math.round(CFG.TOTAL_DIST - st.distance)) + " m");
  setText($("hud-health-num"), Math.round(st.integrity) + "%");
  setStyle($("hud-nitro"), "width", clamp(st.nitro, 0, 100) + "%");
  const hp = clamp(st.integrity / st.integrityMax, 0, 1);
  const hb = $("hud-health");
  setStyle(hb, "width", (hp * 100) + "%");
  const cls = hp < 0.3 ? "crit" : (hp < 0.55 ? "warn" : "");
  if (hb.className !== cls) hb.className = cls;
  const pr = clamp(st.distance / CFG.TOTAL_DIST, 0, 1);
  setStyle($("hud-progress"), "width", (pr * 100) + "%");
  setText($("hud-mode"), fatherHot ? "PAPA EST LÀ !" : "CAP SUR LE COLLÈGE");
  $("speedlines").className = (input.nitro && st.nitro > 0.5) ? "on" : "";
  const dang = (!st.endSeq && (dad.dist < 13 || hp < 0.28));
  if ($("dmgborder").className !== (dang ? "on" : "")) $("dmgborder").className = dang ? "on" : "";
  if (crit && Math.floor(st.timeLeft) !== st.beeped) {
    st.beeped = Math.floor(st.timeLeft);
    audio.tick();
  }
  if (!st.bannerShown && CFG.TOTAL_DIST - st.distance < 130) {
    st.bannerShown = true;
    const b = $("banner-school");
    b.className = "on";
    setTimeout(() => { b.className = ""; }, 4200);
  }
}

/* ------------------------------- SEQUENCES FIN ------------------------------ */
function endRace(win, reason) {
  const st = gameState;
  if (!st || st.endSeq) return;
  st.endSeq = { t: 0, win: win, reason: reason };
  input.up = input.down = input.left = input.right = input.nitro = false;
  if (win) {
    flash("good", 400);
    audio.fanfare();
    confettiBurst(player.x, player.worldY + 2, player.z, 90);
    setTimeout(() => confettiBurst(player.x, player.worldY + 3, player.z - 6, 60), 420);
    showAlert("PORTES DU COLLÈGE !", "gold", 2400);
  } else {
    flash("hit", 450);
    addShake(1.3);
    if (reason === "time") audio.gong();
    else if (reason === "moto") { audio.crash(true); debrisBurst(player.x, player.worldY + 1, player.z, 18, [[0.3, 0.3, 0.35], [0.9, 0.3, 0.1]]); }
    else { audio.gong(); }
  }
}
function updateEndSeq(dt) {
  const st = gameState, sq = st.endSeq;
  if (sq.shown) return;
  sq.t += dt;
  const slow = sq.win ? 0.7 : 0.28;
  player.speed = damp(player.speed, (sq.win && sq.t < 0.9) ? 10 : 0, 2.8, dt);
  player.z -= player.speed * slow * dt;
  if (player.z < -CFG.TOTAL_DIST - 22) { player.z = -CFG.TOTAL_DIST - 22; player.speed = 0; }
  player.root.position.set(player.x, player.worldY, player.z);
  player.wheelSpin -= (player.speed / 0.52) * slow * dt;
  player.wheels.forEach((w) => { w.rotation.x = player.wheelSpin; });
  if (sq.win) player.rider.rotation.x = damp(player.rider.rotation.x, -0.1, 3, dt);
  addShake(sq.win ? 0.02 : 0.06);
  updateDadEntity(dt * slow, st);
  if (sq.t > (sq.win ? 2.3 : 1.6)) {
    sq.shown = true;
    showEndScreen(sq.win, sq.reason);
  }
}
function showEndScreen(win, reason) {
  const st = gameState;
  save.runs++;
  let isRecord = false;
  if (win) {
    if (save.best == null || st.raceTime < save.best) { save.best = st.raceTime; isRecord = true; }
    if (st.integrity > save.bestHealth) save.bestHealth = st.integrity;
  }
  persistSave();
  $("end-wrap").className = "end-wrap " + (win ? "win" : "lose");
  $("end-kicker").textContent = win ? "COURSE TERMINÉE" : "COURSE TERMINÉE";
  $("end-title").textContent = win ? "A L'HEURE !" : (reason === "time" ? "TROP TARD !" : (reason === "moto" ? "MOTO HS !" : "RATTRAPE !"));
  const descs = {
    win: "Tu franchis le portail du Collège Molière juste avant la sonnerie. Le surveillant hoche la tête. Respect, Sam.",
    time: "La sonnerie a retenti. Tu es encore à trois rues du collège : deux heures de colle samedi, et papa est furax.",
    moto: "Ta moto a rendu l'âme dans un nuage de fumée. Tu termines à pied. Autant dire en retard.",
    dad: "Ton père t'a rattrapé en scooter. Retour à la maison, et cette fois tu prends le bus."
  };
  $("end-desc").textContent = descs[reason] || descs.time;
  $("end-new-rec").classList.toggle("hidden", !isRecord);
  $("end-stat-1").textContent = win ? fmtTime(st.timeLeft) : fmtTime(Math.max(0, st.timeLeft));
  $("end-stat-2").textContent = Math.round(st.integrity) + "%";
  $("end-stat-3").textContent = Math.round(clamp(st.distance, 0, CFG.TOTAL_DIST)) + " m";
  $("end-stat-4").textContent = save.best != null ? fmtTime(save.best) : "--";
  audio.setSiren(0, 0.05);
  $("dmgborder").className = "";
  $("speedlines").className = "";
  setApp(win ? APP.WIN : APP.LOSE);
}

/* --------------------------------- CAMERA ----------------------------------- */
function updateCamera(dt) {
  if (!renderer) return;
  if (app === APP.HOME) {
    camera.position.set(Math.sin(clockT * 0.06) * 7, 15.5, 34);
    camera.lookAt(0, 1.2, -12);
    return;
  }
  const recul = clamp((app === APP.RACE && dad.dist < 28 ? (28 - dad.dist) * 0.95 : 0), 0, 17);
  const baseY = (13.9 + recul * 0.45) * viewZoom;
  const baseZ = (15.1 + recul + (app === APP.MENU ? 7 : 0)) * viewZoom;
  const followX = damp(camera.position.x, player.x * 0.5, 5.2, dt);
  const followY = damp(camera.position.y, baseY + (player.worldY || 0) * 0.32, 4.5, dt);
  const followZ = damp(camera.position.z, player.z + baseZ + 2.2, 5.6, dt);
  camera.position.set(followX, followY, followZ);
  camera.rotation.z = 0;
  camera.lookAt(player.x * 0.72, 1.6 + (player.worldY || 0) * 0.5, player.z - 6);
  if (shake.amp > 0.002) {
    camera.position.x += rnd(-1, 1) * shake.amp * 0.55;
    camera.position.y += rnd(-1, 1) * shake.amp * 0.4;
    camera.rotation.z += rnd(-1, 1) * shake.amp * 0.03;
    shake.amp *= Math.exp(-5.2 * dt);
  } else { shake.amp = 0; }
  const targetFov = 47 + clamp((player.speed || 0) / 42, 0, 1.6) * 6 + (input.nitro && app === APP.RACE ? 5 : 0);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = damp(camera.fov, targetFov, 3.2, dt);
    camera.updateProjectionMatrix();
  }
  if (player.shadow) player.shadow.visible = player.root.visible && app !== APP.HOME;
  if (player.root) player.root.visible = app !== APP.HOME;
}

/* -------------------------------- BOUCLE ------------------------------------ */
function updateParticles(dt) {
  fxSmoke.update(dt); fxSpark.update(dt); fxDebris.update(dt);
}
function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = Math.min((now - last) / 1000, 0.062);
  last = now;
  clockT += rawDt;
  let dt = rawDt;
  if (app === APP.PAUSE) dt = 0;

  if (window.THREE && renderer) {
    if (app === APP.MENU) updateAttract(dt);
    else if (app === APP.RACE || app === APP.COUNTDOWN) updateRace(dt);
    else if ((app === APP.WIN || app === APP.LOSE) && gameState && gameState.endSeq) updateEndSeq(dt);
    if (app !== APP.PAUSE) {
      updateParticles(Math.min(rawDt, 0.04));
      for (let i = 0; i < ambient.length; i++) ambient[i](rawDt);
      if (dirLight) {
        sunTarget.position.set(player.x, 0, player.z - 10);
        dirLight.position.set(player.x + 34, 52, player.z + 8);
      }
      updateCamera(rawDt);
    }
    renderer.render(scene, camera);
  }
}

/* ---------------------------------- UI ------------------------------------- */
function renderShop() {
  const grid = $("shop-grid");
  grid.innerHTML = "";
  BIKES.forEach((b, i) => {
    const card = document.createElement("div");
    card.className = "shop-card" + (save.bike === i ? " selected" : "");
    card.innerHTML =
      '<div class="shop-tag' + (save.bike === i ? ' equipped' : '') + '">' + (save.bike === i ? "ÉQUIPÉE" : "CHOISIR") + "</div>" +
      '<h3>' + b.name + "</h3>" +
      '<div class="bike-visual"><i style="width:70px;height:34px;border-radius:8px;background:linear-gradient(180deg,#' + b.color.toString(16).padStart(6, "0") + ',#' + b.accent.toString(16).padStart(6, "0") + ');box-shadow:0 0 24px rgba(255,255,255,.25)"></i></div>' +
      "<p>" + b.desc + "</p>" +
      '<div class="shop-stats">' +
      statRow("vitesse", b.stats[0]) + statRow("tenue", b.stats[1]) + statRow("nitro", b.stats[2]) +
      "</div>";
    card.addEventListener("click", () => {
      save.bike = i;
      persistSave();
      audio.uiBig();
      renderShop();
      refreshMenuInfo();
    });
    grid.appendChild(card);
  });
  ["PROTO 500 (bientôt)", "FUSÉE DE POCHE (bientôt)"].forEach((name) => {
    const card = document.createElement("div");
    card.className = "shop-card locked";
    card.innerHTML = '<div class="shop-tag soon">À VENIR</div><h3>' + name + '</h3><div class="bike-visual"></div><p>Le mécanicien y travaille. Reviens après quelques courses.</p>';
    grid.appendChild(card);
  });
}
function statRow(label, v) {
  return '<div class="shop-stat"><span>' + label + "</span><div class='bar'><i style='width:" + (clamp(v, 0, 5) / 5 * 100) + "%'></i></div></div>";
}
function setupUI() {
  $("btn-play").addEventListener("click", beginJourney);
  $("btn-new").addEventListener("click", startRace);
  $("btn-load").addEventListener("click", () => { refreshMenuInfo(); openModal("modal-load"); });
  $("btn-shop").addEventListener("click", () => { renderShop(); openModal("modal-shop"); });
  $("btn-quit").addEventListener("click", quitToHome);
  $("btn-shop-close").addEventListener("click", closeModal);
  $("btn-load-close").addEventListener("click", closeModal);
  $("btn-load-confirm").addEventListener("click", startRace);
  $("btn-resume").addEventListener("click", resumeRace);
  $("btn-restart").addEventListener("click", replay);
  $("btn-pause-menu").addEventListener("click", goToMenu);
  $("btn-pause").addEventListener("click", pauseRace);
  $("btn-replay").addEventListener("click", replay);
  $("btn-end-menu").addEventListener("click", goToMenu);
  $("btn-mute").addEventListener("click", () => { audio.setMuted(!save.muted); refreshMuteBtn(); });
  $("screen-home").addEventListener("click", (e) => { if (e.target.id === "screen-home" || e.target.id === "home-shade") beginJourney(); });
  // Visuel d'accueil : image perso, sinon fond genere
  const bg = $("home-bg");
  const probe = new Image();
  probe.onload = () => { bg.style.backgroundImage = "url('" + CFG.HOME_IMAGE + "')"; };
  probe.onerror = () => { bg.style.backgroundImage = "url('" + fallbackSplash() + "')"; };
  probe.src = CFG.HOME_IMAGE;
}
function fallbackSplash() {
  const c = document.createElement("canvas");
  c.width = 1280; c.height = 720;
  const x = c.getContext("2d");
  const sky = x.createLinearGradient(0, 0, 0, 720);
  sky.addColorStop(0, "#0b1230");
  sky.addColorStop(0.45, "#5d2a63");
  sky.addColorStop(0.72, "#d95a2b");
  sky.addColorStop(1, "#ffb020");
  x.fillStyle = sky; x.fillRect(0, 0, 1280, 720);
  x.fillStyle = "#ffe9a8";
  x.beginPath(); x.arc(880, 430, 78, 0, 6.3); x.fill();
  x.fillStyle = "rgba(255,233,168,.25)";
  x.beginPath(); x.arc(880, 430, 150, 0, 6.3); x.fill();
  x.fillStyle = "#120a1e";
  let bx = 0, seed = 7;
  while (bx < 1280) {
    const w = 60 + ((seed * 37) % 90), h = 120 + ((seed * 61) % 240);
    x.fillRect(bx, 560 - h, w, h + 60);
    seed = (seed * 31 + 17) % 997;
    bx += w + 12;
  }
  x.fillStyle = "#1a1026";
  x.beginPath();
  x.moveTo(0, 720); x.lineTo(0, 620); x.lineTo(1280, 470); x.lineTo(1280, 720);
  x.closePath(); x.fill();
  x.strokeStyle = "rgba(255,220,140,.85)"; x.lineWidth = 8;
  x.beginPath(); x.moveTo(520, 700); x.lineTo(690, 545); x.stroke();
  x.beginPath(); x.moveTo(770, 690); x.lineTo(700, 548); x.stroke();
  return c.toDataURL("image/jpeg", 0.9);
}

/* --------------------------------- INIT ------------------------------------ */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  viewZoom = clamp(1.5 / (w / h), 1, 1.55);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
function bootError() {
  const d = document.createElement("div");
  d.id = "boot-error";
  d.innerHTML = "<div><h1>MOTEUR 3D INDISPONIBLE</h1><p>Three.js n'a pas pu etre charge (fichier <b>lib/three.min.js</b> manquant et acces Internet impossible).</p><p>Verifie que le dossier <b>lib</b> est bien a cote de index.html, puis recharge la page.</p></div>";
  document.body.appendChild(d);
}
function init() {
  if (!window.THREE) {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    s.onload = init;
    s.onerror = bootError;
    document.head.appendChild(s);
    return;
  }
  const wrap = $("webgl");
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  wrap.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(47, window.innerWidth / window.innerHeight, 0.5, 900);
  camera.position.set(0, 15.5, 30);
  camera.lookAt(0, 1.4, -10);
  scene.add(worldGroup);
  scene.add(entGroup);

  buildTextures();
  buildSky();
  buildParticles();
  buildWorld();
  buildDad();
  setupUI();
  onResize();
  window.addEventListener("resize", onResize);
  last = performance.now();
  requestAnimationFrame(loop);
  // petit prechauffage de la demo
  setApp(APP.HOME);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
