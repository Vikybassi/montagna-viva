/**
 * Prepara i suoni del gioco dai file scaricati (data-cache/audio-src, vedi fonti.json):
 * - gli ambienti diventano anelli senza stacchi (dissolvenza incrociata tra fine e inizio), a volume uguale;
 * - i versi e i colpi si ritagliano, con attacco e coda morbidi;
 * - tutto in mono (la posizione nello spazio la fa il gioco), poi AAC (afconvert del Mac) in public/audio.
 * Decodifica e taglio in Chrome (Web Audio legge mp3 e ogg). Uso: node scripts/audio/prepara.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const SRC = "data-cache/audio-src", OUT = "public/audio", TMP = "data-cache/audio-tmp";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// anelli: [nome, sorgente, inizio s, fine s, dissolvenza s]
const LOOPS = [
  ["vento", "vento.mp3", 62, 88, 2],
  ["torrente", "torrente.mp3", 20, 44, 2],
  ["ruscello", "ruscello.mp3", 0.5, 15.5, 1.5],
  ["uccelli", "uccelli.mp3", 125, 157, 2],
  ["grilli", "grilli.mp3", 31.6, 39.6, 1],
  ["campanacci", "campanacci.mp3", 1.5, 26.5, 2],
  ["pioggia", "temporale.mp3", 180, 206, 2],
  ["elicottero", "elicottero.mp3", 9.5, 16.5, 1],
];
// colpi: [nome, sorgente, inizio s, fine s]
const SHOTS = [
  ["aquila", "aquila.mp3", 0, 3.9],
  ["gracchio", "gracchio.mp3", 0, 2.9],
  ["marmotta-1", "marmotta.mp3", 0.9, 2.7],
  ["marmotta-2", "marmotta.mp3", 11.4, 14],
  ["tuono-1", "temporale.mp3", 21.5, 29.5],
  ["tuono-2", "temporale.mp3", 96, 104],
  ["tuono-3", "temporale.mp3", 137.5, 145.5],
  ["tuono-4", "temporale.mp3", 226, 234],
  ["tuffo-1", "tuffo.mp3", 3.3, 4.7],
  ["tuffo-2", "tuffo.mp3", 6.4, 7.9],
  ["tuffo-3", "tuffo.mp3", 25, 26.4],
];
// i passi di Kenney (CC0): erba, roccia, neve, cinque per tipo
for (const [k, n] of [["erba", "grass"], ["roccia", "concrete"], ["neve", "snow"]])
  for (let i = 0; i < 5; i++) SHOTS.push([`passo-${k}-${i}`, `passi/footstep_${n}_00${i}.ogg`, 0, 99]);

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
const cache = new Map();
async function render(name, file, a, b, xf) {
  if (!cache.has(file)) {
    await page.evaluate(() => (window.__buf = null));
    const b64 = readFileSync(`${SRC}/${file}`).toString("base64");
    await page.evaluate(async (b64, key) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.buffer);
      // mono
      const n = buf.length, m = new Float32Array(n);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < n; i++) m[i] += d[i] / buf.numberOfChannels;
      }
      (window.__src ??= {})[key] = { m, sr: buf.sampleRate };
    }, b64, file);
    cache.set(file, true);
  }
  const wav = await page.evaluate((file, a, b, xf) => {
    const { m, sr } = window.__src[file];
    const s = Math.floor(a * sr), e = Math.min(m.length, Math.floor(b * sr));
    let out;
    if (xf > 0) {
      // anello: la coda si dissolve dentro l'inizio (potenza costante)
      const X = Math.floor(xf * sr), L = e - s - X;
      out = new Float32Array(L);
      for (let i = 0; i < L; i++) out[i] = m[s + i];
      for (let i = 0; i < X; i++) {
        const t = i / X;
        out[i] = m[s + i] * Math.sin((t * Math.PI) / 2) + m[s + L + i] * Math.cos((t * Math.PI) / 2);
      }
      // stesso volume per tutti gli ambienti: -20 dBFS di media
      let q = 0;
      for (const v of out) q += v * v;
      const g = 0.1 / Math.sqrt(q / out.length);
      let pk = 0;
      for (const v of out) pk = Math.max(pk, Math.abs(v * g));
      const k = pk > 0.97 ? (g * 0.97) / pk : g;
      for (let i = 0; i < L; i++) out[i] *= k;
    } else {
      out = m.slice(s, e);
      // attacco 10 ms, coda 15%; picco a -1 dBFS
      const A = Math.floor(0.01 * sr), T = Math.floor(out.length * 0.15);
      for (let i = 0; i < A; i++) out[i] *= i / A;
      for (let i = 0; i < T; i++) out[out.length - 1 - i] *= i / T;
      let pk = 0;
      for (const v of out) pk = Math.max(pk, Math.abs(v));
      for (let i = 0; i < out.length; i++) out[i] *= 0.89 / (pk || 1);
    }
    // WAV 16 bit mono
    const buf = new ArrayBuffer(44 + out.length * 2), v = new DataView(buf);
    const w = (o, str) => [...str].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    w(0, "RIFF"); v.setUint32(4, 36 + out.length * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, out.length * 2, true);
    for (let i = 0; i < out.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, out[i])) * 32767, true);
    let bin = "";
    const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return { b64: btoa(bin), dur: out.length / sr };
  }, file, a, b, xf);
  const tmp = `${TMP}/${name}.wav`;
  writeFileSync(tmp, Buffer.from(wav.b64, "base64"));
  // AAC: 64 kbit/s per gli ambienti, 48 per i colpi brevi
  execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", String(xf > 0 ? 64000 : 48000), tmp, `${OUT}/${name}.m4a`]);
  console.log(`${name.padEnd(18)} ${wav.dur.toFixed(1).padStart(5)} s`);
}
for (const [n, f, a, b, x] of LOOPS) await render(n, f, a, b, x);
for (const [n, f, a, b] of SHOTS) await render(n, f, a, b, 0);
await browser.close();
rmSync(TMP, { recursive: true, force: true });
