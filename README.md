# ROMAGUESSR — Cesena Edition

Gioco geografico open source e mobile-first dedicato a **Cesena e dintorni**. Esplora fotografie geolocalizzate e cerca di indovinare dove ti trovi.

**Stato:** prototipo MVP (v0.2). Il codice di gioco è testato; la disponibilità effettiva delle fotografie intorno a Cesena e il caricamento delle API di terze parti richiedono una prova online. **Non vengono inventati panorami o luoghi.**

## Funzionalità

- Area circolare attorno a Cesena (raggio 24 km).
- Partite da 5 o 10 round, oppure modalità infinita.
- Foto e panorami Panoramax con movimento tra fotografie della stessa sequenza (quando disponibile); fotografie Wikimedia Commons geolocalizzate come fallback. Solo le foto Panoramax sono navigabili: una fotografia Commons è statica.
- Mapillary come provider facoltativo, usando un client access token proprio.
- Mappa Leaflet con basemap CARTO / OpenStreetMap.
- Distanza in metri/chilometri e punti da 0 a 5.000 per round.
- Statistiche personali solo nel browser (`localStorage`): partite, vittorie, percentuale vittorie, serie e miglior punteggio.
- Sfide tramite link: stesse foto e stesso ordine per tutti, **su Panoramax o Wikimedia Commons**, senza account o server; il gioco ricarica i dati pubblici delle foto tramite i loro identificativi.
- Interfaccia scura adattiva, icone e manifest PWA per la schermata Home dell'iPhone.

## Test rapido in locale

Serve solo un browser recente e un piccolo server HTTP locale (non aprire l'HTML come `file://`).

```sh
cd romaguessr
python3 -m http.server 8000
```

Apri http://localhost:8000. Serve la connessione a Internet per foto, mappa e librerie CDN. Per i test delle formule:

```sh
node --test tests/*.test.mjs
```

## Pubblicazione su GitHub Pages

1. Su GitHub crea **un repository pubblico vuoto** chiamato `romaguessr` (non inizializzarlo con README/licenza, sono inclusi).
2. Carica **il contenuto di questa cartella**, mantenendo `index.html` nella radice del repository (non caricare la cartella esterna come unica sottocartella).
3. Apri **Settings → Pages** del repository. In **Build and deployment** scegli *Deploy from a branch*, branch `main`, cartella `/(root)`, e salva.
4. A pubblicazione completata l'indirizzo previsto è `https://TUOUSERNAME.github.io/romaguessr/`.
5. Su iPhone apri il sito con Safari e scegli *Condividi → Aggiungi alla schermata Home*.

Le pagine sono statiche: non servono server o compilazioni. **Questa versione non è ancora stata pubblicata su GitHub**: i passaggi sopra vanno eseguiti dal proprietario del nuovo repository, oppure usando un’integrazione che consenta la creazione del repository. Puoi usare `python -m http.server` oppure modificare direttamente i file HTML/CSS/JS. `sw.js` memorizza solo il codice locale e non mette in cache né scarica in massa fotografie o mappe.

## Fonte immagini

**Panoramax (prioritario):** utilizza l'API STAC federata `https://api.panoramax.xyz/api/search` per cercare immagini entro una certa area. Dà precedenza alle foto a 360°; se non abiliti «solo 360°» può utilizzare anche fotografie tradizionali. La disponibilità a Cesena potrebbe essere insufficiente. La presenza del servizio non garantisce la copertura locale. L'anteprima usa `@panoramax/web-viewer` via CDN. Le immagini appartengono ai rispettivi autori e hanno licenze che possono differire: verifica i metadati della fonte prima di riutilizzarle, scaricarle o redistribuirle. Il codice del gioco MIT **non cambia** le licenze delle immagini.

**Wikimedia Commons (fallback automatico):** tramite l’API MediaWiki GeoSearch, recupera solo foto geotaggate e di dimensioni sufficienti dentro il raggio di 24 km da Cesena. Non tutte sono panorami e non permettono il movimento lungo strada. Per ogni fotografia il gioco visualizza attribuzione/autore e licenza dichiarati nella fonte, con link alla pagina originale dopo la risposta. La presenza delle coordinate non assicura che la foto sia stata scattata proprio da quel punto né che sia di buona qualità; una curatela manuale è consigliata. Le fotografie rimangono soggette alle loro licenze individuali.

**Mapillary (opzionale):** apri Impostazioni e incolla il *client access token* della tua applicazione Mapillary. Il token è salvato solo nel tuo `localStorage` ma viene inviato al servizio Mapillary per le richieste; usa un token destinato a browser e rispetta termini d'uso e limiti della piattaforma. Il sito non pubblica il token su GitHub. Le sfide con link Mapillary non sono ancora implementate, perché richiederebbero una gestione condivisa più affidabile del provider.

**Mappe:** usa le tile pubbliche CARTO Dark Matter, con attribuzioni OpenStreetMap e CARTO visibili. Evita grandi carichi, scraping e scaricamenti in massa; se il pubblico cresce, valuta un piano/provider cartografico adeguato.

## Sicurezza e limiti v0.2

- I link delle sfide contengono solo gli ID pubblici delle foto Panoramax/Commons; i punti esatti si recuperano dall'API pubblica, quindi **non sono anti-cheat**. È una sfida tra amici basata sulla fiducia.
- Una **vittoria** significa raggiungere almeno 3.000 punti medi per round (15.000 punti su 5 round o 30.000 su 10). Serie e percentuale vittorie si basano sulle partite completate da 5 o 10 round, e la modalità infinita non modifica queste statistiche.
- Non esiste una classifica mondiale senza registrazione. Realizzarla richiederebbe un backend, moderazione e protezioni contro la manipolazione dei punteggi.
- Nessuna dipendenza viene inserita nel repository: Leaflet, MapillaryJS e il visualizzatore Panoramax sono caricati dalle CDN. Offline, giochi e foto non funzionano.
- La mappa pubblica impiega servizi di terze parti che possono cambiare condizioni, API e disponibilità.
- Il toggle «Consenti movimento» controlla Panoramax: per Mapillary la limitazione movimento non è ancora implementata.
- In modalità infinita la ripetizione delle foto può avvenire dopo aver esaurito i punti disponibili.
- Il risultato della partita non viene salvato sul server; la cache o i dati di Safari possono cancellare le statistiche.

## Roadmap

1. Verificare copertura Panoramax e Wikimedia Commons a Cesena, Savignano sul Rubicone, Gambettola, Montiano e Bertinoro; curare manualmente una lista di punti di qualità.
2. Integrare un provider Mapillary con quota adeguata e verificare la mobilità nelle sequenze.
3. Sfide con risultati verificabili e classifiche guest, tramite backend opzionale e rate limiting.
4. Modalità provincia, Monte + Riviera, difficoltà, timer e salvataggio progressi.
5. Test E2E in browser e test reale iOS/Safari.

## Riferimenti

- Panoramax Web Viewer: https://viewer.geovisio.fr/docs/
- Panoramax API / STAC: https://docs.panoramax.fr/backend/dev/STAC_compatibility/
- Wikimedia Commons GeoSearch: https://commons.wikimedia.org/wiki/Commons:Search_by_location
- MapillaryJS: https://github.com/mapillary/mapillary-js
- Leaflet: https://leafletjs.com/
- GitHub Pages: https://docs.github.com/en/pages

## Licenza

MIT per il **codice originale di ROMAGUESSR**. I file, librerie, immagini e mappe di terze parti restano soggetti alle rispettive licenze e termini.
