# Ricettario CBT

## Setup in 3 passi

Questa repository contiene un wall client-side per GitHub Pages. Non è una
barriera di sicurezza per dati riservati: GitHub Pages pubblica gli asset e
chiunque può scaricare i file pubblicati o il contenuto della repository.
Usalo solo per contenuti che possono essere distribuiti pubblicamente.

1. **Crea un PAT dedicato.** Revoca/ruota qualunque token già condiviso. Crea
   un fine-grained Personal Access Token limitato a questa repository, con
   permesso `Contents: Read and write` e una scadenza breve. Non inserirlo mai
   in `index.html`, `config.json` o nella cronologia Git.

2. **Genera la configurazione in locale.** Avvia `python3 -m http.server 8000`,
   apri `http://localhost:8000/setup.html`, inserisci il nuovo PAT, una nuova
   password Admin e le password lettore, poi scarica `config.json`. Se vuoi
   le funzioni AI, inserisci anche una API key Gemini: viene cifrata con la
   password Admin per l’importazione ricette e con ciascuna password viewer per
   la ricerca visuale. L’app usa l’alias
   `gemini-flash-lite-latest` come modello predefinito, ottimizzato per ridurre
   consumo e quota; dall’app è possibile selezionare un altro modello
   compatibile.
   Il helper usa
   PBKDF2-HMAC-SHA-256 con 120.000 iterazioni e AES-256-GCM; i segreti vengono
   cifrati in memoria.

3. **Pubblica i file.** Copia il `config.json` generato nella root e pubblica
   `index.html`, `config.json`, `datasets/`, `favicon.svg`,
   `manifest.webmanifest`, `sw.js`, la directory `icons/` e la directory
   `prompts/` tramite GitHub Pages. Il manifest
   opzionale delle immagini illustrative è in `datasets/recipe-media.json` e
   contiene anche attribuzione, licenza e collegamento alla fonte di ogni
   immagine. Le ricette senza una voce nel manifest non mostrano alcuna
   immagine. Le voci suggerite dal batch sono contrassegnate come **Foto
   suggerita** con l’avviso che potrebbero non corrispondere esattamente alla
   ricetta; le loro immagini sono remote e richiedono una connessione.
   Configura Pages dalla branch scelta e
   verifica prima il login lettore, poi quello Admin. `setup.html` è un tool
   locale: non è necessario pubblicarlo.

## Importazione AI da foto o PDF

Nel pannello Admin, dopo aver configurato una API key Gemini, puoi selezionare
più foto dalla galleria, scattare più foto oppure caricare più file immagine;
puoi anche caricare più PDF. Premi quindi **Analizza e compila**. `index.html`
invia tutti gli allegati direttamente a Gemini, carica il prompt da
`prompts/recipe-extraction.md`, usa
`prompts/recipe-schema.json` per richiedere e controllare la struttura della
risposta e apre una bozza nel form esistente. La ricetta
non viene mai pubblicata senza revisione e salvataggio manuale.

La chiave usata per importare ricette viene decifrata nella sessione Admin; per
la ricerca visuale è decifrata dalla password viewer associata. PAT e chiave
Gemini vengono conservati nel browser solo cifrati in IndexedDB, con una chiave
Web Crypto non esportabile, e cancellati al logout. Il codice della stessa
origine può comunque usarli mentre la sessione è attiva: usa una chiave Gemini
dedicata, con quota e limiti di spesa ridotti.
Il prompt e lo schema non sono segreti e possono essere modificati e pubblicati
indipendentemente dal codice.

## Ricerca per ingredienti fotografati

Nel lettore, **Cosa posso cucinare?** permette di aggiungere fino a sei foto di
frigo, dispensa o piano di lavoro scegliendole dalla galleria, scattandole una
alla volta oppure caricandole come file immagine, anche in più passaggi. Gemini riconosce solo
gli alimenti realmente visibili e restituisce quantità e confidenza quando sono
leggibili; non completa automaticamente spezie o ingredienti non fotografati.
Prima della ricerca l’elenco è sempre modificabile: controlla, correggi o
aggiungi gli ingredienti riconosciuti.

I viewer usano la propria password di accesso: questa decifra la chiave Gemini
per la ricerca visuale e non concede accesso al pannello Admin. Il ruolo e la
chiave cifrata vengono ripristinati dopo refresh e riapertura; la password non
viene conservata. Logout o una modifica della configurazione richiedono un nuovo
accesso. Le fotografie restano solo nella memoria della scheda e non vengono
salvate nel dataset o nel browser.

Il ranking delle ricette è locale: per ogni ingrediente conta in quante ricette
compare nel catalogo complessivo; meno ricette lo contengono, maggiore è la sua
priorità. La percentuale di ingredienti coperti è il criterio principale; la
presenza di un ingrediente raro aggiunge un bonus ragionevole, mentre se manca
un ingrediente più raro di quelli disponibili nella ricetta, questa viene
penalizzata in modo netto. Le ricette con più di quattro voci ingredienti e
meno del 25% di copertura non vengono proposte. Le corrispondenze sono
indicative; l’elenco mostra anche gli ingredienti eventualmente mancanti e non
modifica mai le ricette.
I risultati possono essere filtrati selezionando una o più categorie e una o
più fonti; la ricerca testuale offre gli stessi filtri tramite i rispettivi
selettori.

Se una chiamata VLM fallisce, sia la ricerca ingredienti sia l’importazione da
foto/PDF propongono un menu di modelli Gemini compatibili con
`generateContent`, recuperati dinamicamente dall’endpoint `models.list`. La
scelta resta solo nella scheda corrente e permette di riprovare mantenendo lo
sblocco Admin.

## Sostituire il PAT passo per passo

La sostituzione del PAT rigenera il payload cifrato e non richiede modifiche a
`index.html`:

1. Apri GitHub → **Settings** → **Developer settings** → **Fine-grained
   personal access tokens**, individua il vecchio token e revocalo quando il
   nuovo sarà pronto. Un token già condiviso va considerato compromesso.
2. Crea un nuovo token limitato alla sola repository, con scadenza breve e
   permesso **Repository permissions → Contents: Read and write**. Non servono
   permessi Actions o Workflow.
3. Avvia il server locale con `python3 -m http.server 8000` e apri
   `http://localhost:8000/setup.html`.
4. Inserisci il nuovo PAT, una nuova password Admin e le password lettore.
   `Owner` è il tuo username GitHub o un’organizzazione; `Repository` è solo il
   nome del repository, senza URL e senza `.git`. Compila questi campi solo se
   usi un dominio custom. Il PAT viene letto
   dal browser, cifrato in memoria e poi svuotato dal campo.
5. Scarica il file generato e sostituisci il `config.json` nella root. Verifica
   che `setupRequired` non sia presente e che `crypto.salt`, `crypto.iv` e
   `crypto.ciphertext` siano valorizzati. Non incollare il PAT in terminale,
   README, issue o commit.
6. Verifica in locale `index.html`; solo dopo il test fai commit e push di
   `index.html`, `config.json`, `datasets/` e `prompts/`. Mantieni
   `setup.html` fuori dalla pubblicazione Pages.

La procedura rigenera anche gli hash lettore: inserisci nuovamente tutte le
password che vuoi conservare. Il PAT in chiaro non deve mai comparire nel
repository o nella cronologia Git. Per i requisiti dell’endpoint Contents,
consulta la [documentazione REST ufficiale](https://docs.github.com/en/rest/repos/contents).

## Test locale prima del push

Con il `config.json` generato, avvia:

```sh
python3 -m http.server 8000
```

Poi apri `http://localhost:8000/index.html` e verifica:

- all’apertura si vede solo il login;
- una password lettore mostra ricerca, filtro categoria e ricette;
- la password Admin mostra il pannello CRUD;
- aggiunta, modifica, duplicazione ed eliminazione aggiornano il contatore;
- `Salva e pusha dataset` aggiorna solo il JSON della fonte attiva;
- il pannello **Fonti** permette di creare fonti e modificarne i nomi e i
  dettagli; dopo la creazione, l’ID e il percorso dataset restano stabili;
- con Gemini configurato, la password viewer sblocca la chiave per la ricerca
  visuale, mentre l’importazione di ricette resta una funzione Admin;
- **Antichi sapori** è il tema predefinito; il selettore **Tema** offre anche
  Mediterraneo, Classico ed Essenziale e conserva la scelta nel browser;
- gestione password lettori continua a funzionare;
- con una configurazione AI valida, foto e PDF compilano una bozza ricetta;
- una bozza AI mostra gli eventuali warning e richiede revisione manuale;
- la ricerca per ingredienti usa la password viewer, mostra l’elenco
  riconosciuto e ordina le ricette; dopo un refresh la sessione e la chiave si
  ripristinano senza chiedere di nuovo la password;
- dopo logout il contenuto scompare.

La sessione viewer e quella Admin restano attive fino al logout. Dopo refresh o
riapertura dell’app, i segreti vengono decifrati in RAM dal browser e l’Admin può
continuare a pubblicare e usare l’importazione AI senza reinserire la password.
Se IndexedDB non è disponibile, i segreti non si decifrano o la configurazione
cambia, l’app richiede nuovamente la password.
Nelle configurazioni già esistenti, reinserisci una volta la password di ciascun
viewer dalla scheda **Password lettori** per abilitarne la ricerca visuale. Né il
PAT né la API key vengono salvati in chiaro nel browser.

## Installazione come web app

Su GitHub Pages, aprendo il sito da un browser compatibile, il ricettario può
essere installato nella schermata Home o tra le applicazioni grazie a
`manifest.webmanifest` e `sw.js`. Dopo aver aperto l’app almeno una volta con
connessione, il service worker conserva la shell, `config.json` con i segreti
cifrati, il catalogo e i dataset. Online li richiede prima alla rete e aggiorna
la copia locale; offline usa l’ultima versione scaricata. Per questo, dopo una
pubblicazione Admin, un refresh connesso aggiorna il contenuto anche nella
cache offline. Ricerca e lettura funzionano offline; Gemini, le operazioni
GitHub e il caricamento delle immagini remote richiedono la connessione. Prompt
e risposte delle API esterne non vengono memorizzati.

Se il token è valido ma il push fallisce, controlla owner, repository, branch e
permesso `Contents: Read and write`. Un conflitto GitHub richiede di usare
`Ricarica da GitHub`, ricontrollare le modifiche e ripubblicare.

## Funzionamento

`index.html` non contiene il testo delle ricette: dopo il login carica il catalogo
JSON indicato in `config.json` (di default `datasets/catalog.json`) e tutti i
dataset delle fonti elencate. La password lettore verifica solo gli hash locali e
non tenta mai di decifrare il PAT. La password Admin decifra il PAT in RAM e
abilita le API GitHub Contents per caricare/salvare file e aggiornare gli hash
lettore; la sessione cifrata nel browser consente di ripristinare queste funzioni
fino al logout.

Per un dominio `github.io`, owner e repository vengono derivati da hostname e
pathname. Su un dominio custom compilali nei campi Owner/Repository di
`setup.html`.

## Dataset ricette

Il catalogo delle fonti è in `datasets/catalog.json`; ogni fonte ha un dataset
separato, ad esempio `datasets/cbt-pirotta.json` e
`datasets/ricette-regionali.json`. Gli ID delle ricette sono globalmente univoci
e prefissati dall’ID fonte. Il dataset CBT contiene 660 ricette con categorie,
sottocategorie e sezioni ordinate. La fonte “Ricette regionali” contiene 4.579
ricette ricavate dalla trascrizione OCR di
`output/cucina-regionale-italiana-5000-ricette.md`: non è stato corretto
editorialmente, ma sono stati corretti gli errori OCR esclusivamente univoci; i
casi ambigui sono rimasti invariati. Ogni voce conserva pagina, righe sorgente,
intestazione OCR, `region` e gli eventuali `geographicReferences` espliciti. La
provenienza della regione è indicata in `regionSource`; le regioni recuperate
dall’indice finale sono marcate `alphabetical-index`. Nel CBT la regione resta
`null` perché non è dichiarata dalla fonte. Le 96 tavole fotografiche fuori
testo non vengono importate come ricette.

L’importazione della fonte regionale può essere rigenerata con:

```sh
node tools/import-regional-recipes.js
```

La fonte bilingue `1080 recetas de cocina` di Simone Ortega è nel singolo file
`datasets/1080-recetas-cocina-es-it.json`. Ogni ricetta usa un titolo nel formato
`spagnolo - italiano` e contiene due blocchi strutturati, `Español` e `Italiano`;
gli a capo sono rappresentati dagli elementi dei paragrafi, non da sequenze
letterali `\\n`. Le ricette restano in stato `review` finché la traduzione non
viene verificata manualmente. Gli avvisi OCR e i riferimenti alle pagine sono
conservati nei metadati delle singole ricette.

Per correggere nuovamente la trascrizione prima dell’importazione:

```sh
node tools/correct-regional-transcription.js
node tools/import-regional-recipes.js
```

La migrazione originale CBT può essere rigenerata con:

```sh
node tools/migrate-recipes.js
```

È un comando da usare solo per una nuova importazione da
`Ricettario_CBT.html`: aggiorna `datasets/cbt-pirotta.json` e la relativa voce
del catalogo. Dopo l’attivazione del CRUD, le modifiche quotidiane dovranno
essere fatte dai pannelli Admin sui dataset strutturati.

La ricerca batch delle immagini può essere rigenerata con:

```sh
MEDIA_CONCURRENCY=16 node tools/find-recipe-media.js
```

Il comando conserva le immagini già presenti, cerca prima pagine web di ricette
tramite Bing e DuckDuckGo e analizza `Recipe` JSON-LD e `og:image`; usa poi
Openverse e Wikimedia Commons come fallback. Per le pagine web confronta il
titolo completo e il contesto regionale, salva progressivamente il manifest e
lascia fuori pagine generiche, immagini non pertinenti e PDF. Le immagini web
sono sempre `suggested` e hanno licenza da verificare.

Per limitare o riprendere un lotto si possono usare `MEDIA_SOURCE`,
`MEDIA_LIMIT` e `MEDIA_OFFSET`; `MEDIA_REFRESH_SUGGESTED=1` abilita
esplicitamente la sostituzione dei suggerimenti già presenti.

GitHub richiede il permesso Contents in scrittura per l'endpoint usato per
creare o aggiornare file; vedi la [documentazione REST ufficiale](https://docs.github.com/en/rest/repos/contents).
