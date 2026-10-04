import { sound } from "./audio";
import { FACTS, ITEMS, PACK_SLOTS, SUMMITS, type Fact, type Topic } from "./content";
import { SUBJECTS, SUBJECT_IDS } from "./nature";
import { addLayer } from "./input";
import { SOUND_CREDITS } from "./sound-credits";
import { ALBUM_MAX, album, exportSave, importSave, notebook, state } from "./state";

/**
 * L'interfaccia sopra il gioco: dialoghi con le persone, avvisi, obiettivo con freccia, fiato e cronometro, e i contenuti
 * che il telefono mostra (missioni, diario, zaino, collezioni: il telefono è in phone.ts).
 * Tutto HTML (leggibile, accessibile, nitido); mentre un dialogo, un pannello o il telefono è aperto, il gioco non muove
 * l'escursionista.
 */
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const root = el("div", "ui");
document.body.appendChild(root);

// ---------- obiettivo in alto al centro ----------
const goal = el("div", "goal");
goal.innerHTML = `<span class="goal-arrow" aria-hidden="true">↑</span><span class="goal-text"></span><span class="goal-dist"></span>`;
root.appendChild(goal);
const goalArrow = goal.querySelector<HTMLElement>(".goal-arrow")!, goalText = goal.querySelector<HTMLElement>(".goal-text")!, goalDist = goal.querySelector<HTMLElement>(".goal-dist")!;
export function setGoal(text: string | null) {
  goal.classList.toggle("on", !!text);
  if (text) goalText.textContent = text;
}
/** angolo della freccia (radianti, 0 = dritto davanti) e distanza in metri veri */
export function pointGoal(angle: number | null, meters: number | null) {
  goalArrow.style.visibility = angle === null ? "hidden" : "visible";
  if (angle !== null) goalArrow.style.transform = `rotate(${angle}rad)`;
  goalDist.textContent = meters === null ? "" : meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

// ---------- novità per il telefono (il puntino rosso) ----------
export type PhoneTab = "missioni" | "mappa" | "diario" | "foto" | "zaino" | "spille" | "armadio";
let newsFn: (tab: PhoneTab) => void = () => {};
export const onNews = (fn: (tab: PhoneTab) => void) => (newsFn = fn);
addEventListener("mv:foto", () => newsFn("foto"));

// ---------- la missione in corso: titolo e passi (a schermo resta solo l'obiettivo; i passi sono nel telefono) ----------
export type QuestStep = { text: string; done: boolean; current: boolean };
export let currentQuest: { title: string; steps: QuestStep[] } | null = null;
/** l'altra cosa in corso (la missione mentre segui una commissione, o viceversa) */
export let otherQuest: { title: string; kind: "missione" | "commissione" } | null = null;
let questDone = -1, questTitle = "";
export function setQuest(title: string | null, steps: QuestStep[], other: typeof otherQuest = null) {
  currentQuest = title ? { title, steps } : null;
  otherQuest = other;
  const done = steps.filter((s) => s.done).length;
  // un passo fatto in più (della stessa missione): novità nel telefono
  if (title === questTitle && done > questDone && questDone >= 0) newsFn("missioni");
  questTitle = title ?? "";
  questDone = done;
}

// ---------- avvisi ----------
const toasts = el("div", "toasts");
toasts.setAttribute("aria-live", "polite");
root.appendChild(toasts);
export function toast(html: string, kind = "") {
  if (kind.includes("stamp")) newsFn("spille");
  const t = el("div", `toast ${kind}`, html);
  toasts.appendChild(t);
  requestAnimationFrame(() => t.classList.add("on"));
  setTimeout(() => {
    t.classList.remove("on");
    setTimeout(() => t.remove(), 600);
  }, 4200);
}
export function learned(f: Fact | null) {
  if (!f) return;
  newsFn("diario");
  toast(`<small>Nel diario</small><b>${esc(f.title)}</b>`, `fact ${f.topic}`);
  sound.ui("learn");
}

// ---------- invito a interagire (E) ----------
const act = el("button", "act");
act.type = "button";
root.appendChild(act);
let onAct: (() => void) | null = null;
act.addEventListener("click", () => onAct?.());
export function prompt(text: string | null, fn: (() => void) | null) {
  onAct = fn;
  act.classList.toggle("on", !!text);
  if (text) act.innerHTML = `<kbd>E</kbd> ${esc(text)}`;
}
export const triggerAct = () => onAct?.();

// ---------- dialogo ----------
const dlg = el("div", "dlg");
dlg.setAttribute("role", "dialog");
dlg.setAttribute("aria-live", "polite");
root.appendChild(dlg);
export let busy = false;
let pending: ((i: number) => void) | null = null;

/** i ritratti di chi parla (giacca, cappello, capelli: gli stessi colori della figura nel mondo) */
type Look = { jacket?: string; hat?: string; hair?: string; skin?: string };
const avatars = new Map<string, Look>();
export const avatar = (name: string, look: Look) => avatars.set(name, look);
function portrait(speaker: string) {
  const who = speaker.split(/[ ,·]/)[0];
  const l = avatars.get(who);
  if (l)
    return `<div class="ava" aria-hidden="true" style="--jacket:${l.jacket ?? "#c2375a"};--hat:${l.hat ?? "#f2b632"};--hair:${l.hair ?? "#8a5a3a"};--skin:${l.skin ?? "#f0c3a6"}"><i class="ava-body"></i><i class="ava-hair"></i><i class="ava-head"><i class="ava-eye"></i><i class="ava-eye r"></i><i class="ava-cheek"></i><i class="ava-cheek r"></i><i class="ava-smile"></i></i><i class="ava-hat"></i></div>`;
  // cartelli, libri di vetta e avvisi: un'icona al posto della faccia
  const icon = who === "Cartello" ? `<path d="M12 22V4M12 6h8l-2 3 2 3h-8M12 11H5l-2 3 2 3h7"/>` : who === "Libro" ? `<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10"/>` : `<path d="M2 20l7-12 4 6 3-4 6 10z"/>`;
  return `<div class="ava icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></div>`;
}

export function say(speaker: string, text: string, options: string[] = ["Continua"]): Promise<number> {
  busy = true;
  const [name, role] = speaker.split(/, (.+)/);
  dlg.innerHTML = `${portrait(speaker)}<div class="dlg-in"><p class="who"><b>${esc(name)}</b>${role ? `<span>${esc(role)}</span>` : ""}</p><p class="what">${text}</p><div class="opts"></div></div>`;
  // il fumetto "spunta" ogni volta, anche se il precedente era ancora aperto
  dlg.classList.remove("pop");
  void dlg.offsetWidth;
  dlg.classList.add("pop");
  const box = dlg.querySelector(".opts")!;
  return new Promise((res) => {
    pending = (i) => {
      pending = null;
      dlg.classList.remove("on");
      refreshBusy();
      res(i);
    };
    options.forEach((o, i) => {
      const b = el("button", `opt${i === 0 ? " first" : ""}`, `${options.length > 1 ? `<kbd>${i + 1}</kbd> ` : ""}${esc(o)}`) as HTMLButtonElement;
      b.type = "button";
      b.addEventListener("click", () => pending?.(i));
      box.appendChild(b);
    });
    dlg.classList.add("on");
    (box.firstElementChild as HTMLButtonElement | null)?.focus();
  });
}
addLayer({
  name: "dialogo", priority: 80, modal: true,
  active: () => !!pending,
  key: (k, e) => {
    const n = Number(k);
    const count = dlg.querySelectorAll(".opt").length;
    // preventDefault: altrimenti lo stesso Invio "clicca" anche il primo pulsante del dialogo che si apre subito dopo
    if (n >= 1 && n <= count) e.preventDefault(), pending!(n - 1);
    else if ((k === "enter" || k === " " || k === "e") && count === 1 && !e.repeat) e.preventDefault(), pending!(0);
    else if (k === "tab") trapFocus(dlg, e);
  },
});

// ---------- pannelli (zaino da preparare, pausa, crediti) ----------
let panelOpen = false;
let phoneOpen = false, insideOpen = false, callOpen = false;
const refreshBusy = () => (busy = panelOpen || !!pending || phoneOpen || insideOpen || callOpen);
/** il telefono è aperto: il gioco si ferma come per un pannello */
export function setPhoneOpen(v: boolean) {
  phoneOpen = v;
  refreshBusy();
}
const panel = el("div", "panel");
panel.setAttribute("role", "dialog");
root.appendChild(panel);
const closePanel = () => {
  panel.classList.remove("on");
  panelOpen = false;
  refreshBusy();
};
addLayer({
  name: "pannello", priority: 70, modal: true,
  active: () => panelOpen,
  key: (k, e) => {
    if (k === "escape" && !packResolve) closePanel();
    else if (k === "tab") trapFocus(panel, e);
  },
});

const TOPICS: { id: Topic; name: string }[] = [
  { id: "sicurezza", name: "Sicurezza" },
  { id: "fauna", name: "Fauna" },
  { id: "ghiacciai", name: "Ghiacciai" },
  { id: "rispetto", name: "Rispetto" },
];
/** il taccuino del naturalista: una scheda per ogni fiore e animale, con la tua foto */
function notebookHtml() {
  const nb = notebook();
  const got = SUBJECT_IDS.filter((s) => (state.photos[s] ?? 0) > 0).length;
  return `<h3 class="ph-h">Taccuino del naturalista <small>${got} / ${SUBJECT_IDS.length}</small></h3><p class="ph-note">Premi <kbd>P</kbd> per la fotocamera: i fiori protetti si fotografano, non si raccolgono; gli animali si fotografano da lontano, con lo zoom.</p><ul class="ph-notebook">${SUBJECT_IDS.map((id) => {
    const s = SUBJECTS[id], n = state.photos[id] ?? 0;
    return `<li class="${n ? "got" : ""}">${nb[id] ? `<button type="button" class="ph-photo" aria-label="Ingrandisci: ${esc(s.name)}"><img src="${nb[id]}" alt="Foto: ${esc(s.name)}"></button>` : `<span class="ph-nb-empty">${s.kind === "fiore" ? "✿" : "?"}</span>`}<b>${esc(s.name)}</b><small>${n ? `${n} ${n === 1 ? "foto" : "foto"}` : esc(s.where)}</small></li>`;
  }).join("")}</ul>`;
}

/** le foto: l'album (le ultime scattate) e il taccuino del naturalista; un tocco ingrandisce */
export function photosHtml() {
  const photos = album();
  const shots = photos.length
    ? `<ul class="ph-album">${photos.map((p) => `<li><button type="button" class="ph-photo" aria-label="Ingrandisci: ${esc(p.place)}, ${p.time}"><img src="${p.img}" alt="Foto da ${esc(p.place)}"></button><span>${esc(p.place)} · ${p.time}</span></li>`).join("")}</ul>`
    : `<p class="ph-empty">Ancora nessuna foto. Premi <kbd>P</kbd> (o il pulsante con la fotocamera) per guardare nel mirino e scattare: quello che metti al centro finisce qui.</p>`;
  return `<h2>Foto</h2><p class="ph-sub">${photos.length ? `le ultime ${photos.length}${photos.length >= ALBUM_MAX ? " (le più vecchie lasciano il posto alle nuove)" : ""}` : "l'album è vuoto"}</p><h3 class="ph-h">Album</h3>${shots}${notebookHtml()}`;
}

/** il diario: quello che hai imparato, per argomento */
export function diaryHtml() {
  const n = state.diary.length;
  return `<h2>Diario</h2><p class="ph-sub">${n} scoperte su ${FACTS.length}</p>` + TOPICS.map((t) => {
    const all = FACTS.filter((f) => f.topic === t.id);
    const known = all.filter((f) => state.diary.includes(f.id));
    const rest = all.length - known.length;
    const items = known.map((f) => `<li><b>${esc(f.title)}</b><p>${esc(f.text)}</p></li>`).join("") + (rest ? `<li class="locked">${rest === all.length ? "Tutto" : `Altre ${rest} cose`} da scoprire in giro per la valle.</li>` : "");
    return `<h3 class="ph-h ${t.id}">${t.name} <small>${known.length} / ${all.length}</small></h3><ul class="ph-facts">${items}</ul>`;
  }).join("");
}

/** le spille: collezioni e record */
export function collectionsHtml() {
  const huts = SUMMITS.length;
  const tile = (big: string, label: string, note = "") => `<li><b>${big}</b><span>${label}</span>${note ? `<p>${note}</p>` : ""}</li>`;
  return `<h3 class="ph-h">Collezioni</h3><ul class="ph-tiles">
    ${tile(String(state.stamps.length), "timbri dei rifugi", state.stamps.map(esc).join(" · ") || "Timbra il libretto ai rifugi.")}
    ${tile(`${state.summits.length}/${huts}`, "libri di vetta", state.summits.map(esc).join(" · ") || "Firma il libro sulle cime.")}
    ${tile(String(state.litter.length), "rifiuti riportati a valle")}
    ${tile(String(state.skipBest), "rimbalzi, il record")}
    ${tile(state.boulder ? "✓" : "–", "in catena sul Sasso Remenno")}
    ${tile(state.bestRun ? fmtTime(state.bestRun) : "–", "sfida di corsa, il record")}
  </ul>`;
}

/** lo zaino, da guardare (prepararlo si fa con Marta) */
export function packHtml() {
  if (!state.packed) return `<h2>Zaino</h2><p class="ph-sub">Ancora vuoto: lo prepari con Marta, la guida, a San Martino.</p>`;
  const items = ITEMS.filter((it) => state.pack.includes(it.id));
  return `<h2>Zaino</h2><p class="ph-sub">${items.length} cose su ${PACK_SLOTS} posti</p><ul class="ph-facts">${items.map((it) => `<li class="${it.good ? "" : "meh"}"><b>${esc(it.name)}</b><p>${esc(it.note)}</p></li>`).join("")}</ul>`;
}

let packResolve: ((ids: string[]) => void) | null = null;
/** apre lo zaino; se `choose`, chiede di scegliere e restituisce la scelta */
export function openPack(choose: boolean): Promise<string[]> {
  panelOpen = busy = true;
  const picked = new Set(state.pack);
  const render = () => {
    const list = ITEMS.map((it) => {
      const on = picked.has(it.id);
      return `<li><button type="button" class="item${on ? " on" : ""}" data-id="${it.id}" aria-pressed="${on}" ${choose ? "" : "disabled"}>${esc(it.name)}</button></li>`;
    }).join("");
    panel.innerHTML = `<div class="sheet pack"><h2>Zaino</h2><p class="sub">${choose ? `Scegli cosa portare: hai ${PACK_SLOTS} posti (${picked.size} / ${PACK_SLOTS}).` : "Ecco cosa porti con te."}</p><ul class="items">${list}</ul><button type="button" class="done">${choose ? "Chiudi lo zaino e parti" : "Chiudi"}</button></div>`;
    panel.querySelectorAll<HTMLButtonElement>(".item").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.id!;
        if (picked.has(id)) picked.delete(id);
        else if (picked.size < PACK_SLOTS) picked.add(id);
        else toast("Lo zaino è pieno: togli qualcosa prima.");
        render();
      }),
    );
    panel.querySelector(".done")!.addEventListener("click", () => {
      closePanel();
      packResolve?.([...picked]);
      packResolve = null;
    });
  };
  render();
  panel.classList.add("on");
  return new Promise((res) => (packResolve = choose ? res : (ids) => res(ids)));
}

// ---------- una telefonata in arrivo (Marta, quando arriva il temporale) ----------
const call = el("div", "call");
call.setAttribute("role", "alertdialog");
root.appendChild(call);
let answer: (() => void) | null = null, decline: (() => void) | null = null, ringTimer = 0;
/** il telefono squilla: il gioco si ferma finché rispondi (E o Invio) o rifiuti (Esc) */
let hangUp: (() => void) | null = null;
/** chi chiamava riattacca (per esempio: il temporale di cui voleva avvisarti è già passato) */
export function endCall() {
  if (callOpen) hangUp?.();
}
export function ringCall(speaker: string, onAnswer: () => void, onDecline: () => void) {
  callOpen = true;
  refreshBusy();
  const [name, role] = speaker.split(/, (.+)/);
  call.innerHTML = `${portrait(speaker)}<div class="call-in"><b>${esc(name)}</b><span>${role ? `${esc(role)} · ` : ""}chiamata in arrivo…</span></div><button type="button" class="call-no" aria-label="Rifiuta">✕</button><button type="button" class="call-yes">Rispondi <kbd>E</kbd></button>`;
  call.classList.add("on");
  document.querySelector(".miniphone")?.classList.add("ringing");
  const stop = () => {
    callOpen = false;
    refreshBusy();
    call.classList.remove("on");
    document.querySelector(".miniphone")?.classList.remove("ringing");
    clearInterval(ringTimer);
    answer = decline = null;
  };
  answer = () => (stop(), onAnswer());
  decline = () => (stop(), onDecline());
  hangUp = stop;
  call.querySelector(".call-yes")!.addEventListener("click", () => answer?.());
  call.querySelector(".call-no")!.addEventListener("click", () => decline?.());
  sound.ring();
  ringTimer = window.setInterval(() => sound.ring(), 1400);
  (call.querySelector(".call-yes") as HTMLButtonElement).focus();
}
addLayer({
  name: "telefonata", priority: 90, modal: true,
  active: () => !!answer,
  key: (k, e) => {
    if (e.repeat) return;
    if (k === "e" || k === "enter") e.preventDefault(), answer!();
    else if (k === "escape") e.preventDefault(), decline?.();
  },
});

// ---------- dentro un rifugio o un bivacco (al riparo dal temporale) ----------
const inside = el("div", "inside");
inside.innerHTML = `<div class="in-room"><div class="in-window"><i class="in-rain"></i><i class="in-bars"></i></div><i class="in-lamp"></i><i class="in-shelf"></i><i class="in-table"></i><i class="in-cup"></i></div>
  <div class="in-card" role="dialog" aria-live="polite"><p class="in-k"></p><h2 class="in-t"></h2><p class="in-clock"></p><p class="in-text"></p><div class="in-btns"></div></div>`;
root.appendChild(inside);
/** mostra l'interno: tipo (rifugio caldo di legno o bivacco di lamiera), nome, testo, ora, pulsanti; `rain` = fuori piove */
export function showInside(o: { kind: "rifugio" | "bivacco"; name: string; text: string; clock: string; rain: boolean; buttons: { label: string; fn: () => void }[] }) {
  insideOpen = true;
  refreshBusy();
  inside.className = `inside on ${o.kind}${o.rain ? " rain" : ""}`;
  inside.querySelector(".in-k")!.textContent = o.kind === "rifugio" ? "Al riparo nel rifugio" : "Al riparo nel bivacco";
  inside.querySelector(".in-t")!.textContent = o.name;
  setInside(o.clock, o.text, o.rain);
  const box = inside.querySelector(".in-btns")!;
  box.innerHTML = "";
  o.buttons.forEach((b, i) => {
    const btn = el("button", `opt${i === 0 ? " first" : ""}`, esc(b.label)) as HTMLButtonElement;
    btn.type = "button";
    btn.addEventListener("click", b.fn);
    box.appendChild(btn);
  });
  (box.firstElementChild as HTMLButtonElement | null)?.focus();
}
/** aggiorna ora, testo e pioggia alla finestra (mentre aspetti che passi) */
export function setInside(clock: string, text?: string, rain?: boolean) {
  inside.querySelector(".in-clock")!.textContent = clock;
  if (text !== undefined) inside.querySelector(".in-text")!.innerHTML = text;
  if (rain !== undefined) inside.classList.toggle("rain", rain);
}
export function hideInside() {
  inside.classList.remove("on");
  insideOpen = false;
  refreshBusy();
}

// ---------- il mirino della fotocamera ----------
const finder = el("div", "finder");
finder.innerHTML = `<i class="fc tl"></i><i class="fc tr"></i><i class="fc bl"></i><i class="fc br"></i><i class="reticle"></i>
  <p class="finder-top"><b>Fotocamera</b> <span class="finder-zoom">×1</span></p><p class="finder-hint"></p>
  <div class="finder-btns"><button type="button" data-f="out" aria-label="Zoom indietro">−</button><button type="button" data-f="shoot" class="shoot" aria-label="Scatta"></button><button type="button" data-f="in" aria-label="Zoom avanti">+</button><button type="button" data-f="exit">Esci <kbd>Esc</kbd></button></div>
  <p class="finder-keys">Trascina o WASD per guardare · rotella per lo zoom · clic o <kbd>P</kbd> per scattare</p>`;
root.appendChild(finder);
export const finderActions = { onShoot: () => {}, onZoom: (_k: number) => {}, onExit: () => {} };
finder.addEventListener("click", (e) => {
  const f = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-f]")?.dataset.f;
  if (f === "shoot") finderActions.onShoot();
  if (f === "in") finderActions.onZoom(1.4);
  if (f === "out") finderActions.onZoom(1 / 1.4);
  if (f === "exit") finderActions.onExit();
});
let finderSig = "";
export function setFinder(on: boolean, zoom = 1, aim: { name: string; why: string; ok: boolean } | null = null) {
  finder.classList.toggle("on", on);
  document.body.classList.toggle("finding", on);
  if (!on) return;
  const sig = `${zoom.toFixed(1)}|${aim?.name}|${aim?.why}`;
  if (sig === finderSig) return;
  finderSig = sig;
  finder.querySelector(".finder-zoom")!.textContent = `×${zoom.toFixed(1).replace(".", ",")}`;
  finder.classList.toggle("ok", !!aim?.ok);
  finder.querySelector(".finder-hint")!.innerHTML = aim ? `<b>${esc(aim.name)}</b> ${esc(aim.why)}` : "Cerca un fiore protetto o un animale e mettilo al centro";
}

// ---------- fiato e cronometro ----------
const run = el("div", "run");
run.innerHTML = `<span class="run-time">0:00,0</span><span class="run-cp"></span><span class="run-bar" aria-hidden="true"><i></i></span><span class="run-label">fiato</span>`;
root.appendChild(run);
const runTime = run.querySelector<HTMLElement>(".run-time")!, runCp = run.querySelector<HTMLElement>(".run-cp")!, runBar = run.querySelector<HTMLElement>(".run-bar i")!;
export function fmtTime(s: number) {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0").replace(".", ",")}`;
}
export function showRun(on: boolean) {
  run.classList.toggle("on", on);
}
export function setRun(time: number | null, cp: string, stamina: number) {
  runTime.style.display = time === null ? "none" : "";
  if (time !== null) runTime.textContent = fmtTime(time);
  runCp.textContent = cp;
  runBar.style.transform = `scaleX(${stamina})`;
  run.classList.toggle("low", stamina < 0.2);
}

// ---------- pulsanti fissi: in alto pausa e suono; in basso il telefonino (e, sul telefono vero, salta e corri) ----------
const top = el("div", "topbtns");
top.innerHTML = `<button type="button" data-k="sound" class="soundbtn" aria-pressed="true" aria-label="Suono">♪</button><button type="button" data-k="pause" aria-label="Pausa e impostazioni">☰</button>`;
root.appendChild(top);
const bar = el("div", "tools");
bar.innerHTML = `<button type="button" data-k="camera" class="camerabtn" aria-label="Fotocamera (P)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></button><button type="button" data-k="jump" class="touchbtn">Salta / Vola</button><button type="button" data-k="run" class="runbtn" aria-pressed="false">Corri</button><button type="button" data-k="drink" class="drinkbtn" aria-label="Bevi un sorso (B)" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2h4v3l2 2v13a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7l2-2z"/></svg><i class="drink-lvl" aria-hidden="true"></i></button><button type="button" data-k="phone" class="miniphone" aria-label="Apri il telefono (Tab)"><span class="mp-screen"><b class="mp-time">14:00</b></span><i class="mp-dot" aria-hidden="true"></i><span class="mp-wallet"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#cairn"/></svg><b class="mp-ometti">0</b><span class="sr">ometti</span></span></button>`;
root.appendChild(bar);
export const tools = {
  onPhone: () => {},
  onFollow: (_kind: "missione" | "commissione") => {},
  /** riprendere una missione iniziata e lasciata a metà */
  onResume: (_id: string) => {},
  onCamera: () => {},
  onRun: () => {},
  onDrink: () => {},
  onJump: () => {},
  onSound: () => {},
  onPause: () => {},
};
for (const b of [top, bar])
  b.addEventListener("click", (e) => {
    const k = (e.target as HTMLElement).closest("button")?.dataset.k;
    if (k === "phone") tools.onPhone();
    if (k === "camera") tools.onCamera();
    if (k === "run") tools.onRun();
    if (k === "drink") tools.onDrink();
    if (k === "jump") tools.onJump();
    if (k === "sound") tools.onSound();
    if (k === "pause") tools.onPause();
  });
export function setSoundToggle(on: boolean) {
  top.querySelector(".soundbtn")!.setAttribute("aria-pressed", String(on));
}
/** la borraccia nel pulsante: quanta acqua resta (null = non c'è la borraccia) e se hai sete */
export function setWater(level: number | null, thirsty: boolean) {
  const b = bar.querySelector<HTMLButtonElement>(".drinkbtn")!;
  b.hidden = level === null && !thirsty;
  b.style.setProperty("--lvl", String(level ?? 0));
  b.classList.toggle("thirsty", thirsty);
  b.setAttribute("aria-label", level === null ? "Bevi (non hai la borraccia)" : `Bevi un sorso (B) · borraccia ${Math.round(level * 100)}%`);
}
export function setRunToggle(on: boolean) {
  bar.querySelector(".runbtn")!.setAttribute("aria-pressed", String(on));
}
export const isPanelOpen = () => panelOpen;
/** l'ometto (il mucchietto di sassi che segna i sentieri): l'icona dei punti, disegnata una volta e riusata */
document.body.insertAdjacentHTML("beforeend", `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="cairn" viewBox="0 0 24 24"><ellipse cx="12" cy="19.5" rx="8.5" ry="3" fill="#8d8a90"/><ellipse cx="11.5" cy="14.6" rx="6.5" ry="2.7" fill="#a9a5ab"/><ellipse cx="12.5" cy="10.2" rx="4.6" ry="2.3" fill="#8d8a90"/><ellipse cx="12" cy="6.3" rx="3" ry="1.9" fill="#bdb8be"/></symbol></svg>`);
export const cairn = (cls = "cairn") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#cairn"/></svg>`;

// ---------- pausa: impostazioni, comandi, avvertenze e crediti, ricominciare ----------
export const CREDITS = `
  <h3>Avvertenze</h3>
  <p><b>Montagna viva è un gioco.</b> Tempi, strade suggerite, meteo e ghiacciaio sono semplificati: non usarlo per pianificare o seguire escursioni vere. Per quelle servono cartine aggiornate, previsioni per la montagna e, se serve, una guida alpina. In emergenza chiama il <b>112</b>.</p>
  <p>Rifugi, paesi, cime e sentieri sono veri. Le persone del gioco (Marta, Giulio, Sara, Elena) e i loro dialoghi sono <b>inventati</b> e non rappresentano chi gestisce davvero i rifugi.</p>
  <p>Il ghiacciaio "nel tempo" è una <b>simulazione semplificata</b> (si sposta solo la quota della linea di equilibrio), non una ricostruzione storica. I tempi di cammino seguono la formula dei cartelli, senza soste.</p>
  <p>Multiplayer: si condividono solo il nome generato, il colore della giacca e la posizione; il server non salva nulla. I messaggi sono frasi pronte.</p>
  <h3>Crediti</h3>
  <p>Terreno: Copernicus GLO-30 Digital Elevation Model, © DLR e Airbus, programma Copernicus dell'Unione europea.</p>
  <p>Mappe (sentieri, rifugi, cime, laghi, ghiacciai, boschi, strade): © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">contributori OpenStreetMap</a>, dati disponibili con licenza ODbL.</p>
  <p>Caratteri: Bricolage Grotesque e Geist (SIL Open Font License). Grafica 3D: three.js (licenza MIT).</p>
  <p>Suoni registrati, da Wikimedia Commons e Kenney: ${SOUND_CREDITS}.</p>
  <p>Ideato e realizzato da Vittoria Bassi.</p>`;
export function openCredits() {
  panelOpen = busy = true;
  panel.innerHTML = `<div class="sheet"><button type="button" class="x" aria-label="Chiudi">×</button><h2>Avvertenze e crediti</h2>${CREDITS}</div>`;
  panel.querySelector(".x")!.addEventListener("click", closePanel);
  panel.classList.add("on");
  panel.querySelector<HTMLElement>(".x")!.focus();
}

export type PauseOpts = {
  settings: { quality: string; volume: number; sens: number; invertY: boolean };
  level: string;
  shared: boolean;
  onChange: (s: PauseOpts["settings"]) => void;
  onReset: () => void;
};
export function openPause(o: PauseOpts) {
  panelOpen = busy = true;
  const s = { ...o.settings };
  panel.innerHTML = `<div class="sheet pause"><button type="button" class="x" aria-label="Riprendi">×</button><h2>Pausa</h2>
    <p class="sub">${o.shared ? "Sei in compagnia: il tempo della valle intanto va avanti." : "Il tempo della valle è fermo."}</p>
    <button type="button" class="resume">Riprendi</button>
    <h3>Impostazioni</h3>
    <label class="set">Volume <input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" data-k="volume"></label>
    <label class="set">Qualità grafica <select data-k="quality">
      ${[["auto", `Automatica (ora: ${o.level})`], ["alta", "Alta"], ["media", "Media"], ["bassa", "Bassa"]].map(([v, t]) => `<option value="${v}" ${s.quality === v ? "selected" : ""}>${t}</option>`).join("")}
    </select></label>
    <label class="set">Sensibilità della telecamera <input type="range" min="40" max="200" value="${Math.round(s.sens * 100)}" data-k="sens"></label>
    <label class="set check"><input type="checkbox" data-k="invertY" ${s.invertY ? "checked" : ""}> Inverti su e giù della telecamera</label>
    <h3>Comandi</h3>
    <ul class="keys">
      <li><kbd>W A S D</kbd> o frecce: cammina</li><li><kbd>Shift</kbd>: corri</li><li><kbd>Spazio</kbd>: salta; in aria apre il parapendio</li>
      <li><kbd>Q</kbd> <kbd>R</kbd>: gira la telecamera (o trascina col mouse)</li><li><kbd>E</kbd>: parla, osserva, raccogli</li><li><kbd>B</kbd>: bevi un sorso dalla borraccia</li>
      <li><kbd>Tab</kbd> telefono: missioni, mappa (<kbd>M</kbd>), diario (<kbd>J</kbd>), zaino (<kbd>Z</kbd>), spille, armadio (o <kbd>1</kbd>–<kbd>6</kbd>) · <kbd>P</kbd> foto</li><li><kbd>G</kbd> saluta · <kbd>T</kbd> messaggio · <kbd>Esc</kbd> pausa</li>
      <li>In parete: clic sulla presa (la gialla è il prossimo passo; o le direzioni) · <kbd>F</kbd> scuoti le braccia · <kbd>Spazio</kbd> «Calami!»</li>
    </ul>
    <h3>Altro</h3>
    <div class="row"><button type="button" class="export">Esporta partita</button><button type="button" class="import">Importa partita</button><input type="file" accept="application/json,.json" class="import-file" hidden></div>
    <p class="sub">La partita resta in questo browser. Esportala in un file per tenerla al sicuro o continuarla su un altro computer.</p>
    <div class="row"><button type="button" class="credits">Avvertenze e crediti</button><button type="button" class="reset">Ricomincia da capo</button></div>
  </div>`;
  const close = () => closePanel();
  panel.querySelector(".x")!.addEventListener("click", close);
  panel.querySelector(".resume")!.addEventListener("click", close);
  panel.querySelector(".credits")!.addEventListener("click", openCredits);
  panel.querySelector(".export")!.addEventListener("click", () => {
    const blob = new Blob([exportSave()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `montagna-viva-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("<b>Partita esportata</b> Trovi il file nella cartella dei download.");
  });
  const file = panel.querySelector<HTMLInputElement>(".import-file")!;
  panel.querySelector(".import")!.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    closePanel();
    const i = await say("Importa partita", "La partita di questo browser sarà sostituita da quella del file. Continuo?", ["No, lascia stare", "Sì, importa"]);
    if (i !== 1) return;
    const err = importSave(await f.text());
    if (err) toast(`<b>Non importata</b> ${esc(err)}`, "warn");
    else location.reload();
  });
  panel.querySelector(".reset")!.addEventListener("click", async () => {
    closePanel();
    const i = await say("Ricomincia da capo", "Vuoi cancellare diario, zaino, timbri, libri di vetta, foto e record? Non si può annullare.", ["No, tieni tutto", "Sì, ricomincia"]);
    if (i === 1) o.onReset();
  });
  panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-k]").forEach((inp) =>
    inp.addEventListener("input", () => {
      const k = inp.dataset.k as keyof typeof s;
      if (k === "volume") s.volume = +(inp as HTMLInputElement).value / 100;
      if (k === "sens") s.sens = +(inp as HTMLInputElement).value / 100;
      if (k === "invertY") s.invertY = (inp as HTMLInputElement).checked;
      if (k === "quality") s.quality = inp.value;
      o.onChange({ ...s });
    }),
  );
  panel.classList.add("on");
  panel.querySelector<HTMLElement>(".resume")!.focus();
}
export const closeAnyPanel = () => panelOpen && closePanel();

// il focus resta dentro dialoghi, pannelli e rifugio (Tab e Maiusc+Tab girano tra i loro pulsanti)
function trapFocus(box: HTMLElement, e: KeyboardEvent) {
  const f = Array.from(box.querySelectorAll<HTMLElement>("button, input, select, a[href]")).filter((x) => !x.hasAttribute("disabled"));
  e.preventDefault();
  if (!f.length) return;
  const i = f.indexOf(document.activeElement as HTMLElement);
  f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
}
// dentro il rifugio: i pulsanti dell'interno (niente salti, niente pausa sotto)
addLayer({ name: "rifugio", priority: 60, modal: true, active: () => insideOpen, key: (k, e) => void (k === "tab" && trapFocus(inside, e)) });
