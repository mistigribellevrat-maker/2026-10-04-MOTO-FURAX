"use strict";
/* ============================================================================
   ACCESSOIRES URBAINS — arbres, lampadaires, voitures, mobilier, signalisation.
   Tous construits en geometrie fusionnee + materiaux PBR partages.
   ============================================================================ */

const PROP = {};          // prototypes nommes (Group)
const CAR_CACHE = {};

function propGroup(bb, name) {
  const g = bb.finish();
  g.name = name;
  return markShared(g);
}

/* ---------------------------------- ARBRES ---------------------------------- */
function makeTreeProto(kind, seed) {
  const rng = mulberry32(seed);
  const bb = new BB();
  const bark = 0x5b4129;
  const H = kind === "pine" ? 8.5 : 5.2;
  bb.g("matte").cyl(0.17, 0.3, H * 0.62, 8, 0, H * 0.31, 0, bark, { ao: 0.35 });
  if (kind === "pine") {
    const cols = [0x2c6b46, 0x36794f, 0x2a5f3e];
    for (let i = 0; i < 5; i++) {
      const r = 2.1 - i * 0.36, h = 2.4;
      bb.g("foliage").add(new THREE.ConeGeometry(r, h, 10, 1), cols[i % 3], { y: 2.0 + i * 1.35 + h / 2, ao: 0.45 });
    }
  } else {
    const pal = {
      round: [0x4f9a3a, 0x5fae42, 0x3f8433, 0x6bb84a],
      cherry: [0xf0a6c0, 0xf6bcd0, 0xe48fb0, 0xf9cdd9],
      autumn: [0xd9822b, 0xe3a22f, 0xc4602a, 0xe8b640]
    }[kind] || [];
    // ramures
    [[0.55, 3.2, 0.2], [-0.5, 3.6, -0.3], [0.1, 3.9, -0.5]].forEach((p) => {
      bb.g("matte").cyl(0.07, 0.13, 1.7, 6, p[0] * 0.5, p[1] - 0.3, p[2] * 0.5, bark, { rz: -p[0] * 0.7, rx: p[2] * 0.5 });
    });
    const blobs = kind === "cherry" ? 7 : 6;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * 6.283 + rng() * 0.6, rr = i === 0 ? 0 : 1.1 + rng() * 0.7;
      const r = (i === 0 ? 1.7 : 1.05 + rng() * 0.55) * (kind === "cherry" ? 0.92 : 1);
      const geo = new THREE.IcosahedronGeometry(r, 2);
      const P = geo.attributes.position;
      for (let v = 0; v < P.count; v++) { // canopee irreguliere
        const n = 1 + (Math.sin(P.getX(v) * 3.1 + i) * Math.cos(P.getY(v) * 2.7 + P.getZ(v) * 3.3) * 0.13);
        P.setXYZ(v, P.getX(v) * n, P.getY(v) * n * 0.88, P.getZ(v) * n);
      }
      geo.computeVertexNormals();
      bb.g("foliage").add(geo, pal[i % pal.length], { x: Math.cos(a) * rr, y: 4.3 + (i === 0 ? 0.55 : rng() * 0.9 - 0.2), z: Math.sin(a) * rr, ao: 0.5 });
    }
  }
  const g = propGroup(bb, "tree_" + kind);
  g.userData.H = H;
  return g;
}

/* ----------------------------------- LAMPADAIRE ----------------------------------- */
function makeLampProto() {
  const bb = new BB();
  const dark = 0x2b3036;
  bb.g("metal").cyl(0.14, 0.2, 0.5, 10, 0, 0.25, 0, dark);
  bb.g("metal").cyl(0.07, 0.12, 5.2, 10, 0, 2.85, 0, dark);
  // bras courbe
  for (let i = 0; i < 6; i++) {
    const t = i / 5, a = t * 1.0;
    bb.g("metal").cyl(0.065, 0.065, 0.42, 6, 0, 5.35 + Math.sin(a) * 0.4, 0.2 + t * 1.0 + Math.cos(a) * 0.1, dark, { rx: Math.PI / 2 - a * 0.9 });
  }
  bb.g("metal").rbox(0.46, 0.2, 1.0, 0.08, 0, 5.62, 1.45, 0x39404a);
  bb.g("glow").rbox(0.34, 0.05, 0.8, 0.02, 0, 5.5, 1.45, 0xffe6b0);
  bb.g("metal").cyl(0.1, 0.1, 0.3, 8, 0, 1.2, 0.14, dark);
  return propGroup(bb, "lamp");
}

/* -------------------------------- MOBILIER URBAIN -------------------------------- */
function makeBinProto() {
  const bb = new BB();
  bb.g("plastic").cyl(0.4, 0.34, 1.0, 14, 0, 0.55, 0, 0x2f6b46, { ao: 0.35 });
  bb.g("plastic").cyl(0.43, 0.43, 0.1, 14, 0, 1.08, 0, 0x214c32);
  bb.g("metal").cyl(0.41, 0.41, 0.05, 14, 0, 0.25, 0, 0x888e98);
  bb.g("matte").box(0.34, 0.1, 0.02, 0, 0.78, -0.36, 0xf2f2ea);
  return propGroup(bb, "bin");
}
function makeBenchProto() {
  const bb = new BB();
  const wood = 0x946138, metal = 0x2a2f36;
  for (let i = 0; i < 4; i++) bb.g("matte").box(2.1, 0.07, 0.11, 0, 0.5, -0.2 + i * 0.14, wood, { ao: 0.15 });
  for (let i = 0; i < 3; i++) bb.g("matte").box(2.1, 0.09, 0.05, 0, 0.78 + i * 0.16, -0.34, wood, { rx: -0.12 });
  [-0.9, 0.9].forEach((x) => {
    bb.g("metal").box(0.07, 0.5, 0.62, x, 0.25, -0.03, metal);
    bb.g("metal").box(0.07, 0.62, 0.07, x, 0.74, -0.33, metal);
    bb.g("metal").box(0.09, 0.05, 0.6, x, 0.72, -0.03, metal);
  });
  return propGroup(bb, "bench");
}
function makeHydrantProto() {
  const bb = new BB();
  bb.g("paint").cyl(0.15, 0.17, 0.62, 12, 0, 0.31, 0, 0xcf2f2a, { ao: 0.3 });
  bb.g("paint").sphere(0.16, 0, 0.64, 0, 0xcf2f2a, {});
  bb.g("metal").cyl(0.07, 0.07, 0.42, 8, 0, 0.45, 0, 0xcf2f2a, { rz: Math.PI / 2 });
  return propGroup(bb, "hydrant");
}
function makeKioskProto() {
  const bb = new BB();
  bb.g("paint").rbox(2.6, 2.5, 1.9, 0.08, 0, 1.25, 0, 0x2f6f5e, { ao: 0.3 });
  bb.g("matte").box(3.3, 0.2, 2.5, 0, 2.62, 0, 0xc23b2e);
  bb.g("glass").box(2.1, 0.95, 0.06, 0, 1.45, 0.97, 0x1a2a3a);
  bb.g("matte").box(2.3, 0.1, 0.5, 0, 0.98, 1.1, 0xe9e3d3);
  bb.g("glow").box(1.8, 0.28, 0.04, 0, 2.28, 0.97, 0xffd98a);
  return propGroup(bb, "kiosk");
}
function makeBusStopProto() {
  const bb = new BB();
  bb.g("glass").box(3.6, 2.2, 0.05, 0, 1.2, -0.7, 0x203040);
  [-1.8, 1.8].forEach((x) => bb.g("metal").box(0.08, 2.4, 0.9, x, 1.2, -0.25, 0x31363e));
  bb.g("metal").box(3.9, 0.1, 1.5, 0, 2.45, -0.1, 0x31363e);
  bb.g("matte").box(2.0, 0.07, 0.4, 0, 0.5, -0.5, 0x946138);
  bb.g("glow").box(1.0, 1.5, 0.06, 1.2, 1.3, -0.65, 0xcfe7ff);
  bb.g("metal").cyl(0.05, 0.05, 3.2, 8, 2.6, 1.6, 0.4, 0x6b7280);
  bb.g("paint").cyl(0.34, 0.34, 0.05, 20, 2.6, 3.1, 0.4, 0x1e6fd0, { rx: Math.PI / 2 });
  return propGroup(bb, "busstop");
}
function makeHedgeProto(len) {
  const bb = new BB();
  const n = Math.ceil(len / 1.1);
  for (let i = 0; i < n; i++) bb.g("foliage").rbox(1.15, 0.9, 0.85, 0.3, -len / 2 + 0.55 + i * 1.1, 0.45, 0, [0x3f8433, 0x4a9a3a, 0x378030][i % 3], { ao: 0.5 });
  return propGroup(bb, "hedge");
}
function makeFlowerBedProto() {
  const bb = new BB();
  bb.g("matte").box(2.4, 0.28, 1.2, 0, 0.14, 0, 0x8a7a68, { ao: 0.2 });
  bb.g("matte").box(2.2, 0.06, 1.0, 0, 0.3, 0, 0x4b3524);
  const rng = mulberry32(5);
  const cols = [0xe0405a, 0xf4c431, 0xf08acb, 0xffffff, 0xb06bd6];
  for (let i = 0; i < 26; i++) bb.g("foliage").sphere(0.1 + rng() * 0.06, (rng() - 0.5) * 2.0, 0.42 + rng() * 0.12, (rng() - 0.5) * 0.8, cols[Math.floor(rng() * cols.length)], { ws: 6, hs: 5 });
  return propGroup(bb, "flowers");
}
function makeBollardProto() {
  const bb = new BB();
  bb.g("metal").cyl(0.1, 0.1, 0.8, 8, 0, 0.4, 0, 0x30353d);
  bb.g("plastic").cyl(0.105, 0.105, 0.12, 8, 0, 0.62, 0, 0xf2f2f2);
  return propGroup(bb, "bollard");
}
function makeRoadSignProto() {
  const bb = new BB();
  bb.g("metal").cyl(0.04, 0.04, 2.8, 6, 0, 1.4, 0, 0x80868f);
  bb.g("paint").cyl(0.4, 0.4, 0.04, 20, 0, 2.7, 0.05, 0xf2f2f0, { rx: Math.PI / 2 });
  bb.g("paint").torus(0.36, 0.045, 0, 2.7, 0.08, 0xd32424, {});
  bb.g("matte").box(0.34, 0.07, 0.01, 0, 2.7, 0.085, 0x1a1a1a);
  return propGroup(bb, "sign");
}
function makeTrafficConeProto() {
  const bb = new BB();
  bb.g("rubber").box(0.5, 0.05, 0.5, 0, 0.025, 0, 0x2a2a2a);
  bb.g("plastic").cone(0.2, 0.72, 12, 0, 0.4, 0, 0xf2561d, { ao: 0.2 });
  bb.g("plastic").cyl(0.1, 0.13, 0.12, 12, 0, 0.42, 0, 0xf4f4f0);
  return propGroup(bb, "cone");
}

/* ---------------------------------- VOITURES ---------------------------------- */
// Profil lateral (x = avant+, y = hauteur) extrude sur la largeur
const CAR_KINDS = {
  hatch: { L: 3.9, W: 1.74, lower: 0.62, cab: [[-1.55, 0], [1.2, 0], [0.9, 0.5], [0.15, 0.62], [-0.55, 0.62], [-1.05, 0.36], [-1.5, 0.1]] },
  sedan: { L: 4.5, W: 1.8, lower: 0.62, cab: [[-1.9, 0], [1.35, 0], [1.0, 0.46], [0.3, 0.6], [-0.7, 0.6], [-1.3, 0.4], [-1.85, 0.08]] },
  suv:   { L: 4.5, W: 1.9, lower: 0.78, cab: [[-2.05, 0], [1.4, 0], [1.15, 0.5], [0.6, 0.72], [-1.5, 0.72], [-1.95, 0.5]] },
  van:   { L: 4.9, W: 1.95, lower: 0.82, cab: [[-2.25, 0], [1.8, 0], [1.5, 0.7], [1.0, 0.98], [-2.2, 0.98], [-2.3, 0.8]] }
};
function makeCarProto(kind, color) {
  const key = kind + color;
  if (CAR_CACHE[key]) return CAR_CACHE[key];
  const K = CAR_KINDS[kind], bb = new BB();
  const L = K.L, W = K.W, lo = K.lower;
  const dark = 0x14161a;
  // caisse
  bb.g("paint").rbox(W, lo * 0.78, L, 0.2, 0, 0.26 + lo * 0.39 + 0.1, 0, color, { ao: 0.35 });
  // habitacle vitre + pavillon + montants
  const base = 0.26 + lo * 0.78 + 0.08;
  const cab = K.cab.map((p) => [p[0], p[1]]);
  bb.g("glass").extrude(cab.map((p) => [p[0], p[1]]), W * 0.9, 0.04, 0, base, 0, 0x101820, { ry: Math.PI / 2 });
  const top = Math.max.apply(null, cab.map((p) => p[1]));
  const xs = cab.filter((p) => p[1] === top).map((p) => p[0]);
  const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  bb.g("paint").rbox(W * 0.86, 0.07, (x1 - x0) + 0.2, 0.03, 0, base + top + 0.01, -(x0 + x1) / 2, color);
  [-1, 1].forEach((s) => {
    bb.g("paint").box(0.06, top, 0.1, s * W * 0.445, base + top / 2, -(x0 + 0.02), color, { rx: 0.0 });
    bb.g("paint").box(0.06, top, 0.12, s * W * 0.445, base + top / 2, -(x1 - 0.05), color);
    bb.g("paint").rbox(0.12, 0.2, 0.28, 0.04, s * (W / 2 + 0.06), base + 0.12, -(L * 0.2), shade(color, 0.7));
  });
  // pare-chocs, calandre, plaque
  bb.g("plastic").rbox(W * 0.98, 0.26, 0.28, 0.08, 0, 0.3, -(L / 2 - 0.05), dark);
  bb.g("plastic").rbox(W * 0.98, 0.26, 0.28, 0.08, 0, 0.3, (L / 2 - 0.05), dark);
  bb.g("matte").box(0.5, 0.12, 0.02, 0, 0.42, L / 2 + 0.09, 0xf4f2ea);
  [-1, 1].forEach((s) => {
    bb.g("glow").rbox(0.36, 0.14, 0.06, 0.03, s * W * 0.34, 0.66, -(L / 2) - 0.02, 0xfff4d6);
    bb.g("glow").rbox(0.32, 0.12, 0.06, 0.03, s * W * 0.36, 0.66, L / 2 + 0.01, 0xff3040);
    // roues
    [-1, 1].forEach((zs) => {
      const wz = zs * L * 0.33;
      bb.g("rubber").cyl(0.34, 0.34, 0.24, 18, s * (W / 2 - 0.1), 0.34, wz, 0x15171a, { rz: Math.PI / 2 });
      bb.g("chrome").cyl(0.2, 0.2, 0.26, 12, s * (W / 2 - 0.08), 0.34, wz, 0xcfd3da, { rz: Math.PI / 2 });
      bb.g("matte").cyl(0.38, 0.38, 0.1, 18, s * (W / 2 - 0.2), 0.34, wz, 0x0a0b0d, { rz: Math.PI / 2 });
    });
  });
  const g = propGroup(bb, "car_" + kind);
  g.userData = { L: L, W: W };
  markShared(g);
  CAR_CACHE[key] = g;
  return g;
}
const CAR_COLORS = [0xc4352c, 0x2a63c4, 0xe8e8ea, 0x23262c, 0xe0a82e, 0x3f9a58, 0x9aa1ad, 0xd96a2b, 0x6b3fa0];
function makeCar(rng) {
  const kinds = ["hatch", "sedan", "suv", "van"];
  const k = kinds[Math.floor(rng() * kinds.length)];
  return makeCarProto(k, CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)]).clone();
}

/* ------------------------------ CONSTRUCTION DES PROTOS ------------------------------ */
function buildProps() {
  PROP.tree = [makeTreeProto("round", 11), makeTreeProto("round", 23), makeTreeProto("pine", 35), makeTreeProto("cherry", 47), makeTreeProto("autumn", 59)];
  PROP.lamp = makeLampProto();
  PROP.bin = makeBinProto();
  PROP.bench = makeBenchProto();
  PROP.hydrant = makeHydrantProto();
  PROP.kiosk = makeKioskProto();
  PROP.busstop = makeBusStopProto();
  PROP.hedge = makeHedgeProto(8);
  PROP.flowers = makeFlowerBedProto();
  PROP.bollard = makeBollardProto();
  PROP.sign = makeRoadSignProto();
  PROP.cone = makeTrafficConeProto();
  PROP.fence = makeFenceProto();
  PROP.truck = buildTruckProto();
  PROP.bus = buildBusProto();
}
