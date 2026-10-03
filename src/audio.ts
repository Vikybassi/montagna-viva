/**
 * I suoni della valle: registrazioni vere (public/audio, fonti e licenze in public/audio/CREDITI.md) per vento,
 * torrenti, uccelli, grilli, pioggia e tuoni, campanacci, marmotte, aquila, gracchi, elicottero, tuffi e passi.
 * Gli ambienti sono anelli che salgono e scendono col mondo intorno a te; versi e colpi arrivano dal punto giusto
 * (a destra o a sinistra, più piano se lontani). Restano sintetizzati solo i piccoli suoni dell'interfaccia, lo
 * squillo del telefono e il fruscio del parapendio.
 * Finché le registrazioni non sono caricate (pochi secondi) si sente solo l'interfaccia.
 * Parte solo dopo un clic (regola dei browser) e si può spegnere.
 */
type Env = { alt: number; night: number; forest: number; water: number; speed: number; gliding: boolean; rain: number; meadow: number };
type Bed = { g: GainNode; src: AudioBufferSourceNode };

const BEDS = ["vento", "torrente", "ruscello", "uccelli", "grilli", "pioggia", "elicottero"] as const;
const SHOTS = {
  aquila: 1, gracchio: 1, marmotta: 2, tuono: 4, tuffo: 3,
  "passo-erba": 5, "passo-roccia": 5, "passo-neve": 5,
} as const;
type ShotName = keyof typeof SHOTS;

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private buffers = new Map<string, AudioBuffer>();
  private beds = new Map<string, Bed>();
  private heliPan: StereoPannerNode | null = null;
  private heliSeen = -1;
  private nextChough = 0;
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
    // rumore bianco: serve ancora al fruscio del parapendio e al timbro
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    void this.load();
  }

  /** scarica e decodifica le registrazioni; gli ambienti partono subito, a volume zero */
  private async load() {
    const c = this.ctx!;
    const names = [...BEDS, "campanacci", ...Object.entries(SHOTS).flatMap(([k, n]) => (n === 1 ? [k] : Array.from({ length: n }, (_, i) => `${k}-${k.startsWith("passo") ? i : i + 1}`)))];
    await Promise.all(
      names.map(async (n) => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}audio/${n}.m4a`);
          this.buffers.set(n, await c.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* un suono che manca non ferma il gioco */
        }
      }),
    );
    for (const n of BEDS) {
      const b = this.buffers.get(n);
      if (!b) continue;
      const src = c.createBufferSource();
      src.buffer = b;
      src.loop = true;
      // l'AAC aggiunge un attimo di silenzio all'inizio e alla fine: l'anello salta quei pezzi
      const [a, z] = trim(b);
      src.loopStart = a;
      src.loopEnd = z;
      const g = c.createGain();
      g.gain.value = 0;
      let out: AudioNode = this.master;
      if (n === "elicottero") {
        this.heliPan = c.createStereoPanner();
        this.heliPan.connect(this.master);
        out = this.heliPan;
      }
      src.connect(g).connect(out);
      // ogni anello parte da un punto diverso: non si sentono ripartire tutti insieme
      src.start(0, a + Math.random() * (z - a));
      this.beds.set(n, { g, src });
    }
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

  private level(name: string, v: number, now: number, tc = 0.5) {
    this.beds.get(name)?.g.gain.setTargetAtTime(v, now, tc);
  }

  /** da chiamare a ogni fotogramma con lo stato del mondo intorno a te */
  update(e: Env, me: { x: number; z: number }, yaw: number) {
    const c = this.ctx;
    if (!c) return;
    this.me = me;
    this.yaw = yaw;
    const now = c.currentTime;
    const high = Math.min(1, Math.max(0, (e.alt - 1200) / 1800));
    // vento: un filo in basso, forte in quota e in volo, con raffiche lente
    const gust = 0.7 + 0.3 * Math.sin(now * 0.37) * Math.sin(now * 0.13 + 1);
    this.level("vento", Math.min(0.9, (0.08 + high * 0.5) * gust + (e.gliding ? 0.35 : 0) + e.rain * 0.15), now, 0.4);
    const wind = this.beds.get("vento");
    if (wind) wind.src.playbackRate.setTargetAtTime(0.9 + gust * 0.15 + (e.gliding ? 0.15 : 0), now, 0.5);
    // acqua: il torrente vicino, il ruscello un po' più in là
    const close = Math.max(0, 1 - e.water / 70);
    this.level("torrente", close ** 2 * 0.75, now, 0.6);
    this.level("ruscello", close * (1 - close) * 1.2 * 0.5, now, 0.6);
    // uccelli di giorno nel bosco (e un po' nei prati); grilli di notte, in basso
    this.level("uccelli", (e.forest * 0.9 + e.meadow * 0.35) * (1 - e.night) * (1 - e.rain) * (1 - high * 0.7) * 0.5, now, 1.5);
    this.level("grilli", e.night > 0.5 && e.alt < 2000 ? (e.night - 0.5) * 2 * 0.35 * (1 - e.rain) : 0, now, 2);
    this.level("pioggia", e.rain * 0.85, now, 1);
    // i gracchi, di giorno sopra i 2000 m: ogni tanto, da una parte o dall'altra
    if (now > this.nextChough) {
      this.nextChough = now + 12 + Math.random() * 25;
      if (e.alt > 2000 && e.night < 0.5 && e.rain < 0.3) this.shot("gracchio", me.x + (Math.random() - 0.5) * 120, me.z + (Math.random() - 0.5) * 120, 0.35, 200);
    }
    // l'elicottero tace se non lo si sente più da un po'
    if (this.heliSeen >= 0 && now - this.heliSeen > 0.6) {
      this.level("elicottero", 0, now, 0.8);
      this.heliSeen = -1;
    }
  }

  // ---------- mattoni ----------
  private pan(x?: number, z?: number) {
    const c = this.ctx!;
    const p = c.createStereoPanner();
    p.pan.value = this.panValue(x, z);
    p.connect(this.master);
    return p;
  }
  private panValue(x?: number, z?: number) {
    if (x === undefined || z === undefined) return 0;
    const a = Math.atan2(x - this.me.x, z - this.me.z) - (this.yaw + Math.PI);
    return Math.max(-1, Math.min(1, -Math.sin(a))) * 0.8;
  }
  private dist(x?: number, z?: number, range = 120) {
    if (x === undefined || z === undefined) return 1;
    const d = Math.hypot(x - this.me.x, z - this.me.z);
    return Math.max(0, 1 - d / range) ** 1.5;
  }
  /** una registrazione breve: a caso tra le varianti, dal punto (x, z), con un pizzico di variazione d'intonazione */
  private shot(name: ShotName, x?: number, z?: number, vol = 1, range = 160, delay = 0, rate = 1) {
    const c = this.ctx;
    if (!c) return;
    const n = SHOTS[name];
    const key = n === 1 ? name : `${name}-${name.startsWith("passo") ? Math.floor(Math.random() * n) : 1 + Math.floor(Math.random() * n)}`;
    const b = this.buffers.get(key);
    if (!b) return;
    const v = vol * (x === undefined ? 1 : this.dist(x, z, range));
    if (v < 0.005) return;
    const s = c.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = c.createGain();
    g.gain.value = v;
    s.connect(g).connect(this.pan(x, z));
    s.start(c.currentTime + delay);
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
  step(surface: "grass" | "rock" | "snow" | "water") {
    if (surface === "water") return this.shot("tuffo", undefined, undefined, 0.12, 1, 0, 1.4);
    this.shot(surface === "grass" ? "passo-erba" : surface === "snow" ? "passo-neve" : "passo-roccia", undefined, undefined, surface === "rock" ? 0.22 : 0.16);
  }
  /** una mucca col campanaccio: un pezzetto diverso della registrazione per ognuna, dal punto in cui è */
  cowbell(x: number, z: number) {
    const c = this.ctx, b = this.buffers.get("campanacci");
    if (!c || !b) return;
    const v = this.dist(x, z, 160);
    if (v < 0.01) return;
    const s = c.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = 0.92 + Math.random() * 0.16;
    const g = c.createGain(), t = c.currentTime, dur = 1.6 + Math.random() * 1.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * v, t + 0.15);
    g.gain.setValueAtTime(0.9 * v, t + dur - 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(g).connect(this.pan(x, z));
    s.start(t, Math.random() * (b.duration - dur - 0.5), dur + 0.05);
  }
  whistle(x: number, z: number) {
    this.shot("marmotta", x, z, Math.max(0.3, this.dist(x, z, 200)) * 0.8);
  }
  eagle(x: number, z: number) {
    this.shot("aquila", x, z, Math.max(0.25, this.dist(x, z, 300)) * 0.6);
  }
  thunder() {
    // il tuono arriva dopo il lampo: tanto più tardi quanto più è lontano
    this.shot("tuono", undefined, undefined, 0.7 + Math.random() * 0.3, 1, 0.3 + Math.random() * 1.2, 0.9 + Math.random() * 0.15);
  }
  splash(x?: number, z?: number, small = false) {
    this.shot("tuffo", x, z, small ? 0.3 : 0.6, 80, 0, small ? 1.3 : 1);
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
  /** l'elicottero: più forte da vicino, dalla sua parte (lo si chiama finché si sente) */
  rotor(x: number, z: number, d: number) {
    const c = this.ctx;
    if (!c) return;
    const v = Math.max(0, 1 - d / 900) ** 1.6;
    this.level("elicottero", v * 0.9, c.currentTime, 0.3);
    this.heliPan?.pan.setTargetAtTime(this.panValue(x, z), c.currentTime, 0.2);
    this.heliSeen = c.currentTime;
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

/** dove inizia e finisce il suono vero in un buffer (senza il silenzio che l'AAC aggiunge ai bordi), in secondi */
export function trim(b: AudioBuffer) {
  const d = b.getChannelData(0);
  let a = 0, z = d.length - 1;
  while (a < z && Math.abs(d[a]) < 1e-4) a++;
  while (z > a && Math.abs(d[z]) < 1e-4) z--;
  return [a / b.sampleRate, (z + 1) / b.sampleRate] as const;
}

export const sound = new Sound();
