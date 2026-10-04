import * as THREE from "three";
import { sound } from "../audio";
import { ValleyMap } from "../map";
import { Router, RouteView, type Turn } from "../route";
import { state } from "../state";
import * as ui from "../ui";
import { S, type Place } from "../world";
import { hhmm, hm, type World } from "./base";

/**
 * Le strade: la mappa della valle, la strada scelta verso un rifugio (con le indicazioni bivio per bivio), la strada
 * automatica verso il passo della missione, il riparo più vicino. Una sola strada arancione alla volta.
 */
type Guide = { pts: THREE.Vector3[]; idx: number; dest: Place; hours: number; off: number; turns: Turn[]; told: number };

export function setupRoutes(w: World) {
  const { c, scene, T, data, hiker, at } = w;
  const router = new Router(T, data);
  const routeView = new RouteView(T);
  scene.add(routeView.group);
  let guide: Guide | null = null;
  // la strada automatica della missione: si ricalcola quando cambia il passo (routeKey)
  let routeKey = "";
  let missionRoute: { pts: THREE.Vector3[]; idx: number; off: number } | null = null;

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
  /** la strada scelta si sospende (per esempio col temporale: ora conta il riparo) */
  function clearGuide() {
    guide = null;
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
    () => ({ x: hiker.root.position.x, z: hiker.root.position.z, heading: hiker.heading, hours: c.getHours(), storm: w.weather.phase === "storm" }),
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
  function directions(me: THREE.Vector3) {
    const g = guide!;
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

  return {
    router, map, setGuide, clearGuide, pickHut, nearestShelter, directions,
    get guide() {
      return guide;
    },
    /** dimentica la strada automatica: al prossimo fotogramma si ricalcola (cambio di cosa seguire) */
    resetMissionRoute() {
      routeKey = "";
    },
    /**
     * La strada automatica verso il punto del passo corrente (se non stai seguendo una strada scelta da te).
     * `key` cambia quando cambia il passo: allora la strada si ricalcola. `null` = niente da raggiungere.
     */
    followMission(mpos: THREE.Vector3 | null, key: string, dt: number) {
      const me = hiker.root.position;
      if (!mpos) {
        if (!guide && routeKey) {
          routeKey = "";
          missionRoute = null;
          routeView.show(null);
        }
        return;
      }
      const d = Math.hypot(mpos.x - me.x, mpos.z - me.z);
      if (key !== routeKey) {
        routeKey = key;
        const r = d > 40 ? router.route(me, w.ground(mpos)) : null;
        missionRoute = r ? { pts: r.pts, idx: 0, off: 0 } : null;
        routeView.show(r?.pts ?? null);
      }
      if (missionRoute) {
        // aggancio al punto più vicino; se ne esci troppo a lungo, si ricalcola da dove sei
        const mr = missionRoute;
        let bi = mr.idx, bd = Infinity;
        for (let i = mr.idx; i < mr.pts.length; i++) {
          const dd = Math.hypot(mr.pts[i].x - me.x, mr.pts[i].z - me.z);
          if (dd < bd) (bd = dd), (bi = i);
        }
        if (bd < 30) mr.idx = bi;
        mr.off = bd > 60 && !hiker.gliding ? mr.off + dt : 0;
        if (mr.off > 4) routeKey = "";
        if (d < 25) {
          missionRoute = null;
          routeView.show(null);
        }
      }
    },
    /** la strada scelta: avanza il punto da seguire, ricalcola se ne esci, arrivo */
    update(dt: number) {
      const me = hiker.root.position;
      routeView.update(performance.now() / 1000);
      if (!guide) return;
      const g = guide;
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
    },
  };
}
export type Routes = ReturnType<typeof setupRoutes>;
