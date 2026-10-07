/**
 * MOTOR FURAX - Moteur de Jeu Isométrique 3D
 * Architecture Web autonome sans dépendances
 */

'use strict';

/* ==========================================================================
   1. MODULE AUDIO PROCÉDURAL (SYNTHÈSE WEB AUDIO SANS ASSETS EXTERNES)
   ========================================================================== */
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.engineOsc = null;
        this.engineGain = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            
            // Oscillateur continu pour le moteur de la moto
            this.engineOsc = this.ctx.createOscillator();
            this.engineGain = this.ctx.createGain();
            this.engineOsc.type = 'sawtooth';
            this.engineOsc.frequency.setValueAtTime(65, this.ctx.currentTime);
            
            // Filtre passe-bas pour imiter un monocylindre furieux
            this.engineFilter = this.ctx.createBiquadFilter();
            this.engineFilter.type = 'lowpass';
            this.engineFilter.frequency.setValueAtTime(350, this.ctx.currentTime);

            this.engineOsc.connect(this.engineFilter);
            this.engineFilter.connect(this.engineGain);
            this.engineGain.connect(this.ctx.destination);
            this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
            this.engineOsc.start();

            this.initialized = true;
        } catch (e) {
            console.warn('AudioContext non supporté', e);
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.engineGain && this.ctx) {
            this.engineGain.gain.setValueAtTime(this.muted ? 0 : 0.08, this.ctx.currentTime);
        }
        return this.muted;
    }

    updateEngine(speedRatio, isNitro) {
        if (!this.initialized || this.muted) return;
        const targetFreq = 50 + speedRatio * 180 + (isNitro ? 80 : 0);
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);
        this.engineFilter.frequency.setTargetAtTime(250 + speedRatio * 900, this.ctx.currentTime, 0.08);
        this.engineGain.gain.setTargetAtTime(0.08 + speedRatio * 0.06, this.ctx.currentTime, 0.05);
    }

    stopEngine() {
        if (this.engineGain && this.ctx) {
            this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        }
    }

    playJump() {
        if (!this.initialized || this.muted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    playCrash() {
        if (!this.initialized || this.muted) return;
        // Bruit blanc percussif
        const bufferSize = this.ctx.sampleRate * 0.4;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }

    playCat() {
        if (!this.initialized || this.muted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(750, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(950, this.ctx.currentTime + 0.15);
        osc.frequency.linearRampToValueAtTime(450, this.ctx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.35);
    }

    playBell() {
        if (!this.initialized || this.muted) return;
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime + i * 0.15);
            gain.gain.setValueAtTime(0.25, this.ctx.currentTime + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + i * 0.15 + 1.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(this.ctx.currentTime + i * 0.15);
            osc.stop(this.ctx.currentTime + i * 0.15 + 1.3);
        });
    }
}

/* ==========================================================================
   2. GESTION DES TOUCHES & ENTRÉES AVEC PRIORITÉ DU FREINAGE
   ========================================================================== */
class InputManager {
    constructor() {
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            // Prévenir le défilement de la page via flèches/espace
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    getMovement() {
        // Arbitrage prioritaire : Le freinage annule absolument toute accélération
        let accelerate = false;
        let brake = false;

        const isBrakePressed = this.keys['ArrowDown'] || this.keys['KeyS'];
        const isAccPressed = this.keys['ArrowUp'] || this.keys['KeyW'];

        if (isBrakePressed) {
            brake = true;
            accelerate = false; // Règle d'or : priorité freinage
        } else if (isAccPressed) {
            accelerate = true;
        }

        let steer = 0;
        if (this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['KeyQ']) steer -= 1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) steer += 1;

        const jump = !!this.keys['Space'];
        const nitro = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyE']);

        return { accelerate, brake, steer, jump, nitro };
    }
}

/* ==========================================================================
   3. SYSTÈME DE PARTICULES (FUMÉE, NITRO, ÉTINCELLES, DÉBRIS)
   ========================================================================== */
class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    emit(x, y, z, vx, vy, vz, color, size, life, shape = 'circle') {
        this.particles.push({
            x, y, z,
            vx, vy, vz,
            color,
            size,
            maxLife: life,
            life: life,
            shape
        });
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            p.vz -= 300 * dt; // Légère gravité
            if (p.z < 0) {
                p.z = 0;
                p.vx *= 0.7;
                p.vy *= 0.7;
            }
        }
    }

    draw(ctx, project) {
        for (const p of this.particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            const pt = project(p.x, p.y, p.z);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;

            if (p.shape === 'spark') {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, p.size * (alpha * 0.8 + 0.2), 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, p.size * (2 - alpha), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    reset() {
        this.particles = [];
    }
}

/* ==========================================================================
   4. CONSTANTES ET CONFIGURATION DU CIRCUIT URBAIN
   ========================================================================== */
const CONFIG = {
    ROAD_WIDTH: 520,         // Voies de circulation (-260 à +260)
    SIDEWALK_WIDTH: 180,     // Trottoir gauche et droit (largeur totale praticable = 880)
    TOTAL_LENGTH: 17500,     // Distance jusqu'au portail du collège
    MAX_SPEED: 780,          // ~100 km/h nominal
    NITRO_SPEED: 1250,       // ~160 km/h en pointe
    ACCEL: 450,
    BRAKE_DECEL: 1100,
    NATURAL_DECEL: 200,
    STEER_SPEED: 480,
    JUMP_VELOCITY: 520,
    GRAVITY: 1100,
    MAX_HEALTH: 100,
    INITIAL_TIME: 60,        // 60 secondes chrono
    DAD_NOMINAL_SPEED: 740,  // Le père colle aux basques
    DAD_RUSH_SPEED: 920      // Si le joueur ralentit ou s'écrase
};

/* ==========================================================================
   5. MOTEUR DU JEU ISOMÉTRIQUE "MOTOR FURAX"
   ========================================================================== */
class MotorFuraxEngine {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Modules
        this.audio = new SoundEngine();
        this.inputs = new InputManager();
        this.particles = new ParticleSystem();

        // Machine à États : 'HOME' | 'MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAMEOVER'
        this.state = 'HOME';

        // Caméra et projection
        this.camera = { x: 0, y: 0, shake: 0, tilt: 0 };
        this.scale = 1.0;

        // Entités
        this.resetGameData();
        this.setupEventListeners();
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Démarrage de la boucle d'animation
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    resetGameData() {
        // État du Joueur
        this.player = {
            x: 0,
            y: 300,
            z: 0,
            vx: 0,
            vy: 0,
            vz: 0,
            isGrounded: true,
            steerAngle: 0,
            spinTimer: 0,       // Perte de contrôle (chat)
            health: CONFIG.MAX_HEALTH,
            nitro: 100,
            isNitroActive: false,
            invulnerableTimer: 0
        };

        // Poursuivant : Le Père
        this.dad = {
            distance: 650,      // Démarre 650 unités derrière
            y: -350,
            warning: false
        };

        // Chronomètre
        this.timeRemaining = CONFIG.INITIAL_TIME;
        this.stats = {
            topSpeed: 0,
            startTime: 0
        };

        this.particles.reset();
        this.generateWorld();
    }

    generateWorld() {
        this.obstacles = [];
        this.scenery = [];

        // 1. Génération des Immeubles et Décorations le long de la rue
        for (let y = 0; y < CONFIG.TOTAL_LENGTH + 1000; y += 450) {
            // Immeuble Gauche
            this.scenery.push({
                type: 'building',
                x: -(CONFIG.ROAD_WIDTH / 2 + CONFIG.SIDEWALK_WIDTH + 140),
                y: y + Math.sin(y) * 40,
                w: 220,
                l: 380,
                h: 220 + (y % 3) * 60,
                hue: (y * 0.05) % 360
            });

            // Immeuble ou Espace Vert Droit
            if ((y % 1800) < 600) {
                // Espace vert / Parc urbain
                this.scenery.push({
                    type: 'tree',
                    x: (CONFIG.ROAD_WIDTH / 2 + 80),
                    y: y + 100,
                    h: 140
                });
            } else {
                // Bâtiment Droit
                this.scenery.push({
                    type: 'building',
                    x: (CONFIG.ROAD_WIDTH / 2 + CONFIG.SIDEWALK_WIDTH + 140),
                    y: y,
                    w: 220,
                    l: 400,
                    h: 200 + (y % 4) * 40,
                    hue: (y * 0.08 + 180) % 360
                });
            }

            // Voitures garées le long des trottoirs
            if (y > 600 && y % 900 === 0) {
                this.scenery.push({
                    type: 'parked_car',
                    x: (y % 1800 === 0) ? -CONFIG.ROAD_WIDTH / 2 + 35 : CONFIG.ROAD_WIDTH / 2 - 35,
                    y: y,
                    w: 60,
                    l: 110,
                    h: 45,
                    color: (y % 2 === 0) ? '#1e90ff' : '#ff4757'
                });
            }
        }

        // 2. Génération des Obstacles selon le scénario
        // a) Les Chats (mobiles, bas, franchissables en saut)
        const catPositions = [1200, 3400, 6800, 10200, 13500];
        catPositions.forEach((y, i) => {
            this.obstacles.push({
                id: `cat_${i}`,
                type: 'CAT',
                x: (i % 2 === 0 ? -180 : 180),
                y: y,
                z: 0,
                w: 30,
                l: 30,
                h: 22,          // Obstacle BAS
                vx: (i % 2 === 0 ? 190 : -190), // Traverse la chaussée
                triggered: false
            });
        });

        // b) Camions SSB (massifs, pleins, infranchissables par saut)
        const truckPositions = [2200, 5200, 8900, 12200, 14800];
        truckPositions.forEach((y, i) => {
            this.obstacles.push({
                id: `truck_${i}`,
                type: 'TRUCK_SSB',
                x: (i % 2 === 0 ? -100 : 100),
                y: y,
                z: 0,
                w: 90,
                l: 220,
                h: 130,         // Obstacle PLEIN
                vx: 0
            });
        });

        // c) Les Manifestants avec pancartes (bloquent un passage)
        const protestPositions = [4100, 9600, 13900];
        protestPositions.forEach((y, i) => {
            this.obstacles.push({
                id: `protest_${i}`,
                type: 'PROTESTERS',
                x: (i % 2 === 0 ? -90 : 70),
                y: y,
                z: 0,
                w: 160,
                l: 60,
                h: 75,          // Obstacle MOYEN
                signs: ['GRÈVE DU BAC !', 'NON AU RÉVEIL 8H !', 'SSB EN RETARD !', 'VÉLOS EN COLÈRE']
            });
        });

        // d) La Copine amoureuse sur le trottoir projetant un smartphone
        const gfPositions = [2800, 7800, 11500];
        gfPositions.forEach((y, i) => {
            this.obstacles.push({
                id: `gf_${i}`,
                type: 'GIRLFRIEND',
                x: CONFIG.ROAD_WIDTH / 2 + 50, // Sur le trottoir
                y: y,
                z: 0,
                w: 40,
                l: 40,
                h: 70,
                hasThrown: false
            });
        });

        // Projectiles actifs lancés par la copine
        this.projectiles = [];
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        // Maintien d'un ratio de projection sans déformation anamorphique
        this.scale = Math.min(this.canvas.width / 1100, this.canvas.height / 750);
        if (this.scale < 0.65) this.scale = 0.65;
    }

    setupEventListeners() {
        // Boutons Écran 1 Accueil
        document.getElementById('btn-home-play').addEventListener('click', () => {
            this.audio.init();
            this.switchState('MENU');
        });

        // Boutons Écran 2 Menu
        document.getElementById('btn-menu-start').addEventListener('click', () => {
            this.audio.init();
            this.startGame();
        });

        document.getElementById('btn-menu-load').addEventListener('click', () => {
            document.getElementById('modal-load').classList.add('active');
        });

        document.getElementById('btn-menu-shop').addEventListener('click', () => {
            document.getElementById('modal-shop').classList.add('active');
        });

        document.getElementById('btn-menu-quit').addEventListener('click', () => {
            this.switchState('HOME');
        });

        // Fermeture des modales
        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.getAttribute('data-target');
                document.getElementById(target).classList.remove('active');
            });
        });

        // Boutons In-Game (Audio & Pause)
        document.getElementById('btn-audio-toggle').addEventListener('click', (e) => {
            const isMuted = this.audio.toggleMute();
            e.target.textContent = isMuted ? '🔇' : '🔊';
        });

        document.getElementById('btn-pause-toggle').addEventListener('click', () => {
            if (this.state === 'PLAYING') this.switchState('PAUSED');
            else if (this.state === 'PAUSED') this.switchState('PLAYING');
        });

        // Touche Échap pour pause
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') {
                if (this.state === 'PLAYING') this.switchState('PAUSED');
                else if (this.state === 'PAUSED') this.switchState('PLAYING');
            }
        });

        // Boutons Overlays Pause, Game Over, Victoire
        document.getElementById('btn-pause-resume').addEventListener('click', () => this.switchState('PLAYING'));
        document.getElementById('btn-pause-restart').addEventListener('click', () => this.startGame());
        document.getElementById('btn-pause-menu').addEventListener('click', () => this.switchState('MENU'));

        document.getElementById('btn-go-retry').addEventListener('click', () => this.startGame());
        document.getElementById('btn-go-menu').addEventListener('click', () => this.switchState('MENU'));

        document.getElementById('btn-vic-replay').addEventListener('click', () => this.startGame());
        document.getElementById('btn-vic-menu').addEventListener('click', () => this.switchState('MENU'));
    }

    switchState(newState) {
        this.state = newState;
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.game-overlay').forEach(o => o.classList.remove('active'));

        if (newState === 'HOME') {
            document.getElementById('screen-home').classList.add('active');
            this.audio.stopEngine();
        } else if (newState === 'MENU') {
            document.getElementById('screen-menu').classList.add('active');
            this.audio.stopEngine();
        } else if (newState === 'PLAYING') {
            document.getElementById('screen-game').classList.add('active');
        } else if (newState === 'PAUSED') {
            document.getElementById('screen-game').classList.add('active');
            document.getElementById('overlay-pause').classList.add('active');
            this.audio.stopEngine();
        } else if (newState === 'GAMEOVER') {
            document.getElementById('screen-game').classList.add('active');
            document.getElementById('overlay-gameover').classList.add('active');
            this.audio.stopEngine();
        } else if (newState === 'VICTORY') {
            document.getElementById('screen-game').classList.add('active');
            document.getElementById('overlay-victory').classList.add('active');
            this.audio.stopEngine();
            this.audio.playBell();
        }
    }

    startGame() {
        this.resetGameData();
        this.switchState('PLAYING');
    }

    /* ==========================================================================
       6. PROJECTION GÉOMÉTRIQUE ISOMÉTRIQUE 3D OBLIQUE
       ========================================================================== */
    project(wx, wy, wz = 0) {
        // Caméra relative avec lissage et compensation d'angles
        const dx = wx - this.camera.x;
        const dy = wy - this.camera.y;

        // Angle isométrique dimétrique optimisé Paperboy / Arcade :
        // La route file vers le haut et légèrement en biais
        const cosA = 0.866;
        const sinA = 0.48;

        const screenX = (this.canvas.width / 2) + (dx * cosA - dy * 0.32) * this.scale;
        const screenY = (this.canvas.height * 0.68) + (dx * 0.22 - dy * sinA - wz) * this.scale;

        return { x: screenX, y: screenY };
    }

    /* ==========================================================================
       7. PHYSIQUE, CONTRÔLES ET COLLISIONS
       ========================================================================== */
    update(dt) {
        if (this.state !== 'PLAYING') return;

        // Limiteur de delta pour éviter le tunneling lors des saccades
        const safeDt = Math.min(dt, 0.05);

        // a) Décompte du chronomètre scolaire
        this.timeRemaining -= safeDt;
        if (this.timeRemaining <= 0) {
            this.timeRemaining = 0;
            this.triggerGameOver('RETARD FATAL ! Le collège a fermé ses grilles !');
            return;
        }

        // b) Gestion des Entrées
        const move = this.inputs.getMovement();
        const p = this.player;

        if (p.invulnerableTimer > 0) p.invulnerableTimer -= safeDt;
        if (p.spinTimer > 0) {
            p.spinTimer -= safeDt;
            // Perte temporaire de directivité en cas de dérapage sur le chat
            move.steer += Math.sin(p.spinTimer * 22) * 2.2;
        }

        // Nitro : Augmentation instantanée de l'accélération
        p.isNitroActive = false;
        if (move.nitro && p.nitro > 0 && p.vy > 100) {
            p.isNitroActive = true;
            p.nitro = Math.max(0, p.nitro - 35 * safeDt);
            // Particules de nitro
            this.particles.emit(
                p.x + (Math.random() - 0.5) * 12,
                p.y - 30,
                p.z + 10,
                (Math.random() - 0.5) * 60,
                -250,
                Math.random() * 40,
                '#00f0ff',
                4.5,
                0.25,
                'spark'
            );
        } else if (!move.nitro && p.nitro < 100) {
            p.nitro = Math.min(100, p.nitro + 6 * safeDt); // Régénération douce
        }

        // Accélération / Freinage d'urgence (Priorité absolue au freinage respectée)
        const currentMaxSpeed = p.isNitroActive ? CONFIG.NITRO_SPEED : CONFIG.MAX_SPEED;

        if (move.brake) {
            p.vy = Math.max(0, p.vy - CONFIG.BRAKE_DECEL * safeDt);
            // Étincelles de freinage
            if (p.vy > 80 && p.isGrounded) {
                this.particles.emit(p.x, p.y - 15, p.z, (Math.random() - 0.5) * 140, -100, Math.random() * 80, '#ffcc00', 3, 0.2, 'spark');
            }
        } else if (move.accelerate) {
            const accRate = p.isNitroActive ? CONFIG.ACCEL * 2.2 : CONFIG.ACCEL;
            p.vy = Math.min(currentMaxSpeed, p.vy + accRate * safeDt);
        } else {
            // Décélération naturelle
            p.vy = Math.max(0, p.vy - CONFIG.NATURAL_DECEL * safeDt);
        }

        // Direction latérale
        const steerTarget = move.steer * (p.vy > 30 ? 1 : 0);
        p.steerAngle += (steerTarget - p.steerAngle) * 10 * safeDt;
        p.vx = p.steerAngle * CONFIG.STEER_SPEED;

        // Déplacement X et Y
        p.x += p.vx * safeDt;
        p.y += p.vy * safeDt;

        // Mise à jour de la vitesse de pointe atteinte
        const kmh = Math.round(p.vy * 0.13);
        if (kmh > this.stats.topSpeed) this.stats.topSpeed = kmh;

        // Saut vertical parabolique
        if (move.jump && p.isGrounded) {
            p.vz = CONFIG.JUMP_VELOCITY;
            p.isGrounded = false;
            this.audio.playJump();
        }

        if (!p.isGrounded) {
            p.z += p.vz * safeDt;
            p.vz -= CONFIG.GRAVITY * safeDt;
            if (p.z <= 0) {
                p.z = 0;
                p.vz = 0;
                p.isGrounded = true;
            }
        }

        // c) Sortie de piste et bordures solides des trottoirs/immeubles
        const roadLimit = (CONFIG.ROAD_WIDTH / 2) + CONFIG.SIDEWALK_WIDTH - 25;
        if (Math.abs(p.x) > roadLimit) {
            p.x = Math.sign(p.x) * roadLimit;
            p.vx = -p.vx * 0.3; // Rebond avec friction
            p.vy *= 0.85;
            this.camera.shake = 8;
            this.particles.emit(p.x, p.y, p.z + 10, -Math.sign(p.x) * 120, 0, 80, '#ff9900', 4, 0.3, 'spark');
        }

        // Fumée d'échappement continue
        if (p.vy > 20 && Math.random() < 0.6) {
            this.particles.emit(
                p.x, p.y - 25, p.z + 8,
                (Math.random() - 0.5) * 30, -80, Math.random() * 30,
                'rgba(180,180,190,0.5)', 3.5, 0.4
            );
        }

        // d) Dynamique de la Poursuite du Père
        // Vitesse du père relative au comportement du joueur
        let dadSpeed = CONFIG.DAD_NOMINAL_SPEED;
        if (p.vy < 400 || p.spinTimer > 0) {
            dadSpeed = CONFIG.DAD_RUSH_SPEED; // Il comble l'écart en cas d'erreur
        } else if (p.isNitroActive) {
            dadSpeed = CONFIG.DAD_NOMINAL_SPEED * 0.75; // La nitro le distance
        }

        this.dad.y += dadSpeed * safeDt;
        this.dad.distance = p.y - this.dad.y;

        // e) Gestion des Obstacles & Collisions
        this.updateObstacles(safeDt);

        // f) Condition d'arbitrage à la ligne d'arrivée du Collège
        if (p.y >= CONFIG.TOTAL_LENGTH) {
            // Règle d'or : La VICTOIRE prime sur la capture par le père
            this.triggerVictory();
            return;
        }

        // Interception par le Père (si pas encore franchi le collège)
        if (this.dad.distance <= 0) {
            this.triggerGameOver('CHOPPÉ PAR LE DARON ! "Privé de moto et deux semaines de colle !"', 'dad');
            return;
        }

        // Mort par destruction de la bécane
        if (p.health <= 0) {
            p.health = 0;
            this.triggerGameOver('MOTO BROYÉE ! Échec de la mission mécanique.', 'crash');
            return;
        }

        // g) Mise à jour de la Caméra avec Inertie et Tremblement
        this.camera.x += (p.x * 0.7 - this.camera.x) * 6 * safeDt;
        this.camera.y += (p.y + 120 - this.camera.y) * 8 * safeDt;
        this.camera.tilt += (p.steerAngle * 0.08 - this.camera.tilt) * 6 * safeDt;

        if (this.camera.shake > 0) {
            this.camera.shake = Math.max(0, this.camera.shake - 20 * safeDt);
        }

        // Particules & Audio
        this.particles.update(safeDt);
        this.audio.updateEngine(p.vy / CONFIG.MAX_SPEED, p.isNitroActive);

        // h) Actualisation du HUD
        this.updateHUD();
    }

    updateObstacles(dt) {
        const p = this.player;

        // 1. Mise à jour des projectiles de smartphones
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.x += proj.vx * dt;
            proj.y += proj.vy * dt;
            proj.z += proj.vz * dt;
            proj.vz -= 350 * dt; // Balistique

            // Collision avec le joueur (Z-Check)
            const dist = Math.hypot(p.x - proj.x, p.y - proj.y);
            if (dist < 42 && Math.abs(p.z - proj.z) < 35 && p.invulnerableTimer <= 0) {
                // Impact smartphone
                p.health = Math.max(0, p.health - 15);
                p.spinTimer = 0.6; // Déséquilibre de trajectoire
                p.invulnerableTimer = 0.8;
                this.camera.shake = 12;
                this.audio.playCrash();
                this.projectiles.splice(i, 1);
                continue;
            }

            // Écrasement au sol
            if (proj.z <= 0) {
                this.particles.emit(proj.x, proj.y, 0, 0, 0, 50, '#00f0ff', 3, 0.3, 'spark');
                this.projectiles.splice(i, 1);
            }
        }

        // 2. Obstacles sur la route
        for (const obs of this.obstacles) {
            // Logique propre à chaque type d'entité
            if (obs.type === 'CAT') {
                obs.x += obs.vx * dt;
                // Rebondit d'un trottoir à l'autre
                if (Math.abs(obs.x) > CONFIG.ROAD_WIDTH / 2) {
                    obs.vx = -obs.vx;
                }
            } else if (obs.type === 'GIRLFRIEND') {
                // Déclenche le lancer de smartphone quand le joueur approche
                if (!obs.hasThrown && Math.abs(p.y - obs.y) < 600 && p.y < obs.y) {
                    obs.hasThrown = true;
                    // Lancer balistique orienté vers la position future du joueur
                    this.projectiles.push({
                        x: obs.x - 20,
                        y: obs.y,
                        z: 45,
                        vx: -380,
                        vy: -80,
                        vz: 140
                    });
                }
            }

            // Contrat de Détection de Collision en Hauteur (Axe Z)
            const overlapX = Math.abs(p.x - obs.x) < (p.w || 30) / 2 + obs.w / 2;
            const overlapY = Math.abs(p.y - obs.y) < (p.l || 50) / 2 + obs.l / 2;

            if (overlapX && overlapY && p.invulnerableTimer <= 0) {
                // Règle 1 : Entité BASSE (Chat) -> Ignorée si saut physique Z > hauteur obstacle
                if (obs.type === 'CAT') {
                    if (p.z > obs.h) {
                        // Saut réussi par-dessus le chat !
                        continue;
                    }
                    // Collision Chat : Dérapage incontrôlé et directivité altérée
                    p.spinTimer = 1.6;
                    p.vy *= 0.65;
                    p.health = Math.max(0, p.health - 6);
                    p.invulnerableTimer = 1.0;
                    this.camera.shake = 10;
                    this.audio.playCat();
                    this.particles.emit(obs.x, obs.y, obs.z + 10, 0, 0, 60, '#ff4757', 4, 0.4);
                }

                // Règle 2 : Entité PLEINE (Camion SSB) -> Infranchissable quel que soit Z
                else if (obs.type === 'TRUCK_SSB') {
                    p.vy = 0; // Arrêt net
                    p.health = Math.max(0, p.health - 40);
                    p.invulnerableTimer = 1.2;
                    this.camera.shake = 24;
                    this.audio.playCrash();
                    // Débris massifs
                    for (let k = 0; k < 18; k++) {
                        this.particles.emit(
                            p.x + (Math.random() - 0.5) * 40,
                            p.y + (Math.random() - 0.5) * 40,
                            25,
                            (Math.random() - 0.5) * 350,
                            (Math.random() - 0.5) * 350,
                            Math.random() * 200,
                            '#ffcc00', 5, 0.5, 'spark'
                        );
                    }
                    // Repousse le joueur en arrière du camion
                    p.y = obs.y - obs.l / 2 - 35;
                }

                // Règle 3 : Manifestants -> Décélération drastique et dégâts légers
                else if (obs.type === 'PROTESTERS') {
                    if (p.z > obs.h) continue; // Saut exceptionnel
                    p.vy *= 0.25; // Forte décélération
                    p.health = Math.max(0, p.health - 12);
                    p.invulnerableTimer = 0.9;
                    this.camera.shake = 14;
                    this.audio.playCrash();
                }
            }
        }
    }

    updateHUD() {
        // Chronomètre
        const timerEl = document.getElementById('hud-time');
        const mins = Math.floor(this.timeRemaining / 60);
        const secs = Math.floor(this.timeRemaining % 60);
        const ms = Math.floor((this.timeRemaining % 1) * 100);
        timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
        
        if (this.timeRemaining < 15) timerEl.classList.add('urgent');
        else timerEl.classList.remove('urgent');

        // Vitesse
        const speedKmh = Math.round(this.player.vy * 0.13);
        document.getElementById('hud-speed').textContent = speedKmh;

        // Barres
        const healthPct = Math.round(this.player.health);
        document.getElementById('bar-health').style.width = `${healthPct}%`;
        document.getElementById('txt-health').textContent = `${healthPct}%`;

        const nitroPct = Math.round(this.player.nitro);
        document.getElementById('bar-nitro').style.width = `${nitroPct}%`;
        document.getElementById('txt-nitro').textContent = `${nitroPct}%`;

        // Radar Daron
        const dadDist = Math.max(0, Math.round(this.dad.distance));
        const dadEl = document.getElementById('radar-dad');
        const alertEl = document.getElementById('radar-warning');
        
        // Position relative sur la barre radar (0% = collé, 100% = loin)
        const pct = Math.min(100, (dadDist / 800) * 100);
        dadEl.style.transform = `translateX(${100 - pct}%)`;

        if (dadDist < 250) {
            alertEl.textContent = 'DANGER IMMINENT ! IL EST SUR TES TALONS !';
            alertEl.classList.add('danger');
        } else {
            alertEl.textContent = `DISTANCE : ${Math.round(dadDist * 0.15)} M`;
            alertEl.classList.remove('danger');
        }
    }

    triggerGameOver(reason, type = 'crash') {
        document.getElementById('go-reason').textContent = reason;
        document.getElementById('go-speed').textContent = this.stats.topSpeed;
        document.getElementById('go-dist').textContent = Math.round(this.player.y * 0.1);
        this.switchState('GAMEOVER');
    }

    triggerVictory() {
        const timeSpent = CONFIG.INITIAL_TIME - this.timeRemaining;
        const mins = Math.floor(this.timeRemaining / 60);
        const secs = Math.floor(this.timeRemaining % 60);
        
        document.getElementById('vic-time').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} restant`;
        document.getElementById('vic-health').textContent = `${Math.round(this.player.health)}%`;
        
        // Calcul du rang scolaire
        let rank = 'C';
        if (this.timeRemaining > 25 && this.player.health > 70) rank = 'S+';
        else if (this.timeRemaining > 15 && this.player.health > 50) rank = 'A';
        else if (this.player.health > 30) rank = 'B';
        document.getElementById('vic-rank').textContent = rank;

        this.switchState('VICTORY');
    }

    /* ==========================================================================
       8. RENDU GRAPHIQUE ISOMÉTRIQUE (STANDARD TRIPLE-A CANVAS 2D)
       ========================================================================== */
    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Ciel Urbain Dégradé
        const skyGrad = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        skyGrad.addColorStop(0, '#0d131f');
        skyGrad.addColorStop(0.7, '#1b2234');
        skyGrad.addColorStop(1, '#111622');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();
        // Applique les secousses de caméra (shake) et l'inclinaison de virage (tilt)
        if (this.camera.shake > 0) {
            const rx = (Math.random() - 0.5) * this.camera.shake;
            const ry = (Math.random() - 0.5) * this.camera.shake;
            ctx.translate(rx, ry);
        }
        ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        ctx.rotate(this.camera.tilt);
        ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2);

        // a) Rendu du sol et de la chaussée asphaltée continue
        this.drawRoad(ctx);

        // b) Tri en profondeur de toutes les entités (Back-to-Front Y-Depth Sort)
        const renderList = [];

        // Éléments du décor (bâtiments, arbres, voitures garées)
        for (const sc of this.scenery) {
            if (sc.y > this.camera.y - 1200 && sc.y < this.camera.y + 1800) {
                renderList.push({ type: 'scenery', data: sc, sortY: sc.y });
            }
        }

        // Obstacles
        for (const obs of this.obstacles) {
            if (obs.y > this.camera.y - 1000 && obs.y < this.camera.y + 1600) {
                renderList.push({ type: 'obstacle', data: obs, sortY: obs.y });
            }
        }

        // Projectiles de smartphones
        for (const proj of this.projectiles) {
            renderList.push({ type: 'projectile', data: proj, sortY: proj.y });
        }

        // Moto du joueur
        renderList.push({ type: 'player', data: this.player, sortY: this.player.y });

        // Véhicule du père poursuivant
        renderList.push({ type: 'dad', data: this.dad, sortY: this.dad.y });

        // Tri par coordonnée Y croissante (peintre isométrique)
        renderList.sort((a, b) => a.sortY - b.sortY);

        // c) Dessin ordonné des entités
        for (const item of renderList) {
            if (item.type === 'scenery') this.drawSceneryItem(ctx, item.data);
            else if (item.type === 'obstacle') this.drawObstacle(ctx, item.data);
            else if (item.type === 'projectile') this.drawProjectile(ctx, item.data);
            else if (item.type === 'player') this.drawPlayer(ctx, item.data);
            else if (item.type === 'dad') this.drawDad(ctx, item.data);
        }

        // d) Particules actives
        this.particles.draw(ctx, (wx, wy, wz) => this.project(wx, wy, wz));

        // e) Portail final du collège
        this.drawSchoolGates(ctx);

        ctx.restore();
    }

    drawRoad(ctx) {
        // Délimitation de la section visible
        const startY = Math.floor((this.camera.y - 1400) / 100) * 100;
        const endY = this.camera.y + 1800;

        const rw2 = CONFIG.ROAD_WIDTH / 2;
        const sw = CONFIG.SIDEWALK_WIDTH;

        // Trottoirs latéraux surélevés (Gris granit structuré)
        const p1 = this.project(-rw2 - sw, startY, 0);
        const p2 = this.project(-rw2 - sw, endY, 0);
        const p3 = this.project(rw2 + sw, endY, 0);
        const p4 = this.project(rw2 + sw, startY, 0);

        ctx.fillStyle = '#2d3748';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();

        // Asphalt de la route principale
        const r1 = this.project(-rw2, startY, 0);
        const r2 = this.project(-rw2, endY, 0);
        const r3 = this.project(rw2, endY, 0);
        const r4 = this.project(rw2, startY, 0);

        ctx.fillStyle = '#1a202c';
        ctx.beginPath();
        ctx.moveTo(r1.x, r1.y);
        ctx.lineTo(r2.x, r2.y);
        ctx.lineTo(r3.x, r3.y);
        ctx.lineTo(r4.x, r4.y);
        ctx.closePath();
        ctx.fill();

        // Bordures de trottoir avec effet d'élévation 3D (Z=10)
        [-rw2, rw2].forEach((cx) => {
            const b1 = this.project(cx, startY, 0);
            const b2 = this.project(cx, endY, 0);
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 3 * this.scale;
            ctx.beginPath();
            ctx.moveTo(b1.x, b1.y);
            ctx.lineTo(b2.x, b2.y);
            ctx.stroke();
        });

        // Marquages au sol : Lignes blanches pointillées des 3 voies
        ctx.strokeStyle = '#f7fafc';
        ctx.setLineDash([30 * this.scale, 40 * this.scale]);
        ctx.lineWidth = 4 * this.scale;

        [-rw2 / 3, rw2 / 3].forEach((laneX) => {
            const l1 = this.project(laneX, startY, 0);
            const l2 = this.project(laneX, endY, 0);
            ctx.beginPath();
            ctx.moveTo(l1.x, l1.y);
            ctx.lineTo(l2.x, l2.y);
            ctx.stroke();
        });
        ctx.setLineDash([]); // Reset dash
    }

    drawSceneryItem(ctx, sc) {
        if (sc.type === 'building') {
            this.draw3DBox(ctx, sc.x, sc.y, 0, sc.w, sc.l, sc.h, `hsl(${sc.hue}, 20%, 30%)`, `hsl(${sc.hue}, 25%, 45%)`, `hsl(${sc.hue}, 30%, 60%)`);
        } else if (sc.type === 'tree') {
            // Ombre portée au sol
            const sPt = this.project(sc.x + 15, sc.y - 15, 0);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.beginPath();
            ctx.ellipse(sPt.x, sPt.y, 40 * this.scale, 22 * this.scale, 0, 0, Math.PI * 2);
            ctx.fill();

            // Tronc
            const bPt = this.project(sc.x, sc.y, 0);
            const tPt = this.project(sc.x, sc.y, sc.h * 0.4);
            ctx.strokeStyle = '#5a3d28';
            ctx.lineWidth = 12 * this.scale;
            ctx.beginPath();
            ctx.moveTo(bPt.x, bPt.y);
            ctx.lineTo(tPt.x, tPt.y);
            ctx.stroke();

            // Feuillage stylisé en couches
            const fPt = this.project(sc.x, sc.y, sc.h);
            ctx.fillStyle = '#2f855a';
            ctx.beginPath();
            ctx.arc(fPt.x, fPt.y, 45 * this.scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#38a169';
            ctx.beginPath();
            ctx.arc(fPt.x - 10 * this.scale, fPt.y - 10 * this.scale, 32 * this.scale, 0, Math.PI * 2);
            ctx.fill();
        } else if (sc.type === 'parked_car') {
            this.draw3DBox(ctx, sc.x, sc.y, 0, sc.w, sc.l, sc.h, '#1a202c', sc.color, '#cbd5e0');
        }
    }

    drawObstacle(ctx, obs) {
        if (obs.type === 'TRUCK_SSB') {
            // Ombre massive
            const sPt = this.project(obs.x + 20, obs.y - 20, 0);
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath();
            ctx.ellipse(sPt.x, sPt.y, 70 * this.scale, 40 * this.scale, 0, 0, Math.PI * 2);
            ctx.fill();

            // Corps du camion SSB
            this.draw3DBox(ctx, obs.x, obs.y, 0, obs.w, obs.l, obs.h, '#742a2a', '#c53030', '#e2e8f0');

            // Logo SSB géant sur le toit
            const topPt = this.project(obs.x, obs.y, obs.h);
            ctx.save();
            ctx.font = `bold ${24 * this.scale}px var(--font-heading)`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('SSB TRUCKING', topPt.x, topPt.y);
            ctx.restore();
        } else if (obs.type === 'CAT') {
            // Petit chat agile
            const sPt = this.project(obs.x + 4, obs.y - 4, 0);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(sPt.x, sPt.y, 14 * this.scale, 8 * this.scale, 0, 0, Math.PI * 2);
            ctx.fill();

            const cPt = this.project(obs.x, obs.y, obs.z);
            ctx.fillStyle = '#ed8936'; // Pelage roux
            ctx.beginPath();
            ctx.arc(cPt.x, cPt.y - 10 * this.scale, 10 * this.scale, 0, Math.PI * 2);
            ctx.fill();
            // Oreilles
            ctx.fillStyle = '#dd6b20';
            ctx.beginPath();
            ctx.moveTo(cPt.x - 8 * this.scale, cPt.y - 16 * this.scale);
            ctx.lineTo(cPt.x - 3 * this.scale, cPt.y - 26 * this.scale);
            ctx.lineTo(cPt.x + 2 * this.scale, cPt.y - 16 * this.scale);
            ctx.fill();
        } else if (obs.type === 'PROTESTERS') {
            // Groupe de manifestants avec pancartes
            [-40, 0, 40].forEach((ox, idx) => {
                const px = obs.x + ox;
                const py = obs.y + (idx % 2) * 15;
                const mPt = this.project(px, py, 0);
                
                // Corps
                ctx.fillStyle = idx % 2 === 0 ? '#4a5568' : '#2b6cb0';
                ctx.fillRect(mPt.x - 8 * this.scale, mPt.y - 40 * this.scale, 16 * this.scale, 35 * this.scale);
                // Tête
                ctx.fillStyle = '#fbd38d';
                ctx.beginPath();
                ctx.arc(mPt.x, mPt.y - 48 * this.scale, 8 * this.scale, 0, Math.PI * 2);
                ctx.fill();

                // Pancarte tenue en hauteur
                const signPt = this.project(px, py, obs.h + Math.sin(Date.now() * 0.008 + idx) * 8);
                ctx.fillStyle = '#edf2f7';
                ctx.strokeStyle = '#2d3748';
                ctx.lineWidth = 2 * this.scale;
                ctx.fillRect(signPt.x - 30 * this.scale, signPt.y - 25 * this.scale, 60 * this.scale, 25 * this.scale);
                ctx.strokeRect(signPt.x - 30 * this.scale, signPt.y - 25 * this.scale, 60 * this.scale, 25 * this.scale);

                ctx.font = `bold ${8 * this.scale}px sans-serif`;
                ctx.fillStyle = '#e53e3e';
                ctx.textAlign = 'center';
                ctx.fillText(obs.signs[idx % obs.signs.length], signPt.x, signPt.y - 10 * this.scale);
            });
        } else if (obs.type === 'GIRLFRIEND') {
            const gPt = this.project(obs.x, obs.y, 0);
            // Silhouette Copine
            ctx.fillStyle = '#d53f8c';
            ctx.fillRect(gPt.x - 10 * this.scale, gPt.y - 45 * this.scale, 20 * this.scale, 40 * this.scale);
            ctx.fillStyle = '#fbb6ce';
            ctx.beginPath();
            ctx.arc(gPt.x, gPt.y - 55 * this.scale, 10 * this.scale, 0, Math.PI * 2);
            ctx.fill();
            // Cœur au-dessus de la tête
            ctx.font = `${18 * this.scale}px sans-serif`;
            ctx.fillText('💔', gPt.x - 10 * this.scale, gPt.y - 75 * this.scale);
        }
    }

    drawProjectile(ctx, proj) {
        // Smartphone projeté en rotation
        const pt = this.project(proj.x, proj.y, proj.z);
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(Date.now() * 0.015);
        ctx.fillStyle = '#171923';
        ctx.fillRect(-10 * this.scale, -18 * this.scale, 20 * this.scale, 36 * this.scale);
        ctx.fillStyle = '#63b3ed'; // Écran allumé
        ctx.fillRect(-8 * this.scale, -15 * this.scale, 16 * this.scale, 30 * this.scale);
        ctx.restore();
    }

    drawPlayer(ctx, p) {
        // a) Ombre portée au sol réaliste (s'atténue et s'écarte lors d'un saut)
        const shadowScale = Math.max(0.4, 1 - p.z / 180);
        const sPt = this.project(p.x + p.z * 0.35, p.y - p.z * 0.2, 0);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.45 * shadowScale})`;
        ctx.beginPath();
        ctx.ellipse(sPt.x, sPt.y, 28 * this.scale * shadowScale, 14 * this.scale * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // b) Moto et Adolescent Rider
        const mPt = this.project(p.x, p.y, p.z);

        ctx.save();
        ctx.translate(mPt.x, mPt.y);

        // Clignotement si invulnérable post-dégâts
        if (p.invulnerableTimer > 0 && Math.floor(Date.now() / 80) % 2 === 0) {
            ctx.globalAlpha = 0.4;
        }

        // Roue arrière et avant
        ctx.fillStyle = '#1a202c';
        ctx.fillRect(-12 * this.scale, -8 * this.scale, 8 * this.scale, 18 * this.scale);
        ctx.fillRect(8 * this.scale, -28 * this.scale, 8 * this.scale, 18 * this.scale);

        // Châssis Moto Furax Sportive
        ctx.fillStyle = p.isNitroActive ? '#00f0ff' : '#ff0055';
        ctx.beginPath();
        ctx.moveTo(-10 * this.scale, -5 * this.scale);
        ctx.lineTo(12 * this.scale, -25 * this.scale);
        ctx.lineTo(8 * this.scale, -38 * this.scale);
        ctx.lineTo(-14 * this.scale, -15 * this.scale);
        ctx.closePath();
        ctx.fill();

        // Pilote (Ado en retard avec sac à dos d'écolier)
        ctx.fillStyle = '#2b6cb0'; // Veste bleue
        ctx.fillRect(-8 * this.scale, -32 * this.scale, 16 * this.scale, 20 * this.scale);

        // Sac à dos de collège
        ctx.fillStyle = '#c53030';
        ctx.fillRect(-14 * this.scale, -30 * this.scale, 8 * this.scale, 14 * this.scale);

        // Casque avec visière
        ctx.fillStyle = '#edf2f7';
        ctx.beginPath();
        ctx.arc(2 * this.scale, -40 * this.scale, 10 * this.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a202c'; // Visière fumée
        ctx.fillRect(4 * this.scale, -43 * this.scale, 7 * this.scale, 6 * this.scale);

        // Traînée de flamme Nitro
        if (p.isNitroActive) {
            ctx.fillStyle = '#39ff14';
            ctx.beginPath();
            ctx.moveTo(-12 * this.scale, -4 * this.scale);
            ctx.lineTo(-28 * this.scale - Math.random() * 15 * this.scale, 4 * this.scale);
            ctx.lineTo(-8 * this.scale, 2 * this.scale);
            ctx.fill();
        }

        ctx.restore();
    }

    drawDad(ctx, dad) {
        // Voiture vintage rouge furieuse du père poursuivant
        const dPt = this.project(this.player.x * 0.35, dad.y, 0);

        // Phares avant éblouissants
        ctx.save();
        const grad = ctx.createRadialGradient(dPt.x, dPt.y - 20, 10, dPt.x, dPt.y - 80, 140 * this.scale);
        grad.addColorStop(0, 'rgba(255, 235, 59, 0.45)');
        grad.addColorStop(1, 'rgba(255, 235, 59, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(dPt.x - 30 * this.scale, dPt.y);
        ctx.lineTo(dPt.x - 120 * this.scale, dPt.y - 180 * this.scale);
        ctx.lineTo(dPt.x + 120 * this.scale, dPt.y - 180 * this.scale);
        ctx.lineTo(dPt.x + 30 * this.scale, dPt.y);
        ctx.fill();

        // Carrosserie Berline du Daron
        this.draw3DBox(ctx, this.player.x * 0.35, dad.y, 0, 95, 170, 60, '#742a2a', '#e53e3e', '#feb2b2');

        // Klaxon / Avertisseur
        ctx.font = `bold ${14 * this.scale}px var(--font-heading)`;
        ctx.fillStyle = '#ff0055';
        ctx.textAlign = 'center';
        ctx.fillText('LE DARON EN COLÈRE !', dPt.x, dPt.y - 70 * this.scale);
        ctx.restore();
    }

    drawSchoolGates(ctx) {
        const yGate = CONFIG.TOTAL_LENGTH;
        const gPt = this.project(0, yGate, 0);

        // Piliers de l'entrée du collège
        [-CONFIG.ROAD_WIDTH / 2 - 40, CONFIG.ROAD_WIDTH / 2 + 40].forEach((px) => {
            this.draw3DBox(ctx, px, yGate, 0, 50, 50, 260, '#4a5568', '#718096', '#cbd5e0');
        });

        // Banderole géante d'arrivée
        const bPt = this.project(0, yGate, 220);
        ctx.save();
        ctx.fillStyle = '#2b6cb0';
        ctx.fillRect(bPt.x - 220 * this.scale, bPt.y - 45 * this.scale, 440 * this.scale, 55 * this.scale);
        ctx.strokeStyle = '#ecc94b';
        ctx.lineWidth = 4 * this.scale;
        ctx.strokeRect(bPt.x - 220 * this.scale, bPt.y - 45 * this.scale, 440 * this.scale, 55 * this.scale);

        ctx.font = `bold ${20 * this.scale}px var(--font-heading)`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('COLLÈGE VICTOR HUGO - 8H30 SONNERIE', bPt.x, bPt.y - 18 * this.scale);
        ctx.restore();
    }

    // Outil de projection de polygones 3D pour boîtes et bâtiments
    draw3DBox(ctx, x, y, z, w, l, h, colorLeft, colorRight, colorTop) {
        const hw = w / 2;
        const hl = l / 2;

        // Sommets de la face supérieure
        const t1 = this.project(x - hw, y - hl, z + h);
        const t2 = this.project(x + hw, y - hl, z + h);
        const t3 = this.project(x + hw, y + hl, z + h);
        const t4 = this.project(x - hw, y + hl, z + h);

        // Sommets au sol
        const b2 = this.project(x + hw, y - hl, z);
        const b3 = this.project(x + hw, y + hl, z);
        const b4 = this.project(x - hw, y + hl, z);

        // Face Droite
        ctx.fillStyle = colorRight;
        ctx.beginPath();
        ctx.moveTo(t2.x, t2.y);
        ctx.lineTo(t3.x, t3.y);
        ctx.lineTo(b3.x, b3.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.closePath();
        ctx.fill();

        // Face Sud / Avant
        ctx.fillStyle = colorLeft;
        ctx.beginPath();
        ctx.moveTo(t3.x, t3.y);
        ctx.lineTo(t4.x, t4.y);
        ctx.lineTo(b4.x, b4.y);
        ctx.lineTo(b3.x, b3.y);
        ctx.closePath();
        ctx.fill();

        // Face Supérieure (Toit)
        ctx.fillStyle = colorTop;
        ctx.beginPath();
        ctx.moveTo(t1.x, t1.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.lineTo(t3.x, t3.y);
        ctx.lineTo(t4.x, t4.y);
        ctx.closePath();
        ctx.fill();
    }

    /* ==========================================================================
       9. BOUCLE DE JEU PRINCIPALE (REQUEST ANIMATION FRAME)
       ========================================================================== */
    loop(currentTime) {
        const dt = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Mise à jour de la physique et des états
        this.update(dt);

        // Dessin si nous sommes dans un écran avec rendu actif
        if (this.state === 'PLAYING' || this.state === 'PAUSED' || this.state === 'GAMEOVER' || this.state === 'VICTORY') {
            this.draw();
        }

        requestAnimationFrame((t) => this.loop(t));
    }
}

// Initialisation au chargement de la fenêtre
window.addEventListener('DOMContentLoaded', () => {
    window.gameEngine = new MotorFuraxEngine();
});