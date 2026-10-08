"use strict";
/* ============================================================================
   PILOTES — ecran de choix (avec emplacements photo) et pouvoirs speciaux (touche E)
     OSCAR      SUPER SAUT   : bond geant, meme en plein vol
     ARTHUR     BELIER       : 4 s a renverser tout ce qui est bas, sans degats
     TOM        HYPER NITRO  : nitro pleine et illimitee 3 s
     YANIS      ESQUIVE      : ecart eclair, intouchable 0,6 s
     CLOTHILDE  APPEL A PAPA : papa decroche et s'arrete 4 s
   ============================================================================ */
const SILHOUETTE = '<svg viewBox="0 0 64 64"><circle cx="32" cy="22" r="13"/><path d="M8 62c0-14 10.7-22 24-22s24 8 24 22z"/></svg>';
const hex = (c) => "#" + c.toString(16).padStart(6, "0");

function pilotPhoto(p) {
  const wrap = document.createElement("div");
  wrap.className = "pilot-photo";
  wrap.innerHTML = '<img alt="' + p.name + '"><div class="ph">' + SILHOUETTE + "<small>" + CFG.PILOT_PHOTO_DIR + p.id + ".jpg</small></div>";
  const img = wrap.querySelector("img");
  img.onload = () => wrap.classList.add("has-image");
  img.onerror = () => wrap.classList.remove("has-image");
  img.src = CFG.PILOT_PHOTO_DIR + p.id + ".jpg";
  return wrap;
}
function renderPilots() {
  const grid = $("pilot-grid");
  grid.innerHTML = "";
  PILOTS.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "pilot-card" + (save.pilot === i ? " selected" : "");
    card.style.setProperty("--pc", p.accent);
    card.appendChild(pilotPhoto(p));
    const info = document.createElement("div");
    info.innerHTML = "<h3>" + p.name + "</h3><div class='nick'>" + p.nick + "</div><div class='shop-stats'>" +
      p.stats.map((v, k) => statRow(PILOT_STATS[k], v)).join("") + "</div>";
    card.appendChild(info);
    card.addEventListener("click", () => selectPilot(i));
    card.addEventListener("dblclick", () => { selectPilot(i); startRace(); });
    grid.appendChild(card);
  });
  renderPilotDetail();
  $("pilot-level").textContent = LEVELS[save.level].name;
}
function renderPilotDetail() {
  const p = curPilot();
  $("pilot-detail").innerHTML =
    "<div><h4>STYLE · " + p.name + "</h4><p>" + p.passive + "</p></div>" +
    "<div class='pw'><h4>POUVOIR (E)</h4><p><b>" + p.power.name + "</b> — " + p.power.desc + " <span style='color:#8d99ae'>(recharge " + p.power.cd + " s)</span></p></div>";
}
function selectPilot(i) {
  i = (i + PILOTS.length) % PILOTS.length;
  if (i === save.pilot && player.builtPilot === i) return;
  save.pilot = i;
  persistSave();
  audio.ui();
  document.querySelectorAll("#pilot-grid .pilot-card").forEach((c, k) => c.classList.toggle("selected", k === i));
  const sel = document.querySelectorAll("#pilot-grid .pilot-card")[i];
  if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest", inline: "center" });
  renderPilotDetail();
  refreshMenuInfo();
  buildPlayer(); player.root.position.set(player.x, 0, player.z); player.root.visible = true;
}
function openPilotSelect() {
  renderPilots();
  openModal("modal-pilot");
}

/* --------------------------------- POUVOIRS --------------------------------- */
let shieldMesh = null;
function ensureShield() {
  if (shieldMesh) return;
  shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false
  }));
  shieldMesh.scale.set(1, 0.9, 1.5);
  shieldMesh.renderOrder = 4;
  worldGroup.add(shieldMesh);
}
function newPowerState() { return { cd: 2, active: 0, kind: curPilot().power.id }; }
function powerActive(id) { const st = gameState; return !!(st && st.power && st.power.kind === id && st.power.active > 0); }
function usePower(st) {
  const pw = st.power, P = curPilot().power;
  if (pw.cd > 0 || st.endSeq) { if (pw.cd > 0) audio.beep(200, 0.08, "square", 0.05); return false; }
  pw.cd = P.cd;
  audio.power();
  if (P.id === "superjump") {
    player.vy = Math.max(player.vy, 15.5);
    player.grounded = false; player.airT = 0;
    smokePuff(player.x, player.worldY + 0.2, player.z + 0.5, { s0: 0.7, a0: 0.4 });
    sparksBurst(player.x, player.worldY + 0.3, player.z + 0.5, 10, { power: 4 });
    showAlert("SUPER SAUT !", "gold", 900);
  } else if (P.id === "ram") {
    pw.active = 4;
    showAlert("BÉLIER !", "gold", 900);
  } else if (P.id === "hyper") {
    pw.active = 3; st.nitro = 100;
    showAlert("HYPER NITRO !", "cyan", 900);
  } else if (P.id === "dash") {
    const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    player.dashDir = s || (player.x > 0 ? -1 : 1);
    player.dash = 0.2; pw.active = 0.6;
    audio.whoosh();
    showAlert("ESQUIVE !", "cyan", 700);
  } else if (P.id === "call") {
    dad.callT = 4;
    showAlert("ALLÔ PAPA ? IL DÉCROCHE…", "cyan", 1600);
  }
  return true;
}
function updatePower(dt, st) {
  const pw = st.power;
  if (pw.cd > 0) pw.cd = Math.max(0, pw.cd - dt);
  if (pw.active > 0) pw.active = Math.max(0, pw.active - dt);
  if (input.powerQueued) { input.powerQueued = false; usePower(st); }
  // bulle visuelle pendant BELIER / ESQUIVE
  ensureShield();
  const on = pw.active > 0 && (pw.kind === "ram" || pw.kind === "dash");
  shieldMesh.visible = on;
  if (on) {
    shieldMesh.position.set(player.x, player.worldY + 1.0, player.z);
    shieldMesh.material.color.setRGB(pw.kind === "ram" ? 1.6 : 0.2, pw.kind === "ram" ? 0.7 : 1.1, pw.kind === "ram" ? 0.1 : 1.8);
    shieldMesh.material.opacity = 0.16 + Math.sin(clockT * 20) * 0.05;
  }
  // HUD
  const P = curPilot().power, box = $("hud-power");
  setText($("hud-power-name"), P.name);
  const frac = pw.active > 0 ? 1 : 1 - pw.cd / P.cd;
  setStyle($("hud-power-fill"), "width", (clamp(frac, 0, 1) * 100).toFixed(1) + "%");
  const cls = "power-read" + (pw.active > 0 ? " active" : (pw.cd <= 0 ? " ready" : ""));
  if (box.className !== cls) box.className = cls;
}
function hideShield() { if (shieldMesh) shieldMesh.visible = false; }
