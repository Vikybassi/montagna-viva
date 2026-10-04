/**
 * Esegue le prove nel browser. Senza argomenti le fa tutte; `node tests/e2e/run.mjs smoke photo` solo quelle scelte.
 * Se il gioco non risponde su BASE_URL (default http://localhost:5200/), avvia da sé un server di sviluppo.
 */
import { spawn } from "node:child_process";
import { BASE, launch } from "./lib.mjs";

const ALL = ["smoke", "keys", "collide", "welcome", "missions", "glacier", "panorama", "drink", "huts", "photo", "encounters", "shelter", "time", "boulder"];
const which = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

const up = async () => fetch(BASE).then((r) => r.ok).catch(() => false);
let server = null;
if (!(await up())) {
  const port = new URL(BASE).port || "5200";
  server = spawn("npx", ["vite", "--port", port, "--strictPort"], { stdio: "ignore" });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 1000));
}

const browser = await launch();
let failed = 0;
for (const name of which) {
  const t0 = Date.now();
  try {
    const mod = await import(`./${name}.mjs`);
    await mod.default(browser);
    console.log(`✓ ${name} (${Math.round((Date.now() - t0) / 1000)} s)`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}: ${e.message}`);
  }
}
await browser.close();
server?.kill();
process.exit(failed ? 1 : 0);
