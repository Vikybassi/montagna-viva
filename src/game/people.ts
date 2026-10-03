import * as THREE from "three";
import { sound } from "../audio";
import { ITEMS, MISSIONS, type MissionId } from "../content";
import type { Species } from "../fauna";
import type { Year } from "../glacier";
import { Hiker } from "../player";
import { has, learn, mission, nextMorning, save, setMission, state } from "../state";
import * as ui from "../ui";
import { STILL, SUNSET, dur, hhmm, isDaylight, type Interact, type World } from "./base";
import type { Quest } from "./quests";
import type { Valley } from "./valley";

/**
 * Le persone della valle e le missioni di Marta: la guida a San Martino, Giulio all'Omio, Sara al Ponti, Elena al
 * Piano di Preda Rossa. Le persone si creano subito (createPeople); dialoghi e missioni dopo, quando la valle esiste.
 */
export function createPeople(w: World) {
  const { c, scene, T, at, martino, omio, ponti, pianoPR } = w;
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
  const elena = npc({ jacket: "#f2b632", hat: "#3b3550", pack: "#c2375a", hair: "#2a1f1a" }, pianoPR.clone(), "Elena", "glaciologa");
  elena.root.position.y = T.heightAt(elena.root.position.x, elena.root.position.z);
  return { marta, custOmio, custPonti, elena, all: [marta, custOmio, custPonti, elena] };
}
export type People = ReturnType<typeof createPeople>;

export function setupMissions(w: World, people: People, v: Valley) {
  const { c, T, hiker, at, martino, omio, ponti, pianoPR, disgrazia, eagleAt } = w;
  const { marta, custOmio, custPonti, elena } = people;
  const { fauna, glacier, race, raceStart, signs, encounters } = v;
  let rientroStage: "up" | "down" = "up";
  const seenYears = new Set<Year>();

  // punti di osservazione: a distanza rispettosa dagli animali (mai addosso), dalla parte del rifugio più vicino
  const lookout = (center: THREE.Vector3, toward: THREE.Vector3, dist: number) => {
    const d = new THREE.Vector3(toward.x - center.x, 0, toward.z - center.z).normalize();
    return w.ground(center.clone().addScaledVector(d, dist));
  };
  const ibexGroup = fauna.groups.find((x) => x.species === "stambecco");
  const ibexSpot = ibexGroup ? lookout(fauna.centroid(ibexGroup), at(ponti), 45) : at(ponti);
  const marmotSpots = fauna.groups.filter((g) => g.species === "marmotta").map((g) => lookout(fauna.centroid(g), at(omio).distanceTo(fauna.centroid(g)) < pianoPR.distanceTo(fauna.centroid(g)) ? at(omio) : pianoPR, 50));
  const marmotNear = () => {
    const me = hiker.root.position;
    return marmotSpots.slice().sort((a, b) => a.distanceTo(me) - b.distanceTo(me))[0] ?? at(omio);
  };

  /** la missione in corso, con i suoi passi (fonte "missione" del motore) */
  function missionQuest(): Quest | null {
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
            { text: "Stambecchi: sulle rocce sotto il Rifugio Ponti. Fermati a 20–70 m e premi E", done: seen("stambecco"), pos: ibexSpot, name: "Stambecchi" },
            { text: "Marmotte: sui pascoli alti. Avvicinati piano, fermati quando fischiano", done: seen("marmotta"), pos: marmotNear(), name: "Marmotte" },
            { text: "Aquila reale: gira sopra le pareti della Val di Mello. Guardala da sotto (E)", done: seen("aquila"), pos: w.ground(eagleAt), name: "Aquila" },
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

  // ---------- dialoghi ----------
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
    startMission(options[i].id);
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
    // di notte (anche prima dell'alba) non c'è margine: si resta o si scende con la frontale
    const spare = isDaylight(h) ? SUNSET - ((h % 24) + down) : -1;
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
      c.setHours(nextMorning(c.getHours())); // la mattina dopo (prima l'orologio tornava alle 7:15 del primo giorno)
      ui.toast("<b>Buongiorno!</b> Hai dormito al Rifugio Omio.");
    }
    setMission("rientro", "done");
    ui.learned(learn("tramonto"));
  }

  async function talkPonti() {
    await ui.say("Sara, custode", "Ciao! Quello lì è il Disgrazia, 3678 metri. Gli stambecchi oggi pascolavano sulle rocce qui sotto: se vuoi vederli, avvicinati piano e fermati quando alzano la testa.");
    ui.learned(learn("meteo"));
  }

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

  /** osservare (o fotografare da lontano) un animale: vale per la missione del guardiaparco */
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
  ];

  let tick = 0, darkWarned = Math.floor((c.getHours() - 12) / 24) - 1;
  // per raccontare agli altri giocatori le imprese nuove
  let told = { stamps: state.stamps.length, summits: state.summits.length, done: MISSIONS.filter((m) => mission(m.id) === "done").length, boulder: state.boulder };
  return {
    missionQuest, observe, interacts,
    update(dt: number) {
      const me = hiker.root.position;
      // persone: girate verso di te quando sei vicina
      for (const p of people.all) {
        const d = p.root.position.distanceTo(me);
        const want = Math.atan2(me.x - p.root.position.x, me.z - p.root.position.z);
        if (d < 25) p.heading += Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading)) * (1 - Math.exp(-4 * dt));
        p.update(dt, STILL, false, T);
      }
      tick += dt;
      if (tick <= 0.2) return;
      tick = 0;
      // missione rientro: arrivo in paese
      if (state.active === "rientro" && rientroStage === "down" && mission("rientro") !== "done" && me.distanceTo(at(martino)) < 70) {
        const h = c.getHours();
        setMission("rientro", "done");
        ui.toast(isDaylight(h) ? `<b>Missione completata</b> Rientrata alle ${hhmm(h)}, con la luce` : `<b>Rientrata alle ${hhmm(h)}</b>, col buio: la prossima volta parti prima`);
        sound.ui("done");
      }
      // al buio senza frontale
      // una volta per sera (le sere si contano da mezzogiorno a mezzogiorno)
      const evening = Math.floor((c.getHours() - 12) / 24);
      if (darkWarned !== evening && !isDaylight(c.getHours() - 0.4) && !has("frontale") && state.packed) {
        darkWarned = evening;
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
    },
  };
}
export type Missions = ReturnType<typeof setupMissions>;
