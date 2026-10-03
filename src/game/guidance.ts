import * as THREE from "three";
import { state } from "../state";
import * as ui from "../ui";
import { S } from "../world";
import type { World } from "./base";
import type { Climbing } from "./climbing";
import { QuestEngine } from "./quests";
import type { Routes } from "./routes";

/**
 * Dove andare: il motore delle missioni sceglie cosa seguire, e da lì il riquadro con i passi, l'obiettivo in alto con
 * la freccia, il segnaposto nel mondo (colonna di luce e rombo, con nome e distanza) e la strada arancione automatica.
 */
export function setupGuidance(w: World, engine: QuestEngine, routes: Routes, climbing: Climbing, racing: () => boolean) {
  const { c, scene, T, hiker } = w;
  // segnaposto: colonna di luce e rombo che gira sopra il punto da raggiungere, con nome e distanza
  const marker = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 140, 10, 1, true), new THREE.MeshBasicMaterial({ color: "#f2b632", transparent: true, opacity: 0.22, depthWrite: false, fog: false }));
  beam.position.y = 70;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), new THREE.MeshBasicMaterial({ color: "#f2b632" }));
  gem.position.y = 9;
  marker.add(beam, gem);
  marker.visible = false;
  scene.add(marker);
  const markerLabel = document.createElement("div");
  markerLabel.className = "waypoint";
  document.getElementById("labels")!.appendChild(markerLabel);

  return {
    update(dt: number) {
      const me = hiker.root.position;
      const { tracked: q, other } = engine.pick(state.followErrand, racing());
      const cur = QuestEngine.current(q);
      ui.setQuest(q ? q.title : null, q ? q.steps.map((st) => ({ text: st.text, done: st.done, current: st === cur })) : [], other);
      const guide = routes.guide;
      const tgt = guide ? { pos: guide.pts[Math.min(guide.pts.length - 1, guide.idx + 2)], name: guide.dest.name } : cur?.pos ? { pos: cur.pos, name: cur.name ?? "" } : null;
      const goalText = guide ? routes.directions(me) : cur ? cur.text : q ? null : "Esplora la valle · parla con Marta per una missione";
      const ac = climbing.active();
      // in parete l'obiettivo è la cima (la catena, sul Remenno)
      ui.setGoal(ac ? climbing.goal(ac) : goalText);
      if (tgt && !ac) {
        const ang = Math.atan2(tgt.pos.x - me.x, tgt.pos.z - me.z) - (c.getYaw() + Math.PI);
        // con una strada scelta la distanza è già nell'indicazione ("tra 300 m, al bivio…")
        ui.pointGoal(-Math.atan2(Math.sin(ang), Math.cos(ang)), guide ? null : Math.hypot(tgt.pos.x - me.x, tgt.pos.z - me.z) / S);
      } else ui.pointGoal(null, null);
      // segnaposto e strada automatica verso il punto del passo corrente (se non stai seguendo una strada scelta da te)
      const mpos = guide || ac ? null : cur?.pos ?? null; // in parete niente segnaposto davanti alla roccia
      marker.visible = !!mpos;
      if (mpos) {
        marker.position.set(mpos.x, T.heightAt(mpos.x, mpos.z), mpos.z);
        gem.rotation.y += dt * 1.5;
        gem.position.y = 9 + Math.sin(performance.now() / 400) * 0.6;
        const d = Math.hypot(mpos.x - me.x, mpos.z - me.z);
        const v = new THREE.Vector3(mpos.x, marker.position.y + 12, mpos.z).project(c.camera);
        const on = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && d > 12;
        markerLabel.style.opacity = on ? "1" : "0";
        if (on) {
          markerLabel.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
          markerLabel.innerHTML = `<b>${cur?.name ?? ""}</b><span>${d / S < 1000 ? `${Math.round(d / S / 10) * 10} m` : `${(d / S / 1000).toFixed(1).replace(".", ",")} km`}</span>`;
        }
      } else markerLabel.style.opacity = "0";
      const key = mpos ? `${state.active}:${q?.steps.indexOf(cur!)}:${Math.round(mpos.x / 20)},${Math.round(mpos.z / 20)}` : "";
      routes.followMission(mpos, key, dt);
    },
  };
}
