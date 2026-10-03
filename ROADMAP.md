# Montagna viva · Roadmap verso la 1.0

Un gioco tranquillo nella Val Masino vera, con una storia e un messaggio. Questo file è la roadmap viva del progetto:
si aggiorna a ogni tappa, e ogni tappa chiusa diventa una release su GitHub (repository privato fino alla 1.0).

**Il messaggio.** La montagna è viva: cambia, ci accoglie e ci mette alla prova. Ci si va preparati, con rispetto e
con cura. E quello che amiamo, come i ghiacciai, si può ancora proteggere, se lo guardiamo davvero.

---

## 1. La storia: «Il libretto di Ada»

**Premessa.** Tua nonna Ada non può più salire in montagna. Ti affida il suo libretto dei rifugi dell'estate 1975:
timbri, appunti a matita, qualche foto sbiadita. «Torna nei miei posti e raccontami com'è adesso.» Arrivi a San
Martino con il libretto nello zaino e il telefono in tasca: ogni foto e ogni messaggio che mandi ad Ada aprono un
ricordo, e il confronto tra il 1975 e oggi diventa la trama.

**Personaggi.**

| Chi | Ruolo nella storia |
|---|---|
| **Tu** | Nessun nome imposto: il nome generato e la giacca li scegli all'inizio. |
| **Ada** | La nonna. C'è solo al telefono (app Messaggi): risponde con ricordi, consigli e un po' d'ironia. |
| **Marta** | La guida di San Martino: insegna a prepararsi. È la voce della sicurezza. |
| **Giulio e Sara** | I custodi dell'Omio e del Ponti: la vita dei rifugi, il meteo, l'accoglienza. |
| **Elena** | La glaciologa: il ghiacciaio, la misura della fronte, il futuro. |
| **Davide** | L'istruttore del Sasso Remenno: il limite e la fiducia. |
| **La valle** | Animali, temporali, elisoccorso, persone sui sentieri. |

**Atti** (ognuno è una pagina del libretto: quella di Ada del 1975 accanto alla tua di oggi).

| Atto | Titolo | Cosa succede | Cosa insegna |
|---|---|---|---|
| Prologo | La busta | Il libretto, il primo messaggio di Ada, Marta e lo zaino. | Ci si prepara prima di partire. |
| 1 | Rientro prima del buio | L'Omio, come Ada nel '75: salire, decidere, tornare. | Tempi, luce, rinunciare non è perdere. |
| 2 | Chi abita la montagna | Stambecchi, marmotte, l'aquila; la foto della marmotta di Ada. | Distanza, silenzio, non lasciare tracce. |
| 3 | Il tempo cambia | Il temporale, il riparo, l'elisoccorso, il Remenno. | Leggere il cielo, chiedere aiuto, conoscere i propri limiti. |
| 4 | Il ghiaccio che resta | Preda Rossa: la foto di Ada del ghiacciaio e com'è oggi. Con Elena e i volontari misuri la fronte. | Il clima cambia la montagna; si può contribuire. |
| Epilogo | La tua pagina | Al tramonto scrivi la tua pagina del libretto e la mandi ad Ada. | Quello che hai visto, e una promessa. |

**Il finale** si scrive con quello che hai fatto, senza punizioni: rifiuti riportati giù, animali lasciati in pace,
rientri con la luce, ometti rimessi in piedi, foto. Ada risponde con un messaggio diverso, poi i titoli di coda
scorrono sulle tue foto. In fondo, un collegamento vero: chi misura i ghiacciai in Lombardia (Servizio Glaciologico
Lombardo) e come si può dare una mano.

Missioni, compiti, ometti, incontri, foto e arrampicata restano. Diventano capitoli e contenuti secondari della
storia: si gioca anche senza seguirla, ma la storia dà il senso.

---

## 2. Principi: cosa vuol dire «perfetto»

**UX/UI**

- In ogni momento sai cosa fare e dove andare: obiettivo in alto, segnaposto, strada. Nessun vicolo cieco.
- Si impara giocando: il tutorial dura meno di 2 minuti e non c'è nessun muro di testo.
- Un solo sistema visivo: colori, caratteri, raggi, ombre, icone e pulsanti definiti una volta e riusati.
- Ogni azione ha una risposta (suono, animazione, avviso). Ogni avviso dice cosa fare.
- Funziona con tastiera, mouse e tocco. Testi leggibili (contrasto 4,5:1), dimensione regolabile, animazioni
  riducibili, sottotitoli per i suoni importanti.

**Logiche di gioco**

- Un solo motore per missioni, commissioni ed eventi, guidato dai dati, con stati espliciti: niente regole
  sparse nel codice.
- Il tempo, il meteo e i salvataggi non si rompono mai, anche se salti ore, ricarichi la pagina o giochi in
  compagnia.
- Il gioco ha collisioni coerenti: non si attraversano case, rocce, alberi grandi.
- Ogni regola ha un test automatico. Ogni release passa i test e un giro di prova completo.

**Prestazioni**: 60 fps su un portatile recente, 30 su un telefono di fascia media, primo avvio sotto i 5 secondi.

**Definizione di «fatto»** per ogni tappa: funziona su desktop e telefono, i test passano, il diario modifiche e il
CHANGELOG sono aggiornati, le schermate sono nella release, la tappa è su GitHub.

---

## 3. Dove siamo (ottobre 2026)

**Fatto**: valle vera (terreno Copernicus, dati OpenStreetMap), cammino, corsa, parapendio, nuoto; telefono con
missioni, mappa, diario, zaino, spille, armadio; 5 missioni, 10 capitoli di compiti, ometti e vestiti; temporale
con telefonata di Marta, riparo con porta e attesa; incontri sui sentieri; fotografia naturalistica con taccuino;
arrampicata con corda (Remenno) e blocchi in Val di Mello; minigioco degli ometti; elisoccorso, arcobaleno, stelle
cadenti; multiplayer (server locale); grafica pastello, facce, dialoghi a fumetto.

**Debiti da saldare**

- Il codice di gioco è in gran parte in un solo file (`play.ts`, circa 1.200 righe).
- Missioni, commissioni ed eventi seguono logiche diverse.
- Non ci sono git, test automatici nel progetto né un sito pubblicato.
- Case e alberi si attraversano.
- La schermata iniziale è vecchia; manca un tutorial.
- La mappa non si zooma.

---

## 4. Le tappe

Le stime sono in sessioni di lavoro insieme (una sessione = una mattina o un pomeriggio).

### M0 · Fondamenta e GitHub · 1 sessione

- Repository git, `.gitignore` (niente `node_modules`, `dist`, `data-cache`), primo commit.
- README in italiano e in inglese: cos'è, come si gioca, come si avvia, crediti e licenze dei dati.
- Licenze: codice MIT; dati © OpenStreetMap (ODbL) e Copernicus, con attribuzione.
- GitHub Actions: build e test a ogni push. Niente sito pubblico fino alla M8: su un account gratuito GitHub Pages
  non pubblica da un repository privato (e così non si consumano crediti Netlify). Si gioca in locale.
- Le prove automatiche usate finora entrano nel progetto (`tests/`): avvio, telefono, scalata, foto, incontri,
  riparo.
- `CHANGELOG.md`, issue e una board che rispecchia questa roadmap.

**Fatto quando**: il repository privato `Vikybassi/montagna-viva` esiste, il gioco parte in locale dal README e i
test girano su GitHub a ogni push.

### M1 · Architettura e logiche impeccabili · 3 sessioni

- `play.ts` diviso in moduli: persone, missioni, meteo e tempo, interazioni, percorsi, eventi.
- Un motore unico per le missioni (dati in file, stati, passi, condizioni, ricompense), che serve storia,
  commissioni e compiti.
- Salvataggi versionati con migrazioni, esporta/importa partita, ripristino se il salvataggio è rotto.
- Gestore unico dei comandi: priorità chiare tra dialoghi, telefono, minigiochi, parete e fotocamera.
- Collisioni con case, rifugi, massi e tronchi; la telecamera non entra nelle case.
- Tempo e meteo robusti ai salti di ora e al gioco in compagnia.
- Test unitari: strade, compiti, salvataggi, meteo.

**Fatto quando**: la lista dei casi limite (in `tests/CASI.md`) è tutta verde e nessuna regola vive fuori dal
motore.

### M2 · La storia · 4 sessioni

- App Messaggi nel telefono: la chat con Ada, con le foto che le mandi e le sue risposte.
- Il libretto di Ada come oggetto nel telefono: pagine del 1975 (illustrate) accanto alle tue.
- Prologo, 4 atti ed epilogo scritti, con dialoghi rivisti, ritmo e scene con la telecamera.
- La misura della fronte del ghiacciaio con Elena: minigioco con la vernice e il metro.
- Il finale che dipende da come hai giocato, e i titoli di coda con le tue foto.
- Revisione dei testi: tono, lunghezza, coerenza dei personaggi.

**Fatto quando**: una persona che non conosce il gioco arriva al finale senza aiuti in circa 2 ore e sa dire il
messaggio con parole sue.

### M2b · Valtellina a tappe · 5–7 sessioni

Decisa il 3 ottobre 2026 (vedi decisione 6). La Val Masino resta il cuore; si aggiungono altre valli vere, costruite
con lo stesso sistema (terreno Copernicus, sentieri e rifugi OpenStreetMap), e un viaggio per andare da una all'altra.

- Il caricatore delle valli: una valle alla volta (stesse prestazioni di oggi), i dati di ogni valle in una cartella,
  salvataggio per valle (timbri, ometti, foto restano comuni).
- **Valmalenco**: Chiesa, Rifugio Marinelli Bombardieri, il ghiacciaio del Fellaria (il ghiaccio che resta).
- **Valfurva**: Santa Caterina, Rifugio Branca, il ghiacciaio dei Forni (la misura della fronte con Elena).
- Il viaggio: una scena breve lungo il fondovalle (finestrino, tornanti, la mappa della Valtellina che si riempie),
  con la corriera, il treno Colico–Sondrio–Tirano o la Panda 4x4 di nonna Ada.
- Stazione di Morbegno per il prologo; Tirano e il trenino rosso del Bernina per l'epilogo.
- Confini di ogni valle come oggi: creste nella foschia e un avviso.

**Fatto quando**: si va dalla Val Masino alla Valmalenco e ritorno senza perdere niente, e ogni valle si carica in
meno di 10 secondi su un portatile normale.

### M3 · UX e interfaccia · 3 sessioni

- Nuova schermata iniziale: titolo grande sopra la valle, un solo pulsante, nome e giacca in un secondo momento.
- Tutorial nei primi minuti, dentro la storia (camminare, guardare, parlare, telefono).
- Sistema visivo unico: un file di token (colori, caratteri, raggi, ombre) e componenti riusabili.
- Dialoghi con testo che appare, salto, cronologia nel telefono.
- Mappa con zoom e trascinamento, icone chiare, anteprima della strada.
- Impostazioni: dimensione testi, sottotitoli dei suoni, animazioni ridotte, sensibilità, volume per tipo.
- Schermata di caricamento con consigli veri di montagna.

**Fatto quando**: in un test con 3–5 persone nessuno resta bloccato e tutti trovano telefono, mappa e fotocamera
senza spiegazioni.

### M4 · Telefono vero e accessibilità · 2 sessioni

- Comandi a tocco completi: parete, fotocamera, minigiochi, telefono.
- Budget di prestazioni e qualità automatica verificata su telefoni veri.
- Controllo accessibilità automatico (axe) e a mano: tastiera, lettore di schermo nei menu, contrasto,
  colori distinguibili.

**Fatto quando**: si gioca dall'inizio alla fine solo col telefono, e i controlli di accessibilità passano.

### M5 · Mondo vivo, arte e suono · 3 sessioni

- Animazioni più curate (camminata, salto, saluti); persone con piccole routine.
- Cielo e meteo: nuvole vere, nebbia in quota, acqua più viva.
- Suono: paesaggio sonoro dinamico (scarponi per terreno, vento che cresce con la quota, campanacci, il Masino).
  Niente musica durante l'esplorazione: una sola traccia, delicata e malinconica, per il prologo e per la pagina
  finale scritta ad Ada.
- Dettagli che raccontano: interni dei rifugi, segnavia, tabelle, alpeggi.

**Fatto quando**: il giro di prova delle 4 scene di riferimento (paese, bosco, quota, rifugio) è approvato da te.

### M6 · Telefono e libretto · 1–2 sessioni

Il multiplayer online è fuori dalla 1.0: il gioco in compagnia resta solo in locale (stesso browser). La storia di Ada
è un'esperienza personale, e queste sessioni vanno al cuore dell'interfaccia.

- Telefono: transizioni, notifiche, app Messaggi rifinita (ritmo dei messaggi di Ada, foto allegate, risposte).
- Libretto: sfogliare le pagine, il confronto 1975/oggi, timbri e appunti che si aggiungono.
- Salvataggi: esporta e importa la partita dal telefono.

**Fatto quando**: telefono e libretto reggono un test con 3–5 persone senza spiegazioni.

### M7 · Contenuti e verifica · 1 sessione

- Verifica dei fatti del diario con fonti (CAI, Parco, Servizio Glaciologico Lombardo, ARPA), elencate nei crediti.
- Testi raccolti in file separati dal codice, pronti per la traduzione della 1.1.
- Avvertenze e crediti aggiornati.

**Fatto quando**: ogni fatto ha una fonte.

### M8 · Lancio · 1 sessione

- Repository reso pubblico, gioco pubblicato su GitHub Pages.
- Release 1.0 su GitHub con note, schermate e GIF.
- Pagina di presentazione (kit stampa) e caso studio nel tuo portfolio.
- Repository fissato nel profilo GitHub, link nel portfolio.
- Modulo per raccogliere opinioni dopo il lancio.

**Fatto quando**: il link pubblico è nel portfolio e il caso studio racconta problema, scelte e risultato.

**Totale stimato**: circa 19 sessioni.

### Dopo la 1.0 · patch 1.1

- Versione inglese, con un lavoro d'autore su termini escursionistici, nomi e tono di Ada.
- Correzioni dai commenti raccolti dopo il lancio.

---

## 5. Come lavoriamo su GitHub

- Un ramo per tappa (`m1-architettura`, `m2-storia`…), una pull request quando la tappa è pronta, unita in `main`.
- `main` è sempre giocabile (dalla M8 ogni unione lo pubblica anche su GitHub Pages).
- Commit piccoli, in italiano, a tuo nome. Release con tag (`v0.1` dopo M0, …, `v1.0` al lancio).
- Questo file e il CHANGELOG si aggiornano a ogni tappa chiusa.
- Niente pubblicazioni o push senza il tuo via libera esplicito.

---

## 6. Decisioni prese (3 ottobre 2026)

1. **Storia**: «Il libretto di Ada». Telefono e libretto come interfacce principali; il picco emotivo è l'atto 4 a
   Preda Rossa.
2. **Repository**: `Vikybassi/montagna-viva` privato fino alla 1.0; M0 e M1 servono a renderlo un codice da
   mostrare. Pubblico alla M8 con il caso studio.
3. **Multiplayer online**: tolto dalla 1.0, resta solo in locale; le sessioni passano a telefono e libretto (M6).
4. **Inglese**: rimandato alla patch 1.1.
5. **Audio**: solo suoni della valle durante il gioco; un'unica traccia musicale per prologo e pagina finale.
6. **Valtellina a tappe** (3 ottobre 2026, dopo aver visto i confini della mappa): la Val Masino resta il cuore, si
   aggiungono Valmalenco e Valfurva con un viaggio tra le valli (tappa M2b). Gli atti della storia si distribuiscono
   sulle valli (bozza: prologo a Morbegno, atto 1 Val Masino, atto 2 Valmalenco col Fellaria, atto 3 Valfurva coi
   Forni, epilogo a Tirano col trenino del Bernina); si rifinisce in M2. Una Valtellina unica e continua è scartata
   per la 1.0: troppo pesante per portatili e telefoni.
7. **Suoni registrati** (3 ottobre 2026): vento, torrenti, uccelli, passi, campanacci, animali, pioggia e tuoni
   passano da sintetizzati a registrazioni vere a licenza libera (CC0 o equivalente), con l'elenco delle fonti nei
   crediti. Si anticipa dalla M5.
