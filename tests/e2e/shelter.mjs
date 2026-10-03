// Temporale: la telefonata di Marta, la strada al riparo, la porta, l'attesa, l'uscita
import { check, openGame, text, wait } from "./lib.mjs";

export default async function shelter(browser) {
  const { page, errors } = await openGame(browser, { t: 14 });
  await page.evaluate(() => window.__mv.setHours(16.9));
  await wait(2500);
  check(await page.evaluate(() => !!document.querySelector(".call.on")), "Marta chiama quando arriva il temporale");
  await page.keyboard.press("Escape"); // rifiuta: arriva un messaggio
  await wait(800);
  const goal = await text(page, ".goal-text");
  check(goal.includes("Raggiungi") && goal.includes("entra"), `l'obiettivo è il riparo (era: ${goal})`);
  const name = goal.match(/Raggiungi (.+?) [(]/)[1];
  // davanti alla porta del riparo
  const ok = await page.evaluate(async (n) => {
    const h = window.__mv.data.huts.find((x) => x.name === n), cx = h.p[0] * 0.3, cz = h.p[1] * 0.3;
    for (let r = 2; r < 9; r += 0.5)
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        window.__mv.tp(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
        await new Promise((res) => setTimeout(res, 30));
        if ((document.querySelector(".act.on")?.textContent ?? "").includes("Entra")) return true;
      }
    return false;
  }, name);
  check(ok, "davanti alla porta compare «Entra»");
  await page.keyboard.press("e");
  await wait(2200);
  check(await page.evaluate(() => !!document.querySelector(".inside.on")), "si entra nel rifugio");
  await page.evaluate(() => document.querySelector(".in-btns .opt").click()); // aspetta che passi
  await wait(4200);
  check((await text(page, ".in-text")).includes("passato"), "dopo l'attesa il temporale è passato");
  check(await page.evaluate(() => window.__mv.skyEvents.rainbowUntil > 16), "finito adesso: l'arcobaleno è possibile");
  await page.evaluate(() => document.querySelector(".in-btns .opt").click()); // esci
  await wait(1200);
  check(!(await text(page, ".goal-text")).includes("riparo"), "fuori, l'obiettivo torna alla normalità");
  check(await page.evaluate(() => window.__mv.state.sheltered), "il riparo è ricordato nei progressi");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
