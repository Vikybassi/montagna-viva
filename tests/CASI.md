# Casi limite

Le situazioni strane che il gioco deve reggere, ognuna con la prova che la controlla.
`unit` = `npm test` (Vitest, `tests/unit/`), `e2e` = `npm run test:e2e` (Chrome, `tests/e2e/`).
Quando si corregge un bug, si aggiunge qui la riga e la prova che lo tiene lontano.

Stato al 3 ottobre 2026 (M1): **tutti verdi** — 51 prove unit, 9 prove e2e (anche in grafica software, come su GitHub).
Le prove nel browser aspettano condizioni, non tempi fissi: su GitHub il gioco fa pochi fotogrammi al secondo.

## Salvataggi

| # | Caso | Cosa deve succedere | Prova |
|---|------|---------------------|-------|
| 1 | Salvataggio rotto (JSON illeggibile) | Si riparte da zero, con una copia di riserva `…:rotto:<ora>` e un avviso | unit `load` |
| 2 | Campi del tipo sbagliato (numeri al posto di liste…) | Si scartano solo quelli, il resto resta | unit `state` |
| 3 | Salvataggio della versione 1 (`carrying`) | Si aggiorna: chi portava il pane lo segue come commissione | unit `load`, `state` |
| 4 | Importare un file che non è una partita | Errore chiaro, la partita non cambia | unit `state` |
| 5 | Esporta → importa | Si torna identici (progressi, album, taccuino, profilo) | unit `state` |
| 6 | «Ricomincia» | Cancella progressi, album e taccuino; nome e impostazioni restano | unit `load` |
| 7 | Dormire al rifugio dopo il primo giorno | La mattina *dopo*, non le 7:15 del primo giorno | unit `state` (`nextMorning`) |

## Cosa seguire (motore delle missioni)

| # | Caso | Cosa deve succedere | Prova |
|---|------|---------------------|-------|
| 8 | Temporale nel mezzo di una missione | Prima il riparo; dopo, la missione riprende da dov'era | unit `quests`, e2e `shelter` |
| 9 | Commissione (pane) e missione insieme | In alto quella scelta; l'altra nel telefono con «Segui» | unit `quests` |
| 10 | Sfida di corsa mentre segui una commissione | Conta la corsa | unit `quests` |
| 11 | Niente in corso | Non segue niente (in alto: «Esplora la valle · parla con Marta») | unit `quests` |
| 11b | Arrivano le nuvole nere e Marta chiama | L'obiettivo in alto diventa subito il riparo, prima che inizi a piovere | e2e `shelter` |
| 11c | Commissione accettata o finita (Rosa col pane già nello zaino) | La persona risponde sempre: ricorda dove andare, o ringrazia | e2e `encounters` |
| 11d | Si ricarica la pagina con una missione in corso | «Bentornata»: si dice quale e il prossimo passo; si sceglie se continuare o metterla in pausa | e2e `welcome` |
| 11e | Ti avvicini a una persona | Si gira verso di te (anche chi para sui blocchi, quando non arrampichi) | e2e `welcome` |

## Tastiera

| # | Caso | Cosa deve succedere | Prova |
|---|------|---------------------|-------|
| 12 | E sull'ultimo dialogo vicino a una persona | Il dialogo si chiude e **non** si riapre (prima ripartiva la conversazione) | e2e `keys` |
| 13 | Un numero in un dialogo sopra il telefono | Sceglie la risposta, non cambia scheda al telefono | unit `input` (livello modale) |
| 14 | Esc col telefono o la pausa aperti | Chiude solo quello, non apre la pausa | e2e `keys`, `smoke` |
| 15 | Spazio col telefono aperto | Non si salta | e2e `keys` |
| 16 | Spazio, E, Esc durante un minigioco | Solo il minigioco li riceve (niente salti o pause) | unit `input` (`pushModal`) |
| 17 | La finestra perde il fuoco con un tasto premuto | Ci si ferma (niente camminata infinita) | unit `input` |

## Collisioni

| # | Caso | Cosa deve succedere | Prova |
|---|------|---------------------|-------|
| 18 | Camminare contro un rifugio | Ci si ferma al muro, si scivola lungo il muro | unit `collide`, e2e `collide` |
| 19 | Case ruotate | Stessa cosa da ogni lato | unit `collide` |
| 20 | Varco tra due tronchi più stretto di te | Il passo non si fa (niente rimbalzi avanti e indietro) | unit `collide` |
| 21 | Qualità bassa: alberi non disegnati | Non sono solidi | unit `collide` |
| 22 | In volo col parapendio sopra un tetto | Nessun urto | unit `collide` |
| 23 | Ogni persona, porta, cartello, ometto… | Ha un punto libero a portata di E | e2e `collide` |
| 24 | La telecamera dietro un muro, anche girandola di colpo | Si avvicina, non entra nella casa (nemmeno mentre scivola al suo posto) | unit `collide`, e2e `collide` |
| 25 | Entrare dalla porta per ripararsi | La porta funziona (niente urti mentre entri o sei dentro) | e2e `shelter` |
| 26 | Ritrovarsi dentro una casa (viaggio veloce, salto) | Si esce camminando, non si resta bloccati | e2e `collide` |
| 26a | Al confine della mappa | Ci si ferma prima del bordo, con un avviso; oltre si vedono creste nella foschia, non il vuoto | e2e `welcome` |

## Arrampicata e foto

| # | Caso | Cosa deve succedere | Prova |
|---|------|---------------------|-------|
| 26b | In parete, presa dopo presa | Braccia e gambe mai incrociate: ogni arto va dal lato della sua spalla o anca (il modello aveva i lati scambiati) | e2e `boulder` |
| 26c | Una foto nuova | Puntino sulla scheda Foto; album e taccuino nel telefono; un tocco ingrandisce, Esc richiude solo la foto | e2e `photo` |

## Tempo e meteo (l'orologio che salta)

| # | Caso | Cosa deve succedere | Prova |
|---|------|---------------------|-------|
| 27 | Salto oltre tutto il temporale (14 → 20) | Nessun evento, sereno | unit `weather` |
| 28 | Aspettare al riparo fino alla fine | Il temporale finisce adesso: arcobaleno possibile | unit `weather`, e2e `shelter` |
| 29 | Dormire durante il temporale | La mattina è passato, **senza** arcobaleno, il riparo non è più l'obiettivo | unit `weather`, e2e `time` |
| 30 | Dal temporale di oggi a quello di domani | Prima finisce quello vecchio, poi inizia il nuovo | unit `weather` |
| 31 | Nuvole cariche, poi salto oltre il temporale | Marta non chiama per un temporale già finito; se squillava, riattacca; il riparo non è più l'obiettivo | e2e `time` |
| 32 | Ore oltre le 24 (secondo giorno) | Luce del giorno giusta: rientro «con la luce», avviso del buio una volta per sera, margine di Giulio | unit `weather` (`isDaylight`) |
| 33 | Elicottero mancato (salto oltre la sua ora) | Non arriva in ritardo | codice (`events.ts`: finestra di mezz'ora) |

## Strade e indicazioni

| # | Caso | Cosa deve succedere | Prova |
|---|------|---------------------|-------|
| 34 | Bivio a T (nessuna strada prosegue dritta) | Dice «tieni la destra/sinistra» (prima taceva) | unit `route` |
| 35 | Si va dritti e un sentiero laterale gira | Nessun avviso inutile | unit `route` |
| 36 | Scorciatoia ripida contro giro in piano | Sceglie il più rapido con i tempi CAI | unit `route` |
| 37 | Nessun sentiero vicino | Nessuna strada inventata, un avviso | unit `route` |
| 38 | Piccoli buchi nei dati dei sentieri (< 15 m) | I sentieri si collegano | unit `route` |

## Compiti e ometti

| # | Caso | Cosa deve succedere | Prova |
|---|------|---------------------|-------|
| 39 | Un compito fatto | Si paga una volta sola | unit `tasks` |
| 40 | Capitolo completo | Spilla e bonus, una volta | unit `tasks` |
| 41 | Progressi oltre l'obiettivo (7 rifiuti su 5) | Il progresso si ferma a 5 | unit `tasks` |
