import * as THREE from "three";
import { S, type Place, type Terrain, type WorldData } from "./world";

/**
 * Segnavia e cartelli del CAI. I segnavia (bianco e rosso) sono piccoli paletti lungo i sentieri, uno ogni 100 m circa.
 * I cartelli stanno ai rifugi e ai paesi: leggendoli si vedono le mete vicine con un tempo di percorrenza indicativo,
 * calcolato con la formula usata dai cartelli (4 km/h in piano, 300 m/h in salita, 500 m/h in discesa) su una distanza
 * stimata (la linea d'aria allungata del 35%, perché i sentieri non vanno dritti).
 */
export type Signpost = { pos: THREE.Vector3; place: Place; lines: { name: string; ele: number | null; time: string; dir: number }[] };

function walkTime(t: Terrain, a: Place, b: Place) {
  const dx = (b.p[0] - a.p[0]), dz = (b.p[1] - a.p[1]);
  const km = (Math.hypot(dx, dz) * 1.35) / 1000;
  const h0 = t.heightAt(a.p[0] * S, a.p[1] * S) / S, h1 = t.heightAt(b.p[0] * S, b.p[1] * S) / S;
  const th = km / 4, tv = h1 > h0 ? (h1 - h0) / 300 : (h0 - h1) / 500;
  const hours = Math.max(th, tv) + Math.min(th, tv) / 2;
  const mins = Math.max(5, Math.round((hours * 60) / 5) * 5);
  return { mins, text: mins < 60 ? `${mins}'` : `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60}'` : ""}` };
}

export function buildSigns(t: Terrain, data: WorldData) {
  const group = new THREE.Group();

  // ----- segnavia: paletto con le tre bande rosso-bianco-rosso (una piccola texture) -----
  const cv = document.createElement("canvas");
  cv.width = 4;
  cv.height = 12;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#d22a2a";
  g.fillRect(0, 0, 4, 12);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 4, 4, 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const postGeo = new THREE.BoxGeometry(0.16, 0.9, 0.16);
  postGeo.translate(0, 0.45, 0);
  const spots: THREE.Vector3[] = [];
  const every = 100 * S; // un segnavia ogni 100 m veri
  for (const path of data.paths) {
    if (path.k === "t" || path.k === "r") continue;
    let acc = every * 0.5;
    for (let i = 0; i < path.pts.length - 1; i++) {
      const ax = path.pts[i][0] * S, az = path.pts[i][1] * S, bx = path.pts[i + 1][0] * S, bz = path.pts[i + 1][1] * S;
      const len = Math.hypot(bx - ax, bz - az);
      let d = every - acc;
      while (d <= len) {
        const k = d / len, x = ax + (bx - ax) * k, z = az + (bz - az) * k;
        // un po' di lato rispetto al sentiero
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        const px = x + nx * 1.1, pz = z + nz * 1.1;
        spots.push(new THREE.Vector3(px, t.heightAt(px, pz) - 0.05, pz));
        d += every;
      }
      acc = (acc + len) % every;
    }
  }
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), spots.length);
  const o = new THREE.Object3D();
  spots.forEach((p, i) => {
    o.position.copy(p);
    o.rotation.y = (i * 2.399) % Math.PI;
    o.updateMatrix();
    posts.setMatrixAt(i, o.matrix);
  });
  posts.castShadow = true;
  group.add(posts);

  // ----- cartelli ai rifugi e ai paesi -----
  const pole = new THREE.MeshStandardMaterial({ color: "#8a8f96", roughness: 0.6, metalness: 0.4 });
  const board = new THREE.MeshStandardMaterial({ color: "#f6f2ea", roughness: 0.6 });
  const tip = new THREE.MeshStandardMaterial({ color: "#d22a2a", roughness: 0.6 });
  const boardGeo = new THREE.BoxGeometry(1.7, 0.36, 0.06);
  boardGeo.translate(0.85, 0, 0);
  const tipGeo = new THREE.BoxGeometry(0.34, 0.36, 0.07);
  tipGeo.translate(1.55, 0, 0);
  const signposts: Signpost[] = [];
  const hubs = data.huts.filter((h) => h.kind === "rifugio" || h.kind === "paese");
  for (const a of hubs) {
    const near = data.huts
      .filter((b) => b !== a && (b.kind === "rifugio" || b.kind === "paese" || b.kind === "bivacco"))
      .map((b) => ({ b, d: Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]) }))
      .filter((x) => x.d < 7000)
      .sort((x, y) => x.d - y.d)
      .slice(0, 4);
    if (!near.length) continue;
    // il cartello sta un po' fuori dal centro, verso la prima meta
    const first = near[0].b;
    const dir0 = Math.atan2(first.p[0] - a.p[0], first.p[1] - a.p[1]);
    const x = a.p[0] * S + Math.sin(dir0) * (a.kind === "paese" ? 48 : 12), z = a.p[1] * S + Math.cos(dir0) * (a.kind === "paese" ? 48 : 12);
    const y = t.heightAt(x, z);
    const sg = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), pole);
    p.position.y = 1.6;
    sg.add(p);
    const lines = near.map(({ b }, i) => {
      const dir = Math.atan2(b.p[0] - a.p[0], b.p[1] - a.p[1]);
      const arm = new THREE.Group();
      arm.add(new THREE.Mesh(boardGeo, board), new THREE.Mesh(tipGeo, tip));
      arm.position.y = 2.9 - i * 0.42;
      arm.rotation.y = dir - Math.PI / 2; // la tavola punta verso la meta
      sg.add(arm);
      return { name: b.name, ele: b.ele, time: walkTime(t, a, b).text, dir };
    });
    sg.position.set(x, y, z);
    sg.traverse((m) => ((m as THREE.Mesh).castShadow = true));
    group.add(sg);
    signposts.push({ pos: new THREE.Vector3(x, y, z), place: a, lines });
  }
  return { group, signposts, marks: spots };
}
