# Omnibus Worker — Guida al Deploy

## Prerequisiti

- Account Cloudflare (gratuito)
- Node.js installato
- Wrangler installato: `npm install -g wrangler` oppure usa `npx wrangler`

---

## Passo 1 — Accedi a Cloudflare

```bash
npx wrangler login
```

Si apre il browser. Autorizza Wrangler.

---

## Passo 2 — Crea il database D1

Dalla cartella `worker/`:

```bash
cd worker
npx wrangler d1 create omnibus-db
```

Copiа il `database_id` restituito e incollalo in `wrangler.toml`:

```toml
database_id = "INCOLLA-IL-TUO-ID-QUI"
```

---

## Passo 3 — Applica lo schema

```bash
npx wrangler d1 execute omnibus-db --file=./schema.sql
```

---

## Passo 4 — Imposta i secret

```bash
npx wrangler secret put ALLOWED_ORIGIN
# Inserisci l'URL esatto della tua PWA, es: https://mia-app.pages.dev
```

Nota: `WORKER_MASTER_KEY` è predisposto per usi futuri ma non ancora richiesto dal Worker v1.

---

## Passo 5 — Pubblica

```bash
npx wrangler deploy
```

Otterrai un URL tipo `https://omnibus-worker.<tuo-account>.workers.dev`.

Copia quell'URL in Omnibus → Impostazioni → URL Worker.

---

## Test locali

```bash
node test_suite.js
```

Devono risultare 6 test tutti ✅.

---

## Struttura endpoint

| Metodo | Endpoint       | Descrizione                              |
|--------|----------------|------------------------------------------|
| POST   | /api/pair/init | Dispositivo primario genera token QR      |
| POST   | /api/pair      | Dispositivo secondario riscatta il token |
| POST   | /api/sync      | Push payload cifrato                     |
| GET    | /api/sync      | Pull aggiornamenti                       |
| GET    | /health        | Health check                             |

---

## Sicurezza

- **CORS obbligatorio**: configura `ALLOWED_ORIGIN` con l'origine HTTPS esatta della PWA. Il Worker rifiuta qualsiasi richiesta da origini non corrispondenti.
- **HMAC-SHA256**: ogni richiesta autenticata include firma, timestamp e request-id unico.
- **Replay protection**: i request-id vengono memorizzati in D1 per 5 minuti.
- **Rate limit**: 30 richieste/minuto per dispositivo.
- **Token QR**: monouso, scadenza 10 minuti.
- I dati salvati in D1 sono **già cifrati lato client** prima di arrivare al Worker.
