import SHARED from "../shared/names.json";
/**
 * I contenuti del gioco: cosa si mette nello zaino, cosa si impara (il diario) e le missioni.
 * Le informazioni sono prudenti e verificabili: niente numeri inventati; dove il gioco semplifica, lo dice.
 */

export type Topic = "sicurezza" | "fauna" | "ghiacciai" | "rispetto";

export type Fact = { id: string; topic: Topic; title: string; text: string };

export const FACTS: Fact[] = [
  // sicurezza
  { id: "zaino", topic: "sicurezza", title: "Lo zaino giusto", text: "Frontale, giacca impermeabile, uno strato caldo, acqua, cartina (o una mappa scaricata sul telefono) e un piccolo kit di primo soccorso. Anche per un giro breve: in montagna il tempo cambia in fretta." },
  { id: "frontale", topic: "sicurezza", title: "La frontale", text: "Pesa pochissimo e cambia tutto se fai tardi. Controlla le pile prima di partire: senza luce, al buio anche un sentiero facile diventa pericoloso." },
  { id: "tramonto", topic: "sicurezza", title: "Rientro prima del buio", text: "Prima di partire guarda l'ora del tramonto e i tempi del giro, poi tieni un margine. In autunno il buio arriva presto, e in una valle profonda il sole sparisce dietro le creste molto prima del tramonto." },
  { id: "acqua", topic: "sicurezza", title: "Bere prima di avere sete", text: "In salita si suda e si respira più in fretta: bevi a piccoli sorsi e spesso, prima che arrivi la sete. La borraccia si riempie alle fontane dei paesi e ai rifugi." },
  { id: "torrenti", topic: "sicurezza", title: "L'acqua dei torrenti", text: "Limpida non vuol dire potabile: sotto i pascoli l'acqua dei torrenti può avere batteri (mucche, pecore, marmotte). Bevi alle fontane e ai rifugi, o parti con abbastanza acqua." },
  { id: "tempi", topic: "sicurezza", title: "I tempi sui cartelli", text: "I tempi dei cartelli CAI valgono per un escursionista medio, senza soste. Se sei stanca, con lo zaino pesante o con dei bambini, aggiungi tempo." },
  { id: "segnavia", topic: "sicurezza", title: "Il segnavia bianco e rosso", text: "Le strisce bianche e rosse dipinte su sassi e pali indicano che sei sul sentiero. Se non ne vedi una da un po', torna all'ultima che hai visto invece di tirare dritto." },
  { id: "dormire", topic: "sicurezza", title: "Fermarsi è una scelta saggia", text: "Se arrivi tardi a un rifugio aperto, puoi chiedere di dormire lì invece di scendere al buio. Rinunciare o fermarsi non è un fallimento: è parte dell'andare in montagna." },
  { id: "dire", topic: "sicurezza", title: "Di' a qualcuno dove vai", text: "Prima di partire lascia detto a qualcuno il giro che fai e quando pensi di rientrare. In caso di emergenza il numero da chiamare in Italia è il 112." },
  { id: "meteo", topic: "sicurezza", title: "Il meteo in quota", text: "In quota fa più freddo che a valle e i temporali estivi arrivano spesso nel pomeriggio: parti presto e controlla le previsioni per la montagna, non solo per il paese." },
  { id: "corsa", topic: "sicurezza", title: "Correre in montagna", text: "Nella corsa in montagna conta gestire il fiato: in salita si cammina svelti, si corre dove il terreno lo permette. Bevi spesso, anche se non hai sete." },
  { id: "temporale", topic: "sicurezza", title: "Arriva il temporale", text: "Se arriva un temporale scendi dalle creste e dalle cime, allontanati da croci metalliche e cavi, e cerca riparo in un rifugio o in un bivacco. Non metterti sotto un albero isolato." },
  { id: "soccorso", topic: "sicurezza", title: "Il soccorso in montagna", text: "In un'emergenza chiama il 112: di' dove sei (sentiero, rifugio, o le coordinate del telefono) e cosa è successo. Se arriva l'elicottero, alza le braccia a Y per dire «serve aiuto» (un braccio su e uno giù vuol dire «non serve»), resta ferma e tieni stretti zaino e giacca: il vento delle pale è fortissimo." },
  { id: "bivacco", topic: "sicurezza", title: "Il bivacco", text: "Un bivacco è un piccolo riparo d'alta quota, sempre aperto e senza custode: serve in caso di maltempo o di emergenza. Si lascia pulito e in ordine, si scrive il proprio passaggio sul libro e si riporta giù tutto quello che si è portato." },
  { id: "blocco", topic: "sicurezza", title: "Il bouldering", text: "Sui massi bassi si arrampica senza corda: sotto si mette il materassino (crash pad) e un compagno \"para\", con le mani pronte a guidare la caduta verso il materassino. Si scende dal lato facile o con un salto controllato, ginocchia morbide. La Val di Mello è famosa nel mondo per i suoi blocchi di granito." },
  { id: "parapendio", topic: "sicurezza", title: "Il parapendio, quello vero", text: "Nel gioco basta un salto. Nella realtà il parapendio si impara con un corso, con un'attrezzatura controllata e guardando bene vento e meteo prima di decollare." },
  { id: "arrampicata", topic: "sicurezza", title: "Arrampicare in sicurezza", text: "La Val di Mello e il Sasso Remenno sono famosi per l'arrampicata sul granito. Sulle vie alte si sale con imbrago, casco e corda, con un compagno che fa sicura e controlla i nodi. Sui massi bassi (bouldering) si sale senza corda, con i materassini sotto." },
  // fauna
  { id: "stambecco", topic: "fauna", title: "Lo stambecco", text: "Vive sopra il limite del bosco, tra rocce e pascoli d'alta quota. All'inizio dell'Ottocento era quasi scomparso dalle Alpi: ne restava un piccolo gruppo nel Gran Paradiso. Oggi è tornato grazie alla protezione e alle reintroduzioni." },
  { id: "distanza", topic: "fauna", title: "La distanza giusta", text: "Se un animale smette di mangiare, ti guarda fisso o si allontana, sei troppo vicina. Fermati e osservalo da lontano: ogni fuga gli costa energie preziose, soprattutto d'inverno." },
  { id: "marmotta", topic: "fauna", title: "La marmotta", text: "Fischia per avvisare le altre di un pericolo e corre nella tana. D'inverno va in letargo per circa sei mesi. Non darle da mangiare: il cibo delle persone le fa male." },
  { id: "aquila", topic: "fauna", title: "L'aquila reale", text: "Fa il nido sulle pareti rocciose e in volo le sue ali aperte superano i due metri. In primavera, quando cova, è importante non avvicinarsi alle pareti dove nidifica." },
  { id: "cani", topic: "fauna", title: "Cani al guinzaglio", text: "Nei pascoli e dove vivono gli animali selvatici il cane va tenuto al guinzaglio: anche il più buono può spaventarli o inseguirli." },
  { id: "camoscio", topic: "fauna", title: "Il camoscio", text: "Più piccolo e agile dello stambecco, vive al margine del bosco e sulle cenge. Si riconosce dalle corna sottili piegate a uncino e dalla maschera chiara sul muso. Se ti vede fischia e scappa veloce sulle rocce." },
  { id: "gracchio", topic: "fauna", title: "Il gracchio alpino", text: "Nero, col becco giallo e le zampe rosse: è l'uccello che fa acrobazie nel vento attorno ai rifugi e alle cime. Non dargli da mangiare: il nostro cibo gli fa male e lo abitua a dipendere da noi." },
  // ghiacciai
  { id: "ghiacciaio", topic: "ghiacciai", title: "Come vive un ghiacciaio", text: "In alto la neve si accumula e diventa ghiaccio; in basso il ghiaccio fonde. La quota dove le due cose si bilanciano si chiama linea di equilibrio: se il clima si scalda, sale, e il ghiacciaio si ritira." },
  { id: "pea", topic: "ghiacciai", title: "La Piccola Età Glaciale", text: "Verso la metà dell'Ottocento i ghiacciai delle Alpi erano molto più grandi di oggi. Da allora hanno perso più della metà della loro superficie, e il ritiro è diventato più veloce negli ultimi decenni." },
  { id: "misure", topic: "ghiacciai", title: "Chi misura i ghiacciai", text: "In Lombardia il Servizio Glaciologico Lombardo misura ogni anno le fronti dei ghiacciai, anche con l'aiuto di volontari: segnali di vernice sulle rocce indicano dove arrivava il ghiaccio." },
  { id: "futuro", topic: "ghiacciai", title: "E domani?", text: "Molti piccoli ghiacciai delle Alpi potrebbero sparire entro questo secolo. Quanto ghiaccio resterà dipende da quanto riusciremo a ridurre le emissioni." },
  // rispetto della montagna
  { id: "rifiuti", topic: "rispetto", title: "Quello che porti su, riportalo giù", text: "In montagna non ci sono cestini: i rifiuti si riportano a valle. Anche bucce e torsoli: in quota si decompongono lentamente e gli animali non dovrebbero mangiarli." },
  { id: "mucche", topic: "rispetto", title: "Le mucche all'alpeggio", text: "D'estate le mucche salgono ai pascoli alti. Non passare in mezzo alla mandria e stai lontana dalle madri con i vitelli; se hai un cane tienilo al guinzaglio e aggira con calma." },
  { id: "timbri", topic: "rispetto", title: "Il timbro del rifugio", text: "In molti rifugi c'è un timbro: tante persone lo collezionano su un libretto, come ricordo delle salite. È anche un modo per conoscere i rifugi e chi li gestisce." },
  { id: "vetta", topic: "rispetto", title: "Il libro di vetta", text: "Su molte cime, vicino alla croce o all'ometto di sassi, c'è una scatola con un quaderno: chi arriva lascia nome, data e due parole. Leggerlo è come incontrare chi è salito prima di te." },
  { id: "stella", topic: "rispetto", title: "La stella alpina", text: "Cresce sulle rocce e sui pascoli sassosi in alto. È protetta: in Lombardia non si può raccogliere. Il suo \"pelo\" bianco la ripara dal freddo e dal sole forte dell'alta quota." },
  { id: "genziana", topic: "rispetto", title: "La genziana", text: "Le genziane di un blu intenso fioriscono sui pascoli d'altura. Sono specie protette: si fotografano e si lasciano dove sono, così fanno i semi anche l'anno dopo." },
  { id: "rododendro", topic: "rispetto", title: "Il rododendro", text: "Arbusto che a inizio estate colora di rosa i versanti sopra il bosco. Trattiene il terreno sui pendii: strapparlo o tagliarlo favorisce le frane." },
  { id: "arnica", topic: "rispetto", title: "L'arnica", text: "Fiore giallo dei pascoli di montagna, usato da sempre nei rimedi. In natura è protetta: anche un mazzetto, se lo coglie ognuno, fa sparire i fiori da un prato." },
  { id: "ometto", topic: "rispetto", title: "Gli ometti di sassi", text: "Sulle pietraie, dove la vernice si vede poco, il sentiero è segnato dagli ometti: piccole pile di sassi. Si rimettono in piedi quelli caduti, ma non se ne costruiscono di nuovi a caso: confondono chi cammina e smuovono le pietre dove vivono piante e insetti." },
  { id: "sentiero", topic: "rispetto", title: "Resta sul sentiero", text: "Tagliare i tornanti rovina i prati e fa franare il terreno. Resta sul sentiero, anche quando la scorciatoia sembra più breve." },
];

export type Item = { id: string; name: string; good: boolean; note: string };
export const ITEMS: Item[] = [
  { id: "frontale", name: "Frontale", good: true, note: "Indispensabile se fai tardi." },
  { id: "giacca", name: "Giacca impermeabile", good: true, note: "Vento e pioggia arrivano in fretta." },
  { id: "pile", name: "Pile caldo", good: true, note: "In quota, dopo il tramonto, fa freddo." },
  { id: "acqua", name: "Borraccia d'acqua", good: true, note: "Bere spesso aiuta il fiato." },
  { id: "cartina", name: "Cartina", good: true, note: "Il telefono può scaricarsi o non avere campo." },
  { id: "kit", name: "Kit di primo soccorso", good: true, note: "Cerotti, garze, una coperta termica." },
  { id: "infradito", name: "Infradito", good: false, note: "Sui sassi servono scarponi o scarpe da trail." },
  { id: "cassa", name: "Cassa per la musica", good: false, note: "In montagna si ascolta il silenzio, e gli animali ringraziano." },
  { id: "ombrellone", name: "Ombrellone", good: false, note: "Pesa tanto e col vento è inutile." },
];
export const PACK_SLOTS = 6;

/** le cime con il libro di vetta (nel gioco): le più note della valle (lista condivisa col server) */
export const SUMMITS: string[] = SHARED.summits;
/** frasi pronte del multiplayer */
export const PHRASES: string[] = SHARED.phrases;
/** nomi dei giocatori: animale + aggettivo */
export const NAME_PARTS: { animals: string[]; adjectives: string[] } = SHARED;
export const randomName = () => `${SHARED.animals[Math.floor(Math.random() * SHARED.animals.length)]} ${SHARED.adjectives[Math.floor(Math.random() * SHARED.adjectives.length)]}`;

export type MissionId = "zaino" | "rientro" | "fauna" | "ghiacciaio" | "corsa";
export type Mission = { id: MissionId; title: string; brief: string };
export const MISSIONS: Mission[] = [
  { id: "zaino", title: "Prepara lo zaino", brief: "Scegli cosa portare: hai sei posti." },
  { id: "rientro", title: "Rientro prima del buio", brief: "Sali al Rifugio Omio e decidi come tornare prima che faccia buio." },
  { id: "fauna", title: "Occhi da guardiaparco", brief: "Osserva uno stambecco, una marmotta e l'aquila reale senza disturbarli." },
  { id: "ghiacciaio", title: "Il ghiacciaio nel tempo", brief: "Raggiungi la glaciologa al Piano di Preda Rossa e guarda il ghiacciaio in anni diversi." },
  { id: "corsa", title: "Sfida di corsa", brief: "Corri in Val di Mello attraverso i traguardi, gestendo il fiato." },
];

/** l'armadio: si compra con gli ometti. Le cinque giacche dell'inizio e il berretto giallo sono gratis. */
export type Slot = "giacca" | "cappello" | "occhiali" | "collo" | "bastoncini";
export type Wear = { id: string; slot: Slot; name: string; price: number; color?: string; kind?: "beanie" | "sun" | "band"; note?: string };
export const SLOTS: { id: Slot; name: string }[] = [
  { id: "giacca", name: "Giacche" },
  { id: "cappello", name: "Cappelli" },
  { id: "occhiali", name: "Occhiali" },
  { id: "collo", name: "Al collo" },
  { id: "bastoncini", name: "Bastoncini" },
];
export const WARDROBE: Wear[] = [
  { id: "g-bordeaux", slot: "giacca", name: "Bordeaux", price: 0, color: "#c2375a" },
  { id: "g-acqua", slot: "giacca", name: "Verde acqua", price: 0, color: "#2f8f8a" },
  { id: "g-arancio", slot: "giacca", name: "Arancio", price: 0, color: "#e07d3e" },
  { id: "g-blu", slot: "giacca", name: "Blu", price: 0, color: "#3b5a8a" },
  { id: "g-giallo", slot: "giacca", name: "Giallo", price: 0, color: "#f2b632" },
  { id: "g-genziana", slot: "giacca", name: "Genziana", price: 30, color: "#4b4fc4", note: "Blu come le genziane dei pascoli d'estate." },
  { id: "g-larice", slot: "giacca", name: "Larice d'autunno", price: 30, color: "#d9962b", note: "Il larice è l'unica conifera che in autunno diventa d'oro e perde gli aghi." },
  { id: "g-granito", slot: "giacca", name: "Granito", price: 40, color: "#7d8088", note: "Grigia come il granito della Val di Mello." },
  { id: "c-berretto", slot: "cappello", kind: "beanie", name: "Berretto giallo", price: 0, color: "#f2b632" },
  { id: "c-rosso", slot: "cappello", kind: "beanie", name: "Berretto rosso", price: 20, color: "#d8433a" },
  { id: "c-fascia", slot: "cappello", kind: "band", name: "Fascia paraorecchie", price: 25, color: "#2f8f8a", note: "Per le mattine fresche, quando il berretto è troppo." },
  { id: "c-sole", slot: "cappello", kind: "sun", name: "Cappello da sole", price: 40, color: "#e9dcc0", note: "In quota il sole scotta anche quando l'aria è fresca." },
  { id: "o-sole", slot: "occhiali", name: "Occhiali da sole", price: 35, note: "Su neve e ghiacciaio il riverbero fa male agli occhi: in quota servono sempre." },
  { id: "b-bandana", slot: "collo", name: "Bandana", price: 20, color: "#c2375a", note: "Ripara il collo dal sole e dal vento." },
  { id: "s-bastoncini", slot: "bastoncini", name: "Bastoncini da trekking", price: 60, note: "In discesa tolgono peso alle ginocchia." },
];
