import * as THREE from "three";
import { S, type Terrain, type WorldData } from "./world";

/**
 * La strada verso un rifugio: i sentieri diventano un grafo (gli incroci sono punti in comune), e si cerca il percorso più
 * rapido con i tempi dei cartelli CAI tratto per tratto (4 km/h in piano, 300 m/h in salita, 500 m/h in discesa).
 * La strada trovata si accende sul terreno e sulla mappa.
 */
type Node = { x: number; z: number; h: number; edges: { to: number; cost: number }[] };
/** un bivio lungo la strada: indice nel percorso, da che parte andare, e se dopo si sale (m di dislivello nei 75 m dopo) */
export type Turn = { i: number; side: "destra" | "sinistra" | "dritto"; up: number };

/** tempo (ore) per un tratto: distanza in metri, dislivello in metri */
export const cai = (dist: number, dh: number) => {
  const th = dist / 4000, tv = dh > 0 ? dh / 300 : -dh / 500;
  return Math.max(th, tv) + Math.min(th, tv) / 2;
};

export class Router {
  private nodes: Node[] = [];
  private grid = new Map<string, number[]>(); // indice spaziale, celle da 50 m
  private cell = 50;

  constructor(private t: Terrain, data: WorldData) {
    const key = new Map<string, number>();
    const node = (x: number, z: number) => {
      const k = `${Math.round(x)},${Math.round(z)}`;
      let i = key.get(k);
      if (i === undefined) {
        i = this.nodes.length;
        this.nodes.push({ x, z, h: t.heightAt(x * S, z * S) / S, edges: [] });
        key.set(k, i);
        const g = `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
        (this.grid.get(g) ?? this.grid.set(g, []).get(g)!).push(i);
      }
      return i;
    };
    const link = (a: number, b: number) => {
      if (a === b) return;
      const A = this.nodes[a], B = this.nodes[b];
      const d = Math.hypot(A.x - B.x, A.z - B.z);
      A.edges.push({ to: b, cost: cai(d, B.h - A.h) });
      B.edges.push({ to: a, cost: cai(d, A.h - B.h) });
    };
    const ends: number[] = [];
    for (const p of data.paths) {
      // infittisce ogni 25 m: il dislivello di ogni tratto è più giusto
      let prev = -1;
      for (let i = 0; i < p.pts.length; i++) {
        const [x, z] = p.pts[i];
        if (i > 0) {
          const [px, pz] = p.pts[i - 1];
          const n = Math.floor(Math.hypot(x - px, z - pz) / 25);
          for (let k = 1; k <= n; k++) {
            const m = node(px + ((x - px) * k) / (n + 1), pz + ((z - pz) * k) / (n + 1));
            link(prev, m);
            prev = m;
          }
        }
        const cur = node(x, z);
        if (prev >= 0) link(prev, cur);
        prev = cur;
        if (i === 0 || i === p.pts.length - 1) ends.push(cur);
      }
    }
    // piccoli buchi nella mappa: le estremità a meno di 15 m da un altro punto si collegano
    for (const e of ends) {
      const n = this.nearest(this.nodes[e].x, this.nodes[e].z, 15, e);
      if (n >= 0 && !this.nodes[e].edges.some((x) => x.to === n)) link(e, n);
    }
  }

  /** il punto del grafo più vicino (in metri), entro `max` */
  private nearest(x: number, z: number, max: number, skip = -1) {
    let best = -1, bd = max;
    const r = Math.ceil(max / this.cell);
    const gx = Math.floor(x / this.cell), gz = Math.floor(z / this.cell);
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++)
        for (const n of this.grid.get(`${gx + i},${gz + j}`) ?? []) {
          if (n === skip) continue;
          const d = Math.hypot(this.nodes[n].x - x, this.nodes[n].z - z);
          if (d < bd) (bd = d), (best = n);
        }
    return best;
  }

  /** strada da `from` a `to` (unità di gioco); null se non c'è un sentiero vicino */
  route(from: THREE.Vector3, to: THREE.Vector3) {
    const fx = from.x / S, fz = from.z / S, tx = to.x / S, tz = to.z / S;
    const a = this.nearest(fx, fz, 600), b = this.nearest(tx, tz, 400);
    if (a < 0 || b < 0) return null;
    const N = this.nodes.length;
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    // coda di priorità (heap binario)
    const heap: [number, number][] = [];
    const push = (d: number, n: number) => {
      heap.push([d, n]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    dist[a] = 0;
    push(0, a);
    while (heap.length) {
      const [d, n] = pop();
      if (d > dist[n]) continue;
      if (n === b) break;
      for (const e of this.nodes[n].edges) {
        const nd = d + e.cost;
        if (nd < dist[e.to]) (dist[e.to] = nd), (prev[e.to] = n), push(nd, e.to);
      }
    }
    if (!isFinite(dist[b])) return null;
    const ids: number[] = [];
    for (let n = b; n >= 0; n = prev[n]) ids.push(n);
    ids.reverse();
    const A = this.nodes[a], B = this.nodes[b];
    // tratti fuori sentiero all'inizio e alla fine (in linea d'aria)
    const off = cai(Math.hypot(A.x - fx, A.z - fz), A.h - from.y / S) + cai(Math.hypot(tx - B.x, tz - B.z), to.y / S - B.h);
    // tempo da mostrare: come sui cartelli, su distanza e dislivello totali (il profilo è filtrato: i saliscendi di pochi
    // metri del modello del terreno non contano), non sulla somma tratto per tratto che serve solo a scegliere la strada
    let km = 0, up = 0, down = 0, ref = A.h;
    for (let i = 1; i < ids.length; i++) {
      const n = this.nodes[ids[i]];
      km += Math.hypot(n.x - this.nodes[ids[i - 1]].x, n.z - this.nodes[ids[i - 1]].z) / 1000;
      if (n.h - ref > 15) (up += n.h - ref), (ref = n.h);
      else if (ref - n.h > 15) (down += ref - n.h), (ref = n.h);
    }
    const th = km / 4, tv = up / 300 + down / 500;
    const hours = Math.max(th, tv) + Math.min(th, tv) / 2 + off;
    const pts = [from.clone(), ...ids.map((n) => new THREE.Vector3(this.nodes[n].x * S, 0, this.nodes[n].z * S)), to.clone()];
    pts.forEach((p) => (p.y = this.t.heightAt(p.x, p.z)));
    // i bivi lungo la strada (dove si incontrano tre o più sentieri) e da che parte andare: le indicazioni "man mano".
    // La direzione si misura su ~75 m prima e dopo il bivio, per non farsi ingannare dalle piccole curve.
    const turns: Turn[] = [];
    for (let k = 1; k < ids.length - 1; k++) {
      if (this.nodes[ids[k]].edges.length < 3) continue;
      const a = this.nodes[ids[Math.max(0, k - 3)]], n = this.nodes[ids[k]], c = this.nodes[ids[Math.min(ids.length - 1, k + 3)]];
      const ix = n.x - a.x, iz = n.z - a.z;
      // angolo (gradi) di una direzione rispetto a quella di arrivo: positivo = a destra (x verso est, z verso sud)
      const turn = (ox: number, oz: number) => THREE.MathUtils.radToDeg(Math.atan2(ix * oz - iz * ox, ix * ox + iz * oz));
      const deg = turn(c.x - n.x, c.z - n.z);
      // gli altri sentieri che partono dal bivio
      const others = this.nodes[ids[k]].edges.filter((e) => e.to !== ids[k - 1] && e.to !== ids[k + 1]).map((e) => turn(this.nodes[e.to].x - n.x, this.nodes[e.to].z - n.z));
      // si tace solo se la strada è chiaramente la più dritta (20° meglio di ogni altro sentiero) e nessun altro va quasi
      // nella stessa direzione; a un bivio a T, dove nessuna prosegue dritta, si dice sempre da che parte andare
      const others0 = Math.min(Infinity, ...others.map(Math.abs));
      if (Math.abs(deg) + 20 < others0 && !others.some((o) => Math.abs(o - deg) < 35)) continue;
      // bivi vicini tra loro (meno di 40 m) contano come uno
      if (turns.length && k + 1 - turns[turns.length - 1].i < 2) continue;
      turns.push({ i: k + 1, side: Math.abs(deg) < 25 ? "dritto" : deg > 0 ? "destra" : "sinistra", up: c.h - n.h });
    }
    return { pts, hours, km, turns };
  }
}

/** la strada accesa sul terreno: un nastro arancio che pulsa, appena sopra il sentiero */
export class RouteView {
  readonly group = new THREE.Group();
  private mat = new THREE.MeshBasicMaterial({ color: "#ffb08a", transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  constructor(private t: Terrain) {}
  show(pts: THREE.Vector3[] | null) {
    this.group.clear();
    if (!pts || pts.length < 2) return;
    const P: number[] = [], I: number[] = [];
    // infittisce ogni 3 unità per seguire bene il terreno
    const dense: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const n = Math.max(1, Math.ceil(pts[i].distanceTo(pts[i + 1]) / 3));
      for (let k = 0; k < n; k++) dense.push(pts[i].clone().lerp(pts[i + 1], k / n));
    }
    dense.push(pts[pts.length - 1]);
    dense.forEach((p, i) => {
      const q = dense[Math.min(dense.length - 1, i + 1)], o = dense[Math.max(0, i - 1)];
      const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * 0.9, nz = (dx / l) * 0.9;
      for (const s of [1, -1]) P.push(p.x + nx * s, this.t.heightAt(p.x + nx * s, p.z + nz * s) + 0.55, p.z + nz * s);
      if (i < dense.length - 1) {
        const v = i * 2;
        I.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
    const m = new THREE.Mesh(g, this.mat);
    m.renderOrder = 2;
    this.group.add(m);
  }
  update(time: number) {
    this.mat.opacity = 0.65 + Math.sin(time * 3) * 0.2;
  }
}
