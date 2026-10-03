// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

// il caricamento avviene quando si importa state.ts: per ogni caso si riparte da capo
const fresh = async () => {
  vi.resetModules();
  return import("../../src/state");
};

describe("caricare la partita", () => {
  beforeEach(() => localStorage.clear());

  it("un salvataggio rotto non blocca il gioco: si riparte, con una copia di riserva", async () => {
    localStorage.setItem("montagna-viva:v1", "{rotto");
    const s = await fresh();
    expect(s.loadProblem).toBe(true);
    expect(s.state.packed).toBe(false);
    const backup = Object.keys(localStorage).find((k) => k.startsWith("montagna-viva:v1:rotto:"));
    expect(backup).toBeTruthy();
    expect(localStorage.getItem(backup!)).toBe("{rotto");
  });

  it("un salvataggio della versione 1 si carica e si aggiorna", async () => {
    localStorage.setItem("montagna-viva:v1", JSON.stringify({ packed: true, carrying: "pane", ometti: 12 }));
    const s = await fresh();
    expect(s.loadProblem).toBe(false);
    expect(s.state.version).toBe(s.SAVE_VERSION);
    expect(s.state.ometti).toBe(12);
    expect(s.state.errand).toBe("pane");
  });

  it("ricomincia da capo cancella anche album e taccuino (ma non nome e impostazioni)", async () => {
    const s = await fresh();
    for (const k of Object.values(s.KEYS)) localStorage.setItem(k, "x");
    s.wipeProgress();
    expect(localStorage.getItem(s.KEYS.state)).toBeNull();
    expect(localStorage.getItem(s.KEYS.album)).toBeNull();
    expect(localStorage.getItem(s.KEYS.notebook)).toBeNull();
    expect(localStorage.getItem(s.KEYS.me)).toBe("x");
    expect(localStorage.getItem(s.KEYS.settings)).toBe("x");
  });
});
