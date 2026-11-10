// Chiptune-Sound per WebAudio: Rechteck/Dreieck/Noise-SFX und eine kurze Loop-Melodie.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Melodie (Achtel, 132 BPM). null = Pause.
const LEAD = [69, null, 72, 74, 76, null, 74, 72, 69, null, 67, 69, 72, null, null, null,
  69, null, 72, 74, 76, null, 79, 76, 74, null, 72, 74, 69, null, null, null,
  77, null, 76, 74, 76, null, 72, null, 74, null, 72, 71, 72, null, 67, null,
  69, null, 72, 76, 74, null, 72, 71, 69, null, null, null, 64, null, 67, null];
const BASS = [45, 45, 41, 41, 43, 43, 40, 40, 45, 45, 41, 41, 43, 43, 45, 45]; // Viertel
const STEP = 60 / 132 / 2;

export class Chip {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = {};
    this.musicOn = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  /** Muss aus einer Nutzer-Geste heraus aufgerufen werden. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    // Noise-Puffer mit deterministischem LCG (kein Math.random)
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let x = 12345;
    for (let i = 0; i < len; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; d[i] = (x / 2147483648) - 1; }
    if (this.wantMusic) this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  tone(type, f0, f1, dur, vol, when = 0, dest = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol, freq = 3000, when = 0, dest = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.master);
    s.start(t, (t * 7919) % 0.5); s.stop(t + dur + 0.02);
  }

  arp(notes, gap, type = 'square', vol = 0.06, dur = 0.08) {
    notes.forEach((n, i) => this.tone(type, midi(n), midi(n), dur, vol, i * gap));
  }

  sfx(name) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const minGap = { kill: 0.05, shoot_arrow: 0.07, shoot_cannon: 0.1, shoot_frost: 0.1, shoot_poison: 0.1, zap: 0.08, hit: 0.06 }[name] ?? 0.03;
    if (this.last[name] && now - this.last[name] < minGap) return;
    this.last[name] = now;
    switch (name) {
      case 'shoot_arrow': this.tone('square', 1100, 700, 0.04, 0.025); break;
      case 'shoot_cannon': this.noise(0.18, 0.12, 900); this.tone('triangle', 140, 50, 0.15, 0.12); break;
      case 'shoot_frost': this.tone('triangle', 1400, 1900, 0.06, 0.05); break;
      case 'shoot_poison': this.tone('triangle', 520, 300, 0.08, 0.05); break;
      case 'zap': this.noise(0.08, 0.06, 6000); this.tone('square', 1600, 250, 0.08, 0.03); break;
      case 'hit': this.noise(0.03, 0.03, 4000); break;
      case 'kill': this.tone('square', 660, 990, 0.05, 0.035); break;
      case 'bosskill': this.arp([60, 64, 67, 72, 76, 79], 0.06, 'square', 0.06, 0.12); this.noise(0.5, 0.15, 800); break;
      case 'leak': this.tone('square', 320, 70, 0.3, 0.08); break;
      case 'wave': this.arp([60, 64, 67, 72], 0.07, 'square', 0.05, 0.1); break;
      case 'boss': this.tone('triangle', 90, 45, 0.8, 0.2); this.noise(0.6, 0.08, 400); break;
      case 'build': this.tone('square', 440, 880, 0.08, 0.05); break;
      case 'upgrade': this.arp([67, 71, 74, 79], 0.05, 'square', 0.05); break;
      case 'sell': this.tone('square', 988, 988, 0.06, 0.05); this.tone('square', 1319, 1319, 0.12, 0.05, 0.06); break;
      case 'pick': this.arp([72, 76, 79, 84], 0.05, 'triangle', 0.12, 0.12); break;
      case 'click': this.tone('square', 880, 880, 0.025, 0.03); break;
      case 'error': this.tone('square', 150, 110, 0.12, 0.05); break;
      case 'victory': this.arp([60, 64, 67, 72, 67, 72, 76, 79, 84], 0.11, 'square', 0.07, 0.16); break;
      case 'defeat': this.arp([67, 63, 60, 55, 51, 48], 0.16, 'triangle', 0.15, 0.25); break;
      case 'combo': this.tone('square', 1320, 1760, 0.06, 0.04); break;
    }
  }

  startMusic() {
    this.wantMusic = true;
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 80);
  }

  stopMusic() {
    this.wantMusic = false;
    this.musicOn = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    if (!this.ctx) return;
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      const i = this.step % LEAD.length;
      const when = this.nextTime - this.ctx.currentTime;
      const n = LEAD[i];
      if (n !== null) this.tone('square', midi(n), midi(n), STEP * 0.9, 0.035, when, this.musicGain);
      if (i % 2 === 0) {
        const b = BASS[(i / 2) % BASS.length];
        this.tone('triangle', midi(b), midi(b), STEP * 1.8, 0.12, when, this.musicGain);
      }
      if (i % 4 === 2) this.noise(0.03, 0.025, 7000, when, this.musicGain);
      this.nextTime += STEP;
      this.step++;
    }
  }
}
