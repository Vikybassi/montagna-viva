import "./style.css";
import * as THREE from "three";
import { Hiker } from "./player";
import { Sky } from "./sky";
import { SunMap } from "./sunmap";
import { setupPlay } from "./play";
import { Boulder } from "./climb";
import { Obstacles } from "./collide";
import { sound } from "./audio";
import { addLayer, held, onKeyUp, top as topLayer } from "./input";
import { learn, loadProblem, wipeProgress } from "./state";
import { Net, loadMe, saveMe } from "./net";
import { PHRASES as ALL_PHRASES, randomName } from "./content";
import { Quality } from "./quality";
import { loadSettings, saveSettings } from "./settings";
import * as ui from "./ui";
import { Cover, S, buildLakes, buildPlaces, buildTerrainMesh, buildTrails, buildTrees, loadWorld, waterUniforms } from "./world";

/**
 * Montagna viva — primo passo: la Val Masino vera da attraversare a piedi, dal paese di San Martino ai rifugi,
 * con il sole che tramonta all'ora giusta. Niente missioni ancora: solo il mondo, la camminata e i nomi dei luoghi.
 */
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const canvasHost = $("#game");
const intro = $("#intro");
const startBtn = $<HTMLButtonElement>("#start");
const loading = $("#loading");

// ---------- generatore pseudo-casuale con seme fisso (il bosco è sempre lo stesso) ----------
let seed = 20261002;
const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const { terrain: T, data } = await loadWorld();
// il Sasso Remenno, più grande di quello vero: si fa subito, perché sentieri, strada e torrente gli girino intorno
const rock = data.remenno ? new Boulder(T, data.remenno[0] * S, data.remenno[1] * S) : null;
rock?.makeRoom(data, S);
loading.textContent = "Disegno la valle…";
await new Promise((r) => setTimeout(r, 30));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const fog = new THREE.Fog("#f1d6bd", 900, 5200);
scene.fog = fog;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 12000);

const cover = new Cover(T.meta, data);
const terrainMesh = buildTerrainMesh(T, cover);
scene.add(terrainMesh);
scene.add(buildTrails(T, data));
scene.add(buildLakes(T));
const trees = buildTrees(T, cover, rng, rock ? (x, z) => rock.covers(x, z, 2) : undefined);
scene.add(trees.group);
const places = buildPlaces(T, data, rng);
scene.add(places.group);
const sky = new Sky(scene);

// chi sei: nome e colore della giacca (ricordati nel browser)
const me = loadMe();
const hiker = new Hiker({ jacket: me.jacket });
// case, rifugi, bivacchi, campanili e tronchi: non si attraversano (né a piedi né con la telecamera)
const obstacles = new Obstacles();
for (const s of [...places.solids, ...trees.solids]) obstacles.add(s);
hiker.collide = (x, z, y) => {
  if (!hiker.root.visible || play.indoors) return { x, z, stuck: false };
  const r = obstacles.push(x, z, y, 0.35);
  // se eri già incastrata (un salto, un viaggio veloce), meglio uscire comunque che restare ferma
  if (r.stuck && obstacles.hits(hiker.root.position.x, hiker.root.position.z, y, 0.35)) r.stuck = false;
  return r;
};
scene.add(hiker.root);

// la frontale: si accende da sola quando fa buio (sempre nella scena, cambia solo l'intensità: niente ricompilazioni)
const lamp = new THREE.SpotLight("#fff1d6", 0, 90, 0.55, 0.65, 1.4);
lamp.position.set(0, 1.75, 0.15);
lamp.target.position.set(0, 0.3, 14);
hiker.root.add(lamp, lamp.target);


const spawn = data.huts.find((h) => h.name === "San Martino") ?? data.huts[0];
hiker.root.position.set(spawn.p[0] * S + 6, 0, spawn.p[1] * S + 58); // appena fuori dal paese, verso sud
hiker.root.position.y = T.heightAt(hiker.root.position.x, hiker.root.position.z);
hiker.heading = Math.PI; // guarda verso nord, verso la Val di Mello e i rifugi
{
  const at = new URLSearchParams(location.search).get("at");
  const place = at && data.huts.find((h) => h.name.toLowerCase().includes(at.toLowerCase()));
  if (place) hiker.root.position.set(place.p[0] * S + 8, 0, place.p[1] * S + 8);
  hiker.root.position.y = T.heightAt(hiker.root.position.x, hiker.root.position.z);
  const look = new URLSearchParams(location.search).get("look");
  if (look) hiker.heading = Math.PI - THREE.MathUtils.degToRad(+look); // da nord in senso orario → angolo del gioco
}

// ---------- ora del giorno: si parte alle 16:30, un minuto di gioco ogni 1,5 secondi ----------
let hours = 14;
/** in compagnia (col server) l'ora è della stanza: ore e istante in cui sono arrivate */
let sharedClock: { hours: number; at: number } | null = null;
// per provare e condividere una scena: ?at=Rifugio Cesare Ponti&t=18.7&look=240 (luogo, ora, direzione in gradi da nord)
const q = new URLSearchParams(location.search);
const MIN_PER_SEC = 1 / 1.5;
if (q.get("t")) hours = +q.get("t")!;

// ---------- telecamera in terza persona ----------
let yaw = hiker.heading + Math.PI; // la telecamera sta dietro
let pitch = 0.16;
let dist = 11;
let dragging = false;
let lastDrag = -10;
let focus: THREE.Vector3 | null = null; // se c'è, la telecamera guarda lì (alta e lontana)
let cinema: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null; // inquadratura fissa (il visore del ghiacciaio)
let uphill = 0; // quanto si alza la telecamera in salita (0–0,7)
let camK = 14; // quanto in fretta la telecamera raggiunge il suo posto (lenta quando vola verso un'inquadratura)
const lookAt = new THREE.Vector3();
let wasClimbing = false;
/** la fotocamera: in prima persona, con lo zoom e l'inclinazione dello sguardo */
let finder: { zoom: number; pitch: number; aimAt: number; aim: ReturnType<typeof play.photo.aim> } | null = null;
let finderDown: { x: number; y: number; moved: number } | null = null;
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();

// ---------- comandi ----------
const keys = held;
// nel mirino: si guarda, si zooma, si scatta, si esce (il resto dei comandi aspetta)
addLayer({
  name: "mirino", priority: 40, modal: true,
  active: () => started && !!finder,
  key: (k, e) => {
    if (e.repeat) return;
    if (k === "escape") exitFinder();
    else if (k === "p" || k === " " || k === "enter") shoot();
    else if (k === "+" || k === "=") zoomBy(1.4);
    else if (k === "-") zoomBy(1 / 1.4);
  },
});
// in giro per la valle (o in parete)
addLayer({
  name: "mondo", priority: 0,
  active: () => started,
  key: (k, e) => {
    if (e.repeat) return;
    if (!ui.busy && document.body.classList.contains("playing") && play.phone.shortcut(k, e)) return;
    if (k === "e" && !ui.busy) ui.triggerAct();
    if (k === "escape" && !ui.busy) openPauseMenu();
    if (k === "f" && play.climb?.active) play.climb.setShake(true);
    if (k === " ") jumpOrGlide();
    if (k === "p" && !play.blocked()) enterFinder();
    if (k === "g" && !play.blocked()) say("👋 Ciao!");
    if (k === "t" && !play.blocked()) void quickChat();
  },
});

const PHRASES = ALL_PHRASES.filter((p) => p !== "👋 Ciao!");
/** messaggi rapidi (frasi pronte: niente testo libero, niente brutte sorprese) */
async function quickChat() {
  const i = await ui.say("Messaggio a chi è nella valle", "Scegli cosa dire:", [...PHRASES, "Annulla"]);
  if (i < PHRASES.length) say(PHRASES[i]);
}
function say(text: string) {
  net.chat(text);
  ui.toast(`<b>Tu</b>: ${text}`);
  sound.ui("blip");
}
onKeyUp((k) => k === "f" && play.climb?.setShake(false));

const el = renderer.domElement;
el.addEventListener("contextmenu", (e) => e.preventDefault()); // in parete anche il tasto destro prende la presa
el.addEventListener("pointerdown", (e) => {
  if (finder) {
    // nel mirino: trascinare = guardarsi intorno, cliccare = scattare
    finderDown = { x: e.clientX, y: e.clientY, moved: 0 };
    el.setPointerCapture(e.pointerId);
    return;
  }
  if (e.pointerType === "touch") return;
  if (play.climb?.active) return play.climb.pointer(e.clientX, e.clientY, camera, e.button); // in parete: si prende la presa
  dragging = true;
  el.setPointerCapture(e.pointerId);
});
el.addEventListener("pointermove", (e) => {
  if (finder) {
    if (!finderDown) return;
    finderDown.moved = Math.max(finderDown.moved, Math.hypot(e.clientX - finderDown.x, e.clientY - finderDown.y));
    if (e.pointerType === "touch") return; // col dito guarda il gestore del tocco
    yaw -= (e.movementX * 0.004 * settings.sens) / finder.zoom;
    finder.pitch = THREE.MathUtils.clamp(finder.pitch - (e.movementY * 0.003 * settings.sens * (settings.invertY ? -1 : 1)) / finder.zoom, -0.8, 0.9);
    return;
  }
  if (play.climb?.active && e.pointerType !== "touch") return play.climb.pointer(e.clientX, e.clientY, camera, "move");
  if (!dragging || e.pointerType === "touch") return;
  yaw -= e.movementX * 0.005 * settings.sens;
  pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.004 * settings.sens * (settings.invertY ? -1 : 1), -0.15, 1.2);
  lastDrag = performance.now() / 1000;
});
el.addEventListener("pointerup", () => {
  dragging = false;
  if (finder && finderDown) {
    if (finderDown.moved < 6) shoot();
    finderDown = null;
  }
});
el.addEventListener("wheel", (e) => {
  if (finder) zoomBy(1 - e.deltaY * 0.0015);
  else dist = THREE.MathUtils.clamp(dist * (1 + e.deltaY * 0.001), 4, 60);
}, { passive: true });

function enterFinder() {
  if (finder || play.climb?.active) return;
  finder = { zoom: 1, pitch: 0.05, aimAt: 0, aim: null };
  hiker.root.visible = false;
  ui.setFinder(true, 1, null);
  sound.ui("blip");
}
function exitFinder() {
  if (!finder) return;
  finder = null;
  finderDown = null;
  hiker.root.visible = true;
  ui.setFinder(false);
}
function zoomBy(k: number) {
  if (finder) finder.zoom = THREE.MathUtils.clamp(finder.zoom * k, 1, 8);
}
function shoot() {
  if (!finder) return;
  const aim = play.photo.aim(camera);
  const img = snapshot();
  const flash = document.createElement("div");
  flash.className = "flash";
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 700);
  play.photo.shoot(aim, img);
}
ui.finderActions.onShoot = shoot;
ui.finderActions.onZoom = zoomBy;
ui.finderActions.onExit = exitFinder;
ui.tools.onCamera = () => (finder ? exitFinder() : !play.blocked() && enterFinder());

// touch: metà sinistra = levetta per camminare, metà destra = girare lo sguardo
const stick = new THREE.Vector2();
const stickEl = $("#stick"), knob = $("#knob");
const touches = new Map<number, { x: number; y: number; side: "move" | "look" }>();
el.addEventListener("touchstart", (e) => {
  if (play.climb?.active) {
    // in parete: si tocca la presa dove mettere la mano
    for (const t of Array.from(e.changedTouches)) play.climb.pointer(t.clientX, t.clientY, camera, "tap");
    return;
  }
  for (const t of Array.from(e.changedTouches)) {
    const side = t.clientX < innerWidth / 2 ? "move" : "look";
    touches.set(t.identifier, { x: t.clientX, y: t.clientY, side });
    if (side === "move") {
      stickEl.style.display = "block";
      stickEl.style.left = `${t.clientX - 50}px`;
      stickEl.style.top = `${t.clientY - 50}px`;
    }
  }
}, { passive: true });
el.addEventListener("touchmove", (e) => {
  for (const t of Array.from(e.changedTouches)) {
    const s = touches.get(t.identifier);
    if (!s) continue;
    if (s.side === "move") {
      const dx = t.clientX - s.x, dy = t.clientY - s.y, len = Math.min(45, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      stick.set((Math.cos(a) * len) / 45, (Math.sin(a) * len) / 45);
      knob.style.transform = `translate(${Math.cos(a) * len}px, ${Math.sin(a) * len}px)`;
    } else if (finder) {
      // nel mirino il dito guarda intorno (più piano con lo zoom)
      yaw -= ((t.clientX - s.x) * 0.006 * settings.sens) / finder.zoom;
      finder.pitch = THREE.MathUtils.clamp(finder.pitch - ((t.clientY - s.y) * 0.004 * settings.sens) / finder.zoom, -0.8, 0.9);
      s.x = t.clientX;
      s.y = t.clientY;
    } else {
      yaw -= (t.clientX - s.x) * 0.008 * settings.sens;
      pitch = THREE.MathUtils.clamp(pitch + (t.clientY - s.y) * 0.005 * settings.sens * (settings.invertY ? -1 : 1), -0.15, 1.2);
      s.x = t.clientX;
      s.y = t.clientY;
      lastDrag = performance.now() / 1000;
    }
  }
}, { passive: true });
const endTouch = (e: TouchEvent) => {
  for (const t of Array.from(e.changedTouches)) {
    if (touches.get(t.identifier)?.side === "move") {
      stick.set(0, 0);
      knob.style.transform = "";
      stickEl.style.display = "none";
    }
    touches.delete(t.identifier);
  }
};
el.addEventListener("touchend", endTouch);
el.addEventListener("touchcancel", endTouch);

/** l'ultima direzione chiesta, "grezza" (avanti/destra), per la scalata: su/giù/destra/sinistra sulla parete */
let rawF = 0, rawS = 0;
function readMove(out: THREE.Vector2) {
  let f = 0, s = 0;
  if (keys.has("w") || keys.has("arrowup")) f += 1;
  if (keys.has("s") || keys.has("arrowdown")) f -= 1;
  if (keys.has("a") || keys.has("arrowleft")) s -= 1;
  if (keys.has("d") || keys.has("arrowright")) s += 1;
  if (stick.lengthSq() > 0.01) {
    f = -stick.y;
    s = stick.x;
  }
  rawF = f;
  rawS = s;
  // relativo alla telecamera: avanti = lontano dalla telecamera
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = -fz, rz = fx;
  out.set(fx * f + rx * s, fz * f + rz * s);
  if (out.length() > 1) out.normalize();
  return out;
}

// ---------- nomi dei luoghi (HTML sopra la scena) ----------
type Label = { el: HTMLDivElement; pos: THREE.Vector3; range: number; w: number; h: number; peak: boolean };
const labelsHost = $("#labels");
const labels: Label[] = [];
const addLabel = (name: string, sub: string, x: number, z: number, lift: number, range: number, cls: string) => {
  const div = document.createElement("div");
  div.className = `label ${cls}`;
  div.innerHTML = `<b>${name}</b>${sub ? `<span>${sub}</span>` : ""}`;
  labelsHost.appendChild(div);
  const pos = new THREE.Vector3(x, T.heightAt(x, z) + lift, z);
  labels.push({ el: div, pos, range, w: 0, h: 0, peak: cls === "peak" });
  // chi la crea può spostarla (una persona che cammina) o cambiarne il testo
  return { el: div, pos };
};
for (const h of data.huts) {
  const kind = h.kind === "paese" ? "" : h.kind;
  addLabel(h.name, [kind, h.ele ? `${h.ele} m` : ""].filter(Boolean).join(" · "), h.p[0] * S, h.p[1] * S, h.kind === "paese" ? 14 : 9, h.kind === "paese" ? 900 : 650, h.kind);
}
// le cime: le più alte si leggono da lontano, le altre solo quando sei vicino
for (const p of data.peaks) if (p.ele && p.ele > 2700) addLabel(p.name, `${p.ele} m`, p.p[0] * S, p.p[1] * S, 6, p.ele > 3200 ? 2400 : 800, "peak");
if (data.remenno) addLabel("Sasso Remenno", "uno dei massi più grandi d'Europa", data.remenno[0] * S, data.remenno[1] * S, 42, 900, "remenno");

const v = new THREE.Vector3();
const placed: [number, number, number, number][] = [];
/** i nomi dei luoghi: prima i più importanti e vicini; quelli che si sovrapporrebbero a uno già messo restano nascosti */
function updateLabels() {
  const me = hiker.root.position;
  placed.length = 0;
  if (play.climb?.active || cinema || finder) {
    // in parete (e nel visore): niente nomi di luoghi che "bucano" la roccia o coprono il ghiacciaio
    for (const l of labels) if (l.el.style.opacity !== "0") l.el.style.opacity = "0";
    return;
  }
  const cand: { l: Label; d: number; x: number; y: number; prio: number }[] = [];
  for (const l of labels) {
    const d = l.pos.distanceTo(me);
    v.copy(l.pos).project(camera);
    if (d < l.range && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1)
      cand.push({ l, d, x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, prio: (l.peak ? 1 : 0) * 1e5 + d });
    else if (l.el.style.opacity !== "0") l.el.style.opacity = "0";
  }
  cand.sort((a, b) => a.prio - b.prio);
  let peaks = 0;
  for (const c of cand) {
    // misure prese una volta sola (leggerle a ogni fotogramma costringerebbe il browser a ricalcolare la pagina)
    if (!c.l.w) (c.l.w = c.l.el.offsetWidth || 120), (c.l.h = c.l.el.offsetHeight || 30);
    const w = c.l.w, h = c.l.h;
    const r: [number, number, number, number] = [c.x - w / 2 - 4, c.y - h - 4, c.x + w / 2 + 4, c.y + 4];
    const isPeak = c.l.peak;
    const hit = placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]) || (isPeak && peaks >= 7);
    if (hit) {
      if (c.l.el.style.opacity !== "0") c.l.el.style.opacity = "0";
      continue;
    }
    if (isPeak) peaks++;
    placed.push(r);
    c.l.el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -100%)`;
    c.l.el.style.opacity = String(Math.min(1, (1 - c.d / c.l.range) * 3));
  }
}

// ---------- il gioco: persone, missioni, animali, ghiacciaio, corsa ----------
/** il posto dove sei: lo mostra il telefono, e un cartellino quando arrivi in un posto nuovo */
let currentPlace = "San Martino";
const play = setupPlay({
  scene, T, data, cover, terrainMesh, hiker, rng, rock,
  place: () => currentPlace,
  sunDir: () => sky.dir,
  doors: places.doors,
  jacket: () => me.jacket,
  setJacket: (c) => {
    pickColor(c);
    saveMe(me);
  },
  getHours: () => hours,
  setHours: (h) => (hours = h),
  getYaw: () => yaw,
  camPos: () => camera.position,
  addLabel,
  focusView: (p) => (focus = p),
  cinema: (v) => {
    cinema = v;
    camK = 1.6;
  },
  snapshot,
  getNight: () => sky.night,
  camera,
  broadcast: (kind, ref) => net.event(kind, ref),
  sharedTime: () => sharedClock !== null,
});
ui.tools.onJump = () => jumpOrGlide();
ui.tools.onSound = () => ui.setSoundToggle(sound.toggle());
play.photo.setOccluders([trees.group, ...(rock ? [rock.mesh] : [])]); // alberi e masso coprono i soggetti delle foto

/** salto da terra; in aria apre (o chiude) il parapendio */
function jumpOrGlide() {
  if (play.climb?.active) return play.climb.letGo();
  if (!started || play.blocked()) return;
  if (!hiker.airborne) hiker.jump();
  else if (hiker.toggleGlide(T) && hiker.gliding) {
    sound.whoosh();
    ui.learned(learn("parapendio"));
  }
}

/** una foto della scena (senza interfaccia), piccola, per l'album */
function snapshot() {
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const c = document.createElement("canvas");
  c.width = 360;
  c.height = Math.round((360 * src.height) / src.width);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}

// prove automatiche: ?debug espone un teletrasporto e lo stato del gioco
if (q.has("debug"))
  Object.assign(window, {
    __mv: { ...play.debug, obstacles, weather: play.weather, busy: () => ui.busy, layer: () => topLayer(), started: () => started, camera, scene, get climb() { return play.climb; }, quality: () => ({ level: quality.level, counts: [play.life.flowers.count, play.life.boulders.count] }), yaw: () => yaw, setYaw: (v: number) => (yaw = v), tp: (x: number, z: number) => hiker.root.position.set(x, T.heightAt(x, z), z), me: hiker.root.position, setHours: (h: number) => (hours = h), finder: () => finder },
  });

// le ombre delle montagne, lette da tutti i materiali (anche persone e animali appena aggiunti)
const sunMap = new SunMap(T);
scene.traverse((o) => {
  const m = (o as THREE.Mesh).material;
  if (m) ([] as THREE.Material[]).concat(m).forEach((mm) => sunMap.patch(mm));
});

// ---------- impostazioni e qualità grafica ----------
let settings = loadSettings();
sound.setVolume(settings.volume);
const quality = new Quality(renderer, sky.sun);
trees.group.children.forEach((m) => quality.add(m as THREE.InstancedMesh, "tree"));
quality.add(play.life.flowers, "flower");
quality.add(play.life.boulders, "rock");
quality.choice = settings.quality;
quality.apply(settings.quality === "auto" ? quality.guess() : settings.quality);
let benchDone = settings.quality !== "auto";
quality.onChange = (l, auto) => {
  if (auto && started) ui.toast(`<b>Qualità grafica: ${l}</b> per restare fluido (si cambia dalla pausa)`);
};
function openPauseMenu() {
  ui.openPause({
    settings,
    level: quality.level,
    shared: sharedClock !== null,
    onChange: (s) => {
      const qualityChanged = s.quality !== settings.quality;
      settings = { ...settings, ...s, quality: s.quality as typeof settings.quality };
      saveSettings(settings);
      sound.setVolume(settings.volume);
      if (qualityChanged) {
        quality.choice = settings.quality;
        if (settings.quality !== "auto") quality.apply(settings.quality);
      }
    },
    onReset: () => {
      wipeProgress(); // progressi, album e taccuino (prima il taccuino restava)
      location.reload();
    },
  });
}
ui.tools.onPause = openPauseMenu;
$("#credits-open").addEventListener("click", () => ui.openCredits());

// ---------- HUD ----------
const hud = $("#hud"), hudPlace = $("#place"), hudAlt = $("#alt"), hint = $("#hint");
const walkHint = hint.textContent;
let hintClimb = false;
const named = [...data.huts.map((h) => ({ name: h.name, x: h.p[0] * S, z: h.p[1] * S, r: h.kind === "paese" ? 120 : 70 })),
  ...(data.remenno ? [{ name: "Sasso Remenno", x: data.remenno[0] * S, z: data.remenno[1] * S, r: 60 }] : [])];
let lastHud = 0, arrived = "", hudUntil = 0;
function updateHud(now: number) {
  if (now - lastHud < 0.25) return;
  lastHud = now;
  const p = hiker.root.position;
  let best = "Val Masino", bd = Infinity;
  for (const n of named) {
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    if (d < n.r * 3 && d < bd) (bd = d), (best = n.name);
  }
  currentPlace = bd < Infinity ? (bd < 90 ? best : `verso ${best}`) : "Val Masino";
  // a schermo niente riquadri fissi: il nome del posto compare per qualche secondo quando ci arrivi
  const here = bd < 90 ? best : "";
  if (here && here !== arrived) {
    hudPlace.textContent = here;
    hudAlt.textContent = `${Math.round(p.y / S).toLocaleString("it-IT")} m`;
    hudUntil = now + 4;
  }
  arrived = here || arrived;
  if (bd > 140) arrived = "";
  hud.classList.toggle("on", now < hudUntil && started);
}

// ---------- ciclo principale ----------
const move = new THREE.Vector2();
const clock = new THREE.Clock();
let started = false;
let moved = false;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const now = clock.elapsedTime;
  if (sharedClock) hours = sharedClock.hours + ((performance.now() - sharedClock.at) / 1000) * (MIN_PER_SEC / 60);
  else if (started && !ui.busy) hours += (dt * MIN_PER_SEC) / 60;

  readMove(move);
  if (!started || play.blocked() || finder) move.set(0, 0);
  if (finder) {
    // nel mirino WASD e frecce girano lo sguardo
    const rx = (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0);
    const ry = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    yaw += (rx * dt * 1.3) / finder.zoom;
    finder.pitch = THREE.MathUtils.clamp(finder.pitch + (ry * dt * 0.9) / finder.zoom, -0.8, 0.9);
    if (ui.busy || play.climb?.active) exitFinder();
  }
  // telecamera da tastiera
  if (started && !play.blocked()) {
    if (keys.has("q")) (yaw += 1.8 * dt * settings.sens), (lastDrag = now);
    if (keys.has("r")) (yaw -= 1.8 * dt * settings.sens), (lastDrag = now);
  }
  // qualità: misura durante la schermata iniziale, poi sorveglia
  if (!started && !benchDone) {
    const l = quality.sample(dt);
    if (l) (benchDone = true), quality.apply(l, true);
  } else if (started) quality.watch(dt);
  if (move.lengthSq() > 0.01 && !moved) {
    moved = true;
    hint.classList.add("gone");
  }
  // la barra dei comandi in basso: in parete mostra quelli della scalata
  const cl = !!play.climb?.active;
  if (cl !== hintClimb) {
    hintClimb = cl;
    hint.textContent = cl ? `Clic: presa gialla · F: scuoti le braccia · Spazio: ${play.climb?.withRope === false ? "salta giù" : "«Calami!»"}` : walkHint;
    hint.classList.toggle("gone", !cl && moved);
  }
  const running = play.canRun(keys.has("shift") || play.runToggle, move.lengthSq() > 0.01, dt);
  // in parete la scalata muove l'escursionista; altrimenti si cammina
  if (play.climb?.active) play.climb.update(dt, ui.busy ? 0 : rawF, ui.busy ? 0 : rawS);
  else hiker.update(dt, move, running, T);

  // la telecamera si rimette dietro quando cammini e non la stai girando
  if ((hiker.speed > 1 || hiker.gliding) && now - lastDrag > 1.5) {
    const behind = hiker.heading + Math.PI;
    let d = behind - yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    yaw += d * (1 - Math.exp(-1.2 * dt));
  }
  const p = hiker.root.position;
  let cdist = dist, cpitch = pitch;
  if (hiker.gliding) {
    cdist = Math.max(dist, 17);
    cpitch = 0.22;
  }
  // un po' di grandangolo quando vai veloce: senso di velocità
  const fov = 55 + Math.min(14, Math.max(0, hiker.speed - 8) * 1.1);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt));
    camera.updateProjectionMatrix();
  }
  if (focus) {
    // vista verso un punto lontano: la telecamera si mette dietro di te, più in alto e più lontana
    const want = Math.atan2(p.x - focus.x, p.z - focus.z);
    yaw += Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * (1 - Math.exp(-2.5 * dt));
    cdist = 26;
    cpitch = 0.28;
  }
  // in salita il pendio davanti riempiva lo schermo: la telecamera si alza e guarda più avanti, lungo il sentiero
  if (!hiker.gliding && !focus) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // dove guarda la telecamera, in piano
    let grade = 0;
    for (const d of [8, 16, 26]) grade = Math.max(grade, (hiker.groundAt(T, p.x + fx * d, p.z + fz * d) - p.y) / d);
    uphill += (THREE.MathUtils.clamp((grade - 0.12) * 1.8, 0, 0.7) - uphill) * (1 - Math.exp(-2.5 * dt));
  } else uphill += (0 - uphill) * (1 - Math.exp(-2.5 * dt));
  cpitch += uphill * 0.4;
  camTarget.set(p.x, p.y + 2.6, p.z); // un po' sopra la testa: si vede l'orizzonte
  camTarget.x += -Math.sin(yaw) * uphill * 5;
  camTarget.z += -Math.cos(yaw) * uphill * 5;
  camTarget.y += uphill * 2;
  if (focus) camTarget.lerp(focus, 0.02);
  const cd = cdist * Math.cos(cpitch);
  camPos.set(p.x + Math.sin(yaw) * cd, p.y + 1.6 + Math.sin(cpitch) * cdist, p.z + Math.cos(yaw) * cd);
  const ground = hiker.groundAt(T, camPos.x, camPos.z) + 1.2; // anche sopra il masso: la telecamera non ci entra
  if (camPos.y < ground) camPos.y = ground;
  if (play.climb?.active) {
    const cv = play.climb.camera();
    camPos.copy(cv.pos);
    camTarget.copy(cv.target);
    wasClimbing = true;
  } else {
    if (wasClimbing && play.climb) {
      // finita la calata: la telecamera torna fuori dalla parete, non dentro il masso
      wasClimbing = false;
      yaw = Math.atan2(play.climb.outward.x, play.climb.outward.z);
      pitch = 0.16;
    }
    // la telecamera non entra nel Sasso Remenno: se la roccia è in mezzo, si avvicina
    const rock = play.climb?.rock;
    if (rock && camTarget.distanceTo(rock.center) < 60) {
      const dir = camPos.clone().sub(camTarget);
      const len = dir.length();
      const hit = rock.cast(camTarget.clone(), dir.normalize());
      if (hit && hit.point.distanceTo(camTarget) < len) camPos.copy(hit.point).addScaledVector(dir, -0.6);
    }
    // né nelle case: se un muro o un tetto è in mezzo, la telecamera si avvicina (davanti al muro)
    if (!play.indoors) {
      const dir = camPos.clone().sub(camTarget);
      const len = dir.length();
      dir.normalize();
      const hitD = obstacles.cast(camTarget, dir, len);
      if (hitD !== null) camPos.copy(camTarget).addScaledVector(dir, Math.max(0.5, hitD - 0.6));
    }
  }
  if (cinema) {
    camPos.copy(cinema.pos);
    camTarget.copy(cinema.target);
  }
  // dopo un'inquadratura la telecamera torna piano dietro di te
  if (!cinema) camK = Math.min(14, camK + dt * 5);
  camera.position.lerp(camPos, 1 - Math.exp(-camK * dt));
  lookAt.lerp(camTarget, 1 - Math.exp(-Math.max(camK, 3) * dt));
  camera.lookAt(lookAt);
  if (finder) {
    // la fotocamera: dagli occhi, nella direzione in cui guardavi
    const eye = p.clone().setY(p.y + 1.62);
    const cp = Math.cos(finder.pitch);
    camera.position.copy(eye);
    lookAt.set(eye.x - Math.sin(yaw) * cp * 10, eye.y + Math.sin(finder.pitch) * 10, eye.z - Math.cos(yaw) * cp * 10);
    camera.lookAt(lookAt);
    camera.fov = 55 / finder.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    if (now - finder.aimAt > 0.15) {
      finder.aimAt = now;
      finder.aim = play.photo.aim(camera);
    }
    const a = finder.aim;
    ui.setFinder(true, finder.zoom, a ? { name: play.photo.name(a.subject), why: a.why, ok: a.ok } : play.photo.rainbow(camera) ? { name: "Arcobaleno", why: "— foto perfetta: scatta!", ok: true } : null);
  }

  sky.update(hours, p, fog, play.weather.storm, play.weather.flash);
  waterUniforms.uTime.value = now;
  waterUniforms.uSky.value.copy(sky.horizon);
  fog.near = 900 * (1 - 0.7 * play.weather.storm);
  fog.far = 5200 * (1 - 0.6 * play.weather.storm);
  sunMap.update(sky.lightDir);
  lamp.intensity = play.hasLamp() ? THREE.MathUtils.smoothstep(sky.night, 0.15, 0.6) * 260 : 0;
  play.update(dt);
  net.update(dt, hiker);
  updateLabels();
  updateHud(now);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// prima di mostrare: si compilano i materiali, così il primo passo non scatta
sky.update(hours, hiker.root.position, fog);
sunMap.computeNow(sky.lightDir);
await renderer.compileAsync(scene, camera);
// "riscaldamento": un disegno con tutto visibile (anche fuori inquadratura) e le ombre, così nulla si prepara a metà strada
{
  // anche gli oggetti nascosti (vela, farfalle, stormo, pioggia, traguardi…): altrimenti si preparano quando compaiono
  const culled: [THREE.Object3D, boolean][] = [];
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine) culled.push([o, o.frustumCulled]), (o.frustumCulled = false);
    if (!o.visible) hidden.push(o), (o.visible = true);
  });
  camera.position.set(hiker.root.position.x, hiker.root.position.y + 6, hiker.root.position.z + 12);
  camera.lookAt(hiker.root.position);
  lookAt.copy(hiker.root.position);
  renderer.render(scene, camera);
  culled.forEach(([o, f]) => (o.frustumCulled = f));
  hidden.forEach((o) => (o.visible = false));
}
// le etichette dei luoghi: misurate tutte insieme, una volta (a font caricati), così girandosi non si ricalcola la pagina
await document.fonts.ready;
for (const l of labels) (l.w = l.el.offsetWidth || 120), (l.h = l.el.offsetHeight || 30);
loading.remove();
startBtn.disabled = false;
startBtn.textContent = "Inizia a camminare";
// nome e giacca nella schermata iniziale
const nameOut = $("#pname");
nameOut.textContent = me.name;
$("#pname-new").addEventListener("click", () => {
  me.name = randomName();
  nameOut.textContent = me.name;
  saveMe(me);
});
const swatches = Array.from(document.querySelectorAll<HTMLButtonElement>(".swatches button"));
const pickColor = (c: string) => {
  me.jacket = c;
  hiker.setLook({ jacket: c });
  swatches.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.c === c)));
};
swatches.forEach((b) => b.addEventListener("click", () => pickColor(b.dataset.c!)));
pickColor(me.jacket);
const net = new Net(scene, me, labelsHost, camera);
const pill = document.createElement("div");
pill.className = "netpill";
document.body.appendChild(pill);
net.onNotice = (h) => ui.toast(h);
net.onClock = (h, seed) => {
  sharedClock = { hours: h, at: performance.now() };
  play.setWeatherSeed(seed);
};
net.onMode = (mode, n) => {
  pill.textContent = mode === "server" ? (n ? `👥 ${n + 1} nella valle` : "👥 solo tu, per ora") : mode === "local" ? (n ? `👥 ${n + 1} (questo browser)` : "👤 gioco da sola") : "";
};
startBtn.addEventListener("click", () => {
  if (loadProblem) setTimeout(() => ui.toast("<b>Il salvataggio era rovinato</b> Ricominci da capo; una copia di riserva resta nel browser.", "warn"), 1500);
  saveMe(me);
  net.connect();
  started = true;
  sound.start();
  document.body.classList.add("playing");
  intro.classList.add("gone");
  el.focus();
});
requestAnimationFrame(frame);
console.info(`alberi: ${trees.count}`);
