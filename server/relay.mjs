// Server del multiplayer di Montagna viva: un "ripetitore" WebSocket minimo. Non salva niente e non conosce il gioco:
// riceve da ogni giocatore nome, colori e posizione e li inoltra agli altri della stessa stanza (?room=, di base "valmasino").
// Avvio: npm run server  (porta 5210, o PORT=…)
import { WebSocketServer } from "ws";
import { readFileSync } from "node:fs";

// i nomi ammessi: solo combinazioni delle liste condivise col gioco (niente nomi liberi, niente brutte sorprese)
const NAMES = JSON.parse(readFileSync(new URL("../shared/names.json", import.meta.url), "utf8"));
const validName = (n) => {
  const [a, ...rest] = String(n ?? "").split(" ");
  return NAMES.animals.includes(a) && NAMES.adjectives.includes(rest.join(" ")) ? `${a} ${rest.join(" ")}` : null;
};
// i rifugi veri (dai dati del gioco), per gli avvisi "ha timbrato il libretto al …"
const HUTS = JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")).huts.filter((h) => h.kind === "rifugio").map((h) => h.name);
const EVENT = { stamp: HUTS, summit: NAMES.summits, mission: NAMES.missions, boulder: ["Sasso Remenno"] };
const randomName = () => `${NAMES.animals[Math.floor(Math.random() * NAMES.animals.length)]} ${NAMES.adjectives[Math.floor(Math.random() * NAMES.adjectives.length)]}`;
// il tempo della stanza: tutti vedono la stessa ora e lo stesso temporale. Si parte alle 14:00; un minuto di gioco
// ogni 1,5 secondi veri (come nel gioco da soli). Il seme decide quando arriva il temporale di ogni giorno.
const START_HOURS = 14, MIN_PER_SEC = 1 / 1.5;
const clockOf = (r) => ({ t: "clock", hours: r.startHours + ((Date.now() - r.startedAt) / 1000) * MIN_PER_SEC / 60, seed: r.seed });

const PORT = Number(process.env.PORT || 5210);
const MAX_PER_ROOM = 40;
const rooms = new Map(); // stanza -> { peers: Map(id -> { ws, hello, state }), startedAt, startHours, seed }
const clean = (s, n) => String(s ?? "").replace(/[<>&"'`]/g, "").slice(0, n).trim();

const wss = new WebSocketServer({ port: PORT });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://x");
  const room = clean(url.searchParams.get("room") || "valmasino", 24) || "valmasino";
  if (!rooms.has(room)) rooms.set(room, { peers: new Map(), startedAt: Date.now(), startHours: START_HOURS, seed: Math.floor(Math.random() * 1e9) });
  const R = rooms.get(room);
  const peers = R.peers;
  if (peers.size >= MAX_PER_ROOM) return ws.close(1013, "stanza piena");
  let id = null;
  let budget = 40; // messaggi al secondo concessi (anti-spam)
  const refill = setInterval(() => (budget = 40), 1000);
  const send = (to, msg) => to.readyState === 1 && to.send(JSON.stringify(msg));
  const others = (msg) => peers.forEach((p, pid) => pid !== id && send(p.ws, msg));

  ws.on("message", (raw) => {
    if (--budget < 0 || raw.length > 2000) return;
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.t === "hello" && !id) {
      id = clean(m.id, 24) || Math.random().toString(36).slice(2, 10);
      const hello = { id, name: validName(m.name) ?? randomName(), look: { jacket: /^#[0-9a-f]{6}$/i.test(m.look?.jacket) ? m.look.jacket : "#5f86c0" } };
      send(ws, { t: "you", name: hello.name });
      send(ws, clockOf(R));
      // a chi entra: chi c'è già
      peers.forEach((p) => send(ws, { t: "join", ...p.hello, state: p.state }));
      peers.set(id, { ws, hello, state: null });
      others({ t: "join", ...hello });
      return;
    }
    if (!id) return;
    const me = peers.get(id);
    if (m.t === "clock?") return send(ws, clockOf(R));
    if (m.t === "state") {
      const s = { x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, h: +m.h || 0, s: +m.s || 0, g: !!m.g, a: !!m.a, w: !!m.w, c: !!m.c };
      me.state = s;
      others({ t: "state", id, ...s });
    } else if (m.t === "chat") {
      if (NAMES.phrases.includes(m.text)) others({ t: "chat", id, text: m.text }); // solo frasi pronte
    } else if (m.t === "event") {
      if (EVENT[m.kind]?.includes(m.ref)) others({ t: "event", id, kind: m.kind, ref: m.ref }); // solo imprese riconoscibili
    }
  });
  ws.on("close", () => {
    clearInterval(refill);
    if (id && peers.get(id)?.ws === ws) {
      peers.delete(id);
      others({ t: "leave", id });
      if (!peers.size) rooms.delete(room); // stanza vuota: alla prossima si riparte dalle 14
    }
  });
});
console.log(`Montagna viva · server multiplayer su ws://localhost:${PORT}`);
