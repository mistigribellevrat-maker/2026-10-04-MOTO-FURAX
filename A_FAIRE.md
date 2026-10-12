# MOTO FURAX — reste à faire (état au 2026-10-12)

Branche de travail : `claude/inspiring-brown-y5nlty`. Recette : **229/229** (`cd tests && node acceptance.js`).

## Fait
- Lot 1 (effets, dangers annoncés, relance rapide), voiture folle esquivable, fluidité PC (préchauffage
  des shaders, humains clonés) : commités le 12/10.
- **Mobile / responsive (lot « priorité 1 »)** :
  - Téléphone à la verticale : écran « Tourne ton téléphone » (`#rotate`, CSS
    `(orientation:portrait) and (pointer:coarse) and (max-width:700px)`), la course se met en pause.
    Android : plein écran + paysage verrouillé au clic sur ENTRER (ou bouton PLEIN ÉCRAN de l'invitation).
    iOS ne permet pas le verrouillage : l'invitation suffit.
  - Paysage bas (`@media (orientation:landscape) and (max-height:520px)`, bloc « v5 » à la fin de `css/style.css`) :
    entrée compacte ; accueil avec l'affiche à gauche et titre/texte/JOUER à droite ; menu en 2 colonnes
    (boutons / infos et réglages) ; choix du pilote compact (sans stats ni chemins de photos, barre d'actions
    sous la grille) ; boutique et charger compacts ; pause en 2×2 ; fin de course avec 6 stats sur une ligne,
    étoiles en ligne, boutons collés en bas ; mode photo sur une ligne ; marqueur « VOITURE FOLLE » et
    alertes déplacés hors des panneaux.
  - Boutique : la grille défile et RETOUR reste visible partout (y compris tablette et PC 720p).
  - Encoche : `viewport-fit=cover` + `env(safe-area-inset-*)` sur le HUD, les commandes et les écrans.
  - Tactile : aide clavier masquée, réglages du menu plus hauts (≥ 40 px), boutons de course ≥ 44 px.
  - Test « Mobile : téléphone à l'horizontale (iPhone 750×340) et à la verticale » ajouté.
  - Outil : `tests/screens.js` (captures de 10 écrans × 5 tailles + détection des débordements, dans `tests/captures/`).

- **Fluidité mobile (lot 2)**, mesurée avec `tests/perf.js` (téléphone 740×360, CPU ×4, qualité moyenne,
  900 images de vraie course ; seul le travail du processeur est mesuré, le dessin GPU est neutralisé) :
  temps moyen par image **22,3 → 14,8 ms** (−34 %), images > 16,7 ms 658 → 261, > 33 ms 72 → 8,
  pire image ~250 → ~55 ms, appels de dessin 582 → 497.
  - Tronçons : fusion des accessoires réécrite (`mergeTransformed`, 3× plus rapide, résultat identique) ;
    construction étalée sur plusieurs images (`layoutChunkSteps` + file `LAYOUT`, ~3 ms par image), tronçon
    caché tant qu'il n'est pas fini ; `rebuildAllChunks` ne construit plus chaque tronçon deux fois.
  - Tronçons noyés dans le brouillard (> 96 %) ni dessinés ni envoyés au GPU (`cullChunks`).
  - Façades, devantures, toits et panneaux hors de la passe d'ombres (~45 % de ses appels en moins).
  - Entités posées à plus de 110 m devant / 40 m derrière non animées (les entités libres le restent).
  - HUD (DOM) réécrit à ~20 Hz ; plus de `backdrop-filter` dans le HUD de course, ni sur tactile dans les menus.
  - Textures du décor envoyées au GPU au chargement (`uploadSceneTextures`) : plus d'à-coup à la 1re image.
  - Qualité automatique en échelle (`AUTO_LADDER`) : départ « moyenne » sur téléphone, « élevée » sur PC ;
    remonte quand c'est fluide (y compris sur écran 60 Hz, ce qui n'arrivait jamais), cran qui rame = plafond
    retenté plus tard.
  - Tests ajoutés : « Fluidité mobile (lot 2) » et « Qualité automatique ».

## Reste à faire, par priorité
1. **Vérifier sur de vrais téléphones** (iPhone Safari avec et sans barre, Android Chrome en plein écran) :
   encoche réelle, verrouillage du paysage, confort des boutons tactiles. Retoucher si besoin.
2. **Fluidité (reste, optionnel)** : vérifier en vrai sur téléphone (le GPU n'est pas mesurable ici).
   Pistes si besoin : passe principale ~230 appels (4 meshes par bâtiment : fusionner façade/devanture/toit
   via un atlas), envoi de la géométrie des 6 tronçons au départ (pendant le compte à rebours), allocations
   internes de three.js (~260 Ko/image, surtout des copies de matrices).
3. **Rejouabilité (lot 3)** : écarts intermédiaires vs fantôme, médailles bronze/argent/or, saut plat qui ne
   rapporte plus (seuil 0,9 s en l'air), « dernière chance » face à la police, écran de défaite motivant.
4. **Équilibrage des pilotes (lot 4, décision de l'utilisateur requise)** : Clothilde trop forte (recharge nitro ×2,7,
   brouillage toutes les 15 s), passif de Tom absent (README promet nitro plus longue et hyper nitro 3 s, code = 2 s).
   D'abord un robot qui mesure le vrai chrono par pilote.
5. **Gros chantiers (lot 5)** : niveau 3, « rejouer ce parcours », série de jours, découpage de `40-gameplay.js`.
6. Option proposée : caméra basse (sensation de vitesse), sans toucher à l'actuelle.

## À vérifier en jouant
- Lignes de vitesse réactivées (ressemblent un peu à de la pluie vues d'en haut) et secousse d'écran lissée.
- `llm_context.xml` a disparu du dossier au début de la session (pas supprimé par Claude) : vérifier.
