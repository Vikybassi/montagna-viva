/**
 * Il rimbalzello, in HTML sopra la scena: una barra di forza oscilla, la fermi (E, Spazio o tocco) nel punto giusto;
 * più sei precisa più rimbalzi. (La scalata del Sasso Remenno è una vera arrampicata in parete: climb.ts.)
 */
import { sound } from "./audio";
import { pushModal } from "./input";

const host = document.createElement("div");
host.className = "mini";
document.body.appendChild(host);

export let playing = false;

export function skipStone(): Promise<number> {
  playing = true;
  host.innerHTML = `<div class="mini-card"><p class="mini-k">Rimbalzello</p><p class="mini-t">Ferma la forza nel verde</p><div class="meter"><i class="sweet"></i><b></b></div><button type="button" class="mini-btn">Lancia <kbd>E</kbd></button></div>`;
  host.classList.add("on");
  const bar = host.querySelector<HTMLElement>(".meter b")!;
  const t0 = performance.now();
  let v = 0;
  let raf = 0;
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    v = (Math.sin(t * 3.4 - Math.PI / 2) + 1) / 2; // 0..1..0
    bar.style.left = `${v * 100}%`;
    raf = requestAnimationFrame(loop);
  };
  loop();
  return new Promise((res) => {
    const done = () => {
      cancelAnimationFrame(raf);
      off();
      // il punto giusto è tra 0,72 e 0,86: forte ma non troppo
      const acc = Math.max(0, 1 - Math.abs(v - 0.79) / 0.45);
      const skips = Math.max(0, Math.min(12, Math.round(acc ** 1.6 * 11 + (Math.random() - 0.5) * 1.5)));
      host.classList.remove("on");
      playing = false;
      res(skips);
    };
    // il minigioco si prende tutti i tasti finché dura (lo stesso E che l'ha aperto non lo chiude: niente ripetizioni)
    const off = pushModal("rimbalzello", (k, e) => {
      if (e.repeat) return;
      if (k === " " || k === "e" || k === "enter") {
        e.preventDefault();
        done();
      }
    });
    host.querySelector(".mini-btn")!.addEventListener("click", done);
  });
}

/**
 * L'ometto da rimettere in piedi: un sasso oscilla in alto, lo lasci cadere (Spazio, E, clic o tocco) sulla pila.
 * Troppo storto e cade; se la pila pende troppo, crolla. Cinque sassi in equilibrio e l'ometto è di nuovo in piedi.
 * Restituisce true se ce l'hai fatta (tre tentativi), false se rinunci o finiscono i tentativi.
 */
type Stone = { x: number; y: number; w: number; h: number; tilt: number; shape: number[]; color: string };
export function stackCairn(): Promise<boolean> {
  playing = true;
  host.innerHTML = `<div class="mini-card cairn-card"><p class="mini-k">Ometto caduto</p><p class="mini-t">Rimettilo in piedi: cinque sassi in equilibrio</p>
    <canvas width="360" height="400" aria-label="La pila dei sassi"></canvas>
    <p class="cairn-msg">Il sasso oscilla: lascialo cadere quando è sopra la pila.</p>
    <div class="cairn-row"><span class="cairn-lives"></span><span class="cairn-n"></span></div>
    <button type="button" class="mini-btn">Lascia cadere <kbd>Spazio</kbd></button><button type="button" class="mini-quit">Lascia stare <kbd>Esc</kbd></button></div>`;
  host.classList.add("on");
  const cv = host.querySelector("canvas")!, g = cv.getContext("2d")!;
  const msg = host.querySelector<HTMLElement>(".cairn-msg")!, livesEl = host.querySelector<HTMLElement>(".cairn-lives")!, nEl = host.querySelector<HTMLElement>(".cairn-n")!;
  const W = 360, GROUND = 360, GOAL = 5;
  const greys = ["#9d9aa3", "#8a8691", "#b3aeb6", "#7f7b86", "#a6a1a9", "#918c96"];
  /** un sasso: contorno irregolare (raggi su 10 punti), colore di granito */
  const stone = (w: number, h: number): Stone => ({ x: W / 2, y: 0, w, h, tilt: 0, shape: Array.from({ length: 12 }, () => 0.78 + Math.random() * 0.26), color: greys[Math.floor(Math.random() * greys.length)] });
  const base = stone(130, 46);
  base.y = GROUND - base.h / 2;
  let stack: Stone[] = [base];
  const sizes = [[108, 42], [94, 38], [80, 35], [66, 32], [54, 29]];
  let lives = 3, cur = stone(sizes[0][0], sizes[0][1]), t = 0, raf = 0, falling: { s: Stone; vy: number; target: number } | null = null;
  const debris: { s: Stone; vx: number; vy: number; vr: number }[] = [];
  let done = false, last = performance.now();
  const hud = () => {
    livesEl.textContent = `Tentativi: ${"●".repeat(lives)}${"○".repeat(3 - lives)}`;
    nEl.textContent = `Sassi: ${stack.length - 1} / ${GOAL}`;
  };
  hud();

  const draw = (s: Stone) => {
    g.save();
    g.translate(s.x, s.y);
    g.rotate(s.tilt);
    g.beginPath();
    s.shape.forEach((r, i) => {
      const a = (i / s.shape.length) * Math.PI * 2;
      const x = Math.cos(a) * (s.w / 2) * r, y = Math.sin(a) * (s.h / 2) * r;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    // luce dall'alto e ombra in basso: sembra un sasso vero, non un piattino
    const grad = g.createLinearGradient(0, -s.h / 2, 0, s.h / 2);
    grad.addColorStop(0, s.color);
    grad.addColorStop(1, "#4f4a57");
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = "rgba(35,26,43,0.55)";
    g.lineWidth = 2.5;
    g.stroke();
    // qualche puntino di granito
    g.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 5; i++) g.fillRect(((i * 37) % 60) - 30 + s.w * 0.05, ((i * 23) % 14) - 9, 2, 2);
    g.restore();
  };
  const scene = () => {
    // cielo, montagne, la pietraia
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, "#bfe0f2");
    sky.addColorStop(1, "#eaf3ec");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, 400);
    g.fillStyle = "#b8b0c2";
    g.beginPath();
    g.moveTo(0, 250);
    [[60, 170], [110, 215], [175, 130], [240, 205], [300, 160], [360, 225]].forEach(([x, y]) => g.lineTo(x, y));
    g.lineTo(360, 400);
    g.lineTo(0, 400);
    g.fill();
    g.fillStyle = "#f4f6f8";
    g.beginPath();
    g.moveTo(160, 148);
    g.lineTo(175, 130);
    g.lineTo(192, 150);
    g.fill();
    g.fillStyle = "#a3a08f";
    g.fillRect(0, GROUND, W, 40);
    // il segnavia bianco e rosso su un sasso: l'ometto serve a questo
    g.fillStyle = "#8a8691";
    g.beginPath();
    g.ellipse(46, GROUND - 6, 26, 14, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.fillRect(34, GROUND - 14, 24, 5);
    g.fillStyle = "#d22a2a";
    g.fillRect(34, GROUND - 9, 24, 5);
  };
  const top = () => stack[stack.length - 1];
  const say = (s: string) => (msg.innerHTML = s);

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    scene();
    for (const s of stack) draw(s);
    if (!falling && !done) {
      // il sasso oscilla sopra la pila, sempre più veloce
      const speed = 1.5 + (stack.length - 1) * 0.35;
      cur.x = W / 2 + Math.sin(t * speed) * 118;
      cur.y = 54;
      // la "mano" che lo tiene
      g.strokeStyle = "rgba(35,26,43,0.4)";
      g.setLineDash([4, 5]);
      g.beginPath();
      g.moveTo(cur.x, 0);
      g.lineTo(cur.x, cur.y - cur.h / 2);
      g.stroke();
      g.setLineDash([]);
      draw(cur);
    }
    if (falling) {
      falling.vy += 1400 * dt;
      falling.s.y = Math.min(falling.target, falling.s.y + falling.vy * dt);
      draw(falling.s);
      if (falling.s.y >= falling.target) land();
    }
    for (const d of debris) {
      d.vy += 1400 * dt;
      d.s.x += d.vx * dt;
      d.s.y += d.vy * dt;
      d.s.tilt += d.vr * dt;
      draw(d.s);
    }
    for (let i = debris.length - 1; i >= 0; i--) if (debris[i].s.y > 460) debris.splice(i, 1);
    raf = requestAnimationFrame(loop);
  };

  const fail = (why: string) => {
    lives--;
    hud();
    if (lives <= 0) {
      say(`${why} Niente da fare: riprova più tardi.`);
      done = true;
      setTimeout(() => finish(false), 1600);
    } else say(`${why} Riprova!`);
  };
  const land = () => {
    const s = falling!.s, below = top();
    falling = null;
    const off = s.x - below.x;
    if (Math.abs(off) > below.w * 0.5) {
      // troppo storto: scivola giù di lato
      debris.push({ s, vx: Math.sign(off) * 160, vy: -120, vr: Math.sign(off) * 4 });
      fail("Troppo storto: il sasso è scivolato giù.");
      cur = stone(s.w, s.h);
      return;
    }
    s.tilt = (off / below.w) * 0.25;
    stack.push(s);
    // equilibrio: il baricentro dei sassi sopra la base deve stare sopra la base
    const upper = stack.slice(1);
    const mass = upper.reduce((a, x) => a + x.w * x.h, 0);
    const com = upper.reduce((a, x) => a + x.x * x.w * x.h, 0) / mass;
    if (Math.abs(com - base.x) > base.w * 0.36) {
      // la pila crolla: tutto giù, tranne il sasso di base
      for (const u of upper) debris.push({ s: u, vx: Math.sign(com - base.x) * (80 + Math.random() * 120), vy: -60 - Math.random() * 80, vr: (Math.random() - 0.5) * 6 });
      stack = [base];
      cur = stone(sizes[0][0], sizes[0][1]);
      fail("La pila pendeva troppo ed è crollata.");
      return;
    }
    sound.step("rock");
    const n = stack.length - 1;
    hud();
    if (n >= GOAL) {
      done = true;
      say("<b>L'ometto è di nuovo in piedi!</b> Chi passa di qui ritroverà il sentiero.");
      sound.ui("done");
      setTimeout(() => finish(true), 1800);
      return;
    }
    say(Math.abs(off) < 7 ? "<b>Perfetto!</b> Proprio al centro." : Math.abs(off) < below.w * 0.25 ? "Bene, regge." : "Uff, un po' storto… attenta all'equilibrio.");
    cur = stone(sizes[n][0], sizes[n][1]);
  };
  const drop = () => {
    if (falling || done) return;
    const below = top();
    const s = { ...cur };
    falling = { s, vy: 0, target: below.y - below.h / 2 - s.h / 2 + 3 };
    sound.ui("blip");
  };

  // prove automatiche (?debug): dove sono il sasso che oscilla e la cima della pila
  if (location.search.includes("debug")) Object.assign(window, { __cairn: { x: () => cur.x, top: () => top().x, busy: () => !!falling } });
  let finish: (ok: boolean) => void = () => {};
  return new Promise((res) => {
    let off = () => {};
    finish = (ok) => {
      cancelAnimationFrame(raf);
      off();
      host.classList.remove("on");
      playing = false;
      res(ok);
    };
    // un livello sopra tutti: Spazio ed Esc qui non fanno anche saltare, aprire la pausa o ripartire con un altro ometto
    off = pushModal("ometto", (k, e) => {
      if (e.repeat) return;
      if (k === " " || k === "e" || k === "enter") e.preventDefault(), drop();
      else if (k === "escape") e.preventDefault(), finish(false);
    });
    cv.addEventListener("pointerdown", drop);
    host.querySelector(".mini-btn")!.addEventListener("click", drop);
    host.querySelector(".mini-quit")!.addEventListener("click", () => finish(false));
    raf = requestAnimationFrame(loop);
  });
}
