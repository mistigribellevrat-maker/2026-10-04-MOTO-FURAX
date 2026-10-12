"use strict";
/* ============================================================================
   BANC DE FLUIDITE — MOTO FURAX
   Joue une vraie course (obstacles, evenements, police), moto a fond qui zigzague, saute et
   prend la nitro, sur un telephone simule a l'horizontale (740×360, processeur ralenti), et mesure
   image par image le travail du processeur principal : simulation + HUD, preparation du rendu
   (three.js : appels de dessin, ombres), styles et mise en page de la page.

   Lancer :   cd tests && node perf.js [ralentissement CPU, defaut 4] [qualite, defaut medium] [images, defaut 600]
   Le dessin des pixels (GPU) n'est pas mesure : les ordres de dessin sont neutralises.
   ============================================================================ */
const http = require("http"), fs = require("fs"), path = require("path");
let pw;
try { pw = require("playwright"); } catch (e) { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = path.resolve(__dirname, "..");
const CPU = +(process.argv[2] || 4), QUALITY = process.argv[3] || "medium", FRAMES = +(process.argv[4] || 600);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  const f = path.join(ROOT, u === "/" ? "index.html" : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = "http://localhost:" + server.address().port + "/index.html?quality=" + QUALITY + "&auto=0&manual=1";
  const browser = await pw.chromium.launch({ args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  if (process.env.TRACE) await page.addInitScript((m) => { window.__TRACE = m; }, process.env.TRACE);
  await page.goto(url, { waitUntil: "commit", timeout: 120000 });
  await page.waitForFunction(() => window.MF && MF.ready, null, { timeout: 300000 });
  const cdp = await ctx.newCDPSession(page);
  // une tranche de course, image par image (simulation a 60 images/s)
  const run = (n, measure) => page.evaluate(([n, measure]) => {
    const dt = 1 / 60, S = window.__bench || (window.__bench = { k: 0 });
    const sim = [], ren = [], dom = [], calls = [], gpu = [];
    for (let i = 0; i < n; i++) {
      const k = S.k++;
      MF.debug.key("up", true);
      MF.debug.key("left", k % 90 < 25); MF.debug.key("right", k % 90 >= 45 && k % 90 < 70);
      MF.debug.key("nitro", k % 300 < 60);
      if (k % 140 === 0) MF.debug.jump();
      if (MF.state !== "RACE" && MF.state !== "COUNTDOWN") { MF.startRace(); MF.debug.advance(4.3); MF.debug.god(); }
      window.__gl = {};
      const t0 = performance.now();
      simStep(dt);
      const t1 = performance.now();
      renderFrame(dt);
      const t2 = performance.now();
      void document.body.offsetHeight;                 // styles + mise en page provoques par le HUD
      const t3 = performance.now();
      if (measure) { sim.push(t1 - t0); ren.push(t2 - t1); dom.push(t3 - t2); calls.push(renderer.info.render.calls); gpu.push(Object.keys(__gl).filter((n) => __gl[n][1] >= 1).map((n) => n + ":" + __gl[n][0] + "/" + __gl[n][1].toFixed(0)).join(" ")); }
    }
    return { sim, ren, dom, calls, gpu, dist: MF.game ? MF.game.distance : 0 };
  }, [n, measure]);
  // tirages fixes : deux versions du jeu jouent exactement la meme course
  await page.evaluate(() => {
    let s = 12345; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
    enterGate(); MF.debug.pilot(0); MF.startRace(); MF.debug.advance(4.3); MF.debug.god();
    // GPU logiciel (conteneur de test) : les ordres de dessin sont neutralises. three.js fait tout son
    // travail processeur (tri, matrices, uniformes, etats), seul le dessin des pixels est saute.
    const gl = renderer.getContext();
    ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "blitFramebuffer", "clear", "clearBufferfv", "clearBufferfi", "clearBufferiv", "invalidateFramebuffer"].forEach((n) => { if (gl[n]) gl[n] = () => {}; });
    // TRACE=1 : compte ce qui part vers le GPU (envois de buffers / textures, compilations) image par image
    window.__gl = {};
    const traced = window.__TRACE === "all" ? Object.keys(Object.getPrototypeOf(gl)).filter((n) => { try { return typeof gl[n] === "function"; } catch (e) { return false; } }) : ["bufferData", "bufferSubData", "texImage2D", "texSubImage2D", "texStorage2D", "compileShader", "linkProgram", "generateMipmap"];
    if (window.__TRACE) traced.forEach((n) => {
      if (!gl[n]) return; const o = gl[n].bind(gl);
      gl[n] = function () { const t = performance.now(); const v = o.apply(null, arguments); const q = __gl[n] || (__gl[n] = [0, 0]); q[0]++; q[1] += performance.now() - t; return v; };
    });
  });
  await run(+(process.env.WARM || 180), false);                                 // chauffe, sans ralentissement
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await run(90, false);                                  // le ralentissement met quelques images a se stabiliser
  const r = await run(FRAMES, true);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const tot = r.sim.map((v, i) => v + r.ren[i] + r.dom[i]);
  const f = (x) => +x.toFixed(2);
  console.log(JSON.stringify({
    cpu: "x" + CPU, qualite: QUALITY, images: tot.length,
    total_ms: f(avg(tot)), mediane: f(pct(tot, 0.5)), total_p95: f(pct(tot, 0.95)), total_p99: f(pct(tot, 0.99)), pire: f(Math.max(...tot)),
    sim_hud_ms: f(avg(r.sim)), rendu_ms: f(avg(r.ren)), rendu_mediane: f(pct(r.ren, 0.5)), styles_page_ms: f(avg(r.dom)),
    images_sur_16ms: tot.filter((x) => x > 16.7).length, images_sur_33ms: tot.filter((x) => x > 33.3).length,
    pires_images: tot.map((v, i) => [i, f(v), f(r.sim[i]), f(r.ren[i]), f(r.dom[i]), r.calls[i], r.gpu[i]]).sort((a, b) => b[1] - a[1]).slice(0, +(process.env.WORST || 0)),
    appels_rendu: Math.round(avg(r.calls)), distance: Math.round(r.dist), erreurs: errs.slice(0, 3)
  }));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(2); });
