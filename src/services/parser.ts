import type { ParseRequest, ParseResponse } from '@/workers/parse.worker'
import type { Item } from '@/types/data'

let worker: Worker | undefined
let requestCounter = 0

function getWorker(): Worker {
  worker ??= new Worker(new URL('../workers/parse.worker.ts', import.meta.url), {
    type: 'module',
    name: 'beer-compass-parser',
  })
  return worker
}

export class DataParseError extends Error {
  readonly code: string
  readonly details: string[]

  constructor(code: string, details: string[]) {
    super(code)
    this.name = 'DataParseError'
    this.code = code
    this.details = details
  }
}

/**
 * Parses and validates a JSON document in a web worker, so the main thread
 * stays free while loading large files. Falls back to the main thread
 * if workers are not available.
 */
export async function parseDataset(raw: string, version: number): Promise<Item[]> {
  requestCounter += 1
  const id = requestCounter

  // Fallback without worker support: validation on the main thread.
  const fallback = async (): Promise<Item[]> => {
    const { itemsSchema } = await import('@/schemas/dataset')
    return itemsSchema.parse(JSON.parse(raw))
  }

  if (typeof Worker === 'undefined') {
    return fallback()
  }

  const instance = getWorker()
  return new Promise<Item[]>((resolve, reject) => {
    const cleanup = () => {
      instance.removeEventListener('message', onMessage)
      instance.removeEventListener('error', onError)
    }
    const onMessage = (event: MessageEvent<ParseResponse>) => {
      const response = event.data
      if (response.id !== id) return
      cleanup()
      if (response.ok) {
        resolve(response.items)
        return
      }
      reject(new DataParseError(response.error, response.details))
    }
    const onError = (event: ErrorEvent) => {
      cleanup()
      reject(new DataParseError('worker_failed', [event.message]))
    }
    instance.addEventListener('message', onMessage)
    instance.addEventListener('error', onError)
    const request: ParseRequest = { id, raw, version }
    instance.postMessage(request)
  })
}

/** Terminates the worker (e.g. when freeing memory). */
export function disposeParser(): void {
  worker?.terminate()
  worker = undefined
}
