// Bere: senza borraccia un avviso; con la borraccia un sorso (B) che toglie la sete e ridà fiato; la fontana in paese
// riempie; con la borraccia vuota vicino a un torrente si impara che l'acqua limpida non è per forza buona
import { check, openGame, until, wait } from "./lib.mjs";

const toast = (page, s) => until(page, (s) => [...document.querySelectorAll(".toast")].some((t) => t.textContent.includes(s)), s, 6000);

export default async function drink(browser) {
  // senza borraccia
  let { page, errors } = await openGame(browser, { save: { version: 2, packed: true, pack: ["frontale"], missions: { zaino: "done" } } });
  await page.keyboard.press("b");
  check(await toast(page, "Non hai la borraccia"), "senza borraccia, B lo dice");
  await page.close();

  ({ page, errors } = await openGame(browser, { save: { version: 2, packed: true, pack: ["frontale", "acqua"], missions: { zaino: "done" }, thirst: 0.9, water: 1 } }));
  check(await page.evaluate(() => !document.querySelector(".drinkbtn").hidden && document.querySelector(".drinkbtn").classList.contains("thirsty")), "con la sete il pulsante della borraccia si vede e pulsa");
  await page.keyboard.press("b");
  check(await until(page, () => window.__mv.thirst.dry < 0.7), "un sorso toglie la sete");
  check(await page.evaluate(() => window.__mv.thirst.sips === 6), "nella borraccia restano sei sorsi");
  check(await toast(page, "Un sorso"), "e lo dice");
  // la fontana del paese: E e la borraccia è di nuovo piena
  await page.evaluate(() => { const f = window.__mv.fountains[0]; window.__mv.tp(f.x + 1.5, f.z + 1.5); });
  check(await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("Bevi alla")), "vicino alla fontana: «Bevi alla…»");
  await page.keyboard.press("e");
  check(await until(page, () => window.__mv.thirst.water === 1 && window.__mv.thirst.dry < 0.01), "alla fontana si beve e la borraccia è piena");
  // borraccia vuota vicino al torrente
  await page.evaluate(() => { window.__mv.thirst.water = 0; });
  const stream = await page.evaluate(() => { const s = window.__mv.data.streams.find((x) => x.pts.length > 5); const [x, z] = s.pts[Math.floor(s.pts.length / 2)]; return [x * 0.3, z * 0.3]; });
  await page.evaluate(([x, z]) => window.__mv.tp(x + 3, z + 3), stream);
  await wait(300);
  await page.keyboard.press("b");
  check(await toast(page, "pascoli"), "vicino al torrente, con la borraccia vuota, si impara che l'acqua può non essere buona");
  check(await page.evaluate(() => window.__mv.state.diary.includes("torrenti")), "e finisce nel diario");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
