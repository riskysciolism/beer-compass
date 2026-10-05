# Beer Compass

Ein offline-first **Findbuch für Brauereien, Ausschänke und Craft-Bier-Hotspots** mit
Kompass-Nadel. Als installierbare PWA für Android Chrome gedacht – bewusst ohne
Karten, ohne CDN und ohne Tracking.

Die Oberfläche ist bewusst eine einzige Seite: oben der Kompass, darunter die
Eintragsliste, rechts oben das Zahnrad für die Einstellungen. Eine Bierflasche zeigt
mit ihrem Hals auf den ausgewählten Eintrag, die Kompassrose dreht sich gegen die
Geräteausrichtung. Beim Scrollen in der Liste schrumpft der Kompass auf die Hälfte –
bis wieder ganz oben gescrollt oder ein Eintrag angetippt wird.

Nach dem ersten Laden läuft die App vollständig ohne Internet: Daten liegen in
IndexedDB, die App-Shell im Service-Worker-Cache, das GPS funktioniert offline weiter.

---

## Inhalt

- [Schnellstart](#schnellstart)
- [npm-Skripte](#npm-skripte)
- [Wie die App funktioniert](#wie-die-app-funktioniert)
- [Datenformat](#datenformat)
- [Backend-API](#backend-api)
- [Offline- und Update-Verhalten](#offline--und-update-verhalten)
- [Installation auf Android](#installation-auf-android)
- [Qualitätssicherung](#qualitätssicherung)
- [Projektstruktur](#projektstruktur)
- [Konfiguration](#konfiguration)
- [Deployment](#deployment)
- [Datenschutz](#datenschutz)

---

## Schnellstart

Voraussetzung: **Node.js ≥ 20.19** (entwickelt und getestet mit Node 24) und npm.

```bash
npm install
npm run dev
```

Das startet gleichzeitig das Backend (`:8787`) und den Vite-Devserver (`:5173`).
Die App ist danach unter <http://localhost:5173> erreichbar.

Im Dev-Modus läuft **kein** Service Worker (HMR-Kompatibilität). Um den echten
Offline-Betrieb zu prüfen, den Produktionsbuild verwenden:

```bash
npm run build
npm run preview            # liefert dist/ + API auf http://localhost:8787 aus
```

## npm-Skripte

| Skript                | Zweck                                                          |
| --------------------- | -------------------------------------------------------------- |
| `npm run dev`         | Backend + Devserver zusammen                                    |
| `npm run dev:app`     | nur Vite-Devserver                                              |
| `npm run dev:api`     | nur das Backend                                                 |
| `npm run build`       | Typecheck + Produktionsbuild inkl. Service Worker                |
| `npm run build:only`  | nur Build (ohne Typecheck)                                       |
| `npm run preview`     | `dist/` + API auf `:8787` (auch mit `--port 8788`)              |
| `npm run typecheck`   | `vue-tsc --build --force`                                       |
| `npm run lint`        | ESLint (Flat Config), Warnungen sind Fehler                     |
| `npm run lint:fix`    | ESLint mit Autofix                                              |
| `npm run format`      | Prettier schreibt um                                            |
| `npm run format:check`| Prettier prüft nur                                              |
| `npm run icons`       | erzeugt `public/icons/*.png` reproduzierbar neu                |
| `npm run data:generate` | erzeugt die Beispieldaten neu                                |
| `npm run data:validate` | prüft `public/data/*.json` gegen das App-Schema              |
| `npm test`            | Lint + Typecheck + Datenvalidierung                             |
| `npm run test:e2e`    | Browsertest (Headless Chromium) gegen `npm run preview`         |
| `npm run test:ui`     | prüft Kompass, Auswahlleiste und Einstellungen im Browser          |

Zusätzliche Flags für das Backend:

```bash
node server/index.mjs --serve-dist --port 8787 --log
```

`--log` schreibt jede Anfrage mit Statuscode nach stdout (praktisch zum Nachsehen,
was die App tatsächlich abfragt).

## Wie die App funktioniert

```
┌───────────────┐   Daten (JSON)    ┌──────────────────────┐
│  Web Worker   │◀──────────────────│  Update-Service      │
│  zod-Prüfung  │   valide Items    │  HEAD / version.json │
└───────────────┘                   └──────────┬───────────┘
                                            │  HTTP
┌───────────────┐   IndexedDB (items, meta, settings, identity)
│  data-store   │◀──────────────────────────────────────────┐
└───────┬───────┘                                           │
        │                                                   │
┌───────▼───────┐   ┌──────────────┐   ┌─────────────────┐  │
│ Kompass +     │   │ Geo-Service  │   │ Service Worker  │◀─┘
│ Liste / Sheet │   │ watchPosition│   │ App-Shell-Cache │
└───────────────┘   └──────────────┘   └─────────────────┘
```

- **Quelle der Wahrheit ist IndexedDB**, nicht der Cache und nicht `localStorage`.
- **Große JSON-Dateien** werden in einem Web Worker geparst und mit zod geprüft –
  das Haupt-Bundle bleibt dadurch frei von zod (~44 kB gzip).
- **Kein Vue-Router und keine Reiter**: eine Seite mit Kompass, Liste, fester
  Auswahlleiste und zwei Sheets (Details, Einstellungen). Das hält das Bundle klein
  und reicht für eine PWA völlig.
- **Kompass** (`BeerCompass.vue`): reine SVG-Grafik ohne Bibliothek. Die Nadel
  zeigt auf die berechnete Peilung (`atan2(Δlon, Δlat)`), die N/O/S/W-Rose wird um
  das negative Geräte-Heading gedreht, damit Norden oben bleibt. Ohne
  Lagesensor (`deviceorientation`) wird die Rose ausgeblendet, statt zu raten.
- **GPS** läuft über `navigator.geolocation.watchPosition` mit Permission-Abfrage,
  Fehlerunterscheidung (verweigert / nicht verfügbar / Timeout) und optionaler
  High-Accuracy. Das Tracking pausiert, wenn die App in den Hintergrund geht, und
  läuft offline weiter.
- **Auswahl-Banner**: Unter dem Kompass schwebt ein Banner mit dem gewählten
  Eintrag – großer Name plus Entfernung. Die Richtungsangabe steht bewusst nicht
  dort, sie steckt in der Nadel. Oben rechts am Kompass zeigt eine kleine
  Genauigkeitsplakette die aktuelle GPS-Genauigkeit (z. B. „± 9 m").
- **Sortierung** direkt in der Liste: ein Knopf öffnet ein Dropdown mit
  „Nach Entfernung" und „Nach Name" (wird in den Einstellungen gespeichert).
- **GPS-Details** stehen bewusst nur in den Einstellungen; auf der Hauptseite
  erscheinen nur Distanz, Kompass und die Genauigkeitsplakette.

## Datenformat

`public/data/data.json` ist ein **Array** von Einträgen:

```json
[
  {
    "position": { "longitude": 4.8796, "latitude": 52.2561 },
    "address": "Molenweg 2, 2011 AN Haarlem",
    "image": "data:image/png;base64,…",
    "name": "Brouwerij de Regionaal",
    "description": "Craft-Bier aus eigener Brauerei."
  }
]
```

Regeln:

| Feld          | Pflicht | Bedeutung                                                     |
| ------------- | ------- | ------------------------------------------------------------- |
| `position`    | ja      | `longitude` −180…180, `latitude` −90…90 (Zahlen)              |
| `address`     | ja      | Textzeile                                                     |
| `image`       | ja      | Bild-URL **oder** leerer String                               |
| `name`        | ja      | Textzeile                                                     |
| `description` | ja      | Textzeile                                                     |

`public/data/version.json` steuert die Update-Erkennung:

```json
{ "version": 1, "updatedAt": "2026-02-01T09:00:00.000Z", "count": 28 }
```

Eigene Daten einbringen:

```bash
cp .env.example .env            # nur nötig, wenn die URLs angepasst werden sollen
# eigene data.json + version.json nach public/data/ legen
npm run data:validate           # Schema, Pflichtfelder, Koordinaten, Duplikate, count-Abgleich
```

Die Validierung nutzt **dieselbe** zod-Definition wie die App zur Laufzeit, damit
„lokal gültig" und „in der App gültig" nicht auseinanderlaufen können. Fehlermeldungen
sind auf Deutsch, z. B.:

```
FEHLER: 1 Schema-Verstöße
  (Wurzel): muss eine Liste von Einträgen sein, z. B. [{ "position": …, "name": … }]
```

## Backend-API

Das Backend (`server/index.mjs`) hat **keine Abhängigkeiten** – nur Node-Standardbibliothek.

| Endpunkt          | Zweck                                                          |
| ----------------- | -------------------------------------------------------------- |
| `GET /api/health` | Erreichbarkeitsprobe (bewusst nicht gecacht)                    |
| `GET /api/version.json` | kleine Datei für die Update-Prüfung, `HEAD` unterstützt |
| `GET /api/data.json`    | vollständiger Datensatz, `HEAD` + ETag + `304`            |
| `POST /api/echo`        | Dummy-Endpunkt, prüft die Client-Signatur                 |
| `GET /data/*`           | statische Datendateien (auch im Build enthalten)            |

- **Bedingte Anfragen**: `ETag` (SHA-1 des Inhalts) und `Last-Modified`; passende
  `If-None-Match` / `If-Modified-Since` ergeben `304` ohne Nutzdaten.
- **CORS** ist offen konfiguriert, damit die App auch von einem anderen Host laden kann.
- **`/api/echo`** ist ein bewusst simpler Identitätsnachweis ohne Personenbezug. Der
  Client sendet zusätzlich eine Signatur:

  ```
  sha256("beer-compass:v1|{clientId}|{timestamp}|{nonce}|sha256(body)")
  ```

  dazu die Header `X-Client-Id`, `X-Client-Timestamp`, `X-Client-Nonce`,
  `X-Client-Signature`. Fehlen Header (→ `400`) oder passt die Signatur nicht (→ `401`),
  antwortet der Endpunkt entsprechend. Die Client-ID liegt in IndexedDB (`identity`),
  wird einmalig erzeugt und hat mit der Installation nichts zu tun.

## Offline- und Update-Verhalten

**Was wird wo gespeichert**

| Daten                        | Ort                                    |
| ---------------------------- | -------------------------------------- |
| Hauptdatensatz               | IndexedDB `beer-compass` → `items`, `meta` |
| Einstellungen                 | IndexedDB → `settings`                 |
| Client-ID                     | IndexedDB → `identity`                 |
| App-Shell (HTML, JS, CSS, Icons) | Service Worker → Workbox-Precache |
| `./data/*.json`              | CacheFirst im Service Worker           |
| `./api/*`                    | **NetworkOnly** – niemals zwischenspeichern |

`localStorage` wird bewusst **nicht** verwendet (die App liest dort nichts und schreibt
dort nichts).

**Ablauf**

1. Beim Start wird geprüft, ob Daten vorliegen. Fehlen sie, wird online geladen – ohne
   Rückfrage, denn es gibt nichts zu bestätigen.
2. Online-Status aus `navigator.onLine` **plus** einer echten Fetch-Probe, damit
   „online" nicht nur am WLAN-Symbol hängt.
3. Update-Prüfung per `HEAD` (mit ETag) und über `version.json`. Nur bei echter
   Änderung wird die große Datei geladen.
4. Neuer Datensatz: Standardmäßig erscheint ein Banner mit **Übernehmen / Später**.
   Mit „Automatisch übernehmen" in den Einstellungen passiert das ohne Rückfrage,
   „Automatisch prüfen" startet die Prüfung schon beim Öffnen der App.
5. Die Übernahme ist **eine IndexedDB-Transaktion** auf `items` + `meta`. Schlägt der
   Download oder die Validierung fehl, bleiben die bisherigen Daten unangetastet – die
   App meldet nur, dass die Datei fehlerhaft war.

**App-Update (Service Worker)**

Der neue Worker wird im Hintergrund installiert und wartet auf Bestätigung. Der Banner
„Neue App-Version verfügbar" bietet **Neu laden** (sendet `SKIP_WAITING` und lädt neu)
oder **Später** (bleibt bis zum nächsten Start aktiv). Nie ein ungefragter Reload –
sonst wäre man mitten im Tippen oder auf der falschen Listenposition.

**Caches leeren (Entwicklung)**

```js
// Browser-Konsole
caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
indexedDB.deleteDatabase('beer-compass')
```

## Installation auf Android

Voraussetzung: Die App muss über **HTTPS** ausgeliefert werden (Ausnahme:
`http://localhost` bzw. `http://127.0.0.1`). Ohne HTTPS sind Service Worker,
Installation und GPS in Chrome blockiert. Selbst signierte Zertifikate werden von Chrome
nicht akzeptiert – für Tests also ein echtes Zertifikat (z. B. Let's Encrypt) nutzen.

Danach in Chrome auf dem Android-Gerät:

1. Seite im eigenen Tab öffnen (nicht im Browser-Chrome-Custom-Tab eines anderen Tabs).
2. Menü ⋮ → **Zum Startbildschirm hinzufügen** / *Installieren*.
3. Die App startet danach im Standalone-Modus ohne Browserleiste.

Die Einstellungen in Chrome: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
hilft nur zum schnellen Testen und setzt voraus, dass das Gerät nicht als sicher
markiert wird.

**Offline testen (Android)**

1. App installieren und einmal online laden (bis die Liste gefüllt ist).
2. Flugmodus einschalten.
3. App neu öffnen: Daten, Liste, Kompass und GPS funktionieren weiter, die
   Einstellungen zeigen unter „Verbindung" den Status „Offline".
4. Flugmodus aus, in den Einstellungen **Jetzt nach Updates suchen** – die App meldet
   die neue Version und fragt nach der Übernahme.

## Qualitätssicherung

```bash
npm test              # Lint + Typecheck + Datenvalidierung
npm run build         # Typecheck + Produktionsbuild (inkl. Service Worker)
```

Die Browsertests prüfen die gebaute App real im Headless-Chromium (die
Komponenten-Tests brauchen das Backend aus `npm run preview`):

```bash
npx playwright install chromium     # einmalig
npm run build:only
npm run preview &                   # oder: node server/index.mjs --serve-dist --log
npm run test:e2e                    # Daten, Updates, Offline, PWA
npm run test:ui                     # Kompass, Liste, Auswahlleiste
```

`npm run test:ui` ersetzt die Geolocation deterministisch (feste Position,
fester Lagesensor, verweigerte Berechtigung) – dadurch sind die Aussagen über
Nadelwinkel und Rosen-Rotation reproduzierbar.

Geprüft werden unter anderem: Erststart ohne Rückfrage, IndexedDB als Quelle der
Wahrheit, `localStorage` bleibt leer, virtualisierte Liste, Auswahlleiste,
`geo:`-Intent, verweigerte Berechtigung, GPS-Position in den Einstellungen,
Offline-Neustart inkl. GPS, kein Download im Flugmodus, Update-Ankündigung mit
Bestätigung, atomarer Austausch, Datenverlustschutz bei kaputtem JSON und bei
Schema-Verstößen, Settings-Persistenz über den Neustart, PWA-Kriterien (Manifest,
Precache, Service-Worker-Scope) sowie eine fehlerfreie Browser-Konsole.

Der UI-Test prüft das neue Layout: kein Reiter mehr, Nadel auf dem Zielwinkel,
Rosendrehung gegen die Geräteausrichtung, Ausblenden der Rose ohne Lagesensor,
Auswahl-Banner (großer Name, Entfernung, ohne Richtungsangabe), schwebende
Genauigkeitsplakette, Shrink auf 50 % beim Scrollen – zurück auf 100 % oben bzw.
bei Auswahl und wieder klein beim weitergescrollten –, das Sortier-Dropdown sowie
GPS-Angaben ausschließlich in den Einstellungen und der Zustand ohne Position.

Der Test schreibt seine Testdaten vorübergehend nach `public/data/` und stellt sie
danach wieder her (auch bei Abbruch).

## Projektstruktur

```
├── index.html                  HTML-Gerüst (mit Boot-Splash)
├── vite.config.ts              Vite, Proxy, PWA-Manifest, injectManifest
├── .env.example                Vorlage der Laufzeit-Konfiguration
├── public/
│   ├── data/                   data.json + version.json
│   └── icons/                  192/512, maskable, apple-touch-icon
├── server/index.mjs            abhängigkeitsfreies Backend (API + statische Dateien)
├── scripts/
│   ├── dev.mjs                 startet Backend und Devserver zusammen
│   ├── generate-sample-data.mjs  Beispieldaten
│   ├── generate-icons.mjs      Icons
│   ├── validate-data.mjs       Schema-Prüfung der Datendateien
│   ├── e2e-check.mjs           Browsertest (Daten, Updates, Offline, PWA)
│   └── ui-check.mjs            Browsertest (Kompass, Liste, Einstellungen)
└── src/
    ├── App.vue                 Orchestrierung (Daten, Updates, GPS, Auswahl)
    ├── sw.ts                   Service Worker (Precache, Offline-Fallback)
    ├── components/
    │   ├── BeerCompass.vue     Kompassrose + Bierflaschennadel (SVG)
    │   ├── CompassPanel.vue    Kompass, Auswahl-Banner, Genauigkeit, Start-Hinweis
    │   ├── SelectedBar.vue     feste Leiste mit der aktuellen Auswahl
    │   ├── GeoStatusPanel.vue  GPS-Status, Koordinaten, Genauigkeit
    │   └── …                   Header, ItemList, Detail-/Settings-Sheet …
    ├── services/               data-store, update-service, geo-service, sw-registration …
    ├── db/                     IndexedDB-Schema und Repository
    ├── workers/parse.worker.ts JSON parsen + validieren (zod)
    ├── schemas/dataset.ts      gemeinsames Datenschema
    ├── i18n/de.ts              deutsche Texte
    └── styles/                 Design-Tokens, Dark/Light
```

## Konfiguration

Alle URLs kommen aus `VITE_*`-Variablen und sind beim **Bau** ausgewertet –
`.env.example` als Vorlage kopieren:

| Variable             | Bedeutung                                    |
| -------------------- | -------------------------------------------- |
| `VITE_API_BASE`      | Basis der API, z. B. `/api` oder `https://…` |
| `VITE_VERSION_URL`   | kleine Datei für die Update-Prüfung          |
| `VITE_DATA_URL`      | vollständiger Datensatz                      |
| `VITE_ECHO_URL`      | Echo-Endpunkt, leer = deaktiviert            |

Ohne `.env` läuft die App als rein statische Variante gegen `public/data` – das ist
bewusst so gebaut und getestet.

## Deployment

- Statische Ausgabe: `dist/` (inklusive Service Worker, Manifest, Icons und
  Beispieldaten). Any Static Host genügt.
- Für das Backend zusätzlich `server/index.mjs` starten und `/api` darauf routen.
- Für Android-Installation zwingend **HTTPS** und korrekt ausgelieferter
  `Content-Type` für `.webmanifest`.
- Cache-Header: für `sw.js` **kein** langlebiges Caching (`updateViaCache: 'none'` ist
  gesetzt), für `/api/*` keine Caches.

## Datenschutz

- Keine Konten, kein Tracking, keine Analytics, keine externen Requests – auch nicht
  für Schriftarten oder Karten.
- Es wird nur angefragt, was zum Betrieb nötig ist: Datendatei, Version, Erreichbarkeit
  und (nur wenn aktiviert) der Echo-Endpunkt.
- Die Client-ID ist eine zufällige Zeichenkette im lokalen Speicher und enthält keine
  Personenbezüge. Sie verschwindet beim Löschen der App-Daten bzw. beim Löschen der
  IndexedDB-Datenbank.
- GPS-Daten verlassen das Gerät nicht. Die App stellt nur einen `geo:`-Link für die
  Karten-App des Systems bereit – erst deren Öffnen wird etwas übertragen.
- Der Echo-Endpunkt protokolliert nur, **dass** ein Client die Signaturprüfung
  bestanden hat.

## Lizenz

Noch nicht festgelegt – vor einer Veröffentlichung ergänzen.