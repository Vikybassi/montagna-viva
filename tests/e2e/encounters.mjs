// Incontri: il cappello di Tommaso e il consiglio a Giorgia; la commissione accettata diventa l'obiettivo
import { check, openGame, text, until, wait } from "./lib.mjs";

const hut = (page, n) => page.evaluate((n) => { const h = window.__mv.data.huts.find((x) => x.name.includes(n)); return [h.p[0] * 0.3, h.p[1] * 0.3]; }, n);
const prompt = (page) => text(page, ".act.on");

export default async function encounters(browser) {
  const { page, errors } = await openGame(browser);
  const fil = await hut(page, "Filorera");
  await page.evaluate(([x, z]) => window.__mv.tp(x + 10, z - 10), fil);
  await wait(800);
  check((await prompt(page)).includes("Tommaso"), "vicino a Tommaso si può parlargli");
  await page.keyboard.press("e");
  await wait(500);
  await page.keyboard.press("Enter");
  await wait(500);
  check((await text(page, ".goal-text")).includes("cappello"), "la commissione del cappello è l'obiettivo in alto");
  await page.evaluate(([x, z]) => window.__mv.tp(x + 57, z - 63), fil);
  await wait(800);
  check((await prompt(page)).includes("cappello"), "vicino al cespuglio si prende il cappello");
  await page.keyboard.press("e");
  await page.evaluate(([x, z]) => window.__mv.tp(x + 10, z - 10), fil);
  await wait(800);
  await page.keyboard.press("e");
  await wait(500);
  await page.keyboard.press("Enter");
  await wait(500);
  check(await page.evaluate(() => window.__mv.state.encounters.includes("cappello")), "il cappello è tornato a Tommaso");
  const bagni = await hut(page, "Bagni di Masino");
  await page.evaluate(([x, z]) => window.__mv.tp(x + 12, z + 8), bagni);
  await wait(800);
  await page.keyboard.press("e");
  await wait(500);
  await page.keyboard.press("1"); // il consiglio sbagliato
  await wait(500);
  await page.keyboard.press("Enter");
  await wait(500);
  await page.keyboard.press("2"); // quello giusto
  await wait(500);
  await page.keyboard.press("Enter");
  await wait(500);
  check(await page.evaluate(() => window.__mv.state.encounters.includes("giorgia")), "Giorgia ha avuto il consiglio giusto");
  // Rosa: accettato il pane, si può ancora parlarle (prima diventava muta) e ti ricorda dove portarlo
  await page.evaluate(() => {
    const it = window.__mv.interacts.find((i) => (i.text() ?? "").includes("Rosa"));
    window.__mv.tp(it.pos.x + 2, it.pos.z + 2);
  });
  check(await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("Rosa")), "vicino a Rosa si può parlarle");
  await page.keyboard.press("e");
  await until(page, () => window.__mv.layer() === "dialogo");
  await page.keyboard.press("1"); // sì, lo porto io
  check(await until(page, () => window.__mv.state.carrying === "pane" && window.__mv.layer() === "mondo"), "il pane è nello zaino");
  check(await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("Rosa")), "col pane nello zaino Rosa risponde ancora");
  await page.keyboard.press("e");
  check(await until(page, () => (document.querySelector(".dlg.on, .dialog.on")?.textContent ?? "").includes("Giulio")), "Rosa ricorda di portare il pane a Giulio");
  await page.keyboard.press("Enter");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
