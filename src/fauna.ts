import * as THREE from "three";
import { S, type Terrain } from "./world";

/**
 * Gli animali. Stambecchi sulle rocce sotto il Disgrazia e le altre cime, camosci al margine del bosco, marmotte sui
 * pascoli alti, un'aquila reale che gira sopra le pareti della Val di Mello. Si possono osservare da una distanza rispettosa; se ti avvicini troppo, scappano
 * (gli stambecchi) o fischiano e spariscono nella tana (le marmotte).
 */
export type Species = "stambecco" | "camoscio" | "marmotta" | "aquila";
type Animal = { obj: THREE.Group; home: THREE.Vector3; target: THREE.Vector3; speed: number; t: number; mode: "idle" | "walk" | "flee" | "hide"; hidden: number };
export type Group = { species: Species; center: THREE.Vector3; animals: Animal[]; observe: [number, number]; fled: number };

const mat = (c: string) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 });

function ibex() {
  const g = new THREE.Group();
  const coat = mat("#8b7a66"), dark = mat("#4f4337"), horn = mat("#5a5048");
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 1.25), coat);
  body.position.y = 0.95;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), coat);
  neck.position.set(0, 1.25, 0.6);
  neck.rotation.x = -0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.44), dark);
  head.position.set(0, 1.48, 0.82);
  g.add(body, neck, head);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 5, 10, 2.3), horn);
    h.position.set(0.08 * s, 1.55, 0.62);
    h.rotation.set(0, Math.PI / 2, 0.6);
    g.add(h);
  }
  for (const [x, z] of [[-0.18, 0.48], [0.18, 0.48], [-0.18, -0.48], [0.18, -0.48]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.72, 5), dark);
    leg.position.set(x, 0.36, z);
    g.add(leg);
  }
  return g;
}
/** il camoscio: più piccolo dello stambecco, scuro, con la "maschera" chiara sul muso e le corna sottili a uncino */
function chamois() {
  const g = new THREE.Group();
  const coat = mat("#5e4a3a"), face = mat("#e9dccb"), dark = mat("#2e2620");
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 1.0), coat);
  body.position.y = 0.82;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.24), coat);
  neck.position.set(0, 1.08, 0.48);
  neck.rotation.x = -0.45;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.36), face);
  head.position.set(0, 1.3, 0.66);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.08, 0.3), dark);
  stripe.position.set(0, 1.33, 0.67);
  g.add(body, neck, head, stripe);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 4, 8, Math.PI * 1.2), dark);
    h.position.set(0.06 * s, 1.5, 0.6);
    h.rotation.set(0, Math.PI / 2, 0);
    g.add(h);
  }
  for (const [x, z] of [[-0.14, 0.38], [0.14, 0.38], [-0.14, -0.38], [0.14, -0.38]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.62, 5), dark);
    leg.position.set(x, 0.31, z);
    g.add(leg);
  }
  return g;
}
function marmot() {
  const g = new THREE.Group();
  const fur = mat("#9a7552");
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 3, 8), fur);
  body.position.y = 0.32;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat("#7d5c40"));
  head.position.set(0, 0.62, 0.05);
  g.add(body, head);
  return g;
}
function eagle() {
  const g = new THREE.Group();
  const brown = mat("#4a3528"), gold = mat("#a4794a");
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 3, 6), brown);
  body.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), gold);
  head.position.z = 0.48;
  const wing = new THREE.BoxGeometry(1.15, 0.04, 0.42);
  const wl = new THREE.Mesh(wing, brown), wr = new THREE.Mesh(wing, brown);
  wl.position.x = -0.62;
  wr.position.x = 0.62;
  wl.name = "wl";
  wr.name = "wr";
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.35), brown);
  tail.position.z = -0.5;
  g.add(body, head, wl, wr, tail);
  g.scale.setScalar(1.6); // un po' più grande del vero, per vederla lassù
  return g;
}

/** cerca un punto adatto vicino a `near` (raggio in unità di gioco) con quota e pendenza giuste */
function findSpot(t: Terrain, near: THREE.Vector3, rMin: number, rMax: number, alt: [number, number], slope: [number, number], rng: () => number) {
  for (let i = 0; i < 4000; i++) {
    const a = rng() * Math.PI * 2, d = rMin + rng() * (rMax - rMin);
    const x = near.x + Math.cos(a) * d, z = near.z + Math.sin(a) * d;
    if (!t.inside(x, z, 20)) continue;
    const m = t.heightAt(x, z) / S, s = t.slopeAt(x, z);
    if (m >= alt[0] && m <= alt[1] && s >= slope[0] && s <= slope[1]) return new THREE.Vector3(x, t.heightAt(x, z), z);
  }
  return null;
}

export class Fauna {
  readonly group = new THREE.Group();
  readonly groups: Group[] = [];
  private eagleObj?: THREE.Group;
  private eagleCenter = new THREE.Vector3();
  private time = 0;

  constructor(private t: Terrain, spots: { ibex: THREE.Vector3[]; chamois?: THREE.Vector3[]; marmots: THREE.Vector3[]; eagle: THREE.Vector3 | null }, private rng: () => number) {
    for (const near of spots.ibex) {
      const c = findSpot(t, near, 120, 520, [2350, 2850], [12, 36], rng);
      if (c) this.addGroup("stambecco", c, 5, ibex, 14, [18, 75]);
    }
    for (const near of spots.chamois ?? []) {
      const c = findSpot(t, near, 80, 420, [1500, 2300], [14, 38], rng);
      if (c) this.addGroup("camoscio", c, 3, chamois, 12, [24, 80]);
    }
    for (const near of spots.marmots) {
      const c = findSpot(t, near, 60, 380, [1750, 2350], [2, 22], rng);
      if (c) this.addGroup("marmotta", c, 4, marmot, 9, [34, 80]);
    }
    if (spots.eagle) {
      this.eagleObj = eagle();
      this.eagleCenter.copy(spots.eagle);
      this.group.add(this.eagleObj);
      this.groups.push({ species: "aquila", center: this.eagleCenter, animals: [], observe: [0, 220], fled: 0 });
    }
    this.group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  }

  private addGroup(species: Species, center: THREE.Vector3, n: number, make: () => THREE.Group, spread: number, observe: [number, number]) {
    const animals: Animal[] = [];
    for (let i = 0; i < n; i++) {
      const obj = make();
      const home = new THREE.Vector3(center.x + (this.rng() - 0.5) * spread * 2, 0, center.z + (this.rng() - 0.5) * spread * 2);
      home.y = this.t.heightAt(home.x, home.z);
      obj.position.copy(home);
      obj.rotation.y = this.rng() * Math.PI * 2;
      this.group.add(obj);
      animals.push({ obj, home, target: home.clone(), speed: 0, t: this.rng() * 5, mode: "idle", hidden: 0 });
    }
    this.groups.push({ species, center, animals, observe, fled: 0 });
  }

  /** restituisce gli eventi del fotogramma (fuga, fischio) per avvisi e diario */
  update(dt: number, me: THREE.Vector3): { kind: "fled" | "whistle"; species: Species }[] {
    this.time += dt;
    const events: { kind: "fled" | "whistle"; species: Species }[] = [];
    for (const g of this.groups) {
      if (g.species === "aquila") continue;
      const tooClose = g.observe[0];
      for (const a of g.animals) {
        const p = a.obj.position;
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        a.t -= dt;
        if (g.species === "stambecco" || g.species === "camoscio") {
          if (d < tooClose && a.mode !== "flee") {
            // fugge in salita, lontano da te
            const away = new THREE.Vector2(p.x - me.x, p.z - me.z).normalize();
            a.target.set(p.x + away.x * 45, 0, p.z + away.y * 45);
            a.mode = "flee";
            a.t = 6;
            if (g.fled <= 0) events.push({ kind: "fled", species: g.species });
            g.fled = 12;
          }
          if (a.mode !== "flee" && a.t <= 0) {
            // pascola: piccoli spostamenti attorno a casa
            a.target.set(a.home.x + (this.rng() - 0.5) * 16, 0, a.home.z + (this.rng() - 0.5) * 16);
            a.mode = this.rng() < 0.5 ? "walk" : "idle";
            a.t = 3 + this.rng() * 5;
          }
          if (a.mode === "flee" && a.t <= 0) {
            a.home.set(p.x, 0, p.z);
            a.mode = "idle";
          }
          const v = a.mode === "flee" ? 9 : a.mode === "walk" ? 0.8 : 0;
          const dx = a.target.x - p.x, dz = a.target.z - p.z, len = Math.hypot(dx, dz);
          if (v && len > 0.5) {
            const step = Math.min(len, v * dt);
            const nx = p.x + (dx / len) * step, nz = p.z + (dz / len) * step;
            if (this.t.slopeAt(nx, nz) < 58) (p.x = nx), (p.z = nz);
            a.obj.rotation.y += (Math.atan2(dx, dz) - a.obj.rotation.y) * (1 - Math.exp(-6 * dt));
          } else if (d < 60 && a.mode !== "flee") {
            // ti ha visto: alza la testa e ti guarda
            const look = Math.atan2(me.x - p.x, me.z - p.z);
            a.obj.rotation.y += Math.atan2(Math.sin(look - a.obj.rotation.y), Math.cos(look - a.obj.rotation.y)) * (1 - Math.exp(-2 * dt));
          }
          p.y = this.t.heightAt(p.x, p.z);
        } else {
          // marmotte: fischiano e spariscono nella tana, poi tornano fuori
          if (d < tooClose && a.mode !== "hide") {
            a.mode = "hide";
            a.hidden = 14 + this.rng() * 6;
            if (g.fled <= 0) events.push({ kind: "whistle", species: "marmotta" });
            g.fled = 10;
          }
          if (a.mode === "hide") {
            a.hidden -= dt;
            if (a.hidden <= 0 && d > tooClose) a.mode = "idle";
          }
          const ground = this.t.heightAt(p.x, p.z);
          const upright = d < 70 && a.mode !== "hide" ? 1 : 0; // in piedi a guardarti
          p.y += ((a.mode === "hide" ? ground - 0.9 : ground) - p.y) * (1 - Math.exp(-8 * dt));
          a.obj.rotation.x += ((upright ? -0.9 : 0) - a.obj.rotation.x) * (1 - Math.exp(-6 * dt));
          if (upright) {
            const look = Math.atan2(me.x - p.x, me.z - p.z);
            a.obj.rotation.y = look;
          }
        }
      }
      if (g.fled > 0) g.fled -= dt;
    }
    // l'aquila gira in larghi cerchi
    if (this.eagleObj) {
      const r = 46, w = 0.18, a = this.time * w;
      const e = this.eagleObj;
      e.position.set(this.eagleCenter.x + Math.cos(a) * r, this.eagleCenter.y + Math.sin(this.time * 0.3) * 3, this.eagleCenter.z + Math.sin(a) * r);
      e.rotation.set(0, -a, 0.35);
      const flap = Math.max(0, Math.sin(this.time * 0.7)) > 0.95 ? Math.sin(this.time * 9) * 0.4 : 0.05;
      e.getObjectByName("wl")!.rotation.z = flap;
      e.getObjectByName("wr")!.rotation.z = -flap;
    }
    return events;
  }

  /** gli animali, uno per uno (per la fotocamera): dove sono e se si vedono (le marmotte nella tana no) */
  targets() {
    const out: { subject: Species; pos: THREE.Vector3; hidden?: boolean }[] = [];
    for (const g of this.groups) {
      if (g.species === "aquila") continue;
      for (const a of g.animals) out.push({ subject: g.species, pos: a.obj.position.clone().setY(a.obj.position.y + (g.species === "marmotta" ? 0.4 : 1)), hidden: a.mode === "hide" });
    }
    if (this.eagleObj) out.push({ subject: "aquila", pos: this.eagleObj.position });
    return out;
  }

  /** il gruppo più vicino osservabile ora (né troppo vicino né troppo lontano, e visibile) */
  observable(me: THREE.Vector3) {
    let best: { g: Group; d: number } | null = null;
    for (const g of this.groups) {
      const c = g.species === "aquila" ? g.center : this.centroid(g);
      const d = Math.hypot(c.x - me.x, c.z - me.z);
      const visible = g.species !== "marmotta" || g.animals.some((a) => a.mode !== "hide");
      if (visible && d >= g.observe[0] && d <= g.observe[1] && (!best || d < best.d)) best = { g, d };
    }
    return best?.g ?? null;
  }
  centroid(g: Group) {
    if (!g.animals.length) return g.center;
    const c = new THREE.Vector3();
    g.animals.forEach((a) => c.add(a.obj.position));
    return c.divideScalar(g.animals.length);
  }
}
