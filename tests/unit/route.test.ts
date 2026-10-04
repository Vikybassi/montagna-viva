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

import * as THREE from "three";
import { Router } from "../../src/route";
import { S } from "../../src/world";

// una valle finta: sentieri in metri (x verso est, z verso sud), quota da una funzione
const valley = (paths: [number, number][][], ele: (x: number, z: number) => number = () => 1000) => {
  const T = { heightAt: (x: number, z: number) => ele(x / S, z / S) * S };
  const data = { paths: paths.map((pts) => ({ pts })) };
  return { router: new Router(T as never, data as never), at: (x: number, z: number) => new THREE.Vector3(x * S, ele(x, z) * S, z * S) };
};

describe("la strada più rapida (Router)", () => {
  it("trova la strada lungo i sentieri e ne dà i tempi da cartello", () => {
    const { router, at } = valley([[[0, 0], [0, -2000]]]);
    const r = router.route(at(0, 0), at(0, -2000))!;
    expect(r).not.toBeNull();
    expect(r.km).toBeCloseTo(2, 2);
    expect(r.hours).toBeCloseTo(0.5, 2); // 2 km in piano a 4 km/h
  });

  it("preferisce il giro in piano alla scorciatoia che sale e scende 600 m", () => {
    // diretta: 2 km con una gobba alta 600 m in mezzo; giro: 3 km in piano
    const hill = (x: number, z: number) => 1000 + (Math.abs(x) < 1 && z < -500 && z > -1500 ? 600 : 0);
    const { router, at } = valley(
      [
        [[0, 0], [0, -1000], [0, -2000]],
        [[0, 0], [500, -500], [500, -1500], [0, -2000]],
      ],
      hill,
    );
    const r = router.route(at(0, 0), at(0, -2000))!;
    expect(r.pts.some((p) => p.x / S > 400)).toBe(true);
  });

  it("al bivio dice da che parte andare (andando verso nord, est è a destra)", () => {
    const paths: [number, number][][] = [
      [[0, 0], [0, -1000]],
      [[0, -1000], [1000, -1000]],
      [[0, -1000], [-1000, -1000]],
    ];
    const { router, at } = valley(paths);
    expect(router.route(at(0, 0), at(1000, -1000))!.turns.map((t) => t.side)).toEqual(["destra"]);
    expect(router.route(at(0, 0), at(-1000, -1000))!.turns.map((t) => t.side)).toEqual(["sinistra"]);
  });

  it("senza un sentiero vicino non inventa strade", () => {
    const { router, at } = valley([[[0, 0], [0, -1000]]]);
    expect(router.route(at(5000, 5000), at(0, -1000))).toBeNull();
  });

  it("i sentieri con un piccolo buco nella mappa (meno di 15 m) si collegano", () => {
    const { router, at } = valley([[[0, 0], [0, -1000]], [[0, -1010], [0, -2000]]]);
    expect(router.route(at(0, 0), at(0, -2000))).not.toBeNull();
  });
});

describe("indicazioni ai bivi", () => {
  it("se si prosegue dritti e l'altro sentiero gira, non si disturba", () => {
    const { router, at } = (() => {
      const T = { heightAt: () => 1000 * S };
      const data = { paths: [{ pts: [[0, 0], [0, -1000], [0, -2000]] }, { pts: [[0, -1000], [1000, -1000]] }] };
      return { router: new Router(T as never, data as never), at: (x: number, z: number) => new THREE.Vector3(x * S, 1000 * S, z * S) };
    })();
    expect(router.route(at(0, 0), at(0, -2000))!.turns).toEqual([]);
    expect(router.route(at(0, 0), at(1000, -1000))!.turns.map((t) => t.side)).toEqual(["destra"]);
  });
});
