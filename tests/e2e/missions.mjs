// Missioni finite, rifatte e lasciate a metà: in alto c'è sempre qualcosa da fare
import { check, openGame, text, until, wait } from "./lib.mjs";

export default async function missions(browser) {
  // il salvataggio che bloccava tutto: il ghiacciaio finito ma ancora «in corso», due missioni lasciate a metà
  const save = { version: 2, packed: true, pack: ["frontale"], active: "ghiacciaio", missions: { zaino: "done", ghiacciaio: "done", fauna: "active", rientro: "active", corsa: "done" } };
  const { page, errors } = await openGame(browser, { save, t: 14 });
  await wait(1500);
  check(!(await page.evaluate(() => (document.querySelector(".dlg.on")?.textContent ?? "").includes("Bentornata"))), "niente «bentornata» per una missione già finita");
  check((await text(page, ".goal-text")).includes("Esplora"), `in alto c'è cosa fare (era: «${await text(page, ".goal-text")}»)`);
  // nel telefono: le due missioni a metà, con «Riprendi»
  await page.keyboard.press("Tab");
  await until(page, () => window.__mv.layer() === "telefono");
  check(await page.evaluate(() => document.querySelectorAll("[data-resume]").length) === 2, "nel telefono ci sono le due missioni da riprendere");
  await page.evaluate(() => document.querySelector('[data-resume="fauna"]').click());
  check(await until(page, () => window.__mv.state.active === "fauna"), "«Riprendi» la rimette in corso");
  await page.keyboard.press("Escape");
  check(await until(page, () => (document.querySelector(".goal-text")?.textContent ?? "").includes("Stambecchi"), null, 8000), `l'obiettivo è la missione ripresa (era: «${await text(page, ".goal-text")}»)`);

  // rifare con Marta una missione già fatta: riparte da zero, con i passi da fare
  await page.evaluate(() => { const m = window.__mv.marta; window.__mv.tp(m.x + 2, m.z + 2); });
  await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("Marta"));
  await page.keyboard.press("e");
  await until(page, () => (document.querySelector(".dlg.on")?.textContent ?? "").includes("Cosa ti va"));
  const idx = await page.evaluate(() => [...document.querySelectorAll(".dlg .opt")].findIndex((b) => b.textContent.includes("ghiacciaio")) + 1);
  await page.keyboard.press(String(idx));
  await until(page, () => window.__mv.state.active === "ghiacciaio");
  await page.keyboard.press("Enter"); // chiude la spiegazione di Marta
  check(await until(page, () => (document.querySelector(".goal-text")?.textContent ?? "").includes("Elena")), `rifacendo il ghiacciaio l'obiettivo è raggiungere Elena (era: «${await text(page, ".goal-text")}»)`);
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
