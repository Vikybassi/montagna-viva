import { FACTS, type MissionId } from "./content";

/** Progressi salvati nel browser: cosa hai imparato, cosa c'è nello zaino, missioni e record di corsa. */
export type MissionState = "new" | "active" | "done";
type Saved = {
  diary: string[];
  pack: string[];
  packed: boolean;
  missions: Partial<Record<MissionId, MissionState>>;
  active: MissionId | null;
  bestRun: number | null;
  seen: string[];
  stamps: string[];
  summits: string[];
  litter: number[];
  skipBest: number;
  boulder: boolean;
  shots: number;
  /** la batteria del telefono, da 0 a 1: si scarica col tempo e con le foto, si ricarica ai rifugi */
  battery: number;
  /** ometti: i punti che si guadagnano con i compiti e si spendono nell'armadio */
  ometti: number;
  /** compiti fatti (già pagati in ometti) e spille dei capitoli completati */
  tasks: string[];
  badges: string[];
  /** riparo trovato durante un temporale */
  sheltered: boolean;
  /** vestiti comprati e quelli indossati (la giacca è a parte, nel profilo del giocatore) */
  owned: string[];
  outfit: { cappello: string; occhiali: string | null; collo: string | null; bastoncini: string | null };
  /** fotografia naturalistica: quante foto buone per ogni soggetto (fiori e animali) */
  photos: Record<string, number>;
  /** incontri lungo i sentieri risolti, e cosa stai portando per qualcuno */
  encounters: string[];
  carrying: string | null;
  /** la commissione in corso (pane, cappello, Luca) e se l'obiettivo in alto segue lei o la missione */
  errand: string | null;
  followErrand: boolean;
  /** gli ometti caduti che hai rimesso in piedi */
  cairns: string[];
  /** i blocchi della Val di Mello saliti fino in cima */
  blocks: string[];
  /** gli eventi visti: elisoccorso, arcobaleno (e la sua foto), stella cadente */
  events: string[];
};

const KEY = "montagna-viva:v1";
const empty = (): Saved => ({ diary: [], pack: [], packed: false, missions: {}, active: null, bestRun: null, seen: [], stamps: [], summits: [], litter: [], skipBest: 0, boulder: false, shots: 0, battery: 0.86, ometti: 0, tasks: [], badges: [], sheltered: false, owned: [], outfit: { cappello: "c-berretto", occhiali: null, collo: null, bastoncini: null }, photos: {}, encounters: [], carrying: null, errand: null, followErrand: true, cairns: [], blocks: [], events: [] });

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

export const state = load();
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* senza memoria del browser il gioco funziona lo stesso, solo non ricorda */
  }
}
export function reset() {
  Object.assign(state, empty());
  save();
}

/** aggiunge una voce al diario; restituisce la voce se è nuova */
export function learn(id: string) {
  if (state.diary.includes(id)) return null;
  const f = FACTS.find((x) => x.id === id);
  if (!f) return null;
  state.diary.push(id);
  save();
  return f;
}

export const mission = (id: MissionId): MissionState => state.missions[id] ?? "new";
export function setMission(id: MissionId, s: MissionState) {
  state.missions[id] = s;
  if (s === "active") state.active = id;
  if (s === "done" && state.active === id) state.active = null;
  save();
}
export const has = (item: string) => state.pack.includes(item);

/** l'album delle foto dai belvedere (a parte: le immagini pesano) */
const ALBUM = "montagna-viva:album";
export function album(): { img: string; place: string; time: string }[] {
  try {
    return JSON.parse(localStorage.getItem(ALBUM) ?? "[]");
  } catch {
    return [];
  }
}
export function addPhoto(p: { img: string; place: string; time: string }) {
  const a = [p, ...album()].slice(0, 12);
  try {
    localStorage.setItem(ALBUM, JSON.stringify(a));
  } catch {
    /* memoria piena: la foto non si salva */
  }
}

/** il taccuino del naturalista: la foto più bella (la prima) di ogni soggetto */
const NOTEBOOK = "montagna-viva:taccuino";
export function notebook(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NOTEBOOK) ?? "{}");
  } catch {
    return {};
  }
}
export function addToNotebook(subject: string, img: string) {
  const n = notebook();
  if (n[subject]) return;
  n[subject] = img;
  try {
    localStorage.setItem(NOTEBOOK, JSON.stringify(n));
  } catch {
    /* memoria piena */
  }
}
