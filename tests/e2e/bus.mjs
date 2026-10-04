// La corriera: le fermate ci sono e sono libere, si parte alla prossima corsa, il viaggio dura pochi secondi, l'orologio
// avanza, si arriva davanti alla pensilina di destinazione; a mezzanotte e col temporale non si parte
import { check, openGame, until, wait } from "./lib.mjs";

const press = (page, k) => page.keyboard.press(k);

export default async function bus(browser) {
  const { page, errors } = await openGame(browser, { t: 10.2 });
  const stops = await page.evaluate(() => {
    const mv = window.__mv, out = { n: mv.busStops.length, blocked: [], noPrompt: [] };
    for (const s of mv.busStops) {
      if (mv.obstacles.hits(s.stand.x, s.stand.z, s.stand.y, 0.35)) out.blocked.push(s.name);
      if (!mv.interacts.some((i) => i.text() === "Prendi la corriera" && Math.hypot(i.pos.x - s.stand.x, i.pos.z - s.stand.z) < 1)) out.noPrompt.push(s.name);
    }
    return out;
  });
  check(stops.n >= 5, `ci sono almeno 5 fermate (${stops.n})`);
  check(stops.blocked.length === 0, `fermata murata: ${stops.blocked.join(", ")}`);
  check(stops.noPrompt.length === 0, `senza invito: ${stops.noPrompt.join(", ")}`);
  console.log(`  ${stops.n} fermate`);

  // alla fermata di San Martino: la prossima corsa è alle 10:30
  await page.evaluate(() => { const s = window.__mv.busStops.find((x) => x.name === "San Martino"); window.__mv.tp(s.stand.x, s.stand.z); });
  check(await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("corriera")), "alla fermata: «Prendi la corriera»");
  await press(page, "e");
  check(await until(page, () => (document.querySelector(".dlg.on")?.textContent ?? "").includes("10:30")), "la prossima corsa è alle 10:30");
  const h0 = await page.evaluate(() => window.__mv.hours());
  const label = await page.evaluate(() => document.querySelector(".dlg.on .opt").textContent);
  await press(page, "1");
  check(await until(page, () => document.querySelector(".travel.show")), "parte il viaggio");
  const t0 = Date.now();
  check(await until(page, () => !document.querySelector(".travel.on"), null, 15000), "il viaggio finisce");
  check(Date.now() - t0 < 8000, `il viaggio dura pochi secondi (${Math.round((Date.now() - t0) / 1000)} s)`);
  const arr = await page.evaluate(() => {
    const mv = window.__mv, me = mv.me;
    const near = mv.busStops.map((s) => ({ n: s.name, d: Math.hypot(s.stand.x - me.x, s.stand.z - me.z) })).sort((a, b) => a.d - b.d)[0];
    return { near, hours: mv.hours(), layer: mv.layer() };
  });
  check(arr.near.n !== "San Martino" && arr.near.d < 3, `si arriva davanti a un'altra pensilina (${arr.near.n}, a ${arr.near.d.toFixed(1)} u)`);
  check(arr.hours > h0 + 0.3, `l'orologio è avanzato (da ${h0.toFixed(2)} a ${arr.hours.toFixed(2)})`);
  check(label.includes(arr.near.n), `si è arrivati dove si voleva (${label})`);
  check(arr.layer === "mondo", "finito il viaggio si può giocare");
  check(await page.evaluate((n) => window.__mv.state.rides.includes(n), arr.near.n), "il paese è nei viaggi fatti");

  // dopo l'ultima corsa: niente
  await page.evaluate(() => { window.__mv.setHours(19.4); const s = window.__mv.busStops[0]; window.__mv.tp(s.stand.x, s.stand.z); });
  await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("corriera"));
  await press(page, "e");
  check(await until(page, () => (document.querySelector(".dlg.on")?.textContent ?? "").includes("ultima corsa")), "dopo le 19 l'ultima corsa è partita");
  await press(page, "Enter");
  await until(page, () => window.__mv.layer() === "mondo");

  // col temporale non parte
  await page.evaluate(() => { window.__mv.setHours(window.__mv.weather.endsAt - 0.5); });
  await until(page, () => window.__mv.weather.phase === "storm");
  await wait(1500);
  await until(page, () => window.__mv.layer() === "mondo" || window.__mv.layer() === "telefonata");
  if ((await page.evaluate(() => window.__mv.layer())) === "telefonata") await press(page, "Escape");
  await until(page, () => window.__mv.layer() === "mondo");
  await until(page, () => (document.querySelector(".act.on")?.textContent ?? "").includes("corriera"));
  await press(page, "e");
  check(await until(page, () => (document.querySelector(".dlg.on")?.textContent ?? "").includes("temporale")), "col temporale la corriera non parte");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
