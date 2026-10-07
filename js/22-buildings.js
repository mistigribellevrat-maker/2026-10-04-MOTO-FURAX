"use strict";
/* ============================================================================
   BATIMENTS — prefabs modulaires : facade PBR, devanture, corniches, balcons,
   auvents, toits (mansardes, climatisations, citernes, panneaux, antennes).
   Chaque prefab = quelques meshes fusionnes (peu de draw calls), clones a la demande.
   ============================================================================ */

const BMOD = 3.2, BGH = 4.2, BFH = 3.3;
const BUILD = { protos: { residential: [], shops: [], downtown: [], school: [] }, billboard: null };

class BB {
  constructor() { this.b = {}; }
  g(k) { return this.b[k] || (this.b[k] = new GeoBuilder()); }
  finish() {
    const grp = new THREE.Group();
    Object.keys(this.b).forEach((k) => {
      const geo = this.b[k].build();
      if (!geo.attributes.position || !geo.attributes.position.count) return;
      let mat;
      if (k[0] === "f" && k.length === 2) mat = GFX.mat.facade[+k[1]];
      else mat = GFX.mat[k];
      const m = meshOf(geo, mat, k !== "glass" && k !== "glow");
      m.name = k;
      grp.add(m);
    });
    return grp;
  }
}

function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); }

function makeBuilding(spec, rng) {
  const bb = new BB();
  const W = spec.cols * BMOD, D = spec.depth || 12, F = spec.floors;
  const H = spec.uniform ? F * BFH + 0.9 : BGH + (F - 1) * BFH;
  const tint = spec.tint || 0xffffff;
  const wall = spec.wall || 0xcfc5b2;
  const trim = spec.trim || shade(wall, 1.08);
  const style = spec.style;

  // corps plein : projette l'ombre, murs mitoyens
  bb.g("matte").box(W, H, D, 0, H / 2, -D / 2 - 0.03, wall, { ao: 0.28 });
  // facade haute
  const u0 = [0, 0.25, 0.5, 0.75][Math.floor(rng() * 4)];
  if (spec.uniform) {
    bb.g("f" + style).plane(W, H, 0, H / 2, 0, tint, { ao: 0.2, uvs: [u0, 0, u0 + spec.cols / 4, H / (2 * BFH)] });
  } else {
    bb.g("f" + style).plane(W, H - BGH, 0, BGH + (H - BGH) / 2, 0, tint, { uvs: [u0, 0, u0 + spec.cols / 4, (F - 1) / 2] });
  }
  // murs mitoyens apparents : memes fenetres, sur toute la hauteur
  [-1, 1].forEach((sd) => {
    const su0 = [0, 0.25, 0.5, 0.75][Math.floor(rng() * 4)];
    bb.g("f" + style).plane(D, H, sd * (W / 2 + 0.02), H / 2, -D / 2, shade(tint, 0.94), { ry: sd * Math.PI / 2, ao: 0.25, uvs: [su0, 0, su0 + D / 12.8, H / 6.6] });
  });
  // devanture / entree
  const si = spec.shop;
  const sx = (si % SHOP.COLS) * SHOP.W / (SHOP.W * SHOP.COLS), sy = 1 - (Math.floor(si / SHOP.COLS) + 1) * SHOP.H / (SHOP.H * SHOP.ROWS);
  if (!spec.uniform) bb.g("shop").plane(W, BGH, 0, BGH / 2, 0.02, 0xffffff, { ao: 0.3, uvs: [sx, sy, sx + 1 / SHOP.COLS, sy + 1 / SHOP.ROWS] });

  // moulures
  if (!spec.uniform) bb.g("matte").box(W + 0.5, 0.34, 0.5, 0, BGH + 0.02, 0.2, trim);
  bb.g("matte").box(W + 0.9, 0.5, 1.0, 0, H - 0.05, 0.42, trim);
  bb.g("matte").box(W + 0.6, 0.22, 0.7, 0, H + 0.3, 0.2, shade(trim, 0.92));
  [-1, 1].forEach((s) => bb.g("matte").box(0.5, H, 0.34, s * (W / 2 - 0.2), H / 2, 0.14, shade(trim, 0.95)));
  if (style === 0 || style === 5) {
    for (let f = 2; f < F; f += 2) bb.g("matte").box(W + 0.2, 0.2, 0.2, 0, BGH + (f - 1) * BFH, 0.12, trim);
  }
  if (style === 1) bb.g("matte").box(W + 0.15, 0.16, 0.14, 0, BGH + 0.6, 0.1, shade(trim, 0.85));

  // balcons 3D
  if (spec.balc) {
    const rail = 0x24262b;
    for (let f = 2; f < F; f += 2) {
      const y = BGH + (f - 1) * BFH - 0.15;
      for (let c = 0; c < spec.cols; c++) {
        if (rng() < 0.15) continue;
        const x = -W / 2 + (c + 0.5) * BMOD;
        bb.g("matte").box(2.5, 0.16, 0.95, x, y, 0.47, trim, { ao: 0.2 });
        bb.g("metal").box(2.5, 0.07, 0.06, x, y + 1.02, 0.92, rail);
        bb.g("metal").box(2.5, 0.05, 0.05, x, y + 0.2, 0.92, rail);
        for (let k = 0; k < 9; k++) bb.g("metal").box(0.04, 0.84, 0.04, x - 1.15 + k * 0.29, y + 0.62, 0.92, rail);
        [-1, 1].forEach((s) => { bb.g("metal").box(0.05, 0.07, 0.9, x + s * 1.22, y + 1.02, 0.47, rail); });
      }
    }
  }
  // climatiseurs en facade
  for (let i = 0; i < 2 + Math.floor(rng() * 4); i++) {
    const f = 1 + Math.floor(rng() * (F - 1)), c = Math.floor(rng() * spec.cols);
    bb.g("plastic").box(0.78, 0.5, 0.42, -W / 2 + (c + 0.5) * BMOD + 1.0, BGH + (f - 1) * BFH + 0.5, 0.26, 0xdcdde0);
  }
  // auvent 3D des commerces
  if (spec.awning) {
    const n = 10, aw = (W * 0.86) / n;
    const shape = [[0, 0], [1.45, -0.42], [1.45, -0.6], [0, -0.14]];
    for (let i = 0; i < n; i++) {
      const sh = new THREE.Shape(); shape.forEach((p, k) => { if (k === 0) sh.moveTo(p[0], p[1]); else sh.lineTo(p[0], p[1]); });
      const g = new THREE.ExtrudeGeometry(sh, { depth: aw * 0.98, bevelEnabled: false });
      bb.g("cloth").add(g, i % 2 ? 0xf3efe6 : spec.awning, { ry: -Math.PI / 2, x: -W * 0.43 + i * aw + aw * 0.98, y: 3.35, z: 0.05 });
    }
  }
  if (spec.shop >= 8 && !spec.uniform) { // perron
    bb.g("matte").box(3.0, 0.22, 1.1, 0, 0.11, 0.62, 0xb8b2a6, { ao: 0.2 });
    bb.g("matte").box(2.6, 0.22, 0.8, 0, 0.33, 0.46, 0xc4beb2);
  }

  // ----- toit -----
  const roofY = H + 0.42;
  if (spec.mansard) {
    const slate = 0x59616d;
    const prof = [[0, 0], [D, 0], [D - 1.6, 3.0], [1.6, 3.0]];
    bb.g("matte").extrude(prof, W + 0.3, 0, 0, H + 0.3, 0, slate, { ry: Math.PI / 2, z: 0.15 });
    // plan z du profil : x du profil = profondeur -> on le place en -z
    for (let i = 0; i < Math.max(2, spec.cols - 1); i++) {
      const x = -W / 2 + (i + 0.5) * (W / Math.max(2, spec.cols - 1)) + (W / Math.max(2, spec.cols - 1)) * 0.0;
      bb.g("matte").box(1.3, 1.5, 0.9, x, H + 1.0, 0.2, shade(wall, 1.05));
      bb.g("glass").box(0.85, 1.05, 0.06, x, H + 1.05, 0.67, 0x1a2838);
      bb.g("matte").add(new THREE.ConeGeometry(1.05, 0.8, 4), slate, { x: x, y: H + 2.15, z: 0.2, ry: Math.PI / 4, sx: 1.0, sz: 0.8 });
    }
  } else {
    bb.g("roof").plane(W + 0.1, D + 0.1, 0, roofY - 0.2, -D / 2, 0xffffff, { rx: -Math.PI / 2, uvs: [0, 0, (W + 1) / 7, (D + 1) / 7] });
    [[0, 0.1, W + 0.5, 0.3], [0, -D + 0.1, W + 0.5, 0.3]].forEach((p) => bb.g("matte").box(p[2], 0.7, p[3], p[0], H + 0.55, p[1] - 0.1, shade(trim, 0.9)));
    [-1, 1].forEach((s) => bb.g("matte").box(0.3, 0.7, D, s * (W / 2 + 0.1), H + 0.55, -D / 2, shade(trim, 0.9)));
    const nProps = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < nProps; i++) {
      const px = (rng() - 0.5) * (W - 3), pz = -1.5 - rng() * (D - 3), r = rng();
      if (r < 0.34) {
        bb.g("metal").box(1.5, 0.95, 1.3, px, roofY + 0.45, pz, 0xb9bec6, { ao: 0.2 });
        bb.g("matte").cyl(0.44, 0.44, 0.06, 16, px, roofY + 0.95, pz, 0x2a2c31);
        bb.g("metal").cyl(0.05, 0.05, 0.4, 6, px, roofY + 1.15, pz, 0x888e98);
      } else if (r < 0.52) {
        bb.g("matte").box(W * 0.16, 2.5, 3.0, px, roofY + 1.2, pz, shade(wall, 0.95), { ao: 0.2 });
        bb.g("matte").box(W * 0.16 + 0.2, 0.2, 3.2, px, roofY + 2.6, pz, shade(trim, 0.9));
      } else if (r < 0.7 && F > 4) {
        bb.g("matte").cyl(1.1, 1.1, 2.1, 14, px, roofY + 2.05, pz, 0x7a5a3c, { ao: 0.2 });
        bb.g("matte").cone(1.2, 0.7, 14, px, roofY + 3.45, pz, 0x4b3a2a);
        [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].forEach((l) => bb.g("metal").box(0.12, 1.1, 0.12, px + l[0], roofY + 0.55, pz + l[1], 0x333840));
      } else if (r < 0.86) {
        for (let k = 0; k < 3; k++) bb.g("glass").box(1.6, 0.06, 1.0, px + k * 1.8 - 1.8, roofY + 0.55, pz, 0x12233f, { rx: -0.45 });
      } else {
        bb.g("metal").cyl(0.04, 0.04, 3 + rng() * 2, 5, px, roofY + 2.2, pz, 0x30353d);
        bb.g("glow").sphere(0.1, px, roofY + 4.6, pz, 0xff3a4a, { ws: 6, hs: 5 });
      }
    }
    if (spec.billboard) {
      bb.g("matte").box(7.2, 3.6, 0.3, 0, roofY + 3.1, -0.8, 0x22262e);
      bb.g("metal").box(0.3, 2.4, 0.3, -2.8, roofY + 1.2, -0.8, 0x30353d);
      bb.g("metal").box(0.3, 2.4, 0.3, 2.8, roofY + 1.2, -0.8, 0x30353d);
      bb.g("billboard").plane(6.8, 3.2, 0, roofY + 3.1, -0.62, 0xffffff);
    }
  }
  const grp = bb.finish();
  grp.userData = { W: W, D: D, H: H };
  return grp;
}

function buildBuildingPrefabs() {
  const rng = mulberry32(2024);
  // billboard SSB
  const bc = cv(1024, 512), bx = bc.getContext("2d");
  const g = bx.createLinearGradient(0, 0, 1024, 512); g.addColorStop(0, "#08142e"); g.addColorStop(1, "#14377a");
  bx.fillStyle = g; bx.fillRect(0, 0, 1024, 512);
  bx.fillStyle = "#ff2e4d"; bx.fillRect(0, 440, 1024, 14);
  bx.fillStyle = "#fff"; bx.font = "900 210px 'Arial Black', Impact, sans-serif"; bx.textAlign = "left"; bx.textBaseline = "alphabetic";
  bx.fillText("SSB", 50, 270);
  bx.font = "700 62px Rajdhani, Arial, sans-serif"; bx.fillStyle = "#9fc3ff"; bx.fillText("ENERGY — ÇA PIQUE, ÇA FILE", 54, 360);
  bx.fillStyle = "#ffd23f"; bx.font = "700 44px Rajdhani, Arial, sans-serif"; bx.fillText("Ne lâche pas la poignée !", 56, 420);
  bx.fillStyle = "#1ec8ff"; bx.beginPath(); bx.roundRect ? bx.roundRect(760, 70, 170, 340, 40) : bx.rect(760, 70, 170, 340); bx.fill();
  bx.fillStyle = "#fff"; bx.fillRect(760, 200, 170, 90);
  bx.fillStyle = "#08142e"; bx.font = "900 70px 'Arial Black', Impact, sans-serif"; bx.textAlign = "center"; bx.fillText("SSB", 845, 268);
  const bt = new THREE.CanvasTexture(bc); bt.encoding = THREE.sRGBEncoding; bt.anisotropy = 8;
  GFX.tex.billboard = bt;
  GFX.mat.billboard = new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0, vertexColors: true });

  const pal = {
    0: [0xffffff, 0xfff1d6, 0xf7e6cf, 0xeef0f6],
    1: [0xffffff, 0xf2dcd3, 0xe9c9bd, 0xf6e6e0],
    2: [0xffd9a8, 0xbfe0c8, 0xcbd8f2, 0xf4c8d4, 0xf6e7a0, 0xf0b9a0],
    3: [0xffffff, 0xd6e6ff, 0xdafff0],
    4: [0xffffff, 0xf4eadc, 0xe6e6ee],
    5: [0xffffff, 0xf6e6c8, 0xf0e0d0]
  };
  const wallOf = { 0: 0xd8cbb1, 1: 0x9a4c38, 2: 0xe9dcc2, 3: 0x4c5764, 4: 0xb3b0a8, 5: 0xd4c49c };
  const pick2 = (a) => a[Math.floor(rng() * a.length)];
  const mk = (zone, style, cols, floors, extra) => {
    const spec = Object.assign({
      style: style, cols: cols, floors: floors, depth: 11 + Math.floor(rng() * 5),
      tint: pick2(pal[style]), wall: wallOf[style], shop: 0, balc: false, awning: null, mansard: false, billboard: false
    }, extra || {});
    BUILD.protos[zone].push(makeBuilding(spec, rng));
  };
  const awn = ["#c0392b", "#e0a22e", "#2e6fce", "#3a8f3a", "#8a2b2b", "#c25a8a"];
  // residentiel : 2-4 etages, entrees d'immeuble
  for (let i = 0; i < 7; i++) {
    const st = [2, 1, 2, 0, 2, 1, 4][i];
    mk("residential", st, 4 + (i % 3), 3 + (i % 3), { shop: 8 + (i % 2), balc: st !== 0 && i % 2 === 0, mansard: st === 0 });
  }
  // commercants : 4-6 etages, devantures animees
  for (let i = 0; i < 9; i++) {
    const st = [0, 1, 2, 5, 0, 1, 2, 5, 0][i];
    mk("shops", st, 4 + (i % 2), 4 + (i % 3), { shop: i % 8, awning: i % 3 === 0 ? null : awn[i % awn.length], balc: st === 1 || st === 2, mansard: st === 0 });
  }
  // centre-ville : tours 7-12 etages, verre et haussmannien
  for (let i = 0; i < 8; i++) {
    const st = [3, 0, 5, 3, 4, 3, 0, 5][i];
    mk("downtown", st, 5 + (i % 3), 7 + (i * 2) % 6, { shop: [6, 0, 2, 3, 1, 6, 4, 7][i], awning: i % 2 ? awn[i % awn.length] : null, mansard: st === 0, billboard: i === 3 || i === 5, balc: st === 4 });
  }
  // abords du college
  for (let i = 0; i < 4; i++) mk("school", [2, 1, 4, 2][i], 4, 3 + (i % 2), { shop: 8 + (i % 2), balc: i % 2 === 0 });
}

// Place un prefab de batiment sur un cote de la rue ; renvoie { obj, W (largeur sur l'axe z) }
function placeBuildingProto(zone, rng, side, baseX, zStart, maxW) {
  let list = BUILD.protos[zone] || BUILD.protos.residential;
  if (maxW) { const f = list.filter((p) => p.userData.W <= maxW); if (!f.length) return null; list = f; }
  const proto = list[Math.floor(rng() * list.length)];
  const W = proto.userData.W;
  const obj = proto.clone();
  obj.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  // largeur le long de z ; gauche : x local -> -z monde, droite : x local -> +z monde
  obj.position.set(baseX, 0, side < 0 ? zStart + W / 2 : zStart + W / 2);
  return { obj: obj, W: W, H: proto.userData.H, D: proto.userData.D };
}
