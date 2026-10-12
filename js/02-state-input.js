"use strict";
/* --------------------------- 4. ETATS / ECRANS --------------------------- */
const APP = { HOME: "HOME", MENU: "MENU", COUNTDOWN: "COUNTDOWN", RACE: "RACE", PAUSE: "PAUSE", WIN: "WIN", LOSE: "LOSE" };
let app = APP.HOME;
let modal = null;
let gateUp = true;         // ecran d'entree : tant qu'il est la, rien n'est jouable (et la musique attend le clic)
const screens = {
  home: $("screen-home"), menu: $("screen-menu"), pause: $("screen-pause"), end: $("screen-end")
};
const hudEl = $("hud");
function setApp(next) {
  const prev = app;
  app = next;
  screens.home.classList.toggle("hidden", next !== APP.HOME);
  screens.menu.classList.toggle("hidden", next !== APP.MENU);
  screens.pause.classList.toggle("hidden", next !== APP.PAUSE);
  screens.end.classList.toggle("hidden", !(next === APP.WIN || next === APP.LOSE));
  hudEl.classList.toggle("hidden", !(next === APP.RACE || next === APP.PAUSE || next === APP.COUNTDOWN));
  document.body.classList.toggle("paused", next === APP.PAUSE);
  if (next === APP.HOME) { screens.home.classList.add("enter"); }
  if (next === APP.MENU) {
    refreshMenuInfo();
    three.visible = true;
  }
  if (next === APP.RACE || next === APP.COUNTDOWN) { three.visible = true; }
  if (next === APP.WIN || next === APP.LOSE) { /* le fond reste la scene 3D figee */ }
  if (prev === APP.PAUSE && next === APP.RACE) audio.resume();
  if (next === APP.RACE && phonePortrait()) setTimeout(pauseRace, 0);   // telephone a la verticale : pas de course a l'aveugle
  // musique : le morceau d'accueil continue dans le menu, celui de la course demarre au compte a rebours,
  // attenue en pause, fondu a la fin (la fanfare / le gong prennent la suite)
  // bruits de moto : coupes partout ou la moto ne roule pas (sinon le dernier ronflement reste fige : arrivee, menu, pause)
  if (next === APP.HOME || next === APP.MENU || next === APP.PAUSE || next === APP.WIN || next === APP.LOSE) audio.engineOff();
  if (next === APP.HOME || next === APP.MENU) music.start("menu");
  else if (next === APP.COUNTDOWN || next === APP.RACE) { music.start("race"); music.setDuck(false); }
  else if (next === APP.PAUSE) music.setDuck(true);
  else if (next === APP.WIN || next === APP.LOSE) music.stop(0.3);
  refreshMuteBtn();
  onAppChange(prev, next);
}
function openModal(id) {
  modal = id; $(id).classList.remove("hidden"); $(id).classList.add("enter"); document.body.classList.add("modal-open");
  audio.ui();
}
function closeModal() {
  if (!modal) return;
  $(modal).classList.add("hidden"); modal = null; audio.ui(); document.body.classList.remove("modal-open");
}
function refreshMenuInfo() {
  const fam = familyRecord(modeKey());
  $("menu-best").textContent = fmtFamily(fam);
  $("menu-bike").textContent = BIKES[save.bike].name;
  $("menu-pilot").textContent = curPilot().name + (curAid().id ? " (" + curAid().short + ")" : "");
  $("menu-score").textContent = pilotStars(curPilot().id) + " ★";
  const det = $("slot-detail");
  if (fam) {
    det.innerHTML = "Record de la famille : <span class='gold'>" + fmtFamily(fam) + "</span> &middot; " + save.runs + " course(s).";
  } else {
    det.textContent = "Aucune course enregistrée pour le moment.";
  }
}
function refreshMuteBtn() { const b = $("btn-mute"); b.classList.toggle("muted", !!save.muted); b.title = save.muted ? "Son coupé (M)" : "Son activé (M)"; }

// Ecran d'entree : le clic (ou Entree / Espace) debloque le son du navigateur, lance la musique d'accueil
// et fait glisser l'ecran vers l'accueil.
function enterGate() {
  if (!gateUp) return;
  gateUp = false;
  audio.init(); audio.resume(); audio.uiBig();
  music.start("menu"); music.unlock();
  lockLandscape();
  const g = $("screen-gate");
  g.classList.add("leaving");
  setTimeout(() => g.classList.add("hidden"), 700);
  screens.home.classList.remove("enter"); void screens.home.offsetWidth; screens.home.classList.add("enter");
}
$("btn-enter").addEventListener("click", enterGate);

// Telephone : le jeu se joue a l'horizontale. A la verticale, le CSS affiche « Tourne ton telephone »
// et la course se met en pause. Sur Android, plein ecran + paysage verrouille (seulement apres un clic ;
// iOS ne le permet pas : l'ecran d'invitation suffit).
const portraitMQ = window.matchMedia("(orientation: portrait) and (pointer: coarse) and (max-width: 700px)");
function phonePortrait() { return portraitMQ.matches; }
function onPortraitChange() { if (portraitMQ.matches && app === APP.RACE) pauseRace(); }
if (portraitMQ.addEventListener) portraitMQ.addEventListener("change", onPortraitChange); else portraitMQ.addListener(onPortraitChange);
function canLockLandscape() {
  const el = document.documentElement;
  return !!((el.requestFullscreen || el.webkitRequestFullscreen) && screen.orientation && screen.orientation.lock);
}
function lockLandscape() {
  if (!window.matchMedia("(pointer: coarse)").matches || !canLockLandscape()) return;
  const lock = () => { try { screen.orientation.lock("landscape").catch(() => {}); } catch (e) { /* refuse : rien a faire */ } };
  if (document.fullscreenElement || document.webkitFullscreenElement) { lock(); return; }
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  try { const p = req.call(el, { navigationUI: "hide" }); if (p && p.then) p.then(lock, () => {}); else lock(); } catch (e) { /* refuse */ }
}
$("btn-rotate-fs").classList.toggle("hidden", !canLockLandscape());
$("btn-rotate-fs").addEventListener("click", lockLandscape);

/* ------------------------------ 5. ENTREES ------------------------------- */
const input = { up: false, down: false, left: false, right: false, nitro: false, jumpQueued: false, jumpHeld: false, powerQueued: false };
const KEYMAP = {
  ArrowUp: "up", KeyW: "up", KeyZ: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left", KeyQ: "left",
  ArrowRight: "right", KeyD: "right",
  Delete: "nitro",                                   // Suppr : sous la main droite, au-dessus des fleches
  ShiftLeft: "nitro", ShiftRight: "nitro"
};
window.addEventListener("keydown", (e) => {
  if (gateUp) {                                    // ecran d'entree : seule la touche Entree / Espace compte, une fois tout charge
    if ((e.code === "Enter" || e.code === "Space") && typeof bootDone !== "undefined" && bootDone) { e.preventDefault(); enterGate(); }
    return;
  }
  if (e.repeat) {
    if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
    return;
  }
  audio.resume();
  const k = KEYMAP[e.code];
  if (k) { input[k] = true; e.preventDefault(); }
  if (e.code === "Space") {
    e.preventDefault();
    if (app === APP.RACE) { input.jumpQueued = true; input.jumpHeld = true; }
    else if (app === APP.HOME) { beginJourney(); }
    else if (app === APP.WIN || app === APP.LOSE) { replay(); }
  }
  if ((e.code === "KeyE" || e.code === "KeyF") && app === APP.RACE) input.powerQueued = true;
  if (modal === "modal-pilot") {
    if (e.code === "ArrowLeft" || e.code === "KeyA" || e.code === "KeyQ") selectPilot(save.pilot - 1);
    if (e.code === "ArrowRight" || e.code === "KeyD") selectPilot(save.pilot + 1);
    if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); startRace(); return; }
  }
  if (e.code === "Enter") {
    if (app === APP.HOME) beginJourney();
    else if (app === APP.WIN || app === APP.LOSE) replay();
  }
  if (e.code === "Escape" || e.code === "KeyP") {
    if (app === APP.RACE) pauseRace();
    else if (app === APP.PAUSE) resumeRace();
    else if (modal) closeModal();
  }
  if (e.code === "KeyM") { audio.setMuted(!save.muted); refreshMuteBtn(); }
  if (e.code === "KeyR" && (app === APP.RACE || app === APP.PAUSE || app === APP.WIN || app === APP.LOSE)) { replay(); }
});
window.addEventListener("keyup", (e) => {
  const k = KEYMAP[e.code];
  if (k) input[k] = false;
  if (e.code === "Space") input.jumpHeld = false;
});
window.addEventListener("blur", () => { input.up = input.down = input.left = input.right = input.nitro = false; });
// onglet masque en pleine course : la boucle s'arrete mais pas le son ; on met en pause (sirene et moteur coupes)
document.addEventListener("visibilitychange", () => { if (document.hidden && app === APP.RACE) pauseRace(); });
// premiere interaction : les navigateurs autorisent enfin la musique (accueil)
["pointerdown", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, () => music.unlock(), { passive: true }));

// Boutons tactiles
document.querySelectorAll(".mc-btn").forEach((btn) => {
  const k = btn.dataset.k;
  const on = (e) => {
    e.preventDefault(); audio.resume();
    if (k === "jump") { input.jumpQueued = true; input.jumpHeld = true; }
    else if (k === "power") input.powerQueued = true;
    else input[k] = true;
  };
  const off = (e) => {
    e.preventDefault();
    if (k === "jump") input.jumpHeld = false;
    else if (k !== "power") input[k] = false;
  };
  btn.addEventListener("touchstart", on, { passive: false });
  btn.addEventListener("touchend", off, { passive: false });
  btn.addEventListener("touchcancel", off, { passive: false });
  btn.addEventListener("mousedown", on);
  btn.addEventListener("mouseup", off);
  btn.addEventListener("mouseleave", off);
});
