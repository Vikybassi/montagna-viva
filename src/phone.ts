import { sound } from "./audio";
import { SLOTS, WARDROBE, type Wear } from "./content";
import type { Outfit } from "./player";
import { has, save, state } from "./state";
import { CHAPTERS, TASKS, checkTasks, isDone, taskProgress } from "./tasks";
import { addLayer } from "./input";
import * as ui from "./ui";
import type { PhoneTab } from "./ui";

/**
 * Il telefono, tenuto in mano come in Coastal World: una sola cosa da aprire (Tab, o il telefonino in basso a destra) per
 * sapere come sei messa. In alto l'ora, dove sei e a che quota, quanto manca al tramonto e la batteria; sotto cinque
 * schede: missioni (i compiti a capitoli, pagati in ometti), mappa, diario, zaino, spille e armadio (dove gli ometti
 * diventano vestiti). A schermo, fuori dal telefono, resta solo la prossima cosa da fare.
 * La batteria è un piccolo promemoria vero: col tempo e con le foto si scarica, ai rifugi si ricarica.
 */
export type Status = { hours: number; place: string; alt: number; sunset: number };
const TABS: { id: PhoneTab; name: string; key: string; icon: string }[] = [
  { id: "missioni", name: "Missioni", key: "", icon: `<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>` },
  { id: "mappa", name: "Mappa", key: "M", icon: `<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>` },
  { id: "diario", name: "Diario", key: "J", icon: `<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10"/>` },
  { id: "zaino", name: "Zaino", key: "Z", icon: `<path d="M7 9a5 5 0 0 1 10 0v11H7zM9 4h6M7 14h10M10 14v2"/>` },
  { id: "spille", name: "Spille", key: "", icon: `<circle cx="12" cy="9" r="5"/><path d="M9 13l-2 8 5-3 5 3-2-8"/>` },
  { id: "armadio", name: "Armadio", key: "", icon: `<path d="M12 7.5a2.2 2.2 0 1 1 2.2-2.2M12 7.5V9l-9 7.5h18L12 9"/>` },
];
/** le spille dei capitoli: un disegno semplice per ognuna */
const BADGE_ICON: Record<string, string> = {
  primi: `<path d="M7 9a5 5 0 0 1 10 0v11H7zM9 4h6M7 14h10"/>`,
  sicurezza: `<circle cx="12" cy="12" r="3.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"/>`,
  fauna: `<path d="M8 21c0-6-5-8-4-15M16 21c0-6 5-8 4-15M8 15c2.5 2 5.5 2 8 0M9 19h6"/>`,
  ghiacciai: `<path d="M2 20l7-12 4 6 3-4 6 10zM9 8l2 4 2-1"/>`,
  rispetto: `<ellipse cx="12" cy="19" rx="7" ry="2.5"/><ellipse cx="12" cy="14" rx="5" ry="2.2"/><ellipse cx="12" cy="9.5" rx="3.4" ry="1.9"/><ellipse cx="12" cy="5.6" rx="2" ry="1.4"/>`,
  sfide: `<path d="M13 3L6 14h5l-1 7 7-11h-5z"/>`,
  meraviglie: `<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z"/>`,
  naturalista: `<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>`,
  incontri: `<path d="M3 12l4-4 4 2 3-3 4 1 3 3-6 6-3-2-2 2-3-1z"/>`,
};
/** il vestito: dall'armadio alla figura */
export function outfitOf(): Outfit & { hatColor?: string } {
  const w = (id: string | null) => WARDROBE.find((x) => x.id === id) ?? null;
  const hat = w(state.outfit.cappello) ?? WARDROBE.find((x) => x.id === "c-berretto")!;
  return { hat: hat.kind ?? "beanie", hatColor: hat.color, glasses: !!state.outfit.occhiali, bandana: w(state.outfit.collo)?.color ?? null, poles: !!state.outfit.bastoncini };
}
const hhmm = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
const left = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))}'` : `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}'`);

export class Phone {
  isOpen = false;
  private tab: PhoneTab = "missioni";
  private wrap: HTMLDivElement;
  private device: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private body: HTMLDivElement;
  private mini = document.querySelector<HTMLButtonElement>(".miniphone")!;
  private news = new Set<PhoneTab>();
  private lastHours = -1;
  private lowWarned = false;
  private tick = 0;

  constructor(
    private status: () => Status,
    private map: { showIn(el: HTMLElement): void; onLeave: () => void },
    /** la giacca (sta nel profilo del giocatore, la vedono anche gli altri) e i vestiti sulla figura */
    private wear: { jacket: () => string; setJacket: (c: string) => void; apply: () => void },
  ) {
    this.wrap = document.createElement("div");
    this.wrap.className = "phone-wrap";
    this.wrap.innerHTML = `<div class="phone-hand"><span class="thumb" aria-hidden="true"></span>
      <div class="phone" role="dialog" aria-label="Telefono"><div class="phone-screen">
        <div class="ph-status"></div>
        <div class="ph-head"><nav class="ph-tabs">${TABS.map((t) => `<button type="button" data-tab="${t.id}" aria-label="${t.name}"><svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg><span>${t.name}</span><i class="ph-dot"></i></button>`).join("")}</nav><button type="button" class="ph-x" aria-label="Chiudi il telefono">×</button></div>
        <div class="ph-body"></div>
      </div></div>
      <span class="fingers" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>`;
    document.body.appendChild(this.wrap);
    this.device = this.wrap.querySelector(".phone")!;
    this.statusEl = this.wrap.querySelector(".ph-status")!;
    this.body = this.wrap.querySelector(".ph-body")!;
    this.wrap.querySelectorAll<HTMLButtonElement>(".ph-tabs button").forEach((b) => b.addEventListener("click", () => this.show(b.dataset.tab as PhoneTab)));
    this.wrap.querySelector(".ph-x")!.addEventListener("click", () => this.close());
    // un clic fuori dal telefono lo mette via
    this.wrap.addEventListener("click", (e) => {
      if (e.target === this.wrap) this.close();
    });
    map.onLeave = () => this.close();
    // armadio: comprare, indossare, togliere
    this.body.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-wear]");
      if (b) this.dress(b.dataset.wear!);
      // seguire l'altra cosa in corso: l'obiettivo in alto cambia subito
      const f = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-follow]");
      if (f) {
        ui.tools.onFollow(f.dataset.follow as "missione" | "commissione");
        sound.ui("blip");
        setTimeout(() => this.show("missioni"), 80);
      }
    });
    // i compiti già fatti prima di questa versione si pagano subito, senza avvisi
    checkTasks(true);
    wear.apply();
    this.wallet();
    ui.onNews((t) => {
      if (this.isOpen && this.tab === t) return;
      this.news.add(t);
      this.dots();
    });
    // telefono aperto: Esc o Tab lo chiudono, numeri e lettere cambiano scheda (il gioco sotto aspetta)
    addLayer({ name: "telefono", priority: 50, modal: true, active: () => this.isOpen, key: (k, e) => this.key(k, e) });
  }

  /** a telefono chiuso (dal livello "mondo"): Tab lo apre, M J Z aprono subito la scheda giusta; true = tasto usato */
  shortcut(k: string, e: KeyboardEvent) {
    const tab = k === "tab" ? this.tab : k === "m" ? "mappa" : k === "j" ? "diario" : k === "z" || k === "i" ? "zaino" : null;
    if (!tab || e.repeat) return false;
    e.preventDefault();
    this.open(k === "tab" ? undefined : tab);
    return true;
  }

  private key(k: string, e: KeyboardEvent) {
    if (e.repeat) return;
    if (k === "escape" || k === "tab") {
      e.preventDefault();
      this.close();
      return;
    }
    const byKey = TABS.find((t) => t.key && t.key.toLowerCase() === k) ?? (k >= "1" && k <= String(TABS.length) ? TABS[+k - 1] : null);
    if (byKey) this.toggle(byKey.id);
    else if (k === "arrowright" || k === "arrowleft") {
      const i = TABS.findIndex((t) => t.id === this.tab);
      this.show(TABS[(i + (k === "arrowright" ? 1 : TABS.length - 1)) % TABS.length].id);
    }
  }

  /** apre (sulla scheda data, o sull'ultima guardata) */
  open(tab?: PhoneTab) {
    if (tab) this.tab = tab;
    else if (this.news.size) this.tab = [...this.news][0];
    this.isOpen = true;
    ui.setPhoneOpen(true);
    this.wrap.classList.add("on");
    this.show(this.tab);
    sound.ui("blip");
    save();
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    ui.setPhoneOpen(false);
    this.wrap.classList.remove("on");
  }
  /** apre sulla scheda; se è già aperto proprio lì, lo chiude */
  toggle(tab?: PhoneTab) {
    if (this.isOpen && (!tab || tab === this.tab)) this.close();
    else this.open(tab);
  }

  private show(tab: PhoneTab) {
    this.tab = tab;
    this.news.delete(tab);
    this.dots();
    this.wrap.querySelectorAll<HTMLButtonElement>(".ph-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
    // la mappa si guarda col telefono girato in orizzontale
    this.device.classList.toggle("wide", tab === "mappa");
    this.body.className = `ph-body ${tab}`;
    this.body.scrollTop = 0;
    if (tab === "mappa") {
      this.body.innerHTML = `<h2>Val Masino</h2><div class="ph-map"></div>`;
      this.map.showIn(this.body.querySelector(".ph-map")!);
    } else this.body.innerHTML = tab === "missioni" ? this.missionsHtml() : tab === "diario" ? ui.diaryHtml() : tab === "zaino" ? ui.packHtml() : tab === "spille" ? this.badgesHtml() + ui.collectionsHtml() : this.wardrobeHtml();
    this.renderStatus();
  }

  private walletHtml() {
    return `<p class="ph-wallet">${ui.cairn()}<b>${state.ometti}</b> ometti</p>`;
  }
  private wallet() {
    this.mini.querySelector(".mp-ometti")!.textContent = String(state.ometti);
  }

  /** la missione in corso con i suoi passi, poi i compiti del libretto, capitolo per capitolo */
  private missionsHtml() {
    const q = ui.currentQuest;
    let html = `<div class="ph-widgets"></div><h2>Le missioni</h2>${this.walletHtml()}`;
    if (q) {
      const n = q.steps.filter((s) => s.done).length;
      html += `<article class="ph-card now"><p class="ph-k">In corso</p><h3>${q.title}</h3><span class="ph-prog" aria-hidden="true"><i style="width:${Math.round((n / q.steps.length) * 100)}%"></i></span><p class="ph-n">${n} di ${q.steps.length} passi</p><ol class="ph-steps">${q.steps.map((s) => `<li class="${s.done ? "done" : ""}${s.current ? " cur" : ""}">${s.text}</li>`).join("")}</ol></article>`;
    } else html += `<p class="ph-note">Le missioni grandi le scegli con Marta, a San Martino.</p>`;
    const o = ui.otherQuest;
    if (o) html += `<article class="ph-card other"><div class="ph-row"><span><p class="ph-k">${o.kind === "missione" ? "Missione in pausa" : "Commissione in corso"}</p><h3>${o.title}</h3></span><button type="button" class="ph-follow" data-follow="${o.kind}">Segui</button></div></article>`;
    for (const ch of CHAPTERS) {
      const list = TASKS.filter((k) => k.chapter === ch.id);
      const n = list.filter(isDone).length, all = n === list.length;
      html += `<details class="ph-chapter${all ? " done" : ""}" ${all ? "" : "open"}><summary><span class="ph-badge${state.badges.includes(ch.id) ? " got" : ""} ${ch.id}"><svg viewBox="0 0 24 24" aria-hidden="true">${BADGE_ICON[ch.id]}</svg></span><span class="ph-ch-t"><b>${ch.name}</b><small>${n} di ${list.length} · spilla +${ch.bonus}</small><span class="ph-prog"><i style="width:${Math.round((n / list.length) * 100)}%"></i></span></span></summary>`;
      for (const k of list) {
        const d = isDone(k), p = taskProgress(k);
        html += `<article class="ph-task${d ? " done" : ""}"><div class="ph-row"><h3>${d ? "✓ " : ""}${k.title}</h3><span class="ph-rew">+${k.reward}${ui.cairn()}</span></div>${d ? "" : `<p>${k.how}</p>`}${!d && k.goal > 1 ? `<span class="ph-prog small"><i style="width:${Math.round((p / k.goal) * 100)}%"></i></span><p class="ph-n">${p} di ${k.goal}</p>` : ""}</article>`;
      }
      html += `</details>`;
    }
    return html;
  }

  /** le spille dei capitoli (prima delle collezioni) */
  private badgesHtml() {
    const got = state.badges.length;
    return `<h2>Spille e ricordi</h2><p class="ph-sub">${got} spille su ${CHAPTERS.length} · una per ogni capitolo completato</p><ul class="ph-badges">${CHAPTERS.map((ch) => `<li class="${state.badges.includes(ch.id) ? "got" : ""}"><span class="ph-badge${state.badges.includes(ch.id) ? " got" : ""} ${ch.id}"><svg viewBox="0 0 24 24" aria-hidden="true">${BADGE_ICON[ch.id]}</svg></span><span>${ch.badge}</span></li>`).join("")}</ul>`;
  }

  /** l'armadio: gli ometti diventano vestiti */
  private wardrobeHtml() {
    const jacket = this.wear.jacket();
    let html = `<h2>Armadio</h2>${this.walletHtml()}<p class="ph-sub">Gli ometti si guadagnano con i compiti delle missioni</p>`;
    for (const sl of SLOTS) {
      html += `<h3 class="ph-h">${sl.name}</h3><ul class="ph-wear">`;
      for (const w of WARDROBE.filter((x) => x.slot === sl.id)) {
        const owned = w.price === 0 || state.owned.includes(w.id);
        const on = w.slot === "giacca" ? w.color === jacket : w.slot === "cappello" ? state.outfit.cappello === w.id : state.outfit[w.slot] === w.id;
        const short = state.ometti < w.price;
        const btn = on
          ? w.slot === "giacca" || w.slot === "cappello" ? `<button type="button" class="on" disabled>Indossato</button>` : `<button type="button" data-wear="${w.id}" class="on">Togli</button>`
          : owned ? `<button type="button" data-wear="${w.id}">Indossa</button>` : `<button type="button" data-wear="${w.id}" class="buy${short ? " short" : ""}">${w.price}${ui.cairn()}</button>`;
        html += `<li class="${on ? "on" : ""}"><span class="ph-sw ${w.slot}" style="--c:${w.color ?? "#3a3f4a"}"></span><span class="ph-wn"><b>${w.name}</b>${w.note ? `<small>${w.note}</small>` : ""}${!owned && short ? `<small class="miss">ti mancano ${w.price - state.ometti} ometti</small>` : ""}</span>${btn}</li>`;
      }
      html += `</ul>`;
    }
    return html;
  }

  private dress(id: string) {
    const w = WARDROBE.find((x) => x.id === id) as Wear;
    const owned = w.price === 0 || state.owned.includes(w.id);
    if (!owned) {
      if (state.ometti < w.price) {
        ui.toast(`Per ${w.name.toLowerCase()} ti mancano ${w.price - state.ometti} ometti: completa qualche compito.`);
        sound.ui("fail");
        return;
      }
      state.ometti -= w.price;
      state.owned.push(w.id);
      sound.ui("pick");
    } else sound.ui("blip");
    if (w.slot === "giacca") this.wear.setJacket(w.color!);
    else if (w.slot === "cappello") state.outfit.cappello = w.id;
    else state.outfit[w.slot] = state.outfit[w.slot] === w.id ? null : w.id;
    save();
    this.wear.apply();
    this.wallet();
    const top = this.body.scrollTop;
    this.show("armadio");
    this.body.scrollTop = top;
  }

  private dots() {
    this.wrap.querySelectorAll<HTMLButtonElement>(".ph-tabs button").forEach((b) => b.classList.toggle("new", this.news.has(b.dataset.tab as PhoneTab)));
    this.mini.classList.toggle("new", this.news.size > 0);
  }

  private renderStatus() {
    const s = this.status();
    const b = state.battery;
    const sun = s.hours < s.sunset ? `tramonto ${hhmm(s.sunset)} · fra ${left(s.sunset - s.hours)}` : "dopo il tramonto";
    // in cima alle missioni: come sei messa (ora, luce che resta, quota, batteria)
    const w = this.body.querySelector(".ph-widgets");
    if (w) {
      const toDark = s.sunset - s.hours;
      const light = toDark > 0 ? `<div class="${toDark < 1.5 ? "warn" : ""}"><b>${left(toDark)}</b><span>al tramonto (${hhmm(s.sunset)})</span></div>` : `<div class="warn"><b>buio</b><span>${has("frontale") ? "accendi la frontale" : "senza frontale: piano!"}</span></div>`;
      w.innerHTML = `<div><b>${hhmm(s.hours)}</b><span>ora</span></div>${light}<div><b>${Math.round(s.alt).toLocaleString("it-IT")} m</b><span>quota</span></div><div class="${b < 0.2 ? "warn" : ""}"><b>${Math.round(b * 100)}%</b><span>batteria</span></div>`;
    }
    this.statusEl.innerHTML = `<span class="ph-time">${hhmm(s.hours)}</span><span class="ph-where">${s.place} · ${Math.round(s.alt).toLocaleString("it-IT")} m</span><span class="ph-sun${s.hours > s.sunset - 1 ? " late" : ""}">${sun}</span><span class="ph-batt${b < 0.2 ? " low" : ""}" aria-label="Batteria ${Math.round(b * 100)}%"><i style="width:${Math.round(b * 100)}%"></i></span><span class="ph-pct">${Math.round(b * 100)}%</span>`;
  }

  /** a ogni fotogramma: batteria, ora sul telefonino, barra di stato se aperto */
  update(dt: number) {
    const s = this.status();
    // la batteria scende di circa il 3% per ora di gioco (in pausa o al telefono il tempo è fermo)
    if (this.lastHours >= 0 && s.hours > this.lastHours && s.hours - this.lastHours < 1) state.battery = Math.max(0.03, state.battery - (s.hours - this.lastHours) * 0.03);
    this.lastHours = s.hours;
    if (state.battery < 0.2 && !this.lowWarned) {
      this.lowWarned = true;
      ui.toast("<b>Telefono al 20%</b> In montagna la batteria va risparmiata: per questo nello zaino serve anche la cartina. Ai rifugi lo ricarichi.", "warn");
    }
    if (state.battery > 0.3) this.lowWarned = false;
    this.tick += dt;
    if (this.tick < 0.5) return;
    this.tick = 0;
    // compiti finiti: ometti, e la scheda si aggiorna se la stai guardando
    if (checkTasks()) {
      this.wallet();
      if (this.isOpen && this.tab !== "mappa") {
        const top = this.body.scrollTop;
        this.show(this.tab);
        this.body.scrollTop = top;
      } else if (!this.isOpen || this.tab !== "missioni") {
        this.news.add("missioni");
        this.dots();
      }
    }
    this.mini.querySelector(".mp-time")!.textContent = hhmm(s.hours);
    if (this.isOpen) this.renderStatus();
  }
}
