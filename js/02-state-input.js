"use strict";
/* --------------------------- 4. ETATS / ECRANS --------------------------- */
const APP = { HOME: "HOME", MENU: "MENU", COUNTDOWN: "COUNTDOWN", RACE: "RACE", PAUSE: "PAUSE", WIN: "WIN", LOSE: "LOSE" };
let app = APP.HOME;
let modal = null;
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
  $("menu-best").textContent = save.best != null ? fmtTime(save.best) : "--";
  $("menu-bike").textContent = BIKES[save.bike].name;
  const det = $("slot-detail");
  if (save.best != null) {
    det.innerHTML = "Dernière course terminée. Meilleur temps : <span class='gold'>" + fmtTime(save.best) + "</span> &middot; " + save.runs + " tentative(s).";
  } else {
    det.textContent = "Aucune course enregistree pour le moment.";
  }
}
function refreshMuteBtn() { const b = $("btn-mute"); b.classList.toggle("muted", !!save.muted); b.title = save.muted ? "Son coupé (M)" : "Son activé (M)"; }

/* ------------------------------ 5. ENTREES ------------------------------- */
const input = { up: false, down: false, left: false, right: false, nitro: false, jumpQueued: false, jumpHeld: false };
const KEYMAP = {
  ArrowUp: "up", KeyW: "up", KeyZ: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left", KeyQ: "left",
  ArrowRight: "right", KeyD: "right",
  ShiftLeft: "nitro", ShiftRight: "nitro"
};
window.addEventListener("keydown", (e) => {
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
  if (e.code === "KeyR" && (app === APP.RACE || app === APP.PAUSE)) { replay(); }
});
window.addEventListener("keyup", (e) => {
  const k = KEYMAP[e.code];
  if (k) input[k] = false;
  if (e.code === "Space") input.jumpHeld = false;
});
window.addEventListener("blur", () => { input.up = input.down = input.left = input.right = input.nitro = false; });

// Boutons tactiles
document.querySelectorAll(".mc-btn").forEach((btn) => {
  const k = btn.dataset.k;
  const on = (e) => {
    e.preventDefault(); audio.resume();
    if (k === "jump") { input.jumpQueued = true; input.jumpHeld = true; }
    else input[k] = true;
  };
  const off = (e) => {
    e.preventDefault();
    if (k === "jump") input.jumpHeld = false;
    else input[k] = false;
  };
  btn.addEventListener("touchstart", on, { passive: false });
  btn.addEventListener("touchend", off, { passive: false });
  btn.addEventListener("touchcancel", off, { passive: false });
  btn.addEventListener("mousedown", on);
  btn.addEventListener("mouseup", off);
  btn.addEventListener("mouseleave", off);
});
