// Luoghi, sentieri e coperture del suolo della Val Masino, nelle coordinate del gioco (metri):
// x verso est dal bordo ovest, z verso sud dal bordo nord. Fonti: OpenStreetMap (© contributori OSM, ODbL),
// in parte già scaricate per Rientro prima del buio (sentieri, rifugi, cime), in parte da Overpass (data-cache/).
import { readFile, readdir, writeFile } from "node:fs/promises";
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

// fontane e sorgenti vere (amenity=drinking_water, man_made=water_tap, natural=spring): si beve e si riempie la borraccia.
// d = acqua potabile, t = rubinetto, s = sorgente. Punti a meno di 30 m uno dall'altro contano come uno.
const placesAll = JSON.parse(await readFile(`${R}/places.json`, "utf8")).elements;
const springs = [];
for (const e of [...stops, ...placesAll]) {
  const t = e.tags ?? {};
  const k = t.amenity === "drinking_water" ? "d" : t.man_made === "water_tap" ? "t" : t.natural === "spring" ? "s" : null;
  const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
  if (!k || la === undefined || !inBox(la, lo)) continue;
  const p = P(la, lo);
  if (springs.some((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < 30)) continue;
  springs.push({ name: t.name ?? null, k, p });
}

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

// la rete segnata del CAI: i tratti che fanno parte di un percorso escursionistico di OpenStreetMap (relazioni
// route=hiking, con il loro numero o nome, es. 321 o "Sentiero Roma"), quelli con il numero sul tratto stesso, e come
// riserva quelli che corrono lungo un itinerario numerato. Le tracce informali o poco visibili restano, in secondo piano.
const wayRoute = new Map();
for (const f of await readdir(`${R}/osm`)) {
  if (!f.startsWith("relation-")) continue;
  let d;
  try {
    d = JSON.parse(await readFile(`${R}/osm/${f}`, "utf8"));
  } catch {
    continue;
  }
  for (const r of d.elements ?? [d]) {
    if (r.type !== "relation" || r.tags?.route !== "hiking") continue;
    const label = r.tags.ref ?? (r.tags.name?.match(/Sentiero Roma|Sentiero Italia|Alta Via[^-–]*/)?.[0]?.trim() ?? "");
    for (const m of r.members ?? []) if (m.type === "way" && (!wayRoute.has(m.ref) || (!wayRoute.get(m.ref) && label))) wayRoute.set(m.ref, label);
  }
}
const itins = JSON.parse(await readFile(`${R}/itineraries.json`, "utf8")).filter((it) => !it.unmarked && it.refs?.length);
const IG = 60, igrid = new Map();
for (const it of itins) {
  const pts = project(it.line);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 10));
    for (let j = 0; j <= n; j++) {
      const x = ax + ((bx - ax) * j) / n, y = ay + ((by - ay) * j) / n, key = `${Math.floor(x / IG)},${Math.floor(y / IG)}`;
      (igrid.get(key) ?? igrid.set(key, []).get(key)).push([x, y, it.refs]);
    }
  }
}
/** il numero CAI dell'itinerario lungo cui corre un tratto (null se non ne segue nessuno) */
function itineraryRef(pts) {
  let near = 0, total = 0;
  const refs = new Map();
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 10));
    for (let j = 0; j < n; j++) {
      const x = ax + ((bx - ax) * j) / n, y = ay + ((by - ay) * j) / n;
      total++;
      let best = null, bd = 15;
      for (let gx = -1; gx <= 1; gx++)
        for (let gy = -1; gy <= 1; gy++)
          for (const q of igrid.get(`${Math.floor(x / IG) + gx},${Math.floor(y / IG) + gy}`) ?? []) {
            const d = Math.hypot(q[0] - x, q[1] - y);
            if (d < bd) (bd = d), (best = q);
          }
      if (best) {
        near++;
        for (const r of best[2]) refs.set(r, (refs.get(r) ?? 0) + 1);
      }
    }
  }
  if (!total || near / total < 0.6) return null;
  // il numero più frequente, preferendo quelli numerici (i sentieri CAI); "SI" e simili solo se non c'è altro
  const sorted = [...refs.entries()].sort((a, b) => (/^\d/.test(b[0]) - /^\d/.test(a[0])) || b[1] - a[1]);
  return sorted[0]?.[0] ?? "";
}
const uses = new Map();
for (const w of kept) w.nodes.forEach((n, i) => { if (inBox(w.coords[i][0], w.coords[i][1])) uses.set(n, (uses.get(n) ?? 0) + 1); });
const paths = [];
for (const w of kept) {
  const hw = w.tags.highway;
  const k = isRoad(hw) ? "r" : hw === "track" ? "t" : w.tags?.sac_scale?.startsWith("demanding") || w.tags?.sac_scale?.includes("alpine") ? "a" : "p";
  let piece = [];
  const faint = w.tags?.informal === "yes" || ["bad", "horrible", "no"].includes(w.tags?.trail_visibility);
  const flush = () => {
    if (piece.length < 2) return;
    const pts = simplify(project(piece), 6);
    const rec = { k, pts };
    if (k !== "r") {
      const ref = wayRoute.has(w.id) ? wayRoute.get(w.id) || w.tags?.ref || "" : w.tags?.ref ?? itineraryRef(pts);
      if (ref !== null && ref !== undefined) {
        rec.m = 1;
        if (ref) rec.ref = String(ref).split(";")[0];
      } else if (faint) rec.f = 1;
    }
    paths.push(rec);
  };
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
const world = { size: [meta.widthM, meta.heightM], huts, peaks, views, springs, remenno, paths, streams, cover,
  credits: "Mappe © contributori OpenStreetMap (ODbL); terreno Copernicus GLO-30 © DLR e Airbus" };
await writeFile("public/data/world.json", JSON.stringify(world));
console.log({ crosses: peaks.filter((p) => p.cross).length, views: views.length, huts: huts.length, peaks: peaks.length, paths: paths.length, streams: streams.length, water: cover.water.length, glacier: cover.glacier.length, forest: cover.forest.length, remenno, kb: Math.round(JSON.stringify(world).length / 1024) });
