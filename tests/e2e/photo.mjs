// Fotografia naturalistica: un fiore da vicino, una marmotta da lontano con lo zoom, il taccuino
import { check, openGame, text, until, wait } from "./lib.mjs";

export default async function photo(browser) {
  const { page, errors } = await openGame(browser);
  await page.evaluate(() => {
    const f = window.__mv.nature.flowers.find((x) => x.subject === "genziana");
    window.__mv.tp(f.pos.x + 4, f.pos.z);
    window.__mv.setYaw(Math.atan2(4, 0));
  });
  await wait(600);
  await page.keyboard.press("p");
  await wait(400);
  await page.evaluate(() => {
    const f = window.__mv.nature.flowers.find((x) => x.subject === "genziana"), me = window.__mv.me, v = window.__mv.finder();
    v.pitch = Math.atan2(f.pos.y - (me.y + 1.62), Math.hypot(f.pos.x - me.x, f.pos.z - me.z));
  });
  await wait(500);
  check((await text(page, ".finder-hint")).includes("Genziana"), "il mirino riconosce la genziana");
  await page.keyboard.press("p");
  await wait(800);
  check(await page.evaluate(() => window.__mv.state.photos.genziana === 1), "la foto della genziana è nel taccuino");
  await page.keyboard.press("Escape");
  // la marmotta: da 55 m, prima senza zoom (troppo piccola), poi con lo zoom
  await page.evaluate(() => {
    const t = window.__mv.fauna.targets().find((x) => x.subject === "marmotta" && !x.hidden);
    window.__mv.tp(t.pos.x + 55, t.pos.z);
  });
  await wait(800);
  await page.keyboard.press("p");
  await wait(400);
  await page.evaluate(() => {
    const t = window.__mv.fauna.targets().find((x) => x.subject === "marmotta" && !x.hidden), me = window.__mv.me, v = window.__mv.finder();
    window.__mv.setYaw(Math.atan2(me.x - t.pos.x, me.z - t.pos.z));
    v.pitch = Math.atan2(t.pos.y - (me.y + 1.62), Math.hypot(t.pos.x - me.x, t.pos.z - me.z));
  });
  await wait(500);
  check((await text(page, ".finder-hint")).includes("zoom"), "senza zoom la marmotta è troppo piccola");
  for (let i = 0; i < 6; i++) await page.keyboard.press("+");
  await wait(500);
  check((await text(page, ".finder-hint")).includes("perfetta"), "con lo zoom la foto è buona");
  await page.keyboard.press("p");
  await wait(800);
  check(await page.evaluate(() => window.__mv.state.photos.marmotta === 1), "la marmotta è nel taccuino");
  await page.keyboard.press("Escape");
  // le foto si guardano nel telefono, scheda Foto (col puntino rosso delle novità)
  check(await until(page, () => window.__mv.layer() === "mondo"), "si esce dal mirino");
  check(await page.evaluate(() => document.querySelector('.ph-tabs button[data-tab="foto"]').classList.contains("new")), "la scheda Foto ha il puntino delle novità");
  await page.keyboard.press("Tab");
  await until(page, () => window.__mv.layer() === "telefono");
  await page.evaluate(() => document.querySelector('.ph-tabs button[data-tab="foto"]').click());
  check(await until(page, () => document.querySelectorAll(".ph-album .ph-photo").length >= 2), "nell'album ci sono le due foto");
  check(await page.evaluate(() => document.querySelectorAll(".ph-notebook li.got").length) >= 2, "nel taccuino ci sono genziana e marmotta");
  await page.evaluate(() => document.querySelector(".ph-album .ph-photo").click());
  check(await until(page, () => document.querySelector(".ph-zoom.on img")), "un tocco ingrandisce la foto");
  await page.keyboard.press("Escape");
  check(await until(page, () => !document.querySelector(".ph-zoom.on") && window.__mv.layer() === "telefono"), "Esc chiude la foto e il telefono resta aperto");
  await page.keyboard.press("Escape");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
