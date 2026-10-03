import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { S, type Terrain, type WorldData } from "./world";

/**
 * La fotografia naturalistica: i soggetti da fotografare (fiori protetti, animali), il loro aspetto nel mondo, e il
 * "mirino" che dice se la foto è buona. Un fiore protetto si fotografa, non si raccoglie; un animale si fotografa da
 * lontano, con lo zoom, senza disturbarlo.
 */
export type Subject = "stella" | "genziana" | "rododendro" | "arnica" | "stambecco" | "camoscio" | "marmotta" | "aquila" | "gracchio" | "mucca";
export const SUBJECTS: Record<Subject, { name: string; kind: "fiore" | "animale"; fact: string | null; size: number; min: number; where: string }> = {
  stella: { name: "Stella alpina", kind: "fiore", fact: "stella", size: 0.55, min: 0, where: "rocce e pascoli sassosi sopra i 2000 m" },
  genziana: { name: "Genziana", kind: "fiore", fact: "genziana", size: 0.5, min: 0, where: "pascoli alti, 1600–2500 m" },
  rododendro: { name: "Rododendro", kind: "fiore", fact: "rododendro", size: 1.1, min: 0, where: "pendii sopra il bosco, 1500–2200 m" },
  arnica: { name: "Arnica", kind: "fiore", fact: "arnica", size: 0.55, min: 0, where: "pascoli di mezza montagna, 1200–2200 m" },
  stambecco: { name: "Stambecco", kind: "animale", fact: "stambecco", size: 1.7, min: 18, where: "rocce sotto le cime, sopra i 2300 m" },
  camoscio: { name: "Camoscio", kind: "animale", fact: "camoscio", size: 1.4, min: 24, where: "margine del bosco e cenge, 1500–2300 m" },
  marmotta: { name: "Marmotta", kind: "animale", fact: "marmotta", size: 0.7, min: 34, where: "pascoli alti vicino ai rifugi" },
  aquila: { name: "Aquila reale", kind: "animale", fact: "aquila", size: 3.6, min: 0, where: "sopra le pareti della Val di Mello" },
  gracchio: { name: "Gracchio alpino", kind: "animale", fact: "gracchio", size: 0.9, min: 0, where: "attorno ai rifugi d'alta quota" },
  mucca: { name: "Mucca all'alpeggio", kind: "animale", fact: "mucche", size: 1.8, min: 6, where: "pascoli d'estate" },
};
export const SUBJECT_IDS = Object.keys(SUBJECTS) as Subject[];

/** un soggetto nel mondo, in questo momento (gli animali si muovono: la posizione si legge ogni volta) */
export type Target = { subject: Subject; pos: THREE.Vector3; hidden?: boolean };
/** com'è la foto che stai per fare */
export type Aim = { subject: Subject; dist: number; ok: boolean; why: string };

/** pezzi colorati uniti in una sola geometria (un fiore = una sola cosa da disegnare, per tanti fiori) */
function part(g: THREE.BufferGeometry, color: string, m: THREE.Matrix4) {
  const geo = g.toNonIndexed().applyMatrix4(m);
  geo.deleteAttribute("uv");
  const c = new THREE.Color(color), n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function flowerGeometry(kind: "stella" | "genziana" | "rododendro" | "arnica") {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.018, 0.022, 1, 4);
  if (kind === "stella") {
    // stella alpina: petali bianco-feltro a stella, cuore giallo pallido
    parts.push(part(stem, "#7d9a6a", M(0, 0.18, 0, 0, 0, 0, 1, 0.36, 1)));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      parts.push(part(new THREE.BoxGeometry(0.06, 0.02, 0.22), "#eef0ea", M(Math.sin(a) * 0.1, 0.37, Math.cos(a) * 0.1, 0.15, a, 0)));
    }
    parts.push(part(new THREE.IcosahedronGeometry(0.055, 0), "#e6dc9a", M(0, 0.39, 0)));
  } else if (kind === "genziana") {
    // genziana: campana blu intenso, aperta verso l'alto, con due foglie
    parts.push(part(stem, "#5f8f4a", M(0, 0.1, 0, 0, 0, 0, 1, 0.2, 1)));
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.045, 0.24, 6, 1, true), "#2448c8", M(0, 0.32, 0)));
    parts.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 6), "#d9e04a", M(0, 0.24, 0)));
    for (const s of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.16, 0.015, 0.06), "#4f8a3e", M(0.07 * s, 0.05, 0, 0, 0, 0.3 * s)));
  } else if (kind === "rododendro") {
    // rododendro: cespuglio verde scuro con mazzetti rosa
    for (const [x, y, z, r] of [[0, 0.35, 0, 0.38], [0.3, 0.25, 0.1, 0.28], [-0.28, 0.26, -0.06, 0.3], [0.05, 0.28, 0.3, 0.26]])
      parts.push(part(new THREE.IcosahedronGeometry(r, 0), "#2f5a35", M(x, y, z)));
    for (const [x, y, z] of [[0.1, 0.72, 0.05], [-0.25, 0.55, 0.12], [0.38, 0.48, 0.05], [0.0, 0.55, -0.3], [-0.1, 0.5, 0.42], [0.3, 0.45, 0.33]])
      parts.push(part(new THREE.IcosahedronGeometry(0.09, 0), "#e05a8f", M(x, y, z)));
  } else {
    // arnica: margherita gialla aranciata
    parts.push(part(stem, "#6d9a4c", M(0, 0.2, 0, 0, 0, 0, 1, 0.4, 1)));
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      parts.push(part(new THREE.BoxGeometry(0.045, 0.012, 0.16), "#f3b51e", M(Math.sin(a) * 0.09, 0.41, Math.cos(a) * 0.09, -0.2, a, 0)));
    }
    parts.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), "#d87a12", M(0, 0.42, 0)));
  }
  return mergeGeometries(parts)!;
}

export class Nature {
  readonly group = new THREE.Group();
  /** i fiori: dove sono (per il mirino) */
  readonly flowers: Target[] = [];
  /** i gracchi: stormi che girano sopra i rifugi alti */
  private flocks: { center: THREE.Vector3; birds: THREE.Object3D[]; phase: number }[] = [];
  private time = 0;
  /** cose che possono coprire un soggetto (alberi, il Sasso Remenno) */
  occluders: THREE.Object3D[] = [];
  private ray = new THREE.Raycaster();

  constructor(private t: Terrain, data: WorldData) {
    let seed = 777;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    // i fiori crescono vicino ai sentieri (così chi cammina li trova), ognuno alla sua quota
    const bands: Record<"stella" | "genziana" | "rododendro" | "arnica", [number, number, number]> = {
      stella: [2000, 2800, 26],
      genziana: [1600, 2500, 30],
      rododendro: [1500, 2200, 26],
      arnica: [1200, 2200, 30],
    };
    const dummy = new THREE.Object3D();
    for (const kind of Object.keys(bands) as (keyof typeof bands)[]) {
      const [lo, hi, want] = bands[kind];
      const spots: THREE.Vector3[] = [];
      for (let tries = 0; tries < 6000 && spots.length < want; tries++) {
        const path = data.paths[Math.floor(rng() * data.paths.length)];
        if (path.k === "r") continue;
        const [px, pz] = path.pts[Math.floor(rng() * path.pts.length)];
        const a = rng() * Math.PI * 2, r = 3 + rng() * 9;
        const x = px * S + Math.cos(a) * r, z = pz * S + Math.sin(a) * r;
        if (!t.inside(x, z, 10)) continue;
        const m = t.heightAt(x, z) / S;
        if (m < lo || m > hi || t.slopeAt(x, z) > (kind === "stella" ? 40 : 30)) continue;
        if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 120)) continue; // sparsi per la valle, non tutti insieme
        spots.push(new THREE.Vector3(x, t.heightAt(x, z), z));
      }
      // ogni punto è un piccolo gruppo di piante
      const plants: THREE.Vector3[] = [];
      for (const c of spots) {
        const n = kind === "rododendro" ? 4 : 5;
        for (let i = 0; i < n; i++) {
          const x = c.x + (rng() - 0.5) * 3, z = c.z + (rng() - 0.5) * 3;
          plants.push(new THREE.Vector3(x, t.heightAt(x, z), z));
        }
        this.flowers.push({ subject: kind, pos: c.clone().setY(c.y + 0.3) });
      }
      const mesh = new THREE.InstancedMesh(flowerGeometry(kind), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }), plants.length);
      plants.forEach((p, i) => {
        dummy.position.copy(p);
        dummy.rotation.set(0, rng() * Math.PI * 2, 0);
        dummy.scale.setScalar(kind === "rododendro" ? 1 + rng() * 0.6 : 1.3 + rng() * 0.5);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = kind === "rododendro";
      this.group.add(mesh);
    }
    // gracchi alpini sopra i rifugi alti
    const black = new THREE.MeshStandardMaterial({ color: "#1d1b22", flatShading: true, roughness: 0.6 });
    const beak = new THREE.MeshStandardMaterial({ color: "#f2c230", flatShading: true });
    for (const h of data.huts) {
      if (h.kind !== "rifugio" || !h.ele || h.ele < 1900) continue;
      const center = new THREE.Vector3(h.p[0] * S, 0, h.p[1] * S);
      center.y = t.heightAt(center.x, center.z) + 9;
      const birds: THREE.Object3D[] = [];
      for (let i = 0; i < 5; i++) {
        const b = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 3, 6), black);
        body.rotation.x = Math.PI / 2;
        const bk = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), beak);
        bk.rotation.x = Math.PI / 2;
        bk.position.z = 0.28;
        const wing = new THREE.BoxGeometry(0.42, 0.02, 0.16);
        const wl = new THREE.Mesh(wing, black), wr = new THREE.Mesh(wing, black);
        wl.position.x = -0.22;
        wr.position.x = 0.22;
        wl.name = "wl";
        wr.name = "wr";
        b.add(body, bk, wl, wr);
        b.scale.setScalar(1.8);
        birds.push(b);
        this.group.add(b);
      }
      this.flocks.push({ center, birds, phase: rng() * 10 });
    }
  }

  /** a ogni fotogramma: i gracchi giocano col vento (cerchi larghi, su e giù) */
  update(dt: number) {
    this.time += dt;
    for (const f of this.flocks)
      f.birds.forEach((b, i) => {
        const a = this.time * (0.35 + i * 0.04) + f.phase + i * 1.3, r = 10 + i * 3;
        b.position.set(f.center.x + Math.cos(a) * r, f.center.y + Math.sin(this.time * 0.8 + i) * 3 + i * 1.5, f.center.z + Math.sin(a) * r);
        b.rotation.set(0, -a, 0.4);
        const flap = Math.sin(this.time * 10 + i) * 0.5;
        b.getObjectByName("wl")!.rotation.z = flap;
        b.getObjectByName("wr")!.rotation.z = -flap;
      });
  }
  birds(): Target[] {
    return this.flocks.flatMap((f) => f.birds.map((b) => ({ subject: "gracchio" as Subject, pos: b.position })));
  }

  /**
   * Cosa c'è nel mirino: il soggetto più al centro, se visibile. Una foto è buona se il soggetto è abbastanza grande
   * nell'inquadratura (zoom o avvicinati) e, per gli animali, se non sei così vicina da disturbarlo.
   */
  aim(camera: THREE.PerspectiveCamera, targets: Target[]): Aim | null {
    const v = new THREE.Vector3();
    let best: { t: Target; c: number; d: number } | null = null;
    for (const t of targets) {
      if (t.hidden) continue;
      const d = t.pos.distanceTo(camera.position);
      if (d > 600) continue;
      v.copy(t.pos).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 0.6 || Math.abs(v.y) > 0.6) continue;
      const c = Math.hypot(v.x, v.y);
      if (!best || c < best.c) best = { t, c, d };
    }
    if (!best) return null;
    // nascosto dietro un dosso? si guarda il terreno lungo la linea di vista
    const from = camera.position, to = best.t.pos;
    for (let k = 1; k < 12; k++) {
      const p = from.clone().lerp(to, k / 12);
      if (this.t.heightAt(p.x, p.z) > p.y + 0.4) return null;
    }
    // …o dietro un albero (o un masso)
    if (this.occluders.length) {
      const dir = to.clone().sub(from);
      const len = dir.length();
      this.ray.set(from, dir.divideScalar(len));
      this.ray.far = len - 1.2;
      if (this.ray.intersectObjects(this.occluders, true).length) return { subject: best.t.subject, dist: best.d, ok: false, why: "— c'è qualcosa davanti: spostati un po'" };
    }
    const info = SUBJECTS[best.t.subject];
    const frac = info.size / best.d / THREE.MathUtils.degToRad(camera.fov); // quanta parte dell'altezza dell'inquadratura
    const flat = Math.hypot(to.x - from.x, to.z - from.z);
    if (info.min && flat < info.min) return { subject: best.t.subject, dist: best.d, ok: false, why: "— sei troppo vicina: così disturbi l'animale, allontanati" };
    if (frac < 0.07) return { subject: best.t.subject, dist: best.d, ok: false, why: "— serve più zoom (rotella o +), oppure avvicinati" };
    return { subject: best.t.subject, dist: best.d, ok: true, why: "— foto perfetta: scatta!" };
  }
}

/**
 * Gli ometti caduti: sulle pietraie sopra i 2000 m, lungo i sentieri, dove la vernice si vede poco. Caduti sono sassi
 * sparsi; rimessi in piedi (col minigioco) diventano una pila che segna di nuovo la strada.
 */
export type Cairn = { id: string; pos: THREE.Vector3; setBuilt: (b: boolean) => void };
export function buildCairns(t: Terrain, data: WorldData) {
  const group = new THREE.Group();
  const cairns: Cairn[] = [];
  let seed = 4242;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const greys = ["#9d9aa3", "#8a8691", "#b3aeb6", "#7f7b86"].map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.95 }));
  const rock = new THREE.DodecahedronGeometry(1, 0);
  // vicino ai rifugi alti, così chi sale li incontra
  // prima i rifugi della Val Masino (i più vicini a San Martino): oltre le creste ci va quasi nessuno
  const home = data.huts.find((h) => h.name === "San Martino") ?? data.huts[0];
  const huts = data.huts.filter((h) => h.kind === "rifugio" && h.ele && h.ele > 1900).sort((a, b) => Math.hypot(a.p[0] - home.p[0], a.p[1] - home.p[1]) - Math.hypot(b.p[0] - home.p[0], b.p[1] - home.p[1]));
  for (const h of huts) {
    if (cairns.length >= 6) break;
    const hx = h.p[0] * S, hz = h.p[1] * S;
    let best: THREE.Vector3 | null = null;
    for (let tries = 0; tries < 3000 && !best; tries++) {
      const path = data.paths[Math.floor(rng() * data.paths.length)];
      if (path.k === "r") continue;
      const [px, pz] = path.pts[Math.floor(rng() * path.pts.length)];
      const x = px * S + (rng() - 0.5) * 4, z = pz * S + (rng() - 0.5) * 4;
      const d = Math.hypot(x - hx, z - hz), m = t.heightAt(x, z) / S;
      if (d < 60 || d > 260 || m < 2000 || m > 2800 || t.slopeAt(x, z) > 32) continue;
      best = new THREE.Vector3(x, t.heightAt(x, z), z);
    }
    if (!best) continue;
    const id = `ometto-${h.name}`;
    const built = new THREE.Group(), fallen = new THREE.Group();
    // in piedi: cinque sassi sempre più piccoli
    let y = 0;
    [0.75, 0.62, 0.52, 0.42, 0.32].forEach((r, i) => {
      const m = new THREE.Mesh(rock, greys[i % greys.length]);
      m.scale.set(r * 1.2, r * 0.55, r);
      y += r * 0.55;
      m.position.set((rng() - 0.5) * 0.12, y, (rng() - 0.5) * 0.12);
      m.rotation.y = rng() * 3;
      y += r * 0.45;
      built.add(m);
    });
    // caduti: gli stessi sassi sparsi sull'erba
    [0.75, 0.62, 0.52, 0.42, 0.32].forEach((r, i) => {
      const m = new THREE.Mesh(rock, greys[i % greys.length]);
      m.scale.set(r * 1.2, r * 0.55, r);
      const a = rng() * Math.PI * 2, d = i === 0 ? 0 : 0.8 + rng() * 1.4;
      const x = best!.x + Math.cos(a) * d, z = best!.z + Math.sin(a) * d;
      m.position.set(Math.cos(a) * d, t.heightAt(x, z) - best!.y + r * 0.3, Math.sin(a) * d);
      m.rotation.set(rng(), rng() * 3, rng());
      fallen.add(m);
    });
    const g = new THREE.Group();
    g.position.copy(best);
    g.add(built, fallen);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    group.add(g);
    cairns.push({ id, pos: best, setBuilt: (b) => ((built.visible = b), (fallen.visible = !b)) });
  }
  return { group, cairns };
}
