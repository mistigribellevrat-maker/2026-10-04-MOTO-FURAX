# MOTOR FURAX

Jeu d'arcade urbain 3D (HTML5 / CSS3 / JavaScript + WebGL via Three.js).
Ton pilote est en retard au collège : il doit traverser la ville en moto avant la sonnerie, en évitant manifestants, chat, camion SSB, copine lanceuse de smartphones, voiture folle… et son père, qui le poursuit en scooter.

## Les pilotes — tous à égalité

Tous les pilotes ont **la même vitesse, la même solidité et le même chrono possible** (vérifié avec un robot qui joue des dizaines de courses). Chacun gagne du temps **à sa façon** :

| Pilote | Style | Pouvoir (touche E) |
|---|---|---|
| **Oscar** — le roi des airs | Saute plus haut ; chaque vraie réception recharge la nitro | **Super saut** : bond géant, même en plein vol |
| **Arthur** — le costaud | Ralentit deux fois moins aux chocs, sa moto s'abîme moins | **Bélier** : 4 s à renverser tout ce qui est bas |
| **Tom** — la fusée | Frôler un obstacle remplit sa nitro, qui dure plus longtemps | **Hyper nitro** : nitro pleine et illimitée 3 s |
| **Yanis** — l'anguille | Tourne plus vite, se faufile dans les plus petits trous | **Esquive** : écart éclair, intouchable 0,5 s |
| **Clothilde** — la maligne | Nitro qui se recharge vite, cafés à +10 s, boost de la copine | **Appel à papa** : il décroche et s'arrête 4 s |

Les motos de la boutique changent **uniquement le style** (mêmes performances). Chaque pilote garde sa moto.

## Aide (par pilote)

Dans l'écran de choix du pilote : **AIDE : AUCUNE / UN PEU / BEAUCOUP**. Papa un peu plus lent, moins de dégâts, trajectoire corrigée automatiquement, quelques secondes en plus. Chaque pilote garde son réglage, et **les records avec aide sont comptés à part**.

## Records, étoiles et fantôme

- **Temps = chrono réel de la course**, au dixième. Les cafés ajoutent du temps au compte à rebours mais **ne changent jamais le record**, ni le score.
- Records **par pilote**, plus le **record de la famille**.
- **3 défis par niveau** (étoiles). Les étoiles de chaque pilote débloquent deux motos (PROTO 500 à 3 ★, FUSÉE DE POCHE à 6 ★).
- **Fantôme** : une moto translucide rejoue le record du pilote ; le HUD indique l'écart en mètres.
- **Défi du jour** : même parcours et mêmes surprises pour tout le monde ce jour-là.

## Niveaux

- **Niveau 1 · Collège Molière** (60 s).
- **Niveau 2 · Jour de pluie** (64 s), débloqué après une première victoire : route mouillée, adhérence réduite, flaques partout, éclairs et rafales de vent.
- **Boss de fin** : le principal et ses surveillants barrent la rue avec une banderole devant le collège. Une seule brèche, qui se déplace… ou on saute par-dessus.

## Ce qui rend chaque course différente

- Obstacles tirés au hasard à chaque partie, barrages à une seule brèche, tremplins + manif sur toute la chaussée.
- Événements surprises : voiture folle, voiture à contresens, raccourci de papa, chantier surprise, pluie de bonus.
- Papa ne lâche jamais : à fond sans nitro, il grignote du terrain.
- **Figures** : en l'air, garde SAUT appuyé + ◀ ▶ pour faire un 360° (points et nitro ; réception de travers = chute).
- **Ralenti** sur les exploits (frôlement extrême, voiture folle évitée, principal esquivé, 360°).
- Musique qui accélère quand papa approche et dans les 10 dernières secondes.

## Photo et vidéo

- **Mode photo** (Pause → MODE PHOTO) : glisser pour tourner autour de la moto, molette pour zoomer, flèches pour déplacer, 5 filtres, flou d'arrière-plan, photo PNG en pleine résolution.
- **Clip vidéo** (Menu → CLIP VIDÉO : OUI) : la course est filmée avec chrono, vitesse et pilote incrustés ; bouton **TÉLÉCHARGER LE CLIP** en fin de course (format WebM).

## Voix

Dépose tes propres enregistrements dans `assets/voix/` (voir `assets/voix/A_LIRE.txt`) : papa qui crie le prénom de chaque enfant, la copine, le principal, le cri de victoire.

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
| Figure en l'air | Espace maintenu + ← → | SAUT maintenu + ◀ ▶ |
| Pause | Échap ou P | bouton ⏸ |
| Son | M | bouton 🔊 |
| Recommencer | R | — |

## Images à fournir (affiche et visages)

- **Affiche du jeu** : `assets/affiche.jpg` — grand cadre à droite de l'écran d'accueil (format conseillé 1200 × 1600 ; le cadre prend les proportions de l'image).
- **Visages des pilotes** : `assets/pilotes/oscar.jpg`, `arthur.jpg`, `tom.jpg`, `yanis.jpg`, `clothilde.jpg` (portrait 3:4, ex. 600 × 800).

Tant qu'une image manque, un emplacement indique où la déposer. Chemins réglables dans `js/00-utils.js` (`CFG.HOME_IMAGE`, `CFG.PILOT_PHOTO_DIR`).

## Son

Menu principal → **MOTEUR** : *Doux* (par défaut), *Normal*, *Coupé*. Le son moteur est un ronron grave et discret.

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
  34-levels.js        météo (pluie), boss de fin, aide au pilotage
  40-gameplay.js      physique, collisions, poursuite, caméra, HUD, boucle principale
  41-gamefeel.js      hit-stop, secousses, post-traitement réactif, animations
  42-pilots.js        choix du pilote (photos, niveau, aide) et pouvoirs spéciaux
  43-progress.js      records par pilote, record de la famille, défis/étoiles, fantôme, écran de fin
  44-media.js         clip vidéo de la course, mode photo
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
