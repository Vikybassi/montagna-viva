/**
 * La sete e la borraccia, senza grafica (si prova da sola): la sete cresce camminando (di più correndo e in salita),
 * un sorso la toglie in buona parte e svuota un po' la borraccia; fontane e rifugi la riempiono.
 * Niente sconfitte: con tanta sete il fiato dura meno, e il gioco lo dice.
 */
export const SIP = 1 / 7; // una borraccia: sette sorsi
export const THIRSTY = 0.7;

export class Thirst {
  constructor(public water = 1, public dry = 0) {}

  /** `moving`/`running`: come ti muovi; `uphill`: se sali */
  tick(dt: number, moving: boolean, running: boolean, uphill: boolean) {
    // a passo normale la sete arriva in circa 8 minuti; correndo in 3; da ferma quasi non cresce
    const rate = !moving ? 1 / 3000 : running ? 1 / 240 : 1 / 700;
    this.dry = Math.min(1, this.dry + rate * (uphill ? 1.4 : 1) * dt);
  }
  get thirsty() {
    return this.dry >= THIRSTY;
  }
  /** un sorso dalla borraccia; false se è vuota */
  sip() {
    if (this.water < 0.01) return false;
    this.water = Math.max(0, this.water - SIP);
    if (this.water < 1e-6) this.water = 0; // niente residui di arrotondamento: sette sorsi e basta
    this.dry = Math.max(0, this.dry - 0.55);
    return true;
  }
  /** quanti sorsi restano */
  get sips() {
    return Math.round(this.water / SIP);
  }
  /** alla fontana: si beve quanto si vuole e si riempie la borraccia */
  fountain(fill: boolean) {
    this.dry = 0;
    if (fill) this.water = 1;
  }
}
