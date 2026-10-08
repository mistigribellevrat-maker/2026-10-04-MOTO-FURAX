"use strict";
/* ------------------------- HOOKS (debug / tests) --------------------------- */
window.MF = {
  APP: APP, CFG: CFG,
  get ready() { return bootDone; },
  get state() { return app; },
  get game() { return gameState; },
  get player() { return player; },
  get dad() { return dad; },
  get ents() { return ents; },
  PILOTS: PILOTS,
  startRace: startRace,
  debug: {
    advance(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) simStep(1 / 60); },
    frame() { renderFrame(1 / 60); },
    key(k, v) { input[k] = !!v; },
    jump() { input.jumpQueued = true; },
    cam(c) { DBG.cam = c; },
    // fait apparaitre une entite de jeu a une position relative au joueur (tests)
    spawn(name, dx, dz, o) {
      o = o || {};
      const f = { truck: makeTruck, cat: makeCat, protest: makeProtest, bus: makeBus, kid: makeScooterKid, ballkid: makeBallKid, cones: makeConeCluster, puddle: makePuddle, girlfriend: makeGirlfriend, ramp: makeRamp };
      const e = f[name]();
      e.x = player.x + dx; e.z = player.z + dz; e.chunk = null;
      e.obj.position.set(e.x, e.baseY || 0, e.z);
      if (o.freeze) { e.update = null; e.dyn = false; }
      scene.add(e.obj); ents.push(e);
      return ents.length - 1;
    },
    ent(i) { const e = ents[i]; return e ? { type: e.type, dead: !!e.dead, hitCd: e.hitCd, level: e.level, x: e.x, z: e.z } : null; },
    setNitro(v) { if (gameState) gameState.nitro = v; },
    setPlayer(o) { Object.assign(player, o); },
    info() { const i = RENDER.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures, level: RENDER.level, scale: RENDER.scale }; },
    impact(level) { impactFeel(level || "heavy"); sparksBurst(player.x, player.worldY + 0.7, player.z, 14, { power: 7 }); debrisBurst(player.x, player.worldY + 0.8, player.z, 16, [[0.9, 0.9, 0.95], [0.4, 0.45, 0.55], [1, 0.3, 0.2]]); },
    studio(name) {
      if (DBG.studioObj) { scene.remove(DBG.studioObj); DBG.studioObj = null; }
      dad.root.visible = false;
      const z = player.z - 14;
      const place = (e, cam) => { e.z = z; e.x = 0; e.obj.position.set(0, e.baseY || 0, z); scene.add(e.obj); DBG.studioObj = e.obj; for (let i = 0; i < 4; i++) if (e.update) e.update(e, 0.05, player, clockT + i * 0.05); DBG.cam = { p: [cam[0], cam[1], z + cam[2]], l: [0, cam[3], z], fov: cam[4] || 32 }; };
      const f = { truck: makeTruck, protest: makeProtest, cat: makeCat, girlfriend: makeGirlfriend, kid: makeScooterKid, ballkid: makeBallKid, bus: makeBus, puddle: makePuddle, cones: makeConeCluster };
      if (name === "bike") { DBG.cam = { p: [3.4, 2.4, player.z + 4.6], l: [0, 1.0, player.z], fov: 30 }; }
      else if (name === "bikeside") { DBG.cam = { p: [5.5, 1.5, player.z], l: [0, 1.0, player.z], fov: 26 }; }
      else if (name === "bikefront") { DBG.cam = { p: [1.5, 1.6, player.z - 5.5], l: [0, 1.0, player.z], fov: 28 }; }
      else if (name === "dad") { const d2 = dad.root.clone(true); d2.visible = true; d2.position.set(0, 0, z); scene.add(d2); DBG.studioObj = d2; DBG.cam = { p: [3.4, 2.5, z + 5.2], l: [0, 1.3, z], fov: 30 }; }
      else if (name === "bikemid") { DBG.cam = { p: [4.6, 2.6, player.z + 5.8], l: [0, 1.0, player.z], fov: 38 }; }
      else if (name === "bikegame") { DBG.cam = null; }
      else if (name === "item") { const e = makeItem("nitro"); place(e, [2.4, 1.8, 3.4, 0.9, 30]); }
      else if (name === "truck") place(f.truck(), [8, 6, 13, 2.0, 38]);
      else if (name === "bus") place(f.bus(), [8, 6, 13, 2.0, 38]);
      else if (name === "protest") place(f.protest(), [3.6, 3.0, 6.4, 1.3, 36]);
      else if (name === "girlfriend") place(f.girlfriend(), [2.6, 2.0, 4.6, 1.0, 34]);
      else if (f[name]) place(f[name](), [2.4, 1.8, 4.2, 0.6, 34]);
      if (DBG.cam) { camera.position.set(DBG.cam.p[0], DBG.cam.p[1], DBG.cam.p[2]); camera.lookAt(DBG.cam.l[0], DBG.cam.l[1], DBG.cam.l[2]); camera.fov = DBG.cam.fov || 35; camera.updateProjectionMatrix(); }
      this.frame();
    },
    god(v) { DBG.god = v !== false; },
    noObstacles(v) { DBG.noObstacles = v !== false; },
    clear() { ents.forEach((e) => { if (e.type !== "item" || true) { e.dead = true; if (e.obj) e.obj.visible = false; } }); },
    teleport(z) { player.z = z; },
    setTimeLeft(v) { if (gameState) gameState.timeLeft = v; },
    setIntegrity(v) { if (gameState) gameState.integrity = v; },
    win() { if (gameState) { player.z = -CFG.TOTAL_DIST - 1; } },
    lose(reason) { if (gameState) endRace(false, reason || "time"); },
    setDad(v) { dad.dist = v; dad.speed = 0; },
    pilot(i) { save.pilot = i; buildPlayer(); },
    power() { input.powerQueued = true; },
    readyPower() { if (gameState) gameState.power.cd = 0; },
    crazyCar() { if (gameState) spawnCrazyCar(gameState); return crazyRef ? { x: crazyRef.x, z: crazyRef.z, phase: crazyRef.phase } : null; },
    crazy() { return crazyRef ? { x: crazyRef.x, z: crazyRef.z, phase: crazyRef.phase, hit: !!crazyRef.hitPlayer } : null; },
    oncoming() { if (gameState) spawnOncoming(gameState); },
    noEvents() { if (gameState) gameState.evT = 1e9; },
    seed() { return RUN_SEED; }
  }
};
