import * as THREE from "three";

/**
 * Il temporale del pomeriggio: ogni giorno, tra le 15:30 e le 16:30, le nuvole si caricano, poi arrivano pioggia, lampi e
 * tuoni per circa un'ora e mezza di gioco. Insegna una cosa vera: d'estate i temporali in montagna arrivano spesso nel
 * pomeriggio, e bisogna scendere dalle creste e cercare riparo.
 */
export class Weather {
  /** 0 = sereno, 1 = temporale pieno */
  storm = 0;
  phase: "clear" | "building" | "storm" = "clear";
  private startAt: number;
  private day = -1;
  private rain: THREE.LineSegments;
  private nextThunder = 0;
  flash = 0;
  readonly group = new THREE.Group();

  private seed = Math.floor(Math.random() * 1e9);
  /** in compagnia il seme arriva dalla stanza: tutti hanno il temporale alla stessa ora */
  setSeed(seed: number) {
    if (seed === this.seed) return;
    this.seed = seed;
    this.day = -1;
  }
  /** ora d'inizio del temporale del giorno `day`: tra le 15:30 e le 16:30, decisa dal seme */
  private startFor(day: number) {
    let h = (this.seed ^ (day * 2654435761)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
    return day * 24 + 15.5 + (h % 1000) / 1000;
  }
  constructor(private rng: () => number) {
    this.startAt = this.startFor(0);
    const n = 1800;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (rng() - 0.5) * 80, y = rng() * 40, z = (rng() - 0.5) * 80;
      pos.set([x, y, z, x + 0.15, y - 1.1, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#c8d4e6", transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
  }

  /** quando finisce il temporale di oggi (ore di gioco, come `hours`) */
  get endsAt() {
    return this.startAt + 1.5;
  }

  /** eventi: "building" (nuvole), "start", "thunder", "end" */
  update(dt: number, hours: number, cam: THREE.Vector3): ("building" | "start" | "thunder" | "end")[] {
    const ev: ("building" | "start" | "thunder" | "end")[] = [];
    const day = Math.floor(hours / 24);
    if (day !== this.day) {
      this.day = day;
      this.startAt = this.startFor(day);
    }
    const h = hours;
    const want = h < this.startAt - 0.35 ? 0 : h < this.startAt ? 0.35 : h < this.startAt + 1.5 ? 1 : 0;
    const before = this.phase;
    this.phase = want === 0 ? "clear" : want < 1 ? "building" : "storm";
    if (this.phase !== before) {
      if (this.phase === "building") ev.push("building");
      if (this.phase === "storm") ev.push("start");
      if (this.phase === "clear" && before === "storm") ev.push("end");
    }
    this.storm += (want - this.storm) * (1 - Math.exp(-0.6 * dt));
    // pioggia attorno alla telecamera
    const m = this.rain.material as THREE.LineBasicMaterial;
    m.opacity = Math.max(0, this.storm - 0.5) * 1.2;
    this.rain.visible = m.opacity > 0.01;
    if (this.rain.visible) {
      this.rain.position.set(cam.x, cam.y - 20, cam.z);
      const p = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const a = p.array as Float32Array;
      for (let i = 0; i < a.length; i += 6) {
        a[i + 1] -= 38 * dt;
        a[i + 4] -= 38 * dt;
        if (a[i + 1] < 0) (a[i + 1] += 40), (a[i + 4] += 40);
      }
      p.needsUpdate = true;
    }
    // lampi e tuoni
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.phase === "storm") {
      this.nextThunder -= dt;
      if (this.nextThunder <= 0) {
        this.nextThunder = 6 + this.rng() * 10;
        this.flash = 1;
        ev.push("thunder");
      }
    }
    return ev;
  }
}
