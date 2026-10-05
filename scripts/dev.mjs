#!/usr/bin/env node
/** Starts backend and Vite dev server together (no extra dependency). */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const children = [
  spawn(NPM, ['run', 'dev:api'], { cwd: ROOT, stdio: 'inherit' }),
  spawn(NPM, ['run', 'dev:app'], { cwd: ROOT, stdio: 'inherit' }),
]

let shuttingDown = false

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exitCode = code
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 0)
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0))
}
