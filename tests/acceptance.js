"use strict";
/* ============================================================================
   RECETTE AUTOMATISEE — MOTOR FURAX
   Verifie les criteres d'acceptation du cahier des charges dans un vrai navigateur.

   Lancer :   cd tests && npm install && node acceptance.js
   (necessite Node 18+ et Playwright ; un serveur statique est lance automatiquement)
   ============================================================================ */
const http = require("http");
const fs = require("fs");
const path = require("path");
let pw;
try { pw = require("playwright"); } catch (e) { pw = require("/opt/node22/lib/node_modules/playwright"); }

const ROOT = path.resolve(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  const f = path.join(ROOT, u === "/" ? "index.html" : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(f).pipe(res);
});

const results = [];
let currentName = "";
function ok(cond, msg, extra) {
  results.push({ name: currentName, msg: msg, pass: !!cond, extra: extra });
  if (!cond) console.log("   ✗ " + msg + (extra !== undefined ? "  -> " + JSON.stringify(extra) : ""));
  else console.log("   ✓ " + msg);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = "http://localhost:" + port + "/index.html?quality=low&auto=0&manual=1";
  const browser = await pw.chromium.launch({ args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const test = async (name, fn) => { currentName = name; console.log("\n▶ " + name); try { await fn(); } catch (e) { ok(false, "exception : " + e.message); } };
  // lance une course neuve et saute le compte a rebours
  const fresh = async (godMode, pilot) => {
    await ev((pi) => { MF.debug.pilot(pi || 0); }, pilot);
    await ev(() => { MF.debug.noObstacles(true); MF.debug.god(false); MF.debug.key("up", false); MF.debug.key("down", false); MF.debug.key("left", false); MF.debug.key("right", false); MF.debug.key("nitro", false); MF.startRace(); MF.debug.advance(4.3); MF.debug.clear(); });
    if (godMode) await ev(() => MF.debug.god());
  };

  await page.goto(base, { waitUntil: "commit", timeout: 120000 });
  await page.waitForFunction(() => window.MF && MF.ready, null, { timeout: 240000 });
  await page.waitForTimeout(500);

  /* ---------------------------- NAVIGATION ---------------------------- */
  await test("Ecran d'accueil", async () => {
    ok(await ev(() => MF.state) === "HOME", "etat initial = ACCUEIL");
    const t = await ev(() => document.querySelector(".game-title").textContent.replace(/\s+/g, " ").trim());
    ok(/MOTOR/.test(t) && /FURAX/.test(t), "titre MOTOR FURAX affiche", t);
    ok(await ev(() => !!document.getElementById("btn-play") && document.getElementById("btn-play").offsetParent !== null), "bouton JOUER visible");
    ok(await ev(() => typeof MF.CFG.HOME_IMAGE === "string" && /\.jpg$/.test(MF.CFG.HOME_IMAGE)), "emplacement d'image .jpg configurable (CFG.HOME_IMAGE)", await ev(() => MF.CFG.HOME_IMAGE));
    ok(await ev(() => !!document.getElementById("home-bg")), "calque d'image de fond present");
    const pr = await ev(() => { const r = document.getElementById("home-poster").getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top, bottom: r.bottom, vh: innerHeight }; });
    ok(pr.w > 300 && pr.h > 400 && pr.top >= 0 && pr.bottom <= pr.vh, "grand emplacement pour l'affiche du jeu, entierement visible", pr);
  });
  await test("Transitions interdites depuis l'accueil", async () => {
    await page.keyboard.press("KeyR"); await page.keyboard.press("Escape"); await page.keyboard.press("KeyP");
    ok(await ev(() => MF.state) === "HOME", "R / Echap / P n'alterent pas l'ACCUEIL");
  });
  await test("Accueil -> Menu", async () => {
    await page.click("#btn-play");
    ok(await ev(() => MF.state) === "MENU", "JOUER ouvre le MENU");
    const labels = await ev(() => ["btn-new", "btn-load", "btn-shop", "btn-quit"].map((id) => document.getElementById(id).textContent.trim()));
    ok(labels.join("|") === "DÉBUTER PARTIE|CHARGER PARTIE|BOUTIQUE|QUITTER", "4 options : Débuter / Charger / Boutique / Quitter", labels);
  });
  await test("Charger partie / Boutique : interfaces d'attente non bloquantes", async () => {
    await page.click("#btn-load");
    ok(await ev(() => !document.getElementById("modal-load").classList.contains("hidden")), "CHARGER PARTIE ouvre une interface");
    ok(await ev(() => /bient[oô]t|prochainement/i.test(document.getElementById("modal-load").textContent)), "indique un deblocage futur");
    await page.click("#btn-load-close");
    await page.click("#btn-shop");
    ok(await ev(() => !document.getElementById("modal-shop").classList.contains("hidden")), "BOUTIQUE ouvre une interface");
    ok(await ev(() => /bient[oô]t|plus tard|pr[eé]paration/i.test(document.getElementById("modal-shop").textContent)), "indique un deblocage futur");
    await page.keyboard.press("Escape");
    ok(await ev(() => document.getElementById("modal-shop").classList.contains("hidden")), "Echap referme la boutique");
    ok(await ev(() => MF.state) === "MENU", "l'application reste dans le MENU");
  });
  await test("Quitter -> Accueil", async () => {
    await page.click("#btn-quit");
    ok(await ev(() => MF.state) === "HOME", "QUITTER renvoie a l'ACCUEIL");
    await page.click("#btn-play");
  });
  await test("Choix du pilote : 5 pilotes, photos, caracteristiques", async () => {
    await page.click("#btn-new");
    ok(await ev(() => !document.getElementById("modal-pilot").classList.contains("hidden")), "DEBUTER PARTIE ouvre le choix du pilote");
    const names = await ev(() => [...document.querySelectorAll("#pilot-grid .pilot-card h3")].map((h) => h.textContent));
    ok(names.join("|") === "OSCAR|ARTHUR|TOM|YANIS|CLOTHILDE", "Oscar, Arthur, Tom, Yanis et Clothilde", names);
    ok(await ev(() => document.querySelectorAll("#pilot-grid .pilot-photo img").length === 5), "un emplacement photo par pilote");
    ok(await ev(() => [...document.querySelectorAll("#pilot-grid .pilot-photo img")].every((i, k) => i.getAttribute("src") === MF.CFG.PILOT_PHOTO_DIR + MF.PILOTS[k].id + ".jpg")), "photos attendues dans assets/pilotes/<prenom>.jpg");
    const powers = await ev(() => MF.PILOTS.map((p) => p.power.id));
    ok(new Set(powers).size === 5, "5 pouvoirs differents", powers);
    const b = await ev(() => { const r = document.getElementById("btn-pilot-go").getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; });
    ok(b, "bouton C'EST PARTI visible sans defilement");
    await page.keyboard.press("ArrowRight");
    ok(await ev(() => document.querySelectorAll("#pilot-grid .pilot-card")[1].classList.contains("selected")), "fleche droite : selection du pilote suivant");
    await page.keyboard.press("ArrowLeft");
  });
  await test("Debuter partie : MENU -> compte a rebours -> JEU_ACTIF", async () => {
    await page.click("#btn-pilot-go");
    ok(await ev(() => MF.state) === "COUNTDOWN", "demarrage immediat (compte a rebours)");
    await ev(() => MF.debug.advance(4.3));
    ok(await ev(() => MF.state) === "RACE", "course active apres le compte a rebours");
    const hud = await ev(() => ["hud-clock", "hud-speed", "hud-health-num", "hud-nitro-pct", "hud-dad-num", "hud-dist"].map((id) => document.getElementById(id).textContent));
    ok(hud.every((t) => t && t.length), "HUD complet : chrono, vitesse, integrite, nitro, papa, distance", hud);
    ok(await ev(() => !document.getElementById("hud").classList.contains("hidden")), "HUD affiche en surimpression");
  });

  /* ---------------------------- PILOTAGE ---------------------------- */
  await test("Acceleration progressive jusqu'a la vitesse de pointe", async () => {
    await fresh();
    await page.keyboard.down("ArrowUp");
    const s = [];
    for (let i = 0; i < 6; i++) { await ev(() => MF.debug.advance(0.5)); s.push(await ev(() => MF.player.speed)); }
    const max = await ev(() => MF.CFG.MAX_SPEED);
    ok(s[0] > 0 && s[0] < s[2] && s[2] < s[4], "la vitesse croit progressivement", s.map((v) => +v.toFixed(1)));
    await ev(() => MF.debug.advance(6));
    const top = await ev(() => MF.player.speed);
    ok(near(top, 42, 0.01) && top <= max, "plafonne a la vitesse de pointe", top);
    await page.keyboard.up("ArrowUp");
  });
  await test("Freinage d'urgence & priorite au frein", async () => {
    await fresh();
    await page.keyboard.down("ArrowUp"); await ev(() => MF.debug.advance(5));
    const v0 = await ev(() => MF.player.speed);
    await ev(() => MF.debug.key("up", false)); await ev(() => MF.debug.advance(0.5));
    const vDrag = await ev(() => MF.player.speed);
    await ev(() => { MF.player.speed = 40; MF.debug.key("down", true); MF.debug.advance(0.5); });
    const vBrake = await ev(() => MF.player.speed);
    ok(v0 - vDrag < 40 - vBrake, "le frein decelere nettement plus fort que la trainee", { drag: +(v0 - vDrag).toFixed(1), brake: +(40 - vBrake).toFixed(1) });
    await ev(() => { MF.player.speed = 30; MF.debug.key("up", true); MF.debug.key("down", true); MF.debug.advance(0.6); });
    const vBoth = await ev(() => MF.player.speed);
    ok(vBoth < 30, "accelerateur + frein simultanes : le frein l'emporte", vBoth);
    await ev(() => MF.debug.advance(1.5));
    ok(await ev(() => MF.player.speed) === 0, "la moto s'arrete (jamais d'acceleration pendant le freinage)");
    await ev(() => { MF.debug.key("up", false); MF.debug.key("down", false); });
    await page.keyboard.up("ArrowUp");
  });
  await test("Deplacement lateral sur toute la largeur (route + trottoirs)", async () => {
    await fresh(true);
    await ev(() => { MF.debug.key("up", true); MF.debug.key("right", true); MF.debug.advance(1.2); });
    const mid = await ev(() => ({ x: MF.player.x, wy: MF.player.worldY }));
    ok(mid.x > 3, "se deplace vers la droite", mid);
    await ev(() => MF.debug.advance(3));
    const edgeR = await ev(() => ({ x: MF.player.x, wy: MF.player.worldY }));
    ok(near(edgeR.x, 11.9, 0.001), "atteint le bord droit (trottoir) a x = 11.9", edgeR);
    ok(near(edgeR.wy, 0.34, 0.001), "monte sur le trottoir (hauteur 0.34)", edgeR.wy);
    await ev(() => { MF.debug.key("right", false); MF.debug.key("left", true); MF.debug.advance(5); });
    const edgeL = await ev(() => MF.player.x);
    ok(near(edgeL, -11.9, 0.001), "traverse jusqu'au bord gauche x = -11.9", edgeL);
  });
  await test("Bordures solides : repoussee, etincelles, ni blocage ni traversee", async () => {
    await fresh(true);
    await ev(() => { MF.player.speed = 40; MF.debug.key("up", true); MF.debug.key("right", true); MF.debug.advance(1.5); });
    const sp0 = await ev(() => MF.player.speed);
    let maxX = 0;
    for (let i = 0; i < 10; i++) { await ev(() => MF.debug.advance(0.3)); maxX = Math.max(maxX, await ev(() => MF.player.x)); }
    ok(maxX <= 11.9 + 1e-9, "jamais au-dela du mur (x max)", maxX);
    const sp1 = await ev(() => MF.player.speed);
    ok(sp1 < sp0 + 0.5 || sp1 <= 42, "frottement : vitesse reduite par le contact", { sp0, sp1 });
    const sparks = await ev(() => fxSpark.p.filter((p) => p.life > 0).length);
    ok(sparks > 0, "etincelles actives au frottement", sparks);
    await ev(() => { MF.debug.key("right", false); MF.debug.key("left", true); MF.debug.advance(0.6); });
    ok(await ev(() => MF.player.x) < 11.5, "pas de blocage infini : la moto se degage", await ev(() => MF.player.x));
  });
  await test("Saut : parabole, vitesse horizontale preservee", async () => {
    // course temoin sans saut : meme entrees, meme instants
    await fresh(true);
    await ev(() => { MF.player.speed = 30; MF.debug.key("up", true); MF.debug.advance(0.3); });
    const ctrl = [];
    for (let i = 0; i < 40; i++) { await ev(() => MF.debug.advance(1 / 60)); ctrl.push(await ev(() => MF.player.speed)); }
    await fresh(true);
    await ev(() => { MF.player.speed = 30; MF.debug.key("up", true); MF.debug.advance(0.3); });
    const z0 = await ev(() => MF.player.z);
    await ev(() => MF.debug.jump());
    const ys = [];
    for (let i = 0; i < 80; i++) { await ev(() => MF.debug.advance(1 / 60)); ys.push(await ev(() => ({ y: MF.player.y, v: MF.player.speed, g: MF.player.grounded }))); if (i > 5 && ys[ys.length - 1].g) break; }
    const peak = Math.max.apply(null, ys.map((p) => p.y));
    ok(peak > 2 && peak < 3, "hauteur de saut ~ v²/2g (≈ 2,4 m)", +peak.toFixed(2));
    const k = ys.findIndex((p) => p.y === peak);
    ok(k > 5 && k < ys.length - 5, "montee puis descente (parabole)", { k: k, n: ys.length });
    const d2 = []; for (let i = 2; i < ys.length - 1; i++) d2.push(ys[i + 1].y - 2 * ys[i].y + ys[i - 1].y);
    ok(d2.slice(0, -2).every((v) => v < 1e-9), "courbe concave (acceleration verticale constante negative)");
    ok(ys[ys.length - 1].y === 0 && ys[ys.length - 1].g, "retombe exactement au sol");
    const n = Math.min(ys.length, ctrl.length);
    ok(ys.slice(0, n).every((p, i) => near(p.v, ctrl[i], 0.01)), "vitesse horizontale identique a la course temoin sans saut", { saut: +ys[n - 1].v.toFixed(2), temoin: +ctrl[n - 1].toFixed(2) });
    ok(await ev((z0) => z0 - MF.player.z > 20, z0), "continue d'avancer pendant le saut");
  });
  await test("Saut + nitro : portee allongee, retombee coherente", async () => {
    const airtime = async (nitro) => {
      await fresh(true);
      await ev(() => { MF.player.speed = 35; MF.debug.key("up", true); MF.debug.advance(0.3); });
      const z0 = await ev(() => MF.player.z);
      await ev(() => MF.debug.jump());
      await ev(() => MF.debug.advance(1 / 60));
      if (nitro) await ev(() => { MF.debug.setNitro(100); MF.debug.key("nitro", true); });
      let n = 0, last = 0, nan = false;
      while (n < 400) { await ev(() => MF.debug.advance(1 / 60)); const s = await ev(() => ({ y: MF.player.y, g: MF.player.grounded, vy: MF.player.vy })); if (!isFinite(s.y) || !isFinite(s.vy)) nan = true; n++; if (s.g) { last = s; break; } }
      const z1 = await ev(() => MF.player.z);
      await ev(() => { MF.debug.key("nitro", false); MF.debug.key("up", false); });
      return { frames: n, dist: z0 - z1, landedY: last.y, vy: last.vy, nan: nan };
    };
    const a = await airtime(false), b = await airtime(true);
    ok(b.dist > a.dist * 1.15, "la nitro en l'air allonge la portee du saut", { sans: +a.dist.toFixed(1), avec: +b.dist.toFixed(1) });
    ok(b.frames >= a.frames, "temps de vol >= (gravite coherente)", { sans: a.frames, avec: b.frames });
    ok(b.landedY === 0 && b.vy === 0 && !b.nan, "retombee propre : y = 0, vy = 0, aucune valeur invalide");
  });

  /* ---------------------------- OBSTACLES & Z ---------------------------- */
  await test("Contrat de hauteur : obstacle BAS (chat) - moto en l'air", async () => {
    await fresh();
    const hp0 = await ev(() => MF.game.integrity);
    const i = await ev(() => MF.debug.spawn("cat", 0, 0, { freeze: true }));
    await ev(() => { MF.debug.setPlayer({ y: 1.5, grounded: false, vy: 0 }); });
    await ev(() => { MF.debug.advance(0.02); });
    ok(await ev(() => MF.game.integrity) === hp0, "strictement au-dessus du volume : aucun effet (integrite inchangee)");
    ok(!(await ev((i) => MF.debug.ent(i).dead, i)), "le chat n'est pas touche");
  });
  await test("Contrat de hauteur : obstacle BAS (chat) - au sol", async () => {
    await fresh();
    const hp0 = await ev(() => MF.game.integrity);
    await ev(() => MF.debug.spawn("cat", 0, 0, { freeze: true }));
    await ev(() => MF.debug.advance(0.05));
    ok(hp0 - await ev(() => MF.game.integrity) === 6, "impact : degats legers (6)");
    ok(await ev(() => MF.player.slip) > 0, "derapage incontrole declenche", await ev(() => MF.player.slip));
    // directivite : meme braquage pendant 0,5 s, avec et sans derapage (direction du glissement neutralisee pour un test deterministe)
    await ev(() => { MF.debug.setPlayer({ slipDir: 0, x: 0, vx: 0 }); MF.debug.key("left", true); MF.debug.advance(0.5); MF.debug.key("left", false); });
    const slideX = await ev(() => MF.player.x);
    await fresh();
    await ev(() => { MF.debug.key("left", true); MF.debug.advance(0.5); MF.debug.key("left", false); });
    const ctrlX = await ev(() => MF.player.x);
    ok(Math.abs(slideX) < Math.abs(ctrlX) * 0.5, "perte temporaire de directivite (braquage amorti)", { derapage: +slideX.toFixed(2), temoin: +ctrlX.toFixed(2) });
  });
  await test("Contrat de hauteur : obstacle PLEIN (camion SSB) - collision meme en altitude", async () => {
    await fresh();
    const hp0 = await ev(() => MF.game.integrity);
    await ev(() => { MF.player.speed = 25; MF.debug.setPlayer({ y: 6, grounded: false, vy: 0 }); });
    await ev(() => MF.debug.spawn("truck", 0, 0, { freeze: true }));
    await ev(() => MF.debug.advance(0.02));
    const hp1 = await ev(() => MF.game.integrity);
    ok(hp0 - hp1 === 34, "collision a 6 m d'altitude : degats critiques (34)", { hp0, hp1 });
    ok(await ev(() => MF.player.speed) === 0, "arret net");
  });
  await test("Manifestants : decelereation drastique, degats legers", async () => {
    await fresh();
    await ev(() => { MF.player.speed = 30; });
    const hp0 = await ev(() => MF.game.integrity);
    await ev(() => MF.debug.spawn("protest", 0, 0, { freeze: true }));
    await ev(() => MF.debug.advance(0.02));
    ok(await ev(() => MF.player.speed) < 6, "vitesse divisee (x0.15)", await ev(() => MF.player.speed));
    ok(hp0 - await ev(() => MF.game.integrity) === 13, "degats legers (13)");
  });
  await test("Copine : smartphone projectile (degats, desequilibre, evitable en sautant)", async () => {
    await fresh();
    await ev(() => MF.debug.spawn("girlfriend", 0, -30, { freeze: false }));
    let seen = false;
    for (let i = 0; i < 25 && !seen; i++) { await ev(() => MF.debug.advance(0.1)); seen = await ev(() => MF.ents.some((e) => e.type === "phone")); }
    ok(seen, "elle lance un telephone vers la moto (projectile balistique)");
    // impact direct : telephone au sol sous la moto
    await fresh();
    const hp0 = await ev(() => MF.game.integrity);
    await ev(() => { const e = spawnPhone({ obj: { position: { x: MF.player.x } }, z: MF.player.z }, MF.player); e.landed = true; e.y = 0.2; e.x = MF.player.x; e.z = MF.player.z; e.obj.position.set(e.x, 0.2, e.z); });
    await ev(() => MF.debug.advance(0.03));
    ok(hp0 - await ev(() => MF.game.integrity) === 9, "impact direct : degats (9)");
    ok(await ev(() => MF.player.stun) > 0, "desequilibre : directivite reduite temporairement", await ev(() => MF.player.stun));
    // evitement par saut
    await fresh();
    const hpB = await ev(() => MF.game.integrity);
    await ev(() => { MF.debug.setPlayer({ y: 1.6, grounded: false, vy: 0 }); const e = spawnPhone({ obj: { position: { x: 0 } }, z: 0 }, MF.player); e.landed = true; e.y = 0.2; e.x = MF.player.x; e.z = MF.player.z; e.obj.position.set(e.x, 0.2, e.z); MF.debug.advance(0.03); });
    ok(await ev(() => MF.game.integrity) === hpB, "telephone au sol : sans effet si la moto saute par-dessus");
  });

  /* ---------------------------- POURSUITE DU PERE ---------------------------- */
  await test("Poursuite : a fond sans nitro papa grignote, la nitro creuse l'ecart, le freinage le rapproche", async () => {
    await fresh(true);
    await ev(() => { MF.debug.key("up", true); MF.debug.advance(6); });
    const d1 = await ev(() => MF.dad.dist);
    await ev(() => MF.debug.advance(8));
    const d2 = await ev(() => MF.dad.dist);
    ok(d2 < d1 - 3, "vitesse de pointe sans nitro : papa finit par rattraper", { d1: +d1.toFixed(2), d2: +d2.toFixed(2) });
    await ev(() => { MF.debug.setNitro(100); MF.debug.key("nitro", true); MF.debug.advance(2.5); MF.debug.key("nitro", false); });
    const dn = await ev(() => MF.dad.dist);
    ok(dn > d2 + 15, "la nitro creuse nettement l'ecart", { avant: +d2.toFixed(1), apres: +dn.toFixed(1) });
    await ev(() => { MF.debug.key("up", false); MF.debug.key("down", true); MF.debug.advance(2.5); });
    const d3 = await ev(() => MF.dad.dist);
    ok(d3 < dn - 5, "freinage : le pere se rapproche nettement", { avant: +dn.toFixed(1), d3: +d3.toFixed(1) });
    const relspd = await ev(() => MF.dad.speed / MF.CFG.MAX_SPEED);
    ok(relspd > 0 && relspd < 1.05, "vitesse du poursuivant relative a la vitesse nominale", relspd);
  });
  await test("Poursuite : un impact d'obstacle reduit la distance", async () => {
    await fresh(true);
    await ev(() => { MF.debug.key("up", true); MF.debug.advance(8); });
    const d1 = await ev(() => MF.dad.dist);
    await ev(() => MF.debug.spawn("protest", 0, -1, { freeze: true }));
    let dmin = d1;
    for (let i = 0; i < 25; i++) { await ev(() => MF.debug.advance(0.1)); dmin = Math.min(dmin, await ev(() => MF.dad.dist)); }
    ok(dmin < d1 - 4, "apres le choc, papa a rattrape du terrain (distance minimale atteinte)", { avant: +d1.toFixed(1), minimum: +dmin.toFixed(1) });
  });

  /* ---------------------------- PILOTES & SURPRISES ---------------------------- */
  await test("Pilotes : caracteristiques differentes", async () => {
    const top = []; const hp = [];
    for (let i = 0; i < 5; i++) {
      await fresh(true, i);
      await ev(() => { MF.debug.key("up", true); MF.debug.advance(7); });
      top.push(+(await ev(() => MF.player.speed)).toFixed(1)); hp.push(await ev(() => MF.game.integrityMax));
      await ev(() => MF.debug.key("up", false));
    }
    ok(top[2] > top[0] && top[2] === Math.max.apply(null, top), "Tom est le plus rapide", top);
    ok(hp[1] === Math.max.apply(null, hp), "Arthur est le plus solide", hp);
  });
  await test("Pouvoirs : super saut, esquive, belier, hyper nitro, appel a papa", async () => {
    await fresh(true, 0);
    await ev(() => { MF.debug.key("up", true); MF.debug.advance(2); MF.debug.readyPower(); MF.debug.power(); MF.debug.advance(0.25); });
    ok(await ev(() => MF.player.y > 2.5), "Oscar : SUPER SAUT", await ev(() => MF.player.y));
    await fresh(true, 3);
    await ev(() => { MF.debug.key("up", true); MF.debug.advance(2); MF.player.x = 0; MF.debug.key("right", true); MF.debug.readyPower(); MF.debug.power(); MF.debug.advance(0.25); MF.debug.key("right", false); });
    ok(await ev(() => MF.player.x > 4), "Yanis : ESQUIVE (ecart lateral eclair)", await ev(() => MF.player.x));
    await fresh(true, 1);
    await ev(() => { MF.debug.key("up", true); MF.debug.advance(3); MF.debug.readyPower(); MF.debug.power(); MF.debug.advance(0.05); });
    const sp = await ev(() => MF.player.speed), hp0 = await ev(() => MF.game.integrity);
    await ev(() => { MF.debug.spawn("protest", 0, -3, { freeze: true }); MF.debug.advance(0.3); });
    ok(await ev(() => MF.player.speed) > sp * 0.9 && await ev(() => MF.game.integrity) === hp0, "Arthur : BELIER renverse les manifestants sans ralentir");
    await fresh(true, 2);
    await ev(() => { MF.debug.key("up", true); MF.debug.advance(2); MF.debug.setNitro(0); MF.debug.readyPower(); MF.debug.power(); MF.debug.advance(1); });
    ok(await ev(() => MF.player.speed > 50 && MF.game.nitro > 99), "Tom : HYPER NITRO (nitro illimitee)", await ev(() => [MF.player.speed, MF.game.nitro]));
    await fresh(true, 4);
    await ev(() => { MF.debug.key("up", true); MF.debug.advance(4); MF.debug.readyPower(); MF.debug.power(); MF.debug.advance(3); });
    ok(await ev(() => MF.dad.speed < 8), "Clothilde : APPEL A PAPA (il s'arrete)", await ev(() => MF.dad.speed));
    await ev(() => MF.debug.key("up", false));
  });
  await test("Voiture folle : arrive par derriere, se rabat, renverse", async () => {
    await fresh(true, 0);
    await ev(() => { MF.debug.key("up", true); MF.debug.advance(4); MF.debug.noEvents(); MF.debug.god(false); MF.debug.crazyCar(); });
    ok(await ev(() => document.getElementById("hud-threat").classList.contains("on") || (MF.debug.advance(0.05), document.getElementById("hud-threat").classList.contains("on"))), "alerte affichee pendant qu'elle arrive");
    const c0 = await ev(() => MF.debug.crazy());
    ok(c0 && c0.z > (await ev(() => MF.player.z)), "elle apparait derriere la moto", c0);
    const hp0 = await ev(() => MF.game.integrity);
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) { await ev(() => MF.debug.advance(0.1)); const c = await ev(() => MF.debug.crazy()); hit = !!(c && c.hit); }
    ok(hit, "si on ne fait rien, elle nous percute (queue de poisson)");
    ok(await ev(() => MF.game.integrity) < hp0, "degats subis", { avant: hp0, apres: await ev(() => MF.game.integrity) });
    await ev(() => MF.debug.key("up", false));
  });
  await test("Courses differentes a chaque partie", async () => {
    const layout = async () => {
      await ev(() => { MF.debug.noObstacles(false); MF.startRace(); MF.debug.advance(4.3); });
      return ev(() => MF.ents.filter((e) => e.chunk && e.type !== "parked").map((e) => e.type + Math.round(e.x)).sort().join(","));
    };
    const a = await layout(), b = await layout();
    ok(a !== b, "obstacles places differemment d'une course a l'autre");
    await ev(() => MF.debug.noObstacles(true));
  });

  /* ---------------------------- FIN DE PARTIE ---------------------------- */
  await test("Defaite : interception par le pere", async () => {
    await fresh();
    await ev(() => { MF.dad.dist = 2.0; MF.debug.advance(0.1); });
    ok(await ev(() => MF.state) === "LOSE" || await ev(() => !!MF.game.endSeq), "capture immediate");
    await ev(() => MF.debug.advance(2.5));
    ok(await ev(() => MF.state) === "LOSE", "etat DEFAITE");
    ok(await ev(() => /RATTRAP/.test(document.getElementById("end-title").textContent)), "ecran 'rattrape'", await ev(() => document.getElementById("end-title").textContent));
  });
  await test("Defaite : chronometre a zero", async () => {
    await fresh();
    await ev(() => { MF.debug.setTimeLeft(0.05); MF.debug.advance(0.3); MF.debug.advance(2.5); });
    ok(await ev(() => MF.state) === "LOSE" && await ev(() => /TARD/.test(document.getElementById("end-title").textContent)), "etat DEFAITE (trop tard)");
  });
  await test("Defaite : integrite a zero", async () => {
    await fresh();
    await ev(() => { MF.debug.setIntegrity(5); MF.debug.spawn("truck", 0, 0, { freeze: true }); MF.debug.advance(0.3); MF.debug.advance(2.5); });
    ok(await ev(() => MF.state) === "LOSE" && await ev(() => /HS/.test(document.getElementById("end-title").textContent)), "etat DEFAITE (moto hors d'usage)");
  });
  await test("Priorite d'interception sur toute autre defaite", async () => {
    await fresh();
    await ev(() => { MF.debug.setTimeLeft(0.01); MF.dad.dist = 2.0; MF.debug.advance(0.1); });
    ok(await ev(() => MF.game.endSeq.reason) === "dad", "papa prime sur le chrono", await ev(() => MF.game.endSeq.reason));
  });
  await test("Victoire : franchissement du portail", async () => {
    await fresh();
    await ev(() => { MF.debug.teleport(-(MF.CFG.TOTAL_DIST - 0.6)); MF.player.speed = 30; MF.debug.key("up", true); MF.debug.advance(0.1); MF.debug.advance(3); });
    ok(await ev(() => MF.state) === "WIN", "etat VICTOIRE");
    ok(await ev(() => MF.game.timeLeft > 0 && MF.game.integrity > 0), "chrono > 0 et integrite > 0");
  });
  await test("Arbitrage : victoire prioritaire si papa interceptait au meme instant", async () => {
    await fresh();
    await ev(() => { MF.debug.teleport(-(MF.CFG.TOTAL_DIST - 0.4)); MF.player.speed = 40; MF.dad.dist = 2.3; MF.debug.key("up", true); MF.debug.advance(0.05); });
    ok(await ev(() => MF.game.endSeq && MF.game.endSeq.win), "VICTOIRE prime sur la capture", await ev(() => MF.game.endSeq));
    await ev(() => MF.debug.advance(3));
    ok(await ev(() => MF.state) === "WIN", "ecran de victoire");
  });
  await test("Replay depuis l'ecran de fin", async () => {
    await page.click("#btn-replay");
    ok(await ev(() => MF.state) === "COUNTDOWN", "REJOUER relance une course");
    await ev(() => MF.debug.advance(4.3));
    await ev(() => MF.debug.lose("time")); await ev(() => MF.debug.advance(2.5));
    await page.click("#btn-end-menu");
    ok(await ev(() => MF.state) === "MENU", "MENU PRINCIPAL depuis la defaite");
  });

  /* ---------------------------- PAUSE ---------------------------- */
  await test("Pause : gele coordonnees, animations et compte a rebours", async () => {
    await fresh(true);
    await ev(() => { MF.debug.key("up", true); MF.debug.advance(3); });
    await page.keyboard.press("Escape");
    ok(await ev(() => MF.state) === "PAUSE", "Echap met en PAUSE");
    const snap = () => ev(() => ({ z: MF.player.z, x: MF.player.x, t: MF.game.timeLeft, dd: MF.dad.dist, sp: MF.player.speed, wheel: MF.player.wheels[0].rotation.x,
      smoke: fxSmoke.p.reduce((a, p) => a + p.x + p.y + p.z + p.life, 0), ent: MF.ents.reduce((a, e) => a + (e.obj ? e.obj.position.x + e.obj.position.z : 0), 0), cam: camera.position.z, sun: dirLight.position.z, sky: skyUniforms.uTime.value }));
    const a = await snap();
    await ev(() => MF.debug.advance(3));
    const b = await snap();
    ok(JSON.stringify(a) === JSON.stringify(b), "positions, chrono, particules, entites et camera figes", { a, b });
    await page.keyboard.press("Escape");
    ok(await ev(() => MF.state) === "RACE", "Echap reprend la course");
    await ev(() => MF.debug.advance(1));
    ok(await ev(() => MF.game.timeLeft) < a.t - 0.9, "le chrono repart");
  });

  /* ---------------------------- AFFICHAGE ---------------------------- */
  await test("Adaptabilite : redimensionnement sans deformation", async () => {
    for (const [w, h] of [[800, 800], [2000, 600], [420, 860], [1280, 720]]) {
      await page.setViewportSize({ width: w, height: h });
      await ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));
      const r = await ev(() => {
        const c = document.querySelector("#webgl canvas"), b = c.getBoundingClientRect();
        const hudB = [".hud-clockbox", ".hud-speed", ".hud-vitals"].map((s) => { const e = document.querySelector(s).getBoundingClientRect(); return [e.left, e.top, e.right, e.bottom]; });
        return { cw: c.width, ch: c.height, bw: b.width, bh: b.height, aspect: camera.aspect, iw: innerWidth, ih: innerHeight, hud: hudB, sw: document.documentElement.scrollWidth };
      });
      ok(near(r.cw / r.ch, w / h, 0.03) && near(r.aspect, w / h, 0.03), "ratio conserve " + w + "×" + h, { buf: +(r.cw / r.ch).toFixed(3), cam: +r.aspect.toFixed(3), vp: +(w / h).toFixed(3) });
      ok(r.hud.every((b) => b[0] >= -1 && b[1] >= -1 && b[2] <= w + 1 && b[3] <= h + 1) && r.sw <= w + 1, "HUD entierement visible " + w + "×" + h, r.hud);
    }
  });
  await test("Entrees clavier (ZQSD / fleches / espace / maj / M)", async () => {
    await fresh(true);
    await page.keyboard.down("KeyW"); await ev(() => MF.debug.advance(1));
    ok(await ev(() => MF.player.speed) > 5, "W / Z accelere");
    await page.keyboard.down("KeyD"); await ev(() => MF.debug.advance(0.6)); await page.keyboard.up("KeyD");
    ok(await ev(() => MF.player.x) > 1, "D deplace a droite");
    await page.keyboard.down("KeyA"); await ev(() => MF.debug.advance(1.2)); await page.keyboard.up("KeyA");
    ok(await ev(() => MF.player.x) < 1, "A / Q deplace a gauche");
    await page.keyboard.press("Space"); await ev(() => MF.debug.advance(0.1));
    ok(await ev(() => !MF.player.grounded), "Espace saute");
    await ev(() => MF.debug.advance(1));
    await page.keyboard.down("ShiftLeft"); await ev(() => MF.debug.advance(1));
    ok(await ev(() => MF.player.speed) > 42, "Maj active la nitro (au-dela de la vitesse max)", await ev(() => MF.player.speed));
    await page.keyboard.up("ShiftLeft"); await page.keyboard.up("KeyW");
    const m0 = await ev(() => MF.muted === undefined ? document.getElementById("btn-mute").classList.contains("muted") : MF.muted);
    await page.keyboard.press("KeyM");
    ok((await ev(() => document.getElementById("btn-mute").classList.contains("muted"))) !== m0, "M coupe / remet le son");
    await page.keyboard.press("KeyM");
  });
  await test("Nitro : jauge limitee, regeneration", async () => {
    await fresh(true);
    await ev(() => { MF.debug.key("up", true); MF.debug.key("nitro", true); MF.debug.advance(1); });
    const n1 = await ev(() => MF.game.nitro);
    ok(n1 < 100 && n1 > 50, "la jauge se vide pendant la nitro", n1);
    await ev(() => MF.debug.advance(8));
    ok(await ev(() => MF.game.nitro) < 1, "jauge epuisee : la nitro s'arrete");
    ok(await ev(() => MF.player.speed) <= 42.01, "retour a la vitesse maximale normale", await ev(() => MF.player.speed));
    await ev(() => { MF.debug.key("nitro", false); MF.debug.advance(3); });
    ok(await ev(() => MF.game.nitro) > 10, "la jauge se recharge");
  });
  await test("Performance (indicative) : appels de rendu et triangles", async () => {
    await fresh(true);
    await ev(() => { MF.debug.key("up", true); MF.debug.advance(4); MF.debug.frame(); });
    const info = await ev(() => MF.debug.info());
    console.log("   ℹ " + JSON.stringify(info));
    ok(info.calls < 900, "appels de rendu < 900", info.calls);
    ok(info.tris < 2500000, "triangles < 2,5 M", info.tris);
  });
  await test("Console : aucune erreur JavaScript", async () => {
    ok(errors.length === 0, "aucune exception ni erreur de console", errors.slice(0, 5));
  });

  /* ---------------------------- FILE:// ---------------------------- */
  await test("Lancement par double-clic (file://)", async () => {
    const p2 = await browser.newPage({ viewport: { width: 1000, height: 600 } });
    const errs = [];
    p2.on("pageerror", (e) => errs.push(e.message));
    await p2.goto("file://" + path.join(ROOT, "index.html") + "?quality=low&auto=0&manual=1", { waitUntil: "commit" });
    await p2.waitForFunction(() => window.MF && MF.ready, null, { timeout: 240000 });
    ok(errs.length === 0, "demarre sans serveur, sans erreur", errs);
    const f = await p2.evaluate(() => document.fonts.check("700 20px Orbitron"));
    ok(f, "polices locales chargees hors-ligne");
    await p2.close();
  });

  await browser.close();
  server.close();
  const pass = results.filter((r) => r.pass).length, fail = results.length - pass;
  console.log("\n════════════════════════════════════════");
  console.log("  " + pass + " verifications reussies, " + fail + " echec(s)");
  if (fail) results.filter((r) => !r.pass).forEach((r) => console.log("   ✗ [" + r.name + "] " + r.msg));
  console.log("════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
