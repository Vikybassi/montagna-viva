/**
 * La tastiera, in un posto solo. Ogni parte del gioco registra un "livello" (dialogo, telefonata, telefono, mirino,
 * mondo…) con una priorità; a ogni tasto risponde solo il livello attivo più in alto. Così lo stesso tasto non fa due
 * cose insieme (Invio che chiude un dialogo e ne riapre un altro, un 1 che sceglie una risposta e cambia scheda al
 * telefono, Esc che chiude un pannello e apre la pausa).
 *
 * Un livello `modal` si prende tutti i tasti finché è attivo; uno non modale lascia passare quelli che non usa
 * (la sua funzione restituisce false).
 */
export type Layer = {
  name: string;
  /** più alto = risponde prima */
  priority: number;
  active: () => boolean;
  /** true (o niente) = tasto usato; false = passa al livello sotto (solo per i livelli non modali) */
  key: (k: string, e: KeyboardEvent) => boolean | void;
  modal?: boolean;
};

const layers: Layer[] = [];
/** i tasti tenuti premuti adesso (in minuscolo): per camminare, correre, girare la telecamera */
export const held = new Set<string>();
const upFns: ((k: string) => void)[] = [];

/** aggiunge un livello; restituisce la funzione per toglierlo */
export function addLayer(l: Layer) {
  layers.push(l);
  layers.sort((a, b) => b.priority - a.priority);
  return () => {
    const i = layers.indexOf(l);
    if (i >= 0) layers.splice(i, 1);
  };
}
/** un livello temporaneo sopra tutti (un minigioco): si prende ogni tasto finché non lo togli */
export function pushModal(name: string, key: (k: string, e: KeyboardEvent) => void) {
  return addLayer({ name, priority: 1000, active: () => true, key, modal: true });
}
/** chi deve sapere quando un tasto si rilascia (per esempio F: smetti di scuotere le braccia) */
export function onKeyUp(fn: (k: string) => void) {
  upFns.push(fn);
}
/** il livello che riceverebbe un tasto adesso (per le prove e per il debug) */
export function top() {
  return layers.find((l) => l.active())?.name ?? null;
}

/** smista un tasto: esportata per le prove */
export function dispatch(e: KeyboardEvent) {
  const k = e.key.toLowerCase();
  for (const l of layers.slice()) {
    if (!l.active()) continue;
    const used = l.key(k, e);
    if (used !== false || l.modal) return l.name;
  }
  return null;
}

addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  held.add(e.key.toLowerCase());
  dispatch(e);
});
addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  held.delete(k);
  for (const f of upFns) f(k);
});
addEventListener("blur", () => held.clear());
