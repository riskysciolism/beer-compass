/**
 * Validates the small `version.json`. Deliberately hand written instead of zod:
 * the file has three fields and is read on the main thread, so zod stays
 * reserved exclusively for the dataset worker.
 */
import type { RemoteVersion } from '@/types/data'

export type VersionParseResult =
  { ok: true; version: RemoteVersion } | { ok: false; issues: string[] }

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function parseRemoteVersion(raw: string): VersionParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, issues: ['Die Datei ist kein gültiges JSON.'] }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, issues: ['Erwartet wurde ein JSON-Objekt.'] }
  }

  const record = parsed as Record<string, unknown>
  const issues: string[] = []

  if (!isFiniteNumber(record.version) || !Number.isInteger(record.version) || record.version < 0) {
    issues.push('version: erwartet eine nicht negative ganze Zahl')
  }
  if (record.updatedAt !== undefined && typeof record.updatedAt !== 'string') {
    issues.push('updatedAt: erwartet eine Zeichenkette')
  }
  if (record.count !== undefined && !isFiniteNumber(record.count)) {
    issues.push('count: erwartet eine Zahl')
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    version: {
      version: record.version as number,
      ...(typeof record.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
      ...(isFiniteNumber(record.count) ? { count: record.count } : {}),
    },
  }
}
