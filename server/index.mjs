#!/usr/bin/env node
/**
 * Minimal backend for the Beer Compass PWA - deliberately dependency-free.
 *
 * Endpoints:
 * GET /api/health reachability probe (200, no cache)
 * GET /api/version.json small version file (ETag + Last-Modified, 304)
 * GET /api/data.json full data file (ETag + Last-Modified, 304)
 * HEAD /api/data.json headers only, avoids transferring large files
 * GET|POST /api/echo dummy echo: accepts "signed" (identifiable) requests
 * and mirrors them back together with a checksum.
 * GET /data/* static sample data (identical to public/data)
 * GET /* static files from dist/ (only with --serve-dist)
 *
 * Start: node server/index.mjs [--port 8787] [--serve-dist]
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = resolve(ROOT, 'public')
const DIST_DIR = resolve(ROOT, 'dist')

const args = process.argv.slice(2)
const PORT = Number(readFlag('--port') ?? process.env.PORT ?? 8787)
const HOST = readFlag('--host') ?? process.env.HOST ?? '0.0.0.0'
const SERVE_DIST = args.includes('--serve-dist')
/** Optional request log (BC_LOG=1) - handy for tests and debugging. */
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
/** Allows CORS for development setups (Vite on a different port). */
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

function cors(req) {
  const origin = req.headers.origin
  return {
    'access-control-allow-origin': CORS_ALLOW_ORIGIN === '*' && origin ? origin : CORS_ALLOW_ORIGIN,
    'access-control-allow-headers':
      'content-type, x-client-id, x-client-timestamp, x-client-nonce, x-client-signature, if-none-match',
    'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
    'access-control-max-age': '600',
    vary: 'origin',
  }
}

/** Resolves a path safely within a base directory. */
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
    ...cors(req),
  }

  if (notModified(req, etag, lastModified)) {
    res.writeHead(304, headers)
    res.end()
    return
  }

  headers['content-length'] = body.length
  // Data may be cached (IndexedDB is the source, the HTTP cache is only an accelerator).
  headers['cache-control'] = 'public, max-age=0, must-revalidate'
  res.writeHead(200, headers)

  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(filePath).pipe(res)
}

/* ----------------------------------------------------------------- Echo ---- */

/**
 * "Signed" in the sense of *identifiable*: the client sends a stable
 * client ID, a timestamp and a nonce. The server derives an HMAC-like checksum
 * from it, mirrors all fields back, and the client can recompute it.
 * There is no secret key - the purpose is attribution and integrity checking
 * during operation, not authentication.
 */
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
    sendJson(res, 400, { ok: false, error: 'invalid_signature', problems }, cors(req))
    return
  }

  const raw =
    req.method === 'POST' ? await readBody(req).catch(() => Buffer.alloc(0)) : Buffer.alloc(0)
  const bodyHash = createHash('sha256').update(raw).digest('hex')
  const expected = echoSignature({ clientId, timestamp, nonce, bodyHash })

  if (typeof presented === 'string') {
    const a = Buffer.from(presented, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      sendJson(
        res,
        401,
        { ok: false, error: 'signature_mismatch', expectedSignature: expected },
        cors(req),
      )
      return
    }
  }

  let payload
  try {
    payload = raw.length > 0 ? JSON.parse(raw.toString('utf8')) : null
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' }, cors(req))
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
    cors(req),
  )
}

/* --------------------------------------------------------------- Server --- */

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const { pathname } = url

  if (LOG) {
    res.on('finish', () => {
      process.stdout.write(
        `${new Date().toISOString()} ${req.method} ${pathname} → ${res.statusCode}\n`,
      )
    })
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors(req))
    res.end()
    return
  }

  if (pathname === '/api/health') {
    sendJson(res, 200, { ok: true, serverTime: Date.now() }, cors(req))
    return
  }

  if (pathname === '/api/echo') {
    if (req.method !== 'POST' && req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' }, cors(req))
      return
    }
    handleEcho(req, res).catch(() =>
      sendJson(res, 500, { ok: false, error: 'internal' }, cors(req)),
    )
    return
  }

  if (pathname === '/api/version.json' || pathname === '/api/data.json') {
    const source = resolve(PUBLIC_DIR, 'data', pathname.slice('/api/'.length))
    if (!existsSync(source)) {
      sendJson(res, 404, { ok: false, error: 'not_found', path: pathname }, cors(req))
      return
    }
    serveFile(req, res, source)
    return
  }

  if (pathname.startsWith('/data/')) {
    const file = safeJoin(PUBLIC_DIR, pathname)
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      sendJson(res, 404, { ok: false, error: 'not_found', path: pathname }, cors(req))
      return
    }
    serveFile(req, res, file)
    return
  }

  if (SERVE_DIST) {
    const file = safeJoin(DIST_DIR, pathname === '/' ? '/index.html' : pathname)
    if (file && existsSync(file) && statSync(file).isFile()) {
      serveFile(req, res, file)
      return
    }
    // SPA fallback
    const fallback = resolve(DIST_DIR, 'index.html')
    if (existsSync(fallback)) {
      serveFile(req, res, fallback)
      return
    }
  }

  sendJson(res, 404, { ok: false, error: 'not_found', path: pathname }, cors(req))
})

server.listen(PORT, HOST, () => {
  const curlHint =
    `curl -s localhost:${PORT}/api/echo \\\n` +
    `  -H "x-client-id: demo-client-0001" \\\n` +
    `  -H "x-client-timestamp: ${Date.now()}" \\\n` +
    `  -H "x-client-nonce: 0123456789abcdef"`

  process.stdout.write(
    [
      `Beer-Compass-API läuft auf http://localhost:${PORT}`,
      SERVE_DIST
        ? `  statische Dateien: ${DIST_DIR}`
        : '  (kein --serve-dist: nur API + public/data)',
      '  Endpunkte: /api/health /api/version.json /api/data.json /api/echo',
      `  Test-Request:\n${curlHint}`,
      '',
    ].join('\n'),
  )
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
