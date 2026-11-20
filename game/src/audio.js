// Synthesized sound: every effect and the music loop are generated with
// WebAudio oscillators and noise — no audio files are shipped or loaded.
import { clamp } from './utils.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Must be called from a user gesture (the Start button).
  init() {
    if (this.ctx) { this.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.startEngineLoop();
      this.startMusic();
    } catch (e) { /* audio is optional; the game plays on silently */ }
  }

  resume() {
    try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) {}
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  startEngineLoop() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    // Police siren: two alternating tones.
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 750;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  // Called every frame: engine pitch follows speed, siren follows nearest cop.
  update(speed, inCar, sirenDistance) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engineOsc) {
      const target = inCar ? 0.05 + Math.min(0.09, speed * 0.002) : 0;
      this.engineGain.gain.setTargetAtTime(target, t, 0.1);
      this.engineOsc.frequency.setTargetAtTime(50 + speed * 2.4, t, 0.1);
    }
    if (this.sirenOsc) {
      this.sirenTimer += 1 / 60;
      if (this.sirenTimer > 0.38) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 700, t, 0.02);
      }
      const vol = sirenDistance == null ? 0 : clamp(1 - sirenDistance / 130, 0, 1) * 0.05;
      this.sirenGain.gain.setTargetAtTime(vol, t, 0.2);
    }
  }

  blip(freq) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq || 660;
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.1);
    } catch (e) {}
  }

  chime() {
    if (!this.ctx) return;
    try {
      [523, 784].forEach((f, i) => {
        const t = this.ctx.currentTime + i * 0.12;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.4);
      });
    } catch (e) {}
  }

  shot() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * 0.12);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(filter); filter.connect(g); g.connect(this.master);
      src.start(t);
    } catch (e) {}
  }

  punch() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.15);
    } catch (e) {}
  }

  crash() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * 0.2);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.8;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      src.connect(g); g.connect(this.master);
      src.start(t);
    } catch (e) {}
  }

  // A lazy sunset bassline: quiet triangle-wave notes on a loop.
  startMusic() {
    const notes = [110, 0, 110, 130.8, 0, 98, 0, 130.8, 110, 0, 146.8, 0, 130.8, 0, 98, 87.3];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const f = notes[this.musicStep % notes.length];
      this.musicStep++;
      if (!f) return;
      try {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.45);
      } catch (e) {}
    }, 340);
  }
}
