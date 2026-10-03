import * as THREE from "three";
import { sound } from "./audio";
import { Hiker } from "./player";
import { learn, save, state } from "./state";
import * as ui from "./ui";
import type { Terrain } from "./world";

/**
 * Gli incontri lungo i sentieri: persone con una piccola richiesta. Ognuna insegna una cosa vera della montagna, senza
 * prediche: un escursionista smarrito da accompagnare, una turista in infradito, il pane da portare al rifugio, il
 * cappello volato via a un bambino. Quando li aiuti, il libretto delle missioni ti paga in ometti (tasks.ts).
 */
type Label = { el: HTMLElement; pos: THREE.Vector3 };
type Interact = { pos: THREE.Vector3; r: number; text: () => string | null; act: () => void };
export type EncounterCtx = {
  t: Terrain;
  scene: THREE.Scene;
  hiker: Hiker;
  /** posti del gioco (paesi e rifugi), già sul terreno */
  places: { remenno: THREE.Vector3 | null; martino: THREE.Vector3; filorera: THREE.Vector3 | null; bagni: THREE.Vector3 | null; omio: THREE.Vector3 };
  addLabel: (name: string, sub: string, x: number, z: number, lift: number, range: number, cls: string) => Label;
};
export const ENCOUNTERS = [
  { id: "luca", name: "Luca, escursionista", task: "Accompagna Luca a San Martino", how: "Si è perso vicino al Sasso Remenno: fallo camminare con te fino al paese." },
  { id: "giorgia", name: "Giorgia, turista", task: "Un consiglio a Giorgia", how: "A Bagni di Masino vuole salire all'Omio… in infradito." },
  { id: "pane", name: "Rosa, panettiera", task: "Il pane per il rifugio", how: "Rosa, a San Martino, ha una pagnotta per Giulio all'Omio." },
  { id: "cappello", name: "Tommaso", task: "Il cappello di Tommaso", how: "A Filorera il vento ha portato via il cappello di un bambino." },
] as const;

export function buildEncounters(c: EncounterCtx) {
  const { t, scene, hiker } = c;
  const done = (id: string) => state.encounters.includes(id);
  const finish = (id: string) => {
    if (!done(id)) state.encounters.push(id);
    if (state.errand === id) state.errand = null;
    save();
    sound.ui("done");
  };
  const ground = (v: THREE.Vector3) => v.setY(t.heightAt(v.x, v.z));
  const near = (p: THREE.Vector3, dx: number, dz: number) => ground(p.clone().add(new THREE.Vector3(dx, 0, dz)));
  const crowd: Hiker[] = [];
  const person = (look: ConstructorParameters<typeof Hiker>[0], pos: THREE.Vector3, name: string, sub: string, scale = 1) => {
    const h = new Hiker(look);
    crowd.push(h);
    h.root.position.copy(pos);
    h.root.scale.setScalar(scale);
    scene.add(h.root);
    ui.avatar(name, look ?? {});
    const label = c.addLabel(name, sub, pos.x, pos.z, 2.6 * scale, 90, "npc help");
    return { h, label };
  };
  const setSub = (l: Label, name: string, sub: string, help: boolean) => {
    l.el.innerHTML = `<b>${name}</b>${sub ? `<span>${sub}</span>` : ""}`;
    l.el.classList.toggle("help", help);
  };
  const face = (h: Hiker) => {
    const me = hiker.root.position, p = h.root.position;
    h.heading = Math.atan2(me.x - p.x, me.z - p.z);
    h.root.rotation.y = h.heading;
  };
  // salvataggi di prima: se porti già qualcosa, è la commissione da seguire
  if (state.carrying && !state.errand) state.errand = state.carrying;
  const interacts: Interact[] = [];
  /** accettata una commissione: è quella che segui adesso (obiettivo in alto, segnaposto, strada arancione) */
  const take = (id: string) => {
    state.errand = id;
    state.followErrand = true;
    save();
  };
  const still = new THREE.Vector2();

  // ---------- 1. Luca, smarrito vicino al Sasso Remenno: ti segue fino a San Martino ----------
  const lucaStart = near(c.places.remenno ?? c.places.martino, 42, -38);
  const luca = person({ jacket: "#6a8fc0", hat: "#3b3550", pack: "#e07d3e", hair: "#c9a440" }, lucaStart, "Luca", done("luca") ? "" : "ha bisogno di aiuto");
  let following = false, waitWarned = false, stuck = 0;
  luca.h.groundFn = (x, z) => hiker.groundFn?.(x, z) ?? null; // non attraversa il Sasso Remenno (né i blocchi)
  if (done("luca")) luca.h.root.position.copy(near(c.places.martino, 14, -6));
  interacts.push({
    pos: luca.h.root.position, r: 6,
    text: () => (done("luca") ? "Saluta Luca" : "Parla con Luca"),
    act: async () => {
      face(luca.h);
      if (done("luca")) return void ui.say("Luca, escursionista", "Ce l'ho fatta a prendere il bus grazie a te! La prossima volta scarico la cartina prima di partire, e porto una batteria in più.");
      if (following) return void ui.say("Luca, escursionista", "Ti seguo! Vai pure, ma non troppo veloce: San Martino è giù in fondo alla valle.");
      const i = await ui.say("Luca, escursionista", "Scusa… mi sono perso. Seguivo il sentiero sul telefono, ma qui non c'è campo e la batteria è quasi finita. Devo tornare a San Martino per il bus: mi accompagni?", ["Certo, seguimi!", "Adesso non posso"]);
      if (i !== 0) return;
      following = true;
      take("luca");
      setSub(luca.label, "Luca", "ti segue", false);
      ui.toast("<b>Luca ti segue.</b> Portalo a San Martino: non correre troppo, e aspettalo se resta indietro.");
    },
  });

  // ---------- 2. Giorgia, in infradito a Bagni di Masino ----------
  if (c.places.bagni) {
    const g = person({ jacket: "#f2b632", hat: "#e05a8f", pack: "#e9dcc0", hair: "#3a2a20" }, near(c.places.bagni, 12, 8), "Giorgia", done("giorgia") ? "" : "ha bisogno di un consiglio");
    interacts.push({
      pos: g.h.root.position, r: 6,
      text: () => (done("giorgia") ? "Saluta Giorgia" : "Parla con Giorgia"),
      act: async () => {
        face(g.h);
        if (done("giorgia")) return void ui.say("Giorgia, turista", "Scarpe da trekking ai piedi e giacca nello zaino: adesso sì che salgo tranquilla. Ci vediamo all'Omio!");
        for (;;) {
          const i = await ui.say("Giorgia, turista", "Ciao! Salgo al Rifugio Omio. Sono in infradito, ma tanto è un sentiero, no? Che dici?", ["Vai pure, è facile", "Torna a cambiarti: servono scarpe da escursione", "Vai, ma corri così fai prima"]);
          if (i === 1) break;
          await ui.say("Giorgia, turista", i === 0 ? "Mmm… ma lassù ci sono sassi e radici, magari bagnati. E se mi storco una caviglia a due ore dal paese?" : "Correre in infradito sui sassi? Mi sa che non è un buon consiglio…");
        }
        await ui.say("Giorgia, turista", "Hai ragione: torno all'auto e metto le scarpe da trekking. E prendo anche la giacca, che lassù fa fresco. Grazie!");
        ui.learned(learn("zaino"));
        finish("giorgia");
        setSub(g.label, "Giorgia", "", false);
      },
    });
  }

  // ---------- 3. Il pane di Rosa per Giulio, all'Omio ----------
  const rosa = person({ jacket: "#e9dcc0", hat: "#ffffff", pack: "#c2375a", hair: "#8a5a3a" }, near(c.places.martino, -10, 34), "Rosa", done("pane") ? "panettiera" : "ha una commissione");
  interacts.push({
    pos: rosa.h.root.position, r: 6,
    text: () => (done("pane") ? "Saluta Rosa" : "Parla con Rosa"),
    act: async () => {
      face(rosa.h);
      if (done("pane")) return void ui.say("Rosa, panettiera", "Giulio mi ha scritto che il pane è arrivato ancora croccante. Grazie! Quando ripassi di qui, una fetta di torta è tua.");
      if (state.carrying === "pane") {
        // hai già il pane: Rosa ti ricorda dove portarlo
        await ui.say("Rosa, panettiera", "Il pane è nello zaino, ben avvolto. Giulio è al Rifugio Omio, sopra Bagni di Masino: segui l'indicazione in alto e la strada arancione. Salendo bevi, e non correre: il pane non scappa!");
        return;
      }
      if (state.carrying) {
        await ui.say("Rosa, panettiera", "Vedo che hai già le mani occupate! Torna quando hai finito.");
        return;
      }
      const i = await ui.say("Rosa, panettiera", "Ciao! Ogni settimana mando il pane fresco a Giulio, al Rifugio Omio, ma oggi nessuno sale. Ai rifugi quasi tutto arriva a spalla o con l'elicottero… me lo porti tu?", ["Sì, lo porto io", "Un'altra volta"]);
      if (i !== 0) return;
      state.carrying = "pane";
      take("pane");
      setSub(rosa.label, "Rosa", "panettiera", false);
      ui.toast("<b>Hai il pane nello zaino.</b> Portalo a Giulio, al Rifugio Omio (2104 m): segui l'indicazione in alto.");
      sound.ui("pick");
    },
  });

  // ---------- 4. Il cappello di Tommaso, a Filorera ----------
  let hatMesh: THREE.Group | null = null;
  if (c.places.filorera) {
    const kid = person({ jacket: "#e07d3e", hat: "#f4e4de", pack: "#2f8f8a", hair: "#3a2a20" }, near(c.places.filorera, 10, -12), "Tommaso", done("cappello") ? "" : "ha perso qualcosa", 0.7);
    // il cappello: rosso, appeso a un cespuglio un po' più su, che dondola e luccica
    hatMesh = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: "#d8433a", flatShading: true });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), red);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 12), red);
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: "#4f7a3c", flatShading: true }));
    bush.position.y = -0.5;
    hatMesh.add(cap, brim, bush);
    hatMesh.position.copy(near(c.places.filorera, 58, -64));
    hatMesh.position.y += 1.1;
    hatMesh.visible = !done("cappello") && state.carrying !== "cappello";
    scene.add(hatMesh);
    const hatSpot = hatMesh.position;
    interacts.push({
      pos: hatSpot, r: 5,
      text: () => (hatMesh?.visible ? "Prendi il cappello" : null),
      act: () => {
        if (state.carrying) return void ui.toast("Hai già le mani occupate: prima consegna quello che porti.");
        hatMesh!.visible = false;
        state.carrying = "cappello";
        save();
        sound.ui("pick");
        ui.toast("<b>Il cappello di Tommaso!</b> Riportaglielo.");
      },
    });
    interacts.push({
      pos: kid.h.root.position, r: 6,
      text: () => (done("cappello") ? "Saluta Tommaso" : "Parla con Tommaso"),
      act: async () => {
        face(kid.h);
        if (done("cappello")) return void ui.say("Tommaso", "Guarda, adesso lo tengo legato sotto il mento! Così il vento non me lo porta più via.");
        if (state.carrying === "cappello") {
          await ui.say("Tommaso", "Il mio cappello! Grazie! La mamma dice che in montagna il cappello serve sempre: il sole qui brucia anche se fa fresco.");
          state.carrying = null;
          finish("cappello");
          setSub(kid.label, "Tommaso", "", false);
          return;
        }
        await ui.say("Tommaso", "Il vento mi ha portato via il cappello rosso! È volato su, verso il bosco… lo vedi?");
        take("cappello");
        ui.toast("Cerca il cappello rosso su un cespuglio: segui l'indicazione in alto.");
      },
    });
  }

  const kidPos = c.places.filorera ? near(c.places.filorera, 10, -12) : null;
  return {
    interacts,
    /** la commissione in corso, come una missione: titolo e passi con il punto da raggiungere */
    errandQuest(giulio: THREE.Vector3) {
      const e = state.errand;
      if (e === "pane" && state.carrying === "pane")
        return { title: "Il pane per il rifugio", steps: [{ text: "Ritira il pane da Rosa", done: true }, { text: "Portalo a Giulio, al Rifugio Omio (E per consegnarlo)", done: false, pos: giulio, name: "Giulio · Rifugio Omio" }] };
      if (e === "cappello" && hatMesh && kidPos) {
        const got = state.carrying === "cappello";
        return { title: "Il cappello di Tommaso", steps: [{ text: "Trova il cappello rosso su un cespuglio, più su verso il bosco", done: got, pos: got ? null : hatMesh.position, name: "Cappello" }, { text: "Riportalo a Tommaso (E)", done: false, pos: got ? kidPos : null, name: "Tommaso" }] };
      }
      if (e === "luca" && following)
        return { title: "Accompagna Luca", steps: [{ text: "Cammina fino a San Martino: Luca ti segue (aspettalo se resta indietro)", done: false, pos: c.places.martino, name: "San Martino" }] };
      return null;
    },
    /** a ogni fotogramma: Luca che ti segue, il cappello che dondola */
    update(dt: number) {
      for (const h of crowd) if (h !== luca.h) h.update(dt, still, false, t);
      if (hatMesh?.visible) hatMesh.children[0].rotation.y += dt * 1.5;
      const p = luca.h.root.position, me = hiker.root.position;
      if (following) {
        const d = Math.hypot(me.x - p.x, me.z - p.z);
        const mv = d > 3.2 && d < 70 ? new THREE.Vector2(me.x - p.x, me.z - p.z).normalize() : still;
        const before = p.clone();
        luca.h.update(dt, mv, d > 12, t);
        // incastrato (contro una roccia, in un fosso)? dopo qualche secondo ti raggiunge da un'altra parte
        stuck = d > 12 && d < 70 && before.distanceTo(p) < dt * 1.5 ? stuck + dt : 0;
        if (stuck > 4) {
          stuck = 0;
          const back = new THREE.Vector3(Math.sin(hiker.heading), 0, Math.cos(hiker.heading)).multiplyScalar(-5);
          p.copy(me).add(back);
          p.y = t.heightAt(p.x, p.z);
        }
        if (d >= 70 && !waitWarned) {
          waitWarned = true;
          ui.toast("<b>Luca:</b> «Aspettami! Non ti vedo più…»", "warn");
        }
        if (d < 30) waitWarned = false;
        if (Math.hypot(p.x - c.places.martino.x, p.z - c.places.martino.z) < 45) {
          following = false;
          face(luca.h);
          void ui.say("Luca, escursionista", "Eccoci a San Martino, grazie! La prossima volta porto anche una cartina di carta: il telefono si scarica, e in valle spesso non c'è campo.").then(() => {
            ui.learned(learn("segnavia"));
            finish("luca");
            setSub(luca.label, "Luca", "", false);
          });
        }
      } else luca.h.update(dt, still, false, t);
      luca.label.pos.set(p.x, p.y + 2.6, p.z);
    },
    /** da Giulio all'Omio: se porti il pane di Rosa, prima di tutto glielo dai */
    async deliver(to: "omio") {
      if (to !== "omio" || state.carrying !== "pane") return false;
      await ui.say("Giulio, custode", "Il pane di Rosa! Grazie, quassù è oro: ogni cosa che mangi al rifugio l'ha portata su qualcuno, a spalla o in elicottero. Per questo si riportano giù i propri rifiuti.");
      ui.learned(learn("rifiuti"));
      state.carrying = null;
      finish("pane");
      return true;
    },
  };
}
