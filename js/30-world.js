"use strict";
/* ============================================================================
   MONDE — route, trottoirs, chunks recycles (zones : residentiel, commerces,
   parc, centre-ville, college), decals routiers, mobilier, apparition des obstacles.
   ============================================================================ */

const FACADE_X = CFG.ROAD_W / 2 + CFG.SIDEWALK_W + 0.6; // plan des facades (12.2)

function buildRoad() {
  const L = CFG.TOTAL_DIST + 320;
  const zc = -(CFG.TOTAL_DIST / 2) + 60;
  // chaussee : texture PBR 14 m x 16 m repetee en longueur
  const rg = new THREE.PlaneGeometry(CFG.ROAD_W, L);
  const uv = rg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (L / ROADTEX.LM));
  const road = new THREE.Mesh(rg, GFX.mat.road);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, zc);
  road.receiveShadow = true;
  worldGroup.add(road);

  // sol large (derriere les facades)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, L + 300), new THREE.MeshStandardMaterial({ color: 0x4a4a46, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.08, zc);
  ground.receiveShadow = true;
  worldGroup.add(ground);

  const SW = CFG.SIDEWALK_W, SH = CFG.SIDEWALK_H;
  const sg = new THREE.PlaneGeometry(SW, L);
  const su = sg.attributes.uv;
  for (let i = 0; i < su.count; i++) su.setXY(i, su.getX(i) * (SW / 2.4), su.getY(i) * (L / 2.4));
  [-1, 1].forEach((s) => {
    const top = new THREE.Mesh(sg, GFX.mat.paving);
    top.rotation.x = -Math.PI / 2;
    top.position.set(s * (CFG.ROAD_W / 2 + SW / 2), SH, zc);
    top.receiveShadow = true;
    worldGroup.add(top);
    const body = new THREE.Mesh(new THREE.BoxGeometry(SW, SH, L), new THREE.MeshStandardMaterial({ color: 0x7d7b75, roughness: 0.95 }));
    body.position.set(s * (CFG.ROAD_W / 2 + SW / 2), SH / 2 - 0.01, zc);
    body.receiveShadow = true; body.castShadow = true;
    worldGroup.add(body);
    // bordure en granit : dessus clair, face sombre
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, SH + 0.05, L), new THREE.MeshStandardMaterial({ color: 0xb5b3ac, roughness: 0.78 }));
    curb.position.set(s * (CFG.ROAD_W / 2 + 0.15), (SH + 0.05) / 2, zc);
    curb.receiveShadow = true; curb.castShadow = true;
    worldGroup.add(curb);
    // caniveau sombre
    const gutter = new THREE.Mesh(new THREE.PlaneGeometry(0.42, L), new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }));
    gutter.rotation.x = -Math.PI / 2;
    gutter.position.set(s * (CFG.ROAD_W / 2 - 0.22), 0.008, zc);
    worldGroup.add(gutter);
  });
}

/* ------------------------------ DECALS PAR CHUNK ------------------------------ */
class DecalBatch {
  constructor() { this.pos = []; this.uv = []; this.idx = []; this.n = 0; }
  add(name, cx, cy, cz, w, h, rot) {
    const R = DECAL[name], u0 = R[0] / 1024, u1 = (R[0] + R[2]) / 1024, v0 = 1 - (R[1] + R[3]) / 1024, v1 = 1 - R[1] / 1024;
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
    const pts = [[-w / 2, h / 2, u0, v0], [w / 2, h / 2, u1, v0], [w / 2, -h / 2, u1, v1], [-w / 2, -h / 2, u0, v1]];
    // plan horizontal : x -> x, "haut de l'image" -> -z
    pts.forEach((p) => {
      const lx = p[0], lz = p[1];
      this.pos.push(cx + lx * c - lz * s, cy, cz + lx * s + lz * c);
      this.uv.push(p[2], p[3]);
    });
    const b = this.n * 4;
    this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    this.n++;
  }
  build() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, GFX.mat.decal);
    m.receiveShadow = true;
    m.renderOrder = 1;
    m.userData.ownGeo = true;
    return m;
  }
}

/* ------------------------------ CHUNKS / ZONES ----------------------------- */
function zoneForDist(d) {
  const t = d / CFG.TOTAL_DIST;
  if (t < 0.16) return "residential";
  if (t < 0.34) return "shops";
  if (t < 0.52) return "park";
  if (t < 0.8) return "downtown";
  return "school";
}

function makeChunk(index) {
  const g = new THREE.Group();
  g.userData = { index: index, content: new THREE.Group(), ents: [] };
  g.add(g.userData.content);
  worldGroup.add(g);
  chunks.push(g);
  return g;
}
function clearChunkContent(chunk) {
  const ud = chunk.userData;
  ud.ents.forEach((e) => {
    disposeTempRecursive(e.obj);
    if (e.obj.parent) e.obj.parent.remove(e.obj);
    const i = ents.indexOf(e);
    if (i >= 0) ents.splice(i, 1);
  });
  ud.ents.length = 0;
  const c = ud.content;
  for (let i = c.children.length - 1; i >= 0; i--) {
    const child = c.children[i];
    disposeTempRecursive(child);
    if (child.userData && child.userData.ownGeo) child.geometry.dispose();
    c.remove(child);
  }
  // les fonctions d'ambiance (canards...) liees a ce chunk sont retirees
  for (let i = ambient.length - 1; i >= 0; i--) if (ambient[i].chunk === chunk) ambient.splice(i, 1);
}
function layoutChunk(chunk, index, demo) {
  clearChunkContent(chunk);
  const ud = chunk.userData;
  ud.index = index;
  chunk.position.z = -index * CFG.CHUNK_LEN;
  const dist = index * CFG.CHUNK_LEN + CFG.CHUNK_LEN / 2;
  const zone = zoneForDist(clamp(dist, 0, CFG.TOTAL_DIST));
  const rng = mulberry32(index * 7919 + 13);
  const diff = clamp(dist / CFG.TOTAL_DIST, 0, 1);
  const c = ud.content;
  const decals = new DecalBatch();
  ud.zone = zone;

  for (const side of [-1, 1]) buildSideBlock(c, side, zone, rng, diff, index, decals);
  streetFurniture(chunk, c, zone, rng, decals, index);
  roadDecals(c, zone, rng, decals, index);
  const dm = decals.build();
  if (dm) c.add(dm);
  if (!demo && !DBG.noObstacles && dist < CFG.TOTAL_DIST - 60) spawnPattern(chunk, c, 0, dist, zone, rng, diff);
}

function roadDecals(c, zone, rng, decals, index) {
  const H = CFG.CHUNK_LEN / 2;
  // passage pieton + ligne d'arret : un par chunk sur deux, plus souvent pres des commerces et du college
  if (index % 2 === 1 || zone === "school") {
    const z = -H * 0.2 + rng() * 14;
    decals.add("zebra", 0, 0.016, z, CFG.ROAD_W - 0.9, 4.2, 0);
  }
  for (let i = 0; i < 2; i++) {
    const lane = [-4.5, 0, 4.5][Math.floor(rng() * 3)] + (rng() - 0.5) * 0.9;
    decals.add("manhole", lane, 0.017, -H + 6 + rng() * 68, 1.15, 1.15, rng() * 6.3);
  }
  [-1, 1].forEach((s) => {
    if (rng() < 0.7) decals.add("grate", s * (CFG.ROAD_W / 2 - 0.55), 0.017, -H + 8 + rng() * 64, 1.0, 0.7, 0);
  });
  if (rng() < 0.55) decals.add("skid", (rng() - 0.5) * 8, 0.016, -H + 8 + rng() * 64, 2.4, 5.5, (rng() - 0.5) * 0.4);
  if (zone === "school") decals.add("ecole", 0, 0.016, -H * 0.55, 7.6, 3.8, 0);
  if (zone === "park" || rng() < 0.3) decals.add("leaves", (rng() - 0.5) * 10, 0.018, -H + 10 + rng() * 60, 6.5, 3.2, rng() * 6.3);
}

function buildSideBlock(c, side, zone, rng, diff, index, decals) {
  if (zone === "park" && (index % 3 !== 2 || side > 0)) return buildPark(c, side, rng, index);
  if (zone === "park") return buildBuildings(c, side, "residential", rng);
  if (zone === "downtown" && index % 3 === 1 && side < 0) return buildParking(c, side, rng);
  return buildBuildings(c, side, zone, rng);
}

function buildBuildings(c, side, zone, rng) {
  const H = CFG.CHUNK_LEN / 2;
  let z = -H + rng() * 0.6;
  for (let guard = 0; guard < 12; guard++) {
    const b = placeBuildingProto(zone, rng, side, side * FACADE_X, z, H - z - 0.4);
    if (!b) break;
    c.add(b.obj);
    z += b.W + 0.7 + rng() * (zone === "residential" ? 2.4 : 1.2);
  }
  if (H - z > 2.5) fillerLot(c, side, z, H, rng);
}

// Parcelle libre entre deux batiments : pelouse, haie et arbres (aucun trou nu dans le decor)
function fillerLot(c, side, z0, z1, rng) {
  const len = z1 - z0, zc = (z0 + z1) / 2, x0 = side * (CFG.ROAD_W / 2 + CFG.SIDEWALK_W), w = 12.5;
  const gg = new THREE.PlaneGeometry(w, len);
  const gu = gg.attributes.uv;
  for (let i = 0; i < gu.count; i++) gu.setXY(i, gu.getX(i) * (w / 6), gu.getY(i) * (len / 6));
  const g = new THREE.Mesh(gg, GFX.mat.grass);
  g.rotation.x = -Math.PI / 2;
  g.position.set(x0 + side * w / 2, 0.05, zc);
  g.receiveShadow = true;
  c.add(g);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, len), new THREE.MeshStandardMaterial({ color: 0xbfb49d, roughness: 0.95 }));
  wall.position.set(x0 + side * (w + 0.2), 2.1, zc);
  wall.castShadow = true; wall.receiveShadow = true;
  c.add(wall);
  const nT = Math.max(1, Math.floor(len / 6));
  for (let i = 0; i < nT; i++) {
    const t = PROP.tree[Math.floor(rng() * PROP.tree.length)].clone();
    t.position.set(x0 + side * (2.5 + rng() * 7), 0.05, z0 + (i + 0.5) * (len / nT));
    t.rotation.y = rng() * 6.3;
    t.scale.setScalar(0.9 + rng() * 0.5);
    c.add(t);
  }
  const f = PROP.fence;
  for (let z = z0; z < z1 - 1; z += 4) { const fc = f.clone(); fc.position.set(x0 + side * 0.2, 0, z + 2); c.add(fc); }
}

function buildParking(c, side, rng) {
  const H = CFG.CHUNK_LEN / 2, baseX = side * FACADE_X;
  const lotG = new THREE.PlaneGeometry(26, CFG.CHUNK_LEN);
  const lotU = lotG.attributes.uv;
  for (let i = 0; i < lotU.count; i++) lotU.setXY(i, lotU.getX(i) * (26 / 2.4), lotU.getY(i) * (CFG.CHUNK_LEN / 2.4));
  const lot = new THREE.Mesh(lotG, GFX.mat.paving);
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(baseX + side * 13, 0.04, 0);
  lot.receiveShadow = true;
  c.add(lot);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xdfe3e8 });
  for (let z = -H + 4; z < H - 4; z += 5) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.12), lineMat);
    ln.rotation.x = -Math.PI / 2;
    ln.position.set(baseX + side * 4.6, 0.05, z);
    c.add(ln);
  }
  for (let z = -H + 6; z < H - 6; z += 5) {
    if (rng() < 0.74) {
      const car = makeCar(rng);
      car.position.set(baseX + side * 4.6, 0.04, z + 2.5);
      car.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.rotation.y += (rng() - 0.5) * 0.06;
      car.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      c.add(car);
    }
  }
  // grillage + haies de fond
  for (let z = -H + 4; z < H - 4; z += 8) { const h = PROP.hedge.clone(); h.rotation.y = Math.PI / 2; h.position.set(baseX + side * 24.5, 0, z + 4); c.add(h); }
  // barriere d'entree
  if (rng() < 0.5) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 5), new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }));
    bar.position.set(baseX + side * 1.0, 1.0, rng() * 20 - 10);
    c.add(bar);
  }
}

function makeFenceProto() {
  const bb = new BB();
  const dark = 0x23262b;
  bb.g("metal").box(4, 0.06, 0.06, 0, 1.15, 0, dark);
  bb.g("metal").box(4, 0.06, 0.06, 0, 0.35, 0, dark);
  for (let i = 0; i <= 16; i++) bb.g("metal").box(0.035, 1.1, 0.035, -2 + i * 0.25, 0.65, 0, dark);
  [-2, 2].forEach((x) => { bb.g("metal").box(0.1, 1.4, 0.1, x, 0.7, 0, dark); bb.g("metal").sphere(0.07, x, 1.45, 0, 0xc9a73a, { ws: 8, hs: 6 }); });
  return propGroup(bb, "fence");
}

function buildPark(c, side, rng, index) {
  const H = CFG.CHUNK_LEN / 2;
  const inner = side * (CFG.ROAD_W / 2 + CFG.SIDEWALK_W);
  // pelouse (bandes de tonte via UV)
  const lg = new THREE.PlaneGeometry(26, CFG.CHUNK_LEN);
  const lu = lg.attributes.uv;
  for (let i = 0; i < lu.count; i++) lu.setXY(i, lu.getX(i) * 6, lu.getY(i) * 13);
  const lawn = new THREE.Mesh(lg, GFX.mat.grass);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(inner + side * 13, 0.05, 0);
  lawn.receiveShadow = true;
  c.add(lawn);
  // allee
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, CFG.CHUNK_LEN), new THREE.MeshStandardMaterial({ color: 0xcdb892, roughness: 0.95 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(inner + side * 5.6, 0.065, 0);
  path.receiveShadow = true;
  c.add(path);
  // grille en fer forge le long du trottoir
  for (let z = -H; z < H; z += 4) {
    const f = PROP.fence.clone();
    f.position.set(inner + side * 0.3, 0, z + 2);
    c.add(f);
  }
  // arbres
  const nTrees = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < nTrees; i++) {
    const t = PROP.tree[Math.floor(rng() * PROP.tree.length)].clone();
    t.position.set(inner + side * (7 + rng() * 14), 0.05, -H + 5 + rng() * 70);
    t.rotation.y = rng() * 6.3;
    t.scale.setScalar(0.95 + rng() * 0.5);
    c.add(t);
  }
  for (let i = 0; i < 2; i++) {
    const bench = PROP.bench.clone();
    bench.position.set(inner + side * 3.2, 0.05, -H + 12 + rng() * 56);
    bench.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    c.add(bench);
  }
  const fl = PROP.flowers.clone();
  fl.position.set(inner + side * 9, 0.05, -H + 15 + rng() * 50);
  fl.rotation.y = rng() * 3;
  c.add(fl);
  if (rng() < 0.6) {
    const px = inner + side * (11 + rng() * 6), pz = -H + 18 + rng() * 44;
    const pond = new THREE.Mesh(new THREE.CircleGeometry(3.6 + rng() * 1.6, 28), new THREE.MeshStandardMaterial({ color: 0x2d6f94, roughness: 0.04, metalness: 0.35, envMapIntensity: 1.8 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(px, 0.09, pz);
    c.add(pond);
    const rim = new THREE.Mesh(new THREE.RingGeometry(3.7 + 0.0, 4.2, 28), new THREE.MeshStandardMaterial({ color: 0x9a9388, roughness: 0.9 }));
    rim.geometry.scale(1, 1, 1);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(px, 0.095, pz);
    rim.scale.setScalar(0.96 + 0.0);
    c.add(rim);
    for (let i = 0; i < 3; i++) {
      const duck = makeDuck();
      duck.userData.pond = { x: px, z: pz, r: 1.1 + rng() * 1.6, a: rng() * 6.3 };
      c.add(duck);
      const fn = makeDuckSwimmer(duck); fn.chunk = c.parent; ambient.push(fn);
    }
  }
  if (rng() < 0.5) {
    const kiosk = PROP.kiosk.clone();
    kiosk.position.set(inner + side * 5, 0.05, -H + 12 + rng() * 56);
    kiosk.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    c.add(kiosk);
  }
}

function streetFurniture(chunk, c, zone, rng, decals, index) {
  const H = CFG.CHUNK_LEN / 2, SH = CFG.SIDEWALK_H;
  const lx = CFG.ROAD_W / 2 + 0.9;
  // lampadaires de chaque cote (bras tourne vers la chaussee)
  for (let z = -H + 8; z < H; z += 24) {
    [-1, 1].forEach((s) => {
      const lamp = PROP.lamp.clone();
      lamp.position.set(s * lx, SH, z + rng() * 4);
      lamp.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      c.add(lamp);
    });
  }
  // arbres d'alignement et corbeilles
  for (let z = -H + 14; z < H; z += 25) {
    const s = rng() < 0.5 ? -1 : 1;
    if (rng() < 0.62 && zone !== "downtown") {
      const t = PROP.tree[Math.floor(rng() * 2)].clone();
      t.position.set(s * (CFG.ROAD_W / 2 + 2.0), SH, z + rng() * 6);
      t.scale.setScalar(0.8 + rng() * 0.3);
      t.rotation.y = rng() * 6.3;
      c.add(t);
    } else {
      const bin = PROP.bin.clone();
      bin.position.set(s * (CFG.ROAD_W / 2 + 1.9), SH, z + rng() * 6);
      c.add(bin);
    }
  }
  if (zone === "shops" || zone === "downtown") {
    for (let z = -H + 8; z < H - 8; z += 14 + rng() * 12) {
      const s = rng() < 0.5 ? -1 : 1;
      if (rng() < 0.5) {
        const car = makeCar(rng);
        car.position.set(s * (CFG.ROAD_W / 2 + 2.9), SH, z);
        car.rotation.y = s > 0 ? Math.PI : 0;
        car.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        c.add(car);
        registerSolid(chunk, car, z, s * (CFG.ROAD_W / 2 + 2.9), 0.95, 2.3, "parked", 12);
      }
    }
    if (rng() < 0.5) {
      const bs = PROP.busstop.clone();
      const s = rng() < 0.5 ? -1 : 1;
      bs.position.set(s * (CFG.ROAD_W / 2 + 3.9), SH, -H + 20 + rng() * 40);
      bs.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      c.add(bs);
    }
  }
  if (zone === "park" || zone === "residential") {
    for (let z = -H + 14; z < H; z += 30) {
      const s = rng() < 0.5 ? -1 : 1;
      const h = PROP.hydrant.clone();
      h.position.set(s * (CFG.ROAD_W / 2 + 3.3), SH, z + rng() * 6);
      c.add(h);
    }
  }
  if (zone === "school") {
    for (let z = -H + 6; z < H; z += 6) {
      [-1, 1].forEach((s) => { const b = PROP.bollard.clone(); b.position.set(s * (CFG.ROAD_W / 2 + 0.55), SH, z); c.add(b); });
    }
    [-1, 1].forEach((s) => { const sg = PROP.sign.clone(); sg.position.set(s * (CFG.ROAD_W / 2 + 1.5), SH, -H * 0.2); sg.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; c.add(sg); });
  }
}

// Enregistre un decor solide (voiture garee...) comme obstacle PLEIN
function registerSolid(chunk, obj, zLocal, x, hw, hl, type, damage) {
  const e = regEnt(obj, { type: type, level: "FULL", hw: hw, hl: hl, hh: 1.6, damage: damage });
  e.chunk = chunk;
  e.x = x; e.z = chunk.position.z + zLocal;
  chunk.userData.ents.push(e);
  ents.push(e);
  return e;
}

/* ------------------------------- PATTERNS JEU ------------------------------ */
function spawnPattern(chunk, c, zMid, dist, zone, rng, diff) {
  const lanes = [-4.5, 0, 4.5];
  const nEvents = diff < 0.25 ? (rng() < 0.45 ? 1 : 2) : rndInt(1, 2) + (rng() < diff * 0.75 ? 1 : 0);
  const n = Math.min(3, nEvents);
  const shuffled = [0, 1, 2].sort(() => rng() - 0.5);
  const usedLanes = shuffled.slice(0, n);
  const freeLanes = shuffled.slice(n);
  usedLanes.forEach((li, i) => {
    const zLocal = -CFG.CHUNK_LEN / 2 + 14 + (i * (CFG.CHUNK_LEN - 28)) / Math.max(1, n) + rng() * 8;
    const x = lanes[li] + rnd(-1.1, 1.1);
    placeObstacle(chunk, c, x, zLocal, zone, rng, diff);
  });
  const itemCount = freeLanes.length > 1 ? 2 : (rng() < 0.6 ? 1 : 0);
  for (let i = 0; i < itemCount; i++) {
    const li = freeLanes[i % Math.max(1, freeLanes.length)];
    if (li == null) continue;
    const zLocal = -CFG.CHUNK_LEN / 2 + 20 + rng() * (CFG.CHUNK_LEN - 40);
    placeItem(chunk, c, lanes[li] + rnd(-1, 1), zLocal, rng);
  }
}
function placeObstacle(chunk, c, x, z, zone, rng, diff) {
  const roll = rng();
  let factory;
  if (zone === "downtown") {
    if (roll < 0.3) factory = makeTruck;
    else if (roll < 0.5) factory = makeProtest;
    else if (roll < 0.62) factory = makeBus;
    else if (roll < 0.76) factory = makeScooterKid;
    else if (roll < 0.88) factory = makeConeCluster;
    else factory = makeCat;
  } else if (zone === "park") {
    if (roll < 0.26) factory = makeProtest;
    else if (roll < 0.46) factory = makeCat;
    else if (roll < 0.62) factory = makeBallKid;
    else if (roll < 0.78) factory = makeScooterKid;
    else if (roll < 0.9) factory = makePuddle;
    else factory = makeConeCluster;
  } else if (zone === "shops") {
    if (roll < 0.24) factory = makeTruck;
    else if (roll < 0.42) factory = makeGirlfriend;
    else if (roll < 0.58) factory = makeCat;
    else if (roll < 0.72) factory = makeConeCluster;
    else if (roll < 0.85) factory = makePuddle;
    else factory = makeScooterKid;
  } else if (zone === "school") {
    if (roll < 0.42) factory = makeProtest;
    else if (roll < 0.62) factory = makeBallKid;
    else if (roll < 0.8) factory = makeConeCluster;
    else factory = makeCat;
  } else {
    if (roll < 0.24) factory = makeCat;
    else if (roll < 0.42) factory = makeGirlfriend;
    else if (roll < 0.58) factory = makePuddle;
    else if (roll < 0.74) factory = makeScooterKid;
    else if (roll < 0.88) factory = makeConeCluster;
    else factory = makeTruck;
  }
  const e = factory();
  e.obj.position.set(x, e.baseY || 0, z);
  if (e.dyn) e.obj.position.z = z;
  e.chunk = chunk;
  e.x = x; e.z = chunk.position.z + z;
  c.add(e.obj);
  chunk.userData.ents.push(e);
  ents.push(e);
}
function placeItem(chunk, c, x, z, rng) {
  const roll = rng();
  const kind = roll < 0.58 ? "nitro" : (roll < 0.84 ? "coffee" : "tools");
  const e = makeItem(kind);
  e.obj.position.set(x, 0, z);
  e.chunk = chunk;
  e.x = x; e.z = chunk.position.z + z;
  c.add(e.obj);
  chunk.userData.ents.push(e);
  ents.push(e);
}
