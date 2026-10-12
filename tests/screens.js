"use strict";
/* ============================================================================
   CAPTURES MULTI-ECRANS — MOTO FURAX
   Photographie chaque ecran (entree, accueil, menu, pilote, boutique, charger, course, pause, photo, fin)
   sur 5 tailles (iPhone et Android a l'horizontale, tablette, telephone a la verticale, PC)
   et signale les boutons hors ecran (HORS), caches par un autre calque (MASQUE), trop petits (PETIT)
   ou atteignables seulement en faisant defiler (DEFILE).

   Lancer :   cd tests && node screens.js [dossier] [iphone,android,tablet,portrait,pc]
   (captures dans tests/captures par defaut, dossier ignore par git)
   ============================================================================ */
const http = require("http"), fs = require("fs"), path = require("path");
let pw;
try { pw = require("playwright"); } catch (e) { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] || path.join(__dirname, "captures"); fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.argv[3] || "";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  const f = path.join(ROOT, u === "/" ? "index.html" : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
const SIZES = [
  { n: "iphone", w: 750, h: 340, touch: true },
  { n: "android", w: 740, h: 360, touch: true },
  { n: "tablet", w: 1024, h: 768, touch: true },
  { n: "portrait", w: 390, h: 760, touch: true },
  { n: "pc", w: 1280, h: 720, touch: false },
].filter((s) => !ONLY || ONLY.split(",").includes(s.n));

const SCREENS = [
  ["gate", async (ev) => {}],
  ["home", async (ev) => ev(() => enterGate())],
  ["menu", async (ev) => ev(() => { setApp(APP.MENU); })],
  ["pilot", async (ev) => ev(() => { setApp(APP.MENU); openPilotSelect(); })],
  ["shop", async (ev) => ev(() => { closeModal(); renderShop(); openModal("modal-shop"); })],
  ["load", async (ev) => ev(() => { closeModal(); openModal("modal-load"); })],
  ["race", async (ev) => ev(() => { closeModal(); MF.debug.noObstacles(true); MF.startRace(); MF.debug.advance(4.3); MF.debug.clear(); MF.debug.crazyCar(); MF.debug.advance(0.3); showAlert("VOITURE FOLLE !", "", 3000); })],
  ["pause", async (ev) => ev(() => { pauseRace(); })],
  ["photo", async (ev) => ev(() => { document.getElementById("btn-photo").click(); })],
  ["end", async (ev) => ev(() => { document.getElementById("btn-photo-exit").click(); resumeRace(); MF.debug.god(); MF.debug.win(); MF.debug.advance(3); })],
];

const CHECK = () => {
  const W = innerWidth, H = innerHeight, bad = [];
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; return el.offsetParent !== null || s.position === "fixed"; };
  const layers = ["#rotate", ".modal:not(.hidden)", "#photo-ui:not(.hidden)", "#screen-gate:not(.hidden)", "#screen-end:not(.hidden)", "#screen-pause:not(.hidden)", "#screen-menu:not(.hidden)", "#screen-home:not(.hidden)", "#hud:not(.hidden)"];
  let root = null;
  for (const q of layers) { const e = document.querySelector(q); if (e && getComputedStyle(e).display !== "none") { root = e; break; } }
  if (!root) return ["aucun ecran"];
  const scroller = (el) => { let p = el.parentElement; while (p && p !== root.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) return p; p = p.parentElement; } return null; };
  root.querySelectorAll("button, .pilot-card, .shop-card, .mode-chip, .aid-chip, .mc-btn").forEach((el) => {
    if (!vis(el)) return;
    let p = el; while (p) { if (p.classList && p.classList.contains("hidden")) return; p = p.parentElement; }
    const r = el.getBoundingClientRect(); if (r.width === 0) return;
    const name = (el.id || el.className.split(" ")[0]) + ":" + el.textContent.trim().slice(0, 18);
    const sc = scroller(el);
    if (sc) { const b = sc.getBoundingClientRect(); if (r.bottom > b.bottom + 1 || r.top < b.top - 1 || r.right > b.right + 1 || r.left < b.left - 1) { bad.push("DEFILE " + name); return; } }
    if (r.top < -1 || r.left < -1 || r.bottom > H + 1 || r.right > W + 1) { bad.push("HORS " + name + " " + [r.left, r.top, r.right, r.bottom].map(Math.round)); return; }
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (t && !el.contains(t) && !t.contains(el)) bad.push("MASQUE " + name + " par " + (t.id || t.className));
    if (el.classList.contains("mc-btn") && (r.width < 44 || r.height < 44)) bad.push("PETIT " + name + " " + Math.round(r.width) + "x" + Math.round(r.height));
  });
  return bad;
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://localhost:" + server.address().port + "/index.html?quality=low&auto=0&manual=1";
  const browser = await pw.chromium.launch({ args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
  const report = {};
  for (const S of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: S.w, height: S.h }, hasTouch: S.touch, isMobile: S.touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("  PAGEERROR", S.n, e.message));
    const ev = (fn, a) => page.evaluate(fn, a);
    await page.goto(base, { waitUntil: "commit", timeout: 120000 });
    await page.waitForFunction(() => window.MF && MF.ready, null, { timeout: 300000 });
    await page.waitForTimeout(400);
    for (const [name, go] of SCREENS) {
      try { await go(ev); } catch (e) { console.log("  ERR", S.n, name, e.message); }
      await page.waitForTimeout(name === "home" ? 900 : 500);
      const bad = await ev(CHECK);
      report[S.n + "/" + name] = bad;
      console.log(S.n.padEnd(9), name.padEnd(6), bad.length ? bad.join(" | ") : "ok");
      await page.screenshot({ path: path.join(OUT, S.n + "-" + name + ".png") });
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  await browser.close(); server.close();
})();
