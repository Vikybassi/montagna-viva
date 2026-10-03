import * as THREE from "three";
import { sound } from "../audio";
import { buildCollect } from "../collect";
import { buildEncounters } from "../encounters";
import { SkyEvents } from "../events";
import { Fauna } from "../fauna";
import { GlacierTime } from "../glacier";
import { Life } from "../life";
import * as mini from "../minigames";
import { Nature, buildCairns } from "../nature";
import { Race } from "../race";
import { buildSigns } from "../signs";
import { finishMission, learn, mission, save, state } from "../state";
import * as ui from "../ui";
import { S } from "../world";
import type { Interact, World } from "./base";

/**
 * La valle che vive intorno a te: eventi del cielo, persone sui sentieri, fiori e gracchi, ometti caduti, cartelli e
 * segnavia, animali, il ghiacciaio, la sfida di corsa, escursionisti e mucche, timbri e libri di vetta, i suoni.
 * L'ordine di creazione resta quello di sempre: gli elementi generati a caso finiscono negli stessi posti.
 */
export function setupValley(w: World) {
  const { c, scene, T, data, hiker, at, ponti, omio, rasega, martino, pianoPR, piana, eagleAt } = w;

  // ---------- eventi: elisoccorso, arcobaleno, stelle cadenti ----------
  const skyEvents = new SkyEvents(T);
  scene.add(skyEvents.group);
  /** segna un evento come visto; true la prima volta */
  const sawEvent = (id: string) => {
    if (state.events.includes(id)) return false;
    state.events.push(id);
    save();
    return true;
  };
  let meteorNight = -1;

  // ---------- incontri lungo i sentieri ----------
  const encounters = buildEncounters({
    t: T, scene, hiker, addLabel: c.addLabel,
    places: {
      remenno: data.remenno ? new THREE.Vector3(data.remenno[0] * S, T.heightAt(data.remenno[0] * S, data.remenno[1] * S), data.remenno[1] * S) : null,
      martino: at(martino), filorera: w.placeAt("Filorera"), bagni: w.placeAt("Bagni di Masino"), omio: at(omio),
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
  // più animali sparsi per la valle: chi cammina (o fotografa) trova sempre qualcosa da guardare
  const spot = (n: string) => {
    const h = w.place(n);
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

  // ---------- vita, collezioni ----------
  const life = new Life(T, data, c.cover, c.rng);
  scene.add(life.group);
  const collect = buildCollect(T, data, hiker, c.rng, c.snapshot, c.getHours);
  scene.add(collect.group);

  // ---------- distanza dall'acqua (torrenti e laghi), su una griglia a 80 m: serve al suono dei torrenti ----------
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

  hiker.onStep = (surface) => sound.step(surface);
  hiker.onLand = () => (hiker.swimming ? sound.splash() : sound.step("grass"));

  const interacts: Interact[] = [
    ...collect.interacts,
    ...encounters.interacts,
    ...cairnSet.cairns.map((k) => ({ pos: k.pos, r: 5, text: () => (state.cairns.includes(k.id) || mini.playing ? null : "Rimetti in piedi l'ometto"), act: () => void fixCairn(k.id) })),
  ];

  let eagleCall = 10, finishShown = 0, tick = 0, lastMark = -1, cowsSeen = state.diary.includes("mucche");
  return {
    skyEvents, sawEvent, encounters, nature, cairnSet, signs, fauna, glacier, race, raceStart, life, collect, interacts,
    /** a ogni fotogramma: animali, vita, eventi del cielo, suoni, corsa */
    update(dt: number) {
      const me = hiker.root.position;
      nature.update(dt);
      encounters.update(dt);
      for (const e of fauna.update(dt, me)) {
        if (e.kind === "fled") ui.toast(`<b>Troppo vicina!</b> ${e.species === "camoscio" ? "I camosci sono scappati" : "Gli stambecchi sono scappati"}.`, "warn"), sound.ui("fail");
        if (e.kind === "whistle") ui.toast("<b>Fiiiiuu!</b> Una marmotta ha fischiato l'allarme.", "warn"), sound.whistle(me.x + 20, me.z);
        ui.learned(learn("distanza"));
      }
      glacier.update(dt);
      collect.update(dt);
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
      // eventi del cielo e della valle
      for (const e of skyEvents.update(dt, { hours: c.getHours(), cam: c.camPos(), me, sunDir: c.sunDir(), night: c.getNight(), storm: w.weather.storm })) {
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
        { alt, night: c.getNight(), forest, water: waterDist(me.x, me.z), speed: hiker.speed, gliding: hiker.gliding, rain: w.weather.storm > 0.5 ? w.weather.storm : 0, meadow: alt > 800 && alt < 2400 && forest < 0.3 ? 1 : 0 },
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
          if (mission("corsa") !== "done" || state.active === "corsa") finishMission("corsa");
          finishShown = 4;
        }
      }
      if (finishShown > 0 && (finishShown -= dt) <= 0) race.phase = "idle";
      // ogni tanto: mucche e primo segnavia (scoperte per il diario)
      tick += dt;
      if (tick > 0.2) {
        tick = 0;
        if (!cowsSeen && life.cows.some((cw) => cw.obj.position.distanceTo(me) < 25)) {
          cowsSeen = true;
          ui.learned(learn("mucche"));
        }
        if (!state.diary.includes("segnavia") && lastMark < 0) {
          for (const p of signs.marks) if (Math.hypot(p.x - me.x, p.z - me.z) < 4) {
            lastMark = 1;
            ui.learned(learn("segnavia"));
            break;
          }
        }
      }
    },
  };
}
export type Valley = ReturnType<typeof setupValley>;
