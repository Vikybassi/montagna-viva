import type * as THREE from "three";

/**
 * Il motore delle missioni: un posto solo dove si decide cosa seguire. Ogni parte del gioco offre la sua "fonte"
 * (il temporale, le commissioni, le missioni di Marta) e il motore sceglie, con regole esplicite:
 * 1. un'emergenza (il temporale) passa davanti a tutto;
 * 2. durante la sfida di corsa conta la corsa;
 * 3. tra commissione e missione vince quella che hai scelto di seguire (l'ultima accettata, o il pulsante "Segui");
 *    l'altra resta "in pausa" nel telefono.
 */
export type Step = { text: string; done: boolean; pos?: THREE.Vector3 | null; name?: string };
export type Quest = { title: string; steps: Step[] };
export type QuestKind = "emergenza" | "commissione" | "missione";
export type Picked = { tracked: Quest | null; trackedKind: QuestKind | null; other: { title: string; kind: "missione" | "commissione" } | null };

export class QuestEngine {
  private sources: { kind: QuestKind; fn: () => Quest | null }[] = [];

  add(kind: QuestKind, fn: () => Quest | null) {
    this.sources.push({ kind, fn });
  }

  /** cosa seguire adesso; `followErrand` = la scelta del giocatore, `racing` = durante la sfida di corsa */
  pick(followErrand: boolean, racing: boolean): Picked {
    const first = (k: QuestKind) => {
      for (const s of this.sources) if (s.kind === k) {
        const q = s.fn();
        if (q) return q;
      }
      return null;
    };
    const emergency = first("emergenza");
    if (emergency) return { tracked: emergency, trackedKind: "emergenza", other: null };
    const mission = first("missione"), errand = first("commissione");
    if (errand && (followErrand || !mission) && !racing) return { tracked: errand, trackedKind: "commissione", other: mission ? { title: mission.title, kind: "missione" } : null };
    return { tracked: mission, trackedKind: mission ? "missione" : null, other: errand ? { title: errand.title, kind: "commissione" } : null };
  }

  /** il passo corrente: il primo non ancora fatto */
  static current(q: Quest | null) {
    return q?.steps.find((s) => !s.done) ?? null;
  }
}
