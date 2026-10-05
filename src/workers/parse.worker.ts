/**
 * Web worker: parses and validates large JSON files so that the main thread
 * (and with it the position display animation) does not get blocked.
 */
import { ZodError } from 'zod'

import { describeIssues, itemsSchema } from '@/schemas/dataset'
import type { Item } from '@/types/data'

export interface ParseRequest {
  id: number
  raw: string
  version: number
}

export type ParseResponse =
  | { id: number; ok: true; items: Item[]; count: number }
  | { id: number; ok: false; error: string; details: string[] }

function describeError(error: unknown): string {
  if (error instanceof SyntaxError) return 'invalid_json'
  return 'validation_failed'
}

/** Collects up to 10 concrete locations for a comprehensible error message. */
function collectIssues(error: unknown): string[] {
  if (error instanceof ZodError) return describeIssues(error).slice(0, 10)
  return []
}

self.addEventListener('message', (event: MessageEvent<ParseRequest>) => {
  const { id, raw, version } = event.data
  void version

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    const response: ParseResponse = {
      id,
      ok: false,
      error: 'invalid_json',
      details: ['Die Datei ist kein gültiges JSON.'],
    }
    self.postMessage(response)
    return
  }

  try {
    const items = itemsSchema.parse(parsed)
    const response: ParseResponse = { id, ok: true, items, count: items.length }
    self.postMessage(response)
  } catch (error) {
    const response: ParseResponse = {
      id,
      ok: false,
      error: describeError(error),
      details: collectIssues(error),
    }
    self.postMessage(response)
  }
})
