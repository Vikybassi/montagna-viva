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
    // braccia e gambe mai incrociate: ogni arto arriva dal lato della sua spalla (o anca)
    const crossed = await page.evaluate(() => {
      const c = window.__mv.climb, h = c.hiker, R = c.right;
      const along = (o, len) => { const e = o.matrixWorld.elements; return { base: e[12] * R.x + e[13] * R.y + e[14] * R.z, tip: (e[4] * -len + e[12]) * R.x + (e[5] * -len + e[13]) * R.y + (e[6] * -len + e[14]) * R.z }; };
      const pair = (l, r, len) => {
        const a = along(l, len), b = along(r, len);
        return Math.sign(b.base - a.base) !== Math.sign(b.tip - a.tip) && Math.abs(b.tip - a.tip) > 0.05;
      };
      return [pair(h.armL, h.armR, 0.57) ? "braccia" : "", pair(h.legL, h.legR, 0.8) ? "gambe" : ""].filter(Boolean).join(" e ");
    });
    check(!crossed, `in parete si incrociano le ${crossed}`);
  }
  await page.waitForFunction(() => !window.__mv.climb.active, { timeout: 20000 });
  check(await page.evaluate(() => window.__mv.state.blocks.includes("torrente")), "il blocco risulta fatto");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
