# MOTOR FURAX

Jeu d'arcade urbain 3D (HTML5 / CSS3 / JavaScript + WebGL via Three.js).
Ton pilote est en retard au collège : il doit traverser la ville en moto avant la sonnerie, en évitant manifestants, chat, camion SSB, copine lanceuse de smartphones, voiture folle… et son père, qui le poursuit en scooter.

## Les pilotes

| Pilote | Style | Pouvoir (touche E) |
|---|---|---|
| **Oscar** — le casse-cou | Saute plus haut ; chaque vraie réception recharge la nitro | **Super saut** : bond géant, même en plein vol |
| **Arthur** — le bulldozer | Très solide, ralentit beaucoup moins aux chocs, démarre lentement | **Bélier** : 4 s à renverser tout ce qui est bas, sans dégâts |
| **Tom** — la fusée | Le plus rapide ; frôler un obstacle remplit sa nitro ; tient mal la route | **Hyper nitro** : nitro pleine et illimitée 3 s |
| **Yanis** — l'anguille | Ultra maniable, gabarit plus fin | **Esquive** : écart éclair, intouchable 0,5 s |
| **Clothilde** — la stratège | Cafés à +10 s, nitro rapide, sa copine lui donne un boost | **Appel à papa** : papa décroche et s'arrête 4 s |

## Ce qui rend chaque course différente

- **Obstacles tirés au hasard à chaque partie** (plus jamais deux courses identiques), barrages à une seule brèche.
- **Événements surprises** toutes les 9-14 s : voiture folle (elle double puis se rabat sur toi), voiture à contresens, raccourci de papa, chantier surprise, pluie de bonus.
- **Tremplins** suivis d'une manif sur toute la chaussée : on saute par-dessus, ou on passe par le trottoir.
- **Papa ne lâche jamais** : à fond sans nitro, il grignote du terrain. Il faut gérer la nitro, les tremplins et les pouvoirs.
- **Score** : frôlements, sauts, voiture folle évitée, combos (perdus au premier choc). Meilleur score sauvegardé.

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
| Pouvoir du pilote | E (ou F) | POUVOIR |
| Pause | Échap ou P | bouton ⏸ |
| Son | M | bouton 🔊 |
| Recommencer | R | — |

## Images à fournir (affiche et visages)

- **Affiche du jeu** : `assets/affiche.jpg` — grand cadre à droite de l'écran d'accueil (format conseillé 1200 × 1600 ; le cadre prend les proportions de l'image).
- **Visages des pilotes** : `assets/pilotes/oscar.jpg`, `arthur.jpg`, `tom.jpg`, `yanis.jpg`, `clothilde.jpg` (portrait 3:4, ex. 600 × 800).

Tant qu'une image manque, un emplacement indique où la déposer. Chemins réglables dans `js/00-utils.js` (`CFG.HOME_IMAGE`, `CFG.PILOT_PHOTO_DIR`).

## Son

Menu principal → **MOTEUR** : *Doux* (par défaut), *Normal*, *Coupé*. Le son moteur est un ronron grave et discret.

## Niveaux

La structure est prête dans `js/00-utils.js` (`LEVELS` : distance, chrono, densité d'obstacles, fréquence des surprises). Un seul niveau jouable pour l'instant.

## Graphismes

Menu principal → **GRAPHISMES** : *Auto* (résolution adaptée en temps réel pour rester fluide), *Élevés*, *Moyens*, *Bas*.
Paramètres d'URL utiles : `?quality=high|medium|low`.

## Structure du projet

```
index.html            page, écrans et HUD
css/style.css         styles (polices locales dans assets/fonts)
lib/                  Three.js r147 (MIT) + utilitaires
js/
  00-utils.js         constantes de jeu (CFG), motos, pilotes, niveaux, sauvegarde
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
  33-events.js        événements surprises (voiture folle...), tremplins, frôlements, score
  40-gameplay.js      physique, collisions, poursuite, caméra, HUD, boucle principale
  41-gamefeel.js      hit-stop, secousses, post-traitement réactif, animations
  42-pilots.js        choix du pilote (photos) et pouvoirs spéciaux
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
