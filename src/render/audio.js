// Procedural audio (WebAudio). No external files. Render-only, never used headless.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.musicTimer = null;
  }
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }
  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
  tone(freq, dur = 0.15, type = 'sine', gain = 0.2, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  noise(dur = 0.3, gain = 0.15, freq = 800) {
    if (!this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }
  sfx(name) {
    const P = {
      pick: () => this.tone(1320, 0.12, 'sine', 0.12, 0, 1760),
      deposit: () => this.tone(660, 0.2, 'triangle', 0.15, 0, 880),
      lit: () => [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.16, i * 0.09)),
      pulse: () => { this.tone(220, 0.5, 'sine', 0.25, 0, 880); this.noise(0.35, 0.08, 1500); },
      hit: () => { this.tone(180, 0.35, 'sawtooth', 0.15, 0, 70); this.noise(0.25, 0.12, 300); },
      jump: () => this.tone(440, 0.12, 'square', 0.06, 0, 660),
      dash: () => this.noise(0.18, 0.18, 2400),
      win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.7, 'triangle', 0.15, i * 0.12)),
      lose: () => [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.15, i * 0.18)),
      shade: () => this.tone(110, 0.8, 'sawtooth', 0.07, 0, 82),
      tick: () => this.tone(1000, 0.06, 'square', 0.08),
      charm: () => [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.13, i * 0.06)),
      steal: () => this.tone(900, 0.4, 'sine', 0.1, 0, 300),
      wind: () => this.noise(1.6, 0.1, 500),
    };
    P[name]?.();
  }
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // gentle night music: low drone + pentatonic plucks
    const drone = this.ctx.createOscillator();
    const dg = this.ctx.createGain();
    drone.type = 'sine';
    drone.frequency.value = 110;
    dg.gain.value = 0.035;
    drone.connect(dg).connect(this.master);
    drone.start();
    this.drone = drone;
    const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
    let step = 0;
    this.musicTimer = setInterval(() => {
      if (this.ctx.state !== 'running') return;
      step++;
      if (step % 2 === 0 || Math.random() < 0.4) this.tone(scale[Math.floor(Math.random() * scale.length)], 1.4, 'triangle', 0.04);
      if (step % 8 === 0) this.tone(130.8, 2.5, 'sine', 0.05);
    }, 600);
  }
}
