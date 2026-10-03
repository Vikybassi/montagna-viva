/**
 * I crediti dei suoni, da data-cache/audio-src/fonti.json (scritto quando si scaricano) più i passi di Kenney:
 * public/audio/CREDITI.md (per chi legge il codice) e src/sound-credits.ts (per i crediti nel gioco).
 * Uso: node scripts/audio/crediti.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const fonti = JSON.parse(readFileSync("data-cache/audio-src/fonti.json", "utf8"));
const USE = { vento: "vento", torrente: "torrente", ruscello: "ruscello", uccelli: "uccelli del bosco", grilli: "grilli", campanacci: "campanacci", marmotta: "marmotta", aquila: "aquila reale", gracchio: "gracchio alpino", temporale: "pioggia e tuoni", elicottero: "elicottero", tuffo: "tuffi" };
const rows = Object.entries(USE).map(([k, use]) => ({ use, ...fonti[k], title: fonti[k].title.replace(/^File:/, "") }));
rows.push({ use: "passi (erba, roccia, neve)", title: "Impact Sounds", artist: "Kenney (kenney.nl)", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", page: "https://github.com/Boyquotes/kenney-impact-sounds-for-godot" });

const md = [
  "# Crediti dei suoni",
  "",
  "Registrazioni tagliate, rese mono e compresse in AAC da `scripts/audio/prepara.mjs`. I file con licenza CC BY-SA",
  "restano con la loro licenza.",
  "",
  "| Suono nel gioco | Registrazione | Autore | Licenza |",
  "|---|---|---|---|",
  ...rows.map((r) => `| ${r.use} | [${r.title}](${r.page}) | ${r.artist} | ${r.licenseUrl ? `[${r.license}](${r.licenseUrl})` : r.license} |`),
  "",
].join("\n");
writeFileSync("public/audio/CREDITI.md", md);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const html = rows.map((r) => `${esc(r.use)}: <a href="${esc(r.page)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>, ${esc(r.artist)} (${esc(r.license)})`).join("; ");
writeFileSync("src/sound-credits.ts", `// generato da scripts/audio/crediti.mjs: non modificare a mano\nexport const SOUND_CREDITS = ${JSON.stringify(html)};\n`);
console.log(md);
