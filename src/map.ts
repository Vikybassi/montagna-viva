import * as THREE from "three";
import { SUMMITS } from "./content";
import { state } from "./state";
import { S, type Cover, type Place, type Terrain, type WorldData } from "./world";

/**
 * La mappa della valle (nel telefono, tasto M), come una carta dei sentieri: fondo chiaro con curve di livello ogni
 * 100 m e un leggero rilievo, boschi, ghiacciai, laghi e torrenti; strade bianche; i sentieri segnati del CAI rossi
 * tratteggiati con il loro numero, quelli non segnati sottili e marroni (le tracce deboli non si disegnano); rifugi,
 * bivacchi, cime e paesi con il nome; dove sei e dove guardi. Si ingrandisce (rotella, due dita, + e −) e si sposta
 * trascinando. Toccando un rifugio si sceglie cosa fare (la strada, o andarci subito se hai il timbro).
 */
const PX = 3; // pixel del fondo per ogni cella del terreno: abbastanza per ingrandire fino a 6 volte

export class ValleyMap {
  private base: HTMLCanvasElement | null = null;
  private canvas: HTMLCanvasElement;
  private view: HTMLDivElement;
  private hint: HTMLParagraphElement;
  private legend: HTMLParagraphElement;
  private tip: HTMLDivElement;
  private wrap: HTMLElement | null = null;
  private hovered: Place | null = null;
  /** prima di scegliere un rifugio: chi mostra la mappa si chiude (il telefono) */
  onLeave: () => void = () => {};
  /** le fermate della corriera (in unità di gioco): si disegnano come piccoli quadrati blu */
  stops: { x: number; z: number }[] = [];
  /** tempo di cammino da qui (per il cartellino al passaggio del mouse) */
  estimate: (p: Place) => string | null = () => null;
  private hits: { x: number; y: number; place: Place }[] = [];
  // la finestra sulla mappa: centro (in pixel del fondo) e zoom (pixel del fondo per pixel dello schermo)
  private cx = 0;
  private cy = 0;
  private z = 1;
  private fitZ = 1;
  private W = 0;
  private H = 0;
  private k = 1; // pixel del fondo per metro

  constructor(
    private t: Terrain,
    private data: WorldData,
    private cover: Cover,
    private onPick: (p: Place) => void,
    private where: () => { x: number; z: number; heading: number; hours: number; storm: boolean },
    private getRoute: () => THREE.Vector3[] | null,
  ) {
    this.W = t.meta.cols * PX;
    this.H = t.meta.rows * PX;
    this.k = this.W / (t.width / S);
    this.view = document.createElement("div");
    this.view.className = "map-view";
    this.canvas = document.createElement("canvas");
    this.view.appendChild(this.canvas);
    const btns = document.createElement("div");
    btns.className = "map-btns";
    btns.innerHTML = `<button type="button" data-z="in" aria-label="Ingrandisci">+</button><button type="button" data-z="out" aria-label="Rimpicciolisci">−</button><button type="button" data-z="me" aria-label="Centra su di me">◎</button>`;
    btns.addEventListener("click", (e) => {
      const z = (e.target as HTMLElement).closest("button")?.dataset.z;
      if (z === "in") this.zoomAt(1 / 1.5);
      if (z === "out") this.zoomAt(1.5);
      if (z === "me") this.centerOnMe();
    });
    this.view.appendChild(btns);
    this.pointerControls();
    this.tip = document.createElement("div");
    this.tip.className = "map-tip";
    this.hint = document.createElement("p");
    this.hint.className = "map-hint";
    this.legend = document.createElement("p");
    this.legend.className = "map-legend";
    this.legend.innerHTML = `<span class="me">▲ tu</span><span class="cai">┅ sentiero CAI</span><span class="r1">● timbrato</span><span class="r0">○ rifugio</span><span class="bv">◆ bivacco</span><span class="bs">■ fermata corriera</span><span class="pk">▲ libro di vetta</span>`;
    try {
      new ResizeObserver(() => this.resize()).observe(this.view);
    } catch {
      /* browser vecchio: si ridimensiona a ogni apertura */
    }
  }

  /** il fondo, disegnato la prima volta che si apre la mappa (ci mette un attimo) */
  private ensureBase() {
    if (this.base) return this.base;
    const { t, cover } = this, W = this.W, H = this.H, k = this.k;
    const base = document.createElement("canvas");
    base.width = W;
    base.height = H;
    const g = base.getContext("2d")!;
    // le quote, una volta sola
    const hm = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) hm[y * W + x] = t.heightAt((x / (W - 1)) * t.width, (y / (H - 1)) * t.depth) / S;
    const img = g.createImageData(W, H);
    const col = new THREE.Color(), tmp = new THREE.Color(), line = new THREE.Color("#b5895a");
    const cellM = t.width / S / (W - 1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x, h = hm[i];
        const hr = hm[y * W + Math.min(W - 1, x + 1)], hd = hm[Math.min(H - 1, y + 1) * W + x];
        const gx = (x / (W - 1)) * t.width, gz = (y / (H - 1)) * t.depth;
        // colori chiari, da carta: prato, pascolo alto, roccia, poi boschi, ghiaccio e acqua sopra
        const slope = Math.hypot(hr - h, hd - h) / cellM;
        col.set("#eef1dd").lerp(tmp.set("#f3ecd6"), THREE.MathUtils.smoothstep(h, 1700, 2200));
        col.lerp(tmp.set("#e3dfda"), Math.max(THREE.MathUtils.smoothstep(h, 2400, 2700), THREE.MathUtils.smoothstep(slope, 0.9, 1.4)));
        col.lerp(tmp.set("#cfe3b5"), cover.at(cover.forest, gx, gz) * 0.9);
        col.lerp(tmp.set("#f5fafd"), cover.at(cover.glacier, gx, gz));
        col.lerp(tmp.set("#a9d5e8"), cover.at(cover.water, gx, gz));
        // un rilievo leggero, luce da nord-ovest
        const shade = THREE.MathUtils.clamp(1 + ((hm[y * W + Math.max(0, x - 1)] - hr) + (hm[Math.max(0, y - 1) * W + x] - hd)) / cellM * 0.18, 0.78, 1.08);
        col.multiplyScalar(shade);
        // curve di livello ogni 100 m (più marcate ogni 500)
        const c100 = Math.floor(h / 100) !== Math.floor(hr / 100) || Math.floor(h / 100) !== Math.floor(hd / 100);
        const c500 = Math.floor(h / 500) !== Math.floor(hr / 500) || Math.floor(h / 500) !== Math.floor(hd / 500);
        if (c500) col.lerp(line, 0.55);
        else if (c100) col.lerp(line, 0.28);
        img.data[i * 4] = Math.min(255, col.r * 255);
        img.data[i * 4 + 1] = Math.min(255, col.g * 255);
        img.data[i * 4 + 2] = Math.min(255, col.b * 255);
        img.data[i * 4 + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    void k;
    this.base = base;
    return base;
  }

  /** mostra la mappa dentro `el` (lo schermo del telefono), aggiornata */
  showIn(el: HTMLElement) {
    const touch = matchMedia("(pointer: coarse)").matches ? "Tocca" : "Clicca";
    this.hint.innerHTML = this.where().storm
      ? `<b>Temporale!</b> ${touch} il rifugio più vicino: ti indico la strada per metterti al riparo.`
      : `${touch} un rifugio per la strada · trascina e ingrandisci con ${touch === "Tocca" ? "due dita" : "la rotella"}`;
    el.replaceChildren(this.hint, this.view, this.legend, this.tip);
    this.wrap = el;
    this.showTip(null);
    this.ensureBase();
    requestAnimationFrame(() => {
      this.resize(true);
    });
  }

  // ---------- la finestra: dimensioni, zoom, spostamento ----------
  private resize(fit = false) {
    const r = this.view.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.fitZ = Math.max(this.W / r.width, this.H / r.height);
    if (fit || this.z > this.fitZ) {
      this.z = this.fitZ;
      this.cx = this.W / 2;
      this.cy = this.H / 2;
    }
    this.draw();
  }
  private clampView() {
    const r = this.view.getBoundingClientRect();
    this.z = THREE.MathUtils.clamp(this.z, this.fitZ / 6, this.fitZ);
    const hw = (r.width * this.z) / 2, hh = (r.height * this.z) / 2;
    this.cx = this.W / 2 > hw ? THREE.MathUtils.clamp(this.cx, hw, this.W - hw) : this.W / 2;
    this.cy = this.H / 2 > hh ? THREE.MathUtils.clamp(this.cy, hh, this.H - hh) : this.H / 2;
  }
  /** da un punto dello schermo (relativo alla finestra) a pixel del fondo, e ritorno */
  private toBase(sx: number, sy: number) {
    const r = this.view.getBoundingClientRect();
    return { x: this.cx + (sx - r.width / 2) * this.z, y: this.cy + (sy - r.height / 2) * this.z };
  }
  private toScreen(bx: number, by: number) {
    const r = this.view.getBoundingClientRect();
    return { x: (bx - this.cx) / this.z + r.width / 2, y: (by - this.cy) / this.z + r.height / 2 };
  }
  /** ingrandisce (f < 1) o rimpicciolisce (f > 1) tenendo fermo il punto (sx, sy), o il centro */
  private zoomAt(f: number, sx?: number, sy?: number) {
    const r = this.view.getBoundingClientRect();
    const px = sx ?? r.width / 2, py = sy ?? r.height / 2;
    const before = this.toBase(px, py);
    this.z *= f;
    this.clampView();
    const after = this.toBase(px, py);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
    this.clampView();
    this.draw();
  }
  private centerOnMe() {
    const me = this.where();
    this.z = Math.min(this.z, this.fitZ / 3);
    this.cx = (me.x / S) * this.k;
    this.cy = (me.z / S) * this.k;
    this.clampView();
    this.draw();
  }
  private pointerControls() {
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch = 0;
    const local = (e: PointerEvent) => {
      const r = this.view.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    this.canvas.addEventListener("pointermove", (e) => {
      const p = local(e), prev = pts.get(e.pointerId);
      if (!prev) {
        if (e.pointerType !== "touch") this.hover(p);
        return;
      }
      if (pts.size === 1) {
        this.cx -= (p.x - prev.x) * this.z;
        this.cy -= (p.y - prev.y) * this.z;
        moved += Math.hypot(p.x - prev.x, p.y - prev.y);
        pts.set(e.pointerId, p);
        this.clampView();
        this.draw();
        this.showTip(null);
      } else if (pts.size === 2) {
        pts.set(e.pointerId, p);
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.zoomAt(pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = d;
        moved += 10;
      }
    });
    const up = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      // un tocco senza trascinare: si sceglie il rifugio sotto il dito
      if (p && moved < 6 && pts.size === 0) {
        const hit = this.hitAt(local(e));
        if (hit) {
          this.onLeave();
          this.onPick(hit.place);
        }
      }
    };
    this.canvas.addEventListener("pointerup", up);
    this.canvas.addEventListener("pointercancel", (e) => pts.delete(e.pointerId));
    this.canvas.addEventListener("pointerleave", () => pts.size === 0 && this.showTip(null));
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const p = local(e as unknown as PointerEvent);
        this.zoomAt(Math.pow(1.15, e.deltaY / 100), p.x, p.y);
      },
      { passive: false },
    );
  }

  // ---------- il disegno ----------
  private draw() {
    const base = this.ensureBase();
    const g = this.canvas.getContext("2d")!;
    const r = this.view.getBoundingClientRect();
    if (!r.width) return;
    const dpr = this.canvas.width / r.width;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#e9eedd";
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.imageSmoothingQuality = "high";
    const sw = r.width * this.z, sh = r.height * this.z;
    g.drawImage(base, this.cx - sw / 2, this.cy - sh / 2, sw, sh, 0, 0, this.canvas.width, this.canvas.height);
    // le linee (torrenti, strade, sentieri) disegnate ogni volta alla risoluzione dello schermo: nitide a ogni zoom
    {
      const zz = this.z, k = this.k;
      g.setTransform(dpr / zz, 0, 0, dpr / zz, dpr * (r.width / 2 - this.cx / zz), dpr * (r.height / 2 - this.cy / zz));
      g.save();
      g.beginPath();
      g.rect(0, 0, this.W, this.H); // solo dentro la carta
      g.clip();
      g.lineJoin = g.lineCap = "round";
      const near = (zoom: number) => Math.min(1.6, Math.max(0.7, zoom / 2)); // le linee si allargano un po' da vicino
      const zf = near(this.fitZ / zz);
      const stroke = (pts: [number, number][], width: number, color: string, dash: number[] = []) => {
        g.beginPath();
        pts.forEach(([x, z], i) => (i ? g.lineTo(x * k, z * k) : g.moveTo(x * k, z * k)));
        g.setLineDash(dash.map((d) => d * zz));
        g.lineWidth = width * zz * zf;
        g.strokeStyle = color;
        g.stroke();
      };
      for (const st of this.data.streams) stroke(st.pts, st.r ? 2.4 : 1, "#6fb3d6");
      const roads = this.data.paths.filter((p) => p.k === "r");
      for (const p of roads) stroke(p.pts, 4, "#a39d95");
      for (const p of roads) stroke(p.pts, 2.6, "#ffffff");
      for (const p of this.data.paths) if (p.k !== "r" && !p.m && !p.f) stroke(p.pts, 1.1, "rgba(130, 90, 50, 0.85)", [3, 3]);
      for (const p of this.data.paths) if (p.k !== "r" && p.m) stroke(p.pts, 2, "#d4322c", [7, 4]);
      g.setLineDash([]);
      g.restore();
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = this.k, zoomed = this.fitZ / this.z; // 1 = tutta la valle, 6 = molto vicino
    const S2 = (x: number, z: number) => this.toScreen(x * k, z * k);
    const label = (text: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left") => {
      g.font = font;
      g.textAlign = align;
      g.lineWidth = 3.5;
      g.strokeStyle = "rgba(255, 255, 255, 0.92)";
      g.lineJoin = "round";
      g.strokeText(text, x, y);
      g.fillStyle = color;
      g.fillText(text, x, y);
    };
    // i numeri dei sentieri CAI, quando si è abbastanza vicini
    if (zoomed > 1.8) {
      const placed: { x: number; y: number; ref: string }[] = [];
      for (const p of this.data.paths) {
        if (!p.m || !p.ref || p.pts.length < 2) continue;
        const mid = p.pts[Math.floor(p.pts.length / 2)], s = S2(mid[0], mid[1]);
        if (s.x < 0 || s.y < 0 || s.x > r.width || s.y > r.height) continue;
        if (placed.some((q) => q.ref === p.ref && Math.hypot(q.x - s.x, q.y - s.y) < 140) || placed.some((q) => Math.hypot(q.x - s.x, q.y - s.y) < 28)) continue;
        placed.push({ x: s.x, y: s.y, ref: p.ref });
        g.font = "700 10px system-ui";
        const w = g.measureText(p.ref).width + 8;
        g.fillStyle = "#fff";
        g.strokeStyle = "#d4322c";
        g.lineWidth = 1.5;
        g.beginPath();
        g.roundRect(s.x - w / 2, s.y - 8, w, 15, 4);
        g.fill();
        g.stroke();
        g.fillStyle = "#d4322c";
        g.textAlign = "center";
        g.fillText(p.ref, s.x, s.y + 3);
      }
    }
    // la strada scelta
    const route = this.getRoute();
    if (route) {
      g.strokeStyle = "#ff8a3d";
      g.lineWidth = 5;
      g.lineJoin = g.lineCap = "round";
      g.beginPath();
      route.forEach((p, i) => {
        const s = this.toScreen((p.x / S) * k, (p.z / S) * k);
        if (i) g.lineTo(s.x, s.y);
        else g.moveTo(s.x, s.y);
      });
      g.stroke();
    }
    // le cime con il libro di vetta (e il nome delle più alte)
    for (const pk of this.data.peaks) {
      const summit = SUMMITS.some((n) => pk.name.startsWith(n));
      const ele = (pk as { ele?: number }).ele ?? 0;
      if (!summit && !(zoomed > 2.5 && ele > 2900)) continue;
      const s = S2(pk.p[0], pk.p[1]);
      g.fillStyle = summit ? (state.summits.some((n) => pk.name.startsWith(n)) ? "#c2375a" : "#231a2b") : "#6b6470";
      g.beginPath();
      g.moveTo(s.x, s.y - 6);
      g.lineTo(s.x + 5, s.y + 4);
      g.lineTo(s.x - 5, s.y + 4);
      g.fill();
      if (zoomed > 1.6) label(pk.name, s.x, s.y + 16, "italic 600 10px system-ui", "#4a4350", "center");
    }
    // rifugi, bivacchi, paesi
    this.hits = [];
    for (const h of this.data.huts) {
      if (h.kind === "alpeggio") continue;
      const s = S2(h.p[0], h.p[1]);
      if (s.x < -20 || s.y < -20 || s.x > r.width + 20 || s.y > r.height + 20) continue;
      const stamped = state.stamps.includes(h.name);
      g.beginPath();
      if (h.kind === "bivacco") {
        g.moveTo(s.x, s.y - 6);
        g.lineTo(s.x + 5, s.y);
        g.lineTo(s.x, s.y + 6);
        g.lineTo(s.x - 5, s.y);
        g.closePath();
        g.fillStyle = "#e07d3e";
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = "#fff";
        g.stroke();
      } else if (h.kind === "paese") {
        g.arc(s.x, s.y, 4, 0, Math.PI * 2);
        g.fillStyle = "#3b3550";
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = "#fff";
        g.stroke();
      } else {
        // il rifugio: una casetta
        g.moveTo(s.x - 6, s.y + 5);
        g.lineTo(s.x - 6, s.y - 1);
        g.lineTo(s.x, s.y - 7);
        g.lineTo(s.x + 6, s.y - 1);
        g.lineTo(s.x + 6, s.y + 5);
        g.closePath();
        g.fillStyle = stamped ? "#c2375a" : "#fff";
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = "#c2375a";
        g.stroke();
      }
      this.hits.push({ x: s.x, y: s.y, place: h });
      const name = h.name.replace("Rifugio ", "").replace("Bivacco ", "");
      if (h.kind === "paese") label(h.name, s.x + 8, s.y + 4, "700 12px system-ui", "#231a2b");
      else if (zoomed > 1.6 || stamped) label(name, s.x + 9, s.y + 4, "600 10px system-ui", h.kind === "bivacco" ? "#a8501f" : "#9a2030");
    }
    // le fermate della corriera
    for (const st of this.stops) {
      const p = this.toScreen((st.x / S) * k, (st.z / S) * k);
      if (p.x < -12 || p.y < -12 || p.x > r.width + 12 || p.y > r.height + 12) continue;
      g.fillStyle = "#2d6bd0";
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      g.beginPath();
      g.roundRect(p.x - 6, p.y - 6, 12, 12, 3);
      g.fill();
      g.stroke();
      g.fillStyle = "#fff";
      g.font = "700 8px system-ui";
      g.textAlign = "center";
      g.fillText("B", p.x, p.y + 3);
    }
    // tu
    const me = this.where();
    const s = this.toScreen((me.x / S) * k, (me.z / S) * k);
    g.save();
    g.translate(s.x, s.y);
    g.rotate(-me.heading + Math.PI);
    g.fillStyle = "#f2b632";
    g.strokeStyle = "#231a2b";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -11);
    g.lineTo(7, 8);
    g.lineTo(-7, 8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  private hitAt(p: { x: number; y: number }) {
    let best: (typeof this.hits)[0] | null = null, bd = 18;
    for (const h of this.hits) {
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d < bd) (bd = d), (best = h);
    }
    return best;
  }
  private hover(p: { x: number; y: number }) {
    const hit = this.hitAt(p);
    this.canvas.style.cursor = hit ? "pointer" : "grab";
    this.showTip(hit);
  }
  /** il cartellino del rifugio sotto il mouse: nome, quota, timbro e quanto ci vuole da qui */
  private showTip(hit: { place: Place; x: number; y: number } | null) {
    if (!hit || !this.wrap) {
      this.tip.classList.remove("on");
      this.hovered = null;
      return;
    }
    const p = hit.place;
    if (p !== this.hovered) {
      this.hovered = p;
      const kind = p.kind === "paese" ? "paese" : p.kind === "bivacco" ? "bivacco, sempre aperto" : "rifugio";
      const t = this.estimate(p);
      this.tip.innerHTML = `<b>${p.name}</b><span>${kind}${p.ele ? ` · ${p.ele} m` : ""}${state.stamps.includes(p.name) ? " · timbrato ✓" : ""}</span>${t ? `<span class="t">${t} da qui</span>` : ""}`;
    }
    const w = this.wrap.getBoundingClientRect(), v = this.view.getBoundingClientRect();
    this.tip.style.transform = `translate(${v.left - w.left + hit.x}px, ${v.top - w.top + hit.y}px) translate(-50%, calc(-100% - 12px))`;
    this.tip.classList.add("on");
  }
}
