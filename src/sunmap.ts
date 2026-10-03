import * as THREE from "three";
import type { Terrain } from "./world";

/**
 * Le ombre delle montagne. Per ogni punto della valle (griglia a 80 m) si segue il raggio verso il sole sul terreno vero:
 * se una cresta lo copre, il punto è in ombra. È lo stesso calcolo di "Rientro prima del buio" (quando il sole va dietro
 * le montagne), qui fatto per tutta la valle. Il risultato è una texture che tutti i materiali leggono per spegnere la
 * luce diretta del sole: la valle va in ombra mentre le cime restano accese di rosa.
 * Si ricalcola a pezzi, qualche migliaio di punti per fotogramma, quando il sole si sposta di un po'.
 */
export class SunMap {
  readonly texture: THREE.DataTexture;
  readonly uniforms = { uSunMap: { value: null as THREE.Texture | null }, uWorld: { value: new THREE.Vector2() } };
  private readonly w: number;
  private readonly h: number;
  private readonly k = 2; // un punto ogni 2 celle della griglia
  private back: Float32Array;
  private front: Uint8Array<ArrayBuffer>;
  private next = -1;
  private dir = new THREE.Vector3();
  private lastDir = new THREE.Vector3(0, -1, 0);
  private maxH: number;

  constructor(private t: Terrain) {
    this.w = Math.floor((t.meta.cols - 1) / this.k) + 1;
    this.h = Math.floor((t.meta.rows - 1) / this.k) + 1;
    this.back = new Float32Array(this.w * this.h);
    this.front = new Uint8Array(this.w * this.h).fill(255);
    this.texture = new THREE.DataTexture(this.front, this.w, this.h, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.uniforms.uSunMap.value = this.texture;
    this.uniforms.uWorld.value.set(t.width, t.depth);
    let m = 0;
    for (const v of t.h) m = Math.max(m, v);
    this.maxH = m;
  }

  /** calcolo completo e immediato (all'avvio) */
  computeNow(sunDir: THREE.Vector3) {
    this.start(sunDir);
    while (this.next >= 0) this.step(1e9);
  }

  /** da chiamare a ogni fotogramma: se il sole si è spostato, ricalcola un pezzo alla volta */
  update(sunDir: THREE.Vector3, budget = 6000) {
    if (this.next < 0 && sunDir.angleTo(this.lastDir) > THREE.MathUtils.degToRad(0.25)) this.start(sunDir);
    if (this.next >= 0) this.step(budget);
  }

  private start(sunDir: THREE.Vector3) {
    this.dir.copy(sunDir);
    this.lastDir.copy(sunDir);
    this.next = 0;
  }

  private step(budget: number) {
    const { t, w, h, k } = this;
    const cols = t.meta.cols, rows = t.meta.rows, step = t.meta.step; // metri per cella
    const d = this.dir;
    const hor = Math.hypot(d.x, d.z);
    const end = Math.min(w * h, this.next + budget);
    if (d.y <= -0.02 || hor < 1e-6) {
      // sole sotto l'orizzonte (o allo zenit): tutto spento o tutto acceso
      this.back.fill(d.y <= -0.02 ? 0 : 1);
      this.next = w * h;
    } else {
      const sx = d.x / hor, sz = d.z / hor; // passo orizzontale (in celle) verso il sole
      const rise = (d.y / hor) * step; // metri di salita del raggio per cella percorsa
      const t0 = performance.now();
      let i = this.next;
      for (; i < end; i++) {
        // al massimo ~4 ms per fotogramma (con il sole basso i raggi sono lunghi)
        if ((i & 63) === 0 && budget < 1e8 && performance.now() - t0 > 4) break;
        const c0 = (i % w) * k, r0 = Math.floor(i / w) * k;
        const h0 = t.hm(c0, r0) + 2;
        let clear = 1e9;
        let x = c0, z = r0, y = h0;
        for (let n = 0; n < 900; n++) {
          x += sx;
          z += sz;
          y += rise;
          if (x < 0 || z < 0 || x > cols - 1 || z > rows - 1 || y > this.maxH) break;
          // quota del terreno (bilineare sulla griglia)
          const xi = x | 0, zi = z | 0, fx = x - xi, fz = z - zi;
          const a = t.h[zi * cols + xi], b = t.h[zi * cols + Math.min(cols - 1, xi + 1)];
          const c = t.h[Math.min(rows - 1, zi + 1) * cols + xi], e = t.h[Math.min(rows - 1, zi + 1) * cols + Math.min(cols - 1, xi + 1)];
          const g = a + (b - a) * fx + (c - a) * fz + (a - b - c + e) * fx * fz;
          const gap = y - g;
          if (gap < clear) clear = gap;
          if (clear < -60) break;
        }
        // penombra morbida: da 40 m sotto la cresta (ombra piena) a 25 m sopra (sole pieno)
        this.back[i] = THREE.MathUtils.smoothstep(clear, -40, 25);
      }
      this.next = i;
    }
    if (this.next >= w * h) {
      for (let i = 0; i < this.front.length; i++) this.front[i] = Math.round(this.back[i] * 255);
      this.texture.needsUpdate = true;
      this.next = -1;
    }
  }

  /** collega la texture a un materiale standard: la luce del sole (direzionale) viene moltiplicata per "al sole" */
  patch(mat: THREE.Material) {
    const m = mat as THREE.MeshStandardMaterial;
    if (!m.isMeshStandardMaterial || m.userData.sunPatched) return;
    m.userData.sunPatched = true;
    const u = this.uniforms;
    const prev = m.onBeforeCompile.bind(m); // conserva eventuali modifiche già presenti (l'acqua dei laghi)
    const prevKey = m.customProgramCacheKey.bind(m);
    m.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.uniforms.uSunMap = u.uSunMap;
      sh.uniforms.uWorld = u.uWorld;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vSunUv;\nuniform vec2 uWorld;")
        .replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\n{ vec4 wp = vec4( transformed, 1.0 );\n#ifdef USE_INSTANCING\n wp = instanceMatrix * wp;\n#endif\n wp = modelMatrix * wp; vSunUv = wp.xz / uWorld; }",
        );
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vSunUv;\nuniform sampler2D uSunMap;")
        .replace(
          "getDirectionalLightInfo( directionalLight, directLight );",
          "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= texture2D( uSunMap, vSunUv ).r;",
        );
    };
    m.customProgramCacheKey = () => prevKey() + "+sunmap";
    m.needsUpdate = true;
  }
}

