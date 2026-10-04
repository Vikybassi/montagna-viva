import { describe, expect, it } from "vitest";
import { SIP, THIRSTY, Thirst } from "../../src/game/thirst";

describe("sete e borraccia", () => {
  it("camminando la sete arriva in qualche minuto, correndo prima, da ferma quasi mai", () => {
    const walk = new Thirst(), run = new Thirst(), still = new Thirst();
    for (let i = 0; i < 60 * 9; i++) walk.tick(1, true, false, false), run.tick(1, true, true, false), still.tick(1, false, false, false);
    expect(walk.thirsty).toBe(true);
    expect(run.dry).toBe(1);
    expect(still.thirsty).toBe(false);
    const a = new Thirst();
    for (let i = 0; i < 60 * 3; i++) a.tick(1, true, false, true);
    const b = new Thirst();
    for (let i = 0; i < 60 * 3; i++) b.tick(1, true, false, false);
    expect(a.dry).toBeGreaterThan(b.dry); // in salita di più
  });
  it("un sorso toglie gran parte della sete e un settimo di borraccia", () => {
    const t = new Thirst(1, 0.9);
    expect(t.sip()).toBe(true);
    expect(t.dry).toBeLessThan(THIRSTY);
    expect(t.water).toBeCloseTo(1 - SIP, 5);
    expect(t.sips).toBe(6);
  });
  it("sette sorsi e la borraccia è vuota", () => {
    const t = new Thirst(1, 1);
    for (let i = 0; i < 7; i++) expect(t.sip()).toBe(true);
    expect(t.sip()).toBe(false);
    expect(t.water).toBe(0);
  });
  it("alla fontana si beve e, con la borraccia, la si riempie", () => {
    const t = new Thirst(0, 1);
    t.fountain(false);
    expect(t.dry).toBe(0);
    expect(t.water).toBe(0);
    t.fountain(true);
    expect(t.water).toBe(1);
  });
});
