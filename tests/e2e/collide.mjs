// Case e tronchi solidi: le persone e le cose con cui parlare sono raggiungibili, nei rifugi non si entra dai muri,
// e la telecamera non finisce dentro una casa
import { check, openGame, until, wait } from "./lib.mjs";

export default async function collide(browser) {
  const { page, errors } = await openGame(browser, { t: 11 });
  // ogni cosa con cui interagire ha un punto libero a portata (nessuno è murato dentro una casa)
  const walled = await page.evaluate(() => {
    const { obstacles, interacts } = window.__mv;
    const bad = [];
    for (const it of interacts) {
      let free = !obstacles.hits(it.pos.x, it.pos.z, it.pos.y, 0.35);
      for (let r = 0.5; r < it.r - 0.3 && !free; r += 0.5)
        for (let a = 0; a < Math.PI * 2 && !free; a += 0.3) free = !obstacles.hits(it.pos.x + Math.cos(a) * r, it.pos.z + Math.sin(a) * r, it.pos.y, 0.35);
      if (!free) bad.push(`${it.text() ?? "?"} @ ${it.pos.x.toFixed(0)},${it.pos.z.toFixed(0)}`);
    }
    return bad;
  });
  check(walled.length === 0, `irraggiungibili: ${walled.join("; ")}`);

  // contro il muro del Rifugio Omio: si cammina verso il centro e ci si ferma fuori
  const box = await page.evaluate(() => {
    const h = window.__mv.data.huts.find((x) => x.name.includes("Omio"));
    const cx = h.p[0] * 0.3, cz = h.p[1] * 0.3;
    const b = window.__mv.obstacles.all.filter((s) => s.kind === "box").sort((a, b2) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b2.x - cx, b2.z - cz))[0];
    // 2,5 m fuori (su GitHub, in grafica software, si cammina piano), dal lato lungo, lontano dalla porta che è a +z
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const lx = 0, lz = -(b.hd + 2.5);
    const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
    window.__mv.tp(x, z);
    const dx = b.x - x, dz = b.z - z;
    window.__mv.setYaw(Math.atan2(-dx, -dz));
    return b;
  });
  await wait(300);
  await page.keyboard.down("w");
  // si cammina finché si arriva vicino al muro (o si resta lì un po': deve fermarsi, non attraversarlo)
  const near = (b) => {
    const p = window.__mv.me, c = Math.cos(b.rot), s = Math.sin(b.rot), dx = p.x - b.x, dz = p.z - b.z;
    return Math.abs(dx * s + dz * c) < b.hd + 0.6;
  };
  await until(page, near, box, 30000);
  await wait(1500); // ancora avanti contro il muro
  await page.keyboard.up("w");
  await wait(200);
  const inside = await page.evaluate((b) => {
    const p = window.__mv.me, c = Math.cos(b.rot), s = Math.sin(b.rot), dx = p.x - b.x, dz = p.z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return { lx, lz, inBox: Math.abs(lx) < b.hw && Math.abs(lz) < b.hd };
  }, box);
  check(!inside.inBox, `si è entrati nel muro del rifugio (${inside.lx.toFixed(2)}, ${inside.lz.toFixed(2)})`);
  check(Math.abs(inside.lz) < box.hd + 1.5, `si è arrivati fino al muro (lz ${inside.lz.toFixed(2)})`);

  // la telecamera dalla parte del rifugio: deve restare fuori dai muri
  await page.evaluate((b) => {
    const p = window.__mv.me;
    window.__mv.setYaw(Math.atan2(b.x - p.x, b.z - p.z));
  }, box);
  await wait(3000);
  const camIn = await page.evaluate((b) => {
    const p = window.__mv.camera.position, c = Math.cos(b.rot), s = Math.sin(b.rot), dx = p.x - b.x, dz = p.z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < b.hw && Math.abs(lz) < b.hd && p.y < b.y1 && p.y > b.y0;
  }, box);
  check(!camIn, "la telecamera è entrata nel rifugio");

  // finita dentro una casa (un viaggio veloce, un salto): si esce camminando, non si resta bloccata
  await page.evaluate((b) => window.__mv.tp(b.x + 0.3, b.z + 0.2), box);
  await page.keyboard.down("w");
  await until(page, (b) => !window.__mv.obstacles.hits(window.__mv.me.x, window.__mv.me.z, window.__mv.me.y, 0.3) && Math.hypot(window.__mv.me.x - b.x, window.__mv.me.z - b.z) > 2, box, 20000);
  await page.keyboard.up("w");
  const out = await page.evaluate((b) => !window.__mv.obstacles.hits(window.__mv.me.x, window.__mv.me.z, window.__mv.me.y, 0.3) && Math.hypot(window.__mv.me.x - b.x, window.__mv.me.z - b.z) > 2, box);
  check(out, "da dentro una casa non si riesce a uscire");
  check(errors.length === 0, `errori nella pagina: ${errors.join(" | ")}`);
  await page.close();
}
