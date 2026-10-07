"use strict";
/* ============================================================================
   PERSONNAGES — humains stylises articules + chat.
   Les membres sont des meshes fusionnes dont la pose (coude, genou...) est
   calculee depuis les positions des articulations : 1 mesh par membre,
   animation par rotation de l'epaule / de la hanche.
   ============================================================================ */

const _up = new THREE.Vector3(0, 1, 0), _dirV = new THREE.Vector3(), _qa = new THREE.Quaternion();

// Segment (capsule) entre deux points
function limb(gb, a, b, r, color, o) {
  _dirV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _dirV.length();
  if (len < 1e-5) return gb;
  _dirV.normalize();
  _qa.setFromUnitVectors(_up, _dirV);
  const e = new THREE.Euler().setFromQuaternion(_qa, "YXZ");
  const geo = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 4, 10);
  return gb.add(geo, color, Object.assign({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, rx: e.x, ry: e.y, rz: e.z }, o));
}
// vecteur depuis des angles (rx autour de x, rz autour de z) appliques a (0,-L,0)
function armVec(L, rx, rz) {
  // rotation X puis Z : (0,-L,0) -> y = -L cos(rx), z = -L sin(rx)  ; puis Z : x = -y' sin(rz)...
  const y0 = -L * Math.cos(rx), z0 = -L * Math.sin(rx);
  return [-y0 * Math.sin(rz), y0 * Math.cos(rz), z0];
}
const ARM_POSES = {
  down:  { u: [0.05, 0.12], f: [0.35, 0.1] },
  sign:  { u: [2.55, 0.22], f: [3.1, 0.12] },
  fist:  { u: [2.3, 0.3], f: [3.5, 0.2] },
  wave:  { u: [0.2, 2.4], f: [0.2, 2.9] },
  wind:  { u: [-0.9, 0.3], f: [-1.9, 0.2] },
  throwA:{ u: [2.2, 0.15], f: [1.2, 0.1] },
  bars:  { u: [0.85, 0.2], f: [1.55, 0.0] },
  hips:  { u: [0.0, 0.62], f: [0.5, -0.5] },
  hold:  { u: [0.7, 0.2], f: [1.45, -0.1] }
};

// Cree un humain ; renvoie { root, hips, head, armL, armR, legL, legR, set(pose)... }
function buildHuman(spec) {
  spec = Object.assign({
    h: 1, skin: 0xe8b48a, hair: 0x3a2a1c, hairStyle: "short", shirt: 0x2f6fcf, pants: 0x2b3038, shoe: 0xf0f0f0,
    armL: "down", armR: "down", legs: "swing", head: 1.22, backpack: 0, hood: 0, mouth: 0, brow: 0, build: 1
  }, spec);
  const S = spec.h, B = spec.build;
  const H = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.9 * S; H.add(hips);
  const sk = spec.skin;

  // ---- tronc ----
  const T = new GeoBuilder();
  T.rbox(0.34 * B, 0.2, 0.22 * B, 0.07, 0, 0.04, 0, spec.pants);
  T.rbox(0.42 * B, 0.54, 0.25 * B, 0.12, 0, 0.38, 0, spec.shirt);
  T.rbox(0.44 * B, 0.1, 0.27 * B, 0.04, 0, 0.12, 0, shade(spec.shirt, 0.82)); // ourlet
  if (spec.hood) T.sphere(0.13, 0, 0.66, 0.1, shade(spec.shirt, 0.92), { sy: 0.8, ws: 10, hs: 8 });
  if (spec.backpack) {
    T.rbox(0.32, 0.4, 0.17, 0.06, 0, 0.42, 0.21, spec.backpack);
    T.rbox(0.22, 0.14, 0.04, 0.02, 0, 0.3, 0.3, shade(spec.backpack, 0.75));
  }
  const torso = meshOf(T.build(), GFX.mat.cloth);
  hips.add(torso);

  // ---- tete ----
  const head = new THREE.Group(); head.position.set(0, 0.76, 0); hips.add(head);
  const HS = spec.head;
  const Hd = new GeoBuilder();
  Hd.cyl(0.05, 0.055, 0.12, 8, 0, -0.1, 0, sk);
  Hd.sphere(0.135 * HS, 0, 0.08 * HS, 0, sk, { sx: 0.95, sy: 1.04, ws: 16, hs: 12 });
  [-1, 1].forEach((s) => Hd.sphere(0.03, s * 0.128 * HS, 0.06 * HS, 0.01, sk, { ws: 6, hs: 5 }));
  Hd.sphere(0.026, 0, 0.055 * HS, -0.128 * HS, shade(sk, 0.94), { ws: 6, hs: 5 });
  head.add(meshOf(Hd.build(), GFX.mat.skin));
  const F = new GeoBuilder(); // cheveux, yeux, sourcils
  const eyeY = 0.1 * HS, eyeZ = -0.112 * HS;
  [-1, 1].forEach((s) => {
    F.sphere(0.022 * HS, s * 0.05 * HS, eyeY, eyeZ - 0.012, 0xf6f6f6, { ws: 8, hs: 6, sy: 1.15 });
    F.sphere(0.013 * HS, s * 0.05 * HS, eyeY, eyeZ - 0.03, 0x14110f, { ws: 6, hs: 5 });
    F.box(0.06 * HS, 0.012, 0.014, s * 0.05 * HS, eyeY + 0.036 * HS, eyeZ - 0.012, spec.hair, { rz: s * (spec.brow ? -0.38 : 0.05) });
  });
  if (spec.mouth) F.sphere(0.03 * HS, 0, 0.02 * HS, -0.122 * HS, 0x3a0e10, { sy: 0.8, ws: 8, hs: 6 });
  else F.box(0.05 * HS, 0.01, 0.01, 0, 0.026 * HS, -0.128 * HS, 0x9a4a3a);
  const hc = spec.hair;
  switch (spec.hairStyle) {
    case "short": F.sphere(0.142 * HS, 0, 0.1 * HS, 0.02, hc, { sx: 0.98, sy: 0.82, ws: 14, hs: 8 }); break;
    case "long":
      F.sphere(0.145 * HS, 0, 0.1 * HS, 0.02, hc, { sy: 0.84, ws: 14, hs: 8 });
      F.capsule(0.09 * HS, 0.3, 0, -0.1, 0.1, hc, { sz: 0.7 });
      break;
    case "curly": for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; F.sphere(0.06 * HS, Math.cos(a) * 0.1 * HS, 0.15 * HS + (i % 2) * 0.02, Math.sin(a) * 0.1 * HS + 0.02, hc, { ws: 6, hs: 5 }); } F.sphere(0.1 * HS, 0, 0.19 * HS, 0.01, hc, { ws: 8, hs: 6 }); break;
    case "bun": F.sphere(0.142 * HS, 0, 0.1 * HS, 0.02, hc, { sy: 0.82 }); F.sphere(0.07 * HS, 0, 0.24 * HS, 0.04, hc, { ws: 8, hs: 6 }); break;
    case "cap":
      F.sphere(0.145 * HS, 0, 0.11 * HS, 0.01, spec.capColor || 0xc23b2e, { sy: 0.7, ws: 14, hs: 8 });
      F.box(0.2 * HS, 0.02, 0.16 * HS, 0, 0.09 * HS, -0.16 * HS, spec.capColor || 0xc23b2e);
      break;
    case "balding": F.sphere(0.138 * HS, 0, 0.09 * HS, 0.05, hc, { sy: 0.55, sz: 0.7, ws: 12, hs: 6 }); [-1, 1].forEach((s) => F.sphere(0.05 * HS, s * 0.12 * HS, 0.05 * HS, 0.02, hc, { ws: 6, hs: 5 })); break;
    default: break;
  }
  const hairMesh = meshOf(F.build(), GFX.mat.matte);
  head.add(hairMesh);
  // queue de cheval animee
  let tail = null;
  if (spec.ponytail) {
    tail = new THREE.Group(); tail.position.set(0, 0.14 * HS, 0.12 * HS); head.add(tail);
    const P = new GeoBuilder();
    P.capsule(0.05 * HS, 0.26, 0, -0.14, 0.02, hc);
    P.sphere(0.04 * HS, 0, 0, 0, spec.band || 0xff4d8a, { ws: 6, hs: 5 });
    tail.add(meshOf(P.build(), GFX.mat.matte));
  }

  // ---- bras ----
  const mkArm = (pose, side) => {
    const P = ARM_POSES[pose] || ARM_POSES.down;
    const g = new THREE.Group(); g.position.set(side * 0.25 * B, 0.56, 0); hips.add(g);
    const sgn = side;
    const u = armVec(0.26, P.u[0], P.u[1] * sgn);
    const el = u;
    const f = armVec(0.25, P.f[0], P.f[1] * sgn);
    const wr = [el[0] + f[0], el[1] + f[1], el[2] + f[2]];
    const A = new GeoBuilder();
    A.sphere(0.065 * B, 0, 0, 0, spec.shirt, { ws: 8, hs: 6 });
    limb(A, [0, 0, 0], el, 0.053 * B, spec.shirt);
    limb(A, el, wr, 0.045, spec.sleeveBare ? sk : spec.shirt);
    A.sphere(0.05, wr[0], wr[1], wr[2], sk, { ws: 8, hs: 6 });
    const m = meshOf(A.build(), GFX.mat.cloth);
    g.add(m);
    g.userData.pose = pose; g.userData.wrist = wr;
    return g;
  };
  const armL = mkArm(spec.armL, -1), armR = mkArm(spec.armR, 1);

  // ---- jambes ----
  const mkLeg = (side) => {
    const g = new THREE.Group(); g.position.set(side * 0.1 * B, 0, 0); hips.add(g);
    const L = new GeoBuilder();
    const knee = [0, -0.4, -0.02], ank = [0, -0.84, 0.02];
    limb(L, [0, 0, 0], knee, 0.082 * B, spec.pants);
    limb(L, knee, ank, 0.07 * B, spec.pants);
    L.rbox(0.12, 0.09, 0.28, 0.04, 0, -0.865, -0.045, spec.shoe);
    L.rbox(0.125, 0.03, 0.29, 0.015, 0, -0.9, -0.045, 0xe9e9e9);
    g.add(meshOf(L.build(), GFX.mat.cloth));
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  H.scale.setScalar(S);
  return { root: H, hips: hips, head: head, armL: armL, armR: armR, legL: legL, legR: legR, tail: tail, S: S };
}

// Animation de marche/course generique
function animateHuman(h, t, speed, o) {
  o = o || {};
  const k = Math.min(1, speed);
  const w = t * (6 + speed * 4);
  h.legL.rotation.x = Math.sin(w) * 0.9 * k;
  h.legR.rotation.x = -Math.sin(w) * 0.9 * k;
  if (!o.keepArms) {
    h.armL.rotation.x = -Math.sin(w) * 0.8 * k;
    h.armR.rotation.x = Math.sin(w) * 0.8 * k;
  }
  h.hips.position.y = 0.9 * h.S + Math.abs(Math.sin(w)) * 0.05 * k * h.S;
  h.hips.rotation.y = Math.sin(w) * 0.12 * k;
}

/* ----------------------------------- CHAT ----------------------------------- */
function buildCat() {
  const fur = 0xe08a3c, belly = 0xf4dcc0, dark = 0xb05f22;
  const g = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.3; g.add(body);
  const B = new GeoBuilder();
  B.capsule(0.19, 0.34, 0, 0.0, 0.0, fur, { rx: Math.PI / 2, sx: 1.05 });
  B.sphere(0.13, 0, -0.06, -0.05, belly, { sx: 0.9, sy: 0.7, sz: 1.4, ws: 8, hs: 6 });
  for (let i = 0; i < 4; i++) B.box(0.34, 0.025, 0.05, 0, 0.16, -0.18 + i * 0.12, dark, { rx: 0.0 });
  body.add(meshOf(B.build(), GFX.mat.matte));
  const head = new THREE.Group(); head.position.set(0, 0.14, -0.36); body.add(head);
  const Hd = new GeoBuilder();
  Hd.sphere(0.175, 0, 0, 0, fur, { sx: 1.08, sy: 0.92, ws: 14, hs: 10 });
  [-1, 1].forEach((s) => {
    Hd.cone(0.065, 0.13, 4, s * 0.095, 0.15, 0.0, fur, { rz: -s * 0.25, ry: Math.PI / 4 });
    Hd.cone(0.035, 0.08, 4, s * 0.095, 0.145, -0.01, 0xf2b6a8, { rz: -s * 0.25, ry: Math.PI / 4 });
    Hd.sphere(0.034, s * 0.06, 0.03, -0.13, 0xf4f4a0, { ws: 8, hs: 6 });
    Hd.sphere(0.017, s * 0.06, 0.03, -0.158, 0x111111, { sx: 0.5, ws: 6, hs: 5 });
    for (let w = 0; w < 3; w++) Hd.box(0.14, 0.004, 0.004, s * 0.12, -0.03 - w * 0.012, -0.14, 0xffffff, { rz: s * (-0.1 + w * 0.1) });
  });
  Hd.sphere(0.022, 0, -0.01, -0.16, 0xe58a8a, { ws: 6, hs: 5 });
  Hd.box(0.14, 0.03, 0.03, 0, 0.1, -0.12, dark);
  head.add(meshOf(Hd.build(), GFX.mat.matte));
  const tail = new THREE.Group(); tail.position.set(0, 0.0, 0.42); body.add(tail);
  const T = new GeoBuilder();
  let pp = [0, 0.02, 0.0];
  for (let i = 1; i <= 6; i++) {
    const t = i / 6, np = [Math.sin(t * 3.0) * 0.05, 0.02 + t * 0.4, 0.02 + t * 0.18 + Math.sin(t * 2.4) * 0.04];
    limb(T, pp, np, 0.05 - t * 0.012, i % 2 ? fur : dark);
    pp = np;
  }
  T.sphere(0.04, pp[0], pp[1], pp[2], dark, { ws: 7, hs: 6 });
  tail.add(meshOf(T.build(), GFX.mat.matte));
  const legs = [];
  [[-0.11, -0.2], [0.11, -0.2], [-0.11, 0.2], [0.11, 0.2]].forEach((p) => {
    const l = new THREE.Group(); l.position.set(p[0], 0.1, p[1]); body.add(l);
    const L = new GeoBuilder();
    L.capsule(0.055, 0.2, 0, -0.14, 0, fur);
    L.sphere(0.062, 0, -0.3, -0.02, belly, { sz: 1.3, ws: 6, hs: 5 });
    l.add(meshOf(L.build(), GFX.mat.matte));
    legs.push(l);
  });
  return { root: g, body: body, head: head, tail: tail, legs: legs };
}

/* --------------------------- PERSONNAGES DE LA RUE --------------------------- */
const SKINS = [0xf0c7a8, 0xe8b48a, 0xd39a6b, 0xa8744a, 0x7a4f32, 0xf4d3b8];
const HAIRS = [0x2a1c12, 0x4a3020, 0x1a1a1a, 0x7a4a20, 0xb8862e, 0x8a8a90];
const TOPS = [0xc23b2e, 0x2e6fce, 0x2f7f4f, 0xd9a02b, 0x7a4fa0, 0xe8e4da, 0x1f9fa8, 0xe86a3a];
const BOTTOMS = [0x2b3038, 0x3a4660, 0x4a3b2a, 0x1e2530, 0x6a6e78];

function entRoot(g) { return g; }

function makeProtest() {
  const g = new THREE.Group();
  const n = rndInt(3, 5);
  const people = [];
  let sx = -((n - 1) * 1.05) / 2;
  for (let i = 0; i < n; i++) {
    const style = ["short", "long", "curly", "cap", "bun", "short"][rndInt(0, 5)];
    const h = buildHuman({
      h: rnd(0.95, 1.06), skin: pick(SKINS), hair: pick(HAIRS), hairStyle: style, shirt: pick(TOPS), pants: pick(BOTTOMS),
      armL: i % 2 ? "sign" : "fist", armR: i % 2 ? "fist" : "sign", mouth: 1, brow: 1, hood: i % 3 === 0 ? 1 : 0, capColor: pick(TOPS)
    });
    h.root.position.set(sx, 0, rnd(-0.25, 0.25));
    sx += 1.05;
    h.root.rotation.y = Math.PI + rnd(-0.2, 0.2);
    // pancarte
    const signArm = i % 2 ? h.armL : h.armR;
    const sgn = i % 2 ? -1 : 1;
    const wr = signArm.userData.wrist;
    const sign = new THREE.Group();
    sign.position.set(signArm.position.x + wr[0], signArm.position.y + wr[1], wr[2]);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.2, 6), GFX.mat.matte.clone());
    stick.material.vertexColors = false; stick.material.color.set(0x8a6b4a);
    stick.position.y = 0.2; stick.castShadow = true;
    const pb = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.64, 0.035), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, color: 0x888888 }));
    const tex = TEX.protestSigns[rndInt(0, TEX.protestSigns.length - 1)];
    pb.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65, metalness: 0, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.08 });
    pb.position.set(0, 0.88, 0); pb.castShadow = true;
    sign.add(stick, pb);
    sign.rotation.z = rnd(-0.1, 0.1);
    h.hips.add(sign);
    sign.position.set(signArm.position.x + wr[0], signArm.position.y + wr[1] - 0.05, wr[2]);
    h.sign = sign;
    g.add(h.root);
    people.push(h);
  }
  const e = regEnt(g, { type: "protest", level: "LOW", hw: (n * 1.05) / 2 + 0.4, hl: 0.6, hh: 2.05, damage: 13 });
  e.update = (ent, dt, P, t) => {
    people.forEach((h, i) => {
      const ph = t * 5.2 + i * 1.7;
      h.hips.position.y = 0.9 * h.S + Math.abs(Math.sin(ph)) * 0.06;
      h.armL.rotation.x = Math.sin(ph + 1) * 0.28;
      h.armR.rotation.x = Math.sin(ph) * 0.28;
      h.hips.rotation.z = Math.sin(ph * 0.5) * 0.05;
      h.head.rotation.x = -0.12 + Math.sin(ph) * 0.1;
    });
  };
  return e;
}

function makeCat() {
  const c = buildCat();
  const g = c.root;
  // point d'exclamation de surprise
  const ex = new THREE.Sprite(new THREE.SpriteMaterial({ map: textSprite("!", { w: 128, h: 128, fg: "#ffe34d", font: "900 120px 'Arial Black', sans-serif" }), transparent: true, depthTest: false, fog: false }));
  ex.scale.set(0.42, 0.42, 1); ex.position.set(0, 0.95, 0); ex.visible = false; ex.renderOrder = 20;
  g.add(ex);
  const e = regEnt(g, { type: "cat", level: "LOW", hw: 0.4, hl: 0.55, hh: 0.72, damage: 6, dyn: true });
  e.dir = Math.random() < 0.5 ? 1 : -1;
  e.state = "cross"; e.t = 0; e.speed = rnd(4.4, 6.2);
  e.update = (ent, dt, P) => {
    ent.t += dt;
    const body = c.body;
    if (ent.state === "cross") {
      ent.obj.position.x += ent.dir * ent.speed * dt;
      ent.obj.rotation.y = ent.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      const w = ent.t * 18;
      c.legs.forEach((l, i) => { l.rotation.x = Math.sin(w + (i % 2 ? Math.PI : 0) + (i > 1 ? 1.6 : 0)) * 0.9; });
      body.position.y = 0.3 + Math.abs(Math.sin(w)) * 0.06;
      body.rotation.x = Math.sin(w) * 0.08;
      c.tail.rotation.x = -0.6 + Math.sin(w * 0.5) * 0.25;
      ex.visible = Math.abs(ent.obj.position.x - ent.spawnX) < 1.6 && Math.abs(ent.z - P.z) < 40;
      if (Math.abs(ent.obj.position.x - ent.spawnX) > 8.2) { ent.state = "sit"; ent.sitT = 1.6; ex.visible = false; }
    } else if (ent.state === "sit") {
      ent.obj.rotation.y = ent.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      c.legs.forEach((l) => { l.rotation.x = 0; });
      body.rotation.x = -0.5; body.position.y = 0.2;
      c.head.rotation.x = 0.5;
      c.tail.rotation.z = Math.sin(ent.t * 4) * 0.4;
      ent.sitT -= dt;
      if (ent.sitT <= 0) { ent.dead = true; ent.obj.visible = false; }
    }
  };
  e.spawnX = null;
  return e;
}

function makeGirlfriend() {
  const h = buildHuman({
    h: 1.0, skin: 0xf2cbb0, hair: 0x5a2f1c, hairStyle: "long", ponytail: false, shirt: 0xff5c93, pants: 0x3a4a78, shoe: 0xffffff,
    armL: "wave", armR: "hold", mouth: 0, hood: 1, head: 1.24
  });
  const g = h.root;
  // gros coeur au-dessus
  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.19, 0.02), new THREE.MeshStandardMaterial({ color: 0x15181f, roughness: 0.3, metalness: 0.5, emissive: 0x63e7ff, emissiveIntensity: 1.6 }));
  const wrR = h.armR.userData.wrist;
  phone.position.set(h.armR.position.x + wrR[0], h.armR.position.y + wrR[1] + 0.08, wrR[2] - 0.04);
  h.hips.add(phone);
  const e = regEnt(g, { type: "girlfriend", level: "LOW", hw: 0.5, hl: 0.5, hh: 2.0, damage: 0 });
  e.throwT = rnd(0.4, 1.2); e.hasThrown = false;
  e.update = (ent, dt, P, t) => {
    const dx = P.x - ent.x, dz = P.z - ent.z;
    ent.obj.rotation.y = Math.atan2(dx, dz) + Math.PI;
    h.head.rotation.z = Math.sin(t * 2.5) * 0.12;
    h.armL.rotation.z = Math.sin(t * 7) * 0.3;
    h.hips.position.y = 0.9 + Math.abs(Math.sin(t * 3)) * 0.03;
    const distZ = P.z - ent.z;            // > 0 : elle est devant la moto
    ent.throwT -= dt;
    if (!ent.hasThrown && distZ > 6 && distZ < 44) {
      ent.throwT -= dt * 3;
      // armement du bras puis lancer
      const k = clamp(1 - ent.throwT / 1.0, 0, 1);
      h.armR.rotation.x = k < 0.8 ? -k * 1.9 : -1.5 + (k - 0.8) * 20;
      phone.visible = true;
      if (ent.throwT <= 0.15) {
        ent.hasThrown = true;
        phone.visible = false;
        h.armR.rotation.x = 1.4;
        spawnPhone(ent, P);
        audio.kiss();
        heartsBurst(ent.obj.position.x, 1.9, ent.z, 34);
      }
    } else if (ent.hasThrown) h.armR.rotation.x = damp(h.armR.rotation.x, 0.2, 6, dt);
  };
  return e;
}

function makeScooterKid() {
  const g = new THREE.Group();
  const inner = new THREE.Group(); inner.rotation.y = Math.PI; g.add(inner);
  const B = new GeoBuilder();
  const alu = 0xb7bec8;
  B.rbox(0.18, 0.05, 0.85, 0.02, 0, 0.14, 0.05, 0x2e6fce);
  B.cyl(0.02, 0.02, 0.98, 8, 0, 0.64, -0.38, alu, { rx: 0.12 });
  B.cyl(0.018, 0.018, 0.5, 8, 0, 1.11, -0.43, 0x2c2f36, { rz: Math.PI / 2 });
  inner.add(meshOf(B.build(), GFX.mat.metal));
  const wheels = [];
  [-0.45, 0.5].forEach((z) => {
    const W = new GeoBuilder();
    W.cyl(0.11, 0.11, 0.05, 14, 0, 0, 0, 0x1f2126, { rz: Math.PI / 2 });
    W.cyl(0.06, 0.06, 0.055, 10, 0, 0, 0, 0xe8453c, { rz: Math.PI / 2 });
    const w = meshOf(W.build(), GFX.mat.rubber); w.position.set(0, 0.12, z); inner.add(w); wheels.push(w);
  });
  const k = buildHuman({
    h: 0.78, skin: pick(SKINS), hair: pick(HAIRS), hairStyle: "cap", capColor: 0xe8453c, shirt: 0x3d8256, pants: 0x2b3038, shoe: 0xe8453c,
    armL: "bars", armR: "bars", mouth: 1, backpack: 0xf2b630, head: 1.3
  });
  k.root.position.set(0, 0.16, 0.12);
  k.legL.rotation.x = 0.3; k.legR.rotation.x = -0.9;
  k.hips.rotation.x = 0.12;
  inner.add(k.root);
  const e = regEnt(g, { type: "kid", level: "LOW", hw: 0.55, hl: 0.9, hh: 1.9, damage: 4, dyn: true });
  e.t = Math.random() * 5; e.zig = rnd(1.4, 2.6);
  e.update = (ent, dt, P) => {
    ent.t += dt;
    ent.obj.position.x += Math.cos(ent.t * 0.9) * ent.zig * dt;
    ent.obj.position.x = clamp(ent.obj.position.x, -7, 7);
    ent.obj.rotation.y = Math.cos(ent.t * 0.9) * 0.4;
    ent.obj.rotation.z = -Math.cos(ent.t * 0.9) * 0.1;
    wheels.forEach((w) => { w.rotation.x -= dt * 10; });
    k.legR.rotation.x = -0.9 + Math.sin(ent.t * 6) * 0.4;
  };
  return e;
}

function makeBallKid() {
  const g = new THREE.Group();
  const ball = new THREE.Group();
  const bg = new GeoBuilder();
  bg.sphere(0.3, 0, 0, 0, 0xf4f4f4, { ws: 16, hs: 12 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283, b = i % 2 ? 0.7 : -0.5;
    bg.add(new THREE.CircleGeometry(0.1, 5), 0x1b1b1f, { x: Math.cos(a) * 0.29, y: Math.sin(b) * 0.28, z: Math.sin(a) * 0.29, ry: -a + Math.PI / 2, rx: -b });
  }
  const bm = meshOf(bg.build(), GFX.mat.plastic); ball.add(bm);
  ball.position.y = 0.3; g.add(ball);
  const k = buildHuman({
    h: 0.82, skin: pick(SKINS), hair: pick(HAIRS), hairStyle: "curly", shirt: 0xe0a020, pants: 0x2a3a60, shoe: 0xe8453c,
    armL: "fist", armR: "down", mouth: 1, head: 1.3
  });
  g.add(k.root);
  const e = regEnt(g, { type: "ballkid", level: "LOW", hw: 0.75, hl: 0.75, hh: 1.6, damage: 3, dyn: true });
  e.dir = Math.random() < 0.5 ? 1 : -1; e.t = 0;
  e.update = (ent, dt, P) => {
    ent.t += dt;
    ent.obj.position.x += ent.dir * 5.2 * dt;
    k.root.position.x = clamp(-ent.dir * 2.0, -2, 2);
    k.root.rotation.y = ent.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    ball.rotation.z -= ent.dir * dt * 8;
    ball.position.y = 0.3 + Math.abs(Math.sin(ent.t * 8)) * 0.1;
    animateHuman(k, ent.t, 1.4);
    if (Math.abs(ent.obj.position.x) > 8.4) ent.dir *= -1;
  };
  return e;
}

function makeSchoolKids(n) {
  // eleves devant le college (decor)
  const arr = [];
  for (let i = 0; i < n; i++) {
    const girl = Math.random() < 0.5;
    const h = buildHuman({
      h: rnd(0.78, 0.95), skin: pick(SKINS), hair: pick(HAIRS), hairStyle: girl ? pick(["long", "bun", "short"]) : pick(["short", "curly", "cap"]),
      shirt: pick(TOPS), pants: pick(BOTTOMS), shoe: pick([0xffffff, 0x222222, 0xe8453c]), backpack: pick(TOPS),
      armL: pick(["down", "wave", "hips"]), armR: pick(["down", "hips", "fist"]), mouth: Math.random() < 0.4 ? 1 : 0, head: 1.3, capColor: pick(TOPS)
    });
    arr.push(h);
  }
  return arr;
}
