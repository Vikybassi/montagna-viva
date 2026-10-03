import * as THREE from "three";
import { SUMMITS } from "./content";
import { state } from "./state";
import { S, type Cover, type Place, type Terrain, type WorldData } from "./world";

/**
 * La mappa della valle (nel telefono, tasto M): rilievo ombreggiato con boschi, ghiacciai e laghi, i sentieri, i rifugi (pieni se
 * hai il timbro), le cime con il libro di vetta, dove sei e dove guardi. Cliccando un rifugio si sceglie cosa fare
 * (farsi indicare la strada, o andarci subito se hai il timbro): la strada scelta si vede in arancio.
 */
export class ValleyMap {
  private base: HTMLCanvasElement;
  private canvas: HTMLCanvasElement;
  private hint: HTMLParagraphElement;
  private legend: HTMLParagraphElement;
  private tip: HTMLDivElement;
  private wrap: HTMLElement | null = null;
  private hovered: Place | null = null;
  /** prima di scegliere un rifugio: chi mostra la mappa si chiude (il telefono) */
  onLeave: () => void = () => {};
  /** tempo di cammino da qui (per il cartellino al passaggio del mouse) */
  estimate: (p: Place) => string | null = () => null;
  private hits: { x: number; y: number; place: Place }[] = [];

  constructor(
    private t: Terrain,
    private data: WorldData,
    cover: Cover,
    private onPick: (p: Place) => void,
    private where: () => { x: number; z: number; heading: number; hours: number; storm: boolean },
    private getRoute: () => THREE.Vector3[] | null,
  ) {
    const { cols, rows } = t.meta;
    const W = cols * 2, H = rows * 2;
    this.base = document.createElement("canvas");
    this.base.width = W;
    this.base.height = H;
    const g = this.base.getContext("2d")!;
    const img = g.createImageData(W, H);
    const col = new THREE.Color(), tmp = new THREE.Color();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const gx = (x / (W - 1)) * t.width, gz = (y / (H - 1)) * t.depth;
        const h = t.heightAt(gx, gz) / S;
        const e = t.cell;
        const dx = (t.heightAt(gx + e, gz) - t.heightAt(gx - e, gz)) / (2 * e), dz = (t.heightAt(gx, gz + e) - t.heightAt(gx, gz - e)) / (2 * e);
        const shade = THREE.MathUtils.clamp(0.75 - dx * 0.9 + dz * 0.9, 0.25, 1.15);
        col.set("#a9c27e").lerp(tmp.set("#d7cfa6"), THREE.MathUtils.smoothstep(h, 1500, 2300));
        col.lerp(tmp.set("#b3a7ad"), THREE.MathUtils.smoothstep(h, 2300, 2700));
        col.lerp(tmp.set("#5f8a55"), cover.at(cover.forest, gx, gz) * 0.85);
        col.lerp(tmp.set("#eef4f8"), cover.at(cover.glacier, gx, gz));
        col.lerp(tmp.set("#5fa0b8"), cover.at(cover.water, gx, gz));
        const i = (y * W + x) * 4;
        img.data[i] = Math.min(255, col.r * 255 * shade);
        img.data[i + 1] = Math.min(255, col.g * 255 * shade);
        img.data[i + 2] = Math.min(255, col.b * 255 * shade);
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    // sentieri
    g.strokeStyle = "rgba(160, 40, 50, 0.55)";
    g.lineWidth = 1;
    const k = W / (t.width / S);
    for (const p of data.paths) {
      g.beginPath();
      p.pts.forEach(([x, z], i) => (i ? g.lineTo(x * k, z * k) : g.moveTo(x * k, z * k)));
      g.stroke();
    }

    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.addEventListener("click", (e) => this.click(e));
    this.canvas.addEventListener("pointermove", (e) => this.hover(e));
    this.canvas.addEventListener("pointerleave", () => this.showTip(null));
    this.tip = document.createElement("div");
    this.tip.className = "map-tip";
    this.hint = document.createElement("p");
    this.hint.className = "map-hint";
    this.legend = document.createElement("p");
    this.legend.className = "map-legend";
    this.legend.innerHTML = `<span class="me">▲ tu</span><span class="r1">● rifugio timbrato</span><span class="r0">○ rifugio</span><span class="bv">◆ bivacco</span><span class="pk">▲ libro di vetta</span>`;
  }

  /** mostra la mappa dentro `el` (lo schermo del telefono), aggiornata */
  showIn(el: HTMLElement) {
    const touch = matchMedia("(pointer: coarse)").matches ? "Tocca" : "Clicca";
    this.hint.innerHTML = this.where().storm
      ? `<b>Temporale!</b> ${touch} il rifugio più vicino: ti indico la strada per metterti al riparo.`
      : `${touch} un rifugio: ti indico la strada sui sentieri (o ci vai subito, se hai già il timbro).`;
    el.replaceChildren(this.hint, this.canvas, this.legend, this.tip);
    this.wrap = el;
    this.showTip(null);
    this.draw();
  }

  private draw() {
    const g = this.canvas.getContext("2d")!;
    const W = this.canvas.width, k = W / (this.t.width / S);
    g.drawImage(this.base, 0, 0);
    this.hits = [];
    g.font = "600 13px system-ui";
    for (const h of this.data.huts) {
      if (h.kind === "alpeggio") continue;
      const x = h.p[0] * k, y = h.p[1] * k;
      const stamped = state.stamps.includes(h.name);
      g.beginPath();
      if (h.kind === "bivacco") {
        // i bivacchi: rombi arancioni (ripari sempre aperti, utili col temporale)
        g.moveTo(x, y - 6);
        g.lineTo(x + 5, y);
        g.lineTo(x, y + 6);
        g.lineTo(x - 5, y);
        g.closePath();
        g.fillStyle = "#e07d3e";
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = "#fff";
        g.stroke();
        this.hits.push({ x, y, place: h });
        continue;
      }
      g.arc(x, y, h.kind === "paese" ? 4 : 6, 0, Math.PI * 2);
      g.fillStyle = h.kind === "paese" ? "#3b3550" : stamped ? "#c2375a" : "#fff";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = h.kind === "paese" ? "#fff" : "#c2375a";
      g.stroke();
      this.hits.push({ x, y, place: h });
      if (h.kind === "paese" || stamped) {
        g.fillStyle = "#231a2b";
        g.fillText(h.name.replace("Rifugio ", ""), x + 8, y + 4);
      }
    }
    for (const name of SUMMITS) {
      const pk = this.data.peaks.find((p) => p.name.startsWith(name));
      if (!pk) continue;
      const x = pk.p[0] * k, y = pk.p[1] * k;
      g.fillStyle = state.summits.includes(name) ? "#c2375a" : "#231a2b";
      g.beginPath();
      g.moveTo(x, y - 6);
      g.lineTo(x + 5, y + 4);
      g.lineTo(x - 5, y + 4);
      g.fill();
    }
    // la strada scelta
    const route = this.getRoute();
    if (route) {
      g.strokeStyle = "#ff8a3d";
      g.lineWidth = 5;
      g.lineJoin = g.lineCap = "round";
      g.beginPath();
      route.forEach((p, i) => (i ? g.lineTo((p.x / S) * k, (p.z / S) * k) : g.moveTo((p.x / S) * k, (p.z / S) * k)));
      g.stroke();
    }
    // tu
    const me = this.where();
    const x = (me.x / S) * k, y = (me.z / S) * k;
    g.save();
    g.translate(x, y);
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

  /**
   * dal punto sullo schermo al punto sulla mappa. La mappa sta "dentro" il riquadro senza deformarsi (object-fit:
   * contain), con margini ai lati: prima il clic non ne teneva conto e poteva prendere il rifugio sbagliato.
   */
  private toMap(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect(), W = this.canvas.width, H = this.canvas.height;
    const s = Math.min(r.width / W, r.height / H), ox = r.left + (r.width - W * s) / 2, oy = r.top + (r.height - H * s) / 2;
    return { x: (e.clientX - ox) / s, y: (e.clientY - oy) / s, s, ox, oy };
  }
  private hitAt(e: MouseEvent) {
    const m = this.toMap(e);
    let best: (typeof this.hits)[0] | null = null, bd = 16 / Math.min(1, m.s); // almeno 16 pixel sullo schermo
    for (const h of this.hits) {
      const d = Math.hypot(h.x - m.x, h.y - m.y);
      if (d < bd) (bd = d), (best = h);
    }
    return best ? { ...best, sx: m.ox + best.x * m.s, sy: m.oy + best.y * m.s } : null;
  }
  private hover(e: PointerEvent) {
    if (e.pointerType === "touch") return;
    const hit = this.hitAt(e);
    this.canvas.style.cursor = hit ? "pointer" : "default";
    this.showTip(hit);
  }
  /** il cartellino del rifugio sotto il mouse: nome, quota, timbro e quanto ci vuole da qui */
  private showTip(hit: { place: Place; sx: number; sy: number } | null) {
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
    const w = this.wrap.getBoundingClientRect();
    this.tip.style.transform = `translate(${hit.sx - w.left}px, ${hit.sy - w.top}px) translate(-50%, calc(-100% - 12px))`;
    this.tip.classList.add("on");
  }

  private async click(e: MouseEvent) {
    const hit = this.hitAt(e);
    if (!hit) return;
    this.onLeave();
    this.onPick(hit.place);
  }
}
