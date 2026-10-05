import { sound } from "../audio";
import { save, state } from "../state";
import * as ui from "../ui";
import type { World } from "./base";

/**
 * Il tutorial nei primi minuti, dentro il gioco: sei piccoli passi (muoversi, guardarsi intorno, saltare, andare da Marta,
 * parlarle, aprire il telefono). Ogni passo si completa facendolo, con un attimo di festa; si può saltare. Chi ha già una
 * partita non lo rivede (i salvataggi di prima valgono come già fatto).
 */
export const STEPS = 6;
export type Input = { move: number; turn: number; airborne: boolean; nearMarta: boolean; talking: boolean; phone: boolean };

/** quanti passi ha fatto chi è al passo `step`, dopo aver visto `input` (cumulativo: `acc` tiene i totali) */
export class TutorialSteps {
  step: number;
  private acc = { move: 0, turn: 0, jumped: false };
  constructor(step = 0) {
    this.step = step;
  }
  feed(i: Input) {
    this.acc.move += i.move;
    this.acc.turn += Math.abs(i.turn);
    if (i.airborne) this.acc.jumped = true;
    const done = [
      () => this.acc.move >= 10, // qualche passo
      () => this.acc.turn >= 1.0, // una buona occhiata intorno
      () => this.acc.jumped,
      () => i.nearMarta,
      () => i.talking && i.nearMarta,
      () => i.phone,
    ];
    let advanced = false;
    // se hai già fatto il passo dopo senza che te lo chiedessi (sei andata subito da Marta), si salta avanti
    while (this.step < STEPS && done[this.step]()) {
      this.step++;
      advanced = true;
      if (this.step < STEPS && this.step <= 2) break; // i passi a eventi si fanno uno alla volta
    }
    return advanced;
  }
}

const touch = () => matchMedia("(pointer: coarse)").matches;
const TEXT = (n: number) => [
  touch() ? "Per camminare trascina il dito a sinistra" : "Cammina con <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> o le frecce",
  touch() ? "Per guardarti intorno trascina il dito a destra" : "Guardati intorno: trascina col mouse, oppure <kbd>Q</kbd> e <kbd>R</kbd>",
  touch() ? "Tocca «Salta / Vola» per saltare" : "Salta con <kbd>Spazio</kbd>",
  "Vai da Marta, la guida: segui il segnaposto giallo",
  touch() ? "Tocca «Parla con Marta» per parlarle" : "Premi <kbd>E</kbd> per parlare con Marta",
  touch() ? "Tocca il telefonino in basso a destra: missioni, mappa, foto e zaino" : "Apri il telefono con <kbd>Tab</kbd> (o dal telefonino in basso a destra)",
][n];

export function setupTutorial(w: World, getYaw: () => number, marta: { x: number; z: number }) {
  const { hiker } = w;
  const steps = new TutorialSteps(state.tutorial);
  let lastYaw = getYaw(), lastPos = hiker.root.position.clone(), shown = -1, talked = false, phoneBase = ui.phoneOpens;
  const finish = (skipped: boolean) => {
    steps.step = STEPS;
    state.tutorial = STEPS;
    if (!skipped) {
      state.ometti += 5;
      ui.toast("<b>Ora sai muoverti!</b> +5 ometti per il tutorial.", "now");
      sound.ui("done");
    }
    save();
    ui.setTutorial(null);
  };
  ui.tools.onSkipTutorial = () => finish(true);
  return {
    get active() {
      return steps.step < STEPS;
    },
    update(dt: number) {
      if (steps.step >= STEPS) return;
      const me = hiker.root.position, y = getYaw();
      const dy = Math.atan2(Math.sin(y - lastYaw), Math.cos(y - lastYaw));
      const moved = Math.hypot(me.x - lastPos.x, me.z - lastPos.z);
      lastYaw = y;
      lastPos.copy(me);
      const near = Math.hypot(me.x - marta.x, me.z - marta.z) < 8;
      if (ui.busy && near) talked = true;
      // il telefono vale solo dopo aver parlato con Marta (prima si apre per caso): si contano le aperture da allora
      if (!talked) phoneBase = ui.phoneOpens;
      const before = steps.step;
      // gli spostamenti improvvisi (il teletrasporto delle prove, un viaggio) non contano come passi
      const feedMove = moved < 3 * Math.max(dt, 0.016) * 20 ? moved : 0;
      steps.feed({ move: ui.busy ? 0 : feedMove, turn: ui.busy ? 0 : dy, airborne: hiker.airborne, nearMarta: near, talking: talked, phone: talked && ui.phoneOpens > phoneBase });
      if (steps.step !== before) {
        state.tutorial = steps.step;
        save();
        sound.ui("pick");
        shown = -1;
        if (steps.step >= STEPS) return void finish(false);
        ui.tutorialStepDone();
      }
      if (shown !== steps.step) {
        shown = steps.step;
        ui.setTutorial({ step: steps.step, total: STEPS, html: TEXT(steps.step) });
      }
      ui.showTutorial(!ui.busy);
    },
  };
}
export type Tutorial = ReturnType<typeof setupTutorial>;
