import { learn, save, state } from "../state";
import * as ui from "../ui";
import { S, type Peak } from "../world";
import type { Interact, World } from "./base";

/**
 * Il panorama: da un rifugio, un bivacco o un belvedere si riconoscono le cime che si vedono davvero (la linea di vista
 * si calcola sul terreno: dietro un crinale non si vede), con la direzione, la quota e la distanza. Orientarsi con le cime
 * è una cosa vera da imparare in montagna.
 */
export type Seen = { name: string; ele: number; km: number; bearing: number; dir: string; angle: number; score: number };
const DIRS = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ovest", "ovest", "nord-ovest"];
export const compass = (deg: number) => DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

/**
 * Le cime in vista da `eye` (unità di gioco). `heightAt` dà la quota del terreno; le cime hanno `p` in metri sulla mappa.
 * Sceglie le più "importanti" (alte, e un po' meno se lontane), una sola per direzione (8 gradi), al massimo `max`.
 * Le quote senza nome («q. 2930») non contano: nessuno le riconosce.
 */
export function visiblePeaks(heightAt: (x: number, z: number) => number, eye: { x: number; y: number; z: number }, peaks: Peak[], max = 6): Seen[] {
  const seen: Seen[] = [];
  for (const pk of peaks) {
    if (/^q\.?\s*\d|^\d/i.test(pk.name.trim())) continue;
    const x = pk.p[0] * S, z = pk.p[1] * S, ground = heightAt(x, z), top = Math.max(ground, (pk.ele ?? ground / S) * S);
    const dx = x - eye.x, dz = z - eye.z, dist = Math.hypot(dx, dz);
    if (dist < 250 || dist > 12000) continue; // troppo vicina (sotto i piedi) o fuori mappa
    // linea di vista: il terreno lungo il raggio non deve superarlo (si lascia libero l'ultimo tratto, la cima stessa)
    const steps = Math.ceil(dist / 30);
    let hidden = false;
    for (let i = 1; i < steps * 0.94 && !hidden; i++) {
      const f = i / steps;
      if (heightAt(eye.x + dx * f, eye.z + dz * f) > eye.y + (top - eye.y) * f + 1.5) hidden = true;
    }
    if (hidden) continue;
    const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    const km = dist / S / 1000, ele = Math.round(top / S);
    // sotto l'orizzonte non è una cima da riconoscere (sei più in alto di lei)
    if (top < eye.y - 30 * S) continue;
    seen.push({ name: pk.name, ele, km, bearing, dir: compass(bearing), angle: Math.atan2(top - eye.y, dist), score: ele / 1000 - km * 0.06 });
  }
  seen.sort((a, b) => b.score - a.score);
  const out: Seen[] = [];
  for (const s of seen) {
    if (out.some((o) => Math.min(Math.abs(o.bearing - s.bearing), 360 - Math.abs(o.bearing - s.bearing)) < 8)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out.sort((a, b) => a.bearing - b.bearing);
}

export function setupPanorama(w: World) {
  const { c, T, data } = w;
  const spots: { id: string; name: string; x: number; z: number }[] = [];
  for (const h of data.huts.filter((x) => x.kind === "rifugio" || x.kind === "bivacco")) {
    const d = c.doors.get(h.name);
    if (!d) continue;
    // a cinque unità davanti alla porta, verso l'esterno
    const out = d.front.clone().sub(d.inside).setY(0).normalize();
    spots.push({ id: h.name, name: h.name, x: d.front.x + out.x * 5, z: d.front.z + out.z * 5 });
  }
  for (const v of data.views ?? []) spots.push({ id: `belvedere-${v.p[0]}-${v.p[1]}`, name: v.name ?? "Belvedere", x: v.p[0] * S, z: v.p[1] * S });

  async function look(sp: (typeof spots)[0]) {
    const eye = { x: sp.x, y: T.heightAt(sp.x, sp.z) + 1.7, z: sp.z };
    const list = visiblePeaks((x, z) => T.heightAt(x, z), eye, data.peaks);
    const first = !state.views.includes(sp.id);
    if (first) {
      state.views.push(sp.id);
      save();
    }
    const rows = list.map((s) => `<b>${s.name}</b> · ${s.ele} m<br><small>${s.km.toFixed(1).replace(".", ",")} km a ${s.dir}</small>`).join("<br>");
    await ui.say(
      `Panorama · ${sp.name}`,
      list.length ? `Da qui, guardando intorno, riconosci:<br><br>${rows}<br><br><small>Con la cartina e queste cime ti orienti: la forma di una cima è come una firma.</small>` : "Da qui il panorama è chiuso dai versanti: sali ancora un po' per vedere le cime.",
    );
    ui.learned(learn("cime"));
    if (first && state.views.length === 5) ui.toast("<b>Cinque panorami!</b> Ormai le cime sono vecchie conoscenze.", "now");
  }
  const interacts: Interact[] = spots.map((sp) => ({ pos: { x: sp.x, y: T.heightAt(sp.x, sp.z), z: sp.z } as never, r: 3.2, text: () => "Guarda il panorama", act: () => void look(sp) }));
  return { interacts, spots };
}
