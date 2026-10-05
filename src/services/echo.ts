/**
 * Client ID and "signed" (identifiable) requests to the
 * Dummy-Echo-Endpunkt.
 *
 * The "signature" mechanism is deliberately symmetric and without a secret:
 * `sha256("beer-compass:v1|clientId|timestamp|nonce|sha256(body)")`.
 * It serves to attribute requests to a device installation and to detect
 * tampered data - not for authentication.
 */
import { echoUrl } from '@/config'
import { getDb } from '@/db/database'

const CLIENT_ID_KEY = 'clientId'
const NONCE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export interface EchoResult {
  ok: boolean
  serverTimestamp?: number
  signature?: string
  signatureVerified?: boolean
  error?: string
}

/* ------------------------------------------------------------- Client-ID -- */

function randomToken(length = 24): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) {
    out += NONCE_ALPHABET[byte % NONCE_ALPHABET.length]
  }
  return out
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Stable random ID of this installation (stored in IndexedDB). */
export async function getClientId(): Promise<string> {
  const db = await getDb()
  const row = await db.get('identity', CLIENT_ID_KEY)
  if (row?.value) return row.value

  const clientId = `bc-${randomToken(20)}`
  await db.put('identity', { key: CLIENT_ID_KEY, value: clientId })
  return clientId
}

function createNonce(): string {
  return randomToken(16)
}

export async function signRequest(params: {
  clientId: string
  timestamp: number
  nonce: string
  body: string
}): Promise<string> {
  const bodyHash = await sha256Hex(params.body)
  return sha256Hex(
    `beer-compass:v1|${params.clientId}|${params.timestamp}|${params.nonce}|${bodyHash}`,
  )
}

/* ------------------------------------------------------------------ Echo --- */

export async function sendEcho(
  payload: Record<string, unknown>,
  { timeoutMs = 5000 }: { timeoutMs?: number } = {},
): Promise<EchoResult> {
  if (!echoUrl) return { ok: false, error: 'disabled' }

  const clientId = await getClientId()
  const timestamp = Date.now()
  const nonce = createNonce()
  const body = JSON.stringify(payload)
  const signature = await signRequest({ clientId, timestamp, nonce, body })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(echoUrl, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-client-id': clientId,
        'x-client-timestamp': String(timestamp),
        'x-client-nonce': nonce,
        'x-client-signature': signature,
      },
      body,
    })
    const json = (await response.json().catch(() => ({}))) as Partial<EchoResult>
    return {
      ok: response.ok && json.ok === true,
      serverTimestamp: json.serverTimestamp,
      signature: json.signature,
      signatureVerified: json.signatureVerified,
      error: json.error,
    }
  } catch {
    return { ok: false, error: 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

/** Reports to the backend after a successful data sync, anonymized. */
export async function reportSync(meta: {
  version: number
  count: number
  checksum: string
}): Promise<EchoResult> {
  return sendEcho({
    event: 'dataset_applied',
    version: meta.version,
    count: meta.count,
    checksum: meta.checksum,
  })
}
