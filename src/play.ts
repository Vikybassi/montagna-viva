import * as THREE from "three";
import { sound } from "./audio";
import { Phone, outfitOf } from "./phone";
import { SUBJECTS, type Aim, type Target } from "./nature";
import * as mini from "./minigames";
import { addPhoto, addToNotebook, has, learn, state, save } from "./state";
import * as ui from "./ui";
import { S } from "./world";
import { SUNSET, hhmm, makeWorld, type PlayCtx } from "./game/base";
import { setupClimbing } from "./game/climbing";
import { setupGuidance } from "./game/guidance";
import { setupInteractions } from "./game/interactions";
import { createPeople, setupMissions } from "./game/people";
import { QuestEngine } from "./game/quests";
import { setupRoutes } from "./game/routes";
import { createWeather, setupStorm } from "./game/storm";
import { setupWater } from "./game/water";
import { setupValley } from "./game/valley";

/**
 * Il gioco vero e proprio: mette insieme le parti (in src/game/) e le fa girare a ogni fotogramma.
 * L'ordine di creazione conta: gli elementi generati a caso (animali, escursionisti, prese, meteo) usano lo stesso
 * generatore, e così finiscono sempre negli stessi posti.
 */
export function setupPlay(c: PlayCtx) {
  const w = makeWorld(c);
  const { hiker } = w;

  const people = createPeople(w);
  const valley = setupValley(w);
  const climbing = setupClimbing(w);
  const weather = createWeather(w);
  const routes = setupRoutes(w);
  const { race, fauna, nature, skyEvents, life, collect } = valley;
  const racing = () => race.phase === "running" || race.phase === "countdown";
  const missions = setupMissions(w, people, valley);
  const storm = setupStorm(w, routes, valley, () => !!climbing.active() || racing());
  const water = setupWater(w, valley);
  // dentro rifugi e bivacchi, col bel tempo: riposarsi mezz'ora (torna il fiato) e, al rifugio, bere
  storm.setExtraButtons((_p, kind) => [
    ...(kind === "rifugio" ? [{ label: "Bevi e riempi la borraccia", fn: () => water.refill() }] : []),
    ...(c.sharedTime() ? [] : [{ label: "Riposa mezz'ora", fn: () => {
      c.setHours(c.getHours() + 0.5);
      stamina = 1;
      return kind === "rifugio" ? "Mezz'ora seduta sulla panca, con le gambe allungate: il fiato è tornato." : "Mezz'ora sulla branda del bivacco, in silenzio: il fiato è tornato.";
    } }]),
  ]);

  // il motore delle missioni: il temporale prima di tutto, poi commissione o missione (quella che segui)
  const engine = new QuestEngine();
  engine.add("emergenza", storm.quest);
  engine.add("commissione", () => valley.encounters.errandQuest(people.custOmio.root.position));
  engine.add("missione", missions.missionQuest);
  const guidance = setupGuidance(w, engine, routes, climbing, racing);
  const interacts = [...missions.interacts, ...valley.interacts, ...storm.interacts, ...water.interacts, ...climbing.interacts];
  const interactions = setupInteractions(w, interacts, valley, (s) => void missions.observe(s), () => !!climbing.active());

  // ---------- fiato ----------
  let stamina = 1, exhausted = false, runToggle = false;
  /** un sorso: torna un po' di fiato */
  const drink = () => {
    if (ui.busy || mini.playing || climbing.active()) return;
    if (water.drink()) stamina = Math.min(1, stamina + 0.35);
  };
  ui.tools.onDrink = drink;
  ui.setWater(has("acqua") ? state.water : null, state.thirst >= 0.7);
  ui.tools.onRun = () => {
    runToggle = !runToggle;
    ui.setRunToggle(runToggle);
  };
  // il telefono: missioni, mappa, diario, zaino, spille
  const phone = new Phone(() => ({ hours: c.getHours(), place: c.place(), alt: hiker.root.position.y / S, sunset: SUNSET }), routes.map, {
    jacket: c.jacket,
    setJacket: c.setJacket,
    apply: () => hiker.setOutfit(outfitOf()),
  });
  // dal telefono: quale seguire tra missione e commissione
  ui.tools.onFollow = (kind) => {
    state.followErrand = kind === "commissione";
    save();
    routes.resetMissionRoute();
  };
  // dal telefono: riprendere una missione lasciata a metà (diventa quella da seguire)
  ui.tools.onResume = (id) => {
    state.active = id as typeof state.active;
    state.followErrand = false;
    save();
    routes.resetMissionRoute();
  };
  ui.tools.onPhone = (tab) => {
    if (phone.isOpen || !ui.busy) phone.toggle(tab);
  };

  /**
   * Al rientro nel gioco: se c'era qualcosa in corso, lo si dice (e il prossimo passo), e si sceglie se continuare o
   * metterlo in pausa. Così l'obiettivo in alto non sembra arrivato dal nulla.
   */
  // cosa c'era in corso nel salvataggio, al caricamento (non quello scelto nei primi istanti di gioco)
  const resumed = !!(state.active || state.errand);
  async function welcomeBack() {
    if (!resumed || ui.busy) return;
    const { tracked, trackedKind } = engine.pick(state.followErrand, racing());
    if (!tracked || trackedKind === "emergenza" || !state.packed) return;
    const next = QuestEngine.current(tracked);
    const i = await ui.say(
      "Il tuo telefono",
      `<b>Bentornata in Val Masino!</b> Stavi ${trackedKind === "commissione" ? "facendo una commissione" : "seguendo una missione"}: <b>${tracked.title}</b>.${next ? ` Prossimo passo: ${next.text}.` : ""}`,
      ["Continuo da qui", "La metto in pausa"],
    );
    if (i !== 1) return;
    if (trackedKind === "missione") state.active = null;
    else state.errand = null;
    save();
    routes.resetMissionRoute();
    ui.toast(trackedKind === "missione" ? "<b>Missione in pausa.</b> La riprendi parlando con Marta, a San Martino." : "<b>Commissione in pausa.</b> La riprendi parlando di nuovo con chi te l'ha chiesta.");
  }

  return {
    welcomeBack,
    /** solo per le prove automatiche (?debug) */
    debug: { fauna, nature, cairns: valley.cairnSet.cairns, blocks: climbing.blocks, skyEvents, elena: people.elena.root.position, marta: people.marta.root.position, state, race, raceStart: valley.raceStart, glacier: valley.glacier, data: c.data, interacts, thirst: water.debug, fountains: water.fountains, pickHut: routes.pickHut, guide: () => routes.guide },
    get runToggle() {
      return runToggle;
    },
    /** chi chiede di correre e se può farlo, con il fiato */
    canRun(wantRun: boolean, moving: boolean, dt: number) {
      const running = wantRun && moving && !exhausted;
      water.update(dt, moving, running);
      // con tanta sete il fiato dura meno e torna più piano
      const thirsty = water.thirsty;
      // circa 25 secondi di corsa a fiato pieno; si recupera camminando (in 10 s) o da fermi (in 4 s)
      stamina += running ? (-dt / 25) * (thirsty ? 1.6 : 1) : (dt / (moving ? 10 : 4)) * (thirsty ? 0.6 : 1);
      stamina = THREE.MathUtils.clamp(stamina, 0, 1);
      if (stamina <= 0) exhausted = true;
      if (exhausted && stamina > 0.25) exhausted = false;
      return running;
    },
    blocked: () => ui.busy || race.phase === "countdown" || mini.playing || !!climbing.active(),
    phone,
    weather,
    life,
    /** la via su cui sei (o l'ultima su cui sei stata): la usa il ciclo principale per telecamera e comandi */
    get climb() {
      return climbing.current();
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
        const time = hhmm(c.getHours());
        sound.ui("go");
        // l'arcobaleno non è nel taccuino, ma ha la sua foto
        if (!aim && skyEvents.rainbowInView(c.camera)) {
          addPhoto({ img, place: "Arcobaleno", time });
          ui.toast(valley.sawEvent("foto-arcobaleno") ? "<small>Nell'album</small><b>L'arcobaleno!</b>" : "<b>Un altro arcobaleno nell'album</b>", "task");
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
        if (aim.subject === "stambecco" || aim.subject === "marmotta" || aim.subject === "aquila" || aim.subject === "camoscio") void missions.observe(aim.subject);
      },
    },
    hasLamp: () => has("frontale"),
    drink,
    /** dentro un rifugio o un bivacco (o mentre entri dalla porta) */
    get indoors() {
      return storm.indoors;
    },
    update(dt: number) {
      phone.update(dt);
      storm.update(dt);
      valley.update(dt);
      climbing.update(dt);
      missions.update(dt);
      ui.showRun(race.phase !== "idle" || stamina < 0.999);
      ui.setRun(race.phase === "idle" ? null : race.time, race.phase === "running" ? `${race.next} / ${race.checkpoints.length}` : "", stamina);
      routes.update(dt);
      guidance.update(dt);
      interactions.update();
    },
  };
}
