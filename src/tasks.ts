import { MISSIONS, type MissionId } from "./content";
import { ENCOUNTERS } from "./encounters";
import { mission, save, state } from "./state";
import * as ui from "./ui";
import { sound } from "./audio";

/**
 * I compiti, divisi in capitoli come in un libretto: ognuno dice cosa fare in una riga e quanti ometti vale.
 * I progressi si leggono da quello che il gioco già ricorda (diario, timbri, animali visti…): niente da registrare a parte.
 * Finito un capitolo arriva la sua spilla, con un regalo di ometti.
 */
export type Chapter = { id: string; name: string; badge: string; bonus: number };
export type Task = { id: string; chapter: string; title: string; how: string; reward: number; goal: number; progress: () => number };

export const CHAPTERS: Chapter[] = [
  { id: "primi", name: "Primi passi", badge: "Spilla dello zaino", bonus: 20 },
  { id: "sicurezza", name: "Sicurezza", badge: "Spilla della frontale", bonus: 30 },
  { id: "fauna", name: "Fauna", badge: "Spilla dello stambecco", bonus: 30 },
  { id: "ghiacciai", name: "Ghiacciai", badge: "Spilla del ghiacciaio", bonus: 30 },
  { id: "rispetto", name: "Rispetto della montagna", badge: "Spilla dell'ometto", bonus: 30 },
  { id: "sfide", name: "Sfide", badge: "Spilla del granito", bonus: 40 },
  { id: "naturalista", name: "Occhio da naturalista", badge: "Spilla della genziana", bonus: 40 },
  { id: "incontri", name: "Incontri sul sentiero", badge: "Spilla della mano tesa", bonus: 40 },
  { id: "meraviglie", name: "Meraviglie della valle", badge: "Spilla della stella cadente", bonus: 30 },
];

const knows = (id: string) => (state.diary.includes(id) ? 1 : 0);
const done = (id: MissionId) => (mission(id) === "done" ? 1 : 0);
const brief = (id: MissionId) => MISSIONS.find((m) => m.id === id)!.brief;
const title = (id: MissionId) => MISSIONS.find((m) => m.id === id)!.title;
const t = (id: string, chapter: string, ttl: string, how: string, reward: number, progress: () => number, goal = 1): Task => ({ id, chapter, title: ttl, how, reward, goal, progress });

export const TASKS: Task[] = [
  t("zaino", "primi", "Prepara lo zaino", "Parla con Marta, la guida, a San Martino.", 10, () => (state.packed ? 1 : 0)),
  t("segnavia", "primi", "Segui il bianco e rosso", "Cammina su un sentiero segnato: le strisce ti dicono che sei sulla strada giusta.", 10, () => knows("segnavia")),
  t("cartello", "primi", "Leggi un cartello CAI", "Fermati a un palo con i cartelli e leggi i tempi (E).", 10, () => knows("tempi")),
  t("foto", "primi", "Una foto per l'album", "Da un belvedere, o quando vuoi con P.", 10, () => Math.min(1, state.shots)),

  t("rientro", "sicurezza", title("rientro"), brief("rientro"), 40, () => done("rientro")),
  t("dire", "sicurezza", "Di' a qualcuno dove vai", "Parti per il rientro con Marta: lei avvisa il rifugio che stai salendo.", 10, () => knows("dire")),
  t("meteo", "sicurezza", "Il meteo in quota", "Parla con chi gestisce un rifugio: all'Omio o al Ponti.", 10, () => knows("meteo")),
  t("riparo", "sicurezza", "Al riparo dal temporale", "Quando arriva un temporale, raggiungi un rifugio o un bivacco.", 25, () => (state.sheltered ? 1 : 0)),
  t("remenno", "sicurezza", "In catena sul Sasso Remenno", "Arrampica con Davide: imbrago, casco e corda.", 30, () => (state.boulder ? 1 : 0)),

  t("guardiaparco", "fauna", title("fauna"), brief("fauna"), 40, () => done("fauna")),
  t("stambecco", "fauna", "Uno stambecco", "Sulle rocce sopra il bosco: guardalo da lontano.", 15, () => (state.seen.includes("stambecco") ? 1 : 0)),
  t("marmotta", "fauna", "Una marmotta", "Sui pascoli alti: avvicinati piano, fermati quando fischia.", 15, () => (state.seen.includes("marmotta") ? 1 : 0)),
  t("aquila", "fauna", "L'aquila reale", "Gira alta sopra le pareti della Val di Mello.", 15, () => (state.seen.includes("aquila") ? 1 : 0)),
  t("mucche", "fauna", "Le mucche all'alpeggio", "Passa vicino a una mandria al pascolo, con calma.", 10, () => knows("mucche")),

  t("ghiacciaio", "ghiacciai", title("ghiacciaio"), brief("ghiacciaio"), 40, () => done("ghiacciaio")),
  t("pea", "ghiacciai", "Il ghiacciaio nel 1850", "Con il visore di Elena, guarda com'era nella Piccola Età Glaciale.", 10, () => knows("pea")),
  t("futuro", "ghiacciai", "Il ghiacciaio domani", "Con il visore di Elena, guarda lo scenario del 2050.", 10, () => knows("futuro")),
  t("misure", "ghiacciai", "Chi misura i ghiacciai", "Con il visore di Elena, guarda il ghiacciaio di oggi.", 10, () => knows("misure")),

  t("rifiuti", "rispetto", "Riporta giù 5 rifiuti", "Lungo i sentieri qualcuno ha lasciato cartacce: raccoglile (E).", 25, () => state.litter.length, 5),
  t("timbri", "rispetto", "Timbra 3 rifugi", "In ogni rifugio c'è il timbro per il libretto.", 25, () => state.stamps.length, 3),
  t("vetta", "rispetto", "Firma 3 libri di vetta", "Sulle cime, vicino alla croce, c'è il quaderno di chi sale.", 30, () => state.summits.length, 3),
  t("ometto1", "rispetto", "Rimetti in piedi un ometto", "Sulle pietraie sopra i 2000 m, vicino ai rifugi alti: E sui sassi caduti.", 15, () => Math.min(1, state.cairns.length)),
  t("ometti3", "rispetto", "Tre ometti al loro posto", "Il sentiero torna leggibile per chi passa.", 30, () => state.cairns.length, 3),

  t("corsa", "sfide", title("corsa"), brief("corsa"), 40, () => done("corsa")),
  t("blocco1", "sfide", "Il primo blocco in Val di Mello", "Sui massi del fondovalle, senza corda, sul materassino.", 20, () => Math.min(1, state.blocks.length)),
  t("blocchi", "sfide", "Tutti i blocchi della Val di Mello", "Dal 4a al 6a: l'ultimo è un tetto strapiombante.", 50, () => state.blocks.length, 4),
  t("rimbalzello", "sfide", "Sei rimbalzi", "Sulle rive di un lago, lancia un sasso piatto (E).", 20, () => state.skipBest, 6),
  t("parapendio", "sfide", "Vola in parapendio", "Da un punto alto: salta e, in aria, salta ancora.", 15, () => knows("parapendio")),
  t("rifugi", "sfide", "Sei rifugi timbrati", "Il libretto si riempie: quasi tutta la valle.", 40, () => state.stamps.length, 6),
];

// la fotografia naturalistica: i fiori protetti e gli animali, nel taccuino
const shot = (id: string) => (state.photos[id] ? 1 : 0);
const flowers = () => ["stella", "genziana", "rododendro", "arnica"].filter((f) => state.photos[f]).length;
const animals = () => ["stambecco", "camoscio", "marmotta", "aquila", "gracchio", "mucca"].filter((f) => state.photos[f]).length;
TASKS.push(
  t("f-fiore", "naturalista", "Il primo fiore protetto", "Premi P per la fotocamera e fotografa un fiore: non si raccoglie!", 10, () => Math.min(1, flowers())),
  t("f-stella", "naturalista", "La stella alpina", "Cresce sulle rocce, sopra i 2000 m.", 20, () => shot("stella")),
  t("f-fiori", "naturalista", "Tutti e quattro i fiori", "Stella alpina, genziana, rododendro e arnica.", 30, flowers, 4),
  t("f-zoom", "naturalista", "Da lontano, con lo zoom", "Fotografa un camoscio o una marmotta senza farli scappare.", 20, () => Math.min(1, shot("camoscio") + shot("marmotta"))),
  t("f-gracchi", "naturalista", "I gracchi del rifugio", "Volano attorno ai rifugi alti: inquadrali in volo.", 15, () => shot("gracchio")),
  t("f-animali", "naturalista", "Sei animali nel taccuino", "Stambecco, camoscio, marmotta, aquila, gracchio, mucca.", 40, animals, 6),
  ...ENCOUNTERS.map((e) => t(`e-${e.id}`, "incontri", e.task, e.how, 25, () => (state.encounters.includes(e.id) ? 1 : 0))),
);

// gli eventi: si vedono stando in giro, al momento giusto
const saw = (id: string) => (state.events.includes(id) ? 1 : 0);
TASKS.push(
  t("ev-elisoccorso", "meraviglie", "L'elisoccorso", "Di giorno, col sereno, ogni tanto risale la valle: fermati a guardarlo.", 10, () => saw("elisoccorso")),
  t("ev-arcobaleno", "meraviglie", "Un arcobaleno", "Dopo il temporale, col sole alle spalle.", 10, () => saw("arcobaleno")),
  t("ev-foto-arcobaleno", "meraviglie", "La foto dell'arcobaleno", "Fotocamera (P) verso l'arcobaleno, prima che svanisca.", 20, () => saw("foto-arcobaleno")),
  t("panorami", "meraviglie", "Dall'alto, con i nomi", "Dai rifugi, dai bivacchi e dai belvedere premi E su «Guarda il panorama»: scopri quali cime vedi.", 25, () => state.views.length, 5),
  t("panorami2", "meraviglie", "Dodici panorami", "Ogni rifugio ha la sua finestra sulla valle: guardane dodici.", 50, () => state.views.length, 12),
  t("ev-stella", "meraviglie", "Una stella cadente", "Di notte, col cielo sereno, guarda in alto.", 10, () => saw("stella")),
);

export const taskProgress = (k: Task) => Math.min(k.goal, k.progress());
export const isDone = (k: Task) => state.tasks.includes(k.id);

/**
 * Controlla i compiti: quelli finiti si pagano in ometti (una volta sola), e un capitolo tutto fatto dà la sua spilla.
 * `quiet` all'avvio: i compiti già fatti prima di questa versione si pagano senza avvisi.
 */
export function checkTasks(quiet = false) {
  let changed = false;
  for (const k of TASKS) {
    if (isDone(k) || k.progress() < k.goal) continue;
    state.tasks.push(k.id);
    state.ometti += k.reward;
    changed = true;
    if (!quiet) {
      ui.toast(`<small>Compito fatto · +${k.reward} ometti</small><b>${k.title}</b>`, "task");
      sound.ui("pick");
    }
  }
  for (const ch of CHAPTERS) {
    if (state.badges.includes(ch.id) || !TASKS.filter((k) => k.chapter === ch.id).every(isDone)) continue;
    state.badges.push(ch.id);
    state.ometti += ch.bonus;
    changed = true;
    if (!quiet) {
      setTimeout(() => {
        ui.toast(`<small>Capitolo completato · +${ch.bonus} ometti</small><b>${ch.badge}</b>`, "stamp");
        sound.ui("done");
      }, 900);
    }
  }
  if (changed) save();
  return changed;
}

