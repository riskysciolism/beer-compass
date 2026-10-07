#!/usr/bin/env node
/**
 * Backend for the Beer Compass PWA and its admin interface.
 *
 * Endpoints:
 * Public:
 *   GET /api/health
 *   GET /api/version.json
 *   GET /api/data.json
 *   GET|POST /api/echo
 *   POST /api/events
 *   GET /data/*
 * Admin (under /admin/api):
 *   POST /admin/api/auth/setup
 *   POST /admin/api/auth/login
 *   GET  /admin/api/me
 *   ... CRUD for items, schema, suggestions, blocks, audit, stats, publish
 *
 * Start: node server/index.mjs [--port 8787] [--serve-dist]
 */
import 'dotenv/config'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import rateLimit from 'express-rate-limit'
import { runMigrations } from './lib/db.mjs'
import adminRouter from './routes/admin.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = resolve(ROOT, 'public')
const DIST_DIR = resolve(ROOT, 'dist')
const UPLOAD_DIR = resolve(ROOT, 'uploads')

const args = process.argv.slice(2)
const PORT = Number(readFlag('--port') ?? process.env.PORT ?? 8787)
const HOST = readFlag('--host') ?? process.env.HOST ?? '0.0.0.0'
const SERVE_DIST = args.includes('--serve-dist')
const LOG = process.env.BC_LOG === '1' || args.includes('--log')

function readFlag(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
const MAX_BODY = 64 * 1024
const clockSkewSeconds = 300
const CORS_ALLOW_ORIGIN = process.env.BC_CORS_ORIGIN ?? '*'

/* ------------------------------------------------------------- Utilities -- */

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(payload))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    ...extraHeaders,
  })
  res.end(body)
}

function notModified(req, etag, lastModified) {
  const ifNoneMatch = req.headers['if-none-match']
  if (typeof ifNoneMatch === 'string' && ifNoneMatch.split(',').some((t) => t.trim() === etag)) {
    return true
  }
  const ifModifiedSince = req.headers['if-modified-since']
  if (!ifNoneMatch && typeof ifModifiedSince === 'string' && ifModifiedSince === lastModified) {
    return true
  }
  return false
}

function corsHeaders(req) {
  const origin = req.headers.origin
  return {
    'access-control-allow-origin': CORS_ALLOW_ORIGIN === '*' && origin ? origin : CORS_ALLOW_ORIGIN,
    'access-control-allow-headers':
      'content-type, x-client-id, x-client-timestamp, x-client-nonce, x-client-signature, if-none-match, authorization',
    'access-control-allow-methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'access-control-max-age': '600',
    vary: 'origin',
  }
}

function safeJoin(base, urlPath) {
  const decoded = decodeURIComponent(urlPath)
  const target = normalize(join(base, decoded))
  if (target !== base && !target.startsWith(base + sep)) return undefined
  return target
}

/* ---------------------------------------------------------- File serving --- */

function fileDescriptor(filePath) {
  const body = readFileSync(filePath)
  return {
    etag: `"${createHash('sha1').update(body).digest('base64url').slice(0, 24)}"`,
    lastModified: new Date(statSync(filePath).mtimeMs).toUTCString(),
    body,
  }
}

function serveFile(req, res, filePath) {
  const { etag, lastModified, body } = fileDescriptor(filePath)
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const headers = {
    'content-type': type,
    etag,
    'last-modified': lastModified,
    'x-content-type-options': 'nosniff',
    ...corsHeaders(req),
  }
  if (notModified(req, etag, lastModified)) {
    res.writeHead(304, headers)
    res.end()
    return
  }
  headers['content-length'] = body.length
  headers['cache-control'] = 'public, max-age=0, must-revalidate'
  res.writeHead(200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(filePath).pipe(res)
}

/* ----------------------------------------------------------------- Echo ---- */

function echoSignature({ clientId, timestamp, nonce, bodyHash }) {
  return createHash('sha256')
    .update(`beer-compass:v1|${clientId}|${timestamp}|${nonce}|${bodyHash}`)
    .digest('hex')
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('payload_too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function handleEcho(req, res) {
  const clientId = req.headers['x-client-id']
  const timestamp = req.headers['x-client-timestamp']
  const nonce = req.headers['x-client-nonce']
  const presented = req.headers['x-client-signature']

  const problems = []
  if (typeof clientId !== 'string' || !CLIENT_ID_PATTERN.test(clientId)) {
    problems.push('unbekannte Client-ID (Header x-client-id, 8-64 Zeichen [A-Za-z0-9_-])')
  }
  const numericTimestamp = Number(timestamp)
  if (!Number.isFinite(numericTimestamp)) {
    problems.push('fehlender Zeitstempel (Header x-client-timestamp, Unix-Zeit in ms)')
  } else if (Math.abs(Date.now() - numericTimestamp) > clockSkewSeconds * 1000) {
    problems.push(`Zeitstempel weicht mehr als ${clockSkewSeconds} s von der Serverzeit ab`)
  }
  if (typeof nonce !== 'string' || nonce.length < 8 || nonce.length > 64) {
    problems.push('fehlende oder ungültige Nonce (Header x-client-nonce, 8-64 Zeichen)')
  }
  if (problems.length > 0) {
    sendJson(res, 400, { ok: false, error: 'invalid_signature', problems }, corsHeaders(req))
    return
  }

  const raw = req.method === 'POST' ? await readBody(req).catch(() => Buffer.alloc(0)) : Buffer.alloc(0)
  const bodyHash = createHash('sha256').update(raw).digest('hex')
  const expected = echoSignature({ clientId, timestamp, nonce, bodyHash })

  if (typeof presented === 'string') {
    const a = Buffer.from(presented, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      sendJson(res, 401, { ok: false, error: 'signature_mismatch', expectedSignature: expected }, corsHeaders(req))
      return
    }
  }

  let payload
  try {
    payload = raw.length > 0 ? JSON.parse(raw.toString('utf8')) : null
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' }, corsHeaders(req))
    return
  }

  sendJson(
    res,
    200,
    {
      ok: true,
      echo: payload,
      clientId,
      nonce,
      clientTimestamp: numericTimestamp,
      serverTimestamp: Date.now(),
      bodySha256: bodyHash,
      signature: expected,
      signatureVerified: typeof presented === 'string',
    },
    corsHeaders(req),
  )
}

/* --------------------------------------------------------------- Express --- */

const app = express()

app.use((req, res, next) => {
  if (LOG) {
    res.on('finish', () => {
      process.stdout.write(`${new Date().toISOString()} ${req.method} ${req.path} → ${res.statusCode}\n`)
    })
  }
  next()
})

app.use((req, res, next) => {
  const headers = corsHeaders(req)
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value)
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

app.use(express.json({ limit: '1mb' }))
app.use('/uploads', express.static(UPLOAD_DIR))

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts' },
})
app.use('/admin/api/auth/login', loginLimiter)
app.use('/admin/api/auth/setup', loginLimiter)

// Admin API registration deferred until DB status is known.

// Public API
app.get('/api/health', (_req, res) => {
  sendJson(res, 200, { ok: true, serverTime: Date.now() })
})

app.all('/api/echo', (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  handleEcho(req, res).catch(() => sendJson(res, 500, { ok: false, error: 'internal' }))
})

app.get(['/api/version.json', '/api/data.json'], (req, res) => {
  const source = resolve(PUBLIC_DIR, 'data', req.path.slice('/api/'.length))
  if (!existsSync(source)) {
    sendJson(res, 404, { ok: false, error: 'not_found', path: req.path })
    return
  }
  serveFile(req, res, source)
})

app.use('/data', (req, res) => {
  const file = safeJoin(PUBLIC_DIR, req.path)
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    sendJson(res, 404, { ok: false, error: 'not_found', path: req.path })
    return
  }
  serveFile(req, res, file)
})

let dbReady = false

async function initAdminRoutes() {
  if (dbReady) {
    app.use('/admin/api', adminRouter)
  } else {
    app.use('/admin', (_req, res) => {
      res.status(503).json({ error: 'Database unavailable' })
    })
    app.use('/api/events', (_req, res) => {
      res.status(503).json({ error: 'Database unavailable' })
    })
  }
}

function initStaticFallback() {
  if (!SERVE_DIST) return
  app.use(express.static(DIST_DIR))
  app.use((req, res) => {
    const acceptsHtml = req.headers.accept?.includes('text/html')
    if (!acceptsHtml) {
      sendJson(res, 404, { ok: false, error: 'not_found' })
      return
    }
    if (req.path.startsWith('/admin') && !req.path.startsWith('/admin/api')) {
      const adminFallback = resolve(DIST_DIR, 'admin.html')
      if (existsSync(adminFallback)) {
        serveFile(req, res, adminFallback)
        return
      }
    }
    const fallback = resolve(DIST_DIR, 'index.html')
    if (existsSync(fallback)) {
      serveFile(req, res, fallback)
      return
    }
    sendJson(res, 404, { ok: false, error: 'not_found' })
  })
}

function initFinalHandlers() {
  app.use((_req, res) => {
    sendJson(res, 404, { ok: false, error: 'not_found' })
  })

  app.use((err, _req, res, _next) => {
    console.error(err)
    const status = err.status || 500
    sendJson(res, status, { ok: false, error: err.message || 'internal' })
  })
}

async function start() {
  try {
    await runMigrations()
    dbReady = true
  } catch (err) {
    console.warn('Database not available, admin API and analytics disabled:', err.message)
  }
  await initAdminRoutes()
  initStaticFallback()
  initFinalHandlers()

  app.listen(PORT, HOST, () => {
    const curlHint =
      `curl -s localhost:${PORT}/api/echo \\\n` +
      `  -H "x-client-id: demo-client-0001" \\\n` +
      `  -H "x-client-timestamp: ${Date.now()}" \\\n` +
      `  -H "x-client-nonce: 0123456789abcdef"`

    process.stdout.write(
      [
        `Beer-Compass-API läuft auf http://localhost:${PORT}`,
        SERVE_DIST ? `  statische Dateien: ${DIST_DIR}` : '  (kein --serve-dist: nur API + public/data)',
        '  Endpunkte: /api/health /api/version.json /api/data.json /api/echo /api/events',
        '  Admin: /admin',
        `  Test-Request:\n${curlHint}`,
        '',
      ].join('\n'),
    )
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => process.exit(0))
}
