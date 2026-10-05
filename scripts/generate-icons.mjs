#!/usr/bin/env node
/**
 * Generates the PWA icons without external dependencies (no sharp/canvas).
 * Plain PNG writing via zlib plus custom drawing routines.
 *
 * Usage: npm run icons
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'public/icons')

/* ------------------------------------------------------------------ PNG ---- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  const steps = [0, 1, 2, 3, 4, 5, 6, 7]
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (const _step of steps) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

/** @param {{width:number,height:number,rgba:Uint8Array}} image */
function encodePng({ width, height, rgba }) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* -------------------------------------------------------------- Zeichen ---- */

const AMBER_DARK = [58, 30, 8]
const AMBER_LIGHT = [240, 176, 64]
const CREAM = [253, 246, 232]
const FOAM = [255, 252, 240]

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Drawing area in [-1, 1], y pointing down. */
function drawIcon(size, { maskable }) {
  const rgba = new Uint8Array(size * size * 4)
  const SS = 4 // Supersampling
  // For maskable icons the content must fit into the inner 80% circle.
  const contentScale = maskable ? 0.62 : 0.92
  const radius = maskable ? 1 : 0.22 // Hintergrundform

  const put = (px, py, color, alpha) => {
    if (alpha <= 0) return
    const idx = (py * size + px) * 4
    const a = Math.min(1, alpha)
    rgba[idx] = Math.round(rgba[idx] * (1 - a) + color[0] * a)
    rgba[idx + 1] = Math.round(rgba[idx + 1] * (1 - a) + color[1] * a)
    rgba[idx + 2] = Math.round(rgba[idx + 2] * (1 - a) + color[2] * a)
    rgba[idx + 3] = Math.max(rgba[idx + 3], Math.round(255 * a))
  }

  const inRoundedRect = (x, y, r) => {
    const inner = 1 - r
    if (x >= -inner && x <= inner && y >= -inner && y <= inner) return true
    const cx = Math.max(-inner, Math.min(inner, x))
    const cy = Math.max(-inner, Math.min(inner, y))
    return Math.hypot(x - cx, y - cy) <= r
  }

  const inCircle = (x, y, r) => x * x + y * y <= r * r

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let bgHits = 0
      let glassHits = 0
      let foamHits = 0
      let needleHits = 0
      let needleDark = 0

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = ((px + (sx + 0.5) / SS) / size) * 2 - 1
          const y = ((py + (sy + 0.5) / SS) / size) * 2 - 1

          if (maskable ? true : inRoundedRect(x, y, radius)) bgHits += 1

          // Glass body: trapezoid with rounded corners
          const gx = x / contentScale
          const gy = y / contentScale
          const top = -0.62
          const bottom = 0.66
          if (gy >= top && gy <= bottom) {
            const t = (gy - top) / (bottom - top)
            const halfWidth = 0.3 + t * 0.18
            if (Math.abs(gx) <= halfWidth - 0.06) {
              const foamLine = -0.34
              if (gy < foamLine) foamHits += 1
              else glassHits += 1
            }
          }

          // Compass needle as a rhombus
          const d = Math.abs(gx) + Math.abs(gy)
          if (d <= 0.66) {
            if (gy <= 0) needleHits += 1
            else needleDark += 1
          }
        }
      }

      const samples = SS * SS
      const norm = (px, py) => [((px + 0.5) / size) * 2 - 1, ((py + 0.5) / size) * 2 - 1]
      const [, ny] = norm(px, py)

      let color = null
      let alpha = 0

      if (bgHits > 0) {
        const t = (ny + 1) / 2
        color = mix(AMBER_DARK, AMBER_LIGHT, t)
        alpha = bgHits / samples
      }
      if (needleHits / samples > 0.02) {
        color = CREAM
        alpha = Math.max(alpha, needleHits / samples)
      }
      if (needleDark / samples > 0.02) {
        color = mix(CREAM, AMBER_DARK, 0.45)
        alpha = Math.max(alpha, needleDark / samples)
      }
      if (glassHits / samples > 0.02) {
        color = mix(AMBER_LIGHT, CREAM, 0.15)
        alpha = Math.max(alpha, glassHits / samples)
      }
      if (foamHits / samples > 0.02) {
        color = FOAM
        alpha = Math.max(alpha, foamHits / samples)
      }

      if (color) put(px, py, color, alpha)
      void inCircle
    }
  }

  return { width: size, height: size, rgba }
}

/* ----------------------------------------------------------------- main ---- */

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-192-maskable.png', size: 192, maskable: true },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
]

for (const target of targets) {
  const png = encodePng(drawIcon(target.size, { maskable: target.maskable }))
  writeFileSync(resolve(OUT_DIR, target.file), png)
  process.stdout.write(`icons: ${target.file} (${(png.length / 1024).toFixed(1)} kB)\n`)
}
