"use strict";
/* ============================================================================
   MODEL KIT — outils de modelisation procedurale haute fidelite
   - GeoBuilder : assemble des primitives (boites arrondies, lathe, extrusions...)
     en UNE geometrie fusionnee, avec couleurs de sommets et occlusion ambiante
     "au sol" precalculee -> peu de draw calls, rendu riche.
   - Bibliotheque de materiaux PBR partages.
   ============================================================================ */

const GFX = { tex: {}, mat: {} };

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v3 = new THREE.Vector3(), _s3 = new THREE.Vector3(1, 1, 1);
const _col = new THREE.Color();

class GeoBuilder {
  constructor() { this.list = []; this.ground = null; }
  // geo : BufferGeometry ; o : { x,y,z, rx,ry,rz, sx,sy,sz, ao (0..1 sombre en bas de la piece), uvs:[u0,v0,u1,v1] }
  add(geo, color, o) {
    o = o || {};
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, "YXZ");
    _q.setFromEuler(_e);
    _v3.set(o.x || 0, o.y || 0, o.z || 0);
    _s3.set(o.sx != null ? o.sx : (o.s || 1), o.sy != null ? o.sy : (o.s || 1), o.sz != null ? o.sz : (o.s || 1));
    _m4.compose(_v3, _q, _s3);
    g.applyMatrix4(_m4);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _col.set(color != null ? color : 0xffffff);
    // dégradé d'occlusion sur la piece (bas plus sombre)
    let minY = Infinity, maxY = -Infinity;
    const P = g.attributes.position;
    if (o.ao) { for (let i = 0; i < n; i++) { const y = P.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; } }
    const span = Math.max(1e-4, maxY - minY);
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (o.ao) k = 1 - o.ao * (1 - Math.min(1, Math.max(0, (P.getY(i) - minY) / span * 1.6)));
      col[i * 3] = _col.r * k; col[i * 3 + 1] = _col.g * k; col[i * 3 + 2] = _col.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (o.uvs) {
      const U = g.attributes.uv;
      for (let i = 0; i < n; i++) U.setXY(i, o.uvs[0] + U.getX(i) * (o.uvs[2] - o.uvs[0]), o.uvs[1] + U.getY(i) * (o.uvs[3] - o.uvs[1]));
    }
    this.list.push(g);
    return this;
  }
  box(w, h, d, x, y, z, color, o) { return this.add(new THREE.BoxGeometry(w, h, d), color, Object.assign({ x: x, y: y, z: z }, o)); }
  rbox(w, h, d, r, x, y, z, color, o) { return this.add(new THREE.RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), color, Object.assign({ x: x, y: y, z: z }, o)); }
  cyl(rt, rb, h, seg, x, y, z, color, o) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg || 12), color, Object.assign({ x: x, y: y, z: z }, o)); }
  sphere(r, x, y, z, color, o) { return this.add(new THREE.SphereGeometry(r, (o && o.ws) || 14, (o && o.hs) || 10), color, Object.assign({ x: x, y: y, z: z }, o)); }
  ico(r, detail, x, y, z, color, o) { return this.add(new THREE.IcosahedronGeometry(r, detail || 1), color, Object.assign({ x: x, y: y, z: z }, o)); }
  cone(r, h, seg, x, y, z, color, o) { return this.add(new THREE.ConeGeometry(r, h, seg || 10), color, Object.assign({ x: x, y: y, z: z }, o)); }
  capsule(r, len, x, y, z, color, o) { return this.add(new THREE.CapsuleGeometry(r, len, 5, 12), color, Object.assign({ x: x, y: y, z: z }, o)); }
  torus(r, t, x, y, z, color, o) { return this.add(new THREE.TorusGeometry(r, t, 10, 24), color, Object.assign({ x: x, y: y, z: z }, o)); }
  plane(w, h, x, y, z, color, o) { return this.add(new THREE.PlaneGeometry(w, h), color, Object.assign({ x: x, y: y, z: z }, o)); }
  lathe(pts, seg, x, y, z, color, o) { return this.add(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg || 20), color, Object.assign({ x: x, y: y, z: z }, o)); }
  // profil 2D (x = avant/arriere, y = hauteur) extrude sur la largeur : carrosseries, silhouettes
  extrude(shapePts, depth, bevel, x, y, z, color, o) {
    const sh = new THREE.Shape();
    shapePts.forEach((p, i) => { if (i === 0) sh.moveTo(p[0], p[1]); else sh.lineTo(p[0], p[1]); });
    const b = bevel || 0;
    const g = new THREE.ExtrudeGeometry(sh, { depth: depth - b * 2, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -(depth - b * 2) / 2);
    return this.add(g, color, Object.assign({ x: x, y: y, z: z }, o));
  }
  build() {
    if (!this.list.length) return new THREE.BufferGeometry();
    const geo = THREE.BufferGeometryUtils.mergeBufferGeometries(this.list, false);
    this.list.forEach((g) => g.dispose());
    this.list = [];
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

// Fusion rapide de geometries deplacees (accessoires d'un troncon) : les sommets transformes sont ecrits
// directement dans les tableaux du resultat, sans clone intermediaire (3x plus rapide que
// clone + applyMatrix4 + mergeBufferGeometries). items = [{ g: BufferGeometry, m: Matrix4 }].
// Version en etapes : rend la main (yield) tous les ~sliceVerts sommets ; le resultat est la valeur de retour.
// Renvoie null si les geometries ne sont pas compatibles (l'appelant garde alors l'ancienne methode).
const _mtN = new THREE.Matrix3();
function* mergeTransformedSteps(items, sliceVerts) {
  if (!items.length) return null;
  const g0 = items[0].g, names = Object.keys(g0.attributes), indexed = !!g0.index;
  if (names.includes("tangent")) return null;
  let nv = 0, ni = 0;
  for (let k = 0; k < items.length; k++) {
    const g = items[k].g;
    if (!!g.index !== indexed || Object.keys(g.attributes).length !== names.length) return null;
    for (const n of names) {
      const a = g.attributes[n], a0 = g0.attributes[n];
      if (!a || a.isInterleavedBufferAttribute || a.itemSize !== a0.itemSize || a.array.constructor !== a0.array.constructor || a.normalized !== a0.normalized) return null;
    }
    nv += g.attributes.position.count;
    if (indexed) ni += g.index.count;
  }
  const out = new THREE.BufferGeometry(), arr = {};
  names.forEach((n) => { const a = g0.attributes[n]; arr[n] = new a.array.constructor(nv * a.itemSize); });
  const idx = indexed ? (nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni)) : null;
  let vo = 0, io = 0, slice = 0;
  for (let k = 0; k < items.length; k++) {
    const g = items[k].g, e = items[k].m.elements, cnt = g.attributes.position.count;
    _mtN.getNormalMatrix(items[k].m);
    const ne = _mtN.elements;
    for (const n of names) {
      const a = g.attributes[n], src = a.array, dst = arr[n], sz = a.itemSize;
      if (n === "position") {
        for (let i = 0, j = vo * 3; i < cnt * 3; i += 3, j += 3) {
          const x = src[i], y = src[i + 1], z = src[i + 2];
          dst[j] = e[0] * x + e[4] * y + e[8] * z + e[12];
          dst[j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          dst[j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
      } else if (n === "normal") {
        for (let i = 0, j = vo * 3; i < cnt * 3; i += 3, j += 3) {
          const x = src[i], y = src[i + 1], z = src[i + 2];
          const nx = ne[0] * x + ne[3] * y + ne[6] * z, ny = ne[1] * x + ne[4] * y + ne[7] * z, nz = ne[2] * x + ne[5] * y + ne[8] * z;
          const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          dst[j] = nx / l; dst[j + 1] = ny / l; dst[j + 2] = nz / l;
        }
      } else {
        dst.set(src.length === cnt * sz ? src : src.subarray(0, cnt * sz), vo * sz);
      }
    }
    if (indexed) { const s = g.index.array; for (let i = 0; i < g.index.count; i++) idx[io + i] = s[i] + vo; io += g.index.count; }
    vo += cnt; slice += cnt;
    // les geometries sources (partagees) ne changent pas entre deux etapes : on peut s'interrompre ici
    if (sliceVerts && slice >= sliceVerts && k < items.length - 1) { slice = 0; yield; }
  }
  names.forEach((n) => out.setAttribute(n, new THREE.BufferAttribute(arr[n], g0.attributes[n].itemSize, g0.attributes[n].normalized)));
  if (idx) out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
function mergeTransformed(items) {
  const it = mergeTransformedSteps(items, 0);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/* ------------------------------- MATERIAUX ------------------------------- */
// Un seul materiau PBR "universel" pour toutes les pieces en couleurs de sommets :
// rugosite / metal / emissif sont portes par un attribut de sommet (aPBR). Resultat : un batiment,
// un vehicule ou un personnage = 1 seul draw call pour toutes ses matieres.
const PBR_PRESETS = {
  matte: [0.88, 0.0, 0.0], paint: [0.26, 0.28, 0.0], metal: [0.34, 0.92, 0.0], chrome: [0.12, 1.0, 0.0],
  rubber: [0.92, 0.0, 0.0], plastic: [0.5, 0.0, 0.0], cloth: [0.96, 0.0, 0.0], skin: [0.62, 0.0, 0.0],
  foliage: [0.85, 0.0, 0.0], glass: [0.04, 0.55, 0.0], glow: [1.0, 0.0, 2.8]
};
function addPBR(geo, preset) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = preset[0]; a[i * 3 + 1] = preset[1]; a[i * 3 + 2] = preset[2]; }
  geo.setAttribute("aPBR", new THREE.BufferAttribute(a, 3));
  return geo;
}
function buildMaterials() {
  const uni = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 1.15 });
  uni.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aPBR;\nvarying vec3 vPBR;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPBR = aPBR;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPBR;")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vPBR.x;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vPBR.y;")
      .replace("#include <emissivemap_fragment>", "totalEmissiveRadiance += diffuseColor.rgb * vPBR.z;");
  };
  uni.customProgramCacheKey = () => "uni-pbr";
  GFX.mat.uni = uni;
  // materiaux "nommes" : simples marqueurs de preset (meshOf les redirige vers le materiau universel)
  Object.keys(PBR_PRESETS).forEach((k) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: PBR_PRESETS[k][0], metalness: PBR_PRESETS[k][1] });
    m.userData.preset = k;
    GFX.mat[k] = m;
  });
}

// Cree un mesh partage (castShadow par defaut). Redirige les materiaux nommes vers le materiau universel.
function meshOf(geo, mat, shadow) {
  if (mat && mat.userData && mat.userData.preset && geo.attributes.color) {
    if (!geo.attributes.aPBR) addPBR(geo, PBR_PRESETS[mat.userData.preset]);
    mat = GFX.mat.uni;
  }
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow !== false;
  m.receiveShadow = true;
  return m;
}
