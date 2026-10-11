"use strict";
/* ============================================================================
   TEST BOUT EN BOUT « EN LIGNE » — vrai serveur PHP (php -S) + vrais navigateurs, comme deux appareils de la famille.
   Lancer :   cd tests && node online.js      (necessite PHP en ligne de commande et Playwright)
   ============================================================================ */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
let pw;
try { pw = require("playwright"); } catch (e) { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = path.resolve(__dirname, "..");
const results = [];
const ok = (cond, msg, extra) => { results.push(!!cond); console.log((cond ? "   ✓ " : "   ✗ ") + msg + (!cond && extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (spawnSync("php", ["-v"]).status !== 0) { console.log("PHP introuvable : test ignore"); process.exit(0); }
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "mf-e2e-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const php = spawn("php", ["-S", "127.0.0.1:" + port, "-t", ROOT], { env: Object.assign({}, process.env, { MF_DATA_DIR: data }), stdio: "ignore" });
  const origin = "http://127.0.0.1:" + port;
  for (let i = 0; i < 60; i++) { try { const r = await fetch(origin + "/api/ghosts.php?a=ping"); if (r.ok) break; } catch (e) { /* demarrage */ } await sleep(100); }
  const browser = await pw.chromium.launch({ args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const errors = [];

  // un « appareil » = un contexte de navigateur avec son propre stockage local
  const device = async (name, opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(name + " PAGEERROR " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(name + " " + m.text()); });
    if (opts.seed) await page.addInitScript((s) => { try { localStorage.setItem("motorFuraxSaveV1", s); } catch (e) {} }, JSON.stringify(opts.seed));
    if (opts.offline) await page.route("**/api/**", (r) => r.abort());
    await page.goto(origin + "/index.html?quality=low&auto=0&manual=1", { waitUntil: "commit", timeout: 120000 });
    await page.waitForFunction(() => window.MF && MF.ready, null, { timeout: 240000 });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    return { ctx, page, ev };
  };
  // course gagnee sans obstacle : `delay` secondes d'attente au depart pour faire un temps plus lent
  const playWin = async (d, pilot, delay) => {
    await d.ev((a) => { save.mode = "level"; save.level = 0; save.aid = {}; MF.debug.pilot(a.pilot); MF.debug.noObstacles(true); MF.debug.god(true); MF.startRace(); MF.debug.advance(4.3); MF.debug.clear(); MF.debug.advance(a.delay); MF.debug.key("up", true); }, { pilot, delay });
    for (let i = 0; i < 60 && (await d.ev(() => MF.state)) === "RACE"; i++) await d.ev(() => MF.debug.advance(2));
    await d.ev(() => { MF.debug.key("up", false); MF.debug.advance(3); });
    return d.ev(() => ({ state: MF.state, time: MF.game.raceTime }));
  };

  console.log("\n▶ Appareil A : premiere course gagnee, envoyee au serveur");
  const A = await device("A");
  await A.page.waitForFunction(() => MF.online.up === true, null, { timeout: 15000 });
  ok(true, "le jeu detecte le serveur PHP (en ligne)");
  ok(await A.ev(() => !document.getElementById("online-status").classList.contains("hidden")), "la pastille « en ligne » s'affiche dans le menu");
  const winA = await playWin(A, 0, 0);       // Oscar
  ok(winA.state === "WIN", "Oscar gagne la course", winA);
  await A.page.waitForFunction(() => !document.getElementById("end-online").classList.contains("hidden"), null, { timeout: 15000 });
  ok(true, "l'ecran de fin confirme « enregistre en ligne »");
  let recs = await (await fetch(origin + "/api/ghosts.php?a=records&mode=college")).json();
  ok(recs.records["oscar|0"] && recs.records["oscar|0"].ghost === true && recs.records["oscar|0"].time > 40 && recs.records["oscar|0"].time < 60, "le serveur a le record et le fantome d'Oscar", recs.records["oscar|0"]);
  const tOscar = recs.records["oscar|0"].time;

  console.log("\n▶ Appareil B (autre enfant, autre appareil) : voit le record et le fantome d'Oscar");
  const B = await device("B");
  await B.page.waitForFunction(() => MF.online.rec.college && MF.online.rec.college["oscar|0"], null, { timeout: 15000 });
  ok(await B.ev(() => familyRecord("college").pilot.id === "oscar"), "le record de la famille vient du serveur (Oscar)");
  ok(await B.ev(() => /OSCAR/.test(document.getElementById("menu-best").textContent)), "le menu affiche le record d'Oscar", await B.ev(() => document.getElementById("menu-best").textContent));
  await B.ev(() => { save.mode = "level"; save.level = 0; save.aid = {}; MF.debug.pilot(2); MF.debug.noObstacles(true); MF.debug.god(true); MF.startRace(); });
  await B.page.waitForFunction(() => MF.ghosts[1].data !== null, null, { timeout: 15000 });
  ok(await B.ev(() => MF.ghosts[1].pilot.id === "oscar" && MF.ghosts[0].data === null), "Tom n'a pas de record : seul le fantome champion (Oscar) est charge");
  await B.ev(() => { MF.debug.advance(4.3); MF.debug.key("up", true); MF.debug.advance(10); });
  ok(await B.ev(() => MF.ghosts[1].obj.visible && MF.ghosts[1].label.visible), "le fantome d'Oscar est visible, son prenom au-dessus", await B.ev(() => ({ v: MF.ghosts[1].obj.visible, l: MF.ghosts[1].label.visible })));
  const line = await B.ev(() => document.getElementById("hud-ghost2").textContent);
  ok(/OSCAR/.test(line) && /(devant|derrière)/.test(line), "le HUD donne l'ecart : « " + line + " »", line);
  await B.ev(() => { MF.debug.key("up", false); });

  console.log("\n▶ Appareil B : Tom fait un temps plus lent -> deux fantomes (toi + champion)");
  const winB = await playWin(B, 2, 7);       // Tom, 7 s plus lent
  ok(winB.state === "WIN" && winB.time > tOscar + 3, "Tom gagne, plus lentement qu'Oscar", { winB, tOscar });
  await B.page.waitForFunction(() => !document.getElementById("end-online").classList.contains("hidden"), null, { timeout: 15000 });
  recs = await (await fetch(origin + "/api/ghosts.php?a=records&mode=college")).json();
  ok(recs.records["tom|0"] && recs.records["oscar|0"].time === tOscar, "le serveur garde les deux records, celui d'Oscar reste le meilleur", recs.records);
  await B.ev(() => { save.mode = "level"; save.level = 0; save.aid = {}; MF.debug.pilot(2); MF.startRace(); });
  await B.page.waitForFunction(() => MF.ghosts[0].data !== null && MF.ghosts[1].data !== null, null, { timeout: 15000 });
  ok(await B.ev(() => MF.ghosts[0].pilot.id === "tom" && MF.ghosts[1].pilot.id === "oscar"), "deux fantomes : TOI (Tom) et le champion (Oscar)");
  await B.ev(() => { MF.debug.advance(4.3); MF.debug.key("up", true); MF.debug.advance(12); });
  ok(await B.ev(() => /TOI/.test(document.getElementById("hud-ghost").textContent) && /OSCAR/.test(document.getElementById("hud-ghost2").textContent)), "le HUD affiche les deux ecarts", await B.ev(() => [document.getElementById("hud-ghost").textContent, document.getElementById("hud-ghost2").textContent]));
  await B.ev(() => { save.ghostMode = "me"; MF.startRace(); });
  await sleep(500);
  ok(await B.ev(() => MF.ghosts[0].data !== null && MF.ghosts[1].data === null), "reglage « TOI » : le fantome champion disparait");
  await B.ev(() => { save.ghostMode = "family"; MF.startRace(); });
  await B.page.waitForFunction(() => MF.ghosts[1].data !== null, null, { timeout: 15000 });
  ok(await B.ev(() => MF.ghosts[0].data === null), "reglage « FAMILLE » : seulement le champion");
  await B.ev(() => { save.ghostMode = "off"; MF.startRace(); });
  await sleep(500);
  ok(await B.ev(() => MF.ghosts[0].data === null && MF.ghosts[1].data === null), "reglage « AUCUN » : aucun fantome");
  await B.ev(() => { save.ghostMode = "both"; });

  console.log("\n▶ Appareil C : d'anciens records locaux sont envoyes au serveur (rattrapage)");
  const g = []; for (let i = 0; i < 463; i++) g.push(+(Math.sin(i / 9) * 3).toFixed(2), 0, +(-(2000 * i) / 462).toFixed(1));
  const seed = { rec: { college: { yanis: { 0: { time: 46.2, score: 4100 } } } }, ghosts: { "college|yanis|0": { t: 46.2, d: g } }, bikes: { yanis: 1 } };
  const C = await device("C", { seed });
  await C.page.waitForFunction(() => MF.online.rec.college !== undefined, null, { timeout: 15000 });
  for (let i = 0; i < 40; i++) { recs = await (await fetch(origin + "/api/ghosts.php?a=records&mode=college")).json(); if (recs.records["yanis|0"]) break; await sleep(500); }
  ok(recs.records["yanis|0"] && recs.records["yanis|0"].time === 46.2 && recs.records["yanis|0"].bike === 1 && recs.records["yanis|0"].ghost === true, "le record local de Yanis est arrive sur le serveur, avec son fantome", recs.records["yanis|0"]);
  ok(await C.ev(() => familyRecord("college").pilot.id === "yanis"), "Yanis (46,2 s) devient le champion de la famille");

  console.log("\n▶ Appareil D : serveur injoignable -> le jeu continue hors-ligne, sans erreur");
  const D = await device("D", { offline: true });
  await sleep(800);
  ok(await D.ev(() => MF.online.up === false), "serveur injoignable : mode hors-ligne");
  ok(await D.ev(() => document.getElementById("online-status").classList.contains("hidden")), "pas de pastille « en ligne »");
  const winD = await playWin(D, 4, 0);
  ok(winD.state === "WIN", "une course complete se joue normalement hors-ligne", winD);
  ok(await D.ev(() => !!save.rec.college.clothilde && save.rec.college.clothilde[0].time > 0 && !!save.ghosts["college|clothilde|0"]), "record et fantome sont gardes dans le navigateur");
  ok(await D.ev(() => document.getElementById("end-online").classList.contains("hidden")), "aucune mention « en ligne » a l'ecran de fin");

  ok(errors.length === 0, "aucune erreur JavaScript sur les quatre appareils", errors.slice(0, 5));
  await browser.close();
  php.kill();
  fs.rmSync(data, { recursive: true, force: true });
  const failed = results.filter((x) => !x).length;
  console.log("\n════════════════════════════════════════\n  " + (results.length - failed) + " verifications reussies, " + failed + " echec(s)\n════════════════════════════════════════");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
