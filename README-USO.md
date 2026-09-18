# Manuale d'Uso Quotidiano – Omnibus Protocol Pro (v8.5-secure)

**Omnibus Protocol Pro** è un *Personal Operating System* integrato per organizzare, monitorare e migliorare la giornata dello studente-atleta.

---

## 🎯 1. Tab "Oggi" (Pianificazione Integrata)

La schermata iniziale racchiude la sintesi della giornata in corso:
- **Orologio e Data**: Visualizzazione HUD in tempo reale.
- **Badge di Sincronizzazione**: Indicatore visivo dello stato della cifratura e della connessione (`🟢 Sync Attivo`, `⚠️ Inserisci Passphrase`, `🔴 Offline`).
- **Conto alla Rovescia Esame**: Visualizzazione automatica dei giorni mancanti all'esame più vicino.
- **Suggerimenti Contestuali del Giorno**: Messaggi organizzativi descrittivi non-clinici basati sui dati di sonno, energia e stress registrati.
- **Barra Azioni Rapide**:
  - **📚 Studio**: Avvio immediato di una sessione Pomodoro da 25 minuti.
  - **🏋️‍♂️ Allenamento**: Visualizzazione e registrazione della scheda del giorno.
  - **🥗 Pasto**: Diario pasti rapido.
  - **🔄 Copia Pasti Ieri**: Copia con 1 tap di tutti i pasti del giorno precedente.
  - **💧 +250ml**: Registrazione idratazione istantanea.
  - **🧘‍♂️ Recupero Attivo**: Registrazione rapida di 20 minuti di mobilità o camminata.

---

## 📚 2. Tab "Studio" (Esami & Spaced Repetition)

- **Struttura Gerarchica**: Organizza il materiale in `Esami` $\rightarrow$ `Moduli` $\rightarrow$ `Argomenti`.
- **Valutazione delle Sessioni**:
  - **Non valutato**: Per sessioni di prima lettura o schematizzazione iniziale.
  - **Debole**: Ripasso riprogrammato dopo 1 giorno.
  - **Medio**: Ripasso riprogrammato dopo 4 giorni.
  - **Solido**: Ripasso riprogrammato dopo 14 giorni.
- **Pulsante "Rinvia di 1 Giorno"**: Sposta la data del ripasso di 24 ore senza alterare il punteggio di padronanza.
- **Gestione Arretrati (Backlog Throttling)**: L'app limita automaticamente i ripassi a massimo 5 al giorno, riprogrammando in modo fluido gli arretrati sulle giornate successive per evitare accumuli di oltre 40 ripassi nello stesso giorno.

---

## 🏋️‍♂️ 3. Tab "Allenamento" (Movimento & Recupero Attivo)

- **Schede & Progressioni**: Registrazione dettagliata di serie, ripetizioni, carichi (kg), RPE (Sforzo Percepito 1-10) e note.
- **Stati del Workout**: Distinzione esplicita tra workout `pianificato`, `svolto`, `saltato` e `spostato`.
- **Recupero Attivo**: Sessioni di stretching, mobilità e camminata integrate nel calendario.

---

## 🥗 4. Tab "Alimentazione" (Diario Pasti & Scanner IA)

- **Diario Pasti**: Registrazione di Colazione, Pranzo, Cena e Spuntini.
- **Profili Nutrizionali del Giorno**: Target calorici e macro configurabili per *Giorno Allenamento (High Carb)*, *Giorno Riposo* e *Giorno Studio Intenso*.
- **Scanner IA Gemini via Worker Proxy**: Inserisci una descrizione testuale del pasto (es. *"200g di petto di pollo ai ferri con 100g di riso basmati ed un cucchiaio di olio"*). L'IA estrae i macronutrienti stimati lasciando all'utente la possibilità di verificare e modificare i dati prima del salvataggio.
- **Qualità del Dato**: Evidenza visiva della fonte per ogni pasto (`[manuale]`, `[database]`, `[stimato_gemini]`).

---

## 🔒 5. Sicurezza, Passphrase e Troubleshooting

- **Sblocco dell'App**: All'apertura dell'app o dopo 15 minuti di inattività, inserisci la tua passphrase personale nel modal di sblocco.
- **Smarrimento Passphrase**: Poiché la cifratura è Zero-Knowledge, **nessun server conosce la tua passphrase**. In caso di smarrimento della passphrase, i dati remoti cifrati non potranno essere decifrati. Si consiglia di effettuare periodicamente un **Backup JSON locale** dal tab *Impostazioni*.
