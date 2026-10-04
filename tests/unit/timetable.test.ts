import { describe, expect, it } from "vitest";
import { nextDeparture, rideMinutes } from "../../src/game/timetable";

describe("orario della corriera", () => {
  it("una corsa ogni mezz'ora, dalle 7 alle 19", () => {
    expect(nextDeparture(10).depart).toBe(10);
    expect(nextDeparture(10.01).depart).toBe(10.5);
    expect(nextDeparture(10.5).depart).toBe(10.5);
    expect(nextDeparture(18.6).depart).toBe(19);
  });
  it("prima delle 7 si aspetta la prima corsa", () => {
    expect(nextDeparture(5).depart).toBe(7);
  });
  it("dopo l'ultima corsa non ce ne sono più, e la prima è domani alle 7", () => {
    const r = nextDeparture(19.2);
    expect(r.depart).toBeNull();
    expect(r.tomorrow).toBe(24 + 7);
  });
  it("vale anche dal secondo giorno in poi (ore oltre le 24)", () => {
    expect(nextDeparture(24 + 10.2).depart).toBe(24 + 10.5);
    expect(nextDeparture(24 + 20).depart).toBeNull();
    expect(nextDeparture(24 + 20).tomorrow).toBe(48 + 7);
    expect(nextDeparture(24 + 3).depart).toBe(24 + 7);
  });
  it("i minuti di viaggio crescono con la distanza, e mai meno di 5", () => {
    expect(rideMinutes(100)).toBe(5);
    expect(rideMinutes(3000)).toBe(Math.round((3000 * 1.4) / 1000 / 30 * 60));
    expect(rideMinutes(9000)).toBeGreaterThan(rideMinutes(3000));
  });
});
