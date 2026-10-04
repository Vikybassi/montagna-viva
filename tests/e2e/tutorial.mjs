// Il tutorial: una partita nuova lo mostra e si completa facendo le cose; chi ha già una partita non lo vede
import { check, openGame, until, wait } from "./lib.mjs";

const card = (page) => page.evaluate(() => ({ on: document.querySelector(".tutorial")?.classList.contains("on"), t: document.querySelector(".tut-t")?.textContent ?? "", cur: [...document.querySelectorAll(".tut-dots i")].findIndex((x) => x.classList.contains("cur")) }));

export default async function tutorial(browser) {
  // chi ha già una partita: niente tutorial
  let { page } = await openGame(browser, { t: 10 });
  await wait(1200);
  check(!(await card(page)).on, "con una partita già avviata non c'è il tutorial");
  await page.close();

  let errors;
  ({ page, errors } = await openGame(browser, { save: null, t: 10 }));
  await until(page, () => document.querySelector(".tutorial.on"));
  let c = await card(page);
  check(c.on && c.t.includes("Cammina") && c.cur === 0, `all'inizio: «${c.t}»`);
  await page.keyboard.down("w");
  check(await until(page, () => document.querySelector(".tut-dots i.cur") && [...document.querySelectorAll(".tut-dots i")].findIndex((x) => x.classList.contains("cur")) === 1, null, 15000), "camminando si passa a «guardati intorno»");
  await page.keyboard.up("w");
  await page.keyboard.down("q");
  check(await until(page, () => [...document.querySelectorAll(".tut-dots i")].findIndex((x) => x.classList.contains("cur")) === 2, null, 15000), "girando la visuale si passa a «salta»");
  await page.keyboard.up("q");
  await page.keyboard.press(" ");
  // si parte vicino a Marta: dopo il salto il passo «vai da Marta» è già fatto e tocca a «premi E»
  check(await until(page, () => [...document.querySelectorAll(".tut-dots i")].findIndex((x) => x.classList.contains("cur")) >= 3, null, 8000), "saltando si passa a «vai da Marta» (o oltre)");
  await page.evaluate(() => { const m = window.__mv.marta; window.__mv.tp(m.x + 2.5, m.z + 2.5); });
  check(await until(page, () => [...document.querySelectorAll(".tut-dots i")].findIndex((x) => x.classList.contains("cur")) === 4), "vicino a Marta si passa a «premi E»");
  await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("Marta"));
  await page.keyboard.press("e");
  await until(page, () => window.__mv.layer() === "dialogo");
  // chiude i dialoghi di Marta (zaino compreso): sull'ultima opzione («Voglio solo camminare»), o su «Chiudi lo zaino e parti»
  for (let i = 0; i < 12 && (await page.evaluate(() => window.__mv.busy())); i++) {
    await page.evaluate(() => {
      const panel = [...document.querySelectorAll(".panel.on button")].find((x) => /parti|chiudi/i.test(x.textContent));
      if (panel) return panel.click();
      const opts = document.querySelectorAll(".dlg.on .opt");
      if (opts.length) opts[opts.length - 1].click();
    });
    await wait(600);
  }
  await until(page, () => !window.__mv.busy(), null, 8000);
  c = await card(page);
  check(c.cur === 5 || c.t.includes("telefono"), `dopo aver parlato: il telefono («${c.t}»)`);
  const dbg = await page.evaluate(() => ({ tutorial: window.__mv.state.tutorial, busy: window.__mv.busy(), layer: window.__mv.layer(), card: document.querySelector(".tut-t")?.textContent }));
  await page.keyboard.press("Tab");
  await until(page, () => window.__mv.layer() === "telefono");
  await page.keyboard.press("Escape");
  check(await until(page, () => window.__mv.state.tutorial === 6, null, 8000), `aperto il telefono il tutorial è finito (prima: ${JSON.stringify(dbg)}; ora: ${await page.evaluate(() => window.__mv.state.tutorial)})`);
  check(!(await card(page)).on, "e la scheda sparisce");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
