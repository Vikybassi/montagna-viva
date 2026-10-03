// Arrampicata: il blocco più facile della Val di Mello, dalla prima presa al salto sul materassino
import { check, openGame, wait } from "./lib.mjs";

export default async function boulder(browser) {
  const { page, errors } = await openGame(browser);
  await page.evaluate(() => {
    const bk = window.__mv.blocks.find((b) => b.id === "torrente");
    window.__mv.tp(bk.climb.base.x + 1, bk.climb.base.z + 1);
  });
  await wait(1000);
  await page.keyboard.press("e");
  await wait(500);
  await page.keyboard.press("1");
  await wait(800);
  check(await page.evaluate(() => window.__mv.climb.active), "si parte sul blocco");
  for (let k = 0; k < 40; k++) {
    const st = await page.evaluate(() => ({ a: window.__mv.climb.active, ph: window.__mv.climb.phase }));
    if (!st.a || st.ph === "top" || st.ph === "lower") break;
    if (st.ph !== "climb") {
      await wait(200);
      continue;
    }
    const t = await page.evaluate(() => {
      const c = window.__mv.climb, h = c.next();
      if (!h) return null;
      const v = h.pos.clone().project(window.__mv.camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, s: c.strength, rest: c.hands[0].kind === "jug" && c.hands[1].kind === "jug" };
    });
    check(t, "c'è sempre una presa suggerita");
    if (t.rest && t.s < 0.5) {
      await page.keyboard.down("f");
      await wait(2000);
      await page.keyboard.up("f");
      continue;
    }
    await page.mouse.click(t.x, t.y);
    await wait(650);
  }
  await page.waitForFunction(() => !window.__mv.climb.active, { timeout: 20000 });
  check(await page.evaluate(() => window.__mv.state.blocks.includes("torrente")), "il blocco risulta fatto");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
