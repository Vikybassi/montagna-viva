import * as THREE from "three";
import type { Box, Circle } from "./collide";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Il mondo: la Val Masino vera (terreno Copernicus a 40 m) in scala ridotta, con boschi, ghiacciai, laghi, torrenti,
 * sentieri, rifugi e paesi da OpenStreetMap. Unità del gioco = metri × S (la valle è "compressa" per camminarla in
 * pochi minuti; le proporzioni tra quote e distanze restano quelle vere).
 */
export const S = 0.3;

export type Meta = { cols: number; rows: number; step: number; widthM: number; heightM: number; min: number; max: number };
type Pt = [number, number];
export type Place = { name: string; kind: "rifugio" | "bivacco" | "paese" | "alpeggio"; ele: number | null; p: Pt };
export type Peak = { name: string; ele: number | null; p: Pt; cross?: boolean };
export type WorldData = {
  size: Pt;
  huts: Place[];
  peaks: Peak[];
  views: { name: string | null; p: Pt }[];
  remenno: Pt | null;
  paths: { k: "p" | "t" | "a" | "r"; pts: Pt[] }[];
  streams: { r: 0 | 1; pts: Pt[] }[];
  cover: { water: Pt[][]; glacier: Pt[][]; forest: Pt[][] };
};

export class Terrain {
  readonly cell: number; // lato di una cella in unità di gioco
  readonly width: number;
  readonly depth: number;
  constructor(
    readonly meta: Meta,
    readonly h: Uint16Array,
  ) {
    this.cell = meta.step * S;
    this.width = (meta.cols - 1) * this.cell;
    this.depth = (meta.rows - 1) * this.cell;
  }
  /** quota in metri di un vertice della griglia */
  hm(c: number, r: number) {
    const { cols, rows } = this.meta;
    return this.h[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
  }
  /** altezza (unità di gioco) esattamente sui triangoli della mesh, così i piedi poggiano sul terreno disegnato */
  heightAt(x: number, z: number) {
    const fx = Math.min(this.meta.cols - 1.0001, Math.max(0, x / this.cell));
    const fz = Math.min(this.meta.rows - 1.0001, Math.max(0, z / this.cell));
    const c = Math.floor(fx), r = Math.floor(fz), u = fx - c, v = fz - r;
    const ha = this.hm(c, r), hb = this.hm(c, r + 1), hc = this.hm(c + 1, r + 1), hd = this.hm(c + 1, r);
    const m = u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
    return m * S;
  }
  /** pendenza in gradi (dalla griglia) */
  slopeAt(x: number, z: number) {
    const e = this.cell;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
  }
  inside(x: number, z: number, margin = 0) {
    return x > margin && z > margin && x < this.width - margin && z < this.depth - margin;
  }
  /** laghi: livello dell'acqua (metri) per vertice della griglia, 0 dove non c'è acqua; e i contorni con il loro livello */
  water = new Float32Array(0);
  lakes: { poly: Pt[]; level: number }[] = [];
  /** quota della superficie dell'acqua (unità di gioco) se (x, z) è dentro un lago, altrimenti null */
  waterAt(x: number, z: number) {
    if (!this.water.length) return null;
    const c = Math.round(x / this.cell), r = Math.round(z / this.cell);
    if (c < 0 || r < 0 || c >= this.meta.cols || r >= this.meta.rows) return null;
    const lv = this.water[r * this.meta.cols + c];
    return lv > 0 ? lv * S : null;
  }
}

/**
 * I laghi veri: il modello del terreno sopra un lago non è piatto, e lo specchio d'acqua finirebbe sotto. Per ogni lago
 * il livello è la quota più bassa della riva (dove l'acqua uscirebbe); dentro, il fondo viene abbassato di qualche metro,
 * così la superficie piatta si vede tutta e si può anche entrare a nuotare.
 */
function carveLakes(t: Terrain, data: WorldData) {
  const { cols, rows, step } = t.meta;
  t.water = new Float32Array(cols * rows);
  const inside = (poly: Pt[], x: number, z: number) => {
    let inn = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inn = !inn;
    }
    return inn;
  };
  for (const poly of data.cover.water) {
    if (poly.length < 4) continue;
    // livello: la quota più bassa lungo la riva (campionata ogni 10 m)
    let level = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 10));
      for (let k = 0; k < n; k++) level = Math.min(level, t.heightAt(((ax + ((bx - ax) * k) / n) * S), ((az + ((bz - az) * k) / n) * S)) / S);
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of poly) (minX = Math.min(minX, x)), (maxX = Math.max(maxX, x)), (minZ = Math.min(minZ, z)), (maxZ = Math.max(maxZ, z));
    for (let r = Math.max(0, Math.floor(minZ / step)); r <= Math.min(rows - 1, Math.ceil(maxZ / step)); r++)
      for (let c = Math.max(0, Math.floor(minX / step)); c <= Math.min(cols - 1, Math.ceil(maxX / step)); c++) {
        if (!inside(poly, c * step, r * step)) continue;
        const i = r * cols + c;
        t.water[i] = level;
        t.h[i] = Math.min(t.h[i], Math.round(level - 3)); // il fondo: 3 m sotto il pelo dell'acqua
      }
    t.lakes.push({ poly, level });
  }
}

/** Maschere delle coperture (bosco, ghiacciaio, acqua) disegnate su canvas alla risoluzione della griglia × 2. */
export class Cover {
  readonly k = 2;
  readonly step: number;
  readonly w: number;
  readonly hgt: number;
  readonly forest: Uint8ClampedArray;
  readonly glacier: Uint8ClampedArray;
  readonly water: Uint8ClampedArray;
  constructor(meta: Meta, data: WorldData) {
    this.step = meta.step;
    this.w = (meta.cols - 1) * this.k + 1;
    this.hgt = (meta.rows - 1) * this.k + 1;
    const px = this.k / meta.step; // pixel per metro
    const draw = (polys: Pt[][]) => {
      const cv = document.createElement("canvas");
      cv.width = this.w;
      cv.height = this.hgt;
      const g = cv.getContext("2d", { willReadFrequently: true })!;
      g.fillStyle = "#fff";
      for (const poly of polys) {
        g.beginPath();
        poly.forEach(([x, z], i) => (i ? g.lineTo(x * px, z * px) : g.moveTo(x * px, z * px)));
        g.closePath();
        g.fill();
      }
      const d = g.getImageData(0, 0, this.w, this.hgt).data;
      const out = new Uint8ClampedArray(this.w * this.hgt);
      for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3];
      return out;
    };
    this.forest = draw(data.cover.forest);
    this.glacier = draw(data.cover.glacier);
    this.water = draw(data.cover.water);
  }
  /** valore 0..1 di una maschera nel punto (x, z) in unità di gioco */
  at(mask: Uint8ClampedArray, x: number, z: number) {
    const c = Math.round((x / S / this.step) * this.k), r = Math.round((z / S / this.step) * this.k);
    if (c < 0 || r < 0 || c >= this.w || r >= this.hgt) return 0;
    return mask[r * this.w + c] / 255;
  }
}

// colori: pascoli caldi, boschi profondi, roccia rosata, neve e ghiaccio azzurrini (tavolozza del portfolio)
// colori pastello, un po' più freschi (tappa grafica, ispirata a Coastal World): prati vivi, rocce lilla tenue
const C = {
  meadow: new THREE.Color("#86c95a"),
  meadowLight: new THREE.Color("#a6d86a"),
  meadowCool: new THREE.Color("#6cbd66"),
  meadowHigh: new THREE.Color("#cdbf78"),
  meadowHighGreen: new THREE.Color("#93bd6b"),
  forest: new THREE.Color("#5c9a4c"),
  rock: new THREE.Color("#928899"),
  rockDark: new THREE.Color("#71687c"),
  scree: new THREE.Color("#a99a96"),
  snow: new THREE.Color("#eef2f6"),
  glacier: new THREE.Color("#d9e9f2"),
  water: new THREE.Color("#3f7e93"),
  village: new THREE.Color("#a7a37a"),
};

/** il pascolo alto: a macchie, tra il dorato dell'erba secca e il verde */
const highTmp = new THREE.Color();
const highMeadow = (patch: number) => highTmp.copy(C.meadowHigh).lerp(C.meadowHighGreen, THREE.MathUtils.clamp(0.5 + patch * 0.9, 0, 1));

export function buildTerrainMesh(t: Terrain, cover: Cover) {
  const { cols, rows } = t.meta;
  const pos = new Float32Array(cols * rows * 3);
  const col = new Float32Array(cols * rows * 3);
  const bare = new Float32Array(cols * rows * 3);
  const tmp = new THREE.Color();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * t.cell, z = r * t.cell, m = t.hm(c, r);
      pos[i * 3] = x;
      pos[i * 3 + 1] = m * S;
      pos[i * 3 + 2] = z;
      const slope = t.slopeAt(x, z);
      const forest = cover.at(cover.forest, x, z), glacier = cover.at(cover.glacier, x, z), water = cover.at(cover.water, x, z);
      // base: dal pascolo di fondovalle al pascolo alto, con grandi macchie di colore (prati più verdi, più gialli o
      // più freschi: un pascolo vero non è mai di un colore solo)
      const patch = THREE.MathUtils.clamp(Math.sin(x * 0.021 + Math.sin(z * 0.013) * 2.1) * Math.sin(z * 0.017 + Math.sin(x * 0.011) * 1.7) + 0.35 * Math.sin(x * 0.06 + Math.sin(z * 0.05) * 1.3) * Math.sin(z * 0.055 + x * 0.015), -1, 1);
      const high = THREE.MathUtils.smoothstep(m, 1500, 2300);
      tmp.copy(C.meadow).lerp(patch > 0 ? C.meadowLight : C.meadowCool, Math.abs(patch) * 0.7);
      tmp.lerp(highMeadow(patch), high);
      // roccia dove è ripido o molto in alto
      const rocky = Math.max(THREE.MathUtils.smoothstep(slope, 30, 42), THREE.MathUtils.smoothstep(m, 2350, 2700));
      tmp.lerp(m > 2600 ? C.rock : C.rockDark, rocky);
      if (m > 2200 && slope < 30) tmp.lerp(C.scree, 0.25);
      tmp.lerp(C.forest, forest * (1 - rocky * 0.6));
      // neve sulle cime poco ripide, ghiacciai dove li segna OSM
      tmp.lerp(C.snow, THREE.MathUtils.smoothstep(m, 2950, 3250) * (1 - THREE.MathUtils.smoothstep(slope, 38, 50)));
      tmp.lerp(C.water, water);
      // piccola variazione, per non avere campiture piatte
      const n = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
      tmp.offsetHSL(0, 0, ((n - Math.floor(n)) - 0.5) * (0.035 + rocky * 0.07)); // sulle rocce più variazione
      // colore "senza ghiaccio" (serve al ghiacciaio nel tempo), poi il ghiaccio di oggi
      bare[i * 3] = tmp.r;
      bare[i * 3 + 1] = tmp.g;
      bare[i * 3 + 2] = tmp.b;
      tmp.lerp(C.glacier, glacier * 0.92);
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
    }
  const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = (r + 1) * cols + c, cc = b + 1, d = a + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = d;
      idx[k++] = b; idx[k++] = cc; idx[k++] = d;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  // prato morbido (niente triangoli in vista): sfumature lisce come in un cartone; le rocce restano scolpite dai colori
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.userData.bare = bare;
  return mesh;
}

export const GLACIER_COLOR = C.glacier;

/**
 * Oltre il bordo della mappa: le montagne continuano (inventate, sfumate nella foschia), così ai confini non si vede il
 * vuoto ma altre creste, come in Valtellina. Quattro fasce intorno al rettangolo: all'attacco hanno la quota vera del
 * bordo, poi salgono verso creste di 2000–3200 m.
 */
export function buildSkirt(t: Terrain) {
  const W = t.width, D = t.depth, step = t.cell * 2;
  const outs = [0, 25, 60, 110, 180, 270, 390, 540, 730, 970, 1270, 1650, 2100, 2700, 3400];
  const P: number[] = [], Cl: number[] = [], I: number[] = [];
  const tmp = new THREE.Color();
  // creste inventate: onde lunghe che si incrociano, sempre uguali (niente caso)
  const ridge = (x: number, z: number) => {
    const a = Math.sin(x * 0.0021 + Math.sin(z * 0.0013) * 2) * Math.cos(z * 0.0017 - Math.sin(x * 0.0009) * 1.6);
    const b = Math.sin(x * 0.0063 + z * 0.0041) * 0.35;
    return 2350 + (a + b) * 700; // metri
  };
  const strip = (edge: (u: number) => [number, number], out: [number, number], len: number) => {
    const n = Math.ceil(len / step) + Math.ceil(2 * outs[outs.length - 1] / step);
    const u0 = -outs[outs.length - 1];
    const base = P.length / 3;
    for (let i = 0; i <= n; i++) {
      const u = u0 + i * step;
      const [ex, ez] = edge(Math.max(0, Math.min(len, u)));
      const sx = edge(u)[0] - ex, sz = edge(u)[1] - ez; // oltre gli angoli si prosegue di lato
      const h0 = t.heightAt(ex, ez) / S;
      for (const d of outs) {
        const x = ex + sx + out[0] * d, z = ez + sz + out[1] * d;
        const k = THREE.MathUtils.smoothstep(d, 60, 1600);
        const m = h0 * (1 - k) + ridge(x, z) * k;
        P.push(x, m * S, z);
        tmp.copy(C.meadow).lerp(C.meadowHigh, THREE.MathUtils.smoothstep(m, 1500, 2200));
        tmp.lerp(C.rockDark, THREE.MathUtils.smoothstep(m, 2100, 2500)).lerp(C.rock, THREE.MathUtils.smoothstep(m, 2500, 2800));
        tmp.lerp(C.snow, THREE.MathUtils.smoothstep(m, 2900, 3150));
        Cl.push(tmp.r, tmp.g, tmp.b);
      }
    }
    const R = outs.length;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < R - 1; j++) {
        const a = base + i * R + j, b = base + (i + 1) * R + j;
        I.push(a, b, a + 1, b, b + 1, a + 1);
      }
  };
  strip((u) => [u, 0], [0, -1], W); // nord
  strip((u) => [u, D], [0, 1], W); // sud
  strip((u) => [0, u], [-1, 0], D); // ovest
  strip((u) => [W, u], [1, 0], D); // est
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(Cl, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  return mesh;
}

/** quanto sei lontana dal bordo della mappa (unità di gioco) */
export const edgeDistance = (t: Terrain, x: number, z: number) => Math.min(x, z, t.width - x, t.depth - z);

/** Nastro che segue il terreno lungo una linea (sentieri, torrenti). */
function ribbon(t: Terrain, lines: Pt[][], width: number | ((x: number, z: number) => number), lift: number, color: THREE.Color | ((x: number, z: number, out: THREE.Color) => THREE.Color), every = 4) {
  const wAt = typeof width === "number" ? () => width : width;
  const cAt = typeof color === "function" ? color : null, tmpC = new THREE.Color();
  const P: number[] = [], I: number[] = [], Cl: number[] = [];
  for (const raw of lines) {
    // via i punti troppo vicini (meno di 2,5 unità): nei tornantini fitti il nastro faceva una scaletta
    const line: Pt[] = [];
    for (const q of raw) {
      const l = line[line.length - 1];
      if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) * S >= 2.5) line.push(q);
    }
    if (raw.length > 1 && line.length < 2) line.push(raw[raw.length - 1]);
    // infittisce in unità di gioco
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < line.length - 1; i++) {
      const a = new THREE.Vector2(line[i][0] * S, line[i][1] * S), b = new THREE.Vector2(line[i + 1][0] * S, line[i + 1][1] * S);
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / every));
      for (let j = 0; j < n; j++) pts.push(a.clone().lerp(b, j / n));
    }
    const last = line[line.length - 1];
    pts.push(new THREE.Vector2(last[0] * S, last[1] * S));
    if (pts.length < 2) continue;
    const base = P.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      const dir = q.clone().sub(o).normalize();
      const wd = wAt(p.x, p.y);
      const nx = -dir.y * wd * 0.5, nz = dir.x * wd * 0.5;
      if (cAt) cAt(p.x, p.y, tmpC);
      for (const s of [1, -1]) {
        const x = p.x + nx * s, z = p.y + nz * s;
        P.push(x, t.heightAt(x, z) + lift, z);
        if (cAt) Cl.push(tmpC.r, tmpC.g, tmpC.b);
      }
      if (i < pts.length - 1) {
        const v = base + i * 2;
        I.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  }
  // tutti i triangoli con la faccia verso l'alto: il verso dipende da come è disegnata la linea nei dati (prima metà
  // dei sentieri, quelli disegnati "al contrario", non si vedeva)
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const cross = (P[b + 2] - P[a + 2]) * (P[c] - P[a]) - (P[b] - P[a]) * (P[c + 2] - P[a + 2]);
    if (cross < 0) [I[i + 1], I[i + 2]] = [I[i + 2], I[i + 1]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  if (cAt) g.setAttribute("color", new THREE.Float32BufferAttribute(Cl, 3));
  // normali verso l'alto: il nastro prende la luce come il prato sotto (calcolate dai triangoli, metà sarebbero rovesciate)
  const up = new Float32Array(P.length);
  for (let i = 1; i < up.length; i += 3) up[i] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(up, 3));
  const m = new THREE.MeshStandardMaterial({ color: cAt ? "#ffffff" : (color as THREE.Color), vertexColors: !!cAt, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Sentieri, mulattiere e strade come in un cartone: chiari, con un bordo morbido verso il prato (un nastro più largo e
 * più verde sotto), più larghi vicino ai paesi. Restituisce anche `near`: quanto sei lontana dal bordo del sentiero più
 * vicino (serve a non far crescere erba e cespugli sopra).
 */
export function buildTrails(t: Terrain, data: WorldData, cover: Cover) {
  const group = new THREE.Group();
  const villages = data.huts.filter((h) => h.kind === "paese").map((h) => [h.p[0] * S, h.p[1] * S] as const);
  // vicino a un paese (entro 160 unità) i sentieri si allargano piano piano
  const town = (x: number, z: number) => {
    let d = Infinity;
    for (const [vx, vz] of villages) d = Math.min(d, Math.hypot(vx - x, vz - z));
    return 1 - THREE.MathUtils.smoothstep(d, 40, 160);
  };
  // nel bosco i sentieri e le strade forestali sono terra battuta: stretti, scuri, quasi nascosti dagli alberi (come in
  // Val Masino, dove dal fondovalle non si vedono). Fuori dal bosco restano chiari; l'asfalto solo nei prati e in paese.
  const KIND = {
    p: { w: 1.7, wt: 2.6, c: "#e6d6ae", e: "#bdd08a", cf: "#9b8462", ef: "#6a9a4e" },
    a: { w: 1.7, wt: 2.6, c: "#e6d6ae", e: "#bdd08a", cf: "#9b8462", ef: "#6a9a4e" },
    t: { w: 2.4, wt: 3.2, c: "#ddcca4", e: "#b9cc86", cf: "#97805f", ef: "#679750" },
    r: { w: 3.0, wt: 3.6, c: "#b9b6bd", e: "#a9b98e", cf: "#9a8462", ef: "#669650" },
  } as const;
  const woods = (x: number, z: number) => THREE.MathUtils.smoothstep(cover.at(cover.forest, x, z), 0.25, 0.6) * (1 - town(x, z));
  const lines = { p: [] as Pt[][], a: [] as Pt[][], t: [] as Pt[][], r: [] as Pt[][] };
  for (const p of data.paths) lines[p.k].push(p.pts);
  for (const k of ["r", "t", "p", "a"] as const) {
    const K = KIND[k];
    const width = (x: number, z: number) => THREE.MathUtils.lerp(K.w, K.wt, town(x, z)) * (1 - 0.35 * woods(x, z));
    const c0 = new THREE.Color(K.c), c1 = new THREE.Color(K.cf), e0 = new THREE.Color(K.e), e1 = new THREE.Color(K.ef);
    group.add(ribbon(t, lines[k], (x, z) => width(x, z) + 1.1 * (1 - 0.5 * woods(x, z)), 0.3, (x, z, o) => o.copy(e0).lerp(e1, woods(x, z))));
    group.add(ribbon(t, lines[k], width, 0.36, (x, z, o) => o.copy(c0).lerp(c1, woods(x, z))));
  }
  // indice dei sentieri: punti ogni 2 unità con la loro mezza larghezza, in celle da 8 unità
  const CELL = 8, grid = new Map<number, number[]>();
  for (const k of ["r", "t", "p", "a"] as const)
    for (const line of lines[k])
      for (let i = 0; i < line.length - 1; i++) {
        const ax = line[i][0] * S, az = line[i][1] * S, bx = line[i + 1][0] * S, bz = line[i + 1][1] * S;
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
        for (let j = 0; j <= n; j++) {
          const x = ax + ((bx - ax) * j) / n, z = az + ((bz - az) * j) / n;
          const key = Math.floor(x / CELL) * 100003 + Math.floor(z / CELL);
          const hw = (THREE.MathUtils.lerp(KIND[k].w, KIND[k].wt, town(x, z)) + 1.1) / 2;
          (grid.get(key) ?? grid.set(key, []).get(key)!).push(x, z, hw);
        }
      }
  /** distanza dal bordo del sentiero più vicino (negativa se ci sei sopra); Infinity se non ce n'è uno vicino */
  const near = (x: number, z: number) => {
    let best = Infinity;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const a = grid.get((cx + i) * 100003 + cz + j);
        if (a) for (let k = 0; k < a.length; k += 3) best = Math.min(best, Math.hypot(a[k] - x, a[k + 1] - z) - a[k + 2]);
      }
    return best;
  };
  group.add(ribbon(t, data.streams.filter((s) => !s.r).map((s) => s.pts), 1.1, 0.25, new THREE.Color("#5f9db3")));
  group.add(ribbon(t, data.streams.filter((s) => s.r).map((s) => s.pts), 4, 0.3, new THREE.Color("#4f8fa6")));
  return { group, near };
}

/** Gli specchi d'acqua: piatti al livello del lago, con increspature animate, riflesso del cielo e un po' di trasparenza. */
export const waterUniforms = { uTime: { value: 0 }, uSky: { value: new THREE.Color("#cfe2ee") } };
export function buildLakes(t: Terrain) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#2f6f86", roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = waterUniforms.uTime;
    sh.uniforms.uSky = waterUniforms.uSky;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWaterPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWaterPos;\nuniform float uTime;\nuniform vec3 uSky;")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec2 p = vWaterPos.xz;
          float t = uTime;
          vec3 ripple = vec3(sin(p.x * 0.9 + t * 1.4) * 0.05 + sin(p.y * 1.7 - t * 1.1 + p.x * 0.3) * 0.035, 0.0, cos(p.y * 0.8 + t * 1.2) * 0.05 + sin(p.x * 1.3 + p.y * 0.6 + t * 0.9) * 0.03);
          normal = normalize(normal + (viewMatrix * vec4(ripple, 0.0)).xyz);
        }`,
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, clamp(fres * 0.75, 0.0, 0.75));`,
      );
  };
  mat.customProgramCacheKey = () => "water";
  for (const lake of t.lakes) {
    const shape = new THREE.Shape(lake.poly.map(([x, z]) => new THREE.Vector2(x * S, z * S)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2); // (x, y) → (x, 0, y)
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.y = lake.level * S + 0.05;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Alberi: conifere sopra i 1100 m, latifoglie sotto; uno per cella di bosco, con un po' di disordine. */
export function buildTrees(t: Terrain, cover: Cover, rng: () => number, skip?: (x: number, z: number) => boolean) {
  // conifera: coni a "gonnella" frastagliata (il bordo sale e scende a zig-zag), come negli alberi dei cartoni
  const conifer = new THREE.ConeGeometry(1, 1, 12, 1);
  {
    const p = conifer.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.getY(i) + 0.5) > 1e-4) continue; // solo il bordo in basso
      const a = Math.atan2(p.getZ(i), p.getX(i)), k = Math.round((a / (Math.PI * 2)) * 12) % 2 ? 1 : 0;
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (r < 1e-4) continue;
      p.setY(i, p.getY(i) + k * 0.14);
      p.setX(i, p.getX(i) * (1 + k * 0.06));
      p.setZ(i, p.getZ(i) * (1 + k * 0.06));
    }
    conifer.computeVertexNormals();
  }
  conifer.translate(0, 0.5, 0);
  // latifoglia: una chioma tonda e un po' bitorzoluta, morbida (non più un solido sfaccettato)
  const crown = new THREE.IcosahedronGeometry(1, 2);
  {
    const p = crown.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const bump = 1 + 0.09 * Math.sin(v.x * 5.1 + v.y * 2.3) * Math.cos(v.z * 4.7 - v.y * 1.9);
      p.setXYZ(i, v.x * bump, v.y * bump * 0.92, v.z * bump);
    }
    crown.deleteAttribute("normal");
    const merged = mergeVerticesSimple(crown);
    merged.computeVertexNormals();
    crown.copy(merged);
  }
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1, 5);
  trunk.translate(0, 0.5, 0);
  const spots: { x: number; z: number; y: number; s: number; m: number }[] = [];
  const step = t.cell * 0.75;
  for (let z = step; z < t.depth - step; z += step)
    for (let x = step; x < t.width - step; x += step) {
      const jx = x + (rng() - 0.5) * step, jz = z + (rng() - 0.5) * step;
      const f = cover.at(cover.forest, jx, jz);
      if (f < 0.5 || rng() > 0.85) continue;
      const slope = t.slopeAt(jx, jz);
      if (slope > 42 || skip?.(jx, jz)) continue;
      const y = t.heightAt(jx, jz), m = y / S;
      if (m > 2150) continue;
      spots.push({ x: jx, z: jz, y, s: 0.8 + rng() * 0.6, m });
    }
  // in ordine casuale: così la qualità grafica può diradare il bosco in modo uniforme (disegnando solo i primi N)
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const conifers = spots.filter((s) => s.m > 1100);
  const broad = spots.filter((s) => s.m <= 1100);
  const dummy = new THREE.Object3D();
  const group = new THREE.Group();
  // ogni albero ha la sua tinta: verdi diversi e, a metà settembre, qualche betulla e qualche larice che ingialliscono
  const tint = new THREE.Color();
  const mk = (geo: THREE.BufferGeometry, color: string, list: typeof spots, place: (s: (typeof spots)[0], o: THREE.Object3D) => void, palette?: string[], smooth = false) => {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: palette ? "#ffffff" : color, flatShading: !smooth, roughness: 0.9 }), list.length);
    list.forEach((s, i) => {
      place(s, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (palette) {
        // la scelta dipende dalla posizione: i pezzi dello stesso albero hanno lo stesso colore
        const h = Math.abs(Math.sin(s.x * 12.9898 + s.z * 78.233) * 43758.5453) % 1;
        mesh.setColorAt(i, tint.set(palette[Math.floor(h * palette.length)]));
      }
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  // conifera: tronco + due coni
  const conTrunks = mk(trunk, "#5b4636", conifers, (s, o) => (o.position.set(s.x, s.y - 0.2, s.z), o.rotation.set(0, 0, 0), o.scale.set(s.s * 1.6, s.s * 3, s.s * 1.6)));
  // abeti scuri e freschi, e qualche larice (che a settembre comincia a dorarsi)
  const CON = ["#2f8a52", "#36945a", "#3f9c58", "#2c8250", "#3a9554", "#55a24a", "#338c56", "#3d9852", "#2e8654", "#d6b23e"];
  const CON_TOP = ["#3c9e60", "#45a866", "#4fb062", "#38935a", "#4aa95e", "#66b556", "#41a25e", "#4dac5a", "#3b9a5c", "#e8c64c"];
  mk(conifer, "#2f5a3a", conifers, (s, o) => (o.position.set(s.x, s.y + s.s * 1.6, s.z), o.rotation.set(0, s.x, 0), o.scale.set(s.s * 2.6, s.s * 5.2, s.s * 2.6)), CON);
  mk(conifer, "#3a6a42", conifers, (s, o) => (o.position.set(s.x, s.y + s.s * 4.4, s.z), o.rotation.set(0, s.z, 0), o.scale.set(s.s * 1.8, s.s * 3.6, s.s * 1.8)), CON_TOP);
  // latifoglia: tronco + chioma tonda
  const broadTrunks = mk(trunk, "#6a5240", broad, (s, o) => (o.position.set(s.x, s.y - 0.2, s.z), o.rotation.set(0, 0, 0), o.scale.set(s.s * 1.8, s.s * 3.4, s.s * 1.8)));
  mk(crown, "#5f8a3e", broad, (s, o) => (o.position.set(s.x, s.y + s.s * 4.2, s.z), o.rotation.set(s.x, s.z, 0), o.scale.set(s.s * 2.8, s.s * 2.4, s.s * 2.8)), ["#6fbf4a", "#82c955", "#93d35c", "#62b347", "#a1d866", "#78c450", "#8bcc58", "#66b844", "#9ad662", "#7cc64e", "#f2c443", "#f0914a"], true);
  // i tronchi sono solidi, ma solo quelli disegnati (con la qualità bassa il bosco si dirada: count diminuisce)
  const solids: Circle[] = [
    ...conifers.map((s, i) => ({ kind: "circle" as const, x: s.x, z: s.z, r: 0.29 * s.s, y0: s.y - 0.5, y1: s.y + s.s * 3, live: () => i < conTrunks.count })),
    ...broad.map((s, i) => ({ kind: "circle" as const, x: s.x, z: s.z, r: 0.33 * s.s, y0: s.y - 0.5, y1: s.y + s.s * 3.4, live: () => i < broadTrunks.count })),
  ];
  return { group, count: spots.length, solids };
}

/** Rifugi, bivacchi e paesi: piccoli modelli fatti di forme semplici. */
/** la porta di un rifugio o di un bivacco: si apre quando entri a ripararti */
export type Door = { pivot: THREE.Object3D; front: THREE.Vector3; inside: THREE.Vector3 };

export function buildPlaces(t: Terrain, data: WorldData, rng: () => number) {
  const group = new THREE.Group();
  const doors = new Map<string, Door>();
  const doorM = new THREE.MeshStandardMaterial({ color: "#5a3a26", flatShading: true, roughness: 0.8 });
  const frameM = new THREE.MeshStandardMaterial({ color: "#3a2a20", flatShading: true });
  const knobM = new THREE.MeshStandardMaterial({ color: "#d9b44a", metalness: 0.6, roughness: 0.3 });
  /** una porta su una parete: `at` è il centro della soglia in coordinate del gruppo, la porta guarda verso `out` */
  const addDoor = (g: THREE.Group, at: THREE.Vector3, out: THREE.Vector3, w: number, h: number) => {
    const side = new THREE.Vector3(out.z, 0, -out.x); // verso il cardine
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.2, 0.08), frameM);
    frame.position.copy(at).addScaledVector(out, 0.02).setY(at.y + h / 2);
    frame.rotation.y = Math.atan2(out.x, out.z); // in coordinate del gruppo (lookAt userebbe quelle del mondo)
    const pivot = new THREE.Group();
    pivot.position.copy(at).addScaledVector(side, w / 2).addScaledVector(out, 0.08);
    pivot.rotation.y = Math.atan2(out.x, out.z);
    pivot.userData.base = pivot.rotation.y; // porta chiusa
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.09), doorM);
    leaf.position.set(-w / 2, h / 2, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), knobM);
    knob.position.set(-w + 0.18, h / 2, 0.08);
    pivot.add(leaf, knob);
    g.add(frame, pivot);
    return pivot;
  };
  const red = new THREE.MeshStandardMaterial({ color: "#c2375a", flatShading: true, roughness: 0.5, metalness: 0.3 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const solids: (Box | Circle)[] = [];
  // tetto a due falde: un triangolo estruso, largo 1, alto 1, profondo 1, con la base a y = 0
  const tri = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const roof = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false });
  roof.translate(0, 0, -0.5);
  // le case, come in un cartone ma della Val Masino: intonaco chiaro e zoccolo di pietra (o tutta pietra per i rifugi,
  // legno per baite e alpeggi), tetto grigio di piode, finestre con gli scuri, gerani rossi, porta di legno, camino.
  // Tutti i pezzi di tutte le case finiscono in un solo oggetto (una sola chiamata di disegno: il gioco resta leggero).
  const parts: THREE.BufferGeometry[] = [];
  const col = new THREE.Color(), mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
  /** un pezzo colorato: geometria `geo`, scala, posizione (nel sistema della casa `g`) e colore */
  const piece = (g: THREE.Object3D, geo: THREE.BufferGeometry, sx: number, sy: number, sz: number, px: number, py: number, pz: number, color: string) => {
    const gg = (geo.index ? geo.toNonIndexed() : geo.clone()).deleteAttribute("uv");
    mtx.compose(new THREE.Vector3(px, py, pz), q.identity(), new THREE.Vector3(sx, sy, sz));
    gg.applyMatrix4(mtx).applyMatrix4(g.matrixWorld);
    col.set(color);
    const n = gg.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) (c[i * 3] = col.r), (c[i * 3 + 1] = col.g), (c[i * 3 + 2] = col.b);
    gg.setAttribute("color", new THREE.BufferAttribute(c, 3));
    parts.push(gg);
  };
  const hash = (x: number, z: number) => Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
  const PLASTER = ["#f4ecd9", "#efe2c4", "#eaeef0", "#f3dcc6", "#e3ecdc", "#f6e7c9"];
  const SHUTTER = ["#3f7d4f", "#7a4b2a", "#3f6f8f", "#4f7a3c"];
  type Style = "casa" | "rifugio" | "baita";
  const house = (x: number, z: number, w: number, d: number, hgt: number, rot: number, style: Style = "casa", skipFront = false) => {
    const y = Math.min(t.heightAt(x - w / 2, z - d / 2), t.heightAt(x + w / 2, z + d / 2), t.heightAt(x, z));
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rot;
    group.add(g);
    g.updateMatrixWorld(true);
    const hh = hash(x, z);
    const wall = style === "rifugio" ? "#b9b0a5" : style === "baita" ? "#9a6b45" : PLASTER[Math.floor(hh * PLASTER.length)];
    const shutter = style === "rifugio" ? "#c2453a" : SHUTTER[Math.floor(hash(z, x) * SHUTTER.length)];
    // muri (fin sotto terra, per i pendii) e zoccolo di pietra
    piece(g, box, w, hgt + 2, d, 0, (hgt + 2) / 2 - 2, 0, wall);
    if (style === "casa") piece(g, box, w + 0.06, 2.8, d + 0.06, 0, -0.6, 0, "#b3aba0");
    // tetto di piode, con la gronda che sporge, e il camino
    piece(g, roof, w * 1.18, hgt * 0.6, d * 1.16, 0, hgt, 0, style === "baita" ? "#6b5a4e" : "#5f6670");
    piece(g, box, 0.45, 1.1, 0.45, w * 0.28, hgt + hgt * 0.42, -d * 0.15, "#8d867d");
    piece(g, box, 0.55, 0.12, 0.55, w * 0.28, hgt + hgt * 0.42 + 0.58, -d * 0.15, "#5f6670");
    // finestre sui lati lunghi: vetro, cornice bianca, scuri aperti, e i gerani sotto
    const n = Math.max(1, Math.floor(w / 1.7));
    for (const side of [1, -1]) {
      for (let i = 0; i < n; i++) {
        const wx = (i - (n - 1) / 2) * (w / n);
        if (side === 1 && Math.abs(wx) < 0.9 && (skipFront || style !== "baita")) continue; // lì c'è la porta
        const wy = hgt * 0.55, fz = side * (d / 2 + 0.02);
        piece(g, box, 0.78, 0.92, 0.05, wx, wy, fz, "#fbf7ef");
        piece(g, box, 0.56, 0.7, 0.06, wx, wy, fz + side * 0.01, "#3c5268");
        for (const sx of [-0.52, 0.52]) piece(g, box, 0.26, 0.9, 0.05, wx + sx, wy, fz + side * 0.015, shutter);
        if (style !== "baita" && hash(wx + x, side + z) > 0.35) {
          piece(g, box, 0.8, 0.16, 0.2, wx, wy - 0.56, fz + side * 0.1, "#7a4b2a");
          piece(g, box, 0.74, 0.14, 0.16, wx, wy - 0.43, fz + side * 0.1, "#e2453c");
          piece(g, box, 0.5, 0.08, 0.1, wx - 0.1, wy - 0.33, fz + side * 0.1, "#4f9a3c");
        }
      }
    }
    // una finestrella sui lati corti, in alto
    for (const side of [1, -1]) {
      const fx = side * (w / 2 + 0.02);
      piece(g, box, 0.05, 0.62, 0.62, fx, hgt * 0.7, 0, "#fbf7ef");
      piece(g, box, 0.06, 0.46, 0.46, fx + side * 0.01, hgt * 0.7, 0, "#3c5268");
    }
    // la porta di legno al centro della facciata (i rifugi hanno la loro, che si apre)
    if (!skipFront) {
      piece(g, box, 1.0, 1.75, 0.06, 0, 0.87, d / 2 + 0.02, "#fbf7ef");
      piece(g, box, 0.82, 1.62, 0.08, 0, 0.81, d / 2 + 0.03, style === "baita" ? "#5b3b24" : "#7a4b2a");
      piece(g, box, 1.3, 0.12, 0.8, 0, 0.0, d / 2 + 0.4, "#a39a8f"); // il gradino
    }
    // il tetto sporge un po': la scatola solida è la casa con il tetto (per la telecamera), i muri per chi cammina
    solids.push({ kind: "box", x, z, hw: w / 2, hd: d / 2, rot, y0: y - 2, y1: y + hgt * 1.6 });
    return g;
  };
  // ---------- il paese: piazza di ciottoli, vialetti, campanile, panchine, vasi di fiori, lampioni ----------
  /** un pezzo di terreno colorato che segue il pendio (piazza, vialetti): triangoli in coordinate del mondo */
  const groundTris = (pts: number[], colors: number[]) => {
    // ogni triangolo con la faccia verso l'alto (si vede solo il lato di sopra)
    for (let i = 0; i < pts.length; i += 9) {
      const ax = pts[i + 3] - pts[i], az = pts[i + 5] - pts[i + 2], bx = pts[i + 6] - pts[i], bz = pts[i + 8] - pts[i + 2];
      if (az * bx - ax * bz < 0) {
        for (let k = 0; k < 3; k++) [pts[i + 3 + k], pts[i + 6 + k]] = [pts[i + 6 + k], pts[i + 3 + k]];
        const c = i;
        for (let k = 0; k < 3; k++) [colors[c + 3 + k], colors[c + 6 + k]] = [colors[c + 6 + k], colors[c + 3 + k]];
      }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    gg.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    gg.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(pts.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    parts.push(gg);
  };
  const gy = (px: number, pz: number, lift: number) => t.heightAt(px, pz) + lift;
  const cobble = (px: number, pz: number, base: string) => {
    col.set(base).offsetHSL(0, 0, (hash(Math.round(px * 1.3), Math.round(pz * 1.3)) - 0.5) * 0.06);
    return [col.r, col.g, col.b];
  };
  const village = (cx: number, cz: number, doorsAt: THREE.Vector3[]) => {
    const R = 9;
    // la piazza: un disco di ciottoli che segue il terreno
    const P: number[] = [], C: number[] = [];
    const ring = (r: number, a: number) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r] as const;
    for (let ri = 0; ri < 6; ri++)
      for (let ai = 0; ai < 28; ai++) {
        const r0 = (ri / 6) * R, r1 = ((ri + 1) / 6) * R, a0 = (ai / 28) * Math.PI * 2, a1 = ((ai + 1) / 28) * Math.PI * 2;
        const q4 = [ring(r0, a0), ring(r1, a0), ring(r1, a1), ring(r0, a1)];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const [qx, qz] = q4[k];
          P.push(qx, gy(qx, qz, 0.07), qz);
          C.push(...cobble(qx, qz, "#d3cabb"));
        }
      }
    // i vialetti: dalla porta di ogni casa al bordo della piazza
    for (const d of doorsAt) {
      const dx = cx - d.x, dz = cz - d.z, len = Math.hypot(dx, dz) - R + 0.5;
      if (len <= 0) continue;
      const ux = dx / Math.hypot(dx, dz), uz = dz / Math.hypot(dx, dz), wx = -uz * 0.7, wz = ux * 0.7;
      const steps = Math.ceil(len / 0.9);
      for (let i = 0; i < steps; i++) {
        const t0 = (i / steps) * len, t1 = ((i + 1) / steps) * len;
        const a = [d.x + ux * t0, d.z + uz * t0], b = [d.x + ux * t1, d.z + uz * t1];
        const q4 = [[a[0] - wx, a[1] - wz], [b[0] - wx, b[1] - wz], [b[0] + wx, b[1] + wz], [a[0] + wx, a[1] + wz]];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const [qx, qz] = q4[k];
          P.push(qx, gy(qx, qz, 0.06), qz);
          C.push(...cobble(qx, qz, "#d9cfba"));
        }
      }
    }
    groundTris(P, C);
    const yc = t.heightAt(cx, cz);
    const at = (px: number, pz: number, ry = 0) => {
      const o = new THREE.Object3D();
      o.position.set(px, t.heightAt(px, pz), pz);
      o.rotation.y = ry;
      o.updateMatrixWorld(true);
      return o;
    };
    // il campanile: base di pietra, intonaco, la cella con le campane, il tetto di piode e la croce
    const tw = at(cx, cz);
    piece(tw, box, 2.4, 3, 2.4, 0, -0.5, 0, "#b3aba0");
    piece(tw, box, 2.2, 11, 2.2, 0, 6.5, 0, "#efe5d2");
    piece(tw, box, 2.3, 0.25, 2.3, 0, 9.3, 0, "#d9cdb6");
    for (const [ox, oz, sx, sz] of [[1.11, 0, 0.05, 0.7], [-1.11, 0, 0.05, 0.7], [0, 1.11, 0.7, 0.05], [0, -1.11, 0.7, 0.05]]) piece(tw, box, sx, 1.4, sz, ox, 10.4, oz, "#3b3540");
    piece(tw, box, 0.5, 0.5, 0.06, 0, 7.6, 1.12, "#fbf7ef"); // l'orologio
    piece(tw, new THREE.ConeGeometry(1.75, 3.2, 4), 1, 1, 1, 0, 13.6, 0, "#5f6670");
    piece(tw, box, 0.08, 0.8, 0.08, 0, 15.6, 0, "#d6b23e");
    piece(tw, box, 0.45, 0.08, 0.08, 0, 15.75, 0, "#d6b23e");
    solids.push({ kind: "box", x: cx, z: cz, hw: 1.2, hd: 1.2, rot: 0, y0: yc - 2, y1: yc + 15 });
    // panchine verso il campanile
    for (const a of [3.5, 4.3]) {
      const bx = cx + Math.cos(a) * 6.3, bz = cz + Math.sin(a) * 6.3, ry = Math.atan2(cx - bx, cz - bz);
      const o = at(bx, bz, ry);
      piece(o, box, 1.6, 0.08, 0.45, 0, 0.45, 0, "#8a5a36");
      piece(o, box, 1.6, 0.4, 0.07, 0, 0.75, -0.22, "#8a5a36");
      for (const lx of [-0.65, 0.65]) piece(o, box, 0.08, 0.45, 0.4, lx, 0.22, 0, "#4a4650");
      solids.push({ kind: "box", x: bx, z: bz, hw: 0.8, hd: 0.3, rot: ry, y0: o.position.y - 1, y1: o.position.y + 1 });
    }
    // vasi di fiori (gerani e margherite) e lampioni
    for (const [a, flower] of [[0.9, "#e2453c"], [2.3, "#f2f2f2"], [5.2, "#e2453c"], [1.6, "#f08ab4"]] as const) {
      const vx = cx + Math.cos(a) * 8.2, vz = cz + Math.sin(a) * 8.2;
      const o = at(vx, vz);
      piece(o, new THREE.CylinderGeometry(0.45, 0.35, 0.55, 10), 1, 1, 1, 0, 0.27, 0, "#b56b4a");
      piece(o, new THREE.IcosahedronGeometry(0.42, 1), 1, 0.55, 1, 0, 0.62, 0, "#4f9a3c");
      for (let k = 0; k < 5; k++) piece(o, new THREE.IcosahedronGeometry(0.11, 0), 1, 1, 1, Math.cos(k * 1.3) * 0.25, 0.8, Math.sin(k * 1.3) * 0.25, flower);
      solids.push({ kind: "circle", x: vx, z: vz, r: 0.45, y0: o.position.y - 1, y1: o.position.y + 1 });
    }
    for (const a of [1.2, 3.9, 5.7]) {
      const lx = cx + Math.cos(a) * 8.7, lz = cz + Math.sin(a) * 8.7;
      const o = at(lx, lz);
      piece(o, new THREE.CylinderGeometry(0.06, 0.09, 3.2, 6), 1, 1, 1, 0, 1.6, 0, "#3b3f4a");
      piece(o, box, 0.42, 0.42, 0.42, 0, 3.35, 0, "#fff0b8");
      piece(o, new THREE.ConeGeometry(0.36, 0.3, 4), 1, 1, 1, 0, 3.7, 0, "#3b3f4a");
      solids.push({ kind: "circle", x: lx, z: lz, r: 0.15, y0: o.position.y - 1, y1: o.position.y + 3 });
    }
  };
  /** registra la porta: dove stare per entrare (fuori) e dove si "sparisce" (dentro), in coordinate del mondo */
  const register = (name: string, g: THREE.Group, pivot: THREE.Object3D, at: THREE.Vector3, out: THREE.Vector3) => {
    g.updateMatrixWorld(true);
    const front = g.localToWorld(at.clone().addScaledVector(out, 2.2));
    front.y = t.heightAt(front.x, front.z);
    const inside = g.localToWorld(at.clone().addScaledVector(out, -1.2));
    doors.set(name, { pivot, front, inside });
  };
  for (const p of data.huts) {
    const x = p.p[0] * S, z = p.p[1] * S, rot = rng() * Math.PI;
    if (p.kind === "rifugio") {
      const g = house(x, z, 7, 4.5, 3.6, rot, "rifugio", true);
      // la porta d'ingresso, al centro della facciata
      const at = new THREE.Vector3(0, 0, 2.26), out = new THREE.Vector3(0, 0, 1);
      register(p.name, g, addDoor(g, at, out, 1.1, 2.1), at, out);
      house(x + 6 * Math.cos(rot), z - 6 * Math.sin(rot), 3, 3, 2.4, rot, "baita");
    } else if (p.kind === "bivacco") {
      // i bivacchi: botti di lamiera rossa, con una porticina su un lato
      const g = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 4, 10, 1, false, 0, Math.PI), red);
      barrel.rotation.set(0, 0, Math.PI / 2);
      barrel.castShadow = true;
      g.add(barrel);
      g.position.set(x, t.heightAt(x, z), z);
      g.rotation.y = rot;
      const at = new THREE.Vector3(2.02, 0, 0), out = new THREE.Vector3(1, 0, 0);
      register(p.name, g, addDoor(g, at, out, 0.8, 1.3), at, out);
      group.add(g);
      solids.push({ kind: "box", x, z, hw: 2, hd: 1.6, rot, y0: g.position.y - 1, y1: g.position.y + 1.6 });
    } else if (p.kind === "paese") {
      // un paese: case sparse attorno alla chiesa, mai una sopra l'altra (stessi numeri a caso di sempre, nello stesso ordine)
      const n = 6 + Math.floor(rng() * 4);
      const put: [number, number][] = [];
      const doorsAt: THREE.Vector3[] = [];
      for (let i = 0, tries = 0; i < n && tries < 80; tries++) {
        const a = rng() * Math.PI * 2, d = 8 + rng() * 34;
        const hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d;
        if (put.some(([px, pz]) => Math.hypot(px - hx, pz - hz) < 9)) continue;
        put.push([hx, hz]);
        const hw = 4 + rng() * 2.5, hd = 3.6 + rng() * 1.8, hh = 2.8 + rng() * 1.4, hr = rng() * Math.PI;
        house(hx, hz, hw, hd, hh, hr);
        // davanti alla porta, dove parte il vialetto
        const lz = hd / 2 + 0.9;
        doorsAt.push(new THREE.Vector3(hx + Math.sin(hr) * lz, 0, hz + Math.cos(hr) * lz));
        i++;
      }
      village(x, z, doorsAt);
    }
    if (false) {    } else if (!data.huts.some((v) => v.kind === "paese" && Math.hypot(v.p[0] * S - x, v.p[1] * S - z) < 14)) house(x, z, 4.5, 3.5, 2.6, rot, "baita"); // non in mezzo alla piazza di un paese
  }
  // il Sasso Remenno è in climb.ts (roccia chiusa, collisione e via d'arrampicata)
  // tutte le case in un solo oggetto
  if (parts.length) {
    const merged = mergeGeometries(parts);
    if (merged) {
      merged.computeVertexNormals();
      const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }));
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
  }
  return { group, doors, solids };
}

export async function loadWorld() {
  const [meta, buf, data] = await Promise.all([
    fetch("data/terrain.json").then((r) => r.json() as Promise<Meta>),
    fetch("data/terrain.bin").then((r) => r.arrayBuffer()),
    fetch("data/world.json").then((r) => r.json() as Promise<WorldData>),
  ]);
  const terrain = new Terrain(meta, new Uint16Array(buf));
  carveLakes(terrain, data);
  return { terrain, data };
}

/** unisce i vertici uguali (le sfere di three.js li duplicano): serve per normali morbide su forme deformate */
function mergeVerticesSimple(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const key = new Map<string, number>(), pos: number[] = [], idx: number[] = [];
  const src = g.index ? Array.from(g.index.array) : Array.from({ length: p.count }, (_, i) => i);
  for (const i of src) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let j = key.get(k);
    if (j === undefined) {
      j = pos.length / 3;
      key.set(k, j);
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}
