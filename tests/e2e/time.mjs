// L'orologio salta (si dorme, si viaggia): il temporale di ieri non resta appeso, Marta non chiama per niente,
// niente arcobaleno di notte
import { check, openGame, text, until, wait } from "./lib.mjs";

export default async function time(browser) {
  const { page, errors } = await openGame(browser, { t: 14 });
  // le nuvole si caricano (Marta chiamerà)… ma salti oltre il temporale prima che squilli
  await page.evaluate(() => window.__mv.setHours(window.__mv.weather.endsAt - 1.5 - 0.2));
  await until(page, () => window.__mv.weather.phase === "building");
  await page.evaluate(() => window.__mv.setHours(21));
  await wait(2500);
  check(!(await page.evaluate(() => !!document.querySelector(".call.on"))), "dopo il temporale Marta non chiama (e se squillava, riattacca)");
  check(!(await page.evaluate(() => window.__mv.busy())), "il gioco non resta bloccato da una chiamata");
  check(!(await text(page, ".goal-text")).includes("Raggiungi"), "a temporale passato il riparo non è più l'obiettivo");

  // in pieno temporale, poi la mattina dopo (come dormendo al rifugio)
  await page.evaluate(() => window.__mv.setHours(24 + 16.9));
  await wait(2500);
  if (await page.evaluate(() => !!document.querySelector(".call.on"))) await page.keyboard.press("Escape");
  await wait(600);
  check((await text(page, ".goal-text")).includes("Raggiungi"), "col temporale l'obiettivo è il riparo");
  await page.evaluate(() => window.__mv.setHours(48 + 7.25));
  await wait(1500);
  check(!(await text(page, ".goal-text")).includes("Raggiungi"), "la mattina dopo il riparo non è più l'obiettivo");
  check(await page.evaluate(() => window.__mv.weather.phase) === "clear", "la mattina dopo è sereno");
  check(await page.evaluate(() => window.__mv.skyEvents.rainbowUntil < 48 + 7.25), "niente arcobaleno per un temporale finito di notte");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
