import type { Species } from "../fauna";
import * as ui from "../ui";
import type { Interact, World } from "./base";
import type { Valley } from "./valley";

/** la cosa più vicina con cui interagire (E): persone, porte, cartelli, ometti… e, se non c'è altro, gli animali */
export function setupInteractions(w: World, interacts: Interact[], v: Valley, observe: (s: Species) => void, climbing: () => boolean) {
  const { hiker } = w;
  return {
    update() {
      const me = hiker.root.position;
      let best: { text: string; act: () => void; d: number } | null = null;
      if (!ui.busy && !climbing()) {
        for (const it of interacts) {
          const d = Math.hypot(it.pos.x - me.x, it.pos.z - me.z);
          const t = d < it.r ? it.text() : null;
          if (t && (!best || d < best.d)) best = { text: t, act: it.act, d };
        }
        const obs = v.fauna.observable(me);
        if (obs && !best) {
          const label = obs.species === "stambecco" ? "Osserva gli stambecchi" : obs.species === "camoscio" ? "Osserva i camosci" : obs.species === "marmotta" ? "Osserva le marmotte" : "Osserva l'aquila reale";
          best = { text: label, act: () => observe(obs.species), d: 0 };
        }
      }
      ui.prompt(best?.text ?? null, best ? () => void best!.act() : null);
    },
  };
}
