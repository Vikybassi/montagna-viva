import { describe, expect, it } from "vitest";
import { cai } from "../../src/route";

// i tempi dei cartelli CAI: 4 km/h in piano, 300 m/h in salita, 500 m/h in discesa; si somma il maggiore e metà del minore
describe("tempi di cammino (cai)", () => {
  it("in piano conta solo la distanza", () => {
    expect(cai(4000, 0)).toBeCloseTo(1, 5);
  });
  it("in salita ripida conta soprattutto il dislivello", () => {
    // 1 km e 300 m di salita: 1 h per la salita + metà dei 15 minuti di distanza
    expect(cai(1000, 300)).toBeCloseTo(1 + 0.25 / 2, 5);
  });
  it("in discesa si va più veloci che in salita", () => {
    expect(cai(1000, -300)).toBeLessThan(cai(1000, 300));
  });
  it("non è mai negativo", () => {
    expect(cai(0, 0)).toBe(0);
    expect(cai(10, -1000)).toBeGreaterThan(0);
  });
});
