import * as THREE from "three";
import { Boulder, Climb, type Kind } from "../climb";
import { state } from "../state";
import * as ui from "../ui";
import { S } from "../world";
import type { Interact, World } from "./base";
import { LOOKS, type Look } from "../looks";

/**
 * L'arrampicata: la via con corda sul Sasso Remenno (Davide fa sicura) e i quattro blocchi della Val di Mello
 * (bouldering, senza corda, sul materassino, con chi para). Sopra a tutti i massi si cammina, e non li si attraversa.
 */
const BLOCKS: { id: string; name: string; grade: string; size: [number, number, number]; bulge: number; kinds: Kind[]; partner: { name: string; look: Look } }[] = [
  { id: "torrente", name: "Il masso del torrente", grade: "4a", size: [5, 5, 4.6], bulge: 0.12, kinds: ["jug", "jug", "jug", "sloper", "jug", "jug", "jug", "jug"], partner: { name: "Sofia", look: LOOKS.Sofia } },
  { id: "placca", name: "La placca", grade: "5a", size: [6, 5.4, 5.4], bulge: 0.08, kinds: ["jug", "jug", "crimp", "jug", "sloper", "jug", "jug", "jug"], partner: { name: "Pietro", look: LOOKS.Pietro } },
  { id: "pancia", name: "La pancia", grade: "5c", size: [5.4, 5.6, 5], bulge: 0.45, kinds: ["jug", "crimp", "jug", "sloper", "crimp", "jug", "crimp", "jug"], partner: { name: "Irene", look: LOOKS.Irene } },
  { id: "tetto", name: "Il tetto", grade: "6a", size: [6, 6, 5.4], bulge: 0.62, kinds: ["jug", "crimp", "sloper", "crimp", "crimp", "sloper", "crimp", "jug"], partner: { name: "Matteo", look: LOOKS.Matteo } },
];

export function setupClimbing(w: World) {
  const { c, scene, T, data, hiker, at, martino, piana } = w;
  // il Sasso Remenno: roccia vera e una via d'arrampicata con l'istruttore
  let climb: Climb | null = null;
  if (c.rock) {
    const rock = c.rock;
    scene.add(rock.mesh);
    hiker.groundFn = (x, z) => rock.topAt(x, z);
    climb = new Climb(T, rock, hiker, c.rng);
    scene.add(climb.group);
    c.addLabel("Davide", "istruttore di arrampicata", climb.base.x, climb.base.z, 2.6, 80, "npc");
  }

  // i blocchi: lungo il fondovalle, da San Martino verso Cascina Piana, in prati aperti vicino al sentiero
  const blocks: { id: string; name: string; grade: string; climb: Climb; rock: Boulder }[] = [];
  {
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
  const active = () => {
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

  const interacts: Interact[] = [
    ...(climb ? [{ pos: climb.base, r: 6, text: () => (climb!.active ? null : "Arrampica con Davide"), act: talkDavide }] : []),
    ...blocks.map((bk) => ({ pos: bk.climb.base, r: 6, text: () => (active() ? null : `Arrampica «${bk.name}» (${bk.grade})`), act: () => void talkBlock(bk) })),
  ];

  return {
    remenno: climb,
    blocks,
    active,
    interacts,
    /** la via su cui sei, o l'ultima su cui sei stata (per telecamera e comandi) */
    current: () => active() ?? lastClimb,
    /** l'obiettivo in alto mentre arrampichi */
    goal(ac: Climb) {
      const pr = ac.progress();
      const bk = blocks.find((x) => x.climb === ac);
      return bk ? `Blocco «${bk.name}» (${bk.grade}) · presa ${pr.n} di ${pr.total} · arriva in cima` : `Via del Sasso Remenno · presa ${pr.n} di ${pr.total} · sali fino alla catena`;
    },
    update(dt: number) {
      climb?.idle(dt);
      for (const bk of blocks) bk.climb.idle(dt);
    },
  };
}
export type Climbing = ReturnType<typeof setupClimbing>;
