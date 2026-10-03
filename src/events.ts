import * as THREE from "three";
import { sound } from "./audio";
import type { Terrain } from "./world";

/**
 * Gli eventi della valle, che sorprendono chi cammina:
 * - l'elisoccorso: una volta al giorno, col sereno, risale la valle, resta in volo sopra un pendio e cala il soccorritore
 *   col verricello, poi riparte (si impara il 112 e il segnale delle braccia a Y);
 * - l'arcobaleno dopo il temporale, se c'è il sole: dalla parte opposta al sole, ampio 42°, come quello vero;
 * - le stelle cadenti, di notte col cielo sereno.
 */
export type SkyEvent = "heli-arrive" | "heli-hover" | "heli-gone" | "rainbow" | "meteor";
type Ctx = { hours: number; cam: THREE.Vector3; me: THREE.Vector3; sunDir: THREE.Vector3; night: number; storm: number };

function helicopter() {
  const g = new THREE.Group();
  const m = (c: string, metal = 0.2) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.5, metalness: metal });
  const red = m("#d22a2a"), white = m("#f4f4f2"), dark = m("#2a2d33", 0.5), glass = m("#9fc4dc", 0.6);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 3.2, 4, 10), red);
  body.rotation.x = Math.PI / 2;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.6, 10), white);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.z = -0.6;
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.25, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  cockpit.rotation.x = Math.PI / 2.4;
  cockpit.position.set(0, 0.3, 1.9);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 5, 6), red);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.4, -4.3);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.9), white);
  fin.position.set(0, 1.1, -6.6);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.2), dark);
  tailRotor.position.set(0.25, 1.1, -6.6);
  tailRotor.name = "tail";
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6), dark);
  mast.position.y = 1.6;
  const rotor = new THREE.Group();
  rotor.name = "rotor";
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.32), dark);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  rotor.position.y = 1.95;
  for (const s of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 5), dark);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(1.05 * s, -1.75, 0.2);
    g.add(skid);
  }
  // il verricello: un cavo e il soccorritore appeso (arancio, col casco)
  const winch = new THREE.Group();
  winch.name = "winch";
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), dark);
  cable.name = "cable";
  const man = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 3, 6), m("#f07b1e"));
  man.name = "man";
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), white);
  helmet.name = "helmet";
  winch.add(cable, man, helmet);
  winch.position.set(1.3, -0.4, 0.6);
  g.add(body, stripe, cockpit, boom, fin, tailRotor, mast, rotor, winch);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

/** l'arcobaleno: un anello con i colori dal viola (dentro) al rosso (fuori), trasparente ai bordi */
function rainbowMesh(inner: number, outer: number) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uIn: { value: inner }, uOut: { value: outer } },
    vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uOpacity; uniform float uIn; uniform float uOut; varying vec2 vP;
      vec3 hsv(float h) { vec3 k = abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return clamp(k - 1.0, 0.0, 1.0); }
      void main() {
        float t = clamp((length(vP) - uIn) / (uOut - uIn), 0.0, 1.0);
        vec3 col = mix(vec3(1.0), hsv(0.78 * (1.0 - t)), 0.85);
        gl_FragColor = vec4(col, sin(t * 3.14159) * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96, 1), mat);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}

export class SkyEvents {
  readonly group = new THREE.Group();
  private heli: THREE.Group;
  private heliState: { phase: "in" | "hover" | "out"; t: number; from: THREE.Vector3; at: THREE.Vector3; to: THREE.Vector3 } | null = null;
  private heliDay = -1;
  private arrived = false;
  private heliTime = 0;
  private rotorBeat = 0;
  private rainbow: THREE.Mesh;
  private rainbowUntil = -1;
  private rainbowK = 0;
  private meteors: { line: THREE.Line; head: THREE.Vector3; v: THREE.Vector3; life: number }[] = [];
  private nextMeteor = 4;
  private seed = 31337;
  private rnd = () => ((this.seed = (this.seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  private readonly D = 2600;

  constructor(private t: Terrain) {
    this.heli = helicopter();
    this.heli.visible = false;
    this.group.add(this.heli);
    const r = Math.tan(THREE.MathUtils.degToRad(42)) * this.D;
    this.rainbow = rainbowMesh(r * 0.94, r * 1.04);
    this.rainbow.visible = false;
    this.group.add(this.rainbow);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0]), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      line.frustumCulled = false;
      line.visible = false;
      this.group.add(line);
      this.meteors.push({ line, head: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 });
    }
  }

  /** l'elisoccorso parte adesso (per le prove, o quando è l'ora del giorno) */
  heliNow(me: THREE.Vector3) {
    // si ferma in volo sopra un pendio ripido, davanti a te ma non addosso
    let at: THREE.Vector3 | null = null;
    for (let k = 0; k < 400 && !at; k++) {
      const a = this.rnd() * Math.PI * 2, d = 260 + this.rnd() * 420;
      const x = me.x + Math.cos(a) * d, z = me.z + Math.sin(a) * d;
      if (!this.t.inside(x, z, 40) || this.t.slopeAt(x, z) < 22) continue;
      at = new THREE.Vector3(x, this.t.heightAt(x, z) + 22, z);
    }
    if (!at) return false;
    const dir = new THREE.Vector3(at.x - me.x, 0, at.z - me.z).normalize();
    const from = at.clone().addScaledVector(dir, -1600).add(new THREE.Vector3(dir.z * 600, 140, -dir.x * 600));
    const to = at.clone().addScaledVector(dir, 1800).add(new THREE.Vector3(0, 260, 0));
    this.heliState = { phase: "in", t: 0, from, at, to };
    this.heli.visible = true;
    this.arrived = true; // l'avviso parte al prossimo aggiornamento
    return true;
  }
  /** l'arcobaleno, per circa tre quarti d'ora di gioco dall'ora `hours` */
  rainbowNow(hours: number) {
    this.rainbowUntil = hours + 0.75;
  }
  /** l'arcobaleno si vede ed è nell'inquadratura? (per la fotocamera) */
  rainbowInView(camera: THREE.Camera) {
    if (!this.rainbow.visible || this.rainbowK < 0.3) return false;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // il punto più alto dell'arco: dalla parte opposta al sole, alto (42° − altezza del sole) sull'orizzonte
    const anti = this.sun.clone().negate().setY(0).normalize();
    const e = THREE.MathUtils.degToRad(42) - Math.asin(THREE.MathUtils.clamp(this.sun.y, -1, 1));
    const top = anti.multiplyScalar(Math.cos(e)).setY(Math.sin(e));
    return e > THREE.MathUtils.degToRad(4) && dir.angleTo(top) < THREE.MathUtils.degToRad(32);
  }
  private sun = new THREE.Vector3(0, 1, 0);
  meteorNow(cam: THREE.Vector3) {
    const m = this.meteors.find((x) => x.life <= 0);
    if (!m) return;
    const az = this.rnd() * Math.PI * 2, el = THREE.MathUtils.degToRad(35 + this.rnd() * 35);
    m.head.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(4000).add(cam);
    // scende di traverso, veloce
    m.v.set(-Math.sin(az), -0.45 - this.rnd() * 0.3, Math.cos(az)).normalize().multiplyScalar(1300 + this.rnd() * 600);
    m.life = 0.75;
    m.line.visible = true;
  }

  update(dt: number, c: Ctx): SkyEvent[] {
    const ev: SkyEvent[] = [];
    // ---- elisoccorso: un'ora a caso tra le 11 e le 16, ogni giorno, se è sereno ----
    const day = Math.floor(c.hours / 24);
    if (day !== this.heliDay) {
      this.heliDay = day;
      let h = (day * 2654435761) >>> 0;
      h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
      this.heliTime = day * 24 + 11 + (h % 1000) / 200;
    }
    if (!this.heliState && c.hours >= this.heliTime && c.hours < this.heliTime + 0.5 && c.storm < 0.1) {
      this.heliTime = Infinity;
      this.heliNow(c.me);
    }
    if (this.arrived) (this.arrived = false), ev.push("heli-arrive");
    const s = this.heliState;
    if (s) {
      s.t += dt;
      const h = this.heli, p = h.position;
      const winch = h.getObjectByName("winch")!;
      if (s.phase === "in") {
        const k = Math.min(1, s.t / 22), e = 1 - (1 - k) * (1 - k);
        p.lerpVectors(s.from, s.at, e);
        h.lookAt(s.at.x, p.y, s.at.z);
        h.rotation.x = 0.12 * (1 - k);
        winch.visible = false;
        if (k >= 1) (s.phase = "hover"), (s.t = 0), ev.push("heli-hover");
      } else if (s.phase === "hover") {
        p.copy(s.at).add(new THREE.Vector3(Math.sin(s.t * 0.7) * 0.6, Math.sin(s.t * 1.1) * 0.4, 0));
        h.rotation.x = 0;
        // il verricello scende fino al pendio e risale
        const ground = this.t.heightAt(p.x, p.z);
        const full = p.y - 0.4 - ground - 1.2;
        const len = Math.max(0.5, full * Math.min(1, Math.sin(Math.min(Math.PI, (s.t / 24) * Math.PI)) * 1.3));
        winch.visible = true;
        const cable = winch.getObjectByName("cable")!, man = winch.getObjectByName("man")!, helmet = winch.getObjectByName("helmet")!;
        cable.scale.y = len;
        cable.position.y = -len / 2;
        man.position.y = -len - 0.6;
        helmet.position.y = -len - 0.05;
        if (s.t > 24) (s.phase = "out"), (s.t = 0);
      } else {
        const k = Math.min(1, s.t / 20), e = k * k;
        p.lerpVectors(s.at, s.to, e);
        h.lookAt(s.to.x, p.y, s.to.z);
        h.rotation.x = 0.15 * Math.min(1, k * 3);
        winch.visible = false;
        if (k >= 1) {
          this.heliState = null;
          h.visible = false;
          ev.push("heli-gone");
        }
      }
      h.getObjectByName("rotor")!.rotation.y += dt * 28;
      h.getObjectByName("tail")!.rotation.x += dt * 40;
      // il rumore delle pale: colpi bassi, più forti quando è vicino
      this.rotorBeat -= dt;
      if (this.rotorBeat <= 0) {
        this.rotorBeat = 0.085;
        sound.rotor(p.x, p.z, p.distanceTo(c.me));
      }
    }
    // ---- arcobaleno: dalla parte opposta al sole, solo se il sole è su ----
    // come quello vero: solo col sole basso (sotto i 42°, ancora meglio sotto i 35°) e fuori dalla pioggia più forte
    this.sun.copy(c.sunDir);
    const want = c.hours < this.rainbowUntil && c.sunDir.y > 0.05 && c.sunDir.y < 0.57 && c.storm < 0.6 ? 1 : 0;
    if (want && !this.rainbow.visible) ev.push("rainbow");
    this.rainbowK += (want - this.rainbowK) * (1 - Math.exp(-(want ? 0.5 : 1.5) * dt));
    if (c.sunDir.y < 0) this.rainbowK = Math.min(this.rainbowK, Math.max(0, c.sunDir.y + 0.05) * 20);
    this.rainbow.visible = this.rainbowK > 0.01;
    if (this.rainbow.visible) {
      const anti = c.sunDir.clone().negate();
      this.rainbow.position.copy(c.cam).addScaledVector(anti, this.D);
      this.rainbow.lookAt(c.cam);
      (this.rainbow.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.55 * this.rainbowK;
    }
    // ---- stelle cadenti: di notte, col sereno ----
    if (c.night > 0.75 && c.storm < 0.1) {
      this.nextMeteor -= dt;
      if (this.nextMeteor <= 0) {
        this.nextMeteor = 5 + this.rnd() * 10;
        this.meteorNow(c.cam);
        ev.push("meteor");
      }
    }
    for (const m of this.meteors) {
      if (m.life <= 0) continue;
      m.life -= dt;
      m.head.addScaledVector(m.v, dt);
      const tail = m.head.clone().addScaledVector(m.v, -0.18);
      const pos = m.line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, m.head.x, m.head.y, m.head.z);
      pos.setXYZ(1, tail.x, tail.y, tail.z);
      pos.needsUpdate = true;
      (m.line.material as THREE.LineBasicMaterial).opacity = Math.min(1, m.life * 3);
      if (m.life <= 0) m.line.visible = false;
    }
    return ev;
  }
}
