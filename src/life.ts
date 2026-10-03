import * as THREE from "three";
import { Hiker } from "./player";
import { S, type Cover, type Terrain, type WorldData } from "./world";
import { walkerLook } from "./looks";

/**
 * La vita della valle: mucche brune agli alpeggi (con i campanacci), escursionisti che camminano sui sentieri e
 * salutano, farfalle nei prati, stormi in cielo; e il paesaggio più ricco: fiori lungo i sentieri, massi sui ghiaioni,
 * nuvole che passano sulle cime.
 */
const ll = (t: Terrain, lat: number, lon: number) => {
  const x = (lon - 9.55) * 111320 * Math.cos((46.25 * Math.PI) / 180) * S, z = (46.31 - lat) * 111320 * S;
  return new THREE.Vector3(x, t.heightAt(x, z), z);
};
const mat = (c: string, rough = 0.9) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: rough });

type Walker = { h: Hiker; path: THREE.Vector3[]; i: number; dir: 1 | -1; name: string; greeted: number };
type Cow = { obj: THREE.Group; home: THREE.Vector3; target: THREE.Vector3; t: number; bell: number };

const NAMES = ["Luca", "Giovanna", "Paolo", "Chiara", "Davide", "Anna", "Marco", "Silvia", "Andrea", "Elisa"];
const TIPS = [
  "Bella giornata! Ma più tardi danno temporali, occhio.",
  "Il segnavia qui è un po' sbiadito, segui i paletti.",
  "Hai visto le marmotte più su? Fischiano appena ti vedono!",
  "Al rifugio fanno dei pizzoccheri buonissimi.",
  "Scendo prima del buio: in valle il sole se ne va presto.",
  "Ho visto due stambecchi sotto il Ponti stamattina.",
  "Ricordati di bere, anche se non hai sete.",
  "In Val di Mello si arrampica su granito: guarda quei massi!",
];

export class Life {
  readonly group = new THREE.Group();
  readonly walkers: Walker[] = [];
  readonly cows: Cow[] = [];
  private butterflies: { m: THREE.Group; c: THREE.Vector3; ph: number }[] = [];
  private flock: THREE.Group;
  private flockT = 0;
  private flockDir = new THREE.Vector3();
  private clouds: THREE.Group[] = [];
  private time = 0;
  /** per la qualità grafica (si diradano) */
  flowers!: THREE.InstancedMesh;
  boulders!: THREE.InstancedMesh;

  constructor(
    private t: Terrain,
    data: WorldData,
    cover: Cover,
    private rng: () => number,
  ) {
    this.scenery(data, cover);
    this.addCows();
    this.addWalkers(data);
    this.addButterflies();
    this.flock = this.makeFlock();
    this.addClouds();
  }

  // ---------- paesaggio: fiori, massi, nuvole ----------
  private scenery(data: WorldData, cover: Cover) {
    const { t, rng } = this;
    // fiori: piccoli ciuffi colorati lungo i sentieri, nei prati
    // una corolla tonda su un gambo corto (un unico pezzo, leggero)
    const petals = new THREE.IcosahedronGeometry(0.13, 0);
    petals.scale(1, 0.6, 1);
    petals.translate(0, 0.3, 0);
    const spots: THREE.Vector3[] = [];
    for (const p of data.paths) {
      for (let i = 0; i < p.pts.length - 1; i += 1) {
        const ax = p.pts[i][0] * S, az = p.pts[i][1] * S, bx = p.pts[i + 1][0] * S, bz = p.pts[i + 1][1] * S;
        const len = Math.hypot(bx - ax, bz - az);
        for (let d = 0; d < len; d += 5) {
          if (rng() > 0.55) continue;
          const k = d / len, side = (rng() < 0.5 ? -1 : 1) * (1.6 + rng() * 9);
          const x = ax + (bx - ax) * k - ((bz - az) / len) * side, z = az + (bz - az) * k + ((bx - ax) / len) * side;
          const m = t.heightAt(x, z) / S;
          if (m < 800 || m > 2600 || t.slopeAt(x, z) > 32 || cover.at(cover.forest, x, z) > 0.4 || cover.at(cover.glacier, x, z) > 0.2) continue;
          for (let f = 0; f < 4; f++) {
            const fx = x + (rng() - 0.5) * 2.2, fz = z + (rng() - 0.5) * 2.2;
            spots.push(new THREE.Vector3(fx, t.heightAt(fx, fz), fz));
          }
        }
      }
    }
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const flowers = new THREE.InstancedMesh(petals, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), spots.length);
    const colors = ["#ffffff", "#f2d94a", "#b07ad8", "#e87aa6", "#5f8de0", "#f4f0e0"].map((c) => new THREE.Color(c));
    const o = new THREE.Object3D();
    spots.forEach((p, i) => {
      o.position.copy(p);
      o.rotation.set(0, rng() * 3, 0);
      o.scale.setScalar(0.7 + rng() * 0.7);
      o.updateMatrix();
      flowers.setMatrixAt(i, o.matrix);
      flowers.setColorAt(i, colors[Math.floor(rng() * colors.length)]);
    });
    this.group.add(flowers);
    this.flowers = flowers;

    // massi sui ghiaioni e sui pascoli alti
    const rock = new THREE.DodecahedronGeometry(1, 0);
    const rocks: THREE.Matrix4[] = [];
    for (let i = 0; i < 26000 && rocks.length < 7000; i++) {
      const x = rng() * t.width, z = rng() * t.depth;
      const m = t.heightAt(x, z) / S, s = t.slopeAt(x, z);
      if (m < 1500 || m > 3100 || s < 14 || s > 46 || cover.at(cover.glacier, x, z) > 0.2 || cover.at(cover.forest, x, z) > 0.5) continue;
      o.position.set(x, t.heightAt(x, z) - 0.3, z);
      o.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      const k = 0.5 + rng() ** 3 * 4;
      o.scale.set(k * (0.8 + rng() * 0.5), k * (0.5 + rng() * 0.4), k * (0.8 + rng() * 0.5));
      o.updateMatrix();
      rocks.push(o.matrix.clone());
    }
    const boulders = new THREE.InstancedMesh(rock, mat("#9b9095"), rocks.length);
    rocks.forEach((m, i) => boulders.setMatrixAt(i, m));
    boulders.castShadow = boulders.receiveShadow = true;
    this.group.add(boulders);
    this.boulders = boulders;
  }

  private addClouds() {
    const puff = new THREE.IcosahedronGeometry(1, 1);
    const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(this.rng() * 4);
      for (let k = 0; k < n; k++) {
        const p = new THREE.Mesh(puff, m);
        p.position.set((k - n / 2) * 9 + this.rng() * 6, this.rng() * 5, this.rng() * 10 - 5);
        p.scale.set(10 + this.rng() * 8, 6 + this.rng() * 5, 9 + this.rng() * 6);
        g.add(p);
      }
      g.position.set(this.rng() * this.t.width, (2900 + this.rng() * 900) * S, this.rng() * this.t.depth);
      this.clouds.push(g);
      this.group.add(g);
    }
  }

  // ---------- mucche brune agli alpeggi ----------
  private addCows() {
    const alps: [number, number][] = [
      [46.2502, 9.5796], // Alpe dell'Oro
      [46.2034, 9.6534], // Alpe Granda
      [46.2652, 9.69], // Casera Pioda
      [46.2324, 9.7048], // Piano di Preda Rossa
      [46.2547, 9.6003], // Alpe Scione
      [46.3048, 9.7485], // Alpe Sissone
    ];
    const coat = mat("#7d6450"), light = mat("#cdb9a3"), dark = mat("#3a2e26"), bell = mat("#c9a440", 0.4);
    const cow = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 1.9), coat);
      body.position.y = 1.15;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.6), coat);
      head.position.set(0, 1.35, 1.15);
      const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.2), light);
      muzzle.position.set(0, 1.22, 1.5);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.2, 6), bell);
      b.position.set(0, 0.85, 1.05);
      g.add(body, head, muzzle, b);
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), light);
        horn.position.set(0.25 * s, 1.7, 1.1);
        horn.rotation.z = -0.6 * s;
        g.add(horn);
      }
      for (const [x, z] of [[-0.3, 0.7], [0.3, 0.7], [-0.3, -0.7], [0.3, -0.7]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.18), dark);
        leg.position.set(x, 0.38, z);
        g.add(leg);
      }
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      return g;
    };
    for (const [lat, lon] of alps) {
      const c = ll(this.t, lat, lon);
      const n = 4 + Math.floor(this.rng() * 3);
      for (let i = 0; i < n; i++) {
        const home = new THREE.Vector3(c.x + (this.rng() - 0.5) * 50, 0, c.z + (this.rng() - 0.5) * 50);
        if (this.t.slopeAt(home.x, home.z) > 30) continue;
        home.y = this.t.heightAt(home.x, home.z);
        const obj = cow();
        obj.position.copy(home);
        obj.rotation.y = this.rng() * 6.28;
        this.group.add(obj);
        this.cows.push({ obj, home, target: home.clone(), t: this.rng() * 6, bell: this.rng() * 4 });
      }
    }
  }

  // ---------- escursionisti sui sentieri ----------
  private addWalkers(data: WorldData) {
    const center = ll(this.t, 46.2406, 9.628); // San Martino
    const cands = data.paths
      .filter((p) => (p.k === "p" || p.k === "t") && p.pts.length > 4)
      .map((p) => {
        const pts = p.pts.map(([x, z]) => new THREE.Vector3(x * S, 0, z * S));
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
        return { pts, len, d: pts[0].distanceTo(center) };
      })
      .filter((p) => p.len > 120 && p.d < 1600)
      .sort((a, b) => a.d - b.d)
      .slice(0, 40);
    for (let i = 0; i < 10 && cands.length; i++) {
      const c = cands.splice(Math.floor(this.rng() * cands.length), 1)[0];
      const h = new Hiker(walkerLook(i));
      const start = Math.floor(this.rng() * (c.pts.length - 1));
      h.root.position.copy(c.pts[start]);
      this.group.add(h.root);
      this.walkers.push({ h, path: c.pts, i: start, dir: this.rng() < 0.5 ? 1 : -1, name: NAMES[i % NAMES.length], greeted: 0 });
    }
  }

  // ---------- farfalle e stormi ----------
  private addButterflies() {
    // ala triangolare
    const wing = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.06), new THREE.Vector3(0.2, 0.02, 0.12), new THREE.Vector3(0.16, 0, -0.1)]);
    wing.setIndex([0, 1, 2]);
    wing.computeVertexNormals();
    const cols = ["#f2b632", "#ffffff", "#e87aa6", "#5f8de0"];
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 0.6 });
      const l = new THREE.Mesh(wing, m), r = new THREE.Mesh(wing, m);
      r.scale.x = -1;
      l.name = "l";
      r.name = "r";
      g.add(l, r);
      g.visible = false;
      this.group.add(g);
      this.butterflies.push({ m: g, c: new THREE.Vector3(), ph: this.rng() * 10 });
    }
  }
  private makeFlock() {
    const g = new THREE.Group();
    const bird = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.6, 0.15, 0), new THREE.Vector3(0, 0, 0.25), new THREE.Vector3(0.6, 0.15, 0)]);
    bird.setIndex([0, 1, 2]);
    const m = new THREE.MeshBasicMaterial({ color: "#2a2230", side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(bird, m);
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      b.position.set(side * row * 1.6, 0, -row * 1.4);
      g.add(b);
    }
    g.visible = false;
    g.scale.setScalar(1.6);
    this.group.add(g);
    return g;
  }

  /** eventi del fotogramma: saluti degli escursionisti e campanacci (per suoni e avvisi) */
  update(dt: number, me: THREE.Vector3, day: number): { greet?: { name: string; tip: string }; bells: THREE.Vector3[] } {
    this.time += dt;
    const out: { greet?: { name: string; tip: string }; bells: THREE.Vector3[] } = { bells: [] };
    const still = new THREE.Vector2();
    // escursionisti: avanti e indietro sul loro sentiero
    for (const w of this.walkers) {
      const p = w.h.root.position;
      const near = Math.hypot(p.x - me.x, p.z - me.z);
      if (near > 900) continue; // lontani: fermi (nessuno li vede)
      const next = w.path[Math.max(0, Math.min(w.path.length - 1, w.i + w.dir))];
      const dx = next.x - p.x, dz = next.z - p.z, len = Math.hypot(dx, dz);
      if (len < 1) {
        w.i += w.dir;
        if (w.i <= 0 || w.i >= w.path.length - 1) w.dir = (w.dir * -1) as 1 | -1;
      }
      const move = near < 3 ? still : new THREE.Vector2(dx, dz).normalize().multiplyScalar(0.5);
      w.h.update(dt, move, false, this.t);
      if (near < 7 && this.time - w.greeted > 60) {
        w.greeted = this.time;
        out.greet = { name: w.name, tip: TIPS[Math.floor(this.rng() * TIPS.length)] };
      }
    }
    // mucche: pascolano piano, il campanaccio suona ogni tanto
    for (const c of this.cows) {
      const p = c.obj.position;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (d > 400) continue;
      c.t -= dt;
      c.bell -= dt;
      if (c.t <= 0) {
        c.target.set(c.home.x + (this.rng() - 0.5) * 30, 0, c.home.z + (this.rng() - 0.5) * 30);
        c.t = 4 + this.rng() * 8;
      }
      const dx = c.target.x - p.x, dz = c.target.z - p.z, len = Math.hypot(dx, dz);
      if (len > 0.5) {
        p.x += (dx / len) * 0.6 * dt;
        p.z += (dz / len) * 0.6 * dt;
        c.obj.rotation.y += (Math.atan2(dx, dz) - c.obj.rotation.y) * (1 - Math.exp(-2 * dt));
      }
      p.y = this.t.heightAt(p.x, p.z);
      if (c.bell <= 0) {
        c.bell = 1.5 + this.rng() * 4;
        if (d < 160) out.bells.push(p);
      }
    }
    // farfalle: girano vicino a te nei prati, di giorno
    const meadow = me.y / S > 800 && me.y / S < 2400;
    for (const b of this.butterflies) {
      if (!meadow || day < 0.5) {
        b.m.visible = false;
        continue;
      }
      if (!b.m.visible || b.c.distanceTo(me) > 40) {
        // mai attaccate a te (o alla telecamera): tra 8 e 22 unità di distanza
        const a = this.rng() * Math.PI * 2, r = 8 + this.rng() * 14;
        b.c.set(me.x + Math.cos(a) * r, 0, me.z + Math.sin(a) * r);
        b.c.y = this.t.heightAt(b.c.x, b.c.z);
        b.m.visible = true;
      }
      b.ph += dt;
      const x = b.c.x + Math.sin(b.ph * 0.7) * 3, z = b.c.z + Math.cos(b.ph * 0.53) * 3;
      b.m.position.set(x, this.t.heightAt(x, z) + 0.8 + Math.sin(b.ph * 2.1) * 0.4, z);
      b.m.rotation.y = b.ph * 0.7;
      const f = Math.sin(b.ph * 22) * 1.1;
      b.m.getObjectByName("l")!.rotation.y = f;
      b.m.getObjectByName("r")!.rotation.y = -f;
    }
    // stormo: ogni tanto attraversa il cielo sopra di te
    this.flockT -= dt;
    if (this.flockT <= 0 && day > 0.5) {
      this.flockT = 40 + this.rng() * 40;
      const a = this.rng() * Math.PI * 2;
      this.flockDir.set(Math.cos(a), 0, Math.sin(a));
      this.flock.position.set(me.x - this.flockDir.x * 220, me.y + 45 + this.rng() * 30, me.z - this.flockDir.z * 220);
      this.flock.rotation.y = Math.atan2(this.flockDir.x, this.flockDir.z);
      this.flock.visible = true;
    }
    if (this.flock.visible) {
      this.flock.position.addScaledVector(this.flockDir, 18 * dt);
      this.flock.children.forEach((b, i) => (b.rotation.z = Math.sin(this.time * 9 + i) * 0.35));
      if (this.flock.position.distanceTo(me) > 260 && this.flockT < 30) this.flock.visible = false;
    }
    // nuvole: si spostano piano col vento da ovest
    for (const c of this.clouds) {
      c.position.x += 2.2 * dt;
      if (c.position.x > this.t.width + 200) c.position.x = -200;
    }
    return out;
  }
}
