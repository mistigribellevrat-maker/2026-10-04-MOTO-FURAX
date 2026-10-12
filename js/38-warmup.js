"use strict";
/* ----------------------- PRECHAUFFAGE DES SHADERS (chargement) -----------------------
   Chaque variante de materiau compile son programme GPU a sa premiere apparition a l'ecran :
   en pleine course, c'est une image figee de 80 a 230 ms (mesure : GetProgramiv dans la trace Chrome).
   Pire : quand le dernier objet d'une variante est libere (recyclage d'un troncon), three.js detruit
   le programme, et le prochain chat ou manifestant le recompile.

   On affiche donc, pendant le chargement, un exemplaire de chaque objet du jeu avec les vraies
   lumieres, le brouillard et les ombres, puis on le retire de la scene SANS liberer ses materiaux :
   WARM en garde la reference, les programmes restent en cache pour toute la partie. */
const WARM = { objs: [] };

function warmupShaders() {
  // 1) reserves d'humains remplies (cf. buildHuman) : plus aucune construction de personnage en course
  try {
    for (let i = 0; i < 16; i++) makeProtest();
    for (let i = 0; i < 6; i++) { makeScooterKid(); makeBallKid(); makeBossHuman(false); }
    makeBossHuman(true);
    makeSchoolKids(10);
  } catch (err) { console.warn("prechauffage humains :", err); }

  // 2) un exemplaire de chaque objet affiche une fois (compilation des programmes GPU)
  const g = new THREE.Group();
  g.position.set(0, 0, -6);
  const keep = (o) => { if (o) { g.add(o); WARM.objs.push(o); } };
  const tryAdd = (fn) => { try { const e = fn(); keep(e && (e.obj || e.root || e)); } catch (err) { console.warn("prechauffage :", err); } };

  // obstacles, personnages, bonus
  [makeProtest, makeCat, makeScooterKid, makeBallKid, makeGirlfriend, makeTruck, makeBus, makeConeCluster, makePuddle, makeRamp, makeCrazyCar,
   () => makeItem("nitro"), () => makeItem("coffee"), () => makeItem("tools")].forEach(tryAdd);
  // le chat montre son « ! » des le depart : sprite compile aussi
  g.traverse((o) => { if (o.isSprite) o.visible = true; });

  // voitures : tous les prototypes (types x couleurs, dont les couleurs fluo de la voiture folle) construits
  // une fois pour toutes, un exemplaire de chaque type affiche
  Object.keys(CAR_KINDS).forEach((k) => {
    CAR_COLORS.concat(CRAZY_COLORS).forEach((c) => makeCarProto(k, c));
    tryAdd(() => makeCarProto(k, CAR_COLORS[0]).clone());
  });

  // telephone de la copine (projectile)
  tryAdd(() => {
    const pe = spawnPhone({ obj: { position: new THREE.Vector3(0, 0, 0) }, z: 0 }, player);
    const i = ents.indexOf(pe); if (i >= 0) ents.splice(i, 1);
    scene.remove(pe.obj);
    return pe.obj;
  });

  // boss : principal, surveillant, banderole
  tryAdd(() => makeBossHuman(true).root);
  tryAdd(() => makeBossHuman(false).root);
  tryAdd(() => bossBanner(1));

  // fantome holographique et son etiquette
  tryAdd(() => {
    const G = { id: "me" };
    buildGhost(G, PILOTS[0], 0, "TOI 0,0 s");
    worldGroup.remove(G.obj); worldGroup.remove(G.label);
    G.obj.visible = true; G.label.visible = true;
    keep(G.label);
    return G.obj;
  });

  // bulle de la police, pluie, voiture de police (masquee a l'accueil)
  ensureDadBubble();
  const bubbleWas = dad.bubble.visible; dad.bubble.visible = true;
  if (!WEATHER.rain) buildRain();
  const rainWas = WEATHER.rain.visible; WEATHER.rain.visible = true;
  const dadWas = dad.root.visible; dad.root.visible = true;

  // tout est dessine, meme hors champ (la passe d'ombre aussi)
  g.traverse((o) => { o.frustumCulled = false; if (o.isMesh || o.isSprite) o.visible = true; });
  scene.add(g);

  // une particule de chaque famille (les pools instancies ne compilent qu'au premier affichage)
  try {
    smokePuff(0, -40, -6, { ttl: 0.05 }); sparksBurst(0, -40, -6, 1, { power: 1 }); debrisBurst(0, -40, -6, 1, [[1, 1, 1]]);
    flashGlow(0, -40, -6, 1, 1, 1, 1, 1); heartsBurst(0, -40, -6, 1); ambientFx(0.1, 1, 0, -6);
    updateParticles(0.001);
  } catch (err) { console.warn("prechauffage particules :", err); }

  RENDER.render(scene, camera, 1 / 60);
  RENDER.render(scene, camera, 1 / 60);

  scene.remove(g);
  dad.bubble.visible = bubbleWas; WEATHER.rain.visible = rainWas; dad.root.visible = dadWas;

  // 3) decor de tout le parcours : chaque quartier a ses enseignes, stores, etc. Chaque troncon est mis
  //    en page a chaque index du parcours puis compile (renderer.compile ignore le champ de vision).
  //    enterHome() remet ensuite les troncons de l'accueil en place.
  //    Leurs textures (facades, devantures, enseignes...) partent aussi au GPU tout de suite : sinon une
  //    vingtaine d'envois tombent dans la premiere image de la course (a-coup au depart).
  try {
    const last = MAX_CHUNK_INDEX + 2;
    for (let base = 0; base <= last; base += chunks.length) {
      for (let k = 0; k < chunks.length && base + k <= last; k++) { chunks[k].visible = true; layoutChunk(chunks[k], base + k, false); }
      RENDER.renderer.compile(scene, camera);
      uploadSceneTextures(scene);
    }
  } catch (err) { console.warn("prechauffage decor :", err); }

  // 4) programmes epingles : three.js detruit un programme quand plus aucun materiau ne l'utilise
  //    (dernier chat libere avec son troncon...) ; un compteur en plus et il reste en cache toute la partie
  RENDER.renderer.info.programs.forEach((pg) => { pg.usedTimes++; });
  WARM.programs = RENDER.renderer.info.programs.length;
}

// Envoie au GPU toutes les textures des materiaux de la scene (renderer.initTexture), une seule fois chacune
const _upTex = new Set();
function uploadSceneTextures(root) {
  const up = (t) => {
    if (!t || !t.isTexture || t.isRenderTargetTexture || _upTex.has(t) || !t.image) return;
    _upTex.add(t);
    try { RENDER.renderer.initTexture(t); } catch (err) { /* texture pas encore prete : envoyee a son premier affichage */ }
  };
  root.traverse((o) => {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      for (const k in m) { const v = m[k]; if (v && v.isTexture) up(v); }
      if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) up(v); }
    });
  });
}
