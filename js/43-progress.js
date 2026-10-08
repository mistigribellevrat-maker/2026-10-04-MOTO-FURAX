"use strict";
/* ============================================================================
   PROGRESSION — tout ce qui sert a se comparer equitablement entre freres et soeurs
   - Records PAR PILOTE et PAR NIVEAU D'AIDE, sur le CHRONO REEL de la course
     (les cafes rallongent le compte a rebours mais ne changent jamais le temps du record).
   - Record de la famille (tous pilotes confondus).
   - Defis : 3 etoiles par niveau et par pilote ; les etoiles debloquent des motos (style uniquement).
   - Fantome : la moto translucide rejoue le record du pilote (meme niveau, meme aide).
   ============================================================================ */
const fmtSec = (s) => s == null ? "--" : s.toFixed(1).replace(".", ",") + " s";
const prettyName = (p) => p.name.charAt(0) + p.name.slice(1).toLowerCase();

/* --------------------------------- RECORDS --------------------------------- */
function recFor(mode, pid, aid) { const m = save.rec[mode] || {}, p = m[pid] || {}; return p[aid] || null; }
function setRec(mode, pid, aid, r) {
  save.rec[mode] = save.rec[mode] || {};
  save.rec[mode][pid] = save.rec[mode][pid] || {};
  save.rec[mode][pid][aid] = r;
}
// meilleur temps de la famille : d'abord parmi les courses SANS aide, sinon toutes aides confondues
function familyRecord(mode) {
  let best = null, bestAny = null;
  PILOTS.forEach((p) => AIDS.forEach((a) => {
    const r = recFor(mode, p.id, a.id);
    if (!r || r.time == null) return;
    const e = { time: r.time, pilot: p, aid: a };
    if (!bestAny || r.time < bestAny.time) bestAny = e;
    if (a.id === 0 && (!best || r.time < best.time)) best = e;
  }));
  return best || bestAny;
}
function fmtFamily(fr) { return fr ? fmtSec(fr.time) + " · " + fr.pilot.name + (fr.aid.id ? " (" + fr.aid.short + ")" : "") : "--"; }

/* ---------------------------------- DEFIS ---------------------------------- */
function evalChallenges(st, win) {
  return curLevel().challenges.map((c) => {
    if (c.id === "win") return win;
    if (c.id === "clean") return win && st.hits < 3;
    if (c.id === "combo") return st.maxCombo >= 5;
    if (c.id === "dry") return win && st.puddles < 3;
    if (c.id === "fast") return win && st.raceTime < 52;
    return false;
  });
}
function starsFor(pid, levelId) { return ((save.stars[pid] || {})[levelId]) || [false, false, false]; }
// enregistre les etoiles (jamais perdues) ; renvoie le nombre de nouvelles etoiles
function saveStars(res) {
  if (save.mode === "daily") return 0;
  const pid = curPilot().id, lid = LEVELS[save.level].id;
  const prev = starsFor(pid, lid);
  const next = prev.map((v, i) => v || !!res[i]);
  save.stars[pid] = save.stars[pid] || {};
  save.stars[pid][lid] = next;
  return next.filter(Boolean).length - prev.filter(Boolean).length;
}
const bikeUnlocked = (b) => pilotStars(curPilot().id) >= (b.stars || 0);

/* --------------------------------- FANTOME --------------------------------- */
const GHOST_HZ = 10;
let ghostObj = null, ghostData = null, ghostBuiltFor = "";
const ghostKey = () => modeKey() + "|" + curPilot().id + "|" + curAid().id;
function buildGhost() {
  const key = save.pilot + "-" + save.bike;
  if (ghostObj && ghostBuiltFor === key) return;
  if (ghostObj) { worldGroup.remove(ghostObj); ghostObj.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  const def = BIKES[save.bike];
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 2.2), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const g = new THREE.Group(), inner = new THREE.Group();
  inner.scale.setScalar(1.65); inner.position.y = 0.01; g.add(inner);
  const b = buildBikeVisual(def); inner.add(b.root);
  b.flame.visible = false; if (b.flame.userData.core) b.flame.userData.core.visible = false;
  inner.add(buildRiderVisual(def, curPilot()).root);
  g.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } });
  g.visible = false;
  worldGroup.add(g);
  ghostObj = g; ghostBuiltFor = key;
}
function ghostStart(st) {
  // nettoie les fantomes des anciens defis du jour
  Object.keys(save.ghosts).forEach((k) => { if (/^daily-/.test(k) && k.indexOf("daily-" + todayKey()) !== 0) delete save.ghosts[k]; });
  st.ghostRec = [0, 0, 0]; st.ghostAcc = 0;
  const g = save.ghosts[ghostKey()];
  ghostData = g && g.d && g.d.length > 9 ? g : null;
  if (ghostData) buildGhost();
  if (ghostObj) ghostObj.visible = false;
}
function ghostHide() { if (ghostObj) ghostObj.visible = false; ghostData = null; setText($("hud-ghost"), ""); }
function ghostUpdate(dt, st) {
  st.ghostAcc += dt;
  while (st.ghostAcc >= 1 / GHOST_HZ) {
    st.ghostAcc -= 1 / GHOST_HZ;
    if (st.ghostRec.length < 3 * GHOST_HZ * 200) st.ghostRec.push(+player.x.toFixed(2), +player.worldY.toFixed(2), +player.z.toFixed(1));
  }
  if (!ghostData || !ghostObj) return;
  const d = ghostData.d, n = d.length / 3;
  const f = st.raceTime * GHOST_HZ, i = Math.floor(f), k = f - i;
  if (i >= n - 1) { ghostObj.visible = false; setText($("hud-ghost"), "FANTÔME ARRIVÉ"); return; }
  const x = lerp(d[i * 3], d[i * 3 + 3], k), y = lerp(d[i * 3 + 1], d[i * 3 + 4], k), z = lerp(d[i * 3 + 2], d[i * 3 + 5], k);
  ghostObj.visible = true;
  ghostObj.position.set(x, y, z);
  ghostObj.rotation.y = clamp((d[i * 3] - d[i * 3 + 3]) * 0.6, -0.4, 0.4);
  const gap = Math.round(player.z - z);              // > 0 : le fantome est devant
  setText($("hud-ghost"), gap > 0 ? "FANTÔME : " + gap + " m devant" : (gap < 0 ? "FANTÔME : " + (-gap) + " m derrière" : "FANTÔME : au coude à coude"));
}

/* ------------------------------ ECRAN DE FIN ------------------------------- */
function finalScore(st, win) {
  let sc = st.score + Math.floor(clamp(st.distance, 0, CFG.TOTAL_DIST));
  // bonus d'arrivee calcule sur le CHRONO REEL : un cafe ne rapporte aucun point
  if (win) sc += Math.round(Math.max(0, curLevel().time - st.raceTime) * 20 + clamp(st.integrity / st.integrityMax, 0, 1) * 200 + 500);
  return sc;
}
function showEndScreen(win, reason) {
  const st = gameState, P = curPilot(), A = curAid(), mode = modeKey();
  save.runs++;
  const sc = finalScore(st, win);
  const prev = recFor(mode, P.id, A.id) || {};
  const famBefore = familyRecord(mode);
  const timeRec = win && (prev.time == null || st.raceTime < prev.time);
  const scoreRec = sc > (prev.score || 0);
  setRec(mode, P.id, A.id, { time: timeRec ? st.raceTime : (prev.time != null ? prev.time : null), score: Math.max(sc, prev.score || 0) });
  // record de la famille : les courses sans aide passent avant celles avec aide
  const famRec = timeRec && (!famBefore || (A.id === 0 ? (famBefore.aid.id > 0 || st.raceTime < famBefore.time) : (famBefore.aid.id > 0 && st.raceTime < famBefore.time)));
  if (timeRec && st.ghostRec) save.ghosts[ghostKey()] = { t: st.raceTime, d: st.ghostRec };
  // compatibilite : meilleur temps / score global
  if (win && (save.best == null || st.raceTime < save.best)) save.best = st.raceTime;
  if (sc > (save.bestScore || 0)) save.bestScore = sc;
  // defis, etoiles, deblocages
  const res = evalChallenges(st, win);
  const starsBefore = pilotStars(P.id);
  const newStars = saveStars(res);
  const unlocks = [];
  if (win && save.mode === "level") {
    const lid = LEVELS[save.level].id, first = !(save.wins[lid] > 0);
    save.wins[lid] = (save.wins[lid] || 0) + 1;
    const nxt = LEVELS[save.level + 1];
    if (first && nxt && !nxt.locked) unlocks.push(nxt.name.replace(/^NIVEAU \d+ · /, "Niveau " + (save.level + 2) + " : ") + " débloqué !");
  }
  BIKES.forEach((b) => { if (b.stars && starsBefore < b.stars && pilotStars(P.id) >= b.stars) unlocks.push("Nouvelle moto pour " + P.name + " : " + b.name); });
  persistSave();

  const pn = prettyName(P);
  $("end-wrap").className = "end-wrap " + (win ? "win" : "lose");
  $("end-kicker").textContent = (save.mode === "daily" ? "DÉFI DU JOUR · " : curLevel().short + " · ") + P.name + (A.id ? " · " + A.short : "");
  $("end-title").textContent = win ? "À L'HEURE !" : (reason === "time" ? "TROP TARD !" : (reason === "moto" ? "MOTO HS !" : "RATTRAPÉ !"));
  const descs = {
    win: "Tu franchis le portail du Collège Molière juste avant la sonnerie. Le surveillant hoche la tête. Respect, " + pn + ".",
    time: "La sonnerie a retenti. Tu es encore à trois rues du collège : deux heures de colle samedi, et papa est furax.",
    moto: "Ta moto a rendu l'âme dans un nuage de fumée. Tu termines à pied. Autant dire en retard.",
    dad: "Ton père t'a rattrapé en scooter. Retour à la maison, et cette fois tu prends le bus."
  };
  $("end-desc").textContent = descs[reason] || descs.time;
  const banner = famRec ? "RECORD DE LA FAMILLE !" : (timeRec ? "NOUVEAU RECORD DE " + P.name + " !" : (scoreRec ? "MEILLEUR SCORE DE " + P.name + " !" : ""));
  $("end-new-rec").classList.toggle("hidden", !banner);
  $("end-new-rec").textContent = banner;
  const rec = recFor(mode, P.id, A.id), fam = familyRecord(mode);
  $("end-stat-1").textContent = win ? fmtSec(st.raceTime) : "--";
  $("end-stat-2").textContent = Math.round(clamp(st.integrity / st.integrityMax, 0, 1) * 100) + "%";
  $("end-stat-3").textContent = Math.round(clamp(st.distance, 0, CFG.TOTAL_DIST)) + " m";
  $("end-stat-4").textContent = rec && rec.time != null ? fmtSec(rec.time) : "--";
  $("end-lbl-4").textContent = "record " + P.name.toLowerCase() + (A.id ? " (" + A.short + ")" : "");
  $("end-stat-5").textContent = String(sc);
  $("end-stat-6").textContent = fmtFamily(fam);
  // defis
  const ch = curLevel().challenges, owned = save.mode === "daily" ? res : starsFor(P.id, LEVELS[save.level].id);
  $("end-stars").innerHTML = ch.map((c, i) => "<div class='end-ch" + (res[i] ? " ok" : (owned[i] ? " owned" : "")) + "'><b>" + (res[i] || owned[i] ? "★" : "☆") + "</b><span>" + c.text + "</span></div>").join("") +
    (newStars > 0 ? "<div class='end-newstars'>+" + newStars + " ÉTOILE" + (newStars > 1 ? "S" : "") + " · total " + P.name + " : " + pilotStars(P.id) + " ★</div>" : "");
  $("end-unlocks").innerHTML = unlocks.map((u) => "<div>🔓 " + u + "</div>").join("");
  audio.setSiren(0, 0.05);
  $("dmgborder").className = "";
  $("speedlines").className = "";
  $("hud-threat").className = "hud-threat";
  hideShield(); ghostHide();
  if (typeof clipStop === "function") clipStop();
  setApp(win ? APP.WIN : APP.LOSE);
}
