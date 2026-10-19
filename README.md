# ROMAGNAGUESSER · Cesena Edition

**Indovina dove sei in Romagna.** Videogioco geografico open source, gratuito e senza account, progettato per browser desktop e iPhone.

Questa versione (v0.3) utilizza un'identità visiva originale ispirata al **rosso e oro** della tradizione romagnola, con **gallo e caveja stilizzati**. Non è uno stemma istituzionale. Il codice è pubblicato con licenza MIT; le fotografie di terze parti conservano licenze e crediti propri.

## Modalità disponibili

- Cesena e dintorni (raggio indicativo di 24 km)
- Partite da 5 o 10 round; modalità infinita
- Punteggio su 5.000 punti/round, calcolato in base alla distanza
- Sfide tramite link con la medesima sequenza di immagini
- Panoramax e Wikimedia Commons, con fallback su immagini statiche geolocalizzate
- Mapillary facoltativo (richiede un proprio client access token)
- Mappa interattiva con Leaflet, statistiche sul dispositivo e web app installabile

## PUBBLICAZIONE SUL TUO REPOSITORY (ISTRUZIONI ESSENZIALI)

Repository esistente: https://github.com/cera1984/ROMAGNAGUESSERdemo1

1. Scarica `ROMAGNAGUESSER-completo.zip` ed **estrailo** (NON caricare lo ZIP come unico file).
2. Apri il repository GitHub dal browser, scheda **Code**, quindi **Add file > Upload files**.
3. Trascina / seleziona **tutti i file contenuti nella cartella estratta**, senza caricare la cartella esterna. `index.html`, `app.mjs`, `icon.svg` e gli altri devono essere **nella radice** del repository.
4. I file con gli stessi nomi devono essere sostituiti. GitHub può richiedere di confermare la modifica. Premi **Commit changes**.
5. Vai in **Settings > Pages**: in **Build and deployment** scegli **Deploy from a branch**; come branch seleziona `main`, cartella `/(root)`, poi **Save**.
6. Verifica in **Actions** che `pages build and deployment` sia riuscito. Apri: https://cera1984.github.io/ROMAGNAGUESSERdemo1/
7. Se appare la vecchia grafica, aggiorna la pagina senza cache o rimuovi il sito da schermata Home e aggiungilo nuovamente.

**ATTENZIONE:** questo pacchetto non modifica automaticamente il tuo repository; GitHub deve ricevere i nuovi file. Non cancellare altri progetti nel tuo account.

### Installazione su iPhone

Safari → apri il sito pubblico → Condividi → **Aggiungi alla schermata Home**. L'icona ora mostra lo scudo rosso e oro, e il nome è ROMAGNAGUESSER.

## Test locali (facoltativi)

```bash
python3 -m http.server 8000
# Apri http://localhost:8000
node --test core.test.mjs
```

Le mappe, librerie e fotografie richiedono connessione Internet; la disponibilità di panorami 360° a Cesena dipende da fonti esterne. Il fallback Commons è una fotografia statica, non un panorama navigabile. Non vengono inventati luoghi.

## Organizzazione

Tutti i file restano nella **radice** per evitare errori di percorsi quando si caricano da telefono:

- `index.html` — interfaccia
- `styles.css` — grafica rosso/oro
- `app.mjs` — logica UI/partite
- `core.mjs` — punteggi, coordinate e sfide
- `providers.mjs` — dati fotografici
- `core.test.mjs` — test automatizzati
- `icon.svg`, `icon-180.png`, `icon-192.png`, `icon-512.png` — stemma e icone
- `manifest.webmanifest` — configurazione per l'installazione
- `sw.js` — cache del codice
- `LICENSE` — licenza MIT
- `.nojekyll` — impedisce a Jekyll di alterare i percorsi

### Note su API e licenze

Panoramax cerca immagini tramite la propria API pubblica, e gli autori/licenze delle foto vanno sempre rispettati. Wikimedia Commons usa fotografie geotaggate; le coordinate non garantiscono che la fotocamera fosse nello stesso punto. Mapillary è disponibile solo con token configurato dall'utente. Dati di mappa © OpenStreetMap/CARTO, secondo le rispettive condizioni.

**Nota:** il nome pubblico del gioco (ROMAGNAGUESSER) è indipendente dal nome attuale del repository GitHub (`ROMAGNAGUESSERdemo1`). Rinominare il repository è facoltativo, ma cambia il percorso del sito Pages.
