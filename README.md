# Omnibus Protocol Pro (v8.5-secure)

**Omnibus Protocol Pro** è un *Personal Operating System* quotidiano progettato per uno studente universitario, basato sul principio fondante **"mens sana in corpore sano"**.

L'applicazione organizza, traccia ed ottimizza l'equilibrio tra quattro pilastri di pari dignità:
1. **Studio universitario ed esami** (Gerarchia Esami $\rightarrow$ Moduli $\rightarrow$ Argomenti, Spaced Repetition intelligente, stima probabilistica di completamento, backlog throttling).
2. **Allenamento e movimento fisico** (Schede di allenamento, progressione dei carichi, serie, ripetizioni, RPE, timer di recupero e tracciamento del volume settimanale).
3. **Alimentazione e idratazione** (Diario alimentare, scomposizione dei macronutrienti, database alimenti, ricette e parser IA Gemini integrato tramite Worker proxy).
4. **Sonno, recupero, energia e gestione dello stress** (Registro quotidiano del riposo e della prontezza con suggerimenti contestuali neutrali ed organizzativi).

---

## 🔒 Architettura di Sicurezza & Cifratura Zero-Knowledge

- **Passphrase ESCLUSIVAMENTE in Memoria RAM**: La passphrase personale usata per decifrare i dati `AES-256-GCM` **NON viene mai salvata nel disk locale o in `localStorage`**. Resiede unicamente nella memoria volatile JavaScript finché l'app rimane aperta.
- **Blocco Automatico per Inattività (15 Minuti)**: Se l'utente non interagisce con l'app per 15 minuti, la memoria viene pulita e l'interfaccia viene bloccata. Può anche essere bloccata manualmente con il pulsante **"🔒 Blocca Omnibus"**.
- **Doppio Segreto & Pairing QR Monouso**:
  - **Passphrase E2E**: Conosciuta solo dall'utente per cifrare/decifrare i dati locali.
  - **Device Auth Secret**: Generato a 256-bit nel pairing QR iniziale e memorizzato nel Worker cifrato tramite **`WORKER_MASTER_KEY`**.
  - **Token di Pairing Hashati (SHA-256)**: I token QR sono salvati nel Worker solo come hash SHA-256 e cancellati istantaneamente dal database D1 dopo la redenzione.
- **Verifica HMAC Server-Side & Anti-Replay**:
  - Il Worker verifica la firma `HMAC-SHA256` per ogni richiesta HTTP tramite confronto a tempo costante (`timingSafeEqual`).
  - Protezione anti-replay tramite `X-Omnibus-Request-Id` e timestamp drift check (< 5 min).
  - Rate limiting a 30 req/min per dispositivo e limite di 2MB sul body della richiesta.
  - Restringimento CORS opzionale con la variabile d'ambiente `ALLOWED_ORIGIN`.

---

## 🌐 PWA Self-Contained Offline

- **Zero Dipendenze da CDN Esterni**: Le librerie grafiche `Chart.js` e `qrcode-generator` sono incluse ed archiviate localmente in `assets/vendor/`.
- **Service Worker v8.5-secure**: Precaching automatico dell'App Shell, fogli di stile, font, icone e librerie locali per funzionamento offline completo senza rete.

---

## 📁 Struttura del Progetto

```
/Applications/Omnibus
  ├── index.html                # App Shell principale PWA
  ├── manifest.webmanifest      # PWA Web Manifest ufficiale
  ├── manifest.json             # Alias sincronizzato per compatibilità
  ├── sw.js                     # Offline Service Worker v8.5-secure
  ├── .gitignore                # File di esclusione Git
  ├── assets/
  │   ├── styles.css            # Design System & Vanilla CSS
  │   ├── icon.svg              # Logo vettoriale dell'applicazione
  │   └── vendor/
  │       ├── chart.umd.min.js  # Libreria grafici locale
  │       └── qrcode.min.js     # Libreria codici QR locale
  ├── js/
  │   ├── app.js                # Controller applicativo e gestione eventi
  │   ├── storage.js            # Motore di persistenza IndexedDB (OmnibusDB)
  │   ├── crypto.js             # Cifratura client-side AES-256-GCM + HMAC (RAM only)
  │   ├── sync.js               # Motore Sync Cloudflare + Auto-Lock per inattività
  │   ├── planner.js            # Pianificazione quotidiana integrata (DailyPlan)
  │   ├── study.js              # Motore Spaced Repetition, Backlog Throttling & Esami
  │   ├── training.js           # Motore Allenamenti, Overload Progressivo & Status
  │   ├── nutrition.js          # Motore Nutrizione, Macro, Ricette & Proxy IA Gemini
  │   ├── recovery.js           # Motore Recupero & Suggerimenti Contestuali Neutrali
  │   ├── analytics.js          # Analisi trend storici a 30 giorni
  │   └── ui.js                 # Render UI, Modali, Toast, Animazioni & Helper Sanitizzazione XSS
  └── worker/
      ├── src/index.js          # Serverless Sync Hub API & Proxy Gemini (Cloudflare Worker)
      ├── schema.sql            # Schema SQL D1 con dispositivi cifrati e token haashati
      └── wrangler.toml         # Configurazione deploy Wrangler Cloudflare
```
