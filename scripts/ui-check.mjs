#!/usr/bin/env node
/**
 * Checks the new UI: compass with beer bottle needle, ring only with
 * orientation sensor, shrink behavior on scroll, selection bar, cog in the header.
 *
 * Usage:
 *   npm run build:only
 *   node server/index.mjs --serve-dist --port 8787 &
 *   node scripts/ui-check.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BC_BASE ?? 'http://localhost:8787'
const results = []

function check(name, ok, info = '') {
  results.push({ name, ok })
  process.stdout.write(`${ok ? '  PASS' : '  FAIL'}  ${name}${info ? ` – ${info}` : ''}\n`)
}

/** Geolocation with orientation sensor (heading) - Playwright cannot set heading. */
function stubGeolocation({ heading = null } = {}) {
  return `
    navigator.geolocation.watchPosition = (success) => {
      const position = {
        coords: {
          latitude: 52.2011,
          longitude: 4.8796,
          accuracy: 9,
          altitude: 2,
          altitudeAccuracy: 5,
          heading: ${heading === null ? 'null' : heading},
          speed: 1.2,
        },
        timestamp: Date.now(),
      }
      success(position)
      return 1
    }
    navigator.geolocation.getCurrentPosition = (success) => success({
      coords: {
        latitude: 52.2011, longitude: 4.8796, accuracy: 9, altitude: 2,
        altitudeAccuracy: 5, heading: ${heading === null ? 'null' : heading}, speed: 1.2,
      },
      timestamp: Date.now(),
    })
    navigator.geolocation.clearWatch = () => {}
  `
}

const browser = await chromium.launch()

/* ---------------------------------- A: without orientation sensor (no ring) -- */

process.stdout.write('\n1) Ohne Lagesensor: kein Ring, Nadel zeigt aufs Ziel\n')
const ctxA = await browser.newContext({
  baseURL: BASE,
  viewport: { width: 412, height: 900 },
})
await ctxA.addInitScript(stubGeolocation())
const pageA = await ctxA.newPage()
await pageA.goto(BASE, { waitUntil: 'domcontentloaded' })
await pageA.waitForSelector('.entry', { timeout: 25000 })
await pageA.waitForFunction(
  () => document.querySelector('.compass-panel__caption')?.textContent?.includes('Kein Ziel'),
  undefined,
  { timeout: 15000 },
)

check('Keine Reiterleiste mehr', (await pageA.locator('.tabbar').count()) === 0)
check('Kompass sichtbar', (await pageA.locator('.compass__svg').count()) === 1)
check(
  'Ring mit N/O/S/W ausgeblendet (kein heading)',
  (await pageA.locator('.compass__cardinal').count()) === 0,
)
check('Nadel vorhanden (Bierflasche)', (await pageA.locator('.compass__bottle').count()) === 0)
check(
  'Hinweis "kein Ziel"',
  (await pageA.textContent('.compass-panel__caption'))?.includes('Kein Ziel'),
)

// Selection via the list
const firstName = await pageA.locator('.entry__name').first().textContent()
await pageA.locator('.entry').first().click()
await pageA.waitForSelector('.selection-bar', { timeout: 5000 })
check(
  'Auswahlleiste erscheint',
  (await pageA.textContent('.selection-bar__text strong')) === firstName,
)
check('Flaschennadel erscheint', (await pageA.locator('.compass__bottle').count()) === 1)

// Banner: large name + distance, no direction.
await pageA.waitForSelector('.compass-panel__banner', { timeout: 5000 })
check(
  'Banner trägt die Überschrift "Gewählter Eintrag"',
  (await pageA.textContent('.compass-panel__banner-label'))?.trim() === 'Gewählter Eintrag',
)
check(
  'Banner zeigt den Namen groß',
  (await pageA.textContent('.compass-panel__banner-name'))?.trim() === firstName,
)
const bannerDistance = ((await pageA.textContent('.compass-panel__banner-distance')) ?? '').trim()
check('Banner zeigt die Entfernung', /km/.test(bannerDistance), bannerDistance)
check(
  'Banner ohne Richtungsangabe',
  (await pageA
    .locator('.compass-panel__banner .compass__direction, .compass-panel__banner-direction')
    .count()) === 0,
)
const bannerFont = await pageA.evaluate(() =>
  parseFloat(getComputedStyle(document.querySelector('.compass-panel__banner-name')).fontSize),
)
check('Name im Banner ist vergrößert', bannerFont >= 16, `${bannerFont}px`)
// The banner floats: it overlaps the lower edge of the dial.
const overlap = await pageA.evaluate(() => {
  const dial = document.querySelector('.compass__svg').getBoundingClientRect()
  const banner = document.querySelector('.compass-panel__banner').getBoundingClientRect()
  return Math.round(dial.bottom - banner.top)
})
check('Banner schwebt unter dem Kompass', overlap > 0 && overlap < 24, `${overlap}px Überlappung`)

// Accuracy small at the top right next to the compass.
const accuracyBox = await pageA.evaluate(() => {
  const badge = document.querySelector('.compass-panel__accuracy')?.getBoundingClientRect()
  const dial = document.querySelector('.compass__svg').getBoundingClientRect()
  if (!badge) return null
  return {
    text: document.querySelector('.compass-panel__accuracy')?.textContent?.trim(),
    fontSize: parseFloat(
      getComputedStyle(document.querySelector('.compass-panel__accuracy')).fontSize,
    ),
    rechts: badge.left >= dial.left + dial.width / 2,
    oben: badge.top < dial.top + dial.height / 2,
  }
})
check(
  'GPS-Genauigkeit klein oben rechts am Kompass',
  Boolean(accuracyBox) &&
    /^± \d+ m$/.test(accuracyBox.text) &&
    accuracyBox.rechts &&
    accuracyBox.oben,
  accuracyBox ? `${accuracyBox.text}, ${accuracyBox.fontSize}px` : 'fehlt',
)
check('Genauigkeitsplakette bleibt klein', (accuracyBox?.fontSize ?? 99) <= 12)

// The needle is animated via CSS transition - only measure after it ended.
const needleAngle = await pageA.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 500))
  const group = document.querySelector('.compass__needle')
  const m = new DOMMatrix(getComputedStyle(group).transform)
  return (Math.atan2(m.b, m.a) * 180) / Math.PI
})
check(
  'Nadel zeigt in Richtung des Ziels',
  needleAngle > 100 && needleAngle < 200,
  `${needleAngle.toFixed(1)}°`,
)

// List details via the bar
await pageA.waitForTimeout(300)
await pageA.click('.selection-bar .button')
await pageA.waitForSelector('.sheet__name', { timeout: 5000 })
check('Details über die Auswahlleiste', (await pageA.textContent('.sheet__name')) === firstName)
await pageA.click('.sheet__close')

/* -------------------------------------------- B: shrink on list scrolling -- */

process.stdout.write('\n2) Kompass schrumpft beim Scrollen und bleibt klein\n')
const dialSize = () =>
  pageA.evaluate(() => document.querySelector('.compass__svg').getBoundingClientRect().width)
const before = await dialSize()
const listHeightBefore = await pageA.evaluate(
  () => document.querySelector('.virtual').getBoundingClientRect().height,
)

await pageA.evaluate(() => {
  document.querySelector('.virtual').scrollTop = 400
})
await pageA.waitForFunction(
  () => document.querySelector('.compass-panel')?.classList.contains('compass-panel--compact'),
  undefined,
  { timeout: 5000 },
)
await pageA.waitForTimeout(400)
const small = await dialSize()
const listHeightAfter = await pageA.evaluate(
  () => document.querySelector('.virtual').getBoundingClientRect().height,
)
check(
  'Kompass auf ~50 % geschrumpft',
  Math.abs(small / before - 0.5) < 0.06,
  `${Math.round(before)}px → ${Math.round(small)}px`,
)
check(
  'Liste bekommt mehr Platz',
  listHeightAfter > listHeightBefore,
  `${Math.round(listHeightBefore)}px → ${Math.round(listHeightAfter)}px`,
)

await pageA.evaluate(() => {
  document.querySelector('.virtual').scrollTop = 0
})
await pageA.waitForTimeout(500)
check('Zurück ganz oben: wieder 100 %', Math.abs((await dialSize()) / before - 1) < 0.02)

// Small again and then selection -> 100%
await pageA.evaluate(() => {
  document.querySelector('.virtual').scrollTop = 300
})
await pageA.waitForFunction(
  () => document.querySelector('.compass-panel')?.classList.contains('compass-panel--compact'),
  undefined,
  { timeout: 5000 },
)
await pageA.locator('.entry').nth(2).click()
await pageA.waitForTimeout(500)
check(
  'Auswahl setzt den Kompass auf 100 % zurück',
  Math.abs((await dialSize()) / before - 1) < 0.02,
)

// Regression: after the selection further scrolling must shrink again.
// The short grace period after the tap has to have expired first.
await pageA.waitForTimeout(700)
await pageA.evaluate(() => {
  const list = document.querySelector('.virtual')
  list.scrollTop = list.scrollTop + 250
})
await pageA.waitForFunction(
  () => document.querySelector('.compass-panel')?.classList.contains('compass-panel--compact'),
  undefined,
  { timeout: 5000 },
)
// Only measure after the width transition.
await pageA.waitForTimeout(400)
check(
  'Nach der Auswahl schrumpft der Kompass beim weitergescrollten',
  Math.abs((await dialSize()) / before - 0.5) < 0.06,
  `${Math.round(((await dialSize()) / before) * 100)} %`,
)
await pageA.evaluate(() => {
  document.querySelector('.virtual').scrollTop = 0
})
await pageA.waitForTimeout(500)
check(
  'Auswahl ist jetzt der dritte Eintrag',
  (await pageA.textContent('.selection-bar__text strong')) ===
    (await pageA.locator('.entry__name').nth(2).textContent()),
)

// Clear the selection
await pageA.click('.selection-bar__clear')
await pageA.waitForTimeout(300)
check('Auswahl aufhebbar', (await pageA.locator('.selection-bar').count()) === 0)
check('Nadel wieder weg', (await pageA.locator('.compass__bottle').count()) === 0)

/* ---------------------------------------------------- C: GPS in settings --- */

process.stdout.write('\n3) GPS-Angaben nur in den Einstellungen\n')
const mainText = (await pageA.textContent('main')) ?? ''
check('Keine Koordinaten auf der Hauptseite', !/\b52\.\d{4}/.test(mainText))
check('Kein "Genauigkeit"-Feld auf der Hauptseite', !mainText.includes('Genauigkeit'))

await pageA.click('.topbar__settings')
await pageA.waitForSelector('.sheet__title', { timeout: 5000 })
check(
  'Cog öffnet die Einstellungen',
  (await pageA.textContent('.sheet__title')) === 'Einstellungen',
)
check('Verbindungsstatus in den Einstellungen', (await pageA.textContent('.geo-panel')).length > 0)
const geoPanel = (await pageA.textContent('.geo-panel')) ?? ''
check(
  'Status, Koordinaten und Genauigkeit reduziert vorhanden',
  /52\.\d{4}/.test(geoPanel) && /Genauigkeit|±/.test(geoPanel),
  geoPanel.replace(/\s+/g, ' ').trim().slice(0, 90),
)
check(
  'Tasten für Start/Stopp und Kopieren',
  (await pageA.locator('.geo-panel__actions .button').count()) === 2,
)
check(
  'Online-Status wird angezeigt',
  (await pageA.textContent('.sheet__panel'))?.includes('Online'),
)

/* -------------------------------------------- D: with orientation sensor (ring) -- */

// Close the sheet again so it does not swallow the following clicks.
await pageA.click('.sheet__close')
await pageA.waitForTimeout(300)

process.stdout.write('\n4) Mit Lagesensor: Ring dreht gegen die Geräteausrichtung\n')
const ctxB = await browser.newContext({
  baseURL: BASE,
  viewport: { width: 412, height: 900 },
})
await ctxB.addInitScript(stubGeolocation({ heading: 90 }))
const pageB = await ctxB.newPage()
await pageB.goto(BASE, { waitUntil: 'domcontentloaded' })
await pageB.waitForSelector('.entry', { timeout: 25000 })
await pageB.locator('.entry').first().click()
await pageB.waitForSelector('.compass__cardinal', { timeout: 5000 })

await pageB.waitForTimeout(500)
const angles = await pageB.evaluate(() => {
  const rotation = (selector) =>
    new DOMMatrix(getComputedStyle(document.querySelector(selector)).transform)
  const cardinal = rotation('.compass__cardinal')
  const needle = rotation('.compass__needle')
  const toDeg = (m) => (Math.atan2(m.b, m.a) * 180) / Math.PI
  return { cardinal: toDeg(cardinal), needle: toDeg(needle) }
})
check('Ring sichtbar, wenn heading vorhanden ist', true)
check(
  'Ring gegenläufig zur Ausrichtung (−90°)',
  Math.abs(angles.cardinal + 90) < 1,
  `${angles.cardinal.toFixed(1)}°`,
)

// Kontrolle: andere Ausrichtung -> anderer Ringwinkel
const ctxC = await browser.newContext({ baseURL: BASE, viewport: { width: 412, height: 900 } })
await ctxC.addInitScript(stubGeolocation({ heading: 210 }))
const pageC = await ctxC.newPage()
await pageC.goto(BASE, { waitUntil: 'domcontentloaded' })
await pageC.waitForSelector('.entry', { timeout: 25000 })
await pageC.locator('.entry').first().click()
await pageC.waitForTimeout(500)
const cardinalC = await pageC.evaluate(() => {
  const m = new DOMMatrix(getComputedStyle(document.querySelector('.compass__cardinal')).transform)
  return (Math.atan2(m.b, m.a) * 180) / Math.PI
})
// Angles come normalized from DOMMatrix to (-180, 180]; -210 deg equals 150 deg.
check(
  'Ring folgt der Ausrichtung (−210°)',
  Math.abs(Math.abs(cardinalC) - 150) < 1,
  `${cardinalC.toFixed(1)}° (= −210°)`,
)
check(
  'Nadel bleibt unabhängig von der Ausrichtung gleich',
  Math.abs(
    angles.needle -
      (await pageC.evaluate(() => {
        const m = new DOMMatrix(
          getComputedStyle(document.querySelector('.compass__needle')).transform,
        )
        return (Math.atan2(m.b, m.a) * 180) / Math.PI
      })),
  ) < 1,
)

/* ----------------------------------------------- E: no position anywhere ------ */

process.stdout.write('\n5) Ohne Position: Hinweis statt GPS-Zahlen\n')
const ctxD = await browser.newContext({ baseURL: BASE, viewport: { width: 412, height: 900 } })
await ctxD.addInitScript(`
  navigator.geolocation.watchPosition = (_success, error) => {
    error({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
    return 1
  }
  navigator.geolocation.getCurrentPosition = (_success, error) => {
    error({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
  }
  navigator.geolocation.clearWatch = () => {}
`)
const pageD = await ctxD.newPage()
await pageD.goto(BASE, { waitUntil: 'domcontentloaded' })
await pageD.waitForSelector('.entry', { timeout: 25000 })
await pageD.waitForFunction(
  () => document.querySelector('.compass-panel__caption')?.textContent?.includes('freigegeben'),
  undefined,
  { timeout: 15000 },
)
check(
  'Kompass nennt die fehlende Berechtigung',
  (await pageD.textContent('.compass-panel__caption'))?.includes('freigegeben'),
)
await pageD.locator('.entry').first().click()
await pageD.waitForSelector('.selection-bar', { timeout: 5000 })
check(
  'Auswahl funktioniert auch ohne Position',
  (await pageD.locator('.selection-bar').count()) === 1,
)
check(
  'Keine Distanz ohne Position',
  (await pageD.locator('.compass-panel__banner-distance').count()) === 0,
)
check('Banner ohne Position', (await pageD.locator('.compass-panel__banner').count()) === 1)
check('Nadel bleibt verborgen', (await pageD.locator('.compass__bottle').count()) === 0)
await pageD.click('.topbar__settings')
await pageD.waitForSelector('.sheet__title', { timeout: 5000 })
check(
  'GPS-Fehler steht in den Einstellungen',
  (await pageD.textContent('.geo-panel'))?.includes('verweigert'),
)

/* -------------------------------------------------------------- F: Sorting -- */

process.stdout.write('\n6) Sortierung: Nach Entfernung und Nach Name\n')
await pageA.evaluate(() => {
  document.querySelector('.virtual').scrollTop = 0
})
await pageA.waitForTimeout(400)
// The selection from section 2 was already cleared there.
if ((await pageA.locator('.selection-bar').count()) > 0) {
  await pageA.click('.selection-bar__clear')
  await pageA.waitForTimeout(300)
}

const names = () => pageA.locator('.entry__name').allTextContents()
const distanceFirst = (await names())[0]
const sortedByDistance = [...(await names())]

await pageA.click('.list__sort-button')
await pageA.waitForSelector('.list__sort-menu', { timeout: 5000 })
check('Dropdown öffnet', await pageA.locator('.list__sort-menu').isVisible())
check(
  'Zwei Sortieroptionen',
  (await pageA.locator('.list__sort-option').allTextContents()).join('|') ===
    'Nach Entfernung|Nach Name',
  (await pageA.locator('.list__sort-option').allTextContents()).join(' | '),
)
check(
  'Aktive Option ist angehakt',
  (await pageA.locator('.list__sort-option[aria-checked="true"]').textContent())?.trim() ===
    'Nach Entfernung',
)
await pageA.click('.list__sort-option:has-text("Nach Name")')
await pageA.waitForTimeout(400)
check('Dropdown schließt nach der Wahl', (await pageA.locator('.list__sort-menu').count()) === 0)
const byName = await names()
check(
  'Liste nach Name sortiert',
  byName.join('|') === [...byName].sort((a, b) => a.localeCompare(b, 'de')).join('|'),
  `${byName[0]} …`,
)
check(
  'Erster Eintrag hat sich geändert',
  byName[0] !== distanceFirst,
  `${distanceFirst} → ${byName[0]}`,
)

await pageA.click('.list__sort-button')
await pageA.waitForSelector('.list__sort-menu', { timeout: 5000 })
await pageA.click('.list__sort-option:has-text("Nach Entfernung")')
await pageA.waitForTimeout(400)
const backByDistance = await names()
check('Zurück auf "Nach Entfernung"', backByDistance.join('|') === sortedByDistance.join('|'))

// A click next to it closes the dropdown again.
await pageA.click('.list__sort-button')
await pageA.waitForSelector('.list__sort-menu', { timeout: 5000 })
await pageA.click('.compass-panel')
await pageA.waitForTimeout(300)
check(
  'Klick daneben schließt das Dropdown',
  (await pageA.locator('.list__sort-menu').count()) === 0,
)

/* ------------------------------------------------------------------- End --- */
await browser.close()
const failed = results.filter((entry) => !entry.ok)
process.stdout.write(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden\n`)
if (failed.length > 0)
  process.stdout.write(`Fehlgeschlagen: ${failed.map((f) => f.name).join('; ')}\n`)
process.exit(failed.length === 0 ? 0 : 1)
