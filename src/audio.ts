/**
 * I suoni della valle, tutti generati nel browser (Web Audio, nessun file): vento che cresce con la quota e in volo,
 * torrenti vicini, uccelli nel bosco di giorno, grilli di notte, passi su erba e roccia, campanacci, il fischio delle
 * marmotte, l'aquila, pioggia e tuoni; e piccoli suoni per timbri, diario e missioni.
 * Parte solo dopo un clic (regola dei browser) e si può spegnere.
 */
type Env = { alt: number; night: number; forest: number; water: number; speed: number; gliding: boolean; rain: number; meadow: number };

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private wind!: { g: GainNode; f: BiquadFilterNode };
  private river!: { g: GainNode };
  private rainBed!: { g: GainNode };
  private nextBird = 0;
  private nextCricket = 0;
  muted = false;
  private yaw = 0;
  private me = { x: 0, z: 0 };

  start() {
    if (this.ctx) return void this.ctx.resume();
    const c = new AudioContext();
    this.ctx = c;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(comp).connect(c.destination);
    // rumore bianco riusato da tutti
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const bed = (type: BiquadFilterType, freq: number, q: number) => {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { g, f };
    };
    this.wind = bed("bandpass", 500, 0.6);
    this.river = bed("bandpass", 1300, 0.4);
    this.rainBed = bed("highpass", 2500, 0.3);
  }

  private volume = 0.9;
  toggle() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.2);
    return !this.muted;
  }
  setVolume(v: number) {
    this.volume = v;
    if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  /** da chiamare a ogni fotogramma con lo stato del mondo intorno a te */
  update(e: Env, me: { x: number; z: number }, yaw: number) {
    const c = this.ctx;
    if (!c) return;
    this.me = me;
    this.yaw = yaw;
    const now = c.currentTime;
    // vento: più forte in alto e in volo, con raffiche
    const gust = 0.6 + 0.4 * Math.sin(now * 0.37) * Math.sin(now * 0.13 + 1);
    const windLevel = (0.015 + Math.min(1, Math.max(0, (e.alt - 1200) / 1800)) * 0.09) * gust + (e.gliding ? 0.12 : 0) + e.rain * 0.05;
    this.wind.g.gain.setTargetAtTime(windLevel, now, 0.3);
    this.wind.f.frequency.setTargetAtTime(380 + gust * 260 + (e.gliding ? 300 : 0), now, 0.3);
    // torrente: più forte quanto più è vicino
    this.river.g.gain.setTargetAtTime(Math.max(0, 1 - e.water / 70) * 0.11, now, 0.4);
    this.rainBed.g.gain.setTargetAtTime(e.rain * 0.09, now, 0.8);
    // uccelli di giorno nel bosco (e un po' nei prati)
    if (now > this.nextBird) {
      this.nextBird = now + 1.5 + Math.random() * 4;
      const p = (e.forest * 0.9 + e.meadow * 0.35) * (1 - e.night) * (1 - e.rain);
      if (Math.random() < p) this.bird();
    }
    // grilli di notte nei prati bassi
    if (now > this.nextCricket) {
      this.nextCricket = now + 0.35 + Math.random() * 0.4;
      if (e.night > 0.5 && e.alt < 2000 && Math.random() < 0.8) this.cricket();
    }
  }

  // ---------- mattoni ----------
  private pan(x?: number, z?: number) {
    const c = this.ctx!;
    const p = c.createStereoPanner();
    if (x !== undefined && z !== undefined) {
      const a = Math.atan2(x - this.me.x, z - this.me.z) - (this.yaw + Math.PI);
      p.pan.value = Math.max(-1, Math.min(1, -Math.sin(a)));
    }
    p.connect(this.master);
    return p;
  }
  private dist(x?: number, z?: number, range = 120) {
    if (x === undefined || z === undefined) return 1;
    const d = Math.hypot(x - this.me.x, z - this.me.z);
    return Math.max(0, 1 - d / range) ** 1.5;
  }
  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, out: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private burst(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, out: AudioNode, q = 1) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  // ---------- suoni ----------
  bird() {
    const c = this.ctx!;
    const out = this.pan(this.me.x + (Math.random() - 0.5) * 80, this.me.z + (Math.random() - 0.5) * 80);
    let t = c.currentTime + 0.05;
    const n = 2 + Math.floor(Math.random() * 5), base = 2600 + Math.random() * 2400;
    for (let i = 0; i < n; i++) {
      this.tone("sine", base * (0.9 + Math.random() * 0.3), base * (1.1 + Math.random() * 0.4), t, 0.07 + Math.random() * 0.06, 0.035, out);
      t += 0.1 + Math.random() * 0.08;
    }
  }
  cricket() {
    const c = this.ctx!;
    const out = this.pan(this.me.x + (Math.random() - 0.5) * 40, this.me.z + (Math.random() - 0.5) * 40);
    const t = c.currentTime;
    for (let i = 0; i < 3; i++) this.tone("sine", 4400, 4300, t + i * 0.045, 0.03, 0.012, out);
  }
  step(surface: "grass" | "rock" | "water") {
    const c = this.ctx;
    if (!c) return;
    const out = this.pan();
    if (surface === "water") this.burst(c.currentTime, 0.25, 0.06, "bandpass", 900, out, 0.7);
    else if (surface === "grass") this.burst(c.currentTime, 0.09, 0.05, "lowpass", 900, out);
    else this.burst(c.currentTime, 0.06, 0.07, "bandpass", 2400, out, 2);
  }
  cowbell(x: number, z: number) {
    const c = this.ctx;
    if (!c) return;
    const v = this.dist(x, z, 160);
    if (v < 0.01) return;
    const out = this.pan(x, z);
    const f0 = 520 + Math.random() * 120, t = c.currentTime;
    [1, 2.76, 5.4, 8.9].forEach((m, i) => this.tone("sine", f0 * m, f0 * m * 0.995, t, 0.9 - i * 0.18, (0.05 / (i + 1)) * v, out));
  }
  whistle(x: number, z: number) {
    const c = this.ctx;
    if (!c) return;
    const out = this.pan(x, z), t = c.currentTime, v = Math.max(0.3, this.dist(x, z, 200));
    this.tone("sine", 3300, 2500, t, 0.45, 0.09 * v, out);
  }
  eagle(x: number, z: number) {
    const c = this.ctx;
    if (!c) return;
    const out = this.pan(x, z), t = c.currentTime, v = Math.max(0.25, this.dist(x, z, 300));
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1800;
    f.connect(out);
    this.tone("sawtooth", 1900, 1300, t, 0.6, 0.05 * v, f);
    this.tone("sawtooth", 1700, 1250, t + 0.7, 0.5, 0.04 * v, f);
  }
  thunder() {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + 0.3 + Math.random();
    this.burst(t, 2.8, 0.5, "lowpass", 160, this.pan(), 0.5);
    this.burst(t + 0.15, 1.2, 0.25, "lowpass", 400, this.pan());
  }
  splash(x?: number, z?: number, small = false) {
    const c = this.ctx;
    if (!c) return;
    const out = this.pan(x, z);
    this.burst(c.currentTime, small ? 0.12 : 0.35, small ? 0.08 : 0.16, "bandpass", small ? 2200 : 1400, out, 0.8);
  }
  whoosh() {
    const c = this.ctx;
    if (!c) return;
    const out = this.pan(), t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    s.connect(f).connect(g).connect(out);
    s.start(t);
    s.stop(t + 0.9);
  }
  /** l'elicottero: colpi bassi delle pale, più forti da vicino */
  rotor(x: number, z: number, d: number) {
    const c = this.ctx;
    if (!c) return;
    const v = Math.max(0, 1 - d / 900) ** 1.6;
    if (v < 0.01) return;
    this.burst(c.currentTime, 0.07, 0.22 * v, "lowpass", 160, this.pan(x, z), 0.8);
  }
  /** la suoneria del telefono: due note alternate, come un vecchio squillo */
  ring() {
    const c = this.ctx;
    if (!c) return;
    const out = this.pan(), t = c.currentTime;
    for (let i = 0; i < 6; i++) this.tone("sine", i % 2 ? 1320 : 1760, i % 2 ? 1320 : 1760, t + i * 0.09, 0.08, 0.07, out);
  }
  /** piccoli suoni dell'interfaccia */
  ui(kind: "blip" | "learn" | "done" | "stamp" | "pick" | "fail" | "go") {
    const c = this.ctx;
    if (!c) return;
    const out = this.pan(), t = c.currentTime;
    const notes: Record<typeof kind, number[]> = {
      blip: [880],
      learn: [784, 1175],
      done: [523, 659, 784, 1047],
      stamp: [196],
      pick: [1047, 1568],
      fail: [330, 247],
      go: [523, 1047],
    };
    if (kind === "stamp") return void this.burst(t, 0.15, 0.4, "lowpass", 300, out);
    notes[kind].forEach((f, i) => this.tone("triangle", f, f, t + i * 0.09, 0.35, 0.09, out));
  }
}

export const sound = new Sound();
