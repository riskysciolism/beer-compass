/**
 * Admin API routes mounted under /admin/api.
 */
import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pool } from '../lib/db.mjs'
import { hashPassword, verifyPassword, signToken } from '../lib/auth.mjs'
import { authMiddleware } from '../lib/middleware.mjs'
import { logAudit } from '../lib/audit.mjs'
import {
  sanitizeText,
  slugify,
  coerceBoolean,
  isValidCoordinate,
  isBlockedDevice,
} from '../lib/sanitize.mjs'

const router = Router()

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

await mkdir(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'bin'
    cb(null, `${randomUUID()}.${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true)
    else cb(new Error('Only image uploads are allowed'))
  },
})

/* --------------------------------------------------------- Auth ---------- */

router.post('/auth/setup', async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM admins LIMIT 1')
  if (rows.length > 0) {
    res.status(403).json({ error: 'Initial admin already exists' })
    return
  }
  const username = sanitizeText(req.body.username)
  const password = sanitizeText(req.body.password)
  if (username.length < 3 || password.length < 8) {
    res.status(400).json({ error: 'Username or password too short' })
    return
  }
  const hash = await hashPassword(password)
  const { rows: inserted } = await pool.query(
    'INSERT INTO admins (username, password_hash) VALUES ($1, $2) RETURNING id, username',
    [username, hash],
  )
  await logAudit(inserted[0].id, 'admin_created')
  res.json({ token: signToken({ adminId: inserted[0].id, username: inserted[0].username }) })
})

router.post('/auth/login', async (req, res) => {
  const username = sanitizeText(req.body.username)
  const password = sanitizeText(req.body.password)
  const { rows } = await pool.query('SELECT id, username, password_hash FROM admins WHERE username = $1', [username])
  if (rows.length === 0) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  const valid = await verifyPassword(password, rows[0].password_hash)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  await logAudit(rows[0].id, 'admin_login')
  res.json({ token: signToken({ adminId: rows[0].id, username: rows[0].username }) })
})

router.get('/me', authMiddleware, async (req, res) => {
  res.json({ id: req.admin.id, username: req.admin.username })
})

/* --------------------------------------------------------- Dashboard ----- */

router.get('/dashboard', authMiddleware, async (_req, res) => {
  const { rows: itemCount } = await pool.query('SELECT COUNT(*) FROM items WHERE is_active = true')
  const { rows: suggestionCount } = await pool.query(
    "SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending, COUNT(*) AS total FROM suggestions",
  )
  const { rows: blockCount } = await pool.query('SELECT COUNT(*) FROM blocks WHERE expires_at IS NULL OR expires_at > NOW()')
  const { rows: eventCount } = await pool.query('SELECT COUNT(*) FROM events WHERE created_at > NOW() - INTERVAL \'24 hours\'')
  const { rows: uniqueDevices } = await pool.query(
    'SELECT COUNT(DISTINCT device_id) FROM events WHERE created_at > NOW() - INTERVAL \'30 days\'',
  )
  const { rows: topItems } = await pool.query(
    `SELECT i.id, i.name, COUNT(e.id) AS event_count
     FROM events e
     LEFT JOIN items i ON i.id = e.item_id
     WHERE e.created_at > NOW() - INTERVAL '30 days'
     GROUP BY i.id, i.name
     ORDER BY event_count DESC
     LIMIT 10`,
  )
  const { rows: daily } = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS count
     FROM events
     WHERE created_at > NOW() - INTERVAL '30 days'
     GROUP BY day
     ORDER BY day`,
  )
  res.json({
    items: Number(itemCount[0].count),
    suggestions: { pending: Number(suggestionCount[0].pending), total: Number(suggestionCount[0].total) },
    blocks: Number(blockCount[0].count),
    events24h: Number(eventCount[0].count),
    uniqueDevices30d: Number(uniqueDevices[0].count),
    topItems,
    daily,
  })
})

/* --------------------------------------------------------- Schema -------- */

router.get('/schema', authMiddleware, async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM schema_fields ORDER BY sort_order, id')
  res.json(rows)
})

router.post('/schema', authMiddleware, async (req, res) => {
  const key = slugify(sanitizeText(req.body.key))
  const label = sanitizeText(req.body.label)
  const type = sanitizeText(req.body.type)
  const sortOrder = Number(req.body.sort_order) || 0
  if (!key || !label || !['boolean', 'text', 'number', 'feature'].includes(type)) {
    res.status(400).json({ error: 'Invalid field data' })
    return
  }
  const { rows } = await pool.query(
    'INSERT INTO schema_fields (key, label, type, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
    [key, label, type, sortOrder],
  )
  await logAudit(req.admin.id, 'schema_field_created', 'schema_field', rows[0].id, { key, label, type })
  res.status(201).json(rows[0])
})

router.put('/schema/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const label = sanitizeText(req.body.label)
  const sortOrder = Number(req.body.sort_order) || 0
  if (!label) {
    res.status(400).json({ error: 'Label required' })
    return
  }
  const { rows } = await pool.query(
    'UPDATE schema_fields SET label = $1, sort_order = $2 WHERE id = $3 RETURNING *',
    [label, sortOrder, id],
  )
  if (rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  await logAudit(req.admin.id, 'schema_field_updated', 'schema_field', id, { label, sortOrder })
  res.json(rows[0])
})

router.delete('/schema/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const { rows } = await pool.query('DELETE FROM schema_fields WHERE id = $1 RETURNING key', [id])
  if (rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  await logAudit(req.admin.id, 'schema_field_deleted', 'schema_field', id, { key: rows[0].key })
  res.status(204).send()
})

/* --------------------------------------------------------- Items --------- */

router.get('/items', authMiddleware, async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM items ORDER BY name')
  res.json(rows)
})

router.get('/items/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const { rows } = await pool.query('SELECT * FROM items WHERE id = $1', [id])
  if (rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(rows[0])
})

function parseItemPayload(body, existingSlug) {
  const name = sanitizeText(body.name)
  if (!name) return null
  const address = sanitizeText(body.address)
  const description = sanitizeText(body.description)
  const latitude = Number(body.latitude)
  const longitude = Number(body.longitude)
  if (!isValidCoordinate(latitude, longitude)) return null
  const features = Array.isArray(body.features)
    ? body.features.map((f) => sanitizeText(f)).filter(Boolean)
    : []
  const metadata = typeof body.metadata === 'object' && body.metadata !== null ? body.metadata : {}
  const isActive = coerceBoolean(body.is_active)
  const slug = existingSlug || slugify(name)
  return { slug, name, address, description, latitude, longitude, features, metadata, isActive }
}

router.post('/items', authMiddleware, async (req, res) => {
  const parsed = parseItemPayload(req.body)
  if (!parsed) {
    res.status(400).json({ error: 'Invalid item data' })
    return
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO items (slug, name, address, description, latitude, longitude, features, metadata, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        parsed.slug,
        parsed.name,
        parsed.address,
        parsed.description,
        parsed.latitude,
        parsed.longitude,
        parsed.features,
        JSON.stringify(parsed.metadata),
        parsed.isActive,
      ],
    )
    await logAudit(req.admin.id, 'item_created', 'item', rows[0].id, { name: parsed.name })
    res.status(201).json(rows[0])
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      res.status(409).json({ error: 'Slug already exists' })
      return
    }
    throw error
  }
})

router.put('/items/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const { rows: existing } = await pool.query('SELECT slug FROM items WHERE id = $1', [id])
  if (existing.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const parsed = parseItemPayload(req.body, existing[0].slug)
  if (!parsed) {
    res.status(400).json({ error: 'Invalid item data' })
    return
  }
  const { rows } = await pool.query(
    `UPDATE items
     SET name = $1, address = $2, description = $3, latitude = $4, longitude = $5,
         features = $6, metadata = $7, is_active = $8, updated_at = NOW()
     WHERE id = $9 RETURNING *`,
    [
      parsed.name,
      parsed.address,
      parsed.description,
      parsed.latitude,
      parsed.longitude,
      parsed.features,
      JSON.stringify(parsed.metadata),
      parsed.isActive,
      id,
    ],
  )
  await logAudit(req.admin.id, 'item_updated', 'item', id, { name: parsed.name })
  res.json(rows[0])
})

router.delete('/items/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const { rows } = await pool.query('DELETE FROM items WHERE id = $1 RETURNING name', [id])
  if (rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  await logAudit(req.admin.id, 'item_deleted', 'item', id, { name: rows[0].name })
  res.status(204).send()
})

router.post('/items/:id/image', authMiddleware, upload.single('image'), async (req, res) => {
  const id = Number(req.params.id)
  if (!req.file) {
    res.status(400).json({ error: 'No image uploaded' })
    return
  }
  const imagePath = `/uploads/${req.file.filename}`
  await pool.query('UPDATE items SET image = $1, updated_at = NOW() WHERE id = $2', [imagePath, id])
  await logAudit(req.admin.id, 'item_image_uploaded', 'item', id, { filename: req.file.filename })
  res.json({ image: imagePath })
})

/* --------------------------------------------------------- Suggestions --- */

router.get('/suggestions', authMiddleware, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, i.name AS item_name, a.username AS reviewed_by_name
     FROM suggestions s
     LEFT JOIN items i ON i.id = s.item_id
     LEFT JOIN admins a ON a.id = s.reviewed_by
     ORDER BY s.created_at DESC`,
  )
  res.json(rows)
})

router.post('/suggestions/:id/approve', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const note = sanitizeText(req.body.note)
  const { rows } = await pool.query(
    'UPDATE suggestions SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4 RETURNING *',
    ['approved', note, req.admin.id, id],
  )
  if (rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const suggestion = rows[0]

  if (suggestion.type === 'new') {
    const payload = suggestion.payload
    const parsed = parseItemPayload(payload)
    if (parsed) {
      const { rows: inserted } = await pool.query(
        `INSERT INTO items (slug, name, address, latitude, longitude, features, metadata, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          parsed.slug,
          parsed.name,
          parsed.address,
          parsed.latitude,
          parsed.longitude,
          parsed.features,
          JSON.stringify(parsed.metadata),
          parsed.isActive,
        ],
      )
      await logAudit(req.admin.id, 'suggestion_approved_new', 'item', inserted[0].id, { suggestionId: id, name: parsed.name })
    }
  } else if (suggestion.type === 'edit' && suggestion.item_id) {
    const payload = suggestion.payload
    const { rows: existing } = await pool.query('SELECT slug FROM items WHERE id = $1', [suggestion.item_id])
    if (existing.length > 0) {
      const parsed = parseItemPayload(payload, existing[0].slug)
      if (parsed) {
        await pool.query(
          `UPDATE items
           SET name = $1, address = $2, latitude = $3, longitude = $4, features = $5,
               metadata = $6, is_active = $7, updated_at = NOW()
           WHERE id = $8`,
          [
            parsed.name,
            parsed.address,
            parsed.latitude,
            parsed.longitude,
            parsed.features,
            JSON.stringify(parsed.metadata),
            parsed.isActive,
            suggestion.item_id,
          ],
        )
        await logAudit(req.admin.id, 'suggestion_approved_edit', 'item', suggestion.item_id, { suggestionId: id })
      }
    }
  }

  res.json(rows[0])
})

router.post('/suggestions/:id/reject', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const note = sanitizeText(req.body.note)
  const { rows } = await pool.query(
    'UPDATE suggestions SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4 RETURNING *',
    ['rejected', note, req.admin.id, id],
  )
  if (rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  await logAudit(req.admin.id, 'suggestion_rejected', 'suggestion', id, { note })
  res.json(rows[0])
})

/* --------------------------------------------------------- Blocks -------- */

router.get('/blocks', authMiddleware, async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM blocks ORDER BY created_at DESC')
  res.json(rows)
})

router.post('/blocks', authMiddleware, async (req, res) => {
  const deviceId = sanitizeText(req.body.device_id)
  const reason = sanitizeText(req.body.reason)
  const expiresAt = req.body.expires_at ? new Date(req.body.expires_at) : null
  if (!deviceId) {
    res.status(400).json({ error: 'device_id required' })
    return
  }
  const { rows } = await pool.query(
    `INSERT INTO blocks (device_id, reason, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (device_id) DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at
     RETURNING *`,
    [deviceId, reason, expiresAt],
  )
  await logAudit(req.admin.id, 'device_blocked', 'block', rows[0].id, { deviceId, reason, expiresAt })
  res.status(201).json(rows[0])
})

router.delete('/blocks/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id)
  const { rows } = await pool.query('DELETE FROM blocks WHERE id = $1 RETURNING device_id', [id])
  if (rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  await logAudit(req.admin.id, 'device_unblocked', 'block', id, { deviceId: rows[0].device_id })
  res.status(204).send()
})

/* --------------------------------------------------------- Audit --------- */

router.get('/audit', authMiddleware, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0
  const { rows } = await pool.query(
    `SELECT a.*, ad.username AS admin_username
     FROM audit_logs a
     LEFT JOIN admins ad ON ad.id = a.admin_id
     ORDER BY a.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
  res.json(rows)
})

/* --------------------------------------------------------- Stats / Heatmap */

router.get('/stats/heatmap', authMiddleware, async (_req, res) => {
  const { rows: itemHeat } = await pool.query(
    `SELECT i.id, i.name, i.latitude, i.longitude, COUNT(e.id) AS count
     FROM events e
     LEFT JOIN items i ON i.id = e.item_id
     WHERE e.event_type = 'select' AND e.created_at > NOW() - INTERVAL '30 days'
     GROUP BY i.id, i.name, i.latitude, i.longitude
     ORDER BY count DESC`,
  )
  const { rows: geoHeat } = await pool.query(
    `SELECT latitude, longitude, COUNT(*) AS count
     FROM events
     WHERE event_type IN ('select', 'locate') AND latitude IS NOT NULL AND longitude IS NOT NULL
       AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY latitude, longitude`,
  )
  res.json({ itemHeat, geoHeat })
})

/* --------------------------------------------------------- Public event tracking */

router.post('/events', async (req, res) => {
  const deviceId = sanitizeText(req.body.device_id)
  if (!deviceId) {
    res.status(400).json({ error: 'device_id required' })
    return
  }
  const { rows: blocks } = await pool.query(
    'SELECT expires_at FROM blocks WHERE device_id = $1',
    [deviceId],
  )
  if (isBlockedDevice(deviceId, blocks)) {
    res.status(403).json({ error: 'Device blocked' })
    return
  }
  const eventType = sanitizeText(req.body.event_type)
  const itemId = req.body.item_id ? Number(req.body.item_id) : null
  const latitude = req.body.latitude != null ? Number(req.body.latitude) : null
  const longitude = req.body.longitude != null ? Number(req.body.longitude) : null
  const metadata = typeof req.body.metadata === 'object' ? req.body.metadata : {}
  if (!['open', 'select', 'search', 'locate'].includes(eventType)) {
    res.status(400).json({ error: 'Invalid event_type' })
    return
  }
  await pool.query(
    `INSERT INTO events (device_id, event_type, item_id, latitude, longitude, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [deviceId, eventType, itemId, latitude, longitude, JSON.stringify(metadata)],
  )
  res.status(204).send()
})

/* --------------------------------------------------------- Publish ------- */

router.post('/publish', authMiddleware, async (req, res) => {
  const { rows: items } = await pool.query(
    'SELECT * FROM items WHERE is_active = true ORDER BY name',
  )
  const { rows: fields } = await pool.query('SELECT * FROM schema_fields ORDER BY sort_order, id')
  const { rows: versionRow } = await pool.query('SELECT MAX(version) FROM version_history')

  const previousVersion = Number(versionRow[0].max ?? 0)
  const version = previousVersion + 1
  const updatedAt = new Date().toISOString()

  // Map DB rows to the dataset format the PWA expects (a plain array of items).
  const dataset = items.map((item) => ({
    position: { longitude: Number(item.longitude), latitude: Number(item.latitude) },
    address: item.address ?? '',
    image: item.image ?? '',
    name: item.name,
    description: item.description ?? '',
    features: Array.isArray(item.features) ? item.features : [],
  }))

  // Keep schema fields in a separate file so the app can extend its UI later.
  const schemaPayload = { fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type })) }

  const publicDataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data')
  await mkdir(publicDataDir, { recursive: true })
  writeFileSync(resolve(publicDataDir, 'data.json'), JSON.stringify(dataset, null, 2))
  writeFileSync(resolve(publicDataDir, 'schema.json'), JSON.stringify(schemaPayload, null, 2))
  writeFileSync(
    resolve(publicDataDir, 'version.json'),
    JSON.stringify({ version, updatedAt, count: items.length, schema: version }, null, 2),
  )

  // Record the published version so subsequent publishes increment correctly.
  await pool.query('INSERT INTO version_history (version) VALUES ($1)', [version])

  await logAudit(req.admin.id, 'data_published', 'dataset', version, { count: items.length })
  res.json({ version, count: items.length })
})

export default router
