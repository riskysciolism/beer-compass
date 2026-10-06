/**
 * German texts. The structure is flat and typed, so that missing or
 * misspelled keys surface immediately as TypeScript errors.
 * More languages: create an object with the same structure and add it to LANGUAGES.
 */
export const de = {
  app: {
    name: 'Beer Compass',
    tagline: 'Brauereien und Ausschänke in der Nähe',
  },

  header: {
    openSettings: 'Einstellungen öffnen',
    connection: 'Verbindung',
  },

  compass: {
    title: 'Kompass',
    /** aria label of the needle */
    needleTo: 'Flaschennadel zeigt auf {name}',
    noTarget: 'Kein Ziel gewählt – unten einen Eintrag antippen.',
    waitingForFix: 'Warte auf deine Position …',
    noFix: 'Deine Position ist unbekannt – Standort in den Einstellungen starten.',
    noFixDenied: 'Standort nicht freigegeben – in den Einstellungen erlauben.',
    /** heading of the selection banner below the compass */
    selectedLabel: 'Gewählter Eintrag',
    /** aria label of the accuracy display */
    accuracyLabel: 'GPS-Genauigkeit: {meters} Meter',
  },

  selection: {
    title: 'Auswahl',
    details: 'Details',
    clear: 'Auswahl aufheben',
  },

  status: {
    online: 'Online',
    offline: 'Offline',
    checking: 'Prüfe …',
    unknown: 'Status unbekannt',
    dataVersion: 'Datenstand',
    dataCount: 'Einträge',
    lastFetched: 'Zuletzt geladen',
    noData: 'Keine Daten',
    serviceWorker: 'Offline-Modus',
    serviceWorkerReady: 'bereit',
    serviceWorkerOff: 'nicht aktiv',
  },

  geo: {
    title: 'GPS-Position',
    start: 'Standort starten',
    stop: 'Standort beenden',
    restart: 'Neu messen',
    waiting: 'Warte auf GPS-Signal …',
    active: 'Position aktiv',
    accuracy: 'Genauigkeit',
    accuracyGood: 'gut',
    accuracyFair: 'mittel',
    accuracyPoor: 'grob',
    heading: 'Richtung',
    speed: 'Geschwindigkeit',
    altitude: 'Höhe',
    latitude: 'Breite',
    longitude: 'Länge',
    timestamp: 'Gemessen',
    age: 'Alter der Messung',
    copyCoordinates: 'Koordinaten kopieren',
    copied: 'Koordinaten kopiert',
    startDistance: 'Nächster Eintrag',
    noPositionForDistance: 'Position erforderlich',
    permission: 'Standortberechtigung',
    highAccuracyOn: 'Hoch',
    highAccuracyOff: 'Standard',

    error: {
      title: 'Standort nicht verfügbar',
      unsupported: 'Dieser Browser unterstützt keine Standortbestimmung.',
      denied: 'Die Standortberechtigung wurde verweigert.',
      deniedHint: 'In den Browser-Einstellungen (oder unter Systemeinstellungen) erlauben.',
      unavailable: 'Das GPS-Signal ist momentan nicht verfügbar. Bitte nach draußen gehen.',
      timeout: 'Zeitüberschreitung bei der Standortbestimmung.',
      generic: 'Die Standortbestimmung ist fehlgeschlagen.',
      retry: 'Erneut versuchen',
      openSettings: 'Browser-Einstellungen öffnen',
    },
  },

  list: {
    title: 'Einträge',
    search: 'Suchen',
    searchPlaceholder: 'Name oder Adresse …',
    sortBy: 'Sortierung',
    sortDistance: 'Nach Entfernung',
    sortName: 'Nach Name',
    /** heading of the sort dropdown */
    sortMenu: 'Sortierung wählen',
    sortChange: 'Sortierung: {sort}',
    empty: 'Keine Einträge vorhanden.',
    emptySearch: 'Kein Treffer für diese Suche.',
    detail: 'Details',
    close: 'Schließen',
    address: 'Adresse',
    /** heading of the feature grid */
    features: 'Merkmale',
    openInMaps: 'In Karten-App öffnen',
    /** aria label of the navigation button */
    navigate: 'Navigation starten',
    distance: 'Entfernung',
    direction: 'Richtung',
    unknownDistance: '–',
    resultsCount: '{count} Einträge',
  },

  data: {
    title: 'Daten',
    loadLocal: 'Lokale Daten laden',
    loadRemote: 'Aus dem Netz laden',
    reload: 'Neu laden',
    deleteLocal: 'Lokale Daten löschen',
    deleteConfirm: 'Alle lokal gespeicherten Einträge wirklich löschen?',
    source: 'Quelle',
    storage: 'Speicherplatz',
    noLocalData: 'Noch keine Daten auf diesem Gerät gespeichert.',
    offlineFirstLoad:
      'Keine Verbindung und noch keine lokalen Daten. Beim ersten Start wird eine Internetverbindung benötigt.',
    offlineNoUpdate:
      'Offline – es kann nach neuen Daten gesucht werden, sobald du wieder online bist.',
    parseError: 'Die empfangenen Daten sind fehlerhaft. Die bisherigen Daten bleiben erhalten.',
    parseErrorJson: 'Die Datei ist kein gültiges JSON.',
    parseErrorSchema: 'Die Datei entspricht nicht dem erwarteten Datenmodell.',
    parseErrorDetail: 'Erste Fundstellen:',
    emptyDataset: 'Die Datendatei enthält keine Einträge.',
  },

  update: {
    title: 'Aktualisierungen',
    checkNow: 'Jetzt nach Updates suchen',
    checking: 'Suche nach Updates …',
    upToDate: 'Daten sind aktuell.',
    available: 'Neue Daten verfügbar',
    availableDetail: 'Version {version} mit {count} Einträgen ist verfügbar.',
    apply: 'Übernehmen',
    discard: 'Später',
    applied: 'Daten wurden aktualisiert.',
    failed: 'Die Prüfung ist fehlgeschlagen.',
    autoCheck: 'Automatisch prüfen',
    autoCheckHint: 'Beim Öffnen der App nach neuen Daten suchen.',
    autoApply: 'Automatisch übernehmen',
    autoApplyHint: 'Neue Daten ohne Rückfrage übernehmen.',
    appUpdateAvailable: 'Neue App-Version verfügbar',
    appUpdateDetail: 'Die App selbst wurde aktualisiert – bitte neu laden.',
    appUpdateReload: 'Neu laden',
    appUpdateLater: 'Später',
  },

  install: {
    banner: 'Beer Compass installieren',
    bannerDetail: 'Offline verfügbar, direkt vom Homescreen starten.',
    action: 'Installieren',
    later: 'Später',
    manualTitle: 'Manuell installieren',
    manualAndroid:
      'In Chrome: Menü (⋮) → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.',
    manualIos: 'In Safari: Teilen → „Zum Home-Bildschirm“.',
    installed: 'App ist installiert.',
  },

  settings: {
    title: 'Einstellungen',
    appearance: 'Darstellung',
    theme: 'Erscheinungsbild',
    themeSystem: 'System',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    location: 'Standort (GPS)',
    sortByName: 'Liste alphabetisch sortieren',
    sortByNameHint: 'Aus: nach Entfernung zur aktuellen GPS-Position.',
    highAccuracy: 'Hohe Genauigkeit',
    highAccuracyHint: 'Genauer, aber deutlich höherer Akkuverbrauch.',
    autoStart: 'Beim Öffnen messen',
    autoStartHint: 'Standort automatisch starten, sobald die App geöffnet wird.',
    updates: 'Datenupdates',
    privacy: 'Übertragung',
    echoEnabled: 'Kontakt zum Server',
    echoHint: 'Nach einem Datenabgleich wird eine anonymisierte, signierte Statusmeldung gesendet.',
    buildInfo: 'Build',
    storageUsed: 'Belegt',
  },

  units: {
    meters: 'm',
    kmPerHour: 'km/h',
    metersPerSecond: 'm/s',
  },

  common: {
    close: 'Schließen',
    cancel: 'Abbrechen',
    confirm: 'Bestätigen',
    back: 'Zurück',
    retry: 'Erneut versuchen',
    yes: 'Ja',
    no: 'Nein',
    seconds: 's',
    minutes: 'Min',
  },
} as const

export type Messages = typeof de
export type MessageKey = FlattenKeys<Messages>

type FlattenKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${FlattenKeys<T[K]>}`
}[keyof T & string]

export const LOCALE = 'de-DE'
