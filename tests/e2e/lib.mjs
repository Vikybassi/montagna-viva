/**
 * Strumenti comuni per le prove nel browser (Chrome senza finestra): apre il gioco con una partita salvata a scelta,
 * raccoglie gli errori della pagina e offre piccoli controlli. Il gioco con ?debug espone window.__mv per le prove.
 */
import puppeteer from "puppeteer-core";

export const BASE = process.env.BASE_URL || "http://localhost:5200/";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// su GitHub non c'è una scheda video: WebGL va in software (SwiftShader)
const ARGS = process.env.CI ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

export async function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: "new", args: ARGS });
}

/** apre il gioco, con una partita salvata (oggetto di stato) e un'ora di partenza; restituisce la pagina e gli errori */
export async function openGame(browser, { save = { packed: true, pack: ["frontale", "giacca"], missions: { zaino: "done" } }, t = 11 } = {}) {
  const page = await browser.newPage();
  const errors = [];
  await page.setViewport({ width: 1280, height: 720 });
  // la partita si prepara da una pagina dello stesso sito che NON avvia il gioco: se si aprisse il gioco e poi si
  // ricaricasse, su un computer lento il primo avvio finirebbe dopo e salverebbe la sua partita vuota sopra questa
  await page.goto(new URL("data/terrain.json", BASE).href, { waitUntil: "load" });
  await page.evaluate((s, ci) => {
    localStorage.clear();
    if (s) localStorage.setItem("montagna-viva:v1", JSON.stringify(s));
    // su GitHub (grafica software, lentissima) la qualità bassa, come la sceglierebbe da solo un computer lento: le prove
    // partono prima che il gioco la misuri
    if (ci) localStorage.setItem("montagna-viva:settings", JSON.stringify({ quality: "bassa" }));
  }, save, !!process.env.CI);
  // da qui contano gli errori (la pagina di preparazione non è il gioco: per esempio le manca l'icona)
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("WebSocket") && !(m.location()?.url ?? "").includes("favicon") && errors.push(`${m.text()} ${m.location()?.url ?? ""}`));
  await page.goto(`${BASE}?debug&t=${t}`, { waitUntil: "load" });
  await page.waitForFunction(() => !document.querySelector("#start").disabled, { timeout: 180000 });
  await page.evaluate(() => document.querySelector("#start").click());
  await page.waitForFunction(() => window.__mv?.started(), { timeout: 30000 });
  await wait(800);
  return { page, errors };
}

/** il testo di un elemento, o "" se non c'è */
export const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", sel);

/** aspetta che `fn` (eseguita nella pagina con `arg`) sia vera; false se non succede entro `ms` (con la grafica software
 * di GitHub il gioco fa pochi fotogrammi al secondo: meglio aspettare una condizione che un tempo fisso) */
export async function until(page, fn, arg, ms = 20000) {
  try {
    await page.waitForFunction(fn, { timeout: ms, polling: 100 }, arg);
    return true;
  } catch {
    return false;
  }
}
