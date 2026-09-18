# Guida al Deploy Gratuito di Omnibus Protocol Pro (v8.5-secure)

Questa guida illustra la procedura passo-passo per pubblicare gratis **Omnibus Protocol Pro** su **Cloudflare Pages** e configurare lo **Sync Hub Serverless (Cloudflare Worker + D1 Database)** per la sincronizzazione multi-dispositivo sicura e cifrata.

---

## ☁️ Parte 1: Deploy del Frontend PWA (Cloudflare Pages)

1. Crea o aggiorna un repository **GitHub** con i file contenuti nella cartella del progetto `/Applications/Omnibus`.
2. Accedi alla dashboard di **Cloudflare** ($\rightarrow$ *Workers & Pages* $\rightarrow$ *Create Application* $\rightarrow$ *Pages*).
3. Connetti il tuo account GitHub e seleziona il repository di Omnibus.
4. Lascia i campi di Build vuoti (poiché si tratta di un'applicazione web statica PWA pura senza framework pesanti).
5. Premi **Save and Deploy**.
6. In pochi secondi otterrai l'URL HTTPS di produzione (es: `https://omnibus.pages.dev`).

---

## ⚡ Parte 2: Deploy dello Sync Hub Serverless (Cloudflare Worker + D1)

### 1. Inizializzazione del Database D1
Apri un terminale nella cartella `/Applications/Omnibus/worker` ed esegui:
```bash
npx wrangler d1 create omnibus-db
```
Copia il `database_id` restituito dal comando ed incollalo nel file `wrangler.toml`:
```toml
name = "omnibus-sync-hub"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "omnibus-db"
database_id = "IL_TUO_DATABASE_ID_QUI"
```

### 2. Creazione della Struttura delle Tabelle SQL
Esegui lo script SQL per creare le tabelle D1:
```bash
npx wrangler d1 execute omnibus-db --file=schema.sql
```

### 3. Configurazione dei Secret di Sicurezza su Cloudflare

#### A. Imposta la Master Key per cifrare i segreti di dispositivo (Obbligatorio)
```bash
npx wrangler secret put WORKER_MASTER_KEY
```
*(Inserisci una stringa casuale alfanumerica di almeno 32 caratteri)*.

#### B. Imposta la API Key di Gemini per l'analisi dei pasti via IA (Obbligatorio per IA)
```bash
npx wrangler secret put GEMINI_API_KEY
```
*(Inserisci la tua API Key personale ottenuta da Google AI Studio)*.

#### C. Imposta l'Origine Ristretta CORS (Consigliato)
```bash
npx wrangler secret put ALLOWED_ORIGIN
```
*(Inserisci l'URL esatto della tua PWA, es: `https://omnibus.pages.dev` o `https://tuouser.github.io`)*.

### 4. Deploy del Worker
```bash
npx wrangler deploy
```

---

## 📲 Parte 3: Configurazione Iniziale dell'App & Pairing Dispositivi

1. Apri la PWA sul tuo dispositivo principale (es. Mac) all'URL della tua pagina Cloudflare Pages.
2. Vai nel tab **Impostazioni** ed inserisci l'URL del Worker generato (es: `https://omnibus-sync-hub.tuouser.workers.dev`).
3. Per associare un secondo dispositivo (es. iPad o telefono Android):
   - Nel dispositivo principale premi **"Genera Codice QR Pairing 📲"**.
   - Sul secondo dispositivo, apri l'app e scansiona o inserisci il token QR entro 10 minuti.
   - Il secondo dispositivo riceverà in automatico le sue credenziali uniche firmate dal Worker.
