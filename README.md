# Montagna viva

Un gioco tranquillo nella Val Masino vera. Il terreno, i sentieri, i rifugi, le cime, i laghi e i ghiacciai sono
quelli reali (Copernicus GLO-30 e OpenStreetMap); il sole tramonta all'ora giusta. Cammini, fotografi fiori e
animali, impari a muoverti in montagna con prudenza, vedi come cambia un ghiacciaio. Il messaggio: la montagna è viva,
ci si va preparati, con rispetto e con cura.

> Stato: prototipo avanzato, verso la versione 1.0. Il piano è in [ROADMAP.md](ROADMAP.md), le novità in
> [CHANGELOG.md](CHANGELOG.md).

## Avviare il gioco

Serve Node.js 22 o più recente.

```bash
npm install
npm run dev          # il gioco su http://localhost:5200
```

Per giocare in compagnia sulla stessa rete Wi-Fi (facoltativo):

```bash
npm run dev:lan      # il gioco si apre anche dagli altri dispositivi della rete
npm run server       # il server che collega i giocatori (porta 5210)
```

Senza server il gioco funziona lo stesso; la compagnia collega solo le schede aperte nello stesso browser. Il server
(`server/relay.mjs`) non salva niente: inoltra nome generato, colore della giacca, posizione e frasi pronte.

## Comandi

| Tasto | Azione |
|---|---|
| WASD o frecce | cammina (in parete o nel mirino: guarda intorno) |
| Shift | corre, finché c'è fiato |
| Spazio | salta; in aria apre il parapendio; in parete «Calami!» o salta giù |
| Q e R, o trascina | gira la telecamera |
| E | parla, osserva, raccogli, entra |
| Tab | il telefono: missioni, mappa (M), diario (J), zaino (Z), spille, armadio |
| P | la fotocamera: rotella per lo zoom, clic per scattare |
| F | in parete: scuoti le braccia |
| G, T | saluta, messaggio rapido |
| Esc | pausa e impostazioni |

Sul telefono: levetta a sinistra, sguardo a destra, pulsanti a schermo.

## Prove automatiche

```bash
npm test             # prove veloci della logica (tempi di cammino, meteo)
npm run test:e2e     # prove nel browser: avvio, telefono, foto, incontri, temporale, arrampicata
```

Le prove nel browser usano Chrome (`CHROME_PATH` per indicarne un altro) e avviano da sole il gioco se non è già
acceso. Su GitHub, a ogni push, girano la build, le prove veloci e la prova di avvio.

## Struttura

| Cartella | Cosa c'è |
|---|---|
| `src/` | il gioco (TypeScript e three.js): mondo, personaggi, telefono, arrampicata, natura, eventi, tasti, collisioni |
| `src/game/` | le parti del gioco messe insieme da `play.ts`: valle, persone e missioni, strade, temporale, guida |
| `public/data/` | i dati della valle già pronti (terreno e luoghi) |
| `scripts/` | come si costruiscono i dati della valle (`npm run data`, serve la rete) |
| `server/` | il server facoltativo per giocare in compagnia |
| `shared/` | nomi e frasi pronte comuni a gioco e server |
| `tests/` | prove veloci (`unit/`), nel browser (`e2e/`) e l'elenco dei casi limite (`CASI.md`) |

## Dati, crediti e licenze

- Terreno: Copernicus GLO-30 Digital Elevation Model, © DLR e Airbus, programma Copernicus dell'Unione europea.
- Sentieri, rifugi, cime, laghi, ghiacciai, boschi: © [contributori OpenStreetMap](https://www.openstreetmap.org/copyright), licenza ODbL.
- Caratteri: Bricolage Grotesque e Geist Mono (SIL Open Font License). Grafica 3D: three.js (MIT).
- Suoni registrati: Wikimedia Commons (CC0, pubblico dominio, CC BY, CC BY-SA) e Kenney (CC0); autori e licenze in
  [public/audio/CREDITI.md](public/audio/CREDITI.md). Si rigenerano con `npm run audio`.
- Il codice è distribuito con licenza MIT (vedi [LICENSE](LICENSE)); i dati mantengono le loro licenze.

Montagna viva è un gioco: tempi, strade e meteo sono semplificati. Non usarlo per pianificare escursioni vere. In
emergenza chiama il 112.

Ideato e realizzato da Vittoria Bassi.

---

## In English (short)

*Montagna viva* is a calm exploration game set in the real Val Masino (Italian Alps), built with three.js from
Copernicus terrain and OpenStreetMap data. You hike, photograph protected flowers and wildlife, learn mountain safety
and watch a glacier change over time. Run it with `npm install && npm run dev`. The full English version is planned
for release 1.1.
