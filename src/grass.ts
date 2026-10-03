import * as THREE from "three";
import { S, type Cover, type Terrain, type WorldData } from "./world";

/**
 * Erba e cespugli, come in un cartone.
 * - I ciuffi d'erba crescono solo intorno a te (non in tutta la valle: sarebbero milioni) e si spostano con te. Ogni
 *   ciuffo ha un posto fisso, deciso dalla sua cella: avvicinandoti non "saltano". Ondeggiano col vento.
 * - I cespugli tondi stanno ai bordi dei sentieri, dove li vedi davvero; sono pochi e fissi.
 * Niente erba su sentieri, piazze, bosco fitto, rocce ripide, ghiacciai, acqua e sopra i 2400 m.
 */
type Near = (x: number, z: number) => number;
const hash = (x: number, z: number, k = 0) => {
  const h = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

export const grassUniforms = { uTime: { value: 0 } };

export class Grass {
  readonly mesh: THREE.InstancedMesh;
  private readonly cell = 1.6;
  private readonly radius = 60;
  private center = new THREE.Vector2(1e9, 1e9);

  constructor(private t: Terrain, private cover: Cover, private nearPath: Near, private squares: [number, number][]) {
    // un ciuffo: cinque fili (triangoli sottili) a raggiera, più scuri alla base e chiari in punta
    const P: number[] = [], C: number[] = [];
    for (let i = 0; i < 5; i++) {
      // ciuffetti bassi e morbidi: fili larghi e corti, poco inclinati
      const a = (i / 5) * Math.PI * 2 + i * 0.4, lean = 0.1 + (i % 2) * 0.07, h = 0.26 + (i % 3) * 0.07;
      const dx = Math.cos(a), dz = Math.sin(a), w = 0.1;
      const bx = dx * 0.05, bz = dz * 0.05;
      P.push(bx - dz * w, 0, bz + dx * w, bx + dz * w, 0, bz - dx * w, dx * lean, h, dz * lean);
      C.push(0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 1.14, 1.14, 1.14);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    // le normali verso l'alto: i fili prendono la luce come il prato (niente fili neri controluce)
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
    // il vento: le punte ondeggiano (più in alto il filo, più si muove)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = grassUniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.27) * 0.5 + sin(uTime * 2.9 + wp.x * 0.9) * 0.25;
          transformed.x += sway * 0.12 * position.y;
          transformed.z += sway * 0.07 * position.y;`,
        );
      // tutte e due le facce dei fili prendono la luce dall'alto (il retro non diventa nero)
      sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>", "vec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;");
    };
    const max = Math.ceil(Math.PI * (this.radius / this.cell) ** 2 * 1.05);
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }

  /** quanta erba in questo punto (0 = niente) */
  private density(x: number, z: number) {
    const t = this.t, c = this.cover;
    if (!t.inside(x, z, 2)) return 0;
    const m = t.heightAt(x, z) / S;
    if (m > 2400 || t.slopeAt(x, z) > 32) return 0;
    if (c.at(c.water, x, z) > 0.2 || c.at(c.glacier, x, z) > 0.1 || t.waterAt(x, z) !== null) return 0;
    if (this.nearPath(x, z) < 0.4) return 0;
    for (const [sx, sz] of this.squares) if (Math.hypot(sx - x, sz - z) < 10) return 0;
    const forest = c.at(c.forest, x, z);
    return (1 - forest * 0.85) * (1 - THREE.MathUtils.smoothstep(m, 2000, 2400));
  }

  /** da chiamare spesso: se ti sei spostata abbastanza, ripianta i ciuffi intorno a te */
  update(me: THREE.Vector3, palette: (x: number, z: number, out: THREE.Color) => THREE.Color) {
    if (Math.hypot(me.x - this.center.x, me.z - this.center.y) < 6) return;
    this.center.set(me.x, me.z);
    const o = new THREE.Object3D(), col = new THREE.Color();
    const r = Math.ceil(this.radius / this.cell), c0x = Math.floor(me.x / this.cell), c0z = Math.floor(me.z / this.cell);
    let n = 0;
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) {
        if (i * i + j * j > r * r || n >= this.mesh.instanceMatrix.count) continue;
        const cx = c0x + i, cz = c0z + j;
        const x = (cx + hash(cx, cz, 1)) * this.cell, z = (cz + hash(cx, cz, 2)) * this.cell;
        const d = this.density(x, z);
        if (d <= 0 || hash(cx, cz, 3) > d) continue;
        const s = 0.7 + hash(cx, cz, 4) * 0.45;
        o.position.set(x, this.t.heightAt(x, z) - 0.03, z);
        o.rotation.set(0, hash(cx, cz, 5) * Math.PI * 2, 0);
        o.scale.set(s, s * (0.8 + hash(cx, cz, 6) * 0.5), s);
        o.updateMatrix();
        this.mesh.setMatrixAt(n, o.matrix);
        this.mesh.setColorAt(n, palette(x, z, col).offsetHSL(0, 0, (hash(cx, cz, 7) - 0.5) * 0.08));
        n++;
      }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** i cespugli tondi ai bordi dei sentieri (due o tre palle verdi schiacciate, qualcuno con le bacche) */
export function buildBushes(t: Terrain, cover: Cover, data: WorldData, nearPath: Near, squares: [number, number][]) {
  const blob = (r: number, x: number, y: number, z: number) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, z);
    return g;
  };
  const parts = [blob(0.7, 0, 0.45, 0), blob(0.5, 0.55, 0.32, 0.15), blob(0.48, -0.45, 0.3, -0.2)];
  const geo = new THREE.BufferGeometry();
  {
    // tre palle in una sola geometria
    const P: number[] = [];
    for (const g of parts) {
      const nn = g.toNonIndexed();
      P.push(...(nn.attributes.position.array as Float32Array));
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geo.computeVertexNormals();
  }
  const spots: { x: number; z: number; s: number; c: number }[] = [];
  for (const p of data.paths) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const ax = p.pts[i][0] * S, az = p.pts[i][1] * S, bx = p.pts[i + 1][0] * S, bz = p.pts[i + 1][1] * S;
      const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 9);
      for (let k = 0; k < n; k++) {
        const f = (k + hash(ax, az, k)) / Math.max(1, n);
        const px = ax + (bx - ax) * f, pz = az + (bz - az) * f;
        if (hash(px, pz, 11) > 0.5) continue;
        // di lato, appena fuori dal sentiero
        const side = hash(px, pz, 12) > 0.5 ? 1 : -1, off = 2.2 + hash(px, pz, 13) * 2.5;
        const x = px + (-(bz - az) / len) * off * side, z = pz + ((bx - ax) / len) * off * side;
        const m = t.heightAt(x, z) / S;
        if (m > 2100 || t.slopeAt(x, z) > 30 || nearPath(x, z) < 0.6 || cover.at(cover.water, x, z) > 0.2 || t.waterAt(x, z) !== null) continue;
        if (squares.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 11)) continue;
        spots.push({ x, z, s: 0.7 + hash(x, z, 14) * 0.7, c: hash(x, z, 15) });
      }
    }
  }
  // in ordine sparso: la qualità grafica può diradarli disegnando solo i primi
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(hash(i, spots.length, 16) * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const COLORS = ["#4f9e45", "#5aaa4a", "#64b450", "#4a9442", "#6ab955", "#3f8a3e"];
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), spots.length);
  const o = new THREE.Object3D(), col = new THREE.Color();
  spots.forEach((p, i) => {
    o.position.set(p.x, t.heightAt(p.x, p.z) - 0.1, p.z);
    o.rotation.set(0, p.c * Math.PI * 2, 0);
    o.scale.set(p.s, p.s * 0.85, p.s);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.setColorAt(i, col.set(COLORS[Math.floor(p.c * COLORS.length)]));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, count: spots.length, spots };
}
