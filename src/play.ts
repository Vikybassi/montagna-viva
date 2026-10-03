import * as THREE from "three";
import { sound } from "./audio";
import { Boulder, Climb, type Kind } from "./climb";
import { Phone, outfitOf } from "./phone";
import { Nature, SUBJECTS, buildCairns, type Aim, type Target } from "./nature";
import { buildEncounters } from "./encounters";
import { SkyEvents } from "./events";
import { buildCollect } from "./collect";
import { ITEMS, MISSIONS, type MissionId } from "./content";
import { Life } from "./life";
import { ValleyMap } from "./map";
import * as mini from "./minigames";
import { Weather } from "./weather";
import { Fauna, type Species } from "./fauna";
import { GlacierTime, type Year } from "./glacier";
import { Hiker } from "./player";
import { Race } from "./race";
import { Router, RouteView, type Turn } from "./route";
import { buildSigns } from "./signs";
import { addPhoto, addToNotebook, has, learn, mission, setMission, state, save } from "./state";
import * as ui from "./ui";
import { S, type Cover, type Door, type Place, type Terrain, type WorldData } from "./world";

/**
 * Il gioco vero e proprio: la guida Marta a San Martino, i custodi dei rifugi, la glaciologa, gli animali, i segnavia,
 * la sfida di corsa; le missioni e il diario. Tutto ciò che si "fa" passa da qui.
 */
type Ctx = {
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
  /** la giacca del giocatore (la scegli all'inizio o nell'armadio; la vedono anche gli altri) */
  jacket: () => string;
  setJacket: (c: string) => void;
  getHours: () => number;
  setHours: (h: number) => void;
  getYaw: () => number;
  camPos: () => THREE.Vector3;
  addLabel: (name: string, sub: string, x: number, z: number, lift: number, range: number, cls: string) => { el: HTMLElement; pos: THREE.Vector3 };
  /** gira la telecamera verso un punto (per mostrare il ghiacciaio), o la rimette normale con null */
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
type Interact = { pos: THREE.Vector3; r: number; text: () => string | null; act: () => void };

const SUNSET = 19.5;
const STILL = new THREE.Vector2(); // le persone stanno ferme (si muovono solo per girarsi)
const hhmm = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
const dur = (h: number) => {
  const m = Math.round((h * 60) / 5) * 5;
  return m < 60 ? `${m} minuti` : `${Math.floor(m / 60)} ${Math.floor(m / 60) === 1 ? "ora" : "ore"}${m % 60 ? ` e ${m % 60}` : ""}`;
};

export function setupPlay(c: Ctx) {
  const { scene, T, data, hiker } = c;
  const place = (name: string) => data.huts.find((h) => h.name.includes(name));
  const at = (p: Place, dx = 0, dz = 0) => {
    const x = p.p[0] * S + dx, z = p.p[1] * S + dz;
    return new THREE.Vector3(x, T.heightAt(x, z), z);
  };
  // punti che non sono tra i luoghi caricati (località OSM): da latitudine e longitudine
  const ll = (lat: number, lon: number, lift = 0) => {
    const x = (lon - 9.55) * 111320 * Math.cos((46.25 * Math.PI) / 180) * S, z = (46.31 - lat) * 111320 * S;
    return new THREE.Vector3(x, T.heightAt(x, z) + lift, z);
  };
  const martino = place("San Martino")!, omio = place("Omio")!, ponti = place("Ponti")!, rasega = place("Rasega")!;
  const pianoPR = ll(46.2324, 9.7048); // Piano di Preda Rossa
  const piana = ll(46.2564, 9.6595); // Cascina Piana, in fondo alla Val di Mello
  const disgrazia = ll(46.2667, 9.7489, 0); // la cima del Disgrazia: il ghiacciaio di Preda Rossa scende verso di noi

  // ---------- persone ----------
  const npc = (look: ConstructorParameters<typeof Hiker>[0], pos: THREE.Vector3, name: string, role: string) => {
    const h = new Hiker(look);
    ui.avatar(name, look ?? {});
    h.root.position.copy(pos);
    scene.add(h.root);
    c.addLabel(name, role, pos.x, pos.z, 2.6, 60, "npc");
    return h;
  };
  const marta = npc({ jacket: "#2f8f8a", hat: "#c2375a", pack: "#f2b632", hair: "#3a2a20" }, at(martino, 10, 50), "Marta", "guida");
  const custOmio = npc({ jacket: "#5a6b3a", hat: "#8a6446", pack: "#5a6b3a", hair: "#b8b0a8" }, at(omio, 6, 4), "Giulio", "custode");
  const custPonti = npc({ jacket: "#3b5a8a", hat: "#e07d3e", pack: "#3b5a8a", hair: "#6a4a30" }, at(ponti, 6, 4), "Sara", "custode");
  const elena = npc({ jacket: "#f2b632", hat: "#3b3550", pack: "#c2375a", hair: "#2a1f1a" }, pianoPR.clone().add(new THREE.Vector3(0, 0, 0)), "Elena", "glaciologa");
  elena.root.position.y = T.heightAt(elena.root.position.x, elena.root.position.z);
  const people = [marta, custOmio, custPonti, elena];

  // ---------- eventi: elisoccorso, arcobaleno, stelle cadenti ----------
  const skyEvents = new SkyEvents(T);
  scene.add(skyEvents.group);
  const sawEvent = (id: string) => {
    if (state.events.includes(id)) return false;
    state.events.push(id);
    save();
    return true;
  };
  let meteorNight = -1;

  // ---------- incontri lungo i sentieri ----------
  const placeAt = (n: string) => {
    const h = place(n);
    return h ? at(h) : null;
  };
  const encounters = buildEncounters({
    t: T, scene, hiker, addLabel: c.addLabel,
    places: {
      remenno: data.remenno ? new THREE.Vector3(data.remenno[0] * S, T.heightAt(data.remenno[0] * S, data.remenno[1] * S), data.remenno[1] * S) : null,
      martino: at(martino), filorera: placeAt("Filorera"), bagni: placeAt("Bagni di Masino"), omio: at(omio),
    },
  });

  // ---------- fiori protetti e gracchi (la fotografia naturalistica) ----------
  const nature = new Nature(T, data);
  scene.add(nature.group);
  // gli ometti caduti sulle pietraie: si rimettono in piedi col minigioco
  const cairnSet = buildCairns(T, data);
  scene.add(cairnSet.group);
  const cairnLabels = new Map<string, { el: HTMLElement; pos: THREE.Vector3 }>();
  for (const k of cairnSet.cairns) {
    const ok = state.cairns.includes(k.id);
    k.setBuilt(ok);
    if (!ok) cairnLabels.set(k.id, c.addLabel("Ometto caduto", "rimettilo in piedi", k.pos.x, k.pos.z, 2.2, 120, "npc help"));
  }
  async function fixCairn(id: string) {
    if (mini.playing) return;
    const k = cairnSet.cairns.find((x) => x.id === id)!;
    const ok = await mini.stackCairn();
    if (!ok) return;
    k.setBuilt(true);
    if (!state.cairns.includes(id)) state.cairns.push(id);
    save();
    const l = cairnLabels.get(id);
    if (l) l.el.style.display = "none";
    ui.learned(learn("ometto"));
  }

  // ---------- segnavia, cartelli, animali, ghiacciaio, corsa ----------
  const signs = buildSigns(T, data);
  scene.add(signs.group);
  const eagleAt = ll(46.2575, 9.6444, 70); // sopra il Precipizio degli Asteroidi, Val di Mello
  // più animali sparsi per la valle: chi cammina (o fotografa) trova sempre qualcosa da guardare
  const spot = (n: string) => {
    const h = place(n);
    return h ? [at(h)] : [];
  };
  const fauna = new Fauna(T, {
    ibex: [at(ponti), ...spot("Allievi"), ...spot("Gianetti")],
    chamois: [at(rasega), at(omio), ...spot("Rifugio Mello"), at(ponti), ...spot("Bonacossa")],
    marmots: [at(omio), pianoPR.clone(), ...spot("Gianetti"), ...spot("Allievi"), at(ponti)],
    eagle: eagleAt,
  }, c.rng);
  scene.add(fauna.group);
  const glacier = new GlacierTime(T, c.cover, c.terrainMesh);
  const raceStart = at(martino, 70, -40);
  const race = new Race(T, raceStart, [
    { pos: at(rasega, -14, 10), name: "Rifugio Rasega" },
    { pos: piana.clone().add(new THREE.Vector3(-10, 0, 14)), name: "Cascina Piana" },
    { pos: raceStart.clone().add(new THREE.Vector3(-8, 0, 6)), name: "Arrivo" },
  ]);
  scene.add(race.group);
  c.addLabel("Partenza", "sfida di corsa", raceStart.x, raceStart.z, 6.5, 300, "race");

  // ---------- vita, collezioni, meteo, mappa ----------
  const life = new Life(T, data, c.cover, c.rng);
  scene.add(life.group);
  const collect = buildCollect(T, data, hiker, c.rng, c.snapshot, c.getHours);
  scene.add(collect.group);

  // il Sasso Remenno: roccia vera (ci si cammina sopra, non si attraversa) e una via d'arrampicata con l'istruttore
  let climb: Climb | null = null;
  if (c.rock) {
    const rock = c.rock;
    scene.add(rock.mesh);
    hiker.groundFn = (x, z) => rock.topAt(x, z);
    climb = new Climb(T, rock, hiker, c.rng);
    scene.add(climb.group);
    c.addLabel("Davide", "istruttore di arrampicata", climb.base.x, climb.base.z, 2.6, 80, "npc");
  }
  // ---------- i blocchi della Val di Mello: bouldering, senza corda, sul materassino ----------
  const BLOCKS: { id: string; name: string; grade: string; size: [number, number, number]; bulge: number; kinds: Kind[]; partner: { name: string; look: { jacket: string; hat: string; pack: string; hair: string } } }[] = [
    { id: "torrente", name: "Il masso del torrente", grade: "4a", size: [5, 5, 4.6], bulge: 0.12, kinds: ["jug", "jug", "jug", "sloper", "jug", "jug", "jug", "jug"], partner: { name: "Sofia", look: { jacket: "#e05a8f", hat: "#2f8f8a", pack: "#3b3550", hair: "#3a2a20" } } },
    { id: "placca", name: "La placca", grade: "5a", size: [6, 5.4, 5.4], bulge: 0.08, kinds: ["jug", "jug", "crimp", "jug", "sloper", "jug", "jug", "jug"], partner: { name: "Pietro", look: { jacket: "#3b5a8a", hat: "#f2b632", pack: "#e07d3e", hair: "#8a5a3a" } } },
    { id: "pancia", name: "La pancia", grade: "5c", size: [5.4, 5.6, 5], bulge: 0.45, kinds: ["jug", "crimp", "jug", "sloper", "crimp", "jug", "crimp", "jug"], partner: { name: "Irene", look: { jacket: "#f2b632", hat: "#c2375a", pack: "#2f8f8a", hair: "#c9a440" } } },
    { id: "tetto", name: "Il tetto", grade: "6a", size: [6, 6, 5.4], bulge: 0.62, kinds: ["jug", "crimp", "sloper", "crimp", "crimp", "sloper", "crimp", "jug"], partner: { name: "Matteo", look: { jacket: "#5a6b3a", hat: "#3b3550", pack: "#c2375a", hair: "#2a1f1a" } } },
  ];
  const blocks: { id: string; name: string; grade: string; climb: Climb; rock: Boulder }[] = [];
  {
    // lungo il fondovalle, da San Martino verso Cascina Piana: in piano, vicino al sentiero ma non sopra, lontano dal torrente
    const a = at(martino), b = piana;
    const trail: THREE.Vector2[] = [];
    for (const p of data.paths) for (const [x, z] of p.pts) {
      const wx = x * S, wz = z * S;
      if (wx > Math.min(a.x, b.x) - 300 && wx < Math.max(a.x, b.x) + 300 && wz > Math.min(a.z, b.z) - 300 && wz < Math.max(a.z, b.z) + 300) trail.push(new THREE.Vector2(wx, wz));
    }
    const nearTrail = (x: number, z: number) => {
      let best: THREE.Vector2 | null = null, bd = Infinity;
      for (const q of trail) {
        const d = Math.hypot(q.x - x, q.y - z);
        if (d < bd) (bd = d), (best = q);
      }
      return { d: bd, q: best! };
    };
    let seed = 99;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    BLOCKS.forEach((bl, i) => {
      const along = a.clone().lerp(b, 0.5 + i * 0.13);
      for (let tries = 0; tries < 3000; tries++) {
        // prima vicino al punto lungo la valle, poi sempre più lontano; dopo tanti tentativi si accetta un po' di bosco
        const spread = 140 + tries * 0.2, relax = tries > 2200;
        const x = along.x + (rnd() - 0.5) * spread, z = along.z + (rnd() - 0.5) * spread;
        const nt = nearTrail(x, z);
        if (nt.d < 12 || nt.d > 50 || T.slopeAt(x, z) > 14 || c.cover.at(c.cover.water, x, z) > 0.05) continue;
        // in un prato aperto: niente alberi intorno (coprirebbero la parete e la telecamera)
        let wooded = false;
        for (let k = 0; k < 12 && !wooded; k++) {
          const ang = (k / 12) * Math.PI * 2;
          for (const r of relax ? [0, 8] : [0, 10, 20]) if (c.cover.at(c.cover.forest, x + Math.cos(ang) * r, z + Math.sin(ang) * r) > (relax ? 0.6 : 0.3)) wooded = true;
        }
        if (wooded) continue;
        if (blocks.some((o) => Math.hypot(o.rock.center.x - x, o.rock.center.z - z) < 50)) continue;
        const rock = new Boulder(T, x, z, { size: bl.size, seed: 500 + i * 17, bulge: bl.bulge });
        scene.add(rock.mesh);
        // la via guarda verso il sentiero: lì c'è spazio per il materassino e per chi para
        const out = new THREE.Vector3(nt.q.x - x, 0, nt.q.y - z);
        const cl = new Climb(T, rock, hiker, c.rng, {
          rope: false, out, kinds: bl.kinds, spacing: [0.78, 0.15], startHeight: 1.5, partner: bl.partner, title: `«${bl.name}» (${bl.grade})`,
          onTop: () => {
            if (!state.blocks.includes(bl.id)) state.blocks.push(bl.id);
          },
        });
        scene.add(cl.group);
        c.addLabel(bl.name, `blocco ${bl.grade}${state.blocks.includes(bl.id) ? " · fatto ✓" : ""}`, x, z, bl.size[1] * 1.3, 160, "remenno");
        blocks.push({ id: bl.id, name: bl.name, grade: bl.grade, climb: cl, rock });
        break;
      }
    });
    // si cammina sopra a tutti i massi (e non li si attraversa)
    const rocks = [...(c.rock ? [c.rock] : []), ...blocks.map((bk) => bk.rock)];
    hiker.groundFn = (x, z) => {
      for (const r of rocks) {
        const h = r.topAt(x, z);
        if (h !== null) return h;
      }
      return null;
    };
  }
  let lastClimb: Climb | null = climb;
  /** la via su cui sei adesso (il Remenno o un blocco) */
  const activeClimb = () => {
    const a = climb?.active ? climb : blocks.find((bk) => bk.climb.active)?.climb ?? null;
    if (a) lastClimb = a;
    return a;
  };
  async function talkBlock(bk: (typeof blocks)[0]) {
    const p = BLOCKS.find((x) => x.id === bk.id)!.partner;
    const first = state.blocks.length === 0;
    const i = await ui.say(
      `${p.name}, para`,
      `${first ? "Ciao! Qui in Val di Mello si arrampica sui massi, senza corda: è il <b>bouldering</b>. Sotto c'è il <b>materassino</b> e io ti <b>paro</b>: tengo le mani pronte per guidarti sul materassino se cadi. " : ""}<b>${bk.name}</b>, grado ${bk.grade}${bk.grade >= "5c" ? ": prese piccole e pancia strapiombante, servono braccia" : ""}. Clicca la presa gialla; in cima, salta giù sul materassino con le ginocchia morbide.`,
      ["Proviamo!", "Un'altra volta"],
    );
    if (i === 0) bk.climb.start();
  }
  async function talkDavide() {
    if (!climb) return;
    const first = !state.boulder;
    const i = await ui.say(
      "Davide, istruttore",
      `${first ? "Ciao! Sul Sasso Remenno ci sono vie attrezzate: si sale con <b>imbrago, casco e corda</b>, e io ti faccio sicura da qui. " : "Ancora una? "}Nodo a otto controllato, casco allacciato.<br><b>Come si sale:</b> ${matchMedia("(pointer: coarse)").matches ? "tocca" : "clicca"} la presa <b>gialla che lampeggia</b>: è il prossimo passo della via, e ci va la mano che ci arriva. I cerchi bianchi sono le altre prese a portata. La via è lunga: dove trovi <b>due prese grandi</b> vicine, fermati e <b>scuoti le braccia</b> per riposarle; sulle <b>tacchette</b> si stancano in fretta. Se la forza finisce, la corda ti tiene. Quando vuoi scendere, dimmi «Calami!».`,
      ["Partiamo!", "Un'altra volta"],
    );
    if (i === 0) climb.start();
  }
  const weather = new Weather(c.rng);
  scene.add(weather.group);
  // ---------- la strada verso un rifugio ----------
  const router = new Router(T, data);
  const routeView = new RouteView(T);
  scene.add(routeView.group);
  let guide: { pts: THREE.Vector3[]; idx: number; dest: Place; hours: number; off: number; turns: Turn[]; told: number } | null = null;
  const hm = (h: number) => (h < 1 ? `${Math.max(5, Math.round((h * 60) / 5) * 5)}'` : `${Math.floor(h)} h ${Math.round(((h % 1) * 60) / 5) * 5}'`);
  function setGuide(dest: Place, quiet = false) {
    const r = router.route(hiker.root.position, at(dest));
    if (!r) {
      ui.toast("Non trovo un sentiero vicino: avvicinati a un sentiero e riprova.", "warn");
      return null;
    }
    guide = { pts: r.pts, idx: 0, dest, hours: r.hours, off: 0, turns: r.turns, told: -1 };
    routeKey = "guide";
    routeView.show(r.pts);
    if (!quiet) {
      ui.toast(`<b>Strada per il ${dest.name.replace("Rifugio ", "rifugio ")}</b> ${r.km.toFixed(1).replace(".", ",")} km · circa ${hm(r.hours)} (tempi da cartello)`);
      sound.ui("go");
    }
    return r;
  }
  async function pickHut(p: Place) {
    const r = router.route(hiker.root.position, at(p));
    const stamped = state.stamps.includes(p.name);
    const opts: string[] = [];
    if (r) opts.push(`Indicami la strada (circa ${hm(r.hours)})`);
    if (stamped && !c.sharedTime()) opts.push("Vai subito (l'orologio avanza del tempo di cammino)");
    opts.push("Annulla");
    const text = r
      ? `${p.name}${p.ele ? `, ${p.ele} m` : ""}: ${r.km.toFixed(1).replace(".", ",")} km di sentiero, circa ${hm(r.hours)} senza soste. Arriveresti verso le ${hhmm(c.getHours() + r.hours)}.`
      : `${p.name}: non trovo un sentiero vicino a te. Avvicinati a un sentiero.`;
    const i = await ui.say("Mappa", text, opts);
    const choice = opts[i];
    if (choice.startsWith("Indicami")) setGuide(p);
    else if (choice.startsWith("Vai subito")) {
      const h = r?.hours ?? 1;
      const x = p.p[0] * S + 9, z = p.p[1] * S + 9;
      hiker.root.position.set(x, T.heightAt(x, z), z);
      c.setHours(c.getHours() + h);
      guide = null;
      routeView.show(null);
      ui.toast(`<b>${p.name}</b> dopo ${hm(h)} di cammino`);
    }
  }
  /** il riparo più vicino (rifugi e bivacchi), per tempo di cammino sui sentieri */
  function nearestShelter() {
    const me = hiker.root.position;
    const cands = data.huts
      .filter((h) => h.kind === "rifugio" || h.kind === "bivacco")
      .map((h) => ({ h, d: Math.hypot(h.p[0] * S - me.x, h.p[1] * S - me.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    let best: { h: Place; hours: number } | null = null;
    for (const { h } of cands) {
      const r = router.route(me, at(h));
      if (r && (!best || r.hours < best.hours)) best = { h, hours: r.hours };
    }
    return best;
  }
  const map = new ValleyMap(
    T, data, c.cover,
    (p) => void pickHut(p),
    () => ({ x: hiker.root.position.x, z: hiker.root.position.z, heading: hiker.heading, hours: c.getHours(), storm: weather.phase === "storm" }),
    () => guide?.pts ?? null,
  );
  // sulla mappa, al passaggio del mouse: quanto ci vuole da qui (calcolato una volta per posto, finché non ti sposti)
  const estimates = new Map<string, string | null>();
  const estimatedAt = new THREE.Vector3(1e9, 0, 0);
  map.estimate = (p) => {
    if (hiker.root.position.distanceTo(estimatedAt) > 30) estimates.clear(), estimatedAt.copy(hiker.root.position);
    if (!estimates.has(p.name)) {
      const r = router.route(hiker.root.position, at(p));
      estimates.set(p.name, r ? `circa ${hm(r.hours)} · ${r.km.toFixed(1).replace(".", ",")} km` : null);
    }
    return estimates.get(p.name)!;
  };
  /** l'indicazione per il prossimo tratto: quanto manca al bivio e da che parte andare */
  function directions(g: NonNullable<typeof guide>, me: THREE.Vector3) {
    const next = g.turns.find((t) => t.i > g.idx);
    const short = g.dest.name.replace("Rifugio ", "rifugio ");
    const along = (to: number) => {
      let d = Math.hypot(g.pts[g.idx].x - me.x, g.pts[g.idx].z - me.z);
      for (let i = g.idx; i < to; i++) d += Math.hypot(g.pts[i + 1].x - g.pts[i].x, g.pts[i + 1].z - g.pts[i].z);
      return d / S;
    };
    const fmt = (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);
    if (!next) return `Segui il sentiero fino al ${short} · ${fmt(along(g.pts.length - 1))}`;
    const m = along(next.i);
    const go = next.side === "dritto" ? "vai dritto" : `tieni la ${next.side}`;
    // vicino al bivio: lo si dice anche a voce (un avviso), una volta sola
    if (m < 45 && g.told !== next.i) {
      g.told = next.i;
      ui.toast(`<b>Al bivio:</b> ${go}${next.up > 15 ? ", in salita" : next.up < -15 ? ", in discesa" : ""}`);
      sound.ui("blip");
    }
    return m < 45 ? `Al bivio: ${go} · verso il ${short}` : `Tra ${fmt(m)}, al bivio, ${go} · ${short}`;
  }
  hiker.onStep = (surface) => sound.step(surface);
  hiker.onLand = () => (hiker.swimming ? sound.splash() : sound.step("grass"));

  // distanza dall'acqua (torrenti e laghi), su una griglia a 80 m: serve al suono dei torrenti
  const wk = 2, ww = Math.floor((T.meta.cols - 1) / wk) + 1, wh = Math.floor((T.meta.rows - 1) / wk) + 1, wcell = T.cell * wk;
  const wdist = new Float32Array(ww * wh).fill(1e9);
  const wq: number[] = [];
  const markWater = (x: number, z: number) => {
    const ci = Math.round(x / wcell), ri = Math.round(z / wcell);
    if (ci < 0 || ri < 0 || ci >= ww || ri >= wh) return;
    const i = ri * ww + ci;
    if (wdist[i] !== 0) (wdist[i] = 0), wq.push(i);
  };
  for (const st of data.streams) for (const [x, z] of st.pts) markWater(x * S, z * S);
  for (let r = 0; r < wh; r++) for (let cc = 0; cc < ww; cc++) if (c.cover.at(c.cover.water, cc * wcell, r * wcell) > 0.5) markWater(cc * wcell, r * wcell);
  for (let h = 0; h < wq.length; h++) {
    const i = wq[h], ci = i % ww, ri = (i / ww) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = ci + dc, nr = ri + dr;
      if (nc < 0 || nr < 0 || nc >= ww || nr >= wh) continue;
      const n = nr * ww + nc;
      if (wdist[n] > wdist[i] + 1) (wdist[n] = wdist[i] + 1), wq.push(n);
    }
  }
  const waterDist = (x: number, z: number) => {
    const ci = Math.min(ww - 1, Math.max(0, Math.round(x / wcell))), ri = Math.min(wh - 1, Math.max(0, Math.round(z / wcell)));
    return wdist[ri * ww + ci] * wcell;
  };

  // ---------- la missione in corso: passi chiari, segnaposto nel mondo, strada automatica ----------
  type Step = { text: string; done: boolean; pos?: THREE.Vector3 | null; name?: string };
  const ground = (v: THREE.Vector3) => new THREE.Vector3(v.x, T.heightAt(v.x, v.z), v.z);
  // punti di osservazione: a distanza rispettosa dagli animali (mai addosso), dalla parte del rifugio più vicino
  const lookout = (center: THREE.Vector3, toward: THREE.Vector3, dist: number) => {
    const d = new THREE.Vector3(toward.x - center.x, 0, toward.z - center.z).normalize();
    return ground(center.clone().addScaledVector(d, dist));
  };
  const ibexGroup = fauna.groups.find((x) => x.species === "stambecco");
  const ibexSpot = ibexGroup ? lookout(fauna.centroid(ibexGroup), at(ponti), 45) : at(ponti);
  const marmotSpots = fauna.groups.filter((g) => g.species === "marmotta").map((g) => lookout(fauna.centroid(g), at(omio).distanceTo(fauna.centroid(g)) < pianoPR.distanceTo(fauna.centroid(g)) ? at(omio) : pianoPR, 50));
  const marmotNear = () => {
    const me = hiker.root.position;
    return marmotSpots.slice().sort((a, b) => a.distanceTo(me) - b.distanceTo(me))[0] ?? at(omio);
  };
  const ibexAt = () => ibexSpot;
  function quest(): { title: string; steps: Step[] } | null {
    // col temporale la missione aspetta: prima ci si mette al riparo (obiettivo, segnaposto e strada arancione portano lì)
    if (weather.phase === "storm" && !sheltered && stormShelter) {
      const sh = stormShelter.h, me = hiker.root.position;
      return {
        title: "Temporale! Mettiti al riparo",
        steps: [
          { text: "Scendi dalle creste e stai lontana dalle croci", done: me.y / S < 2400 },
          { text: `Raggiungi ${sh.name} (circa ${hm(stormShelter.hours)}) ed entra: E davanti alla porta`, done: false, pos: c.doors.get(sh.name)?.front ?? at(sh), name: sh.name },
          { text: "Dentro, aspetta che passi; poi riprendi la missione", done: false },
        ],
      };
    }
    // una commissione (pane, cappello, Luca) e una missione insieme: in alto si segue quella scelta, l'altra resta nel
    // telefono con il pulsante "Segui" (durante la sfida di corsa conta la corsa)
    const m = missionQuest(), e = encounters.errandQuest(custOmio.root.position);
    if (e && (state.followErrand || !m) && race.phase !== "running" && race.phase !== "countdown") {
      otherQuest = m ? { title: m.title, kind: "missione" } : null;
      return e;
    }
    otherQuest = e ? { title: e.title, kind: "commissione" } : null;
    return m;
  }
  let otherQuest: { title: string; kind: "missione" | "commissione" } | null = null;
  function missionQuest(): { title: string; steps: Step[] } | null {
    if (!state.packed) return { title: "Prepara lo zaino", steps: [{ text: "Raggiungi Marta, la guida, qui in paese", done: false, pos: marta.root.position, name: "Marta" }, { text: "Premi E e prepara lo zaino con lei", done: false }] };
    switch (state.active) {
      case "rientro": {
        const up = rientroStage === "up";
        return {
          title: "Rientro prima del buio",
          steps: [
            { text: `Sali al Rifugio Omio (2100 m) seguendo la strada arancione`, done: !up, pos: custOmio.root.position, name: "Rifugio Omio" },
            { text: "Parla con Giulio, il custode (E), e decidi come tornare", done: !up },
            { text: `Torna a San Martino prima delle ${hhmm(SUNSET)}`, done: mission("rientro") === "done", pos: up ? null : at(martino), name: "San Martino" },
          ],
        };
      }
      case "fauna": {
        const seen = (s: Species) => state.seen.includes(s);
        return {
          title: "Occhi da guardiaparco",
          steps: [
            { text: "Stambecchi: sulle rocce sotto il Rifugio Ponti. Fermati a 20–70 m e premi E", done: seen("stambecco"), pos: ibexAt(), name: "Stambecchi" },
            { text: "Marmotte: sui pascoli alti. Avvicinati piano, fermati quando fischiano", done: seen("marmotta"), pos: marmotNear(), name: "Marmotte" },
            { text: "Aquila reale: gira sopra le pareti della Val di Mello. Guardala da sotto (E)", done: seen("aquila"), pos: ground(eagleAt), name: "Aquila" },
          ],
        };
      }
      case "ghiacciaio":
        return {
          title: "Il ghiacciaio nel tempo",
          steps: [
            { text: "Raggiungi Elena al Piano di Preda Rossa (strada arancione)", done: seenYears.size > 0 || mission("ghiacciaio") === "done", pos: elena.root.position, name: "Elena" },
            { text: "Parla con Elena (E) e guarda il ghiacciaio nel 1850", done: seenYears.has(1850) || mission("ghiacciaio") === "done" },
            { text: "Ora guarda lo scenario 2050", done: seenYears.has(2050) || mission("ghiacciaio") === "done" },
          ],
        };
      case "corsa": {
        const r = race.phase, n = race.next, run = r === "running" || r === "countdown";
        return {
          title: "Sfida di corsa",
          steps: [
            { text: "Vai alla porta di partenza rossa, all'uscita del paese", done: run || r === "done" || Math.hypot(raceStart.x - hiker.root.position.x, raceStart.z - hiker.root.position.z) < 9, pos: raceStart, name: "Partenza" },
            { text: "Premi E sotto la porta: 3, 2, 1, via!", done: run || r === "done" },
            ...race.checkpoints.map((cp, i) => ({ text: i === race.checkpoints.length - 1 ? "Torna alla porta: arrivo!" : `Traguardo ${i + 1}: ${cp.name} (anello rosso, colonna di luce)`, done: r === "done" || (r === "running" && n > i), pos: r === "running" && n === i ? cp.pos : null, name: i === race.checkpoints.length - 1 ? "Arrivo" : cp.name })),
            { text: "Shift (o Corri) per correre: quando il fiato finisce, cammina", done: r === "done" },
          ],
        };
      }
      default:
        return null;
    }
  }

  // segnaposto: colonna di luce e rombo che gira sopra il punto da raggiungere, con nome e distanza
  const marker = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 140, 10, 1, true), new THREE.MeshBasicMaterial({ color: "#f2b632", transparent: true, opacity: 0.22, depthWrite: false, fog: false }));
  beam.position.y = 70;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), new THREE.MeshBasicMaterial({ color: "#f2b632" }));
  gem.position.y = 9;
  marker.add(beam, gem);
  marker.visible = false;
  scene.add(marker);
  const markerLabel = document.createElement("div");
  markerLabel.className = "waypoint";
  document.getElementById("labels")!.appendChild(markerLabel);
  let routeKey = "";
  let missionRoute: { pts: THREE.Vector3[]; idx: number; off: number } | null = null;
  // ---------- dialoghi ----------
  let rientroStage: "up" | "down" = "up";
  async function talkMarta() {
    if (!state.packed) {
      await ui.say("Marta, guida", "Ciao! Sono Marta, accompagno le persone in Val Masino. Prima di partire guardiamo lo zaino: hai sei posti, scegli bene.");
      const ids = await ui.openPack(true);
      state.pack = ids;
      state.packed = true;
      save();
      const good = ids.filter((id) => ITEMS.find((i) => i.id === id)!.good);
      const bad = ids.filter((id) => !ITEMS.find((i) => i.id === id)!.good);
      const missing = ITEMS.filter((i) => i.good && !ids.includes(i.id));
      let msg = good.length >= 5 ? "Ottimo zaino!" : "Buon inizio.";
      if (bad.length) msg += ` Però ${bad.map((id) => ITEMS.find((i) => i.id === id)!.name.toLowerCase()).join(" e ")}… ${ITEMS.find((i) => i.id === bad[0])!.note}`;
      if (missing.length) msg += ` Ti manca: ${missing.map((i) => i.name.toLowerCase()).join(", ")}. ${missing[0].note}`;
      if (!has("frontale")) msg += " Senza frontale, cerca di rientrare con la luce!";
      await ui.say("Marta, guida", msg);
      ui.learned(learn("zaino"));
      if (has("frontale")) ui.learned(learn("frontale"));
      setMission("zaino", "done");
    }
    const options = MISSIONS.filter((m) => m.id !== "zaino");
    const labels = options.map((m) => (mission(m.id) === "done" ? `${m.title} (fatta)` : m.title));
    const i = await ui.say("Marta, guida", "Cosa ti va di fare oggi?", [...labels, "Voglio solo camminare"]);
    if (i >= options.length) {
      state.active = null;
      save();
      return void ui.say("Marta, guida", "Bellissimo. Segui i segnavia bianchi e rossi e guarda l'ora: il sole tramonta verso le 19:30.");
    }
    const m = options[i].id;
    startMission(m);
  }

  async function startMission(m: MissionId) {
    setMission(m, mission(m) === "done" ? "done" : "active");
    state.active = m;
    save();
    if (m === "rientro") {
      rientroStage = "up";
      await ui.say("Marta, guida", `Il Rifugio Omio è sopra Bagni di Masino, a 2100 metri. Sono le ${hhmm(c.getHours())} e il sole tramonta alle ${hhmm(SUNSET)}. <br><b>1.</b> Segui la strada arancione fino al rifugio. <b>2.</b> Parla con Giulio, il custode. <b>3.</b> Decidi con lui come tornare. <br>Intanto lo avviso che stai salendo: dire a qualcuno dove vai è sempre la prima cosa.`);
      ui.learned(learn("dire"));
    } else if (m === "fauna") {
      await ui.say("Marta, guida", "Tre animali da osservare, senza disturbarli. <br><b>1.</b> Gli stambecchi, sulle rocce sotto il Rifugio Ponti. <b>2.</b> Le marmotte, sui pascoli alti. <b>3.</b> L'aquila reale, sopra le pareti della Val di Mello. <br>Il segnaposto giallo ti porta a un punto di osservazione: da lì, quando compare <b>Osserva</b>, premi E. Se ti avvicini troppo scappano!");
    } else if (m === "ghiacciaio") {
      await ui.say("Marta, guida", "Elena studia i ghiacciai ed è al Piano di Preda Rossa, sotto il Disgrazia. <br><b>1.</b> Segui la strada arancione fino a lei (è lontano: puoi correre). <b>2.</b> Parla con lei e guarda il ghiacciaio nel 1850. <b>3.</b> Poi guarda lo scenario del 2050.");
    } else if (m === "corsa") {
      await ui.say("Marta, guida", "Una corsa in Val di Mello, a tempo. <br><b>1.</b> Segui la strada arancione fino alla porta rossa di partenza, qui fuori dal paese. <b>2.</b> Sotto la porta premi E: 3, 2, 1, via! <b>3.</b> Attraversa i tre anelli rossi con la colonna di luce: Rifugio Rasega, Cascina Piana, e di nuovo la porta. <br>Shift (o Corri) per correre: quando il fiato finisce, cammina. Il riquadro a sinistra ti dice sempre il prossimo passo.");
    }
  }

  async function talkOmio() {
    // il pane di Rosa, prima di tutto
    if (await encounters.deliver("omio")) return;
    const h = c.getHours();
    const down = 1.75; // ore per scendere a San Martino (circa, con i tempi CAI)
    if (state.active !== "rientro" || mission("rientro") === "done") {
      await ui.say("Giulio, custode", "Benvenuta all'Omio! Da qui si vede tutta la Val Masino. Se domani fai il Sentiero Roma, parti presto: i temporali, d'estate, arrivano di pomeriggio.");
      ui.learned(learn("meteo"));
      return;
    }
    const spare = SUNSET - (h + down);
    const intro = `Ciao, Marta mi ha detto che arrivavi! Sono le ${hhmm(h)}. Per scendere a San Martino servono circa ${dur(down)} e il sole tramonta alle ${hhmm(SUNSET)}.`;
    if (spare > 0.25) {
      const i = await ui.say("Giulio, custode", `${intro} Hai ${dur(spare)} di margine. Cosa fai?`, ["Scendo subito, con calma", "Resto a dormire qui", "Salgo ancora fino al passo"]);
      if (i === 0) {
        rientroStage = "down";
        await ui.say("Giulio, custode", "Scelta giusta. Ricordati che in valle il sole sparisce dietro le creste prima del tramonto: in basso farà buio presto.");
        ui.learned(learn("tramonto"));
      } else if (i === 1) await sleepHere();
      else {
        await ui.say("Giulio, custode", "Il passo è ancora un'ora su, e poi devi tornare: arriveresti al paese col buio. I tempi dei cartelli sono senza soste, sai? Meglio un'altra volta, partendo presto.");
        ui.learned(learn("tempi"));
      }
    } else {
      const opts = has("frontale") ? ["Resto a dormire qui", "Scendo con la frontale, piano"] : ["Resto a dormire qui", "Scendo lo stesso"];
      const i = await ui.say("Giulio, custode", `${intro} È tardi: arriveresti al buio. Ti consiglio di restare: abbiamo un posto libero.`, opts);
      if (i === 0) await sleepHere();
      else if (has("frontale")) {
        rientroStage = "down";
        await ui.say("Giulio, custode", "Va bene: frontale accesa, resta sul sentiero e segui i segnavia. Mandami un messaggio quando arrivi.");
        ui.learned(learn("frontale"));
        ui.learned(learn("segnavia"));
      } else {
        await ui.say("Giulio, custode", "Senza frontale non ti lascio scendere: al buio è un attimo perdere il sentiero. Stanotte dormi qui.");
        await sleepHere();
      }
    }
  }
  async function sleepHere() {
    await ui.say("Giulio, custode", "Allora cena calda e branda. Domattina con la luce scendi tranquilla.");
    ui.learned(learn("dormire"));
    if (c.sharedTime()) ui.toast("<b>Resti al rifugio.</b> In compagnia il tempo è di tutti: la notte non si salta, ma qui sei al sicuro.");
    else {
      c.setHours(7.25);
      ui.toast("<b>Buongiorno!</b> Hai dormito al Rifugio Omio.");
    }
    setMission("rientro", "done");
    ui.learned(learn("tramonto"));
  }

  async function talkPonti() {
    await ui.say("Sara, custode", "Ciao! Quello lì è il Disgrazia, 3678 metri. Gli stambecchi oggi pascolavano sulle rocce qui sotto: se vuoi vederli, avvicinati piano e fermati quando alzano la testa.");
    ui.learned(learn("meteo"));
  }

  const seenYears = new Set<Year>();
  async function talkElena() {
    if (state.active !== "ghiacciaio" && mission("ghiacciaio") !== "done") startMission("ghiacciaio");
    await ui.say("Elena, glaciologa", "Ciao! Guarda su, verso il Disgrazia: lì c'è il ghiacciaio di Preda Rossa. Con questo visore ti faccio vedere come cambia. Attenzione: è una simulazione semplificata, sposto solo la quota della linea di equilibrio. Non è una mappa storica.");
    ui.learned(learn("ghiacciaio"));
    // il visore: da Elena il ghiacciaio è a quasi 4 km, dietro le creste. La telecamera vola davanti al ghiacciaio,
    // in alto, e lo inquadra tutto (anche le lingue del 1850)
    const me = elena.root.position;
    const target = glacier.center(1850, disgrazia, me, 900);
    const flat = new THREE.Vector3(me.x - target.x, 0, me.z - target.z);
    const d = flat.length();
    flat.normalize();
    const pos = target.clone().addScaledVector(flat, THREE.MathUtils.clamp(d * 0.8, 520, 950));
    pos.y = Math.max(target.y + 260, T.heightAt(pos.x, pos.z) + 120);
    c.cinema({ pos, target: target.clone().addScaledVector(flat, 60) });
    for (;;) {
      const years: Year[] = [1850, 1950, 2025, 2050];
      const i = await ui.say("Elena, glaciologa", `Ora vedi il ${glacier.year === 2025 ? "ghiacciaio di oggi" : glacier.year}. Quale anno vuoi vedere?`, ["1850", "1950", "Oggi", "2050 (scenario)", "Basta così"]);
      if (i === 4) break;
      const y = years[i];
      glacier.setYear(y);
      seenYears.add(y);
      if (y === 1850) {
        await ui.say("Elena, glaciologa", "Metà Ottocento, fine della Piccola Età Glaciale: il ghiaccio scende molto più in basso, con lingue lunghe nei valloni.");
        ui.learned(learn("pea"));
      } else if (y === 1950) await ui.say("Elena, glaciologa", "Metà Novecento: il ghiaccio si è già ritirato parecchio, ma è ancora più esteso di oggi.");
      else if (y === 2025) {
        await ui.say("Elena, glaciologa", "Oggi. Ogni anno a fine estate misuriamo dove arriva la fronte, con i volontari: si segna la distanza con la vernice sulle rocce.");
        ui.learned(learn("misure"));
      } else {
        await ui.say("Elena, glaciologa", "Uno scenario per il 2050 con un clima più caldo: resta solo il ghiaccio più in alto. Quanto ne resterà davvero dipende da quanto ridurremo le emissioni.");
        ui.learned(learn("futuro"));
      }
    }
    glacier.setYear(2025);
    c.cinema(null);
    if (seenYears.has(1850) && seenYears.has(2050) && mission("ghiacciaio") !== "done") {
      setMission("ghiacciaio", "done");
      ui.toast("<b>Missione completata</b> Il ghiacciaio nel tempo");
      sound.ui("done");
    }
  }

  async function readSign(i: number) {
    const s = signs.signposts[i];
    const rows = s.lines.map((l) => `<span class="sign-row"><b>${l.name}</b>${l.ele ? ` <small>${l.ele} m</small>` : ""}<em>${l.time}</em></span>`).join("");
    await ui.say(`Cartello CAI · ${s.place.name}`, `<span class="sign">${rows}</span><small class="note">Tempi indicativi, calcolati come quelli dei cartelli (senza soste).</small>`);
    ui.learned(learn("tempi"));
  }

  async function observe(species: Species) {
    const name = species === "stambecco" ? "Stambecchi" : species === "camoscio" ? "Camosci" : species === "marmotta" ? "Marmotte" : "Aquila reale";
    if (!state.seen.includes(species)) {
      state.seen.push(species);
      save();
    }
    ui.toast(`<b>${name}</b> osservati da una distanza rispettosa`);
    ui.learned(learn(species));
    if (state.active === "fauna" && ["stambecco", "marmotta", "aquila"].every((s) => state.seen.includes(s)) && mission("fauna") !== "done") {
      setMission("fauna", "done");
      ui.learned(learn("cani"));
      ui.toast("<b>Missione completata</b> Occhi da guardiaparco");
      sound.ui("done");
    }
  }

  // ---------- al riparo: si apre la porta, si entra, si aspetta che passi ----------
  const tween = (ms: number, f: (k: number) => void) =>
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
  const hhmmNow = () => hhmm(c.getHours());
  async function enterShelter(p: Place, door: Door) {
    if (indoors) return;
    indoors = true;
    const kind = p.kind === "bivacco" ? "bivacco" : "rifugio";
    // davanti alla porta, rivolta verso di lei; la porta si apre e si entra
    const from = door.front.clone(), to = door.inside.clone();
    hiker.root.position.copy(from);
    hiker.heading = Math.atan2(to.x - from.x, to.z - from.z);
    hiker.root.rotation.y = hiker.heading;
    sound.ui("blip");
    const base = door.pivot.userData.base as number;
    await tween(450, (k) => (door.pivot.rotation.y = base + k * 1.7));
    await tween(700, (k) => {
      hiker.root.position.lerpVectors(from, to, k);
      hiker.root.position.y = T.heightAt(hiker.root.position.x, hiker.root.position.z);
    });
    hiker.root.visible = false;
    sheltered = true;
    state.sheltered = true;
    save();
    sound.ui("done");
    const stormy = weather.phase !== "clear";
    const text = kind === "rifugio"
      ? `Dentro c'è un bel tepore e profumo di minestra. ${stormy ? "Fuori piove forte e tuona: qui sei al sicuro." : "Fuori il cielo è sereno."}`
      : `È un riparo piccolo e spartano, ma asciutto. ${stormy ? "Senti la pioggia battere sulla lamiera: qui sei al sicuro." : "Fuori il cielo è sereno."} I bivacchi sono sempre aperti: si lasciano puliti per chi arriva dopo.`;
    ui.learned(learn(kind === "bivacco" ? "bivacco" : "temporale"));
    showInterior(p, kind, text, door);
  }
  function showInterior(p: Place, kind: "rifugio" | "bivacco", text: string, door: Door) {
    const stormy = weather.phase !== "clear";
    const buttons: { label: string; fn: () => void }[] = [];
    if (stormy && !c.sharedTime()) buttons.push({ label: `Aspetta che passi (fino alle ${hhmm(weather.endsAt)})`, fn: () => void waitStorm(p, kind, door) });
    buttons.push({ label: stormy ? "Esci comunque" : "Esci", fn: () => void exitShelter(door) });
    if (stormy && c.sharedTime()) text += " <small>In compagnia il tempo è di tutti: aspetta qui dentro che passi.</small>";
    ui.showInside({ kind, name: p.name, text, clock: hhmmNow(), rain: stormy, buttons });
  }
  async function waitStorm(p: Place, kind: "rifugio" | "bivacco", door: Door) {
    const h0 = c.getHours(), h1 = weather.endsAt + 0.08;
    ui.showInside({ kind, name: p.name, text: kind === "rifugio" ? "Una tazza di tè, due chiacchiere col custode, il rumore della pioggia…" : "Ti siedi sulla branda e ascolti la pioggia sulla lamiera…", clock: hhmmNow(), rain: true, buttons: [] });
    await tween(3200, (k) => {
      c.setHours(h0 + (h1 - h0) * k);
      ui.setInside(hhmmNow(), undefined, k < 0.85);
    });
    showInterior(p, kind, "<b>Il temporale è passato.</b> Fuori il cielo si apre e l'aria profuma di bagnato: puoi ripartire e riprendere la missione.", door);
  }
  async function exitShelter(door: Door) {
    ui.hideInside();
    hiker.root.visible = true;
    hiker.root.position.copy(door.front);
    hiker.heading = Math.atan2(door.front.x - door.inside.x, door.front.z - door.inside.z);
    hiker.root.rotation.y = hiker.heading;
    const base = door.pivot.userData.base as number;
    await tween(450, (k) => (door.pivot.rotation.y = base + (1 - k) * 1.7));
    indoors = false;
  }
  const shelterDoors = data.huts
    .filter((h) => h.kind === "rifugio" || h.kind === "bivacco")
    .flatMap((h) => {
      const d = c.doors.get(h.name);
      return d ? [{ pos: d.front, r: 4, text: () => (weather.phase !== "clear" && !indoors ? `Entra nel ${h.kind === "bivacco" ? "bivacco" : "rifugio"} al riparo` : null), act: () => void enterShelter(h, d) }] : [];
    });

  // ---------- cose con cui interagire ----------
  const interacts: Interact[] = [
    { pos: marta.root.position, r: 6, text: () => "Parla con Marta", act: talkMarta },
    { pos: custOmio.root.position, r: 6, text: () => "Parla con Giulio, il custode", act: talkOmio },
    { pos: custPonti.root.position, r: 6, text: () => "Parla con Sara, la custode", act: talkPonti },
    { pos: elena.root.position, r: 6, text: () => "Parla con Elena, la glaciologa", act: talkElena },
    { pos: raceStart, r: 8, text: () => (race.phase === "running" || race.phase === "countdown" ? null : "Inizia la sfida di corsa"), act: () => {
      if (state.active !== "corsa") startMission("corsa");
      hiker.root.position.set(raceStart.x, raceStart.y, raceStart.z);
      race.begin();
      ui.showRun(true);
    } },
    ...signs.signposts.map((s, i) => ({ pos: s.pos, r: 5, text: () => "Leggi il cartello", act: () => readSign(i) })),
    ...collect.interacts,
    ...encounters.interacts,
    ...shelterDoors,
    ...cairnSet.cairns.map((k) => ({ pos: k.pos, r: 5, text: () => (state.cairns.includes(k.id) || mini.playing ? null : "Rimetti in piedi l'ometto"), act: () => void fixCairn(k.id) })),
    ...(climb ? [{ pos: climb.base, r: 6, text: () => (climb!.active ? null : "Arrampica con Davide"), act: talkDavide }] : []),
    ...blocks.map((bk) => ({ pos: bk.climb.base, r: 6, text: () => (activeClimb() ? null : `Arrampica «${bk.name}» (${bk.grade})`), act: () => void talkBlock(bk) })),
  ];

  // ---------- fiato ----------
  let stamina = 1, exhausted = false, runToggle = false, finishShown = 0;
  ui.tools.onRun = () => {
    runToggle = !runToggle;
    ui.setRunToggle(runToggle);
  };
  // il telefono: missioni, mappa, diario, zaino, spille
  const phone = new Phone(() => ({ hours: c.getHours(), place: c.place(), alt: hiker.root.position.y / S, sunset: SUNSET }), map, {
    jacket: c.jacket,
    setJacket: c.setJacket,
    apply: () => hiker.setOutfit(outfitOf()),
  });
  // dal telefono: quale seguire tra missione e commissione
  ui.tools.onFollow = (kind) => {
    state.followErrand = kind === "commissione";
    save();
    routeKey = "";
  };
  ui.tools.onPhone = () => {
    if (phone.isOpen || !ui.busy) phone.toggle();
  };

  let tick = 0;
  let lastMark = -1;
  let stormShelter: { h: Place; hours: number } | null = null;
  let shelterHint = false, indoors = false;
  /** la telefonata di Marta per il temporale: da fare appena possibile, una volta al giorno */
  let callPending = false, calledToday = false, callDay = -1;
  function martaCalls() {
    callPending = false;
    calledToday = true;
    // telefono scarico: niente chiamata (per questo, in montagna, si porta anche la cartina)
    if (state.battery < 0.05) return void ui.toast("<b>Il telefono è scarico:</b> Marta non riesce a chiamarti. Guarda il cielo e cerca riparo da sola.", "warn");
    ui.ringCall("Marta, guida", () => void martaTalks(), () => {
      const sh = nearestShelter();
      ui.toast(`<b>Messaggio di Marta:</b> «Temporale in arrivo! Lascia stare la missione e vai al riparo${sh ? `: ${sh.h.name}, circa ${hm(sh.hours)}` : ""}.»`, "warn");
    });
  }
  async function martaTalks() {
    if (indoors) {
      await ui.say("Marta, al telefono", "Ciao! Dalla valle vedo arrivare un temporale… ma sei già al coperto: brava. Resta lì finché passa, poi riparti tranquilla.");
      return;
    }
    const sh = nearestShelter();
    const where = sh ? `il riparo più vicino a te è <b>${sh.h.name}</b>, circa ${hm(sh.hours)} di cammino` : "cerca il rifugio o il bivacco più vicino";
    const i = await ui.say("Marta, al telefono", `Ciao, sono Marta! Da qui vedo nuvoloni neri sul Disgrazia: tra poco arriva un temporale. La missione può aspettare. Scendi dalle creste, stai lontana dalle croci di vetta: ${where}. Quando arrivi, entra e aspetta che passi.`, ["Ok, vado al riparo", "E se sono lontana da tutto?"]);
    if (i === 1)
      await ui.say("Marta, al telefono", "Allora scendi di quota, lontano da creste, cime e alberi isolati. Se i fulmini sono vicini, accovacciati con i piedi uniti, sopra lo zaino, e non sdraiarti per terra. Appena smette di tuonare raggiungi il riparo.");
    await ui.say("Marta, al telefono", "Ti ho segnato la strada: segui l'indicazione in alto. Chiamami se serve!");
    ui.learned(learn("temporale"));
  }
  let eagleCall = 10, sheltered = false, crestWarn = 0, cowsSeen = state.diary.includes("mucche");
  // per raccontare agli altri giocatori le imprese nuove
  let told = { stamps: state.stamps.length, summits: state.summits.length, done: MISSIONS.filter((m) => mission(m.id) === "done").length, boulder: state.boulder };
  let darkWarned = false;
  return {
    /** solo per le prove automatiche (?debug) */
    debug: { fauna, nature, cairns: cairnSet.cairns, blocks, skyEvents, elena: elena.root.position, marta: marta.root.position, state, race, raceStart, glacier, data, pickHut, guide: () => guide },
    get runToggle() {
      return runToggle;
    },
    /** chi chiede di correre e se può farlo, con il fiato */
    canRun(wantRun: boolean, moving: boolean, dt: number) {
      const running = wantRun && moving && !exhausted;
      const regen = has("acqua") ? 1.3 : 1;
      // circa 25 secondi di corsa a fiato pieno; si recupera camminando (in 10 s) o da fermi (in 4 s)
      stamina += running ? -dt / 25 : (dt / (moving ? 10 : 4)) * regen;
      stamina = THREE.MathUtils.clamp(stamina, 0, 1);
      if (stamina <= 0) exhausted = true;
      if (exhausted && stamina > 0.25) exhausted = false;
      return running;
    },
    blocked: () => ui.busy || race.phase === "countdown" || mini.playing || !!activeClimb(),
    phone,
    weather,
    life,
    /** la via su cui sei (o l'ultima su cui sei stata): la usa il ciclo principale per telecamera e comandi */
    get climb() {
      return activeClimb() ?? lastClimb;
    },
    setWeatherSeed: (seed: number) => weather.setSeed(seed),
    takePhoto: () => collect.takePhoto("Foto libera"),
    /** la fotocamera: cosa c'è nel mirino, e lo scatto */
    photo: {
      name: (s: keyof typeof SUBJECTS) => SUBJECTS[s].name,
      /** alberi e massi che possono coprire i soggetti */
      setOccluders: (o: THREE.Object3D[]) => (nature.occluders = o),
      /** l'arcobaleno nell'inquadratura (il mirino lo dice) */
      rainbow: (camera: THREE.PerspectiveCamera) => skyEvents.rainbowInView(camera),
      aim(camera: THREE.PerspectiveCamera): Aim | null {
        const targets: Target[] = [...nature.flowers, ...nature.birds(), ...fauna.targets(), ...life.cows.map((cw) => ({ subject: "mucca" as const, pos: cw.obj.position.clone().setY(cw.obj.position.y + 1) }))];
        return nature.aim(camera, targets);
      },
      shoot(aim: Aim | null, img: string) {
        const h = c.getHours();
        const time = `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
        sound.ui("go");
        // l'arcobaleno non è nel taccuino, ma ha la sua foto
        if (!aim && skyEvents.rainbowInView(c.camera)) {
          addPhoto({ img, place: "Arcobaleno", time });
          ui.toast(sawEvent("foto-arcobaleno") ? "<small>Nell'album</small><b>L'arcobaleno!</b>" : "<b>Un altro arcobaleno nell'album</b>", "task");
          return;
        }
        if (!aim || !aim.ok) {
          addPhoto({ img, place: c.place(), time });
          ui.toast(aim ? `<b>${SUBJECTS[aim.subject].name}</b> ${aim.why}` : "<b>Foto nell'album</b> Per il taccuino metti al centro un fiore o un animale.", aim ? "warn" : "");
          return;
        }
        const s = SUBJECTS[aim.subject];
        const first = !state.photos[aim.subject];
        state.photos[aim.subject] = (state.photos[aim.subject] ?? 0) + 1;
        state.shots++;
        save();
        addPhoto({ img, place: s.name, time });
        if (first) {
          addToNotebook(aim.subject, img);
          ui.toast(`<small>Nuova scheda nel taccuino</small><b>${s.name}</b>`, "task");
          sound.ui("learn");
          if (s.fact) ui.learned(learn(s.fact));
        } else ui.toast(`<b>Bella foto!</b> ${s.name}`);
        // fotografare un animale da lontano vale come osservarlo (per la missione del guardiaparco)
        if (aim.subject === "stambecco" || aim.subject === "marmotta" || aim.subject === "aquila" || aim.subject === "camoscio") void observe(aim.subject);
      },
    },
    hasLamp: () => has("frontale"),
    update(dt: number) {
      phone.update(dt);
      nature.update(dt);
      encounters.update(dt);
      const me = hiker.root.position;
      // persone: girate verso di te quando sei vicina
      for (const p of people) {
        const d = p.root.position.distanceTo(me);
        if (d < 25) p.heading += Math.atan2(Math.sin(Math.atan2(me.x - p.root.position.x, me.z - p.root.position.z) - p.heading), Math.cos(Math.atan2(me.x - p.root.position.x, me.z - p.root.position.z) - p.heading)) * (1 - Math.exp(-4 * dt));
        p.update(dt, STILL, false, T);
      }
      // animali
      for (const e of fauna.update(dt, me)) {
        if (e.kind === "fled") ui.toast(`<b>Troppo vicina!</b> ${e.species === "camoscio" ? "I camosci sono scappati" : "Gli stambecchi sono scappati"}.`, "warn"), sound.ui("fail");
        if (e.kind === "whistle") ui.toast("<b>Fiiiiuu!</b> Una marmotta ha fischiato l'allarme.", "warn"), sound.whistle(me.x + 20, me.z);
        ui.learned(learn("distanza"));
      }
      glacier.update(dt);
      collect.update(dt);
      climb?.idle(dt);
      for (const bk of blocks) bk.climb.idle(dt);
      // la vita: saluti e campanacci
      const day = 1 - c.getNight();
      const lv = life.update(dt, me, day);
      for (const b of lv.bells) sound.cowbell(b.x, b.z);
      if (lv.greet) {
        ui.toast(`<b>${lv.greet.name}</b> «Ciao! ${lv.greet.tip}»`);
        sound.ui("blip");
      }
      // l'aquila ogni tanto chiama
      eagleCall -= dt;
      if (eagleCall <= 0) {
        eagleCall = 18 + Math.random() * 20;
        if (Math.hypot(eagleAt.x - me.x, eagleAt.z - me.z) < 320 && day > 0.5) sound.eagle(eagleAt.x, eagleAt.z);
      }
      // meteo
      for (const e of weather.update(dt, c.getHours(), c.camPos())) {
        if (e === "building") {
          ui.toast("<b>Nuvole nere sul Disgrazia…</b> tra poco arriva il temporale.", "warn");
          sound.thunder();
          callPending = true; // Marta chiama appena sei libera
        }
        if (e === "start") {
          if (!calledToday) callPending = true;
          ui.toast("<b>Temporale!</b> Scendi dalle creste e cerca riparo in un rifugio o in un bivacco.", "warn");
          stormShelter = nearestShelter();
          shelterHint = false;
          // la strada scelta sulla mappa si sospende: ora conta il riparo
          guide = null;
          if (stormShelter) setTimeout(() => ui.toast(`<b>La missione aspetta.</b> Segui la strada arancione fino a ${stormShelter?.h.name ?? "un riparo"}.`), 1800);
          ui.learned(learn("temporale"));
          sheltered = false;
        }
        if (e === "thunder") sound.thunder();
        if (e === "end") {
          // dopo il temporale, col sole: l'arcobaleno
          skyEvents.rainbowNow(c.getHours());
          ui.toast("<b>Il temporale è passato.</b> Puoi riprendere la missione da dove l'avevi lasciata.");
          stormShelter = null;
        }
      }
      if (weather.phase === "storm") {
        const roof = data.huts.some((h) => h.kind !== "alpeggio" && Math.hypot(h.p[0] * S - me.x, h.p[1] * S - me.z) < 18);
        // vicino a un riparo: si entra dalla porta (E), non basta starci accanto
        if (roof && !sheltered && !shelterHint) {
          shelterHint = true;
          ui.toast("<b>Ci sei!</b> Vai alla porta e premi <kbd>E</kbd> per entrare al riparo.");
        }
        crestWarn -= dt;
        if (!roof && me.y / S > 2400 && crestWarn <= 0) {
          crestWarn = 25;
          ui.toast("<b>Sei in alto col temporale:</b> scendi dalle creste e stai lontana dalle croci!", "warn");
        }
      }
      // la telefonata di Marta: appena sei libera (non mentre parli, arrampichi, corri o sei già dentro)
      const today = Math.floor(c.getHours() / 24);
      if (today !== callDay) (callDay = today), (calledToday = false);
      if (callPending && !calledToday && !ui.busy && !activeClimb() && race.phase !== "running" && race.phase !== "countdown") martaCalls();
      // eventi del cielo e della valle
      for (const e of skyEvents.update(dt, { hours: c.getHours(), cam: c.camPos(), me, sunDir: c.sunDir(), night: c.getNight(), storm: weather.storm })) {
        if (e === "heli-arrive") {
          ui.toast("<b>Senti un elicottero?</b> È l'elisoccorso: risale la valle per aiutare qualcuno sui monti.");
          if (sawEvent("elisoccorso")) ui.learned(learn("soccorso"));
        }
        if (e === "heli-hover") ui.toast("Cala il soccorritore col verricello. Se fossi tu ad aver bisogno: braccia alzate a <b>Y</b> = «serve aiuto».");
        if (e === "rainbow") {
          ui.toast("<b>Un arcobaleno!</b> Si vede col sole alle spalle e la pioggia davanti. Fotografalo (P) prima che svanisca.");
          sawEvent("arcobaleno");
          sound.ui("learn");
        }
        if (e === "meteor") {
          const night = Math.floor((c.getHours() + 12) / 24);
          if (night !== meteorNight) {
            meteorNight = night;
            ui.toast("<b>Una stella cadente!</b> Lontano dalle luci dei paesi il cielo di montagna è pieno di stelle.");
          }
          sawEvent("stella");
        }
      }
      // suoni dell'ambiente
      const alt = me.y / S;
      const forest = c.cover.at(c.cover.forest, me.x, me.z);
      sound.update(
        { alt, night: c.getNight(), forest, water: waterDist(me.x, me.z), speed: hiker.speed, gliding: hiker.gliding, rain: weather.storm > 0.5 ? weather.storm : 0, meadow: alt > 800 && alt < 2400 && forest < 0.3 ? 1 : 0 },
        me, c.getYaw(),
      );
      // corsa
      for (const e of race.update(dt, me, c.camPos())) {
        if (e.kind === "count") ui.toast(`<b class="big">${e.n}</b>`), sound.ui("blip");
        if (e.kind === "go") ui.toast('<b class="big">Via!</b>'), sound.ui("go");
        if (e.kind === "checkpoint") ui.toast(`<b>${e.name}</b> ${ui.fmtTime(race.time)}`);
        if (e.kind === "finish") {
          const best = state.bestRun;
          const record = !best || e.time! < best;
          if (record) state.bestRun = e.time!;
          save();
          ui.toast(`<b>Arrivo!</b> ${ui.fmtTime(e.time!)}${record ? " · nuovo record" : ` · record ${ui.fmtTime(best!)}`}`);
          sound.ui("done");
          ui.learned(learn("corsa"));
          if (mission("corsa") !== "done") setMission("corsa", "done");
          finishShown = 4;
        }
      }
      if (finishShown > 0 && (finishShown -= dt) <= 0) race.phase = "idle";
      ui.showRun(race.phase !== "idle" || stamina < 0.999);
      ui.setRun(race.phase === "idle" ? null : race.time, race.phase === "running" ? `${race.next} / ${race.checkpoints.length}` : "", stamina);

      // la strada: avanza il punto da seguire, ricalcola se ne esci, arrivo
      routeView.update(performance.now() / 1000);
      if (guide) {
        const g = guide;
        // aggancio al punto più vicino un po' più avanti (se hai tagliato o corso), poi avanza
        let bi = g.idx, bd = Infinity;
        for (let i = g.idx; i < g.pts.length; i++) {
          const d = Math.hypot(g.pts[i].x - me.x, g.pts[i].z - me.z);
          if (d < bd) (bd = d), (bi = i);
        }
        if (bd < 30) g.idx = bi;
        while (g.idx < g.pts.length - 1 && Math.hypot(g.pts[g.idx].x - me.x, g.pts[g.idx].z - me.z) < 9) g.idx++;
        let near = Infinity;
        for (let i = g.idx; i < Math.min(g.pts.length, g.idx + 40); i++) near = Math.min(near, Math.hypot(g.pts[i].x - me.x, g.pts[i].z - me.z));
        g.off = near > 60 && !hiker.gliding ? g.off + dt : 0;
        if (g.off > 4) {
          ui.toast("Sei uscita dalla strada: la ricalcolo.");
          setGuide(g.dest, true);
        }
        if (guide && Math.hypot(guide.dest.p[0] * S - me.x, guide.dest.p[1] * S - me.z) < 22) {
          ui.toast(`<b>Arrivata!</b> ${guide.dest.name}`);
          sound.ui("done");
          guide = null;
          routeView.show(null);
          routeKey = "";
        }
      }

      tick += dt;
      if (tick > 0.2) {
        tick = 0;
        // missione rientro: arrivo in paese
        if (state.active === "rientro" && rientroStage === "down" && mission("rientro") !== "done" && me.distanceTo(at(martino)) < 70) {
          const h = c.getHours();
          setMission("rientro", "done");
          ui.toast(h < SUNSET ? `<b>Missione completata</b> Rientrata alle ${hhmm(h)}, con la luce` : `<b>Rientrata alle ${hhmm(h)}</b>, col buio: la prossima volta parti prima`);
          sound.ui("done");
        }
        // al buio senza frontale
        if (!darkWarned && c.getHours() > SUNSET + 0.4 && !has("frontale") && state.packed) {
          darkWarned = true;
          ui.toast("<b>È buio</b> e non hai la frontale: cammina piano e resta sul sentiero.", "warn");
          ui.learned(learn("frontale"));
        }
        // imprese da raccontare agli altri
        if (state.stamps.length > told.stamps) c.broadcast("stamp", state.stamps[state.stamps.length - 1]);
        if (state.summits.length > told.summits) c.broadcast("summit", state.summits[state.summits.length - 1]);
        const doneNow = MISSIONS.filter((m) => mission(m.id) === "done");
        if (doneNow.length > told.done) c.broadcast("mission", doneNow[doneNow.length - 1].id);
        if (state.boulder && !told.boulder) c.broadcast("boulder", "Sasso Remenno");
        told = { stamps: state.stamps.length, summits: state.summits.length, done: doneNow.length, boulder: state.boulder };
        // le mucche: la prima volta che passi vicino a una mandria
        if (!cowsSeen && life.cows.some((cw) => cw.obj.position.distanceTo(me) < 25)) {
          cowsSeen = true;
          ui.learned(learn("mucche"));
        }
        // il primo segnavia che incontri
        if (!state.diary.includes("segnavia") && lastMark < 0) {
          for (const p of signs.marks) if (Math.hypot(p.x - me.x, p.z - me.z) < 4) {
            lastMark = 1;
            ui.learned(learn("segnavia"));
            break;
          }
        }
      }

      // la missione: riquadro con i passi, segnaposto, strada automatica, freccia in alto
      const q = race.phase === "running" || race.phase === "countdown" ? quest() ?? null : quest();
      const cur = q?.steps.find((st) => !st.done) ?? null;
      ui.setQuest(q ? q.title : null, q ? q.steps.map((st) => ({ text: st.text, done: st.done, current: st === cur })) : [], otherQuest);
      const tgt = guide ? { pos: guide.pts[Math.min(guide.pts.length - 1, guide.idx + 2)], name: guide.dest.name } : cur?.pos ? { pos: cur.pos, name: cur.name ?? "" } : null;
      const goalText = guide ? directions(guide, me) : cur ? cur.text : q ? null : "Esplora la valle · parla con Marta per una missione";
      const ac = activeClimb();
      if (ac) {
        // in parete l'obiettivo è la cima (la catena, sul Remenno)
        const pr = ac.progress();
        const bk = blocks.find((x) => x.climb === ac);
        ui.setGoal(bk ? `Blocco «${bk.name}» (${bk.grade}) · presa ${pr.n} di ${pr.total} · arriva in cima` : `Via del Sasso Remenno · presa ${pr.n} di ${pr.total} · sali fino alla catena`);
      } else ui.setGoal(goalText);
      if (tgt && !ac) {
        const ang = Math.atan2(tgt.pos.x - me.x, tgt.pos.z - me.z) - (c.getYaw() + Math.PI);
        // con una strada scelta la distanza è già nell'indicazione ("tra 300 m, al bivio…")
        ui.pointGoal(-Math.atan2(Math.sin(ang), Math.cos(ang)), guide ? null : Math.hypot(tgt.pos.x - me.x, tgt.pos.z - me.z) / S);
      } else ui.pointGoal(null, null);
      // segnaposto e strada automatica verso il punto del passo corrente (se non stai seguendo una strada scelta da te)
      const mpos = guide || ac ? null : cur?.pos ?? null; // in parete niente segnaposto davanti alla roccia
      marker.visible = !!mpos;
      if (mpos) {
        marker.position.set(mpos.x, T.heightAt(mpos.x, mpos.z), mpos.z);
        gem.rotation.y += dt * 1.5;
        gem.position.y = 9 + Math.sin(performance.now() / 400) * 0.6;
        const d = Math.hypot(mpos.x - me.x, mpos.z - me.z);
        const v = new THREE.Vector3(mpos.x, marker.position.y + 12, mpos.z).project(c.camera);
        const on = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && d > 12;
        markerLabel.style.opacity = on ? "1" : "0";
        if (on) {
          markerLabel.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
          markerLabel.innerHTML = `<b>${cur?.name ?? ""}</b><span>${d / S < 1000 ? `${Math.round(d / S / 10) * 10} m` : `${(d / S / 1000).toFixed(1).replace(".", ",")} km`}</span>`;
        }
        const key = `${state.active}:${q?.steps.indexOf(cur!)}:${Math.round(mpos.x / 20)},${Math.round(mpos.z / 20)}`;
        if (key !== routeKey) {
          routeKey = key;
          const r = d > 40 ? router.route(hiker.root.position, ground(mpos)) : null;
          missionRoute = r ? { pts: r.pts, idx: 0, off: 0 } : null;
          routeView.show(r?.pts ?? null);
        }
        if (missionRoute) {
          // aggancio e ricalcolo come per la strada scelta
          const mr = missionRoute;
          let bi = mr.idx, bd = Infinity;
          for (let i = mr.idx; i < mr.pts.length; i++) {
            const dd = Math.hypot(mr.pts[i].x - me.x, mr.pts[i].z - me.z);
            if (dd < bd) (bd = dd), (bi = i);
          }
          if (bd < 30) mr.idx = bi;
          mr.off = bd > 60 && !hiker.gliding ? mr.off + dt : 0;
          if (mr.off > 4) routeKey = ""; // ricalcola dal punto in cui sei
          if (d < 25) {
            missionRoute = null;
            routeView.show(null);
          }
        }
      } else {
        markerLabel.style.opacity = "0";
        if (!guide && routeKey) {
          routeKey = "";
          missionRoute = null;
          routeView.show(null);
        }
      }

      // la cosa più vicina con cui interagire
      let best: { text: string; act: () => void; d: number } | null = null;
      if (!ui.busy && !ac) {
        for (const it of interacts) {
          const d = Math.hypot(it.pos.x - me.x, it.pos.z - me.z);
          const t = d < it.r ? it.text() : null;
          if (t && (!best || d < best.d)) best = { text: t, act: it.act, d };
        }
        const obs = fauna.observable(me);
        if (obs && !best) {
          const label = obs.species === "stambecco" ? "Osserva gli stambecchi" : obs.species === "camoscio" ? "Osserva i camosci" : obs.species === "marmotta" ? "Osserva le marmotte" : "Osserva l'aquila reale";
          best = { text: label, act: () => observe(obs.species), d: 0 };
        }
      }
      ui.prompt(best?.text ?? null, best ? () => void best!.act() : null);
    },
  };
}
