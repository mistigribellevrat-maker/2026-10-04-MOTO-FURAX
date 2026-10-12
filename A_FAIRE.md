# MOTO FURAX — reste à faire (état au 2026-10-12)

Branche de travail : `claude/inspiring-brown-y5nlty`. Recette : **217/217** (`cd tests && node acceptance.js`).

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

## Reste à faire, par priorité
1. **Vérifier sur de vrais téléphones** (iPhone Safari avec et sans barre, Android Chrome en plein écran) :
   encoche réelle, verrouillage du paysage, confort des boutons tactiles. Retoucher si besoin.
2. **Fluidité mobile (lot 2 restant)** : à CPU ×4, ~30 FPS en charge de fond (rendu 500-700 draw calls).
   - Retirer `backdrop-filter` du HUD de course (css ~l.168-415).
   - `castShadow=false` sur façades/devantures/toits/pancartes (`22-buildings.js` BB.finish).
   - Ne pas animer les entités lointaines (`updateEnts`).
   - Qualité de départ selon l'appareil (tactile → medium) ; adaptatif qui remonte (`10-render.js:359-381`).
   - HUD DOM à ~20 Hz, allocations par image (`entWorld`), à-coup unique au lancement (~116 ms, upload GPU).
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
