// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { empty, state } from "../../src/state";
import { CHAPTERS, TASKS, checkTasks, taskProgress } from "../../src/tasks";

const reset = () => Object.assign(state, empty());

describe("compiti e ometti", () => {
  beforeEach(reset);

  it("ogni compito ha un id unico e un capitolo che esiste", () => {
    const ids = TASKS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of TASKS) expect(CHAPTERS.some((c) => c.id === k.chapter)).toBe(true);
    for (const c of CHAPTERS) expect(TASKS.some((k) => k.chapter === c.id)).toBe(true);
  });

  it("un compito fatto si paga una volta sola", () => {
    state.packed = true;
    expect(checkTasks(true)).toBe(true);
    const after = state.ometti;
    expect(after).toBe(10);
    expect(checkTasks(true)).toBe(false);
    expect(state.ometti).toBe(after);
  });

  it("il progresso non supera l'obiettivo", () => {
    state.litter = ["a", "b", "c", "d", "e", "f", "g"];
    const k = TASKS.find((x) => x.id === "rifiuti")!;
    expect(taskProgress(k)).toBe(5);
  });

  it("un capitolo tutto fatto dà la spilla e il bonus, una volta", () => {
    state.packed = true;
    state.diary = ["segnavia", "tempi"];
    state.shots = 1;
    checkTasks(true);
    expect(state.badges).toContain("primi");
    // 4 compiti da 10 + 20 di bonus
    expect(state.ometti).toBe(60);
    checkTasks(true);
    expect(state.ometti).toBe(60);
  });

  it("una partita nuova non ha compiti fatti", () => {
    expect(checkTasks(true)).toBe(false);
    expect(state.ometti).toBe(0);
  });
});
