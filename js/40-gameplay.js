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
  if (kind === "hit" || kind === "boost") return; // gere par le post-traitement (impactFeel)
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
// caracteristiques effectives = moto x pilote
const topSpeed = () => BIKES[save.bike].maxSpeed;     // identique pour toutes les motos et tous les pilotes
const nitroTop = () => BIKES[save.bike].nitroSpeed;
function newState() {
  const hp = BIKE_PERF.health;                    // meme solidite de base pour tous les pilotes
  CFG.TIME_LIMIT = curLevel().time;
  return {
    raceTime: 0, timeLeft: CFG.TIME_LIMIT + curAid().time, integrity: hp, integrityMax: hp,
    nitro: 100, distance: 0, hits: 0, pickups: 0, puddles: 0,
    endSeq: null, bannerShown: false, beeped: 0, finishing: false,
    score: 0, combo: 1, maxCombo: 1, comboT: 0, evT: CFG.EVENT_FIRST + rnd(0, 3), seenCrazy: false,
    power: newPowerState(), evRng: Math.random
  };
}
function resetPlayer() {
  const def = BIKES[save.bike];
  player.x = 0; player.y = 0; player.z = 0; player.vy = 0; player.speed = 0;
  player.vx = 0; player.slip = 0; player.stun = 0; player.lean = 0;
  player.grounded = true; player.wheelSpin = 0; player.worldY = 0;
  player.vxDir = 0; player.dash = 0; player.dashDir = 0; player.airT = 0; player.trickRot = 0;
  feel.slowmo = 0; feel.slowCd = 0;
  dad.callT = 0;
  clearFreeEnts(); hideShield(); resetLevelFx();
  player.boostFlame.material.opacity = 0;
  feel.wheelie = feel.crouch = feel.nitroK = feel.punch = feel.tint = feel.aberr = feel.hitStop = 0;
  if (skids) skids.clear();
  if (nitroTrail) nitroTrail.reset(new THREE.Vector3(0, -99, 0));
  player.bike.rotation.set(0, 0, 0);
  player.root.rotation.set(0, 0, 0);
  dad.dist = CFG.DAD_START; dad.speed = topSpeed() * 0.34; dad.x = 0; dad.z = CFG.DAD_START;
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
  if (player.builtBike !== save.bike || player.builtPilot !== save.pilot) buildPlayer();
  audio.setSiren(0, 0.05);
  closeModal();
  clipDiscard();
  if (save.mode !== "daily" && !levelUnlocked(save.level)) save.level = 0;   // jamais un niveau verrouille
  gameState = newState();
  resetPlayer();
  // defi du jour : meme parcours et memes surprises pour tout le monde ce jour-la
  if (save.mode === "daily") RUN_SEED = (parseInt(todayKey(), 10) * 2654435761) >>> 0; else newRunSeed();
  gameState.evRng = mulberry32(RUN_SEED ^ 0x5bd1e995);
  applyWeather(curLevel().weather);
  rebuildAllChunks(false);
  ghostStart(gameState);
  input.up = input.down = input.left = input.right = input.nitro = false;
  input.jumpQueued = false; input.powerQueued = false;
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
  clearFreeEnts(); hideShield(); ghostHide(); clipStop(); applyWeather("sun");
  setApp(APP.MENU);
}
function quitToHome() {
  audio.ui();
  audio.setSiren(0, 0.05);
  gameState = null;
  clearFreeEnts(); hideShield(); ghostHide(); clipStop(); applyWeather("sun");
  enterHome();
}
// Ecran d'accueil : la scene 3D tourne en direct (moto au ralenti, camera qui orbite)
function enterHome() {
  attract = false;
  dad.root.visible = false;
  if (dad.bubble) dad.bubble.visible = false;
  resetPlayer();
  rebuildAllChunks(true);
  player.x = 0; player.z = 0;
  player.root.position.set(0, 0, 0);
  player.root.visible = true;
  setApp(APP.HOME);
}
function pauseRace() {
  if (app !== APP.RACE) return;
  audio.ui();
  audio.setSiren(0, 0.05);
  audio.setNitro(false);
  audio.setEngine(0, 0, 0);
  input.up = input.down = input.left = input.right = input.nitro = false;
  clipPause(true);
  setApp(APP.PAUSE);
}
function resumeRace() {
  if (app !== APP.PAUSE) return;
  audio.ui(); audio.resume();
  clipPause(false);
  setApp(APP.RACE);
}
function onAppChange(prev, next) {
  if (prev === APP.PAUSE && next !== APP.PAUSE && PHOTO.on) exitPhoto();
  if (next === APP.MENU && prev !== APP.MENU) {
    gameState = null;
    attract = true;
    resetPlayer();
    dad.root.visible = false;
    rebuildAllChunks(true);
    player.z = 0; player.speed = 13;
    camera.position.set(0, 15.5, 30);
  }
  if (next === APP.HOME) attract = false;
}
const inHero = () => app === APP.HOME || (app === APP.MENU && (modal === "modal-shop" || modal === "modal-pilot"));
// decale l'image pour laisser la place au texte (fraction de la largeur)
function setViewShift(f) {
  if (Math.abs(f) < 0.001) { if (camera.view && camera.view.enabled) { camera.clearViewOffset(); } return; }
  const W = RENDER.cssW || window.innerWidth, H = RENDER.cssH || window.innerHeight;
  if (innerWidth / innerHeight < 1.1) f = 0;
  if (f === 0) { if (camera.view && camera.view.enabled) camera.clearViewOffset(); return; }
  camera.setViewOffset(W, H, -W * f, 0, W, H);
}
function updateIdle(dt) {
  player.speed = 0;
  player.root.position.set(player.x, 0, player.z);
  player.shadow.position.set(player.x, 0.015, player.z);
  player.shadow.visible = true;
  player.bike.position.y = 0.01 + Math.sin(clockT * 38) * 0.003;
  player.bike.rotation.set(0, 0, 0);
  player.root.rotation.set(0, 0, 0);
  player.steer.rotation.y = Math.sin(clockT * 0.5) * 0.18;
  player.rider.rotation.x = -0.05 + Math.sin(clockT * 1.7) * 0.012;
  player.head.rotation.y = Math.sin(clockT * 0.45) * 0.55;
  player.head.rotation.x = 0.04;
  player.scarf.rotation.x = -0.12 + Math.sin(clockT * 3) * 0.05;
  if (player.headlight) { player.headlight.intensity = 6.5; player.nitroLight.intensity = 0; }
  player.boostFlame.material.opacity = 0; player.boostFlame.userData.core.material.opacity = 0;
  exhaustAcc += dt * 5;
  while (exhaustAcc > 1) {
    exhaustAcc -= 1;
    player.bike.updateWorldMatrix(true, false);
    _v.set(player.exhaustPos[0], player.exhaustPos[1], player.exhaustPos[2]); player.bike.localToWorld(_v);
    smokePuff(_v.x, _v.y, _v.z, { s0: 0.13, a0: 0.22, ttl: 0.7 });
  }
  ambientFx(dt, 0, player.x, player.z);
}

/* ------------------------------- ATTRACT MODE ------------------------------ */
function updateAttract(dt) {
  if (inHero()) { updateIdle(dt); return; }
  player.z -= 13 * dt;
  player.x = Math.sin(clockT * 0.5) * 2.2;
  player.root.position.set(player.x, 0, player.z);
  player.bike.rotation.z = damp(player.bike.rotation.z, Math.cos(clockT * 0.5) * 0.06, 4, dt);
  player.bike.rotation.x = 0; player.bike.position.y = 0.01; player.bike.position.z = 0;
  player.wheelSpin -= (13 / 0.33 / 1.65) * dt;
  player.wheels.forEach((w) => { w.rotation.x = player.wheelSpin; });
  player.rider.rotation.x = -0.14;
  player.head.rotation.y = damp(player.head.rotation.y, 0, 5, dt);
  player.scarf.rotation.x = -0.15 - 0.3 + Math.sin(clockT * 21) * 0.06;
  player.shadow.position.set(player.x, 0.015, player.z);
  recycleChunks(player.z, true);
  smokeAttract(dt);
}
function smokeAttract(dt) {
  exhaustAcc += dt * 14;
  while (exhaustAcc > 1) {
    exhaustAcc -= 1;
    player.bike.updateWorldMatrix(true, false);
    _v.set(player.exhaustPos[0], player.exhaustPos[1], player.exhaustPos[2]); player.bike.localToWorld(_v);
    smokePuff(_v.x, _v.y, _v.z, { s0: 0.16, a0: 0.25, ttl: 0.5 });
  }
  ambientFx(dt, 0.7, player.x, player.z);
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
    clipStart();
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

  updatePower(dt, st);
  updatePlayer(dt, st);
  updateDadEntity(dt, st);
  updateEnts(dt, st);
  collide(dt, st);
  checkNearMiss(st);
  updateEvents(dt, st);
  ghostUpdate(dt, st);
  updateLevelFx(dt, st);
  recycleChunks(player.z, false);
  exhaustFx(dt, st);
  updateHUD(dt, st);

  if (DBG.god && st.timeLeft < 20) st.timeLeft = 20;
  if (st.timeLeft <= 0 && !st.endSeq) { st.timeLeft = 0; endRace(false, "time"); }
}

/* ------------------------------ PHYSIQUE JOUEUR ----------------------------- */
function nitroOn(st) { return (powerActive("hyper") || (input.nitro && st.nitro > 0.5)) && !(player.stun > 0); }
function updatePlayer(dt, st) {
  const def = BIKES[save.bike];
  const vMax = topSpeed();
  const nitroActive = nitroOn(st);
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
    if (!powerActive("hyper")) st.nitro = Math.max(0, st.nitro - CFG.NITRO_DRAIN * pmod("nitroDrain") * dt);
    if (Math.random() < 0.5) addShake(0.012);
  } else {
    st.nitro = Math.min(100, st.nitro + CFG.NITRO_REGEN * pmod("nitroRegen") * dt);
  }
  audio.setNitro(nitroActive);
  music.setLevel(nitroActive ? 2 : (player.speed > 8 ? 1 : 0));
  // la musique monte quand papa approche et dans les 10 dernieres secondes
  music.setTension(Math.max(clamp(1 - (dad.dist - 5) / 22, 0, 1), st.timeLeft < 10 ? 1 : 0));
  audio.setEngine(player.speed / vMax, throttle, dt);

  const top = nitroActive ? nitroTop() : vMax;
  player.speed = clamp(player.speed, 0, top);
  if (player.stun > 0) player.stun -= dt;
  if (player.slip > 0) player.slip -= dt;

  // Direction laterale
  // FIGURES : en l'air, SAUT maintenu + gauche/droite = la moto tourne sur elle-meme (au lieu de diriger)
  const rawSteer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const tricking = !player.grounded && input.jumpHeld && player.airT > 0.12 && rawSteer !== 0;
  if (tricking) player.trickRot = (player.trickRot || 0) - rawSteer * 10.5 * dt;
  const steer = tricking ? 0 : rawSteer;
  const speedK = 0.5 + 0.5 * Math.min(1, player.speed / vMax);
  const slipK = player.slip > 0 ? 0.32 : 1;
  let targetVx = steer * 13.5 * pmod("steer") * speedK * slipK;
  // AIDE : si on ne tourne pas, la moto s'ecarte toute seule d'un obstacle droit devant
  const assist = curAid().steerAssist;
  if (assist > 0 && !steer && player.speed > 8) targetVx += avoidDir() * 9 * assist;
  if (player.stun > 0) targetVx *= 0.4;
  // tenue de route : plus le pilote est maniable, plus il "accroche" vite sa trajectoire (la pluie la reduit)
  player.vx = damp(player.vx, targetVx, (player.grounded ? 10 * weatherGrip() : 3.2) * Math.min(1.25, pmod("steer")), dt);
  if (player.slip > 0) player.vx += player.slipDir * 7.5 * Math.sin(player.slip * 9) * 0.6;

  let nx = player.x + player.vx * dt;
  if (player.dash > 0) { player.dash -= dt; nx += player.dashDir * 26 * dt; }
  if ((nx > CFG.WALL_X || nx < -CFG.WALL_X) && player.dash > 0) {
    // l'esquive s'arrete net au bord, sans frotter le mur
    nx = Math.sign(nx) * CFG.WALL_X; player.dash = 0; player.vx = 0;
  } else if (nx > CFG.WALL_X || nx < -CFG.WALL_X) {
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
    player.vy = CFG.JUMP_V * Math.sqrt(pmod("jump"));
    player.grounded = false; player.airT = 0;
    audio.jump();
    smokePuff(player.x, 0.1, player.z + 0.6, { s0: 0.5, a0: 0.35 });
  }
  input.jumpQueued = false;
  if (!player.grounded) {
    player.airT += dt;
    player.vy -= CFG.GRAVITY * dt;
    if (nitroActive) player.vy += CFG.GRAVITY * 0.3 * dt * (player.vy > 0 ? 1 : 0.35);
    player.y += player.vy * dt;
    if (player.y <= 0 && player.vy < 0) {
      player.y = 0; player.vy = 0; player.grounded = true;
      landTrick(st);
      audio.land();
      addShake(0.16);
      if (player.airT > 0.55) {
        // reception d'un vrai saut : points (et nitro pour le casse-cou)
        addScore(st, 30, player.airT > 1.1 ? "GROS SAUT !" : "RÉCEPTION !", true);
        st.nitro = Math.min(100, st.nitro + pmod("landNitro"));
      }
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
  const sr = clamp(player.speed / topSpeed(), 0, 1.4);
  player.wheelSpin -= (player.speed / 0.33 / 1.65) * dt;
  player.wheels.forEach((w) => { w.rotation.x = player.wheelSpin; });
  const steer = player.vxDir || 0;
  const leanZ = -steer * (0.25 + sr * 0.28) - (player.slip > 0 ? player.slipDir * 0.42 : 0);
  player.bike.rotation.z = damp(player.bike.rotation.z, clamp(leanZ, -0.75, 0.75), 7, dt);
  player.bike.rotation.y = damp(player.bike.rotation.y, steer * 0.09 + (player.slip > 0 ? player.slipDir * 0.55 : 0), 6, dt);
  const pitch = -0.03 * sr - (player.grounded ? 0 : clamp(player.vy * 0.012, -0.12, 0.12));
  player.root.rotation.x = damp(player.root.rotation.x, pitch, 5, dt);
  player.root.rotation.y = player.grounded ? damp(player.root.rotation.y, 0, 12, dt) : (player.trickRot || 0);
  player.steer.rotation.y = damp(player.steer.rotation.y, -steer * 0.3, 8, dt);
  bikePostureFx(dt, nitroActive, st);
  if (player.stun > 0) {
    player.bike.rotation.z += Math.sin(clockT * 42) * 0.16 * player.stun;
    player.rider.rotation.z += Math.sin(clockT * 50) * 0.2 * player.stun;
  }
  if (st && st.integrity < st.integrityMax * 0.3) {
    if (Math.random() < 0.3) smokePuff(player.x, player.worldY + 0.9, player.z + 0.4, { s0: 0.24, r: 0.2, g: 0.2, b: 0.22, a0: 0.55, ttl: 0.9 });
  }
}
function exhaustFx(dt, st) {
  const nitroActive = nitroOn(st);
  bikeFx(dt, st, nitroActive);
}

/* -------------------------------- POURSUITE --------------------------------- */
function updateDadEntity(dt, st) {
  // Papa ne lache jamais : son rythme de croisiere depasse legerement TA vitesse de pointe (1,02 -> 1,06
  // au fil de la course). A fond sans nitro, il grignote donc toujours du terrain : il faut utiliser la
  // nitro, les tremplins et les pouvoirs pour creuser l'ecart. S'il est distance, il coupe par les petites rues.
  const prog = clamp(st.distance / CFG.TOTAL_DIST, 0, 1);
  let pace = topSpeed() * (lerp(CFG.DAD_PACE, CFG.DAD_PACE_END, prog) - curAid().dadPace);
  if (dad.dist > 40) pace += 3.5;
  // lui aussi est gene par la circulation quand tu ralentis, mais beaucoup moins que toi
  let target = clamp(Math.min(pace, player.speed * 0.8 + pace * 0.2 + 4), CFG.DAD_MIN, pace);
  if (st.raceTime < 4) target = Math.min(target, player.speed * 0.92);   // depart : il enfile son peignoir
  if (dad.callT > 0) { dad.callT -= dt; target = 0; }   // il decroche son telephone (pouvoir de Clothilde)
  dad.speed = damp(dad.speed, target, dad.callT > 0 ? 4 : 2.4, dt);
  dad.dist += (player.speed - dad.speed) * dt;     // distance derriere la moto (m)
  dad.dist = clamp(dad.dist, 0, CFG.DAD_MAX_DIST);
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
  $("hud-dad-bar").classList.toggle("hot", fatherHot);
  audio.setSiren(clamp(1 - (dad.dist - 3) / 36, 0, 1) * 0.85, dt);
  if (dad.dist <= 2.4 && !st.endSeq && !DBG.god) {
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
  const hb = pmod("hitbox");
  const ghost = powerActive("dash");               // ESQUIVE : intouchable
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.dead) continue;
    if (e.type === "item") {
      const w = entWorld(e);
      if (Math.abs(px - w.x) < e.hw + 0.7 && Math.abs(pz - w.z) < e.hl + 1.6 && py < e.hh + 0.4 && py + 1.2 > (e.airY || 0)) {
        collectItem(e, st);
      }
      continue;
    }
    const w = entWorld(e);
    let wy = e.baseY || 0;
    if (e.type === "phone" && !e.landed) wy = e.y;
    const hw = e.hw + 0.55 * hb, hl = e.hl + 1.35;
    const dx = px - w.x, dz = pz - w.z;
    if (Math.abs(dx) > hw || Math.abs(dz) > hl) continue;
    if (py + wy > (e.hh + (wy > 0 ? 0.2 : 0)) && e.level === "LOW") continue;
    if (e.level === "GROUND" && py > 0.28) continue;
    if (ghost && e.type !== "ramp") continue;
    if (e.hitCd > 0) {
      e.hitCd -= dt;
      // seuls les vehicules a l'arret restent des corps solides apres l'impact (jamais une flaque, un chat, une foule...)
      if (e.level === "FULL" && !e.moving) resolveSolid(e, dx, dz, hw, hl, st, true);
      continue;
    }
    if (e.level === "LOW" && powerActive("ram") && e.type !== "girlfriend" && e.type !== "boss") { ramStrike(e, st); continue; }
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
// BELIER (Arthur) : l'obstacle bas est renverse, sans ralentir ni abimer la moto
function ramStrike(e, st) {
  e.hitCd = 1; e.wasHit = true; e.dead = true; e.obj.visible = false;
  const w = entWorld(e);
  debrisBurst(w.x, 1, w.z, 12, [[1, 0.6, 0.1], [0.95, 0.95, 0.95], [0.3, 0.5, 0.9]]);
  sparksBurst(w.x, 0.8, w.z, 8, { power: 6 });
  addShake(0.25); impactFeel("light");
  audio.crash(false);
  addScore(st, 40, "STRIKE !", true);
  st.nitro = Math.min(100, st.nitro + 10);
}
// part du ralentissement reellement subie selon le pilote (Arthur encaisse mieux)
function slowBy(k) { player.speed *= 1 - (1 - k) * pmod("hitSlow"); }
function hitEntity(e, st, dx, dz, hw, hl) {
  const type = e.type;
  let dmg = e.damage || 0;
  e.hitCd = 0.7;
  if (type !== "puddle" && type !== "ramp") e.wasHit = true;
  if (dmg > 0) breakCombo(st);
  if (e.level === "FULL" && powerActive("ram")) dmg = Math.round(dmg * 0.5);
  if (type === "ramp") { hitRamp(e, st); return; }
  if (type === "boss") { hitBoss(e, st, dx); return; }
  if (type === "crazycar" || type === "oncoming") {
    const crazy = type === "crazycar";
    e.hitCd = 2; e.hitPlayer = true;
    slowBy(crazy ? 0.3 : 0.1);
    const side = Math.sign(dx || (player.x > 0 ? 1 : -1));
    player.x = clamp(player.x + side * 1.4, -CFG.WALL_X, CFG.WALL_X);
    player.vx = side * 9;
    player.stun = 0.9;
    if (!crazy) player.z += 2;
    addShake(1.1);
    flash("hit", 240);
    sparksBurst(player.x, player.worldY + 0.7, player.z, 14, { power: 7 });
    debrisBurst(player.x, player.worldY + 0.8, player.z, 12, [[0.9, 0.9, 0.95], [1, 0.3, 0.2]]);
    audio.crash(true);
    impactFeel("heavy", player.x, player.worldY + 0.9, player.z - 0.4);
    showAlert(crazy ? "RENVERSÉ PAR LA VOITURE FOLLE !" : "CHOC À CONTRESENS !");
    applyDamage(dmg, st);
    return;
  }
  if (type === "truck" || type === "bus" || type === "parked") {
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
      impactFeel("heavy", player.x, player.worldY + 0.9, player.z - 0.4);
      showAlert(type === "truck" ? "CRASH DANS LE CAMION SSB !" : (type === "bus" ? "BUS SCOLAIRE PERCUTÉ !" : "VOITURE GARÉE !"));
    } else {
      slowBy(0.35);
      addShake(0.5);
      audio.crash(false);
      sparksBurst(player.x + Math.sign(dx) * 0.5, player.worldY + 0.5, player.z, 8, { power: 5 });
      impactFeel("medium");
      showAlert("FROTTEMENT !", "gold");
    }
    applyDamage(dmg, st);
  } else if (type === "protest") {
    slowBy(0.15);
    player.x += Math.sign(dx || 1) * 0.5;
    addShake(0.55);
    audio.crash(false);
    audio.noiseBurst(0.2, "bandpass", 500, 0.2);
    debrisBurst(player.x, player.worldY + 1, player.z, 8, [[0.9, 0.8, 0.2], [0.95, 0.95, 0.95]]);
    impactFeel("medium", player.x, player.worldY + 1, player.z - 0.5);
    showAlert("BLOQUÉ PAR LES MANIFESTANTS !");
    applyDamage(dmg, st);
  } else if (type === "cat") {
    slowBy(0.82);
    player.slip = 1.1;
    player.slipDir = rnd(-1, 1);
    addShake(0.3);
    audio.meow();
    heartsBurst(player.x, player.worldY + 0.4, player.z, 5);
    impactFeel("light");
    showAlert("MIAOU ! CHAT SURPRIS !", "cyan");
    applyDamage(dmg, st);
    e.dead = true; e.obj.visible = false;
  } else if (type === "kid") {
    slowBy(0.6);
    addShake(0.35);
    audio.crash(false);
    debrisBurst(player.x, player.worldY + 0.6, player.z, 6, [[0.2, 0.5, 0.9]]);
    impactFeel("medium");
    showAlert("EH, MA TROTTINETTE !", "gold");
    applyDamage(dmg, st);
    e.dead = true; e.obj.visible = false;
  } else if (type === "ballkid") {
    slowBy(0.8);
    addShake(0.2);
    audio.beep(320, 0.18, "triangle", 0.12);
    impactFeel("light");
    showAlert("LE BALLON !", "gold");
    applyDamage(dmg, st);
    e.dead = true; e.obj.visible = false;
  } else if (type === "cones") {
    slowBy(0.85);
    addShake(0.22);
    audio.noiseBurst(0.1, "bandpass", 900, 0.16);
    sparksBurst(worldX(e), 0.4, worldZ(e), 6, { power: 4 });
    impactFeel("light");
    showAlert("CÔNES DE CHANTIER !", "gold");
    applyDamage(dmg, st);
    e.dead = true; e.obj.visible = false;
  } else if (type === "girlfriend" && pmod("friend") === true) {
    // Clothilde : sa copine lui tape dans la main et lui donne un coup de boost
    st.nitro = Math.min(100, st.nitro + 25);
    player.speed = Math.min(nitroTop(), player.speed + 6);
    audio.kiss();
    heartsBurst(worldX(e), 1.8, worldZ(e), 8);
    showAlert("CHECK DE LA COPINE ! +25 NITRO", "cyan");
    addScore(st, 50, null, true);
    e.wasHit = false; e.hitCd = 99;
  } else if (type === "girlfriend") {
    breakCombo(st);
    player.speed *= 0.45;
    player.stun = 0.5;
    addShake(0.3);
    audio.kiss();
    heartsBurst(worldX(e), 1.8, worldZ(e), 8);
    impactFeel("light");
    showAlert("TA COPINE TE RETIENT !", "cyan");
    applyDamage(4, st);
    e.hitCd = 1.5;
  } else if (type === "phone") {
    slowBy(0.7);
    player.stun = 0.7;
    addShake(0.5);
    flash("hit", 200);
    audio.crash(false);
    audio.beep(1400, 0.2, "square", 0.12, 300);
    sparksBurst(player.x, player.worldY + 1, player.z, 8, { power: 3 });
    impactFeel("medium", player.x, player.worldY + 1.4, player.z);
    showAlert("TEXTO EN PLEINE TÊTE !");
    applyDamage(dmg, st);
    e.dead = true;
  } else if (type === "puddle") {
    if (player.slip <= 0) {
      st.puddles++;
      player.slip = curLevel().weather === "rain" ? 1.25 : 0.9;
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
  st.score += 25;
  audio.pickup();
  if (e.itemKind === "nitro") {
    st.nitro = Math.min(100, st.nitro + 35);
    showPickup("+35 NITRO");
    fxSpark.emit(player.x, player.worldY + 1, player.z, 0, 2, 0, { ttl: 0.5, s0: 0.5, s1: 0.1, r: 0.4, g: 0.85, b: 1, a0: 0.9 });
  } else if (e.itemKind === "coffee") {
    const sec = pmod("coffee");
    st.timeLeft += sec;
    st.nitro = Math.min(100, st.nitro + pmod("coffeeNitro"));
    showPickup("+" + sec + " SECONDES");
    audio.beep(700, 0.12, "square", 0.12, 1200);
  } else {
    st.integrity = Math.min(st.integrityMax, st.integrity + 14);
    showPickup("MOTO RÉPARÉE +14");
    audio.repair();
    fxSpark.emit(player.x, player.worldY + 1, player.z, 0, 2, 0, { ttl: 0.5, s0: 0.5, s1: 0.1, r: 0.4, g: 1, b: 0.5, a0: 0.9 });
  }
}
function applyDamage(dmg, st) {
  if (dmg <= 0 || DBG.god) return;
  dmg *= pmod("dmg") * curAid().dmg;
  st.integrity = Math.max(0, st.integrity - dmg);
  st.hits++;
  if (pmod("hitNitro")) st.nitro = Math.min(100, st.nitro + pmod("hitNitro"));   // Arthur : la colere le fait foncer
  if (st.integrity <= 0 && !st.endSeq) {
    endRace(false, "moto");
  }
}

/* ---------------------------------- HUD ------------------------------------ */
function updateHUD(dt, st) {
  const kmh = Math.round(player.speed * 2.62);
  setText($("hud-score"), String(st.score + Math.floor(st.distance)));
  setText($("hud-combo"), st.combo > 1 ? "COMBO x" + st.combo : "");
  setText($("hud-speed"), String(kmh));
  setText($("hud-clock"), fmtTime(st.timeLeft));
  const crit = st.timeLeft < 12;
  const clk = $("hud-clock");
  const ccls = crit ? "clock-time crit" : "clock-time";
  if (clk.className !== ccls) clk.className = ccls;
  setText($("hud-dist"), Math.max(0, Math.round(CFG.TOTAL_DIST - st.distance)) + " m");
  setText($("hud-health-num"), Math.round(clamp(st.integrity / st.integrityMax, 0, 1) * 100) + "%");
  // arcs : vitesse (jusqu'a la vitesse nitro) et reserve de nitro
  const sr = clamp(player.speed / nitroTop(), 0, 1);
  setStyle($("hud-speed-arc"), "strokeDashoffset", String(100 - sr * 100));
  setStyle($("hud-nitro-arc"), "strokeDashoffset", String(100 - clamp(st.nitro, 0, 100)));
  setText($("hud-nitro-pct"), String(Math.round(clamp(st.nitro, 0, 100))));
  const hs = $("hud-nitro-arc").parentNode.parentNode;
  hs.classList.toggle("nitro-on", nitroOn(st));
  hs.classList.toggle("nitro-low", st.nitro < 15);
  const hp = clamp(st.integrity / st.integrityMax, 0, 1);
  const hb = $("hud-health");
  setStyle(hb, "width", (hp * 100) + "%");
  const cls = hp < 0.3 ? "crit" : (hp < 0.55 ? "warn" : "");
  if (hb.className !== cls) hb.className = cls;
  const pr = clamp(st.distance / CFG.TOTAL_DIST, 0, 1);
  setStyle($("hud-progress"), "width", (pr * 100) + "%");
  setStyle($("mk-bike"), "left", (pr * 100) + "%");
  setStyle($("mk-dad"), "left", Math.max(0, pr * 100 - (clamp(dad.dist, 0, 55) / 55) * 9) + "%");
  setText($("hud-mode"), dad.callT > 0 ? "PAPA AU TÉLÉPHONE" : (fatherHot ? "PAPA EST LÀ !" : "CAP SUR LE COLLÈGE"));
  $("hud-mode").classList.toggle("hot", fatherHot);
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
    audio.fanfare(); playVoice(["victoire"]);
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
/* --------------------------------- CAMERA ----------------------------------- */
function updateCamera(dt) {
  if (!renderer) return;
  if (DBG.cam) {
    camera.position.set(DBG.cam.p[0], DBG.cam.p[1], DBG.cam.p[2]);
    camera.lookAt(DBG.cam.l[0], DBG.cam.l[1], DBG.cam.l[2]);
    if (camera.fov !== (DBG.cam.fov || 35)) { camera.fov = DBG.cam.fov || 35; camera.updateProjectionMatrix(); }
    return;
  }
  if (inHero()) {
    const t = clockT * 0.11, ang = -0.66 + Math.sin(t) * 0.55, r = 11.2 - Math.sin(t * 0.7) * 0.7, h = 2.1 + Math.sin(t * 0.8) * 0.3;
    camera.position.set(player.x + Math.sin(ang) * r, h, player.z + Math.cos(ang) * r);
    camera.rotation.z = 0;
    camera.lookAt(player.x, 1.0, player.z);
    if (Math.abs(camera.fov - 31) > 0.05) { camera.fov = damp(camera.fov, 31, 4, dt); camera.updateProjectionMatrix(); }
    setViewShift(0.2);
    return;
  }
  setViewShift(app === APP.MENU ? 0.17 : 0);
  const recul = clamp((app === APP.RACE && dad.dist < 28 ? (28 - dad.dist) * 0.45 : 0), 0, 7);
  const spd = clamp((player.speed || 0) / 42, 0, 1.6);
  const baseY = (10.6 + spd * 1.6 + recul * 0.5) * viewZoom;
  const baseZ = (12.2 + spd * 1.6 + recul + (app === APP.MENU ? 6 : 0)) * viewZoom;
  const followX = damp(camera.position.x, player.x * 0.5, 5.2, dt);
  const followY = damp(camera.position.y, baseY + (player.worldY || 0) * 0.32, 4.5, dt);
  const followZ = damp(camera.position.z, player.z + baseZ + 2.0, 5.6, dt);
  camera.position.set(followX, followY, followZ);
  camera.rotation.z = 0;
  camera.lookAt(player.x * 0.72, 1.3 + (player.worldY || 0) * 0.5, player.z - 8.5 - spd * 2);
  camera.rotation.z = -(player.vxDir || 0) * 0.012 * spd + feel.shakeRoll * 0.03;
  if (shake.amp > 0.002) {
    camera.position.x += rnd(-1, 1) * shake.amp * 0.55;
    camera.position.y += rnd(-1, 1) * shake.amp * 0.4;
    camera.rotation.z += rnd(-1, 1) * shake.amp * 0.03;
    shake.amp *= Math.exp(-5.2 * dt);
  } else { shake.amp = 0; }
  const targetFov = 38 + spd * 5 + feel.nitroK * 6 - feel.punch * 3.2;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = damp(camera.fov, targetFov, 3.2, dt);
    camera.updateProjectionMatrix();
  }
  if (player.shadow) player.shadow.visible = player.root.visible;
}

/* -------------------------------- BOUCLE ------------------------------------ */
function updateParticles(dt) {
  fxSmoke.update(dt); fxSpark.update(dt); fxDebris.update(dt);
}
/* Simulation pure (sans rendu) : permet les tests deterministes via MF.debug.advance() */
function simStep(rawDt) {
  if (app !== APP.PAUSE) animClock += rawDt;
  clockT += rawDt;
  let dt = rawDt;
  if (app === APP.PAUSE) dt = 0;
  if (feel.hitStop > 0 && app === APP.RACE) { feel.hitStop -= rawDt; dt *= 0.05; }
  else if (feel.slowmo > 0 && app === APP.RACE) { feel.slowmo -= rawDt; dt *= 0.32; }
  if (!(window.THREE && renderer)) return;
  if (app === APP.MENU || app === APP.HOME) updateAttract(dt);
  else if (app === APP.RACE || app === APP.COUNTDOWN) updateRace(dt);
  else if ((app === APP.WIN || app === APP.LOSE) && gameState && gameState.endSeq) updateEndSeq(dt);
  if (app !== APP.PAUSE) {
    updateParticles(Math.min(rawDt, 0.04));
    updateFeel(dt, rawDt);
    if (app === APP.RACE || app === APP.COUNTDOWN || app === APP.WIN || app === APP.LOSE) dadFx(rawDt);
    for (let i = 0; i < ambient.length; i++) ambient[i](rawDt);
    weatherTick(rawDt);
    updateCamera(rawDt);
  } else if (PHOTO.on) updatePhotoCam();
}
function renderFrame(rawDt) {
  applyPostFx(rawDt);
  photoFx();
  sunFocus.set(player.x, 0, player.z - 14);
  updateSun(sunFocus);
  if (skyMesh) { skyMesh.position.copy(camera.position); skyUniforms.uTime.value = animClock; }
  RENDER.render(scene, camera, app === APP.PAUSE ? 0 : rawDt);
  clipFrame();
  photoAfterRender();
}
const MANUAL = /[?&]manual=1/.test(location.search); // tests : la page ne tourne que sur commande (MF.debug)
function loop(now) {
  requestAnimationFrame(loop);
  if (MANUAL) { last = now; return; }
  const rawDt = Math.min((now - last) / 1000, 0.062);
  last = now;
  if (!(window.THREE && renderer)) return;
  simStep(rawDt);
  RENDER.tick(rawDt * 1000);
  renderFrame(rawDt);
}
const sunFocus = new THREE.Vector3();
let animClock = 0; // horloge d'animation : s'arrete en pause

/* ---------------------------------- UI ------------------------------------- */
function renderShop() {
  const grid = $("shop-grid");
  grid.innerHTML = "";
  const P = curPilot(), stars = pilotStars(P.id);
  BIKES.forEach((b, i) => {
    const locked = stars < (b.stars || 0);
    const card = document.createElement("div");
    card.className = "shop-card" + (save.bike === i ? " selected" : "") + (locked ? " locked" : "");
    const tag = locked ? "★ " + b.stars : (save.bike === i ? "ÉQUIPÉE" : "CHOISIR");
    card.innerHTML =
      '<div class="shop-tag' + (save.bike === i ? ' equipped' : '') + (locked ? ' soon' : '') + '">' + tag + "</div>" +
      '<h3>' + b.name + "</h3>" +
      '<div class="bike-visual"><i style="width:70px;height:34px;border-radius:8px;background:linear-gradient(180deg,#' + b.color.toString(16).padStart(6, "0") + ',#' + b.accent.toString(16).padStart(6, "0") + ');box-shadow:0 0 24px rgba(255,255,255,.25)"></i></div>' +
      "<p>" + b.desc + (locked ? " Il faut " + b.stars + " étoiles à " + P.name + " (" + stars + " pour l'instant)." : "") + "</p>";
    if (!locked) card.addEventListener("click", () => {
      save.bike = i; save.bikes[P.id] = i;
      persistSave();
      audio.uiBig();
      buildPlayer(); player.root.position.set(player.x, 0, player.z); player.root.visible = true;
      renderShop();
      refreshMenuInfo();
    });
    grid.appendChild(card);
  });
}
function statRow(label, v) {
  return '<div class="shop-stat"><span>' + label + "</span><div class='bar'><i style='width:" + (clamp(v, 0, 5) / 5 * 100) + "%'></i></div></div>";
}
function setupUI() {
  $("tag-time").textContent = LEVELS[0].time + " secondes";
  $("btn-play").addEventListener("click", beginJourney);
  $("btn-new").addEventListener("click", openPilotSelect);
  setupMedia();
  $("btn-pilot-go").addEventListener("click", startRace);
  $("btn-pilot-close").addEventListener("click", closeModal);
  const EN = ["doux", "normal", "coupe"], ENN = { doux: "DOUX", normal: "NORMAL", coupe: "COUPÉ" };
  const refreshE = () => { $("btn-engine").innerHTML = "MOTEUR : <b>" + (ENN[save.engine] || "DOUX") + "</b>"; };
  $("btn-engine").addEventListener("click", () => {
    const i = (EN.indexOf(save.engine) + 1) % EN.length;
    audio.setEngineVolume(EN[i]); audio.ui(); refreshE();
  });
  refreshE();
  $("btn-load").addEventListener("click", () => { refreshMenuInfo(); openModal("modal-load"); });
  $("btn-shop").addEventListener("click", () => { renderShop(); openModal("modal-shop"); });
  $("btn-quit").addEventListener("click", quitToHome);
  const QL = ["auto", "high", "medium", "low"], QN = { auto: "AUTO", high: "ÉLEVÉS", medium: "MOYENS", low: "BAS" };
  const refreshQ = () => { $("btn-quality").innerHTML = "GRAPHISMES : <b>" + QN[RENDER.userLevel] + "</b>"; };
  $("btn-quality").addEventListener("click", () => {
    const i = (QL.indexOf(RENDER.userLevel) + 1) % QL.length;
    RENDER.setUserLevel(QL[i]); save.quality = QL[i]; persistSave(); audio.ui(); refreshQ();
  });
  refreshQ();
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
  // Affiche du jeu sur l'accueil : le cadre prend les proportions de l'image des qu'elle existe
  $("home-bg").style.display = "none";
  const poster = $("home-poster"), pimg = $("home-poster-img");
  pimg.onload = () => {
    poster.classList.add("has-image");
    if (pimg.naturalWidth && pimg.naturalHeight) poster.style.aspectRatio = pimg.naturalWidth + " / " + pimg.naturalHeight;
  };
  pimg.onerror = () => poster.classList.remove("has-image");
  pimg.src = CFG.HOME_IMAGE;
}

/* --------------------------------- INIT ------------------------------------ */
function onResize() { RENDER.resize(true); }
function bootError(msg) {
  const ld = $("loading"); if (ld) ld.remove();
  const d = document.createElement("div");
  d.id = "boot-error";
  d.innerHTML = "<div><h1>MOTEUR 3D INDISPONIBLE</h1><p>" + (msg || "Le moteur 3D n'a pas pu etre charge (dossier <b>lib</b> manquant ?).") + "</p></div>";
  document.body.appendChild(d);
}
let bootDone = false;
function init() {
  if (!window.THREE) {
    bootError("Le fichier <b>lib/three.min.js</b> est introuvable : verifie que le dossier <b>lib</b> est bien a cote de index.html.");
    return;
  }
  try {
    RENDER.init($("webgl"), { preserve: /[?&]manual=1/.test(location.search), level: save.quality });
  } catch (err) {
    bootError("Ton navigateur ou ta carte graphique n'a pas pu démarrer WebGL (moteur 3D). Essaie Chrome, Edge ou Firefox à jour, et vérifie que l'accélération matérielle est activée.");
    return;
  }
  renderer = RENDER.renderer;
  RENDER.onResize = (w, h) => {
    viewZoom = clamp(1.45 / (w / h), 1, 2.8);   // garde ~17 m de largeur visible : route + trottoirs
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(47, window.innerWidth / window.innerHeight, 0.5, 900);
  camera.position.set(0, 15.5, 30);
  camera.lookAt(0, 1.4, -10);
  scene.add(worldGroup);
  scene.add(entGroup);

  const steps = [["Matériaux", buildMaterials]]
    .concat(cityTextureSteps())
    .concat([
      ["Bâtiments", buildBuildingPrefabs], ["Mobilier urbain", buildProps], ["Textures", buildSignTextures],
      ["Ciel et lumière", buildSky], ["Effets", buildParticles], ["Ville", buildWorld], ["Poursuivant", buildDad],
      ["Interface", () => { setupUI(); onResize(); }]
    ]);
  const ldFill = $("ld-fill"), ldText = $("ld-text"), ld = $("loading");
  let si = 0;
  const runStep = () => {
    if (si >= steps.length) {
      window.addEventListener("resize", onResize);
      if (window.ResizeObserver) new ResizeObserver(() => onResize()).observe($("webgl"));
      last = performance.now();
      requestAnimationFrame(loop);
      enterHome();
      bootDone = true;
      ld.classList.add("done");
      setTimeout(() => ld.remove(), 700);
      return;
    }
    const st = steps[si];
    ldFill.style.width = Math.round(si / steps.length * 100) + "%";
    ldText.textContent = st[0] + "…";
    setTimeout(() => {
      const t0 = performance.now();
      st[1]();
      if (window.__bootLog) console.log("boot " + st[0] + " " + Math.round(performance.now() - t0) + "ms");
      si++; runStep();
    }, 12);
  };
  runStep();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
