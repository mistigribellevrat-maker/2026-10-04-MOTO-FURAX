"use strict";
/* ============================================================================
   LE COLLEGE MOLIERE — portique d'arrivee, grilles, cour, batiment a horloge,
   eleves qui acclament, drapeau.
   ============================================================================ */

function buildCollages() {
  const zGate = -CFG.TOTAL_DIST;
  const g = new THREE.Group();
  const stone = 0xd8cfbd, stoneD = 0xb8ad98, iron = 0x23262c;

  // --- ligne d'arrivee damier (au niveau des grilles) ---
  if (!GFX.tex.checker) {
    GFX.tex.checker = canvasTex(256, 64, (x, w, h) => {
      const s = 32;
      for (let r = 0; r < h / s; r++) for (let c = 0; c < w / s; c++) { x.fillStyle = (r + c) % 2 ? "#f2f4f6" : "#15171b"; x.fillRect(c * s, r * s, s, s); }
    });
    GFX.tex.checker.repeat.set(1, 1);
  }
  const fin = new THREE.Mesh(new THREE.PlaneGeometry(CFG.ROAD_W, 3.2), new THREE.MeshStandardMaterial({ map: GFX.tex.checker, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 }));
  fin.rotation.x = -Math.PI / 2; fin.position.set(0, 0.02, zGate + 1.6); fin.receiveShadow = true;
  g.add(fin);

  // --- murs d'enceinte + piliers (construits autour de z=0 puis places a la grille) ---
  const gate = new THREE.Group();
  gate.position.z = zGate;
  g.add(gate);
  const bb = new BB();
  [-1, 1].forEach((s) => {
    bb.g("matte").box(30, 2.4, 0.7, s * (7.8 + 15), 1.2, 0, stone, { ao: 0.3 });
    bb.g("matte").box(30.4, 0.28, 1.0, s * (7.8 + 15), 2.5, 0, stoneD);
    for (let k = 0; k < 6; k++) bb.g("matte").box(0.7, 2.8, 1.05, s * (8.6 + k * 5.6), 1.4, 0, stoneD, { ao: 0.2 });
    // grandes colonnes du portail
    bb.g("matte").box(1.6, 5.8, 1.6, s * 7.6, 2.9, 0, stone, { ao: 0.25 });
    bb.g("matte").box(2.0, 0.5, 2.0, s * 7.6, 5.95, 0, stoneD);
    bb.g("matte").box(1.9, 0.6, 1.9, s * 7.6, 0.3, 0, stoneD);
    bb.g("metal").sphere(0.34, s * 7.6, 6.45, 0, 0xcfa43a, { ws: 12, hs: 8 });
    bb.g("glow").sphere(0.22, s * 7.6, 6.85, 0, 0xfff2cf, { ws: 8, hs: 6 });
    // grille ouverte : vantail replie contre le mur
    for (let k = 0; k < 11; k++) bb.g("metal").box(0.07, 2.9, 0.07, s * (8.7 + k * 0.5), 1.6, 0.1, iron);
    bb.g("metal").box(5.6, 0.08, 0.08, s * 11.4, 2.9, 0.1, iron);
    bb.g("metal").box(5.6, 0.08, 0.08, s * 11.4, 0.4, 0.1, iron);
  });
  // portique : poutre + enseigne
  bb.g("matte").box(16.4, 1.1, 1.1, 0, 5.7, 0, stone, { ao: 0.2 });
  bb.g("matte").box(16.8, 0.3, 1.5, 0, 6.35, 0, stoneD);
  bb.g("metal").box(15, 0.08, 0.08, 0, 4.9, 0.2, iron);
  gate.add(bb.finish());
  if (!GFX.tex.schoolSign2) {
    const c = cv(1024, 160), x = c.getContext("2d");
    const gr = x.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, "#1b3266"); gr.addColorStop(1, "#0d1c3d");
    x.fillStyle = gr; x.fillRect(0, 0, 1024, 160);
    x.strokeStyle = "#e9c25a"; x.lineWidth = 6; x.strokeRect(8, 8, 1008, 144);
    x.fillStyle = "#f2d278"; x.font = "900 86px 'Orbitron', 'Arial Black', Impact, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("COLLÈGE MOLIÈRE", 512, 84);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    GFX.tex.schoolSign2 = t;
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 0.95), new THREE.MeshStandardMaterial({ map: GFX.tex.schoolSign2, emissiveMap: GFX.tex.schoolSign2, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.45, metalness: 0.2 }));
  sign.position.set(0, 5.7, 0.57); gate.add(sign);
  const sign2 = sign.clone(); sign2.position.z = -0.57; sign2.rotation.y = Math.PI; gate.add(sign2);
  // fanions de la ligne d'arrivee
  const flagMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7, vertexColors: true });
  const fb = new GeoBuilder();
  for (let i = 0; i < 24; i++) {
    const fx = -7.2 + i * 0.6;
    fb.add(new THREE.PlaneGeometry(0.5, 0.5), [0xe8453c, 0xffd23f, 0x1ec8ff, 0x3ddc84, 0xff7ab8][i % 5], { x: fx, y: 4.65 - Math.sin(i / 23 * Math.PI) * 0.0, z: 0.2, rx: 0.0 });
  }
  gate.add(meshOf(fb.build(), flagMat, false));

  // --- batiment principal (facade briques) ---
  const school = new THREE.Group();
  school.position.z = zGate - 38;
  const spec = { style: 1, cols: 16, floors: 3, depth: 14, tint: 0xf4e6dc, wall: 0x9a4c38, trim: 0xe6dccb, shop: 8, balc: false, mansard: false, uniform: true };
  const main = makeBuilding(spec, mulberry32(77));
  school.add(main);
  // portail central + pediment
  const pb = new BB();
  const W = spec.cols * BMOD;
  pb.g("matte").box(9, 0.5, 4.2, 0, 0.25, 1.4, 0xb8ad98);
  pb.g("matte").box(8.4, 0.3, 3.6, 0, 0.65, 1.4, 0xc8bda8);
  [-1, 1].forEach((s) => [0.4, 1.0].forEach((k, i) => { pb.g("matte").cyl(0.42, 0.46, 6.2, 14, s * (2.7 - i * 0.0 + k * 0.0), 3.9, 2.9, 0xf0e8d6, { ao: 0.2 }); }));
  pb.g("matte").box(7.4, 0.7, 1.4, 0, 7.2, 2.8, 0xe8dfcc);
  pb.g("matte").extrude([[-3.9, 0], [3.9, 0], [0, 1.8]], 1.4, 0.05, 0, 7.5, 2.8, 0xf0e8d6, {});
  pb.g("matte").box(3.4, 4.6, 0.3, 0, 3.0, 0.9, 0x5a3a24);
  pb.g("glass").box(1.5, 3.6, 0.05, -0.85, 3.2, 1.08, 0x22334a);
  pb.g("glass").box(1.5, 3.6, 0.05, 0.85, 3.2, 1.08, 0x22334a);
  // tour de l'horloge
  pb.g("matte").box(7, 6.0, 6.0, 0, 12.3, -3.4, 0x9a4c38, { ao: 0.1 });
  pb.g("matte").box(7.6, 0.5, 6.6, 0, 15.5, -3.4, 0xe6dccb);
  pb.g("matte").cone(5.4, 4.4, 4, 0, 18.0, -3.4, 0x4c5662, { ry: Math.PI / 4 });
  pb.g("metal").cyl(0.06, 0.06, 2.4, 6, 0, 21.2, -3.4, 0xcfa43a);
  school.add(pb.finish());
  const clockC = cv(256, 256), cx = clockC.getContext("2d");
  cx.fillStyle = "#f6f1e4"; cx.beginPath(); cx.arc(128, 128, 122, 0, 6.3); cx.fill();
  cx.strokeStyle = "#2a2a30"; cx.lineWidth = 8; cx.stroke();
  cx.fillStyle = "#2a2a30"; cx.font = "700 28px Rajdhani, Arial"; cx.textAlign = "center"; cx.textBaseline = "middle";
  for (let i = 1; i <= 12; i++) { const a = i / 12 * 6.283 - 1.5708; cx.fillText(String(i), 128 + Math.cos(a) * 94, 128 + Math.sin(a) * 94); }
  const clockT2 = new THREE.CanvasTexture(clockC); clockT2.encoding = THREE.sRGBEncoding;
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(2.1, 40), new THREE.MeshStandardMaterial({ map: clockT2, roughness: 0.4, emissiveMap: clockT2, emissive: 0xffffff, emissiveIntensity: 0.25 }));
  clockFace.position.set(0, 12.6, -0.36);
  school.add(clockFace);
  const hHand = new THREE.Group(), mHand = new THREE.Group();
  hHand.position.set(0, 12.6, -0.3); mHand.position.set(0, 12.6, -0.27);
  hHand.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.06).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x1b1b20 })));
  mHand.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.7, 0.05).translate(0, 0.8, 0), new THREE.MeshStandardMaterial({ color: 0x1b1b20 })));
  school.add(hHand, mHand);
  ambient.push(() => {
    const t = clockT;
    hHand.rotation.z = -(((8 + 55 / 60 + t / 3600) % 12) / 12) * Math.PI * 2;
    mHand.rotation.z = -(((55 + t / 60) % 60) / 60) * Math.PI * 2;
  });
  school.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(school);

  // --- cour : sol, mat de drapeau, paniers, arbres, bancs ---
  const cg = new THREE.PlaneGeometry(66, 100);
  const cu = cg.attributes.uv;
  for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * (66 / 2.4), cu.getY(i) * (100 / 2.4));
  const court = new THREE.Mesh(cg, GFX.mat.paving);
  court.rotation.x = -Math.PI / 2; court.position.set(0, 0.03, zGate - 50); court.receiveShadow = true;
  g.add(court);
  const mastB = new BB();
  mastB.g("metal").cyl(0.07, 0.1, 12, 10, -14, 6, -30, 0xc9ced6);
  mastB.g("metal").sphere(0.16, -14, 12.1, -30, 0xcfa43a, { ws: 8, hs: 6 });
  g.add(mastB.finish());
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1, 12, 4), new THREE.MeshStandardMaterial({ color: 0xd8372c, roughness: 0.7, side: THREE.DoubleSide }));
  flag.position.set(-12.3, 11, -30);
  g.add(flag);
  const fp = flag.geometry.attributes.position, f0 = fp.array.slice();
  ambient.push(() => {
    for (let i = 0; i < fp.count; i++) {
      const x = f0[i * 3] + 1.7;
      fp.setZ(i, Math.sin(clockT * 5 - x * 2.4) * 0.12 * x);
    }
    fp.needsUpdate = true;
  });
  // arbres de la cour
  for (let i = 0; i < 8; i++) {
    const t = PROP.tree[i % 2].clone();
    t.position.set((i % 2 ? 1 : -1) * rnd(14, 24), 0.03, zGate - 8 - i * 7);
    t.scale.setScalar(rnd(1.0, 1.4)); t.rotation.y = rnd(0, 6.3);
    g.add(t);
  }
  [-1, 1].forEach((s) => { for (let i = 0; i < 2; i++) { const b = PROP.bench.clone(); b.position.set(s * 10, 0.03, zGate - 14 - i * 12); b.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(b); } });

  // --- eleves qui acclament ---
  const kids = makeSchoolKids(18);
  kids.forEach((k, i) => {
    k.root.position.set(rnd(-13, 13), 0.03, zGate - 6 - rnd(0, 18));
    k.root.rotation.y = Math.PI + rnd(-0.5, 0.5);
    g.add(k.root);
    const ph = rnd(0, 6.3);
    ambient.push(() => {
      const near = clamp(1 - Math.abs((player.z || 0) - zGate) / 120, 0, 1);
      k.hips.position.y = 0.9 * k.S + Math.abs(Math.sin(clockT * (3 + near * 5) + ph)) * (0.02 + near * 0.12);
      k.armL.rotation.z = -Math.sin(clockT * 6 + ph) * 0.35 * near;
      k.armR.rotation.z = Math.sin(clockT * 6 + ph + 1) * 0.35 * near;
      k.head.rotation.z = Math.sin(clockT * 2 + ph) * 0.1;
    });
  });
  worldGroup.add(g);
}
