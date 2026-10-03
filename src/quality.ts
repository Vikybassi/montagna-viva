import * as THREE from "three";

/**
 * Qualità grafica automatica. Mentre sei sulla schermata iniziale il gioco misura quanto è fluido su questo dispositivo e
 * sceglie un livello: alta, media o bassa. Si riducono la quantità di alberi, fiori e massi (gli elementi sono già in
 * ordine casuale, quindi diradarli è uniforme), le ombre e la risoluzione. Se poi, giocando, resta lento a lungo, scende
 * di un livello da solo. Dalle impostazioni si può anche scegliere a mano.
 */
export type Level = "alta" | "media" | "bassa";
export type Choice = Level | "auto";
type Kind = "tree" | "flower" | "rock";
const FRACTION: Record<Level, Record<Kind, number>> = {
  alta: { tree: 1, flower: 1, rock: 1 },
  media: { tree: 0.6, flower: 0.5, rock: 0.5 },
  bassa: { tree: 0.35, flower: 0, rock: 0.25 },
};

export class Quality {
  level: Level = "alta";
  choice: Choice = "auto";
  private meshes: { m: THREE.InstancedMesh; full: number; kind: Kind }[] = [];
  private samples: number[] = [];
  private slow = 0;
  onChange: (l: Level, auto: boolean) => void = () => {};

  constructor(
    private renderer: THREE.WebGLRenderer,
    private sun: THREE.DirectionalLight,
  ) {}

  /** registra un gruppo di elementi da diradare */
  add(m: THREE.InstancedMesh, kind: Kind) {
    this.meshes.push({ m, full: m.count, kind });
  }

  apply(level: Level, auto = false) {
    this.level = level;
    for (const x of this.meshes) x.m.count = Math.floor(x.full * FRACTION[level][x.kind]);
    const coarse = matchMedia("(pointer: coarse)").matches;
    const dpr = level === "alta" ? Math.min(devicePixelRatio, coarse ? 1.3 : 1.5) : level === "media" ? Math.min(devicePixelRatio, 1.15) : 1;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(innerWidth, innerHeight);
    // ombre: la mappa più piccola in media; in bassa niente ombre (cambia i programmi grafici: si fa una volta sola)
    const size = level === "alta" ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.castShadow = level !== "bassa";
    this.onChange(level, auto);
  }

  /** livello iniziale in base al tipo di dispositivo, prima della misura */
  guess(): Level {
    const small = Math.min(innerWidth, innerHeight) < 700;
    const coarse = matchMedia("(pointer: coarse)").matches;
    return coarse && small ? "media" : "alta";
  }

  /** misura durante la schermata iniziale: da chiamare a ogni fotogramma; restituisce il livello quando ha deciso */
  sample(dt: number): Level | null {
    this.samples.push(dt * 1000);
    if (this.samples.length < 90) return null;
    const s = this.samples.slice(15).sort((a, b) => a - b); // i primi fotogrammi non contano
    const median = s[Math.floor(s.length / 2)];
    this.samples = [];
    // gli schermi limitano i fotogrammi (60 al secondo = 16,7 ms): "alta" se tiene il ritmo, "media" se scende verso i
    // 30–50, "bassa" solo sotto i 30
    return median > 31 ? "bassa" : median > 20 ? "media" : this.guess();
  }

  /** in gioco: se resta lento per 6 secondi di fila, scende di un livello (solo in automatico) */
  watch(dt: number) {
    if (this.choice !== "auto" || this.level === "bassa") return;
    this.slow = dt > 0.036 ? this.slow + dt : Math.max(0, this.slow - dt * 2);
    if (this.slow > 6) {
      this.slow = 0;
      this.apply(this.level === "alta" ? "media" : "bassa", true);
    }
  }
}
