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

    // --- Moteur : 3 oscillateurs + filtre ---
    this.engGain = this.ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = this.ctx.createBiquadFilter();
    this.engFilter.type = "lowpass";
    this.engFilter.frequency.value = 420;
    this.engFilter.Q.value = 3.2;
    const mk = (type, f, det) => {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det || 0;
      o.connect(this.engFilter);
      o.start();
      return o;
    };
    this.engA = mk("sawtooth", 55, 0);
    this.engB = mk("sawtooth", 55, 12);
    this.engC = mk("square", 27.5, -6);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.masterGain);

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
    const r = clamp(ratio, 0, 1.4);
    const f = 52 + r * 210;
    this.engA.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    this.engB.frequency.setTargetAtTime(f * 1.01, this.ctx.currentTime, 0.05);
    this.engC.frequency.setTargetAtTime(f * 0.5, this.ctx.currentTime, 0.06);
    this.engFilter.frequency.setTargetAtTime(360 + r * 1500, this.ctx.currentTime, 0.08);
    const idle = 0.028, open = 0.05 + r * 0.075;
    this.engGain.gain.setTargetAtTime(idle + open * (0.35 + 0.65 * throttle), this.ctx.currentTime, 0.07);
    this.windGain.gain.setTargetAtTime(r * r * 0.085, this.ctx.currentTime, 0.1);
    this.skidGain.gain.setTargetAtTime((throttle < 0 && r > 0.15) ? 0.075 : 0, this.ctx.currentTime, 0.06);
    this.nitroGain.gain.setTargetAtTime(this._nitro ? 0.13 : 0, this.ctx.currentTime, 0.05);
  }
  setNitro(on) { this._nitro = on; }
  setSiren(intensity, dt) {
    if (!this.ok) return;
    this.sirenTime += dt;
    const two = Math.sin(this.sirenTime * Math.PI * 4.4) > 0 ? 1 : 0.72;
    this.sirenOsc.frequency.setTargetAtTime(760 * two, this.ctx.currentTime, 0.03);
    this.sirenGain.gain.setTargetAtTime(intensity * 0.055, this.ctx.currentTime, 0.08);
  }
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
const audio = new SoundEngine();
