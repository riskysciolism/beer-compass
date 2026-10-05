#!/usr/bin/env node
/**
 * Validates the data files against the same schema the app uses at runtime.
 *
 * Usage:
 * npm run data:validate # validates public/data/data.json
 * npm run data:validate -- path.json # validates any given file
 *
 * Exit code 0 = valid, 1 = error. This validator deliberately uses the same
 * zod definition as the app's web worker, so that "valid locally" and
 * "valid in the app" cannot drift apart.
 */
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { datasetSchema, describeIssues } from '../src/schemas/dataset.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(ROOT, process.argv[2] ?? 'public/data/data.json')

process.stdout.write(`Prüfe ${relative(ROOT, target)}\n`)

let raw
try {
  raw = readFileSync(target, 'utf8')
} catch (error) {
  process.stderr.write(`FEHLER: Datei nicht lesbar – ${error.message}\n`)
  process.exit(1)
}

let parsed
try {
  parsed = JSON.parse(raw)
} catch (error) {
  process.stderr.write(`FEHLER: ungültiges JSON – ${error.message}\n`)
  process.exit(1)
}

const result = datasetSchema.safeParse(parsed)

if (!result.success) {
  const issues = describeIssues(result.error)
  process.stderr.write(`FEHLER: ${issues.length} Schema-Verstöße\n`)
  for (const issue of issues.slice(0, 20)) process.stderr.write(`  ${issue}\n`)
  if (issues.length > 20) process.stderr.write(`  … und ${issues.length - 20} weitere\n`)
  process.exit(1)
}

const items = result.data
const withImage = items.filter((item) => item.image.length > 0).length
const coordinates = items.map((item) => `${item.position.longitude},${item.position.latitude}`)
const duplicates = coordinates.length - new Set(coordinates).size

process.stdout.write(`OK: ${items.length} Einträge gültig\n`)
process.stdout.write(`  mit Bild: ${withImage}\n`)
process.stdout.write(`  eindeutige Koordinaten: ${new Set(coordinates).size}/${items.length}`)
process.stdout.write(duplicates > 0 ? ` (${duplicates} mehrfach)\n` : '\n')

const versionFile = resolve(ROOT, 'public/data/version.json')
try {
  const version = JSON.parse(readFileSync(versionFile, 'utf8'))
  if (version.count !== undefined && version.count !== items.length) {
    process.stderr.write(
      `WARNUNG: version.json nennt ${version.count} Einträge, data.json enthält ${items.length}\n`,
    )
  } else {
    process.stdout.write(`  version.json: Version ${version.version}, ${version.count} Einträge\n`)
  }
} catch {
  process.stderr.write('WARNUNG: version.json fehlt oder ist ungültig\n')
}
