// Ritaglia la Val Masino dal modello del terreno Copernicus GLO-30 (le tessere scaricate per Rientro prima del buio)
// e la salva come griglia di quote in metri (Uint16, riga per riga da nord a sud, colonne da ovest a est).
import { fromFile } from "geotiff";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";

export const BBOX = { south: 46.19, north: 46.31, west: 9.55, east: 9.78 };
const STEP = 40; // metri tra un punto e l'altro della griglia del gioco
const TILE = `${homedir()}/Desktop/rientro-prima-del-buio/data-cache/dem/Copernicus_DSM_COG_10_N46_00_E009_00_DEM.tif`;

const tiff = await fromFile(TILE);
const img = await tiff.getImage();
const [W, H] = [img.getWidth(), img.getHeight()];
const [ox, oy] = img.getOrigin();
const [rx, ry] = img.getResolution(); // gradi per pixel (ry negativo)
const col = (lon) => (lon - ox) / rx;
const row = (lat) => (lat - oy) / ry;
const x0 = Math.floor(col(BBOX.west)), x1 = Math.ceil(col(BBOX.east));
const y0 = Math.floor(row(BBOX.north)), y1 = Math.ceil(row(BBOX.south));
const [raster] = await img.readRasters({ window: [x0, y0, x1, y1] });
const sw = x1 - x0, sh = y1 - y0;

const lat0 = (BBOX.north + BBOX.south) / 2;
const mPerDegLat = 111_320, mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
const widthM = (BBOX.east - BBOX.west) * mPerDegLon, heightM = (BBOX.north - BBOX.south) * mPerDegLat;
const cols = Math.round(widthM / STEP) + 1, rows = Math.round(heightM / STEP) + 1;

// ricampionamento bilineare sulla griglia regolare in metri
const at = (x, y) => raster[Math.min(sh - 1, Math.max(0, y)) * sw + Math.min(sw - 1, Math.max(0, x))];
const out = new Uint16Array(cols * rows);
let lo = 1e9, hi = -1e9;
for (let r = 0; r < rows; r++) {
  const lat = BBOX.north - (r / (rows - 1)) * (BBOX.north - BBOX.south);
  const fy = row(lat) - y0;
  for (let c = 0; c < cols; c++) {
    const lon = BBOX.west + (c / (cols - 1)) * (BBOX.east - BBOX.west);
    const fx = col(lon) - x0;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const h = at(ix, iy) * (1 - tx) * (1 - ty) + at(ix + 1, iy) * tx * (1 - ty) + at(ix, iy + 1) * (1 - tx) * ty + at(ix + 1, iy + 1) * tx * ty;
    out[r * cols + c] = Math.round(h);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
}
await writeFile("public/data/terrain.bin", Buffer.from(out.buffer));
const meta = { bbox: BBOX, cols, rows, step: STEP, widthM: Math.round(widthM), heightM: Math.round(heightM), min: Math.round(lo), max: Math.round(hi), source: "Copernicus GLO-30 DEM, © DLR e Airbus (programma Copernicus)" };
await writeFile("public/data/terrain.json", JSON.stringify(meta, null, 2));
console.log(meta);
