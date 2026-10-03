import { describe, expect, it } from "vitest";
import { Obstacles, rayBox, type Box } from "../../src/collide";

const house = (rot = 0): Box => ({ kind: "box", x: 100, z: 50, hw: 3.5, hd: 2.25, rot, y0: 0, y1: 6 });

describe("ostacoli", () => {
  it("chi entra in una casa viene spinto fuori dal lato più vicino", () => {
    const o = new Obstacles();
    o.add(house());
    // poco dentro il muro a est (x = 103,5): esce a est, a un raggio dal muro
    const p = o.push(103.2, 50, 1, 0.35);
    expect(p.x).toBeCloseTo(103.85, 5);
    expect(p.z).toBeCloseTo(50, 5);
  });

  it("vale anche per le case ruotate", () => {
    const o = new Obstacles();
    const rot = Math.PI / 3;
    o.add(house(rot));
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const p = o.push(100 + Math.cos(a) * 2, 50 + Math.sin(a) * 2, 1, 0.35);
      // nel sistema della casa, il punto sta fuori dalla scatola allargata del raggio
      const dx = p.x - 100, dz = p.z - 50, c = Math.cos(rot), s = Math.sin(rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const out = Math.abs(lx) >= 3.5 + 0.35 - 1e-6 || Math.abs(lz) >= 2.25 + 0.35 - 1e-6;
      const corner = Math.hypot(Math.max(0, Math.abs(lx) - 3.5), Math.max(0, Math.abs(lz) - 2.25)) >= 0.35 - 1e-6;
      expect(out || corner).toBe(true);
    }
  });

  it("fuori dalla casa non si viene spostati", () => {
    const o = new Obstacles();
    o.add(house());
    expect(o.push(110, 50, 1, 0.35)).toEqual({ x: 110, z: 50, stuck: false });
  });

  it("sopra il tetto (in volo) non si tocca nulla", () => {
    const o = new Obstacles();
    o.add(house());
    expect(o.push(100, 50, 7, 0.35)).toEqual({ x: 100, z: 50, stuck: false });
  });

  it("i tronchi spingono fuori, ma solo quelli disegnati", () => {
    const o = new Obstacles();
    let drawn = true;
    o.add({ kind: "circle", x: 0, z: 0, r: 0.3, y0: -1, y1: 3, live: () => drawn });
    const p = o.push(0.2, 0, 0, 0.35);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.65, 5);
    drawn = false;
    expect(o.push(0.2, 0, 0, 0.35)).toEqual({ x: 0.2, z: 0, stuck: false });
  });

  it("tra due tronchi vicini: se il varco è largo ci passi, se è stretto il passo non si fa", () => {
    const o = new Obstacles();
    o.add({ kind: "circle", x: 0, z: 0, r: 0.3, y0: -1, y1: 3 });
    o.add({ kind: "circle", x: 1.6, z: 0, r: 0.3, y0: -1, y1: 3 });
    const p = o.push(0.5, 0.05, 0, 0.35);
    expect(p.stuck).toBe(false);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(0.65 - 1e-3);
    expect(Math.hypot(p.x - 1.6, p.z)).toBeGreaterThanOrEqual(0.65 - 1e-3);
    const narrow = new Obstacles();
    narrow.add({ kind: "circle", x: 0, z: 0, r: 0.3, y0: -1, y1: 3 });
    narrow.add({ kind: "circle", x: 1.2, z: 0, r: 0.3, y0: -1, y1: 3 });
    expect(narrow.push(0.6, 0.05, 0, 0.35).stuck).toBe(true);
  });

  it("il raggio della telecamera si ferma al muro", () => {
    const b = house();
    // da 10 m a ovest verso est, all'altezza di 2 m: il muro ovest è a x = 96,5
    expect(rayBox({ x: 90, y: 2, z: 50 }, { x: 1, y: 0, z: 0 }, b)).toBeCloseTo(6.5, 5);
    // sopra il tetto passa
    expect(rayBox({ x: 90, y: 8, z: 50 }, { x: 1, y: 0, z: 0 }, b)).toBeNull();
    const o = new Obstacles();
    o.add(b);
    expect(o.cast({ x: 90, y: 2, z: 50 }, { x: 1, y: 0, z: 0 }, 20)).toBeCloseTo(6.5, 5);
    expect(o.cast({ x: 90, y: 2, z: 50 }, { x: 1, y: 0, z: 0 }, 5)).toBeNull();
    // lontano (oltre una cella della griglia) la trova lo stesso
    expect(o.cast({ x: 40, y: 2, z: 50 }, { x: 1, y: 0, z: 0 }, 80)).toBeCloseTo(56.5, 5);
  });
});
