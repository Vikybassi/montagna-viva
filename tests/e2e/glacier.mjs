// Il ghiacciaio nel tempo: dal 1850 a oggi al 2050 il terreno si fa sempre più scuro (roccia scoperta), non resta bianco
import { check, openGame } from "./lib.mjs";

export default async function glacier(browser) {
  const { page, errors } = await openGame(browser, { t: 11 });
  const lum = await page.evaluate(() => {
    const g = window.__mv.glacier, arr = g.mesh.geometry.attributes.color.array, out = { all: {}, high: {} };
    const foot = g.model(1850);
    for (const y of [1850, 1950, 2025, 2050]) {
      g.setYear(y);
      for (let i = 0; i < 80; i++) g.update(0.05);
      let a = 0, na = 0, h = 0, nh = 0;
      for (let i = 0; i < foot.length; i++) {
        if (foot[i] <= 0.5) continue;
        const v = arr[i * 3] + arr[i * 3 + 1] + arr[i * 3 + 2];
        a += v, na++;
        // sopra i 2950 m il terreno senza ghiaccio era già bianco di neve: il ritiro non si vedeva
        if (g.t.h[i] > 2950) (h += v), nh++;
      }
      out.all[y] = a / na / 3;
      out.high[y] = h / nh / 3;
    }
    out.versus = [1850, 1950, 2050].map((y) => g.versusNow(y));
    return out;
  });
  check(lum.all[1850] > lum.all[1950] + 0.03, `1850 più chiaro del 1950 (${lum.all[1850].toFixed(2)} contro ${lum.all[1950].toFixed(2)})`);
  check(lum.all[1950] > lum.all[2025] + 0.03, `1950 più chiaro di oggi (${lum.all[1950].toFixed(2)} contro ${lum.all[2025].toFixed(2)})`);
  check(lum.all[2025] > lum.all[2050] + 0.02, `oggi più chiaro del 2050 (${lum.all[2025].toFixed(2)} contro ${lum.all[2050].toFixed(2)})`);
  check(lum.high[2025] > lum.high[2050] + 0.04, `in alto il ritiro si vede: oggi ${lum.high[2025].toFixed(2)}, 2050 ${lum.high[2050].toFixed(2)}`);
  check(lum.versus[0] > lum.versus[1] && lum.versus[1] > 1 && lum.versus[2] < 1, `il ghiaccio rispetto a oggi: ${lum.versus.map((v) => v.toFixed(2)).join(", ")}`);
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
