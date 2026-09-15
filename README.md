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
   l’importazione da foto/PDF, inserisci anche una API key Gemini: viene cifrata
   separatamente con la stessa password Admin. L’app usa l’alias
   `gemini-flash-latest`, quindi segue automaticamente l’ultima versione Flash.
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

Nel pannello Admin, dopo aver configurato una API key Gemini, scegli una foto o
un PDF e premi **Analizza e compila**. `index.html` invia il file direttamente a
Gemini, carica il prompt da `prompts/recipe-extraction.md`, usa
`prompts/recipe-schema.json` per richiedere e controllare la struttura della
risposta e apre una bozza nel form esistente. La ricetta
non viene mai pubblicata senza revisione e salvataggio manuale.

La API key viene decifrata solo nella sessione Admin e non viene salvata in
localStorage, cookie o sessionStorage. È comunque una chiave client-side durante
la chiamata: usa una chiave Gemini separata, con quota e limiti di spesa ridotti.
Il prompt e lo schema non sono segreti e possono essere modificati e pubblicati
indipendentemente dal codice.

## Ricerca per ingredienti fotografati

Nel lettore, **Cosa posso cucinare?** permette di aggiungere fino a sei foto di
frigo, dispensa o piano di lavoro, anche in più passaggi. Gemini riconosce solo
gli alimenti realmente visibili e restituisce quantità e confidenza quando sono
leggibili; non completa automaticamente spezie o ingredienti non fotografati.
Prima della ricerca l’elenco è sempre modificabile: controlla, correggi o
aggiungi gli ingredienti riconosciuti.

La prima analisi richiede la password Admin se la chiave AI non è già presente
nella sessione. Se l’utente è già entrato come Admin e ha riattivato le funzioni
Admin, non viene richiesta una seconda volta. La chiave e le fotografie restano
solo nella memoria della scheda e non vengono salvate nel dataset o nel browser.

Il ranking delle ricette è locale: considera la percentuale di ingredienti
coperti e dà più peso agli ingredienti rari nel dataset. Le corrispondenze sono
indicative; l’elenco mostra anche gli ingredienti eventualmente mancanti e non
modifica mai le ricette.

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
- il pannello **Fonti** permette di creare e modificare il catalogo delle fonti;
- il selettore **Tema** alterna tra il tema Mediterraneo (predefinito) e quello
  Classico e conserva la preferenza solo nel browser;
- gestione password lettori continua a funzionare;
- con una configurazione AI valida, foto e PDF compilano una bozza ricetta;
- una bozza AI mostra gli eventuali warning e richiede revisione manuale;
- la ricerca per ingredienti permette di aggiungere più foto, richiede lo
  sblocco Admin al primo uso, mostra l’elenco riconosciuto e ordina le ricette;
- dopo logout il contenuto scompare.

Per i lettori, dopo il primo accesso la sessione viene ricordata solo nella scheda
corrente tramite `sessionStorage`: un refresh non richiede nuovamente la password,
mentre la chiusura della scheda la cancella. Anche l’area Admin viene ripristinata
dopo un refresh, ma il PAT e la API key vengono rimossi dalla RAM: il pannello
mostra il dataset pubblico e richiede nuovamente la password Admin solo quando
serve pubblicare, aggiornare le password lettore o usare l’importazione AI. Né il
PAT né la API key vengono mai salvati nel browser.

## Installazione come web app

Su GitHub Pages, aprendo il sito da un browser compatibile, il ricettario può
essere installato nella schermata Home o tra le applicazioni grazie a
`manifest.webmanifest` e `sw.js`. Il service worker memorizza solo la shell
statica dell’app; `config.json`, `datasets/`, i prompt e le API esterne restano
sempre esclusi dalla cache. Dopo una pubblicazione Admin, le nuove ricette sono
disponibili al successivo refresh o alla riapertura dell’app: non è previsto un
aggiornamento istantaneo mentre la schermata resta aperta.

Se il token è valido ma il push fallisce, controlla owner, repository, branch e
permesso `Contents: Read and write`. Un conflitto GitHub richiede di usare
`Ricarica da GitHub`, ricontrollare le modifiche e ripubblicare.

## Funzionamento

`index.html` non contiene il testo delle ricette: dopo il login carica il catalogo
JSON indicato in `config.json` (di default `datasets/catalog.json`) e tutti i
dataset delle fonti elencate. La password lettore verifica solo gli hash locali e
non tenta mai di decifrare il PAT. La password Admin decifra il PAT in RAM e
abilita le API GitHub Contents per caricare/salvare file e aggiornare gli hash
lettore.

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
