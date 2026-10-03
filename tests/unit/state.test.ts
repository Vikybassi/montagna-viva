// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { SAVE_VERSION, empty, exportSave, finishMission, importSave, migrate, nextMorning, sanitize, state } from "../../src/state";

describe("salvataggi", () => {
  it("un salvataggio vuoto o strano diventa una partita nuova", () => {
    expect(sanitize(null)).toEqual(empty());
    expect(sanitize("ciao")).toEqual(empty());
    expect(sanitize([1, 2])).toEqual(empty());
  });
  it("i campi del tipo sbagliato tornano al valore iniziale, gli altri restano", () => {
    const s = sanitize({ ometti: "tanti", stamps: ["Rifugio Omio", { x: 1 }], packed: true, battery: 7, outfit: { cappello: 3 } });
    expect(s.ometti).toBe(0);
    expect(s.stamps).toEqual(["Rifugio Omio"]);
    expect(s.packed).toBe(true);
    expect(s.battery).toBe(1);
    expect(s.outfit.cappello).toBe("c-berretto");
    expect(s.outfit.occhiali).toBeNull();
  });
  it("i campi che possono essere vuoti accettano null", () => {
    const s = sanitize({ active: "fauna", carrying: null, bestRun: 312.4 });
    expect(s.active).toBe("fauna");
    expect(s.carrying).toBeNull();
    expect(s.bestRun).toBe(312.4);
  });
  it("un salvataggio della versione 1 si aggiorna (chi porta il pane lo segue come commissione)", () => {
    const s = sanitize(migrate({ carrying: "pane", packed: true }));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.errand).toBe("pane");
  });
  it("esporta e reimporta la stessa partita", () => {
    localStorage.clear();
    // la partita in memoria (quella che si gioca) è quella che si esporta
    Object.assign(state, { ometti: 42, stamps: ["Rifugio Ponti"] });
    const file = exportSave();
    localStorage.clear();
    expect(importSave(file)).toBeNull();
    const back = JSON.parse(localStorage.getItem("montagna-viva:v1")!);
    expect(back.ometti).toBe(42);
    expect(back.stamps).toEqual(["Rifugio Ponti"]);
  });
  it("un file che non è una partita viene rifiutato con un messaggio", () => {
    expect(importSave("non è json")).toMatch(/non si legge/);
    expect(importSave(JSON.stringify({ gioco: "altro" }))).toMatch(/non è una partita/);
  });
});

describe("dormire al rifugio", () => {
  it("si sveglia alle 7:15 del giorno dopo, mai indietro nel tempo", () => {
    expect(nextMorning(21)).toBeCloseTo(24 + 7.25);
    expect(nextMorning(24 * 2 + 20)).toBeCloseTo(24 * 3 + 7.25);
    expect(nextMorning(3)).toBeCloseTo(7.25); // dopo mezzanotte: la stessa mattina
    expect(nextMorning(50)).toBeGreaterThan(50);
  });
});

describe("missioni finite", () => {
  it("una missione già finita non resta quella da seguire (salvataggi di prima)", () => {
    const s = sanitize({ active: "ghiacciaio", missions: { ghiacciaio: "done", fauna: "active" } });
    expect(s.active).toBeNull();
    expect(s.missions.fauna).toBe("active");
  });
  it("finire una missione: la prima volta «completata», poi «rifatta»; in ogni caso non è più in corso", () => {
    Object.assign(state, empty());
    state.active = "corsa";
    state.missions.corsa = "active";
    expect(finishMission("corsa")).toBe(true);
    expect(state.active).toBeNull();
    state.active = "corsa"; // rifatta con Marta
    expect(finishMission("corsa")).toBe(false);
    expect(state.active).toBeNull();
    expect(state.missions.corsa).toBe("done");
  });
});
