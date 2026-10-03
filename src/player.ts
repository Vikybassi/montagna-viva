import * as THREE from "three";
import type { Terrain } from "./world";

const DOWN = new THREE.Vector3(0, -1, 0);
export type Outfit = { hat: "beanie" | "sun" | "band"; glasses: boolean; bandana: string | null; poles: boolean };

/** L'escursionista: figura fatta di forme semplici (giacca bordeaux, berretto giallo, zaino verde acqua). Alta 1,8. */
export class Hiker {
  readonly root = new THREE.Group();
  readonly velocity = new THREE.Vector2();
  heading = 0; // direzione in cui guarda (radianti, 0 = verso sud)
  speed = 0;
  private body = new THREE.Group();
  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private phase = 0;
  private mats!: { jacket: THREE.MeshStandardMaterial; hat: THREE.MeshStandardMaterial };
  /** quello che si indossa: a piedi zaino e cappello scelto, in parete casco e imbrago */
  private gear!: Record<"beanie" | "sun" | "band" | "glasses" | "bandana" | "poles" | "pack" | "climb", THREE.Object3D[]>;
  private inClimbGear = false;
  private outfit: Outfit = { hat: "beanie", glasses: false, bandana: null, poles: false };
  private mOutfit!: { sun: THREE.MeshStandardMaterial; band: THREE.MeshStandardMaterial; bandana: THREE.MeshStandardMaterial };

  /** cambia i colori (la giacca scelta all'inizio, o quella di un altro giocatore) */
  setLook(look: { jacket?: string; hat?: string }) {
    if (look.jacket) this.mats.jacket.color.set(look.jacket);
    if (look.hat) this.mats.hat.color.set(look.hat);
  }

  /** un altro giocatore: posizione e stato arrivano dalla rete, qui si anima soltanto */
  remote(dt: number, pos: THREE.Vector3, heading: number, speed: number, gliding: boolean, airborne: boolean, swimming: boolean, climbing = false) {
    const p = this.root.position;
    p.lerp(pos, 1 - Math.exp(-10 * dt));
    const d = Math.atan2(Math.sin(heading - this.heading), Math.cos(heading - this.heading));
    this.heading += d * (1 - Math.exp(-10 * dt));
    this.root.rotation.y = this.heading;
    this.speed = speed;
    this.gliding = gliding;
    this.airborne = airborne;
    this.swimming = swimming;
    this.wing.visible = gliding;
    if (climbing) {
      this.phase += dt * 2;
      this.climbPose(0.5 + Math.sin(this.phase) * 0.5, 0.5 - Math.sin(this.phase) * 0.5, 0.5 + Math.sin(this.phase * 0.5) * 0.5);
    } else this.pose(dt);
  }

  /** i colori si possono cambiare: così la stessa figura fa anche la guida, i custodi e la glaciologa */
  constructor(look: Partial<Record<"jacket" | "pants" | "skin" | "hat" | "pack" | "hair", string>> = {}) {
    const m = (color: string, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
    const L = { jacket: "#c2375a", pants: "#3b3550", skin: "#f0c3a6", hat: "#f2b632", pack: "#2f8f8a", hair: "#8a5a3a", ...look };
    const jacket = m(L.jacket, 0.6), pants = m(L.pants), skin = m(L.skin), boot = m("#4a3427"), hat = m(L.hat), pack = m(L.pack, 0.7), hair = m(L.hair);
    this.mats = { jacket, hat };
    const limb = (len: number, r: number, mat: THREE.Material, footMat?: THREE.Material) => {
      const pivot = new THREE.Group();
      const g = new THREE.CapsuleGeometry(r, len, 3, 8);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.y = -len / 2 - r;
      pivot.add(mesh);
      if (footMat) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(r * 2.2, r * 1.4, r * 3.4), footMat);
        foot.position.set(0, -len - r * 1.6, r * 0.7);
        pivot.add(foot);
      }
      return pivot;
    };
    this.legL = limb(0.55, 0.11, pants, boot);
    this.legR = limb(0.55, 0.11, pants, boot);
    this.legL.position.set(-0.13, 0.86, 0);
    this.legR.position.set(0.13, 0.86, 0);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 4, 10), jacket);
    torso.position.y = 1.15;
    torso.scale.set(1, 1, 0.8);
    this.armL = limb(0.42, 0.075, jacket);
    this.armR = limb(0.42, 0.075, jacket);
    this.armL.position.set(-0.3, 1.38, 0);
    this.armR.position.set(0.3, 1.38, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin);
    head.position.y = 1.62;
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat);
    beanie.position.y = 1.66;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), hat);
    pom.position.y = 1.86;
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.18, 3, 6), hair);
    tail.position.set(0, 1.5, -0.17);
    tail.rotation.x = 0.4;
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.24), pack);
    backpack.position.set(0, 1.18, -0.27);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 8), m("#f4e4de"));
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 1.47, -0.27);
    // la faccia: occhi, guance rosa e un sorriso (come i personaggi di Coastal World, semplici ma vivi)
    const eyeM = m("#2a1f2b", 0.4), cheekM = new THREE.MeshBasicMaterial({ color: "#f39a92", transparent: true, opacity: 0.75 });
    const face = new THREE.Group();
    for (const x of [-0.058, 0.058]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), eyeM);
      eye.scale.set(0.85, 1.15, 0.5);
      eye.position.set(x, 1.64, 0.152);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.007, 5, 4), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      shine.position.set(x + 0.008, 1.648, 0.163);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.026, 12), cheekM);
      cheek.position.set(x * 1.55, 1.6, 0.137);
      cheek.lookAt(cheek.position.clone().add(new THREE.Vector3(x * 4, 0, 1)));
      face.add(eye, shine, cheek);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0075, 4, 12, Math.PI), eyeM);
    smile.rotation.z = Math.PI;
    smile.position.set(0, 1.6, 0.163);
    face.add(smile);
    // per arrampicare: casco e imbrago (lo zaino resta a terra)
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m("#f26b2a", 0.45));
    helmet.position.y = 1.64;
    helmet.scale.set(1, 0.95, 1.08);
    const harness = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 5, 16), m("#2c3e8f"));
    harness.rotation.x = Math.PI / 2;
    harness.position.y = 0.9;
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 4, 10), m("#c9ccd2", 0.4));
    loop.position.set(0, 0.92, 0.25);
    // l'armadio: cappello da sole, fascia, occhiali, bandana, bastoncini (si vedono solo se li indossi)
    this.mOutfit = { sun: m("#e9dcc0"), band: m("#2f8f8a"), bandana: m("#c2375a") };
    const sunHat = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 18), this.mOutfit.sun);
    brim.position.y = 1.75;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.15, 14), this.mOutfit.sun);
    crown.position.y = 1.83;
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.171, 0.171, 0.035, 14), m("#6b4f3a"));
    ribbon.position.y = 1.78;
    sunHat.add(brim, crown, ribbon);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 6, 18), this.mOutfit.band);
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.68;
    const glasses = new THREE.Group();
    const lensM = m("#1d1b24", 0.2);
    for (const x of [-0.07, 0.07]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.02), lensM);
      lens.position.set(x, 1.645, 0.16);
      glasses.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), lensM);
    bridge.position.set(0, 1.655, 0.165);
    glasses.add(bridge);
    const bandana = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.1, 12), this.mOutfit.bandana);
    bandana.position.y = 1.45;
    // i bastoncini stanno nelle mani: figli delle braccia, così oscillano con il passo
    const poles: THREE.Object3D[] = [];
    for (const arm of [this.armL, this.armR]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.95, 5), m("#3a3f4a", 0.4));
      pole.position.set(0, -0.6 - 0.42, 0.1);
      pole.rotation.x = 0.22;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6), m("#22252c"));
      grip.position.set(0, -0.56, 0.01);
      arm.add(pole, grip);
      poles.push(pole, grip);
    }
    this.gear = { beanie: [beanie, pom], sun: [sunHat], band: [band], glasses: [glasses], bandana: [bandana], poles, pack: [backpack, roll], climb: [helmet, harness, loop] };
    this.body.add(face, this.legL, this.legR, torso, this.armL, this.armR, head, beanie, pom, tail, backpack, roll, helmet, harness, loop, sunHat, band, glasses, bandana);
    this.applyGear();
    this.body.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.root.add(this.body);
    this.wing = this.buildWing();
    this.root.add(this.wing);
  }

  /** "pavimento" in più oltre al terreno (il Sasso Remenno: ci si cammina sopra e non lo si attraversa) */
  groundFn: ((x: number, z: number) => number | null) | null = null;
  /** quanto vicino al bordo della mappa si può arrivare (unità di gioco) */
  worldMargin = 4;
  /** gli ostacoli solidi (case, tronchi): riceve dove vorresti andare e restituisce dove puoi stare */
  collide: ((x: number, z: number, y: number) => { x: number; z: number; stuck: boolean }) | null = null;
  groundAt(t: Terrain, x: number, z: number) {
    const g = t.heightAt(x, z), o = this.groundFn?.(x, z) ?? null;
    return o !== null && o > g ? o : g;
  }
  /** in parete (arrampicata): la posizione la decide la scalata, qui solo la posa */
  climbing = false;
  /** in aria: dopo un salto, giù da un salto di roccia o in parapendio */
  airborne = false;
  gliding = false;
  private vy = 0;
  private wing: THREE.Group;
  /** chiamata a ogni passo (per il suono): superficie sotto i piedi */
  onStep: ((surface: "grass" | "rock" | "snow" | "water") => void) | null = null;
  /** in acqua, in un lago: si nuota (piano, senza correre) */
  swimming = false;
  onLand: (() => void) | null = null;

  private buildWing() {
    // il parapendio: una vela ad arco a strisce, con le funi
    const g = new THREE.Group();
    const cols = ["#c2375a", "#f2b632", "#f4e4de", "#2f8f8a", "#c2375a", "#f2b632", "#f4e4de"];
    const n = cols.length;
    for (let i = 0; i < n; i++) {
      const a = -0.95 + (1.9 * (i + 0.5)) / n;
      const cell = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 1.5), new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.6, flatShading: true }));
      cell.position.set(Math.sin(a) * 4.2, Math.cos(a) * 4.2 + 0.4, 0);
      cell.rotation.z = -a;
      g.add(cell);
    }
    const line = new THREE.LineBasicMaterial({ color: "#3b3550" });
    for (const s of [-1, 1]) {
      const pts = [new THREE.Vector3(0.25 * s, 1.5, 0), new THREE.Vector3(Math.sin(0.8 * s) * 4.2, Math.cos(0.8) * 4.2 + 0.4, 0)];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), line));
      const pts2 = [new THREE.Vector3(0.25 * s, 1.5, 0), new THREE.Vector3(Math.sin(0.3 * s) * 4.2, Math.cos(0.3) * 4.2 + 0.4, 0)];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), line));
    }
    g.visible = false;
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return g;
  }

  /** salto (da terra) */
  jump() {
    if (this.airborne) return false;
    this.airborne = true;
    this.vy = 7.5;
    return true;
  }
  /** apre o chiude il parapendio (solo in aria e abbastanza in alto) */
  toggleGlide(t: Terrain) {
    const p = this.root.position;
    if (this.gliding) {
      this.gliding = false;
      this.wing.visible = false;
      return false;
    }
    if (!this.airborne || p.y - this.groundAt(t, p.x, p.z) < 1.2) return false;
    this.gliding = true;
    this.wing.visible = true;
    this.vy = Math.max(this.vy, -2);
    return true;
  }

  /**
   * Muove l'escursionista. `move` è la direzione voluta nel piano (x est, y = z sud), lunghezza 0..1; `run` corre.
   * In salita rallenta; oltre i 58° è parete e non si passa. Si può saltare, cadere dai salti di roccia e planare.
   */
  update(dt: number, move: THREE.Vector2, run: boolean, t: Terrain, runSpeed = 17) {
    const want = move.length() > 0.05;
    const p = this.root.position;
    const ground = this.groundAt(t, p.x, p.z);
    if (this.gliding) {
      // in volo: si gira verso dove spingi, avanti sempre, scende piano
      if (want) {
        const face = Math.atan2(move.x, move.y);
        const d = Math.atan2(Math.sin(face - this.heading), Math.cos(face - this.heading));
        this.heading += THREE.MathUtils.clamp(d, -1, 1) * 1.6 * dt;
      }
      const speed = 16;
      this.velocity.set(Math.sin(this.heading) * speed, Math.cos(this.heading) * speed);
      this.vy += (-2.4 - this.vy) * (1 - Math.exp(-2 * dt));
      this.wing.rotation.z = THREE.MathUtils.lerp(this.wing.rotation.z, 0, 0.1);
    } else {
      const top = (this.swimming ? 3.2 : run ? runSpeed : 9) * Math.min(1, move.length());
      let target = want ? top : 0;
      if (want) {
        const dir = move.clone().normalize();
        const ahead = 2;
        const h1 = this.groundAt(t, p.x + dir.x * ahead, p.z + dir.y * ahead);
        const grade = (h1 - ground) / ahead;
        const slope = THREE.MathUtils.radToDeg(Math.atan(Math.abs(grade)));
        if (grade > 0 && !this.airborne) target /= 1 + grade * 0.9;
        if (grade > 0 && slope > 58 && !this.airborne) target = 0; // parete: non si sale
        const k = 1 - Math.exp(-(this.airborne ? 2 : 10) * dt);
        this.velocity.lerp(dir.multiplyScalar(target), k);
        const face = Math.atan2(move.x, move.y);
        const d = Math.atan2(Math.sin(face - this.heading), Math.cos(face - this.heading));
        this.heading += d * (1 - Math.exp(-12 * dt));
      } else if (!this.airborne) this.velocity.multiplyScalar(Math.exp(-12 * dt));
    }
    let nx = p.x + this.velocity.x * dt, nz = p.z + this.velocity.y * dt;
    // case e tronchi: non si attraversano, si scivola lungo il muro
    if (this.collide) {
      const c = this.collide(nx, nz, p.y);
      if (c.stuck) (nx = p.x), (nz = p.z);
      else (nx = c.x), (nz = c.z);
    }
    const wall = this.groundAt(t, nx, nz) - p.y > 1.2 && !this.airborne; // una parete davanti (es. il masso): non si entra
    if (t.inside(nx, nz, this.worldMargin) && !wall) {
      p.x = nx;
      p.z = nz;
    }
    // nei laghi il "pavimento" è la superficie dell'acqua (si galleggia con le spalle fuori)
    const bottom = this.groundAt(t, p.x, p.z), wl = t.waterAt(p.x, p.z);
    this.swimming = wl !== null && bottom < wl - 1.1;
    const g2 = this.swimming ? wl! - 1.25 : bottom;
    if (this.airborne) {
      if (!this.gliding) this.vy -= 24 * dt;
      p.y += this.vy * dt;
      if (p.y <= g2) {
        p.y = g2;
        this.airborne = false;
        this.gliding = false;
        this.wing.visible = false;
        this.vy = 0;
        this.onLand?.();
      }
    } else if (g2 < p.y - 0.9 && this.velocity.length() > 4) {
      // il terreno sparisce sotto i piedi (salto di roccia): si vola
      this.airborne = true;
      this.vy = 0;
    } else p.y = g2;
    this.speed = this.velocity.length();
    this.root.rotation.y = this.heading;
    this.pose(dt, t);
  }

  /**
   * Posa da arrampicata: braccia in alto verso le prese (`reachL`, `reachR` da 0 a 1: quanto è tesa la mano che si
   * allunga), gambe che si alzano a turno (`step` da 0 a 1).
   */
  climbPose(reachL: number, reachR: number, step: number) {
    this.resetLimbs();
    this.armL.rotation.set(-2.75 - reachL * 0.35, 0, 0.2 - reachL * 0.1);
    this.armR.rotation.set(-2.75 - reachR * 0.35, 0, -0.2 + reachR * 0.1);
    this.legL.rotation.set(-0.25 - step * 0.7, 0, 0.15);
    this.legR.rotation.set(-0.25 - (1 - step) * 0.7, 0, -0.15);
    this.body.position.y = 0;
    this.body.rotation.x = 0.05;
  }

  /**
   * In parete, fatta bene: mani e piedi vanno davvero sui punti dati (coordinate del mondo). Ogni arto si gira verso il
   * suo punto e, se serve, si allunga o si piega un po' (le figure sono semplici: braccia e gambe sono un pezzo solo).
   * `null` per una mano = quella mano è libera (si scuote, o tiene la corda in calata). `lean`: busto in avanti (+) o
   * indietro (−), in radianti.
   */
  climbIK(handL: THREE.Vector3 | null, handR: THREE.Vector3 | null, footL: THREE.Vector3, footR: THREE.Vector3, lean: number) {
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(lean, 0, 0);
    this.root.updateMatrixWorld(true);
    const aim = (limb: THREE.Object3D, target: THREE.Vector3 | null, len: number) => {
      if (!target) return;
      const d = this.body.worldToLocal(target.clone()).sub(limb.position);
      const L = d.length();
      limb.quaternion.setFromUnitVectors(DOWN, d.divideScalar(Math.max(L, 1e-4)));
      limb.scale.set(1, THREE.MathUtils.clamp(L / len, 0.55, 1.5), 1);
    };
    // ogni mano e ogni piede all'arto dal suo lato, misurato sul corpo vero (spalla a spalla, anca ad anca): così
    // braccia e gambe non si incrociano mai, comunque sia girato il modello
    const pair = (l: THREE.Object3D, r: THREE.Object3D, a: THREE.Vector3 | null, b: THREE.Vector3 | null, len: number) => {
      const pl = l.getWorldPosition(new THREE.Vector3()), pr = r.getWorldPosition(new THREE.Vector3());
      const axis = pr.clone().sub(pl);
      const side = (v: THREE.Vector3) => v.clone().sub(pl).dot(axis);
      let [tl, tr] = [a, b];
      if (a && b) {
        if (side(a) > side(b)) [tl, tr] = [b, a];
      } else if (a || b) {
        const t = (a ?? b)!;
        const nearL = t.distanceToSquared(pl) <= t.distanceToSquared(pr);
        [tl, tr] = nearL ? [t, null] : [null, t];
      }
      aim(l, tl, len);
      aim(r, tr, len);
      return tl === null && tr !== null ? 0 : tr === null && tl !== null ? 1 : -1;
    };
    this.freeArm = pair(this.armL, this.armR, handL, handR, 0.57) as 0 | 1 | -1;
    pair(this.legL, this.legR, footL, footR, 0.8);
  }

  /** casco e imbrago al posto di zaino, cappello e bastoncini (e viceversa) */
  climbGearOn(on: boolean, helmet = true) {
    this.inClimbGear = on;
    this.climbHelmet = helmet;
    this.applyGear();
  }
  /** casco e imbrago solo con la corda: sui blocchi bassi si arrampica senza */
  private climbHelmet = true;
  /** i vestiti dell'armadio */
  setOutfit(o: Outfit & { hatColor?: string }) {
    this.outfit = o;
    if (o.hatColor) {
      this.mats.hat.color.set(o.hatColor);
      this.mOutfit.band.color.set(o.hatColor);
      this.mOutfit.sun.color.set(o.hatColor);
    }
    if (o.bandana) this.mOutfit.bandana.color.set(o.bandana);
    this.applyGear();
  }
  private applyGear() {
    const c = this.inClimbGear, o = this.outfit;
    const show = (k: keyof typeof this.gear, v: boolean) => this.gear[k].forEach((g) => (g.visible = v));
    show("beanie", !c && o.hat === "beanie");
    show("sun", !c && o.hat === "sun");
    show("band", !c && o.hat === "band");
    show("pack", !c);
    show("poles", !c && o.poles);
    show("glasses", o.glasses);
    show("bandana", !!o.bandana);
    show("climb", c && this.climbHelmet);
  }

  /** chi fa sicura: mani sulla corda, e quando c'è da recuperare (`pull` cresce) le braccia tirano a turno */
  belayPose(pull: number) {
    this.resetLimbs();
    const a = Math.sin(pull * 6);
    this.armL.rotation.set(-1.25 - a * 0.35, 0, 0.15);
    this.armR.rotation.set(-1.25 + a * 0.35, 0, -0.15);
    this.legL.rotation.set(0.15, 0, 0.08);
    this.legR.rotation.set(-0.2, 0, -0.08);
    this.body.position.y = 0;
    this.body.rotation.x = -0.12;
  }

  /** dopo la parete: gli arti tornano della loro misura */
  private resetLimbs() {
    for (const l of [this.armL, this.armR, this.legL, this.legR]) {
      l.scale.set(1, 1, 1);
      l.rotation.set(0, 0, 0);
    }
  }

  /** in parete: un braccio penzola e si scuote (per far riposare i muscoli), l'altro tiene la presa */
  /** in parete: il braccio del modello rimasto senza presa (0 = armL, 1 = armR), -1 se tengono tutte e due */
  freeArm: 0 | 1 | -1 = -1;
  shakeArm(hand: 0 | 1, time: number) {
    const a = hand === 0 ? this.armL : this.armR;
    a.scale.set(1, 1, 1);
    a.rotation.set(0.15 + Math.sin(time * 18) * 0.12, 0, (hand === 0 ? 1 : -1) * (0.25 + Math.sin(time * 23) * 0.1));
  }

  /** passo: gambe e braccia oscillano con la velocità; in aria posa ferma; a nuoto bracciate */
  private pose(dt: number, t?: Terrain) {
    const p = this.root.position;
    const amt = this.airborne ? 0 : Math.min(1, this.speed / 7);
    const before = Math.sin(this.phase);
    this.phase += dt * (3 + this.speed * 0.95);
    if (t && !this.airborne && this.speed > 1.5 && Math.sign(Math.sin(this.phase)) !== Math.sign(before))
      this.onStep?.(this.swimming ? "water" : p.y / 0.3 > 2950 ? "snow" : t.slopeAt(p.x, p.z) > 30 || p.y / 0.3 > 2400 ? "rock" : "grass");
    const sw = Math.sin(this.phase) * 0.75 * amt;
    this.resetLimbs();
    this.legL.rotation.z = this.legR.rotation.z = 0;
    this.legL.rotation.x = this.gliding ? 0.5 : sw;
    this.legR.rotation.x = this.gliding ? 0.5 : -sw;
    // a nuoto: bracciate a rana
    const stroke = this.swimming ? Math.sin(this.phase * 0.8) : 0;
    this.armL.rotation.x = this.gliding ? -2.6 : this.swimming ? -1.6 + stroke * 0.6 : this.airborne ? -1.2 : -sw * 0.8;
    this.armR.rotation.x = this.gliding ? -2.6 : this.swimming ? -1.6 + stroke * 0.6 : this.airborne ? -1.2 : sw * 0.8;
    this.armL.rotation.z = this.swimming ? -stroke * 0.6 : 0;
    this.armR.rotation.z = this.swimming ? stroke * 0.6 : 0;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.06 * amt;
    this.body.rotation.x = amt * (this.speed > 10 ? 0.2 : 0.06);
  }
}
