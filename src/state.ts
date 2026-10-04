import { FACTS, type MissionId } from "./content";

/**
 * Progressi salvati nel browser: cosa hai imparato, cosa c'è nello zaino, missioni, collezioni e record.
 * Il salvataggio ha una versione: quando il gioco cambia, i salvataggi vecchi si aggiornano da soli (migrazioni), e
 * ogni campo viene controllato (un valore strano o mancante torna al suo valore iniziale, invece di rompere il gioco).
 * Se il salvataggio è illeggibile se ne tiene una copia di riserva e si riparte puliti.
 */
export type MissionState = "new" | "active" | "done";
export type Saved = {
  /** versione del salvataggio (vedi MIGRATIONS) */
  version: number;
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
  /** l'acqua nella borraccia (da 0 a 1) e la sete (0 dissetata, 1 tanta sete) */
  water: number;
  thirst: number;
  /** i panorami guardati (rifugi, bivacchi, belvedere) */
  views: string[];
};

const KEY = "montagna-viva:v1";
/** tutte le chiavi del gioco nel browser: progressi, album, taccuino, profilo, impostazioni */
export const KEYS = { state: KEY, album: "montagna-viva:album", notebook: "montagna-viva:taccuino", me: "montagna-viva:me", settings: "montagna-viva:settings" };
export const SAVE_VERSION = 2;
export const empty = (): Saved => ({ version: SAVE_VERSION, diary: [], pack: [], packed: false, missions: {}, active: null, bestRun: null, seen: [], stamps: [], summits: [], litter: [], skipBest: 0, boulder: false, shots: 0, battery: 0.86, ometti: 0, tasks: [], badges: [], sheltered: false, owned: [], outfit: { cappello: "c-berretto", occhiali: null, collo: null, bastoncini: null }, photos: {}, encounters: [], carrying: null, errand: null, followErrand: true, cairns: [], blocks: [], events: [], water: 1, thirst: 0, views: [] });

/**
 * Le migrazioni: da una versione alla successiva. Si applicano in ordine a partire dalla versione del salvataggio.
 * v1 → v2: la versione entra nel salvataggio; chi portava già qualcosa (pane, cappello) lo segue come commissione.
 */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => void> = {
  1: (s) => {
    if (typeof s.carrying === "string" && !s.errand) s.errand = s.carrying;
  },
};
export function migrate(raw: Record<string, unknown>) {
  let v = typeof raw.version === "number" ? raw.version : 1;
  while (v < SAVE_VERSION) {
    MIGRATIONS[v]?.(raw);
    v++;
  }
  raw.version = SAVE_VERSION;
  return raw;
}

/** ogni campo del tipo giusto; quello che manca o è sbagliato torna al valore iniziale */
export function sanitize(raw: unknown): Saved {
  const base = empty();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  const out = base as Record<string, unknown>;
  const kind = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
  for (const k of Object.keys(base)) {
    const d = (base as Record<string, unknown>)[k], v = r[k];
    if (v === undefined) continue;
    // alcuni campi possono essere vuoti (null) o pieni (testo, numero)
    const nullable = k === "active" || k === "bestRun" || k === "carrying" || k === "errand";
    if (kind(v) === kind(d) || (nullable && (v === null || typeof v === "string" || typeof v === "number"))) {
      if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string" || typeof x === "number");
      else if (kind(v) === "object") out[k] = { ...(d as object), ...(v as object) };
      else out[k] = v;
    }
  }
  const s = out as Saved;
  s.battery = Math.min(1, Math.max(0.03, s.battery));
  s.ometti = Math.max(0, Math.round(s.ometti));
  s.water = Math.min(1, Math.max(0, s.water));
  s.thirst = Math.min(1, Math.max(0, s.thirst));
  for (const slot of ["occhiali", "collo", "bastoncini"] as const) if (typeof s.outfit[slot] !== "string") s.outfit[slot] = null;
  if (typeof s.outfit.cappello !== "string") s.outfit.cappello = "c-berretto";
  // una missione già finita non può restare quella da seguire (salvataggi di prima: l'obiettivo restava vuoto)
  if (s.active && (s.missions as Record<string, string>)[s.active] === "done") s.active = null;
  s.version = SAVE_VERSION;
  return s;
}

/** se il salvataggio era illeggibile: il gioco lo dice all'avvio (la copia di riserva resta nel browser) */
export let loadProblem = false;
function load(): Saved {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return empty(); // niente memoria del browser: si gioca senza salvare
  }
  if (!raw) return empty();
  try {
    return sanitize(migrate(JSON.parse(raw)));
  } catch {
    loadProblem = true;
    try {
      localStorage.setItem(`${KEY}:rotto:${Date.now()}`, raw);
    } catch {
      /* niente spazio per la copia */
    }
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
/** ricomincia da capo: progressi, album e taccuino (il profilo e le impostazioni restano) */
export function wipeProgress() {
  for (const k of [KEYS.state, KEYS.album, KEYS.notebook])
    try {
      localStorage.removeItem(k);
    } catch {
      /* niente */
    }
}

/** la partita in un file: progressi, album, taccuino e profilo (nome e giacca) */
export function exportSave() {
  save();
  const read = (k: string) => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? "null");
    } catch {
      return null;
    }
  };
  return JSON.stringify({ gioco: "montagna-viva", salvato: new Date().toISOString(), state: read(KEYS.state), album: read(KEYS.album), notebook: read(KEYS.notebook), me: read(KEYS.me) });
}
/** rimette una partita da un file; restituisce un messaggio d'errore, o null se è andata bene */
export function importSave(text: string): string | null {
  let f: Record<string, unknown>;
  try {
    f = JSON.parse(text);
  } catch {
    return "Il file non si legge: non sembra una partita di Montagna viva.";
  }
  if (!f || f.gioco !== "montagna-viva" || !f.state) return "Questo file non è una partita di Montagna viva.";
  try {
    localStorage.setItem(KEYS.state, JSON.stringify(sanitize(migrate(f.state as Record<string, unknown>))));
    if (Array.isArray(f.album)) localStorage.setItem(KEYS.album, JSON.stringify(f.album.slice(0, 12)));
    if (f.notebook && typeof f.notebook === "object") localStorage.setItem(KEYS.notebook, JSON.stringify(f.notebook));
    if (f.me && typeof f.me === "object") localStorage.setItem(KEYS.me, JSON.stringify(f.me));
  } catch {
    return "Il browser non ha spazio per salvare la partita.";
  }
  return null;
}

/** la mattina dopo (per chi dorme al rifugio): le 7:15 del giorno seguente, mai indietro nel tempo */
export const nextMorning = (hours: number) => (hours % 24 < 7.25 ? Math.floor(hours / 24) * 24 + 7.25 : Math.floor(hours / 24 + 1) * 24 + 7.25);

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
/**
 * Fine di una missione: la prima volta è «completata», le volte dopo (rifatta con Marta) solo «rifatta»; in ogni caso
 * smette di essere quella da seguire. Restituisce true se era la prima volta.
 */
export function finishMission(id: MissionId) {
  const first = state.missions[id] !== "done";
  state.missions[id] = "done";
  if (state.active === id) state.active = null;
  save();
  return first;
}
export function setMission(id: MissionId, s: MissionState) {
  state.missions[id] = s;
  if (s === "active") state.active = id;
  if (s === "done" && state.active === id) state.active = null;
  save();
}
export const has = (item: string) => state.pack.includes(item);

/** l'album delle foto dai belvedere (a parte: le immagini pesano) */
const ALBUM = KEYS.album;
export function album(): { img: string; place: string; time: string }[] {
  try {
    return JSON.parse(localStorage.getItem(ALBUM) ?? "[]");
  } catch {
    return [];
  }
}
/** quante foto tiene l'album (le più recenti): ogni foto pesa, e la memoria del browser è poca */
export const ALBUM_MAX = 12;
export function addPhoto(p: { img: string; place: string; time: string }) {
  const a = [p, ...album()].slice(0, ALBUM_MAX);
  try {
    localStorage.setItem(ALBUM, JSON.stringify(a));
  } catch {
    /* memoria piena: la foto non si salva */
  }
  newPhoto();
}
/** una foto nuova (nell'album o nel taccuino): il telefono accende il puntino sulla scheda Foto */
const newPhoto = () => {
  try {
    dispatchEvent(new Event("mv:foto"));
  } catch {
    /* fuori dal browser (prove) */
  }
};

/** il taccuino del naturalista: la foto più bella (la prima) di ogni soggetto */
const NOTEBOOK = KEYS.notebook;
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
  newPhoto();
}
