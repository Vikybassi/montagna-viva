import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { sound } from "./audio";
import { Hiker } from "./player";
import { learn, save, state } from "./state";
import * as ui from "./ui";
import type { Terrain, WorldData } from "./world";

/**
 * Il Sasso Remenno e la sua via d'arrampicata.
 * Il masso è una roccia unica e chiusa (niente crepe): non si attraversa, e sopra ci si può stare.
 * La via è come quelle vere del Sasso Remenno: si sale con corda, imbrago e casco, e l'istruttore fa sicura dal basso.
 * Il corpo si muove come in una scalata vera: le mani stanno sulle prese, i piedi su appoggi (o in aderenza sulla
 * roccia, che stanca di più), e dopo ogni presa i piedi salgono uno alla volta; il bacino resta vicino alla parete.
 * Si clicca (o si tocca) la presa dove mettere la mano: ci va la mano che ci arriva, perché l'altra ti tiene appesa. Le
 * prese a portata hanno un cerchio bianco, e il prossimo passo della via lampeggia in giallo. Si può scuotere un braccio
 * per farlo riposare (se l'altra mano è su una presa buona). Le direzioni restano come alternativa. Le braccia si
 * stancano sulle prese piccole e si riposano su quelle grandi (ogni tanto la via ha due prese grandi vicine: un punto
 * di riposo); se la forza finisce, la corda ti tiene: scivoli un po', ti riposi appesa e riparti. Alla catena in cima
 * l'istruttore ti cala giù.
 */
export type Kind = "jug" | "crimp" | "sloper";
type Hold = { pos: THREE.Vector3; n: THREE.Vector3; kind: Kind; route: boolean; mesh: THREE.Mesh };
/** un appoggio per i piedi (piccolo, scuro): non si prende con le mani */
type Foot = { pos: THREE.Vector3; n: THREE.Vector3 };
type Limb = { from: THREE.Vector3; to: THREE.Vector3; n: THREE.Vector3; t: number };
const DRAIN: Record<Kind, number> = { jug: -0.05, crimp: 0.03, sloper: 0.02 }; // al secondo, per mano
const BASE_DRAIN = 0.015; // stare appesi stanca sempre un po'
const MOVE_COST: Record<Kind, number> = { jug: 0.03, crimp: 0.05, sloper: 0.045 };
const KIND_NAME: Record<Kind, string> = { jug: "una presa grande", crimp: "una tacchetta", sloper: "uno svaso" };

/** misure del masso (unità del gioco): è alto quasi venti volte una persona, come quello vero */
const SIZE_X = 26, SIZE_Y = 30, SIZE_Z = 22;

export class Boulder {
  readonly mesh: THREE.Mesh;
  private ray = new THREE.Raycaster();
  private top: number;
  private box: THREE.Box3;
  readonly center: THREE.Vector3;
  readonly radius: number;
  /** il bordo del masso a terra: distanza dal centro ogni 10° */
  private edge: number[] = [];

  constructor(t: Terrain, x: number, z: number, opt: { size?: [number, number, number]; seed?: number; bulge?: number } = {}) {
    const [SX, SY, SZ] = opt.size ?? [SIZE_X, SIZE_Y, SIZE_Z];
    // un seme suo: il masso è sempre lo stesso, qualunque cosa si generi prima o dopo
    let seed = opt.seed ?? 1234;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    // icosaedro suddiviso, con i vertici uniti prima di deformarli: le facce combaciano (prima ogni faccia si spostava per
    // conto suo e restavano delle crepe)
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2);
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      // forma da masso: fianchi ripidi (la "pancia" si allarga), cima più piatta, base appoggiata al prato
      const side = 1 + (opt.bulge ?? 0.28) * (1 - Math.abs(v.y));
      v.x *= side;
      v.z *= side;
      if (v.y > 0.55) v.y = 0.55 + (v.y - 0.55) * 0.45;
      v.multiplyScalar(0.9 + rng() * 0.2);
      if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.5;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "#b8afa8", flatShading: true, roughness: 0.95 }));
    this.mesh.scale.set(SX, SY, SZ);
    const y0 = t.heightAt(x, z);
    // la base è un po' interrata: anche dove il prato scende, il masso non resta sospeso
    this.mesh.position.set(x, y0 + 0.4 * SY, z);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.updateMatrixWorld(true);
    this.center = this.mesh.position.clone();
    this.box = new THREE.Box3().setFromObject(this.mesh);
    this.top = this.box.max.y;
    this.radius = Math.max(this.box.max.x - x, x - this.box.min.x, this.box.max.z - z, z - this.box.min.z);
    // il bordo a terra, misurato con raggi orizzontali poco sopra il prato
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const ex = x + dir.x * this.radius, ez = z + dir.z * this.radius;
      const from = new THREE.Vector3(x, Math.max(y0, t.heightAt(ex, ez)) + 1, z).addScaledVector(dir, this.radius + 20);
      const hit = this.cast(from, dir.clone().negate());
      this.edge.push(hit ? Math.hypot(hit.point.x - x, hit.point.z - z) : 0);
    }
  }

  /** distanza del bordo del masso dal centro, nella direzione `a` (radianti, sul piano x-z) */
  edgeAt(a: number) {
    const f = ((((a / (Math.PI * 2)) * 36) % 36) + 36) % 36;
    const i = Math.floor(f), k = f - i;
    return this.edge[i] * (1 - k) + this.edge[(i + 1) % 36] * k;
  }
  /** (x, z) cade sotto il masso? (con un margine) */
  covers(x: number, z: number, margin = 0) {
    const dx = x - this.center.x, dz = z - this.center.z;
    return Math.hypot(dx, dz) < this.edgeAt(Math.atan2(dz, dx)) + margin;
  }

  /**
   * Fa spazio al masso, che nel gioco è più grande di quello vero: i sentieri, la strada e il torrente che gli passerebbero
   * sotto girano intorno alla roccia. I punti uguali restano uguali (gli incroci dei sentieri non si staccano).
   */
  makeRoom(data: WorldData, S: number, margin = 3) {
    const cx = this.center.x, cz = this.center.z, near = this.radius + 12;
    const push = (x: number, z: number): [number, number] => {
      const wx = x * S - cx, wz = z * S - cz;
      const r = Math.hypot(wx, wz), R = this.edgeAt(Math.atan2(wz, wx)) + margin;
      if (r >= R) return [x, z];
      const k = R / Math.max(r, 1e-3);
      return [(cx + wx * k) / S, (cz + wz * k) / S];
    };
    const fix = (pts: [number, number][]) => {
      const out: [number, number][] = [];
      pts.forEach(([x, z], i) => {
        if (i > 0) {
          // i tratti vicini al masso si dividono in pezzi corti, così la curva intorno alla roccia è morbida
          const [px, pz] = pts[i - 1];
          const ax = px * S - cx, az = pz * S - cz, bx = x * S - cx, bz = z * S - cz;
          const len = Math.hypot(bx - ax, bz - az);
          const u = len > 0 ? THREE.MathUtils.clamp(-(ax * (bx - ax) + az * (bz - az)) / (len * len), 0, 1) : 0;
          if (Math.hypot(ax + (bx - ax) * u, az + (bz - az) * u) < near) {
            const n = Math.ceil(len / 1.5);
            for (let k = 1; k < n; k++) out.push(push(px + ((x - px) * k) / n, pz + ((z - pz) * k) / n));
          }
        }
        out.push(push(x, z));
      });
      return out;
    };
    for (const p of data.paths) p.pts = fix(p.pts);
    for (const s of data.streams) s.pts = fix(s.pts);
  }

  /** quota della roccia sotto (x, z), se lì c'è il masso (per camminarci sopra e non attraversarlo) */
  topAt(x: number, z: number) {
    const b = this.box;
    if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) return null;
    this.ray.set(new THREE.Vector3(x, this.top + 5, z), new THREE.Vector3(0, -1, 0));
    const hit = this.ray.intersectObject(this.mesh, false)[0];
    return hit ? hit.point.y : null;
  }

  /** colpo di raggio contro la roccia, con la normale in coordinate del mondo */
  cast(from: THREE.Vector3, dir: THREE.Vector3) {
    this.ray.set(from, dir);
    const hit = this.ray.intersectObject(this.mesh, false)[0];
    if (!hit || !hit.face) return null;
    const n = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(this.mesh.matrixWorld)).normalize();
    return { point: hit.point, n };
  }
}

/**
 * Le opzioni di una via: con corda (il Sasso Remenno, con Davide che fa sicura) o un blocco basso senza corda
 * (bouldering in Val di Mello: materassino sotto e un'amica che "para").
 */
export type ClimbOpts = {
  rope?: boolean;
  /** verso dove guarda la parete della via (in piano) */
  out?: THREE.Vector3;
  /** chi fa sicura (o para): nome per il ritratto e colori */
  partner?: { name: string; look: { jacket: string; hat: string; pack: string; hair: string } };
  kinds?: Kind[];
  /** cosa ricordare quando arrivi in cima */
  onTop?: () => void;
  /** il nome della via o del blocco, per gli avvisi */
  title?: string;
  /** distanza tra le prese lungo la roccia (minima, più una parte a caso): sui blocchi movimenti più corti */
  spacing?: [number, number];
  /** a che altezza dal prato è la prima presa */
  startHeight?: number;
};

export class Climb {
  readonly group = new THREE.Group();
  active = false;
  private phase: "climb" | "move" | "fall" | "hang" | "top" | "lower" = "climb";
  private holds: Hold[] = [];
  private route: Hold[] = [];
  private footholds: Foot[] = [];
  private anchor = new THREE.Vector3();
  private out = new THREE.Vector3(); // verso fuori dalla parete (orizzontale)
  private right = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private hands: [Hold, Hold];
  private handPos: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private move: { hand: 0 | 1; from: THREE.Vector3; to: Hold; t: number } | null = null;
  /** i piedi: dove sono, su cosa poggiano (null = in aderenza) e il passo in corso */
  private feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private footOn: [Foot | null, Foot | null] = [null, null];
  private step: (Limb & { foot: 0 | 1; on: Foot | null }) | null = null;
  private body = new THREE.Vector3();
  private strength = 1;
  private timer = 0;
  private lowerPath: THREE.Vector3[] = [];
  private lowerNormals: THREE.Vector3[] = [];
  private lowerDone = 0;
  private candidate: Hold | null = null;
  private ring: THREE.Mesh;
  /** il prossimo passo della via: un disco giallo che lampeggia */
  private glow: THREE.Mesh;
  /** la parete sotto le mani (si aggiorna piano: la telecamera e il corpo la seguono senza scatti) */
  private wallN = new THREE.Vector3();
  /** la presa sotto il mouse (o toccata) e se la mano ci arriva */
  private hover: Hold | null = null;
  private hoverOk = false;
  /** prese raggiungibili ora: cerchi bianchi */
  private dots: THREE.Mesh[] = [];
  /** scuotere le braccia: una mano si stacca e riposa, l'altra tiene */
  private shaking = false;
  private rope: THREE.Line;
  private hud: HTMLDivElement;
  private inputHeld = false;
  /** sbuffi di magnesite quando la mano prende una presa */
  private chalk: THREE.Points;
  private puffs: { p: THREE.Vector3; v: THREE.Vector3; life: number }[] = [];
  /** quanta corda ha recuperato l'istruttore (anima le sue braccia) */
  private pulled = 0;
  private lastY = 0;
  readonly belayer: Hiker;
  /** il tuo zaino, lasciato a terra mentre arrampichi */
  private pack: THREE.Mesh;
  /** verso fuori dalla parete della via (per rimettere la telecamera dopo la calata) */
  get outward() {
    return this.out;
  }
  readonly base: THREE.Vector3; // dove sta l'istruttore (o chi para)
  /** con la corda (Remenno) o senza (blocchi della Val di Mello, sul materassino) */
  readonly withRope: boolean;
  private routeBase = new THREE.Vector3();

  constructor(
    private t: Terrain,
    readonly rock: Boulder,
    private hiker: Hiker,
    rng: () => number,
    private opts: ClimbOpts = {},
  ) {
    this.withRope = opts.rope ?? true;
    // la via del Remenno sta sul lato sud-ovest del masso: al sole del pomeriggio (le pareti a nord restano scure)
    this.out.copy(opts.out ?? new THREE.Vector3(-0.6, 0, 0.8)).setY(0).normalize();
    this.right.crossVectors(this.up, this.out).normalize();
    const holdGeo = new THREE.DodecahedronGeometry(1, 0);
    const chalkMat = new THREE.MeshStandardMaterial({ color: "#e4ded6", flatShading: true, roughness: 1 });
    const plain = new THREE.MeshStandardMaterial({ color: "#7f756f", flatShading: true, roughness: 1 });
    const footMat = new THREE.MeshStandardMaterial({ color: "#6a625d", flatShading: true, roughness: 1 });
    const addHold = (pos: THREE.Vector3, n: THREE.Vector3, kind: Kind, route: boolean) => {
      const m = new THREE.Mesh(holdGeo, route ? chalkMat : plain);
      const s = kind === "jug" ? 0.2 : kind === "sloper" ? 0.24 : 0.12;
      m.scale.set(s, s * 0.6, s);
      m.position.copy(pos).addScaledVector(n, 0.05);
      m.lookAt(pos.clone().add(n));
      m.castShadow = true;
      this.group.add(m);
      const h: Hold = { pos: pos.clone().addScaledVector(n, 0.12), n: n.clone(), kind, route, mesh: m };
      this.holds.push(h);
      return h;
    };
    const addFoot = (pos: THREE.Vector3, n: THREE.Vector3) => {
      const m = new THREE.Mesh(holdGeo, footMat);
      m.scale.set(0.11, 0.06, 0.09);
      m.position.copy(pos).addScaledVector(n, 0.03);
      m.lookAt(pos.clone().add(n));
      this.group.add(m);
      this.footholds.push({ pos: pos.clone().addScaledVector(n, 0.08), n: n.clone() });
    };
    const R = rock.radius + 8;
    let lat = 0, i = 0;
    // ogni tanto due prese grandi di seguito: lì si riposa
    const kinds: Kind[] = opts.kinds ?? ["jug", "jug", "crimp", "jug", "sloper", "crimp", "jug", "jug", "crimp", "sloper", "jug", "crimp", "crimp", "jug", "jug", "sloper", "crimp", "jug", "sloper", "crimp", "jug", "jug"];
    let last: { point: THREE.Vector3; n: THREE.Vector3 } | null = null;
    const castAt = (yy: number, l: number) => {
      const from = rock.center.clone().addScaledVector(this.out, R).addScaledVector(this.right, l);
      from.y = yy;
      return rock.cast(from, this.out.clone().negate());
    };
    // la prima presa a 1,9 dal prato, misurato proprio sotto la parete (il terreno intorno al masso non è piano)
    let y = rock.center.y - (this.withRope ? 6 : 0);
    for (let k = 0; k < 3; k++) {
      const probe = castAt(y, 0);
      if (probe) y = t.heightAt(probe.point.x, probe.point.z) + (opts.startHeight ?? 1.9);
    }
    const startY = y;
    // la via: una presa ogni metro circa lungo la roccia (quanto si allunga un braccio), a destra e a sinistra alternate
    const spots: { y: number; lat: number }[] = [];
    for (; i < 120; i++) {
      lat = (i % 2 ? 1 : -1) * (0.28 + rng() * 0.22) + (rng() - 0.5) * 0.15;
      let hit = castAt(y, lat);
      if (last) {
        const [sp0, sp1] = opts.spacing ?? [0.95, 0.15];
        while (hit && hit.n.y <= 0.8 && hit.point.distanceTo(last.point) < sp0 + rng() * sp1) {
          y += 0.1;
          hit = castAt(y, lat);
        }
      }
      if (!hit || hit.n.y > 0.8) break; // dove la roccia diventa quasi piana: è la cima
      last = hit;
      this.route.push(addHold(hit.point, hit.n, kinds[i % kinds.length], true));
      spots.push({ y, lat });
      // prese in più ai lati (alternative, senza magnesite)
      if (rng() < 0.7) {
        const side = (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 0.4);
        const h2 = castAt(y + (rng() - 0.5) * 0.4, lat + side);
        if (h2 && h2.n.y < 0.8) addHold(h2.point, h2.n, rng() < 0.5 ? "crimp" : "sloper", false);
      }
      y += 0.2;
    }
    // appoggi per i piedi: piccole scaglie, fitte, dal fondo fin quasi in cima
    for (let fy = startY - 1.75; fy < y - 1; fy += 0.42) {
      for (const side of [-1, 1]) {
        if (rng() < 0.25) continue;
        const f = castAt(fy + (rng() - 0.5) * 0.2, side * (0.15 + rng() * 0.35));
        if (f && f.n.y < 0.85) addFoot(f.point, f.n);
      }
    }
    const start = this.route[0];
    this.routeBase.set(start.pos.x, t.heightAt(start.pos.x, start.pos.z), start.pos.z).addScaledVector(this.out, 0.8);
    // catena (sosta) in cima alla via, e gli spit lungo la via
    const top = this.route[this.route.length - 1];
    this.anchor.copy(top.pos).addScaledVector(this.up, 0.9);
    if (last) this.anchor.addScaledVector(last.n, 0.05);
    const steel = new THREE.MeshStandardMaterial({ color: "#b9bcc2", metalness: 0.7, roughness: 0.35 });
    for (const s of this.withRope ? [-0.18, 0.18] : []) {
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12), steel);
      ringM.position.copy(this.anchor).addScaledVector(this.right, s);
      this.group.add(ringM);
    }
    this.route.forEach((h, k) => {
      if (k % 4 !== 3 || !this.withRope) return;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6), steel);
      b.position.copy(h.pos).addScaledVector(this.right, 0.5).addScaledVector(h.n, -0.05);
      b.lookAt(b.position.clone().add(h.n));
      b.rotateX(Math.PI / 2);
      this.group.add(b);
    });
    // presa sotto il mouse: anello
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 24), new THREE.MeshBasicMaterial({ color: "#f2b632", depthTest: false, transparent: true }));
    this.ring.renderOrder = 5;
    this.ring.visible = false;
    this.group.add(this.ring);
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), new THREE.MeshBasicMaterial({ color: "#ffd23f", depthTest: false, transparent: true, opacity: 0.5 }));
    this.glow.renderOrder = 3;
    this.glow.visible = false;
    this.group.add(this.glow);
    const dotGeo = new THREE.TorusGeometry(0.18, 0.022, 4, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: "#ffffff", depthTest: false, transparent: true, opacity: 0.75 });
    for (let k = 0; k < 14; k++) {
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.renderOrder = 4;
      d.visible = false;
      this.dots.push(d);
      this.group.add(d);
    }
    // magnesite
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    this.chalk = new THREE.Points(cg, new THREE.PointsMaterial({ color: "#ffffff", size: 0.09, transparent: true, opacity: 0.8, depthWrite: false }));
    this.chalk.frustumCulled = false;
    this.chalk.visible = false;
    this.group.add(this.chalk);
    // corda: dalle mani dell'istruttore alla catena e giù fino all'imbrago
    const rg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    this.rope = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: "#ff6a2a" }));
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    this.group.add(this.rope);
    // l'istruttore che fa sicura
    // chi para sta vicino al materassino, con le mani pronte; chi fa sicura un po' più in là, con la corda
    this.base = this.withRope ? this.routeBase.clone().addScaledVector(this.out, 2.4).addScaledVector(this.right, -2.2) : this.routeBase.clone().addScaledVector(this.out, 1.8).addScaledVector(this.right, 1.4);
    this.base.y = t.heightAt(this.base.x, this.base.z);
    const partner = opts.partner ?? { name: "Davide", look: { jacket: "#3a6f4e", hat: "#ffffff", pack: "#c2375a", hair: "#2a1f1a" } };
    this.belayer = new Hiker(partner.look);
    ui.avatar(partner.name, partner.look);
    if (!this.withRope) {
      // il materassino (crash pad) sotto il blocco
      const pad = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.28, 1.8), new THREE.MeshStandardMaterial({ color: "#2f6fb5", roughness: 0.9 }));
      const strap = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.3, 0.16), new THREE.MeshStandardMaterial({ color: "#f2b632", roughness: 0.8 }));
      pad.add(top, strap);
      const pp = this.routeBase.clone().addScaledVector(this.out, 0.7);
      pad.position.set(pp.x, t.heightAt(pp.x, pp.z) + 0.14, pp.z);
      pad.rotation.y = Math.atan2(this.right.x, this.right.z);
      pad.traverse((o) => ((o as THREE.Mesh).receiveShadow = true));
      this.group.add(pad);
    }
    this.belayer.root.position.copy(this.base);
    this.belayer.heading = Math.atan2(-this.out.x, -this.out.z);
    this.belayer.root.rotation.y = this.belayer.heading;
    this.group.add(this.belayer.root);
    this.pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.24), new THREE.MeshStandardMaterial({ color: "#2f8f8a", roughness: 0.7, flatShading: true }));
    const pp = this.base.clone().addScaledVector(this.right, 1.1).addScaledVector(this.out, 0.4);
    this.pack.position.set(pp.x, t.heightAt(pp.x, pp.z) + 0.24, pp.z);
    this.pack.rotation.set(0.25, 0.6, 0);
    this.pack.castShadow = true;
    this.pack.visible = false;
    this.group.add(this.pack);
    this.hands = [this.route[0], this.route[1]];
    // indicatore della forza
    this.hud = document.createElement("div");
    this.hud.className = "climbhud";
    this.hud.innerHTML = `<p class="climb-k">Forza nelle braccia</p><span class="climb-bar"><i></i></span><p class="climb-h"></p><div class="climb-btns"><button type="button" class="shake">Scuoti le braccia <kbd>F</kbd></button><button type="button" class="lower">${this.withRope ? "«Calami!»" : "Salta giù"} <kbd>Spazio</kbd></button></div>`;
    document.body.appendChild(this.hud);
    const shakeBtn = this.hud.querySelector<HTMLButtonElement>(".shake")!;
    shakeBtn.addEventListener("pointerdown", (e) => (e.preventDefault(), this.setShake(true)));
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) shakeBtn.addEventListener(ev, () => this.setShake(false));
    this.hud.querySelector(".lower")!.addEventListener("click", () => this.letGo());
  }

  /** si parte: imbragata, legata, mani sulle prime prese, piedi sui primi appoggi */
  start() {
    this.active = true;
    this.phase = "climb";
    this.strength = 1;
    this.hands = [this.route[0], this.route[1]];
    this.handPos[0].copy(this.hands[0].pos);
    this.handPos[1].copy(this.hands[1].pos);
    this.wallN.copy(this.hands[0].n).add(this.hands[1].n).normalize();
    this.bodyTarget(this.body);
    this.lastY = this.body.y;
    for (const f of [0, 1] as const) {
      const d = this.footTarget(f);
      this.feet[f].copy(d.pos);
      this.footOn[f] = d.on;
    }
    this.step = null;
    this.hiker.climbing = true;
    this.hiker.climbGearOn(true, this.withRope);
    this.pack.visible = true;
    this.hiker.velocity.set(0, 0);
    this.hiker.airborne = false;
    this.rope.visible = this.withRope;
    this.hud.classList.add("on");
    this.hint(this.withRope ? "Clicca la presa gialla che lampeggia: ci metti la mano. I piedi salgono da soli sugli appoggi." : `Blocco senza corda: sotto c'è il materassino e ${this.opts.partner?.name ?? "un'amica"} ti para. Clicca la presa gialla che lampeggia.`);
  }

  private hint(s: string) {
    // sul telefono non c'è la barra spaziatrice: c'è il pulsante "Salta / Vola"
    if (matchMedia("(pointer: coarse)").matches) s = s.replace(/Clicca/g, "Tocca").replace(/clicca/g, "tocca").replace(/ Spazio: «Calami!»/g, "").replace(/ Spazio: salta giù/g, "");
    this.hud.querySelector(".climb-h")!.textContent = s;
  }

  /** "su" lungo la roccia: la verticale schiacciata sulla parete (su una placca è inclinato verso dentro) */
  private wallUp(n: THREE.Vector3) {
    const u = this.up.clone().addScaledVector(n, -this.up.dot(n));
    return u.lengthSq() < 0.05 ? u.set(0, 1, 0) : u.normalize();
  }
  /** dove sta l'escursionista (i suoi piedi, cioè l'origine della figura) date le mani: spalle poco sotto la mano più alta */
  private bodyTarget(out: THREE.Vector3) {
    const n = this.wallN;
    const wu = this.wallUp(n);
    const avg = this.handPos[0].clone().add(this.handPos[1]).multiplyScalar(0.5);
    const gap = Math.abs(this.handPos[0].clone().sub(this.handPos[1]).dot(wu)) / 2;
    return out.copy(avg).addScaledVector(wu, gap - 0.45 - 1.38).addScaledVector(n, 0.42);
  }
  /** dove vorrebbe andare un piede: sotto il bacino, un po' di lato; se c'è un appoggio vicino ci va sopra */
  private footTarget(f: 0 | 1) {
    const n = this.wallN, wu = this.wallUp(n);
    const want = this.body.clone().addScaledVector(n, -0.42).addScaledVector(wu, 0.3).addScaledVector(this.right, f === 0 ? -0.2 : 0.2);
    let on: Foot | null = null, bd = 0.5;
    for (const fh of this.footholds) {
      const d = fh.pos.distanceTo(want);
      // niente gambe incrociate: il piede sinistro sta a sinistra del bacino, il destro a destra
      const side = fh.pos.clone().sub(this.body).dot(this.right);
      if (f === 0 ? side > 0.08 : side < -0.08) continue;
      if (d < bd && fh !== this.footOn[f === 0 ? 1 : 0]) (bd = d), (on = fh);
    }
    if (on) return { pos: on.pos, on };
    // niente appoggi: il piede va in aderenza sulla roccia
    const hit = this.rock.cast(want.clone().addScaledVector(n, 1.5), n.clone().negate());
    return { pos: hit ? hit.point.clone().addScaledVector(hit.n, 0.05) : want, on: null };
  }

  /** la presa migliore nella direzione chiesta (sullo schermo: su, giù, destra, sinistra) */
  private pick(upIn: number, rightIn: number) {
    const d = this.up.clone().multiplyScalar(upIn).addScaledVector(this.right, rightIn);
    if (d.lengthSq() < 0.04) return null;
    d.normalize();
    const center = this.handPos[0].clone().add(this.handPos[1]).multiplyScalar(0.5);
    const n = this.wallN;
    let best: Hold | null = null, score = -Infinity;
    for (const h of this.holds) {
      if (h === this.hands[0] || h === this.hands[1]) continue;
      const v = h.pos.clone().sub(center);
      const dist = v.length();
      if (dist < 0.3 || dist > 1.9) continue;
      v.addScaledVector(n, -v.dot(n));
      const dot = v.normalize().dot(d.clone().addScaledVector(n, -d.dot(n)).normalize());
      if (dot < 0.4) continue;
      const s = dot * 1.6 - dist * 0.25 + (h.route ? 0.2 : 0);
      if (s > score) (score = s), (best = h);
    }
    return best;
  }

  /** la mano `hand` arriva alla presa? Ti tiene l'altra mano: la presa deve stare entro un braccio e poco più da lei */
  private reachable(h: Hold, hand: 0 | 1) {
    if (h === this.hands[0] || h === this.hands[1]) return false;
    const other = this.handPos[hand === 0 ? 1 : 0];
    const d = h.pos.distanceTo(other);
    // niente braccia incrociate: la sinistra resta a sinistra della destra (e viceversa)
    const side = h.pos.clone().sub(other).dot(this.right);
    if (hand === 0 ? side > 0.12 : side < -0.12) return false;
    return d >= 0.3 && d <= 1.75 && h.pos.y - other.y > -1;
  }
  /** con quale mano conviene andarci: una che ci arrivi, la più bassa o quella dal lato giusto */
  private handFor(h: Hold): 0 | 1 | null {
    const ok0 = this.reachable(h, 0), ok1 = this.reachable(h, 1);
    if (ok0 && !ok1) return 0;
    if (ok1 && !ok0) return 1;
    if (!ok0 && !ok1) return null;
    const center = this.handPos[0].clone().add(this.handPos[1]).multiplyScalar(0.5);
    const side = h.pos.clone().sub(center).dot(this.right);
    if (side < -0.7) return 0;
    if (side > 0.7) return 1;
    return this.handPos[0].y <= this.handPos[1].y ? 0 : 1;
  }
  private startMove(hand: 0 | 1, to: Hold) {
    this.move = { hand, from: this.handPos[hand].clone(), to, t: 0 };
    this.phase = "move";
    this.shaking = false;
    this.strength -= MOVE_COST[to.kind];
  }

  /**
   * Mouse o dita: `kind` è "move" (passaggio del mouse), un tasto del mouse o "tap" (tocco). Si prende la presa più
   * vicina al punto, sullo schermo; ci va la mano che ci arriva (se ci arrivano tutte e due, quella più in basso o dal
   * lato giusto).
   */
  pointer(x: number, y: number, camera: THREE.Camera, kind: "move" | "tap" | number) {
    if (!this.active || this.phase !== "climb") return;
    const v = new THREE.Vector3();
    let best: Hold | null = null, bd = kind === "tap" ? 70 : 50;
    for (const h of this.holds) {
      if (h.pos.distanceTo(this.body) > 9) continue;
      v.copy(h.pos).project(camera);
      if (v.z > 1) continue;
      const d = Math.hypot((v.x * 0.5 + 0.5) * innerWidth - x, (-v.y * 0.5 + 0.5) * innerHeight - y);
      if (d < bd) (bd = d), (best = h);
    }
    if (kind === "move") {
      this.hover = best;
      this.hoverOk = !!best && this.handFor(best) !== null;
      return;
    }
    if (!best) return;
    const hand = this.handFor(best);
    if (hand === null) {
      this.hint(best === this.hands[0] || best === this.hands[1] ? "Ci sei già, su quella presa." : best.pos.y > this.body.y ? "Troppo lontana: prima avvicinati con le prese che hanno il cerchio bianco." : "Quella è sotto di te: punta più in alto, verso la presa gialla.");
      sound.ui("fail");
      return;
    }
    this.startMove(hand, best);
  }

  /** scuotere le braccia (F o pulsante tenuto premuto) */
  setShake(on: boolean) {
    this.shaking = on && this.active && this.phase === "climb";
    if (this.shaking) {
      const hold = this.hands[0].kind === "jug" || this.hands[1].kind === "jug" ? "Scuoti: la mano libera riposa mentre l'altra tiene la presa grande." : "Scuoti… ma la mano che tiene è su una presa piccola: si stanca lo stesso.";
      this.hint(hold);
    }
  }

  /** Spazio: «Calami!» (l'istruttore ti cala a terra) */
  letGo() {
    if (!this.active || this.phase === "lower") return;
    this.startLower(this.withRope ? "Davide ti cala giù: brava, la prossima volta più in alto!" : "Salti giù sul materassino, ginocchia morbide.");
  }

  /**
   * La calata: seduta nell'imbrago, con i piedi che camminano all'indietro sulla parete, lungo la via (prima si scendeva
   * in linea retta e, sotto la pancia del masso, la figura finiva dentro la roccia e spariva).
   */
  private startLower(msg: string) {
    this.phase = "lower";
    this.move = null;
    this.step = null;
    this.shaking = false;
    this.ring.visible = false;
    if (!this.withRope) {
      // senza corda: un salto, staccandosi dalla roccia, fino al materassino
      const pad = this.routeBase.clone().addScaledVector(this.out, 0.7);
      pad.y = this.t.heightAt(pad.x, pad.z) + 0.28;
      this.lowerPath = [this.body.clone(), this.body.clone().addScaledVector(this.wallN, 1.3).addScaledVector(this.up, 0.25), pad];
      this.lowerNormals = [this.wallN.clone(), this.wallN.clone(), this.out.clone()];
      this.lowerDone = 0;
      this.timer = 0;
      ui.toast(msg);
      this.hint("Giù sul materassino.");
      return;
    }
    const top = Math.max(0, this.route.findIndex((h) => h.pos.y > this.body.y + 1.2));
    const wallPts: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];
    for (let k = top; k >= 0; k--) {
      const h = this.route[k];
      wallPts.push(h.pos.clone().addScaledVector(this.wallUp(h.n), -1.3));
      normals.push(h.n.clone());
    }
    // da seduta nell'imbrago: bacino a un passo dalla parete, piedi contro la roccia
    this.lowerPath = [this.body.clone(), ...wallPts.map((p, k) => p.clone().addScaledVector(normals[k], 0.9).addScaledVector(this.up, -0.85))];
    this.lowerNormals = [this.wallN.clone(), ...normals];
    // in fondo: in piedi sul prato
    const end = this.routeBase.clone();
    this.lowerPath.push(end);
    this.lowerNormals.push(this.out.clone());
    this.lowerDone = 0;
    this.timer = 0;
    ui.toast(msg);
    this.hint("Calata: siediti nell'imbrago, piedi contro la roccia.");
  }

  private stop() {
    this.active = false;
    this.hiker.climbing = false;
    this.hiker.climbGearOn(false);
    this.pack.visible = false;
    this.rope.visible = false;
    this.ring.visible = false;
    this.glow.visible = false;
    this.dots.forEach((d) => (d.visible = false));
    this.hover = null;
    this.shaking = false;
    this.hud.classList.remove("on");
    this.hiker.root.position.copy(this.routeBase).addScaledVector(this.out, 1.2);
    this.hiker.root.position.y = this.t.heightAt(this.hiker.root.position.x, this.hiker.root.position.z);
    this.hiker.heading = Math.atan2(this.out.x, this.out.z);
  }

  private puff(at: THREE.Vector3, n: THREE.Vector3) {
    for (let k = 0; k < 8; k++) {
      if (this.puffs.length >= 24) this.puffs.shift();
      const v = n.clone().multiplyScalar(0.4 + Math.random() * 0.5).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).multiplyScalar(0.6));
      this.puffs.push({ p: at.clone(), v, life: 0.7 + Math.random() * 0.4 });
    }
  }

  /** a ogni fotogramma (solo quando sei in parete): `upIn`, `rightIn` da −1 a 1 */
  update(dt: number, upIn: number, rightIn: number) {
    const h = this.hiker;
    const want = Math.hypot(upIn, rightIn) > 0.5;
    const wu = this.wallUp(this.wallN);
    if (this.phase === "climb" || this.phase === "move") {
      // forza: si consuma sulle prese piccole, si recupera su quelle grandi; i piedi in aderenza stancano un po' di più
      // scuotendo, tiene una mano sola (la presa migliore) e l'altra recupera: aiuta solo se la presa che tiene è buona
      const better = DRAIN[this.hands[0].kind] <= DRAIN[this.hands[1].kind] ? this.hands[0] : this.hands[1];
      const smear = (this.footOn[0] ? 0 : 0.008) + (this.footOn[1] ? 0 : 0.008);
      const drain = (this.shaking && this.phase === "climb" ? BASE_DRAIN + 2 * DRAIN[better.kind] - 0.06 : BASE_DRAIN + DRAIN[this.hands[0].kind] + DRAIN[this.hands[1].kind]) + smear;
      this.strength = THREE.MathUtils.clamp(this.strength - drain * dt, 0, 1);
      // in alternativa al mouse: le direzioni (tastiera o levetta) scelgono la presa
      this.candidate = this.phase === "climb" && want ? this.pick(upIn, rightIn) : null;
      if (this.phase === "climb" && want && this.candidate && (!this.inputHeld || this.timer > 0.25)) {
        const hand = this.handFor(this.candidate);
        if (hand !== null) this.startMove(hand, this.candidate);
      }
      this.inputHeld = want;
      this.timer = want ? this.timer + dt : 0;
      if (this.move) {
        const m = this.move;
        m.t = Math.min(1, m.t + dt / 0.5);
        const e = m.t * m.t * (3 - 2 * m.t);
        // la mano si stacca dalla roccia, va, e si appoggia
        this.handPos[m.hand].lerpVectors(m.from, m.to.pos, e).addScaledVector(m.to.n, Math.sin(m.t * Math.PI) * 0.22);
        if (m.t >= 1) {
          this.hands[m.hand] = m.to;
          this.handPos[m.hand].copy(m.to.pos);
          this.move = null;
          this.phase = "climb";
          this.timer = 0;
          this.puff(m.to.pos, m.to.n);
          sound.step("rock");
          if (m.to === this.route[this.route.length - 1]) {
            this.phase = "top";
            this.timer = 0;
            if (this.opts.onTop) this.opts.onTop();
            else state.boulder = true;
            save();
            sound.ui("done");
            ui.toast(this.withRope ? "<b>In catena!</b> Hai salito la via del Sasso Remenno." : `<b>In cima!</b> Hai risolto il blocco ${this.opts.title ?? ""}.`);
            ui.learned(learn(this.withRope ? "arrampicata" : "blocco"));
            this.hint(this.withRope ? "In catena: moschettona la sosta. Ora Davide ti cala." : "In cima al blocco! Ora salta giù sul materassino.");
          } else if (m.to.kind === "jug" && this.hands[m.hand === 0 ? 1 : 0].kind === "jug") this.hint("Due prese grandi: punto di riposo. Tieni premuto F e scuoti le braccia.");
          else this.hint(`Sei su ${KIND_NAME[m.to.kind]}${m.to.kind === "crimp" ? ": stanca in fretta, non restarci troppo" : ""}. ${this.withRope ? "Spazio: «Calami!»" : "Spazio: salta giù"}`);
        }
      }
      if (this.strength <= 0 && this.phase !== "top" && !this.withRope) {
        // senza corda: si cade sul materassino (per questo c'è, e qualcuno para)
        sound.ui("fail");
        ui.learned(learn("blocco"));
        this.startLower(`<b>Caduta!</b> Il materassino ti ha presa e ${this.opts.partner?.name ?? "chi para"} ti ha accompagnata giù. Riprova!`);
      } else if (this.strength <= 0 && this.phase !== "top") {
        // volo: la corda ti tiene (scivoli un po' lungo la parete, staccata dalla roccia)
        this.phase = "fall";
        this.move = null;
        this.step = null;
        this.timer = 0;
        sound.ui("fail");
        ui.toast("<b>Volo!</b> La corda ti ha tenuta: riposati un attimo appesa e riparti.", "warn");
        ui.learned(learn("arrampicata"));
        this.lowerPath = [this.body.clone(), this.body.clone().addScaledVector(wu, -1.4).addScaledVector(this.wallN, 0.5)];
      }
      if (this.phase === "climb" || this.phase === "move" || this.phase === "top") {
        this.wallN.lerp(this.hands[0].n.clone().add(this.hands[1].n).normalize(), 1 - Math.exp(-3 * dt)).normalize();
        const tgt = this.bodyTarget(new THREE.Vector3());
        this.body.lerp(tgt, 1 - Math.exp(-7 * dt));
        this.updateFeet(dt);
      }
    } else if (this.phase === "fall" || this.phase === "hang") {
      this.timer += dt;
      if (this.phase === "fall") {
        const k = Math.min(1, this.timer / 0.45);
        this.body.lerpVectors(this.lowerPath[0], this.lowerPath[1], k * k);
        if (k >= 1) (this.phase = "hang"), (this.timer = 0);
      } else {
        this.strength = Math.min(0.6, this.strength + dt * 0.35);
        this.body.addScaledVector(this.wallN, Math.sin(this.timer * 2.5) * 0.002);
        if (this.timer > 1.6) {
          // si riattacca alle prime due prese della via sopra di te (la sinistra sulla presa di sinistra)
          const i = this.route.findIndex((x) => x.pos.y > this.body.y + 1.5);
          if (i >= 0 && i < this.route.length - 2) {
            const a = this.route[i], b = this.route[i + 1];
            this.hands = i % 2 === 0 ? [a, b] : [b, a];
            this.handPos[0].copy(this.hands[0].pos);
            this.handPos[1].copy(this.hands[1].pos);
            this.wallN.copy(a.n).add(b.n).normalize();
            this.bodyTarget(this.body);
            for (const f of [0, 1] as const) {
              const d = this.footTarget(f);
              this.feet[f].copy(d.pos);
              this.footOn[f] = d.on;
            }
            this.phase = "climb";
            this.hint("Di nuovo in parete: riparti dalla presa gialla. Spazio: «Calami!»");
          } else this.startLower("Davide ti cala a terra.");
        }
      }
    } else if (this.phase === "top") {
      this.timer += dt;
      this.updateFeet(dt);
      if (this.timer > 1.4) this.startLower(this.withRope ? "Davide ti cala giù. Brava!" : "Salti giù sul materassino. Brava!");
    } else if (this.phase === "lower") {
      // giù lungo la spezzata, a velocità costante
      this.lowerDone += dt * (this.withRope ? 2.2 : 5);
      let d = this.lowerDone, k = 0;
      while (k < this.lowerPath.length - 1 && d > this.lowerPath[k].distanceTo(this.lowerPath[k + 1])) d -= this.lowerPath[k].distanceTo(this.lowerPath[k + 1]), k++;
      if (k >= this.lowerPath.length - 1) {
        this.stop();
        h.climbPose(0, 0, 0.5);
        return;
      }
      const seg = this.lowerPath[k].distanceTo(this.lowerPath[k + 1]);
      const f = seg > 0 ? d / seg : 1;
      this.body.lerpVectors(this.lowerPath[k], this.lowerPath[k + 1], f);
      this.wallN.lerp(this.lowerNormals[k + 1], 1 - Math.exp(-3 * dt)).normalize();
    }
    // mai dentro la roccia: bacino, petto e testa restano fuori dalla parete (sotto la pancia del masso, o su una placca
    // in calata, la figura ci finiva dentro e spariva)
    this.keepOut();
    // mai sotto il prato
    const ground = this.t.heightAt(this.body.x, this.body.z);
    if (this.body.y < ground) this.body.y = ground;
    // l'escursionista in parete: rivolta alla roccia
    h.root.position.copy(this.body);
    const hz = Math.hypot(this.wallN.x, this.wallN.z);
    h.heading = hz > 0.25 ? Math.atan2(-this.wallN.x, -this.wallN.z) : Math.atan2(-this.out.x, -this.out.z);
    h.root.rotation.y = h.heading;
    this.pose();
    // il punto dell'imbrago (la corda arriva qui)
    const harness = this.body.clone().addScaledVector(this.up, 0.95);
    // presa evidenziata: quella sotto il mouse (gialla se ci arrivi, grigia se no) o quella scelta con le direzioni
    const shown = this.candidate ?? this.hover;
    const ok = this.candidate ? true : this.hoverOk;
    this.ring.visible = !!shown && this.phase === "climb";
    if (shown) {
      this.ring.position.copy(shown.pos);
      this.ring.lookAt(shown.pos.clone().add(shown.n));
      const mat = this.ring.material as THREE.MeshBasicMaterial;
      mat.color.set(ok ? "#f2b632" : "#8d8a90");
      mat.opacity = ok ? 0.65 + Math.sin(performance.now() / 150) * 0.3 : 0.7;
    }
    // il prossimo passo della via
    const next = this.phase === "climb" ? this.next() : null;
    this.glow.visible = !!next;
    if (next) {
      this.glow.position.copy(next.pos).addScaledVector(next.n, 0.02);
      this.glow.lookAt(next.pos.clone().add(next.n));
      (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(performance.now() / 220));
    }
    // le prese a cui arrivi adesso
    let k = 0;
    if (this.phase === "climb")
      for (const hd of this.holds) {
        if (k >= this.dots.length) break;
        if (hd === shown || !(this.reachable(hd, 0) || this.reachable(hd, 1))) continue;
        const d = this.dots[k++];
        d.visible = true;
        d.position.copy(hd.pos);
        d.lookAt(hd.pos.clone().add(hd.n));
      }
    for (; k < this.dots.length; k++) this.dots[k].visible = false;
    // magnesite
    const cp = this.chalk.geometry.attributes.position as THREE.BufferAttribute;
    this.puffs = this.puffs.filter((q) => (q.life -= dt) > 0);
    this.puffs.forEach((q, i) => {
      q.v.multiplyScalar(1 - 2.5 * dt).y -= 0.4 * dt;
      q.p.addScaledVector(q.v, dt);
      cp.setXYZ(i, q.p.x, q.p.y, q.p.z);
    });
    for (let i = this.puffs.length; i < 24; i++) cp.setXYZ(i, 0, -1e5, 0);
    cp.needsUpdate = true;
    this.chalk.visible = this.puffs.length > 0;
    // corda
    const r = this.rope.geometry.attributes.position as THREE.BufferAttribute;
    r.setXYZ(0, this.base.x, this.base.y + 1.1, this.base.z);
    r.setXYZ(1, this.anchor.x, this.anchor.y, this.anchor.z);
    r.setXYZ(2, harness.x, harness.y, harness.z);
    r.needsUpdate = true;
    this.pulled += Math.abs(this.body.y - this.lastY);
    this.lastY = this.body.y;
    // forza
    const bar = this.hud.querySelector<HTMLElement>(".climb-bar i")!;
    bar.style.transform = `scaleX(${this.strength})`;
    this.hud.classList.toggle("low", this.strength < 0.25);
  }

  private keepOut() {
    const n = this.wallN;
    for (const dy of [0.5, 1.1, 1.7]) {
      const q = this.body.clone().addScaledVector(this.up, dy);
      const hit = this.rock.cast(q.clone().addScaledVector(n, 4), n.clone().negate());
      if (!hit) continue;
      const pen = hit.point.clone().sub(q).dot(n) + 0.35;
      if (pen > 0) this.body.addScaledVector(n, pen);
    }
  }

  /** i piedi salgono uno alla volta, quando il bacino si è alzato e le mani sono ferme */
  private updateFeet(dt: number) {
    if (this.step) {
      const s = this.step;
      s.t = Math.min(1, s.t + dt / 0.3);
      const e = s.t * s.t * (3 - 2 * s.t);
      this.feet[s.foot].lerpVectors(s.from, s.to, e).addScaledVector(s.n, Math.sin(s.t * Math.PI) * 0.18);
      if (s.t >= 1) {
        this.feet[s.foot].copy(s.to);
        this.footOn[s.foot] = s.on;
        this.step = null;
      }
      return;
    }
    if (this.move) return;
    // il piede più lontano da dove dovrebbe stare
    let worst: 0 | 1 | null = null, wd = 0.32;
    const targets = [this.footTarget(0), this.footTarget(1)];
    for (const f of [0, 1] as const) {
      const d = this.feet[f].distanceTo(targets[f].pos);
      if (d > wd) (wd = d), (worst = f);
    }
    if (worst === null) return;
    const tg = targets[worst];
    this.step = { foot: worst, from: this.feet[worst].clone(), to: tg.pos.clone(), n: this.wallN.clone(), t: 0, on: tg.on };
  }

  /** la posa: mani sulle prese, piedi sugli appoggi; appesa o in calata, mani sulla corda e piedi contro la roccia */
  private pose() {
    const h = this.hiker, n = this.wallN, wu = this.wallUp(n);
    const lean = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) * 0.8, -0.25, 0.85);
    if (this.phase === "lower" && !this.withRope) {
      // il salto giù dal blocco: gambe raccolte, braccia avanti
      h.climbPose(0.3, 0.3, 0.8);
      return;
    }
    if (this.phase === "lower" || this.phase === "hang" || this.phase === "fall") {
      // seduta nell'imbrago: busto indietro, mani sulla corda davanti al petto, piedi alla parete
      const harness = this.body.clone().addScaledVector(this.up, 0.95);
      const toAnchor = this.anchor.clone().sub(harness).normalize();
      const r = this.right;
      const handA = harness.clone().addScaledVector(toAnchor, 0.55).addScaledVector(r, -0.07);
      const handB = harness.clone().addScaledVector(toAnchor, 0.35).addScaledVector(r, 0.07);
      const wall = this.rock.cast(harness.clone().addScaledVector(n, 1.5), n.clone().negate());
      const wp = wall ? wall.point : harness.clone().addScaledVector(n, -0.9);
      // in calata i piedi "camminano" all'indietro
      const walk = this.phase === "lower" ? this.lowerDone * 4 : 0;
      const fL = wp.clone().addScaledVector(wu, -0.35 + Math.max(0, Math.sin(walk)) * 0.15).addScaledVector(r, -0.2).addScaledVector(n, 0.05 + Math.max(0, Math.sin(walk)) * 0.12);
      const fR = wp.clone().addScaledVector(wu, -0.35 + Math.max(0, -Math.sin(walk)) * 0.15).addScaledVector(r, 0.2).addScaledVector(n, 0.05 + Math.max(0, -Math.sin(walk)) * 0.12);
      // vicino a terra, gli ultimi passi: i piedi tornano sotto di te
      const nearGround = this.body.y - this.t.heightAt(this.body.x, this.body.z) < 0.4;
      if (nearGround) h.climbPose(0, 0, 0.5);
      else h.climbIK(handA, handB, fL, fR, -0.55);
      return;
    }
    const free = this.shaking && this.phase === "climb" ? (DRAIN[this.hands[0].kind] <= DRAIN[this.hands[1].kind] ? 1 : 0) : -1;
    h.climbIK(free === 0 ? null : this.handPos[0], free === 1 ? null : this.handPos[1], this.feet[0], this.feet[1], lean);
    // il braccio libero penzola e si scuote
    if (free !== -1 && h.freeArm !== -1) h.shakeArm(h.freeArm, performance.now() / 1000);
  }

  /** il suggerimento: la presa della via subito sopra quelle che tieni (o, se non ci arrivi, la più alta a portata) */
  private next() {
    const top = Math.max(this.route.indexOf(this.hands[0]), this.route.indexOf(this.hands[1]));
    const after = this.route[top + 1];
    if (after && this.handFor(after) !== null) return after;
    for (let i = this.route.length - 1; i >= 0; i--) if (this.handFor(this.route[i]) !== null) return this.route[i];
    return null;
  }
  /** a che punto sei della via: la presa più alta che tieni */
  progress() {
    return { n: Math.max(this.route.indexOf(this.hands[0]), this.route.indexOf(this.hands[1])) + 1, total: this.route.length };
  }

  /** la telecamera durante la scalata: fuori dalla parete, un po' più in alto di te, guarda le prese che vengono */
  camera() {
    const dir = this.out.clone().addScaledVector(this.wallN, 0.7).normalize();
    const pos = this.body.clone().addScaledVector(dir, 8).addScaledVector(this.right, 2).addScaledVector(this.up, 2.2);
    // mai sotto il prato (prima, in fondo alla via, finiva sotto terra e si vedeva tutto dal basso)
    const g = this.t.heightAt(pos.x, pos.z) + 1.5;
    if (pos.y < g) pos.y = g;
    return { pos, target: this.body.clone().addScaledVector(this.up, 2) };
  }

  /** l'istruttore resta al suo posto; mentre sei in parete tiene la corda e la recupera (o la dà) */
  idle(dt: number) {
    // chi fa sicura (o para) guarda la parete mentre arrampichi; quando arrivi a piedi, si gira verso di te
    const me = this.hiker.root.position, b = this.belayer.root.position;
    const d = Math.hypot(me.x - b.x, me.z - b.z);
    const want = this.active || d > 14 ? Math.atan2(-this.out.x, -this.out.z) : Math.atan2(me.x - b.x, me.z - b.z);
    this.belayer.heading += Math.atan2(Math.sin(want - this.belayer.heading), Math.cos(want - this.belayer.heading)) * (1 - Math.exp(-4 * dt));
    this.belayer.update(dt, new THREE.Vector2(), false, this.t);
    if (this.active) this.belayer.belayPose(this.pulled);
  }
}
