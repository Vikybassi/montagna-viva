import * as THREE from "three";

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
  meadow: new THREE.Color("#93c065"),
  meadowLight: new THREE.Color("#b3d277"),
  meadowCool: new THREE.Color("#78b06a"),
  meadowHigh: new THREE.Color("#cdbf78"),
  meadowHighGreen: new THREE.Color("#93bd6b"),
  forest: new THREE.Color("#4a7a45"),
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
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.userData.bare = bare;
  return mesh;
}

export const GLACIER_COLOR = C.glacier;

/** Nastro che segue il terreno lungo una linea (sentieri, torrenti). */
function ribbon(t: Terrain, lines: Pt[][], width: number, lift: number, color: THREE.Color, every = 4) {
  const P: number[] = [], I: number[] = [];
  for (const line of lines) {
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
      const nx = -dir.y * width * 0.5, nz = dir.x * width * 0.5;
      for (const s of [1, -1]) {
        const x = p.x + nx * s, z = p.y + nz * s;
        P.push(x, t.heightAt(x, z) + lift, z);
      }
      if (i < pts.length - 1) {
        const v = base + i * 2;
        I.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  // normali verso l'alto: il nastro prende la luce come il prato sotto (calcolate dai triangoli, metà sarebbero rovesciate)
  const up = new Float32Array(P.length);
  for (let i = 1; i < up.length; i += 3) up[i] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(up, 3));
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildTrails(t: Terrain, data: WorldData) {
  const group = new THREE.Group();
  group.add(ribbon(t, data.paths.filter((p) => p.k === "p" || p.k === "a").map((p) => p.pts), 1.3, 0.35, new THREE.Color("#d8c39a")));
  group.add(ribbon(t, data.paths.filter((p) => p.k === "r").map((p) => p.pts), 2.6, 0.4, new THREE.Color("#7d7a80")));
  group.add(ribbon(t, data.paths.filter((p) => p.k === "t").map((p) => p.pts), 2.2, 0.35, new THREE.Color("#c9b48c")));
  group.add(ribbon(t, data.streams.filter((s) => !s.r).map((s) => s.pts), 1.1, 0.25, new THREE.Color("#5f9db3")));
  group.add(ribbon(t, data.streams.filter((s) => s.r).map((s) => s.pts), 4, 0.3, new THREE.Color("#4f8fa6")));
  return group;
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
  const conifer = new THREE.ConeGeometry(1, 1, 6);
  conifer.translate(0, 0.5, 0);
  const crown = new THREE.IcosahedronGeometry(1, 0);
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
  const mk = (geo: THREE.BufferGeometry, color: string, list: typeof spots, place: (s: (typeof spots)[0], o: THREE.Object3D) => void, palette?: string[]) => {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: palette ? "#ffffff" : color, flatShading: true, roughness: 0.9 }), list.length);
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
  };
  // conifera: tronco + due coni
  mk(trunk, "#5b4636", conifers, (s, o) => (o.position.set(s.x, s.y - 0.2, s.z), o.rotation.set(0, 0, 0), o.scale.set(s.s * 1.6, s.s * 3, s.s * 1.6)));
  // abeti scuri e freschi, e qualche larice (che a settembre comincia a dorarsi)
  const CON = ["#2f5f40", "#356a46", "#3f7046", "#2c5a3e", "#3a6a42", "#4f7a3c", "#336344", "#3c6c40", "#2e5c42", "#b9a03e"];
  const CON_TOP = ["#3a6c4a", "#427650", "#4b7d4e", "#365f46", "#46774c", "#5d8a45", "#3f704c", "#4a7a48", "#386848", "#d3b54a"];
  mk(conifer, "#2f5a3a", conifers, (s, o) => (o.position.set(s.x, s.y + s.s * 1.6, s.z), o.rotation.set(0, s.x, 0), o.scale.set(s.s * 2.6, s.s * 5.2, s.s * 2.6)), CON);
  mk(conifer, "#3a6a42", conifers, (s, o) => (o.position.set(s.x, s.y + s.s * 4.4, s.z), o.rotation.set(0, s.z, 0), o.scale.set(s.s * 1.8, s.s * 3.6, s.s * 1.8)), CON_TOP);
  // latifoglia: tronco + chioma tonda
  mk(trunk, "#6a5240", broad, (s, o) => (o.position.set(s.x, s.y - 0.2, s.z), o.rotation.set(0, 0, 0), o.scale.set(s.s * 1.8, s.s * 3.4, s.s * 1.8)));
  mk(crown, "#5f8a3e", broad, (s, o) => (o.position.set(s.x, s.y + s.s * 4.2, s.z), o.rotation.set(s.x, s.z, 0), o.scale.set(s.s * 2.8, s.s * 2.4, s.s * 2.8)), ["#6a9a44", "#7aa84c", "#86b152", "#5c8c40", "#93b85a", "#71a14a", "#80ab50", "#62933f", "#8bb556", "#76a54a", "#d9ad3c", "#e08a45"]);
  return { group, count: spots.length };
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
  const stone = new THREE.MeshStandardMaterial({ color: "#b8aca2", flatShading: true, roughness: 0.9 });
  const roofM = new THREE.MeshStandardMaterial({ color: "#7c4a3f", flatShading: true, roughness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: "#8a6446", flatShading: true });
  const red = new THREE.MeshStandardMaterial({ color: "#c2375a", flatShading: true, roughness: 0.5, metalness: 0.3 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  // tetto a due falde: un triangolo estruso, largo 1, alto 1, profondo 1, con la base a y = 0
  const tri = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const roof = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false });
  roof.translate(0, 0, -0.5);
  const house = (x: number, z: number, w: number, d: number, hgt: number, rot: number, wall = stone) => {
    const y = Math.min(t.heightAt(x - w / 2, z - d / 2), t.heightAt(x + w / 2, z + d / 2), t.heightAt(x, z));
    const g = new THREE.Group();
    const b = new THREE.Mesh(box, wall);
    b.scale.set(w, hgt + 2, d);
    b.position.y = (hgt + 2) / 2 - 2;
    const r = new THREE.Mesh(roof, roofM);
    r.scale.set(w * 1.15, hgt * 0.6, d * 1.1);
    r.position.y = hgt;
    g.add(b, r);
    g.position.set(x, y, z);
    g.rotation.y = rot;
    g.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
    group.add(g);
    return g;
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
      const g = house(x, z, 7, 4.5, 3.6, rot);
      // la porta d'ingresso, al centro della facciata
      const at = new THREE.Vector3(0, 0, 2.26), out = new THREE.Vector3(0, 0, 1);
      register(p.name, g, addDoor(g, at, out, 1.1, 2.1), at, out);
      house(x + 6 * Math.cos(rot), z - 6 * Math.sin(rot), 3, 3, 2.4, rot, wood);
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
    } else if (p.kind === "paese") {
      // un paese: case sparse attorno alla chiesa, mai una sopra l'altra
      const n = 6 + Math.floor(rng() * 4);
      const put: [number, number][] = [];
      for (let i = 0, tries = 0; i < n && tries < 80; tries++) {
        const a = rng() * Math.PI * 2, d = 8 + rng() * 34;
        const hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d;
        if (put.some(([px, pz]) => Math.hypot(px - hx, pz - hz) < 9)) continue;
        put.push([hx, hz]);
        house(hx, hz, 4 + rng() * 2.5, 3.6 + rng() * 1.8, 2.8 + rng() * 1.4, rng() * Math.PI);
        i++;
      }
      // il campanile
      const bell = new THREE.Mesh(box, stone);
      bell.scale.set(2.2, 13, 2.2);
      bell.position.set(x, t.heightAt(x, z) + 4.5, z);
      bell.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.5, 4), roofM);
      cap.position.set(x, t.heightAt(x, z) + 12.75, z);
      cap.rotation.y = Math.PI / 4;
      group.add(bell, cap);
    } else house(x, z, 4.5, 3.5, 2.6, rot, wood);
  }
  // il Sasso Remenno è in climb.ts (roccia chiusa, collisione e via d'arrampicata)
  return { group, doors };
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
