import { describe, expect, it } from "vitest";
import { QuestEngine, type Quest } from "../../src/game/quests";

const q = (title: string, done = false): Quest => ({ title, steps: [{ text: "passo", done }] });

describe("motore delle missioni", () => {
  it("senza niente in corso non segue niente", () => {
    const e = new QuestEngine();
    expect(e.pick(true, false).tracked).toBeNull();
  });
  it("il temporale passa davanti a missioni e commissioni", () => {
    const e = new QuestEngine();
    e.add("missione", () => q("Rientro"));
    e.add("commissione", () => q("Pane"));
    e.add("emergenza", () => q("Temporale"));
    const p = e.pick(true, false);
    expect(p.tracked?.title).toBe("Temporale");
    expect(p.trackedKind).toBe("emergenza");
  });
  it("tra commissione e missione vince quella scelta; l'altra resta in pausa", () => {
    const e = new QuestEngine();
    e.add("missione", () => q("Rientro"));
    e.add("commissione", () => q("Pane"));
    expect(e.pick(true, false).tracked?.title).toBe("Pane");
    expect(e.pick(true, false).other).toEqual({ title: "Rientro", kind: "missione" });
    expect(e.pick(false, false).tracked?.title).toBe("Rientro");
    expect(e.pick(false, false).other).toEqual({ title: "Pane", kind: "commissione" });
  });
  it("durante la corsa conta la corsa, anche con una commissione scelta", () => {
    const e = new QuestEngine();
    e.add("missione", () => q("Sfida di corsa"));
    e.add("commissione", () => q("Pane"));
    expect(e.pick(true, true).tracked?.title).toBe("Sfida di corsa");
  });
  it("se c'è solo la commissione, la segue anche senza sceglierla", () => {
    const e = new QuestEngine();
    e.add("missione", () => null);
    e.add("commissione", () => q("Cappello"));
    expect(e.pick(false, false).tracked?.title).toBe("Cappello");
  });
  it("il passo corrente è il primo non fatto", () => {
    const quest: Quest = { title: "x", steps: [{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: false }] };
    expect(QuestEngine.current(quest)?.text).toBe("b");
    expect(QuestEngine.current(null)).toBeNull();
  });
});
