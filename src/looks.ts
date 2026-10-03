/**
 * Come sono vestite le persone della valle: colori allegri e pieni, come in un cartone (giacche vivaci, pantaloni e
 * scarpe colorati, un colletto a contrasto), carnagioni e capelli diversi. Un posto solo per tutti i personaggi.
 */
export type Look = { jacket: string; pants: string; hat: string; pack: string; hair: string; skin: string; shoes: string; accent: string };

const SKIN = { chiara: "#f5d0b5", rosa: "#f0c3a6", olivastra: "#e0a98a", ambra: "#c98c6b", scura: "#8d5a3b" };

export const LOOKS: Record<string, Look> = {
  // la guida: giacca turchese, pantaloni arancio da montagna, berretto corallo
  Marta: { jacket: "#22b3a3", pants: "#ff8a3d", hat: "#ff5e6c", pack: "#ffc93c", hair: "#3a2a20", skin: SKIN.rosa, shoes: "#5b3b24", accent: "#fff3d6" },
  // i custodi: Giulio in pile verde prato e berretto rosso; Sara in blu con il cappello arancio
  Giulio: { jacket: "#6cc24a", pants: "#7a4b2a", hat: "#e2453c", pack: "#3f7d4f", hair: "#c9c2b8", skin: SKIN.olivastra, shoes: "#3b2a20", accent: "#ffd84d" },
  Sara: { jacket: "#4f8ef0", pants: "#2d3f73", hat: "#ff9f43", pack: "#ff7b6b", hair: "#7a3e22", skin: SKIN.chiara, shoes: "#e2453c", accent: "#ffffff" },
  // la glaciologa: giallo ben visibile sul ghiacciaio, pantaloni turchese, berretto viola
  Elena: { jacket: "#ffc93c", pants: "#2fa7b8", hat: "#8f6fd6", pack: "#ff5e8a", hair: "#2a1f1a", skin: SKIN.ambra, shoes: "#3b3550", accent: "#ff5e8a" },
  // gli incontri sui sentieri
  Luca: { jacket: "#7aa7ff", pants: "#ffb347", hat: "#3b3550", pack: "#ff7b6b", hair: "#e0b04a", skin: SKIN.chiara, shoes: "#ffffff", accent: "#ffd84d" },
  Giorgia: { jacket: "#ff8fc7", pants: "#ffffff", hat: "#ffd84d", pack: "#7dd56f", hair: "#2a1f1a", skin: SKIN.scura, shoes: "#ffd84d", accent: "#b47cff" },
  Rosa: { jacket: "#fff3d6", pants: "#e2453c", hat: "#ffffff", pack: "#ff5e6c", hair: "#9a5a3a", skin: SKIN.rosa, shoes: "#7a4b2a", accent: "#ff5e6c" },
  Tommaso: { jacket: "#ff9f43", pants: "#4f8ef0", hat: "#e2453c", pack: "#22b3a3", hair: "#3a2a20", skin: SKIN.olivastra, shoes: "#e2453c", accent: "#ffd84d" },
  // chi arrampica: Davide al Sasso Remenno, e chi para sui blocchi
  Davide: { jacket: "#3fbf6a", pants: "#3b3550", hat: "#ffffff", pack: "#ff5e6c", hair: "#2a1f1a", skin: SKIN.ambra, shoes: "#ff9f43", accent: "#ffd84d" },
  Sofia: { jacket: "#ff6fae", pants: "#22b3a3", hat: "#22b3a3", pack: "#3b3550", hair: "#3a2a20", skin: SKIN.chiara, shoes: "#ffffff", accent: "#ffd84d" },
  Pietro: { jacket: "#4f8ef0", pants: "#ffc93c", hat: "#ffc93c", pack: "#ff9f43", hair: "#8a5a3a", skin: SKIN.scura, shoes: "#3b3550", accent: "#ffffff" },
  Irene: { jacket: "#ffc93c", pants: "#b47cff", hat: "#ff5e6c", pack: "#22b3a3", hair: "#c9a440", skin: SKIN.rosa, shoes: "#22b3a3", accent: "#ff5e6c" },
  Matteo: { jacket: "#6cc24a", pants: "#3b3550", hat: "#3b3550", pack: "#ff5e6c", hair: "#2a1f1a", skin: SKIN.olivastra, shoes: "#ff9f43", accent: "#ff9f43" },
};

/** gli escursionisti che passano: combinazioni diverse, sempre le stesse per lo stesso numero */
const JACKETS = ["#ff7b6b", "#ffc93c", "#4fc3a1", "#5b8def", "#b47cff", "#ff8fc7", "#7dd56f", "#ff9f43", "#3fbfd1", "#ff5e6c"];
const PANTS = ["#3b4a8a", "#2f6f8f", "#6b4a8a", "#f2b632", "#e05a8f", "#4a4f5a", "#2fa7b8", "#7a4b2a"];
const HAIR = ["#3a2a20", "#8a5a3a", "#e0b04a", "#c9c2b8", "#9a3e22", "#1f1a1d"];
const SKINS = Object.values(SKIN);
export function walkerLook(i: number): Look {
  const jacket = JACKETS[i % JACKETS.length];
  return {
    jacket,
    pants: PANTS[(i * 3) % PANTS.length],
    hat: JACKETS[(i + 4) % JACKETS.length],
    pack: JACKETS[(i + 7) % JACKETS.length],
    hair: HAIR[(i * 5) % HAIR.length],
    skin: SKINS[(i * 2 + 1) % SKINS.length],
    shoes: ["#5b3b24", "#ffffff", "#3b3550", "#e2453c"][i % 4],
    accent: ["#ffffff", "#ffd84d", "#3b3550", "#ff5e6c"][(i + 1) % 4],
  };
}
