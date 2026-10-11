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
// Record d'un pilote : le meilleur entre cet appareil et le serveur (45-online.js, si la famille joue en ligne)
function recFor(mode, pid, aid) {
  const m = save.rec[mode] || {}, p = m[pid] || {}, l = p[aid] || null;
  const o = ONLINE.rec[mode] ? ONLINE.rec[mode][pid + "|" + aid] : null;
  if (!o) return l;
  if (!l) return { time: o.time, score: o.score };
  return { time: l.time == null ? o.time : (o.time == null ? l.time : Math.min(l.time, o.time)), score: Math.max(l.score || 0, o.score || 0) };
}
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

/* -------------------------------- FANTOMES --------------------------------- */
// Deux fantomes possibles, rejoues pendant la course :
//   TOI       : ton meilleur temps avec ce pilote et cette aide (cyan)
//   CHAMPION  : le meilleur temps de la famille, tous pilotes confondus (couleur et prenom du pilote)
// Les donnees viennent de cet appareil et, si la famille joue en ligne, du serveur (45-online.js).
// Reglage du menu : FANTOMES = LES DEUX / TOI / FAMILLE / AUCUN.
const GHOST_HZ = 10;
const ghostKey = () => modeKey() + "|" + curPilot().id + "|" + curAid().id;
const GHOSTS = [
  { id: "me", hud: "hud-ghost", obj: null, label: null, data: null, built: "", pilot: null, aid: 0, token: 0 },
  { id: "fam", hud: "hud-ghost2", obj: null, label: null, data: null, built: "", pilot: null, aid: 0, token: 0 }
];
const _ghostLabels = {};
function ghostLabelTexture(text, color) {
  const key = text + color;
  if (_ghostLabels[key]) return _ghostLabels[key];
  const c = cv(384, 96), x = c.getContext("2d");
  x.fillStyle = "rgba(14,8,6,.82)"; x.strokeStyle = color; x.lineWidth = 6;
  x.beginPath(); x.moveTo(30, 8); x.lineTo(354, 8); x.quadraticCurveTo(376, 8, 376, 30); x.lineTo(376, 66); x.quadraticCurveTo(376, 88, 354, 88);
  x.lineTo(30, 88); x.quadraticCurveTo(8, 88, 8, 66); x.lineTo(8, 30); x.quadraticCurveTo(8, 8, 30, 8); x.fill(); x.stroke();
  x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle";
  let fs = 44;
  do { x.font = "900 " + fs + "px Orbitron, 'Arial Black', sans-serif"; fs -= 2; } while (x.measureText(text).width > 330 && fs > 18);
  x.fillText(text, 192, 50);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  _ghostLabels[key] = t;
  return t;
}
function ghostDispose(G) {
  if (G.obj) { worldGroup.remove(G.obj); G.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); G.obj = null; }
  if (G.label) { worldGroup.remove(G.label); G.label.material.dispose(); G.label = null; }
  G.built = "";
}
// silhouette holographique : moto + pilote (leurs vraies formes), une seule matiere translucide
function buildGhost(G, pilot, bikeIdx, labelText) {
  const color = G.id === "me" ? "#8cc7ff" : pilot.accent;
  const key = pilot.id + "-" + bikeIdx + "-" + labelText;
  if (G.obj && G.built === key) return;
  ghostDispose(G);
  const def = BIKES[bikeIdx] || BIKES[0];
  const tint = G.id === "me" ? new THREE.Color(0.5, 1.6, 2.2) : new THREE.Color(pilot.accent).multiplyScalar(2.6);
  const mat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: G.id === "me" ? 0.22 : 0.28, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const g = new THREE.Group(), inner = new THREE.Group();
  inner.scale.setScalar(1.65); inner.position.y = 0.01; g.add(inner);
  const b = buildBikeVisual(def); inner.add(b.root);
  b.flame.visible = false; if (b.flame.userData.core) b.flame.userData.core.visible = false;
  inner.add(buildRiderVisual(def, pilot).root);
  g.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } });
  g.visible = false;
  worldGroup.add(g);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostLabelTexture(labelText, color), transparent: true, depthTest: false, fog: false, toneMapped: false }));
  sp.scale.set(3.9, 0.98, 1); sp.renderOrder = 29; sp.visible = false;
  worldGroup.add(sp);
  G.obj = g; G.label = sp; G.built = key;
}
function ghostReset(G) {
  G.token++;
  G.data = null; G.pilot = null;
  if (G.obj) G.obj.visible = false;
  if (G.label) G.label.visible = false;
  setText($(G.hud), "");
}
const ghostLocal = (mode, pid, aid) => { const g = save.ghosts[mode + "|" + pid + "|" + aid]; return g && g.d && g.d.length > 9 ? g : null; };
// qui doit etre affiche ? { me, fam } : chacun vaut null ou { pilot, aid, time }
function ghostTargets() {
  const mode = modeKey(), P = curPilot(), A = curAid();
  const gm = save.ghostMode || "both";
  const wantMe = gm === "both" || gm === "me", wantFam = gm === "both" || gm === "family";
  const fam = familyRecord(mode);
  const mine = recFor(mode, P.id, A.id);
  const T = { me: null, fam: null };
  if (wantMe && mine && mine.time != null) T.me = { pilot: P, aid: A.id, time: mine.time };
  if (wantFam && fam) {
    const same = fam.pilot.id === P.id && fam.aid.id === A.id;
    if (!same || !wantMe) T.fam = { pilot: fam.pilot, aid: fam.aid.id, time: fam.time };   // champion = toi : un seul fantome
  }
  return T;
}
const ghostBikeFor = (pid) => (pid === curPilot().id ? save.bike : (save.bikes[pid] || 0));
function ghostLoad(G, T, st) {
  ghostReset(G);
  if (!T) return;
  const mode = modeKey(), pid = T.pilot.id;
  G.pilot = T.pilot; G.aid = T.aid; G.time = T.time;
  const local = ghostLocal(mode, pid, T.aid);
  const srv = (ONLINE.rec[mode] || {})[pid + "|" + T.aid];
  const srvBetter = !!(srv && srv.ghost && srv.time != null && (!local || srv.time < local.t - 0.0005));
  const use = (g, bike) => { G.data = g; buildGhost(G, T.pilot, bike, G.id === "me" ? "TOI" : T.pilot.name + " · " + fmtSec(g.t)); };
  if (local && !srvBetter) { use(local, ghostBikeFor(pid)); return; }
  if (srvBetter) {
    const tok = G.token;
    onlineGhost(mode, pid, T.aid).then((g) => {
      if (G.token !== tok || gameState !== st) return;           // la course a change entre-temps
      if (g) use(g, g.bike); else if (local) use(local, ghostBikeFor(pid));
    });
  }
}
function ghostStart(st) {
  // nettoie les fantomes des anciens defis du jour
  Object.keys(save.ghosts).forEach((k) => { if (/^daily-/.test(k) && k.indexOf("daily-" + todayKey()) !== 0) delete save.ghosts[k]; });
  st.ghostRec = [0, 0, 0]; st.ghostAcc = 0;
  const T = ghostTargets();
  ghostLoad(GHOSTS[0], T.me, st);
  ghostLoad(GHOSTS[1], T.fam, st);
  // en ligne : les records du serveur peuvent arriver pendant le compte a rebours et changer le champion
  const mode = modeKey();
  onlineSync(mode).then((got) => {
    if (!got || gameState !== st || st.raceTime > 15) return;
    const N = ghostTargets();
    [[GHOSTS[0], N.me], [GHOSTS[1], N.fam]].forEach((pair) => {
      const G = pair[0], t = pair[1];
      const same = (!t && !G.pilot) || (t && G.pilot && t.pilot.id === G.pilot.id && t.aid === G.aid && Math.abs(t.time - G.time) < 0.001 && G.data);
      if (!same) ghostLoad(G, t, st);
    });
  });
}
function ghostHide() { GHOSTS.forEach(ghostReset); }
function ghostUpdate(dt, st) {
  st.ghostAcc += dt;
  while (st.ghostAcc >= 1 / GHOST_HZ) {
    st.ghostAcc -= 1 / GHOST_HZ;
    if (st.ghostRec.length < 3 * GHOST_HZ * 200) st.ghostRec.push(+player.x.toFixed(2), +player.worldY.toFixed(2), +player.z.toFixed(1));
  }
  GHOSTS.forEach((G) => {
    if (!G.data || !G.obj) return;
    const d = G.data.d, n = d.length / 3;
    const f = st.raceTime * GHOST_HZ, i = Math.floor(f), k = f - i;
    const name = G.id === "me" ? "TOI" : G.pilot.name + " (" + fmtSec(G.data.t) + ")";
    const hud = $(G.hud);
    if (G.id === "fam") setStyle(hud, "color", G.pilot.accent);
    if (i >= n - 1) { G.obj.visible = false; G.label.visible = false; setText(hud, name + " : ARRIVÉ"); return; }
    const x = lerp(d[i * 3], d[i * 3 + 3], k), y = lerp(d[i * 3 + 1], d[i * 3 + 4], k), z = lerp(d[i * 3 + 2], d[i * 3 + 5], k);
    G.obj.visible = true;
    G.obj.position.set(x, y, z);
    G.obj.rotation.y = clamp((d[i * 3] - d[i * 3 + 3]) * 0.6, -0.4, 0.4);
    const gap = Math.round(player.z - z);              // > 0 : le fantome est devant
    setText(hud, gap > 0 ? name + " : " + gap + " m devant" : (gap < 0 ? name + " : " + (-gap) + " m derrière" : name + " : coude à coude"));
    // prenom au-dessus du fantome, seulement quand il est assez proche pour etre lu
    G.label.visible = Math.abs(gap) < 45;
    if (G.label.visible) {
      const sc = 3.4 + Math.min(Math.abs(gap), 45) * 0.06;
      G.label.scale.set(sc, sc / 3.98, 1);
      G.label.position.set(x, y + 3.5 + sc * 0.08, z);
    }
  });
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
  // en ligne : le serveur garde le meilleur (record + fantome) ; sans serveur, rien ne change
  let sent = null;
  if (timeRec || scoreRec) {
    const tm = +st.raceTime.toFixed(2);
    sent = onlineSubmit({ mode: mode, pilot: P.id, aid: A.id, time: timeRec ? tm : null, score: sc, bike: save.bike, ghost: timeRec && st.ghostRec && st.ghostRec.length >= 30 ? { t: tm, d: st.ghostRec } : null });
  }
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
    win: "Tu franchis le portail du Collège Saint Charles juste avant la sonnerie. Le surveillant hoche la tête. Respect, " + pn + ".",
    time: "La sonnerie a retenti. Tu es encore à trois rues du collège : deux heures de colle samedi, et papa est furax.",
    moto: "Ta moto a rendu l'âme dans un nuage de fumée. Tu termines à pied. Autant dire en retard.",
    dad: "La voiture de police t'a rattrapé : contrôle, coup de fil aux parents, et cette fois tu prends le bus."
  };
  $("end-desc").textContent = descs[reason] || descs.time;
  const banner = famRec ? "RECORD DE LA FAMILLE !" : (timeRec ? "NOUVEAU RECORD DE " + P.name + " !" : (scoreRec ? "MEILLEUR SCORE DE " + P.name + " !" : ""));
  $("end-new-rec").classList.toggle("hidden", !banner);
  $("end-new-rec").textContent = banner;
  $("end-online").classList.add("hidden");
  if (sent) sent.then((r) => { if (r && r.body && r.body.ok && r.body.stored && (r.body.stored.time || r.body.stored.score)) $("end-online").classList.remove("hidden"); });
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
