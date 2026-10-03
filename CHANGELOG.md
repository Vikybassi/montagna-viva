# Novità

Le versioni seguono le tappe della [roadmap](ROADMAP.md).

## 0.2.0 · M1, architettura e logiche (in arrivo)

Dentro il gioco cambia poco a vista, ma tutto è più solido: regole chiare per cosa seguire, tasti che fanno una cosa
sola, muri veri, orologio che può saltare senza rompere niente.

**Cosa si nota giocando**

- Case, rifugi, bivacchi, campanili e tronchi sono solidi: si scivola lungo i muri, la telecamera non entra nelle case.
- Ai bivi a T la strada dice sempre da che parte andare (prima a volte taceva).
- Chiudere con E l'ultimo dialogo vicino a una persona non fa ripartire la conversazione.
- Dormendo durante un temporale, la mattina dopo è sereno, senza arcobaleno notturno e senza telefonate di Marta per un
  temporale già finito.
- Dal secondo giorno in poi: rientro «con la luce», avviso del buio (una volta per sera) e consigli di Giulio giusti.
- Pausa: esporta e importa la partita in un file; un salvataggio rotto non blocca il gioco (se ne tiene una copia).
- In parete braccia e gambe non si incrociano più (il modello aveva sinistra e destra scambiate).
- Col temporale in arrivo l'obiettivo diventa il riparo appena Marta chiama, non quando inizia a piovere.
- Le persone rispondono sempre, anche a commissione accettata o finita (Rosa non resta più muta).
- Telefono: nuova scheda **Foto** con l'album e il taccuino del naturalista; un tocco ingrandisce la foto.
- Il telefonino nell'angolo è più grande.
- Al rientro nel gioco: «Bentornata», con la missione o la commissione in corso e la scelta di continuare o metterla in
  pausa.
- Le persone si girano verso di te quando ti avvicini (anche Rosa, Giorgia, Tommaso, Luca e chi para sui blocchi).
- Ai confini della mappa: niente più vuoto, ma creste nella foschia e un avviso.
- **Suoni registrati veri** al posto dei sintetizzati: vento, torrente e ruscello, uccelli, grilli, pioggia e tuoni,
  campanacci (ogni mucca il suo), marmotta, aquila, gracchi in quota, elicottero, tuffi, passi su erba, roccia e neve.
  Fonti e licenze in [public/audio/CREDITI.md](public/audio/CREDITI.md) e nei crediti del gioco; `npm run audio` li
  rigenera.
- Rifare una missione già fatta (dal menu di Marta) riparte da zero; prima i passi risultavano già tutti fatti e
  l'obiettivo in alto restava vuoto. I salvataggi rimasti bloccati così si sbloccano da soli.
- Nel telefono le missioni iniziate e lasciate a metà hanno il pulsante «Riprendi».
- **Bere**: borraccia con sette sorsi (<kbd>B</kbd> o il pulsante, che mostra quanta acqua resta), sete che cresce
  camminando, di più correndo e in salita; con tanta sete il fiato dura meno e un avviso invita a bere. Fontane nei
  paesi e acqua ai rifugi; vicino a un torrente si impara che l'acqua limpida non è per forza potabile. Due voci nuove
  nel diario.
- 11 prove nel browser.

**Dentro**

- `play.ts` diviso in `src/game/`: valle, persone e missioni, arrampicata, strade, temporale, guida, interazioni.
- Un motore unico delle missioni (`QuestEngine`): emergenza › corsa › quella che scegli di seguire.
- Un gestore unico dei tasti a livelli (`src/input.ts`) e gli ostacoli solidi (`src/collide.ts`).
- Salvataggi con versione, migrazioni, controllo dei campi, esporta/importa.
- 51 prove veloci; i casi limite sono elencati in [tests/CASI.md](tests/CASI.md).

## 0.1.0 · M0, fondamenta (3 ottobre 2026)

Il prototipo entra in un repository, con prove automatiche e verifica a ogni push.

**Il gioco a questo punto**

- La Val Masino vera: terreno Copernicus, sentieri, rifugi, cime, laghi, ghiacciai e boschi da OpenStreetMap.
- Cammino, corsa con il fiato, salto, parapendio, nuoto; giorno e notte con il tramonto all'ora giusta.
- Telefono: missioni a capitoli con ometti, mappa con strada bivio per bivio, diario, zaino, spille, armadio, batteria.
- 5 missioni (zaino, rientro prima del buio, guardiaparco, ghiacciaio nel tempo, sfida di corsa) e 10 capitoli di
  compiti.
- Temporale del pomeriggio con telefonata di Marta, riparo con porta, interno e attesa.
- Incontri sui sentieri: Luca da accompagnare, Giorgia in infradito, il pane per l'Omio, il cappello di Tommaso.
- Fotografia naturalistica con mirino, zoom e taccuino: 4 fiori protetti e 6 animali.
- Arrampicata: via con corda sul Sasso Remenno, 4 blocchi in Val di Mello; minigioco degli ometti.
- Eventi: elisoccorso, arcobaleno dopo il temporale, stelle cadenti.
- Gioco in compagnia in locale (stesso browser o stessa rete).

**Fondamenta**

- Repository git, README, licenza MIT per il codice con le licenze dei dati.
- Prove veloci (Vitest) e prove nel browser (Puppeteer): avvio, telefono, foto, incontri, temporale, arrampicata.
- Verifica automatica su GitHub a ogni push: build, prove veloci, prova di avvio.
