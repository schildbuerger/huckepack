// The explainer's optional sound (2026-11-04: off by default, a speaker toggle): soft footsteps on the
// hiker's footfalls, birds by day, crickets at night, synthesised with the Web Audio API, so there are
// no recordings to load or license. Created on the visitor's click (browsers allow audio only then).

export class Sound {
  private ctx?: AudioContext;
  private noise?: AudioBuffer;
  on = false;

  enable() {
    this.ctx ??= new AudioContext();
    if (!this.noise) {
      const n = this.ctx.sampleRate * 0.2;
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
    this.on = true;
  }
  disable() {
    this.on = false;
    void this.ctx?.suspend();
  }
  // gravel underfoot: a short burst of filtered noise
  step() {
    if (!this.on || !this.ctx || !this.noise) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const lp = c.createBiquadFilter();
    lp.type = "bandpass";
    lp.frequency.value = 900 + Math.random() * 500;
    lp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(lp).connect(g).connect(c.destination);
    src.start(t, Math.random() * 0.05, 0.14);
  }
  // a bird: two to four rising chirps
  bird() {
    if (!this.on || !this.ctx) return;
    const c = this.ctx;
    const base = 2600 + Math.random() * 1400;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = c.currentTime + i * (0.09 + Math.random() * 0.04);
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.06);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.1);
    }
  }
  // a cricket: three quick pulses
  cricket() {
    if (!this.on || !this.ctx) return;
    const c = this.ctx;
    for (let i = 0; i < 3; i++) {
      const t = c.currentTime + i * 0.045;
      const o = c.createOscillator();
      o.frequency.value = 4300;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.006);
      g.gain.linearRampToValueAtTime(0, t + 0.03);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.035);
    }
  }
}
