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
