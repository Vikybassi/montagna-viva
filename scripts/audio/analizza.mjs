/**
 * Analizza i suoni scaricati (data-cache/audio-src): durata e volume secondo per secondo, per scegliere i tratti.
 * Decodifica in Chrome (Web Audio legge mp3 e ogg). Uso: node scripts/audio/analizza.mjs [nome…]
 */
import { readFileSync, readdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const SRC = "data-cache/audio-src";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const names = process.argv.slice(2);
const files = readdirSync(SRC).filter((f) => f.endsWith(".mp3") && (!names.length || names.includes(f.replace(".mp3", ""))));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
for (const f of files) {
  const b64 = readFileSync(`${SRC}/${f}`).toString("base64");
  const r = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buf = await ctx.decodeAudioData(bytes.buffer);
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const step = Math.floor(sr / 2); // mezzo secondo
    const db = [];
    for (let i = 0; i + step <= d.length; i += step) {
      let s = 0, pk = 0;
      for (let j = i; j < i + step; j++) (s += d[j] * d[j]), (pk = Math.max(pk, Math.abs(d[j])));
      db.push(Math.round(10 * Math.log10(s / step + 1e-12)));
    }
    return { dur: buf.duration.toFixed(1), ch: buf.numberOfChannels, db };
  }, b64);
  console.log(`${f}: ${r.dur} s, ${r.ch} canali`);
  // una riga ogni 30 secondi, un numero ogni mezzo secondo (dB)
  for (let i = 0; i < r.db.length; i += 60) console.log(`  ${String(i / 2).padStart(4)}s  ${r.db.slice(i, i + 60).join(" ")}`);
}
await browser.close();
