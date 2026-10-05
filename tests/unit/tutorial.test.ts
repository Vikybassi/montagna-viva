// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { STEPS, TutorialSteps, type Input } from "../../src/game/tutorial";
import { sanitize } from "../../src/state";

const idle: Input = { move: 0, turn: 0, airborne: false, nearMarta: false, talking: false, phone: false };

describe("tutorial", () => {
  it("si fa un passo alla volta, nell'ordine", () => {
    const t = new TutorialSteps();
    t.feed({ ...idle, move: 12 });
    expect(t.step).toBe(1);
    t.feed({ ...idle, turn: 1.2 });
    expect(t.step).toBe(2);
    t.feed({ ...idle, airborne: true });
    expect(t.step).toBe(3);
    t.feed({ ...idle, nearMarta: true });
    expect(t.step).toBe(4);
    t.feed({ ...idle, nearMarta: true, talking: true });
    expect(t.step).toBe(5);
    t.feed({ ...idle, phone: true });
    expect(t.step).toBe(STEPS);
  });
  it("pochi passi non bastano, e un salto non apre il telefono", () => {
    const t = new TutorialSteps();
    t.feed({ ...idle, move: 3 });
    expect(t.step).toBe(0);
    t.feed({ ...idle, move: 3 });
    t.feed({ ...idle, move: 3 });
    t.feed({ ...idle, move: 3 });
    expect(t.step).toBe(1); // 12 in tutto
  });
  it("chi è già al passo 3 riparte da lì", () => {
    const t = new TutorialSteps(3);
    t.feed({ ...idle, nearMarta: true });
    expect(t.step).toBe(4);
  });
  it("i salvataggi di prima non rivedono il tutorial", () => {
    expect(sanitize({ packed: true }).tutorial).toBe(STEPS);
    expect(sanitize({ ometti: 40 }).tutorial).toBe(STEPS);
    expect(sanitize({}).tutorial).toBe(0);
    expect(sanitize({ tutorial: 2 }).tutorial).toBe(2);
    expect(sanitize({ tutorial: 99 }).tutorial).toBe(STEPS);
  });
});
