"use strict";
/* ------------------------------- 3. AUDIO -------------------------------- */
class SoundEngine {
  constructor() {
    this.ok = false;
    this.muted = save.muted;
    this.master = 0.85;
  }
  init() {
    if (this.ok) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.ok = true;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.master;
    this.masterGain.connect(this.ctx.destination);

    // Buffer de bruit reutilisable (vent, frictions, crashs)
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // --- Moteur : ronron grave et doux ---
    // Fini les dents de scie bourdonnantes : un triangle + un sinus grave, filtres sans resonance,
    // modules en amplitude au rythme des explosions du monocylindre ("pout-pout" plutot que "bzzz").
    this.engBus = this.ctx.createGain();                 // volume moteur reglable (DOUX / NORMAL / COUPE)
    this.engBus.gain.value = SoundEngine.ENGINE_VOL[save.engine] != null ? SoundEngine.ENGINE_VOL[save.engine] : 0.55;
    this.engBus.connect(this.masterGain);
    this.engGain = this.ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = this.ctx.createBiquadFilter();
    this.engFilter.type = "lowpass";
    this.engFilter.frequency.value = 320;
    this.engFilter.Q.value = 0.5;
    this.engAM = this.ctx.createGain();                  // modulation d'amplitude (pulsations)
    this.engAM.gain.value = 0.72;
    const mk = (type, f) => {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.start();
      return o;
    };
    this.engA = mk("triangle", 46);
    this.engB = mk("sine", 23);
    const gB = this.ctx.createGain(); gB.gain.value = 0.9;
    this.engA.connect(this.engFilter); this.engB.connect(gB); gB.connect(this.engFilter);
    this.engLfo = mk("sine", 11);
    this.engLfoDepth = this.ctx.createGain(); this.engLfoDepth.gain.value = 0.28;
    this.engLfo.connect(this.engLfoDepth); this.engLfoDepth.connect(this.engAM.gain);
    this.engFilter.connect(this.engAM);
    this.engAM.connect(this.engGain);
    this.engGain.connect(this.engBus);

    // --- Vent continu (gain module par la vitesse) ---
    this.windSrc = this.ctx.createBufferSource();
    this.windSrc.buffer = this.noiseBuf;
    this.windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 900;
    this.windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    this.windSrc.start();

    // --- Frein continu ---
    this.skidSrc = this.ctx.createBufferSource();
    this.skidSrc.buffer = this.noiseBuf;
    this.skidSrc.loop = true;
    this.skidFilter = this.ctx.createBiquadFilter();
    this.skidFilter.type = "highpass";
    this.skidFilter.frequency.value = 2400;
    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skidSrc.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.masterGain);
    this.skidSrc.start();

    // --- Nitro continu ---
    this.nitroSrc = this.ctx.createBufferSource();
    this.nitroSrc.buffer = this.noiseBuf;
    this.nitroSrc.loop = true;
    this.nitroFilter = this.ctx.createBiquadFilter();
    this.nitroFilter.type = "bandpass";
    this.nitroFilter.frequency.value = 3200;
    this.nitroFilter.Q.value = 0.8;
    this.nitroGain = this.ctx.createGain();
    this.nitroGain.gain.value = 0;
    this.nitroSrc.connect(this.nitroFilter);
    this.nitroFilter.connect(this.nitroGain);
    this.nitroGain.connect(this.masterGain);
    this.nitroSrc.start();

    // --- Sirène papa ---
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = "triangle";
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.masterGain);
    this.sirenOsc.start();
    this.sirenTime = 0;
  }
  resume() { if (this.ok && this.ctx.state === "suspended") this.ctx.resume(); }
  setMuted(m) {
    this.muted = m;
    save.muted = m; persistSave();
    if (this.ok) this.masterGain.gain.setTargetAtTime(m ? 0 : this.master, this.ctx.currentTime, 0.05);
  }
  beep(freq, dur, type, vol, slideTo) {
    if (!this.ok || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.16, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.masterGain);
    o.start(t); o.stop(t + dur + 0.03);
  }
  noiseBurst(dur, filterType, freq, vol, q) {
    if (!this.ok || this.muted) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q || 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.masterGain);
    s.start(t); s.stop(t + dur + 0.03);
  }
  setEngine(ratio, throttle, dt) {
    if (!this.ok) return;
    const r = clamp(ratio, 0, 1.4), t = this.ctx.currentTime;
    const f = 44 + r * 120;                               // registre grave : pas de sifflement dans les aigus
    this.engA.frequency.setTargetAtTime(f, t, 0.08);
    this.engB.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engLfo.frequency.setTargetAtTime(f * 0.25, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(260 + r * 520 + (throttle > 0 ? 120 : 0), t, 0.12);
    const idle = 0.05, open = 0.06 + r * 0.06;
    this.engGain.gain.setTargetAtTime(idle + open * (0.4 + 0.6 * Math.max(0, throttle)), t, 0.12);
    this.windGain.gain.setTargetAtTime(r * r * 0.05, t, 0.15);
    this.skidGain.gain.setTargetAtTime((throttle < 0 && r > 0.15) ? 0.035 : 0, t, 0.06);
    this.nitroGain.gain.setTargetAtTime(this._nitro ? 0.055 : 0, t, 0.08);
  }
  // volume du moteur : "doux" (par defaut), "normal" ou "coupe"
  setEngineVolume(mode) {
    save.engine = mode; persistSave();
    if (this.ok) this.engBus.gain.setTargetAtTime(SoundEngine.ENGINE_VOL[mode], this.ctx.currentTime, 0.1);
  }
  setNitro(on) { this._nitro = on; }
  setSiren(intensity, dt) {
    if (!this.ok) return;
    this.sirenTime += dt;
    const two = Math.sin(this.sirenTime * Math.PI * 4.4) > 0 ? 1 : 0.72;
    this.sirenOsc.frequency.setTargetAtTime(760 * two, this.ctx.currentTime, 0.03);
    this.sirenGain.gain.setTargetAtTime(intensity * 0.04, this.ctx.currentTime, 0.08);
  }
  screech() { this.noiseBurst(0.55, "bandpass", 2600, 0.16, 4); this.beep(1500, 0.4, "sawtooth", 0.03, 900); }
  whoosh() { this.noiseBurst(0.22, "bandpass", 1300, 0.14, 1.2); }
  power() { this.beep(520, 0.12, "triangle", 0.14, 1040); setTimeout(() => this.beep(780, 0.22, "triangle", 0.12, 1560), 90); }
  combo(n) { this.beep(660 + Math.min(n, 6) * 110, 0.09, "triangle", 0.1); }
  jump() { this.beep(300, 0.22, "sine", 0.18, 760); }
  land() { this.noiseBurst(0.14, "lowpass", 300, 0.28); this.beep(90, 0.12, "sine", 0.2, 55); }
  crash(big) {
    this.noiseBurst(big ? 0.5 : 0.28, "lowpass", big ? 240 : 420, big ? 0.85 : 0.5, 0.8);
    this.beep(big ? 70 : 110, big ? 0.5 : 0.3, "triangle", 0.5, 28);
  }
  horn() { this.beep(220, 0.32, "square", 0.14); setTimeout(() => this.beep(185, 0.42, "square", 0.14), 320); }
  meow() { this.beep(620, 0.3, "sine", 0.2, 380); setTimeout(() => this.beep(420, 0.5, "sine", 0.16, 620), 160); }
  kiss() { this.beep(660, 0.14, "sine", 0.14, 990); setTimeout(() => this.beep(880, 0.22, "sine", 0.13, 1180), 130); }
  pickup() { this.beep(880, 0.1, "square", 0.1); setTimeout(() => this.beep(1320, 0.14, "square", 0.1), 90); }
  repair() { this.beep(420, 0.12, "triangle", 0.14); setTimeout(() => this.beep(640, 0.16, "triangle", 0.14), 110); }
  tick() { this.beep(1180, 0.06, "square", 0.07); }
  gong() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => this.beep(f, 0.7, "sine", 0.2), i * 160));
  }
  fanfare() {
    const notes = [523, 659, 784, 1046, 784, 1046, 1318];
    notes.forEach((f, i) => setTimeout(() => this.beep(f, 0.22, "square", 0.13), i * 130));
  }
  sad() {
    const notes = [392, 370, 349, 311, 262];
    notes.forEach((f, i) => setTimeout(() => this.beep(f, 0.4, "triangle", 0.16), i * 220));
  }
  ui() { this.beep(1180, 0.045, "square", 0.05); }
  uiBig() { this.beep(700, 0.08, "square", 0.09); setTimeout(() => this.beep(1050, 0.12, "square", 0.09), 70); }
}
SoundEngine.ENGINE_VOL = { doux: 0.55, normal: 1, coupe: 0 };
const audio = new SoundEngine();

/* ============================================================================
   MUSIQUE GENERATIVE — synthwave composee par le code (aucun fichier audio, aucun droit d'auteur).
   Grille de 16 doubles-croches a 126 BPM, progression La mineur : Am - F - C - G.
   Modes : "menu" (nappes + arpege doux) et "race" (batterie, basse, arpege) ; l'intensite monte avec la nitro.
   ============================================================================ */
class MusicEngine {
  constructor(a) {
    this.a = a; this.mode = null; this.level = 1; this.timer = null; this.step = 0; this.bar = 0; this.next = 0;
    this.bpm = 126; this.duck = 1; this.ready = false;
    this.roots = [57, 53, 60, 55];                         // La2, Fa2, Do3, Sol2 (notes MIDI)
    this.arp = [[0, 7, 12, 15], [0, 5, 12, 17], [0, 7, 12, 16], [0, 7, 11, 14]]; // intervalles par accord
  }
  _setup() {
    if (this.ready || !this.a.ok) return;
    const c = this.a.ctx;
    this.out = c.createGain(); this.out.gain.value = 0.0;
    // petit delai en retour pour l'espace
    const d = c.createDelay(1); d.delayTime.value = 60 / this.bpm * 0.75;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    this.send = c.createGain(); this.send.gain.value = 0.35;
    this.send.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.out);
    this.dry = c.createGain(); this.dry.gain.value = 1;
    this.dry.connect(this.out); this.out.connect(this.a.masterGain);
    this.ready = true;
  }
  static hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  start(mode) {
    if (!this.a.ok) return;
    this._setup();
    if (this.mode === mode && this.timer) return;
    this.mode = mode;
    const c = this.a.ctx;
    this.out.gain.cancelScheduledValues(c.currentTime);
    this.out.gain.setTargetAtTime(mode === "menu" ? 0.34 : 0.5, c.currentTime, 0.4);
    if (!this.timer) {
      this.next = c.currentTime + 0.08; this.step = 0; this.bar = 0;
      this.timer = setInterval(() => this._tick(), 35);
    }
  }
  stop(fade) {
    if (!this.ready) return;
    const c = this.a.ctx;
    this.out.gain.setTargetAtTime(0, c.currentTime, fade || 0.25);
    this.mode = null;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  setLevel(l) { this.level = l; }
  setDuck(on) { if (!this.ready) return; this.out.gain.setTargetAtTime(on ? 0.12 : (this.mode === "menu" ? 0.34 : 0.5), this.a.ctx.currentTime, 0.12); }
  _tick() {
    const c = this.a.ctx;
    if (!c || c.state !== "running") return;
    const stepDur = 60 / this.bpm / 4;
    while (this.next < c.currentTime + 0.18) {
      this._play(this.step, this.next, stepDur);
      this.next += stepDur; this.step++;
      if (this.step >= 16) { this.step = 0; this.bar = (this.bar + 1) % 4; }
    }
  }
  _note(type, hz, t, dur, vol, lpHz, send) {
    const c = this.a.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(hz, t);
    f.type = "lowpass"; f.frequency.setValueAtTime(lpHz, t); f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.dry);
    if (send) { const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(this.send); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  _noise(t, dur, type, freq, vol) {
    const c = this.a.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.a.noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.dry);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  _kick(t, vol) {
    const c = this.a.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 0.25);
  }
  _play(s, t, sd) {
    const race = this.mode === "race", root = this.roots[this.bar], ch = this.arp[this.bar], lvl = this.level;
    // nappe (pad) : un accord par mesure
    if (s === 0) {
      [0, 7, 15].forEach((iv, k) => this._note("sawtooth", MusicEngine.hz(root + iv + 12) * (1 + (k - 1) * 0.004), t, sd * 15.5, race ? 0.035 : 0.05, race ? 900 : 700, 0.3));
    }
    // basse : croches
    if (race) {
      if (s % 2 === 0) this._note("sawtooth", MusicEngine.hz(root - 12 + ((s / 2) % 4 === 3 ? 12 : 0)), t, sd * 1.7, 0.16, 520 + lvl * 120, 0);
      // batterie
      if (s % 4 === 0) this._kick(t, 0.9);
      if (s === 4 || s === 12) this._noise(t, 0.16, "bandpass", 1900, 0.32);
      if (s % 2 === 1 || (lvl > 1 && s % 2 === 0)) this._noise(t, 0.045, "highpass", 8000, lvl > 1 ? 0.13 : 0.08);
      // arpege
      const iv = ch[s % 4] + (lvl > 1 && s % 8 >= 4 ? 12 : 0);
      if (lvl > 0) this._note("square", MusicEngine.hz(root + 24 + iv), t, sd * 1.5, 0.045 + (lvl > 1 ? 0.025 : 0), 1700 + lvl * 700, 0.55);
    } else {
      if (s % 8 === 0) this._kick(t, 0.5);
      if (s === 4) this._noise(t, 0.12, "bandpass", 1900, 0.14);
      if (s % 2 === 0) this._note("triangle", MusicEngine.hz(root + 24 + ch[(s / 2) % 4]), t, sd * 3, 0.05, 1500, 0.6);
      if (s % 4 === 2) this._noise(t, 0.04, "highpass", 8000, 0.05);
    }
  }
}
const music = new MusicEngine(audio);
