import * as THREE from "three";
import type { Terrain } from "./world";

/**
 * Sfida di corsa in Val di Mello: dalla porta di partenza a San Martino, attraverso i traguardi (colonne di luce che si
 * vedono da lontano), e ritorno. Cronometro, record salvato nel browser.
 */
export type RaceEvent = { kind: "go" | "count" | "checkpoint" | "finish"; n?: number; time?: number; name?: string };

export class Race {
  readonly group = new THREE.Group();
  phase: "idle" | "countdown" | "running" | "done" = "idle";
  time = 0;
  next = 0;
  private count = 0;
  private beams: THREE.Mesh[] = [];
  private rings: THREE.Mesh[] = [];
  readonly start: THREE.Vector3;

  constructor(
    t: Terrain,
    start: THREE.Vector3,
    readonly checkpoints: { pos: THREE.Vector3; name: string }[],
  ) {
    this.start = start;
    const accent = new THREE.MeshStandardMaterial({ color: "#c2375a", roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: "#f4e4de", roughness: 0.6 });
    // porta di partenza: due pali e uno striscione
    const gate = new THREE.Group();
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 8), white);
      p.position.set(s * 3.2, 2.5, 0);
      gate.add(p);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.9, 0.1), accent);
    banner.position.y = 4.6;
    gate.add(banner);
    gate.position.copy(start);
    gate.position.y = t.heightAt(start.x, start.z);
    const first = checkpoints[0].pos;
    gate.rotation.y = Math.atan2(first.x - start.x, first.z - start.z) + Math.PI / 2;
    gate.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.group.add(gate);
    // traguardi: anello verticale + colonna di luce
    const beamMat = new THREE.MeshBasicMaterial({ color: "#ffb08a", transparent: true, opacity: 0.28, depthWrite: false, fog: false });
    for (const cp of checkpoints) {
      const y = t.heightAt(cp.pos.x, cp.pos.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.22, 8, 32), accent);
      ring.position.set(cp.pos.x, y + 3.6, cp.pos.z);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 90, 12, 1, true), beamMat.clone());
      beam.position.set(cp.pos.x, y + 45, cp.pos.z);
      cp.pos.y = y;
      this.rings.push(ring);
      this.beams.push(beam);
      this.group.add(ring, beam);
    }
    this.show(false);
  }

  private show(on: boolean) {
    this.beams.forEach((b, i) => (b.visible = on && i >= this.next));
    this.rings.forEach((r, i) => (r.visible = on && i >= this.next));
  }

  begin() {
    this.phase = "countdown";
    this.count = 3.999;
    this.time = 0;
    this.next = 0;
    this.show(true);
  }

  cancel() {
    this.phase = "idle";
    this.show(false);
  }

  update(dt: number, me: THREE.Vector3, camPos: THREE.Vector3): RaceEvent[] {
    const ev: RaceEvent[] = [];
    // gli anelli si girano verso di te
    this.rings.forEach((r) => (r.rotation.y = Math.atan2(camPos.x - r.position.x, camPos.z - r.position.z)));
    this.beams.forEach((b, i) => ((b.material as THREE.MeshBasicMaterial).opacity = i === this.next ? 0.32 + Math.sin(this.time * 4) * 0.08 : 0.14));
    if (this.phase === "countdown") {
      const before = Math.ceil(this.count);
      this.count -= dt;
      const now = Math.ceil(this.count);
      if (now !== before && now > 0) ev.push({ kind: "count", n: now });
      if (this.count <= 0) {
        this.phase = "running";
        ev.push({ kind: "go" });
      }
    } else if (this.phase === "running") {
      this.time += dt;
      const cp = this.checkpoints[this.next];
      if (Math.hypot(cp.pos.x - me.x, cp.pos.z - me.z) < 6) {
        this.next++;
        this.show(true);
        if (this.next >= this.checkpoints.length) {
          this.phase = "done";
          this.show(false);
          ev.push({ kind: "finish", time: this.time });
        } else ev.push({ kind: "checkpoint", n: this.next, name: cp.name });
      }
    }
    return ev;
  }
}
