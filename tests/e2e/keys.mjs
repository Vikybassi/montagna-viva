// La tastiera a livelli: ogni tasto lo usa una cosa sola (dialogo, telefono, pausa, mondo)
import { check, openGame, until, wait } from "./lib.mjs";

export default async function keys(browser) {
  const { page, errors } = await openGame(browser, { t: 10 });
  const layer = () => page.evaluate(() => window.__mv.layer());
  const dialogOn = () => page.evaluate(() => !!document.querySelector(".dialog.on, .dlg.on"));
  // da Marta: E apre il dialogo, 1 sceglie la prima missione, E chiude le sue spiegazioni…
  await page.evaluate(() => {
    const m = window.__mv.marta;
    window.__mv.tp(m.x + 2, m.z + 2);
  });
  check(await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("Marta")), "vicino a Marta compare «Parla con Marta»");
  await page.keyboard.press("e");
  check(await until(page, () => window.__mv.layer() === "dialogo"), `E da Marta apre un dialogo (livello: ${await layer()})`);
  check(await until(page, () => document.querySelectorAll(".dlg.on .opt").length > 1), `Marta propone le missioni (a schermo: «${(await page.evaluate(() => document.querySelector(".dlg")?.textContent ?? "")).slice(0, 120)}»)`);
  await page.keyboard.press("1");
  const ok = await until(page, () => window.__mv.state.active === "rientro" && window.__mv.layer() === "dialogo", null, 40000);
  const seen = await page.evaluate(() => ({ active: window.__mv.state.active, layer: window.__mv.layer(), dlg: (document.querySelector(".dlg")?.textContent ?? "").slice(0, 120) }));
  check(ok, `dopo la scelta Marta spiega la missione (missione: ${seen.active}, livello: ${seen.layer}, a schermo: «${seen.dlg}»)`);
  await page.keyboard.press("e");
  await until(page, () => window.__mv.layer() !== "dialogo", null, 5000);
  // qualche fotogramma in più: se lo stesso E riaprisse Marta, si vedrebbe adesso
  await wait(1500);
  // …e lo stesso E non deve riaprire subito il dialogo con Marta (prima succedeva)
  check((await layer()) === "mondo", `E chiude la spiegazione senza riaprire Marta (livello: ${await layer()})`);
  check(await page.evaluate(() => window.__mv.state.active === "rientro"), "la missione scelta è il rientro");

  // col telefono aperto Spazio non fa saltare, e Esc chiude solo il telefono
  await page.keyboard.press("Tab");
  check(await until(page, () => window.__mv.layer() === "telefono"), "Tab apre il telefono");
  const y0 = await page.evaluate(() => window.__mv.me.y);
  await page.keyboard.press(" ");
  await wait(300);
  check(Math.abs((await page.evaluate(() => window.__mv.me.y)) - y0) < 0.05, "Spazio col telefono aperto non fa saltare");
  await page.keyboard.press("Escape");
  await until(page, () => window.__mv.layer() !== "telefono", null, 5000);
  await wait(500);
  check((await layer()) === "mondo", "Esc chiude il telefono e non apre la pausa");

  // pausa: Esc la apre e la richiude, senza riaprirla
  await page.keyboard.press("Escape");
  check(await until(page, () => window.__mv.layer() === "pannello"), "Esc apre la pausa");
  await page.keyboard.press("Escape");
  await until(page, () => window.__mv.layer() !== "pannello", null, 5000);
  await wait(500);
  check((await layer()) === "mondo", "Esc richiude la pausa (e non la riapre)");
  check(!(await dialogOn()), "nessun dialogo rimasto aperto");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
