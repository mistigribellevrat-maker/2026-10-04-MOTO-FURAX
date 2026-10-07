"use strict";
/* ============================================================================
   VEHICULES — moto du heros (avec pilote), scooter de papa, camion SSB, bus,
   objets a ramasser, flaques, cones.
   Repere : l'avant est toujours vers -z.
   ============================================================================ */

const player = {
  root: null, bike: null, rider: null, wheels: [], steer: null, shadow: null,
  x: 0, y: 0, z: 0, vy: 0, grounded: true, speed: 0, lean: 0, slip: 0, slipDir: 0,
  stun: 0, integrity: 100, nitro: 100, wheelSpin: 0, bounce: 0, boostFlame: null,
  sputter: 0, head: null, scarf: null, exhaustPos: null, taillight: null
};
const dad = { root: null, x: 0, z: 40, speed: 0, dist: CFG.DAD_START, light: null, warn: 0 };

const _tmpV = new THREE.Vector3();

function makeWheel(R, wd, rimColor, accent, withDisc) {
  const grp = new THREE.Group();
  const T = new GeoBuilder();
  const tp = [[R * 0.6, -wd * 0.5], [R * 0.78, -wd * 0.53], [R * 0.93, -wd * 0.42], [R * 0.995, -wd * 0.2], [R, 0], [R * 0.995, wd * 0.2], [R * 0.93, wd * 0.42], [R * 0.78, wd * 0.53], [R * 0.6, wd * 0.5]];
  T.lathe(tp, 30, 0, 0, 0, 0x1a1b1e, { rz: Math.PI / 2 });
  // sculptures de bande de roulement
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    T.box(wd * 0.8, 0.008, 0.022, 0, Math.cos(a) * R * 0.996, Math.sin(a) * R * 0.996, 0x141518, { rx: a });
  }
  grp.add(meshOf(T.build(), GFX.mat.rubber));
  const M = new GeoBuilder();
  M.cyl(R * 0.62, R * 0.62, wd * 0.7, 28, 0, 0, 0, shade(rimColor, 0.55), { rz: Math.PI / 2 });
  [-1, 1].forEach((s) => M.cyl(R * 0.63, R * 0.63, 0.014, 28, s * wd * 0.4, 0, 0, rimColor, { rz: Math.PI / 2 }));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    [-1, 1].forEach((s) => M.box(0.02, R * 0.52, 0.05, s * wd * 0.36, Math.cos(a) * R * 0.33, Math.sin(a) * R * 0.33, rimColor, { rx: a }));
  }
  M.cyl(R * 0.17, R * 0.17, wd * 1.25, 12, 0, 0, 0, 0x9aa1ab, { rz: Math.PI / 2 });
  grp.add(meshOf(M.build(), GFX.mat.metal));
  if (withDisc) {
    const D = new GeoBuilder();
    D.cyl(R * 0.46, R * 0.46, 0.01, 28, wd * 0.52, 0, 0, 0x8d949e, { rz: Math.PI / 2 });
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; D.cyl(0.018, 0.018, 0.012, 6, wd * 0.52, Math.cos(a) * R * 0.34, Math.sin(a) * R * 0.34, 0x16181c, { rz: Math.PI / 2 }); }
    grp.add(meshOf(D.build(), GFX.mat.chrome));
  }
  return grp;
}

/* -------------------------------- LA MOTO -------------------------------- */
function buildBikeVisual(def) {
  const body = def.color, acc = def.accent;
  const root = new THREE.Group();
  const R = 0.33, ZF = -0.72, ZR = 0.72;
  const bb = new BB();
  const dk = 0x1b1d22, steel = 0x7e858f;
  // --- cadre treillis ---
  [-1, 1].forEach((s) => {
    limb(bb.g("metal"), [s * 0.09, 0.97, -0.42], [s * 0.12, 0.52, 0.34], 0.022, 0x2a2e36);
    limb(bb.g("metal"), [s * 0.09, 0.9, -0.38], [s * 0.1, 0.3, -0.18], 0.02, 0x2a2e36);
    limb(bb.g("metal"), [s * 0.1, 0.3, -0.18], [s * 0.1, 0.34, 0.32], 0.02, 0x2a2e36);
    limb(bb.g("metal"), [s * 0.12, 0.52, 0.34], [s * 0.1, 0.36, 0.34], 0.022, 0x2a2e36);
    // bras oscillant
    bb.g("metal").add(new THREE.BoxGeometry(0.045, 0.07, 0.5), 0x9ea5af, { x: s * 0.115, y: 0.36, z: 0.5, rx: 0.0 });
    // repose-pieds
    bb.g("metal").cyl(0.014, 0.014, 0.16, 6, s * 0.2, 0.36, 0.15, steel, { rz: Math.PI / 2 });
  });
  // --- moteur ---
  bb.g("metal").rbox(0.26, 0.36, 0.4, 0.05, 0, 0.45, 0.0, 0x3a3f48);
  bb.g("metal").rbox(0.22, 0.24, 0.22, 0.04, 0, 0.7, -0.2, 0x2f343c, { rx: -0.35 });
  for (let i = 0; i < 6; i++) bb.g("metal").box(0.25, 0.012, 0.24, 0, 0.6 + i * 0.03, -0.2 + i * (-0.004), 0x484e58, { rx: -0.35 });
  [-1, 1].forEach((s) => {
    bb.g("chrome").cyl(0.085, 0.085, 0.03, 16, s * 0.145, 0.43, 0.0, 0xb9c0cb, { rz: Math.PI / 2 });
    bb.g("matte").cyl(0.04, 0.04, 0.035, 10, s * 0.15, 0.43, 0.0, 0xe2a43a, { rz: Math.PI / 2 });
  });
  // --- echappement ---
  limb(bb.g("chrome"), [0.04, 0.62, -0.3], [0.1, 0.3, -0.34], 0.026, 0xcfd4dc);
  limb(bb.g("chrome"), [0.1, 0.3, -0.34], [0.2, 0.3, 0.1], 0.03, 0xcfd4dc);
  limb(bb.g("chrome"), [0.2, 0.32, 0.1], [0.21, 0.5, 0.88], 0.062, 0xc2c8d2);
  limb(bb.g("metal"), [0.21, 0.49, 0.86], [0.215, 0.515, 0.97], 0.066, 0x24272d);
  // --- reservoir + carrosserie ---
  bb.g("paint").sphere(0.2, 0, 0.94, -0.16, body, { sx: 0.95, sy: 0.7, sz: 1.85, ws: 20, hs: 14 });
  bb.g("paint").sphere(0.205, 0, 0.972, -0.16, acc, { sx: 0.2, sy: 0.6, sz: 1.82, ws: 12, hs: 10 });
  [-1, 1].forEach((s) => {
    bb.g("paint").rbox(0.05, 0.3, 0.5, 0.025, s * 0.17, 0.72, -0.28, body, { rz: -s * 0.12, rx: 0.1 });
    bb.g("paint").rbox(0.04, 0.12, 0.36, 0.02, s * 0.14, 0.52, 0.22, body);
  });
  // selle + coque arriere
  bb.g("matte").rbox(0.29, 0.09, 0.6, 0.04, 0, 0.855, 0.2, 0x17181c);
  bb.g("paint").sphere(0.17, 0, 0.93, 0.66, body, { sx: 0.85, sy: 0.55, sz: 2.0, ws: 16, hs: 10 });
  bb.g("paint").rbox(0.2, 0.05, 0.4, 0.02, 0, 0.84, 0.78, acc);
  bb.g("plastic").box(0.2, 0.12, 0.012, 0, 0.68, 0.99, 0xf0eee6, { rx: -0.3 });
  bb.g("glow").rbox(0.2, 0.04, 0.04, 0.01, 0, 0.93, 1.02, 0xff2a3a);
  bb.g("paint").rbox(0.12, 0.03, 0.34, 0.012, 0, 0.58, 0.9, shade(body, 0.7), { rx: -0.35 });
  // amortisseur central
  bb.g("metal").cyl(0.024, 0.024, 0.34, 8, 0, 0.55, 0.36, acc, { rx: 0.4 });
  bb.g("chrome").cyl(0.014, 0.014, 0.4, 6, 0, 0.55, 0.36, 0xd0d4dc, { rx: 0.4 });
  // chaine + couronne
  bb.g("rubber").box(0.01, 0.014, 0.42, -0.1, 0.37, 0.5, 0x2a2b2e);
  bb.g("metal").cyl(0.1, 0.1, 0.012, 22, -0.095, 0.33, ZR, 0xcfa43a, { rz: Math.PI / 2 });
  root.add(bb.finish());

  // --- roue arriere ---
  const rw = makeWheel(R, 0.2, 0x2a2d34, acc, true);
  rw.position.set(0, R, ZR);
  root.add(rw);

  // --- ensemble direction (tourne) ---
  const steer = new THREE.Group();
  steer.position.set(0, 0.99, -0.43);
  root.add(steer);
  const sb = new BB();
  const SPv = [0, 0, 0];                                 // pivot
  const fa = [0, R - 0.99, ZF + 0.43];                    // axe de roue (relatif)
  [-1, 1].forEach((s) => {
    limb(sb.g("chrome"), [s * 0.09, 0.0, 0], [s * 0.09, -0.34, -0.15], 0.026, 0xd9a93a);       // fourreaux or
    limb(sb.g("metal"), [s * 0.09, -0.32, -0.14], [s * 0.09, fa[1], fa[2]], 0.03, 0x1d2026);   // plongeurs
    sb.g("metal").rbox(0.05, 0.1, 0.07, 0.02, s * 0.09, fa[1] + 0.02, fa[2] + 0.0, 0x9aa1ab);
  });
  sb.g("metal").rbox(0.3, 0.05, 0.1, 0.02, 0, 0.0, -0.01, 0x3a3f48);
  // guidon
  const hb = [0, 0.1, 0.05];
  sb.g("metal").cyl(0.016, 0.016, 0.72, 8, 0, 0.1, 0.03, 0x20232a, { rz: Math.PI / 2 });
  [-1, 1].forEach((s) => {
    sb.g("rubber").cyl(0.022, 0.022, 0.15, 8, s * 0.34, 0.1, 0.03, 0x131417, { rz: Math.PI / 2 });
    sb.g("metal").box(0.015, 0.012, 0.13, s * 0.3, 0.085, -0.05, 0x9aa1ab);
    // retroviseurs
    limb(sb.g("metal"), [s * 0.28, 0.12, 0.0], [s * 0.34, 0.3, -0.04], 0.008, 0x20232a);
    sb.g("paint").rbox(0.1, 0.06, 0.015, 0.01, s * 0.36, 0.33, -0.05, body, { rz: s * -0.2 });
    sb.g("glass").rbox(0.085, 0.048, 0.01, 0.005, s * 0.36, 0.33, -0.06, 0x223344, { rz: s * -0.2 });
  });
  // carenage avant + phare
  sb.g("paint").sphere(0.17, 0, 0.0, -0.2, body, { sx: 0.95, sy: 0.75, sz: 1.0, ws: 16, hs: 12 });
  sb.g("paint").rbox(0.1, 0.16, 0.2, 0.04, 0, 0.1, -0.16, acc, { rx: 0.4 });
  sb.g("glow").rbox(0.16, 0.07, 0.04, 0.025, 0, -0.01, -0.34, 0xfff6dc);
  [-1, 1].forEach((s) => sb.g("glow").rbox(0.05, 0.02, 0.03, 0.01, s * 0.1, 0.07, -0.33, 0xd8f0ff));
  sb.g("glass").add(new THREE.PlaneGeometry(0.26, 0.2), 0x6aa0c8, { x: 0, y: 0.19, z: -0.09, rx: -0.9 });
  // compteur
  sb.g("plastic").rbox(0.13, 0.04, 0.08, 0.015, 0, 0.14, 0.12, 0x1c1e22);
  sb.g("glow").box(0.08, 0.004, 0.05, 0, 0.161, 0.12, 0x7fe9ff);
  // garde-boue avant
  sb.g("paint").add(new THREE.TorusGeometry(R + 0.04, 0.035, 8, 22, 1.75), body, { x: 0, y: R - 0.99, z: ZF + 0.43, ry: Math.PI / 2, rz: 0.0 });
  steer.add(sb.finish());
  const fw = makeWheel(R, 0.18, 0x2a2d34, acc, true);
  fw.position.set(0, fa[1], fa[2]);
  steer.add(fw);

  // flamme nitro
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.3, 3.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.5, 10, 1, true), flameMat);
  flame.rotation.x = Math.PI / 2; // pointe vers +z (arriere)
  flame.position.set(0.215, 0.515, 1.72);
  flame.renderOrder = 7;
  root.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.8, 8, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  core.rotation.x = Math.PI / 2; core.position.set(0.215, 0.515, 1.4); core.renderOrder = 8;
  root.add(core);
  flame.userData.core = core;

  return { root: root, wheels: [fw, rw], steer: steer, flame: flame, exhaust: [0.215, 0.515, 0.98] };
}

/* -------------------------------- LE PILOTE -------------------------------- */
function buildRiderVisual(def) {
  const g = new THREE.Group();
  const jacket = 0x2f5fb8, jacket2 = 0xf2f2f2, jeans = 0x232c40, shoe = 0xf2f2f2, glove = 0x1b1c20, skin = 0xe8b48a;
  const HP = [0, 0.9, 0.3], SH = [0, 1.3, -0.04];
  const cl = new GeoBuilder();
  // tronc penche en avant
  limb(cl, HP, SH, 0.16, jacket);
  limb(cl, [0, 0.98, 0.22], [0, 1.2, 0.04], 0.15, jacket2, { sx: 1.05 });
  cl.sphere(0.12, 0, 1.4, -0.08, jacket, { sy: 0.85, ws: 10, hs: 8 });          // capuche
  cl.sphere(0.15, 0, 0.9, 0.34, jeans, { sx: 1.1, ws: 10, hs: 8 });
  // sac a dos
  cl.rbox(0.3, 0.36, 0.17, 0.07, 0, 1.18, 0.2, 0x2b303a, { rx: 0.55 });
  cl.rbox(0.22, 0.12, 0.05, 0.02, 0, 1.11, 0.3, 0xff8a1f, { rx: 0.55 });
  cl.rbox(0.05, 0.3, 0.02, 0.01, -0.14, 1.28, -0.05, 0x1c1d21, { rx: 0.5 });
  cl.rbox(0.05, 0.3, 0.02, 0.01, 0.14, 1.28, -0.05, 0x1c1d21, { rx: 0.5 });
  // bras vers le guidon
  [-1, 1].forEach((s) => {
    const sh = [s * 0.2, 1.3, -0.04], el = [s * 0.3, 1.1, -0.2], gr = [s * 0.33, 1.1, -0.38];
    cl.sphere(0.07, sh[0], sh[1], sh[2], jacket, { ws: 8, hs: 6 });
    limb(cl, sh, el, 0.058, jacket);
    limb(cl, el, gr, 0.05, jacket2);
    cl.sphere(0.058, gr[0], gr[1], gr[2], glove, { ws: 8, hs: 6 });
    // jambes
    const hp = [s * 0.12, 0.88, 0.32], kn = [s * 0.22, 0.7, -0.1], an = [s * 0.2, 0.4, 0.15];
    limb(cl, hp, kn, 0.09, jeans);
    limb(cl, kn, an, 0.075, jeans);
    cl.rbox(0.11, 0.1, 0.27, 0.04, an[0], 0.37, an[2] - 0.05, shoe);
  });
  g.add(meshOf(cl.build(), GFX.mat.cloth));
  // tete + casque (pivote)
  const head = new THREE.Group(); head.position.set(0, 1.42, -0.1); g.add(head);
  const hb = new GeoBuilder();
  hb.sphere(0.185, 0, 0.04, 0, 0xf4f4f6, { sx: 0.98, sy: 1.0, sz: 1.14, ws: 20, hs: 14 });
  hb.sphere(0.188, 0, 0.1, 0.0, def.color, { sx: 0.2, sy: 0.9, sz: 1.14, ws: 12, hs: 10 });  // bande couleur
  hb.rbox(0.2, 0.09, 0.11, 0.04, 0, -0.1, -0.15, 0x2b2d33);                                  // mentonniere
  head.add(meshOf(hb.build(), GFX.mat.paint));
  const vz = new GeoBuilder();
  vz.sphere(0.176, 0, 0.04, -0.03, 0x0a1822, { sx: 0.9, sy: 0.4, sz: 0.95, ws: 14, hs: 8 });
  const visor = meshOf(vz.build(), GFX.mat.glass); visor.castShadow = false;
  visor.position.set(0, 0.0, -0.07);
  head.add(visor);
  // echarpe / capuche qui flotte
  const scarf = new THREE.Group(); scarf.position.set(0, 1.28, 0.05); g.add(scarf);
  const sg = new GeoBuilder();
  for (let i = 0; i < 5; i++) sg.rbox(0.1 - i * 0.008, 0.035, 0.12, 0.012, 0, 0, 0.1 + i * 0.1, i % 2 ? 0xffffff : 0xe8453c);
  scarf.add(meshOf(sg.build(), GFX.mat.cloth));
  return { root: g, head: head, scarf: scarf };
}

function buildPlayer() {
  const def = BIKES[save.bike] || BIKES[0];
  if (player.root) { worldGroup.remove(player.root); player.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  player.root = new THREE.Group();
  player.bike = new THREE.Group();
  player.bike.scale.setScalar(1.65);
  player.bike.position.y = 0.01;
  player.root.add(player.bike);
  const b = buildBikeVisual(def);
  player.bike.add(b.root);
  player.wheels = b.wheels;
  player.steer = b.steer;
  player.boostFlame = b.flame;
  player.exhaustPos = b.exhaust;
  const r = buildRiderVisual(def);
  const pivot = new THREE.Group();           // pivot a hauteur de hanche : le pilote se couche autour de la selle
  pivot.position.set(0, 0.9, 0.3);
  r.root.position.set(0, -0.9, -0.3);
  pivot.add(r.root);
  player.rider = pivot;
  player.head = r.head;
  player.scarf = r.scarf;
  player.bike.add(pivot);
  player.bike.traverse((o) => { if (o.isMesh) { o.castShadow = o !== b.flame; o.receiveShadow = false; } });
  b.flame.castShadow = false; b.flame.userData.core.castShadow = false;
  player.builtBike = save.bike;
  // ombre de contact douce
  if (!player.shadow) {
    const shTex = canvasTex(128, 128, (x, w, h) => {
      const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.8), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.5, fog: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    sh.rotation.x = -Math.PI / 2;
    player.shadow = sh;
    worldGroup.add(sh);
  }
  worldGroup.add(player.root);
  player.root.position.set(player.x || 0, 0, player.z || 0);
  buildPlayerLights();
}

/* ---------------------------- PAPA SUR SON SCOOTER ---------------------------- */
function buildDad() {
  if (dad.root) worldGroup.remove(dad.root);
  const g = new THREE.Group();
  const scooter = new THREE.Group();
  const mint = 0x6fcfb4, cream = 0xf4ecd6;
  const bb = new BB();
  bb.g("paint").rbox(0.5, 0.16, 1.3, 0.06, 0, 0.36, 0.0, cream, { ao: 0.2 });                       // plancher
  bb.g("paint").add(new THREE.CapsuleGeometry(0.26, 0.5, 5, 14), mint, { x: 0, y: 0.78, z: 0.5, rx: Math.PI / 2, sx: 1.0, sy: 1.0, sz: 1.25 }); // carter
  bb.g("paint").rbox(0.56, 0.9, 0.12, 0.05, 0, 0.74, -0.52, mint, { rx: 0.28 });                       // tablier
  bb.g("paint").rbox(0.28, 0.12, 0.3, 0.05, 0, 0.4, -0.55, cream);
  bb.g("matte").rbox(0.34, 0.1, 0.62, 0.04, 0, 1.0, 0.2, 0x3a2418);                                  // selle
  bb.g("metal").cyl(0.025, 0.025, 0.7, 8, 0, 1.2, -0.62, 0xd0d5dd, { rx: 0.2 });
  bb.g("metal").cyl(0.02, 0.02, 0.72, 8, 0, 1.52, -0.7, 0xd0d5dd, { rz: Math.PI / 2 });
  bb.g("paint").sphere(0.13, 0, 1.52, -0.78, mint, { sz: 0.9, ws: 12, hs: 10 });
  bb.g("glow").sphere(0.1, 0, 1.52, -0.87, 0xfff4cf, { sz: 0.5, ws: 10, hs: 8 });
  bb.g("chrome").sphere(0.045, 0.34, 1.52, -0.66, 0xdde2ea, { ws: 8, hs: 6 });
  bb.g("chrome").cyl(0.035, 0.035, 0.1, 8, -0.38, 1.52, -0.66, 0xdde2ea, { rz: Math.PI / 2 });
  bb.g("metal").rbox(0.5, 0.05, 0.05, 0.02, 0, 0.48, 0.0, 0xdde2ea);
  bb.g("paint").rbox(0.34, 0.06, 0.4, 0.03, 0, 1.32, 1.0, mint);                                       // porte-bagages
  bb.g("glow").rbox(0.18, 0.06, 0.04, 0.02, 0, 0.95, 0.99, 0xff2a3a);
  scooter.add(bb.finish());
  const mkw = () => {
    const w = new THREE.Group();
    const T = new GeoBuilder();
    T.lathe([[0.1, -0.08], [0.2, -0.09], [0.26, -0.06], [0.28, 0], [0.26, 0.06], [0.2, 0.09], [0.1, 0.08]], 20, 0, 0, 0, 0x18191c, { rz: Math.PI / 2 });
    w.add(meshOf(T.build(), GFX.mat.rubber));
    const R = new GeoBuilder();
    R.cyl(0.19, 0.19, 0.17, 18, 0, 0, 0, mint, { rz: Math.PI / 2 });
    R.cyl(0.07, 0.07, 0.19, 10, 0, 0, 0, 0xdde2ea, { rz: Math.PI / 2 });
    w.add(meshOf(R.build(), GFX.mat.paint));
    return w;
  };
  const w1 = mkw(); w1.position.set(0, 0.28, -0.78); scooter.add(w1);
  const w2 = mkw(); w2.position.set(0, 0.28, 0.74); scooter.add(w2);
  g.add(scooter);

  // papa en peignoir
  const papa = buildHuman({
    h: 1.0, skin: 0xe0957a, hair: 0x8a8a90, hairStyle: "balding", shirt: 0x8a2b3a, pants: 0x4a6aa8, shoe: 0xe56f8a,
    armL: "fist", armR: "bars", mouth: 1, brow: 1, head: 1.3, build: 1.12
  });
  papa.root.position.set(0, 0.2, 0.16);
  papa.hips.rotation.x = -0.42;
  papa.legL.rotation.x = 1.2; papa.legR.rotation.x = 1.2;
  papa.legL.rotation.z = 0.08; papa.legR.rotation.z = -0.08;
  g.add(papa.root);
  // pans du peignoir : flottent derriere la selle
  const robe = new THREE.Group(); robe.position.set(0, 1.0, 0.36); papa.root.add(robe);
  const rg = new GeoBuilder();
  for (let i = 0; i < 4; i++) rg.rbox(0.46 + i * 0.05, 0.05, 0.2, 0.02, 0, -i * 0.02, 0.05 + i * 0.19, i % 2 ? 0x7a2432 : 0x8a2b3a);
  rg.rbox(0.5, 0.3, 0.06, 0.02, 0, -0.1, -0.02, 0x8a2b3a);
  robe.add(meshOf(rg.build(), GFX.mat.cloth));
  papa.robe = robe;
  // gyrophare
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xffa020, emissiveIntensity: 1.2, roughness: 0.3 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), lampMat);
  lamp.position.set(0, 1.5, 1.0);
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x25272c, roughness: 0.5 }));
  lampBase.position.set(0, 1.42, 1.0);
  g.add(lamp, lampBase);
  dad.light = lamp;
  dad.scooter = scooter; dad.papa = papa; dad.w1 = w1; dad.w2 = w2;
  dad.root = g;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.scale.setScalar(1.15);
  worldGroup.add(g);
}

/* ------------------------------- CAMION SSB ------------------------------- */
function paintSSBTextures() {
  const rear = cv(512, 512), rx = rear.getContext("2d");
  rx.fillStyle = "#f4f6fa"; rx.fillRect(0, 0, 512, 512);
  rx.fillStyle = "#e6e9ef"; rx.fillRect(255, 0, 3, 512);
  const g = rx.createLinearGradient(0, 0, 512, 0); g.addColorStop(0, "#0a1a3a"); g.addColorStop(1, "#1b4fa8");
  rx.fillStyle = g; rx.fillRect(18, 90, 476, 250);
  rx.fillStyle = "#fff"; rx.font = "900 190px 'Arial Black', Impact, sans-serif"; rx.textAlign = "center"; rx.textBaseline = "alphabetic";
  rx.fillText("SSB", 256, 268);
  rx.fillStyle = "#ff2e4d"; rx.fillRect(18, 300, 476, 14);
  rx.fillStyle = "#9fc3ff"; rx.font = "700 36px Rajdhani, Arial, sans-serif"; rx.fillText("SPEED  STYLE  BOYS", 256, 336 - 30 + 30);
  rx.fillStyle = "#d33"; rx.fillRect(18, 400, 80, 40); rx.fillStyle = "#fff"; rx.font = "700 22px Arial"; rx.fillText("STOP", 58, 428);
  for (let i = 0; i < 22; i++) { rx.fillStyle = i % 2 ? "#ff2e4d" : "#ffffff"; rx.fillRect(18 + i * 21.6, 470, 21.6, 22); }
  const side = cv(1024, 512), sx = side.getContext("2d");
  sx.fillStyle = "#f4f6fa"; sx.fillRect(0, 0, 1024, 512);
  const g2 = sx.createLinearGradient(0, 0, 1024, 0); g2.addColorStop(0, "#0a1a3a"); g2.addColorStop(1, "#1b4fa8");
  sx.fillStyle = g2; sx.fillRect(0, 70, 1024, 290);
  sx.fillStyle = "#ff2e4d"; sx.beginPath(); sx.moveTo(0, 340); sx.lineTo(760, 340); sx.lineTo(700, 400); sx.lineTo(0, 400); sx.fill();
  sx.fillStyle = "#fff"; sx.font = "900 250px 'Arial Black', Impact, sans-serif"; sx.textAlign = "left"; sx.fillText("SSB", 40, 300);
  sx.font = "700 62px Rajdhani, Arial, sans-serif"; sx.fillStyle = "#9fc3ff"; sx.fillText("SPEED STYLE BOYS", 520, 190);
  sx.fillStyle = "#ffd23f"; sx.font = "700 48px Rajdhani, Arial, sans-serif"; sx.fillText("L'énergie qui ne dort jamais", 520, 262);
  sx.fillStyle = "#1ec8ff"; sx.beginPath(); sx.roundRect ? sx.roundRect(880, 96, 110, 230, 30) : sx.rect(880, 96, 110, 230); sx.fill();
  sx.fillStyle = "#fff"; sx.fillRect(880, 180, 110, 70);
  sx.fillStyle = "#0a1a3a"; sx.font = "900 46px 'Arial Black'"; sx.textAlign = "center"; sx.fillText("SSB", 935, 232);
  const mk = (c) => { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; };
  GFX.tex.ssbRear = mk(rear); GFX.tex.ssbSide = mk(side);
}

function buildTruckProto() {
  if (!GFX.tex.ssbRear) paintSSBTextures();
  const g = new THREE.Group();
  const navy = 0x0c1f48, white = 0xf4f6fa;
  const bb = new BB();
  // chassis + remorque
  bb.g("matte").box(2.7, 0.3, 8.4, 0, 0.62, 0.3, 0x15171b);
  bb.g("paint").rbox(3.2, 3.2, 6.6, 0.12, 0, 2.5, 1.55, white, { ao: 0.25 });
  bb.g("paint").rbox(3.22, 0.1, 6.64, 0.04, 0, 4.1, 1.55, shade(white, 0.9));
  // bas de caisse + garde-boue
  bb.g("plastic").box(3.1, 0.22, 6.2, 0, 0.92, 1.6, 0x1b1d22);
  [-1, 1].forEach((s) => { for (let k = 0; k < 2; k++) {
    bb.g("plastic").box(0.06, 0.4, 0.5, s * 1.45, 0.75, 2.4 + k * 1.2, 0x15161a);
  } });
  // cabine
  bb.g("paint").rbox(2.7, 1.5, 2.5, 0.2, 0, 1.55, -3.0, navy, { ao: 0.2 });
  bb.g("paint").extrude([[-1.2, 0], [1.25, 0], [1.25, 1.5], [0.7, 1.95], [-1.2, 1.95]], 2.6, 0.16, 0, 2.0, -3.15, navy, { ry: Math.PI / 2 });
  bb.g("glass").add(new THREE.PlaneGeometry(2.3, 1.15), 0x142636, { x: 0, y: 3.25, z: -4.42, ry: Math.PI, rx: -0.02 });
  [-1, 1].forEach((s) => {
    bb.g("glass").add(new THREE.PlaneGeometry(1.4, 0.85), 0x142636, { x: s * 1.352, y: 3.3, z: -3.25, ry: s * Math.PI / 2 });
    bb.g("metal").box(0.05, 0.9, 0.35, s * 1.52, 2.9, -4.2, 0x23262b);
    bb.g("paint").rbox(0.14, 0.5, 0.26, 0.05, s * 1.56, 3.0, -4.2, 0x23262b);
    bb.g("glass").rbox(0.02, 0.4, 0.2, 0.01, s * 1.485, 3.0, -4.2, 0x2a3c50);
  });
  bb.g("paint").extrude([[0, 0], [2.0, 0], [1.2, 0.8], [0, 0.8]], 2.4, 0.06, 0, 4.0, -2.5, shade(navy, 1.15), { ry: Math.PI / 2 });
  // face avant
  bb.g("paint").rbox(2.6, 0.9, 0.2, 0.06, 0, 1.45, -4.38, shade(navy, 1.3));
  for (let k = 0; k < 6; k++) bb.g("chrome").box(2.0, 0.045, 0.06, 0, 1.1 + k * 0.13, -4.5, 0xdfe4ec);
  bb.g("chrome").rbox(2.8, 0.3, 0.3, 0.1, 0, 0.78, -4.5, 0xcfd4dc);
  [-1, 1].forEach((s) => {
    bb.g("glow").rbox(0.5, 0.26, 0.08, 0.04, s * 0.95, 1.6, -4.48, 0xfff2cf);
    bb.g("glow").box(0.18, 0.1, 0.05, s * 1.2, 1.15, -4.5, 0xffb020);
  });
  // feux de gabarit + gyro hazard
  for (let k = 0; k < 5; k++) bb.g("glow").box(0.14, 0.07, 0.06, -0.6 + k * 0.3, 4.1, -4.1, 0xffb020);
  // tuyaux d'echappement verticaux + reservoirs
  [-1, 1].forEach((s) => {
    bb.g("chrome").cyl(0.1, 0.1, 3.2, 12, s * 1.5, 2.3, -1.85, 0xd6dbe3);
    bb.g("chrome").cyl(0.16, 0.16, 1.2, 14, s * 1.52, 0.95, -0.8, 0xc7ccd5, { rx: Math.PI / 2 });
  });
  // arriere : bandes + pare-chocs + feux
  bb.g("metal").box(3.1, 0.2, 0.22, 0, 0.85, 4.95, 0x2a2d33);
  [-1, 1].forEach((s) => {
    bb.g("glow").rbox(0.22, 0.4, 0.06, 0.03, s * 1.35, 1.35, 4.88, 0xff2a3a);
    bb.g("glow").rbox(0.2, 0.14, 0.06, 0.03, s * 1.35, 1.75, 4.88, 0xffa020);
  });
  bb.g("plastic").box(0.5, 0.14, 0.01, 0, 1.2, 4.88, 0xf4f2ea);
  const body = bb.finish();
  g.add(body);
  // decors vinyle
  const rearMat = new THREE.MeshStandardMaterial({ map: GFX.tex.ssbRear, roughness: 0.5, metalness: 0.08, polygonOffset: true, polygonOffsetFactor: -2 });
  const sideMat = new THREE.MeshStandardMaterial({ map: GFX.tex.ssbSide, roughness: 0.5, metalness: 0.08, polygonOffset: true, polygonOffsetFactor: -2 });
  const rp = new THREE.Mesh(new THREE.PlaneGeometry(3.15, 3.15), rearMat); rp.position.set(0, 2.5, 4.87); g.add(rp);
  [-1, 1].forEach((s) => { const sp = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 3.15), sideMat); sp.position.set(s * 1.612, 2.5, 1.55); sp.rotation.y = s * Math.PI / 2; g.add(sp); });
  // roues
  const wheels = [];
  [[-1.45, -3.0], [1.45, -3.0], [-1.45, 2.0], [1.45, 2.0], [-1.45, 3.1], [1.45, 3.1]].forEach((p) => {
    const w = new THREE.Group();
    const T = new GeoBuilder();
    T.lathe([[0.32, -0.2], [0.5, -0.22], [0.6, -0.16], [0.64, 0], [0.6, 0.16], [0.5, 0.22], [0.32, 0.2]], 22, 0, 0, 0, 0x191a1d, { rz: Math.PI / 2 });
    w.add(meshOf(T.build(), GFX.mat.rubber));
    const R = new GeoBuilder();
    R.cyl(0.34, 0.34, 0.42, 16, 0, 0, 0, 0xb0b6c0, { rz: Math.PI / 2 });
    R.cyl(0.18, 0.18, 0.46, 10, 0, 0, 0, 0x7a808a, { rz: Math.PI / 2 });
    w.add(meshOf(R.build(), GFX.mat.metal));
    w.position.set(p[0], 0.64, p[1]);
    g.add(w); wheels.push(w);
  });
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.castShadow !== false; });
  g.userData.wheels = wheels;
  // clignotants (hazard)
  const hz = new THREE.Group();
  const hzM = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.2), toneMapped: false, fog: true });
  [[-1.5, 1.05, 4.9], [1.5, 1.05, 4.9], [-1.62, 1.35, -3.9], [1.62, 1.35, -3.9]].forEach((p) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), hzM); m.position.set(p[0], p[1], p[2]); hz.add(m); });
  g.add(hz);
  g.userData.hazard = hzM;
  return g;
}

function makeTruck() {
  if (!PROP.truck) PROP.truck = buildTruckProto();
  const g = PROP.truck.clone(true);
  const hzM = PROP.truck.userData.hazard;
  const e = regEnt(g, { type: "truck", level: "FULL", hw: 1.9, hl: 4.2, hh: 4.2, damage: 34 });
  e.hornTimer = rnd(0, 2);
  e.update = (ent, dt, P, t) => {
    ent.hornTimer += dt;
    if (ent.hornTimer > 2.1 && Math.abs(ent.z - P.z) < 34 && Math.abs(ent.x - P.x) < 4 && ent.z < P.z) {
      ent.hornTimer = 0;
      audio.horn();
    }
    const on = Math.floor(t * 2.5) % 2;
    hzM.color.setRGB(on ? 4 : 0.25, on ? 2.2 : 0.12, on ? 0.2 : 0.02);
    if (ent.z - P.z < 70 && ent.z - P.z > -10 && Math.random() < dt * 3) smokePuff(ent.x + 1.5, 4.0, ent.z - 1.85, { s0: 0.3, a0: 0.3, r: 0.4, g: 0.4, b: 0.42, ttl: 0.9 });
  };
  return e;
}

/* ----------------------------------- BUS ----------------------------------- */
function buildBusProto() {
  const g = new THREE.Group();
  const yellow = 0xf0b020;
  const bb = new BB();
  bb.g("paint").rbox(2.6, 2.5, 8.4, 0.25, 0, 1.95, 0.55, yellow, { ao: 0.3 });
  bb.g("paint").rbox(2.4, 1.2, 1.7, 0.2, 0, 1.2, -4.0, yellow, { ao: 0.2 });
  bb.g("matte").box(2.62, 0.18, 8.2, 0, 1.6, 0.55, 0x17181c);          // bande noire
  bb.g("matte").box(2.62, 0.14, 8.2, 0, 2.95, 0.55, 0x17181c);
  [-1, 1].forEach((s) => {
    for (let i = -3; i <= 3; i++) bb.g("glass").rbox(0.03, 0.9, 0.95, 0.03, s * 1.31, 2.35, 0.55 + i * 1.1, 0x142636);
    bb.g("glow").rbox(0.3, 0.2, 0.08, 0.03, s * 0.8, 1.1, -4.9, 0xfff2cf);
    bb.g("glow").rbox(0.2, 0.18, 0.06, 0.03, s * 1.1, 2.9, 4.78, 0xff7a20);
    bb.g("glow").rbox(0.2, 0.16, 0.06, 0.03, s * 1.1, 1.1, 4.78, 0xff2a3a);
  });
  bb.g("glass").rbox(2.3, 1.1, 0.04, 0.03, 0, 2.38, -3.46, 0x142636, { rx: -0.1 });
  bb.g("glass").rbox(2.0, 0.9, 0.04, 0.03, 0, 2.38, 4.78, 0x142636);
  bb.g("chrome").rbox(2.5, 0.2, 0.2, 0.06, 0, 0.62, -4.9, 0xd5dae2);
  bb.g("matte").rbox(0.9, 0.3, 0.05, 0.02, 0, 3.4, -3.4, 0xffe08a);
  bb.g("paint").add(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 8), 0xd22b2b, { x: -1.5, y: 2.2, z: -2.2, rz: Math.PI / 2 });
  bb.g("matte").box(2.62, 0.5, 0.06, 0, 1.0, 4.78, 0x17181c);
  g.add(bb.finish());
  const wheels = [];
  [[-1.2, -3.6], [1.2, -3.6], [-1.2, 3.3], [1.2, 3.3]].forEach((p) => {
    const w = new THREE.Group();
    const T = new GeoBuilder();
    T.lathe([[0.3, -0.17], [0.46, -0.18], [0.52, -0.12], [0.54, 0], [0.52, 0.12], [0.46, 0.18], [0.3, 0.17]], 20, 0, 0, 0, 0x191a1d, { rz: Math.PI / 2 });
    w.add(meshOf(T.build(), GFX.mat.rubber));
    const R = new GeoBuilder(); R.cyl(0.3, 0.3, 0.34, 14, 0, 0, 0, 0xc2c8d2, { rz: Math.PI / 2 });
    w.add(meshOf(R.build(), GFX.mat.metal));
    w.position.set(p[0], 0.54, p[1]); g.add(w); wheels.push(w);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.36), new THREE.MeshStandardMaterial({ map: textSprite("ÉCOLE · SCOLARITE", { w: 512, h: 96, fg: "#17140a", bg: "#ffe08a", font: "700 56px Rajdhani, Arial" }), emissiveMap: null, roughness: 0.6 }));
  sign.position.set(0, 3.4, -3.37); sign.rotation.y = Math.PI; g.add(sign);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeBus() {
  if (!PROP.bus) PROP.bus = buildBusProto();
  return regEnt(PROP.bus.clone(true), { type: "bus", level: "FULL", hw: 1.7, hl: 5.0, hh: 3.4, damage: 26 });
}

/* ------------------------------ ITEMS / DIVERS ------------------------------ */
function makeConeCluster() {
  const g = new THREE.Group();
  const n = rndInt(2, 4);
  let zz = 0;
  for (let i = 0; i < n; i++) {
    const c = PROP.cone.clone();
    c.position.set(rnd(-0.5, 0.5), 0, zz);
    zz += rnd(0.7, 1.0);
    c.rotation.y = rnd(0, 6.3);
    g.add(c);
  }
  return regEnt(g, { type: "cones", level: "LOW", hw: 0.8, hl: 0.8, hh: 0.85, damage: 3 });
}

function makePuddle() {
  const g = new THREE.Group();
  if (!GFX.tex.ripple) {
    GFX.tex.ripple = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = "#808080"; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) { x.strokeStyle = "rgba(255,255,255," + (0.2 + i * 0.05) + ")"; x.lineWidth = 3; x.beginPath(); x.arc(128 + (i % 3 - 1) * 20, 128 + (i % 2) * 14, 18 + i * 16, 0, 6.3); x.stroke(); }
    }, 1, 1, true);
    GFX.tex.ripple.wrapS = GFX.tex.ripple.wrapT = THREE.RepeatWrapping;
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0x1c2e40, roughness: 0.02, metalness: 0.25, transparent: true, opacity: 0.88, envMapIntensity: 2.6, normalMap: GFX.tex.ripple, normalScale: new THREE.Vector2(0.18, 0.18), polygonOffset: true, polygonOffsetFactor: -3 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(rnd(1.7, 2.3), 28), mat);
  water.rotation.x = -Math.PI / 2; water.position.y = 0.022;
  water.scale.set(1, rnd(0.6, 0.85), 1);
  water.receiveShadow = true;
  g.add(water);
  const e = regEnt(g, { type: "puddle", level: "GROUND", hw: 2.1, hl: 1.6, hh: 0.05, damage: 0 });
  e.update = (ent, dt, P, t) => { mat.normalMap.offset.set(t * 0.03, t * 0.02); };
  return e;
}

function makeItem(kind) {
  const g = new THREE.Group();
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.78, 28), new THREE.MeshBasicMaterial({
    color: kind === "nitro" ? new THREE.Color(0.2, 1.0, 2.4) : kind === "coffee" ? new THREE.Color(2.0, 1.4, 0.4) : new THREE.Color(0.4, 2.0, 0.8),
    transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false
  }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; halo.renderOrder = 3;
  g.add(halo);
  const item = new THREE.Group();
  const bb = new BB();
  if (kind === "nitro") {
    bb.g("paint").cyl(0.3, 0.3, 0.82, 20, 0, 0, 0, 0x16b5ff);
    bb.g("paint").cyl(0.3, 0.3, 0.3, 20, 0, 0.08, 0, 0xf6f8fb);
    bb.g("chrome").cyl(0.3, 0.2, 0.12, 20, 0, 0.47, 0, 0xcfd6df);
    bb.g("chrome").cyl(0.2, 0.2, 0.05, 20, 0, 0.55, 0, 0xcfd6df);
    bb.g("chrome").cyl(0.3, 0.3, 0.05, 20, 0, -0.42, 0, 0xcfd6df);
    bb.g("glow").box(0.1, 0.34, 0.02, 0, 0.1, 0.305, 0x0a2a60);
    bb.g("glow").add(new THREE.PlaneGeometry(0.3, 0.3), 0xffd23f, { x: 0, y: 0.1, z: 0.31 });
  } else if (kind === "coffee") {
    bb.g("plastic").cyl(0.3, 0.22, 0.6, 20, 0, 0, 0, 0xf6f2e8);
    bb.g("paint").cyl(0.27, 0.23, 0.2, 20, 0, 0.0, 0, 0xc23b2e);
    bb.g("plastic").cyl(0.31, 0.31, 0.08, 20, 0, 0.34, 0, 0x6a4a34);
    bb.g("matte").cyl(0.25, 0.25, 0.02, 20, 0, 0.375, 0, 0x2a1a10);
  } else {
    bb.g("paint").rbox(0.72, 0.46, 0.4, 0.06, 0, 0, 0, 0xcc3a2a);
    bb.g("metal").rbox(0.78, 0.12, 0.44, 0.04, 0, -0.1, 0, 0x8a9099);
    bb.g("metal").rbox(0.3, 0.06, 0.06, 0.02, 0, 0.3, 0, 0x2a2d33);
    bb.g("chrome").cyl(0.04, 0.04, 0.6, 8, 0.26, 0.28, 0, 0xd0d4dc, { rz: Math.PI / 2, rx: 0.4 });
  }
  item.add(bb.finish());
  item.scale.setScalar(0.95);
  g.add(item);
  const e = regEnt(g, { type: "item", level: "LOW", hw: 0.55, hl: 0.55, hh: 1.3, damage: 0, itemKind: kind, dead: false });
  e.t = Math.random() * 6;
  e.update = (ent, dt) => {
    ent.t += dt;
    item.position.y = 1.05 + Math.sin(ent.t * 2.6) * 0.14;
    item.rotation.y += dt * 1.9;
    halo.scale.setScalar(1 + Math.sin(ent.t * 3) * 0.1);
  };
  return e;
}

function spawnPhone(ent, P) {
  const g = new THREE.Group();
  const bb = new BB();
  bb.g("plastic").rbox(0.15, 0.3, 0.035, 0.02, 0, 0, 0, 0x14161c);
  bb.g("glow").rbox(0.13, 0.26, 0.01, 0.01, 0, 0, -0.019, 0x63e7ff);
  g.add(bb.finish());
  g.position.copy(ent.obj.position);
  g.position.y = 1.9;
  scene.add(g);
  // tir predictif : le telephone retombe ~0,6 s plus tard a l'endroit ou sera la moto (si elle ne devie pas)
  const Tf = 0.6;
  const tz = P.z - (P.speed || 0) * Tf - 1.0, tx = P.x + (P.vx || 0) * 0.25;
  const dz = tz - ent.z;
  const dx = tx - ent.obj.position.x;
  const T = Tf;
  const pe = {
    obj: g, type: "phone", level: "LOW", hw: 0.22, hl: 0.22, hh: 0.35,
    damage: 9, dead: false, z: ent.z, x: ent.obj.position.x, y: 1.9,
    vx: dx / T, vz: dz / T, vy: 6.47, landed: false, t: 0, hitCd: 0, baseY: 0
  };
  g.userData.ent = pe;
  ents.push(pe);
  return pe;
}
