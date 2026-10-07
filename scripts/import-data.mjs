#!/usr/bin/env node
/**
 * Import existing public/data/data.json into PostgreSQL.
 *
 * Run after migrations:
 *   node scripts/import-data.mjs
 */
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, runMigrations, closePool } from '../server/lib/db.mjs'
import { slugify } from '../server/lib/sanitize.mjs'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const DATA_FILE = resolve(ROOT, 'public/data/data.json')

async function main() {
  await runMigrations()

  const raw = await readFile(DATA_FILE, 'utf-8')
  const data = JSON.parse(raw)

  const { rows: existing } = await pool.query('SELECT COUNT(*) FROM items')
  if (Number(existing[0].count) > 0) {
    console.info('Items already imported, skipping.')
    await closePool()
    return
  }

  for (const item of data.items ?? []) {
    const name = String(item.name ?? '')
    const slug = slugify(name) || slugify(String(item.id ?? ''))
    const address = String(item.address ?? '')
    const lat = Number(item.position?.latitude)
    const lon = Number(item.position?.longitude)
    const features = Array.isArray(item.features)
      ? item.features.map((f) => String(f))
      : []
    const metadata = typeof item.metadata === 'object' && item.metadata !== null ? item.metadata : {}
    const image = item.image ? String(item.image) : null

    await pool.query(
      `INSERT INTO items (slug, name, address, latitude, longitude, features, metadata, image, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, name, address, lat, lon, features, JSON.stringify(metadata), image, true],
    )
  }

  console.info(`Imported ${data.items?.length ?? 0} items.`)
  await closePool()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
