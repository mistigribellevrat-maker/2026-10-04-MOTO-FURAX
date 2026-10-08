# MOTOR FURAX

Jeu d'arcade urbain 3D (HTML5 / CSS3 / JavaScript + WebGL via Three.js).
Sam est en retard au collège : il doit traverser la ville en moto avant la sonnerie, en évitant manifestants, chat, camion SSB, copine lanceuse de smartphones… et son père, qui le poursuit en scooter.

## Lancer le jeu

Double-clique sur **`index.html`** (aucune installation, aucun serveur, fonctionne hors-ligne).
Navigateur récent conseillé : Chrome, Edge, Firefox (WebGL 2).

## Commandes

| Action | Clavier | Tactile |
|---|---|---|
| Accélérer | ↑ / W / Z | GAZ |
| Freiner (prioritaire sur l'accélérateur) | ↓ / S | FREIN |
| Gauche / droite | ← → / Q D / A D | ◀ ▶ |
| Sauter | Espace | SAUT |
| Nitro | Maj | NITRO |
| Pause | Échap ou P | bouton ⏸ |
| Son | M | bouton 🔊 |
| Recommencer | R | — |

## Personnaliser l'écran d'accueil

Place une image **`motor_furax.jpg`** à côté de `index.html` : elle remplace la scène 3D d'accueil.
Le nom du fichier se règle dans `js/00-utils.js` (`CFG.HOME_IMAGE`).

## Graphismes

Menu principal → **GRAPHISMES** : *Auto* (résolution adaptée en temps réel pour rester fluide), *Élevés*, *Moyens*, *Bas*.
Paramètres d'URL utiles : `?quality=high|medium|low`.

## Structure du projet

```
index.html            page, écrans et HUD
css/style.css         styles (polices locales dans assets/fonts)
lib/                  Three.js r147 (MIT) + utilitaires
js/
  00-utils.js         constantes de jeu (CFG), motos, sauvegarde
  01-audio.js         moteur sonore synthétisé (Web Audio)
  02-state-input.js   machine à états (ACCUEIL → MENU → COURSE → VICTOIRE/DÉFAITE), clavier, tactile
  05-globals.js       état partagé de la scène
  10-render.js        pipeline HDR : MSAA, bloom, ACES, étalonnage, tilt-shift, flou radial, qualité adaptative
  12-lighting.js      soleil, ciel procédural, éclairage par l'environnement, ombres stables
  20-modelkit.js      outils de modélisation procédurale + matériau PBR universel
  21-textures.js      textures PBR procédurales (façades, devantures, route, pavés, décalcomanies)
  22-buildings.js     bâtiments modulaires
  23-props.js         arbres, lampadaires, voitures, mobilier urbain
  24-characters.js    humains articulés, chat, manifestants, copine, enfants
  25-vehicles.js      moto + pilote, scooter de papa, camion SSB, bus, objets
  30-world.js         route, chunks, zones, apparition des obstacles
  31-school.js        le collège Molière et l'arrivée
  32-fx.js            particules HDR, traînée nitro, traces de pneus, vent, poussière
  40-gameplay.js      physique, collisions, poursuite, caméra, HUD, boucle principale
  41-gamefeel.js      hit-stop, secousses, post-traitement réactif, animations
  99-hooks.js         `window.MF` : accès pour les tests
tests/acceptance.js   recette automatisée (voir ci-dessous)
```

## Tests automatisés

La recette vérifie le cahier des charges dans un vrai navigateur (états, pilotage, collisions en hauteur, poursuite du père, fin de partie, pause, redimensionnement, lancement `file://`) :

```
cd tests
npm install        # installe Playwright (une seule fois)
npx playwright install chromium
npm test
```

## Crédits

- Three.js — MIT, © les auteurs de three.js (`lib/three-LICENSE.txt`)
- Polices Orbitron et Rajdhani — SIL Open Font License (`assets/fonts/`)
- Tout le reste (modèles, textures, sons) est généré par le code.
