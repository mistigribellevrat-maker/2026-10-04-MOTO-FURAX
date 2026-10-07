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

/* ------------------------------- MATERIAUX ------------------------------- */
function buildMaterials() {
  const mk = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true }, o));
  GFX.mat.matte = mk({ roughness: 0.88, metalness: 0.0 });
  GFX.mat.paint = mk({ roughness: 0.26, metalness: 0.28, envMapIntensity: 1.25 });
  GFX.mat.metal = mk({ roughness: 0.34, metalness: 0.92, envMapIntensity: 1.2 });
  GFX.mat.chrome = mk({ roughness: 0.12, metalness: 1.0, envMapIntensity: 1.5 });
  GFX.mat.rubber = mk({ roughness: 0.92, metalness: 0.0 });
  GFX.mat.plastic = mk({ roughness: 0.5, metalness: 0.0 });
  GFX.mat.cloth = mk({ roughness: 0.96, metalness: 0.0 });
  GFX.mat.skin = mk({ roughness: 0.62, metalness: 0.0 });
  GFX.mat.glass = new THREE.MeshStandardMaterial({ color: 0x0c1a28, roughness: 0.04, metalness: 0.55, envMapIntensity: 1.7, vertexColors: true });
  GFX.mat.foliage = mk({ roughness: 0.85, metalness: 0.0, side: THREE.FrontSide });
  GFX.mat.glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  GFX.mat.glow.color.setScalar(2.6);
}

// Cree un mesh partage (castShadow par defaut)
function meshOf(geo, mat, shadow) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow !== false;
  m.receiveShadow = true;
  return m;
}
