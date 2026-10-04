import * as THREE from "three";
import type { Boulder } from "../climb";
import type { Hiker } from "../player";
import type { Weather } from "../weather";
import { S, type BusStop, type Cover, type Door, type Place, type Terrain, type WorldData } from "../world";

/**
 * Le basi comuni a tutte le parti del gioco: cosa arriva dal ciclo principale (PlayCtx), i luoghi della valle, gli
 * orari e qualche strumento (formati dell'ora, animazioni brevi).
 */
export type PlayCtx = {
  scene: THREE.Scene;
  T: Terrain;
  data: WorldData;
  cover: Cover;
  terrainMesh: THREE.Mesh;
  hiker: Hiker;
  rng: () => number;
  rock: Boulder | null;
  /** il nome del posto dove sei (paese, rifugio, Sasso Remenno…) */
  place: () => string;
  /** la direzione del sole (per l'arcobaleno, dalla parte opposta) */
  sunDir: () => THREE.Vector3;
  /** le porte di rifugi e bivacchi (per entrare a ripararsi) */
  doors: Map<string, Door>;
  /** le fermate della corriera (nei paesi lungo la strada) */
  busStops: BusStop[];
  /** la giacca del giocatore (la scegli all'inizio o nell'armadio; la vedono anche gli altri) */
  jacket: () => string;
  setJacket: (c: string) => void;
  getHours: () => number;
  setHours: (h: number) => void;
  getYaw: () => number;
  camPos: () => THREE.Vector3;
  addLabel: (name: string, sub: string, x: number, z: number, lift: number, range: number, cls: string) => { el: HTMLElement; pos: THREE.Vector3 };
  /** gira la telecamera verso un punto, o la rimette normale con null */
  focusView: (p: THREE.Vector3 | null) => void;
  /** una inquadratura fissa (il visore del ghiacciaio): la telecamera ci vola e guarda il bersaglio */
  cinema: (v: { pos: THREE.Vector3; target: THREE.Vector3 } | null) => void;
  snapshot: () => string;
  getNight: () => number;
  camera: THREE.Camera;
  /** racconta un'impresa agli altri giocatori */
  broadcast: (kind: "stamp" | "summit" | "mission" | "boulder", ref: string) => void;
  /** true se il tempo è condiviso con la stanza (non si può saltare la notte né viaggiare in un attimo) */
  sharedTime: () => boolean;
};

/** qualcosa con cui interagire: un punto, un raggio, il testo dell'invito (o null se ora non c'è) e l'azione */
export type Interact = { pos: THREE.Vector3; r: number; text: () => string | null; act: () => void };

export const SUNSET = 19.5;
/** quando c'è abbastanza luce per camminare (circa): l'orologio conta i giorni (31 = le 7 del secondo giorno) */
export const SUNRISE = 6.5;
export const isDaylight = (hours: number) => {
  const h = ((hours % 24) + 24) % 24;
  return h >= SUNRISE && h < SUNSET;
};
/** le persone stanno ferme (si muovono solo per girarsi) */
export const STILL = new THREE.Vector2();
export const hhmm = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
export const dur = (h: number) => {
  const m = Math.round((h * 60) / 5) * 5;
  return m < 60 ? `${m} minuti` : `${Math.floor(m / 60)} ${Math.floor(m / 60) === 1 ? "ora" : "ore"}${m % 60 ? ` e ${m % 60}` : ""}`;
};
/** tempi brevi come sui cartelli: 45', 1 h 20' */
export const hm = (h: number) => (h < 1 ? `${Math.max(5, Math.round((h * 60) / 5) * 5)}'` : `${Math.floor(h)} h ${Math.round(((h % 1) * 60) / 5) * 5}'`);

/** una piccola animazione: `f` riceve da 0 a 1 (con partenza e arrivo morbidi) per `ms` millisecondi */
export const tween = (ms: number, f: (k: number) => void) =>
  new Promise<void>((res) => {
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      f(k * k * (3 - 2 * k));
      if (k < 1) requestAnimationFrame(step);
      else res();
    };
    step();
  });

/** la valle e i suoi luoghi, condivisi da tutte le parti del gioco */
export function makeWorld(c: PlayCtx) {
  const { scene, T, data, hiker } = c;
  const place = (name: string) => data.huts.find((h) => h.name.includes(name));
  const at = (p: Place, dx = 0, dz = 0) => {
    const x = p.p[0] * S + dx, z = p.p[1] * S + dz;
    return new THREE.Vector3(x, T.heightAt(x, z), z);
  };
  const placeAt = (n: string) => {
    const h = place(n);
    return h ? at(h) : null;
  };
  // punti che non sono tra i luoghi caricati (località OSM): da latitudine e longitudine
  const ll = (lat: number, lon: number, lift = 0) => {
    const x = (lon - 9.55) * 111320 * Math.cos((46.25 * Math.PI) / 180) * S, z = (46.31 - lat) * 111320 * S;
    return new THREE.Vector3(x, T.heightAt(x, z) + lift, z);
  };
  const ground = (v: THREE.Vector3) => new THREE.Vector3(v.x, T.heightAt(v.x, v.z), v.z);
  const martino = place("San Martino")!, omio = place("Omio")!, ponti = place("Ponti")!, rasega = place("Rasega")!;
  return {
    c, scene, T, data, hiker,
    place, at, placeAt, ll, ground,
    martino, omio, ponti, rasega,
    pianoPR: ll(46.2324, 9.7048), // Piano di Preda Rossa
    piana: ll(46.2564, 9.6595), // Cascina Piana, in fondo alla Val di Mello
    disgrazia: ll(46.2667, 9.7489, 0), // la cima del Disgrazia: il ghiacciaio di Preda Rossa scende verso di noi
    eagleAt: ll(46.2575, 9.6444, 70), // sopra il Precipizio degli Asteroidi, Val di Mello
    /** il meteo: creato più avanti (l'ordine di creazione decide la valle generata a caso), letto da tutti */
    weather: null as unknown as Weather,
  };
}
export type World = ReturnType<typeof makeWorld>;
