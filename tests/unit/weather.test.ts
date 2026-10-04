import { describe, expect, it } from "vitest";
import { Weather } from "../../src/weather";

const cam = { x: 0, y: 0, z: 0 } as never;
let s = 1;
const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

// il temporale del pomeriggio: nuvole, temporale per un'ora e mezza, poi sereno
describe("temporale del pomeriggio", () => {
  it("la mattina è sereno", () => {
    const w = new Weather(rng);
    w.update(0.016, 10, cam);
    expect(w.phase).toBe("clear");
  });
  it("arriva tra le 15:30 e le 16:30 e dura un'ora e mezza", () => {
    const w = new Weather(rng);
    w.update(0.016, 12, cam);
    const end = w.endsAt;
    expect(end - 1.5).toBeGreaterThanOrEqual(15.5);
    expect(end - 1.5).toBeLessThanOrEqual(16.5);
    const ev = w.update(0.016, end - 0.5, cam);
    expect(w.phase).toBe("storm");
    expect(ev).toContain("start");
    const after = w.update(0.016, end + 0.1, cam);
    expect(w.phase).toBe("clear");
    expect(after).toContain("end");
  });
  it("con lo stesso seme tutti hanno il temporale alla stessa ora", () => {
    const a = new Weather(rng), b = new Weather(rng);
    a.setSeed(42);
    b.setSeed(42);
    a.update(0.016, 30, cam);
    b.update(0.016, 30, cam);
    expect(a.endsAt).toBe(b.endsAt);
  });
});

// l'orologio salta: dormire al rifugio, «Vai subito», aspettare che passi
describe("salti dell'orologio", () => {
  const storming = () => {
    const w = new Weather(rng);
    w.setSeed(7);
    w.update(0.016, 12, cam);
    const end = w.endsAt;
    w.update(0.016, end - 0.5, cam);
    expect(w.phase).toBe("storm");
    return { w, end };
  };
  it("saltando oltre tutto il temporale non succede niente", () => {
    const w = new Weather(rng);
    w.update(0.016, 12, cam);
    expect(w.update(0.016, 20, cam)).toEqual([]);
    expect(w.phase).toBe("clear");
  });
  it("aspettando al riparo fino alla fine: finisce adesso (arcobaleno possibile)", () => {
    const { w, end } = storming();
    expect(w.update(0.016, end + 0.08, cam)).toContain("end");
  });
  it("dormendo durante il temporale: la mattina dopo è passato, senza arcobaleno", () => {
    const { w } = storming();
    const ev = w.update(0.016, 24 + 7.25, cam);
    expect(ev).toContain("passed");
    expect(ev).not.toContain("end");
    expect(w.phase).toBe("clear");
  });
  it("dal temporale di oggi a quello di domani: prima passa quello vecchio, poi inizia il nuovo", () => {
    const { w } = storming();
    // l'ora del temporale di domani (ogni giorno è un po' diversa)
    const probe = new Weather(rng);
    probe.setSeed(7);
    probe.update(0.016, 24 + 12, cam);
    const ev = w.update(0.016, probe.endsAt - 0.5, cam);
    expect(ev).toEqual(["passed", "start"]);
    expect(w.phase).toBe("storm");
    expect(w.endsAt).toBeGreaterThan(24);
  });
});

describe("luce del giorno", () => {
  it("conta anche i giorni dopo il primo", async () => {
    const { isDaylight } = await import("../../src/game/base");
    expect(isDaylight(12)).toBe(true);
    expect(isDaylight(20)).toBe(false);
    expect(isDaylight(24 + 2)).toBe(false); // le 2 di notte del secondo giorno
    expect(isDaylight(24 + 7.25)).toBe(true); // la mattina dopo al rifugio
    expect(isDaylight(48 + 19.6)).toBe(false);
  });
});
