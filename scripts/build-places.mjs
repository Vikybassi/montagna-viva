// Luoghi, sentieri e coperture del suolo della Val Masino, nelle coordinate del gioco (metri):
// x verso est dal bordo ovest, z verso sud dal bordo nord. Fonti: OpenStreetMap (© contributori OSM, ODbL),
// in parte già scaricate per Rientro prima del buio (sentieri, rifugi, cime), in parte da Overpass (data-cache/).
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";

const meta = JSON.parse(await readFile("public/data/terrain.json", "utf8"));
const B = meta.bbox;
const lat0 = (B.north + B.south) / 2;
const MLAT = 111_320, MLON = 111_320 * Math.cos((lat0 * Math.PI) / 180);
const inBox = (lat, lon) => lat >= B.south && lat <= B.north && lon >= B.west && lon <= B.east;
const P = (lat, lon) => [Math.round((lon - B.west) * MLON), Math.round((B.north - lat) * MLAT)];
const R = `${homedir()}/Desktop/rientro-prima-del-buio/data-cache`;

// semplificazione Douglas-Peucker (metri)
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let best = 0, idx = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.hypot(dx, dz) ? Math.abs(dz * (pts[i][0] - ax) - dx * (pts[i][1] - az)) / L : Math.hypot(pts[i][0] - ax, pts[i][1] - az); if (d > best) { best = d; idx = i; } } // anelli chiusi: estremi coincidenti, si misura dal punto
    if (best > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const project = (coords) => coords.map(([la, lo]) => P(la, lo));

// rifugi e bivacchi
const places = JSON.parse(await readFile(`${R}/places.json`, "utf8")).elements;
const huts = [];
for (const e of places) {
  const t = e.tags || {}; const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
  if (!la || !inBox(la, lo) || !t.name) continue;
  if (t.tourism === "alpine_hut" || t.tourism === "wilderness_hut") huts.push({ name: t.name, kind: t.tourism === "alpine_hut" ? "rifugio" : "bivacco", ele: t.ele ? Math.round(+t.ele) : null, p: P(la, lo) });
  if (t.place === "village" || t.place === "hamlet") huts.push({ name: t.name, kind: "paese", ele: t.ele ? Math.round(+t.ele) : null, p: P(la, lo) });
  if (t.name === "Casera del Desenigo") huts.push({ name: t.name, kind: "alpeggio", ele: 1895, p: P(la, lo) });
}
// cime con nome
const stops = JSON.parse(await readFile(`${R}/stops.json`, "utf8")).elements;
const peaks = stops.filter((e) => e.tags?.natural === "peak" && e.tags?.name && inBox(e.lat, e.lon))
  .map((e) => ({ name: e.tags.name, ele: e.tags.ele ? Math.round(+e.tags.ele) : null, p: P(e.lat, e.lon), cross: e.tags["summit:cross"] === "yes" }));
// belvedere (tourism=viewpoint)
const views = stops.filter((e) => e.tags?.tourism === "viewpoint" && inBox(e.lat, e.lon))
  .map((e) => ({ name: e.tags.name ?? null, p: P(e.lat, e.lon) }));

// sentieri: si spezzano agli incroci (nodi OSM in comune tra più vie), così ogni incrocio resta un punto preciso e la
// rete si può percorrere come un grafo (per suggerire la strada verso un rifugio)
const allPaths = JSON.parse(await readFile(`${R}/paths.json`, "utf8"));
// le strade di valle (asfalto e sterrate di servizio): servono a collegare i sentieri tra loro, es. San Martino – Bagni di Masino
const roads = JSON.parse(await readFile(`${R}/roads.json`, "utf8")).map((w) => ({ ...w, tags: w.tags ?? { highway: w.highway } }));
const kept = [
  ...allPaths.filter((w) => ["path", "footway", "track"].includes(w.tags?.highway)),
  ...roads.filter((w) => ["secondary", "tertiary", "unclassified", "residential", "service", "living_street", "track"].includes(w.tags.highway)),
];
const isRoad = (hw) => !["path", "footway", "track"].includes(hw);
const uses = new Map();
for (const w of kept) w.nodes.forEach((n, i) => { if (inBox(w.coords[i][0], w.coords[i][1])) uses.set(n, (uses.get(n) ?? 0) + 1); });
const paths = [];
for (const w of kept) {
  const hw = w.tags.highway;
  const k = isRoad(hw) ? "r" : hw === "track" ? "t" : w.tags?.sac_scale?.startsWith("demanding") || w.tags?.sac_scale?.includes("alpine") ? "a" : "p";
  let piece = [];
  const flush = () => { if (piece.length >= 2) paths.push({ k, pts: simplify(project(piece), 6) }); };
  for (let i = 0; i < w.coords.length; i++) {
    const c = w.coords[i];
    if (!inBox(c[0], c[1])) { flush(); piece = []; continue; }
    piece.push(c);
    if (i > 0 && i < w.coords.length - 1 && (uses.get(w.nodes[i]) ?? 0) > 1) { flush(); piece = [c]; }
  }
  flush();
}

// coperture da Overpass: anelli esterni (anche dalle relazioni, unendo i pezzi)
const osm = JSON.parse(await readFile("data-cache/osm-valmasino.json", "utf8")).elements;
const key = (pt) => `${pt.lat.toFixed(7)},${pt.lon.toFixed(7)}`;
function rings(rel) {
  const segs = rel.members.filter((m) => m.type === "way" && m.role !== "inner" && m.geometry).map((m) => m.geometry.slice());
  const out = [];
  while (segs.length) {
    let ring = segs.shift();
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], end = key(ring[ring.length - 1]);
        if (key(s[0]) === end) { ring = ring.concat(s.slice(1)); segs.splice(i, 1); grew = true; break; }
        if (key(s[s.length - 1]) === end) { ring = ring.concat(s.slice(0, -1).reverse()); segs.splice(i, 1); grew = true; break; }
      }
    }
    out.push(ring);
  }
  return out;
}
const cover = { water: [], glacier: [], forest: [] }, streams = [];
let remenno = null;
for (const e of osm) {
  const t = e.tags || {};
  if (t.name === "Sasso Remenno" && e.type === "node") remenno = P(e.lat, e.lon);
  const kind = t.natural === "water" ? "water" : t.natural === "glacier" ? "glacier" : t.landuse === "forest" || t.natural === "wood" ? "forest" : null;
  if (t.waterway === "stream" || t.waterway === "river") { if (e.geometry) streams.push({ r: t.waterway === "river" ? 1 : 0, pts: simplify(e.geometry.map((g) => P(g.lat, g.lon)), 8) }); continue; }
  if (!kind) continue;
  const rs = e.type === "relation" ? rings(e) : e.geometry ? [e.geometry] : [];
  for (const r of rs) if (r.length > 3) cover[kind].push(simplify(r.map((g) => P(g.lat, g.lon)), kind === "forest" ? 15 : 6));
}
const world = { size: [meta.widthM, meta.heightM], huts, peaks, views, remenno, paths, streams, cover,
  credits: "Mappe © contributori OpenStreetMap (ODbL); terreno Copernicus GLO-30 © DLR e Airbus" };
await writeFile("public/data/world.json", JSON.stringify(world));
console.log({ crosses: peaks.filter((p) => p.cross).length, views: views.length, huts: huts.length, peaks: peaks.length, paths: paths.length, streams: streams.length, water: cover.water.length, glacier: cover.glacier.length, forest: cover.forest.length, remenno, kb: Math.round(JSON.stringify(world).length / 1024) });
