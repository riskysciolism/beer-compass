/**
 * Minimal PostgreSQL client wrapper with a simple migration runner.
 */
import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL }
  }
  return {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'beercompass',
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? '',
  }
}

export const pool = new Pool(getConfig())

export async function closePool() {
  await pool.end()
}

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const migrationsDir = join(__dirname, '..', '..', 'migrations')
  const entries = await readdir(migrationsDir, { withFileTypes: true }).catch(() => [])
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort()

  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [file])
    if (rows.length) continue
    const sql = await readFile(join(migrationsDir, file), 'utf-8')
    await pool.query(sql)
    await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file])
    console.info(`Migration applied: ${file}`)
  }
}

export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
