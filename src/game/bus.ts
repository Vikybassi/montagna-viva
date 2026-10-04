import * as THREE from "three";
import { sound } from "../audio";
import { learn, save, state } from "../state";
import * as ui from "../ui";
import { S, type BusStop } from "../world";
import { SUNSET, dur, hhmm, type Interact, type World } from "./base";
import type { Routes } from "./routes";
import { FIRST, LAST, nextDeparture, rideMinutes } from "./timetable";
import type { Valley } from "./valley";

/**
 * La corriera tra i paesi lungo la strada di valle: alla fermata scegli dove andare, aspetti la prossima corsa e dopo pochi
 * secondi di viaggio sei arrivata (il tempo passa davvero: l'orologio avanza di attesa e viaggio). Ferma solo col bel
 * tempo e dalle 7 alle 19; col temporale non parte.
 */
export function setupBus(w: World, valley: Valley, routes: Routes) {
  const { c, T, hiker } = w;
  const stops = c.busStops;
  for (const s of stops) c.addLabel("Fermata", "corriera", s.x, s.z, 4.2, 160, "npc");
  let riding = false;

  async function ride(from: BusStop) {
    if (riding) return;
    const race = valley.race.phase;
    if (w.weather.phase !== "clear") return void ui.say("Autista", "Col temporale la corriera non parte: i tornanti con la pioggia sono pericolosi. Aspetta al riparo, poi si riparte.");
    if (race === "running" || race === "countdown") return void ui.toast("Prima finisci la corsa.", "warn now");
    const h = c.getHours(), shared = c.sharedTime();
    const nd = nextDeparture(h);
    if (!shared && nd.depart === null) {
      ui.learned(learn("autobus"));
      return void ui.say(`Fermata · ${from.name}`, `L'ultima corsa delle ${LAST}:00 è già partita: la prima di domani è alle ${FIRST}:00. In montagna gli ultimi mezzi partono presto: controlla l'orario prima di salire, e tieni un margine anche per questo.`);
    }
    const depart = shared ? h : nd.depart!;
    const wait = depart - h;
    const options = stops
      .filter((s) => s !== from)
      .map((s) => {
        const mins = rideMinutes(Math.hypot(s.x - from.x, s.z - from.z) / S);
        return { s, mins, arrive: depart + mins / 60 };
      });
    const text = shared
      ? `Corriera da <b>${from.name}</b>. In compagnia il tempo è di tutti: il viaggio è veloce e non fa passare l'orologio. Dove vuoi andare?`
      : `Corriera da <b>${from.name}</b>. Prossima partenza alle <b>${hhmm(depart)}</b>${wait > 0.02 ? ` (tra ${dur(wait)})` : ""}. Dove vuoi andare?`;
    const i = await ui.say(`Fermata · ${from.name}`, text, [...options.map((o) => `${o.s.name} · ${o.mins} min${shared ? "" : ` · arrivo alle ${hhmm(o.arrive)}`}`), "Resto qui"]);
    if (i >= options.length) return;
    const to = options[i];
    // dopo il tramonto: un consiglio gentile (una volta, prima di partire)
    if (!shared && to.arrive % 24 > SUNSET) ui.toast("<b>Arrivi dopo il tramonto.</b> Hai la frontale nello zaino?", "warn");
    riding = true;
    ui.learned(learn("autobus"));
    sound.ui("go");
    const h0 = h, h1 = shared ? h : to.arrive;
    await ui.travel({ from: from.name, to: to.s.name }, async (setClock) => {
      const total = shared ? to.mins / 60 : to.arrive - h0;
      const t0 = performance.now(), ms = Math.min(3600, 1800 + total * 700);
      await new Promise<void>((res) => {
        const step = () => {
          const k = ui.travelSkipped() ? 1 : Math.min(1, (performance.now() - t0) / ms);
          const t = h0 + total * k;
          if (!shared) c.setHours(t);
          setClock(hhmm(t));
          if (k < 1) requestAnimationFrame(step);
          else res();
        };
        step();
      });
      if (!shared) c.setHours(h1);
      // arrivo: davanti alla pensilina, rivolta verso la piazza (mentre lo schermo è ancora coperto)
      hiker.root.position.copy(to.s.stand);
      hiker.root.position.y = T.heightAt(to.s.stand.x, to.s.stand.z);
      hiker.heading = to.s.ry;
      hiker.root.rotation.y = hiker.heading;
      hiker.velocity.set(0, 0);
      valley.encounters.escort(to.s.stand);
      routes.resetMissionRoute();
    });
    riding = false;
    sound.ui("done");
    if (!state.rides.includes(to.s.name)) {
      state.rides.push(to.s.name);
      save();
    }
    ui.toast(`<b>${to.s.name}</b> alle ${hhmm(c.getHours())}`, "now");
  }

  const interacts: Interact[] = stops.map((s) => ({ pos: s.stand as THREE.Vector3, r: 4.5, text: () => (riding ? null : "Prendi la corriera"), act: () => void ride(s) }));
  return { interacts, stops };
}
export type Bus = ReturnType<typeof setupBus>;
