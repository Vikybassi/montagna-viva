import * as THREE from "three";
import { GLACIER_COLOR, S, type Cover, type Terrain } from "./world";

/**
 * Il ghiacciaio nel tempo, con un modello volutamente semplice (e dichiarato come tale nel gioco): si sposta la linea
 * di equilibrio, cioè la quota sopra cui la neve si accumula e diventa ghiaccio. Più è bassa (clima freddo), più il
 * ghiaccio si allarga dai ghiacciai di oggi e scende a valle con le lingue; più è alta (clima caldo), più si ritira.
 * Il punto di partenza sono i ghiacciai di OpenStreetMap ("oggi"); gli altri anni sono una simulazione, non mappe storiche.
 */
export type Year = 1850 | 1950 | 2025 | 2050;
const ELA_NOW = 3000;
const SHIFT: Record<Year, number> = { 1850: -330, 1950: -170, 2025: 0, 2050: 220 };

export class GlacierTime {
  year: Year = 2025;
  private base: Float32Array;
  private cur: Float32Array;
  private from: Float32Array;
  private to: Float32Array;
  private k = 1;
  private cache = new Map<Year, Float32Array>();
  private glacierColor = GLACIER_COLOR;

  constructor(private t: Terrain, cover: Cover, private mesh: THREE.Mesh) {
    const { cols, rows } = t.meta;
    this.base = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.base[r * cols + c] = cover.at(cover.glacier, c * t.cell, r * t.cell);
    this.cur = this.base.slice();
    this.from = this.base.slice();
    this.to = this.base;
  }

  private model(year: Year) {
    const hit = this.cache.get(year);
    if (hit) return hit;
    const { t, base } = this;
    const { cols, rows } = t.meta;
    const ela = ELA_NOW + SHIFT[year];
    const ice = new Float32Array(cols * rows);
    const H = (i: number) => t.h[i];
    const slope = (i: number) => t.slopeAt((i % cols) * t.cell, Math.floor(i / cols) * t.cell);
    if (SHIFT[year] > 0) {
      // ritiro: resta solo il ghiaccio abbastanza in alto, e più sottile
      for (let i = 0; i < ice.length; i++) ice[i] = base[i] * THREE.MathUtils.smoothstep(H(i), ela - 330, ela - 170) * 0.9;
    } else if (SHIFT[year] === 0) {
      ice.set(base);
    } else {
      // avanzata: 1) zona di accumulo vicino ai ghiacciai di oggi, sopra la linea di equilibrio
      const dist = new Int32Array(cols * rows).fill(-1);
      const q: number[] = [];
      for (let i = 0; i < ice.length; i++) if (base[i] > 0.5) (dist[i] = 0), q.push(i), (ice[i] = 1);
      for (let head = 0; head < q.length; head++) {
        const i = q[head], c = i % cols, r = (i / cols) | 0;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const n = nr * cols + nc;
          if (dist[n] >= 0) continue;
          const up = H(n) >= ela && slope(n) < 46 && dist[i] < 30;
          // 2) le lingue: il ghiaccio scende lungo la massima pendenza fino a ~350 m sotto la linea di equilibrio
          const tongue = H(n) <= H(i) + 4 && H(n) >= ela - 350 && slope(n) < 38 && dist[i] < 70;
          if (up || tongue) {
            dist[n] = dist[i] + 1;
            ice[n] = 1;
            q.push(n);
          }
        }
      }
      // bordi morbidi
      const soft = ice.slice();
      for (let r = 1; r < rows - 1; r++)
        for (let c = 1; c < cols - 1; c++) {
          const i = r * cols + c;
          soft[i] = (ice[i] * 4 + ice[i - 1] + ice[i + 1] + ice[i - cols] + ice[i + cols]) / 8;
        }
      ice.set(soft);
      for (let i = 0; i < ice.length; i++) ice[i] = Math.max(ice[i], base[i]);
    }
    this.cache.set(year, ice);
    return ice;
  }

  /**
   * Il centro del ghiaccio di un anno, dalla parte di chi guarda: le celle con ghiaccio entro `radius` da `peak` e sul
   * versante rivolto verso `from` (il Disgrazia ha ghiacciai anche dall'altra parte, che da qui non si vedono).
   */
  center(year: Year, peak: THREE.Vector3, from: THREE.Vector3, radius: number) {
    const ice = this.model(year), { cols } = this.t.meta, cell = this.t.cell;
    const fx = from.x - peak.x, fz = from.z - peak.z;
    const out = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < ice.length; i++) {
      if (ice[i] < 0.5) continue;
      const x = (i % cols) * cell, z = Math.floor(i / cols) * cell;
      const dx = x - peak.x, dz = z - peak.z;
      if (dx * dx + dz * dz > radius * radius || dx * fx + dz * fz < 0) continue;
      out.x += x;
      out.y += this.t.h[i] * S;
      out.z += z;
      n++;
    }
    return n ? out.divideScalar(n) : peak.clone();
  }

  setYear(year: Year) {
    if (year === this.year) return;
    this.year = year;
    this.from = this.cur.slice();
    this.to = this.model(year);
    this.k = 0;
  }

  /** transizione morbida (circa 2 secondi) tra un anno e l'altro */
  update(dt: number) {
    if (this.k >= 1) return;
    this.k = Math.min(1, this.k + dt / 2);
    const e = this.k * this.k * (3 - 2 * this.k);
    const g = this.mesh.geometry, col = g.attributes.color as THREE.BufferAttribute, bare = this.mesh.userData.bare as Float32Array;
    const arr = col.array as Float32Array, gc = this.glacierColor;
    for (let i = 0; i < this.cur.length; i++) {
      const v = this.from[i] + (this.to[i] - this.from[i]) * e;
      if (v === this.cur[i] && this.k < 1) continue;
      this.cur[i] = v;
      const f = v * 0.92;
      arr[i * 3] = bare[i * 3] + (gc.r - bare[i * 3]) * f;
      arr[i * 3 + 1] = bare[i * 3 + 1] + (gc.g - bare[i * 3 + 1]) * f;
      arr[i * 3 + 2] = bare[i * 3 + 2] + (gc.b - bare[i * 3 + 2]) * f;
    }
    col.needsUpdate = true;
  }
}
