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
   `index.html`, `config.json`, `recipes.json`, `favicon.svg`,
   `manifest.webmanifest`, `sw.js`, la directory `icons/` e la directory
   `prompts/` tramite GitHub Pages. Configura Pages dalla branch scelta e
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
   `index.html`, `config.json`, `recipes.json` e `prompts/`. Mantieni
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
- `Salva e pusha recipes.json` crea il commit atteso;
- gestione password lettori continua a funzionare;
- con una configurazione AI valida, foto e PDF compilano una bozza ricetta;
- una bozza AI mostra gli eventuali warning e richiede revisione manuale;
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
statica dell’app; `config.json`, `recipes.json`, i prompt e le API esterne restano
sempre esclusi dalla cache. Dopo una pubblicazione Admin, le nuove ricette sono
disponibili al successivo refresh o alla riapertura dell’app: non è previsto un
aggiornamento istantaneo mentre la schermata resta aperta.

Se il token è valido ma il push fallisce, controlla owner, repository, branch e
permesso `Contents: Read and write`. Un conflitto GitHub richiede di usare
`Ricarica da GitHub`, ricontrollare le modifiche e ripubblicare.

## Funzionamento

`index.html` non contiene il testo delle ricette: dopo il login carica il dataset
JSON indicato in `config.json` (di default `recipes.json`). La password lettore verifica solo gli hash locali e
non tenta mai di decifrare il PAT. La password Admin decifra il PAT in RAM e
abilita le API GitHub Contents per caricare/salvare file e aggiornare gli hash
lettore.

Per un dominio `github.io`, owner e repository vengono derivati da hostname e
pathname. Su un dominio custom compilali nei campi Owner/Repository di
`setup.html`.

## Dataset ricette

Il corpus strutturato è in `recipes.json` e contiene 660 ricette con ID stabili,
categorie, sottocategorie e sezioni ordinate. La migrazione originale può
essere rigenerata con:

```sh
node tools/migrate-recipes.js
```

È un comando da usare solo per una nuova importazione da
`Ricettario_CBT.html`: sovrascrive `recipes.json`. Dopo l’attivazione del CRUD,
le modifiche quotidiane dovranno essere fatte sul dataset strutturato.

GitHub richiede il permesso Contents in scrittura per l'endpoint usato per
creare o aggiornare file; vedi la [documentazione REST ufficiale](https://docs.github.com/en/rest/repos/contents).
