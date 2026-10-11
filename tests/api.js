"use strict";
/* ============================================================================
   TEST DU SERVEUR PHP (records + fantomes) — lance un vrai `php -S` avec un dossier de donnees temporaire.
   Lancer :   cd tests && node api.js      (necessite PHP en ligne de commande)
   ============================================================================ */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const results = [];
const ok = (cond, msg, extra) => { results.push(!!cond); console.log((cond ? "   ✓ " : "   ✗ ") + msg + (!cond && extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fantome plausible : avance reguliere de 0 a -2000 m en `time` secondes (10 echantillons par seconde)
function makeGhost(time, mut) {
  const n = Math.round(time * 10) + 1, d = [];
  for (let i = 0; i < n; i++) d.push(+(Math.sin(i / 9) * 3).toFixed(2), 0, +(-(2000 * i) / (n - 1)).toFixed(1));
  if (mut) mut(d);
  return { t: time, d: d };
}

async function startServer(env) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "mf-data-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn("php", ["-S", "127.0.0.1:" + port, "-t", ROOT], { env: Object.assign({}, process.env, { MF_DATA_DIR: data }, env || {}), stdio: "ignore" });
  const base = "http://127.0.0.1:" + port + "/api/ghosts.php";
  for (let i = 0; i < 60; i++) { try { const r = await fetch(base + "?a=ping"); if (r.ok) break; } catch (e) { /* demarrage */ } await sleep(100); }
  return { proc, data, base, stop() { proc.kill(); fs.rmSync(data, { recursive: true, force: true }); } };
}

(async () => {
  if (spawnSync("php", ["-v"]).status !== 0) { console.log("PHP introuvable : test ignore"); process.exit(0); }
  const S = await startServer();
  const get = async (q) => { const r = await fetch(S.base + q); return { status: r.status, body: await r.json().catch(() => null) }; };
  const post = async (body, headers) => { const r = await fetch(S.base + "?a=submit", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: typeof body === "string" ? body : JSON.stringify(body) }); await sleep(1650); return { status: r.status, body: await r.json().catch(() => null) }; };
  const good = (time, extra) => Object.assign({ mode: "college", pilot: "oscar", aid: 0, time: time, score: 5000, bike: 0, ghost: makeGhost(time) }, extra || {});

  console.log("\n▶ Serveur PHP : lecture");
  let r = await get("?a=ping");
  ok(r.status === 200 && r.body.ok && r.body.writable === true && r.body.protected === false, "ping : serveur pret, stockage accessible, jeu ouvert", r.body);
  r = await get("?a=records&mode=college");
  ok(r.status === 200 && r.body.ok && Object.keys(r.body.records).length === 0, "aucun record au depart (objet vide)", r.body);
  r = await get("?a=ghost&mode=college&pilot=oscar&aid=0");
  ok(r.status === 404, "pas de fantome au depart (404)", r.status);
  ok(fs.existsSync(path.join(S.data, ".htaccess")), "dossier de donnees protege par un .htaccess");

  console.log("\n▶ Serveur PHP : enregistrement d'un record");
  r = await post(good(45));
  ok(r.status === 200 && r.body.stored.time && r.body.stored.score, "premier record accepte (temps + score)", r.body);
  r = await get("?a=records&mode=college");
  ok(r.body.records["oscar|0"] && r.body.records["oscar|0"].time === 45 && r.body.records["oscar|0"].ghost === true, "record visible, fantome signale", r.body);
  r = await get("?a=ghost&mode=college&pilot=oscar&aid=0");
  ok(r.status === 200 && r.body.t === 45 && r.body.d.length === 3 * 451, "fantome relisible tel quel (451 echantillons)", { status: r.status, n: r.body && r.body.d && r.body.d.length });
  r = await post(good(50, { score: 4000 }));
  ok(r.status === 200 && !r.body.stored.time && !r.body.stored.score, "un moins bon temps / score ne remplace rien", r.body.stored);
  r = await get("?a=ghost&mode=college&pilot=oscar&aid=0");
  ok(r.body.t === 45, "le fantome du meilleur temps est conserve", r.body.t);
  r = await post(good(41.37, { score: 3000 }));
  ok(r.body.stored.time && !r.body.stored.score, "un meilleur temps remplace le temps (pas le score)", r.body.stored);
  r = await get("?a=ghost&mode=college&pilot=oscar&aid=0");
  ok(r.body.t === 41.37 && r.body.d.length === 3 * 415, "nouveau fantome enregistre (415 echantillons)", { t: r.body.t, n: r.body.d.length });
  r = await post(good(60, { pilot: "tom", aid: 1, bike: 2 }));
  ok(r.body.stored.time, "autre pilote / autre niveau d'aide : enregistres a part", r.body);
  r = await get("?a=records&mode=college");
  ok(Object.keys(r.body.records).sort().join() === "oscar|0,tom|1" && r.body.records["tom|1"].bike === 2, "records separes par pilote et par aide", r.body.records);
  r = await post({ mode: "college", pilot: "yanis", aid: 0, time: null, score: 777, bike: 0 });
  ok(r.body.stored.score && !r.body.stored.time, "course perdue : seul le score est enregistre", r.body.stored);

  console.log("\n▶ Serveur PHP : refus des donnees douteuses");
  r = await post(good(45, { mode: "../etc" })); ok(r.status === 400, "nom de niveau avec ../ refuse", r.status);
  r = await post(good(45, { pilot: "os/car" })); ok(r.status === 400, "nom de pilote avec / refuse", r.status);
  r = await post(good(45, { aid: 5 })); ok(r.status === 400, "niveau d'aide inconnu refuse", r.status);
  r = await post(good(45, { score: -5 })); ok(r.status === 400, "score negatif refuse", r.status);
  r = await post("pas du json"); ok(r.status === 400, "corps illisible refuse", r.status);
  r = await post(good(10, { ghost: makeGhost(10) })); ok(r.status === 422, "temps impossible (10 s pour 2000 m) refuse", r.status);
  r = await post(good(45, { ghost: makeGhost(45, (d) => { d[3 * 200 + 2] -= 60; }) })); ok(r.status === 422 && r.body.error === "ghost-vitesse", "fantome qui se teleporte refuse", r.body);
  r = await post(good(45, { ghost: makeGhost(45, (d) => { d[3 * 100] = 40; }) })); ok(r.status === 422 && r.body.error === "ghost-bornes", "fantome hors de la route refuse", r.body);
  r = await post(good(45, { ghost: makeGhost(30) })); ok(r.status === 422 && r.body.error === "ghost-duree", "duree du fantome incoherente avec le temps refuse", r.body);
  const short = makeGhost(45); short.d = short.d.slice(0, 3 * 300);
  r = await post(good(45, { ghost: short })); ok(r.status === 422, "fantome qui n'arrive pas au college refuse", r.body);
  r = await get("?a=ghost&mode=..&pilot=oscar&aid=0"); ok(r.status === 400, "lecture avec un nom de niveau piege refusee", r.status);
  r = await get("?a=nimportequoi"); ok(r.status === 400, "action inconnue refusee", r.status);
  r = await get("?a=records&mode=college");
  ok(r.body.records["oscar|0"].time === 41.37, "apres tous ces refus, les donnees sont intactes", r.body.records["oscar|0"]);
  const fast = await fetch(S.base + "?a=submit", { method: "POST", body: JSON.stringify(good(44)) }); const fast2 = await fetch(S.base + "?a=submit", { method: "POST", body: JSON.stringify(good(43)) });
  ok(fast.status === 200 && fast2.status === 429, "deux envois a la suite : le second est freine (429)", [fast.status, fast2.status]);
  await sleep(1700);

  console.log("\n▶ Serveur PHP : defi du jour (menage des anciens jours)");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  r = await post(good(45, { mode: "daily-" + today })); ok(r.body.stored.time, "defi du jour d'aujourd'hui enregistre", r.body.stored);
  r = await post(good(45, { mode: "daily-20200101" }));
  r = await get("?a=records&mode=daily-20200101"); ok(Object.keys(r.body.records).length === 0, "un defi du jour trop ancien est supprime", r.body);
  r = await get("?a=records&mode=daily-" + today); ok(Object.keys(r.body.records).length === 1, "celui d'aujourd'hui est conserve", r.body);
  S.stop();

  console.log("\n▶ Serveur PHP : code famille");
  const P = await startServer({ MF_FAMILY_CODE: "saintcharles" });
  const get2 = async (q) => { const rr = await fetch(P.base + q); return { status: rr.status, body: await rr.json() }; };
  const post2 = async (headers) => { const rr = await fetch(P.base + "?a=submit", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: JSON.stringify(good(45)) }); await sleep(1650); return rr.status; };
  r = await get2("?a=ping"); ok(r.body.protected === true, "le serveur annonce qu'il demande un code", r.body);
  ok(await post2() === 401, "sans code : enregistrement refuse (401)");
  ok(await post2({ "X-Family-Code": "mauvais" }) === 401, "mauvais code : refuse (401)");
  ok(await post2({ "X-Family-Code": "saintcharles" }) === 200, "bon code : accepte");
  r = await get2("?a=records&mode=college"); ok(r.status === 200 && r.body.records["oscar|0"], "la lecture reste libre", r.body);
  P.stop();

  const failed = results.filter((x) => !x).length;
  console.log("\n════════════════════════════════════════\n  " + (results.length - failed) + " verifications reussies, " + failed + " echec(s)\n════════════════════════════════════════");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
