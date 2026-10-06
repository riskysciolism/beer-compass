#!/usr/bin/env node
/**
 * Functional test of the built app in headless Chromium.
 *
 * What is checked:
 * - First start, data loading, IndexedDB as the source of truth
 * - Single screen UI: list, selection badge with details + navigation, detail sheet, geo: intent
 * - GPS: denied permission and valid position (now inside the settings)
 * - Offline operation including GPS still works
 * - Update detection, confirmation, atomic replacement
 * - Broken JSON and schema violations: old data is preserved
 *   - PWA-Kriterien (Manifest, Precache, Service-Worker-Scope)
 *
 * The compass rendering itself is checked by scripts/ui-check.mjs.
 *
 * Usage:
 *   npm run build:only
 *   node server/index.mjs --serve-dist --port 8787 --log &
 *   node scripts/e2e-check.mjs
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_FILE = resolve(ROOT, 'public/data/data.json')
const VERSION_FILE = resolve(ROOT, 'public/data/version.json')
const BASE = process.env.BC_BASE ?? 'http://localhost:8787'

const originalData = readFileSync(DATA_FILE, 'utf8')
const originalVersion = readFileSync(VERSION_FILE, 'utf8')

const results = []
function check(name, ok, info = '') {
  results.push({ name, ok })
  process.stdout.write(`${ok ? '  PASS' : '  FAIL'}  ${name}${info ? ` – ${info}` : ''}\n`)
}

/** Replaces the data file of the backend (simulates a new data release). */
function writeData(raw, version = 2) {
  writeFileSync(DATA_FILE, raw)
  let count = 0
  try {
    count = JSON.parse(raw).length
  } catch {
    count = 0 // kaputtes JSON ist hier beabsichtigt
  }
  writeFileSync(
    VERSION_FILE,
    `${JSON.stringify({ version, updatedAt: '2026-02-01T09:00:00.000Z', count }, null, 2)}\n`,
  )
}

function restoreData() {
  writeFileSync(DATA_FILE, originalData)
  writeFileSync(VERSION_FILE, originalVersion)
}

/** Signed echo request - verifies the contract of the dummy endpoint. */
async function signedEcho(payload) {
  const clientId = 'bc-testclient0001'
  const timestamp = Date.now()
  const nonce = '0123456789abcdef'
  const body = JSON.stringify(payload)
  const hash = (input) => createHash('sha256').update(input).digest('hex')
  const signature = hash(`beer-compass:v1|${clientId}|${timestamp}|${nonce}|${hash(body)}`)
  const response = await fetch(`${BASE}/api/echo`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-client-id': clientId,
      'x-client-timestamp': String(timestamp),
      'x-client-nonce': nonce,
      'x-client-signature': signature,
    },
    body,
  })
  return { status: response.status, json: await response.json() }
}

process.on('exit', () => restoreData())
process.on('SIGINT', () => {
  restoreData()
  process.exit(130)
})

const browser = await chromium.launch()

/* ====================================================== 1. First start + data == */

process.stdout.write('\n1) Erststart: Daten werden geladen und in IndexedDB gespeichert\n')
const context = await browser.newContext({ baseURL: BASE, locale: 'de-DE' })
const page = await context.newPage()
const consoleErrors = []
page.on('pageerror', (error) => consoleErrors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.topbar__title', { timeout: 20000 })
check('App-Shell gerendert', (await page.textContent('.topbar__title')) === 'Beer Compass')

// Wait until the data state is really loaded (first download + parse in the worker)
await page.waitForFunction(
  () =>
    Number((document.querySelector('.list__count')?.textContent ?? '').match(/\d+/)?.[0] ?? 0) >
      0 && document.querySelectorAll('.entry').length > 0,
  undefined,
  { timeout: 25000 },
)

const dbState = await page.evaluate(async () => {
  const db = await new Promise((resolve_) => {
    const request = indexedDB.open('beer-compass')
    request.onsuccess = () => resolve_(request.result)
  })
  const readAll = (store) =>
    new Promise((resolve_) => {
      const tx = db.transaction(store).objectStore(store).getAll()
      tx.onsuccess = () => resolve_(tx.result)
    })
  return {
    items: (await readAll('items')).length,
    meta: (await readAll('meta'))[0] ?? null,
    settings: await readAll('settings'),
    stores: [...db.objectStoreNames],
  }
})
check('IndexedDB enthält die Hauptdaten', dbState.items > 0, `${dbState.items} Einträge`)
check(
  'Metadaten: Version, ETag, Zeitstempel',
  Boolean(dbState.meta?.etag) && dbState.meta?.version >= 1 && dbState.meta?.fetchedAt > 0,
  `v${dbState.meta?.version}, etag=${String(dbState.meta?.etag).slice(0, 14)}…`,
)
check('Einstellungen aus IndexedDB lesbar', dbState.settings.length <= 1)
check('localStorage bleibt ungenutzt', (await page.evaluate(() => localStorage.length)) === 0)
const listCountText = ((await page.textContent('.list__count')) ?? '').toLowerCase()
check(
  'Erststart ohne Rückfrage geladen',
  listCountText.includes('einträge'),
  listCountText.replace(/\s+/g, ' ').trim(),
)
check(
  'Kein Update-Hinweis beim Erststart',
  (await page.locator('.banner:has-text("Neue Daten verfügbar")').count()) === 0,
)

/* ================================================================ 2. List === */

process.stdout.write('\n2) Liste, virtualisierte Zeilen, Badge, Detail-Sheet\n')
await page.waitForSelector('.entry', { timeout: 10000 })
const rendered = await page.locator('.entry').count()
check('Einträge werden angezeigt', rendered > 0, `${rendered} gerendert`)
check('Virtualisierung', rendered < dbState.items, `${rendered} von ${dbState.items} im DOM`)
check('Zähler zeigt Gesamtzahl', /\d+/.test((await page.textContent('.list__count')) ?? ''))

// A tap only selects, the details come via the badge below the compass.
await page.locator('.entry').first().click()
await page.waitForSelector('.compass-panel__banner', { timeout: 5000 })
check('Badge erscheint', (await page.locator('.compass-panel__banner').count()) === 1)
check(
  'Badge nennt den Eintrag',
  ((await page.textContent('.compass-panel__banner-name')) ?? '').trim().length > 0,
)
await page.click('.compass-panel__banner-details')
await page.waitForSelector('.sheet__name', { timeout: 5000 })
check('Detail-Sheet öffnet', Boolean(await page.textContent('.sheet__name')))
const mapHref = await page.getAttribute('.sheet__actions a', 'href')
check('geo:-Intent für die Karten-App', (mapHref ?? '').startsWith('geo:'), mapHref ?? '')
await page.click('.sheet__close')

/* ============================================== 3. GPS: no permission === */

process.stdout.write('\n3) GPS: verweigerte Berechtigung\n')
await page.click('.topbar__settings')
await page.waitForSelector('.geo-panel', { timeout: 10000 })
await page.click('.geo-panel button:has-text("Standort starten")')
await page.waitForFunction(
  () => /verweigert/i.test(document.querySelector('.geo-panel__status-text')?.textContent ?? ''),
  undefined,
  { timeout: 15000 },
)
const geoError = (await page.textContent('.geo-panel__status-text')) ?? ''
check(
  'Verständliche Meldung statt Absturz',
  /berechtigung wurde verweigert/i.test(geoError),
  geoError.replace(/\s+/g, ' ').trim().slice(0, 70),
)

/* ======================================== 4. GPS: position + offline mode */

process.stdout.write('\n4) GPS mit erteilter Berechtigung\n')
const context2 = await browser.newContext({
  baseURL: BASE,
  locale: 'de-DE',
  geolocation: { latitude: 52.2011, longitude: 4.8796, accuracy: 12 },
  permissions: ['geolocation'],
})
const page2 = await context2.newPage()
// Fixed position instead of Playwright geolocation: watchPosition does not
// reliably return a fix immediately, which made the test hang sporadically.
await page2.addInitScript(`
  const fix = { coords: { latitude: 52.2011, longitude: 4.8796, accuracy: 12,
    altitude: 2, altitudeAccuracy: 5, heading: null, speed: 1.2 }, timestamp: Date.now() }
  navigator.geolocation.watchPosition = (success) => { success(fix); return 1 }
  navigator.geolocation.getCurrentPosition = (success) => success(fix)
  navigator.geolocation.clearWatch = () => {}
`)
page2.on('pageerror', (error) => consoleErrors.push(String(error)))
await page2.goto(BASE, { waitUntil: 'domcontentloaded' })
await page2.waitForSelector('.entry', { timeout: 20000 })
await page2.click('.topbar__settings')
await page2.waitForSelector('.geo-panel', { timeout: 10000 })
await page2.waitForSelector('.geo-panel__coords', { timeout: 20000 })
const latitude = (await page2.textContent('.geo-panel__coords div:nth-child(1) dd')) ?? ''
const accuracy = (await page2.textContent('.geo-panel__accuracy')) ?? ''
check('Koordinaten werden angezeigt', latitude.includes('52'), latitude.trim())
check('Genauigkeit wird angezeigt', /\d/.test(accuracy), accuracy.replace(/\s+/g, ' ').trim())
await page2.click('.sheet__close')

// Name, distance and bearing now live in the compass line.
await page2.locator('.entry').first().click()
await page2.waitForSelector('.compass-panel__banner', { timeout: 5000 })
await page2.waitForTimeout(400)
const targetBanner = ((await page2.textContent('.compass-panel__banner')) ?? '')
  .replace(/\s+/g, ' ')
  .trim()
check('Banner mit Name und Distanz', /km/.test(targetBanner), targetBanner.slice(0, 60))
check('Nadel zeigt zum Ziel', (await page2.locator('.compass__needle').count()) === 1)

process.stdout.write('\n5) Offline-Betrieb (Flugmodus-Simulation)\n')
await page2.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
  timeout: 25000,
})
check('Service Worker hat die Seite übernommen', true)

await context2.setOffline(true)
await page2.reload({ waitUntil: 'domcontentloaded' })
await page2.waitForSelector('.topbar__title', { timeout: 20000 })
check(
  'App startet ohne Internetverbindung',
  (await page.textContent('.topbar__title')) === 'Beer Compass',
)

await page2.click('.topbar__settings')
await page2.waitForSelector('.kv', { timeout: 10000 })
await page2.waitForFunction(
  () => /offline/i.test(document.querySelector('.kv')?.textContent ?? ''),
  undefined,
  { timeout: 15000 },
)
const badge = (await page2.textContent('.kv')) ?? ''
check(
  'Offline-Status wird angezeigt',
  badge.toLowerCase().includes('offline'),
  badge.replace(/\s+/g, ' ').trim(),
)

await page2.click('.sheet__close')
await page2.waitForSelector('.entry', { timeout: 10000 })
const offlineEntries = await page2.locator('.entry').count()
check(
  'Lokale Daten sind offline verfügbar',
  offlineEntries > 0,
  `${offlineEntries} Einträge sichtbar`,
)

await page2.click('.topbar__settings')
await page2.waitForSelector('.geo-panel__coords', { timeout: 20000 })
check(
  'GPS funktioniert offline weiter',
  ((await page2.textContent('.geo-panel__coords div:nth-child(1) dd')) ?? '').includes('52'),
)

process.stdout.write('\n6) Offline: Update-Prüfung startet keinen Download\n')
await page2.click('button:has-text("Jetzt nach Updates suchen")')
await page2.waitForTimeout(1500)
const updateNote = (await page2.textContent('.group__note')) ?? ''
check('Status "offline" statt Netzversuch', updateNote.includes('offline'), updateNote.trim())
await context2.setOffline(false)

/* ============================================== 7. Update: detect + ask */
process.stdout.write('\n7) Neue Daten: erkennen, nachfragen, atomar übernehmen\n')
const updated = JSON.parse(originalData)
updated[0].name = 'Aktualisierte Brauerei GmbH'
writeData(JSON.stringify(updated, null, 2), 2)

await page2.click('.sheet__panel button:has-text("Jetzt nach Updates suchen")')
await page2.waitForSelector('.banner', { timeout: 20000 })
await page2.click('.sheet__close')
const banner = ((await page2.textContent('.banner')) ?? '').replace(/\s+/g, ' ').trim()
check('Update wird angekündigt', banner.includes('Neue Daten verfügbar'), banner.slice(0, 80))

await page2.waitForSelector('.entry')
// The state in memory stays untouched until the user confirms.
const beforeConfirm = await page2.evaluate(async () => {
  const db = await new Promise((resolve_) => {
    const request = indexedDB.open('beer-compass')
    request.onsuccess = () => resolve_(request.result)
  })
  return new Promise((resolve_) => {
    const tx = db.transaction('items').objectStore('items').count()
    tx.onsuccess = () => resolve_(tx.result)
  })
})
check(
  'Alte Daten bis zur Bestätigung aktiv',
  beforeConfirm === dbState.items,
  `${beforeConfirm} Einträge`,
)

await page2.click('.banner button:has-text("Übernehmen")')
await page2.waitForTimeout(3000)
const itemCountAfter = await page2.evaluate(async () => {
  const db = await new Promise((r) => {
    const request = indexedDB.open('beer-compass')
    request.onsuccess = () => r(request.result)
  })
  const tx = db.transaction('items').objectStore('items').getAll()
  return new Promise((r) => {
    tx.onsuccess = () => r(tx.result.length)
  })
})
check('Datenbestand übernommen', itemCountAfter === dbState.items, `${itemCountAfter} Einträge`)

// Check via search on purpose - the list is virtualized and sorted,
// so the changed entry does not necessarily have to be in the visible area.
await page2.fill('.list__search input', 'Aktualisierte')
await page2.waitForTimeout(300)
const newName = await page2.evaluate(() =>
  document.body.innerText.toLowerCase().includes('aktualisierte brauerei gmbh'),
)
check('Neuer Eintrag in der Liste sichtbar', newName)
const storedName = await page2.evaluate(async () => {
  const db = await new Promise((resolve_) => {
    const request = indexedDB.open('beer-compass')
    request.onsuccess = () => resolve_(request.result)
  })
  return new Promise((resolve_) => {
    const tx = db.transaction('items').objectStore('items').getAll()
    tx.onsuccess = () =>
      resolve_(tx.result.some((item) => item.name === 'Aktualisierte Brauerei GmbH'))
  })
})
check('Neuer Eintrag auch in IndexedDB übernommen', storedName)
await page2.fill('.list__search input', '')

const metaAfter = await page2.evaluate(async () => {
  const db = await new Promise((r) => {
    const request = indexedDB.open('beer-compass')
    request.onsuccess = () => r(request.result)
  })
  return new Promise((r) => {
    const tx = db.transaction('meta').objectStore('meta').getAll()
    tx.onsuccess = () => r(tx.result[0])
  })
})
check(
  'Metadaten auf Version 2 aktualisiert',
  metaAfter?.version === 2,
  `version=${metaAfter?.version}`,
)

const echo = await signedEcho({ event: 'e2e', ok: true })
check(
  'Echo-Endpunkt akzeptiert signierte Anfragen',
  echo.status === 200 && echo.json.signatureVerified === true,
  `HTTP ${echo.status}, verified=${echo.json.signatureVerified}`,
)

/* ========================================== 8. Invalid data is discarded */

process.stdout.write('\n8) Kaputtes JSON: alte Daten bleiben erhalten\n')
writeData('{ kaputt: json, kein gültiges Dokument', 3)
await page2.evaluate(() => {
  document.querySelector('.topbar__settings')?.click()
})
await page2.waitForSelector('.sheet__title')
await page2.click('.sheet__panel button:has-text("Jetzt nach Updates suchen")')
await page2.waitForSelector('.banner', { timeout: 20000 })
await page2.click('.sheet__close')
await page2.click('.banner button:has-text("Übernehmen")')
await page2.waitForTimeout(3000)

const afterBroken = await page2.evaluate(async () => {
  const db = await new Promise((r) => {
    const request = indexedDB.open('beer-compass')
    request.onsuccess = () => r(request.result)
  })
  const meta = await new Promise((r) => {
    const tx = db.transaction('meta').objectStore('meta').getAll()
    tx.onsuccess = () => r(tx.result[0])
  })
  const count = await new Promise((r) => {
    const tx = db.transaction('items').objectStore('items').count()
    tx.onsuccess = () => r(tx.result)
  })
  return { count, version: meta?.version }
})
check(
  'Anzahl der Einträge unverändert',
  afterBroken.count === dbState.items,
  `${afterBroken.count} Einträge`,
)
check('Version unverändert', afterBroken.version === 2, `version=${afterBroken.version}`)
const dangerBanner = ((await page2.textContent('.banner--danger')) ?? '')
  .replace(/\s+/g, ' ')
  .trim()
check(
  'Fehlermeldung nennt die Ursache',
  /fehlerhaft|gültiges JSON/i.test(dangerBanner),
  dangerBanner.slice(0, 90),
)

process.stdout.write('\n9) Schema-Verstoß: unvollständige Einträge\n')
await page2.evaluate(() => {
  document.querySelector('.topbar__settings')?.click()
})
await page2.waitForSelector('.sheet__title')
writeData(JSON.stringify([{ position: { longitude: 400, latitude: 'keine Zahl' } }]), 4)
await page2.click('.sheet__panel button:has-text("Jetzt nach Updates suchen")')
await page2.waitForSelector('.banner', { timeout: 20000 })
await page2.click('.sheet__close')
if ((await page2.locator('.banner button:has-text("Übernehmen")').count()) > 0) {
  await page2.click('.banner button:has-text("Übernehmen")')
  await page2.waitForTimeout(2500)
}
const afterSchema = await page2.evaluate(async () => {
  const db = await new Promise((r) => {
    const request = indexedDB.open('beer-compass')
    request.onsuccess = () => r(request.result)
  })
  const count = await new Promise((r) => {
    const tx = db.transaction('items').objectStore('items').count()
    tx.onsuccess = () => r(tx.result)
  })
  return count
})
check(
  'Keine Datenänderung bei Schema-Fehler',
  afterSchema === dbState.items,
  `${afterSchema} Einträge`,
)

/* ============================================ 10. Automatic update notice */

process.stdout.write('\n10) Update-Hinweis erscheint beim Start von selbst\n')

// Regression test: if the automatic check were off, an app with an older
// dataset in IndexedDB would never learn about a new release - the old data
// (without features, for example) would stay forever.
const nextRelease = JSON.parse(originalData)
nextRelease[0].name = 'Automatisch erkannte Brauerei GmbH'
writeData(JSON.stringify(nextRelease, null, 2), 5)

const page3 = await context2.newPage()
await page3.goto(BASE, { waitUntil: 'domcontentloaded' })
await page3.waitForSelector('.entry', { timeout: 20000 })
const autoNotice = await page3
  .waitForSelector('.banner:has-text("Neue Daten verfügbar")', { timeout: 20000 })
  .then(
    () => true,
    () => false,
  )
check(
  'Neue Daten werden beim Start angekündigt',
  autoNotice,
  autoNotice ? '' : 'kein Hinweis ohne Klick',
)
let autoVersion = null
if (autoNotice) {
  await page3.click('.banner button:has-text("Übernehmen")')
  await page3.waitForTimeout(3000)
  autoVersion = await page3.evaluate(async () => {
    const db = await new Promise((r) => {
      const request = indexedDB.open('beer-compass')
      request.onsuccess = () => r(request.result)
    })
    return new Promise((r) => {
      const tx = db.transaction('meta').objectStore('meta').getAll()
      tx.onsuccess = () => r(tx.result[0]?.version ?? null)
    })
  })
}
check('Start-Update lässt sich übernehmen', autoVersion === 5, `version=${autoVersion}`)
await page3.close()

/* ===================================================== 9b. Settings-Persistenz */

process.stdout.write('\n11) Einstellungen werden in IndexedDB gespeichert\n')
await page2.evaluate(() => {
  document.querySelector('.topbar__settings')?.click()
})
await page2.waitForSelector('.sheet__title')
await page2.click('.segmented button:has-text("Dunkel")')
await page2.waitForTimeout(800)
const themeApplied = await page2.evaluate(() => document.documentElement.dataset.theme)
check('Dark-Theme wird angewendet', themeApplied === 'dark', `data-theme=${themeApplied}`)
const persistedSettings = await page2.evaluate(async () => {
  const db = await new Promise((r) => {
    const request = indexedDB.open('beer-compass')
    request.onsuccess = () => r(request.result)
  })
  return new Promise((r) => {
    const tx = db.transaction('settings').objectStore('settings').getAll()
    tx.onsuccess = () => r(tx.result)
  })
})
check(
  'Einstellung dauerhaft gespeichert',
  persistedSettings.length === 1 && persistedSettings[0].theme === 'dark',
  JSON.stringify(persistedSettings[0]?.theme ?? null),
)

await page2.reload({ waitUntil: 'domcontentloaded' })
await page2.waitForSelector('.topbar__title', { timeout: 20000 })
await page2
  .waitForFunction(() => document.documentElement.dataset.theme === 'dark', undefined, {
    timeout: 10000,
  })
  .catch(() => undefined)
check(
  'Einstellung überlebt den Neustart',
  (await page2.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
  `data-theme=${await page2.evaluate(() => document.documentElement.dataset.theme)}`,
)
/* ==================================================== 12. PWA ==== */

process.stdout.write('\n12) PWA-Kriterien\n')
const manifest = await page2.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]')
  return link ? await (await fetch(link.getAttribute('href') ?? '')).json() : null
})
check('Manifest vorhanden', manifest !== null)
check('display: standalone', manifest?.display === 'standalone')
check(
  'Icons 192 und 512',
  manifest?.icons?.some((i) => i.sizes === '192x192') &&
    manifest?.icons?.some((i) => i.sizes === '512x512'),
)
check(
  'maskable Icon vorhanden',
  manifest?.icons?.some((i) => i.purpose === 'maskable'),
)
check('theme_color gesetzt', typeof manifest?.theme_color === 'string')
check('start_url und scope gesetzt', manifest?.start_url === '/' && manifest?.scope === '/')
check('name und short_name gesetzt', Boolean(manifest?.name && manifest?.short_name))

const swInfo = await page2.evaluate(async () => {
  const registration = await navigator.serviceWorker.getRegistration()
  const names = await caches.keys()
  let cached = 0
  for (const name of names) {
    const cache = await caches.open(name)
    cached += (await cache.keys()).length
  }
  return { scope: registration?.scope ?? null, names, cached }
})
check('Service Worker registriert', swInfo.scope !== null, swInfo.scope ?? '')
check(
  'App-Shell precached',
  swInfo.cached >= 8,
  `${swInfo.cached} Einträge (${swInfo.names.join(', ')})`,
)

/* ================================================ 13. Konsole ==== */

process.stdout.write('\n13) Konsole\n')
const unexpected = consoleErrors.filter(
  (entry) =>
    !entry.includes('ERR_INTERNET_DISCONNECTED') &&
    !entry.includes('Failed to fetch') &&
    !entry.includes('Fetch API cannot load'),
)
check(
  'Keine unerwarteten Konsolenfehler',
  unexpected.length === 0,
  unexpected.slice(0, 2).join(' | '),
)

await browser.close()
restoreData()

const failed = results.filter((entry) => !entry.ok)
process.stdout.write(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden\n`)
if (failed.length > 0)
  process.stdout.write(`Fehlgeschlagen: ${failed.map((f) => f.name).join('; ')}\n`)
process.exit(failed.length === 0 ? 0 : 1)
