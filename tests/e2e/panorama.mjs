// Panorama e fontane vere: ogni rifugio e bivacco ha il suo punto panoramico libero, dall'Omio si riconoscono almeno
// tre cime e il panorama conta per i compiti; le fontane sono i punti veri di OpenStreetMap
import { check, openGame, until, wait } from "./lib.mjs";

export default async function panorama(browser) {
  const { page, errors } = await openGame(browser, { t: 11 });
  const r = await page.evaluate(() => {
    const mv = window.__mv, out = { huts: 0, missing: [], blocked: [] };
    for (const h of mv.data.huts.filter((x) => x.kind === "rifugio" || x.kind === "bivacco")) {
      out.huts++;
      const it = mv.interacts.find((i) => i.text() === "Guarda il panorama" && Math.hypot(i.pos.x - h.p[0] * 0.3, i.pos.z - h.p[1] * 0.3) < 14);
      if (!it) out.missing.push(h.name);
      else if (mv.obstacles.hits(it.pos.x, it.pos.z, it.pos.y, 0.35)) out.blocked.push(h.name);
    }
    out.fountains = mv.fountains.length;
    out.springs = mv.data.springs.length;
    return out;
  });
  check(r.missing.length === 0, `senza panorama: ${r.missing.join(", ")}`);
  check(r.blocked.length === 0, `panorama murato: ${r.blocked.join(", ")}`);
  check(r.fountains >= r.springs, `le fontane sono almeno i punti veri (${r.fountains} contro ${r.springs})`);
  console.log(`  ${r.huts} tra rifugi e bivacchi con il panorama, ${r.fountains} fontane`);
  // dall'Omio
  await page.evaluate(() => {
    const mv = window.__mv, h = mv.data.huts.find((x) => x.name.includes("Omio"));
    const it = mv.interacts.find((i) => i.text() === "Guarda il panorama" && Math.hypot(i.pos.x - h.p[0] * 0.3, i.pos.z - h.p[1] * 0.3) < 14);
    mv.tp(it.pos.x, it.pos.z);
  });
  check(await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("panorama")), "all'Omio compare «Guarda il panorama»");
  await page.keyboard.press("e");
  check(await until(page, () => (document.querySelector(".dlg.on")?.textContent ?? "").includes("riconosci")), "il panorama si apre");
  const peaks = await page.evaluate(() => document.querySelectorAll(".dlg.on .what b").length);
  check(peaks >= 3, `dall'Omio si riconoscono almeno tre cime (ne vedo ${peaks})`);
  await page.keyboard.press("Enter");
  await wait(400);
  check(await page.evaluate(() => window.__mv.state.views.includes("Rifugio Antonio Omio") || window.__mv.state.views.some((v) => v.includes("Omio"))), "il panorama è nei progressi");
  check(await page.evaluate(() => window.__mv.state.diary.includes("cime")), "e nel diario");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
