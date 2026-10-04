// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { compass, visiblePeaks } from "../../src/game/panorama";
import { S } from "../../src/world";

// una valle piatta a 1000 m (in unità di gioco: metri × S), con cime a nord (3000 m) e a est (2800 m)
const flat = (extra: (x: number, z: number) => number = () => 0) => (x: number, z: number) => 1000 * S + extra(x, z);
const eye = { x: 1000, y: 1000 * S + 1.7, z: 1000 };
const peaks = [
  { name: "Cima Nord", ele: 3000, p: [1000 / S, (1000 - 2000) / S] as [number, number] },
  { name: "Cima Est", ele: 2800, p: [(1000 + 1500) / S, 1000 / S] as [number, number] },
  { name: "Cima Sotto i Piedi", ele: 1100, p: [1000 / S, 1000 / S] as [number, number] },
];

describe("panorama", () => {
  it("riconosce le cime in vista, con direzione e quota", () => {
    const r = visiblePeaks(flat(), eye, peaks);
    expect(r.map((s) => s.name)).toEqual(["Cima Nord", "Cima Est"]); // in ordine di direzione (da nord, in senso orario)
    expect(r[0].dir).toBe("nord");
    expect(r[1].dir).toBe("est");
    expect(r[0].ele).toBe(3000);
  });
  it("una cresta in mezzo nasconde la cima", () => {
    // un muro alto 600 m tra te e la Cima Nord (z tra 400 e 600 unità a nord)
    const wall = (x: number, z: number) => (z > 300 && z < 500 ? 600 * S : 0);
    const r = visiblePeaks(flat(wall), eye, peaks);
    expect(r.map((s) => s.name)).toEqual(["Cima Est"]);
  });
  it("tra due cime nella stessa direzione ne tiene una sola (la più alta all'orizzonte)", () => {
    const two = [...peaks, { name: "Cima Nord Bassa", ele: 2000, p: [1000 / S, (1000 - 2200) / S] as [number, number] }];
    const r = visiblePeaks(flat(), eye, two);
    expect(r.filter((s) => s.dir === "nord")).toHaveLength(1);
    expect(r.find((s) => s.dir === "nord")!.name).toBe("Cima Nord");
  });
  it("le direzioni in italiano", () => {
    expect([0, 45, 90, 180, 270, 315, 359].map(compass)).toEqual(["nord", "nord-est", "est", "sud", "ovest", "nord-ovest", "nord"]);
  });
});
