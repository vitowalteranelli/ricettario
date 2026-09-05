Agisci come Principal Software Engineer e Architetto Frontend. Il tuo compito è progettare e implementare una soluzione minimale, estremamente manutenibile e 100% self-contained per un sito statico protetto da password con gestione contenuti e utenti su GitHub Pages.

### OBIETTIVO DEL PROGETTO
Realizzare un'applicazione web static su singolo file (`index.html` o `admin.html`) per un sito ospitato su GitHub Pages con le seguenti caratteristiche:
1. "Password Wall" iniziale: Tutto il contenuto del sito è NASCOSTO. Nessun contenuto è visibile prima dell'autenticazione.
2. Sistema di Autenticazione Multi-Ruolo:
   - Password di Sola Lettura (Read-Only): Sblocca la visualizzazione dei contenuti. Disabilita l'editor e NON decifra mai il Token di GitHub.
   - Password Admin: Sblocca la visualizzazione, decifra il Token GitHub e attiva il pannello Admin (editor contenuti + gestione delle password di lettura).
3. Gestione Dinamica Accessi Lettori (Admin Feature):
   - Nel pannello Admin deve essere presente una sezione "Gestione Password Lettori" che permetta di AGGIUNGERE, EDITARE o RIMUOVERE le password di sola lettura.
   - Quando l'Admin modifica le password di lettura, il JS calcola i nuovi hash SHA-256 e aggiorna automaticamente il file di configurazione (`config.json`) nel repo tramite le API di GitHub.

### VINCOLI ARCHITETTURALI TASSATIVI
1. 100% Self-Contained: Tutto risiede nel repository GitHub Pages. NESSUN backend esterno, NESSUN server proxy OAuth, NESSUN servizio SaaS terzo.
2. Zero Dipendenze/Build Tools: Solo Vanilla JavaScript (ES6+) e Web Crypto API nativa del browser.
3. Sicurezza & Crittografia:
   - Password Read-Only: Verificate tramite confronto di hash sicuro SHA-256 (PBKDF2).
   - Password Admin: Utilizzata per derivare la chiave AES-256-GCM (PBKDF2, SHA-256, >= 100.000 iterazioni) e decifrare in memoria RAM il Personal Access Token (PAT) di GitHub.
   - I dati di configurazione (PAT cifrato e array degli hash di lettura) risiedono in un file `config.json` nel repo. Zero segreti in chiaro nel codice.

### SPECIFICHE TECNICHE E REQUISITI FUNZIONALI

1. Flusso di Autenticazione (Password Wall):
   - All'apertura della pagina viene mostrato solo il form di Login.
   - Se inserisco una Password Read-Only valida ➔ Sblocca e mostra solo il contenuto delle pagine (modalità Lettore).
   - Se inserisco la Password Admin ➔ Decifra il PAT in RAM, sblocca la visualizzazione E attiva il menu Amministratore.

2. Funzionalità Pannello Admin (API REST GitHub v3):
   - Editor Contenuti: Input percorso file, pulsante "Carica File", `<textarea>` per editing, input messaggio di commit, pulsante "Salva e Pusha" (`PUT` con Base64 UTF-8 safe).
   - Gestione Accessi: Form per aggiungere/rimuovere password di lettura. Pulsante "Aggiorna Password Lettori" che invia una `PUT` al file `config.json` su GitHub con i nuovi hash.

3. Rilevamento Automatico del Repository:
   - Rileva automaticamente OWNER e REPO da `window.location.hostname` e `window.location.pathname`.

---

### OUTPUT RICHIESTI

1. STRUTTURA DEL FILE `config.json` INIZIALE: Esempio di schema JSON contenente il payload cifrato del PAT e l'array di hash per le password di lettura.
2. UTILITY DI SETUP INIZIALE: Script JS helper per generare la prima volta la struttura del file `config.json` a partire dal PAT e dalle password desiderate.
3. CODICE COMPLETO DELL'APPLICAZIONE (`index.html`): Codice HTML/CSS/JS unico, commentato, responsive e pronto all'uso.
4. GUIDA AL SETUP IN 3 PASSI: Istruzioni su come configurare il PAT su GitHub e caricare i file `index.html` e `config.json` nel repository.

---

### DATI DI CONFIGURAZIONE REALI (WARM START)
Usa questi dati per generare direttamente il `config.json` e il codice pronto all'uso:
- Password Admin: "XXX"
- Password/e Sola Lettura Iniziali: ["XXX"]
- GitHub Personal Access Token (PAT): "XXX"