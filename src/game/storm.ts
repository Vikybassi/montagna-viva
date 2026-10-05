import { sound } from "../audio";
import { learn, save, state } from "../state";
import * as ui from "../ui";
import { Weather } from "../weather";
import { S, type Door, type Place } from "../world";
import { hhmm, hm, tween, type Interact, type World } from "./base";
import type { Quest } from "./quests";
import type { Routes } from "./routes";
import type { Valley } from "./valley";

/** il meteo si crea qui, nello stesso punto di sempre dell'ordine di creazione (dopo i massi) */
export function createWeather(w: World) {
  const weather = new Weather(w.c.rng);
  w.scene.add(weather.group);
  w.weather = weather;
  return weather;
}

/**
 * Il temporale: Marta che chiama, la strada verso il riparo più vicino, la porta che si apre, l'attesa dentro.
 * `busy` = arrampichi o corri: la telefonata aspetta che tu sia libera.
 */
export function setupStorm(w: World, routes: Routes, v: Valley, busy: () => boolean) {
  const { c, T, data, hiker, at } = w;
  const weather = w.weather;
  let stormShelter: { h: Place; hours: number } | null = null;
  let shelterHint = false, indoors = false, sheltered = false, crestWarn = 0;
  /** la telefonata di Marta per il temporale: da fare appena possibile, una volta al giorno */
  let callPending = false, calledToday = false, callDay = -1;

  /** la fonte "emergenza" del motore delle missioni: col temporale prima ci si mette al riparo */
  function quest(): Quest | null {
    // già con le nuvole nere (quando Marta chiama), non solo quando piove
    if (weather.phase === "clear" || sheltered || !stormShelter) return null;
    const sh = stormShelter.h, me = hiker.root.position;
    return {
      title: weather.phase === "storm" ? "Temporale! Mettiti al riparo" : "Temporale in arrivo: mettiti al riparo",
      steps: [
        { text: "Scendi dalle creste e stai lontana dalle croci", done: me.y / S < 2400 },
        { text: `Raggiungi ${sh.name} (circa ${hm(stormShelter.hours)}) ed entra: E davanti alla porta`, done: false, pos: c.doors.get(sh.name)?.front ?? at(sh), name: sh.name },
        { text: "Dentro, aspetta che passi; poi riprendi la missione", done: false },
      ],
    };
  }

  function martaCalls() {
    callPending = false;
    calledToday = true;
    // telefono scarico: niente chiamata (per questo, in montagna, si porta anche la cartina)
    if (state.battery < 0.05) return void ui.toast("<b>Il telefono è scarico:</b> Marta non riesce a chiamarti. Guarda il cielo e cerca riparo da sola.", "warn");
    ui.ringCall("Marta, guida", () => void martaTalks(), () => {
      const sh = routes.nearestShelter();
      ui.toast(`<b>Messaggio di Marta:</b> «Temporale in arrivo! Lascia stare la missione e vai al riparo${sh ? `: ${sh.h.name}, circa ${hm(sh.hours)}` : ""}.»`, "warn");
    });
  }
  async function martaTalks() {
    if (indoors) {
      await ui.say("Marta, al telefono", "Ciao! Dalla valle vedo arrivare un temporale… ma sei già al coperto: brava. Resta lì finché passa, poi riparti tranquilla.");
      return;
    }
    const sh = routes.nearestShelter();
    const where = sh ? `il riparo più vicino a te è <b>${sh.h.name}</b>, circa ${hm(sh.hours)} di cammino` : "cerca il rifugio o il bivacco più vicino";
    const i = await ui.say("Marta, al telefono", `Ciao, sono Marta! Da qui vedo nuvoloni neri sul Disgrazia: tra poco arriva un temporale. La missione può aspettare. Scendi dalle creste, stai lontana dalle croci di vetta: ${where}. Quando arrivi, entra e aspetta che passi.`, ["Ok, vado al riparo", "E se sono lontana da tutto?"]);
    if (i === 1)
      await ui.say("Marta, al telefono", "Allora scendi di quota, lontano da creste, cime e alberi isolati. Se i fulmini sono vicini, accovacciati con i piedi uniti, sopra lo zaino, e non sdraiarti per terra. Appena smette di tuonare raggiungi il riparo.");
    await ui.say("Marta, al telefono", "Ti ho segnato la strada: segui l'indicazione in alto. Chiamami se serve!");
    ui.learned(learn("temporale"));
  }

  // ---------- al riparo: si apre la porta, si entra, si aspetta che passi ----------
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
    const stormy = weather.phase !== "clear";
    // al riparo dal temporale (vale per il compito) solo se fuori c'è davvero maltempo
    if (stormy) {
      sheltered = true;
      state.sheltered = true;
      save();
    }
    sound.ui("done");
    const text = kind === "rifugio"
      ? `Dentro c'è un bel tepore e profumo di minestra. ${stormy ? "Fuori piove forte e tuona: qui sei al sicuro." : "Fuori il cielo è sereno."}`
      : `È un riparo piccolo e spartano, ma asciutto. ${stormy ? "Senti la pioggia battere sulla lamiera: qui sei al sicuro." : "Fuori il cielo è sereno."} I bivacchi sono sempre aperti: si lasciano puliti per chi arriva dopo.`;
    if (stormy || kind === "bivacco") ui.learned(learn(kind === "bivacco" ? "bivacco" : "temporale"));
    showInterior(p, kind, text, door);
  }
  function showInterior(p: Place, kind: "rifugio" | "bivacco", text: string, door: Door) {
    const stormy = weather.phase !== "clear";
    const buttons: { label: string; fn: () => void }[] = [];
    if (stormy && !c.sharedTime()) buttons.push({ label: `Aspetta che passi (fino alle ${hhmm(weather.endsAt)})`, fn: () => void waitStorm(p, kind, door) });
    // col bel tempo: riposarsi, e (al rifugio) bere e riempire la borraccia
    if (!stormy) for (const b of extraButtons(p, kind)) buttons.push({ label: b.label, fn: () => void Promise.resolve(b.fn()).then((t) => showInterior(p, kind, t ?? text, door)) });
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
  const interacts: Interact[] = data.huts
    .filter((h) => h.kind === "rifugio" || h.kind === "bivacco")
    .flatMap((h) => {
      const d = c.doors.get(h.name);
      // si entra sempre: col maltempo per ripararsi, col bel tempo per riposare (e al rifugio per bere)
      return d ? [{ pos: d.front, r: 4, text: () => (indoors ? null : `Entra nel ${h.kind === "bivacco" ? "bivacco" : "rifugio"}${weather.phase !== "clear" ? " al riparo" : ""}`), act: () => void enterShelter(h, d) }] : [];
    });

  /** i pulsanti in più dentro, col bel tempo (li aggiunge chi gestisce acqua e fiato): restituiscono il testo nuovo */
  let extraButtons: (p: Place, kind: "rifugio" | "bivacco") => { label: string; fn: () => string | void | Promise<string | void> }[] = () => [];
  return {
    weather, quest, interacts,
    setExtraButtons(f: typeof extraButtons) {
      extraButtons = f;
    },
    get indoors() {
      return indoors;
    },
    update(dt: number) {
      const me = hiker.root.position;
      for (const e of weather.update(dt, c.getHours(), c.camPos())) {
        // nuvole nere o temporale già iniziato (se l'orologio è saltato): da qui la missione aspetta, conta il riparo
        const seekShelter = () => {
          if (stormShelter) return;
          stormShelter = routes.nearestShelter();
          shelterHint = false;
          sheltered = indoors;
          // la strada scelta sulla mappa si sospende: ora conta il riparo
          routes.clearGuide();
          routes.resetMissionRoute();
          if (stormShelter && !indoors) setTimeout(() => ui.toast(`<b>La missione aspetta.</b> Segui la strada arancione fino a ${stormShelter?.h.name ?? "un riparo"}.`), 1800);
        };
        if (e === "building") {
          ui.toast("<b>Nuvole nere sul Disgrazia…</b> tra poco arriva il temporale.", "warn");
          sound.thunder();
          callPending = true; // Marta chiama appena sei libera
          seekShelter();
        }
        if (e === "start") {
          if (!calledToday) callPending = true;
          ui.toast("<b>Temporale!</b> Scendi dalle creste e cerca riparo in un rifugio o in un bivacco.", "warn");
          seekShelter();
          ui.learned(learn("temporale"));
        }
        if (e === "thunder") sound.thunder();
        if (e === "end" || e === "passed") {
          // dopo il temporale, col sole: l'arcobaleno (non se è finito mentre dormivi o viaggiavi)
          if (e === "end") v.skyEvents.rainbowNow(c.getHours());
          ui.toast("<b>Il temporale è passato.</b> Puoi riprendere la missione da dove l'avevi lasciata.");
          stormShelter = null;
          callPending = false; // niente telefonata per un temporale già finito
          ui.endCall(); // e se Marta stava squillando, riattacca
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
      if (weather.phase === "clear" && (callPending || stormShelter)) {
        // saltato l'orologio oltre il temporale (dalle nuvole al sereno, senza pioggia): niente chiamata, niente riparo
        callPending = false;
        stormShelter = null;
        ui.endCall();
      }
      // (la telefonata aspetta che il tutorial sia finito: chi ha appena iniziato non la riceve mentre impara a camminare)
      if (callPending && !calledToday && !ui.busy && !busy() && state.tutorial >= 6) martaCalls();
    },
  };
}
export type Storm = ReturnType<typeof setupStorm>;
