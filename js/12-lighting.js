"use strict";
/* ============================================================================
   LUMIERE — matinée dorée : soleil bas et chaud, ciel procédural, IBL,
   brume atmosphérique et ombres directionnelles stabilisées (pas de scintillement).
   ============================================================================ */

const SUN_DIR = new THREE.Vector3(-0.52, 0.74, 0.43).normalize();
const SKY_VS = [
  "varying vec3 vP;",
  "void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
].join("\n");
const SKY_FS = [
  "precision highp float;",
  "varying vec3 vP;",
  "uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol;",
  "uniform float uClouds; uniform float uTime;",
  "float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
  "float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);",
  "  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }",
  "float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }",
  "void main(){",
  "  vec3 d = normalize(vP);",
  "  float h = d.y;",
  "  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.2, h));",
  "  c = mix(c, uTop, smoothstep(0.14, 0.85, h));",
  "  c = mix(c, uHor * 0.92, smoothstep(0.0, -0.25, h));",
  "  float s = max(dot(d, uSunDir), 0.0);",
  "  c += uSunCol * (pow(s, 900.0) * 14.0 + pow(s, 40.0) * 0.5 + pow(s, 5.0) * 0.16);",
  "  if (uClouds > 0.5) {",
  "    vec2 cp = d.xz / (h + 0.16) * 0.42 + vec2(uTime * 0.006, 0.0);",
  "    float cl = smoothstep(0.48, 0.86, fbm(cp)) * smoothstep(0.015, 0.28, h);",
  "    vec3 cc = mix(vec3(1.0, 0.93, 0.82), vec3(0.78, 0.84, 0.95), smoothstep(0.1, 0.6, h));",
  "    c = mix(c, cc * (0.85 + 0.5 * pow(s, 3.0)), cl * 0.78);",
  "  }",
  "  gl_FragColor = vec4(c, 1.0);",
  "}"
].join("\n");

const SKY_COLORS = {
  top: 0x3a72c8, mid: 0x9cc2ea, hor: 0xf1dcc4, sun: 0xffd9a8,
  fog: 0xe6d3bf
};
let skyMesh = null, skyUniforms = null;

function makeSkyMaterial(withClouds) {
  skyUniforms = {
    uTop: { value: new THREE.Color(SKY_COLORS.top) },
    uMid: { value: new THREE.Color(SKY_COLORS.mid) },
    uHor: { value: new THREE.Color(SKY_COLORS.hor) },
    uSunDir: { value: SUN_DIR.clone() },
    uSunCol: { value: new THREE.Color(SKY_COLORS.sun) },
    uClouds: { value: withClouds ? 1 : 0 },
    uTime: { value: 0 }
  };
  return new THREE.ShaderMaterial({
    uniforms: skyUniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS,
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false
  });
}

function buildEnvironmentMap() {
  // Ciel sans nuages -> PMREM : eclairage ambiant + reflets sur metal, vitres et carrosseries
  const envScene = new THREE.Scene();
  const mat = makeSkyMaterial(false);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
  envScene.add(sphere);
  // sol chaud pour les rebonds de lumiere
  const floor = new THREE.Mesh(new THREE.CircleGeometry(95, 32), new THREE.MeshBasicMaterial({ color: 0x5a4c40 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.5;
  envScene.add(floor);
  const pm = new THREE.PMREMGenerator(RENDER.renderer);
  pm.compileCubemapShader();
  const rt = pm.fromScene(envScene, 0.015);
  pm.dispose();
  sphere.geometry.dispose(); mat.dispose();
  return rt.texture;
}

function buildSky() {
  scene.environment = buildEnvironmentMap();
  skyMesh = new THREE.Mesh(new THREE.SphereGeometry(820, 36, 20), makeSkyMaterial(true));
  skyMesh.renderOrder = -10;
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  scene.fog = new THREE.FogExp2(SKY_COLORS.fog, 0.0043);

  const hemi = new THREE.HemisphereLight(0xdbe6ff, 0x8a7560, 0.5);
  scene.add(hemi);

  dirLight = new THREE.DirectionalLight(0xffe0b0, 2.35);
  dirLight.castShadow = true;
  dirLight.shadow.camera.left = -46; dirLight.shadow.camera.right = 46;
  dirLight.shadow.camera.top = 74; dirLight.shadow.camera.bottom = -74;
  dirLight.shadow.camera.near = 20; dirLight.shadow.camera.far = 300;
  dirLight.shadow.bias = -0.00045;
  dirLight.shadow.normalBias = 0.045;
  dirLight.shadow.mapSize.set(2048, 2048);
  sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  dirLight.target = sunTarget;
  scene.add(dirLight);
  RENDER.shadowRefresh = (size) => {
    dirLight.shadow.mapSize.set(size, size);
    if (dirLight.shadow.map) { dirLight.shadow.map.dispose(); dirLight.shadow.map = null; }
  };
  RENDER.shadowRefresh(RENDER.cfg.shadow);
}

// Place le soleil autour du joueur ; la position est calee sur la grille des texels pour que
// les ombres ne "nagent" pas pendant le deplacement.
const _sunRight = new THREE.Vector3(), _sunUp = new THREE.Vector3(), _sunTmp = new THREE.Vector3();
function updateSun(focus) {
  if (!dirLight) return;
  const sc = dirLight.shadow.camera;
  const size = dirLight.shadow.mapSize.x || 2048;
  const texel = (sc.right - sc.left) / size;
  _sunRight.crossVectors(THREE.Object3D.DefaultUp, SUN_DIR).normalize();
  _sunUp.crossVectors(SUN_DIR, _sunRight).normalize();
  const fx = _sunTmp.copy(focus).dot(_sunRight), fy = _sunTmp.dot(_sunUp);
  const sx = Math.round(fx / texel) * texel, sy = Math.round(fy / texel) * texel;
  sunTarget.position.copy(focus).addScaledVector(_sunRight, sx - fx).addScaledVector(_sunUp, sy - fy);
  dirLight.position.copy(sunTarget.position).addScaledVector(SUN_DIR, 150);
  sunTarget.updateMatrixWorld();
}
