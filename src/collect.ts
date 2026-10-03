import * as THREE from "three";
import { sound } from "./audio";
import { SUMMITS } from "./content";
import * as mini from "./minigames";
import type { Hiker } from "./player";
import { learn, save, state } from "./state";
import * as ui from "./ui";
import { S, type Terrain, type WorldData } from "./world";

/**
 * Le cose da fare lungo il cammino: timbri dei rifugi, libri di vetta, rifiuti da riportare a valle, foto dai belvedere,
 * rimbalzello sui laghi (la scalata del Sasso Remenno è in climb.ts).
 */
export type Interact = { pos: THREE.Vector3; r: number; text: () => string | null; act: () => void };
const mat = (c: string, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: rough });

export function buildCollect(t: Terrain, data: WorldData, hiker: Hiker, rng: () => number, snapshot: () => string, hours: () => number) {
  const group = new THREE.Group();
  const interacts: Interact[] = [];
  const at = (x: number, z: number, lift = 0) => new THREE.Vector3(x, t.heightAt(x, z) + lift, z);
  const hhmm = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;

  // ---------- timbri dei rifugi ----------
  for (const h of data.huts.filter((x) => x.kind === "rifugio")) {
    const pos = at(h.p[0] * S, h.p[1] * S);
    interacts.push({
      pos, r: 11,
      text: () => (state.stamps.includes(h.name) ? null : "Timbra il libretto"),
      act: () => {
        state.stamps.push(h.name);
        state.battery = 1; // al rifugio si ricarica anche il telefono
        save();
        sound.ui("stamp");
        setTimeout(() => sound.ui("learn"), 150);
        ui.toast(`<small>Timbro ${state.stamps.length} · telefono ricaricato</small><b>${h.name}</b>`, "stamp");
        ui.learned(learn("timbri"));
      },
    });
  }

  // ---------- libri di vetta: croce di legno o ometto di sassi, con la scatola del libro ----------
  const wood = mat("#6a4a32"), stone = mat("#9b9095"), box = mat("#c9c3bb", 0.4);
  for (const name of SUMMITS) {
    const pk = data.peaks.find((p) => p.name.startsWith(name));
    if (!pk) continue;
    const pos = at(pk.p[0] * S, pk.p[1] * S);
    const g = new THREE.Group();
    if (pk.cross) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4, 0.25), wood);
      v.position.y = 2;
      const h = new THREE.Mesh(new THREE.BoxGeometry(2, 0.25, 0.25), wood);
      h.position.y = 3;
      g.add(v, h);
    } else {
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 - i * 0.06, 0), stone);
        s.position.y = 0.3 + i * 0.42;
        s.rotation.set(i, i * 2, 0);
        g.add(s);
      }
    }
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.25), box);
    b.position.set(0.6, 0.15, 0.3);
    g.add(b);
    g.position.copy(pos);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    group.add(g);
    interacts.push({
      pos, r: 12,
      text: () => (state.summits.includes(name) ? null : "Firma il libro di vetta"),
      act: async () => {
        const i = await ui.say(`Libro di vetta · ${pk.name} ${pk.ele ? `${pk.ele} m` : ""}`, `Dentro la scatola c'è un quaderno con nomi e date di chi è salito prima di te. Sono le ${hhmm(hours())}: cosa scrivi?`, ["«Che vista!»", "«Ciao da Montagna viva»", "«Torno giù prima del buio»"]);
        state.summits.push(name);
        save();
        sound.ui("done");
        ui.toast(`<small>Libro di vetta ${state.summits.length} / ${SUMMITS.length}</small><b>${pk.name}</b> ${["Che vista!", "Ciao!", "Giù prima del buio"][i]}`);
        ui.learned(learn("vetta"));
      },
    });
  }

  // ---------- rifiuti lungo i sentieri ----------
  const center = new THREE.Vector3(6600, 0, 6700); // circa San Martino (ritoccato sotto)
  const martino = data.huts.find((h) => h.name === "San Martino");
  if (martino) center.set(martino.p[0] * S, 0, martino.p[1] * S);
  const trash: { g: THREE.Object3D; id: number }[] = [];
  const kinds = [
    () => new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), mat("#4f9a6a", 0.3)),
    () => new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 8), mat("#b9bcc2", 0.3)),
    () => new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.28), mat("#e8b23a", 0.5)),
  ];
  const paths = data.paths.filter((p) => p.k === "p" || p.k === "a");
  for (let id = 0, tries = 0; id < 30 && tries < 3000; tries++) {
    const p = paths[Math.floor(rng() * paths.length)];
    const pt = p.pts[Math.floor(rng() * p.pts.length)];
    const x = pt[0] * S + (rng() - 0.5) * 3, z = pt[1] * S + (rng() - 0.5) * 3;
    if (Math.hypot(x - center.x, z - center.z) > 2200) continue;
    const m = kinds[id % 3]();
    m.position.copy(at(x, z, 0.12));
    m.rotation.set(Math.PI / 2, rng() * 3, 0);
    group.add(m);
    const myId = id;
    if (state.litter.includes(myId)) m.visible = false;
    trash.push({ g: m, id: myId });
    interacts.push({
      pos: m.position, r: 3.2,
      text: () => (m.visible ? "Raccogli il rifiuto" : null),
      act: () => {
        m.visible = false;
        state.litter.push(myId);
        save();
        sound.ui("pick");
        ui.toast(`<b>Rifiuto nello zaino</b> ${state.litter.length} riportati a valle`);
        ui.learned(learn("rifiuti"));
      },
    });
    id++;
  }

  // ---------- belvedere: panchina e foto ----------
  const spots: { pos: THREE.Vector3; name: string }[] = data.views.map((v, i) => ({ pos: at(v.p[0] * S, v.p[1] * S), name: v.name ?? `Belvedere ${i + 1}` }));
  for (const n of ["Rifugio Cesare Ponti", "Rifugio Antonio Omio", "Rifugio Luigi Gianetti"]) {
    const h = data.huts.find((x) => x.name === n);
    if (h) spots.push({ pos: at(h.p[0] * S - 14, h.p[1] * S + 10), name: `Belvedere del ${n.replace("Rifugio ", "")}` });
  }
  const bench = mat("#8a6446");
  for (const s of spots) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.5), bench);
    seat.position.y = 0.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.1), bench);
    back.position.set(0, 0.85, -0.22);
    g.add(seat, back);
    for (const x of [-0.75, 0.75]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.45), bench);
      leg.position.set(x, 0.25, 0);
      g.add(leg);
    }
    g.position.copy(s.pos);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    group.add(g);
    interacts.push({ pos: s.pos, r: 8, text: () => "Scatta una foto dal belvedere", act: () => takePhoto(s.name) });
  }
  function takePhoto(place: string) {
    const img = snapshot();
    import("./state").then(({ addPhoto }) => addPhoto({ img, place, time: hhmm(hours()) }));
    state.shots++;
    state.battery = Math.max(0.03, state.battery - 0.01);
    save();
    sound.ui("go");
    const flash = document.createElement("div");
    flash.className = "flash";
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
    ui.toast(`<b>Foto nell'album</b> ${place}`);
  }

  // ---------- rimbalzello sui laghi ----------
  const stoneMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), stone);
  stoneMesh.visible = false;
  group.add(stoneMesh);
  const rings: { m: THREE.Mesh; age: number }[] = [];
  const ringGeo = new THREE.TorusGeometry(1, 0.05, 4, 24);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8 });
  let throwAnim: { from: THREE.Vector3; dir: THREE.Vector3; y: number; skips: number; t: number; hop: number } | null = null;
  for (const lake of t.lakes) {
    const poly = lake.poly;
    let cx = 0, cz = 0;
    for (const [x, z] of poly) (cx += x * S), (cz += z * S);
    cx /= poly.length;
    cz /= poly.length;
    const surface = lake.level * S + 0.1;
    // punti lungo la riva, ogni ~10 unità
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
      const len = Math.hypot(bx - ax, bz - az) * S;
      for (let d = 0; d < len; d += 10) {
        const k = d / len, x = (ax + (bx - ax) * k) * S, z = (az + (bz - az) * k) * S;
        interacts.push({
          pos: new THREE.Vector3(x, surface, z), r: 7,
          text: () => (mini.playing || throwAnim ? null : "Lancia un sasso a rimbalzello"),
          act: async () => {
            const n = await mini.skipStone();
            const me = hiker.root.position;
            const dir = new THREE.Vector3(cx - me.x, 0, cz - me.z).normalize();
            throwAnim = { from: new THREE.Vector3(me.x, surface, me.z).addScaledVector(dir, 2), dir, y: surface, skips: n, t: 0, hop: 0 };
            stoneMesh.visible = true;
            if (n > state.skipBest) {
              state.skipBest = n;
              save();
            }
            setTimeout(() => {
              ui.toast(n === 0 ? "<b>Plof!</b> Il sasso è affondato subito." : `<b>${n} rimbalzi!</b>${n === state.skipBest && n > 0 ? " Nuovo record" : ` Record: ${state.skipBest}`}`);
              if (n >= 8) sound.ui("done");
            }, 400 + n * 260);
          },
        });
      }
    }
  }

  return {
    group,
    interacts,
    takePhoto,
    update(dt: number) {
      // il sasso che rimbalza e i cerchi nell'acqua
      if (throwAnim) {
        const a = throwAnim;
        a.t += dt;
        const step = 0.26; // un rimbalzo ogni 0,26 s
        const hop = Math.floor(a.t / step);
        const k = (a.t % step) / step;
        const dist = a.t * 14;
        const p = a.from.clone().addScaledVector(a.dir, dist);
        if (hop >= a.skips) {
          stoneMesh.visible = false;
          sound.splash(p.x, p.z);
          const r = new THREE.Mesh(ringGeo, ringMat.clone());
          r.position.copy(p);
          group.add(r);
          rings.push({ m: r, age: 0 });
          throwAnim = null;
        } else {
          if (hop > a.hop) {
            a.hop = hop;
            sound.splash(p.x, p.z, true);
            const r = new THREE.Mesh(ringGeo, ringMat.clone());
            r.position.copy(p);
            group.add(r);
            rings.push({ m: r, age: 0 });
          }
          stoneMesh.position.set(p.x, a.y + Math.sin(k * Math.PI) * (1.2 - hop * 0.1), p.z);
          stoneMesh.rotation.y += dt * 20;
        }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.age += dt;
        r.m.scale.setScalar(0.3 + r.age * 2.5);
        (r.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - r.age * 0.6);
        if (r.age > 1.4) {
          group.remove(r.m);
          rings.splice(i, 1);
        }
      }
    },
  };
}
