import * as THREE from "three";
import { sound } from "../audio";
import { has, learn, save, state } from "../state";
import * as ui from "../ui";
import { S } from "../world";
import type { Interact, World } from "./base";
import { Thirst } from "./thirst";
import type { Valley } from "./valley";

/**
 * Bere: la borraccia (B o il pulsante), le fontane dei paesi, l'acqua chiesta ai rifugi. La sete cresce camminando;
 * con tanta sete il fiato dura meno e il gioco te lo dice, con gentilezza. Vicino a un torrente, con la borraccia vuota,
 * si impara che l'acqua limpida non è per forza buona da bere.
 */
export function setupWater(w: World, v: Valley) {
  const { scene, T, data, hiker } = w;
  const th = new Thirst(state.water, state.thirst);

  // le fontane: una in ogni paese, accanto alla chiesa (vasca di pietra, cannella, acqua che scorre)
  const stone = new THREE.MeshStandardMaterial({ color: "#a9a39a", flatShading: true, roughness: 0.9 });
  const waterMat = new THREE.MeshStandardMaterial({ color: "#5aa6bf", roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 });
  const fountains: THREE.Vector3[] = [];
  for (const p of data.huts.filter((h) => h.kind === "paese")) {
    const x = p.p[0] * S + 4.5, z = p.p[1] * S + 2.5, y = T.heightAt(x, z);
    const g = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.9), stone);
    basin.position.y = 0.3;
    const pool = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.7), waterMat);
    pool.position.y = 0.56;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 0.3), stone);
    post.position.set(-0.6, 0.65, -0.45);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6), new THREE.MeshStandardMaterial({ color: "#5b5650" }));
    spout.rotation.x = Math.PI / 2;
    spout.position.set(-0.6, 1.05, -0.2);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 6), waterMat);
    jet.position.set(-0.6, 0.8, -0.02);
    g.add(basin, pool, post, spout, jet);
    g.position.set(x, y, z);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    scene.add(g);
    fountains.push(new THREE.Vector3(x, y, z));
  }

  const keep = () => {
    state.water = th.water;
    state.thirst = th.dry;
    save();
    ui.setWater(has("acqua") ? th.water : null, th.thirsty);
  };
  function atFountain(where: string) {
    const fill = has("acqua");
    th.fountain(fill);
    hiker.drink();
    sound.gulp();
    keep();
    ui.toast(fill ? `<b>Acqua fresca</b> ${where}: hai bevuto e la borraccia è piena.` : `<b>Acqua fresca</b> ${where}: hai bevuto. Con una borraccia nello zaino potresti portarne con te.`);
    ui.learned(learn("acqua"));
  }
  const drinkable = () => th.dry > 0.1 || (has("acqua") && th.water < 0.99);
  const interacts: Interact[] = [
    ...fountains.map((p) => ({ pos: p, r: 3.5, text: () => (drinkable() ? "Bevi alla fontana" : null), act: () => atFountain("alla fontana") })),
  ];

  let warned = false, nag = 0, prevY = hiker.root.position.y;
  return {
    interacts,
    /** dentro il rifugio: si beve e si riempie la borraccia (senza animazione: sei dentro) */
    refill() {
      th.fountain(has("acqua"));
      sound.gulp();
      keep();
      ui.learned(learn("acqua"));
      return has("acqua") ? "Il custode ti riempie la borraccia d'acqua fresca. Bevi un bel sorso anche tu." : "Il custode ti offre un bicchiere d'acqua fresca. La prossima volta porta una borraccia!";
    },
    get thirsty() {
      return th.thirsty;
    },
    /** un sorso dalla borraccia (B); true se hai bevuto */
    drink() {
      if (!has("acqua")) {
        ui.toast("<b>Non hai la borraccia nello zaino.</b> Puoi bere alle fontane dei paesi e ai rifugi.", "warn");
        return false;
      }
      if (!th.sip()) {
        const nearStream = v.waterDist(hiker.root.position.x, hiker.root.position.z) < 25;
        ui.toast(nearStream ? "<b>La borraccia è vuota.</b> Il torrente è limpido, ma sotto i pascoli l'acqua può non essere buona da bere: meglio una fontana o un rifugio." : "<b>La borraccia è vuota.</b> Riempila a una fontana o a un rifugio.", "warn");
        if (nearStream) ui.learned(learn("torrenti"));
        return false;
      }
      hiker.drink();
      sound.gulp();
      keep();
      ui.toast(`<b>Un sorso</b> ${th.sips ? `nella borraccia ne restano ${th.sips}` : "la borraccia è finita"}`);
      ui.learned(learn("acqua"));
      return true;
    },
    /** ogni fotogramma: la sete che cresce, gli avvisi, il pulsante della borraccia */
    update(dt: number, moving: boolean, running: boolean) {
      // in salita: si guadagna quota (più di 0,3 unità al secondo)
      const y = hiker.root.position.y, uphill = dt > 0 && (y - prevY) / dt > 0.3;
      prevY = y;
      const was = th.thirsty;
      th.tick(dt, moving, running, uphill);
      if (th.thirsty && !was) ui.setWater(has("acqua") ? th.water : null, true);
      if (th.dry < 0.5) warned = false;
      nag -= dt;
      if (th.thirsty && (!warned || (th.dry > 0.95 && nag <= 0))) {
        warned = true;
        nag = 90;
        ui.toast(has("acqua") && th.water > 0.01 ? "<b>Hai sete.</b> Bevi un sorso: <kbd>B</kbd> o il pulsante della borraccia." : "<b>Hai sete.</b> Cerca una fontana in paese o chiedi acqua a un rifugio.", "warn");
      }
      // si salva ogni tanto, non a ogni fotogramma
      if (Math.abs(state.thirst - th.dry) > 0.05) keep();
    },
    /** la sete per le prove (?debug) */
    debug: th,
    fountains,
  };
}
export type Water = ReturnType<typeof setupWater>;
