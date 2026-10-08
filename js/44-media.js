"use strict";
/* ============================================================================
   MEDIA — clip video de la course et mode photo
   - Clip : si l'option est activee (menu > CLIP VIDEO), la course est filmee (image 3D + chrono,
     vitesse, pilote et score incrustes) ; bouton TELECHARGER LE CLIP sur l'ecran de fin.
   - Mode photo (depuis la pause) : camera libre autour de la moto, filtres, flou d'arriere-plan,
     photo PNG en pleine resolution avec la signature MOTOR FURAX.
   ============================================================================ */
const CLIP = { rec: null, chunks: [], blob: null, mime: "", cv: null, ctx: null };
const clipSupported = () => !!(window.MediaRecorder && document.createElement("canvas").captureStream);

function clipStart() {
  clipDiscard();
  if (!save.clip || !clipSupported() || MANUAL) return;
  try {
    const H = 720, W = Math.round(H * (RENDER.cssW || innerWidth) / (RENDER.cssH || innerHeight) / 2) * 2;
    if (!CLIP.cv) { CLIP.cv = document.createElement("canvas"); CLIP.ctx = CLIP.cv.getContext("2d"); }
    CLIP.cv.width = Math.min(W, 1600); CLIP.cv.height = H;
    const stream = CLIP.cv.captureStream(30);
    const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
    const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    CLIP.rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : undefined);
    CLIP.mime = CLIP.rec.mimeType || mime || "video/webm";
    CLIP.chunks = [];
    CLIP.rec.ondataavailable = (e) => { if (e.data && e.data.size) CLIP.chunks.push(e.data); };
    CLIP.rec.onstop = () => {
      CLIP.blob = CLIP.chunks.length ? new Blob(CLIP.chunks, { type: CLIP.mime }) : null;
      $("btn-clip").classList.toggle("hidden", !CLIP.blob);
    };
    CLIP.rec.start(1000);
  } catch (e) { CLIP.rec = null; }
}
function clipPause(on) {
  if (!CLIP.rec) return;
  try { if (on && CLIP.rec.state === "recording") CLIP.rec.pause(); else if (!on && CLIP.rec.state === "paused") CLIP.rec.resume(); } catch (e) {}
}
function clipStop() {
  if (CLIP.rec && CLIP.rec.state !== "inactive") { try { CLIP.rec.stop(); } catch (e) {} }
  CLIP.rec = null;
}
function clipDiscard() { clipStop(); CLIP.blob = null; const b = $("btn-clip"); if (b) b.classList.add("hidden"); }
function clipDownload() {
  if (!CLIP.blob) return;
  downloadBlob(CLIP.blob, "motor-furax-" + curPilot().id + "-" + stamp() + (CLIP.mime.indexOf("mp4") >= 0 ? ".mp4" : ".webm"));
}
function stamp() { const d = new Date(); return todayKey() + "-" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + String(d.getSeconds()).padStart(2, "0"); }
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
// une image du clip : rendu 3D + incrustations (appele juste apres le rendu, tampon encore valide)
function clipFrame() {
  if (!CLIP.rec || CLIP.rec.state !== "recording") return;
  const c = CLIP.ctx, W = CLIP.cv.width, H = CLIP.cv.height, st = gameState;
  c.drawImage(RENDER.canvas, 0, 0, W, H);
  c.save();
  c.fillStyle = "rgba(5,8,14,.62)"; c.fillRect(16, 16, 330, 74);
  c.fillStyle = "#ffc531"; c.font = "900 30px Orbitron, Arial Black, sans-serif"; c.textBaseline = "top";
  c.fillText(st ? fmtSec(st.raceTime).replace(" s", "") + " s" : "", 28, 24);
  c.fillStyle = "#ffffff"; c.font = "700 20px Rajdhani, Arial, sans-serif";
  c.fillText(curPilot().name + " · " + Math.round(player.speed * 2.62) + " km/h" + (st ? " · score " + (st.score + Math.floor(st.distance)) : ""), 28, 60);
  c.font = "900 22px Orbitron, Arial Black, sans-serif"; c.textAlign = "right"; c.fillStyle = "rgba(255,255,255,.8)";
  c.fillText("MOTOR FURAX", W - 20, H - 40);
  c.restore();
}

/* -------------------------------- MODE PHOTO -------------------------------- */
const PHOTO = { on: false, yaw: 0.7, pitch: 0.22, dist: 7, pan: new THREE.Vector3(), filter: "normal", dof: 40, shot: false, drag: null, saved: null };
const PHOTO_FILTERS = {
  normal: { name: "NATUREL", sat: null, contrast: 1.07, desat: 0, tint: null },
  pop: { name: "POP", sat: 1.45, contrast: 1.16, desat: 0, tint: null },
  cine: { name: "CINÉ", sat: 0.92, contrast: 1.2, desat: 0, tint: [0.1, 0.45, 0.6, 0.12] },
  vintage: { name: "VINTAGE", sat: 0.7, contrast: 0.98, desat: 0, tint: [1, 0.62, 0.3, 0.16] },
  nb: { name: "NOIR & BLANC", sat: 1, contrast: 1.18, desat: 1, tint: null }
};
function enterPhoto() {
  if (app !== APP.PAUSE) return;
  PHOTO.on = true;
  PHOTO.yaw = 0.8; PHOTO.pitch = 0.3; PHOTO.dist = 9.5; PHOTO.pan.set(0, 0, 0);
  PHOTO.saved = { sat: RENDER.fx.sat, contrast: RENDER.fx.contrast, tilt: RENDER.fx.tilt, band: RENDER.fx.tiltBand };
  document.body.classList.add("photo-mode");
  $("photo-ui").classList.remove("hidden");
  renderPhotoFilters();
  audio.ui();
}
function exitPhoto() {
  if (!PHOTO.on) return;
  PHOTO.on = false;
  const s = PHOTO.saved;
  if (s) { RENDER.fx.sat = s.sat; RENDER.fx.contrast = s.contrast; RENDER.fx.tilt = s.tilt; RENDER.fx.tiltBand = s.band; }
  RENDER.fx.desat = 0; RENDER.fx.tintAmt = 0;
  document.body.classList.remove("photo-mode");
  $("photo-ui").classList.add("hidden");
  audio.ui();
}
function renderPhotoFilters() {
  const box = $("photo-filters");
  box.innerHTML = "";
  Object.keys(PHOTO_FILTERS).forEach((k) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "aid-chip" + (PHOTO.filter === k ? " on" : "");
    b.textContent = PHOTO_FILTERS[k].name;
    b.addEventListener("click", () => { PHOTO.filter = k; renderPhotoFilters(); });
    box.appendChild(b);
  });
}
function updatePhotoCam() {
  const T = _v.set(player.x, (player.worldY || 0) + 1.0, player.z).add(PHOTO.pan);
  const cp = Math.cos(PHOTO.pitch);
  camera.position.set(T.x + Math.sin(PHOTO.yaw) * cp * PHOTO.dist, Math.max(0.3, T.y + Math.sin(PHOTO.pitch) * PHOTO.dist), T.z + Math.cos(PHOTO.yaw) * cp * PHOTO.dist);
  camera.rotation.z = 0;
  camera.lookAt(T);
  if (Math.abs(camera.fov - 34) > 0.05) { camera.fov = 34; camera.updateProjectionMatrix(); }
  setViewShift(0);
}
// reglages du post-traitement (appele apres applyPostFx, avant le rendu)
function photoFx() {
  if (!PHOTO.on) return;
  const F = PHOTO_FILTERS[PHOTO.filter], fx = RENDER.fx;
  fx.sat = F.sat != null ? F.sat : PHOTO.saved.sat;
  fx.contrast = F.contrast; fx.desat = F.desat;
  if (F.tint) { fx.tint.setRGB(F.tint[0], F.tint[1], F.tint[2]); fx.tintAmt = F.tint[3]; } else fx.tintAmt = 0;
  fx.tilt = PHOTO.dof / 100 * 1.6; fx.tiltBand = 0.08;
  fx.radial = 0; fx.aberration = 0.0004;
}
function photoAfterRender() {
  if (!PHOTO.shot) return;
  PHOTO.shot = false;
  const src = RENDER.canvas, c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const x = c.getContext("2d");
  x.drawImage(src, 0, 0);
  const fs = Math.round(c.height * 0.035);
  x.font = "900 " + fs + "px Orbitron, Arial Black, sans-serif"; x.textAlign = "right"; x.textBaseline = "bottom";
  x.fillStyle = "rgba(0,0,0,.35)"; x.fillText("MOTOR FURAX", c.width - fs * 0.8 + 2, c.height - fs * 0.6 + 2);
  x.fillStyle = "rgba(255,255,255,.85)"; x.fillText("MOTOR FURAX", c.width - fs * 0.8, c.height - fs * 0.6);
  c.toBlob((b) => { if (b) downloadBlob(b, "motor-furax-photo-" + stamp() + ".png"); }, "image/png");
  flash("good", 160);
  audio.beep(1500, 0.06, "square", 0.08);
}
function setupMedia() {
  $("btn-clip").addEventListener("click", clipDownload);
  $("btn-photo").addEventListener("click", enterPhoto);
  $("btn-photo-exit").addEventListener("click", exitPhoto);
  $("btn-photo-shot").addEventListener("click", () => { PHOTO.shot = true; });
  $("photo-dof").addEventListener("input", (e) => { PHOTO.dof = +e.target.value; });
  const refreshC = () => { $("btn-clipopt").innerHTML = "CLIP VIDÉO : <b>" + (save.clip ? "OUI" : "NON") + "</b>"; };
  $("btn-clipopt").addEventListener("click", () => {
    if (!clipSupported()) { showPickup("CLIP NON DISPONIBLE SUR CE NAVIGATEUR"); return; }
    save.clip = !save.clip; persistSave(); audio.ui(); refreshC();
  });
  refreshC();
  const gl = $("webgl");
  gl.addEventListener("pointerdown", (e) => { if (!PHOTO.on) return; PHOTO.drag = { x: e.clientX, y: e.clientY }; gl.classList.add("photo-drag"); try { gl.setPointerCapture(e.pointerId); } catch (er) {} });
  gl.addEventListener("pointermove", (e) => {
    if (!PHOTO.on || !PHOTO.drag) return;
    PHOTO.yaw -= (e.clientX - PHOTO.drag.x) * 0.006;
    PHOTO.pitch = clamp(PHOTO.pitch + (e.clientY - PHOTO.drag.y) * 0.005, -0.05, 1.35);
    PHOTO.drag = { x: e.clientX, y: e.clientY };
  });
  const end = () => { PHOTO.drag = null; gl.classList.remove("photo-drag"); };
  gl.addEventListener("pointerup", end); gl.addEventListener("pointercancel", end);
  gl.addEventListener("wheel", (e) => { if (!PHOTO.on) return; e.preventDefault(); PHOTO.dist = clamp(PHOTO.dist * (e.deltaY > 0 ? 1.1 : 0.9), 2.2, 40); }, { passive: false });
  // clavier en mode photo (avant le gestionnaire general)
  window.addEventListener("keydown", (e) => {
    if (!PHOTO.on) return;
    const k = e.code, step = 0.6;
    if (k === "Escape" || k === "KeyP") exitPhoto();
    else if (k === "ArrowLeft") PHOTO.pan.x -= step;
    else if (k === "ArrowRight") PHOTO.pan.x += step;
    else if (k === "ArrowUp") PHOTO.pan.z -= step;
    else if (k === "ArrowDown") PHOTO.pan.z += step;
    else if (k === "Equal" || k === "NumpadAdd") PHOTO.dist = clamp(PHOTO.dist * 0.9, 2.2, 40);
    else if (k === "Minus" || k === "NumpadSubtract" || k === "Digit6") PHOTO.dist = clamp(PHOTO.dist * 1.1, 2.2, 40);
    else if (k === "Space" || k === "Enter") PHOTO.shot = true;
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
}
