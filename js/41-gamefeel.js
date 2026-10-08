"use strict";
/* ============================================================================
   GAME FEEL — hit-stop, coups de camera, post-traitement reactif (nitro, degats),
   animations de la moto / du pilote / de papa, traces de pneus, phares.
   ============================================================================ */

const feel = {
  hitStop: 0, punch: 0, aberr: 0, tint: 0, nitroK: 0, wheelie: 0, crouch: 0, skidT: 0, lookT: 0,
  dadBubbleT: 0, lastImpact: -9, flashBoost: 0, screenX: 0.5, screenY: 0.7, shakeRoll: 0
};
const _v = new THREE.Vector3();

// niveau : "heavy" (camion), "medium" (manifestants, telephone), "light" (chat, cones...)
function impactFeel(level, wx, wy, wz) {
  const K = { heavy: [0.12, 1.0, 0.006, 0.5], medium: [0.065, 0.55, 0.003, 0.3], light: [0.03, 0.25, 0.0015, 0.14] }[level] || [0.03, 0.2, 0.001, 0.1];
  feel.hitStop = Math.max(feel.hitStop, K[0]);
  feel.punch = Math.max(feel.punch, K[1]);
  feel.aberr = Math.max(feel.aberr, K[2]);
  feel.tint = Math.max(feel.tint, K[3]);
  feel.shakeRoll = (Math.random() < 0.5 ? -1 : 1) * K[1];
  flashGlow(wx != null ? wx : player.x, wy != null ? wy : player.worldY + 0.9, wz != null ? wz : player.z, 1, 0.75, 0.35, 3 + K[1] * 3, 4);
}

function updateFeel(dt, rawDt) {
  feel.punch *= Math.exp(-6.5 * rawDt);
  feel.aberr *= Math.exp(-7 * rawDt);
  feel.tint *= Math.exp(-4.5 * rawDt);
  feel.shakeRoll *= Math.exp(-6 * rawDt);
}

// Positions ecran de la moto -> centre du flou radial et plan net du tilt-shift
function applyPostFx(rawDt) {
  const fx = RENDER.fx, st = gameState;
  const playing = app === APP.RACE || app === APP.COUNTDOWN || app === APP.PAUSE;
  const nitroOn = !!(playing && st && input.nitro && st.nitro > 0.5 && !player.stun);
  feel.nitroK = damp(feel.nitroK, nitroOn && app === APP.RACE ? 1 : 0, nitroOn ? 7 : 4, rawDt);
  _v.set(player.x, (player.worldY || 0) + 0.9, player.z).project(camera);
  feel.screenX = damp(feel.screenX, _v.x * 0.5 + 0.5, 10, rawDt);
  feel.screenY = damp(feel.screenY, _v.y * 0.5 + 0.5, 10, rawDt);
  const spd = clamp((player.speed || 0) / 42, 0, 1.6);
  fx.radial = feel.nitroK * 0.028 + clamp(spd - 0.75, 0, 1) * 0.006;
  fx.aberration = 0.0006 + feel.nitroK * 0.0024 + feel.aberr + clamp(spd - 0.8, 0, 1) * 0.0005;
  fx.cx = feel.screenX; fx.cy = feel.screenY;
  fx.tiltFocus = playing || app === APP.MENU ? clamp(feel.screenY - 0.04, 0.2, 0.55) : 0.4;
  const hp = st ? clamp(st.integrity / st.integrityMax, 0, 1) : 1;
  const danger = playing && st && !st.endSeq && (hp < 0.28 || dad.dist < 10) ? (0.1 + 0.07 * Math.sin(clockT * 7)) : 0;
  fx.tintAmt = clamp(feel.tint + danger, 0, 0.75);
  fx.tint.setRGB(0.9, 0.05, 0.03);
  fx.vignette = 0.32 + feel.nitroK * 0.1 + (hp < 0.4 ? 0.1 : 0);
  fx.exposure = 0.94 + feel.nitroK * 0.05 + feel.punch * 0.05;
  const lost = st && st.endSeq && !st.endSeq.win;
  fx.desat = damp(fx.desat, lost ? 0.65 : 0, 2.5, rawDt);
  fx.bloom = 0.3 + feel.nitroK * 0.12 + (st && st.endSeq && st.endSeq.win ? 0.15 : 0);
}

/* ------------------------------- Phares & lueurs ------------------------------- */
function buildPlayerLights() {
  if (player.headlight) { player.root.remove(player.headlight, player.headlight.target, player.nitroLight); }
  const hl = new THREE.SpotLight(0xfff0d0, 6.5, 46, 0.46, 0.7, 1.4);
  hl.position.set(0, 1.35, -1.6);
  hl.castShadow = false;
  const tg = new THREE.Object3D(); tg.position.set(0, 0, -16);
  player.root.add(hl, tg);
  hl.target = tg;
  const nl = new THREE.PointLight(0x4aa8ff, 0, 9, 2);
  nl.position.set(0, 0.8, 1.3);
  player.root.add(nl);
  player.headlight = hl; player.nitroLight = nl;
}

/* ----------------------------- Animations de la moto ----------------------------- */
function bikePostureFx(dt, nitroActive, st) {
  const def = BIKES[save.bike];
  const sr = clamp(player.speed / def.maxSpeed, 0, 1.4);
  const steer = player.vxDir || 0;
  // cabrage : demarrage nitro a basse vitesse
  const wheelieT = (nitroActive && player.grounded && player.speed < def.maxSpeed * 0.6) ? 0.36 : (player.grounded ? 0 : clamp(player.vy * 0.015, -0.06, 0.12));
  feel.wheelie = damp(feel.wheelie, wheelieT, 5.5, dt);
  const zr = 0.72 * 1.65, th = feel.wheelie;
  player.bike.rotation.x = th;
  player.bike.position.y = 0.01 + zr * Math.sin(th);
  player.bike.position.z = zr * (1 - Math.cos(th));
  // pilote : se couche sur le reservoir quand ca file
  const crouchT = clamp(sr - 0.45, 0, 0.9) * 0.55 + (nitroActive ? 0.28 : 0) - (input.down ? 0.2 : 0);
  feel.crouch = damp(feel.crouch, crouchT, 5, dt);
  player.rider.rotation.x = -feel.crouch * 0.55 - th * 0.4;
  player.rider.rotation.z = damp(player.rider.rotation.z, -steer * 0.1, 6, dt);
  // tete : regarde dans le virage, vers papa quand il est proche
  const lookDad = dad.dist < 14 ? Math.sin(clockT * 3) * 0.5 : 0;
  player.head.rotation.y = damp(player.head.rotation.y, steer * -0.35 + lookDad, 7, dt);
  player.head.rotation.x = damp(player.head.rotation.x, 0.05 + feel.crouch * 0.3, 6, dt);
  // echarpe qui flotte
  player.scarf.rotation.x = -0.15 - sr * 0.55 + Math.sin(clockT * 21) * 0.1 * sr;
  player.scarf.rotation.y = Math.sin(clockT * 13) * 0.18 * sr - steer * 0.3;
  // phares
  if (player.headlight) {
    player.headlight.intensity = 6.5 + feel.nitroK * 2.5;
    player.nitroLight.intensity = feel.nitroK * 14 * (0.8 + Math.random() * 0.4);
  }
}

// Particules d'echappement, flamme nitro, trainee, traces de pneus, ambiance
function bikeFx(dt, st, nitroActive) {
  const def = BIKES[save.bike];
  const sr = clamp(player.speed / def.maxSpeed, 0, 1.5);
  player.bike.updateWorldMatrix(true, true);
  _v.set(player.exhaustPos[0], player.exhaustPos[1], player.exhaustPos[2]);
  player.bike.localToWorld(_v);
  const ex = _v.x, ey = _v.y, ez = _v.z;
  // fumee
  exhaustAcc += dt * (7 + sr * 20);
  while (exhaustAcc > 1) {
    exhaustAcc -= 1;
    smokePuff(ex + rnd(-0.05, 0.05), ey, ez, { s0: rnd(0.12, 0.24), ttl: rnd(0.35, 0.7), a0: 0.26, drag: 0.9 });
  }
  // flamme + etincelles nitro
  if (nitroActive) {
    for (let i = 0; i < 3; i++) {
      fxSpark.emit(ex + rnd(-0.1, 0.1), ey + rnd(-0.08, 0.14), ez + rnd(0, 0.5), rnd(-1.0, 1.0), rnd(-0.3, 0.9), rnd(8, 18), {
        ttl: rnd(0.16, 0.36), s0: rnd(0.3, 0.7), s1: 0.06, stretch: 0.04, r: 0.45, g: 0.8, b: 1, r1: 0.1, g1: 0.35, b1: 1, glow: 6, a0: 0.95, drag: 0.92
      });
    }
    fxGlow.emit(ex, ey, ez + 0.4, 0, 0, 3, { ttl: 0.12, s0: 1.1, s1: 0.5, r: 0.4, g: 0.75, b: 1, glow: 4, a0: 0.8, a1: 0 });
  }
  // flamme (mesh)
  const flame = player.boostFlame;
  const targetOp = nitroActive ? 0.55 + Math.random() * 0.4 : 0;
  flame.material.opacity = damp(flame.material.opacity, targetOp, nitroActive ? 26 : 9, dt);
  const core = flame.userData.core;
  core.material.opacity = flame.material.opacity * 0.9;
  flame.scale.set(rnd(0.85, 1.25), rnd(0.9, 1.45), rnd(0.85, 1.25));
  core.scale.set(rnd(0.85, 1.2), rnd(0.9, 1.3), rnd(0.85, 1.2));
  // trainee lumineuse
  const trailY = ey + 0.02;
  nitroTrail.update(dt, _v.set(ex, trailY, ez + 0.3), nitroActive);
  // traces de pneus : freinage fort et derapages
  const wantSkid = player.grounded && ((input.down && player.speed > 9) || (player.slip > 0 && player.speed > 6));
  feel.skidT -= dt;
  if (wantSkid && feel.skidT <= 0) {
    feel.skidT = 0.035;
    const a = clamp(player.speed / 40, 0.2, 0.55);
    const gy = player.worldY - player.y;
    skids.add(player.x, gy, player.z + 0.2, 0.11, 0.6, a, clockT);
    if (Math.random() < 0.5) smokePuff(player.x, gy + 0.1, player.z + 0.8, { s0: 0.3, a0: 0.28, r: 0.75, g: 0.75, b: 0.78, ttl: 0.6 });
    if (player.speed > 18) sparksBurst(player.x, gy + 0.08, player.z + 0.6, 1, { power: 1.6, glow: 3 });
  }
  skids.update(clockT);
  // etincelles de frottement en cas de gros penche (bords)
  ambientFx(dt, clamp(player.speed / def.maxSpeed, 0, 1.4) * (nitroActive ? 1.25 : 1), player.x, player.z);
}

/* ----------------------------------- Papa ----------------------------------- */
// Bulle de papa : il crie le prenom du pilote choisi ("OSCAAAR !!"), ou "ALLO ?" quand il decroche
const _bubbleTex = {};
function bubbleTexture(text) {
  if (_bubbleTex[text]) return _bubbleTex[text];
  const c = cv(512, 192), x = c.getContext("2d");
  x.fillStyle = "#fff"; x.strokeStyle = "#d62828"; x.lineWidth = 12;
  x.beginPath(); x.moveTo(40, 20); x.lineTo(472, 20); x.quadraticCurveTo(496, 20, 496, 44); x.lineTo(496, 108); x.quadraticCurveTo(496, 132, 472, 132);
  x.lineTo(300, 132); x.lineTo(256, 176); x.lineTo(232, 132); x.lineTo(40, 132); x.quadraticCurveTo(16, 132, 16, 108); x.lineTo(16, 44); x.quadraticCurveTo(16, 20, 40, 20);
  x.fill(); x.stroke();
  x.fillStyle = "#d62828"; x.textAlign = "center"; x.textBaseline = "middle";
  let fs = 74;
  do { x.font = "900 " + fs + "px 'Arial Black', Impact, sans-serif"; fs -= 4; } while (x.measureText(text).width > 450 && fs > 30);
  x.fillText(text, 256, 76);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  _bubbleTex[text] = t;
  return t;
}
function shoutName() {
  const n = curPilot().name;
  // etire la derniere voyelle : OSCAR -> OSCAAAR, YANIS -> YANIIIS
  const m = n.match(/^(.*)([AEIOUY])([^AEIOUY]*)$/);
  return (m ? m[1] + m[2].repeat(3) + m[3] : n) + " !!";
}
function ensureDadBubble() {
  if (!dad.bubble) {
    dad.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(shoutName()), transparent: true, depthTest: false, fog: false, toneMapped: false }));
    dad.bubble.scale.set(3.4, 1.28, 1); dad.bubble.renderOrder = 30; dad.bubble.visible = false;
    worldGroup.add(dad.bubble);
  }
  const tex = bubbleTexture(dad.callT > 0 ? "ALLÔ ?…" : shoutName());
  if (dad.bubble.material.map !== tex) { dad.bubble.material.map = tex; dad.bubble.material.needsUpdate = true; }
}
function dadFx(dt) {
  ensureDadBubble();
  const papa = dad.papa;
  if (papa && papa.robe) papa.robe.rotation.x = -0.1 + Math.sin(clockT * 15) * 0.13 - clamp(dad.speed / 45, 0, 1.2) * 0.5;
  if (papa) {
    papa.armL.rotation.x = Math.sin(clockT * 9) * 0.35;
    papa.head.rotation.z = Math.sin(clockT * 6) * 0.08;
  }
  const near = dad.root.visible && (dad.dist < 18 || dad.callT > 0);
  dad.bubble.visible = near && app === APP.RACE;
  if (dad.bubble.visible) {
    dad.bubble.position.set(dad.root.position.x, 4.6 + Math.sin(clockT * 6) * 0.1, dad.root.position.z);
    const s = 1 + 0.06 * Math.sin(clockT * 9);
    dad.bubble.scale.set(3.4 * s, 1.28 * s, 1);
  }
  if (near && Math.random() < dt * 14) { // vapeur aux oreilles
    smokePuff(dad.root.position.x + rnd(-0.3, 0.3), 3.3, dad.root.position.z + 0.3, { s0: 0.22, r: 1, g: 0.55, b: 0.45, a0: 0.45, ttl: 0.5 });
  }
}
