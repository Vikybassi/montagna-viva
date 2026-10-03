// Al rientro: «bentornata» con la missione in corso (continua o pausa); le persone si girano quando arrivi;
// al confine della mappa un avviso, e non si cade nel vuoto
import { check, openGame, text, until, wait } from "./lib.mjs";

export default async function welcome(browser) {
  const { page, errors } = await openGame(browser, { save: { version: 2, packed: true, pack: ["frontale"], missions: { zaino: "done", ghiacciaio: "active" }, active: "ghiacciaio" }, t: 11 });
  check(await until(page, () => (document.querySelector(".dlg")?.textContent ?? "").includes("Bentornata")), "al rientro il telefono dice cosa stavi facendo");
  check((await text(page, ".dlg")).includes("Il ghiacciaio nel tempo"), "nomina la missione in corso");
  await page.keyboard.press("2"); // la metto in pausa
  check(await until(page, () => window.__mv.state.active === null), "la missione va in pausa");
  check(await until(page, () => !(document.querySelector(".goal-text")?.textContent ?? "").includes("Elena")), "l'obiettivo in alto non è più la missione");

  // Rosa si gira verso di te quando arrivi
  const turned = await page.evaluate(async () => {
    const it = window.__mv.interacts.find((i) => (i.text() ?? "").includes("Rosa"));
    let rosa = null;
    window.__mv.scene.traverse((o) => { if (o.position === it.pos) rosa = o; });
    const side = [it.pos.x + 6, it.pos.z];
    window.__mv.tp(side[0], side[1]);
    await new Promise((r) => setTimeout(r, 2000));
    const want = Math.atan2(window.__mv.me.x - it.pos.x, window.__mv.me.z - it.pos.z);
    const d = Math.atan2(Math.sin(want - rosa.rotation.y), Math.cos(want - rosa.rotation.y));
    return Math.abs(d);
  });
  check(turned < 0.3, `Rosa si gira verso di te (scarto ${turned.toFixed(2)} rad)`);

  // al confine est: ci si ferma prima del bordo, con un avviso
  await page.evaluate(() => { window.__mv.tp(5316 - 60, 2000); window.__mv.setYaw(-Math.PI / 2); });
  await page.keyboard.down("w");
  const told = await until(page, () => [...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("Valtellina")), null, 15000);
  await page.keyboard.up("w");
  check(told, "al confine compare l'avviso");
  check(await page.evaluate(() => window.__mv.me.x < 5316 - 19), "non si arriva al bordo del terreno");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
