# MOTO FURAX — reste à faire (état au 2026-10-12)

Branche de travail : `claude/lot1-finitions` (commit `ba5c914` = lot 1).
**Non commité** (fait, testé, recette 203/203) : voiture folle + fluidité, voir « Fait » ci-dessous.
À la reprise : relire ce fichier, faire `git status`, commiter ces changements si OK.

## Fait (non commité)
- Voiture folle : ne vise plus la moto (changements de file au hasard, annoncés par crissement/fumée,
  esquivable). `js/33-events.js`, test réécrit dans `tests/acceptance.js`.
- Saccades (1 % low 17,8 → ~49 FPS sur PC) :
  - `js/38-warmup.js` (nouveau) : préchauffage des shaders au chargement + programmes « épinglés »
    (three.js les détruisait au recyclage des tronçons → recompilation en course).
  - Humains en cache + clones (`buildHuman` / `buildHumanRig`, pools par rôle), chat cloné, texture « ! » partagée.
  - Camion : `userData` allégé (clone() recopiait 1,5 Mo de JSON → 6 ms par camion).
  - Coût : chargement +1,9 s sur PC (étape « Préparation des effets »).
  - Test ajouté : « Fluidite : rien n'est compile ni construit en pleine course ».

## Reste à faire, par priorité
1. **Mobile / responsive (demandé, prioritaire)** — rien n'est encore modifié :
   - Forcer le paysage : écran « Tourne ton téléphone » en portrait (`@media (orientation:portrait) and (pointer:coarse)`),
     + `screen.orientation.lock("landscape")` en plein écran sur Android (iOS ne le permet pas).
   - Accueil en paysage : l'affiche sur le côté (gauche), titre/texte/JOUER à droite ; aujourd'hui l'affiche
     chevauche le titre sur iPhone (capture fournie par l'utilisateur).
   - Revoir tous les écrans sur petits écrans paysage (iPhone 750×340 avec barre Safari, Android 740×360) :
     entrée, menu, choix du pilote, boutique, charger, pause, fin, mode photo, HUD (marqueur « VOITURE FOLLE »
     qui chevauche le panneau intégrité), zones sûres (encoche), boutons tactiles ≥ 44 px.
   - **Constats des captures (iPhone 750×340 avec barre Safari, Android 740×360)** :
     - MENU : le panneau est centré verticalement et déborde en haut → titre « MENU PRINCIPAL »,
       DÉBUTER et CHARGER **hors écran, inaccessibles**. Il faut un menu en 2 colonnes (boutons à gauche,
       infos/réglages à droite) ou un défilement, et masquer la ligne d'aide clavier sur écran tactile.
     - CHOIX DU PILOTE : la ligne « AIDE » et les boutons C'EST PARTI / RETOUR recouvrent les cartes
       (surnoms et stats illisibles) ; les photos manquantes affichent le chemin `assets/pilotes/*.jpg`
       en texte coupé. Réduire les cartes en paysage bas, cacher les stats, barre d'actions sous la grille.
     - BOUTIQUE : la grille déborde en bas (bouton RETOUR inaccessible, même sur tablette 1024×768).
     - FIN DE COURSE : le titre et les boutons REJOUER / MENU sont hors écran (haut et bas) ;
       grille de stats trop grande → 6 stats sur une ligne compacte, étoiles en ligne, boutons visibles.
     - ENTRÉE : la ligne du haut et l'aide du bas sont légèrement coupées.
     - COURSE : correct, mais boutons tactiles larges ; le « VOITURE FOLLE » chevauche le panneau intégrité.
     - PAUSE : correct.
     - PORTRAIT : à remplacer par l'écran « Tourne ton téléphone ».
     - Règle générale : écrans en `max-height` + `overflow:auto`, `@media (max-height:520px)` pour le
       paysage bas, `env(safe-area-inset-*)` pour l'encoche.
   - Outil prêt : script de captures multi-écrans (à recréer dans le scratchpad, cf. `screens.js` :
     5 tailles × 8 écrans + détection des débordements). Skill : `threejs-game-ui-designer`.
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
