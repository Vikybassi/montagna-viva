import * as THREE from "three";

/**
 * Cielo e luce del giorno. Il sole è quello vero della Val Masino a metà settembre (latitudine 46,25°,
 * declinazione +3°, ora legale): tramonta verso le 19:30, e il cielo passa dal giorno al tramonto rosa alla notte.
 */
const LAT = THREE.MathUtils.degToRad(46.25);
const DECL = THREE.MathUtils.degToRad(3);
const SOLAR_NOON = 13.2; // ora legale, longitudine 9,65° E

/** direzione del sole (verso il sole) nel sistema del gioco: x est, y su, z sud */
export function sunDirection(hours: number, out = new THREE.Vector3()) {
  const H = THREE.MathUtils.degToRad((hours - SOLAR_NOON) * 15);
  const sinEl = Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(H);
  const el = Math.asin(sinEl);
  // azimut da nord, in senso orario
  const cosAz = (Math.sin(DECL) - Math.sin(el) * Math.sin(LAT)) / (Math.cos(el) * Math.cos(LAT));
  let az = Math.acos(THREE.MathUtils.clamp(cosAz, -1, 1));
  if (H > 0) az = Math.PI * 2 - az;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

type Key = { el: number; zenith: string; horizon: string; light: string; li: number; hemiSky: string; hemiGround: string; hi: number };
// tavolozza per altezza del sole (gradi): giorno, pomeriggio, tramonto rosa, crepuscolo, notte
const KEYS: Key[] = [
  { el: -18, zenith: "#0a0916", horizon: "#1d1830", light: "#9fb4e8", li: 0.45, hemiSky: "#34406e", hemiGround: "#181420", hi: 0.6 },
  { el: -7, zenith: "#1c1735", horizon: "#5a2f55", light: "#a99ad6", li: 0.35, hemiSky: "#5a4a80", hemiGround: "#221a28", hi: 0.6 },
  { el: -1, zenith: "#3a2f63", horizon: "#e07d72", light: "#ff7f6a", li: 1.1, hemiSky: "#7a5f92", hemiGround: "#33252c", hi: 0.45 },
  { el: 5, zenith: "#5a63a0", horizon: "#f6b48f", light: "#ffa277", li: 2.6, hemiSky: "#b39ab8", hemiGround: "#4a3d36", hi: 0.55 },
  { el: 15, zenith: "#5f86c0", horizon: "#f1d6bd", light: "#ffd9b0", li: 2.4, hemiSky: "#b9cde6", hemiGround: "#5e6a45", hi: 0.85 },
  { el: 40, zenith: "#4f86c6", horizon: "#cfe2ee", light: "#fff3e0", li: 2.8, hemiSky: "#bcd6ee", hemiGround: "#62704a", hi: 0.9 },
];

export class Sky {
  readonly dome: THREE.Mesh;
  readonly sun = new THREE.DirectionalLight("#ffffff", 2);
  readonly hemi = new THREE.HemisphereLight("#bcd6ee", "#62704a", 0.8);
  readonly dir = new THREE.Vector3();
  /** da dove arriva la luce principale: il sole di giorno, la luna di notte */
  readonly lightDir = new THREE.Vector3();
  night = 0;
  readonly horizon = new THREE.Color();
  elevation = 0;
  private uni = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSun: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Color() },
    uNight: { value: 0 },
  };
  private b = new THREE.Color();
  private moon = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_Position.z = gl_Position.w; // sempre sullo sfondo
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uHorizon, uSunColor, uSun;
        uniform float uNight;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
          // alone e disco del sole
          float s = max(dot(d, normalize(uSun)), 0.0);
          col += uSunColor * (pow(s, 12.0) * 0.35 + pow(s, 900.0) * 3.0) * (1.0 - uNight);
          // stelle di notte
          vec3 g = floor(d * 280.0);
          float st = step(0.9965, hash(g)) * smoothstep(0.02, 0.25, d.y);
          col += vec3(st) * uNight * (0.6 + 0.4 * hash(g + 3.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), mat);
    this.dome.renderOrder = -1;
    scene.add(this.dome, this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.near = 1;
    sc.far = 900;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
  }

  private mix(field: "zenith" | "horizon" | "light" | "hemiSky" | "hemiGround", el: number, out: THREE.Color) {
    const i = KEYS.findIndex((k) => k.el > el);
    if (i <= 0) return out.set(KEYS[i === 0 ? 0 : KEYS.length - 1][field]);
    const k0 = KEYS[i - 1], k1 = KEYS[i], t = (el - k0.el) / (k1.el - k0.el);
    return out.set(k0[field]).lerp(this.b.set(k1[field]), t);
  }
  private num(field: "li" | "hi", el: number) {
    const i = KEYS.findIndex((k) => k.el > el);
    if (i <= 0) return KEYS[i === 0 ? 0 : KEYS.length - 1][field];
    const k0 = KEYS[i - 1], k1 = KEYS[i];
    return THREE.MathUtils.lerp(k0[field], k1[field], (el - k0.el) / (k1.el - k0.el));
  }

  /** aggiorna cielo e luci per l'ora (ore decimali) e la posizione del giocatore (le ombre lo seguono) */
  update(hours: number, focus: THREE.Vector3, fog: THREE.Fog, storm = 0, flash = 0) {
    sunDirection(hours, this.dir);
    const el = THREE.MathUtils.radToDeg(Math.asin(this.dir.y));
    this.elevation = el;
    const u = this.uni;
    this.mix("zenith", el, u.uZenith.value);
    this.mix("horizon", el, this.horizon);
    u.uHorizon.value.copy(this.horizon);
    this.mix("light", el, u.uSunColor.value);
    u.uSun.value.copy(this.dir);
    u.uNight.value = THREE.MathUtils.smoothstep(-el, 4, 14);
    // di notte la luce "principale" è la luna, dalla parte opposta e alta
    const lightDir = this.lightDir.copy(el > -4 ? this.dir : this.moon.set(-this.dir.x, 0.6, -this.dir.z).normalize());
    this.night = u.uNight.value;
    this.sun.color.copy(u.uSunColor.value);
    this.sun.intensity = this.num("li", el);
    this.sun.position.copy(focus).addScaledVector(lightDir, 400);
    this.sun.target.position.copy(focus);
    this.mix("hemiSky", el, this.hemi.color);
    this.mix("hemiGround", el, this.hemi.groundColor);
    this.hemi.intensity = this.num("hi", el);
    if (storm > 0.001) {
      // temporale: cielo grigio piombo, sole velato, lampi
      u.uZenith.value.lerp(this.b.set("#3c4150"), storm * 0.8);
      this.horizon.lerp(this.b.set("#8a909a"), storm * 0.65);
      u.uHorizon.value.copy(this.horizon);
      this.sun.intensity *= 1 - 0.8 * storm;
      this.hemi.color.lerp(this.b.set("#9aa3b0"), storm * 0.6);
      this.hemi.intensity *= 1 - 0.25 * storm;
    }
    if (flash > 0) {
      this.hemi.intensity += flash * 2.5;
      u.uHorizon.value.lerp(this.b.set("#e8eefc"), flash * 0.6);
    }
    fog.color.copy(this.horizon);
    this.dome.position.copy(focus);
  }
}
