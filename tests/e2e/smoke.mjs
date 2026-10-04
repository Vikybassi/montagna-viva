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
  // la mappa: un tocco sul Rifugio Omio (senza trascinare) propone la strada
  await page.evaluate(() => document.querySelector('.mp-icon[data-tab="mappa"]').click());
  await until(page, () => !!window.__mv.map.hits?.length);
  const tapped = await page.evaluate(() => {
    const m = window.__mv.map, h = m.hits.find((x) => x.place.name.includes("Omio"));
    if (!h) return false;
    const r = m.canvas.getBoundingClientRect(), x = r.left + h.x, y = r.top + h.y;
    for (const type of ["pointerdown", "pointerup"]) m.canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, pointerType: "mouse" }));
    return true;
  });
  check(tapped, "sulla mappa c'è il Rifugio Omio");
  check(await until(page, () => (document.querySelector(".dlg.on")?.textContent ?? "").includes("Omio")), "toccando il rifugio sulla mappa si sceglie la strada");
  await page.keyboard.press("Escape");
  await page.evaluate(() => [...document.querySelectorAll(".dlg.on .opt")].find((b) => b.textContent.includes("Annulla"))?.click());
  await until(page, () => window.__mv.layer() === "mondo");
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
