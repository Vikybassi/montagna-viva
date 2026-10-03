import * as THREE from "three";
import { MISSIONS, NAME_PARTS, randomName } from "./content";
import { Hiker } from "./player";

/**
 * Il multiplayer: vedere gli altri escursionisti veri nella valle. Ogni giocatore manda 10 volte al secondo dove si trova
 * a un piccolo server (server/relay.mjs), che lo inoltra agli altri della stessa stanza. Se il server non risponde, il
 * gioco prova da solo a collegare le schede aperte nello stesso browser (utile per provare).
 * Si mandano solo nome, colori e posizione: niente altro.
 */
export type Me = { id: string; name: string; jacket: string };
type Msg =
  | { t: "hello"; id: string; name: string; look: { jacket: string; hat?: string }; reply?: boolean }
  | { t: "join"; id: string; name: string; look: { jacket: string; hat?: string }; state?: State | null }
  | ({ t: "state"; id: string } & State)
  | { t: "chat"; id: string; text: string }
  | { t: "event"; id: string; kind: EventKind; ref: string }
  | { t: "leave"; id: string }
  | { t: "you"; name: string }
  | { t: "clock"; hours: number; seed: number }
  | { t: "clock?" };
export type EventKind = "stamp" | "summit" | "mission" | "boulder";
type State = { x: number; y: number; z: number; h: number; s: number; g: boolean; a: boolean; w: boolean; c?: boolean };
type Peer = { id: string; name: string; hiker: Hiker; target: THREE.Vector3; st: State; label: HTMLDivElement; bubble: HTMLSpanElement; bubbleUntil: number; seen: number };

const KEY = "montagna-viva:me";
export function loadMe(): Me {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (m?.id) {
      // un nome salvato che non è nelle liste (es. dalle prime prove) viene sostituito
      const [a, ...r] = String(m.name ?? "").split(" ");
      const ok = NAME_PARTS.animals.includes(a) && NAME_PARTS.adjectives.includes(r.join(" "));
      return { ...m, name: ok ? m.name : randomName() };
    }
  } catch {
    /* niente */
  }
  return { id: Math.random().toString(36).slice(2, 10), name: randomName(), jacket: "#c2375a" };
}
export function saveMe(me: Me) {
  try {
    localStorage.setItem(KEY, JSON.stringify(me));
  } catch {
    /* niente */
  }
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class Net {
  readonly peers = new Map<string, Peer>();
  mode: "server" | "local" | "off" = "off";
  private ws: WebSocket | null = null;
  private bc: BroadcastChannel | null = null;
  private sendT = 0;
  private time = 0;
  /** avvisi per l'interfaccia (entrate, uscite, messaggi, imprese) */
  onNotice: (html: string) => void = () => {};
  onMode: (mode: "server" | "local" | "off", count: number) => void = () => {};
  /** l'ora e il seme del meteo della stanza (solo col server: tutti vedono la stessa ora e lo stesso temporale) */
  onClock: (hours: number, seed: number) => void = () => {};
  private clockT = 0;

  constructor(
    private scene: THREE.Scene,
    private me: Me,
    private labelsHost: HTMLElement,
    private camera: THREE.Camera,
  ) {}

  connect() {
    const q = new URLSearchParams(location.search);
    const room = (q.get("room") || "valmasino").slice(0, 24);
    const url = q.get("server") || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:5210`;
    let opened = false;
    try {
      const ws = new WebSocket(`${url}/?room=${encodeURIComponent(room)}`);
      this.ws = ws;
      ws.onopen = () => {
        opened = true;
        this.mode = "server";
        this.send({ t: "hello", id: this.me.id, name: this.me.name, look: { jacket: this.me.jacket } });
        this.onMode(this.mode, this.peers.size);
      };
      ws.onmessage = (e) => this.receive(JSON.parse(e.data));
      ws.onclose = () => {
        if (opened) {
          this.onNotice("Il server del multiplayer si è scollegato.");
          this.clearPeers();
        }
        this.ws = null;
        if (!opened || this.mode === "server") this.local(room);
      };
    } catch {
      this.local(room);
    }
    setTimeout(() => {
      if (!opened && !this.bc) this.local(room);
    }, 2000);
  }

  /** senza server: le schede dello stesso browser si vedono tra loro */
  private local(room: string) {
    if (this.bc || typeof BroadcastChannel === "undefined") return;
    this.ws?.close();
    this.ws = null;
    this.bc = new BroadcastChannel(`montagna-viva:${room}`);
    this.bc.onmessage = (e) => {
      const m = e.data as Msg;
      // nel canale locale non c'è un server che presenta chi c'è già: ci si risponde a vicenda
      if (m.t === "hello") {
        if (!m.reply) this.send({ t: "hello", id: this.me.id, name: this.me.name, look: { jacket: this.me.jacket }, reply: true });
        this.receive({ t: "join", id: m.id, name: m.name, look: m.look });
      } else if (m.t === "state" && !this.peers.has(m.id)) this.send({ t: "hello", id: this.me.id, name: this.me.name, look: { jacket: this.me.jacket } });
      else this.receive(m);
    };
    this.mode = "local";
    this.send({ t: "hello", id: this.me.id, name: this.me.name, look: { jacket: this.me.jacket } });
    addEventListener("pagehide", () => this.send({ t: "leave", id: this.me.id }));
    this.onMode(this.mode, this.peers.size);
  }

  private send(m: Msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
    else this.bc?.postMessage(m);
  }

  private receive(m: Msg) {
    if (m.t === "you") {
      this.me.name = m.name;
      return;
    }
    if (m.t === "clock") return this.onClock(m.hours, m.seed);
    if (m.t === "join") {
      if (m.id === this.me.id || this.peers.has(m.id)) return;
      const h = new Hiker({ jacket: m.look?.jacket || "#5f86c0", hat: m.look?.hat || "#f4e4de", pack: "#3b3550" });
      h.root.traverse((o) => (o.frustumCulled = false));
      this.scene.add(h.root);
      const label = document.createElement("div");
      label.className = "label player";
      label.innerHTML = `<b>${esc(m.name || "Escursionista")}</b><span class="bubble"></span>`;
      this.labelsHost.appendChild(label);
      const st = m.state ?? { x: 0, y: -1000, z: 0, h: 0, s: 0, g: false, a: false, w: false };
      const peer: Peer = { id: m.id, name: m.name || "Escursionista", hiker: h, target: new THREE.Vector3(st.x, st.y, st.z), st, label, bubble: label.querySelector(".bubble")!, bubbleUntil: 0, seen: this.time };
      h.root.position.copy(peer.target);
      this.peers.set(m.id, peer);
      this.onNotice(`<b>${esc(peer.name)}</b> ora è nella valle con te`);
      this.onMode(this.mode, this.peers.size);
    } else if (m.t === "state") {
      const p = this.peers.get(m.id);
      if (!p) return;
      p.st = m;
      p.target.set(m.x, m.y, m.z);
      p.seen = this.time;
      if (p.hiker.root.position.y < -500) p.hiker.root.position.copy(p.target);
    } else if (m.t === "chat") {
      const p = this.peers.get(m.id);
      if (!p) return;
      p.bubble.textContent = m.text;
      p.bubbleUntil = this.time + 5;
      this.onNotice(`<b>${esc(p.name)}</b>: ${esc(m.text)}`);
    } else if (m.t === "event") {
      const p = this.peers.get(m.id);
      const what =
        m.kind === "stamp" ? `ha timbrato il libretto al ${m.ref}` :
        m.kind === "summit" ? `ha firmato il libro di vetta: ${m.ref}` :
        m.kind === "mission" ? `ha completato «${MISSIONS.find((x) => x.id === m.ref)?.title ?? m.ref}»` : "è in cima al Sasso Remenno!";
      if (p) this.onNotice(`<b>${esc(p.name)}</b> ${esc(what)}`);
    } else if (m.t === "leave") this.drop(m.id);
  }

  private drop(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    this.scene.remove(p.hiker.root);
    p.label.remove();
    this.peers.delete(id);
    this.onNotice(`<b>${esc(p.name)}</b> ha lasciato la valle`);
    this.onMode(this.mode, this.peers.size);
  }
  private clearPeers() {
    [...this.peers.keys()].forEach((id) => this.drop(id));
  }

  chat(text: string) {
    this.send({ t: "chat", id: this.me.id, text });
  }
  event(kind: EventKind, ref: string) {
    this.send({ t: "event", id: this.me.id, kind, ref });
  }

  private v = new THREE.Vector3();
  /** a ogni fotogramma: manda la tua posizione (10 volte al secondo) e muove gli altri */
  update(dt: number, mine: Hiker) {
    this.time += dt;
    this.sendT -= dt;
    // ogni 30 s si riallinea l'orologio della stanza
    this.clockT -= dt;
    if (this.mode === "server" && this.clockT <= 0) {
      this.clockT = 30;
      this.send({ t: "clock?" });
    }
    if (this.mode !== "off" && this.sendT <= 0) {
      this.sendT = 0.1;
      const p = mine.root.position;
      this.send({ t: "state", id: this.me.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), h: +mine.heading.toFixed(3), s: +mine.speed.toFixed(1), g: mine.gliding, a: mine.airborne, w: mine.swimming, c: mine.climbing });
    }
    for (const p of this.peers.values()) {
      if (this.time - p.seen > 20) {
        this.drop(p.id); // sparita senza salutare
        continue;
      }
      p.hiker.remote(dt, p.target, p.st.h, p.st.s, p.st.g, p.st.a, p.st.w, !!p.st.c);
      // etichetta col nome (e il fumetto se ha scritto qualcosa)
      this.v.copy(p.hiker.root.position);
      this.v.y += p.st.g ? 7 : 2.4;
      this.v.project(this.camera);
      const d = p.hiker.root.position.distanceTo(mine.root.position);
      if (this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1 && d < 600) {
        p.label.style.opacity = "1";
        p.label.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * innerWidth}px, ${(-this.v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
      } else p.label.style.opacity = "0";
      p.label.classList.toggle("talk", this.time < p.bubbleUntil);
    }
  }
}
