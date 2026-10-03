// Avvio, telefono, mappa, fotocamera: il giro minimo che deve sempre funzionare (gira anche su GitHub)
import { check, openGame, text, until, wait } from "./lib.mjs";

export default async function smoke(browser) {
  const { page, errors } = await openGame(browser, { save: null, t: 11 });
  check((await text(page, ".goal-text")).includes("Marta"), "all'inizio l'obiettivo porta da Marta");
  await page.keyboard.press("Tab");
  await wait(600);
  check(await page.evaluate(() => document.querySelector(".phone-wrap").classList.contains("on")), "Tab apre il telefono");
  check(await page.evaluate(() => window.__mv.busy()), "col telefono aperto il gioco è in pausa");
  for (const k of ["m", "j", "z", "4", "6", "7", "1"]) {
    await page.keyboard.press(k);
    await wait(250);
  }
  check((await text(page, ".ph-body h2")).includes("missioni"), "il tasto 1 torna alle missioni");
  await page.keyboard.press("Escape");
  await wait(500);
  check(!(await page.evaluate(() => window.__mv.busy())), "Esc chiude il telefono e il gioco riparte");
  check(!(await page.evaluate(() => !!document.querySelector(".panel.on"))), "lo stesso Esc non apre la pausa");
  // il telefonino nell'angolo: le icone aprono subito la scheda giusta
  await page.evaluate(() => document.querySelector('.mp-icon[data-tab="foto"]').click());
  check(await until(page, () => window.__mv.layer() === "telefono" && (document.querySelector(".ph-body h2")?.textContent ?? "") === "Foto"), "l'icona della fotocamera nel telefonino apre le foto");
  await page.keyboard.press("Escape");
  await until(page, () => window.__mv.layer() === "mondo");
  await page.keyboard.press("p");
  await wait(500);
  check(await page.evaluate(() => document.querySelector(".finder").classList.contains("on")), "P apre la fotocamera");
  await page.keyboard.press("Escape");
  await wait(400);
  check(!(await page.evaluate(() => !!window.__mv.finder())), "Esc chiude la fotocamera");
  // i suoni registrati: tutti scaricati e decodificati (vedi public/audio/CREDITI.md)
  check(await until(page, () => window.__mv.sound.buffers.size >= 34, null, 30000), `suoni caricati: ${await page.evaluate(() => window.__mv.sound.buffers.size)} di 34`);
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
