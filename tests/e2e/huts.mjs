// Rifugi e bivacchi: tutti hanno la porta, davanti c'è spazio libero, e si entra anche col bel tempo (riposo, acqua)
import { check, openGame, until, wait } from "./lib.mjs";

export default async function huts(browser) {
  const { page, errors } = await openGame(browser, { save: { version: 2, packed: true, pack: ["frontale", "acqua"], missions: { zaino: "done" }, water: 0.2 }, t: 10 });
  const r = await page.evaluate(() => {
    const mv = window.__mv, out = { total: 0, noDoor: [], blocked: [] };
    for (const h of mv.data.huts.filter((x) => x.kind === "rifugio" || x.kind === "bivacco")) {
      out.total++;
      const it = mv.interacts.find((i) => (i.text() ?? "").startsWith("Entra nel") && Math.hypot(i.pos.x - h.p[0] * 0.3, i.pos.z - h.p[1] * 0.3) < 12);
      if (!it) out.noDoor.push(h.name);
      else if (mv.obstacles.hits(it.pos.x, it.pos.z, it.pos.y, 0.35)) out.blocked.push(h.name);
    }
    return out;
  });
  check(r.noDoor.length === 0, `senza porta: ${r.noDoor.join(", ")}`);
  check(r.blocked.length === 0, `porta murata: ${r.blocked.join(", ")}`);
  console.log(`  ${r.total} tra rifugi e bivacchi, tutti con la porta`);
  // col bel tempo si entra in un bivacco e ci si riposa
  await page.evaluate(() => {
    const mv = window.__mv, h = mv.data.huts.find((x) => x.kind === "bivacco");
    const it = mv.interacts.find((i) => (i.text() ?? "").startsWith("Entra nel bivacco") && Math.hypot(i.pos.x - h.p[0] * 0.3, i.pos.z - h.p[1] * 0.3) < 12);
    mv.tp(it.pos.x, it.pos.z);
  });
  check(await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("Entra nel bivacco")), "col bel tempo davanti al bivacco: «Entra nel bivacco»");
  await page.keyboard.press("e");
  check(await until(page, () => !!document.querySelector(".inside.on")), "si entra");
  check(!(await page.evaluate(() => window.__mv.state.sheltered)), "col bel tempo non vale come «al riparo dal temporale»");
  await page.evaluate(() => [...document.querySelectorAll(".in-btns .opt")].find((b) => b.textContent.includes("Riposa")).click());
  await wait(500);
  check(await page.evaluate(() => document.querySelector(".in-text").textContent.includes("fiato")), "riposando torna il fiato");
  await page.evaluate(() => [...document.querySelectorAll(".in-btns .opt")].find((b) => b.textContent === "Esci").click());
  check(await until(page, () => !document.querySelector(".inside.on") && window.__mv.layer() === "mondo"), "si esce");
  await wait(900); // la porta si richiude alle tue spalle
  // al rifugio: si riempie la borraccia
  await page.evaluate(() => {
    const mv = window.__mv, h = mv.data.huts.find((x) => x.name.includes("Omio"));
    const it = mv.interacts.find((i) => (i.text() ?? "").startsWith("Entra nel rifugio") && Math.hypot(i.pos.x - h.p[0] * 0.3, i.pos.z - h.p[1] * 0.3) < 12);
    mv.tp(it.pos.x, it.pos.z);
  });
  await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("Entra nel rifugio"));
  await wait(400);
  await page.keyboard.press("e");
  await until(page, () => !!document.querySelector(".inside.on"));
  await page.evaluate(() => [...document.querySelectorAll(".in-btns .opt")].find((b) => b.textContent.includes("borraccia")).click());
  check(await until(page, () => window.__mv.thirst.water === 1), "al rifugio la borraccia si riempie");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
