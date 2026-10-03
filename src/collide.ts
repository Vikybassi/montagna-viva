/**
 * Gli ostacoli solidi: case, rifugi, bivacchi, campanili (scatole ruotate) e tronchi degli alberi (cerchi).
 * Una griglia spaziale tiene i vicini a portata: a ogni passo si controllano solo quelli intorno.
 * - `push`: sposta fuori un cerchio (chi cammina) che è entrato in un ostacolo, così si scivola lungo il muro;
 * - `cast`: il primo ostacolo lungo un raggio (la telecamera non entra nelle case).
 */
export type Box = { kind: "box"; x: number; z: number; hw: number; hd: number; rot: number; y0: number; y1: number };
export type Circle = { kind: "circle"; x: number; z: number; r: number; y0: number; y1: number; live?: () => boolean };
export type Shape = Box | Circle;

const CELL = 24;

export class Obstacles {
  private grid = new Map<number, Shape[]>();
  readonly all: Shape[] = [];

  private key(ci: number, cj: number) {
    return ci * 100003 + cj;
  }
  private reach(s: Shape) {
    return s.kind === "circle" ? s.r : Math.hypot(s.hw, s.hd);
  }
  add(s: Shape) {
    this.all.push(s);
    const r = this.reach(s);
    for (let ci = Math.floor((s.x - r) / CELL); ci <= Math.floor((s.x + r) / CELL); ci++)
      for (let cj = Math.floor((s.z - r) / CELL); cj <= Math.floor((s.z + r) / CELL); cj++) {
        const k = this.key(ci, cj);
        const list = this.grid.get(k);
        if (list) list.push(s);
        else this.grid.set(k, [s]);
      }
  }
  /** gli ostacoli nelle celle intorno al punto (entro `r`) */
  near(x: number, z: number, r: number) {
    const out = new Set<Shape>();
    for (let ci = Math.floor((x - r) / CELL); ci <= Math.floor((x + r) / CELL); ci++)
      for (let cj = Math.floor((z - r) / CELL); cj <= Math.floor((z + r) / CELL); cj++) for (const s of this.grid.get(this.key(ci, cj)) ?? []) out.add(s);
    return out;
  }

  /**
   * Un cerchio di raggio `r` in (x, z), all'altezza `y` (dei piedi): se tocca un ostacolo lo si sposta fuori.
   * Sopra un ostacolo (in volo col parapendio, o su un tetto) non si tocca nulla.
   */
  push(x: number, z: number, y: number, r: number) {
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const s of this.near(x, z, r + 1)) {
        if (y > s.y1 || y + 1.7 < s.y0 || (s.kind === "circle" && s.live && !s.live())) continue;
        if (s.kind === "circle") {
          const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz), min = s.r + r;
          if (d >= min) continue;
          // esattamente al centro: si esce verso +x
          const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
          x = s.x + nx * min;
          z = s.z + nz * min;
          moved = true;
        } else {
          // nel sistema della scatola (ruotata come il gruppo three.js: rotation.y = rot)
          const c = Math.cos(s.rot), sn = Math.sin(s.rot);
          const dx = x - s.x, dz = z - s.z;
          const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
          const qx = Math.max(-s.hw, Math.min(s.hw, lx)), qz = Math.max(-s.hd, Math.min(s.hd, lz));
          let ox = lx - qx, oz = lz - qz;
          const d = Math.hypot(ox, oz);
          let nlx: number, nlz: number;
          if (d > 1e-6) {
            if (d >= r) continue;
            ox /= d;
            oz /= d;
            nlx = qx + ox * r;
            nlz = qz + oz * r;
          } else {
            // dentro: si esce dal lato più vicino
            const ex = s.hw - Math.abs(lx), ez = s.hd - Math.abs(lz);
            if (ex < ez) (nlx = Math.sign(lx || 1) * (s.hw + r)), (nlz = lz);
            else (nlx = lx), (nlz = Math.sign(lz || 1) * (s.hd + r));
          }
          x = s.x + nlx * c + nlz * sn;
          z = s.z - nlx * sn + nlz * c;
          moved = true;
        }
      }
      if (!moved) return { x, z, stuck: false };
    }
    // ancora dentro qualcosa (un varco più stretto di te, tra due tronchi): il passo non si fa
    return { x, z, stuck: this.hits(x, z, y, r) };
  }

  /** true se il cerchio tocca un ostacolo */
  hits(x: number, z: number, y: number, r: number) {
    for (const s of this.near(x, z, r + 1)) {
      if (y > s.y1 || y + 1.7 < s.y0 || (s.kind === "circle" && s.live && !s.live())) continue;
      if (s.kind === "circle") {
        if (Math.hypot(x - s.x, z - s.z) < s.r + r - 1e-6) return true;
      } else {
        const c = Math.cos(s.rot), sn = Math.sin(s.rot), dx = x - s.x, dz = z - s.z;
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        if (Math.hypot(Math.max(0, Math.abs(lx) - s.hw), Math.max(0, Math.abs(lz) - s.hd)) < r - 1e-6) return true;
      }
    }
    return false;
  }

  /** dal punto `o` lungo la direzione `dir` (unitaria) per al massimo `len`: la distanza del primo ostacolo, o null */
  cast(o: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, len: number) {
    let best: number | null = null;
    const steps = Math.ceil(len / CELL) + 1;
    const seen = new Set<Shape>();
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(len, i * CELL);
      for (const s of this.near(o.x + dir.x * t, o.z + dir.z * t, CELL)) {
        if (seen.has(s)) continue;
        seen.add(s);
        if (s.kind !== "box") continue; // i tronchi sono sottili: la telecamera ci passa accanto
        const hit = rayBox(o, dir, s);
        if (hit !== null && hit <= len && (best === null || hit < best)) best = hit;
      }
    }
    return best;
  }
}

/** raggio contro scatola ruotata (metodo delle lastre, nel sistema della scatola); null se non la tocca */
export function rayBox(o: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, s: Box) {
  const c = Math.cos(s.rot), sn = Math.sin(s.rot);
  const dx = o.x - s.x, dz = o.z - s.z;
  const ox = dx * c - dz * sn, oz = dx * sn + dz * c;
  const vx = dir.x * c - dir.z * sn, vz = dir.x * sn + dir.z * c;
  let t0 = 0, t1 = Infinity;
  for (const [p, v, lo, hi] of [[ox, vx, -s.hw, s.hw], [o.y, dir.y, s.y0, s.y1], [oz, vz, -s.hd, s.hd]] as const) {
    if (Math.abs(v) < 1e-9) {
      if (p < lo || p > hi) return null;
      continue;
    }
    let a = (lo - p) / v, b = (hi - p) / v;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}
