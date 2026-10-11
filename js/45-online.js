"use strict";
/* ============================================================================
   EN LIGNE (facultatif) — records et fantomes partages entre tous les appareils de la famille.
   Serveur : api/ghosts.php (PHP, hebergement mutualise type OVH, voir le README « Mise en ligne »).
   Sans serveur (double-clic en file://, hors-ligne, serveur en panne) RIEN ne change : tout reste dans le
   navigateur, et le jeu n'affiche aucune erreur.
   ============================================================================ */
const ONLINE = {
  url: "api/ghosts.php",
  enabled: /^https?:$/.test(location.protocol),   // pas de serveur en double-clic (file://) : aucune requete
  up: false,            // le serveur a repondu
  protectedBy: false,   // le serveur demande un code famille pour enregistrer
  rec: {},              // records du serveur : rec[niveau]["pilote|aide"] = { time, score, bike, ghost }
  ghosts: {},           // fantomes telecharges : ghosts["niveau|pilote|aide"] = { t, d, bike }
  loading: {},          // telechargements de fantomes en cours
  syncedAt: {},         // derniere synchro des records, par niveau
  backfilled: {},       // niveaux dont les records locaux ont deja ete envoyes au serveur
  chain: Promise.resolve(), last: 0, askedCode: false
};
const FAMILY_CODE_KEY = "motoFuraxFamilyCode";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

function familyCode() { try { return localStorage.getItem(FAMILY_CODE_KEY) || ""; } catch (e) { return ""; } }
function askFamilyCode() {
  if (ONLINE.askedCode) return false;
  ONLINE.askedCode = true;
  try {
    const c = window.prompt("Code famille pour enregistrer les records en ligne :");
    if (c && c.trim()) { localStorage.setItem(FAMILY_CODE_KEY, c.trim()); return true; }
  } catch (e) { /* prompt indisponible */ }
  return false;
}

// Appel au serveur : renvoie { status, body } ou null (pas de serveur / pas de JSON). Ne leve jamais d'exception.
async function onlineCall(query, body) {
  if (!ONLINE.enabled) return null;
  const ctl = window.AbortController ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : 0;
  try {
    const headers = {}, code = familyCode();
    if (code) headers["X-Family-Code"] = code;
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(ONLINE.url + "?" + query, { method: body ? "POST" : "GET", headers: headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: ctl ? ctl.signal : undefined });
    let json = null;
    try { json = await res.json(); } catch (e) { /* pas du JSON : pas notre serveur */ }
    ONLINE.up = !!json;
    return json ? { status: res.status, body: json } : null;
  } catch (e) {
    ONLINE.up = false;
    return null;
  } finally { if (timer) clearTimeout(timer); }
}

function onlineStatusUI() {
  const el = $("online-status");
  if (el) el.classList.toggle("hidden", !ONLINE.up);
}
function onlineRefreshUI() {
  if (typeof refreshMenuInfo === "function") refreshMenuInfo();
  if (typeof modal !== "undefined" && modal === "modal-pilot" && typeof renderPilots === "function") renderPilots();
}

// Demarrage : le serveur est-il la ? Si oui, on recupere les records du niveau courant.
async function onlineStart() {
  if (!ONLINE.enabled) return;
  const r = await onlineCall("a=ping");
  ONLINE.up = !!(r && r.body && r.body.ok);
  ONLINE.protectedBy = !!(r && r.body && r.body.protected);
  onlineStatusUI();
  if (ONLINE.up) await onlineSync(modeKey());
}

// Records du serveur pour un niveau (au plus une fois toutes les 20 s). Renvoie true si on a des donnees.
async function onlineSync(mode, force) {
  if (!ONLINE.enabled || !ONLINE.up) return false;
  const now = Date.now();
  if (!force && ONLINE.syncedAt[mode] && now - ONLINE.syncedAt[mode] < 20000) return !!ONLINE.rec[mode];
  ONLINE.syncedAt[mode] = now;
  const r = await onlineCall("a=records&mode=" + enc(mode));
  onlineStatusUI();
  if (!(r && r.status === 200 && r.body && r.body.records)) return false;
  ONLINE.rec[mode] = r.body.records;
  onlineBackfill(mode);
  onlineRefreshUI();
  return true;
}

// Fantome du serveur pour (niveau, pilote, aide) : renvoie { t, d, bike } ou null.
function onlineGhost(mode, pid, aid) {
  const key = mode + "|" + pid + "|" + aid, s = (ONLINE.rec[mode] || {})[pid + "|" + aid];
  if (!ONLINE.enabled || !ONLINE.up || !s || !s.ghost) return Promise.resolve(null);
  const c = ONLINE.ghosts[key];
  if (c && c.t === s.time) return Promise.resolve(c);                    // deja telecharge et a jour
  if (ONLINE.loading[key]) return ONLINE.loading[key];
  const p = onlineCall("a=ghost&mode=" + enc(mode) + "&pilot=" + enc(pid) + "&aid=" + aid).then((r) => {
    delete ONLINE.loading[key];
    if (r && r.status === 200 && r.body && r.body.d) { ONLINE.ghosts[key] = { t: r.body.t, d: r.body.d, bike: r.body.bike || 0 }; return ONLINE.ghosts[key]; }
    return null;
  });
  ONLINE.loading[key] = p;
  return p;
}

// Envoi d'une course : file d'attente (le serveur freine les envois trop rapproches). Renvoie la reponse ou null.
function onlineSubmit(payload) {
  if (!ONLINE.enabled || !ONLINE.up) return Promise.resolve(null);
  const p = ONLINE.chain.then(() => sendOne(payload));
  ONLINE.chain = p.catch(() => null);
  return p;
}
async function sendOne(payload, retried) {
  const gap = ONLINE.last + 1700 - Date.now();
  if (gap > 0) await wait(gap);
  const r = await onlineCall("a=submit", payload);
  ONLINE.last = Date.now();
  if (!r) return null;
  if (r.status === 401 && !retried && askFamilyCode()) return sendOne(payload, true);          // code famille demande une fois
  if (r.status === 429 && !retried) return sendOne(payload, true);                              // trop vite : on reessaie
  if (r.status === 422 && payload.ghost && !retried) return sendOne(Object.assign({}, payload, { ghost: null }), true);   // fantome refuse : on garde au moins le temps
  if (r.body && r.body.ok && r.body.records) ONLINE.rec[payload.mode] = r.body.records;
  return r;
}

// Envoie au serveur les records deja gagnes sur cet appareil (une fois par niveau et par visite), pour que
// toute la famille en profite des la mise en ligne. Au plus 8 envois.
function onlineBackfill(mode) {
  if (ONLINE.backfilled[mode]) return;
  ONLINE.backfilled[mode] = true;
  const jobs = [];
  PILOTS.forEach((p) => AIDS.forEach((a) => {
    const r = ((save.rec[mode] || {})[p.id] || {})[a.id];
    if (!r) return;
    const s = (ONLINE.rec[mode] || {})[p.id + "|" + a.id];
    const g = save.ghosts[mode + "|" + p.id + "|" + a.id];
    const betterTime = r.time != null && (!s || s.time == null || r.time < s.time - 0.0005);
    const betterScore = (r.score || 0) > (s ? s.score : 0);
    if (!betterTime && !betterScore) return;
    const ghost = betterTime && g && g.d && Math.abs(g.t - r.time) < 0.02 ? { t: g.t, d: g.d } : null;
    jobs.push({ mode: mode, pilot: p.id, aid: a.id, time: betterTime ? r.time : null, score: r.score || 0, bike: save.bikes[p.id] || 0, ghost: ghost });
  }));
  jobs.slice(0, 8).forEach((j) => { onlineSubmit(j); });
}
