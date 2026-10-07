"use strict";
/* ------------------------- HOOKS (debug / tests) --------------------------- */
window.MF = {
  APP: APP, CFG: CFG,
  get state() { return app; },
  get game() { return gameState; },
  get player() { return player; },
  get dad() { return dad; },
  get ents() { return ents; },
  startRace: startRace,
  debug: {
    teleport(z) { player.z = z; },
    setTimeLeft(v) { if (gameState) gameState.timeLeft = v; },
    setIntegrity(v) { if (gameState) gameState.integrity = v; },
    win() { if (gameState) { player.z = -CFG.TOTAL_DIST - 1; } },
    lose(reason) { if (gameState) endRace(false, reason || "time"); },
    setDad(v) { dad.dist = v; dad.speed = 0; }
  }
};
